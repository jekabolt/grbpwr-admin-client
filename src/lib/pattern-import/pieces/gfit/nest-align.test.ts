import { describe, expect, it } from 'vitest';

import type { PtMm } from 'lib/pattern-import/types';

import { nestAlign, nestAlignOracle, type AlignChain, type NestAlignIn } from './nest-align';

/** Rectangle grown from the origin: left and bottom are one fold, right and top grade. */
const rect = (r: number, gw = 10, gh = 8) => {
  const w = 100 + gw * r;
  const h = 80 + gh * r;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
};

const edge = (a: PtMm, b: PtMm, n = 20): PtMm[] => {
  const out: PtMm[] = [];
  for (let i = 0; i <= n; i++)
    out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  return out;
};

type Built = {
  inp: NestAlignIn;
  right: number[];
  top: number[];
};

/** Six sizes. `gapAt` drops 30 mm from that size's top. `swap` exchanges two sizes' pipeline ranks. */
function nest(opts: {
  gapAt?: number;
  swap?: [number, number];
  noise?: boolean;
  ask?: boolean;
  /** grade step in x and y. Default 10 and 8, both wider than the ask band. */
  grow?: [number, number];
  etalon?: number;
}): Built {
  const n = 6;
  const chains: AlignChain[] = [];
  const byRank: number[][] = Array.from({ length: n }, () => []);
  const common: number[] = [];
  let id = 0;
  const add = (pts: PtMm[], rank: number | 'common', style = 1) => {
    chains.push({ id, pts, style, motif: null });
    if (rank === 'common') common.push(id);
    else byRank[rank].push(id);
    return id++;
  };
  const gw = opts.grow?.[0] ?? 10;
  const gh = opts.grow?.[1] ?? 8;
  const box = (r: number) => rect(r, gw, gh);
  const max = box(n - 1);
  add(edge({ x: 0, y: 0 }, { x: 0, y: max[2].y }), 'common', 9);
  add(edge({ x: 0, y: 0 }, { x: max[1].x, y: 0 }), 'common', 9);
  const right: number[] = [];
  const top: number[] = [];
  for (let r = 0; r < n; r++) {
    const q = box(r);
    if (opts.ask && (r === 4 || r === 5)) {
      if (r === 4) {
        const mid = (box(4)[1].x + box(5)[1].x) / 2;
        right[r] = add(edge({ x: mid, y: 0 }, { x: mid, y: box(4)[2].y }), r, 30);
        right[5] = right[r];
      }
    } else {
      right[r] = add(edge(q[1], q[2]), r, 1 + r);
    }
    if (opts.gapAt === r) {
      const y = q[2].y;
      const w = q[1].x;
      top[r] = add(edge({ x: 0, y }, { x: 20, y }), r, 1 + r);
      add(edge({ x: 50, y }, { x: w, y }), r, 1 + r);
    } else if (!(opts.ask && (r === 4 || r === 5))) {
      top[r] = add(edge(q[3], q[2]), r, 1 + r);
    } else if (r === 4) {
      top[r] = add(edge(box(4)[3], box(4)[2]), r, 1 + r);
      top[5] = add(edge(box(5)[3], box(5)[2]), 5, 6);
    }
  }
  if (opts.swap) {
    const [a, b] = opts.swap;
    const ia = byRank[a].indexOf(right[a]);
    const ib = byRank[b].indexOf(right[b]);
    byRank[a][ia] = right[b];
    byRank[b][ib] = right[a];
  }
  if (opts.noise) add(edge({ x: 20, y: 25 }, { x: 60, y: 25 }, 8), 0, 7);
  // the noise chain was pushed onto rank 0; pull it off so it is unranked
  if (opts.noise) {
    const noise = chains[chains.length - 1].id;
    byRank[0] = byRank[0].filter((x) => x !== noise);
  }
  const sizes = Array.from({ length: n }, (_, r) => ({
    rank: r,
    step: r,
    outer: opts.gapAt === r ? null : box(r),
  }));
  if (opts.ask) {
    sizes[4].outer = null;
    sizes[5].outer = null;
  }
  return { inp: { sizes, chains, byRank, common, etalon: opts.etalon ?? 2 }, right, top };
}

