import { describe, expect, it } from 'vitest';

import { deriveAssembly } from './derive-assembly';
import {
  card83RealFixture,
  card85StoredSeamFixture,
  collarGrammarFixture,
  roleNameFixture,
} from './assembly-inference.fixture';
import { createPdfT } from './i18n';

describe('assembly seam inference', () => {
  it('card 83: the two-layer collar takes its neck edge against the whole neckline', () => {
    const input = card83RealFixture();
    const model = deriveAssembly({ ...input, t: createPdfT('ru') });
    const card = model.cards.get(400)!;
    const named = (parts: readonly { piece: string; edgeId?: string }[]) =>
      parts.map((part) => `${input.pieces.get(part.piece)?.code}#${part.edgeId?.split('#')[1]}`);

    expect(card.seams).toHaveLength(1);
    expect(named(card.seams[0].a)).toEqual(['CLR#6']);
    expect(named(card.seams[0].b)).toEqual(['BP#2', 'FR#1', 'FL#3']);
    expect(card.metrics[0].left).toBeCloseTo(439.2, 1);
    expect(card.metrics[0].right).toBeCloseTo(579.3, 1);
    expect(card.metrics[0].delta).toBeCloseTo(-140.1, 1);
    expect(card.metrics[0].gap?.label).toBe('воротник короче горловины на 140 мм');
  });

  it('card 83: SLV_M layers sewn into a «sleeve cuff» unit read as the cuff', () => {
    const input = card83RealFixture();
    const model = deriveAssembly({ ...input, t: createPdfT('ru') });
    for (const op of [280, 360]) {
      const metric = model.cards.get(op)?.metrics[0];
      // sleeve wrist 325 (pleated) ↔ one cuff layer 272.5, not the 418.5 underarm or 469 cap
      expect([metric?.leftName, metric?.rightName]).toEqual(['рукав', 'манжета']);
      expect(metric?.left).toBeCloseTo(325, 1);
      expect(metric?.delta).toBeCloseTo(52.5, 1);
      expect(metric?.gap?.label).toMatch(/^манжета короче рукава на 5[23] мм$/);
    }
    expect(model.cards.get(230)?.metrics[0]?.leftName).toBe('манжета');
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

    expect([fronts?.leftName, fronts?.rightName]).toEqual(['пояс низа', 'полочки']);
    expect([mixed?.leftName, mixed?.rightName]).toEqual(['пояс низа', 'полочка + спинка']);
    expect(sleeves?.leftName).toBe('рукав');
    expect(sleeves?.rightName).toBe('рукав');
    expect([sleeves?.leftMachineName, sleeves?.rightMachineName]).toEqual(
      expect.arrayContaining(['рукав (SLV_UP_R)', 'рукав (SLV_R)']),
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
