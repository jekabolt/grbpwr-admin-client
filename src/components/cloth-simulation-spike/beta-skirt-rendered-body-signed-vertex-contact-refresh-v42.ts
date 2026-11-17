import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2,
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2,
  BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
  computeBetaSkirtRenderedBodyCollisionContentFingerprintV2,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV2,
  type BetaSkirtRenderedBodyCollisionPolicyIdentityV2,
} from './beta-skirt-rendered-body-collision-diagnostic-v2';

export const BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_V42 =
  'beta-skirt-rendered-body-signed-vertex-contact-refresh/4.2' as const;

export type BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42 = 0 | 1 | 2 | 3;

export interface BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42 {
  readonly maxBodyVertices: number;
  readonly maxBodyTriangles: number;
  readonly maxCandidateVertices: number;
  readonly maxCandidateTriangles: number;
  readonly maxInputBytes: number;
  readonly maxDistanceTriangleTests: number;
  readonly maxRayTriangleTests: number;
  readonly maxContacts: number;
  readonly maxContactBytes: number;
  readonly maxOperations: number;
  readonly maxExtractionRound: number;
}

export const BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_POLICY_V42: BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42 =
  Object.freeze({
    maxBodyVertices: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxBodyVertices,
    maxBodyTriangles: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxBodyTriangles,
    maxCandidateVertices:
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxGarmentVertices,
    maxCandidateTriangles:
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxGarmentTriangles,
    maxInputBytes: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxInputBytes,
    maxDistanceTriangleTests:
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxDistanceTriangleTests,
    maxRayTriangleTests:
      BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxRayTriangleTests,
    maxContacts: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.maxGarmentVertices,
    maxContactBytes: 2 * 1024 * 1024,
    maxOperations: 130_000_000,
    maxExtractionRound: 3,
  });

export type BetaSkirtRenderedBodySignedVertexContactRefreshErrorCodeV42 =
  | 'input-invalid'
  | 'policy-mismatch'
  | 'terminal-report-blocked'
  | 'terminal-receipt-mismatch'
  | 'classification-parity-mismatch'
  | 'resource-cap-exceeded'
  | 'crypto-unavailable';

export class BetaSkirtRenderedBodySignedVertexContactRefreshErrorV42 extends Error {
  constructor(
    readonly code: BetaSkirtRenderedBodySignedVertexContactRefreshErrorCodeV42,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtRenderedBodySignedVertexContactRefreshErrorV42';
  }
}

export interface BetaSkirtRenderedBodySignedVertexContactTerminalBindingV42 {
  readonly collisionInputSha256: string;
  /** Deterministic Collision V2 semantic report hash; wall time is normalized to zero. */
  readonly terminalCollisionReportSha256: string;
  readonly collisionPolicyContentSha256: string;
}

export interface BetaSkirtRenderedBodySignedVertexContactRefreshInputV42 {
  readonly extractionRound: BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42;
  /** Must already be world-space: scale=1 and translation=[+0,+0,+0]. */
  readonly collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV2;
  readonly terminalCollisionReport: BetaSkirtRenderedBodyCollisionDiagnosticReportV2;
  readonly terminalReceiptBinding: BetaSkirtRenderedBodySignedVertexContactTerminalBindingV42;
}

export interface BetaSkirtRenderedBodySignedVertexContactV42 {
  readonly ordinal: number;
  readonly extractionRound: BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42;
  readonly vertexIndex: number;
  readonly classification: 'penetrating' | 'unsafe-outside';
  readonly bodyTriangleIndex: number;
  readonly bodyVertexIndices: readonly [number, number, number];
  readonly bodySurfacePointM: readonly [number, number, number];
  readonly outwardBodyNormal: readonly [number, number, number];
  readonly signedDistanceM: number;
  readonly minimumClearanceM: number;
}

