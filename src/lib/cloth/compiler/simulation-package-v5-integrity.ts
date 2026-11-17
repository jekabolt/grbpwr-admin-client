import {
  SIMULATION_PACKAGE_V5_VERSION,
  validateSimulationPackageV5,
  type SimulationPackageV5,
} from './simulation-package';

export const SIMULATION_PACKAGE_V5_SEAL_V1 = 'simulation-package-v5-seal/v1' as const;
export const SIMULATION_PACKAGE_V5_SEAL_ALGORITHM = 'SHA-256' as const;
export const SIMULATION_PACKAGE_V5_SEAL_ENCODING = 'canonical-binary-lp-be-v1' as const;

export type SimulationPackageV5DigestsV1 = {
  readonly manifestSha256: string;
  readonly meshSha256: string;
  readonly distanceSha256: string;
  readonly seamSha256: string;
  readonly bendSha256: string;
  readonly materialSha256: string;
  readonly continuumSha256: string;
};

export type SimulationPackageV5SealV1 = {
  readonly version: typeof SIMULATION_PACKAGE_V5_SEAL_V1;
  readonly packageVersion: typeof SIMULATION_PACKAGE_V5_VERSION;
  readonly algorithm: typeof SIMULATION_PACKAGE_V5_SEAL_ALGORITHM;
  readonly encoding: typeof SIMULATION_PACKAGE_V5_SEAL_ENCODING;
  readonly digests: SimulationPackageV5DigestsV1;
  readonly aggregateSha256: string;
};

/** The snapshot owns cloned buffers; mutable bytes are protected by validation-time recomputation. */
export type SealedSimulationPackageV5V1 = {
  readonly simulation: SimulationPackageV5;
  readonly seal: SimulationPackageV5SealV1;
};

export type SimulationPackageV5IntegrityFailureCode =
  | 'sha256-unavailable'
  | 'unsupported-platform-endianness'
  | 'canonical-encoding-failed'
  | 'invalid-package'
  | 'invalid-seal'
  | 'digest-mismatch';

export type SimulationPackageV5IntegrityFailure = {
  readonly ok: false;
  readonly code: SimulationPackageV5IntegrityFailureCode;
  readonly errors: readonly string[];
};

export type SealSimulationPackageV5ResultV1 =
  | { readonly ok: true; readonly artifact: SealedSimulationPackageV5V1 }
  | SimulationPackageV5IntegrityFailure;

export type ValidateSealedSimulationPackageV5ResultV1 =
  | { readonly ok: true; readonly simulation: SimulationPackageV5 }
  | SimulationPackageV5IntegrityFailure;

export type SimulationPackageV5CryptoOptions = {
  /** Tests and hosts may explicitly model a browser where Web Crypto is unavailable. */
  readonly crypto?: Pick<Crypto, 'subtle'> | null;
};

const textEncoder = new TextEncoder();

const VALUE_TAG = {
  null: 0,
  false: 1,
  true: 2,
  number: 3,
  string: 4,
  array: 5,
  object: 6,
  arrayBuffer: 7,
  typedArray: 8,
} as const;

const DIGEST_KEYS = [
  'manifestSha256',
  'meshSha256',
  'distanceSha256',
  'seamSha256',
  'bendSha256',
  'materialSha256',
  'continuumSha256',
] as const satisfies readonly (keyof SimulationPackageV5DigestsV1)[];

function isLittleEndianPlatform(): boolean {
  const words = new Uint16Array([0x0102]);
  return new Uint8Array(words.buffer)[0] === 0x02;
}

function cryptoProvider(
  options: SimulationPackageV5CryptoOptions,
): Pick<Crypto, 'subtle'> | undefined {
  if (Object.prototype.hasOwnProperty.call(options, 'crypto')) return options.crypto ?? undefined;
  return globalThis.crypto;
}

