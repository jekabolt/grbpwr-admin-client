import type { common_TechCard } from 'api/proto-http/admin';
import { captureSavedFixedEndAuthorityV1 } from './saved-fixed-end-outline-authority-v1';
import { authoredInternalVertices } from 'lib/pattern-import/manifest/authored-internal';
import {
  recordSavedFrenchCurveHandleV1,
  selectSavedFrenchCurveTableEditV1,
  selectSavedFrenchCurveV1,
} from './draft-cad-saved-french-curve-v1';
import {
  cancelSavedDartTipReviewV1,
  verifySavedDartTipApplyV1,
} from './draft-cad-saved-dart-tip-file-v1';
import {
  compileSavedDartTipReviewV1,
  openSavedDraftGeometryFileV1,
} from './draft-cad-saved-dart-tip-review-v1';
import {
  adjustedSavedDartFeetV1,
  recordSavedDartIntakeV1,
  recordSavedDartTipV1,
  recordSavedFishEyeMoveV1,
  selectSavedDartTipV1,
  selectSavedFishEyeMoveV1,
} from './draft-cad-saved-dart-tip-v1';
import { expect, it, vi } from 'vitest';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { bboxOf, areaOf, signedArea } from 'lib/pattern-import/semantics/geom';
import { transformSizeSpec } from 'lib/pattern-import/semantics/pairs';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { readProtectedLineSplit } from 'lib/pattern-import/write/read-protected-line-split';
import { readManifest, embedManifest } from 'lib/pattern-import/manifest';
import { DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  activeDraftCadTransactionsV1,
  createPatternImportDxfPhaseEDraftCadSessionV1,
  recordDraftCadFrenchCurveHandleV1,
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadCommandV1,
} from './draft-cad-session-v1';
import {
  prepareSavedAddPointReviewV1,
  takeSavedAddPointReviewV1,
  claimSavedAddPointReviewFileV1,
  isCurrentSavedAddPointReviewClaimV1,
} from './draft-cad-saved-add-point-review-v1';

const garmentRanks = ['XS', 'S', 'M', 'L', 'XL'] as const;

async function fixture(
  stable = false,
  separateAllowance = true,
  fiveRanks = false,
  nativeDarts: boolean | 'orphan' | 'ambiguous' | 'ambiguous-fish-eye' = false,
  sourceDialect: 'r12' | 'r2000' = 'r12',
  spreadHoles = false,
  frenchCurve: 'exact' | 'legacy' | 'ambiguous' | undefined = undefined,
  beveledOutline = false,
) {
  const seed = await createSavedThreePanelFixtureV1(2);
  if (stable) {
    const ids: Record<string, string> = { FRONT: 'FP', BACK: 'BP' };
    for (const piece of seed.job.pieces) {
      piece.identity = ids[piece.identity]!;
      piece.code = piece.identity;
      piece.displayName = piece.identity;
    }
    for (const piece of seed.card.existingPieces) piece.name = ids[piece.name]!;
    for (const alias of seed.card.existingAliases!) alias.blockName = ids[alias.blockName]!;
  }
  for (const piece of separateAllowance ? seed.job.pieces : []) {
    const size = piece.sizes[0]!,
      sx = size.cut.reduce((n, p) => n + p.x, 0) / size.cut.length,
      sy = size.cut.reduce((n, p) => n + p.y, 0) / size.cut.length;
    size.seam = size.cut.map((p) => ({ x: sx + (p.x - sx) * 0.8, y: sy + (p.y - sy) * 0.8 }));
    piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
  }
  if (fiveRanks) {
    seed.job.sizes = garmentRanks.map((token, rank) => ({
      token,
      rank,
      sizeId: rank + 5,
      name: token,
      sourceLabel: token,
    }));
    seed.job.source.sizeEncoding = 'dxf-block';
    seed.card.sizes = seed.job.sizes.map((size) => ({ ...size, spellings: [size.token] }));
    for (const piece of seed.job.pieces) {
      const base = piece.sizes[0]!;
      piece.sizes = seed.job.sizes.map(({ token, rank, sizeId }) => {
        // Every rank has distinct dimensions in both axes, even if the selected rank is lost.
        const grow = (ring: typeof base.cut) =>
          ring.map(({ x, y }) => ({
            x: base.bbox.minX + (x - base.bbox.minX) * (1 + rank * 0.04),
            y: y * (1 + rank * 0.03),
          }));
        const cut = grow(base.cut);
        return {
          ...structuredClone(base),
          rank,
          sizeId,
          sizeToken: token,
          cut,
          seam: grow(base.seam!),
          bbox: bboxOf(cut),
          areaMm2: areaOf(cut),
        };
      });
    }
  }
  if (beveledOutline) {
    const size = seed.job.pieces[0]!.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
    const bevel = (points: typeof size.cut) => {
      const [a, b, ...remaining] = points;
      const prior = remaining.at(-1)!;
      const inward = (toward: typeof a) => ({
        x: a.x + Math.sign(toward.x - a.x) * 2,
        y: a.y + Math.sign(toward.y - a.y) * 2,
      });
      return [inward(prior), inward(b), b, ...remaining];
    };
    size.cut = bevel(size.cut);
    size.seam = bevel(size.seam!);
    size.areaMm2 = areaOf(size.cut);
    size.bbox = bboxOf(size.cut);
  }
  if (spreadHoles) {
    for (const piece of seed.job.pieces)
      for (const size of piece.sizes) {
        const { minX, minY } = size.bbox;
        const hole = (x: number, y: number) => [
          { x, y },
          { x, y: y + 7 },
          { x: x + 8, y: y + 7 },
          { x: x + 8, y },
        ];
        size.cutLoops = [hole(minX + 13, minY + 30), hole(minX + 70, minY + 50)];
        size.areaMm2 -= 112;
        size.pointMarks = [{ kind: 'draft-point', at: { x: minX + 22, y: minY + 20 } }];
        size.textMarks = [{ text: 'Pocket', at: { x: minX + 75, y: minY + 20 } }];
      }
  }
  seed.job.dialect = sourceDialect;
  if (nativeDarts) {
    for (const piece of seed.job.pieces)
      for (const size of piece.sizes) {
        const a = size.cut[0]!,
          b = size.cut[1]!,
          center = {
            x: size.cut.reduce((v, p) => v + p.x, 0) / size.cut.length,
            y: size.cut.reduce((v, p) => v + p.y, 0) / size.cut.length,
          };
        const foot = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const common = {
          kind: 'internal' as const,
          origin: 'operator' as const,
          confidence: 1,
          ranges: [],
        };
        size.internal.push(
          {
            ...common,
            label: 'draft-cad:dart',
            closed: false,
            pts: [
              nativeDarts === 'orphan' ? { x: center.x - 8, y: center.y - 9 } : foot(0.4),
              center,
              foot(0.6),
            ],
          },
          {
            ...common,
            label: 'draft-cad:fish-eye',
            closed: true,
            pts: [
              { x: center.x - 3, y: center.y },
              { x: center.x, y: center.y + 2 },
              { x: center.x + 3, y: center.y },
              { x: center.x, y: center.y - 2 },
            ],
          },
        );
        if (spreadHoles)
          size.drills.push({
            kind: 'drill',
            form: 'square',
            at: { x: size.bbox.minX + 25, y: size.bbox.minY + 70 },
            origin: 'operator',
            confidence: 1,
            ranges: [],
          });
        if (nativeDarts === 'ambiguous' || nativeDarts === 'ambiguous-fish-eye') {
          const label = nativeDarts === 'ambiguous' ? 'draft-cad:dart' : 'draft-cad:fish-eye';
          size.internal.push(structuredClone(size.internal.find((p) => p.label === label)!));
        }
      }
  }
  if (frenchCurve) {
    const piece = seed.job.pieces[0]!;
    const size = piece.sizes.find((s) => s.sizeToken === 'M')!;
    const { minX, minY } = size.bbox;
    const controls = [
      { x: minX + 22, y: minY + 17 },
      { x: minX + 38, y: minY + 35 },
      { x: minX + 54, y: minY + 17 },
    ] as const;
    size.internal.push({
      kind: 'internal',
      label: 'draft-cad:french-curve',
      closed: false,
      pts: [controls[0], { x: minX + 38, y: minY + 26 }, controls[2]],
      ...(frenchCurve === 'legacy' ? {} : { authoredQuadratic: controls }),
      origin: 'operator',
      confidence: 1,
      ranges: [],
    });
    if (frenchCurve === 'ambiguous') size.internal.push(structuredClone(size.internal[0]!));
  }
  seed.written = writeDxfDetailed(seed.job, { now: () => new Date('2026-11-17T00:00:00.000Z') });
  if (fiveRanks) {
    const client = new ImportWorkerClient();
    try {
      // Begin the edit on canonical output from a previous ordinary Wizard export.
      const prior = await draftThroughWizardStages(
        new File([seed.written.dxfText], 'five-original-ranks.dxf', { type: 'image/vnd.dxf' }),
        seed.card,
        client,
        undefined,
        undefined,
        sourceDialect,
      );
      const saved = prior.scopes[0]!;
      expect(saved.manifest.gate?.passed).toBe(true);
      seed.written = { ...seed.written, dxfText: saved.dxfText, manifest: saved.manifest };
    } finally {
      client.dispose();
    }
  }
  seed.bytes = new TextEncoder().encode(seed.written.dxfText);
  seed.row = {
    ...seed.row,
    sha256: await digestFullAssemblyFixture(seed.bytes),
    sizeBytes: seed.bytes.byteLength,
  };
  seed.card.existingPatterns![0]!.manifest = seed.written.manifest;
  const source = await createSavedThreePanelSourceV1(seed);
  const n = source.native;
  const draft = structuredClone(n.draft);
  if (n.nativeSewingReplay?.replayReady) {
    draft.dxfProvenance = n.nativeSewingReplay.pipeline;
    draft.dxfPhaseDReplay = n.nativeSewingReplay.replay;
  }
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M'),
    selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  if (!catalog.ok || !selection.ok) throw Error('fixture selection');
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selection.selection,
  );
  if (!projected.ok) throw Error('fixture projection');
  const piece = projected.projection.pieces[0]!,
    ring = piece.contours[0]!,
    a = ring.vertices[0]!,
    b = ring.vertices[1]!;
  const session = createPatternImportDxfPhaseEDraftCadSessionV1({
    revision: 43,
    phaseD: {
      sourceFileId: n.sourceFileId,
      sourceSha256: seed.row.sha256,
      selectedGeometrySha256: selection.selection.selection.selectedGeometrySha256,
    },
    catalog: catalog.catalog,
  });
  if (!session.ok) throw Error('fixture Draft');
  const cmd: PatternImportDxfPhaseEDraftCadCommandV1 = {
    commandId: 'add-42',
    tool: 'add-point',
    target: { pieceId: piece.pieceId, pieceLineKey: piece.pieceLineKey },
    payload: {
      entityId: 'split-42',
      contourId: ring.contourId,
      afterVertexId: a.vertexId,
      pointMm: { x: (a.pointMm.x + b.pointMm.x) / 2, y: (a.pointMm.y + b.pointMm.y) / 2 },
      edge: {
        contourId: ring.contourId,
        boundaryVertexIds: [a.vertexId, b.vertexId],
        progress: 0.5,
      },
    },
  };
  const tx = { transactionId: 'tx-42', label: 'Add point', commands: [cmd] };
  const recorded = recordPatternImportDxfPhaseEDraftCadTransactionV1(session.session, tx);
  if (!recorded.ok) throw Error(JSON.stringify(recorded.blocker));
  const current = {
    session: recorded.session,
    row: seed.row,
    card: seed.card,
    generation: 0,
    sizeToken: 'M',
  };
  const request = {
    sourceOwner: n.sourceOwner,
    sourceRequest: {
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: n.sourceFileId,
      sourceSha256: seed.row.sha256,
      techCardId: seed.row.techCardId,
      scopeKey: 'main',
      patternLineKey: seed.row.patternLineKey,
      cardLockVersion: seed.row.cardLockVersion,
      draft: n.draft,
    },
    savedBytes: seed.bytes.buffer,
    readCurrent: () => current,
  };
  return {
    seed,
    current,
    request,
    tx,
    source,
    initial: session.session,
    compileInput: {
      session: current.session,
      projection: projected.projection,
      selection: selection.selection,
      compileSource: createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft)!,
    },
  };
}

it('seals one selected native interval to the exact Draft session, current saved row and compiled File', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    expect(() => takeSavedAddPointReviewV1({ ...owner })).toThrow();
    const taken = takeSavedAddPointReviewV1(owner);
    expect(await digestFullAssemblyFixture(new Uint8Array(await taken.file.arrayBuffer()))).toBe(
      taken.sha256,
    );
    expect(
      readManifest(await taken.file.text())!.blocks.flatMap((b) =>
        b.protectedLineSplit ? [b.protectedLineSplit.entityId] : [],
      ),
    ).toEqual(['split-42']);
    const copy = new File([await taken.file.arrayBuffer()], taken.file.name);
    await expect(claimSavedAddPointReviewFileV1(copy)).rejects.toThrow('unrecognized');
    const proof = await claimSavedAddPointReviewFileV1(taken.file);
    expect(proof.fileSha256).toBe(taken.sha256);
    expect(isCurrentSavedAddPointReviewClaimV1({ ...proof })).toBe(false);
    expect(isCurrentSavedAddPointReviewClaimV1(proof)).toBe(true);
    f.current.generation++;
    expect(isCurrentSavedAddPointReviewClaimV1(proof)).toBe(false);

    expect(proof.left.path.endPointIndex).toBe(proof.right.path.startPointIndex);
    expect(proof.left.endMm).toEqual(proof.right.startMm);
    expect(proof.left.endVertexId).toBe(proof.right.startVertexId);

    await expect(claimSavedAddPointReviewFileV1(taken.file)).rejects.toThrow();
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow();
  } finally {
    f.source.dispose();
  }
});

it('refuses a replacement history at the same cursor and invalidates the stale review', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(f.current.session);
    if (!undone.ok) throw Error('undo');
    const next = recordPatternImportDxfPhaseEDraftCadTransactionV1(undone.session, {
      ...f.tx,
      transactionId: 'tx-new',
    });
    if (!next.ok) throw Error('record');
    expect(next.session.cursor).toBe(f.current.session.cursor);
    f.current.session = next.session;
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('changed');
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('consumed');
  } finally {
    f.source.dispose();
  }
});
it('rejects a cloned or forged session before consuming the saved-row owner', async () => {
  const f = await fixture();
  try {
    const real = f.current.session;
    f.current.session = structuredClone(real);
    await expect(prepareSavedAddPointReviewV1(f.request)).rejects.toThrow('genuine');
    const forged = recordPatternImportDxfPhaseEDraftCadTransactionV1(
      structuredClone(f.initial),
      f.tx,
    );
    if (!forged.ok) throw Error('record');
    f.current.session = forged.session;
    await expect(prepareSavedAddPointReviewV1(f.request)).rejects.toThrow('genuine');
    f.current.session = real;
    await expect(
      prepareSavedAddPointReviewV1({ ...f.request, sourceOwner: { ...f.request.sourceOwner } }),
    ).rejects.toThrow('capability');
    const taken = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    f.current.row = { ...f.current.row, revision: f.current.row.revision + 1 };
    await expect(claimSavedAddPointReviewFileV1(taken.file)).rejects.toThrow('changed');
  } finally {
    f.source.dispose();
  }
});

it('rejects missing or copied occurrence metadata and forged unsplit native bytes', async () => {
  const f = await fixture();
  try {
    const opened = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    const compiled = await opened.file.text(),
      original = new TextDecoder().decode(f.request.savedBytes);
    const manifest = readManifest(compiled)!;
    const block = manifest.blocks.find((b) => b.protectedLineSplit)!,
      expected = structuredClone(block.protectedLineSplit!);
    const read = async (text: string, expectedBlock = block.block) => {
      const bytes = new TextEncoder().encode(text);
      return readProtectedLineSplit(bytes.buffer, 'hostile-read', {
        fileSha256: await digestFullAssemblyFixture(bytes),
        block: expectedBlock,
        record: expected,
      });
    };
    await expect(read(embedManifest(original, manifest))).rejects.toThrow('native directed ring');
    const missing = structuredClone(manifest);
    delete missing.blocks.find((b) => b.block === block.block)!.protectedLineSplit;
    await expect(read(embedManifest(compiled, missing))).rejects.toThrow('manifest occurrence');
    const other = structuredClone(missing),
      foreign = other.blocks.find((b) => b.block !== block.block)!;
    foreign.protectedLineSplit = expected;
    await expect(read(embedManifest(compiled, other))).rejects.toThrow('manifest occurrence');
    await expect(read(embedManifest(compiled, other), foreign.block)).rejects.toThrow(
      'native directed ring',
    );
  } finally {
    f.source.dispose();
  }
});

it('rejects a saved-row change while rediscovering the reviewed native intervals', async () => {
  const f = await fixture();
  try {
    const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    const pending = claimSavedAddPointReviewFileV1(file);
    f.current.row = { ...f.current.row, cardLockVersion: f.current.row.cardLockVersion + 1 };
    await expect(pending).rejects.toThrow('changed during review');
    await expect(claimSavedAddPointReviewFileV1(file)).rejects.toThrow('previously claimed');
  } finally {
    f.source.dispose();
  }
});

it('rejects an ambiguous current card alias even when the saved row and catalog hashes remain equal', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    const selected = f.tx.commands[0]!.target;
    f.current.card.existingAliases!.push({
      scopeKey: f.current.row.scopeKey,
      blockName: selected.pieceId,
      pieceLineKey: 'other-card-piece',
    });
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('changed');
  } finally {
    f.source.dispose();
  }
});

import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { ImportWorkerClient } from 'lib/pattern-import/worker/client';
import { Session } from 'lib/pattern-import/worker/session';

import type { ImportWorkerRequest, ImportWorkerResponse } from 'lib/pattern-import/types';
import {
  replayPatternImportDxfProductWriterV1,
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
} from 'lib/cloth/domain/pattern-import-dxf-product-writer-replay-v1';

