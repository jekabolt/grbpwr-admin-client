import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2,
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import type { PatternImportDxfProductGarmentComposerExpectedV1 } from './pattern-import-dxf-product-garment-composer-v1';
import {
  DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1,
  buildDxfProductPhase2FreshBuildOwnerV1,
  disposeDxfProductPhase2FreshBuildOwnerV1,
  projectDxfProductPhase2FreshBuildOwnerV1,
  type DxfProductPhase2FreshBuildOwnerV1,
} from './dxf-product-phase2-fresh-build-owner-v1';
import type { DxfProductPhase1BuildInputsRequestV1 } from './dxf-product-phase1-build-inputs-v1';
import type { DxfProductPhaseDNativeStraightEdgesOwnerV3 } from './dxf-product-phase-d-native-straight-edge-binding-v1';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1,
  buildDxfProductPhase2RefinedBuildOwnerV1,
  type DxfProductPhase2RefinedBuildResultV1,
} from './dxf-product-phase2-refined-build-owner-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2 =
  'pattern-import-dxf-product-garment-mesh-composer-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2 =
  'pattern-import-dxf-product-garment-mesh-composer/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V2 =
  'pattern-import-dxf-product-garment-mesh-composer-owner/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V2 =
  'pattern-import-dxf-product-garment-mesh-composer-projection/2' as const;

const MAX_DEPTH = 40;
const MAX_NODES = 1_000_000;
const MAX_PROPERTIES = 2_000_000;
const MAX_ARRAY = 250_000;
const MAX_STRING = 16 * 1024 * 1024;
const MAX_SEAL_BYTES = 32 * 1024 * 1024;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const encoder = new TextEncoder();
const clone = globalThis.structuredClone?.bind(globalThis);

export type PatternImportDxfProductGarmentMeshComposerRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2;
  origin: 'fresh-import' | 'verified-saved-row';
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  expected: PatternImportDxfProductGarmentComposerExpectedV1;
  phase1BuildInputsRequest: DxfProductPhase1BuildInputsRequestV1;
  phaseDNativeStraightEdgeOwner: DxfProductPhaseDNativeStraightEdgesOwnerV3;
  targetEdgeMm: number;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2 = Object.freeze({
  status: 'in-memory-product-mesh-authority-candidate',
  freshCompositionBuiltTwice: true,
  deterministicMeshBuiltTwice: true,
  pinnedCdt2dInvocationCount: 8,
  sourceNativeBound: true,
  rowAndImportGenerationBound: true,
  rowChronologyAuthenticated: false,
  rawDxfRetained: false,
  callerTypedArraysRetained: false,
  staticPreviewReady: false,
  placementReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  savedRowPersistenceAuthority: false,
  settleAccepted: false,
  sourceAuthenticityAccepted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2,
  freshCompositionBuiltTwice: false as const,
  deterministicMeshBuiltTwice: false as const,
  pinnedCdt2dInvocationCount: 0 as const,
  sourceNativeBound: false as const,
  rowAndImportGenerationBound: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V2 = Object.freeze([
  'code-generated-canonical-acceptance-candidate-only',
  'real-product-fixture-not-cleared',
  'row-chronology-not-authenticated',
  'source-authenticity-not-established',
  'static-preview-not-integrated',
  'placement-not-proven',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'production-qualification-not-run',
] as const);

export type PatternImportDxfProductGarmentMeshComposerSnapshotV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2;
  status: 'in-memory-product-mesh-authority-candidate';
  origin: 'fresh-import' | 'verified-saved-row';
  row: Readonly<{
    techCardId: number;
    scopeKey: string;
    patternLineKey: string;
    patternVersion: number;
    cardLockVersion: number;
    importGeneration: number;
    dxfSha256: string;
  }>;
  assembly: Readonly<{
    documentId: string;
    revision: string;
    sourceOperationNumber: number;
    localOperationOrder: 0;
    pieceIds: readonly [string, string];
    seamIds: readonly [string, string];
  }>;
  seals: Readonly<{
    sizeSelectionSha256: string;
    catalogCanonicalSha256: string;
    proposalFingerprint: string;
    phaseEPlanSha256: string;
    compositionCanonicalSha256: string;
    handoffCanonicalSha256: string;
    aggregateCanonicalSha256: string;
    sourceFileSha256: string;
    handoffSourceAggregateSha256: string;
    productExportSha256: string;
    sourceNativeAuthoritySha256: string;
    nativeStraightEdgesSha256: string;
    phase2ArtifactSha256: string;
    phase2OwnerCanonicalSha256: string;
  }>;
  mesh: Readonly<{
    deterministicFingerprint: string;
    pieceCount: 2;
    seamCount: 2;
    vertexCount: number;
    triangleCount: number;
    distributedSeamPairCount: number;
    cdt2dInvocationCount: 8;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2;
  blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V2;
}>;

declare const garmentMeshOwnerBrand: unique symbol;
export type PatternImportDxfProductGarmentMeshComposerOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V2;
  snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  readonly [garmentMeshOwnerBrand]: never;
}>;

export type PatternImportDxfProductGarmentMeshComposerProjectionV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V2;
  composerCanonicalSha256: string;
  phase2ArtifactSha256: string;
  mesh: ClothMeshIR;
  triangleMaterialFrames2: Float32Array;
  callerOwnedMutableCopies: true;
  staticPreviewAuthority: false;
  placementAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductGarmentMeshComposerBlockerCodeV2 =
  | 'invalid-input'
  | 'mapping-composition-blocked'
  | 'composition-repeat-mismatch'
  | 'expected-binding-mismatch'
  | 'topology-unsupported'
  | 'phase1-request-binding-mismatch'
  | 'phase2-fresh-build-blocked'
  | 'phase2-post-binding-mismatch'
  | 'sha256-unavailable';

export type PatternImportDxfProductGarmentMeshComposerBlockerV2 = Readonly<{
  code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV2;
  detail: string;
}>;

export type PatternImportDxfProductGarmentMeshComposerResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
      snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [PatternImportDxfProductGarmentMeshComposerBlockerV2];
    }>;

