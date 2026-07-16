import type { BreathSourceId } from '../midi/breathSource';

export type EmeoEvent =
  | { kind: 'note-on'; note: number; velocity: number; t: number }
  | { kind: 'note-off'; note: number; t: number }
  | { kind: 'breath'; source: BreathSourceId; value: number; t: number }
  | { kind: 'raw'; data: Uint8Array; t: number };
