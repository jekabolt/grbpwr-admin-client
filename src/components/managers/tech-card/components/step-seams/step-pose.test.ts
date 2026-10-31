// P8 — a piece placed by hand in a step (a pose row): the wire, the loader split, the stepLayout pin,
// the views' hands and the card 6 op 720 placket.

import { beforeEach, describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply, compose } from 'lib/assembly-skeleton/union/affine';
import {
  fromWire,
  newSeamKey,
  poseKeysOfWire,
  poseOf,
  poseRow,
  splitWire,
  toWire,
  type SeamPlacement,
  type StoredPose,
} from 'lib/seams';

import {
  hydrateSeams,
  posesOf,
  resetSeams,
  rowsOf,
  useSeamsStore,
} from '../assembly-seams/seams-store';
import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
  card6Step,
} from './card6.fixture';
import { stepHandsOf } from './step-hand';
import { invert, stepLayout } from './step-picture';
import { stepPictureOfOp, type SceneOp } from './step-picture-view';
import {
  placementOf,
  placementT,
  poseGroup,
  poseHostOf,
  posePinsOf,
  pinPoses,
  snapPose,
  turnAbout,
} from './step-pose';
import { dropKeys } from './step-seams-model';

const square = (key: string, x: number, y: number, w: number, h: number): PieceGeom =>
  ({
    pieceKey: key,
    name: key,
    hand: null,
    cloth: null,
    corners: [0, 1, 2, 3],
    edges: [],
    rect: true,
    twinOf: [],
    rs: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    notchIdx: [],
    perimMm: 2 * (w + h),
    areaMm2: w * h,
  }) as PieceGeom;

const near = (a: Affine, b: Affine, eps = 1e-6) =>
  a.every((v, i) => Math.abs(v - b[i]) < (i >= 4 ? Math.max(eps, 1e-4) : eps));

const relOf = (T: ReadonlyMap<string, Affine>, piece: string, host: string) =>
  compose(invert(T.get(host)!), T.get(piece)!);

const AT: SeamPlacement = { xMm: 61.25, yMm: 140.5, rotDeg: 90, flip: true };

describe('pose row: the wire and the server rules', () => {
  const host = square('HOST', 0, 0, 400, 600);
  const piece = square('PART', 900, 50, 80, 300);
  const row = poseRow({ seamKey: newSeamKey(), piece, host, placement: AT });

  it('a pose row is confirmed, manual, one anchor per side, the placement on side A', () => {
    expect(row).toMatchObject({
      status: 'confirmed',
      kind: 'pose',
      source: 'manual',
      direction: 'unknown',
    });
    expect(row.seamKey).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.sideA).toHaveLength(1);
    expect(row.sideB).toHaveLength(1);
    expect(row.sideA[0].placement).toEqual(AT);
    expect(row.sideB[0].placement).toBeUndefined();
    for (const a of [...row.sideA, ...row.sideB]) {
      // entity/tech_card_seam.go: exactly 5 samples, u / v in [0, 1], share in (0, 1], len > 0.
      expect(a.samples).toHaveLength(5);
      for (const [u, v] of a.samples) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(a.perimShare).toBeGreaterThan(0);
      expect(a.perimShare).toBeLessThanOrEqual(1);
      expect(a.lenMm).toBeGreaterThan(0);
      expect([...a.edgeHint].length).toBeLessThanOrEqual(64);
    }
    expect(poseOf(row)).toEqual({ piece: 'PART', host: 'HOST', placement: AT });
  });

  it('round-trips through the wire and lands in poses, never in seams', () => {
    const wire = toWire(row);
    expect(wire.kind).toBe('TECH_CARD_SEAM_KIND_POSE');
    expect(wire.sideA?.parts?.[0].placement).toEqual(AT);
    expect(fromWire(wire)).toBeNull();
    const seam = toWire([...CARD6_SEAMS.values()][0]);
    const split = splitWire([seam, wire]);
    expect(split.unreadable).toBe(0);
    expect(split.seams.map((s) => s.seamKey)).toEqual([seam.seamKey]);
    expect(split.poses).toHaveLength(1);
    expect(toWire(split.poses[0])).toEqual(wire);
    expect(poseOf(split.poses[0])).toEqual(poseOf(row));
    expect([...poseKeysOfWire([seam, wire])]).toEqual([row.seamKey]);
  });

  it('a stale pose is still a pose; a malformed one is unreadable, not a seam', () => {
    const stale = splitWire([{ ...toWire(row), stale: true }]);
    expect(stale.poses).toHaveLength(1);
    expect(stale.poses[0].stale).toBe(true);
    const bare = toWire(row);
    const noPlacement = {
      ...bare,
      sideA: { parts: bare.sideA!.parts!.map((a) => ({ ...a, placement: undefined })) },
    };
    expect(splitWire([noPlacement])).toEqual({ seams: [], poses: [], unreadable: 1 });
  });
});

