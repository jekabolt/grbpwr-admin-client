import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  PATIMPORT,
  type CardDraft,
  type DraftScope,
} from './types';
import { writeDxfDetailed } from './write';

export const DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1 = 'dxf-product-saved-reprocess-owner/1' as const;
export const DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 =
  'dxf-product-saved-reprocess-request/1' as const;

/**
 * Exact-host signal that the authoritative bytes carry no GRBPWR manifest at all. Corrupt,
 * partial and unsupported manifests must keep throwing ManifestError and never use this signal.
 */
export class DxfProductSavedForeignDxfDetectedErrorV1 extends Error {
  constructor() {
    super('The authoritative saved DXF has no GRBPWR product manifest.');
    this.name = 'DxfProductSavedForeignDxfDetectedErrorV1';
  }
}

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SYNTHETIC_DXF_NAME = 'authoritative-saved-pattern.dxf' as const;

export type DxfProductSavedRowIdentityV1 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  revision: number;
  cardLockVersion: number;
  url: string;
  sizeBytes: number;
  sha256: string;
}>;

export type DxfProductSavedReprocessRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1;
  row: DxfProductSavedRowIdentityV1;
}>;

export type DxfProductSavedReprocessProgressV1 = Readonly<{
  stage: 'read' | 'verify' | 'reprocess' | 'revalidate';
  done: number;
  total: 100;
  note?: string;
}>;

export type DxfProductSavedReprocessBlockerV1 = Readonly<{
  code:
    | 'invalid-request'
    | 'owner-busy'
    | 'owner-disposed'
    | 'saved-row-read-failed'
    | 'saved-row-identity-mismatch'
    | 'saved-row-empty'
    | 'saved-row-size-mismatch'
    | 'saved-row-too-large'
    | 'sha256-unavailable'
    | 'saved-row-sha256-mismatch'
    | 'reprocessor-unavailable'
    | 'foreign-saved-dxf-detected'
    | 'saved-dxf-reprocess-failed'
    | 'reprocess-row-binding-mismatch'
    | 'reconstructed-draft-invalid'
    | 'reconstructed-scope-mismatch'
    | 'reconstructed-phase-d-unavailable'
    | 'reconstructed-phase-d-binding-mismatch'
    | 'reconstructed-writer-replay-unavailable'
    | 'reconstructed-writer-replay-mismatch'
    | 'reconstructed-writer-byte-replay-mismatch'
    | 'saved-row-became-stale'
    | 'saved-row-revalidation-failed'
    | 'cancelled';
  detail: string;
}>;

export type DxfProductSavedReprocessResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1;
      sourceFileId: string;
      /** Exact carrier draft with every raw DXF text field removed. */
      draft: CardDraft;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1 | null;
      sourceFileId: string | null;
      draft: null;
      blockers: readonly [DxfProductSavedReprocessBlockerV1];
    }>;

export type DxfProductSavedReprocessHostV1 = Readonly<{
  /**
   * Reads the current authoritative row and transfers exclusive ownership of `bytes` to this
   * owner. The owner zeroes the array before settling, on both success and failure.
   */
  readAuthoritativeRow: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
    onProgress: (done: number, total: number, note?: string) => void,
  ) => Promise<Readonly<{ row: DxfProductSavedRowIdentityV1; bytes: Uint8Array }>>;
  /**
   * Runs a disposable direct-DXF import. The implementation must use `sourceFileId` as the exact
   * DXF provenance identity and must not retain `bytes` after the promise settles.
   */
  reprocess: (
    input: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      sourceFileId: string;
      syntheticFilename: typeof SYNTHETIC_DXF_NAME;
      bytes: Uint8Array;
    }>,
    signal: AbortSignal,
    onProgress: (done: number, total: number, note?: string) => void,
  ) => Promise<Readonly<{ row: DxfProductSavedRowIdentityV1; draft: CardDraft }>>;
  /** Reads row metadata again after reconstruction so a stale card lock/revision cannot win. */
  readCurrentRowIdentity: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<DxfProductSavedRowIdentityV1>;
  crypto?: Pick<Crypto, 'subtle'>;
  dispose?: () => void;
}>;

