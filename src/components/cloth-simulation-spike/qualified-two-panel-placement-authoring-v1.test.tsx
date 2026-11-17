import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtPlacementSemanticsV1,
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1,
  buildQualifiedTwoPanelPlacementIntentV1,
  createQualifiedTwoPanelPlacementDraftV1,
  listQualifiedTwoPanelBoundaryCurvesV1,
  previewQualifiedTwoPanelBoundaryCurvesV1,
  qualifiedTwoPanelPlacementBodyTargetV1,
  selectQualifiedTwoPanelBoundarySpanV1,
  type QualifiedTwoPanelCurveSpanV1,
  type QualifiedTwoPanelPlacementDraftV1,
} from './qualified-two-panel-placement-authoring-v1';
import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from './beta-skirt-g3b2-preview-mannequin-request-v1';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import {
  SavedPhysicalPlacementAuthoringV1,
  savedPhysicalPlacementAuthoringKeyV1,
} from './saved-physical-placement-authoring-v1';

const key = (id: string, contour = 'contour-front') => JSON.stringify([contour, id]);
function projection(): PatternImportDxfProductGarmentMeshComposerProjectionV2 {
  return {
    composerCanonicalSha256: 'a'.repeat(64),
    phase2ArtifactSha256: 'b'.repeat(64),
    mesh: {
      restPositions2Mm: new Float32Array([0, 0, 1, 0, 2, 0, 2, 1, 1, 2, 0, 1]),
      pieceRanges: [
        { pieceId: 'FRONT', vertexOffset: 0, vertexCount: 6 },
        { pieceId: 'BACK', vertexOffset: 6, vertexCount: 6 },
      ],
      seams: [{ seamId: 'left' }, { seamId: 'right' }],
      boundarySamples: ['c0', 'c1', 'c1', 'c2', 'c3', 'c3']
        .map((sourceCurveId, vertexIndex) => ({
          pieceId: 'FRONT',
          contourId: 'contour-front',
          sourceCurveId,
          vertexIndex,
          normalizedArc: vertexIndex / 6,
          sourceCurveT: 0,
        }))
        .reverse(),
    },
  } as unknown as PatternImportDxfProductGarmentMeshComposerProjectionV2;
}
function snapshot(): PatternImportDxfProductGarmentMeshComposerSnapshotV2 {
  return {
    seal: { canonicalSha256: 'a'.repeat(64) },
    seals: { phase2ArtifactSha256: 'b'.repeat(64) },
    mesh: { pieceCount: 2, seamCount: 2 },
    assembly: { pieceIds: ['FRONT', 'BACK'], seamIds: ['left', 'right'] },
  } as unknown as PatternImportDxfProductGarmentMeshComposerSnapshotV2;
}

