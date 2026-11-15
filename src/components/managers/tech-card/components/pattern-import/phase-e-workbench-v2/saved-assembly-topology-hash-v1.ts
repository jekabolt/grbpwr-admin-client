import type { PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2 } from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1 =
  'pattern-import-dxf-phase-e-saved-row-server-topology/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-topology-hash-contract/1' as const;

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const DEFAULT_MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
const TOPOLOGY_MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 24;
const MAX_NODES = 25_000;
const MAX_PROPERTIES = 100_000;
const MAX_ARRAY_LENGTH = 4_096;
const encoder = new TextEncoder();
const abortSignalAbortedGetter =
  typeof AbortSignal === 'function'
    ? Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get
    : undefined;

type SuccessfulAdapter = Extract<
  PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
  { ok: true }
>;

export type PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1;
  domain: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1;
  computeCanonicalSha256: (
    topology: SuccessfulAdapter['existingAssembly'],
    signal: AbortSignal,
  ) => Promise<string>;
}>;

function signalAborted(signal: AbortSignal | undefined): boolean {
  if (!signal) return false;
  if (!abortSignalAbortedGetter) return signal.aborted;
  return Reflect.apply(abortSignalAbortedGetter, signal, []) as boolean;
}

function assertLive(signal: AbortSignal | undefined): void {
  if (signalAborted(signal))
    throw new DOMException('Topology hashing was cancelled.', 'AbortError');
}

/**
 * The shared canonical plain-data encoder used by both saved-row preparation and the injected
 * server-topology verifier. Object keys are sorted, array order is authoritative, and aliases,
 * accessors, sparse arrays, non-finite numbers and negative zero fail closed.
 */
export function canonicalizePatternImportDxfPhaseESavedAssemblyValueV1(
  value: unknown,
  maximumBytes = DEFAULT_MAX_CANONICAL_BYTES,
): string {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0)
    throw new TypeError('Canonical byte bound must be a positive safe integer.');
  const chunks: string[] = [];
  const seen = new Set<object>();
  let bytes = 0;
  let nodes = 0;
  let properties = 0;
  const append = (chunk: string) => {
    bytes += encoder.encode(chunk).byteLength;
    if (bytes > maximumBytes) throw new TypeError('Canonical byte bound exceeded.');
    chunks.push(chunk);
  };
  const visit = (candidate: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) throw new TypeError('Canonical depth bound exceeded.');
    if (candidate === null || typeof candidate === 'boolean') {
      append(JSON.stringify(candidate));
      return;
    }
    if (typeof candidate === 'string') {
      if (candidate.length > maximumBytes) throw new TypeError('Canonical string bound exceeded.');
      append(JSON.stringify(candidate));
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0))
        throw new TypeError('Canonical number is invalid.');
      append(JSON.stringify(candidate));
      return;
    }
    if (!candidate || typeof candidate !== 'object')
      throw new TypeError('Canonical value is outside the plain-data domain.');
    if (seen.has(candidate)) throw new TypeError('Canonical aliases and cycles are forbidden.');
    seen.add(candidate);
    nodes += 1;
    if (nodes > MAX_NODES) throw new TypeError('Canonical node bound exceeded.');
    const array = Array.isArray(candidate);
    const prototype = Object.getPrototypeOf(candidate);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const descriptorKeys = Reflect.ownKeys(descriptors);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null) ||
      descriptorKeys.some((key) => typeof key === 'symbol')
    )
      throw new TypeError('Canonical values must be exact plain data.');
    if (array) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_ARRAY_LENGTH ||
        descriptorKeys.length !== length + 1
      )
        throw new TypeError('Canonical arrays must be bounded and dense.');
      append('[');
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('Canonical arrays must contain enumerable data entries.');
        if (index > 0) append(',');
        visit(descriptor.value, depth + 1);
      }
      properties += length;
      append(']');
    } else {
      const keys = descriptorKeys as string[];
      properties += keys.length;
      append('{');
      keys.sort();
      keys.forEach((key, index) => {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('Canonical records must contain enumerable data fields.');
        if (index > 0) append(',');
        append(JSON.stringify(key));
        append(':');
        visit(descriptor.value, depth + 1);
      });
      append('}');
    }
    if (properties > MAX_PROPERTIES) throw new TypeError('Canonical property bound exceeded.');
  };
  visit(value, 0);
  return chunks.join('');
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
  signal?: AbortSignal,
  maximumCanonicalBytes = DEFAULT_MAX_CANONICAL_BYTES,
): Promise<string> {
  assertLive(signal);
  const subtle = crypto?.subtle;
  const digestFunction = subtle?.digest;
  if (!subtle || typeof digestFunction !== 'function')
    throw new TypeError('Web Crypto SHA-256 is required.');
  const prefix = `${domain}\0`;
  const prefixBytes = encoder.encode(prefix).byteLength;
  if (prefixBytes >= maximumCanonicalBytes) throw new TypeError('Hash domain exceeds byte bound.');
  const canonical = canonicalizePatternImportDxfPhaseESavedAssemblyValueV1(
    value,
    maximumCanonicalBytes - prefixBytes,
  );
  const payload = encoder.encode(`${prefix}${canonical}`);
  let known: ArrayBuffer;
  let digest: ArrayBuffer;
  try {
    known = await Reflect.apply(digestFunction, subtle, ['SHA-256', encoder.encode('abc')]);
    assertLive(signal);
    digest = await Reflect.apply(digestFunction, subtle, ['SHA-256', payload]);
    assertLive(signal);
  } catch (error) {
    if (signalAborted(signal))
      throw new DOMException('Topology hashing was cancelled.', 'AbortError');
    throw error;
  }
  if (known.byteLength !== 32 || hex(new Uint8Array(known)) !== SHA256_ABC)
    throw new TypeError('Web Crypto SHA-256 failed its known-answer test.');
  if (digest.byteLength !== 32)
    throw new TypeError('Web Crypto SHA-256 returned an invalid digest.');
  return hex(new Uint8Array(digest));
}

export function createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1,
    domain: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
    computeCanonicalSha256: (
      topology: SuccessfulAdapter['existingAssembly'],
      signal: AbortSignal,
    ) =>
      computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
        PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
        topology,
        crypto,
        signal,
        TOPOLOGY_MAX_CANONICAL_BYTES,
      ),
  });
}
