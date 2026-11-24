import { expect, it } from 'vitest';
import type { IRPath, Chain, LineClass, Style } from '../types';
import { ringStrokeLoop } from './ring-stroke-loop';

it('follows the shared vertex of two masked dashes and refuses a missing arm', () => {
  const pen: Style = {
    id: 0,
    widthMm: 0.5,
    layer: null,
    strokeRgb: [0, 0, 0],
    fill: false,
    dash: null,
    clip: null,
  };
  const styles = [pen, { ...pen, id: 1, widthMm: 0.35 }, { ...pen, id: 2, clip: 'corner:0,0,4,4' }];
  const paths: IRPath[] = [],
    chains: Chain[] = [];
  function add(side: number, style: number, points: number[][], closed = false) {
    const pts = points.map(([x, y]) => {
      for (let i = 0; i < side; i++) [x, y] = [-y, x];
      return { x, y };
    });
    const id = paths.length;
    paths.push({ id, style, pts, closed, src: { file: '0', page: side, op: 30 * id, sub: 0 } });
    return id;
  }
  function mark(side: number, style: number, points: number[][]) {
    const id = add(side, style, points);
    const [x, y] = points[0];
    const ring = add(
      side,
      1,
      [
        [x - 0.55, y],
        [x - 0.4, y + 0.15],
        [x - 0.25, y],
        [x - 0.4, y - 0.15],
        [x - 0.55, y],
      ],
      true,
    );
    paths[ring].src.op = paths[id].src.op + 9;
    return [id, ring];
  }
  for (let side = 0; side < 4; side++) {
    const ids = mark(side, 0, [
      [-4.5, -9],
      [-1.5, -9],
    ]);
    ids.push(
      ...mark(side, 0, [
        [2.5, -9],
        [5.5, -9],
      ]),
    );
    ids.push(
      ...mark(side, 2, [
        [8, -9],
        [9, -9],
        [9.5, -9],
      ]),
    );
    ids.push(
      ...mark(side, 2, [
        [9, -9.5],
        [9, -9],
        [9, -8],
      ]),
    );
    chains.push({
      id: side,
      style: 0,
      closed: false,
      lengthMm: 5,
      pts: [],
      ranges: ids.map((path) => ({ path, from: 0, to: 1 })),
      motif: [1],
      markPeriod: '=ooo',
    });
  }
  const at = { x: 0, y: 0 };
  const classes: LineClass[] = [
    {
      id: 0,
      role: 'size',
      sizeLabel: 'T',
      totalLengthMm: 20,
      confidence: 1,
      chains: [0, 1, 2, 3],
      evidence: [
        {
          kind: 'legend-sample',
          chain: 0,
          label: 'T',
          at,
          textAt: at,
          distanceMm: 0,
          score: 1,
          second: 0,
          alike: [],
          nestingOnly: false,
        },
      ],
    },
  ];
  const read = (paths: IRPath[]) =>
    ringStrokeLoop(
      { styles, paths },
      { chains, classes },
      { sizes: [{ rank: 0, label: 'T', classId: 0, file: null }] },
      0,
      at,
    );
  expect(read(paths)?.pts).toContainEqual({ x: 9, y: -9 });
  expect(read(paths.filter((p) => p.id !== 4))).toBeNull();
});
