import { lazy, Suspense, useSyncExternalStore } from 'react';
import { GroupLabel, Select, Text } from 'ui';
import type { useSavedClothPhysicalHostV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/use-saved-cloth-physical-host-v1';
import type { PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

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
type Host = ReturnType<typeof useSavedClothPhysicalHostV1>;

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
          disabled={disabled || !row}
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
        {row
          ? 'Choose the profile before confirming Assembly seams. Changing it requires a fresh confirmation of the saved assembly.'
          : 'A saved two-panel, two-seam assembly is required for this cloth preview. You can still view the mannequin.'}
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
