/* global GPUBuffer, GPUDevice, GPUComputePassEncoder, GPUComputePipeline */

import { captureActualBodyTriangleGeometryV1 } from '../../body/actual-body-triangle-aabb-tree-v1';
import {
  actualBodyTriangleMeshContactWorkgroupsV2,
  packActualBodyTriangleMeshContactParamsV2,
} from './actual-body-triangle-mesh-contact-kernel-v2';
import {
  prepareActualBodyContactAabbPacketV1,
  snapshotActualBodyContactAabbBuffersV1,
} from './actual-body-contact-aabb-packet-v1';
import {
  ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1,
  packActualBodyContactNearestCandidateParamsV1,
} from './actual-body-contact-nearest-candidate-v1';
import type { GarmentMaterialContactExecutionDeviceLimitsV1 } from './garment-material-contact-execution-layout-v1';
import type { prepareStagedEmbeddedSeamActivationV1 } from './garment-staged-embedded-seam-activation-v1';
import {
  assertGarmentStagedSourceCutSeamsV1,
  type prepareGarmentStagedSourceCutCoreV1,
  snapshotGarmentStagedSourceCutCoreV1,
} from './garment-staged-source-cut-core-v1';
import {
  bindXpbdEmbeddedSeamFrameSlotV1,
  createXpbdEmbeddedSeamFrameLayoutV1,
  recordXpbdMaterialFrameV1,
  snapshotXpbdEmbeddedSeamTargetsV1,
} from './xpbd-embedded-seam-frame-slot-v1';
import {
  decodeXpbdPredictFrameParamsV1,
  encodeXpbdPredictFrameParamsV1,
} from './xpbd-predict-kernel-v1';

type SeamPlan = ReturnType<typeof prepareStagedEmbeddedSeamActivationV1>;
type Intent = Omit<
  Parameters<SeamPlan['project']>[0],
  'currentPositionsMInvMass' | 'dtS' | 'seamComplianceMPerN'
>;
type Limits = GarmentMaterialContactExecutionDeviceLimitsV1;
type Motion = Readonly<{
  positionsMInvMass: Float32Array;
  previousPositionsMInvMass: Float32Array;
  velocities: Float32Array;
}>;
type Upload = Readonly<{
  name: string;
  kind: 'storage' | 'uniform';
  bytes: ArrayBuffer | ArrayBufferView;
}>;
type FramePass = Pick<GPUComputePassEncoder, 'setPipeline' | 'setBindGroup' | 'dispatchWorkgroups'>;
export const STAGED_SOURCE_CUT_FIRST_SWEEP_PHASES_V1 = [
  'first distance solve',
  'first embedded seam solve',
  'first bend solve',
  'first continuum solve',
  'second embedded seam solve',
] as const;
type FirstSweepPhase = (typeof STAGED_SOURCE_CUT_FIRST_SWEEP_PHASES_V1)[number];
export type StagedSourceCutFramePhaseV1 = 'prediction' | FirstSweepPhase | 'mechanics';
type StagedPipelines = Readonly<
  Record<
    | 'predict'
    | 'velocity'
    | 'distance'
    | 'cutBend'
    | 'cutContinuum'
    | 'embeddedSeam'
    | 'scalarReset'
    | 'distanceReset'
    | 'continuumReset'
    | 'bodyContact',
    GPUComputePipeline
  > & { bodyQuery?: GPUComputePipeline }
>;
const HARD_EXHAUSTIVE_VISITS = 500_000_000;
const owners = new WeakMap<object, ReturnType<typeof prepareUploads>>();

export function validateGarmentStagedSourceCutMotionV1(motion: Motion, reference: Float32Array) {
  for (const [values, isVelocity] of [
    [motion.positionsMInvMass, false],
    [motion.previousPositionsMInvMass, false],
    [motion.velocities, true],
  ] as const) {
    if (
      Object.getPrototypeOf(values) !== Float32Array.prototype ||
      Object.getPrototypeOf(values.buffer) !== ArrayBuffer.prototype ||
      values.length !== reference.length ||
      values.some(
        (value, i) =>
          !Number.isFinite(value) ||
          Math.abs(value) >= 1e30 ||
          (i % 4 === 3 && !Object.is(value, isVelocity ? 0 : reference[i])),
      )
    )
      throw new RangeError('Invalid staged positions, previous positions or velocities.');
  }
}

