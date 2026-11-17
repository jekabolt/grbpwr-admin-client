import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';

import { buildPatternImportDxfPhaseECadSavedPreparedMaterialScopesCatalogV1 } from './cad-material-scope-catalog-v1';
import { preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1 } from './cad-saved-material-scope-editor-preparation-v1';

const SHA = 'a'.repeat(64);
const RAW_SENTINEL = 'raw-dxf-sentinel-must-never-publish';
const SIZE_NAMES = new Map([[7, 'M']]);
const ORDER_SIZES = (ids: number[]) => ids;

function card(): common_TechCard {
  return {
    id: 6,
    lockVersion: 12,
    techCard: {
      sizeIds: [7],
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'Main',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'main',
        },
        {
          lineKey: 'bom-pocketing',
          name: 'Pocketing',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'pocketing',
        },
      ],
      patterns: ['main', 'pocketing'].map((scopeKey) => ({
        lineKey: `pattern-${scopeKey}`,
        fabricPurpose: scopeKey,
        url: `https://objects.example/${scopeKey}.dxf`,
        downloadUrl: `/api/p/${scopeKey}/download`,
        sizeBytes: 123,
        sha256: SHA,
        savedRowRevision: 1,
        filename: `${scopeKey}.dxf`,
      })),
      pieces: [],
      pieceDxfAliases: { items: [] },
    },
  } as unknown as common_TechCard;
}

function prepared(scopeKey: string, sourceRevision = 1) {
  const sourceFileId = `file-${scopeKey}`;
  const selectionSha = scopeKey === 'main' ? 'b'.repeat(64) : 'c'.repeat(64);
  const catalogSha = scopeKey === 'main' ? 'd'.repeat(64) : 'e'.repeat(64);
  return Object.freeze({
    scopeKey,
    sizeToken: 'M',
    sourceRevision,
    selection: Object.freeze({
      ok: true as const,
      phaseD: Object.freeze({ source: Object.freeze({ sourceFileId }), sourceSha256: SHA }),
      selection: Object.freeze({
        scopeKey,
        sizeToken: 'M',
        fullSelectedGeometrySha256: 'f'.repeat(64),
        canonicalSha256: selectionSha,
        selectedGeometrySha256: SHA,
      }),
    }),
    catalog: Object.freeze({
      techCardId: 6,
      scopeKey,
      sizeToken: 'M',
      sourceFileId,
      sizeSelectionCanonicalSha256: selectionSha,
      canonicalSha256: catalogSha,
      pieces: Object.freeze([
        Object.freeze({ pieceId: `${scopeKey}-piece`, pieceLineKey: `${scopeKey}-line` }),
      ]),
    }),
    projection: Object.freeze({
      sourceFileId,
      sizeToken: 'M',
      expectedCatalogCanonicalSha256: catalogSha,
      sizeSelectionCanonicalSha256: selectionSha,
      pieces: Object.freeze([]),
    }),
    compileSource: Object.freeze({
      schemaVersion: 'pattern-import-dxf-phase-e-draft-cad-compile-source/1',
      techCardId: 6,
      scopes: Object.freeze([
        Object.freeze({
          target: Object.freeze({
            scopeKey,
            label: scopeKey,
            fabricPurpose: scopeKey,
            bomLineKey: `bom-${scopeKey}`,
            isInterlining: false,
          }),
          writerReplay: Object.freeze({
            schemaVersion: 'pattern-import-dxf-product-writer-replay-carrier/1',
          }),
        }),
      ]),
    }),
  });
}

function request() {
  const techCard = card();
  return {
    techCard,
    orderSizeIds: ORDER_SIZES,
    sizeNameById: SIZE_NAMES,
    sizeToken: 'M',
    active: {
      ...prepared('main'),
      draft: { dxfText: RAW_SENTINEL },
      downloads: [RAW_SENTINEL],
      authoringAuthority: { retained: RAW_SENTINEL },
    } as never,
    authority: {
      resolveCurrentCard: vi.fn(async () => techCard),
    } as never,
    signal: new AbortController().signal,
  };
}