describe('the loader split: the seams store', () => {
  beforeEach(() => resetSeams());
  it('hydrates poses beside the seams; rowsOf never sees them', () => {
    const row = poseRow({
      seamKey: newSeamKey(),
      piece: square('PART', 0, 0, 10, 10),
      host: square('HOST', 0, 0, 50, 50),
      placement: AT,
    });
    const seams = [...CARD6_SEAMS.values()].slice(0, 3);
    hydrateSeams(6, [...seams.map(toWire), toWire(row)]);
    const s = useSeamsStore.getState();
    expect(s.unreadable).toBe(0);
    expect(rowsOf(s).map((r) => r.seamKey)).toEqual(seams.map((r) => r.seamKey));
    expect(posesOf(s).map((r) => r.seamKey)).toEqual([row.seamKey]);
    expect(rowsOf(s).some((r) => (r.kind as string) === 'pose')).toBe(false);
  });

  it('a step that loses a pose row drops its key from poseKeys, not seamKeys', () => {
    const ops = [{ seamKeys: ['s1'], poseKeys: ['p1', 'p2'] }, { seamKeys: ['s2'] }];
    const next = dropKeys(ops, new Set(['p1']));
    expect(next?.[0]).toEqual({ seamKeys: ['s1'], poseKeys: ['p2'] });
    expect(next?.[1]).toBe(ops[1]);
  });
});

describe('placement: the surface encoding both ways', () => {
  const host = square('HOST', -120, 30, 400, 600);
  const part = square('PART', 700, -80, 90, 260);
  it.each([0, 90, 180, 270, 33.5])('reads back %s° (face up and down)', (rotDeg) => {
    for (const flip of [false, true]) {
      const at = { xMm: 12.34, yMm: -56.78, rotDeg, flip };
      expect(placementOf(host, part, placementT(host, part, at))).toEqual(at);
    }
  });
});

describe('stepLayout: a pose is pinned last', () => {
  const geoms = new Map(
    [square('A', 0, 0, 300, 400), square('B', 0, 0, 300, 400), square('P', 0, 0, 60, 200)].map(
      (g) => [g.pieceKey, g],
    ),
  );
  const leaves = [['A'], ['B'], ['P']];
  const at: SeamPlacement = { xMm: 20, yMm: 50, rotDeg: 270, flip: false };

  it('no pose: the layout is the very one laid without the option', () => {
    const plain = stepLayout(leaves, [], geoms, { explode: 0.1 });
    const empty = stepLayout(leaves, [], geoms, { explode: 0.1, pose: new Map() });
    expect([...empty.T]).toEqual([...plain.T]);
    expect(empty.bbox).toEqual(plain.bbox);
    expect(empty.posed).toBeUndefined();
  });

  it('the posed piece keeps its place on its host whatever the explode', () => {
    const pose = new Map([['P', { host: 'B', placement: at }]]);
    const want = placementT(geoms.get('B')!, geoms.get('P')!, at);
    for (const explode of [0, 0.08, 0.3]) {
      const laid = stepLayout(leaves, [], geoms, { explode, pose });
      expect(laid.posed).toEqual(['P']);
      expect(near(relOf(laid.T, 'P', 'B'), want)).toBe(true);
      // The bbox holds the posed piece where it now is.
      const ring = geoms.get('P')!.rs.map((p) => apply(laid.T.get('P')!, p));
      for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(laid.bbox.x0 - 1e-6);
        expect(y).toBeLessThanOrEqual(laid.bbox.y1 + 1e-6);
      }
    }
  });

  it('a pose on a piece not drawn, or on itself, changes nothing', () => {
    const plain = stepLayout(leaves, [], geoms, { explode: 0.1 });
    const ghost = stepLayout(leaves, [], geoms, {
      explode: 0.1,
      pose: new Map([
        ['NOPE', { host: 'A', placement: at }],
        ['A', { host: 'A', placement: at }],
      ]),
    });
    expect([...ghost.T]).toEqual([...plain.T]);
  });

  it('pinPoses: the hung pieces go along; a host hanging on the piece stays', () => {
    const T = new Map<string, Affine>([
      ['A', [1, 0, 0, 1, 0, 0]],
      ['B', [1, 0, 0, 1, 1000, 0]],
      ['P', [1, 0, 0, 1, 2000, 0]],
      ['Q', [1, 0, 0, 1, 2100, 0]],
    ]);
    const g = new Map([...geoms, ['Q', square('Q', 0, 0, 30, 30)]]);
    const Q0 = relOf(T, 'Q', 'P');
    const r = pinPoses(T, new Map([['P', { host: 'A', placement: at }]]), g, [['Q', 'P']]);
    expect(r).toEqual({ pinned: ['P'], moved: true });
    expect(near(relOf(T, 'P', 'A'), placementT(g.get('A')!, g.get('P')!, at))).toBe(true);
    expect(near(relOf(T, 'Q', 'P'), Q0)).toBe(true);
    expect(poseGroup('P', 'A', [['Q', 'P']])).toEqual(['P', 'Q']);
    expect(poseGroup('P', 'Q', [['Q', 'P']])).toEqual(['P']);
    // Pinned again: nothing moves.
    expect(pinPoses(T, new Map([['P', { host: 'A', placement: at }]]), g, [['Q', 'P']]).moved).toBe(
      false,
    );
  });

  it('a pose on a posed host follows it', () => {
    const T = new Map<string, Affine>([
      ['A', [1, 0, 0, 1, 0, 0]],
      ['B', [1, 0, 0, 1, 1000, 0]],
      ['P', [1, 0, 0, 1, 2000, 0]],
    ]);
    const atB: SeamPlacement = { xMm: 400, yMm: 0, rotDeg: 0, flip: false };
    // P on B listed first, B on A second: the second pass lays P on B where B now is.
    pinPoses(
      T,
      new Map([
        ['P', { host: 'B', placement: at }],
        ['B', { host: 'A', placement: atB }],
      ]),
      geoms,
      [],
    );
    expect(near(relOf(T, 'B', 'A'), placementT(geoms.get('A')!, geoms.get('B')!, atB))).toBe(true);
    expect(near(relOf(T, 'P', 'B'), placementT(geoms.get('B')!, geoms.get('P')!, at))).toBe(true);
  });
});

