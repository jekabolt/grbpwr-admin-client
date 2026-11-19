import type { CadWorkbenchPhysicalPreviewInteractionV1 } from './cad-workbench-physical-host-v1';
import { CadWorkbenchPhysicalHostControlsV1 } from './cad-workbench-physical-host-controls-v1';
import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';

/** One compact physical control/preview layer mounted inside the existing mannequin viewport. */
export function CadWorkbenchPhysicalHostProductionMountV1({
  state,
  disabled = false,
  interaction = null,
  displayedInput,
  onAcceptedRegisteredCloth,
}: Readonly<{
  state: ReturnType<typeof useSavedClothPhysicalHostV1>;
  disabled?: boolean;
  interaction?: CadWorkbenchPhysicalPreviewInteractionV1 | null;
  displayedInput?: ModelDisplayedTriangleBodyOwnedInputV1 | null;
  onAcceptedRegisteredCloth?: (cloth: MeasurementSurfaceAcceptedClothV1 | undefined) => void;
}>) {
  return (
    <CadWorkbenchPhysicalHostControlsV1
      state={state}
      disabled={disabled}
      interaction={interaction}
      displayedInput={displayedInput}
      onAcceptedRegisteredCloth={onAcceptedRegisteredCloth}
    />
  );
}
