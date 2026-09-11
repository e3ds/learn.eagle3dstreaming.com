/* [E3DS-LEARN-SERVER] Serves the docs, and lets them be edited in the browser.
 * ===========================================================================
 *
 * WHAT THIS IS FOR. A page here is written once and then found to be wrong in a
 * small way - a number, a sentence, a name. Asking a developer to change a word
 * is the wrong shape for that, and a git workflow is the wrong shape for a
 * typo. So: open the page with ?edit=1, change the text in place, press Save,
 * and the HTML file on disk is rewritten and served from that moment.
 *
 * NO DATABASE AND NO BUILD STEP. The file that is served IS the file that is
 * edited. Nothing to sync, nothing to rebuild, and a page cannot drift from its
 * source because there is only one of them.
 *
 * ---------------------------------------------------------------------------
 * WHAT PROTECTS IT, since this rewrites files on a public host:
 *
 *   a password        checked on SAVE, not on view. Reading is public - it is
 *                     documentation - and only writing is gated.
 *   path confinement  the target is resolved and must sit inside site/. A path
 *                     like ../../cirrus.js resolves outside and is refused, so
 *                     this cannot be walked out of.
 *   .html only        the one thing it is for. Nothing else is writable.
 *   a backup first    every save copies the current file into .backups/ with a
 *                     timestamp before overwriting. A bad edit is always one
 *                     file copy away from being undone.
 *   a size cap        so a runaway paste cannot fill the disk.
 *
 * The password lives in editor-password.txt beside this file, which is
 * gitignored. Absent, saving is DISABLED rather than open - a missing secret
 * must never mean "no security required".
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "site");
const BACKUPS = path.join(__dirname, ".backups");
const PORT = Number(process.env.LEARN_PORT) || 6500;
const MAX_BYTES = 2 * 1024 * 1024;

const IMAGES = path.join(ROOT, "images");
const MAX_IMAGE = 8 * 1024 * 1024;

/* [E3DS-LEARN-IMAGES] Pictures are stored as FILES and referenced by URL - they
 * are never embedded in the page.
 *
 * Left alone, a browser pasting into an editable page inlines a screenshot as a
 * base64 data URI: a 400 KB picture becomes about 550 KB of text sitting inside
 * the HTML, the page can no longer be cached separately from its pictures, and
 * two or three of them pass the save limit. So a paste is intercepted, the bytes
 * are uploaded here, and only a URL goes into the page.
 *
 * The magic numbers are checked as well as the extension. An extension is just
 * the end of a filename and proves nothing about the bytes. SVG is deliberately
 * NOT accepted: it is a document rather than an image, it can carry script, and
 * it would be served from our own origin. */
