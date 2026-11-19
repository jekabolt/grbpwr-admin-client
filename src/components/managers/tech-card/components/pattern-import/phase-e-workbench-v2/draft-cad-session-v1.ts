import { normalizeAuthoredText } from 'lib/pattern-import/manifest/authored-text';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { DxfProductPhaseDReplayCarrierV1 } from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import type { PtMm } from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_V1 =
  'pattern-import-dxf-phase-e-draft-cad-session/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOLS_V1 = Object.freeze([
  'pen',
  'rectangle',
  'circle',
  'ellipse',
  'add-point',
  'move-point',
  'delete-point',
  'sharpen-corner',
  'edge-length',
  'allowance-offset',
  'internal-line',
  'french-curve',
  'draft-point',
  'guideline',
  'pattern-line',
  'point-only',
  'dart',
  'fish-eye',
  'spread',
  'gather',
  'pleat',
  'cut',
  'notch',
  'mark',
] as const);

export type PatternImportDxfPhaseEDraftCadToolV1 =
  (typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOLS_V1)[number];

/**
 * Tools whose current canvas command has a lossless path through the retained PieceSpec writer.
 * The larger command union remains readable for old/session evidence, but unsupported intents are
 * not advertised as working CAD actions in the production rail.
 */
export const DRAFT_CAD_CROSS_MARK_HALF_SPAN_MM = 3;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1 = Object.freeze([
  'pen',
  'rectangle',
  'circle',
  'ellipse',
  'internal-line',
  'pattern-line',
  'french-curve',
  'guideline',
  'draft-point',
  'point-only',
  'add-point',
  'move-point',
  'delete-point',
  'sharpen-corner',
  'edge-length',
  'allowance-offset',
  'dart',
  'fish-eye',
  'cut',
  'spread',
  'mark',
  'notch',
] as const satisfies readonly PatternImportDxfPhaseEDraftCadToolV1[]);

export function validParallelDisplacementV1(amount: number) {
  return Number.isFinite(amount) && amount !== 0 && Number(amount.toFixed(6)) === amount;
}
export function parallelOpeningAxisV1(points: readonly PtMm[]) {
  const [a, b] = points;
  if (points.length !== 2 || !a || !b) return null;
  return a.x === b.x && a.y !== b.y ? 'x' : a.y === b.y && a.x !== b.x ? 'y' : null;
}

export type PatternImportDxfPhaseEDraftCadTargetV1 = Readonly<
  Pick<
    PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number],
    'pieceId' | 'pieceLineKey'
  >
>;

export type PatternImportDxfPhaseEDraftCadBoundaryAnchorV1 = Readonly<{
  contourId: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number]['contourId'];
  boundaryVertexIds: readonly [string, string];
  progress: number;
}>;

/**
 * Explicit identity/policy envelope for a rectangle that creates a new PieceSpec. Legacy rectangle
 * intents without this envelope remain readable, but cannot enter the productive compile path.
 */
export type PatternImportDxfPhaseEDraftCadRectanglePieceV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  vertexIds: readonly [string, string, string, string];
  displayName: string;
  gradingPolicy: 'ungraded-current-size';
  placementPolicy: 'separate-writer-block';
}>;

export type PatternImportDxfPhaseEDraftCadPenPieceV1 = Readonly<
  Omit<PatternImportDxfPhaseEDraftCadRectanglePieceV1, 'vertexIds'> & {
    vertexIds: readonly string[];
  }
>;

/**
 * Explicit identity and approximation contract for circle/ellipse piece creation. PieceSpec stores
 * closed boundaries as point loops, so curved authoring uses a deterministic bounded polyline and
 * records the requested maximum chord error instead of pretending that the writer owns native arcs.
 */
export type PatternImportDxfPhaseEDraftCadRoundPieceV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  vertexIdPrefix: string;
  displayName: string;
  maxChordErrorMm: number;
  gradingPolicy: 'ungraded-current-size';
  placementPolicy: 'separate-writer-block';
}>;

