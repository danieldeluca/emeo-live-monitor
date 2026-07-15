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

export function drawStage(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  notes: NoteBlock[],
  g: StageGeometry,
  layout: StageLayout,
  tokens: StageTokens,
): void {
  const totalWidth = STAGE_GUTTER + layout.width;

  ctx.fillStyle = tokens.surface;
  ctx.fillRect(0, 0, totalWidth, g.height);

  drawMeter(ctx, ring, g, tokens);

  ctx.save();
  ctx.translate(METER_WIDTH, 0);
  drawBreath(ctx, now, ring, g, tokens);
  ctx.restore();

  ctx.save();
  ctx.translate(STAGE_GUTTER, 0);
  drawNotes(ctx, now, notes, g, layout, tokens);
  ctx.restore();

  const y = nowLineY(g);
  ctx.fillStyle = tokens.now;
  ctx.fillRect(0, y - 1, totalWidth, 2);
}

/** FR-10: the live level, spanning the instrument's full range. */
function drawMeter(
  ctx: CanvasRenderingContext2D,
  ring: BreathRing,
  g: StageGeometry,
  tokens: StageTokens,
): void {
  ctx.fillStyle = tokens.track;
  ctx.fillRect(0, 0, METER_WIDTH, g.height);

  const value = ring.latest?.value ?? 0;
  const h = meterFillHeight(value, g.height);
  ctx.fillStyle = tokens.breath;
  ctx.fillRect(0, g.height - h, METER_WIDTH, h);
}

function drawBreath(
  ctx: CanvasRenderingContext2D,
  now: number,
  ring: BreathRing,
  g: StageGeometry,
  tokens: StageTokens,
): void {
  const tMin = now - visibleWindowMs(g);
  ctx.beginPath();
  ctx.moveTo(0, nowLineY(g));
  let any = false;
  ring.forEachSince(tMin, (t, value) => {
    ctx.lineTo(breathToX(value, BREATH_LANE_WIDTH), timeToY(t, now, g));
    any = true;
  });
  if (!any) return;
  ctx.lineTo(0, g.height);
  ctx.closePath();
  ctx.fillStyle = tokens.breath;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tokens.breath;
  ctx.lineWidth = 1.5;
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
