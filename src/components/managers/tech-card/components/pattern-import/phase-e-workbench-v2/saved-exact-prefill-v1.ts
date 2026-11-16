import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
  restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1,
  type PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import type { PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 } from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';

import { isPatternImportDxfPhaseESavedRowPreparedV1 } from './saved-row-preparation-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_EXACT_PREFILL_V1 =
  'pattern-import-dxf-phase-e-saved-exact-prefill/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_EXACT_PREFILL_CLAIMS_V1 = Object.freeze({
  genuineSavedPreparationRequired: true,
  clientDecodedCarrierAndSealRequired: true,
  serializedCarrierSealRecomputed: true,
  currentRowAssemblyCatalogAndProposalMatched: true,
  aggregatePlanSha256Origin: 'historical-sealed-carrier-binding',
  aggregateMaterialToleranceChoicesReconstructed: false,
  exactFourTopologySidesPrefilled: true,
  equalMappingAndUnitLengthRatioPrefilled: true,
  documentConfirmationPreserved: true,
  physicalSurfaceConfirmationPreserved: true,
  operationConfirmationPreserved: true,
  materialConfirmationsPreserved: true,
  toleranceConfirmationPreserved: true,
  edgeHintRangeOrSamplesUsedAsAuthority: false,
  nearestOrShapeRecoveryUsed: false,
  rawDxfAccepted: false,
  rawDxfRetained: false,
  liveBindingOwnerMinted: false,
  persistenceIntegrated: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PHASE_E_SAVED_EXACT_PREFILL_CLAIMS_V1,
  serializedCarrierSealRecomputed: false as const,
  currentRowAssemblyCatalogAndProposalMatched: false as const,
  exactFourTopologySidesPrefilled: false as const,
  equalMappingAndUnitLengthRatioPrefilled: false as const,
});

export type PatternImportDxfPhaseESavedExactPrefillBlockerV1 = Readonly<{
  code:
    | 'saved-preparation-unavailable'
    | 'serialized-exact-restore-blocked'
    | 'prefill-patch-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseESavedExactPrefillResultV1 =
  | Readonly<{
      ok: true;
      state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
      patch: PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_EXACT_PREFILL_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      state: null;
      patch: null;
      blockers: readonly [PatternImportDxfPhaseESavedExactPrefillBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

function blocked(
  code: PatternImportDxfPhaseESavedExactPrefillBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseESavedExactPrefillResultV1 {
  return Object.freeze({
    ok: false as const,
    state: null,
    patch: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      PatternImportDxfPhaseESavedExactPrefillBlockerV1,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

/** Applies only a previously verified exact-topology patch; it performs no recovery or inference. */
export function applyPatternImportDxfPhaseESavedExactPrefillPatchV1(
  state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  patch: PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1,
): PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 | null {
  if (patch.seams.length !== 2 || state.seams.length !== 2) return null;
  const seams = state.seams.map((seam, seamIndex) => {
    const exactSeam = patch.seams[seamIndex];
    if (exactSeam.seamId !== seam.seamId || exactSeam.sides.length !== 2) return null;
    const byIndex = new Map(exactSeam.sides.map((side) => [side.sideIndex, side] as const));
    if (byIndex.size !== 2 || !byIndex.has(0) || !byIndex.has(1)) return null;
    const sides = seam.sides.map((side, sideIndex) => {
      const exact = byIndex.get(sideIndex as 0 | 1);
      if (!exact) return null;
      return {
        ...side,
        contourId: exact.contourId,
        boundaryVertexIds: [...exact.boundaryVertexIds],
        direction: exact.direction,
        confirmed: true,
      };
    });
    if (sides.some((side) => side === null)) return null;
    return {
      ...seam,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      confirmed: true,
      sides: sides as unknown as typeof seam.sides,
    };
  });
  if (seams.some((seam) => seam === null)) return null;
  return deepFreeze({
    ...state,
    seams: seams as unknown as typeof state.seams,
  });
}

/**
 * Restores only exact topology already sealed in Composite V3. The aggregate-plan SHA is historical
 * binding evidence from that verified carrier; material, tolerance and other confirmations are not
 * reconstructed from a digest and remain exactly as they were in the fresh initial state.
 */
export async function restorePatternImportDxfPhaseESavedExactPrefillV1(
  candidate: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfPhaseESavedExactPrefillResultV1> {
  if (!isPatternImportDxfPhaseESavedRowPreparedV1(candidate))
    return blocked(
      'saved-preparation-unavailable',
      'A genuine current saved-row preparation is required for exact topology restore.',
    );
  const prepared = candidate;
  const carrier = prepared.exactTopology.carrier;
  const proposal = prepared.proposal;
  const restored = await restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1(
    {
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
      carrier,
      seal: prepared.exactTopology.seal,
      current: {
        row: prepared.row,
        serverAssemblyRevision: prepared.serverAssemblyRevision,
        assemblyTopologySha256: prepared.assemblyTopologySha256,
        selectedOperation: {
          sourceOperationNumber: proposal.operation.sourceOperationNumber,
          authoringOperationId: proposal.operation.authoringOperationId,
          localOperationOrder: proposal.operation.order,
          seamIds: [...proposal.operation.seamIds] as [string, string],
        },
        catalogCanonicalSha256: prepared.catalog.canonicalSha256,
        proposalFingerprint: proposal.deterministicFingerprint,
        // Historical sealed choice-plan binding only; no choices are reconstructed from this hash.
        phaseEAggregatePlanSha256: carrier.bindings.phaseEAggregatePlanSha256,
      },
      catalog: prepared.catalog,
      proposal,
    },
    options,
  );
  if (!restored.ok)
    return blocked(
      'serialized-exact-restore-blocked',
      `${restored.blockers[0].code}: ${restored.blockers[0].detail}`,
    );
  const state = applyPatternImportDxfPhaseESavedExactPrefillPatchV1(
    prepared.initialState,
    restored.patch,
  );
  if (!state)
    return blocked(
      'prefill-patch-mismatch',
      'The exact topology patch no longer matches the two-seam workbench state.',
    );
  return Object.freeze({
    ok: true as const,
    state,
    patch: restored.patch,
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_EXACT_PREFILL_CLAIMS_V1,
  });
}
