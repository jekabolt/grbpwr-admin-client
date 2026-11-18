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
    native: SavedNativeStitchCompilerSourceV1;
    file: Uint8Array<ArrayBuffer>;
  }>,
  signal: AbortSignal,
) {
  const { authored, path, block, rawBlock, native, file } = input;
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
  const layOut = (innerLine?: Pt2[]) => {
    const resolved = resolveFolds([fold], [piece], {
      grainDeg,
      innerLines: new Map([[piece.pieceKey, innerLine ? [innerLine] : []]]),
    });
    const [geometry] = resolved.folds[piece.pieceKey] ?? [];
    const via = resolved.via[fold.foldKey];
    return geometry ? { geometry, via } : undefined;
  };

  let resolved;
  let nativeFoldPathId: number | undefined;
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
        const match = layOut(line);
        if (match?.via === 'inner') candidates.push({ mark, match });
      }
    }
    if (candidates.length !== 1)
      throw new Error(
        candidates.length
          ? `The saved drawn fold matches more than one original L8 path (${candidates.map(({ mark }) => mark.id).join(', ')}).`
          : 'The saved drawn fold has no matching original L8 path in this size.',
      );
    const [{ mark, match }] = candidates;
    const exact = await readSavedNativeStraightStitchPathsV1(file, path, [mark.id], signal);
    const segments = exact.descriptors.toSorted(
      (a, b) => a.path.startPointIndex - b.path.startPointIndex,
    );
    if (
      segments.length !== mark.pts.length - 1 ||
      segments.some(({ path: source, startMm, endMm }, i) => {
        const start = mark.pts[i];
        const end = mark.pts[i + 1];
        return (
          source.sourcePathId !== mark.id ||
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
    resolved = match;
    nativeFoldPathId = mark.id;
  } else {
    resolved = layOut();
  }
  if (!resolved) throw new Error('The saved fold cannot be laid on the current pattern size.');
  signal.throwIfAborted();
  const frame = frameOf(piece, rotation);
  const absolute = (uv: Pt2) => {
    const [x, y] = fromUV(frame, uv);
    return Object.freeze([x + shiftX, y + shiftY] as const);
  };
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
    nativeFoldPathId,
    lineMm: Object.freeze([absolute(geometry.a), absolute(geometry.b)] as const),
    movingPointMm: absolute(geometry.flipAt),
  });
}
