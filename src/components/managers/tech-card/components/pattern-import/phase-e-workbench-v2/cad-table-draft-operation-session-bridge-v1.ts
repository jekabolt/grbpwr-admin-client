import type { DxfMaterialAssignmentV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type {
  PatternImportDxfProductPhaseEExistingAssemblyOperationV1,
  PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type {
  PatternImportDxfProductPhaseEMultiseamProposalV2,
  PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';

import {
  planPatternImportDxfPhaseECadTableDraftOperationsV1,
  type PatternImportDxfPhaseECadTableCurrentOperationV1,
  type PatternImportDxfPhaseECadTableDraftOperationPlanV1,
  type PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1,
} from './cad-table-draft-operation-planner-v1';
import type { PatternImportDxfPhaseEDraftOperationConnectionIntentV1 } from './draft-operation-from-connection-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_V1,
  type PatternImportDxfPhaseEDraftCadCommandV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_SESSION_BRIDGE_V1 =
  'pattern-import-dxf-phase-e-cad-table-draft-operation-session-bridge/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATION_SESSION_BRIDGE_CLAIMS_V1 =
  Object.freeze({
    sessionOnly: true,
    currentOperationProjectionReadOnly: true,
    currentWorkbenchStateReadOnly: true,
    existingPlannerReused: true,
    createsFormOwner: false,
    writesFormFields: false,
    writesPersistence: false,
    applyRendered: false,
    productionReady: false,
  } as const);

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1 =
  'pattern-import-dxf-phase-e-cad-command-draft-plan/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_CLAIMS_V1 = Object.freeze({
  sessionOnly: true,
  commandsProjectedThroughUndoCursorOnly: true,
  currentAssemblyOperationIdentityReused: true,
  cutSpreadDependencyExplicit: true,
  createsOperationAuthority: false,
  writesPersistence: false,
  applyEligible: false,
} as const);

export type PatternImportDxfPhaseECadCommandDraftKindV1 =
  | 'construct'
  | 'detail'
  | 'dart'
  | 'cut'
  | 'spread';

export type PatternImportDxfPhaseECadCommandDraftV1 = Readonly<{
  draftOperationId: string;
  commandId: string;
  tool: PatternImportDxfPhaseEDraftCadCommandV1['tool'];
  transactionId: string;
  transactionLabel: string;
  operationRef: string;
  operationNumber: number;
  sourceRevision: number;
  sourceCatalogCanonicalSha256: string;
  sourceSizeSelectionCanonicalSha256: string;
  order: number;
  processKind: PatternImportDxfPhaseECadCommandDraftKindV1;
  label: string;
  target: Readonly<{ pieceId: string; pieceLineKey: string }>;
  entityId: string;
  dependsOnDraftIds: readonly string[];
  parameters: readonly Readonly<{ label: string; value: string }>[];
  apply: Readonly<{ eligible: false }>;
}>;

export type PatternImportDxfPhaseECadCommandDraftBlockerV1 = Readonly<{
  code:
    | 'cad-session-invalid'
    | 'cad-source-stale'
    | 'cad-operation-owner-mismatch'
    | 'cad-target-stale'
    | 'cad-command-duplicate'
    | 'cad-command-unsupported'
    | 'cad-command-invalid'
    | 'cad-spread-orphan'
    | 'cad-spread-cross-piece';
  detail: string;
  commandId: string | null;
  operationNumber: number | null;
}>;

export type PatternImportDxfPhaseECadCommandDraftResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1;
      drafts: readonly PatternImportDxfPhaseECadCommandDraftV1[];
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1;
      drafts: null;
      blocker: PatternImportDxfPhaseECadCommandDraftBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadTableDraftOperationSessionBridgeBlockerV1 =
  | PatternImportDxfPhaseECadTableDraftOperationPlannerBlockerV1
  | Readonly<{
      code:
        | 'current-operation-unavailable'
        | 'operation-stage-required'
        | 'stitch-owner-unavailable'
        | 'exact-connection-incomplete';
      detail: string;
      operationNumber: number | null;
      processKind: 'connect';
    }>;

export type PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 =
  | Readonly<{
      ok: true;
      plan: PatternImportDxfPhaseECadTableDraftOperationPlanV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      plan: null;
      blocker: PatternImportDxfPhaseECadTableDraftOperationSessionBridgeBlockerV1;
    }>;

type BridgeInput = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1 | null;
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
}>;

