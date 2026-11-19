import { mirrorSizeAcrossGrain, transformSizeSpec } from 'lib/pattern-import/semantics/pairs';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { readDxf } from 'lib/pattern-import/adapters/dxf/extract';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import { dxfFastPath } from 'lib/pattern-import/adapters/dxf/stages';
import { resolveNativeCutLoops } from 'lib/pattern-import/adapters/dxf/native-cut-holes';
import { asciiText, serialize } from 'lib/pattern-import/write/format';
import type { DxfPieceCandidate } from 'lib/pattern-import/adapters/dxf/dxf-types';

import { signedArea } from 'lib/pattern-import/adapters/dxf/geometry';
import { it, expect, vi } from 'vitest';
import { adminService } from 'api/api';
import { LAYOUT_GAP_MM, pieceSizeCutBounds, writeDxfDetailed } from 'lib/pattern-import/write';
import { translation } from 'lib/pattern-import/write/geom';
import { embedManifest, readManifest } from 'lib/pattern-import/manifest';
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

async function seedCopy(ranks = 1, hole = false, mirror = false, retainedLayout = false) {
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
      if (mirror && index === 0) {
        // One clipped corner provides a handed outline; each grade has a separately drawn grain.
        const maxX = Math.max(...cut.map((p) => p.x)),
          maxY = Math.max(...cut.map((p) => p.y));
        const corner = cut.findIndex((p) => p.x === maxX && p.y === maxY);
        if (corner < 0) throw Error('Missing exterior corner');
        cut.splice(corner, 1, { x: maxX, y: maxY - 16 - rank }, { x: maxX - 16 - rank, y: maxY });
      }
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
        ...(mirror && index === 0
          ? {
              grain: {
                ...base.grain!,
                a: { x: x + 40 + 2 * rank, y: y + 12 },
                b: { x: x + 40 + 2 * rank, y: y + 82 },
              },
              internal: [
                {
                  kind: 'internal' as const,
                  origin: 'operator' as const,
                  confidence: 1,
                  ranges: [],
                  closed: false,
                  pts: [
                    { x: x + 48 + rank, y: y + 33 },
                    { x: x + 52 + rank, y: y + 35 },
                    { x: x + 50 + rank, y: y + 40 },
                  ],
                },
              ],
              textMarks: [{ text: 'МЕТКА', at: { x: x + 50 + rank, y: y + 46 } }],
              pointMarks: [{ kind: 'draft-point' as const, at: { x: x + 51 + rank, y: y + 51 } }],
              notches: [
                {
                  kind: 'notch' as const,
                  origin: 'operator' as const,
                  confidence: 1,
                  ranges: [],
                  at: { x: x + 23 + rank, y },
                  seg: [
                    { x: x + 23 + rank, y },
                    { x: x + 23 + rank, y: y + 4 },
                  ] as [{ x: number; y: number }, { x: number; y: number }],
                  depthMm: 4,
                },
              ],
            }
          : {}),
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
                  { x: x + 20 + rank, y: y + 20 },
                  { x: x + 20 + rank, y: y + 25 },
                  { x: x + 25 + 2 * rank, y: y + 25 },
                  { x: x + 25 + 2 * rank, y: y + 20 },
                ],
                [
                  { x: x + 60, y: y + 50 + rank },
                  { x: x + 60, y: y + 55 + rank },
                  { x: x + 63, y: y + 55 + rank },
                  { x: x + 63, y: y + 50 + rank },
                ],
              ],
            }
          : {}),
      };
    });
  });
  const clock = { now: () => new Date('2026-11-17T00:00:00.000Z') };
  if (retainedLayout) {
    f.job.pieces = writeDxfDetailed(f.job, clock).plan.specs.map((piece) => ({
      ...piece,
      sizes: piece.sizes.map((size) => transformSizeSpec(size, translation(15, -20))),
    }));
    f.job.preserveNativeLayout = true;
  }
  f.written = writeDxfDetailed(f.job, clock);
  f.bytes = new TextEncoder().encode(f.written.dxfText);
  f.row = { ...f.row, sha256: await digestFullAssemblyFixture(f.bytes), sizeBytes: f.bytes.length };
  f.card.existingPatterns![0]!.manifest = f.written.manifest;
  return f;
}

