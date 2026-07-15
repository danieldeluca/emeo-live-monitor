import type { MidiAccessLike } from './types';

export type SupportResult =
  | { ok: true }
  | { ok: false; reason: 'no-web-midi' | 'insecure-context' };

export interface MidiEnvironment {
  isSecureContext: boolean;
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
}

/**
 * Web MIDI exists only in a secure context (HTTPS or localhost).
 *
 * Secure context is checked first on purpose: browsers hide requestMIDIAccess on
 * insecure origins, so checking support first would report "unsupported browser"
 * to someone whose browser is fine and whose origin is not.
 */
export function checkMidiSupport(env: MidiEnvironment): SupportResult {
  if (!env.isSecureContext) return { ok: false, reason: 'insecure-context' };
  if (typeof env.requestMIDIAccess !== 'function') return { ok: false, reason: 'no-web-midi' };
  return { ok: true };
}

/** Reads the real browser. Kept separate so checkMidiSupport stays pure and testable. */
export function browserEnvironment(): MidiEnvironment {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: () => Promise<MidiAccessLike>;
  };
  return {
    isSecureContext: window.isSecureContext,
    requestMIDIAccess: nav.requestMIDIAccess
      ? () => nav.requestMIDIAccess!.call(navigator)
      : undefined,
  };
}
