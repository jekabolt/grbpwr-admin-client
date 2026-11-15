import { compileDxfAssemblyHandoffV1 } from './dxf-assembly-handoff-v1';
import { garmentAssemblyFingerprint, type GarmentAssemblyIR } from './garment-assembly-ir';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2,
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  type PatternImportDxfProductMultiseamSavedRowEvidenceV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  upgradeGarmentPhase2SampledClothMeshV1,
  type GarmentPhase2SampledClothMeshArtifactV1,
  type GarmentPhase2SampledClothMeshUpgradeRequestV1,
} from '../mesh/garment-phase2-sampled-cloth-mesh-upgrader-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_REQUEST_V1 =
  'pattern-import-dxf-product-garment-composer-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_V1 =
  'pattern-import-dxf-product-garment-composer/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_OWNER_V1 =
  'pattern-import-dxf-product-garment-composer-owner/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_MESH_PROJECTION_V1 =
  'pattern-import-dxf-product-garment-composer-mesh-projection/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_SEAL_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_NODES = 1_000_000;
const MAX_SNAPSHOT_PROPERTIES = 2_000_000;
const MAX_SNAPSHOT_ARRAY_LENGTH = 250_000;
const MAX_SNAPSHOT_STRING_LENGTH = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();
const capturedStructuredClone = globalThis.structuredClone?.bind(globalThis);

export type PatternImportDxfProductGarmentComposerExpectedV1 = Readonly<{
  importGeneration: number;
  savedRow: PatternImportDxfProductMultiseamSavedRowEvidenceV2;
  sourceFileId: string;
  documentId: string;
  revision: string;
  sizeSelectionSha256: string;
  catalogCanonicalSha256: string;
  proposalFingerprint: string;
  phaseEPlanSha256: string;
  compositionCanonicalSha256: string;
  twoSeamMappingAggregateSha256: string;
  handoffCanonicalSha256: string;
  pieceIds: readonly [string, string];
  seamIds: readonly [string, string];
  operation: Readonly<{
    id: string;
    sourceOperationNumber: number;
    stage: number;
    order: 0;
  }>;
}>;

/**
 * Phase-2 is deliberately optional until the product path owns native edge witnesses. A caller may
 * not substitute the synthetic beta fixture: the complete request is rebound to the freshly
 * compiled product assembly, source, piece pair and two seam mappings before either upgrade runs.
 */
export type PatternImportDxfProductGarmentComposerRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_REQUEST_V1;
  origin: 'fresh-import' | 'verified-saved-row';
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  expected: PatternImportDxfProductGarmentComposerExpectedV1;
  phase2UpgradeRequest: GarmentPhase2SampledClothMeshUpgradeRequestV1 | null;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_PHASE2_INPUT_V1 = Object.freeze({
  type: 'GarmentPhase2SampledClothMeshUpgradeRequestV1',
  baselineAssembly: 'exact fresh compileDxfAssemblyHandoffV1 assembly',
  baselinePieces: 'exact two selected pieces with audited constrained-triangulation results',
  baselineSeamProofs: 'exact two equal one-edge seams with authored endpoint identities',
  nativeEdgeCoverage:
    'every directed boundary occurrence: sourceFileId/sourceCurveId/line/unit-t-range/chordError=0/periodic=false/identity-transform',
  samplingSeams: 'exact aggregate seam IDs, piece IDs and directions',
  samplingArtifact: 'fresh production Phase2BoundarySamplingArtifactV1 for that exact request',
} as const);

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1 = Object.freeze({
  sourceMode: 'untrusted-product',
  freshCompositionIndependentBuildsRequired: true,
  freshHandoffIndependentCompilesRequired: true,
  phase1FreshCompileOwnedByPhase2Upgrader: true,
  phase2UpgradeRepeatVerified: true,
  freshBoundarySamplingBuiltTwice: false,
  independentBoundarySamplingBuildsIntegrated: false,
  exactlyTwoPiecesRequired: true,
  exactlyTwoEqualSeamsRequired: true,
  exactlyOneLocalStitchOperationRequired: true,
  rawDxfRetained: false,
  partialAuthorityPublished: false,
  persistentAuthority: false,
  previewReady: false,
  placementReady: false,
  runtimeReady: false,
  settled: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1,
  phase1FreshCompileOwnedByPhase2Upgrader: false as const,
  phase2UpgradeRepeatVerified: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_BLOCKERS_V1 = Object.freeze([
  'source-authenticity-not-established',
  'independent-boundary-sampling-owner-not-integrated',
  'placement-not-proven',
  'preview-not-integrated',
  'runtime-owner-not-integrated',
  'settle-not-evaluated',
  'persistence-not-integrated',
  'production-qualification-not-run',
] as const);

export type PatternImportDxfProductGarmentComposerSnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_V1;
  status: 'in-memory-product-mesh-candidate';
  lifetime: 'card-session';
  origin: 'fresh-import' | 'verified-saved-row';
  identity: Readonly<{
    techCardId: number;
    scopeKey: string;
    sizeToken: string;
    patternLineKey: string;
    patternVersion: number;
    cardLockVersion: number;
    importGeneration: number;
    sourceFileId: string;
    sourceSha256: string;
    selectedGeometrySha256: string;
    productExportSha256: string;
  }>;
  assembly: Readonly<{
    documentId: string;
    revision: string;
    sourceOperationNumber: number;
    localOperationOrder: 0;
    pieceIds: readonly [string, string];
    seamIds: readonly [string, string];
    phaseEPlanSha256: string;
    compositionCanonicalSha256: string;
    twoSeamMappingAggregateSha256: string;
    handoffCanonicalSha256: string;
    assemblyFingerprint: string;
  }>;
  mesh: Readonly<{
    phase2ArtifactSha256: string;
    deterministicFingerprint: string;
    vertexCount: number;
    triangleCount: number;
    distributedSeamPairCount: number;
  }>;
  material: Readonly<{
    revisions: readonly string[];
    provenance: 'uncalibrated-visual';
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1;
  blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_BLOCKERS_V1;
}>;

declare const productGarmentComposerOwnerBrand: unique symbol;

export type PatternImportDxfProductGarmentComposerOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_OWNER_V1;
  snapshot: PatternImportDxfProductGarmentComposerSnapshotV1;
  readonly [productGarmentComposerOwnerBrand]: never;
}>;

export type PatternImportDxfProductGarmentComposerMeshProjectionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_MESH_PROJECTION_V1;
  composerCanonicalSha256: string;
  phase2ArtifactSha256: string;
  mesh: ClothMeshIR;
  triangleMaterialFrames2: Float32Array;
  callerOwnedMutableCopies: true;
  placementAuthority: false;
  previewAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductGarmentComposerBlockerV1 = Readonly<{
  code:
    | 'invalid-input'
    | 'mapping-composition-blocked'
    | 'composition-repeat-mismatch'
    | 'expected-binding-mismatch'
    | 'handoff-compile-blocked'
    | 'handoff-repeat-mismatch'
    | 'topology-unsupported'
    | 'phase1-native-edge-proof-required'
    | 'phase2-request-binding-mismatch'
    | 'phase2-upgrade-blocked'
    | 'phase2-repeat-mismatch'
    | 'sha256-unavailable';
  detail: string;
  requiredPhase2Input: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_PHASE2_INPUT_V1 | null;
}>;

export type PatternImportDxfProductGarmentComposerResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductGarmentComposerOwnerV1;
      snapshot: PatternImportDxfProductGarmentComposerSnapshotV1;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_BLOCKERS_V1;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      blockers: readonly [PatternImportDxfProductGarmentComposerBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type PrivateMesh = Readonly<{
  mesh: ClothMeshIR;
  triangleMaterialFrames2: Float32Array;
}>;

type OwnerRecord = { mesh: PrivateMesh; disposed: boolean };
const ownerRecords = new WeakMap<object, OwnerRecord>();

class ComposerFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductGarmentComposerBlockerV1['code'],
    message: string,
    readonly requiredPhase2Input: PatternImportDxfProductGarmentComposerBlockerV1['requiredPhase2Input'] = null,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfProductGarmentComposerBlockerV1['code'],
  detail: string,
  requiredPhase2Input: PatternImportDxfProductGarmentComposerBlockerV1['requiredPhase2Input'] = null,
): never {
  throw new ComposerFailure(code, detail, requiredPhase2Input);
}

function blocked(error: unknown): PatternImportDxfProductGarmentComposerResultV1 {
  const known = error instanceof ComposerFailure;
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    blockers: Object.freeze([
      Object.freeze({
        code: known ? error.code : ('invalid-input' as const),
        detail: known
          ? error.message.slice(0, 1_024)
          : 'Product garment composition rejected malformed or inaccessible input.',
        requiredPhase2Input: known ? error.requiredPhase2Input : null,
      }),
    ]) as readonly [PatternImportDxfProductGarmentComposerBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

type SnapshotScanState = {
  nodes: number;
  properties: number;
  seen: Set<object>;
};

/** Descriptor-only admission: accessors are rejected before structuredClone can invoke them. */
function assertDetachedSnapshotInput(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotScanState,
): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_SNAPSHOT_STRING_LENGTH)
      fail('invalid-input', `${path} exceeds the string bound.`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} contains a non-finite number.`);
    return;
  }
  if (typeof value !== 'object')
    fail('invalid-input', `${path} contains a forbidden executable or symbolic value.`);
  if (depth > MAX_SNAPSHOT_DEPTH) fail('invalid-input', `${path} exceeds the depth bound.`);
  if (state.seen.has(value)) return;
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_SNAPSHOT_NODES) fail('invalid-input', `${path} exceeds the node bound.`);

  if (value instanceof Float32Array || value instanceof Uint32Array) {
    if (value.length > MAX_SNAPSHOT_ARRAY_LENGTH)
      fail('invalid-input', `${path} exceeds the typed-array bound.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== value.length ||
      keys.some((key, index) => key !== String(index)) ||
      Object.values(descriptors).some(
        (descriptor) =>
          !descriptor.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined,
      )
    )
      fail('invalid-input', `${path} typed array contains hidden or accessor properties.`);
    state.properties += keys.length;
    if (state.properties > MAX_SNAPSHOT_PROPERTIES)
      fail('invalid-input', `${path} exceeds the property bound.`);
    return;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', `${path} contains an unsupported binary view.`);

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} reflection failed.`);
  }
  const isArray = Array.isArray(value);
  if (
    (isArray && prototype !== Array.prototype) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  )
    fail('invalid-input', `${path} must contain only plain data records and arrays.`);
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = isArray ? keys.filter((key) => key !== 'length') : keys;
  if (isArray) {
    const array = value as unknown[];
    if (array.length > MAX_SNAPSHOT_ARRAY_LENGTH)
      fail('invalid-input', `${path} exceeds the array bound.`);
    const lengthDescriptor = descriptors.length;
    if (
      !lengthDescriptor ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      dataKeys.length !== array.length ||
      dataKeys.some((key, index) => key !== String(index))
    )
      fail('invalid-input', `${path} must be a dense ordinary array.`);
  }
  state.properties += dataKeys.length;
  if (state.properties > MAX_SNAPSHOT_PROPERTIES)
    fail('invalid-input', `${path} exceeds the property bound.`);
  for (const key of dataKeys) {
    if (typeof key !== 'string') fail('invalid-input', `${path} contains a symbol property.`);
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key} must be an enumerable data property.`);
    assertDetachedSnapshotInput(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  if (ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      deepFreeze(descriptor.value, seen);
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
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return canonical(left) === canonical(right);
  } catch {
    return false;
  }
}

