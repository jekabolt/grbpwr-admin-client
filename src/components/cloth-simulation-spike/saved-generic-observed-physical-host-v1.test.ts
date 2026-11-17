import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import { Buffer } from 'node:buffer';
import type {
  GetTechCardSavedAssemblySnapshotRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  bytesOf,
  semanticDocument,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import { createXpbdDeviceSession } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { createSavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import * as bodySessionApi from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
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
import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import {
  createSavedGenericObservedPhysicalHostV1,
  projectSavedGenericObservedPhysicalHostPersistenceContextV1,
  SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1,
} from './saved-generic-observed-physical-host-v1';

// Real native DXF/worker/graph/material compile/rigid placement/plan + genuine displayed-body session.
// ONLY HTTP transport, numeric GPU terminal receipts and preview are synthetic lifecycle ports.
// These tests establish wiring/currentness, not physical GPU or durable product acceptance.
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
let editWire:
  | ((
      wire: Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>> & {
        semanticSidecar?: TechCardPatternSemanticSidecar;
      },
    ) => void)
  | null = null;
let readCount = 0;
let beforeWireRead: (() => void | Promise<void>) | null = null;
let beforeModelRead: (() => void | Promise<void>) | null = null;
const cleanup: Array<() => void | Promise<void>> = [];
beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1();
});
beforeEach(() => {
  readCount = 0;
  beforeWireRead = null;
  beforeModelRead = null;
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
          return wire;
        },
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function fixture(isotropic = true) {
  const source = await createSavedThreePanelSourceV1(seed);
  cleanup.push(source.dispose);
  const observed = await sessionFixture();
  cleanup.push(() => {
    observed.input.dispose();
  });
  const body = createSavedModelDisplayedTriangleBodySessionV2(async () => {
    await beforeModelRead?.();
    return structuredClone(observed.state.model);
  });
  await body.observe(observed.input);
  cleanup.push(() => {
    body.dispose();
  });
  const host = createSavedGenericObservedPhysicalHostV1({ row: seed.row, bodySession: body });
  cleanup.push(() => host.dispose().then(() => {}));
  const raw = await savedThreePanelCompileRequestV1(seed, source);
  const ids = new Map(
    raw.intent.compile.materials.map((m) => [m.id, `explicit-host-isotropic-${m.id}`]),
  );
  const request = isotropic
    ? {
        ...raw,
        intent: {
          ...raw.intent,
          pieces: raw.intent.pieces.map((p) => ({ ...p, materialId: ids.get(p.materialId)! })),
          compile: {
            ...raw.intent.compile,
            materials: raw.intent.compile.materials.map((m, i) => ({
              ...m,
              id: ids.get(m.id)!,
              label: 'Explicit uncalibrated host lifecycle fixture',
              bendComplianceInvNm: { warp: i ? 0.0011 : 0.0006, weft: i ? 0.0011 : 0.0006 },
            })),
            continuumMaterials: raw.intent.compile.continuumMaterials.map((m) => ({
              ...m,
              materialId: ids.get(m.materialId)!,
            })),
          },
        },
      }
    : raw;
  return { source, observed, body, host, request };
}
async function initialize(f: Awaited<ReturnType<typeof fixture>>, sourceSignal?: AbortSignal) {
  const compiled = await f.host.consume(f.request, sourceSignal);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled));
  const authoring = await f.host.projectAuthoringContext(f.host.getSnapshot().sourceGeneration);
  if (!authoring.ok) throw new Error(authoring.detail);
  const doc: DxfGarmentPhysicalInitializationV1 = {
    schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
    graphCanonicalSha256: authoring.graphCanonicalSha256,
    compileInputSha256: authoring.compileInputSha256,
    convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
    placements: ['FRONT', 'BACK', 'SIDE'].map((pieceId, i) => ({
      pieceId,
      sourceOriginM: [i * 0.15, 0, 0],
      rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translationM: [1 + i * 0.1, 0.5, 0],
    })),
    observedTarget: authoring.observedTarget,
    support: 'none',
    replayProfile: 'garment-material-contact-replay/1',
  };
  const bound = await f.host.bindInitialization(doc, authoring.sourceGeneration);
  if (!bound.ok) throw new Error(JSON.stringify(bound));
  return { compiled, authoring, doc, bound };
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
describe('fixed generic physical host; genuine source/body with synthetic numeric transport', () => {
  it('compiles genuine separated3panels, binds explicit physical doc and preserves missing durable admission', async () => {
    const f = await fixture();
    const initialized = await initialize(f);
    expect(initialized.compiled.result.compileResult?.artifact?.assembly.pieces).toHaveLength(3);
    expect(initialized.bound.placementReport.claims.runtimeAuthority).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'initialization-bound',
      sourceGeneration: 1,
      durableAdmission: { available: false },
      claims: { durableGraphVerified: false, productAuthority: false, runtimeAuthority: false },
    });
    expect(Object.keys(f.host)).not.toContain('bodyOwner');
    expect(Object.keys(f.host)).not.toContain('sourceOwner');
    expect(readCount).toBeGreaterThan(10);
  }, 60000);
  it('original saved-source caller abort clears an initialized generation before any numeric child exists', async () => {
    const f = await fixture();
    const caller = new AbortController();
    await initialize(f, caller.signal);
    caller.abort();
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      initializationSha256: null,
      targetSha256: null,
      previewReceipt: null,
    });
    expect((await f.host.projectAuthoringContext(1)).ok).toBe(false);
    expect(ports.calls).toHaveLength(0);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 60000);
  it('uses actual private sourcegen, fixedprofile, samelease16→32, fresh postdrain reads and private preview', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease, device } = await borrowedLease();
    const before = readCount;
    const first = await f.host.runNumeric16(lease);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(ports.calls[0].request.hostCompileGeneration).toBe(1);
    expect(ports.calls[0].request.parameters).toEqual(
      SAVED_GENERIC_OBSERVED_NUMERIC_PROFILE_V1.parameters,
    );
    const second = await f.host.runNumeric32(lease);
    expect(second.ok, JSON.stringify(second)).toBe(true);
    expect(ports.calls[1].prior).toBeTruthy();
    expect(readCount).toBeGreaterThan(before);
    expect(device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(2);
    expect((await f.host.projectLatestRender()).ok).toBe(true);
    const controller = new AbortController();
    expect((await f.host.mountPreview({} as HTMLCanvasElement, controller.signal)).ok).toBe(true);
    controller.abort();
    expect(ports.previewDisposed).toBe(1);
    expect(lease.active).toBe(true);
    expect(device.destroy).not.toHaveBeenCalled();
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 60000);
  it('keeps preabort/busy calls from revoking a current or pending generation', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    const before = f.host.getSnapshot();
    const abort = new AbortController();
    abort.abort();
    expect((await f.host.runNumeric16(lease, abort.signal)).ok).toBe(false);
    expect(f.host.getSnapshot()).toBe(before);
    const gate = deferredSessionValue<void>();
    ports.pause = gate.promise;
    const pending = f.host.runNumeric16(lease);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(1), { timeout: 5000 });
    expect((await f.host.runNumeric16(lease)).ok).toBe(false);
    expect(ports.live.values().next().value?.signal.aborted).toBe(false);
    gate.resolve();
    ports.pause = null;
    expect((await pending).ok).toBe(true);
  }, 60000);
  it('caller abort after returned16 revokes only owned frames and preserves borrowed body/device', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease, device } = await borrowedLease();
    const controller = new AbortController();
    expect((await f.host.runNumeric16(lease, controller.signal)).ok).toBe(true);
    controller.abort();
    expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
    expect(f.host.getSnapshot().status).toBe('blocked');
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
    expect(lease.active).toBe(true);
    expect(device.destroy).not.toHaveBeenCalled();
  }, 60000);
  it('rejects changed current observed target before runtime and requires explicit rebind', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    f.observed.state.model = { ...f.observed.state.model!, updatedAt: '2026-11-18T00:00:00Z' };
    expect((await f.host.runNumeric16(lease)).ok).toBe(false);
    expect(ports.calls).toHaveLength(0);
  }, 60000);
  it('fresh source drift after syntheticGPU completion blocks publication and retains terminal evidence', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    ports.after = () => {
      editWire = (wire) => {
        wire.serverAssemblyRevision = 'asm:v1:' + '9'.repeat(32) + ':5';
      };
    };
    const result = await f.host.runNumeric16(lease);
    expect(result.ok).toBe(false);
    expect(f.host.getSnapshot().frame16Report?.reportSha256).toBe('1'.repeat(64));
    expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
  }, 60000);
  it('refuses original unequal bend material before numeric dispatch; does not silently max it', async () => {
    const f = await fixture(false);
    await initialize(f);
    const { lease } = await borrowedLease();
    const result = await f.host.runNumeric16(lease);
    expect(result.ok).toBe(false);
    expect(ports.calls).toHaveLength(0);
  }, 60000);
  it('malformed/stale initialization and metadata getters cannot replace the current binding', async () => {
    const f = await fixture();
    const { doc } = await initialize(f);
    const before = f.host.getSnapshot();
    const get = vi.fn(() => doc);
    const evil = Object.defineProperty({}, 'schemaVersion', { get });
    expect((await f.host.bindInitialization(evil as never, 1)).ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(f.host.getSnapshot()).toBe(before);
    expect((await f.host.bindInitialization(doc, 2)).ok).toBe(false);
    expect(f.host.getSnapshot()).toBe(before);
  }, 60000);
  it('body null and source replacement revoke frames; stopPreview does not consume another source', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    expect((await f.host.runNumeric16(lease)).ok).toBe(true);
    await f.body.observe(null);
    expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
    await f.host.stopPreview();
    expect(lease.active).toBe(true);
  }, 60000);
  it('keeps the private saved-source baseline detached from returned compiler DTO mutation', async () => {
    const f = await fixture();
    const compiled = await f.host.consume(f.request);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled));
    (compiled.result.evidence! as { serverAssemblyRevision: string }).serverAssemblyRevision =
      'mutated caller data';
    (
      compiled.result.compileResult!.artifact!.sourceEvidence as { inputSha256: string }
    ).inputSha256 = '0'.repeat(64);
    const projected = await f.host.projectAuthoringContext(1);
    expect(projected.ok, JSON.stringify(projected)).toBe(true);
  }, 60000);
  it('replaces32 without revoking private16 or initialization, and busy render reads preserve frames', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    expect((await f.host.runNumeric16(lease)).ok).toBe(true);
    expect((await f.host.runNumeric32(lease)).ok).toBe(true);
    const first16 = [...ports.live.keys()][0],
      old32 = [...ports.live.keys()][1];
    const gate = deferredSessionValue<void>();
    ports.pause = gate.promise;
    const rerun = f.host.runNumeric32(lease);
    await vi.waitFor(() => expect(ports.calls).toHaveLength(3), { timeout: 5000 });
    expect((await f.host.projectLatestRender()).ok).toBe(false);
    expect(ports.live.get(first16)?.signal.aborted).toBe(false);
    expect(ports.live.get(old32)?.signal.aborted).toBe(true);
    gate.resolve();
    ports.pause = null;
    expect((await rerun).ok).toBe(true);
    expect(f.host.getSnapshot().initializationSha256).toBeTruthy();
  }, 60000);
  it('returns on caller cancellation of held queue drain and stays busy until the borrowed queue settles', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease, device } = await borrowedLease(),
      gate = deferredSessionValue<void>(),
      controller = new AbortController();
    device.queue.onSubmittedWorkDone.mockImplementation(() => gate.promise);
    const pending = f.host.runNumeric16(lease, controller.signal);
    await vi.waitFor(() => expect(f.host.getSnapshot().cleanupPending).toBe(true), {
      timeout: 5000,
    });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(f.host.getSnapshot().cleanupPending).toBe(true);
    expect((await f.host.runNumeric16(lease)).ok).toBe(false);
    expect(lease.active).toBe(true);
    expect(device.destroy).not.toHaveBeenCalled();
    await f.host.stopPreview();
    gate.resolve();
    await vi.waitFor(() => expect(f.host.getSnapshot().cleanupPending).toBe(false));
  }, 60000);
  it('releases old same-canvas preview before creating replacement, then clears only lost preview receipt', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    await f.host.runNumeric16(lease);
    await f.host.runNumeric32(lease);
    const canvas = {} as HTMLCanvasElement;
    expect((await f.host.mountPreview(canvas)).ok).toBe(true);
    const caller = new AbortController();
    expect((await f.host.mountPreview(canvas, caller.signal)).ok).toBe(true);
    expect(ports.previewEvents).toEqual(['create', 'dispose', 'create']);
    caller.abort();
    expect(f.host.getSnapshot().previewReceipt).toBeNull();
    expect(f.host.getSnapshot().status).toBe('frame32-ready');
    expect([...ports.live.values()].every((c) => !c.signal.aborted)).toBe(true);
  }, 60000);
  it('refuses terminal publication if a subscriber synchronously clears the genuine body', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    const unsubscribe = f.host.subscribe(() => {
      if (f.host.getSnapshot().status === 'frame16-ready') void f.body.observe(null);
    });
    try {
      expect((await f.host.runNumeric16(lease)).ok).toBe(false);
      expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
    } finally {
      unsubscribe();
    }
  }, 60000);
  it('confirmed source drift during authoring read clears all owned frames, initialization and preview', async () => {
    const f = await fixture();
    await initialize(f);
    const { lease } = await borrowedLease();
    await f.host.runNumeric16(lease);
    await f.host.runNumeric32(lease);
    await f.host.mountPreview({} as HTMLCanvasElement);
    editWire = (wire) => {
      wire.serverAssemblyRevision = 'asm:v1:' + '8'.repeat(32) + ':6';
    };
    expect((await f.host.projectAuthoringContext(1)).ok).toBe(false);
    expect([...ports.live.values()].every((c) => c.signal.aborted)).toBe(true);
    expect(ports.previewDisposed).toBe(1);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      initializationSha256: null,
      previewReceipt: null,
    });
    expect(lease.active).toBe(true);
  }, 60000);
});

