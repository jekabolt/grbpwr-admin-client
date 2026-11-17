import type { common_TechCard } from 'api/proto-http/admin';
import {
  buildPatternImportDxfProductPhaseEAssemblyChoicesV1,
  type PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  type PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { fromWire, type StoredSeam } from 'lib/seams';

import {
  buildPatternImportDxfPhaseEAssemblyOrderSourceV1,
  preparePatternImportDxfPhaseEAssemblyOrderEntryV1,
  resolvePatternImportDxfPhaseEAssemblyOrderSessionV1,
  runPatternImportDxfPhaseEAssemblyOrderSerializedPrepareV1,
} from '../phase-e-workbench/assembly-order-entry';
import {
  readPatternImportDxfPhaseECardSessionV1,
  type PatternImportDxfPhaseECardSessionV1,
} from '../phase-e-workbench-card-session-v1';
import type {
  PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  PatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackResultV1,
} from './cad-table-zero-connect-existing-linked-operation-rebind-v1';
import { resolveSavedFullAssemblyDiagnosticProfileV1 } from './saved-full-assembly-diagnostic-profile-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1,
  type PatternImportDxfPhaseELinkedN1DurableRequestV1,
  type PatternImportDxfPhaseEZeroConnectDurableResultV1,
} from './zero-connect-durable-composite-v4';

export type PatternImportDxfPhaseELinkedN1ProfileChoiceV1 = Readonly<{
  id: string;
  revision: string;
}>;

type Readback = Extract<
  PatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackResultV1,
  { ok: true }
>;

