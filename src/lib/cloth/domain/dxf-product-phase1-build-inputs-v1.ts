import {
  compileDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffV1,
  type DxfPatternContourV1,
  type DxfPatternPieceV1,
  type DxfSeamSideV1,
  type DxfSeamV1,
} from './dxf-assembly-handoff-v1';
import type { GarmentAssemblyIR } from './garment-assembly-ir';
import {
  GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1,
  type GarmentPhase1SeamProofV1,
  type GarmentPhase1SeamSideProofV1,
} from '../mesh/garment-phase1-cloth-mesh-compiler-v1';
import type {
  BoundaryRing,
  BoundaryVertex,
  ConstrainedTriangulationInput,
  RequiredSeamEndpoint,
} from '../mesh/triangulation/types';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';
import {
  PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1,
  PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
  type PatternImportDxfTwoSeamMappingAggregateSealV1,
  type PatternImportDxfTwoSeamMappingAggregateV1,
} from './pattern-import-dxf-two-seam-mapping-aggregate-v1';

export const DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1 =
  'dxf-product-phase1-build-inputs-request/1' as const;
export const DXF_PRODUCT_PHASE1_BUILD_INPUTS_V1 = 'dxf-product-phase1-build-inputs/1' as const;
export const DXF_PRODUCT_PHASE1_BUILD_INPUTS_SEAL_V1 =
  'dxf-product-phase1-build-inputs-seal/1' as const;

const MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_NODES = 500_000;
const MAX_ARRAY_LENGTH = 100_000;
const MAX_STRING_LENGTH = 1_024;
const textEncoder = new TextEncoder();

export type DxfProductPhase1BuildInputsRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1;
  handoff: DxfAssemblyHandoffV1;
  aggregate: PatternImportDxfTwoSeamMappingAggregateV1;
  aggregateSeal: PatternImportDxfTwoSeamMappingAggregateSealV1;
  /** Retained because the aggregate intentionally omits per-seam compatibility tolerances. */
  childMappings: readonly [
    PatternImportDxfTwoSidedSeamMappingV2,
    PatternImportDxfTwoSidedSeamMappingV2,
  ];
  childSeals: readonly [
    PatternImportDxfTwoSidedSeamMappingSealV2,
    PatternImportDxfTwoSidedSeamMappingSealV2,
  ];
}>;

export type DxfProductPhase1BuildInputsCandidateV1 = Readonly<{
  assembly: GarmentAssemblyIR;
  triangulationInputs: readonly [ConstrainedTriangulationInput, ConstrainedTriangulationInput];
  seamProofs: readonly [GarmentPhase1SeamProofV1, GarmentPhase1SeamProofV1];
}>;

export const DXF_PRODUCT_PHASE1_BUILD_INPUTS_CLAIMS_V1 = Object.freeze({
  freshHandoffCompiled: true,
  exactlyTwoPiecesAndTwoEqualSeams: true,
  oneShellContourPerPiece: true,
  seamSpansAdjacentDisjointAndSourceBound: true,
  closingContourEdgeSupportedWithoutEpsilon: true,
  reverseDirectionRetained: true,
  boundaryVertexSourceProvenanceCopied: true,
  callerSuppliedTriangulationInputsAccepted: false,
  callerSuppliedSeamProofsAccepted: false,
  cdt2dExecuted: false,
  phase1Compiled: false,
  sourceNativeAuthorityBound: false,
  sourceAuthenticityAccepted: false,
  phase2Integrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshHandoffCompiled: false as const,
  exactlyTwoPiecesAndTwoEqualSeams: false as const,
  oneShellContourPerPiece: false as const,
  seamSpansAdjacentDisjointAndSourceBound: false as const,
  closingContourEdgeSupportedWithoutEpsilon: false as const,
  reverseDirectionRetained: false as const,
  boundaryVertexSourceProvenanceCopied: false as const,
  callerSuppliedTriangulationInputsAccepted: false as const,
  callerSuppliedSeamProofsAccepted: false as const,
  cdt2dExecuted: false as const,
  phase1Compiled: false as const,
  sourceNativeAuthorityBound: false as const,
  sourceAuthenticityAccepted: false as const,
  phase2Integrated: false as const,
  productionReady: false as const,
});