export type SavedDraftInternalPathBindingV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  sourceSha256: string;
  scopeKey: string;
  sizeToken: string;
  sizeId: number;
  rank: number;
  index: number;
  original: readonly PtMm[];
}>;

export type SavedDraftDartPathBindingV1 = SavedDraftInternalPathBindingV1;
export type SavedDraftFrenchCurveBindingV1 = SavedDraftInternalPathBindingV1 & {
  readonly sourcePathId: number;
};

type Command<Tool extends PatternImportDxfPhaseEDraftCadToolV1, Payload> = Readonly<{
  commandId: string;
  tool: Tool;
  target: PatternImportDxfPhaseEDraftCadTargetV1;
  payload: Readonly<Payload>;
}>;

export type PatternImportDxfPhaseEDraftCadCommandV1 =
  | Command<
      'pen',
      {
        entityId: string;
        pointsMm: readonly PtMm[];
        closed: boolean;
        newPiece?: PatternImportDxfPhaseEDraftCadPenPieceV1;
      }
    >
  | Command<
      'rectangle',
      {
        entityId: string;
        originMm: PtMm;
        widthMm: number;
        heightMm: number;
        rotationDeg: number;
        /** Required for creation; absent only on legacy preview-only rectangle evidence. */
        newPiece?: PatternImportDxfPhaseEDraftCadRectanglePieceV1;
      }
    >
  | Command<
      'circle',
      {
        entityId: string;
        centerMm: PtMm;
        radiusMm: number;
        /** Required for creation; absent only on legacy preview-only circle evidence. */
        newPiece?: PatternImportDxfPhaseEDraftCadRoundPieceV1;
      }
    >
  | Command<
      'ellipse',
      {
        entityId: string;
        centerMm: PtMm;
        radiusXmm: number;
        radiusYmm: number;
        rotationDeg: number;
        /** Required for creation; absent only on legacy preview-only ellipse evidence. */
        newPiece?: PatternImportDxfPhaseEDraftCadRoundPieceV1;
      }
    >
  | Command<
      'add-point',
      {
        entityId: string;
        contourId: string;
        afterVertexId: string;
        pointMm: PtMm;
        /** Exact ordered source edge. Absent only on legacy session evidence and never compiles. */
        edge?: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
      }
    >
  | Command<
      'move-point',
      { entityId: string; contourId: string; vertexId: string; pointMm: PtMm; sizeToken: string }
    >
  | Command<
      'delete-point',
      { entityId: string; contourId: string; vertexId: string; sizeToken: string }
    >
  | Command<
      'sharpen-corner',
      { entityId: string; edge: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1; sizeToken: string }
    >
  | Command<
      'edge-length',
      {
        entityId: string;
        edge: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        fixed: 'start' | 'end';
        lengthMm: number;
        sizeToken: string;
      }
    >
  | Command<
      'allowance-offset',
      {
        entityId: string;
        edge: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        offsetMm: number;
        sizeToken: string;
      }
    >
  | Command<'internal-line', { entityId: string; pointsMm: readonly PtMm[] }>
  | Command<
      'french-curve',
      {
        entityId: string;
        controlPointsMm: readonly PtMm[];
        savedCurve?: SavedDraftFrenchCurveBindingV1;
      }
    >
  | Command<'draft-point', { entityId: string; pointMm: PtMm }>
  | Command<'guideline', { entityId: string; fromMm: PtMm; toMm: PtMm }>
  | Command<'pattern-line', { entityId: string; pointsMm: readonly PtMm[]; closed: boolean }>
  | Command<'point-only', { entityId: string; pointMm: PtMm }>
  | Command<
      'dart',
      {
        entityId: string;
        base: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        savedTip?: SavedDraftDartPathBindingV1;
        savedIntakeSourcePathId?: number;
        apexMm: PtMm;
        intakeMm: number;
      }
    >
  | Command<
      'fish-eye',
      { entityId: string; centerMm: PtMm } & (
        | { axisMm: number; intakeMm: number; rotationDeg: number; savedMove?: never }
        | {
            savedMove: SavedDraftDartPathBindingV1 & { readonly sourcePathId: number };
            axisMm?: never;
            intakeMm?: never;
            rotationDeg?: never;
          }
      )
    >
  | Command<
      'spread',
      {
        entityId: string;
        cutLineEntityId: string;
        amountMm: number;
      } & (
        | { mode?: 'pivot'; pivotMm: PtMm }
        | { mode: 'parallel'; movingSide: 'positive' | 'negative' }
      )
    >
  | Command<
      'gather',
      {
        entityId: string;
        span: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        ratio: number;
      }
    >
  | Command<
      'pleat',
      {
        entityId: string;
        foldFromMm: PtMm;
        foldToMm: PtMm;
        intakeMm: number;
        direction: 'left' | 'right' | 'box';
      }
    >
  | Command<
      'cut',
      { entityId: string; pointsMm: readonly PtMm[]; keepSide: 'left' | 'right' | 'both' }
    >
  | Command<
      'notch',
      {
        entityId: string;
        anchor: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        kind: 'single' | 'double' | 'triple' | 'v';
        depthMm: number;
      }
    >
  | Command<
      'mark',
      { entityId: string; pointMm: PtMm; kind: 'drill' | 'cross' | 'text'; text?: string }
    >;

