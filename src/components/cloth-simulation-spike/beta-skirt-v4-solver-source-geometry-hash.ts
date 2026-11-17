export const BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS = Object.freeze({
  worldPositions: 'beta-skirt-v4-solver-source-positions\0',
  triangles: 'beta-skirt-v4-solver-source-triangles\0',
  geometry: 'beta-skirt-v4-solver-source-geometry\0',
} as const);

export interface BetaSkirtV4SolverSourceHashes {
  readonly garmentWorldPositionsSha256: string;
  readonly garmentTrianglesSha256: string;
  readonly solverSourceGeometrySha256: string;
}

const OBJECT_FREEZE = Object.freeze;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const REFLECT_APPLY = Reflect.apply;
const NUMBER_IS_FINITE = Number.isFinite;
const UINT8_ARRAY_CONSTRUCTOR = Uint8Array;
const DATA_VIEW_CONSTRUCTOR = DataView;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const ARRAY_BUFFER_PROTOTYPE = ArrayBuffer.prototype;
const ARRAY_BUFFER_BYTE_LENGTH = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  ARRAY_BUFFER_PROTOTYPE,
  'byteLength',
)?.get;
const ARRAY_BUFFER_RESIZABLE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  ARRAY_BUFFER_PROTOTYPE,
  'resizable',
)?.get;
const FLOAT32_ARRAY_PROTOTYPE = Float32Array.prototype;
const UINT32_ARRAY_PROTOTYPE = Uint32Array.prototype;
const UINT8_ARRAY_PROTOTYPE = Uint8Array.prototype;
const TYPED_ARRAY_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(FLOAT32_ARRAY_PROTOTYPE) as object;
const TYPED_ARRAY_BUFFER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'buffer')?.get;
const TYPED_ARRAY_LENGTH = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'length')?.get;
const TYPED_ARRAY_BYTE_OFFSET = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'byteOffset',
)?.get;
const TYPED_ARRAY_BYTE_LENGTH = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const DATA_VIEW_SET_UINT32 = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(DataView.prototype, 'setUint32')
  ?.value as
  ((this: DataView, byteOffset: number, value: number, littleEndian?: boolean) => void) | undefined;
const DATA_VIEW_SET_FLOAT32 = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(DataView.prototype, 'setFloat32')
  ?.value as
  ((this: DataView, byteOffset: number, value: number, littleEndian?: boolean) => void) | undefined;
const SUBTLE_DIGEST =
  typeof SubtleCrypto === 'undefined'
    ? null
    : OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SubtleCrypto.prototype, 'digest')?.value;
const HEX = '0123456789abcdef';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

interface TypedMetadata {
  readonly buffer: ArrayBuffer;
  readonly length: number;
  readonly byteLength: number;
}

function defineOwnArrayIndex<T>(target: T[], index: number, value: T): void {
  REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, Object, [
    target,
    `${index}`,
    { value, writable: true, enumerable: true, configurable: true },
  ]);
}

function typedMetadata(value: unknown, prototype: object, bytesPerElement: number): TypedMetadata {
  if (
    !value ||
    typeof value !== 'object' ||
    !TYPED_ARRAY_BUFFER ||
    !TYPED_ARRAY_LENGTH ||
    !TYPED_ARRAY_BYTE_OFFSET ||
    !TYPED_ARRAY_BYTE_LENGTH ||
    !ARRAY_BUFFER_BYTE_LENGTH ||
    OBJECT_GET_PROTOTYPE_OF(value) !== prototype
  )
    throw new TypeError('Solver source storage is not an exact typed array.');
  const buffer = REFLECT_APPLY(TYPED_ARRAY_BUFFER, value, []) as unknown;
  const length = REFLECT_APPLY(TYPED_ARRAY_LENGTH, value, []) as unknown;
  const byteOffset = REFLECT_APPLY(TYPED_ARRAY_BYTE_OFFSET, value, []) as unknown;
  const byteLength = REFLECT_APPLY(TYPED_ARRAY_BYTE_LENGTH, value, []) as unknown;
  if (
    !buffer ||
    typeof buffer !== 'object' ||
    OBJECT_GET_PROTOTYPE_OF(buffer) !== ARRAY_BUFFER_PROTOTYPE ||
    (ARRAY_BUFFER_RESIZABLE && REFLECT_APPLY(ARRAY_BUFFER_RESIZABLE, buffer, []) === true) ||
    typeof length !== 'number' ||
    typeof byteOffset !== 'number' ||
    typeof byteLength !== 'number' ||
    byteOffset !== 0 ||
    byteLength !== length * bytesPerElement ||
    REFLECT_APPLY(ARRAY_BUFFER_BYTE_LENGTH, buffer, []) !== byteLength
  )
    throw new TypeError('Solver source storage must own one full ordinary ArrayBuffer.');
  return { buffer: buffer as ArrayBuffer, length, byteLength };
}

function setUint32(view: DataView, offset: number, value: number): void {
  if (!DATA_VIEW_SET_UINT32) throw new TypeError('Canonical uint32 writer is unavailable.');
  REFLECT_APPLY(DATA_VIEW_SET_UINT32, view, [offset, value, true]);
}

function setFloat32(view: DataView, offset: number, value: number): void {
  if (!DATA_VIEW_SET_FLOAT32) throw new TypeError('Canonical float32 writer is unavailable.');
  REFLECT_APPLY(DATA_VIEW_SET_FLOAT32, view, [offset, value, true]);
}

