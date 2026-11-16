import {
  compileGarmentPhase1ClothMeshV1,
  type GarmentPhase1ClothMeshArtifactV1,
  type GarmentPhase1ClothMeshCompileRequestV1,
} from './garment-phase1-cloth-mesh-compiler-v1';
import {
  CLOTH_MESH_IR_VERSION,
  type ClothBoundarySample,
  type ClothMeshIR,
  type ClothMeshPieceRange,
  type ClothSeamMap,
  validateClothMeshIR,
} from './cloth-mesh-ir';
import {
  evaluatePhase2BoundarySamplingArtifactV1,
  type Phase2BoundarySamplingArtifactV1,
  type Phase2BoundarySamplingEvaluationV1,
  type Phase2BoundarySamplingRequestV1,
} from './triangulation/phase2-boundary-sampling-v1';
import { triangulationResultFingerprint } from './triangulation/canonical';
import type {
  BoundaryVertexSource,
  ConstrainedTriangulationResult,
  OutputVertexSource,
} from './triangulation/types';

export const GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1 =
  'garment-phase2-sampled-cloth-mesh-upgrader/1' as const;
export const GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1 =
  'garment-phase2-source-identity-binding/1' as const;

export const GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1 = Object.freeze({
  maximumDepth: 24,
  maximumNodes: 250_000,
  maximumProperties: 1_000_000,
  maximumArrayLength: 250_000,
  maximumTypedArrayLength: 1_000_000,
  maximumPieces: 64,
  maximumVertices: 100_000,
  maximumTriangles: 200_000,
  maximumSeams: 512,
  maximumSeamPairs: 100_000,
  maximumErrorDetails: 32,
  maximumStringLength: 1_024,
} as const);

export type GarmentPhase2SampledClothMeshErrorCodeV1 =
  | 'reentrant-call'
  | 'input-shape-invalid'
  | 'baseline-compile-failed'
  | 'sampling-evaluation-failed'
  | 'resource-budget-exceeded'
  | 'piece-binding-mismatch'
  | 'original-input-mismatch'
  | 'sampled-loop-mismatch'
  | 'sample-binding-mismatch'
  | 'seam-endpoint-mismatch'
  | 'distributed-seam-mismatch'
  | 'output-invalid';

export class GarmentPhase2SampledClothMeshErrorV1 extends Error {
  readonly code: GarmentPhase2SampledClothMeshErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: GarmentPhase2SampledClothMeshErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GarmentPhase2SampledClothMeshErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumErrorDetails)
        .map((detail) =>
          detail.slice(0, GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumStringLength),
        ),
    );
  }
}

export type GarmentPhase2SourceIdentityBindingV1 = Readonly<{
  schemaVersion: typeof GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1;
  assemblyDocumentId: string;
  nativeSamplingSourceFileId: string;
}>;

export type GarmentPhase2SampledClothMeshUpgradeRequestV1 = Readonly<{
  baselineRequest: GarmentPhase1ClothMeshCompileRequestV1;
  samplingRequest: Phase2BoundarySamplingRequestV1;
  samplingArtifact: Phase2BoundarySamplingArtifactV1;
  /** Additive dual-identity binding. Omitted legacy requests retain the V1 equality requirement. */
  sourceIdentityBinding?: GarmentPhase2SourceIdentityBindingV1;
}>;

export type GarmentPhase2BoundaryVertexBindingV1 = Readonly<{
  pieceId: string;
  contourId: string;
  sampledBoundaryVertexId: string;
  localVertexIndex: number;
  globalVertexIndex: number;
  source: OutputVertexSource;
}>;

export type GarmentPhase2BoundaryLoopV1 = Readonly<{
  pieceId: string;
  contourId: string;
  role: 'shell' | 'hole';
  sampledBoundaryVertexIds: readonly string[];
  localVertexIndices: Uint32Array;
  globalVertexIndices: Uint32Array;
}>;

export type GarmentPhase2SeamEndpointV1 = Readonly<{
  pieceId: string;
  seamEndpointId: string;
  boundaryVertexId: string;
  localVertexIndex: number;
  globalVertexIndex: number;
}>;

export type GarmentPhase2PieceEvidenceV1 = Readonly<{
  pieceId: string;
  baselineVertexOffset: number;
  baselineVertexCount: number;
  sampledVertexOffset: number;
  sampledVertexCount: number;
  sampledTriangleOffset: number;
  sampledTriangleCount: number;
  originalBoundaryVertexCount: number;
  insertedBoundarySampleCount: number;
  assemblyGrainDegrees: number;
  samplingGrainDegrees: number;
  sampledResultHash: string;
  recomputedSampledResultHash: string;
  originalInputBoundToBaseline: true;
  sampledLoopOrderBound: true;
  grainDegreesBoundToAssembly: true;
}>;

export type GarmentPhase2SampledClothMeshArtifactV1 = Readonly<{
  version: typeof GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1;
  mesh: ClothMeshIR;
  boundaryVertexBindings: readonly GarmentPhase2BoundaryVertexBindingV1[];
  boundaryLoops: readonly GarmentPhase2BoundaryLoopV1[];
  seamEndpoints: readonly GarmentPhase2SeamEndpointV1[];
  triangleMaterialFrames2: Float32Array;
  pieceEvidence: readonly GarmentPhase2PieceEvidenceV1[];
  sourceBinding: Readonly<{
    assemblyDocumentId: string;
    assemblyRevision: string;
    samplingSourceFileId: string;
    identityBindingSchemaVersion: typeof GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1 | null;
    assemblyDocumentIdBound: true;
    samplingSourceFileIdBound: true;
    dualIdentityBound: boolean;
    documentIdMatch: boolean;
    sourceRevisionRepresentedInSamplingContract: false;
  }>;
  baselineCompilerFingerprint: string;
  samplingFingerprint: string;
  deterministicFingerprint: string;
  claims: Readonly<{
    acceptanceRequired: true;
    freshPhase1BaselineAccepted: true;
    requestLocalBoundarySamplingIntegrated: true;
    distributedEqualSeamPairsIntegrated: true;
    sourceDocumentIdBound: true;
    nativeSamplingSourceFileIdBound: true;
    sourceRevisionBound: false;
    sourceAuthenticityAccepted: false;
    curvedSourceEvaluationIntegrated: false;
    interiorRefinementIntegrated: false;
    bodyPlacementReady: false;
    runtimeIntegrated: false;
    settleAccepted: false;
    productionReady: false;
  }>;
  blockers: readonly [
    'acceptance-artifact-required',
    'phase-d-content-binding-not-integrated',
    'source-revision-not-represented-in-sampling-contract',
    'curved-source-evaluator-not-integrated',
    'interior-refinement-not-integrated',
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ];
}>;