export type PatternImportDxfPhaseEDraftCadSourceV1 = Readonly<{
  phaseD: Readonly<
    Pick<
      DxfProductPhaseDReplayCarrierV1,
      'sourceFileId' | 'sourceSha256' | 'selectedGeometrySha256'
    >
  >;
  catalog: Readonly<
    Pick<
      PatternImportDxfProductPhaseEAuthoringCatalogV1,
      'canonicalSha256' | 'sizeSelectionCanonicalSha256' | 'pieces'
    >
  >;
  revision: number;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_CLAIMS_V1 = Object.freeze({
  existingPhaseDReplayIdentityRequired: true,
  existingAuthoringCatalogIdentityRequired: true,
  existingImportSemanticsApplyBoundaryReused: true,
  createsCoordinateAuthority: false,
  createsDocumentModel: false,
  createsPersistenceModel: false,
  geometryExecutionIntegrated: false,
  sessionLocalCutExecutorIntegrated: true,
  sessionLocalSpreadExecutorIntegrated: true,
  sessionLocalAddPointExecutorIntegrated: true,
  sessionLocalRectanglePieceExecutorIntegrated: true,
  productiveToolSubsetDeclared: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftCadTransactionV1 = Readonly<{
  transactionId: string;
  label: string;
  status: 'intent-only';
  commands: readonly PatternImportDxfPhaseEDraftCadCommandV1[];
  /** A local handle revision replays in the original command's slot. */
  revisesFrenchCurveCommandId?: string;
}>;

export type PatternImportDxfPhaseEDraftCadBlockerV1 = Readonly<{
  code:
    | 'invalid-source-binding'
    | 'invalid-command'
    | 'target-not-in-source'
    | 'history-at-boundary'
    | 'nothing-to-apply'
    | 'geometry-executor-unavailable';
  detail: string;
}>;

export type PatternImportDxfPhaseEDraftCadApplyEligibilityV1 = Readonly<{
  eligible: false;
  blocker: PatternImportDxfPhaseEDraftCadBlockerV1;
}>;

export type PatternImportDxfPhaseEDraftCadSessionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_V1;
  source: PatternImportDxfPhaseEDraftCadSourceV1;
  history: readonly PatternImportDxfPhaseEDraftCadTransactionV1[];
  cursor: number;
  dirty: boolean;
  apply: PatternImportDxfPhaseEDraftCadApplyEligibilityV1;
}>;

export type PatternImportDxfPhaseEDraftCadSessionResultV1 =
  | Readonly<{ ok: true; session: PatternImportDxfPhaseEDraftCadSessionV1; blocker: null }>
  | Readonly<{
      ok: false;
      session: PatternImportDxfPhaseEDraftCadSessionV1 | null;
      blocker: PatternImportDxfPhaseEDraftCadBlockerV1;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const TOOL_SET = new Set<string>(PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOLS_V1);

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function point(value: unknown): value is PtMm {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PtMm>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function target(value: unknown): value is PatternImportDxfPhaseEDraftCadTargetV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatternImportDxfPhaseEDraftCadTargetV1>;
  return stableId(candidate.pieceId) && stableId(candidate.pieceLineKey);
}

function validSavedInternalPath(value: unknown, pointCount: number, requireSourcePath = false) {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.sourceSha256 === 'string' &&
    SHA256.test(p.sourceSha256) &&
    stableId(p.pieceId) &&
    stableId(p.pieceLineKey) &&
    stableId(p.scopeKey) &&
    stableId(p.sizeToken) &&
    [p.rank, p.index, p.sizeId].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
    ) &&
    (!requireSourcePath ||
      (typeof p.sourcePathId === 'number' &&
        Number.isSafeInteger(p.sourcePathId) &&
        p.sourcePathId >= 0)) &&
    points(p.original, pointCount) &&
    p.original.length === pointCount
  );
}

function boundaryAnchor(value: unknown): value is PatternImportDxfPhaseEDraftCadBoundaryAnchorV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatternImportDxfPhaseEDraftCadBoundaryAnchorV1>;
  return (
    stableId(candidate.contourId) &&
    Array.isArray(candidate.boundaryVertexIds) &&
    candidate.boundaryVertexIds.length === 2 &&
    candidate.boundaryVertexIds.every(stableId) &&
    candidate.boundaryVertexIds[0] !== candidate.boundaryVertexIds[1] &&
    typeof candidate.progress === 'number' &&
    Number.isFinite(candidate.progress) &&
    candidate.progress >= 0 &&
    candidate.progress <= 1
  );
}

