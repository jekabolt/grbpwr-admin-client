import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1 =
  'dxf-product-two-panel-skirt-annular-authored-frame-mapping/1' as const;

const TWO_PI = Math.PI * 2;
const MAXIMUM_VERTEX_COUNT = 2_000;
const MAXIMUM_TRIANGLE_COUNT = 5_000;
const MAXIMUM_SEAM_PAIR_COUNT = 4_096;

export type DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1 = Readonly<{
  pieceId: string;
  planarApexMm: readonly [number, number];
  planarMirrorSign: 1 | -1;
  bodyAngularSign: 1 | -1;
}>;

export type DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingInputV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1;
  mesh: Pick<
    ClothMeshIR,
    'restPositions2Mm' | 'triangles' | 'pieceRanges' | 'boundarySamples' | 'seams'
  >;
  pieces: readonly [
    DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1,
    DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1,
  ];
  waistSlantRadiusMm: number;
  hemSlantRadiusMm: number;
  sectorSpanRadPerPiece: number;
  waistCenterM: readonly [number, number, number];
  seamAnchorAngleRad: number;
  parameterResidualMm: number;
  parameterResidualRad: number;
}>;

export type DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingResultV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1;
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  pieceByVertex: readonly string[];
  report: Readonly<{
    vertexCount: number;
    triangleCount: number;
    seamCount: number;
    seamPairCount: number;
    pinnedWaistVertexCount: number;
    coneSlope: number;
    axialSlope: number;
    authoredWaistCircumferenceM: number;
    authoredHemCircumferenceM: number;
    authoredAxialLengthM: number;
    maximumDomainRadiusResidualMm: number;
    maximumDomainAngleResidualRad: number;
    maximumWaistRadiusResidualMm: number;
    maximumSeamPreColocationResidualM: number;
    maximumSeamPostColocationResidualM: 0;
    outwardWindingNormalizedTriangleCount: number;
    pieceWinding: readonly Readonly<{
      pieceId: string;
      triangleCount: number;
      indexOrderFlipped: boolean;
      minimumOutwardRadialNormalDot: number;
      maximumOutwardRadialNormalDot: number;
    }>[];
  }>;
  claims: Readonly<{
    mappingBuiltFromAuthoredAnnularParameters: true;
    assemblyOrderSeamPairsConsumed: true;
    semanticWaistBoundaryPinsDerived: true;
    seamPairsByteColocated: true;
    perPieceOutwardWindingNormalized: true;
    bodyFrameAuthenticated: false;
    sectionCompatibilityEvaluated: false;
    collisionEvaluated: false;
    placementAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

function fail(detail: string): never {
  throw new TypeError(detail.slice(0, 2_048));
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) fail(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (!(value > 0)) fail(`${label} must be positive.`);
  return value;
}

function fixedArrayBuffer(view: ArrayBufferView, label: string): void {
  const buffer = view.buffer;
  if (!(buffer instanceof ArrayBuffer)) fail(`${label} cannot use SharedArrayBuffer storage.`);
  if ('resizable' in buffer && buffer.resizable) fail(`${label} cannot use resizable storage.`);
}

function finiteVec2(value: readonly [number, number], label: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) fail(`${label} must contain two coordinates.`);
  return [finite(value[0], `${label}[0]`), finite(value[1], `${label}[1]`)];
}

function finiteVec3(
  value: readonly [number, number, number],
  label: string,
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) fail(`${label} must contain three coordinates.`);
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ];
}

function pointDistance(positions: Float32Array, left: number, right: number): number {
  const a = left * 3;
  const b = right * 3;
  return Math.hypot(
    positions[a]! - positions[b]!,
    positions[a + 1]! - positions[b + 1]!,
    positions[a + 2]! - positions[b + 2]!,
  );
}

function normalizedAngle(value: number): number {
  const wrapped = value % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function components(vertexCount: number, seamPairs: Uint32Array): Uint32Array {
  const parent = Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const root = (input: number): number => {
    let value = input;
    while (parent[value] !== value) value = parent[value]!;
    let cursor = input;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = value;
      cursor = next;
    }
    return value;
  };
  for (let offset = 0; offset < seamPairs.length; offset += 2) {
    const left = root(seamPairs[offset]!);
    const right = root(seamPairs[offset + 1]!);
    if (left !== right) parent[Math.max(left, right)] = Math.min(left, right);
  }
  for (let index = 0; index < vertexCount; index += 1) parent[index] = root(index);
  return parent;
}

