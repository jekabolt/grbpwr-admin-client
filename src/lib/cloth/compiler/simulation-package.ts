import {
  CLOTH_MESH_IR_VERSION,
  type ClothMeshIR,
  validateClothMeshIR,
} from '../mesh/cloth-mesh-ir';
import type { MaterialAssignment } from '../domain/garment-assembly-ir';
import type { ClothMaterialV1 } from '../material/cloth-material-v1';
import {
  CLOTH_MATERIAL_GPU_V1,
  MATERIAL_PACKAGE_VERSION,
  PARTICLE_MASS_GPU_V1,
  TRIANGLE_INDICES_GPU_V1,
  TRIANGLE_MATERIAL_INDEX_GPU_V1,
  TRIANGLE_REST_FRAME_GPU_V1,
  compileMaterialPackageV1,
  type CompiledMaterialPackageV1,
  type CompileMaterialPackageOptions,
  type MaterialPieceGrain,
} from './material-package';
import { compileBendConstraints, type CompiledBendConstraints } from './bend-constraints';
import {
  compileSeamConstraints,
  evaluateAllAtOnceSeamPreactivationV1,
  type CompiledSeamConstraints,
} from './seam-constraints';
import {
  TRIANGLE_STRAIN_SCHEDULE_VERSION,
  compileTriangleStrainScheduleV1,
  triangleStrainScheduleBufferBytes,
  validateTriangleStrainScheduleV1,
  type CompiledTriangleStrainScheduleV1,
} from './triangle-strain-schedule';
import {
  DEFAULT_UNATTACHED_SUPPORT_POLICY_V1,
  SUPPORT_ATTACHMENT_POLICY_V1_VERSION,
  compileSupportAttachmentsV1,
  type CompiledSupportAttachmentsV1,
  type SupportAttachmentPolicyV1,
} from './support-attachment-policy';

export {
  DEFAULT_UNATTACHED_SUPPORT_POLICY_V1,
  SUPPORT_ATTACHMENT_POLICY_V1_VERSION,
  compileSupportAttachmentsV1,
  type CompiledSupportAttachmentsV1,
  type SupportAttachmentPolicyV1,
} from './support-attachment-policy';

export const SIMULATION_PACKAGE_VERSION = '0.0.1-experimental' as const;
export const SIMULATION_PACKAGE_V1_VERSION = '0.0.2-experimental' as const;
export const SIMULATION_PACKAGE_V2_VERSION = '0.0.3-experimental' as const;
export const SIMULATION_PACKAGE_V3_VERSION = '0.0.4-experimental' as const;
export const SIMULATION_PACKAGE_V4_VERSION = '0.0.5-experimental' as const;
export const SIMULATION_PACKAGE_V5_VERSION = '0.0.6-experimental' as const;

export const CONTINUUM_STRAIN_PACKAGE_V1_VERSION = 'continuum-strain-package/v1' as const;
export const CONTINUUM_STRAIN_FORMULATION_TAG_V1 = 1 as const;
export const CONTINUUM_STRAIN_MIN_REST_AREA_M2 = 1e-12;
export const CONTINUUM_STRAIN_REST_AREA_RELATIVE_TOLERANCE = 1e-5;
export const CONTINUUM_STRAIN_REST_AREA_MAX_ULPS = 8;

export const CONTINUUM_STRAIN_CONSTRAINT_GPU_V1 = {
  version: 1,
  strideBytes: 16,
  offsets: {
    sourceTriangleIndex: 0,
    renderTriangleIndex: 4,
    materialIndex: 8,
    reserved: 12,
  },
} as const;

export const CONTINUUM_STRAIN_MATERIAL_GPU_V1 = {
  version: 1,
  strideBytes: 16,
  offsets: {
    warpComplianceMPerN: 0,
    weftComplianceMPerN: 4,
    shearComplianceMPerN: 8,
    formulationTag: 12,
  },
} as const;

export const CONTINUUM_STRAIN_LAMBDA_GPU_V1 = {
  version: 1,
  strideBytes: 16,
  offsets: { warpLambdaKgM: 0, weftLambdaKgM: 4, shearLambdaKgM: 8, reserved: 12 },
} as const;

export type ConstraintColorRange = {
  readonly color: number;
  readonly offset: number;
  readonly count: number;
};

export type SimulationPackageV0 = {
  readonly manifest: {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_VERSION;
    readonly sourceAssemblyFingerprint: string;
    readonly sourceMeshVersion: typeof CLOTH_MESH_IR_VERSION;
    readonly solverModel: 'xpbd-distance-v0';
    readonly units: 'm';
    readonly particleCount: number;
    readonly triangleCount: number;
    readonly distanceConstraintCount: number;
    readonly distanceColorCount: number;
    readonly pinnedParticleCount: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: {
      readonly maxParticles: number;
      readonly maxDistanceConstraints: number;
    };
  };
  readonly restBoundsM: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  };
  readonly mesh: {
    /** Consecutive [x, y, z, inverseMass] values in physical metres. */
    readonly restPositionsInvMass: Float32Array;
    readonly triangles: Uint32Array;
    /** Compiler-owned support metadata; no GPU upload or runtime ownership is implied. */
    readonly supportAttachments: CompiledSupportAttachmentsV1;
  };
  readonly constraints: {
    readonly distance: {
      /** Consecutive [vertexA, vertexB] pairs, grouped by graph color. */
      readonly vertexPairs: Uint32Array;
      readonly restLengthsM: Float32Array;
      readonly colorRanges: readonly ConstraintColorRange[];
    };
  };
};

export type CompileSimulationPackageOptions = {
  readonly maxParticles?: number;
  readonly maxDistanceConstraints?: number;
  /** Omission is the explicit production-safe `none` policy, never legacy point pins. */
  readonly supportAttachmentPolicy?: SupportAttachmentPolicyV1;
};

export type SimulationPackageV1 = {
  readonly manifest: {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_V1_VERSION;
    readonly sourceAssemblyFingerprint: string;
    readonly sourceMeshVersion: typeof CLOTH_MESH_IR_VERSION;
    readonly solverModel: 'xpbd-distance-seam-v1';
    readonly units: 'm';
    readonly particleCount: number;
    readonly triangleCount: number;
    readonly distanceConstraintCount: number;
    readonly distanceColorCount: number;
    readonly seamConstraintCount: number;
    readonly seamColorCount: number;
    readonly pinnedParticleCount: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: {
      readonly maxParticles: number;
      readonly maxDistanceConstraints: number;
      readonly maxSeamConstraints: number;
    };
  };
  readonly restBoundsM: SimulationPackageV0['restBoundsM'];
  readonly mesh: SimulationPackageV0['mesh'];
  readonly constraints: {
    readonly distance: SimulationPackageV0['constraints']['distance'];
    readonly seam: CompiledSeamConstraints;
  };
};

export type CompileSimulationPackageV1Options = CompileSimulationPackageOptions & {
  readonly maxSeamConstraints?: number;
};

export type SimulationPackageV2 = {
  readonly manifest: {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_V2_VERSION;
    readonly sourceAssemblyFingerprint: string;
    readonly sourceMeshVersion: typeof CLOTH_MESH_IR_VERSION;
    readonly solverModel: 'xpbd-distance-seam-material-v2';
    readonly units: 'm';
    readonly particleCount: number;
    readonly triangleCount: number;
    readonly distanceConstraintCount: number;
    readonly distanceColorCount: number;
    readonly seamConstraintCount: number;
    readonly seamColorCount: number;
    readonly pinnedParticleCount: number;
    readonly materialPackageVersion: typeof MATERIAL_PACKAGE_VERSION;
    readonly materialCount: number;
    readonly totalMassKg: number;
    readonly materialBufferBytes: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: {
      readonly maxParticles: number;
      readonly maxDistanceConstraints: number;
      readonly maxSeamConstraints: number;
      readonly maxMaterials: number;
      readonly maxMaterialBufferBytes: number;
    };
  };
  readonly restBoundsM: SimulationPackageV1['restBoundsM'];
  readonly mesh: SimulationPackageV1['mesh'];
  readonly constraints: SimulationPackageV1['constraints'];
  readonly material: CompiledMaterialPackageV1;
};

export type CompileSimulationPackageV2Options = CompileSimulationPackageV1Options & {
  readonly materialAssignments: readonly MaterialAssignment[];
  readonly pieceGrains: readonly MaterialPieceGrain[];
  readonly materials: readonly ClothMaterialV1[];
  readonly materialSolver: CompileMaterialPackageOptions;
  readonly maxMaterials?: number;
  readonly maxMaterialBufferBytes?: number;
};

export type SimulationPackageV3 = {
  readonly manifest: {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_V3_VERSION;
    readonly sourceAssemblyFingerprint: string;
    readonly sourceMeshVersion: typeof CLOTH_MESH_IR_VERSION;
    readonly solverModel: 'xpbd-distance-seam-material-bend-v3';
    readonly bendConstraintModel: CompiledBendConstraints['model'];
    readonly units: 'm';
    readonly particleCount: number;
    readonly triangleCount: number;
    readonly distanceConstraintCount: number;
    readonly distanceColorCount: number;
    readonly seamConstraintCount: number;
    readonly seamColorCount: number;
    readonly bendConstraintCount: number;
    readonly bendColorCount: number;
    readonly pinnedParticleCount: number;
    readonly materialPackageVersion: typeof MATERIAL_PACKAGE_VERSION;
    readonly materialCount: number;
    readonly totalMassKg: number;
    readonly materialBufferBytes: number;
    readonly bendBufferBytes: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: {
      readonly maxParticles: number;
      readonly maxDistanceConstraints: number;
      readonly maxSeamConstraints: number;
      readonly maxMaterials: number;
      readonly maxMaterialBufferBytes: number;
      readonly maxBendConstraints: number;
      readonly maxBendBufferBytes: number;
    };
  };
  readonly restBoundsM: SimulationPackageV2['restBoundsM'];
  readonly mesh: SimulationPackageV2['mesh'];
  readonly constraints: SimulationPackageV2['constraints'] & {
    readonly bend: CompiledBendConstraints;
  };
  readonly material: CompiledMaterialPackageV1;
};

export type CompileSimulationPackageV3Options = CompileSimulationPackageV2Options & {
  readonly maxBendConstraints?: number;
  readonly maxBendBufferBytes?: number;
};

export type SimulationPackageV4 = {
  readonly manifest: Omit<
    SimulationPackageV3['manifest'],
    'schemaVersion' | 'solverModel' | 'estimatedRuntimeBytes' | 'budgets'
  > & {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_V4_VERSION;
    readonly solverModel: 'xpbd-distance-seam-material-bend-strain-v4';
    readonly strainScheduleVersion: typeof TRIANGLE_STRAIN_SCHEDULE_VERSION;
    readonly strainConstraintCount: number;
    readonly strainColorCount: number;
    readonly materialRecordBytes: number;
    readonly particleMassBytes: number;
    readonly strainScheduleBufferBytes: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: SimulationPackageV3['manifest']['budgets'] & {
      readonly maxStrainConstraints: number;
      readonly maxStrainColors: number;
      readonly maxStrainScheduleBufferBytes: number;
    };
  };
  readonly restBoundsM: SimulationPackageV3['restBoundsM'];
  readonly mesh: SimulationPackageV3['mesh'];
  readonly constraints: SimulationPackageV3['constraints'] & {
    readonly strain: CompiledTriangleStrainScheduleV1;
  };
  readonly material: CompiledMaterialPackageV1;
};

