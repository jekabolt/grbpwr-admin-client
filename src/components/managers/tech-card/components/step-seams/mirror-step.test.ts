import { describe, expect, it, vi } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { StoredFold } from 'lib/folds';
import {
  anchorOfRunId,
  fromWire,
  mirrorEdgeMapOf,
  poseOf,
  poseRow,
  toWire,
  type StoredPose,
  type StoredRow,
  type StoredSeam,
} from 'lib/seams';
import { inFrame } from 'lib/seams/frame';

import { CARD85_OPS, CARD85_SEAMS, card85Geoms, card85Step } from './card85.fixture';
import { card63Geoms, card63InnerLines } from './card63.fixture';
import { isRightMirrorStep, mirrorRowSig, mirrorStepPlan } from './mirror-step';
import { placementT } from './step-pose';
import {
  closedInner,
  innerSlice,
  inputGroups,
  surfaceRow,
  type FormOpLike,
} from './step-seams-model';
import type { SeamChange } from '../assembly-seams/seam-change-plan';
import type { SeamChangeResult } from '../assembly-seams/seam-change';
import { executeMirrorStep } from './use-mirror-step';

const withKeys = (
  ops: readonly FormOpLike[],
  operationNumber: number,
  seamKeys: readonly string[],
  poseKeys: readonly string[] = [],
) =>
  ops.map((op) =>
    op.operationNumber === operationNumber ? { ...op, seamKeys, poseKeys } : { ...op },
  );

const twinT = (from: PieceGeom, to: PieceGeom, kind: 'mirror' | 'identical'): Affine => {
  const box = (points: readonly Pt2[]) => ({
    x0: Math.min(...points.map((point) => point[0])),
    y0: Math.min(...points.map((point) => point[1])),
    x1: Math.max(...points.map((point) => point[0])),
  });
  const f = box(from.rs);
  const t = box(to.rs);
  return kind === 'mirror'
    ? [-1, 0, 0, 1, t.x0 + f.x1, t.y0 - f.y0]
    : [1, 0, 0, 1, t.x0 - f.x0, t.y0 - f.y0];
};

