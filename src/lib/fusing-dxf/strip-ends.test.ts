import { describe, expect, it } from 'vitest';
import { mapFuseSpecToSize, type FuseInternalLine } from './dxf';
import { edgeRunsOf, pointOnEdgeRun, type EdgePoint } from './edge-runs';
import {
  NOTCH_PICK_MM,
  carryStripEnd,
  notchesOnRun,
  type NotchResolver,
  type StripEndPair,
} from './strip-ends';
import { blankFuse, type FuseEdge, type PieceFuseSpec } from './types';

// Strip end modes against rings that start at another vertex or run the other way: the run index
// and its direction differ per size, the physical place of each end must not.
const rect = (w: number, h: number): EdgePoint[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
const rotate = <T>(points: readonly T[], k: number) => [...points.slice(k), ...points.slice(0, k)];
/** A notch as CLO writes it: a short tick starting on the cut, going inward. */
const notch = (x: number, y = 0, depth = 5): FuseInternalLine => ({
  layer: '4',
  closed: false,
  points: [
    { x, y },
    { x, y: y + (y === 0 ? depth : -depth) },
  ],
});
const strip = (edges: FuseEdge[]): PieceFuseSpec => ({ ...blankFuse('strip'), widthMm: 12, edges });

const base = rect(200, 100);
const size = rect(220, 110);
// Bottom run (run 0 on both): base notches at 50 and 150, size notches at 55 and 165.
const baseLines = [notch(50), notch(150), notch(100, 100)];
const sizeLines = [notch(55), notch(165), notch(110, 110)];
const internals = { base: baseLines, target: sizeLines };

function carry(spec: PieceFuseSpec, ring: EdgePoint[], lines = internals) {
  const guessed: string[] = [];
  const { edges } = mapFuseSpecToSize(spec, base, ring, null, lines, (what) => guessed.push(what));
  return { edges, guessed };
}

/** Where an edge's trimmed strip starts and ends on an outline. */
function placed(outline: readonly EdgePoint[], edge: FuseEdge) {
  const run = edgeRunsOf(outline)[edge.edge];
  return [
    pointOnEdgeRun(run, edge.startMm).point,
    pointOnEdgeRun(run, run.length - edge.endMm).point,
  ];
}

describe('strip end modes', () => {
  it('notch: each end lands on the same notch of the size, counted from its own corner', () => {
    const { edges, guessed } = carry(
      strip([{ edge: 0, startMm: 52, endMm: 48, startMode: 'notch', endMode: 'notch' }]),
      size,
    );
    // Start: next to notch 50 → size notch 55. End: 48 from the far corner = x 152 → notch 150 →
    // size notch 165 = 55 from the size's far corner.
    expect(edges).toEqual([
      { edge: 0, startMm: 55, endMm: 55, startMode: 'notch', endMode: 'notch' },
    ]);
    expect(guessed).toEqual([]);
  });

  it('a seam-line twin of a notch does not count', () => {
    expect(notchesOnRun(edgeRunsOf(base)[0], [...baseLines, notch(80, 10)])).toEqual([50, 150]);
  });

  it('notch far from every base notch keeps the mm and is reported', () => {
    const { edges, guessed } = carry(
      strip([{ edge: 0, startMm: 150 - NOTCH_PICK_MM - 5, endMm: 0, startMode: 'notch' }]),
      size,
      { base: [notch(150)], target: [notch(165)] },
    );
    expect(edges[0].startMm).toBe(150 - NOTCH_PICK_MM - 5);
    expect(guessed).toEqual(['notch']);
  });

  it('a different notch count on the size keeps the mm and is reported', () => {
    const { edges, guessed } = carry(
      strip([{ edge: 0, startMm: 52, endMm: 0, startMode: 'notch' }]),
      size,
      { base: baseLines, target: [notch(20), ...sizeLines] },
    );
    expect(edges[0].startMm).toBe(52);
    expect(guessed).toEqual(['notch']);
  });

  it('no notch on the size keeps the mm and is reported', () => {
    expect(
      carry(strip([{ edge: 0, startMm: 52, endMm: 0, startMode: 'notch' }]), size, {
        base: baseLines,
        target: [],
      }).guessed,
    ).toEqual(['notch']);
  });

  it('share and mm ends never report a guess', () => {
    const spec = strip([{ edge: 0, startMm: 52, endMm: 10, startMode: 'share' }]);
    expect(carry(spec, size, { base: [], target: [] }).guessed).toEqual([]);
  });

  const modes: FuseEdge[] = [
    { edge: 0, startMm: 52, endMm: 40, startMode: 'notch', endMode: 'share' },
    { edge: 2, startMm: 15, endMm: 25, startMode: 'share' },
  ];

  it('the same physical place whatever vertex the size ring starts at, or which way it runs', () => {
    const want = carry(strip(modes), size).edges.map((edge) => placed(size, edge));
    const rings = [1, 2, 3].map((k) => rotate(size, k));
    rings.push([...size].reverse(), rotate([...size].reverse(), 1), rotate([...size].reverse(), 3));
    const near = (a: EdgePoint, b: EdgePoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
    for (const ring of rings) {
      const { edges, guessed } = carry(strip(modes), ring);
      expect(guessed).toEqual([]);
      expect(edges).toHaveLength(want.length);
      for (const edge of edges) {
        const [s, e] = placed(ring, edge);
        // A reversed ring swaps the ends: compare as unordered pairs.
        expect(
          want.some(([ws, we]) => (near(ws, s) && near(we, e)) || (near(ws, e) && near(we, s))),
        ).toBe(true);
      }
    }
  });

  it('a reversed ring swaps the modes with the values', () => {
    const [edge] = carry(strip([modes[0]]), [...size].reverse()).edges;
    expect([edge.startMode, edge.endMode]).toEqual(['share', 'notch']);
  });

  it('carryStripEnd: share is the same fraction, a reversed pair measures from the other corner', () => {
    const [baseRun] = edgeRunsOf(base);
    const [run] = edgeRunsOf(size);
    const pair = { baseRun, run, reversed: true, baseLines, lines: sizeLines };
    expect(carryStripEnd(50, 'share', true, pair)).toEqual({ mm: 55, guessed: false });
    // Base start pairs with the size run's end: the base's first notch is the size's last one.
    expect(carryStripEnd(52, 'notch', true, pair)).toEqual({ mm: 55, guessed: false });
  });
});

describe('strip end notch found by the grade map', () => {
  const [baseRun] = edgeRunsOf(base);
  const [run] = edgeRunsOf(size);
  // Two size notches 3 mm apart next to the twin: order pairing cannot tell them apart.
  const crowded = [notch(55), notch(162), notch(165)];
  const pairOf = (lines: FuseInternalLine[], resolveNotch?: NotchResolver): StripEndPair => ({
    baseRun,
    run,
    reversed: false,
    baseLines,
    lines,
    resolveNotch,
  });
  /** The map's notch track for this piece: base notch on the cut → its twin. */
  const map: NotchResolver = (p) =>
    Math.abs(p.x - 50) < 1e-6
      ? { x: 55, y: 0 }
      : Math.abs(p.x - 150) < 1e-6
        ? { x: 162, y: 0 }
        : null;

  it('a map hit keeps that notch where order pairing is ambiguous', () => {
    expect(carryStripEnd(152, 'notch', true, pairOf(crowded))).toEqual({ mm: 152, guessed: true });
    expect(carryStripEnd(152, 'notch', true, pairOf(crowded, map))).toEqual({
      mm: 162,
      guessed: false,
    });
  });

  it('a map hit snaps onto the size notch it lands next to', () => {
    const nudged: NotchResolver = (p) => {
      const hit = map(p);
      return hit && { x: hit.x + 0.8, y: hit.y + 0.4 };
    };
    expect(carryStripEnd(152, 'notch', true, pairOf(crowded, nudged)).mm).toBe(162);
  });

  it('the map miss, or a hit on another run, falls back to order pairing', () => {
    const none: NotchResolver = () => null;
    const elsewhere: NotchResolver = () => ({ x: 220, y: 60 });
    const today = carryStripEnd(52, 'notch', true, pairOf(sizeLines));
    expect(today).toEqual({ mm: 55, guessed: false });
    expect(carryStripEnd(52, 'notch', true, pairOf(sizeLines, none))).toEqual(today);
    expect(carryStripEnd(52, 'notch', true, pairOf(sizeLines, elsewhere))).toEqual(today);
    expect(carryStripEnd(152, 'notch', true, pairOf(crowded, none)).guessed).toBe(true);
  });

  it('a map hit counts from the paired corner on a reversed ring', () => {
    const pair = { ...pairOf(crowded, map), reversed: true };
    // Base start pairs with the size run's end: the twin at x 162 is 58 from that end.
    expect(carryStripEnd(152, 'notch', true, pair)).toEqual({ mm: 58, guessed: false });
  });

  it('the map is never asked for an end far from every base notch', () => {
    let asked = 0;
    const counting: NotchResolver = (p) => (asked++, map(p));
    const far = 150 - NOTCH_PICK_MM - 5;
    expect(carryStripEnd(far, 'notch', true, pairOf(crowded, counting)).guessed).toBe(true);
    expect(asked).toBe(0);
  });
});
