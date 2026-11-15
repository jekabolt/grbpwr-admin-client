import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import type { ApplyResult, CardDraft } from '../../pattern-import/types';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1,
  type PatternImportDxfProductExpectedSavedRowV1,
} from './pattern-import-dxf-product-mapping-composition-v1';
import type { PatternImportDxfProductPhaseEIntentV1 } from './pattern-import-dxf-product-phase-e-intent-v1';
import type { PatternImportDxfProductSidecarLiveServiceV1 } from './pattern-import-dxf-product-semantic-sidecar-live-composition-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_REQUEST_V1,
  attemptPatternImportDxfProductSidecarAttachmentV1,
  createPatternImportDxfProductSidecarRetryOwnerV1,
  readPatternImportDxfProductSidecarRetrySnapshotV1,
  type PatternImportDxfProductSidecarRetryAttemptResultV1,
  type PatternImportDxfProductSidecarRetryOwnerV1,
  type PatternImportDxfProductSidecarRetrySnapshotV1,
} from './pattern-import-dxf-product-semantic-sidecar-retry-owner-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1 =
  'pattern-import-dxf-product-sidecar-post-apply-host/1' as const;

type SuccessfulApply = Extract<ApplyResult, { ok: true }>;

export type PatternImportDxfProductSidecarHostAuthorityV1 = Readonly<{
  scopeKey: string;
  selection: DxfProductPhaseDSizeSelectionResultV1;
  intent: PatternImportDxfProductPhaseEIntentV1;
}>;

export type PatternImportDxfProductSidecarHostAuthorityProviderV1 = (
  draft: CardDraft,
  apply: SuccessfulApply,
) =>
  | PatternImportDxfProductSidecarHostAuthorityV1
  | null
  | Promise<PatternImportDxfProductSidecarHostAuthorityV1 | null>;

