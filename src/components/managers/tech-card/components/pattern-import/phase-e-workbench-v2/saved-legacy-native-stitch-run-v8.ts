import { seamLoopOf, seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { NEST_DEFAULTS, type PieceDTO } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1,
  type DxfSourceNativeStraightEdgeDescriptorV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { DxfProductSavedNativeCompilerSourceProjectionV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { grainRotation } from 'lib/pom/upright';
import { anchorOf } from 'lib/seams/anchor';
import { runById } from 'lib/seams/frame';
import { anchorFromWire, anchorToWire } from 'lib/seams/wire';
import type { TechCardSeamAnchor } from 'api/proto-http/common';
import type { CompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';

export type SavedNativeStitchCompilerSourceV1 = DxfProductSavedNativeCompilerSourceProjectionV1;
type CardProjection = Parameters<typeof createSavedFullAssemblyCompleteDxfHostsV1>[1];
type PointMm = readonly [number, number];

export type SavedNativeCurveIntervalV1 = Readonly<{
  nativeCurveId: string;
  t0: number;
  t1: number;
  startMm: PointMm;
  endMm: PointMm;
}>;

// The legacy assembler expresses complete DXF rings in a rounded local frame. This allowance
// compares every point under one shared translation. It cannot relocate a stored endpoint.
export const savedLegacyDxfRoundingMmV1 = 0.002;
const maxRingVertices = 256;

export function bindSavedLegacyRingV1(
  legacy: readonly PointMm[],
  native: Pick<SavedAssemblyNativeSewingPathV1, 'nativePointsMm' | 'vertexIds'>,
) {
  const points = native.nativePointsMm;
  const count = points.length;
  if (
    count < 3 ||
    count > maxRingVertices ||
    count !== legacy.length ||
    count !== native.vertexIds.length
  )
    throw new Error('The legacy sewing outline has no complete native vertex correspondence.');
  let match: { offset: number; direction: number; shift: PointMm } | null = null;
  for (let offset = 0; offset < count; offset++) {
    for (const direction of [1, -1]) {
      const shiftX = points[offset]!.x - legacy[0]![0];
      const shiftY = points[offset]!.y - legacy[0]![1];
      const sameRing = legacy.every(([x, y], index) => {
        const point = points[(offset + count + index * direction) % count]!;
        return (
          Math.hypot(point.x - (x + shiftX), point.y - (y + shiftY)) <= savedLegacyDxfRoundingMmV1
        );
      });
      if (!sameRing) continue;
      if (match)
        throw new Error('More than one complete native sewing outline matches the legacy run.');
      match = { offset, direction, shift: [shiftX, shiftY] };
    }
  }
  if (!match) throw new Error('The whole legacy sewing outline differs from the native DXF path.');
  const { offset, direction, shift } = match;
  return {
    shift,
    vertexIds: legacy.map(
      (_, index) => native.vertexIds[(offset + count + direction * index) % count]!,
    ),
  };
}

function exactVertex(points: readonly PointMm[], [x, y]: PointMm): number {
  const index = points.findIndex((point) => point[0] === x && point[1] === y);
  if (index < 0 || points.findLastIndex((point) => point[0] === x && point[1] === y) !== index)
    throw new Error('The saved run endpoint does not identify one exact original DXF vertex.');
  return index;
}

export function savedNativeStitchRawBlockV1(
  nativeSource: SavedNativeStitchCompilerSourceV1,
  path: SavedAssemblyNativeSewingPathV1,
) {
  const paths = nativeSource.nativeRead.read.doc.pages.flatMap(({ paths }) =>
    paths.filter(({ id }) => id === path.nativePathId),
  );
  const rawBlock = paths[0]?.src.block;
  if (paths.length !== 1 || !rawBlock || nativeSource.sourceFileId !== path.sourceFileId)
    throw new Error('The current native sewing path has no exact original DXF block.');
  return rawBlock;
}

export function parseSavedNativeStitchRowV1(file: Uint8Array<ArrayBuffer>, name: string) {
  return parseSheets([{ name, open: async () => file.buffer }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
}

export async function readSavedNativeStraightStitchPathsV1(
  file: Uint8Array<ArrayBuffer>,
  path: SavedAssemblyNativeSewingPathV1,
  sourcePathIds: readonly number[],
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const request = {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId: path.sourceFileId,
    sourceSha256: path.row.sha256,
    sourcePathIds,
  } as const;
  const read = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
    { id: path.sourceFileId, name: `${path.blockName}.dxf`, bytes: file.buffer },
    { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
    request,
  );
  signal.throwIfAborted();
  if (!read.ok)
    throw new Error(read.blockers[0]?.detail ?? 'The saved stitch source is unavailable.');
  const exact = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(read.value.owner, request);
  signal.throwIfAborted();
  if (!exact.ok || !exact.projection.complete)
    throw new Error('The saved stitch requires complete original straight-edge occurrences.');
  return exact.projection;
}

function captureSavedLegacyNativeStitchRun(
  block: readonly PieceDTO[],
  path: SavedAssemblyNativeSewingPathV1,
  savedAnchor: TechCardSeamAnchor,
) {
  const original = anchorFromWire(savedAnchor);
  if (
    original.piece !== path.pieceLineKey ||
    original.placement ||
    !original.range.every(Number.isFinite) ||
    original.range[0] < 0 ||
    original.range[1] > 1 ||
    original.range[0] >= original.range[1]
  )
    throw new Error('The selected portion must belong to a valid untransformed stored run.');

  const [cut] = block.filter(({ layer }) => layer === '1');
  const sewing = seamPieceOf(block);
  if (
    !cut ||
    !sewing ||
    block.filter(({ layer }) => layer === '1').length !== 1 ||
    block.filter(({ layer }) => layer === '14').length !== 1
  )
    throw new Error('The saved block must contain one cut outline and one legacy sewing outline.');
  const outline = seamLoopOf(sewing);
  if (outline.layer !== '14')
    throw new Error('The ordinary saved sewing outline is on a different DXF layer.');
  const piece = segmentPiece({
    pieceKey: path.pieceLineKey,
    name: path.blockName,
    piece: sewing,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  const run = runById(piece, original.edgeHint);
  if (
    !run ||
    canonical(
      anchorToWire({
        ...anchorOf(piece, run, grainRotation(cut)),
        layer: original.layer,
        range: original.range,
      }),
    ) !== canonical(anchorToWire(original))
  )
    throw new Error('The stored Assembly Order run fingerprint differs from the current DXF.');
  const { vertexIds: nativeVertices } = bindSavedLegacyRingV1(outline.pts, path);
  const first = exactVertex(outline.pts, run.pts[0]!);
  const last = exactVertex(outline.pts, run.pts.at(-1)!);
  const count = nativeVertices.length;
  const length = ((last - first + count) % count) + 1;
  if (length < 2 || length >= count)
    throw new Error('The stored run does not identify one bounded native interval.');
  const ids = Array.from({ length }, (_, i) => nativeVertices[(first + i) % count]!);
  // Re-sampled legacy lengths are rounded in the wire. Confirm the complete selected arc
  // without relaxing the exact start/end vertex checks above.
  const lengthMm = Array.from({ length: length - 1 }, (_, i) => {
    const start = outline.pts[(first + i) % count]!;
    const end = outline.pts[(first + i + 1) % count]!;
    return Math.hypot(end[0] - start[0], end[1] - start[1]);
  }).reduce((sum, value) => sum + value, 0);
  if (Math.round(lengthMm * 10) / 10 !== original.lenMm)
    throw new Error('The exact native interval does not reproduce the stored run length.');
  return { ids, range: original.range };
}

/** Recovers only a recorded whole legacy run whose saved fingerprint and full L14 ring reverify. */
export async function resolveSavedLegacyNativeStitchRunV8(
  source: CompleteSavedAssemblySourceV1,
  projection: CardProjection,
  nativeSource: SavedNativeStitchCompilerSourceV1,
  path: SavedAssemblyNativeSewingPathV1,
  anchor: TechCardSeamAnchor,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const original = anchorFromWire(anchor);
  if (
    original.piece !== path.pieceLineKey ||
    original.placement ||
    original.range[0] !== 0 ||
    original.range[1] !== 1
  )
    throw new Error('The legacy review requires a whole untransformed stored run.');
  const rawBlock = savedNativeStitchRawBlockV1(nativeSource, path);
  const host = createSavedFullAssemblyCompleteDxfHostsV1(source, projection).createCanonical();
  let bytes: Uint8Array | undefined;
  let file: Uint8Array<ArrayBuffer> | undefined;
  try {
    ({ bytes } = await host.readAuthoritativeRow(path.row, signal, () => {}));
    file = new Uint8Array(bytes);
    const parsed = await parseSavedNativeStitchRowV1(file, `${path.blockName}.dxf`);
    signal.throwIfAborted();
    return captureSavedLegacyNativeStitchRun(
      parsed.pieces.filter(({ blockName }) => blockName === rawBlock),
      path,
      anchor,
    ).ids;
  } finally {
    file?.fill(0);
    bytes?.fill(0);
    host.dispose();
  }
}

/** Reconstructs the stored range on checked original directed edge occurrences. */
export function resolveSavedLegacyNativeStitchRangeV1(
  block: readonly PieceDTO[],
  path: SavedAssemblyNativeSewingPathV1,
  anchor: TechCardSeamAnchor,
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[],
) {
  const exact = descriptors.toSorted(
    (left, right) => left.path.startPointIndex - right.path.startPointIndex,
  );
  if (
    exact.length !== path.vertexIds.length ||
    exact.some(
      (edge, index) =>
        edge.path.sourcePathId !== path.nativePathId ||
        !edge.path.closed ||
        edge.startVertexId !== path.vertexIds[index] ||
        edge.endVertexId !== path.vertexIds[(index + 1) % exact.length] ||
        edge.startMm[0] !== path.nativePointsMm[index]!.x ||
        edge.startMm[1] !== path.nativePointsMm[index]!.y ||
        edge.endMm[0] !== path.nativePointsMm[(index + 1) % exact.length]!.x ||
        edge.endMm[1] !== path.nativePointsMm[(index + 1) % exact.length]!.y,
    )
  )
    throw new Error('The exact directed L14 ring differs from the saved run source.');
  const { ids, range } = captureSavedLegacyNativeStitchRun(block, path, anchor);
  const points = new Map(path.vertexIds.map((vertex, i) => [vertex, path.nativePointsMm[i]!]));
  const originalEdge = (from: string, to: string) => {
    const index = path.vertexIds.indexOf(from);
    const length = path.vertexIds.length;
    if (
      index < 0 ||
      (to !== path.vertexIds[(index + 1) % length] &&
        to !== path.vertexIds[(index + length - 1) % length])
    )
      throw new Error('A stored partial run has a foreign native edge occurrence.');
    const a = points.get(from)!;
    const b = points.get(to)!;
    const reverse = to === path.vertexIds[(index + length - 1) % length];
    const edge = exact[reverse ? (index + length - 1) % length : index]!;
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(lengthMm > 0 && Number.isFinite(lengthMm)))
      throw new Error('A stored partial run has a degenerate original edge.');
    return { from, to, a, b, lengthMm, nativeCurveId: edge.native.sourceCurveId, reverse };
  };
  const edges = ids.slice(1).map((to, i) => originalEdge(ids[i]!, to));
  return Object.freeze({
    sourceFileId: path.sourceFileId,
    nativePathId: path.nativePathId,
    fullRunVertexIds: Object.freeze(ids),
    ...clipSavedNativeStraightWalkV1(edges, range),
  });
}

/** Clip a verified, directed walk along the cumulative lengths of its original straight edges. */
export function clipSavedNativeStraightWalkV1(
  edges: readonly Readonly<{
    from: string;
    to: string;
    a: Readonly<{ x: number; y: number }>;
    b: Readonly<{ x: number; y: number }>;
    lengthMm: number;
    nativeCurveId: string;
    reverse: boolean;
  }>[],
  range: readonly [number, number],
) {
  let totalMm = 0;
  const walk = edges.map((edge) => {
    const startMm = totalMm;
    totalMm += edge.lengthMm;
    return { ...edge, startMm, endMm: totalMm };
  });
  const at = (fraction: number) => {
    const alongMm = fraction * totalMm;
    const interval = fraction === 1 ? walk.at(-1) : walk.find(({ endMm }) => endMm >= alongMm);
    if (!interval) throw new Error('The stored fraction lies outside its original run.');
    const { from, to, a, b, startMm, lengthMm } = interval;
    const edgeProgress =
      fraction === 0 || fraction === 1
        ? fraction
        : Math.max(0, Math.min(1, (alongMm - startMm) / lengthMm));
    return Object.freeze({
      from,
      to,
      edgeProgress,
      positionMm: Object.freeze([
        a.x + (b.x - a.x) * edgeProgress,
        a.y + (b.y - a.y) * edgeProgress,
      ] as const),
    });
  };
  const startMm = range[0] * totalMm;
  const endMm = range[1] * totalMm;
  const intervals: SavedNativeCurveIntervalV1[] = [];
  for (const edge of walk) {
    const from = Math.max(startMm, edge.startMm);
    const to = Math.min(endMm, edge.endMm);
    if (from >= to) continue;
    const progress = (position: number) => {
      if (position === edge.startMm) return 0;
      if (position === edge.endMm) return 1;
      return (position - edge.startMm) / edge.lengthMm;
    };
    const position = (p: number) =>
      Object.freeze([
        p === 1 ? edge.b.x : edge.a.x + (edge.b.x - edge.a.x) * p,
        p === 1 ? edge.b.y : edge.a.y + (edge.b.y - edge.a.y) * p,
      ] as const);
    const p0 = progress(from);
    const p1 = progress(to);
    const t0 = edge.reverse ? 1 - p0 : p0;
    const t1 = edge.reverse ? 1 - p1 : p1;
    if (t0 === t1)
      throw new Error('The saved range rounded to a zero-length native curve interval.');
    intervals.push(
      Object.freeze({
        nativeCurveId: edge.nativeCurveId,
        t0,
        t1,
        startMm: position(p0),
        endMm: position(p1),
      }),
    );
  }
  if (!intervals.length) throw new Error('The saved range has no exact native curve intervals.');
  return Object.freeze({
    fraction: Object.freeze([...range] as const),
    start: at(range[0]),
    end: at(range[1]),
    nativeLengthMm: (range[1] - range[0]) * totalMm,
    intervals: Object.freeze(intervals),
  });
}
