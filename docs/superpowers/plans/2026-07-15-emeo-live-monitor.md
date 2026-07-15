# EMEO Live Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser app that connects to an EMEO digital saxophone over Web MIDI and displays, in real time, the notes being played and the breath curve driving them.

**Architecture:** A UI-agnostic `core/` module owns Web MIDI access, a connection state machine, message decoding, runtime breath-source detection, and a ring buffer, publishing typed events on an in-process bus. `ui/` subscribes to that bus. The stage renders on a canvas driven by `requestAnimationFrame` reading the ring buffer directly — React never re-renders at frame rate. History labels are DOM elements positioned by the same `timeToY()` function the canvas uses, so their alignment is exact by construction.

**Tech Stack:** React, TypeScript, Vite, Vitest + jsdom, @testing-library/react, react-i18next (en/fr), CSS Modules.

**Design:** `docs/superpowers/specs/2026-07-15-emeo-live-monitor-design.md`
**Business spec:** `specifications/EMEO-Live-Monitor-Business-Spec.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **`src/core/**` must never import from `src/ui/**`, `src/i18n/**`, or `react`.** It must not touch the DOM. This is the reusable core of business spec §202. Task 1 adds a test that enforces it.
- **No hardcoded user-facing text in `src/ui/**`.** Every string goes through `t()` with a key defined in `src/i18n/locales/en.json` and `fr.json`. (User's global rule.)
- **All styling via CSS Modules** (`*.module.css`) using design tokens declared as CSS custom properties. No inline style objects for anything themable, no CSS-in-JS. (User's global rule.)
- **React must never re-render at frame rate.** Breath samples go to the ring buffer, never to `useState`. React state changes only on human-driven events: connection, pause, clear.
- **No persistence of any kind.** No `localStorage`, no `sessionStorage`, no cookies, no server. Static build only.
- **Breath values stay raw 0–127 in `core/`.** Normalisation is the UI's job.
- **Note names are not translations.** `A♯4` and `La♯4` are parallel naming systems, shown together to every user regardless of locale. Never move note names into locale files.
- **Octave numbering is scientific pitch notation: MIDI 60 = C4 = middle C.**
- **v1 displays exactly what the EMEO sends.** No transposition correction.
- **Commit after every task** using conventional commits (`feat:`, `test:`, `chore:`).

## File Structure

| File | Responsibility |
|---|---|
| `src/core/bus.ts` | Generic pub/sub. No domain knowledge. |
| `src/core/model/events.ts` | The `EmeoEvent` union — the core's public vocabulary. |
| `src/core/model/pitch.ts` | MIDI number → `{ en, eu, octave }`. Pure. |
| `src/core/model/ringBuffer.ts` | Fixed-capacity breath sample store. No allocation in `push`. |
| `src/core/midi/types.ts` | Minimal structural interfaces for Web MIDI. Makes fakes trivial. |
| `src/core/midi/decode.ts` | Raw bytes → `MidiMessage`. Pure. |
| `src/core/midi/breathSource.ts` | FR-14 runtime detection of which control carries breath. |
| `src/core/midi/access.ts` | Support + secure-context checks. |
| `src/core/midi/connection.ts` | Connection state machine; wires decode + detection onto the bus. |
| `src/dev/syntheticEmeo.ts` | Fake MIDI access emitting a scripted performance. Unblocks UI + CI. |
| `src/ui/Stage/timeToY.ts` | The single time→pixel mapping. Used by canvas *and* DOM. |
| `src/ui/Stage/geometry.ts` | Pure functions computing what to draw. Tested. |
| `src/ui/Stage/draw.ts` | Canvas calls. Not unit-tested. |
| `src/ui/Stage/Stage.tsx` | Canvas element + rAF loop. |
| `src/ui/History/History.tsx` | DOM labels, dual notation, synced to note blocks. |
| `src/ui/Header/Header.tsx` | Connection state, Connect/Disconnect, Pause, Clear. |
| `src/ui/App.tsx` | Composition root. Owns the connection, wires panels. |
| `src/i18n/index.ts` | react-i18next init with imported resources. |
| `src/debug/consoleLogger.ts` | Flag-gated raw log. An ordinary bus subscriber. |
| `src/styles/tokens.css` | Design tokens as CSS custom properties. |

---

### Task 1: Project scaffold, test harness, and the core boundary test

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`
- Create: `src/core/__tests__/boundary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`; the boundary test that guards every later core task.

- [ ] **Step 1: Scaffold the Vite project**

Run in the project root (it already contains `docs/`, `specifications/`, `.gitignore`):

```bash
npm create vite@latest . -- --template react-ts
```

Answer "Ignore files and continue" if it warns the directory is not empty. Then:

```bash
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

Replace the file with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

In `tsconfig.json` (or `tsconfig.app.json`, whichever the template generated with the app's
`compilerOptions`), set these three explicitly — the template's defaults are not sufficient:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    // ES2023 is required: later tasks use Array.prototype.findLast (ES2023)
    // and Array.prototype.at (ES2022). The template's default lib is older and
    // `npx tsc --noEmit` will fail on both without this.
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    // Makes the global describe/it/expect type-check.
    "types": ["vitest/globals"]
  }
}
```

Keep every other option the template generated.

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write the failing boundary test**

Create `src/core/__tests__/boundary.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const FORBIDDEN = [/from\s+['"].*\/ui\//, /from\s+['"].*\/i18n/, /from\s+['"]react['"]/];

describe('core boundary', () => {
  it('never imports from ui, i18n, or react', () => {
    const offenders: string[] = [];
    for (const file of filesUnder('src/core')) {
      if (!file.endsWith('.ts') || file.includes('__tests__')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/core/__tests__/boundary.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, scandir 'src/core'`.

- [ ] **Step 5: Create the core directory so the test passes**

```bash
mkdir -p src/core/model src/core/midi
```

Create `src/core/model/events.ts` with the vocabulary later tasks depend on:

```ts
export type EmeoEvent =
  | { kind: 'note-on'; note: number; velocity: number; t: number }
  | { kind: 'note-off'; note: number; t: number }
  | { kind: 'breath'; value: number; t: number }
  | { kind: 'raw'; data: Uint8Array; t: number };
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — boundary test green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS project with Vitest and core boundary test"
```

---

### Task 2: Pitch naming

**Files:**
- Create: `src/core/model/pitch.ts`
- Test: `src/core/model/pitch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface PitchName { midi: number; en: string; eu: string; octave: number }` and `pitchName(midi: number): PitchName`. Used by Task 14 (History).

- [ ] **Step 1: Write the failing test**

Create `src/core/model/pitch.test.ts`:

```ts
import { pitchName } from './pitch';

describe('pitchName', () => {
  it('names middle C as C4 / Do4 (scientific pitch notation)', () => {
    expect(pitchName(60)).toEqual({ midi: 60, en: 'C', eu: 'Do', octave: 4 });
  });

  it('names A♯4 as La♯4', () => {
    expect(pitchName(70)).toEqual({ midi: 70, en: 'A♯', eu: 'La♯', octave: 4 });
  });

  it('handles the bottom of the MIDI range', () => {
    expect(pitchName(0)).toEqual({ midi: 0, en: 'C', eu: 'Do', octave: -1 });
  });

  it('handles the top of the MIDI range', () => {
    expect(pitchName(127)).toEqual({ midi: 127, en: 'G', eu: 'Sol', octave: 9 });
  });

  it('rejects values outside 0-127', () => {
    expect(() => pitchName(128)).toThrow(RangeError);
    expect(() => pitchName(-1)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => pitchName(60.5)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/model/pitch.test.ts`
Expected: FAIL — cannot find module `./pitch`.

- [ ] **Step 3: Implement**

Create `src/core/model/pitch.ts`:

```ts
export interface PitchName {
  midi: number;
  en: string;
  eu: string;
  octave: number;
}

const EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const EU = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

/**
 * Scientific pitch notation: MIDI 60 = C4 = middle C.
 * `eu` is solfège naming, not a translation — both are shown together.
 */