type Blocker = Readonly<{ code: string; detail: string }>;
type Result = Readonly<{ ok: true }> | Readonly<{ ok: false; blocker: Blocker }>;
type PreparedContext = Readonly<{
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1;
  profile: PatternImportDxfPhaseELinkedN1ProfileChoiceV1;
  direction: 'same' | 'reversed';
  readback: Readback;
  freshCard: common_TechCard;
  isCurrent: () => boolean;
  signal: AbortSignal;
  persist: (
    request: PatternImportDxfPhaseELinkedN1DurableRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1>;
}>;

type RetainedAttachment = Readonly<{
  session: PatternImportDxfPhaseECardSessionV1;
  direction: 'same' | 'reversed';
  profileId: string;
  profileRevision: string;
  request: PatternImportDxfPhaseELinkedN1DurableRequestV1;
}>;

// Permit a durable retry only for the same in-memory exact gesture and verified V1 attachment.
const retainedAttachments = new WeakMap<
  PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  RetainedAttachment
>();

function blocked(code: string, detail: string): Result {
  return { ok: false, blocker: { code, detail } };
}

/**
 * Re-open native authoring against the new seam-write lock. The old gesture provides the exact
 * IDs and ordered span only; the genuine registered import provides the unchanged Apply receipt.
 */
export async function finalizePatternImportDxfPhaseEExistingLinkedN1V1(
  context: PreparedContext,
): Promise<Result> {
  const { pending, profile, direction, readback, freshCard, signal } = context;
  const currentSession = readPatternImportDxfPhaseECardSessionV1(pending.target.techCardId);
  const isCurrent = () =>
    !signal.aborted &&
    context.isCurrent() &&
    readPatternImportDxfPhaseECardSessionV1(pending.target.techCardId) === currentSession;
  const superseded = () =>
    blocked(
      'existing-linked-n1-finalize-superseded',
      'The current card or exact connection changed while saving the pattern metadata.',
    );
  if (!isCurrent()) return superseded();
  if (!currentSession)
    return blocked(
      'existing-linked-n1-import-required',
      'Apply the current DXF through Patterns before saving the first exact connection.',
    );
  const diagnostic = resolveSavedFullAssemblyDiagnosticProfileV1(profile.id, profile.revision);
  if (!diagnostic)
    return blocked(
      'existing-linked-n1-profile-unavailable',
      'Choose a current diagnostic preview material.',
    );
  const selectedOperationNumber = pending.target.operationNumber;
  const selectedSeamKey = pending.target.seamKey;
  if (
    pending.target.orderedRowKeys.length !== 1 ||
    readback.operationNumber !== selectedOperationNumber ||
    readback.seamKey !== selectedSeamKey ||
    freshCard.id !== pending.target.techCardId ||
    freshCard.lockVersion !== readback.cardLockVersion ||
    readback.cardLockVersion <= pending.target.capturedCardLockVersion
  )
    return blocked(
      'existing-linked-n1-finalize-readback-mismatch',
      'The selected operation did not return a current saved single-seam connection.',
    );

  const retained = retainedAttachments.get(pending);
  if (retained) {
    if (
      retained.session !== currentSession ||
      retained.direction !== direction ||
      retained.request.row.cardLockVersion !== readback.cardLockVersion ||
      retained.profileId !== profile.id ||
      retained.profileRevision !== profile.revision
    )
      return blocked(
        'existing-linked-n1-finalize-stale',
        'Saved pattern metadata belongs to a different card version or preview material.',
      );
    const durable = await context.persist(retained.request, signal);
    return durable.ok ? { ok: true } : { ok: false, blocker: durable.blocker };
  }

  const operations = freshCard.techCard?.operations ?? [];
  const seams = (freshCard.seams ?? [])
    .map(fromWire)
    .filter((row): row is StoredSeam => row !== null);
  const selectedIndex = operations.findIndex(
    ({ operationNumber }) => operationNumber === selectedOperationNumber,
  );
  const source = buildPatternImportDxfPhaseEAssemblyOrderSourceV1(operations, seams, selectedIndex);
  if (!source || source.selectedSeamKey !== selectedSeamKey)
    return blocked(
      'existing-linked-n1-finalize-operation-moved',
      'The selected saved operation no longer owns the exact connection.',
    );
  const resolved = resolvePatternImportDxfPhaseEAssemblyOrderSessionV1(source, currentSession);
  if (!resolved.ok) return { ok: false, blocker: resolved.blocker };
  const freshSession = resolved.freshSession;
  const selection = preparePatternImportDxfPhaseEAssemblyOrderEntryV1(source, freshSession);
  if (!selection.ok) return { ok: false, blocker: selection.blocker };
  const original = pending.request.authoringAuthority.row;
  const document = await freshSession.loadDocumentEvidence(freshSession.scopeKey);
  if (!isCurrent()) return superseded();
  if (!document.ok) return { ok: false, blocker: document.blocker };
  const evidence = document.evidence;
  if (
    freshSession.sizeToken !== pending.sourceSizeToken ||
    freshSession.scopeKey !== original.scopeKey ||
    evidence.techCardId !== original.techCardId ||
    evidence.scopeKey !== original.scopeKey ||
    evidence.patternLineKey !== original.patternLineKey ||
    evidence.dxfSha256 !== original.sha256 ||
    evidence.cardLockVersion !== readback.cardLockVersion
  )
    return blocked(
      'existing-linked-n1-finalize-source-moved',
      'The post-save pattern document differs from the exact gesture or seam-write lock.',
    );

  const prepared = await runPatternImportDxfPhaseEAssemblyOrderSerializedPrepareV1(freshSession, {
    ...selection.request,
    sourceSurface: 'explicit-native-drawn-sewing',
    documentEvidence: evidence,
  });
  if (!isCurrent()) return superseded();
  if (!prepared.ok) return { ok: false, blocker: prepared.blockers[0] };
  const { catalog, proposal } = prepared;
  const gestureCatalog = pending.request.catalog;
  const gesture = pending.request.candidate.connection;
  if (
    gesture.mapping !== 'equal' ||
    gesture.lengthRatio !== 1 ||
    catalog.canonicalSha256 !== gestureCatalog.canonicalSha256 ||
    catalog.sizeSelectionCanonicalSha256 !== gestureCatalog.sizeSelectionCanonicalSha256 ||
    catalog.sourceFileId !== gestureCatalog.sourceFileId ||
    proposal.seam.id !== selectedSeamKey ||
    proposal.seam.sourceDirection !== direction ||
    proposal.sides.some(
      (side, index) =>
        side.pieceId !== gesture.sides[index]?.pieceId ||
        side.pieceLineKey !== gesture.sides[index]?.pieceLineKey,
    )
  )
    return blocked(
      'existing-linked-n1-finalize-catalog-moved',
      'The refreshed native drawing or selected edges differ from the saved connection.',
    );

  const choiceForSide = (index: 0 | 1) => {
    const side = gesture.sides[index];
    const piece = catalog.pieces.find(({ pieceId }) => pieceId === side.pieceId);
    const contour = piece?.contours.find(({ contourId }) => contourId === side.contourId);
    if (!contour || !contour.closed || contour.role !== 'sewing-boundary') return null;
    // Pair the stored side A samples with side B in the selected direction. The semantic and
    // physical readers always encode the span in increasing contour order. Direction controls
    // sample order within that span.
    const [start, end] =
      index === 1 && direction === 'reversed'
        ? [side.boundaryVertexIds[1], side.boundaryVertexIds[0]]
        : side.boundaryVertexIds;
    const count = contour.boundaryVertices.length;
    const from = contour.boundaryVertices.findIndex(({ vertexId }) => vertexId === start);
    const to = contour.boundaryVertices.findIndex(({ vertexId }) => vertexId === end);
    if (count < 3 || from < 0 || to < 0) return null;
    const forward = (from + 1) % count === to;
    if (!forward && (to + 1) % count !== from) return null;
    return {
      pieceId: side.pieceId,
      contourId: side.contourId,
      startBoundaryVertexId: forward ? start : end,
      endBoundaryVertexId: forward ? end : start,
      direction: forward ? ('forward' as const) : ('reverse' as const),
      confirmed: true,
    };
  };
  const sideA = choiceForSide(0);
  const sideB = choiceForSide(1);
  if (!sideA || !sideB)
    return blocked(
      'existing-linked-n1-finalize-side-invalid',
      'The saved connection must retain one exact adjacent native sewing edge on each piece.',
    );
  const material: PatternImportDxfProductPhaseEMaterialRevisionOptionV1 = {
    id: diagnostic.material.id,
    label: diagnostic.material.label,
    materialRevision: diagnostic.material.revision,
  };
  const state: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1 = {
    ...prepared.initialState,
    documentRevisionConfirmed: true,
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    physicalSurfaceConfirmed: true,
    operationStage: 0,
    operationConfirmed: true,
    sides: [sideA, sideB],
    materialSelections: [
      { pieceId: sideA.pieceId, optionId: material.id, confirmed: true },
      { pieceId: sideB.pieceId, optionId: material.id, confirmed: true },
    ],
    tolerance: {
      endpointMm: diagnostic.exactSeamToleranceMm,
      fullLengthMm: diagnostic.exactSeamToleranceMm,
      fullLengthRelative: 0,
      confirmed: true,
    },
  };
  const choices = buildPatternImportDxfProductPhaseEAssemblyChoicesV1(catalog, proposal, state, [
    material,
  ]);
  if (!choices.ok) return { ok: false, blocker: choices.blockers[0] };

  const submitted = await freshSession.submitChoices(catalog, choices.choices, {
    savedRowRevision: original.revision,
    isCurrent,
  });
  if (!isCurrent()) return superseded();
  if (
    submitted.authorityStatus !== 'accepted' ||
    submitted.attachmentStatus !== 'verified' ||
    submitted.verifiedAttachment?.cardLockVersion !== readback.cardLockVersion
  )
    return {
      ok: false,
      blocker: submitted.blockers[0] ?? {
        code: 'existing-linked-n1-semantic-unverified',
        detail: 'The first pattern metadata attachment was not verified at the seam-write lock.',
      },
    };

  const [authoredA, authoredB] = choices.choices.seam.sides;
  const request: PatternImportDxfPhaseELinkedN1DurableRequestV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1,
    row: { ...original, cardLockVersion: readback.cardLockVersion },
    selectedOperationNumber,
    seamKey: selectedSeamKey,
    catalog,
    sides: [
      {
        pieceId: authoredA.pieceId,
        pieceLineKey: proposal.sides[0].pieceLineKey,
        contourId: authoredA.contourId,
        boundaryVertexIds: authoredA.anchors,
        direction: authoredA.direction,
      },
      {
        pieceId: authoredB.pieceId,
        pieceLineKey: proposal.sides[1].pieceLineKey,
        contourId: authoredB.contourId,
        boundaryVertexIds: authoredB.anchors,
        direction: authoredB.direction,
      },
    ],
    verifiedSemanticSha256: submitted.verifiedAttachment.sidecarSha256,
  };
  retainedAttachments.set(pending, {
    session: currentSession,
    direction,
    profileId: profile.id,
    profileRevision: profile.revision,
    request,
  });
  const durable = await context.persist(request, signal);
  return durable.ok ? { ok: true } : { ok: false, blocker: durable.blocker };
}
