import { Button, CalloutBox, Text } from 'ui';

import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1,
  verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  type PatternImportDxfPhaseEGoldenCardObservedFactsV1,
} from './golden-card-suite-profiles-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_STATUS_V1 =
  'pattern-import-dxf-phase-e-golden-card-preflight-status/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_STATUS_CLAIMS_V1 = Object.freeze({
  selectedProductOwnerProfilesOnly: true,
  callerOwnedLiveRead: true,
  productionPayloadRetained: false,
  networkUsedByComponent: false,
  productionWriteAvailable: false,
  profileDriftFailsClosed: true,
  wholeCardProjectionRequired: true,
  reconstructionHarnessStatusPresentedOnly: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardHarnessStatusV1 = Readonly<{
  revision: number;
  operationCount: number;
  connectionCount: number;
  result: 'blank-mismatch' | 'replaying' | 'match' | 'mismatch' | 'blocked';
}>;

export type PatternImportDxfPhaseEGoldenCardPreflightStatusPropsV1 = Readonly<{
  techCardId: number;
  readStatus: 'idle' | 'loading' | 'ready' | 'failed';
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1 | null;
  wholeCardProjectionReady: boolean;
  harness: PatternImportDxfPhaseEGoldenCardHarnessStatusV1 | null;
  /** Sanitized fail-closed reason from a caller-owned integration controller. */
  readBlocker?: string | null;
  onReadLiveBaseline?: () => void;
}>;

function harnessCopy(status: PatternImportDxfPhaseEGoldenCardHarnessStatusV1): string {
  switch (status.result) {
    case 'blank-mismatch':
      return 'Blank start verified: exact refs retained; operations and connections are empty.';
    case 'replaying':
      return `Replaying graph: ${status.operationCount} operations, ${status.connectionCount} exact connections.`;
    case 'match':
      return 'Golden reconstruction matches all six structural/reference sections.';
    case 'mismatch':
      return 'Reconstruction completed with a structural mismatch. Open the exact diff before any apply.';
    case 'blocked':
      return 'Reconstruction is blocked by identity, authority, decode or safety evidence.';
  }
}

/**
 * Read-only status surface. The caller owns authenticated reads and passes count-only facts plus
 * sanitized harness progress; this component cannot fetch, persist, confirm or apply anything.
 */
export function PatternImportDxfPhaseEGoldenCardPreflightStatusV1({
  techCardId,
  readStatus,
  observedFacts,
  wholeCardProjectionReady,
  harness,
  readBlocker,
  onReadLiveBaseline,
}: PatternImportDxfPhaseEGoldenCardPreflightStatusPropsV1) {
  const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
    ({ facts }) => facts.techCardId === techCardId,
  );
  if (!profile) return null;
  const profileResult =
    readStatus === 'ready' && observedFacts
      ? verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1(profile, observedFacts)
      : null;
  const blocked = profileResult !== null && !profileResult.ok;
  const ready = profileResult?.ok === true && wholeCardProjectionReady;

  return (
    <section
      className='space-y-2 border border-borderColor bg-bgColor p-3'
      data-golden-card-preflight-v1=''
      data-card-ref={profile.cardRef}
      data-profile-status={blocked ? 'drift' : profileResult ? 'match' : readStatus}
      data-whole-card-projection={wholeCardProjectionReady ? 'ready' : 'blocked'}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <Text component='p' size='micro' variant='label'>
            GOLDEN RECONSTRUCTION · READ ONLY
          </Text>
          <Text component='p' className='font-bold'>
            {profile.facts.styleNumber} · {profile.facts.name}
          </Text>
        </div>
        {onReadLiveBaseline && (
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={readStatus === 'loading'}
            onClick={onReadLiveBaseline}
            data-golden-card-read-live=''
          >
            {readStatus === 'loading' ? 'Reading…' : 'Read live baseline'}
          </Button>
        )}
      </div>

      {readStatus === 'failed' && (
        <CalloutBox tone='error'>
          Live read failed. No reconstruction session was started and no production write was made.
        </CalloutBox>
      )}

      {readStatus !== 'failed' && readBlocker && (
        <CalloutBox tone='warning'>
          <Text component='p' size='micro' data-golden-card-read-blocker=''>
            {readBlocker}
          </Text>
        </CalloutBox>
      )}

      {blocked && profileResult && (
        <CalloutBox tone='error'>
          <Text component='p' className='font-bold'>
            Pinned baseline drifted
          </Text>
          <ul className='mt-1 list-square pl-4' data-golden-card-profile-differences=''>
            {profileResult.differences.map(({ path, expected, actual }) => (
              <li key={path}>
                <Text component='span' size='micro'>
                  {path}: expected {expected}, got {actual}
                </Text>
              </li>
            ))}
          </ul>
        </CalloutBox>
      )}

      {profileResult?.ok && !wholeCardProjectionReady && (
        <CalloutBox tone='warning'>
          Live identity and count receipt matches version {profile.facts.cardVersion}. Whole-card
          exact projection is still unavailable, so blank reconstruction cannot start.
        </CalloutBox>
      )}

      {ready && !harness && (
        <CalloutBox tone='note'>
          Live baseline verified. Ready to create the detached blank operation/connection graph.
        </CalloutBox>
      )}

      {ready && harness && (
        <CalloutBox tone={harness.result === 'match' ? 'note' : 'warning'}>
          <Text component='p' size='micro' data-golden-card-harness-status={harness.result}>
            {harnessCopy(harness)} Revision {harness.revision}.
          </Text>
        </CalloutBox>
      )}

      <Text component='p' size='micro' variant='label'>
        Pinned: {profile.facts.listedPieceRefCount} refs · {profile.facts.operationCount} operations
        · {profile.facts.zonesCovered}/{profile.facts.zonesTotal} zones ·{' '}
        {profile.facts.warningCount} warning(s) · audit {profile.facts.auditFindingCount} total /{' '}
        {profile.facts.auditUncheckedCount} unchecked
      </Text>
    </section>
  );
}
