import { describe, expect, it } from 'vitest';
import type { IRPath, PtMm, Style } from '../types';
import { printedGaps, splitTurns, stampedCycle } from './bracketed-stamps';

const pt = (x: number, y: number) => ({ x, y });
const path = (id: number, pts: PtMm[], closed = false, style = 0): IRPath => ({
  id,
  src: { file: 'pdf', page: 0, op: id, sub: 0 },
  pts,
  closed,
  style,
});
const pen: Style = {
  id: 0,
  strokeRgb: [32, 29, 30],
  widthMm: 0.49,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
};
const points = (pairs: number[][]) => pairs.map(([x, y]) => pt(x, y));
describe('size marks between two printed PDF outlines', () => {
  it('finds the seam crossing of both clipped impressions at the lower B30 corner', () => {
    const masks = [
      points([
        [1124.03, 1046.39],
        [1122.91, 1045.27],
        [1126.93, 1045.27],
        [1126.93, 1046.39],
      ]),
      points([
        [1122.9, 1049.3],
        [1122.91, 1045.27],
        [1124.03, 1046.39],
        [1124.02, 1049.3],
      ]),
    ];
    const styles = masks.map((clipPolygon, id) => ({ ...pen, clipPolygon, id }));
    const a = path(
        12868,
        points([
          [1126.44, 1045.9],
          [1123.4, 1045.9],
        ]),
      ),
      b = path(
        12893,
        points([
          [1123.54, 1042.85],
          [1123.54, 1045.9],
        ]),
        false,
        1,
      );
    const hits = splitTurns([a, b], styles);
    expect(hits).toHaveLength(1);
    expect(hits[0].ids).toEqual([12868, 12893]);
    expect(hits[0].points[0].x).toBeCloseTo(1123.54, 2);
    expect(splitTurns([a], styles)).toEqual([]);
    expect(
      splitTurns(
        [a, b],
        [styles[0], { ...styles[1], clipPolygon: masks[1].map((p) => pt(p.x + 0.1, p.y)) }],
      ),
    ).toEqual([]);
  });
  it('uses both printed glyph axes at a bend and rejects a missing or competing axis', () => {
    const a = path(
        16170,
        points([
          [1159.2494, 1755.7525],
          [1161.5989, 1753.8105],
        ]),
      ),
      b = path(
        16185,
        points([
          [1163.0588, 1750.8407],
          [1164.1989, 1748.0142],
        ]),
      );
    const f = path(
      16175,
      points([
        [1161.7909, 1753.3747],
        [1162.228, 1753.212],
        [1162.5738, 1753.0501],
        [1162.2312, 1752.3015],
      ]),
      true,
    );
    const g = path(
      16180,
      points([
        [1162.3224, 1752.0794],
        [1163.113, 1751.7355],
        [1162.7708, 1750.9869],
      ]),
      true,
    );
    const key = [
      path(922, [pt(105.443, 1730.809), pt(108.361, 1730.809)]),
      path(927, [pt(108.885, 1730.598), pt(109.477, 1731.198), pt(110.016, 1730.598)], true),
    ];
    const run = (fills: IRPath[]) => printedGaps([a, b], fills, key, 6.168);
    const match = run([f, g]).get('16170,16185');
    expect(match?.ids).toEqual([16175, 16180]);
    expect(match?.pts[0].x).toBeCloseTo(1161.964, 2);
    expect(run([f]).size).toBe(0);
    expect(run([f, { ...g, pts: g.pts.map((p) => pt(p.x + 0.25, p.y)) }]).size).toBe(0);
  });
  it('records the two aligned filled marks between ordinary strokes', () => {
    const bar = (id: number, x: number) => path(id, [pt(x, 0), pt(x + 2, 0)]);
    const mark = (id: number, x: number) =>
      path(id, [pt(x, -0.2), pt(x + 0.3, 0.4), pt(x + 0.5, -0.2)], true);
    const a = bar(1, 0),
      f = mark(2, 2.35),
      g = mark(3, 3.15),
      b = bar(4, 4);
    const sample = [a, f, g, b];
    const gap = printedGaps([a, b], [f, g], sample, 4).get('1,4');
    expect(gap?.ids).toEqual([2, 3]);
    expect(gap?.pts[0].y).toBeCloseTo(0);
    expect(gap?.turn).toBe(false);
    expect(
      printedGaps([a, b], [f, { ...g, pts: g.pts.map((p) => pt(p.x, p.y + 0.5)) }], sample, 4).size,
    ).toBe(0);
  });
  it('requires the whole cycle and a unique continuation across every gap', () => {
    const vertices = [pt(0, 0), pt(16, 0), pt(16, 16), pt(0, 16)];
    const turns = vertices.map((p, i) => ({ ids: [i], points: [p], turn: true }));
    const bars = vertices.flatMap((p, i) => {
      const q = vertices[(i + 1) % 4],
        at = (t: number) => pt(p.x + ((q.x - p.x) * t) / 16, p.y + ((q.y - p.y) * t) / 16);
      return [2, 6, 10].map((t, j) => path(4 + i * 3 + j, [at(t), at(t + 2)]));
    });
    expect(stampedCycle(bars, turns, 2, 4)?.ids).toHaveLength(16);
    expect(stampedCycle(bars.slice(1), turns, 2, 4)).toBeUndefined();
    expect(stampedCycle([...bars, { ...bars[1], id: 100 }], turns, 2, 4)).toBeUndefined();
  });
});
