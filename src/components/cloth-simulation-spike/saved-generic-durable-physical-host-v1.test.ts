import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { abortableAdminService } from 'api/api';
import type {
  GetTechCardSavedAssemblySnapshotRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import { createXpbdDeviceSession } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { createSavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import * as bodyApi from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import {
  sessionFixture,
  deferredSessionValue,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
  type SavedThreePanelFixtureV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';
import * as snapshotApi from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-snapshot-production-v1';
import * as physicalReader from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-snapshot-production-v1';
import * as V3 from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import * as V4 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v4';
import * as V5 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v5';
import * as V6 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v6';
import * as V7 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v7';
import * as component from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-component-v1';
import * as arrangement from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-arrangement-document-v1';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-consistency-carrier-v2';
import {
  bytesOf,
  semanticDocument,
  candidate,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  encodeDxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import {
  createSavedGenericObservedPhysicalHostV1,
  projectSavedGenericObservedPhysicalHostPersistenceContextV1,
} from './saved-generic-observed-physical-host-v1';
import { createSavedGenericDurablePhysicalHostV1 } from './saved-generic-durable-physical-host-v1';

// Real native DXF/worker/compiler, V3→V7 encoders, fixed fresh reader and genuine body session.
// HTTP storage, declared synthetic observed triangle geometry, and GPU/preview lifecycle ports are fixtures.
// Native/compiler/body ownership and durable verification are real; this is not GPU/V11/fit acceptance.
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
const ports = vi.hoisted(() => ({
  calls: [] as Array<{ frame: number; request: Record<string, unknown>; prior: unknown }>,
  live: new Map<object, AbortController>(),
  pause: null as Promise<void> | null,
  after: null as (() => void) | null,
  previewDisposed: 0,
  previewEvents: [] as string[],
  previewSignals: [] as AbortSignal[],
}));
vi.mock('./dxf-garment-observed-webgpu-replay-v1', () => {
  const run = async (
    request: Record<string, unknown>,
    frame: number,
    prior: unknown,
    signal: AbortSignal,
  ) => {
    const controller = new AbortController(),
      owner = Object.freeze({ syntheticNumericFrame: frame });
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    controller.signal.addEventListener('abort', () => signal.removeEventListener('abort', cancel), {
      once: true,
    });
    if (signal.aborted) controller.abort();
    ports.live.set(owner, controller);
    ports.calls.push({ frame, request, prior });
    ports.after?.();
    if (ports.pause) await ports.pause;
    return {
      ok: true,
      owner,
      report: {
        status: 'diagnostic-completed',
        frameCount: frame,
        reportSha256: String(frame === 16 ? 1 : 2).repeat(64),
        checkpoint16Matched: frame === 32,
        claims: { numericReplayOnly: true, runtimeAuthority: false, productAuthority: false },
      },
      blockers: [],
    };
  };
  return {
    DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1: 'dxf-garment-observed-webgpu-replay/1',
    DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1: 'garment-material-contact-replay/1',
    runDxfGarmentObservedWebgpu16ReplayV1: (
      r: Record<string, unknown>,
      _l: unknown,
      s: AbortSignal,
    ) => run(r, 16, null, s),
    runDxfGarmentObservedWebgpu32ReplayV1: (
      r: Record<string, unknown>,
      p: unknown,
      _l: unknown,
      s: AbortSignal,
    ) => run(r, 32, p, s),
    getDxfGarmentObservedWebgpuReplayLifetimeV1: (o: object) =>
      ports.live.get(o)?.signal.aborted === false ? ports.live.get(o)!.signal : null,
    disposeDxfGarmentObservedWebgpuReplayV1: (o: object) => {
      ports.live.get(o)?.abort();
      return true;
    },
    projectDxfGarmentObservedWebgpuRenderV1: async (o: object) =>
      ports.live.get(o)?.signal.aborted === false ? { declaredSyntheticRender: true } : null,
  };
});
vi.mock('./dxf-garment-observed-strain-heatmap-preview-v1', () => ({
  createDxfGarmentObservedStrainHeatmapPreviewV1: async (
    _canvas: unknown,
    _owner: unknown,
    signal: AbortSignal,
  ) => {
    ports.previewSignals.push(signal);
    ports.previewEvents.push('create');
    const controller = new AbortController();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      ports.previewDisposed++;
      ports.previewEvents.push('dispose');
      controller.abort();
      signal.removeEventListener('abort', dispose);
    };
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted) dispose();
    return { receipt: { declaredSyntheticPreview: true }, lifetime: controller.signal, dispose };
  },
}));

let seed: SavedThreePanelFixtureV1;
let outer: TechCardPatternSemanticSidecar | undefined;
let readCount = 0;
let beforeWireRead: (() => void | Promise<void>) | null = null;
let editWire: ((wire: Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>>) => void) | null = null;
const cleanup: Array<() => unknown> = [];
beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1();
});
beforeEach(() => {
  outer = undefined;
  readCount = 0;
  beforeWireRead = null;
  editWire = null;
  ports.calls.length = 0;
  ports.live.clear();
  ports.pause = null;
  ports.after = null;
  ports.previewDisposed = 0;
  ports.previewEvents.length = 0;
  ports.previewSignals.length = 0;
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: async (r: GetTechCardSavedAssemblySnapshotRequest) => {
          readCount++;
          await beforeWireRead?.();
          const wire = await fullAssemblyFixtureWireV1(seed, r.selectedOperationNumber!);
          editWire?.(wire);
          return { ...wire, semanticSidecar: outer ? structuredClone(outer) : undefined };
        },
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});
afterEach(async () => {
  beforeWireRead = null;
  editWire = null;
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
function requireOk<T extends { ok: boolean }>(v: T): Extract<T, { ok: true }> {
  if (!v.ok) throw new Error(JSON.stringify(v));
  return v as Extract<T, { ok: true }>;
}
/** Nested legacy metadata is only a declared storage transport anchor, never graph/body authority. */
async function encodedStorage(
  context: Extract<
    Awaited<ReturnType<typeof projectSavedGenericObservedPhysicalHostPersistenceContextV1>>,
    { ok: true }
  >['context'],
) {
  const fullReceipt = await snapshotApi.readSavedFullAssemblySnapshotV1({
    row: seed.row,
    seedOperationNumber: 10,
  });
  let full;
  try {
    full = snapshotApi.projectSavedFullAssemblySnapshotV1(fullReceipt);
  } finally {
    snapshotApi.disposeSavedFullAssemblySnapshotV1(fullReceipt);
  }
  const bindings = {
    row: seed.row,
    serverAssemblyRevision: full.serverAssemblyRevision,
    assemblyTopologySha256: full.selectedTopologyReceipts.find(
      (x) => x.sourceOperationNumber === 10,
    )!.sha256,
  };
  const v3 = requireOk(
    await V3.buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: V3.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(seed.row)),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    }),
  );
  const e3 = requireOk(V3.encodePatternImportDxfProductCompositeSidecarV3(v3.owner));
  const exact = requireOk(
    await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2({
      ...candidate(1),
      ...bindings,
    }),
  );
  const eExact = requireOk(
    await V4.encodePatternImportDxfProductExactNSeamComponentV4({
      carrier: exact.carrier,
      seal: exact.seal,
    }),
  );
  const v4 = requireOk(
    await V4.buildPatternImportDxfProductCompositeSidecarV4({
      schemaVersion: V4.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
      bindings,
      expectedPreviousSidecarSha256: e3.canonicalSha256,
      compositeV3Bytes: e3.bytes,
      exactNSeamConsistencyBytes: eExact.bytes,
    }),
  );
  const e4 = requireOk(V4.encodePatternImportDxfProductCompositeSidecarV4(v4.owner));
  const annotation = requireOk(
    await V5.encodePatternImportDxfPhaseETopologyAnnotationsV1({
      schemaVersion: V5.PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
      bindings: V5.derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(bindings, {
        identity: 'declared-storage-anchor',
        revision: '1',
        sha256: seed.row.sha256,
      }),
      measurements: [],
      callouts: [],
    }),
  );
  const v5 = requireOk(
    await V5.buildPatternImportDxfProductCompositeSidecarV5({
      schemaVersion: V5.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
      bindings,
      expectedPreviousSidecarSha256: e4.canonicalSha256,
      compositeV4Bytes: e4.bytes,
      topologyAnnotationsBytes: annotation.bytes,
    }),
  );
  const e5 = requireOk(V5.encodePatternImportDxfProductCompositeSidecarV5(v5.owner));
  const target = context.physicalInitialization.document.observedTarget.target;
  const arrangementDoc = arrangement.createCadMannequinArrangementDocumentV1({
    bindings: {
      card: { techCardId: seed.row.techCardId, cardLockVersion: seed.row.cardLockVersion },
      scope: {
        scopeKey: seed.row.scopeKey,
        patternLineKey: seed.row.patternLineKey,
        sizeToken: context.graph.source.sizeToken,
      },
      savedRow: { revision: seed.row.revision, dxfSha256: seed.row.sha256 },
      source: {
        catalogCanonicalSha256: context.graphCanonicalSha256,
        sizeSelectionCanonicalSha256: context.compileInputSha256,
      },
      mannequin: {
        baseModelId: target.persistedModel.id,
        modelFormRevisionKeyV1: target.displayedModel.modelContentRevision,
        poseBinding: { canonicalKey: JSON.stringify(target.pose.document) },
      },
    },
    pieces: context.graph.pieces.map((p) => ({
      pieceKey: `fixture:${p.pieceId}`,
      scopeKey: seed.row.scopeKey,
      pieceId: p.pieceId,
      pieceLineKey: p.pieceLineKey,
      transform: { offsetM: [0, 0, 0], rotationRad: 0 },
    })),
  });
  const v6 = requireOk(
    await V6.buildPatternImportDxfProductCompositeSidecarV6({
      schemaVersion: V6.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
      expectedPreviousSidecarSha256: e5.canonicalSha256,
      compositeV5Bytes: e5.bytes,
      mannequinArrangementBytes: new TextEncoder().encode(
        arrangement.encodeCadMannequinArrangementDocumentV1(arrangementDoc),
      ),
    }),
  );
  const e6 = requireOk(V6.encodePatternImportDxfProductCompositeSidecarV6(v6.owner));
  const physical = await encodeDxfGarmentPhysicalInitializationV1({
    document: context.physicalInitialization.document,
    graph: context.graph,
    assemblySnapshot: context.assemblySnapshot,
  });
  const part = requireOk(
    await component.buildSavedFullAssemblyPhysicalComponentV1({
      bindings: { row: seed.row, serverAssemblyRevision: full.serverAssemblyRevision },
      graph: context.graph,
      graphCanonicalSha256: context.graphCanonicalSha256,
      compileInputSha256: context.compileInputSha256,
      physicalInitializationBytes: physical.bytes,
      assemblySnapshot: full,
    }),
  );
  const encodedPart = requireOk(component.encodeSavedFullAssemblyPhysicalComponentV1(part.owner));
  const v7 = requireOk(
    await V7.buildPatternImportDxfProductCompositeSidecarV7({
      schemaVersion: V7.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
      expectedPreviousSidecarSha256: e6.canonicalSha256,
      bindings,
      compositeV6Bytes: e6.bytes,
      fullAssemblyPhysicalBytes: encodedPart.bytes,
    }),
  );
  const encoded = requireOk(V7.encodePatternImportDxfProductCompositeSidecarV7(v7.owner));
  return {
    techCardId: seed.row.techCardId,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: 4,
    cardLockVersion: seed.row.cardLockVersion,
    savedRowRevision: seed.row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType: V7.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
    byteLength: encoded.bytes.length,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
    postSaveReceiptSha256: undefined,
    createdAt: undefined,
    createdBy: undefined,
  } satisfies TechCardPatternSemanticSidecar;
}
async function fixture() {
  const observed = await sessionFixture();
  cleanup.push(() => observed.input.dispose());
  const body = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(observed.state.model),
  );
  await body.observe(observed.input);
  cleanup.push(() => body.dispose());
  const native = await createSavedThreePanelSourceV1(seed);
  cleanup.push(native.dispose);
  const pre = createSavedGenericObservedPhysicalHostV1({ row: seed.row, bodySession: body });
  cleanup.push(() => pre.dispose());
  const raw = await savedThreePanelCompileRequestV1(seed, native);
  // Explicitly authored isotropic materials; no conversion or fallback from anisotropic source.
  const materialIds = new Map(
    raw.intent.compile.materials.map((m) => [m.id, `explicit-durable-fixture-isotropic-${m.id}`]),
  );
  const intent = {
    ...structuredClone(raw.intent),
    pieces: raw.intent.pieces.map((p) => ({ ...p, materialId: materialIds.get(p.materialId)! })),
    compile: {
      ...structuredClone(raw.intent.compile),
      materials: raw.intent.compile.materials.map((m, i) => ({
        ...m,
        id: materialIds.get(m.id)!,
        label: 'Explicit isotropic durable-host lifecycle fixture',
        bendComplianceInvNm: { warp: i ? 0.0011 : 0.0006, weft: i ? 0.0011 : 0.0006 },
      })),
      continuumMaterials: raw.intent.compile.continuumMaterials.map((m) => ({
        ...m,
        materialId: materialIds.get(m.materialId)!,
      })),
    },
  };
  requireOk(await pre.consume({ ...raw, intent }));
  const author = requireOk(await pre.projectAuthoringContext(1));
  const doc: DxfGarmentPhysicalInitializationV1 = {
    schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
    graphCanonicalSha256: author.graphCanonicalSha256,
    compileInputSha256: author.compileInputSha256,
    convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
    placements: ['FRONT', 'BACK', 'SIDE'].map((pieceId, i) => ({
      pieceId,
      sourceOriginM: [i * 0.15, 0, 0],
      rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translationM: [1 + i * 0.1, 0.5, 0],
    })),
    observedTarget: author.observedTarget,
    support: 'none',
    replayProfile: 'garment-material-contact-replay/1',
  };
  requireOk(await pre.bindInitialization(doc, 1));
  const context = requireOk(
    await projectSavedGenericObservedPhysicalHostPersistenceContextV1(pre, 1),
  ).context;
  outer = await encodedStorage(context);
  // Real persisted outer changes the full snapshot; old source is correctly no longer usable.
  expect((await pre.projectAuthoringContext(1)).ok).toBe(false);
  await pre.dispose();
  const nextNative = await createSavedThreePanelSourceV1(seed);
  cleanup.push(nextNative.dispose);
  const next = await savedThreePanelCompileRequestV1(seed, nextNative);
  const reader = await physicalReader.readSavedFullAssemblyPhysicalSnapshotV1(
    { row: seed.row, seedOperationNumber: 10 },
    new AbortController().signal,
  );
  cleanup.push(() => physicalReader.disposeSavedFullAssemblyPhysicalSnapshotV1(reader));
  const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: body });
  cleanup.push(() => host.dispose());
  return {
    host,
    body,
    observed,
    native: nextNative,
    context,
    reader,
    request: {
      verifiedReceipt: reader,
      sourceOwner: next.sourceOwner,
      sourceRequest: next.sourceRequest,
    },
  };
}
async function borrowedLease() {
  const device = Object.assign(new EventTarget(), {
    limits: {
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 134217728,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupsPerDimension: 65535,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxBindingsPerBindGroup: 8,
      maxStorageBuffersPerShaderStage: 8,
      maxUniformBuffersPerShaderStage: 4,
      maxBindGroups: 4,
    },
    lost: new Promise<never>(() => {}),
    queue: { onSubmittedWorkDone: vi.fn(async () => {}) },
    destroy: vi.fn(),
  });
  const session = await createXpbdDeviceSession(
    { getContext: () => ({ configure() {}, unconfigure() {} }) } as unknown as HTMLCanvasElement,
    {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({ requestDevice: async () => device }),
      } as never,
    },
  );
  cleanup.push(() => session.dispose().then(() => {}));
  const lease = session.acquireExclusive();
  cleanup.push(() => lease.release());
  return { lease, device };
}

