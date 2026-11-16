import {
  DXF_PIPELINE_PROVENANCE_REQUEST_V1,
  type DxfPipelineProvenanceStageOutputV1,
} from 'lib/pattern-import/dxf-pipeline-provenance-v1';
import {
  DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1,
  type DxfProductPhaseDReplayStageOutputV1,
} from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import type { DxfProductSavedForeignReprocessHostV1 } from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { pinToScope, planScopes } from 'lib/pattern-import/fabrics/scope';
import { readManifestBytes } from 'lib/pattern-import/manifest';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  PATIMPORT,
  type CardDraft,
  type StageIO,
} from 'lib/pattern-import/types';
import { ImportWorkerClient } from 'lib/pattern-import/worker/client';

import { cardBuildDraft } from '../card-apply';
import type { CardContext, ImportClient } from '../client';
import { cardPresegmentedIdentities } from '../entry';
import { buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1 } from './foreign-saved-dxf-alias-identity-adapter-v1';
import {
  createPatternImportDxfPhaseESavedDxfReprocessHostV1,
  type PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
} from './saved-dxf-reprocess-host-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_V1 =
  'pattern-import-dxf-phase-e-foreign-saved-dxf-reprocess-host/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1 = Object.freeze({
  verifiedTransportReused: true,
  grbpwrManifestRefused: true,
  currentCardProjectionLockBound: true,
  directPresegmentedDxfOnly: true,
  exactScopeAliasToPieceBindingRequired: true,
  fuzzyNameBindingAllowed: false,
  nearestGeometryBindingAllowed: false,
  sourcePathProvenanceRequired: true,
  publicPhaseDCarrierRequired: true,
  detachedPhaseDReplayCarrierRequired: true,
  canonicalWriterOutputCreated: true,
  canonicalWriterBytesClaimedEqualToForeignSource: false,
  rawDxfReturned: false,
  productionReady: false,
} as const);

type ReprocessInput = Parameters<DxfProductSavedForeignReprocessHostV1['reprocess']>[0];
type Progress = Parameters<DxfProductSavedForeignReprocessHostV1['reprocess']>[2];

function assertLive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Foreign DXF reprocess was cancelled.', 'AbortError');
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    !(bytes.buffer instanceof ArrayBuffer) ||
    bytes.byteOffset !== 0 ||
    bytes.byteLength !== bytes.buffer.byteLength
  )
    throw new Error('Disposable foreign-DXF bytes must own one exact transferable ArrayBuffer.');
  return bytes.buffer;
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
  const candidate = [...scale].sort((left, right) => right.confidence - left.confidence)[0];
  if (
    !candidate ||
    candidate.confidence < 0.9 ||
    Math.abs(candidate.factor - 1) > PATIMPORT.scaleWarnRatio
  )
    throw new Error('The foreign saved DXF has no certain declared 1:1 scale.');
  return candidate;
}

function semanticsInput(
  card: CardContext,
  scopeKey: string,
  pieceOverrides: StageIO['semantics']['in']['pieceOverrides'],
): StageIO['semantics']['in'] {
  return {
    fileAllowance: {
      meaning: 'seam',
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      origin: 'default',
      evidence: [],
    },
    pieceOverrides,
    presegmentedIdentities: cardPresegmentedIdentities(card, scopeKey),
    operatorGrain: {},
    aiQuantity: {},
    operatorFold: {},
    foldListChecked: [],
  };
}

function exactMappedSizes(sizes: StageIO['sizes']['out'], card: CardContext) {
  const mapped = sizes.map.entries.flatMap((entry) =>
    entry.card
      ? [
          {
            token: entry.card.token,
            sizeId: entry.card.sizeId,
            name: entry.card.name,
            sourceLabel: entry.source.label,
            rank: entry.source.rank,
          },
        ]
      : [],
  );
  if (
    mapped.length !== sizes.map.entries.length ||
    mapped.length !== card.sizes.length ||
    new Set(mapped.map(({ sizeId }) => sizeId)).size !== mapped.length
  )
    throw new Error('Foreign DXF sizes do not map one-to-one to the current card size run.');
  return mapped;
}

