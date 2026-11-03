import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { apply, compose } from 'lib/assembly-skeleton/union/affine';
import { poseRow, type EdgeAnchor, type StoredPose, type StoredSeam } from 'lib/seams';

import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSE_430,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  CARD6_CHAIN_SURFACE_KEY,
  card6ChainGeoms,
  card6ChainInnerLines,
  card6ChainStep,
} from './card6-chain.fixture';
import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
  card6Step,
} from './card6.fixture';
import { boxOf, invert } from './step-picture';
import { placementT, poseAfterDrop, posePickup } from './step-pose';
import { StepResultProvider, useStepResult } from './step-result-context';
import { OWNER_FIT, stepResults, type StepResult, type StepResultsInput } from './step-result';
import type { FormOpLike } from './step-seams-model';
import { seamIsLaid } from './step-rows';
import { layerStyle } from './layer-style';

const closeAffine = (actual: Affine, expected: Affine, digits = 6) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));

const relative = (result: StepResult, piece: string, host: string) =>
  compose(invert(result.transforms.get(host)!), result.transforms.get(piece)!);

const expectRigidMove = (before: StepResult, after: StepResult, pieces: readonly string[]) => {
  expect(pieces.length).toBeGreaterThan(0);
  const first = pieces[0];
  const delta = compose(after.transforms.get(first)!, invert(before.transforms.get(first)!));
  for (const piece of pieces)
    closeAffine(after.transforms.get(piece)!, compose(delta, before.transforms.get(piece)!));
};

const midAlong = (points: readonly (readonly [number, number])[]): [number, number] => {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  let left = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (left <= length || index === lengths.length - 1) {
      const share = length ? left / length : 0;
      return [
        points[index][0] + (points[index + 1][0] - points[index][0]) * share,
        points[index][1] + (points[index + 1][1] - points[index][1]) * share,
      ];
    }
    left -= length;
  }
  return [...points[0]];
};

const chainGeoms = card6ChainGeoms();
const chainInnerLines = card6ChainInnerLines();
const chainInput: StepResultsInput = {
  ops: CARD6_CHAIN_OPS,
  byKey: CARD6_CHAIN_SEAMS,
  poses: CARD6_CHAIN_POSES,
  geoms: chainGeoms,
  innerLines: chainInnerLines,
  pieceKeys: CARD6_CHAIN_PIECE_KEYS,
};

const operationResult = (results: readonly StepResult[], operationNumber: number) =>
  results[card6ChainStep(operationNumber)];

