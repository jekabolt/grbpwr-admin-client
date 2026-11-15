import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1 =
  'dxf-product-two-panel-skirt-placement-semantics-request/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_V1 =
  'dxf-product-two-panel-skirt-placement-semantics/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_OWNER_V1 =
  'dxf-product-two-panel-skirt-placement-semantics-owner/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_PROJECTION_V1 =
  'dxf-product-two-panel-skirt-placement-semantics-projection/1' as const;

const MAX_DEPTH = 24;
const MAX_NODES = 50_000;
const MAX_PROPERTIES = 200_000;
const MAX_ARRAY = 4_096;
const MAX_STRING = 1_024;
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAX_SELECTED_CURVES = 32;
const MAX_SELECTED_SAMPLES = 4_096;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const clone = globalThis.structuredClone?.bind(globalThis);

export type DxfProductTwoPanelSkirtBoundarySelectionV1 = Readonly<{
  contourId: string;
  sourceCurveIds: readonly [string, ...string[]];
  /** Exact ordered mesh-boundary vertices; required so the closing-edge endpoint is explicit. */
  boundaryVertexIndices: readonly [number, number, ...number[]];
}>;

export type DxfProductTwoPanelSkirtPieceBoundaryRolesV1 = Readonly<{
  pieceId: string;
  waist: DxfProductTwoPanelSkirtBoundarySelectionV1;
  hem: DxfProductTwoPanelSkirtBoundarySelectionV1;
  leftSeam: DxfProductTwoPanelSkirtBoundarySelectionV1;
  rightSeam: DxfProductTwoPanelSkirtBoundarySelectionV1;
}>;

export type DxfProductTwoPanelSkirtPlacementSemanticsRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1;
  origin: 'fresh-import' | 'verified-saved-row';
  expectedComposerCanonicalSha256: string;
  composerOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  garment: Readonly<{
    kind: 'two-panel-skirt';
    frontPieceId: string;
    backPieceId: string;
    leftSeamId: string;
    rightSeamId: string;
    circumferentialOrder: Readonly<{
      direction: 'clockwise-seen-from-above' | 'counterclockwise-seen-from-above';
      pieceIds: readonly [string, string];
    }>;
    boundaries: readonly [
      DxfProductTwoPanelSkirtPieceBoundaryRolesV1,
      DxfProductTwoPanelSkirtPieceBoundaryRolesV1,
    ];
  }>;
  body: Readonly<{
    providerId: string;
    providerRevision: string;
    bodyId: string;
    bodyRevision: string;
    poseKind: 'A';
    poseRevision: string;
    collisionLodId: string;
    landmarks: Readonly<{
      revision: string;
      waistCenterId: string;
      hipLeftId: string;
      hipRightId: string;
    }>;
  }>;
  policy: Readonly<{
    id: string;
    revision: string;
    mapping: Readonly<{
      kind: 'authored-annular-sector-conical';
      id: string;
      revision: string;
    }>;
    authoredClearanceM: number;
    clothThicknessM: number;
    retention: Readonly<{
      id: string;
      revision: string;
      kind: 'waist-boundary-support';
    }>;
  }>;
}>;

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1 = Object.freeze({
  status: 'authored-placement-semantics-candidate',
  composerOwnerPresentedAndProjected: true,
  composerOwnerRetained: false,
  authoredPieceRolesBound: true,
  authoredBoundaryRolesBound: true,
  coordinateExtremaInferenceUsed: false,
  screenPositionInferenceUsed: false,
  layerNameInferenceUsed: false,
  bodyIdentityRequested: true,
  bodyProviderBound: false,
  placementTransformGenerated: false,
  staticPlacementReady: false,
  previewReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  fitGrade: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1,
  composerOwnerPresentedAndProjected: false as const,
  authoredPieceRolesBound: false as const,
  authoredBoundaryRolesBound: false as const,
  bodyIdentityRequested: false as const,
});

export const DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_BLOCKERS_V1 = Object.freeze([
  'body-provider-owner-not-presented',
  'placement-transform-not-generated',
  'collision-and-self-intersection-not-evaluated',
  'static-preview-not-composed',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'fit-not-qualified',
  'production-qualification-not-run',
] as const);

