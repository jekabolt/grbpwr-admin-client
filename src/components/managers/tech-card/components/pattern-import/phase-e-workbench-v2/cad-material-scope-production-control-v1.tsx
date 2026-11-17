import { Text } from 'ui';

import { PatternImportDxfPhaseECadMaterialScopeBrowserV1 } from './cad-material-scope-browser-v1';
import type { PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 } from './cad-material-scope-catalog-v1';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';
import type { PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1 } from './cad-saved-material-scope-editor-preparation-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1 } from './cad-table-cross-scope-connect-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PRODUCTION_CONTROL_V1 =
  'pattern-import-dxf-phase-e-cad-material-scope-production-control/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_PRODUCTION_CONTROL_CLAIMS_V1 =
  Object.freeze({
    productionMounted: true,
    existingScopeBrowserReused: true,
    onlyExactPreparedScopesSelectable: true,
    sameScopeConnectOnly: false,
    legacySameScopePolicyRetained: true,
    exactCrossScopeConnectIngressMounted: true,
    crossScopeConnectRequiresOperationBinding: true,
    crossScopeConnectInferred: false,
    typedCrossScopeBlockerExposed: true,
    technicalConnectionStatusHiddenFromChrome: true,
    createsPanel: false,
    createsGeometryOwner: false,
    createsWriter: false,
  } as const);

export type PatternImportDxfPhaseECadMaterialScopeConnectionPolicyResultV1 =
  | Readonly<{ ok: true; scopeKey: string; blocker: null }>
  | Readonly<{
      ok: false;
      scopeKey: null;
      blocker: Readonly<{
        code: 'material-scope-unprepared' | 'cross-material-seaming-owner-unavailable';
        detail: string;
      }>;
    }>;

export type PatternImportDxfPhaseECadMaterialScopeSelectablePreparationV1 =
  | PatternImportDxfPhaseECadMaterialScopePreparationResultV1
  | PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1;

/** Accepts only explicit scope identities; it never derives a seam scope from piece names. */
export function resolvePatternImportDxfPhaseECadMaterialScopeConnectionPolicyV1(
  preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null,
  sideAScopeKey: string,
  sideBScopeKey: string,
): PatternImportDxfPhaseECadMaterialScopeConnectionPolicyResultV1 {
  if (
    !preparation?.ok ||
    !preparation.scopes.some(({ scopeKey }) => scopeKey === sideAScopeKey) ||
    !preparation.scopes.some(({ scopeKey }) => scopeKey === sideBScopeKey)
  )
    return Object.freeze({
      ok: false as const,
      scopeKey: null,
      blocker: Object.freeze({
        code: 'material-scope-unprepared' as const,
        detail: 'Both connection sides must name a current exact prepared material scope.',
      }),
    });
  if (sideAScopeKey !== sideBScopeKey)
    return Object.freeze({
      ok: false as const,
      scopeKey: null,
      blocker: Object.freeze({
        code: 'cross-material-seaming-owner-unavailable' as const,
        detail: preparation.crossScopeSeamingBlocker.detail,
      }),
    });
  return Object.freeze({ ok: true as const, scopeKey: sideAScopeKey, blocker: null });
}

/** One compact row inside the existing Draft toolbar; no material drawer or second panel. */
export function PatternImportDxfPhaseECadMaterialScopeProductionControlV1({
  catalog,
  preparation,
  active,
  preparedScopeKeys,
  onSelectPreparedScope,
  crossScopeOperationBindingAvailable = false,
}: Readonly<{
  catalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null;
  preparation: PatternImportDxfPhaseECadMaterialScopeSelectablePreparationV1 | null;
  active: Readonly<{ techCardId: number; scopeKey: string }>;
  preparedScopeKeys: readonly string[];
  onSelectPreparedScope?: (scopeKey: string) => void;
  crossScopeOperationBindingAvailable?: boolean;
}>) {
  const crossScopeStatus =
    preparation?.ok && preparation.scopes.length > 1
      ? crossScopeOperationBindingAvailable
        ? 'available'
        : PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1.code
      : undefined;
  return (
    <div
      className='flex min-w-0 items-center gap-2'
      data-cad-material-scope-production-control=''
      data-cad-cross-scope-connect={crossScopeStatus}
    >
      <PatternImportDxfPhaseECadMaterialScopeBrowserV1
        catalog={catalog}
        active={active}
        preparedScopeKeys={preparedScopeKeys}
        onSelectPreparedScope={onSelectPreparedScope}
      />
      {preparation && !preparation.ok ? (
        <Text
          component='span'
          size='micro'
          variant='label'
          className='truncate'
          data-cad-material-scope-preparation-blocker={preparation.blocker.code}
          title={preparation.blocker.detail}
        >
          linked material geometry unavailable
        </Text>
      ) : null}
    </div>
  );
}
