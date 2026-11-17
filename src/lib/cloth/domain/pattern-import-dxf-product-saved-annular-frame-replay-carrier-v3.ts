import type { ReplayAnswer, ReplayRecord } from '../../pattern-import/types';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_CARRIER_V3 =
  'pattern-import-dxf-product-saved-annular-frame-replay-carrier/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_KIND_V3 =
  'cloth-authored-frame' as const;

const MAX_ABS_COORDINATE_MM = 1_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

export type PatternImportDxfProductSavedAnnularFrameReplayPieceV3 = Readonly<{
  pieceId: string;
  blockName: string;
  sourceApexMm: readonly [number, number];
  sourceToWrittenAffine: readonly [number, number, number, number, number, number];
}>;

export type PatternImportDxfProductSavedAnnularFrameReplayCarrierV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_CARRIER_V3;
  pieces: readonly [
    PatternImportDxfProductSavedAnnularFrameReplayPieceV3,
    PatternImportDxfProductSavedAnnularFrameReplayPieceV3,
  ];
  claims: Readonly<{
    durableManifestReplayChannelUsed: true;
    exactWriterAffineStored: true;
    geometryInferenceUsed: false;
    rowShaBindingDeferredToConsumer: true;
    sourcePathBindingDeferredToConsumer: true;
    placementAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

export type PatternImportDxfProductSavedAnnularFrameReplayCarrierResultV3 =
  | Readonly<{
      ok: true;
      carrier: PatternImportDxfProductSavedAnnularFrameReplayCarrierV3;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      carrier: null;
      blocker: Readonly<{
        code: 'missing-carrier' | 'duplicate-carrier' | 'invalid-carrier' | 'bounds-exceeded';
        detail: string;
      }>;
    }>;

class CarrierFailure extends Error {
  constructor(
    readonly code: Extract<
      PatternImportDxfProductSavedAnnularFrameReplayCarrierResultV3,
      { ok: false }
    >['blocker']['code'],
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: CarrierFailure['code'], detail: string): never {
  throw new CarrierFailure(code, detail);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) {
    fail('invalid-carrier', `${path} must be a plain JSON object.`);
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-carrier', `${path} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-carrier', `${path} must use a plain object prototype.`);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    fail('invalid-carrier', `${path} has missing, symbol, accessor, or unexpected fields.`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-carrier', `${path}.${key} must be one enumerable data property.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactArray(value: unknown, maximumLength: number, path: string): unknown[] {
  let array: boolean;
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    descriptors = value && typeof value === 'object' ? Object.getOwnPropertyDescriptors(value) : {};
  } catch {
    fail('invalid-carrier', `${path} could not be inspected safely.`);
  }
  const lengthDescriptor = descriptors.length;
  if (
    !array ||
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength
  ) {
    fail('bounds-exceeded', `${path} must be one bounded dense array.`);
  }
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== length + 1 ||
    keys.some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length),
    )
  ) {
    fail('invalid-carrier', `${path} must not contain holes, symbols, accessors, or extra fields.`);
  }
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-carrier', `${path}[${String(index)}] must be one enumerable data property.`);
    }
    return descriptor.value;
  });
}

function safeJson(value: unknown, path: string, depth = 0, budget = { nodes: 0 }): unknown {
  budget.nodes += 1;
  if (depth > 16 || budget.nodes > 10_000) {
    fail('bounds-exceeded', `${path} exceeds the JSON structure budget.`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return finite(value, path);
  if (Array.isArray(value)) {
    return exactArray(value, 1_000, path).map((entry, index) =>
      safeJson(entry, `${path}[${String(index)}]`, depth + 1, budget),
    );
  }
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) {
    fail('invalid-carrier', `${path} must contain plain JSON values only.`);
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-carrier', `${path} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-carrier', `${path} must use a plain object prototype.`);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 1_000 || keys.some((key) => typeof key !== 'string')) {
    fail('bounds-exceeded', `${path} has too many or symbol fields.`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-carrier', `${path}.${key} must be one enumerable data property.`);
    }
    result[key] = safeJson(descriptor.value, `${path}.${key}`, depth + 1, budget);
  }
  return result;
}

