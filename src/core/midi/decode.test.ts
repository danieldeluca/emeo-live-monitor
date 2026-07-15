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
