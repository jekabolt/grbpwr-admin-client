// Pure structural contracts extracted from the existing diagnostic preview types.
// These types issue no source, displayed-body, collision, or runtime authority.
import type { MeasurementOpenReferenceDisplaySnapshotBindingV1 } from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v1';

export interface ModelGarmentActualGeometryMeshV2 {
  readonly positions: Float32Array;
  readonly triangles: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export type ModelGarmentDisplayCompositionVec3V1 = readonly [number, number, number];

export interface ModelGarmentDisplayCompositionBoundsV1 {
  readonly minM: ModelGarmentDisplayCompositionVec3V1;
  readonly maxM: ModelGarmentDisplayCompositionVec3V1;
}

export interface ModelGarmentDisplayCompositionTransformV1 {
  readonly uniformScale: number;
  readonly translationM: ModelGarmentDisplayCompositionVec3V1;
  readonly displayBoundsM: ModelGarmentDisplayCompositionBoundsV1;
  readonly garmentBoundsM: ModelGarmentDisplayCompositionBoundsV1;
}

export interface ModelGarmentStrainBandReadyV4 {
  readonly version: 'model-garment-strain-band-composition/v4';
  readonly status: 'ready-a-rest-strain-band';
  readonly generation: number;
  readonly displayBinding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
  readonly bodyMesh: ModelGarmentActualGeometryMeshV2;
  readonly rawGarmentMesh: ModelGarmentActualGeometryMeshV2;
  readonly selectedGarmentMesh: ModelGarmentActualGeometryMeshV2;
  readonly transform: ModelGarmentDisplayCompositionTransformV1;
  readonly candidate: Readonly<{
    positionsSha256: '0a594ff5ea37ec5d162ab0c6d67e080fc0bbe33a4ec6610ddd7974ecc7a76949';
    selectedBand: {
      readonly id: 'band-065-135';
      readonly minimumEdgeLengthRatio: 0.65;
      readonly maximumEdgeLengthRatio: 1.35;
    };
    convergence: { readonly iterationsPerformed: 44; readonly maximumIterationCount: 64 };
    clearance: {
      readonly penetratingVertexCount: 0;
      readonly unsafeAtF32MarginVertexCount: 0;
      readonly minimumClearanceAfterF32MarginM: 0.000001000201922444258;
    };
    edgeStrain: {
      readonly minimumLengthRatio: 0.7151564435445457;
      readonly maximumLengthRatio: 1.3499999351536938;
      readonly rmsAbsoluteStrain: 0.1510942750222284;
      readonly p95AbsoluteStrain: 0.34999687370693056;
      readonly p99AbsoluteStrain: 0.34999928426033633;
    };
    triangleGeometry: {
      readonly minimumAreaRatio: 0.6688987226759094;
      readonly maximumAreaRatio: 1.822478430216515;
      readonly candidateDegenerateTriangleCount: 0;
      readonly candidateNormalFlipCount: 0;
    };
    displacement: {
      readonly movedVertexCount: 734;
      readonly maximumDisplacementM: 0.058643727059477825;
      readonly rmsDisplacementM: 0.022407675808265217;
      readonly maximumVerticalDisplacementM: 0.021949172019958496;
    };
    generalizedSeamIntersection: {
      readonly method: 'authenticated-generalized-seam-equivalence-v1';
      readonly rawTrianglePairCount: 1999000;
      readonly equivalenceExcludedTrianglePairCount: 11794;
      readonly eligibleTrianglePairCount: 1987206;
      readonly broadPhaseCandidatePairCount: 12058;
      readonly eligibleBroadPhaseCandidatePairCount: 264;
      readonly residualIntersectionCount: 0;
    };
  }>;
  readonly boundaryCopy: 'Bounded synthetic geometry research only. The selected predeclared band is not a fit threshold. The rendered MakeHuman body is display-only and is not the clearance authority. Initialization, fit, anatomy, runtime, production, and deployment authority remain false.';
  readonly persistenceCopy: 'Assembly prerequisite evidence is tracked separately. Product persistence and reload remain blocked pending verified product-domain mapping, product-carrier proof, and independent readback.';
  readonly claims: {
    readonly devOnly: true;
    readonly rawAndSelectedTriangleGeometryDisplayed: true;
    readonly selectedAssetByteMatchedToV5Materializer: true;
    readonly boundedSyntheticGeometryResearchOnly: true;
    readonly sameFrozenAnalyticalCandidateAcrossDisplayModels: true;
    readonly renderedBodyIsClearanceAuthority: false;
    readonly thresholdsAreFitThresholds: false;
    readonly perModelFitOrCollisionMeasured: false;
    readonly initializationAdmitted: false;
    readonly fitAuthority: false;
    readonly anatomicalValidityAuthority: false;
    readonly collisionRuntimeAuthority: false;
    readonly runtimeIntegrated: false;
    readonly productPersistenceReloadAuthority: false;
    readonly productionAuthority: false;
    readonly deploymentEligible: false;
    readonly apiWritesPerformed: false;
  };
}

export type ModelGarmentStrainBandBlockedCodeV4 =
  | 'blocked-pose-unbound'
  | 'blocked-stale-generation'
  | 'blocked-invalid-input'
  | 'blocked-body-build'
  | 'blocked-raw-garment-asset'
  | 'blocked-selected-asset'
  | 'blocked-v5-materialization'
  | 'blocked-byte-mismatch';

export type BetaSkirtG3b2PreviewMannequinBlockedCodeV1 =
  | 'blocked-stale-generation'
  | 'blocked-composition'
  | 'blocked-binding-drift';

export type BetaSkirtG3b2PreviewMannequinResultV1 =
  | Readonly<{
      version: 'beta-skirt-g3b2-preview-mannequin/1';
      status: 'ready';
      composition: ModelGarmentStrainBandReadyV4;
      evidence: Readonly<{
        clearanceAuthority: 'frozen-analytical-shadow';
        rawUnsafeVertexCount: 730;
        selectedPenetratingVertexCount: 0;
        selectedUnsafeVertexCount: 0;
        movedVertexCount: 734;
        renderedBodyMeshCollisionStatus: 'unmeasured';
      }>;
      claims: {
        readonly measurementDrivenDisplayMesh: true;
        readonly selectedStrainBandCandidateDisplayed: true;
        readonly analyticalCapsulesVisible: false;
        readonly collisionPrimitivesChanged: false;
        readonly analyticalShadowClearanceMeasured: true;
        readonly renderedBodyIsClearanceAuthority: false;
        readonly renderedBodyMeshCollisionMeasured: false;
        readonly initializationAdmitted: false;
        readonly garmentFitClaimed: false;
        readonly fitClaimEligible: false;
        readonly runtimeAuthorityClaimed: false;
        readonly productionAuthorityClaimed: false;
      };
    }>
  | Readonly<{
      version: 'beta-skirt-g3b2-preview-mannequin/1';
      status: 'blocked';
      code: BetaSkirtG3b2PreviewMannequinBlockedCodeV1;
      compositionCode: ModelGarmentStrainBandBlockedCodeV4 | null;
      message: string;
      claims: {
        readonly measurementDrivenDisplayMesh: true;
        readonly selectedStrainBandCandidateDisplayed: true;
        readonly analyticalCapsulesVisible: false;
        readonly collisionPrimitivesChanged: false;
        readonly analyticalShadowClearanceMeasured: true;
        readonly renderedBodyIsClearanceAuthority: false;
        readonly renderedBodyMeshCollisionMeasured: false;
        readonly initializationAdmitted: false;
        readonly garmentFitClaimed: false;
        readonly fitClaimEligible: false;
        readonly runtimeAuthorityClaimed: false;
        readonly productionAuthorityClaimed: false;
      };
    }>;
