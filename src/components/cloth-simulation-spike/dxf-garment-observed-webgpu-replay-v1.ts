import {
  buildGarmentMaterialContactExecutionLayoutV1,
  decodeGarmentMaterialContactCheckpointV1,
  type GarmentMaterialContactExecutionLayoutV1,
  type GarmentMaterialContactExecutionLayoutRequestV1,
  type GarmentMaterialContactCheckpointV1,
} from 'lib/cloth/runtime/webgpu/garment-material-contact-execution-layout-v1';
/* global GPUDevice, GPUBuffer, GPUComputePipeline, GPUShaderModuleDescriptor, GPUCommandEncoder */
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  buildGarmentMaterialRunPlanV1,
  GARMENT_MATERIAL_RUN_PLAN_V1,
  type GarmentMaterialRunParametersV1,
  type GarmentMaterialRunBudgetsV1,
} from 'lib/cloth/runtime/webgpu/garment-material-run-plan-v1';
import {
  inspectOwnedActiveXpbdDeviceLeaseV1,
  type XpbdDeviceLease,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodySnapshotV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import {
  getXpbdPredictPipelineIdentityV1,
  xpbdPredictShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-predict-kernel-v1';
import {
  getXpbdDistancePipelineIdentityV1,
  xpbdDistanceShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-distance-kernel-v1';
import {
  getXpbdSeamSolvePipelineIdentityV1,
  xpbdSeamSolveShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-seam-solve-kernel-v1';
import {
  getXpbdEmbeddedScalarBendPipelineIdentityV2,
  xpbdEmbeddedScalarBendShaderDescriptorV2,
} from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';
import {
  getContinuumStrainVNextPipelineIdentityV1,
  continuumStrainVNextShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/triangle-strain-continuum-vnext-kernel';
import {
  getXpbdMaterialVelocityPipelineIdentityV2,
  xpbdMaterialVelocityShaderDescriptorV2,
} from 'lib/cloth/runtime/webgpu/xpbd-material-velocity-kernel-v2';
import {
  getXpbdInitializationCoreResetPipelineIdentityV1,
  xpbdInitializationCoreResetShaderDescriptorV1,
  type XpbdInitializationCoreResetKernelV1,
} from 'lib/cloth/runtime/webgpu/xpbd-initialization-core-reset-kernels';
import {
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_KERNEL_V2,
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2,
  getActualBodyTriangleMeshContactPipelineIdentityV2,
  actualBodyTriangleMeshContactShaderDescriptorV2,
} from 'lib/cloth/runtime/webgpu/actual-body-triangle-mesh-contact-kernel-v2';
import {
  sealTriangleStrainUtilizationPortV1,
  auditTriangleStrainUtilizationPortV1,
  evaluateTriangleStrainUtilizationCpuV1,
  TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
  TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1,
} from './beta-skirt-canonical-medium-strain-utilization-diagnostic-v1';
import {
  evaluateDxfGarmentObservedFrameValidationV1,
  DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1,
} from './dxf-garment-observed-frame-validation-v1';

export const DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1 =
  'dxf-garment-observed-webgpu-replay/1' as const;
export const DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1 =
  'garment-material-contact-replay/1' as const;
type CorePlan = Extract<
  Awaited<ReturnType<typeof buildGarmentMaterialRunPlanV1>>,
  { ok: true }
>['plan'];
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener,
  remove = EventTarget.prototype.removeEventListener;
const tp = Object.getPrototypeOf(Float32Array.prototype);
const tb = Object.getOwnPropertyDescriptor(tp, 'buffer')!.get!,
  to = Object.getOwnPropertyDescriptor(tp, 'byteOffset')!.get!,
  tl = Object.getOwnPropertyDescriptor(tp, 'byteLength')!.get!,
  tn = Object.getOwnPropertyDescriptor(tp, 'length')!.get!;
const abl = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const set = Uint8Array.prototype.set;
const SHA = /^[0-9a-f]{64}$/;
const CLAIMS = Object.freeze({
  numericReplayOnly: true,
  productAuthority: false,
  runtimeAuthority: false,
  sourcePersistenceAuthenticated: false,
  viewportAuthorityAuthenticated: false,
  persistedReaderAuthenticated: false,
  fitQualified: false,
  frictionImplemented: false,
  assemblyOperationScheduleExecuted: false,
  anisotropicBendSupported: false,
  continuationQualified: false,
  stressPaComputed: false,
  calibrated: false,
});
function fail(message: string): never {
  throw new Error(message);
}
/** Capture data before awaits; opaque owners/lease never enter this copier. */
function capture(value: unknown): unknown {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 3000000 || depth > 48) fail('Replay input bound exceeded.');
    if (
      v === null ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length <= 16384)
    )
      return v;
    if (!v || typeof v !== 'object' || active.has(v)) fail('Only acyclic finite data accepted.');
    const p = Object.getPrototypeOf(v),
      ab = p === ArrayBuffer.prototype,
      typed = p === Float32Array.prototype || p === Uint32Array.prototype;
    if (ab || typed) {
      const source = ab ? v : tb.call(v),
        n = ab ? abl.call(v) : tl.call(v);
      bytes += n;
      if (
        Object.getPrototypeOf(source) !== ArrayBuffer.prototype ||
        n > 32 * 1024 * 1024 ||
        bytes > 64 * 1024 * 1024
      )
        fail('Shared or over-budget replay bytes.');
      const len = ab ? 0 : tn.call(v);
      for (const key of Reflect.ownKeys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, key)!;
        if (
          ab ||
          typeof key !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= len ||
          !('value' in d) ||
          !d.enumerable
        )
          fail('Decorated binary data refused.');
      }
      const out = new ArrayBuffer(n);
      set.call(new Uint8Array(out), new Uint8Array(source, ab ? 0 : to.call(v), n));
      return ab ? out : p === Float32Array.prototype ? new Float32Array(out) : new Uint32Array(out);
    }
    const array = Array.isArray(v);
    if (p !== (array ? Array.prototype : Object.prototype)) fail('Unsupported data prototype.');
    const descriptors = Object.getOwnPropertyDescriptors(v),
      len = array ? descriptors.length.value : 0;
    if (len > 500000 || (array && Reflect.ownKeys(descriptors).length !== len + 1))
      fail('Array shape refused.');
    active.add(v);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      const d = descriptors[key as string];
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !('value' in d) ||
        !d.enumerable ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail('Accessors/symbols/hidden fields refused.');
      Object.defineProperty(out, key, {
        value: copy(d.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(v);
    return out;
  };
  return copy(value, 0);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function bytes(v: ArrayBuffer | ArrayBufferView) {
  return v instanceof ArrayBuffer
    ? new Uint8Array(v)
    : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}
async function hash(v: ArrayBuffer | ArrayBufferView) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes(v)))),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
function canonical(v: unknown): string {
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v))
    return JSON.stringify({
      kind: v instanceof ArrayBuffer ? 'bytes' : v instanceof Float32Array ? 'f32' : 'u32',
      hex: Array.from(bytes(v), (x) => x.toString(16).padStart(2, '0')).join(''),
    });
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
const dataHash = (v: unknown) =>
  hash(new TextEncoder().encode(DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1 + '\0' + canonical(v)));
function equal(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) {
  const x = bytes(a),
    y = bytes(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
function waitLocally<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      remove.call(signal, 'abort', abort);
      reject(new Error('Replay operation cancelled.'));
    };
    add.call(signal, 'abort', abort, { once: true });
    promise.then(
      (v) => {
        remove.call(signal, 'abort', abort);
        resolve(v);
      },
      (e) => {
        remove.call(signal, 'abort', abort);
        reject(e);
      },
    );
    if (nativeAborted.call(signal)) abort();
  });
}
function xyz(v: Float32Array) {
  const result = new Float32Array((v.length / 4) * 3);
  for (let i = 0; i < v.length / 4; i++)
    for (let a = 0; a < 3; a++) result[i * 3 + a] = v[i * 4 + a];
  return result;
}
function collisionInput(
  body: SavedModelDisplayedTriangleBodySnapshotV2,
  positions4: Float32Array,
  triangles: Uint32Array,
  generation: number,
  positionsSha256: string,
) {
  const b = body.binding;
  return {
    binding: {
      compositionGeneration: generation,
      snapshotGeneration: b.generation,
      modelId: b.displayedIdentity.modelId,
      modelContentRevision: b.displayedIdentity.modelContentRevision,
      inputFingerprint: b.displayedIdentity.inputFingerprint,
      canonicalContentFingerprint: b.canonicalContentFingerprint,
      basisKind: b.displayedIdentity.basisKind,
      posePresetId: 'accepted-pose;sha256=' + b.poseDocumentSha256,
      bodySourceRevision: 'saved-model-host-observed-body/v2;sha256=' + b.observedBodyContentSha256,
      garmentPositionsSha256: positionsSha256,
    },
    bodyPositionsM: body.bodyPositionsM.slice(),
    bodyTriangles: body.bodyTriangles.slice(),
    garmentPositionsM: xyz(positions4),
    garmentTriangles: triangles.slice(),
    garmentUniformScale: 1,
    garmentTranslationM: [0, 0, 0] as const,
  };
}