function linearPiece(value: unknown, count: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatternImportDxfPhaseEDraftCadPenPieceV1>;
  return (
    stableId(candidate.pieceId) &&
    stableId(candidate.pieceLineKey) &&
    stableId(candidate.contourId) &&
    Array.isArray(candidate.vertexIds) &&
    candidate.vertexIds.length === count &&
    candidate.vertexIds.every(stableId) &&
    new Set(candidate.vertexIds).size === count &&
    typeof candidate.displayName === 'string' &&
    candidate.displayName.trim().length > 0 &&
    candidate.displayName.trim().length <= 256 &&
    candidate.gradingPolicy === 'ungraded-current-size' &&
    candidate.placementPolicy === 'separate-writer-block'
  );
}

function roundPiece(value: unknown): value is PatternImportDxfPhaseEDraftCadRoundPieceV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatternImportDxfPhaseEDraftCadRoundPieceV1>;
  return (
    stableId(candidate.pieceId) &&
    stableId(candidate.pieceLineKey) &&
    stableId(candidate.contourId) &&
    stableId(candidate.vertexIdPrefix) &&
    typeof candidate.displayName === 'string' &&
    candidate.displayName.trim().length > 0 &&
    candidate.displayName.trim().length <= 256 &&
    typeof candidate.maxChordErrorMm === 'number' &&
    Number.isFinite(candidate.maxChordErrorMm) &&
    candidate.maxChordErrorMm >= 0.02 &&
    candidate.maxChordErrorMm <= 0.25 &&
    candidate.gradingPolicy === 'ungraded-current-size' &&
    candidate.placementPolicy === 'separate-writer-block'
  );
}

function points(value: unknown, minimum: number): value is readonly PtMm[] {
  return Array.isArray(value) && value.length >= minimum && value.every(point);
}

function commonCommand(value: unknown): value is PatternImportDxfPhaseEDraftCadCommandV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatternImportDxfPhaseEDraftCadCommandV1>;
  return (
    stableId(candidate.commandId) &&
    typeof candidate.tool === 'string' &&
    TOOL_SET.has(candidate.tool) &&
    target(candidate.target) &&
    !!candidate.payload &&
    typeof candidate.payload === 'object' &&
    !Array.isArray(candidate.payload)
  );
}