function blocked(
  code: Extract<
    PatternImportDxfPhaseECadTableDraftOperationSessionBridgeBlockerV1['code'],
    | 'current-operation-unavailable'
    | 'operation-stage-required'
    | 'stitch-owner-unavailable'
    | 'exact-connection-incomplete'
  >,
  detail: string,
  operationNumber: number | null,
): PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 {
  return Object.freeze({
    ok: false as const,
    plan: null,
    blocker: Object.freeze({ code, detail, operationNumber, processKind: 'connect' as const }),
  });
}

function retainedOperation(
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): PatternImportDxfProductPhaseEExistingAssemblyOperationV1 {
  return Object.freeze({
    authoringOperationId: proposal.operation.authoringOperationId,
    number: proposal.operation.sourceOperationNumber,
    work: proposal.operation.work,
    phaseEKind: 'stitch' as const,
    inputKeys: Object.freeze([...proposal.operation.inputKeys]),
    outputUnitKey: proposal.operation.outputUnitKey,
    outputUnitName: proposal.operation.outputUnitName,
    seamKeys: Object.freeze([...proposal.operation.seamIds]),
  });
}

function currentMaterials(input: BridgeInput): readonly DxfMaterialAssignmentV1[] {
  const optionById = new Map(input.materialOptions.map((option) => [option.id, option]));
  const byOptionId = new Map<string, DxfMaterialAssignmentV1>();
  for (const selection of input.state.materialSelections) {
    const option = selection.optionId ? optionById.get(selection.optionId) : undefined;
    if (!option) continue;
    const prior = byOptionId.get(option.id);
    byOptionId.set(option.id, {
      id: option.id,
      materialRevision: option.materialRevision,
      pieceIds: prior ? [...prior.pieceIds, selection.pieceId] : [selection.pieceId],
    });
  }
  return Object.freeze([...byOptionId.values()].map((material) => Object.freeze(material)));
}

function exactConnections(
  input: BridgeInput,
): readonly PatternImportDxfPhaseEDraftOperationConnectionIntentV1[] | null {
  const connections: PatternImportDxfPhaseEDraftOperationConnectionIntentV1[] = [];
  for (let seamIndex = 0; seamIndex < input.state.seams.length; seamIndex += 1) {
    const seam = input.state.seams[seamIndex];
    const proposed = input.proposal.seams[seamIndex];
    if (
      !seam ||
      !proposed ||
      seam.seamId !== proposed.id ||
      seam.mapping !== 'equal' ||
      seam.lengthRatio !== 1
    )
      return null;
    const sides: PatternImportDxfPhaseEDraftOperationConnectionIntentV1['sides'][number][] = [];
    for (let sideIndex = 0; sideIndex < seam.sides.length; sideIndex += 1) {
      const side = seam.sides[sideIndex];
      const proposedSide = proposed.sides[sideIndex];
      if (
        !side ||
        !proposedSide ||
        side.pieceId !== proposedSide.pieceId ||
        !side.contourId ||
        !side.direction ||
        side.direction !== proposedSide.requiredDirection ||
        side.boundaryVertexIds.length !== 2
      )
        return null;
      sides.push(
        Object.freeze({
          pieceId: side.pieceId,
          pieceLineKey: proposedSide.pieceLineKey,
          contourId: side.contourId,
          boundaryVertexIds: Object.freeze([
            side.boundaryVertexIds[0]!,
            side.boundaryVertexIds[1]!,
          ]) as readonly [string, string],
          direction: side.direction,
        }),
      );
    }
    if (sides.length !== 2) return null;
    connections.push(
      Object.freeze({
        intentId: seam.seamId,
        mapping: seam.mapping,
        lengthRatio: seam.lengthRatio,
        sides: Object.freeze([
          sides[0]!,
          sides[1]!,
        ]) as PatternImportDxfPhaseEDraftOperationConnectionIntentV1['sides'],
      }),
    );
  }
  return Object.freeze(connections);
}

const CAD_STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const PRODUCTIVE_CAD_TOOLS = new Set<string>(
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1,
);

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cadBlocked(
  code: PatternImportDxfPhaseECadCommandDraftBlockerV1['code'],
  detail: string,
  operationNumber: number | null,
  commandId: string | null = null,
): PatternImportDxfPhaseECadCommandDraftResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1,
    drafts: null,
    blocker: Object.freeze({ code, detail, commandId, operationNumber }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_CLAIMS_V1,
  });
}

