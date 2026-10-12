// yarn doll:shape — node half: the doll request yarn doll:corpus captured (req/<id>.json) solved
// again by the same solveDoll the worker runs, then MEASURED BY SHAPE (not by seam counts):
//
//   crumple    share of cloth triangles whose 3D area is under 70 % of their flat area — per piece
//              (the worst piece is reported) and in the waist zone (the top 100 mm of the garment);
//   waist ring the circumference a tape would read round the waist seam (convex hull of the seam
//              path's floor-plane projection) against the band's sewn-edge rest length;
//   past edge  share of each surface piece (fly, shield, pocket bag) lying past its host's edge;
//   widths     front-view silhouette width (x extent) at the waist / seat / crotch / knee / hem of
//              trousers (five levels of the height otherwise), side-view depth (z) at the seat.
//
// Writes <out>.json (the numbers) and <scene>.json (the WebGL page's input, render-entry.ts).
// Deterministic: the solver is, and nothing here draws on a clock.
import { readFileSync, writeFileSync } from 'node:fs';

import { readSeamGraph, segmentAll } from '../../src/lib/assembly-skeleton/pipeline';
import { solveDoll } from '../../src/lib/doll/doll';
import type { DollGroupId, DollReport } from '../../src/lib/doll/types';
import { grainDegOf } from '../../src/lib/seams/frame';

const [file, outJson, outScene, code0] = process.argv.slice(2);
const reqs = JSON.parse(readFileSync(file, 'utf8'));
const input = reqs[reqs.length - 1];
if (!input) {
  writeFileSync(outJson, JSON.stringify({ skipped: 'no doll request captured' }));
  process.exit(0);
}
const names = new Map<string, string>(
  input.facts.pieces.map((p: { pieceKey: string; name: string }) => [p.pieceKey, p.name]),
);
const nameOf = (k: string) => names.get(k) ?? k;
const log = console.log;
console.log = () => {};
console.warn = () => {};
const graph = readSeamGraph(
  input.facts,
  undefined,
  undefined,
  undefined,
  undefined,
  input.options?.assignment,
);
const anchors = (input.anchors ?? []).map((a: { size: string; facts: never }) => ({
  size: a.size,
  pieces: segmentAll(a.facts),
  grainDeg: grainDegOf(a.facts),
}));
const seams = input.options?.seams;
const report: DollReport = solveDoll({
  graph,
  facts: input.facts,
  options: {
    ...input.options,
    ...(seams ? { seams: { ...seams, sizes: [...(seams.sizes ?? []), ...anchors] } } : {}),
  },
});
console.log = log;

const P = report.positions;
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const groupOfKey = new Map<string, DollGroupId>(report.panels.map((p) => [p.pieceKey, p.group]));
const bodyLike = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
const surfaceKeys = new Set((report.surface ?? []).filter((x) => x.placed).map((x) => x.pieceKey));
const solved = report.panels.filter((p) => p.group !== 'FLOAT' && !surfaceKeys.has(p.pieceKey));
const cloth = report.panels.filter((p) => p.group !== 'FLOAT');
const legs = solved.some((p) => p.group === 'LEG_L' || p.group === 'LEG_R');
const garment = !report.notGarment && solved.length > 0;

type Shape = {
  id: string;
  code: string;
  garment: boolean;
  legs: boolean;
  ms: number;
  converged: boolean;
  seams: { closed: number; stretched: number; proposed: number; open: number; floating: number };
  /** Ids of the seams drawn open / twisted, of the floating pieces, and the contradictions. */
  openIds: string[];
  floatingIds: string[];
  contradictions: string[];
  /** The waistband ↔ waist seam, when the garment has one. */
  band: {
    id: string;
    state: string;
    gapP95Mm: number;
    gapMaxMm: number;
    bandMm: number;
    waistMm: number;
    foldedMm: number;
    /** |band − (waist − folded)| / max, %. */
    easePct: number;
  } | null;
  /**
   * Tape round the waist seam (3D): the band's sewn edge as drawn (its hull on the floor plane)
   * vs that edge at rest, mm, diff in % — a crumpled band reads short, a stretched one long. Without
   * a band seam: the highest free loop of the body. `legsMm`: the same tape round the legs' side
   * of the seam (the fold points stand a little proud of the band).
   */
  ring: {
    ringMm: number;
    bandMm: number | null;
    diffPct: number | null;
    legsMm: number | null;
    how: string;
  } | null;
  crumple: {
    waistPct: number;
    worst: { piece: string; pct: number } | null;
    perPiece: Record<string, number>;
  };
  /**
   * Creases: share of interior mesh edges whose two triangles meet at more than 60° — paper keeps
   * its edge lengths, so its triangles keep their area and the crumple index above stays near 0
   * however crumpled the cloth looks; sharp folds are what crumpling IS on paper.
   */
  creases: {
    waistPct: number;
    worst: { piece: string; pct: number } | null;
    perPiece: Record<string, number>;
  };
  pastEdge: { piece: string; host: string | null; pct: number }[];
  levels: Record<string, number>;
  widths: Record<string, number>;
  depths: Record<string, number>;
  /** Trousers: the silhouette widens from the seat to the hem. */
  widensSeatToHem: boolean | null;
};

