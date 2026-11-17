import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  validateDxfProductTwoPanelSkirtGarmentAndPolicyV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsRequestV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1 =
  'dxf-product-two-panel-skirt-garment-semantics-request/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1 =
  'dxf-product-two-panel-skirt-garment-semantics/1' as const;

export type DxfProductTwoPanelSkirtGarmentSemanticsRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1;
  origin: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['origin'];
  expectedComposerCanonicalSha256: string;
  composerOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  garment: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['garment'];
  policy: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['policy'];
}>;

const CLAIMS = Object.freeze({
  genuineComposerBound: true,
  borrowedComposerRetained: true,
  exactGarmentBoundaryRolesValidated: true,
  policyValidated: true,
  bodyTargetConsumed: false,
  bodyAdmissionAuthority: false,
  geometryInferenceAsTopologyAuthority: false,
  placementAuthority: false,
  runtimeAuthority: false,
  persistenceAuthority: false,
  sourceAuthenticityAccepted: false,
} as const);

export type DxfProductTwoPanelSkirtGarmentSemanticsSnapshotV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1;
  status: 'body-free-garment-semantics-bound';
  origin: DxfProductTwoPanelSkirtGarmentSemanticsRequestV1['origin'];
  bindings: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    meshDeterministicFingerprintSha256: string;
    garmentRolesSha256: string;
    boundaryRolesSha256: string;
    placementPolicySha256: string;
  }>;
  counts: Readonly<{
    pieceCount: 2;
    seamCount: 2;
    boundaryRoleCount: 8;
    selectedSourceCurveCount: number;
    selectedBoundarySampleCount: number;
  }>;
  claims: typeof CLAIMS;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-consistency-only';
  }>;
}>;

declare const garmentSemanticsBrand: unique symbol;
export type DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1;
  snapshot: DxfProductTwoPanelSkirtGarmentSemanticsSnapshotV1;
  readonly [garmentSemanticsBrand]: never;
}>;
export type DxfProductTwoPanelSkirtGarmentSemanticsProjectionV1 = Readonly<{
  snapshot: DxfProductTwoPanelSkirtGarmentSemanticsSnapshotV1;
  garment: DxfProductTwoPanelSkirtGarmentSemanticsRequestV1['garment'];
  policy: DxfProductTwoPanelSkirtGarmentSemanticsRequestV1['policy'];
  callerOwnedMutablePlainCopies: true;
  claims: typeof CLAIMS;
}>;
type Code = DxfProductTwoPanelSkirtPlacementSemanticsBlockerCodeV1 | 'cancelled';
export type DxfProductTwoPanelSkirtGarmentSemanticsResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1;
      snapshot: DxfProductTwoPanelSkirtGarmentSemanticsSnapshotV1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      blockers: readonly [Readonly<{ code: Code; detail: string }>];
    }>;
type Request = DxfProductTwoPanelSkirtGarmentSemanticsRequestV1;
type Expected = Readonly<{ composerSha: string; phase2Sha: string; fingerprint: string }>;
type RecordV1 = {
  request: Request;
  expected: Expected;
  controller: AbortController;
  unlink: () => void;
  owner: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1;
};
const owners = new WeakMap<object, RecordV1>();
const encoder = new TextEncoder();
const SHA256 = /^[0-9a-f]{64}$/;

class Failure extends Error {
  constructor(
    readonly code: Code,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}
function fail(code: Code, detail: string): never {
  throw new Failure(code, detail);
}
function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) fail('cancelled', 'Garment semantics lifetime was cancelled.');
}

