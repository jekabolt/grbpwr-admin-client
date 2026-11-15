import {
  DXF_PATH_PROVENANCE_READ_V1,
  type DxfPathProvenanceDetailedReadV1,
  type DxfPathProvenanceReadArtifactV1,
} from './adapters/dxf/dxf-types';
import {
  DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1,
  validateDxfPathProvenanceV1,
  type DxfCurveParameterSpaceV1,
  type DxfPathProvenanceV1,
} from './dxf-path-provenance-v1';
import type { PieceSpec, PtMm } from './types';

export const DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1 = 'dxf-piece-spec-provenance-source/1' as const;
export const DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1 = 'dxf-piece-spec-provenance-bridge/1' as const;
export const DXF_PIECE_SPEC_PROVENANCE_COORDINATE_EPSILON_MM_V1 = 1e-9 as const;

const MAX_PATHS = 16_384;
const MAX_CONTOURS = 4_096;
const MAX_TOTAL_VERTICES = 100_000;
const MAX_SOURCE_PATHS_PER_CONTOUR = 64;
const MAX_BLOCKERS = 128;
const MAX_STRING_UTF8_BYTES = 256;
const MAX_COORDINATE_ABS_MM = 10_000_000;
const MAX_SCALE = 1_000_000;
const MAX_UPSTREAM_BLOCKERS = 100_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const textEncoder = new TextEncoder();

const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const OBJECT_IS_FROZEN = Object.isFrozen;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export type DxfPieceSpecTopologyMutationV1 =
  | 'delete'
  | 'merge'
  | 'split'
  | 'clean'
  | 'offset'
  | 'simplify'
  | 'repair'
  | 'unfold'
  | 'mirror'
  | 'rul';

export type DxfPieceSpecProvenanceBlockerCodeV1 =
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'source-path-missing'
  | 'source-file-mismatch'
  | 'duplicate-identity'
  | 'target-contour-missing'
  | 'sample-count-mismatch'
  | 'coordinate-mismatch'
  | 'closure-mismatch'
  | 'open-contour-reorder-forbidden'
  | 'degenerate-contour'
  | 'delete-lineage-not-preserved'
  | 'merge-lineage-not-preserved'
  | 'split-lineage-not-preserved'
  | 'clean-lineage-not-preserved'
  | 'offset-lineage-not-preserved'
  | 'simplify-lineage-not-preserved'
  | 'repair-lineage-not-preserved'
  | 'unfold-lineage-not-preserved'
  | 'mirror-lineage-not-preserved'
  | 'rul-lineage-not-preserved';

export type DxfPieceSpecProvenanceBlockerV1 = Readonly<{
  code: DxfPieceSpecProvenanceBlockerCodeV1;
  contourId: string | null;
  sourcePathIds: readonly number[];
  detail: string;
}>;

export type DxfPieceSpecProvenanceSourcePathV1 = Readonly<{
  pathId: number;
  closed: boolean;
  pointsMm: readonly Readonly<PtMm>[];
  provenance: DxfPathProvenanceV1;
}>;

export type DxfPieceSpecProvenanceSourceV1 = Readonly<{
  schemaVersion: typeof DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1;
  sourceFileId: string;
  paths: readonly DxfPieceSpecProvenanceSourcePathV1[];
  upstreamBlockerCount: number;
  productionReady: false;
  heuristicRecoveryUsed: false;
  pieceSpecWireIntegrated: false;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
}>;

export type DxfPieceSpecContourGeometryV1 =
  | Readonly<{ kind: 'cut' }>
  | Readonly<{ kind: 'seam' }>
  | Readonly<{ kind: 'cut-loop'; index: number }>;

export type DxfPieceSpecExplicitLineageV1 = Readonly<{
  /** More than one path is an explicit merge and is blocked in V1. */
  sourcePathIds: readonly number[];
  /** Caller-declared origin-centred uniform scale. It is verified, never fitted. */
  uniformPositiveScale: number;
  /** Rotate the source sample array before orientation. Non-zero is closed-contour only. */
  cyclicShift: number;
  direction: 'forward' | 'reverse';
  mutations: readonly DxfPieceSpecTopologyMutationV1[];
}>;

export type DxfPieceSpecContourBoundaryV1 = Readonly<{
  pieceId: string;
  sizeToken: string;
  contourId: string;
  role: 'sewing-boundary' | 'cut-boundary' | 'hole';
  geometry: DxfPieceSpecContourGeometryV1;
  closed: boolean;
  pointsMm: readonly Readonly<PtMm>[];
  lineage: DxfPieceSpecExplicitLineageV1;
}>;

export type DxfPieceSpecContourProjectionV1 = Readonly<{
  contourId: string;
  role: DxfPieceSpecContourBoundaryV1['role'];
  geometry: DxfPieceSpecContourGeometryV1;
  lineage: DxfPieceSpecExplicitLineageV1;
}>;

export type DxfPieceSpecProvenanceBridgeInputV1 = Readonly<{
  schemaVersion: typeof DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1;
  source: DxfPieceSpecProvenanceSourceV1;
  contours: readonly DxfPieceSpecContourBoundaryV1[];
}>;

