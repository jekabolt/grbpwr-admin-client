import {
  GARMENT_ASSEMBLY_IR_VERSION,
  garmentAssemblyFingerprint,
  type GarmentAssemblyIR,
  type PatternContour,
  type PatternPiece,
  type SeamDefinition,
  type SeamSide,
  type Vec2Mm,
  validateGarmentAssemblyIR,
} from '../domain/garment-assembly-ir';
import {
  CLOTH_MESH_IR_VERSION,
  type ClothBoundarySample,
  type ClothMeshIR,
  type ClothMeshPieceRange,
  type ClothSeamMap,
  validateClothMeshIR,
} from './cloth-mesh-ir';
import { auditTriangulationResult } from './triangulation/audit';
import { triangulationResultFingerprint } from './triangulation/canonical';
import type {
  BoundaryRing,
  BoundaryVertex,
  ConstrainedTriangulationInput,
  ConstrainedTriangulationResult,
  MeshQualityReport,
  OutputVertexSource,
  TriangulationAuditCandidate,
} from './triangulation/types';

export const GARMENT_PHASE1_CLOTH_MESH_COMPILER_V1 =
  'garment-phase1-cloth-mesh-compiler/1' as const;

export const GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1 = Object.freeze({
  maximumDepth: 24,
  maximumNodes: 250_000,
  maximumProperties: 1_000_000,
  maximumArrayLength: 250_000,
  maximumTypedArrayLength: 1_000_000,
  maximumStringLength: 1_024,
  maximumPieces: 64,
  maximumContours: 256,
  maximumVertices: 100_000,
  maximumTriangles: 200_000,
  maximumSeams: 512,
  maximumSeamEndpoints: 4_096,
  maximumErrorDetails: 32,
} as const);

export type GarmentPhase1ClothMeshErrorCodeV1 =
  | 'reentrant-call'
  | 'input-snapshot-invalid'
  | 'resource-budget-exceeded'
  | 'assembly-invalid'
  | 'unsupported-assembly-semantics'
  | 'missing-piece-result'
  | 'duplicate-piece-result'
  | 'unexpected-piece-result'
  | 'result-quality-invalid'
  | 'result-hash-mismatch'
  | 'topology-mismatch'
  | 'provenance-mismatch'
  | 'grain-frame-mismatch'
  | 'missing-seam-proof'
  | 'duplicate-seam-proof'
  | 'unsupported-seam-semantics'
  | 'seam-endpoint-mismatch'
  | 'partial-seam-coverage'
  | 'non-bijective-seam'
  | 'output-invalid';

export class GarmentPhase1ClothMeshErrorV1 extends Error {
  readonly code: GarmentPhase1ClothMeshErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: GarmentPhase1ClothMeshErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GarmentPhase1ClothMeshErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumErrorDetails)
        .map((detail) => detail.slice(0, GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumStringLength)),
    );
  }
}

export type GarmentPhase1PieceResultV1 = Readonly<{
  pieceId: string;
  result: ConstrainedTriangulationResult;
}>;

export type GarmentPhase1SeamSideProofV1 = Readonly<{
  sideIndex: 0 | 1;
  pieceId: string;
  contourId: string;
  sourceCurveId: string;
  direction: 'forward' | 'reverse';
  startBoundaryVertexId: string;
  endBoundaryVertexId: string;
  startEndpointId: string;
  endEndpointId: string;
  expectedLengthMm: number;
}>;

export type GarmentPhase1SeamProofV1 = Readonly<{
  seamId: string;
  operationId: string;
  mapping: 'equal';
  lengthRatio: 1;
  exactToleranceMm: number;
  sides: readonly [GarmentPhase1SeamSideProofV1, GarmentPhase1SeamSideProofV1];
}>;

export type GarmentPhase1ClothMeshCompileRequestV1 = Readonly<{
  assembly: GarmentAssemblyIR;
  pieces: readonly GarmentPhase1PieceResultV1[];
  seamProofs: readonly GarmentPhase1SeamProofV1[];
}>;

export type GarmentPhase1VertexProvenanceV1 = Readonly<{
  pieceId: string;
  localVertexIndex: number;
  globalVertexIndex: number;
  source: OutputVertexSource;
}>;

export type GarmentPhase1BoundaryLoopV1 = Readonly<{
  pieceId: string;
  contourId: string;
  role: 'shell' | 'hole';
  localVertexIndices: Uint32Array;
  globalVertexIndices: Uint32Array;
}>;

export type GarmentPhase1SeamEndpointV1 = Readonly<{
  pieceId: string;
  seamEndpointId: string;
  boundaryVertexId: string;
  localVertexIndex: number;
  globalVertexIndex: number;
}>;

export type GarmentPhase1PieceEvidenceV1 = Readonly<{
  pieceId: string;
  sourceResultHash: string;
  recomputedResultHash: string;
  auditVerdict: 'pass';
  vertexOffset: number;
  vertexCount: number;
  triangleOffset: number;
  triangleCount: number;
  boundaryLoopCount: number;
  seamEndpointCount: number;
}>;

export type GarmentPhase1ClothMeshArtifactV1 = Readonly<{
  version: typeof GARMENT_PHASE1_CLOTH_MESH_COMPILER_V1;
  mesh: ClothMeshIR;
  vertexProvenance: readonly GarmentPhase1VertexProvenanceV1[];
  boundaryLoops: readonly GarmentPhase1BoundaryLoopV1[];
  seamEndpoints: readonly GarmentPhase1SeamEndpointV1[];
  triangleMaterialFrames2: Float32Array;
  pieceEvidence: readonly GarmentPhase1PieceEvidenceV1[];
  deterministicFingerprint: string;
  claims: Readonly<{
    acceptanceRequired: true;
    boundaryOnlyPhase1: true;
    distributedSeamSamplingIntegrated: false;
    refinementIntegrated: false;
    bodyPlacementReady: false;
    runtimeIntegrated: false;
    settleAccepted: false;
    productionReady: false;
  }>;
  blockers: readonly [
    'acceptance-artifact-required',
    'distributed-seam-sampling-not-integrated',
    'target-edge-refinement-not-integrated',
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ];
}>;

type SnapshotState = {
  nodes: number;
  properties: number;
  seen: Set<object>;
};