function validCommand(value: unknown): value is PatternImportDxfPhaseEDraftCadCommandV1 {
  if (!commonCommand(value)) return false;
  const payload = value.payload as Record<string, unknown>;
  if (!stableId(payload.entityId)) return false;
  switch (value.tool) {
    case 'pen':
      return (
        points(payload.pointsMm, 2) &&
        typeof payload.closed === 'boolean' &&
        (payload.newPiece === undefined ||
          (payload.closed &&
            payload.pointsMm.length >= 3 &&
            payload.pointsMm.length <= 256 &&
            linearPiece(payload.newPiece, payload.pointsMm.length)))
      );
    case 'pattern-line':
      return points(payload.pointsMm, 2) && typeof payload.closed === 'boolean';
    case 'rectangle':
      return (
        point(payload.originMm) &&
        finitePositive(payload.widthMm) &&
        finitePositive(payload.heightMm) &&
        Number.isFinite(payload.rotationDeg) &&
        (payload.newPiece === undefined || linearPiece(payload.newPiece, 4))
      );
    case 'circle':
      return (
        point(payload.centerMm) &&
        finitePositive(payload.radiusMm) &&
        (payload.newPiece === undefined || roundPiece(payload.newPiece))
      );
    case 'ellipse':
      return (
        point(payload.centerMm) &&
        finitePositive(payload.radiusXmm) &&
        finitePositive(payload.radiusYmm) &&
        Number.isFinite(payload.rotationDeg) &&
        (payload.newPiece === undefined || roundPiece(payload.newPiece))
      );
    case 'add-point':
      return (
        stableId(payload.contourId) &&
        stableId(payload.afterVertexId) &&
        point(payload.pointMm) &&
        (payload.edge === undefined ||
          (boundaryAnchor(payload.edge) &&
            (payload.edge as PatternImportDxfPhaseEDraftCadBoundaryAnchorV1).contourId ===
              payload.contourId &&
            (payload.edge as PatternImportDxfPhaseEDraftCadBoundaryAnchorV1)
              .boundaryVertexIds[0] === payload.afterVertexId))
      );
    case 'move-point':
    case 'delete-point':
      return (
        stableId(payload.contourId) &&
        stableId(payload.vertexId) &&
        (value.tool === 'delete-point' || point(payload.pointMm)) &&
        stableId(payload.sizeToken)
      );
    case 'sharpen-corner':
      return boundaryAnchor(payload.edge) && stableId(payload.sizeToken);
    case 'edge-length':
      return (
        boundaryAnchor(payload.edge) &&
        (payload.fixed === 'start' || payload.fixed === 'end') &&
        finitePositive(payload.lengthMm) &&
        stableId(payload.sizeToken)
      );
    case 'allowance-offset':
      return (
        boundaryAnchor(payload.edge) &&
        typeof payload.offsetMm === 'number' &&
        validParallelDisplacementV1(payload.offsetMm) &&
        stableId(payload.sizeToken)
      );
    case 'internal-line':
      return points(payload.pointsMm, 2);
    case 'french-curve':
      return (
        points(payload.controlPointsMm, 3) &&
        (payload.savedCurve === undefined ||
          (payload.controlPointsMm.length === 3 &&
            validSavedInternalPath(payload.savedCurve, 3, true)))
      );
    case 'draft-point':
    case 'point-only':
      return point(payload.pointMm);
    case 'guideline':
      return point(payload.fromMm) && point(payload.toMm);
    case 'dart':
      return (
        boundaryAnchor(payload.base) &&
        point(payload.apexMm) &&
        finitePositive(payload.intakeMm) &&
        (payload.savedTip === undefined || validSavedInternalPath(payload.savedTip, 3)) &&
        (payload.savedIntakeSourcePathId === undefined ||
          (payload.savedTip !== undefined &&
            typeof payload.savedIntakeSourcePathId === 'number' &&
            Number.isSafeInteger(payload.savedIntakeSourcePathId) &&
            payload.savedIntakeSourcePathId >= 0))
      );
    case 'fish-eye':
      return (
        point(payload.centerMm) &&
        (payload.savedMove !== undefined
          ? validSavedInternalPath(payload.savedMove, 4, true) &&
            payload.axisMm === undefined &&
            payload.intakeMm === undefined &&
            payload.rotationDeg === undefined
          : finitePositive(payload.axisMm) &&
            finitePositive(payload.intakeMm) &&
            Number.isFinite(payload.rotationDeg))
      );
    case 'spread':
      return (
        (payload.mode === 'parallel'
          ? payload.pivotMm === undefined &&
            (payload.movingSide === 'positive' || payload.movingSide === 'negative')
          : (payload.mode === undefined || payload.mode === 'pivot') && point(payload.pivotMm)) &&
        stableId(payload.cutLineEntityId) &&
        finitePositive(payload.amountMm)
      );
    case 'gather':
      return boundaryAnchor(payload.span) && finitePositive(payload.ratio);
    case 'pleat':
      return (
        point(payload.foldFromMm) &&
        point(payload.foldToMm) &&
        finitePositive(payload.intakeMm) &&
        (payload.direction === 'left' ||
          payload.direction === 'right' ||
          payload.direction === 'box')
      );
    case 'cut':
      return (
        points(payload.pointsMm, 2) &&
        (payload.keepSide === 'left' || payload.keepSide === 'right' || payload.keepSide === 'both')
      );
    case 'notch':
      return (
        boundaryAnchor(payload.anchor) &&
        (payload.kind === 'single' ||
          payload.kind === 'double' ||
          payload.kind === 'triple' ||
          payload.kind === 'v') &&
        finitePositive(payload.depthMm)
      );
    case 'mark':
      return (
        point(payload.pointMm) &&
        (payload.kind === 'drill' || payload.kind === 'cross' || payload.kind === 'text') &&
        (payload.text === undefined ||
          (payload.kind === 'text' &&
            typeof payload.text === 'string' &&
            normalizeAuthoredText(payload.text) === payload.text))
      );
  }
}

