import { compileBendConstraints } from '../../compiler/bend-constraints';
import {
  decodeClothMaterialGpuV1,
  decodeParticleMassGpuV1,
  TRIANGLE_REST_FRAME_GPU_V1,
} from '../../compiler/material-package';
import {
  compileContinuumStrainPackageV1,
  compileSimulationPackageV0,
  CONTINUUM_STRAIN_CONSTRAINT_GPU_V1,
  type ContinuumStrainMaterialInputV1,
} from '../../compiler/simulation-package';
import {
  compileSourceCutCarrierMaterialV1,
  SOURCE_CUT_ACTIVE_REST_AREA_OFFSET_BYTES_V1,
} from '../../compiler/source-cut-carrier-material-v1';
import { prepareSourceCutSeamEmbeddingV1 } from '../../compiler/source-cut-embedded-seam-grid-v1';
import { projectSourceCutHingeCoverageV1 } from '../../compiler/source-cut-hinge-coverage-v1';
import { compileTriangleStrainScheduleV1 } from '../../compiler/triangle-strain-schedule';
import type { Vec2Mm } from '../../domain/garment-assembly-ir';
import {
  buildXpbdMechanicalColorRunsV1,
  garmentMaterialRunWorkgroupsV1,
  type GarmentMaterialRunBudgetsV1,
  type GarmentMaterialRunParametersV1,
} from './garment-material-run-plan-v1';
import { prepareStagedEmbeddedSeamActivationV1 } from './garment-staged-embedded-seam-activation-v1';
import {
  packXpbdEmbeddedCutBendRestV1,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
} from './xpbd-embedded-scalar-bend-kernel-v2';
import {
  createXpbdBendResetPacketV1,
  createXpbdContinuumResetPacketV1,
  createXpbdDistanceResetPacketV1,
} from './xpbd-initialization-core-reset';
import {
  createXpbdMaterialVelocityDiagnosticsV2,
  deriveXpbdParticleMaterialRetentionV2,
  encodeXpbdMaterialVelocityParamsV2,
  XPBD_MATERIAL_VELOCITY_ABI_V2,
} from './xpbd-material-velocity-kernel-v2';
import { encodeXpbdPredictFrameParamsV1 } from './xpbd-predict-kernel-v1';
import { CONTINUUM_STRAIN_VNEXT_STATUS_RESET } from './triangle-strain-continuum-vnext-kernel';

export const GARMENT_STAGED_SOURCE_CUT_CORE_V1 = 'garment-staged-source-cut-core/1' as const;
type CutCompile = Parameters<typeof compileSourceCutCarrierMaterialV1>;
type Input = Readonly<{
  mesh: CutCompile[0];
  grains: CutCompile[1];
  assignments: CutCompile[2];
  materials: CutCompile[3];
  materialOptions: CutCompile[4];
  cutByPiece: CutCompile[5];
  cutTolerances: CutCompile[6];
  continuumMaterials: readonly ContinuumStrainMaterialInputV1[];
  currentPositionsMInvMass: Float32Array;
  parameters: GarmentMaterialRunParametersV1;
  budgets: GarmentMaterialRunBudgetsV1;
}>;
type Handle = Readonly<{
  version: typeof GARMENT_STAGED_SOURCE_CUT_CORE_V1;
  particleCount: number;
  continuumCount: number;
  bendCount: number;
  coreGpuBytes: number;
  dispatchCount: number;
  paddedInvocations: number;
}>;
const owners = new WeakMap<Handle, ReturnType<typeof buildCore>>();
type CutShape = NonNullable<ReturnType<Input['cutByPiece']['get']>>['cut'];
type CarrierSource = Parameters<typeof prepareSourceCutSeamEmbeddingV1>[0];
type SeamPlan = ReturnType<typeof prepareStagedEmbeddedSeamActivationV1>;
type SeamStation = Readonly<{ pieceId: string; positionMm: Vec2Mm }>;
type StagedPair = Omit<
  Parameters<typeof prepareStagedEmbeddedSeamActivationV1>[0][number],
  'sideA' | 'sideB'