describe('saved material-scope editor preparation', () => {
  it('preserves card 11 MAIN and LINING scope and alias identities without fuzzy inference', () => {
    const result = buildPatternImportDxfPhaseECadSavedPreparedMaterialScopesCatalogV1({
      techCardId: 11,
      scopes: [
        {
          scope: {
            scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
            label: 'Main',
            fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
            bomLineKey: 'main-line',
            isInterlining: false,
            filename: 'trouser-main.dxf',
            writerReplaySchemaVersion: 'pattern-import-dxf-product-writer-replay-carrier/1',
          },
          pieces: [{ pieceId: 'FRONT', pieceLineKey: 'piece-front-main' }],
        },
        {
          scope: {
            scopeKey: 'TECH_CARD_BOM_PURPOSE_LINING',
            label: 'Lining',
            fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
            bomLineKey: 'lining-line',
            isInterlining: false,
            filename: 'trouser-lining.dxf',
            writerReplaySchemaVersion: 'pattern-import-dxf-product-writer-replay-carrier/1',
          },
          pieces: [{ pieceId: 'FRONT_LINING', pieceLineKey: 'piece-front-lining' }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes.map(({ scopeKey, filename }) => [scopeKey, filename])).toEqual([
      ['TECH_CARD_BOM_PURPOSE_MAIN', 'trouser-main.dxf'],
      ['TECH_CARD_BOM_PURPOSE_LINING', 'trouser-lining.dxf'],
    ]);
    expect(result.pieceScopeKeys).toEqual({
      'piece-front-main': ['TECH_CARD_BOM_PURPOSE_MAIN'],
      'piece-front-lining': ['TECH_CARD_BOM_PURPOSE_LINING'],
    });
  });

  it('reuses the active scope first and publishes one complete raw-free editable set', async () => {
    const secondary = prepared('pocketing', 2);
    const prepareSaved = vi.fn(async () =>
      Object.freeze({
        ok: true as const,
        scopeKey: secondary.scopeKey,
        sizeToken: secondary.sizeToken,
        preparationGeneration: secondary.sourceRevision,
        selection: secondary.selection,
        catalog: secondary.catalog,
        projection: secondary.projection,
        draftCadCompileSource: secondary.compileSource,
        draft: { dxfText: RAW_SENTINEL },
        downloads: [RAW_SENTINEL],
        authoringAuthority: { retained: RAW_SENTINEL },
      }),
    );

    const result = await preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1({
      ...request(),
      prepareSaved: prepareSaved as never,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes.map(({ scopeKey }) => scopeKey)).toEqual(['main', 'pocketing']);
    expect(result.catalog.scopes.map(({ scopeKey }) => scopeKey)).toEqual(['main', 'pocketing']);
    expect(prepareSaved).toHaveBeenCalledOnce();
    expect(result.scopes[1]).not.toHaveProperty('draft');
    expect(result.scopes[1]).not.toHaveProperty('authoringAuthority');
    const serialized = JSON.stringify(result.scopes);
    expect(serialized).not.toContain(RAW_SENTINEL);
    expect(serialized).not.toContain('dxfText');
    expect(serialized).not.toContain('downloads');
    expect(serialized).not.toContain('authoringAuthority');
    expect(result.crossScopeSeamingAvailable).toBe(false);
    expect(result.pressAuthoringAvailable).toBe(false);
  });

  it('publishes no partial set when another saved scope is stale', async () => {
    const prepareSaved = vi.fn(async () =>
      Object.freeze({
        ok: false as const,
        blocker: Object.freeze({ detail: 'The saved row identity moved.' }),
      }),
    );

    const result = await preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1({
      ...request(),
      prepareSaved: prepareSaved as never,
    });

    expect(result).toMatchObject({
      ok: false,
      scopes: [],
      blocker: {
        code: 'saved-editor-scope-preparation-blocked',
        detail: expect.stringContaining('identity moved'),
      },
    });
  });

  it('rejects an active compile source whose retained Phase-D hashes moved', async () => {
    const input = request();
    const active = prepared('main');
    const result = await preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1({
      ...input,
      active: {
        ...active,
        compileSource: {
          ...active.compileSource,
          dxfProvenance: {
            contentBinding: {
              sourceFileId: active.selection.phaseD.source.sourceFileId,
              sourceSha256: '0'.repeat(64),
              selectedGeometrySha256: active.selection.selection.fullSelectedGeometrySha256,
            },
          },
          dxfPhaseDReplay: {
            replayReady: true,
            carrier: {
              sourceFileId: active.selection.phaseD.source.sourceFileId,
              sourceSha256: active.selection.phaseD.sourceSha256,
              selectedGeometrySha256: active.selection.selection.fullSelectedGeometrySha256,
            },
          },
        },
      } as never,
    });

    expect(result).toMatchObject({
      ok: false,
      scopes: [],
      blocker: { code: 'saved-editor-active-binding-stale' },
    });
  });

  it('rejects publication if the current card lock moves after exact reconstruction', async () => {
    const input = request();
    const secondary = prepared('pocketing', 2);

    const result = await preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1({
      ...input,
      authority: {
        resolveCurrentCard: vi.fn(async () => ({
          ...input.techCard,
          lockVersion: 13,
        })),
      } as never,
      prepareSaved: (async () => ({
        ok: true as const,
        scopeKey: secondary.scopeKey,
        sizeToken: secondary.sizeToken,
        preparationGeneration: secondary.sourceRevision,
        selection: secondary.selection,
        catalog: secondary.catalog,
        projection: secondary.projection,
        draftCadCompileSource: secondary.compileSource,
      })) as never,
    });

    expect(result).toMatchObject({
      ok: false,
      scopes: [],
      blocker: { code: 'saved-editor-card-stale' },
    });
  });
});