// Layout-dependent fixed API and encoder follow below. No externally supplied execution callbacks.
export type DxfGarmentObservedWebgpuReplayRequestV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1;
  profile: typeof DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1;
  placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1;
  bodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  bodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  /** Host metadata only; not authenticated as a saved compile generation. */
  hostCompileGeneration: number;
  parameters: Omit<GarmentMaterialRunParametersV1, 'frameCount'>;
  coreBudgets: GarmentMaterialRunBudgetsV1;
  executionBudgets: GarmentMaterialContactExecutionLayoutRequestV1['budgets'];
  expected: Readonly<{ placementReportSha256: string; prefixPlanSha256: string }>;
  timeoutMs: number;
}>;
type Validation = Awaited<ReturnType<typeof evaluateDxfGarmentObservedFrameValidationV1>>;
type Strain = Readonly<{
  values: Float32Array;
  flags: Uint32Array;
  renderTriangleIndices: Uint32Array;
  sourceTriangleIndices: Uint32Array;
  maximumCpuGpuAbsoluteDifference: number;
  passed: boolean;
  valuesSha256: string;
  flagsSha256: string;
  renderMappingSha256: string;
  sourceMappingSha256: string;
  units: 'dimensionless';
  restReference: 'immutable-local-v5';
  stressPaComputed: false;
}>;
type LayoutReceipt = Omit<
  GarmentMaterialContactExecutionLayoutV1,
  | 'uploads'
  | 'uniformPackets'
  | 'contactParams'
  | 'strainParams'
  | 'contactDiagnostics'
  | 'bendDiagnostics'
  | 'strainValues'
  | 'strainFlags'
  | 'strainOrder'
>;
type StrainReceipt = Omit<
  Strain,
  'values' | 'flags' | 'renderTriangleIndices' | 'sourceTriangleIndices'
> &
  Readonly<{ valueCount: number; triangleCount: number }>;
function layoutReceipt(
  layout: GarmentMaterialContactExecutionLayoutV1 | null,
): LayoutReceipt | null {
  if (!layout) return null;
  const omit = new Set([
    'uploads',
    'uniformPackets',
    'contactParams',
    'strainParams',
    'contactDiagnostics',
    'bendDiagnostics',
    'strainValues',
    'strainFlags',
    'strainOrder',
  ]);
  return Object.fromEntries(Object.entries(layout).filter(([k]) => !omit.has(k))) as LayoutReceipt;
}
function strainReceipt(strain: Strain | null): StrainReceipt | null {
  if (!strain) return null;
  return {
    maximumCpuGpuAbsoluteDifference: strain.maximumCpuGpuAbsoluteDifference,
    passed: strain.passed,
    valuesSha256: strain.valuesSha256,
    flagsSha256: strain.flagsSha256,
    renderMappingSha256: strain.renderMappingSha256,
    sourceMappingSha256: strain.sourceMappingSha256,
    units: strain.units,
    restReference: strain.restReference,
    stressPaComputed: strain.stressPaComputed,
    valueCount: strain.values.length,
    triangleCount: strain.flags.length,
  };
}
type Trace = {
  framesSubmitted: number;
  dispatchCount: number;
  submissionCount: number;
  copyCount: number;
  copyBytes: number;
  allocatedBytes: number;
  createdBufferCount: number;
  destroyedBufferCount: number;
  cleanupPending: boolean;
  borrowedLeaseReleased: false;
  borrowedDeviceDestroyed: false;
  validationMessages: string[];
};
export type DxfGarmentObservedWebgpuReplayReportV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1;
  frameCount: 16 | 32;
  reportSha256: string | null;
  bodyBinding: SavedModelDisplayedTriangleBodyBindingV2 | null;
  kernelIdentities:
    | (CorePlan['report']['kernels'] &
        Readonly<{
          contact: Readonly<{ id: string; sha256: string }>;
          strain: Readonly<{ id: string; sha256: string }>;
        }>)
    | null;
  diagnostics: Readonly<{
    checkpoint16: ReturnType<typeof diagnosticReceipt>;
    final: ReturnType<typeof diagnosticReceipt>;
  }> | null;
  status: 'diagnostic-completed' | 'blocked';
  stage: string;
  sourceBindingSha256: string | null;
  prefixPlanSha256: string | null;
  placementReportSha256: string | null;
  layout: LayoutReceipt | null;
  initialValidation: Validation | null;
  finalValidation: Validation | null;
  checkpoint16Sha256: string | null;
  finalStateSha256: string | null;
  checkpoint16Matched: boolean | null;
  strain: StrainReceipt | null;
  execution: Readonly<Trace>;
  blockers: readonly string[];
  claims: typeof CLAIMS;
}>;
declare const replayOwnerBrand: unique symbol;
export type DxfGarmentObservedWebgpuReplayOwnerV1 = Readonly<{
  version: typeof DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1;
  frameCount: 16 | 32;
  report: DxfGarmentObservedWebgpuReplayReportV1;
  readonly [replayOwnerBrand]: never;
}>;
type Receipt = {
  frameCount: 16 | 32;
  controller: AbortController;
  unlink: () => void;
  current: () => void;
  bodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  binding: SavedModelDisplayedTriangleBodyBindingV2;
  checkpoint16: Uint8Array;
  finalState: GarmentMaterialContactCheckpointV1;
  /** Private already-owned V5 topology; no caller geometry may replace it for rendering. */
  renderTriangles: Uint32Array;
  pieceRanges: CorePlan['report']['pieceRanges'];
  strain: Strain;
  sourceBindingSha256: string;
  report: DxfGarmentObservedWebgpuReplayReportV1;
};
const receipts = new WeakMap<object, Receipt>();
const busyLeases = new WeakSet<object>();
const receiptOf = (candidate: unknown) =>
  candidate && (typeof candidate === 'object' || typeof candidate === 'function')
    ? receipts.get(candidate as object)
    : undefined;
