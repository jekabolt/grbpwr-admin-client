/* global GPUBuffer, GPUBufferUsage, GPUDevice, GPUMapMode, GPUComputePipeline, GPUShaderModuleDescriptor */

import { DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1 } from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import { captureActualBodyTriangleGeometryV1 } from 'lib/cloth/body/actual-body-triangle-aabb-tree-v1';
import {
  MAXIMUM_LAYERED_CUT_RETREAT_WITNESSES_V1,
  MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1,
  MAXIMUM_LOCAL_CUT_WITNESSES_V1,
  retreatSourceCutWitnessMotionV1,
  separateSourceCutWitnessesV1,
} from 'lib/cloth/runtime/cpu/source-cut-local-contact-response-v1';
import { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';
import { ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2 } from 'lib/cloth/runtime/webgpu/actual-body-triangle-mesh-contact-kernel-v2';
import {
  actualBodyContactPortableShaderDescriptorV1,
  getActualBodyContactPortablePipelineIdentityV1,
} from 'lib/cloth/runtime/webgpu/actual-body-contact-portable-kernel-v1';
import { ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1 } from 'lib/cloth/runtime/webgpu/actual-body-contact-nearest-candidate-v1';
import { stagedNearestBodyContactShadersV1 } from 'lib/cloth/runtime/webgpu/actual-body-contact-nearest-projection-v1';
import { assertGarmentStagedSourceCutSeamsV1 } from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';
import {
  bindGarmentStagedSourceCutFrameV1,
  prepareGarmentStagedSourceCutFrameV1,
  snapshotGarmentStagedSourceCutValidationV1,
  STAGED_SOURCE_CUT_FIRST_SWEEP_PHASES_V1,
  type StagedSourceCutFramePhaseV1,
  validateGarmentStagedSourceCutMotionV1,
} from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-frame-v1';
import {
  CONTINUUM_STRAIN_CUT_WGSL_V1,
  CONTINUUM_STRAIN_CUT_SOURCE_SHA256_V1,
} from 'lib/cloth/runtime/webgpu/triangle-strain-continuum-vnext-kernel';
import { inspectOwnedActiveXpbdDeviceLeaseV1 } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import {
  getXpbdDistancePipelineIdentityV1,
  xpbdDistanceShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-distance-kernel-v1';
import {
  XPBD_EMBEDDED_CUT_BEND_ENTRY_POINT_V1,
  XPBD_EMBEDDED_CUT_BEND_SOURCE_SHA256_V1,
  XPBD_EMBEDDED_CUT_BEND_WGSL_V1,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
} from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';
import {
  getXpbdInitializationCoreResetPipelineIdentityV1,
  xpbdInitializationCoreResetShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-initialization-core-reset-kernels';
import {
  getXpbdMaterialVelocityPipelineIdentityV2,
  xpbdMaterialVelocityShaderDescriptorV2,
  XPBD_MATERIAL_VELOCITY_DIAGNOSTICS_BYTES_V2,
} from 'lib/cloth/runtime/webgpu/xpbd-material-velocity-kernel-v2';
import {
  getXpbdPredictPipelineIdentityV1,
  xpbdPredictShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-predict-kernel-v1';
import {
  getXpbdSeamSolveEmbeddedPipelineIdentityV1,
  xpbdSeamSolveEmbeddedShaderDescriptorV1,
} from 'lib/cloth/runtime/webgpu/xpbd-seam-solve-embedded-kernel-v1';

import { prepareActualBodySourceCutContactV1 } from './actual-body-source-cut-contact-v1';

type FrameInput = Omit<Parameters<typeof prepareGarmentStagedSourceCutFrameV1>[0], 'limits'>;
type Intent = FrameInput['intent'];
type StageCommand = Pick<
  Intent,
  'operationOrder' | 'action' | 'requestedReductionM' | 'maximumReductionM'
>;
type RunRequest = Readonly<{
  ownedLease: unknown;
  frame: Omit<FrameInput, 'start' | 'intent'> & Readonly<{ intent: StageCommand }>;
  maxCopyBytes: number;
  assertCurrentSource: () => boolean;
  captureInitialPhases?: boolean;
  captureFirstMechanicalSweep?: boolean;
  /** Optional displacement limit for settling a stressed initial placement. */
  maximumStepDisplacementM?: number;
  enableLocalClothContactResponse?: boolean;
  capDisplacementPerParticle?: boolean;
}>;
type Work = {
  dispatches: number;
  paddedInvocations: number;
  contactTriangleVisits: number;
  copyBytes: number;
};
type PhysicalFrame = {
  frame: number;
  components: number;
  referenceCandidatePairs: number;
  selfCandidatePairs: number;
};
type Motion = Pick<
  NonNullable<FrameInput['start']>,
  'positionsMInvMass' | 'previousPositionsMInvMass' | 'velocities'
>;

function maximumMotionM(base: Float32Array, next: Float32Array) {
  let maximum = 0;
  for (let i = 0; i < base.length; i += 4) {
    maximum = Math.max(
      maximum,
      Math.hypot(next[i] - base[i], next[i + 1] - base[i + 1], next[i + 2] - base[i + 2]),
    );
  }
  return maximum;
}

/** Preserve the velocity/contact correction of the proposal at the accepted displacement scale. */
function scaleMotion(base: Float32Array, motion: Motion, scale: number, perParticleLimit?: number) {
  const positions = motion.positionsMInvMass.slice();
  const previous = motion.previousPositionsMInvMass.slice();
  const velocities = motion.velocities.slice();
  for (let i = 0; i < positions.length; i += 4) {
    let particleScale = scale;
    if (perParticleLimit !== undefined) {
      const length = Math.hypot(
        positions[i] - base[i],
        positions[i + 1] - base[i + 1],
        positions[i + 2] - base[i + 2],
      );
      if (length > perParticleLimit) particleScale *= perParticleLimit / length;
    }
    for (let axis = 0; axis < 3; axis++) {
      const row = i + axis;
      positions[row] = base[row] + (positions[row] - base[row]) * particleScale;
      previous[row] = base[row] + (previous[row] - base[row]) * particleScale;
      velocities[row] *= particleScale;
    }
  }
  return { positionsMInvMass: positions, previousPositionsMInvMass: previous, velocities };
}
type Program = {
  frame: Omit<FrameInput, 'intent' | 'start'>;
  ownedLease: RunRequest['ownedLease'];
  maxCopyBytes: number;
  assertCurrentSource: RunRequest['assertCurrentSource'];
  captureInitialPhases: boolean;
  captureFirstMechanicalSweep: boolean;
  maximumStepDisplacementM: number | undefined;
  enableLocalClothContactResponse: boolean;
  capDisplacementPerParticle: boolean;
  used: Work;
  elapsedFrames: number;
  busy: boolean;
  geometry?: {
    garment: ReturnType<typeof prepareSourceCutContactMeshV1>;
    body: ReturnType<typeof prepareActualBodySourceCutContactV1>;
  };
  acceptedFrame?: PhysicalFrame;
  compiledPipelines?: Awaited<ReturnType<typeof compileStagedPipelines>>;
};
type WindowReceipt = Awaited<ReturnType<typeof executeWindow>>['receipt'];
type Checkpoint = {
  program: Program;
  start: NonNullable<FrameInput['start']>;
  stageIndex: number;
  targetLengthsM: Float32Array;
  activeConstraintCount: number;
};
const running = new WeakSet<object>();
const checkpoints = new WeakMap<WindowReceipt, Checkpoint>();

async function sha256(bytes: ArrayBuffer | ArrayBufferView) {
  const copy =
    bytes instanceof ArrayBuffer
      ? bytes.slice(0)
      : new Uint8Array(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Starts the first operation on the caller's existing XPBD device. */
export async function runStagedSourceCutFramesV1(request: RunRequest, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const {
    frame,
    ownedLease,
    maxCopyBytes,
    assertCurrentSource,
    captureInitialPhases,
    captureFirstMechanicalSweep,
    maximumStepDisplacementM,
    enableLocalClothContactResponse,
    capDisplacementPerParticle,
  } = request;
  if (
    maximumStepDisplacementM !== undefined &&
    (!Number.isFinite(maximumStepDisplacementM) ||
      maximumStepDisplacementM < 0.00001 ||
      maximumStepDisplacementM > 0.005)
  )
    throw new RangeError('The staged displacement limit must be between 0.01 and 5 mm.');
  if (
    (enableLocalClothContactResponse || capDisplacementPerParticle) &&
    maximumStepDisplacementM === undefined
  )
    throw new RangeError('The staged motion policy requires a displacement limit.');
  const { material, seams, intent, bodyOutwardSign } = frame;
  assertGarmentStagedSourceCutSeamsV1(material, seams);
  const { action, operationOrder, requestedReductionM, maximumReductionM } = intent;
  if (operationOrder !== seams.stages[0]?.operationOrder || action !== 'activate')
    throw new RangeError('A staged program starts with its first seam activation.');
  const totalConstraintCount = seams.stages.at(-1)!.activeConstraintCount;
  const body = captureActualBodyTriangleGeometryV1(frame.bodyPositionsM, frame.bodyTriangles);
  const program: Program = {
    frame: {
      material,
      seams,
      bodyPositionsM: body.positions,
      bodyTriangles: body.triangles,
      bodyOutwardSign,
      bodyContactVisitBudget: frame.bodyContactVisitBudget,
      budgets: { ...frame.budgets },
    },
    ownedLease,
    maxCopyBytes,
    assertCurrentSource,
    captureInitialPhases: captureInitialPhases === true,
    captureFirstMechanicalSweep: captureFirstMechanicalSweep === true,
    maximumStepDisplacementM,
    enableLocalClothContactResponse: enableLocalClothContactResponse === true,
    capDisplacementPerParticle: capDisplacementPerParticle === true,
    used: { dispatches: 0, paddedInvocations: 0, contactTriangleVisits: 0, copyBytes: 0 },
    elapsedFrames: 0,
    busy: false,
  };
  const result = await executeWindow(
    program,
    {
      ...program.frame,
      intent: {
        action,
        operationOrder,
        requestedReductionM,
        maximumReductionM,
        priorActiveConstraintCount: 0,
        priorTargetLengthsM: new Float32Array(totalConstraintCount),
      },
    },
    signal,
  );
  return publishCheckpoint(program, result, 0);
}

/** Continues from the most recent accepted frame with the same source and device lease. */
export async function continueStagedSourceCutFramesV1(
  receipt: WindowReceipt,
  command: StageCommand,
  signal?: AbortSignal,
) {
  return advanceStagedSourceCutFrames(receipt, command, signal);
}

/** Resumes an accepted in-memory checkpoint after the preceding lease has ended. */
export async function resumeStagedSourceCutFramesV1(
  receipt: WindowReceipt,
  command: StageCommand,
  ownedLease: RunRequest['ownedLease'],
  signal?: AbortSignal,
) {
  return advanceStagedSourceCutFrames(receipt, command, signal, { ownedLease });
}

async function advanceStagedSourceCutFrames(
  receipt: WindowReceipt,
  command: StageCommand,
  signal?: AbortSignal,
  replacement?: Readonly<{ ownedLease: RunRequest['ownedLease'] }>,
) {
  const previous = checkpoints.get(receipt);
  if (!previous) throw new TypeError('An accepted staged window receipt is required.');
  const { program: precedingProgram, start, targetLengthsM, activeConstraintCount } = previous;
  if (precedingProgram.busy || precedingProgram.elapsedFrames !== start.elapsedFrames)
    throw new Error('The staged checkpoint is busy or has already advanced.');
  const { action, operationOrder, requestedReductionM, maximumReductionM } = command;
  if (action !== 'activate' && action !== 'contract' && action !== 'contract-active')
    throw new RangeError('Expected a seam activation or contraction.');
  const stageIndex = previous.stageIndex + (action === 'activate' ? 1 : 0);
  if (operationOrder !== precedingProgram.frame.seams.stages[stageIndex]?.operationOrder)
    throw new RangeError(
      'The next window must contract the current seam or activate its successor.',
    );

  let program = precedingProgram;
  if (replacement) {
    const oldLease = inspectOwnedActiveXpbdDeviceLeaseV1(precedingProgram.ownedLease);
    if (oldLease.ok || oldLease.code !== 'inactive')
      throw new Error('Release the preceding XPBD lease before resuming the staged program.');
    if (!inspectOwnedActiveXpbdDeviceLeaseV1(replacement.ownedLease).ok)
      throw new TypeError('Resuming a staged program requires a new active owned XPBD lease.');
    // Preserve the source guard, verified geometry, and cumulative work already charged.
    // A different lease must compile its own device-bound pipelines.
    program = {
      ...precedingProgram,
      ownedLease: replacement.ownedLease,
      compiledPipelines: undefined,
    };
  }

  precedingProgram.busy = true;
  try {
    const result = await executeWindow(
      program,
      {
        ...program.frame,
        start,
        intent: {
          action,
          operationOrder,
          requestedReductionM,
          maximumReductionM,
          priorActiveConstraintCount: activeConstraintCount,
          priorTargetLengthsM: targetLengthsM,
        },
      },
      signal,
    );
    const next = publishCheckpoint(program, result, stageIndex);
    checkpoints.delete(receipt);
    return next;
  } finally {
    precedingProgram.busy = false;
  }
}

function publishCheckpoint(
  program: Program,
  {
    receipt,
    targetLengthsM,
    assertCurrent,
    lastPhysicalFrame,
  }: Awaited<ReturnType<typeof executeWindow>>,
  stageIndex: number,
) {
  assertCurrent();
  const { frame, positionsMInvMass, previousPositionsMInvMass, velocities } = receipt;
  const elapsedFrames = frame.elapsedFrames + frame.frameCount;
  checkpoints.set(receipt, {
    program,
    stageIndex,
    targetLengthsM,
    activeConstraintCount: frame.activeConstraintCount,
    start: {
      elapsedFrames,
      positionsMInvMass: positionsMInvMass.slice(),
      previousPositionsMInvMass: previousPositionsMInvMass.slice(),
      velocities: velocities.slice(),
    },
  });
  program.elapsedFrames = elapsedFrames;
  program.acceptedFrame = lastPhysicalFrame;
  return receipt;
}

async function compileStagedPipelines(
  device: GPUDevice,
  usesBodyQuery: boolean,
  current: () => void,
) {
  const cutBendSha = await sha256(new TextEncoder().encode(XPBD_EMBEDDED_CUT_BEND_WGSL_V1));
  const cutContinuumSha = await sha256(new TextEncoder().encode(CONTINUUM_STRAIN_CUT_WGSL_V1));
  if (cutBendSha !== XPBD_EMBEDDED_CUT_BEND_SOURCE_SHA256_V1)
    throw new Error('The cut bend shader differs from its fixed source.');
  if (cutContinuumSha !== CONTINUUM_STRAIN_CUT_SOURCE_SHA256_V1)
    throw new Error('The cut continuum shader differs from its fixed source.');
  current();
  const jobs = {
    predict: [xpbdPredictShaderDescriptorV1(), getXpbdPredictPipelineIdentityV1()],
    velocity: [
      xpbdMaterialVelocityShaderDescriptorV2(),
      getXpbdMaterialVelocityPipelineIdentityV2(),
    ],
    distance: [xpbdDistanceShaderDescriptorV1(), getXpbdDistancePipelineIdentityV1()],
    cutBend: [
      { code: XPBD_EMBEDDED_CUT_BEND_WGSL_V1 },
      Promise.resolve({ entryPoint: XPBD_EMBEDDED_CUT_BEND_ENTRY_POINT_V1, sha256: cutBendSha }),
    ],
    cutContinuum: [
      { code: CONTINUUM_STRAIN_CUT_WGSL_V1 },
      Promise.resolve({ entryPoint: 'main', sha256: cutContinuumSha }),
    ],
    embeddedSeam: [
      xpbdSeamSolveEmbeddedShaderDescriptorV1(),
      getXpbdSeamSolveEmbeddedPipelineIdentityV1(),
    ],
    scalarReset: [
      xpbdInitializationCoreResetShaderDescriptorV1('bend'),
      getXpbdInitializationCoreResetPipelineIdentityV1('bend'),
    ],
    distanceReset: [
      xpbdInitializationCoreResetShaderDescriptorV1('distance'),
      getXpbdInitializationCoreResetPipelineIdentityV1('distance'),
    ],
    continuumReset: [
      xpbdInitializationCoreResetShaderDescriptorV1('continuum'),
      getXpbdInitializationCoreResetPipelineIdentityV1('continuum'),
    ],
    ...(usesBodyQuery
      ? await stagedNearestBodyContactShadersV1()
      : {
          bodyContact: [
            actualBodyContactPortableShaderDescriptorV1(),
            getActualBodyContactPortablePipelineIdentityV1(),
          ] as const,
        }),
  } as const;
  const identities = await Promise.all(Object.values(jobs).map(([, identity]) => identity));
  current();
  const shaders = {} as Record<keyof typeof jobs, GPUComputePipeline>;
  const namedJobs = Object.keys(jobs) as (keyof typeof jobs)[];
  for (const [index, name] of namedJobs.entries()) {
    const descriptor: GPUShaderModuleDescriptor = jobs[name][0];
    const module = device.createShaderModule(descriptor);
    const info = await module.getCompilationInfo();
    current();
    const error = info.messages.find((message) => message.type === 'error');
    if (error) throw new Error(name + ' WGSL: ' + error.message);
    shaders[name] = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: identities[index].entryPoint },
    });
    current();
  }
  return {
    usesBodyQuery,
    shaders,
    identities: Object.fromEntries(namedJobs.map((name, i) => [name, identities[i]])),
  };
}

async function executeWindow(program: Program, input: FrameInput, signal?: AbortSignal) {
  const lease = inspectOwnedActiveXpbdDeviceLeaseV1(program.ownedLease);
  if (!lease.ok) throw new TypeError('An owned exclusive XPBD lease is required.');
  const { device, queue } = lease;
  const current = () => {
    signal?.throwIfAborted();
    const authority: unknown = program.assertCurrentSource();
    if (authority !== true) {
      // A promise from a JavaScript caller cannot stand in for a current-source check.
      void Promise.resolve(authority).catch(() => {});
      throw new Error('The staged source changed or its check was not synchronous.');
    }
    signal?.throwIfAborted();
    lease.assertActive();
  };
  if (running.has(device)) throw new Error('A staged window is already running on this device.');
  running.add(device);
  const allocated: GPUBuffer[] = [];
  let readback: GPUBuffer | undefined;
  let openScopes = 0;
  const popScope = () => {
    openScopes--;
    return device.popErrorScope();
  };
  try {
    current();
    const frame = prepareGarmentStagedSourceCutFrameV1({ ...input, limits: lease.limits });
    const source = snapshotGarmentStagedSourceCutValidationV1(frame);
    const positionBytes = frame.particleCount * 16;
    const frameReadbackBytes =
      3 * positionBytes +
      ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2 +
      XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2 +
      XPBD_MATERIAL_VELOCITY_DIAGNOSTICS_BYTES_V2 +
      input.material.continuumCount * 4 +
      (frame.bodyQueryBytes ?? 0);
    const phaseOffsets = new Map<StagedSourceCutFramePhaseV1, number>();
    if (
      frame.elapsedFrames === 0 &&
      (program.captureInitialPhases || program.captureFirstMechanicalSweep)
    ) {
      const firstSweep = program.captureFirstMechanicalSweep
        ? STAGED_SOURCE_CUT_FIRST_SWEEP_PHASES_V1
        : [];
      const phases = ['prediction', ...firstSweep, 'mechanics'] as const;
      for (const phase of phases)
        phaseOffsets.set(phase, frameReadbackBytes + phaseOffsets.size * positionBytes);
    }
    const traceBytes = phaseOffsets.size * positionBytes;
    const readbackBytes = frameReadbackBytes + traceBytes;
    const safeguardedCopyBytes =
      program.maximumStepDisplacementM === undefined ? 0 : 3 * positionBytes;
    const nextWork: Work = {
      dispatches: program.used.dispatches + frame.dispatches,
      paddedInvocations: program.used.paddedInvocations + frame.paddedInvocations,
      contactTriangleVisits: program.used.contactTriangleVisits + frame.contactTriangleVisits,
      copyBytes:
        program.used.copyBytes +
        (frameReadbackBytes + safeguardedCopyBytes) * frame.frameCount +
        traceBytes,
    };
    const { budgets } = input;
    if (
      nextWork.dispatches > budgets.maxDispatches ||
      nextWork.paddedInvocations > budgets.maxPaddedInvocations ||
      nextWork.contactTriangleVisits > budgets.maxContactTriangleVisits
    )
      throw new RangeError('Cumulative staged commands exceed the program work budget.');
    if (
      !Number.isSafeInteger(program.maxCopyBytes) ||
      program.maxCopyBytes < 1 ||
      program.maxCopyBytes > 1024 * 1024 * 1024 ||
      nextWork.copyBytes > program.maxCopyBytes ||
      readbackBytes > lease.limits.maxBufferSize ||
      frame.gpuBytes + readbackBytes > budgets.maxGpuBytes
    )
      throw new RangeError('The staged validation readback exceeds its copy or buffer budget.');

    if (!program.geometry) {
      const garment = prepareSourceCutContactMeshV1(source.cut, 36_000);
      const body = prepareActualBodySourceCutContactV1(
        source.bodyPositionsM,
        source.bodyTriangles,
        130_000_000,
      );
      if (
        Math.abs(body.bodyAudit.topology.signedVolumeM3) <= 1e-12 ||
        Math.sign(body.bodyAudit.topology.signedVolumeM3) !== source.bodyOutwardSign
      )
        throw new RangeError('The contact direction must match the audited body winding.');
      program.geometry = { garment, body };
    }
    const { garment, body } = program.geometry;
    const cutTriangleCount = garment.topology.reduce((sum, part) => sum + part.triangleCount, 0);
    // The large layered cut is still checked exhaustively by the same hierarchy and predicates.
    const layeredCutBudget =
      cutTriangleCount >= 30_000
        ? {
            ...DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1,
            maxCandidatePairs: 1_200_000,
            maxPairVisits: 4_000_000,
          }
        : undefined;
    const retreatWitnessLimit = layeredCutBudget
      ? MAXIMUM_LAYERED_CUT_RETREAT_WITNESSES_V1
      : MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1;
    const checkContact = (positions: Float32Array) => {
      const clearance = body.validateFrame(garment, positions);
      const self = garment.validateSelfIntersection(positions, layeredCutBudget);
      const bodyTriangleCount = source.bodyTriangles.length / 3;
      const localBodyCutFaces =
        program.enableLocalClothContactResponse &&
        clearance.surface.crossings.intersectionCount + clearance.surface.unprovenPairCount <=
          MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1
          ? [
              ...new Set([
                ...clearance.surface.crossings.intersections.map(
                  ({ triangleB }) => triangleB - bodyTriangleCount,
                ),
                ...clearance.surface.unprovenPairs.map(({ cutTriangle }) => cutTriangle),
              ]),
            ]
          : [];
      const witnessPieces = (triangle: number) =>
        garment.topology.find(
          ({ triangleOffset, triangleCount }) =>
            triangle >= triangleOffset && triangle < triangleOffset + triangleCount,
        )?.pieceId ?? null;
      const contactWitnesses =
        program.maximumStepDisplacementM === undefined || (clearance.passed && self.passed)
          ? undefined
          : {
              cloth: self.intersections
                .slice(
                  0,
                  program.enableLocalClothContactResponse
                    ? MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1
                    : 2,
                )
                .map(({ triangleA, triangleB, kind }) => ({
                  pieces: [witnessPieces(triangleA), witnessPieces(triangleB)],
                  triangles: [triangleA, triangleB] as const,
                  kind,
                })),
              bodyCrossings: clearance.surface.crossings.intersections.slice(0, 1),
              bodyClearance: clearance.surface.unprovenPairs.slice(0, 1),
            };
      return {
        passed: clearance.passed && self.passed,
        components: clearance.connectedComponentCount,
        referenceCandidatePairs: clearance.surface.crossings.broadPhase.candidatePairCount,
        selfCandidatePairs: self.broadPhase.candidatePairCount,
        bodyIntersections: clearance.surface.crossings.intersectionCount,
        bodyPairsWithoutClearance: clearance.surface.unprovenPairCount,
        clothIntersections: self.intersectionCount,
        localBodyCutFaces,
        ...(layeredCutBudget &&
          program.enableLocalClothContactResponse &&
          self.intersectionCount > MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1 &&
          self.intersectionCount <= retreatWitnessLimit && {
            layeredClothPairs: self.intersections.map(
              ({ triangleA, triangleB }) => [triangleA, triangleB] as const,
            ),
          }),
        ...(contactWitnesses ? { contactWitnesses } : {}),
      };
    };
    type ContactCheck = ReturnType<typeof checkContact>;
    async function checkCandidateContact(positions: Float32Array) {
      // Let UI input and cancellation run between complete geometric checks.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      current();
      return checkContact(positions);
    }
    async function retreatCappedCutMotion(
      base: Float32Array,
      motion: ReturnType<typeof scaleMotion>,
      initial: ContactCheck,
      displacementLimit: number,
    ) {
      let contact = initial;
      let heldParticles = new Set<number>();
      const maximumPasses =
        layeredCutBudget && initial.clothIntersections > MAXIMUM_LOCAL_CUT_RETREAT_WITNESSES_V1
          ? 4
          : 2;
      for (let pass = 0; pass < maximumPasses; pass++) {
        if (
          !contact.contactWitnesses ||
          contact.clothIntersections > retreatWitnessLimit ||
          ((contact.bodyIntersections || contact.bodyPairsWithoutClearance) &&
            !contact.localBodyCutFaces.length)
        )
          break;
        current();
        const witnesses = [
          ...(contact.layeredClothPairs ??
            contact.contactWitnesses.cloth.map(({ triangles }) => triangles)),
          ...contact.localBodyCutFaces.map((face) => [face] as const),
        ];
        if (!witnesses.length || witnesses.length > retreatWitnessLimit) break;
        const next = retreatSourceCutWitnessMotionV1(
          garment,
          base,
          motion,
          witnesses,
          heldParticles,
          // A dense contact patch must not freeze the entire garment.
          layeredCutBudget ? Math.floor(base.length / 32) : undefined,
        );
        if (!next) break;
        heldParticles = next.heldParticles;
        const displacementM = maximumMotionM(base, next.motion.positionsMInvMass);
        if (displacementM > displacementLimit + 1e-7) break;
        contact = await checkCandidateContact(next.motion.positionsMInvMass);
        if (contact.passed)
          return {
            motion: next.motion,
            contact,
            displacementM,
            heldParticleCount: heldParticles.size,
          };
      }
      return undefined;
    }
    const describe = (result: ContactCheck) =>
      `Found ${result.bodyIntersections} body intersections and ${result.clothIntersections} cloth intersections. Clearance was unproved for ${result.bodyPairsWithoutClearance} body pairs.`;
    const initialPhaseTrace: {
      phase: StagedSourceCutFramePhaseV1;
      maxDisplacementM: number;
      contact: ContactCheck;
    }[] = [];
    const safeguardedSteps: {
      frame: number;
      scale: number;
      trialCount: number;
      proposedDisplacementM: number;
      repairedCutPairs?: readonly (readonly [number, number])[];
      heldParticleCount?: number;
      acceptedDisplacementM: number;
      proposalContact?: ContactCheck;
      firstCappedTrialContact?: ContactCheck;
    }[] = [];
    const validate = (
      positions: Float32Array,
      step: number,
      result = checkContact(positions),
    ): PhysicalFrame => {
      if (!result.passed) {
        const phases = initialPhaseTrace.map(
          ({ phase, maxDisplacementM, contact }) =>
            `After ${phase} the maximum displacement was ${(maxDisplacementM * 1000).toFixed(3)} mm. ${describe(contact)}`,
        );
        throw new RangeError(
          [
            `Exact-cut clearance or self-intersection failed at frame ${step}. ${describe(result)}`,
            ...phases,
          ].join(' '),
        );
      }
      const { components, referenceCandidatePairs, selfCandidatePairs } = result;
      return { frame: step, components, referenceCandidatePairs, selfCandidatePairs };
    };
    const measure = (physical: PhysicalFrame, positions: Float32Array) => ({
      ...physical,
      activeSeams: input.seams.measureActiveGaps(
        positions,
        source.seamTargetLengthsM,
        frame.activeConstraintCount,
      ),
    });
    let lastPhysicalFrame = program.acceptedFrame ?? validate(source.positionsMInvMass, 0);
    const validated = [measure(lastPhysicalFrame, source.positionsMInvMass)];
    current();

    device.pushErrorScope('validation');
    openScopes++;
    device.pushErrorScope('out-of-memory');
    openScopes++;
    // An accepted program owns one lease and one fixed shader set.
    const reusedPipelines = program.compiledPipelines;
    const usesBodyQuery = Boolean(frame.bodyQueryBytes);
    if (reusedPipelines && reusedPipelines.usesBodyQuery !== usesBodyQuery)
      throw new Error('The staged contact pipeline mode changed.');
    const compiledPipelines =
      reusedPipelines ?? (await compileStagedPipelines(device, usesBodyQuery, current));
    const create = (name: string, size: number, usage: number) => {
      current();
      const buffer = device.createBuffer({ label: name, size, usage });
      allocated.push(buffer);
      return buffer;
    };
    let computeUploadBytes = 0;
    const bound = bindGarmentStagedSourceCutFrameV1(
      frame,
      device,
      compiledPipelines.shaders,
      ({ name, kind, bytes }) => {
        computeUploadBytes += bytes.byteLength;
        if (computeUploadBytes > frame.gpuBytes) throw new RangeError('Unadmitted staged upload.');
        const usage =
          kind === 'uniform'
            ? GPUBufferUsage.UNIFORM
            : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
        const buffer = create(name, bytes.byteLength, usage | GPUBufferUsage.COPY_DST);
        const data =
          bytes instanceof ArrayBuffer
            ? new Uint8Array(bytes)
            : new Uint8Array(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        queue.writeBuffer(buffer, 0, data);
        return buffer;
      },
    );
    if (computeUploadBytes !== frame.gpuBytes) throw new RangeError('Staged upload size changed.');
    readback = create(
      'staged frame validation',
      readbackBytes,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    const copies = [
      bound.position,
      bound.previousPositions,
      bound.velocities,
      bound.contactDiagnostics,
      bound.bendDiagnostics,
      bound.velocityDiagnostics,
      bound.continuumStatuses,
      ...(bound.bodyQueryHits ? [bound.bodyQueryHits] : []),
    ];
    const offsets = new Map<GPUBuffer, number>();
    let copyOffset = 0;
    for (const buffer of copies) {
      offsets.set(buffer, copyOffset);
      copyOffset += buffer.size;
    }
    if (copyOffset !== frameReadbackBytes)
      throw new Error('Staged validation extent differs from admission.');

    const bodyQueryWork: { frame: number; visits: number; maximumVisitsPerQuery: number }[] = [];
    let finalPositions = source.positionsMInvMass;
    let finalPrevious = source.previousPositionsMInvMass;
    let finalVelocity = source.velocities;
    for (let index = 0; index < frame.frameCount; index++) {
      const step = frame.elapsedFrames + index + 1;
      const startPositions = finalPositions;
      const encoder = device.createCommandEncoder({ label: 'staged frame ' + step });
      let pass = encoder.beginComputePass();
      const capture = index === 0 && phaseOffsets.size > 0;
      bound.record(
        index,
        pass,
        capture
          ? (phase) => {
              const offset = phaseOffsets.get(phase);
              if (offset === undefined) return pass;
              pass.end();
              encoder.copyBufferToBuffer(bound.position, 0, readback!, offset, positionBytes);
              pass = encoder.beginComputePass();
              return pass;
            }
          : undefined,
      );
      pass.end();
      for (const buffer of copies)
        encoder.copyBufferToBuffer(buffer, 0, readback, offsets.get(buffer)!, buffer.size);
      const commands = encoder.finish();
      current();
      queue.submit([commands]);
      program.used.dispatches += frame.dispatches / frame.frameCount;
      program.used.paddedInvocations += frame.paddedInvocations / frame.frameCount;
      program.used.contactTriangleVisits += frame.contactTriangleVisits / frame.frameCount;
      program.used.copyBytes += frameReadbackBytes + (capture ? traceBytes : 0);
      await readback.mapAsync(GPUMapMode.READ);
      let bytes: ArrayBuffer;
      try {
        current();
        bytes = readback.getMappedRange().slice(0);
      } finally {
        readback.unmap();
      }
      const words = (buffer: GPUBuffer) =>
        new Uint32Array(bytes, offsets.get(buffer), buffer.size / 4);
      const floats = (buffer: GPUBuffer) =>
        new Float32Array(bytes, offsets.get(buffer), buffer.size / 4);
      if (bound.bodyQueryHits && input.bodyContactVisitBudget !== undefined) {
        const hits = words(bound.bodyQueryHits);
        const { status, resultStrideBytes } = ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1;
        let visits = 0;
        let maximumVisitsPerQuery = 0;
        for (let offset = 0; offset < hits.length; offset += resultStrideBytes / 4) {
          const code = hits[offset + 9];
          const work = hits[offset + 10];
          if (
            (code !== status.found && code !== status.fixed) ||
            (code === status.found ? work < 1 : work !== 0) ||
            work > input.bodyContactVisitBudget
          )
            throw new RangeError(
              `The bounded body query rejected particle ${(offset * 4) / resultStrideBytes} at frame ${step} (status ${code}, work ${work}).`,
            );
          visits += work;
          maximumVisitsPerQuery = Math.max(maximumVisitsPerQuery, work);
        }
        bodyQueryWork.push({ frame: step, visits, maximumVisitsPerQuery });
      }
      const contact = words(bound.contactDiagnostics);
      const bend = words(bound.bendDiagnostics);
      const velocity = words(bound.velocityDiagnostics);
      if (
        contact[1] ||
        contact[2] ||
        contact[3] ||
        contact[9] ||
        bend[0] ||
        velocity[0] ||
        velocity[1] ||
        velocity[2] ||
        velocity[7] ||
        words(bound.continuumStatuses).some((status) => status !== 0)
      )
        throw new RangeError(`The material or body kernel rejected frame ${step}.`);
      finalPositions = floats(bound.position);
      finalPrevious = floats(bound.previousPositions);
      finalVelocity = floats(bound.velocities);
      try {
        validateGarmentStagedSourceCutMotionV1(
          {
            positionsMInvMass: finalPositions,
            previousPositionsMInvMass: finalPrevious,
            velocities: finalVelocity,
          },
          source.positionsMInvMass,
        );
      } catch (error) {
        throw new RangeError(`Invalid physical state at frame ${step}.`, { cause: error });
      }
      if (capture) {
        for (const [phase, offset] of phaseOffsets) {
          const positions = new Float32Array(bytes, offset, positionBytes / 4);
          const maxDisplacementM = maximumMotionM(source.positionsMInvMass, positions);
          initialPhaseTrace.push({ phase, maxDisplacementM, contact: checkContact(positions) });
        }
      }
      let acceptedContact: ContactCheck | undefined;
      const limit = program.maximumStepDisplacementM;
      if (limit !== undefined) {
        const proposedDisplacementM = maximumMotionM(startPositions, finalPositions);
        const aboveLimit = proposedDisplacementM > limit;
        // A large-cut proposal outside the displacement limit cannot be committed.
        // Spend the exact candidate budget on states which can still pass admission.
        const proposalContact =
          layeredCutBudget && aboveLimit ? undefined : await checkCandidateContact(finalPositions);
        acceptedContact = proposalContact;
        if (aboveLimit || !proposalContact?.passed) {
          const proposal = {
            positionsMInvMass: finalPositions,
            previousPositionsMInvMass: finalPrevious,
            velocities: finalVelocity,
          };
          const perParticleLimit = program.capDisplacementPerParticle ? limit : undefined;
          let scale =
            perParticleLimit === undefined
              ? Math.min(proposedDisplacementM === 0 ? 1 : limit / proposedDisplacementM, 1)
              : 1;
          if (!proposalContact?.passed && scale === 1 && proposedDisplacementM <= limit)
            scale = 0.5;
          let trial:
            | {
                motion: ReturnType<typeof scaleMotion>;
                contact: ContactCheck;
                displacementM: number;
                repairedCutPairs?: readonly (readonly [number, number])[];
                heldParticleCount?: number;
              }
            | undefined;
          let smallestTrial: { contact: ContactCheck; displacementM: number } | undefined;
          let firstCappedTrialContact: ContactCheck | undefined;
          const maximumTrials = 6;
          let trialCount = 0;
          for (; trialCount < maximumTrials; scale *= 0.5) {
            current();
            trialCount++;
            const motion = scaleMotion(startPositions, proposal, scale, perParticleLimit);
            const displacementM = maximumMotionM(startPositions, motion.positionsMInvMass);
            const contact = await checkCandidateContact(motion.positionsMInvMass);
            smallestTrial = { contact, displacementM };
            if (trialCount === 1 && perParticleLimit !== undefined && !contact.passed)
              firstCappedTrialContact = contact;
            if (contact.passed && displacementM <= limit + 1e-7) {
              trial = { motion, contact, displacementM };
              break;
            }
            if (
              program.enableLocalClothContactResponse &&
              contact.bodyIntersections === 0 &&
              contact.bodyPairsWithoutClearance === 0 &&
              contact.clothIntersections > 0 &&
              contact.clothIntersections <= MAXIMUM_LOCAL_CUT_WITNESSES_V1 &&
              contact.contactWitnesses
            ) {
              const pairs = contact.contactWitnesses.cloth.map(({ triangles }) => triangles);
              const separated = separateSourceCutWitnessesV1(
                garment,
                startPositions,
                motion,
                pairs,
              );
              if (separated) {
                const repairedDisplacement = maximumMotionM(
                  startPositions,
                  separated.positionsMInvMass,
                );
                if (repairedDisplacement <= limit + 1e-7) {
                  const repairedContact = await checkCandidateContact(separated.positionsMInvMass);
                  if (repairedContact.passed) {
                    trial = {
                      motion: separated,
                      contact: repairedContact,
                      displacementM: repairedDisplacement,
                      repairedCutPairs: pairs,
                    };
                    break;
                  }
                }
              }
            }
            if (
              (trialCount === 1 || trialCount === maximumTrials) &&
              perParticleLimit !== undefined &&
              program.enableLocalClothContactResponse
            ) {
              // Try local retreat again after global backtracking has isolated a smaller contact set.
              trial = await retreatCappedCutMotion(startPositions, motion, contact, limit);
              if (trial) break;
            }
          }
          if (!trial) {
            const last = smallestTrial!;
            throw new RangeError(
              `No contact-clear displacement within the limit at frame ${step}. ` +
                `Proposed displacement ${(proposedDisplacementM * 1000).toFixed(3)} mm. ` +
                (proposalContact
                  ? describe(proposalContact)
                  : 'Raw contact check skipped above the displacement limit.') +
                ` Smallest tried displacement ${(last.displacementM * 1000).toFixed(3)} mm. ` +
                describe(last.contact) +
                ` Witnesses: ${JSON.stringify(last.contact.contactWitnesses ?? {})}`,
            );
          }
          validateGarmentStagedSourceCutMotionV1(trial.motion, source.positionsMInvMass);
          // Commit the accepted increment on the same device. Its exact readback becomes the
          // state used by the next prediction and by any later continuation.
          const committed = [
            [bound.position, trial.motion.positionsMInvMass],
            [bound.previousPositions, trial.motion.previousPositionsMInvMass],
            [bound.velocities, trial.motion.velocities],
          ] as const;
          current();
          const commit = device.createCommandEncoder({ label: 'safeguarded frame ' + step });
          for (const [buffer, values] of committed) {
            queue.writeBuffer(
              buffer,
              0,
              new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
            );
            commit.copyBufferToBuffer(buffer, 0, readback, offsets.get(buffer)!, buffer.size);
          }
          current();
          queue.submit([commit.finish()]);
          program.used.copyBytes += safeguardedCopyBytes;
          await readback.mapAsync(GPUMapMode.READ);
          try {
            current();
            const mapped = readback.getMappedRange();
            for (const [buffer, values] of committed) {
              const expected = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
              const actual = new Uint8Array(mapped, offsets.get(buffer), buffer.size);
              if (expected.some((value, i) => actual[i] !== value))
                throw new Error(`Safeguarded motion readback differs at frame ${step}.`);
            }
            finalPositions = new Float32Array(
              mapped,
              offsets.get(bound.position),
              positionBytes / 4,
            ).slice();
            finalPrevious = new Float32Array(
              mapped,
              offsets.get(bound.previousPositions),
              positionBytes / 4,
            ).slice();
            finalVelocity = new Float32Array(
              mapped,
              offsets.get(bound.velocities),
              positionBytes / 4,
            ).slice();
          } finally {
            readback.unmap();
          }
          acceptedContact = trial.contact;
          safeguardedSteps.push({
            frame: step,
            scale,
            trialCount,
            proposedDisplacementM,
            acceptedDisplacementM: trial.displacementM,
            ...(proposalContact ? { proposalContact } : {}),
            ...(firstCappedTrialContact ? { firstCappedTrialContact } : {}),
            ...(trial.repairedCutPairs ? { repairedCutPairs: trial.repairedCutPairs } : {}),
            ...(trial.heldParticleCount ? { heldParticleCount: trial.heldParticleCount } : {}),
          });
        }
      }
      lastPhysicalFrame = validate(finalPositions, step, acceptedContact);
      validated.push(measure(lastPhysicalFrame, finalPositions));
    }
    current();
    const gpuErrors = await Promise.all([popScope(), popScope()]);
    if (gpuErrors.some((error) => error !== null))
      throw new Error(
        gpuErrors
          .map((error) => error?.message ?? '')
          .filter(Boolean)
          .join(' '),
      );
    current();
    program.compiledPipelines = compiledPipelines;
    return {
      assertCurrent: current,
      targetLengthsM: source.seamTargetLengthsM,
      lastPhysicalFrame,
      receipt: {
        frame,
        validated,
        initialPhaseTrace,
        safeguardedSteps,
        ...(bodyQueryWork.length ? { bodyQueryWork } : {}),
        deviceIdentity: lease.identity,
        shaderIdentities: structuredClone(compiledPipelines.identities),
        pipelineCompilations: reusedPipelines ? 0 : Object.keys(compiledPipelines.shaders).length,
        positionsMInvMass: finalPositions.slice(),
        previousPositionsMInvMass: finalPrevious.slice(),
        velocities: finalVelocity.slice(),
      },
    };
  } finally {
    try {
      if (readback?.mapState === 'mapped') readback.unmap();
      allocated.forEach((buffer) => buffer.destroy());
      const cleanupScopes = [];
      while (openScopes > 0) cleanupScopes.push(popScope());
      await Promise.allSettled(cleanupScopes);
    } finally {
      running.delete(device);
    }
  }
}