const distance = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('mirrorStepPlan on production fixtures', () => {
  it('#85 op 560 creates the full mirrored set on op 600', () => {
    const geoms = card85Geoms();
    const rows = [...CARD85_SEAMS.values()];
    const plan = mirrorStepPlan({
      step: CARD85_OPS[card85Step(600)],
      cardOps: CARD85_OPS,
      rows,
      poses: [],
      geoms,
    });

    expect(plan.kind).toBe('create');
    expect(plan.sourceOp?.operationNumber).toBe(560);
    expect(plan.upsert).toHaveLength(1);
    expect(plan.upsert[0]).toMatchObject({
      kind: 'surface',
      sideA: [{ piece: '01M5J6YX6FBMK7XMHGT3P8Q13T' }],
      sideB: [{ piece: '01M5J6VRN98VASJPA4RAD58PED' }],
    });
    expect(plan.upsert[0].sideA[0].placement).toEqual({
      xMm: -0.5,
      yMm: -6.9,
      rotDeg: 0,
      flip: false,
    });
    expect(plan.linkKeys).toEqual([plan.upsert[0].seamKey]);
  });

  it('#90 op 210 replaces op 230 with its surface and both posed block pieces', () => {
    const geoms = card63Geoms();
    const inner = card63InnerLines();
    const anchor = (piece: string, edge: number) =>
      anchorOfRunId([...geoms.values()], `${piece}#${edge}`)!;
    const sourceSurface = surfaceRow(
      {
        geom: geoms.get('PCK_BACK_L')!,
        k: 0,
        line: inner.get('PCK_BACK_L')![0],
        grainDeg: 0,
      },
      [anchor('Back_Top_L_R', 3), anchor('Back_Top_R_R', 3)],
      undefined,
      'left-surface',
    )!;
    const sourcePoses: StoredPose[] = [
      poseRow({
        seamKey: 'left-pose-a',
        piece: geoms.get('Back_Top_R_R')!,
        host: geoms.get('PCK_BACK_L')!,
        placement: { xMm: 6.66, yMm: 12.15, rotDeg: 0, flip: false },
        layer: 'over',
      }),
      poseRow({
        seamKey: 'left-pose-b',
        piece: geoms.get('Back_Top_L_R')!,
        host: geoms.get('PCK_BACK_L')!,
        placement: { xMm: 120.44, yMm: -3, rotDeg: 0, flip: false },
        layer: 'over',
      }),
    ];
    const rightSurface0 = surfaceRow(
      {
        geom: geoms.get('PCK_BACK_R')!,
        k: 0,
        line: inner.get('PCK_BACK_R')![0],
        grainDeg: 0,
      },
      [anchor('Back_Top_RL', 2), anchor('Back_Top_RR', 2)],
      undefined,
      'right-surface',
    )!;
    const rightSurface: StoredSeam = {
      ...rightSurface0,
      sideA: [{ ...rightSurface0.sideA[0], layer: 'under' }],
      sideB: rightSurface0.sideB.map((item, index) =>
        index === 1 ? { ...item, layer: 'over' } : item,
      ),
    };
    const rightPose = poseRow({
      seamKey: 'right-pose',
      piece: geoms.get('PCK_BACK_R')!,
      host: geoms.get('Back_Top_RR')!,
      placement: { xMm: -125.88, yMm: -13.56, rotDeg: 2.16, flip: false },
    });
    const ops: FormOpLike[] = [
      {
        operationNumber: 190,
        inputKeys: ['Back_Top_L_R', 'Back_Top_R_R'],
        outputUnitKey: 'BACK',
      },
      {
        operationNumber: 200,
        inputKeys: ['Back_Top_RL', 'Back_Top_RR'],
        outputUnitKey: 'BACK-2',
      },
      {
        operationNumber: 210,
        inputKeys: ['PCK_BACK_L', 'BACK'],
        outputUnitKey: 'LINING',
        seamKeys: [sourceSurface.seamKey],
        poseKeys: sourcePoses.map((row) => row.seamKey),
      },
      {
        operationNumber: 230,
        inputKeys: ['BACK-2', 'PCK_BACK_R'],
        outputUnitKey: 'LINING-2',
        seamKeys: [rightSurface.seamKey],
        poseKeys: [rightPose.seamKey],
      },
    ];
    const leftBefore = JSON.stringify([sourceSurface, ...sourcePoses]);
    const plan = mirrorStepPlan({
      step: ops[3],
      cardOps: ops,
      rows: [sourceSurface, rightSurface],
      poses: [...sourcePoses, rightPose],
      geoms,
    });

    expect(plan.kind).toBe('replace');
    expect(plan.sourceOp?.operationNumber).toBe(210);
    expect(plan.upsert.map((row) => row.kind)).toEqual(['surface', 'pose', 'pose']);
    expect(plan.deleteKeys).toEqual(['right-pose']);
    expect(JSON.stringify([sourceSurface, ...sourcePoses])).toBe(leftBefore);
    const poses = plan.upsert.filter((row): row is StoredPose => row.kind === 'pose');
    expect(poses.map((row) => poseOf(row)?.piece).sort()).toEqual(['Back_Top_RL', 'Back_Top_RR']);
    expect(poses.every((row) => row.sideA[0].layer === 'over')).toBe(true);
    expect(plan.upsert[0].sideA[0].layer).toBeUndefined();
    expect(plan.upsert[0].sideB.every((anchor) => !anchor.layer)).toBe(true);

    for (const sourcePose of sourcePoses) {
      const source = poseOf(sourcePose)!;
      const targetHost = geoms.get(source.host)!.twinOf.find((link) => link.key === 'PCK_BACK_R')!;
      const targetPose = poses.find((row) =>
        geoms.get(source.piece)!.twinOf.some((link) => link.key === poseOf(row)?.piece),
      )!;
      const target = poseOf(targetPose)!;
      const targetPiece = geoms
        .get(source.piece)!
        .twinOf.find((link) => link.key === target.piece)!;
      const sourceT = placementT(
        geoms.get(source.host)!,
        geoms.get(source.piece)!,
        source.placement,
      );
      const targetT = placementT(
        geoms.get(target.host)!,
        geoms.get(target.piece)!,
        target.placement,
      );
      const hostMirror = twinT(geoms.get(source.host)!, geoms.get(target.host)!, targetHost.kind);
      const pieceMirror = twinT(
        geoms.get(source.piece)!,
        geoms.get(target.piece)!,
        targetPiece.kind,
      );
      for (const edge of geoms.get(source.piece)!.edges) {
        for (const point of edge.pts) {
          const mirroredWorld = apply(hostMirror, apply(sourceT, point));
          const targetWorld = apply(targetT, apply(pieceMirror, point));
          expect(distance(mirroredWorld, targetWorld)).toBeLessThan(1);
        }
      }
    }

    // A stale source pose is not a decision to copy: the whole mirror is refused.
    const stalePose = mirrorStepPlan({
      step: ops[3],
      cardOps: ops,
      rows: [sourceSurface, rightSurface],
      poses: [{ ...sourcePoses[0], stale: true }, sourcePoses[1], rightPose],
      geoms,
    });
    expect(stalePose).toMatchObject({ kind: 'edge-mismatch', upsert: [], deleteKeys: [] });
  });

  it('#85 refuses to mirror a stale source seam, and mirrors it again once re-confirmed', () => {
    const geoms = card85Geoms();
    const plan = (stale: boolean) =>
      mirrorStepPlan({
        step: CARD85_OPS[card85Step(600)],
        cardOps: CARD85_OPS,
        rows: [...CARD85_SEAMS.values()].map((row) => ({ ...row, stale })),
        poses: [],
        geoms,
      });
    expect(plan(true)).toMatchObject({ kind: 'edge-mismatch', upsert: [], linkKeys: [] });
    expect(plan(true).sourceOp?.operationNumber).toBe(560);
    expect(plan(false).kind).toBe('create');
  });

  it('#96 op 570 creates its surface, placement, layers, and pose on op 610', () => {
    const geoms = card85Geoms();
    const base = [...CARD85_SEAMS.values()][0];
    const placement = { xMm: 0.6, yMm: -1.2, rotDeg: 0, flip: false };
    const surface: StoredSeam = {
      ...base,
      seamKey: '96-left-surface',
      sideA: [{ ...base.sideA[0], placement, layer: 'under' }],
      sideB: [{ ...base.sideB[0], placement, layer: 'over' }],
    };
    const pocketL = '01M5J6YX6FB4KP34F86QF2RW0H';
    const panelL = '01M5J6VRN9EFQ9ZQ4YHW8YVPG8';
    const pocketR = '01M5J6YX6FBMK7XMHGT3P8Q13T';
    const panelR = '01M5J6VRN98VASJPA4RAD58PED';
    const pose = poseRow({
      seamKey: '96-left-pose',
      piece: geoms.get(pocketL)!,
      host: geoms.get(panelL)!,
      placement: { xMm: 2.13, yMm: -1.27, rotDeg: 0, flip: false },
    });
    const ops: FormOpLike[] = [
      {
        operationNumber: 570,
        inputKeys: [panelL, pocketL],
        seamKeys: [surface.seamKey],
        poseKeys: [pose.seamKey],
      },
      { operationNumber: 610, inputKeys: [panelR, pocketR], seamKeys: [], poseKeys: [] },
    ];
    const plan = mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [surface],
      poses: [pose],
      geoms,
    });

    expect(plan.kind).toBe('create');
    expect(plan.upsert.map((row) => row.kind)).toEqual(['surface', 'pose']);
    expect(plan.upsert[0]).toMatchObject({
      sideA: [{ piece: pocketR, layer: 'under' }],
      sideB: [{ piece: panelR, layer: 'over' }],
    });
    expect(plan.upsert[0].sideA[0].placement).toEqual({
      xMm: -0.6,
      yMm: -1.2,
      rotDeg: 0,
      flip: false,
    });
    expect(poseOf(plan.upsert[1] as StoredPose)).toMatchObject({ piece: pocketR, host: panelR });
  });
});

