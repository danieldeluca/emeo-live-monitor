import { useEffect, useRef } from 'react';
import { BreathRing } from '../../core/model/ringBuffer';
import { STAGE_GUTTER, drawStage } from './draw';
import { readTokens, type NoteBlock } from './geometry';
import { DEFAULT_GEOMETRY } from './timeToY';
import styles from './Stage.module.css';

interface StageProps {
  ring: BreathRing;
  /**
   * Stable array owned by App and mutated in place — never replaced.
   * App does not re-render on note events, so a new array identity would never
   * reach this component. Read every frame, never through React state.
   */
  notes: NoteBlock[];
  paused: boolean;
}

const PITCH_MIN = 48;
const PITCH_MAX = 84;

export function Stage({ ring, notes, paused }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tokens = readTokens(canvas);
    let frame = 0;

    const render = () => {
      frame = requestAnimationFrame(render);
      // Pause freezes the display, not the instrument: the core keeps running so
      // connection state, disconnect detection, and breath detection still work.
      if (pausedRef.current) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawStage(
        ctx,
        performance.now(),
        ring,
        notes,
        { height: rect.height, ...DEFAULT_GEOMETRY },
        { width: rect.width - STAGE_GUTTER, pitchMin: PITCH_MIN, pitchMax: PITCH_MAX },
        tokens,
      );
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [ring, notes]);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
