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
 * unconfirmed. Evaluation happens per incoming message, and only one
 * candidate's evidence is updated per message, so at most one candidate can
 * ever qualify in a given evaluation — there is no tie to break. Once a
 * source locks it stays locked for the session so the display cannot flap
 * mid-phrase — that first source is the primary (`resolved`). Scoring keeps
 * running afterwards: any later candidate that clears the thresholds joins
 * the qualified set alongside it (`sources()`), so the real EMEO's habit of
 * mirroring breath onto CC2, CC11, and CC7 at once can be tracked as a whole
 * family rather than just one winner.
 */
export class BreathDetector {
  private samples = new Map<string, Sample[]>();
  private locked: BreathSourceId | null = null;
  private qualified: string[] = [];

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

    this.tryQualify(key, list);
  }

  /** Primary-only. Kept for existing callers; delegates to breathValueOf. */
  valueOf(msg: MidiMessage): number | null {
    if (this.locked === null) return null;
    const key = keyOf(msg);
    if (key === null || key !== keyOfId(this.locked)) return null;
    return breathValue(msg);
  }

  /** Every source that has qualified, primary first, then in qualifying order. */
  sources(): BreathSourceId[] {
    return this.qualified.map(idOfKey);
  }

  /** The value for any already-qualified source this message belongs to. */
  breathValueOf(msg: MidiMessage): { source: BreathSourceId; value: number } | null {
    const key = keyOf(msg);
    if (key === null || !this.qualified.includes(key)) return null;
    const value = breathValue(msg);
    if (value === null) return null;
    return { source: idOfKey(key), value };
  }

  scoreboard(): ScoreRow[] {
    return [...this.samples.entries()]
      .map(([key, list]) => ({ ...stats(list), id: idOfKey(key), label: labelOfKey(key) }))
      .sort((a, b) => b.updates - a.updates);
  }

  reset(): void {
    this.samples.clear();
    this.locked = null;
    this.qualified = [];
  }

  private tryQualify(key: string, list: Sample[]): void {
    // Already-qualified keys skip scoring entirely: their qualification (and
    // primary-lock status) can never change, so re-running stats() — which
    // allocates a Set and rescans the whole window — on every message
    // forever would be pure waste. Keys that have not qualified yet keep
    // paying that cost on every message, including ones that never will
    // (e.g. a mod wheel): they still need watching in case they start
    // behaving like breath later.
    if (this.qualified.includes(key)) return;
    const s = stats(list);
    if (s.updates >= MIN_UPDATES && s.distinct >= MIN_DISTINCT && s.range >= MIN_RANGE) {
      this.qualified.push(key);
      if (this.locked === null) this.locked = idOfKey(key);
    }
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
