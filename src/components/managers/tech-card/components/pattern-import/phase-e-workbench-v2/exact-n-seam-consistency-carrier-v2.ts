import {
  inspectPatternImportDxfPhaseEExactNSeamAuthorityGapV2,
  type PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2,
} from './exact-n-seam-authority-gap-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CARRIER_V2 =
  'pattern-import-dxf-phase-e-exact-n-seam-consistency-carrier/2' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_SEAL_V2 =
  'pattern-import-dxf-phase-e-exact-n-seam-consistency-seal/2' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CLAIMS_V2 = Object.freeze({
  orderedSeamsBound: true,
  exactlyTwoOrderedSidesPerSeamBound: true,
  stableExactTopologyIdentitiesBound: true,
  fullCandidateFingerprintBound: true,
  carrierSealBound: true,
  backendShapeChangeRequired: false,
  opaqueSemanticSidecarCanCarryFutureCodec: true,
  callerCandidatePromotedToAuthority: false,
  proposalChoicesAuthorityAvailable: false,
  persistenceIntegrated: false,
  productionReady: false,
} as const);

type CandidateSide = PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2['sides'][number];

export type PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CARRIER_V2;
  status: 'exact-structure-untrusted-authority';
  authorityAvailable: false;
  bindings: Readonly<{
    row: PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2['row'];
    serverAssemblyRevision: string;
    assemblyTopologySha256: string;
    selectedOperation: PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2['selectedOperation'];
    catalogCanonicalSha256: string;
    phaseEAggregatePlanSha256: string;
  }>;
  seams: readonly Readonly<{
    seamId: string;
    sides: readonly [CandidateSide, CandidateSide];
  }>[];
  fingerprint: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    canonicalByteLength: number;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CLAIMS_V2;
}>;

export type PatternImportDxfPhaseEExactNSeamConsistencySealV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_SEAL_V2;
  algorithm: 'SHA-256';
  boundCarrierFingerprintSha256: string;
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'untrusted-exact-structure-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

export type PatternImportDxfPhaseEExactNSeamConsistencyBlockerCodeV2 =
  | 'invalid-candidate'
  | 'v1-two-seam-path-required'
  | 'invalid-carrier-envelope'
  | 'carrier-fingerprint-mismatch'
  | 'carrier-seal-mismatch'
  | 'sha256-unavailable';

type Success = Readonly<{
  ok: true;
  authorityAvailable: false;
  carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2;
  seal: PatternImportDxfPhaseEExactNSeamConsistencySealV2;
  blockers: readonly [];
}>;

