# Documentation plan — the tree we are building toward

**This is a PLAN, not a description of the site.** It is built from what the
documentation should be, not from what `content/wiki/*.json` currently says. Do
not regenerate it from the sidecars — that is what `CLAUDE.md` §5 is for.

Built branch by branch, in whatever order suits. A branch marked **FINISHED**
below is settled: its shape, its boundaries and what each page owns. A branch
not listed has not been planned yet.

Last updated 2026-09-12.

---

## FINISHED — `Embed with the Web SDK`

The middle of the Embedding branch. Everything under it is settled.

```
Embed with the Web SDK
│
├── 1 ── Web SDK demo manual
├── 2 ── Set up the Web SDK
│        ├── Streaming API key and tokens
│        ├── Keeping the API key off the browser
│        └── Putting a login in front of a stream
└── 3 ── Web SDK reference
         ├── Why a session ended
         ├── The Unreal side of sending and receiving data
         └── Your own loading and ending screens
```

### The parent — `Embed with the Web SDK`

Short. A landing, not a lesson.

- What the Web SDK is: the stream **is** your page, not an iframe in it.
- The three pages below, in the order most people want them.
- **Why choose it over the other two:** a session starts from a short-lived
  token, so *your server* decides who may start one. A link or an iframe cannot
  be configured into that — the link itself grants access and cannot be revoked
  for one person. This is the argument, not the control surface.
- **What it is built on:** Epic's PixelStreamingInfrastructure frontend, the
  same library that ships with Unreal, plus the part that library has no concept
  of — finding a machine, launching the app, queueing, tokens, expiry. Said
  plainly: it is what a Pixel Streaming developer needs in order to know what
  they can skip.
- The GitHub link.

**Does NOT own:** any instruction. Nobody configures anything on this page.

---

### 1 — `Web SDK demo manual`

**Play only. The reader is asked for nothing: no account, no key, no download.**

- Open the demo. What the first thirty seconds look like, and why there is a
  wait (a machine is found and your app started before there is a picture).
- **Why controls arrive at different times** — always / once there is a session /
  once the data channel is open. Not cosmetic: Volume and Fullscreen keep
  working after a stream ends because they act on the video element; anything
  that must *tell the application* something stops.
- Every control, by group: Picture, Window, Sound, Diagnostics, Session, App.
- **Character and Skin marked as the odd ones out.** Every other control works
  against any application. These two need an app built to receive them — which
  is exactly why they are worth having, and exactly why a reader who tries them
  on their own app will think the SDK is broken unless told first.
- Connection settings, including the note that a key typed into a page is
  readable by anyone with devtools.
- **Control → SDK call**, as a table. The bridge out of playing and into code.

**Does NOT own:** downloading, configuring, keys, or any setup. One exit link.

---

### 2 — `Set up the Web SDK`

**One page, read top to bottom, ending with the reader's own app streaming.**

1. **Get the source code** — GitHub. No key needed yet.
2. **Configure it** — `sdk-config.js`: the Streaming API key, username, app
   name, configuration, version. **The key is needed here, and this is the first
   time.** Links to the key page at the moment of need, not before and not later.
3. **Run it** — double-click `index.html`. No server, no build, no install.
4. **Serve it over `http://`** — collapsed. Not because `file://` is blocked,
   but because that is how the real integration runs.
5. **Move it into your own application** — delete `demo-ui-*`, keep `sdk-*`.

**Does NOT own:** the security change. Going live is a separate job, and putting
it here stalls somebody who just wants a first stream.

#### 2a — `Streaming API key and tokens`

Reached from step 2, at the moment of first need.

- **It is not the account API key.** The account key can delete or replace your
  app; the Streaming API key cannot. One is for the Control Panel and the APIs,
  the other is for streaming.
- Where to get one.
- What a token is: single use, expires, authorises one session.
- **Not needed for a streaming URL or an iframe.** Only this method uses it.

**Does NOT own:** the account API key. That stays under Control Panel Features,
where the analytics, apps, billing and health-check pages need it.

