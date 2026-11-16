import {
  GARMENT_ASSEMBLY_IR_VERSION,
  type GarmentAssemblyIR,
  validateGarmentAssemblyIR,
} from './garment-assembly-ir';
import { preflightTriangulationInput } from '../mesh/triangulation/audit';
import type {
  BoundaryRing,
  BoundaryVertex,
  ConstrainedTriangulationInput,
  RequiredSeamEndpoint,
} from '../mesh/triangulation/types';

/** Minor v1 admission hardening: corpus binding is no longer corpus authority. */
export const DXF_ASSEMBLY_HANDOFF_V1 = '1.1.0' as const;

export const DXF_ASSEMBLY_HANDOFF_V1_LIMITS = Object.freeze({
  maxCanonicalBytes: 16 * 1024 * 1024,
  maxStringBytes: 256,
  maxPieces: 256,
  maxContoursPerPiece: 64,
  maxVerticesPerContour: 16_384,
  maxTotalVertices: 100_000,
  maxSeams: 2_048,
  maxOperations: 4_096,
  maxMaterials: 256,
  maxReferences: 32_768,
  maxTrustedCorpusEntries: 4_096,
} as const);

export type DxfSourceCurveParameterSpaceV1 = 'unit' | 'angle-radians' | 'knot-domain';

export type DxfBoundaryVertexV1 = {
  readonly id: string;
  readonly positionMm: readonly [xMm: number, yMm: number];
  readonly source: {
    readonly sourceCurveId: string;
    readonly parameterSpace: DxfSourceCurveParameterSpaceV1;
    readonly sourceCurveT: number;
    readonly normalizedArc: number;
  };
};

export type DxfPatternContourV1 = {
  readonly id: string;
  /** Explicit import semantics. No layer-name or containment inference is permitted here. */
  readonly role: 'sewing-boundary' | 'cut-boundary' | 'hole';
  readonly closed: true;
  readonly vertices: readonly DxfBoundaryVertexV1[];
};

export type DxfPatternPieceV1 = {
  readonly id: string;
  readonly name: string;
  readonly cutCount: number;
  readonly grainDegrees: number;
  readonly contours: readonly DxfPatternContourV1[];
};

export type DxfSeamSideV1 = {
  readonly pieceId: string;
  readonly contourId: string;
  /** Exact source-boundary vertices; the handoff never snaps a seam to nearest geometry. */
  readonly anchors: readonly [startBoundaryVertexId: string, endBoundaryVertexId: string];
  readonly direction: 'forward' | 'reverse';
};

export type DxfSeamV1 = {
  readonly id: string;
  readonly operationId: string;
  readonly sides: readonly [DxfSeamSideV1, DxfSeamSideV1];
  readonly mapping: 'equal' | 'eased' | 'gathered';
  readonly lengthRatio: number;
};

export type DxfAssemblyOperationV1 = {
  readonly id: string;
  /** Explicit coarse assembly stage; lower stages must execute first. */
  readonly stage: number;
  /** Explicit total order retained by the GarmentAssemblyIR adapter. */
  readonly order: number;
  readonly kind: 'place' | 'stitch' | 'release-support';
  readonly seamIds: readonly string[];
};

export type DxfMaterialAssignmentV1 = {
  readonly id: string;
  readonly pieceIds: readonly string[];
  readonly materialRevision: string;
};

export type DxfAssemblySourceV1 = {
  readonly format: 'DXF';
  readonly documentId: string;
  readonly revision: string;
  readonly units: 'mm';
  readonly sourceSha256: string;
  readonly exportSha256: string;
  readonly exporterId: string;
  readonly exporterVersion: string;
  readonly provenanceKind: 'synthetic-fixture' | 'untrusted-product' | 'trusted-corpus';
  readonly corpusEntryId: string | null;
};

export type DxfAssemblyHandoffCandidateV1 = {
  readonly schemaVersion: typeof DXF_ASSEMBLY_HANDOFF_V1;
  readonly source: DxfAssemblySourceV1;
  readonly physicalSurface:
    | { readonly mode: 'sewing-surface'; readonly seamAllowancePhysical: false }
    | { readonly mode: 'cut-surface'; readonly seamAllowancePhysical: true };
  readonly pieces: readonly DxfPatternPieceV1[];
  readonly seams: readonly DxfSeamV1[];
  readonly operations: readonly DxfAssemblyOperationV1[];
  readonly materials: readonly DxfMaterialAssignmentV1[];
};

export type TrustedDxfCorpusEntryV1 = {
  readonly corpusEntryId: string;
  readonly documentId: string;
  readonly revision: string;
  readonly sourceSha256: string;
  readonly exportSha256: string;
};

export type DxfAssemblyHandoffV1 = DxfAssemblyHandoffCandidateV1 & {
  readonly admission: {
    /** Always false until a future trusted composition root supplies opaque/pinned authority. */
    readonly productionReady: false;
    readonly reason:
      | 'trusted-corpus-authority-missing'
      | 'synthetic-fixture'
      | 'untrusted-product'
      | 'cut-surface-outside-beta';
    /** Exact match against the caller's bounded registry; this is identity binding, not trust. */
    readonly corpusBindingVerified: boolean;
    /** V1 exposes no public authority-minting path. */
    readonly corpusAuthorityVerified: false;
    readonly blockers: readonly (
      | 'trusted-corpus-authority-missing'
      | 'synthetic-fixture'
      | 'untrusted-product'
      | 'cut-surface-outside-beta'
    )[];
    readonly geometryPreflight: 'constrained-triangulation-input-v1';
    readonly heuristicInferenceUsed: false;
  };
  readonly seal: {
    readonly algorithm: 'SHA-256';
    readonly canonicalBytes: number;
    readonly canonicalSha256: string;
  };
};