export type CompileSimulationPackageV4Options = CompileSimulationPackageV3Options & {
  readonly maxStrainConstraints?: number;
  readonly maxStrainColors?: number;
  readonly maxStrainScheduleBufferBytes?: number;
};

export type ContinuumStrainMaterialInputV1 = {
  readonly materialId: string;
  readonly materialRevision: string;
  /** Strictly positive area-integrated membrane compliance in SI m/N. */
  readonly complianceMPerN: {
    readonly warp: number;
    readonly weft: number;
    readonly shear: number;
  };
  readonly provenance: {
    readonly calibrationStatus: 'measured' | 'estimated' | 'uncalibrated-visual';
    readonly sourceId: string;
  };
};

export type CompiledContinuumStrainPackageV1 = {
  readonly version: typeof CONTINUUM_STRAIN_PACKAGE_V1_VERSION;
  readonly model: 'xpbd-sqrt-rest-area-green-strain-v1';
  readonly constraintCount: number;
  readonly colorCount: number;
  readonly materialCount: number;
  /** Exact lexical id@revision keys in GPU material-record order. */
  readonly materialKeys: readonly string[];
  readonly materialProvenance: readonly ContinuumStrainMaterialInputV1['provenance'][];
  readonly bufferBytes: number;
  /** Padded [v0, v1, v2, reserved] u32 records in V4 color order. */
  readonly triangleIndices: ArrayBuffer;
  /** Existing 32-byte inverse-Dm/rest-area records copied without reinterpretation. */
  readonly triangleRestFrames: ArrayBuffer;
  /** 16-byte source/render/material provenance records; WGSL still uses the dense ABI below. */
  readonly constraintRecords: ArrayBuffer;
  /** Dense schedule-ordered u32 indices matching the proven WGSL array<u32> ABI. */
  readonly materialIndices: Uint32Array;
  /** Consecutive [offset, count] u32 pairs, copied from the V4 coloring. */
  readonly colorRanges: Uint32Array;
  /** 16-byte [warp, weft, shear, formulationTag] records in material-key order. */
  readonly materialRecords: ArrayBuffer;
  /** 16-byte [warp, weft, shear, reserved] records, all zero at package creation. */
  readonly lambdasKgM: Float32Array;
};

export type SimulationPackageV5 = {
  readonly manifest: Omit<
    SimulationPackageV4['manifest'],
    | 'schemaVersion'
    | 'solverModel'
    | 'strainScheduleVersion'
    | 'strainConstraintCount'
    | 'strainColorCount'
    | 'strainScheduleBufferBytes'
    | 'estimatedRuntimeBytes'
    | 'budgets'
  > & {
    readonly schemaVersion: typeof SIMULATION_PACKAGE_V5_VERSION;
    readonly solverModel: 'xpbd-distance-seam-material-bend-continuum-strain-v5';
    readonly continuumStrainVersion: typeof CONTINUUM_STRAIN_PACKAGE_V1_VERSION;
    readonly continuumFormulation: 'sqrt-rest-area-green-strain';
    readonly continuumComplianceUnits: 'm/N';
    readonly continuumLambdaUnits: 'kg*m';
    readonly continuumRestAreaUnits: 'm^2';
    readonly continuumConstraintCount: number;
    readonly continuumColorCount: number;
    readonly continuumConstraintRecordBytes: number;
    readonly continuumMaterialIndexBytes: number;
    readonly continuumMaterialRecordBytes: number;
    readonly continuumLambdaBytes: number;
    readonly continuumStrainBufferBytes: number;
    readonly estimatedRuntimeBytes: number;
    readonly budgets: Omit<
      SimulationPackageV4['manifest']['budgets'],
      'maxStrainConstraints' | 'maxStrainColors' | 'maxStrainScheduleBufferBytes'
    > & {
      readonly maxContinuumConstraints: number;
      readonly maxContinuumColors: number;
      readonly maxContinuumMaterials: number;
      readonly maxContinuumBufferBytes: number;
    };
  };
  readonly restBoundsM: SimulationPackageV4['restBoundsM'];
  readonly mesh: SimulationPackageV4['mesh'];
  readonly constraints: Omit<SimulationPackageV4['constraints'], 'strain'> & {
    readonly continuumStrain: CompiledContinuumStrainPackageV1;
  };
  readonly material: CompiledMaterialPackageV1;
};

export type CompileSimulationPackageV5Options = CompileSimulationPackageV4Options & {
  readonly continuumMaterials: readonly ContinuumStrainMaterialInputV1[];
  readonly maxContinuumConstraints?: number;
  readonly maxContinuumColors?: number;
  readonly maxContinuumMaterials?: number;
  readonly maxContinuumBufferBytes?: number;
};

type Edge = readonly [first: number, second: number];

function buildUniqueEdges(triangles: Uint32Array): readonly Edge[] {
  const edges = new Map<string, Edge>();
  const add = (left: number, right: number) => {
    const first = Math.min(left, right);
    const second = Math.max(left, right);
    const key = first + ':' + second;
    if (!edges.has(key)) edges.set(key, [first, second]);
  };

  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    add(a, b);
    add(b, c);
    add(c, a);
  }

  return [...edges.values()].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function colorEdges(
  edges: readonly Edge[],
  particleCount: number,
): {
  readonly vertexPairs: Uint32Array;
  readonly orderedEdges: readonly Edge[];
  readonly colorRanges: readonly ConstraintColorRange[];
} {
  const colorsAtVertex = Array.from({ length: particleCount }, () => new Set<number>());
  const colors: Edge[][] = [];

  for (const edge of edges) {
    let color = 0;
    while (colorsAtVertex[edge[0]].has(color) || colorsAtVertex[edge[1]].has(color)) color += 1;
    colors[color] ??= [];
    colors[color].push(edge);
    colorsAtVertex[edge[0]].add(color);
    colorsAtVertex[edge[1]].add(color);
  }

  const orderedEdges = colors.flat();
  const vertexPairs = new Uint32Array(orderedEdges.length * 2);
  orderedEdges.forEach((edge, index) => {
    vertexPairs[index * 2] = edge[0];
    vertexPairs[index * 2 + 1] = edge[1];
  });

  let offset = 0;
  const colorRanges = colors.map((constraints, color) => {
    const range = { color, offset, count: constraints.length };
    offset += constraints.length;
    return range;
  });
  return { vertexPairs, orderedEdges, colorRanges };
}

/**
 * Phase-one package compiler. It deliberately compiles only topology-independent distance
 * constraints; seams, bend, material frames and collision are later package revisions.
 */
export function compileSimulationPackageV0(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageOptions = {},
): SimulationPackageV0 {
  const meshErrors = validateClothMeshIR(mesh);
  if (meshErrors.length > 0) {
    throw new Error('ClothMeshIR preflight failed: ' + meshErrors[0]);
  }

  const particleCount = mesh.restPositions2Mm.length / 2;
  const maxParticles = options.maxParticles ?? 20_000;
  if (particleCount > maxParticles) {
    throw new RangeError(
      'Simulation package particle budget exceeded: ' +
        String(particleCount) +
        ' > ' +
        String(maxParticles) +
        '.',
    );
  }

  const edges = buildUniqueEdges(mesh.triangles);
  const maxDistanceConstraints = options.maxDistanceConstraints ?? 60_000;
  if (edges.length > maxDistanceConstraints) {
    throw new RangeError(
      'Simulation package distance-constraint budget exceeded: ' +
        String(edges.length) +
        ' > ' +
        String(maxDistanceConstraints) +
        '.',
    );
  }

  const supportAttachments = compileSupportAttachmentsV1(
    mesh,
    options.supportAttachmentPolicy ?? DEFAULT_UNATTACHED_SUPPORT_POLICY_V1,
  );
  const pins = new Set(supportAttachments.particleIndices);
  const restPositionsInvMass = new Float32Array(particleCount * 4);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < particleCount; index += 1) {
    const x = mesh.restPositions2Mm[index * 2] * 0.001;
    const y = mesh.restPositions2Mm[index * 2 + 1] * 0.001;
    restPositionsInvMass[index * 4] = x;
    restPositionsInvMass[index * 4 + 1] = y;
    restPositionsInvMass[index * 4 + 2] = 0;
    restPositionsInvMass[index * 4 + 3] = pins.has(index) ? 0 : 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const colored = colorEdges(edges, particleCount);
  const restLengthsM = new Float32Array(colored.orderedEdges.length);
  colored.orderedEdges.forEach((edge, index) => {
    const ax = restPositionsInvMass[edge[0] * 4];
    const ay = restPositionsInvMass[edge[0] * 4 + 1];
    const bx = restPositionsInvMass[edge[1] * 4];
    const by = restPositionsInvMass[edge[1] * 4 + 1];
    restLengthsM[index] = Math.hypot(bx - ax, by - ay);
  });

  const estimatedRuntimeBytes =
    restPositionsInvMass.byteLength * 4 +
    mesh.triangles.byteLength +
    colored.vertexPairs.byteLength +
    restLengthsM.byteLength * 2;

  return {
    manifest: {
      schemaVersion: SIMULATION_PACKAGE_VERSION,
      sourceAssemblyFingerprint: mesh.sourceAssemblyFingerprint,
      sourceMeshVersion: mesh.schemaVersion,
      solverModel: 'xpbd-distance-v0',
      units: 'm',
      particleCount,
      triangleCount: mesh.triangles.length / 3,
      distanceConstraintCount: restLengthsM.length,
      distanceColorCount: colored.colorRanges.length,
      pinnedParticleCount: pins.size,
      estimatedRuntimeBytes,
      budgets: { maxParticles, maxDistanceConstraints },
    },
    restBoundsM: { minX, maxX, minY, maxY },
    mesh: {
      restPositionsInvMass,
      triangles: new Uint32Array(mesh.triangles),
      supportAttachments,
    },
    constraints: {
      distance: {
        vertexPairs: colored.vertexPairs,
        restLengthsM,
        colorRanges: colored.colorRanges,
      },
    },
  };
}

/**
 * Versioned seam package. V0 remains distance-only; this compiler fails closed when ClothMeshIR
 * seams are absent, unsupported, or ambiguous.
 */
