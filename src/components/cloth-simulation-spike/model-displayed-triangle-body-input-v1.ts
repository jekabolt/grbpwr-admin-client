import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from 'components/managers/model/components/model-mannequin-pose-document-v2';
import { modelOpenReferenceDirectPoseGeometryEqualV9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { MEASUREMENT_BODY_FRAME_V2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { snapshotMeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-open-reference-display-v1';
import { sha256Hex } from 'lib/features/sha256';

const IDENTITY_KEYS = [
  'observationId',
  'modelId',
  'modelContentRevision',
  'basisKind',
  'inputFingerprint',
  'bodyBuildFingerprint',
  'runtimeSourceRevision',
  'frameRevision',
  'poseDocumentCanonicalKey',
  'displayPositionSource',
] as const;
export type ModelDisplayedTriangleBodyIdentityV1 = Readonly<
  Pick<ModelOpenReferenceDisplayedBodySnapshotV1, (typeof IDENTITY_KEYS)[number]>
>;
export type ModelDisplayedTriangleBodyInputRequestV1 = Readonly<{
  /** Host observation only. This callback is not authenticated as a viewport capability. */
  readCurrentSnapshot: () => ModelOpenReferenceDisplayedBodySnapshotV1 | null;
  expected: ModelDisplayedTriangleBodyIdentityV1;
}>;

const CLAIMS = Object.freeze({
  hostObservationConsumed: true,
  geometryCopied: true,
  currentIdentityAndContentRechecked: true,
  viewportAuthorityAuthenticated: false,
  bodyTopologyEvaluated: false,
  bodySelfIntersectionEvaluated: false,
  garmentPairEvaluated: false,
  canonicalAuthority: false,
  collisionAuthority: false,
  runtimeAuthority: false,
  productionAuthority: false,
} as const);

export type ModelDisplayedTriangleBodyInputProjectionV1 = Readonly<{
  identity: ModelDisplayedTriangleBodyIdentityV1;
  frame: ModelOpenReferenceDisplayedBodySnapshotV1['frame'];
  poseDocument: ModelOpenReferenceDisplayedBodySnapshotV1['poseDocument'];
  displayedPose: ModelOpenReferenceDisplayedBodySnapshotV1['displayedPose'];
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint32Array;
  counts: Readonly<{ vertexCount: number; triangleCount: number; byteLength: number }>;
  hashes: Readonly<{
    bodyPositionsFloat32LeSha256: string;
    bodyTrianglesUint32LeSha256: string;
  }>;
  claims: typeof CLAIMS;
}>;
export type ModelDisplayedTriangleBodyOwnedInputV1 = Readonly<{
  /** Historical detached snapshot, not a currentness assertion. Returns null once revoked. */
  project: () => ModelDisplayedTriangleBodyInputProjectionV1 | null;
  /** Rechecks the captured host reader and signal; any mismatch permanently revokes this input. */
  isCurrent: () => boolean;
  dispose: () => boolean;
}>;

// Same-session producer membership authenticates ownership, never the host/viewport observation.
const inputs = new WeakMap<
  object,
  Readonly<{
    current: () => ModelDisplayedTriangleBodyInputProjectionV1 | null;
    subscribe: (listener: () => void) => (() => void) | null;
  }>
>();

/** Refuses structural lookalikes and historical project() snapshots. */
export function projectCurrentModelDisplayedTriangleBodyInputV1(
  input: unknown,
): ModelDisplayedTriangleBodyInputProjectionV1 | null {
  return input && typeof input === 'object' ? inputs.get(input)?.current() ?? null : null;
}

/** Borrowed-source revocation only; arbitrary reader drift is discovered on currentness checks. */
export function subscribeModelDisplayedTriangleBodyInputInvalidationV1(
  input: unknown,
  listener: () => void,
): (() => void) | null {
  return input && typeof input === 'object' && typeof listener === 'function'
    ? inputs.get(input)?.subscribe(listener) ?? null
    : null;
}
export type ModelDisplayedTriangleBodyInputBlockedCodeV1 =
  | 'invalid-request'
  | 'snapshot-unavailable'
  | 'cancelled'
  | 'identity-mismatch'
  | 'frame-mismatch'
  | 'pose-mismatch'
  | 'geometry-invalid'
  | 'input-budget-exceeded'
  | 'sha256-unavailable'
  | 'snapshot-became-stale';
export type ModelDisplayedTriangleBodyInputResultV1 =
  | Readonly<{ ok: true; input: ModelDisplayedTriangleBodyOwnedInputV1 }>
  | Readonly<{
      ok: false;
      code: ModelDisplayedTriangleBodyInputBlockedCodeV1;
      detail: string;
      input: null;
    }>;

class InputFailure extends Error {
  constructor(
    readonly code: ModelDisplayedTriangleBodyInputBlockedCodeV1,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: ModelDisplayedTriangleBodyInputBlockedCodeV1, detail: string): never {
  throw new InputFailure(code, detail);
}
function data(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') fail('invalid-request', 'Expected a data record.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !('value' in descriptor))
    fail('invalid-request', `${key} must be an own enumerable data field.`);
  return descriptor.value;
}

/** Bounded, getter-free copying; sorted keys also provide a stable exact metadata comparison. */
function plain<T>(value: T): T {
  let count = 0;
  const copy = (item: unknown, depth: number): unknown => {
    if (++count > 20_000 || depth > 32)
      fail('input-budget-exceeded', 'Displayed metadata exceeds the bounded copy budget.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (item.length > 16_384)
        fail('input-budget-exceeded', 'Displayed metadata string is too long.');
      return item;
    }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object')
      fail('invalid-request', 'Metadata must be finite plain data.');
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item)) {
      if (prototype !== Array.prototype)
        fail('invalid-request', 'Metadata array prototype is invalid.');
      if (item.length > 20_000)
        fail('input-budget-exceeded', 'Displayed metadata array exceeds the copy budget.');
      return Array.from({ length: item.length }, (_, index) =>
        copy(data(item, String(index)), depth + 1),
      );
    }
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-request', 'Metadata record prototype is invalid.');
    const keys = Reflect.ownKeys(item);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-request', 'Metadata symbols are invalid.');
    return Object.fromEntries(
      (keys as string[]).sort().map((key) => [key, copy(data(item, key), depth + 1)]),
    );
  };
  return copy(value, 0) as T;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function identity(value: unknown): ModelDisplayedTriangleBodyIdentityV1 {
  const result = Object.fromEntries(
    IDENTITY_KEYS.map((key) => {
      const field = data(value, key);
      if (typeof field !== 'string' || !field || field !== field.trim() || field.length > 16_384)
        fail('invalid-request', `${key} must be bounded non-empty identity text.`);
      return [key, field];
    }),
  ) as unknown as ModelDisplayedTriangleBodyIdentityV1;
  if (
    result.displayPositionSource !== 'live-pose' &&
    result.displayPositionSource !== 'built-runtime'
  )
    fail('invalid-request', 'Displayed position source is invalid.');
  if (!['neutral', 'female', 'male'].includes(result.basisKind))
    fail('invalid-request', 'Displayed body basis is invalid.');
  return Object.freeze(result);
}
const typedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const typedLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')!.get!;
const abortGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function checkSignal(signal?: AbortSignal): void {
  if (signal === undefined) return;
  let cancelled: boolean;
  try {
    cancelled = abortGetter.call(signal);
  } catch {
    fail('invalid-request', 'A genuine AbortSignal is required.');
  }
  if (cancelled) fail('cancelled', 'Displayed body capture was cancelled.');
}
function geometry(snapshot: unknown) {
  const mesh = data(snapshot, 'displayMesh');
  const positions = data(mesh, 'positions');
  const indices = data(mesh, 'indices');
  const vertexCount = data(mesh, 'vertexCount');
  const triangleCount = data(mesh, 'triangleCount');
  if (
    !positions ||
    Object.getPrototypeOf(positions) !== Float32Array.prototype ||
    !indices ||
    Object.getPrototypeOf(indices) !== Uint32Array.prototype ||
    !(typedBuffer.call(positions) instanceof ArrayBuffer) ||
    !(typedBuffer.call(indices) instanceof ArrayBuffer) ||
    !Number.isSafeInteger(vertexCount) ||
    (vertexCount as number) < 3 ||
    !Number.isSafeInteger(triangleCount) ||
    (triangleCount as number) < 1
  )
    fail('geometry-invalid', 'Displayed geometry must use owned finite F32/U32 triangle arrays.');
  // Capture limits bound memory only; they do not establish any solver/collision qualification.
  if ((vertexCount as number) > 20_000 || (triangleCount as number) > 30_000)
    fail('input-budget-exceeded', 'Displayed geometry exceeds the body input copy budget.');
  if (
    typedLength.call(positions) !== (vertexCount as number) * 3 ||
    typedLength.call(indices) !== (triangleCount as number) * 3
  )
    fail('geometry-invalid', 'Displayed geometry lengths differ from declared counts.');
  const copiedPositions = new Float32Array((vertexCount as number) * 3);
  const copiedIndices = new Uint32Array((triangleCount as number) * 3);
  Float32Array.prototype.set.call(copiedPositions, positions as Float32Array);
  Uint32Array.prototype.set.call(copiedIndices, indices as Uint32Array);
  const byteLength = copiedPositions.byteLength + copiedIndices.byteLength;
  if (
    copiedPositions.length !== (vertexCount as number) * 3 ||
    copiedIndices.length !== (triangleCount as number) * 3 ||
    data(mesh, 'byteLength') !== byteLength ||
    !copiedPositions.every(Number.isFinite) ||
    !copiedIndices.every((index) => index < (vertexCount as number))
  )
    fail('geometry-invalid', 'Displayed geometry counts, coordinates or indices are invalid.');
  return snapshotMeasurementSurfaceMeshV1({
    positions: copiedPositions,
    indices: copiedIndices,
    vertexCount: vertexCount as number,
    triangleCount: triangleCount as number,
    byteLength,
  });
}
function capture(snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 | null) {
  if (!snapshot)
    fail('snapshot-unavailable', 'The current displayed body observation is unavailable.');
  if (data(snapshot, 'schemaVersion') !== 'model-open-reference-displayed-body-snapshot/v1')
    fail('invalid-request', 'Unsupported displayed body observation.');
  for (const key of [
    'canonicalAuthority',
    'collisionAuthority',
    'runtimeAuthority',
    'productionAuthority',
  ])
    if (data(snapshot, key) !== false)
      fail('invalid-request', 'A host observation cannot claim cloth authority.');
  const binding = identity(snapshot);
  const frame = plain(
    data(snapshot, 'frame'),
  ) as ModelOpenReferenceDisplayedBodySnapshotV1['frame'];
  const expectedCoordinates = {
    handedness: 'right',
    up: '+Y',
    front: '+Z',
    subjectLeft: '+X',
    origin: 'ground-projection-between-ankles',
  };
  if (
    frame.version !== MEASUREMENT_BODY_FRAME_V2 ||
    frame.id !== 'measurement-body-frame-v2' ||
    frame.revision !== 'measurement-body-frame-v2.0.1' ||
    frame.revision !== binding.frameRevision ||
    frame.sourceRevision !== binding.runtimeSourceRevision ||
    frame.units !== 'm' ||
    JSON.stringify(frame.coordinateSystem) !== JSON.stringify(plain(expectedCoordinates))
  )
    fail('frame-mismatch', 'Displayed mesh source and measurement frame/coordinates do not match.');
  const poseDocument = plain(
    data(snapshot, 'poseDocument'),
  ) as ModelOpenReferenceDisplayedBodySnapshotV1['poseDocument'];
  const displayedPose = plain(
    data(snapshot, 'displayedPose'),
  ) as ModelOpenReferenceDisplayedBodySnapshotV1['displayedPose'];
  const appliedPose = plain(
    data(snapshot, 'appliedPose'),
  ) as ModelOpenReferenceDisplayedBodySnapshotV1['appliedPose'];
  const draftPose = plain(
    data(snapshot, 'draftPose'),
  ) as ModelOpenReferenceDisplayedBodySnapshotV1['draftPose'];
  try {
    if (
      encodeModelMannequinPoseDocumentV2(poseDocument) !== binding.poseDocumentCanonicalKey ||
      !modelOpenReferenceDirectPoseGeometryEqualV9(displayedPose, poseDocument.pose) ||
      !modelOpenReferenceDirectPoseGeometryEqualV9(displayedPose, draftPose) ||
      (binding.displayPositionSource === 'built-runtime' &&
        !modelOpenReferenceDirectPoseGeometryEqualV9(displayedPose, appliedPose))
    )
      fail('pose-mismatch', 'Displayed, requested and persisted pose identities differ.');
    for (const pose of [displayedPose, appliedPose, draftPose])
      createModelMannequinPoseDocumentV2(pose);
  } catch (error) {
    if (error instanceof InputFailure) throw error;
    fail('pose-mismatch', 'Displayed pose document is invalid.');
  }
  const metadata = deepFreeze({
    identity: binding,
    frame,
    poseDocument,
    displayedPose,
    appliedPose,
    draftPose,
  });
  return {
    metadata,
    metadataKey: JSON.stringify(metadata, (_key, value) =>
      Object.is(value, -0) ? { negativeZero: true } : value,
    ),
    mesh: geometry(snapshot),
  };
}
type Captured = ReturnType<typeof capture>;
function same(left: Captured, right: Captured): boolean {
  return (
    left.metadataKey === right.metadataKey &&
    left.mesh.positions.length === right.mesh.positions.length &&
    left.mesh.indices.length === right.mesh.indices.length &&
    left.mesh.positions.every((value, index) => Object.is(value, right.mesh.positions[index])) &&
    left.mesh.indices.every((value, index) => value === right.mesh.indices[index])
  );
}
function littleEndianBytes(values: Float32Array | Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  const floating = values instanceof Float32Array;
  values.forEach((value, index) => {
    if (floating) view.setFloat32(index * 4, value, true);
    else view.setUint32(index * 4, value, true);
  });
  return bytes;
}

/** Owns host-observed body bytes only. It neither builds a mannequin nor admits a collider/solver. */
export async function buildModelDisplayedTriangleBodyInputV1(
  request: ModelDisplayedTriangleBodyInputRequestV1,
  signal?: AbortSignal,
): Promise<ModelDisplayedTriangleBodyInputResultV1> {
  try {
    checkSignal(signal);
    const reader = data(request, 'readCurrentSnapshot');
    if (typeof reader !== 'function')
      fail('invalid-request', 'A current host snapshot reader is required.');
    const expected = identity(data(request, 'expected'));
    const read = () => {
      try {
        return reader() as ModelOpenReferenceDisplayedBodySnapshotV1 | null;
      } catch {
        return null;
      }
    };
    const first = capture(read());
    if (JSON.stringify(expected) !== JSON.stringify(first.metadata.identity))
      fail(
        'identity-mismatch',
        'The current observation does not match the expected model/pose identity.',
      );
    const [positionsHash, trianglesHash] = await Promise.all([
      sha256Hex(littleEndianBytes(first.mesh.positions)),
      sha256Hex(littleEndianBytes(first.mesh.indices)),
    ]);
    checkSignal(signal);
    if (![positionsHash, trianglesHash].every((hash) => /^[0-9a-f]{64}$/u.test(hash)))
      fail('sha256-unavailable', 'Displayed body hashes could not be computed.');
    let last: Captured;
    try {
      last = capture(read());
    } catch {
      fail(
        'snapshot-became-stale',
        'Displayed body observation was revoked or changed while hashing.',
      );
    }
    if (!same(first, last))
      fail(
        'snapshot-became-stale',
        'Displayed body identity or exact content changed while hashing.',
      );
    checkSignal(signal);
    let owned: Captured | null = first;
    let checkingCurrent = false;
    const invalidated = new Set<() => void>();
    const dispose = () => {
      if (!owned) return false;
      owned.mesh.positions.fill(0);
      owned.mesh.indices.fill(0);
      owned = null;
      if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', dispose);
      const listeners = [...invalidated];
      invalidated.clear();
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* A consumer cannot prevent other descendants revoking. */
        }
      }
      return true;
    };
    const hashes = Object.freeze({
      bodyPositionsFloat32LeSha256: positionsHash,
      bodyTrianglesUint32LeSha256: trianglesHash,
    });
    const input: ModelDisplayedTriangleBodyOwnedInputV1 = Object.freeze({
      isCurrent() {
        if (!owned) return false;
        if (checkingCurrent) {
          dispose();
          return false;
        }
        checkingCurrent = true;
        const retained = owned;
        try {
          checkSignal(signal);
          const current = capture(read());
          checkSignal(signal);
          if (owned !== retained || !same(retained, current)) {
            dispose();
            return false;
          }
          return true;
        } catch {
          dispose();
          return false;
        } finally {
          checkingCurrent = false;
        }
      },
      project() {
        if (!owned) return null;
        const mesh = snapshotMeasurementSurfaceMeshV1(owned.mesh);
        return Object.freeze({
          identity: owned.metadata.identity,
          frame: deepFreeze(plain(owned.metadata.frame)),
          poseDocument: deepFreeze(plain(owned.metadata.poseDocument)),
          displayedPose: deepFreeze(plain(owned.metadata.displayedPose)),
          bodyPositionsM: mesh.positions,
          bodyTriangles: mesh.indices,
          counts: Object.freeze({
            vertexCount: mesh.vertexCount,
            triangleCount: mesh.triangleCount,
            byteLength: mesh.byteLength,
          }),
          hashes,
          claims: CLAIMS,
        });
      },
      dispose,
    });
    inputs.set(
      input,
      Object.freeze({
        current() {
          if (!input.isCurrent()) return null;
          const projected = input.project();
          return input.isCurrent() ? projected : null;
        },
        subscribe(listener: () => void) {
          if (!input.isCurrent()) return null;
          invalidated.add(listener);
          return () => {
            invalidated.delete(listener);
          };
        },
      }),
    );
    if (signal) {
      EventTarget.prototype.addEventListener.call(signal, 'abort', dispose, { once: true });
      checkSignal(signal);
    }
    return Object.freeze({ ok: true, input });
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: error instanceof InputFailure ? error.code : 'invalid-request',
      detail:
        error instanceof Error ? error.message.slice(0, 2_048) : 'Displayed body capture failed.',
      input: null,
    });
  }
}
