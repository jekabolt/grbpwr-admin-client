import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQualifiedTwoPanelObservedPlacementIntentV1 as build,
  confirmQualifiedTwoPanelObservedPlacementDraftV1 as confirm,
  createQualifiedTwoPanelObservedPlacementDraftV1 as create,
  type QualifiedTwoPanelObservedPlacementAuthoringInputV1 as Input,
  type QualifiedTwoPanelObservedPlacementDraftV1 as Draft,
} from './qualified-two-panel-observed-placement-authoring-v1';
import {
  QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1,
  selectQualifiedTwoPanelBoundarySpanV1,
  type QualifiedTwoPanelCurveSpanV1,
} from './qualified-two-panel-placement-authoring-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { projectPatternImportDxfProductGarmentMeshComposerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-garment-semantics-v1';

const hashGate = vi.hoisted(() => ({
  enabled: false,
  entered: null as (() => void) | null,
  wait: null as Promise<void> | null,
}));
vi.mock('lib/features/sha256', async (original) => {
  const actual = await original<typeof import('lib/features/sha256')>();
  return {
    ...actual,
    sha256Hex: async (bytes: Parameters<typeof actual.sha256Hex>[0]) => {
      if (hashGate.enabled) {
        hashGate.enabled = false;
        hashGate.entered?.();
        await hashGate.wait;
      }
      return actual.sha256Hex(bytes);
    },
  };
});
afterEach(() => {
  hashGate.enabled = false;
  hashGate.entered = null;
  hashGate.wait = null;
});

// A declared synthetic provenance fixture for pure intent tests. No source/mesh authority is minted.
async function fixture() {
  const body = await createObservedPlacementPairCubeBodyFixtureV1();
  const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
  if (!target.ok) throw new Error(target.detail);
  const sample = ['c0', 'c1', 'c1', 'c2', 'c3', 'c3'].map((sourceCurveId, vertexIndex) => ({
    pieceId: 'FRONT',
    contourId: 'front',
    sourceCurveId,
    vertexIndex,
    normalizedArc: vertexIndex / 6,
    sourceCurveT: 0,
  }));
  const projection = {
    composerCanonicalSha256: 'a'.repeat(64),
    phase2ArtifactSha256: 'b'.repeat(64),
    mesh: {
      pieceRanges: [
        { pieceId: 'FRONT', vertexOffset: 0, vertexCount: 6 },
        { pieceId: 'BACK', vertexOffset: 6, vertexCount: 6 },
      ],
      seams: [{ seamId: 'left' }, { seamId: 'right' }],
      boundarySamples: [
        ...sample,
        ...sample.map((s) => ({
          ...s,
          pieceId: 'BACK',
          contourId: 'back',
          vertexIndex: s.vertexIndex + 6,
        })),
      ],
    },
  } as unknown as Input['composerProjection'];
  const snapshot = {
    seal: { canonicalSha256: 'a'.repeat(64) },
    seals: { phase2ArtifactSha256: 'b'.repeat(64) },
    mesh: { pieceCount: 2, seamCount: 2 },
    assembly: { pieceIds: ['FRONT', 'BACK'], seamIds: ['left', 'right'] },
  } as unknown as Input['composerSnapshot'];
  const roles = (contour: string) =>
    Object.fromEntries(
      [
        ['waist', 'c0'],
        ['hem', 'c2'],
        ['leftSeam', 'c1'],
        ['rightSeam', 'c3'],
      ].map(([role, curve]) => [
        role,
        {
          firstCurveKey: JSON.stringify([contour, curve]),
          lastCurveKey: JSON.stringify([contour, curve]),
          traversal: 'forward',
        },
      ]),
    ) as Draft['boundaries']['front'];
  const draft = confirm({
    ...create(snapshot.seal.canonicalSha256, target.canonicalSha256),
    frontPieceId: 'FRONT',
    backPieceId: 'BACK',
    leftSeamId: 'left',
    rightSeamId: 'right',
    boundaries: { front: roles('front'), back: roles('back') },
    annularProfileReviewed: true,
  });
  const input: Input = {
    composerSnapshot: snapshot,
    composerProjection: projection,
    draft,
    observedTarget: {
      target: structuredClone(target.target),
      canonicalSha256: target.canonicalSha256,
    },
  };
  return { body, input, target };
}