function uint32Bytes(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError('Canonical field length exceeds uint32.');
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function float64Bytes(value: number): Uint8Array<ArrayBuffer> {
  if (!Number.isFinite(value)) throw new RangeError('Canonical numbers must be finite.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const byteLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (!Number.isSafeInteger(byteLength) || byteLength > 0xffffffff) {
    throw new RangeError('Canonical payload exceeds uint32.');
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function frame(tag: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return concatBytes([Uint8Array.of(tag), uint32Bytes(payload.byteLength), payload]);
}

function rawArrayBufferBytes(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer).slice();
}

function rawViewBytes(view: ArrayBufferView): Uint8Array<ArrayBuffer> {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
}

function typedArrayName(view: ArrayBufferView): string {
  if (view instanceof Int8Array) return 'Int8Array';
  if (view instanceof Uint8Array) return 'Uint8Array';
  if (view instanceof Uint8ClampedArray) return 'Uint8ClampedArray';
  if (view instanceof Int16Array) return 'Int16Array';
  if (view instanceof Uint16Array) return 'Uint16Array';
  if (view instanceof Int32Array) return 'Int32Array';
  if (view instanceof Uint32Array) return 'Uint32Array';
  if (view instanceof Float32Array) return 'Float32Array';
  if (view instanceof Float64Array) return 'Float64Array';
  if (view instanceof BigInt64Array) return 'BigInt64Array';
  if (view instanceof BigUint64Array) return 'BigUint64Array';
  if (view instanceof DataView) return 'DataView';
  throw new TypeError('Unsupported ArrayBuffer view.');
}

function encodeFields(
  fields: readonly (readonly [label: string, bytes: Uint8Array])[],
): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (const [label, bytes] of fields) {
    const labelBytes = textEncoder.encode(label);
    parts.push(
      uint32Bytes(labelBytes.byteLength),
      labelBytes,
      uint32Bytes(bytes.byteLength),
      bytes,
    );
  }
  return concatBytes(parts);
}

/**
 * Canonical recursive binary encoding. Object keys use code-unit order; arrays preserve authored
 * order. ArrayBuffer and typed-array payloads use exact raw bytes, never JSON numeric expansion.
 */
function canonicalBinary(value: unknown): Uint8Array<ArrayBuffer> {
  if (value === null) return frame(VALUE_TAG.null, new Uint8Array());
  if (value === false) return frame(VALUE_TAG.false, new Uint8Array());
  if (value === true) return frame(VALUE_TAG.true, new Uint8Array());
  if (typeof value === 'number') return frame(VALUE_TAG.number, float64Bytes(value));
  if (typeof value === 'string') return frame(VALUE_TAG.string, textEncoder.encode(value));
  if (value instanceof ArrayBuffer) {
    return frame(VALUE_TAG.arrayBuffer, rawArrayBufferBytes(value));
  }
  if (ArrayBuffer.isView(value)) {
    const name = textEncoder.encode(typedArrayName(value));
    const length =
      'length' in value && typeof value.length === 'number' ? value.length : value.byteLength;
    return frame(
      VALUE_TAG.typedArray,
      encodeFields([
        ['type', name],
        ['length', uint32Bytes(length)],
        ['bytes', rawViewBytes(value)],
      ]),
    );
  }
  if (Array.isArray(value)) {
    return frame(
      VALUE_TAG.array,
      encodeFields(value.map((entry, index) => [String(index), canonicalBinary(entry)] as const)),
    );
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return frame(
      VALUE_TAG.object,
      encodeFields(
        keys.map((key) => {
          if (record[key] === undefined) {
            throw new TypeError('Canonical objects do not accept undefined fields.');
          }
          return [key, canonicalBinary(record[key])] as const;
        }),
      ),
    );
  }
  throw new TypeError('Canonical encoding received an unsupported value.');
}

function componentBytes(domain: string, value: unknown): Uint8Array<ArrayBuffer> {
  return encodeFields([
    ['domain', textEncoder.encode(domain)],
    ['encoding', textEncoder.encode(SIMULATION_PACKAGE_V5_SEAL_ENCODING)],
    ['payload', canonicalBinary(value)],
  ]);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError('SHA-256 digest is not lowercase hex.');
  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
}

async function sha256(bytes: Uint8Array, crypto: Pick<Crypto, 'subtle'>): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', owned.buffer);
  return bytesToHex(new Uint8Array(digest));
}

/** Shared canonical encoder for versioned composite seals; binary values remain raw framed bytes. */
export function encodeDomainSeparatedCanonicalBinaryV1(
  domain: string,
  value: unknown,
): Uint8Array<ArrayBuffer> {
  return componentBytes(domain, value);
}

/** Decodes one strict lowercase SHA-256 identity for raw-byte aggregate composition. */
export function decodeCanonicalSha256HexV1(value: string): Uint8Array<ArrayBuffer> {
  return hexToBytes(value);
}

/** Hashes one domain-separated value with the exact encoder used by the V5 package seal. */
export async function sha256DomainSeparatedCanonicalBinaryV1(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'>,
): Promise<string> {
  return sha256(componentBytes(domain, value), crypto);
}

