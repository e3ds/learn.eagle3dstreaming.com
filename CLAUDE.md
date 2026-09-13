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

> **Writing rules live in [`CLAUDE-WRITING.md`](CLAUDE-WRITING.md).** Read it
> before writing or rewriting a page. Every rule in it comes from a real
> correction on a real page - pronouns, the page/website distinction, figures as
> SVG rather than ASCII, where to stop before engineering detail, and the rest.
> This section is the short version; that file is the one to follow.

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

### The tree as it stands — a SNAPSHOT, not a source of truth

**Regenerate it rather than trusting this block.** The tree is built from the
`.json` sidecars, so the sidecars are the truth and anything pasted here starts
going stale the moment a page is added. This exists so a reader can see the
shape without running anything, and so the problems called out underneath have
something to point at.

```
cd content && python - <<'EOF'
import json,glob,collections
p={}
for f in glob.glob("wiki/*.json"):
    d=json.load(open(f,encoding="utf-8"))
    if d.get("slug"): p[d["slug"]]=d
k=collections.defaultdict(list); roots=[]
for s,d in p.items():
    ps=d.get("parents") or []
    (k[ps[0]].append(s) if ps and ps[0] in p else roots.append(s))
o=lambda s:(p[s].get("order") if p[s].get("order") is not None else 99, p[s].get("title",s))
def draw(s,pre="",last=True):
    print(f"{pre}{'└── ' if last else '├── '}{p[s].get('title',s)}  ·  {s}")
    c=sorted(k.get(s,[]),key=o)
    for i,x in enumerate(c): draw(x,pre+("    " if last else "│   "),i==len(c)-1)
r=sorted(roots,key=o)
for i,x in enumerate(r): draw(x,"",i==len(r)-1)
EOF
```

Snapshot taken **2026-09-12** — 105 pages, 12 top-level sections, deepest
branch 3 levels.

