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
</style>
<div id="e3dsEditBar">
  <strong>Editing</strong>
  <span class="msg" id="e3dsEditMsg">Click any text to change it, or paste a screenshot.</span>
  <span style="flex:1"></span>
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

  function uploadImage(file) {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { msg.textContent = "Enter the password first, then add the picture."; return null; }
    msg.textContent = "Uploading " + (file.name || "image") + "\\u2026";
    return fetch("/_edit/upload", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-e3ds-password": pw,
        "x-e3ds-filename": file.name || "screenshot",
      },
      body: file,
    }).then(function (r) { return r.json(); });
  }

  /* Insert where the cursor is. execCommand is old, but it is the one call that
   * puts markup at the caret inside a contenteditable and leaves a working undo
   * behind it; the Range fallback covers browsers that have dropped it. */
  function insertAtCaret(html) {
    if (document.execCommand && document.execCommand("insertHTML", false, html)) return true;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var frag = range.createContextualFragment(html);
    range.insertNode(frag);
    return true;
  }

  function addImage(file) {
    var p = uploadImage(file);
    if (!p) return;
    p.then(function (j) {
      if (!j.ok) { msg.textContent = "Not added: " + j.error; return; }

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
      var html = caption
        ? '<figure class="e3dsFig"><img src="' + j.url + '" alt="' + esc(caption) + '">' +
          "<figcaption>" + esc(caption) + "</figcaption></figure>"
        : '<figure class="e3dsFig"><img src="' + j.url + '" alt=""></figure>';

      if (insertAtCaret(html)) {
        msg.textContent = "Added " + j.url + " - press Save to keep it.";
      } else {
        msg.textContent = "Click where you want the picture first, then add it.";
      }
    }).catch(function (e) { msg.textContent = "Not added: " + e.message; });
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
  document.getElementById("e3dsEditImg").onclick = function () { picker.click(); };
  picker.onchange = function () {
    if (picker.files && picker.files[0]) addImage(picker.files[0]);
    picker.value = "";
  };

  document.getElementById("e3dsEditSave").onclick = async function () {
    var pw = document.getElementById("e3dsEditPw").value;
    if (!pw) { msg.textContent = "Enter the password first."; return; }

    /* Take a copy of the document, strip the editing machinery out of THAT
     * rather than out of the live page, so the page keeps working while the
     * save is in flight and a failed save leaves nothing half-removed. */
    var clone = document.documentElement.cloneNode(true);
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
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
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
        return send(res, 200, JSON.stringify({ ok: true, backup: name }), "application/json");
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
    res.writeHead(200, { "Content-Type": type });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log("[E3DS-LEARN] serving " + ROOT + " on :" + PORT);
  console.log("[E3DS-LEARN] editing " + (password() ? "ENABLED" : "DISABLED (no editor-password.txt)"));
});
