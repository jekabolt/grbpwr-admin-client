import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtPlacementSemanticsV1,
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1,
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
  type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';

import { BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1 } from './beta-skirt-canonical-medium-product-placement-v1';
import type { PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 } from './pattern-import-dxf-product-saved-canonical-medium-authored-input-contract-v1';
import type { PatternImportDxfProductSavedActualBodyInputV2 } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-v2';
import { projectBetaSkirtCanonicalMediumDisplayedBodyV2 } from './beta-skirt-canonical-medium-displayed-body-admission-v2';

export type PatternImportDxfProductSavedPlacementAuthoredInputRequestV1 = Readonly<{
  placementReadOwner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
  composerOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
}> &
  PatternImportDxfProductSavedActualBodyInputV2;

export type PatternImportDxfProductSavedPlacementAuthoredInputBlockerCodeV1 =
  | 'invalid-input'
  | 'verified-placement-owner-required'
  | 'composer-owner-unavailable'
  | 'saved-placement-binding-mismatch'
  | 'canonical-frame-incompatible'
  | 'display-body-binding-mismatch'
  | 'persisted-semantics-blocked'
  | 'input-became-stale';

export type PatternImportDxfProductSavedPlacementAuthoredInputResultV1 =
  | Readonly<{
      ok: true;
      authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1;
      bindings: Readonly<{ placementSidecarSha256: string; composerCanonicalSha256: string }>;
      claims: Readonly<{
        verifiedPersistedPlacementConsumed: true;
        currentComposerBound: true;
        exactPersistedRolesValidated: true;
        explicitCanonicalParametersMatched: true;
        displayBodyIdentityBound: true;
        inferredRolesUsed: false;
        annularAcceptanceEvaluated: false;
        placementAuthority: false;
        runtimeAuthority: false;
      }>;
    }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfProductSavedPlacementAuthoredInputBlockerCodeV1;
      detail: string;
      authored: null;
    }>;

class AdapterFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSavedPlacementAuthoredInputBlockerCodeV1,
    detail: string,
  ) {
    super(detail);
  }
}

function fail(
  code: PatternImportDxfProductSavedPlacementAuthoredInputBlockerCodeV1,
  detail: string,
): never {
  throw new AdapterFailure(code, detail);
}

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') fail('invalid-input', 'An own data record is required.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor))
    fail('invalid-input', `Own data field ${key} is required.`);
  return descriptor.value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function freezePlain<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freezePlain(item);
    Object.freeze(value);
  }
  return value;
}

function currentDisplay(
  mannequin: unknown,
): PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1['displayBody'] {
  if (field(mannequin, 'status') !== 'ready')
    fail('display-body-binding-mismatch', 'Displayed mannequin is not ready.');
  const display = field(field(mannequin, 'composition'), 'displayBinding');
  return currentDisplayBinding(display);
}

function currentDisplayBinding(
  display: unknown,
): PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1['displayBody'] {
  const modelId = field(display, 'modelId');
  const modelContentRevision = field(display, 'modelContentRevision');
  const inputFingerprint = field(display, 'inputFingerprint');
  const basisKind = field(display, 'basisKind');
  const posePresetId = field(display, 'posePresetId');
  if (
    typeof modelId !== 'string' ||
    !modelId ||
    typeof modelContentRevision !== 'string' ||
    !modelContentRevision ||
    typeof inputFingerprint !== 'string' ||
    !inputFingerprint ||
    basisKind !== 'neutral' ||
    posePresetId !== 'a-rest'
  )
    fail(
      'display-body-binding-mismatch',
      'The current canonical display requires an exact neutral A-rest identity.',
    );
  return Object.freeze({
    modelId,
    modelContentRevision,
    inputFingerprint,
    basisKind,
    posePresetId,
  });
}

function currentDisplayReader(input: PatternImportDxfProductSavedActualBodyInputV2) {
  const observed = Object.getOwnPropertyDescriptor(input, 'canonicalDisplayedBodyOwner');
  const legacy = Object.getOwnPropertyDescriptor(input, 'mannequin');
  if (Boolean(observed) === Boolean(legacy))
    fail('invalid-input', 'Exactly one current body input is required.');
  if (!observed) {
    const mannequin = field(input, 'mannequin');
    return () => currentDisplay(mannequin);
  }
  const owner = field(input, 'canonicalDisplayedBodyOwner');
  return () => {
    const projection = projectBetaSkirtCanonicalMediumDisplayedBodyV2(owner);
    if (!projection)
      fail('display-body-binding-mismatch', 'The admitted displayed body is no longer current.');
    return currentDisplayBinding(projection.binding);
  };
}