const IMAGE_KINDS = [
  { ext: ".png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ".jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: ".gif", type: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { ext: ".webp", type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
];

function sniffImage(buf) {
  for (const k of IMAGE_KINDS) {
    if (k.magic.every((b, i) => buf[i] === b)) return k;
  }
  return null;
}

/* A name that is safe as a URL and safe as a path: letters, digits and dashes.
 * Whatever the browser or the operating system called the file, only this shape
 * ever reaches the disk. */
function slugName(name) {
  const raw = String(name || "");
  const base = path.basename(raw, path.extname(raw))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "image";
}

/* Never overwrite an existing picture. Two pages can easily both upload
 * something called "screenshot", and silently replacing the first would change
 * a page nobody was editing. */
function freeImagePath(slug, ext) {
  let name = slug + ext;
  for (let n = 2; fs.existsSync(path.join(IMAGES, name)); n++) name = slug + "-" + n + ext;
  return name;
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function password() {
  try {
    const p = fs.readFileSync(path.join(__dirname, "editor-password.txt"), "utf8").trim();
    return p || null;
  } catch (e) { return null; }
}

/* Resolve inside ROOT or not at all. realpath is not used because the file may
 * not exist yet; the resolved prefix check is what matters. */
/* [E3DS-LEARN-SAVE-SOURCE] Where an edit has to land so it is not thrown away.
 *
 * site/wiki/<slug>.html is BUILD OUTPUT. build.js regenerates it from
 * content/wiki/<slug>.html on every run, so writing only to the output means
 * the next build erases the edit - silently, and long enough after the fact
 * that it reads as the editor being broken rather than the build doing its job.
 *
 * So a wiki page is written in BOTH places: the output so the change is visible
 * immediately without running a build, and the source so the next build
 * reproduces it. The two cannot drift, because the source is extracted from the
 * very bytes being written to the output.
 *
 * The three hand-written pages at the site root have no separate source - the
 * file in site/ IS the source, and build.js only replaces their nav block - so
 * for those this returns null and the existing single write is correct.
 */
const CONTENT_BEGIN = "<!-- E3DS-CONTENT:BEGIN";
const CONTENT_END = "<!-- E3DS-CONTENT:END -->";

function sourceFileFor(absOutputPath) {
  const wikiDir = path.join(ROOT, "wiki") + path.sep;
  if (!absOutputPath.startsWith(wikiDir)) return null;      /* hand-written */
  const slug = path.basename(absOutputPath, ".html");
  return path.join(__dirname, "content", "wiki", slug + ".html");
}

/* The body between the markers, or null when they are absent - an older page
 * built before the markers existed, which must not be half-written. */
function contentFragmentOf(html) {
  const b = html.indexOf(CONTENT_BEGIN);
  if (b === -1) return null;
  const bEnd = html.indexOf("-->", b);
  if (bEnd === -1) return null;
  const e = html.indexOf(CONTENT_END, bEnd);
  if (e === -1) return null;
  return html.slice(bEnd + 3, e).trim() + "\n";
}

/* [E3DS-LEARN-SEO] A page's metadata lives beside its content, in
 * content/wiki/<slug>.json, and that is what the SEO panel edits.
 *
 * NOT the built page. Writing meta tags into site/wiki/<slug>.html would last
 * exactly until the next `node build.js`, which regenerates every page from the
 * source - the same trap [E3DS-LEARN-SAVE-SOURCE] already documents for body
 * text. The sidecar is the thing the build reads, so the sidecar is the thing
 * to change.
 *
 * The fields are the ones build.js understands. Anything else in the JSON -
 * title, slug, section, parents, order, source - is left exactly as it was:
 * this endpoint MERGES, it does not replace. Rewriting the file wholesale would
 * make an SEO edit capable of silently unparenting a page or moving it out of
 * its section, which is not what anybody pressing "Save SEO" is asking for.
 */
const SEO_FIELDS = [
  "seoTitle", "description", "keywords", "canonical",
  "ogTitle", "ogDescription", "ogImage", "index",
];

/* The slug comes from the browser, so it is treated as hostile: one path
 * segment, no dots, no separators. Without this, "../../editor-password" is a
 * file read and then a file write. */
function sidecarFor(slug) {
  const clean = String(slug == null ? "" : slug).trim();
  if (!clean || !/^[a-z0-9][a-z0-9-]*$/i.test(clean)) return null;
  return path.join(__dirname, "content", "wiki", clean + ".json");
}

function safePath(urlPath) {
  const clean = decodeURIComponent(String(urlPath).split("?")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

/* The editor, injected into a page only when ?edit=1 is asked for. Kept out of
 * the file itself so the saved HTML never contains the editing machinery - a
 * page that saved its own toolbar would grow one copy per save. */
const EDITOR = `
<style id="e3dsEditStyle">
  #e3dsEditBar{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;
    gap:10px;align-items:center;padding:10px 14px;background:#161c1b;color:#e8eeec;
    border-top:2px solid #5fc2bc;font:14px/1.4 system-ui,sans-serif}
  #e3dsEditBar button{font:inherit;padding:7px 14px;border-radius:6px;cursor:pointer;
    border:1px solid #3c4846;background:#1d2524;color:#e8eeec}
  #e3dsEditBar button.primary{background:#5fc2bc;color:#0f1413;border-color:#5fc2bc;font-weight:600}
  #e3dsEditBar input{font:inherit;padding:7px 9px;border-radius:6px;border:1px solid #3c4846;
    background:#0f1413;color:#e8eeec}
  #e3dsEditBar .msg{opacity:.8}
  body.e3ds-editing [contenteditable="true"]{outline:2px dashed #5fc2bc;outline-offset:4px}
  body{padding-bottom:70px}

  /* [E3DS-LEARN-SEO] */
  #e3dsSeoPanel{position:fixed;right:14px;bottom:62px;z-index:99999;width:min(440px,calc(100vw - 28px));
    max-height:min(74vh,720px);overflow:auto;background:#161c1b;color:#e8eeec;
    border:1px solid #3c4846;border-top:2px solid #5fc2bc;border-radius:8px;
    padding:14px 16px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.45)}
  #e3dsSeoPanel h3{margin:0 0 4px;font-size:14px}
  #e3dsSeoPanel .hint{opacity:.7;font-size:11.5px;margin:0 0 12px}
  #e3dsSeoPanel label{display:block;margin:11px 0 3px;font-size:11px;letter-spacing:.06em;
    text-transform:uppercase;opacity:.72}
  #e3dsSeoPanel input,#e3dsSeoPanel textarea{width:100%;box-sizing:border-box;font:inherit;
    padding:6px 8px;border-radius:5px;border:1px solid #3c4846;background:#0f1413;color:#e8eeec}
  #e3dsSeoPanel textarea{resize:vertical;min-height:58px}
  #e3dsSeoPanel .sub{font-size:11px;opacity:.62;margin-top:3px}
  #e3dsSeoPanel .row{display:flex;gap:8px;align-items:center;margin-top:14px}
  #e3dsSeoPanel .warn{margin-top:12px;padding:8px 10px;border-radius:5px;
    background:#3a2a16;border:1px solid #6b4a1f;font-size:11.5px;line-height:1.45}
  #e3dsSeoPanel .count{float:right;opacity:.6;font-size:10.5px;text-transform:none;letter-spacing:0}
  #e3dsSeoPanel .count.over{color:#ffab70;opacity:1}
</style>
<!-- [E3DS-LEARN-SEO] Hidden until asked for. The bar is for writing; this is
     for the handful of moments when somebody is thinking about how the page
     looks in a search result or a shared link. -->
<div id="e3dsSeoPanel" hidden>
  <h3>SEO for this page</h3>
  <p class="hint">Leave a field empty and the build fills it in for you. The
    grey text in each box is what it would use.</p>

  <label>Page title <span class="count" id="e3dsSeoTitleCount"></span></label>
  <input id="e3dsSeoTitle" placeholder="">
  <div class="sub">What a search result shows as its headline. Around 60
    characters before Google trims it.</div>

  <label>Description <span class="count" id="e3dsSeoDescCount"></span></label>
  <textarea id="e3dsSeoDesc" placeholder=""></textarea>
  <div class="sub">The grey sentence under the headline. The generated one is
    the page's first sentence, which was written to be read after a heading -
    on a results page there is no heading, so this is usually worth typing.
    Around 155 characters.</div>

  <label>Keywords</label>
  <input id="e3dsSeoKeywords" placeholder="left empty - no keywords tag">
  <div class="sub">Comma separated. Google ignores this tag; some internal and
    third-party search tools still read it. Empty is a fine answer.</div>

  <label>Canonical URL</label>
  <input id="e3dsSeoCanonical" placeholder="">
  <div class="sub">Which copy of this page is the real one. It currently points
    at the old docs site, which is correct while that site is the public one.</div>

  <label>Share image (og:image)</label>
  <input id="e3dsSeoOgImage" placeholder="left empty - no picture in link previews">
  <div class="sub">Full URL of the picture shown when the link is pasted into
    Slack, LinkedIn or a message. 1200x630 works everywhere.</div>

  <label>Share title</label>
  <input id="e3dsSeoOgTitle" placeholder="">
  <label>Share description</label>
  <textarea id="e3dsSeoOgDesc" placeholder=""></textarea>
  <div class="sub">Only set these if the link preview should read differently
    from the search result. Otherwise they follow the two fields above.</div>

  <div class="row">
    <input type="checkbox" id="e3dsSeoIndex" style="width:auto">
    <label for="e3dsSeoIndex" style="margin:0;text-transform:none;letter-spacing:0;font-size:13px;opacity:1">
      Let search engines index this page
    </label>
  </div>
  <div class="warn">
    Every page on this site is <strong>hidden from search engines</strong> while
    the rewrite is in progress - see <code>site/robots.txt</code>. Ticking this
    publishes <em>this one page</em> to Google. It does not remove the site-wide
    block in <code>robots.txt</code>, which would still have to be dealt with at
    launch.
  </div>

  <div class="row">
    <button class="primary" id="e3dsSeoSave">Save SEO</button>
    <button id="e3dsSeoClose">Close</button>
    <span class="msg" id="e3dsSeoMsg" style="flex:1;opacity:.8"></span>
  </div>
</div>

<div id="e3dsEditBar">
  <strong>Editing</strong>
  <span class="msg" id="e3dsEditMsg">Click any text to change it, or paste a screenshot.</span>
  <span style="flex:1"></span>
  <button id="e3dsEditSeo" title="Title, description and link-preview settings for this page">SEO</button>
  <button id="e3dsEditImg" title="Or just paste a screenshot into the page">Add picture</button>
  <input id="e3dsEditFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
  <input id="e3dsEditPw" type="password" placeholder="password" autocomplete="current-password">
  <button class="primary" id="e3dsEditSave">Save</button>
  <button id="e3dsEditCancel">Stop editing</button>
</div>
<script>
(function () {
  var bar = document.getElementById("e3dsEditBar");
  var msg = document.getElementById("e3dsEditMsg");
  var target = document.querySelector(".wrap") || document.body;
  target.setAttribute("contenteditable", "true");
  document.body.classList.add("e3ds-editing");

  document.getElementById("e3dsEditCancel").onclick = function () {
    location.href = location.pathname;
  };

  /* ---- SEO ------------------------------------------------------------
   *
   * [E3DS-LEARN-SEO] Edits content/wiki/<slug>.json, not the page in front of
   * you. The page is regenerated from that file by the build, so a meta tag
   * written into the HTML here would survive until the next build and no
   * longer - the same trap the body text already documents.
   *
   * The PLACEHOLDERS are read out of the live page's own head. That is the
   * honest way round: an empty box with the generated value greyed behind it
   * says "nothing is set, and this is what you get" - whereas pre-filling the
   * box with the generated text would make the first Save freeze it, quietly
   * detaching the description from a body that is still being edited.
   */
  var seoPanel = document.getElementById("e3dsSeoPanel");
  var seoMsg = document.getElementById("e3dsSeoMsg");
  var slug = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");

  function seoField(id) { return document.getElementById(id); }
  function metaOf(sel, attr) {
    var el = document.querySelector(sel);
    return el ? (el.getAttribute(attr || "content") || "") : "";
  }

  /* Counts, so "around 60 characters" is something you can see rather than
   * something you have to judge. Over the limit is flagged, never blocked -
   * a longer title is sometimes the right call. */
  function wire(inputId, countId, limit) {
    var el = seoField(inputId), out = seoField(countId);
    if (!el || !out) return;
    function upd() {
      var n = (el.value || el.placeholder || "").length;
      out.textContent = n + " / " + limit;
      out.className = "count" + (n > limit ? " over" : "");
    }
    el.addEventListener("input", upd);
    upd();
  }

  function seoShow(values) {
    seoField("e3dsSeoTitle").placeholder = document.title || "";
    seoField("e3dsSeoDesc").placeholder = metaOf('meta[name="description"]');
    seoField("e3dsSeoCanonical").placeholder = metaOf('link[rel="canonical"]', "href");
    seoField("e3dsSeoOgTitle").placeholder = metaOf('meta[property="og:title"]');
    seoField("e3dsSeoOgDesc").placeholder = metaOf('meta[property="og:description"]');

    seoField("e3dsSeoTitle").value = values.seoTitle || "";
    seoField("e3dsSeoDesc").value = values.description || "";
    seoField("e3dsSeoKeywords").value = values.keywords || "";
    seoField("e3dsSeoCanonical").value = values.canonical || "";
    seoField("e3dsSeoOgImage").value = values.ogImage || "";
    seoField("e3dsSeoOgTitle").value = values.ogTitle || "";
    seoField("e3dsSeoOgDesc").value = values.ogDescription || "";
    seoField("e3dsSeoIndex").checked = values.index === true;

    wire("e3dsSeoTitle", "e3dsSeoTitleCount", 60);
    wire("e3dsSeoDesc", "e3dsSeoDescCount", 155);
  }

  document.getElementById("e3dsEditSeo").onclick = async function () {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { msg.textContent = "Type the password first, then press SEO."; return; }
    seoMsg.textContent = "Loading...";
    seoPanel.hidden = false;
    try {
      var r = await fetch("/_edit/seo/get", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw, slug: slug })
      });
      var d = await r.json();
      if (!d.ok) { seoMsg.textContent = d.error || "Could not load."; return; }
      seoShow(d.seo || {});
      seoMsg.textContent = "";
    } catch (e) { seoMsg.textContent = "Could not load: " + e.message; }
  };

  document.getElementById("e3dsSeoClose").onclick = function () { seoPanel.hidden = true; };

  document.getElementById("e3dsSeoSave").onclick = async function () {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { seoMsg.textContent = "Password?"; return; }
    seoMsg.textContent = "Saving...";
    try {
      var r = await fetch("/_edit/seo/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: pw, slug: slug,
          seo: {
            seoTitle: seoField("e3dsSeoTitle").value,
            description: seoField("e3dsSeoDesc").value,
            keywords: seoField("e3dsSeoKeywords").value,
            canonical: seoField("e3dsSeoCanonical").value,
            ogImage: seoField("e3dsSeoOgImage").value,
            ogTitle: seoField("e3dsSeoOgTitle").value,
            ogDescription: seoField("e3dsSeoOgDesc").value,
            index: seoField("e3dsSeoIndex").checked
          }
        })
      });
      var d = await r.json();
      seoMsg.textContent = d.ok ? (d.note || "Saved.") : (d.error || "Save failed.");
    } catch (e) { seoMsg.textContent = "Save failed: " + e.message; }
  };

  /* ---- Pictures -------------------------------------------------------
   *
   * Two ways in, because they suit different moments: PASTE a screenshot
   * straight from the clipboard, which is what you have just after pressing
   * PrintScreen, or pick a file that is already saved.
   *
   * Both take the same route: upload the bytes, get back a URL, put the URL in
   * the page. What must NOT happen is the browser's own behaviour - dropping a
   * base64 copy of the picture inside the HTML - so the paste is intercepted
   * before the browser can act on it. */

  /* The immediate per-picture upload that used to live here is gone - see
   * [E3DS-LEARN-DEFER-UPLOAD] below. Uploading is now done once, at Save, by
   * uploadPendingImages(), and only for pictures still present in the page.
   * Leaving a second upload path here would be an easy way to reintroduce the
   * orphan problem without noticing. */

  /* [E3DS-LEARN-CARET] Remember where the cursor was, because pressing a button
   * destroys it.
   *
   * THE BUG THIS FIXES. "Add picture" opens a file dialog. Clicking the button
   * moves focus to the button, and opening the dialog takes it out of the page
   * entirely - so by the time the upload finishes there is no caret inside the
   * editable region any more. The picture uploaded correctly and then had
   * nowhere to go, so nothing appeared and it read as a broken button.
   *
   * Pasting never hit this: the caret is still exactly where you left it, which
   * is why one route worked and the other did not.
   *
   * So the caret is recorded as it moves, and restored before inserting. */
  var savedRange = null;

  function rememberCaret() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    /* Only a caret inside the editable region is worth keeping - a selection in
     * the toolbar or the navigation is not a place a picture can go. */
    if (target.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
  }

  target.addEventListener("mouseup", rememberCaret);
  target.addEventListener("keyup", rememberCaret);

  /* Insert where the cursor is. execCommand is old, but it is the one call that
   * puts markup at the caret inside a contenteditable and leaves a working undo
   * behind it; the Range fallback covers browsers that have dropped it. */
  function insertAtCaret(html) {
    /* Put the caret back first, or execCommand has nothing to act on. */
    if (savedRange) {
      var sel0 = window.getSelection();
      if (sel0) { sel0.removeAllRanges(); sel0.addRange(savedRange); }
      if (target.focus) target.focus();
    }

    if (document.execCommand && document.execCommand("insertHTML", false, html)) return true;

    var sel = window.getSelection();
    var range = (sel && sel.rangeCount) ? sel.getRangeAt(0) : null;
    if (range && target.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(range.createContextualFragment(html));
      return true;
    }

    /* Never lose a picture that has already been uploaded. If the caret cannot
     * be recovered at all - a page nobody has clicked into yet - put it at the
     * end rather than reporting a failure and leaving an orphaned file on the
     * server with no way to reach it. */
    target.appendChild(document.createRange().createContextualFragment(html));
    return "appended";
  }

  /* [E3DS-LEARN-DEFER-UPLOAD] Nothing reaches the disk until Save.
   *
   * Uploading the moment a picture is chosen meant every abandoned attempt left
   * a file behind for ever: add ten screenshots, delete nine, change your mind
   * and close the tab, and all ten are still on the server with nothing
   * pointing at them. There is no reference counting and no cleanup, so the
   * folder only ever grows.
   *
   * So a picture now goes into the page as a blob: URL, which exists only in
   * this tab's memory, and the File is held here against that URL. Save uploads
   * exactly the ones still present in the page, and swaps the blob: URLs for
   * real ones. Delete a picture before saving and its bytes never left the
   * browser.
   *
   * THE ONE THING THAT MUST NOT HAPPEN: a blob: URL reaching the saved HTML. It
   * is meaningless outside this tab, so the picture would be permanently broken
   * and the file would not exist to restore. uploadPendingImages() therefore
   * fails the whole save rather than letting one through - see its guard. */
  var pending = {};    /* blob: URL -> File, for pictures not yet uploaded */

  function addImage(file) {
    if (!file) return;

    /* One question, used twice. The caption is what a reader sees and the alt
     * text is what a search engine and a screen reader get - asking twice for
     * the same sentence would just teach people to skip it. */
    var caption = window.prompt(
      "Describe this picture in a few words.\\n\\n" +
      "It appears under the image, and is also what search engines and screen " +
      "readers read. Leave it empty for a picture that carries no meaning.", "") || "";

    var esc = function (t) {
      return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    };

    var tempUrl = URL.createObjectURL(file);
    pending[tempUrl] = file;

    var html = caption
      ? '<figure class="e3dsFig"><img src="' + tempUrl + '" alt="' + esc(caption) + '">' +
        "<figcaption>" + esc(caption) + "</figcaption></figure>"
      : '<figure class="e3dsFig"><img src="' + tempUrl + '" alt=""></figure>';

    var where = insertAtCaret(html);
    if (where === "appended") {
      /* Says where it went. Silently putting it somewhere other than asked is
       * how a picture gets lost at the bottom of a long page. */
      msg.textContent = "Added at the end of the page - click where you want it "
        + "next time. Nothing is uploaded until you press Save.";
      var added = target.querySelector('img[src="' + tempUrl + '"]');
      if (added && added.scrollIntoView) added.scrollIntoView({ block: "center" });
    } else if (where) {
      msg.textContent = "Added - nothing is uploaded until you press Save.";
    } else {
      /* It could not be placed, so it is not in the page and must not be kept
       * against a save. Released here rather than left to leak. */
      delete pending[tempUrl];
      URL.revokeObjectURL(tempUrl);
      msg.textContent = "Could not place the picture. Click where you want it, then try again.";
    }
  }

  /* [E3DS-LEARN-DEFER-UPLOAD] Upload only what is still in the page, then swap
   * each blob: URL for the real one. Returns a promise that REJECTS if anything
   * fails, so the caller abandons the save rather than writing a page whose
   * pictures point at this tab's memory. */
  function uploadPendingImages(pw) {
    var imgs = [].slice.call(target.querySelectorAll('img[src^="blob:"]'));
    if (!imgs.length) return Promise.resolve(0);

    msg.textContent = "Uploading " + imgs.length + " picture"
      + (imgs.length === 1 ? "" : "s") + "\\u2026";

    return imgs.reduce(function (chain, img) {
      return chain.then(function (done) {
        var file = pending[img.src];
        if (!file) {
          /* In the page but not in this tab's map - it cannot be uploaded and
           * must not be saved as a blob: URL. */
          throw new Error("a picture could not be matched to its file - "
            + "reload the page and add it again");
        }
        return fetch("/_edit/upload", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-e3ds-password": pw,
            "x-e3ds-filename": file.name || "screenshot",
          },
          body: file,
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || "upload failed");
          var old = img.src;
          img.src = j.url;
          delete pending[old];
          URL.revokeObjectURL(old);
          return done + 1;
        });
      });
    }, Promise.resolve(0));
  }

  target.addEventListener("paste", function (e) {
    var items = (e.clipboardData || {}).items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && items[i].type.indexOf("image/") === 0) {
        e.preventDefault();
        addImage(items[i].getAsFile());
        return;
      }
    }
  });

  var picker = document.getElementById("e3dsEditFile");
  var imgBtn = document.getElementById("e3dsEditImg");

  /* [E3DS-LEARN-CARET] mousedown, not click. It fires BEFORE focus leaves the
   * page, which is the last moment the caret still exists - by the time click
   * runs, the button already has focus and the selection is gone. */
  imgBtn.addEventListener("mousedown", rememberCaret);
  imgBtn.onclick = function () { picker.click(); };
  picker.onchange = function () {
    if (picker.files && picker.files[0]) addImage(picker.files[0]);
    picker.value = "";
  };

  document.getElementById("e3dsEditSave").onclick = async function () {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { msg.textContent = "Enter the password first."; return; }

    /* [E3DS-LEARN-DEFER-UPLOAD] Pictures go up now, not when they were chosen,
     * and only the ones still in the page. Anything added and then deleted
     * never leaves the browser. */
    try {
      var n = await uploadPendingImages(pw);
      if (n) msg.textContent = "Uploaded " + n + " picture"
        + (n === 1 ? "" : "s") + ", saving\\u2026";
    } catch (e) {
      msg.textContent = "Not saved - " + e.message;
      return;
    }

    /* Take a copy of the document, strip the editing machinery out of THAT
     * rather than out of the live page, so the page keeps working while the
     * save is in flight and a failed save leaves nothing half-removed. */
    var clone = document.documentElement.cloneNode(true);

    /* A blob: URL is meaningless outside this tab. If one survived the upload
     * step, saving would publish a permanently broken picture whose file does
     * not exist anywhere - worse than refusing. */
    if (clone.querySelector('img[src^="blob:"]')) {
      msg.textContent = "Not saved - a picture did not upload. Nothing has been changed.";
      return;
    }
    /* Only the editing machinery is stripped. The navigation is part of the
     * page on disk and must survive a save - it is not stripped, and it sits
     * outside .wrap so editing cannot reach it either. */
    ["e3dsEditBar", "e3dsEditStyle"].forEach(function (id) {
      var n = clone.querySelector("#" + id); if (n) n.remove();
    });
    clone.querySelectorAll("script").forEach(function (n) {
      if ((n.textContent || "").indexOf("e3dsEditSave") !== -1) n.remove();
    });
    var t = clone.querySelector(".wrap") || clone.querySelector("body");
    if (t) t.removeAttribute("contenteditable");
    var b = clone.querySelector("body");
    if (b) b.classList.remove("e3ds-editing");

    msg.textContent = "Saving\\u2026";
    try {
      var r = await fetch("/_edit/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: location.pathname,
          html: "<!doctype html>\\n" + clone.outerHTML,
          password: pw,
        }),
      });
      var j = await r.json();
      msg.textContent = j.ok
        ? "Saved. Previous version kept as " + j.backup
        : "Not saved: " + j.error;
    } catch (e) {
      msg.textContent = "Not saved: " + e.message;
    }
  };
})();
</script>
`;

function send(res, code, body, type) {
  /* [E3DS-LEARN-CACHE] no-store rather than no-cache here: this path carries
   * the editor-injected HTML and error pages, which are assembled per request
   * and must never be reused for anyone. */
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  /* Upload one picture. The bytes are the whole request body and the filename
   * and password ride in headers - there is no multipart parsing here, because
   * a hand-rolled multipart parser is a lot of fragile code to accept one file. */
  if (req.method === "POST" && req.url === "/_edit/upload") {
    const chunks = [];
    let size = 0;
    let tooBig = false;

    req.on("data", (d) => {
      size += d.length;
      if (size <= MAX_IMAGE) { chunks.push(d); return; }

      /* Over the cap. Killing the socket here would be tidier for us and
       * useless for whoever is uploading: the connection dies mid-send, the
       * browser reports a network failure, and nobody learns the picture was
       * simply too big. So answer FIRST, then keep draining so the browser can
       * finish sending and actually read the answer. */
      if (!tooBig) {
        tooBig = true;
        chunks.length = 0;
        send(res, 413, JSON.stringify({ ok: false,
          error: "that image is over 8 MB - crop it or save it smaller" }), "application/json");
      }
      /* Draining is a courtesy, not an obligation. Past a few times the cap it
       * is no longer a mis-sized screenshot, and we stop reading. */
      if (size > MAX_IMAGE * 4) req.destroy();
    });

    req.on("end", () => {
      if (tooBig) return;

      const pw = password();
      if (!pw) {
        return send(res, 503, JSON.stringify({ ok: false,
          error: "uploading is disabled - no editor-password.txt on the server" }), "application/json");
      }
      if (String(req.headers["x-e3ds-password"] || "") !== pw) {
        return send(res, 403, JSON.stringify({ ok: false, error: "wrong password" }), "application/json");
      }

      const buf = Buffer.concat(chunks);
      if (!buf.length) {
        return send(res, 400, JSON.stringify({ ok: false, error: "no file received" }), "application/json");
      }

      const kind = sniffImage(buf);
      if (!kind) {
        return send(res, 400, JSON.stringify({ ok: false,
          error: "not a PNG, JPEG, GIF or WebP image" }), "application/json");
      }

      try {
        fs.mkdirSync(IMAGES, { recursive: true });
        const name = freeImagePath(slugName(req.headers["x-e3ds-filename"]), kind.ext);
        fs.writeFileSync(path.join(IMAGES, name), buf);
        return send(res, 200, JSON.stringify({ ok: true, url: "/images/" + name }), "application/json");
      } catch (e) {
        return send(res, 500, JSON.stringify({ ok: false, error: String(e.message) }), "application/json");
      }
    });

    return;
  }

  /* [E3DS-LEARN-SEO] Read and write one page's SEO fields. */
  if (req.method === "POST"
      && (req.url === "/_edit/seo/get" || req.url === "/_edit/seo/save")) {
    const saving = req.url === "/_edit/seo/save";
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > MAX_BYTES) { req.destroy(); }
    });
    req.on("end", () => {
      let o;
      try { o = JSON.parse(body); }
      catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad JSON" }), "application/json"); }

      const pw = password();
      if (!pw) {
        return send(res, 503, JSON.stringify({ ok: false,
          error: "editing is disabled - no editor-password.txt on the server" }), "application/json");
      }
      /* The password is required to READ as well as to write. The values are
       * not secret in themselves - most of them are visible in the page's own
       * head - but `index` and an unpublished canonical say what is planned
       * rather than what is shipped, and this endpoint is on a site that is
       * deliberately not public yet. */
      if (String(o.password || "") !== pw) {
        return send(res, 403, JSON.stringify({ ok: false, error: "wrong password" }), "application/json");
      }

      const file = sidecarFor(o.slug);
      if (!file) {
        return send(res, 400, JSON.stringify({ ok: false,
          error: "that page name does not look like a wiki slug" }), "application/json");
      }
      if (!fs.existsSync(file)) {
        return send(res, 404, JSON.stringify({ ok: false,
          error: "no content/wiki/" + path.basename(file) + " - only wiki pages "
            + "built from a source fragment have SEO fields to edit" }), "application/json");
      }

      let meta;
      try { meta = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch (e) {
        return send(res, 500, JSON.stringify({ ok: false,
          error: "could not read " + path.basename(file) + ": " + e.message }), "application/json");
      }

      if (!saving) {
        const out = {};
        /* Absent stays absent rather than becoming "". The panel shows the
         * generated fallback as a placeholder when a field is empty, and it can
         * only tell "nothing set, using the generated one" from "deliberately
         * blank" if this does not invent a value. */
        for (const k of SEO_FIELDS) if (meta[k] !== undefined) out[k] = meta[k];
        return send(res, 200, JSON.stringify({ ok: true, slug: o.slug, seo: out }), "application/json");
      }

      const incoming = (o.seo && typeof o.seo === "object") ? o.seo : {};
      for (const k of SEO_FIELDS) {
        if (!(k in incoming)) continue;
        if (k === "index") {
          /* Only ever true or absent. Storing `false` would look like a
           * decision that had been made, when it is the default for every page
           * on this site. */
          if (incoming.index === true) meta.index = true;
          else delete meta.index;
          continue;
        }
        const v = String(incoming[k] == null ? "" : incoming[k]).trim();
        /* An emptied field is REMOVED, not stored as "". That is what puts a
         * page back on the generated description instead of pinning it to an
         * empty string - which would ship <meta name="description" content="">
         * and is worse than having no tag at all. */
        if (v) meta[k] = v; else delete meta[k];
      }

      try {
        fs.mkdirSync(BACKUPS, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.copyFileSync(file, path.join(BACKUPS,
          "meta." + path.basename(file, ".json") + "." + stamp + ".json"));
        fs.writeFileSync(file, JSON.stringify(meta, null, 1) + "\n", "utf8");
      } catch (e) {
        return send(res, 500, JSON.stringify({ ok: false, error: String(e.message) }), "application/json");
      }

      /* Said plainly, because it is the one thing that surprises people: the
       * sidecar is saved, and the PAGE does not change until the build runs. */
      return send(res, 200, JSON.stringify({ ok: true,
        saved: path.relative(__dirname, file),
        note: "Saved. Run node build.js to rebuild the page with it." }), "application/json");
    });
    return;
  }

  if (req.method === "POST" && req.url === "/_edit/save") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > MAX_BYTES) { req.destroy(); }
    });
    req.on("end", () => {
      let o;
      try { o = JSON.parse(body); }
      catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad JSON" }), "application/json"); }

      const pw = password();
      if (!pw) {
        return send(res, 503, JSON.stringify({ ok: false,
          error: "editing is disabled - no editor-password.txt on the server" }), "application/json");
      }
      if (String(o.password || "") !== pw) {
        return send(res, 403, JSON.stringify({ ok: false, error: "wrong password" }), "application/json");
      }

      const abs = safePath(o.path || "");
      if (!abs || path.extname(abs).toLowerCase() !== ".html") {
        return send(res, 400, JSON.stringify({ ok: false, error: "only .html inside site/" }), "application/json");
      }
      if (typeof o.html !== "string" || o.html.length < 50) {
        return send(res, 400, JSON.stringify({ ok: false, error: "that does not look like a page" }), "application/json");
      }

      try {
        fs.mkdirSync(BACKUPS, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const name = path.basename(abs, ".html") + "." + stamp + ".html";
        if (fs.existsSync(abs)) fs.copyFileSync(abs, path.join(BACKUPS, name));
        fs.writeFileSync(abs, o.html, "utf8");

        /* [E3DS-LEARN-SAVE-SOURCE] And back to the source, or the next build
         * undoes what was just saved. */
        let savedSource = null;
        const srcFile = sourceFileFor(abs);
        if (srcFile) {
          const fragment = contentFragmentOf(o.html);
          if (fragment === null) {
            /* Refusing is the safe answer: the output is already written and
             * correct, and writing a guess into the source would corrupt the
             * page on the next build. Says so plainly rather than reporting a
             * clean save. */
            return send(res, 200, JSON.stringify({ ok: true, backup: name,
              warning: "Saved to the page, but its content markers are missing, "
                + "so the source could not be updated - run node build.js once "
                + "to regenerate this page with markers, then edit again." }),
              "application/json");
          }
          if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(BACKUPS,
              "content." + path.basename(srcFile, ".html") + "." + stamp + ".html"));
          }
          fs.mkdirSync(path.dirname(srcFile), { recursive: true });
          fs.writeFileSync(srcFile, fragment, "utf8");
          savedSource = path.relative(__dirname, srcFile);
        }

        return send(res, 200, JSON.stringify({ ok: true, backup: name,
          source: savedSource }), "application/json");
      } catch (e) {
        return send(res, 500, JSON.stringify({ ok: false, error: String(e.message) }), "application/json");
      }
    });
    return;
  }

  const abs = safePath(req.url);
  if (!abs) return send(res, 403, "outside the site directory");

  /* Resolve a URL to a file. Extensionless paths are tried with .html so the
   * wiki's own URLs keep working unchanged - /wiki/getting-started must land on
   * the same page it always did, or every existing link, bookmark and search
   * result breaks the day we switch over. This is file lookup, not rendering:
   * the bytes still come straight off disk. If nginx ever serves site/ directly
   * it needs the matching `try_files $uri $uri.html $uri/index.html`. */
  let file = abs;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch (e) {
    if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
    else return send(res, 404, "not found");
  }

  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "not found");
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";
    /* Pages are served exactly as they sit on disk - nothing is assembled per
     * request. The navigation is stamped into the files by build-nav.js, so the
     * markup a crawler sees is the markup in the file, and the site would still
     * be correct served by nginx alone. The editor is the one exception, and
     * only when it is explicitly asked for. */
    if (ext === ".html" && /(\?|&)edit=1(&|$)/.test(req.url)) {
      let html = buf.toString("utf8");
      html = html.includes("</body>") ? html.replace("</body>", EDITOR + "</body>") : html + EDITOR;
      return send(res, 200, html, type);
    }
    /* [E3DS-LEARN-CACHE] Revalidated on every request; body re-sent only when
     * the bytes actually changed. */
    e3dsSendCached(req, res, buf, type);
  });
});

