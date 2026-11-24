import { describe, expect, it } from 'vitest';
import type { IRPath, IRText, PieceSpec, PtMm, Style } from '../types';
import { scopedSpec, PURPOSE, SECTION, planScopes } from '../fabrics/scope';
import { liningCut } from './material-cut';
import { visibleEdges } from './source-visibility';
const pt = (x: number, y: number) => ({ x, y });
const outer = [pt(0, 0), pt(10, 0), pt(10, 12), pt(0, 12)],
  seed = pt(2, 4);
const src = { file: 'sample', page: 0, op: 2, sub: 0 };
const path: IRPath = {
  id: 2,
  src,
  closed: false,
  style: 0,
  pts: [pt(6, -3), pt(6, 15)],
  visibleEdges: [[0, 0.5]],
  paintCopies: [{ src: { ...src, page: 1 }, edges: [[0.5, 1]] }],
};
const style: Style = {
  id: 0,
  strokeRgb: [0, 0, 0],
  widthMm: 0.3,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
};
const label: IRText = {
  id: 5,
  src,
  text: 'Cut here for lining',
  anchor: pt(5.9, 4),
  rotationDeg: 90,
  fontSizeMm: 3,
  layer: null,
  bbox: { minX: 5, minY: 4, maxX: 6, maxY: 8 },
};
const sheet = { paths: [path], styles: [style], texts: [label] };
describe('a printed cut for a named material', () => {
  it('keeps the shared source vertices and uses the part of the stroke between exactly two intersections', () => {
    const read = liningCut(sheet, outer, seed);
    expect(read?.cut).toEqual([pt(0, 0), pt(6, 0), pt(6, 12), pt(0, 12)]);
    expect(read?.path).toBe(2);
    expect(read?.label).toBe(5);
    expect(outer[1]).toEqual(pt(10, 0));
  });
  it('refuses a clipped-out middle, a second matching stroke, a tangency, or an unrelated instruction', () => {
    expect(
      liningCut({ ...sheet, paths: [{ ...path, paintCopies: [] }] }, outer, seed),
    ).toBeUndefined();
    expect(
      liningCut(
        { ...sheet, paths: [path, { ...path, id: 3, pts: [pt(6.2, -3), pt(6.2, 15)] }] },
        outer,
        seed,
      ),
    ).toBeUndefined();
    expect(
      liningCut({ ...sheet, texts: [{ ...label, text: 'Fold to right side' }] }, outer, seed),
    ).toBeUndefined();
    expect(
      liningCut({ ...sheet, paths: [{ ...path, pts: [pt(6, 0), pt(6, 4)] }] }, outer, seed),
    ).toBeUndefined();
  });
  it('does not count the reverse of an open printed line as another visible edge', () => {
    expect(visibleEdges(path.pts, { minX: 0, maxX: 10, minY: 0, maxY: 6 }, false)).toEqual([
      [1 / 6, 0.5],
    ]);
  });
  it('passes the material geometry to its file and surfaces an unresolved size', () => {
    const sz = (cut: PtMm[]) => ({ rank: 0, cut });
    const p = {
      identity: 'SF',
      code: 'SF',
      seed: 1,
      displayName: 'Skirt front',
      pairOf: null,
      sizes: [sz(outer)],
      liningSizes: [sz(liningCut(sheet, outer, seed)!.cut)],
    } as PieceSpec;
    const t = {
      label: 'Lining',
      scopeKey: 'lining',
      fabricPurpose: PURPOSE.lining,
      bomLineKey: '',
      sections: [SECTION.lining],
      isInterlining: false,
    };
    expect(scopedSpec(p, t).sizes).toEqual(p.liningSizes);
    expect(
      scopedSpec(p, { ...t, sections: [SECTION.fabric], fabricPurpose: PURPOSE.main }).sizes,
    ).toEqual(p.sizes);
    const plan = planScopes(
      [{ ...p, liningProblem: 'missing source stroke' }],
      { byPurpose: { lining: [1] }, interliningInBom: false, proposals: [] },
      [t],
    );
    expect(plan.problems.some((problem) => problem.message === 'missing source stroke')).toBe(true);
    expect(plan.scopes).toEqual([]);
  });
});