export function compileSimulationPackageV1(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageV1Options = {},
): SimulationPackageV1 {
  const base = compileSimulationPackageV0(mesh, options);
  const seamResult = compileSeamConstraints(mesh.seams, base.manifest.particleCount);
  if (!seamResult.ok) {
    const details = seamResult.diagnostics
      .map(
        (entry) =>
          entry.code + (entry.seamId ? ' [' + entry.seamId + ']' : '') + ': ' + entry.message,
      )
      .join('; ');
    throw new Error('Seam constraint compilation failed: ' + details);
  }

  const seam = seamResult.constraints;
  const maxSeamConstraints = options.maxSeamConstraints ?? 20_000;
  if (!Number.isSafeInteger(maxSeamConstraints) || maxSeamConstraints < 1) {
    throw new RangeError('maxSeamConstraints must be a positive safe integer.');
  }
  if (seam.constraintCount > maxSeamConstraints) {
    throw new RangeError(
      'Simulation package seam-constraint budget exceeded: ' +
        String(seam.constraintCount) +
        ' > ' +
        String(maxSeamConstraints) +
        '.',
    );
  }

  const seamRuntimeBytes =
    seam.vertexPairs.byteLength +
    seam.targetLengthsM.byteLength +
    seam.seamIdIndices.byteLength +
    seam.sourcePairIndices.byteLength +
    seam.colorRanges.byteLength +
    seam.activationOrder.byteLength +
    seam.constraintCount * Float32Array.BYTES_PER_ELEMENT +
    seam.constraintCount * Uint32Array.BYTES_PER_ELEMENT;

  return {
    manifest: {
      ...base.manifest,
      schemaVersion: SIMULATION_PACKAGE_V1_VERSION,
      solverModel: 'xpbd-distance-seam-v1',
      seamConstraintCount: seam.constraintCount,
      seamColorCount: seam.colorCount,
      estimatedRuntimeBytes: base.manifest.estimatedRuntimeBytes + seamRuntimeBytes,
      budgets: {
        ...base.manifest.budgets,
        maxSeamConstraints,
      },
    },
    restBoundsM: base.restBoundsM,
    mesh: base.mesh,
    constraints: {
      distance: base.constraints.distance,
      seam,
    },
  };
}

function materialBufferBytes(material: CompiledMaterialPackageV1): number {
  return (
    material.triangleIndices.byteLength +
    material.triangleMaterialIndices.byteLength +
    material.triangleRestFrames.byteLength +
    material.materialRecords.byteLength +
    material.particleMassRecords.byteLength
  );
}

function totalMassKg(material: CompiledMaterialPackageV1): number {
  const view = new DataView(material.particleMassRecords);
  let total = 0;
  for (let index = 0; index < material.manifest.particleCount; index += 1) {
    total += view.getFloat32(
      index * PARTICLE_MASS_GPU_V1.strideBytes + PARTICLE_MASS_GPU_V1.offsets.massKg,
      true,
    );
  }
  return total;
}

function positiveSafeBudget(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(name + ' must be a positive safe integer.');
  }
  return value;
}

/**
 * Additive material package revision. V1 compilation remains the runtime-owned distance+seam
 * artifact; V2 only packages deterministic future GPU inputs beside it.
 */
export function compileSimulationPackageV2(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageV2Options,
): SimulationPackageV2 {
  const maxMaterials = positiveSafeBudget(options.maxMaterials ?? 1_024, 'maxMaterials');
  const maxMaterialBufferBytes = positiveSafeBudget(
    options.maxMaterialBufferBytes ?? 256 * 1024 * 1024,
    'maxMaterialBufferBytes',
  );
  const base = compileSimulationPackageV1(mesh, options);
  const materialResult = compileMaterialPackageV1(
    mesh,
    options.pieceGrains,
    options.materialAssignments,
    options.materials,
    options.materialSolver,
  );
  if (!materialResult.ok) {
    const displayedDiagnostics = materialResult.diagnostics.slice(0, 16);
    const details = displayedDiagnostics
      .map(
        (entry) =>
          entry.code +
          (entry.sourceId ? ' [' + entry.sourceId + ']' : '') +
          (entry.triangleIndex === undefined
            ? ''
            : ' [triangle ' + String(entry.triangleIndex) + ']') +
          ': ' +
          entry.message,
      )
      .join('; ');
    const omitted = materialResult.diagnostics.length - displayedDiagnostics.length;
    throw new Error(
      'Material package compilation failed: ' +
        details +
        (omitted > 0 ? '; … ' + String(omitted) + ' more diagnostic(s)' : ''),
    );
  }

  const material = materialResult.materialPackage;
  if (material.manifest.materialCount > maxMaterials) {
    throw new RangeError(
      'Simulation package material budget exceeded: ' +
        String(material.manifest.materialCount) +
        ' > ' +
        String(maxMaterials) +
        '.',
    );
  }
  const compiledMaterialBytes = materialBufferBytes(material);
  if (compiledMaterialBytes > maxMaterialBufferBytes) {
    throw new RangeError(
      'Simulation package material-buffer budget exceeded: ' +
        String(compiledMaterialBytes) +
        ' > ' +
        String(maxMaterialBufferBytes) +
        '.',
    );
  }

  return {
    manifest: {
      ...base.manifest,
      schemaVersion: SIMULATION_PACKAGE_V2_VERSION,
      solverModel: 'xpbd-distance-seam-material-v2',
      materialPackageVersion: MATERIAL_PACKAGE_VERSION,
      materialCount: material.manifest.materialCount,
      totalMassKg: totalMassKg(material),
      materialBufferBytes: compiledMaterialBytes,
      estimatedRuntimeBytes: base.manifest.estimatedRuntimeBytes + compiledMaterialBytes,
      budgets: {
        ...base.manifest.budgets,
        maxMaterials,
        maxMaterialBufferBytes,
      },
    },
    restBoundsM: base.restBoundsM,
    mesh: base.mesh,
    constraints: base.constraints,
    material,
  };
}

function bendBufferBytes(bend: CompiledBendConstraints): number {
  return bend.vertexQuads.byteLength + bend.restAnglesRad.byteLength + bend.colorRanges.byteLength;
}

function bendRuntimeBytes(bend: CompiledBendConstraints): number {
  return bendBufferBytes(bend) + bend.constraintCount * Float32Array.BYTES_PER_ELEMENT;
}

/**
 * Additive signed-dihedral package revision. V0-V2 compilers and byte layouts remain unchanged;
 * V3 publishes precompiled, graph-colored bend topology but does not select a GPU bend solver.
 */
export function compileSimulationPackageV3(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageV3Options,
): SimulationPackageV3 {
  const maxBendConstraints = positiveSafeBudget(
    options.maxBendConstraints ?? 60_000,
    'maxBendConstraints',
  );
  const maxBendBufferBytes = positiveSafeBudget(
    options.maxBendBufferBytes ?? 16 * 1024 * 1024,
    'maxBendBufferBytes',
  );
  const base = compileSimulationPackageV2(mesh, options);
  const bendResult = compileBendConstraints(mesh);
  if (!bendResult.ok) {
    const errorDiagnostics = bendResult.diagnostics.filter((entry) => entry.severity === 'error');
    const displayedDiagnostics = errorDiagnostics.slice(0, 16);
    const details = displayedDiagnostics
      .map(
        (entry) =>
          entry.code +
          (entry.edge === undefined ? '' : ' [edge ' + entry.edge.join(':') + ']') +
          (entry.triangleIndex === undefined
            ? ''
            : ' [triangle ' + String(entry.triangleIndex) + ']') +
          ': ' +
          entry.message,
      )
      .join('; ');
    const omitted = errorDiagnostics.length - displayedDiagnostics.length;
    throw new Error(
      'Bend constraint compilation failed: ' +
        details +
        (omitted > 0 ? '; … ' + String(omitted) + ' more diagnostic(s)' : ''),
    );
  }

  const bend = bendResult.constraints;
  if (bend.constraintCount > maxBendConstraints) {
    throw new RangeError(
      'Simulation package bend-constraint budget exceeded: ' +
        String(bend.constraintCount) +
        ' > ' +
        String(maxBendConstraints) +
        '.',
    );
  }
  const compiledBendBytes = bendBufferBytes(bend);
  if (compiledBendBytes > maxBendBufferBytes) {
    throw new RangeError(
      'Simulation package bend-buffer budget exceeded: ' +
        String(compiledBendBytes) +
        ' > ' +
        String(maxBendBufferBytes) +
        '.',
    );
  }

  return {
    manifest: {
      ...base.manifest,
      schemaVersion: SIMULATION_PACKAGE_V3_VERSION,
      solverModel: 'xpbd-distance-seam-material-bend-v3',
      bendConstraintModel: bend.model,
      bendConstraintCount: bend.constraintCount,
      bendColorCount: bend.colorCount,
      bendBufferBytes: compiledBendBytes,
      estimatedRuntimeBytes: base.manifest.estimatedRuntimeBytes + bendRuntimeBytes(bend),
      budgets: {
        ...base.manifest.budgets,
        maxBendConstraints,
        maxBendBufferBytes,
      },
    },
    restBoundsM: base.restBoundsM,
    mesh: base.mesh,
    constraints: {
      ...base.constraints,
      bend,
    },
    material: base.material,
  };
}

/**
 * Additive triangle-strain scheduling revision. The complete V3 bend package is compiled first and
 * retained byte-for-byte; V4 only appends separately colored strain inputs and multiplier storage.
 */
export function compileSimulationPackageV4(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageV4Options,
): SimulationPackageV4 {
  const maxStrainConstraints = positiveSafeBudget(
    options.maxStrainConstraints ?? 60_000,
    'maxStrainConstraints',
  );
  const maxStrainColors = positiveSafeBudget(options.maxStrainColors ?? 4_096, 'maxStrainColors');
  const maxStrainScheduleBufferBytes = positiveSafeBudget(
    options.maxStrainScheduleBufferBytes ?? 32 * 1024 * 1024,
    'maxStrainScheduleBufferBytes',
  );
  const base = compileSimulationPackageV3(mesh, options);
  const scheduleResult = compileTriangleStrainScheduleV1(base.material, {
    maxConstraints: maxStrainConstraints,
    maxColors: maxStrainColors,
    maxBufferBytes: maxStrainScheduleBufferBytes,
  });
  if (!scheduleResult.ok) {
    const details = scheduleResult.diagnostics
      .slice(0, 16)
      .map(
        (entry) =>
          entry.code +
          (entry.triangleIndex === undefined
            ? ''
            : ' [triangle ' + String(entry.triangleIndex) + ']') +
          ': ' +
          entry.message,
      )
      .join('; ');
    throw new Error('Triangle strain schedule compilation failed: ' + details);
  }

  const strain = scheduleResult.schedule;
  return {
    manifest: {
      ...base.manifest,
      schemaVersion: SIMULATION_PACKAGE_V4_VERSION,
      solverModel: 'xpbd-distance-seam-material-bend-strain-v4',
      strainScheduleVersion: TRIANGLE_STRAIN_SCHEDULE_VERSION,
      strainConstraintCount: strain.constraintCount,
      strainColorCount: strain.colorCount,
      materialRecordBytes: base.material.materialRecords.byteLength,
      particleMassBytes: base.material.particleMassRecords.byteLength,
      strainScheduleBufferBytes: strain.bufferBytes,
      estimatedRuntimeBytes: base.manifest.estimatedRuntimeBytes + strain.bufferBytes,
      budgets: {
        ...base.manifest.budgets,
        maxStrainConstraints,
        maxStrainColors,
        maxStrainScheduleBufferBytes,
      },
    },
    restBoundsM: base.restBoundsM,
    mesh: base.mesh,
    constraints: {
      ...base.constraints,
      strain,
    },
    material: base.material,
  };
}

