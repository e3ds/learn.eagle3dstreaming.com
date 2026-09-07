# -*- coding: utf-8 -*-
"""[E3DS-LEARN-MIGRATION] Confluence page -> content fragment.

    python migration/convert.py "Getting Started"
    python migration/convert.py --all

ONE-TIME TOOL. It lives in migration/ rather than the repo root because it runs
until the wiki is moved and then never again. build.js is the opposite: it runs
every time a page changes, forever. Keeping them apart stops the migration's
throwaway assumptions leaking into the thing we maintain.

WHAT IT PRODUCES

    content/wiki/<slug>.html   the article, as clean HTML
    content/wiki/<slug>.json   title, ancestors, section, original URL
    site/images/<file>         every picture, downloaded and de-duplicated

The fragment is the editable source. It holds the article and nothing else - no
page shell, no navigation, no theme. build.js wraps it. That split is what lets
302 pages share one design: change the template once and every page follows,
which is impossible if each page carries its own copy of the furniture.

WHY A PARSER AND NOT REGULAR EXPRESSIONS. These pages nest six levels deep -
a table inside a scroll wrapper inside a sort wrapper inside an expand wrapper.
Regular expressions match the wrong closing tag on markup like that, and the
damage is silent: the page still renders, just missing a column. With 302 pages
nobody would find it.
"""

import io, json, os, re, sys, hashlib
import urllib.request
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
MIRROR = os.path.join(
    os.environ.get("E3DS_MIRROR",
                   r"C:\Users\e3ds\AppData\Local\Temp\claude\C--Users-e3ds"
                   r"\38e8266a-53ca-4d72-9400-620348a70f37\scratchpad\docs-mirror"))
INVENTORY = os.path.join(os.path.dirname(MIRROR), "docs-inventory.json")
CONTENT = os.path.join(REPO, "content", "wiki")
IMAGES = os.path.join(REPO, "site", "images")
HOST = "https://docs.eagle3dstreaming.com"

# Interface furniture. Every one of these is something the reader's browser
# draws or the help-centre theme needs - none of it is content, and all of it
# would otherwise be frozen into our pages forever.
DROP = ["copy-clipboard", "i18n-message", "script", "ai-actions", "style"]
DROP_CLASS = ["anchor-copy-button", "copy-headline-link-icon", "child-pages"]

# Wrappers the theme adds around real content. The content stays, the wrapper
# goes - it exists to drive their JavaScript, which we do not have.
UNWRAP = ["scroll-shadow", "table-sort", "table-expand", "image-lightbox",
          "smart-link", "section", "article"]
UNWRAP_CLASS = ["layout-section", "layout-cell", "fb-layout-container",
                "fb-layout-body", "panel-meta"]


def log(*a):
    print("   ", *a)


