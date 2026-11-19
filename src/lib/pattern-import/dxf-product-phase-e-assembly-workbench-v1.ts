import type {
  DxfAssemblyOperationV1,
  DxfMaterialAssignmentV1,
} from '../cloth/domain/dxf-assembly-handoff-v1';
import {
  isPreparedPatternImportDxfProductPhaseEAuthoringCatalogV1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from '../cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CHOICES_V1,
  type PatternImportDxfProductPhaseEAuthoringChoicesV1,
} from '../cloth/domain/pattern-import-dxf-product-phase-e-authoring-producer-v1';
import {
  DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1,
  type DxfProductPhaseDSizeSelectionResultV1,
} from './dxf-product-phase-d-size-selection-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROPOSAL_V1 =
  'pattern-import-dxf-product-phase-e-assembly-proposal/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1 =
  'pattern-import-dxf-product-phase-e-assembly-projection/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_WORKBENCH_STATE_V1 =
  'pattern-import-dxf-product-phase-e-assembly-workbench-state/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_DERIVED_OPERATION_ID_PREFIX_V1 =
  'phase-e-v1:seam:' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

type DxfProductPhaseDSizeSelectionSuccessV1 = Extract<
  DxfProductPhaseDSizeSelectionResultV1,
  { ok: true }
>;

export type PatternImportDxfProductPhaseEExistingAssemblyOperationV1 = Readonly<{
  /** Persisted authoring identity when available; operation numbers are never an ID fallback. */
  authoringOperationId: string | null;
  number: number;
  work: string;
  /** Explicit adapter admission from an authoritative work token; never inferred from free text. */
  phaseEKind: 'stitch' | null;
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
  seamKeys: readonly string[];
}>;

export type PatternImportDxfProductPhaseEExistingAssemblyAnchorV1 = Readonly<{
  pieceLineKey: string;
  edgeHint: string;
  range: readonly [from: number, to: number];
  lenMm: number;
  contourSig: string;
}>;

export type PatternImportDxfProductPhaseEExistingAssemblySeamV1 = Readonly<{
  seamKey: string;
  confirmed: boolean;
  stale: boolean;
  kind: 'edge' | 'partial' | 'composite' | 'surface' | 'closure';
  direction: 'reversed' | 'same' | 'unknown';
  anchoredSize: string;
  sideA: readonly PatternImportDxfProductPhaseEExistingAssemblyAnchorV1[];
  sideB: readonly PatternImportDxfProductPhaseEExistingAssemblyAnchorV1[];
}>;

/**
 * Deliberately narrower than the card form. The integration adapter must copy these fields from
 * the existing operation/seam owners; the workbench never reconstructs them from display words.
 */
export type PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1 = Readonly<{
  operations: readonly PatternImportDxfProductPhaseEExistingAssemblyOperationV1[];
  seams: readonly PatternImportDxfProductPhaseEExistingAssemblySeamV1[];
  selectedSeamKey: string;
}>;

export type PatternImportDxfProductPhaseEAssemblyProposalV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROPOSAL_V1;
  status: 'proposal-not-authority';
  expectedCatalogCanonicalSha256: string;
  seam: Readonly<{
    id: string;
    kind: PatternImportDxfProductPhaseEExistingAssemblySeamV1['kind'];
    anchoredSize: string;
    sourceDirection: PatternImportDxfProductPhaseEExistingAssemblySeamV1['direction'];
  }>;
  operation: Readonly<{
    /** Persisted identity or the strict single-seam V1 projection; never the operation number. */
    authoringOperationId: string | null;
    /** Exact Assembly Order display/selection authority copied from the saved tech card. */
    sourceOperationNumber: number;
    /** Local Phase-E graph order. V1 emits one operation, so downstream requires zero. */
    order: number;
    work: string;
    inputKeys: readonly string[];
    outputUnitKey: string;
    outputUnitName: string;
    kind: 'stitch';
  }>;
  sides: readonly [
    Readonly<{
      pieceId: string;
      pieceLineKey: string;
      sourceSide: 'A';
      suggestedDirection: 'forward';
      evidence: PatternImportDxfProductPhaseEExistingAssemblyAnchorV1;
    }>,
    Readonly<{
      pieceId: string;
      pieceLineKey: string;
      sourceSide: 'B';
      suggestedDirection: 'forward' | 'reverse' | null;
      evidence: PatternImportDxfProductPhaseEExistingAssemblyAnchorV1;
    }>,
  ];
  deterministicFingerprint: string;
}>;

export type PatternImportDxfProductPhaseEAssemblyProposalBlockerCodeV1 =
  | 'catalog-scope-invalid'
  | 'selected-seam-missing'
  | 'selected-seam-not-current'
  | 'selected-seam-shape-unsupported'
  | 'seam-cardinality-unsupported'
  | 'operation-owner-ambiguous'
  | 'operation-contract-invalid'
  | 'operation-kind-unconfirmed'
  | 'operation-authoring-id-invalid'
  | 'operation-authoring-id-collision'
  | 'piece-line-binding-mismatch';