describe('mirror replacement invariants', () => {
  const basePlan = () => {
    const geoms = card85Geoms();
    const rows = [...CARD85_SEAMS.values()];
    const plan = mirrorStepPlan({
      step: CARD85_OPS[card85Step(600)],
      cardOps: CARD85_OPS,
      rows,
      poses: [],
      geoms,
    });
    return { geoms, rows, plan };
  };

  it('is a fixed point and restores a missing linked right row', () => {
    const { geoms, rows, plan } = basePlan();
    const linkedOps = withKeys(CARD85_OPS, 600, plan.linkKeys);
    const stored = [...rows, ...(plan.upsert as StoredSeam[])];
    const fixed = mirrorStepPlan({
      step: linkedOps[card85Step(600)],
      cardOps: linkedOps,
      rows: stored,
      poses: [],
      geoms,
    });
    expect(fixed.kind).toBe('same');
    expect(fixed.upsert).toEqual([]);

    const missing = mirrorStepPlan({
      step: linkedOps[card85Step(600)],
      cardOps: linkedOps,
      rows,
      poses: [],
      geoms,
    });
    expect(['create', 'replace']).toContain(missing.kind);
    expect(missing.upsert).toHaveLength(1);
    expect(mirrorRowSig(missing.upsert[0])).toBe(mirrorRowSig(plan.upsert[0]));
  });

  it('replaces the whole set, deletes an extra, and only unlinks a shared extra', () => {
    const { geoms, rows, plan } = basePlan();
    const expected = plan.upsert[0] as StoredSeam;
    const extra = { ...expected, seamKey: 'extra', note: 'different' };
    const shared = { ...expected, seamKey: 'shared', note: 'shared' };
    let ops = withKeys(CARD85_OPS, 600, [expected.seamKey, extra.seamKey, shared.seamKey]);
    ops = [...ops, { operationNumber: 999, inputKeys: [], seamKeys: [shared.seamKey] }];
    const replacement = mirrorStepPlan({
      step: ops[card85Step(600)],
      cardOps: ops,
      rows: [...rows, expected, extra, shared],
      poses: [],
      geoms,
    });

    expect(replacement.kind).toBe('replace');
    expect(replacement.upsert).toHaveLength(1);
    expect(replacement.upsert[0].seamKey).toBe(expected.seamKey);
    expect(replacement.deleteKeys).toEqual(['extra']);
    expect(replacement.linkKeys).not.toContain('shared');
  });
});