class InProcessTransport {
  onmessage?: (event: { data: ImportWorkerResponse }) => void;
  session?: Session;
  static afterWrite?: () => void;
  static changeWire?: (msg: ImportWorkerRequest) => void;
  constructor() {
    queueMicrotask(() => this.onmessage?.({ data: { type: 'closed', id: -1, sessionId: -1 } }));
  }
  postMessage(message: ImportWorkerRequest, transfer: Transferable[]) {
    const msg = structuredClone(message, { transfer });
    InProcessTransport.changeWire?.(msg);
    void this.respond(msg)
      .then((data) => this.onmessage?.({ data }))
      .catch((error) =>
        this.onmessage?.({
          data: { type: 'error', id: msg.id, code: 'internal', message: String(error) },
        }),
      );
  }
  async respond(msg: ImportWorkerRequest): Promise<ImportWorkerResponse> {
    if (msg.type === 'open') {
      this.session = new Session(7, msg.files, msg.reviewedAddPoint);
      return { type: 'opened', id: msg.id, sessionId: 7, files: this.session.files };
    }
    if (msg.type === 'run') {
      const output = await this.session!.runStage(msg.stage, msg.input, {
        reviewedAddPointAtWrite: msg.reviewedAddPointAtWrite,
        checkCancel() {},
        progress() {},
      });
      if (msg.stage === 'write') InProcessTransport.afterWrite?.();
      return { type: 'result', id: msg.id, stage: msg.stage, output } as ImportWorkerResponse;
    }
    this.session?.close();
    return { type: 'closed', id: msg.id, sessionId: 7 };
  }
  terminate() {
    this.session?.close();
  }
}
it.each([true, false])(
  'runs the normal Worker protocol with stable block identity %s',
  async (stable) => {
    const f = await fixture(stable);
    vi.stubGlobal('Worker', InProcessTransport);
    try {
      const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
      const result = draftThroughWizardStages(file, f.current.card, new ImportWorkerClient());
      if (!stable) {
        await expect(result).rejects.toThrow('block identities differ');
        return;
      }
      const second = await result,
        scope = second.scopes[0]!,
        replay = scope.writerReplay!;
      expect(scope.manifest.gate?.passed).toBe(true);
      const tagged = scope.manifest.blocks.filter((b) => b.protectedLineSplit);
      expect(tagged).toHaveLength(1);
      const block = tagged[0]!,
        record = block.protectedLineSplit!;
      const bytes = new TextEncoder().encode(scope.dxfText),
        sha = await digestFullAssemblyFixture(bytes);
      const native = await readProtectedLineSplit(bytes.buffer, 'independent-final', {
        block: block.block,
        record,
        fileSha256: sha,
      });
      expect(record.ringPointCount).toBe(5);
      expect(native.left.endMm).toEqual(native.right.startMm);
      expect(sha).not.toBe(
        await digestFullAssemblyFixture(new Uint8Array(await file.arrayBuffer())),
      );
      const reproduced = await replayPatternImportDxfProductWriterV1({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
        replay,
        finalManifest: scope.manifest,
        expected: { scopeKey: 'main', exportSha256: sha },
      });
      expect(reproduced.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it.each(['copy', 'missing-record', 'late-row'] as const)(
  'refuses a worker result for %s',
  async (kind) => {
    const f = await fixture(true);
    vi.stubGlobal('Worker', InProcessTransport);
    try {
      const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
      const { directDxfAuthoringOpenFileV1 } = await import('../direct-dxf-authoring-capture-v1');
      const chosen = kind === 'copy' ? new File([await file.arrayBuffer()], file.name) : file;
      const opened = await directDxfAuthoringOpenFileV1(chosen, 0);
      if (kind === 'copy')
        Object.assign(opened, { reviewedAddPoint: { entityId: 'split-42', scopeKey: 'main' } });
      if (kind === 'missing-record') {
        const text = await file.text(),
          m = readManifest(text)!;
        for (const block of m.blocks) delete block.protectedLineSplit;
        opened.bytes = new TextEncoder().encode(embedManifest(text, m)).buffer;
      }
      if (kind === 'late-row')
        InProcessTransport.afterWrite = () => {
          f.current.row = { ...f.current.row, cardLockVersion: f.current.row.cardLockVersion + 1 };
        };
      await expect(
        draftThroughWizardStages(chosen, f.current.card, new ImportWorkerClient(), opened),
      ).rejects.toThrow(
        kind === 'late-row'
          ? 'selection is stale'
          : kind === 'copy'
            ? 'explicit current review'
            : 'exact single DXF',
      );
    } finally {
      InProcessTransport.afterWrite = undefined;
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it.each(['missing', 'alias', 'opening-line'] as const)(
  'independently refuses %s write authorization in the worker',
  async (attack) => {
    const f = await fixture(true);
    vi.stubGlobal('Worker', InProcessTransport);
    try {
      const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
      InProcessTransport.changeWire = (msg) => {
        if (attack === 'opening-line' && msg.type === 'open' && msg.reviewedAddPoint)
          msg.reviewedAddPoint = { ...msg.reviewedAddPoint, pieceLineKey: 'forged-line' };
        if (msg.type !== 'run' || msg.stage !== 'write') return;
        if (attack === 'missing') delete msg.reviewedAddPointAtWrite;
        if (attack === 'alias')
          msg.reviewedAddPointAtWrite = {
            ...msg.reviewedAddPointAtWrite!,
            aliases: msg.reviewedAddPointAtWrite!.aliases.map((a) => ({
              ...a,
              pieceLineKey: 'forged-line',
            })),
          };
      };
      await expect(
        draftThroughWizardStages(file, f.current.card, new ImportWorkerClient()),
      ).rejects.toThrow(attack === 'alias' ? 'ambiguous current card alias' : 'current phase');
    } finally {
      InProcessTransport.changeWire = undefined;
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it('rebinds a restarted worker only after releasing the prior session and rechecking the same File', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  const a = new ImportWorkerClient(),
    b = new ImportWorkerClient();
  try {
    const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    const { directDxfAuthoringOpenFileV1 } = await import('../direct-dxf-authoring-capture-v1');
    const session = await a.open([await directDxfAuthoringOpenFileV1(file, 0)]);
    await expect(b.open([await directDxfAuthoringOpenFileV1(file, 0)])).rejects.toThrow(
      'active worker session',
    );
    await a.close(session.sessionId);
    const result = await draftThroughWizardStages(file, f.current.card, b);
    expect(
      result.scopes[0]!.manifest.blocks.find((e) => e.protectedLineSplit)?.protectedLineSplit
        ?.ringPointCount,
    ).toBe(5);
  } finally {
    a.dispose();
    b.dispose();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

import { adminService } from 'api/api';
import { createCardApply } from '../card-apply';
import type { LiveCard } from 'lib/pattern-import/fabrics/apply';
import {
  claimProtectedSavedReadV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { createDxfProductSavedNativeReprocessOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';

import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { compileDraftForOrdinaryReviewV1 } from './draft-cad-saved-add-point-review-v1';
import { createPatternImportDxfPhaseESavedRowRuntimeV1 } from './saved-row-production-runtime-v1';
import { registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1 } from './patterns-field-compiled-reimport-owner-v1';
import {
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
} from './cad-command-compiled-reimport-handoff-v1';
import { applyDirectDxfReviewedDraftV1 } from '../direct-dxf-authoring-capture-v1';
import { stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1 } from './cad-command-semantic-reimport-session-owner-v1';
function savedUiRuntime(
  f: Awaited<ReturnType<typeof fixture>>,
  read: () => DxfProductSavedRowIdentityV1,
) {
  return createPatternImportDxfPhaseESavedRowRuntimeV1({
    selectedOperationNumber: 10,
    projection: { card: f.current.card, cardLockVersion: f.current.row.cardLockVersion },
    snapshot: {
      bridge: {
        readAuthoritativeRow: async () => {
          const row = read();
          return { row, downloadUrl: row.url };
        },
      },
      authorityAdapter: {
        readAuthoritativeAssembly: async () => {
          throw Error('unexpected Assembly read');
        },
      },
    },
    fetch: async () => new Response(f.request.savedBytes.slice(0)),
  });
}
it.each([false, true])('reviews the paired edge with guard %s', async (guarded) => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  const runtime = savedUiRuntime(f, () => f.current.row);
  const worker = new ImportWorkerClient();
  const reviews: File[] = [];
  const unregister = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
    techCardId: f.current.card.techCardId,
    readConfirmedImportGeneration: () => f.current.generation,
    scopeAvailable: (key) => key === f.current.row.scopeKey,
    reviewAlreadyOpen: () => false,
    openExistingImportReview: (review) => {
      expect(review.requireManualApply).toBe(true);
      reviews.push(...review.files);
    },
  });
  try {
    const visualPiece = f.compileInput.projection.pieces.find(({ pieceId }) => pieceId === 'BP')!;
    const cut = visualPiece.contours.find(({ role }) => role === 'cut-boundary')!;
    const [a, b] = cut.vertices;
    const command: PatternImportDxfPhaseEDraftCadCommandV1 = {
      commandId: 'paired-edge-test',
      tool: 'edge-length',
      target: { pieceId: visualPiece.pieceId, pieceLineKey: visualPiece.pieceLineKey },
      payload: {
        entityId: 'paired-edge-test',
        edge: {
          contourId: cut.contourId,
          boundaryVertexIds: [a!.vertexId, b!.vertexId],
          progress: 0.5,
        },
        sizeToken: 'M',
        fixed: 'end',
        lengthMm: 94,
      },
    };
    const recorded = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
      transactionId: 'paired-edge-tx',
      label: 'Edge length',
      commands: [command],
    });
    if (!recorded.ok) throw Error(JSON.stringify(recorded.blocker));
    const current = { ...f.current, session: recorded.session };
    const input = { ...f.compileInput, session: recorded.session };
    let active = true;
    const reviewedClock = 'asm:v1:paired-edge:1';
    let clock = reviewedClock;
    const authority = guarded
      ? await captureSavedFixedEndAuthorityV1(
          current.row,
          visualPiece.pieceLineKey,
          async () => ({
            row: current.row,
            techCard: {
              id: current.row.techCardId,
              lockVersion: current.row.cardLockVersion,
              techCard: { pieces: [{ lineKey: visualPiece.pieceLineKey }] },
            } as common_TechCard,
          }),
          new AbortController().signal,
          async (_admin, row, options) => {
            expect(row).toEqual(current.row);
            expect(options.sourceOnly).toBe(true);
            if (
              options.expectedServerAssemblyRevision &&
              options.expectedServerAssemblyRevision !== clock
            )
              throw new Error('The reviewed Assembly clock changed.');
            return {
              serverAssemblyRevision: clock,
              sourceSha256: row.sha256,
              rows: [],
              operations: [],
              ownedSeams: [],
              aliases: [],
              garmentLabels: [],
              sourceOnly: true,
              priorCarrier: null,
            };
          },
        )
      : undefined;
    const prepare = () =>
      runtime.prepareSavedPairedAllowance!(current.row, () => (active ? current : null), authority);
    const compiled = await compileDraftForOrdinaryReviewV1(input, undefined, prepare);
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    expect(
      await stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(compiled.artifact, {
        confirmedImportGenerationAtCompile: current.generation,
      }),
    ).toBe(true);
    const handoff = {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
      artifact: compiled.artifact,
      confirmedImportGenerationAtCompile: current.generation,
      cadSessionCursorAtCompile: current.session.cursor,
    };
    const opened = requestPatternImportDxfPhaseECadCommandCompiledReimportV1(handoff);
    if (!opened.ok) throw Error(JSON.stringify(opened.blocker));
    expect(reviews).toHaveLength(1);
    const draft = await draftThroughWizardStages(reviews[0]!, current.card, worker);
    const piece = draft.scopes[0]!.writerReplay!.job.pieces.find(
      ({ identity }) => identity === 'BP',
    )!;
    expect(piece.allowance.allowanceMm).toBe(10);
    expect(piece.sizes[0]!.cut).toHaveLength(4);
    expect(piece.sizes[0]!.seam).toHaveLength(4);
    if (guarded) {
      clock = 'asm:v1:paired-edge:2';
      await expect(verifySavedDartTipApplyV1(draft, reviews, false, () => true)).rejects.toThrow(
        /reviewed Assembly clock changed/,
      );
      clock = reviewedClock;
    }
    await expect(verifySavedDartTipApplyV1(draft, reviews, false, () => true)).resolves.toEqual(
      authority?.replacement,
    );
    const stale = await compileDraftForOrdinaryReviewV1(input, undefined, async () => {
      const owner = await prepare();
      active = false;
      return owner;
    });
    expect(stale).toMatchObject({ ok: false, blockers: [{ code: 'source-binding-mismatch' }] });
    expect(requestPatternImportDxfPhaseECadCommandCompiledReimportV1(handoff)).toMatchObject({
      ok: false,
      blocker: { code: 'reimport-request-invalid' },
    });
    expect(reviews).toHaveLength(1);
  } finally {
    worker.dispose();
    unregister();
    runtime.dispose();
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it('reopens the protected saved row through the normal worker and rejects stale or foreign evidence', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  let stored = new Uint8Array(),
    savedRow: DxfProductSavedRowIdentityV1 | undefined;
  const url = 'https://saved-full-assembly.invalid/new-protected.dxf';
  const upload = vi
    .spyOn(adminService, 'UploadPattern')
    .mockImplementation(async ({ raw, filename }) => {
      stored = Uint8Array.from(atob(raw!), (c) => c.charCodeAt(0));
      return { url, filename, sizeBytes: stored.length };
    });
  let authoritative = f.current.row;
  const runtime = savedUiRuntime(f, () => authoritative);
  const reviews: File[] = [];
  const unregister = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
    techCardId: f.current.card.techCardId,
    readConfirmedImportGeneration: () => f.current.generation,
    scopeAvailable: (key) => key === f.current.row.scopeKey,
    reviewAlreadyOpen: () => false,
    openExistingImportReview: (review) => {
      expect(review.requireManualApply).toBe(true);
      reviews.push(...review.files);
    },
  });
  try {
    const compile = () => runtime.prepareSavedAddPointReview!(f.current.row, () => f.current);
    const compiled = await compileDraftForOrdinaryReviewV1(f.compileInput, compile);
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    expect(
      await stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(compiled.artifact, {
        confirmedImportGenerationAtCompile: f.current.generation,
      }),
    ).toBe(true);
    const handoff = {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
      artifact: compiled.artifact,
      confirmedImportGenerationAtCompile: f.current.generation,
      cadSessionCursorAtCompile: f.current.session.cursor,
    };
    expect(
      requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
        ...handoff,
        artifact: { ...compiled.artifact },
      }).ok,
    ).toBe(false);
    expect(requestPatternImportDxfPhaseECadCommandCompiledReimportV1(handoff).ok).toBe(true);
    expect(requestPatternImportDxfPhaseECadCommandCompiledReimportV1(handoff).ok).toBe(false);
    expect(reviews).toHaveLength(1);
    expect(upload).not.toHaveBeenCalled();
    const file = reviews[0]!;
    expect(await file.text()).toBe(compiled.artifact.dxfText);
    const card = structuredClone(f.current.card),
      prior = f.current.row,
      scope = card.scopes[0]!;
    const draft = await draftThroughWizardStages(file, card, new ImportWorkerClient());
    const live: LiveCard = {
      patterns: [
        {
          ...card.existingPatterns![0]!,
          fabricPurpose: scope.fabricPurpose,
          bomLineKey: scope.bomLineKey,
          sizeId: 7,
        },
      ],
      pieces: card.existingPieces,
      aliases: card.existingAliases!.map((a) => ({
        ...a,
        fabricPurpose: scope.fabricPurpose,
        bomLineKey: scope.bomLineKey,
      })),
    };
    const apply = createCardApply({
      read: () => live,
      write: (path, value) => {
        if (!Array.isArray(value)) throw Error('unexpected form edit');
        if (path === 'patterns') live.patterns = value;
        else if (path === 'pieces') live.pieces = value;
        else if (path === 'pieceDxfAliases') live.aliases = value;
        else throw Error(path);
      },
      scopeOf: (row) =>
        row.bomLineKey === scope.bomLineKey && row.fabricPurpose === scope.fabricPurpose
          ? scope.scopeKey
          : '',
      storageSizeId: 7,
      readPreviousLockVersion: () => prior.cardLockVersion,
      save: async () => {
        const committed = live.patterns.find((p) => p.url === url)!;
        savedRow = {
          techCardId: card.techCardId,
          scopeKey: scope.scopeKey,
          patternLineKey: committed.lineKey!,
          revision: prior.revision + 1,
          cardLockVersion: prior.cardLockVersion + 1,
          url: committed.url!,
          sizeBytes: committed.sizeBytes!,
          sha256: committed.sha256!,
        };
        return 'ok';
      },
    });
    const submit = (token?: number, current = true) =>
      applyDirectDxfReviewedDraftV1(
        draft,
        [file],
        token,
        () => current,
        () => apply(draft),
      );
    await expect(submit(2)).rejects.toThrow('Apply button');
    const original = authoritative;
    authoritative = { ...original, revision: original.revision + 1 };
    await expect(submit()).rejects.toThrow();
    authoritative = original;
    await expect(submit(undefined, false)).rejects.toThrow('changed');
    expect(upload).not.toHaveBeenCalled();
    const applied = await submit();
    expect(applied.ok && applied.commitReceipt, JSON.stringify(applied)).toBeTruthy();
    const row = savedRow!;
    expect(row.revision).toBeGreaterThan(prior.revision);
    expect(row.cardLockVersion).toBeGreaterThan(prior.cardLockVersion);
    if (!applied.ok || !applied.commitReceipt) throw Error('expected confirmed save');
    expect(applied.commitReceipt.previousLockVersion).toBe(prior.cardLockVersion);
    expect(applied.commitReceipt.scopes).toMatchObject([
      { patternLineKey: row.patternLineKey, patternUrl: row.url },
    ]);
    expect(row.sha256).toBe(await digestFullAssemblyFixture(stored));
    expect(row.sha256).not.toBe(prior.sha256);
    const saved = readManifest(new TextDecoder().decode(stored))!;
    card.existingPatterns = [
      { ...card.existingPatterns![0]!, url: row.url, lineKey: row.patternLineKey, manifest: saved },
    ];
    card.existingAliases = live.aliases.map((a) => ({
      scopeKey: scope.scopeKey,
      blockName: a.blockName!,
      pieceLineKey: a.pieceLineKey!,
    }));
    const run = async (
      expected: DxfProductSavedRowIdentityV1,
      bytes: Uint8Array,
      mode: 'exact' | 'copy' | 'late-row' | 'late-alias' = 'exact',
    ) => {
      let projections = 0,
        rowReads = 0;
      const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
        resolveCard: async () => ({
          card:
            ++projections > 1 && mode === 'late-alias' ? { ...card, existingAliases: [] } : card,
          cardLockVersion: expected.cardLockVersion,
        }),
        readAuthoritativeRow: async () => ({
          row:
            ++rowReads > 1 && mode === 'late-row'
              ? {
                  ...expected,
                  patternLineKey: 'next-row',
                  revision: expected.revision + 1,
                  cardLockVersion: expected.cardLockVersion + 1,
                }
              : expected,
          downloadUrl: url,
        }),
        fetch: async () => new Response(Uint8Array.from(bytes)),
      });
      let expired: Parameters<typeof claimProtectedSavedReadV1>[0] | undefined;
      const owner = createDxfProductSavedNativeReprocessOwnerV1({
        ...host,
        reprocess: async (input, signal, progress) => {
          expired = input;
          return host.reprocess(mode === 'copy' ? { ...input } : input, signal, progress);
        },
      });
      try {
        const result = await owner.run({
          schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
          row: expected,
        });
        if (expired) expect(() => claimProtectedSavedReadV1(expired!)).toThrow('active verified');
        return result;
      } finally {
        owner.dispose();
        host.dispose();
      }
    };
    const verified = await run(row, stored);
    expect(verified.ok, JSON.stringify(verified.blockers)).toBe(true);
    if (!verified.ok) throw Error('expected verified row');
    const restored = verified.draft.scopes[0]!;
    const kept = restored.writerReplay!.retainedLineSplit!;
    expect(verified.row).toEqual(row);
    expect(kept.record.sourceSha256).toBe(prior.sha256);
    expect(kept.record.ringPointCount).toBe(5);
    expect(kept.block).toBe('BP_M');
    const proof = await readProtectedLineSplit(stored.slice().buffer, verified.sourceFileId, {
      fileSha256: row.sha256,
      block: kept.block,
      record: kept.record,
    });
    expect(proof.left.endVertexId).toBe(proof.right.startVertexId);
    expect([proof.left.startMm, proof.left.endMm, proof.right.endMm]).toEqual([
      kept.record.fromMm,
      kept.record.pointMm,
      kept.record.toMm,
    ]);
    expect(
      restored.writerReplay!.job.pieces.find((p) => p.identity === kept.identity)!.sizes[0]![
        kept.record.role
      ],
    ).toHaveLength(5);
    expect(
      (
        await replayPatternImportDxfProductWriterV1({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
          replay: restored.writerReplay!,
          finalManifest: restored.manifest,
          expected: { scopeKey: row.scopeKey, exportSha256: row.sha256 },
        })
      ).ok,
    ).toBe(true);
    for (const mode of ['copy', 'late-alias', 'late-row'] as const) {
      const refused = await run(row, stored, mode);
      expect(refused.ok).toBe(false);
      expect(refused.blockers[0]?.code).toBe(
        mode === 'late-row' ? 'saved-row-revalidation-failed' : 'saved-dxf-reprocess-failed',
      );
    }
    const badRaw = stored.slice();
    badRaw[0] ^= 1;
    expect((await run(row, badRaw)).blockers[0]?.code).toBe('saved-row-sha256-mismatch');
    const copy = structuredClone(saved);
    copy.blocks.find((b) => b.protectedLineSplit)!.protectedLineSplit!.ringSha256 = 'f'.repeat(64);
    const tampered = new TextEncoder().encode(
      embedManifest(new TextDecoder().decode(stored), copy),
    );
    expect(
      (
        await run(
          { ...row, sizeBytes: tampered.length, sha256: await digestFullAssemblyFixture(tampered) },
          tampered,
        )
      ).blockers[0]?.code,
    ).toBe('saved-dxf-reprocess-failed');
    const missing = structuredClone(saved);
    delete missing.blocks.find((b) => b.protectedLineSplit)!.protectedLineSplit;
    const unmarked = new TextEncoder().encode(
      embedManifest(new TextDecoder().decode(stored), missing),
    );
    expect(
      (
        await run(
          { ...row, sizeBytes: unmarked.length, sha256: await digestFullAssemblyFixture(unmarked) },
          unmarked,
        )
      ).ok,
    ).toBe(false);
  } finally {
    unregister();
    runtime.dispose();
    upload.mockRestore();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

it('blocks the Draft Compile action on mixed history, missing current row, and a copied recorded session', async () => {
  const f = await fixture(true);
  try {
    const extra = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.current.session, {
      transactionId: 'other',
      label: 'Other command',
      commands: [
        {
          ...f.tx.commands[0]!,
          commandId: 'other-command',
          payload: { ...f.tx.commands[0]!.payload, entityId: 'other-entity' },
        },
      ],
    });
    if (!extra.ok) throw Error('expected recorded transaction');
    const prepare = vi.fn(() => prepareSavedAddPointReviewV1(f.request));
    expect(
      (
        await compileDraftForOrdinaryReviewV1(
          { ...f.compileInput, session: extra.session },
          prepare,
        )
      ).ok,
    ).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect((await compileDraftForOrdinaryReviewV1(f.compileInput)).ok).toBe(false);
    const copy = await compileDraftForOrdinaryReviewV1(
      { ...f.compileInput, session: structuredClone(f.current.session) },
      prepare,
    );
    expect(copy.ok).toBe(false);
  } finally {
    f.source.dispose();
  }
});

it('blocks the compiled review when ordinary saved semantics would rename the selected identity', async () => {
  const f = await fixture(false);
  vi.stubGlobal('Worker', InProcessTransport);
  const runtime = savedUiRuntime(f, () => f.current.row);
  try {
    const result = await compileDraftForOrdinaryReviewV1(f.compileInput, () =>
      runtime.prepareSavedAddPointReview!(f.current.row, () => f.current),
    );
    expect(result.ok).toBe(false);
    expect(result.artifact).toBeNull();
  } finally {
    runtime.dispose();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

it.each([
  [
    'pen',
    'DRAFTPEN1',
    [
      { x: 15, y: 30 },
      { x: 115, y: 30 },
      { x: 115, y: 90 },
      { x: 75, y: 68 },
      { x: 15, y: 90 },
    ],
  ],
  [
    'rectangle',
    'DRAFTRECT1',
    [
      { x: 15, y: 30 },
      { x: 115, y: 90 },
    ],
  ],
  [
    'circle',
    'DRAFTCIRCLE1',
    [
      { x: 65, y: 60 },
      { x: 115, y: 60 },
    ],
  ],
  [
    'ellipse',
    'DRAFTELLIPSE1',
    [
      { x: 65, y: 60 },
      { x: 115, y: 60 },
      { x: 65, y: 90 },
    ],
  ],
] as const)(
  'marks a new %s piece before Apply and reopens the separate saved piece with both native boundaries',
  async (tool, pieceId, points) => {
    const f = await fixture(true);
    vi.stubGlobal('Worker', InProcessTransport);
    const worker = new ImportWorkerClient();
    const url = `https://saved-full-assembly.invalid/created-${tool}-piece.dxf`;
    let stored = new Uint8Array();
    let committed: DxfProductSavedRowIdentityV1 | undefined;
    const files: File[] = [];
    const unregister = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
      techCardId: f.current.card.techCardId,
      readConfirmedImportGeneration: () => f.current.generation,
      scopeAvailable: (scopeKey) => scopeKey === f.current.row.scopeKey,
      reviewAlreadyOpen: () => false,
      openExistingImportReview: (review) => {
        expect(review.requireManualApply).toBe(true);
        files.push(...review.files);
      },
    });
    const upload = vi
      .spyOn(adminService, 'UploadPattern')
      .mockImplementation(async ({ raw, filename }) => {
        stored = Uint8Array.from(atob(raw!), (char) => char.charCodeAt(0));
        return { url, filename, sizeBytes: stored.length };
      });
    try {
      const { recordPatternImportDxfPhaseEDraftCadCanvasPointV1 } = await import(
        './draft-cad-canvas-v1'
      );
      const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
        './draft-cad-geometry-compile-v1'
      );
      const pendingPoints = tool === 'pen' ? points : points.slice(0, -1);
      const pointMm = points[points.length - 1]!;
      const edit = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
        session: f.initial,
        projection: f.compileInput.projection,
        activePieceIndex: 0,
        activeTool: tool,
        sequence: 0,
        pendingPoints,
        pointMm,
        closePen: tool === 'pen',
      });
      expect(edit.recorded).toBe(true);
      const drill = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
        session: edit.session,
        projection: f.compileInput.projection,
        activePieceIndex: 0,
        activeDraftPieceId: pieceId,
        activeTool: 'mark',
        sequence: edit.sequence,
        pendingPoints: [],
        pointMm: { x: 65, y: 53 },
      });
      expect(drill.recorded).toBe(true);
      expect(drill.session.history[1]?.commands[0]?.target).toEqual({
        pieceId,
        pieceLineKey: `draft-${tool}:1`,
      });
      const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
        f.source.native.draft,
      );
      if (!compileSource) throw Error('Missing exact compile source.');
      const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session: drill.session,
        projection: f.compileInput.projection,
        selection: f.compileInput.selection,
        compileSource,
      });
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      const compiledCut = compiled.artifact.compiledJob.pieces.find(
        ({ identity }) => identity === pieceId,
      )?.sizes[0]?.cut;
      if (!compiledCut) throw Error('The selected new piece did not produce a cut boundary.');
      expect(
        await stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(compiled.artifact, {
          confirmedImportGenerationAtCompile: f.current.generation,
        }),
      ).toBe(true);
      expect(
        requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
          artifact: compiled.artifact,
          confirmedImportGenerationAtCompile: f.current.generation,
          cadSessionCursorAtCompile: drill.session.cursor,
        }).ok,
      ).toBe(true);
      expect(files).toHaveLength(1);
      const [file] = files as [File];
      const card = structuredClone(f.current.card);
      const prior = f.current.row;
      const scope = card.scopes[0]!;
      const reviewed = await draftThroughWizardStages(file, card, worker, undefined, (initial) => {
        const proposals = initial.grainProposals ?? [];
        expect(proposals).toHaveLength(1);
        const { seed, a, b, evidence } = proposals[0]!;
        expect(initial.blocked).toMatchObject([{ seed, reason: 'no-grain' }]);
        return { operatorGrain: { [seed]: { a, b, accepted: evidence } } };
      });
      const currentPattern = reviewed.scopes[0]!;
      const created = currentPattern.writerReplay!.job.pieces.find(
        ({ identity }) => identity === pieceId,
      );
      expect(created?.allowance.allowanceMm).toBe(0);
      expect(created?.sizes[0]?.cut).toHaveLength(compiledCut.length);
      expect(created?.sizes[0]?.drills).toHaveLength(1);
      expect(currentPattern.manifest.gate?.passed).toBe(true);
      const [newPiece] = reviewed.pieces.filter((piece) => piece.basis === 'new');
      expect(newPiece?.lineKey).toBeTruthy();
      expect(card.existingPieces.some((piece) => piece.lineKey === newPiece?.lineKey)).toBe(false);
      expect(upload).not.toHaveBeenCalled();

      const live: LiveCard = {
        patterns: [
          {
            ...card.existingPatterns![0]!,
            fabricPurpose: scope.fabricPurpose,
            bomLineKey: scope.bomLineKey,
            sizeId: 7,
          },
        ],
        pieces: card.existingPieces,
        aliases: card.existingAliases!.map((alias) => ({
          ...alias,
          fabricPurpose: scope.fabricPurpose,
          bomLineKey: scope.bomLineKey,
        })),
      };
      const apply = createCardApply({
        read: () => live,
        write: (path, value) => {
          if (!Array.isArray(value)) throw Error('unexpected form edit');
          if (path === 'patterns') live.patterns = value;
          else if (path === 'pieces') live.pieces = value;
          else if (path === 'pieceDxfAliases') live.aliases = value;
          else throw Error(path);
        },
        scopeOf: (row) =>
          row.bomLineKey === scope.bomLineKey && row.fabricPurpose === scope.fabricPurpose
            ? scope.scopeKey
            : '',
        storageSizeId: 7,
        readPreviousLockVersion: () => prior.cardLockVersion,
        save: async () => {
          const row = live.patterns.find((pattern) => pattern.url === url)!;
          committed = {
            ...prior,
            patternLineKey: row.lineKey!,
            revision: prior.revision + 1,
            cardLockVersion: prior.cardLockVersion + 1,
            url: row.url!,
            sizeBytes: row.sizeBytes!,
            sha256: row.sha256!,
          };
          return 'ok';
        },
      });
      const applied = await applyDirectDxfReviewedDraftV1(
        reviewed,
        [file],
        undefined,
        () => true,
        () => apply(reviewed),
      );
      expect(applied.ok && applied.commitReceipt, JSON.stringify(applied)).toBeTruthy();
      expect(upload).toHaveBeenCalledTimes(1);
      const row = committed!;
      expect(row.sha256).toBe(await digestFullAssemblyFixture(stored));
      const savedManifest = readManifest(new TextDecoder().decode(stored))!;
      const nativeBlock = savedManifest.blocks.find(({ identity }) => identity === pieceId)!;
      expect(nativeBlock.hasSeam).toBe(true);
      expect(nativeBlock.drills).toBe(1);
      const restored = await createSavedThreePanelSourceV1(
        {
          ...(await createSavedThreePanelFixtureV1(2)),
          bytes: stored,
          row,
          card: {
            ...card,
            existingPieces: live.pieces.map((piece) => {
              const { lineKey, name, cutSymmetry } = piece;
              if (!lineKey || !name || !cutSymmetry) throw Error('Saved piece identity missing.');
              return { ...piece, lineKey, name, cutSymmetry };
            }),
            existingPatterns: [
              {
                ...card.existingPatterns![0]!,
                url,
                lineKey: row.patternLineKey,
                manifest: savedManifest,
              },
            ],
            existingAliases: live.aliases.map(({ blockName, pieceLineKey }) => ({
              scopeKey: scope.scopeKey,
              blockName: blockName!,
              pieceLineKey: pieceLineKey!,
            })),
          },
        },
        true,
      );
      try {
        const { native } = restored;
        expect(native.row).toEqual(row);
        expect(
          native.nativeSewingReplay?.replayReady,
          JSON.stringify(native.nativeSewingReplay?.blockers),
        ).toBe(true);
        const reread = native.draft.scopes[0]!.writerReplay!.job.pieces.find(
          ({ identity }) => identity === pieceId,
        );
        expect(reread?.allowance.allowanceMm).toBe(0);
        expect(reread?.sizes[0]?.cut).toHaveLength(compiledCut.length);
        expect(reread?.sizes[0]?.drills).toHaveLength(1);
        expect(reread?.sizes[0]?.seam).toEqual(reread?.sizes[0]?.cut);
        expect(native.draft.aliases).toContainEqual(
          expect.objectContaining({
            blockName: pieceId,
            pieceLineKey: newPiece?.lineKey,
          }),
        );
      } finally {
        restored.dispose();
      }
    } finally {
      unregister();
      upload.mockRestore();
      worker.dispose();
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it('retains one authored single notch on its exact saved-size piece through the ordinary Wizard', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  const worker = new ImportWorkerClient();
  try {
    const {
      buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
      recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
    } = await import('./draft-cad-canvas-v1');
    const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
      './draft-cad-geometry-compile-v1'
    );
    const { projection, selection } = f.compileInput;
    const [base] = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(f.initial, projection, 0);
    if (!base) throw Error('Fixture lacks a current anchored boundary.');
    const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      session: f.initial,
      projection,
      activeTool: 'notch',
      activePieceIndex: 0,
      sequence: 0,
      baseKey: base.key,
    });
    expect(edit.recorded).toBe(true);
    const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
      f.source.native.draft,
    );
    if (!compileSource) throw Error('Fixture lacks a current writer source.');
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: edit.session,
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    const target = compiled.artifact.compiledFeatures[0]!;
    expect(target).toMatchObject({ output: 'notch', sizeToken: 'M' });
    const before = f.source.native.draft.scopes[0]!.manifest.blocks;
    const file = new File([compiled.artifact.dxfText], 'main-cad-compiled.dxf', {
      type: 'image/vnd.dxf',
    });
    const reviewed = await draftThroughWizardStages(file, f.current.card, worker);
    expect(reviewed.scopes[0]!.manifest.gate?.passed).toBe(true);
    const expected = before.map(({ identity, sizeToken, notches }) => ({
      identity,
      sizeToken,
      notches: notches + Number(identity === target.pieceId && sizeToken === target.sizeToken),
    }));
    expect(
      reviewed.scopes[0]!.manifest.blocks.map(({ identity, sizeToken, notches }) => ({
        identity,
        sizeToken,
        notches,
      })),
    ).toEqual(expected);
  } finally {
    worker.dispose();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

it.each(['double', 'triple', 'v'] as const)(
  'preserves %s notch groups as native layer-4 strokes after ordinary review and fresh read',
  async (notchKind) => {
    const f = await fixture(true);
    vi.stubGlobal('Worker', InProcessTransport);
    const worker = new ImportWorkerClient();
    try {
      const {
        buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
        recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
      } = await import('./draft-cad-canvas-v1');
      const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
        './draft-cad-geometry-compile-v1'
      );
      const { parseDxf } = await import('lib/nesting/dxf/parse');
      const { projection, selection } = f.compileInput;
      const target = projection.pieces[0]!;
      const contour = target.contours.find(({ role }) => role === 'cut-boundary')!;
      const base = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
        f.initial,
        projection,
        0,
      ).find(({ anchor }) => anchor.contourId === contour.contourId);
      if (!base) throw Error('Fixture lacks the exact cut edge.');
      const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
        session: f.initial,
        projection,
        activeTool: 'notch',
        activePieceIndex: 0,
        sequence: 0,
        baseKey: base.key,
        notchKind,
      });
      expect(edit.recorded).toBe(true);
      const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
        f.source.native.draft,
      );
      if (!compileSource) throw Error('Fixture lacks a writer source.');
      const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session: edit.session,
        projection,
        selection,
        compileSource,
      });
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      const strokeCount = notchKind === 'triple' ? 3 : 2;
      const checkStrokes = (job: typeof compiled.artifact.compiledJob) => {
        const size = job.pieces.find(({ identity }) => identity === target.pieceId)!.sizes[0]!;
        const strokes = size.notches.filter(({ authoredGroup }) => authoredGroup);
        expect(strokes).toHaveLength(strokeCount);
        expect(
          strokes.map(({ authoredGroup }) => [authoredGroup?.shape, authoredGroup?.index]),
        ).toEqual(Array.from({ length: strokeCount }, (_, index) => [notchKind, index]));
        if (notchKind === 'v') expect(strokes[0]!.seg[1]).toEqual(strokes[1]!.seg[1]);
        else expect(strokes[0]!.seg[1]).not.toEqual(strokes[1]!.seg[1]);
      };
      for (const dialect of ['r12', 'r2000'] as const) {
        const written = writeDxfDetailed({ ...compiled.artifact.compiledJob, dialect });
        const block = written.manifest.blocks.find(({ identity }) => identity === target.pieceId)!;
        expect(block.authoredNotches).toEqual([
          {
            groupId: expect.any(String),
            shape: notchKind,
            firstStroke: expect.any(Number),
            vertices: expect.any(Array),
          },
        ]);
        expect(block.authoredNotches![0]!.vertices).toHaveLength(strokeCount * 4);
        const raw = parseDxf(new TextEncoder().encode(written.dxfText).buffer, 'mm');
        expect(
          raw.dxf.blocks[block.block]!.entities.filter(
            ({ layer, type }) => layer === '4' && type === 'LINE',
          ),
        ).toHaveLength(block.notches);
        const file = new File([written.dxfText], 'native-notches.dxf', { type: 'image/vnd.dxf' });
        const scope = (await draftThroughWizardStages(file, f.current.card, worker)).scopes[0]!;
        expect(scope.manifest.gate?.passed).toBe(true);
        checkStrokes(scope.writerReplay!.job);

        const bytes = new TextEncoder().encode(scope.dxfText);
        const row = {
          ...f.current.row,
          revision: f.current.row.revision + 1,
          cardLockVersion: f.current.row.cardLockVersion + 1,
          sizeBytes: bytes.length,
          sha256: await digestFullAssemblyFixture(bytes),
        };
        const card = structuredClone(f.current.card);
        card.existingPatterns![0]!.manifest = scope.manifest;
        const reopened = await createSavedThreePanelSourceV1(
          { ...(await createSavedThreePanelFixtureV1(2)), bytes, row, card },
          true,
        );
        try {
          expect(reopened.native.row).toEqual(row);
          checkStrokes(reopened.native.draft.scopes[0]!.writerReplay!.job);
        } finally {
          reopened.dispose();
        }

        if (dialect === 'r12') {
          const altered = readManifest(written.dxfText)!;
          altered.blocks.find(
            ({ identity }) => identity === target.pieceId,
          )!.authoredNotches![0]!.vertices[0]! += 100;
          const stale = new File([embedManifest(written.dxfText, altered)], file.name, {
            type: file.type,
          });
          await expect(draftThroughWizardStages(stale, f.current.card, worker)).rejects.toThrow(
            'saved layer-4 stroke',
          );
        }
      }
    } finally {
      worker.dispose();
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it.each(['internal-line', 'pattern-line', 'french-curve', 'guideline', 'cross'] as const)(
  'reopens the authored %s as the same typed native layer-8 path after ordinary review',
  async (tool) => {
    const f = await fixture(true);
    vi.stubGlobal('Worker', InProcessTransport);
    const worker = new ImportWorkerClient();
    try {
      const { recordPatternImportDxfPhaseEDraftCadCanvasPointV1 } = await import(
        './draft-cad-canvas-v1'
      );
      const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
        './draft-cad-geometry-compile-v1'
      );
      const { projection, selection } = f.compileInput;
      const pieceId = projection.pieces[0]!.pieceId;
      const contour = projection.pieces[0]!.contours[0]!;
      const points = contour.vertices.map(({ pointMm }) => pointMm);
      const minX = Math.min(...points.map(({ x }) => x));
      const minY = Math.min(...points.map(({ y }) => y));
      const width = Math.max(...points.map(({ x }) => x)) - minX;
      const height = Math.max(...points.map(({ y }) => y)) - minY;
      const start = { x: minX + width * 0.25, y: minY + height * 0.25 };
      const control = { x: minX + width * 0.5, y: minY + height * 0.65 };
      const end = { x: minX + width * 0.75, y: minY + height * 0.25 };
      const edit = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
        session: f.initial,
        projection,
        activeTool: tool === 'cross' ? 'mark' : tool,
        ...(tool === 'cross' ? { markKind: 'cross' as const } : {}),
        activePieceIndex: 0,
        sequence: 0,
        pendingPoints: tool === 'french-curve' ? [start, control] : [start],
        pointMm: tool === 'cross' ? control : end,
      });
      expect(edit.recorded).toBe(true);
      const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
        f.source.native.draft,
      );
      if (!compileSource) throw Error('Fixture lacks a current writer source.');
      let current = edit.session;
      if (tool === 'french-curve') {
        const command = current.history[0]!.commands[0]!;
        if (command.tool !== 'french-curve') throw Error('Expected a recorded French curve.');
        const moved = { x: control.x, y: minY + height * 0.81 };
        const input = {
          transactionId: 'move-french-control-point',
          commandId: command.commandId,
          target: command.target,
          handle: 1 as const,
          expected: command.payload.controlPointsMm,
          pointMm: moved,
        };
        const revised = recordDraftCadFrenchCurveHandleV1(current, input);
        expect(revised.ok).toBe(true);
        if (!revised.ok) throw Error(revised.blocker.detail);
        expect(revised.session.cursor).toBe(2);
        expect(activeDraftCadTransactionsV1(revised.session)).toHaveLength(1);
        const commands = activeDraftCadTransactionsV1(revised.session)[0]!.commands;
        expect(commands).toMatchObject([
          {
            commandId: command.commandId,
            payload: {
              entityId: command.payload.entityId,
              controlPointsMm: [start, moved, end],
            },
          },
        ]);
        expect(
          recordDraftCadFrenchCurveHandleV1(revised.session, { ...input, transactionId: 'stale' })
            .ok,
        ).toBe(false);
        expect(recordDraftCadFrenchCurveHandleV1(structuredClone(current), input).ok).toBe(false);
        const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(revised.session);
        if (!undone.ok) throw Error(undone.blocker.detail);
        expect(activeDraftCadTransactionsV1(undone.session)[0]!.commands).toEqual([command]);
        const redone = redoPatternImportDxfPhaseEDraftCadSessionV1(undone.session);
        if (!redone.ok) throw Error(redone.blocker.detail);
        expect(activeDraftCadTransactionsV1(redone.session)[0]!.commands).toEqual(commands);
        expect(
          compilePatternImportDxfPhaseEDraftCadGeometryV1({
            session: structuredClone(redone.session),
            projection,
            selection,
            compileSource,
          }),
        ).toMatchObject({
          ok: false,
          blockers: [{ code: 'invalid-input' }],
        });
        current = redone.session;
      }
      const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session: current,
        projection,
        selection,
        compileSource,
      });
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      const label = `draft-cad:${tool}`;
      const first = compiled.artifact.manifest.blocks.find(({ identity }) => identity === pieceId)!;
      if (tool === 'french-curve') {
        const original = compilePatternImportDxfPhaseEDraftCadGeometryV1({
          session: edit.session,
          projection,
          selection,
          compileSource,
        });
        if (!original.ok) throw Error(JSON.stringify(original.blockers));
        const sourcePath = original.artifact.manifest.blocks.find(
          ({ identity }) => identity === pieceId,
        )?.authoredInternal?.[0]?.vertices;
        expect(sourcePath).toBeDefined();
        expect(first.authoredInternal?.[0]?.vertices).not.toEqual(sourcePath);
      }

      expect(first.authoredInternal).toHaveLength(1);
      expect(first.authoredInternal?.[0]?.label).toBe(label);
      const file = new File([compiled.artifact.dxfText], 'main-cad-compiled.dxf', {
        type: 'image/vnd.dxf',
      });
      const reviewed = await draftThroughWizardStages(file, f.current.card, worker);
      const scope = reviewed.scopes[0]!;
      const feature = scope
        .writerReplay!.job.pieces.find(({ identity }) => identity === pieceId)
        ?.sizes[0]?.internal.find((candidate) => candidate.label === label);
      expect(feature?.closed).toBe(false);
      expect(feature?.pts.length).toBeGreaterThan(tool === 'french-curve' ? 3 : 2);
      const second = scope.manifest.blocks.find(({ identity }) => identity === pieceId)!;
      expect(second.authoredInternal).toHaveLength(1);
      expect(second.authoredInternal?.[0]?.label).toBe(label);
      expect(scope.manifest.gate?.passed).toBe(true);
      if (tool === 'cross') {
        expect(second.drills).toBe(first.drills);
        const points = feature!.pts;
        for (const coordinate of ['x', 'y'] as const) {
          const axis = points.map((point) => point[coordinate]);
          expect(Math.max(...axis) - Math.min(...axis)).toBeCloseTo(6);
        }
        const outside = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
          session: f.initial,
          projection,
          activeTool: 'mark',
          activePieceIndex: 0,
          sequence: 0,
          pendingPoints: [],
          pointMm: { x: minX - 2, y: minY - 2 },
          markKind: 'cross',
        });
        expect(
          compilePatternImportDxfPhaseEDraftCadGeometryV1({
            session: outside.session,
            projection,
            selection,
            compileSource,
          }),
        ).toMatchObject({
          ok: false,
          blockers: [{ detail: 'Place the full cross inside the selected cut.' }],
        });
      }
      if (tool === 'french-curve') {
        const bytes = new TextEncoder().encode(scope.dxfText);
        const row = {
          ...f.current.row,
          revision: f.current.row.revision + 1,
          cardLockVersion: f.current.row.cardLockVersion + 1,
          sizeBytes: bytes.byteLength,
          sha256: await digestFullAssemblyFixture(bytes),
        };
        const card = structuredClone(f.current.card);
        card.existingPatterns![0]!.manifest = scope.manifest;
        const reopened = await createSavedThreePanelSourceV1(
          { ...(await createSavedThreePanelFixtureV1(2)), bytes, row, card },
          true,
        );
        try {
          expect(reopened.native.row).toEqual(row);
          expect(reopened.native.nativeSewingReplay?.replayReady).toBe(true);
          const reopenedFeature = reopened.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
            ({ identity }) => identity === pieceId,
          )?.sizes[0]?.internal.find((candidate) => candidate.label === label);
          expect(reopenedFeature?.pts).toHaveLength(feature!.pts.length);
          expect(reopenedFeature?.closed).toBe(false);
          expect(first.authoredInternal?.[0]?.quadratic).toHaveLength(6);
          expect(second.authoredInternal?.[0]?.quadratic).toEqual(
            first.authoredInternal?.[0]?.quadratic,
          );
          expect(reopenedFeature?.authoredQuadratic).toEqual(feature?.authoredQuadratic);
          expect(reopenedFeature?.authoredQuadratic).toHaveLength(3);
        } finally {
          reopened.dispose();
        }
        const altered = readManifest(compiled.artifact.dxfText)!;
        const block = altered.blocks.find(({ identity }) => identity === pieceId)!;
        block.authoredInternal![0]!.vertices[0]! += 100;
        const changed = new File(
          [embedManifest(compiled.artifact.dxfText, altered)],
          'main-cad-compiled.dxf',
          { type: 'image/vnd.dxf' },
        );
        await expect(
          draftThroughWizardStages(changed, f.current.card, new ImportWorkerClient()),
        ).rejects.toThrow('saved layer-8 path');
      }
    } finally {
      worker.dispose();
      vi.unstubAllGlobals();
      f.source.dispose();
    }
  },
);

