import type { common_Model } from 'api/proto-http/admin';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  subscribeModelDisplayedTriangleBodyInputInvalidationV1,
  type ModelDisplayedTriangleBodyIdentityV1,
  type ModelDisplayedTriangleBodyInputProjectionV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import type { CanonicalBodyMeasurementsMm } from 'lib/cloth/body/measurement-adapter';
import { sha256Hex } from 'lib/features/sha256';

import { modelCardMannequinInputV1 } from './model-card-mannequin-input-v1';

export const SAVED_MODEL_DISPLAYED_TRIANGLE_BODY_OWNER_V2 =
  'saved-model-displayed-triangle-body-owner/v2' as const;

const CLAIMS = Object.freeze({
  genuineProducerOwnershipConsumed: true,
  acceptedHostObservationBytesAdopted: true,
  savedRowAndCanonicalMeasurementsBound: true,
  displayMeshRebuilt: false,
  viewportAuthorityAuthenticated: false,
  persistedReaderAuthorityAuthenticated: false,
  bodyTopologyEvaluated: false,
  bodySelfIntersectionEvaluated: false,
  garmentPairEvaluated: false,
  canonicalAuthority: false,
  collisionAuthority: false,
  runtimeAuthority: false,
  productionAuthority: false,
  garmentFitClaimed: false,
} as const);

export interface SavedModelDisplayedTriangleBodyBindingV2 {
  readonly version: typeof SAVED_MODEL_DISPLAYED_TRIANGLE_BODY_OWNER_V2;
  readonly generation: number;
  /** Original observed identity; never rewritten to the persisted-row identity. */
  readonly displayedIdentity: ModelDisplayedTriangleBodyIdentityV1;
  readonly persistedModel: Readonly<{ id: number; updatedAt: string; revision: string }>;
  readonly modelFormRevision: string;
  readonly canonicalContentFingerprint: string;
  readonly canonicalMeasurementsSha256: string;
  readonly rawBodyPositionsFloat32LeSha256: string;
  readonly rawBodyTrianglesUint32LeSha256: string;
  /** Existing V1 domain/header encoding, computed from the same accepted bytes. */
  readonly framedBodyPositionsSha256: string;
  readonly framedBodyTopologySha256: string;
  readonly poseDocumentSha256: string;
  readonly observedBodyContentSha256: string;
}

/** Detached historical evidence. Possessing this record never grants projection authority. */
export interface SavedModelDisplayedTriangleBodySnapshotV2 {
  readonly version: 'saved-model-displayed-triangle-body-snapshot/v2';
  readonly role: 'EXACT_SAVED_MODEL_HOST_OBSERVED_BODY_INPUT';
  readonly binding: SavedModelDisplayedTriangleBodyBindingV2;
  readonly canonicalMeasurements: CanonicalBodyMeasurementsMm;
  readonly frame: ModelDisplayedTriangleBodyInputProjectionV1['frame'];
  readonly poseDocument: ModelDisplayedTriangleBodyInputProjectionV1['poseDocument'];
  readonly displayedPose: ModelDisplayedTriangleBodyInputProjectionV1['displayedPose'];
  readonly bodyPositionsM: Float32Array;
  readonly bodyTriangles: Uint32Array;
  readonly counts: ModelDisplayedTriangleBodyInputProjectionV1['counts'];
  readonly claims: typeof CLAIMS;
}

export interface SavedModelDisplayedTriangleBodyAdoptionV2 {
  /** Borrowed: this owner never calls displayedInput.dispose(). */
  readonly displayedInput: ModelDisplayedTriangleBodyOwnedInputV1;
  readonly expectedDisplayedIdentity: ModelDisplayedTriangleBodyIdentityV1;
  readonly expectedPersistedModel: Readonly<{ id: number; updatedAt: string }>;
  /** The host must perform a fresh lookup; this callback is not authenticated as a server. */
  readonly readCurrentModel: (signal?: AbortSignal) => Promise<common_Model | null>;
}

export type SavedModelDisplayedTriangleBodyBlockedCodeV2 =
  | 'invalid-owner'
  | 'invalid-request'
  | 'displayed-input-unavailable'
  | 'displayed-identity-mismatch'
  | 'model-input-invalid'
  | 'model-stale'
  | 'binding-stale'
  | 'cancelled'
  | 'sha256-unavailable';

