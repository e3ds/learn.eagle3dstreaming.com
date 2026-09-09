# learn.eagle3dstreaming.com

The customer-facing documentation for Eagle 3D Streaming, served as a static
site at **learn.eagle3dstreaming.com**.

For editorial rules — what belongs here, how pages are written, the migration
from the old wiki — read **`CLAUDE.md`**. This file is only about running it.

---

## Run it locally

You need **Node.js** ([nodejs.org](https://nodejs.org)). Nothing else — there
are no dependencies to install.

```
git clone https://github.com/e3ds/learn.eagle3dstreaming.com.git
cd learn.eagle3dstreaming.com
start-local.bat
```

A browser opens at **http://localhost:6510/** and the site is live from your
working copy. Press `Ctrl+C` in the console window to stop it.

On macOS or Linux, or if you would rather not use the batch file:

```
LEARN_PORT=6510 node server.js
```

### Why 6510 and not 6500

The production instance on the docs machine holds **6500**. Starting a second
copy there fails with `EADDRINUSE`, the error scrolls past, and you are left
with a browser pointed at the **live site** while you believe you are editing
locally. 6510 cannot collide. `LEARN_PORT` overrides it if you need another.

---

## Edit a page in the browser

Add **`?edit=1`** to the address of any page:

```
http://localhost:6510/?edit=1
http://localhost:6510/wiki/getting-started?edit=1
http://localhost:6510/microphone-settings?edit=1
```

A toolbar appears along the bottom of the page and the body becomes editable in
place — every editable region gets a dashed outline. There is no separate admin
screen and no markdown: **you are typing on the real page, in its real styling,
and what you see is what gets saved.**

### The toolbar

| control | what it does |
|---|---|
| **Add picture** | opens a file picker (`.png`, `.jpg`, `.gif`, `.webp`) |
| **password** | the password field — must be filled before Save works |
| **Save** | writes the page |
| **Stop editing** | drops `?edit=1` and returns to the normal page |

### Step by step

1. Open the page with `?edit=1`.
2. Click any paragraph or heading and type. Ordinary text editing —
   backspace, select, paste.
3. Add a picture either by pressing **Add picture**, or simply **pasting a
   screenshot from the clipboard** straight onto the page, which is what you
   have right after PrintScreen. You are then asked for a caption; it appears
   under the image and is what search engines and screen readers use.
4. Type the password into the box on the toolbar.
5. Press **Save**. The toolbar reports success, or the reason it refused.
6. Press **Stop editing** to leave.

### The password

It is read from **`editor-password.txt`** in the repo root — one line, the
password itself, nothing else.

That file is **gitignored on purpose**: a shared password has no business in a
repository that has a public remote. So a fresh clone does not have one, and
`start-local.bat` creates it for you with the password **`local`** and prints
that on startup. On the production machine the file holds the real one.

The password is sent with every save and upload. It is **not** a login — there
is no session and no user identity, so edits cannot be attributed to a person.
That is acceptable for internal review; it is worth revisiting before the site
is public, because the editor writes straight to the live files.

If the file is missing, **editing is silently disabled** — the toolbar still
appears but every Save is refused. The server says which at startup, so check
the console first if Save does nothing:

```
[E3DS-LEARN] editing ENABLED
[E3DS-LEARN] editing DISABLED (no editor-password.txt)
```

### What can go wrong, and what it means

| the toolbar says | what happened |
|---|---|
| `wrong password` | the box does not match `editor-password.txt` |
| `editing is disabled - no editor-password.txt on the server` | the file is missing |
| `only .html inside site/` | the path was not a page in this site |
| `that does not look like a page` | the content came back too short — do not retry, reload first |
| a warning about **content markers** | saved to the page but **not** the source; run `node build.js` once and edit again |

### Editing the live site

The same URL works against production:

```
https://learn.eagle3dstreaming.com/wiki/getting-started?edit=1
```

with the real password. **It writes to the live files immediately** — there is
no review step and no undo button. Before overwriting anything a timestamped
copy of the previous version is written to `.backups/`, so a bad edit can be
put back by hand, but nothing else stands between you and the published page.

`.backups/` is gitignored — git already keeps the real history, and the folder
grows with every save.

---

## What Save actually writes, and why it matters

Pages are **generated**. `content/wiki/*.html` are the sources; `site/wiki/*.html`
is build output.

Save writes **both**: the built page so your change is visible immediately, and
the source so it survives the next build.

> Until 2026-09-09 it wrote only the built page, so `node build.js` erased every
> wiki edit — silently, and long enough afterwards to look like the editor was
> broken. If you ever see a saved change disappear, that is the shape of the bug
> to suspect.

The editable region is marked in each built page:

```html
<!-- E3DS-CONTENT:BEGIN the editable body. Save reads between these -->
...
<!-- E3DS-CONTENT:END -->
```

A page built before those markers existed still saves, but only to the output —
and the response says so rather than reporting a clean save. Run `node build.js`
once to regenerate it with markers, then edit again.

---

## Pictures and disk space

**Nothing is uploaded until you press Save.** Adding a picture puts it in the
page as a `blob:` URL that lives only in your browser tab; Save uploads the ones
still present and swaps in the real URLs. Add a picture, change your mind and
delete it, and its bytes never leave the browser.

If any upload fails, the whole save is refused rather than publishing a page
whose pictures point at a tab's memory — a `blob:` URL is meaningless anywhere
else, so that picture would be permanently broken with no file to restore.

### Pictures nothing points at

Uploads still accumulate: replace a screenshot and the old one stays on disk,
because nothing counts references.

```
node build.js
node prune-images.js              # what would go, and how much space
node prune-images.js --delete     # actually remove them
```

It reports before it removes anything, and deleting requires `--delete` typed
out. Always run `build.js` first — pruning against a stale build can delete a
picture a new page has only just started using.

> As of 2026-09-09, **1,175 of 1,400 images (263 MB of 318 MB) were referenced
> by nothing at all** — pulled in by the wiki migration for pages that were
> later merged away. That is most of this repository's size serving no page.

**Deleting them does not shrink the repository on GitHub.** Git keeps every
version of every file ever committed, so the bytes stay in history and a clone
still downloads them. Removing them properly means rewriting history with
`git filter-repo` and force-pushing, which invalidates every existing clone.
That is a decision to take deliberately, and the earlier it is taken the
cheaper it is.

## Rebuild after editing

```
node build.js
```

That regenerates every page from `content/`, restamps the navigation, writes the
redirect stubs for merged-away pages, and rewrites `sitemap.xml`. Run it after
editing content files directly, or after changing `template.html` or `nav.json`.

Editing through `?edit=1` does not require a build — Save already wrote the
output — but running one is harmless and confirms the source round-trips.

---

## Layout

```
content/wiki/      the sources for 97 generated pages, plain HTML fragments
site/              what is served
  wiki/            generated from content/ - do not edit by hand
  index.html       hand-written, and its own source
  microphone-settings.html, fullscreen-button.html    likewise
  images/          migrated wiki screenshots
  sitemap.xml      generated
template.html      the shell every generated page is poured into
build.js           the generator
server.js          the static server plus the ?edit=1 editor
nav.json           the navigation tree
```

Three pages at the site root are **hand-written**: `index.html`,
`microphone-settings.html` and `fullscreen-button.html`. Those files are their
own source — `build.js` only replaces the navigation block between its markers.
Everything under `site/wiki/` is generated and will be overwritten.

---

## In production

The docs machine runs the same `server.js` on port **6500**, behind nginx at
`learn.eagle3dstreaming.com`. `learn_launcher.bat` in `ps_solution_epic` keeps it
alive and restarts it if it exits, announcing restarts to Telegram.

Nothing on that machine started it before 2026-09-09, which is why the site was
down for three days without anyone noticing.

### Caching

Every response carries an `ETag` and `Cache-Control: no-cache`. That means the
browser keeps a copy but must revalidate before using it — an unchanged page
comes back `304` with no body, and an edited one comes back in full **on the
first load, with no hard refresh**.

`no-cache` is not `no-store`. `no-store` would re-download everything on every
visit; this keeps the site fast and still cannot go stale.

The editor path is `no-store`, because that HTML is assembled per request and
must never be served to anyone else.

---

## Before this site goes public

It is currently **hidden from search engines on purpose** — `robots.txt`
disallows everything and every page carries `<meta name="robots"
content="noindex,nofollow">`. `docs.eagle3dstreaming.com` is still the live
site, and indexing both would split the ranking between two copies.

At launch:

1. delete `robots.txt`
2. remove the `noindex` meta from `template.html` **and** `build.js`
3. repoint the canonical on the **95 pages that still defer to
   `docs.eagle3dstreaming.com`** — and leave the 348 consolidation canonicals
   alone, those point at the page the old one was merged into and are correct
   permanently
4. set `LAUNCHED = true` in `build.js` so `llms.txt` is written
5. decide which way the redirect goes between `docs` and `learn`, and point it
   at whichever should keep the existing ranking

`sitemap.xml` needs no action — it is generated on every build and lists only
pages whose canonical points at themselves, so it fills up on its own as pages
are finalised. Today that is 3 of 100.
