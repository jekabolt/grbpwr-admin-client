// DXF fast path: a garment DXF already has pieces, sizes and features, so the wizard does not
// need to assemble tiles, chain dashes or flood-fill seeds. This builds the outputs of the
// `assemble`, `chains`, `sizes` and `pieces` stages directly from the DXF segmentation, typed by
// the contract, so `semantics/` (F5) receives the same shapes it receives from the PDF path —
// plus the features the DXF already declares (DxfPieceCandidate.dxf.features).
//
// Contract gap this fills (proposed for 08-CONTRACT §4.1 in reports/F8.md): for kind 'dxf' with
// `presegmented`, the worker runs `dxfFastPath` instead of assemble → chains → pieces.

import type {
  AllowanceDecision,
  Chain,
  ChainRole,
  ChainSet,
  CutLineFeature,
  DrillFeature,
  Feature,
  FoldFeature,
  GrainFeature,
  InternalFeature,
  IRPath,
  LineClass,
  NotchFeature,
  PathId,
  PathRange,
  PieceFamily,
  ScaleCandidate,
  SeamLineFeature,
  Seed,
  Sheet,
  SizeRun,
} from '../../types';
import { PATIMPORT } from '../../types';
import type {
  DxfBlockPiece,
  DxfPieceCandidate,
  DxfRead,
  DxfSegmentation,
  PathRole,
} from './dxf-types';
import { IDENTITY, bboxOf, pathLength } from './geometry';
import { layerKind } from './segment';

export type DxfFastPath = {
  sheet: Sheet;
  chains: ChainSet;
  run: SizeRun;
  seeds: Seed[];
  /** One family per identity; candidates are DxfPieceCandidate (structurally PieceCandidate). */
  families: PieceFamily[];
  scale: ScaleCandidate[];
  /** File-level allowance as drawn (SemanticsInput.fileAllowance default). */
  allowance: AllowanceDecision | null;
};

const ROLE_OF: Record<PathRole, ChainRole> = {
  cut: 'size',
  'cut-extra': 'ignore',
  hole: 'internal',
  seam: 'seam',
  'seam-extra': 'ignore',
  grain: 'grain',
  notch: 'notch',
  drill: 'internal',
  internal: 'internal',
  fold: 'common',
  'grade-point': 'ignore',
  'qv-copy': 'ignore',
  other: 'ignore',
};

export function dxfScaleCandidates(read: DxfRead): ScaleCandidate[] {
  const u = read.meta.units;
  const ev = { page: 0, bbox: read.meta.extents, text: u.evidence };
  if (u.source === 'insunits' || u.source === 'units-text') {
    return [
      {
        method: 'declared',
        factor: 1,
        measuredMm: null,
        declaredMm: null,
        evidence: ev,
        confidence: 1,
      },
    ];
  }
  if (u.source === 'measurement') {
    return [
      {
        method: 'declared',
        factor: 1,
        measuredMm: null,
        declaredMm: null,
        evidence: ev,
        confidence: 0.6,
      },
      {
        method: 'manual',
        factor: 1 / 25.4,
        measuredMm: null,
        declaredMm: null,
        evidence: ev,
        confidence: 0.3,
      },
    ];
  }
  // guessed millimetres: offer the usual alternatives for the operator
  return [
    {
      method: 'none',
      factor: 1,
      measuredMm: null,
      declaredMm: null,
      evidence: ev,
      confidence: 0.4,
    },
    {
      method: 'manual',
      factor: 10,
      measuredMm: null,
      declaredMm: null,
      evidence: { ...ev, text: 'centimetres' },
      confidence: 0.2,
    },
    {
      method: 'manual',
      factor: 25.4,
      measuredMm: null,
      declaredMm: null,
      evidence: { ...ev, text: 'inches' },
      confidence: 0.2,
    },
  ];
}

