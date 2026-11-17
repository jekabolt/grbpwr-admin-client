import type { MeasurementSurfacePatternPieceTransformV1 } from 'components/shared/measurement-watertight-surface-v1-stage';

export const CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1 = 'grbpwr.cad-mannequin-arrangement/v1' as const;
export const CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.cad-mannequin-arrangement.v1+json' as const;

export const CAD_MANNEQUIN_ARRANGEMENT_CLAIMS_V1 = Object.freeze({
  presentationOnly: true,
  dxfAuthority: false,
  assemblyOrderAuthority: false,
  clothAuthority: false,
  scalePersisted: false,
} as const);

export const CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1 = Object.freeze({
  maxPieces: 20_000,
  maxIdentifierLength: 512,
  maxModelRevisionLength: 256 * 1024,
  maxPoseCanonicalKeyLength: 256 * 1024,
  maxOffsetMetres: 10,
  maxRotationRadians: Math.PI * 8,
  maxCanonicalBytes: 4 * 1024 * 1024,
} as const);

export type CadMannequinArrangementBindingsV1 = Readonly<{
  card: Readonly<{ techCardId: number; cardLockVersion: number }>;
  scope: Readonly<{ scopeKey: string; patternLineKey: string; sizeToken: string }>;
  savedRow: Readonly<{ revision: number; dxfSha256: string }>;
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
  }>;
  mannequin: Readonly<{
    baseModelId: number;
    modelFormRevisionKeyV1: string;
    poseBinding: Readonly<{ canonicalKey: string }>;
  }>;
}>;

export type CadMannequinArrangementPieceV1 = Readonly<{
  pieceKey: string;
  scopeKey: string;
  pieceId: string;
  pieceLineKey: string;
  transform: MeasurementSurfacePatternPieceTransformV1;
}>;

export type CadMannequinArrangementDocumentV1 = Readonly<{
  schemaVersion: typeof CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1;
  mediaType: typeof CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1;
  encoding: 'canonical-json-utf8';
  bindings: CadMannequinArrangementBindingsV1;
  pieces: readonly CadMannequinArrangementPieceV1[];
  claims: typeof CAD_MANNEQUIN_ARRANGEMENT_CLAIMS_V1;
}>;

