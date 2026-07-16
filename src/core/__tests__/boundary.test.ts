import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const FORBIDDEN = [/from\s+['"].*\/ui\//, /from\s+['"].*\/i18n/, /from\s+['"]react['"]/];

describe('core boundary', () => {
  it('never imports from ui, i18n, or react', () => {
    const offenders: string[] = [];
    for (const file of filesUnder('src/core')) {
      if (!file.endsWith('.ts') || file.includes('__tests__')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
