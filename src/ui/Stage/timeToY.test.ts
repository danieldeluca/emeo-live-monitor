import { DEFAULT_GEOMETRY, nowLineY, timeToY, visibleWindowMs } from './timeToY';

const geometry = { height: 1000, ...DEFAULT_GEOMETRY };

describe('timeToY', () => {
  it('puts the now-line at the configured fraction of height', () => {
    expect(nowLineY(geometry)).toBe(100);
  });

  it('places an event happening now on the now-line', () => {
    expect(timeToY(5000, 5000, geometry)).toBe(100);
  });

  it('places past events below the now-line', () => {
    // 1000ms ago * 0.06 px/ms = 60px below.
    expect(timeToY(4000, 5000, geometry)).toBeCloseTo(160);
  });

  it('places future events above the now-line, with no special case', () => {
    // This is what re-parameterises the monitor into the sight-reading trainer:
    // a note yet to be played has t > now, so the subtraction goes negative.
    expect(timeToY(6000, 5000, geometry)).toBeCloseTo(40);
  });

  it('computes the visible window from the space below the now-line', () => {
    // (1000 - 100) / 0.06 = 15000ms
    expect(visibleWindowMs(geometry)).toBeCloseTo(15000);
  });

  it('scales with a different scroll speed', () => {
    const fast = { ...geometry, pxPerMs: 0.12 };
    expect(timeToY(4000, 5000, fast)).toBeCloseTo(220);
    expect(visibleWindowMs(fast)).toBeCloseTo(7500);
  });
});
