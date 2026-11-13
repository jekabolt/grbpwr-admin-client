import type { PtMm } from 'lib/pattern-import/types';
import { describe, expect, it } from 'vitest';
import { mapFuseSpecToSize, type FuseInternalLine, type FuseInternals } from './dxf';
import fixture from './p-lin-l-2.fixture.json';
import { blankFuse, type FuseSpline, type PieceFuseSpec } from './types';
import { zoneGrade } from './zone-grade';

// A ring in 'follow_line' mode finds its line's twin on the other size by the grade field's
// geometric pairing: the file's order of lines, where a closed line starts and which way it runs
// do not matter. Base → size → base returns the ring within 0.1 mm.
type Mode = FuseSpline['gradeMode'];
type Move = (p: PtMm) => PtMm;
const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const worst = (a: readonly PtMm[], b: readonly PtMm[]) =>
  Math.max(...a.map((p, i) => dist(p, b[i])));

// A five-sided piece that scales; a welt box inside it turns 8° and slides on the bigger size.
const piece: PtMm[] = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 260 },
  { x: 180, y: 420 },
  { x: 0, y: 420 },
];
const scale: Move = (p) => ({ x: p.x * 1.1, y: p.y * 1.06 });
const target = piece.map(scale);
const turn = (8 * Math.PI) / 180;
const boxMotion: Move = (p) => {
  const x = p.x - 150;
  const y = p.y - 150;
  return {
    x: 172 + Math.cos(turn) * x - Math.sin(turn) * y,
    y: 159 + Math.sin(turn) * x + Math.cos(turn) * y,
  };
};
const box: FuseInternalLine = {
  layer: '8',
  closed: true,
  points: [
    { x: 110, y: 140 },
    { x: 190, y: 140 },
    { x: 190, y: 160 },
    { x: 110, y: 160 },
  ],
};
const fold: FuseInternalLine = {
  layer: '8',
  closed: false,
  points: [
    { x: 30, y: 330 },
    { x: 150, y: 330 },
  ],
};
const second: FuseInternalLine = {
  layer: '8',
  closed: true,
  points: [
    { x: 40, y: 230 },
    { x: 90, y: 230 },
    { x: 90, y: 260 },
    { x: 40, y: 260 },
  ],
};
const sized = (line: FuseInternalLine, move: Move): FuseInternalLine => ({
  ...line,
  points: line.points.map(move),
});
const internals: FuseInternals = {
  base: [box, fold, second],
  target: [sized(box, boxMotion), sized(fold, scale), sized(second, scale)],
};
const reverse = (lines: FuseInternals): FuseInternals => ({
  base: lines.target,
  target: lines.base,
});

/** A patch round the welt, 12 mm off the box. */
const patch: PtMm[] = [
  { x: 98, y: 128 },
  { x: 202, y: 128 },
  { x: 202, y: 172 },
  { x: 98, y: 172 },
];
const onBox = { x: 150, y: 140 };
const zoneOf = (points: PtMm[], gradeMode?: Mode, anchor?: PtMm): PieceFuseSpec => ({
  ...blankFuse('zone'),
  zone: {
    spline: { points, ...(gradeMode ? { gradeMode } : {}), ...(anchor ? { anchor } : {}) },
    holes: [],
    islands: [],
  },
});
const outer = (spec: PieceFuseSpec): FuseSpline => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return spec.zone.spline;
};
const sides = (s: readonly PtMm[]) => s.map((p, i) => dist(p, s[(i + 1) % s.length]));

