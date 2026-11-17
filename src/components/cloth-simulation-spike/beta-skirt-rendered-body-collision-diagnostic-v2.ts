import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
  BetaSkirtRenderedBodyCollisionDiagnosticErrorV1,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticBindingV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2 =
  'beta-skirt-rendered-body-collision-diagnostic/2' as const;
export const BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_V2 =
  'beta-skirt-rendered-body-collision-policy/2' as const;
export const BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_CORPUS_REVISION_V2 =
  'personalized-mannequin-corpus-2026-11-15/1' as const;

/**
 * Additive policy. V1 remains byte-for-byte and semantically unchanged. The only raised collision
 * operation cap is the broad-phase cell-pair visit budget audited by the personalized corpus.
 */
export const BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2 = Object.freeze({
  ...BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
  maxBroadPhaseCellPairVisits: 16_000_000,
}) satisfies BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;

export interface BetaSkirtRenderedBodyCollisionPolicyIdentityV2 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_V2;
  readonly corpusRevision: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_CORPUS_REVISION_V2;
  readonly policyContentSha256: string;
}

export const BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2 = Object.freeze({
  version: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_V2,
  corpusRevision: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_CORPUS_REVISION_V2,
  policyContentSha256: 'b9a601da5459c22fac00bfeb17c11e78a7318bd4a7ba53d4c0b153606c878392',
}) satisfies BetaSkirtRenderedBodyCollisionPolicyIdentityV2;

export type BetaSkirtRenderedBodyCollisionDiagnosticInputV2 =
  BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
export type BetaSkirtRenderedBodyCollisionDiagnosticBindingV2 =
  BetaSkirtRenderedBodyCollisionDiagnosticBindingV1;
export type BetaSkirtRenderedBodyCollisionDiagnosticBlockerV2 =
  BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1;
export type BetaSkirtRenderedBodyCollisionDiagnosticPolicyV2 =
  BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;

export interface BetaSkirtRenderedBodyCollisionDiagnosticReportV2 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2;
  readonly policyIdentity: BetaSkirtRenderedBodyCollisionPolicyIdentityV2;
  readonly status: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['status'];
  readonly binding: BetaSkirtRenderedBodyCollisionDiagnosticBindingV2;
  /** Domain-separated SHA-256 over the exact input bytes and the complete fixed V2 policy. */
  readonly contentFingerprintSha256: string;
  readonly engine: Readonly<{
    version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1;
    inputContentFingerprintSha256: string;
  }>;
  readonly coordinateFrame: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['coordinateFrame'];
  readonly topology: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['topology'];
  readonly intersections: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['intersections'];
  readonly clearance: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['clearance'];
  readonly limits: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV2;
  readonly usage: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['usage'];
  readonly blockers: readonly BetaSkirtRenderedBodyCollisionDiagnosticBlockerV2[];
  readonly claims: Readonly<{
    collisionPolicyV2ContentBound: true;
    exactRenderedPairMeasured: true;
    analyticalCapsulesUsed: false;
    signedClassificationDefensible: boolean;
    initializationAdmitted: false;
    fitClaimed: false;
    runtimeAuthorityClaimed: false;
    productionAuthorityClaimed: false;
  }>;
}

export type BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV2 =
  | 'input-invalid'
  | 'policy-mismatch'
  | 'budget-exhausted'
  | 'sha256-unavailable'
  | 'engine-failed';

