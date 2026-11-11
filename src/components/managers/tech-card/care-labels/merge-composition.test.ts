import { describe, expect, it } from 'vitest';
import type { PartComposition } from './composition-resolver';
import { LABEL_LANGS } from './phrases';
import { mergeSameComposition } from './print-job';

const part = (
  name: PartComposition['part'],
  text: string,
  key: string,
  animal = false,
): PartComposition => ({
  part: name,
  fibers: [],
  animal,
  rows: Object.fromEntries(
    LABEL_LANGS.map((lang) => [lang, `${lang} ${text}`]),
  ) as PartComposition['rows'],
  lineKeys: [key],
});

describe('mergeSameComposition', () => {
  it('folds parts of the same composition into one column', () => {
    const out = mergeSameComposition([
      part('SHELL', '55% COTTON 45% VISCOSE', 'a'),
      part('BODY_LINING', '60% COTTON 40% SILK', 'b'),
      part('POCKET_LINING', '55% COTTON 45% VISCOSE', 'c', true),
    ]);
    expect(out.map((p) => [p.part, p.alsoParts ?? [], p.lineKeys, p.animal])).toEqual([
      ['SHELL', ['POCKET_LINING'], ['a', 'c'], true],
      ['BODY_LINING', [], ['b'], false],
    ]);
  });

  it('keeps one column per different composition and never folds NOTE', () => {
    const note = { ...part('NOTE', 'ANIMAL', 'n'), lineKeys: [] };
    const out = mergeSameComposition([
      part('SHELL', '100% WOOL', 'a'),
      part('FILLING', '100% DOWN', 'b'),
      note,
      { ...note },
    ]);
    expect(out.map((p) => p.part)).toEqual(['SHELL', 'FILLING', 'NOTE', 'NOTE']);
  });

  it('does not change the input', () => {
    const input = [part('SHELL', 'X', 'a'), part('POCKET_LINING', 'X', 'b')];
    mergeSameComposition(input);
    expect(input[0].lineKeys).toEqual(['a']);
    expect(input[0].alsoParts).toBeUndefined();
  });
});
