// sizes/ — ordering identity units (looks / declared classes) along the size axis.
//
// Full groups (every size side by side) are rare where sizes coincide (viola: 7 of 8 lanes almost
// everywhere). Seriation uses EVERY group: for two units seen in one group, |lane index difference|
// estimates |rank(u) − rank(v)|. Median differences form a distance matrix; a 1-D embedding (greedy
// placement + refinement) orders the units. Units that are fragments of one size (palto's dash
// looks that split by phase) land on the same coordinate and share a rank. A unit seen twice in
// one group (two sizes drawn alike) is flagged; its chains are ranked by their neighbours.
export type SerGroup = { units: number[]; turn: number };

export type Seriation = {
  /** Coordinate per unit (NaN = not placed), 0 = one end. */
  p: number[];
  /** How often a unit occurs twice in one group / how often it occurs at all. */
  selfRepeat: number[];
  support: number[];
  /** Mean |residual| of the embedding (lanes). */
  stress: number;
};

export function seriate(groups: SerGroup[], nUnits: number, maxSpan: number): Seriation {
  const diffs: number[][][] = Array.from({ length: nUnits }, () =>
    Array.from({ length: nUnits }, () => [] as number[]),
  );
  const selfRepeat = new Array(nUnits).fill(0);
  const support = new Array(nUnits).fill(0);
  for (const g of groups) {
    const seen = new Map<number, number[]>();
    g.units.forEach((u, k) => {
      if (u < 0) return;
      const a = seen.get(u);
      if (a) a.push(k);
      else seen.set(u, [k]);
    });
    for (const [u, ks] of seen) {
      support[u]++;
      if (ks.length > 1) selfRepeat[u]++;
    }
    const us = [...seen.entries()]
      .filter(([, ks]) => ks.length === 1)
      .map(([u, ks]) => [u, ks[0]] as const);
    for (let a = 0; a < us.length; a++)
      for (let b = a + 1; b < us.length; b++) {
        const d = Math.abs(us[a][1] - us[b][1]);
        if (d > maxSpan) continue;
        diffs[us[a][0]][us[b][0]].push(d);
        diffs[us[b][0]][us[a][0]].push(d);
      }
  }
  const D: number[][] = diffs.map((row) => row.map((l) => (l.length ? median(l) : NaN)));
  const W: number[][] = diffs.map((row) => row.map((l) => l.length));
  const p = new Array(nUnits).fill(NaN);
  const live = Array.from({ length: nUnits }, (_, u) => u).filter((u) => support[u] > 0);
  if (!live.length) return { p, selfRepeat, support, stress: 0 };
  // anchor: an end of the axis = the unit with the largest weighted mean distance
  let anchor = live[0];
  let best = -1;
  for (const u of live) {
    let s = 0;
    let w = 0;
    for (const v of live)
      if (W[u][v]) {
        s += D[u][v] * W[u][v];
        w += W[u][v];
      }
    const m = w ? s / w : 0;
    if (w >= 3 && m > best) {
      best = m;
      anchor = u;
    }
  }
  p[anchor] = 0;
  const placed = new Set([anchor]);
  const cost = (u: number, x: number) => {
    let c = 0;
    for (const v of placed)
      if (v !== u && W[u][v]) c += W[u][v] * (Math.abs(x - p[v]) - D[u][v]) ** 2;
    return c;
  };
  const bestX = (u: number) => {
    let bx = 0;
    let bc = Infinity;
    for (let x = -maxSpan; x <= 2 * maxSpan; x += 0.1) {
      const c = cost(u, x);
      if (c < bc) {
        bc = c;
        bx = x;
      }
    }
    return bx;
  };
  for (;;) {
    let next = -1;
    let nw = 0;
    for (const u of live) {
      if (placed.has(u)) continue;
      let w = 0;
      for (const v of placed) w += W[u][v];
      if (w > nw) {
        nw = w;
        next = u;
      }
    }
    if (next < 0) break;
    p[next] = bestX(next);
    placed.add(next);
  }
  for (let it = 0; it < 4; it++) for (const u of placed) if (u !== anchor) p[u] = bestX(u);
  let mn = Infinity;
  for (const u of placed) mn = Math.min(mn, p[u]);
  for (const u of placed) p[u] -= mn;
  let st = 0;
  let sw = 0;
  for (const u of placed)
    for (const v of placed)
      if (u < v && W[u][v]) {
        st += W[u][v] * Math.abs(Math.abs(p[u] - p[v]) - D[u][v]);
        sw += W[u][v];
      }
  return { p, selfRepeat, support, stress: sw ? st / sw : 0 };
}