export type DxfPieceSpecBridgeSourceVertexV1 = Readonly<{
  vertexId: string;
  sourceCurveId: string;
  parameterSpace: DxfCurveParameterSpaceV1;
  sourceCurveT: number;
  normalizedArc: number;
}>;

/** Structurally identical to PatternImportDxfBridgeContourV1. */
export type DxfPieceSpecBridgeContourV1 = Readonly<{
  id: string;
  role: DxfPieceSpecContourBoundaryV1['role'];
  geometry: DxfPieceSpecContourGeometryV1;
  sourceVertices: readonly DxfPieceSpecBridgeSourceVertexV1[];
}>;

/** Structurally identical to PatternImportDxfBridgePieceV1. */
export type DxfPieceSpecBridgePieceV1 = Readonly<{
  pieceId: string;
  sizeToken: string;
  contours: readonly DxfPieceSpecBridgeContourV1[];
}>;

export type DxfPieceSpecProvenanceBridgeArtifactV1 = Readonly<{
  schemaVersion: typeof DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1;
  sourceFileId: string;
  pieces: readonly DxfPieceSpecBridgePieceV1[];
  upstreamBlockerCount: number;
  productionReady: false;
  heuristicRecoveryUsed: false;
  pieceSpecWireIntegrated: false;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
}>;

export type DxfPieceSpecProvenanceResultV1<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      blockers: readonly DxfPieceSpecProvenanceBlockerV1[];
      carriedIdentity: false;
      productionReady: false;
      heuristicRecoveryUsed: false;
    }>;

export const DXF_PIECE_SPEC_TOPOLOGY_BLOCKERS_V1 = Object.freeze({
  delete: 'delete-lineage-not-preserved',
  merge: 'merge-lineage-not-preserved',
  split: 'split-lineage-not-preserved',
  clean: 'clean-lineage-not-preserved',
  offset: 'offset-lineage-not-preserved',
  simplify: 'simplify-lineage-not-preserved',
  repair: 'repair-lineage-not-preserved',
  unfold: 'unfold-lineage-not-preserved',
  mirror: 'mirror-lineage-not-preserved',
  rul: 'rul-lineage-not-preserved',
} as const satisfies Readonly<
  Record<DxfPieceSpecTopologyMutationV1, DxfPieceSpecProvenanceBlockerCodeV1>
>);

export const DXF_PIECE_SPEC_PROVENANCE_BRIDGE_CONTRACT_V1 = Object.freeze({
  source: 'readDxfWithPathProvenanceV1 exact PathId sidecar',
  target: 'PieceSizeSpec cut/seam/cutLoops boundary sidecar',
  allowedTransforms: Object.freeze([
    'caller-declared-positive-uniform-scale',
    'caller-declared-closed-cyclic-shift',
    'caller-declared-reversal',
  ] as const),
  coordinateEpsilonMm: DXF_PIECE_SPEC_PROVENANCE_COORDINATE_EPSILON_MM_V1,
  transformSearchAllowed: false,
  nearestGeometryRecoveryAllowed: false,
  layerRecoveryAllowed: false,
  topologyMutationCarryAllowed: false,
  atomicFailureCarriesNoIdentity: true,
  pieceSpecWireSchemaChanged: false,
  productionReadyClaim: false,
  includesRawDxf: false,
  includesTags: false,
  includesAst: false,
} as const);