export type PatternImportDxfPhaseEExactNSeamConsistencyResultV2 =
  | Success
  | Readonly<{
      ok: false;
      authorityAvailable: false;
      carrier: null;
      seal: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEExactNSeamConsistencyBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

const SHA256 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

function blocked(
  code: PatternImportDxfPhaseEExactNSeamConsistencyBlockerCodeV2,
  detail: string,
): PatternImportDxfPhaseEExactNSeamConsistencyResultV2 {
  return Object.freeze({
    ok: false as const,
    authorityAvailable: false as const,
    carrier: null,
    seal: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

function safeDataGraph(value: unknown, seen = new Set<object>()): boolean {
  try {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
    if (typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return false;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (array && key === 'length') continue;
      if (
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !safeDataGraph(descriptor.value, seen)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
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

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

async function hash(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<Readonly<{ sha256: string; byteLength: number }> | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) return null;
    return {
      sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      byteLength: bytes.byteLength,
    };
  } catch {
    return null;
  }
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000')
  );
}

function candidateFromCarrier(
  carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2,
): PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2 {
  return {
    schemaVersion: 'pattern-import-dxf-phase-e-exact-n-seam-authority-candidate/2',
    status: 'untrusted-authority-candidate',
    ...carrier.bindings,
    sides: carrier.seams.flatMap(({ sides }) => sides),
  };
}

function unsignedCarrier(carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2) {
  return {
    schemaVersion: carrier.schemaVersion,
    status: carrier.status,
    authorityAvailable: carrier.authorityAvailable,
    bindings: carrier.bindings,
    seams: carrier.seams,
    claims: carrier.claims,
  };
}

export async function buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfPhaseEExactNSeamConsistencyResultV2> {
  if (!safeDataGraph(input))
    return blocked(
      'invalid-candidate',
      'The candidate must be detached plain data without accessors.',
    );
  const candidate = structuredClone(input) as PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2;
  const inspected = inspectPatternImportDxfPhaseEExactNSeamAuthorityGapV2(candidate);
  if (!inspected.structuralCandidateValid)
    return blocked(
      'invalid-candidate',
      `${inspected.blockers[0]?.code ?? 'invalid-candidate'}: ${inspected.blockers[0]?.detail ?? 'Candidate invalid.'}`,
    );
  if (inspected.seamCount === 2)
    return blocked(
      'v1-two-seam-path-required',
      'Two-seam operations must retain the verified exact-topology V1 carrier path.',
    );

  const seams = candidate.selectedOperation.seamIds.map((seamId, index) =>
    Object.freeze({
      seamId,
      sides: Object.freeze([
        candidate.sides[index * 2],
        candidate.sides[index * 2 + 1],
      ]) as readonly [CandidateSide, CandidateSide],
    }),
  );
  const bindings = deepFreeze({
    row: candidate.row,
    serverAssemblyRevision: candidate.serverAssemblyRevision,
    assemblyTopologySha256: candidate.assemblyTopologySha256,
    selectedOperation: candidate.selectedOperation,
    catalogCanonicalSha256: candidate.catalogCanonicalSha256,
    phaseEAggregatePlanSha256: candidate.phaseEAggregatePlanSha256,
  });
  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CARRIER_V2,
    status: 'exact-structure-untrusted-authority' as const,
    authorityAvailable: false as const,
    bindings,
    seams,
    claims: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CLAIMS_V2,
  };
  const crypto = options.crypto ?? globalThis.crypto;
  const fingerprint = await hash(
    'pattern-import-dxf-phase-e-exact-n-seam-consistency-carrier-fingerprint-v2',
    unsigned,
    crypto,
  );
  if (!fingerprint) return blocked('sha256-unavailable', 'SHA-256 is required for the carrier.');
  const carrier = deepFreeze({
    ...unsigned,
    fingerprint: {
      algorithm: 'SHA-256' as const,
      canonicalSha256: fingerprint.sha256,
      canonicalByteLength: fingerprint.byteLength,
    },
  } satisfies PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2);
  const sealed = await hash(
    'pattern-import-dxf-phase-e-exact-n-seam-consistency-seal-v2',
    carrier,
    crypto,
  );
  if (!sealed) return blocked('sha256-unavailable', 'SHA-256 is required for the carrier seal.');
  const seal = deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_SEAL_V2,
    algorithm: 'SHA-256' as const,
    boundCarrierFingerprintSha256: carrier.fingerprint.canonicalSha256,
    canonicalSha256: sealed.sha256,
    canonicalByteLength: sealed.byteLength,
    authority: 'untrusted-exact-structure-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  } satisfies PatternImportDxfPhaseEExactNSeamConsistencySealV2);
  return Object.freeze({
    ok: true as const,
    authorityAvailable: false as const,
    carrier,
    seal,
    blockers: Object.freeze([]) as readonly [],
  });
}

export async function verifyPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfPhaseEExactNSeamConsistencyResultV2> {
  if (!safeDataGraph(input) || !exactKeys(input, ['carrier', 'seal']))
    return blocked('invalid-carrier-envelope', 'The carrier envelope must be exact detached data.');
  const detached = structuredClone(input) as Readonly<{
    carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2;
    seal: PatternImportDxfPhaseEExactNSeamConsistencySealV2;
  }>;
  const { carrier, seal } = detached;
  if (
    !exactKeys(carrier, [
      'authorityAvailable',
      'bindings',
      'claims',
      'fingerprint',
      'schemaVersion',
      'seams',
      'status',
    ]) ||
    carrier.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CARRIER_V2 ||
    carrier.status !== 'exact-structure-untrusted-authority' ||
    carrier.authorityAvailable !== false ||
    !exactKeys(carrier.bindings, [
      'assemblyTopologySha256',
      'catalogCanonicalSha256',
      'phaseEAggregatePlanSha256',
      'row',
      'selectedOperation',
      'serverAssemblyRevision',
    ]) ||
    !Array.isArray(carrier.seams) ||
    carrier.seams.length === 0 ||
    carrier.seams.some(
      (seam) =>
        !exactKeys(seam, ['seamId', 'sides']) ||
        !Array.isArray(seam.sides) ||
        seam.sides.length !== 2,
    ) ||
    canonical(carrier.claims) !==
      canonical(PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_CLAIMS_V2) ||
    !exactKeys(carrier.fingerprint, ['algorithm', 'canonicalByteLength', 'canonicalSha256']) ||
    carrier.fingerprint.algorithm !== 'SHA-256' ||
    !SHA256.test(carrier.fingerprint.canonicalSha256) ||
    !Number.isSafeInteger(carrier.fingerprint.canonicalByteLength) ||
    carrier.fingerprint.canonicalByteLength <= 0
  )
    return blocked(
      'invalid-carrier-envelope',
      'Carrier schema, claims or fingerprint shape differs.',
    );
  const inspected = inspectPatternImportDxfPhaseEExactNSeamAuthorityGapV2(
    candidateFromCarrier(carrier),
  );
  if (!inspected.structuralCandidateValid || inspected.seamCount === 2)
    return blocked(
      'invalid-carrier-envelope',
      'Carrier topology is not one or greater-than-two seams.',
    );
  const crypto = options.crypto ?? globalThis.crypto;
  const fingerprint = await hash(
    'pattern-import-dxf-phase-e-exact-n-seam-consistency-carrier-fingerprint-v2',
    unsignedCarrier(carrier),
    crypto,
  );
  if (!fingerprint) return blocked('sha256-unavailable', 'SHA-256 is required for verification.');
  if (
    fingerprint.sha256 !== carrier.fingerprint.canonicalSha256 ||
    fingerprint.byteLength !== carrier.fingerprint.canonicalByteLength
  )
    return blocked('carrier-fingerprint-mismatch', 'Carrier fingerprint does not recompute.');
  if (
    !exactKeys(seal, [
      'algorithm',
      'authority',
      'boundCarrierFingerprintSha256',
      'canonicalByteLength',
      'canonicalSha256',
      'persistenceIntegrated',
      'productionReady',
      'schemaVersion',
    ]) ||
    seal.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_CONSISTENCY_SEAL_V2 ||
    seal.algorithm !== 'SHA-256' ||
    seal.boundCarrierFingerprintSha256 !== carrier.fingerprint.canonicalSha256 ||
    seal.authority !== 'untrusted-exact-structure-consistency-only' ||
    seal.persistenceIntegrated !== false ||
    seal.productionReady !== false ||
    !SHA256.test(seal.canonicalSha256) ||
    !Number.isSafeInteger(seal.canonicalByteLength) ||
    seal.canonicalByteLength <= 0
  )
    return blocked('carrier-seal-mismatch', 'Carrier seal metadata differs.');
  const sealed = await hash(
    'pattern-import-dxf-phase-e-exact-n-seam-consistency-seal-v2',
    carrier,
    crypto,
  );
  if (!sealed) return blocked('sha256-unavailable', 'SHA-256 is required for seal verification.');
  if (sealed.sha256 !== seal.canonicalSha256 || sealed.byteLength !== seal.canonicalByteLength)
    return blocked('carrier-seal-mismatch', 'Carrier seal does not recompute.');
  return Object.freeze({
    ok: true as const,
    authorityAvailable: false as const,
    carrier: deepFreeze(carrier),
    seal: deepFreeze(seal),
    blockers: Object.freeze([]) as readonly [],
  });
}
