import { createFormControl } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import {
  captureTechCardPieceRenameTarget,
  planTechCardPieceRenames,
  type PieceRenameFormState,
} from './piece-rename-plan';
import { mapFormToTechCardInsert, techCardDefaultData, type TechCardFormData } from './schema';

const front = { lineKey: 'LEGACY_FRONT', name: 'Front', calloutNumber: 3 };
const back = { lineKey: 'LEGACY_BACK', name: 'Back', calloutNumber: 0 };
const technical = {
  number: 3,
  mediaId: 7,
  clientRef: 'technical-note',
  part: 'Front',
  parts: ['Front', 'Other sketch label'],
};
const moodboard = { ...technical, mediaId: 8, clientRef: 'mood', part: 'Reference', parts: [] };
const state: PieceRenameFormState = {
  pieces: [front, back],
  callouts: [moodboard, technical],
  technicalMedia: [{ mediaId: 7 }],
};

describe('piece rename form plan', () => {
  it('resolves a reordered piece and its exact technical callout at apply time', () => {
    const target = captureTechCardPieceRenameTarget(state, front.lineKey);
    const plan = planTechCardPieceRenames(
      { ...state, pieces: [back, front], callouts: [technical, moodboard] },
      [{ target, name: 'Front panel' }],
    );
    expect(plan).toEqual({
      ok: true,
      writes: [
        { path: 'pieces.1.name', value: 'Front panel' },
        { path: 'callouts.0.parts', value: ['Front panel', 'Other sketch label'] },
        { path: 'callouts.0.part', value: 'Front panel' },
      ],
    });
  });

  it.each([
    { ...state, pieces: [back] },
    { ...state, pieces: [front, { ...front, lineKey: 'legacy_front' }] },
    { ...state, pieces: [{ ...front, name: 'Concurrent rename' }, back] },
    { ...state, pieces: [{ ...front, calloutNumber: 0 }, back] },
    { ...state, callouts: [moodboard, { ...technical, clientRef: 'replacement' }] },
    { ...state, callouts: [moodboard, { ...technical, parts: ['Concurrent callout edit'] }] },
  ])('refuses a missing, ambiguous or changed target without any write plan', (current) => {
    const target = captureTechCardPieceRenameTarget(state, front.lineKey);
    const plan = planTechCardPieceRenames(current, [{ target, name: 'Front panel' }]);
    expect(plan).toMatchObject({ ok: false });
    expect(plan).not.toHaveProperty('writes');
    expect(captureTechCardPieceRenameTarget(state, 'legacy_front')).toBeNull();
  });

  it('preserves detached references and clamps Unicode without splitting a character', () => {
    const detached = { ...state, technicalMedia: [] };
    const target = captureTechCardPieceRenameTarget(detached, front.lineKey);
    const longest = 'я'.repeat(126);
    const plan = planTechCardPieceRenames(detached, [{ target, name: `${longest}🧵` }]);
    expect(plan).toEqual({
      ok: true,
      writes: [{ path: 'pieces.0.name', value: longest }],
    });
  });

  it('refuses a shared or unrelated callout primary and a case-insensitive name collision', () => {
    for (const changed of [
      { ...state, pieces: [front, { ...back, calloutNumber: 3 }] },
      { ...state, callouts: [{ ...technical, parts: ['Different part'] }] },
    ]) {
      const target = captureTechCardPieceRenameTarget(changed, front.lineKey);

      expect(planTechCardPieceRenames(changed, [{ target, name: 'Front panel' }])).toMatchObject({
        ok: false,
      });
    }
    const target = captureTechCardPieceRenameTarget(state, front.lineKey);
    expect(planTechCardPieceRenames(state, [{ target, name: ' BACK ' }])).toMatchObject({
      ok: false,
    });
  });

  it('checks the final batch, allowing two pieces to swap names without using interim aliases', () => {
    const targetFront = captureTechCardPieceRenameTarget(state, front.lineKey);
    const targetBack = captureTechCardPieceRenameTarget(state, back.lineKey);
    const plan = planTechCardPieceRenames(state, [
      { target: targetFront, name: 'Back' },
      { target: targetBack, name: 'Front' },
    ]);
    expect(plan).toMatchObject({
      ok: true,
      writes: [
        { path: 'pieces.0.name', value: 'Back' },
        { path: 'callouts.1.parts', value: ['Back', 'Other sketch label'] },
        { path: 'callouts.1.part', value: 'Back' },
        { path: 'pieces.1.name', value: 'Front' },
      ],
    });
  });

  it('sends matching S8 part and parts through the ordinary TechCard form mapper', () => {
    const form = createFormControl<TechCardFormData>({
      defaultValues: {
        ...techCardDefaultData,
        pieces: [{ ...front, piecesPerGarment: 2, materials: [] }, back],
        callouts: [moodboard, technical],
        technicalMedia: [{ mediaId: 7 }],
      },
    });
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: () => {} });
    const target = captureTechCardPieceRenameTarget(state, front.lineKey);
    const plan = planTechCardPieceRenames(state, [{ target, name: 'Перед' }]);
    if (!plan.ok) throw new Error(plan.detail);
    for (const { path, value } of plan.writes) form.setValue(path, value, { shouldDirty: true });

    const dto = mapFormToTechCardInsert(form.getValues());
    unsubscribe();
    expect(dto.pieces?.[0]).toMatchObject({
      lineKey: front.lineKey,
      name: 'Перед',
      calloutNumber: 3,
      piecesPerGarment: 2,
    });
    expect(dto.callouts?.[0]).toMatchObject({ mediaId: 8, part: 'Reference' });
    expect(dto.callouts?.[1]).toMatchObject({
      mediaId: 7,
      part: 'Перед',
      parts: ['Перед', 'Other sketch label'],
    });
  });
});
