import { describe, expect, it } from 'vitest';

import { deriveAssembly } from './derive-assembly';
import {
  card83ChainFixture,
  card85StoredSeamFixture,
  collarGrammarFixture,
  roleNameFixture,
} from './assembly-inference.fixture';
import { createPdfT } from './i18n';

describe('assembly seam inference', () => {
  it('walks the whole neckline chain against the named collar neck edge', () => {
    const model = deriveAssembly({ ...card83ChainFixture(), t: createPdfT('ru') });
    const card = model.cards.get(400)!;
    const seam = card.seams[0];

    expect(seam.a.map((part) => part.edgeId)).toEqual(['CLR#6']);
    expect(seam.b.map((part) => part.edgeId)).toEqual(['BP#2', 'FR#1', 'FL#3']);
    expect(card.metrics[0].delta).toBeCloseTo(-140.1, 1);
    expect(card.metrics[0].gap?.label).toBe('воротник короче горловины на 140 мм');
  });

  it('uses the Russian genitive for the longer side', () => {
    const model = deriveAssembly({ ...collarGrammarFixture(), t: createPdfT('ru') });
    expect(model.cards.get(400)?.metrics[0].gap?.label).toBe(
      'горловина короче воротника на 143 мм',
    );
  });

  it('names role groups and disambiguates equal role names only in the machine column', () => {
    const model = deriveAssembly({ ...roleNameFixture(), t: createPdfT('ru') });
    const fronts = model.cards.get(200)?.metrics[0];
    const mixed = model.cards.get(205)?.metrics[0];
    const sleeves = model.cards.get(210)?.metrics[0];

    expect([fronts?.leftName, fronts?.rightName]).toEqual(
      expect.arrayContaining(['спинка', 'полочки']),
    );
    expect([mixed?.leftName, mixed?.rightName]).toEqual(
      expect.arrayContaining(['спинка', 'кокетка + карман']),
    );
    expect(sleeves?.leftName).toBe('рукав');
    expect(sleeves?.rightName).toBe('рукав');
    expect([sleeves?.leftMachineName, sleeves?.rightMachineName]).toEqual(
      expect.arrayContaining(['рукав (SLV_M_R)', 'рукав (SLV_R)']),
    );
  });

  it('prefers confirmed card-85 seams that connect the operation inputs', () => {
    const model = deriveAssembly(card85StoredSeamFixture());
    const op490 = model.cards.get(490)?.seams[0];
    const op620 = model.cards.get(620)?.seams[0];
    const op640 = model.cards.get(640)?.seams[0];

    expect(op490?.key).toMatch(/^proto-edge-490-/);
    expect(op620?.key).toBe('01M5MK81G9F80KD3JZ7NS0XHXX');
    expect(op640?.key).toBe('01M5MK9PHZS1BD5Q8WBJ94GQH0');
    expect([...op640!.a, ...op640!.b].map((part) => part.edgeId)).toEqual([
      '01M5J6VRN9GN0D1TWQ67ZKEEZN#1',
      '01M5J6VRN9C91JZ0JSRB9EJAMK#2',
    ]);
    expect(model.unresolved).toBe(0);
  });
});
