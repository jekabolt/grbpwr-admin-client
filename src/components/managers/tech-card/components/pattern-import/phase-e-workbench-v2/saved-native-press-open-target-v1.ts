import type { RegisteredSourceCutStitchV1 } from 'lib/cloth/compiler/source-cut-registered-stitch-pairs-v1';
import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import { createDxfPathProvenanceV1 } from 'lib/pattern-import/dxf-path-provenance-v1';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { signedArea } from 'lib/pattern-import/semantics/geom';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';
import type {
  SavedCompleteAssemblyNativeStitchAnchorsV1,
  SavedCompleteNativeStitchAnchorV1,
} from './saved-complete-assembly-native-stitch-anchors-v1';
import { projectSavedNativeStitchRegistrationV1 } from './saved-native-stitch-registration-v1';

type Source = SavedCompleteAssemblyNativeStitchAnchorsV1;
type Piece = Readonly<{
  pieceId: string;
  nativeCutPathId: number;
  ringMm: readonly Vec2Mm[];
  /** Original traversal of the material hinge, before registering side B for stitching. */
  lineMm: readonly [Vec2Mm, Vec2Mm];
}>;

export type SavedNativePressOpenTargetV1 = Readonly<{
  operationNumber: number;
  producerOperationNumber: number;
  sizeToken: string;
  sizeId: number;
  sourceSha256: string;
  stitch: RegisteredSourceCutStitchV1;
  pieces: readonly [Piece, Piece];
}>;

function projectPiece(source: Source, anchor: SavedCompleteNativeStitchAnchorV1): Piece {
  if (
    anchor.kind !== 'native-directed-l14' ||
    anchor.partOrdinal !== 0 ||
    anchor.direction !== 'TECH_CARD_SEAM_DIRECTION_REVERSED' ||
    anchor.seamKind !== 'TECH_CARD_SEAM_KIND_EDGE' ||
    anchor.storedAnchor.pieceLineKey !== anchor.pieceLineKey ||
    anchor.storedAnchor.edgeHint !== anchor.edgeHint ||
    anchor.storedAnchor.placement ||
    (anchor.storedAnchor.rangeFrom ?? 0) !== 0 ||
    ![0, 1].includes(anchor.storedAnchor.rangeTo ?? 0) ||
    (anchor.anchoredSize && anchor.anchoredSize !== source.sizeToken)
  )
    throw new Error('Press Open needs one reversed native L14 edge on each selected piece.');

  const rows = source.rows.filter((row) => row.patternLineKey === anchor.row.patternLineKey);
  const cuts = source.sourceCuts.filter((cut) => cut.pieceLineKey === anchor.pieceLineKey);
  const [cut] = cuts;
  if (
    rows.length !== 1 ||
    !sameSavedDraftRowV1(rows[0]!, anchor.row) ||
    anchor.row.techCardId !== source.cardId ||
    anchor.row.cardLockVersion !== source.cardLockVersion ||
    cuts.length !== 1 ||
    !cut ||
    cut.sizeToken !== source.sizeToken ||
    !cut.blockName ||
    cut.blockName !== anchor.blockName ||
    !sameSavedDraftRowV1(cut.row, anchor.row)
  )
    throw new Error('Press Open needs one current L1 cut in the exact saved row, block and size.');

  const { span } = anchor;
  const [edge] = span.intervals;
  if (
    span.intervals.length !== 1 ||
    !edge ||
    span.fraction[0] !== 0 ||
    span.fraction[1] !== 1 ||
    !((edge.t0 === 0 && edge.t1 === 1) || (edge.t0 === 1 && edge.t1 === 0)) ||
    span.fullRunVertexIds.length !== 2 ||
    span.fullRunVertexIds[0] === span.fullRunVertexIds[1] ||
    !edge.startMm.every((v, i) => v === span.start.positionMm[i]) ||
    !edge.endMm.every((v, i) => v === span.end.positionMm[i]) ||
    ![...edge.startMm, ...edge.endMm].every(Number.isFinite) ||
    !(Math.hypot(edge.endMm[0] - edge.startMm[0], edge.endMm[1] - edge.startMm[1]) > 0) ||
    !Number.isSafeInteger(cut.nativePathId) ||
    cut.nativePathId < 0 ||
    !Number.isSafeInteger(span.nativePathId) ||
    span.nativePathId < 0 ||
    cut.nativePathId === span.nativePathId
  )
    throw new Error('Press Open requires one complete original straight sewing interval per side.');

  // The existing vertex at native t=0 identifies the original straight curve. Validate it
  // against the cut's INSERT path through the DXF provenance owner before using the coordinates.
  const sourceFileId = computeDxfProductSavedSourceFileIdV1(cut.row);
  if (
    span.sourceFileId !== sourceFileId ||
    !createDxfPathProvenanceV1({
      sourceFileId,
      instancePath: cut.sourceInstancePath,
      expectedPointCount: 1,
      samples: [
        {
          vertexId: span.fullRunVertexIds[edge.t0 === 0 ? 0 : 1],
          sourceCurveId: edge.nativeCurveId,
          parameterSpace: 'unit',
          sourceCurveT: 0,
        },
      ],
    }).ok
  )
    throw new Error('The press hinge belongs to a different native file or block occurrence.');

  const points = cut.nativePointsMm;
  const area = signedArea(points);
  if (
    points.length < 3 ||
    !points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)) ||
    !Number.isFinite(area) ||
    area === 0 ||
    new Set(points.map(({ x, y }) => JSON.stringify([x, y]))).size !== points.length
  )
    throw new Error('Press Open needs a finite, non-degenerate native cut ring.');
  // The material carrier uses CCW material coordinates and preserves original vertex zero.
  const ordered = area > 0 ? points : [points[0]!, ...points.slice(1).reverse()];
  return {
    pieceId: anchor.pieceLineKey,
    nativeCutPathId: cut.nativePathId,
    ringMm: ordered.map(({ x, y }): Vec2Mm => [x, y]),
    lineMm: [edge.startMm, edge.endMm],
  };
}