export interface BetaSkirtRenderedBodySignedVertexContactRefreshReceiptV42 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_V42;
  readonly status: 'signed-vertex-contacts-ready';
  readonly extractionRound: BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42;
  readonly collisionPolicyIdentity: BetaSkirtRenderedBodyCollisionPolicyIdentityV2;
  readonly terminal: Readonly<{
    collisionInputSha256: string;
    collisionReportSha256: string;
  }>;
  readonly geometry: Readonly<{
    bodyPositionsSha256: string;
    bodyTrianglesSha256: string;
    candidatePositionsSha256: string;
    candidateTrianglesSha256: string;
    contactSetSha256: string;
  }>;
  readonly counts: Readonly<{
    bodyVertexCount: number;
    bodyTriangleCount: number;
    candidateVertexCount: number;
    candidateTriangleCount: number;
    penetratingVertexCount: number;
    unsafeVertexCount: number;
    ambiguousSignVertexCount: 0;
    contactCount: number;
  }>;
  readonly clearance: Readonly<{
    minimumUnsignedClearanceM: number;
    minimumSignedClearanceM: number;
    unsafeClearanceMarginM: number;
  }>;
  readonly usage: Readonly<{
    distanceTriangleTestCount: number;
    rayTriangleTestCount: number;
    operationCount: number;
    contactByteLength: number;
  }>;
  readonly limits: BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42;
  readonly claims: Readonly<{
    collisionPolicyV2ContentBound: true;
    collisionV2ClassificationIndependentlyReplayed: true;
    terminalCollisionReceiptBound: true;
    exactOwnedWorldGeometryBound: true;
    signedClassificationParityVerified: true;
    partialContactsReturned: false;
    initializationAdmitted: false;
    collisionClearClaimed: false;
    fitClaimed: false;
    runtimeAuthorityClaimed: false;
    productionAuthorityClaimed: false;
  }>;
}

export interface BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_V42;
  readonly status: 'signed-vertex-contacts-ready';
  readonly extractionRound: BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42;
  readonly contacts: readonly BetaSkirtRenderedBodySignedVertexContactV42[];
  readonly receipt: BetaSkirtRenderedBodySignedVertexContactRefreshReceiptV42;
  readonly receiptSha256: string;
}

export interface BetaSkirtRenderedBodySignedVertexContactRefreshOptionsV42 {
  readonly policy?: BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42;
}

interface ClosestPointResult {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distanceSquared: number;
  readonly triangleIndex: number;
}

