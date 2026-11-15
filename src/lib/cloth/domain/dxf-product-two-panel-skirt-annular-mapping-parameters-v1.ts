import {
  isDxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1,
  type DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1,
} from './dxf-product-two-panel-skirt-placement-body-admission-v1';
import {
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1 =
  'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_V1 =
  'dxf-product-two-panel-skirt-annular-mapping-parameters/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_OWNER_V1 =
  'dxf-product-two-panel-skirt-annular-mapping-parameters-owner/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_PROJECTION_V1 =
  'dxf-product-two-panel-skirt-annular-mapping-parameters-projection/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_STRING = 1_024;
const MAX_DEPTH = 24;
const MAX_NODES = 25_000;
const MAX_PROPERTIES = 100_000;
const MAX_ARRAY = 4_096;
const MAX_CANONICAL_BYTES = 2 * 1024 * 1024;
const MAX_PLANAR_ABS_MM = 1_000_000;
const MAX_SLANT_RADIUS_MM = 1_000_000;
const MAX_ACCEPTANCE_MAGNITUDE = 1_000_000;
const UNIT_VECTOR_TOLERANCE = 1e-12;
const TWO_PI = Math.PI * 2;
const encoder = new TextEncoder();
const clone = globalThis.structuredClone?.bind(globalThis);

export type DxfProductTwoPanelSkirtAnnularMappingPieceParametersV1 = Readonly<{
  pieceId: string;
  planarApexMm: readonly [number, number];
  planarStartRayUnit2: readonly [number, number];
  planarAngularDirection: 1 | -1;
  planarStartSeamId: string;
  waistSlantRadiusMm: number;
  hemSlantRadiusMm: number;
  sectorSpanRad: number;
}>;

export type DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1 = Readonly<{
  id: string;
  revision: string;
  parameterResidualMm: number;
  parameterResidualRad: number;
  conicalIdentityResidualM: number;
  maxAbsEdgeStretchDelta: number;
  maxAbsAreaScaleDelta: number;
  minNormalizedOrientationDot: number;
  maxAbsWarpGreenStrain: number;
  maxAbsWeftGreenStrain: number;
  maxAbsShear: number;
  selfIntersectionPolicyRevision: string;
}>;

export type DxfProductTwoPanelSkirtAnnularMappingParametersV1 = Readonly<{
  id: string;
  revision: string;
  units: Readonly<{ planar: 'mm'; body: 'm'; angle: 'rad' }>;
  waistReferenceColliderId: string;
  seamAnchor: Readonly<{ seamId: string; bodyAngleRad: number }>;
  pieces: readonly [
    DxfProductTwoPanelSkirtAnnularMappingPieceParametersV1,
    DxfProductTwoPanelSkirtAnnularMappingPieceParametersV1,
  ];
  acceptance: DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1;
}>;

export type DxfProductTwoPanelSkirtAnnularMappingParametersRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1;
  expected: Readonly<{
    composerCanonicalSha256: string;
    semanticsCanonicalSha256: string;
    bodyAdmissionCanonicalSha256: string;
  }>;
  composerOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  semanticsOwner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
  bodyAdmissionOwner: DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1;
  parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
}>;

export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1 = Object.freeze({
  status: 'authored-annular-mapping-parameters-candidate',
  mappingParametersBound: true,
  callerSuppliedGeometryAccepted: false,
  coordinateExtremaInferenceUsed: false,
  mappingDomainEvaluated: false,
  conicalIdentityEvaluated: false,
  acceptancePolicyQualified: false,
  placementAdmitted: false,
  placementTransformGenerated: false,
  penetrationEvaluated: false,
  supportAndEnclosureEvaluated: false,
  selfIntersectionEvaluated: false,
  staticPreviewReady: false,
  runtimeReady: false,
  persistenceIntegrated: false,
  settleAccepted: false,
  fitGrade: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1,
  mappingParametersBound: false as const,
});

export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_BLOCKERS_V1 = Object.freeze([
  'real-product-fixture-not-cleared',
  'source-authenticity-not-established',
  'mapping-domain-not-evaluated',
  'conical-identity-not-evaluated',
  'acceptance-policy-not-qualified',
  'placement-transform-not-generated',
  'seam-colocation-and-distortion-not-evaluated',
  'penetration-not-evaluated',
  'support-and-enclosure-not-evaluated',
  'self-intersection-not-evaluated',
  'static-preview-not-composed',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'settle-not-evaluated',
  'fit-not-qualified',
  'production-qualification-not-run',
] as const);