export type DxfAssemblyHandoffFailureV1 = {
  readonly ok: false;
  readonly code:
    | 'invalid-candidate'
    | 'bounds-exceeded'
    | 'reference-invalid'
    | 'geometry-invalid'
    | 'corpus-untrusted'
    | 'sha256-unavailable'
    | 'seal-mismatch'
    | 'garment-ir-invalid';
  readonly errors: readonly string[];
};

export type DxfAssemblyHandoffBuildResultV1 =
  | { readonly ok: true; readonly value: DxfAssemblyHandoffV1 }
  | DxfAssemblyHandoffFailureV1;

export type DxfAssemblyHandoffCompileResultV1 =
  | {
      readonly ok: true;
      readonly assembly: GarmentAssemblyIR;
      readonly sourceHandoffSha256: string;
      /** V1 cannot establish corpus authority, so compilation cannot elevate admission. */
      readonly productionReady: false;
    }
  | DxfAssemblyHandoffFailureV1;

export type DxfAssemblyHandoffOptionsV1 = {
  readonly crypto?: Pick<Crypto, 'subtle'>;
  /** Caller data can establish only exact corpus binding, never corpus authority. */
  readonly trustedCorpus?: readonly TrustedDxfCorpusEntryV1[];
};

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const textEncoder = new TextEncoder();
const MAX_ERRORS = 128;
const MAX_SNAPSHOT_DEPTH = 24;
const MAX_SNAPSHOT_NODES = 1_000_000;
const MAX_SNAPSHOT_ARRAY_LENGTH = DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxTotalVertices;
const SHA256_KAT_PREIMAGE = 'dxf-assembly-handoff-v1-kat';
const SHA256_KAT_DIGEST = 'acd715118697190b2d3bfe5e0b817c7dbedbb97cdb9d7801666a17626e21de82';
const CANDIDATE_KEYS = [
  'schemaVersion',
  'source',
  'physicalSurface',
  'pieces',
  'seams',
  'operations',
  'materials',
] as const;
const SOURCE_KEYS = [
  'format',
  'documentId',
  'revision',
  'units',
  'sourceSha256',
  'exportSha256',
  'exporterId',
  'exporterVersion',
  'provenanceKind',
  'corpusEntryId',
] as const;

type PreparedCandidate = {
  readonly candidate: DxfAssemblyHandoffCandidateV1;
  readonly admission: DxfAssemblyHandoffV1['admission'];
};

type PreparationResult =
  | { readonly ok: true; readonly prepared: PreparedCandidate }
  | DxfAssemblyHandoffFailureV1;

function failure(
  code: DxfAssemblyHandoffFailureV1['code'],
  errors: readonly string[],
): DxfAssemblyHandoffFailureV1 {
  return deepFreeze({ ok: false as const, code, errors: [...errors].slice(0, MAX_ERRORS) });
}

function isFailure(
  value: DxfAssemblyHandoffV1['seal'] | DxfAssemblyHandoffFailureV1,
): value is DxfAssemblyHandoffFailureV1 {
  return 'ok' in value && value.ok === false;
}

function pushError(errors: string[], message: string): void {
  if (errors.length < MAX_ERRORS) errors.push(message);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeSnapshot(value: unknown): unknown {
  const active = new Set<object>();
  let nodes = 0;

  const visit = (current: unknown, path: string, depth: number): unknown => {
    nodes += 1;
    if (nodes > MAX_SNAPSHOT_NODES) throw new RangeError('candidate snapshot node bound exceeded.');
    if (depth > MAX_SNAPSHOT_DEPTH)
      throw new RangeError('candidate snapshot depth bound exceeded.');
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'number' ||
      typeof current === 'boolean'
    ) {
      return current;
    }
    if (typeof current !== 'object') {
      throw new TypeError(path + ' contains an unsupported value.');
    }
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) {
      throw new TypeError(path + ' cannot contain binary buffers.');
    }
    if (active.has(current)) throw new TypeError(path + ' contains a cycle.');
    active.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          throw new TypeError(path + ' must be a plain array.');
        }
        if (current.length > MAX_SNAPSHOT_ARRAY_LENGTH) {
          throw new RangeError(path + ' array bound exceeded.');
        }
        const ownKeys = Reflect.ownKeys(current);
        if (
          ownKeys.some((key) => typeof key === 'symbol') ||
          ownKeys.length !== current.length + 1
        ) {
          throw new TypeError(path + ' must be a dense array without extra properties.');
        }
        const result: unknown[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new TypeError(path + '[' + String(index) + '] must be plain data.');
          }
          result.push(visit(descriptor.value, path + '[' + String(index) + ']', depth + 1));
        }
        return result;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(path + ' must be a plain record.');
      }
      const ownKeys = Reflect.ownKeys(current);
      if (ownKeys.some((key) => typeof key === 'symbol') || ownKeys.length > 32) {
        throw new TypeError(path + ' has unsupported own properties.');
      }
      const result: Record<string, unknown> = {};
      for (const key of ownKeys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          throw new TypeError(path + '.' + key + ' must be enumerable plain data.');
        }
        result[key] = visit(descriptor.value, path + '.' + key, depth + 1);
      }
      return result;
    } finally {
      active.delete(current);
    }
  };

  return visit(value, 'candidate', 0);
}

function recordWithExactKeys(
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    pushError(errors, path + ' must be a record.');
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    pushError(errors, path + ' must have exact keys: ' + expected.join(', ') + '.');
    return false;
  }
  return true;
}

function list(value: unknown, path: string, errors: string[]): value is unknown[] {
  if (!Array.isArray(value)) {
    pushError(errors, path + ' must be an array.');
    return false;
  }
  return true;
}

