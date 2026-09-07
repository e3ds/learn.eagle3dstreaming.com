/* [E3DS-LEARN-NAV] Stamps the navigation tree into every page in site/.
 * ===========================================================================
 *
 * Run it after changing nav.json or adding a page:
 *
 *     node build-nav.js
 *
 * WHY A GENERATOR AND NOT A SERVER. The pages must be plain static HTML with
 * nothing assembled at request time. What a crawler downloads is then exactly
 * what is in the file, the site survives being served by nginx alone with no
 * Node in front of it, and a page cannot render differently from how it reads
 * on disk. The cost is this script: adding a page means running it once, and
 * every page picks up the new entry.
 *
 * WHAT IT TOUCHES. Only the block between the two E3DS-NAV markers. Everything
 * a person wrote sits outside them and is never read or rewritten, so this is
 * safe to run over pages that have been edited in the browser.
 *
 * The tree is written OUTSIDE .wrap, which is the element the editor makes
 * editable. Editing a page therefore cannot reach the navigation, and saving
 * cannot damage it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "site");
const BEGIN = "<!-- E3DS-NAV:BEGIN generated from nav.json by build-nav.js - do not edit by hand -->";
const END = "<!-- E3DS-NAV:END -->";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Internal review only until the rewrite lands. docs.eagle3dstreaming.com is
// still the public site, so this one must not be indexed alongside it.
// AT LAUNCH: remove this and site/robots.txt - checklist is in that file.
const NOINDEX = '<meta name="robots" content="noindex,nofollow">';

const STYLE = `<style id="e3dsNavStyle">
  /* The white areas. the html element had NO background of its own, so anywhere the
     body's background did not reach, what showed through was the browser's
     default canvas - white, in a dark page. Painting the root as well closes
     that gap for good, and min-height stops a short page leaving the lower part
     of the screen unpainted. Cheap, and it removes a whole class of bug rather
     than one instance of it. */
  html { background: var(--ground); }
  body { min-height: 100vh; background: var(--ground); }
  body { display:flex; align-items:flex-start; }
  #e3dsNav {
    flex:0 0 258px; width:258px; position:sticky; top:0; height:100vh;
    overflow-y:auto; border-right:1px solid var(--line); background:var(--surface);
  }
  .e3dsNavInner { padding:22px 14px 40px; }
  .e3dsNavHome {
    display:block; font-family:Archivo,Arial,sans-serif; font-weight:700;
    font-size:14px; line-height:1.3; margin-bottom:18px;
    text-decoration:none; color:var(--ink);
  }
  .e3dsNavSec { margin-bottom:4px; }
  .e3dsNavSec > summary {
    cursor:pointer; list-style:none; padding:6px 8px; border-radius:5px;
    font-family:Archivo,Arial,sans-serif; font-size:12px; font-weight:600;
    letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3);
  }
  .e3dsNavSec > summary::-webkit-details-marker { display:none; }
  .e3dsNavSec > summary::before {
    content:"\\25B8"; display:inline-block; width:1.1em; font-size:9px;
    transition:transform .12s;
  }
  .e3dsNavSec[open] > summary::before { transform:rotate(90deg); }
  .e3dsNavSec ul { list-style:none; margin:2px 0 8px; padding:0 0 0 18px; }
  .e3dsNavSec a {
    display:block; padding:5px 8px; border-radius:5px; font-size:15px;
    text-decoration:none; color:var(--ink-2);
  }
  .e3dsNavSec a:hover { background:var(--surface-2); color:var(--ink); }
  /* The page being read is marked with a rail as well as colour: colour alone
     is easy to lose halfway down a long tree. */
  .e3dsNavSec a.on {
    color:var(--accent); font-weight:600; background:var(--surface-2);
    box-shadow:inset 2px 0 0 var(--accent);
  }
  .e3dsNavSec li.planned {
    padding:5px 8px; font-size:15px; color:var(--ink-3); opacity:.6; font-style:italic;
  }
  /* The hand-written pages set margin:0 auto on .wrap. As a flex item that
     is not harmless centring - auto side margins absorb ALL the free width
     and split it evenly, so the column is pushed into the middle of whatever is
     left and a large gap opens between the tree and the text. Reset it, and put
     the reading column beside the tree the way the generated pages do. */
  .wrap { flex:1 1 auto; min-width:0; margin:0 !important; max-width:860px; }
  #e3dsNavToggle { display:none; }
  /* Narrower than this the tree would take most of the screen, so it becomes a
     drawer instead of a column. */
  @media (max-width:760px) {
    body { display:block; }
    #e3dsNav {
      position:fixed; left:0; top:0; z-index:9998; transform:translateX(-100%);
      transition:transform .18s; box-shadow:2px 0 18px rgba(0,0,0,.35);
    }
    body.e3dsNavOpen #e3dsNav { transform:none; }
    #e3dsNavToggle {
      display:block; position:fixed; left:12px; bottom:12px; z-index:9999;
      padding:10px 15px; border-radius:8px; border:1px solid var(--line);
      background:var(--surface); color:var(--ink);
      font:15px Archivo,Arial,sans-serif; cursor:pointer;
    }
  }