> &
  Readonly<{ sideA: SeamStation; sideB: SeamStation }>;
const carriers = new WeakMap<
  Handle,
  { mesh: CarrierSource; cuts: ReadonlyMap<string, CutShape> }
>();
const seamOwners = new WeakMap<SeamPlan, Handle>();

function coloredCutContinuumRest(
  flatFrames: ArrayBuffer,
  cutFrames: ArrayBuffer,
  continuum: ReturnType<typeof compileContinuumStrainPackageV1>,
): ArrayBuffer {
  const { strideBytes, offsets } = TRIANGLE_REST_FRAME_GPU_V1;
  const occupiedOffset = SOURCE_CUT_ACTIVE_REST_AREA_OFFSET_BYTES_V1;
  if (
    cutFrames.byteLength !== flatFrames.byteLength ||
    cutFrames.byteLength !== continuum.constraintCount * strideBytes
  )
    throw new RangeError(
      'The cut and colored continuum rest buffers require the same triangle count.',
    );
  const colorRest = continuum.triangleRestFrames.slice(0);
  const rawRest = new DataView(flatFrames);
  const cutRest = new DataView(cutFrames);
  const result = new DataView(colorRest);
  const records = new DataView(continuum.constraintRecords);
  const visited = new Uint8Array(continuum.constraintCount);
  for (let i = 0; i < continuum.constraintCount; i++) {
    const sourceTriangle = records.getUint32(
      i * CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.strideBytes +
        CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.sourceTriangleIndex,
      true,
    );
    if (sourceTriangle >= continuum.constraintCount || visited[sourceTriangle])
      throw new RangeError('The colored continuum source indices must be a permutation.');
    visited[sourceTriangle] = 1;
    const from = sourceTriangle * strideBytes;
    const to = i * strideBytes;
    for (let word = 0; word < strideBytes; word += 4) {
      const base = rawRest.getUint32(from + word, true);
      if (
        result.getUint32(to + word, true) !== base ||
        (word !== occupiedOffset && cutRest.getUint32(from + word, true) !== base)
      )
        throw new RangeError('A cut frame changed the original continuum material rest metric.');
    }
    const occupied = cutRest.getFloat32(from + occupiedOffset, true);
    if (!(occupied > 0 && occupied <= rawRest.getFloat32(from + offsets.restAreaM2, true)))
      throw new RangeError('Occupied source-cut area is outside its original carrier triangle.');
    result.setFloat32(to + occupiedOffset, occupied, true);
  }
  return colorRest;
}

