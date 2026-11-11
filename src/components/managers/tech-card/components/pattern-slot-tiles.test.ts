import { describe, expect, it } from 'vitest';

import { fabricScopes } from './bom-purpose';
import { slotTilePlan } from './pattern-slot-tiles';

// Card 122 (SS26-035, copy of prod card 6): main, pocketing and interlining hold files; the
// roll-goods "bind" line (lining section, purpose binding) has none.
// Scopes in BOM order, as the PATTERNS tab sorts them.
const BOM_ORDER = ['l-main', 'l-pock', 'l-inter', 'l-bind'];
const card122 = fabricScopes([
  {
    lineKey: 'l-main',
    name: 'main fabric',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  },
  {
    lineKey: 'l-pock',
    name: 'Cotton',
    section: 'TECH_CARD_BOM_SECTION_LINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_POCKETING',
  },
  {
    lineKey: 'l-inter',
    name: 'interlining',
    section: 'TECH_CARD_BOM_SECTION_INTERLINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
  },
  {
    lineKey: 'l-bind',
    name: 'bind',
    section: 'TECH_CARD_BOM_SECTION_LINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
  },
]).sort(
  (a, b) =>
    BOM_ORDER.indexOf(a.lines[0]?.lineKey ?? '') - BOM_ORDER.indexOf(b.lines[0]?.lineKey ?? ''),
);

const keyOf = (lineKey: string) =>
  card122.find((s) => s.lines.some((l) => l.lineKey === lineKey))!.key;

const counts = (byLine: Record<string, number>) => {
  const byScope = new Map(Object.entries(byLine).map(([line, n]) => [keyOf(line), n]));
  return (scopeKey: string) => byScope.get(scopeKey) ?? 0;
};

const lineKeys = (scopes: { lines: readonly { lineKey: string }[] }[]) =>
  scopes.map((s) => s.lines[0]?.lineKey);

describe('slotTilePlan', () => {
  it('card 122: three tiles, binding only in the menu', () => {
    const plan = slotTilePlan(
      card122,
      counts({ 'l-main': 1, 'l-pock': 1, 'l-inter': 1 }),
      new Set(),
    );
    expect(lineKeys(plan.tiles)).toEqual(['l-main', 'l-pock', 'l-inter']);
    expect(lineKeys(plan.free)).toEqual(['l-bind']);
    expect(plan.emptyAdded).toBe(0);
  });

  it('an added empty binding tile is drawn, counted empty and leaves the menu', () => {
    const plan = slotTilePlan(
      card122,
      counts({ 'l-main': 1, 'l-pock': 1, 'l-inter': 1 }),
      new Set(['l-bind']),
    );
    expect(lineKeys(plan.tiles)).toEqual(['l-main', 'l-pock', 'l-inter', 'l-bind']);
    expect(plan.free).toEqual([]);
    expect(plan.emptyAdded).toBe(1);
  });

  it('an added line that got a file is an ordinary tile, not empty', () => {
    const plan = slotTilePlan(card122, counts({ 'l-main': 1, 'l-bind': 1 }), new Set(['l-bind']));
    expect(lineKeys(plan.tiles)).toEqual(['l-main', 'l-bind']);
    expect(plan.emptyAdded).toBe(0);
  });

  it('two files in one slot: one tile, the slot keeps both', () => {
    const plan = slotTilePlan(card122, counts({ 'l-main': 2 }), new Set());
    expect(lineKeys(plan.tiles)).toEqual(['l-main']);
    expect(lineKeys(plan.free)).toEqual(['l-pock', 'l-inter', 'l-bind']);
  });

  it('a card with no sheets draws no slot tile; every line is in the menu', () => {
    const plan = slotTilePlan(card122, () => 0, new Set());
    expect(plan.tiles).toEqual([]);
    expect(plan.free).toHaveLength(4);
  });
});