async function digest(
  crypto: Pick<Crypto, 'subtle'> | undefined,
  domain: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'SHA-256 is unavailable.');
  const domainBytes = textEncoder.encode(`${domain}\0`);
  if (domainBytes.byteLength + bytes.byteLength > MAX_SEAL_BYTES)
    fail('invalid-input', 'Canonical seal payload exceeds the byte bound.');
  const joined = new Uint8Array(domainBytes.byteLength + bytes.byteLength);
  joined.set(domainBytes);
  joined.set(bytes, domainBytes.byteLength);
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  if (result.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned an invalid digest.');
  return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digestCanonical(
  crypto: Pick<Crypto, 'subtle'> | undefined,
  domain: string,
  value: unknown,
): Promise<string> {
  return digest(crypto, domain, textEncoder.encode(canonical(value)));
}

function sortedPair(values: readonly string[]): readonly [string, string] | null {
  if (values.length !== 2 || values.some((value) => !STABLE_ID.test(value))) return null;
  const sorted = [...values].sort();
  if (sorted[0] === sorted[1]) return null;
  return sorted as [string, string];
}

type SuccessfulCompositionV2 = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductMultiseamMappingCompositionV2>>,
  { ok: true }
>;

function validateExpected(
  request: PatternImportDxfProductGarmentComposerRequestV1,
  first: SuccessfulCompositionV2,
): void {
  const { expected, compositionRequest } = request;
  const pieceIds = sortedPair(first.handoff.pieces.map(({ id }) => id));
  const seamIds = sortedPair(first.handoff.seams.map(({ id }) => id));
  const expectedPieceIds = sortedPair(expected.pieceIds);
  const expectedSeamIds = sortedPair(expected.seamIds);
  const operation = first.handoff.operations[0];
  if (
    !pieceIds ||
    !seamIds ||
    !expectedPieceIds ||
    !expectedSeamIds ||
    expected.importGeneration !== first.evidence.importGeneration ||
    expected.importGeneration !== compositionRequest.choices.importGeneration ||
    !sameCanonical(expected.savedRow, compositionRequest.current.row) ||
    !sameCanonical(expected.savedRow, compositionRequest.prepared.row) ||
    expected.savedRow.dxfSha256 !== first.evidence.productExportSha256 ||
    expected.sourceFileId !== compositionRequest.catalog.sourceFileId ||
    expected.documentId !== compositionRequest.choices.documentId ||
    expected.revision !== compositionRequest.choices.revision ||
    expected.sizeSelectionSha256 !== first.evidence.sizeSelectionSha256 ||
    expected.catalogCanonicalSha256 !== first.evidence.catalogSha256 ||
    expected.proposalFingerprint !== first.evidence.proposalFingerprint ||
    expected.phaseEPlanSha256 !== first.evidence.phaseEPlanSha256 ||
    expected.compositionCanonicalSha256 !== first.compositionSeal.canonicalSha256 ||
    expected.twoSeamMappingAggregateSha256 !== first.aggregateSeal.canonicalSha256 ||
    expected.handoffCanonicalSha256 !== first.handoff.seal.canonicalSha256 ||
    !sameCanonical(pieceIds, expectedPieceIds) ||
    !sameCanonical(seamIds, expectedSeamIds) ||
    !operation ||
    first.handoff.operations.length !== 1 ||
    expected.operation.id !== operation.id ||
    expected.operation.sourceOperationNumber !== first.evidence.sourceOperationNumber ||
    expected.operation.stage !== operation.stage ||
    expected.operation.order !== 0 ||
    operation.order !== 0
  )
    fail(
      'expected-binding-mismatch',
      'Retained generation, row, selection, Phase-E and composition seals must exact-match the fresh product composition.',
    );
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(value: string): void {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

function validateTopology(
  composition: SuccessfulCompositionV2,
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  assembly: GarmentAssemblyIR,
): Readonly<{ pieceIds: readonly [string, string]; seamIds: readonly [string, string] }> {
  const { handoff, aggregate } = composition;
  const pieceIds = sortedPair(assembly.pieces.map(({ id }) => id));
  const seamIds = sortedPair(assembly.seams.map(({ id }) => id));
  const operation = assembly.operations[0];
  if (
    !pieceIds ||
    !seamIds ||
    assembly.physicalSurface.mode !== 'sewing-surface' ||
    assembly.physicalSurface.seamAllowancePhysical !== false ||
    assembly.operations.length !== 1 ||
    !operation ||
    operation.order !== 0 ||
    operation.kind !== 'stitch' ||
    !sameCanonical([...operation.seamIds].sort(), seamIds) ||
    assembly.seams.some(
      (seam) =>
        seam.mapping !== 'equal' ||
        seam.lengthRatio !== 1 ||
        seam.operationId !== operation.id ||
        !sameCanonical(seam.sides.map(({ pieceId }) => pieceId).sort(), pieceIds),
    ) ||
    handoff.materials.length !== 2 ||
    pieceIds.some(
      (pieceId) =>
        handoff.materials.filter((material) => material.pieceIds.includes(pieceId)).length !== 1,
    )
  )
    fail(
      'topology-unsupported',
      'Product composer V1 requires exactly two pieces, two equal seams and one local-order-zero stitch operation.',
    );

  if (
    aggregate.operation.id !== operation.id ||
    aggregate.operation.stage !== handoff.operations[0]?.stage ||
    aggregate.operation.order !== operation.order ||
    aggregate.operation.kind !== operation.kind ||
    !sameCanonical([...aggregate.operation.seamIds].sort(), seamIds) ||
    !sameCanonical([...aggregate.scope.pieceIds].sort(), pieceIds) ||
    aggregate.sourceBinding.sourceFileId !== request.catalog.sourceFileId ||
    aggregate.sourceBinding.documentId !== handoff.source.documentId ||
    aggregate.sourceBinding.revision !== handoff.source.revision ||
    !sameCanonical(
      handoff.materials
        .map(({ id, pieceIds: materialPieces, materialRevision }) => ({
          id,
          pieceIds: [...materialPieces].sort(),
          materialRevision,
        }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      request.choices.materials
        .map(({ id, pieceIds: materialPieces, materialRevision }) => ({
          id,
          pieceIds: [...materialPieces].sort(),
          materialRevision,
        }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    )
  )
    fail(
      'topology-unsupported',
      'Full handoff operation, material and aggregate source graphs must exact-match.',
    );

  const disjoint = new DisjointSet();
  const seamEdgeIndices = new Map<string, Set<number>>();
  const seamEndpoints = new Map<string, Set<string>>();
  for (const piece of handoff.pieces) {
    const shells = piece.contours.filter(({ role }) => role === 'sewing-boundary');
    if (shells.length !== 1)
      fail('topology-unsupported', `${piece.id} must have exactly one sewing contour.`);
    seamEdgeIndices.set(piece.id, new Set<number>());
    seamEndpoints.set(piece.id, new Set<string>());
    for (const vertex of shells[0]!.vertices) disjoint.add(`${piece.id}\0${vertex.id}`);
  }

  for (const seam of handoff.seams) {
    const mapped = aggregate.seams.find(({ id }) => id === seam.id);
    if (!mapped || mapped.operationId !== seam.operationId || mapped.sides.length !== 2)
      fail('topology-unsupported', `${seam.id} is not exact-bound to the aggregate mapping.`);
    const directedSides: Array<{
      pieceId: string;
      start: string;
      end: string;
    }> = [];
    for (const side of seam.sides) {
      const piece = handoff.pieces.find(({ id }) => id === side.pieceId);
      const shell = piece?.contours.find(({ role }) => role === 'sewing-boundary');
      const mappedSide = mapped.sides.find(({ pieceId }) => pieceId === side.pieceId);
      if (!piece || !shell || !mappedSide || side.contourId !== shell.id)
        fail(
          'topology-unsupported',
          `${seam.id}/${side.pieceId} must use the one exact sewing contour.`,
        );
      const startIndex = shell.vertices.findIndex(({ id }) => id === side.anchors[0]);
      const endIndex = shell.vertices.findIndex(({ id }) => id === side.anchors[1]);
      if (startIndex < 0 || (startIndex + 1) % shell.vertices.length !== endIndex)
        fail(
          'topology-unsupported',
          `${seam.id}/${side.pieceId} must bind one exact adjacent source edge.`,
        );
      const indices = seamEdgeIndices.get(side.pieceId)!;
      if (indices.has(startIndex))
        fail('topology-unsupported', `${seam.id}/${side.pieceId} repeats a seam edge.`);
      indices.add(startIndex);
      const directedAnchors =
        side.direction === 'forward'
          ? ([side.anchors[0], side.anchors[1]] as const)
          : ([side.anchors[1], side.anchors[0]] as const);
      const endpointSet = seamEndpoints.get(side.pieceId)!;
      if (directedAnchors.some((vertexId) => endpointSet.has(vertexId)))
        fail('topology-unsupported', `${seam.id}/${side.pieceId} reuses a cross-seam endpoint.`);
      directedAnchors.forEach((vertexId) => endpointSet.add(vertexId));
      if (
        mappedSide.contourId !== side.contourId ||
        mappedSide.direction !== side.direction ||
        mappedSide.orderedSamples.length !== 2 ||
        !sameCanonical(mappedSide.authoredAnchors, side.anchors) ||
        mappedSide.orderedSamples[0]?.vertexId !== directedAnchors[0] ||
        mappedSide.orderedSamples[1]?.vertexId !== directedAnchors[1]
      )
        fail(
          'topology-unsupported',
          `${seam.id}/${side.pieceId} direction or exact side evidence differs from the full handoff.`,
        );
      directedSides.push({
        pieceId: side.pieceId,
        start: directedAnchors[0],
        end: directedAnchors[1],
      });
    }
    if (directedSides.length !== 2)
      fail('topology-unsupported', `${seam.id} must have two exact directed sides.`);
    disjoint.union(
      `${directedSides[0]!.pieceId}\0${directedSides[0]!.start}`,
      `${directedSides[1]!.pieceId}\0${directedSides[1]!.start}`,
    );
    disjoint.union(
      `${directedSides[0]!.pieceId}\0${directedSides[0]!.end}`,
      `${directedSides[1]!.pieceId}\0${directedSides[1]!.end}`,
    );
  }

  const freeEdges: Array<readonly [string, string]> = [];
  for (const piece of handoff.pieces) {
    const shell = piece.contours.find(({ role }) => role === 'sewing-boundary')!;
    const consumed = seamEdgeIndices.get(piece.id)!;
    if (consumed.size !== 2)
      fail('topology-unsupported', `${piece.id} must contribute exactly two distinct seam edges.`);
    shell.vertices.forEach((vertex, edgeIndex) => {
      if (consumed.has(edgeIndex)) return;
      freeEdges.push([
        `${piece.id}\0${vertex.id}`,
        `${piece.id}\0${shell.vertices[(edgeIndex + 1) % shell.vertices.length]!.id}`,
      ]);
    });
  }
  const adjacency = new Map<string, string[]>();
  for (const [left, right] of freeEdges) {
    const leftRoot = disjoint.find(left);
    const rightRoot = disjoint.find(right);
    const leftRows = adjacency.get(leftRoot) ?? [];
    const rightRows = adjacency.get(rightRoot) ?? [];
    leftRows.push(rightRoot);
    rightRows.push(leftRoot);
    adjacency.set(leftRoot, leftRows);
    adjacency.set(rightRoot, rightRows);
  }
  if ([...adjacency.values()].some((neighbors) => neighbors.length !== 2))
    fail(
      'topology-unsupported',
      'The seam quotient must leave closed, nonbranching free-boundary components.',
    );
  const visited = new Set<string>();
  let components = 0;
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    components += 1;
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adjacency.get(current) ?? []) if (!visited.has(next)) queue.push(next);
    }
  }
  if (components !== 2)
    fail(
      'topology-unsupported',
      'The exact two-seam quotient must yield two free boundary components.',
    );
  return { pieceIds, seamIds };
}

function bindPhase2Request(
  request: GarmentPhase2SampledClothMeshUpgradeRequestV1,
  assembly: GarmentAssemblyIR,
  sourceFileId: string,
  seamIds: readonly [string, string],
): void {
  const pieceIds = sortedPair(assembly.pieces.map(({ id }) => id));
  const baselinePieceIds = sortedPair(request.baselineRequest.pieces.map(({ pieceId }) => pieceId));
  const samplingPieceIds = sortedPair(
    request.samplingRequest.pieces.map(({ input }) => input.pieceId),
  );
  const proofSeamIds = sortedPair(request.baselineRequest.seamProofs.map(({ seamId }) => seamId));
  const samplingSeamIds = sortedPair(
    request.samplingRequest.equalSeams.map(({ seamId }) => seamId),
  );
  if (
    !pieceIds ||
    !baselinePieceIds ||
    !samplingPieceIds ||
    !proofSeamIds ||
    !samplingSeamIds ||
    !sameCanonical(request.baselineRequest.assembly, assembly) ||
    !sameCanonical(baselinePieceIds, pieceIds) ||
    !sameCanonical(samplingPieceIds, pieceIds) ||
    !sameCanonical(proofSeamIds, seamIds) ||
    !sameCanonical(samplingSeamIds, seamIds) ||
    request.samplingRequest.sourceFileId !== sourceFileId
  )
    fail(
      'phase2-request-binding-mismatch',
      'Phase-2 request must exact-bind the fresh assembly, two selected pieces and both aggregate seams.',
    );
}

type BinarySegment = Readonly<{
  kind: 1 | 2;
  values: Float32Array | Uint32Array;
}>;

function artifactMetadata(value: unknown, segments: BinarySegment[]): unknown {
  if (value instanceof Float32Array) {
    const index = segments.length;
    segments.push({ kind: 1, values: value });
    return { binary: 'Float32Array', index, length: value.length };
  }
  if (value instanceof Uint32Array) {
    const index = segments.length;
    segments.push({ kind: 2, values: value });
    return { binary: 'Uint32Array', index, length: value.length };
  }
  if (Array.isArray(value)) return value.map((item) => artifactMetadata(item, segments));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, artifactMetadata(record[key], segments)]),
    );
  }
  return value;
}