export const DXF_PRODUCT_SAVED_REPROCESS_OWNER_CLAIMS_V1 = Object.freeze({
  authoritativeRowReadRequired: true,
  exactRowUrlRevisionShaAndCardLockMatched: true,
  downloadedBytesSha256Verified: true,
  reconstructedWriterBytesExactMatched: true,
  reconstructedWriterJobIndependentlyRerun: true,
  reconstructedWriterCreatedAtCanonical: true,
  hostSuppliedDraftDxfTextTrustedAsReplay: false,
  postReprocessRowRevalidated: true,
  directDxfSourceFileIdDerivedFromSavedRowSha: true,
  filenameUsedAsAuthority: false,
  nearestGeometryRecoveryAllowed: false,
  rawDxfReturned: false,
  rawRulPackageReturned: false,
  rawDxfRetainedByOwner: false,
  authoritativeReadBytesMustBeExclusiveAndUnshared: true,
  workerReceivesDisposableTransferCopy: true,
  phaseDAndWriterReplayRequired: true,
  productionReady: false,
} as const);

function blocked(
  code: DxfProductSavedReprocessBlockerV1['code'],
  detail: string,
  row: DxfProductSavedRowIdentityV1 | null = null,
  sourceFileId: string | null = null,
): DxfProductSavedReprocessResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1,
    row,
    sourceFileId,
    draft: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      DxfProductSavedReprocessBlockerV1,
    ],
  });
}

function validStableId(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length <= maxLength && STABLE_ID.test(value);
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4096) return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  const lower = value.trimStart().toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('javascript:');
}

function validRow(value: unknown): value is DxfProductSavedRowIdentityV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<DxfProductSavedRowIdentityV1>;
  return (
    Number.isSafeInteger(row.techCardId) &&
    Number(row.techCardId) > 0 &&
    validStableId(row.scopeKey) &&
    validStableId(row.patternLineKey) &&
    Number.isSafeInteger(row.revision) &&
    Number(row.revision) >= 0 &&
    Number.isSafeInteger(row.cardLockVersion) &&
    Number(row.cardLockVersion) >= 0 &&
    validUrl(row.url) &&
    Number.isSafeInteger(row.sizeBytes) &&
    Number(row.sizeBytes) > 0 &&
    typeof row.sha256 === 'string' &&
    SHA256.test(row.sha256)
  );
}

function validRequest(value: unknown): value is DxfProductSavedReprocessRequestV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Partial<DxfProductSavedReprocessRequestV1>;
  return request.schemaVersion === DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 && validRow(request.row);
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function sha256Base64Url(sha256: string): string {
  let output = '';
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < sha256.length; index += 2) {
    accumulator = (accumulator << 8) | Number.parseInt(sha256.slice(index, index + 2), 16);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += BASE64URL[(accumulator >>> bits) & 0x3f];
      accumulator &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }
  if (bits > 0) output += BASE64URL[(accumulator << (6 - bits)) & 0x3f];
  return output;
}

export function computeDxfProductSavedSourceFileIdV1(row: DxfProductSavedRowIdentityV1): string {
  // The DXF provenance carrier hex-encodes sourceFileId inside every curve identity. Preserve the
  // complete card and SHA identities while keeping even Number.MAX_SAFE_INTEGER below that carrier's
  // 192-byte stable-id ceiling.
  return `s/${row.techCardId.toString(36)}/${sha256Base64Url(row.sha256)}`;
}

async function sha256(
  bytes: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  const input = bytes.slice();
  try {
    const digest = await crypto.subtle.digest('SHA-256', input.buffer as ArrayBuffer);
    if (digest.byteLength !== 32) return null;
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  } finally {
    input.fill(0);
  }
}

