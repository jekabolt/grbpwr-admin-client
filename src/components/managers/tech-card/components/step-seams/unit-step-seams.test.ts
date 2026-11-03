import { describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { compose } from 'lib/assembly-skeleton/union/affine';
import { toWire, type StoredSeam } from 'lib/seams';

import {
  CARD85_OPS,
  CARD85_PIECE_KEYS,
  CARD85_PIECE_NAME_BY_KEY,
  CARD85_SEAMS,
  card85Geoms,
  card85Step,
  card85WithStoredShoulder,
} from './card85.fixture';
import { CARD6_OPS, CARD6_PIECE_KEYS, CARD6_SEAMS, card6Geoms, card6Step } from './card6.fixture';
import { seamEdgeWord } from './seam-focus';
import { fitBox, invert } from './step-picture';
import {
  isUnitStep,
  nearestPictureTarget,
  pictureBounds,
  picturePickTargets,
  stepPictureOfOp,
  type SceneOp,
} from './step-picture-view';
import { OWNER_FIT, stepResults } from './step-result';
import { edgeRowFromPick, initialPickerPick } from './step-rows';
import {
  fullyUsedEdges,
  pieceOfTarget,
  suggestStepPairs,
  usedEdgesBeforeStep,
  type FormOpLike,
} from './step-seams-model';
import { stepPictureOf } from './surface-picture';

const innerLines = new Map<string, Pt2[][]>();

describe('card 85 op 970 unit seam preview', () => {
  const geoms = card85Geoms();
  const index = card85Step(970);
  const operations: SceneOp[] = CARD85_OPS.map((operation) => ({
    ...operation,
    fullnessRatio: operation.fullnessRatio == null ? undefined : String(operation.fullnessRatio),
  }));
  const scene = stepPictureOfOp(operations[index], null, geoms, {
    operations,
    index,
    pieceKeys: CARD85_PIECE_KEYS,
    innerLines,
    byKey: CARD85_SEAMS,
    nameOf: (piece) => CARD85_PIECE_NAME_BY_KEY.get(piece) ?? piece,
    ready: true,
    skipLayout: true,
  });

  const results = stepResults(
    {
      ops: CARD85_OPS,
      byKey: CARD85_SEAMS,
      poses: new Map(),
      geoms,
      innerLines,
      pieceKeys: CARD85_PIECE_KEYS,
    },
    OWNER_FIT,
  );

  it('draws both shoulder proposals on the step result', () => {
    expect(isUnitStep(scene.groups)).toBe(true);
    expect(scene.suggestions).toHaveLength(2);
    const picture = stepPictureOf(results, index)!;
    for (const sides of scene.suggestions)
      for (const piece of [...sides.a, ...sides.b].map(pieceOfTarget))
        expect(picture.layout.T.has(piece)).toBe(true);
    const bounds = pictureBounds(picture.layout, geoms, 'tile');
    expect(bounds.x1 - bounds.x0).toBeGreaterThan(0);
    expect(bounds.y1 - bounds.y0).toBeGreaterThan(0);
  });

  it('keeps the carried block as its producer laid it', () => {
    const [block] = results[index].blocks;
    const producer = results.findLastIndex(
      (result, at) => at < index && (CARD85_OPS[at].outputUnitKey ?? '').trim() === block.inputKey,
    );
    expect(producer).toBeGreaterThanOrEqual(0);
    const relative = (T: ReadonlyMap<string, Affine>, piece: string) =>
      compose(invert(T.get(block.pieces[0])!), T.get(piece)!);
    for (const piece of block.pieces) {
      const now = relative(results[index].layout.T, piece);
      const was = relative(results[producer].layout.T, piece);
      expect(Math.hypot(now[4] - was[4], now[5] - was[5])).toBeLessThan(0.5);
    }
  });

  it('hits the right back shoulder on the shared picture', () => {
    const right = scene.suggestions.find((proposal) => proposal.hand === 'R');
    expect(right).toBeDefined();
    const shoulder = right!.a.find((id) => seamEdgeWord([id], geoms) === 'shoulder');
    expect(shoulder).toBeDefined();
    const picture = stepPictureOf(results, index)!;
    const bounds = pictureBounds(picture.layout, geoms, 'canvas');
    const targets = picturePickTargets(
      picture.layout,
      geoms,
      innerLines,
      fitBox(bounds, 960, 720, 64),
      { keys: picture.layers, projectHidden: false },
    );
    const shoulderTarget = targets.find((target) => target.id === shoulder);
    expect(shoulderTarget).toBeDefined();
    const point = shoulderTarget!.points[Math.floor(shoulderTarget!.points.length / 2)];
    expect(pieceOfTarget(nearestPictureTarget(point, targets)!.id)).toBe(pieceOfTarget(shoulder!));
  });

  it('keeps the right shoulder proposed after the left shoulder is stored', () => {
    const left = scene.suggestions.find((proposal) => proposal.hand === 'L');
    const right = scene.suggestions.find((proposal) => proposal.hand === 'R');
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    const row = edgeRowFromPick(left!, geoms, {
      pieces: [...geoms.values()],
      grainDeg: null,
      nameOf: (piece) => CARD85_PIECE_NAME_BY_KEY.get(piece) ?? piece,
    });
    expect(row).not.toBeNull();

    const variant = card85WithStoredShoulder(row!);
    const storedOperations: SceneOp[] = variant.operations.map((operation) => ({
      ...operation,
      fullnessRatio: operation.fullnessRatio == null ? undefined : String(operation.fullnessRatio),
    }));
    const storedScene = stepPictureOfOp(storedOperations[index], null, geoms, {
      operations: storedOperations,
      index,
      pieceKeys: CARD85_PIECE_KEYS,
      innerLines,
      byKey: variant.seams,
      nameOf: (piece) => CARD85_PIECE_NAME_BY_KEY.get(piece) ?? piece,
      ready: true,
      skipLayout: true,
    });
    expect(storedScene.stored).toHaveLength(1);
    expect(storedScene.suggestions).toHaveLength(1);
    expect(storedScene.suggestions[0]?.hand).toBe('R');
    expect([...storedScene.suggestion!.a, ...storedScene.suggestion!.b].sort()).toEqual(
      [...right!.a, ...right!.b].sort(),
    );
  });

  it('offers nothing outside the zone once both shoulders are stored', () => {
    const rowOf = (hand: 'L' | 'R') =>
      edgeRowFromPick(scene.suggestions.find((proposal) => proposal.hand === hand)!, geoms, {
        pieces: [...geoms.values()],
        grainDeg: null,
        nameOf: (piece) => CARD85_PIECE_NAME_BY_KEY.get(piece) ?? piece,
      })!;
    const left = card85WithStoredShoulder(rowOf('L'));
    const right = rowOf('R');
    const both = {
      operations: left.operations.map((operation, operationIndex) =>
        operationIndex === index
          ? { ...operation, seamKeys: [...(operation.seamKeys ?? []), right.seamKey] }
          : operation,
      ),
      seams: new Map([...left.seams, [right.seamKey, right]]),
    };
    const storedOperations: SceneOp[] = both.operations.map((operation) => ({
      ...operation,
      fullnessRatio: operation.fullnessRatio == null ? undefined : String(operation.fullnessRatio),
    }));
    const storedScene = stepPictureOfOp(storedOperations[index], null, geoms, {
      operations: storedOperations,
      index,
      pieceKeys: CARD85_PIECE_KEYS,
      innerLines,
      byKey: both.seams,
      nameOf: (piece) => CARD85_PIECE_NAME_BY_KEY.get(piece) ?? piece,
      ready: true,
      skipLayout: true,
    });
    expect(storedScene.stored).toHaveLength(2);
    expect(storedScene.suggestions).toHaveLength(0);
  });

  it('preselects a clicked unit suggestion without changing two-input picker defaults', () => {
    const right = scene.suggestions.find((proposal) => proposal.hand === 'R');
    expect(right).toBeDefined();
    expect(initialPickerPick(right!, true, true)).toEqual({ a: right!.a, b: right!.b });
    expect(initialPickerPick(right!, true, false)).toBeNull();
    expect(initialPickerPick(right!, false, true)).toBeNull();
  });
});

describe('unit seam ACCEPT row', () => {
  const rowFor = (
    operations: readonly FormOpLike[],
    index: number,
    pieceKeys: ReadonlySet<string>,
    geoms: ReadonlyMap<string, PieceGeom>,
    rows: ReadonlyMap<string, StoredSeam>,
  ) => {
    const [proposal] = suggestStepPairs(
      operations,
      index,
      pieceKeys,
      geoms,
      fullyUsedEdges(usedEdgesBeforeStep(operations, index, rows, geoms), geoms),
      null,
      rows,
    );
    if (!proposal) throw new Error('expected proposal');
    return edgeRowFromPick(proposal, geoms, {
      pieces: [...geoms.values()],
      grainDeg: null,
      nameOf: (piece) => piece,
    });
  };
  const wireShape = (wire: ReturnType<typeof toWire>) => ({
    fields: Object.keys(wire).sort(),
    status: wire.status,
    kind: wire.kind,
    direction: wire.direction,
    source: wire.source,
    sideA: Object.keys(wire.sideA ?? {}).sort(),
    sideB: Object.keys(wire.sideB ?? {}).sort(),
    anchorA: Object.keys(wire.sideA?.parts?.[0] ?? {}).sort(),
    anchorB: Object.keys(wire.sideB?.parts?.[0] ?? {}).sort(),
  });

  it('serializes like a normal two-input edge pick', () => {
    const unit = rowFor(
      CARD85_OPS,
      card85Step(970),
      CARD85_PIECE_KEYS,
      card85Geoms(),
      CARD85_SEAMS,
    );
    const normal = rowFor(CARD6_OPS, card6Step(770), CARD6_PIECE_KEYS, card6Geoms(), CARD6_SEAMS);

    expect(unit).not.toBeNull();
    expect(normal).not.toBeNull();
    expect(wireShape(toWire(unit!))).toEqual(wireShape(toWire(normal!)));
  });
});
