import { seamLoopOf, seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
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

type NativeSource = DxfProductSavedNativeCompilerSourceProjectionV1;
type CardProjection = Parameters<typeof createSavedFullAssemblyCompleteDxfHostsV1>[1];
type PointMm = readonly [number, number];

// The legacy assembler expresses complete DXF rings in a rounded local frame. This allowance
// compares every point under one shared translation. It cannot relocate a stored endpoint.
const legacyRingRoundingMm = 0.002;
const maxRingVertices = 256;

function bindLegacyRing(legacy: readonly PointMm[], native: SavedAssemblyNativeSewingPathV1) {
  const points = native.nativePointsMm;
  const count = points.length;
  if (
    count < 3 ||
    count > maxRingVertices ||
    count !== legacy.length ||
    count !== native.vertexIds.length
  )
    throw new Error('The legacy sewing outline has no complete native vertex correspondence.');
  let match: { offset: number; direction: number } | null = null;
  for (let offset = 0; offset < count; offset++) {
    for (const direction of [1, -1]) {
      const shiftX = points[offset]!.x - legacy[0]![0];
      const shiftY = points[offset]!.y - legacy[0]![1];
      const sameRing = legacy.every(([x, y], index) => {
        const point = points[(offset + count + index * direction) % count]!;
        return Math.hypot(point.x - (x + shiftX), point.y - (y + shiftY)) <= legacyRingRoundingMm;
      });
      if (!sameRing) continue;
      if (match)
        throw new Error('More than one complete native sewing outline matches the legacy run.');
      match = { offset, direction };
    }
  }
  if (!match) throw new Error('The whole legacy sewing outline differs from the native DXF path.');
  const { offset, direction } = match;
  return legacy.map((_, index) => native.vertexIds[(offset + count + direction * index) % count]!);
}

function exactVertex(points: readonly PointMm[], [x, y]: PointMm): number {
  const index = points.findIndex((point) => point[0] === x && point[1] === y);
  if (index < 0 || points.findLastIndex((point) => point[0] === x && point[1] === y) !== index)
    throw new Error('The saved run endpoint does not identify one exact original DXF vertex.');
  return index;
}

/** Recovers only a recorded whole legacy run whose saved fingerprint and full L14 ring reverify. */
export async function resolveSavedLegacyNativeStitchRunV8(
  source: CompleteSavedAssemblySourceV1,
  cardProjection: CardProjection,
  nativeSource: NativeSource,
  path: SavedAssemblyNativeSewingPathV1,
  savedAnchor: TechCardSeamAnchor,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const paths = nativeSource.nativeRead.read.doc.pages.flatMap(({ paths }) =>
    paths.filter(({ id }) => id === path.nativePathId),
  );
  const rawBlock = paths[0]?.src.block;
  if (paths.length !== 1 || !rawBlock || nativeSource.sourceFileId !== path.sourceFileId)
    throw new Error('The current native sewing path has no exact original DXF block.');
  const original = anchorFromWire(savedAnchor);
  if (
    original.piece !== path.pieceLineKey ||
    original.range[0] !== 0 ||
    original.range[1] !== 1 ||
    original.placement
  )
    throw new Error('The legacy review requires a whole untransformed stored run.');

  const host = createSavedFullAssemblyCompleteDxfHostsV1(source, cardProjection).createCanonical();
  let bytes: Uint8Array | undefined;
  try {
    ({ bytes } = await host.readAuthoritativeRow(path.row, signal, () => {}));
    const file = new Uint8Array(bytes);
    const parsed = await parseSheets(
      [{ name: `${path.blockName}.dxf`, open: async () => file.buffer }],
      { unit: 'auto', tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain },
    );
    signal.throwIfAborted();
    const block = parsed.pieces.filter(({ blockName }) => blockName === rawBlock);
    const [cut] = block.filter(({ layer }) => layer === '1');
    const sewing = seamPieceOf(block);
    if (
      !cut ||
      !sewing ||
      block.filter(({ layer }) => layer === '1').length !== 1 ||
      block.filter(({ layer }) => layer === '14').length !== 1
    )
      throw new Error(
        'The saved block must contain one cut outline and one legacy sewing outline.',
      );
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
        anchorToWire({ ...anchorOf(piece, run, grainRotation(cut)), layer: original.layer }),
      ) !== canonical(anchorToWire(original))
    )
      throw new Error('The stored Assembly Order run fingerprint differs from the current DXF.');
    const nativeVertices = bindLegacyRing(outline.pts, path);
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
    return ids;
  } finally {
    bytes?.fill(0);
    host.dispose();
  }
}
