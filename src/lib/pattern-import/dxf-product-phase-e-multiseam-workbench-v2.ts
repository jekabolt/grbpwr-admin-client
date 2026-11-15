import type {
  DxfAssemblyOperationV1,
  DxfMaterialAssignmentV1,
} from '../cloth/domain/dxf-assembly-handoff-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from '../cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type {
  PatternImportDxfProductPhaseEExistingAssemblyAnchorV1,
  PatternImportDxfProductPhaseEExistingAssemblyOperationV1,
  PatternImportDxfProductPhaseEExistingAssemblySeamV1,
  PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from './dxf-product-phase-e-assembly-workbench-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2 =
  'pattern-import-dxf-product-phase-e-multiseam-proposal/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_WORKBENCH_STATE_V2 =
  'pattern-import-dxf-product-phase-e-multiseam-workbench-state/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2 =
  'pattern-import-dxf-product-phase-e-multiseam-choices/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2 =
  'pattern-import-dxf-product-phase-e-multiseam-plan-seal/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_DERIVED_OPERATION_ID_PREFIX_V2 =
  'phase-e-v2:seams:' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CONTRACT_V2 = Object.freeze({
  minimumCatalogPieceCount: 2,
  /** The selected seam authority remains bounded even when the sealed catalog has more pieces. */
  boundedPieceCount: 2,
  additionalCatalogPiecesAreNonAuthoritative: true,
  boundedSeamCount: 2,
  boundedOperationCount: 1,
  existingAssemblyOrderIsSoleTopologyOwner: true,
  sourceOperationNumberIsSelectionEvidenceOnly: true,
  emittedLocalOperationOrder: 0,
  authoritativeStitchKindRequired: true,
  everyBoundaryVertexIdExplicit: true,
  exactlyOneAdjacentBoundaryEdgePerSide: true,
  multiEdgeSeamSpanSupported: false,
  nearestGeometryRecoveryAllowed: false,
  nameInferenceAllowed: false,
  directionInferenceAllowed: false,
  importGenerationBoundToAggregatePlanSeal: true,
  atomicAuthorityOnly: true,
  arbitraryGarmentSupported: false,
  reloadPersistenceIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductPhaseEMultiseamExistingAssemblyInputV2 = Readonly<{
  operations: readonly PatternImportDxfProductPhaseEExistingAssemblyOperationV1[];
  seams: readonly PatternImportDxfProductPhaseEExistingAssemblySeamV1[];
  selectedOperationNumber: number;
}>;

type ProposalSideV2 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  sourceSide: 'A' | 'B';
  requiredDirection: 'forward' | 'reverse';
  evidence: PatternImportDxfProductPhaseEExistingAssemblyAnchorV1;
}>;

type ProposalSeamV2 = Readonly<{
  id: string;
  kind: PatternImportDxfProductPhaseEExistingAssemblySeamV1['kind'];
  anchoredSize: string;
  sourceDirection: Exclude<
    PatternImportDxfProductPhaseEExistingAssemblySeamV1['direction'],
    'unknown'
  >;
  sides: readonly [ProposalSideV2, ProposalSideV2];
}>;

export type PatternImportDxfProductPhaseEMultiseamProposalV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2;
  status: 'proposal-not-authority';
  expectedCatalogCanonicalSha256: string;
  operation: Readonly<{
    authoringOperationId: string;
    sourceOperationNumber: number;
    order: 0;
    work: string;
    inputKeys: readonly string[];
    outputUnitKey: string;
    outputUnitName: string;
    kind: 'stitch';
    seamIds: readonly [string, string];
  }>;
  seams: readonly [ProposalSeamV2, ProposalSeamV2];
  deterministicFingerprint: string;
}>;

export type PatternImportDxfProductPhaseEMultiseamProposalBlockerCodeV2 =
  | 'catalog-scope-invalid'
  | 'selected-operation-invalid'
  | 'selected-operation-ambiguous'
  | 'operation-contract-invalid'
  | 'operation-kind-unconfirmed'
  | 'operation-authoring-id-invalid'
  | 'operation-authoring-id-collision'
  | 'seam-cardinality-unsupported'
  | 'seam-owner-ambiguous'
  | 'seam-missing-or-ambiguous'
  | 'seam-not-current'
  | 'seam-shape-unsupported'
  | 'piece-line-binding-mismatch';

export type PatternImportDxfProductPhaseEMultiseamProposalResultV2 =
  | Readonly<{
      ok: true;
      proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      proposal: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductPhaseEMultiseamProposalBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

type WorkbenchSideV2 = Readonly<{
  pieceId: string;
  contourId: string | null;
  /** Full ordered span, not inferred from endpoints. */
  boundaryVertexIds: readonly string[];
  direction: 'forward' | 'reverse' | null;
  confirmed: boolean;
}>;

type WorkbenchSeamV2 = Readonly<{
  seamId: string;
  mapping: 'equal' | null;
  lengthRatio: 1 | null;
  confirmed: boolean;
  sides: readonly [WorkbenchSideV2, WorkbenchSideV2];
}>;

export type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_WORKBENCH_STATE_V2;
  expectedCatalogCanonicalSha256: string;
  expectedProposalFingerprint: string;
  expectedImportGeneration: number;
  documentId: string;
  revision: string;
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
  seams: readonly [WorkbenchSeamV2, WorkbenchSeamV2];
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

export type PatternImportDxfProductPhaseEMultiseamPlanSealV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  authority: 'explicit-bounded-two-piece-two-seam';
  productionReady: false;
}>;

export type PatternImportDxfProductPhaseEMultiseamChoicesV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2;
  expectedCatalogCanonicalSha256: string;
  expectedProposalFingerprint: string;
  importGeneration: number;
  documentId: string;
  revision: string;
  physicalSurface:
    | Readonly<{ mode: 'sewing-surface'; seamAllowancePhysical: false }>
    | Readonly<{ mode: 'cut-surface'; seamAllowancePhysical: true }>;
  seams: readonly [
    Readonly<{
      id: string;
      operationId: string;
      mapping: 'equal';
      lengthRatio: 1;
      sides: readonly [
        Readonly<{
          pieceId: string;
          pieceLineKey: string;
          contourId: string;
          boundaryVertexIds: readonly string[];
          direction: 'forward' | 'reverse';
          /** Monotonic traversal coordinate; a closing vertex keeps ID 0 while arc may end at 1. */
          directedArc: Readonly<{ start: number; end: number }>;
        }>,
        Readonly<{
          pieceId: string;
          pieceLineKey: string;
          contourId: string;
          boundaryVertexIds: readonly string[];
          direction: 'forward' | 'reverse';
          directedArc: Readonly<{ start: number; end: number }>;
        }>,
      ];
    }>,
    Readonly<{
      id: string;
      operationId: string;
      mapping: 'equal';
      lengthRatio: 1;
      sides: readonly [
        Readonly<{
          pieceId: string;
          pieceLineKey: string;
          contourId: string;
          boundaryVertexIds: readonly string[];
          direction: 'forward' | 'reverse';
          directedArc: Readonly<{ start: number; end: number }>;
        }>,
        Readonly<{
          pieceId: string;
          pieceLineKey: string;
          contourId: string;
          boundaryVertexIds: readonly string[];
          direction: 'forward' | 'reverse';
          directedArc: Readonly<{ start: number; end: number }>;
        }>,
      ];
    }>,
  ];
  operations: readonly [DxfAssemblyOperationV1];
  materials: readonly DxfMaterialAssignmentV1[];
  tolerance: Readonly<{
    endpointMm: number;
    fullLengthMm: number;
    fullLengthRelative: number;
  }>;
  aggregatePlanSeal: PatternImportDxfProductPhaseEMultiseamPlanSealV2;
}>;

