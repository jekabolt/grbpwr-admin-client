import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Chain, ChainSet, LineClass, PieceCandidate, PtMm } from 'lib/pattern-import/types';

import { looseWallIds } from '../fill';
import { bboxOf, segNearest, signedArea } from '../geom';
import { GFIT_TOL_PDF } from './fit';
import { repairPass, setRepairProbeSink, type RepairProbe } from './repair-hook';
import { repairSize, type GfitWall } from './repair';

// The bodice of repair-draw.test.ts. `dw` / `dh` are the grade step; the draw tests use 6 and 8.
const ring = (r: number, dw = 6, dh = 8): PtMm[] => {
  const w = 200 + dw * r;
  const h = 300 + dh * r;
  const c = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h * 0.7 },
    { x: w * 0.55, y: h },
    { x: 0, y: h },
  ];
  const out: PtMm[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j < m; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
  }
  return out;
};

const FLAGS = [
  'GFIT_EDGE_ACCEPT',
  'GFIT_LOCAL_OFF',
  'GFIT_LOCAL_CORRIDOR',
  'GRADE_P2_LOOSE_OFF',
  'GRADE_DRAW_OFF',
];
// these pin repairSize's flags; the nest walk would take the families first
beforeEach(() => {
  process.env.GFIT_NEST_WALK = '0';
});
afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
  delete process.env.GFIT_NEST_WALK;
  setRepairProbeSink(null);
});

const opts = { tol: GFIT_TOL_PDF, frame: 'stacked' as const };

describe('GFIT_EDGE_ACCEPT', () => {
  // sizes 0–5 closed, size 6 open: one step past the last anchor
  const anchors = [0, 1, 2, 3, 4, 5].map((rank) => ({ rank, outer: ring(rank), anchor: true }));

  it('accepts size 6 when its own line is already there', () => {
    process.env.GFIT_EDGE_ACCEPT = '1';
    const r = repairSize(anchors, 6, [{ pts: ring(6), kind: 'own', closed: true }], opts);
    expect(r.refusals).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.extrapolated).toBe(true);
  });

  it('still refuses when that line is absent (E1-cover)', () => {
    process.env.GFIT_EDGE_ACCEPT = '1';
    const r = repairSize(anchors, 6, [], opts);
    expect(r.ok).toBe(false);
    expect(r.refusals).toContain('E1-cover');
    expect(r.extrapolated).toBe(true);
  });

  it('E5-on-anchor is the backstop when the line is the neighbour', () => {
    process.env.GFIT_EDGE_ACCEPT = '1';
    const r = repairSize(anchors, 6, [{ pts: ring(5), kind: 'own', closed: true }], opts);
    expect(r.ok).toBe(false);
    // The neighbour line also misses the extrapolated corridor, so E4 and E3 fire first. No case
    // was found where E1 passes and E5 is the only refusal; E5 stays as the backstop that names it.
    expect(r.refusals).toContain('E5-on-anchor');
  });

  it('flag off is not-bracketed, as before', () => {
    const r = repairSize(anchors, 6, [{ pts: ring(6), kind: 'own', closed: true }], opts);
    expect(r.refusals).toContain('not-bracketed');
    expect(r.extrapolated).toBeFalsy();
    expect(r.ok).toBe(false);
  });

  it('does not close an edge size on an unranked chain', () => {
    process.env.GFIT_EDGE_ACCEPT = '1';
    const loose = repairSize(anchors, 6, [{ pts: ring(6), kind: 'loose', closed: true }], opts);
    expect(loose.ok).toBe(false);
    expect(loose.looseSkipped).toBe('extrapolated');
    const own = repairSize(anchors, 6, [{ pts: ring(6), kind: 'own', closed: true }], opts);
    expect(own.ok).toBe(true);
    expect(own.extrapolated).toBe(true);
  });

  it('still refuses two steps past the edge, and with fewer than three anchors', () => {
    process.env.GFIT_EDGE_ACCEPT = '1';
    const two = repairSize(anchors, 7, [{ pts: ring(7), kind: 'own', closed: true }], opts);
    expect(two.refusals).toContain('not-bracketed');
    const few = repairSize(
      anchors.filter((a) => a.rank >= 4),
      6,
      [{ pts: ring(6), kind: 'own', closed: true }],
      opts,
    );
    expect(few.refusals).toContain('not-bracketed');
  });

  it('the hook lets the edge try through when drawing is off', () => {
    process.env.GRADE_DRAW_OFF = '1';
    const ctx = {
      set: { chains: [], classes: [], bundles: [], orphans: [], warnings: [] } as ChainSet,
      own: (r: number) => (r === 6 ? [{ chain: 1, pts: ring(6), closed: true }] : []),
      common: [],
      wm: { mode: 'graded' as const, byRank: [[]], common: [] },
      texts: [],
    };
    const offList = [0, 1, 2, 3, 4, 5, 6].map((rank) => cand(rank, rank === 6 ? 'leak' : 'closed'));
    const off = repairPass(new Map([[1, offList]]), ctx);
    expect(off.tried).toBe(0);
    expect(offList.find((c) => c.rank === 6)?.gradeHint?.refusals).toEqual(['not-bracketed']);

    process.env.GFIT_EDGE_ACCEPT = '1';
    const again = [0, 1, 2, 3, 4, 5, 6].map((rank) => cand(rank, rank === 6 ? 'leak' : 'closed'));
    const on = repairPass(new Map([[1, again]]), ctx);
    expect(on.tried).toBeGreaterThan(0);
    const leak = again.find((c) => c.rank === 6)!;
    expect(leak.outcome, JSON.stringify(leak.gradeHint ?? leak.gradeTryWhy)).toBe('closed');
    expect(leak.repair?.extrapolated).toBe(true);
  });
});