const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const AREA_EPSILON = 1e-9;
const RANGE_EPSILON = 1e-12;
/** Higher tolerances are not exact enough to certify an equal-stitch Phase-1 seam. */
export const GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1 = 1e-6;

function snapshotError(path: string, message: string): GarmentPhase1ClothMeshErrorV1 {
  return new GarmentPhase1ClothMeshErrorV1('input-snapshot-invalid', `${path} ${message}`);
}

function snapshotTypedArray(
  value: object,
  path: string,
  state: SnapshotState,
): Uint32Array | Float32Array {
  if (!typedArrayLength || !typedArrayBuffer) throw snapshotError(path, 'cannot be inspected.');
  if (state.seen.has(value)) throw snapshotError(path, 'contains shared or cyclic objects.');
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumNodes)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the node bound.`,
    );
  const length = typedArrayLength.call(value) as number;
  if (length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumTypedArrayLength)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the typed-array bound.`,
    );
  const buffer = typedArrayBuffer.call(value) as ArrayBufferLike;
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    throw snapshotError(path, 'must use a private ArrayBuffer.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = keys.filter((key): key is string => typeof key === 'string');
  if (
    dataKeys.length !== keys.length ||
    dataKeys.length !== length ||
    dataKeys.some((key, index) => key !== String(index))
  )
    throw snapshotError(path, 'must not contain accessors or extra properties.');
  state.properties += dataKeys.length;
  if (state.properties > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumProperties)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the property bound.`,
    );
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw snapshotError(path, 'must contain only enumerable element data properties.');
  }
  const copy =
    Object.getPrototypeOf(value) === Uint32Array.prototype
      ? (Uint32Array.prototype.slice.call(value) as Uint32Array)
      : (Float32Array.prototype.slice.call(value) as Float32Array);
  state.seen.delete(value);
  return copy;
}

function snapshotOwnData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumStringLength)
      throw new GarmentPhase1ClothMeshErrorV1(
        'resource-budget-exceeded',
        `${path} exceeds the string bound.`,
      );
    return value;
  }
  if (typeof value !== 'object') throw snapshotError(path, 'is not plain serializable data.');
  if (depth > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumDepth)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the depth bound.`,
    );
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Uint32Array.prototype || prototype === Float32Array.prototype)
    return snapshotTypedArray(value, path, state);
  if (state.seen.has(value)) throw snapshotError(path, 'contains shared or cyclic objects.');
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumNodes)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the node bound.`,
    );
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? arrayPrototype : objectPrototype))
    throw snapshotError(
      path,
      'must use a plain object, array, or supported typed-array prototype.',
    );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol'))
    throw snapshotError(path, 'contains symbol properties.');
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.properties += dataKeys.length;
  if (state.properties > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumProperties)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${path} exceeds the property bound.`,
    );
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      throw snapshotError(path, 'has no plain length descriptor.');
    const length = lengthDescriptor.value as number;
    if (length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumArrayLength)
      throw new GarmentPhase1ClothMeshErrorV1(
        'resource-budget-exceeded',
        `${path} exceeds the array bound.`,
      );
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      throw snapshotError(path, 'must be a dense array without extra properties.');
    const output = dataKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw snapshotError(`${path}[${key}]`, 'must be an enumerable data property.');
      return snapshotOwnData(descriptor.value, `${path}[${key}]`, depth + 1, state);
    });
    state.seen.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  // Preserve own-data insertion order because the existing triangulation fingerprint contract
  // serializes its already-canonical source records in that order.
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw snapshotError(`${path}.${key}`, 'must be an enumerable data property.');
    output[key] = snapshotOwnData(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
  state.seen.delete(value);
  return output;
}

function snapshotRequest(
  input: GarmentPhase1ClothMeshCompileRequestV1,
): GarmentPhase1ClothMeshCompileRequestV1 {
  try {
    return snapshotOwnData(input, 'request', 0, {
      nodes: 0,
      properties: 0,
      seen: new Set<object>(),
    }) as GarmentPhase1ClothMeshCompileRequestV1;
  } catch (error) {
    if (error instanceof GarmentPhase1ClothMeshErrorV1) throw error;
    throw new GarmentPhase1ClothMeshErrorV1(
      'input-snapshot-invalid',
      'Compiler input snapshot failed closed.',
      [error instanceof Error ? error.message : String(error)],
    );
  }
}

function assertExactKeys(value: unknown, expected: readonly string[], path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw snapshotError(path, 'must be an object.');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw snapshotError(path, 'has an unsupported property shape.');
}

function assertAssemblyShape(assembly: GarmentAssemblyIR): void {
  assertExactKeys(
    assembly,
    ['schemaVersion', 'source', 'physicalSurface', 'pieces', 'seams', 'operations', 'materials'],
    'request.assembly',
  );
  assertExactKeys(assembly.source, ['documentId', 'revision', 'hash', 'units'], 'assembly.source');
  assertExactKeys(
    assembly.physicalSurface,
    ['mode', 'seamAllowancePhysical'],
    'assembly.physicalSurface',
  );
  assembly.pieces.forEach((piece, pieceIndex) => {
    assertExactKeys(
      piece,
      ['id', 'name', 'cutCount', 'grainDegrees', 'contours'],
      `pieces[${pieceIndex}]`,
    );
    piece.contours.forEach((contour, contourIndex) =>
      assertExactKeys(
        contour,
        ['id', 'role', 'closed', 'pointsMm', 'sourceCurveIds'],
        `pieces[${pieceIndex}].contours[${contourIndex}]`,
      ),
    );
  });
  assembly.seams.forEach((seam, seamIndex) => {
    assertExactKeys(
      seam,
      ['id', 'operationId', 'sides', 'mapping', 'lengthRatio'],
      `seams[${seamIndex}]`,
    );
    seam.sides.forEach((side, sideIndex) =>
      assertExactKeys(
        side,
        ['pieceId', 'contourId', 'normalizedRange', 'direction'],
        `seams[${seamIndex}].sides[${sideIndex}]`,
      ),
    );
  });
  assembly.operations.forEach((operation, index) =>
    assertExactKeys(operation, ['id', 'order', 'kind', 'seamIds'], `operations[${index}]`),
  );
  assembly.materials.forEach((material, index) =>
    assertExactKeys(material, ['id', 'pieceIds', 'materialRevision'], `materials[${index}]`),
  );
}

