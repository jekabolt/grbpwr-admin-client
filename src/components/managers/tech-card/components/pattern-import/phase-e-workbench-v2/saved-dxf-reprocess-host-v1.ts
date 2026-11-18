import { readAuthToken as readStoredAuthToken, teamHeaders } from 'api/auth-headers';
import { readManifestBytes } from 'lib/pattern-import/manifest';
import {
  DXF_PIPELINE_PROVENANCE_REQUEST_V1,
  type DxfPipelineProvenanceStageOutputV1,
} from 'lib/pattern-import/dxf-pipeline-provenance-v1';
import {
  DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1,
  type DxfProductPhaseDReplayStageOutputV1,
} from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import {
  DxfProductSavedForeignDxfDetectedErrorV1,
  type DxfProductSavedReprocessHostV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { pinToScope } from 'lib/pattern-import/fabrics/scope';
import {
  PATIMPORT,
  type AllowanceDecision,
  type CardDraft,
  type ConversionManifest,
  type PieceSpec,
  type StageIO,
} from 'lib/pattern-import/types';
import { ImportWorkerClient } from 'lib/pattern-import/worker/client';

import { cardBuildDraft } from '../card-apply';
import type { CardContext, ImportClient } from '../client';
import { cardPresegmentedIdentities } from '../entry';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_V1 =
  'pattern-import-dxf-phase-e-saved-dxf-reprocess-host/1' as const;

export type PatternImportDxfPhaseESavedDxfAuthorityReadV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  /** Server-minted object download URL from the same transactional snapshot as `row`. */
  downloadUrl: string;
}>;

export type PatternImportDxfPhaseESavedDxfReprocessHostDepsV1 = Readonly<{
  /** Current GetTechCard projection, explicitly rebound to the row's optimistic card lock. */
  resolveCard: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<Readonly<{ card: CardContext; cardLockVersion: number }>>;
  readAuthoritativeRow: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedDxfAuthorityReadV1>;
  createClient?: () => ImportClient;
  fetch?: typeof globalThis.fetch;
  crypto?: Pick<Crypto, 'subtle'>;
  /** Backend origin for server-relative tokenized pattern URLs; defaults to VITE_SERVER_URL. */
  serverUrl?: string;
  /** Dev-only backend target reached through the browser's same-origin Vite proxy. */
  apiProxyTarget?: string;
  /** Injectable browser origin for deterministic proxy transport tests. */
  browserOrigin?: string;
  /** Same-origin byte proxy used only after a browser network/CORS failure. */
  mediaProxyUrl?: string;
  /** Reads the current admin token for downloads served by that backend origin only. */
  readAuthToken?: () => string | null;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1 = Object.freeze({
  transactionalRowReadInjected: true,
  downloadUrlReadFromSameSnapshot: true,
  exactByteFetchUsesAbortSignal: true,
  backendDownloadUsesGrpcAuthHeader: true,
  backendCapabilityResolvedWithoutRedirect: true,
  backendCapabilityNetworkRetryBounded: true,
  presignedDownloadNeverReceivesAdminToken: true,
  crossOriginDownloadNeverReceivesAdminToken: true,
  localBackendCapabilityUsesSameOriginApiProxy: true,
  crossOriginCorsFailureUsesMediaProxy: true,
  disposableWorkerPerReprocess: true,
  directDxfOnly: true,
  dxfPathProvenanceOptInRequired: true,
  publicPhaseDCarrierRequired: true,
  detachedPhaseDReplayCarrierRequired: true,
  currentCardProjectionLockBound: true,
  sourceManifestReplayMetadataRestored: true,
  sourceCreatedAtRestored: true,
  sourceGeneratorRestored: true,
  sourceAndAnswerAuditRestored: true,
  exactWriterBytesVerifiedByOwner: true,
  rawDxfReturned: false,
  rawDxfRetained: false,
  productionTransportIntegrated: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

type ReprocessInput = Parameters<DxfProductSavedReprocessHostV1['reprocess']>[0];
type Progress = Parameters<DxfProductSavedReprocessHostV1['reprocess']>[2];

const sameRow = (left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) =>
  left.techCardId === right.techCardId &&
  left.scopeKey === right.scopeKey &&
  left.patternLineKey === right.patternLineKey &&
  left.revision === right.revision &&
  left.cardLockVersion === right.cardLockVersion &&
  left.url === right.url &&
  left.sizeBytes === right.sizeBytes &&
  left.sha256 === right.sha256;

function abortError(): DOMException {
  return new DOMException('Saved DXF reprocess was cancelled.', 'AbortError');
}

function assertLive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    !(bytes.buffer instanceof ArrayBuffer) ||
    bytes.byteOffset !== 0 ||
    bytes.byteLength !== bytes.buffer.byteLength
  )
    throw new Error('Disposable saved-DXF bytes must own one exact transferable ArrayBuffer.');
  return bytes.buffer;
}

function validDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4_096) return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  const lower = value.trimStart().toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('javascript:');
}

