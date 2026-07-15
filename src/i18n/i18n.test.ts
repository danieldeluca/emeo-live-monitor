import { resolveLanguage } from './index';
import en from './locales/en.json';
import fr from './locales/fr.json';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('locales', () => {
  it('define the same keys in every language', () => {
    expect(keysOf(fr).sort()).toEqual(keysOf(en).sort());
  });

  it('have no empty strings', () => {
    const empty = [...keysOf(en), ...keysOf(fr)].filter((k) => k.trim() === '');
    expect(empty).toEqual([]);
  });
});

describe('resolveLanguage', () => {
  it('resolves exact French match', () => {
    expect(resolveLanguage('fr')).toBe('fr');
  });

  it('resolves French with region code', () => {
    expect(resolveLanguage('fr-FR')).toBe('fr');
  });

  it('resolves French case-insensitively', () => {
    expect(resolveLanguage('FR-ca')).toBe('fr');
  });

  it('resolves English to English', () => {
    expect(resolveLanguage('en-US')).toBe('en');
  });

  it('resolves unsupported language to English', () => {
    expect(resolveLanguage('de-DE')).toBe('en');
  });

  it('resolves undefined to English', () => {
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('resolves empty string to English', () => {
    expect(resolveLanguage('')).toBe('en');
  });

  it('resolves empty array to English', () => {
    expect(resolveLanguage([])).toBe('en');
  });

  it('finds French in array where it is not first', () => {
    expect(resolveLanguage(['de', 'fr-FR', 'en'])).toBe('fr');
  });
});