type OwnerRecord = { nested: DxfProductPhase2FreshBuildOwnerV1; disposed: boolean };
const owners = new WeakMap<object, OwnerRecord>();

class ComposerFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV2,
    detail: string,
  ) {
    super(detail);
  }
}

function fail(
  code: PatternImportDxfProductGarmentMeshComposerBlockerCodeV2,
  detail: string,
): never {
  throw new ComposerFailure(code, detail.slice(0, 2_048));
}

function blocked(error: unknown): PatternImportDxfProductGarmentMeshComposerResultV2 {
  const failure =
    error instanceof ComposerFailure
      ? error
      : new ComposerFailure(
          'invalid-input',
          error instanceof Error
            ? error.message
            : 'Product garment mesh composition failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: BLOCKED_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message.slice(0, 2_048) }),
    ]) as readonly [PatternImportDxfProductGarmentMeshComposerBlockerV2],
  });
}

type ScanState = { nodes: number; properties: number; seen: Set<object> };

function scanPlain(value: unknown, path: string, depth: number, state: ScanState): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) fail('invalid-input', `${path} exceeds the string bound.`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} must be finite.`);
    return;
  }
  if (typeof value !== 'object') fail('invalid-input', `${path} must contain plain data only.`);
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds the depth bound.`);
  if (state.seen.has(value)) return;
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail('invalid-input', `${path} exceeds the node bound.`);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', `${path} cannot contain binary views.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} could not be inspected safely.`);
  }
  const array = Array.isArray(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  )
    fail('invalid-input', `${path} must be a plain record or array.`);
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
  if (array) {
    if ((value as unknown[]).length > MAX_ARRAY)
      fail('invalid-input', `${path} exceeds the array bound.`);
    if (
      dataKeys.length !== (value as unknown[]).length ||
      dataKeys.some((key, index) => key !== String(index))
    )
      fail('invalid-input', `${path} must be a dense array.`);
  }
  state.properties += dataKeys.length;
  if (state.properties > MAX_PROPERTIES)
    fail('invalid-input', `${path} exceeds the property bound.`);
  for (const key of dataKeys) {
    if (typeof key !== 'string') fail('invalid-input', `${path} cannot contain symbols.`);
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
    scanPlain(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
}

type DetachedRequest = Omit<
  PatternImportDxfProductGarmentMeshComposerRequestV2,
  'phaseDNativeStraightEdgeOwner'
>;

function exactDetachedRequest(input: unknown): { request: DetachedRequest; nativeOwner: unknown } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'Composer request must be an exact record.');
  let descriptors: PropertyDescriptorMap;
  try {
    if (Object.getPrototypeOf(input) !== Object.prototype)
      fail('invalid-input', 'Composer request must be a plain record.');
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    if (error instanceof ComposerFailure) throw error;
    fail('invalid-input', 'Composer request reflection failed.');
  }
  const expected = [
    'schemaVersion',
    'origin',
    'compositionRequest',
    'expected',
    'phase1BuildInputsRequest',
    'phaseDNativeStraightEdgeOwner',
    'targetEdgeMm',
  ].sort();
  const ownKeys = Reflect.ownKeys(descriptors);
  const actual = ownKeys.filter((key): key is string => typeof key === 'string').sort();
  if (
    ownKeys.some((key) => typeof key !== 'string') ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'Composer request has an invalid exact shape.');
  expected.forEach((key) => {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      fail('invalid-input', `request.${key} must be one enumerable data property.`);
  });
  const plain = {
    schemaVersion: descriptors.schemaVersion.value,
    origin: descriptors.origin.value,
    compositionRequest: descriptors.compositionRequest.value,
    expected: descriptors.expected.value,
    phase1BuildInputsRequest: descriptors.phase1BuildInputsRequest.value,
    targetEdgeMm: descriptors.targetEdgeMm.value,
  };
  scanPlain(plain, 'request', 0, { nodes: 0, properties: 0, seen: new Set<object>() });
  if (!clone) fail('invalid-input', 'Native structuredClone is required.');
  let request: DetachedRequest;
  try {
    request = clone(plain) as DetachedRequest;
  } catch {
    fail('invalid-input', 'Composer request could not be detached.');
  }
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2 ||
    (request.origin !== 'fresh-import' && request.origin !== 'verified-saved-row') ||
    !Number.isFinite(request.targetEdgeMm) ||
    request.targetEdgeMm <= 0
  )
    fail('invalid-input', 'Composer request schema, origin, or targetEdgeMm is invalid.');
  return { request, nativeOwner: descriptors.phaseDNativeStraightEdgeOwner.value };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite canonical number');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
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

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > MAX_SEAL_BYTES) fail('invalid-input', 'Composer seal exceeds its bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof ComposerFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function sortedPair(values: readonly string[]): readonly [string, string] | null {
  if (values.length !== 2 || values.some((value) => !STABLE_ID.test(value))) return null;
  const sorted = [...values].sort();
  return sorted[0] === sorted[1] ? null : (sorted as [string, string]);
}

