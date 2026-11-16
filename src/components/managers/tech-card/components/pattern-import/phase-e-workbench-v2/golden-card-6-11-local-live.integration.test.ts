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
import { PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1 } from './golden-card-suite-profiles-v1';

const LOCAL_LIVE_SCHEMA = 'pattern-import-dxf-phase-e-card-6-11-local-live-e2e/1' as const;
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
  Object.freeze({ techCardId: 6, prefix: 'card6-MAIN', category: 'shirt' as const }),
  Object.freeze({ techCardId: 11, prefix: 'card11-MAIN', category: 'trousers' as const }),
]);

const EXPECTED = Object.freeze({
  6: Object.freeze({
    dxfFile: 'card6-MAIN-202609061206145330d12-3d55e011ca16331502bde7fd074bc7d9.dxf',
    dxfBytes: 839_334,
    dxfSha256: '50e98f9e1f67006bc077230f06e43c1efff6ee0f4aa39dbd97144aa259ec95c5',
    sourcePieceCount: 25,
    sourceOperationCount: 63,
    connectionRowCount: 19,
    confirmedConnectionCount: 17,
    rejectedConnectionCount: 2,
    modelId: 1,
    modelSha256: 'bd876b0cb332c55e65a76067150fc268f785f35d43f75df118f70734a8084583',
    stagedPieceCount: 21,
    stagingSha256: 'a998069bdf10591438979f763baded1d723fe08f2e26a89c1c69ce89f5d4e1cf',
    connectionSha256: 'b801636953e5b645aa515f10e42deaae9d0a0257905fe79801eda55153d36268',
    assemblyOrderSha256: '9ab9e50d4eb88a7c1ef0598002a793d2188958e0f0246b90d48caecc959da3b5',
    saveReceiptSha256: '0f579c7a8eaabd7139329c52160b9f6e393218d58725e619f26167044d77580a',
    receiptSha256: '8118bb0e257503f41fb02a0b93e5485d919e24d5d77603831fd846602b734771',
  }),
  11: Object.freeze({
    dxfFile: 'card11-MAIN-20260904162434087ed79-ecf7631b8767d96b4768ad400755dd2b.dxf',
    dxfBytes: 390_347,
    dxfSha256: 'b023e1b467831a12b2ec419503ca1b6676c64ecceb57d9039222c8f37454ea3d',
    sourcePieceCount: 25,
    sourceOperationCount: 42,
    connectionRowCount: 20,
    confirmedConnectionCount: 14,
    rejectedConnectionCount: 6,
    modelId: 1,
    modelSha256: 'bd876b0cb332c55e65a76067150fc268f785f35d43f75df118f70734a8084583',
    stagedPieceCount: 15,
    stagingSha256: '3d7c5d6cf9c8db74dba7f5e019b3ed1e9e8f0a8490703be205fd7819eca1fe90',
    connectionSha256: '974fcf96a8dbf236e90e5d15c761c48fdc2baf1a97f15c53cffcfda79f9651c2',
    assemblyOrderSha256: 'db2a65e8ba1938c3e6d2e60d18bac8869bc329a9cf89014a76d3b3c462870529',
    saveReceiptSha256: '01751482ddda91d2a9276476504b79397fc661e9bb753e394fd54903f0c7b910',
    receiptSha256: '31a7c01cf6273d5a59bdc92ee561bff10ffa9e0f2d8025babcb284160914d31a',
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

function overlayFromGraphPieces(
  pieces: Awaited<ReturnType<typeof readSeamGraph>>['pieces'],
): MeasurementSurfacePatternPieceOverlayV1 {
  const staged: MeasurementSurfacePatternPieceV1[] = pieces.map((piece, laneIndex) => ({
    pieceKey: piece.pieceKey,
    scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
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
  }));
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
      'runs DXF → model → connections → AO → save → reload for card $techCardId',
      async ({ techCardId, prefix, category }) => {
        const expected = EXPECTED[techCardId];
        const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
          (candidate) => candidate.facts.techCardId === techCardId,
        );
        const card = cards[String(techCardId)];
        expect(profile).toBeDefined();
        expect(card).toBeDefined();

        const dxfFile = exactDxf(prefix);
        const dxf = readFileSync(resolve(PROD_DATA, 'dxf', dxfFile));
        const bytes = dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength);
        const loaded = await loadFacts(bytes, 'M', category as SkeletonCategory, {});
        const graph = await readSeamGraph(loaded.facts);
        const overlay = overlayFromGraphPieces(graph.pieces);
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
        const connections = normalizeGoldRows(gold);
        const availableEdges = new Map(
          graph.pieces.flatMap(({ pieceKey, edges }) =>
            edges.map(({ id }) => [id, pieceKey] as const),
          ),
        );
        for (const connection of connections)
          for (const side of [...connection.sideA, ...connection.sideB])
            expect(availableEdges.get(side.edgeHint), side.edgeHint).toBe(side.piece);

        const confirmedConnectionCount = connections.filter(
          ({ status }) => status === 'confirmed',
        ).length;
        const rejectedConnectionCount = connections.filter(
          ({ status }) => status === 'rejected',
        ).length;

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
        const connectionSha256 = sha256(canonical(connections));
        const assemblyOrderSha256 = sha256(canonical(card.ops));
        const snapshot = {
          schemaVersion: LOCAL_LIVE_SCHEMA,
          card: {
            techCardId,
            cardRef: profile!.cardRef,
            name: card.name,
            styleNumber: card.sn,
          },
          dxf: { file: dxfFile, byteLength: dxf.byteLength, sha256: sha256(dxf) },
          model: { id: selectedModel!.id, previewSha256: modelSha256 },
          staging: {
            pieceCount: graph.pieces.length,
            edgeCount: graph.pieces.reduce((total, piece) => total + piece.edges.length, 0),
            canonicalSha256: stagingSha256,
          },
          connections: {
            rowCount: connections.length,
            confirmedCount: confirmedConnectionCount,
            rejectedCount: rejectedConnectionCount,
            canonicalSha256: connectionSha256,
            rows: connections,
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
          dxfFile,
          dxfBytes: dxf.byteLength,
          dxfSha256: sha256(dxf),
          sourcePieceCount: card.pieces.length,
          stagedPieceCount: graph.pieces.length,
          connectionRowCount: connections.length,
          confirmedConnectionCount,
          rejectedConnectionCount,
          sourceOperationCount: card.ops.length,
          currentServerOperationCount: profile!.facts.operationCount,
          modelId: selectedModel!.id,
          modelSha256,
          stagingSha256,
          connectionSha256,
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
