import { createDivergenceTracker, isSplit } from './breathDivergence';

describe('createDivergenceTracker', () => {
  it('starts with no divergence recorded', () => {
    const tracker = createDivergenceTracker(2);
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });

  it('stays undiverged across identical frames', () => {
    // Three same-value same-t samples per frame, across several frames — the
    // EMEO's default "all three CCs mirror breath" behaviour (design §15.4).
    const tracker = createDivergenceTracker(2);
    for (const t of [0, 10, 20, 30]) {
      tracker.observe('cc2', 64, t);
      tracker.observe('cc11', 64, t);
      tracker.observe('cc7', 64, t);
    }
    // Force the last frame (t=30) to complete by starting a new one.
    tracker.observe('cc2', 64, 40);
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });

  it('records divergence when a completed frame spreads past tolerance', () => {
    const tracker = createDivergenceTracker(2);
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc11', 70, 10); // spread 6 > tolerance 2
    tracker.observe('cc7', 64, 10);
    // Frame t=10 is not evaluated until the next frame's first sample arrives.
    tracker.observe('cc2', 64, 20);
    expect(tracker.lastDivergenceT).toBe(10);
  });

  it('does not treat spread exactly equal to tolerance as divergence', () => {
    const tracker = createDivergenceTracker(2);
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc11', 66, 10); // spread exactly 2
    tracker.observe('cc2', 64, 20); // completes frame 10
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });

  it('evaluates a completed frame only when the next frame first sample arrives', () => {
    const tracker = createDivergenceTracker(2);
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc11', 70, 10); // spread 6 > tolerance — but frame 10 isn't complete yet
    expect(tracker.lastDivergenceT).toBe(-Infinity);

    tracker.observe('cc7', 64, 10); // still frame 10, still not complete
    expect(tracker.lastDivergenceT).toBe(-Infinity);

    tracker.observe('cc2', 64, 20); // new t: frame 10 is now complete and evaluated
    expect(tracker.lastDivergenceT).toBe(10);
  });

  it('never diverges on a single-sample frame', () => {
    const tracker = createDivergenceTracker(2);
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc2', 999, 20); // completes frame 10, which had exactly one sample
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });

  it('resolves the same sourceKey appearing twice in one frame with last value wins', () => {
    const tracker = createDivergenceTracker(2);
    // Same key reported twice within frame t=10: 64 then 70. If the stale 64
    // still counted, spread against cc11's 65 would be 6 (diverges); with
    // last-value-wins, cc2 is really 70, so spread against 65 is only 5 —
    // still diverges either way, so use a case that flips the verdict.
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc11', 65, 10);
    tracker.observe('cc2', 65, 10); // overwrites cc2's 64 with 65 — spread now 0
    tracker.observe('cc2', 65, 20); // completes frame 10
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });

  it('resets to -Infinity and forgets the in-progress frame', () => {
    const tracker = createDivergenceTracker(2);
    tracker.observe('cc2', 64, 10);
    tracker.observe('cc11', 70, 10);
    tracker.reset();
    expect(tracker.lastDivergenceT).toBe(-Infinity);

    // The in-progress frame (t=10) is forgotten: a new sample at a later t
    // must not resurrect it as "the previous frame" to evaluate.
    tracker.observe('cc7', 64, 20);
    tracker.observe('cc2', 64, 30);
    expect(tracker.lastDivergenceT).toBe(-Infinity);
  });
});

describe('isSplit', () => {
  it('is true when the last divergence is still within the window', () => {
    expect(isSplit(15000, 5000, 15000)).toBe(true);
  });

  it('is true exactly at the window boundary', () => {
    expect(isSplit(20000, 5000, 15000)).toBe(true);
  });

  it('is false once the last divergence has scrolled off the window', () => {
    expect(isSplit(20001, 5000, 15000)).toBe(false);
  });

  it('is false before any divergence has ever been seen', () => {
    // now - (-Infinity) is Infinity, which is not <= windowMs.
    expect(isSplit(5000, -Infinity, 15000)).toBe(false);
  });
});