function blocker(
  code: PatternImportDxfPhaseEDraftCadBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEDraftCadBlockerV1 {
  return Object.freeze({ code, detail });
}

function eligibility(cursor: number): PatternImportDxfPhaseEDraftCadApplyEligibilityV1 {
  return Object.freeze({
    eligible: false,
    blocker:
      cursor === 0
        ? blocker('nothing-to-apply', 'The Draft CAD session has no active command transaction.')
        : blocker(
            'geometry-executor-unavailable',
            'Draft CAD command intents are recorded, but no verified geometry executor is attached.',
          ),
  });
}

const recordedSessions = new WeakSet<object>();

/** A structural copy cannot authorize an authored-geometry review. */
export function isRecordedDraftCadSessionV1(
  value: PatternImportDxfPhaseEDraftCadSessionV1,
): boolean {
  return recordedSessions.has(value);
}

function session(
  source: PatternImportDxfPhaseEDraftCadSourceV1,
  history: readonly PatternImportDxfPhaseEDraftCadTransactionV1[],
  cursor: number,
  parent?: PatternImportDxfPhaseEDraftCadSessionV1,
): PatternImportDxfPhaseEDraftCadSessionV1 {
  const next: PatternImportDxfPhaseEDraftCadSessionV1 = deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SESSION_V1,
    source,
    history,
    cursor,
    dirty: cursor > 0,
    apply: eligibility(cursor),
  });
  if (!parent || recordedSessions.has(parent)) recordedSessions.add(next);
  return next;
}

export function createPatternImportDxfPhaseEDraftCadSessionV1(
  source: PatternImportDxfPhaseEDraftCadSourceV1,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  const valid =
    stableId(source?.phaseD?.sourceFileId) &&
    SHA256.test(source?.phaseD?.sourceSha256 ?? '') &&
    SHA256.test(source?.phaseD?.selectedGeometrySha256 ?? '') &&
    SHA256.test(source?.catalog?.canonicalSha256 ?? '') &&
    SHA256.test(source?.catalog?.sizeSelectionCanonicalSha256 ?? '') &&
    Number.isSafeInteger(source?.revision) &&
    source.revision >= 0 &&
    Array.isArray(source?.catalog?.pieces) &&
    source.catalog.pieces.length > 0 &&
    source.catalog.pieces.every(target) &&
    new Set(source.catalog.pieces.map(({ pieceId }) => pieceId)).size ===
      source.catalog.pieces.length;
  if (!valid)
    return Object.freeze({
      ok: false,
      session: null,
      blocker: blocker(
        'invalid-source-binding',
        'Draft CAD requires existing Phase-D replay and authoring-catalog hashes, a revision and unique piece bindings.',
      ),
    });
  return Object.freeze({
    ok: true,
    session: session(deepFreeze(structuredClone(source)), Object.freeze([]), 0),
    blocker: null,
  });
}

