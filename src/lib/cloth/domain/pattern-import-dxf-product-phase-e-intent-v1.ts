import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import type { CardDraft } from '../../pattern-import/types';
import type {
  DxfAssemblyOperationV1,
  DxfMaterialAssignmentV1,
  DxfSeamV1,
} from './dxf-assembly-handoff-v1';
import type { PatternImportDxfTwoSidedSeamToleranceV1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_INTENT_V1 =
  'pattern-import-dxf-product-phase-e-intent/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1 =
  'pattern-import-dxf-product-phase-e-admission/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_PLAN_V1 =
  'pattern-import-dxf-product-phase-e-plan/1' as const;

export type PatternImportDxfProductPhaseEIntentSideV1 = Readonly<{
  pieceLineKey: string;
  pieceId: string;
  contourId: string;
  anchors: readonly [startBoundaryVertexId: string, endBoundaryVertexId: string];
  direction: 'forward' | 'reverse';
}>;

export type PatternImportDxfProductPhaseEIntentV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_INTENT_V1;
  scopeKey: string;
  sizeToken: string;
  importGeneration: number;
  documentId: string;
  revision: string;
  physicalSurface:
    | Readonly<{ mode: 'sewing-surface'; seamAllowancePhysical: false }>
    | Readonly<{ mode: 'cut-surface'; seamAllowancePhysical: true }>;
  /** The first product slice deliberately admits exactly one authored two-sided equal seam. */
  seams: readonly [
    Readonly<{
      id: string;
      operationId: string;
      sides: readonly [
        PatternImportDxfProductPhaseEIntentSideV1,
        PatternImportDxfProductPhaseEIntentSideV1,
      ];
      mapping: 'equal';
      lengthRatio: 1;
    }>,
  ];
  operations: readonly DxfAssemblyOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
}>;

export type PatternImportDxfProductPhaseEAdmissionInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1;
  draft: CardDraft;
  selection: DxfProductPhaseDSizeSelectionResultV1;
  intent: PatternImportDxfProductPhaseEIntentV1;
}>;

export type PatternImportDxfProductPhaseEBlockerCodeV1 =
  | 'invalid-input'
  | 'phase-d-size-selection-blocked'
  | 'selection-intent-mismatch'
  | 'product-scope-missing-or-ambiguous'
  | 'selected-piece-coverage-mismatch'
  | 'piece-line-binding-missing-or-ambiguous'
  | 'contour-identity-mismatch'
  | 'anchor-identity-mismatch'
  | 'physical-surface-contour-mismatch'
  | 'seam-contract-invalid'
  | 'operation-contract-invalid'
  | 'material-contract-invalid'
  | 'sha256-unavailable';

export type PatternImportDxfProductPhaseEBlockerV1 = Readonly<{
  code: PatternImportDxfProductPhaseEBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductPhaseEPlanV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_PLAN_V1;
  sourceFileId: string;
  scopeKey: string;
  sizeToken: string;
  importGeneration: number;
  documentId: string;
  revision: string;
  phaseD: Readonly<{
    sizeSelectionCanonicalSha256: string;
    sourceSha256: string;
    selectedGeometrySha256: string;
  }>;
  physicalSurface: PatternImportDxfProductPhaseEIntentV1['physicalSurface'];
  pieceBindings: readonly Readonly<{ pieceLineKey: string; pieceId: string }>[];
  seams: readonly [DxfSeamV1];
  operations: readonly DxfAssemblyOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
  canonicalSha256: string;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
  productionReady: false;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_CLAIMS_V1 = Object.freeze({
  exactPhaseDSizeSelectionConsumed: true,
  importGenerationIncludedInPlanSeal: true,
  exactProductAliasBindingsVerified: true,
  explicitSeamSidesVerified: true,
  explicitAssemblyOrderVerified: true,
  explicitMaterialRevisionsVerified: true,
  seamInferenceUsed: false,
  nearestGeometryRecoveryUsed: false,
  cardOperationPromotionUsed: false,
  materialNamePromotionUsed: false,
  fullLengthCompatibilityVerified: false,
  g4f1CompositionBuilt: false,
  postSaveWriterBindingIntegrated: false,
  rawDxfAccepted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  exactPhaseDSizeSelectionConsumed: false as const,
  importGenerationIncludedInPlanSeal: false as const,
  exactProductAliasBindingsVerified: false as const,
  explicitSeamSidesVerified: false as const,
  explicitAssemblyOrderVerified: false as const,
  explicitMaterialRevisionsVerified: false as const,
  seamInferenceUsed: false as const,
  nearestGeometryRecoveryUsed: false as const,
  cardOperationPromotionUsed: false as const,
  materialNamePromotionUsed: false as const,
  fullLengthCompatibilityVerified: false as const,
  g4f1CompositionBuilt: false as const,
  postSaveWriterBindingIntegrated: false as const,
  rawDxfAccepted: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductPhaseEAdmissionResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1;
      plan: PatternImportDxfProductPhaseEPlanV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1;
      plan: null;
      blockers: readonly [PatternImportDxfProductPhaseEBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_TEXT_BYTES = 256;
const MAX_OPERATIONS = 64;
const MAX_MATERIALS = 32;
const textEncoder = new TextEncoder();

function stableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    STABLE_ID.test(value) &&
    textEncoder.encode(value).byteLength <= MAX_TEXT_BYTES
  );
}

function canonicalNumber(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    !Object.is(value, -0) &&
    value >= 0 &&
    value <= maximum
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfProductPhaseEBlockerCodeV1,
  field: string,
  detail: string,
): PatternImportDxfProductPhaseEAdmissionResultV1 {
  return deepFreeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
    plan: null,
    blockers: [{ code, field, detail }] as const,
    claims: BLOCKED_CLAIMS,
  });
}

