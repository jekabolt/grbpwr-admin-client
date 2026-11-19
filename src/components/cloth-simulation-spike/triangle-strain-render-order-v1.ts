export const TRIANGLE_STRAIN_RENDER_ORDER_V1 = 'triangle-strain-render-order/1' as const;

export type TriangleStrainRenderOrderReceiptV1 = Readonly<{
  schemaVersion: typeof TRIANGLE_STRAIN_RENDER_ORDER_V1;
  triangleCount: number;
  mapping: 'exact-oriented-vertex-triple-bijection';
  inputValuesOrder: 'continuum-colored';
  outputValuesOrder: 'normalized-render-topology';
  normalizedTopologySha256: string;
  continuumTriangleIndicesSha256: string;
  rawTriangleValuesSha256: string;
  rawValidityFlagsSha256: string;
  continuumToRenderTriangleIndicesSha256: string;
  orderedTriangleValuesSha256: string;
  orderedValidityFlagsSha256: string;
  authority: 'content-only-no-owner-or-runtime-admission';
}>;

const MAX_TRIANGLES = 1_000_000;
const descriptors = Object.getOwnPropertyDescriptors;
const prototype = Object.getPrototypeOf;
const typedPrototype = prototype(Uint32Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const subtle = globalThis.crypto?.subtle;
const digest = subtle?.digest;

type Input = Readonly<{
  normalizedTopology: Uint32Array;
  continuumTriangleIndices: ArrayBuffer;
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
}>;
type Extent = { buffer: ArrayBuffer; offset: number; length: number };

function extent(value: unknown, expected: object): Extent {
  if (!value || prototype(value) !== expected)
    throw new TypeError('Exact native topology/strain buffers are required.');
  if (expected === ArrayBuffer.prototype)
    return { buffer: value as ArrayBuffer, offset: 0, length: bufferLength.call(value) };
  const buffer = typedBuffer.call(value) as ArrayBuffer;
  // The native getter refuses SharedArrayBuffer and proxies without invoking caller properties.
  bufferLength.call(buffer);
  return { buffer, offset: typedOffset.call(value), length: typedLength.call(value) };
}

function snapshot(input: Input) {
  if (!input || prototype(input) !== Object.prototype)
    throw new TypeError('A plain strain render-order request is required.');
  const own = descriptors(input);
  const keys = [
    'normalizedTopology',
    'continuumTriangleIndices',
    'triangleValues',
    'validityFlags',
  ];
  if (
    Reflect.ownKeys(own).length !== keys.length ||
    keys.some((key) => !own[key] || !('value' in own[key]))
  )
    throw new TypeError('Strain render-order fields must be exact own data properties.');
  const extents = [
    extent(own.normalizedTopology.value, Uint32Array.prototype),
    extent(own.continuumTriangleIndices.value, ArrayBuffer.prototype),
    extent(own.triangleValues.value, Float32Array.prototype),
    extent(own.validityFlags.value, Uint32Array.prototype),
  ];
  const count = extents[0]!.length / 12;
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > MAX_TRIANGLES ||
    extents[1]!.length !== count * 16 ||
    extents[2]!.length !== count * 16 ||
    extents[3]!.length !== count * 4
  )
    throw new RangeError('Strain render-order buffer dimensions exceed the exact ABI or bound.');
  for (let i = 0; i < extents.length; i++)
    for (let j = 0; j < i; j++) {
      const a = extents[i]!,
        b = extents[j]!;
      if (a.buffer === b.buffer && a.offset < b.offset + b.length && b.offset < a.offset + a.length)
        throw new TypeError('Overlapping strain render-order input storage is refused.');
    }
  const copies = extents.map(
    ({ buffer, offset, length }) => new Uint8Array(new Uint8Array(buffer, offset, length)).buffer,
  );
  return {
    count,
    topology: new Uint32Array(copies[0]!),
    continuum: new Uint32Array(copies[1]!),
    values: new Float32Array(copies[2]!),
    flags: new Uint32Array(copies[3]!),
  };
}

function orientedKey(a: number, b: number, c: number): string {
  if (a === b || b === c || c === a) throw new RangeError('A topology triangle is degenerate.');
  // Cyclic rotation retains orientation; reversing the winding produces a different key.
  return a < b && a < c ? `${a}:${b}:${c}` : b < c ? `${b}:${c}:${a}` : `${c}:${a}:${b}`;
}

