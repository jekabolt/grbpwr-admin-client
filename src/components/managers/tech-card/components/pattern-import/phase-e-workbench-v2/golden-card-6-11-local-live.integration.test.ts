import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import type {
  common_BodyMeasurementName,
  common_GenderEnum,
  common_Model,
} from 'api/proto-http/admin';
import type {
  MeasurementSurfacePatternPieceOverlayV1,
  MeasurementSurfacePatternPieceV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { SkeletonCategory } from 'lib/assembly-skeleton/types';
import { afterAll, describe, expect, it } from 'vitest';

import { loadFacts } from '../../../../../../../scripts/assembly-skeleton/seams-entry';
import {
  layoutPatternImportDxfPhaseECadMannequinUnboundStageV1,
  modelPreviewInputFromSavedModelV1,
  selectedCadWorkbenchModelV1,
} from './cad-workbench-mannequin-model-picker-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1 } from './golden-card-6-11-saved-card-fixtures-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1 } from './golden-card-suite-profiles-v1';

const LOCAL_LIVE_SCHEMA = 'pattern-import-dxf-phase-e-card-6-11-local-live-e2e/2' as const;
const PLANS = process.env.SKELETON_PLANS ?? '';
const PROD_DATA = resolve(PLANS, 'assembly-3d-doll/prod-data');
const HAS_LOCAL_CORPUS =
  Boolean(PLANS) &&
  existsSync(resolve(PROD_DATA, 'cards.json')) &&
  existsSync(resolve(PROD_DATA, 'fit-models.json')) &&
  existsSync(resolve(PROD_DATA, 'dxf'));

type LocalCard = Readonly<{
  pieces: readonly [string, string, number, string, number, string][];
  ops: readonly [string, string, string, string, string][];
  name: string;
  sn: string;
}>;

type LocalFitModel = Readonly<{
  id: number;
  gender: 'MALE' | 'FEMALE';
  m: Readonly<Record<string, number>>;
}>;

type GoldRow = Readonly<{
  seamKey: string;
  status: string;
  direction: string;
  anchoredSize: string;
  sideA: readonly Readonly<{
    piece: string;
    edgeHint: string;
    range: readonly [number, number];
  }>[];
  sideB: readonly Readonly<{
    piece: string;
    edgeHint: string;
    range: readonly [number, number];
  }>[];
}>;

type GoldFile = Readonly<{
  rows: readonly Readonly<{ row: GoldRow }>[];
}>;

const CASES = Object.freeze([
  Object.freeze({
    techCardId: 6,
    category: 'shirt' as const,
    materialScopes: Object.freeze([
      Object.freeze({
        purpose: 'MAIN',
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        prefix: 'card6-MAIN',
      }),
      Object.freeze({
        purpose: 'POCKETING',
        scopeKey: 'TECH_CARD_BOM_PURPOSE_POCKETING',
        prefix: 'card6-POCKETING',
      }),
    ]),
  }),
  Object.freeze({
    techCardId: 11,
    category: 'trousers' as const,
    materialScopes: Object.freeze([
      Object.freeze({
        purpose: 'MAIN',
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        prefix: 'card11-MAIN',
      }),
      Object.freeze({
        purpose: 'LINING',
        scopeKey: 'TECH_CARD_BOM_PURPOSE_LINING',
        prefix: 'card11-LINING',
      }),
    ]),
  }),
]);