interface OperationBudget {
  count: number;
  readonly maximum: number;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const TEXT_ENCODER = new TextEncoder();
const TEXT_ENCODER_ENCODE = TextEncoder.prototype.encode;
const SUBTLE = globalThis.crypto?.subtle ?? null;
const SUBTLE_DIGEST = typeof SubtleCrypto === 'undefined' ? null : SubtleCrypto.prototype.digest;
const DATA_VIEW_SET_FLOAT32 = DataView.prototype.setFloat32;
const DATA_VIEW_SET_UINT32 = DataView.prototype.setUint32;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STRINGIFY = JSON.stringify;
const ARRAY_IS_ARRAY = Array.isArray;
const PROMISE_ALL = Promise.all;
const RAY_DIRECTIONS: readonly (readonly [number, number, number])[] = OBJECT_FREEZE([
  OBJECT_FREEZE([1, 0.3713906763541037, 0.1937129433613962]) as readonly [number, number, number],
  OBJECT_FREEZE([0.219438401739403, 1, 0.413879781155325]) as readonly [number, number, number],
  OBJECT_FREEZE([0.317022238725803, 0.233891391482773, 1]) as readonly [number, number, number],
]);
const POLICY_KEYS = OBJECT_FREEZE([
  'maxBodyVertices',
  'maxBodyTriangles',
  'maxCandidateVertices',
  'maxCandidateTriangles',
  'maxInputBytes',
  'maxDistanceTriangleTests',
  'maxRayTriangleTests',
  'maxContacts',
  'maxContactBytes',
  'maxOperations',
  'maxExtractionRound',
] as const satisfies readonly (keyof BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42)[]);
const INPUT_KEYS = OBJECT_FREEZE([
  'extractionRound',
  'collisionInput',
  'terminalCollisionReport',
  'terminalReceiptBinding',
] as const);
const TERMINAL_BINDING_KEYS = OBJECT_FREEZE([
  'collisionInputSha256',
  'terminalCollisionReportSha256',
  'collisionPolicyContentSha256',
] as const);
const REPORT_KEYS = OBJECT_FREEZE([
  'version',
  'policyIdentity',
  'status',
  'binding',
  'contentFingerprintSha256',
  'engine',
  'coordinateFrame',
  'topology',
  'intersections',
  'clearance',
  'limits',
  'usage',
  'blockers',
  'claims',
] as const);

function fail(
  code: BetaSkirtRenderedBodySignedVertexContactRefreshErrorCodeV42,
  message: string,
): never {
  throw new BetaSkirtRenderedBodySignedVertexContactRefreshErrorV42(code, message);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    ARRAY_IS_ARRAY(value) ||
    (OBJECT_GET_PROTOTYPE_OF(value) !== Object.prototype && OBJECT_GET_PROTOTYPE_OF(value) !== null)
  )
    fail('input-invalid', `${label} must be a plain record.`);
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (ownKeys.length !== keys.length) fail('input-invalid', `${label} has an unsupported shape.`);
  for (let index = 0; index < ownKeys.length; index += 1) {
    const ownKey = ownKeys[index];
    let supported = false;
    if (typeof ownKey === 'string') {
      for (let expected = 0; expected < keys.length; expected += 1) {
        if (keys[expected] === ownKey) supported = true;
      }
    }
    if (!supported) fail('input-invalid', `${label} has an unsupported shape.`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      fail('input-invalid', `${label}.${key} must be an enumerable data property.`);
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotPolicy(value: unknown): BetaSkirtRenderedBodySignedVertexContactRefreshPolicyV42 {
  if (value === undefined) return BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_POLICY_V42;
  const record = exactRecord(value, POLICY_KEYS, 'options.policy');
  for (const key of POLICY_KEYS) {
    if (
      !Object.is(
        record[key],
        BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_POLICY_V42[key],
      )
    )
      fail('policy-mismatch', `options.policy.${key} differs from signed refresh V4.2.`);
  }
  return BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_POLICY_V42;
}

function deepSnapshot(value: unknown, label: string, depth = 0, budget = { count: 0 }): JsonValue {
  budget.count += 1;
  if (budget.count > 4096 || depth > 16)
    fail('input-invalid', `${label} exceeds its JSON snapshot cap.`);
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('input-invalid', `${label} contains a non-finite number.`);
    return value;
  }
  if (!value || typeof value !== 'object') fail('input-invalid', `${label} is not JSON data.`);
  if (ARRAY_IS_ARRAY(value)) {
    if (OBJECT_GET_PROTOTYPE_OF(value) !== Array.prototype)
      fail('input-invalid', `${label} must be an exact array.`);
    const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    const length = lengthDescriptor?.value;
    const ownKeys = REFLECT_OWN_KEYS(value);
    if (!Number.isSafeInteger(length) || (length as number) < 0 || ownKeys.length !== length + 1)
      fail('input-invalid', `${label} must be an undecorated dense array.`);
    for (let index = 0; index < (length as number); index += 1) {
      if (ownKeys[index] !== String(index))
        fail('input-invalid', `${label} must be an undecorated dense array.`);
    }
    if (ownKeys[length as number] !== 'length')
      fail('input-invalid', `${label} must be an undecorated dense array.`);
    const result: JsonValue[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
      if (!descriptor || descriptor.get || descriptor.set || !descriptor.enumerable)
        fail('input-invalid', `${label}[${index}] must be an enumerable data property.`);
      result[index] = deepSnapshot(descriptor.value, `${label}[${index}]`, depth + 1, budget);
    }
    return OBJECT_FREEZE(result) as unknown as JsonValue;
  }
  if (
    OBJECT_GET_PROTOTYPE_OF(value) !== Object.prototype &&
    OBJECT_GET_PROTOTYPE_OF(value) !== null
  )
    fail('input-invalid', `${label} must contain only plain records.`);
  const keys = REFLECT_OWN_KEYS(value);
  const stringKeys: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string')
      fail('input-invalid', `${label} must not contain symbol keys.`);
    stringKeys[index] = keys[index] as string;
  }
  const result: Record<string, JsonValue> = {};
  const sortedKeys = sortStrings(stringKeys);
  for (let index = 0; index < sortedKeys.length; index += 1) {
    const key = sortedKeys[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || descriptor.get || descriptor.set || !descriptor.enumerable)
      fail('input-invalid', `${label}.${key} must be an enumerable data property.`);
    result[key] = deepSnapshot(descriptor.value, `${label}.${key}`, depth + 1, budget);
  }
  return OBJECT_FREEZE(result);
}

function sortStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    let insertion = result.length;
    while (insertion > 0 && result[insertion - 1] > value) insertion -= 1;
    for (let offset = result.length; offset > insertion; offset -= 1)
      result[offset] = result[offset - 1];
    result[insertion] = value;
  }
  return result;
}

function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return STRINGIFY(value);
  if (ARRAY_IS_ARRAY(value)) {
    let result = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) result += ',';
      result += canonicalJson(value[index]);
    }
    return `${result}]`;
  }
  const ownKeys = REFLECT_OWN_KEYS(value);
  const stringKeys: string[] = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    if (typeof ownKeys[index] !== 'string')
      fail('input-invalid', 'Canonical JSON record contains a symbol key.');
    stringKeys[index] = ownKeys[index] as string;
  }
  const keys = sortStrings(stringKeys);
  let result = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) result += ',';
    const key = keys[index];
    result += `${STRINGIFY(key)}:${canonicalJson(value[key])}`;
  }
  return `${result}}`;
}