/** Bounded own-data capture; no accessors, sparse arrays, aliases, cycles or binary payloads. */
function plainCopy<T>(value: T): T {
  let nodes = 0;
  let properties = 0;
  const seen = new Set<object>();
  const visit = (entry: unknown, depth: number): unknown => {
    if (entry === null || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (typeof entry === 'string' && entry.length <= 1_024) return entry;
    if (!entry || typeof entry !== 'object' || depth > 24 || ++nodes > 50_000)
      fail('invalid-input', 'Garment semantics requires bounded plain data.');
    if (seen.has(entry)) fail('invalid-input', 'Repeated or cyclic plain objects are unsupported.');
    seen.add(entry);
    const array = Array.isArray(entry);
    const prototype = Object.getPrototypeOf(entry);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      fail('invalid-input', 'Garment semantics contains a foreign prototype.');
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    if (
      (properties += keys.length) > 200_000 ||
      (array &&
        (keys.length > 4_096 ||
          keys.length !== descriptors.length?.value ||
          keys.some((key, index) => key !== String(index))))
    )
      fail('invalid-input', 'Garment semantics exceeds its property bound or has a sparse array.');
    const output: Record<string, unknown> = {};
    const values: unknown[] = [];
    for (const key of keys) {
      if (typeof key !== 'string') fail('invalid-input', 'Symbols are unsupported.');
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', 'Accessors and hidden fields are unsupported.');
      const copied = visit(descriptor.value, depth + 1);
      if (array) values.push(copied);
      else
        Object.defineProperty(output, key, {
          value: copied,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    return array ? values : output;
  };
  return visit(value, 0) as T;
}
function freezePlain<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezePlain);
    Object.freeze(value);
  }
  return value;
}
function detach(value: unknown): Request {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    fail('invalid-input', 'An exact body-free garment semantics request is required.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = [
    'schemaVersion',
    'origin',
    'expectedComposerCanonicalSha256',
    'composerOwner',
    'garment',
    'policy',
  ];
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))
  )
    fail('invalid-input', 'The body-free request requires exactly six own data fields.');
  const plain = plainCopy({
    schemaVersion: descriptors.schemaVersion!.value,
    origin: descriptors.origin!.value,
    expectedComposerCanonicalSha256: descriptors.expectedComposerCanonicalSha256!.value,
    garment: descriptors.garment!.value,
    policy: descriptors.policy!.value,
  }) as Omit<Request, 'composerOwner'>;
  if (
    plain.schemaVersion !== DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1 ||
    (plain.origin !== 'fresh-import' && plain.origin !== 'verified-saved-row') ||
    typeof plain.expectedComposerCanonicalSha256 !== 'string' ||
    !SHA256.test(plain.expectedComposerCanonicalSha256)
  )
    fail('invalid-input', 'Garment semantics schema, origin or expected composer seal is invalid.');
  return Object.freeze({ ...freezePlain(plain), composerOwner: descriptors.composerOwner!.value });
}
function current(request: Request, signal: AbortSignal, expected?: Expected) {
  checkSignal(signal);
  const projection = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerOwner);
  if (!projection)
    fail('composer-owner-unavailable', 'A live genuine C6 composer owner is required.');
  const snapshot = request.composerOwner.snapshot;
  if (
    snapshot.origin !== request.origin ||
    snapshot.seal.canonicalSha256 !== request.expectedComposerCanonicalSha256 ||
    projection.composerCanonicalSha256 !== request.expectedComposerCanonicalSha256 ||
    projection.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256 ||
    snapshot.mesh.pieceCount !== 2 ||
    snapshot.mesh.seamCount !== 2 ||
    projection.mesh.pieceRanges.length !== 2 ||
    projection.mesh.seams.length !== 2 ||
    snapshot.claims.placementReady !== false ||
    projection.placementAuthority !== false ||
    (expected &&
      (expected.composerSha !== projection.composerCanonicalSha256 ||
        expected.phase2Sha !== projection.phase2ArtifactSha256 ||
        expected.fingerprint !== snapshot.mesh.deterministicFingerprint))
  )
    fail('composer-binding-mismatch', 'C6 owner, snapshot, projection or honest claims differ.');
  checkSignal(signal);
  return { projection, snapshot };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail('invalid-input', 'Canonical data contains unsupported values.');
  return encoded;
}
async function hash(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > 4 * 1024 * 1024)
    fail('invalid-input', 'Canonical payload exceeds its bound.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof Failure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

/** The result/snapshot is a historical receipt. Every later authority use must project the owner. */
export async function buildDxfProductTwoPanelSkirtGarmentSemanticsV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'>; signal?: AbortSignal }> = {},
): Promise<DxfProductTwoPanelSkirtGarmentSemanticsResultV1> {
  const controller = new AbortController();
  let published: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1 | null = null;
  const cancel = () => {
    controller.abort();
    if (published) disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(published);
  };
  const signal = options.signal;
  const unlink = () => signal?.removeEventListener('abort', cancel);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    checkSignal(signal);
    const request = detach(input);
    const source = current(request, controller.signal);
    const expected = {
      composerSha: source.projection.composerCanonicalSha256,
      phase2Sha: source.projection.phase2ArtifactSha256,
      fingerprint: source.snapshot.mesh.deterministicFingerprint,
    };
    const gate = () => current(request, controller.signal, expected);
    const validation = validateDxfProductTwoPanelSkirtGarmentAndPolicyV1(
      { garment: request.garment, policy: request.policy },
      source.projection,
    );
    if (!validation.ok) fail(validation.blocker.code, validation.blocker.detail);
    const crypto = options.crypto ?? globalThis.crypto;
    const garmentRoles = {
      kind: request.garment.kind,
      frontPieceId: request.garment.frontPieceId,
      backPieceId: request.garment.backPieceId,
      leftSeamId: request.garment.leftSeamId,
      rightSeamId: request.garment.rightSeamId,
      circumferentialOrder: request.garment.circumferentialOrder,
    };
    // Reuse V1 component domains and canonical data, but issue a distinct body-free top-level seal.
    const meshDeterministicFingerprintSha256 = await hash(
      'dxf-product-two-panel-skirt-placement-semantics-mesh-fingerprint-v1',
      expected.fingerprint,
      crypto,
    );
    gate();
    const garmentRolesSha256 = await hash(
      'dxf-product-two-panel-skirt-placement-semantics-garment-roles-v1',
      garmentRoles,
      crypto,
    );
    gate();
    const boundaryRolesSha256 = await hash(
      'dxf-product-two-panel-skirt-placement-semantics-boundary-roles-v1',
      request.garment.boundaries,
      crypto,
    );
    gate();
    const placementPolicySha256 = await hash(
      'dxf-product-two-panel-skirt-placement-semantics-policy-v1',
      request.policy,
      crypto,
    );
    gate();
    const payload = {
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1,
      status: 'body-free-garment-semantics-bound' as const,
      origin: request.origin,
      bindings: {
        composerCanonicalSha256: expected.composerSha,
        phase2ArtifactSha256: expected.phase2Sha,
        meshDeterministicFingerprintSha256,
        garmentRolesSha256,
        boundaryRolesSha256,
        placementPolicySha256,
      },
      counts: {
        pieceCount: 2 as const,
        seamCount: 2 as const,
        boundaryRoleCount: 8 as const,
        ...validation.counts,
      },
      claims: CLAIMS,
    };
    const canonicalSha256 = await hash(
      DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1,
      payload,
      crypto,
    );
    gate();
    const snapshot = freezePlain({
      ...payload,
      seal: {
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-consistency-only' as const,
      },
    });
    const owner = Object.freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_V1,
      snapshot,
    }) as DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1;
    gate();
    owners.set(owner, { request, expected, controller, unlink, owner });
    published = owner;
    return Object.freeze({ ok: true, owner, snapshot });
  } catch (error) {
    cancel();
    const failure =
      error instanceof Failure
        ? error
        : new Failure(
            'invalid-input',
            error instanceof Error ? error.message : 'Garment semantics failed closed.',
          );
    return Object.freeze({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: Object.freeze([
        Object.freeze({ code: failure.code, detail: failure.message }),
      ]) as readonly [Readonly<{ code: Code; detail: string }>],
    });
  } finally {
    if (!published) unlink();
  }
}