async function chosen(ranks: number, mirror = false, retainedLayout = false) {
  const f = await seedCopy(ranks, true, mirror, retainedLayout);
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
  return { f, source, current, input, selected, catalog: catalog.catalog };
}

it.each(
  [
    { ranks: 1, retainedLayout: false },
    { ranks: 2, retainedLayout: false },
    { ranks: 2, retainedLayout: true },
  ].flatMap((configuration) =>
    (['duplicate', 'mirror-across-grain'] as const).map((mode) => ({ ...configuration, mode })),
  ),
)(
  'verifies explicit $mode on $ranks ranks with retained layout $retainedLayout through manual Apply and fresh reopen',
  async ({ ranks, mode, retainedLayout }) => {
    const { f, source, current, input } = await chosen(
      ranks,
      mode === 'mirror-across-grain',
      retainedLayout,
    );
    const uploaded: { bytes: Uint8Array<ArrayBuffer> | null } = { bytes: null };
    const url = 'https://saved-full-assembly.invalid/new-copy.dxf';
    const upload = vi
      .spyOn(adminService, 'UploadPattern')
      .mockImplementation(async ({ raw, filename }) => {
        uploaded.bytes = Uint8Array.from(atob(raw!), (c) => c.charCodeAt(0));
        return { url, filename, sizeBytes: uploaded.bytes.length };
      });
    try {
      const review = await prepareUnlinkedDraftPieceCopyV1({ ...input, mode });
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
        if (retainedLayout) {
          const job = readback.native.draft.scopes[0]!.writerReplay!.job;
          expect(job.preserveNativeLayout).toBe(true);
          const originalRight = Math.max(
            ...job.pieces
              .filter((piece) => piece.identity !== identity)
              .flatMap(({ sizes }) => sizes.map((size) => pieceSizeCutBounds(size).maxX)),
          );
          const copied = job.pieces.find((piece) => piece.identity === identity)!;
          expect(
            Math.min(...copied.sizes.map((size) => pieceSizeCutBounds(size).minX)),
          ).toBeCloseTo(originalRight + LAYOUT_GAP_MM, 6);
        }
        const aliases = readback.native.draft.aliases;
        expect(aliases.find((a) => a.blockName === 'FP')?.pieceLineKey).toBe(sourceKey);
        expect(aliases.find((a) => a.blockName === identity)?.pieceLineKey).toBe(newKey);
        nativePieceCopyVerifier(
          f.written.dxfText,
          'FP',
          identity,
          mode,
        )(new TextDecoder().decode(f.bytes));
        if (mode === 'mirror-across-grain')
          for (const { token } of f.job.sizes) {
            const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
              readback.native.draft,
              'main',
              token,
            );
            if (!catalog.ok) throw Error(catalog.blockers[0].detail);
            expect(catalog.catalog.assemblyInferred).toBe(false);
            const orig = catalog.catalog.pieces.find((p) => p.pieceId === 'FP')!,
              mir = catalog.catalog.pieces.find((p) => p.pieceId === identity)!;
            expect([orig.pieceLineKey, mir.pieceLineKey]).toEqual([sourceKey, newKey]);
            const sourceIds = new Set(
              orig.contours.flatMap((c) => [
                c.contourId,
                ...c.boundaryVertices.map((v) => v.vertexId),
              ]),
            );
            const mirrorIds = mir.contours.flatMap((c) => [
              c.contourId,
              ...c.boundaryVertices.map((v) => v.vertexId),
            ]);
            expect(mirrorIds.length).toBeGreaterThan(1);
            expect(mirrorIds.every((id) => !sourceIds.has(id))).toBe(true);
          }
        const pieces = readback.native.draft.scopes[0]!.writerReplay!.job.pieces;
        for (const id of ['FP', identity]) {
          const piece = pieces.find((p) => p.identity === id)!;
          expect(piece.sizes.map((s) => s.rank)).toEqual(f.job.sizes.map((s) => s.rank));
          for (const size of piece.sizes) {
            expect(size.drills).toHaveLength(1);
            if (mode === 'mirror-across-grain') {
              expect(size.cut).toHaveLength(5);
              expect(size.notches).toHaveLength(1);
              expect(size.pointMarks).toEqual([expect.objectContaining({ kind: 'draft-point' })]);
              expect(size.textMarks).toEqual([expect.objectContaining({ text: 'МЕТКА' })]);
              expect(
                size.internal.filter((mark) => !mark.closed && mark.pts.length === 3),
              ).toHaveLength(1);
              if (id === identity) {
                const sourceSize = pieces
                  .find((p) => p.identity === 'FP')!
                  .sizes.find((v) => v.rank === size.rank)!;
                const relative = (s: typeof size, pt: { x: number; y: number }) =>
                  pt.x - s.grain!.a.x;
                expect(relative(size, size.drills[0]!.at)).toBe(
                  -relative(sourceSize, sourceSize.drills[0]!.at),
                );
                expect(relative(size, size.notches[0]!.at)).toBe(
                  -relative(sourceSize, sourceSize.notches[0]!.at),
                );
                expect(relative(size, size.textMarks![0]!.at)).toBe(
                  -relative(sourceSize, sourceSize.textMarks![0]!.at),
                );
                expect(relative(size, size.pointMarks![0]!.at)).toBe(
                  -relative(sourceSize, sourceSize.pointMarks![0]!.at),
                );
              }
            }
            expect(size.internal.filter((i) => i.label === 'hole')).toEqual([]);
            expect(size.cutLoops?.map((loop) => signedArea(loop))).toEqual([
              -5 * (5 + size.rank),
              -15,
            ]);
            expect(size.areaMm2).toBe(signedArea(size.cut) - 5 * (5 + size.rank) - 15);
          }
        }
      } finally {
        readback.dispose();
      }
    } finally {
      upload.mockRestore();
      source.dispose();
    }
  },
);

