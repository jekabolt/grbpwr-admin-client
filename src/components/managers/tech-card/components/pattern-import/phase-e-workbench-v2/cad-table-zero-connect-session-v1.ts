import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  createPatternImportDxfPhaseEDraftOperationFromConnectionV1,
  type PatternImportDxfPhaseEDraftOperationBlockerV1,
  type PatternImportDxfPhaseEDraftOperationConnectionIntentV1,
  type PatternImportDxfPhaseEDraftOperationConnectionSideV1,
  type PatternImportDxfPhaseEDraftOperationReferencesV1,
  type PatternImportDxfPhaseEDraftOperationV1,
} from './draft-operation-from-connection-v1';
import {
  buildPatternImportDxfPhaseEFromScratchOperationIdentityPolicyV1,
  PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
  type PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1,
  type PatternImportDxfPhaseEFromScratchOperationIdentityResultV1,
} from './from-scratch-operation-identity-policy-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-connect-session/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-connect-candidate/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1 = Object.freeze({
  sessionOnly: true,
  preexistingSeamProposalRequired: false,
  exactCatalogAndProjectionRequired: true,
  callerChoosesBothOrderedEdges: true,
  callerChoosesDirectionsAndMapping: true,
  pieceLineKeysDerivedFromCatalog: true,
  coordinatesRemainProjectionOwned: true,
  existingConnectionDraftPipelineReused: true,
  existingFromScratchIdentityPolicyReused: true,
  operationNumberRemainsZero: true,
  authoringOperationIdRemainsNull: true,
  createsAssemblyAuthority: false,
  createsCoordinateAuthority: false,
  createsPersistedIdentity: false,
  createsFormOwner: false,
  writesFormFields: false,
  writesPersistence: false,
  productionReady: false,
} as const);

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;

type AssemblyProjectionContour =
  PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number]['contours'][number];

export type PatternImportDxfPhaseECadTableZeroConnectAuthorityV1 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}>;

export type PatternImportDxfPhaseECadTableZeroConnectEdgeSelectionV1 = Readonly<{
  pieceId: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
}>;