export function dxfFastPath(read: DxfRead, seg: DxfSegmentation): DxfFastPath {
  const page = read.doc.pages[0];
  const pathById = new Map(page.paths.map((p) => [p.id, p]));
  const edges = (id: PathId) => {
    const p = pathById.get(id);
    if (!p) return 0;
    return p.closed ? p.pts.length : Math.max(0, p.pts.length - 1);
  };
  const range = (id: PathId): PathRange => ({ path: id, from: 0, to: edges(id) });

  // chains: one per IR path, same order (chain id = index; map kept for paths)
  const chainOf = new Map<PathId, number>();
  const chains: Chain[] = page.paths.map((p, i) => {
    chainOf.set(p.id, i);
    return {
      id: i,
      pts: p.pts,
      closed: p.closed,
      ranges: [range(p.id)],
      motif: page.styles[p.style]?.dash ?? null,
      style: p.style,
      lengthMm: pathLength(p.pts, p.closed),
    };
  });

  // roles per path from the segmentation; loose paths by layer
  const roleOfPath = new Map<
    PathId,
    { role: ChainRole; size: string | null; layer: string | null }
  >();
  for (const pc of seg.pieces) {
    for (const [id, r] of Object.entries(pc.roles)) {
      roleOfPath.set(Number(id), {
        role: ROLE_OF[r],
        size: ROLE_OF[r] === 'size' ? pc.size || null : null,
        layer: null,
      });
    }
  }
  for (const p of page.paths) {
    const layer = page.styles[p.style]?.layer ?? null;
    const r = roleOfPath.get(p.id);
    if (r) r.layer = layer;
    else {
      const k = layerKind(layer);
      const role: ChainRole =
        k === 'cut'
          ? 'common'
          : k === 'seam'
            ? 'seam'
            : k === 'grain'
              ? 'grain'
              : k === 'notch'
                ? 'notch'
                : k === 'internal' || k === 'drill' || k === 'cutout'
                  ? 'internal'
                  : k === 'mirror'
                    ? 'common'
                    : 'ignore';
      roleOfPath.set(p.id, { role, size: null, layer });
    }
  }
  const classKey = new Map<string, LineClass>();
  for (const p of page.paths) {
    const r = roleOfPath.get(p.id)!;
    const key = `${r.role}|${r.size ?? ''}|${r.layer ?? ''}`;
    let c = classKey.get(key);
    if (!c) {
      c = {
        id: classKey.size,
        role: r.role,
        sizeLabel: r.size,
        chains: [],
        totalLengthMm: 0,
        evidence: [{ kind: 'ocg', name: r.layer ?? '' }],
        confidence: 1,
      };
      classKey.set(key, c);
    }
    const ch = chains[chainOf.get(p.id)!];
    c.chains.push(ch.id);
    c.totalLengthMm += ch.lengthMm;
  }
  const classes = [...classKey.values()];
  const chainSet: ChainSet = { chains, classes, bundles: [], orphans: [], warnings: [] };

  // size run
  const run: SizeRun = {
    encoding: seg.sizes.length <= 1 ? 'single' : 'text-label',
    sizes: seg.sizes.map((s) => ({
      label: s.token,
      rank: s.rank,
      classId: classes.find((c) => c.role === 'size' && c.sizeLabel === s.token)?.id ?? null,
      file: read.doc.file.id,
    })),
    evidence: [
      `dxf ${seg.dialect}: size = ${seg.pieces.some((p) => p.sizeSource === 'label') ? 'AAMA SIZE label' : 'last block-name token'}`,
      ...seg.sizes
        .filter((s) => s.raw.some((r) => r !== s.token))
        .map((s) => `${s.raw.join('/')} = ${s.token}`),
      ...(seg.sampleSize ? [`sample size ${seg.sampleSize.token} (${seg.sampleSize.source})`] : []),
    ],
  };

  // seeds + families
  const seeds: Seed[] = [];
  const families: PieceFamily[] = [];
  seg.identities.forEach((id, k) => {
    const ps = id.pieces.map((i) => seg.pieces[i]);
    const ref = (seg.sampleSize && ps.find((p) => p.size === seg.sampleSize!.token)) || ps[0];
    const outerRef = ref.cut ?? ref.seam;
    const bb = outerRef?.bbox ?? read.meta.extents;
    const labelText = ref.labels.texts
      .map((t) => page.texts.find((x) => x.id === t))
      .find((t) => t && /piece|name/i.test(t.text));
    seeds.push({
      id: k,
      at: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 },
      origin: 'text',
      text: labelText,
      variant: null,
    });
    const candidates: DxfPieceCandidate[] = ps.map((p) =>
      candidateOf(p, k, id.mode === 'A', seg, chainOf, range, read, pathById),
    );
    const areas = candidates.map((c) => c.areaMm2);
    families.push({
      seed: k,
      candidates,
      monotone: id.uni || areas.length < 2 || areas.every((a, i) => i === 0 || a > areas[i - 1]),
    });
  });

  const sheet: Sheet = {
    id: 0,
    poses: [
      {
        file: read.doc.file.id,
        page: 0,
        toSheet: IDENTITY,
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        residualMm: 0,
      },
    ],
    pairs: [],
    bbox: read.meta.extents,
    missing: [],
    paths: page.paths,
    texts: page.texts,
    rasters: page.rasters,
    styles: page.styles,
    warnings: [...read.doc.warnings, ...seg.warnings],
  };
  return {
    sheet,
    chains: chainSet,
    run,
    seeds,
    families,
    scale: dxfScaleCandidates(read),
    allowance: seg.allowance,
  };
}