function continuumMaterialKey(
  material: Pick<ContinuumStrainMaterialInputV1, 'materialId' | 'materialRevision'>,
): string {
  return material.materialId + '@' + material.materialRevision;
}

export function continuumStrainPackageBufferBytes(
  strain: Pick<
    CompiledContinuumStrainPackageV1,
    | 'triangleIndices'
    | 'triangleRestFrames'
    | 'constraintRecords'
    | 'materialIndices'
    | 'colorRanges'
    | 'materialRecords'
    | 'lambdasKgM'
  >,
): number {
  return (
    strain.triangleIndices.byteLength +
    strain.triangleRestFrames.byteLength +
    strain.constraintRecords.byteLength +
    strain.materialIndices.byteLength +
    strain.colorRanges.byteLength +
    strain.materialRecords.byteLength +
    strain.lambdasKgM.byteLength
  );
}

function continuumRestFrameValidationError(
  view: DataView,
  base: number,
  materialCount: number,
): string | undefined {
  const offsets = TRIANGLE_REST_FRAME_GPU_V1.offsets;
  const inverseDm00 = view.getFloat32(base + offsets.inverseDm00, true);
  const inverseDm01 = view.getFloat32(base + offsets.inverseDm01, true);
  const inverseDm10 = view.getFloat32(base + offsets.inverseDm10, true);
  const inverseDm11 = view.getFloat32(base + offsets.inverseDm11, true);
  const restAreaM2 = view.getFloat32(base + offsets.restAreaM2, true);
  const materialIndex = view.getUint32(base + offsets.materialIndex, true);
  const reserved0 = view.getUint32(base + offsets.reserved0, true);
  const reserved1 = view.getUint32(base + offsets.reserved1, true);
  if (
    ![inverseDm00, inverseDm01, inverseDm10, inverseDm11].every(Number.isFinite) ||
    !Number.isFinite(restAreaM2)
  ) {
    return 'inverse Dm and rest area must be finite f32 values';
  }
  if (restAreaM2 <= CONTINUUM_STRAIN_MIN_REST_AREA_M2) {
    return 'rest area must be > 1e-12 m^2';
  }
  if (materialIndex >= materialCount) return 'material index is outside the continuum table';
  if (reserved0 !== 0 || reserved1 !== 0) return 'rest-frame reserved lanes must be zero';
  const determinantInvM2 = Math.fround(
    Math.fround(inverseDm00 * inverseDm11) - Math.fround(inverseDm01 * inverseDm10),
  );
  if (!Number.isFinite(determinantInvM2) || determinantInvM2 === 0) {
    return 'inverse Dm determinant must be finite and non-zero';
  }
  const expectedAreaM2 = Math.fround(0.5 / Math.abs(determinantInvM2));
  const scaleM2 = Math.fround(Math.max(restAreaM2, expectedAreaM2));
  const ulpBuffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT);
  const ulpView = new DataView(ulpBuffer);
  ulpView.setFloat32(0, scaleM2, true);
  ulpView.setUint32(0, ulpView.getUint32(0, true) + 1, true);
  const scaleUlpM2 = ulpView.getFloat32(0, true) - scaleM2;
  const toleranceM2 =
    CONTINUUM_STRAIN_REST_AREA_MAX_ULPS * scaleUlpM2 +
    CONTINUUM_STRAIN_REST_AREA_RELATIVE_TOLERANCE * scaleM2;
  if (!Number.isFinite(expectedAreaM2) || Math.abs(restAreaM2 - expectedAreaM2) > toleranceM2) {
    return 'rest area disagrees with 0.5/abs(det(inverseDm)) beyond f32 tolerance';
  }
  return undefined;
}

export function compileContinuumStrainPackageV1(
  material: CompiledMaterialPackageV1,
  source: CompiledTriangleStrainScheduleV1,
  inputs: readonly ContinuumStrainMaterialInputV1[],
): CompiledContinuumStrainPackageV1 {
  const byKey = new Map<string, ContinuumStrainMaterialInputV1>();
  for (const input of inputs) {
    const key = continuumMaterialKey(input);
    const compliance = input.complianceMPerN;
    if (
      input.materialId.length === 0 ||
      input.materialRevision.length === 0 ||
      input.provenance.sourceId.trim().length === 0 ||
      !['measured', 'estimated', 'uncalibrated-visual'].includes(
        input.provenance.calibrationStatus,
      ) ||
      byKey.has(key) ||
      ![compliance.warp, compliance.weft, compliance.shear].every(
        (value) => Number.isFinite(value) && value > 0 && Number.isFinite(Math.fround(value)),
      )
    ) {
      throw new RangeError(
        'Continuum strain material inputs require unique non-empty keys/provenance and finite positive f32 m/N compliance.',
      );
    }
    byKey.set(key, input);
  }
  if (
    byKey.size !== material.materialKeys.length ||
    material.materialKeys.some((key) => !byKey.has(key))
  ) {
    throw new RangeError(
      'Continuum strain materials must cover the compiled material key table exactly.',
    );
  }

  const constraintCount = source.constraintCount;
  const materialCount = material.manifest.materialCount;
  const triangleIndices = source.triangleIndices.slice(0);
  const triangleRestFrames = source.triangleRestFrames.slice(0);
  const constraintRecords = new ArrayBuffer(
    constraintCount * CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.strideBytes,
  );
  const constraintView = new DataView(constraintRecords);
  const sourceMaterialView = new DataView(source.triangleMaterialIndices);
  const materialIndices = new Uint32Array(constraintCount);
  const restFrameView = new DataView(triangleRestFrames);

  for (let index = 0; index < constraintCount; index += 1) {
    const restBase = index * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
    const frameError = continuumRestFrameValidationError(restFrameView, restBase, materialCount);
    if (frameError !== undefined) {
      throw new RangeError(
        'Continuum strain rest frame is invalid [constraint ' +
          String(index) +
          ']: ' +
          frameError +
          '.',
      );
    }
    const materialIndex = sourceMaterialView.getUint32(
      index * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
      true,
    );
    const baseOffset = index * CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.strideBytes;
    constraintView.setUint32(
      baseOffset + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.sourceTriangleIndex,
      source.sourceTriangleIndices[index],
      true,
    );
    constraintView.setUint32(
      baseOffset + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.renderTriangleIndex,
      source.renderTriangleIndices[index],
      true,
    );
    constraintView.setUint32(
      baseOffset + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.materialIndex,
      materialIndex,
      true,
    );
    constraintView.setUint32(
      baseOffset + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.reserved,
      0,
      true,
    );
    materialIndices[index] = materialIndex;
  }

  const materialRecords = new ArrayBuffer(
    materialCount * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes,
  );
  const materialView = new DataView(materialRecords);
  material.materialKeys.forEach((key, index) => {
    const input = byKey.get(key);
    if (input === undefined) throw new Error('Continuum material lookup invariant failed.');
    const recordBase = index * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes;
    materialView.setFloat32(
      recordBase + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.warpComplianceMPerN,
      input.complianceMPerN.warp,
      true,
    );
    materialView.setFloat32(
      recordBase + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.weftComplianceMPerN,
      input.complianceMPerN.weft,
      true,
    );
    materialView.setFloat32(
      recordBase + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.shearComplianceMPerN,
      input.complianceMPerN.shear,
      true,
    );
    materialView.setUint32(
      recordBase + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.formulationTag,
      CONTINUUM_STRAIN_FORMULATION_TAG_V1,
      true,
    );
  });

  const compiled: CompiledContinuumStrainPackageV1 = {
    version: CONTINUUM_STRAIN_PACKAGE_V1_VERSION,
    model: 'xpbd-sqrt-rest-area-green-strain-v1',
    constraintCount,
    colorCount: source.colorCount,
    materialCount,
    materialKeys: [...material.materialKeys],
    materialProvenance: material.materialKeys.map((key) => {
      const input = byKey.get(key);
      if (input === undefined) throw new Error('Continuum material lookup invariant failed.');
      return { ...input.provenance };
    }),
    bufferBytes: 0,
    triangleIndices,
    triangleRestFrames,
    constraintRecords,
    materialIndices,
    colorRanges: new Uint32Array(source.colorRanges),
    materialRecords,
    lambdasKgM: new Float32Array(
      (constraintCount * CONTINUUM_STRAIN_LAMBDA_GPU_V1.strideBytes) /
        Float32Array.BYTES_PER_ELEMENT,
    ),
  };
  return { ...compiled, bufferBytes: continuumStrainPackageBufferBytes(compiled) };
}

/**
 * Single-formulation continuum package. V4 is only an internal coloring helper; V5 publishes the
 * V3-compatible base plus explicit-SI continuum records and no legacy V4 strain state.
 */
