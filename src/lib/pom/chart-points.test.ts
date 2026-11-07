import { describe, expect, it } from 'vitest';

import { DICTIONARY_NAMES } from './dictionary';
import { PATTERN_CHART_NAMES, POM_CHART_NAME, POM_CODES_BY_GARMENT, isGirth } from './chart-points';
import { GARMENT_SCHEMATIC } from './schematic';

describe('POM chart points', () => {
  it('maps every POM to one available, unique measurement name', () => {
    const codes = [...new Set(Object.values(POM_CODES_BY_GARMENT).flat())];
    const names = codes.map((code) => POM_CHART_NAME[code]);
    const available = new Set<string>([...DICTIONARY_NAMES, ...PATTERN_CHART_NAMES]);

    expect(Object.keys(POM_CHART_NAME).sort()).toEqual([...codes].sort());
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => available.has(name))).toBe(true);
  });

  it('reads girth from the POM definitions', () => {
    expect(isGirth('chest')).toBe(true);
    expect(isGirth('front-rise')).toBe(false);
  });

  it('has a schematic line for every garment POM', () => {
    for (const kind of ['top', 'bottom'] as const) {
      expect(Object.keys(GARMENT_SCHEMATIC[kind].lines).sort()).toEqual(
        [...POM_CODES_BY_GARMENT[kind]].sort(),
      );
    }
  });
});