const EXPECTED = Object.freeze({
  6: Object.freeze({
    dxfScopeCount: 2,
    materialScopePieceCounts: [
      { purpose: 'MAIN', pieceCount: 21 },
      { purpose: 'POCKETING', pieceCount: 4 },
    ] as const,
    totalDxfBytes: 956_045,
    dxfSha256: 'ace0e6b38379a56ed9d1cf6cf6b1712fd34bae778ef69e5751e738d07d532455',
    sourcePieceCount: 25,
    sourceOperationCount: 63,
    exactConnectionCount: 17,
    negativeGuardCount: 2,
    unmatchedCatalogPieceKeys: [] as readonly string[],
    unmatchedStagedPieceKeys: [] as readonly string[],
    modelId: 1,
    modelSha256: 'bd876b0cb332c55e65a76067150fc268f785f35d43f75df118f70734a8084583',
    stagedPieceCount: 25,
    stagingSha256: '7b8ed59fefb4ce416e8734c34025540f5ddc0345435a974c8cd30db1e9e87a20',
    exactConnectionSha256: '13885dc243ba8093bdd8bfe152cbf397ccd6c1be7e1ae2603b13fc4609b2f642',
    negativeGuardSha256: '447b4bf3dee2e003b98d56808c121dab53c0f9a1e7c3c83caffa3b4ff01251d3',
    assemblyOrderSha256: '9ab9e50d4eb88a7c1ef0598002a793d2188958e0f0246b90d48caecc959da3b5',
    saveReceiptSha256: 'ba3ebe05ddb231deacd3f3d2fb8de9fda3c770d7eef7500d47f5bb3b6a5a1270',
    receiptSha256: '5f1657f7aa97d8570c0a971be3fb1b9689490e30f3435694aa618611eb5667aa',
  }),
  11: Object.freeze({
    dxfScopeCount: 2,
    materialScopePieceCounts: [
      { purpose: 'MAIN', pieceCount: 15 },
      { purpose: 'LINING', pieceCount: 10 },
    ] as const,
    totalDxfBytes: 746_258,
    dxfSha256: 'fb61ce0affb9298450729f2a086ec50ffdc5add607f4f55d5ff514182fa2517f',
    sourcePieceCount: 25,
    sourceOperationCount: 42,
    exactConnectionCount: 14,
    negativeGuardCount: 6,
    unmatchedCatalogPieceKeys: ['PCK_BACK_R'] as readonly string[],
    unmatchedStagedPieceKeys: ['PCK_BACK_L_1'] as readonly string[],
    modelId: 1,
    modelSha256: 'bd876b0cb332c55e65a76067150fc268f785f35d43f75df118f70734a8084583',
    stagedPieceCount: 25,
    stagingSha256: '3317b020e1092b991d2ccf4e883c1ce86dc69c07e95be94701927c2f03300c13',
    exactConnectionSha256: '0ebd04b0b18dc59e94a03b47e060bc94050a21ee8ad79067634b8e0ea4594bfe',
    negativeGuardSha256: '8a609bcd38ee987d1691bd93d325d429dbbb95841beb797a9e6b1e453e1d2353',
    assemblyOrderSha256: 'db2a65e8ba1938c3e6d2e60d18bac8869bc329a9cf89014a76d3b3c462870529',
    saveReceiptSha256: 'd6bfe547d038b2e995a55544c9359886f89adec2b6675ccc552e218bcae87513',
    receiptSha256: '7899ccdc742e9155740345515aaa493cea515c0408b7fb4fd2bde294f482eede',
  }),
});

const temporaryDirectories: string[] = [];
afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function exactDxf(prefix: string): string {
  const matches = readdirSync(resolve(PROD_DATA, 'dxf'))
    .filter((file) => file.startsWith(prefix) && file.endsWith('.dxf'))
    .sort();
  if (matches.length !== 1)
    throw new Error(`Expected exactly one ${prefix} DXF, found ${matches.length}.`);
  return matches[0];
}

function asProtoModel(model: LocalFitModel): common_Model {
  return {
    id: model.id,
    model: {
      name: `Local fit model ${model.id}`,
      comment: 'Pinned local Assembly Table acceptance model.',
      gender: model.gender as common_GenderEnum,
      measurements: Object.entries(model.m)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, valueMm]) => ({
          name: `BODY_MEASUREMENT_NAME_${name}` as common_BodyMeasurementName,
          valueMm,
          metadata: undefined,
        })),
      thumbnailId: undefined,
      mediaIds: [],
      defaultSizeIds: [],
      bodyMeasurementSchemaVersion: 1,
    },
    createdAt: undefined,
    updatedAt: undefined,
    thumbnail: undefined,
    media: [],
  };
}

