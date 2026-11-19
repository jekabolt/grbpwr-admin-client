import type {
  GetTechCardSavedAssemblySnapshotResponse,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from 'lib/cloth/body/model-mannequin-pose-document-v2';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import {
  SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
  SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1,
  SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8,
} from './saved-complete-assembly-native-stitch-review-v8';
import {
  readSavedCrossMaterialPlacementDocumentV9,
  SAVED_COMPLETE_ASSEMBLY_DIRECTED_PLACEMENT_COMPONENT_V1,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_PROFILE_V1,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_V9,
} from './saved-cross-material-placement-document-v9';
import { matchesSavedNeutralPlacementBodyV1 } from './saved-cross-material-placement-model-binding-v1';
import {
  buildSavedWholeAssemblyPlacementDocumentV10,
  readSavedWholeAssemblyPlacementDocumentV10,
  SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10,
  type SavedWholeAssemblyPlacementBodyV10,
  type SavedWholeAssemblyPlacementLayoutV10,
  type SavedWholeAssemblyPlacementResultV10,
} from './saved-whole-assembly-placement-document-v10';

const signal = new AbortController().signal;
const revision = 'asm:v1:0123456789abcdef0123456789abcdef:19';
const reviewDomain = 'tech-card-complete-source-native-review/1';
const narrowDomain = 'tech-card-complete-source-native-placement/1';
const wholeDomain = 'tech-card-complete-source-native-whole-placement/1';
const anchor = {
  techCardId: 11,
  scopeKey: 'main',
  patternLineKey: '01M5HJEQ163VWKDHWH5Y2XV5H6',
  revision: 1,
  cardLockVersion: 301,
  url: 'https://files.example/main.dxf',
  sizeBytes: 59_109,
  sha256: 'a'.repeat(64),
  patternVersion: 5,
};
const pocket = {
  ...anchor,
  scopeKey: 'pocketing',
  patternLineKey: '01M5HJEQ163VWKDHWH5Y2XV5H7',
  url: 'https://files.example/pocketing.dxf',
  sha256: '2'.repeat(64),
};
const pieceIds = ['01M1M1ZAHF234AZYFMF0HD21G4', '01M1PKV2XYJJ4QMT3XB0T35MCC'] as const;
const seamKeys = ['01M5HJEQ163VWKDHWH5Y2XV5H8', '01M5HJEQ163VWKDHWH5Y2XV5H9'];
const operations = [
  { operationNumber: 170, seamKeys, work: 'join_lockstitch', inputKeys: [...pieceIds] },
];
const samples = () => [0, 0.25, 0.5, 0.75, 1].map((u) => ({ u, v: 0 }));
const stitchAnchor = (pieceLineKey: string) => ({
  pieceLineKey,
  lenMm: 200,
  rangeFrom: 0,
  rangeTo: 0,
  samples: samples(),
  placement: null,
});
const ownedSeams = [
  {
    seamKey: seamKeys[0],
    kind: 'TECH_CARD_SEAM_KIND_EDGE',
    direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
    anchoredSize: '38',
    source: 'TECH_CARD_SEAM_SOURCE_MANUAL',
    status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
    stale: false,
    sideA: { parts: [stitchAnchor(pieceIds[0])] },
    sideB: { parts: [stitchAnchor(pieceIds[1])] },
  },
  {
    seamKey: seamKeys[1],
    kind: 'TECH_CARD_SEAM_KIND_POSE',
    status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
    stale: false,
    sideA: { parts: [{ pieceLineKey: pieceIds[0] }] },
    sideB: { parts: [{ pieceLineKey: pieceIds[1] }] },
  },
];
const aliases = [
  { scopeKey: 'main', blockName: 'front-piece', pieceLineKey: pieceIds[0] },
  { scopeKey: 'pocketing', blockName: 'pocket-piece', pieceLineKey: pieceIds[1] },
];
const rows = [anchor, pocket].map(({ revision: savedRowRevision, ...row }) => ({
  ...row,
  savedRowRevision,
}));
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const receipt = (domain: string, text: string) => digest(`${domain}\0${text}`);

function snapshotText(serverAssemblyRevision = revision) {
  return canonical({
    serverAssemblyRevision,
    rows,
    operations,
    ownedSeams,
    aliases,
    garmentLabels: [],
  });
}

async function readSource(
  semanticSidecar: TechCardPatternSemanticSidecar | undefined,
  serverAssemblyRevision = revision,
  sourceOnly?: true,
) {
  const [main, ...rest] = rows.map((row) => ({ ...row, downloadUrl: row.url }));
  const sourceText = snapshotText(serverAssemblyRevision);
  const reply = {
    row: main,
    operations,
    serverAssemblyRevision,
    semanticSidecar,
    completeSourceV1: {
      rows: [main, ...rest],
      ownedSeams,
      aliases,
      garmentLabels: [],
      sourceSha256: receipt('tech-card-saved-assembly-complete-source/1', sourceText),
      canonicalJson: Buffer.from(sourceText).toString('base64'),
    },
  } as unknown as GetTechCardSavedAssemblySnapshotResponse;
  return readCompleteSavedAssemblySourceV1(
    {
      GetTechCardSavedAssemblySnapshot: async (request) => {
        expect(request.sourceOnly).toBe(sourceOnly);
        return reply;
      },
    },
    anchor,
    { sourceOnly },
    signal,
  );
}

function blob(value: string | Uint8Array) {
  const bytes = Buffer.from(value);
  return { byteLength: bytes.byteLength, base64: bytes.toString('base64'), sha256: digest(bytes) };
}

function sidecar(mediaType: string, domain: string, text: string) {
  const bytes = blob(text);
  return {
    techCardId: anchor.techCardId,
    patternLineKey: anchor.patternLineKey,
    cardLockVersion: anchor.cardLockVersion,
    savedRowRevision: anchor.revision,
    patternVersion: anchor.patternVersion,
    dxfSha256: anchor.sha256,
    mediaType,
    sidecarBytes: bytes.base64,
    sidecarSha256: bytes.sha256,
    byteLength: bytes.byteLength,
    postSaveReceiptSha256: receipt(domain, text),
  } as TechCardPatternSemanticSidecar;
}

function initialReview() {
  const members = [anchor, pocket].map((row, sideIndex) => {
    const pieceLineKey = pieceIds[sideIndex];
    const pieceId = sideIndex === 0 ? 'front-piece' : 'pocket-piece';
    const sourceFileId = 's/b/' + Buffer.from(row.sha256, 'hex').toString('base64url');
    const pathPrefix = 'dxf-vertex-v1/dxf-curve-v1/f/' + Buffer.from(sourceFileId).toString('hex');
    return {
      row: { ...row },
      sideIndex,
      partOrdinal: 0,
      pieceLineKey,
      blockName: pieceId,
      pieceId,
      contourId: 'dxf-piece-v1/p/' + Buffer.from(pieceId).toString('hex') + '/s/3338/g/seam',
      nativePathId: 1,
      sourceFileId,
      direction: 'forward',
      orderedVertexIds: [pathPrefix + '/1', pathPrefix + '/2'],
      capturedSavedAnchorSha256: receipt(
        'tech-card-saved-assembly-native-anchor/1',
        canonical(stitchAnchor(pieceLineKey)),
      ),
    };
  });
  return {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8,
    mediaType: SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
    profile: SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1,
    encoding: 'canonical-json-utf8',
    bindings: {
      anchorRow: anchor,
      serverAssemblyRevision: revision,
      completeSourceSha256: receipt('tech-card-saved-assembly-complete-source/1', snapshotText()),
    },
    writeCas: { expectedPreviousSidecarSha256: null },
    selection: {
      operationNumber: 170,
      operationOrdinal: 0,
      ownedSeamKeys: seamKeys,
      savedDirection: 'reversed',
      savedAnchoredSize: '38',
      sizeId: 38,
      sizeToken: '38',
      sizeBasis: 'operator-confirmed-native',
      members,
    },
    review: {
      sourceDecisionSha256: 'd'.repeat(64),
      boundSourceRequestSha256: 'e'.repeat(64),
      gridSha256: 'f'.repeat(64),
      stationCount: 5,
    },
  };
}

let body: SavedWholeAssemblyPlacementBodyV10;
let reviewText: string;
let v8: TechCardPatternSemanticSidecar;
let v9: TechCardPatternSemanticSidecar;
let placed: SavedWholeAssemblyPlacementResultV10;

it('requires the exact saved neutral pose even when the displayed geometry hashes agree', () => {
  const neutral = createModelMannequinPoseDocumentV2(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
  const changed = createModelMannequinPoseDocumentV2({
    ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    legMode: 'independent',
  });
  const displayed = (poseDocument: typeof neutral) => ({
    identity: {
      modelId: `tech-card-base-model:${body.modelId}`,
      poseDocumentCanonicalKey: encodeModelMannequinPoseDocumentV2(poseDocument),
    },
    poseDocument,
    displayedPose: poseDocument.pose,
    hashes: body.observed,
  });
  expect(matchesSavedNeutralPlacementBodyV1(displayed(neutral), body)).toBe(true);
  expect(matchesSavedNeutralPlacementBodyV1(displayed(changed), body)).toBe(false);
});

function layout(): SavedWholeAssemblyPlacementLayoutV10 {
  return {
    sizeId: 38,
    sizeToken: '38',
    runtimeCandidateSha256: '4'.repeat(64),
    cutGraphSha256: '5'.repeat(64),
    pieceRanges: pieceIds.map((pieceId, index) => ({
      pieceId,
      vertexOffset: index * 3,
      vertexCount: 3,
      triangleOffset: index,
      triangleCount: 1,
    })),
    positionsM: new Float32Array([
      0, 1, -0.25, -10, 10, 1.5, -0.125, 0.5, 0, -0, 1.25, 0.5, 0.0001, 0.6, 0.7, 0.8, 1.1, -1.2,
    ]),
  };
}

beforeAll(async () => {
  const neutralPose = createModelMannequinPoseDocumentV2(
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  body = {
    modelId: 14,
    modelUpdatedAt: '2026-11-18T09:18:17.123456789Z',
    modelPhysicalInputsSha256: '6'.repeat(64),
    pose: {
      kind: 'neutral-default-direct-v9',
      canonicalSha256: (await fingerprintModelMannequinPoseDocumentV2(neutralPose)).slice(7),
    },
    observed: {
      bodyPositionsFloat32LeSha256: '7'.repeat(64),
      bodyTrianglesUint32LeSha256: '8'.repeat(64),
    },
  };
  const review = initialReview();
  reviewText = canonical(review);
  v8 = sidecar(SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8, reviewDomain, reviewText);
  const world = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_DIRECTED_PLACEMENT_COMPONENT_V1,
    reviewSha256: digest(reviewText),
    body,
    placement: {
      centerMm: [0, 1010, 220],
      depthOffsetsMm: [4, 0],
      directedCut: {
        gridSha256: review.review.gridSha256,
        carrierMaterialPositionsFloat64LeSha256: '9'.repeat(64),
        carrierTrianglesUint32LeSha256: 'a'.repeat(64),
        positionsInvMassFloat32LeSha256: 'b'.repeat(64),
        pieces: pieceIds.map((pieceId, index) => ({
          pieceId,
          originMm: [0, 0],
          centerM: [0, 1.01, index === 0 ? 0.224 : 0.22],
          cos: 1,
          sin: 0,
        })),
      },
    },
  };
  const document = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_V9,
    mediaType: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
    profile: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_PROFILE_V1,
    encoding: 'canonical-json-utf8',
    bindings: review.bindings,
    writeCas: { expectedPreviousSidecarSha256: digest(reviewText) },
    components: [
      {
        kind: 'native-cross-row-review-v8',
        mediaType: SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
        ...blob(reviewText),
      },
      {
        kind: 'native-cross-row-world-placement-v1',
        mediaType: 'application/vnd.grbpwr.pattern-dxf-native-world-placement.v1+json',
        ...blob(canonical(world)),
      },
    ],
  };
  v9 = sidecar(SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9, narrowDomain, canonical(document));
  placed = await buildSavedWholeAssemblyPlacementDocumentV10(
    await readSource(v8),
    layout(),
    body,
    signal,
  );
});

function wrapV10(text: string) {
  return sidecar(SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10, wholeDomain, text);
}

async function readPlaced(text = Buffer.from(placed.bytes).toString('utf8')) {
  return readSavedWholeAssemblyPlacementDocumentV10(await readSource(wrapV10(text)), signal);
}

function withWorld(world: SavedWholeAssemblyPlacementResultV10['world']) {
  return canonical({
    ...placed.document,
    components: [
      placed.retainedCarrier,
      { ...placed.document.components[1], ...blob(canonical(world)) },
    ],
  });
}

describe('saved whole assembly placement V10', () => {
  it('reads the same sealed Assembly source without admitting a carrier when requested', async () => {
    const ordinary = await readSource(v8);
    const sourceOnly = await readSource(undefined, revision, true);
    expect(sourceOnly.sourceOnly).toBe(true);
    expect(sourceOnly.sourceSha256).toBe(ordinary.sourceSha256);
    expect(sourceOnly.priorCarrier).toBeNull();
    await expect(readSource(v8, revision, true)).rejects.toThrow('source-only Assembly read');
  });

  it('round trips exact little-endian XYZ from the verified V8 slot and seals original V8 bytes', async () => {
    const read = await readPlaced();
    expect(read).toEqual(placed);
    expect(read.review.text).toBe(reviewText);
    expect(read.review.sha256).toBe(v8.sidecarSha256);
    expect(read.retainedCarrier.base64).toBe(v8.sidecarBytes);
    expect(read.document.writeCas.expectedPreviousSidecarSha256).toBe(v8.sidecarSha256);
    expect(read.postSaveReceiptSha256).toBe(receipt(wholeDomain, canonical(read.document)));
    expect(read.sha256).toBe(digest(read.bytes));
    expect(read.world.layout.positions.byteLength).toBe(72);
    const bytes = Buffer.from(read.world.layout.positions.base64, 'base64');
    expect(bytes.subarray(0, 12).toString('hex')).toBe('000000000000803f000080be');
    expect(bytes.readUInt32LE(9 * 4)).toBe(0);
    expect([...read.layout.positionsM]).toEqual(
      [...layout().positionsM].map((x) => (x === 0 ? 0 : x)),
    );
    expect(read.narrowPlacement).toBeUndefined();
  });

  it('keeps exact V9 bytes and the original narrow model when the active V10 body differs', async () => {
    const before = await readSource(v9);
    const legacy = await readSavedCrossMaterialPlacementDocumentV9(before, signal);
    const built = await buildSavedWholeAssemblyPlacementDocumentV10(
      before,
      layout(),
      { ...body, modelId: 29 },
      signal,
    );
    const read = await readPlaced(canonical(built.document));
    expect(read.body.modelId).toBe(29);
    expect(read.narrowPlacement?.world.body.modelId).toBe(14);
    expect(read.narrowPlacement?.world).toEqual(legacy.world);
    expect(read.retainedCarrier.base64).toBe(v9.sidecarBytes);
    expect(read.retainedCarrier.sha256).toBe(v9.sidecarSha256);
    expect(read.review.text).toBe(reviewText);
  });

  it('uses the current V10 digest for edit CAS without nesting V10 or rewriting V9 bytes', async () => {
    const built = await buildSavedWholeAssemblyPlacementDocumentV10(
      await readSource(v9),
      layout(),
      body,
      signal,
    );
    const read = await readSource(wrapV10(canonical(built.document)));
    const nextLayout = layout();
    nextLayout.positionsM[0] = 2;
    const next = await buildSavedWholeAssemblyPlacementDocumentV10(read, nextLayout, body, signal);
    expect(next.document.writeCas.expectedPreviousSidecarSha256).toBe(built.sha256);
    expect(next.retainedCarrier).toEqual(built.retainedCarrier);
    expect((await readPlaced(canonical(next.document))).positionsM[0]).toBe(2);
  });

  it('captures the coordinates and body before asynchronous hashes run', async () => {
    const source = await readSource(v8);
    const draft = layout();
    const model = { ...body, modelId: 27 };
    const building = buildSavedWholeAssemblyPlacementDocumentV10(source, draft, model, signal);
    draft.positionsM[0] = 2.25;
    model.modelId = 99;
    const built = await building;
    expect(built.positionsM[0]).toBe(0);
    expect(built.body.modelId).toBe(27);
  });

  it('rejects a copied source, a moved Complete seal, wrong receipt and cancellation', async () => {
    const source = await readSource(v8);
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10({ ...source }, layout(), body, signal),
    ).rejects.toThrow('verified current Complete');
    const moved = await readSource(v8, revision.replace(':19', ':20'));
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(moved, layout(), body, signal),
    ).rejects.toThrow('different source rows or Assembly Order');
    const wrongReceipt = await readSource({ ...v8, postSaveReceiptSha256: 'f'.repeat(64) });
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(wrongReceipt, layout(), body, signal),
    ).rejects.toThrow('receipt');
    await expect(
      readSavedWholeAssemblyPlacementDocumentV10(source, AbortSignal.abort()),
    ).rejects.toHaveProperty('name', 'AbortError');
  });

  it('checks the final receipt and exact JSON shape after storage', async () => {
    const text = canonical(placed.document);
    const wrongReceipt = await readSource({
      ...wrapV10(text),
      postSaveReceiptSha256: 'f'.repeat(64),
    });
    await expect(readSavedWholeAssemblyPlacementDocumentV10(wrongReceipt, signal)).rejects.toThrow(
      'receipt',
    );
    await expect(
      readPlaced(
        text.replace(
          '"encoding":"canonical-json-utf8"',
          '"encoding":"canonical-json-utf8","encoding":"canonical-json-utf8"',
        ),
      ),
    ).rejects.toThrow('canonical JSON');
    await expect(readPlaced(canonical({ ...placed.document, extra: true }))).rejects.toThrow(
      'exact V10 shape',
    );
    await expect(readPlaced('\uFEFF' + text)).rejects.toThrow();
  });

  it('rejects rehashed negative zero, changed size and substituted pose', async () => {
    const changedBytes = Buffer.from(placed.world.layout.positions.base64, 'base64');
    changedBytes.writeUInt32LE(0x80000000, 0);
    await expect(
      readPlaced(
        withWorld({
          ...placed.world,
          layout: {
            ...placed.world.layout,
            positions: { encoding: 'float32-le-xyz', ...blob(changedBytes) },
          },
        }),
      ),
    ).rejects.toThrow('finite canonical Float32');
    await expect(
      readPlaced(
        withWorld({
          ...placed.world,
          layout: { ...placed.world.layout, sizeId: 39 },
        }),
      ),
    ).rejects.toThrow('reviewed size');
    await expect(
      readPlaced(
        withWorld({
          ...placed.world,
          body: { ...body, pose: { ...body.pose, canonicalSha256: 'c'.repeat(64) } },
        }),
      ),
    ).rejects.toThrow('exact neutral pose');
  });

  it('preserves an ordered 24-piece layout with 1,962 vertices', async () => {
    const source = await readSource(v8);
    const vertexCount = 1_962;
    const positionsM = new Float32Array(vertexCount * 3);
    positionsM[positionsM.length - 1] = -0.125;
    const pieceRanges = Array.from({ length: 24 }, (_, index) => ({
      pieceId: '01M5HJEQ163VWKDHWH5Y2X' + index.toString().padStart(4, '0'),
      vertexOffset: index * 80,
      vertexCount: index === 23 ? vertexCount - index * 80 : 80,
      triangleOffset: index,
      triangleCount: 1,
    }));
    const built = await buildSavedWholeAssemblyPlacementDocumentV10(
      source,
      { ...layout(), pieceRanges, positionsM },
      body,
      signal,
    );
    const read = await readPlaced(canonical(built.document));
    expect(read.layout.pieceRanges).toEqual(pieceRanges);
    expect(read.positionsM).toEqual(positionsM);
  });

  it('rejects extra retained V9 fields even when the predecessor SHA and receipt were rehashed', async () => {
    const document = JSON.parse(Buffer.from(v9.sidecarBytes!, 'base64').toString());
    const malformed = sidecar(
      SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
      narrowDomain,
      canonical({
        ...document,
        unexpected: true,
      }),
    );
    const source = await readSource(malformed);
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(source, layout(), body, signal),
    ).rejects.toThrow('exact V9 carrier');
  });

  it('rejects wrong counts, noncanonical IDs, duplicates and unsafe coordinates', async () => {
    const source = await readSource(v8);
    const draft = layout();
    const [first, last] = draft.pieceRanges;
    for (const invalid of [
      { ...last, pieceId: first.pieceId },
      { ...last, pieceId: last.pieceId.toLowerCase() },
      { ...last, vertexOffset: 4 },
      { ...last, vertexCount: 2_001 },
      { ...last, triangleCount: 5_000 },
    ]) {
      await expect(
        buildSavedWholeAssemblyPlacementDocumentV10(
          source,
          {
            ...draft,
            pieceRanges: [first, invalid],
          },
          body,
          signal,
        ),
      ).rejects.toThrow('positive contiguous mesh ranges');
    }
    const short = { ...draft, positionsM: draft.positionsM.slice(0, -1) };
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(source, short, body, signal),
    ).rejects.toThrow('exactly three Float32');
    draft.positionsM[0] = 10.01;
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(source, draft, body, signal),
    ).rejects.toThrow('within 10 metres');
    draft.positionsM[0] = Number.NaN;
    await expect(
      buildSavedWholeAssemblyPlacementDocumentV10(source, draft, body, signal),
    ).rejects.toThrow('finite canonical Float32');
  });
});