async function artifactSha256(
  artifact: GarmentPhase2SampledClothMeshArtifactV1,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  const segments: BinarySegment[] = [];
  const metadata = textEncoder.encode(canonical(artifactMetadata(artifact, segments)));
  const total =
    4 +
    metadata.byteLength +
    segments.reduce((sum, segment) => sum + 5 + segment.values.length * 4, 0);
  if (!Number.isSafeInteger(total) || total > MAX_SEAL_BYTES)
    fail('invalid-input', 'Phase-2 artifact seal exceeds the byte bound.');
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  view.setUint32(offset, metadata.byteLength, true);
  offset += 4;
  bytes.set(metadata, offset);
  offset += metadata.byteLength;
  for (const segment of segments) {
    view.setUint8(offset, segment.kind);
    offset += 1;
    view.setUint32(offset, segment.values.length, true);
    offset += 4;
    for (let index = 0; index < segment.values.length; index += 1) {
      if (segment.kind === 1) view.setFloat32(offset, segment.values[index]!, true);
      else view.setUint32(offset, segment.values[index]!, true);
      offset += 4;
    }
  }
  return digest(crypto, 'pattern-import-dxf-product-garment-composer-phase2-artifact-v1', bytes);
}

function distributedPairCount(artifact: GarmentPhase2SampledClothMeshArtifactV1): number {
  if (
    artifact.mesh.pieceRanges.length !== 2 ||
    artifact.mesh.seams.length !== 2 ||
    artifact.mesh.seams.some(
      (seam) => seam.mapping !== 'equal' || seam.lengthRatio !== 1 || seam.vertexPairs.length < 6,
    )
  )
    fail(
      'phase2-request-binding-mismatch',
      'Phase-2 output must contain two distributed equal seams with at least three pairs each.',
    );
  return artifact.mesh.seams.reduce((sum, seam) => sum + seam.vertexPairs.length / 2, 0);
}

