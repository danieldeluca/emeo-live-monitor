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

/** CC2 is the MIDI standard's Breath Controller. It gets a prior, not a guarantee. */
const PRIOR_KEY = 'cc:2';

interface Sample {
  t: number;
  value: number;
}

/**
 * Decides at runtime which incoming control carries breath (FR-14).
 *
 * Scores every candidate — each CC number seen, plus channel pressure — over a
 * rolling window. Breath streams continuously across a wide range; a mod wheel
 * or a switch does not. Resolution is evaluated lazily, against the full
 * accumulated evidence, the first time `resolved` or `valueOf` is read —
 * not the instant a candidate first crosses the bar — so CC2's prior still
 * applies even when CC2's evidence arrives after another control already
 * qualifies. Once a source locks it stays locked for the session so the
 * display cannot flap mid-phrase.
 */
export class BreathDetector {
  private samples = new Map<string, Sample[]>();
  private locked: BreathSourceId | null = null;

  get resolved(): BreathSourceId | null {
    if (this.locked === null) this.tryLock();
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
  }

  valueOf(msg: MidiMessage): number | null {
    const locked = this.resolved;
    if (locked === null) return null;
    const key = keyOf(msg);
    if (key === null || key !== keyOfId(locked)) return null;
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
    const qualifying = [...this.samples.entries()].filter(([, list]) => {
      const s = stats(list);
      return s.updates >= MIN_UPDATES && s.distinct >= MIN_DISTINCT && s.range >= MIN_RANGE;
    });
    if (qualifying.length === 0) return;

    const prior = qualifying.find(([key]) => key === PRIOR_KEY);
    const winner =
      prior ?? qualifying.sort((a, b) => stats(b[1]).updates - stats(a[1]).updates)[0];
    this.locked = idOfKey(winner[0]);
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
