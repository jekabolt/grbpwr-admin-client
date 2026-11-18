import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type {
  GetTechCardSavedAssemblySnapshotResponse,
  common_TechCardOperation,
  common_TechCardSeamAnchor,
} from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { readDxf } from 'lib/pattern-import/adapters/dxf/extract';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { grainRotation } from 'lib/pom/upright';
import { anchorOf } from 'lib/seams/anchor';
import { runsOfPiece } from 'lib/seams/frame';
import { anchorToWire } from 'lib/seams/wire';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import {
  parseSavedNativeStitchRowV1,
  readSavedNativeStraightStitchPathsV1,
} from './saved-legacy-native-stitch-run-v8';
import { projectSavedNativeTopstitchDisplayV1 as project } from './saved-native-topstitch-display-v1';

type Input = Parameters<typeof project>[0];
const signal = new AbortController().signal;
const operationNumber = 20;
const pieceLineKey = '01M1M1ZAHFNFXSPQ3V9ZA46AVQ';
const threadKey = '01M5QV5TWK93P1E5JJZTY1NWRF';
const lineKey = '01M5HJEQ163VWKDHWH5Y2XV5H9';
const serverAssemblyRevision = 'asm:v1:0123456789abcdef0123456789abcdef:19';
const blockName = 'FRONT';
const rawBlock = blockName + '_M';
const size = { sizeId: 3, name: 'M', token: 'M', rank: 2 };
const originalL14 = [
  [13, 23],
  [73, 23],
  [73, 63],
  [13, 63],
] as const;
const aliases = [{ scopeKey: 'main', blockName, pieceLineKey }];

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
type DxfTag = readonly [number, string | number];
function dxfTags(tags: readonly DxfTag[]) {
  return tags.flat().join('\n') + '\n';
}

function polyline(layer: string, points: readonly (readonly [number, number])[]) {
  const vertices = points.flatMap(([x, y]): DxfTag[] => [
    [0, 'VERTEX'],
    [8, layer],
    [10, x],
    [20, y],
    [30, 0],
    [70, 0],
  ]);
  return dxfTags([
    [0, 'POLYLINE'],
    [8, layer],
    [66, 1],
    [70, 1],
    [10, 0],
    [20, 0],
    ...vertices,
    [0, 'SEQEND'],
    [8, layer],
  ]);
}

async function readSource(
  row: Input['path']['row'],
  operations: readonly common_TechCardOperation[],
  bindings = aliases,
) {
  const { revision: savedRowRevision, ...identity } = row;
  const currentRow = { ...identity, savedRowRevision, patternVersion: 5 };
  const wireRow = { ...currentRow, downloadUrl: row.url };
  const facts = {
    serverAssemblyRevision,
    rows: [currentRow],
    operations,
    ownedSeams: [],
    aliases: bindings,
    garmentLabels: [],
  };
  const canonicalJson = canonical(JSON.parse(JSON.stringify(facts)));
  const reply: GetTechCardSavedAssemblySnapshotResponse = {
    row: wireRow,
    operations: [...operations],
    serverAssemblyRevision,
    selectedOperationNumber: undefined,
    selectedSeams: undefined,
    assemblyTopologySha256: undefined,
    topologyCanonicalJson: undefined,
    completeSourceV1: {
      rows: [wireRow],
      ownedSeams: [],
      aliases: bindings,
      garmentLabels: [],
      cutStrips: undefined,
      sourceSha256: digest('tech-card-saved-assembly-complete-source/1\0' + canonicalJson),
      canonicalJson: Buffer.from(canonicalJson).toString('base64'),
    },
  };
  return readCompleteSavedAssemblySourceV1(
    { GetTechCardSavedAssemblySnapshot: async () => reply },
    row,
    {},
    signal,
  );
}