it('retains the cut hole on layer 1 through the ordinary importer', async () => {
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
  check(draft.scopes[0]!.dxfText);
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

it.each(['duplicate', 'mirror-across-grain'] as const)(
  'only permits the reviewed manifest-bound R12 heading to be renamed for %s',
  async (mode) => {
    const reflected = mode === 'mirror-across-grain';
    const { job } = await seedCopy(2, true, reflected);
    const original = job.pieces[0]!;
    original.displayName = 'FRONT_PANEL';
    const source = writeDxfDetailed(job);
    const copy = structuredClone(original);
    copy.identity = 'FP_2';
    copy.displayName = 'FRONT_PANEL_2';
    copy.mods = ['2'];
    copy.seed = 3;
    if (reflected) copy.sizes = original.sizes.map((size) => mirrorSizeAcrossGrain(size)!.size);
    job.pieces.push(copy);
    const verify = nativePieceCopyVerifier(source.dxfText, 'FP', 'FP_2', mode, {
      source: 'FRONT_PANEL',
      copy: 'FRONT_PANEL_2',
    });
    const written = writeDxfDetailed(job);
    expect(() => verify(written.dxfText)).not.toThrow();
    if (reflected) {
      expect(() => nativePieceCopyVerifier(source.dxfText, 'FP', 'FP_2', mode)).toThrow(
        'unsupported native text mark',
      );
      const unreflected = structuredClone(job);
      unreflected.pieces.at(-1)!.sizes = structuredClone(original.sizes);
      expect(() => verify(writeDxfDetailed(unreflected).dxfText)).toThrow('exact reflected native');
    }
    const substitute = written.dxfText.replace(
      /([\r\n])FRONT_PANEL_2([\r\n])/,
      '$1OPERATOR_MARK$2',
    );
    expect(substitute).not.toBe(written.dxfText);
    expect(() => verify(substitute)).toThrow('exact R12 writer row');
    const shiftedInsert = written.dxfText.replace(
      /(\r?\nINSERT\r?\n\s*8\r?\n0\r?\n\s*2\r?\n[^\r\n]+\r?\n\s*10\r?\n)0\.000000/,
      (_, prefix: string) => prefix + '1.000000',
    );
    expect(shiftedInsert).not.toBe(written.dxfText);
    expect(() => verify(shiftedInsert)).toThrow('transformed or ambiguous native insertion');
    const originalEdit = structuredClone(job);
    originalEdit.pieces[0]!.displayName = 'FRONT_OTHER';
    expect(() => verify(writeDxfDetailed(originalEdit).dxfText)).toThrow('changed on FP');
    const geometryEdit = structuredClone(job);
    geometryEdit.pieces.at(-1)!.sizes[0]!.drills[0]!.at.x += 0.000001;
    expect(() => verify(writeDxfDetailed(geometryEdit).dxfText)).toThrow(
      reflected ? 'exact reflected native' : 'changed a native layer',
    );
  },
);

it('refuses mirror substitutes, modified rank geometry, missing grain, changed material and multi-instance pieces', async () => {
  const f = await seedCopy(2, true, true),
    original = f.job.pieces[0]!,
    mirror = structuredClone(original);
  mirror.identity = 'FP_2';
  mirror.displayName = 'FP_2';
  mirror.mods = ['2'];
  mirror.seed = 3;
  mirror.sizes = original.sizes.map((s) => mirrorSizeAcrossGrain(s)!.size);
  f.job.pieces.push(mirror);
  const verify = nativePieceCopyVerifier(f.written.dxfText, 'FP', 'FP_2', 'mirror-across-grain');
  const good = writeDxfDetailed(f.job);
  verify(good.dxfText);
  for (const change of [
    'unreflected',
    'other-axis',
    'hole',
    'seam',
    'drill',
    'notch',
    'internal',
    'construction-point',
    'text-anchor',
    'text-original-caption',
    'rank',
    'original',
    'cross-material',
    'linked-pair',
    'multi-instance',
  ] as const) {
    const job = structuredClone(f.job),
      copy = job.pieces[2]!,
      size = copy.sizes[1]!;
    if (change === 'unreflected') copy.sizes = structuredClone(original.sizes);
    if (change === 'other-axis') {
      size.grain!.a.x++;
      size.grain!.b.x++;
    }
    if (change === 'hole') size.cutLoops![0]!.reverse();
    if (change === 'seam') size.seam![0]!.x += 0.001;
    if (change === 'drill') size.drills[0]!.at.x += 0.001;
    if (change === 'notch') size.notches[0]!.at.x += 0.001;
    if (change === 'internal') size.internal[0]!.pts[1]!.y += 0.001;
    if (change === 'construction-point') size.pointMarks![0]!.at.x += 0.001;
    if (change === 'text-anchor') size.textMarks![0]!.at.x += 0.001;
    if (change === 'text-original-caption')
      size.textMarks![0]!.text = asciiText(size.textMarks![0]!.text);
    if (change === 'rank') copy.sizes.pop();
    if (change === 'original') job.pieces[1]!.sizes[0]!.drills = [];
    let output = writeDxfDetailed(job).dxfText;
    if (change === 'cross-material' || change === 'linked-pair' || change === 'multi-instance') {
      const m = readManifest(output)!,
        c = m.pieces.find((p) => p.identity === copy.identity)!;
      if (change === 'cross-material') c.fabrics = ['lining'];
      if (change === 'linked-pair') {
        c.pairHand = 'L';
        c.pairOf = 'FP';
        const origin = m.pieces.find((p) => p.identity === 'FP')!;
        origin.pairOf = c.identity;
        origin.pairHand = 'R';
      }
      if (change === 'multi-instance') c.piecesPerGarment = 2;
      output = embedManifest(output, m);
    }
    expect(() => verify(output), change).toThrow();
  }
  const label = serialize([
    [1, 'Piece Name: FP'],
    [50, '0.000000'],
    [7, 'STANDARD'],
  ]);
  expect(f.written.dxfText).toContain(label);
  const typed = f.written.dxfText.replace(
    label,
    serialize([
      [1, 'Piece Name: FP'],
      [50, '0.000000'],
      [7, 'GRBPWR_CAD_TEXT'],
    ]),
  );
  expect(() => nativePieceCopyVerifier(typed, 'FP', 'FP_2', 'mirror-across-grain')).toThrow(
    'unsupported native text mark',
  );
  for (const axis of ['missing', 'nonrepresentable'] as const) {
    const job = structuredClone(f.job);
    job.pieces.pop();
    const size = job.pieces[0]!.sizes[0]!;
    if (axis === 'missing') size.grain = null;
    else size.grain!.b.x += 7;
    expect(
      () =>
        nativePieceCopyVerifier(writeDxfDetailed(job).dxfText, 'FP', 'FP_2', 'mirror-across-grain'),
      axis,
    ).toThrow(/grain axis|coordinate grid/);
  }
});

it.each(['horizontal', 'diagonal'] as const)(
  'verifies a reflected native block on an exact %s grain',
  async (axis) => {
    const f = await seedCopy(1, true, true),
      original = f.job.pieces[0]!,
      grain = original.sizes[0]!.grain!;
    grain.b = { x: grain.a.x + 40, y: grain.a.y + (axis === 'diagonal' ? 40 : 0) };
    const text = writeDxfDetailed(f.job).dxfText;
    const mirror = structuredClone(original);
    mirror.identity = 'FP_2';
    mirror.displayName = 'FP_2';
    mirror.mods = ['2'];
    mirror.seed = 3;
    mirror.sizes = original.sizes.map((s) => mirrorSizeAcrossGrain(s)!.size);
    f.job.pieces.push(mirror);
    nativePieceCopyVerifier(
      text,
      'FP',
      'FP_2',
      'mirror-across-grain',
    )(writeDxfDetailed(f.job).dxfText);
  },
);

async function decodeCutFixture(text: string, generatedFusing = false) {
  return readDxf(
    {
      id: 'native-cuts',
      name: 'cut-holes.dxf',
      bytes: new TextEncoder().encode(text).buffer,
      generatedFusing,
    },
    { sagittaMm: 0.05, keepFills: true },
  );
}
it('requires the original decoded feature ownership and exact unchanged cut frame for the rank', async () => {
  const f = await seedCopy(2, true),
    read = await decodeCutFixture(f.written.dxfText);
  const seg = segmentDxf(read),
    fast = dxfFastPath(read, seg);
  const c = fast.families[0]!.candidates[0] as DxfPieceCandidate,
    sibling = fast.families[0]!.candidates[1] as DxfPieceCandidate;
  const card = f.job.sizes[c.rank]!;
  expect(c.dxf.nativeCutHoles).toBe(true);
  expect(resolveNativeCutLoops(c.dxf, c.rank, card, c.outer)?.map(signedArea)).toEqual([-25, -15]);
  expect(resolveNativeCutLoops(structuredClone(c.dxf), c.rank, card, c.outer)).toBeNull();
  expect(resolveNativeCutLoops(sibling.dxf, c.rank, card, c.outer)).toBeNull();
  expect(resolveNativeCutLoops(c.dxf, c.rank, { ...card, sizeId: 98 }, c.outer)).toBeNull();
  expect(resolveNativeCutLoops(c.dxf, c.rank, { ...card, token: 'L' }, c.outer)).toBeNull();
  expect(
    resolveNativeCutLoops(
      c.dxf,
      c.rank,
      card,
      c.outer.map((p) => ({ ...p, x: p.x + 1 })),
    ),
  ).toBeNull();
  expect(() => dxfFastPath({ ...read, doc: structuredClone(read.doc) }, seg)).toThrow('ownership');
  expect(() => dxfFastPath(read, seg, true)).toThrow('ownership');
});

it.each(['foreign', 'generated-fusing'] as const)(
  'keeps the established %s layer-1 interpretation',
  async (kind) => {
    const f = await seedCopy(1, true),
      text =
        kind === 'foreign' ? writeDxfDetailed(f.job, { embed: null }).dxfText : f.written.dxfText;
    const read = await decodeCutFixture(text, kind === 'generated-fusing'),
      fast = dxfFastPath(read, segmentDxf(read));
    const c = fast.families[0]!.candidates[0] as DxfPieceCandidate;
    expect(c.dxf.nativeCutHoles).toBeUndefined();
    expect(
      c.dxf.features.filter((feature) => feature.kind === 'internal' && feature.label === 'hole'),
    ).toHaveLength(2);
  },
);

it.each([
  'positive-interior',
  'touching',
  'nested',
  'drifted-area',
  'duplicate-insert',
  'duplicate-block',
  'not-straight',
] as const)('refuses claimed own-format holes with %s', async (kind) => {
  const f = await seedCopy(1, true),
    size = f.job.pieces[0]!.sizes[0]!,
    holes = size.cutLoops!;
  let input = f.written.dxfText;
  if (kind === 'positive-interior') {
    holes.forEach((loop) => loop.reverse());
    input = writeDxfDetailed(f.job).dxfText;
  } else if (kind === 'touching') {
    const min = Math.min(...size.cut.map((p) => p.x)),
      dx = min - Math.min(...holes[0]!.map((p) => p.x));
    holes[0] = holes[0]!.map((p) => ({ ...p, x: p.x + dx }));
    input = writeDxfDetailed(f.job).dxfText;
  } else if (kind === 'nested') {
    const first = holes[0]!,
      origin = first[0]!;
    holes[1] = first.map((p) => ({
      x: origin.x + 1 + (p.x - origin.x) * 0.3,
      y: origin.y + 1 + (p.y - origin.y) * 0.3,
    }));
    input = writeDxfDetailed(f.job).dxfText;
  } else if (kind === 'drifted-area') {
    const m = readManifest(input)!;
    m.blocks[0]!.areaMm2 += 1;
    input = embedManifest(input, m);
  } else if (kind === 'duplicate-block') {
    const end = serialize([
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]);
    expect(input).toContain(end);
    input = input.replace(
      end,
      serialize([
        [0, 'BLOCK'],
        [8, '0'],
        [2, 'FP_M'],
        [70, '0'],
        [0, 'ENDBLK'],
        [8, '0'],
      ]) + end,
    );
  } else if (kind === 'duplicate-insert') {
    const header = serialize([
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]);
    input = input.replace(
      header,
      header +
        serialize([
          [0, 'INSERT'],
          [8, '0'],
          [2, 'FP_M'],
          [10, '0.000000'],
          [20, '0.000000'],
          [30, '0.000000'],
        ]),
    );
  } else {
    const vertex = serialize([
      [0, 'VERTEX'],
      [8, '1'],
      [10, '20.000000'],
      [20, '20.000000'],
      [30, '0.000000'],
    ]);
    expect(input).toContain(vertex);
    input = input.replace(vertex, vertex + serialize([[42, '0.015625']]));
  }
  const read = await decodeCutFixture(input);
  expect(() => dxfFastPath(read, segmentDxf(read))).toThrow('Native DXF cut hole');
});

async function checkMountedCopy(mode: 'duplicate' | 'mirror-across-grain') {
  const [{ chromium }, { createServer }, { mkdtemp, rm }, { tmpdir }, { join }] = await Promise.all(
    [
      import('playwright'),
      import('vite'),
      import('node:fs/promises'),
      import('node:os'),
      import('node:path'),
    ],
  );
  const { f, source, current, selected, catalog } = await chosen(2, mode === 'mirror-across-grain');
  const cacheDir = await mkdtemp(join(tmpdir(), 'ac13-vite-'));
  const server = await createServer({
    cacheDir,
    appType: 'custom',
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [
      {
        name: 'mounted-saved-copy-fixture',
        configureServer(s) {
          s.middlewares.use(async (req, res, next) => {
            if (req.url !== '/__saved-copy') return next();
            const html = await s.transformIndexHtml(
              req.url,
              '<html><head><link rel="stylesheet" href="/src/global.css" /></head><body><main id="root"></main></body></html>',
            );
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          });
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw Error('Missing isolated test server');
    const origin = 'http://127.0.0.1:' + address.port;
    const page = await browser.newPage();
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    );
    await page.goto(origin + '/__saved-copy');
    const url =
      '/src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-unlinked-piece-copy-control.browser-fixture.tsx';
    const errors: string[] = [],
      writes: string[] = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method()))
        writes.push(req.method() + ' ' + req.url());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.addScriptTag({
      type: 'module',
      content: `import {mountSavedPieceCopyControl} from '${url}'; window.mountSavedCopyFixture=mountSavedPieceCopyControl;`,
    });
    await page
      .waitForFunction(() => Boolean(window.mountSavedCopyFixture), undefined, { timeout: 15000 })
      .catch(() => {
        throw Error(errors.join('\n'));
      });
    const control = await page.evaluateHandle(
      (json) => window.mountSavedCopyFixture(JSON.parse(json)),
      JSON.stringify({
        row: f.row,
        mode,
        card: f.card,
        text: f.written.dxfText,
        source: current.session.source,
        selected: selected.selection,
        catalog,
        compileSource: createPatternImportDxfPhaseEDraftCadCompileSourceV1(source.native.draft)!,
      }),
    );
    try {
      const duplicate = page.getByText(
          mode === 'mirror-across-grain' ? 'Mirror piece' : 'Duplicate piece',
          { exact: true },
        ),
        review = page.getByRole('button', {
          name: mode === 'mirror-across-grain' ? 'Review unlinked mirror' : 'Review unlinked copy',
        });
      await page
        .locator('[data-draft-cad-arrange-tool]')
        .click({ timeout: 10000 })
        .catch(async (error) => {
          throw Error(
            String(error) +
              ' ' +
              errors.join('\n') +
              ' ' +
              (await page.locator('body').innerText()),
          );
        });
      const piece = page.locator('[data-cad-object-piece="FP"]');
      if (!(await piece.isVisible()))
        await page.getByRole('button', { name: 'Show objects sidebar' }).click();
      await piece.click();
      await page.locator('[data-cad-object-piece="BP"]').click({ modifiers: ['Shift'] });
      expect(await duplicate.count()).toBe(0);
      await piece.click();
      await duplicate.click();
      await page
        .getByRole('status')
        .filter({ hasText: 'FP_2' })
        .waitFor({ timeout: 15000 })
        .catch(async (error) => {
          throw Error(String(error) + ' ' + (await page.locator('body').innerText()));
        });
      await review.click();
      await expect.poll(() => control.evaluate((c) => c.state().handoffs)).toBe(1);
      expect(await control.evaluate((c) => c.state())).toEqual({
        manual: true,
        writes: 0,
        handoffs: 1,
      });
      const wizard = page.getByTestId('pattern-import-wizard');
      await wizard.waitFor({ timeout: 12000 }).catch(async (error) => {
        throw Error(String(error) + ' ' + errors.join('\n'));
      });
      expect(await wizard.getAttribute('data-initial-scope-key')).toBe('main');
      expect(await wizard.getAttribute('data-initial-file-count')).toBe('1');
      await wizard.getByTitle('close the import (the card is not changed)').click();
      if (await page.getByText('discard and close', { exact: true }).isVisible())
        await page.getByText('discard and close', { exact: true }).click();
      await wizard.waitFor({ state: 'detached' });
      expect(await control.evaluate((c) => c.verifyClosed())).toContain(
        'original explicitly reviewed File',
      );
      await duplicate.click();
      await page.getByRole('status').filter({ hasText: 'FP_2' }).waitFor();
      await control.evaluate((c) => c.drift());
      await review.click();
      await page.getByRole('status').filter({ hasText: 'saved-row authority moved' }).waitFor();
      expect(await review.isDisabled()).toBe(true);
      expect(await wizard.count()).toBe(0);
      expect(await control.evaluate((c) => c.state())).toEqual({
        manual: true,
        writes: 0,
        handoffs: 1,
      });
      expect(writes).toEqual([]);
    } finally {
      await control.evaluate((c) => c.dispose());
    }
  } finally {
    source.dispose();
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}
it.each(['duplicate', 'mirror-across-grain'] as const)(
  'opens a mounted %s review and refuses a cancelled or moved source',
  checkMountedCopy,
  90000,
);

declare global {
  interface Window {
    mountSavedCopyFixture: typeof import('./draft-cad-unlinked-piece-copy-control.browser-fixture').mountSavedPieceCopyControl;
  }
}
