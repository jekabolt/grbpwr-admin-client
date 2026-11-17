import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { PatternImportDxfPhaseECadTableConnectToolPhaseV1 } from './cad-table-connect-tool-control-v1';
import type { PatternImportDxfPhaseECadTableConnectEdgeSegmentV1 } from './cad-table-connect-edge-segments-v1';
import type { PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import {
  isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_V1,
  type PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1,
  type PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
} from './cad-table-zero-connect-authoring-handoff-v1';
import {
  buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  createPatternImportDxfPhaseECadTableZeroConnectSessionV1,
  selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  type PatternImportDxfPhaseECadTableZeroConnectSessionV1,
} from './cad-table-zero-connect-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-connect-controller/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_CLAIMS_V1 = Object.freeze(
  {
    exactCatalogAndProjectionOnly: true,
    proposalRequired: false,
    selectedOperationRequired: false,
    selectedSeamRequired: false,
    existingOperationsFieldWriterOnly: true,
    independentOrderZeroDraftPerGesture: true,
    authoringOperationIdInvented: false,
    createsFormOwner: false,
    writesPersistence: false,
    productionReady: false,
  } as const,
);

export type PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_V1;
  sequence: number;
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1 | null;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1 | null;
  handoffResult: PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1 | null;
  error: string | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableZeroConnectControllerAuthorityV1 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  authoringAuthority?: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 | null;
  authoringAuthorityRefresh?: PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null;
}>;

const controllerSessionAuthorities = new WeakMap<
  object,
  PatternImportDxfPhaseECadTableZeroConnectControllerAuthorityV1
>();
const controllerHandoffRequests = new WeakMap<
  object,
  Readonly<{
    authority: PatternImportDxfPhaseECadTableZeroConnectControllerAuthorityV1;
    session: PatternImportDxfPhaseECadTableZeroConnectSessionV1;
    candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  }>
>();

export function isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1(
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
): boolean {
  const state = request && controllerHandoffRequests.get(request);
  const authority = state?.authority;
  return Boolean(
    state &&
      authority &&
      request.session === state.session &&
      request.candidate === state.candidate &&
      request.catalog === authority.catalog &&
      request.projection === authority.projection &&
      request.authoringAuthority === authority.authoringAuthority &&
      request.authoringAuthorityRefresh === authority.authoringAuthorityRefresh &&
      controllerSessionAuthorities.get(request.session) === authority &&
      request.session.status === 'ready' &&
      request.session.source === request.candidate.source &&
      request.session.operation === request.candidate.operation &&
      request.session.sides[0] === request.candidate.connection.sides[0] &&
      request.session.sides[1] === request.candidate.connection.sides[1] &&
      isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1(
        request.authoringAuthorityRefresh,
        {
          authority: request.authoringAuthority,
          catalog: request.catalog,
          projection: request.projection,
        },
      ),
  );
}

function state(
  patch: Omit<
    PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
    'schemaVersion' | 'claims'
  >,
): PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_V1,
    ...patch,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CONTROLLER_CLAIMS_V1,
  });
}

export function createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(): PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 {
  return state({
    sequence: 0,
    session: null,
    candidate: null,
    handoffResult: null,
    error: null,
  });
}

/** Each completed gesture receives a distinct session identity but remains an unsaved order-0 row. */
export function createPatternImportDxfPhaseECadTableZeroConnectOperationDraftV1(
  catalogCanonicalSha256: string,
  sequence: number,
) {
  return Object.freeze({
    sessionOperationId: `connect:${catalogCanonicalSha256.slice(0, 12)}:${sequence}`,
    order: 0,
    stage: 0,
    dependsOn: Object.freeze([]) as readonly string[],
    operationNumber: 0 as const,
    authoringOperationId: null,
  });
}

export function cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
): PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 {
  return state({
    sequence: current.sequence,
    session: null,
    candidate: null,
    handoffResult: null,
    error: null,
  });
}

export function startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectControllerAuthorityV1,
): PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 {
  const sequence = current.sequence + 1;
  const created = createPatternImportDxfPhaseECadTableZeroConnectSessionV1(
    authority,
    createPatternImportDxfPhaseECadTableZeroConnectOperationDraftV1(
      authority.catalog.canonicalSha256,
      sequence,
    ),
  );
  if (!created.ok)
    return state({
      sequence,
      session: null,
      candidate: null,
      handoffResult: null,
      error: created.blocker.detail,
    });
  controllerSessionAuthorities.set(created.session, authority);
  return state({
    sequence,
    session: created.session,
    candidate: null,
    handoffResult: null,
    error: null,
  });
}

function refusedHandoff(
  owner: Extract<
    PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
    { status: 'unavailable' }
  >,
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
): PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1 {
  return Object.freeze({
    ok: false as const,
    inserted: 0 as const,
    historyKey: null,
    sessionRevision: session.revision,
    blocker: owner.blocker,
  });
}