export function draftCadNewPieceObjectKeyV1(commandId: string) {
  return `draft:${commandId}`;
}

export function listActiveDraftCadNewPiecesV1(session: PatternImportDxfPhaseEDraftCadSessionV1) {
  return session.history.slice(0, session.cursor).flatMap(({ commands }) =>
    commands.flatMap((command) => {
      if (
        (command.tool === 'pen' ||
          command.tool === 'rectangle' ||
          command.tool === 'circle' ||
          command.tool === 'ellipse') &&
        command.payload.newPiece
      )
        return [{ commandId: command.commandId, ...command.payload.newPiece }];
      return [];
    }),
  );
}

export type DraftCadFrenchCurveHandleV1 = 0 | 1 | 2;

export function activeDraftCadTransactionsV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
): readonly PatternImportDxfPhaseEDraftCadTransactionV1[] {
  const active = current.history.slice(0, current.cursor);
  if (!recordedSessions.has(current)) return active;

  const revisions = new Map<string, PatternImportDxfPhaseEDraftCadCommandV1>();
  for (const tx of active)
    if (tx.revisesFrenchCurveCommandId)
      revisions.set(tx.revisesFrenchCurveCommandId, tx.commands[0]);
  if (!revisions.size) return active;

  return active.flatMap((tx) =>
    tx.revisesFrenchCurveCommandId
      ? []
      : [
          {
            ...tx,
            commands: tx.commands.map((command) => revisions.get(command.commandId) ?? command),
          },
        ],
  );
}

export function recordDraftCadFrenchCurveHandleV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
  input: Readonly<{
    transactionId: string;
    commandId: string;
    target: PatternImportDxfPhaseEDraftCadTargetV1;
    handle: DraftCadFrenchCurveHandleV1;
    expected: readonly PtMm[];
    pointMm: PtMm;
  }>,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  const refuse = (detail: string) =>
    Object.freeze({
      ok: false as const,
      session: current,
      blocker: blocker('invalid-command', detail),
    });
  const active = current.history.slice(0, current.cursor);
  if (
    !recordedSessions.has(current) ||
    !stableId(input.transactionId) ||
    active.some(({ transactionId }) => transactionId === input.transactionId) ||
    ![0, 1, 2].includes(input.handle) ||
    !target(input.target) ||
    !point(input.pointMm) ||
    !points(input.expected, 3) ||
    input.expected.length !== 3
  )
    return refuse('Move a curve handle in the current recorded Draft.');

  const matching = activeDraftCadTransactionsV1(current)
    .flatMap(({ commands }) => commands)
    .filter(({ commandId }) => commandId === input.commandId);
  const [curve] = matching;
  if (
    matching.length !== 1 ||
    curve.tool !== 'french-curve' ||
    curve.target.pieceId !== input.target.pieceId ||
    curve.target.pieceLineKey !== input.target.pieceLineKey ||
    curve.payload.controlPointsMm.length !== 3 ||
    !curve.payload.controlPointsMm.every(
      ({ x, y }, index) => x === input.expected[index].x && y === input.expected[index].y,
    )
  )
    return refuse('The active French curve or its control points changed.');

  const controlPointsMm = curve.payload.controlPointsMm.map((original, index) =>
    index === input.handle ? { ...input.pointMm } : original,
  );
  const original = curve.payload.controlPointsMm[input.handle];
  if (original.x === input.pointMm.x && original.y === input.pointMm.y)
    return Object.freeze({ ok: true, session: current, blocker: null });
  if (controlPointsMm.every(({ x, y }) => x === controlPointsMm[0].x && y === controlPointsMm[0].y))
    return refuse('French curve control points must span a nonzero path.');

  const revision = deepFreeze({
    transactionId: input.transactionId,
    label: 'Move French curve handle',
    status: 'intent-only' as const,
    revisesFrenchCurveCommandId: curve.commandId,
    commands: [{ ...curve, payload: { ...curve.payload, controlPointsMm } }],
  });
  const next = session(
    current.source,
    Object.freeze([...active, revision]),
    active.length + 1,
    current,
  );
  return Object.freeze({ ok: true, session: next, blocker: null });
}