export type DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_V1;
  status: 'authored-annular-mapping-parameters-candidate';
  origin: 'fresh-import' | 'verified-saved-row';
  bindings: Readonly<{
    composerCanonicalSha256: string;
    semanticsCanonicalSha256: string;
    bodyAdmissionCanonicalSha256: string;
    phase2ArtifactSha256: string;
    mappingParametersSha256: string;
    acceptancePolicySha256: string;
  }>;
  counts: Readonly<{ pieceCount: 2; seamCount: 2 }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
  claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1;
  blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_BLOCKERS_V1;
}>;

declare const annularParametersOwnerBrand: unique symbol;
export type DxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_OWNER_V1;
  snapshot: DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1;
  readonly [annularParametersOwnerBrand]: never;
}>;

export type DxfProductTwoPanelSkirtAnnularMappingParametersProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_PROJECTION_V1;
  origin: 'fresh-import' | 'verified-saved-row';
  bindings: DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1['bindings'];
  parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
  callerOwnedMutablePlainCopies: true;
  upstreamOwnersRetained: false;
  mappingParametersAuthority: true;
  mappingDomainAuthority: false;
  acceptancePolicyAuthority: false;
  placementTransformAuthority: false;
  staticPreviewAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  settleAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtAnnularMappingParametersBlockerCodeV1 =
  | 'invalid-input'
  | 'composer-owner-unavailable'
  | 'semantics-owner-unavailable'
  | 'body-admission-owner-unavailable'
  | 'authority-binding-mismatch'
  | 'mapping-identity-mismatch'
  | 'piece-binding-mismatch'
  | 'seam-binding-mismatch'
  | 'mapping-parameter-invalid'
  | 'acceptance-parameter-invalid'
  | 'sha256-unavailable';

export type DxfProductTwoPanelSkirtAnnularMappingParametersResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1;
      snapshot: DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1;
      claims: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1;
      blockers: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_BLOCKERS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{
          code: DxfProductTwoPanelSkirtAnnularMappingParametersBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

type DetachedRequest = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1;
  expected: DxfProductTwoPanelSkirtAnnularMappingParametersRequestV1['expected'];
  parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
}>;

type OwnerRecord = Readonly<{
  parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
}>;

type ScanState = { nodes: number; properties: number; seen: Set<object> };

class ParametersFailure extends Error {
  constructor(
    readonly code: DxfProductTwoPanelSkirtAnnularMappingParametersBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: DxfProductTwoPanelSkirtAnnularMappingParametersBlockerCodeV1,
  detail: string,
): never {
  throw new ParametersFailure(code, detail);
}

function blocked(error: unknown): DxfProductTwoPanelSkirtAnnularMappingParametersResultV1 {
  const failure =
    error instanceof ParametersFailure
      ? error
      : new ParametersFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Annular mapping parameters failed closed.',
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
        code: DxfProductTwoPanelSkirtAnnularMappingParametersBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function detachPlain(value: unknown, path: string, depth: number, state: ScanState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) fail('invalid-input', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} must be finite.`);
    if (Object.is(value, -0)) fail('invalid-input', `${path} cannot contain signed zero.`);
    return value;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-input', `${path} must contain plain data only.`);
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds the depth bound.`);
  if (state.seen.has(value))
    fail('invalid-input', `${path} cannot contain aliases or cyclic references.`);
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail('invalid-input', `${path} exceeds the node bound.`);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', `${path} cannot contain binary storage.`);
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
    const lengthDescriptor = descriptors.length;
    if (
      !lengthDescriptor ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      !Number.isInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    )
      fail('invalid-input', `${path} has an invalid array length descriptor.`);
    const length = lengthDescriptor.value as number;
    if (length > MAX_ARRAY) fail('invalid-input', `${path} exceeds the array bound.`);
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      fail('invalid-input', `${path} must be a dense array.`);
  }
  state.properties += dataKeys.length;
  if (state.properties > MAX_PROPERTIES)
    fail('invalid-input', `${path} exceeds the property bound.`);
  const detachedArray: unknown[] | null = array ? [] : null;
  const detachedRecord: Record<string, unknown> | null = array
    ? null
    : (Object.create(null) as Record<string, unknown>);
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
    const child = detachPlain(descriptor.value, `${path}.${key}`, depth + 1, state);
    if (detachedArray) detachedArray.push(child);
    else
      Object.defineProperty(detachedRecord!, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: child,
      });
  }
  return detachedArray ?? detachedRecord;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', `${path} must be an exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} reflection failed.`);
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-input', `${path} must use a plain prototype.`);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', `${path} has an invalid exact shape.`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
    result[key] = descriptor.value;
  }
  return result;
}

