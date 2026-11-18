import { it, expect, vi } from 'vitest';
import { adminService } from 'api/api';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { readManifest } from 'lib/pattern-import/manifest';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import { nativePieceCopyVerifier } from 'lib/pattern-import/fabrics/native-piece-copy-review';
import { DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { createCardApply } from '../card-apply';
import { applyDirectDxfReviewedDraftV1 } from '../direct-dxf-authoring-capture-v1';
import { createPatternImportDxfPhaseEDraftCadSessionV1 } from './draft-cad-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import {
  prepareUnlinkedDraftPieceCopyV1,
  takeUnlinkedDraftPieceCopyReviewV1,
  acknowledgeUnlinkedDraftPieceCopyV1,
} from './draft-cad-unlinked-piece-copy-review-v1';

async function seedCopy(ranks = 1, hole = false) {
  const f = await createSavedThreePanelFixtureV1(2);
  const tokens = ranks === 1 ? ['M'] : ['S', 'M'];
  f.job.sizes = tokens.map((token, rank) => ({
    token,
    rank,
    sizeId: rank + 7,
    name: token,
    sourceLabel: token,
  }));
  f.card.sizes = f.job.sizes.map((s) => ({ ...s, spellings: [s.token] }));
  f.job.pieces.forEach((piece, index) => {
    const id = index ? 'BP' : 'FP';
    piece.identity = id;
    piece.code = id;
    piece.displayName = id;
    f.card.existingPieces[index]!.name = id;
    f.card.existingAliases![index]!.blockName = id;
    piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
    const base = piece.sizes[0]!,
      x = Math.min(...base.cut.map((p) => p.x)),
      y = Math.min(...base.cut.map((p) => p.y));
    piece.sizes = f.job.sizes.map(({ rank, token, sizeId }) => {
      const cut = base.cut.map((p) => ({
        x: p.x + (p.x > x ? rank * 4 : 0),
        y: p.y + (p.y > y ? rank * 4 : 0),
      }));
      return {
        ...structuredClone(base),
        rank,
        sizeToken: token,
        sizeId,
        cut,
        seam: cut.map((p) => ({
          x: p.x + (p.x === x ? 10 : -10),
          y: p.y + (p.y === y ? 10 : -10),
        })),
        drills: [
          {
            kind: 'drill',
            at: { x: x + 30, y: y + 31 + rank },
            origin: 'operator',
            confidence: 1,
            ranges: [],
          },
        ],
        ...(hole
          ? {
              cutLoops: [
                [
                  { x: x + 20, y: y + 20 },
                  { x: x + 20, y: y + 25 },
                  { x: x + 25, y: y + 25 },
                  { x: x + 25, y: y + 20 },
                ],
              ],
            }
          : {}),
      };
    });
  });
  f.written = writeDxfDetailed(f.job, { now: () => new Date('2026-11-17T00:00:00.000Z') });
  f.bytes = new TextEncoder().encode(f.written.dxfText);
  f.row = { ...f.row, sha256: await digestFullAssemblyFixture(f.bytes), sizeBytes: f.bytes.length };
  f.card.existingPatterns![0]!.manifest = f.written.manifest;
  return f;
}

async function chosen(ranks: number) {
  const f = await seedCopy(ranks);
  const ordinary = await draftThroughWizardStages(
    new File([f.written.dxfText], 'original.dxf'),
    f.card,
  );
  const canonical = ordinary.scopes[0]!;
  f.written = { ...f.written, dxfText: canonical.dxfText, manifest: canonical.manifest };
  f.bytes = new TextEncoder().encode(canonical.dxfText);
  f.row = { ...f.row, sizeBytes: f.bytes.length, sha256: await digestFullAssemblyFixture(f.bytes) };
  f.card.existingPatterns![0]!.manifest = canonical.manifest;
  const source = await createSavedThreePanelSourceV1(f),
    n = source.native;
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(n.draft, 'main', 'M');
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(n.draft, 'main', 'M');
  if (!selected.ok || !catalog.ok) throw Error('missing source catalog');
  const session = createPatternImportDxfPhaseEDraftCadSessionV1({
    revision: f.row.revision,
    phaseD: {
      sourceFileId: n.sourceFileId,
      sourceSha256: f.row.sha256,
      selectedGeometrySha256: selected.selection.selection.selectedGeometrySha256,
    },
    catalog: catalog.catalog,
  });
  if (!session.ok) throw Error('missing saved Draft session');
  const current = {
    session: session.session,
    selectedPieceId: 'FP',
    selectedPieceLineKey: 'line-FRONT',
    generation: 0,
    card: f.card,
    row: f.row,
    sizeToken: 'M',
  };
  const input = {
    sourceOwner: n.sourceOwner,
    sourceRequest: {
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: n.sourceFileId,
      sourceSha256: f.row.sha256,
      techCardId: f.row.techCardId,
      scopeKey: f.row.scopeKey,
      patternLineKey: f.row.patternLineKey,
      cardLockVersion: f.row.cardLockVersion,
      draft: n.draft,
    },
    savedBytes: f.bytes.buffer,
    readCurrent: () => current,
    readCurrentRow: vi.fn(async () => f.row),
  };
  return { f, source, current, input };
}

