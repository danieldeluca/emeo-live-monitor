import { useEffect, useRef } from 'react';
import type { BreathSourceId } from '../../core/midi/breathSource';
import { BreathRing } from '../../core/model/ringBuffer';
import { isSplit } from '../breathDivergence';
import { STAGE_GUTTER, drawStage, type BreathSeries } from './draw';
import { shouldDrawFrame } from './frameGate';
import { readTokens, type NoteBlock, type StageTokens } from './geometry';
import { DEFAULT_GEOMETRY, visibleWindowMs } from './timeToY';
import styles from './Stage.module.css';

/**
 * One tracked breath controller: its own ring buffer, keyed stably so App can
 * find it again on the next sample for the same source. Owned by App —
 * pushed to in arrival order and never replaced (same discipline as `notes`).
 * Stage reads this array (and each ring inside it) every frame, never through
 * React state.
 */
export interface TrackedSeries {
  key: string;
  id: BreathSourceId;
  ring: BreathRing;
}

interface StageProps {
  /**
   * Stable array owned by App, appended to in arrival order and never
   * replaced. Empty before any breath source has qualified — Stage must not
   * index `series[0]` in that state (design §15, F-guard).
   */
  series: TrackedSeries[];
  /**
   * Mirrors the divergence tracker's `lastDivergenceT` (design §15.1).
   * Read every frame, never through React state.
   */
  divergenceRef: { readonly current: number };
  /**
   * Stable array owned by App and mutated in place — never replaced. App does
   * not re-render on note events, so a new array identity would never
   * reach this component. Read every frame, never through React state.
   */
  notes: NoteBlock[];
  paused: boolean;
  /** Bumped by App on Clear. Forces one repaint even while paused (§7.5, F2). */
  contentToken: number;
}

const PITCH_MIN = 48;
const PITCH_MAX = 84;

/**
 * Colour for a series by index (design §15.2): breath, expression, volume in
 * fixed order, never cycled. Anything past index 2 clamps to volume — the
 * real EMEO tracks exactly three controllers, so a 4th is not expected, but
 * this must not crash if one ever shows up.
 */
function colorForIndex(index: number, tokens: StageTokens): string {
  if (index === 0) return tokens.breath;
  if (index === 1) return tokens.expression;
  return tokens.volume;
}

export function Stage({ series, divergenceRef, notes, paused, contentToken }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const tokenRef = useRef(contentToken);
  tokenRef.current = contentToken;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tokens = readTokens(canvas);
    let frame = 0;
    let lastDrawnToken = tokenRef.current;

    const render = () => {
      frame = requestAnimationFrame(render);
      // Pause freezes the display, not the instrument: the core keeps running so
      // connection state, disconnect detection, and breath detection still work.
      // Clear is the one exception — it must still repaint once while paused,
      // or the canvas is left showing the pre-clear picture (F2).
      if (!shouldDrawFrame(pausedRef.current, tokenRef.current, lastDrawnToken)) return;
      lastDrawnToken = tokenRef.current;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const geometry = { height: rect.height, ...DEFAULT_GEOMETRY };
      const now = performance.now();
      // Built fresh every frame: `series` is mutated in place (App pushes new
      // entries as sources qualify), so this always reflects its current
      // contents without ever needing a new array identity from App.
      const breathSeries: BreathSeries[] = series.map((s, i) => ({
        ring: s.ring,
        color: colorForIndex(i, tokens),
      }));
      const split = isSplit(now, divergenceRef.current, visibleWindowMs(geometry));

      drawStage(
        ctx,
        now,
        breathSeries,
        split,
        notes,
        geometry,
        { width: rect.width - STAGE_GUTTER, pitchMin: PITCH_MIN, pitchMax: PITCH_MAX },
        tokens,
      );
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [series, notes, divergenceRef]);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
