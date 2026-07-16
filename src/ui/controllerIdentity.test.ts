import '../i18n';
import i18n from '../i18n';
import {
  controllerLabel,
  friendlyKey,
  SERIES_COLOR_VARS,
  seriesColorVar,
} from './controllerIdentity';

describe('friendlyKey', () => {
  it('maps CC2 to breath', () => {
    expect(friendlyKey({ kind: 'cc', controller: 2 })).toBe('controllers.breath');
  });

  it('maps CC11 to expression', () => {
    expect(friendlyKey({ kind: 'cc', controller: 11 })).toBe('controllers.expression');
  });

  it('maps CC7 to volume', () => {
    expect(friendlyKey({ kind: 'cc', controller: 7 })).toBe('controllers.volume');
  });

  it('maps CC1 to modulation', () => {
    expect(friendlyKey({ kind: 'cc', controller: 1 })).toBe('controllers.modulation');
  });

  it('maps channel-pressure to pressure', () => {
    expect(friendlyKey({ kind: 'channel-pressure' })).toBe('controllers.pressure');
  });

  it('maps an unknown CC to null', () => {
    expect(friendlyKey({ kind: 'cc', controller: 14 })).toBeNull();
  });
});

describe('controllerLabel', () => {
  const { t } = i18n;

  it('labels a friendly CC as "Name (CCn)"', () => {
    expect(controllerLabel(t, { kind: 'cc', controller: 2 })).toBe('Breath (CC2)');
  });

  it('labels an unrecognised CC as just "CCn"', () => {
    expect(controllerLabel(t, { kind: 'cc', controller: 14 })).toBe('CC14');
  });

  it('labels channel pressure without a CC number', () => {
    expect(controllerLabel(t, { kind: 'channel-pressure' })).toBe('Pressure');
  });
});

describe('seriesColorVar', () => {
  it('returns the matching token for in-range indices', () => {
    expect(seriesColorVar(0)).toBe('--color-breath');
    expect(seriesColorVar(1)).toBe('--color-expression');
    expect(seriesColorVar(2)).toBe('--color-volume');
  });

  it('clamps an out-of-range index to the last series', () => {
    expect(seriesColorVar(3)).toBe(SERIES_COLOR_VARS[SERIES_COLOR_VARS.length - 1]);
    expect(seriesColorVar(99)).toBe('--color-volume');
  });
});
