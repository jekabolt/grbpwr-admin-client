import { describe, expect, it, vi } from 'vitest';

import { readDxfWithPathProvenanceV1, segmentDxf } from './adapters/dxf';
import {
  createDxfPieceSpecProvenanceSourceV1,
  projectDxfPieceSpecContourBoundaryV1,
  type DxfPieceSpecProvenanceSourceV1,
} from './dxf-piece-spec-provenance-bridge-v1';
import {
  DXF_PIPELINE_PROVENANCE_REQUEST_V1,
  bridgeDxfPipelineProvenanceV1,
  createDxfCandidateLineageSidecarV1,
  validateDxfPipelineProvenanceRequestV1,
} from './dxf-pipeline-provenance-v1';
import {
  DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1,
  rehydrateDxfProductPhaseDReplayV1,
  validateDxfProductPhaseDReplayRequestV1,
} from './dxf-product-phase-d-replay-v1';
import { selectDxfProductPhaseDSizeV1 } from './dxf-product-phase-d-size-selection-v1';
import type { CardSize, StageIO } from './types';
import { Session, type StageCtx } from './worker/session';
import { writeR2000 } from './write/r2000';
import type { PlannedBlock } from './write/plan';

const opts = { sagittaMm: 0.05, keepFills: true };
const ctx: StageCtx = { progress: vi.fn(), checkCancel: vi.fn() };
const card: CardSize = { sizeId: 1, name: 'Small', token: 'S', rank: 0 };

function fixtureText(): string {
  const cut = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 180 },
    { x: 0, y: 180 },
  ];
  const block = {
    name: 'FRONT_S',
    identity: 'FRONT',
    sizeToken: 'S',
    labelSize: 'S',
    sizeId: 1,
    rank: 0,
    quantity: 1,
    material: 'main fabric',
    category: 'main fabric',
    displayName: 'front',
    annotation: [],
    cut,
    cutLoops: [],
    seam: null,
    internal: [],
    foldLines: 0,
    foldIsMirror: false,
    drills: [],
    grain: {
      tail: { x: 60, y: 30 },
      tip: { x: 60, y: 150 },
      barb: { x: 55, y: 142 },
      u: { x: 0, y: 1 },
    },
    notches: [],
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    derivedFrom: null,
    drawn: [],
    size: {},
  } as unknown as PlannedBlock;
  return writeR2000([block]);
}

function bytes(text = fixtureText()): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function sourceAndSeg(): Promise<{
  source: DxfPieceSpecProvenanceSourceV1;
  seg: ReturnType<typeof segmentDxf>;
}> {
  const detailed = await readDxfWithPathProvenanceV1(
    { id: '0', name: 'fixture.dxf', bytes: bytes() },
    opts,
    { sourceFileId: 'caller/session-1/file-0' },
  );
  if (!detailed.ok) throw new Error(detailed.blockers.map((blocker) => blocker.detail).join('; '));
  const source = createDxfPieceSpecProvenanceSourceV1(detailed.value);
  if (!source.ok) throw new Error(source.blockers.map((blocker) => blocker.detail).join('; '));
  return { source: source.value, seg: segmentDxf(detailed.value.read) };
}

async function preparedSession(factor = 1): Promise<Session> {
  const session = new Session(1, [
    {
      name: 'fixture.dxf',
      bytes: bytes(),
      dxfPathProvenance: { sourceFileId: 'caller/session-1/file-0' },
    },
  ]);
  await session.runStage('extract', { opts }, ctx);
  await session.runStage(
    'scale',
    { decision: { factor, method: 'manual', operatorConfirmed: true } },
    ctx,
  );
  await session.runStage('assemble', { sheet: 0 }, ctx);
  await session.runStage(
    'chains',
    { opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 } },
    ctx,
  );
  await session.runStage('sizes', { card: [card] }, ctx);
  await session.runStage(
    'pieces',
    { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } },
    ctx,
  );
  return session;
}

function semanticsInput(meaning: 'cut' | 'seam'): StageIO['semantics']['in'] {
  return {
    fileAllowance: {
      meaning,
      allowanceMm: 10,
      origin: 'operator',
      evidence: ['test declaration'],
    },
    pieceOverrides: {},
    operatorGrain: {},
  };
}

