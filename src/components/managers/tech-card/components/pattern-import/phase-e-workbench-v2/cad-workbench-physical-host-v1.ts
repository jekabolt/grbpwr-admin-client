import type { ReactNode } from 'react';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type {
  CadMannequinArrangementBindingsV1,
  CadMannequinArrangementPieceV1,
} from './cad-mannequin-arrangement-document-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export type CadWorkbenchMannequinArrangementSaveV1 = Readonly<{
  scopeKey: string;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  mannequin: CadMannequinArrangementBindingsV1['mannequin'];
  pieces: readonly CadMannequinArrangementPieceV1[];
}>;

/** One mounted CAD route supplies the current picker input and its in-viewport cloth preview. */
export type CadWorkbenchPhysicalHostV1 = Readonly<{
  onDisplayedBodyInputV1: (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => void;
  onSaveMannequinArrangement?: (input: CadWorkbenchMannequinArrangementSaveV1) => Promise<void>;
  viewport?: ReactNode;
  /** Transitional read-only compatibility for the separate zero-operation route. */
  panel?: ReactNode;
}>;
