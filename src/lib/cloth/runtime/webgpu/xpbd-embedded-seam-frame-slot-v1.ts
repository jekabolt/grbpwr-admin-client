/* global GPUBuffer, GPUDevice, GPUComputePipeline, GPUBindGroup */

import type { GarmentMaterialContactExecutionDeviceLimitsV1 } from './garment-material-contact-execution-layout-v1';
import {
  type prepareStagedEmbeddedSeamActivationV1,
  snapshotEmbeddedSeamFrameSourceV1,
} from './garment-staged-embedded-seam-activation-v1';
import { XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1 } from './xpbd-seam-solve-kernel-v1';

type EmbeddedPlan = ReturnType<typeof prepareStagedEmbeddedSeamActivationV1>;
type StageIntent = Parameters<EmbeddedPlan['project']>[0];
type SolverBufferKind = 'storage' | 'uniform';
type Upload = Readonly<{
  name: string;
  kind: SolverBufferKind;
  bytes: ArrayBuffer | ArrayBufferView;
}>;
type SeamCommand = Readonly<{
  pipeline: GPUComputePipeline;
  group: GPUBindGroup;
  workgroups: number;
}>;

const owned = new WeakMap<
  object,
  {
    fixedUploads: readonly Upload[];
    colorUploads: readonly Upload[];
    targetLengthsM: Float32Array;
  }
>();

/** Measure only the seam slot. The garment executor admits the remaining frame resources. */
export function createXpbdEmbeddedSeamFrameLayoutV1(
  plan: EmbeddedPlan,
  intent: StageIntent,
  steps: Readonly<{ frameCount: number; solverIterations: number }>,
  limits: GarmentMaterialContactExecutionDeviceLimitsV1,
  budgets: Readonly<{ maxGpuBytes: number; maxDispatches: number; maxPaddedInvocations: number }>,
) {
  const source = snapshotEmbeddedSeamFrameSourceV1(plan);
  const stage = plan.project(intent);
  const { reset, colors } = stage.frameDispatch;
  const fixedUploads: readonly Upload[] = [
    { name: 'seamSupportRows', kind: 'storage', bytes: source.supportRows },
    { name: 'seamTargetLengths', kind: 'storage', bytes: stage.targetLengthsM },
    { name: 'seamLambdas', kind: 'storage', bytes: stage.zeroLambdasKgM },
    { name: 'seamActivationRanks', kind: 'storage', bytes: source.activationRanks },
    { name: 'seamActivation', kind: 'uniform', bytes: stage.activationParams },
    { name: 'seamScalarReset', kind: 'uniform', bytes: reset.params },
  ];
  const colorUploads: readonly Upload[] = colors.map(({ offset, params }) => ({
    name: `seamColor:${offset}`,
    kind: 'uniform',
    bytes: params,
  }));
  const allocations = [...fixedUploads, ...colorUploads].map(({ name, kind, bytes }) =>
    Object.freeze({ name, kind, byteLength: bytes.byteLength }),
  );
  const positionsBytes = plan.particleCount * 16;
  const workgroupSize = XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1;
  const storageLimit = Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);
  const uniformLimit = Math.min(limits.maxBufferSize, limits.maxUniformBufferBindingSize);
  const minimums = [
    [limits.maxComputeInvocationsPerWorkgroup, workgroupSize],
    [limits.maxComputeWorkgroupSizeX, workgroupSize],
    [limits.maxBindingsPerBindGroup, 7],
    [limits.maxStorageBuffersPerShaderStage, 5],
    [limits.maxUniformBuffersPerShaderStage, 2],
    [limits.maxBindGroups, 1],
  ];
  if (
    minimums.some(([limit, required]) => !Number.isSafeInteger(limit) || limit < required) ||
    !Number.isSafeInteger(storageLimit) ||
    positionsBytes > storageLimit ||
    !Number.isSafeInteger(uniformLimit) ||
    allocations.some(
      ({ kind, byteLength }) => byteLength > (kind === 'storage' ? storageLimit : uniformLimit),
    ) ||
    !Number.isSafeInteger(limits.maxComputeWorkgroupsPerDimension) ||
    reset.workgroups > limits.maxComputeWorkgroupsPerDimension ||
    colors.some(({ workgroups }) => workgroups > limits.maxComputeWorkgroupsPerDimension)
  )
    throw new RangeError(
      'The embedded seam slot exceeds device buffer, binding or workgroup limits.',
    );

  const { frameCount, solverIterations } = steps;
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    !Number.isSafeInteger(solverIterations) ||
    solverIterations < 1
  )
    throw new RangeError('Positive frame and solver iteration counts are required.');
  const gpuBytes = allocations.reduce((sum, entry) => sum + entry.byteLength, 0);
  const dispatches = frameCount * (1 + 2 * solverIterations * colors.length);
  const paddedInvocations =
    frameCount *
    workgroupSize *
    (reset.workgroups +
      2 * solverIterations * colors.reduce((sum, color) => sum + color.workgroups, 0));
  for (const [value, cap] of [
    [gpuBytes, budgets.maxGpuBytes],
    [dispatches, budgets.maxDispatches],
    [paddedInvocations, budgets.maxPaddedInvocations],
  ] as const) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(cap) || value > cap)
      throw new RangeError('The embedded seam slot exceeds its execution budget.');
  }
  const layout = Object.freeze({
    stage: stage.stage,
    positionsBytes,
    allocations: Object.freeze(allocations),
    gpuBytes,
    dispatches,
    paddedInvocations,
    resetWorkgroups: reset.workgroups,
    colors: Object.freeze(
      colors.map(({ offset, count, activeRows, workgroups }) =>
        Object.freeze({ offset, count, activeRows, workgroups }),
      ),
    ),
  });
  owned.set(layout, { fixedUploads, colorUploads, targetLengthsM: stage.targetLengthsM });
  return layout;
}