describe('stepResults: one carried owner result per operation', () => {
  it('manualFit keeps the right placket face-up and an unplaced pocket grain-up', () => {
    const results = stepResults(chainInput, { manualFit: true });
    for (const operationNumber of [90, 260]) {
      const T = operationResult(results, operationNumber).transforms.get('FLP_R')!;
      expect(T[0] * T[3] - T[1] * T[2]).toBeGreaterThan(0);
    }

    const pocket = operationResult(results, 540).transforms.get('PCK_L_BTTM')!;
    closeAffine([pocket[0], pocket[1], pocket[2], pocket[3], 0, 0], [1, 0, 0, 1, 0, 0]);
  });

  it('manualFit joins an unplaced edge row at the two picked edge midpoints', () => {
    const result = operationResult(stepResults(chainInput, { manualFit: true }), 540);
    const host = resolveEdge('P_L_MAIN#1', chainGeoms)!;
    const part = resolveEdge('PCK_L_BTTM#1', chainGeoms)!;
    const hostMid = midAlong(
      host.pts.map((point) => apply(result.transforms.get(host.pieceKey)!, point)),
    );
    const partMid = midAlong(
      part.pts.map((point) => apply(result.transforms.get(part.pieceKey)!, point)),
    );
    expect(Math.hypot(hostMid[0] - partMid[0], hostMid[1] - partMid[1])).toBeLessThanOrEqual(0.5);
  });

  it('manualFit leaves the placement-less surface path unchanged', () => {
    const automatic = operationResult(stepResults(chainInput), 30);
    const manual = operationResult(stepResults(chainInput, { manualFit: true }), 30);
    for (const piece of automatic.transforms.keys())
      closeAffine(manual.transforms.get(piece)!, automatic.transforms.get(piece)!);
  });

  it('keeps a pickup-authored pose because its fixed host is in another input', () => {
    const before = operationResult(stepResults(chainInput, { manualFit: true }), 380);
    const piece = 'FLP_L_MAIN';
    const pickup = posePickup(piece, before, chainGeoms);
    expect(pickup.host).not.toBeNull();
    const droppedT = compose([1, 0, 0, 1, 35, -20], before.transforms.get(piece)!);
    const dropped = poseAfterDrop(piece, droppedT, pickup, before, chainGeoms)!;
    const key = 'pickup-authored pose';
    const row = poseRow({
      seamKey: key,
      piece: chainGeoms.get(piece)!,
      host: chainGeoms.get(dropped.host)!,
      placement: dropped.placement,
    });
    const ops = CARD6_CHAIN_OPS.map((op) =>
      op.operationNumber === 380 ? { ...op, poseKeys: [...(op.poseKeys ?? []), key] } : op,
    );
    const result = operationResult(
      stepResults(
        { ...chainInput, ops, poses: new Map([...CARD6_CHAIN_POSES, [key, row]]) },
        { manualFit: true },
      ),
      380,
    );

    expect(result.ignoredPoses).not.toContain(key);
    closeAffine(
      relative(result, piece, dropped.host),
      placementT(chainGeoms.get(dropped.host)!, chainGeoms.get(piece)!, dropped.placement),
    );
  });

  it('carries #30 → #380 → #430 → #1030 as one affine per sleeve block', () => {
    const results = stepResults(chainInput);
    const at380 = operationResult(results, 380);
    const at430 = operationResult(results, 430);
    const at1030 = operationResult(results, 1030);
    const sleeve430 = at430.blocks.find((block) => block.inputKey === 'SLEEVE-2')!;
    const sleeve1030 = at1030.blocks.find((block) => block.inputKey === 'SLEEVE-2-FINISHED')!;

    expect(sleeve430.pieces).toEqual(expect.arrayContaining(['SLV_L', 'FLP_L', 'FLP_L_MAIN']));
    expectRigidMove(at380, at430, sleeve430.pieces);
    expectRigidMove(at430, at1030, sleeve1030.pieces);
  });

  it('returns the same cached objects to independent callers and the context hook', () => {
    const first = stepResults(chainInput, OWNER_FIT);
    const second = stepResults({ ...chainInput }, OWNER_FIT);
    const index = card6ChainStep(430);
    let fromHook: StepResult | undefined;
    const Reader = () => {
      fromHook = useStepResult(index);
      return null;
    };

    renderToStaticMarkup(
      createElement(StepResultProvider, { input: { ...chainInput } }, createElement(Reader)),
    );
    expect(second).toBe(first);
    expect(second[index]).toBe(first[index]);
    expect(second[index].transforms).toBe(first[index].transforms);
    expect(fromHook).toBe(first[index]);
  });

  it('passes one input through unchanged and shelves several rowless inputs apart', () => {
    const chain = stepResults(chainInput);
    const at380 = operationResult(chain, 380);
    const at430 = operationResult(chain, 430);
    for (const piece of at430.blocks[0].pieces)
      closeAffine(at430.transforms.get(piece)!, at380.transforms.get(piece)!);

    const ops: FormOpLike[] = [
      { operationNumber: 1, inputKeys: ['SLV_L', 'FLP_L'], outputUnitKey: 'APART' },
    ];
    const geoms = card6ChainGeoms();
    const input: StepResultsInput = {
      ops,
      byKey: new Map(),
      geoms,
      innerLines: card6ChainInnerLines(),
      pieceKeys: new Set(['SLV_L', 'FLP_L']),
    };
    const apart = stepResults(input)[0];
    const boxes = ['SLV_L', 'FLP_L'].map((piece) =>
      boxOf(geoms.get(piece)!.rs.map((point) => apply(apart.transforms.get(piece)!, point))),
    );
    expect(
      boxes[0].x1 < boxes[1].x0 ||
        boxes[1].x1 < boxes[0].x0 ||
        boxes[0].y1 < boxes[1].y0 ||
        boxes[1].y1 < boxes[0].y0,
    ).toBe(true);
    const again = stepResults({ ...input, byKey: new Map() })[0];
    for (const piece of ['SLV_L', 'FLP_L'])
      closeAffine(again.transforms.get(piece)!, apart.transforms.get(piece)!);
  });

  it('a later step cannot pose a reverse of an earlier pose: both pieces are one input by then', () => {
    const surface = CARD6_CHAIN_SEAMS.get(CARD6_CHAIN_SURFACE_KEY)!;
    const geoms = card6ChainGeoms();
    const forward = 'sleeve on front';
    const reverse = 'front on sleeve, later';
    const poseRows: StoredPose[] = [
      poseRow({
        seamKey: forward,
        piece: geoms.get('SLV_L')!,
        host: geoms.get('FLP_L_MAIN')!,
        placement: { xMm: 20, yMm: 40, rotDeg: 90, flip: false },
      }),
      poseRow({
        seamKey: reverse,
        piece: geoms.get('FLP_L_MAIN')!,
        host: geoms.get('SLV_L')!,
        placement: { xMm: 300, yMm: 400, rotDeg: 180, flip: true },
      }),
    ];
    const ops: FormOpLike[] = [
      {
        operationNumber: 30,
        inputKeys: ['SLV_L', 'FLP_L'],
        outputUnitKey: 'SLEEVE',
        seamKeys: [surface.seamKey],
      },
      {
        operationNumber: 380,
        inputKeys: ['SLEEVE', 'FLP_L_MAIN'],
        outputUnitKey: 'SLEEVE-2',
        poseKeys: [forward],
      },
      {
        operationNumber: 430,
        inputKeys: ['SLEEVE-2'],
        outputUnitKey: 'SLEEVE-3',
        poseKeys: [reverse],
      },
    ];
    const posed = stepResults({
      ops,
      byKey: new Map([[surface.seamKey, surface]]),
      poses: new Map(poseRows.map((row) => [row.seamKey, row])),
      geoms,
      innerLines: card6ChainInnerLines(),
      pieceKeys: new Set(['SLV_L', 'FLP_L', 'FLP_L_MAIN']),
    });

    expect(posed[1].ignoredPoses).not.toContain(forward);
    expect(posed[2].ignoredPoses).toEqual([reverse]);
    for (const piece of ['SLV_L', 'FLP_L', 'FLP_L_MAIN'])
      closeAffine(posed[2].transforms.get(piece)!, posed[1].transforms.get(piece)!);
  });

  it('ignores same-input poses and moves every piece of a valid pose block', () => {
    const surface = CARD6_CHAIN_SEAMS.get(CARD6_CHAIN_SURFACE_KEY)!;
    const geoms = card6ChainGeoms();
    const validKey = 'move sleeve block';
    const ignoredKey = 'old same-block pose';
    const poseRows: StoredPose[] = [
      poseRow({
        seamKey: validKey,
        piece: geoms.get('SLV_L')!,
        host: geoms.get('FLP_L_MAIN')!,
        placement: { xMm: 20, yMm: 40, rotDeg: 90, flip: false },
      }),
      poseRow({
        seamKey: ignoredKey,
        piece: geoms.get('FLP_L')!,
        host: geoms.get('SLV_L')!,
        placement: { xMm: 300, yMm: 400, rotDeg: 180, flip: true },
      }),
    ];
    const ops: FormOpLike[] = [
      {
        operationNumber: 30,
        inputKeys: ['SLV_L', 'FLP_L'],
        outputUnitKey: 'SLEEVE',
        seamKeys: [surface.seamKey],
      },
      {
        operationNumber: 380,
        inputKeys: ['SLEEVE', 'FLP_L_MAIN'],
        outputUnitKey: 'SLEEVE-2',
        poseKeys: [validKey],
      },
      {
        operationNumber: 430,
        inputKeys: ['SLEEVE-2'],
        outputUnitKey: 'SLEEVE-3',
        poseKeys: [ignoredKey],
      },
    ];
    const pureInput: StepResultsInput = {
      ops,
      byKey: new Map([[surface.seamKey, surface]]),
      poses: new Map(poseRows.map((row) => [row.seamKey, row])),
      geoms,
      innerLines: card6ChainInnerLines(),
      pieceKeys: new Set(['SLV_L', 'FLP_L', 'FLP_L_MAIN']),
    };
    const posed = stepResults(pureInput);
    const rowless = stepResults({
      ...pureInput,
      poses: new Map(),
      ops: ops.map((op) => ({ ...op, poseKeys: [] })),
    });

    expectRigidMove(posed[0], posed[1], ['SLV_L', 'FLP_L']);
    expect(posed[1].transforms.get('SLV_L')).not.toEqual(rowless[1].transforms.get('SLV_L'));
    expect(posed[2].ignoredPoses).toEqual([ignoredKey]);
    for (const piece of ['SLV_L', 'FLP_L', 'FLP_L_MAIN'])
      closeAffine(posed[2].transforms.get(piece)!, posed[1].transforms.get(piece)!);
  });

  it('exposes the drawn layout and the owned flag', () => {
    const results = stepResults(chainInput);
    for (const result of results)
      for (const [piece, T] of result.transforms) closeAffine(result.layout.T.get(piece)!, T);
    expect(operationResult(results, 30).owned).toBe(true);
    expect(operationResult(results, 430).owned).toBe(true);
    expect(operationResult(results, 1030).owned).toBe(true);
    expect(operationResult(results, 150).owned).toBe(
      (CARD6_CHAIN_OPS[card6ChainStep(150)].seamKeys ?? []).some((key) =>
        CARD6_CHAIN_SEAMS.has(key),
      ),
    );
  });

  it('claims no stacking without the owner: #540 bag and front are equal (no hand, no flag)', () => {
    const results = stepResults(
      {
        ops: CARD6_OPS,
        byKey: CARD6_SEAMS,
        geoms: card6Geoms(),
        innerLines: card6InnerLines(),
        pieceKeys: CARD6_PIECE_KEYS,
      },
      { manualFit: true },
    );
    const at540 = results[card6Step(540)];
    expect(at540.lower).not.toContain('PCK_L_BTTM');
    expect(at540.lower).not.toContain('P_L_MAIN');
    expect(at540.stacked).toEqual([]);
  });

  it('greys nothing from a legacy «inside» hand: sleeves stay white at #1030 and #1060', () => {
    const byKey = new Map(CARD6_SEAMS);
    for (const [key, row] of byKey) {
      if (row.kind === 'surface') continue;
      const inside = (side: typeof row.sideA) =>
        side.map((anchor) => ({
          ...anchor,
          placement: { xMm: 0, yMm: 1, rotDeg: 0, flip: false },
        }));
      byKey.set(key, { ...row, sideA: inside(row.sideA), sideB: inside(row.sideB) });
    }
    const results = stepResults(
      {
        ops: CARD6_OPS,
        byKey,
        geoms: card6Geoms(),
        innerLines: card6InnerLines(),
        pieceKeys: CARD6_PIECE_KEYS,
      },
      { manualFit: true },
    );
    for (const op of [1030, 1060]) {
      const at = results[card6Step(op)];
      expect(at.transforms.has('SLV_L')).toBe(true);
      expect(at.stacked).toEqual([]);
      expect(at.lower).toEqual([]);
    }
    expect(results.flatMap((result) => result.lower)).toEqual([]);
  });

  it.each(['under', 'over'] as const)(
    'puts the #540 bag %s its front by the owner flag and carries the claim on',
    (layer) => {
      const op = CARD6_OPS[card6Step(540)];
      const byKey = new Map(CARD6_SEAMS);
      for (const key of op.seamKeys ?? []) {
        const row = byKey.get(key);
        if (!row) continue;
        const flag = (side: typeof row.sideA) =>
          side.map((anchor) => (anchor.piece === 'PCK_L_BTTM' ? { ...anchor, layer } : anchor));
        byKey.set(key, { ...row, sideA: flag(row.sideA), sideB: flag(row.sideB) });
      }
      const results = stepResults(
        {
          ops: CARD6_OPS,
          byKey,
          geoms: card6Geoms(),
          innerLines: card6InnerLines(),
          pieceKeys: CARD6_PIECE_KEYS,
        },
        { manualFit: true },
      );
      const at540 = results[card6Step(540)];
      const [under, over] =
        layer === 'under' ? ['PCK_L_BTTM', 'P_L_MAIN'] : ['P_L_MAIN', 'PCK_L_BTTM'];
      expect(at540.stacked).toContainEqual([under, over]);
      expect(at540.lower).toContain(under);
      expect(at540.lower).not.toContain(over);
      expect(at540.layers.indexOf(under)).toBeLessThan(at540.layers.indexOf(over));
      const later = results
        .slice(card6Step(540) + 1)
        .find((result) => result.transforms.has('PCK_L_BTTM') && result.transforms.has('P_L_MAIN'));
      if (later) expect(later.stacked).toContainEqual([under, over]);
    },
  );

  it('marks a rowless card as not owned', () => {
    const results = stepResults({ ...chainInput, byKey: new Map(), poses: new Map() });
    expect(results.every((result) => !result.owned)).toBe(true);
  });

  it('does not re-apply #380 poses at #430', () => {
    const results = stepResults(chainInput);
    const at380 = operationResult(results, 380);
    const at430 = operationResult(results, 430);
    expect(at430.ignoredPoses).toEqual([CARD6_CHAIN_POSE_430]);
    for (const piece of ['SLV_L', 'FLP_L', 'FLP_L_MAIN'])
      closeAffine(at430.transforms.get(piece)!, at380.transforms.get(piece)!);
  });

  it('applies the #30 surface row once and carries its placement, the later input on top', () => {
    const results = stepResults(chainInput);
    const at30 = operationResult(results, 30);
    const at380 = operationResult(results, 380);
    const at430 = operationResult(results, 430);
    const expected = relative(at30, 'FLP_L', 'SLV_L');
    closeAffine(relative(at380, 'FLP_L', 'SLV_L'), expected);
    closeAffine(relative(at430, 'FLP_L', 'SLV_L'), expected);
    // A surface part follows the one rule: no paint hint, no flag, the later input lies above.
    for (const result of [at30, at380, at430])
      expect(result.layers.indexOf('SLV_L')).toBeLessThan(result.layers.indexOf('FLP_L'));
  });

  it('breaks direct self and later-output cycles without recursion', () => {
    const geoms = new Map<string, PieceGeom>([['SLV_L', chainGeoms.get('SLV_L')!]]);
    const self = stepResults({
      ops: [{ operationNumber: 10, inputKeys: ['SLV_L'], outputUnitKey: 'SLV_L' }],
      byKey: new Map(),
      geoms,
      innerLines: new Map(),
      pieceKeys: new Set(['SLV_L']),
    });
    expect(self[0].cycles).toEqual(['self:SLV_L']);
    expect(self[0].transforms.has('SLV_L')).toBe(true);

    const later = stepResults({
      ops: [
        { operationNumber: 20, inputKeys: ['FUTURE'], outputUnitKey: 'NOW' },
        { operationNumber: 30, inputKeys: ['SLV_L'], outputUnitKey: 'FUTURE' },
      ],
      byKey: new Map(),
      geoms,
      innerLines: new Map(),
      pieceKeys: new Set(['SLV_L']),
    });
    expect(later[0].cycles).toEqual(['later:FUTURE@30']);
    expect(later).toHaveLength(2);
  });
});

