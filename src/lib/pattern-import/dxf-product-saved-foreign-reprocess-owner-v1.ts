import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  PATIMPORT,
  type CardDraft,
  type DraftScope,
} from './types';
import {
  computeDxfProductSavedSourceFileIdV1,
  type DxfProductSavedReprocessProgressV1,
  type DxfProductSavedRowIdentityV1,
} from './dxf-product-saved-reprocess-owner-v1';
import { writeDxfDetailed } from './write';

export const DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1 =
  'dxf-product-saved-foreign-reprocess-owner/1' as const;
export const DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 =
  'dxf-product-saved-foreign-reprocess-request/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SYNTHETIC_DXF_NAME = 'authoritative-saved-pattern.dxf' as const;

export type DxfProductSavedForeignReprocessRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1;
  row: DxfProductSavedRowIdentityV1;
}>;

export type DxfProductSavedForeignReprocessBlockerV1 = Readonly<{
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
    | 'saved-dxf-reprocess-failed'
    | 'reprocess-row-binding-mismatch'
    | 'foreign-draft-invalid'
    | 'foreign-scope-mismatch'
    | 'foreign-phase-d-unavailable'
    | 'foreign-phase-d-binding-mismatch'
    | 'foreign-writer-replay-unavailable'
    | 'foreign-writer-source-mismatch'
    | 'foreign-writer-replay-mismatch'
    | 'saved-row-became-stale'
    | 'saved-row-revalidation-failed'
    | 'cancelled';
  detail: string;
}>;

export type DxfProductSavedForeignReprocessResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1;
      sourceFileId: string;
      canonicalWriterSha256: string;
      draft: CardDraft;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1;
      row: DxfProductSavedRowIdentityV1 | null;
      sourceFileId: string | null;
      canonicalWriterSha256: null;
      draft: null;
      blockers: readonly [DxfProductSavedForeignReprocessBlockerV1];
    }>;

export type DxfProductSavedForeignReprocessHostV1 = Readonly<{
  readAuthoritativeRow: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
    onProgress: (done: number, total: number, note?: string) => void,
  ) => Promise<Readonly<{ row: DxfProductSavedRowIdentityV1; bytes: Uint8Array }>>;
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
  readCurrentRowIdentity: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<DxfProductSavedRowIdentityV1>;
  crypto?: Pick<Crypto, 'subtle'>;
  dispose?: () => void;
}>;

export const DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_CLAIMS_V1 = Object.freeze({
  authoritativeRowReadRequired: true,
  exactRowUrlRevisionShaAndCardLockMatched: true,
  downloadedBytesSha256Verified: true,
  sourceBoundPhaseDRequired: true,
  canonicalProductWriterIndependentlyRerun: true,
  canonicalWriterMayDifferFromForeignSource: true,
  canonicalWriterSha256ReturnedSeparately: true,
  postReprocessRowRevalidated: true,
  rawDxfReturned: false,
  rawDxfRetainedByOwner: false,
  productionReady: false,
} as const);

function blocked(
  code: DxfProductSavedForeignReprocessBlockerV1['code'],
  detail: string,
  row: DxfProductSavedRowIdentityV1 | null = null,
  sourceFileId: string | null = null,
): DxfProductSavedForeignReprocessResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1,
    row,
    sourceFileId,
    canonicalWriterSha256: null,
    draft: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      DxfProductSavedForeignReprocessBlockerV1,
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

async function sha256(
  bytes: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  const input = bytes.slice();
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', input.buffer as ArrayBuffer),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  } finally {
    input.fill(0);
  }
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

function sourceMatchesRow(scope: DraftScope, row: DxfProductSavedRowIdentityV1): boolean {
  const files = scope.writerReplay?.job.source.files ?? [];
  return (
    files.length === 1 &&
    files[0].kind === 'dxf' &&
    files[0].bytes === row.sizeBytes &&
    files[0].sha256 === row.sha256
  );
}

