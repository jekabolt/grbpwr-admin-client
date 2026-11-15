import {
  MATERIAL_PACKAGE_VERSION,
  TRIANGLE_INDICES_GPU_V1,
  TRIANGLE_MATERIAL_INDEX_GPU_V1,
  TRIANGLE_REST_FRAME_GPU_V1,
  type CompiledMaterialPackageV1,
} from './material-package';

export const TRIANGLE_STRAIN_SCHEDULE_VERSION = 'triangle-strain-schedule/v1' as const;

export const TRIANGLE_STRAIN_COLOR_RANGE_GPU_V1 = {
  version: 1,
  strideBytes: 8,
  offsets: { offset: 0, count: 4 },
} as const;

export const TRIANGLE_STRAIN_INDEX_MAPPING_GPU_V1 = {
  version: 1,
  strideBytes: 4,
  offsets: { triangleIndex: 0 },
} as const;

export const TRIANGLE_STRAIN_LAMBDA_GPU_V1 = {
  version: 1,
  strideBytes: 16,
  offsets: { warp: 0, weft: 4, shear: 8, reserved: 12 },
} as const;

export type TriangleStrainScheduleDiagnosticCode =
  | 'buffer-budget-exceeded'
  | 'color-budget-exceeded'
  | 'constraint-budget-exceeded'
  | 'invalid-material-package'
  | 'invalid-triangle';

export type TriangleStrainScheduleDiagnostic = {
  readonly severity: 'error';
  readonly code: TriangleStrainScheduleDiagnosticCode;
  readonly message: string;
  readonly triangleIndex?: number;
};

export type CompileTriangleStrainScheduleOptions = {
  readonly maxConstraints?: number;
  readonly maxColors?: number;
  readonly maxBufferBytes?: number;
};

/**
 * GPU inputs grouped by graph color. A dispatch covers one color range, so no two invocations in
 * that dispatch write the same particle. `sourceTriangleIndices` and `renderTriangleIndices` map a
 * scheduled constraint back to the original material/mesh order; they are deliberately separate
 * contracts even though both are identity mappings for MaterialPackageV1.
 */
export type CompiledTriangleStrainScheduleV1 = {
  readonly version: typeof TRIANGLE_STRAIN_SCHEDULE_VERSION;
  readonly model: 'xpbd-anisotropic-triangle-strain-v1';
  readonly sourceMaterialPackageVersion: typeof MATERIAL_PACKAGE_VERSION;
  readonly constraintCount: number;
  readonly colorCount: number;
  readonly bufferBytes: number;
  readonly triangleIndices: ArrayBuffer;
  readonly triangleMaterialIndices: ArrayBuffer;
  readonly triangleRestFrames: ArrayBuffer;
  readonly sourceTriangleIndices: Uint32Array;
  readonly renderTriangleIndices: Uint32Array;
  /** Consecutive [offset, count] pairs, one pair per graph color. */
  readonly colorRanges: Uint32Array;
  /** Consecutive [warp, weft, shear, reserved] f32 values. Reset to zero per substep. */
  readonly lambdas: Float32Array;
};

export type CompileTriangleStrainScheduleResult =
  | {
      readonly ok: true;
      readonly schedule: CompiledTriangleStrainScheduleV1;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly TriangleStrainScheduleDiagnostic[];
    };

type SourceTriangle = {
  readonly sourceIndex: number;
  readonly vertices: readonly [number, number, number];
};

const DEFAULT_MAX_CONSTRAINTS = 60_000;
const DEFAULT_MAX_COLORS = 4_096;
const DEFAULT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

function diagnostic(
  code: TriangleStrainScheduleDiagnosticCode,
  message: string,
  triangleIndex?: number,
): TriangleStrainScheduleDiagnostic {
  return { severity: 'error', code, message, triangleIndex };
}

function positiveSafeBudget(value: number | undefined, fallback: number): number | undefined {
  const resolved = value ?? fallback;
  return Number.isSafeInteger(resolved) && resolved > 0 ? resolved : undefined;
}