function semanticReportSnapshot(value: unknown): JsonValue {
  const top = exactRecord(value, REPORT_KEYS, 'terminalCollisionReport');
  const snapshot = deepSnapshot(top, 'terminalCollisionReport') as Record<string, JsonValue>;
  if (snapshot.version !== BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2)
    fail('input-invalid', 'Terminal collision report version is not V2.');
  if (!SHA256.test(String(snapshot.contentFingerprintSha256)))
    fail('input-invalid', 'Terminal collision report fingerprint is invalid.');
  const identity = snapshot.policyIdentity as Record<string, JsonValue>;
  if (
    canonicalJson(identity) !==
    canonicalJson(deepSnapshot(BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2, 'policy'))
  )
    fail('policy-mismatch', 'Terminal collision report policy identity differs from V2.');
  const usage = snapshot.usage as Record<string, JsonValue>;
  if (typeof usage.wallTimeMs !== 'number' || usage.wallTimeMs < 0)
    fail('input-invalid', 'Terminal collision wall time is invalid.');
  return OBJECT_FREEZE({ ...snapshot, usage: OBJECT_FREEZE({ ...usage, wallTimeMs: 0 }) });
}

function hex(bytes: Uint8Array): string {
  const alphabet = '0123456789abcdef';
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    result += alphabet[(value >>> 4) & 0x0f] + alphabet[value & 0x0f];
  }
  return result;
}

async function digest(bytes: Uint8Array): Promise<string> {
  if (!SUBTLE || !SUBTLE_DIGEST)
    fail('crypto-unavailable', 'Native WebCrypto SHA-256 is unavailable.');
  let result: ArrayBuffer;
  try {
    result = await SUBTLE_DIGEST.call(SUBTLE, 'SHA-256', bytes.slice().buffer);
  } catch {
    fail('crypto-unavailable', 'Native WebCrypto SHA-256 failed.');
  }
  const value = hex(new Uint8Array(result));
  if (!SHA256.test(value))
    fail('crypto-unavailable', 'Native WebCrypto returned an invalid digest.');
  return value;
}

async function canonicalSha256(value: JsonValue): Promise<string> {
  return digest(TEXT_ENCODER_ENCODE.call(TEXT_ENCODER, canonicalJson(value)));
}

async function assertDigest(): Promise<void> {
  if ((await digest(new Uint8Array(0))) !== SHA256_EMPTY)
    fail('crypto-unavailable', 'Native SHA-256 failed its known-answer test.');
}

function typedBytes(values: Float32Array | Uint32Array, kind: 'f32' | 'u32'): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    if (kind === 'f32') DATA_VIEW_SET_FLOAT32.call(view, index * 4, values[index], true);
    else DATA_VIEW_SET_UINT32.call(view, index * 4, values[index], true);
  }
  return bytes;
}

function consume(budget: OperationBudget, count = 1): void {
  if (!Number.isSafeInteger(count) || count < 0 || budget.count > budget.maximum - count)
    fail('resource-cap-exceeded', 'Signed refresh operation cap exceeded.');
  budget.count += count;
}

function closestPointOnTriangle(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): Omit<ClosestPointResult, 'triangleIndex'> {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0)
    return { x: ax, y: ay, z: az, distanceSquared: apx * apx + apy * apy + apz * apz };
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3)
    return { x: bx, y: by, z: bz, distanceSquared: bpx * bpx + bpy * bpy + bpz * bpz };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const x = ax + v * abx;
    const y = ay + v * aby;
    const z = az + v * abz;
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6)
    return { x: cx, y: cy, z: cz, distanceSquared: cpx * cpx + cpy * cpy + cpz * cpz };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const x = ax + w * acx;
    const y = ay + w * acy;
    const z = az + w * acz;
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    const x = bx + w * (cx - bx);
    const y = by + w * (cy - by);
    const z = bz + w * (cz - bz);
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  const x = ax + abx * v + acx * w;
  const y = ay + aby * v + acy * w;
  const z = az + abz * v + acz * w;
  return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
}

function nearestPoint(
  positions: Float32Array,
  triangles: Uint32Array,
  px: number,
  py: number,
  pz: number,
  budget: OperationBudget,
): ClosestPointResult {
  let best: ClosestPointResult | null = null;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    consume(budget);
    const offset = triangle * 3;
    const ai = triangles[offset] * 3;
    const bi = triangles[offset + 1] * 3;
    const ci = triangles[offset + 2] * 3;
    const point = closestPointOnTriangle(
      px,
      py,
      pz,
      positions[ai],
      positions[ai + 1],
      positions[ai + 2],
      positions[bi],
      positions[bi + 1],
      positions[bi + 2],
      positions[ci],
      positions[ci + 1],
      positions[ci + 2],
    );
    if (!best || point.distanceSquared < best.distanceSquared)
      best = { ...point, triangleIndex: triangle };
  }
  if (!best) fail('classification-parity-mismatch', 'Nearest body triangle was not found.');
  return best;
}