export function compileSimulationPackageV5(
  mesh: ClothMeshIR,
  options: CompileSimulationPackageV5Options,
): SimulationPackageV5 {
  const maxContinuumConstraints = positiveSafeBudget(
    options.maxContinuumConstraints ?? 60_000,
    'maxContinuumConstraints',
  );
  const maxContinuumColors = positiveSafeBudget(
    options.maxContinuumColors ?? 4_096,
    'maxContinuumColors',
  );
  const maxContinuumMaterials = positiveSafeBudget(
    options.maxContinuumMaterials ?? 1_024,
    'maxContinuumMaterials',
  );
  const maxContinuumBufferBytes = positiveSafeBudget(
    options.maxContinuumBufferBytes ?? 32 * 1024 * 1024,
    'maxContinuumBufferBytes',
  );
  const base = compileSimulationPackageV4(mesh, options);
  const continuumStrain = compileContinuumStrainPackageV1(
    base.material,
    base.constraints.strain,
    options.continuumMaterials,
  );
  if (continuumStrain.constraintCount > maxContinuumConstraints) {
    throw new RangeError('Simulation package continuum constraint budget exceeded.');
  }
  if (continuumStrain.colorCount > maxContinuumColors) {
    throw new RangeError('Simulation package continuum color budget exceeded.');
  }
  if (continuumStrain.materialCount > maxContinuumMaterials) {
    throw new RangeError('Simulation package continuum material budget exceeded.');
  }
  if (continuumStrain.bufferBytes > maxContinuumBufferBytes) {
    throw new RangeError('Simulation package continuum buffer budget exceeded.');
  }

  const baseManifest = {
    sourceAssemblyFingerprint: base.manifest.sourceAssemblyFingerprint,
    sourceMeshVersion: base.manifest.sourceMeshVersion,
    bendConstraintModel: base.manifest.bendConstraintModel,
    units: base.manifest.units,
    particleCount: base.manifest.particleCount,
    triangleCount: base.manifest.triangleCount,
    distanceConstraintCount: base.manifest.distanceConstraintCount,
    distanceColorCount: base.manifest.distanceColorCount,
    seamConstraintCount: base.manifest.seamConstraintCount,
    seamColorCount: base.manifest.seamColorCount,
    bendConstraintCount: base.manifest.bendConstraintCount,
    bendColorCount: base.manifest.bendColorCount,
    pinnedParticleCount: base.manifest.pinnedParticleCount,
    materialPackageVersion: base.manifest.materialPackageVersion,
    materialCount: base.manifest.materialCount,
    totalMassKg: base.manifest.totalMassKg,
    materialBufferBytes: base.manifest.materialBufferBytes,
    bendBufferBytes: base.manifest.bendBufferBytes,
    materialRecordBytes: base.manifest.materialRecordBytes,
    particleMassBytes: base.manifest.particleMassBytes,
  };
  const baseBudgets = {
    maxParticles: base.manifest.budgets.maxParticles,
    maxDistanceConstraints: base.manifest.budgets.maxDistanceConstraints,
    maxSeamConstraints: base.manifest.budgets.maxSeamConstraints,
    maxMaterials: base.manifest.budgets.maxMaterials,
    maxMaterialBufferBytes: base.manifest.budgets.maxMaterialBufferBytes,
    maxBendConstraints: base.manifest.budgets.maxBendConstraints,
    maxBendBufferBytes: base.manifest.budgets.maxBendBufferBytes,
  };

  return {
    manifest: {
      ...baseManifest,
      schemaVersion: SIMULATION_PACKAGE_V5_VERSION,
      solverModel: 'xpbd-distance-seam-material-bend-continuum-strain-v5',
      continuumStrainVersion: CONTINUUM_STRAIN_PACKAGE_V1_VERSION,
      continuumFormulation: 'sqrt-rest-area-green-strain',
      continuumComplianceUnits: 'm/N',
      continuumLambdaUnits: 'kg*m',
      continuumRestAreaUnits: 'm^2',
      continuumConstraintCount: continuumStrain.constraintCount,
      continuumColorCount: continuumStrain.colorCount,
      continuumConstraintRecordBytes: continuumStrain.constraintRecords.byteLength,
      continuumMaterialIndexBytes: continuumStrain.materialIndices.byteLength,
      continuumMaterialRecordBytes: continuumStrain.materialRecords.byteLength,
      continuumLambdaBytes: continuumStrain.lambdasKgM.byteLength,
      continuumStrainBufferBytes: continuumStrain.bufferBytes,
      estimatedRuntimeBytes:
        base.manifest.estimatedRuntimeBytes -
        base.manifest.strainScheduleBufferBytes +
        continuumStrain.bufferBytes,
      budgets: {
        ...baseBudgets,
        maxContinuumConstraints,
        maxContinuumColors,
        maxContinuumMaterials,
        maxContinuumBufferBytes,
      },
    },
    restBoundsM: base.restBoundsM,
    mesh: base.mesh,
    constraints: {
      distance: base.constraints.distance,
      seam: base.constraints.seam,
      bend: base.constraints.bend,
      continuumStrain,
    },
    material: base.material,
  };
}

export function validateSimulationPackageV0(simulation: SimulationPackageV0): readonly string[] {
  const errors: string[] = [];
  const particleCount = simulation.manifest.particleCount;
  const distance = simulation.constraints.distance;
  if (simulation.mesh.restPositionsInvMass.length !== particleCount * 4) {
    errors.push('restPositionsInvMass length does not match particleCount.');
  }
  if (simulation.mesh.triangles.length !== simulation.manifest.triangleCount * 3) {
    errors.push('triangle buffer length does not match triangleCount.');
  }
  const attachments = simulation.mesh.supportAttachments;
  if (attachments.version !== SUPPORT_ATTACHMENT_POLICY_V1_VERSION) {
    errors.push('support attachment policy version is unsupported.');
  }
  if (
    attachments.particleIndices.length !== simulation.manifest.pinnedParticleCount ||
    attachments.attachmentIds.length !== simulation.manifest.pinnedParticleCount
  ) {
    errors.push('support attachment counts disagree with pinnedParticleCount.');
  }
  if (
    attachments.provenance.sourceId.length === 0 ||
    attachments.provenance.sourceId.trim() !== attachments.provenance.sourceId ||
    /\s/.test(attachments.provenance.sourceId)
  ) {
    errors.push('support attachment provenance sourceId is not a stable ID.');
  }
  if (
    !['none', 'explicit-fixed-particles', 'legacy-piece-top-corners'].includes(attachments.mode) ||
    !['production', 'debug', 'test'].includes(attachments.provenance.intendedUse) ||
    (attachments.mode === 'legacy-piece-top-corners' &&
      attachments.provenance.intendedUse === 'production')
  ) {
    errors.push('support attachment mode or intended use is unsupported.');
  }
  if (attachments.mode === 'none' && attachments.particleIndices.length !== 0) {
    errors.push('none support attachment policy must not contain particle indices.');
  }
  const attachmentIds = new Set<string>();
  let previousAttachmentParticle = -1;
  for (
    let attachmentOffset = 0;
    attachmentOffset < attachments.particleIndices.length;
    attachmentOffset += 1
  ) {
    const particleIndex = attachments.particleIndices[attachmentOffset];
    const attachmentId = attachments.attachmentIds[attachmentOffset];
    if (particleIndex >= particleCount || particleIndex <= previousAttachmentParticle) {
      errors.push('support attachment particle indices must be unique, in range, and ascending.');
      break;
    }
    if (
      attachmentId.length === 0 ||
      attachmentId.trim() !== attachmentId ||
      /\s/.test(attachmentId) ||
      attachmentIds.has(attachmentId)
    ) {
      errors.push('support attachment IDs must be stable and unique.');
      break;
    }
    attachmentIds.add(attachmentId);
    previousAttachmentParticle = particleIndex;
  }
  const attachedParticles = new Set(attachments.particleIndices);
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const inverseMass = simulation.mesh.restPositionsInvMass[particleIndex * 4 + 3];
    if ((inverseMass === 0) !== attachedParticles.has(particleIndex)) {
      errors.push('zero inverse masses disagree with the support attachment policy.');
      break;
    }
  }
  if (
    distance.vertexPairs.length !== simulation.manifest.distanceConstraintCount * 2 ||
    distance.restLengthsM.length !== simulation.manifest.distanceConstraintCount
  ) {
    errors.push('distance constraint buffers disagree with the manifest.');
  }

  let expectedOffset = 0;
  for (const range of distance.colorRanges) {
    if (range.offset !== expectedOffset || range.count <= 0) {
      errors.push('distance color ranges are empty, overlapping or non-contiguous.');
      break;
    }
    const used = new Set<number>();
    for (let index = range.offset; index < range.offset + range.count; index += 1) {
      const first = distance.vertexPairs[index * 2];
      const second = distance.vertexPairs[index * 2 + 1];
      if (first >= particleCount || second >= particleCount) {
        errors.push('distance constraint references a particle outside the package.');
        break;
      }
      if (used.has(first) || used.has(second)) {
        errors.push('two constraints in one color write the same particle.');
        break;
      }
      used.add(first);
      used.add(second);
    }
    expectedOffset += range.count;
  }
  if (expectedOffset !== simulation.manifest.distanceConstraintCount) {
    errors.push('distance color ranges do not cover every constraint.');
  }
  if (
    simulation.constraints.distance.restLengthsM.some(
      (length) => !Number.isFinite(length) || length <= 0,
    )
  ) {
    errors.push('distance constraints contain an invalid rest length.');
  }
  return [...new Set(errors)];
}

export function validateSimulationPackageV1(simulation: SimulationPackageV1): readonly string[] {
  const errors: string[] = [];
  if (simulation.manifest.schemaVersion !== SIMULATION_PACKAGE_V1_VERSION) {
    errors.push('schemaVersion is not the seam-enabled package version.');
  }
  if (simulation.manifest.solverModel !== 'xpbd-distance-seam-v1') {
    errors.push('solverModel is not the seam-enabled solver.');
  }

  const baseErrors = validateSimulationPackageV0({
    manifest: {
      schemaVersion: SIMULATION_PACKAGE_VERSION,
      sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
      sourceMeshVersion: simulation.manifest.sourceMeshVersion,
      solverModel: 'xpbd-distance-v0',
      units: simulation.manifest.units,
      particleCount: simulation.manifest.particleCount,
      triangleCount: simulation.manifest.triangleCount,
      distanceConstraintCount: simulation.manifest.distanceConstraintCount,
      distanceColorCount: simulation.manifest.distanceColorCount,
      pinnedParticleCount: simulation.manifest.pinnedParticleCount,
      estimatedRuntimeBytes: simulation.manifest.estimatedRuntimeBytes,
      budgets: {
        maxParticles: simulation.manifest.budgets.maxParticles,
        maxDistanceConstraints: simulation.manifest.budgets.maxDistanceConstraints,
      },
    },
    restBoundsM: simulation.restBoundsM,
    mesh: simulation.mesh,
    constraints: { distance: simulation.constraints.distance },
  });
  errors.push(...baseErrors);

  const seam = simulation.constraints.seam;
  const seamCount = simulation.manifest.seamConstraintCount;
  if (seamCount <= 0 || seam.constraintCount !== seamCount) {
    errors.push('seam constraint count is empty or disagrees with the manifest.');
  }
  if (seam.colorCount !== simulation.manifest.seamColorCount || seam.colorCount <= 0) {
    errors.push('seam color count is empty or disagrees with the manifest.');
  }
  if (
    seam.vertexPairs.length !== seamCount * 2 ||
    seam.targetLengthsM.length !== seamCount ||
    seam.seamIdIndices.length !== seamCount ||
    seam.sourcePairIndices.length !== seamCount ||
    seam.activationOrder.length !== seamCount ||
    seam.colorRanges.length !== seam.colorCount * 2
  ) {
    errors.push('seam buffers disagree with the manifest.');
  }

  let expectedOffset = 0;
  for (let color = 0; color < seam.colorCount; color += 1) {
    const offset = seam.colorRanges[color * 2];
    const count = seam.colorRanges[color * 2 + 1];
    if (offset !== expectedOffset || count <= 0 || offset + count > seamCount) {
      errors.push('seam color ranges are empty, overlapping, or non-contiguous.');
      break;
    }
    const used = new Set<number>();
    for (let index = offset; index < offset + count; index += 1) {
      const first = seam.vertexPairs[index * 2];
      const second = seam.vertexPairs[index * 2 + 1];
      if (
        first >= simulation.manifest.particleCount ||
        second >= simulation.manifest.particleCount
      ) {
        errors.push('seam constraint references a particle outside the package.');
        break;
      }
      if (used.has(first) || used.has(second)) {
        errors.push('two seam constraints in one color write the same particle.');
        break;
      }
      used.add(first);
      used.add(second);
    }
    expectedOffset += count;
  }
  if (expectedOffset !== seamCount) errors.push('seam color ranges do not cover every constraint.');

  const activationOffsets = [...seam.activationOrder];
  if (
    activationOffsets.some((offset) => offset >= seamCount) ||
    new Set(activationOffsets).size !== seamCount
  ) {
    errors.push('seam activation order is not a permutation of constraint offsets.');
  }
  if (seam.targetLengthsM.some((length) => !Number.isFinite(length) || length !== 0)) {
    errors.push('equal seam target lengths must be finite zeroes.');
  }
  if (seam.seamIdIndices.some((index) => index >= seam.seamIds.length)) {
    errors.push('seam id index is outside the seam id table.');
  }
  const seamPreactivation = evaluateAllAtOnceSeamPreactivationV1(
    simulation.mesh.restPositionsInvMass,
    seam,
    1e-7,
  );
  if (!seamPreactivation.eligible) {
    errors.push(
      'all-at-once seam preactivation is ineligible: ' + seamPreactivation.rejectReason + '.',
    );
  }
  return [...new Set(errors)];
}

