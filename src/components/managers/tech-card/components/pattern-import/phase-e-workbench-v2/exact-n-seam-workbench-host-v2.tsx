import type { ReactNode } from 'react';
import { Button, Pill, Text } from 'ui';

import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_OWNER_V2,
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2,
  readPatternImportDxfProductExactNSeamSelectedChoicesV3,
  readPatternImportDxfProductExactNSeamSelectedUiStateV2,
  type PatternImportDxfProductExactNSeamUiSelectionOwnerV2,
  type PatternImportDxfProductExactNSeamUiStateV2,
} from './exact-n-seam-atomic-ui-selection-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROPOSAL_CHOICES_V3,
  type PatternImportDxfProductExactNSeamProposalChoicesV3,
} from './exact-n-seam-saved-card-projection-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_V2 =
  'pattern-import-dxf-product-exact-n-seam-workbench-host/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_CLAIMS_V2 = Object.freeze({
  genuineAtomicSelectionOwnerRequired: true,
  freshCurrentBindingsReverified: true,
  oneOrGreaterThanTwoSeamsRendered: true,
  exactTwoSeamsRemainOnV3V1: true,
  oneControlledActiveSeamPointer: true,
  allSidesReadFromOneOpaqueOwner: true,
  geometryCopiedOrOwned: false,
  operationCopiedOrOwned: false,
  selectionAppliedPartially: false,
  secondAuthorityCreated: false,
  persistencePerformed: false,
  networkPerformed: false,
  exactTwoWorkbenchReplaced: false,
  fullEditableArbitraryNWorkbenchAvailable: false,
  productionHostBoundaryReady: true,
} as const);

type UiState = PatternImportDxfProductExactNSeamUiStateV2;
type Bindings = UiState['bindings'];
type Choices = PatternImportDxfProductExactNSeamProposalChoicesV3;

/** Fresh production tuple that must still match the opaque atomic selection owner at render time. */
export type PatternImportDxfProductExactNSeamWorkbenchCurrentBindingsV2 = Bindings;

export type PatternImportDxfProductExactNSeamWorkbenchHostBlockerCodeV2 =
  | 'selection-owner-required'
  | 'v1-two-seam-path-required'
  | 'current-binding-mismatch'
  | 'owner-state-mismatch'
  | 'active-seam-unavailable';

export type PatternImportDxfProductExactNSeamWorkbenchHostBlockerV2 = Readonly<{
  code: PatternImportDxfProductExactNSeamWorkbenchHostBlockerCodeV2;
  detail: string;
}>;

export type PatternImportDxfProductExactNSeamWorkbenchHostModelV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_V2;
  status: 'verified-atomic-selection';
  seamCount: number;
  activeSeamIndex: number;
  state: UiState;
  choices: Choices;
}>;

export type PatternImportDxfProductExactNSeamWorkbenchHostResultV2 =
  | Readonly<{
      ok: true;
      model: PatternImportDxfProductExactNSeamWorkbenchHostModelV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      model: null;
      blockers: readonly [PatternImportDxfProductExactNSeamWorkbenchHostBlockerV2];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_CLAIMS_V2;
    }>;

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRow(left: Bindings['row'], right: Bindings['row']): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function sameOperation(
  left: Bindings['selectedOperation'],
  right: Bindings['selectedOperation'],
): boolean {
  return (
    left.sourceOperationNumber === right.sourceOperationNumber &&
    left.authoringOperationId === right.authoringOperationId &&
    left.localOperationOrder === right.localOperationOrder &&
    sameStrings(left.seamIds, right.seamIds)
  );
}

function sameBindings(left: Bindings, right: Bindings): boolean {
  return (
    sameRow(left.row, right.row) &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256 &&
    left.catalogCanonicalSha256 === right.catalogCanonicalSha256 &&
    left.phaseEAggregatePlanSha256 === right.phaseEAggregatePlanSha256 &&
    sameOperation(left.selectedOperation, right.selectedOperation)
  );
}