export function resolvePatternImportDxfPhaseESavedDownloadUrlV1(
  downloadUrl: string,
  serverUrl = import.meta.env.VITE_SERVER_URL ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
): string {
  if (!validDownloadUrl(downloadUrl)) throw new Error('Saved DXF download URL is invalid.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(downloadUrl)) {
    const absolute = new URL(downloadUrl);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:')
      throw new Error('Saved DXF download URL must use HTTP or HTTPS.');
    return absolute.toString();
  }
  const base = serverUrl.trim().replace(/\/$/, '');
  if (!base) throw new Error('VITE_SERVER_URL is required for a relative saved DXF URL.');
  let resolved: URL;
  try {
    resolved = new URL(downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`, `${base}/`);
  } catch {
    throw new Error('Saved DXF backend origin is invalid.');
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:')
    throw new Error('Saved DXF backend origin must use HTTP or HTTPS.');
  return resolved.toString();
}

export function resolvePatternImportDxfPhaseESavedMediaProxyUrlV1(
  downloadUrl: string,
  mediaProxyUrl = (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined) ||
    (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy'),
): string {
  if (!validDownloadUrl(downloadUrl)) throw new Error('Saved DXF byte URL is invalid.');
  if (!validDownloadUrl(mediaProxyUrl)) throw new Error('Saved DXF media proxy URL is invalid.');
  const separator = mediaProxyUrl.includes('?') ? '&' : '?';
  return `${mediaProxyUrl}${separator}url=${encodeURIComponent(downloadUrl)}`;
}

async function fetchSavedDxfBytes(
  fetcher: typeof globalThis.fetch,
  byteUrl: string,
  init: NonNullable<Parameters<typeof globalThis.fetch>[1]>,
  mediaProxyUrl: string,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetcher(byteUrl, init);
  } catch (error) {
    if (signal.aborted) throw error;
    return fetcher(resolvePatternImportDxfPhaseESavedMediaProxyUrlV1(byteUrl, mediaProxyUrl), {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    });
  }
}

function readBrowserAuthToken(): string | null {
  return readStoredAuthToken();
}

function backendDownloadAuthHeaders(
  resolvedUrl: string,
  serverUrl: string,
  readAuthToken: () => string | null,
): Readonly<Record<string, string>> | undefined {
  let downloadOrigin: string;
  let backendOrigin: string;
  try {
    downloadOrigin = new URL(resolvedUrl).origin;
    backendOrigin = new URL(serverUrl).origin;
  } catch {
    return undefined;
  }
  if (downloadOrigin !== backendOrigin) return undefined;
  const token = readAuthToken()?.trim();
  return token ? { 'Grpc-Metadata-Authorization': `Bearer ${token}`, ...teamHeaders() } : undefined;
}

function backendPatternCapabilityJsonUrl(resolvedUrl: string, serverUrl: string): string | null {
  let download: URL;
  let backend: URL;
  try {
    download = new URL(resolvedUrl);
    backend = new URL(serverUrl);
  } catch {
    return null;
  }
  if (download.origin !== backend.origin || !download.pathname.startsWith('/api/p/')) return null;
  download.searchParams.set('mode', 'json');
  return download.toString();
}

function rebaseBackendUrlToSameOriginProxy(
  resolvedUrl: string,
  backendUrl: string,
  browserOrigin: string,
): string {
  let resolved: URL;
  let backend: URL;
  let browser: URL;
  try {
    resolved = new URL(resolvedUrl);
    backend = new URL(backendUrl);
    browser = new URL(browserOrigin);
  } catch {
    throw new Error('Saved DXF local backend proxy configuration is invalid.');
  }
  if (resolved.origin !== backend.origin) return resolved.toString();
  browser.pathname = resolved.pathname;
  browser.search = resolved.search;
  browser.hash = '';
  return browser.toString();
}

function exactPresignedObjectUrl(value: unknown): string {
  if (!validDownloadUrl(value) || !/^[a-z][a-z0-9+.-]*:/i.test(value))
    throw new Error('Saved DXF capability returned no absolute object URL.');
  let resolved: URL;
  try {
    resolved = new URL(value);
  } catch {
    throw new Error('Saved DXF capability returned an invalid object URL.');
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:')
    throw new Error('Saved DXF capability object URL must use HTTP or HTTPS.');
  return resolved.toString();
}

async function resolveSavedDxfByteUrl(
  fetcher: typeof globalThis.fetch,
  resolvedUrl: string,
  serverUrl: string,
  readAuthToken: () => string | null,
  signal: AbortSignal,
): Promise<Readonly<{ url: string; usedCapabilityHop: boolean }>> {
  const capabilityUrl = backendPatternCapabilityJsonUrl(resolvedUrl, serverUrl);
  if (!capabilityUrl) return Object.freeze({ url: resolvedUrl, usedCapabilityHop: false });

  const authHeaders = backendDownloadAuthHeaders(capabilityUrl, serverUrl, readAuthToken);
  const init = {
    method: 'GET',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { Accept: 'application/json', ...authHeaders },
    signal,
  } as const;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertLive(signal);
    try {
      response = await fetcher(capabilityUrl, init);
      break;
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (!(error instanceof TypeError)) throw error;
      if (attempt === 1)
        throw new Error('Saved DXF capability lookup failed due to a network error.');
    }
  }
  if (!response) throw new Error('Saved DXF capability lookup failed due to a network error.');
  if (!response.ok)
    throw new Error(`Saved DXF capability lookup failed with HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Saved DXF capability returned invalid JSON.');
  }
  const objectUrl =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Readonly<Record<string, unknown>>).url
      : undefined;
  return Object.freeze({ url: exactPresignedObjectUrl(objectUrl), usedCapabilityHop: true });
}

