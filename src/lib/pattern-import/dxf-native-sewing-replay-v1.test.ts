import {
  captureDirectDxfAuthoringV1,
  directDxfAuthoringOpenFileV1,
} from 'components/managers/tech-card/components/pattern-import/direct-dxf-authoring-capture-v1';
import { describe, expect, it, vi } from 'vitest';
import * as NativeAuthority from './dxf-source-native-straight-edge-authority-v1';
import * as SewingReplay from './dxf-native-sewing-replay-v1';
import { readDxfWithPathProvenanceV1, segmentDxf } from './adapters/dxf';
import { createDxfPieceSpecProvenanceSourceV1 } from './dxf-piece-spec-provenance-bridge-v1';
import {
  createDxfNativeSewingCandidateLineageV1,
  DXF_PIPELINE_PROVENANCE_REQUEST_V1,
} from './dxf-pipeline-provenance-v1';
import {
  DXF_NATIVE_SEWING_REPLAY_REQUEST_V1,
  validateDxfNativeSewingReplayRequestV1,
} from './dxf-native-sewing-replay-v1';
import { DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 } from './dxf-product-phase-d-replay-v1';
import {
  buildDxfPipelineSourcePathCarrierV2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
} from './dxf-pipeline-source-path-carrier-v2';
import { readDxfWithSourceNativeStraightEdgeAuthorityV1 } from './dxf-source-native-straight-edge-authority-v1';
import {
  bindDxfProductPhaseDNativeStraightEdgesV3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
} from '../cloth/domain/dxf-product-phase-d-native-straight-edge-binding-v1';
import { Session, type StageCtx } from './worker/session';
import type { PatternImportOpenFile, StageIO } from './types';
import type { PlannedBlock } from './write/plan';
import { writeR2000 } from './write/r2000';