class Converter:
    def __init__(self):
        self.images = {}          # remote URL -> local filename
        self.missing_images = []
        self.notes = []

    # ---- pictures ------------------------------------------------------
    def local_image(self, src):
        """Download once, reuse everywhere. The same screenshot appears on
        several pages, and the cache-busting query differs between them, so
        identity is the attachment path without the query.

        External images are pulled in too, not skipped. A handful of pages
        hotlink pictures that were pasted from a Google Doc and never uploaded
        to Confluence at all - those URLs expire, so the old site is already
        carrying pictures that will one day vanish. Copying them here ends that
        dependency instead of inheriting it."""
        if not src:
            return None
        external = src.startswith("http")
        if not external and not src.startswith("/__attachments/"):
            return None
        key = src.split("?")[0]
        if key in self.images:
            return self.images[key]

        if external:
            # These URLs carry no usable filename - Google's are opaque ids -
            # so the name is derived from the URL and the type is settled after
            # the download, from what actually arrived.
            name = "external-" + hashlib.sha1(key.encode()).hexdigest()[:10] + ".png"
        else:
            name = os.path.basename(key)
        if not re.search(r"\.(png|jpe?g|gif|webp|svg)$", name, re.I):
            name += ".png"
        # Attachment paths are unique but their filenames are not: two pages
        # can both hold "image-2024.png". A short hash of the path keeps them
        # apart without turning the filename into gibberish.
        stem, ext = os.path.splitext(name)
        name = "%s-%s%s" % (stem[:52], hashlib.sha1(key.encode()).hexdigest()[:6], ext.lower())

        dest = os.path.join(IMAGES, name)
        if not os.path.exists(dest):
            url = src if external else HOST + src
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "Mozilla/5.0 (e3ds-docs-migration)"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                    ctype = r.headers.get("Content-Type", "")
                if external:
                    # Name it for what it turned out to be, so the browser and
                    # our own upload checks agree with the extension.
                    real = {"image/jpeg": ".jpg", "image/gif": ".gif",
                            "image/webp": ".webp", "image/png": ".png"}.get(ctype.split(";")[0])
                    if real and not name.endswith(real):
                        name = name[:-4] + real
                        dest = os.path.join(IMAGES, name)
                os.makedirs(IMAGES, exist_ok=True)
                io.open(dest, "wb").write(data)
            except Exception as ex:
                self.missing_images.append((src, str(ex)))
                return None
        self.images[key] = name
        return name

    # ---- the article ---------------------------------------------------
    def convert(self, html, slug):
        soup = BeautifulSoup(html, "lxml")
        body = soup.select_one(".article-body")
        if body is None:
            return None

        for tag in body.select(",".join(DROP)):
            tag.decompose()
        for cls in DROP_CLASS:
            for tag in body.select("." + cls):
                tag.decompose()
        for tag in body.find_all("svg"):
            tag.decompose()

        self.fix_code(body)
        self.fix_tables(body)
        self.fix_panels(body)
        self.fix_figures(body)
        self.fix_links(body)

        for name in UNWRAP:
            for tag in body.find_all(name):
                tag.unwrap()
        for cls in UNWRAP_CLASS:
            for tag in body.select("." + cls):
                tag.unwrap()

        self.tidy(body)

        out = "".join(str(c) for c in body.children).strip()
        return re.sub(r"\n{3,}", "\n\n", out)

    def fix_code(self, body):
        """<code-snippet> carries the language in a header the reader sees as a
        label. Keep it as a class so highlighting can use it later, and drop the
        header - our template draws its own."""
        for snip in body.find_all("code-snippet"):
            lang = ""
            head = snip.select_one(".theme-code-snippet-header")
            if head:
                lang = head.get_text(strip=True)
                head.decompose()
            holder = snip.select_one("[data-language]")
            if holder and holder.get("data-language"):
                lang = holder["data-language"]
            pre = snip.find("pre")
            if not pre:
                snip.decompose()
                continue
            code = pre.find("code")
            if code is not None and lang:
                code["class"] = ["language-" + re.sub(r"[^a-z0-9+#-]", "", lang.lower())]
            snip.replace_with(pre)

    def fix_tables(self, body):
        """A table whose first row is all <th> is a table with a header row -
        Confluence just never says so. Marking it up properly is what lets a
        screen reader announce which column a cell belongs to, and lets the
        header stay put when the table scrolls."""
        for table in body.find_all("table"):
            first = table.find("tr")
            if first and first.find_all("td") == [] and first.find_all("th"):
                thead = body.new_tag("thead") if hasattr(body, "new_tag") else None
                soup = table.find_parent(lambda t: hasattr(t, "new_tag")) or table
                thead = BeautifulSoup("<thead></thead>", "lxml").thead
                first.extract()
                thead.append(first)
                table.insert(0, thead)
            for attr in ("data-component", "data-align", "data-number-column"):
                table.attrs.pop(attr, None)
            # A wide table must scroll inside its own box; without this the
            # whole page scrolls sideways and the text becomes unreadable.
            wrapper = BeautifulSoup('<div class="scroll"></div>', "lxml").div
            table.wrap(wrapper)

    def fix_panels(self, body):
        """Confluence panels carry no type - an information note and a warning
        are the same markup. The flavour is written in the text ("Note :",
        "Tip :"), so read it from there and label the element, which is what
        lets the template style them differently."""
        for panel in body.select(".panel-content"):
            text = panel.get_text(" ", strip=True)[:40].lower()
            kind = "note"
            if text.startswith(("warning", "caution", "important")):
                kind = "warning"
            elif text.startswith("tip"):
                kind = "tip"
            aside = BeautifulSoup('<aside class="callout %s"></aside>' % kind, "lxml").aside
            for child in list(panel.children):
                aside.append(child.extract())
            panel.replace_with(aside)

    def fix_figures(self, body):
        for fig in body.find_all("figure"):
            img = fig.find("img")
            if img is None:
                fig.decompose()
                continue
            local = self.local_image(img.get("src", ""))
            if not local:
                fig.decompose()
                self.notes.append("dropped a figure whose picture could not be fetched")
                continue
            cap = fig.find("figcaption")
            caption = cap.get_text(" ", strip=True) if cap else ""

            # Confluence sets alt to the upload filename - "image-20241221.png"
            # tells a screen reader nothing. The caption is a real description,
            # so use it; with no caption an empty alt is correct, because a
            # filename read aloud is worse than silence.
            img.attrs = {"src": "/images/" + local, "alt": caption,
                         "loading": "lazy", "decoding": "async"}
            for k in ("width", "height"):
                pass
            holder = fig.select_one(".block-image")
            if holder:
                holder.unwrap()
            fig.attrs = {}

        # Anything still carrying a remote src - inline images, and pictures
        # hotlinked from outside - is pulled local too. An alt that is just the
        # URL is worse than none, so it is not carried over.
        for img in body.find_all("img"):
            src = img.get("src", "")
            if src.startswith("/images/"):
                continue
            local = self.local_image(src)
            if local:
                alt = img.get("alt", "")
                if alt.startswith("http") or re.match(r"^image-\d+", alt):
                    alt = ""
                img.attrs = {"src": "/images/" + local, "alt": alt,
                             "loading": "lazy", "decoding": "async"}
            else:
                img.decompose()

    def fix_links(self, body):
        for a in body.find_all("a"):
            href = a.get("href", "")
            a.attrs.pop("data-scope", None)
            a.attrs.pop("data-display-mode", None)
            a.attrs.pop("id", None)
            if href.startswith("http") and "eagle3dstreaming.com" not in href:
                a["rel"] = "noreferrer"
                a["target"] = "_blank"

    def tidy(self, body):
        """Confluence pads pages with empty paragraphs. Left in, they become
        gaps the editor cannot see or delete."""
        for p in body.find_all("p"):
            if not p.get_text(strip=True) and not p.find(["img", "iframe"]):
                p.decompose()
        for tag in body.find_all(True):
            for attr in ("data-component", "data-scope", "data-align",
                         "data-levels", "data-number-column"):
                tag.attrs.pop(attr, None)
            if tag.name in ("div", "span") and not tag.attrs:
                tag.unwrap()


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        print("  usage: convert.py \"Section Name\" | --all")
        return 1

    inv = json.load(io.open(INVENTORY, encoding="utf-8"))
    pages = inv["pages"]
    if args[0] != "--all":
        want = args[0].lower()
        pages = [p for p in pages if p["section"].lower() == want]
        # A section's own landing page is not filed inside the section - it is
        # the parent of it. Pulling in the ancestors keeps the batch a complete
        # branch, so the tree has no gap and /wiki/<section> is not a 404.
        by = {q["slug"]: q for q in inv["pages"]}
        chosen = {p["slug"] for p in pages}
        for p in list(pages):
            for anc in p.get("parents", []):
                if anc in by and anc not in chosen:
                    chosen.add(anc)
                    pages.append(by[anc])
        if not pages:
            print("  no pages in section %r" % args[0])
            print("  sections: " + ", ".join(sorted({p["section"] for p in inv["pages"]})))
            return 1

    """A page that has been REWRITTEN is never overwritten by a re-convert, and
    neither is a slug some rewritten page has already absorbed.

    Without this, one --all run silently replaces finished prose with the ported
    original and resurrects the pages it replaced - the migration undoing itself,
    with nothing to show it happened but a diff nobody asked for."""
    protected, absorbed = set(), set()
    if os.path.isdir(CONTENT):
        for f in os.listdir(CONTENT):
            if not f.endswith(".json"):
                continue
            meta = json.load(io.open(os.path.join(CONTENT, f), encoding="utf-8"))
            if meta.get("rewritten"):
                protected.add(meta["slug"])
                absorbed.update(meta.get("replaces", []))

    os.makedirs(CONTENT, exist_ok=True)
    os.makedirs(IMAGES, exist_ok=True)
    c = Converter()
    done, skipped = 0, []

    for p in pages:
        if p["slug"] in protected:
            skipped.append((p["slug"], "rewritten - left alone"))
            continue
        if p["slug"] in absorbed:
            skipped.append((p["slug"], "already merged into a rewritten page"))
            continue
        src = os.path.join(MIRROR, p["slug"] + ".html")
        if not os.path.exists(src):
            skipped.append((p["slug"], "not in the mirror"))
            continue
        html = io.open(src, encoding="utf-8", errors="replace").read()
        frag = c.convert(html, p["slug"])
        if frag is None:
            skipped.append((p["slug"], "no .article-body"))
            continue

        io.open(os.path.join(CONTENT, p["slug"] + ".html"), "w", encoding="utf-8").write(frag)
        io.open(os.path.join(CONTENT, p["slug"] + ".json"), "w", encoding="utf-8").write(
            json.dumps({
                "title": p["title"],
                "slug": p["slug"],
                "section": p["section"],
                "parents": p["parents"],
                "source": p["url"],
            }, indent=1))
        done += 1
        log("%-52s %6d chars" % (p["slug"][:52], len(frag)))

    print()
    log("%d pages converted, %d pictures downloaded" % (done, len(c.images)))
    if skipped:
        log("%d skipped:" % len(skipped))
        for s, why in skipped[:10]:
            log("   %-50s %s" % (s, why))
    if c.missing_images:
        log("%d pictures could not be fetched:" % len(c.missing_images))
        for u, why in c.missing_images[:8]:
            log("   %-60s %s" % (u[:60], why[:40]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