function bindCanonicalAliases(
  draft: CardDraft,
  target: CardContext['scopes'][number],
  bindings: readonly Readonly<{ writerIdentity: string; pieceLineKey: string }>[],
): CardDraft {
  const detached = structuredClone(draft);
  detached.aliases = bindings.map(({ writerIdentity, pieceLineKey }) => ({
    scopeKey: target.scopeKey,
    fabricPurpose: target.fabricPurpose,
    bomLineKey: target.bomLineKey,
    blockName: writerIdentity,
    pieceLineKey,
  }));
  return detached;
}

function attachCanonicalWriterReplay(
  written: StageIO['write']['out'],
  semantics: StageIO['semantics']['out'],
  assignment: StageIO['fabrics']['out'],
  target: CardContext['scopes'][number],
  sizes: ReturnType<typeof exactMappedSizes>,
  techCardId: number,
): StageIO['write']['out'] {
  if (written.scopes.length !== 1 || written.scopes[0].target.scopeKey !== target.scopeKey)
    throw new Error('Foreign canonical write did not produce the selected material scope.');
  const plan = planScopes(semantics.pieces, assignment, [target]);
  if (
    plan.problems.length ||
    plan.scopes.length !== 1 ||
    plan.scopes[0].target.scopeKey !== target.scopeKey
  )
    throw new Error('Foreign canonical writer replay could not reproduce the selected scope plan.');
  const scope = written.scopes[0];
  return {
    ...written,
    scopes: [
      {
        ...scope,
        writerReplay: {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
          job: {
            techCardId,
            scope: target,
            pieces: plan.scopes[0].specs,
            sizes,
            source: structuredClone(scope.manifest.source),
            generator: 'grbpwr-admin foreign saved DXF canonicalization',
            dialect: 'r12',
          },
          createdAt: scope.manifest.createdAt,
        },
      },
    ],
  };
}