export type SavedModelDisplayedTriangleBodyResultV2 =
  | Readonly<{
      status: 'committed' | 'projected';
      snapshot: SavedModelDisplayedTriangleBodySnapshotV2;
    }>
  | Readonly<{
      status: 'blocked';
      code: SavedModelDisplayedTriangleBodyBlockedCodeV2;
      detail: string;
    }>;

declare const ownerBrand: unique symbol;
export type SavedModelDisplayedTriangleBodyOwnerV2 = Readonly<{
  version: typeof SAVED_MODEL_DISPLAYED_TRIANGLE_BODY_OWNER_V2;
  readonly [ownerBrand]: true;
}>;

type CapturedModel = ReturnType<typeof captureModel>;
interface Work {
  readonly generation: number;
  readonly lifetime: AbortController;
  input: ModelDisplayedTriangleBodyOwnedInputV1 | null;
  reader: SavedModelDisplayedTriangleBodyAdoptionV2['readCurrentModel'] | null;
  unsubscribe: (() => void) | null;
  removeAbort: (() => void) | null;
  source: ModelDisplayedTriangleBodyInputProjectionV1 | null;
  model: CapturedModel | null;
  binding: SavedModelDisplayedTriangleBodyBindingV2 | null;
}
interface OwnerState {
  generation: number;
  disposed: boolean;
  active: Work | null;
}
const owners = new WeakMap<object, OwnerState>();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

class AdmissionFailure extends Error {
  constructor(
    readonly code: SavedModelDisplayedTriangleBodyBlockedCodeV2,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: SavedModelDisplayedTriangleBodyBlockedCodeV2, detail: string): never {
  throw new AdmissionFailure(code, detail);
}
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') fail('invalid-request', 'Expected a data record.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !('value' in descriptor))
    fail('invalid-request', `${key} must be an own enumerable data field.`);
  return descriptor.value;
}