function expectedMaterialBufferLengths(material: CompiledMaterialPackageV1): readonly string[] {
  const triangleCount = material.manifest.triangleCount;
  const errors: string[] = [];
  if (material.manifest.schemaVersion !== MATERIAL_PACKAGE_VERSION) {
    errors.push('material package schemaVersion is unsupported');
  }
  if (!Number.isSafeInteger(triangleCount) || triangleCount < 1) {
    errors.push('triangleCount must be a positive safe integer');
  }
  if (
    !Number.isSafeInteger(material.manifest.particleCount) ||
    material.manifest.particleCount < 1
  ) {
    errors.push('particleCount must be a positive safe integer');
  }
  if (material.triangleIndices.byteLength !== triangleCount * TRIANGLE_INDICES_GPU_V1.strideBytes) {
    errors.push('triangleIndices byte length disagrees with triangleCount');
  }
  if (
    material.triangleMaterialIndices.byteLength !==
    triangleCount * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes
  ) {
    errors.push('triangleMaterialIndices byte length disagrees with triangleCount');
  }
  if (
    material.triangleRestFrames.byteLength !==
    triangleCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes
  ) {
    errors.push('triangleRestFrames byte length disagrees with triangleCount');
  }
  return errors;
}

function groupByColor(source: readonly SourceTriangle[]): {
  readonly grouped: readonly SourceTriangle[];
  readonly colorRanges: Uint32Array;
} {
  const colorsAtVertex = new Map<number, Set<number>>();
  const colorsFor = (vertex: number): Set<number> => {
    const existing = colorsAtVertex.get(vertex);
    if (existing !== undefined) return existing;
    const colors = new Set<number>();
    colorsAtVertex.set(vertex, colors);
    return colors;
  };
  const colors: SourceTriangle[][] = [];

  for (const triangle of source) {
    const occupied = triangle.vertices.map(colorsFor);
    let color = 0;
    while (occupied.some((used) => used.has(color))) color += 1;
    colors[color] ??= [];
    colors[color].push(triangle);
    occupied.forEach((used) => used.add(color));
  }

  const colorRanges = new Uint32Array(colors.length * 2);
  let offset = 0;
  colors.forEach((triangles, color) => {
    colorRanges[color * 2] = offset;
    colorRanges[color * 2 + 1] = triangles.length;
    offset += triangles.length;
  });
  return { grouped: colors.flat(), colorRanges };
}

function copyRecord(
  source: ArrayBuffer,
  sourceIndex: number,
  target: ArrayBuffer,
  targetIndex: number,
  strideBytes: number,
): void {
  new Uint8Array(target, targetIndex * strideBytes, strideBytes).set(
    new Uint8Array(source, sourceIndex * strideBytes, strideBytes),
  );
}

