import { BreathRing } from '../../core/model/ringBuffer';
import {
  breathToX, meterFillHeight, noteRect,
  type NoteBlock, type StageLayout, type StageTokens,
} from './geometry';
import { nowLineY, timeToY, visibleWindowMs, type StageGeometry } from './timeToY';

export const METER_WIDTH = 12;
export const BREATH_LANE_WIDTH = 44;
/** Everything to the left of the note lane. */
export const STAGE_GUTTER = METER_WIDTH + BREATH_LANE_WIDTH;

/** One breath curve: its own ring buffer and the colour it draws in. */
export interface BreathSeries {
  ring: BreathRing;
  color: string;
}

export function drawStage(
  ctx: CanvasRenderingContext2D,
  now: number,
  series: BreathSeries[],
  split: boolean,
  notes: NoteBlock[],
  g: StageGeometry,
  layout: StageLayout,
  tokens: StageTokens,
): void {
  const totalWidth = STAGE_GUTTER + layout.width;

  ctx.fillStyle = tokens.surface;
  ctx.fillRect(0, 0, totalWidth, g.height);

  // Guard: before any breath source has qualified, `series` is empty (F-guard,
  // design §15). Draw the meter empty and skip the curve entirely rather than
  // index series[0].
  drawMeter(ctx, series[0]?.ring ?? null, g, tokens);

  ctx.save();
  ctx.translate(METER_WIDTH, 0);
  if (series.length > 0) {
    if (split) {
      // Primary first so later (top) series paint over it where curves cross.
      for (const s of series) drawBreathStroke(ctx, now, s.ring, g, s.color);
    } else {
      drawBreathFilled(ctx, now, series[0].ring, g, series[0].color);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(STAGE_GUTTER, 0);
  drawNotes(ctx, now, notes, g, layout, tokens);
  ctx.restore();

  const y = nowLineY(g);
  ctx.fillStyle = tokens.now;
  ctx.fillRect(0, y - 1, totalWidth, 2);
}

/**
 * FR-10: the live level, spanning the instrument's full range. `ring` is
 * `null` before any breath source has qualified — the meter simply reads as
 * empty (value 0) rather than crashing.
 */
function drawMeter(
  ctx: CanvasRenderingContext2D,
  ring: BreathRing | null,
  g: StageGeometry,
  tokens: StageTokens,
): void {
  ctx.fillStyle = tokens.track;
  ctx.fillRect(0, 0, METER_WIDTH, g.height);

  const value = ring?.latest?.value ?? 0;
  const h = meterFillHeight(value, g.height);
  ctx.fillStyle = tokens.breath;
  ctx.fillRect(0, g.height - h, METER_WIDTH, h);
}

/** Walks one ring's visible samples into the current path. True if any were plotted. */
function buildBreathPath(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  g: StageGeometry,
): boolean {
  const tMin = now - visibleWindowMs(g);
  ctx.beginPath();
  ctx.moveTo(0, nowLineY(g));
  let any = false;
  ring.forEachSince(tMin, (t, value) => {
    ctx.lineTo(breathToX(value, BREATH_LANE_WIDTH), timeToY(t, now, g));
    any = true;
  });
  return any;
}

/** Collapsed view (today's look, unchanged): filled translucent area + thin stroke. */
function drawBreathFilled(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  g: StageGeometry,
  color: string,
): void {
  if (!buildBreathPath(ctx, now, ring, g)) return;
  ctx.lineTo(0, g.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Split view: coloured stroke only, no fill, so overlapping series stay legible. */
function drawBreathStroke(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  g: StageGeometry,
  color: string,
): void {
  if (!buildBreathPath(ctx, now, ring, g)) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  now: number,
  notes: NoteBlock[],
  g: StageGeometry,
  layout: StageLayout,
  tokens: StageTokens,
): void {
  ctx.fillStyle = tokens.note;
  for (const block of notes) {
    const rect = noteRect(block, now, g, layout);
    if (rect.y > g.height) continue;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}