async function sha256Canonical(
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        textEncoder.encode(`pattern-import-dxf-product-phase-e-plan-v1\0${canonical(value)}`),
      ),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function exactPhysicalSurface(
  value: PatternImportDxfProductPhaseEIntentV1['physicalSurface'],
): boolean {
  return (
    (value?.mode === 'sewing-surface' && value.seamAllowancePhysical === false) ||
    (value?.mode === 'cut-surface' && value.seamAllowancePhysical === true)
  );
}

function aliasIdentities(
  draft: CardDraft,
  scopeKey: string,
  sizeToken: string,
  pieceLineKey: string,
): ReadonlySet<string> | null {
  const scopes = draft.scopes.filter(({ target }) => target.scopeKey === scopeKey);
  if (scopes.length !== 1) return null;
  const aliases = draft.aliases.filter(
    (alias) => alias.scopeKey === scopeKey && alias.pieceLineKey === pieceLineKey,
  );
  if (!aliases.length) return new Set<string>();
  const identities = new Set<string>();
  for (const alias of aliases) {
    const matches = scopes[0].manifest.blocks.filter(
      (block) =>
        (block.block === alias.blockName || block.identity === alias.blockName) &&
        (block.sizeToken === sizeToken || block.sizeToken.toUpperCase() === 'UNI'),
    );
    const matchIds = new Set(matches.map(({ identity }) => identity));
    if (matchIds.size !== 1) return new Set<string>();
    identities.add([...matchIds][0]);
  }
  return identities;
}

function validateOperations(
  operations: readonly DxfAssemblyOperationV1[],
  seam: PatternImportDxfProductPhaseEIntentV1['seams'][0],
): PatternImportDxfProductPhaseEBlockerV1 | null {
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS)
    return {
      code: 'operation-contract-invalid',
      field: 'intent.operations',
      detail: `One to ${MAX_OPERATIONS} explicit operations are required.`,
    };
  const ids = new Set<string>();
  const seenSeams = new Map<string, number>();
  let priorOrder = -1;
  let priorStage = -1;
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (
      !stableId(operation?.id) ||
      !Number.isSafeInteger(operation.stage) ||
      operation.stage < 0 ||
      !Number.isSafeInteger(operation.order) ||
      operation.order < 0 ||
      !['place', 'stitch', 'release-support'].includes(operation.kind) ||
      !Array.isArray(operation.seamIds) ||
      operation.seamIds.some((id: unknown) => !stableId(id))
    )
      return {
        code: 'operation-contract-invalid',
        field: `intent.operations[${index}]`,
        detail: 'Operation identity, stage, order, kind or seam references are invalid.',
      };
    if (ids.has(operation.id) || operation.order <= priorOrder || operation.stage < priorStage)
      return {
        code: 'operation-contract-invalid',
        field: `intent.operations[${index}]`,
        detail:
          'Operation IDs must be unique and input order must be strictly ordered by order with nondecreasing stages.',
      };
    ids.add(operation.id);
    priorOrder = operation.order;
    priorStage = operation.stage;
    const local = new Set<string>();
    for (const seamId of operation.seamIds) {
      if (local.has(seamId))
        return {
          code: 'operation-contract-invalid',
          field: `intent.operations[${index}].seamIds`,
          detail: 'An operation cannot reference the same seam twice.',
        };
      local.add(seamId);
      seenSeams.set(seamId, (seenSeams.get(seamId) ?? 0) + 1);
    }
  }
  const owner = operations.filter(({ id }) => id === seam.operationId);
  if (
    owner.length !== 1 ||
    owner[0].kind !== 'stitch' ||
    !owner[0].seamIds.includes(seam.id) ||
    seenSeams.size !== 1 ||
    seenSeams.get(seam.id) !== 1
  )
    return {
      code: 'operation-contract-invalid',
      field: 'intent.operations',
      detail:
        'The single seam must be owned and referenced exactly once by its explicit stitch operation.',
    };
  return null;
}