function prepareUploads(
  input: Readonly<{
    material: ReturnType<typeof prepareGarmentStagedSourceCutCoreV1>;
    seams: SeamPlan;
    intent: Intent;
    bodyPositionsM: Float32Array;
    bodyTriangles: Uint32Array;
    bodyOutwardSign: 1 | -1;
    bodyContactVisitBudget?: number;
    start?: Motion & Readonly<{ elapsedFrames: number }>;
    limits: Limits;
    budgets: Readonly<{
      maxGpuBytes: number;
      maxDispatches: number;
      maxPaddedInvocations: number;
      maxContactTriangleVisits: number;
    }>;
  }>,
) {
  assertGarmentStagedSourceCutSeamsV1(input.material, input.seams);
  const core = snapshotGarmentStagedSourceCutCoreV1(input.material);
  const { start } = input;
  const elapsedFrames = start?.elapsedFrames ?? 0;
  if (start) {
    if (
      !Number.isSafeInteger(elapsedFrames) ||
      elapsedFrames < 1 ||
      !Number.isSafeInteger(elapsedFrames + core.parameters.frameCount)
    )
      throw new RangeError('The staged motion needs a valid preceding frame number.');
    validateGarmentStagedSourceCutMotionV1(start, core.uploads.positions);
    core.uploads.positions = start.positionsMInvMass.slice();
    core.uploads.previousPositions = start.previousPositionsMInvMass.slice();
    core.uploads.velocities = start.velocities.slice();
    for (const [index, packet] of core.predictionFrames.entries()) {
      const continued = encodeXpbdPredictFrameParamsV1({
        ...decodeXpbdPredictFrameParamsV1(packet),
        simulationSeconds: (elapsedFrames + index) * core.parameters.dtS,
      });
      core.predictionFrames[index] = continued;
      core.uniformPackets[index] = continued;
    }
  }
  const { limits, budgets } = input;
  const body = captureActualBodyTriangleGeometryV1(input.bodyPositionsM, input.bodyTriangles);
  const bodyVertexCount = body.positions.length / 3;
  const bodyTriangleCount = body.triangles.length / 3;
  const { particleCount } = input.material;
  if (particleCount !== input.seams.particleCount || bodyVertexCount < 4 || bodyTriangleCount < 4)
    throw new RangeError('The cut, seam and body counts do not agree with the staged frame.');
  const visitBudget = input.bodyContactVisitBudget;
  const contactVisits =
    particleCount * (visitBudget ?? bodyTriangleCount) * core.parameters.frameCount;
  if (
    !Number.isSafeInteger(budgets.maxContactTriangleVisits) ||
    budgets.maxContactTriangleVisits < 1 ||
    budgets.maxContactTriangleVisits > HARD_EXHAUSTIVE_VISITS ||
    contactVisits > budgets.maxContactTriangleVisits
  )
    throw new RangeError('Body contact exceeds the staged frame visit budget.');
  const groups = actualBodyTriangleMeshContactWorkgroupsV2(particleCount);
  const contactParams = packActualBodyTriangleMeshContactParamsV2({
    particleCount,
    bodyVertexCount,
    bodyTriangleCount,
    clearanceMarginM: 0.002,
    maximumCorrectionM: 0.08,
    minimumNormalLengthSquaredM4: 1e-20,
    outwardNormalSign: input.bodyOutwardSign,
  });
  const contactDiagnostics = new Uint32Array(10);
  contactDiagnostics[6] = 0xffff_ffff;
  const contact: Upload[] = [
    { name: 'bodyPositions', kind: 'storage', bytes: body.positions },
    { name: 'bodyTriangles', kind: 'storage', bytes: body.triangles },
    { name: 'contactParams', kind: 'uniform', bytes: contactParams },
    { name: 'contactDiagnostics', kind: 'storage', bytes: contactDiagnostics },
  ];
  const bodyQueryBytes =
    visitBudget === undefined
      ? 0
      : particleCount * ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1.resultStrideBytes;
  if (visitBudget !== undefined) {
    const tree = prepareActualBodyContactAabbPacketV1(body.positions, body.triangles);
    const { nodes, ordinals } = snapshotActualBodyContactAabbBuffersV1(tree);
    const query = packActualBodyContactNearestCandidateParamsV1({
      body: tree,
      queryCount: particleCount,
      normalFloor: 1e-20,
      outwardSign: input.bodyOutwardSign,
      traversal: { mode: 'tree', visitBudget },
    });
    contact.push(
      { name: 'bodyNodes', kind: 'storage', bytes: nodes },
      { name: 'bodyOrdinals', kind: 'storage', bytes: ordinals },
      { name: 'bodyQueryParams', kind: 'uniform', bytes: query },
      { name: 'bodyQueryHits', kind: 'storage', bytes: new Uint8Array(bodyQueryBytes) },
    );
  }
  const seam = createXpbdEmbeddedSeamFrameLayoutV1(
    input.seams,
    {
      ...input.intent,
      currentPositionsMInvMass: core.uploads.positions,
      dtS: core.parameters.dtS,
      seamComplianceMPerN: core.parameters.seamComplianceMPerN,
    },
    core.parameters,
    limits,
    budgets,
  );
  const main: Upload[] = [
    ...Object.entries(core.uploads).map(
      ([name, bytes]): Upload => ({ name, kind: 'storage', bytes }),
    ),
    ...core.uniformPackets.map(
      (bytes, index): Upload => ({ name: 'coreUniform' + index, kind: 'uniform', bytes }),
    ),
    ...contact,
  ].filter(({ bytes }) => bytes.byteLength !== 0);
  const minDeviceLimits = [
    [limits.maxComputeInvocationsPerWorkgroup, 64],
    [limits.maxComputeWorkgroupSizeX, 64],
    [limits.maxBindingsPerBindGroup, 8],
    [limits.maxStorageBuffersPerShaderStage, 7],
    [limits.maxUniformBuffersPerShaderStage, 2],
    [limits.maxBindGroups, 1],
    [
      limits.maxComputeWorkgroupsPerDimension,
      Math.max(
        groups,
        ...[...core.distance, ...core.bend, ...core.continuum, ...core.resets].map(
          (r) => r.workgroups,
        ),
      ),
    ],
  ];
  if (
    minDeviceLimits.some(
      ([actual, required]) => !Number.isSafeInteger(actual) || actual < required,
    ) ||
    !Number.isSafeInteger(limits.maxBufferSize) ||
    !Number.isSafeInteger(limits.maxStorageBufferBindingSize) ||
    !Number.isSafeInteger(limits.maxUniformBufferBindingSize) ||
    main.some(
      ({ kind, bytes }) =>
        bytes.byteLength >
        Math.min(
          limits.maxBufferSize,
          kind === 'storage'
            ? limits.maxStorageBufferBindingSize
            : limits.maxUniformBufferBindingSize,
        ),
    )
  )
    throw new RangeError('The staged frame exceeds the stated device limits.');
  const gpuBytes = main.reduce((total, { bytes }) => total + bytes.byteLength, 0) + seam.gpuBytes;
  const { frameCount } = core.parameters;
  const contactDispatches = frameCount * (bodyQueryBytes ? 2 : 1);
  const dispatches = core.dispatchCount + seam.dispatches + contactDispatches;
  const paddedInvocations =
    core.paddedInvocations + seam.paddedInvocations + groups * 64 * contactDispatches;
  for (const [value, requested, cap] of [
    [gpuBytes, budgets.maxGpuBytes, 512 * 1024 * 1024],
    [dispatches, budgets.maxDispatches, 1_000_000],
    [paddedInvocations, budgets.maxPaddedInvocations, 1_000_000_000],
  ] as const) {
    if (
      !Number.isSafeInteger(value) ||
      !Number.isSafeInteger(requested) ||
      value > requested ||
      requested > cap
    )
      throw new RangeError('The combined staged frame exceeds its binding or dispatch budget.');
  }
  return {
    core,
    body,
    bodyOutwardSign: input.bodyOutwardSign,
    main,
    seam,
    gpuBytes,
    dispatches,
    paddedInvocations,
    contactVisits,
    bodyQueryBytes,
    groups,
    elapsedFrames,
  };
}

