import { describe, expect, it } from 'vitest';

import { card77Geoms } from '../card77.fixture';
import { withSignals, type SignalSide } from '../seam-signals';
import { outcomeOf, T_GUESS } from '../seam-ranker';

import fixture from './prior-labels.json';
import {
  buildPriorTable,
  MAX_PRIOR,
  ownFamilies,
  priorDelta,
  priorSignal,
  priorSignalFrom,
  runsOfSide,
  type PriorLabel,
  type PriorRun,
} from './prior';

// Card 77 carries card 6's pattern (the same DXF), so its pieces are card 6's pieces.
const geoms = card77Geoms();
const side = (...ids: string[]): SignalSide => {
  const edges = ids.map((id) => {
    const e = geoms.get(id.slice(0, id.lastIndexOf('#')))?.edges.find((x) => x.id === id);
    if (!e) throw new Error(`no edge ${id}`);
    return e;
  });
  return {
    ids,
    pieces: [...new Set(edges.map((e) => e.pieceKey))],
    lenMm: edges.reduce((t, e) => t + e.lenMm, 0),
    turnDeg: edges.reduce((t, e) => t + e.turnDeg, 0),
  };
};
const OUTER = { zone: 'outer' };
const labels = (fixture as { labels: PriorLabel[] }).labels;
const CARD6 = 'starvation';
const run = (name: string, share: number, turnDeg = 0, notches = 0): PriorRun => ({
  name,
  lenMm: 100,
  share,
  turnDeg,
  notches,
});
const kept = (family: string, a: PriorRun[], b: PriorRun[], kind = 'edge'): PriorLabel => ({
  family,
  kind,
  status: 'confirmed',
  a,
  b,
});

// Card 6's golden steps: the right pair and the wrong one the guess used to take.
const GOLDEN = {
  720: {
    right: [side('PLCK_L#0'), side('P_L_U#2', 'P_L_MAIN#2')],
    wrong: [side('PLCK_L#3'), side('PCK_L_MAIN#2')],
  },
  770: {
    right: [side('P_R_U#4'), side('P_R_MAIN#1')],
    wrong: [side('PCK_R_MAIN#4'), side('PCK_R_BTTM#2')],
  },
  870: {
    right: [side('clr_main#2'), side('CLR_SECOND#1')],
    wrong: [side('clr_main#0'), side('CLR_SECOND#3')],
  },
} as const;

describe('learned prior: the fixture', () => {
  it('holds only product names and edge shapes, no keys', () => {
    expect(JSON.stringify(fixture)).not.toMatch(/\b[0-9A-HJKMNP-TV-Z]{26}\b/);
    expect(new Set(labels.map((l) => l.family)).size).toBeGreaterThanOrEqual(2);
  });
});

describe('learned prior: card 6 never votes for itself', () => {
  const others = buildPriorTable(labels.filter((l) => l.family !== CARD6));
  const signal = priorSignalFrom(others);

  for (const [op, { right, wrong }] of Object.entries(GOLDEN)) {
    it(`step ${op}: silent rather than wrong — no other product kept these pieces together`, () => {
      expect(signal(right[0], right[1], { op: OUTER, geoms })).toBeNull();
      expect(signal(wrong[0], wrong[1], { op: OUTER, geoms })).toBeNull();
    });
  }
});

