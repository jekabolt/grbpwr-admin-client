import type { DxfGarmentExplicitPiecePlacementV1 } from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type {
  DxfProductSavedNativeCompilerSourceOwnerV1,
  DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  inspectOwnedActiveXpbdDeviceLeaseV1,
  type XpbdDeviceLease,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import type { SavedFullAssemblyPhysicalDocumentPersistenceResultV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-document-production-v1';
import type { SavedFullAssemblyCompileIntentV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1';
import type { SavedFullAssemblyRegisteredCutSourceV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-registered-cut-source-v1';
import {
  readSavedFullAssemblyPhysicalSnapshotV1,
  projectSavedFullAssemblyPhysicalSnapshotV1,
  disposeSavedFullAssemblyPhysicalSnapshotV1,
  type SavedFullAssemblyPhysicalSnapshotProjectionV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-snapshot-production-v1';
import {
  projectCurrentSavedModelGenericObservedTargetV1,
  isCurrentSavedModelGenericObservedTargetV1,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import {
  createSavedGenericObservedPhysicalHostV1,
  projectSavedGenericObservedPhysicalHostPersistenceContextV1,
  isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1,
  type SavedGenericObservedPhysicalHostPersistenceContextV1,
} from './saved-generic-observed-physical-host-v1';

import type {
  DxfGarmentObservedPreviewHitV1,
  DxfGarmentObservedPreviewSeamSideV1,
} from './dxf-garment-observed-strain-heatmap-preview-v1';

import type { DxfGarmentObservedBoundaryEdgeV1 } from './dxf-garment-observed-unsewn-edges-v1';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from './model-displayed-triangle-body-input-v1';

export type SavedGenericDurablePhysicalPreviewScopeV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  sourceFileId: string;
  sizeToken: string;
}>;

export type SavedGenericDurablePhysicalPreviewPieceV1 = Readonly<{
  scopeKey: string;
  pieceId: string;
  pieceLineKey: string;
}>;

export type SavedGenericDurablePhysicalPreviewSeamV1 = Readonly<{
  operationNumber: number;
  seamId: string;
  sides: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contourId: string;
    boundaryVertexIds: readonly string[];
    direction: 'forward' | 'reverse';
  }>[];
}>;

export type SavedGenericDurablePhysicalPreviewSelectedSideV1 = Readonly<{
  seam: SavedGenericDurablePhysicalPreviewSeamV1;
  sideIndex: 0 | 1;
}>;

export type SavedGenericDurablePhysicalPreviewHitV1 =
  | (Omit<Extract<DxfGarmentObservedPreviewHitV1, { kind: 'garment' }>, 'seamSide'> &
      SavedGenericDurablePhysicalPreviewPieceV1 &
      Readonly<{
        seamSide?: Readonly<{
          seamId: string;
          sideIndex: 0 | 1;
          contourId: string;
          boundaryVertexIds: readonly [string, string];
        }>;
      }>)
  | Extract<DxfGarmentObservedPreviewHitV1, { kind: 'body' }>;

export const SAVED_GENERIC_DURABLE_PHYSICAL_HOST_V1 =
  'saved-generic-durable-physical-host/1' as const;
const CLAIMS = Object.freeze({
  fixedDurableReaderRequired: true,
  freshDurableContentAtReadOnly: true,
  numericReplayOnly: true,
  numericSnapshotIsCurrentAdmission: false,
  productUiIntegrated: false,
  fitQualified: false,
  continuationQualified: false,
  stressPaComputed: false,
});
type NumericHost = ReturnType<typeof createSavedGenericObservedPhysicalHostV1>;
type NumericSnapshot = ReturnType<NumericHost['getSnapshot']>;
type Target = Extract<
  Awaited<ReturnType<typeof projectCurrentSavedModelGenericObservedTargetV1>>,
  { ok: true }
>;
type Durable = Omit<
  SavedFullAssemblyPhysicalSnapshotProjectionV1,
  'authorityReceipt' | 'physicalComponentDocument'
>;
export type SavedGenericDurablePhysicalRestoreRequestV1 = Readonly<{
  verifiedReceipt: unknown;
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
}>;
export type SavedGenericDurablePhysicalBindingV1 = Readonly<{
  sourceGeneration: number;
  graphCanonicalSha256: string;
  compileInputSha256: string;
  physicalInitializationCanonicalSha256: string;
  outerSha256: string;
  /** Ephemeral same-read join; never persist this digest inside its own outer component. */
  freshSnapshotSha256: string;
}>;
export type SavedV7PieceTranslationV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  translationM: readonly [number, number, number];
}>;
export type SavedV7WorldRotationAxisV1 = 'X' | 'Y' | 'Z';
export type SavedV7PlacementChangeV1 =
  | Readonly<{ kind: 'translate'; pieces: readonly SavedV7PieceTranslationV1[] }>
  | Readonly<{ kind: 'quarter-turn-world-y' }>
  | Readonly<{ kind: 'rotate-assembly-world'; axis: 'X' | 'Y'; degrees: 90 | 180 }>
  | Readonly<{
      kind: 'rotate-piece-world';
      pieceId: string;
      pieceLineKey: string;
      axis: SavedV7WorldRotationAxisV1;
      degrees: number;
    }>;
export type SavedV7PlacementEditV1 = Readonly<{
  binding: SavedGenericDurablePhysicalBindingV1;
  pieces: readonly SavedV7PieceTranslationV1[];
}>;
export class SavedV7PlacementPersistenceErrorV1 extends Error {
  constructor(
    readonly result: Extract<SavedFullAssemblyPhysicalDocumentPersistenceResultV1, { ok: false }>,
  ) {
    super(result.blockers[0].detail);
  }
}

type PlacementRotation = DxfGarmentExplicitPiecePlacementV1['rotationRowMajor'];

/** Pre-multiply the saved orientation by a right-handed turn about an explicit world axis. */
function rotatePlacementWorld(
  rotation: PlacementRotation,
  axis: SavedV7WorldRotationAxisV1,
  degrees: number,
): PlacementRotation {
  const turn = degrees % 360;
  const radians = (turn * Math.PI) / 180;
  const quarter = turn / 90;
  const exact = (quarter + 4) % 4;
  const quadrantal = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  const [cos, sin] = Number.isInteger(quarter)
    ? quadrantal[exact]!
    : [Math.cos(radians), Math.sin(radians)];
  const [a, b] = axis === 'X' ? [3, 6] : axis === 'Y' ? [6, 0] : [0, 3];
  const result: [...PlacementRotation] = [...rotation];
  for (let column = 0; column < 3; column++) {
    const x = rotation[a + column]!;
    const y = rotation[b + column]!;
    const first = cos * x - sin * y;
    const second = sin * x + cos * y;
    result[a + column] = first === 0 ? 0 : first;
    result[b + column] = second === 0 ? 0 : second;
  }
  return result;
}

function placementAfterEdit(
  placements: readonly DxfGarmentExplicitPiecePlacementV1[],
  edit: SavedV7PlacementEditV1,
  change: SavedV7PlacementChangeV1,
): readonly DxfGarmentExplicitPiecePlacementV1[] {
  if (change.kind === 'quarter-turn-world-y' || change.kind === 'rotate-assembly-world') {
    const pivot = placements[0]?.translationM;
    if (!pivot) throw new Error('The saved assembly has no placement pivot.');
    const { axis, degrees } =
      change.kind === 'quarter-turn-world-y'
        ? { axis: 'Y' as const, degrees: 90 as const }
        : change;
    if ((axis !== 'X' && axis !== 'Y') || (degrees !== 90 && degrees !== 180))
      throw new Error('Select a supported turn about the current assembly pivot.');
    const [a, b] = axis === 'X' ? ([1, 2] as const) : ([2, 0] as const);
    return placements.map((piece) => {
      const translationM: [number, number, number] = [...piece.translationM];
      const da = translationM[a] - pivot[a];
      const db = translationM[b] - pivot[b];
      translationM[a] = pivot[a] - (degrees === 90 ? db : da);
      translationM[b] = degrees === 90 ? pivot[b] + da : pivot[b] - db;
      return {
        ...piece,
        rotationRowMajor: rotatePlacementWorld(piece.rotationRowMajor, axis, degrees),
        translationM,
      };
    });
  }
  if (change.kind === 'rotate-piece-world') {
    const { pieceId, pieceLineKey, axis, degrees } = change;
    if (
      !edit.pieces.some(
        (piece) => piece.pieceId === pieceId && piece.pieceLineKey === pieceLineKey,
      ) ||
      (axis !== 'X' && axis !== 'Y' && axis !== 'Z') ||
      !Number.isFinite(degrees) ||
      degrees % 360 === 0
    )
      throw new Error('Select a current saved piece and a world axis, then enter a nonzero turn.');
    return placements.map((piece) =>
      piece.pieceId === pieceId
        ? {
            ...piece,
            rotationRowMajor: rotatePlacementWorld(piece.rotationRowMajor, axis, degrees),
          }
        : piece,
    );
  }
  if (
    change.kind !== 'translate' ||
    change.pieces.length !== edit.pieces.length ||
    !change.pieces.every((entry, i) => {
      const prior = edit.pieces[i];
      return (
        entry.pieceId === prior?.pieceId &&
        entry.pieceLineKey === prior.pieceLineKey &&
        Array.isArray(entry.translationM) &&
        entry.translationM.length === 3 &&
        entry.translationM.every(Number.isFinite)
      );
    }) ||
    change.pieces.every(
      (entry, i) => canonical(entry.translationM) === canonical(edit.pieces[i]!.translationM),
    )
  )
    throw new Error('Change the translation of a current saved piece.');
  return placements.map((piece, i) => ({
    ...piece,
    translationM: change.pieces[i]!.translationM,
  }));
}

export type SavedGenericDurablePhysicalHostSnapshotV1 = Readonly<{
  version: typeof SAVED_GENERIC_DURABLE_PHYSICAL_HOST_V1;
  status:
    | 'idle'
    | 'restoring'
    | 'ready'
    | 'running16'
    | 'frame16-ready'
    | 'running32'
    | 'frame32-ready'
    | 'preview-ready'
    | 'blocked'
    | 'disposed';
  binding: SavedGenericDurablePhysicalBindingV1 | null;
  /** Historical numeric diagnostics; only the top-level current binding admits a facade action. */
  numeric: NumericSnapshot;
  detail: string | null;
  claims: typeof CLAIMS;
}>;
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener,
  remove = EventTarget.prototype.removeEventListener;
function checkSignal(signal?: AbortSignal) {
  if (signal !== undefined && aborted.call(signal))
    throw new DOMException('Durable physical operation cancelled.', 'AbortError');
}
function record(value: unknown, keys: readonly string[]) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError('Exact plain own data request required.');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(ds).length !== keys.length ||
    keys.some((k) => !ds[k]?.enumerable || !('value' in ds[k]))
  )
    throw new TypeError('Request accessors, hidden fields and extra fields are refused.');
  return Object.fromEntries(keys.map((k) => [k, ds[k].value]));
}
/** Detached metadata only. Native owner/draft/receipt and signals never enter this copier. */
function capture<T>(input: T): T {
  let nodes = 0,
    chars = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 3000000 || depth > 48) throw new TypeError('Metadata exceeds bounded shape.');
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      chars += v.length;
      if (v.length > 65536 || chars > 16 * 1024 * 1024)
        throw new TypeError('Metadata exceeds text bound.');
      return v;
    }
    if (!v || typeof v !== 'object' || active.has(v))
      throw new TypeError('Plain finite acyclic metadata required.');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype))
      throw new TypeError('Opaque metadata refused.');
    const ds = Object.getOwnPropertyDescriptors(v);
    if (array && (ds.length.value > 250000 || Reflect.ownKeys(ds).length !== ds.length.value + 1))
      throw new TypeError('Dense bounded array required.');
    active.add(v);
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
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
        throw new TypeError('Metadata accessors and non-data fields refused.');
      (result as Record<string, unknown>)[key] = copy(d.value, depth + 1);
    }
    active.delete(v);
    return result;
  };
  return copy(input, 0) as T;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'undefined';
}
const reason = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 2048) : 'Durable physical operation failed.';
const blocked = (error: unknown) => Object.freeze({ ok: false as const, detail: reason(error) });
function link(parent: AbortSignal | undefined, controller: AbortController) {
  checkSignal(parent);
  if (!parent) return () => {};
  const cancel = () => controller.abort();
  add.call(parent, 'abort', cancel, { once: true });
  if (aborted.call(parent)) cancel();
  return () => remove.call(parent, 'abort', cancel);
}
/** Cancellation owns this wait only; late fixed-reader results still run their finally cleanup. */
function localWait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (f: () => void) => {
      if (done) return;
      done = true;
      remove.call(signal, 'abort', cancel);
      f();
    };
    const cancel = () =>
      finish(() => reject(new DOMException('Durable read cancelled.', 'AbortError')));
    promise.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
    add.call(signal, 'abort', cancel, { once: true });
    if (aborted.call(signal)) cancel();
  });
}
function detachedProjection(receipt: unknown): Durable {
  const p = projectSavedFullAssemblyPhysicalSnapshotV1(receipt);
  return capture({
    version: p.version,
    row: p.row,
    seedOperationNumber: p.seedOperationNumber,
    serverAssemblyRevision: p.serverAssemblyRevision,
    freshSnapshotSha256: p.freshSnapshotSha256,
    outer: p.outer,
    graph: p.graph,
    graphCanonicalSha256: p.graphCanonicalSha256,
    compileInputSha256: p.compileInputSha256,
    physicalInitialization: p.physicalInitialization,
    physicalInitializationCanonicalSha256: p.physicalInitializationCanonicalSha256,
  });
}
function restoredIntent(d: Durable): SavedFullAssemblyCompileIntentV1 {
  return capture({
    documentId: d.graph.source.handoffSource.documentId,
    revision: d.graph.source.handoffSource.revision,
    sizeToken: d.graph.source.sizeToken,
    physicalSurface: { mode: 'sewing-surface' as const, seamAllowancePhysical: false as const },
    pieces: d.graph.pieces,
    operations: d.graph.operations,
    ...(d.graph.productionOrder ? { productionOrder: d.graph.productionOrder } : {}),
    seams: d.graph.seams,
    compile: d.graph.compile,
  });
}

