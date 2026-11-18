import { num } from '../../write/format';
import { readManifestBytes } from '../../manifest';
import type { CardSize, Feature, IRPath, PtMm, WorkBudgetLike } from '../../types';
import { ringSelfIntersects, ringsOverlap, ringStrictlyInside } from '../../../fusing-dxf/spline';
import type { RawDxf, RawEntity } from './ast';
import type { DxfBlockPiece, DxfMeta, DxfRead } from './dxf-types';
import { signedArea, apply } from './geometry';

type Ring = Readonly<{ path: IRPath; points: PtMm[] }>;
type Binding = Readonly<{
  block: string;
  group: number;
  identity: string;
  size: string;
  sizeId: number;
  rank: number;
  outer: Ring;
  holes: Ring[];
}>;
type Refusal = Readonly<{ reason: string; onlyIfHole?: true }>;
const byRead = new WeakMap<DxfMeta, Map<number, Binding | Refusal>>();
const byFeatures = new WeakMap<readonly Feature[], Binding>();
function requireHole(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`Native DXF cut hole: ${reason}.`);
}
const tag = (e: RawEntity, code: number) => e.tags.find((t) => t.code === code)?.value;
const samePoint = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;

/** The stage accepts only native writer polygons, never sampled bulges, fit curves or stitched paths. */
function straightRing(e: RawEntity, path: IRPath, group: DxfMeta['groups'][number]): Ring {
  requireHole(
    e.type === 'POLYLINE' &&
      e.layer === '1' &&
      tag(e, 70) === '1' &&
      tag(e, 66) === '1' &&
      e.tags.length === 3 &&
      tag(e, 8) === '1' &&
      e.seqend &&
      path.closed &&
      path.src.block === group.block &&
      path.src.op === e.op &&
      path.src.sub === 0 &&
      group.transform.a === 1 &&
      group.transform.b === 0 &&
      group.transform.c === 0 &&
      group.transform.d === 1,
    'expected a native R12 straight polygon in its original axes',
  );
  const points = e.children.map((v) => {
    requireHole(
      v.type === 'VERTEX' &&
        v.layer === '1' &&
        v.tags.every((t) => [8, 10, 20, 30].includes(t.code)) &&
        v.tags.length === 4 &&
        [8, 10, 20, 30].every((code) => tag(v, code) !== undefined) &&
        tag(v, 30) === num(0),
      'non-planar or unsupported cut vertex',
    );
    const x = Number(tag(v, 10)),
      y = Number(tag(v, 20));
    requireHole(
      Number.isFinite(x) && Number.isFinite(y) && num(x) === tag(v, 10) && num(y) === tag(v, 20),
      'invalid native cut vertex',
    );
    return apply(group.transform, { x, y });
  });
  requireHole(
    points.length >= 3 &&
      points.length === path.pts.length &&
      points.every((p, i) => samePoint(p, path.pts[i]!)) &&
      new Set(points.map((p) => `${p.x},${p.y}`)).size === points.length &&
      !ringSelfIntersects(points),
    'native vertex order is ambiguous or self-intersecting',
  );
  return { path, points };
}

