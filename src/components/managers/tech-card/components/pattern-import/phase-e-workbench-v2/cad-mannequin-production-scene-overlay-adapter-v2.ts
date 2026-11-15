import type { PatternImportDxfProductPhaseEExactTopologySideBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';

import type { TopstitchBomLine } from '../../topstitch-lines';
import type {
  PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from './cad-mannequin-dxf-staging-v1';
import {
  buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2,
  type PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2,
  type PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1,
  type PatternImportDxfPhaseECadMannequinSceneOverlayV1,
} from './cad-mannequin-scene-overlay-adapter-v1';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import { resolvePatternImportDxfProductExactNSeamWorkbenchHostV2 } from './exact-n-seam-workbench-host-v2';
import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardConnectionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import type { PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 } from './golden-card-full-exact-capture-aggregator-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_ADAPTER_V2 =
  'pattern-import-dxf-phase-e-cad-mannequin-production-scene-overlay-adapter/2' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_CLAIMS_V2 =
  Object.freeze({
    exactNSessionProductionFeedReused: true,
    verifiedRestoreCurrentBindingsReused: true,
    opaqueSelectionOwnerReverified: true,
    snapshotOperationAndExactSidesReverified: true,
    allScopeStagingReused: true,
    currentStitchVisualAndBomReused: true,
    fullExactCaptureGraphRequired: false,
    fullExactCaptureGraphFabricated: false,
    rowOrHashInvented: false,
    geometryOrClothOwnerCreated: false,
    missingExactAuthorityFailsClosed: true,
    missingThreadAuthorityHidesThreadLayer: true,
    productionMountAndPickerWired: true,
  } as const);

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

export type PatternImportDxfPhaseECadMannequinProductionSceneAuthorityV2 = Readonly<{
  row: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2['current']['row'];
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  catalogCanonicalSha256: string;
  phaseEAggregatePlanSha256: string;
  operationNumber: number;
  authoringOperationId: string;
  seamIds: readonly string[];
}>;

export type PatternImportDxfPhaseECadMannequinProductionSceneOverlayBlockerCodeV2 =
  | 'session-invalid'
  | 'current-binding-invalid'
  | 'production-feed-unavailable'
  | 'exact-operation-projection-ambiguous'
  | 'exact-operation-projection-invalid'
  | 'snapshot-binding-mismatch'
  | 'scene-overlay-blocked';

export type PatternImportDxfPhaseECadMannequinProductionSceneOverlayBlockerV2 = Readonly<{
  code: PatternImportDxfPhaseECadMannequinProductionSceneOverlayBlockerCodeV2;
  detail: string;
  causeCode?: PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1['code'];
}>;

export type PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2 = Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  importGeneration: number;
  staging: Readonly<{
    techCardId: number;
    importGeneration: number;
    sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  }>;
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  stitchVisuals: readonly Readonly<{
    operationNumber: number;
    visual: PatternImportDxfPhaseEStitchVisualV1;
  }>[];
  bomItems: readonly TopstitchBomLine[];
}>;

export type PatternImportDxfPhaseECadMannequinProductionSceneOverlayResultV2 =
  | Readonly<{
      ok: true;
      status: 'available';
      overlay: PatternImportDxfPhaseECadMannequinSceneOverlayV1;
      authority: PatternImportDxfPhaseECadMannequinProductionSceneAuthorityV2;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      overlay: null;
      authority: null;
      blocker: PatternImportDxfPhaseECadMannequinProductionSceneOverlayBlockerV2;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_CLAIMS_V2;
    }>;

const exactInteger = (value: unknown, minimum: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= minimum;
const stableRef = (value: unknown): value is string =>
  typeof value === 'string' && STABLE_REF.test(value);
const sameOrdered = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const unique = (values: readonly string[]): boolean => values.length === new Set(values).size;

function blocked(
  code: PatternImportDxfPhaseECadMannequinProductionSceneOverlayBlockerCodeV2,
  detail: string,
  causeCode?: PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1['code'],
): PatternImportDxfPhaseECadMannequinProductionSceneOverlayResultV2 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    overlay: null,
    authority: null,
    blocker: Object.freeze({
      code,
      detail: detail.slice(0, 2_048),
      ...(causeCode && { causeCode }),
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_CLAIMS_V2,
  });
}

function currentBindingIssue(
  current: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2['current'],
): string | null {
  const row = current?.row;
  const operation = current?.selectedOperation;
  if (
    !row ||
    !exactInteger(row.techCardId, 1) ||
    !stableRef(row.scopeKey) ||
    !stableRef(row.patternLineKey) ||
    !exactInteger(row.revision, 0) ||
    !exactInteger(row.cardLockVersion, 0) ||
    typeof row.url !== 'string' ||
    !row.url.trim() ||
    !exactInteger(row.sizeBytes, 0) ||
    !SHA256.test(row.sha256)
  )
    return 'The restored saved-DXF row identity is incomplete or invalid.';
  if (
    typeof current.serverAssemblyRevision !== 'string' ||
    !current.serverAssemblyRevision.trim() ||
    !SHA256.test(current.assemblyTopologySha256) ||
    !SHA256.test(current.catalogCanonicalSha256) ||
    !SHA256.test(current.phaseEAggregatePlanSha256)
  )
    return 'The restored Assembly, topology, catalog or aggregate binding is invalid.';
  if (
    !operation ||
    !exactInteger(operation.sourceOperationNumber, 1) ||
    !stableRef(operation.authoringOperationId) ||
    !exactInteger(operation.localOperationOrder, 0) ||
    !Array.isArray(operation.seamIds) ||
    operation.seamIds.length === 0 ||
    !unique(operation.seamIds) ||
    operation.seamIds.some((seamId) => !stableRef(seamId))
  )
    return 'The restored selected operation or its ordered seam identities are invalid.';
  return null;
}

function sameSide(
  left: Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contourId: string;
    boundaryVertexIds: readonly [string, string];
    direction: 'forward' | 'reverse';
  }>,
  right: Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contourId: string;
    boundaryVertexIds: readonly [string, string];
    direction: 'forward' | 'reverse';
  }>,
): boolean {
  return (
    left.pieceId === right.pieceId &&
    left.pieceLineKey === right.pieceLineKey &&
    left.contourId === right.contourId &&
    sameOrdered(left.boundaryVertexIds, right.boundaryVertexIds) &&
    left.direction === right.direction
  );
}