async function reprocessForeignSavedDxf(
  deps: PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
  input: ReprocessInput,
  signal: AbortSignal,
  onProgress: Progress,
  clients: Set<ImportClient>,
): Promise<Readonly<{ row: DxfProductSavedRowIdentityV1; draft: CardDraft }>> {
  assertLive(signal);
  const bytes = exactArrayBuffer(input.bytes);
  if (readManifestBytes(bytes) !== null)
    throw new Error('A GRBPWR manifest-bearing DXF must use the exact saved-product owner.');
  const resolvedCard = await deps.resolveCard(input.row, signal);
  assertLive(signal);
  if (
    !resolvedCard ||
    resolvedCard.cardLockVersion !== input.row.cardLockVersion ||
    resolvedCard.card.techCardId !== input.row.techCardId
  )
    throw new Error('The current card projection does not match the saved-row card lock.');
  const card = resolvedCard.card;
  const targets = card.scopes.filter(({ scopeKey }) => scopeKey === input.row.scopeKey);
  if (targets.length !== 1)
    throw new Error('The foreign DXF row must resolve to one exact current material scope.');
  const target = targets[0];

  const client = deps.createClient?.() ?? new ImportWorkerClient();
  clients.add(client);
  let sessionId: number | null = null;
  const cancel = () => client.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    report(onProgress, 0, 13, 'opening foreign saved DXF', 0, 1);
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
      'reading foreign saved DXF',
    );
    if (!extracted.presegmented)
      throw new Error('Foreign saved-row reconstruction accepts only a presegmented direct DXF.');
    const cleaned = await run('clean', { edits: [] }, 2, 'checking foreign DXF layers');
    const scale = bestCertainScale(cleaned.scale);
    await run(
      'scale',
      { decision: { factor: scale.factor, method: scale.method, operatorConfirmed: false } },
      3,
      'binding declared scale',
    );
    await run('assemble', { sheet: 0 }, 4, 'reading foreign DXF geometry');
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
      'reading foreign contour chains',
    );
    const sizes = await run('sizes', { card: card.sizes }, 6, 'binding current card sizes');
    const manifestSizes = exactMappedSizes(sizes, card);
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
      'reading foreign piece families',
    );
    if (pieces.variants && pieces.variants.length > 1)
      throw new Error('Foreign saved DXF contains an unresolved multi-model choice.');
    const adapted = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      scopeKey: input.row.scopeKey,
      mappedSourceRanks: manifestSizes.map(({ rank }) => rank),
      families: pieces.families,
      aliases: card.existingAliases ?? [],
      pieces: card.existingPieces,
    });
    if (!adapted.ok) throw new Error(`${adapted.blocker.code}: ${adapted.blocker.detail}`);
    let semantics = await run(
      'semantics',
      semanticsInput(card, input.row.scopeKey, adapted.pieceOverrides),
      8,
      'binding foreign identities to current card pieces',
    );
    if (semantics.blocked.length || semantics.foldList)
      throw new Error('Foreign product semantics still require an operator decision.');
    const proposed = await run('fabrics', { bom: [target] }, 9, 'binding the material scope');
    const assignment = pinToScope(
      proposed,
      input.row.scopeKey,
      semantics.pieces.map(({ seed }) => seed),
      [target],
    );
    semantics = await run(
      'semantics',
      semanticsInput(card, input.row.scopeKey, adapted.pieceOverrides),
      10,
      'sealing foreign product semantics',
    );
    if (semantics.blocked.length || semantics.foldList)
      throw new Error('Foreign product semantics became incomplete after scope binding.');
    const dxfProvenance = (await run(
      'dxf-provenance',
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      11,
      'building source path provenance',
    )) as DxfPipelineProvenanceStageOutputV1;
    const dxfPhaseDReplay = (await run(
      'dxf-phase-d-replay',
      { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
      11,
      'building exact topology replay',
    )) as DxfProductPhaseDReplayStageOutputV1;
    const written = attachCanonicalWriterReplay(
      await run(
        'write',
        {
          techCardId: input.row.techCardId,
          scopes: [target],
          assignment,
          sizes: manifestSizes,
          dialect: 'r12',
          generator: 'grbpwr-admin foreign saved DXF canonicalization',
        },
        12,
        'writing canonical product geometry',
      ),
      semantics,
      assignment,
      target,
      manifestSizes,
      input.row.techCardId,
    );
    const draft = bindCanonicalAliases(
      cardBuildDraft(written, { card, semantics, dxfProvenance, dxfPhaseDReplay }),
      target,
      adapted.bindings,
    );
    return Object.freeze({ row: Object.freeze({ ...input.row }), draft });
  } finally {
    signal.removeEventListener('abort', cancel);
    if (sessionId != null) {
      try {
        await client.close(sessionId);
      } catch {
        // Cancellation may already have terminated the disposable worker.
      }
    }
    try {
      client.dispose?.();
    } finally {
      clients.delete(client);
    }
  }
}

/** Uses the exact saved-row transport and substitutes only the disposable foreign-DXF pipeline. */
export function createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1(
  deps: PatternImportDxfPhaseESavedDxfReprocessHostDepsV1,
): DxfProductSavedForeignReprocessHostV1 &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_V1;
    claims: typeof PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1;
    dispose: () => void;
  }> {
  const transport = createPatternImportDxfPhaseESavedDxfReprocessHostV1(deps);
  const clients = new Set<ImportClient>();
  let disposed = false;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_DXF_REPROCESS_HOST_CLAIMS_V1,
    crypto: deps.crypto,
    readAuthoritativeRow: transport.readAuthoritativeRow,
    readCurrentRowIdentity: transport.readCurrentRowIdentity,
    async reprocess(input, signal, onProgress) {
      if (disposed) throw new Error('Foreign saved-DXF reprocess host is disposed.');
      return reprocessForeignSavedDxf(deps, input, signal, onProgress, clients);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const client of clients) client.dispose?.();
      clients.clear();
      transport.dispose();
    },
  });
}
