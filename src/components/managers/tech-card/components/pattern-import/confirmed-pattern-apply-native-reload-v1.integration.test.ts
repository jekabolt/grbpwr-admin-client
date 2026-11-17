import { adminService } from 'api/api';
import type { AdminService, common_TechCard } from 'api/proto-http/admin';
import { replayCommittedPatternImportDxfProductScopeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import { pinToScope } from 'lib/pattern-import/fabrics/scope';
import { readGradeMapBlock } from 'lib/pattern-import/manifest/grade-map-block';
import {
  PATIMPORT,
  type PatternImportOpenFile,
  type StageIO,
  type StageName,
} from 'lib/pattern-import/types';
import { Session } from 'lib/pattern-import/worker/session';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { expect, it, vi } from 'vitest';
import { cardBuildDraft, createCardApply } from './card-apply';
import type { CardContext, ImportClient } from './client';
import {
  captureDirectDxfAuthoringV1,
  directDxfAuthoringOpenFileV1,
} from './direct-dxf-authoring-capture-v1';
import { cardPresegmentedIdentities } from './entry';
import { createPatternsConfirmedSessionLifecycleV1 } from './patterns-confirmed-session-lifecycle-v1';
import { readPatternImportDxfPhaseECardSessionV1 } from './phase-e-workbench-card-session-v1';
import { verifyLinkedN1FromGenuineImportFixture } from './phase-e-workbench-v2/cad-table-existing-linked-n1-finalize-v1.test-fixture';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './phase-e-workbench-v2/saved-card-production-projection-v1';
import {
  createSavedThreePanelFixtureV1,
  digestFullAssemblyFixture,
} from './phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';

class DirectClient implements ImportClient {
  readonly kind = 'worker' as const;
  private next = 1;
  private sessions = new Map<number, Session>();
  private cancelled = false;

  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const session = new Session(sessionId, files);
    this.sessions.set(sessionId, session);
    return { sessionId, files: session.files };
  }

  async run<S extends StageName>(sessionId: number, stage: S, input: StageIO[S]['in']) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Missing in-process worker session.');
    return session.runStage(stage, input, {
      checkCancel: () => {
        if (this.cancelled) throw new DOMException('Cancelled', 'AbortError');
      },
      progress() {},
    });
  }

  cancel() {
    this.cancelled = true;
  }

  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }

  dispose() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

vi.mock('./phase-e-workbench-v2/saved-dxf-reprocess-host-v1', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./phase-e-workbench-v2/saved-dxf-reprocess-host-v1')>();
  return {
    ...original,
    createPatternImportDxfPhaseESavedDxfReprocessHostV1: (
      deps: Parameters<typeof original.createPatternImportDxfPhaseESavedDxfReprocessHostV1>[0],
    ) =>
      original.createPatternImportDxfPhaseESavedDxfReprocessHostV1({
        ...deps,
        createClient: () => new DirectClient(),
      }),
  };
});

