import { adminService } from 'api/api';
import type { AdminService, common_TechCard } from 'api/proto-http/admin';
import { replayCommittedPatternImportDxfProductScopeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import { readGradeMapBlock } from 'lib/pattern-import/manifest/grade-map-block';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { expect, it, vi } from 'vitest';
import { createCardApply } from './card-apply';
import { DirectClient, draftThroughWizardStages } from './ordinary-dxf-wizard.test-fixture';
import { createPatternsConfirmedSessionLifecycleV1 } from './patterns-confirmed-session-lifecycle-v1';
import { readPatternImportDxfPhaseECardSessionV1 } from './phase-e-workbench-card-session-v1';
import { preparePatternImportDxfPhaseECadTableZeroOperationFreshV1 } from './phase-e-workbench-v2/cad-table-zero-operation-fresh-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './phase-e-workbench-v2/cad-table-zero-operation-generation-owner-v1';
import { preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1 } from './phase-e-workbench-v2/cad-table-zero-operation-production-mount-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from './phase-e-workbench-v2/zero-operation-saved-card-authority-v1';
import { verifyLinkedN1FromGenuineImportFixture } from './phase-e-workbench-v2/cad-table-existing-linked-n1-finalize-v1.test-fixture';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './phase-e-workbench-v2/saved-card-production-projection-v1';
import {
  createSavedThreePanelFixtureV1,
  digestFullAssemblyFixture,
} from './phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';

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
        if (tokens.length > 1) {
          size.internal.push({
            kind: 'internal',
            pts: [
              { x: left + 15, y: bottom + 15 },
              { x: left + 25, y: bottom + 16 },
            ],
            closed: false,
            origin: 'operator',
            ranges: [],
            confidence: 1,
          });
        }
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
    let areaFollowUpLanded = false;
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(downloadUrl);
      if (tokens.length > 1 && !areaFollowUpLanded) {
        areaFollowUpLanded = true;
        card.lockVersion!++;
      }
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
      if (tokens.length > 1) {
        const internal = session!.draft.scopes[0].writerReplay!.job.pieces[0].sizes[0].internal;
        expect(
          internal.some((mark) => Object.hasOwn(mark, 'label') && mark.label === undefined),
        ).toBe(true);
      }
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
      expect(fetcher).toHaveBeenCalledTimes(tokens.length > 1 ? 2 : 1);
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
      const fresh = await preparePatternImportDxfPhaseECadTableZeroOperationFreshV1({
        cardSession: session,
        expectedImportGeneration: session!.importGeneration,
        scopeKey: 'main',
        sizeToken: 'M',
      });
      expect(fresh.ok, fresh.blocker?.detail).toBe(true);
      const orderSizeIds = (ids: number[]) => ids;
      const sizeNameById = new Map(sizes.map(({ sizeId, name }) => [sizeId, name]));
      const savedAuthority = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds,
        sizeNameById,
        readTechCard: async () => (await service.GetTechCard()).techCard,
      });
      const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
      const selectGeometry = () =>
        preparePatternImportDxfPhaseECadTableZeroOperationSavedFailoverV1({
          fresh,
          expectedCommit: session!.confirmedApply.commitReceipt,
          loadDocumentEvidence: session!.loadDocumentEvidence,
          savedAuthority,
          orderSizeIds,
          sizeNameById,
          scopeKey: 'main',
          sizeToken: 'M',
          generation: generationOwner.beginFresh(
            'fresh-through-confirmed-save',
            session!.importGeneration,
          ),
          signal: new AbortController().signal,
        });
      try {
        const exact = await selectGeometry();
        expect(exact?.resolvedSource, exact?.result.blocker?.detail).toBe('fresh');
        const originalVersion = saved.version!;
        saved.version = originalVersion + 1;
        card.lockVersion!++;
        const replaced = await selectGeometry();
        expect(replaced?.resolvedSource, replaced?.result.blocker?.detail).toBe('saved');
        expect(replaced?.result.ok).toBe(true);
        saved.version = originalVersion;
        card.lockVersion!++;
      } finally {
        generationOwner.dispose();
      }
      await verifyLinkedN1FromGenuineImportFixture(
        card,
        session!,
        service,
        async () => {
          saved.fabricPurpose = 'TECH_CARD_BOM_PURPOSE_LINING';
          expect(await session!.loadDocumentEvidence('main')).toMatchObject({ ok: false });
          saved.fabricPurpose = fabricPurpose;
          lifecycle.dispose();
        },
        new Map(sizes.map(({ sizeId, name }) => [sizeId, name])),
      );
    } finally {
      lifecycle.dispose();
      upload.mockRestore();
      vi.unstubAllGlobals();
    }
  },
  120000,
);
