/* global GPUShaderModuleDescriptor */

import {
  CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV,
  createContinuumTriangleVNext,
  solveContinuumTriangleXpbdVNext,
  type ContinuumTriangleVNext,
} from '../cpu/triangle-strain-continuum-vnext';
import type { TrianglePositions, Vec2 } from '../cpu/triangle-strain-oracle';

export const CONTINUUM_STRAIN_VNEXT_KERNEL_V1 = 'continuum-strain-vnext-kernel/v1' as const;
export const CONTINUUM_STRAIN_VNEXT_SOURCE_REVISION_V1 =
  'continuum-strain-vnext-kernel-wgsl/1' as const;
export const CONTINUUM_STRAIN_VNEXT_ENTRY_POINT_V1 = 'main' as const;
export const CONTINUUM_STRAIN_VNEXT_SOURCE_SHA256_V1 =
  'ec1717247939d1b50e69b7a0d26ea9c2f3d96dec1033663da6b278ad27aa84fa' as const;
export const CONTINUUM_STRAIN_CUT_SOURCE_REVISION_V1 =
  'continuum-strain-cut-kernel-wgsl/1' as const;
export const CONTINUUM_STRAIN_VNEXT_WORKGROUP_SIZE = 64;
export const CONTINUUM_STRAIN_VNEXT_POSITION_TOLERANCE_M = 1e-5;
export const CONTINUUM_STRAIN_VNEXT_RELATIVE_TOLERANCE = 3e-4;
export const CONTINUUM_STRAIN_VNEXT_LAMBDA_MAX_ULPS = 8;
export const CONTINUUM_STRAIN_VNEXT_LAMBDA_RELATIVE_TOLERANCE = 3e-4;
export const CONTINUUM_STRAIN_VNEXT_EFFECTIVE_MASS_FLOOR_KG_INV =
  CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV;
/** Fill value used only when the standalone status buffer is created or explicitly reset. */
export const CONTINUUM_STRAIN_VNEXT_STATUS_RESET = 0xffffffff;

export const CONTINUUM_STRAIN_VNEXT_ABI = {
  positions: { binding: 0, strideBytes: 16, wgsl: 'array<vec4<f32>>' },
  triangleIndices: { binding: 1, strideBytes: 16, wgsl: 'array<vec4<u32>>' },
  restFrames: { binding: 2, strideBytes: 32, wgsl: 'array<ContinuumRestFrame>' },
  materialIndices: { binding: 3, strideBytes: 4, wgsl: 'array<u32>' },
  materials: {
    binding: 4,
    strideBytes: 16,
    offsets: {
      warpComplianceMPerN: 0,
      weftComplianceMPerN: 4,
      shearComplianceMPerN: 8,
      formulationTag: 12,
    },
    wgsl: 'array<ContinuumMaterial>',
  },
  lambdasKgM: {
    binding: 5,
    strideBytes: 16,
    offsets: { warp: 0, weft: 4, shear: 8, reserved: 12 },
    wgsl: 'array<vec4<f32>>',
  },
  params: {
    binding: 6,
    sizeBytes: 16,
    offsets: { constraintOffset: 0, constraintCount: 4, dtS: 8, padding: 12 },
    wgsl: 'ContinuumParams',
  },
  statuses: { binding: 7, strideBytes: 4, wgsl: 'array<u32>' },
} as const;

export enum ContinuumStrainVNextStatus {
  Ok = 0,
  InvalidInput = 1,
  DegenerateArea = 2,
  InvalidEffectiveMass = 3,
  NonFiniteOutput = 4,
}

const activeRestAreaCheck = /* wgsl */ `
  if (!finiteScalar(frame.activeRestAreaM2) || frame.activeRestAreaM2 <= 0.0
      || frame.activeRestAreaM2 > frame.restAreaM2 || frame.reserved1 != 0u) {
    return;
  }
  let sqrtAreaM = sqrt(frame.activeRestAreaM2);`;