function assertRequestShape(request: GarmentPhase1ClothMeshCompileRequestV1): void {
  assertExactKeys(request, ['assembly', 'pieces', 'seamProofs'], 'request');
  assertAssemblyShape(request.assembly);
  request.pieces.forEach((piece, index) => {
    assertExactKeys(piece, ['pieceId', 'result'], `request.pieces[${index}]`);
    assertExactKeys(
      piece.result,
      [
        'vertices',
        'triangles',
        'boundaryLoops',
        'seamEndpoints',
        'triangleMaterialFrames2',
        'deterministicHash',
        'quality',
      ],
      `request.pieces[${index}].result`,
    );
    piece.result.vertices.forEach((vertex, vertexIndex) => {
      const vertexPath = `request.pieces[${index}].result.vertices[${vertexIndex}]`;
      assertExactKeys(vertex, ['positionMm', 'source'], vertexPath);
      if (vertex.source.kind === 'boundary') {
        assertExactKeys(
          vertex.source,
          ['kind', 'boundaryVertexId', 'provenance'],
          `${vertexPath}.source`,
        );
        assertExactKeys(
          vertex.source.provenance,
          [
            'contourId',
            'sourceCurveId',
            'sourceCurveParameterSpace',
            'sourceCurveT',
            'normalizedArc',
          ],
          `${vertexPath}.source.provenance`,
        );
      } else if (vertex.source.kind === 'boundary-sample') {
        assertExactKeys(
          vertex.source,
          ['kind', 'parentSegment', 'provenance'],
          `${vertexPath}.source`,
        );
      } else {
        assertExactKeys(
          vertex.source,
          vertex.source.sourceId === undefined
            ? ['kind', 'generator']
            : ['kind', 'generator', 'sourceId'],
          `${vertexPath}.source`,
        );
      }
    });
    piece.result.boundaryLoops.forEach((loop, loopIndex) =>
      assertExactKeys(
        loop,
        ['inputRingId', 'role', 'vertexIndices'],
        `request.pieces[${index}].result.boundaryLoops[${loopIndex}]`,
      ),
    );
    piece.result.seamEndpoints.forEach((endpoint, endpointIndex) =>
      assertExactKeys(
        endpoint,
        ['seamEndpointId', 'vertexIndex'],
        `request.pieces[${index}].result.seamEndpoints[${endpointIndex}]`,
      ),
    );
    assertExactKeys(
      piece.result.quality,
      [
        'verdict',
        'triangleCount',
        'trianglesOutsideDomain',
        'invertedTriangles',
        'degenerateTriangles',
        'sliverTriangles',
        'duplicateTriangles',
        'nonManifoldEdges',
        'minTriangleAngleDegrees',
        'maxEdgeRatio',
        'maxRadiusEdgeRatio',
        'maxBoundaryErrorMm',
        'missingBoundarySegments',
        'orphanBoundarySources',
        'orphanSeamEndpoints',
        'inputDomainAreaMm2',
        'outputAreaMm2',
        'areaErrorMm2',
        'holesPreserved',
        'grainFramesPreserved',
        'issues',
      ],
      `request.pieces[${index}].result.quality`,
    );
  });
  request.seamProofs.forEach((proof, proofIndex) => {
    assertExactKeys(
      proof,
      ['seamId', 'operationId', 'mapping', 'lengthRatio', 'exactToleranceMm', 'sides'],
      `request.seamProofs[${proofIndex}]`,
    );
    proof.sides.forEach((side, sideIndex) =>
      assertExactKeys(
        side,
        [
          'sideIndex',
          'pieceId',
          'contourId',
          'sourceCurveId',
          'direction',
          'startBoundaryVertexId',
          'endBoundaryVertexId',
          'startEndpointId',
          'endEndpointId',
          'expectedLengthMm',
        ],
        `request.seamProofs[${proofIndex}].sides[${sideIndex}]`,
      ),
    );
  });
}

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function finitePoint(point: Vec2Mm): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function samePoint(a: Vec2Mm, b: Vec2Mm): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function distance(a: Vec2Mm, b: Vec2Mm): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function validateAssembly(assembly: GarmentAssemblyIR): void {
  let diagnostics;
  try {
    diagnostics = validateGarmentAssemblyIR(assembly).filter(
      (diagnostic) => diagnostic.severity === 'error',
    );
  } catch (error) {
    throw new GarmentPhase1ClothMeshErrorV1(
      'assembly-invalid',
      'GarmentAssemblyIR validation failed closed.',
      [error instanceof Error ? error.message : String(error)],
    );
  }
  if (diagnostics.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'assembly-invalid',
      'GarmentAssemblyIR preflight failed.',
      diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    );
  if (
    assembly.schemaVersion !== GARMENT_ASSEMBLY_IR_VERSION ||
    assembly.source.units !== 'mm' ||
    assembly.physicalSurface.mode !== 'sewing-surface' ||
    assembly.physicalSurface.seamAllowancePhysical !== false
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'unsupported-assembly-semantics',
      'The Phase-1 compiler accepts only millimetre sewing-surface assemblies.',
    );
  if (
    assembly.pieces.length === 0 ||
    assembly.pieces.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumPieces ||
    assembly.pieces.some((piece) => piece.cutCount !== 1) ||
    assembly.operations.some((operation) => operation.kind !== 'stitch')
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'unsupported-assembly-semantics',
      'Phase-1 requires one cut per piece and stitch-only operations.',
    );
  const contours = assembly.pieces.flatMap((piece) => piece.contours);
  if (
    contours.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumContours ||
    contours.some(
      (contour) =>
        contour.pointsMm.length !== contour.sourceCurveIds.length ||
        contour.pointsMm.some((point) => !finitePoint(point)),
    )
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'assembly-invalid',
      'Contour geometry or source-curve cardinality is invalid.',
    );
  const allIds = [
    ...assembly.pieces.map(({ id }) => id),
    ...contours.map(({ id }) => id),
    ...assembly.seams.map(({ id }) => id),
    ...assembly.operations.map(({ id }) => id),
    ...assembly.materials.map(({ id }) => id),
  ];
  const duplicates = duplicateValues(allIds);
  if (duplicates.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'assembly-invalid',
      'Assembly ids must be globally unique.',
      duplicates,
    );
}