export type DxfProductPhase1BuildInputsSealV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE1_BUILD_INPUTS_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  sourceHandoffSha256: string;
  aggregateCanonicalSha256: string;
  childMappingCanonicalSha256s: readonly [string, string];
  authority: 'unsigned-in-memory-consistency-only';
  sourceNativeAuthorityBound: false;
  sourceAuthenticityAccepted: false;
  productionReady: false;
}>;

export type DxfProductPhase1BuildInputsArtifactV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE1_BUILD_INPUTS_V1;
  sourceBinding: Readonly<{
    sourceFileId: string;
    documentId: string;
    revision: string;
    sourceHandoffSha256: string;
    aggregateCanonicalSha256: string;
  }>;
  candidate: DxfProductPhase1BuildInputsCandidateV1;
  seal: DxfProductPhase1BuildInputsSealV1;
  claims: typeof DXF_PRODUCT_PHASE1_BUILD_INPUTS_CLAIMS_V1;
}>;

export type DxfProductPhase1BuildInputsBlockerCodeV1 =
  | 'invalid-input'
  | 'handoff-compile-blocked'
  | 'aggregate-seal-mismatch'
  | 'child-mapping-seal-mismatch'
  | 'source-binding-mismatch'
  | 'topology-mismatch'
  | 'seam-binding-mismatch'
  | 'sha256-unavailable';

export type DxfProductPhase1BuildInputsBlockerV1 = Readonly<{
  code: DxfProductPhase1BuildInputsBlockerCodeV1;
  detail: string;
}>;