it.each([1, 2])(
  'verifies every rank and drill and persists FP_2 to a fresh independent line (%s ranks)',
  async (ranks) => {
    const { f, source, current, input } = await chosen(ranks);
    const uploaded: { bytes: Uint8Array<ArrayBuffer> | null } = { bytes: null };
    const url = 'https://saved-full-assembly.invalid/new-copy.dxf';
    const upload = vi
      .spyOn(adminService, 'UploadPattern')
      .mockImplementation(async ({ raw, filename }) => {
        uploaded.bytes = Uint8Array.from(atob(raw!), (c) => c.charCodeAt(0));
        return { url, filename, sizeBytes: uploaded.bytes.length };
      });
    try {
      const review = await prepareUnlinkedDraftPieceCopyV1(input);
      expect(() => takeUnlinkedDraftPieceCopyReviewV1({ ...review })).toThrow();
      const { file, identity } = takeUnlinkedDraftPieceCopyReviewV1(review);
      expect(identity).toBe('FP_2');
      const draft = await draftThroughWizardStages(file, f.card);
      const sourceKey = current.selectedPieceLineKey,
        newKey = draft.aliases.find((a) => a.blockName === identity)!.pieceLineKey;
      expect(newKey).not.toBe(sourceKey);
      const target = f.card.scopes[0]!,
        live: LiveCard = {
          patterns: [
            {
              ...f.card.existingPatterns![0]!,
              sizeId: 7,
              fabricPurpose: target.fabricPurpose,
              bomLineKey: target.bomLineKey,
            },
          ],
          pieces: structuredClone(f.card.existingPieces),
          aliases: f.card.existingAliases!.map((a) => ({
            ...a,
            fabricPurpose: target.fabricPurpose,
            bomLineKey: target.bomLineKey,
          })),
        };
      const paths: string[] = [];
      let saved: LiveCard | undefined;
      const apply = createCardApply({
        read: () => live,
        write: (path, value) => {
          paths.push(path);
          if (!Array.isArray(value)) throw Error(path);
          if (path === 'pieces') live.pieces = value;
          else if (path === 'patterns') live.patterns = value;
          else if (path === 'pieceDxfAliases') live.aliases = value;
          else throw Error(path);
        },
        scopeOf: (v) =>
          v.fabricPurpose === target.fabricPurpose && v.bomLineKey === target.bomLineKey
            ? 'main'
            : '',
        storageSizeId: 7,
        readPreviousLockVersion: () => f.row.cardLockVersion,
        save: async () => {
          saved = structuredClone(live);
          return 'ok';
        },
      });
      const submit = (token?: number) =>
        applyDirectDxfReviewedDraftV1(
          draft,
          [file],
          token,
          () => true,
          (options) => apply(draft, undefined, options),
        );
      await expect(submit(1)).rejects.toThrow('Apply button');
      await expect(
        acknowledgeUnlinkedDraftPieceCopyV1(new File([file], file.name), draft),
      ).rejects.toThrow('original');
      await expect(
        acknowledgeUnlinkedDraftPieceCopyV1(file, structuredClone(draft)),
      ).rejects.toThrow('ordinary review');
      current.generation++;
      await expect(submit()).rejects.toThrow('changed');
      current.generation--;
      expect(upload).not.toHaveBeenCalled();
      input.readCurrentRow.mockResolvedValueOnce({
        ...current.row,
        revision: current.row.revision + 1,
      });
      await expect(submit()).rejects.toThrow('authoritative source row changed');
      expect(upload).not.toHaveBeenCalled();
      if (ranks === 1) {
        const aliases = structuredClone(live.aliases);
        upload.mockImplementationOnce(async ({ raw, filename }) => {
          const held = live.aliases.find((a) => a.blockName === 'FP')!;
          held.pieceLineKey = 'foreign-line';
          return { url, filename, sizeBytes: atob(raw!).length };
        });
        const stale = await submit();
        expect(stale.ok).toBe(false);
        expect(paths).toEqual([]);
        expect(saved).toBeUndefined();
        live.aliases = aliases;
      }
      const applied = await submit();
      expect(applied.ok, JSON.stringify(applied)).toBe(true);
      if (!applied.ok || !applied.commitReceipt || !saved || !uploaded.bytes)
        throw Error('missing genuine confirmed write');
      expect(applied.commitReceipt.scopes[0]!.aliases).toEqual(
        expect.arrayContaining([
          { scopeKey: 'main', blockName: 'FP', pieceLineKey: sourceKey },
          { scopeKey: 'main', blockName: 'FP_2', pieceLineKey: newKey },
        ]),
      );
      expect(paths.sort()).toEqual(['patterns', 'pieceDxfAliases', 'pieces']);
      expect(input.readCurrentRow).toHaveBeenCalledTimes(ranks === 1 ? 3 : 2);
      const committed = saved.patterns.find((p) => p.url === url)!;
      f.row = {
        ...f.row,
        patternLineKey: committed.lineKey!,
        url,
        revision: f.row.revision + 1,
        cardLockVersion: f.row.cardLockVersion + 1,
        sizeBytes: committed.sizeBytes!,
        sha256: committed.sha256!,
      };
      f.bytes = uploaded.bytes;
      f.card.existingPieces = saved.pieces.map((p) => ({
        ...p,
        lineKey: p.lineKey!,
        name: p.name!,
        cutSymmetry: p.cutSymmetry!,
      }));
      f.card.existingAliases = saved.aliases.map((a) => ({
        scopeKey: 'main',
        blockName: a.blockName!,
        pieceLineKey: a.pieceLineKey!,
      }));
      f.card.existingPatterns = [
        {
          ...f.card.existingPatterns![0]!,
          url,
          lineKey: f.row.patternLineKey,
          manifest: readManifest(new TextDecoder().decode(f.bytes))!,
        },
      ];
      const readback = await createSavedThreePanelSourceV1(f);
      try {
        expect(readback.native.row).toEqual(f.row);
        const aliases = readback.native.draft.aliases;
        expect(aliases.find((a) => a.blockName === 'FP')?.pieceLineKey).toBe(sourceKey);
        expect(aliases.find((a) => a.blockName === identity)?.pieceLineKey).toBe(newKey);
        const copy = readback.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
          (p) => p.identity === identity,
        )!;
        expect(copy.sizes.map((s) => s.drills.length)).toEqual(Array(ranks).fill(1));
      } finally {
        readback.dispose();
      }
    } finally {
      upload.mockRestore();
      source.dispose();
    }
  },
);