type ValidatedPiece = Readonly<{
  piece: PatternPiece;
  result: ConstrainedTriangulationResult;
  audit: MeshQualityReport;
  candidate: TriangulationAuditCandidate;
  boundaryIdToLocalIndex: ReadonlyMap<string, number>;
  contourLoops: ReadonlyMap<string, Uint32Array>;
}>;

const AUDIT_OPTIONS = Object.freeze({
  targetEdgeMm: 1,
  minInputEdgeMm: 1e-12,
  minTriangleAngleDegrees: 1e-9,
  maxEdgeRatio: Number.MAX_VALUE,
  maxRadiusEdgeRatio: Number.MAX_VALUE,
  maxBoundaryErrorMm: 1e-7,
  collinearSinTolerance: 1e-12,
});

function resultCandidate(result: ConstrainedTriangulationResult): TriangulationAuditCandidate {
  return {
    vertices: result.vertices,
    triangles: result.triangles,
    boundaryLoops: result.boundaryLoops,
    seamEndpoints: result.seamEndpoints,
    triangleMaterialFrames2: result.triangleMaterialFrames2,
  };
}

function exactBoundaryVertex(
  result: ConstrainedTriangulationResult,
  localIndex: number,
  pieceId: string,
): BoundaryVertex {
  const vertex = result.vertices[localIndex];
  if (!vertex || vertex.source.kind !== 'boundary')
    throw new GarmentPhase1ClothMeshErrorV1(
      'provenance-mismatch',
      `${pieceId} Phase-1 output must contain only exact input boundary vertices.`,
    );
  return {
    id: vertex.source.boundaryVertexId,
    positionMm: [vertex.positionMm[0], vertex.positionMm[1]],
    source: { ...vertex.source.provenance },
  };
}

function buildAuditInput(
  piece: PatternPiece,
  result: ConstrainedTriangulationResult,
): ConstrainedTriangulationInput {
  const rings: BoundaryRing[] = result.boundaryLoops.map((loop) => ({
    id: loop.inputRingId,
    role: loop.role,
    vertices: [...loop.vertexIndices].map((index) => exactBoundaryVertex(result, index, piece.id)),
  }));
  const shell = rings.find((ring) => ring.role === 'shell');
  if (!shell)
    throw new GarmentPhase1ClothMeshErrorV1(
      'topology-mismatch',
      `${piece.id} has no shell boundary loop.`,
    );
  return {
    pieceId: piece.id,
    shell,
    holes: rings.filter((ring) => ring.role === 'hole'),
    seamEndpoints: result.seamEndpoints.map((endpoint) => ({
      id: endpoint.seamEndpointId,
      boundaryVertexId: exactBoundaryVertex(result, endpoint.vertexIndex, piece.id).id,
    })),
    grainDegrees: piece.grainDegrees,
    options: AUDIT_OPTIONS,
  };
}

function cross(a: Vec2Mm, b: Vec2Mm, c: Vec2Mm): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function validateRawTopology(piece: PatternPiece, result: ConstrainedTriangulationResult): void {
  const vertexCount = result.vertices.length;
  if (
    vertexCount === 0 ||
    result.triangles.length === 0 ||
    result.triangles.length % 3 !== 0 ||
    result.triangleMaterialFrames2.length !== (result.triangles.length / 3) * 4
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'topology-mismatch',
      `${piece.id} has invalid vertex, triangle, or frame cardinality.`,
    );
  const topology = new Set<string>();
  for (let offset = 0; offset < result.triangles.length; offset += 3) {
    const indices = [
      result.triangles[offset],
      result.triangles[offset + 1],
      result.triangles[offset + 2],
    ] as const;
    if (indices.some((index) => index >= vertexCount) || new Set(indices).size !== 3)
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id} triangle ${offset / 3} has invalid indices.`,
      );
    const points = indices.map((index) => result.vertices[index].positionMm) as [
      Vec2Mm,
      Vec2Mm,
      Vec2Mm,
    ];
    const area = cross(points[0], points[1], points[2]);
    if (!Number.isFinite(area) || area <= AREA_EPSILON)
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id} triangle ${offset / 3} is inverted or degenerate.`,
      );
    const key = [...indices].sort((left, right) => left - right).join(':');
    if (topology.has(key))
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id} contains a duplicate triangle.`,
      );
    topology.add(key);
  }
}

function validateContourLoop(
  piece: PatternPiece,
  contour: PatternContour,
  result: ConstrainedTriangulationResult,
  indices: Uint32Array,
  covered: Set<number>,
  boundaryIdToLocalIndex: Map<string, number>,
): void {
  if (indices.length !== contour.pointsMm.length)
    throw new GarmentPhase1ClothMeshErrorV1(
      'topology-mismatch',
      `${piece.id}/${contour.id} loop cardinality differs from the assembly contour.`,
    );
  indices.forEach((localIndex, contourIndex) => {
    if (localIndex >= result.vertices.length || covered.has(localIndex))
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id}/${contour.id} loop contains an invalid or repeated vertex.`,
      );
    covered.add(localIndex);
    const vertex = result.vertices[localIndex];
    const expectedPoint = contour.pointsMm[contourIndex];
    const expectedCurveId = contour.sourceCurveIds[contourIndex];
    if (
      vertex.source.kind !== 'boundary' ||
      !samePoint(vertex.positionMm, expectedPoint) ||
      vertex.source.provenance.contourId !== contour.id ||
      vertex.source.provenance.sourceCurveId !== expectedCurveId
    )
      throw new GarmentPhase1ClothMeshErrorV1(
        'provenance-mismatch',
        `${piece.id}/${contour.id} boundary provenance drifted at contour vertex ${contourIndex}.`,
      );
    if (boundaryIdToLocalIndex.has(vertex.source.boundaryVertexId))
      throw new GarmentPhase1ClothMeshErrorV1(
        'provenance-mismatch',
        `${piece.id} contains a duplicate boundary vertex id.`,
      );
    boundaryIdToLocalIndex.set(vertex.source.boundaryVertexId, localIndex);
  });
}

