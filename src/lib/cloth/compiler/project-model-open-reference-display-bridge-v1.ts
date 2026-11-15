import type { common_GenderEnum } from 'api/proto-http/admin';

export const PROJECT_MODEL_OPEN_REFERENCE_DISPLAY_BRIDGE_V1 =
  'project-model-open-reference-display-bridge/v1' as const;

export type ProjectModelOpenReferenceBasisKindV1 = 'neutral' | 'male' | 'female';

export type ProjectModelOpenReferenceDisplayDiagnosticCodeV1 =
  | 'gender-missing-neutral-fallback'
  | 'gender-unknown-neutral-fallback'
  | 'gender-unisex-neutral-fallback'
  | 'gender-unsupported-neutral-fallback';

export interface ProjectModelOpenReferenceDisplayDiagnosticV1 {
  readonly severity: 'info' | 'warning';
  readonly code: ProjectModelOpenReferenceDisplayDiagnosticCodeV1;
  readonly message: string;
}

export interface ProjectModelOpenReferenceDisplayBridgeInputV1 {
  readonly gender: common_GenderEnum | null | undefined;
}

export interface ProjectModelOpenReferenceDisplayBridgeResultV1 {
  readonly version: typeof PROJECT_MODEL_OPEN_REFERENCE_DISPLAY_BRIDGE_V1;
  readonly role: 'DISPLAY_ONLY';
  readonly basisKind: ProjectModelOpenReferenceBasisKindV1;
  readonly diagnostics: readonly ProjectModelOpenReferenceDisplayDiagnosticV1[];
  readonly claims: {
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

const FALSE_CLAIMS = Object.freeze({
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

function diagnostic(
  severity: ProjectModelOpenReferenceDisplayDiagnosticV1['severity'],
  code: ProjectModelOpenReferenceDisplayDiagnosticCodeV1,
  message: string,
): readonly ProjectModelOpenReferenceDisplayDiagnosticV1[] {
  return Object.freeze([Object.freeze({ severity, code, message })]);
}

function result(
  basisKind: ProjectModelOpenReferenceBasisKindV1,
  diagnostics: readonly ProjectModelOpenReferenceDisplayDiagnosticV1[] = Object.freeze([]),
): ProjectModelOpenReferenceDisplayBridgeResultV1 {
  return Object.freeze({
    version: PROJECT_MODEL_OPEN_REFERENCE_DISPLAY_BRIDGE_V1,
    role: 'DISPLAY_ONLY' as const,
    basisKind,
    diagnostics,
    claims: FALSE_CLAIMS,
  });
}

/**
 * Maps the persisted fit-model gender to a visual basis only. The result deliberately contains no
 * measurements, collision LOD, BodyArtifact, worker input, seal, or runtime-admission field.
 */
export function bridgeProjectModelGenderToOpenReferenceDisplayV1(
  input: ProjectModelOpenReferenceDisplayBridgeInputV1,
): ProjectModelOpenReferenceDisplayBridgeResultV1 {
  switch (input.gender) {
    case 'GENDER_ENUM_MALE':
      return result('male');
    case 'GENDER_ENUM_FEMALE':
      return result('female');
    case 'GENDER_ENUM_UNISEX':
      return result(
        'neutral',
        diagnostic(
          'info',
          'gender-unisex-neutral-fallback',
          'Unisex fit-model gender uses the neutral open-reference display basis.',
        ),
      );
    case 'GENDER_ENUM_UNKNOWN':
      return result(
        'neutral',
        diagnostic(
          'info',
          'gender-unknown-neutral-fallback',
          'Unknown fit-model gender uses the neutral open-reference display basis.',
        ),
      );
    case undefined:
    case null:
      return result(
        'neutral',
        diagnostic(
          'info',
          'gender-missing-neutral-fallback',
          'Missing fit-model gender uses the neutral open-reference display basis.',
        ),
      );
    default:
      return result(
        'neutral',
        diagnostic(
          'warning',
          'gender-unsupported-neutral-fallback',
          'Unsupported fit-model gender was not guessed and uses the neutral display basis.',
        ),
      );
  }
}