async function hash(value: ArrayBufferView): Promise<string> {
  if (!subtle || !digest) throw new Error('Native SHA-256 is required for render-order receipts.');
  const copied = new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  const result = new Uint8Array(await digest.call(subtle, 'SHA-256', copied));
  if (result.length !== 32) throw new Error('Invalid SHA-256 result.');
  return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Pure detached content conversion. This neither authenticates a source nor issues an owner.
 * Callers must obtain continuum topology from their existing genuine source projection and
 * revalidate borrowed owners after this await. Raw diagnostic buffers and seals are unchanged. */
export async function mapTriangleStrainToRenderOrderV1(input: Input) {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1)
    throw new Error('The strain GPU ABI requires little-endian buffers.');
  const captured = snapshot(input);
  const { count, topology, continuum, values, flags } = captured;
  const renderByTriangle = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = orientedKey(topology[i * 3]!, topology[i * 3 + 1]!, topology[i * 3 + 2]!);
    if (
      renderByTriangle.has(key) ||
      renderByTriangle.has(
        orientedKey(topology[i * 3]!, topology[i * 3 + 2]!, topology[i * 3 + 1]!),
      )
    )
      throw new RangeError('Duplicate render topology triangle.');
    renderByTriangle.set(key, i);
  }
  const continuumToRenderTriangleIndices = new Uint32Array(count);
  const renderToContinuumTriangleIndices = new Uint32Array(count);
  const seen = new Uint8Array(count);
  const orderedTriangleValues = new Float32Array(values.length);
  const orderedValidityFlags = new Uint32Array(flags.length);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    if (continuum[ordinal * 4 + 3] !== 0)
      throw new RangeError('Continuum triangle ABI reserved field must be zero.');
    const key = orientedKey(
      continuum[ordinal * 4]!,
      continuum[ordinal * 4 + 1]!,
      continuum[ordinal * 4 + 2]!,
    );
    const render = renderByTriangle.get(key);
    if (render === undefined || seen[render])
      throw new RangeError(
        'Continuum triangles must exactly cover render topology with unchanged winding.',
      );
    seen[render] = 1;
    continuumToRenderTriangleIndices[ordinal] = render;
    renderToContinuumTriangleIndices[render] = ordinal;
    orderedValidityFlags[render] = flags[ordinal]!;
    for (let component = 0; component < 4; component++) {
      const value = values[ordinal * 4 + component]!;
      if (!Number.isFinite(value)) throw new RangeError('Strain values must be finite.');
      orderedTriangleValues[render * 4 + component] = value;
    }
  }
  const [
    normalizedTopologySha256,
    continuumTriangleIndicesSha256,
    rawTriangleValuesSha256,
    rawValidityFlagsSha256,
    continuumToRenderTriangleIndicesSha256,
    orderedTriangleValuesSha256,
    orderedValidityFlagsSha256,
  ] = await Promise.all([
    hash(topology),
    hash(continuum),
    hash(values),
    hash(flags),
    hash(continuumToRenderTriangleIndices),
    hash(orderedTriangleValues),
    hash(orderedValidityFlags),
  ]);
  const receipt: TriangleStrainRenderOrderReceiptV1 = Object.freeze({
    schemaVersion: TRIANGLE_STRAIN_RENDER_ORDER_V1,
    triangleCount: count,
    mapping: 'exact-oriented-vertex-triple-bijection',
    inputValuesOrder: 'continuum-colored',
    outputValuesOrder: 'normalized-render-topology',
    normalizedTopologySha256,
    continuumTriangleIndicesSha256,
    rawTriangleValuesSha256,
    rawValidityFlagsSha256,
    continuumToRenderTriangleIndicesSha256,
    orderedTriangleValuesSha256,
    orderedValidityFlagsSha256,
    authority: 'content-only-no-owner-or-runtime-admission',
  });
  return Object.freeze({
    orderedTriangleValues,
    orderedValidityFlags,
    continuumToRenderTriangleIndices,
    renderToContinuumTriangleIndices,
    receipt,
  });
}
