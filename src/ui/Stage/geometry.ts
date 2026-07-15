import { nowLineY, timeToY, type StageGeometry } from './timeToY';

export interface NoteBlock {
  note: number;
  start: number;
  /** null while still sounding. */
  end: number | null;
}

export interface StageLayout {
  width: number;
  pitchMin: number;
  pitchMax: number;
}

export interface StageTokens {
  note: string;
  breath: string;
  now: string;
  surface: string;
  track: string;
}

const MIN_NOTE_HEIGHT_PX = 2;
const MIDI_MAX = 127;

export function pitchToX(note: number, layout: StageLayout): number {
  const clamped = Math.min(Math.max(note, layout.pitchMin), layout.pitchMax);
  const span = layout.pitchMax - layout.pitchMin;
  return ((clamped - layout.pitchMin) / span) * layout.width;
}

/** Breath deflects horizontally from a baseline at x = 0. */
export function breathToX(value: number, laneWidth: number): number {
  return (value / MIDI_MAX) * laneWidth;
}

/** The live level meter (FR-10): fills from the bottom, empty at no air, full at 127. */
export function meterFillHeight(value: number, height: number): number {
  return (value / MIDI_MAX) * height;
}

export function noteRect(
  block: NoteBlock,
  now: number,
  g: StageGeometry,
  layout: StageLayout,
): { x: number; y: number; w: number; h: number } {
  const yStart = timeToY(block.end ?? now, now, g);
  const yEnd = timeToY(block.start, now, g);
  return {
    x: pitchToX(block.note, layout),
    y: Math.max(yStart, nowLineY(g)),
    w: 10,
    h: Math.max(yEnd - yStart, MIN_NOTE_HEIGHT_PX),
  };
}

/**
 * Canvas cannot read CSS custom properties, so token values are resolved once
 * from the DOM and cached. Without this the stage silently ignores the theme.
 */
export function readTokens(el: HTMLElement): StageTokens {
  const style = getComputedStyle(el);
  return {
    note: style.getPropertyValue('--color-note').trim(),
    breath: style.getPropertyValue('--color-breath').trim(),
    now: style.getPropertyValue('--color-now').trim(),
    surface: style.getPropertyValue('--color-bg').trim(),
    track: style.getPropertyValue('--color-surface').trim(),
  };
}