describe('follow_line: the twin by geometry', () => {
  const carried = (lines: FuseInternals) => {
    const guesses: string[] = [];
    const spline = outer(
      mapFuseSpecToSize(zoneOf(patch, 'follow_line', onBox), piece, target, null, lines, (w) =>
        guesses.push(w),
      ),
    );
    return { spline, guesses };
  };

  it('the ring turns and slides with its line, its size in mm kept', () => {
    const { spline, guesses } = carried(internals);
    expect(guesses).toEqual([]);
    expect(worst(spline.points, patch.map(boxMotion))).toBeLessThan(0.01);
    expect(dist(spline.anchor!, boxMotion(onBox))).toBeLessThan(0.01);
    sides(spline.points).forEach((d, i) => expect(d).toBeCloseTo(sides(patch)[i], 6));
  });

  it('the size file lists its lines in another order', () => {
    const shuffled = { ...internals, target: [...internals.target].reverse() };
    expect(worst(carried(shuffled).spline.points, patch.map(boxMotion))).toBeLessThan(0.01);
  });

  it("the size's closed line starts at another corner and runs the other way", () => {
    const moved = sized(box, boxMotion).points;
    const restarted = [moved[2], moved[1], moved[0], moved[3]];
    const lines = {
      ...internals,
      target: [{ ...box, points: restarted }, ...internals.target.slice(1)],
    };
    expect(worst(carried(lines).spline.points, patch.map(boxMotion))).toBeLessThan(0.01);
  });

  it('the size has one more line of the same layer', () => {
    const extra: FuseInternalLine = {
      ...fold,
      points: [
        { x: 60, y: 400 },
        { x: 200, y: 400 },
      ],
    };
    const lines = { ...internals, target: [extra, ...internals.target] };
    const { spline, guesses } = carried(lines);
    expect(guesses).toEqual([]);
    expect(worst(spline.points, patch.map(boxMotion))).toBeLessThan(0.01);
  });

  it('its line missing on the size: carried as with no mode, flagged as a guess', () => {
    const lost = { ...internals, target: internals.target.slice(1) };
    const { spline, guesses } = carried(lost);
    expect(guesses).toEqual(['line']);
    const plain = outer(mapFuseSpecToSize(zoneOf(patch), piece, target, null, lost));
    expect(worst(spline.points, plain.points)).toBe(0);
  });

  it('an anchor on an unpaired line is a guess, not the neighbour line', () => {
    const stray: FuseInternalLine = {
      layer: '4',
      closed: false,
      points: [
        { x: 40, y: 40 },
        { x: 80, y: 40 },
      ],
    };
    const guesses: string[] = [];
    mapFuseSpecToSize(
      zoneOf(patch, 'follow_line', { x: 60, y: 40 }),
      piece,
      target,
      null,
      { ...internals, base: [...internals.base, stray] },
      (w) => guesses.push(w),
    );
    expect(guesses).toEqual(['line']);
  });

  it('grow: every point follows the grade field', () => {
    const grade = zoneGrade(piece, target, internals);
    const spline = outer(mapFuseSpecToSize(zoneOf(patch, 'grow'), piece, target, null, internals));
    expect(worst(spline.points, patch.map(grade.point))).toBeLessThan(1e-9);
    expect(Math.abs(sides(spline.points)[0] - sides(patch)[0])).toBeGreaterThan(1);
  });

  it.each<[Mode, PtMm | undefined]>([
    [undefined, undefined],
    ['follow_line', onBox],
    ['grow', undefined],
  ])('round trips base → size → base and size → base → size (%s)', (mode, anchor) => {
    const there = mapFuseSpecToSize(zoneOf(patch, mode, anchor), piece, target, null, internals);
    const back = outer(mapFuseSpecToSize(there, target, piece, null, reverse(internals)));
    expect(worst(back.points, patch)).toBeLessThan(0.1);
    if (anchor) expect(dist(back.anchor!, anchor)).toBeLessThan(0.1);
    const onSize = outer(there);
    const down = mapFuseSpecToSize(
      zoneOf(onSize.points, mode, onSize.anchor),
      target,
      piece,
      null,
      reverse(internals),
    );
    const up = outer(mapFuseSpecToSize(down, piece, target, null, internals));
    expect(worst(up.points, onSize.points)).toBeLessThan(0.1);
  });

  it('a hole moves as its follow_line or grow ring', () => {
    const hole = [
      { x: 130, y: 145 },
      { x: 170, y: 145 },
      { x: 170, y: 155 },
      { x: 130, y: 155 },
    ];
    for (const mode of ['follow_line', 'grow'] as const) {
      const spec = zoneOf(patch, mode, mode === 'follow_line' ? onBox : undefined);
      if (!spec.zone || !('spline' in spec.zone)) throw new Error('spline');
      spec.zone.holes = [{ points: hole }];
      const out = mapFuseSpecToSize(spec, piece, target, null, internals);
      if (!out.zone || !('spline' in out.zone)) throw new Error('spline');
      const by = mode === 'follow_line' ? boxMotion : zoneGrade(piece, target, internals).point;
      expect(worst(out.zone.holes[0].points, hole.map(by))).toBeLessThan(0.01);
    }
  });
});

// The first case builds the card's field cold (a few seconds on a busy machine).
describe('follow_line and grow on card 8 (P_LIN_L_2)', { timeout: 60_000 }, () => {
  type Size = keyof typeof fixture.rings;
  const ring = (size: Size): PtMm[] => fixture.rings[size].map(([x, y]) => ({ x, y }));
  const lines = (size: Size): FuseInternalLine[] =>
    fixture.internals[size].map((line) => ({
      layer: line.layer,
      closed: line.closed,
      points: line.points.map(([x, y]) => ({ x, y })),
    }));
  const welt = lines('M').find((line) => line.closed)!;
  const anchor = welt.points[0];
  const c = {
    x: welt.points.reduce((s, p) => s + p.x, 0) / welt.points.length,
    y: welt.points.reduce((s, p) => s + p.y, 0) / welt.points.length,
  };
  const around = [
    { x: c.x - 40, y: c.y - 25 },
    { x: c.x + 40, y: c.y - 25 },
    { x: c.x + 40, y: c.y + 25 },
    { x: c.x - 40, y: c.y + 25 },
  ];

  it.each<[Size, Mode]>([
    ['S', 'follow_line'],
    ['XL', 'follow_line'],
    ['S', 'grow'],
    ['XL', 'grow'],
  ])('M → %s → M, %s', (size, mode) => {
    const lm: FuseInternals = { base: lines('M'), target: lines(size) };
    const guesses: string[] = [];
    const there = mapFuseSpecToSize(
      zoneOf(around, mode, mode === 'follow_line' ? anchor : undefined),
      ring('M'),
      ring(size),
      null,
      lm,
      (w) => guesses.push(w),
    );
    expect(guesses).toEqual([]);
    const back = outer(mapFuseSpecToSize(there, ring(size), ring('M'), null, reverse(lm)));
    expect(worst(back.points, around)).toBeLessThan(0.1);
    if (mode === 'follow_line')
      sides(outer(there).points).forEach((d, i) => expect(d).toBeCloseTo(sides(around)[i], 6));
  });
});