function safeReplay(input: unknown): ReplayRecord {
  const replay = exactRecord(input, ['v', 'answers'], 'replay');
  if (replay.v !== 1) fail('invalid-carrier', 'replay.v must equal 1.');
  const rawAnswers = exactArray(replay.answers, 400, 'replay.answers');
  const answers = rawAnswers.map((entry, index) => {
    const path = `replay.answers[${String(index)}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || ArrayBuffer.isView(entry)) {
      fail('invalid-carrier', `${path} must be a plain answer object.`);
    }
    let descriptors: PropertyDescriptorMap;
    let prototype: object | null;
    try {
      prototype = Object.getPrototypeOf(entry);
      descriptors = Object.getOwnPropertyDescriptors(entry);
    } catch {
      fail('invalid-carrier', `${path} could not be inspected safely.`);
    }
    if (prototype !== Object.prototype && prototype !== null) {
      fail('invalid-carrier', `${path} must use a plain object prototype.`);
    }
    const keys = Reflect.ownKeys(descriptors);
    const allowed = ['step', 'kind', 'subject', 'value', 'strong', 'auto'];
    if (
      keys.some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
      !['step', 'kind', 'subject', 'value'].every((key) => keys.includes(key))
    ) {
      fail('invalid-carrier', `${path} has missing, symbol, or unexpected fields.`);
    }
    const data = (key: string): unknown => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        fail('invalid-carrier', `${path}.${key} must be one enumerable data property.`);
      }
      return descriptor.value;
    };
    const step = data('step');
    const kind = data('kind');
    const subject = data('subject');
    if (
      typeof step !== 'string' ||
      step.length > 32 ||
      typeof kind !== 'string' ||
      !/^[a-z][a-z0-9-]{0,47}$/u.test(kind) ||
      typeof subject !== 'string' ||
      subject.length > 160
    ) {
      fail('bounds-exceeded', `${path} contains an invalid bounded identity.`);
    }
    const value = safeJson(data('value'), `${path}.value`);
    const text = JSON.stringify(value);
    if (text.length > 16_384) fail('bounds-exceeded', `${path}.value exceeds the replay limit.`);
    const strong = keys.includes('strong') ? data('strong') : undefined;
    const auto = keys.includes('auto') ? data('auto') : undefined;
    if (strong !== undefined && typeof strong !== 'boolean')
      fail('invalid-carrier', `${path}.strong must be boolean when present.`);
    if (auto !== undefined && typeof auto !== 'boolean')
      fail('invalid-carrier', `${path}.auto must be boolean when present.`);
    return {
      step,
      kind,
      subject,
      value: value as ReplayAnswer['value'],
      ...(strong === true ? { strong: true } : {}),
      ...(auto === true ? { auto: true } : {}),
    };
  });
  return { v: 1, answers };
}

function finite(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    Math.abs(value) > MAX_ABS_COORDINATE_MM
  ) {
    fail('bounds-exceeded', `${path} must be one bounded finite number.`);
  }
  return value;
}

function tuple(value: unknown, length: number, path: string): number[] {
  const values = exactArray(value, length, path);
  if (values.length !== length) {
    fail('invalid-carrier', `${path} must contain exactly ${String(length)} numbers.`);
  }
  return values.map((entry, index) => finite(entry, `${path}[${String(index)}]`));
}

function piece(
  value: unknown,
  index: number,
): PatternImportDxfProductSavedAnnularFrameReplayPieceV3 {
  const path = `carrier.value.pieces[${String(index)}]`;
  const record = exactRecord(
    value,
    ['pieceId', 'blockName', 'sourceApexMm', 'sourceToWrittenAffine'],
    path,
  );
  if (
    typeof record.pieceId !== 'string' ||
    !STABLE_ID.test(record.pieceId) ||
    typeof record.blockName !== 'string' ||
    !STABLE_ID.test(record.blockName)
  ) {
    fail('invalid-carrier', `${path} piece and block identities must be bounded stable IDs.`);
  }
  const apex = tuple(record.sourceApexMm, 2, `${path}.sourceApexMm`);
  const affine = tuple(record.sourceToWrittenAffine, 6, `${path}.sourceToWrittenAffine`);
  if (affine[0] !== 1 || affine[1] !== 0 || affine[2] !== 0 || affine[3] !== 1) {
    fail('invalid-carrier', `${path}.sourceToWrittenAffine must be one exact writer translation.`);
  }
  return Object.freeze({
    pieceId: record.pieceId,
    blockName: record.blockName,
    sourceApexMm: Object.freeze([apex[0]!, apex[1]!] as const),
    sourceToWrittenAffine: Object.freeze([
      affine[0]!,
      affine[1]!,
      affine[2]!,
      affine[3]!,
      affine[4]!,
      affine[5]!,
    ] as const),
  });
}

export function readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3(
  input: unknown,
): PatternImportDxfProductSavedAnnularFrameReplayCarrierResultV3 {
  try {
    const replay = safeReplay(input);
    const matching = replay.answers.filter((answer) => {
      return answer.kind === PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_KIND_V3;
    });
    if (matching.length === 0)
      fail('missing-carrier', 'Saved replay has no authored frame carrier.');
    if (matching.length !== 1)
      fail('duplicate-carrier', 'Saved replay has more than one authored frame carrier.');
    const answer = exactRecord(matching[0], ['step', 'kind', 'subject', 'value'], 'carrier.answer');
    if (
      answer.step !== 'cloth' ||
      answer.kind !== PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_KIND_V3 ||
      answer.subject !== PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_CARRIER_V3
    ) {
      fail('invalid-carrier', 'Authored frame answer identity is invalid.');
    }
    const value = exactRecord(answer.value, ['v', 'pieces'], 'carrier.value');
    const rawPieces = exactArray(value.pieces, 2, 'carrier.value.pieces');
    if (value.v !== 1 || rawPieces.length !== 2) {
      fail('invalid-carrier', 'Authored frame value must contain exactly two V1 pieces.');
    }
    const pieces = [piece(rawPieces[0], 0), piece(rawPieces[1], 1)] as const;
    if (pieces[0].pieceId === pieces[1].pieceId || pieces[0].blockName === pieces[1].blockName) {
      fail('invalid-carrier', 'Authored frame piece and block identities must be distinct.');
    }
    return Object.freeze({
      ok: true as const,
      carrier: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_CARRIER_V3,
        pieces: Object.freeze(pieces),
        claims: Object.freeze({
          durableManifestReplayChannelUsed: true as const,
          exactWriterAffineStored: true as const,
          geometryInferenceUsed: false as const,
          rowShaBindingDeferredToConsumer: true as const,
          sourcePathBindingDeferredToConsumer: true as const,
          placementAuthority: false as const,
          runtimeAuthority: false as const,
          productionAuthority: false as const,
        }),
      }),
      blocker: null,
    });
  } catch (error) {
    const failure =
      error instanceof CarrierFailure
        ? error
        : new CarrierFailure(
            'invalid-carrier',
            error instanceof Error ? error.message : 'Saved frame carrier failed closed.',
          );
    return Object.freeze({
      ok: false as const,
      carrier: null,
      blocker: Object.freeze({ code: failure.code, detail: failure.message }),
    });
  }
}

export function createPatternImportDxfProductSavedAnnularFrameReplayAnswerV3(
  pieces: readonly [
    PatternImportDxfProductSavedAnnularFrameReplayPieceV3,
    PatternImportDxfProductSavedAnnularFrameReplayPieceV3,
  ],
): ReplayAnswer {
  const rawPieces = exactArray(pieces, 2, 'pieces');
  const checkedPieces = [piece(rawPieces[0], 0), piece(rawPieces[1], 1)] as const;
  const value: ReplayAnswer['value'] = {
    v: 1,
    pieces: checkedPieces.map((checkedPiece) => ({
      pieceId: checkedPiece.pieceId,
      blockName: checkedPiece.blockName,
      sourceApexMm: [...checkedPiece.sourceApexMm],
      sourceToWrittenAffine: [...checkedPiece.sourceToWrittenAffine],
    })),
  };
  const answer: ReplayAnswer = {
    step: 'cloth',
    kind: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_KIND_V3,
    subject: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_CARRIER_V3,
    value,
  };
  const checked = readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3({
    v: 1,
    answers: [answer],
  });
  if (!checked.ok) throw new TypeError(`${checked.blocker.code}: ${checked.blocker.detail}`);
  return Object.freeze(safeReplay({ v: 1, answers: [answer] }).answers[0]!);
}

export function mergePatternImportDxfProductSavedAnnularFrameReplayV3(
  replay: ReplayRecord | undefined,
  answer: ReplayAnswer,
): ReplayRecord {
  const current = replay ? safeReplay(replay) : ({ v: 1, answers: [] } satisfies ReplayRecord);
  const checkedAnswer = safeReplay({ v: 1, answers: [answer] }).answers[0]!;
  const retained = current.answers.filter(
    ({ kind }) => kind !== PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_FRAME_REPLAY_KIND_V3,
  );
  if (retained.length >= 400) throw new RangeError('Replay answer list has no carrier capacity.');
  return { v: 1, answers: [...retained, checkedAnswer] };
}