type SuccessfulComposition = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductMultiseamMappingCompositionV2>>,
  { ok: true }
>;

function validateExpected(request: DetachedRequest, composition: SuccessfulComposition): void {
  const { expected, compositionRequest } = request;
  const pieceIds = sortedPair(composition.handoff.pieces.map(({ id }) => id));
  const seamIds = sortedPair(composition.handoff.seams.map(({ id }) => id));
  const expectedPieces = sortedPair(expected.pieceIds);
  const expectedSeams = sortedPair(expected.seamIds);
  const operation = composition.handoff.operations[0];
  if (
    !pieceIds ||
    !seamIds ||
    !expectedPieces ||
    !expectedSeams ||
    expected.importGeneration !== composition.evidence.importGeneration ||
    expected.importGeneration !== compositionRequest.choices.importGeneration ||
    !sameCanonical(expected.savedRow, compositionRequest.prepared.row) ||
    !sameCanonical(expected.savedRow, compositionRequest.current.row) ||
    expected.savedRow.dxfSha256 !== composition.evidence.productExportSha256 ||
    expected.sourceFileId !== compositionRequest.catalog.sourceFileId ||
    expected.documentId !== compositionRequest.choices.documentId ||
    expected.revision !== compositionRequest.choices.revision ||
    expected.sizeSelectionSha256 !== composition.evidence.sizeSelectionSha256 ||
    expected.catalogCanonicalSha256 !== composition.evidence.catalogSha256 ||
    expected.proposalFingerprint !== composition.evidence.proposalFingerprint ||
    expected.phaseEPlanSha256 !== composition.evidence.phaseEPlanSha256 ||
    expected.compositionCanonicalSha256 !== composition.compositionSeal.canonicalSha256 ||
    expected.twoSeamMappingAggregateSha256 !== composition.aggregateSeal.canonicalSha256 ||
    expected.handoffCanonicalSha256 !== composition.handoff.seal.canonicalSha256 ||
    !sameCanonical(pieceIds, expectedPieces) ||
    !sameCanonical(seamIds, expectedSeams) ||
    !operation ||
    composition.handoff.operations.length !== 1 ||
    expected.operation.id !== operation.id ||
    expected.operation.sourceOperationNumber !== composition.evidence.sourceOperationNumber ||
    expected.operation.stage !== operation.stage ||
    expected.operation.order !== 0 ||
    operation.order !== 0
  )
    fail(
      'expected-binding-mismatch',
      'Retained row, generation, catalog, proposal, plan and composition evidence differs.',
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
    const first = this.find(left);
    const second = this.find(right);
    if (first !== second) this.parent.set(second, first);
  }
}