function validatePieceResult(
  piece: PatternPiece,
  result: ConstrainedTriangulationResult,
): ValidatedPiece {
  if (
    result.vertices.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumVertices ||
    result.triangles.length / 3 > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumTriangles ||
    result.seamEndpoints.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumSeamEndpoints
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      `${piece.id} exceeds a per-piece compiler resource bound.`,
    );
  validateRawTopology(piece, result);
  const candidate = resultCandidate(result);
  const recomputedHash = triangulationResultFingerprint(candidate);
  if (result.deterministicHash !== recomputedHash)
    throw new GarmentPhase1ClothMeshErrorV1(
      'result-hash-mismatch',
      `${piece.id} deterministic triangulation hash does not match its payload.`,
    );
  if (
    result.quality.verdict !== 'pass' ||
    result.quality.issues.length !== 0 ||
    result.quality.degenerateTriangles !== 0 ||
    result.quality.invertedTriangles !== 0 ||
    result.quality.trianglesOutsideDomain !== 0 ||
    result.quality.duplicateTriangles !== 0 ||
    result.quality.nonManifoldEdges !== 0 ||
    result.quality.missingBoundarySegments !== 0 ||
    result.quality.orphanBoundarySources !== 0 ||
    result.quality.orphanSeamEndpoints !== 0 ||
    result.quality.holesPreserved !== true ||
    result.quality.grainFramesPreserved !== true
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'result-quality-invalid',
      `${piece.id} lacks a clean Phase-1 quality report.`,
    );
  const radians = (piece.grainDegrees * Math.PI) / 180;
  const expectedFrame = new Float32Array([
    Math.cos(radians),
    Math.sin(radians),
    -Math.sin(radians),
    Math.cos(radians),
  ]);
  for (let offset = 0; offset < result.triangleMaterialFrames2.length; offset += 4) {
    if (
      expectedFrame.some(
        (expected, component) => result.triangleMaterialFrames2[offset + component] !== expected,
      )
    )
      throw new GarmentPhase1ClothMeshErrorV1(
        'grain-frame-mismatch',
        `${piece.id} triangle ${offset / 4} does not preserve its exact grain frame.`,
      );
  }
  const contourLoops = new Map<string, Uint32Array>();
  for (const loop of result.boundaryLoops) {
    if (contourLoops.has(loop.inputRingId))
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id} contains a duplicate boundary loop.`,
      );
    contourLoops.set(loop.inputRingId, loop.vertexIndices);
  }
  const covered = new Set<number>();
  const boundaryIdToLocalIndex = new Map<string, number>();
  for (const contour of piece.contours) {
    const loop = result.boundaryLoops.find(
      (candidateLoop) => candidateLoop.inputRingId === contour.id,
    );
    if (!loop || loop.role !== contour.role)
      throw new GarmentPhase1ClothMeshErrorV1(
        'topology-mismatch',
        `${piece.id}/${contour.id} is missing its exact boundary loop.`,
      );
    validateContourLoop(
      piece,
      contour,
      result,
      loop.vertexIndices,
      covered,
      boundaryIdToLocalIndex,
    );
  }
  if (
    result.boundaryLoops.length !== piece.contours.length ||
    covered.size !== result.vertices.length
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'topology-mismatch',
      `${piece.id} contains unexpected loops or non-boundary vertices.`,
    );
  const endpointIds = result.seamEndpoints.map(({ seamEndpointId }) => seamEndpointId);
  if (duplicateValues(endpointIds).length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      `${piece.id} contains duplicate seam endpoint ids.`,
    );
  for (const endpoint of result.seamEndpoints)
    exactBoundaryVertex(result, endpoint.vertexIndex, piece.id);
  const audit = auditTriangulationResult(buildAuditInput(piece, result), candidate);
  if (audit.verdict !== 'pass')
    throw new GarmentPhase1ClothMeshErrorV1(
      'result-quality-invalid',
      `${piece.id} failed the compiler's independent topology audit.`,
      audit.issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  return { piece, result, audit, candidate, boundaryIdToLocalIndex, contourLoops };
}

function contourCurveRange(
  contour: PatternContour,
  sourceCurveId: string,
): readonly [number, number] {
  const curveIndex = contour.sourceCurveIds.indexOf(sourceCurveId);
  if (curveIndex < 0 || contour.sourceCurveIds.lastIndexOf(sourceCurveId) !== curveIndex)
    throw new GarmentPhase1ClothMeshErrorV1(
      'provenance-mismatch',
      `${contour.id} does not contain one unique source curve ${sourceCurveId}.`,
    );
  const lengths = contour.pointsMm.map((point, index) =>
    distance(point, contour.pointsMm[(index + 1) % contour.pointsMm.length]),
  );
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  const prefix = lengths.slice(0, curveIndex).reduce((sum, length) => sum + length, 0);
  return [prefix / perimeter, (prefix + lengths[curveIndex]) / perimeter];
}

function rangeMatches(
  actual: readonly [number, number],
  expected: readonly [number, number],
): boolean {
  return (
    Math.abs(actual[0] - expected[0]) <= RANGE_EPSILON &&
    Math.abs(actual[1] - expected[1]) <= RANGE_EPSILON
  );
}

type ResolvedSeamSide = Readonly<{
  globals: readonly [number, number];
  ownershipKeys: readonly [string, string];
}>;