function report(
  onProgress: Progress,
  step: number,
  total: number,
  note: string,
  stageDone = 1,
  stageTotal = 1,
): void {
  const fraction = stageTotal > 0 ? Math.min(1, Math.max(0, stageDone / stageTotal)) : 0;
  onProgress(step + fraction, total, note);
}

function bestCertainScale(scale: StageIO['extract']['out']['scale']) {
  const sorted = [...scale].sort((left, right) => right.confidence - left.confidence);
  const candidate = sorted[0];
  if (
    !candidate ||
    candidate.confidence < 0.9 ||
    Math.abs(candidate.factor - 1) > PATIMPORT.scaleWarnRatio
  )
    throw new Error('The saved product DXF has no certain declared 1:1 scale.');
  return candidate;
}

const SAVED_MANIFEST_CUT_LAYER_EVIDENCE = 'saved-manifest-cut-layer-is-final';

export function buildPatternImportDxfSavedManifestAllowanceV1(
  manifest: Pick<ConversionManifest, 'cutLayerIsFinal' | 'allowanceMm'>,
): AllowanceDecision {
  if (
    manifest.cutLayerIsFinal !== true ||
    !Number.isFinite(manifest.allowanceMm) ||
    manifest.allowanceMm < 0
  )
    throw new Error('Saved manifest cut-layer allowance is invalid.');
  return {
    meaning: 'cut',
    allowanceMm: manifest.allowanceMm,
    origin: 'operator',
    evidence: [SAVED_MANIFEST_CUT_LAYER_EVIDENCE],
  };
}