function continuumStrainSource(useActiveRestArea: boolean): string {
  return /* wgsl */ `
const CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV: f32 = 1.0e-12;
struct ContinuumRestFrame {
  inverseDm: vec4<f32>,
  restAreaM2: f32,
  materialIndex: u32,
  ${useActiveRestArea ? 'activeRestAreaM2: f32' : 'reserved0: u32'},
  reserved1: u32,
};
struct ContinuumMaterial {
  complianceMPerN: vec3<f32>,
  formulationTag: u32,
};
struct ContinuumParams {
  constraintOffset: u32,
  constraintCount: u32,
  dtS: f32,
  padding: u32,
};
struct ScalarResult {
  p0: vec3<f32>,
  p1: vec3<f32>,
  p2: vec3<f32>,
  lambdaKgM: f32,
  status: u32,
};
@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> triangleIndices: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read> restFrames: array<ContinuumRestFrame>;
@group(0) @binding(3) var<storage, read> materialIndices: array<u32>;
@group(0) @binding(4) var<storage, read> materials: array<ContinuumMaterial>;
@group(0) @binding(5) var<storage, read_write> lambdasKgM: array<vec4<f32>>;
@group(0) @binding(6) var<uniform> params: ContinuumParams;
@group(0) @binding(7) var<storage, read_write> statuses: array<u32>;
fn finiteScalar(value: f32) -> bool {
  return value == value && abs(value) < 1.0e30;
}
fn finiteVec3(value: vec3<f32>) -> bool {
  return all(value == value) && all(abs(value) < vec3<f32>(1.0e30));
}
fn solveScalar(
  p0: vec3<f32>, p1: vec3<f32>, p2: vec3<f32>,
  inverseMassesKgInv: vec3<f32>, inverseDm: vec4<f32>, sqrtAreaM: f32,
  mode: u32, complianceMPerN: f32, dtS: f32, previousLambdaKgM: f32
) -> ScalarResult {
  let edge1 = p1 - p0;
  let edge2 = p2 - p0;
  let warp = edge1 * inverseDm.x + edge2 * inverseDm.z;
  let weft = edge1 * inverseDm.y + edge2 * inverseDm.w;
  let warpCoefficients = vec3<f32>(
    -(inverseDm.x + inverseDm.z), inverseDm.x, inverseDm.z
  );
  let weftCoefficients = vec3<f32>(
    -(inverseDm.y + inverseDm.w), inverseDm.y, inverseDm.w
  );
  var rawConstraint = dot(warp, weft);
  var gradient0 = weft * warpCoefficients.x + warp * weftCoefficients.x;
  var gradient1 = weft * warpCoefficients.y + warp * weftCoefficients.y;
  var gradient2 = weft * warpCoefficients.z + warp * weftCoefficients.z;
  if (mode == 0u) {
    rawConstraint = 0.5 * (dot(warp, warp) - 1.0);
    gradient0 = warp * warpCoefficients.x;
    gradient1 = warp * warpCoefficients.y;
    gradient2 = warp * warpCoefficients.z;
  } else if (mode == 1u) {
    rawConstraint = 0.5 * (dot(weft, weft) - 1.0);
    gradient0 = weft * weftCoefficients.x;
    gradient1 = weft * weftCoefficients.y;
    gradient2 = weft * weftCoefficients.z;
  }
  let constraintM = sqrtAreaM * rawConstraint;
  gradient0 *= sqrtAreaM;
  gradient1 *= sqrtAreaM;
  gradient2 *= sqrtAreaM;
  let alphaTildeKgInv = complianceMPerN / (dtS * dtS);
  let denominatorKgInv = alphaTildeKgInv
    + inverseMassesKgInv.x * dot(gradient0, gradient0)
    + inverseMassesKgInv.y * dot(gradient1, gradient1)
    + inverseMassesKgInv.z * dot(gradient2, gradient2);
  if (!finiteScalar(constraintM) || !finiteVec3(gradient0) || !finiteVec3(gradient1)
      || !finiteVec3(gradient2) || !finiteScalar(alphaTildeKgInv)
      || !finiteScalar(denominatorKgInv)) {
    return ScalarResult(p0, p1, p2, previousLambdaKgM, 1u);
  }
  if (denominatorKgInv <= CONTINUUM_STRAIN_EFFECTIVE_MASS_FLOOR_KG_INV) {
    return ScalarResult(p0, p1, p2, previousLambdaKgM, 3u);
  }
  let deltaLambdaKgM =
    (-constraintM - alphaTildeKgInv * previousLambdaKgM) / denominatorKgInv;
  let nextLambdaKgM = previousLambdaKgM + deltaLambdaKgM;
  let next0 = p0 + inverseMassesKgInv.x * gradient0 * deltaLambdaKgM;
  let next1 = p1 + inverseMassesKgInv.y * gradient1 * deltaLambdaKgM;
  let next2 = p2 + inverseMassesKgInv.z * gradient2 * deltaLambdaKgM;
  if (!finiteScalar(nextLambdaKgM) || !finiteVec3(next0) || !finiteVec3(next1)
      || !finiteVec3(next2)) {
    return ScalarResult(p0, p1, p2, previousLambdaKgM, 4u);
  }
  return ScalarResult(next0, next1, next2, nextLambdaKgM, 0u);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let localIndex = invocation.x;
  if (localIndex >= params.constraintCount) { return; }
  let constraintIndex = params.constraintOffset + localIndex;
  let previousStatus = statuses[constraintIndex];
  if (previousStatus != 0xffffffffu && previousStatus != 0u) { return; }
  statuses[constraintIndex] = 1u;
  let triangle = triangleIndices[constraintIndex].xyz;
  let frame = restFrames[constraintIndex];
  let materialIndex = materialIndices[constraintIndex];
  if (materialIndex >= arrayLength(&materials) || frame.materialIndex != materialIndex) { return; }
  let material = materials[materialIndex];
  let p0 = positions[triangle.x];
  let p1 = positions[triangle.y];
  let p2 = positions[triangle.z];
  let inverseMassesKgInv = vec3<f32>(p0.w, p1.w, p2.w);
  let previousLambdasKgM = lambdasKgM[constraintIndex];
  if (material.formulationTag != 1u || !finiteScalar(params.dtS) || params.dtS <= 0.0
      || !all(material.complianceMPerN == material.complianceMPerN)
      || any(material.complianceMPerN <= vec3<f32>(0.0))
      || !all(inverseMassesKgInv == inverseMassesKgInv)
      || any(inverseMassesKgInv < vec3<f32>(0.0))
      || !all(previousLambdasKgM == previousLambdasKgM)
      || previousLambdasKgM.w != 0.0 || !all(frame.inverseDm == frame.inverseDm)) { return; }
  if (!finiteScalar(frame.restAreaM2) || frame.restAreaM2 <= 1.0e-12) {
    statuses[constraintIndex] = 2u;
    return;
  }
  let determinantInvM2 = frame.inverseDm.x * frame.inverseDm.w
    - frame.inverseDm.y * frame.inverseDm.z;
  if (!finiteScalar(determinantInvM2) || determinantInvM2 == 0.0) { return; }
  let determinantAreaM2 = 0.5 / abs(determinantInvM2);
  let restAreaScaleM2 = max(frame.restAreaM2, determinantAreaM2);
  let restAreaUlpM2 = bitcast<f32>(bitcast<u32>(restAreaScaleM2) + 1u) - restAreaScaleM2;
  let restAreaToleranceM2 = 8.0 * restAreaUlpM2 + 1.0e-5 * restAreaScaleM2;
  if (!finiteScalar(determinantAreaM2)
      || abs(frame.restAreaM2 - determinantAreaM2) > restAreaToleranceM2) {
    return;
  }
${useActiveRestArea ? activeRestAreaCheck.slice(1) : '  let sqrtAreaM = sqrt(frame.restAreaM2);'}
  let warp = solveScalar(
    p0.xyz, p1.xyz, p2.xyz, inverseMassesKgInv, frame.inverseDm, sqrtAreaM,
    0u, material.complianceMPerN.x, params.dtS, previousLambdasKgM.x
  );
  if (warp.status != 0u) { statuses[constraintIndex] = warp.status; return; }
  let weft = solveScalar(
    warp.p0, warp.p1, warp.p2, inverseMassesKgInv, frame.inverseDm, sqrtAreaM,
    1u, material.complianceMPerN.y, params.dtS, previousLambdasKgM.y
  );
  if (weft.status != 0u) { statuses[constraintIndex] = weft.status; return; }
  let shear = solveScalar(
    weft.p0, weft.p1, weft.p2, inverseMassesKgInv, frame.inverseDm, sqrtAreaM,
    2u, material.complianceMPerN.z, params.dtS, previousLambdasKgM.z
  );
  if (shear.status != 0u) { statuses[constraintIndex] = shear.status; return; }
  positions[triangle.x] = vec4<f32>(shear.p0, p0.w);
  positions[triangle.y] = vec4<f32>(shear.p1, p1.w);
  positions[triangle.z] = vec4<f32>(shear.p2, p2.w);
  lambdasKgM[constraintIndex] = vec4<f32>(
    warp.lambdaKgM, weft.lambdaKgM, shear.lambdaKgM, 0.0
  );
  statuses[constraintIndex] = 0u;
}`;
}