export function permitsDraftCadLocalPieceEditV1(
  tool: PatternImportDxfPhaseEDraftCadToolV1,
): boolean {
  return tool === 'mark' || tool === 'draft-point' || tool === 'point-only';
}

export function recordPatternImportDxfPhaseEDraftCadTransactionV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
  input: Readonly<{
    transactionId: string;
    label: string;
    commands: readonly PatternImportDxfPhaseEDraftCadCommandV1[];
  }>,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  if (
    !stableId(input.transactionId) ||
    !input.label.trim() ||
    !input.commands.length ||
    !input.commands.every(validCommand) ||
    new Set(input.commands.map(({ commandId }) => commandId)).size !== input.commands.length
  )
    return Object.freeze({
      ok: false,
      session: current,
      blocker: blocker(
        'invalid-command',
        'Draft CAD transaction commands must be complete, finite and uniquely identified.',
      ),
    });
  const pieces = new Set(
    current.source.catalog.pieces.map(
      ({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`,
    ),
  );
  const localPieces = new Set(
    listActiveDraftCadNewPiecesV1(current).map(
      ({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`,
    ),
  );
  if (
    input.commands.some(({ target: { pieceId, pieceLineKey }, tool }) => {
      const key = `${pieceId}\u0000${pieceLineKey}`;
      return !pieces.has(key) && !(permitsDraftCadLocalPieceEditV1(tool) && localPieces.has(key));
    })
  )
    return Object.freeze({
      ok: false,
      session: current,
      blocker: blocker(
        'target-not-in-source',
        'A Draft CAD command targets a piece outside the bound source topology.',
      ),
    });
  const transaction = deepFreeze({
    transactionId: input.transactionId,
    label: input.label.trim(),
    status: 'intent-only' as const,
    commands: structuredClone(input.commands),
  });
  const active = current.history.slice(0, current.cursor);
  const next = session(
    current.source,
    Object.freeze([...active, transaction]),
    active.length + 1,
    current,
  );
  return Object.freeze({ ok: true, session: next, blocker: null });
}

export function undoPatternImportDxfPhaseEDraftCadSessionV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  if (current.cursor === 0)
    return Object.freeze({
      ok: false,
      session: current,
      blocker: blocker('history-at-boundary', 'Draft CAD history is already at its source state.'),
    });
  return Object.freeze({
    ok: true,
    session: session(current.source, current.history, current.cursor - 1, current),
    blocker: null,
  });
}

export function redoPatternImportDxfPhaseEDraftCadSessionV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  if (current.cursor >= current.history.length)
    return Object.freeze({
      ok: false,
      session: current,
      blocker: blocker('history-at-boundary', 'Draft CAD history has no transaction to redo.'),
    });
  return Object.freeze({
    ok: true,
    session: session(current.source, current.history, current.cursor + 1, current),
    blocker: null,
  });
}

/** Explicit fail-closed execution seam until a verified geometry engine is integrated. */
export function executePatternImportDxfPhaseEDraftCadSessionV1(
  current: PatternImportDxfPhaseEDraftCadSessionV1,
): PatternImportDxfPhaseEDraftCadSessionResultV1 {
  return Object.freeze({
    ok: false,
    session: current,
    blocker:
      current.cursor === 0
        ? blocker('nothing-to-apply', 'The Draft CAD session has no active command transaction.')
        : blocker(
            'geometry-executor-unavailable',
            'Draft CAD execution is unavailable until a verified geometry executor can return through the existing import/semantics/Phase-D apply boundary.',
          ),
  });
}