const STORAGE = 128,
  UNIFORM = 64,
  COPY_SRC = 4,
  COPY_DST = 8,
  MAP_READ = 1;
type Resources = {
  buffers: GPUBuffer[];
  pending: Promise<void> | null;
  drained: boolean;
  trace: Trace;
};
async function compilePipeline(
  device: GPUDevice,
  descriptor: GPUShaderModuleDescriptor,
  entryPoint: string,
  current: () => void,
  signal: AbortSignal,
) {
  current();
  const module = device.createShaderModule(descriptor);
  const info = await waitLocally(module.getCompilationInfo(), signal);
  current();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length) fail('WGSL compilation: ' + errors.map((m) => m.message).join('; '));
  const pipeline = await waitLocally(
    device.createComputePipelineAsync({
      label: descriptor.label,
      layout: 'auto',
      compute: { module, entryPoint },
    }),
    signal,
  );
  current();
  return pipeline;
}
async function executeGpu(
  device: GPUDevice,
  core: CorePlan,
  layout: GarmentMaterialContactExecutionLayoutV1,
  body: SavedModelDisplayedTriangleBodySnapshotV2,
  frameCount: 16 | 32,
  res: Resources,
  current: () => void,
  freshBody: () => Promise<unknown>,
  signal: AbortSignal,
) {
  const jobs = [
    ['predict', getXpbdPredictPipelineIdentityV1(), xpbdPredictShaderDescriptorV1()],
    ['distance', getXpbdDistancePipelineIdentityV1(), xpbdDistanceShaderDescriptorV1()],
    ['seam', getXpbdSeamSolvePipelineIdentityV1(), xpbdSeamSolveShaderDescriptorV1()],
    [
      'bend',
      getXpbdEmbeddedScalarBendPipelineIdentityV2(),
      xpbdEmbeddedScalarBendShaderDescriptorV2(),
    ],
    [
      'continuum',
      getContinuumStrainVNextPipelineIdentityV1(),
      continuumStrainVNextShaderDescriptorV1(),
    ],
    [
      'velocity',
      getXpbdMaterialVelocityPipelineIdentityV2(),
      xpbdMaterialVelocityShaderDescriptorV2(),
    ],
    [
      'contact',
      getActualBodyTriangleMeshContactPipelineIdentityV2(),
      actualBodyTriangleMeshContactShaderDescriptorV2(),
    ],
  ] as const;
  const pipelines: Record<string, GPUComputePipeline> = {};
  const identities = await Promise.all(jobs.map(([, pending]) => pending));
  current();
  for (let i = 0; i < jobs.length; i++) {
    const [name, , descriptor] = jobs[i];
    pipelines[name] = await compilePipeline(
      device,
      descriptor,
      identities[i].entryPoint,
      current,
      signal,
    );
  }
  for (const run of core.resets) {
    const kind = run.kind as XpbdInitializationCoreResetKernelV1,
      id = await getXpbdInitializationCoreResetPipelineIdentityV1(kind);
    current();
    pipelines['reset-' + kind] = await compilePipeline(
      device,
      xpbdInitializationCoreResetShaderDescriptorV1(kind),
      id.entryPoint,
      current,
      signal,
    );
  }
  const strainSha = await hash(
    new TextEncoder().encode(TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1),
  );
  current();
  if (strainSha !== 'd0ec81303ef3935c13163a365434a41b8af5f1f8244add4a93de74a071711386')
    fail('Strain shader identity changed.');
  pipelines.strain = await compilePipeline(
    device,
    { label: 'generic strain exact v1', code: TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1 },
    'main',
    current,
    signal,
  );
  const create = (name: string, data: ArrayBuffer | ArrayBufferView | number, usage: number) => {
    current();
    const size = typeof data === 'number' ? data : data.byteLength;
    if (size <= 0 || res.trace.allocatedBytes + size > layout.fullGpuBytes)
      fail('Allocation differs from admitted combined budget.');
    const b = device.createBuffer({
      label: 'generic replay ' + name,
      size,
      usage: usage | COPY_DST,
    });
    res.buffers.push(b);
    res.trace.createdBufferCount++;
    res.trace.allocatedBytes += size;
    if (typeof data !== 'number') device.queue.writeBuffer(b, 0, new Uint8Array(bytes(data)));
    return b;
  };
  const buffers: Record<string, GPUBuffer> = {};
  for (const [name, data] of Object.entries(core.uploads))
    buffers[name] = create(name, data, STORAGE | COPY_SRC);
  if (!buffers.bendDiagnostics)
    buffers.bendDiagnostics = create('bendDiagnostics', layout.bendDiagnostics, STORAGE | COPY_SRC);
  const uniforms = new Map<ArrayBuffer, GPUBuffer>();
  for (const packet of core.uniformPackets)
    uniforms.set(packet, create('uniform-' + uniforms.size, packet, UNIFORM));
  const uniform = (packet: ArrayBuffer) => {
    const b = uniforms.get(packet);
    if (!b) fail('Unbudgeted core uniform.');
    return b;
  };
  buffers.bodyPositions = create('bodyPositions', body.bodyPositionsM, STORAGE);
  buffers.bodyTriangles = create('bodyTriangles', body.bodyTriangles, STORAGE);
  buffers.contactParams = create('contactParams', layout.contactParams, UNIFORM);
  buffers.contactDiagnostics = create(
    'contactDiagnostics',
    layout.contactDiagnostics,
    STORAGE | COPY_SRC,
  );
  buffers.strainParams = create('strainParams', layout.strainParams, UNIFORM);
  buffers.strainValues = create('strainValues', layout.strainValues, STORAGE | COPY_SRC);
  buffers.strainFlags = create('strainFlags', layout.strainFlags, STORAGE | COPY_SRC);
  const frame16Buffer =
    frameCount === 32 ? create('frame16-checkpoint', layout.snapshotBytes, COPY_SRC) : null;
  const readback = create(
    'readback',
    (frameCount === 32 ? 2 : 1) * layout.snapshotBytes + core.report.counts.triangles * 20,
    MAP_READ,
  );
  const bg = (pipeline: GPUComputePipeline, list: GPUBuffer[]) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: list.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  const predictGroups = core.predictionFrames.map((p) =>
    bg(pipelines.predict, [
      buffers.positions,
      buffers.previousPositions,
      buffers.velocities,
      buffers.restPositions,
      uniform(p),
    ]),
  );
  const velocityGroup = bg(pipelines.velocity, [
    buffers.positions,
    buffers.previousPositions,
    buffers.velocities,
    buffers.restPositions,
    uniform(core.velocityParams),
    buffers.velocityDiagnostics,
    buffers.particleRetention,
  ]);
  const distanceGroups = core.distance.map((r) =>
    bg(pipelines.distance, [
      buffers.positions,
      buffers.distancePairs,
      buffers.distanceRestLengths,
      buffers.distanceLambdas,
      uniform(r.params),
    ]),
  );
  const seamGroups = core.seam.map((r) =>
    bg(pipelines.seam, [
      buffers.positions,
      buffers.seamPairs,
      buffers.seamTargetLengths,
      buffers.seamLambdas,
      buffers.seamActivationRanks,
      uniform(r.params),
      uniform(core.seamActivation!),
    ]),
  );
  const bendGroups = core.bend.map((r) =>
    bg(pipelines.bend, [
      buffers.positions,
      buffers.bendQuads,
      buffers.bendRestAngles,
      buffers.bendLambdas,
      uniform(r.params),
      buffers.bendDiagnostics,
    ]),
  );
  const continuumGroups = core.continuum.map((r) =>
    bg(pipelines.continuum, [
      buffers.positions,
      buffers.continuumTriangles,
      buffers.continuumRestFrames,
      buffers.continuumMaterialIndices,
      buffers.continuumMaterials,
      buffers.continuumLambdas,
      uniform(r.params),
      buffers.continuumStatuses,
    ]),
  );
  const resetGroups = core.resets.map((r) =>
    bg(
      pipelines['reset-' + r.kind],
      r.kind === 'continuum'
        ? [buffers.continuumLambdas, uniform(r.params), buffers.continuumStatuses]
        : [
            buffers[
              r.kind === 'distance'
                ? 'distanceLambdas'
                : r.kind === 'bend'
                  ? 'bendLambdas'
                  : 'seamLambdas'
            ],
            uniform(r.params),
          ],
    ),
  );
  const contactGroup = bg(pipelines.contact, [
    buffers.positions,
    buffers.previousPositions,
    buffers.bodyPositions,
    buffers.bodyTriangles,
    buffers.contactParams,
    buffers.contactDiagnostics,
  ]);
  const strainGroup = bg(pipelines.strain, [
    buffers.positions,
    buffers.continuumTriangles,
    buffers.continuumRestFrames,
    buffers.continuumMaterialIndices,
    buffers.continuumMaterials,
    buffers.strainParams,
    buffers.strainValues,
    buffers.strainFlags,
  ]);
  const copy = (
    encoder: GPUCommandEncoder,
    source: GPUBuffer,
    sourceOffset: number,
    target: GPUBuffer,
    targetOffset: number,
    n: number,
  ) => {
    if (!n) return;
    encoder.copyBufferToBuffer(source, sourceOffset, target, targetOffset, n);
    res.trace.copyCount++;
    res.trace.copyBytes += n;
  };
  const snapshot = (encoder: GPUCommandEncoder, target: GPUBuffer, base: number) => {
    for (const [name, field] of Object.entries(layout.checkpoint.fields))
      if (field.byteLength)
        copy(encoder, buffers[name], 0, target, base + field.offset, field.byteLength);
  };
  const submit = async (encoder: GPUCommandEncoder, isFrame = false) => {
    current();
    device.queue.submit([encoder.finish()]);
    res.trace.submissionCount++;
    if (isFrame) res.trace.framesSubmitted++;
    res.drained = false;
    res.pending = device.queue.onSubmittedWorkDone();
    void res.pending.then(
      () => {
        res.drained = true;
      },
      () => {
        res.drained = true;
      },
    );
    await waitLocally(res.pending, signal);
    current();
  };
  for (let frame = 0; frame < frameCount; frame++) {
    current();
    const encoder = device.createCommandEncoder({ label: 'generic frame ' + frame }),
      pass = encoder.beginComputePass({ label: 'generic fixed profile frame ' + frame });
    const dispatch = (
      pipeline: GPUComputePipeline,
      group: ReturnType<typeof bg>,
      groups: number,
    ) => {
      if (groups === 0) return;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(groups);
      res.trace.dispatchCount++;
    };
    dispatch(pipelines.predict, predictGroups[frame], Math.ceil(core.report.counts.particles / 64));
    core.resets.forEach((r, i) =>
      dispatch(pipelines['reset-' + r.kind], resetGroups[i], r.workgroups),
    );
    for (let iteration = 0; iteration < core.report.parameters.solverIterations; iteration++) {
      core.distance.forEach((r, i) =>
        dispatch(pipelines.distance, distanceGroups[i], r.workgroups),
      );
      core.seam.forEach((r, i) => dispatch(pipelines.seam, seamGroups[i], r.workgroups));
      core.bend.forEach((r, i) => dispatch(pipelines.bend, bendGroups[i], r.workgroups));
      core.continuum.forEach((r, i) =>
        dispatch(pipelines.continuum, continuumGroups[i], r.workgroups),
      );
      core.seam.forEach((r, i) => dispatch(pipelines.seam, seamGroups[i], r.workgroups));
    }
    dispatch(pipelines.contact, contactGroup, Math.ceil(core.report.counts.particles / 64));
    dispatch(pipelines.velocity, velocityGroup, Math.ceil(core.report.counts.particles / 64));
    pass.end();
    if (frame === 15 && frame16Buffer) snapshot(encoder, frame16Buffer, 0);
    await submit(encoder, true);
    if (frame === 15) await freshBody();
    current();
  }
  const encoder = device.createCommandEncoder({ label: 'generic final strain and readback' }),
    pass = encoder.beginComputePass({ label: 'generic strain' });
  pass.setPipeline(pipelines.strain);
  pass.setBindGroup(0, strainGroup);
  pass.dispatchWorkgroups(Math.ceil(core.report.counts.triangles / 64));
  res.trace.dispatchCount++;
  pass.end();
  if (frame16Buffer) copy(encoder, frame16Buffer, 0, readback, 0, layout.snapshotBytes);
  snapshot(encoder, readback, frameCount === 32 ? layout.snapshotBytes : 0);
  const strainOffset = (frameCount === 32 ? 2 : 1) * layout.snapshotBytes;
  copy(encoder, buffers.strainValues, 0, readback, strainOffset, core.report.counts.triangles * 16);
  copy(
    encoder,
    buffers.strainFlags,
    0,
    readback,
    strainOffset + core.report.counts.triangles * 16,
    core.report.counts.triangles * 4,
  );
  await submit(encoder);
  current();
  await waitLocally(readback.mapAsync(MAP_READ), signal);
  let raw: Uint8Array;
  try {
    current();
    raw = new Uint8Array(readback.getMappedRange()).slice();
  } finally {
    readback.unmap();
  }
  if (
    res.trace.dispatchCount !== layout.work.dispatchCount ||
    res.trace.copyCount !== layout.work.copyCount ||
    res.trace.copyBytes !== layout.work.copyBytes ||
    res.trace.submissionCount !== layout.work.submissionCount
  )
    fail('Actual GPU trace differs from admitted full layout.');
  const checkpoint16 = raw.slice(0, layout.snapshotBytes),
    finalBytes = raw.slice(frameCount === 32 ? layout.snapshotBytes : 0, strainOffset);
  return {
    checkpoint16,
    finalBytes,
    final: decodeGarmentMaterialContactCheckpointV1(layout, finalBytes, frameCount),
    checkpoint: decodeGarmentMaterialContactCheckpointV1(layout, checkpoint16, 16),
    strainValues: new Float32Array(
      raw.buffer.slice(strainOffset, strainOffset + core.report.counts.triangles * 16),
    ),
    strainFlags: new Uint32Array(
      raw.buffer.slice(strainOffset + core.report.counts.triangles * 16),
    ),
  };
}
function diagnosticReceipt(state: GarmentMaterialContactCheckpointV1) {
  return {
    velocity: Array.from(state.velocityDiagnostics),
    bend: Array.from(state.bendDiagnostics),
    contact: Array.from(state.contactDiagnostics),
    continuumStatuses: Array.from(state.continuumStatuses),
  };
}
function validGpuDiagnostics(state: GarmentMaterialContactCheckpointV1) {
  const v = state.velocityDiagnostics,
    b = state.bendDiagnostics,
    c = state.contactDiagnostics;
  const f = (bits: number) => new Float32Array(new Uint32Array([bits]).buffer)[0];
  return (
    v[0] === 0 &&
    v[1] === 0 &&
    v[2] === 0 &&
    v[3] === 0xffffffff &&
    v[4] === 0xffffffff &&
    v[5] === 0xffffffff &&
    b[0] === 0 &&
    c[1] === 0 &&
    c[2] === 0 &&
    c[3] === 0 &&
    c[9] === 0 &&
    state.continuumStatuses.every((x) => x === 0) &&
    f(c[4]) <= Math.fround(0.08) &&
    [
      state.positions,
      state.previousPositions,
      state.velocities,
      state.distanceLambdas,
      state.seamLambdas,
      state.bendLambdas,
      state.continuumLambdas,
    ].every((a) => a.every(Number.isFinite)) &&
    state.velocities.every((x, i) => i % 4 !== 3 || Object.is(x, 0))
  );
}
async function strainEvidence(
  core: CorePlan,
  state: GarmentMaterialContactCheckpointV1,
  values: Float32Array,
  flags: Uint32Array,
  layout: GarmentMaterialContactExecutionLayoutV1,
  current: () => void,
): Promise<Strain> {
  const simulation = core.sourceSealedSimulation.simulation,
    c = simulation.constraints.continuumStrain;
  const port = await sealTriangleStrainUtilizationPortV1({
    schemaVersion: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
    vertexCount: core.report.counts.particles,
    triangleCount: c.constraintCount,
    materialCount: c.materialCount,
    finalPositionsInvMassKg: state.positions,
    normalizedTopology: simulation.mesh.triangles,
    triangleIndices: c.triangleIndices,
    triangleRestFrames: c.triangleRestFrames,
    materialIndices: c.materialIndices,
    materialRecords: c.materialRecords,
  });
  current();
  const audit = await auditTriangleStrainUtilizationPortV1(port);
  current();
  if (!audit.ok) fail('Strain port audit: ' + audit.blockers.join('; '));
  const cpu = evaluateTriangleStrainUtilizationCpuV1(port);
  let maximum = 0;
  if (cpu.length !== values.length || flags.length !== c.constraintCount)
    fail('Strain extents differ.');
  for (let i = 0; i < cpu.length; i++) {
    if (!Number.isFinite(cpu[i]) || !Number.isFinite(values[i])) fail('Nonfinite strain.');
    maximum = Math.max(maximum, Math.abs(cpu[i] - values[i]));
  }
  const [valuesSha256, flagsSha256, renderMappingSha256, sourceMappingSha256] = await Promise.all([
    hash(values),
    hash(flags),
    hash(layout.strainOrder.renderTriangleIndices),
    hash(layout.strainOrder.sourceTriangleIndices),
  ]);
  current();
  return freeze({
    values: values.slice(),
    flags: flags.slice(),
    renderTriangleIndices: layout.strainOrder.renderTriangleIndices.slice(),
    sourceTriangleIndices: layout.strainOrder.sourceTriangleIndices.slice(),
    maximumCpuGpuAbsoluteDifference: maximum,
    passed: maximum <= 0.00001 && flags.every((x) => x === 0),
    valuesSha256,
    flagsSha256,
    renderMappingSha256,
    sourceMappingSha256,
    units: 'dimensionless' as const,
    restReference: 'immutable-local-v5' as const,
    stressPaComputed: false as const,
  });
}