function exactManifestPieceIndexes(
  pieces: readonly Readonly<Pick<PieceSpec, 'identity' | 'displayName'>>[],
  manifest: Pick<ConversionManifest, 'pieces'>,
): number[] {
  if (pieces.length !== manifest.pieces.length)
    throw new Error('Saved manifest and reconstructed semantic piece counts differ.');

  const byIdentity = new Map<string, number[]>();
  const byDisplayName = new Map<string, number[]>();
  manifest.pieces.forEach((piece, index) => {
    const identityMatches = byIdentity.get(piece.identity) ?? [];
    identityMatches.push(index);
    byIdentity.set(piece.identity, identityMatches);
    const displayNameMatches = byDisplayName.get(piece.displayName) ?? [];
    displayNameMatches.push(index);
    byDisplayName.set(piece.displayName, displayNameMatches);
  });
  const usedManifestIndexes = new Set<number>();
  const indexes: number[] = [];
  for (const piece of pieces) {
    const identityMatches = byIdentity.get(piece.identity) ?? [];
    const matches = identityMatches.length
      ? identityMatches
      : byDisplayName.get(piece.displayName) ?? [];
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? `Saved manifest piece ${piece.identity} / ${piece.displayName} is ambiguous.`
          : `Saved manifest has no exact semantic piece ${piece.identity} / ${piece.displayName}.`,
      );
    const manifestIndex = matches[0];
    if (usedManifestIndexes.has(manifestIndex))
      throw new Error('Saved manifest semantic piece matching attempted to reuse one piece.');
    usedManifestIndexes.add(manifestIndex);
    indexes.push(manifestIndex);
  }
  if (usedManifestIndexes.size !== manifest.pieces.length || indexes.length !== pieces.length)
    throw new Error('Saved manifest and reconstructed semantic pieces are not one-to-one.');
  return indexes;
}

export function buildPatternImportDxfExactManifestPieceOverridesV1(
  semantics: Pick<StageIO['semantics']['out'], 'pieces'>,
  manifest: Pick<ConversionManifest, 'pieces'>,
): StageIO['semantics']['in']['pieceOverrides'] {
  const manifestIndexes = exactManifestPieceIndexes(semantics.pieces, manifest);
  const overrides: StageIO['semantics']['in']['pieceOverrides'] = {};
  semantics.pieces.forEach((piece, pieceIndex) => {
    if (Object.prototype.hasOwnProperty.call(overrides, piece.seed))
      throw new Error('Reconstructed semantic pieces contain a duplicate seed.');
    const manifestIndex = manifestIndexes[pieceIndex];
    const saved = manifest.pieces[manifestIndex];
    overrides[piece.seed] = {
      allowance: buildPatternImportDxfSavedManifestAllowanceV1({
        cutLayerIsFinal: true,
        allowanceMm: saved.allowanceMm,
      }),
      code: saved.code,
      mods: [...saved.mods],
      displayName: saved.displayName,
      nameOrigin: saved.nameOrigin,
      ...(saved.aiConfidence == null ? {} : { aiConfidence: saved.aiConfidence }),
      pairHand: saved.pairHand,
      unfoldedFold: saved.unfoldedFold,
      piecesPerGarment: saved.piecesPerGarment,
      fused: saved.fused,
      ungraded: saved.ungraded,
    };
  });
  return overrides;
}