function deepFreezeOwned<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeOwned(child, seen);
  return Object.freeze(value);
}

async function validateAndRedactForeignDraft(
  draft: CardDraft,
  row: DxfProductSavedRowIdentityV1,
  sourceFileId: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<
  | Readonly<{ ok: true; draft: CardDraft; canonicalWriterSha256: string }>
  | Readonly<{
      ok: false;
      code: DxfProductSavedForeignReprocessBlockerV1['code'];
      detail: string;
    }>
> {
  if (!draft || draft.techCardId !== row.techCardId || !Array.isArray(draft.scopes))
    return {
      ok: false,
      code: 'foreign-draft-invalid',
      detail: 'The disposable reprocessor did not return the requested card draft.',
    };
  if (draft.scopes.length !== 1 || draft.scopes[0].target.scopeKey !== row.scopeKey)
    return {
      ok: false,
      code: 'foreign-scope-mismatch',
      detail: 'Foreign reconstruction must produce exactly the selected material scope.',
    };
  const scope = draft.scopes[0];
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
      code: 'foreign-phase-d-unavailable',
      detail:
        'Foreign reconstruction did not produce successful public and replay Phase-D carriers.',
    };
  if (
    pipeline.contentBinding.sourceFileId !== sourceFileId ||
    pipeline.contentBinding.sourceSha256 !== row.sha256 ||
    replay.carrier.sourceFileId !== sourceFileId ||
    replay.carrier.sourceSha256 !== row.sha256
  )
    return {
      ok: false,
      code: 'foreign-phase-d-binding-mismatch',
      detail: 'Foreign Phase-D carriers are not bound to the verified saved-row bytes.',
    };
  const writer = scope.writerReplay;
  if (
    writer?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 ||
    writer.job.techCardId !== row.techCardId ||
    writer.job.scope.scopeKey !== row.scopeKey
  )
    return {
      ok: false,
      code: 'foreign-writer-replay-unavailable',
      detail: 'Foreign reconstruction has no canonical writer replay for the selected card scope.',
    };
  if (!sourceMatchesRow(scope, row))
    return {
      ok: false,
      code: 'foreign-writer-source-mismatch',
      detail: 'Canonical writer provenance is not the one verified foreign DXF row.',
    };
  const createdAt = exactReplayDate(writer.createdAt);
  if (!createdAt)
    return {
      ok: false,
      code: 'foreign-writer-replay-mismatch',
      detail: 'Canonical writer replay has no exact timestamp.',
    };
  let rerun: ReturnType<typeof writeDxfDetailed>;
  try {
    rerun = writeDxfDetailed(writer.job, { now: () => new Date(createdAt.getTime()) });
  } catch {
    return {
      ok: false,
      code: 'foreign-writer-replay-mismatch',
      detail: 'The canonical writer refused the reconstructed foreign job.',
    };
  }
  if (
    rerun.manifest.techCardId !== row.techCardId ||
    rerun.manifest.scope.fabricPurpose !== scope.target.fabricPurpose ||
    rerun.manifest.scope.bomLineKey !== scope.target.bomLineKey ||
    rerun.manifest.source.files.length !== 1 ||
    rerun.manifest.source.files[0].sha256 !== row.sha256 ||
    rerun.manifest.source.files[0].bytes !== row.sizeBytes ||
    rerun.manifest.source.files[0].kind !== 'dxf'
  )
    return {
      ok: false,
      code: 'foreign-writer-source-mismatch',
      detail: 'Fresh canonical writer output lost the verified foreign source binding.',
    };
  const writerBytes = new TextEncoder().encode(rerun.dxfText);
  const canonicalWriterSha256 = await sha256(writerBytes, crypto);
  writerBytes.fill(0);
  if (!canonicalWriterSha256)
    return {
      ok: false,
      code: 'sha256-unavailable',
      detail: 'SHA-256 is unavailable for the canonical writer output.',
    };
  try {
    const detached = structuredClone(draft);
    for (const detachedScope of detached.scopes) {
      detachedScope.dxfText = '';
      if (detachedScope.target.scopeKey === row.scopeKey)
        detachedScope.manifest = structuredClone(rerun.manifest);
      if (detachedScope.rul?.ok) {
        detachedScope.rul.dxfText = '';
        detachedScope.rul.rulText = '';
      }
    }
    if (detached.dxfPhaseDReplay)
      detached.dxfPhaseDReplay = deepFreezeOwned(detached.dxfPhaseDReplay);
    detached.downloads = [];
    return { ok: true, draft: detached, canonicalWriterSha256 };
  } catch {
    return {
      ok: false,
      code: 'foreign-draft-invalid',
      detail:
        'The foreign-derived carrier draft could not be detached from its disposable session.',
    };
  }
}