/** Project one saved Press Open and the joined allowances of its exact preceding producer. */
export function projectSavedNativePressOpenTargetV1(
  source: SavedCompleteAssemblyNativeStitchAnchorsV1,
  operationNumber: number,
): SavedNativePressOpenTargetV1 {
  if (
    !/^[a-f0-9]{64}$/.test(source.sourceSha256) ||
    !Number.isSafeInteger(source.sizeId) ||
    source.sizeId <= 0 ||
    !source.sizeToken ||
    !Number.isSafeInteger(operationNumber) ||
    operationNumber <= 0
  )
    throw new Error('Press Open needs a verified Complete Source, size and operation number.');

  const selected = source.operations.filter((op) => op.operationNumber === operationNumber);
  const [press] = selected;
  if (
    selected.length !== 1 ||
    !press ||
    press.draft ||
    press.work !== 'press_open' ||
    press.operationType !== 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' ||
    press.pressEquipment !== 'TECH_CARD_PRESS_EQUIPMENT_IRON' ||
    (press.press?.action && press.press.action !== 'TECH_CARD_PRESS_ACTION_UNKNOWN') ||
    (press.press?.toward && press.press.toward !== 'TECH_CARD_PRESS_TOWARD_UNKNOWN') ||
    press.pressProfileKey ||
    press.pressTemperatureC ||
    press.pressDwellSec ||
    press.pressPressureNCm2 ||
    (press.pressCloth && press.pressCloth !== 'TECH_CARD_PRESS_CLOTH_UNKNOWN') ||
    press.pieceLineKeys?.length ||
    press.seamKeys?.length ||
    press.foldKeys?.length ||
    press.inputKeys?.length !== 1 ||
    !press.inputKeys[0]
  )
    throw new Error('Choose a saved Press Open with one assembly input, an iron and no override.');

  const producers = source.operations.filter((op) => op.outputUnitKey === press.inputKeys![0]);
  const [producer] = producers;
  if (
    producers.length !== 1 ||
    !producer ||
    producer.draft ||
    source.operations.indexOf(producer) >= source.operations.indexOf(press) ||
    !producer.operationNumber ||
    producer.work !== 'join_lockstitch' ||
    producer.operationType !== 'TECH_CARD_OPERATION_TYPE_MACHINE' ||
    source.operations.filter((op) => op.operationNumber === producer.operationNumber).length !==
      1 ||
    producer.seamKeys?.length !== 2 ||
    new Set(producer.seamKeys).size !== 2 ||
    producer.pieceLineKeys?.length !== 2 ||
    new Set(producer.pieceLineKeys).size !== 2 ||
    producer.inputKeys?.length !== 2 ||
    !producer.pieceLineKeys.every((key) => producer.inputKeys!.includes(key))
  )
    throw new Error('Press Open requires one earlier two-piece lockstitch producer of its input.');
  const producerNumber = producer.operationNumber;
  const producerOrder = source.operations.indexOf(producer);
  const spans = source.spans.filter((span) => span.operationNumber === producerNumber);
  const a = spans.find((s) => s.sideIndex === 0);
  const b = spans.find((s) => s.sideIndex === 1);
  if (
    spans.length !== 2 ||
    !a ||
    !b ||
    !a.seamKey ||
    a.seamKey !== b.seamKey ||
    a.operationOrder !== producerOrder ||
    b.operationOrder !== producerOrder ||
    !producer.seamKeys.includes(a.seamKey) ||
    a.pieceLineKey === b.pieceLineKey ||
    !producer.pieceLineKeys.includes(a.pieceLineKey) ||
    !producer.pieceLineKeys.includes(b.pieceLineKey)
  )
    throw new Error('The saved producer must own one physical edge with two exact material sides.');
  const poses = source.poses.filter((pose) => pose.operationNumber === producerNumber);
  const [pose] = poses;
  const sideA = pose?.seam.sideA?.parts;
  const sideB = pose?.seam.sideB?.parts;
  if (
    poses.length !== 1 ||
    !pose ||
    pose.seamKey === a.seamKey ||
    !producer.seamKeys.includes(pose.seamKey) ||
    pose.seam.seamKey !== pose.seamKey ||
    pose.seam.kind !== 'TECH_CARD_SEAM_KIND_POSE' ||
    pose.seam.stale ||
    pose.seam.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED' ||
    sideA?.length !== 1 ||
    sideB?.length !== 1 ||
    ![a.pieceLineKey, b.pieceLineKey].every(
      (key) => key === sideA[0]?.pieceLineKey || key === sideB[0]?.pieceLineKey,
    ) ||
    source.unavailable.some((s) => s.operationNumber === producerNumber)
  )
    throw new Error('The producer must also own a separate, current pose of the same two pieces.');

  const pieces = [projectPiece(source, a), projectPiece(source, b)] as const;
  const stitch = projectSavedNativeStitchRegistrationV1(
    spans,
    {
      operationNumber: producerNumber,
      seamKey: a.seamKey,
      sections: [
        {
          sideA: { partOrdinal: 0, direction: 'native-forward' },
          sideB: { partOrdinal: 0, direction: 'native-reversed' },
        },
      ],
    },
    source.sourceCuts,
  );
  return {
    operationNumber,
    producerOperationNumber: producerNumber,
    sizeToken: source.sizeToken,
    sizeId: source.sizeId,
    sourceSha256: source.sourceSha256,
    stitch,
    pieces,
  };
}