/** Admits compute buffers and work for the shared frame recorder. Copies and publication are separate. */
export function prepareGarmentStagedSourceCutFrameV1(input: Parameters<typeof prepareUploads>[0]) {
  const data = prepareUploads(input);
  const handle = Object.freeze({
    operationOrder: data.seam.stage.operationOrder,
    activeConstraintCount: data.seam.stage.activeConstraintCount,
    frameCount: data.core.parameters.frameCount,
    elapsedFrames: data.elapsedFrames,
    particleCount: data.core.counts.particles,
    gpuBytes: data.gpuBytes,
    dispatches: data.dispatches,
    paddedInvocations: data.paddedInvocations,
    contactTriangleVisits: data.contactVisits,
    ...(data.bodyQueryBytes > 0 ? { bodyQueryBytes: data.bodyQueryBytes } : {}),
  });
  owners.set(handle, data);
  return handle;
}

export function snapshotGarmentStagedSourceCutValidationV1(
  handle: ReturnType<typeof prepareGarmentStagedSourceCutFrameV1>,
) {
  const data = owners.get(handle);
  if (!data) throw new TypeError('A prepared staged source-cut frame is required.');
  return {
    bodyPositionsM: data.body.positions.slice(),
    bodyTriangles: data.body.triangles.slice(),
    bodyOutwardSign: data.bodyOutwardSign,
    positionsMInvMass: data.core.uploads.positions.slice(),
    previousPositionsMInvMass: data.core.uploads.previousPositions.slice(),
    velocities: data.core.uploads.velocities.slice(),
    seamTargetLengthsM: snapshotXpbdEmbeddedSeamTargetsV1(data.seam),
    cut: structuredClone(data.core.cut),
  };
}