/** Bounded getter-free copy before model helpers consume a host-returned row. */
function plain<T>(value: T): T {
  let visits = 0;
  function copy(item: unknown, depth: number): unknown {
    if (++visits > 20_000 || depth > 24) fail('invalid-request', 'Data copy budget exceeded.');
    if (item === null || item === undefined || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string' && item.length <= 32_768) return item;
    if (!item || typeof item !== 'object') fail('invalid-request', 'Expected finite plain data.');
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item)) {
      if (prototype !== Array.prototype || item.length > 20_000)
        fail('invalid-request', 'Invalid data array.');
      return Array.from({ length: item.length }, (_, index) =>
        copy(field(item, String(index)), depth + 1),
      );
    }
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-request', 'Invalid data record prototype.');
    const keys = Reflect.ownKeys(item);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-request', 'Data symbols are invalid.');
    return Object.fromEntries(
      (keys as string[]).sort().map((key) => [key, copy(field(item, key), depth + 1)]),
    );
  }
  return copy(value, 0) as T;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function key(value: unknown): string {
  return JSON.stringify(plain(value), (_name, item) =>
    Object.is(item, -0) ? ['negative-zero'] : item,
  );
}
function persistedIdentity(value: unknown): Readonly<{ id: number; updatedAt: string }> {
  const id = field(value, 'id');
  const updatedAt = field(value, 'updatedAt');
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof updatedAt !== 'string' ||
    !updatedAt ||
    updatedAt.trim() !== updatedAt ||
    updatedAt.length > 256
  )
    fail(
      'model-input-invalid',
      'Persisted model requires a positive id and exact updatedAt wire string.',
    );
  return Object.freeze({ id, updatedAt });
}
function captureModel(row: common_Model | null) {
  if (!row) fail('model-stale', 'The persisted model row is unavailable.');
  const model = plain(row);
  const persisted = persistedIdentity(model);
  const input = modelCardMannequinInputV1(model);
  const resolved = resolveModelOpenReferencePreviewInputV1(input);
  if (
    !resolved.ok ||
    resolved.diagnostics.length ||
    !['GENDER_ENUM_FEMALE', 'GENDER_ENUM_MALE', 'GENDER_ENUM_UNISEX'].includes(input.gender ?? '')
  )
    fail(
      'model-input-invalid',
      'Persisted gender and canonical measurements must resolve without diagnostics.',
    );
  const measurements = Object.freeze({ ...resolved.measurements });
  // Same local domain as modelOpenReferencePreviewFingerprintV1; no UI module or mesh build imported.
  const inputFingerprint = JSON.stringify([
    input.gender ?? null,
    Object.entries(input.measurements)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort(([left], [right]) => left.localeCompare(right)),
  ]);
  return {
    persisted: Object.freeze({
      ...persisted,
      revision: `common-model/v1;id=${persisted.id};updatedAt=${encodeURIComponent(persisted.updatedAt)}`,
    }),
    modelFormRevision: modelFormRevisionKeyV1(model),
    inputFingerprint,
    basisKind: resolved.basis.basisKind,
    measurements,
    canonicalContentFingerprint: JSON.stringify(
      Object.entries(measurements).sort(([left], [right]) => left.localeCompare(right)),
    ),
    contentKey: key(model),
  };
}
function validateModelDisplay(
  model: CapturedModel,
  source: ModelDisplayedTriangleBodyInputProjectionV1,
): void {
  if (
    source.identity.modelId !== `tech-card-base-model:${model.persisted.id}` ||
    source.identity.modelContentRevision !== model.modelFormRevision ||
    source.identity.inputFingerprint !== model.inputFingerprint ||
    source.identity.basisKind !== model.basisKind
  )
    fail(
      'displayed-identity-mismatch',
      'Observed form/body identity differs from the freshly read saved row.',
    );
}
function stateFor(owner: unknown): OwnerState | null {
  return owner && typeof owner === 'object' ? (owners.get(owner) ?? null) : null;
}
function revoke(state: OwnerState, work = state.active): void {
  if (!work || state.active !== work) return;
  state.active = null;
  work.unsubscribe?.();
  work.removeAbort?.();
  work.unsubscribe = work.removeAbort = null;
  work.input = null;
  work.reader = null;
  work.source?.bodyPositionsM.fill(0);
  work.source?.bodyTriangles.fill(0);
  work.source = null;
  work.model = null;
  work.binding = null;
  work.lifetime.abort();
}
function signalCheck(signal?: AbortSignal): void {
  if (signal === undefined) return;
  try {
    if (!aborted.call(signal)) return;
  } catch {
    fail('invalid-request', 'A genuine AbortSignal is required.');
  }
  fail('cancelled', 'Observed body operation was cancelled.');
}
function current(state: OwnerState, work: Work, signal?: AbortSignal): void {
  signalCheck(signal);
  if (state.disposed || state.active !== work || work.lifetime.signal.aborted)
    fail('binding-stale', 'Observed body generation was revoked or replaced.');
  if (
    !work.input ||
    !projectCurrentModelDisplayedTriangleBodyInputV1(work.input) ||
    state.active !== work ||
    work.lifetime.signal.aborted
  ) {
    revoke(state, work);
    fail('displayed-input-unavailable', 'Borrowed displayed input is no longer current.');
  }
}
function abortListener(state: OwnerState, work: Work, signal?: AbortSignal): () => void {
  signalCheck(signal);
  if (!signal) return () => undefined;
  const cancel = () => revoke(state, work);
  EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
  return () => EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
}
async function readFresh(
  state: OwnerState,
  work: Work,
  signal?: AbortSignal,
): Promise<CapturedModel> {
  current(state, work, signal);
  const reader = work.reader!;
  const row = await reader(work.lifetime.signal);
  current(state, work, signal);
  const model = captureModel(row);
  current(state, work, signal);
  validateModelDisplay(model, work.source!);
  if (work.model && work.model.contentKey !== model.contentKey)
    fail('model-stale', 'Persisted row content or updatedAt changed.');
  return model;
}
function rawBytes(values: Float32Array | Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    if (values instanceof Float32Array) view.setFloat32(index * 4, values[index], true);
    else view.setUint32(index * 4, values[index], true);
  }
  return bytes;
}
function framedBytes(domain: string, values: Float32Array | Uint32Array): Uint8Array {
  const label = new TextEncoder().encode(domain);
  const payload = rawBytes(values);
  const bytes = new Uint8Array(12 + label.length + payload.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, label.length, true);
  header.setUint32(4, values.length, true);
  header.setUint32(8, payload.length, true);
  bytes.set(label, 12);
  bytes.set(payload, 12 + label.length);
  return bytes;
}
function snapshot(work: Work): SavedModelDisplayedTriangleBodySnapshotV2 {
  const source = work.source!;
  return Object.freeze({
    version: 'saved-model-displayed-triangle-body-snapshot/v2',
    role: 'EXACT_SAVED_MODEL_HOST_OBSERVED_BODY_INPUT',
    binding: freeze(plain(work.binding!)),
    canonicalMeasurements: Object.freeze({ ...work.model!.measurements }),
    frame: freeze(plain(source.frame)),
    poseDocument: freeze(plain(source.poseDocument)),
    displayedPose: freeze(plain(source.displayedPose)),
    bodyPositionsM: source.bodyPositionsM.slice(),
    bodyTriangles: source.bodyTriangles.slice(),
    counts: Object.freeze({ ...source.counts }),
    claims: CLAIMS,
  });
}
function blocked(error: unknown): SavedModelDisplayedTriangleBodyResultV2 {
  return Object.freeze({
    status: 'blocked',
    code: error instanceof AdmissionFailure ? error.code : 'invalid-request',
    detail:
      error instanceof Error ? error.message.slice(0, 2_048) : 'Observed body admission failed.',
  });
}