function scopeMatchesRow(scope: DraftScope, row: DxfProductSavedRowIdentityV1): boolean {
  const replay = scope.writerReplay;
  return (
    scope.target.scopeKey === row.scopeKey &&
    scope.manifest.techCardId === row.techCardId &&
    replay?.schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 &&
    replay.job.techCardId === row.techCardId &&
    replay.job.scope.scopeKey === row.scopeKey
  );
}

function exactReplayDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  try {
    return date.toISOString() === value ? date : null;
  } catch {
    return null;
  }
}

function writerReplayOutput(scope: DraftScope):
  | Readonly<{
      ok: true;
      dxfText: string;
      manifest: DraftScope['manifest'];
    }>
  | Readonly<{ ok: false; detail: string }> {
  const replay = scope.writerReplay;
  if (!replay)
    return Object.freeze({
      ok: false as const,
      detail: 'The reconstructed scope has no product writer replay carrier.',
    });
  const createdAt = exactReplayDate(replay.createdAt);
  if (!createdAt)
    return Object.freeze({
      ok: false as const,
      detail: 'The product writer replay carrier has no exact canonical createdAt timestamp.',
    });
  try {
    const rerun = writeDxfDetailed(replay.job, {
      now: () => new Date(createdAt.getTime()),
    });
    return Object.freeze({
      ok: true as const,
      dxfText: rerun.dxfText,
      manifest: rerun.manifest,
    });
  } catch {
    return Object.freeze({
      ok: false as const,
      detail: 'The production writer refused the reconstructed replay job.',
    });
  }
}

function sameReplayScope(scope: DraftScope): boolean {
  const replay = scope.writerReplay;
  const replaySections = replay?.job.scope.sections ?? [];
  const scopeSections = scope.target.sections ?? [];
  return !!(
    replay &&
    replay.job.scope.scopeKey === scope.target.scopeKey &&
    replay.job.scope.fabricPurpose === scope.target.fabricPurpose &&
    replay.job.scope.bomLineKey === scope.target.bomLineKey &&
    replay.job.scope.label === scope.target.label &&
    replay.job.scope.isInterlining === scope.target.isInterlining &&
    replaySections.length === scopeSections.length &&
    replaySections.every((section, index) => section === scopeSections[index])
  );
}

function latin1Bytes(text: string): Uint8Array | null {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 0xff) return null;
    bytes[index] = code;
  }
  return bytes;
}

function deepFreezeOwned<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeOwned(child, seen);
  return Object.freeze(value);
}

