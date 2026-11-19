import { projectSavedFullAssemblyAoOnlySnapshotV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-component-v1';
import type { DxfGarmentObservedBoundaryEdgeV1 } from './dxf-garment-observed-unsewn-edges-v1';
import type {
  DxfGarmentObservedPreviewSeamSideV1,
  DxfGarmentObservedPreviewSurfacePointV1,
} from './dxf-garment-observed-strain-heatmap-preview-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type {
  DxfExactAssemblyGraphV1,
  DxfExactAssemblyGraphAoSnapshotV1,
} from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import {
  createSavedFullAssemblyCompileSessionV1,
  type SavedFullAssemblyCompileRequestV1,
  type SavedFullAssemblyCompileResultV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1';
import {
  SavedFullAssemblySnapshotErrorV1,
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-snapshot-production-v1';
import {
  fingerprintDxfExactAssemblyGraphV1,
  projectDxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationProjectionResultV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import {
  inspectOwnedActiveXpbdDeviceLeaseV1,
  type XpbdDeviceLease,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import {
  projectCurrentSavedModelGenericObservedTargetV1,
  isCurrentSavedModelGenericObservedTargetV1,
  runCurrentSavedModelGenericObserved16V1,
  runCurrentSavedModelGenericObserved32V1,
  type CurrentSavedModelGenericObservedReplayRequestV1,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import type {
  DxfGarmentObservedWebgpuReplayOwnerV1,
  DxfGarmentObservedWebgpuReplayReportV1,
} from './dxf-garment-observed-webgpu-replay-v1';

import {
  projectSavedGenericObservedSourceGeometryV1,
  type SavedGenericObservedSourceGeometryV1,
} from './saved-generic-observed-source-geometry-v1';

export const SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_V1 =
  'saved-generic-observed-physical-host/1' as const;
/** A single explicit numeric profile; no UI-provided solver/budget override is accepted. */
export const SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1 = Object.freeze({
  parameters: Object.freeze({
    dtS: 1 / 120,
    solverIterations: 8,
    gravityMps2Y: -9.81,
    windAccelerationMps2Z: 0,
    distanceComplianceMPerN: 2e-7,
    seamComplianceMPerN: 1e-8,
  }),
  coreBudgets: Object.freeze({
    maxParticles: 2000,
    maxTriangles: 5000,
    maxConstraintCount: 120000,
    maxGpuBytes: 128 * 1024 * 1024,
    maxDispatches: 1000000,
    maxConstraintInvocations: 500000000,
    maxWorkgroupsPerDispatch: 65535,
  }),
  executionBudgets: Object.freeze({
    maxGpuBytes: 512 * 1024 * 1024,
    maxCpuBytes: 512 * 1024 * 1024,
    maxDispatches: 1000000,
    maxPaddedInvocations: 1000000000,
    maxContactTriangleVisits: 500000000,
    maxCopyBytes: 1024 * 1024 * 1024,
    maxCopies: 1000000,
    maxSubmissions: 33,
  }),
  timeoutMs: 300000,
});
const CLAIMS = Object.freeze({
  genuineSavedNativeCompileSessionOwned: true,
  fixedProductionFreshSnapshotReader: true,
  numericDiagnosticOnly: true,
  durableGraphVerified: false,
  physicalInitializationPersisted: false,
  productAuthority: false,
  runtimeAuthority: false,
  fitQualified: false,
  stressPaComputed: false,
});
/** Deliberately not an injectable boolean/receipt parser. TABLE must provide a fixed registry-backed
 * fresh reader for graph + physical document + outer CAS bytes. On first save the outer SHA changes:
 * obtain a NEW native source/generation and replay the complete persisted intent with identical
 * compileInputSHA. Never rebind the old session by replacing its expected snapshot SHA. */
export const SAVED_GENERIC_OBSERVED_DURABLE_ADMISSION_V1 = Object.freeze({
  available: false,
  code: 'durable-full-graph-and-physical-initialization-reader-unavailable',
  requiredIntegration:
    'TABLE fixed fresh durable graph/physical-initialization receipt reader; complete post-save native/source replay',
});
type ReplayApi = typeof import('./dxf-garment-observed-webgpu-replay-v1');
type Preview = Awaited<
  ReturnType<
    (typeof import('./dxf-garment-observed-strain-heatmap-preview-v1'))['createDxfGarmentObservedStrainHeatmapPreviewV1']
  >
>;
type Status =
  | 'idle'
  | 'compiling'
  | 'compiled'
  | 'binding-initialization'
  | 'initialization-bound'
  | 'running16'
  | 'running32'
  | 'frame16-ready'
  | 'frame32-ready'
  | 'preview-ready'
  | 'blocked'
  | 'disposed';
export type SavedGenericObservedPhysicalHostSnapshotV1 = Readonly<{
  version: typeof SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_V1;
  status: Status;
  sourceGeneration: number;
  initializationSha256: string | null;
  targetSha256: string | null;
  frame16Report: DxfGarmentObservedWebgpuReplayReportV1 | null;
  frame32Report: DxfGarmentObservedWebgpuReplayReportV1 | null;
  previewReceipt: Preview['receipt'] | null;
  cleanupPending: boolean;
  detail: string | null;
  durableAdmission: typeof SAVED_GENERIC_OBSERVED_DURABLE_ADMISSION_V1;
  claims: typeof CLAIMS;
}>;
const abortGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener,
  remove = EventTarget.prototype.removeEventListener;
const isAborted = (s: AbortSignal) => abortGetter.call(s) as boolean;
function checkSignal(s?: AbortSignal) {
  if (s !== undefined && isAborted(s))
    throw new DOMException('Generic physical operation cancelled.', 'AbortError');
}
function exact(input: unknown, keys: readonly string[]) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    throw new TypeError('Exact own data request required.');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(ds).length !== keys.length ||
    keys.some((k) => !ds[k]?.enumerable || !('value' in ds[k]))
  )
    throw new TypeError('Request accessors/extra fields refused.');
  return Object.fromEntries(keys.map((k) => [k, ds[k].value]));
}
function capture<T>(input: T): T {
  let nodes = 0,
    chars = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 500000 || depth > 48) throw new TypeError('Input exceeds shape bound.');
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      chars += v.length;
      if (v.length > 65536 || chars > 16 * 1024 * 1024)
        throw new TypeError('Input exceeds text bound.');
      return v;
    }
    if (!v || typeof v !== 'object' || active.has(v))
      throw new TypeError('Finite plain acyclic data required.');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype))
      throw new TypeError('Opaque/binary values are not metadata.');
    const ds = Object.getOwnPropertyDescriptors(v);
    if (array && (ds.length.value > 250000 || Reflect.ownKeys(ds).length !== ds.length.value + 1))
      throw new TypeError('Dense bounded array required.');
    active.add(v);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of Reflect.ownKeys(ds)) {
      if (array && key === 'length') continue;
      const d = ds[key as string];
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !d.enumerable ||
        !('value' in d) ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        throw new TypeError('Metadata getters/extras refused.');
      Object.defineProperty(out, key, { value: copy(d.value, depth + 1), enumerable: true });
    }
    active.delete(v);
    return out;
  };
  return copy(input, 0) as T;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
