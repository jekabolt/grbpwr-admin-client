// The flat chart of a wrap group: its pieces laid UPRIGHT (the drawing's +y is up — CLO / Gerber
// export pieces on grain) side by side along their VERTICAL seams and stacked along horizontal ones,
// by TRANSLATION ONLY (mirror allowed when a piece is drawn face down). Seams that go over the top
// (shoulders) or close the tube are not used here — the solver closes them. The chart's u axis is
// the way around the body, v is height; wrapping it onto the proxy (place.ts) is the first guess.
//
// Translation only is what keeps the doll from looking crooked: a rigid placement along a curved
// side seam (unionLayout's) tilts every next panel a little and the strip fans out.

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

export type ChartPlace = {
  dx: number;
  dy: number;
  mirror: boolean;
  cx: number;
  cy: number;
  rot: number;
};
export type ChartComponent = { root: string; keys: string[] };
export type Chart = {
  place: Map<string, ChartPlace>;
  components: ChartComponent[];
  /** Seams used to lay the chart (`a~b` of the first edges). */
  used: Set<string>;
  /** Why chart links were refused (probe diagnostics). */
  rejected: string[];
};

export type ChartSeam = { id: string; a: Edge[]; b: Edge[]; partial: boolean };

export const toChart = (p: ChartPlace, q: Pt2): Pt2 => {
  const x = (p.mirror ? 2 * p.cx - q[0] : q[0]) - p.cx;
  const y = q[1] - p.cy;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.cx + c * x - s * y + p.dx, p.cy + s * x + c * y + p.dy];
};