export type PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2 =
  | 'state-binding-mismatch'
  | 'document-revision-unconfirmed'
  | 'document-revision-binding-mismatch'
  | 'physical-surface-unconfirmed'
  | 'operation-unconfirmed'
  | 'seam-choice-unconfirmed'
  | 'seam-choice-invalid'
  | 'seam-choice-overlap'
  | 'side-choice-unconfirmed'
  | 'side-choice-invalid'
  | 'material-choice-unconfirmed'
  | 'material-choice-invalid'
  | 'tolerance-unconfirmed'
  | 'tolerance-invalid'
  | 'sha256-unavailable';

export type PatternImportDxfProductPhaseEMultiseamChoicesResultV2 =
  | Readonly<{
      ok: true;
      choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      choices: null;
      blockers: readonly Readonly<{
        code: PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2;
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

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function proposalFingerprint(
  proposal: Omit<PatternImportDxfProductPhaseEMultiseamProposalV2, 'deterministicFingerprint'>,
): string {
  return `pidpemsv2-fnv1a64:${fnv1a64(canonical(proposal))}`;
}

function recomputeProposalFingerprint(
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): string {
  const unsigned: Omit<
    PatternImportDxfProductPhaseEMultiseamProposalV2,
    'deterministicFingerprint'
  > = {
    schemaVersion: proposal.schemaVersion,
    status: proposal.status,
    expectedCatalogCanonicalSha256: proposal.expectedCatalogCanonicalSha256,
    operation: proposal.operation,
    seams: proposal.seams,
  };
  return proposalFingerprint(unsigned);
}

/**
 * Recomputes the complete proposal fingerprint from proposal data. Consumers must use this instead
 * of treating the public deterministicFingerprint field as authority.
 */
export function computePatternImportDxfProductPhaseEMultiseamProposalFingerprintV2(
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): string {
  return recomputeProposalFingerprint(proposal);
}

function proposalBlocked(
  code: PatternImportDxfProductPhaseEMultiseamProposalBlockerCodeV2,
  detail: string,
): PatternImportDxfProductPhaseEMultiseamProposalResultV2 {
  return deepFreeze({ ok: false as const, proposal: null, blockers: [{ code, detail }] as const });
}

function validAnchor(anchor: PatternImportDxfProductPhaseEExistingAssemblyAnchorV1): boolean {
  return (
    !!anchor &&
    STABLE_ID.test(anchor.pieceLineKey ?? '') &&
    !!anchor.edgeHint &&
    Array.isArray(anchor.range) &&
    anchor.range.length === 2 &&
    Number.isFinite(anchor.range[0]) &&
    Number.isFinite(anchor.range[1]) &&
    anchor.range[0] >= 0 &&
    anchor.range[1] <= 1 &&
    anchor.range[0] < anchor.range[1] &&
    Number.isFinite(anchor.lenMm) &&
    anchor.lenMm > 0 &&
    !!anchor.contourSig
  );
}

function derivedOperationId(seamIds: readonly [string, string]): string {
  return `${PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_DERIVED_OPERATION_ID_PREFIX_V2}${fnv1a64(canonical(seamIds))}`;
}

/** Admits the exact existing two-seam Assembly Order row as a proposal, never as authority. */
export function proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  input: PatternImportDxfProductPhaseEMultiseamExistingAssemblyInputV2,
): PatternImportDxfProductPhaseEMultiseamProposalResultV2 {
  if (
    catalog?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !Array.isArray(catalog.pieces) ||
    catalog.pieces.length < 2 ||
    catalog.pieces.some(
      (piece) =>
        !piece || !STABLE_ID.test(piece.pieceId ?? '') || !STABLE_ID.test(piece.pieceLineKey ?? ''),
    ) ||
    new Set(catalog.pieces.map(({ pieceId }) => pieceId)).size !== catalog.pieces.length ||
    new Set(catalog.pieces.map(({ pieceLineKey }) => pieceLineKey)).size !== catalog.pieces.length
  )
    return proposalBlocked(
      'catalog-scope-invalid',
      'V2 requires one sealed catalog with at least two unique stable piece identities.',
    );
  if (
    !input ||
    !Number.isSafeInteger(input.selectedOperationNumber) ||
    input.selectedOperationNumber <= 0
  )
    return proposalBlocked(
      'selected-operation-invalid',
      'One positive existing Assembly Order number must be selected.',
    );
  if (!Array.isArray(input.operations) || !Array.isArray(input.seams))
    return proposalBlocked(
      'operation-contract-invalid',
      'Existing operations and seam rows must be explicit arrays.',
    );
  const operations: readonly PatternImportDxfProductPhaseEExistingAssemblyOperationV1[] =
    input.operations;
  const seams: readonly PatternImportDxfProductPhaseEExistingAssemblySeamV1[] = input.seams;
  const selected = operations.filter(({ number }) => number === input.selectedOperationNumber);
  if (selected.length !== 1)
    return proposalBlocked(
      'selected-operation-ambiguous',
      'The selected Assembly Order number must resolve exactly once.',
    );
  const operation = selected[0];
  if (
    !Number.isSafeInteger(operation.number) ||
    operation.number <= 0 ||
    !operation.work ||
    !Array.isArray(operation.inputKeys) ||
    !Array.isArray(operation.seamKeys)
  )
    return proposalBlocked(
      'operation-contract-invalid',
      'The existing operation number, work token, inputs and seam links must be explicit.',
    );
  if (operation.phaseEKind !== 'stitch')
    return proposalBlocked(
      'operation-kind-unconfirmed',
      'The selected operation must carry an authoritative structural stitch classification.',
    );
  if (
    operation.seamKeys.length !== 2 ||
    new Set(operation.seamKeys).size !== 2 ||
    operation.seamKeys.some((seamKey) => !STABLE_ID.test(seamKey ?? ''))
  )
    return proposalBlocked(
      'seam-cardinality-unsupported',
      'Bounded V2 requires exactly two distinct seam keys on the selected operation.',
    );
  const seamIds = [operation.seamKeys[0], operation.seamKeys[1]] as const;
  if (
    operations.some(
      (candidate) =>
        candidate !== operation &&
        candidate.seamKeys.some((seamKey) => seamIds.includes(seamKey as (typeof seamIds)[number])),
    )
  )
    return proposalBlocked(
      'seam-owner-ambiguous',
      'Both selected seams must belong only to the one selected Assembly Order operation.',
    );

  const operationIds = operations.map(({ authoringOperationId }) => authoringOperationId);
  if (operationIds.some((id) => id !== null && !STABLE_ID.test(id ?? '')))
    return proposalBlocked(
      'operation-authoring-id-invalid',
      'Every present authoring operation identity must be an explicit stable ID.',
    );
  const persistedIds = operationIds.filter((id): id is string => id !== null);
  if (new Set(persistedIds).size !== persistedIds.length)
    return proposalBlocked(
      'operation-authoring-id-collision',
      'Persisted operation identities must be unique.',
    );
  const derivedId = derivedOperationId(seamIds);
  if (
    operation.authoringOperationId?.startsWith(
      PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_DERIVED_OPERATION_ID_PREFIX_V2,
    ) &&
    operation.authoringOperationId !== derivedId
  )
    return proposalBlocked(
      'operation-authoring-id-invalid',
      'An explicit V2-derived identity must exact-match the selected seam pair.',
    );
  if (operation.authoringOperationId === null && persistedIds.includes(derivedId))
    return proposalBlocked(
      'operation-authoring-id-collision',
      'The derived two-seam operation identity collides with a persisted identity.',
    );
  const authoringOperationId = operation.authoringOperationId ?? derivedId;

  const proposalSeams: ProposalSeamV2[] = [];
  let participatingPieceLineKeys: readonly [string, string] | null = null;
  for (const seamId of seamIds) {
    const matches = seams.filter(({ seamKey }) => seamKey === seamId);
    if (matches.length !== 1)
      return proposalBlocked(
        'seam-missing-or-ambiguous',
        `Seam ${seamId} must resolve exactly once.`,
      );
    const seam = matches[0];
    if (!seam.confirmed || seam.stale)
      return proposalBlocked('seam-not-current', `Seam ${seamId} must be confirmed and non-stale.`);
    if (
      seam.anchoredSize !== catalog.sizeToken ||
      seam.sideA.length !== 1 ||
      seam.sideB.length !== 1 ||
      !validAnchor(seam.sideA[0]) ||
      !validAnchor(seam.sideB[0]) ||
      seam.sideA[0].pieceLineKey === seam.sideB[0].pieceLineKey ||
      seam.direction === 'unknown'
    )
      return proposalBlocked(
        'seam-shape-unsupported',
        `Seam ${seamId} must expose one exact anchor per distinct piece and an explicit direction.`,
      );
    const seamPieceLineKeys = [seam.sideA[0].pieceLineKey, seam.sideB[0].pieceLineKey].sort() as [
      string,
      string,
    ];
    const priorPieceLineKeys = participatingPieceLineKeys;
    if (
      seamPieceLineKeys.some(
        (pieceLineKey) =>
          catalog.pieces.filter((piece) => piece.pieceLineKey === pieceLineKey).length !== 1,
      ) ||
      (priorPieceLineKeys !== null &&
        seamPieceLineKeys.some((pieceLineKey, index) => pieceLineKey !== priorPieceLineKeys[index]))
    )
      return proposalBlocked(
        'piece-line-binding-mismatch',
        `Seam ${seamId} must bind the same exact two catalog piece line identities as the selected operation.`,
      );
    participatingPieceLineKeys ??= seamPieceLineKeys;
    const pieceA = catalog.pieces.find(
      ({ pieceLineKey }) => pieceLineKey === seam.sideA[0].pieceLineKey,
    )!;
    const pieceB = catalog.pieces.find(
      ({ pieceLineKey }) => pieceLineKey === seam.sideB[0].pieceLineKey,
    )!;
    proposalSeams.push({
      id: seam.seamKey,
      kind: seam.kind,
      anchoredSize: seam.anchoredSize,
      sourceDirection: seam.direction,
      sides: [
        {
          pieceId: pieceA.pieceId,
          pieceLineKey: pieceA.pieceLineKey,
          sourceSide: 'A',
          requiredDirection: 'forward',
          evidence: { ...seam.sideA[0], range: [...seam.sideA[0].range] as [number, number] },
        },
        {
          pieceId: pieceB.pieceId,
          pieceLineKey: pieceB.pieceLineKey,
          sourceSide: 'B',
          requiredDirection: seam.direction === 'reversed' ? 'reverse' : 'forward',
          evidence: { ...seam.sideB[0], range: [...seam.sideB[0].range] as [number, number] },
        },
      ],
    });
  }

  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2,
    status: 'proposal-not-authority' as const,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    operation: {
      authoringOperationId,
      sourceOperationNumber: operation.number,
      order: 0 as const,
      work: operation.work,
      inputKeys: [...operation.inputKeys],
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      kind: 'stitch' as const,
      seamIds,
    },
    seams: [proposalSeams[0], proposalSeams[1]] as const,
  };
  return deepFreeze({
    ok: true as const,
    proposal: {
      ...unsigned,
      deterministicFingerprint: proposalFingerprint(unsigned),
    },
    blockers: [] as const,
  });
}