describe('qualified explicit source-curve authoring', () => {
  it('starts every role, piece, seam and preset unselected', () => {
    const draft = createQualifiedTwoPanelPlacementDraftV1('a'.repeat(64));
    expect([draft.frontPieceId, draft.backPieceId, draft.leftSeamId, draft.rightSeamId]).toEqual([
      '',
      '',
      '',
      '',
    ]);
    expect(draft.canonicalProfileReviewed).toBe(false);
    expect(draft.neutralTargetConfirmed).toBe(false);
    for (const side of ['front', 'back'] as const)
      for (const role of QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1)
        expect(draft.boundaries[side][role]).toEqual({
          firstCurveKey: '',
          lastCurveKey: '',
          traversal: 'forward',
        });
  });

  it('orders by provenance, includes the terminal sample, and supports explicit wrap and reverse', () => {
    const mesh = projection();
    expect(
      listQualifiedTwoPanelBoundaryCurvesV1(mesh, 'FRONT').map((curve) => curve.sourceCurveId),
    ).toEqual(['c0', 'c1', 'c2', 'c3']);
    expect(
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c1'),
        lastCurveKey: key('c2'),
        traversal: 'forward',
      }),
    ).toEqual({
      contourId: 'contour-front',
      sourceCurveIds: ['c1', 'c2'],
      boundaryVertexIndices: [1, 2, 3, 4],
    });
    expect(
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c3'),
        lastCurveKey: key('c0'),
        traversal: 'forward',
      }).boundaryVertexIndices,
    ).toEqual([4, 5, 0, 1]);
    expect(
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c2'),
        lastCurveKey: key('c1'),
        traversal: 'reverse',
      }).boundaryVertexIndices,
    ).toEqual([4, 3, 2, 1]);
    expect(
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c0'),
        lastCurveKey: key('c3'),
        traversal: 'reverse',
      }).boundaryVertexIndices,
    ).toEqual([1, 0, 5, 4]);
  });

  it('rejects cross-piece/contour spans, disconnected repeated curves and ambiguous sample positions', () => {
    const mesh = projection();
    expect(() =>
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'BACK', {
        firstCurveKey: key('c1'),
        lastCurveKey: key('c2'),
        traversal: 'forward',
      }),
    ).toThrow();
    expect(() =>
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c1'),
        lastCurveKey: key('c2', 'foreign'),
        traversal: 'forward',
      }),
    ).toThrow('one exact piece and contour');
    const repeated = projection();
    Object.assign(
      repeated.mesh.boundarySamples.find((sample) => sample.vertexIndex === 3)!,
      { sourceCurveId: 'c0' },
    );
    expect(() => listQualifiedTwoPanelBoundaryCurvesV1(repeated, 'FRONT')).toThrow('disconnected');
    const ambiguous = projection();
    Object.assign(ambiguous.mesh.boundarySamples[0]!, {
      normalizedArc: ambiguous.mesh.boundarySamples[1]!.normalizedArc,
    });
    expect(() => listQualifiedTwoPanelBoundaryCurvesV1(ambiguous, 'FRONT')).toThrow(
      'unique contour',
    );
    expect(() =>
      selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', {
        firstCurveKey: key('c0'),
        lastCurveKey: key('c3'),
        traversal: 'forward',
      }),
    ).toThrow('open boundary');
  });

  it('uses coordinates only for the SVG while exact selections keep their source IDs', () => {
    const mesh = projection();
    const selected = {
      firstCurveKey: key('c1'),
      lastCurveKey: key('c2'),
      traversal: 'forward',
    } as const;
    const before = selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', selected);
    const preview = previewQualifiedTwoPanelBoundaryCurvesV1(mesh, 'FRONT');
    expect(preview.paths[1]).toMatchObject({
      key: key('c1'),
      sourceCurveId: 'c1',
      d: 'M1 0 L2 0 L2 -1',
    });
    mesh.mesh.restPositions2Mm.fill(999);
    expect(selectQualifiedTwoPanelBoundarySpanV1(mesh, 'FRONT', selected)).toEqual(before);
    expect(previewQualifiedTwoPanelBoundaryCurvesV1(mesh, 'FRONT').paths[1]!.d).not.toBe(
      preview.paths[1]!.d,
    );
  });

  it('renders unset roles with keyboard controls and one explicit save action', () => {
    const props = {
      composerSnapshot: snapshot(),
      composerProjection: projection(),
      bodyTarget: null,
      onConfirmedIntent: vi.fn(async () => {}),
    };
    const html = renderToStaticMarkup(<SavedPhysicalPlacementAuthoringV1 {...props} />);
    expect(html).toContain('Choose a piece to inspect its exact source curves.');
    expect(html).toContain('Save canonical placement');
    expect(html).toContain('Clear choices');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save canonical placement/);
    expect(html).not.toContain('type="checkbox"');
    expect(props.onConfirmedIntent).not.toHaveBeenCalled();
    expect(
      savedPhysicalPlacementAuthoringKeyV1({
        ...props,
        composerSnapshot: structuredClone(props.composerSnapshot),
      }),
    ).toBe(savedPhysicalPlacementAuthoringKeyV1(props));
    expect(
      savedPhysicalPlacementAuthoringKeyV1({
        ...props,
        composerSnapshot: {
          ...props.composerSnapshot,
          seal: { ...props.composerSnapshot.seal, canonicalSha256: 'c'.repeat(64) },
        },
      }),
    ).not.toBe(savedPhysicalPlacementAuthoringKeyV1(props));
  });

  it('rejects stale source selections and a body that has not passed the required target gate', () => {
    const bodyTarget = qualifiedTwoPanelPlacementBodyTargetV1(
      BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 as never,
    );
    expect(bodyTarget).toMatchObject({ poseKind: 'A', poseRevision: 'a-rest' });
    expect(() =>
      qualifiedTwoPanelPlacementBodyTargetV1({
        ...BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1,
        posePresetId: 'posed',
      } as never),
    ).toThrow('neutral A-rest');
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        composerSnapshot: snapshot(),
        composerProjection: projection(),
        draft: createQualifiedTwoPanelPlacementDraftV1('d'.repeat(64)),
        bodyTarget,
      }),
    ).toThrow('source changed');
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        composerSnapshot: snapshot(),
        composerProjection: projection(),
        draft: createQualifiedTwoPanelPlacementDraftV1('a'.repeat(64)),
        bodyTarget,
      }),
    ).toThrow('confirm the neutral');
  });

  it('passes explicitly chosen genuine saved boundary spans to real D0 semantics without fixture authority', async () => {
    const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
    await withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
      seed,
      async ({ composerV2Owner }) => {
        const composerSnapshot = composerV2Owner.snapshot;
        const composerProjection =
          projectPatternImportDxfProductGarmentMeshComposerV2(composerV2Owner)!;
        const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
          composerSnapshot,
          composerProjection,
          mannequin: {
            status: 'ready',
            composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
          } as never,
        });
        const selections = (pieceId: string) => {
          const expected = authored.semantics.garment.boundaries.find(
            (entry) => entry.pieceId === pieceId,
          )!;
          return Object.fromEntries(
            QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1.map((role) => {
              const selected = expected[role];
              const forward = {
                firstCurveKey: JSON.stringify([selected.contourId, selected.sourceCurveIds[0]]),
                lastCurveKey: JSON.stringify([
                  selected.contourId,
                  selected.sourceCurveIds[selected.sourceCurveIds.length - 1],
                ]),
                traversal: 'forward',
              } as const;
              const actual = selectQualifiedTwoPanelBoundarySpanV1(
                composerProjection,
                pieceId,
                forward,
              );
              const choice: QualifiedTwoPanelCurveSpanV1 =
                JSON.stringify(actual.boundaryVertexIndices) ===
                JSON.stringify(selected.boundaryVertexIndices)
                  ? forward
                  : {
                      firstCurveKey: forward.lastCurveKey,
                      lastCurveKey: forward.firstCurveKey,
                      traversal: 'reverse',
                    };
              return [role, choice];
            }),
          ) as QualifiedTwoPanelPlacementDraftV1['boundaries']['front'];
        };
        const draft: QualifiedTwoPanelPlacementDraftV1 = {
          ...createQualifiedTwoPanelPlacementDraftV1(composerSnapshot.seal.canonicalSha256),
          frontPieceId: 'FRONT',
          backPieceId: 'BACK',
          leftSeamId: 'side-close',
          rightSeamId: 'side-open',
          boundaries: { front: selections('FRONT'), back: selections('BACK') },
          canonicalProfileReviewed: true,
          neutralTargetConfirmed: true,
        };
        const intent = buildQualifiedTwoPanelPlacementIntentV1({
          composerSnapshot,
          composerProjection,
          draft,
          bodyTarget: authored.semantics.body,
        });
        const d0 = await buildDxfProductTwoPanelSkirtPlacementSemanticsV1({
          schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
          origin: composerSnapshot.origin,
          expectedComposerCanonicalSha256: composerSnapshot.seal.canonicalSha256,
          composerOwner: composerV2Owner,
          garment: intent.garment,
          body: intent.body,
          policy: intent.policy,
        });
        expect(d0, JSON.stringify(d0)).toMatchObject({ ok: true });
        if (d0.ok) disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(d0.owner);
        expect(intent.bodyIntent.displayedBodyAdmission).toBe(false);
        expect(intent.annularParameters.pieces[0].waistSlantRadiusMm).toBe(700);
        expect(intent.garment.boundaries[0].waist.sourceCurveIds.length).toBe(40);
        expect(intent.garment.boundaries[0].hem.sourceCurveIds.length).toBe(50);
      },
    );
  }, 120_000);
  it('preserves the exact pre-refactor canonical output and validation precedence', () => {
    const mesh = projection();
    const front = [...mesh.mesh.boundarySamples];
    Object.assign(mesh.mesh, {
      boundarySamples: [
        ...front,
        ...front.map((sample) => ({
          ...sample,
          pieceId: 'BACK',
          contourId: 'contour-back',
          vertexIndex: sample.vertexIndex + 6,
        })),
      ],
    });
    const source = snapshot();
    Object.assign(source.assembly, { sourceOperationNumber: 7 });
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
            firstCurveKey: key(curve!, contour),
            lastCurveKey: key(curve!, contour),
            traversal: 'forward',
          },
        ]),
      ) as QualifiedTwoPanelPlacementDraftV1['boundaries']['front'];
    const draft: QualifiedTwoPanelPlacementDraftV1 = {
      ...createQualifiedTwoPanelPlacementDraftV1('a'.repeat(64)),
      frontPieceId: 'FRONT',
      backPieceId: 'BACK',
      leftSeamId: 'left',
      rightSeamId: 'right',
      boundaries: { front: roles('contour-front'), back: roles('contour-back') },
      canonicalProfileReviewed: true,
      neutralTargetConfirmed: true,
    };
    const bodyTarget = {
      providerId: 'test',
      providerRevision: 'r1',
      bodyId: 'test',
      bodyRevision: 'r1',
      poseKind: 'A' as const,
      poseRevision: 'a-rest',
      collisionLodId: 'test-lod',
      landmarks: { revision: 'r1', waistCenterId: 'waist', hipLeftId: 'left', hipRightId: 'right' },
    };
    const input = { composerSnapshot: source, composerProjection: mesh, draft, bodyTarget };
    // Captured from source SHA0b5ebd775a5eb1659251e4a0134bc7e55f598311d9334455325b104f789c60d0 before extraction.
    expect(JSON.stringify(buildQualifiedTwoPanelPlacementIntentV1(input))).toBe(
      '{"confirmed":true,"garment":{"kind":"two-panel-skirt","frontPieceId":"FRONT","backPieceId":"BACK","leftSeamId":"left","rightSeamId":"right","circumferentialOrder":{"direction":"clockwise-seen-from-above","pieceIds":["FRONT","BACK"]},"boundaries":[{"pieceId":"FRONT","waist":{"contourId":"contour-front","sourceCurveIds":["c0"],"boundaryVertexIndices":[0,1]},"hem":{"contourId":"contour-front","sourceCurveIds":["c2"],"boundaryVertexIndices":[3,4]},"leftSeam":{"contourId":"contour-front","sourceCurveIds":["c1"],"boundaryVertexIndices":[1,2,3]},"rightSeam":{"contourId":"contour-front","sourceCurveIds":["c3"],"boundaryVertexIndices":[4,5,0]}},{"pieceId":"BACK","waist":{"contourId":"contour-back","sourceCurveIds":["c0"],"boundaryVertexIndices":[6,7]},"hem":{"contourId":"contour-back","sourceCurveIds":["c2"],"boundaryVertexIndices":[9,10]},"leftSeam":{"contourId":"contour-back","sourceCurveIds":["c1"],"boundaryVertexIndices":[7,8,9]},"rightSeam":{"contourId":"contour-back","sourceCurveIds":["c3"],"boundaryVertexIndices":[10,11,6]}}]},"body":{"providerId":"test","providerRevision":"r1","bodyId":"test","bodyRevision":"r1","poseKind":"A","poseRevision":"a-rest","collisionLodId":"test-lod","landmarks":{"revision":"r1","waistCenterId":"waist","hipLeftId":"left","hipRightId":"right"}},"policy":{"id":"canonical-medium-actual-body-static-placement-policy","revision":"canonical-medium-actual-body-static-placement-policy-v1","mapping":{"kind":"authored-annular-sector-conical","id":"canonical-medium-authored-annular-mapping","revision":"canonical-medium-authored-annular-mapping-v1"},"authoredClearanceM":0.008,"clothThicknessM":0.002,"retention":{"id":"canonical-medium-waist-boundary-support","revision":"canonical-medium-waist-boundary-support-v1","kind":"waist-boundary-support"}},"bodyIntent":{"kind":"confirmed-neutral-A-target","confirmed":true,"displayedBodyAdmission":false},"operation":{"sourceOperationNumber":7,"pieceIds":["FRONT","BACK"],"seamIds":["left","right"]},"annularParameters":{"id":"canonical-medium-authored-annular-mapping","revision":"canonical-medium-authored-annular-mapping-v1","units":{"planar":"mm","body":"m","angle":"rad"},"waistReferenceColliderId":"waist-collider","seamAnchor":{"seamId":"left","bodyAngleRad":0},"pieces":[{"pieceId":"FRONT","planarApexMm":[0,0],"planarStartRayUnit2":[0.8020957578842927,0.5971954413623921],"planarAngularDirection":-1,"planarStartSeamId":"left","waistSlantRadiusMm":700,"hemSlantRadiusMm":900,"sectorSpanRad":0.64},{"pieceId":"BACK","planarApexMm":[0,0],"planarStartRayUnit2":[-0.8020957578842927,-0.5971954413623921],"planarAngularDirection":-1,"planarStartSeamId":"left","waistSlantRadiusMm":700,"hemSlantRadiusMm":900,"sectorSpanRad":0.64}],"acceptance":{"id":"canonical-acceptance","revision":"canonical-acceptance-v1","parameterResidualMm":0.01,"parameterResidualRad":0.000001,"conicalIdentityResidualM":1e-8,"maxAbsEdgeStretchDelta":0.01,"maxAbsAreaScaleDelta":0.02,"minNormalizedOrientationDot":0.999,"maxAbsWarpGreenStrain":0.01,"maxAbsWeftGreenStrain":0.01,"maxAbsShear":0.01,"selfIntersectionPolicyRevision":"self-intersection-policy-v1"}}}',
    );
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        ...input,
        composerProjection: { ...mesh, composerCanonicalSha256: 'c'.repeat(64) },
        draft: {
          ...draft,
          composerCanonicalSha256: 'd'.repeat(64),
          neutralTargetConfirmed: false,
          canonicalProfileReviewed: false,
        },
        bodyTarget: null,
      }),
    ).toThrow('The exact two-piece saved mesh changed. Choose its garment roles again.');
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        ...input,
        draft: {
          ...draft,
          composerCanonicalSha256: 'd'.repeat(64),
          neutralTargetConfirmed: false,
          canonicalProfileReviewed: false,
        },
        bodyTarget: null,
      }),
    ).toThrow('The saved source changed. Choose its garment roles again.');
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        ...input,
        draft: {
          ...draft,
          neutralTargetConfirmed: false,
          canonicalProfileReviewed: false,
          frontPieceId: '',
        },
      }),
    ).toThrow('Select a current body and confirm the neutral A placement target.');
    expect(() =>
      buildQualifiedTwoPanelPlacementIntentV1({
        ...input,
        draft: { ...draft, canonicalProfileReviewed: false, frontPieceId: '' },
      }),
    ).toThrow('Review and select the canonical annular placement profile.');
  });
});
