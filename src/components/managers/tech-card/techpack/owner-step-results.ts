// THE EDITOR'S STEP PICTURES, FOR PRINT. One pass shared by the PDF drawings and the PDF seam
// lengths, so a side laid on another piece reads the same layout on paper as in the editor.
//
// Pure TS: no React.
import type { common_TechCard } from 'api/proto-http/admin';
import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { foldsFromWire } from 'lib/folds';
import { poseKeysOfWire } from 'lib/seams';

import { poseRowsOfCard, seamRowsOfCard } from '../components/card-seam-graph';
import { ROWLESS_CARDS_FOLLOW_EDITOR } from '../components/step-seams/draws-result';
import type { SceneOp } from '../components/step-seams/step-picture-view';
import { OWNER_FIT, stepResults, type StepResult } from '../components/step-seams/step-result';

/** What a print piece hands the step pass: its engine geometry and its inner lines (y down). */
export type OwnerPiece = { geom: PieceGeom; inner: readonly (readonly [number, number])[][] };

// An op's keys name seams and pose rows alike (P8): the card's rows tell them apart, as the form does.
export const sceneOperations = (techCard: common_TechCard): SceneOp[] => {
  const poseKeys = poseKeysOfWire(techCard.seams);
  return (techCard.techCard?.operations ?? []).map((operation) => {
    const keys = operation.seamKeys ?? [];
    const posed = keys.filter((key) => poseKeys.has(key));
    return {
      operationNumber: operation.operationNumber,
      operationType: operation.operationType,
      work: operation.work,
      inputKeys: operation.inputKeys ?? [],
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      seamKeys: posed.length ? keys.filter((key) => !poseKeys.has(key)) : keys,
      ...(posed.length ? { poseKeys: posed } : {}),
      ...(operation.foldKeys?.length ? { foldKeys: operation.foldKeys } : {}),
      ...(operation.labelKeys?.length ? { labelKeys: operation.labelKeys } : {}),
      ...(operation.layerOrder?.length ? { layerOrder: operation.layerOrder } : {}),
      fullnessRatio: operation.stitching?.fullnessRatio?.value,
    };
  });
};

export type OwnerStepResults = {
  geoms: Map<string, PieceGeom>;
  innerLines: Map<string, Pt2[][]>;
  pieceKeys: Set<string>;
  /** The stored, unresolved operations: the editor's own input, in the card's order. */
  operations: SceneOp[];
  results: readonly StepResult[];
  cardFolds?: {
    rows: ReturnType<typeof foldsFromWire>['folds'];
    grainDeg: ReadonlyMap<string, number>;
  };
};

// One geometry map per pieces map: the step pass caches by its identity, so drawings and lengths
// of one print share a single run.
const geometryOf = new WeakMap<
  ReadonlyMap<string, OwnerPiece>,
  { geoms: Map<string, PieceGeom>; innerLines: Map<string, Pt2[][]> }
>();

/**
 * The editor's step results for a card: `stored` is the card as saved (its operations are what the
 * editor reads), `resolved` the card after the print resolved DXF aliases (its rows).
 */
export function ownerStepResultsOfCard(
  stored: common_TechCard,
  resolved: common_TechCard,
  pieces: ReadonlyMap<string, OwnerPiece>,
  grainDeg: ReadonlyMap<string, number> | undefined,
): OwnerStepResults {
  let geometry = geometryOf.get(pieces);
  if (!geometry) {
    geometry = {
      geoms: new Map([...pieces].map(([key, piece]) => [key, piece.geom])),
      innerLines: new Map(
        [...pieces].map(([key, piece]) => [
          key,
          piece.inner.map((line) => line.map(([x, y]) => [x, -y] as Pt2)),
        ]),
      ),
    };
    geometryOf.set(pieces, geometry);
  }
  const { geoms, innerLines } = geometry;
  const pieceKeys = new Set([
    ...geoms.keys(),
    ...(resolved.techCard?.pieces ?? []).flatMap((piece) => (piece.lineKey ? [piece.lineKey] : [])),
  ]);
  const byKey = seamRowsOfCard(resolved);
  const poses = poseRowsOfCard(resolved);
  const operations = sceneOperations(stored);
  const foldRows = foldsFromWire(stored.pieceFolds ?? resolved.pieceFolds).folds;
  const cardFolds = foldRows.length
    ? { rows: foldRows, grainDeg: grainDeg ?? new Map<string, number>() }
    : undefined;
  // With no stored row every result is provably rowless; keep that legacy path allocation-free
  // until the one shared flag opts rowless cards into editor parity.
  const results =
    byKey.size || poses.size || ROWLESS_CARDS_FOLLOW_EDITOR
      ? stepResults(
          {
            ops: operations,
            byKey,
            poses,
            geoms,
            innerLines,
            pieceKeys,
            ...(cardFolds ? { folds: cardFolds } : {}),
          },
          OWNER_FIT,
        )
      : [];
  return { geoms, innerLines, pieceKeys, operations, results, ...(cardFolds ? { cardFolds } : {}) };
}

/** Each step's layout by operation number: where the editor (picker, tile, map) lays its pieces. */
export function ownerLayoutsByNumber(
  owner: Pick<OwnerStepResults, 'operations' | 'results'>,
): Map<number, ReadonlyMap<string, Affine>> {
  const out = new Map<number, ReadonlyMap<string, Affine>>();
  owner.results.forEach((result, index) => {
    const number = owner.operations[index]?.operationNumber;
    if (number != null && !out.has(number)) out.set(number, result.layout.T);
  });
  return out;
}