export function createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
  documentAuthority: Readonly<{ documentId: string; revision: string }>,
  importGeneration: number,
): PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 {
  if (
    proposal.status !== 'proposal-not-authority' ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    proposal.seams.length !== 2 ||
    proposal.deterministicFingerprint !== recomputeProposalFingerprint(proposal) ||
    !STABLE_ID.test(documentAuthority?.documentId ?? '') ||
    !STABLE_ID.test(documentAuthority?.revision ?? '') ||
    !Number.isSafeInteger(importGeneration) ||
    importGeneration <= 0
  )
    throw new TypeError('The V2 workbench requires one exact proposal and document revision.');
  const proposalSides = proposal.seams.flatMap(({ sides }) => sides);
  const participantKeys = new Set(
    proposalSides.map(({ pieceId, pieceLineKey }) => `${pieceId}\u0000${pieceLineKey}`),
  );
  const participantPieceIds = new Set(proposalSides.map(({ pieceId }) => pieceId));
  const participantPieceLineKeys = new Set(proposalSides.map(({ pieceLineKey }) => pieceLineKey));
  if (
    participantKeys.size !== 2 ||
    participantPieceIds.size !== 2 ||
    participantPieceLineKeys.size !== 2 ||
    proposalSides.some(
      ({ pieceId, pieceLineKey }) =>
        !STABLE_ID.test(pieceId ?? '') ||
        !STABLE_ID.test(pieceLineKey ?? '') ||
        catalog.pieces.filter(
          (piece) => piece.pieceId === pieceId && piece.pieceLineKey === pieceLineKey,
        ).length !== 1,
    )
  )
    throw new TypeError('The V2 workbench requires one exact proposal and document revision.');
  const pieceIds = [
    proposal.seams[0].sides[0].pieceId,
    proposal.seams[0].sides[1].pieceId,
  ] as const;
  const initialSide = (side: ProposalSideV2): WorkbenchSideV2 => ({
    pieceId: side.pieceId,
    contourId: null,
    boundaryVertexIds: [],
    direction: side.requiredDirection,
    confirmed: false,
  });
  const initialSeam = (seam: ProposalSeamV2): WorkbenchSeamV2 => ({
    seamId: seam.id,
    mapping: null,
    lengthRatio: null,
    confirmed: false,
    sides: [initialSide(seam.sides[0]), initialSide(seam.sides[1])],
  });
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_WORKBENCH_STATE_V2,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    expectedProposalFingerprint: proposal.deterministicFingerprint,
    expectedImportGeneration: importGeneration,
    documentId: documentAuthority.documentId,
    revision: documentAuthority.revision,
    expectedDocumentId: documentAuthority.documentId,
    expectedRevision: documentAuthority.revision,
    documentRevisionConfirmed: false,
    physicalSurface: null,
    physicalSurfaceConfirmed: false,
    operationStage: null,
    operationConfirmed: false,
    seams: [initialSeam(proposal.seams[0]), initialSeam(proposal.seams[1])],
    materialSelections: [
      { pieceId: pieceIds[0], optionId: null, confirmed: false },
      { pieceId: pieceIds[1], optionId: null, confirmed: false },
    ],
    tolerance: {
      endpointMm: null,
      fullLengthMm: null,
      fullLengthRelative: null,
      confirmed: false,
    },
  });
}