export function mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1(
  input: DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingInputV1,
): DxfProductTwoPanelSkirtAnnularAuthoredFrameMappingResultV1 {
  if (input.schemaVersion !== DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1) {
    fail('Authored-frame mapping schemaVersion is invalid.');
  }
  const waistSlantRadiusMm = positive(input.waistSlantRadiusMm, 'waistSlantRadiusMm');
  const hemSlantRadiusMm = positive(input.hemSlantRadiusMm, 'hemSlantRadiusMm');
  if (!(hemSlantRadiusMm > waistSlantRadiusMm)) {
    fail('hemSlantRadiusMm must exceed waistSlantRadiusMm.');
  }
  const sectorSpanRadPerPiece = positive(input.sectorSpanRadPerPiece, 'sectorSpanRadPerPiece');
  if (!(sectorSpanRadPerPiece * 2 < TWO_PI)) {
    fail('The two authored sectors must define a finite cone below 2π total span.');
  }
  const parameterResidualMm = positive(input.parameterResidualMm, 'parameterResidualMm');
  const parameterResidualRad = positive(input.parameterResidualRad, 'parameterResidualRad');
  if (parameterResidualMm > 0.1 || parameterResidualRad > 0.0001) {
    fail('Authored parameter residuals exceed the bounded policy.');
  }
  const waistCenterM = finiteVec3(input.waistCenterM, 'waistCenterM');
  const seamAnchorAngleRad = finite(input.seamAnchorAngleRad, 'seamAnchorAngleRad');
  const mesh = input.mesh;

  if (!(mesh.restPositions2Mm instanceof Float32Array) || mesh.restPositions2Mm.length % 2) {
    fail('mesh.restPositions2Mm must be a complete Float32 XY array.');
  }
  fixedArrayBuffer(mesh.restPositions2Mm, 'mesh.restPositions2Mm');
  const vertexCount = mesh.restPositions2Mm.length / 2;
  if (vertexCount === 0 || vertexCount > MAXIMUM_VERTEX_COUNT) {
    fail('Vertex count is empty or exceeds the authored-frame cap.');
  }
  if (!(mesh.triangles instanceof Uint32Array) || mesh.triangles.length % 3) {
    fail('mesh.triangles must be a complete Uint32 array.');
  }
  fixedArrayBuffer(mesh.triangles, 'mesh.triangles');
  const triangleCount = mesh.triangles.length / 3;
  if (triangleCount === 0 || triangleCount > MAXIMUM_TRIANGLE_COUNT) {
    fail('Triangle count is empty or exceeds the authored-frame cap.');
  }
  for (const vertex of mesh.triangles) {
    if (vertex >= vertexCount) fail('mesh.triangles contains an out-of-range vertex.');
  }

  if (!Array.isArray(input.pieces) || input.pieces.length !== 2) {
    fail('Exactly two authored piece mappings are required.');
  }
  const pieces = input.pieces.map((piece, ordinal) => {
    if (!piece || typeof piece.pieceId !== 'string' || piece.pieceId.length === 0) {
      fail(`pieces[${ordinal}] has an invalid pieceId.`);
    }
    if (piece.planarMirrorSign !== 1 && piece.planarMirrorSign !== -1) {
      fail(`pieces[${ordinal}].planarMirrorSign is invalid.`);
    }
    if (piece.bodyAngularSign !== 1 && piece.bodyAngularSign !== -1) {
      fail(`pieces[${ordinal}].bodyAngularSign is invalid.`);
    }
    return {
      pieceId: piece.pieceId,
      planarApexMm: finiteVec2(piece.planarApexMm, `pieces[${ordinal}].planarApexMm`),
      planarMirrorSign: piece.planarMirrorSign,
      bodyAngularSign: piece.bodyAngularSign,
    };
  });
  if (
    pieces[0]!.pieceId === pieces[1]!.pieceId ||
    pieces[0]!.bodyAngularSign === pieces[1]!.bodyAngularSign
  ) {
    fail('Piece IDs must differ and body angular signs must be opposite.');
  }
  const pieceById = new Map(pieces.map((piece) => [piece.pieceId, piece]));

  if (!Array.isArray(mesh.pieceRanges) || mesh.pieceRanges.length !== 2) {
    fail('mesh.pieceRanges must contain two ranges.');
  }
  const pieceByVertex = Array.from({ length: vertexCount }, () => '');
  const triangleRangeCoverage = new Uint8Array(triangleCount);
  for (const range of mesh.pieceRanges) {
    if (!pieceById.has(range.pieceId)) fail(`${range.pieceId} has no authored mapping.`);
    if (
      !Number.isSafeInteger(range.vertexOffset) ||
      !Number.isSafeInteger(range.vertexCount) ||
      range.vertexOffset < 0 ||
      range.vertexCount <= 0 ||
      range.vertexOffset + range.vertexCount > vertexCount
    ) {
      fail(`${range.pieceId} has an invalid vertex range.`);
    }
    for (let local = 0; local < range.vertexCount; local += 1) {
      const index = range.vertexOffset + local;
      if (pieceByVertex[index]) fail('mesh.pieceRanges overlap.');
      pieceByVertex[index] = range.pieceId;
    }
    if (
      !Number.isSafeInteger(range.triangleOffset) ||
      !Number.isSafeInteger(range.triangleCount) ||
      range.triangleOffset < 0 ||
      range.triangleCount <= 0 ||
      range.triangleOffset + range.triangleCount > triangleCount
    ) {
      fail(`${range.pieceId} has an invalid triangle range.`);
    }
    for (let local = 0; local < range.triangleCount; local += 1) {
      const index = range.triangleOffset + local;
      if (triangleRangeCoverage[index]) fail('mesh.pieceRanges triangle ranges overlap.');
      triangleRangeCoverage[index] = 1;
    }
  }
  if (pieceByVertex.some((pieceId) => pieceId.length === 0)) {
    fail('mesh.pieceRanges do not cover all vertices.');
  }
  if (triangleRangeCoverage.some((covered) => covered !== 1)) {
    fail('mesh.pieceRanges do not cover all triangles.');
  }

  if (!Array.isArray(mesh.seams) || mesh.seams.length !== 2) {
    fail('Exactly two Assembly Order seams are required.');
  }
  const seamValues: number[] = [];
  const unorderedPairs = new Set<string>();
  for (const seam of mesh.seams) {
    if (seam.mapping !== 'equal' || seam.lengthRatio !== 1) {
      fail(`${seam.seamId} is not an exact equal Assembly Order seam.`);
    }
    if (!(seam.vertexPairs instanceof Uint32Array) || seam.vertexPairs.length % 2) {
      fail(`${seam.seamId} has invalid vertex pairs.`);
    }
    fixedArrayBuffer(seam.vertexPairs, `${seam.seamId}.vertexPairs`);
    for (let offset = 0; offset < seam.vertexPairs.length; offset += 2) {
      const left = seam.vertexPairs[offset]!;
      const right = seam.vertexPairs[offset + 1]!;
      if (left >= vertexCount || right >= vertexCount || left === right) {
        fail(`${seam.seamId} contains an invalid pair.`);
      }
      if (pieceByVertex[left] === pieceByVertex[right]) {
        fail(`${seam.seamId} contains a same-piece pair.`);
      }
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (unorderedPairs.has(key)) fail('Assembly Order seam pairs contain a duplicate.');
      unorderedPairs.add(key);
      seamValues.push(left, right);
    }
  }
  if (seamValues.length / 2 > MAXIMUM_SEAM_PAIR_COUNT) {
    fail('Assembly Order seam-pair count exceeds its cap.');
  }
  const seamPairs = Uint32Array.from(seamValues);

  const coneSlope = (sectorSpanRadPerPiece * 2) / TWO_PI;
  const axialSlope = Math.sqrt(1 - coneSlope * coneSlope);
  const positions3M = new Float32Array(vertexCount * 3);
  let maximumDomainRadiusResidualMm = 0;
  let maximumDomainAngleResidualRad = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const piece = pieceById.get(pieceByVertex[index]!)!;
    const dx = piece.planarMirrorSign * (mesh.restPositions2Mm[index * 2]! - piece.planarApexMm[0]);
    const dy =
      piece.planarMirrorSign * (mesh.restPositions2Mm[index * 2 + 1]! - piece.planarApexMm[1]);
    const radiusMm = Math.hypot(dx, dy);
    const angleRad = normalizedAngle(Math.atan2(dy, dx));
    const radiusResidualMm =
      radiusMm < waistSlantRadiusMm
        ? waistSlantRadiusMm - radiusMm
        : radiusMm > hemSlantRadiusMm
          ? radiusMm - hemSlantRadiusMm
          : 0;
    const angleResidualRad =
      angleRad > sectorSpanRadPerPiece ? angleRad - sectorSpanRadPerPiece : 0;
    maximumDomainRadiusResidualMm = Math.max(maximumDomainRadiusResidualMm, radiusResidualMm);
    maximumDomainAngleResidualRad = Math.max(maximumDomainAngleResidualRad, angleResidualRad);
    if (radiusResidualMm > parameterResidualMm || angleResidualRad > parameterResidualRad) {
      fail(`Vertex ${index} lies outside the authored annular domain.`);
    }
    const localAngleRad = Math.max(
      0,
      Math.min(sectorSpanRadPerPiece, sectorSpanRadPerPiece - angleRad),
    );
    const bodyAngleRad = seamAnchorAngleRad + (piece.bodyAngularSign * localAngleRad) / coneSlope;
    const horizontalRadiusM = (coneSlope * radiusMm) / 1_000;
    positions3M[index * 3] = Math.fround(
      waistCenterM[0] + horizontalRadiusM * Math.cos(bodyAngleRad),
    );
    positions3M[index * 3 + 1] = Math.fround(
      waistCenterM[1] - (axialSlope * (radiusMm - waistSlantRadiusMm)) / 1_000,
    );
    positions3M[index * 3 + 2] = Math.fround(
      waistCenterM[2] + horizontalRadiusM * Math.sin(bodyAngleRad),
    );
  }

  let maximumSeamPreColocationResidualM = 0;
  for (let offset = 0; offset < seamPairs.length; offset += 2) {
    maximumSeamPreColocationResidualM = Math.max(
      maximumSeamPreColocationResidualM,
      pointDistance(positions3M, seamPairs[offset]!, seamPairs[offset + 1]!),
    );
  }
  const componentByVertex = components(vertexCount, seamPairs);
  const representative = new Map<number, number>();
  for (let index = 0; index < vertexCount; index += 1) {
    const component = componentByVertex[index]!;
    representative.set(component, Math.min(representative.get(component) ?? index, index));
  }
  for (let index = 0; index < vertexCount; index += 1) {
    const source = representative.get(componentByVertex[index]!)!;
    positions3M[index * 3] = positions3M[source * 3]!;
    positions3M[index * 3 + 1] = positions3M[source * 3 + 1]!;
    positions3M[index * 3 + 2] = positions3M[source * 3 + 2]!;
  }

  const triangles = new Uint32Array(mesh.triangles);
  let outwardWindingNormalizedTriangleCount = 0;
  const pieceWinding = mesh.pieceRanges.map((range) => {
    let negativeCount = 0;
    let positiveCount = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let local = 0; local < range.triangleCount; local += 1) {
      const offset = (range.triangleOffset + local) * 3;
      const a = triangles[offset]!;
      const b = triangles[offset + 1]!;
      const c = triangles[offset + 2]!;
      if (
        pieceByVertex[a] !== range.pieceId ||
        pieceByVertex[b] !== range.pieceId ||
        pieceByVertex[c] !== range.pieceId
      ) {
        fail(`${range.pieceId} triangle range crosses piece ownership.`);
      }
      const ax = positions3M[a * 3]!;
      const ay = positions3M[a * 3 + 1]!;
      const az = positions3M[a * 3 + 2]!;
      const abx = positions3M[b * 3]! - ax;
      const aby = positions3M[b * 3 + 1]! - ay;
      const abz = positions3M[b * 3 + 2]! - az;
      const acx = positions3M[c * 3]! - ax;
      const acy = positions3M[c * 3 + 1]! - ay;
      const acz = positions3M[c * 3 + 2]! - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const rx = (ax + positions3M[b * 3]! + positions3M[c * 3]!) / 3 - waistCenterM[0];
      const rz = (az + positions3M[b * 3 + 2]! + positions3M[c * 3 + 2]!) / 3 - waistCenterM[2];
      const denominator = Math.hypot(nx, ny, nz) * Math.hypot(rx, rz);
      if (!(denominator > 1e-14)) fail(`${range.pieceId} contains a degenerate mapped triangle.`);
      const dot = (nx * rx + nz * rz) / denominator;
      if (dot > 1e-8) positiveCount += 1;
      else if (dot < -1e-8) negativeCount += 1;
      else fail(`${range.pieceId} contains a mapped triangle with ambiguous radial orientation.`);
      minimum = Math.min(minimum, dot);
      maximum = Math.max(maximum, dot);
    }
    if (positiveCount > 0 && negativeCount > 0) {
      fail(`${range.pieceId} contains mixed mapped triangle winding.`);
    }
    const indexOrderFlipped = negativeCount === range.triangleCount;
    if (indexOrderFlipped) {
      for (let local = 0; local < range.triangleCount; local += 1) {
        const offset = (range.triangleOffset + local) * 3;
        const value = triangles[offset + 1]!;
        triangles[offset + 1] = triangles[offset + 2]!;
        triangles[offset + 2] = value;
      }
      outwardWindingNormalizedTriangleCount += range.triangleCount;
      const oldMinimum = minimum;
      minimum = -maximum;
      maximum = -oldMinimum;
    }
    return Object.freeze({
      pieceId: range.pieceId,
      triangleCount: range.triangleCount,
      indexOrderFlipped,
      minimumOutwardRadialNormalDot: minimum,
      maximumOutwardRadialNormalDot: maximum,
    });
  });

  if (!Array.isArray(mesh.boundarySamples) || mesh.boundarySamples.length === 0) {
    fail('mesh.boundarySamples is empty.');
  }
  const waistVertices = new Set<number>();
  let maximumWaistRadiusResidualMm = 0;
  for (const sample of mesh.boundarySamples) {
    if (sample.vertexIndex >= vertexCount || pieceByVertex[sample.vertexIndex] !== sample.pieceId) {
      fail('mesh.boundarySamples contains an invalid vertex binding.');
    }
    const piece = pieceById.get(sample.pieceId);
    if (!piece) fail('mesh.boundarySamples contains an unknown piece.');
    const dx =
      piece.planarMirrorSign *
      (mesh.restPositions2Mm[sample.vertexIndex * 2]! - piece.planarApexMm[0]);
    const dy =
      piece.planarMirrorSign *
      (mesh.restPositions2Mm[sample.vertexIndex * 2 + 1]! - piece.planarApexMm[1]);
    const residualMm = Math.abs(Math.hypot(dx, dy) - waistSlantRadiusMm);
    if (residualMm <= parameterResidualMm) {
      waistVertices.add(sample.vertexIndex);
      maximumWaistRadiusResidualMm = Math.max(maximumWaistRadiusResidualMm, residualMm);
    }
  }
  if (waistVertices.size < 6) fail('The authored waist boundary produced too few pins.');
  const pinnedWaistVertexIndices = Uint32Array.from([...waistVertices].sort((a, b) => a - b));
  const positionsInvMass = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    positionsInvMass[index * 4] = positions3M[index * 3]!;
    positionsInvMass[index * 4 + 1] = positions3M[index * 3 + 1]!;
    positionsInvMass[index * 4 + 2] = positions3M[index * 3 + 2]!;
    positionsInvMass[index * 4 + 3] = waistVertices.has(index) ? 0 : 1;
  }

  return Object.freeze({
    schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
    positions3M,
    positionsInvMass,
    triangles,
    seamPairs,
    pinnedWaistVertexIndices,
    pieceByVertex: Object.freeze(pieceByVertex),
    report: Object.freeze({
      vertexCount,
      triangleCount,
      seamCount: mesh.seams.length,
      seamPairCount: seamPairs.length / 2,
      pinnedWaistVertexCount: pinnedWaistVertexIndices.length,
      coneSlope,
      axialSlope,
      authoredWaistCircumferenceM: (sectorSpanRadPerPiece * 2 * waistSlantRadiusMm) / 1_000,
      authoredHemCircumferenceM: (sectorSpanRadPerPiece * 2 * hemSlantRadiusMm) / 1_000,
      authoredAxialLengthM: (axialSlope * (hemSlantRadiusMm - waistSlantRadiusMm)) / 1_000,
      maximumDomainRadiusResidualMm,
      maximumDomainAngleResidualRad,
      maximumWaistRadiusResidualMm,
      maximumSeamPreColocationResidualM,
      maximumSeamPostColocationResidualM: 0 as const,
      outwardWindingNormalizedTriangleCount,
      pieceWinding: Object.freeze(pieceWinding),
    }),
    claims: Object.freeze({
      mappingBuiltFromAuthoredAnnularParameters: true as const,
      assemblyOrderSeamPairsConsumed: true as const,
      semanticWaistBoundaryPinsDerived: true as const,
      seamPairsByteColocated: true as const,
      perPieceOutwardWindingNormalized: true as const,
      bodyFrameAuthenticated: false as const,
      sectionCompatibilityEvaluated: false as const,
      collisionEvaluated: false as const,
      placementAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
}