describe('DXF pipeline provenance candidate boundary', () => {
  it('captures the explicit selected contour branch and only exact source PathIds', async () => {
    const { source, seg } = await sourceAndSeg();
    const result = createDxfCandidateLineageSidecarV1(seg, source, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(1);
    expect(result.value.entries[0]).toMatchObject({
      seed: 0,
      rank: 0,
      sourceGeometry: 'cut',
      closed: true,
    });
    expect(result.value.entries[0].sourcePathIds).toHaveLength(1);
    expect(
      source.paths.some((path) => path.pathId === result.value.entries[0].sourcePathIds[0]),
    ).toBe(true);
    expect(result.value.uniformPositiveScale).toBe(2);
    expect(result.value.productionReady).toBe(false);
  });

  it('fails closed on duplicate ranks, missing PathIds and oversized identity without collapsing them', async () => {
    const { source, seg } = await sourceAndSeg();
    const duplicateRank = {
      ...seg,
      sizes: [...seg.sizes, { ...seg.sizes[0], rank: 1 }],
    };
    const rankResult = createDxfCandidateLineageSidecarV1(duplicateRank, source, 1);
    expect(rankResult.ok).toBe(false);
    if (!rankResult.ok)
      expect(
        rankResult.blockers.some((blocker) => blocker.code === 'ambiguous-final-locator'),
      ).toBe(true);

    const pieceIndex = seg.identities[0].pieces[0];
    const selected = seg.pieces[pieceIndex];
    const missingPath = {
      ...seg,
      pieces: seg.pieces.map((piece, index) =>
        index === pieceIndex && selected.cut
          ? { ...piece, cut: { ...selected.cut, paths: [9_999_999] } }
          : piece,
      ),
    };
    const pathResult = createDxfCandidateLineageSidecarV1(missingPath, source, 1);
    expect(pathResult.ok).toBe(false);
    if (!pathResult.ok)
      expect(pathResult.blockers.some((blocker) => blocker.code === 'source-path-missing')).toBe(
        true,
      );

    const oversized = {
      ...seg,
      identities: seg.identities.map((identity, index) =>
        index === 0 ? { ...identity, identity: 'X'.repeat(300) } : identity,
      ),
    };
    const oversizedResult = createDxfCandidateLineageSidecarV1(oversized, source, 1);
    expect(oversizedResult.ok).toBe(false);
    if (!oversizedResult.ok) expect(oversizedResult.blockers[0].code).toBe('invalid-input');
  });

  it('blocks an explicitly declared multi-path target atomically with no carried identity', async () => {
    const { source, seg } = await sourceAndSeg();
    const selectedPathId = seg.pieces[seg.identities[0].pieces[0]].cut!.paths[0];
    const otherPathId = source.paths.find((path) => path.pathId !== selectedPathId)?.pathId;
    expect(otherPathId).toBeTypeOf('number');
    const selected = source.paths.find((path) => path.pathId === selectedPathId)!;
    const piece = {
      identity: 'FRONT',
      sizes: [{ sizeToken: 'S', cut: selected.pointsMm }],
    } as unknown as Parameters<typeof projectDxfPieceSpecContourBoundaryV1>[0];
    const projected = projectDxfPieceSpecContourBoundaryV1(
      piece,
      'S',
      Object.freeze({
        contourId: 'dxf-piece-v1/p/FRONT/s/S/g/cut',
        role: 'cut-boundary' as const,
        geometry: Object.freeze({ kind: 'cut' as const }),
        lineage: Object.freeze({
          sourcePathIds: Object.freeze([selectedPathId, otherPathId!]),
          uniformPositiveScale: 1,
          cyclicShift: 0,
          direction: 'forward' as const,
          mutations: Object.freeze([]),
        }),
      }),
    );
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const result = bridgeDxfPipelineProvenanceV1(source, Object.freeze([projected.value]));
    expect(result.pipelineIntegrated).toBe(false);
    expect(result.carrier).toBeNull();
    expect(result.blockers.some((blocker) => blocker.code === 'merge-lineage-not-preserved')).toBe(
      true,
    );
  });

  it('claims the snapshot before hostile Proxy reflection can reenter it', async () => {
    const { source, seg } = await sourceAndSeg();
    const reentry: { value?: ReturnType<typeof createDxfCandidateLineageSidecarV1> } = {};
    let proxy: ReturnType<typeof Proxy.revocable>['proxy'];
    proxy = new Proxy(seg, {
      getPrototypeOf(target) {
        reentry.value = createDxfCandidateLineageSidecarV1(proxy as typeof seg, source, 1);
        return Reflect.getPrototypeOf(target);
      },
    });
    const outer = createDxfCandidateLineageSidecarV1(proxy as typeof seg, source, 1);
    expect(outer.ok).toBe(true);
    expect(reentry.value?.ok).toBe(false);
    const nested = reentry.value;
    if (nested && !nested.ok) expect(nested.blockers[0].detail).toContain('reentrant');
  });

  it('rejects request accessors, symbols and synchronous reflection reentry', () => {
    const getter = vi.fn(() => DXF_PIPELINE_PROVENANCE_REQUEST_V1);
    const accessor = {};
    Object.defineProperty(accessor, 'schemaVersion', { enumerable: true, get: getter });
    expect(validateDxfPipelineProvenanceRequestV1(accessor)?.code).toBe('invalid-input');
    expect(getter).not.toHaveBeenCalled();
    expect(
      validateDxfPipelineProvenanceRequestV1({
        schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1,
        [Symbol('hidden')]: true,
      })?.code,
    ).toBe('invalid-input');

    let nested: ReturnType<typeof validateDxfPipelineProvenanceRequestV1> | undefined;
    let proxy: object;
    proxy = new Proxy(
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      {
        getPrototypeOf(target) {
          nested = validateDxfPipelineProvenanceRequestV1(proxy);
          return Reflect.getPrototypeOf(target);
        },
      },
    );
    expect(validateDxfPipelineProvenanceRequestV1(proxy)).toBeNull();
    expect(nested?.detail).toContain('reentrant');
  });
});

describe('Session DXF pipeline provenance side stage', () => {
  it('carries an actual untouched single-path PieceSpec contour and survives worker cloning', async () => {
    const session = await preparedSession();
    const semantics = await session.runStage('semantics', semanticsInput('cut'), ctx);
    expect(semantics.pieces).toHaveLength(1);
    const result = await session.runStage(
      'dxf-provenance',
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      ctx,
    );
    expect(result.pipelineIntegrated).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(result.carrier?.pieces).toHaveLength(1);
    expect(result.contentBinding).toMatchObject({
      algorithm: 'SHA-256',
      sourceFileId: 'caller/session-1/file-0',
    });
    expect(result.contentBinding?.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.contentBinding?.selectedGeometrySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(structuredClone(result)).toEqual(result);
    const json = JSON.stringify(result);
    expect(json).not.toContain('pointsMm');
    expect(json).not.toContain('sourcePathIds');
    expect(json).not.toContain('rawDxf');
    expect(json).not.toContain('tags');
    expect(json).not.toContain('ast');

    const replay = await session.runStage(
      'dxf-phase-d-replay',
      { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
      ctx,
    );
    expect(replay).toMatchObject({
      replayReady: true,
      carrier: {
        sourceFileId: 'caller/session-1/file-0',
        includesRawDxf: false,
        includesTags: false,
        includesAst: false,
        productionReady: false,
      },
      blockers: [],
      claims: {
        freshPublicCarrierRebuilt: true,
        publicContentBindingExactMatched: true,
        g4f1V2InputComplete: false,
        phaseEAuthorityIntegrated: false,
        productionReady: false,
      },
    });
    expect(replay.carrier?.source.paths[0]?.pathId).toBeTypeOf('number');
    expect(replay.carrier?.contours[0]?.lineage.sourcePathIds).toHaveLength(1);
    expect(replay.carrier?.selectedGeometrySha256).toBe(
      result.contentBinding?.selectedGeometrySha256,
    );
    expect(structuredClone(replay)).toEqual(replay);
    const replayJson = JSON.stringify(replay);
    expect(replayJson).toContain('pointsMm');
    expect(replayJson).toContain('sourcePathIds');
    expect(replayJson).not.toContain('dxfText');
    expect(replayJson).not.toContain('tags');
    expect(replayJson).not.toContain('ast');

    const transportedReplay = structuredClone(replay);
    expect(Object.isFrozen(transportedReplay.carrier?.source)).toBe(false);
    const rehydrated = await rehydrateDxfProductPhaseDReplayV1(
      transportedReplay,
      semantics.pieces,
      structuredClone(result),
    );
    expect(rehydrated.replayReady).toBe(true);
    if (!rehydrated.replayReady || !rehydrated.carrier)
      throw new Error(JSON.stringify(rehydrated.blockers));
    expect(Object.isFrozen(rehydrated)).toBe(true);
    expect(Object.isFrozen(rehydrated.carrier.source)).toBe(true);
    expect(Object.isFrozen(rehydrated.carrier.source.paths[0]?.pointsMm[0])).toBe(true);

    const tamperedReplay = structuredClone(replay) as unknown as {
      carrier: { source: { paths: { pointsMm: { x: number }[] }[] } };
    };
    tamperedReplay.carrier.source.paths[0].pointsMm[0].x += 1;
    const tampered = await rehydrateDxfProductPhaseDReplayV1(
      tamperedReplay,
      semantics.pieces,
      result,
    );
    expect(tampered).toMatchObject({
      replayReady: false,
      carrier: null,
      blockers: [{ code: expect.any(String) }],
    });

    const selected = await selectDxfProductPhaseDSizeV1({
      scopeKey: 'main',
      sizeToken: 'S',
      pieces: semantics.pieces,
      pipeline: result,
      replay: transportedReplay,
    });
    if (!selected.ok) throw new Error(JSON.stringify(selected.blockers));
    expect(selected).toMatchObject({
      ok: true,
      selection: {
        scopeKey: 'main',
        sizeToken: 'S',
        pieceIds: [semantics.pieces[0]!.identity],
      },
      claims: {
        fullPhaseDReplayFreshVerified: true,
        g4f1PhaseDInputReady: true,
        phaseEAuthorityIntegrated: false,
        productionReady: false,
      },
    });
    expect(selected.selection.canonicalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(selected.pipeline.carrier?.pieces).toHaveLength(1);
    expect(selected.phaseD.contours).toHaveLength(1);

    const missingSize = await selectDxfProductPhaseDSizeV1({
      scopeKey: 'main',
      sizeToken: 'M',
      pieces: semantics.pieces,
      pipeline: result,
      replay,
    });
    expect(missingSize).toMatchObject({
      ok: false,
      blockers: [{ code: 'size-selection-empty' }],
    });
  });

  it('validates the replay request without invoking accessors', () => {
    const getter = vi.fn(() => DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1);
    const accessor = {};
    Object.defineProperty(accessor, 'schemaVersion', { enumerable: true, get: getter });
    expect(validateDxfProductPhaseDReplayRequestV1(accessor)?.code).toBe('invalid-input');
    expect(getter).not.toHaveBeenCalled();
    expect(
      validateDxfProductPhaseDReplayRequestV1({
        schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1,
      }),
    ).toBeNull();
  });

  it.each([1 - 5e-13, 1 + 5e-13])(
    'declares the actually applied unit scale for the legacy epsilon shortcut (%s)',
    async (factor) => {
      const session = await preparedSession(factor);
      await session.runStage('semantics', semanticsInput('cut'), ctx);
      const result = await session.runStage(
        'dxf-provenance',
        { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
        ctx,
      );
      expect(result.pipelineIntegrated).toBe(true);
      expect(result.blockers).toEqual([]);
    },
  );

  it('blocks a real semantics offset atomically with no carried identity', async () => {
    const session = await preparedSession();
    await session.runStage('semantics', semanticsInput('seam'), ctx);
    const result = await session.runStage(
      'dxf-provenance',
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      ctx,
    );
    expect(result.pipelineIntegrated).toBe(false);
    expect(result.carrier).toBeNull();
    expect(result.blockers.some((blocker) => blocker.code === 'offset-lineage-not-preserved')).toBe(
      true,
    );
  });

  it('never reuses successful Phase-D replay inputs after a blocked semantics rerun', async () => {
    const session = await preparedSession();
    await session.runStage('semantics', semanticsInput('cut'), ctx);
    const first = await session.runStage(
      'dxf-phase-d-replay',
      { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
      ctx,
    );
    expect(first.replayReady).toBe(true);

    await session.runStage('semantics', semanticsInput('seam'), ctx);
    const second = await session.runStage(
      'dxf-phase-d-replay',
      { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
      ctx,
    );
    expect(second.replayReady).toBe(false);
    expect(second.carrier).toBeNull();
    expect(second.blockers.some(({ code }) => code === 'offset-lineage-not-preserved')).toBe(true);
  });

  it('keeps legacy sessions unmodified and reports not-opted-in only through the side stage', async () => {
    const session = new Session(2, [{ name: 'fixture.dxf', bytes: bytes() }]);
    expect(Reflect.ownKeys(session.files[0])).not.toContain('dxfPathProvenance');
    const result = await session.runStage(
      'dxf-provenance',
      { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
      ctx,
    );
    expect(result.pipelineIntegrated).toBe(false);
    expect(result.carrier).toBeNull();
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(['not-opted-in']);
    expect(Reflect.ownKeys(result)).not.toContain('contentBinding');
  });

  it('binds sourceFileId to one exact file index and rejects duplicate or cross-file ids', async () => {
    const request = { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 } as const;
    const duplicate = new Session(3, [
      {
        name: 'a.dxf',
        bytes: bytes(),
        dxfPathProvenance: { sourceFileId: 'caller/session-3/shared' },
      },
      {
        name: 'b.dxf',
        bytes: bytes(),
        dxfPathProvenance: { sourceFileId: 'caller/session-3/shared' },
      },
    ]);
    const duplicateResult = await duplicate.runStage('dxf-provenance', request, ctx);
    expect(duplicateResult.carrier).toBeNull();
    expect(duplicateResult.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(['duplicate-identity', 'unsupported-source-set']),
    );

    const crossFile = new Session(4, [
      {
        name: 'a.dxf',
        bytes: bytes(),
        dxfPathProvenance: { sourceFileId: 'caller/session-4/file-0' },
      },
      {
        name: 'b.dxf',
        bytes: bytes(),
        dxfPathProvenance: { sourceFileId: 'caller/session-4/file-1' },
      },
    ]);
    const crossFileResult = await crossFile.runStage('dxf-provenance', request, ctx);
    expect(crossFileResult.carrier).toBeNull();
    expect(crossFileResult.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(['source-file-mismatch', 'unsupported-source-set']),
    );
  });
});
