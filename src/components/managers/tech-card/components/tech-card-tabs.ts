export const TECH_CARD_TABS = [
  { id: 'studio', label: 'studio' },
  { id: 'artifacts', label: 'artifacts' },
  { id: 'patterns', label: 'patterns' },
  { id: 'assembly-table', label: 'Workbench' },
  { id: 'assembly-order', label: 'Assembly Order' },
  { id: 'samples', label: 'samples' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'sizes', label: 'sizes' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'production', label: 'production' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;

export type TechCardTabId = (typeof TECH_CARD_TABS)[number]['id'];

/** The rail order is the user-facing lifecycle order, not the declaration order above. */
export const TECH_CARD_TAB_GROUPS: readonly Readonly<{
  band: string;
  tabs: readonly TechCardTabId[];
}>[] = [
  { band: 'design', tabs: ['studio', 'artifacts'] },
  {
    band: 'develop',
    tabs: ['sizes', 'patterns', 'assembly-table', 'assembly-order', 'bom', 'samples', 'colorways'],
  },
  { band: 'spec', tabs: ['labels', 'costing', 'issues', 'signoff'] },
  { band: 'produce', tabs: ['production'] },
  { band: '', tabs: ['history'] },
] as const;

/** Retired tab ids stay valid as bookmarks but never create a second production surface. */
export const TECH_CARD_FOLDED_TABS: Readonly<Record<string, TechCardTabId>> = {
  dev: 'costing',
  'lab-dip': 'colorways',
  pieces: 'patterns',
  moodboard: 'studio',
  sketch: 'studio',
  header: 'studio',
  construction: 'assembly-order',
};

export function techCardRailTabIds(): TechCardTabId[] {
  return TECH_CARD_TAB_GROUPS.flatMap((group) => [...group.tabs]);
}
