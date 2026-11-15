import type { MaterialAssignment } from '../domain/garment-assembly-ir';
import { type ClothMaterialV1, validateClothMaterialV1 } from '../material/cloth-material-v1';
import { type ClothMeshIR, validateClothMeshIR } from '../mesh/cloth-mesh-ir';
import { createTriangleRestFrame, type Vec2 } from '../runtime/cpu/triangle-strain-oracle';

export const MATERIAL_PACKAGE_VERSION = 'material-package/v1-experimental' as const;

export const TRIANGLE_INDICES_GPU_V1 = {
  version: 1,
  strideBytes: 16,
  offsets: { vertex0: 0, vertex1: 4, vertex2: 8, reserved: 12 },
} as const;

export const TRIANGLE_REST_FRAME_GPU_V1 = {
  version: 1,
  strideBytes: 32,
  offsets: {
    inverseDm00: 0,
    inverseDm01: 4,
    inverseDm10: 8,
    inverseDm11: 12,
    restAreaM2: 16,
    materialIndex: 20,
    reserved0: 24,
    reserved1: 28,
  },
} as const;

export const TRIANGLE_MATERIAL_INDEX_GPU_V1 = {
  version: 1,
  strideBytes: 4,
  offsets: { materialIndex: 0 },
} as const;

export const CLOTH_MATERIAL_GPU_V1 = {
  version: 1,
  strideBytes: 80,
  offsets: {
    warpStretchComplianceInvNm: 0,
    weftStretchComplianceInvNm: 4,
    shearComplianceInvNm: 8,
    warpBendComplianceInvNm: 12,
    weftBendComplianceInvNm: 16,
    staticFriction: 20,
    dynamicFriction: 24,
    velocityRetentionPerStep: 28,
    arealDensityKgM2: 32,
    collisionThicknessM: 36,
    reserved0: 40,
    reserved1: 44,
    minEdgeM: 48,
    maxEdgeM: 52,
    minDtS: 56,
    maxDtS: 60,
    minIterations: 64,
    maxIterations: 68,
    schemaTag: 72,
    provenanceFlags: 76,
  },
} as const;

export const PARTICLE_MASS_GPU_V1 = {
  version: 1,
  strideBytes: 8,
  offsets: { massKg: 0, inverseMassKgInv: 4 },
} as const;

export const MATERIAL_PROVENANCE_FLAGS = {
  uncalibratedVisual: 1 << 0,
  measured: 1 << 1,
  estimated: 1 << 2,
} as const;

export type MaterialPieceGrain = {
  readonly pieceId: string;
  readonly grainDegrees: number;
};

export type CompileMaterialPackageOptions = {
  readonly dtS: number;
  readonly solverIterations: number;
  /** Must be consciously enabled for the visual-only presets. */
  readonly allowUncalibratedVisual: boolean;
};

export type MaterialPackageDiagnosticCode =
  | 'ambiguous-material-assignment'
  | 'degenerate-triangle'
  | 'duplicate-material'
  | 'duplicate-piece-grain'
  | 'invalid-assignment'
  | 'invalid-material'
  | 'invalid-mesh'
  | 'invalid-piece-grain'
  | 'invalid-piece-range'
  | 'invalid-solver-options'
  | 'material-revision-mismatch'
  | 'missing-material'
  | 'missing-material-assignment'
  | 'missing-piece-grain'
  | 'solver-range-rejection'
  | 'uncalibrated-material-refused'
  | 'unreferenced-particle';

export type MaterialPackageDiagnostic = {
  readonly severity: 'error';
  readonly code: MaterialPackageDiagnosticCode;
  readonly message: string;
  readonly sourceId?: string;
  readonly triangleIndex?: number;
};

export type CompiledMaterialPackageV1 = {
  readonly manifest: {
    readonly schemaVersion: typeof MATERIAL_PACKAGE_VERSION;
    readonly sourceMeshFingerprint: string;
    readonly triangleCount: number;
    readonly particleCount: number;
    readonly materialCount: number;
    readonly units: 'm-kg-s';
    readonly solver: {
      readonly dtS: number;
      readonly iterations: number;
    };
  };
  /** Lexical material id/revision table addressed by triangle materialIndex. */
  readonly materialKeys: readonly string[];
  readonly triangleIndices: ArrayBuffer;
  /** One u32 material table index per triangle, in mesh triangle order. */
  readonly triangleMaterialIndices: ArrayBuffer;
  readonly triangleRestFrames: ArrayBuffer;
  readonly materialRecords: ArrayBuffer;
  /** Lumped area mass and its reciprocal; pin/support policy is deliberately not applied here. */
  readonly particleMassRecords: ArrayBuffer;
};

