import { type ChangeEvent } from 'react';
import { Pill, Text } from 'ui';

import type {
  PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
  PatternImportDxfPhaseECadMaterialScopeV1,
} from './cad-material-scope-catalog-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_BROWSER_V1 =
  'pattern-import-dxf-phase-e-cad-material-scope-browser/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_BROWSER_CLAIMS_V1 = Object.freeze({
  existingMaterialScopeCatalogReused: true,
  onlyPreparedScopesSelectable: true,
  linkedUnpreparedScopesHaveNoAction: true,
  createsPreparationOwner: false,
  createsWriter: false,
  performsNetwork: false,
  requestsAutosave: false,
  rawDxfExposed: false,
  crossScopeSeamingAvailable: false,
} as const);

export type PatternImportDxfPhaseECadMaterialScopeAvailabilityV1 = Readonly<{
  active: PatternImportDxfPhaseECadMaterialScopeV1;
  prepared: readonly PatternImportDxfPhaseECadMaterialScopeV1[];
  linked: readonly PatternImportDxfPhaseECadMaterialScopeV1[];
  blocker: null;
}>;

export type PatternImportDxfPhaseECadMaterialScopeAvailabilityResultV1 =
  | Readonly<{ ok: true; value: PatternImportDxfPhaseECadMaterialScopeAvailabilityV1 }>
  | Readonly<{
      ok: false;
      value: null;
      blocker: Readonly<{
        code:
          | 'material-catalog-unavailable'
          | 'material-card-identity-stale'
          | 'material-scope-identity-stale'
          | 'prepared-material-scope-stale'
          | 'active-material-scope-unprepared';
        detail: string;
      }>;
    }>;

function unavailable(
  code: Extract<
    PatternImportDxfPhaseECadMaterialScopeAvailabilityResultV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): PatternImportDxfPhaseECadMaterialScopeAvailabilityResultV1 {
  return Object.freeze({
    ok: false as const,
    value: null,
    blocker: Object.freeze({ code, detail }),
  });
}

export function resolvePatternImportDxfPhaseECadMaterialScopeAvailabilityV1(
  catalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null,
  active: Readonly<{ techCardId: number; scopeKey: string }>,
  preparedScopeKeys: readonly string[],
): PatternImportDxfPhaseECadMaterialScopeAvailabilityResultV1 {
  if (!catalog?.ok)
    return unavailable(
      'material-catalog-unavailable',
      catalog?.blocker.detail ?? 'The current import has no exact material-slot catalog.',
    );
  if (catalog.techCardId !== active.techCardId)
    return unavailable(
      'material-card-identity-stale',
      'The material-slot catalog belongs to a different tech card.',
    );
  const activeScope = catalog.scopes.find(({ scopeKey }) => scopeKey === active.scopeKey);
  if (!activeScope)
    return unavailable(
      'material-scope-identity-stale',
      'The prepared DXF scope is absent from the current material-slot catalog.',
    );
  const distinctPrepared = [...new Set(preparedScopeKeys)];
  const stalePrepared = distinctPrepared.find(
    (scopeKey) => !catalog.scopes.some((scope) => scope.scopeKey === scopeKey),
  );
  if (stalePrepared)
    return unavailable(
      'prepared-material-scope-stale',
      'A prepared material scope is absent from the current import catalog.',
    );
  if (!distinctPrepared.includes(active.scopeKey))
    return unavailable(
      'active-material-scope-unprepared',
      'The visible DXF scope has no current prepared geometry owner.',
    );
  const prepared = catalog.scopes.filter(({ scopeKey }) => distinctPrepared.includes(scopeKey));
  const linked = catalog.scopes.filter(({ scopeKey }) => !distinctPrepared.includes(scopeKey));
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      active: activeScope,
      prepared: Object.freeze(prepared),
      linked: Object.freeze(linked),
      blocker: null,
    }),
  });
}

export function PatternImportDxfPhaseECadMaterialScopeBrowserV1({
  catalog,
  active,
  preparedScopeKeys,
  onSelectPreparedScope,
}: Readonly<{
  catalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null;
  active: Readonly<{ techCardId: number; scopeKey: string }>;
  preparedScopeKeys: readonly string[];
  onSelectPreparedScope?: (scopeKey: string) => void;
}>) {
  // Sources that were not prepared from BOM-bound DXF scopes legitimately have no catalog. Keep
  // that normal absence out of the CAD chrome; supplied but stale catalogs still fail closed below.
  if (!catalog) return null;

  const availability = resolvePatternImportDxfPhaseECadMaterialScopeAvailabilityV1(
    catalog,
    active,
    preparedScopeKeys,
  );
  if (!availability.ok)
    return (
      <Text
        component='p'
        size='micro'
        variant='label'
        data-cad-material-scope-blocker={availability.blocker.code}
      >
        Material slots unavailable
      </Text>
    );

  const { value } = availability;
  const canSwitch = value.prepared.length > 1 && Boolean(onSelectPreparedScope);
  const select = (event: ChangeEvent<HTMLSelectElement>) =>
    onSelectPreparedScope?.(event.currentTarget.value);
  return (
    <div
      className='flex min-w-0 items-center gap-2'
      data-cad-material-scope-browser=''
      data-active-material-scope={value.active.scopeKey}
    >
      <Text component='span' size='micro' variant='label'>
        Material
      </Text>
      {canSwitch ? (
        <select
          className='h-7 min-w-0 max-w-48 border border-borderColor bg-bgColor px-2 text-micro font-bold'
          aria-label='Current material slot'
          value={value.active.scopeKey}
          onChange={select}
        >
          {value.prepared.map((scope) => (
            <option key={scope.scopeKey} value={scope.scopeKey}>
              {scope.label}
            </option>
          ))}
        </select>
      ) : (
        <Text component='span' size='micro' className='truncate font-bold'>
          {value.active.label}
        </Text>
      )}
      <Pill tone='ink'>{value.active.pieceLineKeys.length} pieces</Pill>
      {value.linked.length ? (
        <details className='relative' data-cad-linked-material-scopes=''>
          <summary className='cursor-pointer list-none text-micro font-bold marker:hidden'>
            +{value.linked.length} linked
          </summary>
          <div className='absolute left-0 top-[calc(100%+0.25rem)] z-30 w-64 border border-borderColor bg-bgColor p-2 shadow-[2px_2px_0_0_var(--color-borderColor)]'>
            <Text component='p' size='micro' variant='label' className='mb-1'>
              Linked DXF slots · prepare through their real operation
            </Text>
            <ul className='divide-y divide-hairline'>
              {value.linked.map((scope) => (
                <li
                  key={scope.scopeKey}
                  className='flex items-center gap-2 py-1 text-micro'
                  data-cad-linked-material-scope={scope.scopeKey}
                >
                  <span className='min-w-0 flex-1 truncate font-bold'>{scope.label}</span>
                  <span className='text-labelColor'>{scope.pieceLineKeys.length} pieces</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}