export type PatternImportDxfProductPhaseEAssemblyProposalResultV1 =
  | Readonly<{
      ok: true;
      proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      proposal: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductPhaseEAssemblyProposalBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export type PatternImportDxfProductPhaseEAssemblyProjectionVertexV1 = Readonly<{
  ordinal: number;
  vertexId: string;
  normalizedArc: number;
  /** Exact detached Phase-D replay coordinate. No snap, rounding or placement is applied. */
  pointMm: Readonly<{ x: number; y: number }>;
}>;

export type PatternImportDxfProductPhaseEAssemblyProjectionContourV1 = Readonly<{
  contourId: string;
  role: 'sewing-boundary' | 'cut-boundary' | 'hole';
  closed: boolean;
  vertices: readonly PatternImportDxfProductPhaseEAssemblyProjectionVertexV1[];
}>;

export type PatternImportDxfProductPhaseEAssemblyProjectionPieceV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contours: readonly PatternImportDxfProductPhaseEAssemblyProjectionContourV1[];
  cameraMm: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    padding: number;
  }>;
}>;

export type PatternImportDxfProductPhaseEAssemblyProjectionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1;
  expectedCatalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  sourceFileId: string;
  sizeToken: string;
  joinMode: 'catalog-ordinal-to-phase-d-point';
  pieces: readonly PatternImportDxfProductPhaseEAssemblyProjectionPieceV1[];
  geometryPlacementApplied: false;
}>;

type PreparedPieceOrder = Readonly<{
  scopeKey: string;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  ordinals: ReadonlyMap<PatternImportDxfProductPhaseEAssemblyProjectionPieceV1, number>;
}>;

const preparedOrderByPiece = new WeakMap<
  PatternImportDxfProductPhaseEAssemblyProjectionPieceV1,
  PreparedPieceOrder
>();

/**
 * Return the original catalog ordinal for each piece in the current view order. A view may
 * reorder the prepared piece records; the complete set and source bindings must still match.
 */
export function readPatternImportDxfProductPhaseEPreparedPieceOrdinalsV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  scopeKey: string,
): readonly number[] | null {
  const firstPiece = projection.pieces[0];
  const prepared = firstPiece && preparedOrderByPiece.get(firstPiece);
  if (!prepared || prepared.scopeKey !== scopeKey) return null;
  const original = prepared.projection;
  if (
    projection.schemaVersion !== original.schemaVersion ||
    projection.sourceFileId !== original.sourceFileId ||
    projection.expectedCatalogCanonicalSha256 !== original.expectedCatalogCanonicalSha256 ||
    projection.sizeSelectionCanonicalSha256 !== original.sizeSelectionCanonicalSha256 ||
    projection.sizeToken !== original.sizeToken ||
    projection.joinMode !== original.joinMode ||
    projection.geometryPlacementApplied !== original.geometryPlacementApplied ||
    projection.pieces.length !== prepared.ordinals.size
  )
    return null;
  const ordinals: number[] = [];
  const seen = new Set<number>();
  for (const piece of projection.pieces) {
    const ordinal = prepared.ordinals.get(piece);
    if (ordinal === undefined || seen.has(ordinal)) return null;
    seen.add(ordinal);
    ordinals.push(ordinal);
  }
  return Object.freeze(ordinals);
}

export type PatternImportDxfProductPhaseEAssemblyProjectionBlockerCodeV1 =
  | 'catalog-invalid'
  | 'phase-d-selection-binding-mismatch'
  | 'contour-coverage-mismatch'
  | 'boundary-identity-invalid'
  | 'replay-coordinate-invalid';

export type PatternImportDxfProductPhaseEAssemblyProjectionResultV1 =
  | Readonly<{
      ok: true;
      projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      projection: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductPhaseEAssemblyProjectionBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export type PatternImportDxfProductPhaseEMaterialRevisionOptionV1 = Readonly<{
  id: string;
  label: string;
  materialRevision: string;
}>;

type WorkbenchSideState = Readonly<{
  pieceId: string;
  contourId: string | null;
  startBoundaryVertexId: string | null;
  endBoundaryVertexId: string | null;
  direction: 'forward' | 'reverse' | null;
  confirmed: boolean;
}>;

export type PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_WORKBENCH_STATE_V1;
  expectedCatalogCanonicalSha256: string;
  expectedProposalFingerprint: string;
  expectedImportGeneration: number;
  documentId: string;
  revision: string;
  /** Host-derived exact values. Editing either display field invalidates the binding at submit. */
  expectedDocumentId: string;
  expectedRevision: string;
  documentRevisionConfirmed: boolean;
  physicalSurface:
    | Readonly<{ mode: 'sewing-surface'; seamAllowancePhysical: false }>
    | Readonly<{ mode: 'cut-surface'; seamAllowancePhysical: true }>
    | null;
  physicalSurfaceConfirmed: boolean;
  operationStage: number | null;
  operationConfirmed: boolean;
  sides: readonly [WorkbenchSideState, WorkbenchSideState];
  materialSelections: readonly [
    Readonly<{ pieceId: string; optionId: string | null; confirmed: boolean }>,
    Readonly<{ pieceId: string; optionId: string | null; confirmed: boolean }>,
  ];
  tolerance: Readonly<{
    endpointMm: number | null;
    fullLengthMm: number | null;
    fullLengthRelative: number | null;
    confirmed: boolean;
  }>;
}>;