export type DxfProductPhase1BuildInputsResultV1 =
  | Readonly<{
      ok: true;
      artifact: DxfProductPhase1BuildInputsArtifactV1;
      candidate: DxfProductPhase1BuildInputsCandidateV1;
      seal: DxfProductPhase1BuildInputsSealV1;
      blockers: readonly [];
      claims: typeof DXF_PRODUCT_PHASE1_BUILD_INPUTS_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      artifact: null;
      candidate: null;
      seal: null;
      blockers: readonly [DxfProductPhase1BuildInputsBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export const DXF_PRODUCT_PHASE1_BUILD_INPUTS_CONTRACT_V1 = Object.freeze({
  inputAuthority: 'fresh validated V2 child mappings + aggregate seal + full handoff',
  betaBound: 'exactly two pieces + two equal adjacent seams + one stitch operation',
  triangulationInputOrigin: 'fresh internal materialization from DxfAssemblyHandoffV1',
  seamProofOrigin: 'fresh internal materialization from aggregate child mappings',
  nativeEdgeAuthorityRequiredForLaterPhase2: true,
  cdt2dExecuted: false,
  phase1Compiled: false,
  phase2Integrated: false,
  sourceAuthenticityAccepted: false,
  productionReady: false,
} as const);

class BuildInputsFailure extends Error {
  constructor(
    readonly code: DxfProductPhase1BuildInputsBlockerCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: DxfProductPhase1BuildInputsBlockerCodeV1, detail: string): never {
  throw new BuildInputsFailure(code, detail.slice(0, 2_048));
}

function blocked(error: unknown): DxfProductPhase1BuildInputsResultV1 {
  const failure =
    error instanceof BuildInputsFailure
      ? error
      : new BuildInputsFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Phase-1 build-input construction failed.',
        );
  return Object.freeze({
    ok: false as const,
    artifact: null,
    candidate: null,
    seal: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message.slice(0, 2_048) }),
    ]) as readonly [DxfProductPhase1BuildInputsBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

type SnapshotBudget = { nodes: number };

function snapshotData(
  value: unknown,
  path: string,
  depth: number,
  budget: SnapshotBudget,
  active: Set<object>,
): unknown {
  budget.nodes += 1;
  if (budget.nodes > MAX_SNAPSHOT_NODES) fail('invalid-input', 'Snapshot node bound exceeded.');
  if (depth > MAX_SNAPSHOT_DEPTH) fail('invalid-input', 'Snapshot depth bound exceeded.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) fail('invalid-input', `${path} is too long.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-input', `${path} must be finite.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') fail('invalid-input', `${path} must contain plain data only.`);
  if (active.has(value)) fail('invalid-input', `${path} contains a cycle.`);
  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) fail('invalid-input', `${path} must be a plain array.`);
      if (value.length > MAX_ARRAY_LENGTH)
        fail('invalid-input', `${path} exceeds the array bound.`);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const ownKeys = Reflect.ownKeys(descriptors);
      if (
        ownKeys.some(
          (key) =>
            key !== 'length' &&
            (typeof key !== 'string' ||
              !/^(0|[1-9][0-9]*)$/.test(key) ||
              Number(key) >= value.length),
        )
      )
        fail('invalid-input', `${path} has unexpected array properties.`);
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor))
          fail('invalid-input', `${path}[${index}] must be an own data property.`);
        result.push(snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, budget, active));
      }
      return result;
    }
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-input', `${path} must be a plain record.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-input', `${path} cannot contain symbol keys.`);
    const result: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
      result[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, budget, active);
    }
    return result;
  } catch (error) {
    if (error instanceof BuildInputsFailure) throw error;
    fail('invalid-input', `${path} could not be snapshotted without executing caller code.`);
  } finally {
    active.delete(value);
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', `${path} must be an exact record.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-input', `${path} has an invalid shape.`);
  return value as Record<string, unknown>;
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      fail('invalid-input', 'Canonical data contains a non-finite number.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object')
    fail('invalid-input', 'Canonical data is not plain data.');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function sha256(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
  const encoded = textEncoder.encode(`${domain}\0${canonical(value)}`);
  if (encoded.byteLength > MAX_CANONICAL_BYTES)
    fail('invalid-input', 'Canonical Phase-1 build-input data exceeds the byte bound.');
  try {
    const owned = new Uint8Array(encoded.byteLength);
    owned.set(encoded);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer));
    if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof BuildInputsFailure) throw error;
    fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function assertSealEnvelope(
  seal: PatternImportDxfTwoSeamMappingAggregateSealV1,
  expectedSha256: string,
): void {
  if (
    seal.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1 ||
    seal.algorithm !== 'SHA-256' ||
    seal.canonicalSha256 !== expectedSha256 ||
    seal.sealedAggregateVersion !== PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1 ||
    seal.childMappingVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2 ||
    seal.authority !== 'unsigned-in-memory-consistency-only' ||
    seal.atomicTwoSeamAuthority !== true ||
    seal.writerExportShaBound !== false ||
    seal.trustedAuthorityIntegrated !== false ||
    seal.productionReady !== false
  )
    fail('aggregate-seal-mismatch', 'The aggregate seal does not match its canonical payload.');
}

function assertChildSealEnvelope(
  seal: PatternImportDxfTwoSidedSeamMappingSealV2,
  expectedSha256: string,
): void {
  if (
    seal.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2 ||
    seal.algorithm !== 'SHA-256' ||
    seal.canonicalSha256 !== expectedSha256 ||
    seal.sealedMappingVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2 ||
    seal.authority !== 'unsigned-in-memory-consistency-only' ||
    seal.writerExportShaBound !== false ||
    seal.trustedAuthorityIntegrated !== false ||
    seal.productionReady !== false
  )
    fail('child-mapping-seal-mismatch', 'A child mapping seal does not match its payload.');
}

function ring(contour: DxfPatternContourV1, role: BoundaryRing['role']): BoundaryRing {
  return {
    id: contour.id,
    role,
    vertices: contour.vertices.map(
      (vertex): BoundaryVertex => ({
        id: vertex.id,
        positionMm: [vertex.positionMm[0], vertex.positionMm[1]],
        source: {
          contourId: contour.id,
          sourceCurveId: vertex.source.sourceCurveId,
          sourceCurveParameterSpace: vertex.source.parameterSpace,
          sourceCurveT: vertex.source.sourceCurveT,
          normalizedArc: vertex.source.normalizedArc,
        },
      }),
    ),
  };
}

/** Mirrors dxf-assembly-handoff-v1's private triangulationInputForPiece exactly. */
function triangulationInputForPiece(
  piece: DxfPatternPieceV1,
  seams: readonly DxfSeamV1[],
): ConstrainedTriangulationInput {
  const shell = piece.contours.find((contour) => contour.role !== 'hole');
  if (!shell) fail('topology-mismatch', `${piece.id} has no explicit shell boundary.`);
  const seamEndpoints: RequiredSeamEndpoint[] = [];
  seams.forEach((seam) =>
    seam.sides.forEach((side, sideIndex) => {
      if (side.pieceId !== piece.id) return;
      side.anchors.forEach((boundaryVertexId, anchorIndex) => {
        seamEndpoints.push({
          id: `${seam.id}/side-${String(sideIndex)}/anchor-${String(anchorIndex)}`,
          boundaryVertexId,
        });
      });
    }),
  );
  return {
    pieceId: piece.id,
    shell: ring(shell, 'shell'),
    holes: piece.contours
      .filter((contour) => contour.role === 'hole')
      .map((contour) => ring(contour, 'hole')),
    seamEndpoints,
    grainDegrees: piece.grainDegrees,
    options: {
      targetEdgeMm: 10,
      minInputEdgeMm: 1e-6,
      minTriangleAngleDegrees: 0.01,
      maxEdgeRatio: 1e9,
      maxRadiusEdgeRatio: 1e9,
      maxBoundaryErrorMm: 1e-9,
      collinearSinTolerance: 1e-12,
    },
  };
}

type ResolvedPhysicalEdge = Readonly<{
  edgeStartIndex: number;
  edgeEndIndex: number;
  sourceCurveId: string;
  lengthMm: number;
  closing: boolean;
}>;

function physicalEdge(contour: DxfPatternContourV1, side: DxfSeamSideV1): ResolvedPhysicalEdge {
  const startIndex = contour.vertices.findIndex(({ id }) => id === side.anchors[0]);
  const endIndex = contour.vertices.findIndex(({ id }) => id === side.anchors[1]);
  const count = contour.vertices.length;
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex)
    fail('seam-binding-mismatch', 'A seam side has missing or duplicate boundary endpoints.');
  let edgeStartIndex: number;
  let edgeEndIndex: number;
  if ((startIndex + 1) % count === endIndex) {
    edgeStartIndex = startIndex;
    edgeEndIndex = endIndex;
  } else if ((endIndex + 1) % count === startIndex) {
    edgeStartIndex = endIndex;
    edgeEndIndex = startIndex;
  } else {
    fail('topology-mismatch', 'Each bounded Phase-1 seam side must cover one adjacent edge.');
  }
  const start = contour.vertices[edgeStartIndex];
  const end = contour.vertices[edgeEndIndex];
  const lengthMm = Math.hypot(
    end.positionMm[0] - start.positionMm[0],
    end.positionMm[1] - start.positionMm[1],
  );
  if (!Number.isFinite(lengthMm) || lengthMm <= 0)
    fail('topology-mismatch', 'A seam side resolves to a zero-length physical edge.');
  return {
    edgeStartIndex,
    edgeEndIndex,
    sourceCurveId: start.source.sourceCurveId,
    lengthMm,
    closing: edgeStartIndex === count - 1 && edgeEndIndex === 0,
  };
}

