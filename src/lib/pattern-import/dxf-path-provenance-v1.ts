import type { PtMm } from './types';

export const DXF_PATH_PROVENANCE_V1 = 'dxf-path-provenance/1' as const;
export const DXF_ORIENTED_SPAN_V1 = 'dxf-oriented-span/1' as const;
export const DXF_UNTOUCHED_CONTOUR_BETA_HANDOFF_V1 =
  'dxf-untouched-contour-beta-handoff/1' as const;
export const DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1 = 16_384 as const;

const SOURCE_CURVE_ID_PREFIX = 'dxf-curve-v1';
const VERTEX_ID_PREFIX = 'dxf-vertex-v1';
const MAX_SOURCE_FILE_ID_LENGTH = 160;
const MAX_INSTANCE_DEPTH = 64;
const MAX_INSTANCE_TOKEN_LENGTH = 512;
// DxfAssemblyHandoffV1 admits stable IDs up to 256 UTF-8 bytes. Keep curve IDs
// narrower so a vertex can retain the complete curve ID plus its sample suffix.
const MAX_HANDOFF_STABLE_ID_BYTES = 256;
const MAX_SOURCE_CURVE_ID_BYTES = 192;
const MAX_SAMPLE_COUNT = DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1;
const MAX_COORDINATE_ABS_MM = 1_000_000_000;
const MAX_NATIVE_PARAMETER_ABS = 1_000_000_000_000;
const MAX_SCALE = 1_000_000;
const HANDOFF_STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const INSTANCE_TOKEN =
  /^b\/(?:[0-9a-f]{2})+\/(?:h\/(?:[0-9a-f]{2})+|p\/(?:0|[1-9][0-9]*))\/o\/(?:0|[1-9][0-9]*)\/r\/(?:0|[1-9][0-9]*)\/c\/(?:0|[1-9][0-9]*)$/;
const SOURCE_CURVE_SUFFIX =
  /^e\/(?:h\/(?:[0-9a-f]{2})+|p\/(?:0|[1-9][0-9]*))\/s\/(?:0|[1-9][0-9]*)\/p\/(?:0|[1-9][0-9]*)$/;
const HEX_BYTES = /^(?:[0-9a-f]{2})+$/;
const textEncoder = new TextEncoder();

const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const OBJECT_IS_FROZEN = Object.isFrozen;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export type DxfCurveParameterSpaceV1 = 'unit' | 'angle-radians' | 'knot-domain';

export type DxfInsertInstanceStepV1 = Readonly<{
  blockName: string;
  insertHandle: string | null;
  insertOp: number;
  occurrenceIndex: number;
  mInsertRow: number;
  mInsertColumn: number;
}>;

export type DxfSourceCurveIdentityInputV1 = Readonly<{
  sourceFileId: string;
  instancePath: readonly string[];
  entityHandle: string | null;
  entityOp: number;
  sub: number;
  primitiveSegmentIndex: number;
}>;

export type DxfCurveSampleV1 = Readonly<{
  vertexId: string;
  sourceCurveId: string;
  parameterSpace: DxfCurveParameterSpaceV1;
  sourceCurveT: number;
}>;

export type DxfPathProvenanceV1 = Readonly<{
  schemaVersion: typeof DXF_PATH_PROVENANCE_V1;
  sourceFileId: string;
  instancePath: readonly string[];
  samples: readonly DxfCurveSampleV1[];
}>;

export type DxfProvenancePolylineV1 = Readonly<{
  pointsMm: readonly Readonly<PtMm>[];
  provenance: DxfPathProvenanceV1;
}>;

export type DxfOrientedSpanV1 = Readonly<{
  version: typeof DXF_ORIENTED_SPAN_V1;
  fromVertexId: string;
  toVertexId: string;
  direction: 'forward' | 'reverse';
}>;

export type DxfTopologyMutationV1 =
  'clean' | 'offset' | 'unfold' | 'mirror' | 'repair' | 'rul' | 'simplify';

export type DxfBetaHandoffBlockerV1 =
  | 'provenance-invalid'
  | 'sample-count-mismatch'
  | 'explicit-grain-missing'
  | 'clean-lineage-not-preserved'
  | 'offset-lineage-not-preserved'
  | 'unfold-lineage-not-preserved'
  | 'mirror-lineage-not-preserved'
  | 'repair-lineage-not-preserved'
  | 'rul-lineage-not-preserved'
  | 'simplify-lineage-not-preserved';