describe('a seam that does not lie where it is drawn links nothing', () => {
  // The shape of step 370 of card 83: a sleeve sewn into an armhole nobody placed, so it is seated by
  // translation only, its cap on the bottom of the armhole and the sleeve hanging across the body.
  const armhole: Pt2[] = [
    [200, 0],
    [140, -100],
    [100, -150],
    [60, -100],
    [0, 0],
  ];
  const cap: Pt2[] = [
    [200, 0],
    [140, 100],
    [100, 150],
    [60, 100],
    [0, 0],
  ];
  const piece = (key: string, rs: Pt2[], seamLine: Pt2[], from: number, to: number): PieceGeom =>
    ({
      pieceKey: key,
      name: key,
      hand: null,
      cloth: null,
      corners: [],
      rect: false,
      twinOf: [],
      notchIdx: [],
      rs,
      perimMm: 3000,
      areaMm2: 100000,
      edges: [
        {
          id: `${key}#0`,
          pieceKey: key,
          k: 0,
          s: from,
          e: to,
          pts: seamLine,
          lenMm: 420,
          chordMm: 200,
          turnDeg: 0,
          notchesMm: [],
          kind: 'edge' as const,
        },
      ],
    }) as PieceGeom;
  const geoms = new Map([
    [
      'BODY',
      piece('BODY', [[-200, 0], [-200, -800], [400, -800], [400, 0], ...armhole], armhole, 4, 8),
    ],
    ['SLEEVE', piece('SLEEVE', [[0, 0], [0, -500], [200, -500], ...cap.slice(0, -1)], cap, 3, 0)],
  ]);
  const anchor = (at: string): EdgeAnchor => ({
    piece: at.slice(0, at.lastIndexOf('#')),
    samples: [
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
      [1, 0],
    ],
    perimShare: 0.25,
    lenMm: 420,
    notches: 0,
    turnDeg: 0,
    range: [0, 1],
    edgeHint: at,
    contourSig: 'same',
  });
  const seam: StoredSeam = {
    seamKey: 'armhole',
    status: 'confirmed',
    kind: 'edge',
    direction: 'reversed',
    source: 'manual',
    sideA: [anchor('BODY#0')],
    sideB: [anchor('SLEEVE#0')],
    anchoredSize: '',
    note: '',
  };
  const T = (sleeve: Affine) =>
    new Map<string, Affine>([
      ['BODY', [1, 0, 0, 1, 0, 0]],
      ['SLEEVE', sleeve],
    ]);

  it('measures whether the two sides of a seam meet', () => {
    // The cap turned onto the armhole, side on side.
    expect(seamIsLaid(seam, T([1, 0, 0, -1, 0, 0]), geoms)).toBe(true);
    // The cap touches the armhole's bottom and no more.
    expect(seamIsLaid(seam, T([1, 0, 0, 1, 0, -300]), geoms)).toBe(false);
    expect(seamIsLaid({ ...seam, kind: 'surface' }, T([1, 0, 0, 1, 0, -300]), geoms)).toBe(true);
    // What cannot be measured stays a seam.
    const lost = { ...seam, sideA: [anchor('GONE#0')] };
    expect(seamIsLaid(lost, T([1, 0, 0, 1, 0, -300]), geoms)).toBe(true);
  });

  it('the sleeve stays level 0 on its step and on every later one, and the pieces do not move', () => {
    const ops: FormOpLike[] = [
      {
        operationNumber: 370,
        inputKeys: ['BODY', 'SLEEVE'],
        outputUnitKey: 'WHOLE',
        seamKeys: ['armhole'],
      },
      { operationNumber: 380, inputKeys: ['WHOLE'], outputUnitKey: 'WHOLE_2' },
    ];
    const results = stepResults(
      {
        ops,
        byKey: new Map([['armhole', seam]]),
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(['BODY', 'SLEEVE']),
      },
      OWNER_FIT,
    );
    for (const result of results) {
      const input = { layers: result.layers, T: result.layout.T, geoms };
      const onlyShapes = layerStyle(input);
      expect(Math.max(...[...onlyShapes.pieces.values()].map((one) => one.level))).toBe(1);

      expect(seamIsLaid(seam, result.layout.T, geoms)).toBe(false);
      expect(result.layout.colliding).toEqual([['BODY', 'SLEEVE']]);
      const linked = layerStyle({ ...input, colliding: result.layout.colliding });
      for (const one of linked.pieces.values()) {
        expect(one.level).toBe(0);
        expect(one.coveredBy).toEqual([]);
      }
    }
    closeAffine(results[1].transforms.get('SLEEVE')!, results[0].transforms.get('SLEEVE')!);
  });

  it('a step with no seam row reports no collision', () => {
    const rowless = stepResults(
      {
        ops: [{ operationNumber: 10, inputKeys: ['BODY', 'SLEEVE'] }],
        byKey: new Map(),
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(['BODY', 'SLEEVE']),
      },
      OWNER_FIT,
    );
    expect(rowless[0].layout.colliding).toEqual([]);
  });
});
