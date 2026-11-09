import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { StoredSeam } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import type { CutStrip } from './cut-strip-editor/use-cut-strip';
import {
  bindingBomLines,
  bindingRowFromCloth,
  bindingStripTarget,
  freshBindingStrip,
  linkBindingStripToSeam,
  removeBindingStripsForSeam,
} from './binding-step';

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

const operation = {
  work: 'bind_tape_edge',
  inputKeys: ['cloth', 'strip-a'],
  bomLineKeys: ['binding-line'],
  seamKeys: [],
};

const strip = {
  lineKey: 'strip-a',
  bomLineKey: 'binding-line',
  lengthMode: 'from_seam',
  seamKey: '',
  fitPct: '100',
  overlapMm: '30',
  qty: 1,
  sizes: [{ sizeId: 1, seamMm: '', manualCutMm: '' }],
} as CutStrip;

const seam = {
  seamKey: 'draft-seam',
  sideA: [{ piece: 'cloth' }],
  sideB: [{ piece: 'strip-a' }],
} as StoredSeam;

describe('binding step', () => {
  it('offers binding kinds from every section', () => {
    const lines = [
      { lineKey: 'lining-bind', section: 'LINING', kind: 'TECH_CARD_BOM_KIND_BINDING' },
      { lineKey: 'trim-tape', section: 'TRIMS', kind: 'TECH_CARD_BOM_KIND_TAPE' },
      { lineKey: 'shell-piping', section: 'SHELL', kind: 'TECH_CARD_BOM_KIND_PIPING' },
      { lineKey: 'button', section: 'TRIMS', kind: 'TECH_CARD_BOM_KIND_BUTTON' },
    ];
    expect(bindingBomLines(lines).map((line) => line.lineKey)).toEqual([
      'lining-bind',
      'trim-tape',
      'shell-piping',
    ]);
  });

  it('creates the first binding strip with the approved defaults', () => {
    const born = freshBindingStrip({
      line: { lineKey: 'binding-line', unit: 'm' },
      sizeIds: [1, 2],
    });
    expect(born).toMatchObject({
      bomLineKey: 'binding-line',
      lengthMode: 'from_seam',
      seamKey: '',
      fitPct: '100',
      overlapMm: '30',
      qty: 1,
    });
  });

  it('links the picked edge seam to its strip and births another strip for the next edge', () => {
    const linked = linkBindingStripToSeam(operation, [strip], seam, 'saved-seam');
    expect(linked?.strips[0].seamKey).toBe('saved-seam');

    const target = bindingStripTarget(operation, linked?.strips ?? [], [1]);
    expect(target?.fresh).toBe(true);
    expect(target?.strip).toMatchObject({
      bomLineKey: 'binding-line',
      seamKey: '',
      overlapMm: '30',
    });
    expect(target?.strip.lineKey).not.toBe('strip-a');
  });

  it('builds side B automatically from the full synthetic strip edge', () => {
    const cloth = rectangle('cloth', 120, 50);
    const row = bindingRowFromCloth([{ target: 'cloth#0' }], strip, new Map([['cloth', cloth]]), {
      pieces: [cloth],
      grainDeg: null,
      nameOf: (key) => key,
    });
    expect(row?.sideA[0]?.piece).toBe('cloth');
    expect(row?.sideB[0]?.piece).toBe('strip-a');
    expect(row?.sideB[0]?.range).toEqual([0, 1]);
  });

  it('removes a binding strip when its seam is deleted', () => {
    const linked = { ...strip, seamKey: 'saved-seam' };
    expect(removeBindingStripsForSeam(operation, [linked], 'saved-seam')).toEqual({
      strips: [],
      inputKeys: ['cloth'],
      removedLineKeys: ['strip-a'],
    });
  });
});
