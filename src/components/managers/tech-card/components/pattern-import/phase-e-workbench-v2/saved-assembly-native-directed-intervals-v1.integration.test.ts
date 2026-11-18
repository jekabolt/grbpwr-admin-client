import type { AdminService, GetTechCardSavedAssemblySnapshotResponse } from 'api/proto-http/admin';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createDxfProductSavedReprocessOwnerV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { toWire } from 'lib/seams/wire';
import { beforeAll, expect, it, vi } from 'vitest';
import { rowFromHand } from '../../assembly-seams/seam-actions';
import { buildPatternImportDxfPhaseEExactAnchorEdgeV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import {
  isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1,
  resolveSavedAssemblyNativeDirectedIntervalsV1,
} from './saved-assembly-native-directed-intervals-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonicalize } from './saved-assembly-topology-hash-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelReprocessHostV1,
  digestFullAssemblyFixture,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { createSavedNativeSewingAuthoringViewV1 } from './saved-native-sewing-authoring-view-v1';

const operationNumber = 10;
const sizeToken = 'M';
const signal = new AbortController().signal;
type WireSeam = ReturnType<typeof toWire>;

async function loadSaved(seed: SavedThreePanelFixtureV1) {
  const host = createSavedThreePanelReprocessHostV1(seed, true);
  const owner = createDxfProductSavedReprocessOwnerV1(host);
  try {
    const replay = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!replay.ok || !replay.nativeSewingReplay?.replayReady) {
      throw new Error(JSON.stringify(replay.blockers));
    }
    return replay;
  } finally {
    owner.dispose();
    host.dispose();
  }
}

async function nativeAuthoring(seed: SavedThreePanelFixtureV1) {
  const replay = await loadSaved(seed);
  const draft = createSavedNativeSewingAuthoringViewV1(
    replay.draft,
    replay.nativeSewingReplay,
    seed.row.sha256,
  );
  const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    seed.row.scopeKey,
    sizeToken,
  );
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(
    draft,
    seed.row.scopeKey,
    sizeToken,
  );
  if (!catalogResult.ok || !selection.ok) throw new Error('Native authoring fixture was blocked.');
  const { catalog } = catalogResult;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selection.selection);
  if (!projected.ok) throw new Error(JSON.stringify(projected.blockers));

  const edge = (key: string, ordinal: number, reversed: boolean) => {
    const piece = catalog.pieces.find(({ pieceLineKey }) => pieceLineKey === key)!;
    const contour = piece.contours.find(({ role }) => role === 'sewing-boundary')!;
    const from = contour.boundaryVertices[ordinal]!.vertexId;
    const to = contour.boundaryVertices[(ordinal + 1) % contour.boundaryVertices.length]!.vertexId;
    const boundaryVertexIds = [from, to] as const;
    const result = buildPatternImportDxfPhaseEExactAnchorEdgeV1(
      {
        pieceLineKey: key,
        pieceId: piece.pieceId,
        contourId: contour.contourId,
        boundaryVertexIds: reversed ? [to, from] : boundaryVertexIds,
      },
      catalog,
      projected.projection,
    );
    if (!result.ok) throw new Error(result.blocker.detail);
    return { ...result, boundaryVertexIds };
  };
  const writeRow = (
    seamKey: string,
    ordinal: number,
    reversed: boolean,
    secondOrdinal = ordinal,
  ) => {
    const a = edge('line-FRONT', ordinal, false);
    const b = edge('line-BACK', secondOrdinal, reversed);
    const pieces = [a.piece, b.piece];
    const row = rowFromHand(
      [a.target],
      [b.target],
      new Map(pieces.map((piece) => [piece.pieceKey, piece])),
      { pieces, grainDeg: null, nameOf: (key) => key, size: sizeToken },
      { seamKey, direction: reversed ? 'reversed' : 'same' },
    );
    if (!row) throw new Error('Normal seam serializer rejected the native fixture.');
    return { wire: toWire(row), vertexIds: [a.boundaryVertexIds, b.boundaryVertexIds] };
  };
  return { replay, catalog, edge, writeRow };
}