/**
 * Owns verified legacy/foreign DXF ingestion. Unlike the exact product owner, it never claims that
 * the canonical writer output equals the foreign source bytes; it retains the source binding and
 * returns a separate digest for the independently rerun canonical product output.
 */
export function createDxfProductSavedForeignReprocessOwnerV1(
  host: DxfProductSavedForeignReprocessHostV1,
) {
  if (
    !host ||
    typeof host.readAuthoritativeRow !== 'function' ||
    typeof host.reprocess !== 'function' ||
    typeof host.readCurrentRowIdentity !== 'function'
  )
    throw new TypeError('Foreign saved-DXF reprocess host seams are required.');

  let disposed = false;
  let active: AbortController | null = null;

  const run = async (
    request: DxfProductSavedForeignReprocessRequestV1,
    onProgress?: (progress: DxfProductSavedReprocessProgressV1) => void,
  ): Promise<DxfProductSavedForeignReprocessResultV1> => {
    if (disposed) return blocked('owner-disposed', 'The foreign saved-DXF owner is disposed.');
    if (active) return blocked('owner-busy', 'A foreign saved-DXF reprocess is already running.');
    if (
      request?.schemaVersion !== DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 ||
      !validRow(request.row)
    )
      return blocked('invalid-request', 'An exact saved-row identity is required.');
    const row = Object.freeze({ ...request.row });
    if (row.sizeBytes > PATIMPORT.maxInputBytes)
      return blocked('saved-row-too-large', 'The saved DXF exceeds the importer limit.', row);
    const sourceFileId = computeDxfProductSavedSourceFileIdV1(row);
    const controller = new AbortController();
    active = controller;
    let ownedBytes: Uint8Array | null = null;
    let disposableBytes: Uint8Array | null = null;
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
        // Observability cannot change ownership.
      }
    };

    try {
      let loaded: Awaited<
        ReturnType<DxfProductSavedForeignReprocessHostV1['readAuthoritativeRow']>
      >;
      try {
        loaded = await host.readAuthoritativeRow(row, controller.signal, (done, total, note) =>
          progress('read', 0, done, total, note),
        );
      } catch (error) {
        const reason =
          error instanceof Error && error.message.trim() ? ` ${error.message.trim()}` : '';
        return blocked(
          controller.signal.aborted ? 'cancelled' : 'saved-row-read-failed',
          controller.signal.aborted
            ? 'Foreign saved-DXF reprocess was cancelled.'
            : `The authoritative foreign DXF row could not be read.${reason}`,
          row,
          sourceFileId,
        );
      }
      if (controller.signal.aborted)
        return blocked(
          'cancelled',
          'Foreign saved-DXF reprocess was cancelled.',
          row,
          sourceFileId,
        );
      if (loaded?.bytes instanceof Uint8Array) ownedBytes = loaded.bytes;
      if (!validRow(loaded?.row) || !sameRow(loaded.row, row))
        return blocked(
          'saved-row-identity-mismatch',
          'The authoritative row moved before foreign reconstruction.',
          row,
          sourceFileId,
        );
      if (!ownedBytes?.byteLength)
        return blocked(
          'saved-row-empty',
          'The authoritative foreign DXF is empty.',
          row,
          sourceFileId,
        );
      if (ownedBytes.byteLength !== row.sizeBytes)
        return blocked(
          'saved-row-size-mismatch',
          'Downloaded foreign DXF length does not match the saved row.',
          row,
          sourceFileId,
        );
      progress('verify', 1, 0, 1);
      const digest = await sha256(ownedBytes, host.crypto ?? globalThis.crypto);
      if (!digest)
        return blocked('sha256-unavailable', 'SHA-256 is unavailable.', row, sourceFileId);
      if (digest !== row.sha256)
        return blocked(
          'saved-row-sha256-mismatch',
          'Downloaded foreign DXF does not match the saved-row SHA-256.',
          row,
          sourceFileId,
        );
      progress('verify', 1, 1, 1);
      disposableBytes = ownedBytes.slice();
      let rebuilt: Awaited<ReturnType<DxfProductSavedForeignReprocessHostV1['reprocess']>>;
      try {
        rebuilt = await host.reprocess(
          { row, sourceFileId, syntheticFilename: SYNTHETIC_DXF_NAME, bytes: disposableBytes },
          controller.signal,
          (done, total, note) => progress('reprocess', 2, done, total, note),
        );
      } catch (error) {
        const reason =
          error instanceof Error && error.message.trim() ? ` ${error.message.trim()}` : '';
        return blocked(
          controller.signal.aborted ? 'cancelled' : 'saved-dxf-reprocess-failed',
          controller.signal.aborted
            ? 'Foreign saved-DXF reprocess was cancelled.'
            : `The disposable foreign-DXF reprocessor failed.${reason}`,
          row,
          sourceFileId,
        );
      }
      if (!validRow(rebuilt?.row) || !sameRow(rebuilt.row, row))
        return blocked(
          'reprocess-row-binding-mismatch',
          'The foreign reprocessor returned another saved row.',
          row,
          sourceFileId,
        );
      const validated = await validateAndRedactForeignDraft(
        rebuilt.draft,
        row,
        sourceFileId,
        host.crypto ?? globalThis.crypto,
      );
      if (!validated.ok) return blocked(validated.code, validated.detail, row, sourceFileId);
      progress('reprocess', 2, 1, 1);
      let current: DxfProductSavedRowIdentityV1;
      try {
        current = await host.readCurrentRowIdentity(row, controller.signal);
      } catch {
        return blocked(
          controller.signal.aborted ? 'cancelled' : 'saved-row-revalidation-failed',
          controller.signal.aborted
            ? 'Foreign saved-DXF reprocess was cancelled.'
            : 'The saved row could not be revalidated after foreign reconstruction.',
          row,
          sourceFileId,
        );
      }
      if (!validRow(current) || !sameRow(current, row))
        return blocked(
          'saved-row-became-stale',
          'The saved row changed during foreign reconstruction.',
          row,
          sourceFileId,
        );
      progress('revalidate', 3, 1, 1);
      return Object.freeze({
        ok: true as const,
        schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1,
        row,
        sourceFileId,
        canonicalWriterSha256: validated.canonicalWriterSha256,
        draft: validated.draft,
        blockers: Object.freeze([]) as readonly [],
      });
    } finally {
      try {
        disposableBytes?.fill(0);
      } catch {
        // Worker transfer may detach the disposable copy.
      }
      try {
        ownedBytes?.fill(0);
      } catch {
        // Host contract gives this owner an exclusive view.
      }
      if (active === controller) active = null;
    }
  };

  return Object.freeze({
    schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_OWNER_V1,
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
        // Terminal disposal is best-effort.
      }
    },
    snapshot() {
      return Object.freeze({ disposed, running: active !== null });
    },
  });
}