/* [E3DS-LEARN-CACHE] Never serve a stale page, and never re-send an unchanged one.
 *
 * WHAT WAS WRONG. Responses carried no cache headers at all - no Cache-Control,
 * no ETag, no Last-Modified. A browser given no instructions does not skip
 * caching; it applies HEURISTIC caching and keeps the response for as long as
 * it likes. So an edit here reached anyone in a fresh incognito window and did
 * not reach a returning visitor, possibly for days. Reported 2026-09-09: normal
 * Chrome showed a broken half-rendered page while incognito was perfect.
 *
 * The stakes are higher than one page looking wrong. Documentation that
 * silently serves an old version to the people who read it most is worse than
 * documentation that is merely out of date, because nobody can tell which they
 * are looking at.
 *
 * WHY no-cache AND NOT no-store. They sound similar and behave completely
 * differently:
 *
 *   no-store   never keep it. Every visit re-downloads every byte. Correct,
 *              and needlessly slow for a docs site.
 *   no-cache   keep it, but ALWAYS ask before using it. With an ETag the ask
 *              costs one round trip and a 304 with no body.
 *
 * So the site stays fast for repeat visitors and cannot go stale. A returning
 * reader gets 304s for everything unchanged and the new bytes for anything
 * edited, on the first load, with no hard refresh.
 *
 * WHY NOT max-age ON ASSETS. The usual optimisation is a long max-age for
 * static files, but that is only safe when their NAMES change with their
 * contents. Nothing here is content-hashed - images are plain names under
 * assets/images - so a cached image would outlive its replacement exactly the
 * way the HTML did. If asset hashing is added later, those files can take
 * `immutable, max-age=31536000` and this comment is the reason it would then
 * be safe.
 *
 * The ETag is a strong hash of the exact bytes sent, so it changes when a file
 * changes and only then.
 */
function e3dsEtagFor(buf) {
  return '"' + require("crypto").createHash("sha1").update(buf).digest("base64") + '"';
}

/* Returns true when it has already answered with a 304. */
function e3dsSendCached(req, res, buf, type) {
  const etag = e3dsEtagFor(buf);

  /* Revalidation. The browser sends back the ETag it holds; if it still
   * matches, the body is not sent again. */
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { "ETag": etag, "Cache-Control": "no-cache" });
    res.end();
    return true;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "ETag": etag,
    "Cache-Control": "no-cache",
  });
  res.end(buf);
  return false;
}

server.listen(PORT, () => {
  console.log("[E3DS-LEARN] serving " + ROOT + " on :" + PORT);
  console.log("[E3DS-LEARN] editing " + (password() ? "ENABLED" : "DISABLED (no editor-password.txt)"));
});