function validTolerance(value: number | null, maximum: number): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= maximum;
}

function physicalBoundaryEdges(
  side: PatternImportDxfProductPhaseEMultiseamChoicesV2['seams'][number]['sides'][number],
): ReadonlySet<string> {
  const edges = new Set<string>();
  for (let index = 1; index < side.boundaryVertexIds.length; index += 1) {
    const vertices = [side.boundaryVertexIds[index - 1], side.boundaryVertexIds[index]].sort();
    edges.add(`${side.pieceId}\u0000${side.contourId}\u0000${vertices[0]}\u0000${vertices[1]}`);
  }
  return edges;
}

function addBlocker(
  blockers: Readonly<{
    code: PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2;
    detail: string;
  }>[],
  code: PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2,
  detail: string,
): void {
  (
    blockers as {
      code: PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2;
      detail: string;
    }[]
  ).push({ code, detail });
}

function exactOrderedSpan(
  contour: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number],
  ids: readonly string[],
  direction: 'forward' | 'reverse',
): Readonly<{ start: number; end: number }> | null {
  if (ids.length !== 2 || new Set(ids).size !== ids.length) return null;
  const vertexById = new Map(contour.boundaryVertices.map((vertex) => [vertex.vertexId, vertex]));
  const vertices = ids.map((id) => vertexById.get(id));
  if (vertices.some((vertex) => vertex === undefined)) return null;
  const count = contour.boundaryVertices.length;
  let priorOrdinal = vertices[0]!.ordinal;
  let priorProgress =
    direction === 'forward' ? vertices[0]!.normalizedArc : 1 - vertices[0]!.normalizedArc;
  const start = priorProgress;
  for (let index = 1; index < vertices.length; index += 1) {
    const vertex = vertices[index]!;
    const expectedOrdinal =
      direction === 'forward' ? (priorOrdinal + 1) % count : (priorOrdinal - 1 + count) % count;
    if (vertex.ordinal !== expectedOrdinal) return null;
    let progress = direction === 'forward' ? vertex.normalizedArc : 1 - vertex.normalizedArc;
    while (progress <= priorProgress) progress += 1;
    priorOrdinal = vertex.ordinal;
    priorProgress = progress;
  }
  return { start, end: priorProgress };
}

