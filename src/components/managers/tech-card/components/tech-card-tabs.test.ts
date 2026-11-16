import { describe, expect, it } from 'vitest';

import { TECH_CARD_FOLDED_TABS, TECH_CARD_TABS, techCardRailTabIds } from './tech-card-tabs';

describe('tech-card development workflow tabs', () => {
  it('places the focused Workbench before the full Assembly Order', () => {
    const ids = techCardRailTabIds();
    const patternsIndex = ids.indexOf('patterns');

    expect(ids.slice(patternsIndex, patternsIndex + 4)).toEqual([
      'patterns',
      'assembly-table',
      'assembly-order',
      'bom',
    ]);
    expect(TECH_CARD_TABS.find(({ id }) => id === 'assembly-table')?.label).toBe('Workbench');
    expect(TECH_CARD_TABS.find(({ id }) => id === 'assembly-order')?.label).toBe('Assembly Order');
  });

  it('routes the retired construction bookmark to Assembly Order, not Workbench', () => {
    expect(TECH_CARD_FOLDED_TABS.construction).toBe('assembly-order');
  });
});