export type CompileMaterialPackageResult =
  | {
      readonly ok: true;
      readonly materialPackage: CompiledMaterialPackageV1;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly MaterialPackageDiagnostic[];
    };

export type DecodedTriangleRestFrameGpuV1 = {
  readonly inverseRestMatrixInvM: readonly [number, number, number, number];
  readonly restAreaM2: number;
  readonly materialIndex: number;
};

export type DecodedParticleMassGpuV1 = {
  readonly massKg: number;
  readonly inverseMassKgInv: number;
};

export type DecodedClothMaterialGpuV1 = {
  readonly stretchComplianceInvNm: { readonly warp: number; readonly weft: number };
  readonly shearComplianceInvNm: number;
  readonly bendComplianceInvNm: { readonly warp: number; readonly weft: number };
  readonly staticFriction: number;
  readonly dynamicFriction: number;
  readonly velocityRetentionPerStep: number;
  readonly arealDensityKgM2: number;
  readonly collisionThicknessM: number;
  readonly validSolverRange: {
    readonly minEdgeM: number;
    readonly maxEdgeM: number;
    readonly minDtS: number;
    readonly maxDtS: number;
    readonly minIterations: number;
    readonly maxIterations: number;
  };
  readonly schemaTag: number;
  readonly provenanceFlags: number;
};

function diagnostic(
  code: MaterialPackageDiagnosticCode,
  message: string,
  sourceId?: string,
  triangleIndex?: number,
): MaterialPackageDiagnostic {
  return { severity: 'error', code, message, sourceId, triangleIndex };
}

function materialKey(material: Pick<ClothMaterialV1, 'id' | 'revision'>): string {
  return material.id + '@' + material.revision;
}

function assignmentKey(assignment: MaterialAssignment): string {
  return assignment.id + '@' + assignment.materialRevision;
}

function provenanceFlags(material: ClothMaterialV1): number {
  switch (material.provenance.calibrationStatus) {
    case 'uncalibrated-visual':
      return MATERIAL_PROVENANCE_FLAGS.uncalibratedVisual;
    case 'measured':
      return MATERIAL_PROVENANCE_FLAGS.measured;
    case 'estimated':
      return MATERIAL_PROVENANCE_FLAGS.estimated;
  }
}