class BridgeFailure extends Error {
  constructor(
    readonly code: DxfPieceSpecProvenanceBlockerCodeV1,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type ExactRecord = Readonly<Record<string, unknown>>;

function fail(code: DxfPieceSpecProvenanceBlockerCodeV1, field: string, detail: string): never {
  throw new BridgeFailure(code, field, detail);
}

function freezeBlocker(
  code: DxfPieceSpecProvenanceBlockerCodeV1,
  contourId: string | null,
  sourcePathIds: readonly number[],
  detail: string,
): DxfPieceSpecProvenanceBlockerV1 {
  return Object.freeze({
    code,
    contourId,
    sourcePathIds: Object.freeze([...sourcePathIds]),
    detail,
  });
}

function blocked<T>(
  blockers: readonly DxfPieceSpecProvenanceBlockerV1[],
): DxfPieceSpecProvenanceResultV1<T> {
  return Object.freeze({
    ok: false as const,
    blockers: Object.freeze([...blockers]),
    carriedIdentity: false as const,
    productionReady: false as const,
    heuristicRecoveryUsed: false as const,
  });
}

function failureResult<T>(error: unknown): DxfPieceSpecProvenanceResultV1<T> {
  const known = error instanceof BridgeFailure;
  return blocked([
    freezeBlocker(
      known ? error.code : 'invalid-input',
      null,
      [],
      known
        ? `${error.field}: ${error.message}`
        : 'DXF PieceSpec provenance bridge rejected inaccessible or hostile input.',
    ),
  ]);
}

function success<T>(value: T): DxfPieceSpecProvenanceResultV1<T> {
  return Object.freeze({ ok: true as const, value });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  requireFrozen: boolean,
): ExactRecord {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    fail('invalid-input', label, 'must be an exact plain data record.');
  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  let frozen: boolean;
  try {
    prototype = OBJECT_GET_PROTOTYPE_OF(value);
    ownKeys = REFLECT_OWN_KEYS(value);
    descriptors = OBJECT_GET_OWN_PROPERTY_DESCRIPTORS(value) as unknown as PropertyDescriptorMap;
    frozen = OBJECT_IS_FROZEN(value);
  } catch {
    fail('invalid-input', label, 'must be an accessible exact plain data record.');
  }
  if (prototype !== Object.prototype || (requireFrozen && !frozen))
    fail('invalid-input', label, `must be an exact${requireFrozen ? ' frozen' : ''} record.`);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', label, 'contains missing, hidden, symbol, or unexpected fields.');
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${label}.${key}`, 'must be an enumerable data property.');
  }
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, descriptors[key].value])) as Record<string, unknown>,
  );
}

function exactArray(
  value: unknown,
  label: string,
  maximumLength: number,
  requireFrozen: boolean,
): readonly unknown[] {
  if (!Array.isArray(value)) fail('invalid-input', label, 'must be a dense array.');
  let ownKeys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  let frozen: boolean;
  let prototype: object | null;
  try {
    ownKeys = REFLECT_OWN_KEYS(value);
    descriptors = OBJECT_GET_OWN_PROPERTY_DESCRIPTORS(value) as unknown as PropertyDescriptorMap;
    frozen = OBJECT_IS_FROZEN(value);
    prototype = OBJECT_GET_PROTOTYPE_OF(value);
  } catch {
    fail('invalid-input', label, 'must be an accessible dense array.');
  }
  if (prototype !== Array.prototype)
    fail('invalid-input', label, 'must have the exact Array prototype.');
  if (requireFrozen && !frozen) fail('invalid-input', label, 'must be frozen.');
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength
  )
    fail('bounds-exceeded', label, `length is invalid or exceeds ${maximumLength}.`);
  const length = lengthDescriptor.value as number;
  if (ownKeys.length !== length + 1)
    fail('invalid-input', label, 'must be dense and contain no hidden or symbol fields.');
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${label}[${index}]`, 'must be an enumerable data element.');
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function boundedString(value: unknown, label: string, stable = false): string {
  let wellFormedUnicode = typeof value === 'string';
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          wellFormedUnicode = false;
          break;
        }
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        wellFormedUnicode = false;
        break;
      }
    }
  }
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    textEncoder.encode(value).byteLength > MAX_STRING_UTF8_BYTES ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) ||
    !wellFormedUnicode ||
    (stable && !STABLE_ID.test(value))
  )
    fail(
      'invalid-input',
      label,
      `must be a bounded canonical${stable ? ' stable-id' : ''} string.`,
    );
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail('invalid-input', label, 'must be a non-negative safe integer.');
  return value as number;
}

function finiteCoordinate(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_COORDINATE_ABS_MM
  )
    fail('bounds-exceeded', label, 'must be a finite bounded millimetre coordinate.');
  return Object.is(value, -0) ? 0 : value;
}

function snapshotPoints(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): readonly Readonly<PtMm>[] {
  const raw = exactArray(
    value,
    label,
    DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1,
    requireFrozen,
  );
  return Object.freeze(
    raw.map((point, index) => {
      const record = exactRecord(point, ['x', 'y'], `${label}[${index}]`, requireFrozen);
      return Object.freeze({
        x: finiteCoordinate(record.x, `${label}[${index}].x`),
        y: finiteCoordinate(record.y, `${label}[${index}].y`),
      });
    }),
  );
}

function snapshotGeometry(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): DxfPieceSpecContourGeometryV1 {
  let hasIndex: boolean;
  try {
    hasIndex = Object.getOwnPropertyDescriptor(value, 'index') !== undefined;
  } catch {
    fail('invalid-input', label, 'must be an accessible exact geometry selector.');
  }
  const kindRecord = exactRecord(
    value,
    hasIndex ? ['kind', 'index'] : ['kind'],
    label,
    requireFrozen,
  );
  if (kindRecord.kind === 'cut' || kindRecord.kind === 'seam') {
    if ('index' in kindRecord) fail('invalid-input', label, 'has an unexpected loop index.');
    return Object.freeze({ kind: kindRecord.kind });
  }
  if (kindRecord.kind !== 'cut-loop')
    fail('invalid-input', `${label}.kind`, 'is not a supported PieceSizeSpec geometry selector.');
  return Object.freeze({
    kind: 'cut-loop' as const,
    index: nonnegativeInteger(kindRecord.index, `${label}.index`),
  });
}

function snapshotMutations(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): readonly DxfPieceSpecTopologyMutationV1[] {
  const raw = exactArray(value, label, 10, requireFrozen);
  const allowed = new Set<DxfPieceSpecTopologyMutationV1>([
    'delete',
    'merge',
    'split',
    'clean',
    'offset',
    'simplify',
    'repair',
    'unfold',
    'mirror',
    'rul',
  ]);
  const seen = new Set<DxfPieceSpecTopologyMutationV1>();
  const output: DxfPieceSpecTopologyMutationV1[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const mutation = raw[index];
    if (typeof mutation !== 'string' || !allowed.has(mutation as DxfPieceSpecTopologyMutationV1))
      fail('invalid-input', `${label}[${index}]`, 'is not a supported topology mutation.');
    const typed = mutation as DxfPieceSpecTopologyMutationV1;
    if (seen.has(typed)) fail('invalid-input', `${label}[${index}]`, 'is duplicated.');
    seen.add(typed);
    output.push(typed);
  }
  return Object.freeze(output);
}

