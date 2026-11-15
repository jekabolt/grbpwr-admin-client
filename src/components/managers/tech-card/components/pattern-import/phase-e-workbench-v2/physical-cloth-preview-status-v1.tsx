import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import {
  PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
  type PatternImportDxfPhysicalClothBodyRelativeMissingInputV1,
  type PatternImportDxfPhysicalClothPackageAdapterResultV1,
} from './physical-cloth-package-adapter-v1';
import type { PatternImportDxfPhysicalClothPreparationCapabilityResultV1 } from './physical-cloth-preparation-capability-v1';

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_V1 =
  'pattern-import-dxf-physical-cloth-preview-status/1' as const;

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_CLAIMS_V1 = Object.freeze({
  existingDollColumnReused: true,
  createsDataOwner: false,
  createsFormOwner: false,
  createsPhysicalSolver: false,
  executesPhysicalSolver: false,
  grantsPreviewAuthority: false,
  runnable: false,
  previewReady: false,
} as const);

export type PatternImportDxfPhysicalClothPreparedSourceIdentityV1 = Readonly<{
  pieceIds: readonly string[];
  seamIds: readonly string[];
}>;

export type PatternImportDxfPhysicalClothPreviewStatusStageV1 =
  | 'awaiting-prepared-source'
  | 'owner-capability-unavailable'
  | 'package-input-unavailable'
  | 'package-compilation-blocked'
  | 'package-source-mismatch'
  | 'package-compiled-body-blocked';

export type PatternImportDxfPhysicalClothPreviewStatusV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_V1;
  stage: PatternImportDxfPhysicalClothPreviewStatusStageV1;
  title: string;
  detail: string;
  packageCompiled: boolean;
  currentPreparedSourceBound: boolean;
  runnable: false;
  previewReady: false;
  packageBlockers: readonly Readonly<{ code: string; detail: string }>[];
  bodyRelativeMissingInputs: readonly PatternImportDxfPhysicalClothBodyRelativeMissingInputV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_CLAIMS_V1;
}>;

const INPUT_LABELS: Readonly<
  Record<PatternImportDxfPhysicalClothBodyRelativeMissingInputV1, string>
> = Object.freeze({
  'sealed-body-relative-run-initialization-for-exact-mesh':
    'Sealed initialization for this exact garment mesh',
  'current-body-artifact': 'Current mannequin body artifact',
  'closed-tube-embedding-policy': 'Closed-tube embedding policy',
  'expected-closed-tube-fixture-tier': 'Expected closed-tube fixture tier',
  'body-relative-placement-admission': 'Body-relative placement admission',
});

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function status(
  value: Omit<
    PatternImportDxfPhysicalClothPreviewStatusV1,
    'schemaVersion' | 'runnable' | 'previewReady' | 'claims'
  >,
): PatternImportDxfPhysicalClothPreviewStatusV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_V1,
    ...value,
    runnable: false as const,
    previewReady: false as const,
    claims: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREVIEW_STATUS_CLAIMS_V1,
  });
}

/**
 * Read-only view model. It accepts only the result of the existing package adapter and the current
 * prepared 2D identity; it never creates another form, preparation owner, runtime or solver.
 */
