import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
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
import { fitBox } from './step-picture';
import {
  isUnitStepSeamPreview,
  nearestPictureTarget,
  pictureBounds,
  picturePickTargets,
  stepPictureOfOp,
  stepSeamPreview,
  type SceneOp,
} from './step-picture-view';
import { edgeRowFromPick, initialPickerPick } from './step-rows';
import {
  pieceOfTarget,
  suggestStepPairs,
  usedEdgesBeforeStep,
  type FormOpLike,
} from './step-seams-model';

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

  it('lays both shoulder proposals into non-empty tile and picker pictures', () => {
    expect(isUnitStepSeamPreview(scene.groups)).toBe(true);
    expect(scene.suggestions).toHaveLength(2);

    for (const sides of scene.suggestions) {
      const preview = stepSeamPreview(
        {
          leaves: scene.leaves,
          innerSeams: scene.innerSeams,
          storedSeams: scene.storedSeams,
          crossSeams: scene.crossSeams,
          geoms,
          innerLines,
          hands: scene.hands,
        },
        { sides, source: 'live' },
      );
      expect(preview).not.toBeNull();
      expect(preview!.seams.length).toBeGreaterThan(0);
      for (const piece of [...sides.a, ...sides.b].map(pieceOfTarget)) {
        expect(preview!.layout.T.has(piece)).toBe(true);
      }
      const bounds = pictureBounds(preview!.layout, geoms, 'tile');
      expect(bounds.x1 - bounds.x0).toBeGreaterThan(0);
      expect(bounds.y1 - bounds.y0).toBeGreaterThan(0);
    }
  });

  it('hits the drawn right back shoulder instead of a hidden placket edge', () => {
    const right = scene.suggestions.find((proposal) => proposal.hand === 'R');
    expect(right).toBeDefined();
    const shoulder = right!.a.find((id) => seamEdgeWord([id], geoms) === 'shoulder');
    expect(shoulder).toBeDefined();

    const preview = stepSeamPreview(
      {
        leaves: scene.leaves,
        innerSeams: scene.innerSeams,
        storedSeams: scene.storedSeams,
        crossSeams: scene.crossSeams,
        geoms,
        innerLines,
        hands: scene.hands,
      },
      { sides: right!, source: 'live' },
      { focus: false, explode: 0.08 },
    );
    expect(preview).not.toBeNull();
    const bounds = pictureBounds(preview!.layout, geoms, 'canvas');
    const targets = picturePickTargets(
      preview!.layout,
      geoms,
      innerLines,
      fitBox(bounds, 960, 720, 64),
      {
        hiddenTargets: new Set(
          scene.suggestions.flatMap((proposal) => [...proposal.a, ...proposal.b]),
        ),
      },
    );
    const shoulderTarget = targets.find((target) => target.id === shoulder);
    expect(shoulderTarget).toBeDefined();
    const point = shoulderTarget!.points[Math.floor(shoulderTarget!.points.length / 2)];
    expect(nearestPictureTarget(point, targets)?.id).toBe(shoulder);
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
      usedEdgesBeforeStep(operations, index, rows),
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