/** Read-time native evidence is scoped to the exact decoder instance and never serialized into a DXF. */
export function captureOwnR12CutHoles(
  read: DxfRead,
  raw: RawDxf,
  bytes: ArrayBuffer,
  budget: WorkBudgetLike,
) {
  const { meta } = read;
  if (!meta.manifest || meta.version !== 'AC1009' || meta.generatedFusing) return;
  const withExtraCut = raw.blockOrder.filter(
    (b) => b.entities.filter((e) => e.type !== 'TEXT' && e.layer === '1').length > 1,
  );
  if (!withExtraCut.length) return;
  // Structural import also accepts nonproduct DXFs; only a validated product manifest grants this additional interpretation.
  const manifest = readManifestBytes(bytes);
  if (!manifest) return;
  const duplicateBlocks = new Set(
    raw.blockOrder.filter((b) => raw.blocks.get(b.name) !== b).map((b) => b.name),
  );
  const occurrencesByBlock = new Map<string, DxfMeta['groups']>();
  for (const g of meta.groups) {
    if (g.kind !== 'insert' || !g.block) continue;
    const occurrences = occurrencesByBlock.get(g.block);
    if (occurrences) occurrences.push(g);
    else occurrencesByBlock.set(g.block, [g]);
  }
  const declaredByBlock = new Map<string, typeof manifest.blocks>();
  for (const b of manifest.blocks) {
    const entries = declaredByBlock.get(b.block);
    if (entries) entries.push(b);
    else declaredByBlock.set(b.block, [b]);
  }
  const groups = new Map<number, Binding | Refusal>(),
    byPath = new Map(read.doc.pages[0]!.paths.map((p) => [p.id, p]));
  for (const block of withExtraCut) {
    const occurrences = occurrencesByBlock.get(block.name) ?? [];
    const entities = block.entities.filter((e) => e.layer === '1' && e.type !== 'TEXT');
    const declared = declaredByBlock.get(block.name) ?? [];
    const byOp = new Set(entities.map((e) => e.op));
    for (const group of occurrences) {
      const paths = group.paths
        .map((id) => byPath.get(id)!)
        .filter((p) => p && p.src.block === block.name && byOp.has(p.src.op));
      if (!paths.some((p) => p.closed && signedArea(p.pts) < 0)) {
        groups.set(group.index, {
          onlyIfHole: true,
          reason: 'Native DXF cut hole: an interior cut contour has no clockwise native winding.',
        });
        continue;
      }
      // The strict containment and self-intersection checks compare pairs of native edges.
      const vertices = paths.reduce((n, p) => n + p.pts.length, 0);
      budget.spend(vertices * vertices, 'native cut-hole topology');
      try {
        requireHole(
          !duplicateBlocks.has(block.name) &&
            occurrences.length === 1 &&
            declared.length === 1 &&
            meta.units.mmPerUnit === 1 &&
            paths.length === entities.length,
          'ambiguous block, units or occurrence ownership',
        );
        const entry = declared[0]!,
          size = manifest.sizes.filter(
            (s) => s.token === entry.sizeToken && s.sizeId === entry.sizeId,
          );
        requireHole(size.length === 1, 'ambiguous size or rank');
        const byEntity = new Map(paths.map((p) => [p.src.op, p]));
        requireHole(byEntity.size === paths.length, 'more than one path per native cut entity');
        const rings = entities.map((e) => {
          const path = byEntity.get(e.op);
          requireHole(path, 'cut entity is missing its native instance');
          return straightRing(e, path, group);
        });
        const outers = rings.filter((r) => signedArea(r.points) > 0),
          holes = rings.filter((r) => signedArea(r.points) < 0);
        requireHole(
          outers.length === 1 && holes.length && rings.length === 1 + holes.length,
          'cut winding does not identify one exterior and its holes',
        );
        const outer = outers[0]!;
        for (const [i, hole] of holes.entries())
          requireHole(
            ringStrictlyInside(hole.points, outer.points) &&
              holes.slice(0, i).every((other) => !ringsOverlap(hole.points, other.points)),
            'holes touch, cross or nest',
          );
        const netArea = rings.reduce((sum, r) => sum + signedArea(r.points), 0);
        requireHole(
          netArea > 0 && Math.round(netArea) === entry.areaMm2,
          'signed native cut area differs from its saved block',
        );
        groups.set(group.index, {
          block: block.name,
          group: group.index,
          identity: entry.identity,
          size: entry.sizeToken,
          sizeId: entry.sizeId,
          rank: size[0]!.rank,
          outer,
          holes,
        });
      } catch (error) {
        groups.set(group.index, {
          reason: error instanceof Error ? error.message : 'Unverified native cut holes.',
        });
      }
    }
  }
  if (groups.size) byRead.set(meta, groups);
}

export function nativeCutHolesOf(
  read: DxfRead,
  p: DxfBlockPiece,
  rank: number,
  outerIsSeam: boolean,
  rulGraded: boolean,
  pathById: Map<number, IRPath>,
  features: Feature[],
): Set<number> | undefined {
  const bound = byRead.get(read.meta)?.get(p.group);
  if (!bound) return;
  if ('reason' in bound) {
    if (bound.onlyIfHole && !Object.values(p.roles).includes('hole')) return;
    throw new Error(bound.reason);
  }
  const { outer, holes } = bound;
  const unchanged = (ring: Ring) =>
    pathById.get(ring.path.id) === ring.path &&
    ring.path.pts.length === ring.points.length &&
    ring.points.every((point, i) => samePoint(point, ring.path.pts[i]!));
  requireHole(
    !outerIsSeam &&
      !rulGraded &&
      !p.nested &&
      !p.seamPair &&
      p.group === bound.group &&
      p.block === bound.block &&
      p.identity === bound.identity &&
      p.size === bound.size &&
      rank === bound.rank &&
      p.cut?.paths.length === 1 &&
      p.cut.paths[0] === outer.path.id &&
      unchanged(outer) &&
      holes.every((h) => unchanged(h) && p.roles[h.path.id] === 'hole') &&
      Object.values(p.roles).filter((role) => role === 'hole').length === holes.length,
    'segmentation changed the native block, rank, contour or hole ownership',
  );
  byFeatures.set(features, bound);
  return new Set(holes.map((h) => h.path.id));
}

/** A candidate DTO can only signal the presence of holes. The decoder's original feature array owns the native occurrence. */
export function resolveNativeCutLoops(
  dxf: { features?: Feature[]; block?: string; group?: number; identity?: string },
  rank: number,
  card: Pick<CardSize, 'sizeId' | 'token'>,
  cut: readonly PtMm[],
): PtMm[][] | null {
  const bound = dxf.features && byFeatures.get(dxf.features);
  if (
    !bound ||
    bound.group !== dxf.group ||
    bound.block !== dxf.block ||
    bound.identity !== dxf.identity ||
    bound.rank !== rank ||
    bound.size !== card.token ||
    bound.sizeId !== card.sizeId ||
    cut.length !== bound.outer.points.length ||
    cut.some((p, i) => !samePoint(p, bound.outer.points[i]!))
  )
    return null;
  return bound.holes.map((h) => h.points.map((p) => ({ ...p })));
}