export type PatternImportDxfPhaseECadTableZeroConnectSessionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1;
  status: 'select-side-a' | 'select-side-b' | 'ready';
  revision: number;
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    sourceFileId: string;
    scopeKey: string;
    sizeToken: string;
  }>;
  operation: PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1;
  mapping: 'equal' | 'eased' | 'gathered';
  lengthRatio: number;
  sides: readonly [
    PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
    PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableZeroConnectCandidateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1;
  status: 'session-only-operation-candidate';
  source: PatternImportDxfPhaseECadTableZeroConnectSessionV1['source'];
  operation: PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1;
  connection: PatternImportDxfPhaseEDraftOperationConnectionIntentV1;
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableZeroConnectBlockerV1 = Readonly<{
  code:
    | 'invalid-authority'
    | 'invalid-session'
    | 'source-stale'
    | 'side-a-required'
    | 'piece-not-exact'
    | 'contour-not-exact'
    | 'vertex-not-exact'
    | 'edge-not-adjacent'
    | 'piece-pair-invalid'
    | 'mapping-invalid'
    | 'connection-incomplete';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 =
  | Readonly<{
      ok: true;
      session: PatternImportDxfPhaseECadTableZeroConnectSessionV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      session: PatternImportDxfPhaseECadTableZeroConnectSessionV1 | null;
      blocker: PatternImportDxfPhaseECadTableZeroConnectBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableZeroConnectCandidateResultV1 =
  | Readonly<{
      ok: true;
      candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      candidate: null;
      blocker: PatternImportDxfPhaseECadTableZeroConnectBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableZeroConnectDraftResultV1 =
  | Readonly<{
      ok: true;
      draft: PatternImportDxfPhaseEDraftOperationV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      draft: PatternImportDxfPhaseEDraftOperationV1 | null;
      blocker:
        | PatternImportDxfPhaseECadTableZeroConnectBlockerV1
        | PatternImportDxfPhaseEDraftOperationBlockerV1;
    }>;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocker(
  code: PatternImportDxfPhaseECadTableZeroConnectBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadTableZeroConnectBlockerV1 {
  return Object.freeze({ code, detail });
}

function blockedSession(
  code: PatternImportDxfPhaseECadTableZeroConnectBlockerV1['code'],
  detail: string,
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1 | null = null,
): PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 {
  return Object.freeze({ ok: false as const, session, blocker: blocker(code, detail) });
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function operationIdentityValid(
  operation: PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1,
): boolean {
  return (
    !!operation &&
    STABLE_ID.test(operation.sessionOperationId ?? '') &&
    Number.isSafeInteger(operation.order) &&
    operation.order >= 0 &&
    Number.isSafeInteger(operation.stage) &&
    operation.stage >= 0 &&
    operation.operationNumber === 0 &&
    operation.authoringOperationId === null &&
    Array.isArray(operation.dependsOn) &&
    new Set(operation.dependsOn).size === operation.dependsOn.length &&
    operation.dependsOn.every((dependency) => STABLE_ID.test(dependency))
  );
}

function authorityValid(authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1): boolean {
  if (!authority) return false;
  const { catalog, projection } = authority;
  if (
    !catalog ||
    !projection ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !SHA256.test(catalog.sizeSelectionCanonicalSha256 ?? '') ||
    !STABLE_ID.test(catalog.sourceFileId ?? '') ||
    !STABLE_ID.test(catalog.scopeKey ?? '') ||
    !STABLE_ID.test(catalog.sizeToken ?? '') ||
    projection.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    projection.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
    projection.sourceFileId !== catalog.sourceFileId ||
    projection.sizeToken !== catalog.sizeToken ||
    projection.geometryPlacementApplied !== false ||
    projection.joinMode !== 'catalog-ordinal-to-phase-d-point' ||
    !Array.isArray(catalog.pieces) ||
    !Array.isArray(projection.pieces) ||
    catalog.pieces.length < 2 ||
    catalog.pieces.length !== projection.pieces.length
  )
    return false;

  const pieceKeys = new Set<string>();
  for (const catalogPiece of catalog.pieces) {
    if (
      !STABLE_ID.test(catalogPiece.pieceId ?? '') ||
      !STABLE_ID.test(catalogPiece.pieceLineKey ?? '') ||
      !Array.isArray(catalogPiece.contours) ||
      !catalogPiece.contours.length
    )
      return false;
    const pieceKey = `${catalogPiece.pieceId}\u0000${catalogPiece.pieceLineKey}`;
    if (pieceKeys.has(pieceKey)) return false;
    pieceKeys.add(pieceKey);
    const projectedPieces = projection.pieces.filter(
      ({ pieceId, pieceLineKey }) =>
        pieceId === catalogPiece.pieceId && pieceLineKey === catalogPiece.pieceLineKey,
    );
    if (projectedPieces.length !== 1) return false;
    const projectedPiece = projectedPieces[0]!;
    if (catalogPiece.contours.length !== projectedPiece.contours.length) return false;
    for (const catalogContour of catalogPiece.contours) {
      const projectedContours = projectedPiece.contours.filter(
        (projectedContour: AssemblyProjectionContour) =>
          projectedContour.contourId === catalogContour.contourId,
      );
      if (projectedContours.length !== 1) return false;
      const projectedContour = projectedContours[0]!;
      if (
        projectedContour.role !== catalogContour.role ||
        projectedContour.closed !== catalogContour.closed ||
        projectedContour.vertices.length !== catalogContour.boundaryVertices.length ||
        projectedContour.vertices.length < 2
      )
        return false;
      for (let index = 0; index < catalogContour.boundaryVertices.length; index += 1) {
        const catalogVertex = catalogContour.boundaryVertices[index]!;
        const projectedVertex = projectedContour.vertices[index]!;
        if (
          catalogVertex.ordinal !== index ||
          projectedVertex.ordinal !== index ||
          catalogVertex.vertexId !== projectedVertex.vertexId ||
          catalogVertex.normalizedArc !== projectedVertex.normalizedArc ||
          !STABLE_ID.test(catalogVertex.vertexId ?? '') ||
          !finite(projectedVertex.pointMm?.x) ||
          !finite(projectedVertex.pointMm?.y)
        )
          return false;
      }
    }
  }
  return true;
}

function sourceMatches(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
): boolean {
  return (
    session.source.catalogCanonicalSha256 === authority.catalog.canonicalSha256 &&
    session.source.sizeSelectionCanonicalSha256 ===
      authority.catalog.sizeSelectionCanonicalSha256 &&
    session.source.sourceFileId === authority.catalog.sourceFileId &&
    session.source.scopeKey === authority.catalog.scopeKey &&
    session.source.sizeToken === authority.catalog.sizeToken
  );
}

function exactSide(
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  selection: PatternImportDxfPhaseECadTableZeroConnectEdgeSelectionV1,
):
  | Readonly<{ ok: true; side: PatternImportDxfPhaseEDraftOperationConnectionSideV1 }>
  | Readonly<{ ok: false; blocker: PatternImportDxfPhaseECadTableZeroConnectBlockerV1 }> {
  const pieces = authority.catalog.pieces.filter(({ pieceId }) => pieceId === selection.pieceId);
  if (pieces.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: blocker(
        'piece-not-exact',
        'The selected piece is not unique in the current catalog.',
      ),
    });
  const piece = pieces[0]!;
  const contours = piece.contours.filter(({ contourId }) => contourId === selection.contourId);
  if (contours.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: blocker(
        'contour-not-exact',
        'The selected contour is not unique on the current catalog piece.',
      ),
    });
  const contour = contours[0]!;
  if (
    !Array.isArray(selection.boundaryVertexIds) ||
    selection.boundaryVertexIds.length !== 2 ||
    selection.boundaryVertexIds[0] === selection.boundaryVertexIds[1]
  )
    return Object.freeze({
      ok: false as const,
      blocker: blocker('vertex-not-exact', 'An edge requires two distinct ordered vertex IDs.'),
    });
  const indexes = selection.boundaryVertexIds.map((vertexId) =>
    contour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  if (indexes.some((index) => index < 0))
    return Object.freeze({
      ok: false as const,
      blocker: blocker(
        'vertex-not-exact',
        'The selected edge contains a vertex outside the current exact contour.',
      ),
    });
  const delta = Math.abs(indexes[0]! - indexes[1]!);
  if (
    delta !== 1 &&
    !(
      contour.closed &&
      contour.boundaryVertices.length > 2 &&
      delta === contour.boundaryVertices.length - 1
    )
  )
    return Object.freeze({
      ok: false as const,
      blocker: blocker(
        'edge-not-adjacent',
        'The selected ordered vertices do not define one exact adjacent boundary edge.',
      ),
    });
  if (selection.direction !== 'forward' && selection.direction !== 'reverse')
    return Object.freeze({
      ok: false as const,
      blocker: blocker('vertex-not-exact', 'Choose an explicit forward or reverse direction.'),
    });
  return Object.freeze({
    ok: true as const,
    side: Object.freeze({
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      contourId: contour.contourId,
      boundaryVertexIds: Object.freeze([
        selection.boundaryVertexIds[0],
        selection.boundaryVertexIds[1],
      ]) as readonly [string, string],
      direction: selection.direction,
    }),
  });
}

function sessionShapeValid(session: PatternImportDxfPhaseECadTableZeroConnectSessionV1): boolean {
  return (
    !!session &&
    session.schemaVersion === PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1 &&
    Number.isSafeInteger(session.revision) &&
    session.revision >= 0 &&
    ['select-side-a', 'select-side-b', 'ready'].includes(session.status) &&
    operationIdentityValid(session.operation) &&
    ['equal', 'eased', 'gathered'].includes(session.mapping) &&
    finite(session.lengthRatio) &&
    session.lengthRatio > 0 &&
    (session.mapping !== 'equal' || session.lengthRatio === 1) &&
    Array.isArray(session.sides) &&
    session.sides.length === 2 &&
    session.claims === PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1
  );
}

function statusOf(
  sides: PatternImportDxfPhaseECadTableZeroConnectSessionV1['sides'],
): PatternImportDxfPhaseECadTableZeroConnectSessionV1['status'] {
  if (!sides[0]) return 'select-side-a';
  if (!sides[1]) return 'select-side-b';
  return 'ready';
}

function validateCurrent(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
): PatternImportDxfPhaseECadTableZeroConnectBlockerV1 | null {
  if (!sessionShapeValid(session))
    return blocker('invalid-session', 'The zero-connect session is invalid.');
  if (!authorityValid(authority))
    return blocker(
      'invalid-authority',
      'Zero-connect requires one exact matching authoring catalog and Phase-D projection.',
    );
  if (!sourceMatches(session, authority))
    return blocker('source-stale', 'The exact DXF source changed after this connection began.');
  for (const side of session.sides) {
    if (!side) continue;
    const exact = exactSide(authority, {
      pieceId: side.pieceId,
      contourId: side.contourId,
      boundaryVertexIds: side.boundaryVertexIds,
      direction: side.direction,
    });
    if (!exact.ok || exact.side.pieceLineKey !== side.pieceLineKey)
      return blocker(
        'invalid-session',
        'A selected connection edge no longer belongs to the exact current catalog.',
      );
  }
  if (session.status !== statusOf(session.sides))
    return blocker('invalid-session', 'The zero-connect phase does not match its selected sides.');
  if (session.sides[0] && session.sides[1] && session.sides[0].pieceId === session.sides[1].pieceId)
    return blocker('piece-pair-invalid', 'A connection must join two distinct exact pieces.');
  return null;
}

export function createPatternImportDxfPhaseECadTableZeroConnectSessionV1(
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  operation: PatternImportDxfPhaseEFromScratchOperationIdentityDraftV1,
): PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 {
  if (!operationIdentityValid(operation))
    return blockedSession(
      'invalid-session',
      'Zero-connect requires a session operation with operationNumber 0 and no authoring ID.',
    );
  if (!authorityValid(authority))
    return blockedSession(
      'invalid-authority',
      'Zero-connect requires one exact matching authoring catalog and Phase-D projection.',
    );
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_V1,
      status: 'select-side-a' as const,
      revision: 0,
      source: {
        catalogCanonicalSha256: authority.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: authority.catalog.sizeSelectionCanonicalSha256,
        sourceFileId: authority.catalog.sourceFileId,
        scopeKey: authority.catalog.scopeKey,
        sizeToken: authority.catalog.sizeToken,
      },
      operation: structuredClone(operation),
      mapping: 'equal' as const,
      lengthRatio: 1,
      sides: [null, null] as const,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
    }),
    blocker: null,
  });
}

export function selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  selection: PatternImportDxfPhaseECadTableZeroConnectEdgeSelectionV1,
): PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 {
  const issue = validateCurrent(session, authority);
  if (issue) return Object.freeze({ ok: false as const, session, blocker: issue });
  const selected = exactSide(authority, selection);
  if (!selected.ok)
    return Object.freeze({ ok: false as const, session, blocker: selected.blocker });
  const sideIndex = session.sides[0] ? 1 : 0;
  if (sideIndex === 1 && session.sides[0]?.pieceId === selected.side.pieceId)
    return blockedSession(
      'piece-pair-invalid',
      'A connection must join two distinct exact piece identities.',
      session,
    );
  const sides = Object.freeze(
    (sideIndex === 0 ? [selected.side, null] : [session.sides[0], selected.side]) as readonly [
      PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
      PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
    ],
  );
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      ...session,
      revision: session.revision + 1,
      status: statusOf(sides),
      sides,
    }),
    blocker: null,
  });
}