export const CONTINUUM_STRAIN_VNEXT_WGSL = continuumStrainSource(false);
export const CONTINUUM_STRAIN_CUT_WGSL_V1 = continuumStrainSource(true);
export const CONTINUUM_STRAIN_CUT_SOURCE_SHA256_V1 =
  '0c3736a622976dc0a030bf925fa5563944fa90724a4af0500cefcfdd7b9e8bfb' as const;

export type ContinuumStrainVNextParityPack = {
  readonly caseNames: readonly string[];
  readonly caseCount: number;
  readonly dtS: number;
  readonly positions: Float32Array;
  readonly triangleIndices: Uint32Array;
  readonly restFrames: ArrayBuffer;
  readonly materialIndices: Uint32Array;
  readonly materials: ArrayBuffer;
  readonly lambdasKgM: Float32Array;
  readonly statuses: Uint32Array;
  readonly params: ArrayBuffer;
  readonly expectedPositions: Float32Array;
  readonly expectedLambdasKgM: Float32Array;
  readonly expectedStatuses: Uint32Array;
  readonly inputBytes: number;
  readonly readbackBytes: number;
};

export type ContinuumStrainVNextObservation = {
  readonly positions: Float32Array;
  readonly lambdasKgM: Float32Array;
  readonly statuses: Uint32Array;
};

