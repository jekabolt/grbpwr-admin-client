import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { StoredSeam } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import type { CutStrip } from './cut-strip-editor/use-cut-strip';
import {
  bindingBomLines,
  bindingLineSub,
  bindingRowFromCloth,
  bindingStripTarget,
  freshBindingStrip,
  isBindingLine,
  isBindingStrip,
  isCardBindingStrip,
  linkBindingStripToSeam,
  removeBindingStripsForSeam,
  teardownBindingStrips,
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
  placement: '__binding__',
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
  it('recognises binding kinds and eligible purpose-based roll goods', () => {
    expect(isBindingLine({ kind: ' TECH_CARD_BOM_KIND_TAPE ' })).toBe(true);
    expect(
      isBindingLine({
        section: 'TECH_CARD_BOM_SECTION_LINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
        unit: 'm',
      }),
    ).toBe(true);
    expect(
      isBindingLine({
        section: 'TECH_CARD_BOM_SECTION_LINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
        unit: 'm',
      }),
    ).toBe(false);
    expect(
      isBindingLine({
        section: 'TECH_CARD_BOM_SECTION_LINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
        unit: 'pcs',
      }),
    ).toBe(false);
    expect(
      isBindingLine({
        section: 'TECH_CARD_BOM_SECTION_FABRIC',
        purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        unit: 'm',
      }),
    ).toBe(false);
  });

  it('orders kind lines before purpose lines and keeps BOM order inside each group', () => {
    const lines = [
      {
        lineKey: 'lining-purpose',
        section: 'TECH_CARD_BOM_SECTION_LINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
        unit: 'm',
      },
      { lineKey: 'trim-tape', kind: 'TECH_CARD_BOM_KIND_TAPE' },
      { lineKey: 'trim-piping', kind: 'TECH_CARD_BOM_KIND_PIPING' },
      {
        lineKey: 'fabric-purpose',
        section: 'TECH_CARD_BOM_SECTION_FABRIC',
        purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
        unit: 'm',
      },
      { lineKey: 'button', section: 'TRIMS', kind: 'TECH_CARD_BOM_KIND_BUTTON' },
    ];
    expect(bindingBomLines(lines).map((line) => line.lineKey)).toEqual([
      'trim-tape',
      'trim-piping',
      'lining-purpose',
      'fabric-purpose',
    ]);
    expect(bindingBomLines(lines, new Set(['lining-purpose'])).map((line) => line.lineKey)).toEqual(
      ['trim-tape', 'trim-piping', 'fabric-purpose'],
    );
    expect(bindingLineSub(lines[0])).toBe('lining · binding');
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
      placement: '__binding__',
    });
  });

  it('does not copy a roll-goods width into the binding strip', () => {
    const born = freshBindingStrip({
      line: {
        lineKey: 'lining-binding',
        section: 'TECH_CARD_BOM_SECTION_LINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
        unit: 'm',
        fabricWidth: '140',
      },
      sizeIds: [1],
    });
    expect(born.widthMm).toBe('');

    const cloth = rectangle('cloth', 120, 50);
    expect(
      bindingRowFromCloth([{ target: 'cloth#0' }], born, new Map([['cloth', cloth]]), {
        pieces: [cloth],
        grainDeg: null,
        nameOf: (key) => key,
      }),
    ).not.toBeNull();
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

  it('tears down only the selected step binding strips', () => {
    const own = { ...strip, seamKey: 'strip-seam' };
    const other = {
      ...strip,
      lineKey: 'strip-b',
      bomLineKey: 'other-line',
      seamKey: 'seam-b',
    };
    const manual = {
      ...strip,
      lineKey: 'manual-strip',
      placement: '',
      seamKey: 'manual-seam',
    };
    const plan = teardownBindingStrips(
      {
        cutStrips: [own, other, manual],
        operations: [
          {
            inputKeys: ['cloth', 'strip-a', 'manual-strip'],
            seamKeys: ['strip-seam', 'touch-seam', 'manual-seam'],
          },
          { inputKeys: ['cloth', 'strip-b'], seamKeys: ['seam-b'] },
        ],
        seamRows: [
          { ...seam, seamKey: 'touch-seam' },
          {
            ...seam,
            seamKey: 'seam-b',
            sideB: [{ piece: 'strip-b' }],
          } as StoredSeam,
        ],
      },
      { stepIndexes: [0] },
    );
    expect(plan.strips.map((row) => row.lineKey)).toEqual(['strip-b', 'manual-strip']);
    expect(plan.operations).toEqual([
      { index: 0, inputKeys: ['cloth', 'manual-strip'], seamKeys: ['manual-seam'] },
    ]);
    expect(plan.seamRowsToRemove).toEqual(['touch-seam']);
  });

  it('tears down binding strips by BOM line without touching another line', () => {
    const plan = teardownBindingStrips(
      {
        cutStrips: [
          { ...strip, seamKey: 'seam-a' },
          { ...strip, lineKey: 'strip-b', bomLineKey: 'other-line', seamKey: 'seam-b' },
        ],
        operations: [
          { inputKeys: ['strip-a'], seamKeys: ['seam-a'] },
          { inputKeys: ['strip-b'], seamKeys: ['seam-b'] },
        ],
        seamRows: [{ ...seam, seamKey: 'seam-a' }],
      },
      { bomLineKeys: ['binding-line'] },
    );
    expect(plan.strips.map((row) => row.lineKey)).toEqual(['strip-b']);
    expect(plan.operations).toEqual([{ index: 0, inputKeys: [], seamKeys: [] }]);
    expect(plan.seamRowsToRemove).toEqual(['seam-a']);
  });

  it('recognises a reloaded binding strip by its B1 owner', () => {
    const reloaded = { ...strip, placement: '', seamKey: 'saved-seam' };
    expect(isBindingStrip(reloaded)).toBe(false);
    expect(isBindingStrip(reloaded, operation)).toBe(true);
    expect(isBindingStrip({ ...reloaded, lengthMode: 'per_size' }, operation)).toBe(false);
    expect(isBindingStrip(reloaded, { ...operation, work: 'join_seam' })).toBe(false);
    expect(isCardBindingStrip(reloaded, [{ inputKeys: ['strip-a'] }, operation])).toBe(true);
    expect(removeBindingStripsForSeam(operation, [reloaded], 'saved-seam')).toEqual({
      strips: [],
      inputKeys: ['cloth'],
      removedLineKeys: ['strip-a'],
    });
    const plan = teardownBindingStrips(
      { cutStrips: [reloaded], operations: [operation], seamRows: [] },
      { stepIndexes: [0] },
    );
    expect(plan.strips).toEqual([]);
  });
});
