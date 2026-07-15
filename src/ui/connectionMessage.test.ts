import { connectionMessageKey } from './connectionMessage';

describe('connectionMessageKey', () => {
  it('maps each connection state to a specific key, never a generic failure', () => {
    expect(connectionMessageKey({ status: 'idle' })).toBe('connection.idle');
    expect(connectionMessageKey({ status: 'requesting' })).toBe('connection.requesting');
    expect(connectionMessageKey({ status: 'choosing', ports: [] })).toBe('connection.choosing');
    expect(connectionMessageKey({ status: 'connected', port: { id: 'a', name: 'EMEO' } }))
      .toBe('connection.connected');
    expect(connectionMessageKey({ status: 'lost', port: { id: 'a', name: 'EMEO' } }))
      .toBe('connection.lost');
  });

  it('maps unsupported reasons to their own explanations (FR-5)', () => {
    expect(connectionMessageKey({ status: 'unsupported', reason: 'insecure-context' }))
      .toBe('errors.insecureContext');
    expect(connectionMessageKey({ status: 'unsupported', reason: 'no-web-midi' }))
      .toBe('errors.noWebMidi');
  });

  it('maps each error code to its own explanation', () => {
    expect(connectionMessageKey({ status: 'error', error: { code: 'no-ports' } }))
      .toBe('errors.noPorts');
    expect(connectionMessageKey({ status: 'error', error: { code: 'permission-denied' } }))
      .toBe('errors.permissionDenied');
    expect(connectionMessageKey({ status: 'error', error: { code: 'unknown' } }))
      .toBe('errors.unknown');
  });
});
