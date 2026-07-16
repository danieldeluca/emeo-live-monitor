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

  it('emits CC2, CC11, and CC7 with identical values and a shared timestamp on each frame by default', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    const events: EmeoEvent[] = [];
    conn.events.subscribe((e: EmeoEvent) => events.push(e));
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(100);
    stop();

    const ccEvents = events.filter((e) => e.kind === 'raw' && e.data[0] === 0xb0);
    expect(ccEvents.length).toBeGreaterThan(0);

    const byTimestamp = new Map<number, number[]>();
    for (const e of ccEvents) {
      if (e.kind !== 'raw') continue;
      const list = byTimestamp.get(e.t) ?? [];
      list.push(e.data[1]);
      byTimestamp.set(e.t, list);
    }

    for (const [t, controllers] of byTimestamp) {
      // Emitted in order CC2, CC11, CC7 — CC2 first is what lets the
      // detector lock onto it.
      expect(controllers).toEqual([2, 11, 7]);
      const values = ccEvents
        .filter((e) => e.kind === 'raw' && e.t === t)
        .map((e) => (e.kind === 'raw' ? e.data[2] : -1));
      expect(new Set(values).size).toBe(1);
    }
  });

  it("qualifies CC2, CC11, and CC7 as the detector's breath-source family after enough time", async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(4000);
    stop();

    const sources = conn.detector.sources();
    expect(sources).toEqual(
      expect.arrayContaining([
        { kind: 'cc', controller: 2 },
        { kind: 'cc', controller: 11 },
        { kind: 'cc', controller: 7 },
      ]),
    );
    expect(sources).toHaveLength(3);
  });

  it('diverge:true offsets Expression and Volume from Breath by more than the divergence tolerance', async () => {
    const env = createSyntheticEnvironment({ diverge: true });
    const conn = createEmeoConnection(env);
    const events: EmeoEvent[] = [];
    conn.events.subscribe((e: EmeoEvent) => events.push(e));
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(1000);
    stop();

    const byTimestamp = new Map<number, Map<number, number>>();
    for (const e of events) {
      if (e.kind !== 'raw' || e.data[0] !== 0xb0) continue;
      const controller = e.data[1];
      const value = e.data[2];
      const forT = byTimestamp.get(e.t) ?? new Map<number, number>();
      forT.set(controller, value);
      byTimestamp.set(e.t, forT);
    }

    let sawDivergence = false;
    for (const frame of byTimestamp.values()) {
      const breath = frame.get(2);
      const expression = frame.get(11);
      const volume = frame.get(7);
      expect(breath).toBeDefined();
      expect(expression).toBeDefined();
      expect(volume).toBeDefined();
      if (breath === undefined || expression === undefined || volume === undefined) continue;

      // Breath (CC2) keeps the true value — Expression and Volume are
      // derived from it, never the other way round.
      expect(expression).toBe(Math.round(breath * 0.6));
      expect(volume).toBe(Math.max(0, Math.min(127, breath - 30)));

      const spread = Math.max(breath, expression, volume) - Math.min(breath, expression, volume);
      if (spread > 2) sawDivergence = true;
    }
    expect(sawDivergence).toBe(true);
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

  it('anchors emitted timestamps to performance.now() at start, not a zero-based clock', async () => {
    // Real MIDIMessageEvent.timeStamp shares the DOMHighResTimeStamp epoch with
    // performance.now(). Stage and History both draw using `performance.now()`
    // as "now" against event timestamps, so a synthetic clock starting at 0
    // creates a large, silent offset that pushes every note block and breath
    // sample off-canvas the moment real time has advanced past the visible
    // window (~15s) since the page loaded.
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    const events: EmeoEvent[] = [];
    conn.events.subscribe((e: EmeoEvent) => events.push(e));
    await conn.connect();

    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(50_000);
    const stop = startSynthetic(env);
    vi.advanceTimersByTime(30);
    stop();
    nowSpy.mockRestore();

    // `raw` fires unconditionally on every incoming message, unlike `breath`
    // (gated behind detector lock) or `note-on`/`note-off` (gated behind tempo
    // boundaries) — so it is the reliable signal within a short 30ms window.
    const rawEvents = events.filter((e) => e.kind === 'raw');
    expect(rawEvents.length).toBeGreaterThan(0);
    for (const e of rawEvents) {
      expect(e.t).toBeGreaterThanOrEqual(50_000);
    }
  });

  it('emits a note-off for the currently sounding note when stopped', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    const events: EmeoEvent[] = [];
    conn.events.subscribe((e: EmeoEvent) => events.push(e));
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(700);
    stop();

    const noteOffs = events.filter(e => e.kind === 'note-off');
    expect(noteOffs.length).toBeGreaterThan(0);
    expect(noteOffs[noteOffs.length - 1]).toMatchObject({ kind: 'note-off' });
  });

  it('stop() called twice does not emit a second note-off and does not throw', async () => {
    const env = createSyntheticEnvironment();
    const conn = createEmeoConnection(env);
    const events: EmeoEvent[] = [];
    conn.events.subscribe((e: EmeoEvent) => events.push(e));
    await conn.connect();
    const stop = startSynthetic(env);

    vi.advanceTimersByTime(700);
    stop();
    const eventCountAfterFirstStop = events.length;

    stop();
    const eventCountAfterSecondStop = events.length;

    expect(eventCountAfterSecondStop).toBe(eventCountAfterFirstStop);
  });
});