function requireCurrentBindings(
  placement: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
  composer: PatternImportDxfProductGarmentMeshComposerOwnerV2,
): void {
  const { row, source, topology } = placement.document.bindings;
  const snapshot = composer.snapshot;
  if (
    snapshot.origin !== 'verified-saved-row' ||
    row.techCardId !== snapshot.row.techCardId ||
    row.scopeKey !== snapshot.row.scopeKey ||
    row.patternLineKey !== snapshot.row.patternLineKey ||
    // The saved Composer V2 field predates separate wire fields: its patternVersion is the
    // saved-row revision. Placement V2 retains the human pattern version independently.
    row.revision !== snapshot.row.patternVersion ||
    row.cardLockVersion !== snapshot.row.cardLockVersion ||
    row.dxfSha256 !== snapshot.row.dxfSha256 ||
    source.sourceFileSha256 !== snapshot.seals.sourceFileSha256 ||
    source.writerExportSha256 !== snapshot.seals.productExportSha256 ||
    source.handoffSourceAggregateSha256 !== snapshot.seals.handoffSourceAggregateSha256 ||
    source.sizeSelectionSha256 !== snapshot.seals.sizeSelectionSha256 ||
    source.catalogCanonicalSha256 !== snapshot.seals.catalogCanonicalSha256 ||
    source.proposalFingerprint !== snapshot.seals.proposalFingerprint ||
    source.phaseEPlanSha256 !== snapshot.seals.phaseEPlanSha256 ||
    source.mappingCompositionSha256 !== snapshot.seals.compositionCanonicalSha256 ||
    source.handoffCanonicalSha256 !== snapshot.seals.handoffCanonicalSha256 ||
    source.aggregateCanonicalSha256 !== snapshot.seals.aggregateCanonicalSha256 ||
    source.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256 ||
    topology.documentId !== snapshot.assembly.documentId ||
    topology.revision !== snapshot.assembly.revision ||
    topology.sourceOperationNumber !== snapshot.assembly.sourceOperationNumber ||
    topology.localOperationOrder !== snapshot.assembly.localOperationOrder ||
    !same(topology.pieceIds, snapshot.assembly.pieceIds) ||
    !same(topology.seamIds, snapshot.assembly.seamIds)
  )
    fail(
      'saved-placement-binding-mismatch',
      'Persisted placement row, source, mesh or Assembly Order differs from the current saved composer.',
    );
}

function requireCanonicalParameters(
  placement: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
): void {
  const { semantics, annular } = placement.placementAuthoring;
  const garment = semantics.garment;
  const parameters = annular.parameters;
  const frame = BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1;
  if (
    garment.frontPieceId !== frame.pieces[0].pieceId ||
    garment.backPieceId !== frame.pieces[1].pieceId ||
    garment.circumferentialOrder.direction !== 'clockwise-seen-from-above' ||
    !same(
      garment.circumferentialOrder.pieceIds,
      frame.pieces.map(({ pieceId }) => pieceId),
    ) ||
    parameters.seamAnchor.seamId !== garment.leftSeamId ||
    parameters.seamAnchor.bodyAngleRad !== frame.seamAnchorAngleRad ||
    parameters.acceptance.parameterResidualMm !== 0.01 ||
    parameters.acceptance.parameterResidualRad !== 0.000001
  )
    fail(
      'canonical-frame-incompatible',
      'Persisted roles, order, seam anchor or mapping tolerances are not the supported canonical frame.',
    );
  frame.pieces.forEach((piece, index) => {
    const persisted = parameters.pieces[index]!;
    // The existing canonical map starts at the explicitly authored end ray and reverses theta.
    const startRay = [
      piece.planarMirrorSign * Math.cos(frame.sectorSpanRadPerPiece),
      piece.planarMirrorSign * Math.sin(frame.sectorSpanRadPerPiece),
    ];
    const roles = garment.boundaries.find(({ pieceId }) => pieceId === piece.pieceId);
    if (
      persisted.pieceId !== piece.pieceId ||
      !same(persisted.planarApexMm, piece.planarApexMm) ||
      !same(persisted.planarStartRayUnit2, startRay) ||
      persisted.planarAngularDirection !== -1 ||
      persisted.planarStartSeamId !== garment.leftSeamId ||
      persisted.waistSlantRadiusMm !== frame.waistSlantRadiusMm ||
      persisted.hemSlantRadiusMm !== frame.hemSlantRadiusMm ||
      persisted.sectorSpanRad !== frame.sectorSpanRadPerPiece ||
      !roles ||
      roles.waist.sourceCurveIds.length !== frame.waistSourceCurveCountPerPiece ||
      roles.hem.sourceCurveIds.length !== frame.hemSourceCurveCountPerPiece ||
      roles.leftSeam.sourceCurveIds.length !== 1 ||
      roles.rightSeam.sourceCurveIds.length !== 1
    )
      fail(
        'canonical-frame-incompatible',
        'Persisted annular parameters and exact role partitions do not qualify the existing canonical frame.',
      );
  });
}