describe('durable facade refusal before any stored V7 authority exists', () => {
  it('rejects arbitrary receipt DTOs, proxies and getters before source work or RPC', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    const getter = vi.fn();
    const receipts = [
      {
        version: 'saved-full-assembly-physical-snapshot/1',
        opaque: 'module-private-full-assembly-physical-read-receipt',
      },
      new Proxy({}, { get: getter }),
      Object.defineProperty({}, 'version', { get: getter }),
    ];
    for (const verifiedReceipt of receipts) {
      expect(
        (
          await host.restore({
            verifiedReceipt,
            sourceOwner: {} as never,
            sourceRequest: {
              schemaVersion: 'dxf-product-saved-native-compiler-source-request/1',
              sourceFileId: 'fixture',
              sourceSha256: seed.row.sha256,
              techCardId: seed.row.techCardId,
              scopeKey: seed.row.scopeKey,
              patternLineKey: seed.row.patternLineKey,
              cardLockVersion: seed.row.cardLockVersion,
              draft: {},
            } as never,
          })
        ).ok,
      ).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(readCount).toBe(0);
    expect(host.getSnapshot()).toMatchObject({ status: 'idle', binding: null });
  });
  it('pre-abort refuses without reading a request accessor or consuming source', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    const getter = vi.fn(),
      request = Object.defineProperty({}, 'verifiedReceipt', { get: getter }),
      caller = new AbortController();
    caller.abort();
    expect((await host.restore(request as never, caller.signal)).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(readCount).toBe(0);
    expect(host.getSnapshot()).toMatchObject({ status: 'idle', binding: null });
  });
  it('never dispatches numeric or render work before a genuine restore, including structural leases', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    expect((await host.run16({} as never)).ok).toBe(false);
    expect((await host.run32({} as never)).ok).toBe(false);
    expect((await host.mountPreview({} as HTMLCanvasElement)).ok).toBe(false);
    expect((await host.projectLatestRender()).ok).toBe(false);
    expect(ports.calls).toHaveLength(0);
    expect(readCount).toBe(0);
    expect(host.getSnapshot().binding).toBeNull();
  });
});