describe('GFIT_LOCAL_CORRIDOR', () => {
  // Width step 5 mm: design corridor on that side is ~1.85 mm, under the PDF edge tolerance
  // (2 mm), while 0.45 of the step (~2.25 mm) still reaches a line ~1.9 mm off the prediction.
  const dw = 5;
  const dh = 8;
  const body = (r: number) => ring(r, dw, dh);
  /** Push the right-hand edge out by `dx` (the side the grade moves). */
  const nudge = (pts: PtMm[], dx: number): PtMm[] => {
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return pts.map((p) =>
      p.x > maxX - 1 && p.y > 12 && p.y < maxY * 0.62 ? { x: p.x + dx, y: p.y } : p,
    );
  };
  // Alternating ±4 mm on the interior anchors: the family cannot agree, and leave-one-out
  // on the side is several mm. Rank 3 is the open size.
  const noisy = [0, 1, 2, 4, 5, 6].map((rank) => ({
    rank,
    outer: nudge(body(rank), [0, 4, -4, 0, 4, -4, 0][rank]),
    anchor: true,
  }));

  it('uses local anchors by default and preserves the disabled baseline', () => {
    expect(repairSize(noisy, 3, [], opts).local).toBeDefined();
    process.env.GFIT_LOCAL_OFF = '1';
    const disabled = repairSize(noisy, 3, [], opts);
    expect(disabled.local).toBeUndefined();
    expect(disabled.refusals).toContain('no-model');
  });

  const probe = (corridor: boolean) => {
    if (corridor) process.env.GFIT_LOCAL_CORRIDOR = '1';
    else delete process.env.GFIT_LOCAL_CORRIDOR;
    return repairSize(noisy, 3, [], opts);
  };

  /** A contiguous run of pred samples the flag's corridor opens, still under the edge tolerance. */
  const side = () => {
    const base = probe(false);
    const wide = probe(true);
    const pred = wide.pred ?? [];
    const n = pred.length;
    const maxX = Math.max(...pred.map((p) => p.x));
    const open = new Set(
      pred
        .map((_, i) => i)
        .filter((i) => {
          const b = base.corridor?.[i] ?? 0;
          const w = wide.corridor?.[i] ?? 0;
          const prev = pred[(i - 1 + n) % n];
          const next = pred[(i + 1) % n];
          // the right-hand edge: it moves in x, so a pure +x shift is the normal and stays at dx
          const upright = Math.abs(next.y - prev.y) > Math.abs(next.x - prev.x) * 2;
          return upright && pred[i].x > maxX - 4 && b < 1.92 && w >= 2.0 && w > b + 0.12;
        }),
    );
    let run: number[] = [];
    for (let i = 0; i < n; ) {
      if (!open.has(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && open.has(j)) j++;
      if (j - i > run.length) run = Array.from({ length: j - i }, (_, k) => i + k);
      i = j;
    }
    // Long enough to drop cover under 92 %, short enough that the same wall is not followed
    // across it (sameWall bridges a gap up to 1.5× its length).
    const want = Math.max(8, Math.round(n * 0.15));
    if (run.length > want) {
      const a = Math.max(0, Math.floor(run.length / 2) - Math.floor(want / 2));
      run = run.slice(a, a + want);
    }
    const maxBase = Math.max(...run.map((i) => base.corridor?.[i] ?? 0));
    const minWide = Math.min(...run.map((i) => wide.corridor?.[i] ?? 0));
    return { wide, run, maxBase, minWide, n, scatter: wide.local?.scatterMm };
  };

  it('accepts an own line off the prediction by the family scatter, and refuses it without the flag', () => {
    const { wide, run, maxBase, minWide, n, scatter } = side();
    expect(run.length / n, `scatter ${scatter} n ${n} run ${run.length}`).toBeGreaterThan(0.1);
    const dx = Math.min(1.9, minWide - 0.04);
    expect(dx, `scatter ${scatter} base ${maxBase} wide ${minWide}`).toBeGreaterThan(maxBase);
    const pred = wide.pred!;
    // The off stretch is its own wall, shifted along the edge normal. One closed wall would be
    // followed through the gap and the cover would not drop.
    const start = (run[run.length - 1] + 1) % n;
    const own: PtMm[] = [];
    for (let k = 0; k < n - run.length; k++) own.push(pred[(start + k) % n]);
    const shifted = run.map((i) => ({ x: pred[i].x + dx, y: pred[i].y }));
    let minD = Infinity;
    for (const i of run) {
      const p = pred[i];
      let d = Infinity;
      for (let k = 1; k < shifted.length; k++)
        d = Math.min(d, segNearest(p, shifted[k - 1], shifted[k]).d);
      minD = Math.min(minD, d);
    }
    expect(minD).toBeGreaterThan(maxBase);
    const wall: GfitWall[] = [
      { pts: own, kind: 'own' },
      { pts: shifted, kind: 'own' },
    ];
    delete process.env.GFIT_LOCAL_CORRIDOR;
    const off = repairSize(noisy, 3, wall, opts);
    expect(off.ok).toBe(false);
    expect(off.refusals).toContain('E1-cover');
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const on = repairSize(noisy, 3, wall, opts);
    expect(on.refusals, on.refusals.join(',')).toEqual([]);
    expect(on.ok).toBe(true);
    expect(on.local?.scatterMm).toBeGreaterThan(0);
  });

  it('refuses an own line that is the neighbour outline', () => {
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const seen = repairSize(noisy, 3, [], opts);
    expect(seen.local).toBeTruthy();
    const a1 = noisy.find((s) => s.rank === seen.local!.r1)!;
    const a2 = noisy.find((s) => s.rank === seen.local!.r2)!;
    const larger = Math.abs(signedArea(a1.outer)) >= Math.abs(signedArea(a2.outer)) ? a1 : a2;
    const r = repairSize(noisy, 3, [{ pts: larger.outer, kind: 'own', closed: true }], opts);
    expect(r.ok).toBe(false);
    expect(
      r.refusals.includes('E5-nest') || r.refusals.includes('E1-cover'),
      r.refusals.join(','),
    ).toBe(true);
  });

  it('a consistent family is unchanged', () => {
    const family = [0, 1, 2, 4].map((rank) => ({ rank, outer: body(rank), anchor: true }));
    const wall: GfitWall[] = [{ pts: body(3), kind: 'own', closed: true }];
    const off = repairSize(family, 3, wall, opts);
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const on = repairSize(family, 3, wall, opts);
    expect(on.ok).toBe(off.ok);
    expect(on.refusals).toEqual(off.refusals);
    expect(on.corridor).toEqual(off.corridor);
    expect(on.local).toBeUndefined();
  });

  it('fewer than two measurable anchors changes nothing', () => {
    // three anchors: only the middle one has a neighbour on both sides
    const family = [0, 2, 4].map((rank) => ({
      rank,
      outer: nudge(body(rank), rank === 2 ? 4 : 0),
      anchor: true,
    }));
    const wall: GfitWall[] = [{ pts: body(1), kind: 'own', closed: true }];
    const off = repairSize(family, 1, wall, opts);
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const on = repairSize(family, 1, wall, opts);
    expect(on.local?.scatterMm).toBeUndefined();
    expect(on.ok).toBe(off.ok);
    expect(on.refusals).toEqual(off.refusals);
    expect(on.corridor).toEqual(off.corridor);
  });

  it('a small step does not shrink the corridor below the design one', () => {
    const small = [0, 1, 2, 4, 5, 6].map((rank) => ({
      rank,
      outer: nudge(ring(rank, 2, 2), [0, 4, -4, 0, 4, -4, 0][rank]),
      anchor: true,
    }));
    const off = repairSize(small, 3, [], opts);
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const on = repairSize(small, 3, [], opts);
    expect(on.local?.scatterMm).toBeGreaterThan(0);
    expect(on.local?.scatterGap).toBeGreaterThan(0);
    expect(on.corridor?.length).toBeGreaterThan(0);
    on.corridor!.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(off.corridor![i] - 1e-9));
  });
});

