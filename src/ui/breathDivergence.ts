/**
 * Detects when the tracked breath-controller family has diverged (design
 * §15.1). Pure: no react, no DOM, no clock — every timestamp is supplied by
 * the caller.
 *
 * The three breath CCs share the same MIDI `timeStamp` each frame, so samples
 * are grouped by `t` into frames. A frame's spread (max − min of its values)
 * is only knowable once every sample for that `t` has arrived — and there is
 * no explicit "frame done" signal — so a frame is evaluated a beat late, when
 * the *next* frame's first sample shows up with a new `t`. That is
 * imperceptible at ~10ms frames.
 */

export interface DivergenceTracker {
  /** Feeds one sample into the current frame. */
  observe(sourceKey: string, value: number, t: number): void;
  /** Timestamp of the most recent diverging frame, or `-Infinity` if none yet. */
  readonly lastDivergenceT: number;
  /** Clears all state, including the in-progress (not yet evaluated) frame. */
  reset(): void;
}

export function createDivergenceTracker(tolerance: number): DivergenceTracker {
  let lastDivergenceT = -Infinity;
  let frameT: number | null = null;
  // Latest value per source for the in-progress frame: same key twice in one
  // frame is last-value-wins, and this stays tiny (one entry per controller).
  const frameValues = new Map<string, number>();

  function evaluateFrame(): void {
    if (frameT === null) return;
    let min = Infinity;
    let max = -Infinity;
    for (const value of frameValues.values()) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min > tolerance) lastDivergenceT = frameT;
  }

  return {
    observe(sourceKey: string, value: number, t: number): void {
      if (frameT !== null && t !== frameT) {
        evaluateFrame();
        frameValues.clear();
      }
      frameT = t;
      frameValues.set(sourceKey, value);
    },
    get lastDivergenceT(): number {
      return lastDivergenceT;
    },
    reset(): void {
      lastDivergenceT = -Infinity;
      frameT = null;
      frameValues.clear();
    },
  };
}

/**
 * Whether the breath lane should currently show the split (multiple) curves:
 * true whenever a divergence is still visible somewhere in the scrolling
 * window, i.e. it hasn't scrolled off yet (design §15.1). Before any
 * divergence has ever been seen, `lastDivergenceT` is `-Infinity`, so
 * `now - lastDivergenceT` is `Infinity` and this is false — never split with
 * nothing to show.
 */
export function isSplit(now: number, lastDivergenceT: number, windowMs: number): boolean {
  return now - lastDivergenceT <= windowMs;
}
