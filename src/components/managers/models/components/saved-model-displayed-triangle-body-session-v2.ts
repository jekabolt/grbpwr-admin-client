import type { XpbdDeviceLease } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import type {
  DxfGarmentObservedWebgpuReplayRequestV1,
  DxfGarmentObservedWebgpuReplayOwnerV1,
  DxfGarmentObservedWebgpuReplayReportV1,
} from 'components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1';
import type { SavedModelObservedPlacementTargetV1 } from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
import type { common_Model } from 'api/proto-http/admin';
import { patternImportDxfProductPlacementWireCodecV1 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import type { SavedModelObservedPlacementTargetResultV1 } from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
import type {
  PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3,
  PatternImportDxfProductSavedAnnularObservedPlacementIssueResultV3,
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightResultV1,
  PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceResultV1,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';

import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  subscribeModelDisplayedTriangleBodyInputInvalidationV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2 } from 'components/cloth-simulation-spike/beta-skirt-personalized-displayed-body-product-placement-v2';
import type { PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1 } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-garment-session-v1';
import type { PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1 } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodyResultV2,
} from './saved-model-displayed-triangle-body-owner-v2';

export type SavedModelDisplayedTriangleBodyFreshReaderV2 = (
  modelId: number,
  signal: AbortSignal,
) => Promise<common_Model | null>;

export interface SavedModelDisplayedTriangleBodySessionSnapshotV2 {
  readonly status: 'idle' | 'binding' | 'observed-body-bound' | 'blocked' | 'disposed';
  readonly generation: number;
  readonly binding: SavedModelDisplayedTriangleBodyBindingV2 | null;
  readonly blocker: Readonly<{ code: string; detail: string }> | null;
  readonly viewportAuthorityAuthenticated: false;
  readonly persistedReaderAuthorityAuthenticated: false;
  readonly collisionAuthority: false;
  readonly runtimeAuthority: false;
  readonly productionAuthority: false;
}

interface Generation {
  readonly id: number;
  readonly input: ModelDisplayedTriangleBodyOwnedInputV1;
  readonly owner: SavedModelDisplayedTriangleBodyOwnerV2;
  readonly controller: AbortController;
  binding: SavedModelDisplayedTriangleBodyBindingV2 | null;
  unsubscribeSource: (() => void) | null;
  unsubscribeLifetime: (() => void) | null;
  pending: Promise<void> | null;
}

/** Fixed numeric dispatch only. These results do not grant saved graph/product authority. */
export type CurrentSavedModelGenericObservedReplayRequestV1 = Omit<
  DxfGarmentObservedWebgpuReplayRequestV1,
  'bodyOwner' | 'bodyBinding'
> &
  Readonly<{
    expectedObservedTarget: Readonly<{
      target: SavedModelObservedPlacementTargetV1;
      canonicalSha256: string;
    }>;
  }>;
export type CurrentSavedModelGenericObservedReplayResultV1 = Readonly<{
  ok: boolean;
  owner: DxfGarmentObservedWebgpuReplayOwnerV1 | null;
  report: DxfGarmentObservedWebgpuReplayReportV1 | null;
  blockers: readonly string[];
}>;
type GenericReplayDispatch = (
  frameCount: 16 | 32,
  request: CurrentSavedModelGenericObservedReplayRequestV1,
  previous16: unknown,
  lease: XpbdDeviceLease,
  signal?: AbortSignal,
) => Promise<CurrentSavedModelGenericObservedReplayResultV1>;
const genericReplaySessions = new WeakMap<object, GenericReplayDispatch>();
const genericTargetSessions = new WeakMap<
  object,
  (signal?: AbortSignal) => Promise<SavedModelObservedPlacementTargetResultV1>
>();
type GenericTargetCurrentness = {
  session: object | null;
  check: ((signal?: AbortSignal) => void) | null;
  checking: boolean;
};
const genericTargetProjections = new WeakMap<object, GenericTargetCurrentness>();
const genericTargetWeakGet = WeakMap.prototype.get;
const genericTargetWeakSet = WeakMap.prototype.set;

/**
 * Synchronous currentness of one exact successful fixed generic projection. The detached target
 * metadata is not authority; copied/proxied results, sessions, methods and hashes cannot qualify.
 * Caller cancellation refuses this check only and never disposes the borrowed displayed body.
 */
export function isCurrentSavedModelGenericObservedTargetV1(
  session: unknown,
  projection: unknown,
  signal?: AbortSignal,
): boolean {
  if (!session || typeof session !== 'object' || !projection || typeof projection !== 'object')
    return false;
  const record = genericTargetWeakGet.call(genericTargetProjections, projection) as
    | GenericTargetCurrentness
    | undefined;
  if (!record || record.session !== session || !record.check || record.checking) return false;
  const check = record.check;
  record.checking = true;
  try {
    checkSignal(signal);
    check(signal);
    // Genuine source polls can reenter host code, revoke the turn or abort this caller.
    checkSignal(signal);
    return record.session === session && record.check === check;
  } catch {
    return false;
  } finally {
    record.checking = false;
  }
}

