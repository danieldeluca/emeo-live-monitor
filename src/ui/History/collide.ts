import type { NoteBlock } from '../Stage/geometry';

export interface HistoryRow {
  note: number;
  start: number;
  /** Fixed position relative to the scrolling container. Never changes. */
  offsetPx: number;
}

/**
 * Chooses which labels to show, newest first.
 *
 * Takes no `now`: every note scrolls at the same speed, so the distance between
 * two labels is (startA - startB) * pxPerMs — constant for all time. Collision
 * decisions are therefore time-invariant, and this can be a pure function of the
 * note start times.
 *
 * Below minSpacingPx, colliding labels are dropped rather than overlapped: a fast
 * run shows blocks without names instead of unreadable mush. Same problem and
 * same answer as map labelling.
 */
export function keepSpaced(
  notes: NoteBlock[],
  minSpacingPx: number,
  pxPerMs: number,
): HistoryRow[] {
  const kept: HistoryRow[] = [];
  for (const block of [...notes].sort((a, b) => b.start - a.start)) {
    const offsetPx = -block.start * pxPerMs;
    const last = kept.at(-1);
    // Measured against the last *kept* row: a dropped row must not reset the gap.
    if (last && offsetPx - last.offsetPx < minSpacingPx) continue;
    kept.push({ note: block.note, start: block.start, offsetPx });
  }
  return kept;
}