function commandKind(
  tool: PatternImportDxfPhaseEDraftCadCommandV1['tool'],
): PatternImportDxfPhaseECadCommandDraftKindV1 | null {
  if (tool === 'cut') return 'cut';
  if (tool === 'spread') return 'spread';
  if (tool === 'dart') return 'dart';
  if (tool === 'mark' || tool === 'notch' || tool === 'add-point') return 'detail';
  if (
    tool === 'pen' ||
    tool === 'rectangle' ||
    tool === 'circle' ||
    tool === 'ellipse' ||
    tool === 'internal-line' ||
    tool === 'pattern-line' ||
    tool === 'french-curve'
  )
    return 'construct';
  return null;
}

const CAD_TOOL_LABELS: Readonly<
  Partial<Record<PatternImportDxfPhaseEDraftCadCommandV1['tool'], string>>
> = Object.freeze({
  pen: 'Create Pen piece',
  rectangle: 'Create rectangle piece',
  circle: 'Create circle piece',
  ellipse: 'Create ellipse piece',
  'internal-line': 'Internal line',
  'pattern-line': 'Pattern line',
  'french-curve': 'French curve',
  'add-point': 'Add point',
  dart: 'Dart',
  cut: 'Cut',
  spread: 'Spread',
  mark: 'Mark',
  notch: 'Notch',
});

function cadToolLabel(tool: PatternImportDxfPhaseEDraftCadCommandV1['tool']): string {
  return CAD_TOOL_LABELS[tool] ?? tool;
}