it('preserves the two dart types in both DXF dialects, including a small fish-eye', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  const worker = new ImportWorkerClient();
  try {
    const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
      './draft-cad-geometry-compile-v1'
    );
    const { projection, selection } = f.compileInput;
    const target = projection.pieces[0]!;
    const contour = target.contours.find(({ role }) => role === 'cut-boundary')!;
    const vertices = contour.vertices;
    const center = {
      x: vertices.reduce((sum, vertex) => sum + vertex.pointMm.x, 0) / vertices.length,
      y: vertices.reduce((sum, vertex) => sum + vertex.pointMm.y, 0) / vertices.length,
    };
    const fishEye = {
      commandId: 'fish-eye-a',
      tool: 'fish-eye',
      target,
      payload: { entityId: 'fish-eye-a', centerMm: center, axisMm: 4, intakeMm: 8, rotationDeg: 0 },
    } as const;
    const dart = {
      commandId: 'dart-a',
      tool: 'dart',
      target,
      payload: {
        entityId: 'dart-a',
        base: {
          contourId: contour.contourId,
          boundaryVertexIds: [vertices[0]!.vertexId, vertices[1]!.vertexId],
          progress: 0.5,
        },
        apexMm: center,
        intakeMm: 12,
      },
    } as const;
    const record = (commands: readonly PatternImportDxfPhaseEDraftCadCommandV1[]) =>
      recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
        transactionId: 'typed-darts',
        label: 'Add darts',
        commands,
      });
    const recorded = record([dart, fishEye]);
    if (!recorded.ok) throw Error(JSON.stringify(recorded.blocker));
    const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
      f.source.native.draft,
    );
    if (!compileSource) throw Error('Fixture lacks a current writer source.');
    const compile = (session: typeof recorded.session) =>
      compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session,
        projection,
        selection,
        compileSource,
      });
    const compiled = compile(recorded.session);
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    const expected = [
      { label: 'draft-cad:dart', closed: false, count: 3 },
      { label: 'draft-cad:fish-eye', closed: true, count: 4 },
    ];
    const findSize = (job: typeof compiled.artifact.compiledJob) =>
      job.pieces.find(({ identity }) => identity === target.pieceId)!.sizes[0]!;
    const original = findSize(compiled.artifact.compiledJob);
    const originalNames = compiled.artifact.compiledJob.pieces.map(
      ({ identity }) => [identity, `Original ${identity} panel`] as const,
    );
    const displayNames = new Map(originalNames);
    const checkDarts = (size: typeof original) => {
      expect(size.drills).toHaveLength(original.drills.length);
      expect(size.cutLoops).toEqual(original.cutLoops);
      expect(
        size.internal
          .filter(({ label }) => label === 'draft-cad:dart' || label === 'draft-cad:fish-eye')
          .map(({ label, closed, pts }) => ({ label, closed, count: pts.length })),
      ).toEqual(expected);
    };
    for (const dialect of ['r12', 'r2000'] as const) {
      const written = writeDxfDetailed({
        ...compiled.artifact.compiledJob,
        dialect,
        pieces: compiled.artifact.compiledJob.pieces.map((piece) => ({
          ...piece,
          displayName: displayNames.get(piece.identity)!,
        })),
      });
      const metadata = written.manifest.blocks.find(({ identity }) => identity === target.pieceId)!;
      expect(
        metadata.authoredInternal?.map(({ label, closed, vertices }) => ({
          label,
          closed,
          count: vertices.length / 2,
        })),
      ).toEqual(expected);
      const file = new File([written.dxfText], 'native-darts.dxf', { type: 'image/vnd.dxf' });
      const reviewed = await draftThroughWizardStages(file, f.current.card, worker);
      const scope = reviewed.scopes[0]!;
      expect(scope.manifest.gate?.passed).toBe(true);
      expect(
        scope.manifest.pieces.map(({ identity, displayName }) => [identity, displayName]),
      ).toEqual(originalNames);
      checkDarts(findSize(scope.writerReplay!.job));
      const bytes = new TextEncoder().encode(scope.dxfText);
      const row = {
        ...f.current.row,
        revision: f.current.row.revision + 1,
        cardLockVersion: f.current.row.cardLockVersion + 1,
        sizeBytes: bytes.length,
        sha256: await digestFullAssemblyFixture(bytes),
      };
      const card = structuredClone(f.current.card);
      card.existingPatterns![0]!.manifest = scope.manifest;
      const reopened = await createSavedThreePanelSourceV1(
        { ...(await createSavedThreePanelFixtureV1(2)), bytes, row, card },
        true,
      );
      try {
        expect(reopened.native.row).toEqual(row);
        const reopenedScope = reopened.native.draft.scopes[0]!;
        expect(
          reopenedScope.manifest.pieces.map(({ identity, displayName }) => [identity, displayName]),
        ).toEqual(originalNames);
        checkDarts(findSize(reopenedScope.writerReplay!.job));
      } finally {
        reopened.dispose();
      }
    }
    const outside = record([{ ...fishEye, payload: { ...fishEye.payload, axisMm: 1_000 } }]);
    if (!outside.ok) throw Error(JSON.stringify(outside.blocker));
    expect(compile(outside.session)).toMatchObject({
      ok: false,
      blockers: [
        { detail: 'Keep the complete dart inside the selected cut and outside its holes.' },
      ],
    });
  } finally {
    worker.dispose();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

it('reopens both construction points through the normal DXF writer and fresh saved read', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  try {
    const { recordPatternImportDxfPhaseEDraftCadCanvasPointV1 } = await import(
      './draft-cad-canvas-v1'
    );
    const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
      './draft-cad-geometry-compile-v1'
    );
    const { AUTHORED_POINT_LAYERS } = await import('lib/pattern-import/manifest/authored-point');
    const { parseDxf } = await import('lib/nesting/dxf/parse');
    const { projection, selection } = f.compileInput;
    const piece = projection.pieces[0]!;
    const vertices = piece.contours[0]!.vertices;
    const center = {
      x: vertices.reduce((sum, vertex) => sum + vertex.pointMm.x, 0) / vertices.length,
      y: vertices.reduce((sum, vertex) => sum + vertex.pointMm.y, 0) / vertices.length,
    };
    const input = {
      session: f.initial,
      projection,
      activePieceIndex: 0,
      sequence: 0,
      pendingPoints: [],
      pointMm: center,
    } as const;
    const firstPoint = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
      ...input,
      activeTool: 'draft-point',
    });
    expect(firstPoint.recorded).toBe(true);
    const secondPoint = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
      ...input,
      activeTool: 'point-only',
      session: firstPoint.session,
      sequence: 1,
      pointMm: { x: center.x + 1, y: center.y + 2 },
    });
    expect(secondPoint.recorded).toBe(true);
    const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
      f.source.native.draft,
    );
    if (!compileSource) throw Error('Fixture lacks a current writer source.');
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: secondPoint.session,
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    expect(compiled.artifact.compiledFeatures.map(({ output }) => output)).toEqual([
      'point-mark',
      'point-mark',
    ]);
    const source = compiled.artifact.compiledJob.pieces.find(
      ({ identity }) => identity === piece.pieceId,
    )!.sizes[0]!;
    const before = compiled.artifact.manifest.blocks.find(
      ({ identity }) => identity === piece.pieceId,
    )!;
    const outside = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
      ...input,
      activeTool: 'point-only',
      pointMm: { x: Math.min(...vertices.map(({ pointMm }) => pointMm.x)) - 1, y: center.y },
    });
    expect(
      compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session: outside.session,
        projection,
        selection,
        compileSource,
      }),
    ).toMatchObject({
      ok: false,
      blockers: [{ detail: 'Place the point inside the selected cut.' }],
    });
    for (const dialect of ['r12', 'r2000'] as const) {
      const written = writeDxfDetailed({ ...compiled.artifact.compiledJob, dialect });
      const native = parseDxf(new TextEncoder().encode(written.dxfText).buffer, 'mm');
      expect(
        native.dxf.blocks[before.block]!.entities.filter(({ type }) => type === 'POINT').map(
          ({ layer }) => layer,
        ),
      ).toEqual(expect.arrayContaining(Object.values(AUTHORED_POINT_LAYERS)));
      const file = new File([written.dxfText], 'main-cad-compiled.dxf', { type: 'image/vnd.dxf' });
      const reviewed = await draftThroughWizardStages(
        file,
        f.current.card,
        new ImportWorkerClient(),
      );
      const scope = reviewed.scopes[0]!;
      expect(scope.manifest.gate?.passed).toBe(true);
      const rereadPiece = scope.writerReplay!.job.pieces.find(
        ({ identity }) => identity === piece.pieceId,
      )!;
      expect(rereadPiece.sizes.map(({ sizeToken }) => sizeToken)).toEqual(['M']);
      expect(rereadPiece.piecesPerGarment).toBe(1);
      function assertPoints(size: typeof source) {
        expect(size.drills).toHaveLength(source.drills.length);
        expect(size.notches).toHaveLength(source.notches.length);
        expect(size.internal).toHaveLength(source.internal.length);
        const [start, end] = size.pointMarks!;
        expect(size.pointMarks?.map(({ kind }) => kind)).toEqual(['draft-point', 'point-only']);
        expect(Math.hypot(end!.at.x - start!.at.x, end!.at.y - start!.at.y)).toBeCloseTo(
          Math.sqrt(5),
          5,
        );
      }
      assertPoints(rereadPiece.sizes[0]!);

      const bytes = new TextEncoder().encode(scope.dxfText);
      const row = {
        ...f.current.row,
        revision: f.current.row.revision + 1,
        cardLockVersion: f.current.row.cardLockVersion + 1,
        sizeBytes: bytes.length,
        sha256: await digestFullAssemblyFixture(bytes),
      };
      const card = structuredClone(f.current.card);
      card.existingPatterns![0]!.manifest = scope.manifest;
      const restored = await createSavedThreePanelSourceV1(
        { ...(await createSavedThreePanelFixtureV1(2)), bytes, row, card },
        true,
      );
      try {
        expect(restored.native.row).toEqual(row);
        const pieces = restored.native.draft.scopes[0]!.writerReplay!.job.pieces;
        assertPoints(pieces.find(({ identity }) => identity === piece.pieceId)!.sizes[0]!);
        expect(
          pieces
            .filter(({ identity }) => identity !== piece.pieceId)
            .every(({ sizes }) => sizes.every(({ pointMarks }) => !pointMarks?.length)),
        ).toBe(true);
      } finally {
        restored.dispose();
      }
    }
  } finally {
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

it('reopens a native text mark without turning it into size, fold or quantity metadata', async () => {
  const f = await fixture(true);
  vi.stubGlobal('Worker', InProcessTransport);
  try {
    const { recordPatternImportDxfPhaseEDraftCadCanvasPointV1 } = await import(
      './draft-cad-canvas-v1'
    );
    const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
      './draft-cad-geometry-compile-v1'
    );
    const { AUTHORED_TEXT_LAYER } = await import('lib/pattern-import/manifest/authored-text');
    const { parseDxf } = await import('lib/nesting/dxf/parse');
    const { projection, selection } = f.compileInput;
    const piece = projection.pieces[0]!;
    const vertices = piece.contours[0]!.vertices;
    const pointMm = {
      x: vertices.reduce((sum, vertex) => sum + vertex.pointMm.x, 0) / vertices.length,
      y: vertices.reduce((sum, vertex) => sum + vertex.pointMm.y, 0) / vertices.length,
    };
    const input = {
      session: f.initial,
      projection,
      activeTool: 'mark',
      activePieceIndex: 0,
      sequence: 0,
      pendingPoints: [],
      pointMm,
      markKind: 'text',
    } as const;
    expect(recordPatternImportDxfPhaseEDraftCadCanvasPointV1(input).recorded).toBe(false);
    const markText = 'SIZE: XL · CUT 2 · СГИБ';
    const edit = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({ ...input, markText });
    expect(edit.recorded).toBe(true);
    const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
      f.source.native.draft,
    );
    if (!compileSource) throw Error('Fixture lacks a current writer source.');
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: edit.session,
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    const first = compiled.artifact.manifest.blocks.find(
      ({ identity }) => identity === piece.pieceId,
    )!;
    expect(first.authoredText).toEqual([expect.objectContaining({ text: markText })]);
    expect(compiled.artifact.compiledFeatures[0]).toMatchObject({
      output: 'text-mark',
      pieceId: piece.pieceId,
      sizeToken: 'M',
    });

    for (const dialect of ['r12', 'r2000'] as const) {
      const written = writeDxfDetailed(
        { ...compiled.artifact.compiledJob, dialect },
        { now: () => new Date('2026-11-17T00:00:00.000Z') },
      );
      const native = parseDxf(new TextEncoder().encode(written.dxfText).buffer, 'mm');
      expect(
        native.dxf.blocks[first.block]!.entities.filter(
          ({ layer, type }) => layer === AUTHORED_TEXT_LAYER && type === 'TEXT',
        ),
      ).toHaveLength(1);
      const file = new File([written.dxfText], 'main-cad-compiled.dxf', {
        type: 'image/vnd.dxf',
      });
      const reviewed = await draftThroughWizardStages(
        file,
        f.current.card,
        new ImportWorkerClient(),
      );
      const scope = reviewed.scopes[0]!;
      expect(scope.manifest.gate?.passed).toBe(true);
      const nativePiece = scope.writerReplay!.job.pieces.find(
        ({ identity }) => identity === piece.pieceId,
      )!;
      expect(nativePiece.piecesPerGarment).toBe(1);
      expect(nativePiece.unfoldedFold).toBe(false);
      expect(nativePiece.sizes.map(({ sizeToken }) => sizeToken)).toEqual(['M']);
      expect(nativePiece.sizes[0]!.textMarks).toEqual([
        expect.objectContaining({ text: markText }),
      ]);
      expect(nativePiece.sizes[0]!.fold).toBeNull();
      const latest = scope.manifest.blocks.find(({ identity }) => identity === piece.pieceId)!;
      expect(latest.internal).toBe(first.internal);
      expect(latest.drills).toBe(first.drills);
      if (dialect === 'r12') {
        const { nativePieceCopyVerifier } = await import(
          'lib/pattern-import/fabrics/native-piece-copy-review'
        );
        const { asciiText } = await import('lib/pattern-import/write/format');
        const copy = structuredClone(
          compiled.artifact.compiledJob.pieces.find(({ identity }) => identity === piece.pieceId)!,
        );
        copy.identity = 'MARKCOPY';
        copy.code = 'MARKCOPY';
        copy.displayName = 'MARKCOPY';
        copy.seed += 100;
        const copied = writeDxfDetailed(
          {
            ...compiled.artifact.compiledJob,
            dialect,
            pieces: [...compiled.artifact.compiledJob.pieces, copy],
          },
          { now: () => new Date('2026-11-17T00:00:00.000Z') },
        );
        const verify = nativePieceCopyVerifier(written.dxfText, piece.pieceId, copy.identity);
        expect(() => verify(copied.dxfText)).not.toThrow();
        const replacedCaption = readManifest(copied.dxfText)!;
        replacedCaption.blocks.find(
          ({ identity }) => identity === copy.identity,
        )!.authoredText![0]!.text = asciiText(markText);
        expect(() => verify(embedManifest(copied.dxfText, replacedCaption))).toThrow(
          'duplicate changed a native layer, mark, coordinate or rank',
        );

        const bytes = new TextEncoder().encode(scope.dxfText);
        const row = {
          ...f.current.row,
          revision: f.current.row.revision + 1,
          cardLockVersion: f.current.row.cardLockVersion + 1,
          sizeBytes: bytes.length,
          sha256: await digestFullAssemblyFixture(bytes),
        };
        const card = structuredClone(f.current.card);
        card.existingPatterns![0]!.manifest = scope.manifest;
        const restored = await createSavedThreePanelSourceV1(
          { ...(await createSavedThreePanelFixtureV1(2)), bytes, row, card },
          true,
        );
        try {
          expect(restored.native.row).toEqual(row);
          const pieces = restored.native.draft.scopes[0]!.writerReplay!.job.pieces;
          const reread = pieces.find(({ identity }) => identity === piece.pieceId)?.sizes[0];
          expect(reread?.textMarks).toEqual([expect.objectContaining({ text: markText })]);
        } finally {
          restored.dispose();
        }

        const altered = readManifest(written.dxfText)!;
        altered.blocks.find(
          ({ identity }) => identity === piece.pieceId,
        )!.authoredText![0]!.anchor[0] += 100;
        const moved = new File([embedManifest(written.dxfText, altered)], file.name, {
          type: file.type,
        });
        await expect(
          draftThroughWizardStages(moved, f.current.card, new ImportWorkerClient()),
        ).rejects.toThrow('saved CAD text marks');
      }
    }
  } finally {
    vi.unstubAllGlobals();
    f.source.dispose();
  }
});