async function computeSeal(
  simulation: SimulationPackageV5,
  crypto: Pick<Crypto, 'subtle'>,
): Promise<SimulationPackageV5SealV1> {
  const digests: SimulationPackageV5DigestsV1 = {
    manifestSha256: await sha256(
      componentBytes('grbpwr/cloth/simulation-package-v5/manifest', {
        manifest: simulation.manifest,
        restBoundsM: simulation.restBoundsM,
      }),
      crypto,
    ),
    meshSha256: await sha256(
      componentBytes('grbpwr/cloth/simulation-package-v5/mesh', simulation.mesh),
      crypto,
    ),
    distanceSha256: await sha256(
      componentBytes(
        'grbpwr/cloth/simulation-package-v5/distance',
        simulation.constraints.distance,
      ),
      crypto,
    ),
    seamSha256: await sha256(
      componentBytes('grbpwr/cloth/simulation-package-v5/seam', simulation.constraints.seam),
      crypto,
    ),
    bendSha256: await sha256(
      componentBytes('grbpwr/cloth/simulation-package-v5/bend', simulation.constraints.bend),
      crypto,
    ),
    materialSha256: await sha256(
      componentBytes('grbpwr/cloth/simulation-package-v5/material', simulation.material),
      crypto,
    ),
    continuumSha256: await sha256(
      componentBytes(
        'grbpwr/cloth/simulation-package-v5/continuum-strain',
        simulation.constraints.continuumStrain,
      ),
      crypto,
    ),
  };
  const aggregateBytes = encodeFields([
    ['domain', textEncoder.encode('grbpwr/cloth/simulation-package-v5/seal-v1')],
    ['version', textEncoder.encode(SIMULATION_PACKAGE_V5_SEAL_V1)],
    ['packageVersion', textEncoder.encode(SIMULATION_PACKAGE_V5_VERSION)],
    ['algorithm', textEncoder.encode(SIMULATION_PACKAGE_V5_SEAL_ALGORITHM)],
    ['encoding', textEncoder.encode(SIMULATION_PACKAGE_V5_SEAL_ENCODING)],
    ...DIGEST_KEYS.map((key) => [key + ':raw', hexToBytes(digests[key])] as const),
  ]);
  return {
    version: SIMULATION_PACKAGE_V5_SEAL_V1,
    packageVersion: SIMULATION_PACKAGE_V5_VERSION,
    algorithm: SIMULATION_PACKAGE_V5_SEAL_ALGORITHM,
    encoding: SIMULATION_PACKAGE_V5_SEAL_ENCODING,
    digests,
    aggregateSha256: await sha256(aggregateBytes, crypto),
  };
}