```
├── App configuration  ·  app-configuration
│   ├── Developer options  ·  developer-options
│   ├── Loading screen  ·  loading-screen
│   ├── Session and access  ·  session-and-access
│   └── The streaming interface  ·  streaming-interface
│       └── The settings bar, button by button  ·  settings-bar
├── Control Panel Features  ·  control-panel-features
│   ├── API keys and tokens  ·  api-keys-and-tokens
│   ├── Apps, links and versions  ·  apps-and-versions
│   ├── Meeting links  ·  meeting-links
│   ├── Monitoring and analytics  ·  monitoring-sessions
│   ├── Pixel Streaming plugin versions  ·  plugin-compatibility
│   ├── Plans and billing  ·  plans-and-billing
│   ├── What happens when you upload and stream  ·  what-happens-when
│   └── Your account and team  ·  your-account
├── Developer guides  ·  development-guides
│   ├── Testing locally  ·  test-locally
│   │   ├── From your own browser  ·  test-from-your-browser
│   │   ├── From another device  ·  test-on-another-device
│   │   ├── A Linux build  ·  test-linux-locally
│   │   ├── A VR app  ·  test-vr-locally
│   │   └── A dedicated server  ·  test-dedicated-server-locally
│   ├── Features plugin nodes  ·  features-plugin
│   │   ├── Capture a screenshot  ·  screenshots
│   │   ├── Open and redirect URLs  ·  open-and-redirect-urls
│   │   ├── End a session from the app  ·  ending-sessions
│   │   ├── File transfer  ·  file-transfer
│   │   ├── Detect the viewer's device  ·  device-detection
│   │   └── Mouse and fullscreen  ·  mouse-and-fullscreen
│   ├── Plugins  ·  plugins
│   │   ├── Install the Features plugin  ·  features-plugin-setup
│   │   ├── Automation Tools plugin  ·  automation-tools-plugin
│   │   ├── Remote Unreal Editor plugin  ·  remote-editor-plugin
│   │   └── Multiplayer Server Scaling plugin  ·  server-scaling-plugin
│   ├── Input and performance  ·  performance-optimization
│   │   ├── Game controllers  ·  game-controller-support
│   │   ├── On-screen keyboard  ·  on-screen-keyboard
│   │   ├── NVIDIA DLSS  ·  dlss
│   │   └── Audio and microphone  ·  audio-and-microphone
│   ├── Patching an app  ·  patches
│   │   ├── Try it on a demo app  ·  apply-a-patch
│   │   ├── Launch profiles  ·  patch-launch-profiles
│   │   └── Make your own patch  ·  create-a-patch
│   ├── API reference  ·  api-reference
│   │   ├── Health check API  ·  health-check-api
│   │   ├── Analytics API  ·  analytics-api
│   │   └── Automation Kit  ·  automation-kit
│   └── Demos  ·  demos-and-tutorials
│       ├── iframe demo  ·  iframe-demo
│       └── Convai microphone  ·  convai-microphone
├── Embedding  ·  embed-stream-into-webpage
│   ├── Embed with an iframe  ·  embed-stream-using-iframe
│   ├── Web SDK demo manual  ·  web-sdk-demo-manual
│   ├── Set up the Web SDK  ·  embed-stream-using-e3ds-sdk
│   │   ├── SDK reference  ·  sdk-reference
│   │   ├── Keeping your API key off the browser  ·  sdk-secure-the-key
│   │   ├── Why a session ended  ·  session-end-messages
│   │   └── Putting a login in front of a stream  ·  login-in-front-of-a-stream
│   ├── Sending and receiving data  ·  sending-and-receiving-data
│   ├── Web SDK reference  ·  javascript-sdk-guide
│   │   ├── The Unreal side of sending and receiving data  ·  unreal-side-of-data
│   │   └── Your own loading and ending screens  ·  your-own-screens
│   ├── Controlling the stream  ·  controlling-the-stream
│   ├── Choose the microphone  ·  choose-the-microphone
│   ├── Custom loading and error screens  ·  custom-screens
│   ├── How the microphone is chosen  ·  device-ids-across-the-iframe
│   ├── Putting a login in front  ·  login-integration
│   └── Branding and hosting  ·  branding-and-hosting
├── FAQ  ·  faq-frequently-asked-questions
├── Foundational knowledge  ·  blogs-and-articles
│   ├── Capacity and regions  ·  capacity-and-regions
│   ├── Load time  ·  load-time
│   ├── Ready Player Me  ·  ready-player-me
│   ├── Shared and dedicated sessions  ·  shared-and-dedicated-sessions
│   └── Unreal notes  ·  unreal-notes
├── Getting Started  ·  getting-started
│   ├── Create your account  ·  create-your-account
│   ├── Prepare your app in Unreal  ·  prepare-your-app
│   ├── Stream a sample app  ·  stream-a-sample-app
│   ├── Upload from Unreal  ·  upload-from-unreal
│   └── Upload from the Control Panel  ·  upload-from-the-control-panel
├── Linux streaming  ·  linux-pixel-streaming
│   ├── Build a Linux package  ·  linux-build
│   └── Upload and stream a Linux build  ·  linux-upload-and-stream
├── Multiplayer Pixel Streaming  ·  multiplayer-pixel-streaming
│   ├── Build the project  ·  multiplayer-build-a-project
│   ├── Package both builds  ·  multiplayer-package
│   ├── Upload both builds  ·  multiplayer-upload
│   ├── Start the server and play  ·  multiplayer-play
│   ├── Automatic server join  ·  multiplayer-automatic-join
│   ├── Upload from the editor  ·  multiplayer-upload-from-editor
│   └── Metaverse  ·  metaverse-pixel-streaming
├── System requirements  ·  system-requirements
│   ├── Cloud VMs  ·  cloud-vms
│   ├── Networks and firewalls  ·  network-and-firewall
│   ├── Optimise your app  ·  optimise-your-app
│   └── Stream from your own hardware  ·  streaming-agent
│       ├── Preallocated apps  ·  preallocated-apps
│       └── Update without uploading  ·  update-without-uploading
├── Virtual reality streaming  ·  virtual-reality-pixel-streaming
│   └── Set up a VR project  ·  vr-project-setup
└── What's new  ·  what-s-new
    ├── Control Panel Release Notes  ·  new-control-panel-release-note
    ├── New Features  ·  new-features-released-in-the-new-control-panel
    └── Payment System: Stripe integration  ·  new-payment-system-release-note
```

### What this tree shows that a page-by-page read does not

**1. Embedding is flat, and four pages now have near-duplicate siblings.**
Four migrated pages were rewritten as children of the SDK branch and the
originals were deliberately not deleted. So the branch carries both:

    Putting a login in front             login-integration            (old)
    Putting a login in front of a stream login-in-front-of-a-stream   (new)

    Sending and receiving data           sending-and-receiving-data   (old)
    The Unreal side of ...               unreal-side-of-data          (new)

    Custom loading and error screens     custom-screens               (old)
    Your own loading and ending screens  your-own-screens             (new)

    SDK reference                        sdk-reference                (old)
    (absorbed into javascript-sdk-guide)

Near-identical titles one branch apart. A reader browsing cannot tell which is
current, and search returns both.