function candidateOf(
  p: DxfBlockPiece,
  seed: number,
  outerIsSeam: boolean,
  seg: DxfSegmentation,
  chainOf: Map<PathId, number>,
  range: (id: PathId) => PathRange,
  read: DxfRead,
  pathById: Map<PathId, IRPath>,
): DxfPieceCandidate {
  const outer = (outerIsSeam ? p.seam ?? p.cut : p.cut ?? p.seam) ?? null;
  const group = read.meta.groups[p.group];
  const wallIds = new Set(outer?.paths ?? []);
  const features: Feature[] = [];
  const ranges = (ids: PathId[]) => ids.map(range);
  if (p.cut)
    features.push({
      kind: 'cut',
      pts: p.cut.pts,
      origin: 'detected',
      ranges: ranges(p.cut.paths),
      confidence: outerIsSeam ? 0.3 : 1,
    } satisfies CutLineFeature);
  if (p.seam)
    features.push({
      kind: 'seam',
      pts: p.seam.pts,
      origin: 'detected',
      ranges: ranges(p.seam.paths),
      confidence: 1,
    } satisfies SeamLineFeature);
  if (p.grain) {
    features.push({
      kind: 'grain',
      a: p.grain.a,
      b: p.grain.b,
      angleDeg: p.grain.angleDeg,
      origin: 'detected',
      ranges: [range(p.grain.path)],
      confidence: p.grain.form === 'clo-arrow' ? 1 : p.grain.form === 'axis' ? 0.9 : 0.6,
    } satisfies GrainFeature);
  }
  for (const n of p.notches) {
    features.push({
      kind: 'notch',
      at: n.at,
      seg: [n.at, { x: n.at.x + n.dir.x * n.depthMm, y: n.at.y + n.dir.y * n.depthMm }],
      depthMm: n.depthMm,
      origin: n.source === 'derived' ? 'derived' : 'detected',
      ranges: n.paths.map(range),
      confidence: n.source === 'derived' ? 0.5 : n.on === 'none' ? 0.6 : 1,
    } satisfies NotchFeature);
  }
  for (const d of p.drills)
    features.push({
      kind: 'drill',
      at: d.at,
      origin: 'detected',
      ranges: [range(d.path)],
      confidence: 1,
    } satisfies DrillFeature);
  const page = read.doc.pages[0];
  for (const [ids, role] of Object.entries(p.roles)) {
    const id = Number(ids);
    const path = pathById.get(id);
    if (!path) continue;
    if (role === 'internal' || role === 'hole') {
      features.push({
        kind: 'internal',
        pts: path.pts,
        closed: path.closed,
        label: role === 'hole' ? 'hole' : undefined,
        origin: 'detected',
        ranges: [range(id)],
        confidence: 1,
      } satisfies InternalFeature);
    } else if (role === 'fold' && path.pts.length >= 2) {
      features.push({
        kind: 'fold',
        a: path.pts[0],
        b: path.pts[path.pts.length - 1],
        label: 'mirror line (AAMA layer 6) — unfold',
        origin: 'detected',
        ranges: [range(id)],
        confidence: 1,
      } satisfies FoldFeature);
    }
  }
  const rank = p.size ? seg.sizes.findIndex((s) => s.token === p.size) : 0;
  const area = outer?.areaMm2 ?? 0;
  return {
    seed,
    rank: Math.max(0, rank),
    outer: outer?.pts ?? [],
    walls: [...wallIds].map((id) => chainOf.get(id)!).filter((x) => x != null),
    inside: group.paths
      .filter((id) => !wallIds.has(id))
      .map((id) => chainOf.get(id)!)
      .filter((x) => x != null),
    textsInside: group.texts,
    outcome: !outer ? 'leak' : area < PATIMPORT.minPieceAreaMm2 ? 'tiny' : 'closed',
    areaMm2: area,
    bbox:
      outer?.bbox ?? bboxOf(group.paths.flatMap((id) => pathById.get(id)?.pts ?? [{ x: 0, y: 0 }])),
    sourceCoverage: outer ? 1 : 0,
    p95Mm: 0,
    dxf: {
      block: p.block,
      group: p.group,
      identity: p.identity,
      size: p.size,
      features,
      outerIsSeam: outerIsSeam && !!p.seam,
    },
  };
}
