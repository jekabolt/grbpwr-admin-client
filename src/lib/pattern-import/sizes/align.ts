// sizes/ — aligning bundle lane sequences to size ranks.
//
// Every graded group is a sequence of lanes in lateral order, one per size, but its direction is
// unknown (a group is read from either side) and its lanes carry only an identity hint (a "unit":
// look / declared-dash class / OCG layer / text label; -1 = none). Alignment = choose each group's
// direction so that every unit lands on one position; positions are then ranks up to ONE global
// reversal, decided separately (inside/outside vote).
export type Group = {
  /** Unit of each lane in lateral order (-1 unknown) and its weight (length, mm). */
  units: number[];
  weights: number[];
  /** Chosen direction: false = lane k is position k; true = lane k is position n-1-k. */
  flip: boolean;
};

export type Alignment = {
  /** units × n weight matrix after alignment. */
  M: number[][];
  /** Best position per unit (-1 = never seen in a full group) and its purity (share of weight). */
  pos: number[];
  purity: number[];
  iterations: number;
};

function scoreOf(M: number[][], g: Group, n: number, flip: boolean, shift = 0): number {
  let s = 0;
  g.units.forEach((u, k) => {
    if (u < 0) return;
    const p = flip ? n - 1 - (k + shift) : k + shift;
    if (p < 0 || p >= n) return;
    s += M[u][p] * g.weights[k];
  });
  return s;
}

/** EM over full groups (exactly n lanes). Seeds from the group with the most distinct units. */
export function alignGroups(groups: Group[], nUnits: number, n: number): Alignment {
  const full = groups.filter((g) => g.units.length === n);
  const M = Array.from({ length: nUnits }, () => new Array(n).fill(0));
  if (!full.length)
    return { M, pos: new Array(nUnits).fill(-1), purity: new Array(nUnits).fill(0), iterations: 0 };
  const distinct = (g: Group) => new Set(g.units.filter((u) => u >= 0)).size;
  const seed = full.reduce((a, b) => {
    const da = distinct(a);
    const db = distinct(b);
    if (db !== da) return db > da ? b : a;
    return b.weights.reduce((x, y) => x + y, 0) > a.weights.reduce((x, y) => x + y, 0) ? b : a;
  });
  seed.flip = false;
  seed.units.forEach((u, k) => {
    if (u >= 0) M[u][k] += 1;
  });
  let it = 0;
  for (; it < 12; it++) {
    let changed = false;
    for (const g of full) {
      const f = scoreOf(M, g, n, false);
      const r = scoreOf(M, g, n, true);
      const flip = r > f;
      if (flip !== g.flip) changed = true;
      g.flip = flip;
    }
    for (const row of M) row.fill(0);
    for (const g of full)
      g.units.forEach((u, k) => {
        if (u >= 0) M[u][g.flip ? n - 1 - k : k] += g.weights[k];
      });
    if (!changed && it > 0) break;
  }
  const pos: number[] = [];
  const purity: number[] = [];
  for (let u = 0; u < nUnits; u++) {
    const row = M[u];
    const tot = row.reduce((a, b) => a + b, 0);
    let best = -1;
    let bw = 0;
    row.forEach((w, p) => {
      if (w > bw) {
        bw = w;
        best = p;
      }
    });
    pos.push(tot > 0 ? best : -1);
    purity.push(tot > 0 ? bw / tot : 0);
  }
  return { M, pos, purity, iterations: it };
}

/**
 * Place a partial group (fewer lanes than n) on positions: best shift and direction against M.
 * Returns the position per lane, or null when nothing in the group is known.
 */
export function placePartial(
  M: number[][],
  g: Group,
  n: number,
): { positions: number[]; score: number; margin: number } | null {
  const L = g.units.length;
  if (!g.units.some((u) => u >= 0)) return null;
  const cands: { flip: boolean; shift: number; s: number }[] = [];
  for (const flip of [false, true])
    for (let shift = 0; shift + L <= n; shift++)
      cands.push({ flip, shift, s: scoreOf(M, g, n, flip, shift) });
  cands.sort((a, b) => b.s - a.s);
  const best = cands[0];
  if (!best || best.s <= 0) return null;
  const second = cands[1]?.s ?? 0;
  return {
    positions: g.units.map((_, k) => (best.flip ? n - 1 - (k + best.shift) : k + best.shift)),
    score: best.s,
    margin: best.s > 0 ? 1 - second / best.s : 0,
  };
}