export function validateSimulationPackageV2(simulation: SimulationPackageV2): readonly string[] {
  const errors: string[] = [];
  if (simulation.manifest.schemaVersion !== SIMULATION_PACKAGE_V2_VERSION) {
    errors.push('schemaVersion is not the material-enabled package version.');
  }
  if (simulation.manifest.solverModel !== 'xpbd-distance-seam-material-v2') {
    errors.push('solverModel is not the material-enabled solver contract.');
  }

  errors.push(
    ...validateSimulationPackageV1({
      manifest: {
        schemaVersion: SIMULATION_PACKAGE_V1_VERSION,
        sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
        sourceMeshVersion: simulation.manifest.sourceMeshVersion,
        solverModel: 'xpbd-distance-seam-v1',
        units: simulation.manifest.units,
        particleCount: simulation.manifest.particleCount,
        triangleCount: simulation.manifest.triangleCount,
        distanceConstraintCount: simulation.manifest.distanceConstraintCount,
        distanceColorCount: simulation.manifest.distanceColorCount,
        seamConstraintCount: simulation.manifest.seamConstraintCount,
        seamColorCount: simulation.manifest.seamColorCount,
        pinnedParticleCount: simulation.manifest.pinnedParticleCount,
        estimatedRuntimeBytes:
          simulation.manifest.estimatedRuntimeBytes - simulation.manifest.materialBufferBytes,
        budgets: {
          maxParticles: simulation.manifest.budgets.maxParticles,
          maxDistanceConstraints: simulation.manifest.budgets.maxDistanceConstraints,
          maxSeamConstraints: simulation.manifest.budgets.maxSeamConstraints,
        },
      },
      restBoundsM: simulation.restBoundsM,
      mesh: simulation.mesh,
      constraints: simulation.constraints,
    }),
  );

  const material = simulation.material;
  if (
    simulation.manifest.materialPackageVersion !== MATERIAL_PACKAGE_VERSION ||
    material.manifest.schemaVersion !== MATERIAL_PACKAGE_VERSION
  ) {
    errors.push('material package version is unsupported.');
  }
  if (material.manifest.sourceMeshFingerprint !== simulation.manifest.sourceAssemblyFingerprint) {
    errors.push('material package source fingerprint disagrees with the simulation package.');
  }
  if (
    material.manifest.triangleCount !== simulation.manifest.triangleCount ||
    material.manifest.particleCount !== simulation.manifest.particleCount ||
    material.manifest.materialCount !== simulation.manifest.materialCount ||
    material.materialKeys.length !== simulation.manifest.materialCount
  ) {
    errors.push('material package counts disagree with the simulation manifest.');
  }

  const triangleCount = simulation.manifest.triangleCount;
  const particleCount = simulation.manifest.particleCount;
  const materialCount = simulation.manifest.materialCount;
  const abiLengthsInvalid =
    material.triangleIndices.byteLength !== triangleCount * TRIANGLE_INDICES_GPU_V1.strideBytes ||
    material.triangleMaterialIndices.byteLength !==
      triangleCount * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes ||
    material.triangleRestFrames.byteLength !==
      triangleCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes ||
    material.materialRecords.byteLength !== materialCount * CLOTH_MATERIAL_GPU_V1.strideBytes ||
    material.particleMassRecords.byteLength !== particleCount * PARTICLE_MASS_GPU_V1.strideBytes;
  if (abiLengthsInvalid) {
    errors.push('material GPU buffers disagree with their versioned ABI lengths.');
  }
  if (
    materialCount < 1 ||
    new Set(material.materialKeys).size !== material.materialKeys.length ||
    [...material.materialKeys]
      .sort((left, right) => left.localeCompare(right))
      .some((key, index) => key !== material.materialKeys[index])
  ) {
    errors.push('material key table must be non-empty, unique, and lexically ordered.');
  }

  const compiledMaterialBytes = materialBufferBytes(material);
  if (simulation.manifest.materialBufferBytes !== compiledMaterialBytes) {
    errors.push('materialBufferBytes disagrees with the compiled material buffers.');
  }
  if (
    materialCount > simulation.manifest.budgets.maxMaterials ||
    compiledMaterialBytes > simulation.manifest.budgets.maxMaterialBufferBytes
  ) {
    errors.push('material buffers exceed the declared package budgets.');
  }
  if (!Number.isFinite(simulation.manifest.totalMassKg) || simulation.manifest.totalMassKg <= 0) {
    errors.push('totalMassKg must be finite and positive.');
  } else {
    const decodedTotalMassKg = totalMassKg(material);
    const tolerance = Math.max(1e-9, decodedTotalMassKg * 1e-6);
    if (Math.abs(simulation.manifest.totalMassKg - decodedTotalMassKg) > tolerance) {
      errors.push('totalMassKg disagrees with the particle mass buffer.');
    }
  }

  if (!abiLengthsInvalid) {
    const triangleView = new DataView(material.triangleIndices);
    const indexView = new DataView(material.triangleMaterialIndices);
    const frameView = new DataView(material.triangleRestFrames);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const triangleBase = triangleIndex * TRIANGLE_INDICES_GPU_V1.strideBytes;
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = [
          TRIANGLE_INDICES_GPU_V1.offsets.vertex0,
          TRIANGLE_INDICES_GPU_V1.offsets.vertex1,
          TRIANGLE_INDICES_GPU_V1.offsets.vertex2,
        ][corner];
        if (
          triangleView.getUint32(triangleBase + offset, true) !==
          simulation.mesh.triangles[triangleIndex * 3 + corner]
        ) {
          errors.push('material triangle indices disagree with the simulation mesh.');
          break;
        }
      }
      const materialIndex = indexView.getUint32(
        triangleIndex * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
        true,
      );
      const frameMaterialIndex = frameView.getUint32(
        triangleIndex * TRIANGLE_REST_FRAME_GPU_V1.strideBytes +
          TRIANGLE_REST_FRAME_GPU_V1.offsets.materialIndex,
        true,
      );
      if (materialIndex >= materialCount || frameMaterialIndex !== materialIndex) {
        errors.push('triangle material index is invalid or disagrees with its rest frame.');
        break;
      }
    }
  }

  return [...new Set(errors)];
}

export function validateSimulationPackageV3(simulation: SimulationPackageV3): readonly string[] {
  const errors: string[] = [];
  if (simulation.manifest.schemaVersion !== SIMULATION_PACKAGE_V3_VERSION) {
    errors.push('schemaVersion is not the bend-enabled package version.');
  }
  if (simulation.manifest.solverModel !== 'xpbd-distance-seam-material-bend-v3') {
    errors.push('solverModel is not the bend-enabled solver contract.');
  }

  const bend = simulation.constraints.bend;
  errors.push(
    ...validateSimulationPackageV2({
      manifest: {
        schemaVersion: SIMULATION_PACKAGE_V2_VERSION,
        sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
        sourceMeshVersion: simulation.manifest.sourceMeshVersion,
        solverModel: 'xpbd-distance-seam-material-v2',
        units: simulation.manifest.units,
        particleCount: simulation.manifest.particleCount,
        triangleCount: simulation.manifest.triangleCount,
        distanceConstraintCount: simulation.manifest.distanceConstraintCount,
        distanceColorCount: simulation.manifest.distanceColorCount,
        seamConstraintCount: simulation.manifest.seamConstraintCount,
        seamColorCount: simulation.manifest.seamColorCount,
        pinnedParticleCount: simulation.manifest.pinnedParticleCount,
        materialPackageVersion: simulation.manifest.materialPackageVersion,
        materialCount: simulation.manifest.materialCount,
        totalMassKg: simulation.manifest.totalMassKg,
        materialBufferBytes: simulation.manifest.materialBufferBytes,
        estimatedRuntimeBytes: simulation.manifest.estimatedRuntimeBytes - bendRuntimeBytes(bend),
        budgets: {
          maxParticles: simulation.manifest.budgets.maxParticles,
          maxDistanceConstraints: simulation.manifest.budgets.maxDistanceConstraints,
          maxSeamConstraints: simulation.manifest.budgets.maxSeamConstraints,
          maxMaterials: simulation.manifest.budgets.maxMaterials,
          maxMaterialBufferBytes: simulation.manifest.budgets.maxMaterialBufferBytes,
        },
      },
      restBoundsM: simulation.restBoundsM,
      mesh: simulation.mesh,
      constraints: {
        distance: simulation.constraints.distance,
        seam: simulation.constraints.seam,
      },
      material: simulation.material,
    }),
  );

  const bendCount = simulation.manifest.bendConstraintCount;
  if (
    simulation.manifest.bendConstraintModel !== 'xpbd-signed-dihedral-v0' ||
    bend.model !== 'xpbd-signed-dihedral-v0'
  ) {
    errors.push('bend constraint model is unsupported.');
  }
  if (bendCount <= 0 || bend.constraintCount !== bendCount) {
    errors.push('bend constraint count is empty or disagrees with the manifest.');
  }
  if (bend.colorCount <= 0 || bend.colorCount !== simulation.manifest.bendColorCount) {
    errors.push('bend color count is empty or disagrees with the manifest.');
  }
  if (
    bend.vertexQuads.length !== bendCount * 4 ||
    bend.restAnglesRad.length !== bendCount ||
    bend.colorRanges.length !== bend.colorCount * 2
  ) {
    errors.push('bend buffers disagree with the manifest.');
  }

  const particleCount = simulation.manifest.particleCount;
  let expectedOffset = 0;
  for (let color = 0; color < bend.colorCount; color += 1) {
    const offset = bend.colorRanges[color * 2];
    const count = bend.colorRanges[color * 2 + 1];
    if (offset !== expectedOffset || count <= 0 || offset + count > bendCount) {
      errors.push('bend color ranges are empty, overlapping, or non-contiguous.');
      break;
    }
    const used = new Set<number>();
    for (let index = offset; index < offset + count; index += 1) {
      const quad = [
        bend.vertexQuads[index * 4],
        bend.vertexQuads[index * 4 + 1],
        bend.vertexQuads[index * 4 + 2],
        bend.vertexQuads[index * 4 + 3],
      ];
      if (quad.some((vertex) => vertex >= particleCount)) {
        errors.push('bend constraint references a particle outside the package.');
        break;
      }
      if (new Set(quad).size !== 4) {
        errors.push('bend constraint must reference four distinct particles.');
        break;
      }
      if (quad.some((vertex) => used.has(vertex))) {
        errors.push('two bend constraints in one color write the same particle.');
        break;
      }
      quad.forEach((vertex) => used.add(vertex));
    }
    expectedOffset += count;
  }
  if (expectedOffset !== bendCount) {
    errors.push('bend color ranges do not cover every constraint.');
  }
  if (bend.restAnglesRad.some((angle) => !Number.isFinite(angle) || Math.abs(angle) > Math.PI)) {
    errors.push('bend constraints contain an invalid signed rest angle.');
  }

  const compiledBendBytes = bendBufferBytes(bend);
  if (simulation.manifest.bendBufferBytes !== compiledBendBytes) {
    errors.push('bendBufferBytes disagrees with the compiled bend buffers.');
  }
  if (
    !Number.isSafeInteger(simulation.manifest.budgets.maxBendConstraints) ||
    simulation.manifest.budgets.maxBendConstraints < 1 ||
    !Number.isSafeInteger(simulation.manifest.budgets.maxBendBufferBytes) ||
    simulation.manifest.budgets.maxBendBufferBytes < 1
  ) {
    errors.push('bend budgets must be positive safe integers.');
  }
  if (
    bendCount > simulation.manifest.budgets.maxBendConstraints ||
    compiledBendBytes > simulation.manifest.budgets.maxBendBufferBytes
  ) {
    errors.push('bend buffers exceed the declared package budgets.');
  }
  if (
    particleCount > simulation.manifest.budgets.maxParticles ||
    simulation.manifest.distanceConstraintCount >
      simulation.manifest.budgets.maxDistanceConstraints ||
    simulation.manifest.seamConstraintCount > simulation.manifest.budgets.maxSeamConstraints
  ) {
    errors.push('base constraint counts exceed the declared package budgets.');
  }
  if (
    simulation.manifest.distanceColorCount !== simulation.constraints.distance.colorRanges.length
  ) {
    errors.push('distance color count disagrees with the manifest.');
  }

  const distance = simulation.constraints.distance;
  const seam = simulation.constraints.seam;
  const expectedRuntimeBytes =
    simulation.mesh.restPositionsInvMass.byteLength * 4 +
    simulation.mesh.triangles.byteLength +
    distance.vertexPairs.byteLength +
    distance.restLengthsM.byteLength * 2 +
    seam.vertexPairs.byteLength +
    seam.targetLengthsM.byteLength +
    seam.seamIdIndices.byteLength +
    seam.sourcePairIndices.byteLength +
    seam.colorRanges.byteLength +
    seam.activationOrder.byteLength +
    seam.constraintCount * Float32Array.BYTES_PER_ELEMENT +
    seam.constraintCount * Uint32Array.BYTES_PER_ELEMENT +
    materialBufferBytes(simulation.material) +
    bendRuntimeBytes(bend);
  if (simulation.manifest.estimatedRuntimeBytes !== expectedRuntimeBytes) {
    errors.push('estimatedRuntimeBytes disagrees with the versioned runtime buffers.');
  }

  return [...new Set(errors)];
}

