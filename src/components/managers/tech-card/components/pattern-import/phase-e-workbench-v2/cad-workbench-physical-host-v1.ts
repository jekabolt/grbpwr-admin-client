import type { ReactNode } from 'react';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';

/** One mounted CAD route supplies the current picker input and its cloth controls/preview. */
export type CadWorkbenchPhysicalHostV1 = Readonly<{
  onDisplayedBodyInputV1: (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => void;
  panel: ReactNode;
}>;