**The fix is one line per sidecar**, and the mechanism already exists: add the
old slug to the new page's `replaces` array and `build.js` emits a redirect
stub. It does this for 276 merged-away pages already, so nothing is lost and
the old URLs keep working.

    unreal-side-of-data.json         replaces: ["sending-and-receiving-data"]
    your-own-screens.json            replaces: ["custom-screens"]
    login-in-front-of-a-stream.json  replaces: ["login-integration"]
    javascript-sdk-guide.json        replaces: ["sdk-reference"]

Left undone on purpose: retiring a page is a decision, not a chore.

**2. `javascript-sdk-guide` is a SIBLING of `embed-stream-using-e3ds-sdk`, not
a child of it.** So the intended reading order — demo manual, then setup, then
reference — is not what the tree says. Setup and reference sit side by side,
and their children are split across both.

**3. `embed-stream-into-webpage` is the real parent of the whole area** and is
worth keeping as such. It is the three-method comparison — Streaming URL,
iframe, SDK, across fourteen topics — and nothing else does that job. Folding
it into the SDK branch would strand every iframe reader.

**4. The Streaming API key is not a Control Panel concern.** Checked: it appears
in six pages, five of them SDK; the sixth match was the phrase "your Eagle 3D
Streaming API key" — the PLAIN key — caught by substring. An iframe integration
and a plain streaming URL use neither the Streaming API key nor a token. The
account API key stays under Control Panel Features, where `analytics-api`,
`api-reference`, `apps-and-versions`, `plans-and-billing` and `health-check-api`
all need it; the Streaming API key and tokens belong to `sdk-secure-the-key`.

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
five levels deep. **The rewrite is finished except for release notes.**

302 Confluence pages became **97 written pages**, with **275 redirect stubs**
covering the old URLs. Verified at each commit: 0 missing images, 0 broken
internal `/wiki/` links, 0 remaining `atlassian.net` links.

**A page that has not been rewritten says so, in a banner.** That disappears
when its fragment is marked `"rewritten": true`.

| section | ported pages in | written pages out | state |
|---|---|---|---|
| Getting Started | 18 | 6 | done |
| System Requirements | 12 | 6 | done |
| App Configuration | 43 | 6 | done |
| Embed Stream into Webpage | 40 | 8 | done |
| Virtual Reality | — | 2 | done |
| Linux Pixel Streaming | — | 3 | done |
| Foundational knowledge | 20 | 6 | done |
| Control Panel Features | 60 | 12 | done |
| Developer Guides | 43 | 30 | done |
| Multiplayer Pixel Streaming | 39 | 8 | done |
| FAQ | 1 | 1 | done |
| What's New | 3 | shell only | **awaiting content from the user** |

**Merging is the point, not a side effect.** The wiki has one page per action,
which is how a reader ends up opening three pages to discover they needed one.
The largest reductions: Multiplayer's 39 pages were four parallel tutorial
tracks repeating the same packaging/upload/play steps under different slugs -
they collapsed to 8. Developer Guides' feature pages merged by decision rather
than by topic (open-url + redirect-to-a-new-url became one page because
*choosing between them* is the content).

**Every merged-away slug keeps working.** Each rewritten fragment lists what it
`replaces`, and `build.js` writes a static redirect stub per old slug -
canonical link, meta refresh, and a visible line so nobody wonders where they
landed.

### What is left

- **What's New is a deliberate shell.** `content/wiki/what-s-new.html` states
  the supported Unreal range and links the three legacy notes. It contains **no
  generated entries by explicit instruction** - the user decides what is exposed
  and writes the wording; the three older notes
  (`new-control-panel-release-note`, `new-payment-system-release-note`,
  `new-features-released-in-the-new-control-panel`) are untouched and still show
  the "not yet rewritten" banner. Do not invent entries here.
- **The Swagger API reference** at `agw.eaglepixelstreaming.com/api-docs`
  (see section 9).
- **The two hand-written guides** (`microphone-settings.html`,
  `fullscreen-button.html`) are still standalone HTML at the site root with
  their own CSS rather than fragments in the template. Pages link to them as
  `/microphone-settings.html`, **not** `/wiki/...` - four links had that wrong
  and were fixed on 2026-09-07.

### Corrections made during the rewrite, worth not re-introducing

- `what-happens-when.html` originally said "Do not enable Pixel Streaming
  Plugin 2" absolutely. That is wrong for UE 5.7+, where PSP2 streams (but
  still never supports browser↔Unreal communication). Corrected to point at
  `plugin-compatibility`, which carries the matrix.
- The FAQ's old "trial lasts 7 days" answer contradicts the current
  usage-based trial documented on `plans-and-billing`. The FAQ now links there
  instead of restating a figure.
- The multiplayer packaging failure ("Unknown Error" on a Launcher engine
  build) was buried at step 7 of the old page. It is now the first thing
  `multiplayer-package` says, because it is the wall everyone hits.