function pointLabel(point: Readonly<{ x: number; y: number }>): string {
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)} mm`;
}

function commandParameters(
  command: PatternImportDxfPhaseEDraftCadCommandV1,
): readonly Readonly<{ label: string; value: string }>[] {
  switch (command.tool) {
    case 'pen':
      return Object.freeze([
        Object.freeze({ label: 'Piece', value: command.payload.newPiece?.pieceLineKey ?? '—' }),
        Object.freeze({ label: 'Corners', value: String(command.payload.pointsMm.length) }),
      ]);
    case 'rectangle':
      return Object.freeze([
        Object.freeze({ label: 'Piece', value: command.payload.newPiece?.pieceLineKey ?? '—' }),
        Object.freeze({ label: 'Width', value: `${command.payload.widthMm} mm` }),
        Object.freeze({ label: 'Height', value: `${command.payload.heightMm} mm` }),
        Object.freeze({ label: 'Origin', value: pointLabel(command.payload.originMm) }),
        Object.freeze({
          label: 'Grading',
          value: command.payload.newPiece?.gradingPolicy ?? 'unavailable',
        }),
      ]);
    case 'circle':
      return Object.freeze([
        Object.freeze({ label: 'Piece', value: command.payload.newPiece?.pieceLineKey ?? '—' }),
        Object.freeze({ label: 'Radius', value: `${command.payload.radiusMm} mm` }),
        Object.freeze({ label: 'Center', value: pointLabel(command.payload.centerMm) }),
        Object.freeze({
          label: 'Chord error',
          value: `${command.payload.newPiece?.maxChordErrorMm ?? '—'} mm`,
        }),
        Object.freeze({
          label: 'Grading',
          value: command.payload.newPiece?.gradingPolicy ?? 'unavailable',
        }),
      ]);
    case 'ellipse':
      return Object.freeze([
        Object.freeze({ label: 'Piece', value: command.payload.newPiece?.pieceLineKey ?? '—' }),
        Object.freeze({ label: 'Radius X', value: `${command.payload.radiusXmm} mm` }),
        Object.freeze({ label: 'Radius Y', value: `${command.payload.radiusYmm} mm` }),
        Object.freeze({ label: 'Rotation', value: `${command.payload.rotationDeg}°` }),
        Object.freeze({ label: 'Center', value: pointLabel(command.payload.centerMm) }),
        Object.freeze({
          label: 'Chord error',
          value: `${command.payload.newPiece?.maxChordErrorMm ?? '—'} mm`,
        }),
        Object.freeze({
          label: 'Grading',
          value: command.payload.newPiece?.gradingPolicy ?? 'unavailable',
        }),
      ]);
    case 'cut':
      return Object.freeze([
        Object.freeze({ label: 'Path', value: `${command.payload.pointsMm.length} points` }),
        Object.freeze({ label: 'Keep', value: command.payload.keepSide }),
      ]);
    case 'spread':
      return Object.freeze([
        Object.freeze({ label: 'Amount', value: `${command.payload.amountMm} mm` }),
        Object.freeze({ label: 'Pivot', value: pointLabel(command.payload.pivotMm) }),
        Object.freeze({ label: 'Cut', value: command.payload.cutLineEntityId }),
      ]);
    case 'dart':
      return Object.freeze([
        Object.freeze({ label: 'Intake', value: `${command.payload.intakeMm} mm` }),
        Object.freeze({ label: 'Apex', value: pointLabel(command.payload.apexMm) }),
      ]);
    case 'add-point':
      return Object.freeze([
        Object.freeze({ label: 'Contour', value: command.payload.contourId }),
        Object.freeze({ label: 'After', value: command.payload.afterVertexId }),
        Object.freeze({ label: 'Point', value: pointLabel(command.payload.pointMm) }),
      ]);
    case 'mark':
      return Object.freeze([
        Object.freeze({ label: 'Kind', value: command.payload.kind }),
        Object.freeze({ label: 'Point', value: pointLabel(command.payload.pointMm) }),
      ]);
    case 'notch':
      return Object.freeze([
        Object.freeze({ label: 'Kind', value: command.payload.kind }),
        Object.freeze({ label: 'Depth', value: `${command.payload.depthMm} mm` }),
      ]);
    case 'internal-line':
    case 'french-curve':
      return Object.freeze([
        Object.freeze({
          label: 'Path',
          value: `${
            command.tool === 'french-curve'
              ? command.payload.controlPointsMm.length
              : command.payload.pointsMm.length
          } points`,
        }),
      ]);
    case 'pattern-line':
      return Object.freeze([
        Object.freeze({ label: 'Path', value: `${command.payload.pointsMm.length} points` }),
        Object.freeze({ label: 'Closed', value: command.payload.closed ? 'yes' : 'no' }),
      ]);
    default:
      return Object.freeze([]);
  }
}

function finitePoint(value: unknown): value is Readonly<{ x: number; y: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Readonly<{ x?: unknown; y?: unknown }>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function roundPieceShapeValid(
  newPiece: Extract<
    PatternImportDxfPhaseEDraftCadCommandV1,
    { tool: 'circle' | 'ellipse' }
  >['payload']['newPiece'],
): boolean {
  return (
    !!newPiece &&
    CAD_STABLE_ID.test(newPiece.pieceId) &&
    CAD_STABLE_ID.test(newPiece.pieceLineKey) &&
    CAD_STABLE_ID.test(newPiece.contourId) &&
    CAD_STABLE_ID.test(newPiece.vertexIdPrefix) &&
    newPiece.displayName.trim().length > 0 &&
    Number.isFinite(newPiece.maxChordErrorMm) &&
    newPiece.maxChordErrorMm > 0 &&
    newPiece.gradingPolicy === 'ungraded-current-size' &&
    newPiece.placementPolicy === 'separate-writer-block'
  );
}

function cadCommandShapeValid(command: PatternImportDxfPhaseEDraftCadCommandV1): boolean {
  if (
    !command ||
    !CAD_STABLE_ID.test(command.commandId ?? '') ||
    !CAD_STABLE_ID.test(command.target?.pieceId ?? '') ||
    !CAD_STABLE_ID.test(command.target?.pieceLineKey ?? '') ||
    !CAD_STABLE_ID.test(command.payload?.entityId ?? '')
  )
    return false;
  if (command.tool === 'pen') {
    const { closed, pointsMm, newPiece } = command.payload;
    return Boolean(
      closed &&
        Array.isArray(pointsMm) &&
        pointsMm.length >= 3 &&
        pointsMm.length <= 256 &&
        pointsMm.every(finitePoint) &&
        newPiece &&
        CAD_STABLE_ID.test(newPiece.pieceId) &&
        CAD_STABLE_ID.test(newPiece.pieceLineKey) &&
        CAD_STABLE_ID.test(newPiece.contourId) &&
        Array.isArray(newPiece.vertexIds) &&
        newPiece.vertexIds.length === pointsMm.length &&
        new Set(newPiece.vertexIds).size === newPiece.vertexIds.length &&
        newPiece.vertexIds.every((vertexId) => CAD_STABLE_ID.test(vertexId)) &&
        newPiece.displayName.trim().length > 0 &&
        newPiece.gradingPolicy === 'ungraded-current-size' &&
        newPiece.placementPolicy === 'separate-writer-block',
    );
  }
  if (command.tool === 'rectangle') {
    const newPiece = command.payload.newPiece;
    return (
      finitePoint(command.payload.originMm) &&
      Number.isFinite(command.payload.widthMm) &&
      command.payload.widthMm > 0 &&
      Number.isFinite(command.payload.heightMm) &&
      command.payload.heightMm > 0 &&
      command.payload.rotationDeg === 0 &&
      !!newPiece &&
      CAD_STABLE_ID.test(newPiece.pieceId) &&
      CAD_STABLE_ID.test(newPiece.pieceLineKey) &&
      CAD_STABLE_ID.test(newPiece.contourId) &&
      newPiece.vertexIds.length === 4 &&
      new Set(newPiece.vertexIds).size === 4 &&
      newPiece.vertexIds.every((vertexId) => CAD_STABLE_ID.test(vertexId)) &&
      newPiece.displayName.trim().length > 0 &&
      newPiece.gradingPolicy === 'ungraded-current-size' &&
      newPiece.placementPolicy === 'separate-writer-block'
    );
  }
  if (command.tool === 'circle')
    return (
      finitePoint(command.payload.centerMm) &&
      Number.isFinite(command.payload.radiusMm) &&
      command.payload.radiusMm > 0 &&
      roundPieceShapeValid(command.payload.newPiece)
    );
  if (command.tool === 'ellipse')
    return (
      finitePoint(command.payload.centerMm) &&
      Number.isFinite(command.payload.radiusXmm) &&
      command.payload.radiusXmm > 0 &&
      Number.isFinite(command.payload.radiusYmm) &&
      command.payload.radiusYmm > 0 &&
      Number.isFinite(command.payload.rotationDeg) &&
      roundPieceShapeValid(command.payload.newPiece)
    );
  if (command.tool === 'cut')
    return (
      Array.isArray(command.payload.pointsMm) &&
      command.payload.pointsMm.length >= 2 &&
      command.payload.pointsMm.every(finitePoint) &&
      ['left', 'right', 'both'].includes(command.payload.keepSide)
    );
  if (command.tool === 'spread')
    return (
      finitePoint(command.payload.pivotMm) &&
      CAD_STABLE_ID.test(command.payload.cutLineEntityId) &&
      Number.isFinite(command.payload.amountMm) &&
      command.payload.amountMm > 0
    );
  if (command.tool === 'internal-line' || command.tool === 'pattern-line')
    return (
      Array.isArray(command.payload.pointsMm) &&
      command.payload.pointsMm.length >= 2 &&
      command.payload.pointsMm.every(finitePoint) &&
      (command.tool !== 'pattern-line' || typeof command.payload.closed === 'boolean')
    );
  if (command.tool === 'french-curve')
    return (
      Array.isArray(command.payload.controlPointsMm) &&
      command.payload.controlPointsMm.length >= 3 &&
      command.payload.controlPointsMm.every(finitePoint)
    );
  if (command.tool === 'add-point')
    return (
      CAD_STABLE_ID.test(command.payload.contourId) &&
      CAD_STABLE_ID.test(command.payload.afterVertexId) &&
      finitePoint(command.payload.pointMm)
    );
  if (command.tool === 'dart')
    return finitePoint(command.payload.apexMm) && command.payload.intakeMm > 0;
  if (command.tool === 'mark')
    return (
      finitePoint(command.payload.pointMm) &&
      ['drill', 'cross', 'text'].includes(command.payload.kind)
    );
  if (command.tool === 'notch')
    return (
      ['single', 'double', 'triple', 'v'].includes(command.payload.kind) &&
      Number.isFinite(command.payload.depthMm) &&
      command.payload.depthMm > 0
    );
  return false;
}

export function buildPatternImportDxfPhaseECadCommandDraftOperationsV1(input: {
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  currentOperation: PatternImportDxfPhaseECadTableCurrentOperationV1 | null;
  session: PatternImportDxfPhaseEDraftCadSessionV1;
}): PatternImportDxfPhaseECadCommandDraftResultV1 {
  const operationNumber = input.proposal?.operation?.sourceOperationNumber ?? null;
  const session = input.session;
  if (
    !session ||
    session.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_V1 ||
    !session.source ||
    !session.source.catalog ||
    !session.source.phaseD ||
    !Array.isArray(session.history) ||
    !Number.isSafeInteger(session.cursor) ||
    session.cursor < 0 ||
    session.cursor > session.history.length ||
    !Number.isSafeInteger(session.source.revision) ||
    session.source.revision < 1
  )
    return cadBlocked(
      'cad-session-invalid',
      'The Pattern Draft session cursor or source revision is invalid.',
      operationNumber,
    );
  if (
    session.source.catalog.canonicalSha256 !== input.catalog.canonicalSha256 ||
    session.source.catalog.sizeSelectionCanonicalSha256 !==
      input.catalog.sizeSelectionCanonicalSha256 ||
    session.source.phaseD.sourceFileId !== input.catalog.sourceFileId ||
    input.proposal.expectedCatalogCanonicalSha256 !== input.catalog.canonicalSha256
  )
    return cadBlocked(
      'cad-source-stale',
      'The Pattern Draft source no longer exact-matches the current prepared catalog.',
      operationNumber,
    );
  const current = input.currentOperation;
  const operation = input.proposal.operation;
  const operationOwnerMismatches = !current
    ? ['current operation unavailable']
    : [
        !CAD_STABLE_ID.test(operation.authoringOperationId ?? '')
          ? 'authoring operation identity'
          : null,
        current.operationNumber !== operation.sourceOperationNumber ? 'operation number' : null,
        current.work?.trim() !== operation.work.trim() ? 'work' : null,
        !sameOrderedStrings(current.inputKeys ?? [], operation.inputKeys) ? 'input keys' : null,
        (current.outputUnitKey ?? '') !== operation.outputUnitKey ? 'output key' : null,
        (current.outputUnitName ?? '') !== operation.outputUnitName ? 'output name' : null,
        !sameOrderedStrings(current.seamKeys ?? [], operation.seamIds) ? 'seam keys' : null,
      ].filter((value): value is string => Boolean(value));
  if (operationOwnerMismatches.length)
    return cadBlocked(
      'cad-operation-owner-mismatch',
      `The selected Assembly Order operation no longer exact-matches this CAD session (${operationOwnerMismatches.join(', ')}).`,
      operationNumber,
    );

  const targetKeys = new Set(
    input.catalog.pieces.map(({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`),
  );
  const activeTransactions = session.history.slice(0, session.cursor);
  const transactionIds = new Set<string>();
  const commandIds = new Set<string>();
  const entityIds = new Set<string>();
  const cutByEntity = new Map<
    string,
    Readonly<{ draftId: string; pieceId: string; pieceLineKey: string }>
  >();
  const drafts: PatternImportDxfPhaseECadCommandDraftV1[] = [];
  for (const transaction of activeTransactions) {
    if (
      !transaction ||
      !CAD_STABLE_ID.test(transaction.transactionId ?? '') ||
      typeof transaction.label !== 'string' ||
      !transaction.label.trim() ||
      transactionIds.has(transaction.transactionId) ||
      !Array.isArray(transaction.commands)
    )
      return cadBlocked(
        'cad-command-duplicate',
        'Active Pattern Draft transactions must have unique stable identities.',
        operationNumber,
      );
    transactionIds.add(transaction.transactionId);
    for (const command of transaction.commands) {
      if (!PRODUCTIVE_CAD_TOOLS.has(command.tool) || !commandKind(command.tool))
        return cadBlocked(
          'cad-command-unsupported',
          `The ${command.tool} intent has no executable Draft Operation projection.`,
          operationNumber,
          command.commandId ?? null,
        );
      if (!cadCommandShapeValid(command))
        return cadBlocked(
          'cad-command-invalid',
          'The active CAD command is missing a stable identity or exact executable payload.',
          operationNumber,
          command.commandId ?? null,
        );
      if (commandIds.has(command.commandId) || entityIds.has(command.payload.entityId))
        return cadBlocked(
          'cad-command-duplicate',
          'Command and entity identities must be unique through the active undo cursor.',
          operationNumber,
          command.commandId,
        );
      const targetKey = `${command.target.pieceId}\u0000${command.target.pieceLineKey}`;
      if (!targetKeys.has(targetKey) || !operation.inputKeys.includes(command.target.pieceLineKey))
        return cadBlocked(
          'cad-target-stale',
          'The CAD command target is not a current input piece of the selected operation.',
          operationNumber,
          command.commandId,
        );
      commandIds.add(command.commandId);
      entityIds.add(command.payload.entityId);
      const draftId = `cad-draft:${session.source.revision}:${command.commandId}`;
      const dependencies: string[] = [];
      if (command.tool === 'spread') {
        const cut = cutByEntity.get(command.payload.cutLineEntityId);
        if (!cut)
          return cadBlocked(
            'cad-spread-orphan',
            'Spread requires one earlier active Cut entity before the undo cursor.',
            operationNumber,
            command.commandId,
          );
        if (
          cut.pieceId !== command.target.pieceId ||
          cut.pieceLineKey !== command.target.pieceLineKey
        )
          return cadBlocked(
            'cad-spread-cross-piece',
            'Spread and its Cut dependency must target the same exact piece identity.',
            operationNumber,
            command.commandId,
          );
        dependencies.push(cut.draftId);
      }
      const processKind = commandKind(command.tool)!;
      drafts.push(
        Object.freeze({
          draftOperationId: draftId,
          commandId: command.commandId,
          tool: command.tool,
          transactionId: transaction.transactionId,
          transactionLabel: transaction.label,
          operationRef: operation.authoringOperationId,
          operationNumber: operation.sourceOperationNumber,
          sourceRevision: session.source.revision,
          sourceCatalogCanonicalSha256: session.source.catalog.canonicalSha256,
          sourceSizeSelectionCanonicalSha256: session.source.catalog.sizeSelectionCanonicalSha256,
          order: drafts.length,
          processKind,
          label: `${cadToolLabel(command.tool)} · ${command.target.pieceLineKey}`,
          target: Object.freeze({ ...command.target }),
          entityId: command.payload.entityId,
          dependsOnDraftIds: Object.freeze(dependencies),
          parameters: commandParameters(command),
          apply: Object.freeze({ eligible: false as const }),
        }),
      );
      if (command.tool === 'cut')
        cutByEntity.set(command.payload.entityId, {
          draftId,
          pieceId: command.target.pieceId,
          pieceLineKey: command.target.pieceLineKey,
        });
    }
  }
  return Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_PLAN_V1,
    drafts: Object.freeze(drafts),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_DRAFT_CLAIMS_V1,
  });
}