function recordOf(owner: unknown): RecordV1 | undefined {
  return owner && (typeof owner === 'object' || typeof owner === 'function')
    ? owners.get(owner)
    : undefined;
}
function liveRecord(owner: unknown): RecordV1 | null {
  const record = recordOf(owner);
  if (!record) return null;
  try {
    current(record.request, record.controller.signal, record.expected);
    return record;
  } catch {
    disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(owner);
    return null;
  }
}
export function isDxfProductTwoPanelSkirtGarmentSemanticsCurrentV1(
  owner: unknown,
): owner is DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1 {
  return liveRecord(owner) !== null;
}
/** Source currentness is polled here; host replacement must abort its signal for immediate cascade. */
export function getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  return liveRecord(owner)?.controller.signal ?? null;
}
export function projectDxfProductTwoPanelSkirtGarmentSemanticsV1(
  owner: unknown,
): DxfProductTwoPanelSkirtGarmentSemanticsProjectionV1 | null {
  const record = liveRecord(owner);
  if (!record) return null;
  const projection = {
    snapshot: record.owner.snapshot,
    garment: plainCopy(record.request.garment),
    policy: plainCopy(record.request.policy),
    callerOwnedMutablePlainCopies: true as const,
    claims: CLAIMS,
  };
  return liveRecord(owner) === record ? Object.freeze(projection) : null;
}
export function disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(owner: unknown): boolean {
  const record = recordOf(owner);
  if (!record) return false;
  owners.delete(record.owner);
  record.controller.abort();
  record.unlink();
  return true;
}