async function fixture(reverse = false) {
  const header = dxfTags([
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    [9, '$INSUNITS'],
    [70, 4],
    [999, 'Topstitch fixture'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'BLOCKS'],
    [0, 'BLOCK'],
    [8, 0],
    [2, rawBlock],
    [70, 0],
    [10, 0],
    [20, 0],
  ]);
  const footer = dxfTags([
    [0, 'ENDBLK'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    [0, 'INSERT'],
    [8, 0],
    [2, rawBlock],
    [10, 0],
    [20, 0],
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ]);
  const file = new TextEncoder().encode(
    header +
      polyline('1', [
        [10, 20],
        [76, 20],
        [76, 66],
        [10, 66],
      ]) +
      polyline('14', reverse ? originalL14.toReversed() : originalL14) +
      footer,
  );
  const row = {
    techCardId: 156,
    scopeKey: 'main',
    patternLineKey: '01M5HJEQ163VWKDHWH5Y2XV5H6',
    revision: 7,
    cardLockVersion: 301,
    url: 'https://files.example/front.dxf',
    sizeBytes: file.byteLength,
    sha256: digest(file),
  };
  const sourceFileId = computeDxfProductSavedSourceFileIdV1(row);
  const fileName = rawBlock + '.dxf';
  const read = await readDxf(
    { id: sourceFileId, name: fileName, bytes: file.buffer },
    { sagittaMm: 0.1, keepFills: true },
  );
  const page = read.doc.pages[0]!;
  const nativeCut = page.paths.find(({ style }) =>
    page.styles.some((s) => s.id === style && s.layer === '1'),
  )!;
  const sewing = page.paths.find(({ style }) =>
    page.styles.some((s) => s.id === style && s.layer === '14'),
  )!;
  const nativePath = {
    row,
    sourceFileId,
    sizeToken: size.token,
    pieceId: 'piece-front',
    pieceLineKey,
    blockName,
    contourId: 'front-original-l14',
    nativePathId: sewing.id,
  };
  const { descriptors } = await readSavedNativeStraightStitchPathsV1(
    file,
    nativePath as Input['path'],
    [sewing.id],
    signal,
  );
  const edges = descriptors.toSorted((a, b) => a.path.startPointIndex - b.path.startPointIndex);
  const path = {
    ...nativePath,
    sourceInstancePath: edges[0]!.instancePath,
    vertexIds: edges.map((edge) => edge.startVertexId),
    nativePointsMm: edges.map(({ startMm: [x, y] }) => ({ x, y })),
  } as unknown as Input['path'];
  const { pieces } = await parseSavedNativeStitchRowV1(file, fileName);
  const cut = pieces.find(({ layer }) => layer === '1')!;
  const geom = segmentPiece({
    pieceKey: pieceLineKey,
    name: rawBlock,
    piece: pieces.find(({ layer }) => layer === '14')!,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  const runs = runsOfPiece(geom);
  const run = runs.find(
    ({ pts }) =>
      pts[0]?.[0] === 0 && pts[0]?.[1] === 0 && pts.at(-1)?.[0] === 60 && pts.at(-1)?.[1] === 0,
  )!;
  const corner = runs.find(
    ({ pts }) =>
      pts[0]?.[0] === 0 && pts[0]?.[1] === 0 && pts.at(-1)?.[0] === 60 && pts.at(-1)?.[1] === 40,
  )!;
  const cornerAnchor = anchorToWire(anchorOf(geom, corner, grainRotation(cut)));
  const stored = anchorToWire({
    ...anchorOf(geom, run, grainRotation(cut)),
    range: [0.25, 0.75],
  });
  const anchor: common_TechCardSeamAnchor = { ...stored, placement: undefined, layer: undefined };
  const operation = {
    operationNumber,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
    inputKeys: [pieceLineKey],
    seamKeys: [],
    bomLineKeys: [threadKey],
    topstitch: {
      mode: 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM',
      widthMm: { value: '2.5' },
      rows: 1,
    },
    topstitchLines: [
      {
        lineKey,
        bomLineKey: threadKey,
        parts: [anchor],
        anchoredSize: 'M',
        rows: 1,
        // The saved DTO emits stale and leaves the write-only measured field unset.
      },
    ],
  } as unknown as common_TechCardOperation;
  const card = {
    id: row.techCardId,
    lockVersion: row.cardLockVersion,
    techCard: {
      sizeIds: [size.sizeId],
      pieces: [{ lineKey: pieceLineKey }],
      bomItems: [
        {
          lineKey: threadKey,
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
          unit: 'm',
        },
      ],
    },
  } as Input['card'];
  const projection: Input['projection'] = {
    cardLockVersion: row.cardLockVersion,
    card: {
      techCardId: row.techCardId,
      sizes: [size],
      scopes: [],
      existingPieces: [],
      styleLabel: 'Fixture',
    },
  };
  return {
    input: {
      source: await readSource(row, [operation]),
      card,
      projection,
      sizeId: size.sizeId,
      operationNumber,
      path,
      file,
    } satisfies Input,
    operation,
    anchor,
    cornerAnchor,
    cutPathId: nativeCut.id,
  };
}

describe('saved native Topstitch display', () => {
  it.each([false, true])(
    'projects the exact directed L14 range inward (reversed DXF %s)',
    async (reverse) => {
      const { input } = await fixture(reverse);
      const result = await project(input, signal);
      expect(result).toMatchObject({
        kind: 'saved-native-topstitch-display',
        operationNumber,
        sizeId: size.sizeId,
        sizeToken: 'M',
        sizeRank: 2,
        pieceLineKey,
        lineKey,
        threadBomLineKey: threadKey,
        originalRange: [0.25, 0.75],
        originalLengthMm: 30,
        widthMm: 2.5,
        rows: 1,
        originalInterval: { startMm: [28, 23], endMm: [58, 23] },
        provenance: {
          row: input.path.row,
          assemblyRevision: serverAssemblyRevision,
          completeSourceSha256: input.source.sourceSha256,
          sourceFileId: input.path.sourceFileId,
          nativePathId: input.path.nativePathId,
          rawBlock,
          nativeStraightAuthoritySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
      expect(
        result.pieceLocalSegmentMm.map(({ x, y }) => [
          x + result.nativeOriginMm.x,
          y + result.nativeOriginMm.y,
        ]),
      ).toEqual([
        [28, 25.5],
        [58, 25.5],
      ]);
      expect(result.originalInterval.t0).toBe(reverse ? 0.75 : 0.25);
      expect(result.originalInterval.t1).toBe(reverse ? 0.25 : 0.75);
    },
  );

  it('refuses a stale or ambiguous operation, forged snapshot, size or BOM', async () => {
    const { input, operation } = await fixture();
    const renderFrom = async (operations: common_TechCardOperation[]) =>
      project({ ...input, source: await readSource(input.path.row, operations) }, signal);
    await expect(renderFrom([operation, operation])).rejects.toThrow('one current');
    const line = operation.topstitchLines![0]!;
    await expect(
      renderFrom([{ ...operation, topstitchLines: [{ ...line, stale: true }] }]),
    ).rejects.toThrow('one current');
    await expect(
      renderFrom([
        {
          ...operation,
          topstitch: { ...operation.topstitch!, mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE' },
        },
      ]),
    ).rejects.toThrow('one current');
    await expect(project({ ...input, source: { ...input.source } }, signal)).rejects.toThrow(
      'verified',
    );
    await expect(project({ ...input, sizeId: 4 }, signal)).rejects.toThrow('current card, size');
    await expect(
      project({ ...input, card: { ...input.card, lockVersion: 302 } }, signal),
    ).rejects.toThrow('current card, size');
    const card = structuredClone(input.card);
    card.techCard!.bomItems![0]!.unit = 'pcs';
    await expect(project({ ...input, card }, signal)).rejects.toThrow('linked current metre');
  });

  it('refuses stale fingerprint, duplicate native block owners, invalid offset and altered bytes', async () => {
    const { input, operation, anchor } = await fixture();
    const row = input.path.row;
    const line = operation.topstitchLines![0]!;
    const incorrect = await readSource(row, [
      {
        ...operation,
        topstitchLines: [{ ...line, parts: [{ ...anchor, contourSig: 'stale' }] }],
      },
    ]);
    await expect(project({ ...input, source: incorrect }, signal)).rejects.toThrow('fingerprint');
    const duplicate = await readSource(
      row,
      [operation],
      [...aliases, { scopeKey: 'main', blockName: 'front', pieceLineKey: 'another-piece' }],
    );
    await expect(project({ ...input, source: duplicate }, signal)).rejects.toThrow(
      'unique current',
    );
    const twoBlocks = await readSource(
      row,
      [operation],
      [...aliases, { scopeKey: 'main', blockName: 'OTHER', pieceLineKey }],
    );
    await expect(project({ ...input, source: twoBlocks }, signal)).rejects.toThrow(
      'unique current',
    );
    const outside = await readSource(row, [
      {
        ...operation,
        topstitch: { ...operation.topstitch!, widthMm: { value: '100' } },
      },
    ]);
    await expect(project({ ...input, source: outside }, signal)).rejects.toThrow('strictly inside');
    const changed = new TextEncoder().encode(
      new TextDecoder().decode(input.file).replace('Topstitch fixture', 'Topstitch changed'),
    );
    await expect(project({ ...input, file: changed }, signal)).rejects.toThrow('digest');
  });

  it('refuses a cut contour and an anchor crossing two original L14 segments', async () => {
    const { input, operation, cornerAnchor, cutPathId } = await fixture();
    await expect(
      project(
        {
          ...input,
          path: { ...input.path, nativePathId: cutPathId },
        },
        signal,
      ),
    ).rejects.toThrow('original L14 path');
    const source = await readSource(input.path.row, [
      {
        ...operation,
        topstitchLines: [
          {
            ...operation.topstitchLines![0]!,
            parts: [{ ...cornerAnchor, layer: undefined, placement: undefined }],
          },
        ],
      },
    ]);
    await expect(project({ ...input, source }, signal)).rejects.toThrow(
      'one original straight L14 segment',
    );
  });
});