/**
 * Read-only adapter between the live bounded workbench state and the pure Draft Operations planner.
 * The returned plan is explanatory session state; persistence stays unavailable here by design.
 */
export function buildPatternImportDxfPhaseECadTableDraftOperationSessionV1(
  input: BridgeInput,
): PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 {
  const operationNumber = input.proposal.operation.sourceOperationNumber;
  if (!input.currentOperation)
    return blocked(
      'current-operation-unavailable',
      'The live Assembly Order row is unavailable; the workbench will not invent a second operation owner.',
      operationNumber,
    );
  if (!input.stitch)
    return blocked(
      'stitch-owner-unavailable',
      'The current Assembly Order stitch/thread presentation is unavailable.',
      operationNumber,
    );
  if (!Number.isSafeInteger(input.state.operationStage) || (input.state.operationStage ?? -1) < 0)
    return blocked(
      'operation-stage-required',
      'Choose the Assembly stage on the 2D table before this session Draft Operation can be planned.',
      operationNumber,
    );
  const connections = exactConnections(input);
  if (!connections)
    return blocked(
      'exact-connection-incomplete',
      'Select an explicit adjacent edge on both pieces for every seam, including mapping and direction.',
      operationNumber,
    );

  return planPatternImportDxfPhaseECadTableDraftOperationsV1(input.catalog, [
    {
      processKind: 'connect',
      stage: input.state.operationStage!,
      operation: retainedOperation(input.proposal),
      current: input.currentOperation,
      stitch: input.stitch,
      materials: currentMaterials(input),
      connections,
    },
  ]);
}