function exactConnection(
  connection: PatternImportDxfPhaseEGoldenCardConnectionV1,
  current: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2['current'],
): PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 {
  const side = (sideIndex: 0 | 1): PatternImportDxfProductPhaseEExactTopologySideBindingV1 => ({
    seamId: connection.connectionRef,
    sideIndex,
    ...connection.sides[sideIndex],
  });
  const sides: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1['sides'] = Object.freeze([
    side(0),
    side(1),
  ]);
  return Object.freeze({
    connectionRef: connection.connectionRef,
    operationNumber: current.selectedOperation.sourceOperationNumber,
    authoringOperationId: current.selectedOperation.authoringOperationId,
    row: current.row,
    serverTopologySha256: current.assemblyTopologySha256,
    catalogCanonicalSha256: current.catalogCanonicalSha256,
    sides,
  });
}

function currentThreadVisuals(
  operationNumber: number,
  expected: PatternImportDxfPhaseEStitchVisualV1 | null,
  stitchVisuals: PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2['stitchVisuals'],
): PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2['stitchVisuals'] {
  const matches = stitchVisuals.filter(
    (candidate) => candidate.operationNumber === operationNumber,
  );
  if (
    matches.length !== 1 ||
    !expected ||
    JSON.stringify(matches[0].visual) !== JSON.stringify(expected)
  )
    return [];
  return matches;
}

/**
 * Strict production ingress from the verified Exact-N session. It borrows the row/hash tuple from
 * `session.current` and exact sides from the matching production snapshot; it never mints a
 * FullExactCaptureGraph or substitutes rendered/UI coordinates for exact topology.
 */