/** Adapts a verified persisted intent; it performs no GET, write, inferred role authoring or placement admission. */
export async function buildPatternImportDxfProductSavedPlacementAuthoredInputV1(
  input: PatternImportDxfProductSavedPlacementAuthoredInputRequestV1,
): Promise<PatternImportDxfProductSavedPlacementAuthoredInputResultV1> {
  try {
    const placement = field(input, 'placementReadOwner');
    if (!isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(placement))
      fail(
        'verified-placement-owner-required',
        'A genuine verified placement V2 read owner is required.',
      );
    const candidate = field(input, 'composerOwner');
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(candidate);
    if (!projection)
      fail('composer-owner-unavailable', 'A live genuine Composer V2 owner is required.');
    const composer = candidate as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const readDisplay = currentDisplayReader(input);
    const display = readDisplay();
    requireCurrentBindings(placement, composer);
    requireCanonicalParameters(placement);
    const persisted = placement.placementAuthoring.semantics;
    const body = persisted.body;
    if (
      body.providerId !== display.modelId ||
      body.bodyId !== display.modelId ||
      body.providerRevision !== display.modelContentRevision ||
      body.bodyRevision !== display.modelContentRevision ||
      body.poseKind !== 'A' ||
      body.poseRevision !== display.posePresetId ||
      body.collisionLodId !== 'rendered-body-13380v-26756t'
    )
      fail(
        'display-body-binding-mismatch',
        'Persisted body identity does not match the actual displayed mannequin.',
      );
    const semantics = await buildDxfProductTwoPanelSkirtPlacementSemanticsV1({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
      origin: composer.snapshot.origin,
      expectedComposerCanonicalSha256: composer.snapshot.seal.canonicalSha256,
      composerOwner: composer,
      garment: persisted.garment,
      body: persisted.body,
      policy: persisted.policy,
    });
    if (!semantics.ok)
      fail(
        'persisted-semantics-blocked',
        `${semantics.blockers[0].code}: ${semantics.blockers[0].detail}`,
      );
    try {
      const validated = projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semantics.owner);
      const current = projectPatternImportDxfProductGarmentMeshComposerV2(composer);
      if (
        !validated ||
        !current ||
        current.composerCanonicalSha256 !== projection.composerCanonicalSha256 ||
        !same(display, readDisplay())
      )
        fail(
          'input-became-stale',
          'Current composer or displayed mannequin changed while validating persisted roles.',
        );
      requireCurrentBindings(placement, composer);
      return freezePlain({
        ok: true as const,
        authored: {
          semantics: {
            origin: validated.origin,
            garment: validated.garment,
            body: validated.body,
            policy: validated.policy,
          },
          displayBody: display,
          frame: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
        },
        bindings: {
          placementSidecarSha256: placement.seal.canonicalSha256,
          composerCanonicalSha256: current.composerCanonicalSha256,
        },
        claims: {
          verifiedPersistedPlacementConsumed: true as const,
          currentComposerBound: true as const,
          exactPersistedRolesValidated: true as const,
          explicitCanonicalParametersMatched: true as const,
          displayBodyIdentityBound: true as const,
          inferredRolesUsed: false as const,
          annularAcceptanceEvaluated: false as const,
          placementAuthority: false as const,
          runtimeAuthority: false as const,
        },
      });
    } finally {
      disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(semantics.owner);
    }
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      code: error instanceof AdapterFailure ? error.code : 'invalid-input',
      detail: error instanceof Error ? error.message : 'Persisted placement input failed closed.',
      authored: null,
    });
  }
}