export type CadMannequinArrangementRequestV1 = Readonly<{
  bindings: CadMannequinArrangementBindingsV1;
  pieces: readonly CadMannequinArrangementPieceV1[];
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

function exactRecord(value: unknown, keys: readonly string[], label: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be a plain record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new RangeError(`${label} has missing, symbol, hidden, or unexpected fields.`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}.${key} must be an enumerable data property.`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

function exactArray(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an array.`);
  }
  if (value.length === 0 || value.length > maximum) {
    throw new RangeError(`${label} must contain 1..${maximum} rows.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set<string>([
    'length',
    ...Array.from({ length: value.length }, (_, index) => String(index)),
  ]);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== expected.size ||
    ownKeys.some((key) => typeof key !== 'string' || !expected.has(key))
  ) {
    throw new RangeError(`${label} has sparse, symbol, hidden, or unexpected fields.`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property.`);
    }
    return descriptor.value;
  });
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value || value.length > maximum || value.trim() !== value) {
    throw new RangeError(`${label} must be bounded, non-empty, and trimmed.`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) {
      throw new RangeError(`${label} contains a disallowed control character.`);
    }
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new RangeError(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function boundedNumber(value: unknown, label: string, maximumAbsolute: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  if (Math.abs(value) > maximumAbsolute) {
    throw new RangeError(`${label} exceeds the bounded presentation envelope.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function bindings(value: unknown): CadMannequinArrangementBindingsV1 {
  const candidate = exactRecord(
    value,
    ['card', 'scope', 'savedRow', 'source', 'mannequin'],
    'bindings',
  );
  const card = exactRecord(candidate.card, ['techCardId', 'cardLockVersion'], 'bindings.card');
  const scope = exactRecord(
    candidate.scope,
    ['scopeKey', 'patternLineKey', 'sizeToken'],
    'bindings.scope',
  );
  const savedRow = exactRecord(candidate.savedRow, ['revision', 'dxfSha256'], 'bindings.savedRow');
  const source = exactRecord(
    candidate.source,
    ['catalogCanonicalSha256', 'sizeSelectionCanonicalSha256'],
    'bindings.source',
  );
  const mannequin = exactRecord(
    candidate.mannequin,
    ['baseModelId', 'modelFormRevisionKeyV1', 'poseBinding'],
    'bindings.mannequin',
  );
  const poseBinding = exactRecord(
    mannequin.poseBinding,
    ['canonicalKey'],
    'bindings.mannequin.poseBinding',
  );
  return Object.freeze({
    card: Object.freeze({
      techCardId: positiveInteger(card.techCardId, 'bindings.card.techCardId'),
      cardLockVersion: nonNegativeInteger(card.cardLockVersion, 'bindings.card.cardLockVersion'),
    }),
    scope: Object.freeze({
      scopeKey: boundedText(
        scope.scopeKey,
        'bindings.scope.scopeKey',
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
      ),
      patternLineKey: boundedText(
        scope.patternLineKey,
        'bindings.scope.patternLineKey',
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
      ),
      sizeToken: boundedText(
        scope.sizeToken,
        'bindings.scope.sizeToken',
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
      ),
    }),
    savedRow: Object.freeze({
      revision: positiveInteger(savedRow.revision, 'bindings.savedRow.revision'),
      dxfSha256: sha256(savedRow.dxfSha256, 'bindings.savedRow.dxfSha256'),
    }),
    source: Object.freeze({
      catalogCanonicalSha256: sha256(
        source.catalogCanonicalSha256,
        'bindings.source.catalogCanonicalSha256',
      ),
      sizeSelectionCanonicalSha256: sha256(
        source.sizeSelectionCanonicalSha256,
        'bindings.source.sizeSelectionCanonicalSha256',
      ),
    }),
    mannequin: Object.freeze({
      baseModelId: positiveInteger(mannequin.baseModelId, 'bindings.mannequin.baseModelId'),
      modelFormRevisionKeyV1: boundedText(
        mannequin.modelFormRevisionKeyV1,
        'bindings.mannequin.modelFormRevisionKeyV1',
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxModelRevisionLength,
      ),
      poseBinding: Object.freeze({
        canonicalKey: boundedText(
          poseBinding.canonicalKey,
          'bindings.mannequin.poseBinding.canonicalKey',
          CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxPoseCanonicalKeyLength,
        ),
      }),
    }),
  });
}

function transform(value: unknown, label: string): MeasurementSurfacePatternPieceTransformV1 {
  const candidate = exactRecord(value, ['offsetM', 'rotationRad'], label);
  const offset = exactArray(candidate.offsetM, `${label}.offsetM`, 3);
  if (offset.length !== 3) throw new RangeError(`${label}.offsetM must contain three coordinates.`);
  return Object.freeze({
    offsetM: Object.freeze([
      boundedNumber(
        offset[0],
        `${label}.offsetM[0]`,
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres,
      ),
      boundedNumber(
        offset[1],
        `${label}.offsetM[1]`,
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres,
      ),
      boundedNumber(
        offset[2],
        `${label}.offsetM[2]`,
        CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres,
      ),
    ] as [number, number, number]),
    rotationRad: boundedNumber(
      candidate.rotationRad,
      `${label}.rotationRad`,
      CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxRotationRadians,
    ),
  });
}

function piece(value: unknown, index: number, expectedScopeKey: string) {
  const label = `pieces[${index}]`;
  const candidate = exactRecord(
    value,
    ['pieceKey', 'scopeKey', 'pieceId', 'pieceLineKey', 'transform'],
    label,
  );
  const scopeKey = boundedText(
    candidate.scopeKey,
    `${label}.scopeKey`,
    CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
  );
  if (scopeKey !== expectedScopeKey) {
    throw new RangeError(`${label}.scopeKey differs from the saved-row scope binding.`);
  }
  return Object.freeze({
    pieceKey: boundedText(
      candidate.pieceKey,
      `${label}.pieceKey`,
      CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
    ),
    scopeKey,
    pieceId: boundedText(
      candidate.pieceId,
      `${label}.pieceId`,
      CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
    ),
    pieceLineKey: boundedText(
      candidate.pieceLineKey,
      `${label}.pieceLineKey`,
      CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength,
    ),
    transform: transform(candidate.transform, `${label}.transform`),
  });
}

function comparePieces(
  left: CadMannequinArrangementPieceV1,
  right: CadMannequinArrangementPieceV1,
) {
  for (const [leftField, rightField] of [
    [left.scopeKey, right.scopeKey],
    [left.pieceLineKey, right.pieceLineKey],
    [left.pieceId, right.pieceId],
    [left.pieceKey, right.pieceKey],
  ] as const) {
    if (leftField < rightField) return -1;
    if (leftField > rightField) return 1;
  }
  return 0;
}

function normalizedDocument(
  inputBindings: unknown,
  inputPieces: unknown,
): CadMannequinArrangementDocumentV1 {
  const exactBindings = bindings(inputBindings);
  const pieces = exactArray(inputPieces, 'pieces', CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxPieces)
    .map((candidate, index) => piece(candidate, index, exactBindings.scope.scopeKey))
    .sort(comparePieces);
  const seenPieceKeys = new Set<string>();
  const seenSourceRows = new Set<string>();
  for (const candidate of pieces) {
    if (seenPieceKeys.has(candidate.pieceKey)) {
      throw new RangeError(`Duplicate pieceKey: ${candidate.pieceKey}.`);
    }
    seenPieceKeys.add(candidate.pieceKey);
    const sourceRow = JSON.stringify([
      candidate.scopeKey,
      candidate.pieceLineKey,
      candidate.pieceId,
    ]);
    if (seenSourceRows.has(sourceRow)) {
      throw new RangeError('Duplicate piece source identity.');
    }
    seenSourceRows.add(sourceRow);
  }
  const document = Object.freeze({
    schemaVersion: CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1,
    mediaType: CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1,
    encoding: 'canonical-json-utf8' as const,
    bindings: exactBindings,
    pieces: Object.freeze(pieces),
    claims: CAD_MANNEQUIN_ARRANGEMENT_CLAIMS_V1,
  });
  if (
    encoder.encode(JSON.stringify(document)).byteLength >
    CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxCanonicalBytes
  ) {
    throw new RangeError('Canonical arrangement document exceeds the production sidecar bound.');
  }
  return document;
}

export function createCadMannequinArrangementDocumentV1(
  request: CadMannequinArrangementRequestV1,
): CadMannequinArrangementDocumentV1 {
  const candidate = exactRecord(request, ['bindings', 'pieces'], 'request');
  return normalizedDocument(candidate.bindings, candidate.pieces);
}

export function decodeCadMannequinArrangementDocumentV1(
  value: unknown,
): CadMannequinArrangementDocumentV1 {
  const candidate = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'pieces', 'claims'],
    'arrangement document',
  );
  if (candidate.schemaVersion !== CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1) {
    throw new RangeError(`Unsupported arrangement schema: ${String(candidate.schemaVersion)}.`);
  }
  if (candidate.mediaType !== CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1) {
    throw new RangeError(`Unsupported arrangement media type: ${String(candidate.mediaType)}.`);
  }
  if (candidate.encoding !== 'canonical-json-utf8') {
    throw new RangeError(`Unsupported arrangement encoding: ${String(candidate.encoding)}.`);
  }
  const claims = exactRecord(
    candidate.claims,
    [
      'presentationOnly',
      'dxfAuthority',
      'assemblyOrderAuthority',
      'clothAuthority',
      'scalePersisted',
    ],
    'arrangement document.claims',
  );
  if (
    claims.presentationOnly !== true ||
    claims.dxfAuthority !== false ||
    claims.assemblyOrderAuthority !== false ||
    claims.clothAuthority !== false ||
    claims.scalePersisted !== false
  ) {
    throw new RangeError('Arrangement authority claims differ from presentation-only V1.');
  }
  return normalizedDocument(candidate.bindings, candidate.pieces);
}

export function parseCadMannequinArrangementDocumentV1(
  payload: string,
): CadMannequinArrangementDocumentV1 {
  if (typeof payload !== 'string') throw new TypeError('Arrangement payload must be a string.');
  if (encoder.encode(payload).byteLength > CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxCanonicalBytes) {
    throw new RangeError('Arrangement payload exceeds the production sidecar bound.');
  }
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    throw new SyntaxError('Arrangement payload must be valid JSON.');
  }
  return decodeCadMannequinArrangementDocumentV1(value);
}

/** Canonical object order and source-identity sorting are part of V1. */
export function encodeCadMannequinArrangementDocumentV1(
  value: CadMannequinArrangementDocumentV1,
): string {
  return JSON.stringify(decodeCadMannequinArrangementDocumentV1(value));
}

export async function fingerprintCadMannequinArrangementDocumentV1(
  value: CadMannequinArrangementDocumentV1,
): Promise<`sha256:${string}`> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is required to fingerprint an arrangement.');
  const digest = await subtle.digest(
    'SHA-256',
    encoder.encode(encodeCadMannequinArrangementDocumentV1(value)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}