async function checkNativeOutlinePointEdit(
  tool:
    | 'move-point'
    | 'delete-point'
    | 'sharpen-corner'
    | 'allowance-offset'
    | 'dart-tip'
    | 'dart-intake'
    | 'fish-eye-move'
    | 'parallel-spread',
  fiveRanks = false,
  sourceDialect: 'r12' | 'r2000' = 'r12',
  repeatedMoves = false,
) {
  const savedIntake = tool === 'dart-intake';
  const savedDartEdit = tool === 'dart-tip' || savedIntake || tool === 'fish-eye-move';
  const allowanceOffset = tool === 'allowance-offset';
  const offsetMm = sourceDialect === 'r12' ? 4.123456 : -3.123457;
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(
    true,
    allowanceOffset,
    fiveRanks,
    savedDartEdit,
    sourceDialect,
    tool === 'parallel-spread' || tool === 'fish-eye-move' || savedIntake || allowanceOffset,
    undefined,
    tool === 'sharpen-corner',
  );
  const worker = new ImportWorkerClient();
  let authoritativeAllowanceRow = f.current.row;
  const allowanceRuntime = allowanceOffset
    ? savedUiRuntime(f, () => authoritativeAllowanceRow)
    : null;
  let authoritativeOutlineRow = f.current.row;
  const outlineRuntime = repeatedMoves ? savedUiRuntime(f, () => authoritativeOutlineRow) : null;
  const reviewFiles: File[] = [];
  const unregister = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
    techCardId: f.current.card.techCardId,
    readConfirmedImportGeneration: () => f.current.generation,
    scopeAvailable: (key) => key === f.current.row.scopeKey,
    reviewAlreadyOpen: () => reviewFiles.length > 0,
    openExistingImportReview: (review) => {
      expect(review.requireManualApply).toBe(true);
      reviewFiles.push(...review.files);
    },
  });
  const url = 'https://saved-full-assembly.invalid/moved-outline.dxf';
  let stored = new Uint8Array();
  const upload = vi
    .spyOn(adminService, 'UploadPattern')
    .mockImplementation(async ({ raw, filename }) => {
      stored = Uint8Array.from(atob(raw!), (char) => char.charCodeAt(0));
      return { url, filename, sizeBytes: stored.length };
    });
  try {
    const {
      buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1,
      buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
      recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
      recordPatternImportDxfPhaseEDraftCadMovePointV1,
      recordPatternImportDxfPhaseEDraftCadDeletePointV1,
    } = await import('./draft-cad-canvas-v1');
    const { parseDxf } = await import('lib/nesting/dxf/parse');
    const { entityToChain } = await import('lib/nesting/dxf/entities');
    const { projection } = f.compileInput;
    const pieceIndex =
      tool === 'sharpen-corner' || allowanceOffset
        ? projection.pieces.findIndex(({ pieceId }) => pieceId === 'FP')
        : 0;
    const vertices = buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
      f.initial,
      projection,
      pieceIndex,
      true,
    );
    const [point, next] = vertices;
    if (!point || !next) throw Error('The exact source outline has no adjacent points.');
    const progress = fiveRanks ? 0.05 : 0.15;
    const shift = {
      x: (next.pointMm.x - point.pointMm.x) * progress,
      y: (next.pointMm.y - point.pointMm.y) * progress,
    };
    const pointMm = { x: point.pointMm.x + shift.x, y: point.pointMm.y + shift.y };
    const input = {
      session: f.initial,
      projection,
      activePieceIndex: pieceIndex,
      sequence: 0,
      vertexKey: point.key,
    };
    const targetPiece = projection.pieces[pieceIndex]!;
    const emptyInput = { ...f.compileInput, session: f.initial };
    const savedDart =
      tool === 'dart-tip' || savedIntake ? selectSavedDartTipV1(emptyInput, targetPiece) : null;
    const nextTip =
      savedDart && tool === 'dart-tip'
        ? { x: savedDart.apexMm.x + 3, y: savedDart.apexMm.y - 4 }
        : null;
    const left = savedDart?.savedTip.original[0];
    const right = savedDart?.savedTip.original[2];
    if (savedIntake) {
      expect(savedDart?.intakeSourcePathId).toBeTypeOf('number');
      expect(left?.y).toBe(right?.y);
      expect(left?.x).toBeLessThan(right!.x);
    }
    // On this horizontal native edge the 8 mm increase moves each original foot 4 mm.
    const deltaFor = (i: number) => (savedIntake ? { x: i === 0 ? -4 : 4, y: 0 } : { x: 3, y: -4 });
    const fishEye =
      tool === 'fish-eye-move' ? selectSavedFishEyeMoveV1(emptyInput, targetPiece) : null;
    const nextCenter = fishEye ? { x: fishEye.centerMm.x + 3, y: fishEye.centerMm.y - 4 } : null;
    const movedDart =
      savedIntake && savedDart
        ? recordSavedDartIntakeV1(
            emptyInput,
            targetPiece,
            Number((savedDart.intakeMm + 8).toFixed(6)),
          )
        : nextTip
          ? recordSavedDartTipV1(emptyInput, targetPiece, nextTip)
          : nextCenter && recordSavedFishEyeMoveV1(emptyInput, targetPiece, nextCenter);
    const selected = targetPiece.contours.find((c) => c.role === 'cut-boundary')!;
    const bounds = bboxOf(selected.vertices.map((v) => v.pointMm)),
      slashX = bounds.minX + 38;
    let spreadSession: typeof f.initial | null = null;
    if (tool === 'parallel-spread') {
      const canvas = await import('./draft-cad-canvas-v1');
      const target = { pieceId: targetPiece.pieceId, pieceLineKey: targetPiece.pieceLineKey };
      const cut = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
        transactionId: 'initial-cut',
        label: 'Vertical cut',
        commands: [
          {
            tool: 'cut',
            commandId: 'first-cut',
            target,
            payload: {
              pointsMm: [
                { x: slashX, y: bounds.minY - 30 },
                { x: slashX, y: bounds.maxY + 30 },
              ],
              keepSide: 'both',
              entityId: 'first-slash',
            },
          },
        ],
      });
      if (!cut.ok) throw Error(cut.blocker.detail);
      const spread = canvas.recordDraftParallelOpeningV1(cut.session, target, 12, 1);
      if (!spread?.recorded.ok) throw Error('The selected Cut could not register the opening.');
      spreadSession = spread.recorded.session;
    }
    let sharpenedSession: typeof f.initial | null = null;
    let sharpenedOutline: (typeof vertices)[number]['pointMm'][] | null = null;
    if (tool === 'sharpen-corner') {
      const bevelEdges = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
        f.initial,
        projection,
        pieceIndex,
      ).filter(({ anchor }) => anchor.contourId === selected.contourId);
      const bevel = bevelEdges.find(
        ({ fromMm, toMm }) => fromMm.x !== toMm.x && fromMm.y !== toMm.y,
      );
      if (!bevel) throw Error('The exact native bevel was not found.');
      const pick = { ...input, activeTool: 'sharpen-corner' as const };
      const unsupported = bevelEdges.find(({ key }) => key !== bevel.key)!;
      expect(
        recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
          ...pick,
          baseKey: unsupported.key,
        }).recorded,
      ).toBe(false);
      expect(
        recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({ ...pick, baseKey: 'stale-id' })
          .recorded,
      ).toBe(false);
      const sharp = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
        ...pick,
        baseKey: bevel.key,
      });
      if (!sharp.recorded)
        throw Error(sharp.blocker ?? 'The selected bevel could not be sharpened.');
      const corner = { x: bounds.minX, y: bounds.minY };
      sharpenedOutline = vertices.flatMap(({ anchor, pointMm }) => {
        if (anchor.vertexId === bevel.anchor.boundaryVertexIds[0]) return [corner];
        return anchor.vertexId === bevel.anchor.boundaryVertexIds[1] ? [] : [pointMm];
      });
      expect(sharpenedOutline).toHaveLength(vertices.length - 1);
      expect(areaOf(sharpenedOutline) - areaOf(vertices.map(({ pointMm }) => pointMm))).toBe(2);
      const undo = undoPatternImportDxfPhaseEDraftCadSessionV1(sharp.session);
      if (!undo.ok) throw Error(undo.blocker.detail);
      expect(undo.session.cursor).toBe(0);
      const redo = redoPatternImportDxfPhaseEDraftCadSessionV1(undo.session);
      if (!redo.ok) throw Error(redo.blocker.detail);
      expect(redo.session.history).toEqual(sharp.session.history);
      sharpenedSession = redo.session;
    }
    let offsetSession: typeof f.initial | null = null;
    if (allowanceOffset) {
      const edge = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
        f.initial,
        projection,
        pieceIndex,
      ).find(
        ({ anchor, fromMm, toMm }) =>
          anchor.contourId === selected.contourId &&
          fromMm.y === bounds.maxY &&
          toMm.y === bounds.maxY,
      );
      if (!edge) throw Error('The top native cut edge is unavailable.');
      const pick = { ...input, activeTool: 'allowance-offset' as const, baseKey: edge.key };
      expect(
        recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
          ...pick,
          allowanceOffsetMm: 0.0000001,
        }).recorded,
      ).toBe(false);
      expect(
        recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
          ...pick,
          baseKey: 'another-edge',
          allowanceOffsetMm: offsetMm,
        }).recorded,
      ).toBe(false);
      const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
        ...pick,
        allowanceOffsetMm: offsetMm,
      });
      if (!edit.recorded) throw Error(edit.blocker ?? 'The saved allowance offset did not record.');
      expect(
        await compileDraftForOrdinaryReviewV1({ ...f.compileInput, session: edit.session }),
      ).toMatchObject({ ok: false, blockers: [{ code: 'paired-allowance-authority-required' }] });
      const tooDeep = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
        ...pick,
        allowanceOffsetMm: -15,
      });
      expect(tooDeep.recorded).toBe(true);
      f.current.session = tooDeep.session;
      expect(
        await compileDraftForOrdinaryReviewV1(
          { ...f.compileInput, session: tooDeep.session },
          undefined,
          () => allowanceRuntime!.prepareSavedPairedAllowance!(f.current.row, () => f.current),
        ),
      ).toMatchObject({ ok: false, blockers: [{ code: 'allowance-offset-geometry-blocked' }] });
      offsetSession = edit.session;
    }
    let outlineSession: typeof f.initial | null = null;
    let movedOutline: (typeof vertices)[number]['pointMm'][] | null = null;
    const runOutlineReview = () =>
      outlineRuntime!.prepareSavedGeometryReview!(f.current.row, () => f.current);
    if (repeatedMoves) {
      const across = (a: typeof point, b: typeof next, ratio: number) => ({
        x: Number((a.pointMm.x + (b.pointMm.x - a.pointMm.x) * ratio).toFixed(6)),
        y: Number((a.pointMm.y + (b.pointMm.y - a.pointMm.y) * ratio).toFixed(6)),
      });
      const third = vertices[2]!;
      const firstPosition = across(point, next, 0.025);
      const nextPosition = across(next, third, 0.025);
      const finalPosition = across(point, next, 0.035);
      const first = recordPatternImportDxfPhaseEDraftCadMovePointV1({
        ...input,
        pointMm: firstPosition,
      });
      const adjacent = recordPatternImportDxfPhaseEDraftCadMovePointV1({
        ...input,
        session: first.session,
        vertexKey: next.key,
        pointMm: nextPosition,
      });
      const again = recordPatternImportDxfPhaseEDraftCadMovePointV1({
        ...input,
        session: adjacent.session,
        pointMm: finalPosition,
      });
      expect([first.recorded, adjacent.recorded, again.recorded]).toEqual([true, true, true]);
      expect(again.session.cursor).toBe(3);
      const undo = undoPatternImportDxfPhaseEDraftCadSessionV1(again.session);
      if (!undo.ok) throw Error(undo.blocker.detail);
      const redo = redoPatternImportDxfPhaseEDraftCadSessionV1(undo.session);
      if (!redo.ok) throw Error(redo.blocker.detail);
      const shown = (session: typeof f.initial) =>
        buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
          session,
          projection,
          pieceIndex,
          true,
        );
      expect(
        shown(undo.session)
          .slice(0, 2)
          .map(({ key, pointMm }) => [key, pointMm]),
      ).toEqual([
        [point.key, firstPosition],
        [next.key, nextPosition],
      ]);
      expect(
        shown(redo.session)
          .slice(0, 2)
          .map(({ key, pointMm }) => [key, pointMm]),
      ).toEqual([
        [point.key, finalPosition],
        [next.key, nextPosition],
      ]);
      movedOutline = [finalPosition, nextPosition, ...vertices.slice(2).map((v) => v.pointMm)];
      const { buildPatternImportDxfPhaseEDraftCadPreviewV1 } = await import(
        './draft-cad-preview-v1'
      );
      expect(buildPatternImportDxfPhaseEDraftCadPreviewV1(redo.session, projection)).toMatchObject({
        previewReady: true,
        primitives: [
          { tool: 'move-point' },
          { tool: 'move-point' },
          { tool: 'move-point', closed: true, pointsMm: movedOutline },
        ],
      });
      const collapse = recordPatternImportDxfPhaseEDraftCadMovePointV1({
        ...input,
        session: adjacent.session,
        pointMm: nextPosition,
      });
      expect(collapse.recorded).toBe(true);
      f.current.session = collapse.session;
      expect(
        await compileDraftForOrdinaryReviewV1(
          { ...f.compileInput, session: collapse.session },
          undefined,
          undefined,
          runOutlineReview,
        ),
      ).toMatchObject({ ok: false, blockers: [{ code: 'move-point-geometry-blocked' }] });
      expect(reviewFiles).toHaveLength(0);
      outlineSession = redo.session;
      expect(
        await compileDraftForOrdinaryReviewV1({ ...f.compileInput, session: outlineSession }),
      ).toMatchObject({ ok: false, blockers: [{ code: 'move-point-geometry-blocked' }] });
    }
    const shapeSession = spreadSession ?? sharpenedSession ?? offsetSession ?? outlineSession;
    const edit = shapeSession
      ? { recorded: true, blocker: null, session: shapeSession }
      : savedDartEdit
        ? {
            recorded: movedDart?.ok,
            blocker: movedDart?.blocker?.detail,
            session: movedDart?.session ?? f.initial,
          }
        : tool === 'move-point'
          ? recordPatternImportDxfPhaseEDraftCadMovePointV1({ ...input, pointMm })
          : recordPatternImportDxfPhaseEDraftCadDeletePointV1(input);
    expect(edit.recorded, edit.blocker ?? '').toBe(true);
    if (savedIntake) {
      const undo = undoPatternImportDxfPhaseEDraftCadSessionV1(edit.session);
      if (!undo.ok) throw Error(undo.blocker.detail);
      expect(selectSavedDartTipV1({ ...emptyInput, session: undo.session }, targetPiece)).toEqual(
        savedDart,
      );
      const redo = redoPatternImportDxfPhaseEDraftCadSessionV1(undo.session);
      if (!redo.ok) throw Error(redo.blocker.detail);
      expect(activeDraftCadTransactionsV1(redo.session)).toEqual(
        activeDraftCadTransactionsV1(edit.session),
      );
    }
    f.current.session = edit.session;
    const verifyRow = vi.fn(async () => {});
    if (tool === 'sharpen-corner')
      expect(
        await compileDraftForOrdinaryReviewV1({ ...f.compileInput, session: edit.session }),
      ).toMatchObject({ ok: false, blockers: [{ code: 'sharpen-corner-geometry-blocked' }] });
    const compiled = await compileDraftForOrdinaryReviewV1(
      { ...f.compileInput, session: edit.session },
      undefined,
      allowanceRuntime
        ? () => allowanceRuntime.prepareSavedPairedAllowance!(f.current.row, () => f.current)
        : undefined,
      repeatedMoves
        ? runOutlineReview
        : savedDartEdit || tool === 'parallel-spread' || tool === 'sharpen-corner'
          ? () => compileSavedDartTipReviewV1(f.request, verifyRow)
          : undefined,
    );
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    if (repeatedMoves)
      expect(compiled.artifact.compiledFeatures.map(({ output }) => output)).toEqual([
        'moved-saved-vertex',
        'moved-saved-vertex',
        'moved-saved-vertex',
      ]);
    if (allowanceOffset)
      expect(compiled.artifact.compiledFeatures).toMatchObject([
        { output: 'allowance-offset', sizeToken: 'M' },
      ]);
    if (savedIntake)
      expect(compiled.artifact.compiledFeatures).toMatchObject([
        { output: 'adjusted-dart-intake' },
      ]);
    expect(
      await stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(compiled.artifact, {
        confirmedImportGenerationAtCompile: f.current.generation,
      }),
    ).toBe(true);
    if (savedDartEdit) {
      expect(f.source.native.draft.scopes[0]!.writerReplay!.job.dialect).toBe(sourceDialect);
      expect(compiled.artifact.compiledJob.dialect).toBe(sourceDialect);
      for (const text of [new TextDecoder().decode(f.seed.bytes), compiled.artifact.dxfText])
        expect(text).toContain(sourceDialect === 'r12' ? 'AC1009' : 'AC1015');
    }
    const handoff = {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
      artifact: compiled.artifact,
      confirmedImportGenerationAtCompile: f.current.generation,
      cadSessionCursorAtCompile: edit.session.cursor,
    };
    const opened = requestPatternImportDxfPhaseECadCommandCompiledReimportV1(handoff);
    if (!opened.ok) throw Error(JSON.stringify(opened.blocker));
    expect(reviewFiles).toHaveLength(1);
    const [file] = reviewFiles;
    if (!file) throw Error('The Patterns owner did not open the compiled DXF.');
    expect(await file.text()).toBe(compiled.artifact.dxfText);
    const reviewed = await draftThroughWizardStages(
      file,
      f.current.card,
      worker,
      undefined,
      undefined,
      tool === 'sharpen-corner' || savedIntake || allowanceOffset || repeatedMoves
        ? sourceDialect
        : 'r12',
    );
    const scope = reviewed.scopes[0]!;
    if (tool === 'sharpen-corner' || allowanceOffset)
      expect(scope.dxfText).toContain(sourceDialect === 'r12' ? 'AC1009' : 'AC1015');
    expect(scope.manifest.gate?.passed).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    if (
      savedDartEdit ||
      tool === 'parallel-spread' ||
      tool === 'sharpen-corner' ||
      allowanceOffset ||
      repeatedMoves
    ) {
      const noWrite = vi.fn();
      await expect(
        applyDirectDxfReviewedDraftV1(reviewed, [file], 1, () => true, noWrite),
      ).rejects.toThrow('Apply');
      const copy = new File([await file.text()], 'copied.dxf');
      await expect(
        applyDirectDxfReviewedDraftV1(reviewed, [copy], undefined, () => true, noWrite),
      ).rejects.toThrow('Apply');
      await expect(
        applyDirectDxfReviewedDraftV1(
          structuredClone(reviewed),
          [copy],
          undefined,
          () => true,
          noWrite,
          file,
        ),
      ).rejects.toThrow(
        savedDartEdit
          ? 'original saved dart'
          : tool === 'sharpen-corner'
            ? 'original saved corner'
            : allowanceOffset
              ? 'original saved allowance offset'
              : repeatedMoves
                ? 'original saved outline points'
                : 'original parallel opening',
      );
      const originalText = scope.dxfText;
      scope.dxfText += '\n';
      await expect(
        applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite, file),
      ).rejects.toThrow('Apply');
      scope.dxfText = originalText;
      const otherSize = scope.writerReplay!.job.pieces[0]!.sizes.find(
        (size) => size.sizeToken === 'XL',
      )!;
      const oldCut = otherSize.cut;
      otherSize.cut = oldCut.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p));
      await expect(
        applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite, file),
      ).rejects.toThrow(savedDartEdit ? 'size blocks changed' : 'another size changed');
      otherSize.cut = oldCut;
      const before = f.current.row;
      f.current.row = { ...before, revision: before.revision + 1 };
      await expect(
        applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite),
      ).rejects.toThrow('changed');
      f.current.row = before;
      if (repeatedMoves) {
        authoritativeOutlineRow = { ...before, revision: before.revision + 1 };
        await expect(
          applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite, file),
        ).rejects.toThrow('authority moved');
        authoritativeOutlineRow = before;
      }
      if (allowanceOffset) {
        const { sizes } = scope.writerReplay!.job.pieces.find(
          ({ identity }) => identity === targetPiece.pieceId,
        )!;
        const i = sizes.findIndex(({ sizeToken }) => sizeToken === 'XL');
        const rank = sizes[i]!;
        sizes[i] = transformSizeSpec(rank, { a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 });
        await expect(
          applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite, file),
        ).rejects.toThrow('another size changed');
        sizes[i] = rank;
        authoritativeAllowanceRow = { ...before, revision: before.revision + 1 };
        await expect(
          applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, noWrite, file),
        ).rejects.toThrow('authority moved');
        authoritativeAllowanceRow = before;
      }
      expect(noWrite).not.toHaveBeenCalled();
    }
    const prior = f.current.row;
    const card = structuredClone(f.current.card);
    const target = card.scopes[0]!;
    const live: LiveCard = {
      patterns: [{ ...card.existingPatterns![0]!, ...target, sizeId: 7 }],
      pieces: card.existingPieces,
      aliases: card.existingAliases!.map((alias) => ({ ...alias, ...target })),
    };
    let row: DxfProductSavedRowIdentityV1 | undefined;
    const apply = createCardApply({
      read: () => live,
      write: (path, value) => {
        if (!Array.isArray(value)) throw Error('Unexpected import write.');
        if (path === 'patterns') live.patterns = value;
        else if (path === 'pieces') live.pieces = value;
        else if (path === 'pieceDxfAliases') live.aliases = value;
        else throw Error(path);
      },
      scopeOf: (candidate) =>
        candidate.bomLineKey === target.bomLineKey &&
        candidate.fabricPurpose === target.fabricPurpose
          ? target.scopeKey
          : '',
      storageSizeId: 7,
      readPreviousLockVersion: () => prior.cardLockVersion,
      save: async () => {
        const committed = live.patterns.find((pattern) => pattern.url === url)!;
        row = {
          ...prior,
          url,
          revision: prior.revision + 1,
          cardLockVersion: prior.cardLockVersion + 1,
          patternLineKey: committed.lineKey!,
          sizeBytes: committed.sizeBytes!,
          sha256: committed.sha256!,
        };
        return 'ok';
      },
    });
    const confirmApply = vi.fn(() => apply(reviewed));
    const result = await applyDirectDxfReviewedDraftV1(
      reviewed,
      [file],
      undefined,
      () => true,
      confirmApply,
    );
    expect(confirmApply).toHaveBeenCalledOnce();
    if (!result.ok || !result.commitReceipt || !row) throw Error(JSON.stringify(result));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.commitReceipt.previousLockVersion).toBe(prior.cardLockVersion);
    expect(row.sha256).toBe(await digestFullAssemblyFixture(stored));
    expect(row.sha256).not.toBe(prior.sha256);
    expect(result.commitReceipt.scopes).toMatchObject([
      { patternLineKey: prior.patternLineKey, patternUrl: row.url },
    ]);
    expect(row.patternLineKey).toBe(prior.patternLineKey);
    const bytes = Uint8Array.from(stored);
    card.existingPatterns![0] = {
      ...card.existingPatterns![0]!,
      url: row.url,
      lineKey: row.patternLineKey,
      manifest: readManifest(new TextDecoder().decode(bytes))!,
    };
    card.existingPieces = live.pieces.map((piece) => {
      const { lineKey, name, cutSymmetry } = piece;
      if (!lineKey || !name || !cutSymmetry) throw Error('Missing committed piece identity.');
      return { ...piece, lineKey, name, cutSymmetry };
    });
    card.existingAliases = live.aliases.map((alias) => ({
      scopeKey: target.scopeKey,
      blockName: alias.blockName!,
      pieceLineKey: alias.pieceLineKey!,
    }));
    const reopened = await createSavedThreePanelSourceV1({ ...f.seed, bytes, row, card }, true);
    try {
      expect(reopened.native.row).toEqual(row);
      if (allowanceOffset) {
        expect(reopened.native.nativeSewingReplay?.replayReady).toBe(true);
        const before = f.source.native.draft.scopes[0]!,
          after = reopened.native.draft.scopes[0]!;
        expect(after.manifest.sizes).toEqual(before.manifest.sizes);
        expect(after.manifest.pieces).toEqual(before.manifest.pieces);
        const initialRaw = parseDxf(f.request.savedBytes, 'mm').dxf;
        const savedRaw = parseDxf(bytes.buffer, 'mm').dxf;
        const chains = (dxf: typeof initialRaw, block: string, layer: string) =>
          dxf.blocks[block]!.entities.filter((entity) => entity.layer === layer)
            .map((entity) => entityToChain(entity, 1, 0.001))
            .filter((chain) => chain !== null);
        for (const block of before.manifest.blocks) {
          const move = block.identity === targetPiece.pieceId && block.sizeToken === 'M';
          const originalCut = chains(initialRaw, block.block, '1');
          expect(originalCut).toHaveLength(3);
          const oldArea = areaOf(originalCut[0]!.pts);
          if (move)
            originalCut[0]!.pts = originalCut[0]!.pts.map((p) =>
              p.y === bounds.maxY ? { ...p, y: Number((p.y + offsetMm).toFixed(6)) } : p,
            );
          expect(chains(savedRaw, block.block, '1')).toEqual(originalCut);
          for (const layer of ['14', '8', '13', '7'])
            expect(chains(savedRaw, block.block, layer)).toEqual(
              chains(initialRaw, block.block, layer),
            );
          const priorSize = before
            .writerReplay!.job.pieces.find(({ identity }) => identity === block.identity)!
            .sizes.find(({ sizeToken }) => sizeToken === block.sizeToken)!;
          const freshSize = after
            .writerReplay!.job.pieces.find(({ identity }) => identity === block.identity)!
            .sizes.find(({ sizeToken }) => sizeToken === block.sizeToken)!;
          expect(freshSize.cut).toEqual(originalCut[0]!.pts);
          expect(freshSize.seam).toEqual(priorSize.seam);
          expect(freshSize.cutLoops).toEqual(priorSize.cutLoops);
          expect(freshSize.pointMarks).toEqual(priorSize.pointMarks);
          expect(freshSize.textMarks).toEqual(priorSize.textMarks);
          if (move) {
            expect(areaOf(freshSize.cut) - oldArea).toBeCloseTo(
              offsetMm * (bounds.maxX - bounds.minX),
              6,
            );
            expect(freshSize.bbox.minY).toBe(bounds.minY);
            expect(freshSize.bbox.maxY).toBeCloseTo(bounds.maxY + offsetMm, 6);
            expect(freshSize.bbox.maxY - bboxOf(freshSize.seam!).maxY).toBeCloseTo(
              bounds.maxY - bboxOf(priorSize.seam!).maxY + offsetMm,
              6,
            );
          }
        }
        return;
      }
      if (tool === 'parallel-spread') {
        const before = f.source.native.draft.scopes[0]!,
          after = reopened.native.draft.scopes[0]!;
        expect(after.manifest.sizes).toEqual(before.manifest.sizes);
        expect(
          after.manifest.blocks.map((b) => [b.identity, b.sizeToken, b.sizeId, b.block]),
        ).toEqual(before.manifest.blocks.map((b) => [b.identity, b.sizeToken, b.sizeId, b.block]));
        expect(
          card.existingAliases?.filter((a) => a.pieceLineKey === targetPiece.pieceLineKey).length,
        ).toBeGreaterThan(0);
        for (const piece of before.writerReplay!.job.pieces) {
          const saved = after.writerReplay!.job.pieces.find((p) => p.identity === piece.identity)!;
          expect(saved.sizes.map((s) => s.sizeToken)).toEqual(garmentRanks);
          for (const priorSize of piece.sizes) {
            const restored = saved.sizes.find((s) => s.sizeToken === priorSize.sizeToken)!;
            const dx = restored.bbox.minX - priorSize.bbox.minX,
              dy = restored.bbox.minY - priorSize.bbox.minY;
            const edited = piece.identity === targetPiece.pieceId;
            const map = (p: { x: number; y: number }) => ({
              x: p.x + dx + (edited && p.x > slashX ? 12 : 0),
              y: p.y + dy,
            });
            const sameRing = (a: typeof restored.cut, b: typeof restored.cut) =>
              expect(a.map((p) => JSON.stringify(p)).sort()).toEqual(
                b.map((p) => JSON.stringify(p)).sort(),
              );
            sameRing(restored.cut, priorSize.cut.map(map));
            sameRing(restored.seam!, priorSize.seam!.map(map));
            expect(priorSize.cutLoops).toHaveLength(2);
            expect(restored.cutLoops).toHaveLength(2);
            for (const [i, loop] of priorSize.cutLoops!.entries()) {
              sameRing(restored.cutLoops![i]!, loop.map(map));
              expect(signedArea(restored.cutLoops![i]!)).toBeLessThan(0);
            }
            expect(restored.grain?.a).toEqual(map(priorSize.grain!.a));
            expect(restored.grain?.b).toEqual(map(priorSize.grain!.b));
            expect(restored.pointMarks).toEqual(
              priorSize.pointMarks!.map((m) => ({ ...m, at: map(m.at) })),
            );
            expect(restored.textMarks).toEqual(
              priorSize.textMarks!.map((m) => ({ ...m, at: map(m.at) })),
            );
            expect(restored.areaMm2 - priorSize.areaMm2).toBeCloseTo(
              edited ? 12 * (priorSize.bbox.maxY - priorSize.bbox.minY) : 0,
              6,
            );
          }
        }
        return;
      }
      if (savedDartEdit) {
        cancelSavedDartTipReviewV1(file);
        const closedWrite = vi.fn();
        await expect(
          applyDirectDxfReviewedDraftV1(reviewed, [file], undefined, () => true, closedWrite, file),
        ).rejects.toThrow('Apply');
        expect(closedWrite).not.toHaveBeenCalled();
        expect(verifyRow).toHaveBeenCalledTimes(2);
        const before = f.source.native.draft.scopes[0]!,
          after = reopened.native.draft.scopes[0]!;
        const expected = structuredClone(before.manifest.blocks);
        expect(expected).toHaveLength(10);
        const changed = expected.find(
          (b) => b.identity === targetPiece.pieceId && b.sizeToken === 'M',
        )!;
        const label = tool === 'fish-eye-move' ? 'draft-cad:fish-eye' : 'draft-cad:dart';
        const marker = changed.authoredInternal!.find((m) => m.label === label)!;
        const movedIndices = savedIntake ? [0, 2] : tool === 'dart-tip' ? [1] : [0, 1, 2, 3];
        for (const index of movedIndices) {
          marker.vertices[index * 2]! += deltaFor(index).x * 1_000_000;
          marker.vertices[index * 2 + 1]! += deltaFor(index).y * 1_000_000;
        }
        const initialRaw = parseDxf(f.request.savedBytes, 'mm').dxf;
        const savedRaw = parseDxf(bytes.buffer, 'mm').dxf;
        for (const block of before.manifest.blocks) {
          const rawLayers = (file: typeof initialRaw, layer: string) =>
            file.blocks[block.block]!.entities.filter((entity) => entity.layer === layer)
              .map((entity) => entityToChain(entity, 1, 0.001))
              .filter((chain) => chain !== null);
          const originalInternal = rawLayers(initialRaw, '8');
          const restoredInternal = rawLayers(savedRaw, '8');
          if (block.block === changed.block) {
            const original = originalInternal[marker.index]!;
            expect(original.closed).toBe(tool === 'fish-eye-move');
            expect(restoredInternal[marker.index]!.closed).toBe(original.closed);
            for (const index of movedIndices) {
              original.pts[index]!.x += deltaFor(index).x;
              original.pts[index]!.y += deltaFor(index).y;
            }
          }
          expect(restoredInternal).toEqual(originalInternal);
          const drillPoints = (file: typeof initialRaw) =>
            file.blocks[block.block]!.entities.filter(
              ({ layer, type }) => layer === '13' && type === 'POINT',
            );
          expect(drillPoints(initialRaw)).toHaveLength(
            (fishEye || savedIntake) && sourceDialect === 'r12' ? 1 : 0,
          );
          expect(drillPoints(savedRaw)).toHaveLength(
            fishEye || (savedIntake && sourceDialect === 'r12') ? 1 : 0,
          );
          for (const layer of ['1', '14'])
            expect(rawLayers(savedRaw, layer)).toEqual(rawLayers(initialRaw, layer));
        }
        const signature = (blocks: typeof expected) =>
          blocks
            .map((b) => [b.block, b.identity, b.sizeId, b.sizeToken, b.authoredInternal])
            .sort();
        expect(signature(after.manifest.blocks)).toEqual(signature(expected));
        expect(after.manifest.sizes).toEqual(before.manifest.sizes);
        for (const p of before.writerReplay!.job.pieces) {
          const restored = after.writerReplay!.job.pieces.find((q) => q.identity === p.identity)!;
          expect(restored.sizes.map((s) => s.sizeToken)).toEqual(garmentRanks);
          for (const size of p.sizes) {
            const decoded = restored.sizes.find((s) => s.sizeToken === size.sizeToken)!;
            const previous = structuredClone(size.internal);
            if (p.identity === targetPiece.pieceId && size.sizeToken === 'M') {
              const feature = previous.find((entry) => entry.label === label)!;
              for (const index of movedIndices) {
                feature.pts[index]!.x += deltaFor(index).x;
                feature.pts[index]!.y += deltaFor(index).y;
              }
              if (fishEye)
                expect(size.internal[fishEye.savedMove.index]?.ranges[0]?.path).toBe(
                  fishEye.savedMove.sourcePathId,
                );
            }
            // Source path ids are issued by each fresh reader and differ between dialects.
            const geometry = (items: typeof previous) =>
              items.map(({ ranges, ...feature }) => ({
                ...feature,
                ranges: ranges.map(({ from, to }) => ({ from, to })),
              }));
            expect(geometry(decoded.internal)).toEqual(geometry(previous));
            expect(decoded.cut).toEqual(size.cut);
            expect(decoded.seam).toEqual(size.seam);
            expect(decoded.cutLoops).toEqual(size.cutLoops);
            if (savedIntake) {
              expect(decoded.cutLoops).toHaveLength(2);
              expect(decoded.drills).toHaveLength(1);
              expect(decoded.drills.map(({ at, form }) => ({ at, form }))).toEqual(
                size.drills.map(({ at, form }) => ({ at, form })),
              );
              expect(decoded.grain).toEqual(size.grain);
            }
            if (fishEye) {
              expect(decoded.cutLoops).toHaveLength(2);
              expect(decoded.drills).toHaveLength(1);
              expect(size.drills).toHaveLength(1);
              expect(size.drills[0]?.form).toBe(sourceDialect === 'r12' ? 'point' : 'square');
              // The normal Wizard writes R12, which adds a companion POINT to the unchanged
              // layer-8 drill square. The reader prefers that companion for the one drill.
              expect(decoded.drills[0]).toMatchObject({
                kind: 'drill',
                form: 'point',
                at: size.drills[0]!.at,
              });
            }
          }
        }
        return;
      }
      const normalize = (points: readonly { x: number; y: number }[]) => {
        const { minX, minY } = bboxOf(points);
        return points
          .map(({ x, y }) => [Math.round((x - minX) * 1e6), Math.round((y - minY) * 1e6)].join(','))
          .sort();
      };
      const expected =
        sharpenedOutline ??
        movedOutline ??
        (tool === 'move-point'
          ? vertices.map((vertex) => (vertex === point ? pointMm : vertex.pointMm))
          : vertices.filter((vertex) => vertex !== point).map(({ pointMm }) => pointMm));
      const block = scope.manifest.blocks.find(
        ({ identity, sizeToken }) => identity === point.anchor.pieceId && sizeToken === 'M',
      )!;
      const raw = parseDxf(bytes.buffer, 'mm').dxf.blocks[block.block]!;
      for (const layer of ['1', '14']) {
        const outline = raw.entities.find(
          (entity) =>
            entity.layer === layer && (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE'),
        );
        expect(outline).toBeDefined();
        expect(normalize(entityToChain(outline!, 1, 0.001)!.pts)).toEqual(normalize(expected));
      }
      const restored = reopened.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
        ({ identity }) => identity === point.anchor.pieceId,
      )!.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
      expect(normalize(restored.cut)).toEqual(normalize(expected));
      expect(normalize(restored.seam!)).toEqual(normalize(expected));
      if (fiveRanks) {
        const before = f.source.native.draft.scopes[0]!,
          after = reopened.native.draft.scopes[0]!;
        const original = parseDxf(f.request.savedBytes, 'mm').dxf,
          saved = parseDxf(bytes.buffer, 'mm').dxf;
        const rankIds = garmentRanks.map((token, rank) => ({ rank, token, sizeId: rank + 5 }));
        if (repeatedMoves) {
          expect(scope.manifest.pieces).toEqual(before.manifest.pieces);
          expect(after.manifest.pieces).toEqual(before.manifest.pieces);
        }
        for (const version of [before, scope, after]) {
          expect(
            version.manifest.sizes.map(({ rank, token, sizeId }) => ({ rank, token, sizeId })),
          ).toEqual(rankIds);
          expect(version.manifest.blocks).toHaveLength(10);
          expect(version.writerReplay!.job.pieces.map((p) => p.identity).sort()).toEqual([
            'BP',
            'FP',
          ]);
        }
        const readNativeRing = (dxf: typeof original, block: string, layer: string) => {
          const entities = dxf.blocks[block]!.entities.filter(
            (e) => e.layer === layer && (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE'),
          );
          expect(entities).toHaveLength(1);
          const chain = entityToChain(entities[0]!, 1, 0.001)!;
          expect(chain.closed).toBe(true);
          expect(chain.pts.length).toBeGreaterThanOrEqual(4);
          return chain.pts;
        };
        for (const identity of ['BP', 'FP']) {
          const sizes = (v: typeof before) =>
            v.writerReplay!.job.pieces.find((p) => p.identity === identity)!.sizes;
          const prior = sizes(before),
            decoded = sizes(after);
          for (const values of [prior, decoded]) {
            expect(
              values.map(({ rank, sizeToken: token, sizeId }) => ({ rank, token, sizeId })),
            ).toEqual(rankIds);
            expect(new Set(values.map((size) => JSON.stringify(normalize(size.cut)))).size).toBe(5);
          }
          for (const { token, sizeId, rank } of rankIds) {
            const expectedBlock = { identity, sizeToken: token, sizeId };
            const originalBlocks = before.manifest.blocks.filter(
              (b) => b.identity === identity && b.sizeToken === token,
            );
            expect(originalBlocks).toHaveLength(1);
            const [originalBlock] = originalBlocks;
            expect(originalBlock).toMatchObject(expectedBlock);
            expect(
              after.manifest.blocks.filter((b) => b.identity === identity && b.sizeToken === token),
            ).toMatchObject([{ ...expectedBlock, block: originalBlock!.block }]);
            const edited = identity === point.anchor.pieceId && token === 'M';
            for (const layer of ['1', '14']) {
              const originalRing = readNativeRing(original, originalBlock!.block, layer);
              if (edited) expect(originalRing).toEqual(vertices.map((vertex) => vertex.pointMm));
              const expectedRing = edited ? expected : originalRing;
              expect(readNativeRing(saved, originalBlock!.block, layer)).toEqual(expectedRing);
              const boundary = layer === '1' ? 'cut' : 'seam';
              expect(prior[rank]![boundary]).toEqual(originalRing);
              expect(decoded[rank]![boundary]).toEqual(expectedRing);
            }
          }
        }
      }
    } finally {
      reopened.dispose();
    }
  } finally {
    unregister();
    upload.mockRestore();
    worker.dispose();
    allowanceRuntime?.dispose();
    outlineRuntime?.dispose();
    vi.unstubAllGlobals();
    f.source.dispose();
  }
}