export function pitchName(midi: number): PitchName {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`MIDI note out of range: ${midi}`);
  }
  const pitchClass = midi % 12;
  return {
    midi,
    en: EN[pitchClass],
    eu: EU[pitchClass],
    octave: Math.floor(midi / 12) - 1,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/model/pitch.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/model/pitch.ts src/core/model/pitch.test.ts
git commit -m "feat: add MIDI pitch naming in English and solfège"
```

---

### Task 3: Breath ring buffer

**Files:**
- Create: `src/core/model/ringBuffer.ts`
- Test: `src/core/model/ringBuffer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class BreathRing` with `constructor(capacity: number)`, `push(t: number, value: number): void`, `forEachSince(tMin: number, fn: (t: number, value: number) => void): void`, `clear(): void`, `get size(): number`, `get latest(): { t: number; value: number } | null`. Used by Tasks 8, 13.

- [ ] **Step 1: Write the failing test**

Create `src/core/model/ringBuffer.test.ts`:

```ts
import { BreathRing } from './ringBuffer';

function collect(ring: BreathRing, tMin = -Infinity) {
  const out: Array<[number, number]> = [];
  ring.forEachSince(tMin, (t, v) => out.push([t, v]));
  return out;
}

describe('BreathRing', () => {
  it('starts empty', () => {
    const ring = new BreathRing(4);
    expect(ring.size).toBe(0);
    expect(ring.latest).toBeNull();
    expect(collect(ring)).toEqual([]);
  });

  it('iterates samples oldest first', () => {
    const ring = new BreathRing(4);
    ring.push(1, 10);
    ring.push(2, 20);
    expect(collect(ring)).toEqual([[1, 10], [2, 20]]);
    expect(ring.size).toBe(2);
  });

  it('overwrites the oldest sample once capacity is exceeded', () => {
    const ring = new BreathRing(3);
    for (let i = 1; i <= 5; i++) ring.push(i, i * 10);
    expect(collect(ring)).toEqual([[3, 30], [4, 40], [5, 50]]);
    expect(ring.size).toBe(3);
  });

  it('filters by minimum timestamp', () => {
    const ring = new BreathRing(4);
    for (let i = 1; i <= 4; i++) ring.push(i, i * 10);
    expect(collect(ring, 3)).toEqual([[3, 30], [4, 40]]);
  });

  it('reports the most recent sample', () => {
    const ring = new BreathRing(3);
    ring.push(1, 10);
    ring.push(2, 99);
    expect(ring.latest).toEqual({ t: 2, value: 99 });
  });

  it('clears', () => {
    const ring = new BreathRing(3);
    ring.push(1, 10);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.latest).toBeNull();
    expect(collect(ring)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/model/ringBuffer.test.ts`
Expected: FAIL — cannot find module `./ringBuffer`.

- [ ] **Step 3: Implement**

Create `src/core/model/ringBuffer.ts`:

```ts
/**
 * Fixed-capacity store of breath samples.
 * Preallocated typed arrays: `push` never allocates, so no GC pauses mid-phrase.
 */
export class BreathRing {
  private readonly times: Float64Array;
  private readonly values: Float32Array;
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.values = new Float32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  get latest(): { t: number; value: number } | null {
    if (this.count === 0) return null;
    const i = (this.head - 1 + this.capacity) % this.capacity;
    return { t: this.times[i], value: this.values[i] };
  }

  push(t: number, value: number): void {
    this.times[this.head] = t;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  forEachSince(tMin: number, fn: (t: number, value: number) => void): void {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let n = 0; n < this.count; n++) {
      const i = (start + n) % this.capacity;
      if (this.times[i] >= tMin) fn(this.times[i], this.values[i]);
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/model/ringBuffer.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/model/ringBuffer.ts src/core/model/ringBuffer.test.ts
git commit -m "feat: add preallocated breath sample ring buffer"
```

---

### Task 4: Event bus

**Files:**
- Create: `src/core/bus.ts`
- Test: `src/core/bus.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Unsubscribe = () => void` and `class EventBus<T>` with `subscribe(fn: (event: T) => void): Unsubscribe`, `publish(event: T): void`, `clear(): void`. Used by Tasks 8, 13, 14, 15, 16.

- [ ] **Step 1: Write the failing test**

Create `src/core/bus.test.ts`:

```ts
import { EventBus } from './bus';

describe('EventBus', () => {
  it('delivers to every subscriber', () => {
    const bus = new EventBus<number>();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((n) => a.push(n));
    bus.subscribe((n) => b.push(n));
    bus.publish(1);
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const off = bus.subscribe((n) => seen.push(n));
    bus.publish(1);
    off();
    bus.publish(2);
    expect(seen).toEqual([1]);
  });

  it('does not throw when publishing with no subscribers', () => {
    const bus = new EventBus<number>();
    expect(() => bus.publish(1)).not.toThrow();
  });

  it('does not deliver the in-flight event to a subscriber added during publish', () => {
    const bus = new EventBus<number>();
    const late: number[] = [];
    bus.subscribe(() => {
      bus.subscribe((n) => late.push(n));
    });
    bus.publish(1);
    expect(late).toEqual([]);
    bus.publish(2);
    expect(late).toEqual([2]);
  });

  it('keeps delivering to remaining subscribers when one throws', () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((n) => seen.push(n));
    expect(() => bus.publish(1)).not.toThrow();
    expect(seen).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/bus.test.ts`
Expected: FAIL — cannot find module `./bus`.

- [ ] **Step 3: Implement**

Create `src/core/bus.ts`:

```ts
export type Unsubscribe = () => void;

/**
 * In-process publish/subscribe. Producers do not know their consumers.
 *
 * Deliberately in-memory: the producer and every consumer live in the same tab,
 * so a broker or socket would add latency between a sender and a receiver that
 * share a thread. A network transport, if ever needed, becomes one more subscriber.
 */
export class EventBus<T> {
  private subscribers: Array<(event: T) => void> = [];

  subscribe(fn: (event: T) => void): Unsubscribe {
    this.subscribers = [...this.subscribers, fn];
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  publish(event: T): void {
    // Snapshot: subscribing during delivery must not affect the in-flight event,
    // and unsubscribing must not shift the array mid-iteration.
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch (error) {
        // One bad subscriber must not silence the others or stall the MIDI handler.
        console.error('[bus] subscriber threw', error);
      }
    }
  }

  clear(): void {
    this.subscribers = [];
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/bus.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/bus.ts src/core/bus.test.ts
git commit -m "feat: add in-process event bus"
```

---

### Task 5: MIDI types and message decoding

**Files:**
- Create: `src/core/midi/types.ts`, `src/core/midi/decode.ts`
- Test: `src/core/midi/decode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - From `types.ts`: `MidiMessageEventLike`, `MidiInputLike`, `MidiAccessLike` (structural interfaces — see code below). Used by Tasks 7, 8, 9.
  - From `decode.ts`: the `MidiMessage` union and `parseMidi(data: Uint8Array, t: number): MidiMessage`. Used by Tasks 6, 8.

- [ ] **Step 1: Write the failing test**

Create `src/core/midi/decode.test.ts`:

```ts
import { parseMidi } from './decode';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('parseMidi', () => {
  it('decodes note on', () => {
    expect(parseMidi(bytes(0x90, 60, 100), 5)).toEqual({
      type: 'note-on', channel: 0, note: 60, velocity: 100, t: 5,
    });
  });

  it('decodes note off', () => {
    expect(parseMidi(bytes(0x80, 60, 64), 5)).toEqual({
      type: 'note-off', channel: 0, note: 60, velocity: 64, t: 5,
    });
  });

  it('treats note on with velocity 0 as note off (MIDI running-status convention)', () => {
    expect(parseMidi(bytes(0x90, 60, 0), 5)).toEqual({
      type: 'note-off', channel: 0, note: 60, velocity: 0, t: 5,
    });
  });

  it('reads the channel from the low nibble', () => {
    expect(parseMidi(bytes(0x93, 60, 100), 5)).toMatchObject({ channel: 3 });
  });

  it('decodes control change', () => {
    expect(parseMidi(bytes(0xb0, 2, 87), 5)).toEqual({
      type: 'cc', channel: 0, controller: 2, value: 87, t: 5,
    });
  });

  it('decodes channel pressure', () => {
    expect(parseMidi(bytes(0xd0, 87), 5)).toEqual({
      type: 'channel-pressure', channel: 0, value: 87, t: 5,
    });
  });

  it('decodes pitch bend as a 14-bit value, LSB first', () => {
    expect(parseMidi(bytes(0xe0, 0x00, 0x40), 5)).toEqual({
      type: 'pitch-bend', channel: 0, value: 8192, t: 5,
    });
  });

  it('classifies system messages as other', () => {
    expect(parseMidi(bytes(0xf8), 5)).toEqual({ type: 'other', t: 5 });
  });

  it('classifies program change as other', () => {
    expect(parseMidi(bytes(0xc0, 5), 5)).toEqual({ type: 'other', t: 5 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/midi/decode.test.ts`
Expected: FAIL — cannot find module `./decode`.

- [ ] **Step 3: Implement the structural MIDI types**

Create `src/core/midi/types.ts`:

```ts
/**
 * Minimal structural interfaces for the Web MIDI surface we actually use.
 *
 * Defined here rather than relying on lib.dom's MIDI types so the core does not
 * depend on which TypeScript lib version ships them, and so fakes (Task 9) are
 * plain objects rather than DOM class instances.
 */
export interface MidiMessageEventLike {
  data: Uint8Array;
  /** DOMHighResTimeStamp — same clock as performance.now(). */
  timeStamp: number;
}

export interface MidiInputLike {
  id: string;
  name: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}

export interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: ((event: { port: MidiInputLike }) => void) | null;
}
```

- [ ] **Step 4: Implement the decoder**

Create `src/core/midi/decode.ts`:

```ts
export type MidiMessage =
  | { type: 'note-on'; channel: number; note: number; velocity: number; t: number }
  | { type: 'note-off'; channel: number; note: number; velocity: number; t: number }
  | { type: 'cc'; channel: number; controller: number; value: number; t: number }
  | { type: 'channel-pressure'; channel: number; value: number; t: number }
  | { type: 'pitch-bend'; channel: number; value: number; t: number }
  | { type: 'other'; t: number };

/** Raw MIDI bytes → a typed message. Pure. */
export function parseMidi(data: Uint8Array, t: number): MidiMessage {
  const status = data[0];
  const kind = status & 0xf0;
  const channel = status & 0x0f;

  switch (kind) {
    case 0x90: {
      const velocity = data[2];
      // Note on with velocity 0 means note off. Many devices never send 0x80.
      return velocity === 0
        ? { type: 'note-off', channel, note: data[1], velocity: 0, t }
        : { type: 'note-on', channel, note: data[1], velocity, t };
    }
    case 0x80:
      return { type: 'note-off', channel, note: data[1], velocity: data[2], t };
    case 0xb0:
      return { type: 'cc', channel, controller: data[1], value: data[2], t };
    case 0xd0:
      return { type: 'channel-pressure', channel, value: data[1], t };
    case 0xe0:
      return { type: 'pitch-bend', channel, value: (data[2] << 7) | data[1], t };
    default:
      return { type: 'other', t };
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/core/midi/decode.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/midi/types.ts src/core/midi/decode.ts src/core/midi/decode.test.ts
git commit -m "feat: add MIDI message decoding and structural Web MIDI types"
```

---

### Task 6: Breath source detection (FR-14)

**Files:**
- Create: `src/core/midi/breathSource.ts`
- Test: `src/core/midi/breathSource.test.ts`

**Interfaces:**
- Consumes: `MidiMessage` from `src/core/midi/decode.ts`.
- Produces:
  - `type BreathSourceId = { kind: 'cc'; controller: number } | { kind: 'channel-pressure' }`
  - `interface ScoreRow { id: BreathSourceId; label: string; updates: number; distinct: number; range: number }`
  - `class BreathDetector` with `observe(msg: MidiMessage): void`, `get resolved(): BreathSourceId | null`, `valueOf(msg: MidiMessage): number | null`, `scoreboard(): ScoreRow[]`, `reset(): void`.

  Used by Tasks 8, 15, 16.

**Why this exists:** the EMEO's encoding is unconfirmed (business spec §187). Wind controllers variously use CC2, CC11, or channel pressure. Hard-coding CC2 risks a dead breath curve with no diagnosis.

- [ ] **Step 1: Write the failing test**

Create `src/core/midi/breathSource.test.ts`:

```ts
import { BreathDetector } from './breathSource';
import type { MidiMessage } from './decode';

/** Emits `count` CC messages sweeping smoothly across the 0-127 range. */
function sweepCC(detector: BreathDetector, controller: number, count = 30, t0 = 0) {
  for (let i = 0; i < count; i++) {
    const msg: MidiMessage = {
      type: 'cc', channel: 0, controller,
      value: Math.round((i / (count - 1)) * 127),
      t: t0 + i * 10,
    };
    detector.observe(msg);
  }
}

function sweepPressure(detector: BreathDetector, count = 30, t0 = 0) {
  for (let i = 0; i < count; i++) {
    detector.observe({
      type: 'channel-pressure', channel: 0,
      value: Math.round((i / (count - 1)) * 127),
      t: t0 + i * 10,
    });
  }
}

describe('BreathDetector', () => {
  it('resolves nothing before any evidence', () => {
    expect(new BreathDetector().resolved).toBeNull();
  });

  it('detects CC2', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 2 });
  });

  it('detects CC11 when that is what moves', () => {
    const d = new BreathDetector();
    sweepCC(d, 11);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
  });

  it('detects channel pressure when that is what moves', () => {
    const d = new BreathDetector();
    sweepPressure(d);
    expect(d.resolved).toEqual({ kind: 'channel-pressure' });
  });

  it('ignores a switch-like control with too few distinct values', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'cc', channel: 0, controller: 64, value: i % 2 ? 127 : 0, t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('ignores a control with too small a range', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'cc', channel: 0, controller: 7, value: 60 + (i % 10), t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('locks the first control to clear the thresholds, even when it is not CC2', () => {
    const d = new BreathDetector();
    sweepCC(d, 11, 30, 0);
    sweepCC(d, 2, 30, 0);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
  });

  it('does not resolve on evidence spread beyond the window', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      // 500ms apart — only ~6 land inside a 3s window.
      d.observe({
        type: 'cc', channel: 0, controller: 2,
        value: Math.round((i / 29) * 127), t: i * 500,
      });
    }
    expect(d.resolved).toBeNull();
  });

  it('ignores messages that cannot carry breath', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'note-on', channel: 0, note: 60, velocity: i, t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('reads values only from the resolved source once locked', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 2, value: 99, t: 400 })).toBe(99);
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 11, value: 42, t: 400 })).toBeNull();
    expect(d.valueOf({ type: 'note-on', channel: 0, note: 60, velocity: 1, t: 400 })).toBeNull();
  });

  it('returns null from valueOf before resolving', () => {
    const d = new BreathDetector();
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 2, value: 99, t: 0 })).toBeNull();
  });

  it('stays locked once resolved even if another control becomes busier', () => {
    const d = new BreathDetector();
    sweepCC(d, 11);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
    sweepCC(d, 2, 30, 1000);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
  });

  it('reports a scoreboard for diagnosis', () => {
    const d = new BreathDetector();
    sweepCC(d, 2, 30);
    const row = d.scoreboard().find((r) => r.label === 'CC2');
    expect(row).toMatchObject({ updates: 30, range: 127 });
  });

  it('resets', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    d.reset();
    expect(d.resolved).toBeNull();
    expect(d.scoreboard()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/midi/breathSource.test.ts`
Expected: FAIL — cannot find module `./breathSource`.

- [ ] **Step 3: Implement**

Create `src/core/midi/breathSource.ts`:

```ts
import type { MidiMessage } from './decode';

export type BreathSourceId =
  | { kind: 'cc'; controller: number }
  | { kind: 'channel-pressure' };

export interface ScoreRow {
  id: BreathSourceId;
  label: string;
  updates: number;
  distinct: number;
  range: number;
}

const WINDOW_MS = 3000;
const MIN_UPDATES = 20;
const MIN_DISTINCT = 8;
const MIN_RANGE = 32;

interface Sample {
  t: number;
  value: number;
}

/**
 * Decides at runtime which incoming control carries breath (FR-14).
 *
 * Scores every candidate — each CC number seen, plus channel pressure — over a
 * rolling window. Breath streams continuously across a wide range; a mod wheel
 * or a switch does not. Evidence alone decides: the first candidate whose
 * evidence clears every threshold locks the source, evaluated eagerly as each
 * message is observed. No candidate — not even CC2, the MIDI standard's
 * Breath Controller — gets a prior; the EMEO's actual encoding is
 * unconfirmed, so ties are broken purely by whichever control has the most
 * updates in the window at the moment of evaluation. Once a source locks it
 * stays locked for the session so the display cannot flap mid-phrase.
 */
export class BreathDetector {
  private samples = new Map<string, Sample[]>();
  private locked: BreathSourceId | null = null;

  get resolved(): BreathSourceId | null {
    return this.locked;
  }

  observe(msg: MidiMessage): void {
    const key = keyOf(msg);
    const value = breathValue(msg);
    if (key === null || value === null) return;

    const list = this.samples.get(key) ?? [];
    list.push({ t: msg.t, value });
    const cutoff = msg.t - WINDOW_MS;
    while (list.length > 0 && list[0].t < cutoff) list.shift();
    this.samples.set(key, list);

    if (this.locked === null) this.tryLock();
  }

  valueOf(msg: MidiMessage): number | null {
    if (this.locked === null) return null;
    const key = keyOf(msg);
    if (key === null || key !== keyOfId(this.locked)) return null;
    return breathValue(msg);
  }

  scoreboard(): ScoreRow[] {
    return [...this.samples.entries()]
      .map(([key, list]) => ({ ...stats(list), id: idOfKey(key), label: labelOfKey(key) }))
      .sort((a, b) => b.updates - a.updates);
  }

  reset(): void {
    this.samples.clear();
    this.locked = null;
  }

  private tryLock(): void {
    // At most one candidate can qualify here: observe() records one candidate
    // per message and locks the instant anything qualifies, so no second
    // candidate ever gets to cross the thresholds in the same call.
    const winner = [...this.samples.entries()].find(([, list]) => {
      const s = stats(list);
      return s.updates >= MIN_UPDATES && s.distinct >= MIN_DISTINCT && s.range >= MIN_RANGE;
    });
    if (winner) this.locked = idOfKey(winner[0]);
  }
}

function keyOf(msg: MidiMessage): string | null {
  if (msg.type === 'cc') return `cc:${msg.controller}`;
  if (msg.type === 'channel-pressure') return 'pressure';
  return null;
}

/** Only `cc` and `channel-pressure` messages carry a breath value. */
function breathValue(msg: MidiMessage): number | null {
  if (msg.type === 'cc' || msg.type === 'channel-pressure') return msg.value;
  return null;
}

function keyOfId(id: BreathSourceId): string {
  return id.kind === 'cc' ? `cc:${id.controller}` : 'pressure';
}

function idOfKey(key: string): BreathSourceId {
  return key === 'pressure'
    ? { kind: 'channel-pressure' }
    : { kind: 'cc', controller: Number(key.slice(3)) };
}

function labelOfKey(key: string): string {
  return key === 'pressure' ? 'Channel Pressure' : `CC${key.slice(3)}`;
}

function stats(list: Sample[]): { updates: number; distinct: number; range: number } {
  if (list.length === 0) return { updates: 0, distinct: 0, range: 0 };
  let min = Infinity;
  let max = -Infinity;
  const seen = new Set<number>();
  for (const s of list) {
    seen.add(s.value);
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
  }
  return { updates: list.length, distinct: seen.size, range: max - min };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/midi/breathSource.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/midi/breathSource.ts src/core/midi/breathSource.test.ts
git commit -m "feat: detect breath control source at runtime instead of hard-coding CC2"
```

---

### Task 7: Support and secure-context checks

**Files:**
- Create: `src/core/midi/access.ts`
- Test: `src/core/midi/access.test.ts`

**Interfaces:**
- Consumes: `MidiAccessLike` from `src/core/midi/types.ts`.
- Produces:
  - `type SupportResult = { ok: true } | { ok: false; reason: 'no-web-midi' | 'insecure-context' }`
  - `interface MidiEnvironment { isSecureContext: boolean; requestMIDIAccess?: () => Promise<MidiAccessLike> }`
  - `checkMidiSupport(env: MidiEnvironment): SupportResult`
  - `browserEnvironment(): MidiEnvironment`

  Used by Tasks 8, 16.

- [ ] **Step 1: Write the failing test**

Create `src/core/midi/access.test.ts`:

```ts
import { checkMidiSupport } from './access';

describe('checkMidiSupport', () => {
  it('accepts a secure context that exposes Web MIDI', () => {
    expect(checkMidiSupport({ isSecureContext: true, requestMIDIAccess: async () => ({} as never) }))
      .toEqual({ ok: true });
  });

  it('reports an insecure context', () => {
    expect(checkMidiSupport({ isSecureContext: false, requestMIDIAccess: async () => ({} as never) }))
      .toEqual({ ok: false, reason: 'insecure-context' });
  });

  it('reports a missing Web MIDI implementation', () => {
    expect(checkMidiSupport({ isSecureContext: true }))
      .toEqual({ ok: false, reason: 'no-web-midi' });
  });

  it('blames the insecure context first, since that is the root cause', () => {
    // Browsers hide requestMIDIAccess on insecure origins. Reporting "unsupported"
    // would send the user to change browsers when they need HTTPS.
    expect(checkMidiSupport({ isSecureContext: false }))
      .toEqual({ ok: false, reason: 'insecure-context' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/midi/access.test.ts`
Expected: FAIL — cannot find module `./access`.

- [ ] **Step 3: Implement**

Create `src/core/midi/access.ts`:

```ts
import type { MidiAccessLike } from './types';

export type SupportResult =
  | { ok: true }
  | { ok: false; reason: 'no-web-midi' | 'insecure-context' };

export interface MidiEnvironment {
  isSecureContext: boolean;
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
}

/**
 * Web MIDI exists only in a secure context (HTTPS or localhost).
 *
 * Secure context is checked first on purpose: browsers hide requestMIDIAccess on
 * insecure origins, so checking support first would report "unsupported browser"
 * to someone whose browser is fine and whose origin is not.
 */
export function checkMidiSupport(env: MidiEnvironment): SupportResult {
  if (!env.isSecureContext) return { ok: false, reason: 'insecure-context' };
  if (typeof env.requestMIDIAccess !== 'function') return { ok: false, reason: 'no-web-midi' };
  return { ok: true };
}

/** Reads the real browser. Kept separate so checkMidiSupport stays pure and testable. */
export function browserEnvironment(): MidiEnvironment {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: () => Promise<MidiAccessLike>;
  };
  return {
    isSecureContext: window.isSecureContext,
    requestMIDIAccess: nav.requestMIDIAccess
      ? () => nav.requestMIDIAccess!.call(navigator)
      : undefined,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/midi/access.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/midi/access.ts src/core/midi/access.test.ts
git commit -m "feat: add Web MIDI support and secure-context checks"
```

---

### Task 8: Connection state machine

**Files:**
- Create: `src/core/midi/connection.ts`
- Test: `src/core/midi/connection.test.ts`

**Interfaces:**
- Consumes: `EventBus`/`Unsubscribe` (Task 4), `EmeoEvent` (Task 1), `MidiAccessLike`/`MidiInputLike` (Task 5), `parseMidi` (Task 5), `BreathDetector` (Task 6), `MidiEnvironment`/`checkMidiSupport` (Task 7).
- Produces:
  - `interface PortInfo { id: string; name: string }`
  - `interface EmeoError { code: 'no-ports' | 'permission-denied' | 'unknown'; detail?: string }`
  - `type ConnectionState` (the union below)
  - `interface EmeoConnection { readonly state; onStateChange(fn): Unsubscribe; readonly events: EventBus<EmeoEvent>; readonly detector: BreathDetector; connect(): Promise<void>; choosePort(id: string): void; disconnect(): void }`
  - `createEmeoConnection(env: MidiEnvironment): EmeoConnection`

  Used by Tasks 15, 16.

- [ ] **Step 1: Write the failing test**

Create `src/core/midi/connection.test.ts`:

```ts
import { createEmeoConnection } from './connection';
import type { MidiAccessLike, MidiInputLike } from './types';
import type { EmeoEvent } from '../model/events';

function fakeInput(id: string, name: string): MidiInputLike {
  return { id, name, state: 'connected', onmidimessage: null };
}

function fakeAccess(...inputs: MidiInputLike[]): MidiAccessLike {
  return { inputs: new Map(inputs.map((i) => [i.id, i])), onstatechange: null };
}

function envWith(access: MidiAccessLike) {
  return { isSecureContext: true, requestMIDIAccess: async () => access };
}

describe('createEmeoConnection', () => {
  it('starts idle', () => {
    const conn = createEmeoConnection(envWith(fakeAccess()));
    expect(conn.state).toEqual({ status: 'idle' });
  });

  it('reports unsupported without calling requestMIDIAccess', async () => {
    const conn = createEmeoConnection({ isSecureContext: false });
    await conn.connect();
    expect(conn.state).toEqual({ status: 'unsupported', reason: 'insecure-context' });
  });

  it('connects straight through when there is exactly one input', async () => {
    const conn = createEmeoConnection(envWith(fakeAccess(fakeInput('a', 'EMEO'))));
    await conn.connect();
    expect(conn.state).toEqual({ status: 'connected', port: { id: 'a', name: 'EMEO' } });
  });

  it('offers a choice when several inputs are present (FR-4)', async () => {
    const conn = createEmeoConnection(
      envWith(fakeAccess(fakeInput('a', 'EMEO'), fakeInput('b', 'Other'))),
    );
    await conn.connect();
    expect(conn.state).toEqual({
      status: 'choosing',
      ports: [{ id: 'a', name: 'EMEO' }, { id: 'b', name: 'Other' }],
    });
    conn.choosePort('b');
    expect(conn.state).toEqual({ status: 'connected', port: { id: 'b', name: 'Other' } });
  });

  it('errors when no inputs are present', async () => {
    const conn = createEmeoConnection(envWith(fakeAccess()));
    await conn.connect();
    expect(conn.state).toEqual({ status: 'error', error: { code: 'no-ports' } });
  });

  it('reports a denied permission prompt', async () => {
    const conn = createEmeoConnection({
      isSecureContext: true,
      requestMIDIAccess: async () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    await conn.connect();
    expect(conn.state).toMatchObject({ status: 'error', error: { code: 'permission-denied' } });
  });

  it('names an unnamed port with a fallback', async () => {
    const input: MidiInputLike = { id: 'a', name: null, state: 'connected', onmidimessage: null };
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    await conn.connect();
    expect(conn.state).toMatchObject({ port: { id: 'a', name: 'Unknown device' } });
  });

  it('publishes note events from incoming MIDI', async () => {
    const input = fakeInput('a', 'EMEO');
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    const seen: EmeoEvent[] = [];
    conn.events.subscribe((e) => seen.push(e));
    await conn.connect();

    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 7 });

    expect(seen).toContainEqual({ kind: 'note-on', note: 60, velocity: 100, t: 7 });
    expect(seen).toContainEqual({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 7 });
  });

  it('publishes a raw event for every message, including unrecognised ones', async () => {
    const input = fakeInput('a', 'EMEO');
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    const raw: EmeoEvent[] = [];
    conn.events.subscribe((e) => { if (e.kind === 'raw') raw.push(e); });
    await conn.connect();

    input.onmidimessage!({ data: new Uint8Array([0xf8]), timeStamp: 1 });

    expect(raw).toHaveLength(1);
  });

  it('publishes breath events once the detector locks on', async () => {
    const input = fakeInput('a', 'EMEO');
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    const breath: number[] = [];
    conn.events.subscribe((e) => { if (e.kind === 'breath') breath.push(e.value); });
    await conn.connect();

    // Sweep CC2 until the detector locks, then one more value.
    for (let i = 0; i < 30; i++) {
      const value = Math.round((i / 29) * 127);
      input.onmidimessage!({ data: new Uint8Array([0xb0, 2, value]), timeStamp: i * 10 });
    }
    input.onmidimessage!({ data: new Uint8Array([0xb0, 2, 99]), timeStamp: 400 });

    expect(conn.detector.resolved).toEqual({ kind: 'cc', controller: 2 });
    expect(breath.at(-1)).toBe(99);
  });

  it('uses the MIDI event timeStamp, not the time of handling', async () => {
    const input = fakeInput('a', 'EMEO');
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    const seen: EmeoEvent[] = [];
    conn.events.subscribe((e) => { if (e.kind === 'note-on') seen.push(e); });
    await conn.connect();

    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 12345 });

    expect(seen[0]).toMatchObject({ t: 12345 });
  });

  it('goes to lost when the connected port disconnects (FR-17)', async () => {
    const input = fakeInput('a', 'EMEO');
    const access = fakeAccess(input);
    const conn = createEmeoConnection(envWith(access));
    await conn.connect();

    input.state = 'disconnected';
    access.onstatechange!({ port: input });

    expect(conn.state).toEqual({ status: 'lost', port: { id: 'a', name: 'EMEO' } });
  });

  it('ignores disconnects of ports we are not using', async () => {
    const ours = fakeInput('a', 'EMEO');
    const other = fakeInput('b', 'Other');
    const access = fakeAccess(ours);
    access.inputs.set('b', other);
    const conn = createEmeoConnection(envWith(access));
    await conn.connect();
    conn.choosePort('a');

    other.state = 'disconnected';
    access.onstatechange!({ port: other });

    expect(conn.state).toMatchObject({ status: 'connected' });
  });

  it('detaches the handler and returns to idle on disconnect (FR-3)', async () => {
    const input = fakeInput('a', 'EMEO');
    const conn = createEmeoConnection(envWith(fakeAccess(input)));
    await conn.connect();
    conn.disconnect();
    expect(conn.state).toEqual({ status: 'idle' });
    expect(input.onmidimessage).toBeNull();
  });

  it('notifies state subscribers', async () => {
    const conn = createEmeoConnection(envWith(fakeAccess(fakeInput('a', 'EMEO'))));
    const statuses: string[] = [];
    conn.onStateChange((s) => statuses.push(s.status));
    await conn.connect();
    expect(statuses).toEqual(['requesting', 'connected']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/midi/connection.test.ts`
Expected: FAIL — cannot find module `./connection`.

- [ ] **Step 3: Implement**

Create `src/core/midi/connection.ts`:

```ts
import { EventBus, type Unsubscribe } from '../bus';
import type { EmeoEvent } from '../model/events';
import { checkMidiSupport, type MidiEnvironment } from './access';
import { BreathDetector } from './breathSource';
import { parseMidi } from './decode';
import type { MidiAccessLike, MidiInputLike, MidiMessageEventLike } from './types';

export interface PortInfo {
  id: string;
  name: string;
}

export interface EmeoError {
  code: 'no-ports' | 'permission-denied' | 'unknown';
  detail?: string;
}

export type ConnectionState =
  | { status: 'unsupported'; reason: 'no-web-midi' | 'insecure-context' }
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'choosing'; ports: PortInfo[] }
  | { status: 'connected'; port: PortInfo }
  | { status: 'lost'; port: PortInfo }
  | { status: 'error'; error: EmeoError };

export interface EmeoConnection {
  readonly state: ConnectionState;
  onStateChange(fn: (state: ConnectionState) => void): Unsubscribe;
  readonly events: EventBus<EmeoEvent>;
  readonly detector: BreathDetector;
  connect(): Promise<void>;
  choosePort(id: string): void;
  disconnect(): void;
}

const UNKNOWN_DEVICE = 'Unknown device';

export function createEmeoConnection(env: MidiEnvironment): EmeoConnection {
  const events = new EventBus<EmeoEvent>();
  const stateBus = new EventBus<ConnectionState>();
  const detector = new BreathDetector();

  let state: ConnectionState = { status: 'idle' };
  let access: MidiAccessLike | null = null;
  let attached: MidiInputLike | null = null;

  function setState(next: ConnectionState): void {
    state = next;
    stateBus.publish(next);
  }

  function info(input: MidiInputLike): PortInfo {
    return { id: input.id, name: input.name ?? UNKNOWN_DEVICE };
  }

  function handle(event: MidiMessageEventLike): void {
    // timeStamp, never Date.now(): if the tab hitches, events queue, and
    // stamping on arrival would draw a breath shape that never happened.
    const t = event.timeStamp;
    events.publish({ kind: 'raw', data: event.data, t });

    const msg = parseMidi(event.data, t);
    if (msg.type === 'note-on') {
      events.publish({ kind: 'note-on', note: msg.note, velocity: msg.velocity, t });
      return;
    }
    if (msg.type === 'note-off') {
      events.publish({ kind: 'note-off', note: msg.note, t });
      return;
    }

    detector.observe(msg);
    const value = detector.valueOf(msg);
    if (value !== null) events.publish({ kind: 'breath', value, t });
  }

  function detach(): void {
    if (attached) attached.onmidimessage = null;
    attached = null;
  }

  function attach(input: MidiInputLike): void {
    detach();
    attached = input;
    input.onmidimessage = handle;
    setState({ status: 'connected', port: info(input) });
  }

  async function connect(): Promise<void> {
    const support = checkMidiSupport(env);
    if (!support.ok) {
      setState({ status: 'unsupported', reason: support.reason });
      return;
    }

    setState({ status: 'requesting' });
    try {
      access = await env.requestMIDIAccess!();
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'SecurityError';
      setState({
        status: 'error',
        error: {
          code: denied ? 'permission-denied' : 'unknown',
          detail: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    access.onstatechange = (event) => {
      if (event.port.state === 'disconnected' && event.port.id === attached?.id) {
        const port = info(event.port);
        detach();
        setState({ status: 'lost', port });
      }
    };

    const inputs = [...access.inputs.values()];
    if (inputs.length === 0) {
      setState({ status: 'error', error: { code: 'no-ports' } });
      return;
    }
    if (inputs.length === 1) {
      attach(inputs[0]);
      return;
    }
    setState({ status: 'choosing', ports: inputs.map(info) });
  }

  function choosePort(id: string): void {
    const input = access?.inputs.get(id);
    if (input) attach(input);
  }

  function disconnect(): void {
    detach();
    setState({ status: 'idle' });
  }

  return {
    get state() {
      return state;
    },
    onStateChange: (fn) => stateBus.subscribe(fn),
    events,
    detector,
    connect,
    choosePort,
    disconnect,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/midi/connection.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Run the whole suite to confirm the boundary still holds**

Run: `npm test`
Expected: PASS — including `core boundary`.

- [ ] **Step 6: Commit**

```bash
git add src/core/midi/connection.ts src/core/midi/connection.test.ts
git commit -m "feat: add EMEO connection state machine"
```

---

### Task 9: Synthetic EMEO

**Files:**
- Create: `src/dev/syntheticEmeo.ts`
- Test: `src/dev/syntheticEmeo.test.ts`

**Interfaces:**
- Consumes: `MidiAccessLike`, `MidiInputLike` (Task 5); `MidiEnvironment` (Task 7).
- Produces:
  - `interface SyntheticOptions { breathSource?: BreathSourceId; tempoMs?: number }`
  - `createSyntheticEnvironment(options?: SyntheticOptions): MidiEnvironment`
  - `startSynthetic(env: MidiEnvironment): () => void` — begins emitting, returns a stop function.

  Used by Task 16.

**Why this exists:** the EMEO's encoding is unconfirmed (business spec §187). Without a fake instrument, every UI task is blocked on hardware and on a person physically blowing to generate data, and CI cannot run at all. It also lets us prove detection against encodings one real instrument cannot produce. It becomes a demo mode for free. It removes hardware from the build loop, not the validation loop.

- [ ] **Step 1: Write the failing test**

Create `src/dev/syntheticEmeo.test.ts`:

```ts
import { createEmeoConnection } from '../core/midi/connection';
import { createSyntheticEnvironment, startSynthetic } from './syntheticEmeo';
import type { EmeoEvent } from '../core/model/events';

describe('synthetic EMEO', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('presents itself as a single connectable input', async () => {
    const conn = createEmeoConnection(createSyntheticEnvironment());
    await conn.connect();
    expect(conn.state).toMatchObject({ status: 'connected', port: { name: 'Synthetic EMEO' } });
  });

  it('drives breath detection to a lock on the default source', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(2000);
    stop();

    expect(conn.detector.resolved).toEqual({ kind: 'cc', controller: 2 });
  });

  it('can emit breath on channel pressure instead, proving detection is not CC-only', async () => {
    const env = createSyntheticEnvironment({ breathSource: { kind: 'channel-pressure' } });
    const conn = createEmeoConnection(env);
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(2000);
    stop();

    expect(conn.detector.resolved).toEqual({ kind: 'channel-pressure' });
  });

  it('emits notes and breath', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    const kinds = new Set<string>();
    conn.events.subscribe((e: EmeoEvent) => kinds.add(e.kind));
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(3000);
    stop();

    expect(kinds).toContain('note-on');
    expect(kinds).toContain('note-off');
    expect(kinds).toContain('breath');
  });

  it('stops emitting once stopped', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    let count = 0;
    conn.events.subscribe(() => count++);
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(1000);
    stop();
    const settled = count;
    vi.advanceTimersByTime(1000);

    expect(count).toBe(settled);
  });

  it('refuses to start against a non-synthetic environment', () => {
    expect(() => startSynthetic({ isSecureContext: true })).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/dev/syntheticEmeo.test.ts`
Expected: FAIL — cannot find module `./syntheticEmeo`.

- [ ] **Step 3: Implement**

Create `src/dev/syntheticEmeo.ts`:

```ts
import type { MidiEnvironment } from '../core/midi/access';
import type { BreathSourceId } from '../core/midi/breathSource';
import type { MidiAccessLike, MidiInputLike } from '../core/midi/types';

export interface SyntheticOptions {
  /** Which control the fake instrument uses for breath. Default: CC2. */
  breathSource?: BreathSourceId;
  /** Milliseconds per note. Default: 600. */
  tempoMs?: number;
}

const BREATH_INTERVAL_MS = 10;
const PHRASE = [60, 62, 64, 65, 67, 69, 71, 72];

interface SyntheticEnvironment extends MidiEnvironment {
  __input: MidiInputLike;
  __options: Required<SyntheticOptions>;
}

/** A fake MIDI environment presenting one input named "Synthetic EMEO". */
export function createSyntheticEnvironment(options: SyntheticOptions = {}): MidiEnvironment {
  const input: MidiInputLike = {
    id: 'synthetic-emeo',
    name: 'Synthetic EMEO',
    state: 'connected',
    onmidimessage: null,
  };
  const access: MidiAccessLike = {
    inputs: new Map([[input.id, input]]),
    onstatechange: null,
  };
  const env: SyntheticEnvironment = {
    isSecureContext: true,
    requestMIDIAccess: async () => access,
    __input: input,
    __options: {
      breathSource: options.breathSource ?? { kind: 'cc', controller: 2 },
      tempoMs: options.tempoMs ?? 600,
    },
  };
  return env;
}

function isSynthetic(env: MidiEnvironment): env is SyntheticEnvironment {
  return '__input' in env && '__options' in env;
}

/** Begins emitting a scripted performance. Returns a stop function. */
export function startSynthetic(env: MidiEnvironment): () => void {
  // A guard, not a cast: passing the real browser environment here is a
  // programming error and should say so rather than fail as `undefined`.
  if (!isSynthetic(env)) {
    throw new TypeError('startSynthetic requires an environment from createSyntheticEnvironment');
  }
  const { __input: input, __options: options } = env;

  let elapsed = 0;
  let noteIndex = 0;
  let currentNote: number | null = null;

  const send = (...bytes: number[]) => {
    input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: elapsed });
  };

  const sendBreath = (value: number) => {
    if (options.breathSource.kind === 'channel-pressure') send(0xd0, value);
    else send(0xb0, options.breathSource.controller, value);
  };

  const timer = setInterval(() => {
    elapsed += BREATH_INTERVAL_MS;

    // A breath swell shaped over the note: rises, plateaus, releases.
    const phase = (elapsed % options.tempoMs) / options.tempoMs;
    const value = Math.round(127 * Math.sin(Math.PI * phase) ** 0.7);
    sendBreath(value);

    // Note boundaries.
    if (elapsed % options.tempoMs < BREATH_INTERVAL_MS) {
      if (currentNote !== null) send(0x80, currentNote, 0);
      currentNote = PHRASE[noteIndex % PHRASE.length];
      noteIndex++;
      send(0x90, currentNote, 100);
    }
  }, BREATH_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    if (currentNote !== null) send(0x80, currentNote, 0);
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/dev/syntheticEmeo.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/dev/syntheticEmeo.ts src/dev/syntheticEmeo.test.ts
git commit -m "feat: add synthetic EMEO so UI and CI can run without hardware"
```

---

### Task 10: The time→pixel mapping

**Files:**
- Create: `src/ui/Stage/timeToY.ts`
- Test: `src/ui/Stage/timeToY.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface StageGeometry { height: number; nowLineFraction: number; pxPerMs: number }`
  - `const DEFAULT_GEOMETRY: Omit<StageGeometry, 'height'>` — `{ nowLineFraction: 0.1, pxPerMs: 0.06 }`
  - `nowLineY(g: StageGeometry): number`
  - `timeToY(t: number, now: number, g: StageGeometry): number`
  - `visibleWindowMs(g: StageGeometry): number`

  Used by Tasks 13, 14.

- [ ] **Step 1: Write the failing test**

Create `src/ui/Stage/timeToY.test.ts`:

```ts
import { DEFAULT_GEOMETRY, nowLineY, timeToY, visibleWindowMs } from './timeToY';

const geometry = { height: 1000, ...DEFAULT_GEOMETRY };

describe('timeToY', () => {
  it('puts the now-line at the configured fraction of height', () => {
    expect(nowLineY(geometry)).toBe(100);
  });

  it('places an event happening now on the now-line', () => {
    expect(timeToY(5000, 5000, geometry)).toBe(100);
  });

  it('places past events below the now-line', () => {
    // 1000ms ago * 0.06 px/ms = 60px below.
    expect(timeToY(4000, 5000, geometry)).toBeCloseTo(160);
  });

  it('places future events above the now-line, with no special case', () => {
    // This is what re-parameterises the monitor into the sight-reading trainer:
    // a note yet to be played has t > now, so the subtraction goes negative.
    expect(timeToY(6000, 5000, geometry)).toBeCloseTo(40);
  });

  it('computes the visible window from the space below the now-line', () => {
    // (1000 - 100) / 0.06 = 15000ms
    expect(visibleWindowMs(geometry)).toBeCloseTo(15000);
  });

  it('scales with a different scroll speed', () => {
    const fast = { ...geometry, pxPerMs: 0.12 };
    expect(timeToY(4000, 5000, fast)).toBeCloseTo(220);
    expect(visibleWindowMs(fast)).toBeCloseTo(7500);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/Stage/timeToY.test.ts`
Expected: FAIL — cannot find module `./timeToY`.

- [ ] **Step 3: Implement**

Create `src/ui/Stage/timeToY.ts`:

```ts
export interface StageGeometry {
  height: number;
  /** Now-line position as a fraction of height. */
  nowLineFraction: number;
  /** Scroll speed. */
  pxPerMs: number;
}

/** Development constants, not user-facing controls. ~15s window on a 900px stage. */
export const DEFAULT_GEOMETRY = {
  nowLineFraction: 0.1,
  pxPerMs: 0.06,
} as const;

export function nowLineY(g: StageGeometry): number {
  return g.height * g.nowLineFraction;
}

/**
 * The single time→pixel mapping. Canvas and DOM both call it, so their
 * alignment is exact by construction rather than by coincidence.
 *
 * A future event (t > now) yields y < nowLineY and renders above the line,
 * descending toward it — no branch. That is what turns this monitor into the
 * sight-reading trainer: move nowLineFraction down and feed it future notes.
 */
export function timeToY(t: number, now: number, g: StageGeometry): number {
  return nowLineY(g) + (now - t) * g.pxPerMs;
}

export function visibleWindowMs(g: StageGeometry): number {
  return (g.height - nowLineY(g)) / g.pxPerMs;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui/Stage/timeToY.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Stage/timeToY.ts src/ui/Stage/timeToY.test.ts
git commit -m "feat: add shared time-to-pixel mapping for stage and history"
```

---

### Task 11: i18n setup

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`, `src/types/i18next.d.ts`
- Modify: `src/main.tsx`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an initialised i18n singleton (import `../i18n` for its side effect) and type-checked keys via `CustomTypeOptions`. Used by Tasks 12, 14, 16.

- [ ] **Step 1: Install**

```bash
npm install i18next react-i18next
```

- [ ] **Step 2: Write the failing test**

Create `src/i18n/i18n.test.ts`:

```ts
import en from './locales/en.json';
import fr from './locales/fr.json';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('locales', () => {
  it('define the same keys in every language', () => {
    expect(keysOf(fr).sort()).toEqual(keysOf(en).sort());
  });

  it('have no empty strings', () => {
    const empty = [...keysOf(en), ...keysOf(fr)].filter((k) => k.trim() === '');
    expect(empty).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: FAIL — cannot find module `./locales/en.json`.

- [ ] **Step 4: Create the locale resources**

Create `src/i18n/locales/en.json`:

```json
{
  "app": { "title": "EMEO Live Monitor" },
  "connection": {
    "connect": "Connect",
    "disconnect": "Disconnect",
    "idle": "Not connected",
    "requesting": "Connecting…",
    "choosing": "Choose your instrument",
    "connected": "Connected to {{name}}",
    "lost": "Connection lost — {{name}}",
    "reconnect": "Reconnect",
    "hint": "Connect your EMEO by cable, then click Connect."
  },
  "errors": {
    "insecureContext": "This page must be served over HTTPS (or run on localhost) before your browser will allow access to musical instruments.",
    "noWebMidi": "This browser cannot connect to musical instruments. Try a browser with Web MIDI support.",
    "permissionDenied": "Access to your instrument was declined. Click Connect and allow access when your browser asks.",
    "noPorts": "No instrument detected. A cable connection is the most reliable. If you are using Bluetooth, pair the EMEO in your operating system first — browsers cannot pair it for you.",
    "unknown": "Something went wrong connecting to your instrument."
  },
  "breath": {
    "label": "Breath",
    "outOf": "of {{max}}",
    "detecting": "Blow into the EMEO to detect the breath control"
  },
  "notes": { "label": "Note", "now": "Now" },
  "controls": { "pause": "Pause", "resume": "Resume", "clear": "Clear" }
}
```

Create `src/i18n/locales/fr.json`:

```json
{
  "app": { "title": "EMEO Live Monitor" },
  "connection": {
    "connect": "Connecter",
    "disconnect": "Déconnecter",
    "idle": "Non connecté",
    "requesting": "Connexion…",
    "choosing": "Choisissez votre instrument",
    "connected": "Connecté à {{name}}",
    "lost": "Connexion perdue — {{name}}",
    "reconnect": "Reconnecter",
    "hint": "Branchez votre EMEO par câble, puis cliquez sur Connecter."
  },
  "errors": {
    "insecureContext": "Cette page doit être servie en HTTPS (ou exécutée sur localhost) pour que votre navigateur autorise l'accès aux instruments de musique.",
    "noWebMidi": "Ce navigateur ne peut pas se connecter aux instruments de musique. Essayez un navigateur compatible Web MIDI.",
    "permissionDenied": "L'accès à votre instrument a été refusé. Cliquez sur Connecter et autorisez l'accès lorsque votre navigateur le demande.",
    "noPorts": "Aucun instrument détecté. Une connexion par câble est la plus fiable. En Bluetooth, appairez d'abord l'EMEO dans votre système d'exploitation — les navigateurs ne peuvent pas l'appairer.",
    "unknown": "Une erreur est survenue lors de la connexion à votre instrument."
  },
  "breath": {
    "label": "Souffle",
    "outOf": "sur {{max}}",
    "detecting": "Soufflez dans l'EMEO pour détecter le contrôle de souffle"
  },
  "notes": { "label": "Note", "now": "Maintenant" },
  "controls": { "pause": "Pause", "resume": "Reprendre", "clear": "Effacer" }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Initialise i18n and enable key type-checking**

Create `src/i18n/index.ts`:

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

i18n.use(initReactI18next).init({
  resources,
  fallbackLng: 'en',
  supportedLngs: ['en', 'fr'],
  interpolation: {
    escapeValue: false, // React escapes by default.
  },
});

export default i18n;
```

Create `src/types/i18next.d.ts` so missing or misspelled keys fail the build rather than reaching a user:

```ts
import 'i18next';
import type { resources } from '../i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}
```

Add the import for its side effect at the top of `src/main.tsx`:

```ts
import './i18n';
```

- [ ] **Step 7: Verify types and tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/i18n src/types/i18next.d.ts src/main.tsx package.json package-lock.json
git commit -m "feat: add react-i18next with type-checked en and fr locales"
```

---

### Task 12: Design tokens, app shell, and header

**Files:**
- Create: `src/styles/tokens.css`, `src/ui/Header/Header.tsx`, `src/ui/Header/Header.module.css`, `src/ui/connectionMessage.ts`
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `src/ui/Header/Header.test.tsx`, `src/ui/connectionMessage.test.ts`

**Interfaces:**
- Consumes: `ConnectionState`, `PortInfo` (Task 8); i18n (Task 11).
- Produces:
  - `connectionMessageKey(state: ConnectionState): string` — maps state to a locale key.
  - `<Header state={...} onConnect={...} onDisconnect={...} onChoosePort={...} paused={...} onTogglePause={...} onClear={...} />`

  Used by Task 16.

- [ ] **Step 1: Write the failing test for the state→message mapping**

Create `src/ui/connectionMessage.test.ts`:

```ts
import { connectionMessageKey } from './connectionMessage';

describe('connectionMessageKey', () => {
  it('maps each connection state to a specific key, never a generic failure', () => {
    expect(connectionMessageKey({ status: 'idle' })).toBe('connection.idle');
    expect(connectionMessageKey({ status: 'requesting' })).toBe('connection.requesting');
    expect(connectionMessageKey({ status: 'choosing', ports: [] })).toBe('connection.choosing');
    expect(connectionMessageKey({ status: 'connected', port: { id: 'a', name: 'EMEO' } }))
      .toBe('connection.connected');
    expect(connectionMessageKey({ status: 'lost', port: { id: 'a', name: 'EMEO' } }))
      .toBe('connection.lost');
  });

  it('maps unsupported reasons to their own explanations (FR-5)', () => {
    expect(connectionMessageKey({ status: 'unsupported', reason: 'insecure-context' }))
      .toBe('errors.insecureContext');
    expect(connectionMessageKey({ status: 'unsupported', reason: 'no-web-midi' }))
      .toBe('errors.noWebMidi');
  });

  it('maps each error code to its own explanation', () => {
    expect(connectionMessageKey({ status: 'error', error: { code: 'no-ports' } }))
      .toBe('errors.noPorts');
    expect(connectionMessageKey({ status: 'error', error: { code: 'permission-denied' } }))
      .toBe('errors.permissionDenied');
    expect(connectionMessageKey({ status: 'error', error: { code: 'unknown' } }))
      .toBe('errors.unknown');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/connectionMessage.test.ts`
Expected: FAIL — cannot find module `./connectionMessage`.

- [ ] **Step 3: Implement the mapping**

Create `src/ui/connectionMessage.ts`:

```ts
import type { ConnectionState } from '../core/midi/connection';

/** Every state gets its own plain-language explanation (FR-5). No generic failures. */
export function connectionMessageKey(state: ConnectionState): string {
  switch (state.status) {
    case 'idle':
      return 'connection.idle';
    case 'requesting':
      return 'connection.requesting';
    case 'choosing':
      return 'connection.choosing';
    case 'connected':
      return 'connection.connected';
    case 'lost':
      return 'connection.lost';
    case 'unsupported':
      return state.reason === 'insecure-context' ? 'errors.insecureContext' : 'errors.noWebMidi';
    case 'error':
      switch (state.error.code) {
        case 'no-ports':
          return 'errors.noPorts';
        case 'permission-denied':
          return 'errors.permissionDenied';
        default:
          return 'errors.unknown';
      }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui/connectionMessage.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the failing Header test**

Create `src/ui/Header/Header.test.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import { Header } from './Header';

const noop = () => {};

// `ComponentProps` is imported as a type: under the modern JSX transform there
// is no `React` binding in scope, and TypeScript rejects the UMD global here.
function renderHeader(props: Partial<ComponentProps<typeof Header>> = {}) {
  return render(
    <Header
      state={{ status: 'idle' }}
      onConnect={noop}
      onDisconnect={noop}
      onChoosePort={noop}
      paused={false}
      onTogglePause={noop}
      onClear={noop}
      {...props}
    />,
  );
}

describe('Header', () => {
  it('shows the connection state at all times (FR-2)', () => {
    renderHeader();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('names the connected port', () => {
    renderHeader({ state: { status: 'connected', port: { id: 'a', name: 'EMEO' } } });
    expect(screen.getByText('Connected to EMEO')).toBeInTheDocument();
  });

  it('offers Connect when idle and Disconnect when connected (FR-1, FR-3)', async () => {
    const onConnect = vi.fn();
    const { rerender } = renderHeader({ onConnect });
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalled();

    rerender(
      <Header
        state={{ status: 'connected', port: { id: 'a', name: 'EMEO' } }}
        onConnect={noop} onDisconnect={noop} onChoosePort={noop}
        paused={false} onTogglePause={noop} onClear={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('lets the user pick between several instruments (FR-4)', async () => {
    const onChoosePort = vi.fn();
    renderHeader({
      state: { status: 'choosing', ports: [{ id: 'a', name: 'EMEO' }, { id: 'b', name: 'Other' }] },
      onChoosePort,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(onChoosePort).toHaveBeenCalledWith('b');
  });

  it('explains an insecure context in plain language (FR-5)', () => {
    renderHeader({ state: { status: 'unsupported', reason: 'insecure-context' } });
    expect(screen.getByText(/HTTPS/)).toBeInTheDocument();
  });

  it('toggles pause and clears (FR-15)', async () => {
    const onTogglePause = vi.fn();
    const onClear = vi.fn();
    renderHeader({ onTogglePause, onClear });
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onTogglePause).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });

  it('shows Resume while paused', () => {
    renderHeader({ paused: true });
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('offers Reconnect after a lost connection (FR-17)', () => {
    renderHeader({ state: { status: 'lost', port: { id: 'a', name: 'EMEO' } } });
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });
});
```

Install the interaction helper:

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/ui/Header/Header.test.tsx`
Expected: FAIL — cannot find module `./Header`.

- [ ] **Step 7: Create the design tokens**

Create `src/styles/tokens.css`:

```css
:root {
  --color-bg: #0e1117;
  --color-surface: #151a23;
  --color-surface-raised: #1b2230;
  --color-border: #242c3a;
  --color-text: #e6ebf2;
  --color-text-muted: #8b97a8;
  --color-note: #4ea3ff;
  --color-breath: #34d399;
  --color-now: #ff5c5c;
  --color-danger: #f87171;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;

  --radius: 6px;
  --font-ui: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
}
```

Import it at the top of `src/main.tsx`:

```ts
import './styles/tokens.css';
```

- [ ] **Step 8: Implement the Header**

Create `src/ui/Header/Header.module.css`:

```css
.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
  font-family: var(--font-ui);
}

.title {
  font-weight: 700;
  color: var(--color-text);
}

.status {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.statusError {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.spacer {
  flex: 1;
}

.ports {
  display: flex;
  gap: var(--space-1);
}

.button {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-ui);
  cursor: pointer;
}

.button:hover {
  border-color: var(--color-text-muted);
}
```

Create `src/ui/Header/Header.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import type { ConnectionState } from '../../core/midi/connection';
import { connectionMessageKey } from '../connectionMessage';
import styles from './Header.module.css';

interface HeaderProps {
  state: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  onChoosePort: (id: string) => void;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
}

export function Header({
  state, onConnect, onDisconnect, onChoosePort, paused, onTogglePause, onClear,
}: HeaderProps) {
  const { t } = useTranslation();

  const name = 'port' in state ? state.port.name : '';
  const isProblem = state.status === 'unsupported' || state.status === 'error';

  return (
    <header className={styles.header}>
      <span className={styles.title}>{t('app.title')}</span>

      <span className={isProblem ? styles.statusError : styles.status}>
        {t(connectionMessageKey(state), { name })}
      </span>

      {state.status === 'choosing' && (
        <span className={styles.ports}>
          {state.ports.map((port) => (
            <button key={port.id} className={styles.button} onClick={() => onChoosePort(port.id)}>
              {port.name}
            </button>
          ))}
        </span>
      )}

      <span className={styles.spacer} />

      {state.status === 'connected' && (
        <button className={styles.button} onClick={onDisconnect}>
          {t('connection.disconnect')}
        </button>
      )}
      {state.status === 'lost' && (
        <button className={styles.button} onClick={onConnect}>
          {t('connection.reconnect')}
        </button>
      )}
      {(state.status === 'idle' || state.status === 'error') && (
        <button className={styles.button} onClick={onConnect}>
          {t('connection.connect')}
        </button>
      )}

      <button className={styles.button} onClick={onTogglePause}>
        {paused ? t('controls.resume') : t('controls.pause')}
      </button>
      <button className={styles.button} onClick={onClear}>
        {t('controls.clear')}
      </button>
    </header>
  );
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/ui/Header/Header.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 10: Commit**

```bash
git add src/styles src/ui/Header src/ui/connectionMessage.ts src/ui/connectionMessage.test.ts src/main.tsx package.json package-lock.json
git commit -m "feat: add design tokens and connection header"
```

---

### Task 13: The stage canvas

**Files:**
- Create: `src/ui/Stage/geometry.ts`, `src/ui/Stage/draw.ts`, `src/ui/Stage/Stage.tsx`, `src/ui/Stage/Stage.module.css`
- Test: `src/ui/Stage/geometry.test.ts`

**Interfaces:**
- Consumes: `StageGeometry`, `timeToY`, `nowLineY`, `visibleWindowMs`, `DEFAULT_GEOMETRY` (Task 10); `BreathRing` (Task 3).
- Produces:
  - `interface NoteBlock { note: number; start: number; end: number | null }`
  - `interface StageLayout { width: number; pitchMin: number; pitchMax: number }`
  - `pitchToX(note: number, layout: StageLayout): number`
  - `noteRect(block: NoteBlock, now: number, g: StageGeometry, layout: StageLayout): { x: number; y: number; w: number; h: number }`
  - `breathToX(value: number, laneWidth: number): number`
  - `meterFillHeight(value: number, height: number): number`
  - `readTokens(el: HTMLElement): StageTokens` and `interface StageTokens { note: string; breath: string; now: string; surface: string; track: string }`
  - `METER_WIDTH`, `BREATH_LANE_WIDTH`, `STAGE_GUTTER` from `draw.ts`
  - `<Stage ring={...} notes={...} paused={...} />` where `notes` is a **stable array mutated in place** by App — never replaced, so this component can read it every frame without re-rendering.

  Used by Tasks 14, 16.

- [ ] **Step 1: Write the failing test**

Create `src/ui/Stage/geometry.test.ts`:

```ts
import { DEFAULT_GEOMETRY } from './timeToY';
import { breathToX, meterFillHeight, noteRect, pitchToX } from './geometry';

const geometry = { height: 1000, ...DEFAULT_GEOMETRY };
const layout = { width: 600, pitchMin: 48, pitchMax: 84 };

describe('pitchToX', () => {
  it('places the lowest pitch at the left edge', () => {
    expect(pitchToX(48, layout)).toBe(0);
  });

  it('places the highest pitch at the right edge', () => {
    expect(pitchToX(84, layout)).toBe(600);
  });

  it('places middle pitches proportionally', () => {
    expect(pitchToX(66, layout)).toBe(300);
  });

  it('clamps pitches outside the configured range', () => {
    expect(pitchToX(12, layout)).toBe(0);
    expect(pitchToX(127, layout)).toBe(600);
  });
});

describe('breathToX', () => {
  it('maps silence to the baseline', () => {
    expect(breathToX(0, 40)).toBe(0);
  });

  it('maps maximum breath to the full lane width', () => {
    expect(breathToX(127, 40)).toBe(40);
  });

  it('maps mid breath proportionally', () => {
    expect(breathToX(64, 40)).toBeCloseTo(20.16, 1);
  });
});

describe('meterFillHeight', () => {
  it('shows nothing at no air (FR-12)', () => {
    expect(meterFillHeight(0, 200)).toBe(0);
  });

  it('fills completely at maximum air (FR-10, FR-12)', () => {
    expect(meterFillHeight(127, 200)).toBe(200);
  });

  it('fills proportionally at some air', () => {
    expect(meterFillHeight(64, 200)).toBeCloseTo(100.8, 1);
  });
});

describe('noteRect', () => {
  it('gives a sounding note a height reaching the now-line', () => {
    // Started 1000ms ago, still held: spans from the now-line down 60px.
    const rect = noteRect({ note: 66, start: 4000, end: null }, 5000, geometry, layout);
    expect(rect.y).toBeCloseTo(100);
    expect(rect.h).toBeCloseTo(60);
  });

  it('gives a finished note a height proportional to its duration', () => {
    // Ran 4000-4500, i.e. 500ms => 30px tall, ending 500ms ago => 30px below the line.
    const rect = noteRect({ note: 66, start: 4000, end: 4500 }, 5000, geometry, layout);
    expect(rect.y).toBeCloseTo(130);
    expect(rect.h).toBeCloseTo(30);
  });

  it('positions horizontally by pitch', () => {
    const rect = noteRect({ note: 66, start: 4000, end: null }, 5000, geometry, layout);
    expect(rect.x).toBeCloseTo(300);
  });

  it('gives a just-started note a minimum visible height', () => {
    const rect = noteRect({ note: 66, start: 5000, end: null }, 5000, geometry, layout);
    expect(rect.h).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/Stage/geometry.test.ts`
Expected: FAIL — cannot find module `./geometry`.

- [ ] **Step 3: Implement the geometry**

Create `src/ui/Stage/geometry.ts`:

```ts
import { nowLineY, timeToY, type StageGeometry } from './timeToY';

export interface NoteBlock {
  note: number;
  start: number;
  /** null while still sounding. */
  end: number | null;
}

export interface StageLayout {
  width: number;
  pitchMin: number;
  pitchMax: number;
}

export interface StageTokens {
  note: string;
  breath: string;
  now: string;
  surface: string;
  track: string;
}

const MIN_NOTE_HEIGHT_PX = 2;
const MIDI_MAX = 127;

export function pitchToX(note: number, layout: StageLayout): number {
  const clamped = Math.min(Math.max(note, layout.pitchMin), layout.pitchMax);
  const span = layout.pitchMax - layout.pitchMin;
  return ((clamped - layout.pitchMin) / span) * layout.width;
}

/** Breath deflects horizontally from a baseline at x = 0. */
export function breathToX(value: number, laneWidth: number): number {
  return (value / MIDI_MAX) * laneWidth;
}

/** The live level meter (FR-10): fills from the bottom, empty at no air, full at 127. */
export function meterFillHeight(value: number, height: number): number {
  return (value / MIDI_MAX) * height;
}

export function noteRect(
  block: NoteBlock,
  now: number,
  g: StageGeometry,
  layout: StageLayout,
): { x: number; y: number; w: number; h: number } {
  const yStart = timeToY(block.end ?? now, now, g);
  const yEnd = timeToY(block.start, now, g);
  return {
    x: pitchToX(block.note, layout),
    y: Math.max(yStart, nowLineY(g)),
    w: 10,
    h: Math.max(yEnd - yStart, MIN_NOTE_HEIGHT_PX),
  };
}

/**
 * Canvas cannot read CSS custom properties, so token values are resolved once
 * from the DOM and cached. Without this the stage silently ignores the theme.
 */
export function readTokens(el: HTMLElement): StageTokens {
  const style = getComputedStyle(el);
  return {
    note: style.getPropertyValue('--color-note').trim(),
    breath: style.getPropertyValue('--color-breath').trim(),
    now: style.getPropertyValue('--color-now').trim(),
    surface: style.getPropertyValue('--color-bg').trim(),
    track: style.getPropertyValue('--color-surface').trim(),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui/Stage/geometry.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Implement the drawing**

Create `src/ui/Stage/draw.ts`:

```ts
import { BreathRing } from '../../core/model/ringBuffer';
import {
  breathToX, meterFillHeight, noteRect,
  type NoteBlock, type StageLayout, type StageTokens,
} from './geometry';
import { nowLineY, timeToY, visibleWindowMs, type StageGeometry } from './timeToY';

export const METER_WIDTH = 12;
export const BREATH_LANE_WIDTH = 44;
/** Everything to the left of the note lane. */
export const STAGE_GUTTER = METER_WIDTH + BREATH_LANE_WIDTH;

export function drawStage(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  notes: NoteBlock[],
  g: StageGeometry,
  layout: StageLayout,
  tokens: StageTokens,
): void {
  const totalWidth = STAGE_GUTTER + layout.width;

  ctx.fillStyle = tokens.surface;
  ctx.fillRect(0, 0, totalWidth, g.height);

  drawMeter(ctx, ring, g, tokens);

  ctx.save();
  ctx.translate(METER_WIDTH, 0);
  drawBreath(ctx, now, ring, g, tokens);
  ctx.restore();

  ctx.save();
  ctx.translate(STAGE_GUTTER, 0);
  drawNotes(ctx, now, notes, g, layout, tokens);
  ctx.restore();

  const y = nowLineY(g);
  ctx.fillStyle = tokens.now;
  ctx.fillRect(0, y - 1, totalWidth, 2);
}

/** FR-10: the live level, spanning the instrument's full range. */
function drawMeter(
  ctx: CanvasRenderingContext2D,
  ring: BreathRing,
  g: StageGeometry,
  tokens: StageTokens,
): void {
  ctx.fillStyle = tokens.track;
  ctx.fillRect(0, 0, METER_WIDTH, g.height);

  const value = ring.latest?.value ?? 0;
  const h = meterFillHeight(value, g.height);
  ctx.fillStyle = tokens.breath;
  ctx.fillRect(0, g.height - h, METER_WIDTH, h);
}

function drawBreath(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  g: StageGeometry,
  tokens: StageTokens,
): void {
  const tMin = now - visibleWindowMs(g);
  ctx.beginPath();
  ctx.moveTo(0, nowLineY(g));
  let any = false;
  ring.forEachSince(tMin, (t, value) => {
    ctx.lineTo(breathToX(value, BREATH_LANE_WIDTH), timeToY(t, now, g));
    any = true;
  });
  if (!any) return;
  ctx.lineTo(0, g.height);
  ctx.closePath();
  ctx.fillStyle = tokens.breath;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tokens.breath;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  now: number,
  notes: NoteBlock[],
  g: StageGeometry,
  layout: StageLayout,
  tokens: StageTokens,
): void {
  ctx.fillStyle = tokens.note;
  for (const block of notes) {
    const rect = noteRect(block, now, g, layout);
    if (rect.y > g.height) continue;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}
```

- [ ] **Step 6: Implement the Stage component**

Create `src/ui/Stage/Stage.module.css`:

```css
.stage {
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--color-bg);
  border-radius: var(--radius);
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

Create `src/ui/Stage/Stage.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { BreathRing } from '../../core/model/ringBuffer';
import { STAGE_GUTTER, drawStage } from './draw';
import { readTokens, type NoteBlock } from './geometry';
import { DEFAULT_GEOMETRY } from './timeToY';
import styles from './Stage.module.css';

interface StageProps {
  ring: BreathRing;
  /**
   * Stable array owned by App and mutated in place — never replaced.
   * App does not re-render on note events, so a new array identity would never
   * reach this component. Read every frame, never through React state.
   */
  notes: NoteBlock[];
  paused: boolean;
}

const PITCH_MIN = 48;
const PITCH_MAX = 84;

export function Stage({ ring, notes, paused }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tokens = readTokens(canvas);
    let frame = 0;

    const render = () => {
      frame = requestAnimationFrame(render);
      // Pause freezes the display, not the instrument: the core keeps running so
      // connection state, disconnect detection, and breath detection still work.
      if (pausedRef.current) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawStage(
        ctx,
        performance.now(),
        ring,
        notes,
        { height: rect.height, ...DEFAULT_GEOMETRY },
        { width: rect.width - STAGE_GUTTER, pitchMin: PITCH_MIN, pitchMax: PITCH_MAX },
        tokens,
      );
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [ring, notes]);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
```

- [ ] **Step 7: Verify types and the suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Stage
git commit -m "feat: add canvas stage with breath lane and falling note blocks"
```

---

### Task 14: The history column

**Files:**
- Create: `src/ui/History/History.tsx`, `src/ui/History/History.module.css`, `src/ui/History/collide.ts`
- Test: `src/ui/History/collide.test.ts`, `src/ui/History/History.test.tsx`

**Interfaces:**
- Consumes: `pitchName` (Task 2); `nowLineY`, `DEFAULT_GEOMETRY` (Task 10); `NoteBlock` (Task 13).
- Produces:
  - `interface HistoryRow { note: number; start: number; offsetPx: number }`
  - `keepSpaced(notes: NoteBlock[], minSpacingPx: number, pxPerMs: number): HistoryRow[]`
  - `<History notes={...} paused={...} />` — same stable-array contract as `Stage`.

  Used by Task 16.

**The key realisation, which shapes this whole task:** every note scrolls at the same `pxPerMs`, so
the pixel distance between two labels is `(startA − startB) × pxPerMs` — **constant for all time**.
Two consequences:

1. Collision decisions never change once made, so `keepSpaced` needs no concept of "now" at all.
2. The whole label set moves as a rigid body, so **one `transform` on the container per frame** moves
   every row. Rows sit at fixed offsets and are never touched again.

React therefore re-renders only when a note is added or pruned — a few times a second. The fade
becomes a static CSS mask rather than per-row opacity, so no row needs per-frame work either.

- [ ] **Step 1: Write the failing test for collision handling**

Create `src/ui/History/collide.test.ts`:

```ts
import { DEFAULT_GEOMETRY } from '../Stage/timeToY';
import { keepSpaced } from './collide';

const { pxPerMs } = DEFAULT_GEOMETRY;

describe('keepSpaced', () => {
  it('returns newest first', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 4000, end: null }],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([62, 60]);
  });

  it('gives each row a fixed offset proportional to its start time', () => {
    // Rows are placed relative to a moving container, so the offset is
    // -start * pxPerMs and never changes.
    const rows = keepSpaced([{ note: 60, start: 4000, end: null }], 20, pxPerMs);
    expect(rows[0].offsetPx).toBeCloseTo(-240);
  });

  it('keeps the gap between rows equal to elapsed time', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 4000, end: null }],
      20, pxPerMs,
    );
    // 1000ms apart * 0.06 px/ms = 60px apart.
    expect(rows[1].offsetPx - rows[0].offsetPx).toBeCloseTo(60);
  });

  it('drops colliding labels rather than overlapping them', () => {
    // Three notes 100ms apart => 6px apart. With 20px minimum spacing only the
    // newest survives: a fast run shows blocks without labels, not mush.
    const rows = keepSpaced(
      [
        { note: 60, start: 4800, end: 4850 },
        { note: 62, start: 4900, end: 4950 },
        { note: 64, start: 5000, end: null },
      ],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([64]);
  });

  it('keeps labels that are far enough apart', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 5000, end: null }],
      20, pxPerMs,
    );
    expect(rows).toHaveLength(2);
  });

  it('measures spacing from the last kept row, not the last candidate', () => {
    // 60 and 62 are 100ms apart (6px, dropped). 64 is 1000ms before 62 — far
    // enough from 62, but 62 was never kept, so spacing is measured from 60.
    const rows = keepSpaced(
      [
        { note: 60, start: 5000, end: null },
        { note: 62, start: 4900, end: 4950 },
        { note: 64, start: 3900, end: 3950 },
      ],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([60, 64]);
  });

  it('handles no notes', () => {
    expect(keepSpaced([], 20, pxPerMs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/History/collide.test.ts`
Expected: FAIL — cannot find module `./collide`.

- [ ] **Step 3: Implement**

Create `src/ui/History/collide.ts`:

```ts
import type { NoteBlock } from '../Stage/geometry';

export interface HistoryRow {
  note: number;
  start: number;
  /** Fixed position relative to the scrolling container. Never changes. */
  offsetPx: number;
}

/**
 * Chooses which labels to show, newest first.
 *
 * Takes no `now`: every note scrolls at the same speed, so the distance between
 * two labels is (startA - startB) * pxPerMs — constant for all time. Collision
 * decisions are therefore time-invariant, and this can be a pure function of the
 * note start times.
 *
 * Below minSpacingPx, colliding labels are dropped rather than overlapped: a fast
 * run shows blocks without names instead of unreadable mush. Same problem and
 * same answer as map labelling.
 */
export function keepSpaced(
  notes: NoteBlock[],
  minSpacingPx: number,
  pxPerMs: number,
): HistoryRow[] {
  const kept: HistoryRow[] = [];
  for (const block of [...notes].sort((a, b) => b.start - a.start)) {
    const offsetPx = -block.start * pxPerMs;
    const last = kept.at(-1);
    // Measured against the last *kept* row: a dropped row must not reset the gap.
    if (last && offsetPx - last.offsetPx < minSpacingPx) continue;
    kept.push({ note: block.note, start: block.start, offsetPx });
  }
  return kept;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui/History/collide.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Write the failing History component test**

Create `src/ui/History/History.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import '../../i18n';
import { History } from './History';

describe('History', () => {
  it('shows both naming systems for every note, with no toggle (FR-7 deviation)', async () => {
    render(<History notes={[{ note: 70, start: 0, end: null }]} paused={false} />);
    expect(await screen.findByText('A♯4')).toBeInTheDocument();
    expect(screen.getByText('La♯4')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lists newest first (FR-9)', async () => {
    render(
      <History
        notes={[{ note: 60, start: 0, end: 100 }, { note: 72, start: 20000, end: null }]}
        paused={false}
      />,
    );
    await screen.findByText('C5');
    const names = screen.getAllByTestId('history-en').map((el) => el.textContent);
    expect(names).toEqual(['C5', 'C4']);
  });

  it('renders nothing when no notes have been played', () => {
    render(<History notes={[]} paused={false} />);
    expect(screen.queryAllByTestId('history-en')).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/ui/History/History.test.tsx`
Expected: FAIL — cannot find module `./History`.

- [ ] **Step 7: Implement the History component**

Create `src/ui/History/History.module.css`:

```css
.history {
  width: 92px;
  flex: none;
  position: relative;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: var(--radius);
  font-family: var(--font-ui);
  /* Positional fade — replaces per-row opacity, so no row needs per-frame work. */
  mask-image: linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%);
}

/* Moved as a rigid body: one transform per frame carries every row. */
.scroller {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  will-change: transform;
}

.row {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0 var(--space-2);
}

.en {
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-size: 0.85rem;
}

.eu {
  color: var(--color-text-muted);
  line-height: 1.05;
  font-size: 0.65rem;
}

.current .en {
  font-size: 1.35rem;
}

.current .eu {
  font-size: 0.8rem;
}
```

Create `src/ui/History/History.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { pitchName } from '../../core/model/pitch';
import type { NoteBlock } from '../Stage/geometry';
import { DEFAULT_GEOMETRY, nowLineY } from '../Stage/timeToY';
import { keepSpaced } from './collide';
import styles from './History.module.css';

interface HistoryProps {
  /** Stable array owned by App and mutated in place. Same contract as Stage. */
  notes: NoteBlock[];
  paused: boolean;
}

const MIN_SPACING_PX = 26;

export function History({ notes, paused }: HistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Bumped only when a note is added or pruned — a few times a second, never
  // at frame rate. Label motion is handled by the transform below, not by React.
  const [revision, setRevision] = useState(0);
  const rows = useMemo(
    () => keepSpaced(notes, MIN_SPACING_PX, DEFAULT_GEOMETRY.pxPerMs),
    // `notes` is mutated in place, so `revision` is what signals a real change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, revision],
  );

  useEffect(() => {
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    let frame = 0;
    let lastCount = -1;

    const tick = () => {
      frame = requestAnimationFrame(tick);

      if (notes.length !== lastCount) {
        lastCount = notes.length;
        setRevision((r) => r + 1);
      }

      // Pause freezes the display, not the instrument.
      if (pausedRef.current) return;

      const height = container.getBoundingClientRect().height;
      const line = nowLineY({ height, ...DEFAULT_GEOMETRY });
      // One transform carries every row: y = line + (now - start) * pxPerMs,
      // with the per-row half (-start * pxPerMs) baked into offsetPx.
      const y = line + performance.now() * DEFAULT_GEOMETRY.pxPerMs;
      scroller.style.transform = `translateY(${y}px)`;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [notes]);

  return (
    <div ref={containerRef} className={styles.history}>
      <div ref={scrollerRef} className={styles.scroller}>
        {rows.map((row, index) => {
          const name = pitchName(row.note);
          return (
            <div
              key={`${row.note}-${row.start}`}
              className={index === 0 ? `${styles.row} ${styles.current}` : styles.row}
              style={{ transform: `translateY(${row.offsetPx}px)` }}
            >
              <div className={styles.en} data-testid="history-en">
                {name.en}
                {name.octave}
              </div>
              <div className={styles.eu} data-testid="history-eu">
                {name.eu}
                {name.octave}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/ui/History`
Expected: PASS — 10 tests.

- [ ] **Step 9: Commit**

```bash
git add src/ui/History
git commit -m "feat: add history column with synced dual-notation labels"
```

---

### Task 15: The console logger

**Files:**
- Create: `src/debug/consoleLogger.ts`
- Test: `src/debug/consoleLogger.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `Unsubscribe` (Task 4); `EmeoEvent` (Task 1); `BreathDetector` (Task 6).
- Produces: `isDebugEnabled(search: string): boolean` and `attachConsoleLogger(events: EventBus<EmeoEvent>, detector: BreathDetector): Unsubscribe`.

  Used by Task 16.

**Why this replaces the UI panel:** business spec §89 gives the raw monitor two jobs — reassure the user data flows, and let the developer confirm the encoding. The live breath number and curve do the first better. The console does the second better. See design §3.1.

- [ ] **Step 1: Write the failing test**

Create `src/debug/consoleLogger.test.ts`:

```ts
import { EventBus } from '../core/bus';
import { BreathDetector } from '../core/midi/breathSource';
import type { EmeoEvent } from '../core/model/events';
import { attachConsoleLogger, isDebugEnabled } from './consoleLogger';

describe('isDebugEnabled', () => {
  it('is off by default', () => {
    expect(isDebugEnabled('')).toBe(false);
    expect(isDebugEnabled('?other=1')).toBe(false);
  });

  it('is on with ?debug', () => {
    expect(isDebugEnabled('?debug')).toBe(true);
    expect(isDebugEnabled('?debug=1')).toBe(true);
  });
});

describe('attachConsoleLogger', () => {
  it('logs raw messages in readable form', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    attachConsoleLogger(events, new BreathDetector());

    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 1 });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Note On'), expect.anything());
    spy.mockRestore();
  });

  it('announces the detected breath source once, not per message', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    const detector = new BreathDetector();
    attachConsoleLogger(events, detector);

    for (let i = 0; i < 30; i++) {
      const value = Math.round((i / 29) * 127);
      detector.observe({ type: 'cc', channel: 0, controller: 2, value, t: i * 10 });
      events.publish({ kind: 'raw', data: new Uint8Array([0xb0, 2, value]), t: i * 10 });
    }

    const announcements = info.mock.calls.filter(([msg]) =>
      String(msg).includes('breath source'),
    );
    expect(announcements).toHaveLength(1);
    expect(String(announcements[0][0])).toContain('CC2');
    vi.restoreAllMocks();
  });

  it('stops logging once detached', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    const off = attachConsoleLogger(events, new BreathDetector());
    off();

    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 1 });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/debug/consoleLogger.test.ts`
Expected: FAIL — cannot find module `./consoleLogger`.

- [ ] **Step 3: Implement**

Create `src/debug/consoleLogger.ts`:

```ts
import type { EventBus, Unsubscribe } from '../core/bus';
import type { BreathDetector } from '../core/midi/breathSource';
import { parseMidi } from '../core/midi/decode';
import { pitchName } from '../core/model/pitch';
import type { EmeoEvent } from '../core/model/events';

/**
 * Off by default, and it must stay that way.
 *
 * Breath arrives many times per second. console.log serializes its argument and,
 * with DevTools open, retains a reference to it — defeating garbage collection.
 * Left on in this hot path it measurably costs the smooth motion of FR-16.
 */
export function isDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

export function attachConsoleLogger(
  events: EventBus<EmeoEvent>,
  detector: BreathDetector,
): Unsubscribe {
  let announced = false;

  return events.subscribe((event) => {
    if (event.kind !== 'raw') return;

    console.debug(`[emeo] ${describe(event.data, event.t)}`, event.data);

    if (!announced && detector.resolved) {
      announced = true;
      const label = detector.resolved.kind === 'cc'
        ? `CC${detector.resolved.controller}`
        : 'Channel Pressure';
      console.info(`[emeo] detected breath source: ${label}`);
      console.table(detector.scoreboard());
    }
  });
}

function describe(data: Uint8Array, t: number): string {
  const msg = parseMidi(data, t);
  switch (msg.type) {
    case 'note-on': {
      const n = pitchName(msg.note);
      return `Note On  ${n.en}${n.octave} vel ${msg.velocity}`;
    }
    case 'note-off': {
      const n = pitchName(msg.note);
      return `Note Off ${n.en}${n.octave}`;
    }
    case 'cc':
      return `CC${msg.controller} ${msg.value}`;
    case 'channel-pressure':
      return `Pressure ${msg.value}`;
    case 'pitch-bend':
      return `Bend ${msg.value}`;
    default:
      return `Other [${[...data].join(' ')}]`;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/debug/consoleLogger.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/debug
git commit -m "feat: add flag-gated console raw monitor"
```

---

### Task 16: Wire it together

**Files:**
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Create: `src/ui/App.module.css`, `src/ui/BreathReadout/BreathReadout.tsx`, `src/ui/BreathReadout/BreathReadout.module.css`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–15.
- Produces: the running application.

- [ ] **Step 1: Write the failing integration test**

Create `src/ui/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSyntheticEnvironment } from '../dev/syntheticEmeo';
import '../i18n';
import { App } from './App';

describe('App', () => {
  it('shows Not connected on load, with a hint (§156)', () => {
    render(<App environment={createSyntheticEnvironment()} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/Connect your EMEO/)).toBeInTheDocument();
  });

  it('connects to the synthetic instrument and reports it', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Connected to Synthetic EMEO')).toBeInTheDocument();
  });

  it('prompts the player to blow until the breath source is detected', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/Blow into the EMEO/)).toBeInTheDocument();
  });

  it('toggles pause without disconnecting (design §7.5)', async () => {
    render(<App environment={createSyntheticEnvironment()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Connected to Synthetic EMEO');
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByText('Connected to Synthetic EMEO')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — `App` does not accept an `environment` prop / does not exist in this shape.

- [ ] **Step 3: Implement the breath readout**

Create `src/ui/BreathReadout/BreathReadout.module.css`:

```css
.readout {
  position: absolute;
  top: var(--space-1);
  left: var(--space-1);
  z-index: 2;
  font-family: var(--font-ui);
  pointer-events: none;
}

.value {
  font-weight: 800;
  font-size: 1.4rem;
  line-height: 1;
  color: var(--color-breath);
  font-variant-numeric: tabular-nums;
}

.max {
  font-size: 0.6rem;
  color: var(--color-text-muted);
}

.detecting {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  max-width: 120px;
}
```

Create `src/ui/BreathReadout/BreathReadout.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import styles from './BreathReadout.module.css';

interface BreathReadoutProps {
  /** null until the breath source is detected. */
  value: number | null;
}

const MIDI_MAX = 127;

export function BreathReadout({ value }: BreathReadoutProps) {
  const { t } = useTranslation();

  if (value === null) {
    return <div className={styles.readout}>
      <span className={styles.detecting}>{t('breath.detecting')}</span>
    </div>;
  }

  return (
    <div className={styles.readout}>
      <div className={styles.value}>{value}</div>
      <div className={styles.max}>{t('breath.outOf', { max: MIDI_MAX })}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement App**

Create `src/ui/App.module.css`:

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.body {
  flex: 1;
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  min-height: 0;
  position: relative;
}

.hint {
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: 0.8rem;
}
```

Replace `src/ui/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { browserEnvironment, type MidiEnvironment } from '../core/midi/access';
import { createEmeoConnection, type ConnectionState } from '../core/midi/connection';
import { BreathRing } from '../core/model/ringBuffer';
import { attachConsoleLogger, isDebugEnabled } from '../debug/consoleLogger';
import { startSynthetic } from '../dev/syntheticEmeo';
import { Header } from './Header/Header';
import { History } from './History/History';
import { BreathReadout } from './BreathReadout/BreathReadout';
import { Stage } from './Stage/Stage';
import type { NoteBlock } from './Stage/geometry';
import styles from './App.module.css';

interface AppProps {
  environment?: MidiEnvironment;
  synthetic?: boolean;
}

/** ~15s window at ~200 breath messages/sec, with headroom. */
const RING_CAPACITY = 8000;
const READOUT_HZ = 12;
/** Notes older than this are pruned. Well beyond the ~15s visible window. */
const NOTE_HISTORY_MS = 60_000;

export function App({ environment, synthetic = false }: AppProps) {
  const { t } = useTranslation();
  const env = useMemo(() => environment ?? browserEnvironment(), [environment]);
  const connection = useMemo(() => createEmeoConnection(env), [env]);

  // Written at MIDI rate, read at frame rate, never in React state.
  // `notes` is a STABLE array, mutated in place and never replaced: App does not
  // re-render on note events, so a new array identity would never reach Stage.
  const ring = useMemo(() => new BreathRing(RING_CAPACITY), []);
  const notes = useMemo<NoteBlock[]>(() => [], []);

  const [state, setState] = useState<ConnectionState>(connection.state);
  const [paused, setPaused] = useState(false);
  const [breath, setBreath] = useState<number | null>(null);

  useEffect(() => connection.onStateChange(setState), [connection]);

  useEffect(() => {
    if (!isDebugEnabled(window.location.search)) return;
    return attachConsoleLogger(connection.events, connection.detector);
  }, [connection]);

  useEffect(() => {
    let lastReadout = 0;
    return connection.events.subscribe((event) => {
      if (event.kind === 'breath') {
        ring.push(event.t, event.value);
        // Throttled: a numeral changing 200 times a second cannot be read, and
        // one setState per sample would re-render React at MIDI rate.
        if (event.t - lastReadout >= 1000 / READOUT_HZ) {
          lastReadout = event.t;
          setBreath(event.value);
        }
        return;
      }
      if (event.kind === 'note-on') {
        notes.push({ note: event.note, start: event.t, end: null });
        // Prune in place — splice, never reassign.
        const cutoff = event.t - NOTE_HISTORY_MS;
        while (notes.length > 0 && (notes[0].end ?? Infinity) < cutoff) notes.shift();
        return;
      }
      if (event.kind === 'note-off') {
        const open = notes.findLast((n) => n.note === event.note && n.end === null);
        if (open) open.end = event.t;
      }
    });
  }, [connection, ring, notes]);

  useEffect(() => {
    if (!synthetic || state.status !== 'connected') return;
    return startSynthetic(env);
  }, [synthetic, state.status, env]);

  const clear = () => {
    ring.clear();
    notes.length = 0; // In place: Stage and History hold this exact array.
    setBreath(null);
    // Breath detection deliberately survives Clear (design §7.5) — re-detecting
    // would make the player blow again for nothing.
  };

  return (
    <div className={styles.app}>
      <Header
        state={state}
        onConnect={() => void connection.connect()}
        onDisconnect={() => connection.disconnect()}
        onChoosePort={(id) => connection.choosePort(id)}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onClear={clear}
      />

      {state.status === 'idle' && <p className={styles.hint}>{t('connection.hint')}</p>}

      <div className={styles.body}>
        <BreathReadout value={breath} />
        <Stage ring={ring} notes={notes} paused={paused} />
        <History notes={notes} paused={paused} />
      </div>
    </div>
  );
}
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './i18n';
import { App } from './ui/App';
import { createSyntheticEnvironment } from './dev/syntheticEmeo';

const useSynthetic = new URLSearchParams(window.location.search).has('synthetic');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      environment={useSynthetic ? createSyntheticEnvironment() : undefined}
      synthetic={useSynthetic}
    />
  </StrictMode>,
);
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — all tests, including the core boundary.

- [ ] **Step 7: Verify by hand against the synthetic instrument**

Run: `npm run dev`

Open `http://localhost:5173/?synthetic&debug` and confirm:

- The header reads *Not connected* with the hint below it.
- Clicking **Connect** shows *Connected to Synthetic EMEO*.
- Within ~2 seconds the breath readout replaces "Blow into the EMEO…" with a number counting under "of 127".
- The meter on the far left rises and falls with the breath value, empty at no air and full at 127 (FR-10, FR-12).
- The breath curve scrolls downward and the note blocks fall.
- History labels ride beside their blocks showing both `C4` and `Do4`, drifting down in step with them and fading toward the bottom.
- The console prints `[emeo] detected breath source: CC2` **once**, followed by a scoreboard table.
- **Pause** freezes the picture; the header still reads *Connected*. **Resume** jumps to the present.
- **Clear** empties the stage; the breath number reappears without re-prompting to blow.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire EMEO Live Monitor together with synthetic demo mode"
```

---

## Verification against real hardware

The plan above is complete without an EMEO. These checks require one, and they answer the questions
design §12 flagged. Run them once hardware is available.

- [ ] Open the app over `localhost` (or HTTPS) with `?debug`, connect the EMEO by cable, and play.
- [ ] Read the console's `detected breath source` line. **Record the answer in design §12.1.** If it
      is not CC2, no code changes — that is the detector working.
- [ ] Check the scoreboard table for a second continuous control. If one exists, that is likely bite
      or expression data (§187). Record it; do not act on it in v1.
- [ ] Play a written C4 and read the note name. If it shows E♭, the EMEO transmits concert pitch;
      if C, it transmits written pitch. **Record the answer in design §12.3.**
- [ ] Blow as hard as possible and read the peak breath number. If it never approaches 127, record
      the real ceiling in design §12.4.
- [ ] Unplug the cable mid-phrase. Confirm the header reports the connection lost, the curve freezes
      rather than clearing, and Reconnect works (FR-17).
- [ ] Play a fast run and confirm history labels thin out rather than overlapping (design §7.3).