function overlayFromMaterialScopes(
  scopes: readonly Readonly<{
    scopeKey: string;
    pieces: Awaited<ReturnType<typeof readSeamGraph>>['pieces'];
  }>[],
): MeasurementSurfacePatternPieceOverlayV1 {
  const staged: MeasurementSurfacePatternPieceV1[] = scopes.flatMap(({ scopeKey, pieces }) =>
    pieces.map((piece, laneIndex) => ({
      pieceKey: piece.pieceKey,
      scopeKey,
      pieceId: piece.pieceKey,
      pieceLineKey: piece.pieceKey,
      lane: 'front',
      laneIndex,
      contours: [
        {
          contourId: `${piece.pieceKey}:cut`,
          role: 'cut-boundary',
          vertices: piece.rs.map(([x, y], index) => ({
            vertexId: `${piece.pieceKey}:v${index}`,
            pointMm: { x, y },
          })),
        },
      ],
      selected: false,
      swatchCss: null,
      transform: null,
      seams: [],
    })),
  );
  return {
    revision: `local-live:${sha256(canonical(staged))}`,
    pieces: staged,
    tool: 'select',
    visibility: { pieces: true, edges: true, seams: true, pins: true, thread: true },
  };
}

function normalizeGoldRows(gold: GoldFile) {
  return gold.rows.map(({ row }) => ({
    seamKey: row.seamKey,
    status: row.status,
    direction: row.direction,
    anchoredSize: row.anchoredSize,
    sideA: row.sideA.map(({ piece, edgeHint, range }) => ({ piece, edgeHint, range })),
    sideB: row.sideB.map(({ piece, edgeHint, range }) => ({ piece, edgeHint, range })),
  }));
}