/** Fixed restore/execute composition. No downloader, Worker, callback reader or public numeric owner. */
export function createSavedGenericDurablePhysicalHostV1(
  input: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    bodySession: unknown;
  }>,
) {
  const fields = record(input, ['row', 'bodySession']);
  const row = capture(fields.row) as DxfProductSavedRowIdentityV1,
    bodySession = fields.bodySession;
  const host = createSavedGenericObservedPhysicalHostV1({ row, bodySession });
  let disposed = false,
    stopping = false,
    epoch = 0,
    serial = 0;
  let sourceLife = new AbortController(),
    unlinkSource = () => {};
  type Admission = {
    durable: Durable;
    generation: number;
    epoch: number;
    sourceLife: AbortController;
    publicBinding: SavedGenericDurablePhysicalBindingV1;
    registeredCut?: SavedFullAssemblyRegisteredCutSourceV1;
  };
  type Operation = {
    id: number;
    kind: 'restore' | 'physical';
    controller: AbortController;
    finished: Promise<void>;
    unlink: () => void;
    retained: boolean;
    stoppedByHost: boolean;
    receipts: Set<unknown>;
    borrowedReceipt: unknown | null;
    context: SavedGenericObservedPhysicalHostPersistenceContextV1 | null;
  };
  let admission: Admission | null = null,
    operation: Operation | null = null;
  let lease16: XpbdDeviceLease | null = null;
  const bridges = new Map<'16' | '32' | 'preview', Operation>();
  const previewAdmission = () => {
    const a = admission;
    const bridge = bridges.get('preview');
    if (!a || !bridge) return null;
    const current = () =>
      !disposed &&
      !stopping &&
      admission === a &&
      epoch === a.epoch &&
      sourceLife === a.sourceLife &&
      !aborted.call(sourceLife.signal) &&
      !aborted.call(bridge.controller.signal) &&
      bridges.get('preview') === bridge &&
      snapshot.status === 'preview-ready' &&
      snapshot.binding === a.publicBinding &&
      snapshot.numeric.sourceGeneration === a.generation &&
      snapshot.numeric.initializationSha256 === a.durable.physicalInitializationCanonicalSha256 &&
      snapshot.numeric.previewReceipt !== null;
    return current() ? { durable: a.durable, current } : null;
  };
  const matchesPreviewScope = (
    scope: SavedGenericDurablePhysicalPreviewScopeV1 | null,
    durable: Durable,
  ): boolean => {
    try {
      const requested = capture(record(scope, ['row', 'sizeToken', 'sourceFileId']));
      const { source } = durable.graph;
      return (
        canonical(requested.row) === canonical(durable.row) &&
        requested.sizeToken === source.sizeToken &&
        requested.sourceFileId === source.sourceFileId
      );
    } catch {
      return false;
    }
  };
  const currentN1Seam = (requested: SavedGenericDurablePhysicalPreviewSeamV1, durable: Durable) => {
    try {
      const exact = capture(
        record(requested, ['operationNumber', 'seamId', 'sides']),
      ) as SavedGenericDurablePhysicalPreviewSeamV1;
      const { graph } = durable;
      const operation = graph.operations.find(
        ({ sourceOperationNumber }) => sourceOperationNumber === exact.operationNumber,
      );
      if (operation?.seamIds.length !== 1 || exact.sides.length !== 2) return null;
      const seam = graph.seams.find(
        ({ id, sourceSeamKey, clientOperationId }) =>
          id === operation.seamIds[0] &&
          sourceSeamKey === exact.seamId &&
          clientOperationId === operation.clientOperationId,
      );
      if (
        !seam?.sides.every((side, index) => {
          const requestedSide = exact.sides[index];
          return (
            side.pieceId === requestedSide?.pieceId &&
            side.pieceLineKey === requestedSide.pieceLineKey &&
            side.contourId === requestedSide.contourId &&
            side.direction === requestedSide.direction &&
            requestedSide.boundaryVertexIds.length === 2 &&
            side.anchors.every(
              (anchor, ordinal) => anchor === requestedSide.boundaryVertexIds[ordinal],
            )
          );
        })
      )
        return null;
      return seam;
    } catch {
      return null;
    }
  };
  const listeners = new Set<() => void>();
  let snapshot: SavedGenericDurablePhysicalHostSnapshotV1 = Object.freeze({
    version: SAVED_GENERIC_DURABLE_PHYSICAL_HOST_V1,
    status: 'idle',
    binding: null,
    numeric: host.getSnapshot(),
    detail: null,
    claims: CLAIMS,
  });
  const publish = (change: Partial<SavedGenericDurablePhysicalHostSnapshotV1>) => {
    snapshot = Object.freeze({ ...snapshot, ...change, numeric: host.getSnapshot() });
    for (const listener of [...listeners])
      try {
        listener();
      } catch {
        /* observers cannot veto cleanup */
      }
  };
  const dropBridge = (kind: '16' | '32' | 'preview') => {
    const old = bridges.get(kind);
    bridges.delete(kind);
    old?.unlink();
  };
  const dropBridges = () => {
    lease16 = null;
    for (const kind of [...bridges.keys()]) dropBridge(kind);
  };
  const releaseReads = (op: Operation | null) => {
    if (!op) return;
    for (const receipt of op.receipts) disposeSavedFullAssemblyPhysicalSnapshotV1(receipt);
    op.receipts.clear();
    op.borrowedReceipt = null;
    op.context = null;
  };
  const check = (op: Operation, expectedEpoch: number, finished = false) => {
    checkSignal(op.controller.signal);
    checkSignal(sourceLife.signal);
    if (disposed || epoch !== expectedEpoch || serial !== op.id || (!finished && operation !== op))
      throw new DOMException('Durable host generation or operation changed.', 'AbortError');
  };
  const bound = (op: Operation, a: Admission, finished = false) => {
    check(op, a.epoch, finished);
    if (
      admission !== a ||
      sourceLife !== a.sourceLife ||
      host.getSnapshot().sourceGeneration !== a.generation ||
      host.getSnapshot().initializationSha256 !== a.durable.physicalInitializationCanonicalSha256
    )
      throw new Error('Durable admission or numeric initialization is no longer current.');
    check(op, a.epoch, finished);
  };
  const invalidate = (a: Admission, detail: string) => {
    if (disposed || admission !== a || epoch !== a.epoch) return;
    admission = null;
    dropBridges();
    void host.stopPreview().catch(() => {});
    publish({ status: 'blocked', binding: null, detail });
  };
  const unsubscribe = host.subscribe(() => {
    const current = host.getSnapshot();
    if (!current.previewReceipt) dropBridge('preview');
    if (current.status === 'blocked' || current.status === 'disposed') dropBridges();
    if (disposed) return;
    const a = admission;
    if (
      a &&
      (current.sourceGeneration !== a.generation ||
        current.initializationSha256 !== a.durable.physicalInitializationCanonicalSha256)
    ) {
      admission = null;
      dropBridges();
      publish({
        status: 'blocked',
        binding: null,
        detail: current.detail ?? 'Numeric source/body binding ended.',
      });
    } else if (a && snapshot.status === 'preview-ready' && !current.previewReceipt) {
      publish({
        status:
          current.status === 'frame32-ready'
            ? 'frame32-ready'
            : current.status === 'frame16-ready'
              ? 'frame16-ready'
              : 'ready',
      });
    } else publish({});
  });
  async function work<T>(
    signal: AbortSignal | undefined,
    action: (op: Operation) => Promise<T>,
    replacesSource = false,
  ) {
    checkSignal(signal);
    if (disposed || stopping || operation || host.getSnapshot().cleanupPending)
      throw new Error(
        disposed ? 'Durable host is disposed.' : 'Durable host is busy or GPU work is draining.',
      );
    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((r) => {
      finish = r;
    });
    const unlinks: Array<() => void> = [];
    const op: Operation = {
      id: ++serial,
      kind: replacesSource ? 'restore' : 'physical',
      controller,
      finished,
      retained: false,
      stoppedByHost: false,
      receipts: new Set(),
      borrowedReceipt: null,
      context: null,
      unlink: () => {
        unlinks.splice(0).forEach((f) => f());
      },
    };
    operation = op;
    try {
      unlinks.push(link(signal, controller));
      if (!replacesSource) unlinks.push(link(sourceLife.signal, controller));
      return { value: await action(op), op };
    } finally {
      if (!op.retained || aborted.call(controller.signal)) op.unlink();
      if (operation === op) operation = null;
      finish();
    }
  }
  async function fresh(durable: Durable, op: Operation) {
    const signal = op.controller.signal;
    let receipt: Awaited<ReturnType<typeof readSavedFullAssemblyPhysicalSnapshotV1>> | null = null;
    try {
      receipt = await readSavedFullAssemblyPhysicalSnapshotV1(
        { row, seedOperationNumber: durable.seedOperationNumber },
        signal,
      );
      checkSignal(signal);
      const value = detachedProjection(receipt);
      if (canonical(value) !== canonical(durable))
        throw new Error('Verified saved full graph/physical outer changed.');
      checkSignal(signal);
      op.receipts.add(receipt);
      receipt = null;
      return value;
    } finally {
      if (receipt) disposeSavedFullAssemblyPhysicalSnapshotV1(receipt);
    }
  }
  async function target(a: Admission, op: Operation) {
    const t = await projectCurrentSavedModelGenericObservedTargetV1(
      bodySession,
      op.controller.signal,
    );
    bound(op, a);
    if (
      !t.ok ||
      t.canonicalSha256 !== a.durable.physicalInitialization.observedTarget.canonicalSha256 ||
      canonical(t.target) !== canonical(a.durable.physicalInitialization.observedTarget.target)
    )
      throw new Error('Current genuine displayed body differs from saved physical initialization.');
    return t;
  }
  const terminal = (a: Admission, op: Operation, t: Target, finished = false) => {
    bound(op, a, finished);
    for (const receipt of op.receipts) {
      if (canonical(detachedProjection(receipt)) !== canonical(a.durable))
        throw new Error('Owned verified read receipt expired or changed before publication.');
      bound(op, a, finished);
    }
    if (
      op.borrowedReceipt &&
      canonical(detachedProjection(op.borrowedReceipt)) !== canonical(a.durable)
    )
      throw new Error('Borrowed restore receipt expired or changed before publication.');
    bound(op, a, finished);
    if (
      !isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1(
        host,
        op.context,
        op.controller.signal,
      )
    ) {
      check(op, a.epoch, finished);
      throw new Error('Private source/initialization context expired before durable publication.');
    }
    bound(op, a, finished);
    if (!isCurrentSavedModelGenericObservedTargetV1(bodySession, t, op.controller.signal)) {
      check(op, a.epoch, finished);
      throw new Error('Displayed body changed before durable publication.');
    }
    bound(op, a, finished);
  };
  async function verify(a: Admission, op: Operation) {
    bound(op, a);
    await localWait(fresh(a.durable, op), op.controller.signal);
    bound(op, a);
    const context = await projectSavedGenericObservedPhysicalHostPersistenceContextV1(
      host,
      a.generation,
      op.controller.signal,
    );
    bound(op, a);
    if (!context.ok) throw new Error(context.detail);
    const c = context.context;
    op.context = c;
    if (
      c.graphCanonicalSha256 !== a.durable.graphCanonicalSha256 ||
      c.compileInputSha256 !== a.durable.compileInputSha256 ||
      c.physicalInitialization.canonicalSha256 !==
        a.durable.physicalInitializationCanonicalSha256 ||
      c.readEvidence.fullAssemblySnapshotSha256 !== a.durable.freshSnapshotSha256 ||
      canonical(c.graph) !== canonical(a.durable.graph) ||
      canonical(c.physicalInitialization.document) !==
        canonical(a.durable.physicalInitialization) ||
      canonical(c.assemblySnapshot.row) !== canonical(row) ||
      c.assemblySnapshot.serverAssemblyRevision !== a.durable.serverAssemblyRevision
    )
      throw new Error('Private numeric host differs from verified saved content.');
    const t = await target(a, op);
    terminal(a, op, t);
    return t;
  }
  const failAccepted = (
    a: Admission | null,
    op: Operation | null,
    error: unknown,
    signal?: AbortSignal,
  ) => {
    if (
      a &&
      op &&
      !disposed &&
      serial === op.id &&
      admission === a &&
      !op.stoppedByHost &&
      !(signal && aborted.call(signal))
    )
      invalidate(a, reason(error));
    return blocked(error);
  };
  async function run(frame: 16 | 32, lease: XpbdDeviceLease, signal?: AbortSignal) {
    let accepted: Admission | null = null,
      ticket: Operation | null = null;
    try {
      const done = await work(signal, async (op) => {
        ticket = op;
        const a = admission;
        if (!a) throw new Error('A verified restored durable binding is required.');
        if (!inspectOwnedActiveXpbdDeviceLeaseV1(lease).ok)
          throw new Error('A genuine active borrowed device lease is required.');
        if (frame === 32 && lease16 !== lease)
          throw new Error('32 requires the current genuine16 on the same borrowed lease.');
        accepted = a;
        await verify(a, op);
        bound(op, a);
        if (frame === 16) dropBridges();
        else {
          dropBridge('preview');
          dropBridge('32');
        }
        publish({ status: frame === 16 ? 'running16' : 'running32', detail: null });
        bound(op, a);
        const result =
          frame === 16
            ? await host.runNumeric16(lease, op.controller.signal)
            : await host.runNumeric32(lease, op.controller.signal);
        bound(op, a);
        if (!result.ok) throw new Error(result.detail);
        // Underlying fixed host has drained the same borrowed queue before successful return.
        const t = await verify(a, op);
        terminal(a, op, t);
        if (frame === 16) lease16 = lease;
        op.retained = true;
        bridges.set(frame === 16 ? '16' : '32', op);
        return { a, t, result };
      });
      terminal(done.value.a, done.op, done.value.t, true);
      publish({ status: frame === 16 ? 'frame16-ready' : 'frame32-ready', detail: null });
      terminal(done.value.a, done.op, done.value.t, true);
      return { ...done.value.result, durableBinding: done.value.a.publicBinding, claims: CLAIMS };
    } catch (error) {
      return failAccepted(accepted, ticket, error, signal);
    } finally {
      releaseReads(ticket);
    }
  }
  let placementEdit: SavedV7PlacementEditV1 | null = null;
  const editableAdmission = () => {
    if (
      !admission ||
      snapshot.status !== 'ready' ||
      bridges.size ||
      lease16 ||
      host.getSnapshot().cleanupPending
    )
      throw new Error('A freshly restored saved V7 with no active preview is required.');
    return admission;
  };
  const prepareRegisteredCut = async (
    scope: SavedGenericDurablePhysicalPreviewScopeV1 | null,
    body: ModelDisplayedTriangleBodyOwnedInputV1,
    signal: AbortSignal,
    lease?: XpbdDeviceLease,
    checkedPlacement?: Readonly<{ sourceFingerprint: string; initialPositionsSha256: string }>,
  ) => {
    let ticket: Operation | null = null;
    try {
      const done = await work(signal, async (op) => {
        ticket = op;
        const a = editableAdmission();
        if (!a.registeredCut || !matchesPreviewScope(scope, a.durable))
          throw new Error('Select the saved pattern size to preview its complete cut.');
        const observedTarget = await verify(a, op);
        const observed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
        if (!observed) throw new Error('The displayed mannequin is no longer current.');
        const isCurrent = () =>
          !disposed &&
          admission === a &&
          snapshot.binding === a.publicBinding &&
          !signal.aborted &&
          body.isCurrent() &&
          isCurrentSavedModelGenericObservedTargetV1(bodySession, observedTarget, signal);
        const isCurrentDuringRun = () => {
          bound(op, a);
          return isCurrent();
        };
        const { prepareSavedV7RegisteredCutPreviewV1, SAVED_REGISTERED_CUT_ACTIVATION_V1 } =
          await import('./saved-v7-registered-cut-preview-v1');
        const prepared = await prepareSavedV7RegisteredCutPreviewV1(
          a.durable,
          a.registeredCut,
          observed,
          isCurrentDuringRun,
          op.controller.signal,
        );
        let frame: Awaited<
          ReturnType<
            typeof import('./run-directed-source-cut-preview-v1').runRegisteredSourceCutPreviewV1
          >
        > | null = null;
        if (lease) {
          if (
            !checkedPlacement ||
            prepared.proof.sourceFingerprint !== checkedPlacement.sourceFingerprint ||
            prepared.proof.initialPositionsSha256 !== checkedPlacement.initialPositionsSha256
          )
            throw new Error('The prepared full-cut placement changed. Check the placement again.');
          const { runRegisteredSourceCutPreviewV1 } = await import(
            './run-directed-source-cut-preview-v1'
          );
          frame = await runRegisteredSourceCutPreviewV1(
            {
              source: prepared.source,
              body: prepared.body,
              ownedLease: lease,
              schedule: SAVED_REGISTERED_CUT_ACTIVATION_V1,
              expectedInitialPositionsSha256: checkedPlacement.initialPositionsSha256,
            },
            op.controller.signal,
          );
        }
        await localWait(fresh(a.durable, op), op.controller.signal);
        terminal(a, op, observedTarget);
        return { proof: prepared.proof, initial: prepared.initial, frame, isCurrent };
      });
      if (!done.value.isCurrent()) throw new Error('The saved cut or mannequin changed.');
      return { ok: true as const, ...done.value };
    } catch (error) {
      return blocked(error);
    } finally {
      releaseReads(ticket);
    }
  };
  return Object.freeze({
    getSnapshot: () => snapshot,
    hasRegisteredCut: () => Boolean(admission?.registeredCut),
    prepareRegisteredCut,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async restore(input: SavedGenericDurablePhysicalRestoreRequestV1, signal?: AbortSignal) {
      let ticket: Operation | null = null,
        a: Admission | null = null;
      try {
        checkSignal(signal);
        const r = record(input, ['verifiedReceipt', 'sourceOwner', 'sourceRequest']);
        const sr = record(r.sourceRequest, [
          'schemaVersion',
          'sourceFileId',
          'sourceSha256',
          'techCardId',
          'scopeKey',
          'patternLineKey',
          'cardLockVersion',
          'draft',
        ]);
        const sourceRequest = {
          ...capture({ ...sr, draft: null }),
          draft: sr.draft,
        } as unknown as DxfProductSavedNativeCompilerSourceRequestV1;
        const durable = detachedProjection(r.verifiedReceipt);
        if (
          canonical(durable.row) !== canonical(row) ||
          sourceRequest.sourceFileId !== durable.graph.source.sourceFileId ||
          sourceRequest.sourceSha256 !== row.sha256 ||
          sourceRequest.techCardId !== row.techCardId ||
          sourceRequest.scopeKey !== row.scopeKey ||
          sourceRequest.patternLineKey !== row.patternLineKey ||
          sourceRequest.cardLockVersion !== row.cardLockVersion
        )
          throw new Error('Verified durable/native source row bindings differ.');
        const done = await work(
          signal,
          async (op) => {
            ticket = op;
            op.borrowedReceipt = r.verifiedReceipt;
            admission = null;
            dropBridges();
            unlinkSource();
            const precedingLife = sourceLife;
            epoch++;
            const expectedEpoch = epoch;
            sourceLife = new AbortController();
            const ownedLife = sourceLife;
            unlinkSource = link(signal, ownedLife);
            const current = () => check(op, expectedEpoch);
            current();
            publish({ status: 'restoring', binding: null, detail: null });
            current();
            precedingLife.abort();
            current();
            await localWait(fresh(durable, op), op.controller.signal);
            current();
            const compiled = await host.consume(
              {
                sourceOwner: r.sourceOwner as DxfProductSavedNativeCompilerSourceOwnerV1,
                sourceRequest,
                expected: {
                  row,
                  serverAssemblyRevision: durable.serverAssemblyRevision,
                  fullAssemblySnapshotSha256: durable.freshSnapshotSha256,
                },
                seedOperationNumber: durable.seedOperationNumber,
                intent: restoredIntent(durable),
              },
              ownedLife.signal,
            );
            current();
            if (!compiled.ok || !compiled.result.compiled)
              throw new Error('Genuine native/full assembly compile refused the restored source.');
            const generation = compiled.result.generation;
            const initial = await host.bindInitialization(
              durable.physicalInitialization,
              generation,
              op.controller.signal,
            );
            current();
            if (!initial.ok) throw new Error(initial.detail);
            const publicBinding = Object.freeze({
              sourceGeneration: generation,
              graphCanonicalSha256: durable.graphCanonicalSha256,
              compileInputSha256: durable.compileInputSha256,
              physicalInitializationCanonicalSha256: durable.physicalInitializationCanonicalSha256,
              outerSha256: durable.outer.sha256,
              freshSnapshotSha256: durable.freshSnapshotSha256,
            });
            a = {
              durable,
              generation,
              epoch: expectedEpoch,
              sourceLife: ownedLife,
              publicBinding,
              ...(compiled.result.registeredCut && {
                registeredCut: structuredClone(compiled.result.registeredCut),
              }),
            };
            admission = a;
            const t = await verify(a, op);
            terminal(a, op, t);
            return { a, t };
          },
          true,
        );
        terminal(done.value.a, done.op, done.value.t, true);
        publish({ status: 'ready', binding: done.value.a.publicBinding, detail: null });
        terminal(done.value.a, done.op, done.value.t, true);
        return { ok: true as const, binding: done.value.a.publicBinding, claims: CLAIMS };
      } catch (error) {
        // The admitted async closure assigns this ticket before any owned mutation.
        const admittedTicket = ticket as Operation | null;
        if (!a && admittedTicket && !disposed && serial === admittedTicket.id) {
          publish({ status: 'blocked', binding: null, detail: reason(error) });
        }
        return failAccepted(a, ticket, error, signal);
      } finally {
        releaseReads(ticket);
      }
    },
    async preparePlacementEdit(signal?: AbortSignal): Promise<SavedV7PlacementEditV1> {
      let ticket: Operation | null = null;
      try {
        const done = await work(signal, async (op) => {
          ticket = op;
          const a = editableAdmission();
          const t = await verify(a, op);
          terminal(a, op, t);
          const pieces = a.durable.physicalInitialization.placements.map(
            ({ pieceId, translationM }) => {
              const piece = a.durable.graph.pieces.find((p) => p.pieceId === pieceId);
              if (!piece) throw new Error('A saved placement has no exact source piece.');
              return Object.freeze({
                pieceId,
                pieceLineKey: piece.pieceLineKey,
                translationM: Object.freeze([...translationM] as [number, number, number]),
              });
            },
          );
          return { a, t, pieces };
        });
        terminal(done.value.a, done.op, done.value.t, true);
        placementEdit = Object.freeze({
          binding: done.value.a.publicBinding,
          pieces: Object.freeze(done.value.pieces),
        });
        return placementEdit;
      } finally {
        releaseReads(ticket);
      }
    },
    async savePlacementEdit(
      edit: SavedV7PlacementEditV1,
      requested: SavedV7PlacementChangeV1,
      signal?: AbortSignal,
    ) {
      let ticket: Operation | null = null;
      const change = capture(requested);
      try {
        const done = await work(signal, async (op) => {
          ticket = op;
          const a = editableAdmission();
          if (placementEdit !== edit || edit.binding !== a.publicBinding)
            throw new Error('The saved placement edit expired.');
          placementEdit = null;
          const original = a.durable.physicalInitialization;
          const placements = placementAfterEdit(original.placements, edit, change);
          const { persistCurrentSavedGenericObservedPhysicalHostV1 } = await import(
            'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-document-production-v1'
          );
          const t = await verify(a, op);
          terminal(a, op, t);
          const initial = await host.bindInitialization(
            { ...original, placements },
            a.generation,
            op.controller.signal,
          );
          check(op, a.epoch);
          if (!initial.ok) throw new Error(initial.detail);
          const result = await persistCurrentSavedGenericObservedPhysicalHostV1(
            host,
            a.generation,
            op.controller.signal,
          );
          check(op, a.epoch);
          if (!result.ok) throw new SavedV7PlacementPersistenceErrorV1(result);
          return result;
        });
        return done.value;
      } finally {
        releaseReads(ticket);
      }
    },
    run16: (lease: XpbdDeviceLease, signal?: AbortSignal) => run(16, lease, signal),
    run32: (lease: XpbdDeviceLease, signal?: AbortSignal) => run(32, lease, signal),
    async projectLatestRender(signal?: AbortSignal) {
      let accepted: Admission | null = null,
        ticket: Operation | null = null;
      try {
        const done = await work(signal, async (op) => {
          ticket = op;
          const a = admission;
          if (!a) throw new Error('No current durable binding.');
          accepted = a;
          await verify(a, op);
          bound(op, a);
          const result = await host.projectLatestRender(op.controller.signal);
          bound(op, a);
          if (!result.ok) throw new Error(result.detail);
          const t = await verify(a, op);
          return { a, t, result };
        });
        terminal(done.value.a, done.op, done.value.t, true);
        return { ...done.value.result, durableBinding: done.value.a.publicBinding, claims: CLAIMS };
      } catch (error) {
        return failAccepted(accepted, ticket, error, signal);
      } finally {
        releaseReads(ticket);
      }
    },
    async mountPreview(canvas: HTMLCanvasElement, signal?: AbortSignal) {
      let accepted: Admission | null = null,
        ticket: Operation | null = null;
      try {
        const done = await work(signal, async (op) => {
          ticket = op;
          const a = admission;
          if (!a) throw new Error('No current durable binding.');
          accepted = a;
          await verify(a, op);
          bound(op, a);
          dropBridge('preview');
          const result = await host.mountPreview(canvas, op.controller.signal);
          bound(op, a);
          if (!result.ok) throw new Error(result.detail);
          const t = await verify(a, op);
          terminal(a, op, t);
          op.retained = true;
          bridges.set('preview', op);
          return { a, t, result };
        });
        terminal(done.value.a, done.op, done.value.t, true);
        publish({ status: 'preview-ready', detail: null });
        terminal(done.value.a, done.op, done.value.t, true);
        return { ...done.value.result, durableBinding: done.value.a.publicBinding, claims: CLAIMS };
      } catch (error) {
        return failAccepted(accepted, ticket, error, signal);
      } finally {
        releaseReads(ticket);
      }
    },
    pickPreview(
      canvas: HTMLCanvasElement,
      scope: SavedGenericDurablePhysicalPreviewScopeV1,
      clientX: number,
      clientY: number,
      savedSeam?: SavedGenericDurablePhysicalPreviewSeamV1,
      measureSurface = false,
    ): SavedGenericDurablePhysicalPreviewHitV1 | null {
      const preview = previewAdmission();
      if (!preview || !matchesPreviewScope(scope, preview.durable) || !preview.current())
        return null;
      const seam = savedSeam ? currentN1Seam(savedSeam, preview.durable) : null;
      if (!preview.current()) return null;
      const hit = host.pickPreview(canvas, clientX, clientY, seam?.id, measureSurface);
      if (!hit || !preview.current()) return null;
      if (hit.kind === 'body') return hit;
      const { seamSide: runtimeSide, ...garment } = hit;
      const piece = preview.durable.graph.pieces.find(({ pieceId }) => pieceId === hit.pieceId);
      if (!piece) return null;
      const sideIndex = runtimeSide?.sideIndex;
      const side =
        seam && runtimeSide?.runtimeSeamId === seam.id && (sideIndex === 0 || sideIndex === 1)
          ? seam.sides[sideIndex]
          : null;
      return Object.freeze({
        ...garment,
        scopeKey: preview.durable.row.scopeKey,
        pieceLineKey: piece.pieceLineKey,
        ...(side &&
          sideIndex !== undefined &&
          side.pieceId === piece.pieceId &&
          side.pieceLineKey === piece.pieceLineKey && {
            seamSide: Object.freeze({
              seamId: seam!.sourceSeamKey,
              sideIndex,
              contourId: side.contourId,
              boundaryVertexIds: side.anchors,
            }),
          }),
      });
    },
    setPreviewSelectedPiece(
      canvas: HTMLCanvasElement,
      scope: SavedGenericDurablePhysicalPreviewScopeV1 | null,
      selection: SavedGenericDurablePhysicalPreviewPieceV1 | null,
      selectedSide?: SavedGenericDurablePhysicalPreviewSelectedSideV1,
      selectedEdge?: DxfGarmentObservedBoundaryEdgeV1,
    ): boolean {
      const preview = previewAdmission();
      if (!preview) return false;
      const { durable } = preview;
      let selectedPieceId: string | null = null;
      let runtimeSide: DxfGarmentObservedPreviewSeamSideV1 | undefined;
      let runtimeEdge: DxfGarmentObservedBoundaryEdgeV1 | undefined;
      try {
        if (selection && matchesPreviewScope(scope, durable)) {
          const requested = capture(record(selection, ['scopeKey', 'pieceId', 'pieceLineKey']));
          if (requested.scopeKey === durable.row.scopeKey) {
            const piece = durable.graph.pieces.find(
              ({ pieceId, pieceLineKey }) =>
                pieceId === requested.pieceId && pieceLineKey === requested.pieceLineKey,
            );
            selectedPieceId = piece?.pieceId ?? null;
            if (piece && selectedSide && !selectedEdge) {
              const candidate = record(selectedSide, ['seam', 'sideIndex']);
              const { sideIndex } = candidate;
              const seam = currentN1Seam(
                candidate.seam as SavedGenericDurablePhysicalPreviewSeamV1,
                durable,
              );
              if (
                seam &&
                (sideIndex === 0 || sideIndex === 1) &&
                seam.sides[sideIndex].pieceId === piece.pieceId &&
                seam.sides[sideIndex].pieceLineKey === piece.pieceLineKey
              )
                runtimeSide = Object.freeze({ runtimeSeamId: seam.id, sideIndex });
            }
            if (piece && selectedEdge && !selectedSide) {
              const edge = capture(record(selectedEdge, ['contourId', 'boundaryVertexIds']));
              if (
                typeof edge.contourId === 'string' &&
                Array.isArray(edge.boundaryVertexIds) &&
                edge.boundaryVertexIds.length === 2 &&
                edge.boundaryVertexIds.every((id) => typeof id === 'string' && id.length > 0) &&
                edge.boundaryVertexIds[0] !== edge.boundaryVertexIds[1]
              )
                runtimeEdge = Object.freeze({
                  contourId: edge.contourId,
                  boundaryVertexIds: Object.freeze([
                    edge.boundaryVertexIds[0],
                    edge.boundaryVertexIds[1],
                  ] as const),
                });
            }
          }
        }
      } catch {
        // A stale or malformed selection also clears a previously visible outline.
      }
      if (!preview.current()) return false;
      const rendered = host.setPreviewSelectedPiece(
        canvas,
        selectedPieceId,
        runtimeSide,
        runtimeEdge,
      );
      return (
        rendered &&
        preview.current() &&
        (selection === null || selectedPieceId !== null) &&
        (!selectedSide || !!runtimeSide) &&
        (!selectedEdge || !!runtimeEdge)
      );
    },
    async stopPreview() {
      // Preview effect cleanup must not cancel the separately owned source restore/compile.
      if (disposed || stopping || operation?.kind === 'restore') return;
      stopping = true;
      const ownEpoch = epoch;
      try {
        if (operation) {
          operation.stoppedByHost = true;
          operation.controller.abort();
          await operation.finished;
        }
        dropBridges();
        await host.stopPreview();
        if (!disposed && epoch === ownEpoch)
          publish({
            status: admission ? 'ready' : 'blocked',
            detail: host.getSnapshot().cleanupPending
              ? 'Submitted GPU work is still draining.'
              : null,
          });
      } finally {
        stopping = false;
      }
    },
    async dispose() {
      if (disposed) return false;
      disposed = true;
      epoch++;
      admission = null;
      unlinkSource();
      sourceLife.abort();
      operation?.controller.abort();
      unsubscribe();
      dropBridges();
      await host.dispose();
      if (operation) await operation.finished;
      publish({ status: 'disposed', binding: null });
      listeners.clear();
      return true;
    },
  });
}
export type SavedGenericDurablePhysicalHostV1 = ReturnType<
  typeof createSavedGenericDurablePhysicalHostV1
>;