function rayParity(
  positions: Float32Array,
  triangles: Uint32Array,
  px: number,
  py: number,
  pz: number,
  direction: readonly [number, number, number],
  epsilonM: number,
  budget: OperationBudget,
): boolean | null {
  let intersections = 0;
  let ambiguous = false;
  const [dx, dy, dz] = direction;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    consume(budget);
    const offset = triangle * 3;
    const ai = triangles[offset] * 3;
    const bi = triangles[offset + 1] * 3;
    const ci = triangles[offset + 2] * 3;
    const ax = positions[ai];
    const ay = positions[ai + 1];
    const az = positions[ai + 2];
    const e1x = positions[bi] - ax;
    const e1y = positions[bi + 1] - ay;
    const e1z = positions[bi + 2] - az;
    const e2x = positions[ci] - ax;
    const e2y = positions[ci + 1] - ay;
    const e2z = positions[ci + 2] - az;
    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;
    const determinant = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(determinant) <= epsilonM) continue;
    const inverse = 1 / determinant;
    const sx = px - ax;
    const sy = py - ay;
    const sz = pz - az;
    const u = inverse * (sx * hx + sy * hy + sz * hz);
    if (u < -epsilonM || u > 1 + epsilonM) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = inverse * (dx * qx + dy * qy + dz * qz);
    if (v < -epsilonM || u + v > 1 + epsilonM) continue;
    const t = inverse * (e2x * qx + e2y * qy + e2z * qz);
    if (t <= epsilonM) continue;
    if (u <= epsilonM || v <= epsilonM || 1 - u - v <= epsilonM) ambiguous = true;
    else intersections += 1;
  }
  return ambiguous ? null : intersections % 2 === 1;
}

function assertTerminalReady(report: BetaSkirtRenderedBodyCollisionDiagnosticReportV2): void {
  if (
    report.status !== 'signed-clearance-measured' ||
    report.claims.collisionPolicyV2ContentBound !== true ||
    report.claims.signedClassificationDefensible !== true ||
    report.claims.initializationAdmitted !== false ||
    report.claims.fitClaimed !== false ||
    report.claims.runtimeAuthorityClaimed !== false ||
    report.claims.productionAuthorityClaimed !== false ||
    !report.topology.bodyClosedTwoManifold ||
    !report.topology.bodySingleComponent ||
    !report.topology.bodyConsistentEdgeWinding ||
    report.topology.bodyDegenerateTriangleCount !== 0 ||
    report.topology.bodyDuplicateTriangleCount !== 0 ||
    report.topology.bodyBoundaryOrNonManifoldEdgeCount !== 0 ||
    report.topology.bodyInconsistentWindingEdgeCount !== 0 ||
    report.topology.bodyNonManifoldVertexCount !== 0 ||
    report.topology.bodyConnectedComponentCount !== 1 ||
    report.intersections.bodySelfIntersectionCount !== 0 ||
    report.clearance.minimumUnsignedClearanceM === null ||
    report.clearance.belowUnsignedMarginVertexCount === null ||
    report.clearance.minimumSignedClearanceM === null ||
    report.clearance.penetratingVertexCount === null ||
    report.clearance.unsafeVertexCount === null ||
    report.clearance.ambiguousSignVertexCount !== 0 ||
    report.blockers.includes('budget-exhausted') ||
    report.blockers.includes('input-invalid') ||
    report.blockers.includes('sha256-unavailable')
  )
    fail(
      'terminal-report-blocked',
      'Terminal Collision V2 report is not signed-classification-ready.',
    );
}

export async function computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42(
  report: BetaSkirtRenderedBodyCollisionDiagnosticReportV2,
): Promise<string> {
  const snapshot = semanticReportSnapshot(report);
  await assertDigest();
  return canonicalSha256(snapshot);
}

export async function computeBetaSkirtRenderedBodySignedVertexContactRefreshReceiptSha256V42(
  receipt: BetaSkirtRenderedBodySignedVertexContactRefreshReceiptV42,
): Promise<string> {
  const snapshot = deepSnapshot(receipt, 'signedRefreshReceipt');
  await assertDigest();
  return canonicalSha256(snapshot);
}