const empty = (): Shape => ({
  id: file.replace(/.*\/(\d+)\.json$/, '$1'),
  code: code0 ?? '',
  garment,
  legs,
  ms: report.stats.ms,
  converged: report.stats.converged,
  seams: { closed: 0, stretched: 0, proposed: 0, open: 0, floating: report.floating.length },
  openIds: report.seams
    .filter((x) => x.origin !== 'layer' && (x.state === 'open' || x.state === 'twisted'))
    .map((x) => x.id)
    .sort(),
  floatingIds: report.floating.map((x) => x.pieceKey).sort(),
  contradictions: [...(report.contradictions ?? [])].sort(),
  band: null,
  ring: null,
  crumple: { waistPct: 0, worst: null, perPiece: {} },
  creases: { waistPct: 0, worst: null, perPiece: {} },
  pastEdge: [],
  levels: {},
  widths: {},
  depths: {},
  widensSeatToHem: null,
});
const out = empty();
for (const s of report.seams.filter((x) => x.origin !== 'layer')) {
  if (s.state === 'closed' || s.state === 'eased') out.seams.closed++;
  else if (s.state === 'stretched') out.seams.stretched++;
  else if (s.state === 'proposed') out.seams.proposed++;
  else out.seams.open++;
}

const vy = (v: number) => P[3 * v + 1];
const r1 = (x: number) => Math.round(x * 10) / 10;