function validateClosure(
  composition: SuccessfulComposition,
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
): Readonly<{ pieceIds: readonly [string, string]; seamIds: readonly [string, string] }> {
  const { handoff, aggregate } = composition;
  const pieceIds = sortedPair(handoff.pieces.map(({ id }) => id));
  const seamIds = sortedPair(handoff.seams.map(({ id }) => id));
  const operation = handoff.operations[0];
  if (
    !pieceIds ||
    !seamIds ||
    handoff.physicalSurface.mode !== 'sewing-surface' ||
    handoff.physicalSurface.seamAllowancePhysical !== false ||
    handoff.operations.length !== 1 ||
    !operation ||
    operation.order !== 0 ||
    operation.kind !== 'stitch' ||
    !sameCanonical([...operation.seamIds].sort(), seamIds) ||
    handoff.seams.some(
      (seam) =>
        seam.mapping !== 'equal' ||
        seam.lengthRatio !== 1 ||
        seam.operationId !== operation.id ||
        !sameCanonical(seam.sides.map(({ pieceId }) => pieceId).sort(), pieceIds),
    ) ||
    aggregate.operation.id !== operation.id ||
    aggregate.operation.stage !== operation.stage ||
    aggregate.operation.order !== 0 ||
    !sameCanonical([...aggregate.operation.seamIds].sort(), seamIds) ||
    !sameCanonical([...aggregate.scope.pieceIds].sort(), pieceIds) ||
    aggregate.sourceBinding.sourceFileId !== request.catalog.sourceFileId ||
    aggregate.sourceBinding.documentId !== handoff.source.documentId ||
    aggregate.sourceBinding.revision !== handoff.source.revision ||
    handoff.materials.length !== 2 ||
    pieceIds.some(
      (pieceId) =>
        handoff.materials.filter((material) => material.pieceIds.includes(pieceId)).length !== 1,
    ) ||
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
      'C6 supports exactly two pieces, two equal seams and one local-order-zero stitch operation.',
    );

  const disjoint = new DisjointSet();
  const usedEdges = new Map<string, Set<number>>();
  const usedEndpoints = new Map<string, Set<string>>();
  for (const piece of handoff.pieces) {
    const shells = piece.contours.filter(({ role }) => role === 'sewing-boundary');
    if (shells.length !== 1)
      fail('topology-unsupported', `${piece.id} must own one sewing contour.`);
    usedEdges.set(piece.id, new Set<number>());
    usedEndpoints.set(piece.id, new Set<string>());
    shells[0].vertices.forEach(({ id }) => disjoint.add(`${piece.id}\0${id}`));
  }

  for (const seam of handoff.seams) {
    const mapped = aggregate.seams.find(({ id }) => id === seam.id);
    if (!mapped || mapped.operationId !== seam.operationId)
      fail('topology-unsupported', `${seam.id} is missing from the exact aggregate graph.`);
    const directed: Array<{ pieceId: string; start: string; end: string }> = [];
    for (const side of seam.sides) {
      const piece = handoff.pieces.find(({ id }) => id === side.pieceId);
      const shell = piece?.contours.find(({ role }) => role === 'sewing-boundary');
      const mappedSide = mapped.sides.find(({ pieceId }) => pieceId === side.pieceId);
      if (!piece || !shell || !mappedSide || side.contourId !== shell.id)
        fail('topology-unsupported', `${seam.id}/${side.pieceId} is not on its one shell.`);
      const startIndex = shell.vertices.findIndex(({ id }) => id === side.anchors[0]);
      const endIndex = shell.vertices.findIndex(({ id }) => id === side.anchors[1]);
      if (startIndex < 0 || (startIndex + 1) % shell.vertices.length !== endIndex)
        fail('topology-unsupported', `${seam.id}/${side.pieceId} is not one adjacent edge.`);
      const edges = usedEdges.get(side.pieceId)!;
      if (edges.has(startIndex))
        fail('topology-unsupported', `${seam.id}/${side.pieceId} repeats a seam edge.`);
      edges.add(startIndex);
      const anchors =
        side.direction === 'forward'
          ? ([side.anchors[0], side.anchors[1]] as const)
          : ([side.anchors[1], side.anchors[0]] as const);
      const endpoints = usedEndpoints.get(side.pieceId)!;
      if (anchors.some((id) => endpoints.has(id)))
        fail('topology-unsupported', `${seam.id}/${side.pieceId} reuses a seam endpoint.`);
      anchors.forEach((id) => endpoints.add(id));
      if (
        mappedSide.contourId !== side.contourId ||
        mappedSide.direction !== side.direction ||
        mappedSide.orderedSamples.length !== 2 ||
        !sameCanonical(mappedSide.authoredAnchors, side.anchors) ||
        mappedSide.orderedSamples[0]?.vertexId !== anchors[0] ||
        mappedSide.orderedSamples[1]?.vertexId !== anchors[1]
      )
        fail('topology-unsupported', `${seam.id}/${side.pieceId} side evidence differs.`);
      directed.push({ pieceId: side.pieceId, start: anchors[0], end: anchors[1] });
    }
    if (directed.length !== 2)
      fail('topology-unsupported', `${seam.id} does not have exactly two sides.`);
    disjoint.union(
      `${directed[0].pieceId}\0${directed[0].start}`,
      `${directed[1].pieceId}\0${directed[1].start}`,
    );
    disjoint.union(
      `${directed[0].pieceId}\0${directed[0].end}`,
      `${directed[1].pieceId}\0${directed[1].end}`,
    );
  }

  const freeEdges: Array<readonly [string, string]> = [];
  for (const piece of handoff.pieces) {
    const shell = piece.contours.find(({ role }) => role === 'sewing-boundary')!;
    const consumed = usedEdges.get(piece.id)!;
    if (consumed.size !== 2)
      fail('topology-unsupported', `${piece.id} must contribute two distinct seam edges.`);
    shell.vertices.forEach((vertex, index) => {
      if (!consumed.has(index))
        freeEdges.push([
          `${piece.id}\0${vertex.id}`,
          `${piece.id}\0${shell.vertices[(index + 1) % shell.vertices.length].id}`,
        ]);
    });
  }
  const adjacency = new Map<string, string[]>();
  freeEdges.forEach(([left, right]) => {
    const first = disjoint.find(left);
    const second = disjoint.find(right);
    adjacency.set(first, [...(adjacency.get(first) ?? []), second]);
    adjacency.set(second, [...(adjacency.get(second) ?? []), first]);
  });
  if ([...adjacency.values()].some((neighbors) => neighbors.length !== 2))
    fail('topology-unsupported', 'The free-boundary quotient branches or remains open.');
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
      (adjacency.get(current) ?? []).forEach((next) => queue.push(next));
    }
  }
  if (components !== 2)
    fail('topology-unsupported', 'The seam quotient must yield exactly two free components.');
  return { pieceIds, seamIds };
}

