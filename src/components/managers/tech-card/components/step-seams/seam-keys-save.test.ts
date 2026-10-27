// Lane BE contract (assembly-schema D): every card save says it speaks step seams and carries each
// step's seam keys through unchanged — or the server refuses the write once a card has them.

import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';

import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  type TechCardFormData,
} from '../schema';

describe('step seam keys on save', () => {
  it('a fresh form sends operationSeamsAware', () => {
    const payload = mapFormToTechCardInsert({
      ...techCardDefaultData,
      name: 'seam keys',
      stage: 'TECH_CARD_STAGE_IDEA',
    } as TechCardFormData);
    expect(payload.operationSeamsAware).toBe(true);
  });

  it('read → form → write keeps every step’s keys, in order', () => {
    const stored = {
      id: 38,
      lockVersion: 4,
      techCard: {
        name: 'seam keys',
        stage: 'TECH_CARD_STAGE_IDEA',
        pieces: [
          { lineKey: 'FP', name: 'front', piecesPerGarment: 1 },
          { lineKey: 'BP', name: 'back', piecesPerGarment: 1 },
        ],
        operations: [
          {
            operationNumber: 560,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            inputKeys: ['FP', 'BP'],
            seamKeys: ['s-side', 's-shoulder'],
          },
          { operationNumber: 570, operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE' },
        ],
      },
    } as unknown as common_TechCard;
    const form = mapTechCardToForm(stored);
    expect(form.operations?.[0]?.seamKeys).toEqual(['s-side', 's-shoulder']);
    const payload = mapFormToTechCardInsert(form, stored.techCard);
    expect(payload.operationSeamsAware).toBe(true);
    expect(payload.operations?.map((o) => o.seamKeys ?? [])).toEqual([
      ['s-side', 's-shoulder'],
      [],
    ]);
  });

  it('trims and de-duplicates keys a picker wrote twice', () => {
    const form = {
      ...techCardDefaultData,
      name: 'seam keys',
      stage: 'TECH_CARD_STAGE_IDEA',
      operations: [
        {
          ...(mapTechCardToForm({
            techCard: {
              operations: [
                { operationNumber: 1, operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE' },
              ],
            },
          } as unknown as common_TechCard).operations?.[0] ?? {}),
          seamKeys: [' a ', 'a', '', 'b'],
        },
      ],
    } as TechCardFormData;
    expect(mapFormToTechCardInsert(form).operations?.[0]?.seamKeys).toEqual(['a', 'b']);
  });
});
