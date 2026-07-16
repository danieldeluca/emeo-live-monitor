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

> **First hardware session — 16 July 2026.** A real EMEO was connected over USB and its raw MIDI
> captured via the `?debug` console. Findings are recorded inline below. Items 1, 4, and 5 were
> confirmed in the first capture; a **second capture the same day** (a known **written C-major
> scale**) closed item 3 (transposition) and informed item 2 (octave). **All five are now resolved.**

1. **Which control carries breath.** **CONFIRMED.** The EMEO transmits breath on **three controllers
   at once, with identical values**: CC2 (Breath Controller), CC11 (Expression), and CC7 (Volume),
   emitted in that order every frame. Runtime detection locks **CC2** — each frame sends it first, so
   it crosses the thresholds a message ahead of the other two. This vindicates both runtime detection
   (a CC2-only hard-code would have been right by luck) and the removal of the CC2 prior in §8 (the
   three are byte-identical, so the choice is immaterial to the curve). Future tools may read any of
   the three; they carry the same data.
2. **Octave numbering.** **Informed.** This design uses scientific pitch notation: MIDI 60 = C4 =
   middle C. The written C-major scale in the second capture landed at MIDI 48–59 — displayed C3–B3 —
   i.e. the octave below middle C. The app renders exactly the MIDI numbers received, consistent with
   scientific notation. Whether the app's "C3" label matches what the player reads on the page depends
   only on which written octave was fingered (a display convention, not a hardware fact); the
   note-number mapping itself is settled. No code change needed for v1.
3. **Transposition.** **CONFIRMED: none — the EMEO transmits written (fingered) pitch.** The second
   capture was a **known written C-major scale**; it displayed as C-major naturals (C D E F G A B, no
   accidentals). A transposing instrument applying concert pitch would have shown flats (a written C
   scale sounds E♭ major on an alto, B♭ major on a tenor). Pure naturals means the EMEO sends the
   written note as-is, with no transposition. **v1 already displays exactly this**, so no change is
   needed — and the future §196 sight-reading trainer can treat incoming MIDI as written pitch directly.
4. **Breath resolution.** **CONFIRMED: full 0–127.** The captured stream sweeps cleanly from 0 to 127
   and back on all three breath controllers, so the "of 127" readout reflects the instrument's true
   range rather than a rescaled percentage.
5. **Bite / additional expression data.** **CONFIRMED: none beyond the triple-mirrored breath.** The
   session showed only note on/off (with meaningful attack velocity, e.g. vel 6 soft to vel 127 hard),
   plus CC2/CC11/CC7. No channel pressure, no pitch bend, no bite CC, no other controllers. Nothing is
   hidden; the `raw` event path would have surfaced anything unrecognised.

---

## 13. Out of scope for v1

Per business spec §40–46: no audio synthesis, no lessons or scoring, no accounts or cloud storage, no
device configuration, no mobile-first requirement.

Additionally out of scope by this design: no session recording or export, no persistence of any kind
(including `localStorage`), and no musical staff view. The note lane conveys pitch position; a staff
is a larger feature deferred to a later tool. (The transposition question a staff would raise is now
answered — §12.3: the EMEO sends written pitch — so the deferral is about scope, not missing evidence.)

---

## 14. Definition of done

Business spec §166–177 applies unchanged, with two amendments arising from §3 of this document:

- "The raw monitor shows readable incoming messages" is met by the **console logger** with the debug
  flag enabled.
- "Notation can be switched between standard and solfège" is met by **both being shown at once**.

---

## 15. v1.1 — Multiple breath controllers

The first hardware session (§12.1) found the EMEO transmits breath on **three controllers at once with
identical values**: CC2 (Breath), CC11 (Expression), CC7 (Volume). v1 tracks and draws only the primary
(CC2). This increment shows the others **only when they carry different information** — i.e. when they
diverge — so the common case (identical) stays a single clean green curve.

### 15.1 Behaviour

- **The detector tracks the whole breath *family*, not one source.** Every controller that clears the
  §8 thresholds joins the tracked set; the first to lock stays the **primary** and continues to drive
  the meter, the note-history alignment, the detection signal, and the collapsed numeric readout —
  unchanged from v1. The others are additional buffered series.
- **Each tracked controller gets its own ring buffer.** The breath event now carries a `source`, so App
  routes each sample to the correct ring.
- **Divergence is judged frame-by-frame.** The three CCs share the same MIDI `timeStamp` each frame, so
  samples are grouped by timestamp and a frame *diverges* when its max−min value exceeds
  `DIVERGENCE_TOLERANCE = 2` (ignores ≤2-LSB jitter; catches a genuinely shaped Expression/Volume).
- **Split display follows the scrolling window (the user's "live" choice, made coherent for a history
  graph).** The lane splits into colour-coded curves whenever a divergence is visible *anywhere in the
  ~15s window* — computed in O(1) as `now − lastDivergenceT ≤ visibleWindowMs`. It collapses back to the
  single green curve only once the last divergence has scrolled off the bottom, so the graph never
  erases visible history and never strobes.
- **Labels are `Breath (CC2)` style** — friendly name (translatable) plus the raw CC number, per the
  user's choice. Unknown controllers fall back to `CC14`. When split, the numeric readout becomes a
  short stack of these labels, one per series.

### 15.2 Palette (validated, dark surface `#0e1117`)

Colours are assigned to series in fixed order, never cycled. Chosen to avoid the app's existing colour
semantics — **blue `#4ea3ff` means notes, red `#ff5c5c` is the now-line** — so breath series use green
and warm/violet hues only.

| Series | Controller | Colour | Note |
|---|---|---|---|
| 1 (primary) | Breath (CC2) | `#34d399` green | existing breath colour, unchanged |
| 2 | Expression (CC11) | `#eda100` amber | new token |
| 3 | Volume (CC7) | `#9085e9` violet | new token |

Validated with the dataviz skill's script against `#0e1117`: worst-adjacent CVD ΔE **12.5** (target ≥8),
normal-vision ΔE **21.9** (floor ≥15), contrast **all ≥3:1**. The script's lightness-band check FAILs
because the app deliberately runs bright neon marks on a *darker* surface than the reference's `#1a1a19`
(and the primary green is fixed app identity) — on `#0e1117` "too light" aids rather than harms
legibility, which the passing contrast confirms. Identity is never colour-alone: every series also
carries its text label (the skill's secondary-encoding relief). Per the user's explicit instruction the
value labels are themselves coloured to match their curves (this overrides the skill's default of
text-in-ink-plus-a-coloured-mark).

### 15.3 Rendering

When collapsed, the breath lane draws exactly as v1: one filled green curve. When split, each series is a
2px coloured stroke (no fill — overlapping translucent fills would muddy), so the shapes stay legible
where they cross. The meter continues to show the primary only.

### 15.4 Demo & test support

The synthetic EMEO is extended to emit CC2/CC11/CC7 with **identical** values by default — matching the
real instrument — with an option to make Expression/Volume diverge, so the split view can be exercised in
tests, in CI, and as a `?diverge` demo without hardware.

### 15.5 Still one instrument, still no assumption baked in

If a future EMEO or mode makes the controllers carry genuinely different meaning (e.g. Expression a
shaped curve, Volume a master level), this display already surfaces it and separate *interpretation* can
follow — driven by observed divergence, not assumed now.
