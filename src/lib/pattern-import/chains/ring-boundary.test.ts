import { expect, it } from 'vitest';
import type {
  Chain,
  ChainSet,
  IRPath,
  LineClass,
  PieceCandidate,
  PtMm,
  Seed,
  SizeRun,
  Style,
} from '../types';
import { recoverRingPanels } from './ring-boundary';
import { restoreRingPanels } from '../pieces/ring-panel';

const point = (x: number, y: number) => ({ x, y });
function panel() {
  const pen: Style = {
    id: 0,
    strokeRgb: [32, 29, 30],
    widthMm: 0.35,
    dash: null,
    layer: null,
    fill: false,
    clip: null,
  };
  const styles = [pen],
    paths: IRPath[] = [];
  const stamp = (at: PtMm, style: number) => {
    const pts = Array.from({ length: 9 }, (_, i) =>
      point(at.x + 0.23 * Math.cos((i * Math.PI) / 4), at.y + 0.23 * Math.sin((i * Math.PI) / 4)),
    );
    const id = paths.length;
    paths.push({ id, style, pts, closed: true, src: { file: 'pdf', page: 0, op: id * 5, sub: 0 } });
    return { path: id, from: 0, to: pts.length };
  };
  const legend: Chain = {
    id: 0,
    style: 0,
    closed: false,
    lengthMm: 4,
    motif: null,
    pts: [],
    ranges: [],
  };
  for (let i = 0; i < 5; i++) {
    const p = point(i, -20);
    legend.pts.push(p);
    legend.ranges.push(stamp(p, 0));
  }
  const chain: Chain = { ...legend, id: 1, pts: [], ranges: [] },
    corners: number[] = [];
  for (let side = 0; side < 4; side++) {
    const rotate = (x: number, y: number) => {
      for (let j = 0; j < side; j++) [x, y] = [-y, x];
      return point(x, y);
    };
    for (let j = 1; j < 10; j++) {
      const at = rotate(j - 5, -5 + (side ? 0.24 * Math.sin((j * Math.PI) / 10) : 0));
      chain.pts.push(at);
      chain.ranges.push(stamp(at, 0));
    }
    const at = rotate(5, -5);
    for (const sign of [-1, 1]) {
      const polygon = [rotate(4, -6), rotate(6, -4), rotate(5 + sign, -5 - sign)];
      const style = styles.length;
      styles.push({ ...pen, id: style, clip: 'mask' + style, clipPolygon: polygon });
      corners.push(stamp(at, style).path);
    }
  }
  const at = point(0, 0);
  const cls: LineClass = {
    id: 1,
    role: 'size',
    sizeLabel: '5XL',
    chains: [1],
    totalLengthMm: 40,
    confidence: 1,
    evidence: [
      {
        kind: 'legend-sample',
        chain: 0,
        label: '5XL',
        at,
        textAt: at,
        score: 1,
        second: 0,
        distanceMm: 0,
        nestingOnly: false,
        alike: [],
      },
    ],
  };
  const set: ChainSet = {
    classes: [cls],
    chains: [legend, chain],
    orphans: [],
    bundles: [],
    ambiguities: [],
    warnings: [],
  };
  return { sheet: { styles, paths }, set, chain, corners, at, stamp };
}

it('retains both masked impressions at each turn and chooses the printed loop over the foreign flood wall', () => {
  const { sheet, set, chain, corners, at } = panel();
  const old = chain.pts.slice();
  recoverRingPanels(sheet, set);
  expect(chain.ringBoundary?.ranges.filter((r) => corners.includes(r.path))).toHaveLength(8);
  expect(chain.pts).toEqual(old);
  const make = (rank: number, outer: PtMm[]): PieceCandidate => ({
    seed: 0,
    rank,
    outer,
    walls: [1, 8],
    inside: [],
    textsInside: [],
    outcome: 'closed',
    rankFrom: 'class',
    areaMm2: 80,
    sourceCoverage: 1,
    p95Mm: 0,
    bbox: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  });
  const smaller = make(0, [point(-4, -5), point(4, -5), point(0, 3)]),
    larger = make(1, [point(-4, -5), point(5, 4), point(-4, 4)]);
  const run: SizeRun = {
    encoding: 'declared-dash',
    sizes: [
      { rank: 0, label: '4XL', file: null, classId: 0 },
      { rank: 1, label: '5XL', file: null, classId: 1 },
    ],
    evidence: [],
  };
  const seed: Seed = { id: 0, at, origin: 'click', variant: null };
  restoreRingPanels(sheet, set, run, [seed], new Map([[0, [smaller, larger]]]), new Set());
  expect(larger.walls).toEqual([1]);
  expect(larger.outer).toHaveLength(40);
  expect(smaller.walls).toEqual([1, 8]);
});

it('rejects a missing or competing corner instead of bridging adjacent rings', () => {
  const missing = panel();
  missing.sheet.paths = missing.sheet.paths.filter((p) => p.id !== missing.corners[0]);
  recoverRingPanels(missing.sheet, missing.set);
  expect(missing.chain.ringBoundary).toBeUndefined();
  const ambiguous = panel();
  const p = ambiguous.sheet.paths[ambiguous.corners[0]];
  ambiguous.sheet.paths.push({ ...p, id: ambiguous.sheet.paths.length });
  recoverRingPanels(ambiguous.sheet, ambiguous.set);
  expect(ambiguous.chain.ringBoundary).toBeUndefined();
});

it('uses a stepped local mask only when both printed ring sections have the same diameter', () => {
  const { sheet, set, chain, corners } = panel();
  const half = sheet.paths[corners[0]];
  const style = sheet.styles[half.style];
  const [a, b, c] = style.clipPolygon!;
  delete style.clipPolygon;
  // The cut edge is split at the centre, as on the lower left Alassio skirt corner.
  style.localClipPolygon = [a, point(5, -5), b, point((b.x + c.x) / 2, (b.y + c.y) / 2), c];
  recoverRingPanels(sheet, set);
  expect(chain.ringBoundary?.ranges.filter((r) => corners.includes(r.path))).toHaveLength(8);
  delete chain.ringBoundary;
  style.localClipPolygon = style.localClipPolygon.map((p) => point(5 - (p.y + 5), -5 + (p.x - 5)));
  recoverRingPanels(sheet, set);
  expect(chain.ringBoundary).toBeUndefined();
});

it.each(['file', 'page', 'unsupported mask'] as const)(
  'requires matching PDF provenance for a stepped corner (%s)',
  (change) => {
    const { sheet, set, corners, chain } = panel();
    const half = sheet.paths[corners[0]];
    const style = sheet.styles[half.style];
    style.localClipPolygon = style.clipPolygon;
    delete style.clipPolygon;
    if (change === 'file') half.src.file = 'another PDF';
    if (change === 'page') half.src.page++;
    if (change === 'unsupported mask') delete style.localClipPolygon;
    recoverRingPanels(sheet, set);
    expect(chain.ringBoundary).toBeUndefined();
  },
);