export type ContinuumStrainVNextParityEvaluation = {
  readonly pass: boolean;
  readonly maxPositionErrorM: number;
  readonly maxLambdaErrorKgM: number;
  readonly failures: readonly string[];
};

type CorpusCase = {
  readonly name: string;
  readonly rest: readonly [Vec2, Vec2, Vec2];
  readonly positions: TrianglePositions;
  readonly inverseMassesKgInv: readonly [number, number, number];
  readonly complianceMPerN: readonly [number, number, number];
  readonly lambdasKgM: readonly [number, number, number];
  readonly degenerateArea?: boolean;
  readonly zeroCompliance?: boolean;
  /** Feed one solved, f32-quantized step back as input before generating the expected step. */
  readonly preAccumulatedStep?: boolean;
};

function f32(value: number): number {
  return Math.fround(value);
}

function positiveF32Ulp(value: number): number {
  const rounded = f32(Math.abs(value));
  if (rounded === 0) return 2 ** -149;
  if (!Number.isFinite(rounded)) return Number.POSITIVE_INFINITY;
  const storage = new ArrayBuffer(4);
  const view = new DataView(storage);
  view.setFloat32(0, rounded, true);
  view.setUint32(0, view.getUint32(0, true) + 1, true);
  return view.getFloat32(0, true) - rounded;
}

/** f32-scale lambda tolerance: eight adjacent representable values or 3e-4 relative, whichever is larger. */
export function continuumStrainVNextLambdaToleranceKgM(expectedKgM: number): number {
  return Math.max(
    CONTINUUM_STRAIN_VNEXT_LAMBDA_MAX_ULPS * positiveF32Ulp(expectedKgM),
    CONTINUUM_STRAIN_VNEXT_LAMBDA_RELATIVE_TOLERANCE * Math.abs(expectedKgM),
  );
}

function corpusCase(
  name: string,
  scaleM: number,
  transform: (point: Vec2) => Vec2,
  options: Partial<Pick<CorpusCase, 'inverseMassesKgInv' | 'complianceMPerN' | 'lambdasKgM'>> = {},
): CorpusCase {
  const rest = [
    [0, 0],
    [scaleM, 0],
    [0, scaleM * 0.75],
  ] as const;
  const areaM2 = 0.5 * scaleM * scaleM * 0.75;
  const inverseMass = 1 / ((areaM2 * 0.2) / 3);
  return {
    name,
    rest,
    positions: rest.map((point) => [...transform(point), 0]) as unknown as TrianglePositions,
    inverseMassesKgInv: options.inverseMassesKgInv ?? [inverseMass, inverseMass, inverseMass],
    complianceMPerN: options.complianceMPerN ?? [8e-11, 1.2e-10, 5e-10],
    lambdasKgM: options.lambdasKgM ?? [1e-7, -2e-7, 3e-7],
  };
}

