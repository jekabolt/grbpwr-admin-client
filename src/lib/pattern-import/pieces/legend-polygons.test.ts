import { expect, it } from 'vitest';
import type { PieceCandidate, PtMm, ChainSet, Sheet, SizeRun } from 'lib/pattern-import/types';
import { applyPrintedCuts } from './apply-printed-cuts';
import { readLegendPolygons } from './legend-polygons';
import type { PrintedCutInput } from './printed-cut-ranges';

const card = ['XS', 'S', 'M', 'L', 'XL'];
const pt = (x: number, y: number): PtMm => ({ x, y });
const polygon = [pt(5, 0), pt(20, 0), pt(20, 10), pt(0, 10), pt(0, 0), pt(4.9, 0)];
function fixture(middle?: PtMm[]) {
  const strokes = [polygon, polygon.map((p) => pt(p.x + 0.004, p.y)), ...(middle ? [middle] : [])];
  const pens = ['S', 'L', 'M'];
  const dash = [
    [5, 1],
    [2, 1, 1, 1],
    [7, 1, 2, 1],
  ];
  const paths = strokes.map((pts, i) => ({
    id: i * 10,
    pts,
    style: i,
    src: { file: 'pattern', page: 0, op: i, sub: 0 },
  }));
  const texts = ['P - FLAP', 'Cut 2'].map((text, id) => ({
    id,
    bbox: { minX: 4, minY: 4, maxX: 5, maxY: 5 },
    text,
    anchor: pt(4, 4),
    src: { file: 'pattern', page: 0 },
  }));
  const data = {
    paths,
    texts,
    seeds: [{ id: 1, at: pt(4, 4), origin: 'text', text: texts[0] }],
    styles: dash.map((d) => ({ dash: d, widthMm: 0.35 })),
    classes: pens.map((sizeLabel, i) => ({
      sizeLabel,
      role: 'size',
      chains: paths[i] ? [i] : [],
      evidence: [
        { kind: 'legend-sample', label: sizeLabel, alike: [], nestingOnly: false },
        { kind: 'declared-dash', dash: dash[i] },
      ],
    })),
    chains: paths.map((p, i) => ({
      id: i,
      pts: p.pts,
      ranges: [{ path: p.id, from: 0, to: p.pts.length - 1 }],
    })),
  } as unknown as PrintedCutInput;
  const cells = new Map([
    [1, card.map((_, rank) => ({ rank, outcome: 'leak', outer: [] }) as unknown as PieceCandidate)],
  ]);
  return { data, cells };
}
it('uses each pen for its own polygon and copies the exact reference only inside the witnessed interval', () => {
  for (const partial of [undefined, [pt(3, 10), pt(15, 10)]]) {
    const { data, cells } = fixture(partial);
    const [group] = readLegendPolygons(data, card, cells);
    expect(group.map((r) => r.label)).toEqual(['S', 'M', 'L']);
    expect(group[1].outer).toBe(group[0].outer);
    expect(group[1].polygonSource).toEqual({
      reference: 'S',
      confirmedBy: 'L',
      paths: [0],
      confirmationPaths: [10],
    });
    expect(group[2].outer).not.toEqual(group[0].outer);
    cells.get(1)![1].outcome = 'closed';
    expect(readLegendPolygons(data, card, cells)[0].map((r) => r.label)).toEqual(['M', 'L']);
  }
});
it('retains a distinct partial intermediate outline and rejects different outer reference shapes', () => {
  const { data, cells } = fixture([pt(3, 9.5), pt(15, 9.5)]);
  expect(readLegendPolygons(data, card, cells)[0].map((r) => r.label)).toEqual(['S', 'L']);
  data.classes[2].chains = [];
  expect(readLegendPolygons(data, card, cells)[0].map((r) => r.label)).toEqual(['S', 'L']);
  data.paths[1].pts[2].y += 1;
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
});
it('requires unambiguous named pens, an actual cut instruction and one whole pass per reference', () => {
  const { data, cells } = fixture();
  data.texts[1].text = 'Pocket placement';
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
  data.texts[1].text = 'Cut 2';
  data.paths.push({ ...data.paths[0], id: 40, src: { ...data.paths[0].src, op: 30 } });
  data.chains[0].ranges.push({ path: 40, from: 0, to: polygon.length - 1 });
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
  data.paths.pop();
  data.classes[0].evidence = [];
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
});

it('restores a directly painted closed size with coincident copies from one chain', () => {
  const { data, cells } = fixture();
  for (const [i, p] of data.paths.entries()) {
    p.closed = true;
    data.chains[i].closed = true;
    data.chains[i].ranges[0].to = p.pts.length;
  }
  const copy = { ...data.paths[1], id: 44 };
  data.paths.push(copy);
  data.chains[1].ranges.push({ path: copy.id, from: 0, to: copy.pts.length });
  const known = cells.get(1)![2];
  known.outcome = 'closed';
  known.outer = [pt(0, 0), pt(20, 0), pt(20, 10), pt(0, 10)];
  const [group] = readLegendPolygons(data, card, cells);
  expect(group.map((r) => r.label)).toEqual(['S', 'L']);
  expect(group[1].polygonSource?.paths).toEqual([10, 44]);
  for (const manual of [new Set<number>(), new Set([1])]) {
    const output = structuredClone(cells);
    applyPrintedCuts(
      data as unknown as Sheet,
      { ...data, bundles: [], orphans: [], warnings: [] } satisfies ChainSet,
      { sizes: card.map((label) => ({ label })) } as SizeRun,
      data.seeds,
      output,
      new Set([1]),
      manual,
    );
    expect(output.get(1)![3].outcome).toBe(manual.size ? 'leak' : 'closed');
  }
  known.outer[2] = pt(19, 10);
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
  known.outcome = 'leak';
  expect(readLegendPolygons(data, card, cells)).toEqual([]);
});