</style>`;

/* Styling for pictures added through the editor. It rides along in the stamped
 * block for the same reason the tree does: it has to be on every page, and one
 * definition stamped everywhere cannot drift the way forty hand-copies would.
 * Kept as its own element so it stays obvious that this is about content, not
 * about the navigation. */
const DOC_STYLE = `<style id="e3dsDocStyle">
  .e3dsFig { margin:32px 0; }
  /* Pictures never overflow their column, and the box holds its shape before
     the image arrives so the text below does not jump as the page loads. */
  .e3dsFig img {
    display:block; max-width:100%; height:auto;
    border:1px solid var(--line); border-radius:3px; background:var(--surface-2);
  }
  .e3dsFig figcaption {
    margin-top:9px; font-family:Archivo,Arial,sans-serif; font-size:14px;
    line-height:1.45; color:var(--ink-3);
  }
</style>`;

const TOGGLE =
  '<button id="e3dsNavToggle" aria-label="Show the contents" ' +
  'onclick="document.body.classList.toggle(\'e3dsNavOpen\')">Contents</button>';

/* Build the tree for one page. currentUrl decides which entry is marked as the
 * one being read, which is why this is per-file rather than one shared string. */
function navFor(nav, currentUrl) {
  let out = '<aside id="e3dsNav"><nav class="e3dsNavInner" aria-label="Documentation">'
    + '<a class="e3dsNavHome" href="/">Eagle 3D Streaming docs</a>';

  for (const sec of nav.sections || []) {
    /* A section opens when it holds the page being read, so a reader lands with
     * their own part of the tree already expanded. */
    const holdsCurrent = (sec.pages || []).some((p) => p.url && p.url === currentUrl);
    out += '<details class="e3dsNavSec"' + (holdsCurrent ? " open" : "")
      + "><summary>" + esc(sec.title) + "</summary><ul>";
    for (const p of sec.pages || []) {
      if (p.planned || !p.url) {
        /* Shown rather than hidden: a reader can see what is coming, and a page
         * cannot quietly never be written because nobody remembered it. */
        out += '<li class="planned">' + esc(p.title) + "</li>";
      } else {
        const on = p.url === currentUrl ? ' class="on"' : "";
        const cur = p.url === currentUrl ? ' aria-current="page"' : "";
        out += "<li><a" + on + cur + ' href="' + p.url + '">' + esc(p.title) + "</a></li>";
      }
    }
    out += "</ul></details>";
  }
  return out + "</nav></aside>";
}

function stamp(file, nav) {
  const rel = "/" + path.relative(ROOT, file).split(path.sep).join("/");
  const block = BEGIN + NOINDEX + "\n" + STYLE + "\n" + DOC_STYLE + "\n"
    + navFor(nav, rel) + "\n" + TOGGLE + "\n" + END;

  let html = fs.readFileSync(file, "utf8");
  const b = html.indexOf(BEGIN);
  const e = html.indexOf(END);

  if (b !== -1 && e !== -1) {
    /* Replace only what is between the markers. Anything written by a person
     * sits outside them and is not touched. */
    html = html.slice(0, b) + block + html.slice(e + END.length);
  } else {
    /* First time for this page: go in immediately before .wrap, so the tree is
     * a sibling of the content rather than inside the editable region. */
    const m = html.match(/<div class="wrap"/);
    if (!m) return { file: rel, status: "SKIPPED - no .wrap to anchor to" };
    html = html.slice(0, m.index) + block + "\n\n" + html.slice(m.index);
  }

  fs.writeFileSync(file, html, "utf8");
  return { file: rel, status: b !== -1 ? "updated" : "added" };
}

const nav = JSON.parse(fs.readFileSync(path.join(__dirname, "nav.json"), "utf8"));
const files = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"));

/* Every page listed in nav.json must actually exist, or the tree points readers
 * at a 404. Checked here rather than discovered by a reader. */
const missing = [];
for (const sec of nav.sections || []) {
  for (const p of sec.pages || []) {
    if (p.url && !fs.existsSync(path.join(ROOT, p.url.replace(/^\//, "")))) missing.push(p.url);
  }
}

for (const f of files) {
  const r = stamp(path.join(ROOT, f), nav);
  console.log("  " + r.status.padEnd(8) + " " + r.file);
}
if (missing.length) {
  console.log("\n  WARNING - nav.json links to pages that do not exist:");
  missing.forEach((u) => console.log("    " + u));
}
console.log("\n  " + files.length + " page(s). Re-run after changing nav.json.");