function selectedStateMatchesChoices(state: UiState, choices: Choices): boolean {
  if (
    state.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2 ||
    state.status !== 'current-exact-n-seam-workbench-state' ||
    choices.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROPOSAL_CHOICES_V3 ||
    choices.status !== 'verified-exact-topology-choices' ||
    choices.expectedCatalogCanonicalSha256 !== state.bindings.catalogCanonicalSha256 ||
    choices.phaseEAggregatePlanSha256 !== state.bindings.phaseEAggregatePlanSha256 ||
    !sameOperation(choices.operation, state.bindings.selectedOperation) ||
    state.seams.length !== choices.seams.length ||
    !sameStrings(
      state.seams.map(({ seamId }) => seamId),
      state.bindings.selectedOperation.seamIds,
    )
  )
    return false;
  return state.seams.every((seam, seamIndex) => {
    const choice = choices.seams[seamIndex];
    return (
      choice?.seamId === seam.seamId &&
      seam.confirmed &&
      seam.mapping === 'equal' &&
      seam.lengthRatio === 1 &&
      seam.sides.length === 2 &&
      seam.sides.every((side, sideIndex) => {
        const selected = choice.sides[sideIndex];
        return (
          selected?.sideIndex === sideIndex &&
          selected.seamId === seam.seamId &&
          selected.pieceId === side.pieceId &&
          selected.pieceLineKey === side.pieceLineKey &&
          selected.contourId === side.contourId &&
          sameStrings(selected.boundaryVertexIds, side.boundaryVertexIds) &&
          selected.direction === side.direction &&
          selected.confirmed &&
          side.confirmed
        );
      })
    );
  });
}

function blocked(
  code: PatternImportDxfProductExactNSeamWorkbenchHostBlockerCodeV2,
  detail: string,
): PatternImportDxfProductExactNSeamWorkbenchHostResultV2 {
  return Object.freeze({
    ok: false as const,
    model: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      PatternImportDxfProductExactNSeamWorkbenchHostBlockerV2,
    ],
    claims: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_CLAIMS_V2,
  });
}

/**
 * Resolves a render-only host model from the opaque atomic selection owner. The host does not
 * recreate selection authority: a fresh caller-owned binding tuple can only reject the owner.
 */
export function resolvePatternImportDxfProductExactNSeamWorkbenchHostV2(
  input: Readonly<{
    selectionOwner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
    current: Bindings;
    activeSeamIndex: number;
  }>,
): PatternImportDxfProductExactNSeamWorkbenchHostResultV2 {
  try {
    const state = readPatternImportDxfProductExactNSeamSelectedUiStateV2(input.selectionOwner);
    const choices = readPatternImportDxfProductExactNSeamSelectedChoicesV3(input.selectionOwner);
    if (
      !state ||
      !choices ||
      input.selectionOwner.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_OWNER_V2
    )
      return blocked(
        'selection-owner-required',
        'A genuine atomic exact-N UI selection owner is required.',
      );
    if (state.seams.length < 1 || state.seams.length === 2)
      return blocked(
        'v1-two-seam-path-required',
        'Exact two seams remain on the existing Composite V3 / workbench V2 path.',
      );
    if (!sameBindings(input.current, state.bindings))
      return blocked(
        'current-binding-mismatch',
        'Card lock, row, Assembly revision, topology, catalog, plan or operation is stale.',
      );
    if (
      input.selectionOwner.seamCount !== state.seams.length ||
      !selectedStateMatchesChoices(state, choices)
    )
      return blocked(
        'owner-state-mismatch',
        'Atomic UI state and exact proposal choices do not describe the same selected seams.',
      );
    if (
      !Number.isSafeInteger(input.activeSeamIndex) ||
      input.activeSeamIndex < 0 ||
      input.activeSeamIndex >= state.seams.length
    )
      return blocked(
        'active-seam-unavailable',
        'The controlled active seam pointer is outside the current exact-N selection.',
      );
    return Object.freeze({
      ok: true as const,
      model: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_V2,
        status: 'verified-atomic-selection' as const,
        seamCount: state.seams.length,
        activeSeamIndex: input.activeSeamIndex,
        state,
        choices,
      }),
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_WORKBENCH_HOST_CLAIMS_V2,
    });
  } catch {
    return blocked('selection-owner-required', 'Exact-N workbench host resolution failed closed.');
  }
}

