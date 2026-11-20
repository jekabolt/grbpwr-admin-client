import { describe, expect, it } from 'vitest';
import { featureForPath, featureOn, workspaceGate, type WorkspaceInfo } from './features';

const ws = (features: string[]): WorkspaceInfo => ({
  slug: 'ostra',
  name: 'ostra',
  role: 'owner',
  features,
  readOnly: false,
});

describe('featureOn', () => {
  it('opens everything without a workspace', () => {
    expect(featureOn(null, 'orders')).toBe(true);
  });
  it('keeps core and keyless items on', () => {
    expect(featureOn(ws([]), 'core')).toBe(true);
    expect(featureOn(ws([]), undefined)).toBe(true);
  });
  it('reads the switch', () => {
    expect(featureOn(ws(['tasks']), 'tasks')).toBe(true);
    expect(featureOn(ws(['tasks']), 'orders')).toBe(false);
  });
  it('reads a list as any-of', () => {
    expect(featureOn(ws(['media']), ['files', 'media'])).toBe(true);
    expect(featureOn(ws(['files']), ['files', 'media'])).toBe(true);
    expect(featureOn(ws(['tasks']), ['files', 'media'])).toBe(false);
    expect(featureOn(ws([]), [])).toBe(true);
  });
  it('hands a list back for its path', () => {
    const items = [{ route: '/files', feature: ['files', 'media'] }];
    expect(featureForPath('/files/12', items)).toEqual(['files', 'media']);
  });
});

describe('workspaceGate', () => {
  const table: [Parameters<typeof workspaceGate>, string][] = [
    [['legacy', null, false], 'loading'],
    [['legacy', null, true], 'open'],
    [['legacy', ws([]), true], 'gated'],
    [['team', null, true], 'missing'],
    [['team', ws(['tasks']), true], 'gated'],
    [['team', null, false], 'loading'],
  ];
  it.each(table)('%j → %s', (args, want) => {
    expect(workspaceGate(...args)).toBe(want);
  });
});

describe('featureForPath', () => {
  const items = [
    { route: '/main', feature: 'analytics' },
    { route: '/tasks', feature: 'tasks' },
    { route: '/accounting', feature: 'accounting' },
    { route: '/orders', feature: 'orders' },
    { route: '/accounts', feature: 'core' },
    { route: '/ai-providers' },
  ];
  const table: [string, string][] = [
    ['/tasks', 'tasks'],
    ['/tasks/12', 'tasks'],
    ['/accounting/bank', 'accounting'],
    ['/accounts', 'core'],
    ['/orders/abc/invoice', 'orders'],
    ['/custom-orders', 'orders'],
    ['/add-tech-card', 'tech_cards'],
    ['/timeline/x', 'archive'],
    ['/people', 'core'],
    ['/ai-providers', ''],
    ['/', ''],
    ['/unknown', ''],
  ];
  it.each(table)('%s → %s', (path, want) => {
    expect(featureForPath(path, items)).toBe(want);
  });
});

describe('core nav items', () => {
  it('keeps accounts and dictionaries on whatever the team switches', async () => {
    const { ADMIN_GROUP } = await import('constants/routes');
    const core = ADMIN_GROUP.items.filter(
      (i) => i.label === 'accounts' || i.label === 'dictionaries',
    );
    expect(core).toHaveLength(2);
    for (const item of core) expect(featureOn(ws([]), item.feature)).toBe(true);
  });
});
