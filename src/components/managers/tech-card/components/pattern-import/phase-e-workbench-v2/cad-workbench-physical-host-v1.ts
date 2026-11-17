import type { ReactNode } from 'react';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';

/** One mounted CAD route supplies the current picker input and its in-viewport cloth preview. */
export type CadWorkbenchPhysicalHostV1 = Readonly<{
  onDisplayedBodyInputV1: (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => void;
  viewport?: ReactNode;
  /** Transitional read-only compatibility for the separate zero-operation route. */
  panel?: ReactNode;
}>;