function assertOrderedSamples(
  mappingSide: PatternImportDxfTwoSidedSeamMappingV2['seam']['sides'][number],
  handoffSide: DxfSeamSideV1,
  contour: DxfPatternContourV1,
  edge: ResolvedPhysicalEdge,
): void {
  const expectedIndices =
    mappingSide.direction === 'forward'
      ? [edge.edgeStartIndex, edge.edgeEndIndex]
      : [edge.edgeEndIndex, edge.edgeStartIndex];
  if (
    mappingSide.orderedSamples.length !== 2 ||
    mappingSide.contourTraversal !== 'increasing-index' ||
    mappingSide.reversed !== (mappingSide.direction === 'reverse') ||
    mappingSide.direction !== handoffSide.direction ||
    !sameCanonical(mappingSide.authoredAnchors, handoffSide.anchors) ||
    !Number.isFinite(mappingSide.lengthMm) ||
    mappingSide.lengthMm <= 0 ||
    mappingSide.lengthMm !== edge.lengthMm ||
    !Number.isFinite(mappingSide.endpointResidualMm) ||
    mappingSide.endpointResidualMm !== 0
  )
    fail('seam-binding-mismatch', 'A child seam side differs from its exact handoff edge.');
  mappingSide.orderedSamples.forEach((sample, ordinal) => {
    const vertex = contour.vertices[expectedIndices[ordinal]];
    if (
      sample.ordinal !== ordinal ||
      sample.vertexId !== vertex.id ||
      sample.sourceCurveId !== vertex.source.sourceCurveId ||
      sample.parameterSpace !== vertex.source.parameterSpace ||
      sample.sourceCurveT !== vertex.source.sourceCurveT ||
      sample.contourNormalizedArc !== vertex.source.normalizedArc ||
      sample.normalizedProgress !== ordinal
    )
      fail(
        'source-binding-mismatch',
        'Ordered seam samples do not exact-match handoff boundary source provenance.',
      );
  });
}