async function savedSource(
  seed: SavedThreePanelFixtureV1,
  ownedSeams: WireSeam[],
  seamKeys?: string[],
) {
  const { revision, ...row } = seed.row;
  const identity = { ...row, savedRowRevision: revision, patternVersion: 2 };
  const downloadable = { ...identity, downloadUrl: '/api/dxf/download' };
  const serverAssemblyRevision = `asm:v1:${'9'.repeat(32)}:21`;
  const operations = [
    {
      ...seed.operations[0]!,
      operationNumber,
      seamKeys: seamKeys ?? ownedSeams.map(({ seamKey }) => seamKey!),
    },
  ];
  const aliases = seed.card.existingAliases;
  const encodedSeams: WireSeam[] = JSON.parse(JSON.stringify(ownedSeams));
  const canonicalJson = canonicalize({
    serverAssemblyRevision,
    rows: [identity],
    operations,
    ownedSeams: encodedSeams,
    aliases,
    garmentLabels: [],
  });
  const sourceSha256 = await digestFullAssemblyFixture(
    new TextEncoder().encode(`tech-card-saved-assembly-complete-source/1\0${canonicalJson}`),
  );
  const reply = {
    row: downloadable,
    serverAssemblyRevision,
    operations,
    completeSourceV1: {
      rows: [downloadable],
      ownedSeams: encodedSeams,
      aliases,
      garmentLabels: [],
      sourceSha256,
      canonicalJson: Buffer.from(canonicalJson).toString('base64'),
    },
  } as unknown as GetTechCardSavedAssemblySnapshotResponse;
  const read = vi.fn<AdminService['GetTechCardSavedAssemblySnapshot']>().mockResolvedValue(reply);
  const source = await readCompleteSavedAssemblySourceV1(
    { GetTechCardSavedAssemblySnapshot: read },
    seed.row,
    {},
    signal,
  );
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedCardLockVersion: row.cardLockVersion,
      expectedSavedRowRevision: revision,
      expectedSha256: row.sha256,
    }),
  );
  return source;
}

let seed: SavedThreePanelFixtureV1;
let authored: Awaited<ReturnType<typeof nativeAuthoring>>;
let wires: WireSeam[];
let expected: (readonly string[])[][];

beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1(2);
  authored = await nativeAuthoring(seed);
  const rows = ['upper', 'middle', 'lower'].map((key, index) =>
    authored.writeRow(key, index, index === 1),
  );
  wires = rows.map(({ wire }) => wire);
  expected = rows.map(({ vertexIds }) => vertexIds);
});

async function resolve(
  wire: WireSeam[] = wires,
  overrides: Partial<Parameters<typeof resolveSavedAssemblyNativeDirectedIntervalsV1>[0]> = {},
) {
  return resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source: await savedSource(seed, wire),
      expectedRow: seed.row,
      replay: authored.replay,
      operationNumber,
      sizeToken,
      ...overrides,
    },
    signal,
  );
}

it('rehydrates all six directed native intervals from three saved exact wire rows', async () => {
  // Reopen the identical saved DXF to derive a new trusted native replay before reading saved AO.
  const replay = await loadSaved(seed);
  const result = await resolve(wires, {
    replay,
    expectedCatalogCanonicalSha256: authored.catalog.canonicalSha256,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.blocker));
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(result.receipt)).toBe(true);
  expect(
    isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(structuredClone(result.receipt)),
  ).toBe(false);
  expect(
    result.receipt.orderedSeams.map(({ seamKey, seamDirection, sides }) => ({
      seamKey,
      seamDirection,
      directions: sides.map(({ direction }) => direction),
    })),
  ).toEqual([
    { seamKey: 'upper', seamDirection: 'same', directions: ['forward', 'forward'] },
    { seamKey: 'middle', seamDirection: 'reversed', directions: ['forward', 'reverse'] },
    { seamKey: 'lower', seamDirection: 'same', directions: ['forward', 'forward'] },
  ]);
  expect(
    result.receipt.orderedSeams.map(({ sides }) =>
      sides.map(({ boundaryVertexIds }) => boundaryVertexIds),
    ),
  ).toEqual(expected);
  const wireAnchors = result.receipt.orderedSeams.flatMap(({ sides }) =>
    sides.map(({ canonicalAnchorWire }) => JSON.parse(canonicalAnchorWire)),
  );
  expect(wireAnchors).toEqual(
    wires.flatMap(({ sideA, sideB }) => [sideA!.parts![0], sideB!.parts![0]]),
  );
  const { canonicalSha256, ...unsigned } = result.receipt;
  expect(canonicalSha256).toBe(
    await digestFullAssemblyFixture(
      new TextEncoder().encode(`${unsigned.schemaVersion}\0${canonicalize(unsigned)}`),
    ),
  );
});

