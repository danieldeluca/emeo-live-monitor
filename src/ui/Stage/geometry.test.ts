import { DEFAULT_GEOMETRY } from './timeToY';
import { breathToX, meterFillHeight, noteRect, pitchToX } from './geometry';

const geometry = { height: 1000, ...DEFAULT_GEOMETRY };
const layout = { width: 600, pitchMin: 48, pitchMax: 84 };

describe('pitchToX', () => {
  it('places the lowest pitch at the left edge', () => {
    expect(pitchToX(48, layout)).toBe(0);
  });

  it('places the highest pitch at the right edge', () => {
    expect(pitchToX(84, layout)).toBe(600);
  });

  it('places middle pitches proportionally', () => {
    expect(pitchToX(66, layout)).toBe(300);
  });

  it('clamps pitches outside the configured range', () => {
    expect(pitchToX(12, layout)).toBe(0);
    expect(pitchToX(127, layout)).toBe(600);
  });
});

describe('breathToX', () => {
  it('maps silence to the baseline', () => {
    expect(breathToX(0, 40)).toBe(0);
  });

  it('maps maximum breath to the full lane width', () => {
    expect(breathToX(127, 40)).toBe(40);
  });

  it('maps mid breath proportionally', () => {
    expect(breathToX(64, 40)).toBeCloseTo(20.16, 1);
  });
});

describe('meterFillHeight', () => {
  it('shows nothing at no air (FR-12)', () => {
    expect(meterFillHeight(0, 200)).toBe(0);
  });

  it('fills completely at maximum air (FR-10, FR-12)', () => {
    expect(meterFillHeight(127, 200)).toBe(200);
  });

  it('fills proportionally at some air', () => {
    expect(meterFillHeight(64, 200)).toBeCloseTo(100.8, 1);
  });
});

describe('noteRect', () => {
  it('gives a sounding note a height reaching the now-line', () => {
    // Started 1000ms ago, still held: spans from the now-line down 60px.
    const rect = noteRect({ note: 66, start: 4000, end: null }, 5000, geometry, layout);
    expect(rect.y).toBeCloseTo(100);
    expect(rect.h).toBeCloseTo(60);
  });

  it('gives a finished note a height proportional to its duration', () => {
    // Ran 4000-4500, i.e. 500ms => 30px tall, ending 500ms ago => 30px below the line.
    const rect = noteRect({ note: 66, start: 4000, end: 4500 }, 5000, geometry, layout);
    expect(rect.y).toBeCloseTo(130);
    expect(rect.h).toBeCloseTo(30);
  });

  it('positions horizontally by pitch', () => {
    const rect = noteRect({ note: 66, start: 4000, end: null }, 5000, geometry, layout);
    expect(rect.x).toBeCloseTo(300);
  });

  it('gives a just-started note a minimum visible height', () => {
    const rect = noteRect({ note: 66, start: 5000, end: null }, 5000, geometry, layout);
    expect(rect.h).toBeGreaterThan(0);
  });
});
