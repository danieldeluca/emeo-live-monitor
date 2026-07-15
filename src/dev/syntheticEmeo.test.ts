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