export type DxfProductionBlockerV1 =
  | 'post-save-pattern-piece-identity-not-integrated'
  | 'exact-seam-binding-not-integrated'
  | 'assembly-revision-not-integrated'
  | 'material-profile-revision-not-integrated'
  | 'trusted-corpus-authority-not-integrated';

export type DxfProvenanceFailureCodeV1 =
  'invalid-input' | 'sample-count-mismatch' | 'duplicate-identity' | 'sha256-unavailable';

export type DxfProvenanceResultV1<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      code: DxfProvenanceFailureCodeV1;
      errors: readonly string[];
    }>;

export type DxfUntouchedContourBetaHandoffV1 = Readonly<{
  version: typeof DXF_UNTOUCHED_CONTOUR_BETA_HANDOFF_V1;
  eligibleForBetaPrototype: boolean;
  productionReady: false;
  exactSampleAlignment: boolean;
  untouchedNativeContour: boolean;
  explicitGrain: boolean;
  heuristicRecoveryUsed: false;
  betaBlockers: readonly DxfBetaHandoffBlockerV1[];
  productionBlockers: readonly DxfProductionBlockerV1[];
}>;

export const DXF_PATH_PROVENANCE_TOPOLOGY_BLOCKERS_V1 = Object.freeze({
  clean: 'clean-lineage-not-preserved',
  offset: 'offset-lineage-not-preserved',
  unfold: 'unfold-lineage-not-preserved',
  mirror: 'mirror-lineage-not-preserved',
  repair: 'repair-lineage-not-preserved',
  rul: 'rul-lineage-not-preserved',
  simplify: 'simplify-lineage-not-preserved',
} as const satisfies Readonly<Record<DxfTopologyMutationV1, DxfBetaHandoffBlockerV1>>);

export const DXF_PATH_PROVENANCE_PRODUCTION_BLOCKERS_V1 = Object.freeze([
  'post-save-pattern-piece-identity-not-integrated',
  'exact-seam-binding-not-integrated',
  'assembly-revision-not-integrated',
  'material-profile-revision-not-integrated',
  'trusted-corpus-authority-not-integrated',
] as const satisfies readonly DxfProductionBlockerV1[]);

export const DXF_PATH_PROVENANCE_CANONICAL_DIGEST_CONTRACT_V1 = Object.freeze({
  algorithm: 'SHA-256',
  encoding: 'utf8-canonical-json',
  exactPropertyOrder: Object.freeze([
    'schemaVersion',
    'sourceFileId',
    'instancePath',
    'samples',
  ] as const),
  samplePropertyOrder: Object.freeze([
    'vertexId',
    'sourceCurveId',
    'parameterSpace',
    'sourceCurveT',
  ] as const),
  includesRawDxf: false,
  includesTags: false,
  includesAst: false,
  includesControlPoints: false,
  includesLayerHeuristics: false,
  productionReadyClaim: false,
} as const);

export const DXF_PATH_PROVENANCE_CONTRACT_V1 = Object.freeze({
  version: DXF_PATH_PROVENANCE_V1,
  alignment: 'samples.length === points.length',
  curveIdentity:
    'source-file + nested-insert-instance-path + handle-or-op + sub + primitive-segment-index',
  stableIdGrammar: '^[A-Za-z0-9][A-Za-z0-9._:/-]*$',
  handoffStableIdMaxUtf8Bytes: MAX_HANDOFF_STABLE_ID_BYTES,
  sourceCurveIdMaxUtf8Bytes: MAX_SOURCE_CURVE_ID_BYTES,
  handoffMaxVerticesPerContour: DXF_PATH_PROVENANCE_MAX_VERTICES_PER_CONTOUR_V1,
  oversizedLineagePolicy: 'fail-closed',
  allowedTransforms: Object.freeze(['positive-uniform-scale', 'reverse-with-identity-retention']),
  topologyChangingTransformsFailClosed: Object.freeze(
    Object.keys(DXF_PATH_PROVENANCE_TOPOLOGY_BLOCKERS_V1) as DxfTopologyMutationV1[],
  ),
  nearestGeometryInferenceAllowed: false,
  layerInferenceAllowed: false,
  productionReadyClaim: false,
} as const);

class DxfProvenanceFailure extends Error {
  constructor(
    readonly code: DxfProvenanceFailureCodeV1,
    message: string,
  ) {
    super(message);
  }
}

type ExactRecord = Readonly<Record<string, unknown>>;

function fail(code: DxfProvenanceFailureCodeV1, message: string): never {
  throw new DxfProvenanceFailure(code, message);
}

