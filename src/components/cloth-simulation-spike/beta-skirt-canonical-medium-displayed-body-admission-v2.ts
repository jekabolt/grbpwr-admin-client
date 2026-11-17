import {
  createMeasurementBodyFrameV2,
  type MeasurementBodyFrameV2,
} from 'lib/cloth/body/measurement-body-frame-v2';
import {
  createMeasurementOpenReferenceDisplaySnapshotOwnerV1,
  measurementOpenReferenceDisplaySnapshotSourceRevisionV1,
  type MeasurementOpenReferenceDisplaySnapshotBindingV1,
  type MeasurementOpenReferenceDisplaySnapshotV1,
} from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v1';
import { snapshotMeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-open-reference-display-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';

import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import type { BetaSkirtRenderedBodyCollisionDiagnosticBindingV1 } from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_BODY_V2 = 'beta-skirt-canonical-medium-body/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_DISPLAYED_BODY_ADMISSION_V2 =
  'beta-skirt-canonical-medium-displayed-body-admission/2' as const;

const REQUEST = BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1;
const POSITIONS_SHA256 = '979a57c3aa8fdb84fb4f5dccd938d378dfda47534f981483538f5d12ca8e8490';
const TOPOLOGY_SHA256 = 'a3361738abec7d283ba6f69d523d1b3e02b573523f3412a1fed176dae7e24451';
const encoder = new TextEncoder();
const apply = Reflect.apply;
const typedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype);
const arrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')!.get!;
const arrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const arrayOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const arrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const digestMethod =
  globalThis.crypto?.subtle &&
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.crypto.subtle), 'digest')?.value;
const abortGetter =
  typeof AbortSignal === 'undefined'
    ? null
    : Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

export type BetaSkirtCanonicalMediumBodyObservationV2 = Readonly<{
  binding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
  frame: MeasurementBodyFrameV2;
  pose: MeasurementOpenReferenceDisplaySnapshotV1['pose'];
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint32Array;
}>;

/** A host observation, not an unforgeable renderer capability. The caller must observe acceptance. */
export type BetaSkirtCanonicalMediumDisplayedBodyInputV2 = Readonly<{
  project: () => BetaSkirtCanonicalMediumBodyObservationV2 | null;
  isCurrent: () => boolean;
  dispose: () => boolean;
}>;

export type BetaSkirtCanonicalMediumBodyProjectionV2 = BetaSkirtCanonicalMediumBodyObservationV2 &
  Readonly<{
    displayMesh: MeasurementSurfaceMeshV1;
    hashes: Readonly<{ bodyPositionsSha256: string; bodyTopologySha256: string }>;
    displayAcceptanceObserved: false;
    collisionAuthority: false;
    runtimeAuthority: false;
  }>;

declare const bodyBrand: unique symbol;
export type BetaSkirtCanonicalMediumBodyOwnerV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_BODY_V2;
  /** Detached historical data for rendering; generation alone does not prove display acceptance. */
  project: () => BetaSkirtCanonicalMediumBodyProjectionV2 | null;
  isCurrent: () => boolean;
  dispose: () => boolean;
  readonly [bodyBrand]: never;
}>;

export type BetaSkirtCanonicalMediumDisplayedBodyProjectionV2 =
  BetaSkirtCanonicalMediumBodyObservationV2 &
    Readonly<{
      collisionBinding: Omit<
        BetaSkirtRenderedBodyCollisionDiagnosticBindingV1,
        'garmentPositionsSha256'
      >;
      hashes: BetaSkirtCanonicalMediumBodyProjectionV2['hashes'];
      claims: Readonly<{
        generatedCanonicalBodyOwnerVerified: true;
        exactObservedBodyAndFrameMatched: true;
        pinnedCanonicalProfileMatched: true;
        hostObservationAuthenticatedAsViewportAuthority: false;
        compositionGenerationSource: 'canonical-body-display-admission-v2';
        strainBandCompositionRequired: false;
        collisionAuthority: false;
        runtimeAuthority: false;
        productionAuthority: false;
      }>;
    }>;