if (garment) {
  // ── levels ──
  const ys = (ps: typeof cloth) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of ps)
      for (let i = 0; i < p.count; i++) {
        const y = vy(p.offset + i);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    return [lo, hi];
  };
  const main = solved.filter((p) => bodyLike.has(p.group));
  const [yLo, yHi] = ys(main.length ? main : solved);
  // The waist seam: a band's seam onto the body / legs (its body side is the waist path).
  const sideGroup = (ids: string[]) => groupOfKey.get(pk(ids[0] ?? ''));
  const bandSeam = report.seams.find((s) => {
    const ga = sideGroup(s.a);
    const gb = sideGroup(s.b);
    return (
      (ga === 'WAISTBAND' && gb !== undefined && bodyLike.has(gb)) ||
      (gb === 'WAISTBAND' && ga !== undefined && bodyLike.has(ga))
    );
  });
  const bandOnA = bandSeam ? sideGroup(bandSeam.a) === 'WAISTBAND' : false;
  const waistPath: number[] = bandSeam
    ? Array.from(bandOnA ? bandSeam.pathB : bandSeam.pathA)
    : (() => {
        // No band: the highest loop of the body / legs.
        const loops = report.loops
          .filter((l) => bodyLike.has(l.group) && l.path.length > 8)
          .map((l) => ({ l, y: Array.from(l.path).reduce((t, v) => t + vy(v), 0) / l.path.length }))
          .sort((a, b) => b.y - a.y);
        return loops.length ? Array.from(loops[0].l.path) : [];
      })();
  const yWaist = waistPath.length
    ? waistPath.reduce((t, v) => t + vy(v), 0) / waistPath.length
    : yHi - 10;
  // The crotch: the lowest point of a seam between the two legs.
  let yCrotch: number | null = null;
  if (legs)
    for (const s of report.seams) {
      const ga = sideGroup(s.a);
      const gb = sideGroup(s.b);
      const across = (ga === 'LEG_L' && gb === 'LEG_R') || (ga === 'LEG_R' && gb === 'LEG_L');
      if (!across) continue;
      for (const v of [...s.pathA, ...s.pathB])
        if (yCrotch === null || vy(v) < yCrotch) yCrotch = vy(v);
    }
  if (legs && yCrotch !== null) {
    out.levels = {
      waist: yWaist,
      seat: yCrotch + 76,
      crotch: yCrotch,
      knee: (yCrotch + yLo) / 2,
      hem: yLo + 12,
    };
  } else {
    const H = yHi - yLo;
    out.levels = {
      top: yHi - 0.08 * H,
      upper: yHi - 0.3 * H,
      mid: yHi - 0.5 * H,
      lower: yHi - 0.75 * H,
      hem: yLo + 12,
    };
  }
  // ── widths / depths: x and z extent of the cloth within ± 8 mm of each level ──
  const extentAt = (y: number) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of cloth)
      for (let i = 0; i < p.count; i++) {
        const v = p.offset + i;
        if (Math.abs(vy(v) - y) > 8) continue;
        const x = P[3 * v];
        const z = P[3 * v + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
    return x1 >= x0 ? { w: x1 - x0, d: z1 - z0 } : { w: 0, d: 0 };
  };
  for (const [k, y] of Object.entries(out.levels)) {
    const e = extentAt(y);
    out.widths[k] = r1(e.w);
    out.depths[k] = r1(e.d);
  }
  if (legs && yCrotch !== null)
    out.widensSeatToHem =
      out.widths.hem > out.widths.seat && out.widths.hem > out.widths.knee * 0.98;

  // ── waist ring: convex hull perimeter of a path on the floor plane ──
  const hullMm = (path: number[]) => {
    const pts = path.map((v) => [P[3 * v], P[3 * v + 2]] as [number, number]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
        lower.pop();
      lower.push(p);
    }
    const upper: [number, number][] = [];
    for (const p of [...pts].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
        upper.pop();
      upper.push(p);
    }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    let ring = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      ring += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return ring;
  };
  if (waistPath.length >= 3) {
    const bandPath = bandSeam ? Array.from(bandOnA ? bandSeam.pathA : bandSeam.pathB) : null;
    const bandMm = bandSeam ? (bandOnA ? bandSeam.lenA : bandSeam.lenB) : null;
    const legsRing = hullMm(waistPath);
    const ring = bandPath && bandPath.length >= 3 ? hullMm(bandPath) : legsRing;
    out.ring = {
      ringMm: r1(ring),
      bandMm: bandMm === null ? null : r1(bandMm),
      diffPct: bandMm ? r1((100 * (ring - bandMm)) / bandMm) : null,
      legsMm: bandSeam ? r1(legsRing) : null,
      how: bandSeam
        ? `tape round the band's sewn edge of ${bandSeam.id} as drawn (convex hull) vs that edge at rest; legsMm = the same round the legs' side`
        : 'tape round the highest free loop of the body (no band seam)',
    };
  }
  if (bandSeam) {
    const bandMm = bandOnA ? bandSeam.lenA : bandSeam.lenB;
    const waistMm = bandOnA ? bandSeam.lenB : bandSeam.lenA;
    const folded = bandSeam.foldedMm ?? 0;
    const eff = waistMm - folded;
    out.band = {
      id: bandSeam.id
        .split('~')
        .map((side) =>
          side
            .split('+')
            .map((e) => `${nameOf(pk(e))}#${e.slice(e.lastIndexOf('#') + 1)}`)
            .join('+'),
        )
        .join(' ↔ '),
      state: bandSeam.state,
      gapP95Mm: r1(bandSeam.residualP95Mm),
      gapMaxMm: r1(bandSeam.residualMaxMm),
      bandMm: r1(bandMm),
      waistMm: r1(waistMm),
      foldedMm: r1(folded),
      easePct: r1((100 * Math.abs(bandMm - eff)) / Math.max(bandMm, eff, 1e-9)),
    };
  }

  // ── crumple index ──
  let waistN = 0;
  let waistC = 0;
  for (const p of solved) {
    let n = 0;
    let c = 0;
    const T = p.tris;
    const U = p.uv;
    for (let t = 0; t < T.length; t += 3) {
      const [a, b, cc] = [T[t], T[t + 1], T[t + 2]];
      const flat =
        Math.abs(
          (U[2 * b] - U[2 * a]) * (U[2 * cc + 1] - U[2 * a + 1]) -
            (U[2 * cc] - U[2 * a]) * (U[2 * b + 1] - U[2 * a + 1]),
        ) / 2;
      if (flat < 1e-6) continue;
      const A = p.offset + a;
      const B = p.offset + b;
      const C = p.offset + cc;
      const e1 = [P[3 * B] - P[3 * A], P[3 * B + 1] - P[3 * A + 1], P[3 * B + 2] - P[3 * A + 2]];
      const e2 = [P[3 * C] - P[3 * A], P[3 * C + 1] - P[3 * A + 1], P[3 * C + 2] - P[3 * A + 2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const area3 = Math.hypot(nx, ny, nz) / 2;
      const crumpled = area3 < 0.7 * flat;
      n++;
      if (crumpled) c++;
      const ym = (P[3 * A + 1] + P[3 * B + 1] + P[3 * C + 1]) / 3;
      if (ym >= yWaist - 100 && ym <= yWaist + 60) {
        waistN++;
        if (crumpled) waistC++;
      }
    }
    const pct = n ? r1((100 * c) / n) : 0;
    out.crumple.perPiece[nameOf(p.pieceKey)] = pct;
    if (!out.crumple.worst || pct > out.crumple.worst.pct)
      out.crumple.worst = { piece: nameOf(p.pieceKey), pct };
  }
  out.crumple.waistPct = waistN ? r1((100 * waistC) / waistN) : 0;

  // ── creases: dihedral angle over interior edges ──
  let cwN = 0;
  let cwC = 0;
  const COS60 = 0.5;
  for (const p of solved) {
    const T = p.tris;
    const nrm: number[][] = [];
    for (let t = 0; t < T.length; t += 3) {
      const A = p.offset + T[t];
      const B = p.offset + T[t + 1];
      const C = p.offset + T[t + 2];
      const e1 = [P[3 * B] - P[3 * A], P[3 * B + 1] - P[3 * A + 1], P[3 * B + 2] - P[3 * A + 2]];
      const e2 = [P[3 * C] - P[3 * A], P[3 * C + 1] - P[3 * A + 1], P[3 * C + 2] - P[3 * A + 2]];
      const n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nrm.push([n[0] / l, n[1] / l, n[2] / l, (P[3 * A + 1] + P[3 * B + 1] + P[3 * C + 1]) / 3]);
    }
    const byEdge = new Map<number, number>();
    let n = 0;
    let c = 0;
    for (let t = 0; t < T.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = T[t + e];
        const b = T[t + ((e + 1) % 3)];
        const k = a < b ? a * 1e6 + b : b * 1e6 + a;
        const o = byEdge.get(k);
        if (o === undefined) {
          byEdge.set(k, t / 3);
          continue;
        }
        const na = nrm[o];
        const nb = nrm[t / 3];
        const dot = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
        const crease = dot < COS60;
        n++;
        if (crease) c++;
        const ym = (na[3] + nb[3]) / 2;
        if (ym >= yWaist - 100 && ym <= yWaist + 60) {
          cwN++;
          if (crease) cwC++;
        }
      }
    }
    const pct = n ? r1((100 * c) / n) : 0;
    out.creases.perPiece[nameOf(p.pieceKey)] = pct;
    if (!out.creases.worst || pct > out.creases.worst.pct)
      out.creases.worst = { piece: nameOf(p.pieceKey), pct };
  }
  out.creases.waistPct = cwN ? r1((100 * cwC) / cwN) : 0;

  // ── surface pieces past their host's edge ──
  for (const s of report.surface ?? []) {
    if (!s.placed) continue;
    const m = s.note.match(/(\d+) % of it reaches past/);
    out.pastEdge.push({
      piece: nameOf(s.pieceKey),
      host: s.host ? nameOf(s.host) : null,
      pct: s.pastEdgePct ?? (m ? Number(m[1]) : 0),
    });
  }
}
writeFileSync(outJson, JSON.stringify(out, null, 1));

// ── scene for render-entry.ts (the same page yarn doll:check draws) ──
const sewn = new Set<number>();
for (const s of report.seams)
  if (s.state !== 'open' && s.state !== 'twisted')
    for (const v of [...s.pathA, ...s.pathB]) sewn.add(v);
const lines = [
  `${out.seams.closed}c ${out.seams.stretched}s ${out.seams.proposed}p ${out.seams.open}o ${out.seams.floating}f · ${(report.stats.ms / 1000).toFixed(1)} s`,
  out.band
    ? `band ${out.band.state} · gap p95 ${out.band.gapP95Mm} mm · ease ${out.band.easePct} %`
    : 'no band seam',
  out.ring ? `ring ${out.ring.ringMm} vs band ${out.ring.bandMm ?? '—'} mm` : '',
  `crumple waist ${out.crumple.waistPct} % · creases waist ${out.creases.waistPct} % · worst ${out.creases.worst?.piece ?? '—'} ${out.creases.worst?.pct ?? 0} %`,
  `widths ${Object.entries(out.widths)
    .map(([k, v]) => `${k} ${v.toFixed(0)}`)
    .join(' · ')}`,
].filter(Boolean);
const scene = {
  id: out.id,
  title: `${out.code || out.id} · shape`,
  honesty: report.honesty,
  lines,
  panels: report.panels.map((p) => ({
    key: p.pieceKey,
    group: p.group,
    pos: Array.from(P.subarray(3 * p.offset, 3 * (p.offset + p.count)), r1),
    tris: Array.from(p.tris),
    boundary: Array.from(p.boundary),
  })),
  seams: report.seams
    .filter((s) => s.origin !== 'layer' && s.pathA.length)
    .map((s) => {
      const open = s.state === 'open' || s.state === 'twisted';
      const side = (path: Uint32Array) => {
        if (open && [...path].filter((v) => sewn.has(v)).length >= 0.8 * path.length) return [];
        return Array.from(path).flatMap((v) => [r1(P[3 * v]), r1(P[3 * v + 1]), r1(P[3 * v + 2])]);
      };
      return { state: s.state, kind: s.kind, a: side(s.pathA), b: side(s.pathB) };
    })
    .filter((s) => s.a.length || s.b.length),
};
writeFileSync(outScene, JSON.stringify(scene));
