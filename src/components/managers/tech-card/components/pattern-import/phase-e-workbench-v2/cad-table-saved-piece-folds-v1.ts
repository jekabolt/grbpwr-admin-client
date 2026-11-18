import { bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import { seamLoopOf, seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import { contourSig, frameOf, fromUV } from 'lib/folds/geom';
import { resolveFolds } from 'lib/folds/resolve';
import type { TechCardPieceFoldSampleWire, TechCardPieceFoldWire } from 'lib/folds/types';
import { foldFromWire } from 'lib/folds/wire';
import type { PieceDTO } from 'lib/nesting/types';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';
import { grainRotation } from 'lib/pom/upright';

import { patternImportDxfPhaseECadTablePieceKeyV1 } from './cad-table-piece-layout-session-v1';
import {
  bindSavedLegacyRingV1,
  savedLegacyDxfRoundingMmV1,
} from './saved-legacy-native-stitch-run-v8';

export type CadTableSavedFoldAxisV1 = Readonly<{
  foldKey: string;
  a: PtMm;
  b: PtMm;
}>;

export type CadTableSavedFoldAxesByPieceV1 = ReadonlyMap<
  string,
  readonly CadTableSavedFoldAxisV1[]
>;

const mm = (p: PtMm): Pt2 => [p.x * 10, p.y * 10];

function completeSample(sample: TechCardPieceFoldSampleWire | undefined): boolean {
  return (
    typeof sample?.u === 'number' &&
    sample.u >= 0 &&
    sample.u <= 1 &&
    typeof sample?.v === 'number' &&
    sample.v >= 0 &&
    sample.v <= 1
  );
}

function hasSheetOrigin(piece: PieceDTO): piece is PieceDTO & { originX: number; originY: number } {
  return Number.isFinite(piece.originX) && Number.isFinite(piece.originY);
}

/** Reuse the assembler's whole-ring correspondence, and require it in the original sheet frame. */
function exactBlock(
  candidates: readonly PieceDTO[],
  displayed: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number],
): readonly PieceDTO[] | null {
  const boundaries = displayed.contours.filter(
    ({ role, closed }) => closed && (role === 'cut-boundary' || role === 'sewing-boundary'),
  );
  const [boundary] = boundaries;
  if (boundaries.length !== 1 || !boundary || boundary.vertices.length < 3) return null;
  const layer = boundary.role === 'cut-boundary' ? '1' : '14';
  const native = {
    nativePointsMm: boundary.vertices.map(({ pointMm }) => pointMm),
    vertexIds: boundary.vertices.map(({ vertexId }) => vertexId),
  };
  const matches = candidates.filter((candidate) => {
    if (
      !candidate.blockName ||
      candidate.layer !== layer ||
      candidate.poly.length !== boundary.vertices.length ||
      !hasSheetOrigin(candidate)
    )
      return false;
    try {
      const {
        shift: [x, y],
      } = bindSavedLegacyRingV1(candidate.poly.map(mm), native);
      return (
        Math.hypot(x - 10 * candidate.originX, y - 10 * candidate.originY) <=
        savedLegacyDxfRoundingMmV1
      );
    } catch {
      return false;
    }
  });
  return matches.length === 1
    ? candidates.filter(({ blockName }) => blockName === matches[0].blockName)
    : null;
}

/**
 * Resolves stored fold rows on the current saved DXF, using its exact displayed boundary to bind
 * the block. The legacy DTO's origin is the source XY frame. CAD piece transforms are presentation.
 */
export function projectCadTableSavedPieceFoldAxesV1(
  rows: readonly TechCardPieceFoldWire[],
  projection: Pick<PatternImportDxfProductPhaseEAssemblyProjectionV1, 'pieces' | 'sizeToken'>,
  candidates: readonly PieceDTO[],
  savedSizeTokens: readonly string[],
): CadTableSavedFoldAxesByPieceV1 {
  const axes = new Map<string, readonly CadTableSavedFoldAxisV1[]>();
  const selectedRank = bareToken(projection.sizeToken);
  const sizeTokens = new Set(savedSizeTokens.map(bareToken));
  if (!selectedRank || !sizeTokens.has(selectedRank)) return axes;
  // Several genuine grades can have an identical cut at the same sheet origin.
  // The ordinary DXF rank verdict must narrow the candidates before comparing rings.
  const sized = splitPiecesBySize(candidates, sizeTokens).groups.filter(
    ({ size }) => bareToken(size) === selectedRank,
  );
  if (sized.length !== 1) return axes;
  for (const displayed of projection.pieces) {
    const owned = rows.filter(
      ({ pieceLineKey, anchoredSize, stale }) =>
        pieceLineKey === displayed.pieceLineKey && anchoredSize === projection.sizeToken && !stale,
    );
    if (!owned.length) continue;
    const block = exactBlock(sized[0].pieces, displayed);
    if (!block) continue;
    const cuts = block.filter(({ layer }) => layer === '1');
    if (cuts.length !== 1 || block.filter(({ layer }) => layer === '14').length !== 1) continue;
    const sewing = seamPieceOf(block);
    if (!sewing || !hasSheetOrigin(sewing) || seamLoopOf(sewing).layer !== '14') continue;
    const pieceKey = displayed.pieceLineKey;
    const piece = segmentPiece({
      piece: sewing,
      pieceKey,
      name: displayed.pieceId,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    });
    if (piece.rs.length < 3) continue;
    const rotation = grainRotation(cuts[0]);
    const frame = frameOf(piece, rotation);
    const signature = contourSig(piece, frame);
    const grainDeg = new Map([[pieceKey, rotation]]);
    const originalMarks = (sewing.inner ?? [])
      .filter(({ layer, closed, pts }) => layer === '8' && !closed && pts.length >= 2)
      .map(({ pts }) => pts.map(mm));
    const innerLines = new Map([[pieceKey, originalMarks]]);
    const absolute = (p: Pt2): PtMm => {
      const [x, y] = fromUV(frame, p);
      return { x: x + 10 * sewing.originX, y: y + 10 * sewing.originY };
    };

    const pieceAxes = owned
      .flatMap((row): CadTableSavedFoldAxisV1[] => {
        if (
          !row.foldKey ||
          rows.filter(({ foldKey }) => foldKey === row.foldKey).length !== 1 ||
          !row.line?.every(completeSample) ||
          !completeSample(row.flipAt) ||
          !(row.edgeSamples ?? []).every(completeSample) ||
          row.contourSig !== signature
        )
          return [];
        const stored = foldFromWire(row);
        if (!stored || (!stored.edge && stored.source !== 'dxf')) return [];
        const { folds, via } = resolveFolds([stored], [piece], { grainDeg, innerLines });
        const [axis] = folds[pieceKey] ?? [];
        if (!axis || via[stored.foldKey] !== (stored.edge ? 'hint' : 'inner')) return [];
        const a = absolute(axis.a);
        const b = absolute(axis.b);
        return [a.x, a.y, b.x, b.y].every(Number.isFinite) && Math.hypot(a.x - b.x, a.y - b.y) > 0
          ? [{ foldKey: stored.foldKey, a, b }]
          : [];
      })
      .sort((a, b) => a.foldKey.localeCompare(b.foldKey));
    if (pieceAxes.length)
      axes.set(patternImportDxfPhaseECadTablePieceKeyV1(displayed.pieceId, pieceKey), pieceAxes);
  }
  return axes;
}