/** Cut sorted coordinates into n ranks at the n−1 widest gaps (or by rounding when fewer units). */
export function ranksFromCoords(p: number[], n: number, weight: number[]): number[] {
  const units = p.map((x, u) => ({ u, x })).filter((e) => Number.isFinite(e.x) && weight[e.u] > 0);
  const out = new Array(p.length).fill(-1);
  if (!units.length) return out;
  units.sort((a, b) => a.x - b.x);
  const span = units[units.length - 1].x - units[0].x;
  // distinct coordinate clusters (units within 0.5 lane are one size)
  const clusters: { x: number; us: number[] }[] = [];
  for (const e of units) {
    const last = clusters[clusters.length - 1];
    if (last && e.x - last.x <= 0.5) {
      last.us.push(e.u);
      last.x = (last.x * (last.us.length - 1) + e.x) / last.us.length;
    } else clusters.push({ x: e.x, us: [e.u] });
  }
  // a look seen in a handful of sections (a stray notch-ticked stretch, zhaket's "irregular w0.35")
  // does not open a size of its own: fold weak clusters into their nearest neighbour first
  const wOf = (c: { us: number[] }) => c.us.reduce((a, u) => a + weight[u], 0);
  while (clusters.length > n) {
    const ws = clusters.map(wOf);
    const med = ws.slice().sort((a, b) => a - b)[ws.length >> 1];
    let k = -1;
    for (let i = 0; i < clusters.length; i++)
      if (ws[i] < 0.15 * med && (k < 0 || ws[i] < ws[k])) k = i;
    if (k < 0) break;
    const left = k > 0 ? clusters[k].x - clusters[k - 1].x : Infinity;
    const right = k + 1 < clusters.length ? clusters[k + 1].x - clusters[k].x : Infinity;
    const into = left <= right ? k - 1 : k + 1;
    clusters[into].us.push(...clusters[k].us);
    clusters.splice(k, 1);
  }
  if (clusters.length === n) {
    // one cluster per size: the order is all that matters (coordinates compress where sizes coincide)
    clusters.forEach((c, r) => {
      for (const u of c.us) out[u] = r;
    });
    return out;
  }
  if (clusters.length < n) {
    // place clusters on ranks by rounded coordinate, stretched when the axis is shorter than n−1
    const scale = span > 0 && span < n - 1 && clusters.length === n ? (n - 1) / span : 1;
    clusters.forEach((c) => {
      const r = Math.max(0, Math.min(n - 1, Math.round((c.x - units[0].x) * scale)));
      for (const u of c.us) out[u] = r;
    });
    return out;
  }
  // more clusters than sizes: cut at the n−1 widest gaps
  const gaps = clusters.slice(1).map((c, k) => ({ k: k + 1, g: c.x - clusters[k].x }));
  const cuts = new Set(
    gaps
      .sort((a, b) => b.g - a.g)
      .slice(0, n - 1)
      .map((g) => g.k),
  );
  let r = 0;
  clusters.forEach((c, k) => {
    if (k > 0 && cuts.has(k)) r++;
    for (const u of c.us) out[u] = r;
  });
  return out;
}

function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