async function run(
  input: unknown,
  leaseCandidate: unknown,
  frameCount: 16 | 32,
  previous16: unknown,
  signal?: AbortSignal,
) {
  const controller = new AbortController(),
    unlinks: (() => void)[] = [];
  const trace: Trace = {
    framesSubmitted: 0,
    dispatchCount: 0,
    submissionCount: 0,
    copyCount: 0,
    copyBytes: 0,
    allocatedBytes: 0,
    createdBufferCount: 0,
    destroyedBufferCount: 0,
    cleanupPending: false,
    borrowedLeaseReleased: false,
    borrowedDeviceDestroyed: false,
    validationMessages: [],
  };
  const resources: Resources = { buffers: [], pending: null, drained: true, trace };
  let reportedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2 | null = null;
  let kernelIdentities: DxfGarmentObservedWebgpuReplayReportV1['kernelIdentities'] = null;
  let diagnostics: DxfGarmentObservedWebgpuReplayReportV1['diagnostics'] = null;
  let stage = 'capture',
    sourceBindingSha256: string | null = null,
    prefixPlanSha256: string | null = null,
    placementReportSha256: string | null = null,
    layout: GarmentMaterialContactExecutionLayoutV1 | null = null,
    initialValidation: Validation | null = null,
    finalValidation: Validation | null = null,
    strain: Strain | null = null,
    checkpoint16Sha256: string | null = null,
    finalStateSha256: string | null = null,
    checkpoint16Matched: boolean | null = null;
  let ownedLease: object | null = null,
    scopeCount = 0,
    device: GPUDevice | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  let retained = false,
    cleaned = false;
  let minted: DxfGarmentObservedWebgpuReplayOwnerV1 | null = null;
  let detachGpuError: (() => void) | null = null;
  const unlink = () => {
    unlinks.splice(0).forEach((fn) => fn());
  };
  const checkOwn = () => {
    if (
      nativeAborted.call(controller.signal) ||
      (signal !== undefined && nativeAborted.call(signal))
    )
      fail('Replay cancelled.');
  };
  const link = (s: AbortSignal) => {
    const isAborted = nativeAborted.call(s),
      fn = () => controller.abort();
    unlinks.push(() => remove.call(s, 'abort', fn));
    add.call(s, 'abort', fn, { once: true });
    if (isAborted || nativeAborted.call(s)) controller.abort();
  };
  const cleanupBuffers = () => {
    if (cleaned) return;
    cleaned = true;
    for (const b of resources.buffers)
      try {
        b.unmap();
        b.destroy();
        trace.destroyedBufferCount++;
      } catch {
        trace.validationMessages.push('Owned buffer cleanup failed.');
      }
    resources.buffers.length = 0;
    trace.cleanupPending = false;
    if (ownedLease) busyLeases.delete(ownedLease);
  };
  const report = async (
    status: 'blocked' | 'diagnostic-completed',
    blockers: readonly string[],
  ): Promise<DxfGarmentObservedWebgpuReplayReportV1> => {
    const payload = {
      schemaVersion: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
      frameCount,
      bodyBinding: reportedBodyBinding,
      kernelIdentities,
      diagnostics,
      status,
      stage,
      sourceBindingSha256,
      prefixPlanSha256,
      placementReportSha256,
      layout: layoutReceipt(layout),
      initialValidation,
      finalValidation,
      checkpoint16Sha256,
      finalStateSha256,
      checkpoint16Matched,
      strain: strainReceipt(strain),
      execution: capture(trace) as Trace,
      blockers: [...blockers],
      claims: CLAIMS,
    };
    let reportSha256: string | null = null;
    try {
      reportSha256 = await dataHash(payload);
    } catch {
      /* Blocked evidence may truthfully lack a digest. */
    }
    return freeze({ ...payload, reportSha256 });
  };
  try {
    checkOwn();
    const keys = [
      'schemaVersion',
      'profile',
      'placementRequest',
      'bodyOwner',
      'bodyBinding',
      'hostCompileGeneration',
      'parameters',
      'coreBudgets',
      'executionBudgets',
      'expected',
      'timeoutMs',
    ];
    if (
      !input ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== keys.length
    )
      fail('Exact replay request required.');
    const fields = Object.fromEntries(
      keys.map((k) => {
        const d = Object.getOwnPropertyDescriptor(input, k);
        if (!d?.enumerable || !('value' in d)) fail('Replay fields must be own data.');
        return [k, d.value];
      }),
    );
    const bodyOwner = fields.bodyOwner as SavedModelDisplayedTriangleBodyOwnerV2;
    delete fields.bodyOwner;
    const r = capture(fields) as Omit<DxfGarmentObservedWebgpuReplayRequestV1, 'bodyOwner'>;
    if (
      r.schemaVersion !== DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1 ||
      r.profile !== DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1 ||
      !Number.isSafeInteger(r.hostCompileGeneration) ||
      r.hostCompileGeneration < 1 ||
      !Number.isSafeInteger(r.timeoutMs) ||
      r.timeoutMs < 100 ||
      r.timeoutMs > 600000 ||
      !r.expected ||
      Object.keys(r.expected).sort().join(',') !== 'placementReportSha256,prefixPlanSha256' ||
      typeof r.expected.placementReportSha256 !== 'string' ||
      !SHA.test(r.expected.placementReportSha256) ||
      typeof r.expected.prefixPlanSha256 !== 'string' ||
      !SHA.test(r.expected.prefixPlanSha256)
    )
      fail('Replay version/profile/metadata/expectation/timeout invalid.');
    if (
      !r.parameters ||
      Object.keys(r.parameters).sort().join(',') !==
        [
          'dtS',
          'solverIterations',
          'gravityMps2Y',
          'windAccelerationMps2Z',
          'distanceComplianceMPerN',
          'seamComplianceMPerN',
        ]
          .sort()
          .join(',')
    )
      fail('Exact profile parameters excluding frameCount required.');
    reportedBodyBinding = r.bodyBinding;
    const inspection = inspectOwnedActiveXpbdDeviceLeaseV1(leaseCandidate);
    if (!inspection.ok) fail('A genuine active borrowed device lease is required.');
    if (busyLeases.has(leaseCandidate as object))
      fail('Borrowed lease already has a pending generic replay.');
    ownedLease = leaseCandidate as object;
    busyLeases.add(ownedLease);
    device = inspection.device;
    const lifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(bodyOwner, r.bodyBinding);
    if (!lifetime) fail('A genuine current observed body/binding is required.');
    if (signal) link(signal);
    link(lifetime);
    checkOwn();
    timer = setTimeout(() => controller.abort(), r.timeoutMs);
    const current = () => {
      checkOwn();
      inspection.assertActive();
      if (
        getSavedModelDisplayedTriangleBodyLifetimeV2(bodyOwner, r.bodyBinding) !== lifetime ||
        nativeAborted.call(lifetime)
      )
        fail('Observed body currentness lost.');
      checkOwn();
    };
    void inspection.lost.then(
      () => controller.abort(),
      () => controller.abort(),
    );
    const freshBody = async () => {
      current();
      const p = await waitLocally(
        projectSavedModelDisplayedTriangleBodyV2(bodyOwner, r.bodyBinding),
        controller.signal,
      );
      current();
      if (p.status !== 'projected' || canonical(p.snapshot.binding) !== canonical(r.bodyBinding))
        fail('Fresh observed body binding changed.');
      return p.snapshot;
    };
    const prior = frameCount === 32 ? receiptOf(previous16) : undefined;
    if (frameCount === 32) {
      if (!prior || prior.frameCount !== 16)
        fail('32 replay requires a genuine completed16 receipt.');
      prior.current();
      link(prior.controller.signal);
      current();
    }
    stage = 'source-replay';
    const placementPending = buildDxfGarmentAssemblyExplicitPlacementStageV1(
      r.placementRequest,
      controller.signal,
    );
    const body = await freshBody();
    const placement = await waitLocally(placementPending, controller.signal);
    current();
    if (!placement.ok || !placement.artifact.sealedSimulation)
      fail(
        'Actual source/placement replay failed: ' +
          placement.blockers.map((x) => x.detail).join('; '),
      );
    placementReportSha256 = placement.artifact.report.reportSha256;
    if (placementReportSha256 !== r.expected.placementReportSha256)
      fail('Placement expectation changed.');
    const simulation = placement.artifact.placedSimulation,
      planRequest = {
        schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
        sealedSimulation: placement.artifact.sealedSimulation,
        expectedPackageSha256: placement.artifact.sealedSimulation.seal.aggregateSha256,
        pieceRanges: placement.artifact.localSourceArtifact.refinement.mesh.pieceRanges,
        parameters: { ...r.parameters, frameCount: 16 },
        budgets: r.coreBudgets,
      };
    const prefix = await buildGarmentMaterialRunPlanV1(planRequest, controller.signal);
    current();
    if (!prefix.ok)
      fail('Core16-prefix plan failed: ' + prefix.blockers.map((x) => x.detail).join('; '));
    prefixPlanSha256 = prefix.plan.planSha256;
    if (prefixPlanSha256 !== r.expected.prefixPlanSha256)
      fail('Core16-prefix expectation changed.');
    const planned =
      frameCount === 16
        ? prefix
        : await buildGarmentMaterialRunPlanV1(
            { ...planRequest, parameters: { ...r.parameters, frameCount: 32 } },
            controller.signal,
          );
    current();
    if (!planned.ok)
      fail('Core32 plan failed: ' + planned.blockers.map((x) => x.detail).join('; '));
    const core = planned.plan;
    kernelIdentities = {
      ...core.report.kernels,
      contact: {
        id: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_KERNEL_V2,
        sha256: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2,
      },
      strain: {
        id: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
        sha256: 'd0ec81303ef3935c13163a365434a41b8af5f1f8244add4a93de74a071711386',
      },
    };
    sourceBindingSha256 = await dataHash({
      profile: r.profile,
      placementReportSha256,
      prefixPlanSha256,
      bodyBinding: r.bodyBinding,
      deviceIdentity: inspection.identity,
      hostCompileGeneration: r.hostCompileGeneration,
    });
    current();
    if (prior && prior.sourceBindingSha256 !== sourceBindingSha256)
      fail('32 replay source/body/profile/device differs from genuine16.');
    const pins = Uint32Array.from(
      Array.from({ length: core.report.counts.particles }, (_, i) => i).filter(
        (i) => core.physicalInitialPositions[i * 4 + 3] === 0,
      ),
    );
    const initialInput = collisionInput(
      body,
      core.physicalInitialPositions,
      simulation.mesh.triangles,
      r.hostCompileGeneration,
      await hash(xyz(core.physicalInitialPositions)),
    );
    current();
    const validate = (
      frame: 0 | 16 | 32,
      currentPositions4: Float32Array,
      previousPositions4: Float32Array,
    ) =>
      evaluateDxfGarmentObservedFrameValidationV1(
        {
          schemaVersion: DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1,
          frame,
          initialPositions4: core.physicalInitialPositions,
          currentPositions4,
          previousPositions4,
          triangles: simulation.mesh.triangles,
          seamPairs: simulation.constraints.seam.vertexPairs,
          pins,
          collisionInput: initialInput,
        },
        controller.signal,
      );
    stage = 'initial-physical-validation';
    initialValidation = await validate(
      0,
      core.physicalInitialPositions,
      core.physicalInitialPositions,
    );
    current();
    if (!initialValidation.ok || !initialValidation.report)
      fail('Initial physical gates: ' + initialValidation.blockers.join('; '));
    const volume = initialValidation.report.collision.topology.bodySignedVolumeM3;
    if (!Number.isFinite(volume) || Math.abs(volume) <= 1e-12)
      fail('Body signed volume cannot orient exact contacts.');
    const admitted = buildGarmentMaterialContactExecutionLayoutV1({
      corePlan: core,
      bodyVertexCount: body.bodyPositionsM.length / 3,
      bodyTriangleCount: body.bodyTriangles.length / 3,
      freeParticleCount: core.report.counts.particles - pins.length,
      frameCount,
      profile: r.profile,
      bodyOutwardSign: volume > 0 ? 1 : -1,
      budgets: r.executionBudgets,
      deviceLimits: inspection.limits,
    });
    if (!admitted.ok) fail('Combined GPU layout refused: ' + JSON.stringify(admitted.blockers));
    layout = admitted.layout;
    await freshBody();
    current();
    stage = 'gpu-execution';
    device.pushErrorScope('validation');
    scopeCount++;
    device.pushErrorScope('out-of-memory');
    scopeCount++;
    const onError = (event: Event) => {
      trace.validationMessages.push(
        (event as Event & { error?: { message?: string } }).error?.message ??
          'Uncaptured GPU error.',
      );
      controller.abort();
    };
    add.call(device, 'uncapturederror', onError);
    detachGpuError = () => remove.call(device!, 'uncapturederror', onError);
    const gpu = await executeGpu(
      device,
      core,
      layout,
      body,
      frameCount,
      resources,
      current,
      freshBody,
      controller.signal,
    );
    current();
    while (scopeCount) {
      const scope = device.popErrorScope();
      scopeCount--;
      const error = await waitLocally(scope, controller.signal);
      current();
      if (error) trace.validationMessages.push(error.message);
    }
    if (trace.validationMessages.length) fail('GPU validation errors retained.');
    stage = 'checkpoint-and-final-validation';
    checkpoint16Sha256 = await hash(gpu.checkpoint16);
    finalStateSha256 = await hash(gpu.finalBytes);
    current();
    checkpoint16Matched = prior ? equal(gpu.checkpoint16, prior.checkpoint16) : null;
    diagnostics = freeze({
      checkpoint16: diagnosticReceipt(gpu.checkpoint),
      final: diagnosticReceipt(gpu.final),
    });
    const diagnosticValid = validGpuDiagnostics(gpu.checkpoint) && validGpuDiagnostics(gpu.final);
    finalValidation = await validate(frameCount, gpu.final.positions, gpu.final.previousPositions);
    current();
    strain = await strainEvidence(
      core,
      gpu.final,
      gpu.strainValues,
      gpu.strainFlags,
      layout,
      current,
    );
    current();
    await freshBody();
    current();
    const blockers = [
      ...(!diagnosticValid ? ['gpu-state-diagnostics-failed'] : []),
      ...(prior && checkpoint16Matched !== true ? ['exact16-prefix-checkpoint-mismatch'] : []),
      ...(!finalValidation.ok ? finalValidation.blockers : []),
      ...(!strain.passed ? ['strain-cpu-gpu-or-validity-failed'] : []),
    ];
    cleanupBuffers();
    current();
    if (trace.destroyedBufferCount !== trace.createdBufferCount)
      blockers.push('owned-buffer-cleanup-failed');
    stage = 'completed';
    const terminal = await report(blockers.length ? 'blocked' : 'diagnostic-completed', blockers);
    current();
    if (!terminal.reportSha256) fail('Terminal receipt digest unavailable.');
    if (blockers.length) return { ok: false as const, owner: null, report: terminal, blockers };
    const owner = freeze({
      version: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
      frameCount,
      report: terminal,
    }) as DxfGarmentObservedWebgpuReplayOwnerV1;
    const receipt: Receipt = {
      frameCount,
      controller,
      unlink,
      current,
      bodyOwner,
      binding: r.bodyBinding,
      checkpoint16: gpu.checkpoint16.slice(),
      finalState: gpu.final,
      renderTriangles: simulation.mesh.triangles,
      // The exact placement preserved source topology. The prefix plan already verified unique,
      // disjoint piece coverage and triangle vertices against that same sealed package.
      pieceRanges: prefix.plan.report.pieceRanges,
      strain,
      sourceBindingSha256,
      report: terminal,
    };
    receipts.set(owner, receipt);
    minted = owner;
    retained = true;
    const invalidate = () => disposeDxfGarmentObservedWebgpuReplayV1(owner);
    unlinks.push(() => remove.call(controller.signal, 'abort', invalidate));
    add.call(controller.signal, 'abort', invalidate, { once: true });
    current();
    return { ok: true as const, owner, report: terminal, blockers: [] as string[] };
  } catch (error) {
    if (minted) disposeDxfGarmentObservedWebgpuReplayV1(minted);
    if (!resources.drained && resources.pending) {
      trace.cleanupPending = true;
      void resources.pending.then(cleanupBuffers, cleanupBuffers);
    } else cleanupBuffers();
    const blockers = [error instanceof Error ? error.message : 'Replay rejected.'];
    return { ok: false as const, owner: null, report: await report('blocked', blockers), blockers };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    detachGpuError?.();
    if (device)
      while (scopeCount) {
        scopeCount--;
        void device.popErrorScope().then(
          (e) => {
            if (e) trace.validationMessages.push(e.message);
          },
          () => {},
        );
      }
    if (!retained) {
      controller.abort();
      unlink();
    }
    if (!cleaned && !trace.cleanupPending) cleanupBuffers();
  }
}