describe('pure explicit observed-target placement intent', () => {
  it('starts all roles/profile/confirmation blank and emits only source-selected profile plus exact target SHA', async () => {
    const f = await fixture();
    try {
      const draft = create(f.input.composerSnapshot.seal.canonicalSha256, f.target.canonicalSha256);
      expect([draft.frontPieceId, draft.backPieceId, draft.leftSeamId, draft.rightSeamId]).toEqual([
        '',
        '',
        '',
        '',
      ]);
      expect(draft.confirmation).toBeNull();
      expect(draft.annularProfileReviewed).toBe(false);
      for (const side of ['front', 'back'] as const)
        for (const role of QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1)
          expect(draft.boundaries[side][role]).toEqual({
            firstCurveKey: '',
            lastCurveKey: '',
            traversal: 'forward',
          });
      const result = await build(f.input);
      expect(Object.keys(result)).toEqual([
        'garment',
        'policy',
        'annularParameters',
        'confirmedTargetSha256',
      ]);
      expect(result.confirmedTargetSha256).toBe(f.target.canonicalSha256);
      expect(result.garment.boundaries[0].waist).toEqual({
        contourId: 'front',
        sourceCurveIds: ['c0'],
        boundaryVertexIndices: [0, 1],
      });
      expect(result.annularParameters.pieces[0]).toMatchObject({
        waistSlantRadiusMm: 700,
        hemSlantRadiusMm: 900,
        sectorSpanRad: 0.64,
      });
      expect(result).not.toHaveProperty('body');
      expect(result).not.toHaveProperty('bodyIntent');
      expect(result).not.toHaveProperty('generation');
    } finally {
      f.body.dispose();
    }
  });

  it('requires explicit profile/target confirmation and preserves the reviewed FRONT/BACK restriction', async () => {
    const f = await fixture();
    try {
      await expect(
        build({ ...f.input, draft: { ...f.input.draft, confirmation: null } }),
      ).rejects.toThrow('Explicitly confirm');
      await expect(
        build({ ...f.input, draft: { ...f.input.draft, annularProfileReviewed: false } }),
      ).rejects.toThrow('Review and select');
      await expect(
        build({
          ...f.input,
          draft: { ...f.input.draft, frontPieceId: 'BACK', backPieceId: 'FRONT' },
        }),
      ).rejects.toThrow('requires FRONT as front');
      await expect(build({ ...f.input, observedTarget: null })).rejects.toThrow('target changed');
    } finally {
      f.body.dispose();
    }
  });

  it('refuses stale source or target confirmation, including a replaced digest without reconfirmation', async () => {
    const f = await fixture();
    const other = await createObservedPlacementPairCubeBodyFixtureV1(732);
    try {
      const target = await projectSavedModelObservedPlacementTargetV1(
        other.bodyOwner,
        other.binding,
      );
      if (!target.ok) throw new Error(target.detail);
      await expect(build({ ...f.input, observedTarget: target })).rejects.toThrow('target changed');
      await expect(
        build({
          ...f.input,
          observedTarget: target,
          draft: { ...f.input.draft, observedTargetSha256: target.canonicalSha256 },
        }),
      ).rejects.toThrow('Explicitly confirm');
      const source = structuredClone(f.input);
      Object.assign(source.composerSnapshot.seal, { canonicalSha256: 'c'.repeat(64) });
      Object.assign(source.composerProjection, { composerCanonicalSha256: 'c'.repeat(64) });
      await expect(build(source)).rejects.toThrow('saved source changed');
      Object.assign(source.draft, { composerCanonicalSha256: 'c'.repeat(64) });
      await expect(build(source)).rejects.toThrow('Explicitly confirm');
      const tampered = structuredClone(f.input);
      Object.assign(tampered.observedTarget!.target.geometry, {
        positionsFloat32LeSha256: 'f'.repeat(64),
      });
      await expect(build(tampered)).rejects.toThrow('metadata is invalid');
    } finally {
      f.body.dispose();
      other.dispose();
    }
  });

  it('captures every source, target and intent field before the first awaited hash', async () => {
    const f = await fixture();
    let release = () => {};
    try {
      const entered = new Promise<void>((resolve) => {
        hashGate.entered = resolve;
      });
      hashGate.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      hashGate.enabled = true;
      const pending = build(f.input);
      await entered;
      Object.assign(f.input.draft, {
        frontPieceId: 'CHANGED',
        observedTargetSha256: 'f'.repeat(64),
      });
      Object.assign(f.input.composerSnapshot.seal, { canonicalSha256: 'e'.repeat(64) });
      Object.assign(f.input.observedTarget!.target.geometry, {
        positionsFloat32LeSha256: 'd'.repeat(64),
      });
      Object.assign(f.input.composerProjection.mesh.boundarySamples[0]!, { vertexIndex: 5 });
      release();
      const result = await pending;
      expect(result.confirmedTargetSha256).toBe(f.target.canonicalSha256);
      expect(result.garment.frontPieceId).toBe('FRONT');
      expect(result.garment.boundaries[0].waist.boundaryVertexIndices).toEqual([0, 1]);
      await expect(build(f.input)).rejects.toThrow('saved mesh changed');
    } finally {
      release();
      f.body.dispose();
    }
  });

  it('rejects accessor inputs without invoking them', async () => {
    const f = await fixture();
    let reads = 0;
    try {
      const input = Object.defineProperty({ ...f.input }, 'observedTarget', {
        enumerable: true,
        get() {
          reads++;
          return f.input.observedTarget;
        },
      });
      await expect(build(input)).rejects.toThrow('accessors');
      expect(reads).toBe(0);
    } finally {
      f.body.dispose();
    }
  });

  it('never invokes shadowed typed-array getters/iterators or digest coercion', async () => {
    const f = await fixture();
    let calls = 0;
    try {
      for (const field of ['byteLength', Symbol.iterator]) {
        const carrier = new Float32Array([0, 1]);
        Object.defineProperty(carrier, field, {
          get() {
            calls++;
            throw new Error('must not execute');
          },
        });
        const input = {
          ...f.input,
          composerProjection: { ...f.input.composerProjection, triangleMaterialFrames2: carrier },
        };
        await expect(build(input)).rejects.toThrow('binary carriers');
      }
      const oversized = new Float32Array((8 * 1024 * 1024) / 4 + 1);
      Object.defineProperty(oversized, 'byteLength', {
        get() {
          calls++;
          throw new Error('must not execute');
        },
      });
      await expect(
        build({
          ...f.input,
          composerProjection: { ...f.input.composerProjection, triangleMaterialFrames2: oversized },
        }),
      ).rejects.toThrow('mesh exceeds its byte bound');
      const hostile = {
        [Symbol.toPrimitive]() {
          calls++;
          return 'a'.repeat(64);
        },
      };
      expect(() => create(hostile as never)).toThrow('digests');
      expect(() => create('a'.repeat(64), hostile as never)).toThrow('digests');
      expect(calls).toBe(0);
    } finally {
      f.body.dispose();
    }
  });

  it('passes genuinely composed explicitly selected DXF spans to body-free D0 without a body request', async () => {
    const f = await fixture();
    try {
      const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
      await withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
        seed,
        async ({ composerV2Owner }) => {
          const snapshot = composerV2Owner.snapshot;
          const projection = projectPatternImportDxfProductGarmentMeshComposerV2(composerV2Owner)!;
          // The established test fixture supplies explicit expected IDs only; no fixture owner or
          // historical body enters the new authoring builder or body-free D0 request.
          const fixtureRoles =
            createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
              composerSnapshot: snapshot,
              composerProjection: projection,
              mannequin: {
                status: 'ready',
                composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
              } as never,
            }).semantics.garment;
          const select = (pieceId: string) =>
            Object.fromEntries(
              QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1.map((role) => {
                const expected = fixtureRoles.boundaries.find(
                  (piece) => piece.pieceId === pieceId,
                )![role];
                const forward: QualifiedTwoPanelCurveSpanV1 = {
                  firstCurveKey: JSON.stringify([expected.contourId, expected.sourceCurveIds[0]]),
                  lastCurveKey: JSON.stringify([
                    expected.contourId,
                    expected.sourceCurveIds.at(-1),
                  ]),
                  traversal: 'forward',
                };
                const choice =
                  JSON.stringify(
                    selectQualifiedTwoPanelBoundarySpanV1(projection, pieceId, forward)
                      .boundaryVertexIndices,
                  ) === JSON.stringify(expected.boundaryVertexIndices)
                    ? forward
                    : {
                        firstCurveKey: forward.lastCurveKey,
                        lastCurveKey: forward.firstCurveKey,
                        traversal: 'reverse' as const,
                      };
                return [role, choice];
              }),
            ) as Draft['boundaries']['front'];
          const draft = confirm({
            ...create(snapshot.seal.canonicalSha256, f.target.canonicalSha256),
            frontPieceId: 'FRONT',
            backPieceId: 'BACK',
            leftSeamId: 'side-close',
            rightSeamId: 'side-open',
            boundaries: { front: select('FRONT'), back: select('BACK') },
            annularProfileReviewed: true,
          });
          const result = await build({
            composerSnapshot: snapshot,
            composerProjection: projection,
            draft,
            observedTarget: f.target,
          });
          const d0 = await buildDxfProductTwoPanelSkirtGarmentSemanticsV1({
            schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
            origin: snapshot.origin,
            composerOwner: composerV2Owner,
            expectedComposerCanonicalSha256: snapshot.seal.canonicalSha256,
            garment: result.garment,
            policy: result.policy,
          });
          expect(d0, JSON.stringify(d0)).toMatchObject({ ok: true });
          if (d0.ok) disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(d0.owner);
          expect(result.garment.boundaries[0].waist.sourceCurveIds).toHaveLength(40);
          expect(result.garment.boundaries[0].hem.sourceCurveIds).toHaveLength(50);
        },
      );
    } finally {
      f.body.dispose();
    }
  });
});