function corpus(): readonly CorpusCase[] {
  const affine = ([x, y]: Vec2): Vec2 => [1.06 * x + 0.08 * y, 0.94 * y];
  return [
    corpusCase('coarse-equivalent', 0.04, affine),
    corpusCase('refined-equivalent', 0.02, affine),
    corpusCase('warp-anisotropic', 0.03, ([x, y]) => [1.12 * x, y], {
      complianceMPerN: [5e-11, 3e-10, 8e-10],
    }),
    corpusCase('weft-anisotropic', 0.03, ([x, y]) => [x, 0.88 * y], {
      complianceMPerN: [4e-10, 6e-11, 8e-10],
    }),
    corpusCase('shear-anisotropic', 0.03, ([x, y]) => [x + 0.2 * y, y], {
      complianceMPerN: [4e-10, 4e-10, 7e-11],
    }),
    corpusCase('pinned-first-vertex', 0.025, affine, {
      inverseMassesKgInv: [0, 180_000, 240_000],
    }),
    {
      ...corpusCase('two-step-accumulated-lambda', 0.035, affine, {
        lambdasKgM: [4e-7, -3e-7, 2e-7],
      }),
      preAccumulatedStep: true,
    },
    {
      ...corpusCase('zero-compliance-unsupported', 0.03, affine, {
        complianceMPerN: [0, 1e-10, 1e-10],
      }),
      zeroCompliance: true,
    },
    {
      ...corpusCase('degenerate-area', 0.02, affine),
      degenerateArea: true,
    },
  ];
}

function quantizedTriangle(selected: CorpusCase): ContinuumTriangleVNext {
  const triangle = createContinuumTriangleVNext(selected.rest, [1, 0]);
  return {
    restAreaM2: f32(triangle.restAreaM2),
    restFrame: {
      inverseRestMatrixInvM: triangle.restFrame.inverseRestMatrixInvM.map(f32) as [
        number,
        number,
        number,
        number,
      ],
      restAreaM2: f32(triangle.restAreaM2),
      warpDirectionRest: triangle.restFrame.warpDirectionRest.map(f32) as [number, number],
      weftDirectionRest: triangle.restFrame.weftDirectionRest.map(f32) as [number, number],
    },
  };
}

function solveCpuStep(
  positions: TrianglePositions,
  triangle: ContinuumTriangleVNext,
  selected: CorpusCase,
  lambdas: [number, number, number],
  dtS: number,
): { positions: TrianglePositions; lambdas: [number, number, number] } {
  let nextPositions = positions;
  const nextLambdas = [...lambdas] as [number, number, number];
  (['warp', 'weft', 'shear'] as const).forEach((mode, modeIndex) => {
    const result = solveContinuumTriangleXpbdVNext(nextPositions, triangle, {
      mode,
      inverseMassesKgInv: selected.inverseMassesKgInv.map(f32) as [number, number, number],
      dtS,
      complianceMPerN: f32(selected.complianceMPerN[modeIndex]),
      lambdaKgM: nextLambdas[modeIndex],
    });
    nextPositions = result.positions.map((position) =>
      position.map(f32),
    ) as unknown as TrianglePositions;
    nextLambdas[modeIndex] = f32(result.lambdaKgM);
  });
  return { positions: nextPositions, lambdas: nextLambdas };
}

export function continuumStrainVNextReadbackLayout(caseCount: number) {
  if (!Number.isSafeInteger(caseCount) || caseCount < 1) {
    throw new RangeError('caseCount must be a positive safe integer.');
  }
  const positionBytes = caseCount * 3 * 16;
  const lambdaBytes = caseCount * 16;
  const statusBytes = caseCount * 4;
  return {
    positionOffset: 0,
    positionBytes,
    lambdaOffset: positionBytes,
    lambdaBytes,
    statusOffset: positionBytes + lambdaBytes,
    statusBytes,
    totalBytes: positionBytes + lambdaBytes + statusBytes,
  } as const;
}

