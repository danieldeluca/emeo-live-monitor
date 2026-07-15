import { DEFAULT_GEOMETRY } from '../Stage/timeToY';
import { keepSpaced } from './collide';

const { pxPerMs } = DEFAULT_GEOMETRY;

describe('keepSpaced', () => {
  it('returns newest first', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 4000, end: null }],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([62, 60]);
  });

  it('gives each row a fixed offset proportional to its start time', () => {
    // Rows are placed relative to a moving container, so the offset is
    // -start * pxPerMs and never changes.
    const rows = keepSpaced([{ note: 60, start: 4000, end: null }], 20, pxPerMs);
    expect(rows[0].offsetPx).toBeCloseTo(-240);
  });

  it('keeps the gap between rows equal to elapsed time', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 4000, end: null }],
      20, pxPerMs,
    );
    // 1000ms apart * 0.06 px/ms = 60px apart.
    expect(rows[1].offsetPx - rows[0].offsetPx).toBeCloseTo(60);
  });

  it('drops colliding labels rather than overlapping them', () => {
    // Three notes 100ms apart => 6px apart. With 20px minimum spacing only the
    // newest survives: a fast run shows blocks without labels, not mush.
    const rows = keepSpaced(
      [
        { note: 60, start: 4800, end: 4850 },
        { note: 62, start: 4900, end: 4950 },
        { note: 64, start: 5000, end: null },
      ],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([64]);
  });

  it('keeps labels that are far enough apart', () => {
    const rows = keepSpaced(
      [{ note: 60, start: 3000, end: 3500 }, { note: 62, start: 5000, end: null }],
      20, pxPerMs,
    );
    expect(rows).toHaveLength(2);
  });

  it('measures spacing from the last kept row, not the last candidate', () => {
    // 60 and 62 are 100ms apart (6px, dropped). 64 is 1000ms before 62 — far
    // enough from 62, but 62 was never kept, so spacing is measured from 60.
    const rows = keepSpaced(
      [
        { note: 60, start: 5000, end: null },
        { note: 62, start: 4900, end: 4950 },
        { note: 64, start: 3900, end: 3950 },
      ],
      20, pxPerMs,
    );
    expect(rows.map((r) => r.note)).toEqual([60, 64]);
  });

  it('handles no notes', () => {
    expect(keepSpaced([], 20, pxPerMs)).toEqual([]);
  });
});
