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