function buildCore(input: Input, signal?: AbortSignal) {
  const { mesh, parameters: p, budgets: b } = input;
  const sourcePositions = input.currentPositionsMInvMass;
  if (
    mesh.seams.length !== 0 ||
    Object.getPrototypeOf(sourcePositions) !== Float32Array.prototype ||
    Object.getPrototypeOf(sourcePositions.buffer) !== ArrayBuffer.prototype ||
    sourcePositions.length !== mesh.restPositions2Mm.length * 2 ||
    !Number.isSafeInteger(p.frameCount) ||
    p.frameCount < 1 ||
    p.frameCount > 32 ||
    !Number.isSafeInteger(p.solverIterations) ||
    p.solverIterations < 1 ||
    p.solverIterations > 64 ||
    p.solverIterations !== input.materialOptions.solverIterations ||
    p.dtS !== input.materialOptions.dtS
  )
    throw new RangeError(
      'The staged cut requires an open carrier, its posed rows and the compiled solver settings.',
    );
  for (const [cap, limit] of [
    [b.maxParticles, 20_000],
    [b.maxTriangles, 40_000],
    [b.maxConstraintCount, 120_000],
    [b.maxGpuBytes, 256 * 1024 * 1024],
    [b.maxDispatches, 1_000_000],
    [b.maxConstraintInvocations, 500_000_000],
    [b.maxWorkgroupsPerDispatch, 65_535],
  ] as const) {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > limit)
      throw new RangeError('The staged cut exceeds the mechanical planner limits.');
  }
  if (mesh.triangles.length > b.maxTriangles * 3)
    throw new RangeError('The staged cut exceeds its triangle budget.');
  const positions = new Float32Array(sourcePositions);
  const structure = compileSimulationPackageV0(mesh, {
    maxParticles: b.maxParticles,
    maxDistanceConstraints: b.maxConstraintCount,
  });
  signal?.throwIfAborted();
  const cut = compileSourceCutCarrierMaterialV1(
    mesh,
    input.grains,
    input.assignments,
    input.materials,
    input.materialOptions,
    input.cutByPiece,
    input.cutTolerances,
  );
  const bendResult = compileBendConstraints(mesh);
  if (!bendResult.ok)
    throw new RangeError(
      bendResult.diagnostics
        .map((entry) => entry.message)
        .slice(0, 8)
        .join(' '),
    );
  const bend = bendResult.constraints;
  if (bend.constraintCount > b.maxConstraintCount)
    throw new RangeError('The staged cut exceeds its bend-row budget.');
  const strain = compileTriangleStrainScheduleV1(cut.base, {
    maxConstraints: b.maxConstraintCount,
  });
  if (!strain.ok)
    throw new RangeError(
      strain.diagnostics
        .map((entry) => entry.message)
        .slice(0, 8)
        .join(' '),
    );
  const continuum = compileContinuumStrainPackageV1(
    cut.base,
    strain.schedule,
    input.continuumMaterials,
  );
  const counts = {
    particles: structure.manifest.particleCount,
    triangles: structure.manifest.triangleCount,
    distance: structure.manifest.distanceConstraintCount,
    bend: bend.constraintCount,
    continuum: continuum.constraintCount,
  };
  const particleRetention = deriveXpbdParticleMaterialRetentionV2(cut.base, mesh.pieceRanges);
  const materials = Array.from({ length: cut.base.manifest.materialCount }, (_, i) =>
    decodeClothMaterialGpuV1(cut.base.materialRecords, i),
  );
  for (const material of materials) {
    const { warp, weft } = material.bendComplianceInvNm;
    const range = material.validSolverRange;
    if (
      warp !== weft ||
      !Number.isFinite(warp) ||
      warp < 0 ||
      warp >= 1e30 ||
      Math.fround(p.dtS) < range.minDtS ||
      Math.fround(p.dtS) > range.maxDtS
    )
      throw new RangeError(
        'Staged cut material must admit the same scalar bend and Float32 timestep.',
      );
  }
  const restPositions = structure.mesh.restPositionsInvMass.slice();
  const absLimit = XPBD_MATERIAL_VELOCITY_ABI_V2.domainAbsPositionLimitM;
  for (let i = 0; i < counts.particles; i++) {
    const offset = i * 4;
    const { massKg, inverseMassKgInv } = decodeParticleMassGpuV1(cut.cutParticleMassRecords, i);
    if (
      !(massKg > 0 && Number.isFinite(massKg)) ||
      !(inverseMassKgInv > 0 && inverseMassKgInv < 1e30) ||
      Math.abs(massKg * inverseMassKgInv - 1) > 4 * 2 ** -23 ||
      !Object.is(positions[offset + 3], inverseMassKgInv)
    )
      throw new RangeError('The posed cut frame must preserve the compiled physical masses.');
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[offset + axis];
      if (!Number.isFinite(value) || Math.abs(value) >= absLimit)
        throw new RangeError('The posed cut exceeds the mechanical position domain.');
    }
    restPositions[offset + 3] = inverseMassKgInv;
  }

  const workgroups = (count: number) =>
    garmentMaterialRunWorkgroupsV1(count, b.maxWorkgroupsPerDispatch);
  const d = structure.constraints.distance;
  const bendLambdas = new Float32Array(counts.bend);
  const runs = buildXpbdMechanicalColorRunsV1({
    counts,
    distance: d,
    bend,
    continuum,
    parameters: p,
    bendLambdas,
    particleMaterialIndices: particleRetention.particleMaterialIndices,
    materials,
    workgroups,
  });
  const predictionFrames = Array.from({ length: p.frameCount }, (_, frame) =>
    encodeXpbdPredictFrameParamsV1({
      dtS: p.dtS,
      particleCount: counts.particles,
      distanceConstraintCount: counts.distance,
      gravityMps2Y: p.gravityMps2Y,
      windAccelerationMps2Z: p.windAccelerationMps2Z,
      simulationSeconds: frame * p.dtS,
      damping: 1,
    }),
  );
  const velocityParams = encodeXpbdMaterialVelocityParamsV2({
    dtS: p.dtS,
    particleCount: counts.particles,
  });
  const resets = (
    [
      ['distance', counts.distance, createXpbdDistanceResetPacketV1],
      ['bend', counts.bend, createXpbdBendResetPacketV1],
      ['continuum', counts.continuum, createXpbdContinuumResetPacketV1],
    ] as const
  ).flatMap(([kind, count, pack]) =>
    count > 0 ? [{ kind, workgroups: workgroups(count), params: pack(count) }] : [],
  );
  const cutContinuumRestFrames = coloredCutContinuumRest(
    cut.base.triangleRestFrames,
    cut.cutTriangleRestFrames,
    continuum,
  );
  const coverage = projectSourceCutHingeCoverageV1(cut, bend);
  const cutBendRest = packXpbdEmbeddedCutBendRestV1(bend.restAnglesRad, coverage);
  const uploads = {
    positions,
    previousPositions: positions.slice(),
    restPositions,
    velocities: new Float32Array(positions.length),
    particleRetention: particleRetention.velocityRetentionPerStep,
    velocityDiagnostics: createXpbdMaterialVelocityDiagnosticsV2(),
    distancePairs: d.vertexPairs,
    distanceRestLengths: d.restLengthsM,
    distanceLambdas: new Float32Array(counts.distance),
    bendQuads: bend.vertexQuads,
    cutBendRest,
    bendLambdas,
    bendDiagnostics: new Uint32Array(XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2 / 4),
    continuumTriangles: continuum.triangleIndices,
    continuumRestFrames: cutContinuumRestFrames,
    continuumMaterialIndices: continuum.materialIndices,
    continuumMaterials: continuum.materialRecords,
    continuumLambdas: continuum.lambdasKgM,
    continuumStatuses: new Uint32Array(counts.continuum).fill(CONTINUUM_STRAIN_VNEXT_STATUS_RESET),
  };
  const allRuns = [...runs.distance, ...runs.bendRuns, ...runs.continuum];
  const uniformPackets = [
    ...predictionFrames,
    velocityParams,
    ...allRuns.map(({ params }) => params),
    ...resets.map(({ params }) => params),
  ];
  const coreGpuBytes = [...Object.values(uploads), ...uniformPackets].reduce(
    (bytes, buffer) => bytes + buffer.byteLength,
    0,
  );
  const dispatchCount = p.frameCount * (2 + resets.length + p.solverIterations * allRuns.length);
  const logicalInvocations =
    p.frameCount * (1 + p.solverIterations) * (counts.distance + counts.bend + counts.continuum);
  const paddedInvocations =
    p.frameCount *
    64 *
    (2 * workgroups(counts.particles) +
      resets.reduce((n, r) => n + r.workgroups, 0) +
      p.solverIterations * allRuns.reduce((n, r) => n + r.workgroups, 0));
  if (
    coreGpuBytes > b.maxGpuBytes ||
    dispatchCount > b.maxDispatches ||
    logicalInvocations > b.maxConstraintInvocations
  )
    throw new RangeError('The staged cut consumes more than the admitted mechanical budget.');
  signal?.throwIfAborted();
  return {
    counts,
    parameters: { ...p },
    cut,
    triangles: mesh.triangles.slice(),
    continuumSource: continuum,
    distance: runs.distance,
    bend: runs.bendRuns,
    continuum: runs.continuum,
    resets,
    uploads,
    uniformPackets,
    predictionFrames,
    velocityParams,
    coreGpuBytes,
    dispatchCount,
    paddedInvocations,
  };
}

