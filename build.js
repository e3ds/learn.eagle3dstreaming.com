/* [E3DS-LEARN-BUILD] content fragments + template -> the served site.
 * ===========================================================================
 *
 *     node build.js
 *
 * Run it after editing a fragment, the template, or adding a page.
 *
 * WHAT GOES IN
 *   template.html            the page shell - design lives here, once
 *   content/wiki/<slug>.html the article, and nothing else
 *   content/wiki/<slug>.json its title and where it sits in the tree
 *
 * WHAT COMES OUT
 *   site/wiki/<slug>.html    a complete, static page
 *
 * WHY THE CONTENT AND THE SHELL ARE SEPARATE. 300 pages have to look like one
 * product. If each page carried its own copy of the header, styles and
 * navigation, then changing the design would mean editing 300 files and the
 * ones that got missed would be invisible until a customer found them. Here the
 * design exists once and every page is regenerated from it.
 *
 * NOTHING IS ASSEMBLED AT REQUEST TIME. The output is plain static HTML, which
 * is what a search engine and an AI crawler download, and what nginx could
 * serve on its own with no Node running. See CLAUDE.md section 5.
 *
 * THE TREE is derived from the pages themselves - each fragment's .json states
 * its ancestors, so the navigation cannot drift from what exists. There is no
 * hand-maintained list of pages to forget to update.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content", "wiki");
const OUT = path.join(ROOT, "site", "wiki");

/* One place to change if the pictures ever move to a CDN or a bucket. The
 * fragments store "/images/x.png", which is correct as-is; this only rewrites
 * them if we ever point somewhere else. */
const IMAGE_BASE = "/images/";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function readPages() {
  if (!fs.existsSync(CONTENT)) return [];
  return fs.readdirSync(CONTENT)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const meta = JSON.parse(fs.readFileSync(path.join(CONTENT, f), "utf8"));
      const html = path.join(CONTENT, f.replace(/\.json$/, ".html"));
      meta.body = fs.existsSync(html) ? fs.readFileSync(html, "utf8") : "";
      return meta;
    });
}

/* Ancestors are stored as slugs. A page whose parent has not been migrated yet
 * still has to appear somewhere, so an unknown ancestor becomes a section of
 * its own rather than making the page vanish from the tree. */
function buildTree(pages) {
  const bySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));
  const kids = {};
  const roots = [];
  for (const p of pages) {
    const parent = (p.parents || []).filter((s) => bySlug[s]).pop();
    if (parent) (kids[parent] = kids[parent] || []).push(p);
    else roots.push(p);
  }
  for (const k in kids) kids[k].sort((a, b) => a.title.localeCompare(b.title));
  roots.sort((a, b) => a.title.localeCompare(b.title));
  return { kids, roots, bySlug };
}

function navHtml(tree, current) {
  const { kids, roots } = tree;

  /* A branch is open when the page being read is inside it, so a reader lands
   * with their own part of the tree already expanded rather than having to
   * find themselves in a collapsed list. */
  const holds = (p) => p.slug === current ||
    (kids[p.slug] || []).some((c) => holds(c));

  const node = (p, depth) => {
    const children = kids[p.slug] || [];
    const on = p.slug === current;
    const link = '<a href="/wiki/' + p.slug + '"' + (on ? ' class="on" aria-current="page"' : "")
      + ">" + esc(p.title) + "</a>";
    if (!children.length) return "<li>" + link + "</li>";
    return '<li><details class="e3dsNavSec"' + (holds(p) ? " open" : "") + "><summary>"
      + link + "</summary><ul>"
      + children.map((c) => node(c, depth + 1)).join("") + "</ul></details></li>";
  };

  return '<aside id="e3dsNav"><nav class="e3dsNavInner" aria-label="Documentation">'
    + '<a class="e3dsNavHome" href="/">Eagle 3D Streaming docs</a>'
    + "<ul class=\"e3dsNavRoot\">" + roots.map((r) => node(r, 0)).join("") + "</ul>"
    + "</nav></aside>"
    + '<button id="e3dsNavToggle" aria-label="Show the contents" '
    + "onclick=\"document.body.classList.toggle('e3dsNavOpen')\">Contents</button>";
}