export function createSavedModelDisplayedTriangleBodyOwnerV2(): SavedModelDisplayedTriangleBodyOwnerV2 {
  const owner = Object.freeze({
    version: SAVED_MODEL_DISPLAYED_TRIANGLE_BODY_OWNER_V2,
  }) as SavedModelDisplayedTriangleBodyOwnerV2;
  owners.set(owner, { generation: 0, disposed: false, active: null });
  return owner;
}

/** Adopts exact accepted V9 bytes; never builds a display mesh or relabels the pose as a-rest. */
export async function adoptSavedModelDisplayedTriangleBodyV2(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
  request: SavedModelDisplayedTriangleBodyAdoptionV2 | null,
  signal?: AbortSignal,
): Promise<SavedModelDisplayedTriangleBodyResultV2> {
  const state = stateFor(owner);
  if (!state || state.disposed)
    return blocked(new AdmissionFailure('invalid-owner', 'A live genuine owner is required.'));
  revoke(state);
  const generation = ++state.generation;
  let work: Work | null = null;
  try {
    signalCheck(signal);
    if (request === null) fail('displayed-input-unavailable', 'The displayed body was cleared.');
    const input = field(request, 'displayedInput') as ModelDisplayedTriangleBodyOwnedInputV1;
    const source = projectCurrentModelDisplayedTriangleBodyInputV1(input);
    if (!source)
      fail('displayed-input-unavailable', 'A current genuine producer-owned input is required.');
    const expected = plain(field(request, 'expectedDisplayedIdentity'));
    if (key(expected) !== key(source.identity))
      fail('displayed-identity-mismatch', 'Expected displayed identity differs.');
    const expectedPersisted = persistedIdentity(field(request, 'expectedPersistedModel'));
    const reader = field(request, 'readCurrentModel');
    if (typeof reader !== 'function')
      fail('invalid-request', 'A fresh saved-model reader is required.');
    if (state.disposed || state.generation !== generation)
      fail('binding-stale', 'Adoption was replaced while capturing the request.');
    work = {
      generation,
      lifetime: new AbortController(),
      input,
      reader: reader as SavedModelDisplayedTriangleBodyAdoptionV2['readCurrentModel'],
      source,
      model: null,
      binding: null,
      unsubscribe: null,
      removeAbort: null,
    };
    state.active = work;
    const capturedWork = work;
    work.unsubscribe = subscribeModelDisplayedTriangleBodyInputInvalidationV1(input, () =>
      revoke(state, capturedWork),
    );
    if (!work.unsubscribe)
      fail('displayed-input-unavailable', 'Displayed input revoked before subscription.');
    work.removeAbort = abortListener(state, work, signal);
    work.model = await readFresh(state, work, signal);
    if (
      work.model.persisted.id !== expectedPersisted.id ||
      work.model.persisted.updatedAt !== expectedPersisted.updatedAt
    )
      fail('model-stale', 'Saved row differs from the expected persisted identity.');
    if (
      (await sha256Hex(new Uint8Array())) !==
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
      fail('sha256-unavailable', 'SHA-256 known-answer check failed.');
    current(state, work, signal);
    const [
      rawPositions,
      rawTriangles,
      framedPositions,
      framedTopology,
      measurementHash,
      poseHash,
      contentHash,
    ] = await Promise.all([
      sha256Hex(rawBytes(source.bodyPositionsM)),
      sha256Hex(rawBytes(source.bodyTriangles)),
      sha256Hex(framedBytes('grbpwr-display-positions-f32le/v1', source.bodyPositionsM)),
      sha256Hex(framedBytes('grbpwr-display-indices-u32le/v1', source.bodyTriangles)),
      sha256Hex(
        new TextEncoder().encode(
          JSON.stringify([
            'grbpwr-canonical-body-measurements/v1',
            work.model.canonicalContentFingerprint,
          ]),
        ),
      ),
      sha256Hex(
        new TextEncoder().encode(
          key([
            'saved-model-displayed-pose/v2',
            source.poseDocument,
            source.identity.poseDocumentCanonicalKey,
          ]),
        ),
      ),
      sha256Hex(
        new TextEncoder().encode(
          key([
            'saved-model-observed-body-content/v2',
            source.identity,
            source.frame,
            source.poseDocument,
            source.displayedPose,
            source.hashes,
          ]),
        ),
      ),
    ]);
    current(state, work, signal);
    if (
      ![
        rawPositions,
        rawTriangles,
        framedPositions,
        framedTopology,
        measurementHash,
        poseHash,
        contentHash,
      ].every((hash) => /^[0-9a-f]{64}$/u.test(hash)) ||
      rawPositions !== source.hashes.bodyPositionsFloat32LeSha256 ||
      rawTriangles !== source.hashes.bodyTrianglesUint32LeSha256
    )
      fail('sha256-unavailable', 'Observed raw bytes or required hash domains failed validation.');
    await readFresh(state, work, signal);
    current(state, work, signal);
    work.binding = freeze({
      version: SAVED_MODEL_DISPLAYED_TRIANGLE_BODY_OWNER_V2,
      generation,
      displayedIdentity: plain(source.identity),
      persistedModel: work.model.persisted,
      modelFormRevision: work.model.modelFormRevision,
      canonicalContentFingerprint: work.model.canonicalContentFingerprint,
      canonicalMeasurementsSha256: measurementHash,
      rawBodyPositionsFloat32LeSha256: rawPositions,
      rawBodyTrianglesUint32LeSha256: rawTriangles,
      framedBodyPositionsSha256: framedPositions,
      framedBodyTopologySha256: framedTopology,
      poseDocumentSha256: poseHash,
      observedBodyContentSha256: contentHash,
    });
    return Object.freeze({ status: 'committed', snapshot: snapshot(work) });
  } catch (error) {
    if (work) revoke(state, work);
    return blocked(error);
  }
}

/** Every projection performs independent fresh saved-row reads, with source checks around awaits. */
export async function projectSavedModelDisplayedTriangleBodyV2(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
  expectedBinding: SavedModelDisplayedTriangleBodyBindingV2,
  signal?: AbortSignal,
): Promise<SavedModelDisplayedTriangleBodyResultV2> {
  const state = stateFor(owner);
  const work = state?.active;
  if (!state || state.disposed)
    return blocked(new AdmissionFailure('invalid-owner', 'A live genuine owner is required.'));
  if (!work?.binding)
    return blocked(
      new AdmissionFailure('binding-stale', 'No committed displayed body is retained.'),
    );
  let removeAbort: (() => void) | null = null;
  let matchedBinding = false;
  try {
    if (key(expectedBinding) !== key(work.binding))
      fail('binding-stale', 'Expected generation or exact binding differs.');
    matchedBinding = true;
    current(state, work, signal);
    removeAbort = abortListener(state, work, signal);
    await readFresh(state, work, signal);
    await readFresh(state, work, signal);
    current(state, work, signal);
    return Object.freeze({ status: 'projected', snapshot: snapshot(work) });
  } catch (error) {
    // An old caller cannot revoke the replacement generation by presenting its stale binding.
    if (matchedBinding) revoke(state, work);
    return blocked(error);
  } finally {
    removeAbort?.();
  }
}

/** Revocation fanout only, not a saved-row freshness assertion or runtime capability. */
export function getSavedModelDisplayedTriangleBodyLifetimeV2(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
  expectedBinding: SavedModelDisplayedTriangleBodyBindingV2,
): AbortSignal | null {
  const state = stateFor(owner);
  const work = state?.active;
  if (!state || !work?.binding) return null;
  let matchedBinding = false;
  try {
    if (key(expectedBinding) !== key(work.binding)) return null;
    matchedBinding = true;
    current(state, work);
    return work.lifetime.signal;
  } catch {
    if (matchedBinding) revoke(state, work);
    return null;
  }
}

export function invalidateSavedModelDisplayedTriangleBodyOwnerV2(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
): boolean {
  const state = stateFor(owner);
  if (!state || state.disposed) return false;
  revoke(state);
  state.generation += 1;
  return true;
}

export function disposeSavedModelDisplayedTriangleBodyOwnerV2(
  owner: SavedModelDisplayedTriangleBodyOwnerV2,
): boolean {
  const state = stateFor(owner);
  if (!state || state.disposed) return false;
  revoke(state);
  state.disposed = true;
  return true;
}
