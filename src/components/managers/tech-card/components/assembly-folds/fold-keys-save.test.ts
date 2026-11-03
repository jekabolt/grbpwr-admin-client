// Every card save says it speaks step folds and carries each step's fold keys through unchanged, or
// the server refuses the write once a card has them (operation_folds_aware).

import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';

import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from '../schema';
import { stepsWithoutFolds } from './use-fold-writes';

const stored = {
  id: 38,
  lockVersion: 4,
  techCard: {
    name: 'fold keys',
    stage: 'TECH_CARD_STAGE_IDEA',
    pieces: [
      { lineKey: 'FLAP_L', name: 'flap', piecesPerGarment: 1 },
      { lineKey: 'BP', name: 'back', piecesPerGarment: 1 },
    ],
    operations: [
      {
        operationNumber: 110,
        operationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        inputKeys: ['BP'],
        seamKeys: ['s-side'],
      },
      {
        operationNumber: 120,
        operationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        inputKeys: ['FLAP_L'],
        foldKeys: ['f-one', 'f-two'],
      },
    ],
  },
} as unknown as common_TechCard;

const keysOf = (payload: ReturnType<typeof mapFormToTechCardInsert>) =>
  payload.operations?.map((o) => o.foldKeys ?? []);

describe('step fold keys on save', () => {
  it('a fresh form sends operationFoldsAware', () => {
    const payload = mapFormToTechCardInsert({
      ...techCardDefaultData,
      name: 'fold keys',
      stage: 'TECH_CARD_STAGE_IDEA',
    } as TechCardFormData);
    expect(payload.operationFoldsAware).toBe(true);
  });

  it('read → form → write keeps every step’s keys, in order', () => {
    const form = mapTechCardToForm(stored);
    expect(form.operations?.map((o) => o.foldKeys)).toEqual([[], ['f-one', 'f-two']]);
    const payload = mapFormToTechCardInsert(form, stored.techCard);
    expect(payload.operationFoldsAware).toBe(true);
    expect(keysOf(payload)).toEqual([[], ['f-one', 'f-two']]);
  });

  it('the form resolver keeps the keys', () => {
    const parsed = techCardSchema.safeParse(mapTechCardToForm(stored));
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.data?.operations?.map((o) => o.foldKeys)).toEqual([[], ['f-one', 'f-two']]);
  });

  it('a reordered step takes its keys with it', () => {
    const form = mapTechCardToForm(stored);
    const moved = { ...form, operations: [...(form.operations ?? [])].reverse() };
    expect(keysOf(mapFormToTechCardInsert(moved, stored.techCard))).toEqual([
      ['f-one', 'f-two'],
      [],
    ]);
  });

  it('a card read without the field gives every step an empty list', () => {
    const form = mapTechCardToForm(stored);
    expect(form.operations?.[0]?.foldKeys).toEqual([]);
  });

  it('trims and de-duplicates keys written twice', () => {
    const form = mapTechCardToForm(stored);
    const operations = (form.operations ?? []).map((o, i) =>
      i === 1 ? { ...o, foldKeys: [' f-one ', 'f-one', '', 'f-two'] } : o,
    );
    expect(keysOf(mapFormToTechCardInsert({ ...form, operations }, stored.techCard))).toEqual([
      [],
      ['f-one', 'f-two'],
    ]);
  });
});

describe('stepsWithoutFolds', () => {
  const operations = [
    { foldKeys: ['f-one', 'f-two'] },
    { foldKeys: [] },
    {},
    { foldKeys: ['f-three'] },
  ];

  it('names only the steps that held a removed key', () => {
    expect(stepsWithoutFolds(operations, ['f-one', 'f-three'])).toEqual([
      { index: 0, foldKeys: ['f-two'] },
      { index: 3, foldKeys: [] },
    ]);
  });

  it('a key no step holds changes nothing', () => {
    expect(stepsWithoutFolds(operations, ['f-none'])).toEqual([]);
  });
});