export function validateSimulationPackageV4(simulation: SimulationPackageV4): readonly string[] {
  const errors: string[] = [];
  const strain = simulation.constraints.strain;
  if (simulation.manifest.schemaVersion !== SIMULATION_PACKAGE_V4_VERSION) {
    errors.push('schemaVersion is not the strain-enabled package version.');
  }
  if (simulation.manifest.solverModel !== 'xpbd-distance-seam-material-bend-strain-v4') {
    errors.push('solverModel is not the strain-enabled solver contract.');
  }

  const v3Projection: SimulationPackageV3 = {
    manifest: {
      schemaVersion: SIMULATION_PACKAGE_V3_VERSION,
      sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
      sourceMeshVersion: simulation.manifest.sourceMeshVersion,
      solverModel: 'xpbd-distance-seam-material-bend-v3',
      bendConstraintModel: simulation.manifest.bendConstraintModel,
      units: simulation.manifest.units,
      particleCount: simulation.manifest.particleCount,
      triangleCount: simulation.manifest.triangleCount,
      distanceConstraintCount: simulation.manifest.distanceConstraintCount,
      distanceColorCount: simulation.manifest.distanceColorCount,
      seamConstraintCount: simulation.manifest.seamConstraintCount,
      seamColorCount: simulation.manifest.seamColorCount,
      bendConstraintCount: simulation.manifest.bendConstraintCount,
      bendColorCount: simulation.manifest.bendColorCount,
      pinnedParticleCount: simulation.manifest.pinnedParticleCount,
      materialPackageVersion: simulation.manifest.materialPackageVersion,
      materialCount: simulation.manifest.materialCount,
      totalMassKg: simulation.manifest.totalMassKg,
      materialBufferBytes: simulation.manifest.materialBufferBytes,
      bendBufferBytes: simulation.manifest.bendBufferBytes,
      estimatedRuntimeBytes:
        simulation.manifest.estimatedRuntimeBytes - simulation.manifest.strainScheduleBufferBytes,
      budgets: {
        maxParticles: simulation.manifest.budgets.maxParticles,
        maxDistanceConstraints: simulation.manifest.budgets.maxDistanceConstraints,
        maxSeamConstraints: simulation.manifest.budgets.maxSeamConstraints,
        maxMaterials: simulation.manifest.budgets.maxMaterials,
        maxMaterialBufferBytes: simulation.manifest.budgets.maxMaterialBufferBytes,
        maxBendConstraints: simulation.manifest.budgets.maxBendConstraints,
        maxBendBufferBytes: simulation.manifest.budgets.maxBendBufferBytes,
      },
    },
    restBoundsM: simulation.restBoundsM,
    mesh: simulation.mesh,
    constraints: {
      distance: simulation.constraints.distance,
      seam: simulation.constraints.seam,
      bend: simulation.constraints.bend,
    },
    material: simulation.material,
  };
  errors.push(...validateSimulationPackageV3(v3Projection));
  errors.push(...validateTriangleStrainScheduleV1(strain, simulation.material));

  if (simulation.manifest.strainScheduleVersion !== TRIANGLE_STRAIN_SCHEDULE_VERSION) {
    errors.push('strain schedule version disagrees with the V4 contract.');
  }
  if (
    simulation.manifest.strainConstraintCount !== strain.constraintCount ||
    simulation.manifest.strainColorCount !== strain.colorCount
  ) {
    errors.push('strain counts disagree with the manifest.');
  }
  const compiledStrainBytes = triangleStrainScheduleBufferBytes(strain);
  if (
    simulation.manifest.strainScheduleBufferBytes !== compiledStrainBytes ||
    strain.bufferBytes !== compiledStrainBytes
  ) {
    errors.push('strainScheduleBufferBytes disagrees with the compiled strain buffers.');
  }
  if (simulation.manifest.materialRecordBytes !== simulation.material.materialRecords.byteLength) {
    errors.push('materialRecordBytes disagrees with the material records.');
  }
  if (
    simulation.manifest.particleMassBytes !== simulation.material.particleMassRecords.byteLength
  ) {
    errors.push('particleMassBytes disagrees with the particle mass records.');
  }

  const budgets = simulation.manifest.budgets;
  if (
    !Number.isSafeInteger(budgets.maxStrainConstraints) ||
    budgets.maxStrainConstraints < 1 ||
    !Number.isSafeInteger(budgets.maxStrainColors) ||
    budgets.maxStrainColors < 1 ||
    !Number.isSafeInteger(budgets.maxStrainScheduleBufferBytes) ||
    budgets.maxStrainScheduleBufferBytes < 1
  ) {
    errors.push('strain budgets must be positive safe integers.');
  }
  if (
    strain.constraintCount > budgets.maxStrainConstraints ||
    strain.colorCount > budgets.maxStrainColors ||
    compiledStrainBytes > budgets.maxStrainScheduleBufferBytes
  ) {
    errors.push('strain buffers exceed the declared package budgets.');
  }
  if (
    simulation.manifest.estimatedRuntimeBytes !==
    v3Projection.manifest.estimatedRuntimeBytes + compiledStrainBytes
  ) {
    errors.push('estimatedRuntimeBytes disagrees with the V3 package plus strain buffers.');
  }

  return [...new Set(errors)];
}

