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