export function projectCurrentSavedModelGenericObservedTargetV1(
  session: unknown,
  signal?: AbortSignal,
) {
  const project =
    session && typeof session === 'object' ? genericTargetSessions.get(session) : undefined;
  return project
    ? project(signal)
    : Promise.resolve(
        Object.freeze({
          ok: false as const,
          target: null,
          code: 'body-unavailable' as const,
          detail: 'A genuine current observed body session is required.',
        }),
      );
}
export function runCurrentSavedModelGenericObserved16V1(
  session: unknown,
  request: CurrentSavedModelGenericObservedReplayRequestV1,
  lease: XpbdDeviceLease,
  signal?: AbortSignal,
) {
  const run =
    session && typeof session === 'object' ? genericReplaySessions.get(session) : undefined;
  return run
    ? run(16, request, null, lease, signal)
    : Promise.resolve(genericReplayBlocked('A genuine current observed body session is required.'));
}
export function runCurrentSavedModelGenericObserved32V1(
  session: unknown,
  request: CurrentSavedModelGenericObservedReplayRequestV1,
  genuine16: unknown,
  lease: XpbdDeviceLease,
  signal?: AbortSignal,
) {
  const run =
    session && typeof session === 'object' ? genericReplaySessions.get(session) : undefined;
  return run
    ? run(32, request, genuine16, lease, signal)
    : Promise.resolve(genericReplayBlocked('A genuine current observed body session is required.'));
}
function genericReplayBlocked(detail: string): CurrentSavedModelGenericObservedReplayResultV1 {
  return Object.freeze({ ok: false, owner: null, report: null, blockers: Object.freeze([detail]) });
}
/** Check every own descriptor before native detachment; no caller callback/getter is invoked. */
function captureGenericReplayRequestV1<T>(input: T): T {
  let nodes = 0,
    byteCount = 0,
    text = 0;
  const active = new Set<object>();
  const tp = Object.getPrototypeOf(Float32Array.prototype);
  const byteLength = Object.getOwnPropertyDescriptor(tp, 'byteLength')!.get!;
  const buffer = Object.getOwnPropertyDescriptor(tp, 'buffer')!.get!;
  const abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
  const visit = (value: unknown, depth: number) => {
    if (++nodes > 3000000 || depth > 48)
      throw new TypeError('Generic request exceeds shape bound.');
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value === 'string') {
      text += value.length;
      if (value.length > 65536 || text > 16 * 1024 * 1024)
        throw new TypeError('Generic text exceeds bounds.');
      return;
    }
    if (!value || typeof value !== 'object' || active.has(value))
      throw new TypeError('Generic request requires acyclic data.');
    const prototype = Object.getPrototypeOf(value);
    if (
      [Float32Array.prototype, Uint32Array.prototype, ArrayBuffer.prototype].includes(prototype)
    ) {
      const ab = prototype === ArrayBuffer.prototype;
      const source = ab ? value : buffer.call(value);
      const n = ab ? abLength.call(source) : byteLength.call(value);
      byteCount += n;
      if (
        Object.getPrototypeOf(source) !== ArrayBuffer.prototype ||
        n > 32 * 1024 * 1024 ||
        byteCount > 128 * 1024 * 1024
      )
        throw new TypeError('Generic shared/oversized storage refused.');
      const keys = Reflect.ownKeys(value);
      if (ab ? keys.length !== 0 : keys.length !== n / 4 || keys.some((k, i) => k !== String(i)))
        throw new TypeError('Decorated generic buffers refused.');
      return;
    }
    const array = Array.isArray(value);
    if (prototype !== (array ? Array.prototype : Object.prototype))
      throw new TypeError('Generic request requires plain data.');
    const ds = Object.getOwnPropertyDescriptors(value);
    if (array && (ds.length.value > 500000 || Reflect.ownKeys(ds).length !== ds.length.value + 1))
      throw new TypeError('Generic arrays must be dense/bounded.');
    active.add(value);
    for (const key of Reflect.ownKeys(ds)) {
      if (array && key === 'length') continue;
      const d = ds[key as string];
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !('value' in d) ||
        !d.enumerable ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        throw new TypeError('Generic request accessors/hidden fields refused.');
      visit(d.value, depth + 1);
    }
    active.delete(value);
  };
  visit(input, 0);
  return structuredClone(input);
}

const sessions = new WeakMap<
  object,
  (
    savedPlacementOwner: unknown,
    signal?: AbortSignal,
  ) => Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2>