describe('GRADE_P2_LOOSE', () => {
  const anchors = [0, 1, 3, 4].map((rank) => ({ rank, outer: ring(rank), anchor: true }));
  /** Rank 2's top edge, split into the line that is drawn and the open gap. */
  const split = (gap: number) => {
    const pts = ring(2);
    const h = 300 + 16;
    const inGap = (p: PtMm) => Math.abs(p.y - h) < 1e-6 && p.x > 30 && p.x < 30 + gap;
    const k = pts.findIndex((p, i) => inGap(p) && !inGap(pts[(i + pts.length - 1) % pts.length]));
    const rot = [...pts.slice(k), ...pts.slice(0, k)];
    return {
      own: rot.filter((p) => !inGap(p)),
      gap: pts.filter(inGap),
    };
  };

  it('repairs a hole whose only ink is an unranked chain in the size place', () => {
    const { own, gap } = split(30);
    const walls: GfitWall[] = [
      { pts: own, kind: 'own' },
      { pts: gap, kind: 'loose' },
    ];
    const on = repairSize(anchors, 2, walls, opts);
    expect(on.refusals, on.refusals.join(',')).toEqual([]);
    expect(on.ok).toBe(true);
    expect(on.usedWalls).toContain(1);
  });

  it('does not count the same chain when it lies on the neighbour', () => {
    // The neighbour is one step away and the corridor stops at half a step, so the corridor is
    // what excludes it. The quarter-step guard is the case below, where the step is under 1.2 mm.
    const { own } = split(30);
    const h3 = 300 + 24;
    const neighbour = ring(3).filter((p) => Math.abs(p.y - h3) < 1e-6 && p.x > 30 && p.x < 60);
    const walls: GfitWall[] = [
      { pts: own, kind: 'own' },
      { pts: neighbour, kind: 'loose' },
    ];
    const r = repairSize(anchors, 2, walls, opts);
    expect(r.ok).toBe(false);
    expect(r.refusals).toContain('E2-hole');
    expect(r.usedWalls).not.toContain(1);
  });

  it('the quarter-step guard excludes a neighbour line the corridor would allow', () => {
    // s ≈ 0.4 mm: the design corridor is 0.45 mm, so a line one step away is inside it, and only
    // the 0.25·s test (0.1 mm) keeps it off the neighbour.
    const fine = [0, 1, 3, 4].map((rank) => ({
      rank,
      outer: ring(rank, 0.4, 0.4),
      anchor: true,
    }));
    const pred = repairSize(fine, 2, [], opts).pred!;
    const h = 300 + 0.8;
    const onPred = pred.filter((p) => Math.abs(p.y - h) < 1e-6 && p.x > 20 && p.x < 50);
    const neighbour = ring(3, 0.4, 0.4).filter(
      (p) => Math.abs(p.y - (300 + 1.2)) < 1e-6 && p.x > 20 && p.x < 50,
    );
    expect(onPred.length).toBeGreaterThan(5);
    expect(neighbour.length).toBeGreaterThan(5);
    const cut = (p: PtMm) => Math.abs(p.y - h) < 1e-6 && p.x > 20 && p.x < 50;
    const left = pred.slice(0, pred.findIndex(cut));
    const right = pred.slice(pred.findLastIndex(cut) + 1);
    const kept = repairSize(
      fine,
      2,
      [
        { pts: left, kind: 'own' },
        { pts: right, kind: 'own' },
        { pts: onPred.map((p) => ({ x: p.x, y: p.y + 0.2 })), kind: 'loose' },
      ],
      opts,
    );
    const banned = repairSize(
      fine,
      2,
      [
        { pts: left, kind: 'own' },
        { pts: right, kind: 'own' },
        { pts: neighbour, kind: 'loose' },
      ],
      opts,
    );
    expect(kept.usedWalls).toContain(2);
    expect(banned.usedWalls).not.toContain(2);
    expect(banned.looseSkipped).toBeUndefined();
  });

  it('drops a loose chain that lies on the prediction for only a stretch', () => {
    const straight = [0, 1, 3, 4].map((rank) => ({ rank, outer: ring(rank), anchor: true }));
    const pred = repairSize(straight, 2, [], opts).pred!;
    const on = pred.filter((p) => p.y < 1 && p.x < 40);
    const off = pred
      .filter((p) => p.y < 1 && p.x >= 40 && p.x < 160)
      .map((p) => ({ x: p.x, y: p.y + 8 }));
    const own = pred.filter((p) => !(p.y < 1 && p.x < 160));
    const r = repairSize(
      straight,
      2,
      [
        { pts: own, kind: 'own' },
        { pts: [...on, ...off], kind: 'loose' },
      ],
      opts,
    );
    expect(r.looseDropped).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.usedWalls).not.toContain(1);
  });

  it('does not use a loose chain that only the widened corridor reaches', () => {
    const dw = 5;
    const nudge = (pts: PtMm[], dx: number): PtMm[] => {
      const maxX = Math.max(...pts.map((p) => p.x));
      const maxY = Math.max(...pts.map((p) => p.y));
      return pts.map((p) =>
        p.x > maxX - 1 && p.y > 12 && p.y < maxY * 0.62 ? { x: p.x + dx, y: p.y } : p,
      );
    };
    const family = [0, 1, 2, 4, 5, 6].map((rank) => ({
      rank,
      outer: nudge(ring(rank, dw, 8), [0, 4, -4, 0, 4, -4, 0][rank]),
      anchor: true,
    }));
    const base = repairSize(family, 3, [], opts);
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const wide = repairSize(family, 3, [], opts);
    const pred = wide.pred ?? [];
    const i = pred.findIndex(
      (_, k) => (wide.corridor?.[k] ?? 0) > (base.corridor?.[k] ?? 0) + 0.15,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const mid = ((base.corridor?.[i] ?? 0) + (wide.corridor?.[i] ?? 0)) / 2;
    const p = pred[i];
    const loose = [
      { x: p.x + mid, y: p.y - 3 },
      { x: p.x + mid, y: p.y + 3 },
    ];
    const r = repairSize(
      family,
      3,
      [
        { pts: pred.slice(0, i), kind: 'own' },
        { pts: pred.slice(i + 1), kind: 'own' },
        { pts: loose, kind: 'loose' },
      ],
      opts,
    );
    expect(r.looseSkipped).toBe('local');
    expect(r.usedWalls).not.toContain(2);
  });

  it('refuses a 25 mm run of the result on the larger anchor (E5-nest)', () => {
    const dw = 5;
    const nudge = (pts: PtMm[], dx: number): PtMm[] => {
      const maxX = Math.max(...pts.map((p) => p.x));
      const maxY = Math.max(...pts.map((p) => p.y));
      return pts.map((p) =>
        p.x > maxX - 1 && p.y > 12 && p.y < maxY * 0.62 ? { x: p.x + dx, y: p.y } : p,
      );
    };
    const family = [0, 1, 2, 4, 5, 6].map((rank) => ({
      rank,
      outer: nudge(ring(rank, dw, 8), [0, 4, -4, 0, 4, -4, 0][rank]),
      anchor: true,
    }));
    process.env.GFIT_LOCAL_CORRIDOR = '1';
    const pred = repairSize(family, 3, [], opts).pred ?? [];
    const anchor = family.find((s) => s.rank === 4)!.outer;
    const maxX = Math.max(...pred.map((p) => p.x));
    let taken = 0;
    const wall = pred.map((p) => {
      if (!(p.x > maxX - 1 && p.y > 80 && p.y < 105) || taken >= 25) return p;
      taken++;
      let best = anchor[0];
      let bd = Infinity;
      for (const q of anchor) {
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      return best;
    });
    expect(taken).toBe(25);
    const r = repairSize(family, 3, [{ pts: wall, kind: 'own', closed: true }], opts);
    expect(r.refusals).toContain('E5-nest');
  });

  it('flag off ignores the unranked chain', () => {
    process.env.GRADE_P2_LOOSE_OFF = '1';
    const { own, gap } = split(30);
    const walls: GfitWall[] = [
      { pts: own, kind: 'own' },
      { pts: gap, kind: 'loose' },
    ];
    const off = repairSize(anchors, 2, walls, opts);
    const bare = repairSize(anchors, 2, [{ pts: own, kind: 'own' }], opts);
    expect(off.ok).toBe(false);
    expect(off.refusals).toEqual(bare.refusals);
    expect(off.cover).toBe(bare.cover);
  });

  it('the hook puts a loose wall that meets the box onto the probe, and not when the flag is off', () => {
    const { own, gap } = split(30);
    const probes: RepairProbe[] = [];
    setRepairProbeSink((p) => probes.push(p));
    const ctx = {
      set: { chains: [], classes: [], bundles: [], orphans: [], warnings: [] } as ChainSet,
      own: (r: number) => (r === 2 ? [{ chain: 1, pts: own }] : []),
      common: [],
      wm: { mode: 'graded' as const, byRank: [[]], common: [] },
      texts: [],
      loose: [{ chain: 9, pts: gap }],
    };
    const list = () => [0, 1, 2, 3, 4].map((rank) => cand(rank, rank === 2 ? 'leak' : 'closed'));
    process.env.GRADE_DRAW_OFF = '1';
    process.env.GRADE_P2_LOOSE_OFF = '1';
    const offList = list();
    repairPass(new Map([[1, offList]]), ctx);
    expect(probes.some((p) => p.walls.some((w) => w.kind === 'loose'))).toBe(false);
    expect(offList.find((c) => c.rank === 2)?.outcome).toBe('leak');

    probes.length = 0;
    delete process.env.GRADE_P2_LOOSE_OFF;
    const onList = list();
    repairPass(new Map([[1, onList]]), ctx);
    const carried = probes
      .filter((p) => p.rank === 2)
      .flatMap((p) => p.walls)
      .filter((w) => w.kind === 'loose');
    expect(carried).toHaveLength(1);
    expect(carried[0].pts).toEqual(gap);
    expect(onList.find((c) => c.rank === 2)?.outcome).toBe('closed');

    // When its own ink already closes, even a nearby unassigned wall must not compete.
    probes.length = 0;
    const complete = list();
    repairPass(new Map([[1, complete]]), {
      ...ctx,
      own: (r) => (r === 2 ? [{ chain: 1, pts: ring(2), closed: true }] : []),
    });
    expect(complete.find((c) => c.rank === 2)?.outcome).toBe('closed');
    const plain = probes.filter((p) => p.rank === 2);
    expect(plain).toHaveLength(1);
    expect(plain[0].walls.some((w) => w.kind === 'loose')).toBe(false);
  });
});

describe('looseWallIds', () => {
  const chain = (id: number): Chain => ({
    id,
    pts: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    closed: false,
    ranges: [],
    motif: null,
    style: 0,
    lengthMm: 10,
  });
  const cls = (id: number, role: LineClass['role'], chains: number[]): LineClass => ({
    id,
    role,
    sizeLabel: null,
    chains,
    totalLengthMm: 10,
    evidence: [],
    confidence: 1,
  });

  it('never offers a notch or an internal chain, nor one a size already owns', () => {
    const set: Pick<ChainSet, 'chains' | 'classes'> = {
      chains: [1, 2, 3, 4, 5, 6].map(chain),
      classes: [
        cls(1, 'notch', [1]),
        cls(2, 'internal', [2]),
        cls(3, 'grain', [3]),
        cls(4, 'seam', [4]),
        cls(5, 'size', [5]),
      ],
    };
    // 5 is in a size row, 6 is excluded, 7 does not exist; 8 would be loose but is not in the set
    const ids = looseWallIds(set, new Set([5]), new Set([6]));
    expect(ids).toEqual([]);
    const loose = looseWallIds(
      { ...set, chains: [...set.chains, chain(8)] },
      new Set([5]),
      new Set([6]),
    );
    expect(loose).toEqual([8]);
  });
});

function cand(rank: number, outcome: 'closed' | 'leak'): PieceCandidate {
  const outer = outcome === 'closed' ? ring(rank) : [];
  return {
    seed: 1,
    rank,
    outer,
    walls: [],
    inside: [],
    textsInside: [],
    outcome,
    areaMm2: outer.length ? Math.abs(signedArea(outer)) : 0,
    bbox: outer.length ? bboxOf(outer) : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    sourceCoverage: outcome === 'closed' ? 1 : 0,
    p95Mm: 0,
    rankFrom: 'class',
    ...(outcome === 'leak' ? { leakAt: { x: 1, y: 1 } } : {}),
  };
}
