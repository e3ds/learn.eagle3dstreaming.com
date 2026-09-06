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

**The folder tree IS the navigation.** No hand-maintained sidebar file, so the
menu cannot drift out of step with what exists.

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

Markdown, one file per page. Two ways in, in order of who is doing it:

1. **"Edit this page"** on every rendered page, opening the GitHub web editor.
   No setup, full history, revertible.
2. **A visual editor at `/admin`** (Decap CMS) once the structure has settled.
   Still writes Markdown into git — no database, no separate hosting.

Nobody should ever need to write HTML to fix a typo. If they do, something here
is wrong.

---

## 5. Hosting

Static files served by nginx from `site/`. **One server block covers the whole
tree** — there is no per-file nginx entry and there must never be one.

- config: `C:/Program Files/nginx/conf/sites-enabled/learn.eagle3dstreaming.com.conf`
- certificate: the existing wildcard `*.eagle3dstreaming.com`, so a new
  subdomain needs no new certificate
- DNS: an A record for `learn` pointing at the same address as the other
  subdomains

---

## 6. Search engines and AI crawlers

Both want the same thing, which is why one decision serves both: **the content
must be in the HTML, not assembled by JavaScript.**

- `sitemap.xml` and `robots.txt` generated with the site
- one `<h1>` per page, honest `<title>`, a real meta description
- canonical URLs, so the old wiki can point here without splitting ranking
- `llms.txt` at the root — a plain-text index of what exists and where, for
  language models that look for one

---

## 7. State of the migration

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