function link(parent: AbortSignal | undefined, child: AbortController): () => void {
  checkSignal(parent);
  if (!parent) return () => {};
  const cancel = () => child.abort();
  add.call(parent, 'abort', cancel, { once: true });
  if (isAborted(parent)) child.abort();
  return () => remove.call(parent, 'abort', cancel);
}
/** Cancels only this wait; every late queue outcome stays observed. */
function localWait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    let cancel: () => void;
    const finish = (f: () => void) => {
      if (done) return;
      done = true;
      remove.call(signal, 'abort', cancel);
      f();
    };
    cancel = () => finish(() => reject(new DOMException('Host wait cancelled.', 'AbortError')));
    work.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
    add.call(signal, 'abort', cancel, { once: true });
    if (isAborted(signal)) cancel();
  });
}
function reason(e: unknown) {
  return e instanceof Error ? e.message.slice(0, 2048) : 'Generic physical operation failed.';
}
const failed = (e: unknown) => Object.freeze({ ok: false as const, detail: reason(e) });

type AuthoringObservedTarget = Extract<
  Awaited<ReturnType<typeof projectCurrentSavedModelGenericObservedTargetV1>>,
  { ok: true }
>;
export type SavedGenericObservedPhysicalHostAuthoringContextResultV1 =
  | Readonly<{
      ok: true;
      sourceGeneration: number;
      graph: DxfExactAssemblyGraphV1;
      graphCanonicalSha256: string;
      compileInputSha256: string;
      observedTarget: Readonly<{
        target: AuthoringObservedTarget['target'];
        canonicalSha256: string;
      }>;
      sourceGeometry: SavedGenericObservedSourceGeometryV1;
      claims: typeof CLAIMS;
    }>
  | Readonly<{ ok: false; detail: string }>;
type AuthoringProjector = (
  expectedGeneration: number,
  signal?: AbortSignal,
) => Promise<SavedGenericObservedPhysicalHostAuthoringContextResultV1>;
const authoringHosts = new WeakMap<object, AuthoringProjector>();
/** Fixed factory registry dispatch, including first authoring before initialization is bound.
 * No property or method on the supplied host is inspected or called. */
