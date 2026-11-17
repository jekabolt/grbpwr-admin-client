import type { CadWorkbenchPhysicalPreviewInteractionV1 } from './cad-workbench-physical-host-v1';
import { CadWorkbenchPhysicalHostControlsV1 } from './cad-workbench-physical-host-controls-v1';
import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';

/** One compact physical control/preview layer mounted inside the existing mannequin viewport. */
export function CadWorkbenchPhysicalHostProductionMountV1({
  state,
  disabled = false,
  interaction = null,
}: Readonly<{
  state: ReturnType<typeof useSavedClothPhysicalHostV1>;
  disabled?: boolean;
  interaction?: CadWorkbenchPhysicalPreviewInteractionV1 | null;
}>) {
  return (
    <CadWorkbenchPhysicalHostControlsV1
      state={state}
      disabled={disabled}
      interaction={interaction}
    />
  );
}