function failureResult(error: unknown): DxfProvenanceResultV1<never> {
  const code = error instanceof DxfProvenanceFailure ? error.code : 'invalid-input';
  const message =
    error instanceof DxfProvenanceFailure
      ? error.message
      : 'DXF provenance rejected inaccessible or hostile input.';
  return Object.freeze({ ok: false as const, code, errors: Object.freeze([message]) });
}

function success<T>(value: T): DxfProvenanceResultV1<T> {
  return Object.freeze({ ok: true as const, value });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  requireFrozen: boolean,
): ExactRecord {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    fail('invalid-input', `${label} must be an exact plain data record.`);
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
    fail('invalid-input', `${label} must be an exact plain data record.`);
  }
  if (prototype !== Object.prototype || (requireFrozen && !frozen))
    fail('invalid-input', `${label} must be an exact${requireFrozen ? ' frozen' : ''} record.`);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', `${label} contains missing, hidden, symbol, or unexpected fields.`);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${label}.${key} must be an enumerable data property.`);
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
  if (!Array.isArray(value)) fail('invalid-input', `${label} must be a dense array.`);
  let ownKeys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  let frozen: boolean;
  try {
    ownKeys = REFLECT_OWN_KEYS(value);
    descriptors = OBJECT_GET_OWN_PROPERTY_DESCRIPTORS(value) as unknown as PropertyDescriptorMap;
    frozen = OBJECT_IS_FROZEN(value);
  } catch {
    fail('invalid-input', `${label} must be a dense array.`);
  }
  if (requireFrozen && !frozen) fail('invalid-input', `${label} must be frozen.`);
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength
  )
    fail('invalid-input', `${label} length is invalid or exceeds ${maximumLength}.`);
  const length = lengthDescriptor.value as number;
  if (ownKeys.length !== length + 1)
    fail('invalid-input', `${label} must be dense and contain no hidden or symbol fields.`);
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
      fail('invalid-input', `${label}[${index}] must be an enumerable data element.`);
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function boundedString(value: unknown, label: string, maximumLength: number): string {
  const containsControlCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    });
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
    value.length > maximumLength ||
    value.trim() !== value ||
    containsControlCharacter ||
    !wellFormedUnicode
  )
    fail('invalid-input', `${label} must be a bounded non-empty canonical string.`);
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail('invalid-input', `${label} must be a non-negative safe integer.`);
  return value as number;
}

function finiteCoordinate(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_COORDINATE_ABS_MM
  )
    fail('invalid-input', `${label} must be a finite bounded millimetre coordinate.`);
  return Object.is(value, -0) ? 0 : value;
}

function parameterSpace(value: unknown, label: string): DxfCurveParameterSpaceV1 {
  if (value !== 'unit' && value !== 'angle-radians' && value !== 'knot-domain')
    fail('invalid-input', `${label} is not a supported native parameter space.`);
  return value;
}

function nativeParameter(value: unknown, space: DxfCurveParameterSpaceV1, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_NATIVE_PARAMETER_ABS ||
    (space === 'unit' && (value < 0 || value > 1))
  )
    fail('invalid-input', `${label} is outside its native parameter domain.`);
  return Object.is(value, -0) ? 0 : value;
}