export type PatternImportDxfProductSidecarPostApplyHostOptionsV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1;
  service: PatternImportDxfProductSidecarLiveServiceV1;
  authority: PatternImportDxfProductSidecarHostAuthorityProviderV1;
  onSnapshot?: (snapshot: PatternImportDxfProductSidecarRetrySnapshotV1) => void;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfProductSidecarPostApplyHostResultV1 =
  | Readonly<{
      status: 'not-requested';
      key: null;
      snapshot: null;
      attempt: null;
      blocker: null;
    }>
  | Readonly<{
      status: 'attempted';
      key: string;
      snapshot: PatternImportDxfProductSidecarRetrySnapshotV1;
      attempt: PatternImportDxfProductSidecarRetryAttemptResultV1;
      blocker: null;
    }>
  | Readonly<{
      status: 'blocked';
      key: null;
      snapshot: null;
      attempt: null;
      blocker: Readonly<{
        code: 'confirmed-save-required' | 'authority-provider-failed' | 'retry-owner-blocked';
        detail: string;
      }>;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_CONTRACT_V1 = Object.freeze({
  explicitAuthorityProviderRequired: true,
  cardAssemblyRowsInferredAsPhaseE: false,
  callbackRunsOnlyAfterConfirmedSaveReceipt: true,
  attachmentFailureChangesApplyResult: false,
  savedDxfRolledBackOnAttachmentFailure: false,
  snapshotPublisherFailureChangesAttachment: false,
  runningSnapshotPublishedBeforeAwait: true,
  expectedSavedRowPreconditionPropagatedWhenProvided: true,
  retryOwnerSurvivesPageReload: false,
  productionReady: false,
} as const);

function keyOf(snapshot: PatternImportDxfProductSidecarRetrySnapshotV1): string {
  return `${snapshot.techCardId}:${snapshot.scopeKey}:${snapshot.patternLineKey.toUpperCase()}`;
}

function publish(
  callback: PatternImportDxfProductSidecarPostApplyHostOptionsV1['onSnapshot'],
  value: PatternImportDxfProductSidecarRetrySnapshotV1,
): void {
  if (!callback) return;
  try {
    callback(value);
  } catch {
    // Rendering/telemetry is not attachment authority and must not alter the saved-DXF chronology.
  }
}

function blocked(
  code: Extract<
    PatternImportDxfProductSidecarPostApplyHostResultV1,
    { status: 'blocked' }
  >['blocker']['code'],
  detail: string,
): PatternImportDxfProductSidecarPostApplyHostResultV1 {
  return Object.freeze({
    status: 'blocked' as const,
    key: null,
    snapshot: null,
    attempt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

/**
 * Holds post-apply product attachment intents in browser memory. The provider is the only route for
 * Phase-E authority; this host never infers anchors, direction, materials or surface from card rows.
 */
export function createPatternImportDxfProductSidecarPostApplyHostV1(
  options: PatternImportDxfProductSidecarPostApplyHostOptionsV1,
) {
  if (
    !options ||
    options.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1 ||
    typeof options.authority !== 'function' ||
    !options.service
  )
    throw new TypeError('Exact product post-apply host options are required.');

  const owners = new Map<string, PatternImportDxfProductSidecarRetryOwnerV1>();
  const crypto = options.crypto ?? globalThis.crypto;

  const afterConfirmedSave = async (
    draft: CardDraft,
    apply: SuccessfulApply,
    expectedSavedRow?: PatternImportDxfProductExpectedSavedRowV1,
  ): Promise<PatternImportDxfProductSidecarPostApplyHostResultV1> => {
    if (!apply.commitReceipt)
      return blocked(
        'confirmed-save-required',
        'A confirmed apply commit receipt is required before semantic attachment.',
      );
    let authority: PatternImportDxfProductSidecarHostAuthorityV1 | null;
    try {
      authority = await options.authority(draft, apply);
    } catch {
      return blocked(
        'authority-provider-failed',
        'The explicit Phase-E authority provider failed without changing the saved DXF.',
      );
    }
    if (!authority)
      return Object.freeze({
        status: 'not-requested' as const,
        key: null,
        snapshot: null,
        attempt: null,
        blocker: null,
      });

    const owner = createPatternImportDxfProductSidecarRetryOwnerV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_REQUEST_V1,
      compositionInput: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1,
        scopeKey: authority.scopeKey,
        draft,
        apply,
        selection: authority.selection,
        intent: authority.intent,
        ...(expectedSavedRow ? { expectedSavedRow } : {}),
      },
    });
    if (!owner)
      return blocked(
        'retry-owner-blocked',
        'The confirmed save and explicit Phase-E authority could not mint a retry owner.',
      );
    const initial = readPatternImportDxfProductSidecarRetrySnapshotV1(owner);
    if (!initial)
      return blocked('retry-owner-blocked', 'The retry owner did not expose its initial snapshot.');
    const key = keyOf(initial);
    owners.set(key, owner);
    publish(options.onSnapshot, initial);
    const attemptPromise = attemptPatternImportDxfProductSidecarAttachmentV1(
      owner,
      options.service,
      crypto,
    );
    const running = readPatternImportDxfProductSidecarRetrySnapshotV1(owner);
    if (running?.status === 'running') publish(options.onSnapshot, running);
    const attempt = await attemptPromise;
    const current = attempt.snapshot ?? readPatternImportDxfProductSidecarRetrySnapshotV1(owner);
    if (!current)
      return blocked('retry-owner-blocked', 'The attachment attempt lost its retry snapshot.');
    publish(options.onSnapshot, current);
    return Object.freeze({
      status: 'attempted' as const,
      key,
      snapshot: current,
      attempt,
      blocker: null,
    });
  };

  const retry = async (
    key: string,
  ): Promise<PatternImportDxfProductSidecarRetryAttemptResultV1 | null> => {
    const owner = owners.get(key);
    if (!owner) return null;
    const attemptPromise = attemptPatternImportDxfProductSidecarAttachmentV1(
      owner,
      options.service,
      crypto,
    );
    const running = readPatternImportDxfProductSidecarRetrySnapshotV1(owner);
    if (running?.status === 'running') publish(options.onSnapshot, running);
    const attempt = await attemptPromise;
    if (attempt.snapshot) publish(options.onSnapshot, attempt.snapshot);
    return attempt;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1,
    afterConfirmedSave,
    retry,
    read: (key: string) => {
      const owner = owners.get(key);
      return owner ? readPatternImportDxfProductSidecarRetrySnapshotV1(owner) : null;
    },
    dispose: () => owners.clear(),
  });
}
