// grademap P3: the card save sends the fusing markup key only with a markup change and only when the
// current base contour is known; otherwise the field stays absent (the server keeps what it has).

import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { fusingBaseKeyOf } from 'lib/grade-map/fusing-base';

import { mapFormToTechCardInsert, mapTechCardToForm } from './schema';

const KEY = fusingBaseKeyOf(4, [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 300 },
  { x: 0, y: 300 },
])!;
const OLD_KEY = { baseSizeId: 4, contourSignature: 'v1:old' };

const stored = {
  id: 41,
  lockVersion: 2,
  techCard: {
    name: 'fusing key',
    stage: 'TECH_CARD_STAGE_IDEA',
    bomItems: [
      {
        lineKey: 'IL',
        section: 'TECH_CARD_BOM_SECTION_INTERLINING',
        name: 'interlining',
      },
    ],
    pieces: [
      {
        lineKey: 'FP',
        name: 'front',
        piecesPerGarment: 1,
        fused: true,
        fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
        fusingBomLineKey: 'IL',
        fusingZone: {
          rect: {
            x0: { value: '10' },
            y0: { value: '10' },
            x1: { value: '50' },
            y1: { value: '50' },
          },
          holes: [],
          islands: [],
        },
        fusingBase: OLD_KEY,
      },
      { lineKey: 'BP', name: 'back', piecesPerGarment: 1 },
    ],
  },
} as unknown as common_TechCard;

const resolve = (lineKey: string) => (lineKey === 'FP' || lineKey === 'BP' ? KEY : null);
const front = (payload: ReturnType<typeof mapFormToTechCardInsert>) =>
  payload.pieces?.find((p) => p.lineKey === 'FP');

describe('fusing markup key on save', () => {
  it('reads the stored key into the form', () => {
    const form = mapTechCardToForm(stored);
    expect(form.pieces?.[0]?.fusingBase).toEqual(OLD_KEY);
    expect(form.pieces?.[1]?.fusingBase).toBeNull();
  });

  it('an untouched markup is saved without the key (the stored one stays)', () => {
    const form = mapTechCardToForm(stored);
    const payload = mapFormToTechCardInsert(form, stored.techCard, true, resolve);
    expect(front(payload)?.fusingBase).toBeUndefined();
    expect(payload.pieces?.find((p) => p.lineKey === 'BP')?.fusingBase).toBeUndefined();
  });

  it('a changed markup is saved with the current key', () => {
    const form = mapTechCardToForm(stored);
    form.pieces![0].fusingZone = { rect: [10, 10, 60, 50] };
    expect(
      front(mapFormToTechCardInsert(form, stored.techCard, true, resolve))?.fusingBase,
    ).toEqual(KEY);
  });

  it('a changed markup with the contour unknown, or no resolver, sends no key', () => {
    const form = mapTechCardToForm(stored);
    form.pieces![0].fusingZone = { rect: [10, 10, 60, 50] };
    expect(
      front(mapFormToTechCardInsert(form, stored.techCard, true, () => null))?.fusingBase,
    ).toBeUndefined();
    expect(front(mapFormToTechCardInsert(form, stored.techCard))?.fusingBase).toBeUndefined();
  });

  it('a card not stored yet sends the key for every piece with markup', () => {
    const form = mapTechCardToForm(stored);
    const payload = mapFormToTechCardInsert(form, undefined, true, resolve);
    expect(front(payload)?.fusingBase).toEqual(KEY);
    expect(payload.pieces?.find((p) => p.lineKey === 'BP')?.fusingBase).toBeUndefined();
  });
});
