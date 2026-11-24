import { expect, it } from 'vitest';
import type { IRPath, Style } from '../types';
import { keyedDashLoop } from './keyed-dash-loop';

it('follows the printed corner sequence around the label and refuses a missing or competing continuation', () => {
  const dash = [9, 1, 0.33, 1, 0.33, 1];
  const pen: Style = {
    id: 0,
    dash,
    widthMm: 0.35,
    strokeRgb: [32, 29, 30],
    clip: null,
    layer: null,
    fill: false,
  };
  const styles = [pen, { ...pen, id: 1, dash: null }, { ...pen, id: 2, dash: dash.slice(2) }];
  const paths: IRPath[] = [];
  for (let side = 0; side < 4; side++) {
    const turn = (u: number, v: number) => {
      for (let i = 0; i < side; i++) [u, v] = [-v, u];
      return { x: u, y: v };
    };
    const add = (style: number, pts: number[][]) =>
      paths.push({
        id: paths.length,
        style,
        closed: false,
        src: { file: 'a', page: side, op: paths.length + 1, sub: 0 },
        pts: pts.map(([x, y]) => turn(x, y)),
      });
    add(0, [
      [-5, -10],
      [7.5, -10],
    ]);
    add(1, [
      [8, -10],
      [10, -10],
      [10, -9],
    ]);
    add(2, [
      [10, -8],
      [10, -5.5],
    ]);
  }
  const seed = { x: 0, y: 0 };
  expect(keyedDashLoop({ paths, styles }, dash, pen, seed)?.paths.size).toBe(12);
  expect(keyedDashLoop({ paths: paths.slice(1), styles }, dash, pen, seed)).toBeNull();
  expect(
    keyedDashLoop({ paths: [...paths, { ...paths[0], id: 12 }], styles }, dash, pen, seed),
  ).toBeNull();
});

it('requires the full trailing gap of a plain dashed corner, including corners under a tile label', () => {
  const dash = [4.7, 1];
  const pen: Style = {
    id: 0,
    dash,
    widthMm: 0.35,
    strokeRgb: [32, 29, 30],
    clip: null,
    layer: null,
    fill: false,
  };
  const styles = [pen, { ...pen, id: 1, dash: null }];
  const paths: IRPath[] = [];
  for (let side = 0; side < 4; side++) {
    const rotate = ([x, y]: number[]) => {
      for (let i = 0; i < side; i++) [x, y] = [-y, x];
      return { x, y };
    };
    for (const [index, points] of [
      [
        [-7, -10],
        [7.5, -10],
      ],
      [
        [8, -10],
        [10, -10],
        [10, -8],
      ],
    ].entries()) {
      paths.push({
        id: paths.length,
        pts: points.map(rotate),
        closed: false,
        style: index,
        src: { file: '0', page: side, op: paths.length, sub: 0 },
        ...(index === 1 ? { background: 'tile-label' as const } : {}),
      });
    }
  }
  const seed = { x: 0, y: 0 };
  expect(keyedDashLoop({ paths, styles }, dash, pen, seed)?.paths.size).toBe(8);
  paths[1].pts.pop();
  expect(keyedDashLoop({ paths, styles }, dash, pen, seed)).toBeNull();
});
