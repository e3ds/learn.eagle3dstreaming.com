/* [E3DS-LEARN-PRUNE] Find pictures nothing points at, and optionally delete them.
 *
 * WHY THIS IS NEEDED. Pictures arrive faster than they leave. The wiki
 * migration pulled every image from the old site, most of those pages were then
 * merged away, and nothing removed their pictures. Measured 2026-09-09:
 * 1,179 of 1,400 files - 263.7 MB of 317.9 MB - were referenced by nothing at
 * all. That is 97% of the repository's size serving no page.
 *
 * WHAT COUNTS AS USED. Any mention of the filename in any text file that is not
 * generated output: content sources, hand-written pages, the template, nav.json,
 * CSS. site/wiki is deliberately NOT scanned - it is rebuilt from content/, so a
 * picture referenced only there is referenced only by a copy of something else,
 * and counting it would keep an image alive on the strength of its own stale
 * output.
 *
 * DRY RUN BY DEFAULT. It prints what it would delete and changes nothing.
 * Deleting needs --delete typed out, because the failure mode is silent and
 * permanent: a picture removed by a bad match is gone, and the page that wanted
 * it shows a broken image nobody notices for months.
 *
 *   node prune-images.js              what would go, and how much space
 *   node prune-images.js --delete     actually delete them
 *
 * Run `node build.js` first. Pruning against a stale build is how a picture
 * that a new page just started using gets deleted.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const IMAGES = path.join(ROOT, "site", "images");
const DELETE = process.argv.includes("--delete");

/* Everything that may legitimately mention a picture. site/wiki is excluded on
 * purpose - see the note above. */
const SEARCH_DIRS = [
  path.join(ROOT, "content"),
  path.join(ROOT, "migration"),
];
const SEARCH_FILES = [
  path.join(ROOT, "template.html"),
  path.join(ROOT, "nav.json"),
  path.join(ROOT, "site", "index.html"),
  path.join(ROOT, "site", "microphone-settings.html"),
  path.join(ROOT, "site", "fullscreen-button.html"),
];
const TEXT = /\.(html?|md|json|css|js|txt|xml)$/i;

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".backups") continue;
      walk(p, out);
    } else if (TEXT.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const haystack = [];
for (const d of SEARCH_DIRS) walk(d, haystack);
for (const f of SEARCH_FILES) if (fs.existsSync(f)) haystack.push(f);

/* One big string rather than a regex per file: 1,400 filenames against 1,000
 * files is 1.4 million tests otherwise, and this runs in well under a second. */
let corpus = "";
for (const f of haystack) {
  try { corpus += fs.readFileSync(f, "utf8") + "\n"; } catch (e) { }
}

let files;
try { files = fs.readdirSync(IMAGES).filter((f) => !f.startsWith(".")); }
catch (e) { console.log("no site/images directory - nothing to do"); process.exit(0); }

const orphans = [];
let totalBytes = 0, orphanBytes = 0;

for (const f of files) {
  const size = fs.statSync(path.join(IMAGES, f)).size;
  totalBytes += size;
  /* The raw name, and the URL-decoded name - the migration left %20 in some
   * filenames, and a page may reference either spelling. Missing that would
   * delete a picture that IS in use. */
  let decoded = f;
  try { decoded = decodeURIComponent(f); } catch (e) { }
  if (corpus.includes(f) || corpus.includes(decoded)) continue;
  orphans.push({ name: f, size });
  orphanBytes += size;
}

const mb = (n) => (n / 1e6).toFixed(1) + " MB";

console.log("");
console.log("  scanned          " + haystack.length + " text files for references");
console.log("  pictures on disk " + files.length + "   " + mb(totalBytes));
console.log("  referenced       " + (files.length - orphans.length));
console.log("  ORPHANED         " + orphans.length + "   " + mb(orphanBytes));

if (!orphans.length) { console.log("\n  nothing to prune.\n"); process.exit(0); }

orphans.sort((a, b) => b.size - a.size);
console.log("\n  largest orphans:");
for (const o of orphans.slice(0, 10)) {
  console.log("    " + mb(o.size).padStart(9) + "  " + o.name);
}

if (!DELETE) {
  console.log("\n  DRY RUN - nothing was deleted.");
  console.log("  Run `node build.js` first, then `node prune-images.js --delete`");
  console.log("  to remove these and reclaim " + mb(orphanBytes) + ".\n");
  process.exit(0);
}

let removed = 0;
for (const o of orphans) {
  try { fs.unlinkSync(path.join(IMAGES, o.name)); removed++; }
  catch (e) { console.log("    could not delete " + o.name + ": " + e.message); }
}
console.log("\n  deleted " + removed + " files, " + mb(orphanBytes) + " reclaimed.");
console.log("  They are still in git history - see README, 'Pictures and disk space'.\n");