function validatePhase1Request(
  phase1: DxfProductPhase1BuildInputsRequestV1,
  composition: SuccessfulComposition,
): void {
  if (
    !sameCanonical(phase1.handoff, composition.handoff) ||
    !sameCanonical(phase1.aggregate, composition.aggregate) ||
    !sameCanonical(phase1.aggregateSeal, composition.aggregateSeal) ||
    phase1.childMappings.length !== 2 ||
    phase1.childSeals.length !== 2
  )
    fail(
      'phase1-request-binding-mismatch',
      'Caller Phase-1 handoff/aggregate/seal must exact-match the fresh composition.',
    );
  const seen = new Set<string>();
  phase1.childMappings.forEach((mapping, index) => {
    const aggregateSeam = composition.aggregate.seams.find(({ id }) => id === mapping.seam.id);
    const aggregateChild = composition.aggregate.childSeals.find(
      ({ seamId }) => seamId === mapping.seam.id,
    );
    const childSeal = phase1.childSeals[index];
    if (
      seen.has(mapping.seam.id) ||
      !aggregateSeam ||
      !aggregateChild ||
      !childSeal ||
      !sameCanonical(mapping.seam, aggregateSeam) ||
      mapping.sourceBinding.sourceFileId !== composition.aggregate.sourceBinding.sourceFileId ||
      mapping.sourceBinding.documentId !== composition.aggregate.sourceBinding.documentId ||
      mapping.sourceBinding.revision !== composition.aggregate.sourceBinding.revision ||
      mapping.sourceBinding.baseFinalCoordinateSha256 !==
        composition.aggregate.sourceBinding.baseFinalCoordinateSha256 ||
      mapping.sourceBinding.sourcePathCoordinateSha256 !==
        composition.aggregate.sourceBinding.sourcePathCoordinateSha256 ||
      mapping.sourceBinding.handoffCanonicalSha256 !== composition.handoff.seal.canonicalSha256 ||
      !sameCanonical(mapping.scope, composition.aggregate.scope) ||
      childSeal.canonicalSha256 !== aggregateChild.mappingCanonicalSha256 ||
      aggregateChild.handoffCanonicalSha256 !== composition.handoff.seal.canonicalSha256
    )
      fail(
        'phase1-request-binding-mismatch',
        'Child mapping/seal source, handoff and seam graph differs from the fresh aggregate.',
      );
    seen.add(mapping.seam.id);
  });
  if (seen.size !== 2)
    fail('phase1-request-binding-mismatch', 'Both child mappings must be present exactly once.');
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

let claimed = false;

export async function buildPatternImportDxfProductGarmentMeshComposerV2(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductGarmentMeshComposerResultV2> {
  if (claimed)
    return blocked(new ComposerFailure('invalid-input', 'Reentrant C6 composition rejected.'));
  claimed = true;
  let nested: DxfProductPhase2FreshBuildOwnerV1 | null = null;
  let published = false;
  try {
    const { request, nativeOwner } = exactDetachedRequest(input);
    const crypto = options.crypto ?? globalThis.crypto;
    const first = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
      crypto,
    );
    if (!first.ok)
      fail(
        'mapping-composition-blocked',
        first.blockers.map(({ code }) => code).join(', ') || 'Fresh composition was blocked.',
      );
    const second = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
      crypto,
    );
    if (
      !second.ok ||
      first.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_V2 ||
      first.compositionSeal.canonicalSha256 !== second.compositionSeal?.canonicalSha256 ||
      first.aggregateSeal.canonicalSha256 !== second.aggregateSeal?.canonicalSha256 ||
      first.handoff.seal.canonicalSha256 !== second.handoff?.seal.canonicalSha256 ||
      !sameCanonical(first.evidence, second.evidence) ||
      !sameCanonical(first.handoff, second.handoff) ||
      !sameCanonical(first.aggregate, second.aggregate)
    )
      fail('composition-repeat-mismatch', 'Two detached fresh product compositions differ.');
    validateExpected(request, first);
    const topology = validateClosure(first, request.compositionRequest);
    validatePhase1Request(request.phase1BuildInputsRequest, first);

    const phase2 = await buildDxfProductPhase2FreshBuildOwnerV1(
      {
        schemaVersion: DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1,
        phase1Request: request.phase1BuildInputsRequest,
        phaseDNativeStraightEdgeOwner: nativeOwner,
        targetEdgeMm: request.targetEdgeMm,
        documentIdentity: {
          techCardId: first.evidence.techCardId,
          scopeKey: first.evidence.scopeKey,
          patternLineKey: first.evidence.patternLineKey,
          patternVersion: first.evidence.patternVersion,
          cardLockVersion: first.evidence.cardLockVersion,
          importGeneration: first.evidence.importGeneration,
          sourceFileId: request.compositionRequest.catalog.sourceFileId,
          sourceFileSha256: first.evidence.sourceFileSha256,
          handoffSourceAggregateSha256: first.handoff.source.sourceSha256,
          selectedGeometrySha256: first.aggregate.sourceBinding.baseFinalCoordinateSha256,
          documentId: first.handoff.source.documentId,
          revision: first.handoff.source.revision,
          sizeToken: request.compositionRequest.catalog.sizeToken,
          pieceIds: [...topology.pieceIds],
          dxfSha256: first.evidence.productExportSha256,
        },
      },
      { crypto },
    );
    if (!phase2.ok)
      fail(
        'phase2-fresh-build-blocked',
        `${phase2.blockers[0].code}: ${phase2.blockers[0].detail}`,
      );
    nested = phase2.owner;
    const phase2Snapshot = phase2.snapshot;
    if (
      phase2Snapshot.sourceHandoffSha256 !== first.handoff.seal.canonicalSha256 ||
      phase2Snapshot.aggregateCanonicalSha256 !== first.aggregateSeal.canonicalSha256 ||
      phase2Snapshot.pieceCount !== 2 ||
      phase2Snapshot.seamCount !== 2 ||
      phase2Snapshot.cdt2dInvocationCount !== 8 ||
      phase2Snapshot.claims.sourceNativeAuthorityBound !== true ||
      phase2Snapshot.claims.phase1FreshRebuiltTwice !== true ||
      phase2Snapshot.claims.phase2FreshRebuiltTwice !== true ||
      phase2Snapshot.claims.freshBoundarySamplingBuiltTwice !== true ||
      phase2Snapshot.claims.independentSamplingArtifactsUsed !== true ||
      phase2Snapshot.claims.sourceAuthenticityAccepted !== false ||
      phase2Snapshot.claims.documentRowChronologyAuthenticated !== false ||
      phase2Snapshot.claims.productionReady !== false
    )
      fail(
        'phase2-post-binding-mismatch',
        'Nested C5.2 owner does not exact-bind the fresh composition and required honest claims.',
      );

    const row = Object.freeze({
      techCardId: first.evidence.techCardId,
      scopeKey: first.evidence.scopeKey,
      patternLineKey: first.evidence.patternLineKey,
      patternVersion: first.evidence.patternVersion,
      cardLockVersion: first.evidence.cardLockVersion,
      importGeneration: first.evidence.importGeneration,
      dxfSha256: first.evidence.productExportSha256,
    });
    const assembly = Object.freeze({
      documentId: first.handoff.source.documentId,
      revision: first.handoff.source.revision,
      sourceOperationNumber: first.evidence.sourceOperationNumber,
      localOperationOrder: 0 as const,
      pieceIds: [...topology.pieceIds] as [string, string],
      seamIds: [...topology.seamIds] as [string, string],
    });
    const seals = Object.freeze({
      sizeSelectionSha256: first.evidence.sizeSelectionSha256,
      catalogCanonicalSha256: first.evidence.catalogSha256,
      proposalFingerprint: first.evidence.proposalFingerprint,
      phaseEPlanSha256: first.evidence.phaseEPlanSha256,
      compositionCanonicalSha256: first.compositionSeal.canonicalSha256,
      handoffCanonicalSha256: first.handoff.seal.canonicalSha256,
      aggregateCanonicalSha256: first.aggregateSeal.canonicalSha256,
      sourceFileSha256: first.evidence.sourceFileSha256,
      handoffSourceAggregateSha256: first.handoff.source.sourceSha256,
      productExportSha256: first.evidence.productExportSha256,
      sourceNativeAuthoritySha256: phase2Snapshot.sourceNativeAuthoritySha256,
      nativeStraightEdgesSha256: phase2Snapshot.nativeStraightEdgesSha256,
      phase2ArtifactSha256: phase2Snapshot.artifactSha256,
      phase2OwnerCanonicalSha256: phase2Snapshot.seal.canonicalSha256,
    });
    const mesh = Object.freeze({
      deterministicFingerprint: phase2Snapshot.deterministicFingerprint,
      pieceCount: 2 as const,
      seamCount: 2 as const,
      vertexCount: phase2Snapshot.vertexCount,
      triangleCount: phase2Snapshot.triangleCount,
      distributedSeamPairCount: phase2Snapshot.distributedSeamPairCount,
      cdt2dInvocationCount: 8 as const,
    });
    const payload = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_V2,
      status: 'in-memory-product-mesh-authority-candidate' as const,
      origin: request.origin,
      row,
      assembly,
      seals,
      mesh,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V2,
    };
    const canonicalSha256 = await sha256(
      'pattern-import-dxf-product-garment-mesh-composer-v2',
      payload,
      crypto,
    );
    const snapshot = deepFreeze({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies PatternImportDxfProductGarmentMeshComposerSnapshotV2);
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_OWNER_V2,
      snapshot,
    }) as unknown as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    owners.set(owner, { nested, disposed: false });
    published = true;
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_BLOCKERS_V2,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    if (nested && !published) disposeDxfProductPhase2FreshBuildOwnerV1(nested);
    claimed = false;
  }
}