type RequestParts = Readonly<{
  baselineRequest: GarmentPhase1ClothMeshCompileRequestV1;
  samplingRequest: Phase2BoundarySamplingRequestV1;
  samplingArtifact: Phase2BoundarySamplingArtifactV1;
  sourceIdentityBinding: GarmentPhase2SourceIdentityBindingV1 | null;
}>;

type BaselineAssemblyBinding = Readonly<{
  documentId: string;
  revision: string;
  pieces: readonly Readonly<{ pieceId: string; grainDegrees: number }>[];
}>;

type PiecePlan = Readonly<{
  pieceId: string;
  result: ConstrainedTriangulationResult;
  sampledInput: Phase2BoundarySamplingArtifactV1['pieces'][number]['sampledInput'];
  vertexOffset: number;
  triangleOffset: number;
  sampledIdToLocalIndex: ReadonlyMap<string, number>;
  localIndexToSampledId: ReadonlyMap<number, string>;
  loops: readonly GarmentPhase2BoundaryLoopV1[];
  endpoints: readonly GarmentPhase2SeamEndpointV1[];
  bindings: readonly GarmentPhase2BoundaryVertexBindingV1[];
  evidence: GarmentPhase2PieceEvidenceV1;
}>;

function fail(
  code: GarmentPhase2SampledClothMeshErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new GarmentPhase2SampledClothMeshErrorV1(code, message, details);
}