export type DxfProductTwoPanelSkirtPlacementSemanticsSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_V1;
  status: 'authored-placement-semantics-candidate';
  origin: 'fresh-import' | 'verified-saved-row';
  bindings: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    meshDeterministicFingerprintSha256: string;
    garmentRolesSha256: string;
    boundaryRolesSha256: string;
    bodyIdentitySha256: string;
    placementPolicySha256: string;
  }>;
  counts: Readonly<{
    pieceCount: 2;
    seamCount: 2;
    boundaryRoleCount: 8;
    selectedSourceCurveCount: number;
    selectedBoundarySampleCount: number;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1;
  blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_BLOCKERS_V1;
}>;

declare const placementSemanticsOwnerBrand: unique symbol;
export type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_OWNER_V1;
  snapshot: DxfProductTwoPanelSkirtPlacementSemanticsSnapshotV1;
  readonly [placementSemanticsOwnerBrand]: never;
}>;

export type DxfProductTwoPanelSkirtPlacementSemanticsProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_PROJECTION_V1;
  origin: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['origin'];
  composerCanonicalSha256: string;
  garment: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['garment'];
  body: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['body'];
  policy: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['policy'];
  callerOwnedMutablePlainCopies: true;
  composerOwnerRetained: false;
  bodyProviderAuthority: false;
  placementTransformAuthority: false;
  staticPreviewAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  settleAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1 =
  | 'invalid-input'
  | 'composer-owner-unavailable'
  | 'composer-binding-mismatch'
  | 'piece-role-mismatch'
  | 'boundary-role-mismatch'
  | 'seam-boundary-role-conflict'
  | 'body-identity-invalid'
  | 'placement-policy-invalid'
  | 'sha256-unavailable';

