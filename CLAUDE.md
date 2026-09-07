# learn.eagle3dstreaming.com — the documentation repo

This repo holds every customer-facing document for Eagle 3D Streaming. It is
served as a static site at **learn.eagle3dstreaming.com**.

Read this file before adding or changing anything here.

---

## 1. What this is for

**The goal is to replace `docs.eagle3dstreaming.com` as the main documentation.**
Not to sit beside it. Every page there is to be moved here, and rewritten rather
than copied — see §3.

Four requirements decided up front, and every choice below follows from them:

| requirement | what it forces |
|---|---|
| **Novice friendly** | written for someone who has not used the product, not for us |
| **Editable by non-developers** | Markdown in git, not hand-written HTML |
| **Found by search engines** | static HTML with real content in the markup |
| **Readable by AI crawlers** | same, plus a machine-readable index |

---

## 2. Why the structure is what it is

```
content/
  getting-started/          first stream, first app, the shortest path to working
  streaming-settings/       one page per setting the customer can change
    common/                 link expiration, password, session limits
    ui/                     control bar, buttons, fullscreen
    microphone/             microphone capture and limits
    developer/              codec, console commands, remote control
  embedding/                iframes, the SDK, host pages
  troubleshooting/          symptom first: "no video", "no sound", "it paused"
  reference/                exhaustive lists nobody reads top to bottom
assets/images/              screenshots, referenced from content
site/                       the generated static site — never edited by hand
```

**Split by audience at the top level, not by feature.** There are two readers who
share almost nothing: a customer configuring a stream through the Control Panel,
and a developer embedding it in their own page. Mixing them means every page is
half irrelevant to whoever is reading it.

**`troubleshooting/` is organised by SYMPTOM, not by cause.** Somebody arrives
knowing "there is no sound", not "the microphone constraint was refused". A page
named after the cause is a page they cannot find.

**One manifest IS the navigation.** `nav.json` lists every page once and
`build-nav.js` stamps the tree into all of them (§5), so the menu cannot drift
page by page — but it does have to be re-run when a page is added.

---

## 3. Rewriting, not copying

Pages from the old wiki are **rewritten**. When moving one:

- **Say what the reader gets, not what the field is called.** "Stops the app's
  own audio returning through the microphone" beats "Sets echoCancellation".
- **Say what happens at each end of a range.** A setting with a minimum and a
  maximum needs both explained; the number alone tells nobody anything.
- **Name the trade-off.** Every setting that costs something must say what.
- **Screenshots for anything with a UI.** In `assets/images/`, referenced
  relatively.
- **State what is not known.** A page that quietly omits an untested case is
  worse than one that says the case is untested — see the iframe section of the
  fullscreen page for the shape of this.

---

## 4. Editing

**Add `?edit=1` to any page.** The text becomes editable in place, a bar appears
at the bottom, type the password, press Save. The HTML file on disk is rewritten
and served from that moment.

No database and no build step: the file that is served IS the file that is
edited, so a page cannot drift from its source because there is only one of them.

What protects it, since this rewrites files on a public host:

| | |
|---|---|
| password | checked on **save**, not on view — reading is public, only writing is gated |
| path confinement | the target must resolve inside `site/`; `../../cirrus.js` is refused |
| `.html` only | nothing else is writable |
| a backup first | the current file is copied to `.backups/` with a timestamp before every overwrite |
| size cap | 2 MB, so a runaway paste cannot fill the disk |

The password lives in `editor-password.txt` beside `server.js`, gitignored. If
that file is absent **saving is disabled rather than open** — a missing secret
must never mean "no security required".

To undo a bad edit, copy the wanted file out of `.backups/` over the one in
`site/`. Each backup is named for the page and the moment it was replaced.

Nobody should ever need to write HTML to fix a typo. If they do, something here
is wrong.

### Pictures

**Paste a screenshot straight into the page**, or press *Add picture* to choose
a file. Either way you are asked for a short description, which becomes both the
caption under the image and its `alt` text — one question, because asking twice
for the same sentence only teaches people to skip it.

Pictures are stored as **files** in `site/images/` and referenced by URL. They
are never embedded in the page, and the paste is intercepted specifically to
stop the browser doing that: left alone a browser inlines a pasted screenshot as
base64, so a 400 KB picture becomes ~550 KB of text inside the HTML, the page
stops being cacheable apart from its pictures, and two or three of them pass the
save limit.

What an upload has to get past:

| | |
|---|---|
| password | the same one as saving, sent with the upload |
| magic numbers | PNG, JPEG, GIF and WebP only, checked against the **bytes** — an extension is just the end of a filename and proves nothing |
| no SVG | it is a document, it can carry script, and it would run on our own origin |
| name rewritten | reduced to letters, digits and dashes, so nothing from the filename reaches the disk or the URL intact |
| never overwrites | a second `screenshot.png` becomes `screenshot-2.png`; two pages uploading the same name must not silently change each other |
| 8 MB | over that it answers **with a reason** rather than dropping the connection — a dead socket tells the person nothing |

