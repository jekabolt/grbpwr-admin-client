import { describe, expect, it } from 'vitest';

import { BOM_WORD_VALUES, bomWord } from './bom-words';
import { createPdfT } from './translate';
import { PDF_LANGS } from './langs';
import { bomKindText, materialRoleText } from './vocabulary';

const PURPOSES = [
  ['TECH_CARD_BOM_PURPOSE_UNSET', 'purpose not set'],
  ['TECH_CARD_BOM_PURPOSE_MAIN', 'main material'],
  ['TECH_CARD_BOM_PURPOSE_LINING', 'lining'],
  ['TECH_CARD_BOM_PURPOSE_POCKETING', 'pocketing'],
  ['TECH_CARD_BOM_PURPOSE_INTERFACING', 'canvas / interfacing'],
  ['TECH_CARD_BOM_PURPOSE_INSULATION', 'insulation'],
  ['TECH_CARD_BOM_PURPOSE_CONTRAST', 'contrast / facing'],
  ['TECH_CARD_BOM_PURPOSE_BINDING', 'binding'],
  ['TECH_CARD_BOM_PURPOSE_MESH', 'mesh / second layer'],
  ['TECH_CARD_BOM_PURPOSE_OTHER', 'other'],
] as const;

describe('BOM PDF vocabulary', () => {
  it('has every BOM kind in every PDF language', () => {
    expect(BOM_WORD_VALUES.filter((value) => value.startsWith('TECH_CARD_BOM_KIND_'))).toHaveLength(
      57,
    );
    for (const { code } of PDF_LANGS)
      for (const value of BOM_WORD_VALUES) expect(bomWord(value, createPdfT(code))).toBeTruthy();
  });

  it('routes every material purpose through the locale dictionary', () => {
    for (const { code } of PDF_LANGS)
      for (const [purpose, english] of PURPOSES)
        expect(materialRoleText({ purpose }, english, createPdfT(code))).toBeTruthy();
  });

  it('translates hardware and arbitrary BOM kinds in Russian', () => {
    const ru = createPdfT('ru');
    expect(materialRoleText({ section: 'TECH_CARD_BOM_SECTION_HARDWARE' }, 'hardware', ru)).toBe(
      'фурнитура',
    );
    expect(bomKindText('TECH_CARD_BOM_KIND_ZIPPER', 'zipper', ru)).toBe('молния');
    expect(bomKindText('TECH_CARD_BOM_KIND_TOTE_BAG', 'tote bag', ru)).toBe('шоппер');
    expect(
      bomKindText('TECH_CARD_BOM_KIND_ZIPPER', ru('common.generated', { text: 'zipper' }), ru),
    ).toBe(ru('common.generated', { text: 'молния' }));
  });
});