function ownMesh(artifact: GarmentPhase2SampledClothMeshArtifactV1): PrivateMesh {
  const mesh: ClothMeshIR = Object.freeze({
    ...artifact.mesh,
    restPositions2Mm: new Float32Array(artifact.mesh.restPositions2Mm),
    triangles: new Uint32Array(artifact.mesh.triangles),
    pieceRanges: Object.freeze(
      artifact.mesh.pieceRanges.map((range) => Object.freeze({ ...range })),
    ),
    boundarySamples: Object.freeze(
      artifact.mesh.boundarySamples.map((sample) => Object.freeze({ ...sample })),
    ),
    seams: Object.freeze(
      artifact.mesh.seams.map((seam) =>
        Object.freeze({ ...seam, vertexPairs: new Uint32Array(seam.vertexPairs) }),
      ),
    ),
    quality: Object.freeze({ ...artifact.mesh.quality }),
  });
  return Object.freeze({
    mesh,
    triangleMaterialFrames2: new Float32Array(artifact.triangleMaterialFrames2),
  });
}

function projectMesh(privateMesh: PrivateMesh): PrivateMesh {
  return Object.freeze({
    mesh: Object.freeze({
      ...privateMesh.mesh,
      restPositions2Mm: new Float32Array(privateMesh.mesh.restPositions2Mm),
      triangles: new Uint32Array(privateMesh.mesh.triangles),
      pieceRanges: Object.freeze(
        privateMesh.mesh.pieceRanges.map((range) => Object.freeze({ ...range })),
      ),
      boundarySamples: Object.freeze(
        privateMesh.mesh.boundarySamples.map((sample) => Object.freeze({ ...sample })),
      ),
      seams: Object.freeze(
        privateMesh.mesh.seams.map((seam) =>
          Object.freeze({ ...seam, vertexPairs: new Uint32Array(seam.vertexPairs) }),
        ),
      ),
      quality: Object.freeze({ ...privateMesh.mesh.quality }),
    }),
    triangleMaterialFrames2: new Float32Array(privateMesh.triangleMaterialFrames2),
  });
}