export type PatternImportDxfProductExactNSeamWorkbenchHostPropsV2 = Readonly<{
  selectionOwner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
  current: Bindings;
  activeSeamIndex: number;
  onActiveSeamIndexChange: (index: number) => void;
  operationWindow?: ReactNode;
}>;

/**
 * Minimal arbitrary-N render host. Exact selections stay immutable and owner-backed; only the
 * active seam pointer is controlled by the caller. The existing exact-two workbench is untouched.
 */
export function PatternImportDxfProductExactNSeamWorkbenchHostV2({
  selectionOwner,
  current,
  activeSeamIndex,
  onActiveSeamIndexChange,
  operationWindow = null,
}: PatternImportDxfProductExactNSeamWorkbenchHostPropsV2) {
  const resolved = resolvePatternImportDxfProductExactNSeamWorkbenchHostV2({
    selectionOwner,
    current,
    activeSeamIndex,
  });
  if (!resolved.ok) return null;
  const { model } = resolved;
  const active = model.state.seams[model.activeSeamIndex];
  return (
    <section
      className='min-w-0 bg-bgColor text-textColor'
      aria-label='Exact seam workbench'
      data-exact-n-seam-workbench-host-v2=''
      data-exact-n-seam-count={model.seamCount}
      data-active-seam-index={model.activeSeamIndex}
      data-selection-authority='atomic-owner'
    >
      <header className='flex min-h-10 items-center gap-3 border-b border-borderColor px-3 py-1.5'>
        <div className='min-w-0'>
          <Text component='p' className='truncate font-bold'>
            Operation #{model.choices.operation.sourceOperationNumber}
          </Text>
          <Text component='p' size='micro' variant='label' className='truncate'>
            {model.choices.operation.authoringOperationId}
          </Text>
        </div>
        <Pill tone='ok'>{model.seamCount} exact seams</Pill>
      </header>

      <div
        className='flex gap-1 overflow-x-auto border-b border-hairline px-2 py-1.5'
        role='tablist'
        aria-label='Exact seams'
      >
        {model.state.seams.map((seam, index) => (
          <Button
            key={seam.seamId}
            type='button'
            size='xs'
            variant={index === model.activeSeamIndex ? 'main' : 'secondary'}
            role='tab'
            aria-selected={index === model.activeSeamIndex}
            data-exact-n-seam-tab={seam.seamId}
            onClick={() => onActiveSeamIndexChange(index)}
          >
            {index + 1} · {seam.seamId}
          </Button>
        ))}
      </div>

      <div className='divide-y divide-borderColor border-b border-borderColor'>
        {active.sides.map((side, sideIndex) => (
          <div
            key={`${active.seamId}:${sideIndex}`}
            className='grid gap-x-3 gap-y-1 px-3 py-2 text-micro sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)]'
            data-exact-n-seam-side={sideIndex}
          >
            <span className='font-bold'>
              {sideIndex === 0 ? 'A' : 'B'} · {side.pieceLineKey}
            </span>
            <span className='truncate text-labelColor'>{side.pieceId}</span>
            <span className='text-labelColor'>Contour</span>
            <span className='truncate'>{side.contourId}</span>
            <span className='text-labelColor'>Ordered edge</span>
            <span className='truncate'>{side.boundaryVertexIds.join(' → ')}</span>
            <span className='text-labelColor'>Direction</span>
            <span>{side.direction}</span>
          </div>
        ))}
      </div>

      {operationWindow}
    </section>
  );
}