declare const admissionBrand: unique symbol;
export type BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_DISPLAYED_BODY_ADMISSION_V2;
  project: () => BetaSkirtCanonicalMediumDisplayedBodyProjectionV2 | null;
  isCurrent: () => boolean;
  dispose: () => boolean;
  readonly [admissionBrand]: never;
}>;
export type BetaSkirtCanonicalMediumPlacementBodyInputV2 = Readonly<{
  canonicalDisplayedBodyOwner: BetaSkirtCanonicalMediumDisplayedBodyOwnerV2;
  mannequin?: never;
}>;
export type BetaSkirtCanonicalMediumDisplayedBodyAdmissionRequestV2 = Readonly<{
  canonicalBodyOwner: BetaSkirtCanonicalMediumBodyOwnerV2;
  displayedBodyInput: BetaSkirtCanonicalMediumDisplayedBodyInputV2;
}>;
export type BetaSkirtCanonicalMediumBodyBlockerCodeV2 =
  | 'invalid-input'
  | 'cancelled'
  | 'body-build-blocked'
  | 'canonical-profile-mismatch'
  | 'sha256-unavailable'
  | 'body-unavailable'
  | 'display-unavailable'
  | 'display-mismatch'
  | 'display-became-stale';
type Blocked = Readonly<{
  ok: false;
  owner: null;
  code: BetaSkirtCanonicalMediumBodyBlockerCodeV2;
  detail: string;
}>;
export type BetaSkirtCanonicalMediumBodyBuildResultV2 =
  Readonly<{ ok: true; owner: BetaSkirtCanonicalMediumBodyOwnerV2 }> | Blocked;
export type BetaSkirtCanonicalMediumDisplayedBodyAdmissionResultV2 =
  Readonly<{ ok: true; owner: BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 }> | Blocked;

