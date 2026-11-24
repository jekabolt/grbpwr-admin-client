import { describe, expect, it } from 'vitest';
import type { Chain, IRPath, LineClass, PtMm } from '../types';
import { foldedTriangle, triangleMarkLoop } from './triangle-mark-loop';

function printedPiece() {
  const paths: IRPath[] = [];
  const point = (x: number, y: number) => ({ x, y });
  const mark = (origin: PtMm, dir: PtMm, page: number, op: number) => {
    const at = (x: number, y: number) =>
      point(origin.x + dir.x * x - dir.y * y, origin.y + dir.y * x + dir.x * y);
    const id = paths.length;
    paths.push({
      id,
      pts: [at(0.75, -0.3), at(-0.75, -0.3), at(0.1, 0.3)],
      closed: true,
      style: 0,
      src: { file: 'fixture', page, op, sub: 0 },
    });
    return { path: id, from: 0, to: 2 };
  };
  const legend = Array.from({ length: 8 }, (_, k) => mark(point(k * 2, -20), point(1, 0), 0, k));
  const corners = [point(0, 0), point(0, 20), point(20, 20), point(20, 0)];
  const sides = corners.map((a, i) => {
    const b = corners[(i + 1) % 4],
      u = point((b.x - a.x) / 20, (b.y - a.y) / 20);
    return Array.from({ length: 10 }, (_, k) =>
      mark(point(a.x + (1 + k * 2) * u.x, a.y + (1 + k * 2) * u.y), u, i + 1, k),
    );
  });
  const chain = (id: number, pts: PtMm[], ranges: Chain['ranges'], lengthMm: number): Chain => ({
    id,
    pts,
    ranges,
    lengthMm,
    closed: false,
    motif: [0, 2],
    style: 0,
  });
  const chains = [
    chain(0, [point(0, -20), point(14, -20)], legend, 14),
    chain(1, corners.slice(0, 3), sides[0].concat(sides[1]), 40),
    chain(2, [corners[2], corners[3], corners[0]], sides[2].concat(sides[3]), 40),
  ];
  const classes: LineClass[] = [
    {
      id: 1,
      role: 'size',
      sizeLabel: 'S',
      chains: [1, 2],
      totalLengthMm: 80,
      confidence: 1,
      evidence: [
        {
          kind: 'legend-sample',
          label: 'S',
          chain: 0,
          at: point(0, -20),
          textAt: point(-2, -20),
          distanceMm: 2,
          score: 1,
          second: 0,
          alike: [],
          nestingOnly: false,
        },
      ],
    },
  ];
  const read = (walls = [1, 7, 2]) =>
    triangleMarkLoop(
      {
        paths,
        styles: [
          {
            id: 0,
            fill: true,
            widthMm: 0,
            strokeRgb: [0, 0, 0],
            layer: null,
            clip: null,
            dash: null,
          },
        ],
      },
      { chains, classes },
      { sizes: [{ rank: 0, classId: 1, label: 'S', file: null }] },
      0,
      point(10, 10),
      walls,
    );
  return { read, chains, corners, classes };
}

describe('a mixed wall detour with a complete triangular size row', () => {
  it('uses both own chains and keeps all four turns at joined sheets', () => {
    const p = printedPiece(),
      s = p.read();
    expect(s?.walls).toEqual([1, 2]);
    for (const corner of p.corners)
      expect(s?.pts.some((v) => Math.hypot(v.x - corner.x, v.y - corner.y) < 1e-8)).toBe(true);
    expect(p.read([1, 2])).toBeNull();
  });
  it('refuses an interrupted perimeter or an indistinguishable legend', () => {
    const missing = printedPiece();
    missing.chains[1].ranges.splice(4, 3);
    expect(missing.read()).toBeNull();
    const duplicate = printedPiece();
    duplicate.classes.push({ ...duplicate.classes[0], id: 3, sizeLabel: 'M' });
    expect(duplicate.read()).toBeNull();
  });
});

it('retains the transverse cap of a printed hairpin instead of intersecting its distant arms', () => {
  const half = 0.32,
    prev = { x: 0, y: -1 },
    next = { x: -0.2, y: Math.sqrt(0.96) };
  const b = { x: next.y * half, y: -next.x * half };
  const a = { x: b.x + 0.75 * next.x, y: b.y + 0.75 * next.y };
  const mark: IRPath = {
    id: 1,
    closed: true,
    style: 0,
    src: { file: 'fixture', page: 0, op: 0, sub: 0 },
    pts: [a, b, { x: -half, y: 0 }, { x: -half, y: 0.75 }, { x: 0.9, y: -1.4 }],
  };
  const points = foldedTriangle(mark, prev, next, half);
  expect(points).toHaveLength(3);
  expect(Math.hypot(points![1].x, points![1].y)).toBeLessThan(1e-8);
});