function snapshotLineage(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): DxfPieceSpecExplicitLineageV1 {
  const record = exactRecord(
    value,
    ['sourcePathIds', 'uniformPositiveScale', 'cyclicShift', 'direction', 'mutations'],
    label,
    requireFrozen,
  );
  const rawIds = exactArray(
    record.sourcePathIds,
    `${label}.sourcePathIds`,
    MAX_SOURCE_PATHS_PER_CONTOUR,
    requireFrozen,
  );
  const sourcePathIds = Object.freeze(
    rawIds.map((id, index) => nonnegativeInteger(id, `${label}.sourcePathIds[${index}]`)),
  );
  if (new Set(sourcePathIds).size !== sourcePathIds.length)
    fail('duplicate-identity', `${label}.sourcePathIds`, 'contains a duplicate PathId.');
  const scale = record.uniformPositiveScale;
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 || scale > MAX_SCALE)
    fail(
      'invalid-input',
      `${label}.uniformPositiveScale`,
      'must be caller-declared, finite, positive, and bounded.',
    );
  if (record.direction !== 'forward' && record.direction !== 'reverse')
    fail('invalid-input', `${label}.direction`, 'must be forward or reverse.');
  return Object.freeze({
    sourcePathIds,
    uniformPositiveScale: scale,
    cyclicShift: nonnegativeInteger(record.cyclicShift, `${label}.cyclicShift`),
    direction: record.direction,
    mutations: snapshotMutations(record.mutations, `${label}.mutations`, requireFrozen),
  });
}

function snapshotBoundary(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): DxfPieceSpecContourBoundaryV1 {
  const record = exactRecord(
    value,
    ['pieceId', 'sizeToken', 'contourId', 'role', 'geometry', 'closed', 'pointsMm', 'lineage'],
    label,
    requireFrozen,
  );
  if (record.role !== 'sewing-boundary' && record.role !== 'cut-boundary' && record.role !== 'hole')
    fail('invalid-input', `${label}.role`, 'is not a supported explicit contour role.');
  if (typeof record.closed !== 'boolean')
    fail('invalid-input', `${label}.closed`, 'must be boolean.');
  return Object.freeze({
    pieceId: boundedString(record.pieceId, `${label}.pieceId`, true),
    sizeToken: boundedString(record.sizeToken, `${label}.sizeToken`),
    contourId: boundedString(record.contourId, `${label}.contourId`, true),
    role: record.role,
    geometry: snapshotGeometry(record.geometry, `${label}.geometry`, requireFrozen),
    closed: record.closed,
    pointsMm: snapshotPoints(record.pointsMm, `${label}.pointsMm`, requireFrozen),
    lineage: snapshotLineage(record.lineage, `${label}.lineage`, requireFrozen),
  });
}

function snapshotSourcePath(
  value: unknown,
  label: string,
  requireFrozen: boolean,
): DxfPieceSpecProvenanceSourcePathV1 {
  const record = exactRecord(
    value,
    ['pathId', 'closed', 'pointsMm', 'provenance'],
    label,
    requireFrozen,
  );
  if (typeof record.closed !== 'boolean')
    fail('invalid-input', `${label}.closed`, 'must be boolean.');
  const pointsMm = snapshotPoints(record.pointsMm, `${label}.pointsMm`, requireFrozen);
  const provenance = validateDxfPathProvenanceV1(record.provenance, pointsMm.length);
  if (!provenance.ok) {
    const code =
      provenance.code === 'sample-count-mismatch'
        ? 'sample-count-mismatch'
        : provenance.code === 'duplicate-identity'
          ? 'duplicate-identity'
          : 'invalid-input';
    fail(code, `${label}.provenance`, provenance.errors.join('; '));
  }
  return Object.freeze({
    pathId: nonnegativeInteger(record.pathId, `${label}.pathId`),
    closed: record.closed,
    pointsMm,
    provenance: provenance.value,
  });
}

