import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  buildPatternImportDxfTwoSidedSeamMappingV2,
  type PatternImportDxfTwoSidedSeamMappingInputV2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';

export const PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_REQUEST_V1 =
  'pattern-import-dxf-two-seam-mapping-aggregate-request/1' as const;
export const PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1 =
  'pattern-import-dxf-two-seam-mapping-aggregate/1' as const;
export const PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1 =
  'pattern-import-dxf-two-seam-mapping-aggregate-seal/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_CANONICAL_BYTES = 8 * 1024 * 1024;
const MAX_DETAIL_BYTES = 1_024;
const textEncoder = new TextEncoder();

export type PatternImportDxfTwoSeamMappingAggregateOperationV1 = Readonly<{
  id: string;
  sourceOperationNumber: number;
  stage: number;
  order: 0;
  kind: 'stitch';
  pieceIds: readonly [string, string];
  seamIds: readonly [string, string];
}>;

export type PatternImportDxfTwoSeamMappingAggregateRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_REQUEST_V1;
  operation: PatternImportDxfTwoSeamMappingAggregateOperationV1;
  mappings: readonly [
    PatternImportDxfTwoSidedSeamMappingInputV2,
    PatternImportDxfTwoSidedSeamMappingInputV2,
  ];
}>;

export type PatternImportDxfTwoSeamMappingAggregateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1;
  childMappingVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
  sourceBinding: Omit<
    PatternImportDxfTwoSidedSeamMappingV2['sourceBinding'],
    'handoffCanonicalSha256'
  >;
  scope: Readonly<{ scopeId: string; pieceIds: readonly [string, string] }>;
  operation: Readonly<{
    id: string;
    sourceOperationNumber: number;
    stage: number;
    order: 0;
    kind: 'stitch';
    seamIds: readonly [string, string];
  }>;
  seams: readonly [
    PatternImportDxfTwoSidedSeamMappingV2['seam'],
    PatternImportDxfTwoSidedSeamMappingV2['seam'],
  ];
  childSeals: readonly [
    Readonly<{
      seamId: string;
      mappingCanonicalSha256: string;
      handoffCanonicalSha256: string;
    }>,
    Readonly<{
      seamId: string;
      mappingCanonicalSha256: string;
      handoffCanonicalSha256: string;
    }>,
  ];
}>;

export type PatternImportDxfTwoSeamMappingAggregateSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  sealedAggregateVersion: typeof PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1;
  childMappingVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
  authority: 'unsigned-in-memory-consistency-only';
  atomicTwoSeamAuthority: true;
  writerExportShaBound: false;
  trustedAuthorityIntegrated: false;
  productionReady: false;
}>;

