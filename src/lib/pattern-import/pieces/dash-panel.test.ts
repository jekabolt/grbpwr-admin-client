import { expect, it } from 'vitest';
import type { Chain, ChainSet, IRPath, LineClass, PtMm, Style } from '../types';
import { dashPanelLoops } from './dash-panel';

function fixture() {
  const point = (x: number, y: number): PtMm => ({ x, y });
  const base: Style = {
    id: 0,
    clip: null,
    layer: null,
    widthMm: 0.35,
    dash: [5, 1],
    fill: false,
    strokeRgb: [32, 29, 30],
  };
  const styles = [base, { ...base, id: 1, dash: null }];
  const paths: IRPath[] = [],
    chains: Chain[] = [];
  function add(pts: PtMm[], style: number) {
    const id = paths.length;
    paths.push({ id, pts, closed: false, style, src: { file: 'sheet', page: 0, op: id, sub: 0 } });
    chains.push({
      id,
      pts: [pts[0], pts.at(-1)!],
      style,
      closed: false,
      lengthMm: 10,
      motif: null,
      ranges: [{ path: id, from: 0, to: pts.length - 1 }],
    });
    return id;
  }
  const legend = add([point(40, 0), point(50, 0)], 0),
    sides = [];
  for (let side = 0; side < 4; side++) {
    const rotate = (x: number, y: number) => {
      for (let i = 0; i < side; i++) [x, y] = [-y, x];
      return point(x, y);
    };
    sides.push(add([rotate(-8, -10), rotate(0, -10), rotate(8.5, -10)], 0));
    add([rotate(9, -10), rotate(10, -10), rotate(10, -9)], 1);
  }
  const cls: LineClass = {
    id: 0,
    role: 'size',
    chains: sides,
    sizeLabel: '4XL',
    confidence: 1,
    totalLengthMm: 80,
    evidence: [
      {
        kind: 'legend-sample',
        chain: legend,
        label: '4XL',
        at: point(0, 0),
        textAt: point(0, 0),
        score: 1,
        second: 0,
        distanceMm: 0,
        nestingOnly: false,
        alike: [],
      },
    ],
  };
  const set: ChainSet = { chains, classes: [cls], bundles: [], orphans: [], warnings: [] };
  return { paths, styles, add, set, cls };
}
it('uses the keyed dashed source paths and their four solid corners, preserving intermediate source vertices', () => {
  const s = fixture();
  s.add(
    [
      { x: 0, y: -10 },
      { x: 0, y: -9 },
      { x: 1, y: -10 },
    ],
    1,
  );
  const loops = dashPanelLoops(s, s.set, s.cls, new Set());
  expect(loops.map((l) => l.walls)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8]]);
  expect(loops[0].pts).toEqual(s.paths.slice(1, 9).flatMap((p) => p.pts));
});
it('rejects missing or competing corner impressions', () => {
  const s = fixture();
  expect(dashPanelLoops(s, s.set, s.cls, new Set([2]))).toEqual([]);
  s.add(s.paths[2].pts, 1);
  expect(dashPanelLoops(s, s.set, s.cls, new Set())).toEqual([]);
});
