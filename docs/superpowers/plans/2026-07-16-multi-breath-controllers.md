# Multiple Breath Controllers Implementation Plan (v1.1)

> **For agentic workers:** executed via superpowers:subagent-driven-development, one task at a time, with review between tasks.

**Goal:** When the EMEO's breath controllers (CC2/CC11/CC7) carry *different* values, draw them as separate colour-coded curves in the same lane with colour-matched value labels; when identical (the normal case), keep the single green curve.

**Design:** `docs/superpowers/specs/2026-07-15-emeo-live-monitor-design.md` §15 (authoritative — read it).

**Baseline:** branch `feat/live-monitor`, 185 tests / 21 files green, `tsc -b` + `oxlint` + `vite build` clean.

## Global Constraints (carried from v1 — every task obeys these)

- `src/core/**` never imports from `src/ui/**`, `src/i18n/**`, or `react`; never touches the DOM. A boundary test enforces it.
- No hardcoded user-facing text in `src/ui/**` — every string via `t()` with a key in `en.json`+`fr.json` (keys are compile-checked via the i18next augmentation).
- CSS Modules + design tokens only; no inline themable styles, no CSS-in-JS.
- React must never re-render at frame rate; breath samples go to ring buffers, never `useState`.
- No persistence of any kind.
- Breath values stay raw 0–127 in `core/`.
- Never `any`, `@ts-ignore`, or a type-hiding cast.
- Toolchain: React 19, Vite 8, TS 6 (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`), Vitest 4 + jsdom, oxlint (`// oxlint-disable-next-line`). Vitest globals on.
- The **stable-array / stable-object contract**: anything read at frame rate by Stage/History is created once and mutated in place, never replaced.

## Key values (verbatim)

- `DIVERGENCE_TOLERANCE = 2` (frame diverges when max−min value > 2).
- Palette (dark surface `#0e1117`, validated): Breath `#34d399` (existing `--color-breath`), Expression `#eda100`, Volume `#9085e9`. Fixed order, never cycled.
- CC → friendly i18n key: 2→`controllers.breath`, 11→`controllers.expression`, 7→`controllers.volume`, 1→`controllers.modulation`; channel-pressure→`controllers.pressure`; anything else → no friendly name (show `CC<n>`).
- Label format: friendly ? `` `${t(key)} (CC${n})` `` : `` `CC${n}` `` (channel-pressure with no CC number shows just the friendly name).

---

### Task V1 — Detector tracks the breath *family*

**File:** `src/core/midi/breathSource.ts` (+ test). **Design:** §8, §15.1.

Today `BreathDetector` locks exactly one source and stops. Extend it to keep qualifying additional controllers while preserving the primary.

**Produces:**
- `get resolved(): BreathSourceId | null` — unchanged: the **primary** (first source to clear thresholds).
- `sources(): BreathSourceId[]` — every source that has qualified, **primary first, then in qualifying order**. Empty before any lock.
- `breathValueOf(msg: MidiMessage): { source: BreathSourceId; value: number } | null` — value for **any** already-qualified source the message belongs to (generalises `valueOf`). `valueOf` stays as the primary-only accessor (may delegate to the new logic).

**Behaviour:** `observe` keeps scoring after the primary locks; a second/third controller that clears the thresholds is appended to the qualified set. The primary never changes once set. `reset()` clears the whole set.

**Tests (add; keep all existing passing):**
- Two controllers sweeping identically → `sources()` returns both, primary (first to cross) first.
- `resolved` still returns only the primary and never changes when a later source qualifies.
- `breathValueOf` returns `{source,value}` for each qualified source, `null` for an unqualified or non-breath message, `null` before any lock.
- A third controller qualifying later is appended, order preserved.

Commit. Run `npm test`, `tsc -b`, `oxlint`.

---

### Task V2 — Breath event carries its source; connection publishes per-source

**Files:** `src/core/model/events.ts`, `src/core/midi/connection.ts` (+ their tests, and fix any consumer the type change breaks). **Design:** §15.1.

- `events.ts`: the breath variant becomes `{ kind: 'breath'; source: BreathSourceId; value: number; t: number }`. Import the type from `../midi/breathSource`.
- `connection.ts` `handle()`: replace the `valueOf`-based publish with `detector.breathValueOf(msg)`; when non-null publish `{ kind:'breath', source, value, t }`. Every qualified source that a message matches now publishes.
- App reads `event.value` today and still compiles (the field remains); leave App on the single ring until Task V7 — the suite must stay green between tasks.

**Tests:** connection publishes a breath event **per qualified source** with the correct `source` tag; primary still drives (existing breath-lock test adapted for the new shape); existing note/raw behaviour unchanged. Update `connection.test.ts` and any test asserting the old breath shape.

Commit + full-suite green.

---

### Task V3 — Synthetic EMEO emits the three controllers

**File:** `src/dev/syntheticEmeo.ts` (+ test). **Design:** §15.4.

Extend the synthetic to mirror the real hardware: each breath frame emits **CC2, CC11, CC7 with identical value** (same timestamp), by default. Add an option `{ diverge?: boolean }` (and a `?diverge` wiring later in main.tsx, Task V7) that offsets Expression/Volume from Breath by a clear, sustained amount (e.g. Expression = value scaled ×0.6, Volume = value − 30 clamped) so the split view is exercisable.

Keep the existing single-controller default? No — default is now all three identical (this is what the real instrument does). Update existing synthetic tests: detection still locks CC2 (emitted first each frame); breath events now arrive for all three once qualified.

**Tests:** default emits CC2/CC11/CC7 identical per frame; detector `sources()` ends with all three; `diverge:true` makes at least one frame's max−min exceed `DIVERGENCE_TOLERANCE`; the channel-pressure option (if still supported) still works or is removed cleanly.

Commit + suite green.

---

### Task V4 — Controller identity: labels, colours, tokens, i18n (pure UI module)

**Files:** `src/ui/controllerIdentity.ts` (new, + test), `src/styles/tokens.css`, `src/i18n/locales/{en,fr}.json`, `src/i18n/i18n.test.ts` (parity already covered). **Design:** §15.1–15.2.

- `tokens.css`: add `--color-expression: #eda100;` and `--color-volume: #9085e9;` alongside `--color-breath`.
- i18n keys (both locales, keep parity): `controllers.breath` = "Breath"/"Souffle", `controllers.expression` = "Expression"/"Expression", `controllers.volume` = "Volume"/"Volume", `controllers.modulation` = "Modulation"/"Modulation", `controllers.pressure` = "Pressure"/"Pression".
- `controllerIdentity.ts` (imports nothing from react/DOM; may import the `BreathSourceId` type):
  - `friendlyKey(id: BreathSourceId): 'controllers.breath' | ... | null` per the CC→key map above.
  - `controllerLabel(t: TFunction, id: BreathSourceId): string` producing the `Breath (CC2)` / `CC14` / `Pressure` strings. (Type `t` via i18next's `TFunction` — no `any`.)
  - `SERIES_COLOR_VARS = ['--color-breath', '--color-expression', '--color-volume'] as const` and a helper `seriesColorVar(index: number): string` that returns the var for the series index, clamping/repeating-safely for a hypothetical 4th (fold to last or `--color-breath` — but never crash).

**Tests:** friendly + CC formatting for CC2/CC11/CC7, unknown CC → `CC14`, channel-pressure → `Pressure`; colour-var by index; i18n parity (existing test covers new keys automatically).

Commit + suite green + `tsc -b` (the new i18n keys must type-check).

---

### Task V5 — Divergence tracker (pure)

**File:** `src/ui/breathDivergence.ts` (new, + test). **Design:** §15.1.

A pure, frame-grouping accumulator — no clock, no DOM.

**Produces:**
- `createDivergenceTracker(tolerance: number)` returning `{ observe(sourceKey: string, value: number, t: number): void; lastDivergenceT: number }` where `lastDivergenceT` is `-Infinity` until a diverging frame is seen.
- Frames are grouped by `t`: samples with the same `t` accumulate into the current frame; when a sample with a new `t` arrives, the completed frame is evaluated (max−min of its values > tolerance → set `lastDivergenceT` to that frame's `t`).
- `isSplit(now: number, lastDivergenceT: number, windowMs: number): boolean` = `now - lastDivergenceT <= windowMs`.

**Tests:**
- Identical frames (CC2/CC11/CC7 same value, same t) → `lastDivergenceT` stays `-Infinity`.
- A frame whose spread > tolerance → `lastDivergenceT` = that frame's t.
- Spread exactly == tolerance → no divergence (strictly greater).
- Sequential same-t messages are one frame (not three single-value frames); cross-frame values are never compared.
- `isSplit` true within window, false once `now - lastDivergenceT > windowMs`.

Commit + suite green.

---

### Task V6 — Stage renders multiple curves

**Files:** `src/ui/Stage/geometry.ts` (readTokens), `src/ui/Stage/draw.ts`, `src/ui/Stage/Stage.tsx` (+ geometry test). **Design:** §15.3.

- `geometry.ts` `readTokens`: also read `--color-expression` and `--color-volume` into the tokens object (canvas can't read CSS vars — resolve once, as with the others). Extend `StageTokens`.
- `draw.ts` `drawStage`: accept an **ordered list of breath series** `Array<{ ring: BreathRing; color: string }>` plus a `split: boolean`, plus the primary ring for the meter.
  - `split === false`: draw only the primary series as the current filled green curve (unchanged look).
  - `split === true`: draw each series as a 2px coloured **stroke, no fill**, in series order (primary first so it sits under). Reuse the existing point-walk; only the fill/stroke style differs.
  - Meter unchanged (primary ring). Now-line unchanged.
- `Stage.tsx`: new props — the series list (stable, mutated in place by App) and a way to know divergence. Pass App's `divergenceRef` (a `{ current: number }`) and compute `split = isSplit(performance.now(), divergenceRef.current, visibleWindowMs(geometry))` each frame. Keep the `paused`/`contentToken` frame-gating exactly as is. Read `isSplit`/`visibleWindowMs` — `isSplit` from `../breathDivergence`.

No canvas unit tests (jsdom has no context); geometry additions get a unit test; rely on `tsc -b`, `oxlint`, and the Task V7 integration test + manual check.

Commit + suite green.

---

### Task V7 — App wiring, readout, `?diverge`, integration + manual verify

**Files:** `src/ui/App.tsx`, `src/ui/BreathReadout/BreathReadout.tsx` (+ CSS), `src/main.tsx`, `src/ui/App.test.tsx`. **Design:** §15 whole.

**App:**
- Replace the single `ring` with a **stable ordered structure** of tracked series, created once and mutated in place: `series: Array<{ key: string; id: BreathSourceId; color: string; ring: BreathRing }>`. On a `breath` event, find/create the series for `event.source` (append in arrival order; assign colour by index via `seriesColorVar`), push the sample into its ring, and feed the divergence tracker (`observe(key, value, t)`).
- Keep a `divergenceRef` (`useRef`) mirroring `tracker.lastDivergenceT`, updated on each breath event, read by Stage every frame.
- **Primary unchanged:** meter/history/detection/collapsed-readout still driven by the primary source (`detector.resolved`, i.e. `series[0]`). Detection signal, pause gating, Clear, note handling all stay as in v1.
- **Readout state (throttled, ~12Hz):** compute `split = isSplit(t, divergenceRef.current, windowMs)`; set readout state to either the single primary value (collapsed) or an ordered list `Array<{ label, colorVar, value }>` (split). `label` via `controllerLabel(t, id)`. Only React state — updated at throttle rate, never per sample.
- Clear resets rings + divergence tracker (`lastDivergenceT = -Infinity`) and the readout; must not reset `detected` (§7.5). Pass `contentToken` to Stage as before.

**BreathReadout:** accept the collapsed single value (as today) OR a split list; when split, render a stacked list of colour-matched `● Breath (CC2)  87` rows — dot + label + value, coloured per §15.2 (the label text coloured per the user's instruction; use the series colour var). Keep the `detecting` prompt behaviour. New CSS in the module; tokens only.

**main.tsx:** wire `?diverge` to pass the synthetic's diverge option (only meaningful with `?synthetic`).

**Integration tests (App.test.tsx):**
- Identical controllers (default synthetic) → readout shows a single value; no split labels appear.
- `diverge` synthetic → after enough time, the split readout shows the three colour-matched labels (`Breath (CC2)`, `Expression (CC11)`, `Volume (CC7)`), and collapses back after divergence would scroll past the window. (Drive `vi` timers; assert on the readout DOM, since canvas isn't assertable in jsdom.)
- Pause still freezes the readout; Clear still doesn't re-prompt detection.

**Manual verify (do it for real):** `npm run dev`, open `?synthetic&diverge&debug`, Connect: confirm the lane splits into green/amber/violet strokes with matching coloured labels while diverging, and collapses to one green curve when identical. Then `?synthetic&debug` (no diverge): confirm it stays a single green curve. Report what you saw.

Commit + `npm test` + `tsc -b` + `oxlint` + `vite build` all green.

---

## After all tasks
Final whole-branch review of the increment (diff vs the v1.1 base), then fold Minor findings and update the ledger.