export function createContinuumStrainVNextParityPack(): ContinuumStrainVNextParityPack {
  const cases = corpus();
  const caseCount = cases.length;
  const dtS = f32(1 / 120);
  const positions = new Float32Array(caseCount * 12);
  const triangleIndices = new Uint32Array(caseCount * 4);
  const restFrames = new ArrayBuffer(caseCount * 32);
  const materialIndices = new Uint32Array(caseCount);
  const materials = new ArrayBuffer(caseCount * 16);
  const lambdasKgM = new Float32Array(caseCount * 4);
  const statuses = new Uint32Array(caseCount).fill(CONTINUUM_STRAIN_VNEXT_STATUS_RESET);
  const expectedPositions = new Float32Array(caseCount * 12);
  const expectedLambdasKgM = new Float32Array(caseCount * 4);
  const expectedStatuses = new Uint32Array(caseCount);
  const frameView = new DataView(restFrames);
  const materialView = new DataView(materials);

  cases.forEach((selected, caseIndex) => {
    const triangle = quantizedTriangle(selected);
    const inverse = triangle.restFrame.inverseRestMatrixInvM;
    const frameBase = caseIndex * 32;
    inverse.forEach((value, index) => frameView.setFloat32(frameBase + index * 4, value, true));
    frameView.setFloat32(
      frameBase + 16,
      selected.degenerateArea ? f32(5e-13) : triangle.restAreaM2,
      true,
    );
    frameView.setUint32(frameBase + 20, caseIndex, true);
    const materialBase = caseIndex * 16;
    selected.complianceMPerN.forEach((value, index) =>
      materialView.setFloat32(materialBase + index * 4, value, true),
    );
    materialView.setUint32(materialBase + 12, 1, true);
    materialIndices[caseIndex] = caseIndex;
    triangleIndices.set([caseIndex * 3, caseIndex * 3 + 1, caseIndex * 3 + 2, 0], caseIndex * 4);
    const quantizedPositions = selected.positions.map((position, vertex) => [
      f32(position[0]),
      f32(position[1]),
      f32(position[2]),
      f32(selected.inverseMassesKgInv[vertex]),
    ]);
    quantizedPositions.forEach((position, vertex) =>
      positions.set(position, caseIndex * 12 + vertex * 4),
    );
    let cpuPositions = quantizedPositions.map((position) =>
      position.slice(0, 3),
    ) as unknown as TrianglePositions;
    let nextLambdas = selected.lambdasKgM.map(f32) as [number, number, number];
    if (selected.preAccumulatedStep) {
      const accumulated = solveCpuStep(cpuPositions, triangle, selected, nextLambdas, dtS);
      cpuPositions = accumulated.positions;
      nextLambdas = accumulated.lambdas;
      cpuPositions.forEach((position, vertex) => {
        const base = caseIndex * 12 + vertex * 4;
        positions[base] = position[0];
        positions[base + 1] = position[1];
        positions[base + 2] = position[2];
      });
    }
    nextLambdas.forEach((value, index) => (lambdasKgM[caseIndex * 4 + index] = value));
    expectedPositions.set(positions.subarray(caseIndex * 12, caseIndex * 12 + 12), caseIndex * 12);
    expectedLambdasKgM.set(lambdasKgM.subarray(caseIndex * 4, caseIndex * 4 + 4), caseIndex * 4);
    if (selected.degenerateArea) {
      expectedStatuses[caseIndex] = ContinuumStrainVNextStatus.DegenerateArea;
      return;
    }
    if (selected.zeroCompliance) {
      expectedStatuses[caseIndex] = ContinuumStrainVNextStatus.InvalidInput;
      return;
    }
    ({ positions: cpuPositions, lambdas: nextLambdas } = solveCpuStep(
      cpuPositions,
      triangle,
      selected,
      nextLambdas,
      dtS,
    ));
    cpuPositions.forEach((position, vertex) => {
      const base = caseIndex * 12 + vertex * 4;
      expectedPositions[base] = f32(position[0]);
      expectedPositions[base + 1] = f32(position[1]);
      expectedPositions[base + 2] = f32(position[2]);
    });
    expectedLambdasKgM.set(nextLambdas, caseIndex * 4);
    expectedStatuses[caseIndex] = ContinuumStrainVNextStatus.Ok;
  });

  const params = new ArrayBuffer(16);
  const paramsView = new DataView(params);
  paramsView.setUint32(4, caseCount, true);
  paramsView.setFloat32(8, dtS, true);
  const readbackBytes = continuumStrainVNextReadbackLayout(caseCount).totalBytes;
  const inputBytes =
    positions.byteLength +
    triangleIndices.byteLength +
    restFrames.byteLength +
    materialIndices.byteLength +
    materials.byteLength +
    lambdasKgM.byteLength +
    statuses.byteLength +
    params.byteLength;
  return {
    caseNames: cases.map(({ name }) => name),
    caseCount,
    dtS,
    positions,
    triangleIndices,
    restFrames,
    materialIndices,
    materials,
    lambdasKgM,
    statuses,
    params,
    expectedPositions,
    expectedLambdasKgM,
    expectedStatuses,
    inputBytes,
    readbackBytes,
  };
}

export function encodeContinuumStrainVNextExpectedReadback(
  pack: ContinuumStrainVNextParityPack,
): ArrayBuffer {
  const layout = continuumStrainVNextReadbackLayout(pack.caseCount);
  const output = new ArrayBuffer(layout.totalBytes);
  new Float32Array(output, layout.positionOffset, pack.expectedPositions.length).set(
    pack.expectedPositions,
  );
  new Float32Array(output, layout.lambdaOffset, pack.expectedLambdasKgM.length).set(
    pack.expectedLambdasKgM,
  );
  new Uint32Array(output, layout.statusOffset, pack.expectedStatuses.length).set(
    pack.expectedStatuses,
  );
  return output;
}