export function projectPatternImportDxfProductGarmentMeshComposerV2(
  owner: unknown,
): PatternImportDxfProductGarmentMeshComposerProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  const projection = projectDxfProductPhase2FreshBuildOwnerV1(record.nested);
  if (!projection) return null;
  const publicOwner = owner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_PROJECTION_V2,
    composerCanonicalSha256: publicOwner.snapshot.seal.canonicalSha256,
    phase2ArtifactSha256: projection.artifactSha256,
    mesh: projection.mesh,
    triangleMaterialFrames2: projection.triangleMaterialFrames2,
    callerOwnedMutableCopies: true as const,
    staticPreviewAuthority: false as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

/** One-shot refined handoff for C6 V3. The nested genuine C5.2 owner is never projected. */
export async function consumePatternImportDxfProductGarmentMeshComposerRefinementV3(
  owner: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductPhase2RefinedBuildResultV1 | null> {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  return buildDxfProductPhase2RefinedBuildOwnerV1(
    {
      schemaVersion: DXF_PRODUCT_PHASE2_REFINED_BUILD_REQUEST_V1,
      phase2Owner: record.nested,
    },
    options,
  );
}

export function disposePatternImportDxfProductGarmentMeshComposerV2(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  const disposed = disposeDxfProductPhase2FreshBuildOwnerV1(record.nested);
  record.disposed = true;
  owners.delete(owner);
  return disposed;
}