describe('range and refusal rules', () => {
  const geoms = card63Geoms();
  const anchor = (piece: string, edge: number, range: [number, number]) =>
    anchorOfRunId([...geoms.values()], `${piece}#${edge}`, undefined, range)!;
  const ops: FormOpLike[] = [
    {
      operationNumber: 1,
      inputKeys: ['PCK_BACK_L', 'Back_Top_L_R', 'Back_Top_R_R'],
      seamKeys: ['range-row'],
    },
    {
      operationNumber: 2,
      inputKeys: ['PCK_BACK_R', 'Back_Top_RL', 'Back_Top_RR'],
      seamKeys: [],
    },
  ];

  const rangedRow = (kind: 'partial' | 'composite'): StoredSeam => ({
    seamKey: 'range-row',
    status: 'confirmed',
    kind,
    direction: 'reversed',
    source: 'manual',
    sideA: [anchor('PCK_BACK_L', 0, [0.2, 0.6])],
    sideB:
      kind === 'partial'
        ? [anchor('Back_Top_L_R', 0, [0.1, 0.5])]
        : [anchor('Back_Top_L_R', 0, [0.1, 0.5]), anchor('Back_Top_R_R', 0, [0.25, 0.75])],
    anchoredSize: 'M',
    note: '',
  });

  it('reverses 1:1 and per-part composite ranges and round-trips on the wire', () => {
    for (const kind of ['partial', 'composite'] as const) {
      const row = rangedRow(kind);
      const plan = mirrorStepPlan({
        step: ops[1],
        cardOps: ops,
        rows: [row],
        poses: [],
        geoms,
      });
      expect(plan.kind).toBe('create');
      const mirrored = plan.upsert[0] as StoredSeam;
      expect(mirrored.sideA[0].range).toEqual([0.4, 0.8]);
      expect(mirrored.sideB[0].range).toEqual([0.5, 0.9]);
      if (kind === 'composite') expect(mirrored.sideB[1].range).toEqual([0.25, 0.75]);
      const read = fromWire(toWire(mirrored));
      expect(read).not.toBeNull();
      expect(mirrorRowSig(read!)).toBe(mirrorRowSig(mirrored));
    }
  });

  it('re-projects an inner stretch onto the twin contour start and direction', () => {
    const sourceHost = geoms.get('PCK_BACK_L')!;
    const targetHost = geoms.get('PCK_BACK_R')!;
    const sourceLine: Pt2[] = [
      [50, 50],
      [110, 50],
      [110, 70],
      [50, 70],
      [50, 50],
    ];
    const mirror = twinT(sourceHost, targetHost, 'mirror');
    const mapped = sourceLine.slice(0, -1).map((point) => apply(mirror, point));
    const targetLine = [mapped[2], mapped[1], mapped[0], mapped[3], mapped[2]];
    const source = surfaceRow(
      {
        geom: sourceHost,
        k: 0,
        line: sourceLine.map(([x, y]) => [x, -y]),
        grainDeg: 0,
      },
      [anchor('Back_Top_L_R', 0, [0, 1])],
      undefined,
      'range-row',
    )!;
    source.sideA[0] = { ...source.sideA[0], range: [0.45, 0.55] };
    const plan = mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [source],
      poses: [],
      geoms,
      innerLines: new Map([
        ['PCK_BACK_L', [sourceLine]],
        ['PCK_BACK_R', [targetLine]],
      ]),
    });

    expect(plan.kind).toBe('create');
    const mirrored = plan.upsert[0] as StoredSeam;
    const targetLength = closedInner(targetLine)!.lenMm;
    const projected = mirrored.sideA.flatMap((item) =>
      innerSlice(targetLine, [item.range[0] * targetLength, item.range[1] * targetLength]),
    );
    const sourceLength = closedInner(sourceLine)!.lenMm;
    const sourceEnds = innerSlice(sourceLine, [0.45 * sourceLength, 0.55 * sourceLength]);
    const expected = [sourceEnds[0], sourceEnds.at(-1)!].map((point) => apply(mirror, point));

    expect(mirrored.sideA.every((item) => item.edgeHint === 'i0')).toBe(true);
    expect(mirrored.sideA).toHaveLength(2);
    expect(mirrored.sideA.map((item) => item.range)).toEqual([
      [0.95, 1],
      [0, 0.05],
    ]);
    for (const point of expected)
      expect(Math.min(...projected.map((candidate) => distance(point, candidate)))).toBeLessThan(
        0.5,
      );
  });

  it('merges a source wrap before projecting across the twin vertex 0', () => {
    const sourceHost = geoms.get('PCK_BACK_L')!;
    const targetHost = geoms.get('PCK_BACK_R')!;
    const sourceLine: Pt2[] = [
      [50, 50],
      [110, 50],
      [110, 70],
      [50, 70],
      [50, 50],
    ];
    const mirror = twinT(sourceHost, targetHost, 'mirror');
    const mapped = sourceLine.slice(0, -1).map((point) => apply(mirror, point));
    const vertex: Pt2 = [
      mapped[0][0] + (mapped[1][0] - mapped[0][0]) * (16 / 60),
      mapped[0][1] + (mapped[1][1] - mapped[0][1]) * (16 / 60),
    ];
    const targetLine = [vertex, mapped[1], mapped[2], mapped[3], mapped[0], vertex];
    const source = surfaceRow(
      {
        geom: sourceHost,
        k: 0,
        line: sourceLine.map(([x, y]) => [x, -y]),
        grainDeg: 0,
      },
      [anchor('Back_Top_L_R', 0, [0, 1])],
      undefined,
      'range-row',
    )!;
    const hostAnchor = source.sideA[0];
    source.sideA = [
      { ...hostAnchor, range: [0.9, 1] },
      { ...hostAnchor, range: [0, 0.1] },
      { ...hostAnchor, range: [0.1, 0.2] },
    ];

    const plan = mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [source],
      poses: [],
      geoms,
      innerLines: new Map([
        ['PCK_BACK_L', [sourceLine]],
        ['PCK_BACK_R', [targetLine]],
      ]),
    });

    expect(plan.kind).toBe('create');
    const mirrored = plan.upsert[0] as StoredSeam;
    expect(mirrored.sideA.map((item) => item.range)).toEqual([
      [0.8, 1],
      [0, 0.1],
    ]);
  });

  it('drops a mirrored inner range shorter than the millimetre threshold', () => {
    const sourceHost = geoms.get('PCK_BACK_L')!;
    const targetHost = geoms.get('PCK_BACK_R')!;
    const sourceLine: Pt2[] = [
      [50, 50],
      [110, 50],
      [110, 70],
      [50, 70],
      [50, 50],
    ];
    const mirror = twinT(sourceHost, targetHost, 'mirror');
    const mapped = sourceLine.slice(0, -1).map((point) => apply(mirror, point));
    const targetLine = [mapped[2], mapped[1], mapped[0], mapped[3], mapped[2]];
    const source = surfaceRow(
      {
        geom: sourceHost,
        k: 0,
        line: sourceLine.map(([x, y]) => [x, -y]),
        grainDeg: 0,
      },
      [anchor('Back_Top_L_R', 0, [0, 1])],
      undefined,
      'range-row',
    )!;
    source.sideA[0] = { ...source.sideA[0], range: [0.5, 0.5002] };

    expect(
      mirrorStepPlan({
        step: ops[1],
        cardOps: ops,
        rows: [source],
        poses: [],
        geoms,
        innerLines: new Map([
          ['PCK_BACK_L', [sourceLine]],
          ['PCK_BACK_R', [targetLine]],
        ]),
      }).kind,
    ).toBe('edge-mismatch');
  });

  it('links the existing geometrically mirrored fold in the same plan', () => {
    const sourcePiece = 'PCK_BACK_L';
    const targetPiece = 'PCK_BACK_R';
    const source: StoredFold = {
      foldKey: 'left-fold',
      pieceKey: sourcePiece,
      seq: 1,
      kind: 'inward',
      source: 'dxf',
      line: [
        [0.2, 0.25],
        [0.2, 0.75],
      ],
      flipAt: [0.3, 0.5],
      edge: null,
      contourSig: 'left',
      anchoredSize: 'M',
      note: '',
      stale: false,
    };
    const edgeMap = mirrorEdgeMapOf(geoms.get(sourcePiece)!, geoms.get(targetPiece)!);
    expect(edgeMap).not.toBeNull();
    const target: StoredFold = {
      ...source,
      foldKey: 'right-fold',
      pieceKey: targetPiece,
      line: inFrame(source.line, edgeMap!.frame) as StoredFold['line'],
      flipAt: inFrame([source.flipAt], edgeMap!.frame)[0],
      contourSig: 'right',
    };
    const foldOps = [
      { ...ops[0], foldKeys: [source.foldKey] },
      { ...ops[1], foldKeys: [] },
    ];
    const plan = mirrorStepPlan({
      step: foldOps[1],
      cardOps: foldOps,
      rows: [rangedRow('partial')],
      poses: [],
      folds: [source, target],
      geoms,
    });

    expect(plan.kind).toBe('create');
    expect(plan.foldKeys).toEqual([target.foldKey]);
    expect(plan.upsert).toHaveLength(1);

    const third = { ...ops[1], foldKeys: [target.foldKey] };
    expect(
      mirrorStepPlan({
        step: foldOps[1],
        cardOps: [...foldOps, third],
        rows: [rangedRow('partial')],
        poses: [],
        folds: [source, target],
        geoms,
      }),
    ).toMatchObject({ kind: 'edge-mismatch', upsert: [], foldKeys: [] });

    const earlier: StoredFold = { ...target, foldKey: 'right-later', seq: 2 };
    const orderOps = [{ ...foldOps[0], foldKeys: [source.foldKey, earlier.foldKey] }, foldOps[1]];
    expect(
      mirrorStepPlan({
        step: orderOps[1],
        cardOps: orderOps,
        rows: [rangedRow('partial')],
        poses: [],
        folds: [
          source,
          target,
          {
            ...earlier,
            line: [
              [0.9, 0.9],
              [0.8, 0.8],
            ],
          },
        ],
        geoms,
      }),
    ).toMatchObject({ kind: 'edge-mismatch', upsert: [], foldKeys: [] });
  });

  it('refuses the whole mirror when the right fold is missing or geometrically different', () => {
    const source: StoredFold = {
      foldKey: 'left-fold',
      pieceKey: 'PCK_BACK_L',
      seq: 1,
      kind: 'inward',
      source: 'dxf',
      line: [
        [0.2, 0.25],
        [0.2, 0.75],
      ],
      flipAt: [0.3, 0.5],
      edge: null,
      contourSig: 'left',
      anchoredSize: 'M',
      note: '',
      stale: false,
    };
    const foldOps = [
      { ...ops[0], foldKeys: [source.foldKey] },
      { ...ops[1], foldKeys: [] },
    ];
    const planOf = (folds: StoredFold[]) =>
      mirrorStepPlan({
        step: foldOps[1],
        cardOps: foldOps,
        rows: [rangedRow('partial')],
        poses: [],
        folds,
        geoms,
      });

    expect(planOf([source])).toMatchObject({
      kind: 'edge-mismatch',
      upsert: [],
      foldKeys: [],
    });
    expect(
      planOf([
        source,
        {
          ...source,
          foldKey: 'right-fold',
          pieceKey: 'PCK_BACK_R',
          line: [
            [0.7, 0.25],
            [0.7, 0.75],
          ],
        },
      ]),
    ).toMatchObject({ kind: 'edge-mismatch', upsert: [], foldKeys: [] });
  });

  it('says nothing about a twin on a step that holds a left piece', () => {
    const hands = new Map(
      [...geoms].map(([key, geom]) => [
        key,
        { ...geom, hand: key.endsWith('_L') ? ('L' as const) : ('R' as const) },
      ]),
    );
    expect(isRightMirrorStep(ops[0], ops, hands)).toBe(false);
    const rightOnly = { ...ops[1], inputKeys: ['PCK_BACK_R'] };
    expect(isRightMirrorStep(rightOnly, [ops[0], rightOnly], hands)).toBe(true);
  });

  it('returns no-twin without rows and edge-mismatch for an unreliable twin map', () => {
    const noTwin = mirrorStepPlan({
      step: ops[1],
      cardOps: [ops[1]],
      rows: [],
      poses: [],
      geoms,
    });
    expect(noTwin).toMatchObject({ kind: 'no-twin', upsert: [], deleteKeys: [], linkKeys: [] });

    const broken = new Map(geoms);
    const target = geoms.get('PCK_BACK_R')!;
    broken.set('PCK_BACK_R', { ...target, edges: target.edges.slice(1) });
    const mismatch = mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [rangedRow('partial')],
      poses: [],
      geoms: broken,
    });
    expect(mismatch).toMatchObject({
      kind: 'edge-mismatch',
      upsert: [],
      deleteKeys: [],
      linkKeys: [],
    });
  });
});