type ResolvedSideProof = Readonly<{
  proof: GarmentPhase1SeamSideProofV1;
  physicalLengthMm: number;
  endpointResidualMm: number;
}>;

function sideProof(
  seam: DxfSeamV1,
  sideIndex: 0 | 1,
  handoffSide: DxfSeamSideV1,
  mappingSide: PatternImportDxfTwoSidedSeamMappingV2['seam']['sides'][number],
  contour: DxfPatternContourV1,
): ResolvedSideProof {
  const edge = physicalEdge(contour, handoffSide);
  assertOrderedSamples(mappingSide, handoffSide, contour, edge);
  const directedStartAnchorIndex = handoffSide.direction === 'forward' ? 0 : 1;
  const directedEndAnchorIndex = handoffSide.direction === 'forward' ? 1 : 0;
  return {
    proof: {
      sideIndex,
      pieceId: handoffSide.pieceId,
      contourId: handoffSide.contourId,
      sourceCurveId: edge.sourceCurveId,
      direction: handoffSide.direction,
      startBoundaryVertexId: handoffSide.anchors[directedStartAnchorIndex],
      endBoundaryVertexId: handoffSide.anchors[directedEndAnchorIndex],
      startEndpointId: `${seam.id}/side-${String(sideIndex)}/anchor-${String(
        directedStartAnchorIndex,
      )}`,
      endEndpointId: `${seam.id}/side-${String(sideIndex)}/anchor-${String(
        directedEndAnchorIndex,
      )}`,
      expectedLengthMm: edge.lengthMm,
    },
    physicalLengthMm: edge.lengthMm,
    endpointResidualMm: mappingSide.endpointResidualMm,
  };
}

function exactCompatibilityTolerance(
  seamId: string,
  compatibility: PatternImportDxfTwoSidedSeamMappingV2['compatibility'],
  sides: readonly [ResolvedSideProof, ResolvedSideProof],
): number {
  const [firstLengthMm, secondLengthMm] = sides.map(({ physicalLengthMm }) => physicalLengthMm);
  const maximumLengthMm = Math.max(firstLengthMm, secondLengthMm);
  const fullLengthResidualMm = Math.abs(firstLengthMm - secondLengthMm);
  const fullLengthResidualRelative = fullLengthResidualMm / maximumLengthMm;
  const maximumEndpointResidualMm = Math.max(
    sides[0].endpointResidualMm,
    sides[1].endpointResidualMm,
  );
  const endpointToleranceMm = compatibility.endpointToleranceMm;
  const fullLengthToleranceMm = compatibility.fullLengthToleranceMm;
  const fullLengthToleranceRelative = compatibility.fullLengthToleranceRelative;
  if (
    !Number.isFinite(endpointToleranceMm) ||
    endpointToleranceMm < 0 ||
    !Number.isFinite(fullLengthToleranceMm) ||
    fullLengthToleranceMm < 0 ||
    !Number.isFinite(fullLengthToleranceRelative) ||
    fullLengthToleranceRelative < 0
  )
    fail(
      'seam-binding-mismatch',
      `${seamId} compatibility tolerance is not finite and nonnegative.`,
    );
  const effectiveFullLengthToleranceMm = Math.max(
    fullLengthToleranceMm,
    fullLengthToleranceRelative * maximumLengthMm,
  );
  const endpointsCompatible = maximumEndpointResidualMm <= endpointToleranceMm;
  const fullLengthsCompatible = fullLengthResidualMm <= effectiveFullLengthToleranceMm;
  if (
    !Number.isFinite(effectiveFullLengthToleranceMm) ||
    effectiveFullLengthToleranceMm > GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1 ||
    compatibility.maximumEndpointResidualMm !== maximumEndpointResidualMm ||
    compatibility.endpointsCompatible !== endpointsCompatible ||
    compatibility.endpointsCompatible !== true ||
    compatibility.fullLengthResidualMm !== fullLengthResidualMm ||
    compatibility.fullLengthResidualRelative !== fullLengthResidualRelative ||
    compatibility.effectiveFullLengthToleranceMm !== effectiveFullLengthToleranceMm ||
    compatibility.fullLengthsCompatible !== fullLengthsCompatible ||
    compatibility.fullLengthsCompatible !== true ||
    fullLengthResidualMm !== 0
  )
    fail(
      'seam-binding-mismatch',
      `${seamId} compatibility does not equal the freshly recomputed exact-edge policy: ${JSON.stringify(
        {
          firstLengthMm,
          secondLengthMm,
          maximumEndpointResidualMm,
          endpointToleranceMm,
          fullLengthResidualMm,
          fullLengthResidualRelative,
          fullLengthToleranceMm,
          fullLengthToleranceRelative,
          effectiveFullLengthToleranceMm,
          compatibility,
        },
      )}`,
    );
  return effectiveFullLengthToleranceMm;
}