describe('learned prior: how it ranks once two products agree', () => {
  // Two other products kept «placket's long edge ↔ front» (the shape step 720 needs).
  const placket = runsOfSide(GOLDEN[720].right[0], geoms);
  const front = runsOfSide(GOLDEN[720].right[1], geoms);
  const table = buildPriorTable([
    kept('shirt a', placket, front, 'composite'),
    kept('shirt b', placket, front, 'composite'),
  ]);
  const signal = priorSignalFrom(table);

  it('step 720: the placket on the front edge rises above the placket on the pocket piece', () => {
    const [ra, rb] = GOLDEN[720].right;
    const [wa, wb] = GOLDEN[720].wrong;
    const right = signal(ra, rb, { op: OUTER, geoms });
    expect(right?.delta).toBeLessThan(0);
    expect(signal(wa, wb, { op: OUTER, geoms })).toBeNull();
    const ranked = withSignals(
      [
        { score: 0.095, a: wa, b: wb, tag: 'pocket' },
        { score: 0.11, a: ra, b: rb, tag: 'front' },
      ],
      { op: OUTER, geoms },
    );
    // The registry's own prior is the shipped fixture; this test layers the synthetic one on top.
    const lifted = ranked.map((c) => ({
      ...c,
      score: c.score + (signal(c.a, c.b, { op: OUTER, geoms })?.delta ?? 0),
    }));
    lifted.sort((x, y) => x.score - y.score);
    expect(lifted[0].tag).toBe('front');
  });

  it('one product is a habit, not a rule', () => {
    const one = buildPriorTable([kept('shirt a', placket, front, 'composite')]);
    expect(priorDelta(one, placket, front, 'composite')).toBeNull();
  });

  it('refusals subtract', () => {
    const refused = buildPriorTable([
      kept('shirt a', placket, front, 'composite'),
      kept('shirt b', placket, front, 'composite'),
      { ...kept('shirt c', placket, front, 'composite'), status: 'rejected' },
    ]);
    expect(priorDelta(refused, placket, front, 'composite')).toBeNull();
  });

  it('is capped, and only a bonus', () => {
    const many = buildPriorTable(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((f) => kept(f, placket, front, 'composite')),
    );
    expect(priorDelta(many, placket, front, 'composite')?.delta).toBeCloseTo(-MAX_PRIOR, 6);
  });

  it('a piece the dictionary cannot read keeps the prior silent', () => {
    const unread = [run('XQZ_1', 0.4)];
    const t = buildPriorTable([kept('a', unread, front), kept('b', unread, front)]);
    expect(priorDelta(t, unread, front, 'edge')).toBeNull();
  });
});

describe('learned prior: the step decides', () => {
  const placket = runsOfSide(GOLDEN[720].right[0], geoms);
  const front = runsOfSide(GOLDEN[720].right[1], geoms);
  const signal = priorSignalFrom(
    buildPriorTable([
      kept('shirt a', placket, front, 'composite'),
      kept('shirt b', placket, front, 'composite'),
    ]),
  );
  const [ra, rb] = GOLDEN[720].right;
  it('silent on pairs implied for earlier steps (no step)', () => {
    expect(signal(ra, rb, { op: undefined, geoms })).toBeNull();
  });
  it('silent when the step zone rules the pair out', () => {
    expect(signal(ra, rb, { op: { zone: 'armhole' }, geoms })).toBeNull();
    expect(signal(ra, rb, { op: { zone: 'TECH_CARD_GARMENT_ZONE_FRONT' }, geoms })).not.toBeNull();
  });
});

describe('learned prior: never makes a guess out of a pair geometry rejects', () => {
  it('a pair over the guess line stays a hand pick even with a prior bonus', () => {
    const best = {
      score: T_GUESS + 0.03 - 0.05,
      signals: [{ term: 'prior', delta: -0.05, reason: 'test' }],
    };
    expect(outcomeOf(best).outcome).toBe('manual');
  });
});

describe('learned prior: a product never votes for itself', () => {
  it('card 6 is recognised as starvation by its pieces, and only as starvation', () => {
    expect([...ownFamilies(labels, geoms)]).toEqual([CARD6]);
  });
  // Step 610: the two back-yoke layers. Starvation's own saved seams kept both their long flat
  // edges and their notched curve; counting that as a second product lifted the wrong one.
  it('step 610: the yoke layers get no habit from their own product', () => {
    expect(priorSignal(side('BP_U#5'), side('BP_U_1#5'), { op: OUTER, geoms })).toBeNull();
    expect(priorSignal(side('BP_U#2'), side('BP_U_1#2'), { op: OUTER, geoms })).toBeNull();
  });
});