export type PatternImportDxfProductPhaseEAssemblyChoicesBlockerCodeV1 =
  | 'state-binding-mismatch'
  | 'operation-authoring-id-unavailable'
  | 'document-revision-unconfirmed'
  | 'document-revision-binding-mismatch'
  | 'physical-surface-unconfirmed'
  | 'operation-unconfirmed'
  | 'side-choice-unconfirmed'
  | 'side-choice-invalid'
  | 'native-contained-range-not-supported'
  | 'material-choice-unconfirmed'
  | 'material-choice-invalid'
  | 'tolerance-unconfirmed'
  | 'tolerance-invalid';

export type PatternImportDxfProductPhaseEAssemblyChoicesResultV1 =
  | Readonly<{
      ok: true;
      choices: PatternImportDxfProductPhaseEAuthoringChoicesV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      choices: null;
      blockers: readonly Readonly<{
        code: PatternImportDxfProductPhaseEAssemblyChoicesBlockerCodeV1;
        detail: string;
      }>[];
    }>;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function proposalFingerprint(proposal: PatternImportDxfProductPhaseEAssemblyProposalV1): string {
  const unsigned = { ...proposal, deterministicFingerprint: undefined };
  return `pidpeapv1-fnv1a64:${fnv1a64(JSON.stringify(unsigned))}`;
}

function derivedOperationIdForSingleSeamV1(seamKey: string): string {
  return `${PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_DERIVED_OPERATION_ID_PREFIX_V1}${seamKey}`;
}

function sameContourGeometry(
  left: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number]['geometry'],
  right: DxfProductPhaseDSizeSelectionSuccessV1['phaseD']['contours'][number]['geometry'],
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind !== 'cut-loop' || (right.kind === 'cut-loop' && left.index === right.index))
  );
}

function proposalBlocked(
  code: PatternImportDxfProductPhaseEAssemblyProposalBlockerCodeV1,
  detail: string,
): PatternImportDxfProductPhaseEAssemblyProposalResultV1 {
  return deepFreeze({ ok: false as const, proposal: null, blockers: [{ code, detail }] as const });
}

function projectionBlocked(
  code: PatternImportDxfProductPhaseEAssemblyProjectionBlockerCodeV1,
  detail: string,
): PatternImportDxfProductPhaseEAssemblyProjectionResultV1 {
  return deepFreeze({
    ok: false as const,
    projection: null,
    blockers: [{ code, detail }] as const,
  });
}

function finiteRange(range: readonly [number, number]): range is readonly [number, number] {
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[0] >= 0 &&
    range[1] <= 1 &&
    range[0] < range[1]
  );
}

function validAnchor(anchor: PatternImportDxfProductPhaseEExistingAssemblyAnchorV1): boolean {
  return (
    !!anchor &&
    STABLE_ID.test(anchor.pieceLineKey ?? '') &&
    !!anchor.edgeHint &&
    finiteRange(anchor.range) &&
    Number.isFinite(anchor.lenMm) &&
    anchor.lenMm > 0 &&
    !!anchor.contourSig
  );
}

/**
 * Selects one exact existing seam by key. Existing rows may propose geometry, but never become
 * Phase-E authority: the returned record is intentionally marked `proposal-not-authority`.
 */
