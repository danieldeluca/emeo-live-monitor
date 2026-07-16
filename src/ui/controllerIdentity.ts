import type { TFunction } from 'i18next';
import type { BreathSourceId } from '../core/midi/breathSource';

type ControllerKey =
  | 'controllers.breath'
  | 'controllers.expression'
  | 'controllers.volume'
  | 'controllers.modulation'
  | 'controllers.pressure';

/**
 * The translatable identity of a breath controller, if it has one (design
 * §15.1). CC2/CC11/CC7/CC1 are the EMEO's known breath-family controllers;
 * channel pressure always has an identity; any other CC does not.
 */
export function friendlyKey(id: BreathSourceId): ControllerKey | null {
  if (id.kind === 'channel-pressure') return 'controllers.pressure';
  switch (id.controller) {
    case 2:
      return 'controllers.breath';
    case 11:
      return 'controllers.expression';
    case 7:
      return 'controllers.volume';
    case 1:
      return 'controllers.modulation';
    default:
      return null;
  }
}

/**
 * The on-screen label for a controller (design §15.1): `Breath (CC2)` for a
 * recognised CC, `CC14` for an unrecognised one, and just `Pressure` for
 * channel pressure (it has no CC number to show).
 */
export function controllerLabel(t: TFunction, id: BreathSourceId): string {
  if (id.kind === 'channel-pressure') return t('controllers.pressure');
  const key = friendlyKey(id);
  return key ? `${t(key)} (CC${id.controller})` : `CC${id.controller}`;
}

/**
 * Series colours in fixed, never-cycled order (design §15.2). The real EMEO
 * mirrors breath onto exactly three controllers (CC2, CC11, CC7), so a 4th
 * tracked series is not expected — seriesColorVar below clamps rather than
 * crashing if one ever shows up.
 */
export const SERIES_COLOR_VARS = ['--color-breath', '--color-expression', '--color-volume'] as const;

/** The colour token for a series index, clamped to the last one if the index runs past the palette. */
export function seriesColorVar(index: number): string {
  const clamped = Math.min(Math.max(index, 0), SERIES_COLOR_VARS.length - 1);
  return SERIES_COLOR_VARS[clamped];
}
