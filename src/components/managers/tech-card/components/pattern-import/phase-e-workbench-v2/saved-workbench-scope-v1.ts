import {
  scopeKeyOfBinding,
  type BindingScopes,
} from 'components/managers/tech-card/components/bom-purpose';

const PURPOSE_SCOPE: Readonly<Record<string, string>> = Object.freeze({
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_BINDING: 'binding',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
});

/** Canonical server identity only after live BOM resolution proves a purpose group.
 * Line keys and manifest binding fields are never rewritten. */
export function savedWorkbenchScopeKeyV1(
  scope: Readonly<{ key: string; byPurpose: boolean }>,
): string {
  return scope.byPurpose ? PURPOSE_SCOPE[scope.key] ?? scope.key : scope.key;
}

export function savedWorkbenchBindingScopeKeyV1(
  purpose: string | undefined,
  bomLineKey: string | undefined,
  bindings: BindingScopes,
): string {
  const key = scopeKeyOfBinding(purpose, bomLineKey, bindings);
  const scope = bindings.scopes.find((candidate) => candidate.key === key);
  return scope ? savedWorkbenchScopeKeyV1(scope) : key;
}