export function derivePatternImportDxfPhysicalClothPreviewStatusV1(
  preparedSource: PatternImportDxfPhysicalClothPreparedSourceIdentityV1 | null,
  adapterResult: PatternImportDxfPhysicalClothPackageAdapterResultV1 | null,
  capability: PatternImportDxfPhysicalClothPreparationCapabilityResultV1 | null = null,
): PatternImportDxfPhysicalClothPreviewStatusV1 {
  if (!preparedSource)
    return status({
      stage: 'awaiting-prepared-source',
      title: 'Waiting for the prepared 2D source',
      detail: 'Physical preparation starts only after the current CAD source is admitted.',
      packageCompiled: false,
      currentPreparedSourceBound: false,
      packageBlockers: Object.freeze([]),
      bodyRelativeMissingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    });

  if (!adapterResult && capability && !capability.ok)
    return status({
      stage: 'owner-capability-unavailable',
      title: 'Physical owner capability is incomplete',
      detail:
        'The production TechCard mount cannot build a V5 package until one existing owner publishes all listed outputs.',
      packageCompiled: false,
      currentPreparedSourceBound: false,
      packageBlockers: Object.freeze(
        capability.missingOwnerOutputs.map((output) =>
          Object.freeze({
            code: output,
            detail: `Required existing-owner output is missing: ${output}.`,
          }),
        ),
      ),
      bodyRelativeMissingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    });

  if (!adapterResult)
    return status({
      stage: 'package-input-unavailable',
      title: 'Physical preview is not prepared',
      detail:
        'The current preparation owner has not exposed a genuine garment-mesh owner and exact V5 material request.',
      packageCompiled: false,
      currentPreparedSourceBound: false,
      packageBlockers: Object.freeze([
        Object.freeze({
          code: 'physical-package-input-unavailable',
          detail: 'SimulationPackageV5 was not compiled for this prepared 2D source.',
        }),
      ]),
      bodyRelativeMissingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    });

  if (!adapterResult.ok)
    return status({
      stage: 'package-compilation-blocked',
      title: 'V5 cloth package is blocked',
      detail: 'The existing physical package adapter refused the current inputs.',
      packageCompiled: false,
      currentPreparedSourceBound: false,
      packageBlockers: adapterResult.blockers,
      bodyRelativeMissingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    });

  const candidate = adapterResult.candidate;
  const sourceMatches =
    sameStrings(candidate.bindings.pieceIds, preparedSource.pieceIds) &&
    sameStrings(
      sorted(candidate.bindings.seams.map((seam) => seam.seamId)),
      sorted(preparedSource.seamIds),
    );
  const contractCurrent =
    candidate.readiness === 'compiled-unsealed-non-runnable' &&
    candidate.runnable === false &&
    candidate.claims.physicalSolverExecuted === false &&
    candidate.claims.previewRendered === false &&
    candidate.bodyRelativeAdmission.status === 'not-admitted' &&
    candidate.bodyRelativeAdmission.acceptsThisPackageDirectly === false;
  if (!sourceMatches || !contractCurrent)
    return status({
      stage: 'package-source-mismatch',
      title: 'Physical package rejected as stale',
      detail:
        'The package piece/seam identity or non-runnable admission contract does not match the current prepared 2D source.',
      packageCompiled: false,
      currentPreparedSourceBound: false,
      packageBlockers: Object.freeze([
        Object.freeze({
          code: 'physical-package-current-source-mismatch',
          detail: 'A package from another prepared source cannot drive this mannequin area.',
        }),
      ]),
      bodyRelativeMissingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    });

  return status({
    stage: 'package-compiled-body-blocked',
    title: 'V5 cloth package compiled · body admission blocked',
    detail:
      'Exact mesh seams and materials are compiled, but the existing body-relative constructor cannot consume this package without its sealed initialization and body bindings.',
    packageCompiled: true,
    currentPreparedSourceBound: true,
    packageBlockers: Object.freeze([]),
    bodyRelativeMissingInputs: candidate.bodyRelativeAdmission.missingInputs,
  });
}

export function PatternImportDxfPhysicalClothPreviewStatusPanelV1({
  status: value,
}: Readonly<{ status: PatternImportDxfPhysicalClothPreviewStatusV1 }>) {
  return (
    <details
      className='shrink-0 border border-borderColor bg-bgColor'
      aria-label='Physical cloth preview preparation'
      data-physical-cloth-preview-status={value.stage}
      data-physical-cloth-package-compiled={value.packageCompiled || undefined}
      data-physical-cloth-runnable='false'
      data-physical-cloth-preview-ready='false'
    >
      <summary className='flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 marker:hidden'>
        <Text component='span' size='micro' className='min-w-0 flex-1 truncate font-bold'>
          Physical preview · {value.title}
        </Text>
        <Pill tone={value.packageCompiled ? 'attention' : 'gap'}>
          {value.packageCompiled ? 'package compiled · blocked' : 'not ready'}
        </Pill>
      </summary>
      <div className='border-t border-hairline p-2' data-physical-cloth-diagnostics=''>
        <Text component='p' size='micro' variant='label'>
          {value.detail}
        </Text>
        {value.packageBlockers.length ? (
          <ul className='mt-1 list-square space-y-0.5 pl-4' data-physical-package-blockers=''>
            {value.packageBlockers.map((blocker) => (
              <li key={blocker.code}>
                <Text component='span' size='micro'>
                  {blocker.detail} [{blocker.code}]
                </Text>
              </li>
            ))}
          </ul>
        ) : null}
        <Text component='p' size='micro' variant='label' className='mt-1.5 uppercase'>
          Body-relative inputs still required
        </Text>
        <ul className='mt-1 grid gap-x-3 gap-y-0.5 pl-4 sm:grid-cols-2' data-body-input-gaps=''>
          {value.bodyRelativeMissingInputs.map((input) => (
            <li key={input} className='list-square'>
              <Text component='span' size='micro'>
                {INPUT_LABELS[input]}
              </Text>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