function detach(input: unknown): Readonly<{
  request: DetachedRequest;
  composerOwner: unknown;
  semanticsOwner: unknown;
  bodyAdmissionOwner: unknown;
}> {
  const root = exactRecord(
    input,
    [
      'schemaVersion',
      'expected',
      'composerOwner',
      'semanticsOwner',
      'bodyAdmissionOwner',
      'parameters',
    ],
    'request',
  );
  const request = detachPlain(
    {
      schemaVersion: root.schemaVersion,
      expected: root.expected,
      parameters: root.parameters,
    },
    'request',
    0,
    { nodes: 0, properties: 0, seen: new Set<object>() },
  ) as DetachedRequest;
  return {
    request,
    composerOwner: root.composerOwner,
    semanticsOwner: root.semanticsOwner,
    bodyAdmissionOwner: root.bodyAdmissionOwner,
  };
}

function stableId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > MAX_STRING || !STABLE_ID.test(value))
    fail('mapping-parameter-invalid', `${path} must be a bounded stable ID.`);
  return value;
}

function exactTuple2(value: unknown, path: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isFinite(item)))
    fail('mapping-parameter-invalid', `${path} must be one finite tuple2.`);
  return [Number(value[0]), Number(value[1])];
}

function validateAcceptance(value: unknown): DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1 {
  const record = exactRecord(
    value,
    [
      'id',
      'revision',
      'parameterResidualMm',
      'parameterResidualRad',
      'conicalIdentityResidualM',
      'maxAbsEdgeStretchDelta',
      'maxAbsAreaScaleDelta',
      'minNormalizedOrientationDot',
      'maxAbsWarpGreenStrain',
      'maxAbsWeftGreenStrain',
      'maxAbsShear',
      'selfIntersectionPolicyRevision',
    ],
    'request.parameters.acceptance',
  );
  stableId(record.id, 'request.parameters.acceptance.id');
  stableId(record.revision, 'request.parameters.acceptance.revision');
  stableId(
    record.selfIntersectionPolicyRevision,
    'request.parameters.acceptance.selfIntersectionPolicyRevision',
  );
  for (const key of [
    'parameterResidualMm',
    'parameterResidualRad',
    'conicalIdentityResidualM',
    'maxAbsEdgeStretchDelta',
    'maxAbsAreaScaleDelta',
    'maxAbsWarpGreenStrain',
    'maxAbsWeftGreenStrain',
    'maxAbsShear',
  ] as const) {
    const numeric = record[key];
    if (
      typeof numeric !== 'number' ||
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      numeric > MAX_ACCEPTANCE_MAGNITUDE
    )
      fail('acceptance-parameter-invalid', `request.parameters.acceptance.${key} is invalid.`);
  }
  if (
    typeof record.minNormalizedOrientationDot !== 'number' ||
    !Number.isFinite(record.minNormalizedOrientationDot) ||
    record.minNormalizedOrientationDot < -1 ||
    record.minNormalizedOrientationDot > 1
  )
    fail(
      'acceptance-parameter-invalid',
      'request.parameters.acceptance.minNormalizedOrientationDot must be within [-1, 1].',
    );
  return value as DxfProductTwoPanelSkirtAnnularMappingAcceptanceV1;
}