export async function refreshBetaSkirtRenderedBodySignedVertexContactsV42(
  value: BetaSkirtRenderedBodySignedVertexContactRefreshInputV42,
  options: BetaSkirtRenderedBodySignedVertexContactRefreshOptionsV42 = {},
): Promise<BetaSkirtRenderedBodySignedVertexContactRefreshResultV42> {
  const optionKeys = REFLECT_OWN_KEYS(options);
  if (optionKeys.some((key) => key !== 'policy') || optionKeys.length > 1)
    fail('input-invalid', 'signed refresh options has an unsupported shape.');
  const policyDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(options, 'policy');
  if (policyDescriptor?.get || policyDescriptor?.set)
    fail('input-invalid', 'options.policy must be a data property.');
  const policy = snapshotPolicy(policyDescriptor?.value);
  const input = exactRecord(value, INPUT_KEYS, 'signed refresh input');
  const extractionRound = input.extractionRound;
  if (
    !Number.isSafeInteger(extractionRound) ||
    (extractionRound as number) < 0 ||
    (extractionRound as number) > policy.maxExtractionRound
  )
    fail('input-invalid', 'extractionRound is invalid.');
  const collisionInput = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2(
    input.collisionInput as BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  );
  if (
    !Object.is(collisionInput.garmentUniformScale, 1) ||
    !Object.is(collisionInput.garmentTranslationM[0], 0) ||
    !Object.is(collisionInput.garmentTranslationM[1], 0) ||
    !Object.is(collisionInput.garmentTranslationM[2], 0)
  )
    fail('input-invalid', 'Collision V4.2 signed refresh requires exact world-space geometry.');
  const reportSnapshotJson = semanticReportSnapshot(input.terminalCollisionReport);
  const terminalReport =
    reportSnapshotJson as unknown as BetaSkirtRenderedBodyCollisionDiagnosticReportV2;
  assertTerminalReady(terminalReport);
  const terminalBindingRecord = exactRecord(
    input.terminalReceiptBinding,
    TERMINAL_BINDING_KEYS,
    'terminalReceiptBinding',
  );
  const terminalBinding = OBJECT_FREEZE({
    collisionInputSha256: String(terminalBindingRecord.collisionInputSha256),
    terminalCollisionReportSha256: String(terminalBindingRecord.terminalCollisionReportSha256),
    collisionPolicyContentSha256: String(terminalBindingRecord.collisionPolicyContentSha256),
  });
  if (
    !SHA256.test(terminalBinding.collisionInputSha256) ||
    !SHA256.test(terminalBinding.terminalCollisionReportSha256) ||
    !SHA256.test(terminalBinding.collisionPolicyContentSha256)
  )
    fail('input-invalid', 'Terminal receipt binding contains an invalid SHA-256.');

  const bodyVertexCount = collisionInput.bodyPositionsM.length / 3;
  const bodyTriangleCount = collisionInput.bodyTriangles.length / 3;
  const candidateVertexCount = collisionInput.garmentPositionsM.length / 3;
  const candidateTriangleCount = collisionInput.garmentTriangles.length / 3;
  const inputByteLength =
    collisionInput.bodyPositionsM.byteLength +
    collisionInput.bodyTriangles.byteLength +
    collisionInput.garmentPositionsM.byteLength +
    collisionInput.garmentTriangles.byteLength;
  const distanceTriangleTests = candidateVertexCount * bodyTriangleCount;
  const rayTriangleTests = distanceTriangleTests * RAY_DIRECTIONS.length;
  if (
    bodyVertexCount > policy.maxBodyVertices ||
    bodyTriangleCount > policy.maxBodyTriangles ||
    candidateVertexCount > policy.maxCandidateVertices ||
    candidateTriangleCount > policy.maxCandidateTriangles ||
    inputByteLength > policy.maxInputBytes ||
    !Number.isSafeInteger(distanceTriangleTests) ||
    distanceTriangleTests > policy.maxDistanceTriangleTests ||
    !Number.isSafeInteger(rayTriangleTests) ||
    rayTriangleTests > policy.maxRayTriangleTests
  )
    fail('resource-cap-exceeded', 'Signed refresh input exceeds its frozen geometry/test caps.');

  await assertDigest();
  const [
    independentReport,
    collisionInputSha256,
    terminalCollisionReportSha256,
    candidatePositionsSha256,
  ] = await (PROMISE_ALL.call(Promise, [
    evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(collisionInput),
    computeBetaSkirtRenderedBodyCollisionContentFingerprintV2(collisionInput),
    canonicalSha256(reportSnapshotJson),
    digest(typedBytes(collisionInput.garmentPositionsM, 'f32')),
  ]) as Promise<
    [
      Awaited<ReturnType<typeof evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2>>,
      string,
      string,
      string,
    ]
  >);
  if (
    canonicalJson(reportSnapshotJson) !== canonicalJson(semanticReportSnapshot(independentReport))
  )
    fail(
      'terminal-receipt-mismatch',
      'Terminal Collision V2 report differs from an independent replay.',
    );
  if (
    collisionInputSha256 !== terminalReport.contentFingerprintSha256 ||
    collisionInputSha256 !== terminalBinding.collisionInputSha256 ||
    terminalCollisionReportSha256 !== terminalBinding.terminalCollisionReportSha256 ||
    terminalBinding.collisionPolicyContentSha256 !==
      BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2.policyContentSha256 ||
    candidatePositionsSha256 !== collisionInput.binding.garmentPositionsSha256
  )
    fail('terminal-receipt-mismatch', 'Terminal Collision V2 input/report/policy binding drifted.');

  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index < collisionInput.bodyPositionsM.length; index += 1) {
    const coordinate = collisionInput.bodyPositionsM[index];
    minimum = Math.min(minimum, coordinate);
    maximum = Math.max(maximum, coordinate);
  }
  const epsilonM = Math.max(
    independentReport.limits.absoluteEpsilonM,
    (maximum - minimum) * independentReport.limits.relativeEpsilon,
  );
  const budget: OperationBudget = { count: 0, maximum: policy.maxOperations };
  const contacts: BetaSkirtRenderedBodySignedVertexContactV42[] = [];
  let minimumUnsignedClearanceM = Infinity;
  let minimumSignedClearanceM = Infinity;
  let belowUnsignedMarginVertexCount = 0;
  let penetratingVertexCount = 0;
  let unsafeVertexCount = 0;
  let ambiguousSignVertexCount = 0;
  for (let vertex = 0; vertex < candidateVertexCount; vertex += 1) {
    const offset = vertex * 3;
    const px = collisionInput.garmentPositionsM[offset];
    const py = collisionInput.garmentPositionsM[offset + 1];
    const pz = collisionInput.garmentPositionsM[offset + 2];
    const nearest = nearestPoint(
      collisionInput.bodyPositionsM,
      collisionInput.bodyTriangles,
      px,
      py,
      pz,
      budget,
    );
    const distanceM = Math.sqrt(nearest.distanceSquared);
    minimumUnsignedClearanceM = Math.min(minimumUnsignedClearanceM, distanceM);
    if (distanceM < independentReport.limits.unsafeClearanceMarginM)
      belowUnsignedMarginVertexCount += 1;
    if (distanceM <= epsilonM) {
      ambiguousSignVertexCount += 1;
      continue;
    }
    const votes: boolean[] = [];
    for (let directionIndex = 0; directionIndex < RAY_DIRECTIONS.length; directionIndex += 1) {
      const direction = RAY_DIRECTIONS[directionIndex];
      const inside = rayParity(
        collisionInput.bodyPositionsM,
        collisionInput.bodyTriangles,
        px,
        py,
        pz,
        direction,
        epsilonM,
        budget,
      );
      if (inside !== null) votes[votes.length] = inside;
    }
    let voteMismatch = false;
    for (let index = 1; index < votes.length; index += 1) {
      if (votes[index] !== votes[0]) voteMismatch = true;
    }
    if (votes.length < 2 || voteMismatch) {
      ambiguousSignVertexCount += 1;
      continue;
    }
    const inside = votes[0];
    const signedDistanceM = inside ? -distanceM : distanceM;
    minimumSignedClearanceM = Math.min(minimumSignedClearanceM, signedDistanceM);
    if (signedDistanceM < 0) penetratingVertexCount += 1;
    if (signedDistanceM >= independentReport.limits.unsafeClearanceMarginM) continue;
    unsafeVertexCount += 1;
    if (contacts.length >= policy.maxContacts)
      fail('resource-cap-exceeded', 'Signed contact count cap exceeded.');
    const dx = inside ? nearest.x - px : px - nearest.x;
    const dy = inside ? nearest.y - py : py - nearest.y;
    const dz = inside ? nearest.z - pz : pz - nearest.z;
    const normalLength = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(normalLength) || normalLength <= epsilonM)
      fail('classification-parity-mismatch', 'Unsafe contact has no defensible outward normal.');
    const triangleOffset = nearest.triangleIndex * 3;
    contacts[contacts.length] = OBJECT_FREEZE({
      ordinal: contacts.length,
      extractionRound:
        extractionRound as BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42,
      vertexIndex: vertex,
      classification: inside ? ('penetrating' as const) : ('unsafe-outside' as const),
      bodyTriangleIndex: nearest.triangleIndex,
      bodyVertexIndices: OBJECT_FREEZE([
        collisionInput.bodyTriangles[triangleOffset],
        collisionInput.bodyTriangles[triangleOffset + 1],
        collisionInput.bodyTriangles[triangleOffset + 2],
      ]) as readonly [number, number, number],
      bodySurfacePointM: OBJECT_FREEZE([nearest.x, nearest.y, nearest.z]) as readonly [
        number,
        number,
        number,
      ],
      outwardBodyNormal: OBJECT_FREEZE([
        dx / normalLength,
        dy / normalLength,
        dz / normalLength,
      ]) as readonly [number, number, number],
      signedDistanceM,
      minimumClearanceM: independentReport.limits.unsafeClearanceMarginM,
    });
  }
  if (
    ambiguousSignVertexCount !== independentReport.clearance.ambiguousSignVertexCount ||
    penetratingVertexCount !== independentReport.clearance.penetratingVertexCount ||
    unsafeVertexCount !== independentReport.clearance.unsafeVertexCount ||
    contacts.length !== unsafeVertexCount ||
    !Object.is(minimumUnsignedClearanceM, independentReport.clearance.minimumUnsignedClearanceM) ||
    belowUnsignedMarginVertexCount !== independentReport.clearance.belowUnsignedMarginVertexCount ||
    !Object.is(minimumSignedClearanceM, independentReport.clearance.minimumSignedClearanceM)
  )
    fail(
      'classification-parity-mismatch',
      'Independent signed classification differs from Collision V2.',
    );

  const contactJson = deepSnapshot(contacts, 'contacts');
  const contactBytes = TEXT_ENCODER_ENCODE.call(TEXT_ENCODER, canonicalJson(contactJson));
  if (contactBytes.byteLength > policy.maxContactBytes)
    fail('resource-cap-exceeded', 'Canonical signed contact bytes exceed their cap.');
  const [bodyPositionsSha256, bodyTrianglesSha256, candidateTrianglesSha256, contactSetSha256] =
    await (PROMISE_ALL.call(Promise, [
      digest(typedBytes(collisionInput.bodyPositionsM, 'f32')),
      digest(typedBytes(collisionInput.bodyTriangles, 'u32')),
      digest(typedBytes(collisionInput.garmentTriangles, 'u32')),
      digest(contactBytes),
    ]) as Promise<[string, string, string, string]>);
  const receipt: BetaSkirtRenderedBodySignedVertexContactRefreshReceiptV42 = OBJECT_FREEZE({
    version: BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_V42,
    status: 'signed-vertex-contacts-ready' as const,
    extractionRound: extractionRound as BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42,
    collisionPolicyIdentity: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
    terminal: OBJECT_FREEZE({
      collisionInputSha256,
      collisionReportSha256: terminalCollisionReportSha256,
    }),
    geometry: OBJECT_FREEZE({
      bodyPositionsSha256,
      bodyTrianglesSha256,
      candidatePositionsSha256,
      candidateTrianglesSha256,
      contactSetSha256,
    }),
    counts: OBJECT_FREEZE({
      bodyVertexCount,
      bodyTriangleCount,
      candidateVertexCount,
      candidateTriangleCount,
      penetratingVertexCount,
      unsafeVertexCount,
      ambiguousSignVertexCount: 0 as const,
      contactCount: contacts.length,
    }),
    clearance: OBJECT_FREEZE({
      minimumUnsignedClearanceM,
      minimumSignedClearanceM,
      unsafeClearanceMarginM: independentReport.limits.unsafeClearanceMarginM,
    }),
    usage: OBJECT_FREEZE({
      distanceTriangleTestCount: distanceTriangleTests,
      rayTriangleTestCount: rayTriangleTests,
      operationCount: budget.count,
      contactByteLength: contactBytes.byteLength,
    }),
    limits: policy,
    claims: OBJECT_FREEZE({
      collisionPolicyV2ContentBound: true as const,
      collisionV2ClassificationIndependentlyReplayed: true as const,
      terminalCollisionReceiptBound: true as const,
      exactOwnedWorldGeometryBound: true as const,
      signedClassificationParityVerified: true as const,
      partialContactsReturned: false as const,
      initializationAdmitted: false as const,
      collisionClearClaimed: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
  const receiptSha256 = await canonicalSha256(deepSnapshot(receipt, 'receipt'));
  return OBJECT_FREEZE({
    version: BETA_SKIRT_RENDERED_BODY_SIGNED_VERTEX_CONTACT_REFRESH_V42,
    status: 'signed-vertex-contacts-ready' as const,
    extractionRound: extractionRound as BetaSkirtRenderedBodySignedVertexContactExtractionRoundV42,
    contacts: OBJECT_FREEZE(contacts),
    receipt,
    receiptSha256,
  });
}
