import { expect, it } from 'vitest';
import { walkOperatorList } from '../adapters/pdf/walk';
import type { ChainSet, IRPath, PieceCandidate, Seed, Sheet, SizeRun } from '../types';
import { fullyVisibleSourcePath, visibleEdges } from './source-visibility';
import { restoreSourceOutlineFamilies } from './source-outline-family';

const source = { file: 'one', page: 0, op: 1, sub: 0 };
const square = (r: number) => [
  { x: -r, y: -r },
  { x: r, y: -r },
  { x: r, y: r },
  { x: -r, y: r },
];
function fixture() {
  const dashes = [
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [3, 1],
    [6, 1],
  ];
  const paths = dashes.map((_, i) => ({
    id: i,
    pts: square(i + 2),
    closed: true,
    style: i,
    src: source,
    visibleEdges: true as const,
  }));
  const styles = dashes.map((dash, id) => ({
    id,
    widthMm: 0.5,
    dash,
    fill: false,
    strokeRgb: [0, 0, 0],
    layer: null,
    clip: null,
  }));
  const chains = paths.map((p) => ({
    id: p.id,
    pts: p.pts,
    style: p.style,
    closed: true,
    ranges: [{ path: p.id, from: 0, to: 4 }],
  }));
  const classes = paths.map((p) => ({
    id: p.id,
    role: 'size',
    sizeLabel: String(p.id),
    chains: [p.id],
    evidence: [{ kind: 'legend-sample', label: String(p.id), chain: p.id }],
  }));
  const sheet = {
    paths,
    styles,
    missing: [],
    texts: [
      {
        id: 0,
        text: 'FABRIC: CUT 1',
        anchor: { x: 0, y: 0 },
        bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      },
    ],
  } as unknown as Sheet;
  const set = { chains, classes } as unknown as ChainSet;
  const run = { sizes: classes.map((c) => ({ label: c.sizeLabel, classId: c.id })) } as SizeRun;
  const seeds = [
    { id: 1, origin: 'text', at: { x: 0, y: 0 }, text: { text: 'A - FRONT' } },
  ] as Seed[];
  const cells = paths.map((_, rank) => ({
    rank,
    seed: 1,
    outer: [],
    outcome: 'refused',
    gradeRefusal: 'sizes-not-distinguished',
  })) as unknown as PieceCandidate[];
  const restore = (excluded = new Set<number>()) =>
    restoreSourceOutlineFamilies(sheet, set, run, seeds, new Map([[1, cells]]), excluded);
  return { sheet, set, seeds, cells, restore };
}
it('uses a full set of source strokes and brackets both instances of an identical printed pen', () => {
  const { restore, cells } = fixture();
  restore();
  expect(cells.every((c) => c.outcome === 'closed' && c.walls[0] === c.rank)).toBe(true);
  expect(cells[1].sourceOutline?.brackets).toEqual([0, 2]);
  expect(cells[4].sourceOutline?.brackets).toEqual([3, 5]);
});
it('withholds the entire family for a missing tile, excluded stroke, invisible edge or placement label', () => {
  for (const problem of [
    'tile',
    'edit',
    'clip',
    'placement',
    'other-seed',
    'duplicate-pen',
    'previously-closed',
  ]) {
    const { restore, cells, sheet, seeds } = fixture();
    if (problem === 'tile') sheet.missing.push({} as Sheet['missing'][number]);
    if (problem === 'clip') sheet.paths[1].visibleEdges = [[0, 3]];
    if (problem === 'placement') sheet.texts[0].text = 'CUT 1 ON PLACEMENT TEMPLATE';
    if (problem === 'other-seed') seeds.push({ ...seeds[0], id: 2 });
    if (problem === 'duplicate-pen') sheet.styles[2].dash = sheet.styles[1].dash;
    if (problem === 'previously-closed') cells[5].outcome = 'closed';
    restore(new Set(problem === 'edit' ? [1] : []));
    expect(
      cells.every((c) => !c.sourceOutline),
      problem,
    ).toBe(true);
  }
});
it('unites only visible parts of the same closed stroke and rejects a gap between clips', () => {
  const pts = square(2),
    clip = (x: number, y: number) => ({ minX: x, maxX: y, minY: -2, maxY: 2 });
  const left = visibleEdges(pts, clip(-2, 0))!,
    right = visibleEdges(pts, clip(0, 2))!;
  const path: IRPath = {
    id: 1,
    src: source,
    style: 1,
    pts,
    closed: true,
    visibleEdges: left,
    paintCopies: [{ src: { ...source, page: 1 }, edges: right }],
  };
  expect(fullyVisibleSourcePath(path)).toBe(true);
  path.paintCopies![0].edges = visibleEdges(pts, clip(0.0004, 2))!;
  expect(fullyVisibleSourcePath(path)).toBe(false);
  expect(fullyVisibleSourcePath(path, 0.001)).toBe(true);
  path.paintCopies![0].edges = visibleEdges(pts, clip(0.0006, 2))!;
  expect(fullyVisibleSourcePath(path, 0.001)).toBe(false);
  path.paintCopies![0].edges = visibleEdges(pts, clip(0.01, 2))!;
  expect(fullyVisibleSourcePath(path)).toBe(false);
  expect(fullyVisibleSourcePath({ ...path, visibleEdges: undefined, paintCopies: undefined })).toBe(
    false,
  );
});

it('requires a rectangular PDF clip as well as physical paper for a painted outline', () => {
  const ops = {
    constructPath: 1,
    rectangle: 2,
    clip: 3,
    endPath: 4,
    stroke: 5,
    moveTo: 6,
    lineTo: 7,
    closePath: 8,
  };
  const opt = {
    ops,
    file: 'test',
    page: 0,
    base: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
    pageBox: { minX: -2, minY: -2, maxX: 0, maxY: 2 },
    sagittaMm: 0.05,
    keepFills: true,
    ocName: () => null,
  };
  const read = (clip: [number[], number[]]) =>
    walkOperatorList(
      { fnArray: [1, 3, 4, 1, 5], argsArray: [clip, [], [], [[2], [-2, -2, 4, 4]], []] },
      opt,
    ).paths[0];
  const triangle = read([
    [6, 7, 7, 8],
    [-2, -2, 2, -2, 2, 2],
  ]);
  expect(triangle.visibleEdges).toBeUndefined();
  const rectangle = read([[2], [-2, -2, 4, 4]]);
  expect(rectangle.visibleEdges).toEqual(visibleEdges(square(2), opt.pageBox));
});
