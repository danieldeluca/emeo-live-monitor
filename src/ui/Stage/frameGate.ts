/**
 * Decides whether an animation frame should draw.
 *
 * Pause freezes the display, not the instrument (design §7.5): normally a
 * paused frame draws nothing. But Clear must still force exactly one
 * repaint even while paused, or the canvas is left showing a stale picture
 * from before the clear — the stage never resets to the empty state design
 * §7.5 requires.
 *
 * `token` only ever changes on Clear, so "the token has moved since the
 * last draw" is the signal: draw once, regardless of pause, then the caller
 * records the new token as drawn and goes back to freezing.
 */
export function shouldDrawFrame(paused: boolean, token: number, lastDrawnToken: number): boolean {
  return !paused || token !== lastDrawnToken;
}