export type DxfProductTwoPanelSkirtPlacementSemanticsResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
      snapshot: DxfProductTwoPanelSkirtPlacementSemanticsSnapshotV1;
      claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1;
      blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_BLOCKERS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{
          code: DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

type DetachedRequest = Omit<DxfProductTwoPanelSkirtPlacementSemanticsRequestV1, 'composerOwner'>;
type ScanState = { nodes: number; properties: number; seen: Set<object> };

class SemanticsFailure extends Error {
  constructor(
    readonly code: DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1, detail: string): never {
  throw new SemanticsFailure(code, detail);
}

function blocked(error: unknown): DxfProductTwoPanelSkirtPlacementSemanticsResultV1 {
  const failure =
    error instanceof SemanticsFailure
      ? error
      : new SemanticsFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Placement semantics failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: BLOCKED_CLAIMS,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [
      Readonly<{
        code: DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function scanPlain(value: unknown, path: string, depth: number, state: ScanState): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} must be finite.`);
    return;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) fail('invalid-input', `${path} exceeds the string bound.`);
    return;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-input', `${path} must contain plain data only.`);
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds the depth bound.`);
  if (state.seen.has(value)) return;
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail('invalid-input', `${path} exceeds the node bound.`);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', `${path} cannot contain binary data.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} reflection failed.`);
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

function detach(input: unknown): { request: DetachedRequest; composerOwner: unknown } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('invalid-input', 'Placement semantics request must be an exact record.');
  let descriptors: PropertyDescriptorMap;
  try {
    if (Object.getPrototypeOf(input) !== Object.prototype)
      fail('invalid-input', 'Placement semantics request must be a plain record.');
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    if (error instanceof SemanticsFailure) throw error;
    fail('invalid-input', 'Placement semantics request reflection failed.');
  }
  const expected = [
    'schemaVersion',
    'origin',
    'expectedComposerCanonicalSha256',
    'composerOwner',
    'garment',
    'body',
    'policy',
  ].sort();
  const keys = Reflect.ownKeys(descriptors);
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    keys.some((key) => typeof key !== 'string') ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('invalid-input', 'Placement semantics request has an invalid exact shape.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `request.${key} must be one enumerable data property.`);
  }
  const plain = {
    schemaVersion: descriptors.schemaVersion.value,
    origin: descriptors.origin.value,
    expectedComposerCanonicalSha256: descriptors.expectedComposerCanonicalSha256.value,
    garment: descriptors.garment.value,
    body: descriptors.body.value,
    policy: descriptors.policy.value,
  };
  scanPlain(plain, 'request', 0, { nodes: 0, properties: 0, seen: new Set<object>() });
  if (!clone) fail('invalid-input', 'Native structuredClone is required.');
  let request: DetachedRequest;
  try {
    request = clone(plain) as DetachedRequest;
  } catch {
    fail('invalid-input', 'Placement semantics request could not be detached.');
  }
  return { request, composerOwner: descriptors.composerOwner.value };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > MAX_CANONICAL_BYTES)
    fail('invalid-input', 'Placement semantics canonical payload exceeds its bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof SemanticsFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function stableId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STABLE_ID.test(value) || value.length > MAX_STRING)
    fail('invalid-input', `${path} must be a bounded stable ID.`);
  return value;
}

function requireExactKeys(
  value: unknown,
  expected: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', `${path} must be an exact record.`);
  const keys = Object.keys(value).sort(compareCodeUnits);
  const sortedExpected = [...expected].sort(compareCodeUnits);
  if (
    keys.length !== sortedExpected.length ||
    keys.some((key, index) => key !== sortedExpected[index])
  )
    fail('invalid-input', `${path} has missing or unexpected fields.`);
}

function exactPair(values: readonly string[], path: string): readonly [string, string] {
  if (values.length !== 2) fail('piece-role-mismatch', `${path} must contain exactly two IDs.`);
  const pair = values.map((value, index) => stableId(value, `${path}[${index}]`)) as [
    string,
    string,
  ];
  if (pair[0] === pair[1]) fail('piece-role-mismatch', `${path} must contain distinct IDs.`);
  return pair;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const first = [...left].sort(compareCodeUnits);
  const second = [...right].sort(compareCodeUnits);
  return first.every((value, index) => value === second[index]);
}

function validateBodyAndPolicy(request: DetachedRequest): void {
  requireExactKeys(
    request.body,
    [
      'providerId',
      'providerRevision',
      'bodyId',
      'bodyRevision',
      'poseKind',
      'poseRevision',
      'collisionLodId',
      'landmarks',
    ],
    'request.body',
  );
  requireExactKeys(
    request.body.landmarks,
    ['revision', 'waistCenterId', 'hipLeftId', 'hipRightId'],
    'request.body.landmarks',
  );
  requireExactKeys(
    request.policy,
    ['id', 'revision', 'mapping', 'authoredClearanceM', 'clothThicknessM', 'retention'],
    'request.policy',
  );
  requireExactKeys(request.policy.mapping, ['kind', 'id', 'revision'], 'request.policy.mapping');
  requireExactKeys(
    request.policy.retention,
    ['id', 'revision', 'kind'],
    'request.policy.retention',
  );
  const bodyIds = [
    request.body.providerId,
    request.body.providerRevision,
    request.body.bodyId,
    request.body.bodyRevision,
    request.body.poseRevision,
    request.body.collisionLodId,
    request.body.landmarks.revision,
    request.body.landmarks.waistCenterId,
    request.body.landmarks.hipLeftId,
    request.body.landmarks.hipRightId,
  ];
  bodyIds.forEach((value, index) => stableId(value, `request.body.identity[${index}]`));
  if (
    request.body.poseKind !== 'A' ||
    new Set([
      request.body.landmarks.waistCenterId,
      request.body.landmarks.hipLeftId,
      request.body.landmarks.hipRightId,
    ]).size !== 3
  )
    fail('body-identity-invalid', 'A-pose and distinct waist/hip landmark IDs are required.');
  stableId(request.policy.id, 'request.policy.id');
  stableId(request.policy.revision, 'request.policy.revision');
  stableId(request.policy.mapping.id, 'request.policy.mapping.id');
  stableId(request.policy.mapping.revision, 'request.policy.mapping.revision');
  stableId(request.policy.retention.id, 'request.policy.retention.id');
  stableId(request.policy.retention.revision, 'request.policy.retention.revision');
  if (
    request.policy.mapping.kind !== 'authored-annular-sector-conical' ||
    request.policy.retention.kind !== 'waist-boundary-support' ||
    !Number.isFinite(request.policy.authoredClearanceM) ||
    request.policy.authoredClearanceM < 0 ||
    request.policy.authoredClearanceM > 0.1 ||
    !Number.isFinite(request.policy.clothThicknessM) ||
    request.policy.clothThicknessM <= 0 ||
    request.policy.clothThicknessM > 0.02
  )
    fail(
      'placement-policy-invalid',
      'Placement policy must select the authored annular-sector conical family, bounded clearance, positive thickness and waist support.',
    );
}

type MeshProjection = NonNullable<
  ReturnType<typeof projectPatternImportDxfProductGarmentMeshComposerV2>
>;

function seamVerticesForPiece(
  projection: MeshProjection,
  seamId: string,
  pieceId: string,
): readonly number[] {
  const range = projection.mesh.pieceRanges.find((candidate) => candidate.pieceId === pieceId);
  const seam = projection.mesh.seams.find((candidate) => candidate.seamId === seamId);
  if (!range || !seam)
    fail('boundary-role-mismatch', `${pieceId}/${seamId} is absent from the exact mesh graph.`);
  const vertices: number[] = [];
  for (const vertexIndex of seam.vertexPairs) {
    if (vertexIndex >= range.vertexOffset && vertexIndex < range.vertexOffset + range.vertexCount)
      vertices.push(vertexIndex);
  }
  if (vertices.length < 2 || new Set(vertices).size !== vertices.length)
    fail('boundary-role-mismatch', `${pieceId}/${seamId} has no exact distributed seam side.`);
  return vertices;
}

function sameNumberSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function physicalEdgeKey(first: number, second: number): string {
  return first < second ? `${first}\0${second}` : `${second}\0${first}`;
}

function validateBoundaryRoles(
  request: DetachedRequest,
  projection: MeshProjection,
): Readonly<{ selectedSourceCurveCount: number; selectedBoundarySampleCount: number }> {
  const { garment } = request;
  requireExactKeys(
    garment,
    [
      'kind',
      'frontPieceId',
      'backPieceId',
      'leftSeamId',
      'rightSeamId',
      'circumferentialOrder',
      'boundaries',
    ],
    'request.garment',
  );
  requireExactKeys(
    garment.circumferentialOrder,
    ['direction', 'pieceIds'],
    'request.garment.circumferentialOrder',
  );
  if (garment.kind !== 'two-panel-skirt')
    fail('piece-role-mismatch', 'Only the explicit two-panel-skirt template is supported.');
  const rolePair = exactPair(
    [garment.frontPieceId, garment.backPieceId],
    'request.garment.pieceRoles',
  );
  const meshPieces = exactPair(
    projection.mesh.pieceRanges.map(({ pieceId }) => pieceId),
    'projection.mesh.pieceRanges',
  );
  const circumferentialPair = exactPair(
    garment.circumferentialOrder.pieceIds,
    'request.garment.circumferentialOrder.pieceIds',
  );
  if (
    !sameStringSet(rolePair, meshPieces) ||
    !sameStringSet(circumferentialPair, rolePair) ||
    (garment.circumferentialOrder.direction !== 'clockwise-seen-from-above' &&
      garment.circumferentialOrder.direction !== 'counterclockwise-seen-from-above')
  )
    fail(
      'piece-role-mismatch',
      'Front/back roles and authored circumferential order must cover the exact C6 piece pair.',
    );
  const seamPair = exactPair(
    [garment.leftSeamId, garment.rightSeamId],
    'request.garment.seamRoles',
  );
  if (
    !sameStringSet(
      seamPair,
      projection.mesh.seams.map(({ seamId }) => seamId),
    )
  )
    fail(
      'piece-role-mismatch',
      'Authored left/right seam roles must cover the exact C6 seam pair.',
    );
  if (
    garment.boundaries.length !== 2 ||
    !sameStringSet(
      garment.boundaries.map(({ pieceId }) => pieceId),
      rolePair,
    )
  )
    fail(
      'boundary-role-mismatch',
      'Exactly one authored boundary-role record is required per piece.',
    );

  const allSelectedCurves = new Set<string>();
  let selectedBoundarySampleCount = 0;
  for (const piece of garment.boundaries) {
    requireExactKeys(
      piece,
      ['pieceId', 'waist', 'hem', 'leftSeam', 'rightSeam'],
      'request.garment.boundaries[]',
    );
    stableId(piece.pieceId, 'request.garment.boundaries[].pieceId');
    const roleCurves = new Set<string>();
    const roleContourIds = new Set<string>();
    const roleEdges = new Set<string>();
    const allContourSamples = projection.mesh.boundarySamples.filter(
      (sample) => sample.pieceId === piece.pieceId,
    );
    const allContourIds = new Set(allContourSamples.map(({ contourId }) => contourId));
    if (allContourIds.size !== 1)
      fail(
        'boundary-role-mismatch',
        `${piece.pieceId} must expose one exact sewing contour for the D0 skirt template.`,
      );
    for (const [role, selection] of [
      ['waist', piece.waist],
      ['hem', piece.hem],
      ['leftSeam', piece.leftSeam],
      ['rightSeam', piece.rightSeam],
    ] as const) {
      requireExactKeys(
        selection,
        ['contourId', 'sourceCurveIds', 'boundaryVertexIndices'],
        `request.garment.boundaries.${piece.pieceId}.${role}`,
      );
      stableId(
        selection.contourId,
        `request.garment.boundaries.${piece.pieceId}.${role}.contourId`,
      );
      roleContourIds.add(selection.contourId);
      if (
        !Array.isArray(selection.sourceCurveIds) ||
        selection.sourceCurveIds.length === 0 ||
        selection.sourceCurveIds.length > MAX_SELECTED_CURVES
      )
        fail('boundary-role-mismatch', `${piece.pieceId}/${role} needs bounded source curves.`);
      const curves = new Set<string>();
      for (const curveId of selection.sourceCurveIds) {
        if (typeof curveId !== 'string' || curveId.length === 0 || curveId.length > MAX_STRING)
          fail(
            'boundary-role-mismatch',
            `${piece.pieceId}/${role} has an invalid source curve ID.`,
          );
        if (curves.has(curveId) || roleCurves.has(curveId))
          fail('boundary-role-mismatch', `${piece.pieceId} waist and hem curves must be disjoint.`);
        curves.add(curveId);
        roleCurves.add(curveId);
        allSelectedCurves.add(`${piece.pieceId}\0${selection.contourId}\0${curveId}`);
        const samples = projection.mesh.boundarySamples.filter(
          (sample) =>
            sample.pieceId === piece.pieceId &&
            sample.contourId === selection.contourId &&
            sample.sourceCurveId === curveId,
        );
        // A native line shorter than the Phase-2 target owns one start sample; its exact end is the
        // next ordered contour sample. Full role-edge coverage below still proves that segment.
        if (samples.length < 1)
          fail(
            'boundary-role-mismatch',
            `${piece.pieceId}/${role}/${curveId} is not an exact sampled boundary curve.`,
          );
        selectedBoundarySampleCount += samples.length;
        if (selectedBoundarySampleCount > MAX_SELECTED_SAMPLES)
          fail('boundary-role-mismatch', 'Selected boundary samples exceed the D0 bound.');
      }
      if (
        !Array.isArray(selection.boundaryVertexIndices) ||
        selection.boundaryVertexIndices.length < 2 ||
        selection.boundaryVertexIndices.length > MAX_SELECTED_SAMPLES ||
        new Set(selection.boundaryVertexIndices).size !== selection.boundaryVertexIndices.length
      )
        fail(
          'boundary-role-mismatch',
          `${piece.pieceId}/${role} requires bounded unique ordered boundary vertices.`,
        );
      const authoredVertices = new Set<number>();
      for (const vertexIndex of selection.boundaryVertexIndices) {
        if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0)
          fail('boundary-role-mismatch', `${piece.pieceId}/${role} has an invalid vertex index.`);
        const sample = projection.mesh.boundarySamples.find(
          (candidate) =>
            candidate.vertexIndex === vertexIndex &&
            candidate.pieceId === piece.pieceId &&
            candidate.contourId === selection.contourId,
        );
        if (!sample)
          fail(
            'boundary-role-mismatch',
            `${piece.pieceId}/${role}/${vertexIndex} is not on the authored contour.`,
          );
        authoredVertices.add(vertexIndex);
      }
      for (let index = 1; index < selection.boundaryVertexIndices.length; index += 1) {
        const edge = physicalEdgeKey(
          selection.boundaryVertexIndices[index - 1]!,
          selection.boundaryVertexIndices[index]!,
        );
        if (roleEdges.has(edge))
          fail(
            'boundary-role-mismatch',
            `${piece.pieceId} authored roles repeat physical edge ${edge}.`,
          );
        roleEdges.add(edge);
      }
      const selectedCurveSampleVertices = new Set(
        projection.mesh.boundarySamples
          .filter(
            (sample) =>
              sample.pieceId === piece.pieceId &&
              sample.contourId === selection.contourId &&
              selection.sourceCurveIds.includes(sample.sourceCurveId),
          )
          .map(({ vertexIndex }) => vertexIndex),
      );
      if (
        [...selectedCurveSampleVertices].some((vertexIndex) => !authoredVertices.has(vertexIndex))
      )
        fail(
          'boundary-role-mismatch',
          `${piece.pieceId}/${role} omits vertices sampled from its authored source curves.`,
        );
      if (role === 'leftSeam' || role === 'rightSeam') {
        const authoredSeamId = role === 'leftSeam' ? garment.leftSeamId : garment.rightSeamId;
        const exactSeamVertices = seamVerticesForPiece(projection, authoredSeamId, piece.pieceId);
        if (
          !sameNumberSet(authoredVertices, new Set(exactSeamVertices)) ||
          selection.boundaryVertexIndices.length !== exactSeamVertices.length ||
          selection.boundaryVertexIndices.some(
            (vertexIndex, index) => vertexIndex !== exactSeamVertices[index],
          )
        )
          fail(
            'seam-boundary-role-conflict',
            `${piece.pieceId}/${role} does not reproduce the exact ${authoredSeamId} vertex side.`,
          );
      }
    }
    if (roleContourIds.size !== 1 || !roleContourIds.has([...allContourIds][0]!))
      fail(
        'boundary-role-mismatch',
        `${piece.pieceId} roles must reference its one exact sewing contour.`,
      );
    const contourCurves = new Set(allContourSamples.map(({ sourceCurveId }) => sourceCurveId));
    if (
      contourCurves.size !== roleCurves.size ||
      [...contourCurves].some((curveId) => !roleCurves.has(curveId))
    )
      fail(
        'boundary-role-mismatch',
        `${piece.pieceId} waist, hem, left seam and right seam must cover the contour exactly.`,
      );
    const orderedContourVertices = [...allContourSamples]
      .sort((left, right) => left.normalizedArc - right.normalizedArc)
      .map(({ vertexIndex }) => vertexIndex);
    if (
      orderedContourVertices.length < 4 ||
      new Set(orderedContourVertices).size !== orderedContourVertices.length
    )
      fail('boundary-role-mismatch', `${piece.pieceId} sampled contour is not one simple loop.`);
    const contourEdges = new Set<string>();
    orderedContourVertices.forEach((vertexIndex, index) => {
      contourEdges.add(
        physicalEdgeKey(
          vertexIndex,
          orderedContourVertices[(index + 1) % orderedContourVertices.length]!,
        ),
      );
    });
    if (!sameStringSet([...roleEdges], [...contourEdges]))
      fail(
        'boundary-role-mismatch',
        `${piece.pieceId} authored role edges must cover its sewing boundary without gaps.`,
      );
  }
  return {
    selectedSourceCurveCount: allSelectedCurves.size,
    selectedBoundarySampleCount,
  };
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

type OwnerRecord = Readonly<{
  semantics: DetachedRequest;
}>;

const owners = new WeakMap<object, OwnerRecord>();
let claimed = false;

export async function buildDxfProductTwoPanelSkirtPlacementSemanticsV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductTwoPanelSkirtPlacementSemanticsResultV1> {
  if (claimed)
    return blocked(new SemanticsFailure('invalid-input', 'Reentrant D0 semantics build rejected.'));
  claimed = true;
  try {
    const { request, composerOwner } = detach(input);
    if (
      request.schemaVersion !== DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1 ||
      (request.origin !== 'fresh-import' && request.origin !== 'verified-saved-row') ||
      !SHA256.test(request.expectedComposerCanonicalSha256)
    )
      fail(
        'invalid-input',
        'Placement semantics schema, origin or expected composer seal is invalid.',
      );
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner);
    if (!projection)
      fail('composer-owner-unavailable', 'A live genuine C6 composer owner is required.');
    const publicOwner = composerOwner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const composerSnapshot = publicOwner.snapshot;
    if (
      composerSnapshot.origin !== request.origin ||
      composerSnapshot.seal.canonicalSha256 !== request.expectedComposerCanonicalSha256 ||
      projection.composerCanonicalSha256 !== request.expectedComposerCanonicalSha256 ||
      projection.phase2ArtifactSha256 !== composerSnapshot.seals.phase2ArtifactSha256 ||
      composerSnapshot.mesh.pieceCount !== 2 ||
      composerSnapshot.mesh.seamCount !== 2 ||
      projection.mesh.pieceRanges.length !== 2 ||
      projection.mesh.seams.length !== 2 ||
      composerSnapshot.claims.placementReady !== false ||
      projection.placementAuthority !== false
    )
      fail('composer-binding-mismatch', 'C6 owner, snapshot, projection or honest claims differ.');
    validateBodyAndPolicy(request);
    const boundaryCounts = validateBoundaryRoles(request, projection);
    const crypto = options.crypto ?? globalThis.crypto;
    const garmentRoles = {
      kind: request.garment.kind,
      frontPieceId: request.garment.frontPieceId,
      backPieceId: request.garment.backPieceId,
      leftSeamId: request.garment.leftSeamId,
      rightSeamId: request.garment.rightSeamId,
      circumferentialOrder: request.garment.circumferentialOrder,
    };
    const boundaryRoles = request.garment.boundaries;
    const [meshDeterministicFingerprintSha256, garmentRolesSha256, boundaryRolesSha256] =
      await Promise.all([
        sha256(
          'dxf-product-two-panel-skirt-placement-semantics-mesh-fingerprint-v1',
          composerSnapshot.mesh.deterministicFingerprint,
          crypto,
        ),
        sha256(
          'dxf-product-two-panel-skirt-placement-semantics-garment-roles-v1',
          garmentRoles,
          crypto,
        ),
        sha256(
          'dxf-product-two-panel-skirt-placement-semantics-boundary-roles-v1',
          boundaryRoles,
          crypto,
        ),
      ]);
    const [bodyIdentitySha256, placementPolicySha256] = await Promise.all([
      sha256(
        'dxf-product-two-panel-skirt-placement-semantics-body-identity-v1',
        request.body,
        crypto,
      ),
      sha256('dxf-product-two-panel-skirt-placement-semantics-policy-v1', request.policy, crypto),
    ]);
    const payload = {
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_V1,
      status: 'authored-placement-semantics-candidate' as const,
      origin: request.origin,
      bindings: {
        composerCanonicalSha256: request.expectedComposerCanonicalSha256,
        phase2ArtifactSha256: projection.phase2ArtifactSha256,
        meshDeterministicFingerprintSha256,
        garmentRolesSha256,
        boundaryRolesSha256,
        bodyIdentitySha256,
        placementPolicySha256,
      },
      counts: {
        pieceCount: 2 as const,
        seamCount: 2 as const,
        boundaryRoleCount: 8 as const,
        ...boundaryCounts,
      },
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_BLOCKERS_V1,
    };
    const canonicalSha256 = await sha256(
      'dxf-product-two-panel-skirt-placement-semantics-v1',
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
    } satisfies DxfProductTwoPanelSkirtPlacementSemanticsSnapshotV1);
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_OWNER_V1,
      snapshot,
    }) as unknown as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
    owners.set(owner, {
      semantics: deepFreeze({
        schemaVersion: request.schemaVersion,
        origin: request.origin,
        expectedComposerCanonicalSha256: request.expectedComposerCanonicalSha256,
        garment: request.garment,
        body: request.body,
        policy: request.policy,
      }),
    });
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_BLOCKERS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}