export function clearPatternImportDxfPhaseECadTableZeroConnectSideV1(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  sideIndex: 0 | 1,
): PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 {
  const issue = validateCurrent(session, authority);
  if (issue) return Object.freeze({ ok: false as const, session, blocker: issue });
  if (sideIndex === 1 && !session.sides[0])
    return blockedSession('side-a-required', 'Choose side A before editing side B.', session);
  const sides = Object.freeze(
    (sideIndex === 0 ? [null, null] : [session.sides[0], null]) as readonly [
      PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
      PatternImportDxfPhaseEDraftOperationConnectionSideV1 | null,
    ],
  );
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      ...session,
      revision: session.revision + 1,
      status: statusOf(sides),
      sides,
    }),
    blocker: null,
  });
}

export function setPatternImportDxfPhaseECadTableZeroConnectMappingV1(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  mapping: PatternImportDxfPhaseECadTableZeroConnectSessionV1['mapping'],
  lengthRatio: number,
): PatternImportDxfPhaseECadTableZeroConnectSessionResultV1 {
  const issue = validateCurrent(session, authority);
  if (issue) return Object.freeze({ ok: false as const, session, blocker: issue });
  if (
    !['equal', 'eased', 'gathered'].includes(mapping) ||
    !finite(lengthRatio) ||
    lengthRatio <= 0 ||
    (mapping === 'equal' && lengthRatio !== 1)
  )
    return blockedSession(
      'mapping-invalid',
      'Choose equal ratio 1 or an explicit positive eased/gathered ratio.',
      session,
    );
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      ...session,
      revision: session.revision + 1,
      mapping,
      lengthRatio,
    }),
    blocker: null,
  });
}