class BodyFailure extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumBodyBlockerCodeV2,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: BetaSkirtCanonicalMediumBodyBlockerCodeV2, message: string): never {
  throw new BodyFailure(code, message);
}
function blocked(error: unknown): Blocked {
  return Object.freeze({
    ok: false,
    owner: null,
    code: error instanceof BodyFailure ? error.code : 'invalid-input',
    detail: error instanceof Error ? error.message : 'Canonical body input is invalid.',
  });
}
function aborted(signal?: AbortSignal): boolean {
  return !!signal && (!abortGetter || apply(abortGetter, signal, []));
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') fail('invalid-input', 'Expected own data.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !('value' in descriptor))
    fail('invalid-input', `${key} must be an own data property.`);
  return descriptor.value;
}
/** Getter-free, bounded canonical metadata snapshot. */
function plain<T>(value: T): T {
  let nodes = 0;
  function copy(item: unknown, depth: number): unknown {
    if (++nodes > 12_000 || depth > 24) fail('invalid-input', 'Body metadata exceeds bounds.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string' && item.length <= 16_384) return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object')
      fail('invalid-input', 'Body metadata is not plain data.');
    const prototype = Object.getPrototypeOf(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-input', 'Symbol metadata is forbidden.');
    if (Array.isArray(item)) {
      if (prototype !== Array.prototype || item.length > 4096 || keys.length !== item.length + 1)
        fail('invalid-input', 'Metadata array is not bounded dense data.');
      return Object.freeze(
        Array.from({ length: item.length }, (_, index) =>
          copy(own(item, String(index)), depth + 1),
        ),
      );
    }
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-input', 'Metadata prototype is invalid.');
    return Object.freeze(
      Object.fromEntries(
        (keys as string[]).sort().map((key) => [key, copy(own(item, key), depth + 1)]),
      ),
    );
  }
  return copy(value, 0) as T;
}
function copyArray<T extends Float32Array | Uint32Array>(value: unknown, floating: boolean): T {
  if (
    !value ||
    Object.getPrototypeOf(value) !== (floating ? Float32Array.prototype : Uint32Array.prototype)
  )
    fail('invalid-input', 'Expected native body arrays.');
  const length = apply(arrayLength, value, []) as number;
  const buffer = apply(arrayBuffer, value, []) as ArrayBuffer;
  const byteLength = apply(arrayByteLength, value, []) as number;
  const byteOffset = apply(arrayOffset, value, []) as number;
  if (
    !(buffer instanceof ArrayBuffer) ||
    length !== (floating ? 13_380 * 3 : 26_756 * 3) ||
    byteLength !== length * 4
  )
    fail(
      'canonical-profile-mismatch',
      'Canonical body requires exactly 13,380 vertices and 26,756 triangles.',
    );
  const bytes = new Uint8Array(byteLength);
  Uint8Array.prototype.set.call(bytes, new Uint8Array(buffer, byteOffset, byteLength));
  const result = floating ? new Float32Array(bytes.buffer) : new Uint32Array(bytes.buffer);
  for (let index = 0; index < result.length; index++) {
    if (!Number.isFinite(result[index]) || (!floating && result[index]! >= 13_380))
      fail('canonical-profile-mismatch', 'Canonical body geometry is invalid.');
  }
  return result as T;
}
function capture(value: unknown): BetaSkirtCanonicalMediumBodyObservationV2 {
  return Object.freeze({
    binding: plain(own(value, 'binding') as MeasurementOpenReferenceDisplaySnapshotBindingV1),
    frame: plain(own(value, 'frame') as MeasurementBodyFrameV2),
    pose: plain(own(value, 'pose') as MeasurementOpenReferenceDisplaySnapshotV1['pose']),
    bodyPositionsM: copyArray<Float32Array>(own(value, 'bodyPositionsM'), true),
    bodyTriangles: copyArray<Uint32Array>(own(value, 'bodyTriangles'), false),
  });
}
function metadata(value: BetaSkirtCanonicalMediumBodyObservationV2): string {
  return JSON.stringify(plain({ binding: value.binding, frame: value.frame, pose: value.pose }));
}
function equalBytes(left: Float32Array | Uint32Array, right: Float32Array | Uint32Array): boolean {
  const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function equal(
  left: BetaSkirtCanonicalMediumBodyObservationV2,
  right: BetaSkirtCanonicalMediumBodyObservationV2,
): boolean {
  return (
    metadata(left) === metadata(right) &&
    equalBytes(left.bodyPositionsM, right.bodyPositionsM) &&
    equalBytes(left.bodyTriangles, right.bodyTriangles)
  );
}
function erase(value: BetaSkirtCanonicalMediumBodyObservationV2): void {
  value.bodyPositionsM.fill(0);
  value.bodyTriangles.fill(0);
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!digestMethod || !globalThis.crypto?.subtle)
    fail('sha256-unavailable', 'Native SHA-256 is unavailable.');
  const hash = (await apply(digestMethod, globalThis.crypto.subtle, [
    'SHA-256',
    bytes,
  ])) as ArrayBuffer;
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}
/** Same domain/chunk encoding as the frozen canonical product placement profile. */
async function arrayHash(domain: string, array: Float32Array | Uint32Array): Promise<string> {
  const chunks = [
    encoder.encode(
      JSON.stringify([
        { kind: array instanceof Float32Array ? 'f32' : 'u32', length: array.length },
      ]),
    ),
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
  ];
  const prefix = encoder.encode(`${domain}\0`);
  const bytes = new Uint8Array(
    prefix.length + chunks.reduce((sum, chunk) => sum + 8 + chunk.length, 0),
  );
  const view = new DataView(bytes.buffer);
  bytes.set(prefix);
  let offset = prefix.length;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.length, true);
    view.setUint32(offset + 4, 0, true);
    offset += 8;
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return digest(bytes);
}
async function qualify(value: BetaSkirtCanonicalMediumBodyObservationV2) {
  const sourceRevision = measurementOpenReferenceDisplaySnapshotSourceRevisionV1({
    ...REQUEST,
    limbSubsetRequested: false,
  });
  const expectedFrame = createMeasurementBodyFrameV2({
    measurements: REQUEST.measurements,
    sourceRevision,
    pose: 'A',
  });
  const binding = value.binding;
  if (
    binding.modelId !== REQUEST.modelId ||
    binding.modelContentRevision !== REQUEST.modelContentRevision ||
    binding.inputFingerprint !== REQUEST.inputFingerprint ||
    binding.basisKind !== REQUEST.basisKind ||
    binding.posePresetId !== REQUEST.posePresetId ||
    binding.sourceRevision !== sourceRevision ||
    !Number.isSafeInteger(binding.generation) ||
    binding.generation <= 0 ||
    binding.canonicalContentFingerprint !==
      JSON.stringify(
        Object.entries(expectedFrame.measurements).sort(([a], [b]) => a.localeCompare(b)),
      ) ||
    JSON.stringify(plain(value.frame)) !== JSON.stringify(plain(expectedFrame)) ||
    value.pose.requestedPresetId !== 'a-rest' ||
    value.pose.resolvedPresetId !== 'a-rest' ||
    value.pose.status !== 'a-rest' ||
    value.pose.maximumJointPivotResidualM !== null
  )
    fail(
      'canonical-profile-mismatch',
      'Body identity, source, frame, measurements or accepted A-rest pose differ from the canonical profile.',
    );
  if (
    (await digest(new Uint8Array())) !==
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' ||
    (await digest(encoder.encode('abc'))) !==
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  )
    fail('sha256-unavailable', 'Native SHA-256 known-answer checks failed.');
  const [bodyPositionsSha256, bodyTopologySha256] = await Promise.all([
    arrayHash('canonical-medium-body-positions-v1', value.bodyPositionsM),
    arrayHash('canonical-medium-body-topology-v1', value.bodyTriangles),
  ]);
  if (bodyPositionsSha256 !== POSITIONS_SHA256 || bodyTopologySha256 !== TOPOLOGY_SHA256)
    fail(
      'canonical-profile-mismatch',
      'Observed body does not match the pinned canonical triangle geometry.',
    );
  return Object.freeze({ bodyPositionsSha256, bodyTopologySha256 });
}

