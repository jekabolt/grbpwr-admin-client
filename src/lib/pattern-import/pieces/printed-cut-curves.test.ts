import { describe, expect, it } from 'vitest';
import type { PtMm } from 'lib/pattern-import/types';

import { readPrintedCuts } from './printed-cut-ranges';

const card = ['00', '0', '2', '4'];
const pt = (x: number, y: number): PtMm => ({ x, y });
type Input = Parameters<typeof readPrintedCuts>[0];
function fixture(duplicateBump?: number) {
  const paths: {
    id: number;
    pts: PtMm[];
    src: { file: string; page: number; op: number; sub: number };
    style: number;
  }[] = [];
  const byRank = new Map<string, number[]>();
  const text = (id: number, value: string, x: number, y: number) => ({
    id,
    text: value,
    anchor: pt(x, y),
    bbox: { minX: x, minY: y, maxX: x + 1, maxY: y + 1 },
    src: { file: 'pattern', page: 0, op: id, sub: 0 },
  });
  const texts = [text(0, 'A - POCKET', 5, 5), text(1, 'Cut 2', 6, 6)];
  function path(points: PtMm[], page: number, owner: string) {
    const id = paths.length;
    paths.push({ id, pts: points, style: 0, src: { file: 'pattern', page, op: id, sub: 0 } });
    if (!byRank.has(owner)) byRank.set(owner, []);
    byRank.get(owner)!.push(id);
  }
  for (const [i, n] of [40, 50].entries()) {
    const owner = card[2 * i];
    texts.push(text(2 + i, owner + ' - ' + card[2 * i + 1], 1, n - 1));
    path([pt(n / 2, 0), pt(0, 0), pt(0, n), pt(n - 10, n)], 0, owner);
    const arc = Array.from({ length: 23 }, (_, i) => {
      const angle = (i * Math.PI) / 44;
      return pt(n - 9 + 9 * Math.sin(angle), n - 9 + 9 * Math.cos(angle));
    });
    const curve = [pt(n - 9.5, n), ...arc, pt(n, 0), pt(n / 2 + 0.5, 0)];
    path(curve, 1, owner);
    if (i === 1 && duplicateBump !== undefined)
      path(
        curve.map((p, j) => (j === 10 ? pt(p.x, p.y + duplicateBump) : p)),
        2,
        owner,
      );
  }
  return {
    paths,
    chains: paths.map((p) => ({
      id: p.id,
      ranges: [{ path: p.id, from: 0, to: p.pts.length - 1 }],
    })),
    styles: [{ widthMm: 0.2, dash: [2, 0.5] }],
    classes: [...byRank].map(([sizeLabel, ids]) => ({
      sizeLabel,
      chains: ids,
      role: 'size',
      evidence: [{ kind: 'legend-sample' }],
    })),
    texts,
    seeds: [{ id: 4, origin: 'text', text: texts[0], at: pt(8, 8) }],
  } as unknown as Input;
}
describe('printed curved cut evidence', () => {
  it('returns both printed ranges and preserves the original curved stroke across tiles', () => {
    const d = fixture();
    const [g] = readPrintedCuts(d, card);
    expect(g?.map((v) => [v.lo, v.hi, v.paths, v.equivalentCurves])).toEqual([
      [0, 1, [0, 1], 1],
      [2, 3, [2, 3], 1],
    ]);
    expect(g[0].outer).toContainEqual(d.paths[1].pts[10]);
  });
  it('groups two coincident source walks and refuses distinct closed figures under one label', () => {
    expect(readPrintedCuts(fixture(0.02), card)[0]?.[1].equivalentCurves).toBe(2);
    expect(readPrintedCuts(fixture(1), card)).toEqual([]);
  });
  it('requires the curve itself to carry the legend evidence for the printed interval', () => {
    const d = fixture();
    d.classes[1].chains = d.classes[1].chains.filter((id) => id !== 3);
    d.classes[0].chains.push(3);
    expect(readPrintedCuts(d, card)).toEqual([]);
  });
  it('refuses a whole source curve attributed to two conflicting legend sizes', () => {
    const d = fixture();
    d.classes[0].chains.push(3);
    expect(readPrintedCuts(d, card)).toEqual([]);
  });
  it('vetoes placement and incomplete cut anatomy', () => {
    const d = fixture();
    d.texts.push({ ...d.texts[1], text: 'Pocket placement' });
    expect(readPrintedCuts(d, card)).toEqual([]);
    d.texts.pop();
    d.paths[3].pts.splice(0, 1);
    expect(readPrintedCuts(d, card)).toEqual([]);
  });
});
