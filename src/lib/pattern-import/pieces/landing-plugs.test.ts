import { expect, it } from 'vitest';
import type { Chain, ChainSet, LineClass } from '../types';
import { landingPlugs, overlayLines, type WallModel } from './walls';
import { unsupportedLanding } from './ambiguous-landing';

function trial(otherY: number, hasKey: boolean) {
  const lines = [
    [
      [-10, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [10, 0],
    ],
    [
      [10, 0],
      [12, 0],
      [20, 2],
    ],
    [
      [10, 0.1],
      [12, 0.1],
      [20, otherY],
    ],
    [
      [20, -10],
      [20, 10],
    ],
  ];
  const chains: Chain[] = lines.map((points, id) => ({
    id,
    closed: false,
    ranges: [],
    style: id,
    motif: null,
    pts: points.map(([x, y]) => ({ x, y })),
    lengthMm: points
      .slice(1)
      .reduce((l, [x, y], i) => l + Math.hypot(x - points[i][0], y - points[i][1]), 0),
  }));
  const classes: LineClass[] = [2, 3].map((id) => ({
    id,
    role: 'size',
    sizeLabel: String(id),
    chains: [id],
    confidence: 1,
    totalLengthMm: chains[id].lengthMm,
    evidence: hasKey
      ? [
          {
            kind: 'legend-sample',
            label: String(id),
            chain: id,
            at: chains[id].pts[0],
            textAt: chains[id].pts[0],
            distanceMm: 0,
            score: 1,
            second: 1,
            alike: [],
            nestingOnly: false,
          },
        ]
      : [],
  }));
  const set: ChainSet = { chains, classes, orphans: [], bundles: [], warnings: [] };
  const model: WallModel = {
    mode: 'graded',
    n: 4,
    common: [],
    byRank: [[0, 4], [1], [2], [3]],
    emptyRanks: [],
    graded: [0, 1, 2, 3, 4],
    fileOfRank: [],
  };
  return landingPlugs(set, model, 0, []).map((w) => w.chain);
}

it('requires an unambiguous continuation after a borrowed line ends at several printed size lines', () => {
  expect(trial(-2, true)).toEqual([]);
  expect(trial(2.1, true)).toEqual([1, 2]);
  expect(trial(-2, false)).toEqual([1, 2]);
});

it('requires source support when a fallback flood still links the previously ambiguous endpoints', () => {
  const outer = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 20 },
    { x: 0, y: 20 },
  ];
  const line = (id: number, y: number): Chain => ({
    id,
    style: id,
    pts: [
      { x: 0, y },
      { x: 30, y },
    ],
    closed: false,
    motif: null,
    ranges: [],
    lengthMm: 30,
  });
  const chains = [line(0, 0), line(1, 0.02), line(2, -0.02), line(3, 0.03)];
  const set: ChainSet = { chains, classes: [], bundles: [], warnings: [], orphans: [] };
  const refused = [{ owner: 0, from: outer[0], junction: outer[1], walkedMm: 30, reachMm: 0.8 }];
  expect(unsupportedLanding(outer, [0], refused, 0, null, set, [])).toEqual(outer[0]);
  expect(unsupportedLanding(outer, [0], refused, 0, null, set, [0])).toBeUndefined();
  expect(unsupportedLanding(outer, [2], refused, 0, null, set, [])).toBeUndefined();
  const overlaps = overlayLines(set, [[0], [1], [2], [3]]);
  expect(unsupportedLanding(outer, [0], refused, 0, overlaps, set, [])).toBeUndefined();
});