function assertContextAndBuildProofs(
  request: DxfProductPhase1BuildInputsRequestV1,
): readonly [GarmentPhase1SeamProofV1, GarmentPhase1SeamProofV1] {
  const { handoff, aggregate, childMappings, childSeals } = request;
  if (
    handoff.pieces.length !== 2 ||
    new Set(handoff.pieces.map(({ id }) => id)).size !== 2 ||
    handoff.seams.length !== 2 ||
    new Set(handoff.seams.map(({ id }) => id)).size !== 2 ||
    handoff.operations.length !== 1 ||
    aggregate.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1 ||
    aggregate.childMappingVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2 ||
    aggregate.seams.length !== 2 ||
    aggregate.childSeals.length !== 2 ||
    childMappings.length !== 2 ||
    childSeals.length !== 2
  )
    fail('topology-mismatch', 'The bounded constructor requires exactly two pieces and two seams.');

  const handoffPieceIds = handoff.pieces.map(({ id }) => id);
  const handoffSeamIds = handoff.seams.map(({ id }) => id);
  const operation = handoff.operations[0];
  if (
    !sameStringSet(aggregate.scope.pieceIds, handoffPieceIds) ||
    aggregate.sourceBinding.documentId !== handoff.source.documentId ||
    aggregate.sourceBinding.revision !== handoff.source.revision ||
    operation.id !== aggregate.operation.id ||
    operation.stage !== aggregate.operation.stage ||
    operation.order !== 0 ||
    operation.kind !== 'stitch' ||
    aggregate.operation.order !== 0 ||
    aggregate.operation.kind !== 'stitch' ||
    !sameStringSet(operation.seamIds, handoffSeamIds) ||
    !sameStringSet(aggregate.operation.seamIds, handoffSeamIds)
  )
    fail(
      'source-binding-mismatch',
      'Aggregate source, scope or operation differs from the handoff.',
    );

  for (const piece of handoff.pieces) {
    const shells = piece.contours.filter(({ role }) => role !== 'hole');
    if (shells.length !== 1)
      fail('topology-mismatch', `${piece.id} must expose exactly one shell contour.`);
    const contourIds = handoff.seams.flatMap((seam) =>
      seam.sides.filter(({ pieceId }) => pieceId === piece.id).map(({ contourId }) => contourId),
    );
    if (contourIds.length !== 2 || contourIds.some((contourId) => contourId !== shells[0].id))
      fail(
        'topology-mismatch',
        `${piece.id} must contribute both disjoint seams on its one shell contour.`,
      );
    const endpoints = handoff.seams.flatMap((seam) =>
      seam.sides.filter(({ pieceId }) => pieceId === piece.id).flatMap(({ anchors }) => anchors),
    );
    if (new Set(endpoints).size !== 4)
      fail('topology-mismatch', `${piece.id} seam spans reuse a boundary endpoint.`);
  }

  const mappingBySeam = new Map(childMappings.map((mapping) => [mapping.seam.id, mapping]));
  if (mappingBySeam.size !== 2)
    fail('seam-binding-mismatch', 'Child mappings must have two unique seam IDs.');
  const proofBySeam = new Map<string, GarmentPhase1SeamProofV1>();
  for (const seam of handoff.seams) {
    const aggregateSeams = aggregate.seams.filter(({ id }) => id === seam.id);
    const mapping = mappingBySeam.get(seam.id);
    if (
      aggregateSeams.length !== 1 ||
      !mapping ||
      mapping.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2 ||
      mapping.sourceBinding.sourceFileId !== aggregate.sourceBinding.sourceFileId ||
      mapping.sourceBinding.documentId !== aggregate.sourceBinding.documentId ||
      mapping.sourceBinding.revision !== aggregate.sourceBinding.revision ||
      mapping.sourceBinding.baseFinalCoordinateSha256 !==
        aggregate.sourceBinding.baseFinalCoordinateSha256 ||
      mapping.sourceBinding.sourcePathCoordinateSha256 !==
        aggregate.sourceBinding.sourcePathCoordinateSha256 ||
      mapping.sourceBinding.handoffCanonicalSha256 !== handoff.seal.canonicalSha256 ||
      mapping.scope.scopeId !== aggregate.scope.scopeId ||
      !sameStringSet(mapping.scope.pieceIds, aggregate.scope.pieceIds) ||
      !sameCanonical(mapping.seam, aggregateSeams[0]) ||
      seam.operationId !== mapping.seam.operationId ||
      seam.mapping !== 'equal' ||
      seam.lengthRatio !== 1 ||
      mapping.seam.mapping !== 'equal' ||
      mapping.seam.lengthRatio !== 1
    )
      fail('seam-binding-mismatch', `${seam.id} mapping does not exact-bind the handoff.`);
    const mappingSides = mapping.seam.sides;
    if (
      seam.sides[0].pieceId === seam.sides[1].pieceId ||
      mappingSides[0].sideIndex !== 0 ||
      mappingSides[1].sideIndex !== 1
    )
      fail('seam-binding-mismatch', `${seam.id} must bind each selected piece exactly once.`);
    const resolvedSides = seam.sides.map((handoffSide, sideIndex) => {
      const mappingSide = mappingSides[sideIndex];
      const piece = handoff.pieces.find(({ id }) => id === handoffSide.pieceId);
      const contour = piece?.contours.find(({ id }) => id === handoffSide.contourId);
      if (
        !piece ||
        !contour ||
        contour.role === 'hole' ||
        mappingSide.pieceId !== handoffSide.pieceId ||
        mappingSide.contourId !== handoffSide.contourId
      )
        fail('seam-binding-mismatch', `${seam.id}/side-${String(sideIndex)} is not on its shell.`);
      return sideProof(seam, sideIndex as 0 | 1, handoffSide, mappingSide, contour);
    }) as [ResolvedSideProof, ResolvedSideProof];
    const exactToleranceMm = exactCompatibilityTolerance(
      seam.id,
      mapping.compatibility,
      resolvedSides,
    );
    const sideProofs = resolvedSides.map(({ proof }) => proof) as [
      GarmentPhase1SeamSideProofV1,
      GarmentPhase1SeamSideProofV1,
    ];
    proofBySeam.set(seam.id, {
      seamId: seam.id,
      operationId: seam.operationId,
      mapping: 'equal',
      lengthRatio: 1,
      exactToleranceMm,
      sides: sideProofs,
    });
  }
  const proofs = handoff.seams.map((seam) => proofBySeam.get(seam.id));
  if (proofs.some((proof) => !proof))
    fail('seam-binding-mismatch', 'Every handoff seam must produce one proof.');
  return proofs as [GarmentPhase1SeamProofV1, GarmentPhase1SeamProofV1];
}