function writeMaterialRecord(view: DataView, base: number, material: ClothMaterialV1): void {
  const offsets = CLOTH_MATERIAL_GPU_V1.offsets;
  const f32 = (offset: number, value: number) => view.setFloat32(base + offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(base + offset, value, true);
  f32(offsets.warpStretchComplianceInvNm, material.stretchComplianceInvNm.warp);
  f32(offsets.weftStretchComplianceInvNm, material.stretchComplianceInvNm.weft);
  f32(offsets.shearComplianceInvNm, material.shearComplianceInvNm);
  f32(offsets.warpBendComplianceInvNm, material.bendComplianceInvNm.warp);
  f32(offsets.weftBendComplianceInvNm, material.bendComplianceInvNm.weft);
  f32(offsets.staticFriction, material.friction.staticCoefficient);
  f32(offsets.dynamicFriction, material.friction.dynamicCoefficient);
  f32(offsets.velocityRetentionPerStep, material.damping.velocityRetentionPerStep);
  f32(offsets.arealDensityKgM2, material.mass.arealDensityKgM2);
  f32(offsets.collisionThicknessM, material.collision.thicknessM);
  f32(offsets.reserved0, 0);
  f32(offsets.reserved1, 0);
  f32(offsets.minEdgeM, material.validSolverRange.minEdgeM);
  f32(offsets.maxEdgeM, material.validSolverRange.maxEdgeM);
  f32(offsets.minDtS, material.validSolverRange.minDtS);
  f32(offsets.maxDtS, material.validSolverRange.maxDtS);
  u32(offsets.minIterations, material.validSolverRange.minIterations);
  u32(offsets.maxIterations, material.validSolverRange.maxIterations);
  u32(offsets.schemaTag, CLOTH_MATERIAL_GPU_V1.version);
  u32(offsets.provenanceFlags, provenanceFlags(material));
}

function edgeLengthsM(points: readonly [Vec2, Vec2, Vec2]): readonly [number, number, number] {
  const length = (left: Vec2, right: Vec2) => Math.hypot(right[0] - left[0], right[1] - left[1]);
  return [length(points[0], points[1]), length(points[1], points[2]), length(points[2], points[0])];
}

function solverOptionsAreValid(options: CompileMaterialPackageOptions): boolean {
  return (
    Number.isFinite(options.dtS) &&
    options.dtS > 0 &&
    Number.isSafeInteger(options.solverIterations) &&
    options.solverIterations > 0 &&
    typeof options.allowUncalibratedVisual === 'boolean'
  );
}

/**
 * Compiles material/grain GPU inputs without mutating or depending on SimulationPackage. It fails
 * atomically: no partially valid buffers are returned with diagnostics.
 */
export function compileMaterialPackageV1(
  mesh: ClothMeshIR,
  pieceGrains: readonly MaterialPieceGrain[],
  assignments: readonly MaterialAssignment[],
  materials: readonly ClothMaterialV1[],
  options: CompileMaterialPackageOptions,
): CompileMaterialPackageResult {
  const diagnostics: MaterialPackageDiagnostic[] = [];
  if (!solverOptionsAreValid(options)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'invalid-solver-options',
          'dtS and solverIterations must be positive; visual-preset policy must be explicit.',
        ),
      ],
    };
  }
  for (const error of validateClothMeshIR(mesh)) {
    diagnostics.push(diagnostic('invalid-mesh', error));
  }

  const triangleCount = mesh.triangles.length / 3;
  const particleCount = mesh.restPositions2Mm.length / 2;
  const pieceByTriangle = new Array<string | undefined>(triangleCount);
  const pieceIds = new Set<string>();
  for (const range of mesh.pieceRanges) {
    if (
      pieceIds.has(range.pieceId) ||
      !Number.isSafeInteger(range.triangleOffset) ||
      !Number.isSafeInteger(range.triangleCount) ||
      !Number.isSafeInteger(range.vertexOffset) ||
      !Number.isSafeInteger(range.vertexCount) ||
      range.triangleOffset < 0 ||
      range.triangleCount < 1 ||
      range.vertexOffset < 0 ||
      range.vertexCount < 1 ||
      range.vertexOffset + range.vertexCount > particleCount ||
      range.triangleOffset + range.triangleCount > triangleCount
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-piece-range',
          'Piece range is duplicate or outside triangle bounds.',
          range.pieceId,
        ),
      );
      continue;
    }
    pieceIds.add(range.pieceId);
    for (
      let triangleIndex = range.triangleOffset;
      triangleIndex < range.triangleOffset + range.triangleCount;
      triangleIndex += 1
    ) {
      if (pieceByTriangle[triangleIndex] !== undefined) {
        diagnostics.push(
          diagnostic(
            'invalid-piece-range',
            'Piece triangle ranges overlap.',
            range.pieceId,
            triangleIndex,
          ),
        );
      } else {
        pieceByTriangle[triangleIndex] = range.pieceId;
      }
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = mesh.triangles[triangleIndex * 3 + corner];
        if (vertex < range.vertexOffset || vertex >= range.vertexOffset + range.vertexCount) {
          diagnostics.push(
            diagnostic(
              'invalid-piece-range',
              'Piece triangle references a vertex outside its vertex range.',
              range.pieceId,
              triangleIndex,
            ),
          );
        }
      }
    }
  }
  if (pieceByTriangle.some((pieceId) => pieceId === undefined)) {
    diagnostics.push(
      diagnostic('invalid-piece-range', 'Piece ranges must cover every triangle exactly once.'),
    );
  }

  const grainByPiece = new Map<string, number>();
  for (const grain of pieceGrains) {
    if (grainByPiece.has(grain.pieceId)) {
      diagnostics.push(
        diagnostic(
          'duplicate-piece-grain',
          'Piece has more than one grain definition.',
          grain.pieceId,
        ),
      );
    } else if (!Number.isFinite(grain.grainDegrees)) {
      diagnostics.push(
        diagnostic('invalid-piece-grain', 'grainDegrees must be finite.', grain.pieceId),
      );
    } else {
      grainByPiece.set(grain.pieceId, grain.grainDegrees);
    }
  }
  for (const pieceId of pieceIds) {
    if (!grainByPiece.has(pieceId)) {
      diagnostics.push(
        diagnostic('missing-piece-grain', 'Piece has no grain definition.', pieceId),
      );
    }
  }
  for (const pieceId of grainByPiece.keys()) {
    if (!pieceIds.has(pieceId)) {
      diagnostics.push(
        diagnostic('invalid-piece-grain', 'Grain references a piece outside the mesh.', pieceId),
      );
    }
  }

  const materialsByKey = new Map<string, ClothMaterialV1>();
  for (const material of materials) {
    const key = materialKey(material);
    if (materialsByKey.has(key)) {
      diagnostics.push(
        diagnostic('duplicate-material', 'Material id/revision is duplicated.', key),
      );
      continue;
    }
    const materialErrors = validateClothMaterialV1(material);
    if (materialErrors.length > 0) {
      diagnostics.push(
        diagnostic(
          'invalid-material',
          'Material validation failed: ' + materialErrors.join(' '),
          key,
        ),
      );
    }
    if (
      material.provenance.calibrationStatus === 'uncalibrated-visual' &&
      !options.allowUncalibratedVisual
    ) {
      diagnostics.push(
        diagnostic(
          'uncalibrated-material-refused',
          'Visual-only material requires allowUncalibratedVisual.',
          key,
        ),
      );
    }
    materialsByKey.set(key, material);
  }

  const assignmentByPiece = new Map<string, MaterialAssignment>();
  const assignmentKeys = new Set<string>();
  for (const assignment of assignments) {
    const key = assignmentKey(assignment);
    if (assignmentKeys.has(key)) {
      diagnostics.push(
        diagnostic('invalid-assignment', 'Material assignment id/revision is duplicated.', key),
      );
    }
    assignmentKeys.add(key);
    if (assignment.id.trim().length === 0 || assignment.materialRevision.trim().length === 0) {
      diagnostics.push(
        diagnostic('invalid-assignment', 'Assignment id and materialRevision must not be empty.'),
      );
    }
    if (assignment.pieceIds.length === 0) {
      diagnostics.push(
        diagnostic('invalid-assignment', 'Assignment must own at least one piece.', assignment.id),
      );
    }
    const localPieces = new Set<string>();
    for (const pieceId of assignment.pieceIds) {
      if (!pieceIds.has(pieceId) || localPieces.has(pieceId)) {
        diagnostics.push(
          diagnostic(
            'invalid-assignment',
            'Assignment references an unknown or duplicate piece.',
            assignment.id + '/' + pieceId,
          ),
        );
        continue;
      }
      localPieces.add(pieceId);
      if (assignmentByPiece.has(pieceId)) {
        diagnostics.push(
          diagnostic(
            'ambiguous-material-assignment',
            'Piece is owned by more than one material assignment.',
            pieceId,
          ),
        );
      } else {
        assignmentByPiece.set(pieceId, assignment);
      }
    }
    const sameIdMaterials = materials.filter((material) => material.id === assignment.id);
    if (sameIdMaterials.length === 0) {
      diagnostics.push(
        diagnostic(
          'missing-material',
          'Assignment has no matching material id.',
          assignmentKey(assignment),
        ),
      );
    } else if (!materialsByKey.has(assignmentKey(assignment))) {
      diagnostics.push(
        diagnostic(
          'material-revision-mismatch',
          'Assignment revision does not match an available material revision.',
          assignmentKey(assignment),
        ),
      );
    }
  }
  for (const pieceId of pieceIds) {
    if (!assignmentByPiece.has(pieceId)) {
      diagnostics.push(
        diagnostic('missing-material-assignment', 'Piece has no material assignment.', pieceId),
      );
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const usedMaterialsByKey = new Map<string, ClothMaterialV1>();
  for (const assignment of assignmentByPiece.values()) {
    const key = assignmentKey(assignment);
    usedMaterialsByKey.set(key, materialsByKey.get(key)!);
  }
  const orderedMaterialKeys = [...usedMaterialsByKey.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const materialIndices = new Map(orderedMaterialKeys.map((key, index) => [key, index]));

  const triangleIndices = new ArrayBuffer(triangleCount * TRIANGLE_INDICES_GPU_V1.strideBytes);
  const triangleMaterialIndices = new ArrayBuffer(
    triangleCount * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
  );
  const triangleRestFrames = new ArrayBuffer(
    triangleCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes,
  );
  const indexView = new DataView(triangleIndices);
  const materialIndexView = new DataView(triangleMaterialIndices);
  const frameView = new DataView(triangleRestFrames);
  const accumulatedMassKg = new Float64Array(particleCount);

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const pieceId = pieceByTriangle[triangleIndex]!;
    const assignment = assignmentByPiece.get(pieceId)!;
    const material = materialsByKey.get(assignmentKey(assignment))!;
    const materialIndex = materialIndices.get(assignmentKey(assignment))!;
    const vertices = [
      mesh.triangles[triangleIndex * 3],
      mesh.triangles[triangleIndex * 3 + 1],
      mesh.triangles[triangleIndex * 3 + 2],
    ] as const;
    const pointsM = vertices.map(
      (vertex): Vec2 => [
        mesh.restPositions2Mm[vertex * 2] * 0.001,
        mesh.restPositions2Mm[vertex * 2 + 1] * 0.001,
      ],
    ) as unknown as readonly [Vec2, Vec2, Vec2];
    const radians = (grainByPiece.get(pieceId)! * Math.PI) / 180;
    let frame;
    try {
      frame = createTriangleRestFrame(pointsM, [Math.cos(radians), Math.sin(radians)]);
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'degenerate-triangle',
          error instanceof Error ? error.message : 'Rest frame construction failed.',
          pieceId,
          triangleIndex,
        ),
      );
      continue;
    }

    const lengths = edgeLengthsM(pointsM);
    const range = material.validSolverRange;
    if (
      options.dtS < range.minDtS ||
      options.dtS > range.maxDtS ||
      options.solverIterations < range.minIterations ||
      options.solverIterations > range.maxIterations ||
      lengths.some((length) => length < range.minEdgeM || length > range.maxEdgeM)
    ) {
      diagnostics.push(
        diagnostic(
          'solver-range-rejection',
          'Triangle edge length, dt or iteration count is outside the material validSolverRange.',
          assignmentKey(assignment),
          triangleIndex,
        ),
      );
      continue;
    }

    const indexBase = triangleIndex * TRIANGLE_INDICES_GPU_V1.strideBytes;
    indexView.setUint32(indexBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, vertices[0], true);
    indexView.setUint32(indexBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, vertices[1], true);
    indexView.setUint32(indexBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, vertices[2], true);
    indexView.setUint32(indexBase + TRIANGLE_INDICES_GPU_V1.offsets.reserved, 0, true);
    materialIndexView.setUint32(
      triangleIndex * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes +
        TRIANGLE_MATERIAL_INDEX_GPU_V1.offsets.materialIndex,
      materialIndex,
      true,
    );

    const frameBase = triangleIndex * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
    const inverse = frame.inverseRestMatrixInvM;
    frameView.setFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm00,
      inverse[0],
      true,
    );
    frameView.setFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm01,
      inverse[1],
      true,
    );
    frameView.setFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm10,
      inverse[2],
      true,
    );
    frameView.setFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm11,
      inverse[3],
      true,
    );
    frameView.setFloat32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.restAreaM2,
      frame.restAreaM2,
      true,
    );
    frameView.setUint32(
      frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.materialIndex,
      materialIndex,
      true,
    );
    frameView.setUint32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.reserved0, 0, true);
    frameView.setUint32(frameBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.reserved1, 0, true);

    const shareKg = (frame.restAreaM2 * material.mass.arealDensityKgM2) / 3;
    for (const vertex of vertices) accumulatedMassKg[vertex] += shareKg;
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const materialRecords = new ArrayBuffer(
    orderedMaterialKeys.length * CLOTH_MATERIAL_GPU_V1.strideBytes,
  );
  const materialView = new DataView(materialRecords);
  orderedMaterialKeys.forEach((key, index) => {
    writeMaterialRecord(
      materialView,
      index * CLOTH_MATERIAL_GPU_V1.strideBytes,
      usedMaterialsByKey.get(key)!,
    );
  });

  const particleMassRecords = new ArrayBuffer(particleCount * PARTICLE_MASS_GPU_V1.strideBytes);
  const massView = new DataView(particleMassRecords);
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const massKg = accumulatedMassKg[particleIndex];
    if (!Number.isFinite(massKg) || massKg <= 0) {
      diagnostics.push(
        diagnostic(
          'unreferenced-particle',
          'Every particle must receive positive lumped area mass.',
          String(particleIndex),
        ),
      );
      continue;
    }
    const base = particleIndex * PARTICLE_MASS_GPU_V1.strideBytes;
    massView.setFloat32(base + PARTICLE_MASS_GPU_V1.offsets.massKg, massKg, true);
    massView.setFloat32(base + PARTICLE_MASS_GPU_V1.offsets.inverseMassKgInv, 1 / massKg, true);
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    diagnostics: [],
    materialPackage: {
      manifest: {
        schemaVersion: MATERIAL_PACKAGE_VERSION,
        sourceMeshFingerprint: mesh.sourceAssemblyFingerprint,
        triangleCount,
        particleCount,
        materialCount: orderedMaterialKeys.length,
        units: 'm-kg-s',
        solver: { dtS: options.dtS, iterations: options.solverIterations },
      },
      materialKeys: orderedMaterialKeys,
      triangleIndices,
      triangleMaterialIndices,
      triangleRestFrames,
      materialRecords,
      particleMassRecords,
    },
  };
}