export function proposePatternImportDxfProductPhaseEAssemblyV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  input: PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1,
): PatternImportDxfProductPhaseEAssemblyProposalResultV1 {
  if (
    catalog?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    catalog.pieces.length !== 2 ||
    new Set(catalog.pieces.map(({ pieceId }) => pieceId)).size !== 2 ||
    new Set(catalog.pieces.map(({ pieceLineKey }) => pieceLineKey)).size !== 2
  )
    return proposalBlocked(
      'catalog-scope-invalid',
      'The V1 proposal requires one sealed catalog with exactly two distinct pieces.',
    );
  if (!input || !STABLE_ID.test(input.selectedSeamKey ?? ''))
    return proposalBlocked('selected-seam-missing', 'An existing seam key must be selected.');
  const seams = input.seams.filter(({ seamKey }) => seamKey === input.selectedSeamKey);
  if (seams.length !== 1)
    return proposalBlocked(
      'selected-seam-missing',
      'The selected seam key must resolve to exactly one existing row.',
    );
  const seam = seams[0];
  if (!seam.confirmed || seam.stale)
    return proposalBlocked(
      'selected-seam-not-current',
      'Only a confirmed, non-stale existing seam may seed a proposal.',
    );
  if (
    seam.anchoredSize !== catalog.sizeToken ||
    seam.sideA.length !== 1 ||
    seam.sideB.length !== 1 ||
    !validAnchor(seam.sideA[0]) ||
    !validAnchor(seam.sideB[0]) ||
    seam.sideA[0].pieceLineKey === seam.sideB[0].pieceLineKey
  )
    return proposalBlocked(
      'selected-seam-shape-unsupported',
      'V1 requires one current anchor on each distinct side at the catalog size.',
    );
  if (input.operations.some(({ seamKeys }) => !Array.isArray(seamKeys)))
    return proposalBlocked(
      'operation-contract-invalid',
      'Every existing operation must expose its exact persisted seam links.',
    );
  const operationIds = input.operations.map(({ authoringOperationId }) => authoringOperationId);
  if (operationIds.some((id) => id !== null && !STABLE_ID.test(id ?? '')))
    return proposalBlocked(
      'operation-authoring-id-invalid',
      'Every present authoring operation identity must be an explicit stable persisted ID.',
    );
  const persistedOperationIds = operationIds.filter((id): id is string => id !== null);
  if (new Set(persistedOperationIds).size !== persistedOperationIds.length)
    return proposalBlocked(
      'operation-authoring-id-collision',
      'Persisted authoring operation identities must be unique across the existing operation list.',
    );
  const owners = input.operations.filter(
    ({ seamKeys }) => seamKeys.filter((seamKey) => seamKey === seam.seamKey).length === 1,
  );
  if (owners.length !== 1)
    return proposalBlocked(
      'operation-owner-ambiguous',
      'The selected seam must belong to exactly one existing operation.',
    );
  const operation = owners[0];
  if (
    operation.seamKeys.length !== 1 ||
    operation.seamKeys.filter((seamKey) => seamKey === seam.seamKey).length !== 1
  )
    return proposalBlocked(
      'seam-cardinality-unsupported',
      'The V1 derived identity policy requires the selected seam to be its owner operation’s sole seam.',
    );
  if (operation.phaseEKind !== 'stitch')
    return proposalBlocked(
      'operation-kind-unconfirmed',
      'The selected operation work token must be explicitly admitted as a structural stitch operation.',
    );
  if (
    !Number.isSafeInteger(operation.number) ||
    operation.number < 0 ||
    !operation.work ||
    !Array.isArray(operation.inputKeys) ||
    !Array.isArray(operation.seamKeys)
  )
    return proposalBlocked(
      'operation-contract-invalid',
      'The existing operation number, work token, inputs and seam links must be explicit.',
    );
  const derivedAuthoringOperationId = derivedOperationIdForSingleSeamV1(seam.seamKey);
  if (
    operation.authoringOperationId?.startsWith(
      PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_DERIVED_OPERATION_ID_PREFIX_V1,
    ) &&
    operation.authoringOperationId !== derivedAuthoringOperationId
  )
    return proposalBlocked(
      'operation-authoring-id-invalid',
      'An explicit ID in the Phase-E V1 namespace must exact-match the selected seam key.',
    );
  if (
    operation.authoringOperationId === null &&
    persistedOperationIds.includes(derivedAuthoringOperationId)
  )
    return proposalBlocked(
      'operation-authoring-id-collision',
      'The V1 seam-derived operation identity collides with an explicit persisted operation ID.',
    );
  const authoringOperationId = operation.authoringOperationId ?? derivedAuthoringOperationId;
  const pieces = [seam.sideA[0], seam.sideB[0]].map((anchor) =>
    catalog.pieces.filter(({ pieceLineKey }) => pieceLineKey === anchor.pieceLineKey),
  );
  if (pieces.some((matches) => matches.length !== 1) || pieces[0][0] === pieces[1][0])
    return proposalBlocked(
      'piece-line-binding-mismatch',
      'Both existing anchor line keys must exact-match the two distinct catalog pieces.',
    );

  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROPOSAL_V1,
    status: 'proposal-not-authority' as const,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    seam: {
      id: seam.seamKey,
      kind: seam.kind,
      anchoredSize: seam.anchoredSize,
      sourceDirection: seam.direction,
    },
    operation: {
      authoringOperationId,
      sourceOperationNumber: operation.number,
      order: 0,
      work: operation.work,
      inputKeys: [...operation.inputKeys],
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      kind: operation.phaseEKind,
    },
    sides: [
      {
        pieceId: pieces[0][0].pieceId,
        pieceLineKey: pieces[0][0].pieceLineKey,
        sourceSide: 'A' as const,
        suggestedDirection: 'forward' as const,
        evidence: {
          ...seam.sideA[0],
          range: [seam.sideA[0].range[0], seam.sideA[0].range[1]] as const,
        },
      },
      {
        pieceId: pieces[1][0].pieceId,
        pieceLineKey: pieces[1][0].pieceLineKey,
        sourceSide: 'B' as const,
        suggestedDirection:
          seam.direction === 'reversed'
            ? ('reverse' as const)
            : seam.direction === 'same'
              ? ('forward' as const)
              : null,
        evidence: {
          ...seam.sideB[0],
          range: [seam.sideB[0].range[0], seam.sideB[0].range[1]] as const,
        },
      },
    ] as const,
  };
  return deepFreeze({
    ok: true as const,
    proposal: {
      ...unsigned,
      deterministicFingerprint: `pidpeapv1-fnv1a64:${fnv1a64(JSON.stringify(unsigned))}`,
    },
    blockers: [] as const,
  });
}

