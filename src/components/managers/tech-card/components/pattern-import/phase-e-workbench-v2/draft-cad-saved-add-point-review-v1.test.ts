import { expect, it, vi } from 'vitest';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { readProtectedLineSplit } from 'lib/pattern-import/write/read-protected-line-split';
import { readManifest, embedManifest } from 'lib/pattern-import/manifest';
import { DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
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

async function fixture(stable = false) {
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
  for (const piece of seed.job.pieces) {
    const size = piece.sizes[0]!,
      sx = size.cut.reduce((n, p) => n + p.x, 0) / size.cut.length,
      sy = size.cut.reduce((n, p) => n + p.y, 0) / size.cut.length;
    size.seam = size.cut.map((p) => ({ x: sx + (p.x - sx) * 0.8, y: sy + (p.y - sy) * 0.8 }));
    piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
  }
  seed.written = writeDxfDetailed(seed.job, { now: () => new Date('2026-11-17T00:00:00.000Z') });
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
      const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
        session: edit.session,
        projection,
        selection,
        compileSource,
      });
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      const label = `draft-cad:${tool}`;
      const first = compiled.artifact.manifest.blocks.find(({ identity }) => identity === pieceId)!;
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