#### 2b — `Keeping the API key off the browser`

The go-live change. Reached when the reader is ready to publish, not while
configuring.

- The problem: anything in a page is readable, and the key does not expire.
- What someone can do with it — sessions billed to your account, from their page.
- The fix: your server holds the key and hands the page a token.
- What changes: one function. Nothing else in the integration moves.

#### 2c — `Putting a login in front of a stream`

Sibling of 2b, because both answer *"am I safe to publish this?"* — one from the
credential side, one from the person side.

- The flow, and **the half people leave out**: the page *holding* the stream must
  verify authentication before it loads anything. Otherwise anyone who knows
  that address walks around the login.
- Credentials are checked **on your server**.
- Gating a *page* versus gating a *session* — only the second survives someone
  reading your page source.

---

### 3 — `Web SDK reference`

**Lookup. Never read end to end. Arrived at by search or by a link.**

- How a session works; `startStream()` and that it reports failure rather than
  throwing.
- Talking to your application: `sendDataToUE`, `sendCommandToUE`,
  `sendConsoleCommandToUE`, and receiving replies. The distinction is *who
  defined the message*.
- Controlling the stream: quality, resolution, fullscreen, mouse and touch,
  volume, screenshots. Plus keyboard input, **stated as iframe-only today**
  rather than omitted — leaving it out makes a reader conclude the feature does
  not exist.
- Lifecycle callbacks — three separate stages, not one progress bar.
- Ending and restarting.
- **These exist and do nothing** — the four callbacks that are offered and never
  fire, and `onRedirectingWithMessage` called out separately because it is
  *renamed*, not dead, and a page still defining it has no handler at all.
- When it does not work.

**Does NOT own:** configuration, keys, the source code, or anything a person
does once. If it is a step, it belongs in Set up.

#### 3a — `Why a session ended`

Every message a session can end with, for the SDK **and** the iframe — so it is
linked from both branches and belongs to neither exclusively.

Includes reacting to a crash and only a crash: `onStreamerDisconnected` fires
only for a crash and carries no text; `onSessionEnding` fires for every ending
and carries the message. Set a flag on the first, read it on the second. Do not
branch on the message text — it is written for a person and the wording changes.

#### 3b — `The Unreal side of sending and receiving data`

The app half, which is where messages actually go missing — a message with
nowhere to arrive fails silently.

- The **Pixel Streaming Input** component, and that an actor cannot send or
  receive without it. Leads, because it is the most common cause.
- Engine / platform / your-code: why `sendConsoleCommandToUE` works perfectly
  while `sendDataToUE` appears to do nothing.
- **Send Pixel Streaming Response** for the return direction, and that
  `onResponseFromUnreal` must be assigned before the stream starts.
- The iframe `cmd` trap. With the missing component, these are the two silent
  failures in the path.

#### 3c — `Your own loading and ending screens`

- **Leads with the constraint:** none of these callbacks can cancel or delay
  anything. Design every screen around the session already being over.
- Loading: `onConfigAcquire` to show, `onDataChannelOpen` to hide.
- Session-expired, and that `onSessionExpired` covers the **time limit only** —
  not a crash, idle timeout, wrong password or expired link.
- A hosted image needs the direct `.png`/`.jpg` URL; a share page fails silently
  into an empty screen.

---

## The rule that keeps this from collapsing back

Each subject has **one owner**, and every other page gets a line and a link.
The four duplications that had to be untangled all came from two pages both
explaining configuration, or both explaining script order, or both explaining
the API key. If a section starts appearing in two places, one of them is wrong.

**The boundaries, stated once:**

    demo manual   play and describe.   Never: download, configure, keys.
    set up        download → ship.     Never: API surface, callbacks.
    reference     events and methods.  Never: steps a person does once.

---

## NOT YET PLANNED

- `Embed with a streaming URL` — the third method has no page at all today
- `Embed with an iframe` — exists, not reviewed against this plan
- `Embedding` (the parent) — exists as a three-method comparison, worth keeping
- Everything outside the Embedding branch