function bbox(pts: readonly Pt2[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Points of a run of edges, resampled at K by normalised arc length. */
function sample(edges: Edge[], K: number): { pts: Pt2[]; len: number } {
  const all: Pt2[] = [];
  for (const e of edges) all.push(...(all.length ? e.pts.slice(1) : e.pts));
  const cum = [0];
  for (let i = 1; i < all.length; i++)
    cum.push(cum[i - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
  const len = cum[cum.length - 1] || 1;
  const out: Pt2[] = [];
  let j = 0;
  for (let k = 0; k < K; k++) {
    const s = (len * k) / (K - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const w = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    const a = all[j];
    const b = all[Math.min(j + 1, all.length - 1)];
    out.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
  }
  return { pts: out, len };
}

/** Where an edge run sits on its piece: a vertical side (L/R) or a horizontal top/bottom. */
function sideOfRun(g: PieceGeom, edges: Edge[]): 'L' | 'R' | 'T' | 'B' {
  const first = edges[0].pts[0];
  const lastE = edges[edges.length - 1];
  const last = lastE.pts[lastE.pts.length - 1];
  const b = bbox(g.rs);
  let mx = 0;
  let my = 0;
  let n = 0;
  for (const e of edges)
    for (const p of e.pts) {
      mx += p[0];
      my += p[1];
      n++;
    }
  mx /= n;
  my /= n;
  const dx = Math.abs(last[0] - first[0]);
  const dy = Math.abs(last[1] - first[1]);
  if (dy > dx * 1.2) return mx < (b.x0 + b.x1) / 2 ? 'L' : 'R';
  return my < (b.y0 + b.y1) / 2 ? 'B' : 'T';
}

function inside(p: Pt2, ring: readonly Pt2[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}

const mirrorPts = (pts: Pt2[], cx: number): Pt2[] => pts.map(([x, y]) => [2 * cx - x, y]);

export function buildChart(
  pieces: readonly PieceGeom[],
  seams: readonly ChartSeam[],
  rootKey: string,
  /** Lay the root (and every later component's root) mirrored: the root is drawn face down. */
  rootMirror = false,
): Chart {
  const geom = new Map(pieces.map((g) => [g.pieceKey, g]));
  const place = new Map<string, ChartPlace>();
  const used = new Set<string>();
  const rejected: string[] = [];
  const components: ChartComponent[] = [];
  const cxOf = (k: string) => {
    const b = bbox(geom.get(k)!.rs);
    return (b.x0 + b.x1) / 2;
  };
  const cyOf = (k: string) => {
    const b = bbox(geom.get(k)!.rs);
    return (b.y0 + b.y1) / 2;
  };
  const boxes = new Map<string, ReturnType<typeof bbox>>();
  const boxOf = (k: string, p: ChartPlace) =>
    bbox(
      geom
        .get(k)!
        .rs.filter((_, i) => i % 8 === 0)
        .map((q) => toChart(p, q)),
    );
  // Overlap as AREA: interior sample points of the new piece that fall inside a placed piece.
  const samplesOf = new Map<string, Pt2[]>();
  const samples = (k: string) => {
    let out = samplesOf.get(k);
    if (out) return out;
    const g = geom.get(k)!;
    const b = bbox(g.rs);
    const ring = g.rs.filter((_, i) => i % 4 === 0);
    out = [];
    const step = Math.max(6, Math.sqrt(((b.x1 - b.x0) * (b.y1 - b.y0)) / 400));
    for (let y = b.y0 + step / 2; y < b.y1; y += step)
      for (let x = b.x0 + step / 2; x < b.x1; x += step) if (inside([x, y], ring)) out.push([x, y]);
    samplesOf.set(k, out);
    return out;
  };
  const ringsOf = new Map<string, Pt2[]>();
  const placedRing = (k: string) => {
    let r = ringsOf.get(k);
    if (!r) {
      const p = place.get(k)!;
      r = geom
        .get(k)!
        .rs.filter((_, i) => i % 4 === 0)
        .map((q) => toChart(p, q));
      ringsOf.set(k, r);
    }
    return r;
  };
  const overlaps = (k: string, p: ChartPlace, comp: string[]): string | null => {
    const pts = samples(k).map((q) => toChart(p, q));
    if (!pts.length) return null;
    const b = boxOf(k, p);
    for (const o of comp) {
      const c = boxes.get(o)!;
      if (
        Math.min(b.x1, c.x1) <= Math.max(b.x0, c.x0) ||
        Math.min(b.y1, c.y1) <= Math.max(b.y0, c.y0)
      )
        continue;
      const ring = placedRing(o);
      let n = 0;
      for (const q of pts) if (inside(q, ring)) n++;
      if (n / pts.length > 0.2)
        return `${o} ${Math.round((100 * n) / pts.length)}% mirror=${p.mirror}`;
    }
    return null;
  };

  // Usable seams: vertical side ↔ opposite vertical side, or bottom ↔ top.
  type Link = { s: ChartSeam; len: number };
  const links: Link[] = [];
  for (const s of seams) {
    const ka = s.a[0].pieceKey;
    const kb = s.b[0].pieceKey;
    if (ka === kb || !geom.has(ka) || !geom.has(kb)) continue;
    const sa = sideOfRun(geom.get(ka)!, s.a);
    const sb = sideOfRun(geom.get(kb)!, s.b);
    const okSide =
      (sa === 'L' && sb === 'R') ||
      (sa === 'R' && sb === 'L') ||
      (sa === 'L' && sb === 'L') ||
      (sa === 'R' && sb === 'R');
    const okStack = (sa === 'T' && sb === 'B') || (sa === 'B' && sb === 'T');
    if (!okSide && !okStack) {
      rejected.push(`${s.id}: sides ${sa}/${sb}`);
      continue;
    }
    const len = Math.max(...[s.a, s.b].map((r) => r.reduce((t, e) => t + e.lenMm, 0)));
    links.push({ s, len });
  }
  links.sort((p, q) => q.len - p.len || p.s.id.localeCompare(q.s.id));

  /** Translation (and mirror) that lays `to` against `from` already placed. */
  const fit = (from: Edge[], fromP: ChartPlace, to: Edge[], toKey: string, partial: boolean) => {
    const K = 24;
    const A0 = sample(from, K);
    const B0 = sample(to, K);
    const A = A0.pts.map((q) => toChart(fromP, q));
    const cx = cxOf(toKey);
    const all: { p: ChartPlace; rms: number }[] = [];
    for (const mirror of [false, true]) {
      const Bm = mirror ? mirrorPts(B0.pts, cx) : B0.pts;
      for (const rev of [true, false]) {
        const B = rev ? [...Bm].reverse() : Bm;
        // Partial: the short side lies on a sub-range of the long one, from either end.
        const anchors: [number, number][] = [[0, 1]];
        if (partial) {
          const r = Math.min(A0.len, B0.len) / Math.max(A0.len, B0.len);
          anchors.push([0, r], [1 - r, 1]);
        }
        for (const [t0, t1] of anchors) {
          const aShort = A0.len < B0.len;
          const pa: Pt2[] = [];
          const pb: Pt2[] = [];
          for (let k = 0; k < K; k++) {
            const t = k / (K - 1);
            const tl = t0 + t * (t1 - t0);
            const at = (arr: Pt2[], u: number): Pt2 => {
              const f = u * (K - 1);
              const i = Math.min(K - 2, Math.floor(f));
              const w = f - i;
              return [
                arr[i][0] + (arr[i + 1][0] - arr[i][0]) * w,
                arr[i][1] + (arr[i + 1][1] - arr[i][1]) * w,
              ];
            };
            pa.push(aShort || (t0 === 0 && t1 === 1) ? at(A, t) : at(A, tl));
            pb.push(aShort ? at(B, tl) : at(B, t));
          }
          // Rigid fit (Procrustes), rotation clamped to ±20°: panels stay near upright.
          let ax = 0;
          let ay = 0;
          let bx = 0;
          let by = 0;
          for (let k = 0; k < K; k++) {
            ax += pa[k][0];
            ay += pa[k][1];
            bx += pb[k][0];
            by += pb[k][1];
          }
          ax /= K;
          ay /= K;
          bx /= K;
          by /= K;
          let sd = 0;
          let sc = 0;
          for (let k = 0; k < K; k++) {
            const ux = pb[k][0] - bx;
            const uy = pb[k][1] - by;
            const vx = pa[k][0] - ax;
            const vy = pa[k][1] - ay;
            sd += ux * vx + uy * vy;
            sc += ux * vy - uy * vx;
          }
          const lim = (20 * Math.PI) / 180;
          const rot = Math.max(-lim, Math.min(lim, Math.atan2(sc, sd)));
          const c = Math.cos(rot);
          const sn = Math.sin(rot);
          const cy = cyOf(toKey);
          // x' = R(x − mb) + ma, written as rotation about the piece centre + translation.
          const qx = cx - bx;
          const qy = cy - by;
          const dx = c * qx - sn * qy + ax - cx;
          const dy = sn * qx + c * qy + ay - cy;
          let e = 0;
          for (let k = 0; k < K; k++) {
            const ux = pb[k][0] - bx;
            const uy = pb[k][1] - by;
            e += (c * ux - sn * uy + ax - pa[k][0]) ** 2 + (sn * ux + c * uy + ay - pa[k][1]) ** 2;
          }
          const rms = Math.sqrt(e / K) + (mirror ? 4 : 0) + (rev ? 0 : 2) + Math.abs(rot) * 15;
          all.push({ p: { dx, dy, mirror, cx, cy, rot }, rms });
        }
      }
    }
    return all.sort((x, y) => x.rms - y.rms);
  };

  const remaining = new Set(pieces.map((g) => g.pieceKey));
  let root = geom.has(rootKey) ? rootKey : pieces[0]?.pieceKey;
  while (root) {
    const comp = [root];
    const p0: ChartPlace = {
      dx: 0,
      dy: 0,
      mirror: rootMirror,
      cx: cxOf(root),
      cy: cyOf(root),
      rot: 0,
    };
    if (components.length) {
      // A later component stands to the right of everything placed (its position is decided in 3D).
      let xr = -Infinity;
      for (const b of boxes.values()) xr = Math.max(xr, b.x1);
      const b = bbox(geom.get(root)!.rs);
      p0.dx = xr + 200 - b.x0;
    }
    place.set(root, p0);
    boxes.set(root, boxOf(root, p0));
    remaining.delete(root);
    for (;;) {
      let progressed = false;
      for (const { s } of links) {
        const ka = s.a[0].pieceKey;
        const kb = s.b[0].pieceKey;
        const inA = comp.includes(ka);
        const inB = comp.includes(kb);
        if (inA === inB) continue;
        const [from, to, fromKey, toKey] = inA ? [s.a, s.b, ka, kb] : [s.b, s.a, kb, ka];
        if (!remaining.has(toKey)) continue;
        const la = from.reduce((t, e) => t + e.lenMm, 0);
        const lb = to.reduce((t, e) => t + e.lenMm, 0);
        const opts = fit(
          from,
          place.get(fromKey)!,
          to,
          toKey,
          s.partial || Math.min(la, lb) / Math.max(la, lb) < 0.97,
        );
        const len = Math.max(la, lb);
        let f: (typeof opts)[number] | null = null;
        let why = '';
        for (const o of opts) {
          if (o.rms > Math.max(16, 0.05 * len)) {
            why = why || `fit ${o.rms.toFixed(0)} mm`;
            break;
          }
          const ov = overlaps(toKey, o.p, comp);
          if (ov) {
            why = `overlap ${ov}`;
            continue;
          }
          f = o;
          break;
        }
        if (!f) {
          rejected.push(`${s.id}: ${why}`);
          continue;
        }
        place.set(toKey, f.p);
        boxes.set(toKey, boxOf(toKey, f.p));
        comp.push(toKey);
        remaining.delete(toKey);
        used.add(s.id);
        progressed = true;
        break;
      }
      if (!progressed) break;
    }
    components.push({ root, keys: comp });
    root = [...remaining].sort(
      (x, y) =>
        Math.abs(geom.get(y)!.areaMm2) - Math.abs(geom.get(x)!.areaMm2) || x.localeCompare(y),
    )[0];
  }
  return { place, components, used, rejected: [...new Set(rejected)] };
}