describe('mirrorStepPlan carries the layer order', () => {
  const geoms = card85Geoms();
  const rows = [...CARD85_SEAMS.values()];
  const plan = (ops: readonly FormOpLike[], target: FormOpLike) =>
    mirrorStepPlan({ step: target, cardOps: ops, rows, poses: [], geoms });

  it('no order on the source: none on the target', () => {
    const target = card85Step(600);
    expect(plan(CARD85_OPS, CARD85_OPS[target]).layerOrder).toEqual([]);
  });

  it('names the same blocks of the mirrored step, in the same order', () => {
    const source = card85Step(560);
    const target = card85Step(600);
    const keys = inputGroups(CARD85_OPS, source, new Set(geoms.keys())).map((one) => one.key);
    expect(keys.length).toBeGreaterThan(1);
    const order = [...keys].reverse();
    const ops = CARD85_OPS.map((op, at) => (at === source ? { ...op, layerOrder: order } : op));
    const mapped = plan(ops, ops[target]).layerOrder;
    expect(mapped).toHaveLength(order.length);
    const groups = inputGroups(ops, target, new Set(geoms.keys()));
    const sources = inputGroups(ops, source, new Set(geoms.keys()));
    order.forEach((key, at) => {
      const piece = sources.find((one) => one.key === key)!.pieces[0];
      const pieces = groups.find((one) => one.key === mapped[at])!.pieces;
      expect(geoms.get(piece)!.twinOf.some((link) => pieces.includes(link.key))).toBe(true);
    });
  });
});

