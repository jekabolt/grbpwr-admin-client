import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { describe, expect, it, vi } from 'vitest';

import type { CardContext } from '../client';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1,
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1,
  createPatternImportDxfPhaseESavedRowRuntimeV1,
} from './saved-row-production-runtime-v1';

const CARD: CardContext = {
  techCardId: 41,
  sizes: [],
  scopes: [],
  existingPieces: [],
  existingPatterns: [],
  styleLabel: 'AW · 1041',
};

const ROW: DxfProductSavedRowIdentityV1 = {
  techCardId: 41,
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 12,
  url: 'https://objects.example/main.dxf',
  sizeBytes: 2048,
  sha256: 'a'.repeat(64),
};

describe('saved-row production card projection', () => {
  it('returns a detached current projection only for the exact card and lock', async () => {
    const source = structuredClone(CARD);
    const resolve = createPatternImportDxfPhaseESavedRowCardProjectionResolverV1({
      card: source,
      cardLockVersion: 12,
    });
    source.styleLabel = 'mutated after capture';

    const resolved = await resolve(ROW, new AbortController().signal);

    expect(resolved.card.styleLabel).toBe('AW · 1041');
    expect(resolved.cardLockVersion).toBe(12);
    expect(Object.isFrozen(resolved.card)).toBe(true);
  });

  it.each([
    ['card id', { ...ROW, techCardId: 42 }],
    ['card lock', { ...ROW, cardLockVersion: 13 }],
  ] as const)('fails closed on stale %s', async (_case, row) => {
    const resolve = createPatternImportDxfPhaseESavedRowCardProjectionResolverV1({
      card: CARD,
      cardLockVersion: 12,
    });

    await expect(resolve(row, new AbortController().signal)).rejects.toThrow(/moved/);
  });

  it('honours cancellation before publishing the projection', async () => {
    const resolve = createPatternImportDxfPhaseESavedRowCardProjectionResolverV1({
      card: CARD,
      cardLockVersion: 12,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(resolve(ROW, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('composes and disposes the narrow preparation runtime without reading local Assembly', () => {
    const readAuthoritativeRow = vi.fn();
    const readAuthoritativeAssembly = vi.fn();
    const runtime = createPatternImportDxfPhaseESavedRowRuntimeV1({
      selectedOperationNumber: 20,
      projection: { card: CARD, cardLockVersion: 12 },
      snapshot: {
        bridge: { readAuthoritativeRow },
        authorityAdapter: { readAuthoritativeAssembly },
      } as never,
    });

    expect(runtime.schemaVersion).toBe(PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1);
    expect(runtime.consumeConfirmedCompilerSource).toBe(
      runtime.preparationOwner.consumeConfirmedCompilerSource,
    );
    expect(runtime.claims.previewCompilerSourceExposed).toBe(false);
    expect(runtime.snapshot()).toMatchObject({
      disposed: false,
      preparation: { disposed: false, running: false, preparationGeneration: 0 },
    });
    expect(readAuthoritativeRow).not.toHaveBeenCalled();
    expect(readAuthoritativeAssembly).not.toHaveBeenCalled();

    runtime.dispose();
    runtime.dispose();
    expect(runtime.snapshot()).toMatchObject({
      disposed: true,
      preparation: { disposed: true, running: false },
    });
  });
});
