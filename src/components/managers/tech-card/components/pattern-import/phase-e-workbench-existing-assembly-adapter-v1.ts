import type { PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type {
  AssemblyContext,
  AssemblySeamExactContext,
  AssemblySeamSummaryContext,
} from 'lib/pattern-import/types';

import { KIND_BY_WORK_TOKEN } from '../operation-kinds';

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_EXISTING_ASSEMBLY_ADAPTER_V1 =
  'pattern-import-dxf-phase-e-workbench-existing-assembly-adapter/1' as const;

export type PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1 =
  | Readonly<{
      ok: true;
      selectedOperationNumber: number;
      existingAssembly: PatternImportDxfProductPhaseEExistingAssemblyProposalInputV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      selectedOperationNumber: null;
      existingAssembly: null;
      blockers: readonly [
        Readonly<{
          code:
            | 'selected-operation-number-invalid'
            | 'selected-operation-number-ambiguous'
            | 'selected-operation-missing'
            | 'selected-operation-seam-unsupported'
            | 'selected-operation-kind-unsupported'
            | 'selected-seam-not-exact'
            | 'authoring-operation-id-invalid';
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_EXISTING_ASSEMBLY_ADAPTER_CONTRACT_V1 =
  Object.freeze({
    existingAssemblyOrderIsSoleTopologySource: true,
    exactStoredSeamFieldsProjected: true,
    createsSecondAssemblyOrder: false,
    geometryInferred: false,
    nearestOrSnappingUsed: false,
    operationNumberUsedAsAuthoringIdentity: false,
    seamDerivedOperationIdentityOwnedByPureWorkbench: true,
    operationKindDerivedFromAuthoritativeWorkToken: true,
    unknownOrNonStitchWorkTokenAccepted: false,
    arbitraryWorkTextPromotedToStitch: false,
    missingAuthoringOperationIdBlocksPreview: false,
    missingAuthoringOperationIdBlocksSubmit: false,
    proposalBecomesAuthorityWithoutExplicitVertexChoices: false,
  } as const);

/**
 * Bounded beta classifier. The IDs are the canonical, specific sewing kinds from the existing
 * operation-kind owner; the token itself is resolved through its one authoritative token map.
 * Generic `machine_other`, edge/attachment, cycle, pressing and finishing work fail closed.
 */
const PHASE_E_STRUCTURAL_STITCH_KIND_IDS = new Set([
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
]);

export function patternImportDxfPhaseEKindForWorkTokenV1(work: string): 'stitch' | null {
  if (!work || work !== work.trim()) return null;
  const kind = KIND_BY_WORK_TOKEN.get(work);
  return kind && PHASE_E_STRUCTURAL_STITCH_KIND_IDS.has(kind.id) ? 'stitch' : null;
}

function blocked(
  code: Extract<
    PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1 {
  return Object.freeze({
    ok: false as const,
    selectedOperationNumber: null,
    existingAssembly: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as Extract<
      PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1,
      { ok: false }
    >['blockers'],
  });
}

function isExactSeam(
  seam: AssemblySeamSummaryContext | AssemblySeamExactContext,
): seam is AssemblySeamExactContext {
  return Object.prototype.hasOwnProperty.call(seam, 'seamKey');
}

/**
 * Copies the selected operation context and exact StoredSeam fields into the workbench proposal
 * boundary. Ranges, directions and diagnostic edge evidence may prefill highlights, but this
 * adapter never turns them into Phase-D contour/source-vertex authority.
 */
export function adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1(
  assembly: AssemblyContext,
  selectedOperationNumber: number,
  selectedSeamKey: string,
  authoringOperationId: string | null = null,
): PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1 {
  if (!assembly || !Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber <= 0)
    return blocked(
      'selected-operation-number-invalid',
      'The selected Assembly Order operation must expose one explicit positive saved operation number.',
    );
  const selectedOperations = assembly.ops.filter(
    ({ number }) => number === selectedOperationNumber,
  );
  if (selectedOperations.length > 1)
    return blocked(
      'selected-operation-number-ambiguous',
      'The selected saved operation number must identify exactly one Assembly Order row.',
    );
  if (selectedOperations.length !== 1)
    return blocked(
      'selected-operation-missing',
      'The selected Assembly Order operation must still resolve exactly once.',
    );
  if (
    authoringOperationId !== null &&
    !/^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(authoringOperationId)
  )
    return blocked(
      'authoring-operation-id-invalid',
      'The optional authoring operation ID must be one explicit stable persisted identity; otherwise the pure V1 workbench derives it from the sole seam.',
    );
  const selectedOperation = selectedOperations[0];
  if (
    !selectedSeamKey ||
    selectedOperation.seamKeys?.length !== 1 ||
    selectedOperation.seamKeys[0] !== selectedSeamKey
  )
    return blocked(
      'selected-operation-seam-unsupported',
      'V1 requires the selected operation to own exactly the selected existing seam.',
    );
  const selectedOperationKind = patternImportDxfPhaseEKindForWorkTokenV1(selectedOperation.work);
  if (!selectedOperationKind)
    return blocked(
      'selected-operation-kind-unsupported',
      'The selected operation must use one recognized structural stitch work token; free text, unknown work and non-stitch work are not promoted.',
    );

  const exactSeams = assembly.seams.filter(isExactSeam);
  if (exactSeams.filter(({ seamKey }) => seamKey === selectedSeamKey).length !== 1)
    return blocked(
      'selected-seam-not-exact',
      'The selected seam must expose one exact StoredSeam row; a legacy summary is insufficient.',
    );

  const operations = assembly.ops.map((operation) =>
    Object.freeze({
      authoringOperationId:
        operation.number === selectedOperationNumber ? authoringOperationId : null,
      number: operation.number,
      work: operation.work,
      phaseEKind:
        operation.number === selectedOperationNumber
          ? selectedOperationKind
          : patternImportDxfPhaseEKindForWorkTokenV1(operation.work),
      inputKeys: Object.freeze([...(operation.inputKeys ?? [])]),
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      seamKeys: Object.freeze([...(operation.seamKeys ?? [])]),
    }),
  );
  const seams = exactSeams.map((seam) => {
    const copySide = (side: AssemblySeamExactContext['sideA']) =>
      Object.freeze(
        side.map((anchor) =>
          Object.freeze({
            pieceLineKey: anchor.pieceLineKey,
            edgeHint: anchor.edgeHint,
            range: Object.freeze([anchor.range[0], anchor.range[1]]) as readonly [number, number],
            lenMm: anchor.lenMm,
            contourSig: anchor.contourSig,
          }),
        ),
      );
    return Object.freeze({
      seamKey: seam.seamKey,
      confirmed: seam.confirmed,
      stale: seam.stale,
      kind: seam.kind,
      direction: seam.direction,
      anchoredSize: seam.anchoredSize,
      sideA: copySide(seam.sideA),
      sideB: copySide(seam.sideB),
    });
  });

  return Object.freeze({
    ok: true as const,
    selectedOperationNumber,
    existingAssembly: Object.freeze({
      operations: Object.freeze(operations),
      seams: Object.freeze(seams),
      selectedSeamKey,
    }),
    blockers: Object.freeze([]) as readonly [],
  });
}
