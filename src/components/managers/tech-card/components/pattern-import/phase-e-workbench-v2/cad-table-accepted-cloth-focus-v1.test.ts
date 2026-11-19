import type { common_TechCard } from 'api/proto-http/admin';
import type {
  MeasurementSurfaceAcceptedClothPieceV1,
  MeasurementSurfaceAcceptedClothV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { describe, expect, it } from 'vitest';
import {
  isCurrentCadTableClothHitV1,
  resolveCadTableClothFocusScopeV1,
} from './cad-table-accepted-cloth-focus-v1';
import { listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1 } from './cad-table-zero-operation-saved-preparation-v1';

const main = {
  techCardId: 120,
  cardLockVersion: 11,
  revision: 7,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  sha256: 'b'.repeat(64),
  url: 'https://test.invalid/main.dxf',
  sizeBytes: 2048,
};
const pocketing = {
  ...main,
  scopeKey: 'pocketing',
  patternLineKey: 'pattern-pockets',
  sha256: 'a'.repeat(64),
  url: 'https://test.invalid/pockets.dxf',
};
const hit: MeasurementSurfaceAcceptedClothPieceV1 = Object.freeze({
  row: pocketing,
  sizeToken: 'M',
  pieceId: 'POCKET',
  pieceLineKey: 'piece-pocket',
  sourceInstancePath: Object.freeze(['insert-1']),
});
const review = { row: main, operationNumber: 170, sizeId: 58, sizeToken: 'M' };
const purpose = ['TECH_CARD_BOM_PURPOSE_MAIN', 'TECH_CARD_BOM_PURPOSE_POCKETING'] as const;

function cardFixture(): common_TechCard {
  return {
    id: main.techCardId,
    lockVersion: main.cardLockVersion,
    techCard: {
      sizeIds: [58, 59],
      bomItems: purpose.map((value, index) => ({
        purpose: value,
        lineKey: 'bom-' + index,
        section: 'TECH_CARD_BOM_SECTION_FABRIC',
      })),
      patterns: [main, pocketing].map((row, index) => ({
        lineKey: row.patternLineKey,
        fabricPurpose: purpose[index],
        url: row.url,
        sizeBytes: row.sizeBytes,
        savedRowRevision: row.revision,
        sha256: row.sha256,
        downloadUrl: '/api/dxf/' + row.patternLineKey,
      })),
    },
  } as common_TechCard;
}

function resolve(card = cardFixture(), target = hit, active = review) {
  const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
    card,
    (ids) => ids,
    new Map([
      [58, 'M'],
      [59, 'L'],
    ]),
  );
  return resolveCadTableClothFocusScopeV1({ card, choices, review: active, hit: target });
}

describe('accepted cloth cross-material table focus', () => {
  it('opens only the unique current native material row carrying the same review rank', () => {
    expect(resolve()).toBe('pocketing');
    expect(resolve(cardFixture(), { ...hit, sizeToken: 'L' })).toBeNull();
    for (const row of [
      { ...pocketing, revision: 8 },
      { ...pocketing, cardLockVersion: 12 },
      { ...pocketing, sha256: 'c'.repeat(64) },
      { ...pocketing, url: main.url },
      { ...pocketing, sizeBytes: 2049 },
      { ...pocketing, patternLineKey: main.patternLineKey },
      { ...pocketing, scopeKey: main.scopeKey },
    ]) {
      expect(resolve(cardFixture(), { ...hit, row })).toBeNull();
    }
    expect(resolve(cardFixture(), hit, { ...review, sizeId: 59 })).toBeNull();
    const card = cardFixture();
    const patterns = card.techCard!.patterns!;
    patterns.push({ ...patterns[1], lineKey: 'ambiguous-second-pockets' });
    expect(resolve(card)).toBeNull();
    patterns.pop();
    patterns[1].name = 'Fusing · generated · interlining';
    expect(resolve(card)).toBeNull();
  });

  it('retains the exact displayed frame through overlays and refuses stale or foreign callbacks', () => {
    let current = true;
    const frame: MeasurementSurfaceAcceptedClothV1 = {
      frameNumber: 1,
      positionsM: new Float32Array(9),
      ranges: [{ sourcePiece: hit, triangleCount: 1, triangleOffset: 0, color: 0 }],
      isCurrent: () => current,
    };
    const overlayRefresh = { ...frame, onSelectPiece: () => {} };
    expect(isCurrentCadTableClothHitV1(frame, overlayRefresh, hit)).toBe(true);
    expect(isCurrentCadTableClothHitV1(frame, overlayRefresh, { ...hit })).toBe(false);
    expect(isCurrentCadTableClothHitV1(frame, undefined, hit)).toBe(false);
    expect(isCurrentCadTableClothHitV1(frame, { ...frame, frameNumber: 2 }, hit)).toBe(false);
    expect(
      isCurrentCadTableClothHitV1(frame, { ...frame, positionsM: frame.positionsM.slice() }, hit),
    ).toBe(false);
    expect(isCurrentCadTableClothHitV1(frame, { ...frame, ranges: [...frame.ranges] }, hit)).toBe(
      false,
    );
    expect(isCurrentCadTableClothHitV1(frame, { ...frame, isCurrent: () => true }, hit)).toBe(
      false,
    );
    const duplicate = { ...frame, ranges: [...frame.ranges, ...frame.ranges] };
    expect(isCurrentCadTableClothHitV1(duplicate, duplicate, hit)).toBe(false);
    current = false;
    expect(isCurrentCadTableClothHitV1(frame, overlayRefresh, hit)).toBe(false);
  });
});
