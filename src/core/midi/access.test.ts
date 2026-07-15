import { checkMidiSupport } from './access';

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
