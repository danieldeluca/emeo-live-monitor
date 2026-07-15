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

  it.each([
    [60, 'C', 'Do'],
    [61, 'C♯', 'Do♯'],
    [62, 'D', 'Ré'],
    [63, 'D♯', 'Ré♯'],
    [64, 'E', 'Mi'],
    [65, 'F', 'Fa'],
    [66, 'F♯', 'Fa♯'],
    [67, 'G', 'Sol'],
    [68, 'G♯', 'Sol♯'],
    [69, 'A', 'La'],
    [70, 'A♯', 'La♯'],
    [71, 'B', 'Si'],
  ])('names MIDI %i as %s / %s in octave 4', (midi, en, eu) => {
    expect(pitchName(midi)).toMatchObject({ en, eu, octave: 4 });
  });
});
