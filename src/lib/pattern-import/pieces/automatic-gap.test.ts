import { describe, expect, it } from 'vitest';
import type { ChainSet, PtMm, Sheet, SizeRun } from '../types';
import { recoverAutomaticGaps } from './automatic-gap';
import { startSession } from './operator';

function example() {
  const pt = (x: number, y: number) => ({ x, y });
  const ring = (d: number) => [pt(d, d), pt(100 - d, d), pt(100 - d, 100 - d), pt(d, 100 - d)];
  const lines: PtMm[][] = [
    ring(10),
    [pt(48, 5), pt(5, 5), pt(5, 95), pt(95, 95), pt(95, 5), pt(52, 5)],
    ring(0),
  ];
  const chains = lines.map((pts, id) => ({
    id,
    pts,
    closed: id !== 1,
    ranges: [{ path: id, from: 0, to: pts.length }],
    lengthMm: 400,
    style: id,
    motif: null,
  }));
  const set: ChainSet = {
    chains,
    classes: chains.map(({ id }) => ({
      id,
      role: 'size',
      sizeLabel: String(id),
      chains: [id],
      totalLengthMm: 400,
      confidence: 1,
      evidence: [],
    })),
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const sheet: Sheet = {
    id: 0,
    bbox: { minX: -5, minY: -5, maxX: 105, maxY: 105 },
    poses: [],
    pairs: [],
    missing: [],
    texts: [],
    rasters: [],
    warnings: [],
    styles: chains.map(({ id }) => ({
      id,
      widthMm: 0.2,
      strokeRgb: [0, 0, 0],
      dash: null,
      fill: false,
      layer: null,
      clip: null,
    })),
    paths: chains.map(({ id, pts, closed, style }) => ({
      id,
      pts,
      closed,
      style,
      src: { file: 'pdf', page: 0, op: id, sub: 0 },
    })),
  };
  const run: SizeRun = {
    encoding: 'color',
    sizes: chains.map(({ id }) => ({ rank: id, label: String(id), classId: id, file: null })),
    evidence: [],
  };
  const session = startSession(
    sheet,
    set,
    run,
    [{ id: 1, origin: 'click', variant: null, at: pt(50, 50) }],
    { cellMm: 0.5, snapMm: 0.3, variant: null, grade: 'off' },
  );
  // Withhold the middle cut. Keep the native neighbour outlines and the original middle-size pen.
  session.families[0].candidates[1] = {
    ...session.families[0].candidates[1],
    walls: [],
    outer: [],
    areaMm2: 0,
    outcome: 'leak',
    leakAt: pt(50, 5),
    gradeHint: { pred: ring(5), from: [0, 2], refusals: ['E2-hole'] },
    derived: undefined,
  };
  return session;
}

describe('automatic gap replay', () => {
  it('recovers a withheld middle cut from its pen, retaining both neighbours and no wall edit', () => {
    const session = example();
    const first = recoverAutomaticGaps(session);
    const [lo, target, hi] = first[0].candidates;
    expect(target.outcome).toBe('closed');
    expect(target.gapRecovery?.chains).toEqual([1]);
    expect(target.areaMm2).toBeCloseTo(8100, -1);
    expect(target.derived?.[0].kind).toBe('bridge');
    expect(lo).toBe(session.families[0].candidates[0]);
    expect(hi).toBe(session.families[0].candidates[2]);
    expect(recoverAutomaticGaps(session)).toBe(first);
    expect(session.walls.bridges).toHaveLength(0);
    expect(session.families[0].candidates[1].outcome).toBe('leak');
  });
  it('keeps a leak when the nearby stroke belongs to another size', () => {
    const session = example();
    session.set.classes[1].sizeLabel = '2';
    expect(recoverAutomaticGaps(session)[0].candidates[1].outcome).toBe('leak');
  });
  it('closes two supported gaps in one contour without keeping either edit in the session', () => {
    const session = example();
    const chain = session.set.chains[1];
    // The second opening is halfway along the opposite side of this size.
    const tail = { ...chain, id: 3, pts: [{ x: 55, y: 95 }, ...chain.pts.slice(3)] };
    chain.pts = [...chain.pts.slice(0, 3), { x: 45, y: 95 }];
    session.set.chains.push(tail);
    session.set.classes[1].chains.push(3);
    const candidate = recoverAutomaticGaps(session)[0].candidates[1];
    expect(candidate.outcome).toBe('closed');
    expect(candidate.gapRecovery?.bridges).toHaveLength(2);
    expect(candidate.derived?.map((d) => d.kind)).toEqual(['bridge', 'bridge']);
    expect(session.walls.bridges).toHaveLength(0);
    // The second gap now exceeds the bridge budget. The first may not be accepted alone.
    tail.pts[0] = { x: 57, y: 95 };
    chain.pts[3] = { x: 43, y: 95 };
    expect(recoverAutomaticGaps({ ...session })[0].candidates[1].outcome).toBe('leak');
  });
  it('uses a source-confirmed neighbour when the earlier grade pass had no prediction', () => {
    const session = example();
    const [lo, target] = session.families[0].candidates;
    delete target.gradeHint;
    expect(recoverAutomaticGaps(session)[0].candidates[1].outcome).toBe('leak');
    lo.sourceOutline = { path: 0, key: 0 };
    // A source reader may snap the cut differently from the isolated wall refill.
    lo.outer = lo.outer.map((p) => ({ x: p.x + 0.25, y: p.y }));
    const result = recoverAutomaticGaps({ ...session })[0].candidates;
    expect(result[1].outcome).toBe('closed');
    expect(result[1].gapRecovery?.sourceAnchors).toEqual([0, 2]);
    expect(result[0]).toBe(lo);
  });
  it('leaves two rival size assignments unresolved', () => {
    const session = example();
    session.set.classes[2].chains.push(1);
    expect(recoverAutomaticGaps(session)[0].candidates[1].outcome).toBe('leak');
  });
  it('preserves an opening on an accepted missing tile', () => {
    const session = example();
    session.sheet.holes = [
      {
        row: 0,
        col: 0,
        sheet: 0,
        box: session.sheet.bbox,
        open: session.sheet.bbox,
        lineEnds: 0,
        origin: 'operator',
      },
    ];
    expect(recoverAutomaticGaps(session)).toBe(session.families);
  });
  it('rejects a trial if final notch cleanup changes an existing cut', () => {
    const session = example();
    const result = recoverAutomaticGaps(session, undefined, (state) => {
      const family = state.families[0];
      if (family.candidates[1].outcome !== 'closed') return state.families;
      // A newly closed rank changes the majority used to clean a placement mark on another size.
      const lower = family.candidates[0];
      return [
        {
          ...family,
          candidates: [{ ...lower, outer: lower.outer.slice(1) }, ...family.candidates.slice(1)],
        },
      ];
    });
    expect(result).toBe(session.families);
  });

  it('respects an explicitly ignored line', () => {
    const session = example();
    session.walls.exclude.push(1);
    expect(recoverAutomaticGaps(session)[0].candidates[1].outcome).toBe('leak');
  });
});
