import { afterEach, describe, expect, it } from 'vitest';

import type { ContinuityEdge, PieceCandidate } from '../types';
import { continuityVerdicts } from './fill';

// The far-wall trap (open-lines journal, "faster loop C"): a continuity closure's growth is judged
// against a band built from EVERY anchor pair of the family, so a size that starts closing at the
// far end of the grade moves the verdict of a size it never touches. MOOD_LOCAL_BAND judges it by
// the anchor pairs around its own rank only.

/** A square piece of the given area, centred at the origin. */
function square(rank: number, area: number, from: PieceCandidate['rankFrom'] = 'class') {
  const h = Math.sqrt(area) / 2;
  const outer = [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
  ];
  const c: PieceCandidate = {
    seed: 1,
    rank,
    outer,
    walls: [],
    inside: [],
    textsInside: [],
    outcome: 'closed',
    areaMm2: area,
    bbox: { minX: -h, minY: -h, maxX: h, maxY: h },
    sourceCoverage: 1,
    p95Mm: 0,
    rankFrom: from,
  };
  if (from === 'continuity') c.continuity = [{ bracket: false } as unknown as ContinuityEdge];
  return c;
}

const A0 = 10_000;
/** anchors 0–2 grow 2 % a size; rank 3 closed through a continuity wall 7 % above rank 2 */
const near = () => [
  square(0, A0),
  square(1, A0 * 1.02),
  square(2, A0 * 1.02 ** 2),
  square(3, A0 * 1.02 ** 2 * 1.07, 'continuity'),
];
/** two far anchors: rank 8 on the 2 % trend, rank 9 a 20 % jump */
const far = () => [square(8, A0 * 1.02 ** 8), square(9, A0 * 1.02 ** 8 * 1.2)];

const verdict = (list: PieceCandidate[]) => continuityVerdicts(list).refused.has(3);

describe('continuityVerdicts · growth band', () => {
  afterEach(() => {
    delete process.env.MOOD_LOCAL_BAND;
  });

  it('by default a far anchor pair widens the band and flips a near verdict (the trap)', () => {
    expect(verdict(near())).toBe(true);
    expect(verdict([...near(), ...far()])).toBe(false);
  });

  it('MOOD_LOCAL_BAND: the near verdict does not depend on the far anchors', () => {
    process.env.MOOD_LOCAL_BAND = '1';
    expect(verdict(near())).toBe(true);
    expect(verdict([...near(), ...far()])).toBe(true);
  });

  it('MOOD_LOCAL_BAND: a closure on the local trend is still kept', () => {
    process.env.MOOD_LOCAL_BAND = '1';
    const list = [...near().slice(0, 3), square(3, A0 * 1.02 ** 3, 'continuity'), ...far()];
    expect(verdict(list)).toBe(false);
  });
});