/** Executes numeric16 diagnostics from independently replayed content; not a product admission. */
export const runDxfGarmentObservedWebgpu16ReplayV1 = (
  request: unknown,
  borrowedOwnedDeviceLease: XpbdDeviceLease,
  signal?: AbortSignal,
) => run(request, borrowedOwnedDeviceLease, 16, null, signal);
/** Reexecutes0→32 on the same device generation; never continues or repairs previous state. */
export const runDxfGarmentObservedWebgpu32ReplayV1 = (
  request: unknown,
  genuine16ReplayOwner: unknown,
  borrowedOwnedDeviceLease: XpbdDeviceLease,
  signal?: AbortSignal,
) => run(request, borrowedOwnedDeviceLease, 32, genuine16ReplayOwner, signal);
export function getDxfGarmentObservedWebgpuReplayLifetimeV1(owner: unknown): AbortSignal | null {
  const r = receiptOf(owner);
  if (!r) return null;
  try {
    r.current();
    return nativeAborted.call(r.controller.signal) ? null : r.controller.signal;
  } catch {
    disposeDxfGarmentObservedWebgpuReplayV1(owner);
    return null;
  }
}
export async function projectDxfGarmentObservedWebgpuReplayV1(
  owner: unknown,
  signal?: AbortSignal,
) {
  const r = receiptOf(owner);
  if (!r) return null;
  try {
    if (signal && nativeAborted.call(signal)) return null;
    r.current();
    const pending = projectSavedModelDisplayedTriangleBodyV2(r.bodyOwner, r.binding);
    const body = signal ? await waitLocally(pending, signal) : await pending;
    if (signal && nativeAborted.call(signal)) return null;
    r.current();
    if (body.status !== 'projected') return null;
    return freeze({
      frameCount: r.frameCount,
      report: r.report,
      checkpoint16: r.checkpoint16.slice(),
      finalState: capture(r.finalState) as GarmentMaterialContactCheckpointV1,
      strain: capture(r.strain) as Strain,
    });
  } catch {
    if (!(signal && nativeAborted.call(signal))) disposeDxfGarmentObservedWebgpuReplayV1(owner);
    return null;
  }
}
export function disposeDxfGarmentObservedWebgpuReplayV1(owner: unknown): boolean {
  const r = receiptOf(owner);
  if (!r) return false;
  receipts.delete(owner as object);
  r.controller.abort();
  r.unlink();
  r.checkpoint16.fill(0);
  r.strain.values.fill(0);
  r.strain.flags.fill(0);
  r.strain.renderTriangleIndices.fill(0);
  r.strain.sourceTriangleIndices.fill(0);
  for (const v of Object.values(r.finalState))
    if (v instanceof Float32Array || v instanceof Uint32Array) v.fill(0);
  return true;
}

