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
