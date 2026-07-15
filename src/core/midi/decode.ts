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