function restoreExactSavedWriterPieces(
  pieces: readonly PieceSpec[],
  manifest: Pick<ConversionManifest, 'pieces' | 'blocks'>,
): PieceSpec[] {
  const manifestIndexes = exactManifestPieceIndexes(pieces, manifest);
  const usedBlockIndexes = new Set<number>();
  const restored = pieces.map((piece, pieceIndex) => {
    const saved = manifest.pieces[manifestIndexes[pieceIndex]];
    return {
      ...piece,
      // Restore the authoritative written outline semantics from the embedded manifest. The
      // disposable read may measure a different cut/seam gap after round-tripping the DXF, but
      // writer replay must reproduce the saved row byte-for-byte rather than re-decide allowance.
      allowance: buildPatternImportDxfSavedManifestAllowanceV1({
        cutLayerIsFinal: true,
        allowanceMm: saved.allowanceMm,
      }),
      fabrics: [...saved.fabrics],
      sizes: piece.sizes.map((size) => {
        const blockIndexes = manifest.blocks.flatMap((block, blockIndex) =>
          block.identity === saved.identity &&
          block.sizeId === size.sizeId &&
          block.sizeToken === size.sizeToken
            ? [blockIndex]
            : [],
        );
        if (blockIndexes.length !== 1)
          throw new Error(
            `Saved manifest has no unique exact block for ${saved.identity} / ${size.sizeToken}.`,
          );
        const blockIndex = blockIndexes[0];
        if (usedBlockIndexes.has(blockIndex))
          throw new Error('Saved manifest writer replay attempted to reuse one block.');
        usedBlockIndexes.add(blockIndex);
        const block = manifest.blocks[blockIndex];
        if (block.hasGrain !== Boolean(size.grain) || Boolean(block.grain) !== Boolean(size.grain))
          throw new Error(
            `Saved manifest grain metadata no longer exact-matches ${saved.identity} / ${size.sizeToken}.`,
          );
        if (!size.grain || !block.grain) return size;
        return {
          ...size,
          grain: {
            ...size.grain,
            origin: block.grain.origin,
            evidence: [...block.grain.evidence],
          },
        };
      }),
    };
  });
  if (usedBlockIndexes.size !== manifest.blocks.length)
    throw new Error('Saved manifest and reconstructed writer blocks are not one-to-one.');
  return restored;
}

function semanticsInput(
  card: CardContext,
  scopeKey: string,
  pieceOverrides: StageIO['semantics']['in']['pieceOverrides'],
  manifest: ConversionManifest,
): StageIO['semantics']['in'] {
  return {
    fileAllowance: buildPatternImportDxfSavedManifestAllowanceV1(manifest),
    pieceOverrides,
    presegmentedIdentities: cardPresegmentedIdentities(card, scopeKey),
    operatorGrain: {},
    aiQuantity: {},
    operatorFold: {},
    foldListChecked: [],
  };
}

function assertExactSizeMap(sizes: StageIO['sizes']['out'], manifest: ConversionManifest): void {
  const mapped = sizes.map.entries.filter((entry) => entry.card);
  if (
    mapped.length !== sizes.map.entries.length ||
    mapped.length !== manifest.sizes.length ||
    mapped.some(
      (entry, index) =>
        entry.card?.sizeId !== manifest.sizes[index]?.sizeId ||
        entry.card?.token !== manifest.sizes[index]?.token ||
        entry.source.rank !== manifest.sizes[index]?.rank,
    )
  )
    throw new Error('Saved DXF size map no longer exact-matches the card and embedded manifest.');
}

/**
 * A re-import changes the worker's observed source to the generated DXF itself. Exact replay must
 * instead restore the source/audit fields and timestamp embedded in that DXF. The owner reruns this
 * patched writer job and accepts it only when its bytes equal the authoritative saved row.
 */