/**
 * Exact ordinal join between the catalog identities and the retained Phase-D point arrays. The
 * projection owns detached point records for display; it does not alter, place, snap or simplify
 * them.
 */
export function projectPatternImportDxfProductPhaseEAssemblyV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  phaseDSelection: DxfProductPhaseDSizeSelectionSuccessV1,
): PatternImportDxfProductPhaseEAssemblyProjectionResultV1 {
  if (
    catalog?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !SHA256.test(catalog.sizeSelectionCanonicalSha256 ?? '') ||
    !Array.isArray(catalog.pieces) ||
    catalog.pieces.length === 0 ||
    catalog.pieces.some(
      (piece) =>
        !piece || !STABLE_ID.test(piece.pieceId ?? '') || !STABLE_ID.test(piece.pieceLineKey ?? ''),
    ) ||
    new Set(catalog.pieces.map(({ pieceId }) => pieceId)).size !== catalog.pieces.length ||
    new Set(catalog.pieces.map(({ pieceLineKey }) => pieceLineKey)).size !== catalog.pieces.length
  )
    return projectionBlocked(
      'catalog-invalid',
      'The V1 projection requires one sealed non-empty catalog with unique stable piece identities.',
    );
  const selection = phaseDSelection?.selection;
  const pipeline = phaseDSelection?.pipeline;
  const phaseD = phaseDSelection?.phaseD;
  const binding = pipeline?.contentBinding;
  if (
    phaseDSelection?.ok !== true ||
    phaseDSelection.schemaVersion !== DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1 ||
    phaseDSelection.blockers.length !== 0 ||
    phaseDSelection.claims.fullPhaseDReplayFreshVerified !== true ||
    phaseDSelection.claims.oneSizeSelectedExplicitly !== true ||
    phaseDSelection.claims.selectedPublicCarrierFreshRebuilt !== true ||
    phaseDSelection.claims.selectedContentBindingProduced !== true ||
    !selection ||
    !pipeline?.pipelineIntegrated ||
    pipeline.blockers.length !== 0 ||
    !pipeline.carrier ||
    !binding ||
    !phaseD ||
    !Array.isArray(selection.pieceIds) ||
    !SHA256.test(selection.canonicalSha256 ?? '') ||
    !SHA256.test(selection.selectedGeometrySha256 ?? '') ||
    !SHA256.test(selection.fullSelectedGeometrySha256 ?? '') ||
    selection.canonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
    selection.scopeKey !== catalog.scopeKey ||
    selection.sizeToken !== catalog.sizeToken ||
    phaseD.source.sourceFileId !== catalog.sourceFileId ||
    binding.sourceFileId !== catalog.sourceFileId ||
    binding.sourceSha256 !== phaseD.sourceSha256 ||
    binding.selectedGeometrySha256 !== selection.selectedGeometrySha256
  )
    return projectionBlocked(
      'phase-d-selection-binding-mismatch',
      'Projection requires the exact fresh selected Phase-D envelope and catalog selection seal.',
    );

  const catalogPieceIds = catalog.pieces.map(({ pieceId }) => pieceId).sort();
  const selectedPieceIds = [...selection.pieceIds].sort();
  if (
    new Set(selectedPieceIds).size !== selectedPieceIds.length ||
    selectedPieceIds.length !== catalogPieceIds.length ||
    selectedPieceIds.some((pieceId, index) => pieceId !== catalogPieceIds[index])
  )
    return projectionBlocked(
      'phase-d-selection-binding-mismatch',
      'Selected Phase-D piece identities must exact-match the sealed catalog pieces.',
    );

  const catalogPieceIdSet = new Set(catalogPieceIds);
  const selectedReplayContours = phaseD.contours;
  const expectedContourCount = catalog.pieces.reduce(
    (count, piece) => count + piece.contours.length,
    0,
  );
  if (
    selectedReplayContours.length !== expectedContourCount ||
    selectedReplayContours.some(
      ({ pieceId, sizeToken }) =>
        !catalogPieceIdSet.has(pieceId) || sizeToken !== catalog.sizeToken,
    )
  )
    return projectionBlocked(
      'contour-coverage-mismatch',
      'Selected Phase-D replay contour coverage must equal the exact catalog coverage.',
    );

  const projectedPieces: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number][] = [];
  const globalVertexIds = new Set<string>();
  for (const piece of catalog.pieces) {
    const projectedContours: PatternImportDxfProductPhaseEAssemblyProjectionContourV1[] = [];
    const allPoints: [number, number][] = [];
    for (const contour of piece.contours) {
      const matches = selectedReplayContours.filter(
        ({ pieceId, sizeToken, contourId }) =>
          pieceId === piece.pieceId &&
          sizeToken === catalog.sizeToken &&
          contourId === contour.contourId,
      );
      if (
        matches.length !== 1 ||
        matches[0].role !== contour.role ||
        !sameContourGeometry(contour.geometry, matches[0].geometry) ||
        matches[0].closed !== contour.closed ||
        matches[0].pointsMm.length !== contour.boundaryVertices.length
      )
        return projectionBlocked(
          'contour-coverage-mismatch',
          `${piece.pieceId}/${contour.contourId} does not exact-match one Phase-D contour.`,
        );
      const ids = new Set<string>();
      let priorArc = -1;
      const vertices: PatternImportDxfProductPhaseEAssemblyProjectionVertexV1[] = [];
      for (let ordinal = 0; ordinal < contour.boundaryVertices.length; ordinal += 1) {
        const identity = contour.boundaryVertices[ordinal];
        const point = matches[0].pointsMm[ordinal];
        if (
          identity.ordinal !== ordinal ||
          !STABLE_ID.test(identity.vertexId ?? '') ||
          ids.has(identity.vertexId) ||
          globalVertexIds.has(identity.vertexId) ||
          !Number.isFinite(identity.normalizedArc) ||
          identity.normalizedArc < 0 ||
          identity.normalizedArc > 1 ||
          (ordinal === 0 && identity.normalizedArc !== 0) ||
          identity.normalizedArc <= priorArc
        )
          return projectionBlocked(
            'boundary-identity-invalid',
            `${piece.pieceId}/${contour.contourId} has non-canonical boundary identity order.`,
          );
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
          return projectionBlocked(
            'replay-coordinate-invalid',
            `${piece.pieceId}/${contour.contourId}/${identity.vertexId} has no finite Phase-D point.`,
          );
        ids.add(identity.vertexId);
        globalVertexIds.add(identity.vertexId);
        priorArc = identity.normalizedArc;
        const pointMm = { x: point.x, y: point.y };
        allPoints.push([point.x, point.y]);
        vertices.push({
          ordinal,
          vertexId: identity.vertexId,
          normalizedArc: identity.normalizedArc,
          pointMm,
        });
      }
      if (vertices.length < 2)
        return projectionBlocked(
          'replay-coordinate-invalid',
          `${piece.pieceId}/${contour.contourId} needs at least two exact display points.`,
        );
      projectedContours.push({
        contourId: contour.contourId,
        role: contour.role,
        closed: contour.closed,
        vertices,
      });
    }
    if (!allPoints.length)
      return projectionBlocked(
        'replay-coordinate-invalid',
        `${piece.pieceId} has no exact Phase-D display points.`,
      );
    const xs = allPoints.map(([x]) => x);
    const ys = allPoints.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const padding = Math.max(maxX - minX, maxY - minY, 1) * 0.04;
    projectedPieces.push({
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      contours: projectedContours,
      cameraMm: { minX, minY, maxX, maxY, padding },
    });
  }
  const projection = deepFreeze<PatternImportDxfProductPhaseEAssemblyProjectionV1>({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: selection.canonicalSha256,
    sourceFileId: catalog.sourceFileId,
    sizeToken: catalog.sizeToken,
    joinMode: 'catalog-ordinal-to-phase-d-point',
    pieces: projectedPieces,
    geometryPlacementApplied: false,
  });
  if (isPreparedPatternImportDxfProductPhaseEAuthoringCatalogV1(catalog)) {
    const ordinals = new Map(projectedPieces.map((piece, ordinal) => [piece, ordinal]));
    const prepared = { scopeKey: catalog.scopeKey, projection, ordinals };
    for (const piece of projectedPieces) preparedOrderByPiece.set(piece, prepared);
  }
  return deepFreeze({ ok: true as const, projection, blockers: [] as const });
}

