import type {
  AdminService,
  GetTechCardSavedAssemblySnapshotRequest,
  TechCardPatternSemanticSidecar,
  TechCardSavedAssemblyCompleteSourceV1,
  TechCardSavedPatternRowIdentity,
  common_TechCardOperation,
} from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

const profile = 'TECH_CARD_SAVED_ASSEMBLY_SNAPSHOT_PROFILE_COMPLETE_SOURCE_V1';
const sourceDomain = 'tech-card-saved-assembly-complete-source/1\0';
const sha256 = /^[a-f0-9]{64}$/;
const revisionToken = /^asm:v1:[a-f0-9]{32}:[1-9][0-9]{0,19}$/;
const maxSourceBytes = 8 * 1024 * 1024;
const maxCarrierBytes = 4 * 1024 * 1024;
const encoder = new TextEncoder();

type ExactPatternRow = DxfProductSavedRowIdentityV1;

type SourcePatternRow = ExactPatternRow & Readonly<{ patternVersion: number; downloadUrl: string }>;

type PresentSource<T extends keyof TechCardSavedAssemblyCompleteSourceV1> = NonNullable<
  TechCardSavedAssemblyCompleteSourceV1[T]
>;

export type CompleteSavedAssemblySourceV1 = Readonly<{
  serverAssemblyRevision: string;
  sourceSha256: string;
  rows: readonly SourcePatternRow[];
  operations: readonly common_TechCardOperation[];
  ownedSeams: Readonly<PresentSource<'ownedSeams'>>;
  aliases: Readonly<PresentSource<'aliases'>>;
  garmentLabels: Readonly<PresentSource<'garmentLabels'>>;
  priorCarrier: Readonly<TechCardPatternSemanticSidecar> | null;
}>;

const verifiedSources = new WeakSet<CompleteSavedAssemblySourceV1>();

export function isVerifiedCompleteSavedAssemblySourceV1(
  value: CompleteSavedAssemblySourceV1,
): boolean {
  return verifiedSources.has(value);
}

type SourceReadOptions = Readonly<{
  expectedServerAssemblyRevision?: string;
  expectedCompleteSourceSha256?: string;
}>;

export function completeSavedAssemblyRowIdentityV1(row: ExactPatternRow): ExactPatternRow {
  const {
    techCardId,
    scopeKey,
    patternLineKey,
    revision,
    cardLockVersion,
    url,
    sizeBytes,
    sha256,
  } = row;
  return Object.freeze({
    techCardId,
    scopeKey,
    patternLineKey,
    revision,
    cardLockVersion,
    url,
    sizeBytes,
    sha256,
  });
}

function positiveInteger(value: unknown): number {
  const parsed =
    typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 1)
    throw new TypeError('Saved Assembly row contains an invalid integer.');
  return parsed;
}