describe('nestAlign', () => {
  it('(a) draws a 30 mm hole and keeps the derived share under 15%', () => {
    const { inp } = nest({ gapAt: 3 });
    const out = nestAlign(inp);
    expect(out.why).toBeUndefined();
    const s = out.sizes[3];
    expect(s.redraw).toBe(true);
    expect(s.holesMm).toBeGreaterThan(20);
    expect(s.holesMm).toBeLessThan(45);
    expect(s.derivedShare).toBeLessThan(0.15);
    expect(s.cross).toBe(false);
    expect(s.ok).toBe(true);
  });

  it('(b) reports two chains whose pipeline rank is swapped', () => {
    const { inp, right } = nest({ swap: [1, 2] });
    const out = nestAlign(inp);
    const moved = new Map(out.moves.map((m) => [m.id, m]));
    expect(moved.get(right[1])).toMatchObject({ from: 2, to: 1 });
    expect(moved.get(right[2])).toMatchObject({ from: 1, to: 2 });
  });

  it('(c) keeps the fold as one common line', () => {
    const { inp } = nest({});
    const out = nestAlign(inp);
    expect(out.why).toBeUndefined();
    const fold = inp.common;
    for (const id of fold) expect(out.common.map((c) => c.id)).toContain(id);
    expect(out.sizes.every((s) => s.derivedShare < 0.05)).toBe(true);
  });

  it('does not call a line a few mm off the fold common', () => {
    const { inp } = nest({});
    const id = inp.chains.length;
    const stray: AlignChain = {
      id,
      pts: edge({ x: 4, y: 0 }, { x: 4, y: 200 }),
      style: 40,
      motif: null,
    };
    const out = nestAlign({ ...inp, chains: [...inp.chains, stray] });
    expect(out.common.map((c) => c.id)).not.toContain(id);
    expect(out.sizes.every((s) => s.chains.every((c) => c.id !== id))).toBe(true);
  });

  it('(d) does not give an interior line to any size', () => {
    const { inp } = nest({ noise: true });
    const noise = inp.chains[inp.chains.length - 1].id;
    const out = nestAlign(inp);
    expect(out.sizes.every((s) => s.chains.every((c) => c.id !== noise))).toBe(true);
    expect(out.common.every((c) => c.id !== noise)).toBe(true);
  });

  it('(e) asks when two sizes share a style and the step does not separate them', () => {
    const { inp, right } = nest({ ask: true });
    const out = nestAlign(inp);
    const ask = out.asks.find((a) => a.chain === right[4]);
    expect(ask).toBeTruthy();
    expect(ask!.mm).toBeGreaterThanOrEqual(10);
    expect(ask!.ranks).toEqual(expect.arrayContaining([4, 5]));
    expect(out.moves.find((m) => m.id === right[4] && m.to !== 'ask')).toBeUndefined();
    expect(out.sizes[4].chains.every((c) => c.id !== right[4])).toBe(true);
    expect(out.sizes[5].chains.every((c) => c.id !== right[4])).toBe(true);
  });

  it('assigns a graded edge when the step is narrower than the ask band', () => {
    const { inp, right } = nest({ grow: [2, 2] });
    const out = nestAlign({ ...inp, tune: { costs: 'step' } });
    expect(out.why).toBeUndefined();
    for (const r of [0, 1, 3, 4, 5]) {
      expect(out.sizes[r].chains.map((c) => c.id)).toContain(right[r]);
      expect(out.asks.find((a) => a.chain === right[r])).toBeUndefined();
      expect(out.common.find((c) => c.id === right[r])).toBeUndefined();
    }
  });

  it('stops the ray at the first other ring and still takes that ring', () => {
    const { inp, right } = nest({ grow: [15, 15], etalon: 5 });
    const out = nestAlign({ ...inp, tune: { ray: 'first' } });
    expect(out.why).toBeUndefined();
    // rank 4 is the first ring inward of the etalon; rank 0 sits two rings further in
    expect(out.sizes[4].chains.map((c) => c.id)).toContain(right[4]);
    expect(out.sizes[0].chains.map((c) => c.id)).not.toContain(right[0]);
  });

  it('oracle reads the closed ring and names the edge, with no pen and no vote', () => {
    const { inp, right } = nest({ grow: [2, 2], etalon: 5 });
    const out = nestAlignOracle(inp);
    for (const r of [0, 1, 2, 3, 4, 5]) {
      expect(out.sizes[r].chains.map((c) => c.id)).toContain(right[r]);
    }
    expect(out.asks).toEqual([]);
    expect(out.common).toEqual([]);
  });
});