export function createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1,
  documentAuthority?: Readonly<{ documentId: string; revision: string }>,
  importGeneration = 0,
): PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1 {
  if (
    proposal.status !== 'proposal-not-authority' ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    proposal.sides.length !== 2 ||
    proposal.deterministicFingerprint !== proposalFingerprint(proposal)
  )
    throw new TypeError('The initial workbench state requires an exact current proposal.');
  const documentId = documentAuthority?.documentId ?? '';
  const revision = documentAuthority?.revision ?? '';
  if (
    (documentAuthority && (!STABLE_ID.test(documentId) || !STABLE_ID.test(revision))) ||
    !Number.isSafeInteger(importGeneration) ||
    importGeneration <= 0
  )
    throw new TypeError(
      'The initial workbench state requires a valid bound document revision and import generation.',
    );
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_WORKBENCH_STATE_V1,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    expectedProposalFingerprint: proposal.deterministicFingerprint,
    expectedImportGeneration: importGeneration,
    documentId,
    revision,
    expectedDocumentId: documentId,
    expectedRevision: revision,
    documentRevisionConfirmed: false,
    physicalSurface: null,
    physicalSurfaceConfirmed: false,
    operationStage: null,
    operationConfirmed: false,
    sides: [
      {
        pieceId: proposal.sides[0].pieceId,
        contourId: null,
        startBoundaryVertexId: null,
        endBoundaryVertexId: null,
        direction: proposal.sides[0].suggestedDirection,
        confirmed: false,
      },
      {
        pieceId: proposal.sides[1].pieceId,
        contourId: null,
        startBoundaryVertexId: null,
        endBoundaryVertexId: null,
        direction: proposal.sides[1].suggestedDirection,
        confirmed: false,
      },
    ],
    materialSelections: [
      { pieceId: proposal.sides[0].pieceId, optionId: null, confirmed: false },
      { pieceId: proposal.sides[1].pieceId, optionId: null, confirmed: false },
    ],
    tolerance: {
      endpointMm: null,
      fullLengthMm: null,
      fullLengthRelative: null,
      confirmed: false,
    },
  });
}

