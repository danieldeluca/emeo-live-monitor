export interface StageGeometry {
  height: number;
  /** Now-line position as a fraction of height. */
  nowLineFraction: number;
  /** Scroll speed. */
  pxPerMs: number;
}

/** Development constants, not user-facing controls. ~15s window on a 900px stage. */
export const DEFAULT_GEOMETRY = {
  nowLineFraction: 0.1,
  pxPerMs: 0.06,
} as const;

export function nowLineY(g: StageGeometry): number {
  return g.height * g.nowLineFraction;
}

/**
 * The single time→pixel mapping. Canvas and DOM both call it, so their
 * alignment is exact by construction rather than by coincidence.
 *
 * A future event (t > now) yields y < nowLineY and renders above the line,
 * descending toward it — no branch. That is what turns this monitor into the
 * sight-reading trainer: move nowLineFraction down and feed it future notes.
 */
export function timeToY(t: number, now: number, g: StageGeometry): number {
  return nowLineY(g) + (now - t) * g.pxPerMs;
}

export function visibleWindowMs(g: StageGeometry): number {
  return (g.height - nowLineY(g)) / g.pxPerMs;
}