/** Exact final mesh, matching continuum order and freshly projected body. Content leaves the
 * private replay registry as detached arrays; neither the body owner nor a caller projector does.
 * This is a numeric diagnostic projection, not admission of a saved product or a fit claim. */
export async function projectDxfGarmentObservedWebgpuRenderV1(
  owner: unknown,
  signal?: AbortSignal,
) {
  const r = receiptOf(owner);
  if (!r) return null;
  try {
    if (signal && nativeAborted.call(signal)) return null;
    r.current();
    // A child read must not pass cancellation into the borrowed model/body projector. Revoking
    // this replay still ends our wait even when the borrowed reader has not completed yet.
    const pending = waitLocally(
      projectSavedModelDisplayedTriangleBodyV2(r.bodyOwner, r.binding),
      r.controller.signal,
    );
    const body = signal ? await waitLocally(pending, signal) : await pending;
    if (signal && nativeAborted.call(signal)) return null;
    r.current();
    if (body.status !== 'projected') return null;
    return freeze({
      frameCount: r.frameCount,
      report: r.report,
      finalPositions3M: xyz(r.finalState.positions),
      garmentTriangles: r.renderTriangles.slice(),
      pieceRanges: r.pieceRanges.map((range) => ({ ...range })),
      bodyPositionsM: body.snapshot.bodyPositionsM.slice(),
      bodyTriangles: body.snapshot.bodyTriangles.slice(),
      strain: capture(r.strain) as Strain,
      claims: {
        numericReplayOnly: true as const,
        visibleHeatmapRendered: false as const,
        units: 'dimensionless' as const,
        stressPaComputed: false as const,
        productAuthority: false as const,
        runtimeAuthority: false as const,
        fitAuthority: false as const,
      },
    });
  } catch {
    if (!(signal && nativeAborted.call(signal))) disposeDxfGarmentObservedWebgpuReplayV1(owner);
    return null;
  }
}