function recordsEqual(
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

export function triangleStrainScheduleBufferBytes(
  schedule: Pick<
    CompiledTriangleStrainScheduleV1,
    | 'triangleIndices'
    | 'triangleMaterialIndices'
    | 'triangleRestFrames'
    | 'sourceTriangleIndices'
    | 'renderTriangleIndices'
    | 'colorRanges'
    | 'lambdas'
  >,
): number {
  return (
    schedule.triangleIndices.byteLength +
    schedule.triangleMaterialIndices.byteLength +
    schedule.triangleRestFrames.byteLength +
    schedule.sourceTriangleIndices.byteLength +
    schedule.renderTriangleIndices.byteLength +
    schedule.colorRanges.byteLength +
    schedule.lambdas.byteLength
  );
}

/** Deterministically colors MaterialPackageV1 triangles in ascending source triangle order. */
export function compileTriangleStrainScheduleV1(
  material: CompiledMaterialPackageV1,
  options: CompileTriangleStrainScheduleOptions = {},
): CompileTriangleStrainScheduleResult {
  const maxConstraints = positiveSafeBudget(options.maxConstraints, DEFAULT_MAX_CONSTRAINTS);
  const maxColors = positiveSafeBudget(options.maxColors, DEFAULT_MAX_COLORS);
  const maxBufferBytes = positiveSafeBudget(options.maxBufferBytes, DEFAULT_MAX_BUFFER_BYTES);
  if (maxConstraints === undefined || maxColors === undefined || maxBufferBytes === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'invalid-material-package',
          'Triangle strain schedule budgets must be positive safe integers.',
        ),
      ],
    };
  }

  const packageErrors = expectedMaterialBufferLengths(material);
  if (packageErrors.length > 0) {
    return {
      ok: false,
      diagnostics: [diagnostic('invalid-material-package', packageErrors.join('; ') + '.')],
    };
  }

  const triangleView = new DataView(material.triangleIndices);
  const materialIndexView = new DataView(material.triangleMaterialIndices);
  const restFrameView = new DataView(material.triangleRestFrames);
  const triangles: SourceTriangle[] = [];
  const diagnostics: TriangleStrainScheduleDiagnostic[] = [];

  for (let triangleIndex = 0; triangleIndex < material.manifest.triangleCount; triangleIndex += 1) {
    const triangleBase = triangleIndex * TRIANGLE_INDICES_GPU_V1.strideBytes;
    const vertices = [
      triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, true),
      triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, true),
      triangleView.getUint32(triangleBase + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, true),
    ] as const;
    const restBase = triangleIndex * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
    const materialIndex = materialIndexView.getUint32(
      triangleIndex * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
      true,
    );
    const frameMaterialIndex = restFrameView.getUint32(
      restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.materialIndex,
      true,
    );
    const inverseDm = [
      restFrameView.getFloat32(restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm00, true),
      restFrameView.getFloat32(restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm01, true),
      restFrameView.getFloat32(restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm10, true),
      restFrameView.getFloat32(restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.inverseDm11, true),
    ];
    const restArea = restFrameView.getFloat32(
      restBase + TRIANGLE_REST_FRAME_GPU_V1.offsets.restAreaM2,
      true,
    );
    if (
      new Set(vertices).size !== 3 ||
      vertices.some((vertex) => vertex >= material.manifest.particleCount) ||
      inverseDm.some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(restArea) ||
      restArea <= 0 ||
      materialIndex >= material.manifest.materialCount ||
      frameMaterialIndex !== materialIndex
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-triangle',
          'Triangle indices, rest frame, or material index are invalid.',
          triangleIndex,
        ),
      );
      continue;
    }
    triangles.push({ sourceIndex: triangleIndex, vertices });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  if (triangles.length > maxConstraints) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'constraint-budget-exceeded',
          `Triangle strain constraint budget exceeded: ${triangles.length} > ${maxConstraints}.`,
        ),
      ],
    };
  }

  const { grouped, colorRanges } = groupByColor(triangles);
  if (colorRanges.length / 2 > maxColors) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'color-budget-exceeded',
          `Triangle strain color budget exceeded: ${colorRanges.length / 2} > ${maxColors}.`,
        ),
      ],
    };
  }

  const triangleIndices = new ArrayBuffer(grouped.length * TRIANGLE_INDICES_GPU_V1.strideBytes);
  const triangleMaterialIndices = new ArrayBuffer(
    grouped.length * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
  );
  const triangleRestFrames = new ArrayBuffer(
    grouped.length * TRIANGLE_REST_FRAME_GPU_V1.strideBytes,
  );
  const sourceTriangleIndices = new Uint32Array(grouped.length);
  const renderTriangleIndices = new Uint32Array(grouped.length);
  grouped.forEach((triangle, scheduledIndex) => {
    copyRecord(
      material.triangleIndices,
      triangle.sourceIndex,
      triangleIndices,
      scheduledIndex,
      TRIANGLE_INDICES_GPU_V1.strideBytes,
    );
    copyRecord(
      material.triangleMaterialIndices,
      triangle.sourceIndex,
      triangleMaterialIndices,
      scheduledIndex,
      TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
    );
    copyRecord(
      material.triangleRestFrames,
      triangle.sourceIndex,
      triangleRestFrames,
      scheduledIndex,
      TRIANGLE_REST_FRAME_GPU_V1.strideBytes,
    );
    sourceTriangleIndices[scheduledIndex] = triangle.sourceIndex;
    renderTriangleIndices[scheduledIndex] = triangle.sourceIndex;
  });
  const lambdas = new Float32Array(grouped.length * 4);
  const schedule: CompiledTriangleStrainScheduleV1 = {
    version: TRIANGLE_STRAIN_SCHEDULE_VERSION,
    model: 'xpbd-anisotropic-triangle-strain-v1',
    sourceMaterialPackageVersion: MATERIAL_PACKAGE_VERSION,
    constraintCount: grouped.length,
    colorCount: colorRanges.length / 2,
    bufferBytes: 0,
    triangleIndices,
    triangleMaterialIndices,
    triangleRestFrames,
    sourceTriangleIndices,
    renderTriangleIndices,
    colorRanges,
    lambdas,
  };
  const bufferBytes = triangleStrainScheduleBufferBytes(schedule);
  if (bufferBytes > maxBufferBytes) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'buffer-budget-exceeded',
          `Triangle strain buffer budget exceeded: ${bufferBytes} > ${maxBufferBytes}.`,
        ),
      ],
    };
  }

  return { ok: true, schedule: { ...schedule, bufferBytes }, diagnostics: [] };
}