function validateCandidateShape(
  value: unknown,
  errors: string[],
): value is DxfAssemblyHandoffCandidateV1 {
  if (!recordWithExactKeys(value, CANDIDATE_KEYS, 'candidate', errors)) return false;
  if (!recordWithExactKeys(value.source, SOURCE_KEYS, 'candidate.source', errors)) return false;
  recordWithExactKeys(
    value.physicalSurface,
    ['mode', 'seamAllowancePhysical'],
    'candidate.physicalSurface',
    errors,
  );

  if (list(value.pieces, 'candidate.pieces', errors)) {
    value.pieces.forEach((piece, pieceIndex) => {
      const path = 'candidate.pieces[' + String(pieceIndex) + ']';
      if (
        !recordWithExactKeys(
          piece,
          ['id', 'name', 'cutCount', 'grainDegrees', 'contours'],
          path,
          errors,
        )
      )
        return;
      if (!list(piece.contours, path + '.contours', errors)) return;
      piece.contours.forEach((contour, contourIndex) => {
        const contourPath = path + '.contours[' + String(contourIndex) + ']';
        if (
          !recordWithExactKeys(contour, ['id', 'role', 'closed', 'vertices'], contourPath, errors)
        )
          return;
        if (!list(contour.vertices, contourPath + '.vertices', errors)) return;
        contour.vertices.forEach((vertex, vertexIndex) => {
          const vertexPath = contourPath + '.vertices[' + String(vertexIndex) + ']';
          if (!recordWithExactKeys(vertex, ['id', 'positionMm', 'source'], vertexPath, errors))
            return;
          if (
            !list(vertex.positionMm, vertexPath + '.positionMm', errors) ||
            vertex.positionMm.length !== 2
          ) {
            pushError(errors, vertexPath + '.positionMm must be a two-number tuple.');
          }
          recordWithExactKeys(
            vertex.source,
            ['sourceCurveId', 'parameterSpace', 'sourceCurveT', 'normalizedArc'],
            vertexPath + '.source',
            errors,
          );
        });
      });
    });
  }

  if (list(value.seams, 'candidate.seams', errors)) {
    value.seams.forEach((seam, seamIndex) => {
      const path = 'candidate.seams[' + String(seamIndex) + ']';
      if (
        !recordWithExactKeys(
          seam,
          ['id', 'operationId', 'sides', 'mapping', 'lengthRatio'],
          path,
          errors,
        )
      )
        return;
      if (!list(seam.sides, path + '.sides', errors) || seam.sides.length !== 2) {
        pushError(errors, path + '.sides must contain exactly two sides.');
        return;
      }
      seam.sides.forEach((side, sideIndex) => {
        const sidePath = path + '.sides[' + String(sideIndex) + ']';
        if (
          !recordWithExactKeys(
            side,
            ['pieceId', 'contourId', 'anchors', 'direction'],
            sidePath,
            errors,
          )
        )
          return;
        if (!list(side.anchors, sidePath + '.anchors', errors) || side.anchors.length !== 2) {
          pushError(errors, sidePath + '.anchors must contain exactly two vertex ids.');
        }
      });
    });
  }

  if (list(value.operations, 'candidate.operations', errors)) {
    value.operations.forEach((operation, index) => {
      const path = 'candidate.operations[' + String(index) + ']';
      if (
        !recordWithExactKeys(operation, ['id', 'stage', 'order', 'kind', 'seamIds'], path, errors)
      )
        return;
      list(operation.seamIds, path + '.seamIds', errors);
    });
  }
  if (list(value.materials, 'candidate.materials', errors)) {
    value.materials.forEach((material, index) => {
      const path = 'candidate.materials[' + String(index) + ']';
      if (!recordWithExactKeys(material, ['id', 'pieceIds', 'materialRevision'], path, errors))
        return;
      list(material.pieceIds, path + '.pieceIds', errors);
    });
  }
  return errors.length === 0;
}

function stringValue(
  value: unknown,
  path: string,
  errors: string[],
  stableId = false,
): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    textEncoder.encode(value).byteLength > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxStringBytes ||
    (stableId && !STABLE_ID.test(value))
  ) {
    pushError(
      errors,
      path + (stableId ? ' must be a bounded stable id.' : ' must be a bounded non-empty string.'),
    );
    return false;
  }
  return true;
}

function finiteNumber(value: unknown, path: string, errors: string[]): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    pushError(errors, path + ' must be a finite canonical number.');
    return false;
  }
  return true;
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  path: string,
  errors: string[],
): value is number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    pushError(errors, path + ' must be an integer in [' + String(min) + ', ' + String(max) + '].');
    return false;
  }
  return true;
}

