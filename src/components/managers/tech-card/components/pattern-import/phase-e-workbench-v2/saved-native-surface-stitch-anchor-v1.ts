import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardSeamAnchor } from 'api/proto-http/common';
import { innerAnchor } from 'components/managers/tech-card/components/step-seams/step-seams-model';
import { buildAssemblyPieces } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { seamLoopOf, seamPieceOf } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceDTO } from 'lib/nesting/types';
import type { IRPath } from 'lib/pattern-import/types';
import { anchorFromWire, anchorToWire } from 'lib/seams/wire';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  bindSavedLegacyRingV1,
  readSavedNativeStraightStitchPathsV1,
  type SavedNativeCurveIntervalV1,
  type SavedNativeStitchCompilerSourceV1,
} from './saved-legacy-native-stitch-run-v8';

type PointMm = readonly [number, number];

export function savedNativeInternalAnchorIndexV1(anchor: TechCardSeamAnchor): number | null {
  const match = /^i(0|[1-9][0-9]*)$/.exec(anchor.edgeHint ?? '');
  const index = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(index) ? index : null;
}

function near(a: PointMm, b: PointMm) {
  // Ordinary DXF geometry rounds both coordinates before the drawing is simplified.
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.002;
}

/** Replays the ordinary iN surface anchor before proving the exact raw L8 chain. */
export async function resolveSavedNativeSurfaceStitchAnchorV1(
  input: Readonly<{
    card: common_TechCard;
    sizeToken: string;
    grainLayer: string;
    file: Uint8Array<ArrayBuffer>;
    block: PieceDTO[];
    rawBlock: string;
    nativeSource: SavedNativeStitchCompilerSourceV1;
    parent: SavedAssemblyNativeSewingPathV1;
    anchor: TechCardSeamAnchor;
    index: number;
  }>,
  signal: AbortSignal,
) {
  const {
    card,
    sizeToken,
    grainLayer,
    file,
    block,
    rawBlock,
    nativeSource,
    parent,
    anchor,
    index,
  } = input;
  const cuts = block.filter(({ layer }) => layer === '1');
  const dto = seamPieceOf(block);
  if (cuts.length !== 1 || !dto || block.filter(({ layer }) => layer === '14').length !== 1)
    throw new Error('The saved surface anchor requires one original cut and one L14 parent.');
  const owner = {
    piece: cuts[0]!,
    block: parent.blockName,
    size: sizeToken,
    instances: 1,
    layer: '1',
    grainLayer,
    sizes: [sizeToken],
    layers: block,
  };
  const drawing = buildAssemblyPieces(card, new Map([[parent.pieceLineKey, owner]]), grainLayer);
  const part = drawing.pieces.get(parent.pieceLineKey);
  const ordinary = part?.inner[index];
  const grain = drawing.grainDeg.get(parent.pieceLineKey);
  const stored = anchorFromWire(anchor);
  const projected =
    part && ordinary && grain !== undefined ? innerAnchor(part.geom, index, ordinary, grain) : null;
  if (
    !ordinary ||
    !projected ||
    canonical(anchorToWire({ ...projected, layer: stored.layer })) !==
      canonical(anchorToWire(stored))
  )
    throw new Error('The stored surface anchor differs from the ordinary inner-line fingerprint.');

  const loop = seamLoopOf(dto);
  if (loop.layer !== '14') throw new Error('The surface anchor has no ordinary L14 parent.');
  const {
    shift: [shiftX, shiftY],
  } = bindSavedLegacyRingV1(loop.pts, parent);
  const registered = ordinary.map(([x, y]): PointMm => [x + shiftX, -y + shiftY]);
  const matches: { path: IRPath; reversed: boolean; points: PointMm[] }[] = [];
  for (const { paths, styles } of nativeSource.nativeRead.read.doc.pages) {
    const insideLayer = new Set(styles.filter(({ layer }) => layer === '8').map(({ id }) => id));
    for (const path of paths) {
      if (path.src.block !== rawBlock || path.closed || !insideLayer.has(path.style)) continue;
      for (const reversed of [false, true]) {
        const points = (reversed ? path.pts.toReversed() : path.pts).map(
          ({ x, y }): PointMm => [x, y],
        );
        if (
          points.length < registered.length ||
          !near(points[0]!, registered[0]!) ||
          !near(points.at(-1)!, registered.at(-1)!)
        )
          continue;
        let matched = 0;
        for (const point of points) {
          if (matched < registered.length && near(point, registered[matched]!)) matched++;
        }
        if (matched !== registered.length) continue;
        const ordinaryMatches = (dto.inner ?? []).filter(
          (line) =>
            line.layer === '8' &&
            !line.closed &&
            line.pts.length === points.length &&
            [line.pts, line.pts.toReversed()].some((sequence) =>
              sequence.every(({ x, y }, i) => near([x * 10 + shiftX, y * 10 + shiftY], points[i]!)),
            ),
        );
        if (ordinaryMatches.length === 1) matches.push({ path, reversed, points });
      }
    }
  }
  if (matches.length !== 1)
    throw new Error('The saved surface anchor needs one exact original L8 path.');
  const [{ path, reversed, points }] = matches;
  const exact = await readSavedNativeStraightStitchPathsV1(file, parent, [path.id], signal);
  const edges = exact.descriptors.toSorted(
    (a, b) => a.path.startPointIndex - b.path.startPointIndex,
  );
  if (
    edges.length !== points.length - 1 ||
    edges.some((edge, i) => {
      const j = reversed ? edges.length - i : i;
      const [start, end] = [points[j]!, points[j + (reversed ? -1 : 1)]!];
      return (
        edge.path.sourcePathId !== path.id ||
        edge.path.closed ||
        edge.path.startPointIndex !== i ||
        edge.path.endPointIndex !== i + 1 ||
        (i > 0 && edges[i - 1]!.endVertexId !== edge.startVertexId) ||
        Math.hypot(edge.startMm[0] - start[0], edge.startMm[1] - start[1]) > 1e-9 ||
        Math.hypot(edge.endMm[0] - end[0], edge.endMm[1] - end[1]) > 1e-9
      );
    })
  )
    throw new Error('Exact raw L8 segments differ from the checked ordinary source line.');
  const vertexIds = edges
    .map(({ startVertexId }) => startVertexId)
    .concat(edges.at(-1)!.endVertexId);
  const intervals = (reversed ? edges.toReversed() : edges).map(
    (edge): SavedNativeCurveIntervalV1 =>
      Object.freeze({
        nativeCurveId: edge.native.sourceCurveId,
        t0: reversed ? 1 : 0,
        t1: reversed ? 0 : 1,
        startMm: reversed ? edge.endMm : edge.startMm,
        endMm: reversed ? edge.startMm : edge.endMm,
      }),
  );
  return Object.freeze({
    sourceFileId: nativeSource.sourceFileId,
    layer: '8' as const,
    nativePathId: path.id,
    nativeLayer14ParentId: parent.nativePathId,
    sourceInstancePath: edges[0]!.instancePath,
    storedLengthMm: stored.lenMm,
    lengthMm: points
      .slice(1)
      .reduce((sum, [x, y], i) => sum + Math.hypot(x - points[i]![0], y - points[i]![1]), 0),
    ordinaryDrawingPoints: ordinary.length,
    rawNativePoints: points.length,
    reverse: reversed,
    orderedNativeVertexIds: Object.freeze(reversed ? vertexIds.toReversed() : vertexIds),
    firstMm: Object.freeze(points[0]!),
    lastMm: Object.freeze(points.at(-1)!),
    nativePointsMm: Object.freeze(points.map((point) => Object.freeze(point))),
    authoritySha256: exact.authoritySha256,
    intervals: Object.freeze(intervals),
  });
}