>();
const garmentPairSessions = new WeakMap<
  object,
  (
    garmentSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1>
>();

type GarmentPairKind = 'legacy' | 'observed-placement';
type GarmentPairResult =
  | PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1;
const observedPlacementGarmentPairSessions = new WeakMap<
  object,
  (
    garmentSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1>
>();

/** Fixed module selection only: no caller-supplied port can receive the retained body owner. */
async function loadGarmentPairHandoff(kind: GarmentPairKind) {
  if (kind === 'observed-placement') {
    const [handoff, pair] = await Promise.all([
      import(
        'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1'
      ),
      import(
        'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1'
      ),
    ]);
    return {
      build:
        handoff.buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1,
      project: pair.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
      lifetime:
        pair.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
      dispose: pair.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
    };
  }
  const [handoff, pair] = await Promise.all([
    import(
      'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-garment-session-v1'
    ),
    import(
      'components/cloth-simulation-spike/beta-skirt-saved-annular-displayed-body-product-placement-v1'
    ),
  ]);
  return {
    build: handoff.buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1,
    project: pair.projectBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
    lifetime: pair.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1,
    dispose: pair.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
  };
}

/** A private garment owner must never be passed to a structural session method supplied by callers. */
export async function buildCurrentSavedModelDisplayedTriangleBodyPairV2(
  session: unknown,
  savedPlacementOwner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2> {
  const build = session && typeof session === 'object' ? sessions.get(session) : undefined;
  return build
    ? build(savedPlacementOwner, signal)
    : pairBlocked(
        'invalid-observed-body-session',
        'A genuine local observed-body consumer session is required.',
      );
}

/** Authenticate this body session before its private body reaches the fixed garment handoff. */
export async function buildCurrentSavedModelDisplayedTriangleBodyGarmentPairV1(
  session: unknown,
  garmentSession: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1> {
  const build =
    session && typeof session === 'object' ? garmentPairSessions.get(session) : undefined;
  return build
    ? build(garmentSession, expectedGeneration, signal)
    : garmentPairBlocked(
        'invalid-observed-body-session',
        'A genuine local observed-body consumer session is required.',
      );
}

/** Uses the observed PlacementV3 session registry; historical sessions cannot enter this route. */
export async function buildCurrentSavedModelDisplayedTriangleBodyObservedPlacementGarmentPairV1(
  session: unknown,
  garmentSession: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1> {
  const build =
    session && typeof session === 'object'
      ? observedPlacementGarmentPairSessions.get(session)
      : undefined;
  return build
    ? build(garmentSession, expectedGeneration, signal)
    : garmentPairBlocked(
        'invalid-observed-body-session',
        'A genuine local observed-body consumer session is required.',
      );
}

export type CurrentSavedModelObservedPlacementIssueRequestV3 = Omit<
  PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3,
  'displayedBodyOwner' | 'displayedBodyBinding'
>;
type ObservedIssueResult = PatternImportDxfProductSavedAnnularObservedPlacementIssueResultV3;
const placementIssueSessions = new WeakMap<
  object,
  (
    sourceSession: unknown,
    request: CurrentSavedModelObservedPlacementIssueRequestV3,
    signal?: AbortSignal,
  ) => Promise<ObservedIssueResult>
>();

/** Authenticate the retained body session before any caller request is inspected. */
export async function issueCurrentSavedModelObservedPlacementV3(
  bodySession: unknown,
  sourceSession: unknown,
  request: CurrentSavedModelObservedPlacementIssueRequestV3,
  signal?: AbortSignal,
): Promise<ObservedIssueResult> {
  const issue =
    bodySession && typeof bodySession === 'object'
      ? placementIssueSessions.get(bodySession)
      : undefined;
  return issue
    ? issue(sourceSession, request, signal)
    : observedIssueBlocked(
        'invalid-observed-body-session',
        'A genuine current observed-body session is required.',
      );
}
function observedIssueBlocked(
  code: string,
  detail: string,
): Extract<ObservedIssueResult, { ok: false }> {
  return Object.freeze({
    ok: false,
    owner: null,
    generation: 0,
    sourceContextBound: false,
    code,
    detail,
  });
}

/** Capture own data before the first host poll/await; callbacks are copied, never executed here. */
function captureObservedIssueRequest(
  input: CurrentSavedModelObservedPlacementIssueRequestV3,
): CurrentSavedModelObservedPlacementIssueRequestV3 {
  const keys = [
    'expectedGeneration',
    'confirmed',
    'garment',
    'policy',
    'annularParameters',
    'confirmedTargetSha256',
    'readCurrentEvidence',
  ] as const;
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    throw new TypeError('An exact plain observed placement intent is required.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw new TypeError('Observed intent must have exact own fields.');
  const captured = Object.fromEntries(
    keys.map((key) => {
      const d = descriptors[key];
      if (!d?.enumerable || !('value' in d))
        throw new TypeError('Observed intent cannot contain accessors.');
      return [key, d.value];
    }),
  ) as CurrentSavedModelObservedPlacementIssueRequestV3;
  if (
    !Number.isSafeInteger(captured.expectedGeneration) ||
    captured.expectedGeneration < 1 ||
    captured.confirmed !== true ||
    typeof captured.readCurrentEvidence !== 'function' ||
    typeof captured.confirmedTargetSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(captured.confirmedTargetSha256)
  )
    throw new TypeError(
      'An exact generation, explicit confirmation, target SHA and fresh reader are required.',
    );
  const data = patternImportDxfProductPlacementWireCodecV1.detachPlain({
    expectedGeneration: captured.expectedGeneration,
    confirmed: captured.confirmed,
    garment: captured.garment,
    policy: captured.policy,
    annularParameters: captured.annularParameters,
    confirmedTargetSha256: captured.confirmedTargetSha256,
  }) as Omit<CurrentSavedModelObservedPlacementIssueRequestV3, 'readCurrentEvidence'>;
  return Object.freeze({ ...data, readCurrentEvidence: captured.readCurrentEvidence });
}

type WorldHandoffResult =
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightResultV1;
type RuntimeHandoffResult =
  PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceResultV1;
const worldPreflightSessions = new WeakMap<
  object,
  (
    sourceSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<WorldHandoffResult>
>();

const runtimeSourceSessions = new WeakMap<
  object,
  (
    sourceSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<RuntimeHandoffResult>
>();

/** Fixed private handoff: its pair/world children are created here, never supplied by a caller. */
export async function buildCurrentSavedModelObservedPlacementRuntimeSourceV1(
  bodySession: unknown,
  sourceSession: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<RuntimeHandoffResult> {
  const build =
    bodySession && typeof bodySession === 'object'
      ? runtimeSourceSessions.get(bodySession)
      : undefined;
  return build
    ? build(sourceSession, expectedGeneration, signal)
    : worldHandoffBlocked(
        'invalid-observed-body-session',
        'A genuine current observed-body session is required.',
      );
}

/** Both private sessions are authenticated by fixed dispatchers; no caller pair/garment is admitted. */
export async function buildCurrentSavedModelObservedPlacementWorldInitialPreflightV1(
  bodySession: unknown,
  sourceSession: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<WorldHandoffResult> {
  const build =
    bodySession && typeof bodySession === 'object'
      ? worldPreflightSessions.get(bodySession)
      : undefined;
  return build
    ? build(sourceSession, expectedGeneration, signal)
    : worldHandoffBlocked(
        'invalid-observed-body-session',
        'A genuine current observed-body session is required.',
      );
}
function worldHandoffBlocked(
  code: string,
  detail: string,
): Extract<WorldHandoffResult, { ok: false }> {
  return Object.freeze({
    ok: false,
    owner: null,
    generation: 0,
    sourceContextBound: false,
    code,
    detail,
  });
}

const abortGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function checkSignal(signal?: AbortSignal): void {
  if (signal !== undefined && abortGetter.call(signal))
    throw new DOMException('Displayed-body consumer cancelled.', 'AbortError');
}

/** Cancel this wait without forwarding a caller's cancellation to the shared body owner. */
function waitForCaller<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
      complete();
    };
    const cancel = () =>
      finish(() => reject(new DOMException('Displayed-body read cancelled.', 'AbortError')));
    // Observe both late outcomes even after this caller has stopped waiting.
    void work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
    EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
    try {
      checkSignal(signal);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
function reason(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_048) : 'Displayed-body ingress failed.';
}
function blocked(code: string, detail: string): SavedModelDisplayedTriangleBodyResultV2 {
  return Object.freeze({ status: 'blocked', code: 'binding-stale', detail: `${code}: ${detail}` });
}
function pairBlocked(
  code: string,
  detail: string,
): BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2 {
  return Object.freeze({ ok: false, owner: null, code, detail });
}

function garmentPairBlocked(
  code: string,
  detail: string,
): Extract<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1, { ok: false }> {
  return Object.freeze({
    ok: false,
    owner: null,
    generation: 0,
    sourceContextBound: false,
    code,
    detail,
  });
}

/** Exact identity decoding only; no mesh, coordinates, or garment geometry participates. */
export function parseSavedModelDisplayedIdentityIdV2(modelId: string): number | null {
  if (typeof modelId !== 'string' || modelId.length > 64) return null;
  const match = /^tech-card-base-model:([1-9][0-9]*)$/u.exec(modelId);
  if (!match || match[0] !== modelId) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function expectedRow(
  row: common_Model | null,
  id: number,
): Readonly<{ id: number; updatedAt: string }> {
  const descriptors = row && typeof row === 'object' ? Object.getOwnPropertyDescriptors(row) : null;
  const modelId = descriptors?.id;
  const revision = descriptors?.updatedAt;
  if (
    !modelId ||
    !revision ||
    !('value' in modelId) ||
    !('value' in revision) ||
    !modelId.enumerable ||
    !revision.enumerable ||
    modelId.value !== id ||
    typeof revision.value !== 'string' ||
    !revision.value ||
    revision.value.trim() !== revision.value ||
    revision.value.length > 256
  )
    throw new TypeError(
      'Fresh GetModel row must retain the selected positive id and exact updatedAt.',
    );
  return Object.freeze({ id, updatedAt: revision.value });
}

/**
 * Picker callback ingress. The source is borrowed, all body owners remain private, and no mesh is
 * rebuilt. MAIN's additive producer registry must accompany any future TABLE port: an input from
 * another module instance or TABLE's older structural-only producer is intentionally rejected.
 */
export function createSavedModelDisplayedTriangleBodySessionV2(
  readFreshModel: SavedModelDisplayedTriangleBodyFreshReaderV2,
) {
  let disposed = false;
  let generation = 0;
  let active: Generation | null = null;
  const listeners = new Set<() => void>();
  const genericTargetRecords = new Set<GenericTargetCurrentness>();
  let store: SavedModelDisplayedTriangleBodySessionSnapshotV2 = Object.freeze({
    status: 'idle',
    generation,
    binding: null,
    blocker: null,
    viewportAuthorityAuthenticated: false,
    persistedReaderAuthorityAuthenticated: false,
    collisionAuthority: false,
    runtimeAuthority: false,
    productionAuthority: false,
  });

  const publish = (
    status: SavedModelDisplayedTriangleBodySessionSnapshotV2['status'],
    binding: SavedModelDisplayedTriangleBodyBindingV2 | null = null,
    blocker: SavedModelDisplayedTriangleBodySessionSnapshotV2['blocker'] = null,
  ) => {
    store = Object.freeze({
      ...store,
      status,
      generation,
      binding,
      blocker: blocker ? Object.freeze({ ...blocker }) : null,
    });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* One view cannot prevent other store subscribers updating. */
      }
    }
  };
  const release = (turn = active) => {
    if (!turn || active !== turn) return;
    active = null;
    for (const record of genericTargetRecords) {
      record.session = null;
      record.check = null;
    }
    genericTargetRecords.clear();
    turn.unsubscribeSource?.();
    turn.unsubscribeLifetime?.();
    turn.unsubscribeSource = turn.unsubscribeLifetime = null;
    turn.binding = null;
    turn.controller.abort();
    disposeSavedModelDisplayedTriangleBodyOwnerV2(turn.owner);
  };
  const failTurn = (turn: Generation, code: string, detail: string) => {
    if (disposed || active !== turn) return;
    release(turn);
    if (disposed || generation !== turn.id) return;
    publish('blocked', null, { code, detail });
  };
  const requireCurrent = (turn: Generation, signal?: AbortSignal) => {
    checkSignal(signal);
    if (
      disposed ||
      active !== turn ||
      turn.controller.signal.aborted ||
      !projectCurrentModelDisplayedTriangleBodyInputV1(turn.input) ||
      active !== turn
    )
      throw new DOMException('Displayed-body source was replaced or revoked.', 'AbortError');
    if (turn.binding && !getSavedModelDisplayedTriangleBodyLifetimeV2(turn.owner, turn.binding))
      throw new DOMException('Adopted displayed-body owner was revoked.', 'AbortError');
    if (disposed || active !== turn || turn.controller.signal.aborted)
      throw new DOMException('Displayed-body source changed during its check.', 'AbortError');
    // Both authentic projectors poll host readers, which may synchronously cancel this operation.
    checkSignal(signal);
  };

  const bind = async (turn: Generation) => {
    try {
      requireCurrent(turn);
      const source = projectCurrentModelDisplayedTriangleBodyInputV1(turn.input)!;
      const id = parseSavedModelDisplayedIdentityIdV2(source.identity.modelId);
      if (id === null)
        throw new TypeError('Displayed identity is not an exact selected saved-model id.');
      const first = await readFreshModel(id, turn.controller.signal);
      requireCurrent(turn);
      const expected = expectedRow(first, id);
      const result = await adoptSavedModelDisplayedTriangleBodyV2(
        turn.owner,
        {
          displayedInput: turn.input,
          expectedDisplayedIdentity: source.identity,
          expectedPersistedModel: expected,
          readCurrentModel: (signal) => readFreshModel(id, signal ?? turn.controller.signal),
        },
        turn.controller.signal,
      );
      requireCurrent(turn);
      if (result.status === 'blocked') {
        failTurn(turn, result.code, result.detail);
        return;
      }
      turn.binding = result.snapshot.binding;
      const lifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(turn.owner, turn.binding);
      if (!lifetime || lifetime.aborted)
        throw new Error('Displayed-body adoption expired before publication.');
      const revoked = () =>
        failTurn(
          turn,
          'observed-body-revoked',
          'The adopted source or saved-row binding was revoked.',
        );
      EventTarget.prototype.addEventListener.call(lifetime, 'abort', revoked, { once: true });
      turn.unsubscribeLifetime = () =>
        EventTarget.prototype.removeEventListener.call(lifetime, 'abort', revoked);
      requireCurrent(turn);
      publish('observed-body-bound', turn.binding);
    } catch (error) {
      failTurn(turn, 'observed-body-binding-failed', reason(error));
    }
  };

  const observe = (input: ModelDisplayedTriangleBodyOwnedInputV1 | null): Promise<void> => {
    if (disposed) return Promise.resolve();
    const existing = active;
    if (input && existing?.input === input) {
      try {
        requireCurrent(existing);
      } catch (error) {
        failTurn(existing, 'observed-body-revoked', reason(error));
      }
      return existing.pending ?? Promise.resolve();
    }
    const turnGeneration = ++generation;
    release();
    if (disposed || generation !== turnGeneration) return Promise.resolve();
    if (!input) {
      publish('idle');
      return Promise.resolve();
    }
    if (!projectCurrentModelDisplayedTriangleBodyInputV1(input)) {
      if (disposed || generation !== turnGeneration) return Promise.resolve();
      publish('blocked', null, {
        code: 'genuine-displayed-input-required',
        detail: 'The current input must belong to the local displayed-body producer.',
      });
      return Promise.resolve();
    }
    if (disposed || generation !== turnGeneration) return Promise.resolve();
    const turn: Generation = {
      id: turnGeneration,
      input,
      owner: createSavedModelDisplayedTriangleBodyOwnerV2(),
      controller: new AbortController(),
      binding: null,
      unsubscribeSource: null,
      unsubscribeLifetime: null,
      pending: null,
    };
    active = turn;
    turn.unsubscribeSource = subscribeModelDisplayedTriangleBodyInputInvalidationV1(input, () =>
      failTurn(
        turn,
        'observed-body-source-revoked',
        'The picker revoked its borrowed displayed input.',
      ),
    );
    if (!turn.unsubscribeSource || active !== turn) {
      failTurn(turn, 'observed-body-source-revoked', 'The source changed before binding began.');
      return Promise.resolve();
    }
    publish('binding');
    if (active !== turn || disposed) return Promise.resolve();
    turn.pending = bind(turn);
    return turn.pending;
  };

  const projectCurrentBody = async (
    signal?: AbortSignal,
  ): Promise<SavedModelDisplayedTriangleBodyResultV2> => {
    const turn = active;
    if (!turn?.binding) return blocked('observed-body-unbound', 'No current body binding exists.');
    try {
      requireCurrent(turn, signal);
      const result = await waitForCaller(
        projectSavedModelDisplayedTriangleBodyV2(turn.owner, turn.binding, turn.controller.signal),
        signal,
      );
      requireCurrent(turn, signal);
      if (result.status === 'blocked') failTurn(turn, result.code, result.detail);
      return result;
    } catch (error) {
      if (signal !== undefined && abortGetter.call(signal))
        return blocked('observed-body-read-cancelled', reason(error));
      failTurn(turn, 'observed-body-projection-failed', reason(error));
      return blocked('observed-body-projection-failed', reason(error));
    }
  };

  const buildCurrentSavedPlacementPair = async (
    savedPlacementOwner: unknown,
    signal?: AbortSignal,
  ): Promise<BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2> => {
    const turn = active;
    if (!turn?.binding)
      return pairBlocked('observed-body-unbound', 'No current body binding exists.');
    const operation = new AbortController();
    const cancel = () => operation.abort();
    let created: Extract<
      BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2,
      { ok: true }
    > | null = null;
    let retainedUntilChildRevocation = false;
    let removeChildListener: (() => void) | null = null;
    const unlink = () => {
      EventTarget.prototype.removeEventListener.call(turn.controller.signal, 'abort', cancel);
      if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
      removeChildListener?.();
      removeChildListener = null;
    };
    try {
      requireCurrent(turn, signal);
      EventTarget.prototype.addEventListener.call(turn.controller.signal, 'abort', cancel, {
        once: true,
      });
      if (signal)
        EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
      const before = await projectCurrentBody(operation.signal);
      if (before.status === 'blocked') return pairBlocked(before.code, before.detail);
      requireCurrent(turn, signal);
      const handoff = await import(
        'components/cloth-simulation-spike/beta-skirt-canonical-medium-saved-writer-frame-placement-v2'
      );
      const pair = await import(
        'components/cloth-simulation-spike/beta-skirt-personalized-displayed-body-product-placement-v2'
      );
      requireCurrent(turn, signal);
      const result =
        await handoff.buildBetaSkirtCanonicalMediumSavedWriterFrameDisplayedBodyHandoffV2(
          savedPlacementOwner,
          {
            schemaVersion: pair.BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2,
            displayedBodyOwner: turn.owner,
            displayedBodyBinding: turn.binding,
          },
          operation.signal,
        );
      if (result.ok) created = result;
      requireCurrent(turn, signal);
      if (!result.ok) return result;
      const after = await projectCurrentBody(operation.signal);
      if (after.status === 'blocked') throw new Error(after.detail);
      requireCurrent(turn, signal);
      const childLifetime = pair.getBetaSkirtPersonalizedDisplayedBodyProductPlacementLifetimeV2(
        result.owner,
      );
      if (!childLifetime || childLifetime.aborted)
        throw new Error('The saved observed-body pair expired before publication.');
      EventTarget.prototype.addEventListener.call(childLifetime, 'abort', unlink, { once: true });
      removeChildListener = () =>
        EventTarget.prototype.removeEventListener.call(childLifetime, 'abort', unlink);
      retainedUntilChildRevocation = true;
      return result;
    } catch (error) {
      operation.abort();
      if (created) {
        const pair = await import(
          'components/cloth-simulation-spike/beta-skirt-personalized-displayed-body-product-placement-v2'
        );
        pair.disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(created.owner);
      }
      return pairBlocked('saved-observed-pair-handoff-failed', reason(error));
    } finally {
      if (!retainedUntilChildRevocation) unlink();
    }
  };

  const buildCurrentGarmentPair = async (
    kind: GarmentPairKind,
    garmentSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<GarmentPairResult> => {
    const turn = active;
    if (!turn?.binding)
      return garmentPairBlocked('observed-body-unbound', 'No current body binding exists.');
    const operation = new AbortController();
    const cancel = () => operation.abort();
    let created: Extract<GarmentPairResult, { ok: true }> | null = null;
    let pairApi: Awaited<ReturnType<typeof loadGarmentPairHandoff>> | null = null;
    let retainedUntilChildRevocation = false;
    let removeChildListener: (() => void) | null = null;
    const unlink = () => {
      EventTarget.prototype.removeEventListener.call(turn.controller.signal, 'abort', cancel);
      if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
      removeChildListener?.();
      removeChildListener = null;
    };
    try {
      requireCurrent(turn, signal);
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)
        return garmentPairBlocked(
          'invalid-generation',
          'A positive compile generation expectation is required.',
        );
      EventTarget.prototype.addEventListener.call(turn.controller.signal, 'abort', cancel, {
        once: true,
      });
      if (signal)
        EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
      const before = await projectCurrentBody(operation.signal);
      if (before.status === 'blocked') return garmentPairBlocked(before.code, before.detail);
      requireCurrent(turn, signal);
      const pair = await loadGarmentPairHandoff(kind);
      pairApi = pair;
      requireCurrent(turn, signal);
      const result = await pair.build(
        garmentSession,
        {
          expectedGeneration,
          displayedBodyOwner: turn.owner,
          displayedBodyBinding: turn.binding,
        },
        operation.signal,
      );
      if (result.ok) created = result;
      requireCurrent(turn, signal);
      if (!result.ok) return result;
      if (!result.sourceContextBound || result.generation !== expectedGeneration)
        throw new Error(
          'The garment handoff differs from the expected private compile generation.',
        );
      const after = await projectCurrentBody(operation.signal);
      if (after.status === 'blocked') throw new Error(after.detail);
      requireCurrent(turn, signal);
      // This reprojects both fresh garment placement and observed-body bindings after our last await.
      const projected = await pair.project(result.owner, operation.signal);
      requireCurrent(turn, signal);
      if (!projected) throw new Error('The garment/body pair became stale before publication.');
      const childLifetime = pair.lifetime(result.owner);
      if (!childLifetime || childLifetime.aborted)
        throw new Error('The garment/body pair lifetime ended before publication.');
      EventTarget.prototype.addEventListener.call(childLifetime, 'abort', unlink, { once: true });
      removeChildListener = () =>
        EventTarget.prototype.removeEventListener.call(childLifetime, 'abort', unlink);
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      checkSignal(childLifetime);
      retainedUntilChildRevocation = true;
      return result;
    } catch (error) {
      operation.abort();
      if (created) pairApi?.dispose(created.owner);
      return garmentPairBlocked('saved-garment-observed-pair-handoff-failed', reason(error));
    } finally {
      if (!retainedUntilChildRevocation) unlink();
    }
  };

  const buildCurrentSavedGarmentPair = (
    garmentSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) =>
    buildCurrentGarmentPair(
      'legacy',
      garmentSession,
      expectedGeneration,
      signal,
    ) as Promise<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1>;
  const buildCurrentObservedPlacementGarmentPair = (
    garmentSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) =>
    buildCurrentGarmentPair(
      'observed-placement',
      garmentSession,
      expectedGeneration,
      signal,
    ) as Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1>;

  const projectCurrentPlacementTarget = async (
    signal?: AbortSignal,
  ): Promise<SavedModelObservedPlacementTargetResultV1> => {
    const turn = active;
    if (!turn?.binding)
      return Object.freeze({
        ok: false,
        target: null,
        code: 'body-unavailable',
        detail: 'No current body binding exists.',
      });
    try {
      requireCurrent(turn, signal);
      const target = await import(
        'components/cloth-simulation-spike/saved-model-observed-placement-target-v1'
      );
      requireCurrent(turn, signal);
      const projected = await target.projectSavedModelObservedPlacementTargetV1(
        turn.owner,
        turn.binding,
        signal,
      );
      requireCurrent(turn, signal);
      return projected;
    } catch (error) {
      return Object.freeze({
        ok: false,
        target: null,
        code: 'body-unavailable',
        detail: reason(error),
      });
    }
  };

  // This additional fixed dispatcher leaves the legacy V3 projection API/DTO untouched.
  const projectCurrentGenericPlacementTarget = async (
    signal?: AbortSignal,
  ): Promise<SavedModelObservedPlacementTargetResultV1> => {
    const turn = active;
    const binding = turn?.binding;
    if (!turn || !binding) return projectCurrentPlacementTarget(signal);
    let revoke: (() => void) | null = null;
    try {
      requireCurrent(turn, signal);
      const projected = await projectCurrentPlacementTarget(signal);
      requireCurrent(turn, signal);
      if (!projected.ok) return projected;
      if (turn.binding !== binding)
        throw new DOMException(
          'Displayed-body binding changed during target projection.',
          'AbortError',
        );
      const record: GenericTargetCurrentness = {
        session,
        checking: false,
        check(callerSignal) {
          requireCurrent(turn, callerSignal);
          if (turn.binding !== binding || active !== turn || disposed)
            throw new DOMException(
              'Displayed-body target belongs to a previous turn.',
              'AbortError',
            );
        },
      };
      revoke = () => {
        // Do not let a retained historical DTO keep the old session/owner closure alive.
        record.session = null;
        record.check = null;
        genericTargetRecords.delete(record);
      };
      genericTargetWeakSet.call(genericTargetProjections, projected, record);
      // The existing turn release clears these records without adding one abort listener per read.
      genericTargetRecords.add(record);
      requireCurrent(turn, signal);
      if (record.session !== session || !record.check || turn.binding !== binding)
        throw new DOMException('Displayed-body target expired before publication.', 'AbortError');
      return projected;
    } catch (error) {
      revoke?.();
      return Object.freeze({
        ok: false,
        target: null,
        code: 'body-unavailable',
        detail: reason(error),
      });
    }
  };

  const issueCurrentObservedPlacementV3 = async (
    sourceSession: unknown,
    value: CurrentSavedModelObservedPlacementIssueRequestV3,
    signal?: AbortSignal,
  ): Promise<ObservedIssueResult> => {
    const turn = active;
    if (!turn?.binding)
      return observedIssueBlocked('observed-body-unbound', 'No current body binding exists.');
    const operation = new AbortController();
    const cancel = () => operation.abort();
    let created: Extract<ObservedIssueResult, { ok: true }> | null = null;
    let issuerApi:
      | typeof import('components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3')
      | null = null;
    let retained = false;
    let nativeCaller: AbortSignal | undefined;
    let removeChildListener: (() => void) | null = null;
    const unlink = () => {
      EventTarget.prototype.removeEventListener.call(turn.controller.signal, 'abort', cancel);
      if (nativeCaller)
        EventTarget.prototype.removeEventListener.call(nativeCaller, 'abort', cancel);
      removeChildListener?.();
      removeChildListener = null;
    };
    try {
      checkSignal(signal);
      nativeCaller = signal;
      const request = captureObservedIssueRequest(value);
      requireCurrent(turn, signal);
      EventTarget.prototype.addEventListener.call(turn.controller.signal, 'abort', cancel, {
        once: true,
      });
      if (signal)
        EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
      const before = await projectCurrentPlacementTarget(operation.signal);
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!before.ok || before.canonicalSha256 !== request.confirmedTargetSha256)
        return observedIssueBlocked(
          'observed-target-changed',
          'The confirmed target differs from the current observed body.',
        );
      const [source, issuer] = await Promise.all([
        import(
          'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1'
        ),
        import('components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3'),
      ]);
      issuerApi = issuer;
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      const result = await source.issuePatternImportDxfProductSavedAnnularObservedPlacementV3(
        sourceSession,
        {
          ...request,
          displayedBodyOwner: turn.owner,
          displayedBodyBinding: turn.binding,
        },
        operation.signal,
      );
      if (result.ok) created = result;
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!result.ok) return result;
      if (!result.sourceContextBound || result.generation !== request.expectedGeneration)
        throw new Error('Issued placement differs from the private compile generation.');
      const after = await projectCurrentPlacementTarget(operation.signal);
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!after.ok || after.canonicalSha256 !== before.canonicalSha256)
        throw new Error('Observed target changed before issued placement publication.');
      const projected = await issuer.projectObservedPlacementSidecarIssuedV3(
        result.owner,
        operation.signal,
      );
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (
        !projected ||
        projected.document.placementAuthoring.observedTarget.canonicalSha256 !==
          before.canonicalSha256
      )
        throw new Error('The issued placement is not current for this exact observed target.');
      const lifetime = issuer.getObservedPlacementSidecarIssuedLifetimeV3(result.owner);
      if (!lifetime || lifetime.aborted)
        throw new Error('Issued placement lifetime ended before publication.');
      EventTarget.prototype.addEventListener.call(lifetime, 'abort', unlink, { once: true });
      removeChildListener = () =>
        EventTarget.prototype.removeEventListener.call(lifetime, 'abort', unlink);
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      checkSignal(lifetime);
      retained = true;
      return result;
    } catch (error) {
      operation.abort();
      if (created) issuerApi?.disposeObservedPlacementSidecarIssuedV3(created.owner);
      return observedIssueBlocked('observed-placement-issue-handoff-failed', reason(error));
    } finally {
      if (!retained) unlink();
    }
  };

  const buildCurrentObservedPhysicalChild = async (
    kind: 'world' | 'runtime',
    sourceSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<WorldHandoffResult | RuntimeHandoffResult> => {
    const turn = active;
    if (!turn?.binding)
      return worldHandoffBlocked('observed-body-unbound', 'No current body binding exists.');
    const operation = new AbortController();
    const cancel = () => operation.abort();
    let nativeCaller: AbortSignal | undefined;
    let pairApi:
      | typeof import('components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1')
      | null = null;
    let preflightApi:
      | typeof import('components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1')
      | null = null;
    let pairCreated: Extract<
      PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1,
      { ok: true }
    > | null = null;
    let worldCreated: Extract<WorldHandoffResult, { ok: true }> | null = null;
    let runtimeCreated: Extract<RuntimeHandoffResult, { ok: true }> | null = null;
    let runtimeApi:
      | typeof import('components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-runtime-source-v1')
      | null = null;
    let retained = false;
    let removeChildListener: (() => void) | null = null;
    const unlink = () => {
      EventTarget.prototype.removeEventListener.call(turn.controller.signal, 'abort', cancel);
      if (nativeCaller)
        EventTarget.prototype.removeEventListener.call(nativeCaller, 'abort', cancel);
      removeChildListener?.();
      removeChildListener = null;
    };
    const releasePair = () => {
      const pair = pairCreated;
      pairCreated = null;
      if (pair)
        pairApi?.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
          pair.owner,
        );
    };
    const releaseWorld = () => {
      const world = worldCreated;
      worldCreated = null;
      if (world)
        preflightApi?.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          world.owner,
        );
    };
    const childRevoked = () => {
      unlink();
      if (kind === 'runtime') releaseWorld();
      releasePair();
    };
    const releaseRuntime = () => {
      const runtime = runtimeCreated;
      runtimeCreated = null;
      if (runtime)
        runtimeApi?.disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(runtime.owner);
    };
    try {
      checkSignal(signal);
      nativeCaller = signal;
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)
        return worldHandoffBlocked(
          'invalid-generation',
          'A positive compile generation expectation is required.',
        );
      requireCurrent(turn, signal);
      EventTarget.prototype.addEventListener.call(turn.controller.signal, 'abort', cancel, {
        once: true,
      });
      if (nativeCaller)
        EventTarget.prototype.addEventListener.call(nativeCaller, 'abort', cancel, { once: true });
      const [source, pair, preflight] = await Promise.all([
        import(
          'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1'
        ),
        import(
          'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1'
        ),
        import(
          'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1'
        ),
      ]);
      pairApi = pair;
      preflightApi = preflight;
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      const paired = await buildCurrentObservedPlacementGarmentPair(
        sourceSession,
        expectedGeneration,
        operation.signal,
      );
      if (paired.ok) pairCreated = paired;
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!paired.ok) return paired;
      const world =
        await source.buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1(
          sourceSession,
          {
            expectedGeneration,
            observedPairOwner: paired.owner,
            expectedPairReportSha256: paired.report.reportSha256,
          },
          operation.signal,
        );
      if (world.ok) worldCreated = world;
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!world.ok) return world;
      if (!world.sourceContextBound || world.generation !== expectedGeneration)
        throw new Error('World preflight differs from the private compile generation.');
      const fresh =
        await preflight.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          world.owner,
          operation.signal,
        );
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      if (!fresh || fresh.report.reportSha256 !== world.report.reportSha256)
        throw new Error('World preflight changed before publication.');
      let child: Extract<WorldHandoffResult | RuntimeHandoffResult, { ok: true }> = world;
      let lifetime =
        preflight.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
          world.owner,
        );
      if (!lifetime) throw new Error('World preflight lifetime ended before publication.');
      checkSignal(lifetime);
      if (kind === 'runtime') {
        const runtimeModule = await import(
          'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-runtime-source-v1'
        );
        runtimeApi = runtimeModule;
        requireCurrent(turn, signal);
        checkSignal(operation.signal);
        checkSignal(lifetime);
        const runtime =
          await source.buildPatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceV1(
            sourceSession,
            {
              expectedGeneration,
              observedPairOwner: paired.owner,
              expectedPairReportSha256: paired.report.reportSha256,
              worldInitialOwner: world.owner,
              expectedWorldReportSha256: world.report.reportSha256,
            },
            operation.signal,
          );
        if (runtime.ok) runtimeCreated = runtime;
        requireCurrent(turn, signal);
        checkSignal(operation.signal);
        if (!runtime.ok) return runtime;
        if (!runtime.sourceContextBound || runtime.generation !== expectedGeneration)
          throw new Error('Runtime source differs from the private compile generation.');
        const projected =
          await runtimeModule.projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
            runtime.owner,
            operation.signal,
          );
        requireCurrent(turn, signal);
        checkSignal(operation.signal);
        if (!projected || projected.report.reportSha256 !== runtime.report.reportSha256)
          throw new Error('Runtime source changed before publication.');
        lifetime = runtimeModule.getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1(
          runtime.owner,
        );
        if (!lifetime) throw new Error('Runtime source lifetime ended before publication.');
        checkSignal(lifetime);
        child = runtime;
      }
      EventTarget.prototype.addEventListener.call(lifetime, 'abort', childRevoked, { once: true });
      removeChildListener = () =>
        EventTarget.prototype.removeEventListener.call(lifetime, 'abort', childRevoked);
      requireCurrent(turn, signal);
      checkSignal(operation.signal);
      checkSignal(lifetime);
      retained = true;
      return child;
    } catch (error) {
      operation.abort();
      return worldHandoffBlocked(
        kind === 'world'
          ? 'observed-world-preflight-handoff-failed'
          : 'observed-runtime-source-handoff-failed',
        reason(error),
      );
    } finally {
      if (!retained) {
        unlink();
        releaseRuntime();
        releaseWorld();
        releasePair();
      }
    }
  };

  const buildCurrentObservedPlacementWorldInitialPreflight = (
    sourceSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) =>
    buildCurrentObservedPhysicalChild(
      'world',
      sourceSession,
      expectedGeneration,
      signal,
    ) as Promise<WorldHandoffResult>;
  const buildCurrentObservedPlacementRuntimeSource = (
    sourceSession: unknown,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) =>
    buildCurrentObservedPhysicalChild(
      'runtime',
      sourceSession,
      expectedGeneration,
      signal,
    ) as Promise<RuntimeHandoffResult>;

  const runCurrentGenericObserved: GenericReplayDispatch = async (
    frameCount,
    input,
    previous16,
    lease,
    signal,
  ) => {
    const turn = active;
    if (!turn?.binding) return genericReplayBlocked('No current displayed body is bound.');
    const operation = new AbortController();
    let result: CurrentSavedModelGenericObservedReplayResultV1 | null = null;
    let api:
      | typeof import('components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1')
      | null = null;
    let retained = false;
    const cancel = () => operation.abort();
    const unlinks: Array<() => void> = [];
    const unlink = () => {
      unlinks.splice(0).forEach((f) => f());
    };
    const link = (s: AbortSignal) => {
      checkSignal(s);
      unlinks.push(() => EventTarget.prototype.removeEventListener.call(s, 'abort', cancel));
      EventTarget.prototype.addEventListener.call(s, 'abort', cancel, { once: true });
      checkSignal(s);
    };
    try {
      checkSignal(signal);
      const request = captureGenericReplayRequestV1(input);
      const { expectedObservedTarget, ...numeric } = request;
      if (
        !expectedObservedTarget ||
        Object.keys(expectedObservedTarget).sort().join(',') !== 'canonicalSha256,target'
      )
        throw new TypeError('Exact expected observed target required.');
      link(turn.controller.signal);
      if (signal) link(signal);
      requireCurrent(turn, operation.signal);
      const targetModule = await import(
        'components/cloth-simulation-spike/saved-model-observed-placement-target-v1'
      );
      requireCurrent(turn, operation.signal);
      const checked = await targetModule.validateSavedModelObservedPlacementTargetV1(
        expectedObservedTarget.target,
        expectedObservedTarget.canonicalSha256,
        operation.signal,
      );
      requireCurrent(turn, operation.signal);
      if (!checked.ok) throw new Error(checked.detail);
      const match = async () => {
        const projected = await projectCurrentPlacementTarget(operation.signal);
        requireCurrent(turn, operation.signal);
        if (
          !projected.ok ||
          projected.canonicalSha256 !== checked.canonicalSha256 ||
          patternImportDxfProductPlacementWireCodecV1.canonical(projected.target) !==
            patternImportDxfProductPlacementWireCodecV1.canonical(checked.target)
        )
          throw new Error('Current observed target differs from explicit physical initialization.');
      };
      await match();
      requireCurrent(turn, operation.signal);
      api = await import('components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1');
      requireCurrent(turn, operation.signal);
      const fixedRequest = { ...numeric, bodyOwner: turn.owner, bodyBinding: turn.binding };
      result =
        frameCount === 16
          ? await api.runDxfGarmentObservedWebgpu16ReplayV1(fixedRequest, lease, operation.signal)
          : await api.runDxfGarmentObservedWebgpu32ReplayV1(
              fixedRequest,
              previous16,
              lease,
              operation.signal,
            );
      requireCurrent(turn, operation.signal);
      if (!result.ok || !result.owner) return result;
      await match();
      requireCurrent(turn, operation.signal);
      const lifetime = api.getDxfGarmentObservedWebgpuReplayLifetimeV1(result.owner);
      if (!lifetime) throw new Error('Numeric replay expired before body-session publication.');
      unlinks.push(() => EventTarget.prototype.removeEventListener.call(lifetime, 'abort', unlink));
      EventTarget.prototype.addEventListener.call(lifetime, 'abort', unlink, { once: true });
      requireCurrent(turn, operation.signal);
      checkSignal(lifetime);
      retained = true;
      return result;
    } catch (error) {
      operation.abort();
      if (result?.owner) api?.disposeDxfGarmentObservedWebgpuReplayV1(result.owner);
      return Object.freeze({
        ok: false,
        owner: null,
        report: result?.report ?? null,
        blockers: Object.freeze([reason(error)]),
      });
    } finally {
      if (!retained) {
        operation.abort();
        unlink();
      }
    }
  };

  const session = Object.freeze({
    /** Stable useSyncExternalStore identity. Reading this does not claim freshness. */
    getSnapshot: () => store,
    subscribe(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    observe,
    /** Directly assignable to the existing picker callback; failures remain in this store. */
    onDisplayedBodyInputV1(input: ModelDisplayedTriangleBodyOwnedInputV1 | null) {
      void observe(input);
    },
    projectCurrentBody,
    projectCurrentPlacementTarget,
    issueCurrentObservedPlacementV3,
    buildCurrentSavedPlacementPair,
    buildCurrentSavedGarmentPair,
    buildCurrentObservedPlacementGarmentPair,
    buildCurrentObservedPlacementWorldInitialPreflight,
    buildCurrentObservedPlacementRuntimeSource,
    dispose() {
      if (disposed) return false;
      disposed = true;
      generation += 1;
      release();
      publish('disposed');
      listeners.clear();
      return true;
    },
  });
  genericReplaySessions.set(session, runCurrentGenericObserved);
  genericTargetSessions.set(session, projectCurrentGenericPlacementTarget);
  sessions.set(session, buildCurrentSavedPlacementPair);
  garmentPairSessions.set(session, buildCurrentSavedGarmentPair);
  observedPlacementGarmentPairSessions.set(session, buildCurrentObservedPlacementGarmentPair);
  placementIssueSessions.set(session, issueCurrentObservedPlacementV3);
  worldPreflightSessions.set(session, buildCurrentObservedPlacementWorldInitialPreflight);
  runtimeSourceSessions.set(session, buildCurrentObservedPlacementRuntimeSource);
  return session;
}

export type SavedModelDisplayedTriangleBodySessionV2 = ReturnType<
  typeof createSavedModelDisplayedTriangleBodySessionV2
>;