export function decodeTriangleRestFrameGpuV1(
  buffer: ArrayBuffer,
  recordIndex: number,
): DecodedTriangleRestFrameGpuV1 {
  const base = recordIndex * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
  if (!Number.isSafeInteger(recordIndex) || recordIndex < 0 || base + 32 > buffer.byteLength) {
    throw new RangeError('Triangle rest-frame recordIndex is outside the buffer.');
  }
  const view = new DataView(buffer);
  const offsets = TRIANGLE_REST_FRAME_GPU_V1.offsets;
  return {
    inverseRestMatrixInvM: [
      view.getFloat32(base + offsets.inverseDm00, true),
      view.getFloat32(base + offsets.inverseDm01, true),
      view.getFloat32(base + offsets.inverseDm10, true),
      view.getFloat32(base + offsets.inverseDm11, true),
    ],
    restAreaM2: view.getFloat32(base + offsets.restAreaM2, true),
    materialIndex: view.getUint32(base + offsets.materialIndex, true),
  };
}

export function decodeParticleMassGpuV1(
  buffer: ArrayBuffer,
  recordIndex: number,
): DecodedParticleMassGpuV1 {
  const base = recordIndex * PARTICLE_MASS_GPU_V1.strideBytes;
  if (!Number.isSafeInteger(recordIndex) || recordIndex < 0 || base + 8 > buffer.byteLength) {
    throw new RangeError('Particle mass recordIndex is outside the buffer.');
  }
  const view = new DataView(buffer);
  return {
    massKg: view.getFloat32(base + PARTICLE_MASS_GPU_V1.offsets.massKg, true),
    inverseMassKgInv: view.getFloat32(base + PARTICLE_MASS_GPU_V1.offsets.inverseMassKgInv, true),
  };
}

