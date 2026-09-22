# How to write a page here

Rules earned the hard way, each one from a real correction on a real page. Read
this before writing or rewriting anything in `content/`.

`CLAUDE.md` covers what this repo is and how it builds. This file covers the
writing itself.

---

## 1. Name things. Do not use pronouns for the company

**Never write "we", "us", "our", "ours".** A reader arriving mid-page has to
stop and work out who is meant, and on a page about two websites talking to each
other the answer is genuinely ambiguous.

| ✗ | ✓ |
|---|---|
| ask us for our list | ask the Eagle 3D page for its list |
| your ids are no use to us | your ids are no use to the Eagle 3D page |
| we take it from there | Eagle 3D Streaming takes it from there |
| an id we gave you | an id from that list |

This applies **inside figures too**, where there is no surrounding sentence to
lean on. A label reading "ids we understand" is worse than one reading "ids the
Eagle 3D page issued", because a diagram is read out of order.

## 2. A stream is a video. It is not a website

"The stream" cannot be the name of one side of a conversation, because both
sides are pages. Written that way it reads as some third thing — a service, a
process, something that is not a web page — and the reader builds the wrong
model from the first paragraph.

| ✗ | ✓ |
|---|---|
| the stream replies | the Eagle 3D page replies |
| the stream's own site | the Eagle 3D website |
| what the stream does with the id | what happens next |

**"Stream" is fine where it really means the video:** "without restarting the
stream", "the stream's control bar", "the picture does not flicker".

## 3. Page and website are different words, and the difference is the point

Permissions and device ids belong to a **website** (an origin), not to a page.
Two pages on the same website share both.

Getting this wrong is not a style problem — it sends a reader hunting inside
their own site for a boundary that is not there. Say **website** when the
subject is a permission, an id, or anything else the browser scopes by origin.
Say **page** when you mean the document on screen.

## 4. Say what is being embedded, and how

"Embed a stream" tells a first-time reader nothing. Name the thing and the
mechanism, once, at the top:

> You have embedded an Eagle 3D Streaming page in an `<iframe>` on your own
> website, and you want …

## 5. Tell it as a story, in order

The failure to avoid: a set of correct facts in separate sections that the
reader has to hold in mind and assemble into a picture themselves. That is
reference material, and it reads as work.

Write the sequence instead, each step depending on the one before:

> 1. Two websites, not one
> 2. The computer has two microphones
> 3. But each website calls them by different names
> 4. So your ids are no use to the Eagle 3D page
> 5. So ask the Eagle 3D page for its list first
> 6. Pick one, and send that id back
> 7. Eagle 3D Streaming takes it from there

Each heading is a step. A reader can stop anywhere and still have gained
something whole.

## 6. Examples must explain themselves

Use names that carry no assumed knowledge.

| ✗ | ✓ |
|---|---|
| headset microphone, built-in microphone | microphone 1, microphone 2 |
| `"a1b2c3…"` | `ID1` |

Anyone who does not already use the term is being asked to decode the example
before they can follow the point it exists to make.

## 7. Show real values, and carry the same one through

**No ellipses in a worked example.** If a message carries an id, give it a
value, and use *that same value* in the reply and in the next message, so a
reader can follow one thing from end to end:

```
micDevices   → deviceId "ID3" = microphone 1, "ID4" = microphone 2
setMicDevice → deviceId "ID4"
micDeviceChanged → ok, deviceId "ID4"
```

`deviceId: "…"` teaches nothing about which value goes where.

## 8. Figures are SVG. Never ASCII

An ASCII box drawing is correct at exactly one text size. Change the zoom, read
it on a phone, or use a different font and the walls land in the wrong places.

Write figures as inline `<svg>` with a `viewBox`, `width: 100%`, `height: auto`
— they stay sharp and keep their proportions at any size. Take colours from the
page tokens (`var(--ink)`, `var(--line)`, `var(--accent)`, `var(--surface)`) so
a figure follows the light and dark themes instead of fighting them. Give every
one a `role="img"` and an `aria-label` describing what it shows, and a
`<figcaption>` saying what to take from it.

The pattern to copy is in
`content/wiki/device-ids-across-the-iframe.html` — the `.fig` styles at the top
of that file are reusable as they stand.

## 9. Draw it wherever a picture beats a paragraph

Reading is slower than looking, and some things resist prose entirely:

- an **order** — what has to happen before what
- a **boundary** — what cannot cross it
- a **decision** — what each answer leads to
- a **flow** — where data actually goes

Prose is for what a picture cannot carry: which error name means which sentence
to show a viewer, what a value should be, what to do next.

## 10. Stop at the boundary. Internals are not the reader's business

What happens inside Eagle 3D Streaming's own code is not part of an
integration. `getUserMedia`, `replaceTrack`, the order tracks are stopped in —
that is engineering detail, and a reader building against the platform does not
need it to do their part.

End at what they can act on:

> Once that id arrives, your part is done. Eagle 3D Streaming captures that
> microphone and sends its audio over WebRTC to your Unreal application.

## 11. The reader's interface is theirs

Do not design their UI for them. Mention it once, at the moment of choosing, and
say it is optional:

> How you choose is entirely yours. A dropdown, a settings screen, or nothing on
> screen at all — your code can simply pick one.

A page about ids should be about ids.

## 12. Say why, not only what

A message being sent has a purpose. Name it:

> your page sends `ID1` across, **meaning capture this microphone and send its
> audio through the stream**

Without the purpose, a reader can follow the steps and still not know what they
are for.

## 13. Fold a long page

Past one screen, a page stops being read and starts being skimmed — and arriving
at a wall of text is tiring before a word of it has been read.

Make each section a `<details class="sect">` with its heading and a one-line
hint, so the page opens as a contents list that can be opened in place. Keep the
heading an `<h2>` **inside** the `<summary>`: the document outline, crawlers and
any table of contents all read headings, and swapping it for a `<div>` to save a
fold costs the page its structure. Open **one** section — the one a first-time
reader must not miss. All open and the fold has bought nothing; none open and
the page looks empty.

## 14. Never explain the same thing twice

Two versions of one explanation drift, and a reader cannot tell which is
current. When a second page needs the same ground, **link** and delete.

## 15. State what is not known

A page that quietly omits an untested case is worse than one that says the case
is untested. Mark **verified** separately from **should work**, and say plainly
when something was not reproduced.

## 16. Troubleshooting: give the whole remedy, in order

Where a fix has steps that only work together, number them and say so. The
standard permission remedy is the example:

> Reset the permissions for **both** websites, then **hard reload**. Both steps,
> in that order — a reset does nothing to the page already open, because the
> permission was read when it loaded. Resetting without reloading looks exactly
> like the reset not working.

And give a symptom table, because failures are not interchangeable: "no
Microphone row at all" and "listed but unnamed" need different actions, and
treating them as one thing sends people round in circles.

## 17. Open with a demo, told as a story that grows one step at a time

**Every page starts by running something.** Not with what the feature is, not
with a table of settings, not with a definition — with one concrete thing a
reader can open, and then the same thing again with one more piece added. The
explanation comes afterwards, when the reader has already watched the behaviour
change and is looking for the reason.

The shape, using the command-line page as the worked case:

| step | what changes | what the reader learns without being told |
|---|---|---|
| 1 | the demo with an empty configuration | there is a default, and it is booth 1 |
| 2 | a configuration holding `-boothno=12` | a parameter changes where the player starts |
| 3 | the empty configuration again, `?appParameters=-boothno=12` on the link | **two places, same result** |
| 4 | add `-pink` | a second parameter, and a different kind of one |
| 5 | add a second and third colour | ball, then cone, then box — position matters |
| 6 | a colour the demo does not know | it is the application that decides, not the platform |
| 7 | configuration says 12, link says 10 | **the link wins** — there is a priority |
| 8 | turn on *Append Parameters To URL* | the priority can be changed to addition |

Step 3 is the one that does the teaching, and it only works because steps 1 and
2 came first. Step 7 teaches precedence in one move, and a reader who has
watched it does not need the word "precedence" explained.

**Rules for the demo:**

- **One thing changes per step.** Two changes at once and the reader cannot
  attribute either.
- **Carry the same values the whole way through.** Booth 12 stays booth 12 until
  the step whose entire point is changing it.
- **Show the result, not a description of the result.** A screenshot of the
  running application after each meaningful step. The reader should be able to
  match what they see on their screen to what is on the page.
- **Give the demo away.** Link the project or source, so a reader can open the
  exact thing the page is describing rather than an approximation of it.
- **Then, and only then, generalise.** After the story, a short section that
  names what just happened: the two sources, the precedence, the switch that
  changes it. That section is short *because* the story did the work.

**Why this rather than explaining first.** A reader who arrives at a definition
has to hold it in mind with nothing to attach it to, and most of them stop. A
reader who has just watched booth 1 become booth 12 already has the question the
next paragraph answers. The page stops being something to study and becomes
something to follow.

---

## Before publishing

- [ ] No "we", "us", "our" — in the prose **or** in the figures
- [ ] "Stream" only where it means the video
- [ ] "Website" where the subject is a permission or an id
- [ ] Reads as a sequence, not a pile of facts
- [ ] Examples need no prior knowledge to follow
- [ ] Real values, carried through — no `"…"`
- [ ] Figures are SVG, theme-coloured, captioned, with an `aria-label`
- [ ] No Eagle 3D internals
- [ ] Long page folded, exactly one section open
- [ ] Nothing explained here that is already explained elsewhere
- [ ] Anything unverified is marked as unverified
- [ ] Opens with a demo told as a story, one change per step, result shown
- [ ] The demo is linked or downloadable, not just described