export class BetaSkirtRenderedBodyCollisionDiagnosticErrorV2 extends Error {
  constructor(
    readonly code: BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV2,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtRenderedBodyCollisionDiagnosticErrorV2';
  }
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticOptionsV2 {
  /** If supplied, it must exactly equal the frozen V2 policy; low/high caller policies are rejected. */
  readonly policy?: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV2;
  readonly policyIdentity?: BetaSkirtRenderedBodyCollisionPolicyIdentityV2;
}

const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const TEXT_ENCODER = new TextEncoder();
const TEXT_ENCODER_ENCODE = TextEncoder.prototype.encode;
const SUBTLE = globalThis.crypto?.subtle ?? null;
const SUBTLE_DIGEST = typeof SubtleCrypto === 'undefined' ? null : SubtleCrypto.prototype.digest;
const DATA_VIEW_SET_FLOAT32 = DataView.prototype.setFloat32;
const DATA_VIEW_SET_UINT32 = DataView.prototype.setUint32;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_FREEZE = Object.freeze;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const JSON_STRINGIFY = JSON.stringify;
const POLICY_KEYS = OBJECT_FREEZE([
  'maxBodyVertices',
  'maxBodyTriangles',
  'maxGarmentVertices',
  'maxGarmentTriangles',
  'maxInputBytes',
  'maxDistanceTriangleTests',
  'maxRayTriangleTests',
  'maxBroadPhaseGridCells',
  'maxBroadPhaseCellReferences',
  'maxBroadPhaseCellPairVisits',
  'maxBroadPhaseCandidatePairs',
  'unsafeClearanceMarginM',
  'absoluteEpsilonM',
  'relativeEpsilon',
] as const satisfies readonly (keyof BetaSkirtRenderedBodyCollisionDiagnosticPolicyV2)[]);
const OPTIONS_KEYS = OBJECT_FREEZE(['policy', 'policyIdentity'] as const);
const POLICY_IDENTITY_KEYS = OBJECT_FREEZE([
  'version',
  'corpusRevision',
  'policyContentSha256',
] as const);

function fail(code: BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV2, message: string): never {
  throw new BetaSkirtRenderedBodyCollisionDiagnosticErrorV2(code, message);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  optional = false,
): Record<string, unknown> {
  if (optional && value === undefined) return {};
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (OBJECT_GET_PROTOTYPE_OF(value) !== Object.prototype && OBJECT_GET_PROTOTYPE_OF(value) !== null)
  ) {
    fail('input-invalid', `${label} must be a plain record.`);
  }
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    fail('input-invalid', `${label} has an unsupported shape.`);
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
    ) {
      fail('input-invalid', `${label}.${key} must be an enumerable data property.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotOptions(value: unknown): Readonly<{
  policy: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV2;
  identity: BetaSkirtRenderedBodyCollisionPolicyIdentityV2;
}> {
  let record: Record<string, unknown> = {};
  if (value !== undefined) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (OBJECT_GET_PROTOTYPE_OF(value) !== Object.prototype &&
        OBJECT_GET_PROTOTYPE_OF(value) !== null)
    ) {
      fail('input-invalid', 'options must be a plain record.');
    }
    const keys = REFLECT_OWN_KEYS(value);
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' || !OPTIONS_KEYS.includes(key as (typeof OPTIONS_KEYS)[number]),
      )
    ) {
      fail('input-invalid', 'options has an unsupported shape.');
    }
    record = {};
    for (const key of keys as string[]) {
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        fail('input-invalid', `options.${key} must be an enumerable data property.`);
      }
      record[key] = descriptor.value;
    }
  }

  const suppliedPolicy = record.policy;
  if (suppliedPolicy !== undefined) {
    const policy = exactRecord(suppliedPolicy, POLICY_KEYS, 'options.policy');
    for (const key of POLICY_KEYS) {
      if (!Object.is(policy[key], BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2[key])) {
        fail('policy-mismatch', `options.policy.${key} differs from Collision Policy V2.`);
      }
    }
  }
  const suppliedIdentity = record.policyIdentity;
  if (suppliedIdentity !== undefined) {
    const identity = exactRecord(suppliedIdentity, POLICY_IDENTITY_KEYS, 'options.policyIdentity');
    for (const key of POLICY_IDENTITY_KEYS) {
      if (!Object.is(identity[key], BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2[key])) {
        fail('policy-mismatch', `options.policyIdentity.${key} differs from Collision Policy V2.`);
      }
    }
  }
  return OBJECT_FREEZE({
    policy: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2,
    identity: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
  });
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
    fail('sha256-unavailable', 'Native WebCrypto SHA-256 is unavailable.');
  let result: ArrayBuffer;
  try {
    result = await SUBTLE_DIGEST.call(SUBTLE, 'SHA-256', bytes.slice().buffer);
  } catch {
    fail('sha256-unavailable', 'Native WebCrypto SHA-256 failed.');
  }
  const value = hex(new Uint8Array(result));
  if (!SHA256.test(value))
    fail('sha256-unavailable', 'Native WebCrypto returned an invalid digest.');
  return value;
}

function policyCanonicalText(): string {
  const entries: [string, number][] = [];
  for (let index = 0; index < POLICY_KEYS.length; index += 1) {
    const key = POLICY_KEYS[index];
    entries[index] = [key, BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2[key]];
  }
  return JSON_STRINGIFY([
    BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_V2,
    BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_CORPUS_REVISION_V2,
    entries,
  ]);
}

async function assertCryptoAndPolicyIdentity(): Promise<void> {
  const [empty, policy] = await Promise.all([
    digest(new Uint8Array(0)),
    digest(TEXT_ENCODER_ENCODE.call(TEXT_ENCODER, policyCanonicalText())),
  ]);
  if (
    empty !== SHA256_EMPTY ||
    policy !== BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2.policyContentSha256
  )
    fail(
      'sha256-unavailable',
      'Native SHA-256 or the fixed V2 policy identity failed its known-answer check.',
    );
}

function canonicalInputBytes(input: BetaSkirtRenderedBodyCollisionDiagnosticInputV2): Uint8Array {
  const header = TEXT_ENCODER_ENCODE.call(
    TEXT_ENCODER,
    JSON_STRINGIFY({
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2,
      engineVersion: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
      policyIdentity: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
      policy: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2,
      binding: input.binding,
      garmentUniformScale: input.garmentUniformScale,
      garmentTranslationM: [
        input.garmentTranslationM[0],
        input.garmentTranslationM[1],
        input.garmentTranslationM[2],
      ],
      lengths: [
        input.bodyPositionsM.length,
        input.bodyTriangles.length,
        input.garmentPositionsM.length,
        input.garmentTriangles.length,
      ],
    }),
  );
  const byteLength =
    4 +
    header.byteLength +
    input.bodyPositionsM.byteLength +
    input.bodyTriangles.byteLength +
    input.garmentPositionsM.byteLength +
    input.garmentTriangles.byteLength;
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  DATA_VIEW_SET_UINT32.call(view, 0, header.byteLength, true);
  UINT8_ARRAY_SET.call(bytes, header, 4);
  let offset = 4 + header.byteLength;
  for (let index = 0; index < input.bodyPositionsM.length; index += 1) {
    DATA_VIEW_SET_FLOAT32.call(view, offset, input.bodyPositionsM[index], true);
    offset += 4;
  }
  for (let index = 0; index < input.bodyTriangles.length; index += 1) {
    DATA_VIEW_SET_UINT32.call(view, offset, input.bodyTriangles[index], true);
    offset += 4;
  }
  for (let index = 0; index < input.garmentPositionsM.length; index += 1) {
    DATA_VIEW_SET_FLOAT32.call(view, offset, input.garmentPositionsM[index], true);
    offset += 4;
  }
  for (let index = 0; index < input.garmentTriangles.length; index += 1) {
    DATA_VIEW_SET_UINT32.call(view, offset, input.garmentTriangles[index], true);
    offset += 4;
  }
  return bytes;
}

export function snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2(
  value: BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV2 {
  try {
    return snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(value);
  } catch (reason) {
    fail(
      'input-invalid',
      reason instanceof Error ? reason.message : 'Collision V2 input is invalid.',
    );
  }
}

export async function computeBetaSkirtRenderedBodyCollisionContentFingerprintV2(
  value: BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
): Promise<string> {
  const snapshot = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2(value);
  await assertCryptoAndPolicyIdentity();
  return digest(canonicalInputBytes(snapshot));
}

function fixedEngineCrypto(): Crypto {
  const subtle = OBJECT_FREEZE({
    digest: (...args: Parameters<NonNullable<typeof SUBTLE_DIGEST>>) => {
      if (!SUBTLE || !SUBTLE_DIGEST)
        return Promise.reject(new Error('Native WebCrypto SHA-256 is unavailable.'));
      return SUBTLE_DIGEST.call(SUBTLE, ...args);
    },
  });
  return OBJECT_FREEZE({ subtle }) as unknown as Crypto;
}

/**
 * Exact-pair diagnostic under one fixed, content-addressed V2 policy. This remains diagnostic-only:
 * it cannot admit initialization, fit, runtime collision, or production publication.
 */
export async function evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  options: BetaSkirtRenderedBodyCollisionDiagnosticOptionsV2 = {},
): Promise<BetaSkirtRenderedBodyCollisionDiagnosticReportV2> {
  snapshotOptions(options);
  const snapshot = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2(input);
  await assertCryptoAndPolicyIdentity();
  const contentFingerprintPromise = digest(canonicalInputBytes(snapshot));
  let engine: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
  try {
    engine = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(snapshot, {
      policy: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2,
      crypto: fixedEngineCrypto(),
    });
  } catch (reason) {
    if (reason instanceof BetaSkirtRenderedBodyCollisionDiagnosticErrorV1) {
      const code =
        reason.code === 'budget-exhausted'
          ? 'budget-exhausted'
          : reason.code === 'sha256-unavailable'
            ? 'sha256-unavailable'
            : 'input-invalid';
      fail(code, reason.message);
    }
    fail('engine-failed', reason instanceof Error ? reason.message : 'Collision V1 engine failed.');
  }
  const contentFingerprintSha256 = await contentFingerprintPromise;
  return OBJECT_FREEZE({
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V2,
    policyIdentity: BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
    status: engine.status,
    binding: engine.binding,
    contentFingerprintSha256,
    engine: OBJECT_FREEZE({
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
      inputContentFingerprintSha256: engine.contentFingerprintSha256,
    }),
    coordinateFrame: engine.coordinateFrame,
    topology: engine.topology,
    intersections: engine.intersections,
    clearance: engine.clearance,
    limits: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2,
    usage: engine.usage,
    blockers: engine.blockers,
    claims: OBJECT_FREEZE({
      collisionPolicyV2ContentBound: true as const,
      exactRenderedPairMeasured: true as const,
      analyticalCapsulesUsed: false as const,
      signedClassificationDefensible: engine.claims.signedClassificationDefensible,
      initializationAdmitted: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
}