it('rejects other row identities, seam ownership and stale catalog at the current geometry', async () => {
  const anotherRow = { ...seed, row: { ...seed.row, patternLineKey: 'another-row' } };
  expect(
    await resolve(wires, {
      source: await savedSource(anotherRow, wires),
      expectedRow: anotherRow.row,
    }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-source-stale' },
  });
  expect(
    await resolve(wires, { expectedRow: { ...seed.row, revision: seed.row.revision + 1 } }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-source-stale' },
  });
  expect(
    await resolve(wires, {
      source: await savedSource(seed, wires, ['wrong-seam-key', 'middle', 'lower']),
    }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-operation-invalid' },
  });
  expect(await resolve(wires, { expectedCatalogCanonicalSha256: 'c'.repeat(64) })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-catalog-stale' },
  });
  expect(await resolve(wires, { sizeToken: 'L' })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-catalog-stale' },
  });
});

it('checks current aliases and normalizes omitted proto defaults for the same measured wire', async () => {
  const omitted = structuredClone(wires);
  const anchor = omitted[0]!.sideA!.parts![0]!;
  anchor.rangeFrom = undefined;
  anchor.rangeTo = undefined;
  anchor.notches = undefined;
  anchor.turnDeg = undefined;
  for (const sample of anchor.samples ?? []) {
    if (sample.u === 0) sample.u = undefined;
    if (sample.v === 0) sample.v = undefined;
  }
  expect(await resolve(omitted)).toMatchObject({ ok: true });

  const relinked = structuredClone(seed);
  relinked.card.existingAliases![0]!.blockName = 'another-block';
  expect(await resolve(wires, { source: await savedSource(relinked, wires) })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-piece-unbound', seamKey: 'upper', sideIndex: 0 },
  });
});

it('refuses publication and revokes earlier receipts when their read generation ends', async () => {
  const controller = new AbortController();
  const input = {
    source: await savedSource(seed, wires),
    expectedRow: seed.row,
    replay: authored.replay,
    operationNumber,
    sizeToken,
  };
  const issued = await resolveSavedAssemblyNativeDirectedIntervalsV1(input, controller.signal);
  if (!issued.ok) throw new Error(JSON.stringify(issued.blocker));
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(issued.receipt)).toBe(true);
  const pending = resolveSavedAssemblyNativeDirectedIntervalsV1(input, controller.signal);
  controller.abort();
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(issued.receipt)).toBe(false);
  expect(await pending).toEqual({
    ok: false,
    blocker: { code: 'saved-interval-cancelled', seamKey: undefined, sideIndex: undefined },
  });
});

it.each(['contourSig', 'sample', 'measured range', 'piece locator'] as const)(
  'refuses a changed %s on the same saved row',
  async (field) => {
    const changed = structuredClone(wires);
    const side = changed[1]!.sideB!.parts![0]!;
    switch (field) {
      case 'contourSig':
        side.contourSig = 'c'.repeat(16);
        break;
      case 'sample':
        side.samples![2]!.u! += 0.001;
        break;
      case 'measured range':
        side.rangeFrom = 0.1;
        side.rangeTo = 0.9;
        break;
      case 'piece locator':
        side.edgeHint = side.edgeHint!.replace('line-BACK', 'line-FRONT');
        break;
    }
    expect(await resolve(changed)).toMatchObject({
      ok: false,
      blocker: {
        code:
          field === 'measured range'
            ? 'saved-interval-seam-unsupported'
            : field === 'piece locator'
              ? 'saved-interval-locator-invalid'
              : 'saved-interval-wire-mismatch',
        seamKey: 'middle',
        sideIndex: 1,
      },
    });
  },
);

it('rejects a positive native edge when both directed fingerprints quantize to the same wire', async () => {
  const short = await createSavedThreePanelFixtureV1(2, { ambiguousShortEdge: true });
  const authoring = await nativeAuthoring(short);
  const front = authoring.catalog.pieces.find(({ pieceLineKey }) => pieceLineKey === 'line-FRONT')!;
  const contour = front.contours.find(({ role }) => role === 'sewing-boundary')!;
  const shortest = contour.boundaryVertices
    .map((_, index) => ({
      index,
      length: authoring.edge('line-FRONT', index, false).piece.edges[0]!.lenMm,
    }))
    .sort((a, b) => a.length - b.length)[0]!;
  expect(shortest.length).toBeGreaterThan(0.05);
  expect(shortest.length).toBeLessThan(1);
  const { wire } = authoring.writeRow('ambiguous', shortest.index, false, 0);
  const result = await resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source: await savedSource(short, [wire]),
      expectedRow: short.row,
      replay: authoring.replay,
      operationNumber,
      sizeToken,
    },
    signal,
  );
  expect(result).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-wire-ambiguous', seamKey: 'ambiguous', sideIndex: 0 },
  });
});