function crumbsHtml(p, bySlug) {
  const chain = (p.parents || []).filter((s) => bySlug[s]);
  if (!chain.length) return "";
  return '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Docs</a>'
    + chain.map((s) => '<span>/</span><a href="/wiki/' + s + '">'
      + esc(bySlug[s].title) + "</a>").join("")
    + "</nav>";
}

/* Confluence generated these lists inside the page. Regenerating them from our
 * own tree keeps them correct: a page added later appears here without anyone
 * remembering to edit its parent. */
function childrenHtml(p, kids) {
  const children = kids[p.slug] || [];
  if (!children.length) return "";
  return '<h2 class="children-head">In this section</h2><ul class="children">'
    + children.map((c) => '<li><a href="/wiki/' + c.slug + '">' + esc(c.title) + "</a></li>").join("")
    + "</ul>";
}

/* The first real sentence of the page, for the meta description that search
 * results and link previews show. Taken from the content so it cannot describe
 * a page that has since been rewritten. */
function describe(body, title) {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const cut = text.slice(0, 300);
  const stop = cut.lastIndexOf(". ");
  const out = (stop > 80 ? cut.slice(0, stop + 1) : cut.slice(0, 155)).trim();
  return esc(out || title);
}

function main() {
  /* The template's own comment documents its placeholders by name, so it must
   * be removed BEFORE substitution - otherwise the comment lists {{nav}} and
   * {{content}}, and every page ships a second hidden copy of both inside it.
   * It is build instructions, not page content, so it never belongs in output. */
  const template = fs.readFileSync(path.join(ROOT, "template.html"), "utf8")
    .replace(/^\s*<!--[\s\S]*?E3DS-LEARN-TEMPLATE[\s\S]*?-->\s*/, "");
  const pages = readPages();
  if (!pages.length) {
    console.log("  no content in content/wiki - nothing to build");
    return;
  }
  const tree = buildTree(pages);
  fs.mkdirSync(OUT, { recursive: true });

  let written = 0;
  for (const p of pages) {
    let body = p.body;
    if (IMAGE_BASE !== "/images/") body = body.split('src="/images/').join('src="' + IMAGE_BASE);

    const html = template
      .replace(/\{\{nav\}\}/g, navHtml(tree, p.slug))
      .replace(/\{\{breadcrumbs\}\}/g, crumbsHtml(p, tree.bySlug))
      .replace(/\{\{children\}\}/g, childrenHtml(p, tree.kids))
      .replace(/\{\{description\}\}/g, describe(body, p.title))
      .replace(/\{\{slug\}\}/g, p.slug)
      .replace(/\{\{title\}\}/g, esc(p.title))
      .replace(/\{\{h1\}\}/g, esc(p.title))
      .replace(/\{\{content\}\}/g, body);

    fs.writeFileSync(path.join(OUT, p.slug + ".html"), html, "utf8");
    written++;
  }

  /* An index of what exists, for the language models that look for one, and
   * cheap enough to regenerate every build rather than let it go stale. */
  const llms = ["# Eagle 3D Streaming documentation", ""]
    .concat(pages.sort((a, b) => a.slug.localeCompare(b.slug))
      .map((p) => "- [" + p.title + "](https://learn.eagle3dstreaming.com/wiki/" + p.slug + ")"));
  fs.writeFileSync(path.join(ROOT, "site", "llms.txt"), llms.join("\n") + "\n", "utf8");

  console.log("  " + written + " pages written to site/wiki/");
  console.log("  " + tree.roots.length + " top-level, deepest branch "
    + Math.max(...pages.map((p) => (p.parents || []).length)) + " levels");
}

main();