function snapshotSource(value: unknown, requireFrozen: boolean): DxfPieceSpecProvenanceSourceV1 {
  const record = exactRecord(
    value,
    [
      'schemaVersion',
      'sourceFileId',
      'paths',
      'upstreamBlockerCount',
      'productionReady',
      'heuristicRecoveryUsed',
      'pieceSpecWireIntegrated',
      'includesRawDxf',
      'includesTags',
      'includesAst',
    ],
    'source',
    requireFrozen,
  );
  if (
    record.schemaVersion !== DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1 ||
    record.productionReady !== false ||
    record.heuristicRecoveryUsed !== false ||
    record.pieceSpecWireIntegrated !== false ||
    record.includesRawDxf !== false ||
    record.includesTags !== false ||
    record.includesAst !== false
  )
    fail('invalid-input', 'source', 'has unsupported schema or safety claims.');
  const sourceFileId = boundedString(record.sourceFileId, 'source.sourceFileId');
  const rawPaths = exactArray(record.paths, 'source.paths', MAX_PATHS, requireFrozen);
  let totalVertices = 0;
  const pathIds = new Set<number>();
  const vertexIds = new Set<string>();
  const parameterIdentities = new Set<string>();
  const paths = rawPaths.map((path, index) => {
    const snapshot = snapshotSourcePath(path, `source.paths[${index}]`, requireFrozen);
    if (pathIds.has(snapshot.pathId))
      fail('duplicate-identity', `source.paths[${index}].pathId`, 'repeats a PathId.');
    pathIds.add(snapshot.pathId);
    if (snapshot.provenance.sourceFileId !== sourceFileId)
      fail('source-file-mismatch', `source.paths[${index}]`, 'crosses sourceFileId lineage.');
    totalVertices += snapshot.pointsMm.length;
    if (totalVertices > MAX_TOTAL_VERTICES)
      fail('bounds-exceeded', 'source.paths', `exceeds ${MAX_TOTAL_VERTICES} total vertices.`);
    for (const sample of snapshot.provenance.samples) {
      if (vertexIds.has(sample.vertexId))
        fail('duplicate-identity', `source.paths[${index}]`, 'repeats a global vertex identity.');
      vertexIds.add(sample.vertexId);
      const parameterIdentity = `${sample.sourceCurveId}\u0000${sample.parameterSpace}\u0000${sample.sourceCurveT}`;
      if (parameterIdentities.has(parameterIdentity))
        fail(
          'duplicate-identity',
          `source.paths[${index}]`,
          'repeats a global source-curve parameter identity.',
        );
      parameterIdentities.add(parameterIdentity);
    }
    return snapshot;
  });
  const upstreamBlockerCount = nonnegativeInteger(
    record.upstreamBlockerCount,
    'source.upstreamBlockerCount',
  );
  if (upstreamBlockerCount > MAX_UPSTREAM_BLOCKERS)
    fail('bounds-exceeded', 'source.upstreamBlockerCount', 'exceeds the audit bound.');
  return Object.freeze({
    schemaVersion: DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1,
    sourceFileId,
    paths: Object.freeze(paths),
    upstreamBlockerCount,
    productionReady: false as const,
    heuristicRecoveryUsed: false as const,
    pieceSpecWireIntegrated: false as const,
    includesRawDxf: false as const,
    includesTags: false as const,
    includesAst: false as const,
  });
}

function sourceArtifactHasSupportedShape(artifact: DxfPathProvenanceReadArtifactV1): boolean {
  return (
    artifact.schemaVersion === DXF_PATH_PROVENANCE_READ_V1 &&
    artifact.sharedVertexOwnership === 'outgoing-primitive-open-final-end' &&
    artifact.productionReady === false &&
    artifact.heuristicRecoveryUsed === false &&
    artifact.pieceSpecIntegrated === false
  );
}

/**
 * Projects the exact Phase-B PathId sidecar and the same read's IR points into a bounded carrier.
 * Matching is PathId-only; no point, layer, filename, or nearest-geometry lookup is performed.
 */
export function createDxfPieceSpecProvenanceSourceV1(
  detailedRead: DxfPathProvenanceDetailedReadV1,
): DxfPieceSpecProvenanceResultV1<DxfPieceSpecProvenanceSourceV1> {
  try {
    const artifact = detailedRead.provenance;
    if (!sourceArtifactHasSupportedShape(artifact))
      fail('invalid-input', 'detailedRead.provenance', 'has unsupported safety claims.');
    const sourceFileId = boundedString(
      artifact.sourceFileId,
      'detailedRead.provenance.sourceFileId',
    );
    if (artifact.paths.length > MAX_PATHS)
      fail('bounds-exceeded', 'detailedRead.provenance.paths', `exceeds ${MAX_PATHS} paths.`);
    const readPaths = new Map<number, { pts: PtMm[]; closed: boolean }>();
    for (const page of detailedRead.read.doc.pages) {
      for (const path of page.paths) {
        const pathId = nonnegativeInteger(path.id, 'detailedRead.read.doc.pages[].paths[].id');
        if (readPaths.has(pathId))
          fail('duplicate-identity', 'detailedRead.read.doc.pages[].paths[].id', 'repeats PathId.');
        readPaths.set(pathId, path);
      }
    }
    const paths: DxfPieceSpecProvenanceSourcePathV1[] = [];
    for (let index = 0; index < artifact.paths.length; index += 1) {
      const entry = artifact.paths[index];
      const path = readPaths.get(entry.pathId);
      if (!path)
        fail(
          'source-path-missing',
          `detailedRead.provenance.paths[${index}].pathId`,
          'does not exist in the same detailed read.',
        );
      const pointsMm = snapshotPoints(
        path.pts,
        `detailedRead.read.path(${entry.pathId}).pts`,
        false,
      );
      const provenance = validateDxfPathProvenanceV1(entry.provenance, pointsMm.length);
      if (!provenance.ok) {
        const code =
          provenance.code === 'sample-count-mismatch'
            ? 'sample-count-mismatch'
            : provenance.code === 'duplicate-identity'
              ? 'duplicate-identity'
              : 'invalid-input';
        fail(code, `detailedRead.provenance.paths[${index}]`, provenance.errors.join('; '));
      }
      paths.push(
        Object.freeze({
          pathId: entry.pathId,
          closed: path.closed,
          pointsMm,
          provenance: provenance.value,
        }),
      );
    }
    paths.sort((left, right) => left.pathId - right.pathId);
    const candidate = Object.freeze({
      schemaVersion: DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1,
      sourceFileId,
      paths: Object.freeze(paths),
      upstreamBlockerCount: artifact.blockers.length,
      productionReady: false as const,
      heuristicRecoveryUsed: false as const,
      pieceSpecWireIntegrated: false as const,
      includesRawDxf: false as const,
      includesTags: false as const,
      includesAst: false as const,
    });
    return success(snapshotSource(candidate, true));
  } catch (error) {
    return failureResult(error);
  }
}

