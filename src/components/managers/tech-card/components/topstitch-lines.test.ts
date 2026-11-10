import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { describe, expect, it } from 'vitest';

import {
  clearTopstitchLinesForKind,
  createTopstitchLineFromPick,
  dropTopstitchMeasured,
  isTopstitchThreadLine,
  topstitchPickOverlaps,
  unlinkTopstitchBomLine,
  type TopstitchLine,
  type TopstitchOperation,
} from './topstitch-lines';

describe('topstitch thread eligibility', () => {
  const line = {
    section: 'TECH_CARD_BOM_SECTION_THREAD',
    kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
  } as const;

  it.each(['m', 'м', 'meter', 'meters', 'metre', 'metres', 'MATERIAL_UNIT_M'])(
    'accepts the metre spelling %s',
    (unit) => expect(isTopstitchThreadLine({ ...line, unit })).toBe(true),
  );

  it('still refuses a non-metre slot unit', () => {
    expect(isTopstitchThreadLine({ ...line, unit: 'cone' })).toBe(false);
  });
});

function rectangle(key: string, width: number, height: number): PieceGeom {
  const ring: Pt2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const edges = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length];
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    return {
      id: `${key}#${index}`,
      pieceKey: key,
      k: index,
      s: index,
      e: index + 1,
      pts: [point, next],
      lenMm: length,
      chordMm: length,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    } as Edge;
  });
  return {
    pieceKey: key,
    name: key,
    hand: null,
    cloth: null,
    rs: ring,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: true,
    areaMm2: width * height,
    perimMm: 2 * (width + height),
    twinOf: [],
  } as PieceGeom;
}

const piece = rectangle('front', 100, 60);
const geoms = new Map([['front', piece]]);

const pickedLine = () =>
  createTopstitchLineFromPick({
    parts: [{ target: 'front#0', range: [20, 80] }],
    geoms,
    anchors: { pieces: [piece] },
    bomLineKey: 'thread-a',
    anchoredSize: 'M',
    lineKey: 'line-a',
  });

describe('topstitch line picks', () => {
  it('creates one measured line from a one-sided partial pick', () => {
    expect(pickedLine()).toMatchObject({
      lineKey: 'line-a',
      bomLineKey: 'thread-a',
      anchoredSize: 'M',
      rows: 1,
      sizes: [],
      measured: true,
      parts: [{ piece: 'front', edgeHint: 'front#0', range: [0.2, 0.8] }],
    });
  });

  it('refuses only spans that overlap an existing line in the same step', () => {
    const line = pickedLine();
    expect(line).not.toBeNull();
    expect(topstitchPickOverlaps([line!], 'front#0', [70, 90], geoms)).toBe(true);
    expect(topstitchPickOverlaps([line!], 'front#0', [0, 19], geoms)).toBe(false);
    expect(topstitchPickOverlaps([line!], 'front#1', undefined, geoms)).toBe(false);
  });
});

describe('topstitch line teardown', () => {
  const line = pickedLine() as TopstitchLine;
  const operation = { topstitchLines: [line] } as TopstitchOperation;

  it('clears lines when the step stops being A2', () => {
    expect(clearTopstitchLinesForKind(operation, true)).toBe(operation);
    expect(clearTopstitchLinesForKind(operation, false).topstitchLines).toEqual([]);
  });

  it('removes only lines bound to the unlinked BOM row', () => {
    const other = { ...line, lineKey: 'line-b', bomLineKey: 'thread-b' };
    const result = unlinkTopstitchBomLine(
      [{ ...operation, topstitchLines: [line, other] }],
      'thread-a',
    );
    expect(result.changed).toBe(true);
    expect(result.operations[0].topstitchLines).toEqual([other]);
  });

  it('drops the write-only measured flag after a successful save', () => {
    const data = { operations: [{ ...operation, topstitchLines: [{ ...line, measured: true }] }] };
    expect(
      dropTopstitchMeasured(data).operations?.[0]?.topstitchLines?.[0]?.measured,
    ).toBeUndefined();
  });
});