function invalidAuthorityHandoff(
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1,
): PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1 {
  return Object.freeze({
    ok: false as const,
    inserted: 0 as const,
    historyKey: null,
    sessionRevision: session.revision,
    blocker: Object.freeze({
      code: 'zero-connect-authoring-write-refused' as const,
      detail: 'The exact saved-DXF authoring capability is absent or stale.',
    }),
  });
}

/**
 * Advances one exact edge selection and performs the existing OperationsField handoff only after
 * both sides form a current candidate. No operation, seam proposal or form owner is synthesized.
 */
export function selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  authority: PatternImportDxfPhaseECadTableZeroConnectControllerAuthorityV1,
  segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
  direction: 'forward' | 'reverse',
  handoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
): PatternImportDxfPhaseECadTableZeroConnectControllerStateV1 {
  if (!current.session || current.session.status === 'ready') return current;
  if (controllerSessionAuthorities.get(current.session) !== authority)
    return state({
      ...current,
      error: 'The zero-connect session moved to a different exact authoring authority.',
    });
  const selected = selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1(
    current.session,
    authority,
    {
      pieceId: segment.pieceId,
      contourId: segment.contourId,
      boundaryVertexIds: segment.boundaryVertexIds,
      direction,
    },
  );
  if (!selected.ok)
    return state({
      ...current,
      error: selected.blocker.detail,
    });
  controllerSessionAuthorities.set(selected.session, authority);
  if (selected.session.status !== 'ready')
    return state({
      sequence: current.sequence,
      session: selected.session,
      candidate: null,
      handoffResult: null,
      error: null,
    });

  const candidate = buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1(
    selected.session,
    authority,
  );
  if (!candidate.ok)
    return state({
      sequence: current.sequence,
      session: selected.session,
      candidate: null,
      handoffResult: null,
      error: candidate.blocker.detail,
    });
  let handoffResult: PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1 | null = null;
  if (handoff?.status === 'available') {
    if (
      !authority.authoringAuthority ||
      !isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1(
        authority.authoringAuthorityRefresh,
        {
          authority: authority.authoringAuthority,
          catalog: authority.catalog,
          projection: authority.projection,
        },
      )
    )
      handoffResult = invalidAuthorityHandoff(selected.session);
    else {
      const request = Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_V1,
        candidate: candidate.candidate,
        session: selected.session,
        catalog: authority.catalog,
        projection: authority.projection,
        authoringAuthority: authority.authoringAuthority,
        authoringAuthorityRefresh: authority.authoringAuthorityRefresh,
      }) satisfies PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
      controllerHandoffRequests.set(
        request,
        Object.freeze({
          authority,
          session: selected.session,
          candidate: candidate.candidate,
        }),
      );
      handoffResult = handoff.ingest(request);
    }
  } else if (handoff) handoffResult = refusedHandoff(handoff, selected.session);
  return state({
    sequence: current.sequence,
    session: selected.session,
    candidate: candidate.candidate,
    handoffResult,
    error: null,
  });
}

export function patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
): PatternImportDxfPhaseECadTableConnectToolPhaseV1 {
  if (current.session?.status === 'select-side-a') return 'select-first-edge';
  if (current.session?.status === 'select-side-b') return 'select-second-edge';
  if (current.session?.status === 'ready') return 'review';
  return 'idle';
}

export function patternImportDxfPhaseECadTableZeroConnectSelectedSideV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
): 0 | 1 | null {
  const index =
    current.session?.sides.findIndex(
      (side) =>
        side?.pieceId === segment.pieceId &&
        side.contourId === segment.contourId &&
        side.boundaryVertexIds[0] === segment.boundaryVertexIds[0] &&
        side.boundaryVertexIds[1] === segment.boundaryVertexIds[1],
    ) ?? -1;
  return index === 0 || index === 1 ? index : null;
}

export function patternImportDxfPhaseECadTableZeroConnectControllerStatusV1(
  current: PatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
): string | null {
  if (!current.session) return current.error;
  if (current.error) return current.error;
  if (current.candidate) {
    const pair = `${current.candidate.connection.sides[0].pieceLineKey} ↔ ${current.candidate.connection.sides[1].pieceLineKey}`;
    if (current.handoffResult?.ok)
      return current.handoffResult.inserted === 0
        ? `${pair} · choose seam direction in the current operation`
        : `${pair} · added to Assembly Order as draft`;
    if (current.handoffResult) return current.handoffResult.blocker.detail;
    return `${pair} · draft ready; Add to Assembly Order awaits card identity owner`;
  }
  return current.session.status === 'select-side-a'
    ? 'choose the first exact edge'
    : 'choose the matching edge · Shift selects reverse direction';
}
