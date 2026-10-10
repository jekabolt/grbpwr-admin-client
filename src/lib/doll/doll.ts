// solveDoll — the paper doll end to end (design §3): groups → meshes → flat charts → wrap onto the
// pattern-derived proxy → phase 1 (body alone) → free loops → proposed inter-group joins + placing
// sleeves / collar / cuffs / bands on those loops → phase 2 (everything) → release seams that can only
// close by tearing the paper → report in words.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { Edge, EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';

import { buildChart, toChart, type Chart, type ChartSeam } from './chart';
import { groupPieces, type GroupedPiece, type GroupedSeam } from './groups';
import { findLoops, loopPath, type RawLoop } from './loops';
import { meshPiece, pointInPolygon, type PieceMesh } from './mesh';
import {
  pass,
  rowGaps,
  seamRows,
  strains,
  type Path,
  type Proxy,
  type SeamRows,
  type SolverSeam,
  type SolverState,
} from './solve';
import type {
  DollGroupId,
  DollInput,
  DollLoop,
  DollProxy,
  DollReport,
  DollSeamReport,
  DollSeamState,
  Vec3,
} from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const TAU = Math.PI * 2;
const CLEAR = 0; // the proxy is already EPS_WRAP smaller than the cloth: no extra gap (a gap stretches small tubes)
const EPS_WRAP = 0.04; // paper needs slack to wrap (design §3.3)
const ASPECT = 1.3; // chest wider than deep
const ARM_DEG = 42; // A-pose: arms 42° off vertical
const PROXY_K = 0.93; // proxies push to 93 % of the cloth's own girth: a guide, never a stretcher

type Panel = GroupedPiece & {
  idx: number;
  mesh: PieceMesh;
  offset: number;
  count: number;
  nb: number;
  ringPos: Map<number, number>;
  mirrored: boolean;
};

type Work = {
  id: string;
  a: EdgeId[];
  b: EdgeId[];
  kind: DollSeamReport['kind'];
  origin: DollSeamReport['origin'];
  A: Path;
  B: Path;
  same: boolean;
  aRange: [number, number];
  bRange: [number, number];
  rows: SeamRows;
  solver: SolverSeam;
  target: number;
  born: number;
  ramp: number;
  note: string;
  released?: boolean;
  closure?: boolean;
  /** Not solved: free edges facing each other, welded only for the loop topology, drawn open. */
  virtual?: boolean;
};

const HONESTY =
  'paper doll — shape approximate, no fabric, no body · seams pulled shut along the pattern · measures come from the pattern laid flat, never from this shape';