Styling for pictures is stamped into every page by `build-nav.js` (§5) along
with the tree, so images never overflow the column and captions match the page.

**VERIFIED** on 2026-09-06, server side, by uploading against a running server:
a valid PNG is accepted; the same name twice produces `-2`; a wrong password is
refused; an executable renamed `.png` is refused; an SVG carrying `<script>` is
refused; `../../../server.js` as a filename lands harmlessly as
`site/images/server.png`; 9 MB returns the size message and writes nothing.
**NOT verified:** the browser half — paste interception and inserting at the
cursor — which needs a real browser and has not been through one yet.

---

## 5. The navigation tree

One tree, on every page, generated by **`build.js`** from the pages themselves —
each fragment's `.json` states its ancestors, so the tree cannot list a page
that does not exist or miss one that does.

```
node build.js
```

**There were briefly two trees, and it is worth knowing why that was bad.**
`build-nav.js` read a hand-written `nav.json` and stamped its own tree into the
three hand-written pages, while `build.js` built a different tree for the
migrated pages. Neither knew the other existed. So the microphone page showed a
greyed-out "Getting started" placeholder while Getting Started had been live for
hours a directory away. Both files are deleted; a hand-maintained list of pages
is exactly the thing that goes stale.

The two pages that predate the migration are listed in `EXTRA_PAGES` in
`build.js` so they sit in the same tree. They stop needing that entry once they
become fragments like everything else. It rewrites only the block
between the `E3DS-NAV:BEGIN` / `E3DS-NAV:END` markers in each file; everything a
person wrote sits outside them and is never touched, so it is safe to run over
pages that have been edited in the browser. Running it twice changes nothing.

**Nothing is assembled at request time.** This was tried the other way first —
the server injected the tree into each response — and it is explicitly rejected:
**no server-side rendering for documentation.** Stamping it into the files
instead means what a crawler downloads is exactly what is in the file (§6 needs
this), and the site would still be correct served by nginx alone with no Node in
front of it. The cost is remembering to run the script; the check below catches
the other half of that.

The tree sits **outside `.wrap`**, which is the element the editor makes
editable, so editing a page cannot reach the navigation and saving cannot damage
it.

`build-nav.js` warns if `nav.json` links to a page that does not exist, rather
than letting a reader find the 404. Entries marked `"planned": true` render
greyed and unclickable **on purpose** — a reader can see what is coming, and it
stops a section quietly never being written because nobody remembered it.

**VERIFIED** on 2026-09-06: all three pages stamped, the second run byte-identical
to the first, each page served byte-for-byte identical to the file on disk, and
the current page highlighted correctly per file. Checked locally on :6500 and
over `https://learn.eagle3dstreaming.com`.

---

## 6. Hosting

`server.js` serves `site/` on port 6500 and handles the save endpoint; nginx
proxies the domain to it. **One server block covers the whole tree** — there is
no per-file nginx entry and there must never be one.

The server no longer changes any page it serves: a `.html` response is the file
on disk, byte for byte. The single exception is `?edit=1`, which appends the
editing bar and is never what a reader or a crawler asks for. That means Node is
a convenience here, not a dependency — pointing nginx straight at `site/` would
serve the same bytes, minus the ability to edit.

- config: `C:/Program Files/nginx/conf/sites-enabled/learn.eagle3dstreaming.com.conf`
- certificate: the existing wildcard `*.eagle3dstreaming.com`, so a new
  subdomain needs no new certificate
- DNS: an A record for `learn` pointing at the same address as the other
  subdomains

---

## 7. Search engines and AI crawlers

Both want the same thing, which is why one decision serves both: **the content
must be in the HTML, not assembled by JavaScript.**

- `sitemap.xml` and `robots.txt` generated with the site
- one `<h1>` per page, honest `<title>`, a real meta description
- canonical URLs, so the old wiki can point here without splitting ranking
- `llms.txt` at the root — a plain-text index of what exists and where, for
  language models that look for one

---

## 8. How a page is built

```
content/wiki/<slug>.html   the article, and nothing else
content/wiki/<slug>.json   its title and its ancestors
template.html              the page shell - the design, once
       |
       |  node build.js
       v
site/wiki/<slug>.html      a finished static page
```

**The content and the shell are separate for one reason: 300 pages have to look
like one product.** If every page carried its own header, styles and navigation,
changing the design would mean editing 300 files, and the ones that got missed
would stay wrong until a customer found them. Here the design exists once and
every page is regenerated from it.

`build.js` also derives the tree from the pages themselves — each fragment's
`.json` states its ancestors — so the navigation cannot drift from what exists.
There is no list of pages to forget to update. It writes `site/llms.txt` on
every run for the same reason.