function serializeFloat32Component(value: Float32Array, metadata: TypedMetadata): Uint8Array {
  const bytes = new UINT8_ARRAY_CONSTRUCTOR(4 + metadata.byteLength);
  const byteMetadata = typedMetadata(bytes, UINT8_ARRAY_PROTOTYPE, 1);
  const view = new DATA_VIEW_CONSTRUCTOR(byteMetadata.buffer);
  setUint32(view, 0, metadata.length);
  for (let index = 0; index < metadata.length; index += 1) {
    if (!NUMBER_IS_FINITE(value[index]))
      throw new TypeError('Solver source positions must be finite.');
    setFloat32(view, 4 + index * 4, value[index]);
  }
  return bytes;
}

function serializeUint32Component(value: Uint32Array, metadata: TypedMetadata): Uint8Array {
  const bytes = new UINT8_ARRAY_CONSTRUCTOR(4 + metadata.byteLength);
  const byteMetadata = typedMetadata(bytes, UINT8_ARRAY_PROTOTYPE, 1);
  const view = new DATA_VIEW_CONSTRUCTOR(byteMetadata.buffer);
  setUint32(view, 0, metadata.length);
  for (let index = 0; index < metadata.length; index += 1)
    setUint32(view, 4 + index * 4, value[index]);
  return bytes;
}

function ascii(value: string): Uint8Array {
  const result = new UINT8_ARRAY_CONSTRUCTOR(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = REFLECT_APPLY(STRING_CHAR_CODE_AT, value, [index]) as number;
    if (code > 0x7f) throw new TypeError('Hash domain contains non-ASCII data.');
    result[index] = code;
  }
  return result;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let byteLength = 0;
  const metadata: TypedMetadata[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const item = typedMetadata(parts[index], UINT8_ARRAY_PROTOTYPE, 1);
    defineOwnArrayIndex(metadata, index, item);
    byteLength += item.byteLength;
  }
  const result = new UINT8_ARRAY_CONSTRUCTOR(byteLength);
  let offset = 0;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const partLength = metadata[partIndex].length;
    for (let index = 0; index < partLength; index += 1) result[offset + index] = part[index];
    offset += partLength;
  }
  return result;
}

function digestHex(buffer: ArrayBuffer): string {
  if (!ARRAY_BUFFER_BYTE_LENGTH || OBJECT_GET_PROTOTYPE_OF(buffer) !== ARRAY_BUFFER_PROTOTYPE)
    throw new TypeError('SHA-256 returned a non-native digest.');
  if (REFLECT_APPLY(ARRAY_BUFFER_BYTE_LENGTH, buffer, []) !== 32)
    throw new TypeError('SHA-256 returned the wrong digest length.');
  const bytes = new UINT8_ARRAY_CONSTRUCTOR(buffer);
  let result = '';
  for (let index = 0; index < 32; index += 1)
    result += HEX[bytes[index] >> 4] + HEX[bytes[index] & 15];
  return result;
}

async function rawDigest(subtle: SubtleCrypto, bytes: Uint8Array): Promise<string> {
  if (!SUBTLE_DIGEST) throw new TypeError('Captured SHA-256 is unavailable.');
  const digest = await REFLECT_APPLY(SUBTLE_DIGEST, subtle, ['SHA-256', bytes]);
  return digestHex(digest as ArrayBuffer);
}

async function sha256(bytes: Uint8Array, provider: Crypto | null | undefined): Promise<string> {
  const subtle = provider?.subtle;
  if (!subtle || !SUBTLE_DIGEST) throw new TypeError('SHA-256 is unavailable.');
  if (
    (await rawDigest(subtle, new UINT8_ARRAY_CONSTRUCTOR(0))) !== EMPTY_SHA256 ||
    (await rawDigest(subtle, new UINT8_ARRAY_CONSTRUCTOR([0x61, 0x62, 0x63]))) !== ABC_SHA256
  )
    throw new TypeError('SHA-256 self-test failed.');
  return rawDigest(subtle, bytes);
}

/**
 * Canonical solver-source binding. The two inputs are fully inspected and serialized before the
 * first digest await. Encoding is `uint32 elementCount LE` followed by canonical elements LE.
 */
export async function hashBetaSkirtV4SolverSourceGeometry(
  garmentWorldPositionsM: Float32Array,
  garmentTriangles: Uint32Array,
  cryptoProvider: Crypto | null | undefined = globalThis.crypto,
): Promise<BetaSkirtV4SolverSourceHashes> {
  const positionsMetadata = typedMetadata(garmentWorldPositionsM, FLOAT32_ARRAY_PROTOTYPE, 4);
  const trianglesMetadata = typedMetadata(garmentTriangles, UINT32_ARRAY_PROTOTYPE, 4);
  if (positionsMetadata.buffer === trianglesMetadata.buffer)
    throw new TypeError('Solver source components must not alias.');
  if (positionsMetadata.length % 3 !== 0 || trianglesMetadata.length % 3 !== 0)
    throw new TypeError('Solver source component lengths are invalid.');
  const positionBytes = serializeFloat32Component(garmentWorldPositionsM, positionsMetadata);
  const triangleBytes = serializeUint32Component(garmentTriangles, trianglesMetadata);
  const garmentWorldPositionsSha256 = await sha256(
    concatBytes([ascii(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.worldPositions), positionBytes]),
    cryptoProvider,
  );
  const garmentTrianglesSha256 = await sha256(
    concatBytes([ascii(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.triangles), triangleBytes]),
    cryptoProvider,
  );
  const solverSourceGeometrySha256 = await sha256(
    concatBytes([
      ascii(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.geometry),
      positionBytes,
      triangleBytes,
    ]),
    cryptoProvider,
  );
  return OBJECT_FREEZE({
    garmentWorldPositionsSha256,
    garmentTrianglesSha256,
    solverSourceGeometrySha256,
  });
}