## SEO a writer can edit, per page — `[E3DS-LEARN-SEO]`

Press **SEO** in the editor bar (`?edit=1`, password required) and the panel
edits the page's title, description, keywords, canonical, link-preview image
and indexing.

### It edits the SIDECAR, not the page

`content/wiki/<slug>.json`, not `site/wiki/<slug>.html`. Meta tags written into
the built page would last until the next `node build.js` and no longer — the
same trap `[E3DS-LEARN-SAVE-SOURCE]` already documents for body text. So the
panel says **"Saved. Run node build.js to rebuild the page with it."** rather
than implying the page changed.

The save **merges**. `title`, `slug`, `section`, `parents`, `order`, `source`
and everything else are untouched: rewriting the file wholesale would make an
SEO edit capable of silently unparenting a page or moving it out of its section.

### Every field is optional, and every fallback is what the build already did

There are 100 pages in `content/wiki` and **none of them had any of these
fields**. Anything that changed their output would have been a hundred silent
changes from a feature nobody had used. Verified by diffing a built page before
and after: the only difference is the new Open Graph block, which is *added*
markup. The meta description is byte-identical.

| field | when empty |
|---|---|
| `seoTitle` | `<title>` = `"<Page title> — Eagle 3D Streaming"`, as before |
| `description` | the generated first sentence, as before |
| `keywords` | **no tag at all** — an empty keywords tag declares the page is about nothing |
| `canonical` | `source` (the old docs URL), as before |
| `ogTitle` / `ogDescription` | follow the two above |
| `ogImage` | **omitted**, and the Twitter card drops to `summary` — claiming `summary_large_image` with no image renders a blank space where the picture should be |
| `index` | **`noindex,nofollow`** |

### INDEXING IS OPT-IN, PER PAGE, AND STAYS OFF BY DEFAULT

The hardcoded `<meta name="robots" content="noindex,nofollow">` is now
`{{robots}}` — **but it still resolves to noindex for every page** unless that
page's JSON has `"index": true`. That was deliberate: making a page indexable is
*publishing* it, and doing that to a hundred unreviewed pages as a side effect
of adding an editor would be the opposite of what was asked.

It is written as an opt-**in** so a typo, a missing field or a malformed value
all fail the safe way — hidden, not published.

**The launch checklist in `site/robots.txt` still applies and is still the thing
to follow.** This only lets one page be opened up early, deliberately. The panel
says so, in the warning beside the checkbox: ticking it does **not** remove the
site-wide block in `robots.txt`.

### Two traps found while building this, both worth keeping

1. **`describe()` used to escape its own output.** That was right while it was
   the only source of the description. The moment a writer could supply one too,
   one path was escaped and the other was not — and escaping at the substitution
   to cover the raw one **double-escaped** the generated one: `&mdash;` shipped
   as `&amp;mdash;` and rendered as literal text. `describe()` now returns raw
   text and escaping happens once, at the point of use.
2. **The build substitutes placeholders inside HTML comments too.** A comment
   that mentioned `{{robots}}` by name got a real `<meta>` tag substituted into
   it. The template's comment now describes the placeholder without naming it.
   (`[E3DS-LEARN-TEMPLATE]` already documents the related trap of the comment
   itself surviving into output.)

### The slug is treated as hostile

It arrives from the browser, and it becomes a file path that is read and then
written. One path segment, `^[a-z0-9][a-z0-9-]*$`, or the request is refused —
without it, `../../editor-password` is a file read and a file write. The
password is required to **read** as well as to write: most values are visible in
the page's own head, but `index` and an unpublished canonical say what is
*planned* rather than what is shipped, on a site that is deliberately not public.

Every save backs the sidecar up to `.backups/meta.<slug>.<stamp>.json`, matching
the existing content-save behaviour.

### VERIFIED

Against a second instance on port 6511 (the live one on 6500 left alone), with
the real password:

- wrong password → 403; `../../editor-password` and `a/b` → refused as not a
  slug; unknown page → 404 naming the missing file
- save → merge confirmed: the seven pre-existing keys survived untouched
- `index: false` is stored as **absent**, not `false`
- an emptied field is **removed**, not stored as `""` — and after clearing every
  field the built page is byte-identical to before this change existed
- opting one page in produced `index,follow` on **that page only**; the other
  102 stayed `noindex,nofollow`
- `ogImage` set → `twitter:card` became `summary_large_image`
- the editor script parses, and the injected editor carries the panel
- the live site was restarted and serves 200 locally and publicly

**NOT verified:** nobody has clicked through the panel in a browser — the
endpoints were driven directly. The test page's sidecar was restored to its
exact original bytes afterwards, so no test content remains.
