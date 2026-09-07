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

---

## 5. The navigation tree

The tree down the left of every page is generated from **`nav.json`**, the one
place a page is listed, by **`build-nav.js`**:

```
node build-nav.js
```

Run it after adding a page or changing `nav.json`. It rewrites only the block
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

## 8. State of the migration

| page | status |
|---|---|
| Microphone settings | written, needs converting from standalone HTML |
| Fullscreen button | written, needs converting from standalone HTML |
| everything on the old wiki | **not started** |

Both existing pages were built as self-contained HTML files with inline CSS
before this repo existed. They carry their content well and their structure is
right; converting them to Markdown is mechanical, and doing so is what finally
lets them carry screenshots.

**Nothing here is live to customers yet.** The Control Panel links to these
pages, so a broken build here shows up as a broken info button there.
