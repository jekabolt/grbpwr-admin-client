import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  createPatternImportDxfPhaseECalloutV1,
  deletePatternImportDxfPhaseECalloutV1,
  reanchorPatternImportDxfPhaseECalloutV1,
  updatePatternImportDxfPhaseECalloutTextV1,
  type PatternImportDxfPhaseECalloutV1,
} from './callout-session-v1';
import {
  buildPatternImportDxfPhaseEMeasurementV1,
  resolvePatternImportDxfPhaseEVertexV1,
  type PatternImportDxfPhaseEMeasurementKindV1,
  type PatternImportDxfPhaseEMeasurementV1,
  type PatternImportDxfPhaseEVertexAnchorV1,
} from './measurement-v1';
import {
  formatPatternImportDxfPhaseEMeasurementValueV1,
  type PatternImportDxfPhaseEMeasurementUnitV1,
} from './measurement-units-v1';
import type { PatternImportDxfPhaseEDraftCadSessionV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SESSION_V1 =
  'pattern-import-dxf-phase-e-draft-cad-topology-session/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SESSION_CLAIMS_V1 = Object.freeze({
  exactProjectionVertexAnchorsOnly: true,
  existingMeasurementOwnerReused: true,
  existingMeasurementUnitsOwnerReused: true,
  existingCalloutSessionOwnerReused: true,
  nearestOrSnappingRecoveryAllowed: false,
  sessionOnly: true,
  persistenceIntegrated: false,
  applyAuthorityCreated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftCadTopologyToolV1 =
  | 'measure-point'
  | 'measure-line'
  | 'measure-edge'
  | 'callout';

export type PatternImportDxfPhaseEDraftCadAnnotationTargetV1 = Readonly<{
  collection: 'measurement' | 'callout';
  id: string;
}>;

export type PatternImportDxfPhaseEDraftCadTopologySessionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SESSION_V1;
  sourceIdentity: string;
  activeTool: PatternImportDxfPhaseEDraftCadTopologyToolV1 | null;
  reanchorTarget: PatternImportDxfPhaseEDraftCadAnnotationTargetV1 | null;
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  pendingAnchors: readonly PatternImportDxfPhaseEVertexAnchorV1[];
  measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseECalloutV1[];
  sequence: number;
  blocker: string | null;
}>;

export function derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): string {
  return [
    PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SESSION_V1,
    session.source.revision,
    session.source.phaseD.sourceFileId,
    session.source.phaseD.sourceSha256,
    session.source.phaseD.selectedGeometrySha256,
    session.source.catalog.canonicalSha256,
    session.source.catalog.sizeSelectionCanonicalSha256,
    projection.sourceFileId,
    projection.expectedCatalogCanonicalSha256,
    projection.sizeSelectionCanonicalSha256,
  ]
    .map((value) => encodeURIComponent(String(value)))
    .join('|');
}

function freezeState(
  state: Omit<
    PatternImportDxfPhaseEDraftCadTopologySessionV1,
    'schemaVersion' | 'pendingAnchors' | 'measurements' | 'callouts'
  > &
    Pick<
      PatternImportDxfPhaseEDraftCadTopologySessionV1,
      'pendingAnchors' | 'measurements' | 'callouts'
    >,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return Object.freeze({
    ...state,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOPOLOGY_SESSION_V1,
    pendingAnchors: Object.freeze([...state.pendingAnchors]),
    measurements: Object.freeze([...state.measurements]),
    callouts: Object.freeze([...state.callouts]),
  });
}

export function createPatternImportDxfPhaseEDraftCadTopologySessionV1(
  sourceIdentity: string,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  if (!sourceIdentity)
    throw new TypeError('Draft topology session requires one explicit source identity.');
  return freezeState({
    sourceIdentity,
    activeTool: null,
    reanchorTarget: null,
    unit: 'mm',
    pendingAnchors: [],
    measurements: [],
    callouts: [],
    sequence: 0,
    blocker: null,
  });
}

export function reconcilePatternImportDxfPhaseEDraftCadTopologySourceV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  sourceIdentity: string,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return state.sourceIdentity === sourceIdentity
    ? state
    : createPatternImportDxfPhaseEDraftCadTopologySessionV1(sourceIdentity);
}

export function selectPatternImportDxfPhaseEDraftCadTopologyToolV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  tool: PatternImportDxfPhaseEDraftCadTopologyToolV1 | null,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return freezeState({
    ...state,
    activeTool: tool,
    reanchorTarget: null,
    pendingAnchors: [],
    blocker: null,
  });
}

export function setPatternImportDxfPhaseEDraftCadTopologyUnitV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  unit: PatternImportDxfPhaseEMeasurementUnitV1,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return freezeState({ ...state, unit, blocker: null });
}

export function startPatternImportDxfPhaseEDraftCadAnnotationReanchorV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  target: PatternImportDxfPhaseEDraftCadAnnotationTargetV1,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  const item =
    target.collection === 'callout'
      ? state.callouts.find(({ id }) => id === target.id)
      : state.measurements.find(({ id }) => id === target.id);
  const cleared = selectPatternImportDxfPhaseEDraftCadTopologyToolV1(state, null);
  if (!item)
    return freezeState({ ...cleared, blocker: 'The annotation is no longer in this draft.' });
  return freezeState({
    ...cleared,
    activeTool: 'kind' in item ? `measure-${item.kind}` : 'callout',
    reanchorTarget: Object.freeze({ ...target }),
  });
}

