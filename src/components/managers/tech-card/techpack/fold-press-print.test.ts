import type { TechCardPieceFold } from 'api/proto-http/common';
import { describe, expect, it } from 'vitest';

import { card83StoredSeamsFixture } from './assembly-inference.fixture';
import { deriveAssembly } from './derive-assembly';

const FOLD_KEY = 'fold-press-print';

// `+ fold` closes a lone piece's fold on its own Press step: the print words it on that numbered row.
describe('a fold closed on a Press step', () => {
  it('prints on that numbered row', () => {
    const input = card83StoredSeamsFixture();
    const card = input.techCard.techCard!;
    const operations = card.operations ?? [];
    const lone = operations.findIndex(
      (operation) =>
        !(operation.outputUnitKey ?? '').trim() &&
        (operation.inputKeys ?? []).length > 0 &&
        new Set(operation.inputKeys).size === 1 &&
        input.pieces.has(operation.inputKeys![0]),
    );
    const consumer = operations.findIndex((operation) => (operation.inputKeys ?? []).length >= 2);
    const at = lone >= 0 ? lone : consumer;
    expect(at).toBeGreaterThanOrEqual(0);
    const piece = lone >= 0 ? operations[lone].inputKeys![0] : operations[consumer].inputKeys![0];
    expect(input.pieces.has(piece)).toBe(true);
    const press = {
      ...operations[at],
      operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
      pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
      inputKeys: [piece],
      outputUnitKey: '',
      outputUnitName: '',
      seamKeys: [],
      foldKeys: [FOLD_KEY],
    } as (typeof operations)[number];
    const next =
      lone >= 0
        ? operations.map((operation, index) => (index === at ? press : operation))
        : [...operations.slice(0, at), press, ...operations.slice(at)];
    const numbered = next.map((operation, index) => ({
      ...operation,
      operationNumber: (index + 1) * 10,
    }));
    const fold: TechCardPieceFold = {
      foldKey: FOLD_KEY,
      pieceLineKey: piece,
      seq: 1,
      kind: 'TECH_CARD_PIECE_FOLD_KIND_INWARD',
      source: 'TECH_CARD_PIECE_FOLD_SOURCE_OWNER',
      line: [
        { u: 0.5, v: 0 },
        { u: 0.5, v: 1 },
      ],
      flipAt: { u: 0.25, v: 0.5 },
      edgeHint: '',
      edgeSamples: [],
      offsetMm: 0,
      contourSig: '',
      anchoredSize: 'M',
      note: '',
      stale: false,
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    };
    const techCard = {
      ...input.techCard,
      pieceFolds: [fold],
      techCard: { ...card, operations: numbered },
    } as typeof input.techCard;
    const model = deriveAssembly({ ...input, techCard });
    const n = (at + 1) * 10;
    expect(model.rows.some((row) => row.n === n)).toBe(true);
    expect(model.words.get(n)?.folds?.length).toBeGreaterThan(0);
  }, 120_000);
});