export function decodeContinuumStrainVNextReadback(
  buffer: ArrayBuffer,
  caseCount: number,
): ContinuumStrainVNextObservation {
  const layout = continuumStrainVNextReadbackLayout(caseCount);
  if (buffer.byteLength !== layout.totalBytes) {
    throw new RangeError(
      `Continuum strain vNext readback must be exactly ${layout.totalBytes} bytes.`,
    );
  }
  return {
    positions: new Float32Array(buffer.slice(layout.positionOffset, layout.lambdaOffset)),
    lambdasKgM: new Float32Array(buffer.slice(layout.lambdaOffset, layout.statusOffset)),
    statuses: new Uint32Array(buffer.slice(layout.statusOffset)),
  };
}

function tolerance(expected: number, absolute: number): number {
  return absolute + CONTINUUM_STRAIN_VNEXT_RELATIVE_TOLERANCE * Math.abs(expected);
}

export function evaluateContinuumStrainVNextParity(
  observation: ContinuumStrainVNextObservation,
  pack: ContinuumStrainVNextParityPack,
): ContinuumStrainVNextParityEvaluation {
  const failures: string[] = [];
  if (
    observation.positions.length !== pack.expectedPositions.length ||
    observation.lambdasKgM.length !== pack.expectedLambdasKgM.length ||
    observation.statuses.length !== pack.expectedStatuses.length
  ) {
    return {
      pass: false,
      maxPositionErrorM: Number.POSITIVE_INFINITY,
      maxLambdaErrorKgM: Number.POSITIVE_INFINITY,
      failures: ['Continuum strain vNext observation shape is invalid.'],
    };
  }
  let maxPositionErrorM = 0;
  observation.positions.forEach((observed, index) => {
    const expected = pack.expectedPositions[index];
    const error = Math.abs(observed - expected);
    if (index % 4 === 3) {
      if (observed !== expected) failures.push(`Inverse mass changed at position lane ${index}.`);
      return;
    }
    maxPositionErrorM = Math.max(maxPositionErrorM, error);
    if (
      !Number.isFinite(observed) ||
      error > tolerance(expected, CONTINUUM_STRAIN_VNEXT_POSITION_TOLERANCE_M)
    ) {
      failures.push(`Position exceeded tolerance at lane ${index}.`);
    }
  });
  let maxLambdaErrorKgM = 0;
  observation.lambdasKgM.forEach((observed, index) => {
    const expected = pack.expectedLambdasKgM[index];
    const error = Math.abs(observed - expected);
    maxLambdaErrorKgM = Math.max(maxLambdaErrorKgM, error);
    if (index % 4 === 3 && observed !== 0)
      failures.push(`Reserved lambda lane is non-zero at ${index}.`);
    if (!Number.isFinite(observed) || error > continuumStrainVNextLambdaToleranceKgM(expected)) {
      failures.push(`Lambda exceeded tolerance at lane ${index}.`);
    }
  });
  observation.statuses.forEach((observed, index) => {
    if (observed !== pack.expectedStatuses[index]) {
      failures.push(`Status mismatch for ${pack.caseNames[index]}.`);
    }
  });
  return { pass: failures.length === 0, maxPositionErrorM, maxLambdaErrorKgM, failures };
}

export function continuumStrainVNextShaderFingerprint(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function sourceSha256Hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashContinuumStrainVNextSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle)
    throw new Error('Continuum strain vNext V1 identity requires Web Crypto SHA-256.');
  const encoded = new TextEncoder().encode(source);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return sourceSha256Hex(new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer)));
}

export async function verifyContinuumStrainVNextSourceV1(
  source: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashContinuumStrainVNextSourceV1(source, options);
  if (sha256 !== CONTINUUM_STRAIN_VNEXT_SOURCE_SHA256_V1)
    throw new Error('Continuum strain vNext V1 source differs from its pinned identity.');
  return Object.freeze({
    version: CONTINUUM_STRAIN_VNEXT_KERNEL_V1,
    sourceRevision: CONTINUUM_STRAIN_VNEXT_SOURCE_REVISION_V1,
    sha256,
    entryPoint: CONTINUUM_STRAIN_VNEXT_ENTRY_POINT_V1,
  });
}

export function getContinuumStrainVNextPipelineIdentityV1(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  return verifyContinuumStrainVNextSourceV1(CONTINUUM_STRAIN_VNEXT_WGSL, options);
}