export function validateTriangleStrainScheduleV1(
  schedule: CompiledTriangleStrainScheduleV1,
  material: CompiledMaterialPackageV1,
): readonly string[] {
  const errors: string[] = [];
  const count = schedule.constraintCount;
  if (schedule.version !== TRIANGLE_STRAIN_SCHEDULE_VERSION) {
    errors.push('strain schedule version is unsupported.');
  }
  if (schedule.model !== 'xpbd-anisotropic-triangle-strain-v1') {
    errors.push('strain schedule model is unsupported.');
  }
  if (schedule.sourceMaterialPackageVersion !== material.manifest.schemaVersion) {
    errors.push('strain schedule material package version disagrees with its material input.');
  }
  if (count !== material.manifest.triangleCount || schedule.colorCount < 1) {
    errors.push('strain constraint or color count disagrees with the material package.');
  }
  const buffersHaveInvalidShape =
    schedule.triangleIndices.byteLength !== count * TRIANGLE_INDICES_GPU_V1.strideBytes ||
    schedule.triangleMaterialIndices.byteLength !==
      count * TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes ||
    schedule.triangleRestFrames.byteLength !== count * TRIANGLE_REST_FRAME_GPU_V1.strideBytes ||
    schedule.sourceTriangleIndices.length !== count ||
    schedule.renderTriangleIndices.length !== count ||
    schedule.colorRanges.length !== schedule.colorCount * 2 ||
    schedule.lambdas.length !== count * 4;
  if (buffersHaveInvalidShape) {
    errors.push('strain schedule buffers disagree with the schedule counts.');
  }
  if (schedule.bufferBytes !== triangleStrainScheduleBufferBytes(schedule)) {
    errors.push('strain schedule bufferBytes disagrees with its buffers.');
  }
  if (buffersHaveInvalidShape) return [...new Set(errors)];

  const scheduledView = new DataView(schedule.triangleIndices);
  let expectedOffset = 0;
  const sourceSeen = new Set<number>();
  for (let color = 0; color < schedule.colorCount; color += 1) {
    const offset = schedule.colorRanges[color * 2];
    const colorCount = schedule.colorRanges[color * 2 + 1];
    if (offset !== expectedOffset || colorCount < 1 || offset + colorCount > count) {
      errors.push('strain color ranges are empty, overlapping, or non-contiguous.');
      break;
    }
    const used = new Set<number>();
    for (let scheduledIndex = offset; scheduledIndex < offset + colorCount; scheduledIndex += 1) {
      const sourceIndex = schedule.sourceTriangleIndices[scheduledIndex];
      const renderIndex = schedule.renderTriangleIndices[scheduledIndex];
      if (sourceIndex >= count || renderIndex !== sourceIndex || sourceSeen.has(sourceIndex)) {
        errors.push('strain source/render triangle mappings are invalid or duplicated.');
      } else {
        sourceSeen.add(sourceIndex);
        if (
          !recordsEqual(
            schedule.triangleIndices,
            scheduledIndex,
            material.triangleIndices,
            sourceIndex,
            TRIANGLE_INDICES_GPU_V1.strideBytes,
          ) ||
          !recordsEqual(
            schedule.triangleMaterialIndices,
            scheduledIndex,
            material.triangleMaterialIndices,
            sourceIndex,
            TRIANGLE_MATERIAL_INDEX_GPU_V1.strideBytes,
          ) ||
          !recordsEqual(
            schedule.triangleRestFrames,
            scheduledIndex,
            material.triangleRestFrames,
            sourceIndex,
            TRIANGLE_REST_FRAME_GPU_V1.strideBytes,
          )
        ) {
          errors.push('strain scheduled records disagree with their source triangle mapping.');
        }
      }
      const base = scheduledIndex * TRIANGLE_INDICES_GPU_V1.strideBytes;
      const vertices = [
        scheduledView.getUint32(base + TRIANGLE_INDICES_GPU_V1.offsets.vertex0, true),
        scheduledView.getUint32(base + TRIANGLE_INDICES_GPU_V1.offsets.vertex1, true),
        scheduledView.getUint32(base + TRIANGLE_INDICES_GPU_V1.offsets.vertex2, true),
      ];
      if (new Set(vertices).size !== 3 || vertices.some((vertex) => used.has(vertex))) {
        errors.push('two strain constraints in one color write the same particle.');
        break;
      }
      vertices.forEach((vertex) => used.add(vertex));
    }
    expectedOffset += colorCount;
  }
  if (expectedOffset !== count || sourceSeen.size !== count) {
    errors.push('strain color ranges do not cover every constraint exactly once.');
  }
  if (schedule.lambdas.some((value) => !Number.isFinite(value))) {
    errors.push('strain lambda buffer contains a non-finite value.');
  }
  return [...new Set(errors)];
}
