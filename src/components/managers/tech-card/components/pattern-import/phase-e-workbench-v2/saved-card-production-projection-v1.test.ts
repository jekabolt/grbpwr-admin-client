import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1,
  clonePatternImportDxfPhaseEGoldenSavedCardV1,
} from './golden-card-6-11-saved-card-fixtures-v1';
import { buildPatternImportDxfPhaseESavedCardProductionProjectionV1 } from './saved-card-production-projection-v1';

describe('saved-card production projection seam identity', () => {
  it('projects the authoritative saved ordered seam keys and count without using live form state', () => {
    const fixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1[0];
    const card = clonePatternImportDxfPhaseEGoldenSavedCardV1(fixture.card);
    const aliases = fixture.scopes[0].aliases;
    const pieceLineKeys = [
      ...new Set(aliases.map(({ pieceLineKey }) => pieceLineKey).filter(Boolean)),
    ];
    expect(pieceLineKeys.length).toBeGreaterThanOrEqual(2);
    const orderedSeamKeys = ['saved-third', 'saved-first', 'saved-second'];
    card.techCard!.operations = [
      {
        operationNumber: 41,
        seamKeys: orderedSeamKeys,
      } as never,
    ];
    card.seams = orderedSeamKeys.map(
      (seamKey) =>
        ({
          seamKey,
          status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
          stale: false,
          anchoredSize: 'M',
          sideA: { parts: [{ pieceLineKey: pieceLineKeys[0] }] },
          sideB: { parts: [{ pieceLineKey: pieceLineKeys[1] }] },
        }) as never,
    );

    const projected = buildPatternImportDxfPhaseESavedCardProductionProjectionV1({
      techCard: card,
      selectedOperationNumber: 41,
      orderSizeIds: (ids) => [...ids],
      sizeNameById: fixture.sizeNameById,
    });

    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.blockers[0].detail);
    expect(projected.orderedSeamKeys).toEqual(orderedSeamKeys);
    expect(projected.seamCount).toBe(3);
    expect(projected.orderedSeamKeys).not.toBe(orderedSeamKeys);
  });
});