function addBlocker(
  blockers: Extract<
    PatternImportDxfProductPhaseEAssemblyChoicesResultV1,
    { ok: false }
  >['blockers'][number][],
  code: PatternImportDxfProductPhaseEAssemblyChoicesBlockerCodeV1,
  detail: string,
): void {
  blockers.push({ code, detail });
}

function validTolerance(value: number | null, maximum: number): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= maximum;
}

/**
 * Emits only the established authoring-choice record. It neither runs the producer/compiler nor
 * turns the existing proposal into authority without all explicit confirmations.
 */
export function buildPatternImportDxfProductPhaseEAssemblyChoicesV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1,
  state: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[],
): PatternImportDxfProductPhaseEAssemblyChoicesResultV1 {
  const blockers: Extract<
    PatternImportDxfProductPhaseEAssemblyChoicesResultV1,
    { ok: false }
  >['blockers'][number][] = [];
  const proposedAuthoringOperationId = proposal.operation.authoringOperationId;
  const derivedAuthoringOperationId = derivedOperationIdForSingleSeamV1(proposal.seam.id);
  const authoringOperationId =
    STABLE_ID.test(proposedAuthoringOperationId ?? '') &&
    (!proposedAuthoringOperationId?.startsWith(
      PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_DERIVED_OPERATION_ID_PREFIX_V1,
    ) ||
      proposedAuthoringOperationId === derivedAuthoringOperationId)
      ? proposedAuthoringOperationId
      : null;
  if (
    state?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_WORKBENCH_STATE_V1 ||
    state.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    state.expectedProposalFingerprint !== proposal.deterministicFingerprint ||
    !Number.isSafeInteger(state.expectedImportGeneration) ||
    state.expectedImportGeneration <= 0 ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    proposal.status !== 'proposal-not-authority' ||
    proposal.deterministicFingerprint !== proposalFingerprint(proposal) ||
    !STABLE_ID.test(proposal.seam.id ?? '') ||
    !Number.isSafeInteger(proposal.operation.sourceOperationNumber) ||
    proposal.operation.sourceOperationNumber <= 0 ||
    proposal.operation.order !== 0
  )
    addBlocker(
      blockers,
      'state-binding-mismatch',
      'Workbench state, proposal and catalog must retain the same exact identities.',
    );
  if (!authoringOperationId)
    addBlocker(
      blockers,
      'operation-authoring-id-unavailable',
      'Submission requires a valid persisted ID or the exact V1 seam-derived ID; the display number is not an identity fallback.',
    );
  if (
    state.documentId !== state.expectedDocumentId ||
    state.revision !== state.expectedRevision ||
    !STABLE_ID.test(state.expectedDocumentId ?? '') ||
    !STABLE_ID.test(state.expectedRevision ?? '')
  )
    addBlocker(
      blockers,
      'document-revision-binding-mismatch',
      'Document ID and revision must exact-match the verified saved-row and Phase-D selection binding.',
    );
  else if (
    !state.documentRevisionConfirmed ||
    !STABLE_ID.test(state.documentId ?? '') ||
    !STABLE_ID.test(state.revision ?? '')
  )
    addBlocker(
      blockers,
      'document-revision-unconfirmed',
      'Document ID and revision require explicit valid confirmation.',
    );
  if (!state.physicalSurfaceConfirmed || !state.physicalSurface)
    addBlocker(
      blockers,
      'physical-surface-unconfirmed',
      'The physical sewing or cut surface requires explicit confirmation.',
    );
  if (
    !state.operationConfirmed ||
    !Number.isSafeInteger(state.operationStage) ||
    (state.operationStage ?? -1) < 0
  )
    addBlocker(
      blockers,
      'operation-unconfirmed',
      'The existing operation identity/order and an explicit Phase-E stage require confirmation.',
    );

  if (
    proposal.sides.some(
      ({ evidence }) =>
        evidence.edgeHint.startsWith(`${evidence.pieceLineKey}#dxf:`) &&
        (evidence.range[0] !== 0 || evidence.range[1] !== 1),
    )
  )
    addBlocker(
      blockers,
      'native-contained-range-not-supported',
      'This exact native seam uses a portion of a saved edge. The current pattern metadata can save whole edges only.',
    );

  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  for (let index = 0; index < state.sides.length; index += 1) {
    const side = state.sides[index];
    if (!side.confirmed)
      addBlocker(
        blockers,
        'side-choice-unconfirmed',
        `Side ${index + 1} contour, anchors and direction require explicit confirmation.`,
      );
    const expectedPiece = proposal.sides[index];
    const pieces = catalog.pieces.filter(
      ({ pieceId, pieceLineKey }) =>
        pieceId === side.pieceId &&
        pieceId === expectedPiece.pieceId &&
        pieceLineKey === expectedPiece.pieceLineKey,
    );
    const contours = pieces[0]?.contours.filter(({ contourId }) => contourId === side.contourId);
    const contour = contours?.length === 1 ? contours[0] : null;
    if (
      pieces.length !== 1 ||
      !contour ||
      contour.role !== expectedRole ||
      !side.startBoundaryVertexId ||
      !side.endBoundaryVertexId ||
      side.startBoundaryVertexId === side.endBoundaryVertexId ||
      !['forward', 'reverse'].includes(side.direction ?? '') ||
      contour.boundaryVertices.filter(({ vertexId }) => vertexId === side.startBoundaryVertexId)
        .length !== 1 ||
      contour.boundaryVertices.filter(({ vertexId }) => vertexId === side.endBoundaryVertexId)
        .length !== 1
    )
      addBlocker(
        blockers,
        'side-choice-invalid',
        `Side ${index + 1} must exact-match its proposed piece and one surface-compatible catalog span.`,
      );
  }

  const optionById = new Map<string, PatternImportDxfProductPhaseEMaterialRevisionOptionV1>();
  let optionsValid = true;
  for (const option of materialOptions) {
    if (
      !STABLE_ID.test(option?.id ?? '') ||
      !STABLE_ID.test(option?.materialRevision ?? '') ||
      !option.label ||
      optionById.has(option.id)
    ) {
      optionsValid = false;
      break;
    }
    optionById.set(option.id, option);
  }
  for (let index = 0; index < state.materialSelections.length; index += 1) {
    const selection = state.materialSelections[index];
    if (!selection.confirmed)
      addBlocker(
        blockers,
        'material-choice-unconfirmed',
        `Piece ${index + 1} material revision requires explicit confirmation.`,
      );
    if (
      !optionsValid ||
      selection.pieceId !== proposal.sides[index].pieceId ||
      !selection.optionId ||
      !optionById.has(selection.optionId)
    )
      addBlocker(
        blockers,
        'material-choice-invalid',
        `Piece ${index + 1} must select one exact supplied immutable material revision.`,
      );
  }
  if (!state.tolerance.confirmed)
    addBlocker(
      blockers,
      'tolerance-unconfirmed',
      'Endpoint, full-length and relative tolerances require explicit confirmation.',
    );
  if (
    !validTolerance(state.tolerance.endpointMm, 1_000) ||
    !validTolerance(state.tolerance.fullLengthMm, 1_000_000) ||
    !validTolerance(state.tolerance.fullLengthRelative, 1)
  )
    addBlocker(
      blockers,
      'tolerance-invalid',
      'Tolerances must be finite, non-negative and inside the Phase-E bounds.',
    );
  if (blockers.length || !authoringOperationId)
    return deepFreeze({ ok: false as const, choices: null, blockers });

  const materialsById = new Map<string, DxfMaterialAssignmentV1>();
  for (const selection of state.materialSelections) {
    const option = optionById.get(selection.optionId!)!;
    const prior = materialsById.get(option.id);
    materialsById.set(
      option.id,
      prior
        ? { ...prior, pieceIds: [...prior.pieceIds, selection.pieceId] }
        : {
            id: option.id,
            materialRevision: option.materialRevision,
            pieceIds: [selection.pieceId],
          },
    );
  }
  const operation: DxfAssemblyOperationV1 = {
    id: authoringOperationId,
    stage: state.operationStage!,
    order: proposal.operation.order,
    kind: 'stitch',
    seamIds: [proposal.seam.id],
  };
  const choices: PatternImportDxfProductPhaseEAuthoringChoicesV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CHOICES_V1,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    expectedProposalFingerprint: proposal.deterministicFingerprint,
    importGeneration: state.expectedImportGeneration,
    documentId: state.documentId,
    revision: state.revision,
    physicalSurface:
      state.physicalSurface!.mode === 'sewing-surface'
        ? { mode: 'sewing-surface', seamAllowancePhysical: false }
        : { mode: 'cut-surface', seamAllowancePhysical: true },
    seam: {
      id: proposal.seam.id,
      operationId: authoringOperationId,
      mapping: 'equal',
      lengthRatio: 1,
      sides: [
        {
          pieceId: state.sides[0].pieceId,
          contourId: state.sides[0].contourId!,
          anchors: [state.sides[0].startBoundaryVertexId!, state.sides[0].endBoundaryVertexId!],
          direction: state.sides[0].direction!,
        },
        {
          pieceId: state.sides[1].pieceId,
          contourId: state.sides[1].contourId!,
          anchors: [state.sides[1].startBoundaryVertexId!, state.sides[1].endBoundaryVertexId!],
          direction: state.sides[1].direction!,
        },
      ],
    },
    operations: [operation],
    materials: [...materialsById.values()],
    tolerance: {
      endpointMm: state.tolerance.endpointMm!,
      fullLengthMm: state.tolerance.fullLengthMm!,
      fullLengthRelative: state.tolerance.fullLengthRelative!,
    },
  };
  return deepFreeze({ ok: true as const, choices, blockers: [] as const });
}