function encodeIdentityComponent(value: string): string {
  return Array.from(textEncoder.encode(value), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function instancePathKey(instancePath: readonly string[]): string {
  return instancePath.length === 0 ? 'm' : `n/${instancePath.join('/x/')}`;
}

function sourceCurvePrefix(sourceFileId: string, instancePath: readonly string[]): string {
  return `${SOURCE_CURVE_ID_PREFIX}/f/${encodeIdentityComponent(sourceFileId)}/i/${instancePathKey(
    instancePath,
  )}/`;
}

function stableId(value: unknown, label: string, maximumBytes: number): string {
  const output = boundedString(value, label, maximumBytes);
  if (!HANDOFF_STABLE_ID.test(output) || textEncoder.encode(output).byteLength > maximumBytes)
    fail('invalid-input', `${label} must be a DxfAssemblyHandoffV1-compatible stable id.`);
  return output;
}

function safeIntegerToken(value: string): boolean {
  return Number.isSafeInteger(Number(value));
}

function canonicalInstanceToken(value: string): boolean {
  if (!INSTANCE_TOKEN.test(value)) return false;
  const segments = value.split('/');
  return (
    (segments[2] === 'h' || safeIntegerToken(segments[3])) &&
    safeIntegerToken(segments[5]) &&
    safeIntegerToken(segments[7]) &&
    safeIntegerToken(segments[9])
  );
}

function canonicalSourceCurveSuffix(value: string): boolean {
  if (!SOURCE_CURVE_SUFFIX.test(value)) return false;
  const segments = value.split('/');
  return (
    (segments[1] === 'h' || safeIntegerToken(segments[2])) &&
    safeIntegerToken(segments[4]) &&
    safeIntegerToken(segments[6])
  );
}

function canonicalSourceCurveId(value: unknown, label: string): string {
  const sourceCurveId = stableId(value, label, MAX_SOURCE_CURVE_ID_BYTES);
  const prefix = `${SOURCE_CURVE_ID_PREFIX}/f/`;
  const instanceMarker = '/i/';
  const entityMarker = '/e/';
  if (!sourceCurveId.startsWith(prefix))
    fail('invalid-input', `${label} is not a V1 DXF curve identity.`);
  const instanceAt = sourceCurveId.indexOf(instanceMarker, prefix.length);
  const entityAt = sourceCurveId.lastIndexOf(entityMarker);
  if (instanceAt < 0 || entityAt <= instanceAt + instanceMarker.length)
    fail('invalid-input', `${label} is not a canonical V1 DXF curve identity.`);
  const sourceFileHex = sourceCurveId.slice(prefix.length, instanceAt);
  const instanceKey = sourceCurveId.slice(instanceAt + instanceMarker.length, entityAt);
  const suffix = `e/${sourceCurveId.slice(entityAt + entityMarker.length)}`;
  const canonicalInstanceKey =
    instanceKey === 'm' ||
    (instanceKey.startsWith('n/') &&
      instanceKey
        .slice(2)
        .split('/x/')
        .every((token) => token.length > 0 && canonicalInstanceToken(token)));
  if (
    !HEX_BYTES.test(sourceFileHex) ||
    !canonicalInstanceKey ||
    !canonicalSourceCurveSuffix(suffix)
  )
    fail('invalid-input', `${label} is not a canonical V1 DXF curve identity.`);
  return sourceCurveId;
}

function canonicalVertexId(value: unknown, label: string, expectedSourceCurveId?: string): string {
  const vertexId = stableId(value, label, MAX_HANDOFF_STABLE_ID_BYTES);
  const prefix = `${VERTEX_ID_PREFIX}/`;
  const sampleMarker = '/sample/';
  const sampleAt = vertexId.lastIndexOf(sampleMarker);
  if (!vertexId.startsWith(prefix) || sampleAt <= prefix.length)
    fail('invalid-input', `${label} is not a V1 DXF vertex identity.`);
  const sourceCurveId = canonicalSourceCurveId(
    vertexId.slice(prefix.length, sampleAt),
    `${label}.sourceCurveId`,
  );
  if (expectedSourceCurveId !== undefined && sourceCurveId !== expectedSourceCurveId)
    fail('invalid-input', `${label} does not retain its exact source curve identity.`);
  const sampleIndex = vertexId.slice(sampleAt + sampleMarker.length);
  if (!/^(?:0|[1-9][0-9]*)$/.test(sampleIndex) || !safeIntegerToken(sampleIndex))
    fail('invalid-input', `${label} has an invalid sample suffix.`);
  return vertexId;
}

function snapshotInstancePath(
  value: unknown,
  requireFrozen: boolean,
  label = 'instancePath',
): readonly string[] {
  const raw = exactArray(value, label, MAX_INSTANCE_DEPTH, requireFrozen);
  return Object.freeze(
    raw.map((item, index) => {
      const token = boundedString(item, `${label}[${index}]`, MAX_INSTANCE_TOKEN_LENGTH);
      if (!canonicalInstanceToken(token))
        fail('invalid-input', `${label}[${index}] is not a canonical INSERT instance token.`);
      return token;
    }),
  );
}

function snapshotSample(value: unknown, requireFrozen: boolean, label: string): DxfCurveSampleV1 {
  const record = exactRecord(
    value,
    ['vertexId', 'sourceCurveId', 'parameterSpace', 'sourceCurveT'],
    label,
    requireFrozen,
  );
  const sourceCurveId = canonicalSourceCurveId(record.sourceCurveId, `${label}.sourceCurveId`);
  const vertexId = canonicalVertexId(record.vertexId, `${label}.vertexId`, sourceCurveId);
  const space = parameterSpace(record.parameterSpace, `${label}.parameterSpace`);
  return Object.freeze({
    vertexId,
    sourceCurveId,
    parameterSpace: space,
    sourceCurveT: nativeParameter(record.sourceCurveT, space, `${label}.sourceCurveT`),
  });
}

function snapshotProvenance(
  value: unknown,
  requireFrozen: boolean,
  expectedPointCount?: number,
): DxfPathProvenanceV1 {
  const record = exactRecord(
    value,
    ['schemaVersion', 'sourceFileId', 'instancePath', 'samples'],
    'provenance',
    requireFrozen,
  );
  if (record.schemaVersion !== DXF_PATH_PROVENANCE_V1)
    fail('invalid-input', 'provenance.schemaVersion is unsupported.');
  const sourceFileId = boundedString(
    record.sourceFileId,
    'provenance.sourceFileId',
    MAX_SOURCE_FILE_ID_LENGTH,
  );
  const instancePath = snapshotInstancePath(
    record.instancePath,
    requireFrozen,
    'provenance.instancePath',
  );
  const rawSamples = exactArray(
    record.samples,
    'provenance.samples',
    MAX_SAMPLE_COUNT,
    requireFrozen,
  );
  if (expectedPointCount !== undefined && rawSamples.length !== expectedPointCount)
    fail(
      'sample-count-mismatch',
      `provenance.samples length ${rawSamples.length} does not match ${expectedPointCount} points.`,
    );
  const prefix = sourceCurvePrefix(sourceFileId, instancePath);
  const vertexIds = new Set<string>();
  const sampleIdentities = new Set<string>();
  const samples = rawSamples.map((sample, index) => {
    const snapshot = snapshotSample(sample, requireFrozen, `provenance.samples[${index}]`);
    if (!snapshot.sourceCurveId.startsWith(prefix))
      fail('invalid-input', `provenance.samples[${index}] crosses file or INSERT lineage.`);
    if (!canonicalSourceCurveSuffix(snapshot.sourceCurveId.slice(prefix.length)))
      fail('invalid-input', `provenance.samples[${index}] has a non-canonical curve identity.`);
    if (vertexIds.has(snapshot.vertexId))
      fail('duplicate-identity', `provenance.samples[${index}] repeats a vertex identity.`);
    vertexIds.add(snapshot.vertexId);
    const identity = `${snapshot.sourceCurveId}\u0000${snapshot.parameterSpace}\u0000${snapshot.sourceCurveT}`;
    if (sampleIdentities.has(identity))
      fail(
        'duplicate-identity',
        `provenance.samples[${index}] repeats a curve parameter identity.`,
      );
    sampleIdentities.add(identity);
    return snapshot;
  });
  return Object.freeze({
    schemaVersion: DXF_PATH_PROVENANCE_V1,
    sourceFileId,
    instancePath,
    samples: Object.freeze(samples),
  });
}

function snapshotPoints(value: unknown, requireFrozen: boolean): readonly Readonly<PtMm>[] {
  const raw = exactArray(value, 'pointsMm', MAX_SAMPLE_COUNT, requireFrozen);
  return Object.freeze(
    raw.map((point, index) => {
      const record = exactRecord(point, ['x', 'y'], `pointsMm[${index}]`, requireFrozen);
      return Object.freeze({
        x: finiteCoordinate(record.x, `pointsMm[${index}].x`),
        y: finiteCoordinate(record.y, `pointsMm[${index}].y`),
      });
    }),
  );
}

function snapshotPolyline(value: unknown, requireFrozen: boolean): DxfProvenancePolylineV1 {
  const record = exactRecord(value, ['pointsMm', 'provenance'], 'polyline', requireFrozen);
  const pointsMm = snapshotPoints(record.pointsMm, requireFrozen);
  const provenance = snapshotProvenance(record.provenance, requireFrozen, pointsMm.length);
  return Object.freeze({ pointsMm, provenance });
}

export function createDxfInsertInstancePathV1(
  stepsInput: unknown,
): DxfProvenanceResultV1<readonly string[]> {
  try {
    const steps = exactArray(stepsInput, 'insertSteps', MAX_INSTANCE_DEPTH, false);
    const tokens = steps.map((step, index) => {
      const record = exactRecord(
        step,
        ['blockName', 'insertHandle', 'insertOp', 'occurrenceIndex', 'mInsertRow', 'mInsertColumn'],
        `insertSteps[${index}]`,
        false,
      );
      const blockName = boundedString(record.blockName, `insertSteps[${index}].blockName`, 160);
      const insertHandle =
        record.insertHandle === null
          ? null
          : boundedString(record.insertHandle, `insertSteps[${index}].insertHandle`, 160);
      const insertOp = nonnegativeInteger(record.insertOp, `insertSteps[${index}].insertOp`);
      const occurrenceIndex = nonnegativeInteger(
        record.occurrenceIndex,
        `insertSteps[${index}].occurrenceIndex`,
      );
      const row = nonnegativeInteger(record.mInsertRow, `insertSteps[${index}].mInsertRow`);
      const column = nonnegativeInteger(
        record.mInsertColumn,
        `insertSteps[${index}].mInsertColumn`,
      );
      const insertIdentity =
        insertHandle === null ? `p/${insertOp}` : `h/${encodeIdentityComponent(insertHandle)}`;
      return `b/${encodeIdentityComponent(
        blockName,
      )}/${insertIdentity}/o/${occurrenceIndex}/r/${row}/c/${column}`;
    });
    return success(Object.freeze(tokens));
  } catch (error) {
    return failureResult(error);
  }
}

export function createDxfSourceCurveIdV1(input: unknown): DxfProvenanceResultV1<string> {
  try {
    const record = exactRecord(
      input,
      ['sourceFileId', 'instancePath', 'entityHandle', 'entityOp', 'sub', 'primitiveSegmentIndex'],
      'sourceCurveIdentity',
      false,
    );
    const sourceFileId = boundedString(
      record.sourceFileId,
      'sourceCurveIdentity.sourceFileId',
      MAX_SOURCE_FILE_ID_LENGTH,
    );
    const instancePath = snapshotInstancePath(record.instancePath, false);
    const entityHandle =
      record.entityHandle === null
        ? null
        : boundedString(record.entityHandle, 'sourceCurveIdentity.entityHandle', 160);
    const entityOp = nonnegativeInteger(record.entityOp, 'sourceCurveIdentity.entityOp');
    const sub = nonnegativeInteger(record.sub, 'sourceCurveIdentity.sub');
    const primitiveSegmentIndex = nonnegativeInteger(
      record.primitiveSegmentIndex,
      'sourceCurveIdentity.primitiveSegmentIndex',
    );
    const entityIdentity =
      entityHandle === null ? `p/${entityOp}` : `h/${encodeIdentityComponent(entityHandle)}`;
    const sourceCurveId = `${sourceCurvePrefix(
      sourceFileId,
      instancePath,
    )}e/${entityIdentity}/s/${sub}/p/${primitiveSegmentIndex}`;
    canonicalSourceCurveId(sourceCurveId, 'sourceCurveIdentity.generatedId');
    return success(sourceCurveId);
  } catch (error) {
    return failureResult(error);
  }
}

export function createDxfCurveSampleV1(
  sourceCurveIdInput: unknown,
  sampleIndexInput: unknown,
  parameterSpaceInput: unknown,
  sourceCurveTInput: unknown,
): DxfProvenanceResultV1<DxfCurveSampleV1> {
  try {
    const sourceCurveId = canonicalSourceCurveId(sourceCurveIdInput, 'sourceCurveId');
    const sampleIndex = nonnegativeInteger(sampleIndexInput, 'sampleIndex');
    const space = parameterSpace(parameterSpaceInput, 'parameterSpace');
    const sourceCurveT = nativeParameter(sourceCurveTInput, space, 'sourceCurveT');
    const vertexId = `${VERTEX_ID_PREFIX}/${sourceCurveId}/sample/${sampleIndex}`;
    canonicalVertexId(vertexId, 'generated vertexId', sourceCurveId);
    return success(
      Object.freeze({
        vertexId,
        sourceCurveId,
        parameterSpace: space,
        sourceCurveT,
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

export function createDxfPathProvenanceV1(
  input: unknown,
): DxfProvenanceResultV1<DxfPathProvenanceV1> {
  try {
    const record = exactRecord(
      input,
      ['sourceFileId', 'instancePath', 'samples', 'expectedPointCount'],
      'pathProvenanceInput',
      false,
    );
    const expectedPointCount = nonnegativeInteger(
      record.expectedPointCount,
      'pathProvenanceInput.expectedPointCount',
    );
    const candidate = {
      schemaVersion: DXF_PATH_PROVENANCE_V1,
      sourceFileId: record.sourceFileId,
      instancePath: record.instancePath,
      samples: record.samples,
    };
    return success(snapshotProvenance(candidate, false, expectedPointCount));
  } catch (error) {
    return failureResult(error);
  }
}

export function validateDxfPathProvenanceV1(
  input: unknown,
  expectedPointCount: number,
): DxfProvenanceResultV1<DxfPathProvenanceV1> {
  try {
    return success(
      snapshotProvenance(input, true, nonnegativeInteger(expectedPointCount, 'expectedPointCount')),
    );
  } catch (error) {
    return failureResult(error);
  }
}

export function bindDxfPathProvenanceV1(
  pointsInput: unknown,
  provenanceInput: unknown,
): DxfProvenanceResultV1<DxfProvenancePolylineV1> {
  try {
    const pointsMm = snapshotPoints(pointsInput, false);
    const provenance = snapshotProvenance(provenanceInput, true, pointsMm.length);
    return success(Object.freeze({ pointsMm, provenance }));
  } catch (error) {
    return failureResult(error);
  }
}

export function scaleDxfProvenancePolylineV1(
  polylineInput: unknown,
  scaleInput: unknown,
): DxfProvenanceResultV1<DxfProvenancePolylineV1> {
  try {
    const polyline = snapshotPolyline(polylineInput, true);
    if (
      typeof scaleInput !== 'number' ||
      !Number.isFinite(scaleInput) ||
      scaleInput <= 0 ||
      scaleInput > MAX_SCALE
    )
      fail('invalid-input', 'scale must be finite, positive, and bounded.');
    const pointsMm = Object.freeze(
      polyline.pointsMm.map((point, index) =>
        Object.freeze({
          x: finiteCoordinate(point.x * scaleInput, `scaled.pointsMm[${index}].x`),
          y: finiteCoordinate(point.y * scaleInput, `scaled.pointsMm[${index}].y`),
        }),
      ),
    );
    return success(Object.freeze({ pointsMm, provenance: polyline.provenance }));
  } catch (error) {
    return failureResult(error);
  }
}

export function reverseDxfProvenancePolylineV1(
  polylineInput: unknown,
): DxfProvenanceResultV1<DxfProvenancePolylineV1> {
  try {
    const polyline = snapshotPolyline(polylineInput, true);
    const provenance = Object.freeze({
      schemaVersion: DXF_PATH_PROVENANCE_V1,
      sourceFileId: polyline.provenance.sourceFileId,
      instancePath: polyline.provenance.instancePath,
      samples: Object.freeze([...polyline.provenance.samples].reverse()),
    });
    return success(
      Object.freeze({
        pointsMm: Object.freeze([...polyline.pointsMm].reverse()),
        provenance,
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

export function createDxfOrientedSpanV1(
  provenanceInput: unknown,
  fromSampleIndexInput: unknown,
  toSampleIndexInput: unknown,
): DxfProvenanceResultV1<DxfOrientedSpanV1> {
  try {
    const provenance = snapshotProvenance(provenanceInput, true);
    const from = nonnegativeInteger(fromSampleIndexInput, 'fromSampleIndex');
    const to = nonnegativeInteger(toSampleIndexInput, 'toSampleIndex');
    if (from >= provenance.samples.length || to >= provenance.samples.length || from === to)
      fail('invalid-input', 'oriented span sample indices are invalid.');
    return success(
      Object.freeze({
        version: DXF_ORIENTED_SPAN_V1,
        fromVertexId: provenance.samples[from].vertexId,
        toVertexId: provenance.samples[to].vertexId,
        direction: from < to ? ('forward' as const) : ('reverse' as const),
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

export function reverseDxfOrientedSpanV1(
  spanInput: unknown,
): DxfProvenanceResultV1<DxfOrientedSpanV1> {
  try {
    const record = exactRecord(
      spanInput,
      ['version', 'fromVertexId', 'toVertexId', 'direction'],
      'span',
      true,
    );
    if (
      record.version !== DXF_ORIENTED_SPAN_V1 ||
      (record.direction !== 'forward' && record.direction !== 'reverse')
    )
      fail('invalid-input', 'span version or direction is invalid.');
    const fromVertexId = canonicalVertexId(record.fromVertexId, 'span.fromVertexId');
    const toVertexId = canonicalVertexId(record.toVertexId, 'span.toVertexId');
    if (fromVertexId === toVertexId)
      fail('invalid-input', 'span endpoints must be distinct V1 vertex identities.');
    return success(
      Object.freeze({
        version: DXF_ORIENTED_SPAN_V1,
        fromVertexId: toVertexId,
        toVertexId: fromVertexId,
        direction: record.direction === 'forward' ? ('reverse' as const) : ('forward' as const),
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

function canonicalInput(provenance: DxfPathProvenanceV1): DxfPathProvenanceV1 {
  return Object.freeze({
    schemaVersion: DXF_PATH_PROVENANCE_V1,
    sourceFileId: provenance.sourceFileId,
    instancePath: Object.freeze([...provenance.instancePath]),
    samples: Object.freeze(
      provenance.samples.map((sample) =>
        Object.freeze({
          vertexId: sample.vertexId,
          sourceCurveId: sample.sourceCurveId,
          parameterSpace: sample.parameterSpace,
          sourceCurveT: sample.sourceCurveT,
        }),
      ),
    ),
  });
}

export function canonicalDxfPathProvenanceInputV1(
  provenanceInput: unknown,
): DxfProvenanceResultV1<DxfPathProvenanceV1> {
  try {
    return success(canonicalInput(snapshotProvenance(provenanceInput, true)));
  } catch (error) {
    return failureResult(error);
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function digestDxfPathProvenanceV1(
  provenanceInput: unknown,
  cryptoInput: Pick<Crypto, 'subtle'> | null | undefined = globalThis.crypto,
): Promise<
  DxfProvenanceResultV1<
    Readonly<{
      algorithm: 'SHA-256';
      canonicalByteLength: number;
      canonicalSha256: string;
      includesRawDxf: false;
      productionReadyClaim: false;
    }>
  >
> {
  try {
    const provenance = canonicalInput(snapshotProvenance(provenanceInput, true));
    if (!cryptoInput?.subtle) fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable.');
    const bytes = new TextEncoder().encode(JSON.stringify(provenance));
    let digest: ArrayBuffer;
    try {
      digest = await cryptoInput.subtle.digest('SHA-256', bytes);
    } catch {
      fail('sha256-unavailable', 'Web Crypto SHA-256 failed.');
    }
    const digestBytes = new Uint8Array(digest);
    if (digestBytes.byteLength !== 32)
      fail('sha256-unavailable', 'Web Crypto SHA-256 returned an invalid digest length.');
    return success(
      Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalByteLength: bytes.byteLength,
        canonicalSha256: hex(digestBytes),
        includesRawDxf: false as const,
        productionReadyClaim: false as const,
      }),
    );
  } catch (error) {
    return failureResult(error);
  }
}

function topologyMutations(value: unknown): readonly DxfTopologyMutationV1[] {
  const raw = exactArray(value, 'topologyMutations', 7, false);
  const allowed = new Set<DxfTopologyMutationV1>([
    'clean',
    'offset',
    'unfold',
    'mirror',
    'repair',
    'rul',
    'simplify',
  ]);
  const seen = new Set<DxfTopologyMutationV1>();
  const output: DxfTopologyMutationV1[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !allowed.has(item as DxfTopologyMutationV1))
      fail('invalid-input', 'topologyMutations contains an unknown transformation.');
    const mutation = item as DxfTopologyMutationV1;
    if (!seen.has(mutation)) output.push(mutation);
    seen.add(mutation);
  }
  return Object.freeze(output);
}

export function evaluateDxfUntouchedContourBetaHandoffV1(
  input: unknown,
): DxfUntouchedContourBetaHandoffV1 {
  const betaBlockers: DxfBetaHandoffBlockerV1[] = [];
  let exactSampleAlignment = false;
  let explicitGrain = false;
  let mutations: readonly DxfTopologyMutationV1[] = Object.freeze([]);
  try {
    const record = exactRecord(
      input,
      ['polyline', 'topologyMutations', 'explicitGrain'],
      'betaHandoffInput',
      false,
    );
    if (typeof record.explicitGrain !== 'boolean')
      fail('invalid-input', 'betaHandoffInput.explicitGrain must be boolean.');
    explicitGrain = record.explicitGrain;
    mutations = topologyMutations(record.topologyMutations);
    snapshotPolyline(record.polyline, true);
    exactSampleAlignment = true;
  } catch (error) {
    if (error instanceof DxfProvenanceFailure && error.code === 'sample-count-mismatch')
      betaBlockers.push('sample-count-mismatch');
    else betaBlockers.push('provenance-invalid');
  }
  if (!explicitGrain) betaBlockers.push('explicit-grain-missing');
  for (const mutation of mutations)
    betaBlockers.push(DXF_PATH_PROVENANCE_TOPOLOGY_BLOCKERS_V1[mutation]);
  const frozenBetaBlockers = Object.freeze([...new Set(betaBlockers)]);
  return Object.freeze({
    version: DXF_UNTOUCHED_CONTOUR_BETA_HANDOFF_V1,
    eligibleForBetaPrototype: frozenBetaBlockers.length === 0,
    productionReady: false as const,
    exactSampleAlignment,
    untouchedNativeContour: mutations.length === 0,
    explicitGrain,
    heuristicRecoveryUsed: false as const,
    betaBlockers: frozenBetaBlockers,
    productionBlockers: DXF_PATH_PROVENANCE_PRODUCTION_BLOCKERS_V1,
  });
}