describe('mirror write boundary', () => {
  const step = { historyKey: 'h600' };
  const okRes = (keyMap: [string, string][] = []): SeamChangeResult => ({
    ok: true,
    keyMap: new Map(keyMap),
    deletedKeys: [],
    lockVersion: 8,
  });

  it('writes rows, links and detaches in ONE change, then the folds and the autosave', async () => {
    const row = [...CARD85_SEAMS.values()][0];
    const put = { ...row, seamKey: 'put' };
    const calls: string[] = [];
    const sent: { change: SeamChange; gone: readonly string[] }[] = [];
    let linked: readonly StoredRow[] = [];
    const result = await executeMirrorStep(
      {
        kind: 'replace',
        upsert: [put],
        deleteKeys: ['drop'],
        linkKeys: ['put'],
        foldKeys: ['right-fold'],
        layerOrder: [],
      },
      {
        step,
        stepKeys: () => ['drop', 'shared'],
        canonicalize: (rows) => [...rows],
        change: async (change, gone) => {
          calls.push('change');
          sent.push({ change: change(), gone });
          return okRes([['put', 'stored']]);
        },
        link: (rows, foldKeys) => {
          linked = rows;
          calls.push(`link:${foldKeys.join()}`);
        },
        requestAutosave: () => calls.push('autosave'),
      },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['change', 'link:right-fold', 'autosave']);
    expect(sent).toHaveLength(1);
    expect(sent[0].change.upsert?.map((r) => r.seamKey)).toEqual(['put']);
    expect(sent[0].change.link).toEqual([{ step, seamKey: 'put' }]);
    // A shared key is only detached: the server keeps a row another step still links.
    expect(sent[0].change.detach).toEqual([
      { step, seamKey: 'drop' },
      { step, seamKey: 'shared' },
    ]);
    expect(sent[0].gone).toEqual(['drop']);
    // The form takes the key the server stored the row under.
    expect(linked.map((r) => r.seamKey)).toEqual(['stored']);
  });

  it('never detaches the key a new row lands on (no contradicts_link / contradicts_upsert)', async () => {
    const row = [...CARD85_SEAMS.values()][0];
    const put = { ...row, seamKey: 'fresh' };
    let change: SeamChange | undefined;
    const result = await executeMirrorStep(
      {
        kind: 'replace',
        upsert: [put],
        deleteKeys: ['old'],
        linkKeys: ['fresh'],
        foldKeys: [],
        layerOrder: [],
      },
      {
        step,
        stepKeys: () => ['old'],
        // The pair is stored under 'old' already: the row is written there.
        canonicalize: (rows) => rows.map((r) => ({ ...r, seamKey: 'old' })),
        change: async (c, gone) => {
          change = c();
          expect(gone).toEqual([]);
          return okRes();
        },
        link: () => undefined,
        requestAutosave: () => undefined,
      },
    );
    expect(result).toEqual({ ok: true });
    expect(change?.upsert?.map((r) => r.seamKey)).toEqual(['old']);
    expect(change?.link).toEqual([{ step, seamKey: 'old' }]);
    expect(change?.detach).toEqual([]);
  });

  it('builds the detaches from the links as they are when the change goes out', async () => {
    const row = [...CARD85_SEAMS.values()][0];
    const put = { ...row, seamKey: 'put' };
    let links = ['old'];
    let built: SeamChange | undefined;
    const result = await executeMirrorStep(
      {
        kind: 'replace',
        upsert: [put],
        deleteKeys: ['old'],
        linkKeys: ['put'],
        foldKeys: [],
        layerOrder: [],
      },
      {
        step,
        stepKeys: () => links,
        canonicalize: (rows) => [...rows],
        change: async (build) => {
          // A gesture before this one (or a re-read) linked B while MIRROR waited its turn.
          links = ['old', 'B'];
          built = build();
          return okRes();
        },
        link: () => undefined,
        requestAutosave: () => undefined,
      },
    );
    expect(result).toEqual({ ok: true });
    expect(built?.detach).toEqual([
      { step, seamKey: 'old' },
      { step, seamKey: 'B' },
    ]);
  });

  it('changes no visible state when the transaction fails', async () => {
    const row = [...CARD85_SEAMS.values()][0];
    const link = vi.fn();
    const autosave = vi.fn();
    const result = await executeMirrorStep(
      {
        kind: 'create',
        upsert: [row],
        deleteKeys: [],
        linkKeys: [row.seamKey],
        foldKeys: [],
        layerOrder: [],
      },
      {
        step,
        stepKeys: () => [],
        canonicalize: (rows) => [...rows],
        change: async () => ({ ok: false, why: 'refused' }),
        link,
        requestAutosave: autosave,
      },
    );
    expect(result).toEqual({ ok: false, error: 'refused' });
    expect(link).not.toHaveBeenCalled();
    expect(autosave).not.toHaveBeenCalled();
  });

  it('a failed change stores nothing, and the retry plans the same rows', async () => {
    const geoms = card85Geoms();
    const sourceRows = [...CARD85_SEAMS.values()];
    const at = card85Step(600);
    const first = mirrorStepPlan({
      step: CARD85_OPS[at],
      cardOps: CARD85_OPS,
      rows: sourceRows,
      poses: [],
      geoms,
    });
    const firstResult = await executeMirrorStep(first, {
      step,
      stepKeys: () => [],
      canonicalize: (rows) => [...rows],
      change: async () => ({ ok: false, why: 'lock_version_moved' }),
      link: vi.fn(),
      requestAutosave: vi.fn(),
    });
    expect(firstResult).toEqual({ ok: false, error: 'lock_version_moved' });

    const retry = mirrorStepPlan({
      step: CARD85_OPS[at],
      cardOps: CARD85_OPS,
      rows: sourceRows,
      poses: [],
      geoms,
    });
    expect(retry.kind).toBe(first.kind);
    expect(retry.upsert.map(mirrorRowSig)).toEqual(first.upsert.map(mirrorRowSig));
  });
});