function validateMaterials(
  materials: readonly DxfMaterialAssignmentV1[],
  selectedPieceIds: readonly string[],
): PatternImportDxfProductPhaseEBlockerV1 | null {
  if (!Array.isArray(materials) || !materials.length || materials.length > MAX_MATERIALS)
    return {
      code: 'material-contract-invalid',
      field: 'intent.materials',
      detail: `One to ${MAX_MATERIALS} explicit material revisions are required.`,
    };
  const ids = new Set<string>();
  const assigned: string[] = [];
  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index];
    if (
      !stableId(material?.id) ||
      !stableId(material.materialRevision) ||
      !Array.isArray(material.pieceIds) ||
      !material.pieceIds.length ||
      material.pieceIds.some((pieceId: unknown) => !stableId(pieceId)) ||
      new Set(material.pieceIds).size !== material.pieceIds.length ||
      ids.has(material.id)
    )
      return {
        code: 'material-contract-invalid',
        field: `intent.materials[${index}]`,
        detail: 'Material ID, immutable revision and unique piece references must be explicit.',
      };
    ids.add(material.id);
    assigned.push(...material.pieceIds);
  }
  if (
    assigned.length !== selectedPieceIds.length ||
    [...assigned]
      .sort(compareCodeUnits)
      .some((pieceId, index) => pieceId !== selectedPieceIds[index])
  )
    return {
      code: 'material-contract-invalid',
      field: 'intent.materials[].pieceIds',
      detail:
        'Every selected piece must have exactly one material revision and no other piece may be named.',
    };
  return null;
}

/**
 * Admits product-owned Phase-E intent without deriving assembly semantics from card display rows.
 * The result is deliberately pre-binding: G4F1 must still compose it with current PieceSpec,
 * manifest and post-save writer binding before it can prove length compatibility or emit mapping.
 */