const opts = { sagittaMm: 0.05, keepFills: true };
const sourceFileId = 'native-sewing-test/file';
const request = { schemaVersion: DXF_NATIVE_SEWING_REPLAY_REQUEST_V1 };
const ctx: StageCtx = { progress: () => {}, checkCancel: () => {} };
// Authored DXF fixture geometry. No source reader/provenance/native/semantics port is mocked.
function fixture(sewing = true, clockwise = false, sizeTokens = ['S']): string {
  const cut = [
    { x: 30, y: 40 },
    { x: 150, y: 40 },
    { x: 150, y: 220 },
    { x: 30, y: 220 },
  ];
  const seam = [
    { x: 40, y: 50 },
    { x: 140, y: 50 },
    { x: 140, y: 210 },
    { x: 40, y: 210 },
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
    seam: sewing ? (clockwise ? seam.reverse() : seam) : null,
    internal: [],
    foldLines: 0,
    foldIsMirror: false,
    drills: [],
    grain: {
      tail: { x: 90, y: 80 },
      tip: { x: 90, y: 180 },
      barb: { x: 85, y: 172 },
      u: { x: 0, y: 1 },
    },
    notches: [],
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    derivedFrom: null,
    size: {}, // writeR2000 only consumes the planned drawing fields above.
  } as unknown as PlannedBlock;
  return writeR2000(
    sizeTokens.map((sizeToken, rank) => ({
      ...block,
      name: `FRONT_${sizeToken}`,
      sizeToken,
      labelSize: sizeToken,
      rank,
      sizeId: rank + 1,
    })),
  );
}
// Modify one declared L14 DXF entity by group codes, never by finding a coordinate match.
function modifyNativeSeam(kind: 'curved' | 'multi-path' | 'open' | 'inferred-layer8'): string {
  const lines = fixture().trimEnd().split(/\r?\n/);
  const tags: [string, string][] = [];
  for (let i = 0; i < lines.length; i += 2) tags.push([lines[i].trim(), lines[i + 1]]);
  let start = -1,
    end = -1;
  for (let i = 0; i < tags.length; i += 1) {
    if (tags[i][0] !== '0' || tags[i][1] !== 'LWPOLYLINE') continue;
    let j = i + 1;
    while (j < tags.length && tags[j][0] !== '0') j += 1;
    if (tags.slice(i, j).some(([code, value]) => code === '8' && value === '14')) {
      start = i;
      end = j;
      break;
    }
  }
  if (start < 0) throw new Error('Authored fixture L14 entity is missing.');
  const entity = tags.slice(start, end);
  if (kind === 'curved') {
    const vertexY = entity.findIndex(([code]) => code === '20');
    entity.splice(vertexY + 1, 0, ['42', '0.1']);
  } else if (kind === 'open') entity.find(([code]) => code === '70')![1] = '0';
  else if (kind === 'inferred-layer8') entity.find(([code]) => code === '8')![1] = '8';
  else {
    const owner = entity.find(([code]) => code === '330')![1];
    const points = [
      [40, 50],
      [140, 50],
      [140, 210],
      [40, 210],
    ];
    entity.length = 0;
    for (let i = 0; i < 4; i += 1) {
      const a = points[i],
        b = points[(i + 1) % 4];
      entity.push(
        ['0', 'LINE'],
        ['5', `A0F${i}`],
        ['330', owner],
        ['100', 'AcDbEntity'],
        ['8', '14'],
        ['100', 'AcDbLine'],
        ['10', String(a[0])],
        ['20', String(a[1])],
        ['30', '0'],
        ['11', String(b[0])],
        ['21', String(b[1])],
        ['31', '0'],
      );
    }
  }
  tags.splice(start, end - start, ...entity);
  return tags.flat().join('\n') + '\n';
}
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const semanticsInput: StageIO['semantics']['in'] = {
  fileAllowance: {
    meaning: 'cut',
    allowanceMm: 10,
    origin: 'operator',
    evidence: ['explicit fixture 10mm allowance'],
  },
  pieceOverrides: {},
  operatorGrain: {},
};
async function prepared(
  text = fixture(),
  factor = 1,
  openedFile?: PatternImportOpenFile,
  sizeTokens = ['S'],
) {
  const session = new Session(1, [
    openedFile ?? { name: 'fixture.dxf', bytes: bytes(text), dxfPathProvenance: { sourceFileId } },
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
  await session.runStage(
    'sizes',
    { card: sizeTokens.map((token, rank) => ({ sizeId: rank + 1, name: token, token, rank })) },
    ctx,
  );
  await session.runStage(
    'pieces',
    { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } },
    ctx,
  );
  const semantics = await session.runStage('semantics', semanticsInput, ctx);
  return { session, semantics, text };
}
async function segmentation(text = fixture()) {
  const result = await readDxfWithPathProvenanceV1(
    { id: '0', name: 'fixture.dxf', bytes: bytes(text) },
    opts,
    { sourceFileId },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  const source = createDxfPieceSpecProvenanceSourceV1(result.value);
  if (!source.ok) throw new Error(JSON.stringify(source.blockers));
  return { seg: segmentDxf(result.value.read), source: source.value };
}

describe('explicit native drawn sewing replay (CPU, genuine DXF source chain)', () => {
  it('captures genuine original-worker authoring views through the production wizard bridge', async () => {
    const sizeTokens = ['XS', 'S', 'M', 'L', 'XL'];
    const text = fixture(true, false, sizeTokens);
    const file = { name: 'main.dxf', arrayBuffer: async () => bytes(text) };
    const firstOpen = await directDxfAuthoringOpenFileV1(file, 0);
    const restoredOpen = await directDxfAuthoringOpenFileV1(file, 0);
    const secondIndex = await directDxfAuthoringOpenFileV1(file, 1);
    expect(firstOpen.dxfPathProvenance?.sourceFileId).toMatch(/^dxf:[\w-]{43}:0$/);
    expect(firstOpen.dxfPathProvenance).toEqual(restoredOpen.dxfPathProvenance);
    expect(secondIndex.dxfPathProvenance).not.toEqual(firstOpen.dxfPathProvenance);
    const { session, semantics } = await prepared(text, 1, firstOpen, sizeTokens);
    try {
      expect(semantics.blocked).toEqual([]);
      expect(semantics.pieces).toHaveLength(1);
      expect(semantics.pieces[0].ungraded).toBe(false);
      expect(semantics.pieces[0].sizes.map((size) => size.sizeToken)).toEqual(sizeTokens);
      const captured = await captureDirectDxfAuthoringV1([file], (stage, input) =>
        session.runStage(stage, input, ctx),
      );
      expect(captured.dxfProvenance?.pipelineIntegrated).toBe(true);
      expect(captured.dxfPhaseDReplay?.replayReady).toBe(true);
      expect(captured.dxfNativeSewingReplay?.replayReady).toBe(true);
      if (!captured.dxfNativeSewingReplay?.replayReady) throw new Error('Native replay missing');
      expect(captured.dxfNativeSewingReplay.pipeline.contentBinding?.sourceSha256).toBe(
        captured.dxfProvenance?.contentBinding?.sourceSha256,
      );
      expect(
        captured.dxfNativeSewingReplay.pipeline.contentBinding?.selectedGeometrySha256,
      ).not.toBe(captured.dxfProvenance?.contentBinding?.selectedGeometrySha256);

      const written = await session.runStage(
        'write',
        {
          techCardId: 1,
          generator: 'grbpwr-admin pattern-import (worker)',
          dialect: 'r12',
          scopes: [
            {
              scopeKey: 'main',
              label: 'Main',
              fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
              bomLineKey: '',
              isInterlining: false,
            },
          ],
          assignment: {
            byPurpose: { main: [semantics.pieces[0].seed] },
            interliningInBom: false,
            proposals: [],
          },
          sizes: sizeTokens.map((token, rank) => ({
            token,
            sizeId: rank + 1,
            name: token,
            sourceLabel: token,
            rank,
          })),
        },
        ctx,
      );
      expect(written.gate.main.checks.find((check) => check.id === 'G8-monotone')).toMatchObject({
        ok: true,
        note: expect.stringContaining('4 identical DXF rank pairs preserved as drawn'),
      });
      expect(written.scopes[0].manifest.blocks.map((block) => block.sizeToken)).toEqual(sizeTokens);
    } finally {
      session.close();
    }
  });

  it('claims request capture before Proxy reflection can reenter validation', () => {
    let nested: ReturnType<typeof validateDxfNativeSewingReplayRequestV1> | undefined;
    const proxy = new Proxy(request, {
      getPrototypeOf(target) {
        nested = validateDxfNativeSewingReplayRequestV1(request);
        return Reflect.getPrototypeOf(target);
      },
    });
    expect(validateDxfNativeSewingReplayRequestV1(proxy)).toBeNull();
    expect(nested?.code).toBe('invalid-input');
  });

  it.each([false, true])(
    'preserves 10mm nonzero cut and binds the separately drawn native seam; clockwise=%s',
    async (clockwise) => {
      const { session, semantics, text } = await prepared(fixture(true, clockwise));
      try {
        const originalSemantics = JSON.stringify(semantics);
        const cutBefore = await session.runStage(
          'dxf-provenance',
          { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
          ctx,
        );
        const cutReplayBefore = await session.runStage(
          'dxf-phase-d-replay',
          { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
          ctx,
        );
        const result = await session.runStage('dxf-native-sewing-replay', request, ctx);
        expect(result.replayReady, JSON.stringify(result.blockers)).toBe(true);
        if (!result.replayReady) return;
        expect(semantics.pieces[0].allowance.allowanceMm).toBe(10);
        expect(semantics.pieces[0].sizes[0].cut).not.toEqual(semantics.pieces[0].sizes[0].seam);
        expect(result.pipeline.carrier!.pieces[0].contours[0]).toMatchObject({
          role: 'sewing-boundary',
          geometry: { kind: 'seam' },
        });
        const original = await segmentation(text);
        const seamPath = original.seg.pieces[0].seam!.paths[0];
        expect(result.replay.carrier.contours[0].lineage.sourcePathIds).toEqual([seamPath]);
        expect(result.replay.carrier.contours[0].pointsMm).toEqual(
          semantics.pieces[0].sizes[0].seam,
        );
        expect(result.claims).toMatchObject({
          nativeAuthorityMinted: false,
          writerExportShaBound: false,
          successfulReplayExtraOriginalByteDecodePasses: 1,
        });
        const carrier = await buildDxfPipelineSourcePathCarrierV2({
          schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
          source: result.replay.carrier.source,
          contours: result.replay.carrier.contours,
          pieces: semantics.pieces,
          pipeline: result.pipeline,
          sourceSha256: result.replay.carrier.sourceSha256,
        });
        expect(carrier.ok).toBe(true);
        if (!carrier.ok) return;
        const native = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
          { id: '0', name: 'fixture.dxf', bytes: bytes(text) },
          opts,
          { sourceFileId },
        );
        expect(native.ok).toBe(true);
        if (!native.ok) return;
        const expected = {
          sourceFileId,
          sourceSha256: result.replay.carrier.sourceSha256,
          selectedGeometrySha256: result.replay.carrier.selectedGeometrySha256,
        };
        const binding = await bindDxfProductPhaseDNativeStraightEdgesV3(
          native.value.owner,
          carrier.artifact,
          expected,
        );
        expect(binding.ok, JSON.stringify(binding)).toBe(true);
        if (!binding.ok) return;
        const projected = consumeDxfProductPhaseDNativeStraightEdgesV3(binding.owner, expected);
        expect(projected.ok).toBe(true);
        if (projected.ok) expect(projected.projection.edges).toHaveLength(4);
        expect(
          await session.runStage(
            'dxf-provenance',
            { schemaVersion: DXF_PIPELINE_PROVENANCE_REQUEST_V1 },
            ctx,
          ),
        ).toEqual(cutBefore);
        expect(
          await session.runStage(
            'dxf-phase-d-replay',
            { schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 },
            ctx,
          ),
        ).toEqual(cutReplayBefore);
        expect(JSON.stringify(semantics)).toBe(originalSemantics);
      } finally {
        session.close();
      }
    },
  );

  it('refuses missing drawn seam even though semantics can generate an offset seam', async () => {
    const { session, semantics } = await prepared(fixture(false));
    try {
      expect(semantics.pieces[0].sizes[0].seam!.length).toBeGreaterThan(2);
      const result = await session.runStage('dxf-native-sewing-replay', request, ctx);
      expect(result.replayReady).toBe(false);
      expect(result.blockers[0].detail).toContain('L14');
    } finally {
      session.close();
    }
  });

  it('rejects accessor requests without invocation and preserves a valid subsequent replay', async () => {
    const { session } = await prepared();
    const getter = vi.fn(() => DXF_NATIVE_SEWING_REPLAY_REQUEST_V1);
    try {
      const hostile = Object.defineProperty({}, 'schemaVersion', { enumerable: true, get: getter });
      expect(validateDxfNativeSewingReplayRequestV1(hostile)?.code).toBe('invalid-input');
      expect(
        (await session.runStage('dxf-native-sewing-replay', hostile as typeof request, ctx))
          .replayReady,
      ).toBe(false);
      expect(getter).not.toHaveBeenCalled();
      expect((await session.runStage('dxf-native-sewing-replay', request, ctx)).replayReady).toBe(
        true,
      );
    } finally {
      session.close();
    }
  });

  it('refuses L8 inference, multiple source paths, ambiguous L14 roles and source path drift', async () => {
    const { seg, source } = await segmentation();
    const first = seg.pieces[0],
      path = first.seam!.paths[0];
    const cases = [
      { ...first, seamSource: 'L8-loop' as const },
      { ...first, seam: { ...first.seam!, paths: [path, first.cut!.paths[0]] } },
      { ...first, roles: { ...first.roles, 999: 'seam' as const } },
      { ...first, seam: { ...first.seam!, paths: [999] }, roles: { 999: 'seam' as const } },
    ];
    for (const piece of cases)
      expect(
        createDxfNativeSewingCandidateLineageV1({ ...seg, pieces: [piece] }, source, 1).ok,
      ).toBe(false);
  });

  it.each(['curved', 'multi-path', 'open', 'inferred-layer8'] as const)(
    'refuses a genuine unsupported %s DXF seam without substituting cut geometry',
    async (kind) => {
      const { session } = await prepared(modifyNativeSeam(kind));
      try {
        const result = await session.runStage('dxf-native-sewing-replay', request, ctx);
        expect(result.replayReady, kind).toBe(false);
        expect(result.pipeline).toBeNull();
        expect(result.replay).toBeNull();
        expect(result.blockers.length).toBeGreaterThan(0);
        if (kind === 'curved') expect(result.blockers[0].detail).toContain('straight-native');
      } finally {
        session.close();
      }
    },
  );

  it('preserves explicit uniform unit scaling but keeps native source coordinates unscaled', async () => {
    const { session, semantics } = await prepared(fixture(), 2);
    try {
      const result = await session.runStage('dxf-native-sewing-replay', request, ctx);
      expect(result.replayReady, JSON.stringify(result.blockers)).toBe(true);
      if (!result.replayReady) return;
      const boundary = result.replay.carrier.contours[0];
      expect(boundary.lineage.uniformPositiveScale).toBe(2);
      expect(boundary.pointsMm).toEqual(semantics.pieces[0].sizes[0].seam);
      const path = result.replay.carrier.source.paths.find(
        (p) => p.pathId === boundary.lineage.sourcePathIds[0],
      )!;
      expect(path.pointsMm[0]).toEqual({ x: 40, y: 50 });
      expect(boundary.pointsMm[0]).toEqual({ x: 80, y: 100 });
    } finally {
      session.close();
    }
  });

  it('local cancellation refuses the read without destroying the live Session', async () => {
    const { session } = await prepared();
    try {
      await expect(
        session.runStage('dxf-native-sewing-replay', request, {
          progress: () => {},
          checkCancel: () => {
            throw new Error('local read cancelled');
          },
        }),
      ).rejects.toThrow('local read cancelled');
      expect((await session.runStage('dxf-native-sewing-replay', request, ctx)).replayReady).toBe(
        true,
      );
    } finally {
      session.close();
    }
  });

  it('rejects source close after genuine decoder await, then exposes no retained replay', async () => {
    const { session } = await prepared();
    const original = NativeAuthority.readDxfWithSourceNativeStraightEdgeAuthorityV1;
    const spy = vi
      .spyOn(NativeAuthority, 'readDxfWithSourceNativeStraightEdgeAuthorityV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        queueMicrotask(() => session.close());
        return result;
      });
    try {
      await expect(session.runStage('dxf-native-sewing-replay', request, ctx)).rejects.toThrow(
        'changed during replay',
      );
      expect((await session.runStage('dxf-native-sewing-replay', request, ctx)).replayReady).toBe(
        false,
      );
    } finally {
      spy.mockRestore();
      session.close();
    }
  });

  it('rejects final-await replacement even after the genuine content builder has succeeded', async () => {
    const { session } = await prepared();
    const original = SewingReplay.buildDxfNativeSewingReplayV1;
    let built = false;
    const spy = vi
      .spyOn(SewingReplay, 'buildDxfNativeSewingReplayV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        built = result.replayReady;
        queueMicrotask(() => session.close());
        return result;
      });
    try {
      await expect(session.runStage('dxf-native-sewing-replay', request, ctx)).rejects.toThrow(
        'changed during replay',
      );
      expect(built).toBe(true);
    } finally {
      spy.mockRestore();
      session.close();
    }
  });

  it('does not reuse a preceding successful native sewing result after upstream invalidation', async () => {
    const { session } = await prepared();
    try {
      expect((await session.runStage('dxf-native-sewing-replay', request, ctx)).replayReady).toBe(
        true,
      );
      await session.runStage(
        'sizes',
        { card: [{ sizeId: 1, name: 'Small', token: 'S', rank: 0 }] },
        ctx,
      );
      expect((await session.runStage('dxf-native-sewing-replay', request, ctx)).replayReady).toBe(
        false,
      );
    } finally {
      session.close();
    }
  });
});
