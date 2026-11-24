import { describe, expect, it } from 'vitest';
import type { IRPath, PtMm, Style } from '../types';
import { stampedPanel } from './stamped-panel';
import { phaseLoops } from './fold-panel';
import { conflictingSections, maskCenter } from './ring-sections';

const pt = (x: number, y: number) => ({ x, y });
function path(id: number, pts: PtMm[], closed = false): IRPath {
  return { id, pts, closed, style: 0, src: { file: 'f', page: 0, op: id, sub: 0 } };
}

describe('printed fold-panel corners', () => {
  it('requires a unique phase-matched continuation at every corner', () => {
    const strokes = Array.from({ length: 4 }, (_, i) => {
      const rot = (x: number, y: number) => {
        for (let j = 0; j < i; j++) [x, y] = [-y, x];
        return pt(x, y);
      };
      return [
        { path: path(2 * i, [rot(-8, -10), rot(8.5, -10)]), gap: 1, wall: i },
        { path: path(2 * i + 1, [rot(9, -10), rot(10, -10), rot(10, -9)]), gap: 0, wall: i },
      ];
    }).flat();
    expect(phaseLoops(strokes).map((c) => c.length)).toEqual([8]);
    expect(phaseLoops(strokes.slice(1))).toEqual([]);
    expect(phaseLoops([...strokes, { ...strokes[1] }])).toEqual([]);
  });
  it('reads the transverse centre using the active clip', () => {
    const ring = path(1, [pt(-1, 0), pt(0, -1), pt(1, 0), pt(0, 1)], true);
    const clip = (x: number) => [pt(x, -2), pt(2, -2), pt(2, 2), pt(x, 2)];
    expect(maskCenter(ring, clip(0.25))).toEqual(pt(0.25, 0));
    expect(maskCenter(ring, clip(-2))).toBeUndefined();
  });
  it('retains both readings of an asymmetric filled pen at a split corner', () => {
    const diamond = [pt(-0.5, 0), pt(0, -0.5), pt(0.5, 0), pt(0, 0.5)];
    const legend = Array.from({ length: 6 }, (_, i) =>
      path(i, i % 2 ? diamond.slice(1) : diamond, true),
    );
    const style = (clip?: string, x = 0): Style => ({
      id: 0,
      widthMm: 0,
      fill: true,
      strokeRgb: null,
      dash: null,
      layer: null,
      clip: clip ?? null,
      ...(clip ? { localClipPolygon: [pt(x, -1), pt(2, -1), pt(2, 1), pt(x, 1)] } : {}),
    });
    const styles = [style(), style('left', 0.05), style('right', 0.16)];
    const impressions = [1, 2].map((style, i) => ({ ...path(10 + i, diamond, true), style }));
    const page = [...legend, ...impressions, ...impressions.map((p, i) => ({ ...p, id: 20 + i }))];
    const witness = conflictingSections(impressions, styles, legend, page);
    expect(witness?.ids).toEqual([10, 11]);
    expect(witness?.alternatives[0].x).toBeCloseTo(0.05);
    expect(witness?.alternatives[1].x).toBeCloseTo(0.16);
    expect(conflictingSections(impressions, styles, legend, page.slice(0, -1))).toBeUndefined();
  });
  it('replaces a stray fold-wall vertex only with four paired printed turns', () => {
    const pen: Style = {
      id: 0,
      fill: false,
      dash: null,
      clip: null,
      layer: null,
      strokeRgb: [0, 0, 0],
      widthMm: 0.1,
    };
    const styles: Style[] = [pen, { ...pen, id: 1, dash: [3, 1] }, { ...pen, id: 2, dash: [6, 1] }];
    const sample = Array.from({ length: 4 }, (_, i) => path(i, [pt(2 * i, 0), pt(2 * i + 1, 0)]));
    const rows: IRPath[] = [];
    const cut: PtMm[] = [];
    for (let i = 0; i < 4; i++) {
      const rot = (x: number, y: number) => {
        for (let j = 0; j < i; j++) [x, y] = [-y, x];
        return pt(x, y);
      };
      const corner = rot(-7, -7);
      cut.push(corner);
      for (const pair of [
        [rot(-7, -6.5), corner],
        [corner, rot(-6.5, -7)],
      ]) {
        const id = styles.length;
        styles.push({ ...pen, id, clip: 'corner' + id + ':0,0,1,1' });
        rows.push({ ...path(20 + rows.length, pair), style: id });
      }
      for (let x = -6; x <= 4; x += 2)
        rows.push(path(20 + rows.length, [rot(x, -7), rot(x + 1, -7)]));
    }
    // The old import makes an excursion onto a foreign wall between two owned strokes.
    const previous = [cut[0], pt(0, -8.94), ...cut.slice(1)];
    const anchors = [
      { ...path(0, [pt(40, 40), pt(41, 40)]), style: 1 },
      { ...path(200, [pt(40, 40), pt(41, 40)]), style: 2 },
    ];
    const read = (marks: IRPath[]) =>
      stampedPanel(marks, styles, sample, styles[1], styles[2], previous, [...anchors, ...marks]);
    const loop = read(rows);
    expect(loop && 'pts' in loop && loop.pts).toEqual(expect.arrayContaining(cut));
    expect(loop && 'pts' in loop && loop.pts).not.toContainEqual(pt(0, -8.94));
    expect(read(rows.slice(1))).toBeUndefined();
  });
});