/** Real Composite V3 bytes, transported only by the test fixture; no full graph admission. */
async function presentFixtureOuter(): Promise<TechCardPatternSemanticSidecar> {
  const initial = await fullAssemblyFixtureWireV1(seed, 10);
  const built = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: {
      row: seed.row,
      serverAssemblyRevision: initial.serverAssemblyRevision,
      assemblyTopologySha256: initial.assemblyTopologySha256,
    },
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: bytesOf(semanticDocument(seed.row)),
    exactTopologyBytes: null,
    placementV2Bytes: null,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.blockers));
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(built.owner);
  if (!encoded.ok) throw new Error('Real Composite fixture encode failed.');
  return {
    techCardId: seed.row.techCardId,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: 4,
    cardLockVersion: seed.row.cardLockVersion,
    savedRowRevision: seed.row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    byteLength: encoded.bytes.length,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
    postSaveReceiptSha256: undefined,
    createdAt: undefined,
    createdBy: undefined,
  };
}

describe('factory-authenticated fresh persistence context (no durable write authority)', () => {
  const project = projectSavedGenericObservedPhysicalHostPersistenceContextV1;

  it('rejects plain copies, proxies, getters and arbitrary callback objects without invoking them', async () => {
    const f = await fixture();
    const count = readCount;
    const invoked = vi.fn(() => {
      throw new Error('Must never invoke caller authority.');
    });
    const getter = Object.defineProperty({}, 'projectAuthoringContext', { get: invoked });
    const proxy = new Proxy(f.host, {
      get: invoked,
      getPrototypeOf: invoked,
      ownKeys: invoked,
    });
    const revocable = Proxy.revocable(f.host, {});
    revocable.revoke();
    for (const candidate of [
      null,
      7,
      getter,
      { projectAuthoringContext: invoked },
      { ...f.host },
      proxy,
      revocable.proxy,
    ]) {
      expect(await project(candidate, 1)).toMatchObject({ ok: false, code: 'unrecognized-host' });
    }
    expect(invoked).not.toHaveBeenCalled();
    expect(readCount).toBe(count);
  });

  it('requires a current bound initialization and rejects invalid generation without a fresh read', async () => {
    const f = await fixture();
    expect((await f.host.consume(f.request)).ok).toBe(true);
    expect(await project(f.host, 1)).toMatchObject({ ok: false, code: 'initialization-unbound' });
    const count = readCount;
    const coerce = vi.fn();
    for (const gen of [0, 2, NaN, 1.5, { [Symbol.toPrimitive]: coerce }]) {
      expect(await project(f.host, gen as number)).toMatchObject({
        ok: false,
        code: 'stale-generation',
      });
    }
    expect(coerce).not.toHaveBeenCalled();
    expect(readCount).toBe(count);
  }, 60000);

  it('replays real initialization and returns detached graph/AO/physical data with only ephemeral read evidence', async () => {
    const f = await fixture();
    const { authoring, doc, bound, compiled } = await initialize(f);
    const status = f.host.getSnapshot();
    const value = await project(f.host, 1);
    if (!value.ok) throw new Error(JSON.stringify(value));
    const pristine = structuredClone(value.context);
    expect(value.context).toMatchObject({
      schemaVersion: 'saved-generic-observed-physical-host-persistence-context/1',
      sourceGeneration: 1,
      graph: authoring.graph,
      graphCanonicalSha256: authoring.graphCanonicalSha256,
      compileInputSha256: authoring.compileInputSha256,
      physicalInitialization: { document: doc, canonicalSha256: bound.initializationSha256 },
      assemblySnapshot: { row: seed.row },
      readEvidence: {
        fullAssemblySnapshotSha256: compiled.result.evidence!.fullAssemblySnapshotSha256,
      },
      claims: {
        freshAtReadPublicationOnly: true,
        durableGraphVerified: false,
        physicalInitializationPersisted: false,
        productAuthority: false,
        runtimeAuthority: false,
      },
    });
    expect(Object.keys(value.context).sort()).toEqual([
      'assemblySnapshot',
      'claims',
      'compileInputSha256',
      'graph',
      'graphCanonicalSha256',
      'physicalInitialization',
      'readEvidence',
      'schemaVersion',
      'sourceGeneration',
    ]);
    expect(ports.calls).toHaveLength(0);
    // Caller mutation cannot replace the private source baseline or bound document.
    Object.assign(value.context.graph.source, { nativeDxfSha256: '0'.repeat(64) });
    Object.assign(value.context.assemblySnapshot.row, { cardLockVersion: 999 });
    Object.assign(value.context.physicalInitialization.document, {
      compileInputSha256: '1'.repeat(64),
    });
    Object.assign(value.context.claims, { productAuthority: true });
    expect(await project(f.host, 1)).toEqual({ ok: true, context: pristine });
    expect(f.host.getSnapshot()).toBe(status);
  }, 60000);

  it('retains the genuine host identity across source replacement but refuses the old generation and initialization', async () => {
    const f = await fixture();
    const { doc, authoring } = await initialize(f);
    expect((await project(f.host, 1)).ok).toBe(true);
    const next = await createSavedThreePanelSourceV1(seed);
    cleanup.push(next.dispose);
    const nextRaw = await savedThreePanelCompileRequestV1(seed, next);
    expect((await f.host.consume({ ...nextRaw, intent: f.request.intent })).ok).toBe(true);
    expect(f.host.getSnapshot().sourceGeneration).toBe(2);
    expect(await project(f.host, 1)).toMatchObject({ ok: false, code: 'stale-generation' });
    expect(await project(f.host, 2)).toMatchObject({ ok: false, code: 'initialization-unbound' });
    const context = await f.host.projectAuthoringContext(2);
    if (!context.ok) throw new Error(context.detail);
    expect(context.graphCanonicalSha256).toBe(authoring.graphCanonicalSha256);
    expect(context.compileInputSha256).toBe(authoring.compileInputSha256);
    expect((await f.host.bindInitialization(doc, 2)).ok).toBe(true);
    expect(await project(f.host, 2)).toMatchObject({ ok: true, context: { sourceGeneration: 2 } });
  }, 60000);

  it.each(['body-null', 'body-revision'] as const)(
    'refuses a revoked or changed body (%s)',
    async (mode) => {
      const f = await fixture();
      await initialize(f);
      if (mode === 'body-null') await f.body.observe(null);
      else
        f.observed.state.model = { ...f.observed.state.model!, updatedAt: '2026-11-18T00:00:00Z' };
      expect((await project(f.host, 1)).ok).toBe(false);
      expect(f.host.getSnapshot()).toMatchObject({
        status: 'blocked',
        initializationSha256: null,
        targetSha256: null,
        sourceGeneration: 1,
      });
      expect(ports.calls).toHaveLength(0);
    },
    60000,
  );

  it.each(['ao', 'outer'] as const)(
    'revokes stale source/init when actual fixed read detects %s drift',
    async (mode) => {
      const f = await fixture();
      await initialize(f);
      const outer = await presentFixtureOuter();
      editWire = (wire) => {
        if (mode === 'ao') wire.serverAssemblyRevision = 'asm:v1:' + '9'.repeat(32) + ':5';
        else {
          wire.semanticSidecar = outer;
        }
      };
      expect((await project(f.host, 1)).ok).toBe(false);
      expect(f.host.getSnapshot()).toMatchObject({ status: 'blocked', initializationSha256: null });
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    },
    60000,
  );

  it('preserves source/init/body on preabort, busy read and local cancellation of a held fresh read', async () => {
    const f = await fixture();
    await initialize(f);
    const before = f.host.getSnapshot();
    const pre = new AbortController();
    pre.abort();
    const count = readCount;
    expect((await project(f.host, 1, pre.signal)).ok).toBe(false);
    expect(readCount).toBe(count);
    const gate = deferredSessionValue<void>(),
      entered = deferredSessionValue<void>();
    beforeWireRead = () => {
      entered.resolve();
      return gate.promise;
    };
    const caller = new AbortController();
    const pending = project(f.host, 1, caller.signal);
    await entered.promise;
    expect((await project(f.host, 1)).ok).toBe(false);
    expect(f.host.getSnapshot()).toBe(before);
    caller.abort();
    expect((await pending).ok).toBe(false); // Returns without waiting for the fixture transport.
    expect(f.host.getSnapshot()).toBe(before);
    beforeWireRead = null;
    gate.resolve();
    expect((await project(f.host, 1)).ok).toBe(true);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
    expect(f.host.getSnapshot()).toBe(before);
  }, 60000);

  it('deletes factory recognition synchronously on dispose and refuses late held-read publication', async () => {
    const f = await fixture();
    await initialize(f);
    const gate = deferredSessionValue<void>(),
      entered = deferredSessionValue<void>();
    beforeWireRead = () => {
      entered.resolve();
      return gate.promise;
    };
    const pending = project(f.host, 1);
    await entered.promise;
    const disposed = f.host.dispose();
    expect(await project(f.host, 1)).toMatchObject({ ok: false, code: 'unrecognized-host' });
    expect((await pending).ok).toBe(false);
    beforeWireRead = null;
    gate.resolve();
    await disposed;
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 60000);

  it('refuses body replacement after the final genuine async target result but before host publication', async () => {
    const f = await fixture();
    await initialize(f);
    const original = bodySessionApi.projectCurrentSavedModelGenericObservedTargetV1;
    let reads = 0;
    // Observe the REAL fixed projector's return; no synthetic target, owner or success is injected.
    const spy = vi
      .spyOn(bodySessionApi, 'projectCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++reads === 2)
          queueMicrotask(() => {
            void f.body.observe(null);
          });
        return result;
      });
    try {
      const result = await project(f.host, 1);
      expect(reads).toBe(2);
      expect(result.ok).toBe(false);
      expect(f.host.getSnapshot()).toMatchObject({
        sourceGeneration: 1,
        status: 'blocked',
        initializationSha256: null,
        targetSha256: null,
      });
    } finally {
      spy.mockRestore();
    }
  }, 60000);

  it('rejects an old target projection after a fully rebound same-content body turn', async () => {
    const f = await fixture();
    await initialize(f);
    const original = bodySessionApi.projectCurrentSavedModelGenericObservedTargetV1;
    let reads = 0;
    const spy = vi
      .spyOn(bodySessionApi, 'projectCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++reads === 2) {
          await f.body.observe(null);
          await f.body.observe(f.observed.input);
          const replacement = await original(...args);
          if (!result.ok || !replacement.ok) throw new Error('Expected genuine body targets.');
          expect(replacement.canonicalSha256).toBe(result.canonicalSha256);
          expect(replacement.target).toEqual(result.target);
        }
        return result;
      });
    try {
      expect((await project(f.host, 1)).ok).toBe(false);
      expect(reads).toBe(2);
      expect(f.host.getSnapshot()).toMatchObject({
        sourceGeneration: 1,
        status: 'blocked',
        initializationSha256: null,
        targetSha256: null,
      });
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
    // A body edit invalidates physical binding, not the genuine saved DXF compile generation.
    expect((await f.host.projectAuthoringContext(1)).ok).toBe(true);
  }, 60000);

  it('rechecks host disposal after the final genuine synchronous body-currentness poll', async () => {
    const f = await fixture();
    await initialize(f);
    const original = bodySessionApi.isCurrentSavedModelGenericObservedTargetV1;
    let polls = 0,
      terminal = Infinity;
    let disposing: Promise<boolean> | null = null;
    const spy = vi
      .spyOn(bodySessionApi, 'isCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation((...args) => {
        const current = original(...args);
        if (++polls === terminal) disposing = f.host.dispose();
        return current;
      });
    try {
      expect((await project(f.host, 1)).ok).toBe(true);
      terminal = polls;
      expect(terminal).toBeGreaterThan(0);
      polls = 0;
      expect((await project(f.host, 1)).ok).toBe(false);
      expect(disposing).not.toBeNull();
      await disposing;
      expect(await project(f.host, 1)).toMatchObject({ ok: false, code: 'unrecognized-host' });
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
  }, 60000);

  it('refuses reentrant disposal from the last actual body freshness read and leaves borrowed body usable', async () => {
    const f = await fixture();
    await initialize(f);
    let reads = 0;
    beforeModelRead = () => {
      reads++;
    };
    const historical = await project(f.host, 1);
    if (!historical.ok) throw new Error(JSON.stringify(historical));
    expect(reads).toBeGreaterThan(0);
    const terminal = reads;
    reads = 0;
    let disposing: Promise<boolean> | null = null;
    beforeModelRead = () => {
      if (++reads === terminal) disposing = f.host.dispose();
    };
    expect((await project(f.host, 1)).ok).toBe(false);
    expect(disposing).not.toBeNull();
    await disposing;
    beforeModelRead = null;
    expect(await project(f.host, 1)).toMatchObject({ ok: false, code: 'unrecognized-host' });
    expect(historical.context.claims.productAuthority).toBe(false);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 60000);
});
