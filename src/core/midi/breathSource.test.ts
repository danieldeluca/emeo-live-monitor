import { BreathDetector } from './breathSource';
import type { MidiMessage } from './decode';

/** Emits `count` CC messages sweeping smoothly across the 0-127 range. */
function sweepCC(detector: BreathDetector, controller: number, count = 30, t0 = 0) {
  for (let i = 0; i < count; i++) {
    const msg: MidiMessage = {
      type: 'cc', channel: 0, controller,
      value: Math.round((i / (count - 1)) * 127),
      t: t0 + i * 10,
    };
    detector.observe(msg);
  }
}

function sweepPressure(detector: BreathDetector, count = 30, t0 = 0) {
  for (let i = 0; i < count; i++) {
    detector.observe({
      type: 'channel-pressure', channel: 0,
      value: Math.round((i / (count - 1)) * 127),
      t: t0 + i * 10,
    });
  }
}

describe('BreathDetector', () => {
  it('resolves nothing before any evidence', () => {
    expect(new BreathDetector().resolved).toBeNull();
  });

  it('detects CC2', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 2 });
  });

  it('detects CC11 when that is what moves', () => {
    const d = new BreathDetector();
    sweepCC(d, 11);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
  });

  it('detects channel pressure when that is what moves', () => {
    const d = new BreathDetector();
    sweepPressure(d);
    expect(d.resolved).toEqual({ kind: 'channel-pressure' });
  });

  it('ignores a switch-like control with too few distinct values', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'cc', channel: 0, controller: 64, value: i % 2 ? 127 : 0, t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('ignores a control with too small a range', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'cc', channel: 0, controller: 7, value: 60 + (i % 10), t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('prefers CC2 when two candidates both qualify', () => {
    const d = new BreathDetector();
    sweepCC(d, 11, 30, 0);
    sweepCC(d, 2, 30, 0);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 2 });
  });

  it('does not resolve on evidence spread beyond the window', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      // 500ms apart — only ~6 land inside a 3s window.
      d.observe({
        type: 'cc', channel: 0, controller: 2,
        value: Math.round((i / 29) * 127), t: i * 500,
      });
    }
    expect(d.resolved).toBeNull();
  });

  it('ignores messages that cannot carry breath', () => {
    const d = new BreathDetector();
    for (let i = 0; i < 30; i++) {
      d.observe({ type: 'note-on', channel: 0, note: 60, velocity: i, t: i * 10 });
    }
    expect(d.resolved).toBeNull();
  });

  it('reads values only from the resolved source once locked', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 2, value: 99, t: 400 })).toBe(99);
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 11, value: 42, t: 400 })).toBeNull();
    expect(d.valueOf({ type: 'note-on', channel: 0, note: 60, velocity: 1, t: 400 })).toBeNull();
  });

  it('returns null from valueOf before resolving', () => {
    const d = new BreathDetector();
    expect(d.valueOf({ type: 'cc', channel: 0, controller: 2, value: 99, t: 0 })).toBeNull();
  });

  it('stays locked once resolved even if another control becomes busier', () => {
    const d = new BreathDetector();
    sweepCC(d, 11);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
    sweepCC(d, 2, 30, 1000);
    expect(d.resolved).toEqual({ kind: 'cc', controller: 11 });
  });

  it('reports a scoreboard for diagnosis', () => {
    const d = new BreathDetector();
    sweepCC(d, 2, 30);
    const row = d.scoreboard().find((r) => r.label === 'CC2');
    expect(row).toMatchObject({ updates: 30, range: 127 });
  });

  it('resets', () => {
    const d = new BreathDetector();
    sweepCC(d, 2);
    d.reset();
    expect(d.resolved).toBeNull();
    expect(d.scoreboard()).toEqual([]);
  });
});