export function projectSavedGenericObservedPhysicalHostAuthoringContextV1(
  host: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<SavedGenericObservedPhysicalHostAuthoringContextResultV1> {
  const project = host && typeof host === 'object' ? authoringHosts.get(host) : undefined;
  return project
    ? project(expectedGeneration, signal)
    : Promise.resolve(failed(new Error('A genuine live saved generic physical host is required.')));
}

export const SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_PERSISTENCE_CONTEXT_V1 =
  'saved-generic-observed-physical-host-persistence-context/1' as const;
const PERSISTENCE_CONTEXT_CLAIMS = Object.freeze({
  freshAtReadPublicationOnly: true,
  durableGraphVerified: false,
  physicalInitializationPersisted: false,
  productAuthority: false,
  runtimeAuthority: false,
});
/** Detached fresh-read evidence. This DTO cannot authenticate a host or authorize a write. */
export type SavedGenericObservedPhysicalHostPersistenceContextV1 = Readonly<{
  schemaVersion: typeof SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_PERSISTENCE_CONTEXT_V1;
  sourceGeneration: number;
  graph: DxfExactAssemblyGraphV1;
  graphCanonicalSha256: string;
  compileInputSha256: string;
  physicalInitialization: Readonly<{
    document: DxfGarmentPhysicalInitializationV1;
    canonicalSha256: string;
  }>;
  assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
  /** Ephemeral same-read join only. Never persist this digest inside its own outer component. */
  readEvidence: Readonly<{ fullAssemblySnapshotSha256: string }>;
  claims: typeof PERSISTENCE_CONTEXT_CLAIMS;
}>;
export type SavedGenericObservedPhysicalHostPersistenceContextResultV1 =
  | Readonly<{ ok: true; context: SavedGenericObservedPhysicalHostPersistenceContextV1 }>
  | Readonly<{
      ok: false;
      code:
        | 'unrecognized-host'
        | 'stale-generation'
        | 'initialization-unbound'
        | 'context-unavailable';
      detail: string;
    }>;
type PersistenceProjector = (
  expectedGeneration: number,
  signal?: AbortSignal,
) => Promise<SavedGenericObservedPhysicalHostPersistenceContextResultV1>;
const persistenceHosts = new WeakMap<object, PersistenceProjector>();
const persistenceContexts = new WeakMap<
  object,
  Readonly<{ host: object; current: () => void; retained: Set<object> }>
>();
class PersistenceContextFailure extends Error {
  constructor(
    readonly code: Extract<
      SavedGenericObservedPhysicalHostPersistenceContextResultV1,
      { ok: false }
    >['code'],
    detail: string,
  ) {
    super(detail);
  }
}
/** Resolves only a factory-retained closure; no property on the supplied object is read. */
export function projectSavedGenericObservedPhysicalHostPersistenceContextV1(
  host: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<SavedGenericObservedPhysicalHostPersistenceContextResultV1> {
  const project = host && typeof host === 'object' ? persistenceHosts.get(host) : undefined;
  return project
    ? project(expectedGeneration, signal)
    : Promise.resolve(
        Object.freeze({
          ok: false as const,
          code: 'unrecognized-host' as const,
          detail: 'A genuine live saved generic physical host is required.',
        }),
      );
}

/** Local in-process currentness of the exact published context identity only. This does not
 * authenticate mutated DTO fields or re-read server/AO/outer state; a successful CAS may change
 * the outer bytes without changing this local binding. The writer must perform its own fresh read. */
export function isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1(
  host: unknown,
  context: unknown,
  signal?: AbortSignal,
): boolean {
  if (!host || typeof host !== 'object' || !context || typeof context !== 'object') return false;
  const record = persistenceContexts.get(context);
  if (!record || record.host !== host || !persistenceHosts.has(host)) return false;
  try {
    checkSignal(signal);
    record.current();
    checkSignal(signal);
    // The authentic body poll can synchronously dispose/rebind the host or revoke this record.
    return persistenceContexts.get(context) === record && persistenceHosts.has(host);
  } catch {
    // A caller-local cancellation or invalid signal never revokes an otherwise current context.
    try {
      checkSignal(signal);
    } catch {
      return false;
    }
    persistenceContexts.delete(context);
    record.retained.delete(context);
    return false;
  }
}

/** Owns one real fixed source session. No source/session/reader/executor callback can be injected. */
export function createSavedGenericObservedPhysicalHostV1(
  input: Readonly<{ row: DxfProductSavedRowIdentityV1; bodySession: unknown }>,
) {
  const fields = exact(input, ['row', 'bodySession']),
    row = capture(fields.row) as DxfProductSavedRowIdentityV1,
    bodySession = fields.bodySession;
  const source = createSavedFullAssemblyCompileSessionV1();
  let disposed = false,
    epoch = 0,
    sourceController = new AbortController(),
    sourceUnlink = () => {};
  let sourceGeneration = 0,
    seed = 0,
    latest: SavedFullAssemblyCompileResultV1 | null = null;
  let initialization: DxfGarmentPhysicalInitializationProjectionResultV1 | null = null;
  let replayApi: ReplayApi | null = null;
  let frame16: DxfGarmentObservedWebgpuReplayOwnerV1 | null = null,
    frame32: DxfGarmentObservedWebgpuReplayOwnerV1 | null = null,
    lease16: XpbdDeviceLease | null = null;
  let preview: {
    view: Preview;
    canvas: HTMLCanvasElement;
    frame: DxfGarmentObservedWebgpuReplayOwnerV1;
  } | null = null;
  let unlinkPreview: (() => void) | null = null;
  const childUnlinks = new Map<DxfGarmentObservedWebgpuReplayOwnerV1, () => void>();
  let pendingDrain: Promise<void> | null = null;
  let operation: {
    kind: 'compile' | 'physical';
    controller: AbortController;
    finished: Promise<void>;
  } | null = null;
  const listeners = new Set<() => void>();
  let persistenceHostIdentity: object | null = null;
  const retainedPersistenceContexts = new Set<object>();
  const releasePersistenceContexts = () => {
    for (const context of retainedPersistenceContexts) persistenceContexts.delete(context);
    retainedPersistenceContexts.clear();
  };
  let snapshot: SavedGenericObservedPhysicalHostSnapshotV1 = Object.freeze({
    version: SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_V1,
    status: 'idle',
    sourceGeneration: 0,
    initializationSha256: null,
    targetSha256: null,
    frame16Report: null,
    frame32Report: null,
    previewReceipt: null,
    cleanupPending: false,
    detail: null,
    durableAdmission: SAVED_GENERIC_OBSERVED_DURABLE_ADMISSION_V1,
    claims: CLAIMS,
  });
  const publish = (change: Partial<SavedGenericObservedPhysicalHostSnapshotV1>) => {
    snapshot = Object.freeze({ ...snapshot, ...change, sourceGeneration });
    for (const listener of [...listeners])
      try {
        listener();
      } catch {
        /* views cannot prevent cleanup */
      }
  };
  const releasePreview = () => {
    const old = preview;
    preview = null;
    unlinkPreview?.();
    unlinkPreview = null;
    old?.view.dispose();
  };
  const releaseFrame = (owner: DxfGarmentObservedWebgpuReplayOwnerV1 | null) => {
    if (!owner) return;
    childUnlinks.get(owner)?.();
    childUnlinks.delete(owner);
    replayApi?.disposeDxfGarmentObservedWebgpuReplayV1(owner);
  };
  const releaseFrames = () => {
    const a = frame32,
      b = frame16;
    frame32 = null;
    frame16 = null;
    lease16 = null;
    for (const unlink of childUnlinks.values()) unlink();
    childUnlinks.clear();
    try {
      releasePreview();
    } finally {
      if (a) replayApi?.disposeDxfGarmentObservedWebgpuReplayV1(a);
      if (b) replayApi?.disposeDxfGarmentObservedWebgpuReplayV1(b);
    }
  };
  const check = (signal?: AbortSignal, expectedEpoch = epoch) => {
    checkSignal(signal);
    checkSignal(sourceController.signal);
    if (disposed || expectedEpoch !== epoch)
      throw new DOMException('Saved generic generation changed.', 'AbortError');
    const s = source.snapshot();
    if (s.disposed || (sourceGeneration > 0 && s.generation !== sourceGeneration))
      throw new Error('Private source generation changed.');
    checkSignal(signal);
  };
  const revokePhysical = () => {
    releasePersistenceContexts();
    releaseFrames();
    initialization = null;
  };
  async function work<T>(
    kind: 'compile' | 'physical',
    signal: AbortSignal | undefined,
    action: (
      s: AbortSignal,
      check: () => void,
      retainUntil: (lifetime: AbortSignal) => void,
    ) => Promise<T>,
  ): Promise<T> {
    checkSignal(signal);
    if (disposed) throw new Error('Host is disposed.');
    if (operation || pendingDrain)
      throw new Error('Host is busy or submitted GPU work is still draining.');
    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((r) => {
      finish = r;
    });
    const op = { kind, controller, finished };
    operation = op;
    const unlinks: Array<() => void> = [];
    const expectedEpoch = epoch;
    let held: AbortSignal | null = null;
    const unlink = () => {
      unlinks.splice(0).forEach((f) => f());
    };
    const retainUntil = (lifetime: AbortSignal) => {
      checkSignal(lifetime);
      if (held) throw new Error('Work already retained.');
      held = lifetime;
      unlinks.push(() => remove.call(lifetime, 'abort', unlink));
      add.call(lifetime, 'abort', unlink, { once: true });
      checkSignal(lifetime);
    };
    const current = () => {
      checkSignal(controller.signal);
      if (disposed || operation !== op || epoch !== expectedEpoch)
        throw new DOMException('Host operation changed.', 'AbortError');
    };
    try {
      unlinks.push(link(signal, controller));
      unlinks.push(link(sourceController.signal, controller));
      current();
      return await action(controller.signal, current, retainUntil);
    } finally {
      if (!held || isAborted(held) || isAborted(controller.signal)) unlink();
      if (operation === op) operation = null;
      finish();
    }
  }
  const clearLostSource = (controller: AbortController, expectedEpoch: number, detail: string) => {
    if (disposed || sourceController !== controller || epoch !== expectedEpoch) return;
    revokePhysical();
    if (disposed || sourceController !== controller || epoch !== expectedEpoch) return;
    latest = null;
    publish({
      status: 'blocked',
      detail,
      initializationSha256: null,
      targetSha256: null,
      previewReceipt: null,
    });
  };
  const sourceLost = (detail: string) => {
    const lostController = sourceController,
      lostEpoch = epoch;
    releasePersistenceContexts();
    sourceUnlink();
    lostController.abort();
    clearLostSource(lostController, lostEpoch, detail);
  };
  async function fresh(signal: AbortSignal, current: () => void) {
    current();
    check(signal);
    const value = await source.projectLatest(sourceGeneration, signal);
    current();
    check(signal);
    if (
      !value.compiled ||
      !value.compileRequest ||
      !value.compileResult?.compiled ||
      !value.graph ||
      !value.evidence
    ) {
      const detail =
        'Fresh genuine source unavailable: ' + value.blockers.map((x) => x.detail).join('; ');
      if (!source.snapshot().hasArtifact) sourceLost(detail);
      throw new Error(detail);
    }
    if (
      !latest?.evidence ||
      canonical(value.evidence) !== canonical(latest.evidence) ||
      value.compileResult.artifact.sourceEvidence.inputSha256 !==
        latest.compileResult?.artifact?.sourceEvidence.inputSha256
    ) {
      sourceLost('Fresh source content changed.');
      throw new Error('Fresh source content changed.');
    }
    let receipt: Awaited<ReturnType<typeof readSavedFullAssemblySnapshotV1>>;
    try {
      receipt = await readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: seed }, signal);
    } catch (error) {
      current();
      check(signal);
      if (
        error instanceof SavedFullAssemblySnapshotErrorV1 &&
        ['row-drift', 'assembly-drift', 'join-drift'].includes(error.code)
      )
        sourceLost(error.message);
      throw error;
    }
    try {
      current();
      check(signal);
      const assemblySnapshot = projectSavedFullAssemblySnapshotV1(receipt);
      if (
        canonical(assemblySnapshot.row) !== canonical(row) ||
        assemblySnapshot.snapshotSha256 !== value.evidence.fullAssemblySnapshotSha256 ||
        assemblySnapshot.serverAssemblyRevision !== value.evidence.serverAssemblyRevision
      ) {
        sourceLost('Fresh AO/row/outer provenance changed.');
        throw new Error('Fresh AO/row/outer provenance changed.');
      }
      current();
      return {
        value,
        assemblySnapshot: projectSavedFullAssemblyAoOnlySnapshotV1(assemblySnapshot),
      };
    } finally {
      disposeSavedFullAssemblySnapshotV1(receipt);
    }
  }
  async function target(signal?: AbortSignal) {
    const value = await projectCurrentSavedModelGenericObservedTargetV1(bodySession, signal);
    if (!value.ok) throw new Error(value.detail);
    return value;
  }
  const matchTarget = async (
    document: DxfGarmentPhysicalInitializationV1,
    signal: AbortSignal,
    current: () => void,
  ) => {
    const value = await target(signal);
    current();
    check(signal);
    if (
      value.canonicalSha256 !== document.observedTarget.canonicalSha256 ||
      canonical(value.target) !== canonical(document.observedTarget.target)
    )
      throw new Error('Explicit initialization targets a different current body.');
    return value;
  };
  async function prepare(signal: AbortSignal, current: () => void, replay: ReplayApi) {
    if (!initialization) throw new Error('Explicit initialization is not bound.');
    const old = initialization,
      { value, assemblySnapshot } = await fresh(signal, current);
    const projected = await projectDxfGarmentPhysicalInitializationV1(
      {
        document: old.document,
        graph: value.graph!,
        assemblySnapshot,
        sourceRequest: value.compileRequest!,
        sourceArtifact: value.compileResult!.artifact!,
      },
      signal,
    );
    current();
    check(signal);
    if (
      projected.canonicalSha256 !== old.canonicalSha256 ||
      !projected.placementResult.ok ||
      !projected.placementResult.artifact.sealedSimulation
    )
      throw new Error('Explicit placement changed or is not sealed.');
    await matchTarget(projected.document, signal, current);
    const placed = projected.placementResult.artifact;
    const { buildGarmentMaterialRunPlanV1, GARMENT_MATERIAL_RUN_PLAN_V1 } = await import(
      'lib/cloth/runtime/webgpu/garment-material-run-plan-v1'
    );
    current();
    const planned = await buildGarmentMaterialRunPlanV1(
      {
        schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
        sealedSimulation: placed.sealedSimulation!,
        expectedPackageSha256: placed.sealedSimulation!.seal.aggregateSha256,
        pieceRanges: placed.localSourceArtifact.refinement.mesh.pieceRanges,
        parameters: { ...SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.parameters, frameCount: 16 },
        budgets: SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.coreBudgets,
      },
      signal,
    );
    current();
    check(signal);
    if (!planned.ok) throw new Error(planned.blockers.map((x) => x.detail).join('; '));
    return {
      projected,
      request: {
        schemaVersion: replay.DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
        profile: replay.DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1,
        placementRequest: projected.placementRequest,
        hostCompileGeneration: sourceGeneration,
        parameters: SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.parameters,
        coreBudgets: SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.coreBudgets,
        executionBudgets: SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.executionBudgets,
        timeoutMs: SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.timeoutMs,
        expected: {
          placementReportSha256: placed.report.reportSha256,
          prefixPlanSha256: planned.plan.planSha256,
        },
        expectedObservedTarget: projected.document.observedTarget,
      } satisfies CurrentSavedModelGenericObservedReplayRequestV1,
    };
  }
  const frameLifetime = (owner: DxfGarmentObservedWebgpuReplayOwnerV1, current: () => void) => {
    const lifetime = replayApi?.getDxfGarmentObservedWebgpuReplayLifetimeV1(owner);
    current();
    if (!lifetime) throw new Error('Frame lifetime expired.');
    checkSignal(lifetime);
    return lifetime;
  };
  const retain = (owner: DxfGarmentObservedWebgpuReplayOwnerV1, current: () => void) => {
    const lifetime = frameLifetime(owner, current);
    if (!lifetime) throw new Error('Frame lifetime expired.');
    const invalidate = () => {
      releasePersistenceContexts();
      releaseFrames();
      initialization = null;
      if (!disposed)
        publish({
          status: 'blocked',
          initializationSha256: null,
          targetSha256: null,
          previewReceipt: null,
          detail: 'Current body/device or caller lifetime ended.',
        });
    };
    childUnlinks.set(owner, () => remove.call(lifetime, 'abort', invalidate));
    add.call(lifetime, 'abort', invalidate, { once: true });
    checkSignal(lifetime);
    current();
    return lifetime;
  };
  async function run(frame: 16 | 32, lease: XpbdDeviceLease, signal?: AbortSignal) {
    let accepted = false;
    let terminal: DxfGarmentObservedWebgpuReplayReportV1 | null = null;
    try {
      return await work('physical', signal, async (s, current, retainUntil) => {
        check(s);
        const inspection = inspectOwnedActiveXpbdDeviceLeaseV1(lease);
        if (!inspection.ok) throw new Error('A genuine active borrowed device lease is required.');
        if (frame === 32 && (!frame16 || lease16 !== lease))
          throw new Error('32 requires current private16 on the same borrowed lease.');
        accepted = true;
        if (frame === 16) releaseFrames();
        else {
          releasePreview();
          releaseFrame(frame32);
          frame32 = null;
        }
        publish({
          status: frame === 16 ? 'running16' : 'running32',
          previewReceipt: null,
          detail: null,
        });
        current();
        const replay = replayApi ?? (await import('./dxf-garment-observed-webgpu-replay-v1'));
        current();
        replayApi = replay;
        const prepared = await prepare(s, current, replay);
        current();
        const result =
          frame === 16
            ? await runCurrentSavedModelGenericObserved16V1(bodySession, prepared.request, lease, s)
            : await runCurrentSavedModelGenericObserved32V1(
                bodySession,
                prepared.request,
                frame16,
                lease,
                s,
              );
        terminal = result.report;
        let child = result.owner;
        try {
          // The numeric executor has drained its normal submission path before successful return.
          // Failed cancellation may retain submitted work; explicitly wait on the SAME borrowed queue.
          const drain = Promise.race([
            inspection.queue.onSubmittedWorkDone(),
            inspection.lost.then(() => {
              throw new Error('Borrowed device lost while draining.');
            }),
          ]);
          pendingDrain = drain;
          publish({ cleanupPending: true });
          const drained = () => {
            if (pendingDrain === drain) {
              pendingDrain = null;
              publish({ cleanupPending: false });
            }
          };
          void drain.then(drained, drained);
          await localWait(drain, s);
          current();
          inspection.assertActive();
          await fresh(s, current);
          await matchTarget(prepared.projected.document, s, current);
          current();
          check(s);
          if (!result.ok || !child) {
            publish({
              status: 'blocked',
              detail: result.blockers.join('; '),
              ...(frame === 16
                ? { frame16Report: result.report }
                : { frame32Report: result.report }),
            });
            return {
              ok: false as const,
              report: result.report,
              detail: result.blockers.join('; '),
            };
          }
          const childLifetime = retain(child, current);
          retainUntil(childLifetime);
          current();
          if (frame === 16) {
            frame16 = child;
            lease16 = lease;
          } else frame32 = child;
          child = null;
          publish({
            status: frame === 16 ? 'frame16-ready' : 'frame32-ready',
            ...(frame === 16 ? { frame16Report: result.report } : { frame32Report: result.report }),
          });
          current();
          frameLifetime(frame === 16 ? frame16! : frame32!, current);
          return { ok: true as const, report: result.report, claims: CLAIMS };
        } finally {
          if (child) replay.disposeDxfGarmentObservedWebgpuReplayV1(child);
        }
      });
    } catch (e) {
      if (accepted) releaseFrames();
      if (accepted && !disposed)
        publish({
          status: 'blocked',
          detail: reason(e),
          previewReceipt: null,
          ...(frame === 16 ? { frame16Report: terminal } : { frame32Report: terminal }),
        });
      return { ...failed(e), report: terminal };
    }
  }
  const projectPersistenceContext: PersistenceProjector = async (expectedGeneration, signal) => {
    let bound: DxfGarmentPhysicalInitializationProjectionResultV1 | null = null;
    let currentTarget: Awaited<ReturnType<typeof target>> | null = null;
    const expectedEpoch = epoch;
    const bodyLost = (detail: string) => {
      check(signal, expectedEpoch);
      if (!bound || initialization !== bound || sourceGeneration !== expectedGeneration) return;
      revokePhysical();
      // Child cleanup may synchronously replace or dispose this host generation.
      check(signal, expectedEpoch);
      if (sourceGeneration !== expectedGeneration) return;
      publish({
        status: 'blocked',
        detail,
        initializationSha256: null,
        targetSha256: null,
        previewReceipt: null,
      });
    };
    const publicationCurrent = () => {
      check(signal, expectedEpoch);
      if (!bound || initialization !== bound || sourceGeneration !== expectedGeneration)
        throw new PersistenceContextFailure(
          'stale-generation',
          'The bound initialization or private source generation changed.',
        );
      if (
        currentTarget &&
        !isCurrentSavedModelGenericObservedTargetV1(bodySession, currentTarget, signal)
      ) {
        // Local cancellation/reentrancy must not erase a newer or otherwise valid binding.
        check(signal, expectedEpoch);
        bodyLost('The genuine observed target projection is no longer current.');
        throw new Error('The genuine observed target projection is no longer current.');
      }
      // The genuine currentness poll may call the host observation reader synchronously.
      check(signal, expectedEpoch);
      if (initialization !== bound || sourceGeneration !== expectedGeneration)
        throw new PersistenceContextFailure('stale-generation', 'Host changed during body poll.');
    };
    try {
      const result = await work('physical', signal, async (s, current) => {
        if (
          !Number.isSafeInteger(expectedGeneration) ||
          expectedGeneration < 1 ||
          expectedGeneration !== sourceGeneration
        )
          throw new PersistenceContextFailure('stale-generation', 'Stale source generation.');
        bound = initialization;
        if (!bound)
          throw new PersistenceContextFailure(
            'initialization-unbound',
            'A current successfully bound physical initialization is required.',
          );
        const initial = bound;
        const stillBound = () => {
          current();
          check(s, expectedEpoch);
          publicationCurrent();
          current();
        };
        const before = await localWait(fresh(s, stillBound), s);
        stillBound();
        const projected = await projectDxfGarmentPhysicalInitializationV1(
          {
            document: initial.document,
            graph: before.value.graph!,
            assemblySnapshot: before.assemblySnapshot,
            sourceRequest: before.value.compileRequest!,
            sourceArtifact: before.value.compileResult!.artifact!,
          },
          s,
        );
        stillBound();
        if (
          projected.canonicalSha256 !== initial.canonicalSha256 ||
          canonical(projected.document) !== canonical(initial.document) ||
          !projected.placementResult.ok ||
          !projected.placementResult.artifact.sealedSimulation
        )
          throw new Error('Bound physical initialization no longer replays exactly.');
        const graph = await fingerprintDxfExactAssemblyGraphV1(
          { graph: before.value.graph!, assemblySnapshot: before.assemblySnapshot },
          s,
        );
        stillBound();
        const compileInputSha256 = before.value.compileResult!.artifact!.sourceEvidence.inputSha256;
        if (
          graph.canonicalSha256 !== projected.document.graphCanonicalSha256 ||
          compileInputSha256 !== projected.document.compileInputSha256
        )
          throw new Error('Physical initialization differs from the current graph/compile input.');
        const freshTarget = async () => {
          try {
            return await matchTarget(projected.document, s, stillBound);
          } catch (error) {
            current();
            check(s, expectedEpoch);
            bodyLost(reason(error));
            throw error;
          }
        };
        currentTarget = await freshTarget();
        stillBound();
        const after = await localWait(fresh(s, stillBound), s);
        stillBound();
        currentTarget = await freshTarget();
        stillBound();
        const context: SavedGenericObservedPhysicalHostPersistenceContextV1 = structuredClone({
          schemaVersion: SAVED_GENERIC_OBSERVED_PHYSICAL_HOST_PERSISTENCE_CONTEXT_V1,
          sourceGeneration: expectedGeneration,
          graph: graph.graph,
          graphCanonicalSha256: graph.canonicalSha256,
          compileInputSha256,
          physicalInitialization: {
            document: projected.document,
            canonicalSha256: projected.canonicalSha256,
          },
          assemblySnapshot: after.assemblySnapshot,
          readEvidence: {
            fullAssemblySnapshotSha256: after.value.evidence!.fullAssemblySnapshotSha256,
          },
          claims: PERSISTENCE_CONTEXT_CLAIMS,
        });
        stillBound();
        return { ok: true as const, context };
      });
      // work() has its own await/finally. Recheck after that continuation, without publishing state.
      if (!currentTarget) throw new Error('Current observed target projection is absent.');
      publicationCurrent();
      if (!persistenceHostIdentity) throw new Error('Persistence host identity is unavailable.');
      persistenceContexts.set(result.context, {
        host: persistenceHostIdentity,
        current: publicationCurrent,
        retained: retainedPersistenceContexts,
      });
      retainedPersistenceContexts.add(result.context);
      return result;
    } catch (error) {
      return Object.freeze({
        ok: false as const,
        code: error instanceof PersistenceContextFailure ? error.code : 'context-unavailable',
        detail: reason(error),
      });
    }
  };
  const projectAuthoringContext: AuthoringProjector = async (expectedGeneration, signal) => {
    const expectedEpoch = epoch;
    let capturedSource: SavedFullAssemblyCompileResultV1 | null = null;
    let observed: AuthoringObservedTarget | null = null;
    let operationSignal: AbortSignal | undefined;
    const publicationCurrent = () => {
      checkSignal(operationSignal);
      check(signal, expectedEpoch);
      if (!capturedSource || latest !== capturedSource || sourceGeneration !== expectedGeneration)
        throw new Error('Authoring source generation changed.');
      if (observed && !isCurrentSavedModelGenericObservedTargetV1(bodySession, observed, signal))
        throw new Error('The genuine observed authoring target is no longer current.');
      // The genuine body currentness poll may synchronously replace/dispose this host.
      checkSignal(operationSignal);
      check(signal, expectedEpoch);
      if (latest !== capturedSource || sourceGeneration !== expectedGeneration)
        throw new Error('Authoring source changed during the body poll.');
    };
    try {
      const result = await work('physical', signal, async (s, current) => {
        operationSignal = s;
        if (
          !Number.isSafeInteger(expectedGeneration) ||
          expectedGeneration < 1 ||
          expectedGeneration !== sourceGeneration
        )
          throw new Error('Stale source generation.');
        capturedSource = latest;
        const stillCurrent = () => {
          current();
          check(s, expectedEpoch);
          publicationCurrent();
          current();
        };
        const { value, assemblySnapshot } = await localWait(fresh(s, stillCurrent), s);
        stillCurrent();
        const graph = await fingerprintDxfExactAssemblyGraphV1(
          { graph: value.graph!, assemblySnapshot },
          s,
        );
        stillCurrent();
        const artifact = value.compileResult!.artifact!;
        const sourceGeometry = projectSavedGenericObservedSourceGeometryV1({
          handoffPieces: value.compileRequest!.handoff.pieces,
          pieceBindings: graph.graph.pieces,
          pieceRanges: artifact.refinement.mesh.pieceRanges,
          vertexProvenance: artifact.refinement.vertexProvenance,
          restPositions2Mm: artifact.refinement.mesh.restPositions2Mm,
          restPositionsInvMass: artifact.compiledSimulation.mesh.restPositionsInvMass,
        });
        stillCurrent();
        observed = await localWait(target(s), s);
        stillCurrent();
        await localWait(fresh(s, stillCurrent), s);
        stillCurrent();
        return {
          ok: true as const,
          sourceGeneration: expectedGeneration,
          graph: graph.graph,
          graphCanonicalSha256: graph.canonicalSha256,
          compileInputSha256: artifact.sourceEvidence.inputSha256,
          observedTarget: { target: observed.target, canonicalSha256: observed.canonicalSha256 },
          sourceGeometry,
          claims: CLAIMS,
        };
      });
      // work() clears its operation in an awaited finally: this final continuation must not
      // publish an old source/body merely because its detached data still compares equal.
      if (!observed) throw new Error('Current observed authoring target is absent.');
      publicationCurrent();
      return result;
    } catch (error) {
      return failed(error);
    }
  };
  const withMountedPreview = <T>(
    canvas: HTMLCanvasElement,
    apply: (view: Preview) => T,
  ): T | null => {
    const mounted = preview;
    if (!mounted || mounted.canvas !== canvas) return null;
    const { frame, view } = mounted;
    const current = () => {
      if (
        disposed ||
        preview !== mounted ||
        frame32 !== frame ||
        snapshot.status !== 'preview-ready' ||
        snapshot.previewReceipt !== view.receipt
      )
        throw new DOMException('Observed preview changed.', 'AbortError');
      checkSignal(view.lifetime);
    };
    try {
      frameLifetime(frame, current);
      const result = apply(view);
      frameLifetime(frame, current);
      return result;
    } catch {
      return null;
    }
  };
  const host = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async consume(input: SavedFullAssemblyCompileRequestV1, signal?: AbortSignal) {
      let accepted = false;
      let acceptedEpoch: number | null = null;
      try {
        checkSignal(signal);
        if (disposed || operation || pendingDrain)
          throw new Error(
            disposed ? 'Host is disposed.' : 'Host is busy or GPU work is still draining.',
          );
        const f = exact(input, [
          'sourceOwner',
          'sourceRequest',
          'expected',
          'seedOperationNumber',
          'intent',
        ]);
        const sr = exact(f.sourceRequest, [
          'schemaVersion',
          'sourceFileId',
          'sourceSha256',
          'techCardId',
          'scopeKey',
          'patternLineKey',
          'cardLockVersion',
          'draft',
        ]);
        const request = {
          ...capture({ ...f, sourceOwner: null, sourceRequest: null }),
          sourceOwner: f.sourceOwner,
          sourceRequest: { ...capture({ ...sr, draft: null }), draft: sr.draft },
        } as unknown as SavedFullAssemblyCompileRequestV1;
        if (canonical(request.expected.row) !== canonical(row))
          throw new Error('Host row differs from genuine source request.');
        accepted = true;
        acceptedEpoch = ++epoch;
        releasePersistenceContexts();
        sourceUnlink();
        sourceController.abort();
        if (disposed || epoch !== acceptedEpoch)
          throw new Error('Host changed during previous source revocation.');
        sourceController = new AbortController();
        const ownedSource = sourceController,
          ownedEpoch = acceptedEpoch;
        let unlinkCaller = () => {};
        const sourceEnded = () =>
          clearLostSource(ownedSource, ownedEpoch, 'Original saved source lifetime ended.');
        sourceUnlink = () => {
          unlinkCaller();
          remove.call(ownedSource.signal, 'abort', sourceEnded);
        };
        add.call(ownedSource.signal, 'abort', sourceEnded, { once: true });
        unlinkCaller = link(signal, ownedSource);
        revokePhysical();
        if (disposed || epoch !== acceptedEpoch)
          throw new Error('Host changed during previous child cleanup.');
        latest = null;
        sourceGeneration = 0;
        seed = request.seedOperationNumber;
        return await work('compile', signal, async (s, current) => {
          publish({
            status: 'compiling',
            initializationSha256: null,
            targetSha256: null,
            frame16Report: null,
            frame32Report: null,
            previewReceipt: null,
            detail: null,
          });
          current();
          const result = await source.consume(request, sourceController.signal);
          current();
          checkSignal(s);
          sourceGeneration = result.generation;
          if (!result.compiled) {
            publish({ status: 'blocked', detail: result.blockers.map((x) => x.detail).join('; ') });
            return { ok: false as const, result };
          }
          // Keep a private baseline separate from the intentionally detached mutable result DTO.
          latest = structuredClone(result);
          publish({ status: 'compiled' });
          current();
          return { ok: true as const, result, claims: CLAIMS };
        });
      } catch (e) {
        if (accepted && acceptedEpoch === epoch && !disposed && !operation)
          publish({ status: 'blocked', detail: reason(e) });
        return failed(e);
      }
    },
    projectAuthoringContext,
    async bindInitialization(
      document: DxfGarmentPhysicalInitializationV1,
      expectedGeneration: number,
      signal?: AbortSignal,
    ) {
      let accepted = false;
      try {
        checkSignal(signal);
        const captured = capture(document);
        return await work('physical', signal, async (s, current) => {
          if (
            expectedGeneration !== sourceGeneration ||
            !Number.isSafeInteger(expectedGeneration) ||
            expectedGeneration < 1
          )
            throw new Error('Stale source generation.');
          accepted = true;
          revokePhysical();
          publish({
            status: 'binding-initialization',
            initializationSha256: null,
            targetSha256: null,
            previewReceipt: null,
          });
          current();
          const { value, assemblySnapshot } = await fresh(s, current);
          const projected = await projectDxfGarmentPhysicalInitializationV1(
            {
              document: captured,
              graph: value.graph!,
              assemblySnapshot,
              sourceRequest: value.compileRequest!,
              sourceArtifact: value.compileResult!.artifact!,
            },
            s,
          );
          current();
          if (!projected.placementResult.ok)
            throw new Error(projected.placementResult.blockers.map((x) => x.detail).join('; '));
          await matchTarget(projected.document, s, current);
          await fresh(s, current);
          await matchTarget(projected.document, s, current);
          current();
          check(s);
          initialization = projected;
          publish({
            status: 'initialization-bound',
            initializationSha256: projected.canonicalSha256,
            targetSha256: projected.document.observedTarget.canonicalSha256,
            detail: null,
          });
          current();
          return {
            ok: true as const,
            sourceGeneration,
            initializationSha256: projected.canonicalSha256,
            placementReport: projected.placementResult.artifact.report,
            claims: CLAIMS,
          };
        });
      } catch (e) {
        if (accepted && !disposed && !operation) publish({ status: 'blocked', detail: reason(e) });
        return failed(e);
      }
    },
    runNumeric16: (lease: XpbdDeviceLease, signal?: AbortSignal) => run(16, lease, signal),
    runNumeric32: (lease: XpbdDeviceLease, signal?: AbortSignal) => run(32, lease, signal),
    async projectLatestRender(signal?: AbortSignal) {
      let accepted = false;
      try {
        return await work('physical', signal, async (s, current) => {
          const owner = frame32 ?? frame16;
          if (!owner || !initialization || !replayApi) throw new Error('No current numeric frame.');
          accepted = true;
          const initial = initialization;
          await fresh(s, current);
          await matchTarget(initialization.document, s, current);
          const projection = await replayApi.projectDxfGarmentObservedWebgpuRenderV1(owner, s);
          current();
          await fresh(s, current);
          current();
          check(s);
          if (!projection) throw new Error('Frame projection expired.');
          frameLifetime(owner, current);
          if (initialization !== initial)
            throw new Error('Initialization changed during render projection.');
          return {
            ok: true as const,
            sourceGeneration,
            initializationSha256: initialization.canonicalSha256,
            projection,
            claims: CLAIMS,
          };
        });
      } catch (e) {
        if (accepted && !(signal && isAborted(signal))) {
          releaseFrames();
          if (!disposed) publish({ status: 'blocked', previewReceipt: null, detail: reason(e) });
        }
        return failed(e);
      }
    },
    async mountPreview(canvas: HTMLCanvasElement, signal?: AbortSignal) {
      try {
        return await work('physical', signal, async (s, current, retainUntil) => {
          const frame = frame32;
          if (!frame || !initialization) throw new Error('A current32 frame is required.');
          await fresh(s, current);
          await matchTarget(initialization.document, s, current);
          current();
          const renderer = await import('./dxf-garment-observed-strain-heatmap-preview-v1');
          current();
          releasePreview();
          current();
          const made = await renderer.createDxfGarmentObservedStrainHeatmapPreviewV1(
            canvas,
            frame,
            s,
          );
          try {
            current();
            await fresh(s, current);
            current();
            check(s);
            await matchTarget(initialization.document, s, current);
            current();
            const mounted = { view: made, canvas, frame };
            preview = mounted;
            const invalidated = () => {
              if (preview !== mounted) return;
              preview = null;
              unlinkPreview?.();
              unlinkPreview = null;
              if (!disposed)
                publish({
                  status: frame32
                    ? 'frame32-ready'
                    : frame16
                      ? 'frame16-ready'
                      : initialization
                        ? 'initialization-bound'
                        : 'compiled',
                  previewReceipt: null,
                });
            };
            unlinkPreview = () => remove.call(made.lifetime, 'abort', invalidated);
            add.call(made.lifetime, 'abort', invalidated, { once: true });
            checkSignal(made.lifetime);
            retainUntil(made.lifetime);
            publish({ status: 'preview-ready', previewReceipt: made.receipt });
            current();
            checkSignal(made.lifetime);
            frameLifetime(frame, current);
            return { ok: true as const, receipt: made.receipt, claims: CLAIMS };
          } catch (e) {
            if (preview?.view === made) releasePreview();
            else made.dispose();
            throw e;
          }
        });
      } catch (e) {
        return failed(e);
      }
    },
    pickPreview(
      canvas: HTMLCanvasElement,
      clientX: number,
      clientY: number,
      runtimeSeamId?: string,
      measureSurface = false,
    ) {
      return withMountedPreview(canvas, (view) => {
        const hit = view.pick(clientX, clientY, runtimeSeamId, measureSurface);
        return hit && hit.frameReportSha256 === view.receipt.frameReportSha256 ? hit : null;
      });
    },
    async measurePreviewTape(
      canvas: HTMLCanvasElement,
      first: DxfGarmentObservedPreviewSurfacePointV1,
      second: DxfGarmentObservedPreviewSurfacePointV1,
    ): Promise<number | null> {
      const view = withMountedPreview(canvas, (mounted) => mounted);
      if (!view) return null;
      const measured = await view.measureTape(first, second);
      return withMountedPreview(canvas, (mounted) => (mounted === view ? measured : null));
    },
    setPreviewSelectedPiece(
      canvas: HTMLCanvasElement,
      pieceId: string | null,
      seamSide?: DxfGarmentObservedPreviewSeamSideV1,
      edge?: DxfGarmentObservedBoundaryEdgeV1,
    ): boolean {
      return (
        withMountedPreview(canvas, (view) => view.setSelectedPiece(pieceId, seamSide, edge)) ??
        false
      );
    },
    async stopPreview() {
      if (operation?.kind === 'physical') {
        operation.controller.abort();
        await operation.finished;
      }
      releaseFrames();
      if (!disposed)
        publish({
          status: pendingDrain
            ? 'blocked'
            : initialization
              ? 'initialization-bound'
              : latest
                ? 'compiled'
                : 'idle',
          detail: pendingDrain
            ? 'Submitted GPU work is still draining; borrowed device remains untouched.'
            : null,
          previewReceipt: null,
        });
    },
    async dispose() {
      if (disposed) return false;
      disposed = true;
      releasePersistenceContexts();
      persistenceHosts.delete(host);
      authoringHosts.delete(host);
      epoch++;
      sourceController.abort();
      sourceUnlink();
      operation?.controller.abort();
      releaseFrames();
      source.dispose();
      if (operation) await operation.finished;
      publish({ status: 'disposed', previewReceipt: null });
      listeners.clear();
      return true;
    },
  };
  persistenceHostIdentity = host;
  persistenceHosts.set(host, projectPersistenceContext);
  authoringHosts.set(host, projectAuthoringContext);
  return Object.freeze(host);
}
export type SavedGenericObservedPhysicalHostV1 = ReturnType<
  typeof createSavedGenericObservedPhysicalHostV1
>;