function snapshotProjection(
  value: unknown,
  requireFrozen: boolean,
): DxfPieceSpecContourProjectionV1 {
  const record = exactRecord(
    value,
    ['contourId', 'role', 'geometry', 'lineage'],
    'projection',
    requireFrozen,
  );
  if (record.role !== 'sewing-boundary' && record.role !== 'cut-boundary' && record.role !== 'hole')
    fail('invalid-input', 'projection.role', 'is not a supported explicit contour role.');
  return Object.freeze({
    contourId: boundedString(record.contourId, 'projection.contourId', true),
    role: record.role,
    geometry: snapshotGeometry(record.geometry, 'projection.geometry', requireFrozen),
    lineage: snapshotLineage(record.lineage, 'projection.lineage', requireFrozen),
  });
}

/**
 * Copies one final PieceSizeSpec contour into the narrow bridge boundary. PieceSpec itself is not
 * extended or mutated; the geometry selector remains explicit for the existing assembly bridge.
 */
export function projectDxfPieceSpecContourBoundaryV1(
  piece: PieceSpec,
  sizeTokenInput: string,
  projectionInput: DxfPieceSpecContourProjectionV1,
): DxfPieceSpecProvenanceResultV1<DxfPieceSpecContourBoundaryV1> {
  try {
    const pieceId = boundedString(piece.identity, 'piece.identity', true);
    const sizeToken = boundedString(sizeTokenInput, 'sizeToken');
    const matches = piece.sizes.filter((size) => size.sizeToken === sizeToken);
    if (matches.length !== 1)
      fail(
        'target-contour-missing',
        'piece.sizes',
        `must contain exactly one sizeToken ${sizeToken}.`,
      );
    const projection = snapshotProjection(projectionInput, false);
    const size = matches[0];
    const points =
      projection.geometry.kind === 'cut'
        ? size.cut
        : projection.geometry.kind === 'seam'
          ? size.seam
          : (size.cutLoops?.[projection.geometry.index] ?? null);
    if (!points)
      fail(
        'target-contour-missing',
        `piece.sizes[${sizeToken}].${projection.geometry.kind}`,
        'does not exist.',
      );
    return success(
      Object.freeze({
        pieceId,
        sizeToken,
        contourId: projection.contourId,
        role: projection.role,
        geometry: projection.geometry,
        closed: true,
        pointsMm: snapshotPoints(points, 'PieceSizeSpec contour', false),
        lineage: projection.lineage,
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

export function createDxfPieceSpecProvenanceBridgeInputV1(
  sourceInput: DxfPieceSpecProvenanceSourceV1,
  contoursInput: readonly DxfPieceSpecContourBoundaryV1[],
): DxfPieceSpecProvenanceResultV1<DxfPieceSpecProvenanceBridgeInputV1> {
  try {
    const source = snapshotSource(sourceInput, true);
    const rawContours = exactArray(contoursInput, 'contours', MAX_CONTOURS, true);
    const contours = Object.freeze(
      rawContours.map((contour, index) => snapshotBoundary(contour, `contours[${index}]`, true)),
    );
    return success(
      Object.freeze({
        schemaVersion: DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1,
        source,
        contours,
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

function snapshotBridgeInput(value: unknown): DxfPieceSpecProvenanceBridgeInputV1 {
  const record = exactRecord(value, ['schemaVersion', 'source', 'contours'], 'bridgeInput', true);
  if (record.schemaVersion !== DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1)
    fail('invalid-input', 'bridgeInput.schemaVersion', 'is unsupported.');
  const source = snapshotSource(record.source, true);
  const rawContours = exactArray(record.contours, 'bridgeInput.contours', MAX_CONTOURS, true);
  if (rawContours.length === 0)
    fail('invalid-input', 'bridgeInput.contours', 'must select at least one target contour.');
  let totalVertices = 0;
  const contours = rawContours.map((contour, index) => {
    const snapshot = snapshotBoundary(contour, `bridgeInput.contours[${index}]`, true);
    totalVertices += snapshot.pointsMm.length;
    if (totalVertices > MAX_TOTAL_VERTICES)
      fail(
        'bounds-exceeded',
        'bridgeInput.contours',
        `exceeds ${MAX_TOTAL_VERTICES} total vertices.`,
      );
    return snapshot;
  });
  return Object.freeze({
    schemaVersion: DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1,
    source,
    contours: Object.freeze(contours),
  });
}

function mappedSourceIndex(
  length: number,
  cyclicShift: number,
  direction: 'forward' | 'reverse',
  targetIndex: number,
  closed: boolean,
): number {
  if (!closed) return direction === 'forward' ? targetIndex : length - 1 - targetIndex;
  return direction === 'forward'
    ? (cyclicShift + targetIndex) % length
    : (cyclicShift + length - 1 - targetIndex) % length;
}

function normalizedArcs(
  points: readonly Readonly<PtMm>[],
  closed: boolean,
  contourId: string,
): readonly number[] | DxfPieceSpecProvenanceBlockerV1 {
  const minimum = closed ? 3 : 2;
  if (points.length < minimum)
    return freezeBlocker(
      'degenerate-contour',
      contourId,
      [],
      `${closed ? 'closed' : 'open'} contour requires at least ${minimum} vertices.`,
    );
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    if (!(distance > 0) || !Number.isFinite(distance))
      return freezeBlocker(
        'degenerate-contour',
        contourId,
        [],
        `zero-length or invalid segment at target vertex ${index}.`,
      );
    total += distance;
    cumulative.push(total);
  }
  if (closed) {
    const closing = Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].y - points[points.length - 1].y,
    );
    if (!(closing > 0) || !Number.isFinite(closing))
      return freezeBlocker(
        'degenerate-contour',
        contourId,
        [],
        'closed contour has a zero-length or invalid closing segment.',
      );
    total += closing;
  }
  if (!(total > 0) || !Number.isFinite(total))
    return freezeBlocker('degenerate-contour', contourId, [], 'contour arc length is invalid.');
  return Object.freeze(cumulative.map((distance) => distance / total));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Atomically carries exact sample identity to the final PieceSpec geometry boundary. Any blocker
 * returns no artifact and therefore no source vertex identity.
 */
export function bridgeDxfProvenanceToPieceSpecBoundaryV1(
  inputValue: unknown,
): DxfPieceSpecProvenanceResultV1<DxfPieceSpecProvenanceBridgeArtifactV1> {
  let input: DxfPieceSpecProvenanceBridgeInputV1;
  try {
    input = snapshotBridgeInput(inputValue);
  } catch (error) {
    return failureResult(error);
  }

  const blockers: DxfPieceSpecProvenanceBlockerV1[] = [];
  const appendBlocker = (blocker: DxfPieceSpecProvenanceBlockerV1) => {
    if (blockers.length < MAX_BLOCKERS - 1) blockers.push(blocker);
    else if (blockers.length === MAX_BLOCKERS - 1)
      blockers.push(
        freezeBlocker(
          'bounds-exceeded',
          null,
          [],
          `blocker output is capped at ${MAX_BLOCKERS}; remaining failures were suppressed.`,
        ),
      );
  };
  const sourceByPath = new Map(input.source.paths.map((path) => [path.pathId, path]));
  const targetKeys = new Set<string>();
  const selectedSourcePaths = new Map<number, string>();
  const built: {
    pieceId: string;
    sizeToken: string;
    contour: DxfPieceSpecBridgeContourV1;
  }[] = [];

  for (const contour of input.contours) {
    const ids = contour.lineage.sourcePathIds;
    const targetKey = `${contour.pieceId}\u0000${contour.sizeToken}\u0000${contour.contourId}`;
    if (targetKeys.has(targetKey))
      appendBlocker(
        freezeBlocker(
          'duplicate-identity',
          contour.contourId,
          ids,
          'target piece/size/contour identity is duplicated.',
        ),
      );
    targetKeys.add(targetKey);

    for (const mutation of contour.lineage.mutations)
      appendBlocker(
        freezeBlocker(
          DXF_PIECE_SPEC_TOPOLOGY_BLOCKERS_V1[mutation],
          contour.contourId,
          ids,
          `${mutation} changes or discards lineage; V1 carries no identity across it.`,
        ),
      );

    if (ids.length === 0) {
      if (!contour.lineage.mutations.includes('delete'))
        appendBlocker(
          freezeBlocker(
            'source-path-missing',
            contour.contourId,
            ids,
            'an explicit single source PathId is required.',
          ),
        );
      continue;
    }
    if (ids.length > 1) {
      if (!contour.lineage.mutations.includes('merge'))
        appendBlocker(
          freezeBlocker(
            'merge-lineage-not-preserved',
            contour.contourId,
            ids,
            'multiple source paths are a merge; V1 carries no identity across it.',
          ),
        );
      continue;
    }
    const pathId = ids[0];
    const previousTarget = selectedSourcePaths.get(pathId);
    if (previousTarget !== undefined) {
      appendBlocker(
        freezeBlocker(
          'split-lineage-not-preserved',
          contour.contourId,
          ids,
          `source PathId ${pathId} is already bound to ${previousTarget}.`,
        ),
      );
      continue;
    }
    selectedSourcePaths.set(pathId, targetKey);
    const source = sourceByPath.get(pathId);
    if (!source) {
      appendBlocker(
        freezeBlocker(
          'source-path-missing',
          contour.contourId,
          ids,
          `PathId ${pathId} is absent from the exact Phase-B carrier.`,
        ),
      );
      continue;
    }
    if (contour.lineage.mutations.length > 0) continue;
    if (source.closed !== contour.closed) {
      appendBlocker(
        freezeBlocker(
          'closure-mismatch',
          contour.contourId,
          ids,
          'source and target closure differ; closing/opening is a topology change.',
        ),
      );
      continue;
    }
    if (!source.closed && contour.lineage.cyclicShift !== 0) {
      appendBlocker(
        freezeBlocker(
          'open-contour-reorder-forbidden',
          contour.contourId,
          ids,
          'open contours require cyclicShift = 0; only direction may reverse.',
        ),
      );
      continue;
    }
    if (
      source.closed &&
      source.pointsMm.length > 0 &&
      contour.lineage.cyclicShift >= source.pointsMm.length
    ) {
      appendBlocker(
        freezeBlocker(
          'invalid-input',
          contour.contourId,
          ids,
          'closed-contour cyclicShift must be smaller than the source sample count.',
        ),
      );
      continue;
    }
    if (source.pointsMm.length !== contour.pointsMm.length) {
      appendBlocker(
        freezeBlocker(
          'sample-count-mismatch',
          contour.contourId,
          ids,
          `${source.pointsMm.length} source samples do not align with ${contour.pointsMm.length} target points.`,
        ),
      );
      continue;
    }

    const sourceIndices: number[] = [];
    let mismatch = -1;
    for (let targetIndex = 0; targetIndex < contour.pointsMm.length; targetIndex += 1) {
      const sourceIndex = mappedSourceIndex(
        source.pointsMm.length,
        contour.lineage.cyclicShift,
        contour.lineage.direction,
        targetIndex,
        source.closed,
      );
      sourceIndices.push(sourceIndex);
      const expected = source.pointsMm[sourceIndex];
      const target = contour.pointsMm[targetIndex];
      const expectedX = expected.x * contour.lineage.uniformPositiveScale;
      const expectedY = expected.y * contour.lineage.uniformPositiveScale;
      if (
        Math.abs(target.x - expectedX) > DXF_PIECE_SPEC_PROVENANCE_COORDINATE_EPSILON_MM_V1 ||
        Math.abs(target.y - expectedY) > DXF_PIECE_SPEC_PROVENANCE_COORDINATE_EPSILON_MM_V1
      ) {
        mismatch = targetIndex;
        break;
      }
    }
    if (mismatch >= 0) {
      appendBlocker(
        freezeBlocker(
          'coordinate-mismatch',
          contour.contourId,
          ids,
          `target vertex ${mismatch} does not match the caller-declared scale/index/direction mapping.`,
        ),
      );
      continue;
    }
    const arcs = normalizedArcs(contour.pointsMm, contour.closed, contour.contourId);
    if ('code' in arcs) {
      appendBlocker(arcs);
      continue;
    }
    const sourceVertices = Object.freeze(
      sourceIndices.map((sourceIndex, targetIndex) => {
        const sample = source.provenance.samples[sourceIndex];
        return Object.freeze({
          vertexId: sample.vertexId,
          sourceCurveId: sample.sourceCurveId,
          parameterSpace: sample.parameterSpace,
          sourceCurveT: sample.sourceCurveT,
          normalizedArc: arcs[targetIndex],
        });
      }),
    );
    built.push({
      pieceId: contour.pieceId,
      sizeToken: contour.sizeToken,
      contour: Object.freeze({
        id: contour.contourId,
        role: contour.role,
        geometry: contour.geometry,
        sourceVertices,
      }),
    });
  }

  if (blockers.length > 0) return blocked(blockers);

  built.sort(
    (left, right) =>
      compareCodeUnits(left.pieceId, right.pieceId) ||
      compareCodeUnits(left.sizeToken, right.sizeToken) ||
      compareCodeUnits(left.contour.id, right.contour.id),
  );
  const pieces: DxfPieceSpecBridgePieceV1[] = [];
  for (const item of built) {
    const previous = pieces[pieces.length - 1];
    if (previous?.pieceId === item.pieceId && previous.sizeToken === item.sizeToken) {
      pieces[pieces.length - 1] = Object.freeze({
        ...previous,
        contours: Object.freeze([...previous.contours, item.contour]),
      });
    } else {
      pieces.push(
        Object.freeze({
          pieceId: item.pieceId,
          sizeToken: item.sizeToken,
          contours: Object.freeze([item.contour]),
        }),
      );
    }
  }
  return success(
    Object.freeze({
      schemaVersion: DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1,
      sourceFileId: input.source.sourceFileId,
      pieces: Object.freeze(pieces),
      upstreamBlockerCount: input.source.upstreamBlockerCount,
      productionReady: false as const,
      heuristicRecoveryUsed: false as const,
      pieceSpecWireIntegrated: false as const,
      includesRawDxf: false as const,
      includesTags: false as const,
      includesAst: false as const,
    }),
  );
}