function resolveSeamSide(
  seam: SeamDefinition,
  assemblySide: SeamSide,
  proof: GarmentPhase1SeamSideProofV1,
  validated: ReadonlyMap<string, ValidatedPiece>,
  vertexOffset: ReadonlyMap<string, number>,
): ResolvedSeamSide {
  if (
    proof.pieceId !== assemblySide.pieceId ||
    proof.contourId !== assemblySide.contourId ||
    proof.direction !== assemblySide.direction
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      `${seam.id}/side-${proof.sideIndex} proof disagrees with GarmentAssemblyIR.`,
    );
  const piece = validated.get(proof.pieceId);
  const offset = vertexOffset.get(proof.pieceId);
  const contour = piece?.piece.contours.find(({ id }) => id === proof.contourId);
  const loop = piece?.contourLoops.get(proof.contourId);
  if (!piece || offset === undefined || !contour || !loop)
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      `${seam.id}/side-${proof.sideIndex} references a missing piece or contour.`,
    );
  if (!rangeMatches(assemblySide.normalizedRange, contourCurveRange(contour, proof.sourceCurveId)))
    throw new GarmentPhase1ClothMeshErrorV1(
      'partial-seam-coverage',
      `${seam.id}/side-${proof.sideIndex} does not cover exactly one declared source curve.`,
    );
  const curveIndex = contour.sourceCurveIds.indexOf(proof.sourceCurveId);
  const forwardStart = loop[curveIndex];
  const forwardEnd = loop[(curveIndex + 1) % loop.length];
  const expectedStart = proof.direction === 'forward' ? forwardStart : forwardEnd;
  const expectedEnd = proof.direction === 'forward' ? forwardEnd : forwardStart;
  const actualStart = piece.boundaryIdToLocalIndex.get(proof.startBoundaryVertexId);
  const actualEnd = piece.boundaryIdToLocalIndex.get(proof.endBoundaryVertexId);
  if (
    actualStart === undefined ||
    actualEnd === undefined ||
    actualStart !== expectedStart ||
    actualEnd !== expectedEnd ||
    actualStart === actualEnd
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'partial-seam-coverage',
      `${seam.id}/side-${proof.sideIndex} endpoints do not prove exact directed edge coverage.`,
    );
  const endpointMap = new Map(
    piece.result.seamEndpoints.map((endpoint) => [endpoint.seamEndpointId, endpoint.vertexIndex]),
  );
  if (
    endpointMap.get(proof.startEndpointId) !== actualStart ||
    endpointMap.get(proof.endEndpointId) !== actualEnd
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      `${seam.id}/side-${proof.sideIndex} named seam endpoints are missing or reversed.`,
    );
  const actualLength = distance(
    piece.result.vertices[actualStart].positionMm,
    piece.result.vertices[actualEnd].positionMm,
  );
  if (
    !Number.isFinite(proof.expectedLengthMm) ||
    Math.abs(actualLength - proof.expectedLengthMm) > proof.expectedLengthMm * 1e-12 + RANGE_EPSILON
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'partial-seam-coverage',
      `${seam.id}/side-${proof.sideIndex} expected length is not proven by the exact edge.`,
    );
  return {
    globals: [offset + actualStart, offset + actualEnd],
    ownershipKeys: [
      `${proof.pieceId}\u0000${String(actualStart)}`,
      `${proof.pieceId}\u0000${String(actualEnd)}`,
    ],
  };
}