const bodyOwners = new WeakMap<object, BetaSkirtCanonicalMediumBodyOwnerV2>();
const admittedOwners = new WeakMap<object, BetaSkirtCanonicalMediumDisplayedBodyOwnerV2>();
let admissionGeneration = 0;

/** Genuine canonical producer, before any garment, transform candidate or strain-band composition. */
export async function buildBetaSkirtCanonicalMediumBodyV2(
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumBodyBuildResultV2> {
  const source = createMeasurementOpenReferenceDisplaySnapshotOwnerV1();
  let observation: BetaSkirtCanonicalMediumBodyObservationV2 | null = null;
  let mesh: MeasurementSurfaceMeshV1 | null = null;
  let disposed = false;
  function dispose() {
    if (disposed) return false;
    disposed = true;
    source.invalidate();
    if (observation) erase(observation);
    mesh?.positions.fill(0);
    mesh?.indices.fill(0);
    return true;
  }
  try {
    if (aborted(signal)) fail('cancelled', 'Canonical body build was cancelled.');
    const built = await source.build(REQUEST);
    if (aborted(signal)) fail('cancelled', 'Canonical body build was cancelled.');
    if (built.status !== 'committed')
      fail('body-build-blocked', `Canonical body build returned ${built.status}.`);
    const frame = createMeasurementBodyFrameV2({
      measurements: REQUEST.measurements,
      sourceRevision: built.snapshot.binding.sourceRevision,
      pose: 'A',
    });
    const fromSnapshot = (snapshot: MeasurementOpenReferenceDisplaySnapshotV1) =>
      capture({
        binding: snapshot.binding,
        frame,
        pose: snapshot.pose,
        bodyPositionsM: snapshot.displayMesh.positions,
        bodyTriangles: snapshot.displayMesh.indices,
      });
    observation = fromSnapshot(built.snapshot);
    mesh = snapshotMeasurementSurfaceMeshV1(built.snapshot.displayMesh);
    const hashes = await qualify(observation);
    const captured = observation;
    const capturedMesh = mesh;
    function isCurrent() {
      if (disposed) return false;
      let next: BetaSkirtCanonicalMediumBodyObservationV2 | null = null;
      try {
        const current = source.current();
        if (aborted(signal) || !current || !source.isCurrent(captured.binding)) {
          dispose();
          return false;
        }
        next = fromSnapshot(current);
        if (!equal(captured, next)) {
          dispose();
          return false;
        }
        return true;
      } catch {
        dispose();
        return false;
      } finally {
        if (next) erase(next);
      }
    }
    if (!isCurrent()) fail('body-unavailable', 'Canonical body became stale during qualification.');
    const unbranded = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_BODY_V2,
      dispose,
      isCurrent,
      project() {
        if (!isCurrent()) return null;
        return Object.freeze({
          ...capture(captured),
          displayMesh: snapshotMeasurementSurfaceMeshV1(capturedMesh),
          hashes,
          displayAcceptanceObserved: false as const,
          collisionAuthority: false as const,
          runtimeAuthority: false as const,
        });
      },
    } satisfies Omit<BetaSkirtCanonicalMediumBodyOwnerV2, typeof bodyBrand>);
    const owner = unbranded as BetaSkirtCanonicalMediumBodyOwnerV2;
    bodyOwners.set(owner, owner);
    return Object.freeze({ ok: true, owner });
  } catch (error) {
    dispose();
    return blocked(error);
  }
}