export function solveDoll(input: DollInput): DollReport {
  const t0 = now();
  const { graph, facts } = input;
  const opt = input.options ?? {};
  const warnings: string[] = [];
  const G = groupPieces(graph, facts, { lining: opt.lining, dropSeams: opt.dropSeams });
  warnings.push(...G.warnings);

  // ── meshes ───────────────────────────────────────────────────────────────────────────────
  const area = G.pieces.reduce((s, p) => s + Math.abs(p.geom.areaMm2), 0);
  const h =
    opt.gridMm ??
    Math.min(
      40,
      Math.max(9, Math.sqrt((2 * area) / (Math.sqrt(3) * (opt.targetVertices ?? 2200)))),
    );
  const panels: Panel[] = [];
  let N = 0;
  for (const p of G.pieces) {
    const g = p.geom;
    const keep = [...g.edges.flatMap((e) => [e.s, e.e]), ...g.notchIdx, ...g.corners];
    const mesh = meshPiece(g.rs, keep, h);
    const ringPos = new Map<number, number>();
    mesh.bRs.forEach((r, i) => ringPos.set(r, i));
    panels.push({
      ...p,
      idx: panels.length,
      mesh,
      offset: N,
      count: mesh.pts.length,
      nb: mesh.bRs.length,
      ringPos,
      mirrored: false,
    });
    N += mesh.pts.length;
  }
  const msMesh = now() - t0;
  const pos = new Float64Array(3 * N);
  const uv = new Float64Array(2 * N);
  const cuv = new Float64Array(2 * N); // chart coords
  const panelOf = new Int32Array(N).fill(-1);
  const ringOf = new Int32Array(N).fill(-1);
  const groupOfV: DollGroupId[] = new Array(N);
  for (const P of panels) {
    for (let i = 0; i < P.count; i++) {
      const v = P.offset + i;
      uv[2 * v] = P.mesh.pts[i][0];
      uv[2 * v + 1] = P.mesh.pts[i][1];
      panelOf[v] = P.idx;
      ringOf[v] = i < P.nb ? i : -1;
      groupOfV[v] = P.group;
    }
  }
  const panelByKey = new Map(panels.map((P) => [P.key, P]));
  const edgeById = new Map<string, Edge>();
  for (const P of panels) for (const e of P.geom.edges) edgeById.set(e.id, e);

  /** Boundary path of a run of edges (chains / composite parts concatenated). */
  const pathOf = (ids: EdgeId[]): Path | null => {
    const v: number[] = [];
    const s: number[] = [];
    for (const id0 of ids)
      for (const id of edgeIdsOf(id0)) {
        const P = panelByKey.get(pk(id));
        const e = edgeById.get(id);
        if (!P || !e) return null;
        const n = P.geom.rs.length;
        const ps = P.ringPos.get(((e.s % n) + n) % n);
        const pe = P.ringPos.get(((e.e % n) + n) % n);
        if (ps === undefined || pe === undefined) return null;
        let q = ps;
        for (let guard = 0; guard <= P.nb; guard++) {
          const gv = P.offset + q;
          if (v.length && v[v.length - 1] === gv) {
            // shared vertex of a chain
          } else {
            const prev = v.length ? v[v.length - 1] : -1;
            const d =
              prev >= 0 && panelOf[prev] === P.idx
                ? Math.hypot(uv[2 * gv] - uv[2 * prev], uv[2 * gv + 1] - uv[2 * prev + 1])
                : 0;
            v.push(gv);
            s.push((s.length ? s[s.length - 1] : 0) + d);
          }
          if (q === pe) break;
          q = (q + 1) % P.nb;
        }
      }
    if (v.length < 2) return null;
    return { v: Int32Array.from(v), s: Float64Array.from(s), len: s[s.length - 1] };
  };

  // ── charts ───────────────────────────────────────────────────────────────────────────────
  const groups = new Map<DollGroupId, Panel[]>();
  for (const P of panels) {
    if (!groups.has(P.group)) groups.set(P.group, []);
    groups.get(P.group)!.push(P);
  }
  const charts = new Map<DollGroupId, Chart>();
  const chartSeamOf = (s: GroupedSeam): ChartSeam | null => {
    const a = s.a.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    const b = s.b.map((id) => edgeById.get(id)).filter((e): e is Edge => !!e);
    if (!a.length || !b.length || a.length !== s.a.length || b.length !== s.b.length) return null;
    if (new Set(a.map((e) => e.pieceKey)).size > 1 || new Set(b.map((e) => e.pieceKey)).size > 1)
      return null;
    return { id: `${s.seam.a}~${s.seam.b}`, a, b, partial: s.seam.kind === 'partial' };
  };
  for (const [gid, list] of groups) {
    const keys = new Set(list.map((P) => P.key));
    const cs = G.seams
      .filter((s) => keys.has(pk(s.a[0])) && keys.has(pk(s.b[0])))
      .map(chartSeamOf)
      .filter((x): x is ChartSeam => !!x);
    const byArea = [...list].sort(
      (x, y) => Math.abs(y.geom.areaMm2) - Math.abs(x.geom.areaMm2) || x.key.localeCompare(y.key),
    );
    let root = byArea[0].key;
    if (gid === 'BODY') {
      root = (
        byArea.find((P) => P.role === 'back' && !P.geom.hand) ??
        byArea.find((P) => P.role === 'back') ??
        byArea[0]
      ).key;
    } else if (gid === 'LEG_L' || gid === 'LEG_R') {
      root = (byArea.find((P) => P.role === 'front') ?? byArea[0]).key;
    }
    let chart = buildChart(
      list.map((P) => P.geom),
      cs,
      root,
    );
    if (gid === 'BODY') {
      // Which way round does the strip run? Seen from outside, a back's drawing-left is the doll's
      // left. Some CAD exports draw backs as seen from the front (mirrored). Decide by the seams
      // first — the reading in which fewer over-the-top seams (shoulders) cross from the doll's left
      // to its right — and by the hands of the names only when the seams cannot tell.
      const rootP = list.find((P) => P.key === root)!;
      const rootIsFront = rootP.role === 'front';
      const judge = (ch: Chart) => {
        const comp = new Set(ch.components[0].keys);
        const ucOf = (k: string) => {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          const xs = g.rs.filter((_, i) => i % 10 === 0).map((q) => toChart(pl, q)[0]);
          return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        let u0 = Infinity;
        let u1 = -Infinity;
        for (const k of comp) {
          const g = list.find((P) => P.key === k)!.geom;
          const pl = ch.place.get(k)!;
          for (const q of g.rs.filter((_, i) => i % 10 === 0)) {
            const x = toChart(pl, q)[0];
            u0 = Math.min(u0, x);
            u1 = Math.max(u1, x);
          }
        }
        const W = Math.max(1, u1 - u0);
        const uR = ucOf(root);
        const th0 = rootIsFront ? 0 : Math.PI;
        const side = (u: number) => Math.sign(Math.sin(th0 + (TAU * (u - uR)) / W));
        const edgeU = (id: string) => {
          const e = edgeById.get(id);
          const pl = ch.place.get(pk(id));
          if (!e || !pl) return null;
          return toChart(pl, e.pts[Math.floor(e.pts.length / 2)])[0];
        };
        let crossings = 0;
        for (const sm of cs) {
          if (ch.used.has(sm.id)) continue;
          const ka = sm.a[0].pieceKey;
          const kb = sm.b[0].pieceKey;
          if (!comp.has(ka) || !comp.has(kb)) continue;
          const ua = edgeU(sm.a[0].id);
          const ub = edgeU(sm.b[0].id);
          if (ua === null || ub === null) continue;
          const sa = side(ua);
          const sb = side(ub);
          if (sa && sb && sa !== sb && Math.abs(ua - uR) > 0.05 * W && Math.abs(ub - uR) > 0.05 * W)
            crossings++;
        }
        let hands = 0;
        for (const P of list) {
          const hd = P.geom.hand;
          if (!hd || !comp.has(P.key)) continue;
          hands += (hd === 'L' ? 1 : -1) * Math.sign(ucOf(P.key) - uR) * (rootIsFront ? -1 : 1);
        }
        return { crossings, hands };
      };
      const a0 = judge(chart);
      const alt = buildChart(
        list.map((P) => P.geom),
        cs,
        root,
        true,
      );
      const a1 = judge(alt);
      // Names first (a reading that puts every left piece on the left makes the strip as drawn);
      // only pieces without hands fall back on the seams. A crossing that survives is reported.
      const pickAlt =
        (a0.hands > 0 && a1.hands < a0.hands) || (a0.hands === 0 && a1.crossings < a0.crossings);
      if (opt.debug)
        warnings.push(
          `debug: strip reading: as drawn ${a0.crossings} crossing / hands ${a0.hands}; mirrored ${a1.crossings} / ${a1.hands} → ${pickAlt ? 'mirrored' : 'as drawn'}`,
        );
      if (pickAlt) {
        chart = alt;
        warnings.push(
          a0.hands === 0
            ? `no hands in the names — the body is laid the way its shoulder seams do not cross`
            : `the pieces are drawn face down relative to their names (backs drawn as seen from the front?) — the body is laid mirrored so left stays left`,
        );
      }
    }
    charts.set(gid, chart);
    for (const P of list) {
      const pl = chart.place.get(P.key)!;
      P.mirrored = pl.mirror;
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const c = toChart(pl, [uv[2 * v], uv[2 * v + 1]]);
        cuv[2 * v] = c[0];
        cuv[2 * v + 1] = c[1];
      }
    }
  }
  if (opt.debug)
    for (const [gid, ch] of charts)
      warnings.push(
        `debug: chart ${gid}: ${ch.components.map((c) => `[${c.keys.map((k) => `${k}${ch.place.get(k)!.mirror ? '(m)' : ''}@${ch.place.get(k)!.dx.toFixed(0)},${ch.place.get(k)!.dy.toFixed(0)}`).join(' ')}]`).join(' ')}${ch.rejected.length ? ` · refused: ${ch.rejected.join('; ')}` : ''}`,
      );
  const compOfKey = new Map<string, number>();
  for (const ch of charts.values())
    ch.components.forEach((c, i) => c.keys.forEach((k) => compOfKey.set(k, i)));

  // Chart helpers: horizontal crossings of a set of panels at level v (chart coords).
  const boundaryChart = (P: Panel) => {
    const out: [number, number][] = [];
    for (let r = 0; r < P.nb; r++) out.push([cuv[2 * (P.offset + r)], cuv[2 * (P.offset + r) + 1]]);
    return out;
  };
  const crossings = (list: Panel[], v: number) => {
    const iv: [number, number][] = [];
    for (const P of list) {
      const ring = boundaryChart(P);
      const xs: number[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[1] > v !== b[1] > v) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((x, y) => x - y);
      for (let k = 0; k + 1 < xs.length; k += 2) iv.push([xs[k], xs[k + 1]]);
    }
    iv.sort((x, y) => x[0] - y[0]);
    return iv;
  };
  const extent = (iv: [number, number][]) =>
    iv.length ? [Math.min(...iv.map((x) => x[0])), Math.max(...iv.map((x) => x[1]))] : null;
  const coverage = (iv: [number, number][]) => {
    const e = extent(iv);
    if (!e) return 0;
    let cov = 0;
    let end = -Infinity;
    for (const [a, b] of iv) {
      if (b <= end) continue;
      cov += b - Math.max(a, end);
      end = b;
    }
    return cov / Math.max(1, e[1] - e[0]);
  };
  /** Chart extent per level, cached on a 5 mm grid (proxies call it per vertex per pass). */
  const widthTable = (list: Panel[], lo: number, hi: number, fallback: number) => {
    const step = 5;
    const n = Math.max(2, Math.ceil((hi - lo) / step) + 1);
    const t = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const v = Math.max(lo + 2, Math.min(lo + k * step, hi - 2));
      const e = extent(crossings(list, v));
      t[k] = e ? e[1] - e[0] : NaN;
    }
    for (let k = 1; k < n; k++) if (Number.isNaN(t[k])) t[k] = t[k - 1];
    for (let k = n - 2; k >= 0; k--) if (Number.isNaN(t[k])) t[k] = t[k + 1];
    for (let k = 0; k < n; k++) if (Number.isNaN(t[k])) t[k] = fallback;
    return (v: number) => {
      const f = (v - lo) / step;
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const w = Math.max(0, Math.min(1, f - i));
      return t[i] * (1 - w) + t[i + 1] * w;
    };
  };
  const vRange = (list: Panel[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        const y = cuv[2 * (P.offset + r) + 1];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    return [lo, hi];
  };
  const setPos = (v: number, p: Vec3) => {
    pos[3 * v] = p[0];
    pos[3 * v + 1] = p[1];
    pos[3 * v + 2] = p[2];
  };
  const getPos = (v: number): Vec3 => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];

  const proxies: Proxy[] = [];
  const proxyOf = new Int32Array(N).fill(-1);
  const proxyReport: DollProxy[] = [];
  const placed = new Uint8Array(N);

  // ── seams as work items ──────────────────────────────────────────────────────────────────
  const works: Work[] = [];
  const meanDist = (
    A: Path,
    B: Path,
    same: boolean,
    aR: [number, number],
    bR: [number, number],
  ) => {
    const r = seamRows(A, B, same, aR, bR);
    const g = rowGaps(pos, r);
    return g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
  };
  /** Build a work item; direction (and partial anchor) by the smaller initial gap. */
  const addWork = (
    w: Omit<Work, 'rows' | 'solver' | 'same' | 'aRange' | 'bRange' | 'born' | 'ramp'> & {
      partial?: boolean;
      gap?: number;
      forceSame?: boolean;
    },
    passNow: number,
    ramp: number,
  ) => {
    const options: { same: boolean; aR: [number, number]; bR: [number, number] }[] = [];
    const ratio = Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
    const sames = w.forceSame === undefined ? [false, true] : [w.forceSame];
    // (graph seams pass forceSame: face-up pieces are sewn with their edges running opposite ways)
    for (const same of sames) {
      if (w.partial && ratio < 0.97) {
        const aShort = w.A.len < w.B.len;
        for (const anchor of [0, 1]) {
          const sub: [number, number] = anchor === 0 ? [0, ratio] : [1 - ratio, 1];
          options.push(aShort ? { same, aR: [0, 1], bR: sub } : { same, aR: sub, bR: [0, 1] });
        }
      } else options.push({ same, aR: [0, 1], bR: [0, 1] });
    }
    let best = options[0];
    let bd = Infinity;
    for (const o of options) {
      const d = meanDist(w.A, w.B, o.same, o.aR, o.bR);
      if (d < bd - 1e-6) [best, bd] = [o, d];
    }
    const rows = seamRows(w.A, w.B, best.same, best.aR, best.bR);
    const solver: SolverSeam = { rows, k: 0, active: true, gap: w.gap ?? 0 };
    const item: Work = {
      ...w,
      same: best.same,
      aRange: best.aR,
      bRange: best.bR,
      rows,
      solver,
      born: passNow,
      ramp,
    };
    works.push(item);
    return item;
  };

  // ── BODY / LEGS placement ───────────────────────────────────────────────────────────────
  const body = groups.get('BODY') ?? [];
  const bodyChart = charts.get('BODY');
  let vArm = 0;
  let vSh = 0;
  let vLo = 0;
  let neckR = 60;
  const torso: { y: number; a: number; b: number; tab: Float64Array }[] = [];
  const ellPerimFactor = (() => {
    const b = 1 / ASPECT;
    return Math.PI * (3 * (1 + b) - Math.sqrt((3 + b) * (1 + 3 * b)));
  })();
  const arcTable = (a: number, b: number) => {
    const K = 96;
    const t = new Float64Array(K + 1);
    let px = 0;
    let pz = b;
    for (let k = 1; k <= K; k++) {
      const ph = (TAU * k) / K;
      const x = a * Math.sin(ph);
      const z = b * Math.cos(ph);
      t[k] = t[k - 1] + Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    return t;
  };
  const torsoAt = (y: number) => {
    if (!torso.length) return null;
    const step = torso.length > 1 ? torso[1].y - torso[0].y : 10;
    const f = (y - torso[0].y) / step;
    const i = Math.max(0, Math.min(torso.length - 1, Math.floor(f)));
    return torso[i];
  };
  /** Point on the torso at azimuth θ (0 = front, π = back, + toward the doll's right at the back). */
  const torsoPoint = (theta: number, y: number, off: number): Vec3 => {
    const L = torsoAt(y)!;
    const tab = L.tab;
    const K = tab.length - 1;
    let fr = (((theta % TAU) + TAU) % TAU) / TAU;
    const target = fr * tab[K];
    let lo = 0;
    let hi = K;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tab[m] <= target) lo = m;
      else hi = m;
    }
    fr = (lo + (target - tab[lo]) / Math.max(1e-9, tab[hi] - tab[lo])) / K;
    const ph = fr * TAU;
    const x = L.a * Math.sin(ph);
    const z = L.b * Math.cos(ph);
    const nx = x / (L.a * L.a);
    const nz = z / (L.b * L.b);
    const nl = Math.hypot(nx, nz) || 1;
    return [x + (nx / nl) * off, y, z + (nz / nl) * off];
  };

  // The two far ends of the body ring when girth components continue the main strip.
  const ringEnds: { left: Panel[] | null; right: Panel[] | null } = { left: null, right: null };
  if (body.length && bodyChart) {
    const comps = bodyChart.components.map((c) => c.keys.map((k) => panelByKey.get(k)!));
    // Later components: height from their seams to what is already aligned.
    const aligned = new Set(comps[0].map((P) => P.key));
    for (let ci = 1; ci < comps.length; ci++) {
      const own = new Set(comps[ci].map((P) => P.key));
      let sum = 0;
      let n = 0;
      for (const s of G.seams) {
        const ka = pk(s.a[0]);
        const kb = pk(s.b[0]);
        const [mine, theirs] =
          own.has(ka) && aligned.has(kb)
            ? [s.a, s.b]
            : own.has(kb) && aligned.has(ka)
              ? [s.b, s.a]
              : [null, null];
        if (!mine || !theirs) continue;
        const pm = pathOf(mine);
        const pt = pathOf(theirs);
        if (!pm || !pt) continue;
        const mv = [...pm.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pm.v.length;
        const tv = [...pt.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pt.v.length;
        sum += tv - mv;
        n++;
      }
      if (n) {
        const dy = sum / n;
        for (const P of comps[ci])
          for (let i = 0; i < P.count; i++) cuv[2 * (P.offset + i) + 1] += dy;
        for (const P of comps[ci]) aligned.add(P.key);
      }
    }
    const main = comps[0];
    const [lo, hi] = vRange(body.filter((P) => aligned.has(P.key)));
    const [mlo] = vRange(main);
    vLo = mlo;
    const H = hi - lo;
    // Armhole level: the lowest level (above 40 % of the height) where the main strip has holes.
    vArm = hi - 0.27 * H;
    for (let v = mlo + 0.4 * H; v < hi; v += 10) {
      if (
        coverage(crossings(main, v)) < 0.86 &&
        coverage(crossings(main, v + 10)) < 0.86 &&
        coverage(crossings(main, v + 20)) < 0.86
      ) {
        vArm = v;
        break;
      }
    }
    // Shoulder line: the seams that go over the top (body seams not used by the chart, high up).
    const over: number[] = [];
    for (const s of G.seams) {
      if (!aligned.has(pk(s.a[0])) || !aligned.has(pk(s.b[0]))) continue;
      if (bodyChart.used.has(`${s.seam.a}~${s.seam.b}`)) continue;
      const pa = pathOf(s.a);
      if (!pa) continue;
      const mv = [...pa.v].reduce((t, v) => t + cuv[2 * v + 1], 0) / pa.v.length;
      if (mv > vArm) over.push(mv);
    }
    vSh = over.length ? over.reduce((x, y) => x + y, 0) / over.length : hi - 0.03 * H;
    vSh = Math.max(vSh, vArm + 60);
    // Girth per level: every aligned component's extent; above the armhole the armhole girth.
    const levels: number[] = [];
    for (let v = mlo - 30; v <= vSh + 20; v += 10) levels.push(v);
    const girth = levels.map((v) => {
      const vv = Math.min(v, vArm);
      let w = 0;
      for (const c of comps) {
        if (!c.every((P) => aligned.has(P.key))) continue;
        const e = extent(crossings(c, Math.max(vv, mlo + 2)));
        if (e) w += e[1] - e[0];
      }
      return w;
    });
    // Below the level where the strip is whole (curved hems, short side panels), keep that girth.
    {
      const band = levels
        .map((v, i) => [v, girth[i]] as const)
        .filter(([v]) => v >= mlo + 0.1 * H && v <= vArm)
        .map(([, w]) => w)
        .sort((x, y) => x - y);
      const med = band.length ? band[Math.floor(band.length / 2)] : 0;
      const i10 = girth.findIndex((w, i) => levels[i] >= mlo && w >= 0.85 * med);
      if (i10 > 0) for (let i = 0; i < i10; i++) girth[i] = girth[i10];
    }
    // Fill and smooth.
    for (let i = 1; i < girth.length; i++) if (girth[i] <= 0) girth[i] = girth[i - 1];
    for (let i = girth.length - 2; i >= 0; i--) if (girth[i] <= 0) girth[i] = girth[i + 1];
    const sm = girth.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j < 0 || j >= girth.length) continue;
        s += girth[j];
        n++;
      }
      return s / n;
    });
    const iArm = Math.max(
      0,
      levels.findIndex((v) => v >= vArm),
    );
    const aArm = (sm[iArm] * (1 - EPS_WRAP)) / ellPerimFactor;
    levels.forEach((v, i) => {
      let a = (sm[i] * (1 - EPS_WRAP)) / ellPerimFactor;
      let b = a / ASPECT;
      if (v > vArm) {
        // Above the armhole the paper is not forced onto a dome (a doubly curved surface crumples
        // paper): the cylinder goes on, the shoulder seams tilt the panels in like a roof.
        a = aArm;
        b = aArm / ASPECT;
      }
      torso.push({ y: v, a, b, tab: arcTable(a, b) });
    });
    proxyReport.push({
      group: 'BODY',
      kind: 'torso',
      profile: torso.map((L) => [L.y - vLo, L.a, L.b]),
    });
    neckR = Math.max(45, 0.42 * aArm);

    // The torso proxy.
    // Neck: a short cylinder on top of the dome keeps the shoulders' paper from folding inward.
    const rNeck = Math.max(45, 0.42 * aArm);
    const tProxy: Proxy = {
      push(p, i) {
        const y = p[3 * i + 1];
        if (y > vSh - 40 && y < vSh + 220) {
          const x = p[3 * i];
          const z = p[3 * i + 2];
          const d = Math.hypot(x, z);
          const R = rNeck + CLEAR - 1;
          if (d < R && d > 1e-6) {
            p[3 * i] = (x / d) * R;
            p[3 * i + 2] = (z / d) * R;
          }
        }
        if (y < torso[0].y || y > vArm + 0.35 * (vSh - vArm)) return;
        const L = torsoAt(y)!;
        const a = L.a * PROXY_K;
        const b = L.b * PROXY_K;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q >= 1 || q < 1e-9) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] = x * f;
        p[3 * i + 2] = z * f;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1];
        if (y < torso[0].y || y > vArm) return;
        const L = torsoAt(y)!;
        const a = L.a + CLEAR;
        const b = L.b + CLEAR;
        const x = p[3 * i];
        const z = p[3 * i + 2];
        const q = (x / a) ** 2 + (z / b) ** 2;
        if (q <= 1) return;
        const f = 1 / Math.sqrt(q);
        p[3 * i] += (x * f - x) * k;
        p[3 * i + 2] += (z * f - z) * k;
      },
    };
    const tIdx = proxies.push(tProxy) - 1;

    // Wrap: main strip centred on its root at the back; other components where their seams want.
    const totalW = (v: number) => (torsoAt(Math.min(v, vArm))!.a * ellPerimFactor) / (1 - EPS_WRAP);
    const rootP = panelByKey.get(bodyChart.components[0].root)!;
    let uRef = 0;
    {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let r = 0; r < rootP.nb; r++) {
        const x = cuv[2 * (rootP.offset + r)];
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
      uRef = (x0 + x1) / 2;
    }
    const thetaBack = rootP.role === 'front' ? 0 : Math.PI;
    if (!body.some((P) => P.role === 'back' || P.role === 'front'))
      warnings.push(
        'front unknown — no piece is named front or back; the biggest piece is put at the back',
      );
    const wrapComp = (list: Panel[], theta0: number, uC: number, layer: number) => {
      for (const P of list) {
        // Above the armhole each piece keeps its own width (arc length) around its centre: the dome
        // is smaller than the strip there, the armholes absorb the difference, the paper does not.
        let ux0 = Infinity;
        let ux1 = -Infinity;
        for (let r = 0; r < P.nb; r++) {
          ux0 = Math.min(ux0, cuv[2 * (P.offset + r)]);
          ux1 = Math.max(ux1, cuv[2 * (P.offset + r)]);
        }
        const uP = (ux0 + ux1) / 2;
        const thP = theta0 + (TAU * (uP - uC)) / totalW(vArm);
        for (let i = 0; i < P.count; i++) {
          const v = P.offset + i;
          const u = cuv[2 * v];
          const y = cuv[2 * v + 1];
          const yy = Math.max(torso[0].y, Math.min(y, vSh + 200));
          let th: number;
          if (y <= vArm) th = theta0 + (TAU * (u - uC)) / totalW(y);
          else {
            const per = torsoAt(yy)!.tab[torsoAt(yy)!.tab.length - 1];
            th = thP + (TAU * (u - uP) * (1 - EPS_WRAP)) / per;
          }
          setPos(v, torsoPoint(th, yy, CLEAR + layer + (P.role === 'placket' ? 2 : 0)));
          if (y > vSh + 10) pos[3 * v + 1] = y; // above the shoulder line: keep the height
          proxyOf[v] = tIdx;
          placed[v] = 1;
        }
      }
    };
    wrapComp(main, thetaBack, uRef, 0);
    // Later components. Girth pieces (a front chain the side seam does not join) continue the main
    // strip at the end their hand says; the rest (a yoke) go where their seams want them, on the side
    // their role says (back / front).
    const [mlo2, mhi2] = vRange(main);
    const mainU = (() => {
      const e = extent(crossings(main, mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2)));
      return e ?? [uRef - 100, uRef + 100];
    })();
    const vMid = mlo2 + 0.45 * (Math.min(vArm, mhi2) - mlo2);
    const thMain = (u: number) => thetaBack + (TAU * (u - uRef)) / totalW(vMid);
    let endL = Math.min(thMain(mainU[0]), thMain(mainU[1]));
    let endR = Math.max(thMain(mainU[0]), thMain(mainU[1]));
    let flip = 0;
    for (let ci = 1; ci < comps.length; ci++) {
      const list = comps[ci];
      if (!list.every((P) => aligned.has(P.key))) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const P of list)
        for (let r = 0; r < P.nb; r++) {
          x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
          x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
        }
      const uC = (x0 + x1) / 2;
      const [clo, chi] = vRange(list);
      const below = Math.max(0, Math.min(chi, vArm) - Math.max(clo, mlo2));
      const W = totalW(vMid);
      if (below > 0.4 * (chi - clo)) {
        let hand = 0;
        for (const P of list) hand += P.geom.hand === 'L' ? 1 : P.geom.hand === 'R' ? -1 : 0;
        const goLeft = hand > 0 || (hand === 0 && flip++ % 2 === 1);
        const gap = (TAU * 15) / W;
        const span = (TAU * (x1 - x0)) / W;
        // Face-up at the back: +u runs toward the doll's right (θ grows), so a left chain ends at endL.
        if (goLeft) {
          wrapComp(list, endL - gap - span / 2, uC, 0);
          endL -= gap + span;
          ringEnds.left = list;
        } else {
          wrapComp(list, endR + gap + span / 2, uC, 0);
          endR += gap + span;
          ringEnds.right = list;
        }
        continue;
      }
      const keys = new Set(list.map((P) => P.key));
      const links = G.seams.filter((s) => keys.has(pk(s.a[0])) !== keys.has(pk(s.b[0])));
      const roleBack = list.some((P) => P.role === 'back' || P.role === 'yoke');
      const roleFront = list.some((P) => P.role === 'front' || P.role === 'placket');
      const centre = roleBack ? thetaBack : roleFront ? thetaBack + Math.PI : null;
      // The component may be drawn the other way round from the main strip: try it mirrored too.
      const remirror = () => {
        for (const P of list) {
          P.mirrored = !P.mirrored;
          for (let i = 0; i < P.count; i++)
            cuv[2 * (P.offset + i)] = 2 * uC - cuv[2 * (P.offset + i)];
        }
      };
      let best = centre ?? 0;
      let bestMir = false;
      let bd = Infinity;
      const trials = [false, true];
      for (const mir of trials) {
        if (mir) remirror();
        for (let k = 0; k < (centre === null ? 24 : 1); k++) {
          void 0;
          // A back / yoke piece sits at the centre back, a front piece at the centre front: its
          // seams then say whether it is sewn the right way round (crossing seams are reported).
          const th = centre === null ? (TAU * k) / 24 : centre;
          wrapComp(list, th, uC, 3);
          let d = 0;
          for (const s of links) {
            const A = pathOf(s.a);
            const B = pathOf(s.b);
            if (!A || !B) continue;
            const same =
              (panelByKey.get(pk(s.a[0]))?.mirrored ?? false) !==
              (panelByKey.get(pk(s.b[0]))?.mirrored ?? false);
            d += meanDist(A, B, same, [0, 1], [0, 1]);
          }
          if (d < bd - 1e-6) [best, bestMir, bd] = [th, mir, d];
        }
      }
      if (trials.length === 2 && !bestMir) remirror();
      wrapComp(list, best, uC, 3);
      if (opt.debug) {
        const vs = list.flatMap((P) => Array.from({ length: P.count }, (_, i) => P.offset + i));
        const c = [0, 1, 2].map((q) => vs.reduce((t, v) => t + pos[3 * v + q], 0) / vs.length);
        warnings.push(
          `debug: secondary ${list.map((P) => P.key).join('+')} at θ ${((best * 180) / Math.PI).toFixed(0)}° centroid ${c.map((x) => x.toFixed(0)).join(',')} chart v ${clo.toFixed(0)}..${chi.toFixed(0)}`,
        );
      }
    }
    for (const P of body) {
      if (placed[P.offset]) continue;
      warnings.push(`${P.key} is in the body group but not sewn to it — placed apart`);
      P.group = 'FLOAT';
      for (let i = 0; i < P.count; i++) groupOfV[P.offset + i] = 'FLOAT';
    }
  }

  // Legs: two tubes under the hip, inseam inward.
  const legInfo: { gid: DollGroupId; s: number; x: number; R: number }[] = [];
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[]) {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const s = gid === 'LEG_L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const H = hi - lo;
    const vCr = hi - 0.27 * H;
    const W = widthTable(main, lo, hi, 300);
    const Rcr = (W(vCr - 40) * (1 - EPS_WRAP)) / TAU;
    const xAxis = s * (Rcr + 12);
    // Inseam: the chart seam between the first two pieces.
    let uRef = 0;
    const used = [...ch.used][0];
    const us = used ? G.seams.find((x) => `${x.seam.a}~${x.seam.b}` === used) : undefined;
    const up = us ? pathOf(us.a) : null;
    if (up) uRef = [...up.v].reduce((t, v) => t + cuv[2 * v], 0) / up.v.length;
    else {
      const e = extent(crossings(main, vCr - 40));
      uRef = e ? e[0] : 0;
    }
    const legProxy: Proxy = {
      push(p, i) {
        const y = p[3 * i + 1] - lo;
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const d = Math.hypot(dx, dz);
        const R = (y < vCr - lo ? (W(y + lo) * (1 - EPS_WRAP)) / TAU : Rcr) * PROXY_K;
        if (y > H + 10 || d >= R || d < 1e-9) return;
        p[3 * i] = xAxis + (dx / d) * R;
        p[3 * i + 2] = (dz / d) * R;
      },
      pull(p, i, k) {
        const y = p[3 * i + 1] - lo;
        if (y > vCr - lo) return;
        const dx = p[3 * i] - xAxis;
        const dz = p[3 * i + 2];
        const d = Math.hypot(dx, dz);
        const R = (W(y + lo) * (1 - EPS_WRAP)) / TAU + CLEAR;
        if (d <= R) return;
        p[3 * i] -= (dx / d) * (d - R) * k;
        p[3 * i + 2] -= (dz / d) * (d - R) * k;
      },
    };
    const pi = proxies.push(legProxy) - 1;
    proxyReport.push({
      group: gid,
      kind: 'capsule',
      profile: [[0, Rcr, Rcr]],
      origin: [xAxis, 0, 0],
      axis: [0, 1, 0],
    });
    for (const P of list) {
      const inMain = main.includes(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const y = cuv[2 * v + 1];
        const Wv = W(y);
        const R = (Wv * (1 - EPS_WRAP)) / TAU + CLEAR + (inMain ? 0 : 3);
        const th = (TAU * (u - uRef)) / Wv;
        setPos(v, [xAxis - s * R * Math.cos(th), y - lo, s * R * Math.sin(th)]);
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    legInfo.push({ gid, s, x: xAxis, R: Rcr });
    vLo = 0;
  }

  // ── constraints (distances) ─────────────────────────────────────────────────────────────
  const di: number[] = [];
  const dj: number[] = [];
  const dr: number[] = [];
  const dk: number[] = [];
  const bi: number[] = [];
  const bj: number[] = [];
  const br: number[] = [];
  const bk: number[] = [];
  const built = new Set<number>();
  const li: number[] = [];
  const lj: number[] = [];
  const lr: number[] = [];
  const buildPanel = (P: Panel) => {
    if (built.has(P.idx)) return;
    built.add(P.idx);
    const T = P.mesh.tris;
    const edgeOpp = new Map<number, number>();
    const seen = new Set<number>();
    const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const addD = (a: number, b: number) => {
      const k = key(a, b);
      if (seen.has(k)) return;
      seen.add(k);
      const A = P.offset + a;
      const B = P.offset + b;
      di.push(A);
      dj.push(B);
      dr.push(Math.hypot(uv[2 * B] - uv[2 * A], uv[2 * B + 1] - uv[2 * A + 1]));
      dk.push(1);
    };
    for (let t = 0; t < T.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = T[t + e];
        const b = T[t + ((e + 1) % 3)];
        const c = T[t + ((e + 2) % 3)];
        addD(a, b);
        const k = key(a, b);
        const o = edgeOpp.get(k);
        if (o === undefined) edgeOpp.set(k, c);
        else {
          const A = P.offset + o;
          const B = P.offset + c;
          bi.push(A);
          bj.push(B);
          br.push(Math.hypot(uv[2 * B] - uv[2 * A], uv[2 * B + 1] - uv[2 * A + 1]));
          bk.push(0.03);
        }
      }
    }
    for (let r = 0; r < P.nb; r++) addD(r, (r + 1) % P.nb);
    // Long-range limits: each other vertex to the vertex ~4 h away in three directions, when the
    // straight line between them stays inside the piece.
    const cell = h;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < P.count; i++) {
      const k = `${Math.floor(P.mesh.pts[i][0] / cell)},${Math.floor(P.mesh.pts[i][1] / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    }
    const ring = P.mesh.pts.slice(0, P.nb);
    const near = (x: number, y: number) => {
      let best = -1;
      let bd = (0.7 * h) ** 2;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      for (let a = gx - 1; a <= gx + 1; a++)
        for (let b = gy - 1; b <= gy + 1; b++)
          for (const j of grid.get(`${a},${b}`) ?? []) {
            const d = (P.mesh.pts[j][0] - x) ** 2 + (P.mesh.pts[j][1] - y) ** 2;
            if (d < bd) [best, bd] = [j, d];
          }
      return best;
    };
    for (let i = 0; i < P.count; i += 2) {
      const [x, y] = P.mesh.pts[i];
      for (const deg of [0, 60, 120]) {
        const r = (deg * Math.PI) / 180;
        const D = 5 * h;
        const j = near(x + D * Math.cos(r), y + D * Math.sin(r));
        if (j < 0 || j === i) continue;
        const ok = [0.25, 0.5, 0.75].every((t) =>
          pointInPolygon([x + (P.mesh.pts[j][0] - x) * t, y + (P.mesh.pts[j][1] - y) * t], ring),
        );
        if (!ok) continue;
        li.push(P.offset + i);
        lj.push(P.offset + j);
        lr.push(Math.hypot(P.mesh.pts[j][0] - x, P.mesh.pts[j][1] - y));
      }
    }
  };

  let state: SolverState | null = null;
  const anchor = new Float64Array(3 * N);
  const anchorK = new Float32Array(N);
  const moving = new Uint8Array(N);
  const makeState = () => {
    const nS = di.length;
    state = {
      pos,
      di: Int32Array.from([...di, ...bi]),
      dj: Int32Array.from([...dj, ...bj]),
      rest: Float64Array.from([...dr, ...br]),
      dk: Float64Array.from([...dk, ...bk]),
      nStretch: nS,
      omega: 1.0,
      li: Int32Array.from(li),
      lj: Int32Array.from(lj),
      lrest: Float64Array.from(lr),
      seams: works.map((w) => w.solver),
      proxyOf,
      proxies,
      moving,
      pullK: 0,
      anchor,
      anchorK,
    };
    return state;
  };

  let passes = 0;
  const maxPasses = opt.maxPasses ?? 1800;
  // The settle loop may run past maxPasses (up to settlePasses more).
  let passCap = maxPasses;
  const run = (n: number) => {
    const S = makeState();
    for (let k = 0; k < n && passes < passCap; k++) {
      for (const w of works) {
        if (w.released || w.virtual) {
          w.solver.active = false;
          continue;
        }
        const r = Math.min(1, (passes - w.born + 1) / Math.max(1, w.ramp));
        w.solver.k = w.target * (0.05 + 0.95 * r);
      }
      pass(S, 1);
      passes++;
      if (opt.onFrame && passes % 20 === 0) opt.onFrame(Float32Array.from(pos), passes);
    }
  };

  // ── release seams that could only close by tearing the paper ────────────────────────────
  const seamStretch = (w: Work, st: Float64Array, S0: SolverState) => {
    const nbr = new Map<number, number[]>();
    // The seam's own run, without its last 12 % at each end (corners belong to the next seam).
    const inner = (P: Path) =>
      [...P.v].filter((_, k) => P.len <= 0 || (P.s[k] >= 0.12 * P.len && P.s[k] <= 0.88 * P.len));
    const vs = new Set<number>([...inner(w.A), ...inner(w.B)]);
    for (let c = 0; c < S0.nStretch; c++) {
      for (const x of [S0.di[c], S0.dj[c]]) {
        if (!vs.has(x)) continue;
        if (!nbr.has(x)) nbr.set(x, []);
        nbr.get(x)!.push(c);
      }
    }
    const vals: number[] = [];
    for (const list of nbr.values()) for (const c of list) vals.push(st[c]);
    vals.sort((x, y) => x - y);
    return vals.length ? vals[Math.floor(0.9 * (vals.length - 1))] : 0;
  };
  const measure = (w: Work) => {
    const g = rowGaps(pos, w.rows);
    const mean = g.reduce((x, y) => x + y, 0) / Math.max(1, g.length);
    const max = g.length ? Math.max(...g) : 0;
    const srt = [...g].sort((x, y) => x - y);
    const p95 = srt.length ? srt[Math.floor(0.95 * (srt.length - 1))] : 0;
    return {
      mean: Math.max(0, mean - w.solver.gap),
      max: Math.max(0, max - w.solver.gap),
      p95: Math.max(0, p95 - w.solver.gap),
    };
  };
  const releaseRounds = (rounds: number, settle: number, gapMax: number, strainMax: number) => {
    for (let round = 0; round < rounds; round++) {
      const S0 = makeState();
      const st = strains(S0);
      let worst: Work | null = null;
      let ws = 0;
      let worstSp = 0;
      for (const w of works) {
        if (w.released || w.origin !== 'graph' || w.closure || !w.solver.active) continue;
        if (!w.A.v.every((v) => moving[v]) && !w.B.v.every((v) => moving[v])) continue;
        const m = measure(w);
        // Strain beyond the seam's own ease (paper cannot gather a sleeve cap or a pleat).
        const ease =
          w.aRange[1] - w.aRange[0] < 0.999 || w.bRange[1] - w.bRange[0] < 0.999
            ? 0
            : 1 - Math.min(w.A.len, w.B.len) / Math.max(w.A.len, w.B.len, 1e-9);
        const sp = Math.max(0, seamStretch(w, st, S0) * 100 - ease * 100);
        if (m.max < gapMax && sp < strainMax) continue;
        const score = m.mean + 3 * sp;
        if (score > ws) [worst, ws, worstSp] = [w, score, sp];
      }
      if (!worst || passes >= passCap) break;
      const m = measure(worst);
      worst.released = true;
      worst.note = `would close only by tearing the paper (gap ${m.max.toFixed(0)} mm, strain ${worstSp.toFixed(0)} %) — released so the rest can settle; a wrong pairing?`;
      run(Math.min(settle, passCap - passes));
    }
  };

  // ── phase 1: body (+ legs) with its own seams and the CF closure ────────────────────────
  const bodyLike = new Set<DollGroupId>(['BODY', 'LEG_L', 'LEG_R']);
  const inGroups = (ids: EdgeId[], set: Set<DollGroupId>) =>
    ids.every((id) => {
      const P = panelByKey.get(pk(id));
      return !!P && set.has(P.group);
    });
  const edgeUsed = (id: EdgeId) =>
    works.some((w) => !w.released && (w.a.includes(id) || w.b.includes(id)));
  const graphWork = (s: GroupedSeam, born: number, closure = false) => {
    const A = pathOf(s.a);
    const B = pathOf(s.b);
    if (!A || !B) return null;
    const lenA = A.len;
    const lenB = B.len;
    return addWork(
      {
        id: `${s.seam.a}~${s.seam.b}`,
        a: s.a,
        b: s.b,
        kind: s.seam.kind,
        origin: 'graph',
        A,
        B,
        target: closure ? 0.5 : 1,
        note: closure ? 'closure (buttons / zip) — drawn closed with a small gap' : '',
        closure,
        partial: s.seam.kind === 'partial' || Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.9,
        gap: closure ? 4 : 0,
        forceSame:
          (panelByKey.get(pk(s.a[0]))?.mirrored ?? false) !==
          (panelByKey.get(pk(s.b[0]))?.mirrored ?? false),
      },
      born,
      closure
        ? 60
        : charts.get(panelByKey.get(pk(s.a[0]))!.group)?.used.has(`${s.seam.a}~${s.seam.b}`)
          ? 40
          : 380,
    );
  };
  for (const P of panels) if (bodyLike.has(P.group)) buildPanel(P);
  const crossing: { s: GroupedSeam; xa: number; xb: number }[] = [];
  for (const s of G.seams) {
    if (!inGroups(s.a, bodyLike) || !inGroups(s.b, bodyLike)) continue;
    const w = graphWork(s, 0);
    if (!w || !groups.has('BODY')) continue;
    // A seam that crosses the doll from its left to its right (the back's left shoulder onto the
    // right front) cannot close without tearing paper: released, and the mirror reading proposed.
    const cx = (P: Path) => [...P.v].reduce((t, v) => t + pos[3 * v], 0) / P.v.length;
    const xa = cx(w.A);
    const xb = cx(w.B);
    const lim = 0.3 * (torsoAt(vArm)?.a ?? 150);
    if (!(Math.sign(xa) !== Math.sign(xb) && Math.abs(xa) > lim && Math.abs(xb) > lim)) continue;
    w.released = true;
    w.solver.active = false;
    const side = (x: number) => (x > 0 ? "the doll's left" : "the doll's right");
    w.note = `crosses the doll — ${s.a[0]} sits on ${side(xa)}, ${s.b[0]} on ${side(xb)}: crossed by design (a cross-back) or a wrong pairing? not sewn`;
    crossing.push({ s, xa, xb });
  }
  for (const { s, xa, xb } of crossing) {
    // Mirror reading: on the side without a hand, the edge mirrored across the piece's centre.
    for (const [mine, other, xm] of [
      [s.a, s.b, xa],
      [s.b, s.a, xb],
    ] as const) {
      const P = panelByKey.get(pk(mine[0]));
      const e = mine.length === 1 ? edgeById.get(mine[0]) : undefined;
      if (!P || !e || P.geom.hand) continue;
      let gx0 = Infinity;
      let gx1 = -Infinity;
      for (const q of P.geom.rs) {
        gx0 = Math.min(gx0, q[0]);
        gx1 = Math.max(gx1, q[0]);
      }
      const c = (gx0 + gx1) / 2;
      const mid = (ed: typeof e) => ed.pts[Math.floor(ed.pts.length / 2)];
      const twin = P.geom.edges.find(
        (x) =>
          x.id !== e.id &&
          Math.abs(x.lenMm - e.lenMm) < 4 &&
          Math.abs(mid(x)[0] + mid(e)[0] - 2 * c) < 20 &&
          Math.abs(mid(x)[1] - mid(e)[1]) < 20,
      );
      if (!twin || edgeUsed(twin.id)) continue;
      const A2 = pathOf([twin.id]);
      const B2 = pathOf([...other]);
      if (!A2 || !B2) continue;
      void xm;
      addWork(
        {
          id: `${twin.id}~${other[0]}`,
          a: [twin.id],
          b: [...other],
          kind: 'proposed-composite',
          origin: 'doll-proposed',
          A: A2,
          B: B2,
          target: 0.8,
          note: `mirror reading of ${s.seam.a} ↔ ${s.seam.b}: ${twin.id} ↔ ${other[0]} (${twin.lenMm.toFixed(0)} ≈ ${B2.len.toFixed(0)} mm) — if the shoulders are not crossed`,
          forceSame: false,
        },
        0,
        380,
      );
      break;
    }
  }
  for (const s of G.closures)
    if (inGroups(s.a, bodyLike) && inGroups(s.b, bodyLike)) graphWork(s, 0, true);

  const freeEdges = (P: Panel) => P.geom.edges.filter((e) => !edgeUsed(e.id));
  // Proposed closures of open strips (CF of the body, underarm of a one-piece sleeve, outseam of a leg).
  const proposeStripClosure = (
    gid: DollGroupId,
    label: string,
    kind: Work['kind'],
    born: number,
  ) => {
    const ch = charts.get(gid);
    const list = groups.get(gid);
    if (!ch || !list) return;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    if (G.closures.some((s) => list.some((P) => P.key === pk(s.a[0])))) return;
    // The ring's ends: the main strip's, or the far ends of the girth chains that continue it.
    const Llist = gid === 'BODY' && ringEnds.left ? ringEnds.left : main;
    const Rlist = gid === 'BODY' && ringEnds.right ? ringEnds.right : main;
    const endOf = (lst: Panel[], side: 0 | 1) => {
      const [lo, hi] = vRange(lst);
      const vm = lo + 0.45 * (hi - lo);
      const e = extent(crossings(lst, vm));
      return e ? endEdge(lst, e[side], vm) : null;
    };
    const endEdge = (lst: Panel[], u: number, vm: number) => {
      let best: { P: Panel; e: Edge; d: number } | null = null;
      for (const P of lst)
        for (const ed of freeEdges(P)) {
          const pl = ch.place.get(P.key)!;
          const pts = ed.pts.map((q) => toChart(pl, q));
          const dy = Math.abs(pts[pts.length - 1][1] - pts[0][1]);
          const dx = Math.abs(pts[pts.length - 1][0] - pts[0][0]);
          if (dy < 1.5 * dx || ed.lenMm < 100) continue;
          let d = Infinity;
          for (const q of pts) if (Math.abs(q[1] - vm) < 30) d = Math.min(d, Math.abs(q[0] - u));
          if (!Number.isFinite(d)) {
            const y0 = Math.min(pts[0][1], pts[pts.length - 1][1]);
            const y1 = Math.max(pts[0][1], pts[pts.length - 1][1]);
            if (vm < y0 || vm > y1) continue;
            d = Math.min(...pts.map((q) => Math.abs(q[0] - u)));
          }
          if (d < 25 && (!best || d < best.d)) best = { P, e: ed, d };
        }
      return best;
    };
    const L = endOf(Llist, 0);
    const R = endOf(Rlist, 1);
    if (!L || !R || L.e.id === R.e.id) return;
    const ratio = Math.min(L.e.lenMm, R.e.lenMm) / Math.max(L.e.lenMm, R.e.lenMm);
    if (ratio < 0.85) {
      warnings.push(
        `${label}: the strip's two ends ${L.e.id} (${L.e.lenMm.toFixed(0)} mm) and ${R.e.id} (${R.e.lenMm.toFixed(0)} mm) differ ${((1 - ratio) * 100).toFixed(0)} % — not closed`,
      );
      return;
    }
    const A = pathOf([L.e.id]);
    const B = pathOf([R.e.id]);
    if (!A || !B) return;
    addWork(
      {
        id: `${L.e.id}~${R.e.id}`,
        a: [L.e.id],
        b: [R.e.id],
        kind,
        origin: 'doll-proposed',
        A,
        B,
        target: kind === 'proposed-closure' ? 0.5 : 0.7,
        note: `${label} · ${L.e.lenMm.toFixed(0)} ≈ ${R.e.lenMm.toFixed(0)} mm · not in the pattern`,
        closure: kind === 'proposed-closure',
        partial: ratio < 0.97,
        gap: kind === 'proposed-closure' ? 4 : 0,
        // The strip's two ends run opposite ways round the contour: top meets top.
        forceSame: L.P.mirrored !== R.P.mirrored,
      },
      born,
      80,
    );
  };
  if (groups.has('BODY'))
    proposeStripClosure(
      'BODY',
      'front opening drawn closed (buttons / zip are not seams)',
      'proposed-closure',
      0,
    );
  for (const gid of ['LEG_L', 'LEG_R'] as DollGroupId[])
    if (groups.has(gid))
      proposeStripClosure(
        gid,
        'side seam of the leg proposed (closes the tube)',
        'proposed-composite',
        0,
      );

  // Free edges facing each other at placement (the yoke the pattern does not sew to the back, a
  // dropped side seam): reported OPEN and drawn red, never solved — but welded for the loops, so the
  // armholes are still found and the sleeves can be proposed onto them.
  const facingPairs = (gids: Set<DollGroupId>, maxGap: number, maxEase: number) => {
    const cand = panels
      .filter((P) => gids.has(P.group))
      .flatMap((P) =>
        freeEdges(P)
          .filter((e) => e.lenMm >= 60)
          .map((e) => ({ P, e })),
      );
    const out: {
      x: (typeof cand)[number];
      y: (typeof cand)[number];
      gap: number;
      same: boolean;
    }[] = [];
    for (let i = 0; i < cand.length; i++)
      for (let j = i + 1; j < cand.length; j++) {
        const x = cand[i];
        const y = cand[j];
        if (x.P === y.P) continue;
        if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > maxEase) continue;
        const A = pathOf([x.e.id]);
        const B = pathOf([y.e.id]);
        if (!A || !B) continue;
        const d0 = meanDist(A, B, false, [0, 1], [0, 1]);
        const d1 = meanDist(A, B, true, [0, 1], [0, 1]);
        const gap = Math.min(d0, d1);
        // Running alongside each other, not merely near (two parts of one armhole are near too).
        const g = rowGaps(pos, seamRows(A, B, d1 < d0));
        const gmax = g.length ? Math.max(...g) : Infinity;
        const gmin = g.length ? Math.min(...g) : 0;
        const len = Math.max(A.len, B.len);
        // Parallel (a slit, a gap): the gap is about even. Two arms of one opening (the front and
        // back halves of an armhole) touch at one end and part at the other.
        const even = gap < 8 || gmin >= 0.35 * gap;
        if (opt.debug && gap <= 2 * maxGap)
          warnings.push(
            `debug: facing? ${x.e.id}~${y.e.id} mean ${gap.toFixed(0)} min ${gmin.toFixed(0)} max ${gmax.toFixed(0)} len ${len.toFixed(0)}`,
          );
        if (gap <= maxGap && even && gmax <= Math.max(40, 0.25 * len))
          out.push({ x, y, gap, same: d1 < d0 });
      }
    out.sort((p, q) => p.gap - q.gap);
    const taken = new Set<string>();
    return out.filter((o) => {
      if (taken.has(o.x.e.id) || taken.has(o.y.e.id)) return false;
      taken.add(o.x.e.id);
      taken.add(o.y.e.id);
      return true;
    });
  };
  for (const f of facingPairs(new Set(['BODY']), 100, 0.15)) {
    const A = pathOf([f.x.e.id])!;
    const B = pathOf([f.y.e.id])!;
    const w = addWork(
      {
        id: `${f.x.e.id}~${f.y.e.id}`,
        a: [f.x.e.id],
        b: [f.y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        A,
        B,
        target: 0,
        note: `open — ${f.x.e.id} (${f.x.e.lenMm.toFixed(0)} mm) and ${f.y.e.id} (${f.y.e.lenMm.toFixed(0)} mm) face each other ${f.gap.toFixed(0)} mm apart, both free: a seam the pattern has not got (not sewn by the doll)`,
        forceSame: f.same,
      },
      passes,
      1,
    );
    w.virtual = true;
    w.solver.active = false;
  }

  for (let v = 0; v < N; v++) moving[v] = bodyLike.has(groupOfV[v]) && placed[v] ? 1 : 0;
  run(Math.min(450, maxPasses));
  releaseRounds(3, 100, 30, 15);

  // ── loops of the body after phase 1 ─────────────────────────────────────────────────────
  const activeSeams = () =>
    works
      .filter((w) => !w.released)
      .map((w) => ({ A: w.A, B: w.B, same: w.same, aRange: w.aRange, bRange: w.bRange }));
  const loopsOf = (gids: Set<DollGroupId>) => {
    const set = new Set(panels.filter((P) => gids.has(P.group)).map((P) => P.idx));
    return findLoops({ panels, panelOf, ringOf, uv, seams: activeSeams() }, set);
  };
  const centroid = (vs: number[]): Vec3 => {
    const c: Vec3 = [0, 0, 0];
    for (const v of vs) {
      c[0] += pos[3 * v];
      c[1] += pos[3 * v + 1];
      c[2] += pos[3 * v + 2];
    }
    return [c[0] / vs.length, c[1] / vs.length, c[2] / vs.length];
  };
  const bodyLoops = loopsOf(new Set(['BODY']));
  let neckLoop: RawLoop | null = null;
  let hemLoop: RawLoop | null = null;
  const armLoop: Record<'L' | 'R', RawLoop | null> = { L: null, R: null };
  const aArmNow = torso.length ? torsoAt(vArm)!.a : 200;
  {
    const big = bodyLoops.filter((l) => l.len > 150);
    const cs = big.map((l) => ({ l, c: centroid(l.verts) }));
    const byY = [...cs].sort((x, y) => x.c[1] - y.c[1]);
    if (byY.length) hemLoop = byY[0].l;
    for (const s of ['L', 'R'] as const) {
      const cand = cs.filter(
        (x) => x.l !== hemLoop && (s === 'L' ? x.c[0] > 0.45 * aArmNow : x.c[0] < -0.45 * aArmNow),
      );
      cand.sort((x, y) => y.l.len - x.l.len);
      armLoop[s] = cand[0]?.l ?? null;
    }
    const necks = cs.filter(
      (x) =>
        x.l !== hemLoop &&
        x.l !== armLoop.L &&
        x.l !== armLoop.R &&
        Math.abs(x.c[0]) < 0.45 * aArmNow,
    );
    necks.sort((x, y) => y.c[1] - x.c[1]);
    neckLoop = necks[0]?.l ?? null;
  }

  if (opt.debug) {
    warnings.push(
      `debug: vArm ${vArm.toFixed(0)} vSh ${vSh.toFixed(0)} vLo ${vLo.toFixed(0)} torso a@arm ${aArmNow.toFixed(0)}`,
    );
    for (const l of bodyLoops) {
      const c = centroid(l.verts);
      warnings.push(
        `debug: body loop ${l.len.toFixed(0)} mm closed ${l.closed} c=${c.map((x) => x.toFixed(0)).join(',')} pieces ${[...l.panels].map((i) => panels[i].key).join(',')}`,
      );
    }
  }
  // ── place the rest on those loops ───────────────────────────────────────────────────────
  type Frame = { c: Vec3; up: Vec3; e0: Vec3; e90: Vec3 };
  const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [
    a[0] + b[0] * k,
    a[1] + b[1] * k,
    a[2] + b[2] * k,
  ];
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(...a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const inFrame = (F: Frame, p: Vec3) => {
    const d = sub(p, F.c);
    const hh = dot(d, F.up);
    const x0 = dot(d, F.e0);
    const x9 = dot(d, F.e90);
    return { h: hh, th: Math.atan2(x9, x0), r: Math.hypot(x0, x9) };
  };
  const fromFrame = (F: Frame, th: number, hh: number, r: number): Vec3 =>
    add(add(add(F.c, F.up, hh), F.e0, r * Math.cos(th)), F.e90, r * Math.sin(th));

  /** Base curve (a loop / run in 3D) sampled by azimuth around a frame: radius and height. */
  const baseOf = (F: Frame, verts: number[]) => {
    const B = 72;
    const r = new Array<number>(B).fill(NaN);
    const hh = new Array<number>(B).fill(NaN);
    for (const v of verts) {
      const q = inFrame(F, getPos(v));
      const k = Math.round(((((q.th % TAU) + TAU) % TAU) / TAU) * B) % B;
      r[k] = Number.isNaN(r[k]) ? q.r : (r[k] + q.r) / 2;
      hh[k] = Number.isNaN(hh[k]) ? q.h : (hh[k] + q.h) / 2;
    }
    for (const arr of [r, hh]) {
      const known = arr.map((x, i) => [x, i] as const).filter(([x]) => !Number.isNaN(x));
      if (!known.length) arr.fill(0);
      for (let i = 0; i < B; i++) {
        if (!Number.isNaN(arr[i])) continue;
        let best = known[0];
        let bd = Infinity;
        for (const kk of known) {
          const d = Math.min(Math.abs(kk[1] - i), B - Math.abs(kk[1] - i));
          if (d < bd) [best, bd] = [kk, d];
        }
        arr[i] = best[0];
      }
    }
    const at = (arr: number[], th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * B;
      const i = Math.floor(f) % B;
      const w = f - Math.floor(f);
      return arr[i] * (1 - w) + arr[(i + 1) % B] * w;
    };
    return { r: (th: number) => at(r, th), h: (th: number) => at(hh, th) };
  };

  /** Split a strip's whole contour into its bottom and top runs (between the two u-extremes). */
  const stripRuns = (list: Panel[]) => {
    const loops = loopsOf(new Set([list[0].group]));
    const L = [...loops].sort((x, y) => y.len - x.len)[0];
    if (!L) return null;
    const vs = L.verts;
    let iMin = 0;
    let iMax = 0;
    for (let k = 0; k < vs.length; k++) {
      if (cuv[2 * vs[k]] < cuv[2 * vs[iMin]]) iMin = k;
      if (cuv[2 * vs[k]] > cuv[2 * vs[iMax]]) iMax = k;
    }
    const arc = (from: number, to: number) => {
      const out: number[] = [];
      for (let k = from; ; k = (k + 1) % vs.length) {
        out.push(vs[k]);
        if (k === to) break;
      }
      return out;
    };
    const r1 = arc(iMin, iMax);
    const r2 = arc(iMax, iMin);
    const mv = (r: number[]) => r.reduce((t, v) => t + cuv[2 * v + 1], 0) / r.length;
    return mv(r1) < mv(r2)
      ? { bottom: r1, top: r2, closed: L.closed }
      : { bottom: r2, top: r1, closed: L.closed };
  };

  /** Wrap a ring group (stand, collar, cuff, band) onto a base curve. */
  const placeRing = (
    gid: DollGroupId,
    F: Frame,
    base: number[] | null,
    rFallback: number,
    attach: 'bottom' | 'top',
    th0: number,
    layer: number,
  ) => {
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) return null;
    const runs = stripRuns(list);
    const bot = attach === 'bottom' ? runs?.bottom : runs?.top;
    // u → v of the attached run (chart), for the height above it.
    const runPts = (bot ?? [])
      .map((v) => [cuv[2 * v], cuv[2 * v + 1]] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const runV = (u: number) => {
      if (!runPts.length) return 0;
      if (u <= runPts[0][0]) return runPts[0][1];
      for (let k = 1; k < runPts.length; k++)
        if (runPts[k][0] >= u) {
          const a = runPts[k - 1];
          const b = runPts[k];
          const w = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
          return a[1] + (b[1] - a[1]) * w;
        }
      return runPts[runPts.length - 1][1];
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const P of list)
      for (let r = 0; r < P.nb; r++) {
        x0 = Math.min(x0, cuv[2 * (P.offset + r)]);
        x1 = Math.max(x1, cuv[2 * (P.offset + r)]);
      }
    const uC = (x0 + x1) / 2;
    const B = base && base.length ? baseOf(F, base) : null;
    const rad = (th: number) => (B ? B.r(th) : rFallback) + layer;
    // Arc length along the base by azimuth, so the ring keeps its own width (paper).
    const KA = 360;
    const arc = new Float64Array(KA + 1);
    for (let k = 1; k <= KA; k++) arc[k] = arc[k - 1] + (rad((TAU * (k - 0.5)) / KA) * TAU) / KA;
    const arcAt = (th: number) => {
      const f = ((((th % TAU) + TAU) % TAU) / TAU) * KA;
      const i = Math.floor(f);
      return arc[i] + (arc[Math.min(KA, i + 1)] - arc[i]) * (f - i);
    };
    const thAt = (s: number) => {
      const tot = arc[KA];
      const q = ((s % tot) + tot) % tot;
      let lo = 0;
      let hi = KA;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (arc[m] <= q) lo = m;
        else hi = m;
      }
      return (TAU * (lo + (q - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]))) / KA;
    };
    const s0 = arcAt(th0);
    const ringProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const R = rad(q.th) * PROXY_K;
        if (q.r >= R || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, R);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull() {},
    };
    const pi = proxies.push(ringProxy) - 1;
    for (const P of list) {
      buildPanelLater.push(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const vv = cuv[2 * v + 1];
        const th = thAt(s0 + (u - uC));
        const above = attach === 'bottom' ? vv - runV(u) : vv - runV(u);
        const hh = (B ? B.h(th) : 0) + above;
        setPos(v, fromFrame(F, th, hh, rad(th)));
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
    proxyReport.push({
      group: gid,
      kind: 'ring',
      profile: [[0, rFallback, rFallback]],
      origin: F.c,
      axis: F.up,
    });
    return runs;
  };
  const buildPanelLater: Panel[] = [];

  const proposals: { gid: DollGroupId; label: string; ok: boolean; note: string }[] = [];
  /** Propose a join between two vertex runs / loops (cut closed loops at their lowest / front point). */
  const ringInfo = { ringOf, nbOf: (p: number) => panels[p].nb };
  const propose = (
    label: string,
    A0: { verts: number[]; closed: boolean },
    B0: { verts: number[]; closed: boolean },
    cutAt: 'lowest' | 'front' | 'nearest',
    gid: DollGroupId,
    maxEase = 0.25,
  ) => {
    const cutIdx = (L: { verts: number[] }, ref?: Vec3) => {
      let best = 0;
      for (let k = 0; k < L.verts.length; k++) {
        const p = getPos(L.verts[k]);
        const q = getPos(L.verts[best]);
        if (cutAt === 'lowest' && p[1] < q[1]) best = k;
        if (cutAt === 'front' && p[2] > q[2]) best = k;
        if (cutAt === 'nearest' && ref && Math.hypot(...sub(p, ref)) < Math.hypot(...sub(q, ref)))
          best = k;
      }
      return best;
    };
    let A: Path;
    let B: Path;
    if (A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, cutIdx(A0), true, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, cutIdx(B0), true, ringInfo);
    } else if (!A0.closed && B0.closed) {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      const mid = getPos(A0.verts[0]);
      const end = getPos(A0.verts[A0.verts.length - 1]);
      const ref: Vec3 = [(mid[0] + end[0]) / 2, (mid[1] + end[1]) / 2, (mid[2] + end[2]) / 2];
      B = loopPath(
        B0.verts,
        uv,
        panelOf,
        cutAt === 'nearest' ? cutIdx(B0, ref) : cutIdx(B0),
        true,
        ringInfo,
      );
    } else {
      A = loopPath(A0.verts, uv, panelOf, 0, false, ringInfo);
      B = loopPath(B0.verts, uv, panelOf, 0, false, ringInfo);
    }
    const ratio = Math.min(A.len, B.len) / Math.max(A.len, B.len, 1e-9);
    const ease = 1 - ratio;
    const words = `${A.len.toFixed(0)} ≈ ${B.len.toFixed(0)} mm, ${ease < 0.015 ? 'equal' : `eased ${(ease * 100).toFixed(0)} %`}`;
    if (ease > maxEase) {
      proposals.push({
        gid,
        label,
        ok: false,
        note: `${label} not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      });
      warnings.push(
        `${label}: not proposed — lengths ${A.len.toFixed(0)} vs ${B.len.toFixed(0)} mm differ ${(ease * 100).toFixed(0)} %`,
      );
      return null;
    }
    const edgesOn = (P: Path) => {
      const out = new Set<string>();
      for (const v of P.v) {
        const Pn = panels[panelOf[v]];
        const r = ringOf[v];
        if (r < 0) continue;
        const rsI = Pn.mesh.bRs[r];
        const n = Pn.geom.rs.length;
        for (const e of Pn.geom.edges) {
          const span = (((e.e - e.s) % n) + n) % n;
          const off = (((rsI - e.s) % n) + n) % n;
          if (off > 0 && off < span) out.add(e.id);
        }
      }
      return [...out];
    };
    const w = addWork(
      {
        id: label,
        a: edgesOn(A),
        b: edgesOn(B),
        kind: 'proposed-composite',
        origin: 'doll-proposed',
        A,
        B,
        target: 0.7,
        note: `proposed by the doll · ${label} · ${words} · not in the pattern`,
      },
      passes,
      120,
    );
    proposals.push({ gid, label, ok: true, note: w.note });
    return w;
  };

  // Graph seams between the body and another group (rare: the graph found a composite).
  const graphTouches = (g1: DollGroupId, g2: Set<DollGroupId>) =>
    G.seams.some((s) => {
      const ga = panelByKey.get(pk(s.a[0]))?.group;
      const gb = panelByKey.get(pk(s.b[0]))?.group;
      return (ga === g1 && gb && g2.has(gb)) || (gb === g1 && ga && g2.has(ga));
    });

  // A graph seam between a placed group and the body counts only when its two sides are near
  // each other once placed; one that spans the doll (a sleeve's underarm onto the yoke) is a wrong
  // pairing and is released at once instead of crumpling the sleeve on its way across.
  const FAR = 150;
  const gapNow = (sm: GroupedSeam) => {
    const A = pathOf(sm.a);
    const B = pathOf(sm.b);
    if (!A || !B) return Infinity;
    return Math.min(meanDist(A, B, true, [0, 1], [0, 1]), meanDist(A, B, false, [0, 1], [0, 1]));
  };
  const sewnNear = (g1: DollGroupId, g2: DollGroupId) =>
    G.seams.some((sm) => {
      const ga = panelByKey.get(pk(sm.a[0]))?.group;
      const gb = panelByKey.get(pk(sm.b[0]))?.group;
      return ((ga === g1 && gb === g2) || (gb === g1 && ga === g2)) && gapNow(sm) < FAR;
    });
  const a = (Math.PI / 180) * ARM_DEG;
  const sleeveFrames: Partial<Record<'L' | 'R', Frame>> = {};
  // Which armhole a sleeve goes to: its hand, unless the graph sews it to body edges that sit on
  // the other side of the doll (sleeve hands swapped, or a back drawn as seen from the front) —
  // then the seams win and the swap is reported.
  const armSide: Record<'L' | 'R', 'L' | 'R'> = { L: 'L', R: 'R' };
  {
    const vote: Record<'L' | 'R', number> = { L: 0, R: 0 };
    for (const s of ['L', 'R'] as const) {
      const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
      for (const sm of G.seams) {
        const ga = panelByKey.get(pk(sm.a[0]))?.group;
        const gb = panelByKey.get(pk(sm.b[0]))?.group;
        const bodySide =
          ga === gid && gb === 'BODY' ? sm.b : gb === gid && ga === 'BODY' ? sm.a : null;
        if (!bodySide) continue;
        const B = pathOf(bodySide);
        if (!B) continue;
        const x = [...B.v].reduce((t, v) => t + pos[3 * v], 0) / B.v.length;
        vote[s] += Math.sign(x) * B.len;
      }
    }
    if (vote.L < 0 && vote.R > 0) {
      armSide.L = 'R';
      armSide.R = 'L';
      warnings.push(
        "the graph sews the left sleeve to the doll's right armhole and the right sleeve to the left — sleeve hands swapped, or the back is drawn as seen from the front; the sleeves are put where the seams say",
      );
    }
  }
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    const list = groups.get(gid);
    const ch = charts.get(gid);
    if (!list || !ch) continue;
    const side = armSide[s];
    const sg = side === 'L' ? 1 : -1;
    const main = ch.components[0].keys.map((k) => panelByKey.get(k)!);
    const [lo, hi] = vRange(main);
    const Wv = widthTable(main, lo, hi, 250);
    let vW = lo;
    let wMax = 0;
    for (let v = lo + 5; v < hi - 5; v += 5) {
      const w = Wv(v);
      if (w > wMax) [vW, wMax] = [v, w];
    }
    const capH = Math.max(40, hi - vW);
    // Cap apex: the top-most chart point.
    let uApex = 0;
    let best = -Infinity;
    for (const P of main)
      for (let r = 0; r < P.nb; r++) {
        const v = P.offset + r;
        if (cuv[2 * v + 1] > best) [best, uApex] = [cuv[2 * v + 1], cuv[2 * v]];
      }
    const J: Vec3 = armLoop[side]
      ? centroid(armLoop[side]!.verts)
      : [sg * aArmNow * 0.95, vArm + 0.5 * (vSh - vArm), 0];
    const d: Vec3 = [sg * Math.sin(a), -Math.cos(a), 0];
    const up: Vec3 = [-d[0], -d[1], -d[2]];
    const e0: Vec3 = [sg * Math.cos(a), Math.sin(a), 0];
    const e90 = cross(up, e0);
    const Rw = (wMax * (1 - EPS_WRAP)) / TAU;
    const F: Frame = { c: add(add(J, up, capH / 2), [sg, 0, 0], 25), up, e0, e90 };
    sleeveFrames[s] = F;
    const R = (v: number) => (Wv(Math.min(v, vW)) * (1 - EPS_WRAP)) / TAU;
    const armProxy: Proxy = {
      push(p, i) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < 0.8 * capH || t > hi - lo + 20) return;
        const Rr = R(hi + q.h) * PROXY_K;
        if (q.r >= Rr || q.r < 1e-6) return;
        const np = fromFrame(F, q.th, q.h, Rr);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
      pull(p, i, k) {
        const q = inFrame(F, [p[3 * i], p[3 * i + 1], p[3 * i + 2]]);
        const t = -q.h;
        if (t < capH * 1.2) return;
        const Rr = R(hi + q.h) + CLEAR;
        if (q.r <= Rr) return;
        const np = fromFrame(F, q.th, q.h, q.r - (q.r - Rr) * k);
        p[3 * i] = np[0];
        p[3 * i + 1] = np[1];
        p[3 * i + 2] = np[2];
      },
    };
    const pi = proxies.push(armProxy) - 1;
    proxyReport.push({ group: gid, kind: 'capsule', profile: [[0, Rw, Rw]], origin: F.c, axis: d });
    for (const P of list) {
      buildPanelLater.push(P);
      const inMain = main.includes(P);
      for (let i = 0; i < P.count; i++) {
        const v = P.offset + i;
        const u = cuv[2 * v];
        const vv = cuv[2 * v + 1];
        const th = (TAU * (u - uApex)) / Wv(Math.min(vv, vW));
        setPos(v, fromFrame(F, th, vv - hi, R(vv) + CLEAR + (inMain ? 0 : 3)));
        proxyOf[v] = pi;
        placed[v] = 1;
      }
    }
  }
  // Sleeve tube closures, then cap ↔ armhole.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    proposeStripClosure(
      gid,
      'underarm seam proposed (closes the sleeve)',
      'proposed-composite',
      passes,
    );
    if (sewnNear(gid, 'BODY') || opt.proposeComposite === false) continue;
    const loops = loopsOf(new Set([gid]));
    const F = sleeveFrames[s]!;
    const capTop = fromFrame(F, 0, 0, 0);
    const big = loops.filter((l) => l.len > 150).map((l) => ({ l, c: centroid(l.verts) }));
    big.sort((x, y) => Math.hypot(...sub(x.c, capTop)) - Math.hypot(...sub(y.c, capTop)));
    const cap = big[0]?.l;
    if (opt.debug)
      warnings.push(
        `debug: ${gid} loops ${loops.map((l) => `${l.len.toFixed(0)}${l.closed ? '' : '(open)'}`).join(' ')}`,
      );
    if (!cap) continue;
    if (!armLoop[armSide[s]]) {
      warnings.push(
        `${s === 'L' ? 'left' : 'right'} sleeve: the body has no ${armSide[s] === 'L' ? 'left' : 'right'} armhole loop — not attached`,
      );
      continue;
    }
    propose(
      `${s === 'L' ? 'left' : 'right'} sleeve cap ↔ armhole`,
      cap,
      armLoop[armSide[s]]!,
      'lowest',
      gid,
      0.3,
    );
  }

  // Stand / collar on the neckline.
  const neckFrame: Frame = (() => {
    const c = neckLoop ? centroid(neckLoop.verts) : ([0, vSh, 0] as Vec3);
    return { c, up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
  })();
  const ringLen = (gid: DollGroupId) => {
    const runs = groups.has(gid) ? stripRuns(groups.get(gid)!) : null;
    return runs ? loopPath(runs.bottom, uv, panelOf, 0, false, ringInfo).len : 400;
  };
  let standTop: number[] | null = null;
  if (groups.has('STAND')) {
    const runs = placeRing(
      'STAND',
      neckFrame,
      neckLoop?.verts ?? null,
      ringLen('STAND') / TAU,
      'bottom',
      Math.PI,
      0,
    );
    for (const P of groups.get('STAND')!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['STAND'])) && inGroups(sm.b, new Set(['STAND'])))
        graphWork(sm, passes);
    if (runs) {
      standTop = runs.top;
      if (neckLoop && !graphTouches('STAND', new Set(['BODY'])) && opt.proposeComposite !== false)
        propose(
          'collar stand ↔ neckline',
          { verts: runs.bottom, closed: false },
          { verts: neckLoop.verts, closed: true },
          'front',
          'STAND',
          0.4,
        );
      else if (!neckLoop) warnings.push('the body has no neck loop — the stand is not attached');
    }
  }
  if (groups.has('COLLAR')) {
    const base = standTop ?? neckLoop?.verts ?? null;
    const runs = placeRing(
      'COLLAR',
      neckFrame,
      base,
      ringLen('COLLAR') / TAU,
      'bottom',
      Math.PI,
      standTop ? 3 : 0,
    );
    for (const P of groups.get('COLLAR')!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set(['COLLAR'])) && inGroups(sm.b, new Set(['COLLAR'])))
        graphWork(sm, passes);
    if (runs && opt.proposeComposite !== false) {
      if (standTop && !graphTouches('COLLAR', new Set(['STAND'])))
        propose(
          'collar ↔ stand top',
          { verts: runs.bottom, closed: false },
          { verts: standTop, closed: false },
          'front',
          'COLLAR',
          0.3,
        );
      else if (!standTop && neckLoop && !graphTouches('COLLAR', new Set(['BODY'])))
        propose(
          'collar ↔ neckline',
          { verts: runs.bottom, closed: false },
          { verts: neckLoop.verts, closed: true },
          'front',
          'COLLAR',
          0.4,
        );
    }
  }
  // Cuffs at the wrists.
  for (const s of ['L', 'R'] as const) {
    const gid: DollGroupId = s === 'L' ? 'CUFF_L' : 'CUFF_R';
    const sl: DollGroupId = s === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    if (!groups.has(gid)) continue;
    const F0 = sleeveFrames[s];
    const loops = groups.has(sl) ? loopsOf(new Set([sl])) : [];
    const capTop = F0 ? fromFrame(F0, 0, 0, 0) : ([0, 0, 0] as Vec3);
    const big = loops.filter((l) => l.len > 100).map((l) => ({ l, c: centroid(l.verts) }));
    big.sort((x, y) => Math.hypot(...sub(y.c, capTop)) - Math.hypot(...sub(x.c, capTop)));
    const wrist = big[0]?.l ?? null;
    const F: Frame =
      F0 && wrist
        ? { ...F0, c: centroid(wrist.verts) }
        : { c: [s === 'L' ? 400 : -400, 0, 0], up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    const runs = placeRing(gid, F, wrist?.verts ?? null, ringLen(gid) / TAU, 'top', 0, 2);
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    if (runs && wrist && !graphTouches(gid, new Set([sl])) && opt.proposeComposite !== false)
      propose(
        `${s === 'L' ? 'left' : 'right'} cuff ↔ wrist`,
        { verts: runs.top, closed: false },
        { verts: wrist.verts, closed: wrist.closed },
        'nearest',
        gid,
        0.3,
      );
  }
  // Waistband / hem band.
  for (const gid of ['WAISTBAND', 'HEMBAND'] as DollGroupId[]) {
    if (!groups.has(gid)) continue;
    const host = loopsOf(bodyLike)
      .filter((l) => l.len > 200)
      .map((l) => ({ l, c: centroid(l.verts) }));
    host.sort((x, y) => (gid === 'WAISTBAND' ? y.c[1] - x.c[1] : x.c[1] - y.c[1]));
    const target = gid === 'WAISTBAND' ? host[0]?.l : hemLoop ?? host[0]?.l;
    const c = target ? centroid(target.verts) : ([0, 0, 0] as Vec3);
    const F: Frame = { c, up: [0, 1, 0], e0: [0, 0, 1], e90: [1, 0, 0] };
    const runs = placeRing(
      gid,
      F,
      target?.verts ?? null,
      ringLen(gid) / TAU,
      gid === 'WAISTBAND' ? 'bottom' : 'top',
      Math.PI,
      2,
    );
    for (const P of groups.get(gid)!) buildPanel(P);
    for (const sm of G.seams)
      if (inGroups(sm.a, new Set([gid])) && inGroups(sm.b, new Set([gid]))) graphWork(sm, passes);
    if (runs && target && opt.proposeComposite !== false)
      propose(
        gid === 'WAISTBAND' ? 'waistband ↔ top of the body' : 'hem band ↔ hem',
        { verts: gid === 'WAISTBAND' ? runs.bottom : runs.top, closed: false },
        { verts: target.verts, closed: target.closed },
        'front',
        gid,
        0.25,
      );
  }
  // Graph seams between groups (whatever the graph found across them).
  for (const sm of G.seams) {
    const ga = panelByKey.get(pk(sm.a[0]))?.group;
    const gb = panelByKey.get(pk(sm.b[0]))?.group;
    if (!ga || !gb || ga === gb || ga === 'FLOAT' || gb === 'FLOAT') continue;
    if (bodyLike.has(ga) && bodyLike.has(gb)) continue;
    const far = gapNow(sm);
    const w = graphWork(sm, passes);
    if (w && far >= FAR) {
      w.released = true;
      w.solver.active = false;
      w.note = `its two edges are ${far.toFixed(0)} mm apart once the pieces are placed (${ga} ↔ ${gb}) — a wrong pairing? not sewn`;
    }
  }
  // Floating pieces stand beside the doll, flat, facing front.
  let xMax = 0;
  for (let v = 0; v < N; v++) if (placed[v]) xMax = Math.max(xMax, pos[3 * v]);
  let xCursor = xMax + 200;
  const floating: DollReport['floating'] = [];
  for (const P of panels) {
    if (P.group !== 'FLOAT' && placed[P.offset]) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (let i = 0; i < P.count; i++) {
      x0 = Math.min(x0, uv[2 * (P.offset + i)]);
      x1 = Math.max(x1, uv[2 * (P.offset + i)]);
      y0 = Math.min(y0, uv[2 * (P.offset + i) + 1]);
    }
    for (let i = 0; i < P.count; i++) {
      const v = P.offset + i;
      setPos(v, [xCursor + uv[2 * v] - x0, vLo + 200 + uv[2 * v + 1] - y0, 0]);
      placed[v] = 1;
    }
    xCursor += x1 - x0 + 60;
    const has = G.seams.some((s) => pk(s.a[0]) === P.key || pk(s.b[0]) === P.key);
    floating.push({
      pieceKey: P.key,
      reason: has
        ? 'sewn only to pieces outside any wrap group — drawn apart'
        : 'no seam found for any of its edges — drawn apart',
    });
  }

  // ── phase 2: everything ─────────────────────────────────────────────────────────────────
  for (let v = 0; v < N; v++) {
    anchor[3 * v] = pos[3 * v];
    anchor[3 * v + 1] = pos[3 * v + 1];
    anchor[3 * v + 2] = pos[3 * v + 2];
    anchorK[v] = bodyLike.has(groupOfV[v]) || groupOfV[v] === 'FLOAT' ? 0 : 0.002;
  }
  for (const P of buildPanelLater) buildPanel(P);
  for (let v = 0; v < N; v++) moving[v] = groupOfV[v] !== 'FLOAT' && proxyOf[v] >= 0 ? 1 : 0;
  const tSolve = now();
  const p2 = Math.max(300, maxPasses - passes - 400);
  run(p2);
  // Releases get their own budget past maxPasses (the settle loop follows).
  passCap = Math.max(passCap, passes + 3 * 120);
  releaseRounds(3, 120, 20, 12);

  // Settled? Max vertex travel over 20 passes; keep relaxing until it is below 1.5 mm, within a
  // fixed pass budget (no clock: the result must not depend on the machine).
  let travel = Infinity;
  let travelV = 0;
  let travelP99 = 0;
  const settleCap = passes + (opt.settlePasses ?? 2400);
  passCap = settleCap;
  while (passes < settleCap) {
    run(60);
    const snap = Float64Array.from(pos);
    const before = passes;
    run(20);
    if (passes === before) break;
    travel = 0;
    const ds: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const d = Math.hypot(pos[i] - snap[i], pos[i + 1] - snap[i + 1], pos[i + 2] - snap[i + 2]);
      ds.push(d);
      if (d > travel) [travel, travelV] = [d, i / 3];
    }
    ds.sort((x, y) => x - y);
    travelP99 = ds.length ? ds[Math.floor(0.99 * (ds.length - 1))] : 0;
    if (travel < 1.5) break;
  }
  if (!Number.isFinite(travel)) travel = 0;
  if (opt.debug)
    warnings.push(
      `debug: travel p99 ${travelP99.toFixed(2)} mm · max ${travel.toFixed(1)} mm at ${panels[panelOf[travelV]].key} (ring ${ringOf[travelV]})`,
    );
  const converged = travel < 1.5;
  if (!converged)
    warnings.push(
      `the doll did not settle — points still move ${travel.toFixed(1)} mm per 20 passes; the shape shown is the last frame`,
    );
  const msSolve = now() - tSolve;

  // ── report ──────────────────────────────────────────────────────────────────────────────
  const SF = makeState();
  const st = strains(SF);
  const sorted = [...st].sort((x, y) => x - y);
  if (opt.debug) {
    const per = new Map<string, number[]>();
    for (let c = 0; c < SF.nStretch; c++) {
      const k = panels[panelOf[SF.di[c]]].key;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push(st[c]);
    }
    const rows = [...per].map(([k, v]) => {
      v.sort((x, y) => x - y);
      return [k, v[Math.floor(0.9 * (v.length - 1))], v[v.length - 1]] as const;
    });
    rows.sort((x, y) => y[1] - x[1]);
    const worstK = rows[0]?.[0];
    let shown = 0;
    for (let c = 0; c < SF.nStretch && shown < 4; c++) {
      if (panels[panelOf[SF.di[c]]].key !== worstK || st[c] < 0.4) continue;
      shown++;
      const [i, j] = [SF.di[c], SF.dj[c]];
      warnings.push(
        `debug: ${worstK} edge ${i}-${j} rest ${SF.rest[c].toFixed(1)} uv ${uv[2 * i].toFixed(0)},${uv[2 * i + 1].toFixed(0)}→${uv[2 * j].toFixed(0)},${uv[2 * j + 1].toFixed(0)} chart ${cuv[2 * i].toFixed(0)},${cuv[2 * i + 1].toFixed(0)}→${cuv[2 * j].toFixed(0)},${cuv[2 * j + 1].toFixed(0)} pos ${getPos(i).map((x) => x.toFixed(0))}→${getPos(j).map((x) => x.toFixed(0))} ring ${ringOf[i]},${ringOf[j]}`,
      );
    }
    warnings.push(
      `debug: strain p90/max by panel: ${rows
        .slice(0, 10)
        .map(([k, a, b]) => `${k} ${(a * 100).toFixed(0)}/${(b * 100).toFixed(0)}`)
        .join(' · ')}`,
    );
  }
  const p99 = sorted.length ? sorted[Math.floor(0.99 * (sorted.length - 1))] : 0;
  const smax = sorted.length ? sorted[sorted.length - 1] : 0;
  let nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;

  /** Length mismatch the seam must absorb (a partial seam's short side lies on part of the long one). */
  const easeOf = (w: Work) => {
    const a = w.A.len * (w.aRange[1] - w.aRange[0]);
    const b = w.B.len * (w.bRange[1] - w.bRange[0]);
    return Math.abs(a - b) / Math.max(a, b, 1e-9);
  };
  const seams: DollSeamReport[] = [];
  for (const w of works) {
    const m = measure(w);
    const sp = seamStretch(w, st, SF) * 100;
    // Twist: the other direction would fit the solved shape much better.
    const alt = seamRows(w.A, w.B, !w.same, w.aRange, w.bRange);
    const ag = rowGaps(pos, alt);
    const altMean = ag.reduce((x, y) => x + y, 0) / Math.max(1, ag.length);
    const twisted = w.origin === 'graph' && !w.closure && m.mean > 5 && altMean < 0.5 * m.mean;
    const lenA = w.A.len;
    const lenB = w.B.len;
    let state: DollSeamState;
    if (w.released || w.virtual) state = 'open';
    else if (w.origin === 'doll-proposed') state = 'proposed';
    else if (twisted) state = 'twisted';
    // Open = a stretch of the seam stays apart (p95), not one corner point that lags.
    else if (m.p95 > 4 || m.max > 15) state = 'open';
    else if (sp > 3 && !(easeOf(w) > 0.03 && sp <= easeOf(w) * 100 + 2)) state = 'stretched';
    else if (easeOf(w) > 0.015) state = 'eased';
    else state = 'closed';
    let note = w.note;
    if (!note) {
      if (state === 'closed')
        note =
          w.kind === 'partial' || Math.abs(lenA - lenB) > 0.03 * Math.max(lenA, lenB)
            ? `closed · partial: ${Math.min(lenA, lenB).toFixed(0)} mm onto ${Math.max(lenA, lenB).toFixed(0)} mm`
            : `closed · ${lenA.toFixed(0)} = ${lenB.toFixed(0)} mm`;
      else if (state === 'eased')
        note = `closed, eased ${(easeOf(w) * 100).toFixed(0)} % · ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm${sp > 3 ? ' — paper cannot gather, so the ease shows as stretch' : ''}`;
      else if (state === 'stretched')
        note = `closes only if the paper stretches ${sp.toFixed(0)} % — a wrong edge or missing ease`;
      else if (state === 'open')
        note = `left open ${m.max.toFixed(0)} mm · lengths ${lenA.toFixed(0)} vs ${lenB.toFixed(0)} mm`;
      else note = `twisted — ends crossed; sewn the other way round?`;
      if (w.kind === 'partial' && state !== 'closed')
        note += ` · partial (${Math.min(lenA, lenB).toFixed(0)} onto ${Math.max(lenA, lenB).toFixed(0)} mm)`;
    } else if (w.origin === 'doll-proposed') note += ` · gap after solving ${m.max.toFixed(0)} mm`;
    seams.push({
      id: w.id,
      a: w.a,
      b: w.b,
      kind: w.kind,
      origin: w.origin,
      lenA,
      lenB,
      residualMeanMm: m.mean,
      residualMaxMm: m.max,
      residualP95Mm: m.p95,
      stretchPct: sp,
      twisted,
      state,
      released: w.released,
      note,
      pathA: Uint32Array.from(w.A.v),
      pathB: Uint32Array.from(w.B.v),
    });
  }
  for (const s of G.layerSeams)
    seams.push({
      id: `${s.a}~${s.b}`,
      a: edgeIdsOf(s.a),
      b: edgeIdsOf(s.b),
      kind: s.kind,
      origin: 'layer',
      lenA: s.evidence.aLenMm ?? 0,
      lenB: s.evidence.bLenMm ?? 0,
      residualMeanMm: 0,
      residualMaxMm: 0,
      residualP95Mm: 0,
      stretchPct: 0,
      twisted: false,
      state: 'closed',
      note: 'layer seam — the layers are drawn as one piece',
      pathA: new Uint32Array(0),
      pathB: new Uint32Array(0),
    });

  // Free edges facing each other (a seam the pattern has not got): reported open, never solved.
  const freeAll = panels
    .filter((P) => P.group !== 'FLOAT')
    .flatMap((P) =>
      freeEdges(P)
        .filter((e) => e.lenMm >= 60)
        .map((e) => ({ P, e })),
    );
  const taken = new Set<string>();
  for (let i = 0; i < freeAll.length; i++)
    for (let j = i + 1; j < freeAll.length; j++) {
      const x = freeAll[i];
      const y = freeAll[j];
      if (x.P === y.P || x.P.group !== y.P.group || taken.has(x.e.id) || taken.has(y.e.id))
        continue;
      if (Math.abs(x.e.lenMm - y.e.lenMm) / Math.max(x.e.lenMm, y.e.lenMm) > 0.08) continue;
      const A = pathOf([x.e.id]);
      const B = pathOf([y.e.id]);
      if (!A || !B) continue;
      const gap = Math.min(
        meanDist(A, B, false, [0, 1], [0, 1]),
        meanDist(A, B, true, [0, 1], [0, 1]),
      );
      if (gap > 40) continue;
      taken.add(x.e.id);
      taken.add(y.e.id);
      seams.push({
        id: `${x.e.id}~${y.e.id}`,
        a: [x.e.id],
        b: [y.e.id],
        kind: 'facing-free',
        origin: 'doll-proposed',
        lenA: A.len,
        lenB: B.len,
        residualMeanMm: gap,
        residualMaxMm: gap,
        residualP95Mm: gap,
        stretchPct: 0,
        twisted: false,
        state: 'open',
        note: `open — ${x.e.id} (${x.e.lenMm.toFixed(0)} mm) and ${y.e.id} (${y.e.lenMm.toFixed(0)} mm) lie ${gap.toFixed(0)} mm apart, free, about equal: a seam the pattern has not got?`,
        pathA: Uint32Array.from(A.v),
        pathB: Uint32Array.from(B.v),
      });
    }

  // Loops for the report.
  const loopsOut: DollLoop[] = [];
  const labelOf = (l: RawLoop) =>
    l === neckLoop
      ? 'neck'
      : l === hemLoop
        ? 'hem'
        : l === armLoop.L
          ? 'armhole-L'
          : l === armLoop.R
            ? 'armhole-R'
            : 'other';
  for (const l of bodyLoops)
    loopsOut.push({
      group: 'BODY',
      label: labelOf(l),
      lenMm: l.len,
      closed: l.closed,
      path: Uint32Array.from(l.verts),
    });

  for (const p of proposals) if (!p.ok) void p;
  const positions = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) positions[i] = Number.isFinite(pos[i]) ? pos[i] : 0;
  const outPanels = panels.map((P) => {
    const tris = new Uint32Array(P.mesh.tris.length);
    for (let t = 0; t < tris.length; t += 3) {
      tris[t] = P.mesh.tris[t];
      tris[t + 1] = P.mirrored ? P.mesh.tris[t + 2] : P.mesh.tris[t + 1];
      tris[t + 2] = P.mirrored ? P.mesh.tris[t + 1] : P.mesh.tris[t + 2];
    }
    const uvf = new Float32Array(2 * P.count);
    for (let i = 0; i < 2 * P.count; i++) uvf[i] = uv[2 * P.offset + i];
    return {
      pieceKey: P.key,
      instance: 0 as const,
      mirrored: P.mirrored,
      group: P.group,
      offset: P.offset,
      count: P.count,
      tris,
      uv: uvf,
      boundary: Uint32Array.from(P.mesh.bVert),
      layers: P.layers,
    };
  });
  // Pieces that end up in no closed/proposed seam at all are floating too.
  for (const P of panels) {
    if (P.group === 'FLOAT') continue;
    const any = seams.some(
      (s) =>
        s.state !== 'open' &&
        s.origin !== 'layer' &&
        [...s.a, ...s.b].some((id) => pk(id) === P.key),
    );
    if (!any)
      floating.push({
        pieceKey: P.key,
        reason: 'in its group but no seam of it closed or was proposed',
      });
  }
  const tris = panels.reduce((t, P) => t + P.mesh.tris.length / 3, 0);
  return {
    panels: outPanels,
    positions,
    seams,
    loops: loopsOut,
    floating,
    skipped: G.skipped,
    proxies: proxyReport,
    stats: {
      vertices: N,
      triangles: tris,
      passes,
      ms: now() - t0,
      msMesh,
      msSolve,
      converged,
      nan,
      stretchP99Pct: p99 * 100,
      stretchMaxPct: smax * 100,
    },
    warnings,
    honesty: HONESTY,
  };
}

export type { SeamCandidate, PieceGeom };
