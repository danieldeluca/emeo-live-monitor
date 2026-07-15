import { browserEnvironment, checkMidiSupport } from './access';
import type { MidiAccessLike } from './types';

describe('checkMidiSupport', () => {
  it('accepts a secure context that exposes Web MIDI', () => {
    expect(checkMidiSupport({ isSecureContext: true, requestMIDIAccess: async () => ({} as never) }))
      .toEqual({ ok: true });
  });

  it('reports an insecure context', () => {
    expect(checkMidiSupport({ isSecureContext: false, requestMIDIAccess: async () => ({} as never) }))
      .toEqual({ ok: false, reason: 'insecure-context' });
  });

  it('reports a missing Web MIDI implementation', () => {
    expect(checkMidiSupport({ isSecureContext: true }))
      .toEqual({ ok: false, reason: 'no-web-midi' });
  });

  it('blames the insecure context first, since that is the root cause', () => {
    // Browsers hide requestMIDIAccess on insecure origins. Reporting "unsupported"
    // would send the user to change browsers when they need HTTPS.
    expect(checkMidiSupport({ isSecureContext: false }))
      .toEqual({ ok: false, reason: 'insecure-context' });
  });
});

describe('browserEnvironment', () => {
  afterEach(() => {
    // jsdom does not implement Web MIDI, so any requestMIDIAccess seen here was
    // installed by a test. Remove it so nothing leaks into other test files.
    delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });

  it('preserves navigator as the receiver when calling requestMIDIAccess', async () => {
    // Simulates a real browser's native method: native implementations throw
    // "Illegal invocation" synchronously when called with a detached `this`,
    // which is exactly what `nav.requestMIDIAccess: nav.requestMIDIAccess`
    // (no `.call(navigator)`) would trigger once the returned environment's
    // method is invoked on its own.
    const sentinel = { sentinel: true } as unknown as MidiAccessLike;
    function fakeRequestMIDIAccess(this: unknown): Promise<MidiAccessLike> {
      if (this !== navigator) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(sentinel);
    }
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: fakeRequestMIDIAccess,
      configurable: true,
    });

    await expect(browserEnvironment().requestMIDIAccess!()).resolves.toBe(sentinel);
  });

  it('reports requestMIDIAccess as undefined when Web MIDI is absent', () => {
    expect(browserEnvironment().requestMIDIAccess).toBeUndefined();
  });

  it('passes isSecureContext through from window', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    try {
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      expect(browserEnvironment().isSecureContext).toBe(true);

      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      expect(browserEnvironment().isSecureContext).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'isSecureContext', original);
    }
  });
});