/** Borrows both upstream inputs. Disposing/revoking admission never disposes a caller's render owner. */
export async function admitBetaSkirtCanonicalMediumDisplayedBodyV2(
  request: BetaSkirtCanonicalMediumDisplayedBodyAdmissionRequestV2,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumDisplayedBodyAdmissionResultV2> {
  let captured: BetaSkirtCanonicalMediumBodyObservationV2 | null = null;
  let disposed = false;
  let checking = false;
  function dispose() {
    if (disposed) return false;
    disposed = true;
    if (captured) erase(captured);
    return true;
  }
  try {
    const bodyCandidate = own(request, 'canonicalBodyOwner');
    const canonicalBody =
      bodyCandidate && typeof bodyCandidate === 'object' ? bodyOwners.get(bodyCandidate) : null;
    if (!canonicalBody?.isCurrent())
      fail('body-unavailable', 'A live genuinely generated canonical body owner is required.');
    const input = own(request, 'displayedBodyInput');
    const project = own(input, 'project');
    const current = own(input, 'isCurrent');
    if (
      typeof project !== 'function' ||
      typeof current !== 'function' ||
      typeof own(input, 'dispose') !== 'function'
    )
      fail('invalid-input', 'Displayed body requires project/isCurrent/dispose capabilities.');
    const readProjection = () => apply(project, input, []) as unknown;
    const readCurrent = () => apply(current, input, []) === true;
    if (aborted(signal)) fail('cancelled', 'Display admission was cancelled.');
    if (!readCurrent()) fail('display-unavailable', 'No current accepted display is available.');
    const first = readProjection();
    if (!first) fail('display-unavailable', 'No accepted display snapshot is available.');
    captured = capture(first);
    const generated = canonicalBody.project();
    if (!generated || !equal(captured, generated))
      fail(
        'display-mismatch',
        'Accepted Stage buffers/frame differ from the generated canonical body.',
      );
    erase(generated);
    function isCurrent() {
      if (disposed) return false;
      if (checking) {
        dispose();
        return false;
      }
      checking = true;
      let next: BetaSkirtCanonicalMediumBodyObservationV2 | null = null;
      try {
        if (aborted(signal) || !canonicalBody!.isCurrent() || !readCurrent()) {
          dispose();
          return false;
        }
        const projected = readProjection();
        if (!projected) {
          dispose();
          return false;
        }
        next = capture(projected);
        if (
          !captured ||
          !equal(captured, next) ||
          !readCurrent() ||
          !canonicalBody!.isCurrent() ||
          aborted(signal) ||
          disposed
        ) {
          dispose();
          return false;
        }
        return true;
      } catch {
        dispose();
        return false;
      } finally {
        if (next) erase(next);
        checking = false;
      }
    }
    if (!isCurrent()) fail('display-became-stale', 'Display changed before async qualification.');
    const hashes = await qualify(captured);
    if (!isCurrent()) fail('display-became-stale', 'Display changed during async qualification.');
    const generation = ++admissionGeneration;
    const binding = captured.binding;
    const collisionBinding = Object.freeze({
      compositionGeneration: generation,
      snapshotGeneration: binding.generation,
      modelId: binding.modelId,
      modelContentRevision: binding.modelContentRevision,
      inputFingerprint: binding.inputFingerprint,
      canonicalContentFingerprint: binding.canonicalContentFingerprint,
      basisKind: binding.basisKind,
      posePresetId: binding.posePresetId,
      bodySourceRevision: binding.sourceRevision,
    });
    const claims = Object.freeze({
      generatedCanonicalBodyOwnerVerified: true,
      exactObservedBodyAndFrameMatched: true,
      pinnedCanonicalProfileMatched: true,
      hostObservationAuthenticatedAsViewportAuthority: false,
      compositionGenerationSource: 'canonical-body-display-admission-v2',
      strainBandCompositionRequired: false,
      collisionAuthority: false,
      runtimeAuthority: false,
      productionAuthority: false,
    } as const);
    const unbranded = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_DISPLAYED_BODY_ADMISSION_V2,
      dispose,
      isCurrent,
      project() {
        return isCurrent() && captured
          ? Object.freeze({ ...capture(captured), collisionBinding, hashes, claims })
          : null;
      },
    } satisfies Omit<BetaSkirtCanonicalMediumDisplayedBodyOwnerV2, typeof admissionBrand>);
    const owner = unbranded as BetaSkirtCanonicalMediumDisplayedBodyOwnerV2;
    admittedOwners.set(owner, owner);
    return Object.freeze({ ok: true, owner });
  } catch (error) {
    dispose();
    return blocked(error);
  }
}

/** Private owner registry prevents caller-shaped objects from becoming placement admission. */
export function projectBetaSkirtCanonicalMediumDisplayedBodyV2(
  owner: unknown,
): BetaSkirtCanonicalMediumDisplayedBodyProjectionV2 | null {
  if (!owner || typeof owner !== 'object') return null;
  return admittedOwners.get(owner)?.project() ?? null;
}
export function isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(owner: unknown): boolean {
  return !!owner && typeof owner === 'object' && (admittedOwners.get(owner)?.isCurrent() ?? false);
}
