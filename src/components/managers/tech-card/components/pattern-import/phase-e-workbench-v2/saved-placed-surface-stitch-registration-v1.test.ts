import type {
  GetTechCardSavedAssemblySnapshotResponse,
  common_TechCard,
} from 'api/proto-http/admin';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  completeSavedAssemblyRowIdentityV1,
  readCompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import { readSavedPlacedSurfaceStitchRegistrationV1 } from './saved-complete-assembly-native-stitch-anchors-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

const io = vi.hoisted(() => ({
  prepareNativeRows: vi.fn(() => {
    throw new Error('Native preparation was reached');
  }),
}));
vi.mock('./saved-full-assembly-complete-native-rows-v1', () => ({
  prepareSavedFullAssemblyCompleteNativeRowsV1: io.prepareNativeRows,
}));
vi.mock('api/api', () => ({ abortableAdminService: () => ({}) }));

const target = { operationNumber: 570, seamKey: '01M670HJDTKYTHVGYK5G019YD3' };
const card = {
  id: 6,
  lockVersion: 1,
  techCard: { sizeIds: [4] },
} as unknown as common_TechCard;
const projection = {
  card: { sizes: [{ sizeId: 4, token: 'M', rank: 2 }] },
  cardLockVersion: 1,
} as unknown as PatternImportDxfPhaseESavedRowCardProjectionV1;
const dictionary = {
  card,
  sizeDictionary: [
    { id: 4, name: 'm', countMen: 0, countWomen: 0, skuOrd: 0, skuSystem: undefined },
  ],
  selectedSizeId: 4,
};

function fixture() {
  const pieceA = '01M5J6YX6FB4KP34F86QF2RW0H';
  const pieceB = '01M5J6VRN9EFQ9ZQ4YHW8YVPG8';
  const main = {
    techCardId: 6,
    cardLockVersion: 1,
    scopeKey: 'main',
    patternLineKey: '01M5J6V2NVSKGQ64767RT9SFTK',
    url: 'https://objects.invalid/main.dxf',
    sha256: 'a'.repeat(64),
    sizeBytes: 100,
    savedRowRevision: 1,
    patternVersion: 9,
  };
  const operation = {
    operationNumber: target.operationNumber,
    seamKeys: [target.seamKey],
    inputKeys: [pieceB, pieceA],
  };
  const placement = { xMm: 0.6, yMm: -1.2, rotDeg: 0, flip: false };
  const seam = {
    seamKey: target.seamKey,
    status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
    kind: 'TECH_CARD_SEAM_KIND_SURFACE',
    direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
    stale: false,
    anchoredSize: '',
    sideA: {
      parts: [{ pieceLineKey: pieceA, edgeHint: 'i0', rangeFrom: 0, rangeTo: 0, placement }],
    },
    sideB: {
      parts: [
        {
          pieceLineKey: pieceB,
          edgeHint: `${pieceB}#3`,
          rangeFrom: 0,
          rangeTo: 0,
          placement: { ...placement },
        },
      ],
    },
  };
  const seal = {
    serverAssemblyRevision: `asm:v1:${'1'.repeat(32)}:2`,
    rows: [main],
    operations: [operation],
    ownedSeams: [seam],
    aliases: [],
    garmentLabels: [],
  };
  const signal = new AbortController().signal;
  async function read(sourceOnly = true) {
    const json = JSON.stringify(seal, (_key, item: unknown) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : item,
    );
    const row = { ...main, downloadUrl: '/read/fixture.dxf' };
    const response = {
      row,
      serverAssemblyRevision: seal.serverAssemblyRevision,
      operations: seal.operations,
      completeSourceV1: {
        rows: [row],
        ownedSeams: seal.ownedSeams,
        aliases: seal.aliases,
        garmentLabels: seal.garmentLabels,
        canonicalJson: Buffer.from(json).toString('base64'),
        sourceSha256: createHash('sha256')
          .update('tech-card-saved-assembly-complete-source/1\0')
          .update(json)
          .digest('hex'),
      },
    } as unknown as GetTechCardSavedAssemblySnapshotResponse;
    return readCompleteSavedAssemblySourceV1(
      { GetTechCardSavedAssemblySnapshot: async () => response },
      completeSavedAssemblyRowIdentityV1({ ...main, revision: main.savedRowRevision }),
      sourceOnly ? { sourceOnly } : {},
      signal,
    );
  }
  return { seam, operation, read, signal };
}

it.each([
  'unknown',
  'stale',
  'size',
  'placement',
  'range',
  'second seam',
  'different operation',
  'forged source',
  'whole read',
] as const)('refuses %s before opening native source', async (reason) => {
  io.prepareNativeRows.mockClear();
  const f = fixture();
  if (reason === 'unknown') f.seam.direction = 'TECH_CARD_SEAM_DIRECTION_UNKNOWN';
  if (reason === 'stale') f.seam.stale = true;
  if (reason === 'size') f.seam.anchoredSize = 'L';
  if (reason === 'placement') f.seam.sideB.parts[0]!.placement.yMm = -2;
  if (reason === 'range') f.seam.sideB.parts[0]!.rangeTo = 0.8;
  if (reason === 'second seam') f.operation.seamKeys.push('second');
  if (reason === 'different operation') f.operation.operationNumber = 610;
  const source = await f.read(reason !== 'whole read');
  await expect(
    readSavedPlacedSurfaceStitchRegistrationV1(
      reason === 'forged source' ? { ...source } : source,
      projection,
      dictionary,
      target,
      f.signal,
    ),
  ).rejects.toThrow(/verified current card|placed surface review/);
  expect(io.prepareNativeRows).not.toHaveBeenCalled();
});

it('admits the exact confirmed direction and placement to the existing native-row owner', async () => {
  io.prepareNativeRows.mockClear();
  const f = fixture();
  await expect(
    readSavedPlacedSurfaceStitchRegistrationV1(
      await f.read(),
      projection,
      dictionary,
      target,
      f.signal,
    ),
  ).rejects.toThrow('Native preparation was reached');
  expect(io.prepareNativeRows).toHaveBeenCalledTimes(1);
});
