import { describe, expect, it } from 'vitest';

import type { ConversionManifest, DraftShapeRef } from 'lib/pattern-import/types';
import type { CardContext } from './client';
import { cardFingerprint, withCardParse } from './use-import-session';

// Review T1 (a): a run that read the card while its sheets were still parsing drafts with the
// parse the card has by the write — and taking it never makes the run stale.

const URL = 'https://files.example/main.dxf';
const shape: DraftShapeRef = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  pieceLineKey: 'k:FP',
  identity: 'FP',
  url: URL,
  sizes: { m: { areaMm2: 1, wMm: 1, hMm: 1 } },
};
const manifest = { createdAt: '2026-11-09T00:00:00Z' } as unknown as ConversionManifest;

const base: CardContext = {
  techCardId: 6,
  sizes: [],
  scopes: [],
  existingPieces: [{ lineKey: 'k:FP', name: 'FP', cutSymmetry: '', piecesPerGarment: 1 }],
  existingPatterns: [
    { scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN', filename: 'main.dxf', url: URL, manifest: null },
  ],
  existingShapes: [],
  shapesPending: true,
  styleLabel: 'SS26-006',
};

describe('the run takes the card parse at the write', () => {
  it('outlines and manifests from the live card, the fingerprint unchanged', () => {
    const live: CardContext = {
      ...base,
      existingShapes: [shape],
      existingPatterns: [{ ...base.existingPatterns![0], manifest }],
      shapesPending: false,
    };
    const next = withCardParse(base, live);
    expect(next.existingShapes).toEqual([shape]);
    expect(next.existingPatterns?.[0].manifest).toBe(manifest);
    expect(next.shapesPending).toBe(false);
    expect(cardFingerprint(next)).toBe(cardFingerprint(base));
  });
});
