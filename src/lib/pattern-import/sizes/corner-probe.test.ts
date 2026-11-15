import { afterEach, describe, expect, it } from 'vitest';

import type { Chain, PtMm, Style } from '../types';
import { closeCorners, setCornerProbeSink, type CornerProbe } from './corners';
import {
  diffCounts,
  diffLinks,
  linksOf,
  liteProbe,
  nonFiniteCount,
  outKey,
  replayCornerProbe,
} from './corner-probe';

// The probe is the exact input of one closeCorners call; the replay must give the recorded output
// bit for bit (through JSON), or it cannot judge a patch. Scene: ten corners closed by stubs (the
// sheet's convention) and one open corner at (2000, 0) closed by CROSS (corners.test.ts).

const STYLE: Style = {
  id: 0,
  strokeRgb: [32, 29, 30],
  widthMm: 0.35,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
};
let next = 0;
const poly = (pts: PtMm[]): Chain => {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { id: next++, pts, closed: false, ranges: [], motif: null, style: 0, lengthMm: len };
};
const line = (a: PtMm, b: PtMm): Chain => {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  return poly(
    Array.from({ length: n + 1 }, (_, i) => ({
      x: a.x + ((b.x - a.x) * i) / n,
      y: a.y + ((b.y - a.y) * i) / n,
    })),
  );
};

function scene(crossing: boolean) {
  next = 0;
  const own: Chain[] = [];
  const other: Chain[] = [];
  for (let k = 0; k < 10; k++) {
    const x = k * 100;
    own.push(line({ x: x - 50, y: 0 }, { x: x - 5, y: 0 }));
    own.push(line({ x, y: 50 }, { x, y: 5 }));
    other.push(
      poly([
        { x: x - 5, y: 0 },
        { x, y: 0 },
        { x, y: 5 },
      ]),
    );
  }
  own.push(line({ x: 1950, y: 0 }, { x: 1996, y: 0 }));
  own.push(line({ x: 2000, y: 50 }, { x: 2000, y: 4 }));
  const chains = [...own, ...other].map((c, id) => ({ ...c, id }));
  if (crossing) {
    chains.push({ ...line({ x: 1998.5, y: 0 }, { x: 2001.5, y: 0 }), id: chains.length });
    chains.push({ ...line({ x: 2000, y: -1.5 }, { x: 2000, y: 1.5 }), id: chains.length });
  }
  const rankOf = new Map(own.map((_, i) => [i, 0]));
  const run = () =>
    closeCorners(
      chains,
      rankOf,
      new Map([[0, STYLE]]),
      (c) => rankOf.get(c) === 0,
      (c) => !rankOf.has(c),
      1,
      [],
    );
  return { chains, rankOf, run };
}

function capture(crossing: boolean): CornerProbe {
  const got: CornerProbe[] = [];
  setCornerProbeSink((p) => got.push(p));
  scene(crossing).run();
  setCornerProbeSink(null);
  expect(got).toHaveLength(1);
  return got[0];
}
/** what a file on disk gives back */
const viaJson = (p: CornerProbe): CornerProbe => JSON.parse(JSON.stringify(p));

afterEach(() => setCornerProbeSink(null));

describe('corner probe', () => {
  it('records the input and the output of the call', () => {
    const p = capture(true);
    expect(p.chains.length).toBeGreaterThan(30);
    expect(p.own.length).toBe(p.chains.length);
    expect(p.cand.length).toBe(p.chains.length);
    expect(p.rankOf[0]).toEqual([0, 0]);
    expect(p.out.stubs).toBe(10);
    expect(p.out.extended).toBe(1);
  });

  it('records nothing without a sink', () => {
    const got: CornerProbe[] = [];
    scene(true).run();
    expect(got).toHaveLength(0);
  });

  it('replays through JSON to the recorded output, bit for bit', () => {
    for (const crossing of [true, false]) {
      const p = capture(crossing);
      expect(nonFiniteCount(p)).toBe(0);
      expect(outKey(replayCornerProbe(viaJson(p)))).toBe(outKey(p.out));
    }
  });

  it('keeps rankOf in insertion order (it fixes the order of ends and pairs)', () => {
    const p = viaJson(capture(true));
    const rev = { ...p, rankOf: [...p.rankOf].reverse() };
    // the same set in another order is another input: the probe must carry the real one
    expect(p.rankOf.map(([c]) => c)).toEqual([...p.rankOf.map(([c]) => c)].sort((a, b) => a - b));
    expect(rev.rankOf[0][0]).not.toBe(p.rankOf[0][0]);
  });

  it('a lite probe drops the chains no loop reaches and still replays identically', () => {
    const p = capture(true);
    const lite = liteProbe(p);
    expect(outKey(replayCornerProbe(viaJson(lite)))).toBe(outKey(p.out));
    expect(JSON.stringify(lite).length).toBeLessThanOrEqual(JSON.stringify(p).length);
  });

  it('shows the closed link: pair of ends, vertex, gap, arms, not wide', () => {
    const p = capture(true);
    const links = linksOf(p.rankOf, p.out).filter((l) => l.rule === 'extend');
    expect(links).toHaveLength(1);
    const l = links[0];
    expect(l.rank).toBe(0);
    expect(l.via!.x).toBeCloseTo(2000, 1);
    expect(l.via!.y).toBeCloseTo(0, 1);
    expect(l.gapMm).toBeGreaterThan(4);
    expect(l.gapMm).toBeLessThan(8);
    expect(l.wide).toBe(false);
  });

  it('diffs two outputs by link: a closed corner that goes away is "removed"', () => {
    const withX = capture(true);
    const without = capture(false);
    const a = linksOf(withX.rankOf, withX.out);
    const b = linksOf(without.rankOf, without.out);
    const d = diffLinks(a, b);
    expect(d.removed.map((l) => l.rule)).toEqual(['extend']);
    expect(d.added).toHaveLength(0);
    expect(d.same).toBe(10);
    expect(diffLinks(a, a).same).toBe(a.length);
    expect(diffCounts(withX.out, without.out)).toEqual(
      expect.arrayContaining([
        'extended 1 → 0',
        'crossed 1 → 0',
        'refused "extend: off the trend" 0 → 1',
      ]),
    );
  });
});
