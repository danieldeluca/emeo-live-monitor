# EMEO Live Monitor — Technical Design

**Status:** Draft for review
**Date:** 15 July 2026
**Implements:** `specifications/EMEO-Live-Monitor-Business-Spec.md` v1.0
**Supersedes on layout:** §142–150 of the business spec (see [Deviations](#3-deviations-from-the-business-spec))

---

## 1. Purpose

This document describes **how** the EMEO Live Monitor is built. The business spec describes what it
must do and deliberately leaves technology open (§15). This design fills that gap and records the
decisions taken during brainstorming, including several places where we consciously depart from the
business spec.

The single most binding constraint is business spec §202:

> Designing v1's connection and data handling cleanly (as a reusable core) will make these follow-ons
> much easier.

That is the only line in the business spec that constrains code structure, so it is treated here as
the primary architectural requirement. Every decision below follows from one rule: **the core must
not know the UI exists.**

---

## 2. Decisions at a glance

| Area | Decision |
|---|---|
| Stack | React + TypeScript + Vite |
| Backend | None. Static build, HTTPS or localhost hosting only. |
| Transport | None. MIDI arrives in-process via Web MIDI; an in-process event bus fans it out. |
| Time axis | Vertical. Time flows downward; now-line near the top. |
| Notes | Falling blocks ("Guitar Hero"), pitch on the horizontal axis. |
| Breath | Rotated lane beside the notes, sharing the same time axis, plus a live meter and a numeric readout. |
| Note names | English and solfège shown **simultaneously**. No toggle. |
| History | Right-hand column, labels synced to their note blocks, drifting down and fading. |
| Raw monitor | Browser console, behind a debug flag. Not a UI panel. |
| Rendering | Canvas for the stage geometry; DOM for history labels. |
| Styling | CSS Modules with custom-property design tokens. |
| i18n | react-i18next, `en` + `fr`. |
| Tests | Vitest, plus a synthetic EMEO for hardware-free development. |

---

## 3. Deviations from the business spec

These are deliberate. Each replaces a requirement with something that serves the same underlying goal
better. They are recorded here so they read as decisions, not oversights.

### 3.1 The raw monitor moves to the console (FR-13, §88–89, §150)

The business spec asks for a UI panel listing incoming messages, newest first.

§89 gives the panel two jobs: reassure the user data is flowing, and let the developer confirm the
encoding. The first is already served better by the live breath number, meter, and curve — if those
move, data flows. That leaves only the developer's job (§54), for which the browser console is a
better instrument than a cramped panel: filterable, searchable, copy-pasteable, and free.

**Consequence:** an end user has no in-app way to inspect raw messages. We accept this. The
diagnostic audience is the developer.

**Constraint:** the logger is **off by default**, behind a debug flag. Breath arrives many times per
second, and `console.log` serializes its argument and — with DevTools open — retains a reference to
it, defeating garbage collection. Left enabled in the hot path it measurably costs FR-16's smooth
motion.

### 3.2 The notation toggle is removed (FR-7)

FR-7 requires a toggle between standard and solfège naming. A toggle exists only on the assumption
that both cannot be shown at once. Showing `A♯4` with `La♯4` beneath it costs a line of text and
removes the toggle, its state, and its persistence. Nothing is ever hidden from the user.

The underlying goal of FR-7 — that a player can read names in the system they know — is fully met.

### 3.3 The recent-notes strip becomes the history column (FR-9, §149)

§149 assumes a static note display, which needs a separate strip to carry history. It is satisfied
here by the history column (§7.3), which shows more than the strip specified: both naming systems,
and alignment to the breath that produced each note.

### 3.4 Screen regions (§142–150)

§144 states that exact placement is left to design. The region list in §146–150 is treated as a list
of capabilities that must exist, not a layout. The layout is specified in §7 of this document.

### 3.5 The breath curve is vertical, not horizontal (§81)

§81 describes the breath curve "like a heart-rate monitor", which is conventionally horizontal. This
is read as an analogy for the *feel* of a live scrolling readout, not a mandated axis. A horizontal
breath curve cannot share a time axis with vertically falling notes, and §85's combined timeline is
judged the more valuable of the two.

---

## 4. Architecture

### 4.1 Module structure

```
src/
  core/                     ← zero UI knowledge; the reusable core of §202
    midi/
      access.ts             ← support + secure-context checks, requestMIDIAccess
      connection.ts         ← port selection, state machine, disconnect handling
      decode.ts             ← raw MIDI bytes → domain events
      breathSource.ts       ← FR-14 detection
    model/
      events.ts             ← event vocabulary
      pitch.ts              ← MIDI number → { en, eu, octave }
      ringBuffer.ts         ← fixed-size breath sample store
    bus.ts                  ← in-process pub/sub
  ui/
    Header/                 ← connection state, pause, clear
    Stage/                  ← canvas: meter, breath lane, note lane
      timeToY.ts            ← shared time→pixel mapping
    History/                ← DOM labels, dual notation
  i18n/                     ← react-i18next, locales/{en,fr}.json
  debug/
    consoleLogger.ts        ← flag-gated raw log
  dev/
    syntheticEmeo.ts        ← fake instrument (§11.2)
```

### 4.2 The core boundary

**`core/` may never import from `ui/`, and never touches the DOM.** It accepts MIDI and emits typed
events. It has no React dependency.

Every future tool in §12 — the breath coach, the sight-reading trainer, the analytics — imports
`core/` unchanged and subscribes to the same events. If this rule ever needs bending, the design is
wrong and should be revisited rather than the rule.

### 4.3 The event bus

`bus.ts` is a small publish/subscribe implementation: producers do not know their consumers, and
multiple consumers read the same stream independently (the stage, the history column, the console
logger, and later the network or storage).

This is deliberately **in-process**. A message broker or WebSocket transport would move data between
a producer and a consumer that live in the same tab, adding latency to an app whose stated quality
bar is that it feels instantly connected to the player (§37, §101, FR-16).

A network transport becomes relevant only if the instrument and the display are on different
machines — for example a teacher observing a student remotely. That is not on the §12 roadmap. If it
is ever wanted, it enters as one more bus subscriber and the core is unchanged.

---

## 5. Event vocabulary and connection state

```ts
type EmeoEvent =
  | { kind: 'note-on';  note: number; velocity: number; t: number }
  | { kind: 'note-off'; note: number; t: number }
  | { kind: 'breath';   value: number; t: number }    // raw 0–127
  | { kind: 'raw';      data: Uint8Array; t: number }
```

Breath remains raw 0–127 in the core; normalisation is the UI's concern. The readout's "of 127" is
therefore not decoration — it reports the instrument's actual resolution.

The `raw` event exists so the console logger is an ordinary subscriber rather than a special case
wired into the MIDI handler.

```ts
type ConnectionState =
  | { status: 'unsupported'; reason: 'no-web-midi' | 'insecure-context' }
  | { status: 'idle' }
  | { status: 'requesting' }                     // permission prompt open
  | { status: 'choosing';  ports: PortInfo[] }   // FR-4
  | { status: 'connected'; port: PortInfo }
  | { status: 'lost';      port: PortInfo }      // FR-17
  | { status: 'error';     error: EmeoError }
```

This encodes §67's required states as a discriminated union, so the header cannot render "Connected"
without a port to name, and FR-5's plain-language explanation has a specific `reason` to explain.

---

## 6. The time model

Every MIDI event carries `timeStamp`, a `DOMHighResTimeStamp` sharing the clock of
`performance.now()`. **We use that, never the time the handler ran.** If the tab hitches, events
queue; timestamping on arrival would draw them as a flat clump and fabricate a breath shape that
never occurred.

One function maps time to pixels. Both the canvas and the DOM history labels call it, so their
alignment is exact by construction:

```ts
const y = nowLineY + (performance.now() - t) * pxPerMs;
```

- `pxPerMs` — scroll speed. Starting value **0.06 px/ms**, giving roughly a 15-second visible window
  on a 900px-tall stage. Tunable during development against real playing; it is a constant, not a
  user-facing control in v1.
- Visible window — `(height - nowLineY) / pxPerMs`.
- `nowLineY` — starting value **10%** of stage height, leaving 90% for history.

**This formula is why the layout choice pays off.** For the §196 sight-reading trainer, a note yet to
be played has `t > now`, the subtraction goes negative, and `y < nowLineY` — it renders above the
line and descends toward it. Same function, no branch. Moving `nowLineY` down the screen turns the
monitor into the trainer.

### 6.1 Buffers

Breath samples land in a preallocated ring buffer — parallel `Float64Array` for time and
`Float32Array` for value — sized to the visible window plus headroom. No allocation in the hot path,
therefore no garbage-collection pauses mid-phrase.

Notes live in a small array, pruned once they scroll past the bottom edge.

---

## 7. Rendering

### 7.1 The division of labour

Canvas draws the breath curve and note blocks: pure geometry that must be exact every frame. The
history column stays real DOM, one element per note, positioned with a `transform`. Labels therefore
remain accessible, selectable, styleable, and translatable.

**React must never re-render at frame rate.** Breath arrives faster than the browser paints, so
routing samples through `useState` would cause a render per sample and stutter precisely when the
player blows hardest — the moment the app most needs to feel alive. The core writes to the ring
buffer; a `requestAnimationFrame` loop reads it; React re-renders only for state humans change
(connection, pause, clear).

### 7.2 Layout

- **Header** — app name, connection state, Connect/Disconnect, Pause/Resume, Clear (FR-1, FR-2, FR-3, FR-15).
- **Stage** — the body, and the visual focal point per §148:
  - live breath meter (FR-10),
  - breath lane: time downward, breath deflecting horizontally, with the numeric readout at the top
    where the curve is born (FR-11, FR-12),
  - note lane: falling blocks, pitch on the horizontal axis (FR-6, FR-8).
- **History column** — right-hand side (§7.3).

### 7.3 The history column

Newest at top; the current note is simply the newest entry, rendered largest. Each label sits at the
same `y` as its note block and drifts down with it, fading as it ages. Distance between labels is
therefore elapsed time: a held note leaves a visible gap, a fast run bunches tight.

Each entry shows both naming systems, e.g. `A♯4` over `La♯4`.

**Collision rule:** below a minimum vertical spacing, colliding labels are **dropped, not
overlapped**. A fast run shows blocks without labels rather than unreadable overlap.

### 7.4 The numeric readout

Throttled to 10–15 Hz. This is a readability requirement before it is a performance one: a numeral
updating 200 times a second cannot be read. The curve consumes every sample; the number does not.

### 7.5 Pause and Clear semantics (FR-15)

**Pause freezes the display, not the instrument.** The `requestAnimationFrame` loop stops; the core
keeps running, because connection state (FR-2), disconnect detection (FR-17), and breath detection
(FR-14) must continue to work while paused. Samples keep flowing into the ring buffer and overwrite
the oldest as normal.

Consequently, **resuming jumps to the present** rather than replaying the gap. This follows from
§92's purpose — pausing exists so a player can study the phrase just played, not to record one. A
pause longer than the visible window (§6) means the whole buffer has turned over, and resuming shows
an entirely fresh view. That is correct and expected.

The frozen picture is exactly what was on screen at the moment of pause, including history labels.

**Clear** empties the ring buffer, the note array, and the history column, and resets the stage to
the empty state. It does **not** disconnect, and does **not** reset breath detection — a detected
breath source survives Clear, since re-detection would force the player to blow again for no reason.

### 7.6 Canvas and design tokens

Canvas cannot read CSS custom properties. Token values are read once via `getComputedStyle()` at
initialisation and cached, and re-read on theme change. Without this the stage silently ignores the
design tokens.

---

## 8. Breath source detection (FR-14)

**CC2 is not hard-coded, and carries no special weight.** The MIDI standard assigns CC2 to Breath
Controller, but wind controllers variously use CC2, CC11 (Expression), or channel pressure — which is
not a control change at all. Assuming wrongly yields a dead breath curve with no diagnosis.

`breathSource.ts` subscribes to the raw stream and scores every candidate — each CC number observed,
plus channel pressure — over a rolling 3-second window:

| Signal | Why it discriminates |
|---|---|
| Update rate | Breath streams continuously while blowing; a mod wheel does not. |
| Distinct values | Breath sweeps many values; a switch sends two. |
| Range covered | Breath spans most of 0–127. |

**The first candidate to clear all three thresholds wins** — ≥20 updates, ≥8 distinct values, range
≥32, within the window — and stays locked for the session. Evidence alone decides; CC2 gets no
preference.

> **Revised during implementation (15 July 2026).** This originally read: *"CC2 receives a prior, not
> a guarantee: if CC2 qualifies it wins ties immediately."* That rule proved unimplementable.
> Detection evaluates once per incoming message, and two controls can never cross the thresholds on
> the *same* message — so whichever crosses first always wins and the tie-break was unreachable code.
> A prior would require deferring the decision behind a settle window, adding a state machine for
> negligible benefit: any control that clears these thresholds while someone is playing a wind
> instrument *is* the breath, and if an instrument mirrors breath onto two controls, both carry
> identical data and either yields a correct curve. The only cost is that such an instrument might be
> reported to the console as CC11 rather than CC2, very slightly muddying §12.1's documentation goal.

Until a source locks, the UI reads *"Blow into the EMEO to detect the breath control"* and the
console prints the candidate scoreboard. The lock holds for the session. `resetBreathDetection()` is
exposed for debugging.

---

## 9. Error handling

Each state maps to a specific plain-language message (FR-5). No generic failures.

| State | Message intent |
|---|---|
| `insecure-context` | Web MIDI requires HTTPS or localhost. Say so. |
| `no-web-midi` | Name the browsers that work. Support is verified at implementation time, not asserted from memory. |
| Permission denied | The prompt was dismissed; offer a retry. |
| No ports found | Instrument not detected. Note that a cable is most reliable (§185), and that Bluetooth MIDI must be paired at OS level before any browser can see it. |
| `lost` (FR-17) | **Freeze the curve; do not clear it.** If the instrument drops mid-phrase, the player wants to see the phrase that was playing. Listen for `statechange` and enable Reconnect when the port returns. |

---

## 10. i18n and styling

`react-i18next` with `en` and `fr` locales. Every UI string sits behind a key. Current setup
documentation is fetched via Context7 at implementation time rather than written from memory.

**Note names are not translations.** `A♯4` and `La♯4` are parallel naming systems, shown to every
user regardless of locale — this is what removed the FR-7 toggle. The labels around them ("NOW",
"BREATH", "of 127") are translated. Recorded explicitly because someone will otherwise "fix" this by
moving note names into the locale files and break the dual display.

Styling uses CSS Modules with design tokens as CSS custom properties.

---

## 11. Testing

### 11.1 Unit tests (Vitest)

- `pitch.ts` — edge cases 0 and 127, sharps, octave numbering.
- `ringBuffer.ts` — wraparound.
- `timeToY.ts` — including negative offsets (future notes), guarding the trainer's reuse.
- `breathSource.ts` — scoring against scripted streams on CC2, CC11, and channel pressure.
- `decode.ts` — fixture byte arrays.
- `connection.ts` — the state machine against a fake `MIDIAccess`.

Stage geometry is computed by pure functions and tested. The canvas draw calls are not.

### 11.2 The synthetic EMEO

`dev/syntheticEmeo.ts` is a fake MIDI input emitting a scripted performance: notes, breath sweeps,
phrases.

It matters because the EMEO's encoding cannot be confirmed until hardware is connected (§187).
Without it, every piece of UI is blocked on hardware and on a person physically blowing to generate
test data. With it, the app is buildable and testable in CI, and detection can be proven against
encodings a single real instrument cannot produce. It doubles as a demo mode.

**It removes hardware from the build loop, not from the validation loop.** It cannot tell us we
guessed the EMEO correctly.

---

## 12. Assumptions to verify against real hardware

1. **Which control carries breath.** Unknown (§187). Detection handles this at runtime; the console
   session confirms it.
2. **Octave numbering.** This design uses scientific pitch notation: MIDI 60 = C4 = middle C. Yamaha's
   convention names that C3. If the player's sheet music uses the other, every octave number is off
   by one.
3. **Transposition.** A saxophone is a transposing instrument; on an alto, a written C sounds concert
   E♭. Whether the EMEO transmits written or concert pitch is unknown. **v1 displays exactly what the
   EMEO sends.** This matters greatly for the §196 sight-reading trainer and is cheap to record now.
4. **Breath resolution.** Whether the EMEO uses the full 0–127 range is unconfirmed. The readout shows
   the raw value against 127 rather than a rescaled percentage, so the truth is visible.
5. **Bite / additional expression data.** §187 raises the possibility. Any unrecognised messages flow
   through as `raw` events and appear in the console log; nothing is silently discarded.

---

## 13. Out of scope for v1

Per business spec §40–46: no audio synthesis, no lessons or scoring, no accounts or cloud storage, no
device configuration, no mobile-first requirement.

Additionally out of scope by this design: no session recording or export, no persistence of any kind
(including `localStorage`), and no musical staff view. The note lane conveys pitch position; a staff
would raise the transposition question in §12.3 before we have the evidence to answer it.

---

## 14. Definition of done

Business spec §166–177 applies unchanged, with two amendments arising from §3 of this document:

- "The raw monitor shows readable incoming messages" is met by the **console logger** with the debug
  flag enabled.
- "Notation can be switched between standard and solfège" is met by **both being shown at once**.