export function buildPatternImportDxfPhaseECadMannequinProductionSceneOverlayV2(
  request: PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2,
): PatternImportDxfPhaseECadMannequinProductionSceneOverlayResultV2 {
  let resolved: ReturnType<typeof resolvePatternImportDxfProductExactNSeamWorkbenchHostV2>;
  try {
    resolved = resolvePatternImportDxfProductExactNSeamWorkbenchHostV2({
      selectionOwner: request?.session?.selectionOwner,
      current: request?.session?.current,
      activeSeamIndex: 0,
    });
  } catch {
    return blocked('session-invalid', 'The Exact-N production session could not be reopened.');
  }
  if (!resolved.ok)
    return blocked(
      'session-invalid',
      `The Exact-N selection owner is unavailable or stale: ${resolved.blockers[0].code}.`,
    );

  const current = request.session.current;
  const invalidCurrent = currentBindingIssue(current);
  if (invalidCurrent) return blocked('current-binding-invalid', invalidCurrent);
  if (!exactInteger(request.importGeneration, 1))
    return blocked('current-binding-invalid', 'A positive current import generation is required.');

  const feed = request.session.productionFeed;
  if (!feed)
    return blocked(
      'production-feed-unavailable',
      'The Exact-N session has no caller-owned production snapshot feed.',
    );
  if (
    feed.techCardId !== current.row.techCardId ||
    !stableRef(feed.cardRef) ||
    !Array.isArray(feed.exactOperationProjections)
  )
    return blocked(
      'snapshot-binding-mismatch',
      'The production snapshot feed belongs to another or invalid card identity.',
    );
  const operationNumber = current.selectedOperation.sourceOperationNumber;
  const operationNumbers = feed.exactOperationProjections.map(
    ({ operationNumber: value }) => value,
  );
  const projections = feed.exactOperationProjections.filter(
    ({ operationNumber: value }) => value === operationNumber,
  );
  if (!unique(operationNumbers.map(String)) || projections.length !== 1)
    return blocked(
      'exact-operation-projection-ambiguous',
      'The selected operation must resolve to exactly one production snapshot projection.',
    );
  const snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 =
    projections[0]!.snapshot;
  if (!verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(snapshot, snapshot).ok)
    return blocked(
      'exact-operation-projection-invalid',
      'The selected production snapshot does not pass its exact reconstruction self-check.',
    );
  if (
    snapshot.cardRef !== feed.cardRef ||
    snapshot.catalog.canonicalSha256 !== current.catalogCanonicalSha256 ||
    snapshot.operations.length !== 1
  )
    return blocked(
      'snapshot-binding-mismatch',
      'The production snapshot does not match the current card or catalog binding.',
    );
  const operation = snapshot.operations[0];
  if (
    operation.operationRef !== current.selectedOperation.authoringOperationId ||
    operation.assembly.id !== current.selectedOperation.authoringOperationId ||
    operation.card.authoringOperationId !== current.selectedOperation.authoringOperationId ||
    operation.card.number !== operationNumber ||
    operation.assembly.order !== current.selectedOperation.localOperationOrder ||
    !sameOrdered(operation.assembly.seamIds, current.selectedOperation.seamIds) ||
    !sameOrdered(operation.card.seamKeys, current.selectedOperation.seamIds) ||
    !sameOrdered(
      snapshot.connections.map(({ connectionRef }) => connectionRef),
      current.selectedOperation.seamIds,
    ) ||
    snapshot.connections.some(
      ({ operationRef }) => operationRef !== current.selectedOperation.authoringOperationId,
    )
  )
    return blocked(
      'snapshot-binding-mismatch',
      'The production snapshot operation, authoring identity or ordered seams are stale.',
    );
  if (
    resolved.model.choices.seams.length !== snapshot.connections.length ||
    resolved.model.choices.seams.some((seam, seamIndex) => {
      const connection = snapshot.connections[seamIndex];
      return (
        !connection ||
        seam.seamId !== connection.connectionRef ||
        seam.mapping !== connection.mapping ||
        seam.lengthRatio !== connection.lengthRatio ||
        !sameSide(seam.sides[0], connection.sides[0]) ||
        !sameSide(seam.sides[1], connection.sides[1])
      );
    })
  )
    return blocked(
      'snapshot-binding-mismatch',
      'The production snapshot exact sides differ from the verified selection owner.',
    );

  const exactConnections = Object.freeze(
    snapshot.connections.map((connection) => exactConnection(connection, current)),
  );
  const narrowAuthority: PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2 = Object.freeze({
    techCardId: current.row.techCardId,
    cardRef: feed.cardRef,
    cardLockVersion: current.row.cardLockVersion,
    serverAssemblyRevision: current.serverAssemblyRevision,
    operations: Object.freeze([
      Object.freeze({
        operationNumber,
        seamKeys: Object.freeze([...current.selectedOperation.seamIds]),
        exactConnections,
      }),
    ]),
    connections: exactConnections,
  });
  const scene = buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2({
    current: {
      techCardId: current.row.techCardId,
      cardRef: feed.cardRef,
      cardLockVersion: current.row.cardLockVersion,
      serverAssemblyRevision: current.serverAssemblyRevision,
      importGeneration: request.importGeneration,
    },
    staging: request.staging,
    authority: narrowAuthority,
    activeOperationNumber: operationNumber,
    selection: request.selection,
    stitchVisuals: currentThreadVisuals(operationNumber, operation.stitch, request.stitchVisuals),
    bomItems: request.bomItems,
  });
  if (!scene.ok) return blocked('scene-overlay-blocked', scene.blocker.detail, scene.blocker.code);

  const authority: PatternImportDxfPhaseECadMannequinProductionSceneAuthorityV2 = Object.freeze({
    row: current.row,
    serverAssemblyRevision: current.serverAssemblyRevision,
    assemblyTopologySha256: current.assemblyTopologySha256,
    catalogCanonicalSha256: current.catalogCanonicalSha256,
    phaseEAggregatePlanSha256: current.phaseEAggregatePlanSha256,
    operationNumber,
    authoringOperationId: current.selectedOperation.authoringOperationId,
    seamIds: Object.freeze([...current.selectedOperation.seamIds]),
  });
  return Object.freeze({
    ok: true as const,
    status: 'available' as const,
    overlay: scene.overlay,
    authority,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_CLAIMS_V2,
  });
}
