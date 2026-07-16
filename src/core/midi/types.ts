/**
 * Minimal structural interfaces for the Web MIDI surface we actually use.
 *
 * Defined here rather than relying on lib.dom's MIDI types so the core does not
 * depend on which TypeScript lib version ships them, and so fakes (Task 9) are
 * plain objects rather than DOM class instances.
 */
export interface MidiMessageEventLike {
  data: Uint8Array;
  /** DOMHighResTimeStamp — same clock as performance.now(). */
  timeStamp: number;
}

export interface MidiInputLike {
  id: string;
  name: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}

export interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: ((event: { port: MidiInputLike }) => void) | null;
}