export async function admitPatternImportDxfProductPhaseEIntentV1(
  input: PatternImportDxfProductPhaseEAdmissionInputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductPhaseEAdmissionResultV1> {
  if (
    !input ||
    input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1 ||
    input.intent?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_INTENT_V1 ||
    !input.draft ||
    !input.selection
  )
    return blocked('invalid-input', 'input', 'Exact V1 draft, selection and intent are required.');
  if (!input.selection.ok)
    return blocked(
      'phase-d-size-selection-blocked',
      'selection',
      'A successful exact Phase-D size selection is required.',
    );
  const { draft, selection, intent } = input;
  if (
    !stableId(intent.scopeKey) ||
    !stableId(intent.sizeToken) ||
    !Number.isSafeInteger(intent.importGeneration) ||
    intent.importGeneration <= 0 ||
    !stableId(intent.documentId) ||
    !stableId(intent.revision) ||
    !exactPhysicalSurface(intent.physicalSurface) ||
    !SHA256.test(selection.selection.canonicalSha256) ||
    !SHA256.test(selection.selection.selectedGeometrySha256) ||
    !SHA256.test(selection.phaseD.sourceSha256) ||
    selection.pipeline.contentBinding?.selectedGeometrySha256 !==
      selection.selection.selectedGeometrySha256 ||
    selection.pipeline.contentBinding.sourceSha256 !== selection.phaseD.sourceSha256 ||
    selection.pipeline.carrier?.sourceFileId !== selection.phaseD.source.sourceFileId
  )
    return blocked(
      'invalid-input',
      'intent',
      'Intent identity, import generation, physical surface or retained Phase-D binding is invalid.',
    );
  if (
    intent.scopeKey !== selection.selection.scopeKey ||
    intent.sizeToken !== selection.selection.sizeToken
  )
    return blocked(
      'selection-intent-mismatch',
      'intent.scopeKey/sizeToken',
      'Intent scope and size must equal the explicit Phase-D selection.',
    );
  const scopes = draft.scopes.filter(({ target }) => target.scopeKey === intent.scopeKey);
  if (scopes.length !== 1)
    return blocked(
      'product-scope-missing-or-ambiguous',
      'draft.scopes',
      'The product draft must contain the selected scope exactly once.',
    );
  const selectedPieceIds = [...selection.selection.pieceIds].sort(compareCodeUnits);
  if (
    selectedPieceIds.length !== 2 ||
    new Set(selectedPieceIds).size !== selectedPieceIds.length ||
    selectedPieceIds.some((pieceId) => !scopes[0].identities.includes(pieceId))
  )
    return blocked(
      'selected-piece-coverage-mismatch',
      'selection.selection.pieceIds',
      'The first Phase-E slice requires exactly two selected product pieces present in the scope.',
    );
  if (!Array.isArray(intent.seams) || intent.seams.length !== 1)
    return blocked(
      'seam-contract-invalid',
      'intent.seams',
      'Exactly one explicit seam is admitted by V1.',
    );
  const seam = intent.seams[0];
  if (
    !stableId(seam?.id) ||
    !stableId(seam.operationId) ||
    seam.mapping !== 'equal' ||
    seam.lengthRatio !== 1 ||
    !Array.isArray(seam.sides) ||
    seam.sides.length !== 2
  )
    return blocked(
      'seam-contract-invalid',
      'intent.seams[0]',
      'The seam must have a stable ID, explicit operation and exactly two equal-mapped sides.',
    );
  const sidePieceIds = seam.sides.map(({ pieceId }) => pieceId).sort(compareCodeUnits);
  if (
    new Set(sidePieceIds).size !== 2 ||
    sidePieceIds.some((pieceId, index) => pieceId !== selectedPieceIds[index])
  )
    return blocked(
      'selected-piece-coverage-mismatch',
      'intent.seams[0].sides',
      'The two seam sides must cover the two selected pieces exactly once.',
    );
  const pieceBindings: { pieceLineKey: string; pieceId: string }[] = [];
  const lineKeys = new Set<string>();
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = seam.sides[sideIndex];
    if (
      !stableId(side.pieceLineKey) ||
      !stableId(side.pieceId) ||
      !stableId(side.contourId) ||
      !Array.isArray(side.anchors) ||
      side.anchors.length !== 2 ||
      !stableId(side.anchors[0]) ||
      !stableId(side.anchors[1]) ||
      side.anchors[0] === side.anchors[1] ||
      !['forward', 'reverse'].includes(side.direction)
    )
      return blocked(
        'seam-contract-invalid',
        `intent.seams[0].sides[${sideIndex}]`,
        'Side line key, piece, contour, two distinct anchors and direction must be explicit.',
      );
    if (
      lineKeys.has(side.pieceLineKey) ||
      draft.pieces.filter(({ lineKey }) => lineKey === side.pieceLineKey).length !== 1
    )
      return blocked(
        'piece-line-binding-missing-or-ambiguous',
        `intent.seams[0].sides[${sideIndex}].pieceLineKey`,
        'Each side must identify a distinct product piece line exactly once.',
      );
    lineKeys.add(side.pieceLineKey);
    const identities = aliasIdentities(draft, intent.scopeKey, intent.sizeToken, side.pieceLineKey);
    if (!identities || identities.size !== 1 || !identities.has(side.pieceId))
      return blocked(
        'piece-line-binding-missing-or-ambiguous',
        `intent.seams[0].sides[${sideIndex}].pieceLineKey`,
        'The exact scope alias/manifest binding does not map this line key to the declared piece ID.',
      );
    const carrierPieces = selection.pipeline.carrier?.pieces.filter(
      ({ pieceId, sizeToken }) => pieceId === side.pieceId && sizeToken === intent.sizeToken,
    );
    if (carrierPieces?.length !== 1)
      return blocked(
        'contour-identity-mismatch',
        `intent.seams[0].sides[${sideIndex}].pieceId`,
        'The selected Phase-D carrier does not contain this piece and size exactly once.',
      );
    const contours = carrierPieces[0].contours.filter(({ id }) => id === side.contourId);
    if (contours.length !== 1)
      return blocked(
        'contour-identity-mismatch',
        `intent.seams[0].sides[${sideIndex}].contourId`,
        'The selected Phase-D carrier does not contain this contour exactly once.',
      );
    const expectedRole =
      intent.physicalSurface.mode === 'sewing-surface' ? 'sewing-boundary' : 'cut-boundary';
    if (contours[0].role !== expectedRole)
      return blocked(
        'physical-surface-contour-mismatch',
        `intent.seams[0].sides[${sideIndex}].contourId`,
        `The explicit ${intent.physicalSurface.mode} requires a ${expectedRole} contour.`,
      );
    const vertexIds = contours[0].sourceVertices.map(({ vertexId }) => vertexId);
    if (
      side.anchors.some(
        (anchor: unknown) => vertexIds.filter((vertexId) => vertexId === anchor).length !== 1,
      )
    )
      return blocked(
        'anchor-identity-mismatch',
        `intent.seams[0].sides[${sideIndex}].anchors`,
        'Both authored anchors must name exact unique Phase-D boundary vertices.',
      );
    pieceBindings.push({ pieceLineKey: side.pieceLineKey, pieceId: side.pieceId });
  }

  const operationBlocker = validateOperations(intent.operations, seam);
  if (operationBlocker)
    return blocked(operationBlocker.code, operationBlocker.field, operationBlocker.detail);
  const materialBlocker = validateMaterials(intent.materials, selectedPieceIds);
  if (materialBlocker)
    return blocked(materialBlocker.code, materialBlocker.field, materialBlocker.detail);
  if (
    !intent.tolerance ||
    !canonicalNumber(intent.tolerance.endpointMm, 1_000) ||
    !canonicalNumber(intent.tolerance.fullLengthMm, 1_000) ||
    !canonicalNumber(intent.tolerance.fullLengthRelative, 1)
  )
    return blocked(
      'invalid-input',
      'intent.tolerance',
      'Tolerance values must be explicit finite nonnegative canonical numbers.',
    );

  const mappedSides: DxfSeamV1['sides'] = [
    {
      pieceId: seam.sides[0].pieceId,
      contourId: seam.sides[0].contourId,
      anchors: [seam.sides[0].anchors[0], seam.sides[0].anchors[1]],
      direction: seam.sides[0].direction,
    },
    {
      pieceId: seam.sides[1].pieceId,
      contourId: seam.sides[1].contourId,
      anchors: [seam.sides[1].anchors[0], seam.sides[1].anchors[1]],
      direction: seam.sides[1].direction,
    },
  ];
  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_PLAN_V1,
    sourceFileId: selection.pipeline.carrier.sourceFileId,
    scopeKey: intent.scopeKey,
    sizeToken: intent.sizeToken,
    importGeneration: intent.importGeneration,
    documentId: intent.documentId,
    revision: intent.revision,
    phaseD: {
      sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
      sourceSha256: selection.phaseD.sourceSha256,
      selectedGeometrySha256: selection.selection.selectedGeometrySha256,
    },
    physicalSurface: { ...intent.physicalSurface },
    pieceBindings: pieceBindings.sort((left, right) =>
      compareCodeUnits(left.pieceId, right.pieceId),
    ),
    seams: [
      {
        id: seam.id,
        operationId: seam.operationId,
        sides: mappedSides,
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
      },
    ] as [DxfSeamV1],
    operations: intent.operations.map((operation) => ({
      ...operation,
      seamIds: [...operation.seamIds],
    })),
    materials: intent.materials.map((material) => ({
      ...material,
      pieceIds: [...material.pieceIds],
    })),
    tolerance: { ...intent.tolerance },
    includesRawDxf: false as const,
    includesTags: false as const,
    includesAst: false as const,
    productionReady: false as const,
  };
  const canonicalSha256 = await sha256Canonical(unsigned, crypto);
  if (!canonicalSha256) return blocked('sha256-unavailable', 'plan', 'SHA-256 is unavailable.');
  return deepFreeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
    plan: { ...unsigned, canonicalSha256 },
    blockers: [] as const,
    claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_CLAIMS_V1,
  });
}