export function snapshotXpbdEmbeddedSeamTargetsV1(
  layout: ReturnType<typeof createXpbdEmbeddedSeamFrameLayoutV1>,
) {
  const source = owned.get(layout);
  if (!source) throw new TypeError('A prepared embedded seam frame is required.');
  return source.targetLengthsM.slice();
}

type IterationSlots = Readonly<{ distance(): void; seam(): void; bend(): void; continuum(): void }>;

/** The shared material iteration uses the same seam slot before and after material constraints. */
export function recordXpbdMaterialIterationV1(slots: IterationSlots) {
  slots.distance();
  slots.seam();
  slots.bend();
  slots.continuum();
  slots.seam();
}

export function recordXpbdMaterialFrameV1(
  slots: IterationSlots &
    Readonly<{ predict(): void; reset(): void; contact(): void; velocity(): void }>,
  iterations: number,
) {
  slots.predict();
  slots.reset();
  for (let iteration = 0; iteration < iterations; iteration++) recordXpbdMaterialIterationV1(slots);
  slots.contact();
  slots.velocity();
}

type Layout = ReturnType<typeof createXpbdEmbeddedSeamFrameLayoutV1>;

/** Binds into an existing garment encoder. The caller owns buffers, the device and submissions. */
export function bindXpbdEmbeddedSeamFrameSlotV1(
  layout: Layout,
  positions: GPUBuffer,
  pipelines: Readonly<{ embeddedSeam: GPUComputePipeline; scalarReset: GPUComputePipeline }>,
  device: Pick<GPUDevice, 'createBindGroup'>,
  upload: (data: Upload) => GPUBuffer,
) {
  const source = owned.get(layout);
  if (!source || positions.size !== layout.positionsBytes)
    throw new RangeError('The position buffer must match a prepared embedded seam frame layout.');
  const create = (item: Upload) => {
    const bytes =
      item.bytes instanceof ArrayBuffer
        ? item.bytes.slice(0)
        : new Uint8Array(
            new Uint8Array(item.bytes.buffer, item.bytes.byteOffset, item.bytes.byteLength),
          );
    const buffer = upload({ ...item, bytes });
    if (buffer.size !== item.bytes.byteLength)
      throw new RangeError('The seam upload returned an incompatible buffer extent.');
    return buffer;
  };
  const [supports, targets, lambdas, ranks, activation, reset] = source.fixedUploads.map(create);
  const group = (pipeline: GPUComputePipeline, buffers: readonly GPUBuffer[]) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  const resetCommand: SeamCommand = Object.freeze({
    pipeline: pipelines.scalarReset,
    group: group(pipelines.scalarReset, [lambdas, reset]),
    workgroups: layout.resetWorkgroups,
  });
  const colors: SeamCommand[] = source.colorUploads.map((color, i) =>
    Object.freeze({
      pipeline: pipelines.embeddedSeam,
      group: group(pipelines.embeddedSeam, [
        positions,
        supports,
        targets,
        lambdas,
        ranks,
        create(color),
        activation,
      ]),
      workgroups: layout.colors[i].workgroups,
    }),
  );
  return Object.freeze({
    reset: resetCommand,
    colors: Object.freeze(colors),
    seamLambdas: lambdas,
  });
}