let claimed = false;

export async function buildPatternImportDxfProductGarmentComposerV1(
  inputValue: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductGarmentComposerResultV1> {
  if (claimed)
    return blocked(new ComposerFailure('invalid-input', 'Reentrant composer call refused.'));
  claimed = true;
  try {
    if (!capturedStructuredClone)
      fail('invalid-input', 'Native structuredClone is required for detached composition.');
    assertDetachedSnapshotInput(inputValue, 'input', 0, {
      nodes: 0,
      properties: 0,
      seen: new Set<object>(),
    });
    let request: PatternImportDxfProductGarmentComposerRequestV1;
    try {
      request = capturedStructuredClone(
        inputValue,
      ) as PatternImportDxfProductGarmentComposerRequestV1;
    } catch {
      fail('invalid-input', 'Composer request could not be detached.');
    }
    if (
      !request ||
      request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_REQUEST_V1 ||
      !['fresh-import', 'verified-saved-row'].includes(request.origin) ||
      request.compositionRequest?.schemaVersion === undefined ||
      !request.expected
    )
      fail('invalid-input', 'Exact product composer request is required.');
    const crypto = options.crypto ?? globalThis.crypto;
    const first = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
      crypto,
    );
    if (!first.ok)
      fail(
        'mapping-composition-blocked',
        first.blockers.map(({ code }) => code).join(', ') || 'Fresh mapping composition failed.',
      );
    const second = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
      crypto,
    );
    if (!second.ok)
      fail('composition-repeat-mismatch', 'Independent mapping composition repeat was blocked.');
    if (
      first.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2 ||
      first.compositionSeal.canonicalSha256 !== second.compositionSeal.canonicalSha256 ||
      first.aggregateSeal.canonicalSha256 !== second.aggregateSeal.canonicalSha256 ||
      first.handoff.seal.canonicalSha256 !== second.handoff.seal.canonicalSha256 ||
      !sameCanonical(first.evidence, second.evidence) ||
      !sameCanonical(first.aggregate, second.aggregate) ||
      !sameCanonical(first.handoff, second.handoff)
    )
      fail(
        'composition-repeat-mismatch',
        'Two independent fresh product compositions differ exactly.',
      );
    validateExpected(request, first);

    const [firstCompilation, secondCompilation] = await Promise.all([
      compileDxfAssemblyHandoffV1(first.handoff, { crypto }),
      compileDxfAssemblyHandoffV1(first.handoff, { crypto }),
    ]);
    if (!('assembly' in firstCompilation))
      fail(
        'handoff-compile-blocked',
        `${firstCompilation.code}: ${firstCompilation.errors.join('; ')}`,
      );
    if (
      !('assembly' in secondCompilation) ||
      firstCompilation.sourceHandoffSha256 !== secondCompilation.sourceHandoffSha256 ||
      !sameCanonical(firstCompilation.assembly, secondCompilation.assembly)
    )
      fail('handoff-repeat-mismatch', 'Independent handoff compilation differs exactly.');
    const topology = validateTopology(first, request.compositionRequest, firstCompilation.assembly);

    if (!request.phase2UpgradeRequest)
      fail(
        'phase1-native-edge-proof-required',
        'Fresh product composition and handoff compilation succeeded, but native boundary-edge evidence for Phase-1/Phase-2 is not integrated.',
        PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_PHASE2_INPUT_V1,
      );
    bindPhase2Request(
      request.phase2UpgradeRequest,
      firstCompilation.assembly,
      request.compositionRequest.catalog.sourceFileId,
      topology.seamIds,
    );

    let firstArtifact: GarmentPhase2SampledClothMeshArtifactV1;
    let secondArtifact: GarmentPhase2SampledClothMeshArtifactV1;
    try {
      firstArtifact = upgradeGarmentPhase2SampledClothMeshV1(request.phase2UpgradeRequest);
      secondArtifact = upgradeGarmentPhase2SampledClothMeshV1(request.phase2UpgradeRequest);
    } catch (error) {
      fail(
        'phase2-upgrade-blocked',
        error instanceof Error ? error.message : 'Fresh Phase-2 upgrade failed.',
      );
    }
    const [firstArtifactSha256, secondArtifactSha256] = await Promise.all([
      artifactSha256(firstArtifact, crypto),
      artifactSha256(secondArtifact, crypto),
    ]);
    if (
      firstArtifactSha256 !== secondArtifactSha256 ||
      firstArtifact.deterministicFingerprint !== secondArtifact.deterministicFingerprint
    )
      fail(
        'phase2-repeat-mismatch',
        'Repeated Phase-2 upgrades over the same audited sampling artifact differ by byte seal or fingerprint.',
      );
    const assemblyFingerprint = garmentAssemblyFingerprint(firstCompilation.assembly);
    if (
      firstArtifact.mesh.sourceAssemblyFingerprint !== assemblyFingerprint ||
      firstArtifact.sourceBinding.assemblyDocumentId !==
        firstCompilation.assembly.source.documentId ||
      firstArtifact.sourceBinding.assemblyRevision !== firstCompilation.assembly.source.revision ||
      firstArtifact.sourceBinding.samplingSourceFileId !==
        first.aggregate.sourceBinding.sourceFileId
    )
      fail(
        'phase2-request-binding-mismatch',
        'Fresh Phase-2 artifact is not bound to the product assembly and source identity.',
      );
    const pairCount = distributedPairCount(firstArtifact);
    const identity = Object.freeze({
      techCardId: first.evidence.techCardId,
      scopeKey: first.evidence.scopeKey,
      sizeToken: request.compositionRequest.catalog.sizeToken,
      patternLineKey: first.evidence.patternLineKey,
      patternVersion: first.evidence.patternVersion,
      cardLockVersion: first.evidence.cardLockVersion,
      importGeneration: first.evidence.importGeneration,
      sourceFileId: request.compositionRequest.catalog.sourceFileId,
      sourceSha256: first.handoff.source.sourceSha256,
      selectedGeometrySha256: first.aggregate.sourceBinding.baseFinalCoordinateSha256,
      productExportSha256: first.evidence.productExportSha256,
    });
    const assembly = deepFreeze({
      documentId: first.handoff.source.documentId,
      revision: first.handoff.source.revision,
      sourceOperationNumber: first.evidence.sourceOperationNumber,
      localOperationOrder: 0 as const,
      pieceIds: [...topology.pieceIds] as [string, string],
      seamIds: [...topology.seamIds] as [string, string],
      phaseEPlanSha256: first.evidence.phaseEPlanSha256,
      compositionCanonicalSha256: first.compositionSeal.canonicalSha256,
      twoSeamMappingAggregateSha256: first.aggregateSeal.canonicalSha256,
      handoffCanonicalSha256: first.handoff.seal.canonicalSha256,
      assemblyFingerprint,
    });
    const mesh = Object.freeze({
      phase2ArtifactSha256: firstArtifactSha256,
      deterministicFingerprint: firstArtifact.deterministicFingerprint,
      vertexCount: firstArtifact.mesh.restPositions2Mm.length / 2,
      triangleCount: firstArtifact.mesh.triangles.length / 3,
      distributedSeamPairCount: pairCount,
    });
    const material = Object.freeze({
      revisions: Object.freeze(
        first.handoff.materials.map(({ materialRevision }) => materialRevision).sort(),
      ),
      provenance: 'uncalibrated-visual' as const,
    });
    const canonicalSha256 = await digestCanonical(
      crypto,
      'pattern-import-dxf-product-garment-composer-v1',
      {
        identity,
        assembly,
        mesh,
        material,
        claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1,
      },
    );
    const snapshot: PatternImportDxfProductGarmentComposerSnapshotV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_V1,
      status: 'in-memory-product-mesh-candidate' as const,
      lifetime: 'card-session' as const,
      origin: request.origin,
      identity,
      assembly,
      mesh,
      material,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_BLOCKERS_V1,
    });
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_OWNER_V1,
      snapshot,
    }) as PatternImportDxfProductGarmentComposerOwnerV1;
    ownerRecords.set(owner, { mesh: ownMesh(firstArtifact), disposed: false });
    return deepFreeze({
      ok: true as const,
      owner,
      snapshot,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_BLOCKERS_V1,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}

export function materializePatternImportDxfProductGarmentComposerMeshV1(
  candidate: unknown,
): PatternImportDxfProductGarmentComposerMeshProjectionV1 | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = ownerRecords.get(candidate);
  const owner = candidate as PatternImportDxfProductGarmentComposerOwnerV1;
  if (!record || record.disposed) return null;
  const projection = projectMesh(record.mesh);
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_COMPOSER_MESH_PROJECTION_V1,
    composerCanonicalSha256: owner.snapshot.seal.canonicalSha256,
    phase2ArtifactSha256: owner.snapshot.mesh.phase2ArtifactSha256,
    mesh: projection.mesh,
    triangleMaterialFrames2: projection.triangleMaterialFrames2,
    callerOwnedMutableCopies: true as const,
    placementAuthority: false as const,
    previewAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposePatternImportDxfProductGarmentComposerOwnerV1(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = ownerRecords.get(candidate);
  if (!record || record.disposed) return false;
  record.mesh.mesh.restPositions2Mm.fill(0);
  record.mesh.mesh.triangles.fill(0);
  record.mesh.mesh.seams.forEach(({ vertexPairs }) => vertexPairs.fill(0));
  record.mesh.triangleMaterialFrames2.fill(0);
  record.disposed = true;
  ownerRecords.delete(candidate);
  return true;
}
