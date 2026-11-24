import { expect, it } from 'vitest';
import type { Chain, IRPath, LineClass, PtMm, Style } from '../types';
import { clippedMarkLoop } from './clipped-mark-loop';

function printedSquare(singleDot = false) {
  const ink: Style = {
    id: 0,
    layer: null,
    strokeRgb: [0, 0, 0],
    widthMm: 0,
    dash: null,
    fill: true,
    clip: null,
  };
  const styles = [ink],
    paths: IRPath[] = [],
    chains: Chain[] = [];
  const pts = (x: number, y: number) => ({ x, y });
  const addRow = (row: PtMm[]) => {
    const u = row[1].x - row[0].x,
      v = row[1].y - row[0].y;
    const ranges = row.map((p, i) => {
      const at = (x: number, y: number) => pts(p.x + u * x - v * y, p.y + v * x + u * y);
      const glyph =
        i % 5 === 0 || i % 5 === 2
          ? [at(0.4, 0), at(0, 0.35), at(-0.4, 0), at(0, -0.35), at(0.4, 0)]
          : [at(-0.5, -0.35), at(-0.25, -0.1), at(0, 0.25), at(0.5, -0.35)];
      const id = paths.length;
      paths.push({
        id,
        pts: singleDot ? glyph : [pts(p.x - 0.1, p.y - 0.1), pts(p.x + 0.1, p.y + 0.1)],
        style: 0,
        closed: true,
        src: { file: '0', page: 1, op: id, sub: 0 },
      });
      return { path: id, from: 0, to: 1 };
    });
    chains.push({
      id: chains.length,
      style: 0,
      closed: false,
      pts: row,
      ranges,
      lengthMm: row.length - 1,
      motif: [0, 1],
      markPeriod: singleDot ? 'dtdtt' : 'DDdtt',
    });
  };
  addRow(Array.from({ length: 10 }, (_, i) => pts(i, -10)));
  for (let side = 0; side < 4; side++) {
    const rotate = (x: number, y: number) => {
      for (let k = 0; k < side; k++) [x, y] = [20 - y, x];
      return pts(x, y);
    };
    addRow(Array.from({ length: 15 }, (_, i) => rotate(3 + i, 0)));
    for (const quad of [
      [
        [17, -0.2],
        [20.2, -0.2],
        [19.8, 0.2],
        [17, 0.2],
      ],
      [
        [20.2, -0.2],
        [20.2, 3],
        [19.8, 3],
        [19.8, 0.2],
      ],
    ])
      styles.push({
        ...ink,
        id: styles.length,
        clip: String(styles.length),
        clipQuad: quad.map(([x, y]) => rotate(x, y)),
      });
  }
  const seed = pts(10, 10);
  const classes: LineClass[] = [
    {
      id: 0,
      role: 'size',
      sizeLabel: 'XL',
      totalLengthMm: 56,
      confidence: 1,
      chains: [1, 2, 3, 4],
      evidence: [
        {
          kind: 'legend-sample',
          chain: 0,
          label: 'XL',
          at: pts(0, -10),
          textAt: pts(-5, -10),
          distanceMm: 5,
          score: 1,
          second: 0,
          alike: [],
          nestingOnly: false,
        },
      ],
    },
  ];
  const read = () =>
    clippedMarkLoop(
      { styles, paths },
      { chains, classes },
      { sizes: [{ rank: 0, label: 'XL', classId: 0, file: null }] },
      0,
      seed,
    );
  return { read, styles, paths, classes, chains };
}

it('follows keyed rows through four printed mitres', () => {
  const loop = printedSquare().read();
  expect(loop?.walls).toEqual([1, 2, 3, 4]);
  expect(loop?.pts).toContainEqual({ x: 20, y: 0 });
});

it('refuses the perimeter when an arm is absent or two printed vertices fit', () => {
  const missing = printedSquare();
  missing.styles.pop();
  expect(missing.read()).toBeNull();
  const competing = printedSquare();
  for (const s of competing.styles.slice(1, 3)) {
    competing.styles.push({
      ...s,
      id: competing.styles.length,
      clipQuad: s.clipQuad!.map((p) => ({ ...p, x: p.x + 0.25 })),
    });
  }
  expect(competing.read()).toBeNull();
});

it('locates asymmetric ticks from the single-dot legend and requires print evidence for a notch fragment', () => {
  const { read, paths, classes, chains } = printedSquare(true);
  expect(read()?.pts.find((p) => p.x === 4 && Math.abs(p.y) < 1)?.y).toBeCloseTo(0, 10);
  classes[0].chains = classes[0].chains.filter((id) => id !== 1);
  classes.push({
    id: 1,
    role: 'notch',
    sizeLabel: null,
    chains: [1],
    evidence: [],
    totalLengthMm: 14,
    confidence: 0,
  });
  expect(read()).toBeNull();
  const id = paths.length;
  paths.push({ ...paths[chains[1].ranges[0].path], id, style: 1 });
  chains[1].ranges.push({ path: id, from: 0, to: 1 });
  expect(read()?.walls).toContain(1);
});

it('joins consecutive prints across a turn only when their source run supports it', () => {
  const { read, paths, classes, chains } = printedSquare(true);
  const row = chains[1];
  const rest = { ...row, id: chains.length, pts: row.pts.slice(7), ranges: row.ranges.slice(7) };
  row.pts = row.pts.slice(0, 7);
  row.ranges = row.ranges.slice(0, 7);
  rest.pts = rest.pts.map((p, i) => {
    const dy = 0.85 * (1 - i / (rest.pts.length - 1));
    const path = paths[rest.ranges[i].path];
    path.pts = path.pts.map((v) => ({ ...v, y: v.y + dy }));
    return { ...p, y: p.y + dy };
  });
  chains.push(rest);
  classes[0].chains.push(rest.id);
  expect(read()?.walls).toContain(rest.id);
  paths[rest.ranges[0].path].src.page++;
  expect(read()).toBeNull();
});