export function restorePatternImportDxfSavedWriterReplayV1(
  draft: CardDraft,
  manifest: ConversionManifest,
): CardDraft {
  if (draft.scopes.length !== 1 || !draft.scopes[0].writerReplay)
    throw new Error(
      `Saved DXF replay must produce exactly one writer-backed scope (scopes=${String(draft.scopes.length)}, writerReplay=${String(Boolean(draft.scopes[0]?.writerReplay))}).`,
    );
  const detached = structuredClone(draft);
  const scope = detached.scopes[0];
  const replay = scope.writerReplay;
  if (!replay) throw new Error('Saved DXF replay carrier is missing.');
  const job = replay.job;
  const restoredJob = {
    ...job,
    pieces: restoreExactSavedWriterPieces(job.pieces, manifest),
    generator: manifest.generator,
    source: structuredClone(manifest.source),
  };
  if (manifest.autopilot) restoredJob.autopilot = structuredClone(manifest.autopilot);
  else delete restoredJob.autopilot;
  if (manifest.passport) restoredJob.passport = structuredClone(manifest.passport);
  else delete restoredJob.passport;
  if (manifest.replay) restoredJob.replay = structuredClone(manifest.replay);
  else delete restoredJob.replay;
  scope.writerReplay = {
    ...replay,
    createdAt: manifest.createdAt,
    job: restoredJob,
  };
  return detached;
}