function extractSourceIdentityBinding(value: unknown): GarmentPhase2SourceIdentityBindingV1 {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail('input-shape-invalid', 'Source identity binding must be one exact plain object.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = ['assemblyDocumentId', 'nativeSamplingSourceFileId', 'schemaVersion'];
  const keys = Reflect.ownKeys(descriptors);
  const actual = keys.filter((key): key is string => typeof key === 'string').sort();
  if (
    actual.length !== keys.length ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail('input-shape-invalid', 'Source identity binding has an unsupported property shape.');
  const values: Record<string, unknown> = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('input-shape-invalid', `Source identity binding ${key} must be enumerable own data.`);
    values[key] = descriptor.value;
  }
  if (
    values.schemaVersion !== GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1 ||
    typeof values.assemblyDocumentId !== 'string' ||
    values.assemblyDocumentId.length === 0 ||
    values.assemblyDocumentId.length >
      GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumStringLength ||
    typeof values.nativeSamplingSourceFileId !== 'string' ||
    values.nativeSamplingSourceFileId.length === 0 ||
    values.nativeSamplingSourceFileId.length >
      GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumStringLength
  )
    fail('input-shape-invalid', 'Source identity binding values are invalid.');
  return Object.freeze({
    schemaVersion: GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1,
    assemblyDocumentId: values.assemblyDocumentId,
    nativeSamplingSourceFileId: values.nativeSamplingSourceFileId,
  });
}

function extractRequestParts(input: unknown): RequestParts {
  try {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype
    )
      fail('input-shape-invalid', 'Upgrade request must be one exact plain object.');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    const expectedLegacy = ['baselineRequest', 'samplingArtifact', 'samplingRequest'];
    const expectedBound = [...expectedLegacy, 'sourceIdentityBinding'].sort();
    const actual = keys.filter((key): key is string => typeof key === 'string').sort();
    const expected = actual.length === expectedLegacy.length ? expectedLegacy : expectedBound;
    if (
      actual.length !== keys.length ||
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])
    )
      fail('input-shape-invalid', 'Upgrade request has an unsupported property shape.');
    const values: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `Upgrade request ${key} must be enumerable own data.`);
      values[key] = descriptor.value;
    }
    return {
      baselineRequest: values.baselineRequest as GarmentPhase1ClothMeshCompileRequestV1,
      samplingRequest: values.samplingRequest as Phase2BoundarySamplingRequestV1,
      samplingArtifact: values.samplingArtifact as Phase2BoundarySamplingArtifactV1,
      sourceIdentityBinding:
        values.sourceIdentityBinding === undefined
          ? null
          : extractSourceIdentityBinding(values.sourceIdentityBinding),
    };
  } catch (error) {
    if (error instanceof GarmentPhase2SampledClothMeshErrorV1) throw error;
    fail('input-shape-invalid', 'Upgrade request reflection failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

type SnapshotState = {
  nodes: number;
  properties: number;
  active: Set<object>;
};

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;

function snapshotBaselineTypedArray(
  value: object,
  path: string,
  state: SnapshotState,
): Uint32Array | Float32Array {
  if (!typedArrayLengthGetter || !typedArrayBufferGetter)
    fail('input-shape-invalid', `${path} cannot be inspected safely.`);
  if (state.active.has(value)) fail('input-shape-invalid', `${path} contains a cyclic reference.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  let length: number;
  let buffer: ArrayBufferLike;
  try {
    length = typedArrayLengthGetter.call(value) as number;
    buffer = typedArrayBufferGetter.call(value) as ArrayBufferLike;
  } catch (error) {
    fail('input-shape-invalid', `${path} typed-array inspection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (length > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumTypedArrayLength)
    fail('resource-budget-exceeded', `${path} exceeds the typed-array bound.`);
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    fail('input-shape-invalid', `${path} must use a private ArrayBuffer.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = keys.filter((key): key is string => typeof key === 'string');
  if (
    dataKeys.length !== keys.length ||
    dataKeys.length !== length ||
    dataKeys.some((key, index) => key !== String(index))
  )
    fail('input-shape-invalid', `${path} must contain only dense typed-array element data.`);
  state.properties += dataKeys.length;
  if (state.properties > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumProperties)
    fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('input-shape-invalid', `${path}[${key}] must be enumerable own data.`);
    if (!Number.isFinite(descriptor.value))
      fail('input-shape-invalid', `${path}[${key}] must be finite.`);
  }
  let copy: Uint32Array | Float32Array;
  try {
    copy =
      Object.getPrototypeOf(value) === Uint32Array.prototype
        ? (Uint32Array.prototype.slice.call(value) as Uint32Array)
        : (Float32Array.prototype.slice.call(value) as Float32Array);
  } catch (error) {
    fail('input-shape-invalid', `${path} typed-array copy failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  state.active.delete(value);
  return copy;
}

function snapshotBaselineData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('input-shape-invalid', `${path} must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumStringLength)
      fail('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object')
    fail('input-shape-invalid', `${path} is not plain serializable data.`);
  if (depth > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumDepth)
    fail('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (error) {
    fail('input-shape-invalid', `${path} prototype inspection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (prototype === Uint32Array.prototype || prototype === Float32Array.prototype)
    return snapshotBaselineTypedArray(value, path, state);
  if (state.active.has(value)) fail('input-shape-invalid', `${path} contains a cyclic graph.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype))
    fail('input-shape-invalid', `${path} must use a supported plain prototype.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol'))
    fail('input-shape-invalid', `${path} contains symbol properties.`);
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.properties += dataKeys.length;
  if (state.properties > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumProperties)
    fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      fail('input-shape-invalid', `${path} has no plain length descriptor.`);
    const length = lengthDescriptor.value as number;
    if (length > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumArrayLength)
      fail('resource-budget-exceeded', `${path} exceeds the array bound.`);
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      fail('input-shape-invalid', `${path} must be a dense array without extras.`);
    const output = dataKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}[${key}] must be enumerable own data.`);
      return snapshotBaselineData(descriptor.value, `${path}[${key}]`, depth + 1, state);
    });
    state.active.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('input-shape-invalid', `${path}.${key} must be enumerable own data.`);
    output[key] = snapshotBaselineData(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
  state.active.delete(value);
  return output;
}

function snapshotBaselineRequest(
  request: GarmentPhase1ClothMeshCompileRequestV1,
): GarmentPhase1ClothMeshCompileRequestV1 {
  try {
    return snapshotBaselineData(request, 'baselineRequest', 0, {
      nodes: 0,
      properties: 0,
      active: new Set<object>(),
    }) as GarmentPhase1ClothMeshCompileRequestV1;
  } catch (error) {
    if (error instanceof GarmentPhase2SampledClothMeshErrorV1) throw error;
    fail('input-shape-invalid', 'Baseline request snapshot failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function baselineAssemblyBinding(
  request: GarmentPhase1ClothMeshCompileRequestV1,
): BaselineAssemblyBinding {
  return {
    documentId: request.assembly.source.documentId,
    revision: request.assembly.source.revision,
    pieces: request.assembly.pieces.map((piece) => ({
      pieceId: piece.id,
      grainDegrees: piece.grainDegrees,
    })),
  };
}

function compileFreshBaseline(
  request: GarmentPhase1ClothMeshCompileRequestV1,
): GarmentPhase1ClothMeshArtifactV1 {
  try {
    return compileGarmentPhase1ClothMeshV1(request);
  } catch (error) {
    fail('baseline-compile-failed', 'Fresh Phase-1 baseline compilation failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function evaluateSampling(
  request: Phase2BoundarySamplingRequestV1,
  artifact: Phase2BoundarySamplingArtifactV1,
): Phase2BoundarySamplingEvaluationV1 {
  try {
    return evaluatePhase2BoundarySamplingArtifactV1(request, artifact);
  } catch (error) {
    fail('sampling-evaluation-failed', 'Phase-2 sampling artifact evaluation failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function duplicateStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function samePosition(left: readonly [number, number], right: readonly [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function sameProvenance(left: BoundaryVertexSource, right: BoundaryVertexSource): boolean {
  return (
    left.contourId === right.contourId &&
    left.sourceCurveId === right.sourceCurveId &&
    left.sourceCurveParameterSpace === right.sourceCurveParameterSpace &&
    left.sourceCurveT === right.sourceCurveT &&
    left.normalizedArc === right.normalizedArc
  );
}

function copyOutputSource(source: OutputVertexSource): OutputVertexSource {
  if (source.kind === 'boundary')
    return {
      kind: 'boundary',
      boundaryVertexId: source.boundaryVertexId,
      provenance: { ...source.provenance },
    };
  if (source.kind === 'boundary-sample')
    return {
      kind: 'boundary-sample',
      parentSegment: { ...source.parentSegment },
      provenance: { ...source.provenance },
    };
  return {
    kind: 'interior',
    generator: source.generator,
    ...(source.sourceId === undefined ? {} : { sourceId: source.sourceId }),
  };
}

function baselineBoundaryIdByGlobal(
  baseline: GarmentPhase1ClothMeshArtifactV1,
): ReadonlyMap<number, string> {
  const output = new Map<number, string>();
  for (const provenance of baseline.vertexProvenance) {
    if (provenance.source.kind !== 'boundary' || output.has(provenance.globalVertexIndex))
      fail(
        'original-input-mismatch',
        'Fresh Phase-1 baseline contains non-boundary or duplicate vertex provenance.',
      );
    output.set(provenance.globalVertexIndex, provenance.source.boundaryVertexId);
  }
  return output;
}

function bindPiece(
  baseline: GarmentPhase1ClothMeshArtifactV1,
  evaluation: Phase2BoundarySamplingEvaluationV1,
  assemblyPiece: BaselineAssemblyBinding['pieces'][number],
  pieceIndex: number,
  vertexOffset: number,
  triangleOffset: number,
): PiecePlan {
  const baselineRange = baseline.mesh.pieceRanges[pieceIndex];
  const requestPiece = evaluation.canonicalRequest.pieces[pieceIndex];
  const sampledPiece = evaluation.canonicalArtifact.pieces[pieceIndex];
  if (
    !baselineRange ||
    !requestPiece ||
    !sampledPiece ||
    assemblyPiece.pieceId !== baselineRange.pieceId ||
    requestPiece.input.pieceId !== baselineRange.pieceId ||
    sampledPiece.pieceId !== baselineRange.pieceId ||
    sampledPiece.sampledInput.pieceId !== baselineRange.pieceId
  )
    fail(
      'piece-binding-mismatch',
      `Piece ${pieceIndex} does not bind across baseline and sampling.`,
    );
  const pieceId = baselineRange.pieceId;
  if (requestPiece.input.grainDegrees !== assemblyPiece.grainDegrees)
    fail(
      'original-input-mismatch',
      `${pieceId} sampling grainDegrees differs from the accepted assembly piece.`,
    );
  const result = sampledPiece.result;
  const originalRings = [requestPiece.input.shell, ...requestPiece.input.holes];
  const sampledRings = [sampledPiece.sampledInput.shell, ...sampledPiece.sampledInput.holes];
  const baselineLoops = baseline.boundaryLoops.filter((loop) => loop.pieceId === pieceId);
  if (
    sampledPiece.originalBoundaryVertexCount !== baselineRange.vertexCount ||
    sampledPiece.originalBoundaryVertexCount !==
      originalRings.reduce((sum, ring) => sum + ring.vertices.length, 0) ||
    sampledPiece.sampledBoundaryVertexCount !== result.vertices.length ||
    sampledPiece.sampledBoundaryVertexCount !==
      sampledRings.reduce((sum, ring) => sum + ring.vertices.length, 0) ||
    originalRings.length !== sampledRings.length ||
    originalRings.length !== baselineLoops.length ||
    result.boundaryLoops.length !== sampledRings.length
  )
    fail('piece-binding-mismatch', `${pieceId} has inconsistent original/sampled cardinality.`);

  const baselineProvenance = baseline.vertexProvenance.filter(
    (provenance) => provenance.pieceId === pieceId,
  );
  const baselineByBoundaryId = new Map<string, (typeof baselineProvenance)[number]>();
  for (const provenance of baselineProvenance) {
    if (
      provenance.source.kind !== 'boundary' ||
      baselineByBoundaryId.has(provenance.source.boundaryVertexId)
    )
      fail('original-input-mismatch', `${pieceId} baseline boundary ids are not bijective.`);
    baselineByBoundaryId.set(provenance.source.boundaryVertexId, provenance);
  }
  if (baselineByBoundaryId.size !== baselineRange.vertexCount)
    fail('original-input-mismatch', `${pieceId} baseline range/provenance cardinality drifted.`);

  const sampledIdToLocalIndex = new Map<string, number>();
  const localIndexToSampledId = new Map<number, string>();
  const bindings: GarmentPhase2BoundaryVertexBindingV1[] = [];
  const loops: GarmentPhase2BoundaryLoopV1[] = [];
  const coveredLocalIndices = new Set<number>();
  let insertedCount = 0;

  for (let ringIndex = 0; ringIndex < sampledRings.length; ringIndex += 1) {
    const originalRing = originalRings[ringIndex];
    const sampledRing = sampledRings[ringIndex];
    const baselineLoop = baselineLoops.find((loop) => loop.contourId === originalRing.id);
    const resultLoops = result.boundaryLoops.filter((loop) => loop.inputRingId === sampledRing.id);
    if (
      sampledRing.id !== originalRing.id ||
      sampledRing.role !== originalRing.role ||
      !baselineLoop ||
      baselineLoop.role !== originalRing.role ||
      resultLoops.length !== 1 ||
      resultLoops[0].role !== sampledRing.role ||
      resultLoops[0].vertexIndices.length !== sampledRing.vertices.length
    )
      fail('sampled-loop-mismatch', `${pieceId}/${sampledRing.id} loop identity drifted.`);
    const resultLoop = resultLoops[0];
    const originalIdsInSampledOrder: string[] = [];
    const sampledIds: string[] = [];
    resultLoop.vertexIndices.forEach((localVertexIndex, sampledRingIndex) => {
      const sampledVertex = sampledRing.vertices[sampledRingIndex];
      const outputVertex = result.vertices[localVertexIndex];
      if (
        !outputVertex ||
        localVertexIndex >= result.vertices.length ||
        coveredLocalIndices.has(localVertexIndex) ||
        sampledIdToLocalIndex.has(sampledVertex.id) ||
        !samePosition(outputVertex.positionMm, sampledVertex.positionMm) ||
        outputVertex.source.kind === 'interior' ||
        !sameProvenance(outputVertex.source.provenance, sampledVertex.source) ||
        (outputVertex.source.kind === 'boundary' &&
          outputVertex.source.boundaryVertexId !== sampledVertex.id)
      )
        fail(
          'sample-binding-mismatch',
          `${pieceId}/${sampledRing.id}/${sampledRingIndex} has no exact loop-order binding.`,
        );
      coveredLocalIndices.add(localVertexIndex);
      sampledIdToLocalIndex.set(sampledVertex.id, localVertexIndex);
      localIndexToSampledId.set(localVertexIndex, sampledVertex.id);
      sampledIds.push(sampledVertex.id);
      if (outputVertex.source.kind === 'boundary') originalIdsInSampledOrder.push(sampledVertex.id);
      else insertedCount += 1;
      bindings.push({
        pieceId,
        contourId: sampledRing.id,
        sampledBoundaryVertexId: sampledVertex.id,
        localVertexIndex,
        globalVertexIndex: vertexOffset + localVertexIndex,
        source: copyOutputSource(outputVertex.source),
      });
    });
    const baselineIds = [...baselineLoop.localVertexIndices].map((localIndex) => {
      const provenance = baseline.vertexProvenance.find(
        (candidate) => candidate.pieceId === pieceId && candidate.localVertexIndex === localIndex,
      );
      if (!provenance || provenance.source.kind !== 'boundary')
        fail(
          'original-input-mismatch',
          `${pieceId}/${originalRing.id} baseline loop lost identity.`,
        );
      return provenance.source.boundaryVertexId;
    });
    const originalIds = originalRing.vertices.map(({ id }) => id);
    if (
      JSON.stringify(originalIdsInSampledOrder) !== JSON.stringify(originalIds) ||
      JSON.stringify(baselineIds) !== JSON.stringify(originalIds)
    )
      fail(
        'original-input-mismatch',
        `${pieceId}/${originalRing.id} original loop is not an exact sampled-loop subsequence.`,
      );
    loops.push({
      pieceId,
      contourId: sampledRing.id,
      role: sampledRing.role,
      sampledBoundaryVertexIds: sampledIds,
      localVertexIndices: resultLoop.vertexIndices.slice(),
      globalVertexIndices: Uint32Array.from(
        resultLoop.vertexIndices,
        (localIndex) => vertexOffset + localIndex,
      ),
    });
  }
  if (
    coveredLocalIndices.size !== result.vertices.length ||
    insertedCount !== sampledPiece.insertedBoundarySampleCount
  )
    fail('sample-binding-mismatch', `${pieceId} has unbound or miscounted sampled vertices.`);

  const baselineBoundarySamples = new Map(
    baseline.mesh.boundarySamples
      .filter((sample) => sample.pieceId === pieceId)
      .map((sample) => [sample.vertexIndex, sample] as const),
  );
  for (const originalRing of originalRings) {
    for (const originalVertex of originalRing.vertices) {
      const baselineVertex = baselineByBoundaryId.get(originalVertex.id);
      if (!baselineVertex || baselineVertex.source.kind !== 'boundary')
        fail('original-input-mismatch', `${pieceId}/${originalVertex.id} is absent from baseline.`);
      const globalIndex = baselineVertex.globalVertexIndex;
      const baselineSample = baselineBoundarySamples.get(globalIndex);
      if (
        globalIndex !== baselineRange.vertexOffset + baselineVertex.localVertexIndex ||
        baseline.mesh.restPositions2Mm[globalIndex * 2] !==
          Math.fround(originalVertex.positionMm[0]) ||
        baseline.mesh.restPositions2Mm[globalIndex * 2 + 1] !==
          Math.fround(originalVertex.positionMm[1]) ||
        !sameProvenance(baselineVertex.source.provenance, originalVertex.source) ||
        !baselineSample ||
        baselineSample.contourId !== originalRing.id ||
        baselineSample.sourceCurveId !== originalVertex.source.sourceCurveId ||
        baselineSample.sourceCurveT !== originalVertex.source.sourceCurveT ||
        baselineSample.normalizedArc !== originalVertex.source.normalizedArc
      )
        fail(
          'original-input-mismatch',
          `${pieceId}/${originalVertex.id} does not exactly bind to accepted assembly baseline.`,
        );
    }
  }

  const baselineEndpoints = baseline.seamEndpoints.filter(
    (endpoint) => endpoint.pieceId === pieceId,
  );
  const baselineEndpointById = new Map(
    baselineEndpoints.map((endpoint) => [endpoint.seamEndpointId, endpoint] as const),
  );
  const originalEndpointById = new Map(
    requestPiece.input.seamEndpoints.map((endpoint) => [endpoint.id, endpoint] as const),
  );
  if (
    baselineEndpointById.size !== baselineEndpoints.length ||
    originalEndpointById.size !== requestPiece.input.seamEndpoints.length ||
    result.seamEndpoints.length !== baselineEndpoints.length
  )
    fail('seam-endpoint-mismatch', `${pieceId} seam endpoint cardinality drifted.`);
  const endpoints = result.seamEndpoints.map((endpoint): GarmentPhase2SeamEndpointV1 => {
    const source = result.vertices[endpoint.vertexIndex]?.source;
    const baselineEndpoint = baselineEndpointById.get(endpoint.seamEndpointId);
    const originalEndpoint = originalEndpointById.get(endpoint.seamEndpointId);
    if (
      source?.kind !== 'boundary' ||
      !baselineEndpoint ||
      !originalEndpoint ||
      source.boundaryVertexId !== originalEndpoint.boundaryVertexId ||
      baselineEndpoint.boundaryVertexId !== originalEndpoint.boundaryVertexId
    )
      fail(
        'seam-endpoint-mismatch',
        `${pieceId}/${endpoint.seamEndpointId} is not the accepted original endpoint.`,
      );
    return {
      pieceId,
      seamEndpointId: endpoint.seamEndpointId,
      boundaryVertexId: source.boundaryVertexId,
      localVertexIndex: endpoint.vertexIndex,
      globalVertexIndex: vertexOffset + endpoint.vertexIndex,
    };
  });

  return {
    pieceId,
    result,
    sampledInput: sampledPiece.sampledInput,
    vertexOffset,
    triangleOffset,
    sampledIdToLocalIndex,
    localIndexToSampledId,
    loops,
    endpoints,
    bindings,
    evidence: {
      pieceId,
      baselineVertexOffset: baselineRange.vertexOffset,
      baselineVertexCount: baselineRange.vertexCount,
      sampledVertexOffset: vertexOffset,
      sampledVertexCount: result.vertices.length,
      sampledTriangleOffset: triangleOffset,
      sampledTriangleCount: result.triangles.length / 3,
      originalBoundaryVertexCount: sampledPiece.originalBoundaryVertexCount,
      insertedBoundarySampleCount: sampledPiece.insertedBoundarySampleCount,
      assemblyGrainDegrees: assemblyPiece.grainDegrees,
      samplingGrainDegrees: requestPiece.input.grainDegrees,
      sampledResultHash: result.deterministicHash,
      recomputedSampledResultHash: triangulationResultFingerprint({
        vertices: result.vertices,
        triangles: result.triangles,
        boundaryLoops: result.boundaryLoops,
        seamEndpoints: result.seamEndpoints,
        triangleMaterialFrames2: result.triangleMaterialFrames2,
      }),
      originalInputBoundToBaseline: true,
      sampledLoopOrderBound: true,
      grainDegreesBoundToAssembly: true,
    },
  };
}

function buildDistributedSeams(
  baseline: GarmentPhase1ClothMeshArtifactV1,
  evaluation: Phase2BoundarySamplingEvaluationV1,
  plans: readonly PiecePlan[],
): readonly ClothSeamMap[] {
  if (baseline.mesh.seams.length > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumSeams)
    fail('resource-budget-exceeded', 'Seam count exceeds the Phase-2 upgrader bound.');
  const evidenceById = new Map(
    evaluation.canonicalArtifact.equalSeams.map((seam) => [seam.seamId, seam] as const),
  );
  const requestById = new Map(
    evaluation.canonicalRequest.equalSeams.map((seam) => [seam.seamId, seam] as const),
  );
  if (
    evidenceById.size !== evaluation.canonicalArtifact.equalSeams.length ||
    requestById.size !== evaluation.canonicalRequest.equalSeams.length ||
    evidenceById.size !== baseline.mesh.seams.length ||
    requestById.size !== baseline.mesh.seams.length
  )
    fail('distributed-seam-mismatch', 'Baseline and Phase-2 seam sets differ.');
  const planByPieceId = new Map(plans.map((plan) => [plan.pieceId, plan] as const));
  const baselineIdByGlobal = baselineBoundaryIdByGlobal(baseline);
  const claimedVertices = new Set<string>();
  let pairCount = 0;
  return baseline.mesh.seams.map((baselineSeam) => {
    const evidence = evidenceById.get(baselineSeam.seamId);
    const request = requestById.get(baselineSeam.seamId);
    if (
      !evidence ||
      !request ||
      baselineSeam.mapping !== 'equal' ||
      baselineSeam.lengthRatio !== 1 ||
      baselineSeam.vertexPairs.length !== 4 ||
      evidence.sides.length !== 2 ||
      request.sides.length !== 2 ||
      evidence.sides[0].directedBoundaryVertexIds.length !== evidence.sharedSegmentCount + 1 ||
      evidence.sides[1].directedBoundaryVertexIds.length !== evidence.sharedSegmentCount + 1
    )
      fail(
        'distributed-seam-mismatch',
        `${baselineSeam.seamId} lacks exact baseline or shared-progress evidence.`,
      );
    const resolveDirectedSide = (sideIndex: 0 | 1) => {
      const side = evidence.sides[sideIndex];
      const requestSide = request.sides[sideIndex];
      const plan = planByPieceId.get(side.pieceId);
      const edge = evaluation.canonicalArtifact.edges.find(
        (candidate) => candidate.edgeId === side.edgeId,
      );
      const requestEdge = evaluation.canonicalRequest.pieces
        .find(({ input }) => input.pieceId === side.pieceId)
        ?.edges.find((candidate) => candidate.edgeId === side.edgeId);
      if (
        !plan ||
        !edge ||
        !requestEdge ||
        requestSide.pieceId !== side.pieceId ||
        requestSide.edgeId !== side.edgeId ||
        requestSide.direction !== side.direction ||
        edge.pieceId !== side.pieceId ||
        edge.sharedEqualSeamId !== baselineSeam.seamId ||
        requestEdge.pieceId !== side.pieceId
      )
        fail(
          'distributed-seam-mismatch',
          `${baselineSeam.seamId}/side-${sideIndex} edge identity drifted.`,
        );
      const nativeIds = [
        requestEdge.startBoundaryVertexId,
        ...edge.insertedBoundarySampleIds,
        requestEdge.endBoundaryVertexId,
      ];
      const expectedDirectedIds =
        side.direction === 'forward' ? nativeIds : [...nativeIds].reverse();
      if (JSON.stringify(expectedDirectedIds) !== JSON.stringify(side.directedBoundaryVertexIds))
        fail(
          'distributed-seam-mismatch',
          `${baselineSeam.seamId}/side-${sideIndex} lost exact directed edge coverage.`,
        );
      return side.directedBoundaryVertexIds.map((sampledId) => {
        const localIndex = plan.sampledIdToLocalIndex.get(sampledId);
        if (localIndex === undefined)
          fail(
            'distributed-seam-mismatch',
            `${baselineSeam.seamId}/${sampledId} has no audited loop-order binding.`,
          );
        return {
          sampledId,
          globalIndex: plan.vertexOffset + localIndex,
          ownershipKey: `${plan.pieceId}\u0000${String(localIndex)}`,
        };
      });
    };
    const directedSides = [resolveDirectedSide(0), resolveDirectedSide(1)] as const;
    if (directedSides[0].length !== directedSides[1].length)
      fail('distributed-seam-mismatch', `${baselineSeam.seamId} side counts differ.`);
    const baselineEndpointIds = [
      baselineIdByGlobal.get(baselineSeam.vertexPairs[0]),
      baselineIdByGlobal.get(baselineSeam.vertexPairs[1]),
      baselineIdByGlobal.get(baselineSeam.vertexPairs[2]),
      baselineIdByGlobal.get(baselineSeam.vertexPairs[3]),
    ];
    const lastIndex = directedSides[0].length - 1;
    if (
      baselineEndpointIds.some((id) => id === undefined) ||
      directedSides[0][0].sampledId !== baselineEndpointIds[0] ||
      directedSides[1][0].sampledId !== baselineEndpointIds[1] ||
      directedSides[0][lastIndex].sampledId !== baselineEndpointIds[2] ||
      directedSides[1][lastIndex].sampledId !== baselineEndpointIds[3]
    )
      fail(
        'distributed-seam-mismatch',
        `${baselineSeam.seamId} first/last pairs differ from accepted Phase-1 endpoints.`,
      );
    const vertexPairs = new Uint32Array(directedSides[0].length * 2);
    const sideA = new Set<number>();
    const sideB = new Set<number>();
    directedSides[0].forEach((first, index) => {
      const second = directedSides[1][index];
      if (
        first.globalIndex === second.globalIndex ||
        sideA.has(first.globalIndex) ||
        sideB.has(second.globalIndex) ||
        claimedVertices.has(first.ownershipKey) ||
        claimedVertices.has(second.ownershipKey)
      )
        fail(
          'distributed-seam-mismatch',
          `${baselineSeam.seamId} correspondence is partial, reused, or non-bijective.`,
        );
      sideA.add(first.globalIndex);
      sideB.add(second.globalIndex);
      claimedVertices.add(first.ownershipKey);
      claimedVertices.add(second.ownershipKey);
      vertexPairs[index * 2] = first.globalIndex;
      vertexPairs[index * 2 + 1] = second.globalIndex;
    });
    pairCount += directedSides[0].length;
    if (pairCount > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumSeamPairs)
      fail('resource-budget-exceeded', 'Distributed seam pair count exceeds the upgrader bound.');
    return {
      seamId: baselineSeam.seamId,
      mapping: 'equal',
      lengthRatio: 1,
      vertexPairs,
    };
  });
}

function cross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function distance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function angleDegrees(a: number, b: number, opposite: number): number {
  const cosine = Math.max(-1, Math.min(1, (a * a + b * b - opposite * opposite) / (2 * a * b)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function measureQuality(
  positions: Float32Array,
  triangles: Uint32Array,
  maxBoundaryErrorMm: number,
): ClothMeshIR['quality'] {
  let degenerateTriangles = 0;
  let minTriangleAngleDegrees = 180;
  let maxEdgeRatio = 1;
  const point = (index: number): readonly [number, number] => [
    positions[index * 2],
    positions[index * 2 + 1],
  ];
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = point(triangles[offset]);
    const b = point(triangles[offset + 1]);
    const c = point(triangles[offset + 2]);
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ca = distance(c, a);
    if (Math.abs(cross(a, b, c)) <= 1e-9 || ab <= 1e-9 || bc <= 1e-9 || ca <= 1e-9) {
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

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `gp2u1-fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function artifactFingerprint(
  mesh: ClothMeshIR,
  bindings: readonly GarmentPhase2BoundaryVertexBindingV1[],
  loops: readonly GarmentPhase2BoundaryLoopV1[],
  endpoints: readonly GarmentPhase2SeamEndpointV1[],
  frames: Float32Array,
  pieceEvidence: readonly GarmentPhase2PieceEvidenceV1[],
  sourceBinding: GarmentPhase2SampledClothMeshArtifactV1['sourceBinding'],
  baselineFingerprint: string,
  samplingFingerprint: string,
): string {
  return fnv1a64(
    JSON.stringify({
      version: GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1,
      mesh: {
        ...mesh,
        restPositions2Mm: [...mesh.restPositions2Mm],
        triangles: [...mesh.triangles],
        seams: mesh.seams.map((seam) => ({ ...seam, vertexPairs: [...seam.vertexPairs] })),
      },
      bindings,
      loops: loops.map((loop) => ({
        ...loop,
        localVertexIndices: [...loop.localVertexIndices],
        globalVertexIndices: [...loop.globalVertexIndices],
      })),
      endpoints,
      frames: [...frames],
      pieceEvidence,
      sourceBinding,
      baselineFingerprint,
      samplingFingerprint,
    }),
  );
}

function freezeOwnedPlainData<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    Object.isFrozen(value)
  )
    return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeOwnedPlainData(child);
  Object.freeze(value);
  return value;
}

function buildUpgrade(
  baseline: GarmentPhase1ClothMeshArtifactV1,
  evaluation: Phase2BoundarySamplingEvaluationV1,
  assemblyBinding: BaselineAssemblyBinding,
  sourceIdentityBinding: GarmentPhase2SourceIdentityBindingV1 | null,
): GarmentPhase2SampledClothMeshArtifactV1 {
  const baselinePieceIds = baseline.mesh.pieceRanges.map(({ pieceId }) => pieceId);
  const requestPieceIds = evaluation.canonicalRequest.pieces.map(({ input }) => input.pieceId);
  const artifactPieceIds = evaluation.canonicalArtifact.pieces.map(({ pieceId }) => pieceId);
  const assemblyPieceIds = assemblyBinding.pieces.map(({ pieceId }) => pieceId);
  const documentIdMatch = evaluation.canonicalRequest.sourceFileId === assemblyBinding.documentId;
  const sourceIdentitiesBound = sourceIdentityBinding
    ? sourceIdentityBinding.assemblyDocumentId === assemblyBinding.documentId &&
      sourceIdentityBinding.nativeSamplingSourceFileId === evaluation.canonicalRequest.sourceFileId
    : documentIdMatch;
  if (
    baselinePieceIds.length === 0 ||
    baselinePieceIds.length > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumPieces ||
    duplicateStrings(baselinePieceIds).length > 0 ||
    !sourceIdentitiesBound ||
    JSON.stringify(assemblyPieceIds) !== JSON.stringify(baselinePieceIds) ||
    JSON.stringify(requestPieceIds) !== JSON.stringify(baselinePieceIds) ||
    JSON.stringify(artifactPieceIds) !== JSON.stringify(baselinePieceIds)
  )
    fail(
      'piece-binding-mismatch',
      'Assembly document/pieces and Phase-2 source/piece identities differ.',
    );
  let totalVertices = 0;
  let totalTriangles = 0;
  for (const piece of evaluation.canonicalArtifact.pieces) {
    totalVertices += piece.result.vertices.length;
    totalTriangles += piece.result.triangles.length / 3;
  }
  if (
    !Number.isSafeInteger(totalVertices) ||
    !Number.isSafeInteger(totalTriangles) ||
    totalVertices > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumVertices ||
    totalTriangles > GARMENT_PHASE2_SAMPLED_CLOTH_MESH_LIMITS_V1.maximumTriangles
  )
    fail('resource-budget-exceeded', 'Sampled garment mesh exceeds upgrader resource bounds.');
  const plans: PiecePlan[] = [];
  let vertexOffset = 0;
  let triangleOffset = 0;
  for (let pieceIndex = 0; pieceIndex < baselinePieceIds.length; pieceIndex += 1) {
    const plan = bindPiece(
      baseline,
      evaluation,
      assemblyBinding.pieces[pieceIndex],
      pieceIndex,
      vertexOffset,
      triangleOffset,
    );
    plans.push(plan);
    vertexOffset += plan.result.vertices.length;
    triangleOffset += plan.result.triangles.length / 3;
  }
  const positions = new Float32Array(totalVertices * 2);
  const triangles = new Uint32Array(totalTriangles * 3);
  const frames = new Float32Array(totalTriangles * 4);
  const pieceRanges: ClothMeshPieceRange[] = [];
  const boundarySamples: ClothBoundarySample[] = [];
  const bindings: GarmentPhase2BoundaryVertexBindingV1[] = [];
  const loops: GarmentPhase2BoundaryLoopV1[] = [];
  const endpoints: GarmentPhase2SeamEndpointV1[] = [];
  const pieceEvidence: GarmentPhase2PieceEvidenceV1[] = [];
  let maximumBoundaryErrorMm = 0;
  for (const plan of plans) {
    plan.result.vertices.forEach((vertex, localIndex) => {
      const globalIndex = plan.vertexOffset + localIndex;
      positions[globalIndex * 2] = vertex.positionMm[0];
      positions[globalIndex * 2 + 1] = vertex.positionMm[1];
      maximumBoundaryErrorMm = Math.max(
        maximumBoundaryErrorMm,
        Math.hypot(
          positions[globalIndex * 2] - vertex.positionMm[0],
          positions[globalIndex * 2 + 1] - vertex.positionMm[1],
        ),
      );
    });
    plan.result.triangles.forEach((localIndex, index) => {
      triangles[plan.triangleOffset * 3 + index] = plan.vertexOffset + localIndex;
    });
    frames.set(plan.result.triangleMaterialFrames2, plan.triangleOffset * 4);
    for (const binding of plan.bindings) {
      if (binding.source.kind === 'interior')
        fail('sample-binding-mismatch', `${plan.pieceId} contains an unsupported interior vertex.`);
      boundarySamples.push({
        vertexIndex: binding.globalVertexIndex,
        pieceId: binding.pieceId,
        contourId: binding.contourId,
        normalizedArc: binding.source.provenance.normalizedArc,
        sourceCurveId: binding.source.provenance.sourceCurveId,
        sourceCurveT: binding.source.provenance.sourceCurveT,
      });
    }
    bindings.push(...plan.bindings);
    loops.push(...plan.loops);
    endpoints.push(...plan.endpoints);
    pieceEvidence.push(plan.evidence);
    pieceRanges.push({
      pieceId: plan.pieceId,
      vertexOffset: plan.vertexOffset,
      vertexCount: plan.result.vertices.length,
      triangleOffset: plan.triangleOffset,
      triangleCount: plan.result.triangles.length / 3,
    });
  }
  if (
    boundarySamples.length !== totalVertices ||
    new Set(boundarySamples.map(({ vertexIndex }) => vertexIndex)).size !== totalVertices
  )
    fail('sample-binding-mismatch', 'Not every sampled output vertex became one boundary sample.');
  const seams = buildDistributedSeams(baseline, evaluation, plans);
  const sourceBinding = {
    assemblyDocumentId: assemblyBinding.documentId,
    assemblyRevision: assemblyBinding.revision,
    samplingSourceFileId: evaluation.canonicalRequest.sourceFileId,
    identityBindingSchemaVersion: sourceIdentityBinding?.schemaVersion ?? null,
    assemblyDocumentIdBound: true as const,
    samplingSourceFileIdBound: true as const,
    dualIdentityBound: sourceIdentityBinding !== null,
    documentIdMatch,
    sourceRevisionRepresentedInSamplingContract: false as const,
  };
  const mesh: ClothMeshIR = {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: baseline.mesh.sourceAssemblyFingerprint,
    sourceUnits: 'mm',
    restPositions2Mm: positions,
    triangles,
    pieceRanges,
    boundarySamples,
    seams,
    quality: measureQuality(positions, triangles, maximumBoundaryErrorMm),
  };
  const meshErrors = validateClothMeshIR(mesh);
  if (meshErrors.length > 0)
    fail('output-invalid', 'Upgraded sampled ClothMeshIR failed validation.', meshErrors);
  const deterministicFingerprint = artifactFingerprint(
    mesh,
    bindings,
    loops,
    endpoints,
    frames,
    pieceEvidence,
    sourceBinding,
    baseline.deterministicFingerprint,
    evaluation.deterministicFingerprint,
  );
  return freezeOwnedPlainData({
    version: GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1,
    mesh,
    boundaryVertexBindings: bindings,
    boundaryLoops: loops,
    seamEndpoints: endpoints,
    triangleMaterialFrames2: frames,
    pieceEvidence,
    sourceBinding,
    baselineCompilerFingerprint: baseline.deterministicFingerprint,
    samplingFingerprint: evaluation.deterministicFingerprint,
    deterministicFingerprint,
    claims: {
      acceptanceRequired: true,
      freshPhase1BaselineAccepted: true,
      requestLocalBoundarySamplingIntegrated: true,
      distributedEqualSeamPairsIntegrated: true,
      sourceDocumentIdBound: true,
      nativeSamplingSourceFileIdBound: true,
      sourceRevisionBound: false,
      sourceAuthenticityAccepted: false,
      curvedSourceEvaluationIntegrated: false,
      interiorRefinementIntegrated: false,
      bodyPlacementReady: false,
      runtimeIntegrated: false,
      settleAccepted: false,
      productionReady: false,
    },
    blockers: [
      'acceptance-artifact-required',
      'phase-d-content-binding-not-integrated',
      'source-revision-not-represented-in-sampling-contract',
      'curved-source-evaluator-not-integrated',
      'interior-refinement-not-integrated',
      'body-placement-not-proven',
      'runtime-owner-not-integrated',
      'settle-not-evaluated',
      'production-qualification-not-run',
    ],
  });
}

let upgradeActive = false;

export function upgradeGarmentPhase2SampledClothMeshV1(
  input: GarmentPhase2SampledClothMeshUpgradeRequestV1,
): GarmentPhase2SampledClothMeshArtifactV1 {
  if (upgradeActive)
    fail('reentrant-call', 'The garment Phase-2 upgrader rejects overlapping or reentrant calls.');
  upgradeActive = true;
  try {
    const request = extractRequestParts(input);
    const canonicalBaselineRequest = snapshotBaselineRequest(request.baselineRequest);
    const baseline = compileFreshBaseline(canonicalBaselineRequest);
    const assemblyBinding = baselineAssemblyBinding(canonicalBaselineRequest);
    const evaluation = evaluateSampling(request.samplingRequest, request.samplingArtifact);
    return buildUpgrade(baseline, evaluation, assemblyBinding, request.sourceIdentityBinding);
  } catch (error) {
    if (error instanceof GarmentPhase2SampledClothMeshErrorV1) throw error;
    fail('output-invalid', 'Garment Phase-2 upgrade failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    upgradeActive = false;
  }
}
