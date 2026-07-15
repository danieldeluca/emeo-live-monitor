import { EventBus } from '../core/bus';
import { BreathDetector } from '../core/midi/breathSource';
import type { EmeoEvent } from '../core/model/events';
import { attachConsoleLogger, isDebugEnabled } from './consoleLogger';

describe('isDebugEnabled', () => {
  it('is off by default', () => {
    expect(isDebugEnabled('')).toBe(false);
    expect(isDebugEnabled('?other=1')).toBe(false);
  });

  it('is on with ?debug', () => {
    expect(isDebugEnabled('?debug')).toBe(true);
    expect(isDebugEnabled('?debug=1')).toBe(true);
  });
});

describe('attachConsoleLogger', () => {
  it('logs raw messages in readable form', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    attachConsoleLogger(events, new BreathDetector());

    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 1 });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Note On'), expect.anything());
    vi.restoreAllMocks();
  });

  it('F6: emits a one-time hint on attach that raw messages log at Verbose level', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();

    attachConsoleLogger(events, new BreathDetector());

    const hints = info.mock.calls.filter(([msg]) => String(msg).includes('Verbose'));
    expect(hints).toHaveLength(1);

    // Publishing more raw messages must not repeat the hint.
    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 1 });
    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 62, 100]), t: 2 });
    expect(info.mock.calls.filter(([msg]) => String(msg).includes('Verbose'))).toHaveLength(1);

    vi.restoreAllMocks();
  });

  it('announces the detected breath source once, not per message', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    const detector = new BreathDetector();
    attachConsoleLogger(events, detector);

    for (let i = 0; i < 30; i++) {
      const value = Math.round((i / 29) * 127);
      detector.observe({ type: 'cc', channel: 0, controller: 2, value, t: i * 10 });
      events.publish({ kind: 'raw', data: new Uint8Array([0xb0, 2, value]), t: i * 10 });
    }

    const announcements = info.mock.calls.filter(([msg]) =>
      String(msg).includes('breath source'),
    );
    expect(announcements).toHaveLength(1);
    expect(String(announcements[0][0])).toContain('CC2');
    vi.restoreAllMocks();
  });

  it('stops logging once detached', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const events = new EventBus<EmeoEvent>();
    const off = attachConsoleLogger(events, new BreathDetector());
    off();

    events.publish({ kind: 'raw', data: new Uint8Array([0x90, 60, 100]), t: 1 });

    expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