async function reprocessSavedDxf(
  deps: PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
  input: ReprocessInput,
  signal: AbortSignal,
  onProgress: Progress,
  clients: Set<ImportClient>,
): Promise<Readonly<{ row: DxfProductSavedRowIdentityV1; draft: CardDraft }>> {
  assertLive(signal);
  const bytes = exactArrayBuffer(input.bytes);
  const manifest = readManifestBytes(bytes);
  if (!manifest) throw new DxfProductSavedForeignDxfDetectedErrorV1();
  if (
    manifest.techCardId !== input.row.techCardId ||
    manifest.scope.fabricPurpose == null ||
    !manifest.createdAt ||
    manifest.generator.length === 0
  )
    throw new Error('The authoritative row is not a current GRBPWR product DXF.');
  const resolvedCard = await deps.resolveCard(input.row, signal);
  assertLive(signal);
  if (
    !resolvedCard ||
    !Number.isSafeInteger(resolvedCard.cardLockVersion) ||
    resolvedCard.cardLockVersion !== input.row.cardLockVersion ||
    !resolvedCard.card ||
    resolvedCard.card.techCardId !== input.row.techCardId
  )
    throw new Error('The current card projection does not match the saved-row card lock.');
  const card = resolvedCard.card;
  const target = card.scopes.find((scope) => scope.scopeKey === input.row.scopeKey);
  if (
    !target ||
    target.fabricPurpose !== manifest.scope.fabricPurpose ||
    target.bomLineKey !== manifest.scope.bomLineKey
  )
    throw new Error('The saved manifest fabric scope no longer exact-matches the card.');

  const client = deps.createClient?.() ?? new ImportWorkerClient();
  clients.add(client);
  let sessionId: number | null = null;
  const cancel = () => client.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    report(onProgress, 0, 13, 'opening saved DXF', 0, 1);
    const opened = await client.open([
      {
        name: input.syntheticFilename,
        bytes,
        dxfPathProvenance: { sourceFileId: input.sourceFileId },
      },
    ]);
    sessionId = opened.sessionId;
    assertLive(signal);

    const run = async <S extends keyof StageIO>(
      stage: S,
      stageInput: StageIO[S]['in'],
      step: number,
      note: string,
    ): Promise<StageIO[S]['out']> => {
      report(onProgress, step, 13, note, 0, 1);
      const output = await client.run(sessionId!, stage, stageInput, (progress) =>
        report(onProgress, step, 13, progress.note ?? note, progress.done, progress.total),
      );
      assertLive(signal);
      report(onProgress, step, 13, note);
      return output;
    };

    const extracted = await run(
      'extract',
      { opts: { sagittaMm: PATIMPORT.sagittaMm, keepFills: true } },
      1,
      'reading saved DXF',
    );
    if (!extracted.presegmented)
      throw new Error('Saved-row reconstruction accepts only a direct presegmented DXF.');
    const cleaned = await run('clean', { edits: [] }, 2, 'checking DXF layers');
    const scale = bestCertainScale(cleaned.scale);
    await run(
      'scale',
      { decision: { factor: scale.factor, method: scale.method, operatorConfirmed: false } },
      3,
      'binding declared scale',
    );
    await run('assemble', { sheet: 0 }, 4, 'reading DXF geometry');
    await run(
      'chains',
      {
        opts: {
          joinGapMm: PATIMPORT.joinGapMm,
          joinAngleDeg: PATIMPORT.joinAngleDeg,
          joinLateralMm: PATIMPORT.joinLateralMm,
        },
      },
      5,
      'reading contour chains',
    );
    const sizes = await run('sizes', { card: card.sizes }, 6, 'binding card sizes');
    assertExactSizeMap(sizes, manifest);
    const pieces = await run(
      'pieces',
      {
        edits: [],
        sheetAnswers: {},
        opts: {
          cellMm: PATIMPORT.fillCellMm,
          snapMm: PATIMPORT.snapMm,
          variant: null,
          ...(sizes.expected ? { expectedSizes: sizes.expected } : {}),
        },
      },
      7,
      'reconstructing product pieces',
    );
    if (pieces.variants && pieces.variants.length > 1)
      throw new Error('Saved DXF contains an unresolved multi-model choice.');

    const initialSemantics = await run(
      'semantics',
      semanticsInput(card, input.row.scopeKey, {}, manifest),
      8,
      'reading product semantics',
    );
    const overrides = buildPatternImportDxfExactManifestPieceOverridesV1(
      initialSemantics,
      manifest,
    );
    let semantics = await run(
      'semantics',
      semanticsInput(card, input.row.scopeKey, overrides, manifest),
      9,
      'restoring saved piece semantics',
    );
    if (semantics.blocked.length || semantics.foldList)
      throw new Error('Saved product semantics still require an operator decision.');

    const proposed = await run('fabrics', { bom: [target] }, 10, 'binding the saved fabric scope');
    const assignment = pinToScope(
      proposed,
      input.row.scopeKey,
      semantics.pieces.map((piece) => piece.seed),
      [target],
    );
    semantics = await run(
      'semantics',
      semanticsInput(card, input.row.scopeKey, overrides, manifest),
      11,
      'sealing saved piece semantics',
    );
    if (semantics.blocked.length || semantics.foldList)
      throw new Error('Saved product semantics became incomplete after fabric binding.');

    const dxfProvenance = (await run(
      'dxf-provenance',
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      11,
      'building exact path provenance',
    )) as DxfPipelineProvenanceStageOutputV1;
    const dxfPhaseDReplay = (await run(
      'dxf-phase-d-replay',
      { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
      11,
      'building exact topology replay',
    )) as DxfProductPhaseDReplayStageOutputV1;
    const written = await run(
      'write',
      {
        techCardId: input.row.techCardId,
        scopes: [target],
        assignment,
        sizes: structuredClone(manifest.sizes),
        dialect: 'r12',
        generator: manifest.generator,
        ...(manifest.autopilot ? { autopilot: structuredClone(manifest.autopilot) } : {}),
        ...(manifest.replay ? { replay: structuredClone(manifest.replay) } : {}),
      },
      12,
      'replaying product writer',
    );
    const draft = cardBuildDraft(written, {
      card,
      semantics,
      dxfProvenance,
      dxfPhaseDReplay,
    });
    return Object.freeze({
      row: Object.freeze({ ...input.row }),
      draft: restorePatternImportDxfSavedWriterReplayV1(draft, manifest),
    });
  } finally {
    signal.removeEventListener('abort', cancel);
    if (sessionId != null) {
      try {
        await client.close(sessionId);
      } catch {
        // The disposable worker may already have been terminated by cancellation.
      }
    }
    try {
      client.dispose?.();
    } finally {
      clients.delete(client);
    }
  }
}

/**
 * Production host for the existing saved-row owner. It contains no card fallback: every metadata
 * read is the injected transactional snapshot capability and every byte read uses that snapshot's
 * server-minted download URL.
 */
