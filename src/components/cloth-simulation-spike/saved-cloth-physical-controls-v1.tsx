import { lazy, Suspense, useSyncExternalStore } from 'react';
import { GroupLabel, Select, Text } from 'ui';
import type { PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from './model-displayed-triangle-body-input-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { SavedObservedPhysicalHostV1 } from './saved-observed-physical-host-v1';

const CanonicalPanel = lazy(() =>
  import('./saved-physical-preview-panel-v1').then((module) => ({
    default: module.SavedPhysicalPreviewPanelV1,
  })),
);
const ObservedPanel = lazy(() =>
  import('./saved-observed-physical-panel-v1').then((module) => ({
    default: module.SavedObservedPhysicalPanelV1,
  })),
);
type Profile = '' | 'canonical-reference' | 'observed-saved-model';
type Host = Readonly<{
  profile: Profile;
  setProfile: (profile: Profile) => void;
  bodySession:
    | import('components/managers/models/components/saved-model-displayed-triangle-body-session-v2').SavedModelDisplayedTriangleBodySessionV2
    | null;
  onDisplayedBodyInputV1: (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => void;
  selected:
    | Readonly<{
        profile: 'canonical-reference';
        owner: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
      }>
    | Readonly<{ profile: 'observed-saved-model'; owner: SavedObservedPhysicalHostV1 }>
    | null;
  sourceStatus:
    | 'idle'
    | 'awaiting-mannequin'
    | 'loading'
    | 'ready'
    | 'placement-required'
    | 'blocked';
  sourceError: string | null;
}>;

function CanonicalCompiledPreview({
  owner,
  row,
}: {
  owner: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
  row: DxfProductSavedRowIdentityV1;
}) {
  useSyncExternalStore(owner.subscribe, owner.version, owner.version);
  return owner.latestCompile() ? (
    <CanonicalPanel owner={owner} row={row} />
  ) : (
    <Text variant='label'>
      Confirm the saved Assembly seams to compile the garment for the reference mannequin.
    </Text>
  );
}

/** Profile selection is visible before the one-shot saved-source handoff. */
export function SavedClothPhysicalControlsV1({
  host,
  row,
  disabled = false,
}: {
  host: Host;
  row: DxfProductSavedRowIdentityV1 | null;
  disabled?: boolean;
}) {
  if (!row) {
    return (
      <details data-saved-cloth-profile-v1='' data-saved-cloth-unavailable=''>
        <summary className='cursor-pointer text-micro text-labelColor'>
          Cloth preview unavailable
        </summary>
        <Text component='p' size='micro' variant='label' className='pt-1'>
          Save a supported assembly before starting cloth simulation. The mannequin remains
          available.
        </Text>
      </details>
    );
  }

  return (
    <div className='flex min-w-0 flex-col gap-stack' data-saved-cloth-profile-v1=''>
      <GroupLabel>Cloth simulation</GroupLabel>
      <label className='flex min-w-0 flex-col gap-1'>
        <Text component='span' variant='label'>
          Mannequin for this simulation
        </Text>
        <Select
          name='cloth-body-profile'
          value={host.profile}
          disabled={disabled}
          fullWidth
          items={[
            { value: '', label: 'Choose a mannequin profile…' },
            { value: 'observed-saved-model', label: 'Selected saved mannequin' },
            { value: 'canonical-reference', label: 'Canonical reference mannequin' },
          ]}
          onValueChange={(value) => {
            if (value === '' || value === 'observed-saved-model' || value === 'canonical-reference')
              host.setProfile(value);
          }}
        />
      </label>
      <Text variant='label'>
        Choose the profile before confirming Assembly seams. Changing it requires a fresh
        confirmation of the saved assembly.
      </Text>
      {host.sourceStatus === 'loading' ? <Text role='status'>Preparing cloth source…</Text> : null}
      {host.sourceError ? (
        <Text variant='errorLabel' role='alert'>
          {host.sourceError}
        </Text>
      ) : null}
      <Suspense fallback={<Text role='status'>Loading cloth preview…</Text>}>
        {host.selected?.profile === 'canonical-reference' && row ? (
          <CanonicalCompiledPreview owner={host.selected.owner} row={row} />
        ) : null}
        {host.selected?.profile === 'observed-saved-model' && host.bodySession ? (
          <ObservedPanel host={host.selected.owner} bodySession={host.bodySession} />
        ) : null}
      </Suspense>
    </div>
  );
}