describe('fixed durable generic host, real encoded V7 and genuine fresh receipts', () => {
  it('restores exact complete intent through a fresh one-shot native owner and genuine reader', async () => {
    const f = await fixture();
    const result = await f.host.restore(f.request);
    expect(result).toMatchObject({
      ok: true,
      binding: {
        sourceGeneration: 1,
        graphCanonicalSha256: f.context.graphCanonicalSha256,
        compileInputSha256: f.context.compileInputSha256,
        physicalInitializationCanonicalSha256: f.context.physicalInitialization.canonicalSha256,
        outerSha256: outer!.sidecarSha256,
      },
    });
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      claims: {
        numericSnapshotIsCurrentAdmission: false,
        fitQualified: false,
        continuationQualified: false,
      },
    });
    expect(
      physicalReader.projectSavedFullAssemblyPhysicalSnapshotV1(f.reader).compileInputSha256,
    ).toBe(f.context.compileInputSha256);
    expect(Object.keys(f.host)).not.toContain('sourceOwner');
    expect(Object.keys(f.host)).not.toContain('bodyOwner');
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('rejects copied and proxy receipts without invoking getters, without consuming the native source', async () => {
    const f = await fixture(),
      getter = vi.fn();
    for (const receipt of [
      { ...f.reader },
      new Proxy(f.reader, { get: getter }),
      Object.defineProperty({}, 'version', { get: getter }),
    ]) {
      expect((await f.host.restore({ ...f.request, verifiedReceipt: receipt })).ok).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled();
    expect((await f.host.restore(f.request)).ok).toBe(true);
  }, 120000);

  it('keeps actual numeric ownership private, runs fixed16/fresh32 and mounts only after fresh durable checks', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease, device } = await borrowedLease();
    const count = readCount;
    expect((await f.host.run16(lease)).ok).toBe(true);
    expect((await f.host.run32(lease)).ok).toBe(true);
    expect((await f.host.mountPreview({} as HTMLCanvasElement)).ok).toBe(true);
    expect((await f.host.projectLatestRender()).ok).toBe(true);
    expect(readCount).toBeGreaterThan(count + 20);
    expect(ports.calls.map((x) => x.frame)).toEqual([16, 32]);
    expect(f.host.getSnapshot().status).toBe('preview-ready');
    await f.host.stopPreview();
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      binding: { sourceGeneration: 1 },
      numeric: { previewReceipt: null },
    });
    expect(device.destroy).not.toHaveBeenCalled();
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('preserves current binding and borrowed body when an explicit Stop cancels a held fresh read', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const reading = f.host.projectLatestRender();
    await started.promise;
    expect((await f.host.projectLatestRender()).ok).toBe(false); // busy must not revoke current state
    await f.host.stopPreview();
    expect((await reading).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      binding: { sourceGeneration: 1 },
    });
    beforeWireRead = null;
    gate.resolve();
    await Promise.resolve();
    expect((await f.host.run16(lease)).ok).toBe(true);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('local read cancellation preserves current admission and frames; preabort has no effect', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const caller = new AbortController(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const reading = f.host.projectLatestRender(caller.signal);
    await started.promise;
    caller.abort();
    expect((await reading).ok).toBe(false);
    expect(f.host.getSnapshot().binding).not.toBeNull();
    beforeWireRead = null;
    gate.resolve();
    expect((await f.host.run16(lease, caller.signal)).ok).toBe(false);
    expect(f.host.getSnapshot().binding).not.toBeNull();
    expect((await f.host.projectLatestRender()).ok).toBe(true);
  }, 120000);

  it('revokes frames and durable binding when the persisted complete outer changes', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    outer = undefined;
    expect((await f.host.run32(lease)).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      binding: null,
      numeric: { previewReceipt: null },
    });
    expect(ports.live.size).toBeGreaterThan(0);
    expect([...ports.live.values()].every((x) => x.signal.aborted)).toBe(true);
    expect((await f.host.run16(lease)).ok).toBe(false);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('checks caller-owned restore receipt again before publication and never disposes a borrowed live receipt', async () => {
    const f = await fixture();
    const gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(f.request);
    await started.promise;
    physicalReader.disposeSavedFullAssemblyPhysicalSnapshotV1(f.reader);
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(false);
    expect(f.host.getSnapshot().binding).toBeNull();
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
  it('rejects a same-content body turn rebound after the last genuine target projection and keeps the source', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    requireOk(await f.host.run32(lease));
    requireOk(await f.host.mountPreview({} as HTMLCanvasElement));
    const original = bodyApi.projectCurrentSavedModelGenericObservedTargetV1;
    let reads = 0,
      terminal = Infinity;
    const spy = vi
      .spyOn(bodyApi, 'projectCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++reads === terminal) {
          await f.body.observe(null);
          await f.body.observe(f.observed.input);
          const replacement = await original(...args);
          if (!result.ok || !replacement.ok)
            throw new Error('Genuine target fixture unexpectedly unavailable.');
          expect(replacement.canonicalSha256).toBe(result.canonicalSha256);
          expect(replacement.target).toEqual(result.target);
        }
        return result;
      });
    try {
      requireOk(await f.host.projectLatestRender());
      terminal = reads;
      reads = 0;
      expect(terminal).toBeGreaterThan(0);
      expect((await f.host.projectLatestRender()).ok).toBe(false);
      expect(reads).toBe(terminal);
      expect(f.host.getSnapshot()).toMatchObject({
        status: 'blocked',
        binding: null,
        numeric: { sourceGeneration: 1, previewReceipt: null },
      });
      expect((await f.host.run16(lease)).ok).toBe(false);
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
  }, 120000);

  it('refuses disposal reentrantly triggered by the last synchronous body-currentness poll', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const original = bodyApi.isCurrentSavedModelGenericObservedTargetV1;
    let polls = 0,
      terminal = Infinity,
      disposed: Promise<boolean> | null = null;
    const spy = vi
      .spyOn(bodyApi, 'isCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation((...args) => {
        const current = original(...args);
        if (++polls === terminal) disposed = f.host.dispose();
        return current;
      });
    try {
      requireOk(await f.host.projectLatestRender());
      terminal = polls;
      polls = 0;
      expect(terminal).toBeGreaterThan(0);
      expect((await f.host.projectLatestRender()).ok).toBe(false);
      expect(disposed).not.toBeNull();
      await disposed;
      expect(f.host.getSnapshot()).toMatchObject({ status: 'disposed', binding: null });
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
  }, 120000);

  it('preview cleanup during pending restore does not cancel the one-shot upstream native compile', async () => {
    const f = await fixture(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(f.request);
    await started.promise;
    await f.host.stopPreview();
    expect(f.host.getSnapshot().status).toBe('restoring');
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(true);
  }, 120000);

  it('source caller cancellation revokes restored admission but never the borrowed displayed body', async () => {
    const f = await fixture(),
      caller = new AbortController();
    requireOk(await f.host.restore(f.request, caller.signal));
    caller.abort();
    expect(f.host.getSnapshot()).toMatchObject({ status: 'blocked', binding: null });
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
  it('captures all restore intent fields before the first fresh-read await without cloning the native draft', async () => {
    const f = await fixture(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    const request = { ...f.request, sourceRequest: { ...f.request.sourceRequest } };
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(request);
    await started.promise;
    (request as unknown as Record<string, unknown>).verifiedReceipt = {};
    (request as unknown as Record<string, unknown>).sourceOwner = {};
    (request.sourceRequest as unknown as Record<string, unknown>).sourceFileId =
      'caller-mutated-after-admission';
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(true);
    expect(f.host.getSnapshot().binding?.compileInputSha256).toBe(f.context.compileInputSha256);
  }, 120000);

  it('refuses invalid or missing16 leases before changing an existing durable admission', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const binding = f.host.getSnapshot().binding;
    expect((await f.host.run16({} as never)).ok).toBe(false);
    const { lease } = await borrowedLease();
    expect((await f.host.run32(lease)).ok).toBe(false);
    expect(f.host.getSnapshot().binding).toBe(binding);
    expect((await f.host.run16(lease)).ok).toBe(true);
  }, 120000);

  it('preview-only caller abort clears the published view while preserving numeric frames and durable binding', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    requireOk(await f.host.run32(lease));
    const caller = new AbortController();
    requireOk(await f.host.mountPreview({} as HTMLCanvasElement, caller.signal));
    caller.abort();
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'frame32-ready',
      binding: { sourceGeneration: 1 },
      numeric: { previewReceipt: null },
    });
    expect((await f.host.projectLatestRender()).ok).toBe(true);
  }, 120000);

  it('refuses fresh saved-row drift and clears physical children without revoking the borrowed body', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    editWire = (wire) => {
      wire.row.savedRowRevision++;
    };
    expect((await f.host.projectLatestRender()).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      binding: null,
      numeric: { previewReceipt: null },
    });
    expect([...ports.live.values()].every((x) => x.signal.aborted)).toBe(true);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
});