function buildSeams(
  assembly: GarmentAssemblyIR,
  proofs: readonly GarmentPhase1SeamProofV1[],
  validated: ReadonlyMap<string, ValidatedPiece>,
  vertexOffset: ReadonlyMap<string, number>,
): readonly ClothSeamMap[] {
  if (assembly.seams.length > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumSeams)
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      'Seam count exceeds the compiler bound.',
    );
  const duplicateProofs = duplicateValues(proofs.map(({ seamId }) => seamId));
  if (duplicateProofs.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'duplicate-seam-proof',
      'Seam proof ids must be unique.',
      duplicateProofs,
    );
  const proofById = new Map(proofs.map((proof) => [proof.seamId, proof]));
  if (proofs.some((proof) => !assembly.seams.some((seam) => seam.id === proof.seamId)))
    throw new GarmentPhase1ClothMeshErrorV1(
      'missing-seam-proof',
      'Compiler request contains a proof for an unknown seam.',
    );
  const claimedEndpointIds = proofs.flatMap((proof) =>
    proof.sides.flatMap((side) => [side.startEndpointId, side.endEndpointId]),
  );
  const duplicateEndpointClaims = duplicateValues(claimedEndpointIds);
  if (duplicateEndpointClaims.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      'Named seam endpoint proof claims must be globally unique.',
      duplicateEndpointClaims,
    );
  const availableEndpointIds = [...validated.values()].flatMap(({ result }) =>
    result.seamEndpoints.map(({ seamEndpointId }) => seamEndpointId),
  );
  const duplicateAvailableEndpoints = duplicateValues(availableEndpointIds);
  if (duplicateAvailableEndpoints.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'seam-endpoint-mismatch',
      'Triangulation seam endpoint ids must be globally unique.',
      duplicateAvailableEndpoints,
    );
  const claimedVertices = new Set<string>();
  return assembly.seams.map((seam) => {
    const proof = proofById.get(seam.id);
    if (!proof)
      throw new GarmentPhase1ClothMeshErrorV1(
        'missing-seam-proof',
        `${seam.id} has no exact seam correspondence proof.`,
      );
    if (
      seam.mapping !== 'equal' ||
      seam.lengthRatio !== 1 ||
      proof.mapping !== 'equal' ||
      proof.lengthRatio !== 1 ||
      proof.operationId !== seam.operationId ||
      !Number.isFinite(proof.exactToleranceMm) ||
      proof.exactToleranceMm < 0 ||
      proof.exactToleranceMm > GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1 ||
      proof.sides[0].sideIndex !== 0 ||
      proof.sides[1].sideIndex !== 1
    )
      throw new GarmentPhase1ClothMeshErrorV1(
        'unsupported-seam-semantics',
        `${seam.id} is not an exact one-to-one equal-stitch seam.`,
      );
    const first = resolveSeamSide(seam, seam.sides[0], proof.sides[0], validated, vertexOffset);
    const second = resolveSeamSide(seam, seam.sides[1], proof.sides[1], validated, vertexOffset);
    if (
      Math.abs(proof.sides[0].expectedLengthMm - proof.sides[1].expectedLengthMm) >
      proof.exactToleranceMm
    )
      throw new GarmentPhase1ClothMeshErrorV1(
        'partial-seam-coverage',
        `${seam.id} equal sides exceed the exact proof tolerance.`,
      );
    const pairs = [
      [first.globals[0], second.globals[0]],
      [first.globals[1], second.globals[1]],
    ] as const;
    const sideA = new Set<number>();
    const sideB = new Set<number>();
    pairs.forEach(([firstGlobal, secondGlobal], pairIndex) => {
      if (firstGlobal === secondGlobal || sideA.has(firstGlobal) || sideB.has(secondGlobal))
        throw new GarmentPhase1ClothMeshErrorV1(
          'non-bijective-seam',
          `${seam.id} seam correspondence is not bijective.`,
        );
      sideA.add(firstGlobal);
      sideB.add(secondGlobal);
      const firstKey = first.ownershipKeys[pairIndex];
      const secondKey = second.ownershipKeys[pairIndex];
      if (claimedVertices.has(firstKey) || claimedVertices.has(secondKey))
        throw new GarmentPhase1ClothMeshErrorV1(
          'non-bijective-seam',
          `${seam.id} reuses a boundary vertex already owned by another seam.`,
        );
      claimedVertices.add(firstKey);
      claimedVertices.add(secondKey);
    });
    return {
      seamId: seam.id,
      mapping: 'equal' as const,
      lengthRatio: 1,
      vertexPairs: Uint32Array.from(pairs.flatMap((pair) => pair)),
    };
  });
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `gpcm1-fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function artifactFingerprint(
  mesh: ClothMeshIR,
  vertexProvenance: readonly GarmentPhase1VertexProvenanceV1[],
  boundaryLoops: readonly GarmentPhase1BoundaryLoopV1[],
  seamEndpoints: readonly GarmentPhase1SeamEndpointV1[],
  frames: Float32Array,
  pieceEvidence: readonly GarmentPhase1PieceEvidenceV1[],
): string {
  return fnv1a64(
    JSON.stringify({
      mesh: {
        schemaVersion: mesh.schemaVersion,
        sourceAssemblyFingerprint: mesh.sourceAssemblyFingerprint,
        sourceUnits: mesh.sourceUnits,
        restPositions2Mm: [...mesh.restPositions2Mm],
        triangles: [...mesh.triangles],
        pieceRanges: mesh.pieceRanges,
        boundarySamples: mesh.boundarySamples,
        seams: mesh.seams.map((seam) => ({ ...seam, vertexPairs: [...seam.vertexPairs] })),
        quality: mesh.quality,
      },
      vertexProvenance,
      boundaryLoops: boundaryLoops.map((loop) => ({
        ...loop,
        localVertexIndices: [...loop.localVertexIndices],
        globalVertexIndices: [...loop.globalVertexIndices],
      })),
      seamEndpoints,
      triangleMaterialFrames2: [...frames],
      pieceEvidence,
    }),
  );
}

function angleDegrees(a: number, b: number, opposite: number): number {
  const cosine = Math.max(-1, Math.min(1, (a * a + b * b - opposite * opposite) / (2 * a * b)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function measureFlattenedQuality(
  positions: Float32Array,
  triangles: Uint32Array,
  maxBoundaryErrorMm: number,
): ClothMeshIR['quality'] {
  let degenerateTriangles = 0;
  let minTriangleAngleDegrees = 180;
  let maxEdgeRatio = 1;
  const point = (index: number): Vec2Mm => [positions[index * 2], positions[index * 2 + 1]];
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = point(triangles[offset]);
    const b = point(triangles[offset + 1]);
    const c = point(triangles[offset + 2]);
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ca = distance(c, a);
    const twiceArea = Math.abs(cross(a, b, c));
    if (
      twiceArea <= AREA_EPSILON ||
      ab <= AREA_EPSILON ||
      bc <= AREA_EPSILON ||
      ca <= AREA_EPSILON
    ) {
      degenerateTriangles += 1;
      continue;
    }
    const edges = [ab, bc, ca].sort((left, right) => left - right);
    maxEdgeRatio = Math.max(maxEdgeRatio, edges[2] / edges[0]);
    minTriangleAngleDegrees = Math.min(
      minTriangleAngleDegrees,
      angleDegrees(ab, ca, bc),
      angleDegrees(ab, bc, ca),
      angleDegrees(bc, ca, ab),
    );
  }
  return {
    degenerateTriangles,
    minTriangleAngleDegrees: minTriangleAngleDegrees === 180 ? 0 : minTriangleAngleDegrees,
    maxEdgeRatio,
    maxBoundaryErrorMm,
  };
}

function compileSnapshot(
  request: GarmentPhase1ClothMeshCompileRequestV1,
): GarmentPhase1ClothMeshArtifactV1 {
  assertRequestShape(request);
  validateAssembly(request.assembly);
  const resultIds = request.pieces.map(({ pieceId }) => pieceId);
  const duplicateResults = duplicateValues(resultIds);
  if (duplicateResults.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'duplicate-piece-result',
      'Piece result ids must be unique.',
      duplicateResults,
    );
  const assemblyIds = new Set(request.assembly.pieces.map(({ id }) => id));
  if (resultIds.some((pieceId) => !assemblyIds.has(pieceId)))
    throw new GarmentPhase1ClothMeshErrorV1(
      'unexpected-piece-result',
      'Compiler request contains a result for an unknown piece.',
    );
  const resultById = new Map(request.pieces.map(({ pieceId, result }) => [pieceId, result]));
  const validated = new Map<string, ValidatedPiece>();
  let totalVertices = 0;
  let totalTriangles = 0;
  for (const piece of request.assembly.pieces) {
    const result = resultById.get(piece.id);
    if (!result)
      throw new GarmentPhase1ClothMeshErrorV1(
        'missing-piece-result',
        `${piece.id} has no triangulation result.`,
      );
    const accepted = validatePieceResult(piece, result);
    validated.set(piece.id, accepted);
    totalVertices += result.vertices.length;
    totalTriangles += result.triangles.length / 3;
  }
  if (
    totalVertices > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumVertices ||
    totalTriangles > GARMENT_PHASE1_CLOTH_MESH_LIMITS_V1.maximumTriangles
  )
    throw new GarmentPhase1ClothMeshErrorV1(
      'resource-budget-exceeded',
      'Combined garment mesh exceeds the compiler resource bound.',
    );

  const positions = new Float32Array(totalVertices * 2);
  const triangles = new Uint32Array(totalTriangles * 3);
  const frames = new Float32Array(totalTriangles * 4);
  const pieceRanges: ClothMeshPieceRange[] = [];
  const boundarySamples: ClothBoundarySample[] = [];
  const vertexProvenance: GarmentPhase1VertexProvenanceV1[] = [];
  const boundaryLoops: GarmentPhase1BoundaryLoopV1[] = [];
  const seamEndpoints: GarmentPhase1SeamEndpointV1[] = [];
  const pieceEvidence: GarmentPhase1PieceEvidenceV1[] = [];
  const vertexOffsets = new Map<string, number>();
  let vertexOffset = 0;
  let triangleOffset = 0;
  let maxFlattenedBoundaryErrorMm = 0;
  for (const piece of request.assembly.pieces) {
    const accepted = validated.get(piece.id)!;
    const { result } = accepted;
    vertexOffsets.set(piece.id, vertexOffset);
    result.vertices.forEach((vertex, localVertexIndex) => {
      const globalVertexIndex = vertexOffset + localVertexIndex;
      positions[globalVertexIndex * 2] = vertex.positionMm[0];
      positions[globalVertexIndex * 2 + 1] = vertex.positionMm[1];
      maxFlattenedBoundaryErrorMm = Math.max(
        maxFlattenedBoundaryErrorMm,
        Math.hypot(
          positions[globalVertexIndex * 2] - vertex.positionMm[0],
          positions[globalVertexIndex * 2 + 1] - vertex.positionMm[1],
        ),
      );
      vertexProvenance.push({
        pieceId: piece.id,
        localVertexIndex,
        globalVertexIndex,
        source: vertex.source,
      });
    });
    result.triangles.forEach((localVertexIndex, index) => {
      triangles[triangleOffset * 3 + index] = vertexOffset + localVertexIndex;
    });
    frames.set(result.triangleMaterialFrames2, triangleOffset * 4);
    for (const loop of result.boundaryLoops) {
      const globalVertexIndices = Uint32Array.from(
        loop.vertexIndices,
        (localIndex) => vertexOffset + localIndex,
      );
      boundaryLoops.push({
        pieceId: piece.id,
        contourId: loop.inputRingId,
        role: loop.role,
        localVertexIndices: loop.vertexIndices.slice(),
        globalVertexIndices,
      });
      loop.vertexIndices.forEach((localIndex) => {
        const vertex = result.vertices[localIndex];
        if (vertex.source.kind !== 'boundary') return;
        boundarySamples.push({
          vertexIndex: vertexOffset + localIndex,
          pieceId: piece.id,
          contourId: loop.inputRingId,
          normalizedArc: vertex.source.provenance.normalizedArc,
          sourceCurveId: vertex.source.provenance.sourceCurveId,
          sourceCurveT: vertex.source.provenance.sourceCurveT,
        });
      });
    }
    for (const endpoint of result.seamEndpoints) {
      const source = result.vertices[endpoint.vertexIndex].source;
      if (source.kind !== 'boundary')
        throw new GarmentPhase1ClothMeshErrorV1(
          'seam-endpoint-mismatch',
          `${piece.id}/${endpoint.seamEndpointId} is not an exact boundary vertex.`,
        );
      seamEndpoints.push({
        pieceId: piece.id,
        seamEndpointId: endpoint.seamEndpointId,
        boundaryVertexId: source.boundaryVertexId,
        localVertexIndex: endpoint.vertexIndex,
        globalVertexIndex: vertexOffset + endpoint.vertexIndex,
      });
    }
    const triangleCount = result.triangles.length / 3;
    pieceRanges.push({
      pieceId: piece.id,
      vertexOffset,
      vertexCount: result.vertices.length,
      triangleOffset,
      triangleCount,
    });
    pieceEvidence.push({
      pieceId: piece.id,
      sourceResultHash: result.deterministicHash,
      recomputedResultHash: triangulationResultFingerprint(accepted.candidate),
      auditVerdict: accepted.audit.verdict as 'pass',
      vertexOffset,
      vertexCount: result.vertices.length,
      triangleOffset,
      triangleCount,
      boundaryLoopCount: result.boundaryLoops.length,
      seamEndpointCount: result.seamEndpoints.length,
    });
    vertexOffset += result.vertices.length;
    triangleOffset += triangleCount;
  }
  const seams = buildSeams(request.assembly, request.seamProofs, validated, vertexOffsets);
  const mesh: ClothMeshIR = {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: garmentAssemblyFingerprint(request.assembly),
    sourceUnits: 'mm',
    restPositions2Mm: positions,
    triangles,
    pieceRanges,
    boundarySamples,
    seams,
    quality: measureFlattenedQuality(positions, triangles, maxFlattenedBoundaryErrorMm),
  };
  const meshErrors = validateClothMeshIR(mesh);
  if (meshErrors.length > 0)
    throw new GarmentPhase1ClothMeshErrorV1(
      'output-invalid',
      'Compiled ClothMeshIR failed its existing validator.',
      meshErrors,
    );
  const deterministicFingerprint = artifactFingerprint(
    mesh,
    vertexProvenance,
    boundaryLoops,
    seamEndpoints,
    frames,
    pieceEvidence,
  );
  return {
    version: GARMENT_PHASE1_CLOTH_MESH_COMPILER_V1,
    mesh,
    vertexProvenance,
    boundaryLoops,
    seamEndpoints,
    triangleMaterialFrames2: frames,
    pieceEvidence,
    deterministicFingerprint,
    claims: {
      acceptanceRequired: true,
      boundaryOnlyPhase1: true,
      distributedSeamSamplingIntegrated: false,
      refinementIntegrated: false,
      bodyPlacementReady: false,
      runtimeIntegrated: false,
      settleAccepted: false,
      productionReady: false,
    },
    blockers: [
      'acceptance-artifact-required',
      'distributed-seam-sampling-not-integrated',
      'target-edge-refinement-not-integrated',
      'body-placement-not-proven',
      'runtime-owner-not-integrated',
      'settle-not-evaluated',
      'production-qualification-not-run',
    ],
  };
}

let compileActive = false;

/**
 * Compiles independently accepted boundary-only Phase-1 triangulations into the existing
 * ClothMeshIR without spatial matching, snapping, cleanup, or fallback behavior. Each currently
 * accepted one-edge seam side produces exactly its two directed endpoint pairs; distributed seam
 * sampling remains explicitly outside this Phase-1 contract. A boundary corner may belong to only
 * one seam in this foundation; multi-seam corner ownership is deliberately unsupported.
 */
export function compileGarmentPhase1ClothMeshV1(
  input: GarmentPhase1ClothMeshCompileRequestV1,
): GarmentPhase1ClothMeshArtifactV1 {
  if (compileActive)
    throw new GarmentPhase1ClothMeshErrorV1(
      'reentrant-call',
      'The garment Phase-1 compiler rejects overlapping or reentrant calls.',
    );
  compileActive = true;
  try {
    return compileSnapshot(snapshotRequest(input));
  } finally {
    compileActive = false;
  }
}