function validateParameters(
  value: unknown,
  semantics: NonNullable<ReturnType<typeof projectDxfProductTwoPanelSkirtPlacementSemanticsV1>>,
): DxfProductTwoPanelSkirtAnnularMappingParametersV1 {
  const record = exactRecord(
    value,
    ['id', 'revision', 'units', 'waistReferenceColliderId', 'seamAnchor', 'pieces', 'acceptance'],
    'request.parameters',
  );
  const id = stableId(record.id, 'request.parameters.id');
  const revision = stableId(record.revision, 'request.parameters.revision');
  if (id !== semantics.policy.mapping.id || revision !== semantics.policy.mapping.revision)
    fail('mapping-identity-mismatch', 'Authored mapping ID/revision differ from D0 semantics.');
  const units = exactRecord(record.units, ['planar', 'body', 'angle'], 'request.parameters.units');
  if (units.planar !== 'mm' || units.body !== 'm' || units.angle !== 'rad')
    fail('mapping-parameter-invalid', 'Mapping units must be exactly mm/m/rad.');
  stableId(record.waistReferenceColliderId, 'request.parameters.waistReferenceColliderId');
  const anchor = exactRecord(
    record.seamAnchor,
    ['seamId', 'bodyAngleRad'],
    'request.parameters.seamAnchor',
  );
  const seamId = stableId(anchor.seamId, 'request.parameters.seamAnchor.seamId');
  const seamIds = [semantics.garment.leftSeamId, semantics.garment.rightSeamId];
  if (!seamIds.includes(seamId))
    fail('seam-binding-mismatch', 'Body seam anchor is not one exact D0 seam.');
  if (
    typeof anchor.bodyAngleRad !== 'number' ||
    !Number.isFinite(anchor.bodyAngleRad) ||
    anchor.bodyAngleRad < 0 ||
    anchor.bodyAngleRad >= TWO_PI
  )
    fail('mapping-parameter-invalid', 'Body seam anchor angle must be canonical [0, 2pi).');
  if (!Array.isArray(record.pieces) || record.pieces.length !== 2)
    fail('piece-binding-mismatch', 'Exactly two authored piece parameter records are required.');
  const pieceIds: string[] = [];
  let totalSpan = 0;
  for (let index = 0; index < record.pieces.length; index += 1) {
    const piece = exactRecord(
      record.pieces[index],
      [
        'pieceId',
        'planarApexMm',
        'planarStartRayUnit2',
        'planarAngularDirection',
        'planarStartSeamId',
        'waistSlantRadiusMm',
        'hemSlantRadiusMm',
        'sectorSpanRad',
      ],
      `request.parameters.pieces[${index}]`,
    );
    const pieceId = stableId(piece.pieceId, `request.parameters.pieces[${index}].pieceId`);
    pieceIds.push(pieceId);
    const apex = exactTuple2(
      piece.planarApexMm,
      `request.parameters.pieces[${index}].planarApexMm`,
    );
    if (apex.some((coordinate) => Math.abs(coordinate) > MAX_PLANAR_ABS_MM))
      fail('mapping-parameter-invalid', `${pieceId} apex exceeds the planar bound.`);
    const ray = exactTuple2(
      piece.planarStartRayUnit2,
      `request.parameters.pieces[${index}].planarStartRayUnit2`,
    );
    if (Math.abs(Math.hypot(...ray) - 1) > UNIT_VECTOR_TOLERANCE)
      fail('mapping-parameter-invalid', `${pieceId} start ray is not a unit vector.`);
    if (piece.planarAngularDirection !== 1 && piece.planarAngularDirection !== -1)
      fail('mapping-parameter-invalid', `${pieceId} angular direction must be +1 or -1.`);
    const startSeam = stableId(
      piece.planarStartSeamId,
      `request.parameters.pieces[${index}].planarStartSeamId`,
    );
    if (startSeam !== seamId)
      fail('seam-binding-mismatch', `${pieceId} start seam differs from the body seam anchor.`);
    if (
      typeof piece.waistSlantRadiusMm !== 'number' ||
      typeof piece.hemSlantRadiusMm !== 'number' ||
      !Number.isFinite(piece.waistSlantRadiusMm) ||
      !Number.isFinite(piece.hemSlantRadiusMm) ||
      piece.waistSlantRadiusMm <= 0 ||
      piece.hemSlantRadiusMm <= piece.waistSlantRadiusMm ||
      piece.hemSlantRadiusMm > MAX_SLANT_RADIUS_MM
    )
      fail('mapping-parameter-invalid', `${pieceId} slant radii are invalid or unbounded.`);
    if (
      typeof piece.sectorSpanRad !== 'number' ||
      !Number.isFinite(piece.sectorSpanRad) ||
      piece.sectorSpanRad <= 0 ||
      piece.sectorSpanRad >= TWO_PI
    )
      fail('mapping-parameter-invalid', `${pieceId} sector span must be within (0, 2pi).`);
    totalSpan += piece.sectorSpanRad;
  }
  const expectedPieceIds = semantics.garment.circumferentialOrder.pieceIds;
  if (
    pieceIds.length !== expectedPieceIds.length ||
    pieceIds.some((pieceId, index) => pieceId !== expectedPieceIds[index])
  )
    fail(
      'piece-binding-mismatch',
      'Authored parameter pieces differ from the exact D0 circumferential order.',
    );
  if (!Number.isFinite(totalSpan) || totalSpan >= TWO_PI)
    fail('mapping-parameter-invalid', 'Total authored sector span must remain below 2pi.');
  validateAcceptance(record.acceptance);
  return value as DxfProductTwoPanelSkirtAnnularMappingParametersV1;
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
    .sort()
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
    fail('invalid-input', 'Annular parameter seal exceeds its byte bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof ParametersFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

const owners = new WeakMap<object, OwnerRecord>();

export async function buildDxfProductTwoPanelSkirtAnnularMappingParametersV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductTwoPanelSkirtAnnularMappingParametersResultV1> {
  try {
    const { request, composerOwner, semanticsOwner, bodyAdmissionOwner } = detach(input);
    if (request.schemaVersion !== DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1)
      fail('invalid-input', 'Annular parameter request schema is unsupported.');
    exactRecord(
      request.expected,
      ['composerCanonicalSha256', 'semanticsCanonicalSha256', 'bodyAdmissionCanonicalSha256'],
      'request.expected',
    );
    if (
      !SHA256.test(request.expected.composerCanonicalSha256) ||
      !SHA256.test(request.expected.semanticsCanonicalSha256) ||
      !SHA256.test(request.expected.bodyAdmissionCanonicalSha256)
    )
      fail('invalid-input', 'Expected upstream seals must be lowercase SHA-256.');
    const composer = projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner);
    if (!composer)
      fail('composer-owner-unavailable', 'A live genuine C6 composer owner is required.');
    const semantics = projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner);
    if (!semantics)
      fail('semantics-owner-unavailable', 'A live genuine D0 semantics owner is required.');
    if (!isDxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1(bodyAdmissionOwner))
      fail(
        'body-admission-owner-unavailable',
        'A live genuine D1 body admission owner is required.',
      );
    const publicComposer = composerOwner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const publicSemantics = semanticsOwner as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
    const publicAdmission =
      bodyAdmissionOwner as DxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1;
    if (
      publicComposer.snapshot.seal.canonicalSha256 !== request.expected.composerCanonicalSha256 ||
      composer.composerCanonicalSha256 !== request.expected.composerCanonicalSha256 ||
      publicSemantics.snapshot.seal.canonicalSha256 !== request.expected.semanticsCanonicalSha256 ||
      semantics.composerCanonicalSha256 !== request.expected.composerCanonicalSha256 ||
      publicAdmission.snapshot.seal.canonicalSha256 !==
        request.expected.bodyAdmissionCanonicalSha256 ||
      publicAdmission.snapshot.bindings.composerCanonicalSha256 !==
        request.expected.composerCanonicalSha256 ||
      publicAdmission.snapshot.bindings.semanticsCanonicalSha256 !==
        request.expected.semanticsCanonicalSha256 ||
      publicAdmission.snapshot.bindings.phase2ArtifactSha256 !== composer.phase2ArtifactSha256 ||
      publicAdmission.snapshot.bindings.semanticsBodyIdentitySha256 !==
        publicSemantics.snapshot.bindings.bodyIdentitySha256 ||
      publicAdmission.snapshot.bindings.placementPolicySha256 !==
        publicSemantics.snapshot.bindings.placementPolicySha256 ||
      publicAdmission.snapshot.bindings.bodyProviderId !== semantics.body.providerId ||
      publicAdmission.snapshot.bindings.bodyProviderRevision !== semantics.body.providerRevision ||
      publicAdmission.snapshot.bindings.bodyId !== semantics.body.bodyId ||
      publicAdmission.snapshot.bindings.bodyRevision !== semantics.body.bodyRevision ||
      publicAdmission.snapshot.bindings.poseKind !== semantics.body.poseKind ||
      publicAdmission.snapshot.bindings.poseRevision !== semantics.body.poseRevision ||
      publicAdmission.snapshot.bindings.collisionLodId !== semantics.body.collisionLodId ||
      publicComposer.snapshot.origin !== semantics.origin ||
      publicAdmission.snapshot.origin !== semantics.origin ||
      composer.placementAuthority !== false ||
      semantics.placementTransformAuthority !== false ||
      publicAdmission.snapshot.claims.bodyProviderBound !== true ||
      publicAdmission.snapshot.claims.bodyProvenanceCleared !== true ||
      publicAdmission.snapshot.claims.mappingFamilyBound !== true ||
      publicAdmission.snapshot.claims.mappingParametersBound !== false ||
      publicAdmission.snapshot.claims.placementAdmitted !== false
    )
      fail('authority-binding-mismatch', 'C6, D0 and D1 bindings or honest claims differ.');
    if (semantics.policy.mapping.kind !== 'authored-annular-sector-conical')
      fail('mapping-identity-mismatch', 'D0 does not bind the annular-sector mapping family.');
    const parameters = validateParameters(request.parameters, semantics);
    const crypto = options.crypto ?? globalThis.crypto;
    const [mappingParametersSha256, acceptancePolicySha256] = await Promise.all([
      sha256(
        'dxf-product-two-panel-skirt-annular-mapping-parameters-payload-v1',
        parameters,
        crypto,
      ),
      sha256(
        'dxf-product-two-panel-skirt-annular-mapping-acceptance-v1',
        parameters.acceptance,
        crypto,
      ),
    ]);
    if (
      !projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner) ||
      !projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner) ||
      !isDxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1(bodyAdmissionOwner)
    )
      fail('authority-binding-mismatch', 'An upstream owner expired during parameter sealing.');
    const bindings = deepFreeze({
      composerCanonicalSha256: request.expected.composerCanonicalSha256,
      semanticsCanonicalSha256: request.expected.semanticsCanonicalSha256,
      bodyAdmissionCanonicalSha256: request.expected.bodyAdmissionCanonicalSha256,
      phase2ArtifactSha256: composer.phase2ArtifactSha256,
      mappingParametersSha256,
      acceptancePolicySha256,
    });
    const payload = {
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_V1,
      status: 'authored-annular-mapping-parameters-candidate' as const,
      origin: semantics.origin,
      bindings,
      counts: { pieceCount: 2 as const, seamCount: 2 as const },
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_BLOCKERS_V1,
    };
    const canonicalSha256 = await sha256(
      'dxf-product-two-panel-skirt-annular-mapping-parameters-v1',
      payload,
      crypto,
    );
    if (
      !projectPatternImportDxfProductGarmentMeshComposerV2(composerOwner) ||
      !projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner) ||
      !isDxfProductTwoPanelSkirtPlacementBodyAdmissionOwnerV1(bodyAdmissionOwner)
    )
      fail('authority-binding-mismatch', 'An upstream owner expired before parameter publication.');
    const snapshot = deepFreeze({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    } satisfies DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1);
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_OWNER_V1,
      snapshot,
    }) as unknown as DxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1;
    owners.set(owner, { parameters: deepFreeze(parameters) });
    return Object.freeze({
      ok: true as const,
      owner,
      snapshot,
      claims: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_CLAIMS_V1,
      blockers: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_BLOCKERS_V1,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function isDxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1(
  owner: unknown,
): owner is DxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1 {
  return !!owner && (typeof owner === 'object' || typeof owner === 'function') && owners.has(owner);
}

export function projectDxfProductTwoPanelSkirtAnnularMappingParametersV1(
  owner: unknown,
): DxfProductTwoPanelSkirtAnnularMappingParametersProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function') || !clone) return null;
  const record = owners.get(owner);
  if (!record) return null;
  const publicOwner = owner as DxfProductTwoPanelSkirtAnnularMappingParametersOwnerV1;
  let parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
  let bindings: DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1['bindings'];
  try {
    parameters = clone(record.parameters) as DxfProductTwoPanelSkirtAnnularMappingParametersV1;
    bindings = clone(
      publicOwner.snapshot.bindings,
    ) as DxfProductTwoPanelSkirtAnnularMappingParametersSnapshotV1['bindings'];
  } catch {
    return null;
  }
  return {
    schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_PROJECTION_V1,
    origin: publicOwner.snapshot.origin,
    bindings,
    parameters,
    callerOwnedMutablePlainCopies: true,
    upstreamOwnersRetained: false,
    mappingParametersAuthority: true,
    mappingDomainAuthority: false,
    acceptancePolicyAuthority: false,
    placementTransformAuthority: false,
    staticPreviewAuthority: false,
    runtimeAuthority: false,
    persistenceAuthority: false,
    settleAuthority: false,
    fitAuthority: false,
    productionAuthority: false,
  };
}

export function disposeDxfProductTwoPanelSkirtAnnularMappingParametersV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  return owners.delete(owner);
}