export function decodeClothMaterialGpuV1(
  buffer: ArrayBuffer,
  recordIndex: number,
): DecodedClothMaterialGpuV1 {
  const base = recordIndex * CLOTH_MATERIAL_GPU_V1.strideBytes;
  if (
    !Number.isSafeInteger(recordIndex) ||
    recordIndex < 0 ||
    base + CLOTH_MATERIAL_GPU_V1.strideBytes > buffer.byteLength
  ) {
    throw new RangeError('Cloth material recordIndex is outside the buffer.');
  }
  const view = new DataView(buffer);
  const offsets = CLOTH_MATERIAL_GPU_V1.offsets;
  const f32 = (offset: number) => view.getFloat32(base + offset, true);
  const u32 = (offset: number) => view.getUint32(base + offset, true);
  return {
    stretchComplianceInvNm: {
      warp: f32(offsets.warpStretchComplianceInvNm),
      weft: f32(offsets.weftStretchComplianceInvNm),
    },
    shearComplianceInvNm: f32(offsets.shearComplianceInvNm),
    bendComplianceInvNm: {
      warp: f32(offsets.warpBendComplianceInvNm),
      weft: f32(offsets.weftBendComplianceInvNm),
    },
    staticFriction: f32(offsets.staticFriction),
    dynamicFriction: f32(offsets.dynamicFriction),
    velocityRetentionPerStep: f32(offsets.velocityRetentionPerStep),
    arealDensityKgM2: f32(offsets.arealDensityKgM2),
    collisionThicknessM: f32(offsets.collisionThicknessM),
    validSolverRange: {
      minEdgeM: f32(offsets.minEdgeM),
      maxEdgeM: f32(offsets.maxEdgeM),
      minDtS: f32(offsets.minDtS),
      maxDtS: f32(offsets.maxDtS),
      minIterations: u32(offsets.minIterations),
      maxIterations: u32(offsets.maxIterations),
    },
    schemaTag: u32(offsets.schemaTag),
    provenanceFlags: u32(offsets.provenanceFlags),
  };
}