function unique(values: readonly string[], path: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) pushError(errors, path + ' contains duplicate id ' + value + '.');
    seen.add(value);
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeCandidate(
  candidate: DxfAssemblyHandoffCandidateV1,
): DxfAssemblyHandoffCandidateV1 {
  return {
    schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
    source: { ...candidate.source },
    physicalSurface: { ...candidate.physicalSurface },
    pieces: candidate.pieces
      .map((piece) => ({
        id: piece.id,
        name: piece.name,
        cutCount: piece.cutCount,
        grainDegrees: piece.grainDegrees,
        contours: piece.contours
          .map((contour) => ({
            id: contour.id,
            role: contour.role,
            closed: true as const,
            vertices: contour.vertices.map((vertex) => ({
              id: vertex.id,
              positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
              source: { ...vertex.source },
            })),
          }))
          .sort((left, right) => compareCodeUnits(left.id, right.id)),
      }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    seams: candidate.seams
      .map((seam) => ({
        id: seam.id,
        operationId: seam.operationId,
        sides: seam.sides.map((side) => ({
          pieceId: side.pieceId,
          contourId: side.contourId,
          anchors: [side.anchors[0], side.anchors[1]] as const,
          direction: side.direction,
        })) as [DxfSeamSideV1, DxfSeamSideV1],
        mapping: seam.mapping,
        lengthRatio: seam.lengthRatio,
      }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    operations: candidate.operations
      .map((operation) => ({
        ...operation,
        seamIds: [...operation.seamIds].sort(),
      }))
      .sort((left, right) => left.order - right.order || compareCodeUnits(left.id, right.id)),
    materials: candidate.materials
      .map((material) => ({
        ...material,
        pieceIds: [...material.pieceIds].sort(),
      }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
  };
}

function validateCorpus(
  source: DxfAssemblySourceV1,
  trustedCorpus: readonly TrustedDxfCorpusEntryV1[] | undefined,
): { readonly ok: true; readonly bindingVerified: boolean } | DxfAssemblyHandoffFailureV1 {
  if (source.provenanceKind === 'synthetic-fixture') {
    if (source.corpusEntryId !== null) {
      return failure('invalid-candidate', [
        'Synthetic fixtures must set source.corpusEntryId to null.',
      ]);
    }
    return { ok: true, bindingVerified: false };
  }
  if (source.provenanceKind === 'untrusted-product') {
    if (source.corpusEntryId !== null) {
      return failure('invalid-candidate', [
        'Untrusted product imports must set source.corpusEntryId to null.',
      ]);
    }
    return { ok: true, bindingVerified: false };
  }
  if (!stringValue(source.corpusEntryId, 'source.corpusEntryId', [], true)) {
    return failure('corpus-untrusted', ['Trusted corpus input needs a stable corpusEntryId.']);
  }
  if (
    !trustedCorpus ||
    trustedCorpus.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxTrustedCorpusEntries
  ) {
    return failure('corpus-untrusted', ['A bounded trusted corpus registry is required.']);
  }
  const matching = trustedCorpus.filter((entry) => entry.corpusEntryId === source.corpusEntryId);
  if (
    matching.length !== 1 ||
    matching[0].documentId !== source.documentId ||
    matching[0].revision !== source.revision ||
    matching[0].sourceSha256 !== source.sourceSha256 ||
    matching[0].exportSha256 !== source.exportSha256
  ) {
    return failure('corpus-untrusted', [
      'Source identity and digests do not exactly match one trusted corpus entry.',
    ]);
  }
  return { ok: true, bindingVerified: true };
}

function triangulationInputForPiece(
  piece: DxfPatternPieceV1,
  seams: readonly DxfSeamV1[],
): ConstrainedTriangulationInput {
  const ring = (contour: DxfPatternContourV1, role: BoundaryRing['role']): BoundaryRing => ({
    id: contour.id,
    role,
    vertices: contour.vertices.map(
      (vertex): BoundaryVertex => ({
        id: vertex.id,
        positionMm: vertex.positionMm,
        source: {
          contourId: contour.id,
          sourceCurveId: vertex.source.sourceCurveId,
          sourceCurveParameterSpace: vertex.source.parameterSpace,
          sourceCurveT: vertex.source.sourceCurveT,
          normalizedArc: vertex.source.normalizedArc,
        },
      }),
    ),
  });
  const shell = piece.contours.find((contour) => contour.role !== 'hole');
  if (!shell) throw new TypeError(piece.id + ' has no explicit shell boundary.');
  const seamEndpoints: RequiredSeamEndpoint[] = [];
  seams.forEach((seam) =>
    seam.sides.forEach((side, sideIndex) => {
      if (side.pieceId !== piece.id) return;
      side.anchors.forEach((boundaryVertexId, anchorIndex) => {
        seamEndpoints.push({
          id: seam.id + '/side-' + String(sideIndex) + '/anchor-' + String(anchorIndex),
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

function validateSemantics(
  candidate: DxfAssemblyHandoffCandidateV1,
): DxfAssemblyHandoffFailureV1 | null {
  const errors: string[] = [];
  let boundsExceeded = false;
  let referenceInvalid = false;
  let totalVertices = 0;
  let totalReferences = 0;

  if (candidate.schemaVersion !== DXF_ASSEMBLY_HANDOFF_V1) {
    pushError(errors, 'schemaVersion must be ' + DXF_ASSEMBLY_HANDOFF_V1 + '.');
  }
  const source = candidate.source;
  if (source.format !== 'DXF' || source.units !== 'mm') {
    pushError(errors, 'Only explicit DXF millimetre inputs are accepted.');
  }
  for (const [key, value] of [
    ['documentId', source.documentId],
    ['revision', source.revision],
    ['exporterId', source.exporterId],
    ['exporterVersion', source.exporterVersion],
  ] as const) {
    stringValue(value, 'source.' + key, errors, key !== 'exporterVersion');
  }
  if (!SHA256.test(source.sourceSha256))
    pushError(errors, 'source.sourceSha256 must be lowercase SHA-256.');
  if (!SHA256.test(source.exportSha256))
    pushError(errors, 'source.exportSha256 must be lowercase SHA-256.');
  if (
    !['synthetic-fixture', 'untrusted-product', 'trusted-corpus'].includes(source.provenanceKind)
  ) {
    pushError(errors, 'source.provenanceKind is unsupported.');
  }
  if (
    !candidate.physicalSurface ||
    !(
      (candidate.physicalSurface.mode === 'sewing-surface' &&
        candidate.physicalSurface.seamAllowancePhysical === false) ||
      (candidate.physicalSurface.mode === 'cut-surface' &&
        candidate.physicalSurface.seamAllowancePhysical === true)
    )
  ) {
    pushError(errors, 'physicalSurface contract is inconsistent.');
  }

  if (
    candidate.pieces.length === 0 ||
    candidate.pieces.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxPieces
  ) {
    boundsExceeded = true;
    pushError(errors, 'pieces count is outside the handoff bounds.');
  }
  if (candidate.seams.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxSeams) {
    boundsExceeded = true;
    pushError(errors, 'seams count exceeds the handoff bound.');
  }
  if (
    candidate.operations.length === 0 ||
    candidate.operations.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxOperations
  ) {
    boundsExceeded = true;
    pushError(errors, 'operations count is outside the handoff bounds.');
  }
  if (
    candidate.materials.length === 0 ||
    candidate.materials.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxMaterials
  ) {
    boundsExceeded = true;
    pushError(errors, 'materials count is outside the handoff bounds.');
  }

  unique(
    candidate.pieces.map((piece) => piece.id),
    'pieces',
    errors,
  );
  unique(
    candidate.seams.map((seam) => seam.id),
    'seams',
    errors,
  );
  unique(
    candidate.operations.map((operation) => operation.id),
    'operations',
    errors,
  );
  unique(
    candidate.materials.map((material) => material.id),
    'materials',
    errors,
  );

  const pieces = new Map(candidate.pieces.map((piece) => [piece.id, piece]));
  const contourByKey = new Map<string, DxfPatternContourV1>();
  const vertexByKey = new Map<string, DxfBoundaryVertexV1>();
  for (const piece of candidate.pieces) {
    stringValue(piece.id, 'piece.id', errors, true);
    stringValue(piece.name, piece.id + '.name', errors);
    boundedInteger(piece.cutCount, 1, 1_024, piece.id + '.cutCount', errors);
    if (
      !finiteNumber(piece.grainDegrees, piece.id + '.grainDegrees', errors) ||
      Math.abs(piece.grainDegrees) > 3_600
    ) {
      pushError(errors, piece.id + '.grainDegrees exceeds the supported range.');
    }
    if (
      piece.contours.length === 0 ||
      piece.contours.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxContoursPerPiece
    ) {
      boundsExceeded = true;
      pushError(errors, piece.id + ' contour count is outside the handoff bounds.');
    }
    unique(
      piece.contours.map((contour) => contour.id),
      piece.id + '.contours',
      errors,
    );
    const expectedBoundaryRole =
      candidate.physicalSurface.mode === 'sewing-surface' ? 'sewing-boundary' : 'cut-boundary';
    const boundaries = piece.contours.filter((contour) => contour.role !== 'hole');
    if (boundaries.length !== 1 || boundaries[0]?.role !== expectedBoundaryRole) {
      pushError(errors, piece.id + ' must declare exactly one ' + expectedBoundaryRole + '.');
    }
    for (const contour of piece.contours) {
      stringValue(contour.id, piece.id + '.contour.id', errors, true);
      if (!['sewing-boundary', 'cut-boundary', 'hole'].includes(contour.role)) {
        pushError(errors, piece.id + '/' + contour.id + ' has an unsupported explicit role.');
      }
      if (contour.closed !== true)
        pushError(errors, piece.id + '/' + contour.id + ' must be explicitly closed.');
      if (
        contour.vertices.length < 3 ||
        contour.vertices.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxVerticesPerContour
      ) {
        boundsExceeded = true;
        pushError(
          errors,
          piece.id + '/' + contour.id + ' vertex count is outside the handoff bounds.',
        );
      }
      totalVertices += contour.vertices.length;
      unique(
        contour.vertices.map((vertex) => vertex.id),
        piece.id + '/' + contour.id + '.vertices',
        errors,
      );
      contourByKey.set(piece.id + '/' + contour.id, contour);
      contour.vertices.forEach((vertex, vertexIndex) => {
        const vertexPath = piece.id + '/' + contour.id + '/' + vertex.id;
        stringValue(vertex.id, vertexPath + '.id', errors, true);
        const [x, y] = vertex.positionMm;
        if (
          !finiteNumber(x, vertexPath + '.xMm', errors) ||
          !finiteNumber(y, vertexPath + '.yMm', errors) ||
          Math.abs(x) > 1e7 ||
          Math.abs(y) > 1e7
        ) {
          pushError(errors, vertexPath + ' coordinate exceeds the supported millimetre range.');
        }
        stringValue(vertex.source.sourceCurveId, vertexPath + '.sourceCurveId', errors, true);
        if (!['unit', 'angle-radians', 'knot-domain'].includes(vertex.source.parameterSpace)) {
          pushError(errors, vertexPath + ' source parameter space is unsupported.');
        }
        finiteNumber(vertex.source.sourceCurveT, vertexPath + '.sourceCurveT', errors);
        if (
          !finiteNumber(vertex.source.normalizedArc, vertexPath + '.normalizedArc', errors) ||
          vertex.source.normalizedArc < 0 ||
          vertex.source.normalizedArc > 1 ||
          (vertexIndex === 0 && vertex.source.normalizedArc !== 0) ||
          (vertexIndex > 0 &&
            vertex.source.normalizedArc <= contour.vertices[vertexIndex - 1].source.normalizedArc)
        ) {
          pushError(
            errors,
            vertexPath + ' normalized arc must start at zero and strictly increase in [0, 1].',
          );
        }
        if (
          vertex.source.parameterSpace === 'unit' &&
          (vertex.source.sourceCurveT < 0 || vertex.source.sourceCurveT > 1)
        ) {
          pushError(errors, vertexPath + ' unit sourceCurveT must be in [0, 1].');
        }
        vertexByKey.set(piece.id + '/' + contour.id + '/' + vertex.id, vertex);
      });
    }
  }
  if (totalVertices > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxTotalVertices) {
    boundsExceeded = true;
    pushError(errors, 'total vertex count exceeds the handoff bound.');
  }

  const operations = new Map(candidate.operations.map((operation) => [operation.id, operation]));
  const seams = new Map(candidate.seams.map((seam) => [seam.id, seam]));
  for (const seam of candidate.seams) {
    stringValue(seam.id, 'seam.id', errors, true);
    stringValue(seam.operationId, seam.id + '.operationId', errors, true);
    if (!['equal', 'eased', 'gathered'].includes(seam.mapping))
      pushError(errors, seam.id + ' mapping is unsupported.');
    if (
      !finiteNumber(seam.lengthRatio, seam.id + '.lengthRatio', errors) ||
      seam.lengthRatio <= 0 ||
      seam.lengthRatio > 100
    ) {
      pushError(errors, seam.id + ' lengthRatio must be in (0, 100].');
    }
    if (seam.mapping === 'equal' && seam.lengthRatio !== 1) {
      pushError(errors, seam.id + ' equal mapping requires lengthRatio exactly 1.');
    }
    const [sideA, sideB] = seam.sides;
    const sameContour = sideA.pieceId === sideB.pieceId && sideA.contourId === sideB.contourId;
    const sameAnchors =
      (sideA.anchors[0] === sideB.anchors[0] && sideA.anchors[1] === sideB.anchors[1]) ||
      (sideA.anchors[0] === sideB.anchors[1] && sideA.anchors[1] === sideB.anchors[0]);
    if (sameContour && sameAnchors) {
      referenceInvalid = true;
      pushError(errors, seam.id + ' sides resolve to the same exact contour range.');
    }
    const owner = operations.get(seam.operationId);
    if (!owner || owner.kind !== 'stitch') {
      referenceInvalid = true;
      pushError(errors, seam.id + ' must reference an existing stitch operation.');
    }
    seam.sides.forEach((side, sideIndex) => {
      const sidePath = seam.id + '/side-' + String(sideIndex);
      const piece = pieces.get(side.pieceId);
      const contour = contourByKey.get(side.pieceId + '/' + side.contourId);
      if (!piece || !contour || contour.role === 'hole') {
        referenceInvalid = true;
        pushError(errors, sidePath + ' must reference an explicit non-hole boundary.');
        return;
      }
      if (!['forward', 'reverse'].includes(side.direction))
        pushError(errors, sidePath + ' direction is unsupported.');
      const start = vertexByKey.get(side.pieceId + '/' + side.contourId + '/' + side.anchors[0]);
      const end = vertexByKey.get(side.pieceId + '/' + side.contourId + '/' + side.anchors[1]);
      if (!start || !end || start === end) {
        referenceInvalid = true;
        pushError(errors, sidePath + ' anchors must be two distinct exact boundary vertices.');
      }
      totalReferences += 2;
    });
  }

  const orderedOperations = [...candidate.operations].sort(
    (left, right) => left.order - right.order,
  );
  unique(
    candidate.operations.map((operation) => String(operation.order)),
    'operation orders',
    errors,
  );
  orderedOperations.forEach((operation, index) => {
    stringValue(operation.id, 'operation.id', errors, true);
    boundedInteger(operation.stage, 0, 65_535, operation.id + '.stage', errors);
    boundedInteger(operation.order, 0, 65_535, operation.id + '.order', errors);
    if (operation.order !== index)
      pushError(errors, 'operation order must be contiguous from zero.');
    if (index > 0 && operation.stage < orderedOperations[index - 1].stage) {
      pushError(errors, 'operation stages must be nondecreasing in total order.');
    }
    if (!['place', 'stitch', 'release-support'].includes(operation.kind))
      pushError(errors, operation.id + ' kind is unsupported.');
    unique(operation.seamIds, operation.id + '.seamIds', errors);
    if (operation.kind !== 'stitch' && operation.seamIds.length > 0) {
      referenceInvalid = true;
      pushError(errors, operation.id + ' cannot own seams because it is not a stitch operation.');
    }
    for (const seamId of operation.seamIds) {
      const seam = seams.get(seamId);
      if (!seam || seam.operationId !== operation.id) {
        referenceInvalid = true;
        pushError(errors, operation.id + ' and seam ' + seamId + ' disagree about ownership.');
      }
      totalReferences += 1;
    }
  });
  for (const seam of candidate.seams) {
    const occurrences = candidate.operations.reduce(
      (count, operation) => count + operation.seamIds.filter((id) => id === seam.id).length,
      0,
    );
    if (occurrences !== 1) {
      referenceInvalid = true;
      pushError(errors, seam.id + ' must be owned by exactly one operation.');
    }
  }

  const materialOwners = new Map<string, number>();
  for (const material of candidate.materials) {
    stringValue(material.id, 'material.id', errors, true);
    stringValue(material.materialRevision, material.id + '.materialRevision', errors, true);
    if (material.pieceIds.length === 0)
      pushError(errors, material.id + ' must assign at least one piece.');
    unique(material.pieceIds, material.id + '.pieceIds', errors);
    for (const pieceId of material.pieceIds) {
      if (!pieces.has(pieceId)) {
        referenceInvalid = true;
        pushError(errors, material.id + ' references missing piece ' + pieceId + '.');
      }
      materialOwners.set(pieceId, (materialOwners.get(pieceId) ?? 0) + 1);
      totalReferences += 1;
    }
  }
  for (const pieceId of pieces.keys()) {
    if (materialOwners.get(pieceId) !== 1) {
      referenceInvalid = true;
      pushError(errors, pieceId + ' must have exactly one material assignment.');
    }
  }
  if (totalReferences > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxReferences) {
    boundsExceeded = true;
    pushError(errors, 'reference count exceeds the handoff bound.');
  }

  if (errors.length > 0) {
    return failure(
      boundsExceeded
        ? 'bounds-exceeded'
        : referenceInvalid
          ? 'reference-invalid'
          : 'invalid-candidate',
      errors,
    );
  }

  const geometryErrors: string[] = [];
  for (const piece of candidate.pieces) {
    for (const issue of preflightTriangulationInput(
      triangulationInputForPiece(piece, candidate.seams),
    )) {
      pushError(
        geometryErrors,
        piece.id +
          ': ' +
          issue.code +
          (issue.sourceId ? ' (' + issue.sourceId + ')' : '') +
          ': ' +
          issue.message,
      );
    }
  }
  return geometryErrors.length > 0 ? failure('geometry-invalid', geometryErrors) : null;
}

function prepareCandidate(
  raw: unknown,
  trustedCorpus: readonly TrustedDxfCorpusEntryV1[] | undefined,
): PreparationResult {
  let snapshot: unknown;
  try {
    snapshot = safeSnapshot(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Candidate snapshot failed.';
    return failure(message.includes('bound exceeded') ? 'bounds-exceeded' : 'invalid-candidate', [
      message,
    ]);
  }
  const shapeErrors: string[] = [];
  if (!validateCandidateShape(snapshot, shapeErrors))
    return failure('invalid-candidate', shapeErrors);
  const candidate = normalizeCandidate(snapshot);
  const semanticFailure = validateSemantics(candidate);
  if (semanticFailure) return semanticFailure;
  const corpus = validateCorpus(candidate.source, trustedCorpus);
  if (!corpus.ok) return corpus;
  const blockers: DxfAssemblyHandoffV1['admission']['blockers'] = [
    candidate.source.provenanceKind === 'synthetic-fixture'
      ? 'synthetic-fixture'
      : candidate.source.provenanceKind === 'untrusted-product'
        ? 'untrusted-product'
        : 'trusted-corpus-authority-missing',
    ...(candidate.physicalSurface.mode === 'cut-surface'
      ? (['cut-surface-outside-beta'] as const)
      : []),
  ];
  const admission: DxfAssemblyHandoffV1['admission'] = {
    productionReady: false,
    reason:
      candidate.physicalSurface.mode === 'cut-surface'
        ? 'cut-surface-outside-beta'
        : candidate.source.provenanceKind === 'synthetic-fixture'
          ? 'synthetic-fixture'
          : candidate.source.provenanceKind === 'untrusted-product'
            ? 'untrusted-product'
            : 'trusted-corpus-authority-missing',
    corpusBindingVerified: corpus.bindingVerified,
    corpusAuthorityVerified: false,
    blockers,
    geometryPreflight: 'constrained-triangulation-input-v1',
    heuristicInferenceUsed: false,
  };
  return { ok: true, prepared: { candidate, admission } };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new RangeError('Non-canonical number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || typeof value !== 'object') throw new TypeError('Unsupported canonical value.');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
      .join(',') +
    '}'
  );
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cryptoProvider(options: DxfAssemblyHandoffOptionsV1): Pick<Crypto, 'subtle'> | null {
  const provider = options.crypto ?? globalThis.crypto;
  return provider?.subtle && typeof provider.subtle.digest === 'function' ? provider : null;
}

async function sealPayload(
  payload: Omit<DxfAssemblyHandoffV1, 'seal'>,
  options: DxfAssemblyHandoffOptionsV1,
): Promise<DxfAssemblyHandoffV1['seal'] | DxfAssemblyHandoffFailureV1> {
  const crypto = cryptoProvider(options);
  if (!crypto) return failure('sha256-unavailable', ['Web Crypto SHA-256 is unavailable.']);
  const bytes = textEncoder.encode('dxf-assembly-handoff-v1\0' + canonical(payload));
  if (bytes.byteLength > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxCanonicalBytes) {
    return failure('bounds-exceeded', ['Canonical handoff byte length exceeds the bound.']);
  }
  try {
    const katBytes = textEncoder.encode(SHA256_KAT_PREIMAGE);
    const katOwned = new Uint8Array(katBytes.byteLength);
    katOwned.set(katBytes);
    const kat = new Uint8Array(await crypto.subtle.digest('SHA-256', katOwned.buffer));
    if (kat.byteLength !== 32 || hex(kat) !== SHA256_KAT_DIGEST) {
      return failure('sha256-unavailable', ['Web Crypto SHA-256 known-answer test failed.']);
    }
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer));
    if (digest.byteLength !== 32) {
      return failure('sha256-unavailable', ['Web Crypto SHA-256 returned the wrong digest size.']);
    }
    return {
      algorithm: 'SHA-256',
      canonicalBytes: bytes.byteLength,
      canonicalSha256: hex(digest),
    };
  } catch {
    return failure('sha256-unavailable', ['Web Crypto SHA-256 failed.']);
  }
}

export async function buildDxfAssemblyHandoffV1(
  candidate: unknown,
  options: DxfAssemblyHandoffOptionsV1 = {},
): Promise<DxfAssemblyHandoffBuildResultV1> {
  const prepared = prepareCandidate(candidate, options.trustedCorpus);
  if (!prepared.ok) return prepared;
  const payload: Omit<DxfAssemblyHandoffV1, 'seal'> = {
    ...prepared.prepared.candidate,
    admission: prepared.prepared.admission,
  };
  const seal = await sealPayload(payload, options);
  if (isFailure(seal)) return seal;
  return { ok: true, value: deepFreeze({ ...payload, seal }) };
}

function candidateFromHandoff(handoff: DxfAssemblyHandoffV1): DxfAssemblyHandoffCandidateV1 {
  return {
    schemaVersion: handoff.schemaVersion,
    source: handoff.source,
    physicalSurface: handoff.physicalSurface,
    pieces: handoff.pieces,
    seams: handoff.seams,
    operations: handoff.operations,
    materials: handoff.materials,
  };
}

function validateHandoffEnvelope(value: unknown): value is DxfAssemblyHandoffV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const expected = [...CANDIDATE_KEYS, 'admission', 'seal'].sort();
  if (
    Object.keys(record)
      .sort()
      .some((key, index) => key !== expected[index]) ||
    Object.keys(record).length !== expected.length
  )
    return false;
  const errors: string[] = [];
  if (
    !recordWithExactKeys(
      record.admission,
      [
        'productionReady',
        'reason',
        'corpusBindingVerified',
        'corpusAuthorityVerified',
        'blockers',
        'geometryPreflight',
        'heuristicInferenceUsed',
      ],
      'handoff.admission',
      errors,
    ) ||
    !recordWithExactKeys(
      record.seal,
      ['algorithm', 'canonicalBytes', 'canonicalSha256'],
      'handoff.seal',
      errors,
    )
  ) {
    return false;
  }
  const candidate = Object.fromEntries(CANDIDATE_KEYS.map((key) => [key, record[key]]));
  return validateCandidateShape(candidate, errors) && errors.length === 0;
}

function assemblyFromHandoff(handoff: DxfAssemblyHandoffV1): GarmentAssemblyIR {
  const vertexLookup = new Map<string, DxfBoundaryVertexV1>();
  handoff.pieces.forEach((piece) =>
    piece.contours.forEach((contour) =>
      contour.vertices.forEach((vertex) =>
        vertexLookup.set(piece.id + '/' + contour.id + '/' + vertex.id, vertex),
      ),
    ),
  );
  const normalizedRangeForSide = (side: DxfSeamSideV1): readonly [number, number] => {
    const contour = handoff.pieces
      .find(({ id }) => id === side.pieceId)
      ?.contours.find(({ id }) => id === side.contourId);
    if (!contour) throw new TypeError('Verified seam contour disappeared.');
    const startIndex = contour.vertices.findIndex(({ id }) => id === side.anchors[0]);
    const endIndex = contour.vertices.findIndex(({ id }) => id === side.anchors[1]);
    const count = contour.vertices.length;
    if (startIndex < 0 || endIndex < 0 || count < 2)
      throw new TypeError('Verified seam anchor disappeared.');

    // GarmentAssemblyIR stores the declared source-curve interval, not traversal order. For the
    // final closed-contour edge, vertex identity wraps to index 0 while directed progress ends at
    // exactly 1. Keep direction separate and materialize the periodic interval without epsilon.
    if ((startIndex + 1) % count === endIndex)
      return [
        contour.vertices[startIndex].source.normalizedArc,
        endIndex === 0 ? 1 : contour.vertices[endIndex].source.normalizedArc,
      ];
    if ((endIndex + 1) % count === startIndex)
      return [
        contour.vertices[endIndex].source.normalizedArc,
        startIndex === 0 ? 1 : contour.vertices[startIndex].source.normalizedArc,
      ];
    return [
      contour.vertices[startIndex].source.normalizedArc,
      contour.vertices[endIndex].source.normalizedArc,
    ];
  };
  const assembly: GarmentAssemblyIR = {
    schemaVersion: GARMENT_ASSEMBLY_IR_VERSION,
    source: {
      documentId: handoff.source.documentId,
      revision: handoff.source.revision,
      hash: 'sha256:' + handoff.seal.canonicalSha256,
      units: 'mm',
    },
    physicalSurface: { ...handoff.physicalSurface },
    pieces: handoff.pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      cutCount: piece.cutCount,
      grainDegrees: piece.grainDegrees,
      contours: piece.contours.map((contour) => ({
        id: contour.id,
        role: contour.role === 'hole' ? 'hole' : 'shell',
        closed: true,
        pointsMm: contour.vertices.map((vertex) => vertex.positionMm),
        sourceCurveIds: contour.vertices.map((vertex) => vertex.source.sourceCurveId),
      })),
    })),
    seams: handoff.seams.map((seam) => {
      const convertSide = (side: DxfSeamSideV1) => {
        const prefix = side.pieceId + '/' + side.contourId + '/';
        const start = vertexLookup.get(prefix + side.anchors[0]);
        const end = vertexLookup.get(prefix + side.anchors[1]);
        if (!start || !end) throw new TypeError('Verified seam anchor disappeared.');
        return {
          pieceId: side.pieceId,
          contourId: side.contourId,
          normalizedRange: normalizedRangeForSide(side),
          direction: side.direction,
        };
      };
      return {
        id: seam.id,
        operationId: seam.operationId,
        sides: [convertSide(seam.sides[0]), convertSide(seam.sides[1])],
        mapping: seam.mapping,
        lengthRatio: seam.lengthRatio,
      };
    }),
    operations: handoff.operations.map((operation) => ({
      id: operation.id,
      order: operation.order,
      kind: operation.kind,
      seamIds: operation.seamIds,
    })),
    materials: handoff.materials.map((material) => ({ ...material })),
  };
  return deepFreeze(assembly);
}

export async function compileDxfAssemblyHandoffV1(
  value: unknown,
  options: DxfAssemblyHandoffOptionsV1 = {},
): Promise<DxfAssemblyHandoffCompileResultV1> {
  let snapshot: unknown;
  try {
    snapshot = safeSnapshot(value);
  } catch (error) {
    return failure('invalid-candidate', [
      error instanceof Error ? error.message : 'Handoff snapshot failed.',
    ]);
  }
  if (!validateHandoffEnvelope(snapshot)) {
    return failure('invalid-candidate', ['Handoff envelope or nested shape is invalid.']);
  }
  const prepared = prepareCandidate(candidateFromHandoff(snapshot), options.trustedCorpus);
  if (!prepared.ok) return prepared;
  const expectedPayload: Omit<DxfAssemblyHandoffV1, 'seal'> = {
    ...prepared.prepared.candidate,
    admission: prepared.prepared.admission,
  };
  const snapshotPayload = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== 'seal'),
  );
  if (canonical(expectedPayload) !== canonical(snapshotPayload)) {
    return failure('seal-mismatch', ['Handoff is not in canonical normalized order.']);
  }
  const expectedSeal = await sealPayload(expectedPayload, options);
  if (isFailure(expectedSeal)) return expectedSeal;
  if (
    snapshot.seal.algorithm !== 'SHA-256' ||
    snapshot.seal.canonicalBytes !== expectedSeal.canonicalBytes ||
    snapshot.seal.canonicalSha256 !== expectedSeal.canonicalSha256
  ) {
    return failure('seal-mismatch', ['Handoff SHA-256 seal does not match its canonical payload.']);
  }
  let assembly: GarmentAssemblyIR;
  try {
    assembly = assemblyFromHandoff(snapshot);
  } catch (error) {
    return failure('garment-ir-invalid', [
      error instanceof Error ? error.message : 'GarmentAssemblyIR adapter failed.',
    ]);
  }
  const irErrors = validateGarmentAssemblyIR(assembly).filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (irErrors.length > 0) {
    return failure(
      'garment-ir-invalid',
      irErrors.map((diagnostic) => diagnostic.code + ': ' + diagnostic.message),
    );
  }
  return deepFreeze({
    ok: true,
    assembly,
    sourceHandoffSha256: snapshot.seal.canonicalSha256,
    productionReady: snapshot.admission.productionReady,
  });
}