export function buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
): PatternImportDxfPhaseECadTableZeroConnectCandidateResultV1 {
  const issue = validateCurrent(session, authority);
  if (issue) return Object.freeze({ ok: false as const, candidate: null, blocker: issue });
  if (session.status !== 'ready' || !session.sides[0] || !session.sides[1])
    return Object.freeze({
      ok: false as const,
      candidate: null,
      blocker: blocker(
        'connection-incomplete',
        'Choose two exact piece edges before creating a connection draft.',
      ),
    });
  const sides = Object.freeze([session.sides[0], session.sides[1]] as const);
  return Object.freeze({
    ok: true as const,
    candidate: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
      status: 'session-only-operation-candidate' as const,
      source: session.source,
      operation: session.operation,
      connection: {
        intentId: session.operation.sessionOperationId,
        mapping: session.mapping,
        lengthRatio: session.lengthRatio,
        sides,
      },
      apply: {
        eligible: false as const,
        boundary: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
      },
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
    }),
    blocker: null,
  });
}

export function buildPatternImportDxfPhaseECadTableZeroConnectIdentityPlanV1(
  sessions: readonly PatternImportDxfPhaseECadTableZeroConnectSessionV1[],
  existingOperationCount: number,
): PatternImportDxfPhaseEFromScratchOperationIdentityResultV1 {
  return buildPatternImportDxfPhaseEFromScratchOperationIdentityPolicyV1({
    drafts: sessions.map(({ operation }) => operation),
    existingOperationCount,
  });
}

/**
 * Compatibility adapter for the existing connection-draft pipeline. The table may author both
 * edges from zero, but a caller-owned existing Assembly Order row is still required by that older
 * boundary. A genuinely new row uses `build...IdentityPlanV1` and remains honestly Apply-blocked.
 */
export function createPatternImportDxfPhaseECadTableZeroConnectDraftOperationV1(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  input: Readonly<{
    draftOperationId: string;
    stage: number | null;
    references: PatternImportDxfPhaseEDraftOperationReferencesV1;
  }>,
): PatternImportDxfPhaseECadTableZeroConnectDraftResultV1 {
  const candidate = buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1(session, authority);
  if (!candidate.ok)
    return Object.freeze({ ok: false as const, draft: null, blocker: candidate.blocker });
  return createPatternImportDxfPhaseEDraftOperationFromConnectionV1({
    catalog: authority.catalog,
    draftOperationId: input.draftOperationId,
    stage: input.stage,
    connection: candidate.candidate.connection,
    references: input.references,
  });
}