function failure(
  code: SimulationPackageV5IntegrityFailureCode,
  errors: readonly string[],
): SimulationPackageV5IntegrityFailure {
  return { ok: false, code, errors: [...new Set(errors)] };
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function packageValidationErrors(simulation: SimulationPackageV5): readonly string[] {
  const errors = [...validateSimulationPackageV5(simulation)];
  if (!hasExactKeys(simulation, ['manifest', 'restBoundsM', 'mesh', 'constraints', 'material'])) {
    errors.push('V5 package top-level fields are incomplete or unsupported.');
  }
  if (!hasExactKeys(simulation.constraints, ['distance', 'seam', 'bend', 'continuumStrain'])) {
    errors.push('V5 constraint fields are incomplete or unsupported.');
  }
  if (simulation.manifest.materialRecordBytes !== simulation.material.materialRecords.byteLength) {
    errors.push('materialRecordBytes disagrees with the material records.');
  }
  if (
    simulation.manifest.particleMassBytes !== simulation.material.particleMassRecords.byteLength
  ) {
    errors.push('particleMassBytes disagrees with the particle mass records.');
  }
  return [...new Set(errors)];
}

function sealShapeErrors(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object') return ['V5 seal is missing.'];
  const seal = value as Record<string, unknown>;
  const errors: string[] = [];
  const exactSealKeys = [
    'version',
    'packageVersion',
    'algorithm',
    'encoding',
    'digests',
    'aggregateSha256',
  ];
  if (
    Object.keys(seal).length !== exactSealKeys.length ||
    exactSealKeys.some((key) => !Object.prototype.hasOwnProperty.call(seal, key))
  ) {
    errors.push('V5 seal fields are incomplete or contain unsupported values.');
  }
  if (seal.version !== SIMULATION_PACKAGE_V5_SEAL_V1) {
    errors.push('V5 seal version is unsupported.');
  }
  if (seal.packageVersion !== SIMULATION_PACKAGE_V5_VERSION) {
    errors.push('V5 seal package version is unsupported.');
  }
  if (seal.algorithm !== SIMULATION_PACKAGE_V5_SEAL_ALGORITHM) {
    errors.push('V5 seal algorithm is unsupported.');
  }
  if (seal.encoding !== SIMULATION_PACKAGE_V5_SEAL_ENCODING) {
    errors.push('V5 seal encoding is unsupported.');
  }
  if (!seal.digests || typeof seal.digests !== 'object') {
    errors.push('V5 component digests are missing.');
  } else {
    const digests = seal.digests as Record<string, unknown>;
    if (
      Object.keys(digests).length !== DIGEST_KEYS.length ||
      DIGEST_KEYS.some(
        (key) => typeof digests[key] !== 'string' || !/^[0-9a-f]{64}$/.test(digests[key] as string),
      )
    ) {
      errors.push('V5 component digests must be exact lowercase SHA-256 hex.');
    }
  }
  if (typeof seal.aggregateSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(seal.aggregateSha256)) {
    errors.push('V5 aggregate digest must be exact lowercase SHA-256 hex.');
  }
  return errors;
}

export async function sealSimulationPackageV5V1(
  simulation: SimulationPackageV5,
  options: SimulationPackageV5CryptoOptions = {},
): Promise<SealSimulationPackageV5ResultV1> {
  const crypto = cryptoProvider(options);
  if (!crypto?.subtle) {
    return failure('sha256-unavailable', ['Web Crypto SHA-256 is unavailable.']);
  }
  if (!isLittleEndianPlatform()) {
    return failure('unsupported-platform-endianness', [
      'V5 seal raw binary encoding requires a little-endian platform.',
    ]);
  }
  try {
    const snapshot = structuredClone(simulation);
    const validationErrors = packageValidationErrors(snapshot);
    if (validationErrors.length > 0) return failure('invalid-package', validationErrors);
    const seal = await computeSeal(snapshot, crypto);
    return { ok: true, artifact: { simulation: snapshot, seal } };
  } catch (error) {
    return failure('canonical-encoding-failed', [
      error instanceof Error ? error.message : 'Canonical encoding or SHA-256 failed.',
    ]);
  }
}

export async function validateSealedSimulationPackageV5V1(
  artifact: SealedSimulationPackageV5V1,
  options: SimulationPackageV5CryptoOptions = {},
): Promise<ValidateSealedSimulationPackageV5ResultV1> {
  const crypto = cryptoProvider(options);
  if (!crypto?.subtle) {
    return failure('sha256-unavailable', ['Web Crypto SHA-256 is unavailable.']);
  }
  if (!isLittleEndianPlatform()) {
    return failure('unsupported-platform-endianness', [
      'V5 seal raw binary encoding requires a little-endian platform.',
    ]);
  }
  if (!artifact || typeof artifact !== 'object' || !artifact.simulation) {
    return failure('invalid-seal', ['Sealed V5 package snapshot is missing.']);
  }
  if (!hasExactKeys(artifact, ['simulation', 'seal'])) {
    return failure('invalid-seal', ['Sealed V5 package fields are incomplete or unsupported.']);
  }
  const shapeErrors = sealShapeErrors((artifact as { readonly seal?: unknown }).seal);
  if (shapeErrors.length > 0) return failure('invalid-seal', shapeErrors);
  try {
    const expectedSeal = await computeSeal(artifact.simulation, crypto);
    const digestErrors: string[] = [];
    for (const key of DIGEST_KEYS) {
      if (artifact.seal.digests[key] !== expectedSeal.digests[key]) {
        digestErrors.push(key + ' does not match current V5 package bytes.');
      }
    }
    if (artifact.seal.aggregateSha256 !== expectedSeal.aggregateSha256) {
      digestErrors.push('aggregateSha256 does not match the component digest envelope.');
    }
    if (digestErrors.length > 0) return failure('digest-mismatch', digestErrors);

    const validationErrors = packageValidationErrors(artifact.simulation);
    if (validationErrors.length > 0) return failure('invalid-package', validationErrors);
    return { ok: true, simulation: artifact.simulation };
  } catch (error) {
    return failure('canonical-encoding-failed', [
      error instanceof Error ? error.message : 'Canonical encoding or SHA-256 failed.',
    ]);
  }
}