export function continuumStrainVNextShaderDescriptorV1(): GPUShaderModuleDescriptor {
  return { label: 'continuum strain vNext V1', code: CONTINUUM_STRAIN_VNEXT_WGSL };
}

function ownedGpuWriteBytes(bytes: ArrayBufferView | ArrayBuffer): Uint8Array<ArrayBuffer> {
  const source =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const owned = new Uint8Array(source.byteLength);
  owned.set(source);
  return owned;
}

function gpuBuffer(
  device: GPUDevice,
  label: string,
  bytes: ArrayBufferView | ArrayBuffer,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const size = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.byteLength;
  const buffer = device.createBuffer({ label, size, usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, ownedGpuWriteBytes(bytes));
  return buffer;
}

/** Browser-only isolated runner. It performs one dispatch and returns only the bounded parity packet. */
export async function runContinuumStrainVNextParityGpu(
  device: GPUDevice,
  pack: ContinuumStrainVNextParityPack,
  productionPipeline?: GPUComputePipeline,
): Promise<ArrayBuffer> {
  const buffers: GPUBuffer[] = [];
  let readback: GPUBuffer | undefined;
  let readbackMapped = false;
  let validationScopeOpen = false;
  device.pushErrorScope('validation');
  validationScopeOpen = true;
  try {
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const readOnly = GPUBufferUsage.STORAGE;
    buffers.push(gpuBuffer(device, 'continuum parity positions', pack.positions, storage));
    buffers.push(gpuBuffer(device, 'continuum parity triangles', pack.triangleIndices, readOnly));
    buffers.push(gpuBuffer(device, 'continuum parity frames', pack.restFrames, readOnly));
    buffers.push(
      gpuBuffer(device, 'continuum parity material indices', pack.materialIndices, readOnly),
    );
    buffers.push(gpuBuffer(device, 'continuum parity materials', pack.materials, readOnly));
    buffers.push(gpuBuffer(device, 'continuum parity lambdas', pack.lambdasKgM, storage));
    buffers.push(gpuBuffer(device, 'continuum parity params', pack.params, GPUBufferUsage.UNIFORM));
    buffers.push(gpuBuffer(device, 'continuum parity statuses', pack.statuses, storage));
    const pipeline =
      productionPipeline ??
      (await device.createComputePipelineAsync({
        label: 'continuum strain vNext parity pipeline',
        layout: 'auto',
        compute: {
          module: device.createShaderModule({
            label: 'continuum strain vNext parity shader',
            code: CONTINUUM_STRAIN_VNEXT_WGSL,
          }),
          entryPoint: 'main',
        },
      }));
    const bindGroup = device.createBindGroup({
      label: 'continuum strain vNext parity bindings',
      layout: pipeline.getBindGroupLayout(0),
      entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const layout = continuumStrainVNextReadbackLayout(pack.caseCount);
    readback = device.createBuffer({
      label: 'continuum strain vNext bounded readback',
      size: layout.totalBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder({ label: 'continuum strain vNext parity encoder' });
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(pack.caseCount / CONTINUUM_STRAIN_VNEXT_WORKGROUP_SIZE));
    pass.end();
    encoder.copyBufferToBuffer(
      buffers[0],
      0,
      readback,
      layout.positionOffset,
      layout.positionBytes,
    );
    encoder.copyBufferToBuffer(buffers[5], 0, readback, layout.lambdaOffset, layout.lambdaBytes);
    encoder.copyBufferToBuffer(buffers[7], 0, readback, layout.statusOffset, layout.statusBytes);
    device.queue.submit([encoder.finish()]);
    await Promise.race([
      readback.mapAsync(GPUMapMode.READ),
      device.lost.then((info) => {
        throw new Error('Continuum strain parity device lost: ' + info.message);
      }),
    ]);
    readbackMapped = true;
    const result = readback.getMappedRange().slice(0);
    validationScopeOpen = false;
    const validationError = await device.popErrorScope();
    if (validationError !== null) {
      throw new Error('Continuum strain parity validation failed: ' + validationError.message);
    }
    return result;
  } finally {
    if (validationScopeOpen) {
      validationScopeOpen = false;
      try {
        await device.popErrorScope();
      } catch {
        // Preserve the primary failure; the scope was still popped exactly once.
      }
    }
    if (readbackMapped && readback !== undefined) readback.unmap();
    readback?.destroy();
    buffers.forEach((buffer) => buffer.destroy());
  }
}
/* global GPUBuffer, GPUBufferUsage, GPUBufferUsageFlags, GPUComputePipeline, GPUDevice, GPUMapMode */
