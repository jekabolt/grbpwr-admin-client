import { describe, expect, it } from 'vitest';

import type { Chain, PtMm } from '../types';
import { bridgeSameRank } from './land';

// A size line broken in two stays two chains and the size loses its outline. `bridgeSameRank`
// joins same-rank chains across a gap when their ends face each other along one direction.

/** A straight chain from a to b, a vertex every mm (the tangent is read over the last 5 mm). */
function line(id: number, a: PtMm, b: PtMm, motif: number[] | null): Chain {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(len));
  const pts = Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
  return { id, pts, closed: false, ranges: [], motif, style: 0, lengthMm: len };
}

const joinedAfter = (a: Chain, b: Chain, rankA = 0, rankB = 0) => {
  const chains = [a, b];
  const joined = bridgeSameRank(
    chains,
    new Map([
      [0, rankA],
      [1, rankB],
    ]),
  );
  return joined.size > 0;
};

describe('bridgeSameRank', () => {
  it('joins a dotted line across a 12 mm gap that wanders 2.7 mm sideways', () => {
    const a = line(0, { x: 0, y: 0 }, { x: 0, y: 100 }, [0, 1.25]);
    const b = line(1, { x: 2.7, y: 112 }, { x: 2.7, y: 200 }, [0, 1.25]);
    expect(joinedAfter(a, b)).toBe(true);
  });

  it('does not join a solid line across the same gap', () => {
    const a = line(0, { x: 0, y: 0 }, { x: 0, y: 100 }, null);
    const b = line(1, { x: 2.7, y: 112 }, { x: 2.7, y: 200 }, null);
    expect(joinedAfter(a, b)).toBe(false);
  });

  it('joins dots across 35 mm, not across 45 mm', () => {
    const a = line(0, { x: 0, y: 0 }, { x: 0, y: 100 }, [0, 1.25]);
    expect(joinedAfter(a, line(1, { x: 0, y: 135 }, { x: 0, y: 200 }, [0, 1.25]))).toBe(true);
    const a2 = line(0, { x: 0, y: 0 }, { x: 0, y: 100 }, [0, 1.25]);
    expect(joinedAfter(a2, line(1, { x: 0, y: 145 }, { x: 0, y: 200 }, [0, 1.25]))).toBe(false);
  });

  it('never joins two sizes', () => {
    const a = line(0, { x: 0, y: 0 }, { x: 0, y: 100 }, [0, 1.25]);
    const b = line(1, { x: 0, y: 105 }, { x: 0, y: 200 }, [0, 1.25]);
    expect(joinedAfter(a, b, 0, 1)).toBe(false);
  });
});
