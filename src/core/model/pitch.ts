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