function readRow(row: TechCardSavedPatternRowIdentity, anchor: ExactPatternRow): SourcePatternRow {
  const cardLockVersion = row.cardLockVersion;
  if (
    row.techCardId !== anchor.techCardId ||
    cardLockVersion !== anchor.cardLockVersion ||
    !row.scopeKey ||
    !row.patternLineKey ||
    !row.url ||
    !row.sha256 ||
    !sha256.test(row.sha256) ||
    !row.downloadUrl
  )
    throw new TypeError('Saved Assembly source row does not match the current card and lock.');
  const download = new URL(row.downloadUrl, 'https://assembly.invalid');
  if (download.protocol !== 'https:' && download.protocol !== 'http:')
    throw new TypeError('Saved Assembly source row has an invalid download URL.');
  return Object.freeze({
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    revision: positiveInteger(row.savedRowRevision),
    cardLockVersion,
    url: row.url,
    sizeBytes: positiveInteger(row.sizeBytes),
    sha256: row.sha256,
    patternVersion: positiveInteger(row.patternVersion),
    downloadUrl: row.downloadUrl,
  });
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  signal.throwIfAborted();
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readPriorCarrier(
  wire: TechCardPatternSemanticSidecar | null | undefined,
  anchor: SourcePatternRow,
  signal: AbortSignal,
): Promise<Readonly<TechCardPatternSemanticSidecar> | null> {
  if (wire == null) return null;
  const { sidecarSha256, sidecarBytes, byteLength } = wire;
  if (
    wire.techCardId !== anchor.techCardId ||
    wire.patternLineKey !== anchor.patternLineKey ||
    wire.savedRowRevision !== anchor.revision ||
    wire.patternVersion !== anchor.patternVersion ||
    wire.dxfSha256 !== anchor.sha256 ||
    !wire.mediaType ||
    !sidecarSha256 ||
    !sha256.test(sidecarSha256) ||
    !sidecarBytes ||
    !byteLength ||
    byteLength > maxCarrierBytes ||
    sidecarBytes.length > Math.ceil(maxCarrierBytes / 3) * 4
  )
    throw new TypeError('The anchor carrier differs from the saved DXF row.');
  const binary = atob(sidecarBytes);
  if (binary.length !== byteLength || btoa(binary) !== sidecarBytes)
    throw new TypeError('The anchor carrier bytes do not match their stored size.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const actual = await sha256Hex(bytes, signal);
  if (actual !== sidecarSha256) throw new TypeError('The anchor carrier digest differs.');
  return Object.freeze(wire);
}

async function verifySourceDigest(
  encoded: string | undefined,
  expectedSha256: string,
  wireProjection: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<void> {
  if (!encoded || encoded.length > Math.ceil(maxSourceBytes / 3) * 4)
    throw new TypeError('Saved Assembly source seal exceeds its byte limit.');
  const binary = atob(encoded);
  if (binary.length > maxSourceBytes || btoa(binary) !== encoded)
    throw new TypeError('Saved Assembly source seal is not canonical base64.');
  const bytes = new Uint8Array(sourceDomain.length + binary.length);
  bytes.set(encoder.encode(sourceDomain));
  for (let index = 0; index < binary.length; index++)
    bytes[sourceDomain.length + index] = binary.charCodeAt(index);
  const actual = await sha256Hex(bytes, signal);
  if (actual !== expectedSha256) throw new TypeError('Saved Assembly source digest differs.');
  const canonical = new TextDecoder('utf-8', { fatal: true }).decode(
    bytes.subarray(sourceDomain.length),
  );
  if (sortedJson(wireProjection) !== canonical)
    throw new TypeError('Saved Assembly source fields differ from their verified seal.');
}

function freezeWire<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeWire(child);
  return Object.freeze(value);
}

export async function readCompleteSavedAssemblySourceV1(
  admin: Pick<AdminService, 'GetTechCardSavedAssemblySnapshot'>,
  expectedAnchor: ExactPatternRow,
  expectedSource: SourceReadOptions,
  signal: AbortSignal,
): Promise<CompleteSavedAssemblySourceV1> {
  signal.throwIfAborted();
  const anchorRow = completeSavedAssemblyRowIdentityV1(expectedAnchor);
  const options = { ...expectedSource };
  const request: GetTechCardSavedAssemblySnapshotRequest = {
    techCardId: anchorRow.techCardId,
    patternLineKey: anchorRow.patternLineKey,
    expectedScopeKey: anchorRow.scopeKey,
    expectedSavedRowRevision: anchorRow.revision,
    expectedCardLockVersion: anchorRow.cardLockVersion,
    expectedUrl: anchorRow.url,
    expectedSizeBytes: anchorRow.sizeBytes,
    expectedSha256: anchorRow.sha256,
    selectedOperationNumber: undefined,
    profile,
    ...options,
  };
  const response = structuredClone(await admin.GetTechCardSavedAssemblySnapshot(request));
  signal.throwIfAborted();
  const source = response.completeSourceV1;
  const serverAssemblyRevision = response.serverAssemblyRevision;
  if (
    !source ||
    !serverAssemblyRevision ||
    !revisionToken.test(serverAssemblyRevision) ||
    !source.sourceSha256 ||
    !sha256.test(source.sourceSha256) ||
    (options.expectedServerAssemblyRevision !== undefined &&
      options.expectedServerAssemblyRevision !== serverAssemblyRevision) ||
    (options.expectedCompleteSourceSha256 !== undefined &&
      options.expectedCompleteSourceSha256 !== source.sourceSha256) ||
    !response.row ||
    !Array.isArray(response.operations) ||
    !Array.isArray(source.rows) ||
    !Array.isArray(source.ownedSeams) ||
    !Array.isArray(source.aliases) ||
    !Array.isArray(source.garmentLabels)
  )
    throw new TypeError('The current complete saved Assembly source is unavailable.');
  const rows = source.rows.map((row) => readRow(row, anchorRow));
  const anchor = readRow(response.row, anchorRow);
  if (
    !Object.entries(anchorRow).every(
      ([key, value]) => anchor[key as keyof ExactPatternRow] === value,
    ) ||
    rows.filter(
      (row) =>
        row.patternLineKey === anchor.patternLineKey && sortedJson(row) === sortedJson(anchor),
    ).length !== 1 ||
    new Set(rows.map(({ patternLineKey }) => patternLineKey)).size !== rows.length
  )
    throw new TypeError(
      'The complete saved Assembly source no longer includes the exact anchor row.',
    );
  const wireProjection = {
    serverAssemblyRevision,
    // Signed download URLs can rotate while the exact saved-row identity stays current.
    rows: source.rows.map((row) => ({ ...row, downloadUrl: undefined })),
    operations: response.operations,
    ownedSeams: source.ownedSeams,
    aliases: source.aliases,
    garmentLabels: source.garmentLabels,
  };
  await verifySourceDigest(source.canonicalJson, source.sourceSha256, wireProjection, signal);
  const priorCarrier = await readPriorCarrier(response.semanticSidecar, anchor, signal);
  const verified = freezeWire({
    serverAssemblyRevision,
    sourceSha256: source.sourceSha256,
    rows,
    operations: response.operations,
    ownedSeams: source.ownedSeams,
    aliases: source.aliases,
    garmentLabels: source.garmentLabels,
    priorCarrier,
  });
  verifiedSources.add(verified);
  return verified;
}

/** Refreshes a member row against the same complete Assembly snapshot before its DXF is fetched. */
export function createCompleteSavedAssemblyRowReaderV1(
  source: CompleteSavedAssemblySourceV1,
  createClient: (signal: AbortSignal) => Pick<AdminService, 'GetTechCardSavedAssemblySnapshot'>,
) {
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new TypeError('A fresh verified complete Assembly source is required.');
  const expectedSource = {
    expectedServerAssemblyRevision: source.serverAssemblyRevision,
    expectedCompleteSourceSha256: source.sourceSha256,
  };
  return async (expected: ExactPatternRow, signal: AbortSignal) => {
    const currentExpected = completeSavedAssemblyRowIdentityV1(expected);
    const rowMatches = (row: SourcePatternRow) =>
      Object.entries(currentExpected).every(
        ([key, value]) => row[key as keyof ExactPatternRow] === value,
      );
    if (!source.rows.some(rowMatches))
      throw new TypeError(
        'The requested pattern row is outside the verified complete Assembly source.',
      );
    const fresh = await readCompleteSavedAssemblySourceV1(
      createClient(signal),
      currentExpected,
      expectedSource,
      signal,
    );
    const row = fresh.rows.find(rowMatches);
    if (!row) throw new TypeError('The requested Assembly pattern row changed before download.');
    return Object.freeze({ row: currentExpected, downloadUrl: row.downloadUrl });
  };
}