/** Prepares open-seam mechanics from the same original compiler, color scheduler and material kernels. */
export function prepareGarmentStagedSourceCutCoreV1(input: Input, signal?: AbortSignal): Handle {
  signal?.throwIfAborted();
  const core = buildCore(input, signal);
  const handle = Object.freeze({
    version: GARMENT_STAGED_SOURCE_CUT_CORE_V1,
    particleCount: core.counts.particles,
    continuumCount: core.counts.continuum,
    bendCount: core.counts.bend,
    coreGpuBytes: core.coreGpuBytes,
    dispatchCount: core.dispatchCount,
    paddedInvocations: core.paddedInvocations,
  });
  owners.set(handle, core);
  carriers.set(handle, {
    mesh: {
      restPositions2Mm: input.mesh.restPositions2Mm.slice(),
      triangles: core.triangles,
      pieceRanges: structuredClone(input.mesh.pieceRanges),
    },
    cuts: new Map([...input.cutByPiece].map(([id, { cut }]) => [id, structuredClone(cut)])),
  });
  return handle;
}

/** Embeds exact material stations on the same owned cut and carrier as the staged mechanics. */
export function prepareGarmentStagedSourceCutSeamsV1(
  material: Handle,
  pairs: readonly StagedPair[],
  budgets: Readonly<{ maxTriangleTests: number; maxSupportBytes: number }>,
  signal?: AbortSignal,
) {
  const carrier = carriers.get(material);
  if (!carrier) throw new TypeError('A prepared staged source-cut plan is required.');
  const { maxTriangleTests, maxSupportBytes } = budgets;
  if (!Number.isSafeInteger(maxTriangleTests) || maxTriangleTests < 1)
    throw new RangeError('Staged seam embedding requires a triangle-test budget.');
  const embeddings = new Map<string, ReturnType<typeof prepareSourceCutSeamEmbeddingV1>>();
  let triangleTests = 0;
  const embed = (station: SeamStation) => {
    signal?.throwIfAborted();
    const { pieceId } = station;
    let embedding = embeddings.get(pieceId);
    if (!embedding) {
      const cut = carrier.cuts.get(pieceId);
      if (!cut) throw new RangeError('A staged seam station names a foreign cut piece.');
      embedding = prepareSourceCutSeamEmbeddingV1(carrier.mesh, pieceId, cut, maxTriangleTests);
      embeddings.set(pieceId, embedding);
    }
    triangleTests += embedding.triangleTests(1);
    if (triangleTests > maxTriangleTests)
      throw new RangeError('The staged seam stations exceed their embedding budget.');
    return embedding.embed([station], signal)[0];
  };
  const embedded = pairs.map(({ operationOrder, seamId, sourcePairIndex, sideA, sideB }) => ({
    operationOrder,
    seamId,
    sourcePairIndex,
    sideA: embed(sideA),
    sideB: embed(sideB),
  }));
  const plan = prepareStagedEmbeddedSeamActivationV1(
    embedded,
    material.particleCount,
    maxSupportBytes,
  );
  seamOwners.set(plan, material);
  return plan;
}

export function assertGarmentStagedSourceCutSeamsV1(material: Handle, seams: SeamPlan) {
  const owner = seamOwners.get(seams);
  if (!owner || owner !== material)
    throw new TypeError('The staged seam plan must be embedded on its owned source-cut carrier.');
}

export function snapshotGarmentStagedSourceCutCoreV1(plan: Handle) {
  const core = owners.get(plan);
  if (!core) throw new TypeError('A prepared staged source-cut plan is required.');
  return structuredClone(core);
}
