import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { innerAnchor } from 'components/managers/tech-card/components/step-seams/step-seams-model';
import { buildAssemblyPieces } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { grainRotation } from 'lib/pom/upright';
import { anchorOf } from 'lib/seams/anchor';
import { runsOfPiece } from 'lib/seams/frame';
import { readDxf, readDxfWithPathProvenanceV1 } from 'lib/pattern-import/adapters/dxf/extract';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { anchorToWire } from 'lib/seams/wire';
import {
  parseSavedNativeStitchRowV1,
  readSavedNativeStraightStitchPathsV1,
  resolveSavedLegacyNativeStitchRangeV1,
} from './saved-legacy-native-stitch-run-v8';
import {
  listSavedNativePointClosureMarksV1,
  resolveSavedNativePointClosureMarkV1,
  type SavedNativePointClosureMarkRequestV1,
} from './saved-native-point-closure-mark-v1';
import { resolveSavedNativeSurfaceStitchAnchorV1 as resolve } from './saved-native-surface-stitch-anchor-v1';

type Input = Parameters<typeof resolve>[0];
function savedAnchor(anchor: Parameters<typeof anchorToWire>[0]): Input['anchor'] {
  const wire = anchorToWire(anchor);
  return { ...wire, placement: wire.placement, layer: wire.layer };
}
function sha(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const signal = new AbortController().signal;
const pieceKey = 'test-pocket';
const sourceFileId = 'surface-range-fixture';
const blockName = 'POCKET_M';
const line = [
  [15, 20],
  [31, 20],
  [31, 32],
  [47, 32],
];
function polyline(layer: string, points: number[][], closed: boolean, firstBulge = 0) {
  return [
    0,
    'POLYLINE',
    8,
    layer,
    66,
    1,
    70,
    Number(closed),
    10,
    0,
    20,
    0,
    ...points.flatMap(([x, y], index) => [
      0,
      'VERTEX',
      8,
      layer,
      10,
      x,
      20,
      y,
      30,
      0,
      70,
      0,
      ...(index === 0 && firstBulge ? [42, firstBulge] : []),
    ]),
    0,
    'SEQEND',
    8,
    layer,
  ];
}
type ExtraDxf = { extraPaths?: (number | string)[]; copyAtX?: number };
function fixtureFile(
  innerPath: number[][],
  closed = false,
  rankLabels = false,
  { extraPaths = [], copyAtX }: ExtraDxf = {},
) {
  return new TextEncoder().encode(
    [
      0,
      'SECTION',
      2,
      'HEADER',
      9,
      '$ACADVER',
      1,
      'AC1009',
      9,
      '$INSUNITS',
      70,
      4,
      0,
      'ENDSEC',
      0,
      'SECTION',
      2,
      'BLOCKS',
      0,
      'BLOCK',
      8,
      0,
      2,
      blockName,
      70,
      0,
      10,
      0,
      20,
      0,
      ...polyline(
        '1',
        [
          [0, 0],
          [84, 0],
          [75, 62],
          [3, 55],
        ],
        true,
      ),
      ...polyline(
        '14',
        [
          [3, 3],
          [63, 3],
          [63, 43],
          [3, 43],
        ],
        true,
      ),
      ...polyline('8', innerPath, closed),
      ...extraPaths,
      ...(rankLabels
        ? ['PIECE NAME: POCKET', 'SIZE: M'].flatMap((label) => [
            0,
            'TEXT',
            8,
            0,
            10,
            5,
            20,
            5,
            40,
            1,
            1,
            label,
          ])
        : []),
      0,
      'ENDBLK',
      0,
      'ENDSEC',
      0,
      'SECTION',
      2,
      'ENTITIES',
      0,
      'INSERT',
      8,
      0,
      2,
      blockName,
      10,
      0,
      20,
      0,
      ...(copyAtX === undefined ? [] : [0, 'INSERT', 8, 0, 2, blockName, 10, copyAtX, 20, 0]),
      0,
      'ENDSEC',
      0,
      'EOF',
      '',
    ].join('\n'),
  );
}
async function fixture(reverse = false, innerPath = line) {
  const file = fixtureFile(innerPath);
  const fileName = blockName + '.dxf';
  const read = await readDxf(
    { id: sourceFileId, name: fileName, bytes: file.buffer },
    { sagittaMm: 0.1, keepFills: true },
  );
  const page = read.doc.pages[0]!;
  const raw14 = page.paths.find(
    (path) => page.styles.find((s) => s.id === path.style)?.layer === '14',
  )!;
  const row = { sha256: createHash('sha256').update(file).digest('hex') };
  const parent = {
    row,
    sourceFileId,
    blockName,
    pieceLineKey: pieceKey,
    nativePathId: raw14.id,
  } as Input['parent'];
  const exact = await readSavedNativeStraightStitchPathsV1(file, parent, [raw14.id], signal);
  const edges = exact.descriptors.toSorted(
    (a, b) => a.path.startPointIndex - b.path.startPointIndex,
  );
  const path = {
    ...parent,
    vertexIds: edges.map((e) => e.startVertexId),
    nativePointsMm: edges.map((e) => ({ x: e.startMm[0], y: e.startMm[1] })),
  };
  const block = (await parseSavedNativeStitchRowV1(file, fileName)).pieces
    .filter((p) => p.blockName === blockName)
    .map((p) =>
      reverse
        ? {
            ...p,
            inner: p.inner?.map((entry) =>
              entry.layer === '8' ? { ...entry, pts: entry.pts.toReversed() } : entry,
            ),
          }
        : p,
    );
  const card = {
    techCard: {
      pieces: [{ lineKey: pieceKey, name: 'Pocket', piecesPerGarment: 1, materials: [] }],
      bomItems: [],
    },
  } as unknown as Input['card'];
  const owner = {
    piece: block.find((v) => v.layer === '1')!,
    block: blockName,
    size: 'M',
    instances: 1,
    layer: '1',
    grainLayer: '7',
    sizes: ['M'],
    layers: block,
  };
  const drawing = buildAssemblyPieces(card, new Map([[pieceKey, owner]]), '7');
  const part = drawing.pieces.get(pieceKey)!;
  const anchor = innerAnchor(part.geom, 0, part.inner[0]!, drawing.grainDeg.get(pieceKey)!)!;
  const nativeSource = { sourceFileId, nativeRead: { read } } as Input['nativeSource'];
  return {
    card,
    sizeToken: 'M',
    grainLayer: '7',
    file,
    block,
    rawBlock: blockName,
    nativeSource,
    parent: path,
    anchor: savedAnchor(anchor),
    index: 0,
  };
}

async function pointMark(innerPath: number[][], closed = false, extra?: ExtraDxf) {
  const file = fixtureFile(innerPath, closed, true, extra);
  const row = {
    techCardId: 1,
    scopeKey: 'main',
    patternLineKey: 'test-pattern',
    revision: 2,
    cardLockVersion: 3,
    url: '/fixture.dxf',
    sizeBytes: file.byteLength,
    sha256: createHash('sha256').update(file).digest('hex'),
  };
  const id = computeDxfProductSavedSourceFileIdV1(row);
  const read = await readDxfWithPathProvenanceV1(
    { id, name: 'fixture.dxf', bytes: file.buffer },
    { sagittaMm: 0.1, keepFills: true },
    { sourceFileId: id },
  );
  if (!read.ok) throw Error('Unable to read fixture DXF');
  const { paths, styles } = read.value.read.doc.pages[0]!;
  const path = paths.find(({ style }) => styles.find(({ id }) => id === style)?.layer === '8')!;
  const provenance = read.value.provenance.paths.find(({ pathId }) => pathId === path.id)!;
  return {
    source: {
      row,
      bytes: file.buffer,
      aliases: [{ scopeKey: row.scopeKey, blockName: 'POCKET', pieceLineKey: pieceKey }],
      size: { sizeId: 58, sizeToken: 'M' },
    },
    request: {
      pieceLineKey: pieceKey,
      patternLineKey: row.patternLineKey,
      dxfSha256: row.sha256,
      sizeId: 58,
      aliasBlockName: 'POCKET',
      nativeBlockName: blockName,
      sourceInstancePath: provenance.provenance.instancePath,
      sourceEntityOp: path.src.op,
      role: closed ? 'BUTTON_MARK_CENTER' : 'BUTTONHOLE_MIDPOINT',
    } satisfies SavedNativePointClosureMarkRequestV1,
    nativePathId: path.id,
  };
}

describe('saved native point closure marks', () => {
  it.each([false, true])('resolves one exact original L8 mark (closed %s)', async (closed) => {
    const { source, request, nativePathId } = await pointMark(
      line.slice(0, 2).concat(
        closed
          ? [
              [31, 32],
              [15, 32],
            ]
          : [],
      ),
      closed,
    );
    expect(await resolveSavedNativePointClosureMarkV1(source, request)).toEqual({
      ...request,
      sourceFileId: computeDxfProductSavedSourceFileIdV1(source.row),
      nativePathId,
      pointMm: [23, closed ? 26 : 20],
      ...(!closed && { markedSegmentMm: line.slice(0, 2) }),
    });
  });

  it('refuses an open chain, an ambiguous alias and a stale SHA', async () => {
    const { source, request } = await pointMark(line);
    const resolve = resolveSavedNativePointClosureMarkV1;
    await expect(resolve(source, request)).rejects.toThrow('single open segment');
    await expect(
      resolve({ ...source, aliases: [...source.aliases, ...source.aliases] }, request),
    ).rejects.toThrow('unique matching piece alias');
    await expect(resolve(source, { ...request, dxfSha256: '0'.repeat(64) })).rejects.toThrow(
      'selected row or its bytes changed',
    );
  });

  it('lists exact marks in entity order, filtering by role and native L8 scope', async () => {
    const { source, request } = await pointMark(line.slice(0, 2), false, {
      extraPaths: [
        ...polyline(
          '8',
          [
            [8, 16],
            [12, 16],
          ],
          false,
        ),
        ...polyline(
          '8',
          [
            [40, 25],
            [50, 25],
            [50, 35],
            [40, 35],
          ],
          true,
        ),
        ...polyline(
          '9',
          [
            [16, 44],
            [18, 44],
          ],
          false,
        ),
      ],
    });
    const list = listSavedNativePointClosureMarksV1;
    const slit = await list(source, request);
    expect(slit.map(({ pointMm }) => pointMm)).toEqual([
      [23, 20],
      [10, 16],
    ]);
    for (const mark of slit)
      expect(await resolveSavedNativePointClosureMarkV1(source, mark)).toEqual(mark);
    const closed = await list(source, { ...request, role: 'BUTTON_MARK_CENTER' });
    expect(closed.map(({ pointMm }) => pointMm)).toEqual([[45, 30]]);
    expect(await resolveSavedNativePointClosureMarkV1(source, closed[0]!)).toEqual(closed[0]);
  });

  it('keeps exact options when a different closed candidate has a native bulge', async () => {
    const { source, request } = await pointMark(
      [
        [15, 20],
        [31, 20],
        [31, 32],
        [15, 32],
      ],
      true,
      {
        extraPaths: polyline(
          '8',
          [
            [40, 25],
            [50, 25],
            [50, 35],
            [40, 35],
          ],
          true,
          0.4,
        ),
      },
    );
    expect(
      (await listSavedNativePointClosureMarksV1(source, request)).map(({ pointMm }) => pointMm),
    ).toEqual([[23, 26]]);
  });

  it('refuses to choose a repeated block occurrence or stale bytes', async () => {
    const { source, request } = await pointMark(line.slice(0, 2), false, { copyAtX: 130 });
    const list = listSavedNativePointClosureMarksV1;
    await expect(list(source, request)).rejects.toThrow('one original occurrence');
    const bytes = source.bytes.slice(0);
    const rankOffset = new TextDecoder().decode(bytes).indexOf('SIZE: M') + 'SIZE: '.length;
    new Uint8Array(bytes)[rankOffset] = 'L'.charCodeAt(0);
    await expect(list({ ...source, bytes }, request)).rejects.toThrow('DXF hash differs');
  });
});

describe('saved native open L8 arclength', () => {
  it.each([false, true])(
    'recovers a sliced original straight chain (ordinary traversal reversed %s)',
    async (reverse) => {
      const input = await fixture(reverse);
      const whole = await resolve(input, signal);
      // Exact serialized whole-path result from 4378bfc2, before fractional L8 support.
      expect(sha(whole)).toBe(
        reverse
          ? 'fbfe13b4418b16d86e4d254ecd01e8725d2805fd76aa16e028b0f0fa70fc98dc'
          : '91bd6846b70302abc85304d13cab0d24631edf689fe7e80fe1db315118efe0a6',
      );
      expect(whole.reverse).toBe(reverse);
      expect(whole.lengthMm).toBe(44);
      expect(whole.nativePointsMm).toHaveLength(4);
      expect(whole.intervals).toHaveLength(3);
      expect(whole).not.toHaveProperty('fraction');
      const a = {
        ...input.anchor,
        rangeFrom: 6 / 44,
        rangeTo: 36 / 44,
        layer: 'TECH_CARD_SEAM_LAYER_UNDER' as const,
      };
      const span = await resolve({ ...input, anchor: a }, signal);
      expect(span.lengthMm).toBeCloseTo(30, 12);
      expect(span.intervals.map((x) => x.nativeCurveId)).toEqual(
        whole.intervals.map((x) => x.nativeCurveId),
      );
      expect(span.orderedNativeVertexIds).toEqual(whole.orderedNativeVertexIds.slice(1, 3));
      expect(span.intervals[1]).toEqual(whole.intervals[1]);
      const [x0, y0] = whole.firstMm,
        [x1, y1] = whole.nativePointsMm[1]!;
      expect(span.firstMm).toEqual([x0 + ((x1 - x0) * 6) / 16, y0 + ((y1 - y0) * 6) / 16]);
      expect(span.intervals[0]!.t0).toBe(whole.reverse ? 1 - 6 / 16 : 6 / 16);
      expect(span.intervals[2]!.t1).toBe(0.5);
      expect(span.nativePointsMm).toEqual([
        span.firstMm,
        ...whole.nativePointsMm.slice(1, 3),
        span.lastMm,
      ]);
      const within = await resolve(
        { ...input, anchor: { ...a, rangeFrom: 1 / 44, rangeTo: 2 / 44 } },
        signal,
      );
      expect(within.intervals).toHaveLength(1);
      expect(within.orderedNativeVertexIds).toEqual([]);
      const vertexToVertex = await resolve(
        { ...input, anchor: { ...a, rangeFrom: 16 / 44, rangeTo: 28 / 44 } },
        signal,
      );
      expect(vertexToVertex.intervals).toEqual([whole.intervals[1]]);
      expect(vertexToVertex.orderedNativeVertexIds).toEqual(
        whole.orderedNativeVertexIds.slice(1, 3),
      );
    },
  );
  it('refuses a legacy drawing whose simplification moves the saved arclength endpoint', async () => {
    const input = await fixture(false, [line[0]!, [23, 20.25], ...line.slice(1)]);
    const whole = await resolve(input, signal);
    expect(whole.rawNativePoints).toBeGreaterThan(whole.ordinaryDrawingPoints);
    await expect(
      resolve({ ...input, anchor: { ...input.anchor, rangeFrom: 8 / 44, rangeTo: 0.9 } }, signal),
    ).rejects.toThrow('does not reproduce the native arclength');
  });
  it('retains the complete serialized L14 results for both whole and sliced runs', async () => {
    const input = await fixture();
    const cut = input.block.find((entry) => entry.layer === '1')!;
    const sewing = input.block.find((entry) => entry.layer === '14')!;
    const geom = segmentPiece({
      pieceKey,
      name: blockName,
      piece: sewing,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    });
    const run = runsOfPiece(geom)[0]!;
    const anchor = savedAnchor(anchorOf(geom, run, grainRotation(cut)));
    const exact = await readSavedNativeStraightStitchPathsV1(
      input.file,
      input.parent,
      [input.parent.nativePathId],
      signal,
    );
    const hashes = [
      [0, 1],
      [0.2, 0.85],
    ].map(([rangeFrom, rangeTo]) => {
      const result = resolveSavedLegacyNativeStitchRangeV1(
        input.block,
        input.parent,
        { ...anchor, rangeFrom, rangeTo },
        exact.descriptors,
      );
      return sha(result);
    });
    // The unmodified L14 reader at 4378bfc2 produced these complete wire results.
    expect(hashes).toEqual([
      '626a01c4d326a8f8a6d54255b2fcdd250dac0fcf4a69b4984f8a4aaf0c515024',
      'c3e00bb6ae6b87018f526f4703d4bc449e5f84303963708dedbaae29b6f2f5ff',
    ]);
  });
  it('rejects a changed source SHA or two matching raw paths for a fractional anchor', async () => {
    const input = await fixture();
    const anchor = { ...input.anchor, rangeFrom: 0.2, rangeTo: 0.6 };
    const parent = { ...input.parent, row: { ...input.parent.row, sha256: 'a'.repeat(64) } };
    await expect(resolve({ ...input, parent, anchor }, signal)).rejects.toThrow();
    const read = input.nativeSource.nativeRead.read;
    const pages = read.doc.pages.map((page) => {
      const l8 = page.paths.find(
        (path) => page.styles.find((style) => style.id === path.style)?.layer === '8',
      )!;
      return { ...page, paths: [...page.paths, { ...l8, id: l8.id + 1000 }] };
    });
    const nativeSource = {
      ...input.nativeSource,
      nativeRead: {
        ...input.nativeSource.nativeRead,
        read: { ...read, doc: { ...read.doc, pages } },
      },
    };
    await expect(resolve({ ...input, nativeSource, anchor }, signal)).rejects.toThrow(
      'one exact original L8 path',
    );
  });
  it('refuses invalid windows, transformed anchors and a different fingerprint', async () => {
    const input = await fixture();
    for (const [rangeFrom, rangeTo] of [
      [0, 2],
      [-0.01, 0],
      [0.5, 0.5],
      [0.6, 0.4],
      [NaN, 1],
    ]) {
      await expect(
        resolve({ ...input, anchor: { ...input.anchor, rangeFrom, rangeTo } }, signal),
      ).rejects.toThrow('bounded line range');
    }
    await expect(
      resolve(
        {
          ...input,
          anchor: { ...input.anchor, placement: { xMm: 0, yMm: 0, rotDeg: 0, flip: false } },
        },
        signal,
      ),
    ).rejects.toThrow('untransformed');
    await expect(
      resolve(
        {
          ...input,
          anchor: { ...input.anchor, rangeFrom: 0.1, rangeTo: 0.9, contourSig: 'other' },
        },
        signal,
      ),
    ).rejects.toThrow('fingerprint');
  });
});