export function bindGarmentStagedSourceCutFrameV1(
  handle: ReturnType<typeof prepareGarmentStagedSourceCutFrameV1>,
  device: Pick<GPUDevice, 'createBindGroup'>,
  pipelines: StagedPipelines,
  upload: (source: Upload) => GPUBuffer,
) {
  const data = owners.get(handle);
  if (!data) throw new TypeError('A prepared staged source-cut frame is required.');
  const { core, main, seam, groups } = data;
  const uploadDetached = (entry: Upload) => {
    const bytes =
      entry.bytes instanceof ArrayBuffer
        ? entry.bytes.slice(0)
        : new Uint8Array(
            new Uint8Array(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength),
          );
    const buffer = upload({ ...entry, bytes });
    if (buffer.size !== entry.bytes.byteLength)
      throw new RangeError('A staged GPU allocation differs from its admitted extent.');
    return buffer;
  };
  const buffers = new Map(main.map((entry) => [entry.name, uploadDetached(entry)]));
  const get = (name: string) => {
    const b = buffers.get(name);
    if (!b) throw new RangeError('Missing admitted GPU buffer ' + name);
    return b;
  };
  const uniforms = new Map(
    core.uniformPackets.map((packet, index) => [packet, get('coreUniform' + index)]),
  );
  const u = (p: ArrayBuffer) => {
    const b = uniforms.get(p);
    if (!b) throw new RangeError('No admitted uniform for this run.');
    return b;
  };
  type Command = ReturnType<typeof command>;
  function command(
    pipeline: GPUComputePipeline,
    groupCount: number,
    entries: readonly (string | GPUBuffer)[],
  ) {
    return {
      pipeline,
      workgroups: groupCount,
      group: device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: entries.map((entry, binding) => ({
          binding,
          resource: { buffer: typeof entry === 'string' ? get(entry) : entry },
        })),
      }),
    };
  }
  const position = get('positions');
  const embedded = bindXpbdEmbeddedSeamFrameSlotV1(
    seam,
    position,
    { embeddedSeam: pipelines.embeddedSeam, scalarReset: pipelines.scalarReset },
    device,
    upload,
  );
  const predict = core.predictionFrames.map((p) =>
    command(pipelines.predict, groups, [
      'positions',
      'previousPositions',
      'velocities',
      'restPositions',
      u(p),
    ]),
  );
  const velocity = command(pipelines.velocity, groups, [
    'positions',
    'previousPositions',
    'velocities',
    'restPositions',
    u(core.velocityParams),
    'velocityDiagnostics',
    'particleRetention',
  ]);
  let query: Command | undefined;
  let body: Command;
  if (data.bodyQueryBytes > 0) {
    if (!pipelines.bodyQuery) throw new TypeError('The staged body query pipeline is required.');
    query = command(pipelines.bodyQuery, groups, [
      'positions',
      'bodyPositions',
      'bodyTriangles',
      'bodyNodes',
      'bodyOrdinals',
      'bodyQueryParams',
      'bodyQueryHits',
    ]);
    body = command(pipelines.bodyContact, groups, [
      'positions',
      'previousPositions',
      'bodyQueryHits',
      'contactParams',
      'contactDiagnostics',
    ]);
  } else {
    body = command(pipelines.bodyContact, groups, [
      'positions',
      'previousPositions',
      'bodyPositions',
      'bodyTriangles',
      'contactParams',
      'contactDiagnostics',
    ]);
  }
  const distance = core.distance.map((r) =>
    command(pipelines.distance, r.workgroups, [
      'positions',
      'distancePairs',
      'distanceRestLengths',
      'distanceLambdas',
      u(r.params),
    ]),
  );
  const bend = core.bend.map((r) =>
    command(pipelines.cutBend, r.workgroups, [
      'positions',
      'bendQuads',
      'cutBendRest',
      'bendLambdas',
      u(r.params),
      'bendDiagnostics',
    ]),
  );
  const continuum = core.continuum.map((r) =>
    command(pipelines.cutContinuum, r.workgroups, [
      'positions',
      'continuumTriangles',
      'continuumRestFrames',
      'continuumMaterialIndices',
      'continuumMaterials',
      'continuumLambdas',
      u(r.params),
      'continuumStatuses',
    ]),
  );
  const resets = core.resets.map((r) => ({
    kind: r.kind,
    cmd:
      r.kind === 'continuum'
        ? command(pipelines.continuumReset, r.workgroups, [
            'continuumLambdas',
            u(r.params),
            'continuumStatuses',
          ])
        : command(
            r.kind === 'bend' ? pipelines.scalarReset : pipelines.distanceReset,
            r.workgroups,
            [r.kind === 'bend' ? 'bendLambdas' : 'distanceLambdas', u(r.params)],
          ),
  }));
  const firstReset = resets.filter((r) => r.kind === 'distance').map(({ cmd }) => cmd);
  const laterResets = resets.filter((r) => r.kind !== 'distance').map(({ cmd }) => cmd);
  return {
    position,
    previousPositions: get('previousPositions'),
    velocities: get('velocities'),
    contactDiagnostics: get('contactDiagnostics'),
    bodyQueryHits: query ? get('bodyQueryHits') : undefined,
    bendDiagnostics: get('bendDiagnostics'),
    continuumStatuses: get('continuumStatuses'),
    velocityDiagnostics: get('velocityDiagnostics'),
    record(
      frame: number,
      initialPass: FramePass,
      capture?: (phase: StagedSourceCutFramePhaseV1) => FramePass,
    ) {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= predict.length)
        throw new RangeError('Frame is outside the admitted staged run.');
      let pass = initialPass;
      let seamPasses = 0;
      const emit = (cmd: Command) => {
        pass.setPipeline(cmd.pipeline);
        pass.setBindGroup(0, cmd.group);
        pass.dispatchWorkgroups(cmd.workgroups);
      };
      const captureFirstSweep = (phase: FirstSweepPhase) => {
        if (capture && seamPasses < 2) pass = capture(phase);
      };
      recordXpbdMaterialFrameV1(
        {
          predict: () => {
            emit(predict[frame]);
            if (capture) pass = capture('prediction');
          },
          reset: () => {
            firstReset.forEach(emit);
            emit(embedded.reset);
            laterResets.forEach(emit);
          },
          distance: () => {
            distance.forEach(emit);
            captureFirstSweep('first distance solve');
          },
          seam: () => {
            embedded.colors.forEach(emit);
            captureFirstSweep(
              seamPasses === 0 ? 'first embedded seam solve' : 'second embedded seam solve',
            );
            seamPasses++;
          },
          bend: () => {
            bend.forEach(emit);
            captureFirstSweep('first bend solve');
          },
          continuum: () => {
            continuum.forEach(emit);
            captureFirstSweep('first continuum solve');
          },
          contact: () => {
            if (capture) pass = capture('mechanics');
            if (query) emit(query);
            emit(body);
          },
          velocity: () => emit(velocity),
        },
        core.parameters.solverIterations,
      );
    },
  };
}