async function sha256(
  value: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        textEncoder.encode(`pattern-import-dxf-product-phase-e-multiseam-plan-v2\0${value}`),
      ),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Emits one atomic two-seam plan. It never returns a partial seam or partial operation. */
export async function buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
  state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[],
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductPhaseEMultiseamChoicesResultV2> {
  const blockers: {
    code: PatternImportDxfProductPhaseEMultiseamChoicesBlockerCodeV2;
    detail: string;
  }[] = [];
  if (
    state?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_WORKBENCH_STATE_V2 ||
    state.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    state.expectedProposalFingerprint !== proposal.deterministicFingerprint ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    proposal.deterministicFingerprint !== recomputeProposalFingerprint(proposal) ||
    !Number.isSafeInteger(state.expectedImportGeneration) ||
    state.expectedImportGeneration <= 0 ||
    proposal.operation.sourceOperationNumber <= 0 ||
    proposal.operation.order !== 0 ||
    proposal.operation.seamIds.length !== 2 ||
    proposal.operation.seamIds.some((seamId, index) => seamId !== proposal.seams[index].id)
  )
    addBlocker(
      blockers,
      'state-binding-mismatch',
      'Catalog, proposal, source operation and local zero-based graph order must exact-match.',
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
      'Document ID and revision must retain the exact verified saved-row binding.',
    );
  else if (!state.documentRevisionConfirmed)
    addBlocker(
      blockers,
      'document-revision-unconfirmed',
      'The bound document revision requires explicit confirmation.',
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
      'The existing operation and one explicit stage require confirmation.',
    );

  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  const emittedSeams: PatternImportDxfProductPhaseEMultiseamChoicesV2['seams'][number][] = [];
  for (let seamIndex = 0; seamIndex < 2; seamIndex += 1) {
    const seamState = state.seams[seamIndex];
    const proposedSeam = proposal.seams[seamIndex];
    if (!seamState?.confirmed || seamState.mapping !== 'equal' || seamState.lengthRatio !== 1)
      addBlocker(
        blockers,
        seamState?.confirmed ? 'seam-choice-invalid' : 'seam-choice-unconfirmed',
        `Seam ${seamIndex + 1} requires explicit equal mapping confirmation.`,
      );
    if (seamState?.seamId !== proposedSeam.id)
      addBlocker(
        blockers,
        'seam-choice-invalid',
        `Seam ${seamIndex + 1} identity must exact-match the selected Assembly Order row.`,
      );
    const emittedSides: PatternImportDxfProductPhaseEMultiseamChoicesV2['seams'][number]['sides'][number][] =
      [];
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const sideState = seamState?.sides[sideIndex];
      const proposedSide = proposedSeam.sides[sideIndex];
      if (!sideState?.confirmed)
        addBlocker(
          blockers,
          'side-choice-unconfirmed',
          `Seam ${seamIndex + 1} side ${sideIndex + 1} requires explicit confirmation.`,
        );
      const pieces = catalog.pieces.filter(
        ({ pieceId, pieceLineKey }) =>
          pieceId === sideState?.pieceId &&
          pieceId === proposedSide.pieceId &&
          pieceLineKey === proposedSide.pieceLineKey,
      );
      const contours = pieces[0]?.contours.filter(
        ({ contourId }) => contourId === sideState?.contourId,
      );
      const contour = contours?.length === 1 ? contours[0] : null;
      const directedArc =
        contour && sideState?.direction === proposedSide.requiredDirection
          ? exactOrderedSpan(contour, sideState.boundaryVertexIds, proposedSide.requiredDirection)
          : null;
      if (
        pieces.length !== 1 ||
        !contour ||
        contour.role !== expectedRole ||
        sideState?.direction !== proposedSide.requiredDirection ||
        !directedArc
      )
        addBlocker(
          blockers,
          'side-choice-invalid',
          `Seam ${seamIndex + 1} side ${sideIndex + 1} must exact-match its piece, contour, full ordered boundary span and source direction.`,
        );
      if (contour && sideState && pieces.length === 1 && directedArc)
        emittedSides.push({
          pieceId: proposedSide.pieceId,
          pieceLineKey: proposedSide.pieceLineKey,
          contourId: contour.contourId,
          boundaryVertexIds: [...sideState.boundaryVertexIds],
          direction: proposedSide.requiredDirection,
          directedArc,
        });
    }
    if (emittedSides.length === 2)
      emittedSeams.push({
        id: proposedSeam.id,
        operationId: proposal.operation.authoringOperationId,
        mapping: 'equal',
        lengthRatio: 1,
        sides: [emittedSides[0], emittedSides[1]],
      });
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
  const expectedPieceIds = [
    ...new Set(proposal.seams.flatMap(({ sides }) => sides.map(({ pieceId }) => pieceId))),
  ];
  if (emittedSeams.length === 2)
    for (const pieceId of expectedPieceIds) {
      const first = emittedSeams[0].sides.find((side) => side.pieceId === pieceId);
      const second = emittedSeams[1].sides.find((side) => side.pieceId === pieceId);
      if (!first || !second) continue;
      const firstEdges = physicalBoundaryEdges(first);
      if ([...physicalBoundaryEdges(second)].some((edge) => firstEdges.has(edge)))
        addBlocker(
          blockers,
          'seam-choice-overlap',
          `The two seams must use distinct physical boundary edges on piece ${pieceId}.`,
        );
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
      !expectedPieceIds.includes(selection.pieceId) ||
      state.materialSelections.filter(({ pieceId }) => pieceId === selection.pieceId).length !==
        1 ||
      !selection.optionId ||
      !optionById.has(selection.optionId)
    )
      addBlocker(
        blockers,
        'material-choice-invalid',
        `Piece ${index + 1} must select one exact immutable material revision.`,
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
      'Tolerances must be finite, non-negative and inside the bounded Phase-E limits.',
    );
  if (blockers.length || emittedSeams.length !== 2)
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
    id: proposal.operation.authoringOperationId,
    stage: state.operationStage!,
    order: 0,
    kind: 'stitch',
    seamIds: [...proposal.operation.seamIds],
  };
  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    expectedProposalFingerprint: proposal.deterministicFingerprint,
    importGeneration: state.expectedImportGeneration,
    documentId: state.documentId,
    revision: state.revision,
    physicalSurface: state.physicalSurface!,
    seams: [emittedSeams[0], emittedSeams[1]] as const,
    operations: [operation] as const,
    materials: [...materialsById.values()],
    tolerance: {
      endpointMm: state.tolerance.endpointMm!,
      fullLengthMm: state.tolerance.fullLengthMm!,
      fullLengthRelative: state.tolerance.fullLengthRelative!,
    },
  };
  const canonicalSha256 = await sha256(canonical(unsigned), crypto);
  if (!canonicalSha256)
    return deepFreeze({
      ok: false as const,
      choices: null,
      blockers: [
        {
          code: 'sha256-unavailable' as const,
          detail: 'SHA-256 is required for the atomic aggregate two-seam plan seal.',
        },
      ],
    });
  return deepFreeze({
    ok: true as const,
    choices: {
      ...unsigned,
      aggregatePlanSeal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2,
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'explicit-bounded-two-piece-two-seam' as const,
        productionReady: false as const,
      },
    },
    blockers: [] as const,
  });
}