async function validateAndRedactDraft(
  draft: CardDraft,
  row: DxfProductSavedRowIdentityV1,
  sourceFileId: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<
  | Readonly<{ ok: true; draft: CardDraft }>
  | Readonly<{
      ok: false;
      code: DxfProductSavedReprocessBlockerV1['code'];
      detail: string;
    }>
> {
  if (!draft || draft.techCardId !== row.techCardId || !Array.isArray(draft.scopes))
    return {
      ok: false,
      code: 'reconstructed-draft-invalid',
      detail: 'The disposable reprocessor did not return a draft for the requested tech card.',
    };
  if (draft.scopes.length !== 1 || draft.scopes[0].target.scopeKey !== row.scopeKey)
    return {
      ok: false,
      code: 'reconstructed-scope-mismatch',
      detail:
        'Saved-row replay must reconstruct exactly one scope equal to the selected row scope.',
    };
  const pipeline = draft.dxfProvenance;
  const replay = draft.dxfPhaseDReplay;
  if (
    !pipeline?.pipelineIntegrated ||
    !pipeline.contentBinding ||
    !replay?.replayReady ||
    !replay.carrier
  )
    return {
      ok: false,
      code: 'reconstructed-phase-d-unavailable',
      detail: 'Saved-row replay did not produce successful public and detached Phase-D carriers.',
    };
  if (
    pipeline.contentBinding.sourceSha256 !== row.sha256 ||
    pipeline.contentBinding.sourceFileId !== sourceFileId ||
    replay.carrier.sourceSha256 !== row.sha256 ||
    replay.carrier.sourceFileId !== sourceFileId
  )
    return {
      ok: false,
      code: 'reconstructed-phase-d-binding-mismatch',
      detail: 'Reconstructed Phase-D carriers are not bound to the verified saved-row bytes.',
    };
  if (!draft.scopes[0].writerReplay)
    return {
      ok: false,
      code: 'reconstructed-writer-replay-unavailable',
      detail: 'Saved-row replay did not produce the product writer replay carrier.',
    };
  if (!scopeMatchesRow(draft.scopes[0], row))
    return {
      ok: false,
      code: 'reconstructed-writer-replay-mismatch',
      detail: 'The writer replay carrier is not bound to the verified card and scope.',
    };
  if (!sameReplayScope(draft.scopes[0]))
    return {
      ok: false,
      code: 'reconstructed-writer-replay-mismatch',
      detail: 'The writer replay job scope does not exact-match the reconstructed draft scope.',
    };
  const rerun = writerReplayOutput(draft.scopes[0]);
  if (!rerun.ok)
    return {
      ok: false,
      code: 'reconstructed-writer-replay-mismatch',
      detail: rerun.detail,
    };
  const replayBytes = latin1Bytes(rerun.dxfText);
  if (!replayBytes)
    return {
      ok: false,
      code: 'reconstructed-writer-byte-replay-mismatch',
      detail: 'Reconstructed writer output is not the byte-preserving Latin-1 DXF representation.',
    };
  try {
    const replaySha256 = await sha256(replayBytes, crypto);
    if (replayBytes.byteLength !== row.sizeBytes || replaySha256 !== row.sha256)
      return {
        ok: false,
        code: 'reconstructed-writer-byte-replay-mismatch',
        detail: 'Reconstructed writer bytes do not exact-match the saved row size and SHA-256.',
      };
  } finally {
    replayBytes.fill(0);
  }
  try {
    const detached = structuredClone(draft);
    for (const scope of detached.scopes) {
      // Mutate the detached data records in place: spreading a future accessor-backed extension
      // could read it while redacting. A successful RUL package has two additional raw-text fields.
      scope.dxfText = '';
      if (scope.target.scopeKey === row.scopeKey) scope.manifest = structuredClone(rerun.manifest);
      if (scope.rul?.ok) {
        scope.rul.dxfText = '';
        scope.rul.rulText = '';
      }
    }
    // Worker/postMessage and this ownership clone preserve data but drop local freeze descriptors.
    // The row, content binding and writer bytes were verified above; re-own the detached replay
    // graph immutably before it can cross into Phase-D selection, which fresh-rebuilds it again.
    if (detached.dxfPhaseDReplay)
      detached.dxfPhaseDReplay = deepFreezeOwned(detached.dxfPhaseDReplay);
    detached.downloads = [];
    return { ok: true, draft: detached };
  } catch {
    return {
      ok: false,
      code: 'reconstructed-draft-invalid',
      detail: 'The reconstructed carrier draft could not be detached from the disposable session.',
    };
  }
}

function aborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Owns one disposable saved-row replay at a time. It does not know transport, authentication or
 * importer UI; those remain injected host seams. Exact row identity and bytes are verified on both
 * sides of reconstruction, and the only successful output is a raw-DXF-free carrier draft.
 */
export function createDxfProductSavedReprocessOwnerV1(host: DxfProductSavedReprocessHostV1) {
  if (
    !host ||
    typeof host.readAuthoritativeRow !== 'function' ||
    typeof host.reprocess !== 'function' ||
    typeof host.readCurrentRowIdentity !== 'function'
  )
    throw new TypeError('Exact saved-DXF reprocess host seams are required.');

  let disposed = false;
  let active: AbortController | null = null;

  const run = async (
    request: DxfProductSavedReprocessRequestV1,
    onProgress?: (progress: DxfProductSavedReprocessProgressV1) => void,
  ): Promise<DxfProductSavedReprocessResultV1> => {
    if (disposed) return blocked('owner-disposed', 'The saved-DXF reprocess owner is disposed.');
    if (active) return blocked('owner-busy', 'A saved-DXF reprocess is already running.');
    if (!validRequest(request))
      return blocked(
        'invalid-request',
        'An exact card, row, revision, lock, URL, size and lowercase SHA-256 are required.',
      );

    const row = Object.freeze({ ...request.row });
    if (row.sizeBytes > PATIMPORT.maxInputBytes)
      return blocked(
        'saved-row-too-large',
        `The saved DXF exceeds the ${PATIMPORT.maxInputBytes}-byte importer limit.`,
        row,
      );
    const sourceFileId = computeDxfProductSavedSourceFileIdV1(row);
    const controller = new AbortController();
    active = controller;
    let ownedBytes: Uint8Array | null = null;
    let disposableReprocessBytes: Uint8Array | null = null;
    let lastProgress = 0;
    const progress = (
      stage: DxfProductSavedReprocessProgressV1['stage'],
      stageIndex: number,
      done: number,
      total: number,
      note?: string,
    ) => {
      const fraction =
        Number.isFinite(done) && Number.isFinite(total) && total > 0
          ? Math.min(1, Math.max(0, done / total))
          : 0;
      const overall = Math.max(
        lastProgress,
        Math.min(100, Math.round((stageIndex + fraction) * 25)),
      );
      lastProgress = overall;
      try {
        onProgress?.({ stage, done: overall, total: 100, ...(note ? { note } : {}) });
      } catch {
        // Observability cannot change the replay result.
      }
    };

    try {
      progress('read', 0, 0, 1);
      let loaded: Awaited<ReturnType<DxfProductSavedReprocessHostV1['readAuthoritativeRow']>>;
      try {
        loaded = await host.readAuthoritativeRow(row, controller.signal, (done, total, note) =>
          progress('read', 0, done, total, note),
        );
      } catch (error) {
        const reason =
          error instanceof Error && error.message.trim() ? ` ${error.message.trim()}` : '';
        return blocked(
          aborted(controller.signal) ? 'cancelled' : 'saved-row-read-failed',
          aborted(controller.signal)
            ? 'Saved-DXF reprocess was cancelled.'
            : `The authoritative saved DXF row could not be read.${reason}`,
          row,
          sourceFileId,
        );
      }
      if (aborted(controller.signal))
        return blocked('cancelled', 'Saved-DXF reprocess was cancelled.', row, sourceFileId);
      if (loaded?.bytes instanceof Uint8Array) ownedBytes = loaded.bytes;
      if (!validRow(loaded?.row) || !sameRow(loaded.row, row))
        return blocked(
          'saved-row-identity-mismatch',
          'The authoritative row no longer exact-matches URL, revision, SHA or card lock.',
          row,
          sourceFileId,
        );
      if (!ownedBytes?.byteLength)
        return blocked(
          'saved-row-empty',
          'The authoritative saved DXF returned no bytes.',
          row,
          sourceFileId,
        );
      if (ownedBytes.byteLength !== row.sizeBytes)
        return blocked(
          'saved-row-size-mismatch',
          'Downloaded byte length does not equal the authoritative saved-row size.',
          row,
          sourceFileId,
        );

      progress('verify', 1, 0, 1);
      const digest = await sha256(ownedBytes, host.crypto ?? globalThis.crypto);
      if (!digest)
        return blocked(
          'sha256-unavailable',
          'SHA-256 is unavailable; saved-DXF identity cannot be verified.',
          row,
          sourceFileId,
        );
      if (digest !== row.sha256)
        return blocked(
          'saved-row-sha256-mismatch',
          'Downloaded bytes do not equal the authoritative saved-row SHA-256.',
          row,
          sourceFileId,
        );
      progress('verify', 1, 1, 1);

      progress('reprocess', 2, 0, 1);
      // ImportWorkerClient.open transfers its ArrayBuffer. Keep the verified owner copy attached so
      // cleanup remains reliable even when the disposable worker detaches its own copy.
      disposableReprocessBytes = ownedBytes.slice();
      let rebuilt: Awaited<ReturnType<DxfProductSavedReprocessHostV1['reprocess']>>;
      try {
        rebuilt = await host.reprocess(
          {
            row,
            sourceFileId,
            syntheticFilename: SYNTHETIC_DXF_NAME,
            bytes: disposableReprocessBytes,
          },
          controller.signal,
          (done, total, note) => progress('reprocess', 2, done, total, note),
        );
      } catch (error) {
        const foreignDxf = error instanceof DxfProductSavedForeignDxfDetectedErrorV1;
        return blocked(
          aborted(controller.signal)
            ? 'cancelled'
            : foreignDxf
              ? 'foreign-saved-dxf-detected'
              : 'saved-dxf-reprocess-failed',
          aborted(controller.signal)
            ? 'Saved-DXF reprocess was cancelled.'
            : foreignDxf
              ? error.message
              : 'The disposable direct-DXF reprocessor failed.',
          row,
          sourceFileId,
        );
      }
      if (aborted(controller.signal))
        return blocked('cancelled', 'Saved-DXF reprocess was cancelled.', row, sourceFileId);
      if (!validRow(rebuilt?.row) || !sameRow(rebuilt.row, row))
        return blocked(
          'reprocess-row-binding-mismatch',
          'The disposable reprocessor returned carriers for a different saved row.',
          row,
          sourceFileId,
        );
      const validated = await validateAndRedactDraft(
        rebuilt.draft,
        row,
        sourceFileId,
        host.crypto ?? globalThis.crypto,
      );
      if (validated.ok === false)
        return blocked(validated.code, validated.detail, row, sourceFileId);
      progress('reprocess', 2, 1, 1);

      progress('revalidate', 3, 0, 1);
      let current: DxfProductSavedRowIdentityV1;
      try {
        current = await host.readCurrentRowIdentity(row, controller.signal);
      } catch {
        return blocked(
          aborted(controller.signal) ? 'cancelled' : 'saved-row-revalidation-failed',
          aborted(controller.signal)
            ? 'Saved-DXF reprocess was cancelled.'
            : 'The saved row could not be revalidated after reconstruction.',
          row,
          sourceFileId,
        );
      }
      if (aborted(controller.signal))
        return blocked('cancelled', 'Saved-DXF reprocess was cancelled.', row, sourceFileId);
      if (!validRow(current) || !sameRow(current, row))
        return blocked(
          'saved-row-became-stale',
          'The saved row changed while exact carriers were being reconstructed.',
          row,
          sourceFileId,
        );
      progress('revalidate', 3, 1, 1);
      return Object.freeze({
        ok: true as const,
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1,
        row,
        sourceFileId,
        draft: validated.draft,
        blockers: Object.freeze([]) as readonly [],
      });
    } finally {
      try {
        disposableReprocessBytes?.fill(0);
      } catch {
        // A real worker transfer detaches this disposable buffer; the verified owner copy remains.
      }
      try {
        ownedBytes?.fill(0);
      } catch {
        // Defensive only: host contract gives the owner a non-shared, non-transferred byte view.
      }
      if (active === controller) active = null;
    }
  };

  return Object.freeze({
    schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_OWNER_V1,
    run,
    cancel() {
      active?.abort();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.abort();
      active = null;
      try {
        host.dispose?.();
      } catch {
        // Disposal is terminal and best-effort.
      }
    },
    snapshot() {
      return Object.freeze({ disposed, running: active !== null });
    },
  });
}