export function isDxfProductTwoPanelSkirtPlacementSemanticsOwnerV1(
  owner: unknown,
): owner is DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1 {
  return !!owner && (typeof owner === 'object' || typeof owner === 'function') && owners.has(owner);
}

export function projectDxfProductTwoPanelSkirtPlacementSemanticsV1(
  owner: unknown,
): DxfProductTwoPanelSkirtPlacementSemanticsProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function') || !clone) return null;
  const record = owners.get(owner);
  if (!record) return null;
  let semantics: DetachedRequest;
  try {
    semantics = clone(record.semantics) as DetachedRequest;
  } catch {
    return null;
  }
  return {
    schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_PROJECTION_V1,
    origin: semantics.origin,
    composerCanonicalSha256: semantics.expectedComposerCanonicalSha256,
    garment: semantics.garment,
    body: semantics.body,
    policy: semantics.policy,
    callerOwnedMutablePlainCopies: true,
    composerOwnerRetained: false,
    bodyProviderAuthority: false,
    placementTransformAuthority: false,
    staticPreviewAuthority: false,
    runtimeAuthority: false,
    persistenceAuthority: false,
    settleAuthority: false,
    fitAuthority: false,
    productionAuthority: false,
  };
}

export function disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  return owners.delete(owner);
}