describe('picker helpers', () => {
  it('snaps a vertex onto a vertex first, else onto the outline', () => {
    const ring: Pt2[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const v = snapPose([[103, 4]], [{ piece: 'H', ring }], 8);
    expect(v).toMatchObject({ host: 'H', at: [100, 0] });
    expect(v!.dx).toBeCloseTo(-3);
    const e = snapPose([[104, 50]], [{ piece: 'H', ring }], 8);
    expect(e).toMatchObject({ host: 'H', at: [100, 50], dx: -4, dy: 0 });
    expect(snapPose([[120, 50]], [{ piece: 'H', ring }], 8)).toBeNull();
  });

  it('the block root: the biggest piece of the cluster root, not the piece nor its group', () => {
    const g = new Map(
      [
        square('PLCK', 0, 0, 50, 700),
        square('FRONT', 0, 0, 400, 700),
        square('YOKE', 0, 0, 400, 200),
      ].map((p) => [p.pieceKey, p]),
    );
    const layout = {
      T: new Map<string, Affine>([...g.keys()].map((k) => [k, [1, 0, 0, 1, 0, 0]])),
      input: new Map([
        ['PLCK', 0],
        ['FRONT', 1],
        ['YOKE', 1],
      ]),
      clusters: [[1, 0]],
    };
    expect(poseHostOf('PLCK', ['PLCK'], layout, g)).toBe('FRONT');
    expect(poseHostOf('FRONT', ['FRONT'], layout, g)).toBe('YOKE');
    expect(poseHostOf('PLCK', ['PLCK', 'FRONT', 'YOKE'], layout, g)).toBeNull();
  });

  it('turns a quarter about the box centre, and flips', () => {
    const ring: Pt2[] = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ];
    expect(apply(turnAbout(ring, 1), [10, 5])).toEqual([10, 5]);
    expect(apply(turnAbout(ring, 1), [20, 5]).map((v) => Math.round(v))).toEqual([10, 15]);
    expect(apply(turnAbout(ring, -1), [20, 5]).map((v) => Math.round(v))).toEqual([10, -5]);
    expect(apply(turnAbout(ring, 0), [0, 0])).toEqual([20, 0]);
  });
});

