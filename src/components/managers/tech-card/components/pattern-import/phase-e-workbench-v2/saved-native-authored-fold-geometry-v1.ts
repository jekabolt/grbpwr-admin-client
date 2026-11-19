import { buildAssemblyPiecesFromInput } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { seamLoopOf, seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, fromUV } from 'lib/folds/geom';
import { resolveFolds } from 'lib/folds/resolve';
import { foldFromWire } from 'lib/folds/wire';
import type { PieceDTO } from 'lib/nesting/types';
import { grainRotation } from 'lib/pom/upright';
import type { SavedAssemblyAuthoredFoldsV1 } from './saved-assembly-complete-source-rpc-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  bindSavedLegacyRingV1,
  readSavedNativeStraightStitchPathsV1,
  savedLegacyDxfRoundingMmV1,
  type SavedNativeStitchCompilerSourceV1,
} from './saved-legacy-native-stitch-run-v8';

type AuthoredFold = SavedAssemblyAuthoredFoldsV1['folds'][number];

/** Resolve the authoritative fold in the local sewing frame, then restore its saved DXF placement. */
export async function resolveSavedNativeAuthoredFoldGeometryV1(
  input: Readonly<{
    authored: AuthoredFold;
    path: SavedAssemblyNativeSewingPathV1;
    block: readonly PieceDTO[];
    rawBlock: string;
    grainLayer: string;
    native: SavedNativeStitchCompilerSourceV1;
    file: Uint8Array<ArrayBuffer>;
  }>,
  signal: AbortSignal,
) {
  const { authored, path, block, rawBlock, grainLayer, native, file } = input;
  const fold = foldFromWire(authored.fold);
  const sewing = seamPieceOf(block);
  const cuts = block.filter(({ layer }) => layer === '1');
  if (
    !fold ||
    fold.pieceKey !== path.pieceLineKey ||
    !sewing ||
    cuts.length !== 1 ||
    block.filter(({ layer }) => layer === '14').length !== 1
  )
    throw new Error('A saved fold needs one exact original cut and sewing outline.');
  const loop = seamLoopOf(sewing);
  if (loop.layer !== '14') throw new Error('The saved fold has no ordinary L14 sewing frame.');
  const {
    shift: [shiftX, shiftY],
  } = bindSavedLegacyRingV1(loop.pts, path);
  const piece = segmentPiece({
    pieceKey: path.pieceLineKey,
    name: path.blockName,
    piece: sewing,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  const rotation = grainRotation(cuts[0]);
  const grainDeg = new Map([[piece.pieceKey, rotation]]);
  const layOut = (innerLines: readonly Pt2[][] = []) => {
    const resolved = resolveFolds([fold], [piece], {
      grainDeg,
      innerLines: new Map([[piece.pieceKey, innerLines]]),
    });
    const [geometry] = resolved.folds[piece.pieceKey] ?? [];
    const via = resolved.via[fold.foldKey];
    return geometry ? { geometry, via } : undefined;
  };

  let resolved;
  let nativeFoldPathIds: readonly number[] | undefined;
  const frame = frameOf(piece, rotation);
  const absolute = (uv: Pt2) => {
    const [x, y] = fromUV(frame, uv);
    return Object.freeze([x + shiftX, y + shiftY] as const);
  };
  if (fold.source === 'dxf' && !fold.edge) {
    const candidates = [];
    for (const { paths, styles } of native.nativeRead.read.doc.pages) {
      const nativeStyleIds = new Set(
        styles.filter(({ layer }) => layer === '8').map(({ id }) => id),
      );
      for (const mark of paths) {
        signal.throwIfAborted();
        if (
          mark.src.block !== rawBlock ||
          mark.closed ||
          !nativeStyleIds.has(mark.style) ||
          mark.pts.length < 2
        )
          continue;
        const line = mark.pts.map(({ x, y }): Pt2 => [x - shiftX, y - shiftY]);
        const match = layOut([line]);
        if (match?.via === 'inner') candidates.push({ mark, match });
      }
    }
    const assembly = buildAssemblyPiecesFromInput(
      { pieces: [{ lineKey: piece.pieceKey, name: path.blockName, materials: [] }], bomItems: [] },
      new Map([
        [
          piece.pieceKey,
          {
            piece: cuts[0],
            layers: [...block],
            block: path.blockName,
            size: path.sizeToken,
            instances: 1,
            layer: '1',
            sizes: [path.sizeToken],
          },
        ],
      ]),
      grainLayer,
    );
    const drawing = assembly.pieces.get(piece.pieceKey);
    const ordinary = layOut(drawing?.inner.map((line) => line.map(([x, y]): Pt2 => [x, -y])));
    if (!candidates.length || ordinary?.via !== 'inner')
      throw new Error('The saved drawn fold has no matching original L8 path in this size.');
    const { a, b, flipAt } = ordinary.geometry;
    const reference = [a, b, flipAt].map(absolute);
    const distinct = candidates.some(({ match: { geometry } }) =>
      [geometry.a, geometry.b, geometry.flipAt]
        .map(absolute)
        .some(
          ([x, y], index) =>
            Math.hypot(x - reference[index][0], y - reference[index][1]) >
            savedLegacyDxfRoundingMmV1,
        ),
    );
    if (distinct)
      throw new Error('The saved drawn fold matches more than one distinct original L8 line.');

    // Corroborate the ordinary resolved line against all distinct raw drawing occurrences.
    // Coincident strokes can share one drafting meaning while retaining each original ID.
    nativeFoldPathIds = Object.freeze(candidates.map(({ mark }) => mark.id).sort((a, b) => a - b));
    const exact = await readSavedNativeStraightStitchPathsV1(file, path, nativeFoldPathIds, signal);
    for (const { mark } of candidates) {
      const segments = exact.descriptors
        .filter(({ path: source }) => source.sourcePathId === mark.id)
        .toSorted((a, b) => a.path.startPointIndex - b.path.startPointIndex);
      if (
        segments.length !== mark.pts.length - 1 ||
        segments.some(({ path: source, startMm, endMm }, i) => {
          const start = mark.pts[i];
          const end = mark.pts[i + 1];
          return (
            source.closed ||
            source.startPointIndex !== i ||
            source.endPointIndex !== i + 1 ||
            start.x !== startMm[0] ||
            start.y !== startMm[1] ||
            end.x !== endMm[0] ||
            end.y !== endMm[1]
          );
        })
      )
        throw new Error('The saved fold mark differs from the exact original L8 segments.');
    }
    resolved = ordinary;
  } else {
    resolved = layOut();
  }
  if (!resolved) throw new Error('The saved fold cannot be laid on the current pattern size.');
  signal.throwIfAborted();
  const { geometry, via } = resolved;
  return Object.freeze({
    operationNumber: authored.operationNumber,
    operationOrder: authored.operationOrder,
    foldKey: fold.foldKey,
    pieceLineKey: fold.pieceKey,
    row: path.row,
    sourceFingerprint: authored.sourceFingerprint,
    kind: geometry.kind,
    via,
    nativeFoldPathIds,
    lineMm: Object.freeze([absolute(geometry.a), absolute(geometry.b)] as const),
    movingPointMm: absolute(geometry.flipAt),
  });
}