async function draftThroughWizardStages(file: File, card: CardContext) {
  const client = new DirectClient();
  const { sessionId } = await client.open([await directDxfAuthoringOpenFileV1(file, 0)]);
  const run = <S extends StageName>(stage: S, input: StageIO[S]['in']) =>
    client.run(sessionId, stage, input);
  try {
    await run('extract', { opts: { sagittaMm: PATIMPORT.sagittaMm, keepFills: true } });
    await run('clean', { edits: [] });
    await run('scale', { decision: { factor: 1, method: 'manual', operatorConfirmed: true } });
    await run('assemble', { sheet: 0 });
    await run('chains', {
      opts: {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
    });
    const sizes = await run('sizes', { card: card.sizes });
    await run('pieces', {
      edits: [],
      sheetAnswers: {},
      opts: {
        cellMm: PATIMPORT.fillCellMm,
        snapMm: PATIMPORT.snapMm,
        variant: null,
        ...(sizes.expected ? { expectedSizes: sizes.expected } : {}),
      },
    });
    const semanticsInput: StageIO['semantics']['in'] = {
      fileAllowance: { meaning: 'cut', allowanceMm: 10, origin: 'operator', evidence: [] },
      pieceOverrides: {},
      presegmentedIdentities: cardPresegmentedIdentities(card, 'main'),
      operatorGrain: {},
    };
    const initial = await run('semantics', semanticsInput);
    const assignment = pinToScope(
      await run('fabrics', { bom: card.scopes }),
      'main',
      initial.pieces.map(({ seed }) => seed),
      card.scopes,
    );
    const semantics = await run('semantics', semanticsInput);
    expect(semantics.blocked).toEqual([]);
    const capture = await captureDirectDxfAuthoringV1([file], run);
    expect(capture.dxfNativeSewingReplay?.replayReady).toBe(true);
    const written = await run('write', {
      techCardId: card.techCardId,
      scopes: card.scopes,
      assignment,
      sizes: sizes.map.entries.flatMap(({ source, card }) =>
        card
          ? [
              {
                token: card.token,
                sizeId: card.sizeId,
                name: card.name,
                sourceLabel: source.label,
                rank: source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'grbpwr-admin pattern-import (worker)',
    });
    return cardBuildDraft(written, { card, semantics, ...capture });
  } finally {
    client.dispose();
  }
}

it.each([[['M']], [['XS', 'S', 'M', 'L', 'XL']]])(
  'replays genuine wizard apply bytes and receipt for sizes %j through the saved-row session',
  async (tokens) => {
    const fixture = await createSavedThreePanelFixtureV1(2);
    const sizes = tokens.map((token, rank) => ({
      sizeId: tokens.length === 1 ? 7 : rank + 5,
      rank,
      token,
      name: token,
      sourceLabel: token,
    }));
    const live: LiveCard = {
      patterns: [],
      pieces: fixture.card.existingPieces,
      aliases: [],
    };
    const fabricPurpose = 'TECH_CARD_BOM_PURPOSE_MAIN';
    const bomLineKey = 'bom-main';
    const card = {
      id: fixture.row.techCardId,
      lockVersion: fixture.row.cardLockVersion,
      techCard: {
        bomItems: [
          { lineKey: bomLineKey, section: 'TECH_CARD_BOM_SECTION_FABRIC', purpose: fabricPurpose },
        ],
        sizeIds: sizes.map(({ sizeId }) => sizeId),
        pieces: live.pieces,
        patterns: [],
      },
    } as unknown as common_TechCard;
    const buildCardContext = (current: common_TechCard) =>
      buildPatternImportDxfPhaseESavedCardContextV1(
        current,
        (sizes) => sizes,
        new Map(sizes.map(({ sizeId, name }) => [sizeId, name])),
      );
    const context = buildCardContext(card);
    const job = structuredClone(fixture.job);
    job.scope = { ...job.scope, fabricPurpose, bomLineKey };
    job.sizes = sizes;
    for (const piece of job.pieces) {
      const source = piece.sizes[0];
      const leftX = Math.min(...source.cut.map(({ x }) => x));
      piece.sizes = sizes.map(({ rank, token, sizeId }) => ({
        ...structuredClone(source),
        rank,
        sizeToken: token,
        sizeId,
        cut: source.cut.map(({ x, y }) => ({
          x: x + (x > leftX ? rank * 4 : 0),
          y: y + (y > 0 ? rank * 4 : 0),
        })),
      }));
      piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
      for (const size of piece.sizes) {
        const [left, right, bottom, top] = [
          Math.min(...size.cut.map(({ x }) => x)) + 10,
          Math.max(...size.cut.map(({ x }) => x)) - 10,
          Math.min(...size.cut.map(({ y }) => y)) + 10,
          Math.max(...size.cut.map(({ y }) => y)) - 10,
        ];
        size.seam = [
          { x: left, y: bottom },
          { x: right, y: bottom },
          { x: right, y: top },
          { x: left, y: top },
        ];
      }
    }
    const input = new File([writeDxfDetailed(job, { embed: null }).dxfText], 'original.dxf');
    const originalSha = await digestFullAssemblyFixture(new Uint8Array(await input.arrayBuffer()));
    const draft = await draftThroughWizardStages(input, context);
    expect(draft.dxfNativeSewingReplay?.pipeline?.contentBinding?.sourceSha256).toBe(originalSha);

    const downloadUrl = 'https://saved-full-assembly.invalid/current-download.dxf';
    let bytes = new Uint8Array();
    const upload = vi
      .spyOn(adminService, 'UploadPattern')
      .mockImplementation(async ({ raw, filename }) => {
        bytes = Uint8Array.from(atob(raw ?? ''), (value) => value.charCodeAt(0));
        return { url: fixture.row.url, filename, sizeBytes: bytes.length };
      });
    const service = {
      GetTechCard: vi.fn(async () => ({ techCard: structuredClone(card), patternViewerToken: '' })),
      GetTechCardPatternSemanticSidecar: vi.fn<AdminService['GetTechCardPatternSemanticSidecar']>(
        async () => ({ semanticSidecar: undefined }),
      ),
      PutTechCardPatternSemanticSidecar: vi.fn<AdminService['PutTechCardPatternSemanticSidecar']>(
        async () => ({ semanticSidecar: undefined }),
      ),
    };
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(downloadUrl);
      return new Response(bytes.slice(), { headers: { 'content-length': String(bytes.length) } });
    });
    vi.stubGlobal('fetch', fetcher);
    const lifecycle = createPatternsConfirmedSessionLifecycleV1({
      techCardId: fixture.row.techCardId,
      service,
      readCard: async () => (await service.GetTechCard()).techCard,
      buildCardContext,
    });
    let commitReceipt: string | undefined;
    const onError = vi.fn();
    const applyToCard = createCardApply({
      read: () => live,
      write: (path, value) => {
        if (!Array.isArray(value)) throw new Error('Expected form rows');
        if (path === 'patterns') live.patterns = value;
        else if (path === 'pieces') live.pieces = value;
        else if (path === 'pieceDxfAliases') live.aliases = value;
        else throw new Error(`Unexpected form write ${path}`);
      },
      scopeOf: (row) =>
        row.fabricPurpose === fabricPurpose && row.bomLineKey === bomLineKey ? 'main' : '',
      storageSizeId: 7,
      readPreviousLockVersion: () => card.lockVersion!,
      save: async () => {
        card.lockVersion!++;
        Object.assign(card.techCard!, {
          patterns: live.patterns.map((row) => ({
            ...row,
            downloadUrl,
            savedRowRevision: fixture.row.revision + 1,
            version: 2,
          })),
          pieces: live.pieces,
          pieceDxfAliases: { items: live.aliases },
        });
        return 'ok';
      },
      afterConfirmedPatternImportSave: async (draft, apply) => {
        commitReceipt = JSON.stringify(apply.commitReceipt);
        await lifecycle.afterConfirmedSave(draft, apply, 'main');
      },
      onPatternSemanticAttachmentHostError: onError,
    });

    try {
      const applied = await applyToCard(draft);
      expect(applied.ok, JSON.stringify(applied)).toBe(true);
      expect(onError.mock.calls.map(([error]) => String(error))).toEqual([]);
      const session = readPatternImportDxfPhaseECardSessionV1(fixture.row.techCardId);
      expect(session).not.toBeNull();
      expect(JSON.stringify(session!.confirmedApply.commitReceipt)).toBe(commitReceipt);
      expect(session!.draft.scopes.every(({ dxfText }) => dxfText === '')).toBe(true);
      const proof = await replayCommittedPatternImportDxfProductScopeV1(
        session!.draft,
        session!.confirmedApply,
        'main',
      );
      expect(proof.ok, JSON.stringify(proof)).toBe(true);
      const saved = card.techCard!.patterns![0];
      const savedSha = await digestFullAssemblyFixture(bytes);
      expect(proof.evidence?.productExportSha256).toBe(savedSha);
      expect(session!.draft.dxfNativeSewingReplay?.replayReady).toBe(true);
      expect(session!.draft.dxfNativeSewingReplay?.pipeline?.contentBinding?.sourceSha256).toBe(
        savedSha,
      );
      expect(savedSha).toBe(saved.sha256);
      expect(session!.draft.scopes[0].manifest.sizes.map(({ token }) => token)).toEqual(tokens);
      expect(readGradeMapBlock(new TextDecoder().decode(bytes)).status).toBe(
        tokens.length > 1 ? 'ok' : 'absent',
      );
      expect(savedSha).not.toBe(originalSha);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(service.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
      card.lockVersion!++;
      expect(await session!.loadDocumentEvidence('main')).toMatchObject({
        ok: true,
        evidence: {
          patternLineKey: saved.lineKey,
          cardLockVersion: card.lockVersion,
          patternVersion: saved.version,
          dxfSha256: savedSha,
        },
      });
      await verifyLinkedN1FromGenuineImportFixture(card, session!, service);
      saved.fabricPurpose = 'TECH_CARD_BOM_PURPOSE_LINING';
      expect(await session!.loadDocumentEvidence('main')).toMatchObject({ ok: false });
    } finally {
      lifecycle.dispose();
      upload.mockRestore();
      vi.unstubAllGlobals();
    }
  },
  120000,
);