it('detects a layer-1 cut hole reclassified as internal ink by ordinary import', async () => {
  const f = await seedCopy(1, true),
    original = f.written.dxfText;
  const copy = structuredClone(f.job.pieces[0]!);
  copy.identity = 'FP_2';
  copy.displayName = 'FP_2';
  copy.mods = ['2'];
  copy.seed = 3;
  f.job.pieces.push(copy);
  const produced = writeDxfDetailed(f.job).dxfText;
  const check = nativePieceCopyVerifier(original, 'FP', copy.identity);
  check(produced);
  const draft = await draftThroughWizardStages(new File([produced], 'hole-copy.dxf'), f.card);
  expect(draft.scopes[0]!.manifest.gate?.passed).toBe(true);
  expect(() => check(draft.scopes[0]!.dxfText)).toThrow('native layer');
});

it('requires the exact native hole and drill on every source and duplicate rank', async () => {
  const f = await seedCopy(2, true);
  const source = f.job.pieces[0]!,
    copy = structuredClone(source);
  copy.identity = 'FP_2';
  copy.displayName = copy.identity;
  copy.mods = ['2'];
  copy.seed = 3;
  f.job.pieces.push(copy);
  const prove = nativePieceCopyVerifier(f.written.dxfText, source.identity, copy.identity);
  prove(writeDxfDetailed(f.job).dxfText);
  for (const change of ['point', 'hole', 'rank', 'original'] as const) {
    const job = structuredClone(f.job),
      c = job.pieces[2]!,
      late = c.sizes[1]!;
    if (change === 'point') late.drills[0]!.at.x += 1;
    if (change === 'hole') late.cutLoops = [];
    if (change === 'rank') c.sizes.pop();
    if (change === 'original') job.pieces[1]!.sizes[0]!.drills = [];
    expect(() => prove(writeDxfDetailed(job).dxfText)).toThrow();
  }
});