if (!HAS_LOCAL_CORPUS) {
  describe.skip('cards 6 and 11 local live Assembly Table E2E', () => {
    it('requires an explicitly injected SKELETON_PLANS corpus', () => undefined);
  });
} else {
  describe('cards 6 and 11 local live Assembly Table E2E', () => {
    const cards = JSON.parse(readFileSync(resolve(PROD_DATA, 'cards.json'), 'utf8')) as Record<
      string,
      LocalCard
    >;
    const fitModels = JSON.parse(
      readFileSync(resolve(PROD_DATA, 'fit-models.json'), 'utf8'),
    ) as LocalFitModel[];

    it.each(CASES)(
      'runs all material DXFs → model → exact connections → AO → save → reload for card $techCardId',
      async ({ techCardId, materialScopes, category }) => {
        const expected = EXPECTED[techCardId];
        const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
          (candidate) => candidate.facts.techCardId === techCardId,
        );
        const savedCardFixture = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1.find(
          (candidate) => candidate.techCardId === techCardId,
        );
        const card = cards[String(techCardId)];
        expect(profile).toBeDefined();
        expect(savedCardFixture).toBeDefined();
        expect(card).toBeDefined();
        expect(
          savedCardFixture!.pieces
            .map(({ lineKey, name }) => [lineKey, name] as const)
            .sort(([left], [right]) => left.localeCompare(right)),
        ).toEqual(
          card.pieces
            .map(([lineKey, name]) => [lineKey, name] as const)
            .sort(([left], [right]) => left.localeCompare(right)),
        );

        const scopeGraphs = await Promise.all(
          materialScopes.map(async ({ purpose, scopeKey, prefix }) => {
            const file = exactDxf(prefix);
            const dxf = readFileSync(resolve(PROD_DATA, 'dxf', file));
            const bytes = dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength);
            const loaded = await loadFacts(bytes, 'M', category as SkeletonCategory, {});
            return {
              purpose,
              scopeKey,
              file,
              dxf,
              graph: await readSeamGraph(loaded.facts),
            };
          }),
        );
        const graphPieces = scopeGraphs.flatMap(({ graph }) => graph.pieces);
        expect(new Set(graphPieces.map(({ pieceKey }) => pieceKey)).size).toBe(graphPieces.length);
        const overlay = overlayFromMaterialScopes(
          scopeGraphs.map(({ scopeKey, graph }) => ({ scopeKey, pieces: graph.pieces })),
        );
        const stage = layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(overlay);
        expect(stage).not.toBeNull();

        const sourceModel = fitModels.find(({ id }) => id === expected.modelId);
        expect(sourceModel).toBeDefined();
        const model = asProtoModel(sourceModel!);
        const selectedModel = selectedCadWorkbenchModelV1([model], expected.modelId);
        expect(selectedModel?.id).toBe(expected.modelId);
        const preview = modelPreviewInputFromSavedModelV1(selectedModel!);

        const gold = JSON.parse(
          readFileSync(
            resolve(process.cwd(), `scripts/doll/gold/card${techCardId}.seams.json`),
            'utf8',
          ),
        ) as GoldFile;
        const goldRows = normalizeGoldRows(gold);
        const exactConnections = goldRows.filter(({ status }) => status === 'confirmed');
        const negativeGuards = goldRows.filter(({ status }) => status === 'rejected');
        expect(goldRows).toHaveLength(exactConnections.length + negativeGuards.length);
        const availableEdges = new Map(
          scopeGraphs.flatMap(({ graph }) =>
            graph.pieces.flatMap(({ pieceKey, edges }) =>
              edges.map(({ id }) => [id, pieceKey] as const),
            ),
          ),
        );
        for (const row of goldRows)
          for (const side of [...row.sideA, ...row.sideB])
            expect(availableEdges.get(side.edgeHint), side.edgeHint).toBe(side.piece);

        const catalogPieceKeys = card.pieces.map(([, pieceKey]) => pieceKey).sort();
        const stagedPieceKeys = graphPieces.map(({ pieceKey }) => pieceKey).sort();
        const catalogPieceKeySet = new Set(catalogPieceKeys);
        const stagedPieceKeySet = new Set(stagedPieceKeys);
        const unmatchedCatalogPieceKeys = catalogPieceKeys.filter(
          (pieceKey) => !stagedPieceKeySet.has(pieceKey),
        );
        const unmatchedStagedPieceKeys = stagedPieceKeys.filter(
          (pieceKey) => !catalogPieceKeySet.has(pieceKey),
        );

        const modelSha256 = sha256(canonical(preview));
        const stagingSha256 = sha256(
          canonical({
            revision: overlay.revision,
            viewBox: stage!.viewBox,
            pieces: stage!.pieces.map(({ piece, fillPathD, strokePathD, transform }) => ({
              pieceKey: piece.pieceKey,
              fillPathD,
              strokePathD,
              transform,
            })),
          }),
        );
        const dxfScopes = scopeGraphs.map(({ purpose, scopeKey, file, dxf, graph }) => ({
          purpose,
          scopeKey,
          file,
          byteLength: dxf.byteLength,
          sha256: sha256(dxf),
          pieceCount: graph.pieces.length,
        }));
        expect(
          dxfScopes.map(({ file, byteLength, sha256: sourceSha256 }, index) => ({
            filePrefix: savedCardFixture!.scopes[index].corpusFilePrefix,
            fileMatches: file.startsWith(savedCardFixture!.scopes[index].corpusFilePrefix),
            byteLength,
            sourceSha256,
            parsedIdentities: [
              ...scopeGraphs[index].graph.pieces.map(({ pieceKey }) => pieceKey),
            ].sort(),
            fixtureIdentities: [...savedCardFixture!.scopes[index].sourceIdentities].sort(),
            fixtureRanks: [
              ...new Set(
                savedCardFixture!.scopes[index].sourceFamilies.flatMap(({ candidates }) =>
                  candidates.map(({ rank }) => rank),
                ),
              ),
            ].sort(),
          })),
        ).toEqual(
          savedCardFixture!.scopes.map((scope) => ({
            filePrefix: scope.corpusFilePrefix,
            fileMatches: true,
            byteLength: scope.row.sizeBytes,
            sourceSha256: scope.row.sha256,
            parsedIdentities: [...scope.sourceIdentities].sort(),
            fixtureIdentities: [...scope.sourceIdentities].sort(),
            fixtureRanks: [0, 1, 2, 3, 4],
          })),
        );
        const dxfSha256 = sha256(canonical(dxfScopes));
        const exactConnectionSha256 = sha256(canonical(exactConnections));
        const negativeGuardSha256 = sha256(canonical(negativeGuards));
        const assemblyOrderSha256 = sha256(canonical(card.ops));
        const snapshot = {
          schemaVersion: LOCAL_LIVE_SCHEMA,
          card: {
            techCardId,
            cardRef: profile!.cardRef,
            name: card.name,
            styleNumber: card.sn,
          },
          dxf: { scopes: dxfScopes, canonicalSha256: dxfSha256 },
          model: { id: selectedModel!.id, previewSha256: modelSha256 },
          staging: {
            sourcePieceCount: card.pieces.length,
            pieceCount: graphPieces.length,
            edgeCount: graphPieces.reduce((total, piece) => total + piece.edges.length, 0),
            unmatchedCatalogPieceKeys,
            unmatchedStagedPieceKeys,
            canonicalSha256: stagingSha256,
          },
          exactConnections: {
            count: exactConnections.length,
            canonicalSha256: exactConnectionSha256,
            rows: exactConnections,
          },
          negativeGuards: {
            count: negativeGuards.length,
            canonicalSha256: negativeGuardSha256,
            rows: negativeGuards,
          },
          assemblyOrder: {
            sourceOperationCount: card.ops.length,
            currentServerOperationCount: profile!.facts.operationCount,
            canonicalSha256: assemblyOrderSha256,
            operations: card.ops,
          },
        } as const;
        const snapshotBytes = canonical(snapshot);
        const saveReceiptSha256 = sha256(snapshotBytes);
        const directory = mkdtempSync(resolve(tmpdir(), `assembly-table-card-${techCardId}-`));
        temporaryDirectories.push(directory);
        const savedPath = resolve(directory, 'assembly-table.json');
        writeFileSync(savedPath, snapshotBytes, 'utf8');
        const reloadedBytes = readFileSync(savedPath, 'utf8');
        const reloaded = JSON.parse(reloadedBytes) as typeof snapshot;
        expect(reloadedBytes).toBe(snapshotBytes);
        expect(sha256(reloadedBytes)).toBe(saveReceiptSha256);
        expect(reloaded).toEqual(snapshot);

        const receipt = {
          schemaVersion: LOCAL_LIVE_SCHEMA,
          techCardId,
          cardRef: profile!.cardRef,
          dxfScopeCount: dxfScopes.length,
          materialScopePieceCounts: dxfScopes.map(({ purpose, pieceCount }) => ({
            purpose,
            pieceCount,
          })),
          totalDxfBytes: dxfScopes.reduce((total, { byteLength }) => total + byteLength, 0),
          dxfSha256,
          sourcePieceCount: card.pieces.length,
          stagedPieceCount: graphPieces.length,
          unmatchedCatalogPieceKeys,
          unmatchedStagedPieceKeys,
          exactConnectionCount: exactConnections.length,
          negativeGuardCount: negativeGuards.length,
          sourceOperationCount: card.ops.length,
          currentServerOperationCount: profile!.facts.operationCount,
          modelId: selectedModel!.id,
          modelSha256,
          stagingSha256,
          exactConnectionSha256,
          negativeGuardSha256,
          assemblyOrderSha256,
          saveReceiptSha256,
          reloadReceiptSha256: sha256(reloadedBytes),
        } as const;
        const receiptSha256 = sha256(canonical(receipt));

        expect({ ...receipt, receiptSha256 }).toEqual({
          ...expected,
          schemaVersion: LOCAL_LIVE_SCHEMA,
          techCardId,
          cardRef: profile!.cardRef,
          currentServerOperationCount: profile!.facts.operationCount,
          reloadReceiptSha256: expected.saveReceiptSha256,
        });
      },
      120_000,
    );
  });
}