export type PatternImportDxfTwoSeamMappingAggregateBlockerV1 = Readonly<{
  code:
    | 'reentrant-call'
    | 'invalid-input'
    | 'child-mapping-blocked'
    | 'aggregate-operation-mismatch'
    | 'aggregate-piece-set-mismatch'
    | 'aggregate-source-binding-mismatch'
    | 'aggregate-seam-coverage-mismatch'
    | 'aggregate-seam-overlap'
    | 'aggregate-seam-invalid'
    | 'sha256-unavailable';
  field: string;
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_CLAIMS_V1 = Object.freeze({
  childAuthority: 'two fresh production V2 mappings',
  exactlyTwoPiecesRequired: true,
  exactlyTwoEqualSeamsRequired: true,
  exactlyOneLocalStitchOperationRequired: true,
  exactOperationStageBound: true,
  distinctPhysicalBoundaryEdgesRequired: true,
  sourceOperationNumberUsedAsLocalOrder: false,
  emittedLocalOperationOrder: 0,
  partialAuthorityPublished: false,
  childMappingsProduced: true,
  aggregateSealProduced: true,
  nearestGeometryRecoveryUsed: false,
  writerExportShaBound: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  childAuthority: 'two fresh production V2 mappings' as const,
  exactlyTwoPiecesRequired: true as const,
  exactlyTwoEqualSeamsRequired: true as const,
  exactlyOneLocalStitchOperationRequired: true as const,
  exactOperationStageBound: true as const,
  distinctPhysicalBoundaryEdgesRequired: true as const,
  sourceOperationNumberUsedAsLocalOrder: false as const,
  emittedLocalOperationOrder: 0 as const,
  partialAuthorityPublished: false as const,
  childMappingsProduced: false as const,
  aggregateSealProduced: false as const,
  nearestGeometryRecoveryUsed: false as const,
  writerExportShaBound: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export type PatternImportDxfTwoSeamMappingAggregateResultV1 =
  | Readonly<{
      ok: true;
      aggregate: PatternImportDxfTwoSeamMappingAggregateV1;
      seal: PatternImportDxfTwoSeamMappingAggregateSealV1;
      childMappings: readonly [
        PatternImportDxfTwoSidedSeamMappingV2,
        PatternImportDxfTwoSidedSeamMappingV2,
      ];
      childSeals: readonly [
        PatternImportDxfTwoSidedSeamMappingSealV2,
        PatternImportDxfTwoSidedSeamMappingSealV2,
      ];
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      aggregate: null;
      seal: null;
      childMappings: null;
      childSeals: null;
      blockers: readonly [PatternImportDxfTwoSeamMappingAggregateBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export const PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_CONTRACT_V1 = Object.freeze({
  betaBound: 'exactly two pieces + two equal seams + one stitch operation',
  childMapper: 'buildPatternImportDxfTwoSidedSeamMappingV2',
  callerSuppliedChildMappingAccepted: false,
  childMappingOrderAuthority: false,
  stableSeamIdCanonicalOrder: true,
  canonicalOrderUsesCodeUnits: true,
  distinctPhysicalBoundaryEdgesRequired: true,
  sourceOperationNumberPolicy: 'selection evidence only',
  localOperationOrder: 0,
  exactOperationStageBound: true,
  partialSuccessPolicy: 'block whole aggregate and publish no child authority',
  nearestGeometryRecoveryAllowed: false,
  arbitraryGarmentSupport: false,
  reloadPersistenceIntegrated: false,
  productionReady: false,
} as const);

class AggregateFailure extends Error {
  constructor(
    readonly code: PatternImportDxfTwoSeamMappingAggregateBlockerV1['code'],
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfTwoSeamMappingAggregateBlockerV1['code'],
  field: string,
  detail: string,
): never {
  throw new AggregateFailure(code, field, detail);
}

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      deepFreeze(descriptor.value, seen);
  return Object.freeze(value);
}

function blocked(error: unknown): PatternImportDxfTwoSeamMappingAggregateResultV1 {
  const known = error instanceof AggregateFailure;
  return deepFreeze({
    ok: false as const,
    aggregate: null,
    seal: null,
    childMappings: null,
    childSeals: null,
    blockers: [
      {
        code: known ? error.code : ('invalid-input' as const),
        field: bounded(known ? error.field : 'input'),
        detail: bounded(
          known
            ? error.message
            : 'Two-seam aggregate rejected inaccessible, hostile, or inconsistent input.',
        ),
      },
    ] as const,
    claims: BLOCKED_CLAIMS,
  });
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', field, 'must be an exact plain data record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', field, 'reflection failed.');
  }
  if (prototype !== Object.prototype) fail('invalid-input', field, 'must use Object.prototype.');
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', field, 'contains missing, hidden, symbol, or unexpected fields.');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${field}.${key}`, 'must be an enumerable data property.');
    result[key] = descriptor.value;
  }
  return result;
}

function exactPair(value: unknown, field: string): readonly [unknown, unknown] {
  if (!Array.isArray(value)) fail('invalid-input', field, 'must be an exact two-item array.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const first = descriptors['0'];
  const second = descriptors['1'];
  if (
    value.length !== 2 ||
    keys.length !== 3 ||
    !keys.includes('0') ||
    !keys.includes('1') ||
    !keys.includes('length') ||
    !first?.enumerable ||
    !second?.enumerable ||
    !Object.prototype.hasOwnProperty.call(first, 'value') ||
    !Object.prototype.hasOwnProperty.call(second, 'value') ||
    first.get !== undefined ||
    second.get !== undefined
  )
    fail('invalid-input', field, 'must be dense and contain exactly two data items.');
  return [first.value, second.value] as const;
}

function exactSingle(value: unknown, field: string): unknown {
  if (!Array.isArray(value)) fail('invalid-input', field, 'must be an exact one-item array.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const first = descriptors['0'];
  if (
    value.length !== 1 ||
    keys.length !== 2 ||
    !keys.includes('0') ||
    !keys.includes('length') ||
    !first?.enumerable ||
    !Object.prototype.hasOwnProperty.call(first, 'value') ||
    first.get !== undefined ||
    first.set !== undefined
  )
    fail('invalid-input', field, 'must be dense and contain exactly one data item.');
  return first.value;
}

function stableId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 256 || !STABLE_ID.test(value))
    fail('invalid-input', field, 'must be a stable identifier.');
  return value;
}

function sortedPair(value: unknown, field: string): readonly [string, string] {
  const pair = exactPair(value, field).map((item, index) => stableId(item, `${field}[${index}]`));
  if (pair[0] === pair[1]) fail('invalid-input', field, 'must contain two distinct identifiers.');
  pair.sort();
  return pair as [string, string];
}

function samePair(left: readonly string[], right: readonly string[]): boolean {
  return left.length === 2 && right.length === 2 && left[0] === right[0] && left[1] === right[1];
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sourceBindingKey(value: PatternImportDxfTwoSidedSeamMappingV2['sourceBinding']): string {
  return canonical({
    sourceFileId: value.sourceFileId,
    documentId: value.documentId,
    revision: value.revision,
    baseFinalCoordinateSha256: value.baseFinalCoordinateSha256,
    sourcePathCoordinateSha256: value.sourcePathCoordinateSha256,
    handoffCanonicalSha256: value.handoffCanonicalSha256,
  });
}

function validateChild(
  mapping: PatternImportDxfTwoSidedSeamMappingV2,
  operationId: string,
  pieceIds: readonly [string, string],
  seamIds: readonly [string, string],
): void {
  if (
    mapping.seam.operationId !== operationId ||
    mapping.seam.mapping !== 'equal' ||
    mapping.seam.lengthRatio !== 1
  )
    fail(
      'aggregate-operation-mismatch',
      `mappings.${mapping.seam.id}.operationId`,
      'each child must belong to the sole equal-mapping stitch operation.',
    );
  if (!seamIds.includes(mapping.seam.id))
    fail(
      'aggregate-seam-coverage-mismatch',
      `mappings.${mapping.seam.id}`,
      'child seam is not one of the two operation seam IDs.',
    );
  const scopePieces = [...mapping.scope.pieceIds].sort();
  const seamPieces = mapping.seam.sides.map(({ pieceId }) => pieceId).sort();
  if (!samePair(scopePieces, pieceIds) || !samePair(seamPieces, pieceIds))
    fail(
      'aggregate-piece-set-mismatch',
      `mappings.${mapping.seam.id}.pieces`,
      'both child sides and the scope must cover the same exact two pieces.',
    );
  if (
    mapping.seam.sides.some((side) => {
      const samples = side.orderedSamples;
      if (samples.length < 2 || side.lengthMm <= 0 || side.endpointResidualMm < 0) return true;
      const endpoints = [samples[0]!.vertexId, samples[samples.length - 1]!.vertexId].sort();
      return !samePair(endpoints, [...side.authoredAnchors].sort());
    }) ||
    !mapping.compatibility.endpointsCompatible ||
    !mapping.compatibility.fullLengthsCompatible
  )
    fail(
      'aggregate-seam-invalid',
      `mappings.${mapping.seam.id}`,
      'each child must retain exact authored endpoints and complete equal-length compatibility.',
    );
}

function physicalBoundaryEdges(
  side: PatternImportDxfTwoSidedSeamMappingV2['seam']['sides'][number],
): ReadonlySet<string> {
  const edges = new Set<string>();
  for (let index = 1; index < side.orderedSamples.length; index += 1) {
    const vertices = [
      side.orderedSamples[index - 1]!.vertexId,
      side.orderedSamples[index]!.vertexId,
    ].sort();
    edges.add(`${side.pieceId}\u0000${side.contourId}\u0000${vertices[0]}\u0000${vertices[1]}`);
  }
  return edges;
}

function childOperationStage(value: unknown, operationId: string, field: string): number {
  const input = exactDataRecord(value, ['schemaVersion', 'base', 'phaseD'], field);
  const base = exactDataRecord(
    input.base,
    ['schemaVersion', 'composition', 'expected', 'scopes', 'seamId', 'tolerance'],
    `${field}.base`,
  );
  const composition = exactDataRecord(
    base.composition,
    [
      'schemaVersion',
      'sourceFileId',
      'pipeline',
      'manifest',
      'pieces',
      'binding',
      'physicalSurface',
      'seams',
      'operations',
      'materials',
    ],
    `${field}.base.composition`,
  );
  const operation = exactDataRecord(
    exactSingle(composition.operations, `${field}.base.composition.operations`),
    ['id', 'stage', 'order', 'kind', 'seamIds'],
    `${field}.base.composition.operations[0]`,
  );
  if (
    operation.id !== operationId ||
    operation.order !== 0 ||
    operation.kind !== 'stitch' ||
    !Number.isSafeInteger(operation.stage) ||
    Number(operation.stage) < 0
  )
    fail(
      'aggregate-operation-mismatch',
      `${field}.base.composition.operations[0]`,
      'each child handoff must expose the same sole non-negative local stitch operation.',
    );
  return Number(operation.stage);
}

let claimed = false;

export async function buildPatternImportDxfTwoSeamMappingAggregateV1(
  inputValue: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfTwoSeamMappingAggregateResultV1> {
  if (claimed)
    return blocked(new AggregateFailure('reentrant-call', 'input', 'reentrant aggregate refused.'));
  claimed = true;
  try {
    const input = exactDataRecord(inputValue, ['schemaVersion', 'operation', 'mappings'], 'input');
    if (input.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_REQUEST_V1)
      fail('invalid-input', 'input.schemaVersion', 'schema version is unsupported.');
    const operation = exactDataRecord(
      input.operation,
      ['id', 'sourceOperationNumber', 'stage', 'order', 'kind', 'pieceIds', 'seamIds'],
      'input.operation',
    );
    const operationId = stableId(operation.id, 'input.operation.id');
    if (
      !Number.isSafeInteger(operation.sourceOperationNumber) ||
      Number(operation.sourceOperationNumber) <= 0
    )
      fail(
        'invalid-input',
        'input.operation.sourceOperationNumber',
        'must be positive selection evidence.',
      );
    if (!Number.isSafeInteger(operation.stage) || Number(operation.stage) < 0)
      fail(
        'aggregate-operation-mismatch',
        'input.operation.stage',
        'the sole emitted operation stage must be a non-negative safe integer.',
      );
    const operationStage = Number(operation.stage);
    if (operation.order !== 0 || operation.kind !== 'stitch')
      fail(
        'aggregate-operation-mismatch',
        'input.operation',
        'the sole emitted operation must be local order 0 and authoritative stitch kind.',
      );
    const pieceIds = sortedPair(operation.pieceIds, 'input.operation.pieceIds');
    const seamIds = sortedPair(operation.seamIds, 'input.operation.seamIds');
    const childInputs = exactPair(input.mappings, 'input.mappings');

    const childResults: Extract<
      Awaited<ReturnType<typeof buildPatternImportDxfTwoSidedSeamMappingV2>>,
      { ok: true }
    >[] = [];
    for (let index = 0; index < childInputs.length; index += 1) {
      if (
        childOperationStage(childInputs[index], operationId, `input.mappings[${index}]`) !==
        operationStage
      )
        fail(
          'aggregate-operation-mismatch',
          `input.mappings[${index}].base.composition.operations[0].stage`,
          'each child handoff operation stage must exactly match the aggregate operation stage.',
        );
      const child = await buildPatternImportDxfTwoSidedSeamMappingV2(childInputs[index], crypto);
      if (!child.ok)
        fail(
          'child-mapping-blocked',
          `input.mappings[${index}]`,
          child.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
        );
      childResults.push(child);
    }
    const first = childResults[0]!;
    const second = childResults[1]!;
    if (first.mapping.seam.id === second.mapping.seam.id)
      fail(
        'aggregate-seam-coverage-mismatch',
        'input.mappings',
        'the two child mappings must resolve two distinct seams.',
      );
    validateChild(first.mapping, operationId, pieceIds, seamIds);
    validateChild(second.mapping, operationId, pieceIds, seamIds);
    for (const pieceId of pieceIds) {
      const firstSide = first.mapping.seam.sides.find((side) => side.pieceId === pieceId);
      const secondSide = second.mapping.seam.sides.find((side) => side.pieceId === pieceId);
      if (!firstSide || !secondSide)
        fail(
          'aggregate-piece-set-mismatch',
          'input.mappings',
          `both child mappings must expose piece ${pieceId}.`,
        );
      const firstEdges = physicalBoundaryEdges(firstSide);
      if ([...physicalBoundaryEdges(secondSide)].some((edge) => firstEdges.has(edge)))
        fail(
          'aggregate-seam-overlap',
          'input.mappings',
          `the two seams reuse a physical boundary edge on piece ${pieceId}.`,
        );
    }
    const mappedSeamIds = [first.mapping.seam.id, second.mapping.seam.id].sort();
    if (!samePair(mappedSeamIds, seamIds))
      fail(
        'aggregate-seam-coverage-mismatch',
        'input.mappings',
        'the two successful mappings must cover every operation seam exactly once.',
      );
    if (
      sourceBindingKey(first.mapping.sourceBinding) !==
        sourceBindingKey(second.mapping.sourceBinding) ||
      first.mapping.scope.scopeId !== second.mapping.scope.scopeId
    )
      fail(
        'aggregate-source-binding-mismatch',
        'input.mappings',
        'both child mappings must share one exact source/document/revision and scope binding.',
      );

    const ordered = [first, second].sort((left, right) =>
      compareCodeUnits(left.mapping.seam.id, right.mapping.seam.id),
    ) as [typeof first, typeof second];
    const aggregate: PatternImportDxfTwoSeamMappingAggregateV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
      childMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      sourceBinding: {
        sourceFileId: ordered[0].mapping.sourceBinding.sourceFileId,
        documentId: ordered[0].mapping.sourceBinding.documentId,
        revision: ordered[0].mapping.sourceBinding.revision,
        baseFinalCoordinateSha256: ordered[0].mapping.sourceBinding.baseFinalCoordinateSha256,
        sourcePathCoordinateSha256: ordered[0].mapping.sourceBinding.sourcePathCoordinateSha256,
      },
      scope: {
        scopeId: ordered[0].mapping.scope.scopeId,
        pieceIds,
      },
      operation: {
        id: operationId,
        sourceOperationNumber: Number(operation.sourceOperationNumber),
        stage: operationStage,
        order: 0 as const,
        kind: 'stitch' as const,
        seamIds,
      },
      seams: [ordered[0].mapping.seam, ordered[1].mapping.seam] as const,
      childSeals: [
        {
          seamId: ordered[0].mapping.seam.id,
          mappingCanonicalSha256: ordered[0].seal.canonicalSha256,
          handoffCanonicalSha256: ordered[0].mapping.sourceBinding.handoffCanonicalSha256,
        },
        {
          seamId: ordered[1].mapping.seam.id,
          mappingCanonicalSha256: ordered[1].seal.canonicalSha256,
          handoffCanonicalSha256: ordered[1].mapping.sourceBinding.handoffCanonicalSha256,
        },
      ] as const,
    });
    if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
      fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 implementation is unavailable.');
    const encoded = textEncoder.encode(
      `pattern-import-dxf-two-seam-mapping-aggregate-v1\0${canonical(aggregate)}`,
    );
    if (encoded.byteLength > MAX_CANONICAL_BYTES)
      fail('invalid-input', 'aggregate', 'canonical aggregate byte bound exceeded.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
    if (digest.byteLength !== 32)
      fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 returned an invalid digest.');
    const seal: PatternImportDxfTwoSeamMappingAggregateSealV1 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      sealedAggregateVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
      childMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      authority: 'unsigned-in-memory-consistency-only' as const,
      atomicTwoSeamAuthority: true as const,
      writerExportShaBound: false as const,
      trustedAuthorityIntegrated: false as const,
      productionReady: false as const,
    });
    return deepFreeze({
      ok: true as const,
      aggregate,
      seal,
      childMappings: [ordered[0].mapping, ordered[1].mapping] as const,
      childSeals: [ordered[0].seal, ordered[1].seal] as const,
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}