it.each(['move-point', 'delete-point'] as const)(
  'reopens %s from both native paths after ordinary Wizard Apply',
  (tool) => checkNativeOutlinePointEdit(tool),
);

it.each(['r12', 'r2000'] as const)(
  'replays repeated and adjacent M outline moves through protected Review, %s Apply and cold read',
  (dialect) => checkNativeOutlinePointEdit('move-point', true, dialect, true),
  30_000,
);

it.each(['r12', 'r2000'] as const)(
  'sharpens only the selected M native bevel from %s through ordinary Apply and independent cold replay',
  (dialect) => checkNativeOutlinePointEdit('sharpen-corner', true, dialect),
);

it.each(['r12', 'r2000'] as const)(
  'offsets one M native allowance side through Review, %s Apply and fresh exact replay',
  (dialect) => checkNativeOutlinePointEdit('allowance-offset', true, dialect),
);

it('refuses a native bevel when the saved cut and sewing allowance are separate', async () => {
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(true, true, false, false, 'r12', false, undefined, true);
  try {
    const {
      buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
      recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
    } = await import('./draft-cad-canvas-v1');
    const { projection } = f.compileInput;
    const activePieceIndex = projection.pieces.findIndex(({ pieceId }) => pieceId === 'FP');
    const cut = projection.pieces[activePieceIndex]?.contours.find(
      ({ role }) => role === 'cut-boundary',
    );
    const bevel = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
      f.initial,
      projection,
      activePieceIndex,
    ).find(
      ({ anchor, fromMm, toMm }) =>
        anchor.contourId === cut?.contourId && fromMm.x !== toMm.x && fromMm.y !== toMm.y,
    );
    if (!bevel) throw Error('The saved allowance fixture lost its cut bevel.');
    const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      session: f.initial,
      projection,
      activePieceIndex,
      activeTool: 'sharpen-corner',
      sequence: 0,
      baseKey: bevel.key,
    });
    if (!edit.recorded) throw Error(edit.blocker ?? 'The source bevel could not be picked.');
    f.current.session = edit.session;
    const verify = vi.fn(async () => {});
    await expect(compileSavedDartTipReviewV1(f.request, verify)).rejects.toThrow(
      'coincident original L1 and L14',
    );
    expect(verify).not.toHaveBeenCalled();
  } finally {
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it('reopens one M Move with all four other ranks and the sibling piece intact after one ordinary Apply', () =>
  checkNativeOutlinePointEdit('move-point', true));

it.each(['r12', 'r2000'] as const)(
  'moves only the saved %s M dart tip through manual Apply and fresh native replay across five ranks',
  (dialect) => checkNativeOutlinePointEdit('dart-tip', true, dialect),
);

it.each(['r12', 'r2000'] as const)(
  'adjusts the saved %s M dart intake through manual Apply and fresh native replay',
  (dialect) => checkNativeOutlinePointEdit('dart-intake', true, dialect),
);

it('keeps exact ordered diagonal feet on the writer grid and refuses off-edge or collapsed intake', () => {
  const edge = [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
  ] as const;
  const apex = { x: 2, y: 0.5 };
  const first = { x: 0.6, y: 0.8 },
    last = { x: 1.8, y: 2.4 };
  expect(adjustedSavedDartFeetV1(edge, [first, apex, last], 3)).toEqual([
    { x: 0.3, y: 0.4 },
    { x: 2.1, y: 2.8 },
  ]);
  expect(adjustedSavedDartFeetV1(edge, [last, apex, first], 3)).toEqual([
    { x: 2.1, y: 2.8 },
    { x: 0.3, y: 0.4 },
  ]);
  expect(adjustedSavedDartFeetV1(edge, [{ ...first, y: 0.800001 }, apex, last], 3)).toBeNull();
  for (const invalid of [0, 2, 3.000001, 3.000005, 4])
    expect(adjustedSavedDartFeetV1(edge, [first, apex, last], invalid)).toBeNull();
});

it.each(['r12', 'r2000'] as const)(
  'moves only the saved %s M fish-eye through manual Apply and fresh native replay across five ranks',
  (dialect) => checkNativeOutlinePointEdit('fish-eye-move', true, dialect),
);

it('rejects a fish-eye bound to the open dart path, the wrong rank or a cut hole', async () => {
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(true, false, true, true, 'r12', true);
  try {
    const input = { ...f.compileInput, session: f.initial };
    const piece = input.projection.pieces[0]!;
    const fishEye = selectSavedFishEyeMoveV1(input, piece)!;
    const move = recordSavedFishEyeMoveV1(input, piece, {
      x: fishEye.centerMm.x + 3,
      y: fishEye.centerMm.y - 4,
    });
    if (!move?.ok) throw Error('Fixture fish-eye unavailable');
    const command = move.session.history[0]!.commands[0]!;
    if (command.tool !== 'fish-eye' || !command.payload.savedMove)
      throw Error('Fixture lost the original layer-8 path');
    const selectedSize = f.source.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
      (p) => p.identity === piece.pieceId,
    )!.sizes.find((size) => size.sizeToken === 'M')!;
    const openDart = selectedSize.internal.find((feature) => feature.label === 'draft-cad:dart')!;
    const wrongPath = openDart.ranges[0]!.path;
    expect(wrongPath).not.toBe(fishEye.savedMove.sourcePathId);
    const badBindings = [
      { ...command.payload.savedMove, sourcePathId: wrongPath },
      { ...command.payload.savedMove, rank: 1 },
    ];
    for (const savedMove of badBindings) {
      const corrupt = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
        transactionId: 'changed-fish-eye',
        label: 'Move fish-eye',
        commands: [{ ...command, payload: { ...command.payload, savedMove } }],
      });
      if (!corrupt.ok) throw Error(corrupt.blocker.detail);
      f.current.session = corrupt.session;
      const fresh = await createSavedThreePanelSourceV1(f.seed);
      try {
        const verify = vi.fn(async () => {});
        await expect(
          compileSavedDartTipReviewV1(
            {
              ...f.request,
              sourceOwner: fresh.native.sourceOwner,
              sourceRequest: { ...f.request.sourceRequest, draft: fresh.native.draft },
            },
            verify,
          ),
        ).rejects.toThrow('exact saved fish-eye');
        expect(verify).not.toHaveBeenCalled();
      } finally {
        fresh.dispose();
      }
    }

    expect((await compileDraftForOrdinaryReviewV1({ ...input, session: move.session })).ok).toBe(
      false,
    );
    const insideHole = selectedSize.cutLoops![0]![0]!;
    const crossesHole = recordSavedFishEyeMoveV1(input, piece, {
      x: insideHole.x + 4,
      y: insideHole.y + 3.5,
    });
    if (!crossesHole?.ok) throw Error('Fixture move into the hole unavailable');
    f.current.session = crossesHole.session;
    const blocked = await compileSavedDartTipReviewV1(f.request, async () => {});
    expect(blocked.ok).toBe(false);
    expect(blocked.blockers[0]?.detail).toContain('outside its holes');
  } finally {
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it('does not guess an editable saved fish-eye among two typed native paths', async () => {
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(true, false, true, 'ambiguous-fish-eye');
  try {
    const input = { ...f.compileInput, session: f.initial };
    const piece = input.projection.pieces[0]!;
    expect(selectSavedDartTipV1(input, piece)).not.toBeNull();
    expect(selectSavedFishEyeMoveV1(input, piece)).toBeNull();
    expect(recordSavedFishEyeMoveV1(input, piece, { x: 40, y: 20 })).toBeNull();
  } finally {
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it('rejects cross-piece, cross-rank, changed tip, feet and alias during saved dart verification', async () => {
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(true, false, true, true);
  try {
    const input = { ...f.compileInput, session: f.initial },
      piece = input.projection.pieces[0]!;
    const dart = selectSavedDartTipV1(input, piece)!;
    const record = recordSavedDartTipV1(input, piece, {
      x: dart.apexMm.x + 3,
      y: dart.apexMm.y + 2,
    });
    if (!record?.ok) throw Error('Fixture dart unavailable');
    const command = record.session.history[0]!.commands[0]!;
    if (command.tool !== 'dart' || !command.payload.savedTip)
      throw Error('Fixture lacks original path');
    const tip = command.payload.savedTip;
    const invalid = [
      { ...tip, pieceLineKey: input.projection.pieces[1]!.pieceLineKey },
      { ...tip, rank: 1 },
      { ...tip, sizeId: 8 },
      { ...tip, sizeToken: 'L' },
      { ...tip, index: 1 },
      { ...tip, sourceSha256: 'a'.repeat(64) },
      { ...tip, original: tip.original.map((p, i) => (i === 1 ? { ...p, y: p.y + 1 } : p)) },
    ];
    for (const savedTip of invalid) {
      const corrupt = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
        transactionId: 'changed',
        label: 'Move dart',
        commands: [{ ...command, payload: { ...command.payload, savedTip } }],
      });
      if (!corrupt.ok) throw Error(corrupt.blocker.detail);
      f.current.session = corrupt.session;
      const fresh = await createSavedThreePanelSourceV1(f.seed);
      try {
        await expect(
          compileSavedDartTipReviewV1(
            {
              ...f.request,
              sourceOwner: fresh.native.sourceOwner,
              sourceRequest: { ...f.request.sourceRequest, draft: fresh.native.draft },
            },
            async () => {},
          ),
        ).rejects.toThrow(/saved dart/i);
      } finally {
        fresh.dispose();
      }
    }
    f.current.session = record.session;
    f.current.card.existingAliases!.push({
      ...f.current.card.existingAliases!.find((a) => a.blockName === piece.pieceId)!,
      pieceLineKey: 'wrong-line',
    });
    await expect(compileSavedDartTipReviewV1(f.request, async () => {})).rejects.toThrow(
      /saved dart/i,
    );
    expect((await compileDraftForOrdinaryReviewV1({ ...input, session: record.session })).ok).toBe(
      false,
    );
  } finally {
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it.each(['orphan', 'ambiguous'] as const)(
  'refuses a saved %s dart with no unique original cut attachment',
  async (mode) => {
    vi.stubGlobal('Worker', InProcessTransport);
    const f = await fixture(true, false, true, mode);
    try {
      const input = { ...f.compileInput, session: f.initial };
      expect(selectSavedDartTipV1(input, input.projection.pieces[0]!)).toBeNull();
      expect(recordSavedDartTipV1(input, input.projection.pieces[0]!, { x: 40, y: 20 })).toBeNull();
    } finally {
      f.source.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it('rejects a saved intake with a foreign L8 path, shifted edge centre or apex, or feet past the edge', async () => {
  vi.stubGlobal('Worker', InProcessTransport);
  const f = await fixture(true, false, true, true);
  try {
    const input = { ...f.compileInput, session: f.initial },
      piece = input.projection.pieces[0]!;
    const dart = selectSavedDartTipV1(input, piece);
    const fishEye = selectSavedFishEyeMoveV1(input, piece);
    if (!dart || !fishEye) throw Error('The two signed L8 fixture paths are unavailable.');
    const width = Number((dart.intakeMm + 8).toFixed(6));
    const [from, to] = dart.edge;
    const tooWide = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)) + 1;
    expect(recordSavedDartIntakeV1(input, piece, tooWide)).toBeNull();
    const edit = recordSavedDartIntakeV1(input, piece, width);
    if (!edit?.ok) throw Error('Fixture intake unavailable.');
    const command = edit.session.history[0]!.commands[0]!;
    if (command.tool !== 'dart') throw Error('The fixture did not record a dart.');
    expect(command.payload.savedIntakeSourcePathId).toBe(dart.intakeSourcePathId);
    expect(command.payload.savedIntakeSourcePathId).not.toBe(fishEye.savedMove.sourcePathId);
    const invalid = [
      { savedIntakeSourcePathId: fishEye.savedMove.sourcePathId },
      { base: { ...dart.base, progress: dart.base.progress + 0.01 } },
      { apexMm: { ...dart.apexMm, x: dart.apexMm.x + 1 } },
      { intakeMm: tooWide },
    ];
    for (const payload of invalid) {
      const corrupt = recordPatternImportDxfPhaseEDraftCadTransactionV1(f.initial, {
        transactionId: 'changed-intake',
        label: 'Adjust saved dart intake',
        commands: [{ ...command, payload: { ...command.payload, ...payload } }],
      });
      if (!corrupt.ok) throw Error(corrupt.blocker.detail);
      f.current.session = corrupt.session;
      const verify = vi.fn(async () => {});
      const fresh = await createSavedThreePanelSourceV1(f.seed);
      try {
        await expect(
          compileSavedDartTipReviewV1(
            {
              ...f.request,
              sourceOwner: fresh.native.sourceOwner,
              sourceRequest: { ...f.request.sourceRequest, draft: fresh.native.draft },
            },
            verify,
          ),
        ).rejects.toThrow(/saved dart/i);
        expect(verify).not.toHaveBeenCalled();
      } finally {
        fresh.dispose();
      }
    }
  } finally {
    f.source.dispose();
    vi.unstubAllGlobals();
  }
});

it.each(['r12', 'r2000'] as const)(
  'applies a parallel opening to the saved %s piece and keeps ten graded blocks with their holes',
  (dialect) => checkNativeOutlinePointEdit('parallel-spread', true, dialect),
);

it.each(['r12', 'r2000'] as const)(
  'reopens and moves exact %s M French-curve handles through manual Review, preserving the other ranks',
  async (dialect) => {
    const { parseDxf } = await import('lib/nesting/dxf/parse');
    const { entityToChain } = await import('lib/nesting/dxf/entities');
    const { tokenize } = await import('lib/pattern-import/adapters/dxf/tags');
    const { buildAst } = await import('lib/pattern-import/adapters/dxf/ast');
    vi.stubGlobal('Worker', InProcessTransport);
    const f = await fixture(true, false, true, false, dialect, false, 'exact');
    const worker = new ImportWorkerClient();
    try {
      const input = { ...f.compileInput, session: f.initial };
      const piece = input.projection.pieces.find(({ pieceId }) => pieceId === 'FP')!;
      const fallback = selectSavedFrenchCurveTableEditV1(
        {
          catalog: f.initial.source.catalog,
          projection: input.projection,
          selection: input.selection,
          draftCadCompileSource: input.compileSource,
        },
        f.current.row,
        piece,
      );
      expect(fallback?.row).toEqual(f.current.row);
      expect(fallback?.curve).toEqual(selectSavedFrenchCurveV1(input, piece));
      const selected = selectSavedFrenchCurveV1(input, piece);
      if (!selected) throw Error('The unique saved French curve was not found.');
      expect(selected.controlPointsMm).toHaveLength(3);
      expect(selected.pointsMm.length).toBeGreaterThan(3);
      expect(
        selectSavedFrenchCurveV1(input, input.projection.pieces.find((p) => p.pieceId === 'BP')!),
      ).toBeNull();
      const center = selected.controlPointsMm[1];
      const moved = { x: center.x + 2, y: center.y + 3 };
      const first = recordSavedFrenchCurveHandleV1(input, piece, 1, moved);
      if (!first?.ok) throw Error('The signed fixture French curve was not admitted.');
      const command = first.session.history[0]!.commands[0]!;
      if (command.tool !== 'french-curve') throw Error('Unexpected edit.');
      const nextStart = { ...selected.controlPointsMm[0], y: selected.controlPointsMm[0].y + 1 };
      const second = recordDraftCadFrenchCurveHandleV1(first.session, {
        transactionId: 'move-saved-start',
        commandId: command.commandId,
        target: command.target,
        expected: command.payload.controlPointsMm,
        handle: 0,
        pointMm: nextStart,
      });
      if (!second.ok) throw Error(second.blocker.detail);
      const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(second.session);
      if (!undone.ok) throw Error(undone.blocker.detail);
      const clean = undoPatternImportDxfPhaseEDraftCadSessionV1(undone.session);
      if (!clean.ok) throw Error(clean.blocker.detail);
      expect(clean.session.cursor).toBe(0);
      expect(selectSavedFrenchCurveV1({ ...input, session: clean.session }, piece)).toEqual(
        selected,
      );
      const redone = redoPatternImportDxfPhaseEDraftCadSessionV1(undone.session);
      if (!redone.ok) throw Error(redone.blocker.detail);
      const expectedControls = [nextStart, moved, selected.controlPointsMm[2]];
      expect(activeDraftCadTransactionsV1(undone.session)[0]!.commands).toEqual([command]);
      expect(activeDraftCadTransactionsV1(redone.session)[0]!.commands).toMatchObject([
        { payload: { controlPointsMm: expectedControls } },
      ]);
      f.current.session = redone.session;
      const edited = { ...input, session: redone.session };
      const unverified = await compileDraftForOrdinaryReviewV1(edited);
      expect(unverified).toMatchObject({
        ok: false,
        blockers: [{ code: 'source-binding-mismatch' }],
      });

      const verify = vi.fn(async () => {});
      const { createSavedGeometryReviewRuntimeV1 } = await import(
        './saved-row-production-runtime-v1'
      );
      const rowOnlyReads = vi.fn(async () => ({ row: f.seed.row, downloadUrl: f.seed.row.url }));
      const runtime = createSavedGeometryReviewRuntimeV1({
        resolveCard: async () => ({
          card: f.seed.card,
          cardLockVersion: f.seed.row.cardLockVersion,
        }),
        readAuthoritativeRow: rowOnlyReads,
        fetch: (async () =>
          new Response(f.seed.bytes.slice(), {
            headers: { 'content-length': String(f.seed.bytes.length) },
          })) as typeof fetch,
      });
      try {
        const rowResult = await runtime.prepareSavedGeometryReview(f.current.row, () => f.current);
        if (!rowResult.ok) throw Error(JSON.stringify(rowResult.blockers));
        expect(rowResult.artifact.compiledFeatures).toMatchObject([
          { output: 'moved-french-curve' },
        ]);
        expect(rowOnlyReads.mock.calls.length).toBeGreaterThanOrEqual(2);
      } finally {
        runtime.dispose();
      }
      const compiled = await compileDraftForOrdinaryReviewV1(edited, undefined, undefined, () =>
        compileSavedDartTipReviewV1(f.request, verify),
      );
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      expect(compiled.artifact.compiledFeatures).toMatchObject([
        { output: 'moved-french-curve', sizeToken: 'M', pieceId: 'FP' },
      ]);
      const file = openSavedDraftGeometryFileV1(compiled.artifact, 'edited-exact-french.dxf');
      const reviewed = await draftThroughWizardStages(
        file,
        f.current.card,
        worker,
        undefined,
        undefined,
        dialect,
      );
      await expect(verifySavedDartTipApplyV1(reviewed, [file], true, () => true)).rejects.toThrow(
        'Apply',
      );
      await verifySavedDartTipApplyV1(reviewed, [file], false, () => true);
      expect(verify).toHaveBeenCalledTimes(2);
      const scope = reviewed.scopes[0]!;
      const oldBlocks = f.source.native.draft.scopes[0]!.manifest.blocks;
      const restOfGarment = (blocks: typeof oldBlocks) =>
        blocks
          .filter(({ identity, sizeToken }) => identity !== 'FP' || sizeToken !== 'M')
          .map(({ block, contour, authoredInternal }) => [block, contour, authoredInternal]);
      expect(restOfGarment(scope.manifest.blocks)).toEqual(restOfGarment(oldBlocks));
      const block = scope.manifest.blocks.find(
        ({ identity, sizeToken }) => identity === 'FP' && sizeToken === 'M',
      )!;
      expect(block.authoredInternal).toHaveLength(1);
      const previous = oldBlocks.find(({ block: name }) => name === block.block)!;
      const oldControls = previous.authoredInternal![0]!.quadratic!;
      expect(block.authoredInternal?.[0]?.quadratic).toEqual([
        oldControls[0],
        oldControls[1] + 1_000_000,
        oldControls[2] + 2_000_000,
        oldControls[3] + 3_000_000,
        oldControls[4],
        oldControls[5],
      ]);
      const raw = parseDxf(new TextEncoder().encode(scope.dxfText).buffer, 'mm');
      const native = raw.dxf.blocks[block.block]!.entities.filter(
        ({ type, layer }) => layer === '8' && (type === 'POLYLINE' || type === 'LWPOLYLINE'),
      );
      expect(native).toHaveLength(1);
      expect(authoredInternalVertices(entityToChain(native[0]!, 1, 0.001)!.pts)).toEqual(
        block.authoredInternal![0]!.vertices,
      );
      const bytes = new TextEncoder().encode(scope.dxfText);
      const row = {
        ...f.seed.row,
        revision: f.seed.row.revision + 1,
        cardLockVersion: f.seed.row.cardLockVersion + 1,
        sizeBytes: bytes.length,
        sha256: await digestFullAssemblyFixture(bytes),
      };
      const card = structuredClone(f.seed.card);
      card.existingPatterns![0]!.manifest = scope.manifest;
      const cold = await createSavedThreePanelSourceV1({ ...f.seed, bytes, row, card }, true);
      try {
        expect(cold.native.row).toEqual(row);
        const sizes = cold.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
          ({ identity }) => identity === 'FP',
        )!.sizes;
        expect(sizes.map(({ sizeToken }) => sizeToken)).toEqual(garmentRanks);
        expect(sizes[2]!.internal[0]?.authoredQuadratic).toEqual(expectedControls);
        expect(sizes[2]!.internal).toHaveLength(1);
      } finally {
        cold.dispose();
      }
      const tampered = readManifest(compiled.artifact.dxfText)!;
      tampered.blocks.find(
        ({ block: name }) => name === block.block,
      )!.authoredInternal![0]!.quadratic![3] += 1_000_000;
      const bad = new File([embedManifest(compiled.artifact.dxfText, tampered)], file.name, {
        type: file.type,
      });
      await expect(draftThroughWizardStages(bad, f.seed.card)).rejects.toThrow(
        'do not reproduce the native layer-8 path',
      );
      const rawText = compiled.artifact.dxfText;
      const l8 = buildAst(tokenize(rawText).tags)
        .blocks.get(block.block)!
        .entities.find(
          ({ type, layer }) => layer === '8' && (type === 'POLYLINE' || type === 'LWPOLYLINE'),
        )!;
      const vertex = l8.type === 'POLYLINE' ? l8.children[0]! : l8;
      const afterY = vertex.tags.find(({ code }) => code === 20)!.line + 1;
      const bulged = rawText.split('\r\n');
      bulged.splice(afterY, 0, ' 42', '0.00000001');
      await expect(
        draftThroughWizardStages(new File([bulged.join('\r\n')], 'bulged-curve.dxf'), f.seed.card),
      ).rejects.toThrow('saved French curve controls');
      const beginning = f.current.row;
      f.current.row = { ...beginning, revision: beginning.revision + 1 };
      await expect(verifySavedDartTipApplyV1(reviewed, [file], false, () => true)).rejects.toThrow(
        'changed',
      );
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      worker.dispose();
      f.source.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it.each(['legacy', 'ambiguous'] as const)(
  'does not offer saved French-curve handles for %s native records',
  async (kind) => {
    const f = await fixture(true, false, false, false, 'r12', false, kind);
    try {
      const input = { ...f.compileInput, session: f.initial };
      const piece = input.projection.pieces.find(({ pieceId }) => pieceId === 'FP')!;
      const block = f.source.native.draft.scopes[0]!.manifest.blocks.find(
        ({ identity }) => identity === 'FP',
      )!;
      expect(block.authoredInternal).toHaveLength(kind === 'legacy' ? 1 : 2);
      if (kind === 'legacy') {
        expect(block.authoredInternal![0]!.quadratic).toBeUndefined();
        const size = input.compileSource.scopes[0]!.writerReplay!.job.pieces.find(
          ({ identity }) => identity === 'FP',
        )!.sizes[0]!;
        expect(size.internal[0]?.authoredQuadratic).toBeUndefined();
        expect(authoredInternalVertices(size.internal[0]!.pts)).toEqual(
          block.authoredInternal![0]!.vertices,
        );
      }
      expect(selectSavedFrenchCurveV1(input, piece)).toBeNull();
      expect(recordSavedFrenchCurveHandleV1(input, piece, 1, { x: 41, y: 45 })).toBeNull();
    } finally {
      f.source.dispose();
    }
  },
);
