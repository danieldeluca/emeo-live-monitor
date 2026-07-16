import type { MidiEnvironment } from '../core/midi/access';
import type { BreathSourceId } from '../core/midi/breathSource';
import type { MidiAccessLike, MidiInputLike } from '../core/midi/types';

export interface SyntheticOptions {
  /**
   * Which single control the fake instrument uses for breath. When given,
   * only this source is emitted (e.g. to prove detection isn't CC-only via
   * `{ kind: 'channel-pressure' }`). When omitted (the default), the
   * synthetic mirrors real hardware: CC2 (Breath), CC11 (Expression), and
   * CC7 (Volume) every frame, in that order.
   */
  breathSource?: BreathSourceId;
  /** Milliseconds per note. Default: 600. */
  tempoMs?: number;
  /**
   * Only meaningful with the three-CC default (ignored when `breathSource`
   * is given). When true, offsets Expression and Volume from Breath by a
   * clear, sustained amount so the split multi-curve view can be exercised.
   * Breath (CC2) always carries the true value.
   */
  diverge?: boolean;
}

const BREATH_INTERVAL_MS = 10;
const PHRASE = [60, 62, 64, 65, 67, 69, 71, 72];

/** The real EMEO mirrors breath onto these three controllers, in this order. */
const BREATH_CC = 2;
const EXPRESSION_CC = 11;
const VOLUME_CC = 7;

interface SyntheticEnvironment extends MidiEnvironment {
  __input: MidiInputLike;
  __options: {
    breathSource?: BreathSourceId;
    tempoMs: number;
    diverge: boolean;
  };
  __running?: boolean;
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
      breathSource: options.breathSource,
      tempoMs: options.tempoMs ?? 600,
      diverge: options.diverge ?? false,
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
  if (env.__running) {
    throw new TypeError('startSynthetic is already running on this environment; call stop() first');
  }
  const { __input: input, __options: options } = env;
  env.__running = true;

  // Real MIDIMessageEvent.timeStamp is a DOMHighResTimeStamp — the same epoch
  // as performance.now(). Stage and History both draw using performance.now()
  // as "now" against event timestamps (see Stage.tsx), so a synthetic clock
  // that started counting from 0 would create a large, silent offset that
  // pushes every note block and breath sample off-canvas. `elapsed` still
  // starts at 0 and drives the phrase's internal timing (phase, note
  // boundaries) unchanged; only the timestamp actually emitted is anchored to
  // real time.
  const origin = performance.now();
  let elapsed = 0;
  let noteIndex = 0;
  let currentNote: number | null = null;

  const send = (...bytes: number[]) => {
    input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: origin + elapsed });
  };

  const sendBreath = (value: number) => {
    if (options.breathSource) {
      // A single custom source, e.g. channel pressure — proves the detector
      // isn't CC-specific. No mirroring in this mode.
      if (options.breathSource.kind === 'channel-pressure') send(0xd0, value);
      else send(0xb0, options.breathSource.controller, value);
      return;
    }
    // Default: mirror real hardware, which sends CC2/CC11/CC7 every frame
    // with identical values, sharing the same timestamp. CC2 goes first so
    // detection locks onto it, exactly as the real EMEO does.
    const expression = options.diverge ? Math.round(value * 0.6) : value;
    const volume = options.diverge ? Math.max(0, Math.min(127, value - 30)) : value;
    send(0xb0, BREATH_CC, value);
    send(0xb0, EXPRESSION_CC, expression);
    send(0xb0, VOLUME_CC, volume);
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
    currentNote = null;
    env.__running = false;
  };
}
