import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { SkeletonFacts } from 'lib/assembly-skeleton/types';
import { solveDoll } from 'lib/doll/doll';
import type { StoredFold } from 'lib/folds';

import { card77Facts } from '../step-seams/card77.fixture';
import { foldRowsSig } from '../assembly-folds/folds-store';
import { dollKey, dollRequest, type DollCard } from './use-doll-card';

// Beta card 85, SLV_L: the two stored inward rows of its double hem (02.11.2026). Card 85 is a
// copy of card 77's real DXF outlines, remapped from the readable piece name to this line key.
const SLEEVE = '01M5J6VRN9CD5YPTK2BZ9WQWFZ';
const sleeveRows: StoredFold[] = [
  {
    foldKey: '01M6E96APSSB380021YCK120E4',
    pieceKey: SLEEVE,
    seq: 1,
    kind: 'inward',
    source: 'owner',
    line: [
      [0.192, 0.021],
      [0.796, 0.024],
    ],
    flipAt: [0.494, 0.015],
    edge: {
      hint: `${SLEEVE}#3`,
      samples: [
        [0.202, 0],
        [0.348, 0],
        [0.493, 0.001],
        [0.639, 0.001],
        [0.784, 0.001],
      ],
      offsetMm: 15.27,
    },
    contourSig: 'ffbbe14117360e77',
    anchoredSize: 'M',
    note: '',
    stale: false,
  },
  {
    foldKey: '01M6E96APSH260Z4C0P4V618TJ',
    pieceKey: SLEEVE,
    seq: 2,
    kind: 'inward',
    source: 'owner',
    line: [
      [0.191, 0.044],
      [0.796, 0.047],
    ],
    flipAt: [0.494, 0.038],
    edge: {
      hint: `${SLEEVE}#3`,
      samples: [
        [0.202, 0],
        [0.348, 0],
        [0.493, 0.001],
        [0.639, 0.001],
        [0.784, 0.001],
      ],
      offsetMm: 31.22,
    },
    contourSig: 'ffbbe14117360e77',
    anchoredSize: 'M',
    note: '',
    stale: false,
  },
];

function sleeveFacts(scale = 1): SkeletonFacts {
  const base = card77Facts();
  const sleeve = base.pieces.find((piece) => piece.pieceKey === 'SLV_L');
  if (!sleeve) throw new Error('card 77 sleeve fixture missing');
  const piece = sleeve.piece;
  return {
    ...base,
    category: 'generic',
    pieces: [
      {
        ...sleeve,
        pieceKey: SLEEVE,
        cutSymmetry: null,
        piece: {
          ...piece,
          poly: piece.poly.map(({ x, y }) => ({ x: x * scale, y: y * scale })),
          bboxW: piece.bboxW * scale,
          bboxH: piece.bboxH * scale,
          areaCm2: piece.areaCm2 * scale * scale,
        },
      },
    ],
  };
}

function cardOf(facts: ReadonlyMap<string, SkeletonFacts>, rows = sleeveRows): DollCard {
  const sizes = [...facts.keys()];
  return {
    cardId: 85,
    baseSize: sizes[0],
    sizes,
    sizeLabel: (size) => size,
    factsOf: (size) => facts.get(size) ?? null,
    missingOf: () => [],
    rows: [],
    owner: null,
    rowsSig: 'no-seams',
    foldRows: rows,
    foldRowsSig: foldRowsSig(rows),
    joins: [],
    hardware: [],
    fastenings: [],
    gender: null,
    readId: 1,
    inputSig: 'fixture',
  };
}

describe('dollRequest folds', () => {
  it('resolves stored rows by piece and by selected size, in seq order', () => {
    const card = cardOf(
      new Map([
        ['M', sleeveFacts()],
        ['L', sleeveFacts(1.1)],
      ]),
    );
    const medium = dollRequest(card, 'M', false)!;
    const large = dollRequest(card, 'L', false)!;

    expect(Object.keys(medium.options.folds!)).toEqual([SLEEVE]);
    expect(medium.options.folds![SLEEVE].map((fold) => fold.seq)).toEqual([1, 2]);
    expect(large.options.folds![SLEEVE].map((fold) => fold.seq)).toEqual([1, 2]);
    expect(large.options.folds![SLEEVE]).not.toEqual(medium.options.folds![SLEEVE]);
  });

  it('omits the folds option without rows and never invents a missing piece', () => {
    const facts = sleeveFacts();
    const plain = dollRequest(cardOf(new Map([['M', facts]]), []), 'M', false)!;
    expect(plain.options).not.toHaveProperty('folds');

    const missing = dollRequest(cardOf(new Map([['M', { ...facts, pieces: [] }]])), 'M', false)!;
    expect(missing.options.folds).toEqual({});
  });

  it('changes the solve key when a stored fold changes', () => {
    const facts = new Map([['M', sleeveFacts()]]);
    const before = cardOf(facts);
    const changedRows = sleeveRows.map((row, index) =>
      index === 0 ? { ...row, kind: 'outward' as const } : row,
    );
    const after = cardOf(facts, changedRows);
    expect(dollKey(after, 'M', false)).not.toBe(dollKey(before, 'M', false));
  });

  it('applies both real double-hem rows through the request path', () => {
    const request = dollRequest(cardOf(new Map([['M', sleeveFacts()]])), 'M', false)!;
    const report = solveDoll({
      graph: readSeamGraph(request.facts),
      facts: request.facts,
      options: {
        ...request.options,
        targetVertices: 500,
        maxPasses: 20,
        settlePasses: 0,
        proposeComposite: false,
      },
    });

    expect(report.folds?.map(({ seq, applied }) => ({ seq, applied }))).toEqual([
      { seq: 1, applied: true },
      { seq: 2, applied: true },
    ]);
  }, 60_000);
});