export async function buildDxfProductPhase1BuildInputsV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<DxfProductPhase1BuildInputsResultV1> {
  try {
    const snapshot = snapshotData(input, 'request', 0, { nodes: 0 }, new Set());
    const root = exactRecord(
      snapshot,
      ['schemaVersion', 'handoff', 'aggregate', 'aggregateSeal', 'childMappings', 'childSeals'],
      'request',
    );
    if (root.schemaVersion !== DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1)
      fail('invalid-input', 'Phase-1 build-input request schema is invalid.');
    const request = root as unknown as DxfProductPhase1BuildInputsRequestV1;
    const crypto = options.crypto ?? globalThis.crypto;

    const compiled = await compileDxfAssemblyHandoffV1(request.handoff, { crypto });
    if (!compiled.ok)
      fail('handoff-compile-blocked', `${compiled.code}: ${compiled.errors.join('; ')}`);

    const aggregateSha256 = await sha256(
      'pattern-import-dxf-two-seam-mapping-aggregate-v1',
      request.aggregate,
      crypto,
    );
    assertSealEnvelope(request.aggregateSeal, aggregateSha256);

    const childMappingSha256s = (await Promise.all(
      request.childMappings.map((mapping) =>
        sha256('pattern-import-dxf-two-sided-seam-mapping-v2', mapping, crypto),
      ),
    )) as [string, string];
    request.childSeals.forEach((seal, index) =>
      assertChildSealEnvelope(seal, childMappingSha256s[index]),
    );
    request.childMappings.forEach((mapping, index) => {
      const aggregateChild = request.aggregate.childSeals.find(
        ({ seamId }) => seamId === mapping.seam.id,
      );
      if (
        !aggregateChild ||
        aggregateChild.mappingCanonicalSha256 !== childMappingSha256s[index] ||
        aggregateChild.handoffCanonicalSha256 !== request.handoff.seal.canonicalSha256
      )
        fail(
          'child-mapping-seal-mismatch',
          'Aggregate child evidence does not bind both child mappings and the handoff.',
        );
    });

    const seamProofs = assertContextAndBuildProofs(request);
    const triangulationInputs = request.handoff.pieces.map((piece) =>
      triangulationInputForPiece(piece, request.handoff.seams),
    ) as [ConstrainedTriangulationInput, ConstrainedTriangulationInput];
    const candidate = deepFreeze({
      assembly: compiled.assembly,
      triangulationInputs,
      seamProofs,
    } satisfies DxfProductPhase1BuildInputsCandidateV1);
    const sourceBinding = deepFreeze({
      sourceFileId: request.aggregate.sourceBinding.sourceFileId,
      documentId: request.aggregate.sourceBinding.documentId,
      revision: request.aggregate.sourceBinding.revision,
      sourceHandoffSha256: compiled.sourceHandoffSha256,
      aggregateCanonicalSha256: aggregateSha256,
    });
    const payload = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE1_BUILD_INPUTS_V1,
      sourceBinding,
      candidate,
      claims: DXF_PRODUCT_PHASE1_BUILD_INPUTS_CLAIMS_V1,
    });
    const canonicalSha256 = await sha256('dxf-product-phase1-build-inputs-v1', payload, crypto);
    const childHashesBySeam = request.childMappings
      .map((mapping, index) => ({ seamId: mapping.seam.id, sha256: childMappingSha256s[index] }))
      .sort((left, right) =>
        left.seamId < right.seamId ? -1 : left.seamId > right.seamId ? 1 : 0,
      );
    const seal = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE1_BUILD_INPUTS_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256,
      sourceHandoffSha256: compiled.sourceHandoffSha256,
      aggregateCanonicalSha256: aggregateSha256,
      childMappingCanonicalSha256s: [
        childHashesBySeam[0].sha256,
        childHashesBySeam[1].sha256,
      ] as const,
      authority: 'unsigned-in-memory-consistency-only' as const,
      sourceNativeAuthorityBound: false as const,
      sourceAuthenticityAccepted: false as const,
      productionReady: false as const,
    } satisfies DxfProductPhase1BuildInputsSealV1);
    const artifact = deepFreeze({
      ...payload,
      seal,
    } satisfies DxfProductPhase1BuildInputsArtifactV1);
    return deepFreeze({
      ok: true as const,
      artifact,
      candidate,
      seal,
      blockers: [] as const,
      claims: DXF_PRODUCT_PHASE1_BUILD_INPUTS_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  }
}
