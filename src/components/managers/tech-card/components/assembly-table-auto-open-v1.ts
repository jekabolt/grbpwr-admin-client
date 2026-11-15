export const ASSEMBLY_TABLE_AUTO_OPEN_CONTRACT_V1 = Object.freeze({
  opensOnlyAfterTabVisit: true,
  requiresSelectedOperation: true,
  preservesOpenWorkbenchWhenTabHides: true,
  createsSecondOperationOwner: false,
} as const);

/**
 * The Assembly Table is a tool surface, not a card inside a card. Its single existing workbench
 * owner opens when the production tab becomes visible and stays mounted afterwards so CAD state is
 * not destroyed while the operator checks another tech-card section.
 */
export function resolveAssemblyTableWorkbenchOpenV1(
  currentOpen: boolean,
  tabActive: boolean,
  selectedOperationIndex: number,
): boolean {
  return currentOpen || (tabActive && selectedOperationIndex >= 0);
}
