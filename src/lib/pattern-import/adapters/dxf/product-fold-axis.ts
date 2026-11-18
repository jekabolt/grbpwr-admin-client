import { WorkBudget } from '../budget';
import { ringSelfIntersects } from '../../../fusing-dxf/spline';
import { num } from '../../write/format';
import type { FoldFeature, IRPath, PieceFamily, ProductDxfFoldAxis, PtMm } from '../../types';
import type { DxfPieceCandidate, DxfRead } from './dxf-types';

const writtenAxes = new WeakSet<FoldFeature>();
export const isReadProductFoldAxis = (feature: FoldFeature) => writtenAxes.has(feature);

export const equalAxisPoint = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;

/** One exact, undivided edge on the owning cut. Reject interior axes and duplicate incidences. */
export function hasSingleCutEdge(cut: readonly PtMm[], a: PtMm, b: PtMm): boolean {
  if (equalAxisPoint(a, b)) return false;
  return (
    cut.filter((p, i) => {
      const q = cut[(i + 1) % cut.length]!;
      return (
        (equalAxisPoint(a, p) && equalAxisPoint(b, q)) ||
        (equalAxisPoint(b, p) && equalAxisPoint(a, q))
      );
    }).length === 1
  );
}

/** Direct worker evidence only. A Layer 6 line alone does not grant a saved half choice. */
export function productDxfFoldAxes(
  read: DxfRead,
  families: readonly PieceFamily[],
  isStraight: (p: IRPath) => boolean,
): ProductDxfFoldAxis[] {
  const { meta } = read;
  if (
    !meta.halfFoldBlocks?.size ||
    meta.units.mmPerUnit !== 1 ||
    meta.binary ||
    meta.generatedFusing ||
    !['AC1009', 'AC1015'].includes(meta.version ?? '')
  )
    return [];
  const page = read.doc.pages[0]!;
  const axes: ProductDxfFoldAxis[] = [];
  const budget = new WorkBudget();
  for (const family of families) {
    if (family.candidates.length !== 1) continue;
    const c = family.candidates[0] as DxfPieceCandidate;
    if (
      !c.dxf ||
      c.dxf.outerIsSeam ||
      c.dxf.rulGraded ||
      c.dxf.nativeCutHoles ||
      (c.dxf.instances ?? 1) !== 1
    )
      continue;
    const dx = c.dxf;
    if (!meta.halfFoldBlocks.has(dx.block)) continue;
    const features = dx.features.filter((f) => f.kind === 'fold');
    if (features.length !== 1 || features[0]!.ranges.length !== 1) continue;
    const axis = features[0]!;
    const groups = meta.groups.filter((g) => g.block === dx.block);
    const group = groups[0];
    if (
      groups.length !== 1 ||
      group?.kind !== 'insert' ||
      group.index !== dx.group ||
      group.transform.a !== 1 ||
      group.transform.b !== 0 ||
      group.transform.c !== 0 ||
      group.transform.d !== 1 ||
      group.transform.e !== 0 ||
      group.transform.f !== 0
    )
      continue;
    const cuts = group.paths
      .map((id) => page.paths[id]!)
      .filter((p) => page.styles[p.style]?.layer === '1' && p.closed);
    if (
      cuts.length !== 1 ||
      cuts[0]!.src.block !== dx.block ||
      !isStraight(cuts[0]!) ||
      !hasSingleCutEdge(cuts[0]!.pts, axis.a, axis.b)
    )
      continue;
    const cut = cuts[0]!.pts;
    const comparisons = cut.length * cut.length;
    if (comparisons > budget.limit - budget.used) continue;
    budget.spend(comparisons, 'native half-fold topology');
    if (ringSelfIntersects(cut)) continue;
    const layerPaths = group.paths.filter(
      (id) => page.styles[page.paths[id]!.style]?.layer === '6',
    );
    const id = layerPaths[0];
    if (
      id === undefined ||
      layerPaths.length !== 1 ||
      axis.ranges[0]!.path !== id ||
      axis.ranges[0]!.from !== 0 ||
      axis.ranges[0]!.to !== 2 ||
      meta.pathEntity[id] !== (meta.version === 'AC1009' ? 'POLYLINE' : 'LWPOLYLINE')
    )
      continue;
    const path = page.paths[id]!;
    if (
      !isStraight(path) ||
      path.closed ||
      path.src.block !== dx.block ||
      path.pts.length !== 3 ||
      !equalAxisPoint(path.pts[0]!, axis.a) ||
      !equalAxisPoint(path.pts[2]!, axis.b) ||
      !equalAxisPoint(path.pts[1]!, {
        x: Number(num((axis.a.x + axis.b.x) / 2)),
        y: Number(num((axis.a.y + axis.b.y) / 2)),
      }) ||
      !hasSingleCutEdge(c.outer, axis.a, axis.b)
    )
      continue;
    writtenAxes.add(axis);
    axes.push({
      seed: family.seed,
      block: dx.block,
      identity: dx.identity,
      size: dx.size,
      rank: c.rank,
      a: axis.a,
      b: axis.b,
    });
  }
  return axes;
}