function arrayBufferRecordBytesEqual(
  left: ArrayBuffer,
  leftIndex: number,
  right: ArrayBuffer,
  rightIndex: number,
  strideBytes: number,
): boolean {
  const leftBytes = new Uint8Array(left, leftIndex * strideBytes, strideBytes);
  const rightBytes = new Uint8Array(right, rightIndex * strideBytes, strideBytes);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

/** Validates the single-formulation continuum V5 package and its V3-compatible base. */
export function validateSimulationPackageV5(simulation: SimulationPackageV5): readonly string[] {
  const errors: string[] = [];
  const continuum = simulation.constraints.continuumStrain;
  const compiledBytes = continuumStrainPackageBufferBytes(continuum);
  if (simulation.manifest.schemaVersion !== SIMULATION_PACKAGE_V5_VERSION) {
    errors.push('schemaVersion is not the continuum-strain package version.');
  }
  if (simulation.manifest.solverModel !== 'xpbd-distance-seam-material-bend-continuum-strain-v5') {
    errors.push('solverModel is not the continuum-strain solver contract.');
  }

  const v3Projection: SimulationPackageV3 = {
    manifest: {
      schemaVersion: SIMULATION_PACKAGE_V3_VERSION,
      sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
      sourceMeshVersion: simulation.manifest.sourceMeshVersion,
      solverModel: 'xpbd-distance-seam-material-bend-v3',
      bendConstraintModel: simulation.manifest.bendConstraintModel,
      units: simulation.manifest.units,
      particleCount: simulation.manifest.particleCount,
      triangleCount: simulation.manifest.triangleCount,
      distanceConstraintCount: simulation.manifest.distanceConstraintCount,
      distanceColorCount: simulation.manifest.distanceColorCount,
      seamConstraintCount: simulation.manifest.seamConstraintCount,
      seamColorCount: simulation.manifest.seamColorCount,
      bendConstraintCount: simulation.manifest.bendConstraintCount,
      bendColorCount: simulation.manifest.bendColorCount,
      pinnedParticleCount: simulation.manifest.pinnedParticleCount,
      materialPackageVersion: simulation.manifest.materialPackageVersion,
      materialCount: simulation.manifest.materialCount,
      totalMassKg: simulation.manifest.totalMassKg,
      materialBufferBytes: simulation.manifest.materialBufferBytes,
      bendBufferBytes: simulation.manifest.bendBufferBytes,
      estimatedRuntimeBytes: simulation.manifest.estimatedRuntimeBytes - compiledBytes,
      budgets: {
        maxParticles: simulation.manifest.budgets.maxParticles,
        maxDistanceConstraints: simulation.manifest.budgets.maxDistanceConstraints,
        maxSeamConstraints: simulation.manifest.budgets.maxSeamConstraints,
        maxMaterials: simulation.manifest.budgets.maxMaterials,
        maxMaterialBufferBytes: simulation.manifest.budgets.maxMaterialBufferBytes,
        maxBendConstraints: simulation.manifest.budgets.maxBendConstraints,
        maxBendBufferBytes: simulation.manifest.budgets.maxBendBufferBytes,
      },
    },
    restBoundsM: simulation.restBoundsM,
    mesh: simulation.mesh,
    constraints: {
      distance: simulation.constraints.distance,
      seam: simulation.constraints.seam,
      bend: simulation.constraints.bend,
    },
    material: simulation.material,
  };
  const v3Errors = validateSimulationPackageV3(v3Projection);
  errors.push(...v3Errors);

  if (
    simulation.manifest.continuumStrainVersion !== CONTINUUM_STRAIN_PACKAGE_V1_VERSION ||
    continuum.version !== CONTINUUM_STRAIN_PACKAGE_V1_VERSION ||
    continuum.model !== 'xpbd-sqrt-rest-area-green-strain-v1'
  ) {
    errors.push('continuum strain version or formulation model is unsupported.');
  }
  if (
    simulation.manifest.continuumFormulation !== 'sqrt-rest-area-green-strain' ||
    simulation.manifest.continuumComplianceUnits !== 'm/N' ||
    simulation.manifest.continuumLambdaUnits !== 'kg*m' ||
    simulation.manifest.continuumRestAreaUnits !== 'm^2'
  ) {
    errors.push('continuum strain SI unit declarations are invalid.');
  }
  if (
    continuum.constraintCount !== simulation.manifest.continuumConstraintCount ||
    continuum.constraintCount !== simulation.manifest.triangleCount ||
    continuum.colorCount !== simulation.manifest.continuumColorCount ||
    continuum.materialCount !== simulation.manifest.materialCount
  ) {
    errors.push('continuum counts disagree with the manifest or V4 topology.');
  }

  const expectedConstraintBytes =
    continuum.constraintCount * CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.strideBytes;
  const expectedMaterialBytes =
    continuum.materialCount * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes;
  const expectedMaterialIndexBytes =
    continuum.constraintCount * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes;
  const expectedLambdaBytes =
    continuum.constraintCount * CONTINUUM_STRAIN_LAMBDA_GPU_V1.strideBytes;
  const bufferLengthsAreValid =
    continuum.triangleIndices.byteLength ===
      continuum.constraintCount * TRIANGLE_INDICES_GPU_V1.strideBytes &&
    continuum.triangleRestFrames.byteLength ===
      continuum.constraintCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes &&
    continuum.constraintRecords.byteLength === expectedConstraintBytes &&
    continuum.materialIndices.byteLength === expectedMaterialIndexBytes &&
    continuum.colorRanges.byteLength === continuum.colorCount * 2 * Uint32Array.BYTES_PER_ELEMENT &&
    continuum.materialRecords.byteLength === expectedMaterialBytes &&
    continuum.lambdasKgM.byteLength === expectedLambdaBytes;
  if (!bufferLengthsAreValid) {
    errors.push('continuum buffer lengths disagree with record strides and counts.');
  }
  if (
    continuum.bufferBytes !== compiledBytes ||
    simulation.manifest.continuumStrainBufferBytes !== compiledBytes ||
    simulation.manifest.continuumConstraintRecordBytes !== expectedConstraintBytes ||
    simulation.manifest.continuumMaterialIndexBytes !== expectedMaterialIndexBytes ||
    simulation.manifest.continuumMaterialRecordBytes !== expectedMaterialBytes ||
    simulation.manifest.continuumLambdaBytes !== expectedLambdaBytes
  ) {
    errors.push('continuum byte accounting disagrees with the compiled buffers.');
  }

  if (
    continuum.materialKeys.length !== continuum.materialCount ||
    continuum.materialProvenance.length !== continuum.materialCount ||
    continuum.materialKeys.some((key, index) => key !== simulation.material.materialKeys[index]) ||
    continuum.materialProvenance.some(
      (provenance) =>
        provenance.sourceId.trim().length === 0 ||
        !['measured', 'estimated', 'uncalibrated-visual'].includes(provenance.calibrationStatus),
    )
  ) {
    errors.push('continuum material keys or provenance disagree with the base material order.');
  }

  if (bufferLengthsAreValid) {
    const constraintView = new DataView(continuum.constraintRecords);
    const frameView = new DataView(continuum.triangleRestFrames);
    const sourceMaterialView = new DataView(simulation.material.triangleMaterialIndices);
    const triangleView = new DataView(continuum.triangleIndices);
    const sourceIndices = new Set<number>();
    const renderIndices = new Set<number>();
    for (let index = 0; index < continuum.constraintCount; index += 1) {
      const constraintBase = index * CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.strideBytes;
      const sourceTriangleIndex = constraintView.getUint32(
        constraintBase + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.sourceTriangleIndex,
        true,
      );
      const renderTriangleIndex = constraintView.getUint32(
        constraintBase + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.renderTriangleIndex,
        true,
      );
      const metadataMaterialIndex = constraintView.getUint32(
        constraintBase + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.materialIndex,
        true,
      );
      const reserved = constraintView.getUint32(
        constraintBase + CONTINUUM_STRAIN_CONSTRAINT_GPU_V1.offsets.reserved,
        true,
      );
      const materialIndex = continuum.materialIndices[index];
      if (
        sourceTriangleIndex >= continuum.constraintCount ||
        renderTriangleIndex >= continuum.constraintCount
      ) {
        errors.push('continuum constraint mappings or material indices are invalid.');
        break;
      }
      const sourceMaterialIndex = sourceMaterialView.getUint32(
        sourceTriangleIndex * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
        true,
      );
      const frameBase = index * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
      const frameMaterialIndex = frameView.getUint32(
        frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.materialIndex,
        true,
      );
      if (
        renderTriangleIndex !== sourceTriangleIndex ||
        sourceIndices.has(sourceTriangleIndex) ||
        renderIndices.has(renderTriangleIndex) ||
        materialIndex !== sourceMaterialIndex ||
        metadataMaterialIndex !== materialIndex ||
        frameMaterialIndex !== materialIndex ||
        materialIndex >= continuum.materialCount ||
        reserved !== 0
      ) {
        errors.push('continuum constraint mappings or material indices are invalid.');
        break;
      }
      sourceIndices.add(sourceTriangleIndex);
      renderIndices.add(renderTriangleIndex);
      const frameError = continuumRestFrameValidationError(
        frameView,
        frameBase,
        continuum.materialCount,
      );
      if (frameError !== undefined) {
        errors.push('continuum rest frame is invalid: ' + frameError + '.');
        break;
      }
      if (
        !arrayBufferRecordBytesEqual(
          continuum.triangleIndices,
          index,
          simulation.material.triangleIndices,
          sourceTriangleIndex,
          TRIANGLE_INDICES_GPU_V1.strideBytes,
        ) ||
        !arrayBufferRecordBytesEqual(
          continuum.triangleRestFrames,
          index,
          simulation.material.triangleRestFrames,
          sourceTriangleIndex,
          TRIANGLE_REST_FRAME_GPU_V1.strideBytes,
        )
      ) {
        errors.push('continuum colored triangle/rest-frame order disagrees with source mapping.');
        break;
      }

      const triangleBase = index * TRIANGLE_INDICES_GPU_V1.strideBytes;
      const vertices = [
        triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, true),
        triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, true),
        triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, true),
      ];
      if (
        new Set(vertices).size !== 3 ||
        vertices.some((vertex) => vertex >= simulation.manifest.particleCount)
      ) {
        errors.push('continuum triangle indices are invalid.');
        break;
      }
    }

    let expectedOffset = 0;
    for (let color = 0; color < continuum.colorCount; color += 1) {
      const offset = continuum.colorRanges[color * 2];
      const count = continuum.colorRanges[color * 2 + 1];
      if (offset !== expectedOffset || count <= 0 || offset + count > continuum.constraintCount) {
        errors.push('continuum color ranges are empty, overlapping, or non-contiguous.');
        break;
      }
      const written = new Set<number>();
      for (let index = offset; index < offset + count; index += 1) {
        const triangleBase = index * TRIANGLE_INDICES_GPU_V1.strideBytes;
        for (const vertexOffset of [
          TRIANGLE_INDICES_GPU_V1.offsets.vertex0,
          TRIANGLE_INDICES_GPU_V1.offsets.vertex1,
          TRIANGLE_INDICES_GPU_V1.offsets.vertex2,
        ]) {
          const vertex = triangleView.getUint32(triangleBase + vertexOffset, true);
          if (written.has(vertex)) errors.push('one continuum color contains competing writes.');
          written.add(vertex);
        }
      }
      expectedOffset += count;
    }
    if (expectedOffset !== continuum.constraintCount) {
      errors.push('continuum color ranges do not cover every constraint.');
    }

    const materialView = new DataView(continuum.materialRecords);
    for (let index = 0; index < continuum.materialCount; index += 1) {
      const base = index * CONTINUUM_STRAIN_MATERIAL_GPU_V1.strideBytes;
      const compliances = [
        CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.warpComplianceMPerN,
        CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.weftComplianceMPerN,
        CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.shearComplianceMPerN,
      ].map((offset) => materialView.getFloat32(base + offset, true));
      const tag = materialView.getUint32(
        base + CONTINUUM_STRAIN_MATERIAL_GPU_V1.offsets.formulationTag,
        true,
      );
      if (
        compliances.some((value) => !Number.isFinite(value) || value <= 0) ||
        tag !== CONTINUUM_STRAIN_FORMULATION_TAG_V1
      ) {
        errors.push('continuum material record is invalid.');
        break;
      }
    }
  }
  for (let index = 0; index < continuum.constraintCount; index += 1) {
    const base = (index * CONTINUUM_STRAIN_LAMBDA_GPU_V1.strideBytes) / 4;
    if (
      continuum.lambdasKgM[base] !== 0 ||
      continuum.lambdasKgM[base + 1] !== 0 ||
      continuum.lambdasKgM[base + 2] !== 0 ||
      continuum.lambdasKgM[base + 3] !== 0
    ) {
      errors.push('continuum package lambdas must start as zero kg*m with a zero reserved lane.');
      break;
    }
  }

  const budgets = simulation.manifest.budgets;
  if (
    !Number.isSafeInteger(budgets.maxContinuumConstraints) ||
    budgets.maxContinuumConstraints < 1 ||
    !Number.isSafeInteger(budgets.maxContinuumColors) ||
    budgets.maxContinuumColors < 1 ||
    !Number.isSafeInteger(budgets.maxContinuumMaterials) ||
    budgets.maxContinuumMaterials < 1 ||
    !Number.isSafeInteger(budgets.maxContinuumBufferBytes) ||
    budgets.maxContinuumBufferBytes < 1
  ) {
    errors.push('continuum budgets must be positive safe integers.');
  }
  if (
    continuum.constraintCount > budgets.maxContinuumConstraints ||
    continuum.colorCount > budgets.maxContinuumColors ||
    continuum.materialCount > budgets.maxContinuumMaterials ||
    compiledBytes > budgets.maxContinuumBufferBytes
  ) {
    errors.push('continuum buffers exceed the declared package budgets.');
  }
  if (
    v3Errors.includes('estimatedRuntimeBytes disagrees with the versioned runtime buffers.') ||
    simulation.manifest.estimatedRuntimeBytes !==
      v3Projection.manifest.estimatedRuntimeBytes + compiledBytes
  ) {
    errors.push(
      'estimatedRuntimeBytes disagrees with the V3-compatible base plus continuum buffers.',
    );
  }

  return [...new Set(errors)];
}
