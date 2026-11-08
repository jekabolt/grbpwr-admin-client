import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { deriveMaterials } from './derive-materials';

const INTERLINING = 'TECH_CARD_BOM_SECTION_INTERLINING';
const STRIP = 'TECH_CARD_PIECE_FUSING_MODE_STRIP';

const cardWith = (pieces: object[], seamMm = '10', lines = [{ lineKey: 'fuse', name: 'Fusing' }]) =>
  ({
    techCard: {
      requiredSeamAllowanceMm: { value: seamMm },
      bomItems: lines.map((line) => ({ ...line, section: INTERLINING })),
      pieces,
    },
  }) as unknown as common_TechCard;

const fusingOf = (card: common_TechCard, lineKey = 'fuse') =>
  deriveMaterials(card).fabrics.find((fabric) => fabric.refKey === lineKey)?.fusing;

describe('interlining row in the materials list', () => {
  it('names the allowance mode with the card seam allowance, next to the other methods', () => {
    const card = cardWith([
      { name: 'BP', fused: true, fusingMode: STRIP },
      { name: 'CLR', fused: true, fusingMode: STRIP, fusingWidthMm: { value: '30' } },
      { name: 'CF', fused: true, fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE' },
      { name: 'SLV', fused: false, fusingMode: STRIP },
    ]);
    expect(fusingOf(card)).toBe('allowance 10 mm · strip 30 mm · zone');
  });

  it('keeps each piece on the interlining line it chose', () => {
    const card = cardWith(
      [
        { name: 'BP', fused: true, fusingMode: STRIP, fusingBomLineKey: 'light' },
        {
          name: 'CLR',
          fused: true,
          fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_FULL',
          fusingBomLineKey: 'heavy',
        },
      ],
      '',
      [
        { lineKey: 'light', name: 'Light' },
        { lineKey: 'heavy', name: 'Heavy' },
      ],
    );
    expect(fusingOf(card, 'light')).toBe('allowance');
    expect(fusingOf(card, 'heavy')).toBe('whole piece');
  });
});