describe('the views receive the poses (stepHandsOf)', () => {
  const host = square('HOST', 0, 0, 100, 100);
  const part = square('PART', 0, 0, 10, 10);
  const early = poseRow({ seamKey: 'K1', piece: part, host, placement: AT });
  const late = poseRow({
    seamKey: 'K2',
    piece: part,
    host,
    placement: { ...AT, xMm: 5 },
  });
  const rows = new Map<string, StoredPose>([
    ['K1', early],
    ['K2', late],
  ]);
  const ops = [{ poseKeys: ['K1'] }, { seamKeys: [] }, { poseKeys: ['K2'] }];

  it('no poses: no `pose` key at all (the layouts stay as they were)', () => {
    expect('pose' in stepHandsOf(ops, 2, new Map())).toBe(false);
    expect('pose' in stepHandsOf(ops, 2, new Map(), new Map())).toBe(false);
  });

  it('a step inherits the earlier poses; a later step’s pose of a piece wins', () => {
    expect(stepHandsOf(ops, 0, new Map(), rows).pose?.get('PART')?.placement).toEqual(AT);
    expect(stepHandsOf(ops, 1, new Map(), rows).pose?.get('PART')?.placement).toEqual(AT);
    expect(stepHandsOf(ops, 2, new Map(), rows).pose?.get('PART')).toEqual({
      host: 'HOST',
      placement: { ...AT, xMm: 5 },
      seamKey: 'K2',
    });
    expect(posePinsOf(ops, undefined).size).toBe(0);
  });
});

describe('card 6 op 720: the placket placed by hand at a free spot', () => {
  const geoms = card6Geoms();
  const innerLines = card6InnerLines();
  const placement: SeamPlacement = { xMm: -180, yMm: 35.5, rotDeg: 90, flip: false };
  const row = poseRow({
    seamKey: newSeamKey(),
    piece: geoms.get('PLCK_L')!,
    host: geoms.get('P_L_MAIN')!,
    placement,
  });
  const poses = new Map([[row.seamKey, row]]);
  const card6Ops = CARD6_OPS as SceneOp[];
  const ops: SceneOp[] = card6Ops.map((op) =>
    op.operationNumber === 720 ? { ...op, poseKeys: [row.seamKey] } : op,
  );
  const sceneAt = (operationNumber: number, withPoses = true, operations = ops) => {
    const index = card6Step(operationNumber);
    return stepPictureOfOp(operations[index], null, geoms, {
      operations,
      index,
      pieceKeys: CARD6_PIECE_KEYS,
      innerLines,
      byKey: CARD6_SEAMS,
      ...(withPoses ? { poses } : {}),
    });
  };
  const want = placementT(geoms.get('P_L_MAIN')!, geoms.get('PLCK_L')!, placement);

  it('the step tile, the RESULT and the next step lay it where the row says', () => {
    // Without the row the step's seams lay the placket elsewhere: the pose wins over them.
    const seamsOnly = sceneAt(720, false);
    expect(seamsOnly.frameSeams.length).toBeGreaterThan(0);
    expect(near(relOf(seamsOnly.layout.T, 'PLCK_L', 'P_L_MAIN'), want)).toBe(false);

    const tile = sceneAt(720);
    expect(tile.frameSeams).toEqual(seamsOnly.frameSeams);
    expect(tile.hands.pose?.get('PLCK_L')).toMatchObject({ host: 'P_L_MAIN', placement });
    expect(tile.layout.posed).toEqual(['PLCK_L']);
    expect(near(relOf(tile.layout.T, 'PLCK_L', 'P_L_MAIN'), want)).toBe(true);

    const joined = stepLayout(tile.layoutLeaves, tile.frameSeams, geoms, {
      explode: 0,
      ...tile.hands,
    });
    expect(near(relOf(joined.T, 'PLCK_L', 'P_L_MAIN'), want)).toBe(true);

    // The left front with its placket is an input of op 970 (the base): the pose comes along. Its
    // tile is focused on the side seams (no placket drawn, nothing pinned); the whole base is laid
    // with the placket where the row says.
    const base = sceneAt(970);
    expect(base.hands.pose?.has('PLCK_L')).toBe(true);
    expect(base.layout.T.has('PLCK_L')).toBe(false);
    expect(base.layout.posed).toBeUndefined();
    const whole = stepLayout(base.leaves, base.frameSeams, geoms, { explode: 0, ...base.hands });
    expect(whole.posed).toEqual(['PLCK_L']);
    expect(near(relOf(whole.T, 'PLCK_L', 'P_L_MAIN'), want)).toBe(true);
  });

  it('an earlier step does not see it; no pose rows → the very layout as before', () => {
    expect(sceneAt(660).hands.pose).toBeUndefined();
    const before = sceneAt(720, false, card6Ops);
    const none = sceneAt(720, false);
    expect([...none.layout.T]).toEqual([...before.layout.T]);
    expect(none.layout.bbox).toEqual(before.layout.bbox);
    expect(none.layout.posed).toBeUndefined();
    // The pose moves the placket only: the front stays where the seams lay it.
    const posed = sceneAt(720);
    for (const key of ['P_L_MAIN', 'P_L_U', 'PCK_L_MAIN', 'PCK_L_BTTM'])
      if (before.layout.T.has(key))
        expect(near(posed.layout.T.get(key)!, before.layout.T.get(key)!)).toBe(true);
  });
});