function reanchorAtVertex(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  target: PatternImportDxfPhaseEDraftCadAnnotationTargetV1,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  if (!resolvePatternImportDxfPhaseEVertexV1(projection, anchor))
    return freezeState({
      ...state,
      blocker: 'The replacement vertex is absent from the exact projection.',
    });
  if (target.collection === 'callout') {
    const result = reanchorPatternImportDxfPhaseECalloutV1(
      projection,
      state.callouts,
      target.id,
      anchor,
    );
    return result.ok
      ? freezeState({
          ...selectPatternImportDxfPhaseEDraftCadTopologyToolV1(state, null),
          callouts: result.callouts,
        })
      : freezeState({ ...state, blocker: result.blockers[0].detail });
  }
  const measurement = state.measurements.find(({ id }) => id === target.id);
  if (!measurement)
    return freezeState({ ...state, blocker: 'The measurement is no longer in this draft.' });
  const first = state.pendingAnchors[0];
  if (measurement.kind !== 'point' && !first)
    return freezeState({ ...state, pendingAnchors: [anchor], blocker: null });
  if (
    first &&
    (first.pieceId !== anchor.pieceId ||
      first.pieceLineKey !== anchor.pieceLineKey ||
      (first.contourId === anchor.contourId && first.vertexId === anchor.vertexId))
  )
    return freezeState({ ...state, blocker: 'Pick a different exact vertex on the same piece.' });
  const result = buildPatternImportDxfPhaseEMeasurementV1(
    projection,
    measurement.id,
    measurement.kind,
    first ? [first, anchor] : [anchor],
  );
  return result.ok
    ? freezeState({
        ...selectPatternImportDxfPhaseEDraftCadTopologyToolV1(state, null),
        measurements: state.measurements.map((item) =>
          item.id === measurement.id ? result.measurement : item,
        ),
      })
    : freezeState({ ...state, blocker: result.detail });
}

function measurementKind(
  tool: Exclude<PatternImportDxfPhaseEDraftCadTopologyToolV1, 'callout'>,
): PatternImportDxfPhaseEMeasurementKindV1 {
  if (tool === 'measure-point') return 'point';
  if (tool === 'measure-line') return 'line';
  return 'edge';
}

/** Exact anchor reducer. Coordinates and edge adjacency remain owned by measurement-v1. */
export function selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  if (!state.activeTool)
    return freezeState({
      ...state,
      blocker: 'Choose one topology tool before selecting a vertex.',
    });
  if (state.reanchorTarget)
    return reanchorAtVertex(projection, state, state.reanchorTarget, anchor);
  if (state.activeTool === 'callout') {
    const sequence = state.sequence + 1;
    const result = createPatternImportDxfPhaseECalloutV1(projection, state.callouts, {
      id: `draft-callout-${sequence}`,
      anchor,
      text: `Callout ${sequence}`,
    });
    return result.ok
      ? freezeState({
          ...state,
          callouts: result.callouts,
          sequence,
          pendingAnchors: [],
          blocker: null,
        })
      : freezeState({ ...state, blocker: result.blockers[0].detail });
  }

  const kind = measurementKind(state.activeTool);
  const required = kind === 'point' ? 1 : 2;
  const anchors = required === 1 ? [anchor] : [...state.pendingAnchors, anchor].slice(-2);
  if (anchors.length < required)
    return freezeState({ ...state, pendingAnchors: anchors, blocker: null });
  const sequence = state.sequence + 1;
  const result = buildPatternImportDxfPhaseEMeasurementV1(
    projection,
    `draft-measurement-${sequence}`,
    kind,
    anchors,
  );
  return result.ok
    ? freezeState({
        ...state,
        measurements: [...state.measurements, result.measurement],
        sequence,
        pendingAnchors: [],
        blocker: null,
      })
    : freezeState({
        ...state,
        sequence,
        pendingAnchors: [anchor],
        blocker: result.detail,
      });
}

export function deletePatternImportDxfPhaseEDraftCadMeasurementV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  id: string,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return freezeState({
    ...state,
    measurements: state.measurements.filter((measurement) => measurement.id !== id),
    blocker: null,
  });
}

export function updatePatternImportDxfPhaseEDraftCadCalloutV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  id: string,
  text: string,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  const result = updatePatternImportDxfPhaseECalloutTextV1(projection, state.callouts, id, text);
  return result.ok
    ? freezeState({ ...state, callouts: result.callouts, blocker: null })
    : freezeState({ ...state, blocker: result.blockers[0].detail });
}

export function deletePatternImportDxfPhaseEDraftCadCalloutV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  id: string,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  const result = deletePatternImportDxfPhaseECalloutV1(projection, state.callouts, id);
  return result.ok
    ? freezeState({ ...state, callouts: result.callouts, blocker: null })
    : freezeState({ ...state, blocker: result.blockers[0].detail });
}

export function formatPatternImportDxfPhaseEDraftCadMeasurementV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  measurement: PatternImportDxfPhaseEMeasurementV1,
  unit: PatternImportDxfPhaseEMeasurementUnitV1,
): string {
  if (measurement.kind === 'point') {
    const resolved = measurement.anchors[0]
      ? resolvePatternImportDxfPhaseEVertexV1(projection, measurement.anchors[0])
      : null;
    if (!resolved) return measurement.label;
    const x = formatPatternImportDxfPhaseEMeasurementValueV1(resolved.pointMm.x, unit);
    const y = formatPatternImportDxfPhaseEMeasurementValueV1(resolved.pointMm.y, unit);
    return `x ${x.formatted} · y ${y.formatted}`;
  }
  return measurement.valueMm === null
    ? measurement.label
    : formatPatternImportDxfPhaseEMeasurementValueV1(measurement.valueMm, unit).formatted;
}