**Still nothing at request time.** The output is plain static HTML; the server
hands over the file unchanged. `?edit=1` remains the only exception.

**URLs are the old wiki's URLs.** A page lives at `/wiki/<slug>`, matching
`docs.eagle3dstreaming.com/wiki/<slug>` exactly, so every existing link,
bookmark, support email and search result keeps working and the ranking
transfers rather than splitting. `server.js` resolves the extensionless path to
the `.html` file — that is file lookup, not rendering. **If nginx is ever pointed
at `site/` directly it needs `try_files $uri $uri.html $uri/index.html`, or every
one of those URLs 404s.**

### The migration tool

`migration/convert.py` turns a crawled Confluence page into a fragment. It lives
in `migration/` because it runs until the wiki is moved and then never again,
while `build.js` runs forever — keeping them apart stops the migration's
throwaway assumptions leaking into what we maintain.

```
python migration/convert.py "Getting Started"     one section, plus its ancestors
python migration/convert.py --all                 everything
node build.js
```

A section's own landing page is not filed *inside* the section — it is the parent
of it — so a batch pulls in ancestors too. Without that, `/wiki/getting-started`
is a 404 and the tree has a hole in it.

What it does to the markup, and why:

| | |
|---|---|
| uses a real parser | these pages nest six levels deep; regular expressions match the wrong closing tag and the damage is silent — the page still renders, just missing a column |
| strips theme furniture | copy buttons, anchor icons, i18n markers, scroll wrappers — none of it is content, all of it would be frozen into our pages forever |
| panels → callouts | Confluence gives an information note and a warning identical markup; the flavour is only in the text (`Note :`, `Tip :`), so it is read from there |
| tables get a `thead` | a first row of all `<th>` is a header row Confluence never declared; this is what lets a screen reader say which column a cell is in |
| tables get a scroll box | otherwise a wide table scrolls the whole page sideways |
| alt text from captions | Confluence sets alt to the upload filename — `image-20241221.png` read aloud is worse than silence, so a caption is used, or nothing |
| images pulled local | including ones hotlinked from outside |

**Pictures hotlinked from elsewhere are downloaded, not linked.** Six pages
embed images that were pasted from a Google Doc and never uploaded to Confluence
at all. Those `lh7-rt.googleusercontent.com` URLs expire, so the old site is
already carrying pictures that will one day vanish. Copying them ends that
dependency rather than inheriting it.

Images live in `site/images/` and are committed. `build.js` has an `IMAGE_BASE`
constant so moving them to a bucket or CDN later is one line, not 302 edits.

---

## 9. Still to do, beyond the page rewrite

**The API reference at `agw.eaglepixelstreaming.com/api-docs/` is not part of
this site and is in poor shape.** It is a generated Swagger page, and it needs
bringing up to the same standard as the rest of the documentation - which
probably means pulling it into `learn` as a written reference rather than
linking out to a schema dump. Raised 2026-09-07. Not started.

---

## 10. State of the migration

The old wiki held **302 published pages, 117,620 words, 1,394 images (~211 MB)**,
five levels deep. Everything is on this site; the rewrite proceeds by section.

**A page that has not been rewritten says so, in a banner.** That disappears
when its fragment is marked `"rewritten": true`.

| section | rewritten | still ported |
|---|---|---|
| (top level) | 3 | 6 |
| App Configuration | 4 | **done** |
| Control Panel Features | 0 | 60 |
| Developer Guides | 0 | 43 |
| Embed Stream into Webpage | 7 | **done** |
| Foundational knowledge | 0 | 20 |
| Getting Started | 5 | **done** |
| Linux Pixel Streaming | 3 | **done** |
| Multiplayer Pixel Streaming | 0 | 39 |
| System Requirements | 7 | **done** |
| Virtual Reality Pixel Streaming | 2 | **done** |
| What's New | 0 | 3 |

**Merging is the point, not a side effect.** The wiki has one page per action,
which is how a reader ends up opening three pages to discover they needed one.
Roughly: 18 Getting Started pages became 6, 40 Embedding pages became 8, 43 App
Configuration pages became 6, 12 System Requirements became 6.

**Every merged-away slug keeps working.** Each rewritten fragment lists what it
`replaces`, and `build.js` writes a static redirect stub per old slug -
canonical link, meta refresh, and a visible line so nobody wonders where they
landed.

**Still to do beyond the page rewrite:**

- **What's New has no dates.** It cannot become a release feed until someone
  supplies roughly when each entry shipped; a crawl cannot recover it.
- **The Swagger API reference** at `agw.eaglepixelstreaming.com/api-docs`
  (see section 9).
- **The two hand-written guides** (microphone, fullscreen) are still standalone
  HTML with their own CSS rather than fragments in the template.