export function createPatternImportDxfPhaseESavedDxfReprocessHostV1(
  deps: PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
): DxfProductSavedReprocessHostV1 &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_V1;
    claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1;
    dispose: () => void;
  }> {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const configuredServerUrl = (deps.serverUrl ?? import.meta.env.VITE_SERVER_URL ?? '').trim();
  const apiProxyTarget = (deps.apiProxyTarget ?? import.meta.env.VITE_API_BASE_URL ?? '').trim();
  const browserOrigin = (
    deps.browserOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  ).trim();
  const backendServerUrl = configuredServerUrl || apiProxyTarget || browserOrigin;
  const localBackendProxyEnabled = !configuredServerUrl && Boolean(apiProxyTarget && browserOrigin);
  const transportServerUrl = localBackendProxyEnabled ? browserOrigin : backendServerUrl;
  const mediaProxyUrl = (
    deps.mediaProxyUrl ??
    (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined) ??
    (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy')
  ).trim();
  const readAuthToken = deps.readAuthToken ?? readBrowserAuthToken;
  if (
    typeof deps.readAuthoritativeRow !== 'function' ||
    typeof deps.resolveCard !== 'function' ||
    typeof fetcher !== 'function'
  )
    throw new TypeError(
      'Transactional row read, lock-bound card projection and byte fetch capabilities are required.',
    );
  let disposed = false;
  const clients = new Set<ImportClient>();

  const read = async (expected: DxfProductSavedRowIdentityV1, signal: AbortSignal) => {
    if (disposed) throw new Error('Saved DXF reprocess host is disposed.');
    assertLive(signal);
    const authority = await deps.readAuthoritativeRow(expected, signal);
    assertLive(signal);
    if (!authority || !sameRow(authority.row, expected) || !validDownloadUrl(authority.downloadUrl))
      throw new Error('Transactional saved-row authority moved or has no download URL.');
    return authority;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1,
    crypto: deps.crypto,
    async readAuthoritativeRow(expected, signal, onProgress) {
      const authority = await read(expected, signal);
      onProgress(0, 1, 'downloading authoritative saved DXF');
      const resolvedUrl = resolvePatternImportDxfPhaseESavedDownloadUrlV1(
        authority.downloadUrl,
        backendServerUrl,
      );
      const transportUrl = localBackendProxyEnabled
        ? rebaseBackendUrlToSameOriginProxy(resolvedUrl, apiProxyTarget, browserOrigin)
        : resolvedUrl;
      const byteTarget = await resolveSavedDxfByteUrl(
        fetcher,
        transportUrl,
        transportServerUrl,
        readAuthToken,
        signal,
      );
      const headers = byteTarget.usedCapabilityHop
        ? undefined
        : backendDownloadAuthHeaders(byteTarget.url, transportServerUrl, readAuthToken);
      const response = await fetchSavedDxfBytes(
        fetcher,
        byteTarget.url,
        {
          method: 'GET',
          credentials: byteTarget.usedCapabilityHop ? 'omit' : 'same-origin',
          ...(headers ? { headers } : {}),
          signal,
        },
        mediaProxyUrl,
        signal,
      );
      if (!response.ok) throw new Error(`Saved DXF download failed with HTTP ${response.status}.`);
      const declaredLength = response.headers.get('content-length');
      if (
        declaredLength &&
        Number.isSafeInteger(Number(declaredLength)) &&
        Number(declaredLength) !== expected.sizeBytes
      )
        throw new Error('Saved DXF response length differs from the transactional row.');
      let bytes: Uint8Array | null = null;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
        assertLive(signal);
        if (bytes.byteLength !== expected.sizeBytes)
          throw new Error('Saved DXF byte length differs from the transactional row.');
        onProgress(1, 1, 'downloaded authoritative saved DXF');
        const owned = bytes;
        bytes = null;
        return Object.freeze({ row: authority.row, bytes: owned });
      } finally {
        bytes?.fill(0);
      }
    },
    reprocess: (input, signal, onProgress) =>
      reprocessSavedDxf(deps, input, signal, onProgress, clients),
    async readCurrentRowIdentity(expected, signal) {
      return (await read(expected, signal)).row;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const client of clients) {
        try {
          client.cancel();
          client.dispose?.();
        } catch {
          // Terminal best-effort cleanup.
        }
      }
      clients.clear();
    },
  });
}
