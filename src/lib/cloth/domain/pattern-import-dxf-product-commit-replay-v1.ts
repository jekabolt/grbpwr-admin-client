import type { ApplyResult, CardDraft } from '../../pattern-import/types';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
  replayPatternImportDxfProductWriterV1,
} from './pattern-import-dxf-product-writer-replay-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_V1 =
  'pattern-import-dxf-product-commit-replay/1' as const;

export type PatternImportDxfProductCommitReplayBlockerV1 = Readonly<{
  code:
    | 'apply-not-committed'
    | 'scope-missing-or-ambiguous'
    | 'upload-missing-or-ambiguous'
    | 'writer-replay-carrier-missing'
    | 'commit-upload-drift'
    | 'writer-replay-blocked';
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_CLAIMS_V1 = Object.freeze({
  exactApplyCommitReceiptConsumed: true,
  exactUploadedShaConsumed: true,
  productWriterReplayCarrierConsumed: true,
  completeProductBytesRebuilt: true,
  g4f1MappingBound: false,
  postSaveGetTechCardInvoked: false,
  sidecarPersisted: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  exactApplyCommitReceiptConsumed: false as const,
  exactUploadedShaConsumed: false as const,
  productWriterReplayCarrierConsumed: false as const,
  completeProductBytesRebuilt: false as const,
  g4f1MappingBound: false as const,
  postSaveGetTechCardInvoked: false as const,
  sidecarPersisted: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductCommitReplayResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_V1;
      evidence: Readonly<{
        techCardId: number;
        previousLockVersion: number;
        scopeKey: string;
        patternLineKey: string;
        patternUrl: string;
        patternSizeId: number;
        productExportSha256: string;
        byteLength: number;
        pieceLineKeys: readonly string[];
        aliases: readonly Readonly<{
          scopeKey: string;
          blockName: string;
          pieceLineKey: string;
        }>[];
        aliasCount: number;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_V1;
      evidence: null;
      blockers: readonly [PatternImportDxfProductCommitReplayBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

function blocked(
  code: PatternImportDxfProductCommitReplayBlockerV1['code'],
  detail: string,
): PatternImportDxfProductCommitReplayResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_V1,
    evidence: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      PatternImportDxfProductCommitReplayBlockerV1,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

/**
 * Consumes only data actually returned by the product apply. It does not read a card or persist a
 * sidecar; its purpose is to prove that the retained writer replay reconstructs the bytes whose SHA
 * the successful upload and exact commit receipt name.
 */
export async function replayCommittedPatternImportDxfProductScopeV1(
  draft: CardDraft,
  apply: ApplyResult,
  scopeKey: string,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCommitReplayResultV1> {
  if (!apply.ok || !apply.commitReceipt)
    return blocked('apply-not-committed', 'Apply has no confirmed exact commit receipt.');
  const draftScopes = draft.scopes.filter((scope) => scope.target.scopeKey === scopeKey);
  const committedScopes = apply.commitReceipt.scopes.filter((scope) => scope.scopeKey === scopeKey);
  if (draftScopes.length !== 1 || committedScopes.length !== 1)
    return blocked(
      'scope-missing-or-ambiguous',
      'Draft and commit receipt must each contain the scope exactly once.',
    );
  const uploads = apply.uploaded.filter((upload) => upload.scopeKey === scopeKey);
  const uploadSha256 = uploads[0]?.sha256;
  if (uploads.length !== 1 || !uploadSha256)
    return blocked(
      'upload-missing-or-ambiguous',
      'Committed scope must have one uploaded row with its locally computed SHA.',
    );
  const draftScope = draftScopes[0];
  const committed = committedScopes[0];
  const upload = uploads[0];
  if (!draftScope.writerReplay)
    return blocked(
      'writer-replay-carrier-missing',
      'Draft scope has no versioned product writer replay carrier.',
    );
  if (committed.patternUrl !== upload.url)
    return blocked(
      'commit-upload-drift',
      'Commit receipt URL does not equal the exact upload URL.',
    );

  const replayed = await replayPatternImportDxfProductWriterV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
      replay: draftScope.writerReplay,
      finalManifest: draftScope.manifest,
      expected: { scopeKey, exportSha256: uploadSha256 },
    },
    crypto,
  );
  if (!replayed.ok)
    return blocked(
      'writer-replay-blocked',
      replayed.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );

  return Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_V1,
    evidence: Object.freeze({
      techCardId: apply.commitReceipt.techCardId,
      previousLockVersion: apply.commitReceipt.previousLockVersion,
      scopeKey,
      patternLineKey: committed.patternLineKey,
      patternUrl: committed.patternUrl,
      patternSizeId: committed.patternSizeId,
      productExportSha256: replayed.receipt.exportSha256,
      byteLength: replayed.receipt.byteLength,
      pieceLineKeys: Object.freeze([...committed.pieceLineKeys]),
      aliases: Object.freeze(
        committed.aliases.map(({ scopeKey: aliasScope, blockName, pieceLineKey }) =>
          Object.freeze({ scopeKey: aliasScope, blockName, pieceLineKey }),
        ),
      ),
      aliasCount: committed.aliases.length,
    }),
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMMIT_REPLAY_CLAIMS_V1,
  });
}
