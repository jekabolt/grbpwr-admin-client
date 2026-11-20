import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  capChange,
  gb,
  storageOf,
  storagePct,
  storageText,
  canDelete,
  deleteRefusal,
  featureGroups,
  keptTillIfDeleted,
  keptWord,
  onCount,
  patchTeam,
  refusalWord,
  RETENTION_DAYS,
  seenWord,
  shownTab,
  splitBoard,
  tabCounts,
  teamOneSlug,
  usd,
  visibleDeleted,
  visibleRequests,
  visibleTeams,
  withFeature,
  withReadOnly,
} from './model';

const f = (key: string, group: string, extra: Partial<FeatureInfo> = {}): FeatureInfo => ({
  key,
  title: key,
  group,
  defaultOn: false,
  teamOneOnly: false,
  ...extra,
});
const t = (slug: string, extra: Partial<PlatformTeam> = {}): PlatformTeam => ({
  slug,
  name: slug,
  status: 'active',
  people: 1,
  createdAt: '2026-11-01T00:00:00Z',
  features: [],
  aiSpendMonthUsd: '0',
  aiUnpricedCallsMonth: 0,
  schemaOk: true,
  purgeAt: undefined,
  storageUsedBytes: 0,
  storageCapBytes: 0,
  storageCapDefault: true,
  ...extra,
});

const catalog = [
  f('orders', 'ops'),
  f('tasks', 'ops'),
  f('hero', 'catalog'),
  f('ai_providers', 'admin', { teamOneOnly: true }),
];

describe('splitBoard', () => {
  it('lists teams, queues review sign-ups, hides pending', () => {
    const b = splitBoard([
      t('a'),
      t('b', { status: 'review' }),
      t('c', { status: 'pending' }),
      t('d', { status: 'provisioning' }),
    ]);
    expect(b.teams.map((x) => x.slug)).toEqual(['a', 'd']);
    expect(b.requests.map((x) => x.slug)).toEqual(['b']);
    expect(b.deleted).toEqual([]);
  });
  it('keeps deleted teams apart, in the server order', () => {
    const b = splitBoard([
      t('a'),
      t('x', { status: 'deleted', purgeAt: '2026-12-19T00:00:00Z' }),
      t('w', { status: 'deleted', purgeAt: '2026-12-01T00:00:00Z' }),
    ]);
    expect(b.teams.map((x) => x.slug)).toEqual(['a']);
    expect(b.deleted.map((x) => x.slug)).toEqual(['x', 'w']);
    expect(tabCounts(b)).toEqual({ all: 1, active: 1, read_only: 0, requests: 0, deleted: 2 });
  });
});

describe('tabs', () => {
  const board = splitBoard([
    t('a'),
    t('b', { status: 'read_only' }),
    t('r1', { status: 'review' }),
    t('r2', { status: 'review' }),
    t('d1', { status: 'deleted' }),
    t('d2', { status: 'deleted' }),
    t('d3', { status: 'deleted' }),
    t('p', { status: 'pending' }),
  ]);
  it('counts all without requests and deleted teams', () => {
    expect(tabCounts(board)).toEqual({ all: 2, active: 1, read_only: 1, requests: 2, deleted: 3 });
  });
  it('the requests and deleted tabs list no live team', () => {
    for (const tab of ['requests', 'deleted'] as const)
      expect(visibleTeams(board.teams, { q: '', tab, sort: 'newest' })).toEqual([]);
  });
  it('requests show on every tab but deleted, whatever the search', () => {
    for (const tab of ['all', 'active', 'read_only', 'requests'] as const)
      expect(visibleRequests(board.requests, tab)).toHaveLength(2);
    expect(visibleRequests(board.requests, 'deleted')).toEqual([]);
  });
  it('the requests tab falls back to all once none wait', () => {
    expect(shownTab('requests', tabCounts(board))).toBe('requests');
    expect(shownTab('requests', tabCounts(splitBoard([t('a')])))).toBe('all');
    expect(shownTab('deleted', tabCounts(splitBoard([t('a')])))).toBe('deleted');
  });
});

describe('wipe date words', () => {
  it('reads as a date to come, never as the past', () => {
    expect(keptWord('2026-12-19T12:00:00Z')).toBe('kept till dec 19');
    expect(keptWord(undefined)).toBe('');
    expect(keptWord('junk')).toBe('');
  });
  it('the delete sheet says the day thirty days on', () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(keptTillIfDeleted(Date.parse('2026-11-19T12:00:00Z'))).toBe('dec 19');
  });
});

describe('delete and restore', () => {
  it('only a live team that is not team #1 can be deleted', () => {
    expect(canDelete(t('a'), false)).toBe(true);
    expect(canDelete(t('a', { status: 'read_only' }), false)).toBe(true);
    expect(canDelete(t('grbpwr'), true)).toBe(false);
    for (const status of ['provisioning', 'review', 'pending', 'deleted']) {
      expect(canDelete(t('a', { status }), false)).toBe(false);
    }
  });
  it('the deleted tab searches like the rest', () => {
    const gone = [t('golden-a', { name: 'golden a', status: 'deleted' }), t('vela')];
    expect(visibleDeleted(gone, '')).toHaveLength(2);
    expect(visibleDeleted(gone, 'GOLDEN').map((x) => x.slug)).toEqual(['golden-a']);
  });
  it('deleteRefusal maps the server answers', () => {
    const err = (message: string, status: number) => Object.assign(new Error(message), { status });
    expect(deleteRefusal(err('wrong_password', 403))).toBe('wrong password');
    expect(deleteRefusal(err('too many attempts', 429))).toBe('try later');
    expect(deleteRefusal(err('rpc error: ResourceExhausted', 500))).toBe('try later');
    expect(deleteRefusal(err('team_one', 400))).toBe('team one');
    expect(deleteRefusal(err('wrong_status', 400))).toBe('not deleted');
  });
});

describe('visibleTeams', () => {
  const rows = [
    t('ostra', { name: 'ostra', people: 3, createdAt: '2026-11-17T00:00:00Z' }),
    t('atelier-nord', {
      name: 'atelier nord',
      people: 2,
      status: 'read_only',
      createdAt: '2026-11-10T00:00:00Z',
    }),
    t('vela', { name: 'vela', people: 9, createdAt: '2026-11-18T00:00:00Z' }),
  ];
  it('searches slug and name', () => {
    expect(
      visibleTeams(rows, { q: 'NORD', tab: 'all', sort: 'newest' }).map((x) => x.slug),
    ).toEqual(['atelier-nord']);
    expect(visibleTeams(rows, { q: 'atelier-n', tab: 'all', sort: 'newest' })).toHaveLength(1);
  });
  it('filters by tab', () => {
    expect(
      visibleTeams(rows, { q: '', tab: 'read_only', sort: 'newest' }).map((x) => x.slug),
    ).toEqual(['atelier-nord']);
    expect(visibleTeams(rows, { q: '', tab: 'active', sort: 'newest' })).toHaveLength(2);
    expect(tabCounts(splitBoard(rows))).toMatchObject({ all: 3, active: 2, read_only: 1 });
  });
  it('sorts newest, name, people', () => {
    expect(visibleTeams(rows, { q: '', tab: 'all', sort: 'newest' }).map((x) => x.slug)).toEqual([
      'vela',
      'ostra',
      'atelier-nord',
    ]);
    expect(visibleTeams(rows, { q: '', tab: 'all', sort: 'name' }).map((x) => x.slug)).toEqual([
      'atelier-nord',
      'ostra',
      'vela',
    ]);
    expect(visibleTeams(rows, { q: '', tab: 'all', sort: 'people' }).map((x) => x.slug)).toEqual([
      'vela',
      'ostra',
      'atelier-nord',
    ]);
  });
});

describe('numbers and words', () => {
  it('usd: $0 for zero, two decimals otherwise', () => {
    expect(usd('0')).toBe('$0');
    expect(usd('')).toBe('$0');
    expect(usd(undefined)).toBe('$0');
    expect(usd('184.2')).toBe('$184.20');
  });
  it('seenWord', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(seenWord('2026-11-19T11:59:30Z', now)).toBe('now');
    expect(seenWord('2026-11-19T11:48:00Z', now)).toBe('12 min');
    expect(seenWord('2026-11-19T07:00:00Z', now)).toBe('5 h');
    expect(seenWord('2026-11-18T10:00:00Z', now)).toBe('yesterday');
    expect(seenWord(undefined, now)).toBe('—');
  });
  it('refusalWord maps server reasons', () => {
    expect(refusalWord(new Error('400 team_one_only'))).toBe('team one only');
    expect(refusalWord(new Error('400 team_one'))).toBe('team one');
    expect(refusalWord(new Error('boom'))).toBe('not saved');
  });
});

describe('features', () => {
  it('groups the catalog in order', () => {
    expect(featureGroups(catalog).map((g) => [g.group, g.items.length])).toEqual([
      ['ops', 2],
      ['catalog', 1],
      ['admin', 1],
    ]);
  });
  it('counts known switched-on features', () => {
    expect(onCount(t('a', { features: ['orders', 'gone'] }), catalog)).toBe(1);
  });
  it('team #1 is the one with a team-one-only feature', () => {
    expect(teamOneSlug([t('a'), t('grbpwr', { features: ['ai_providers'] })], catalog)).toBe(
      'grbpwr',
    );
    expect(teamOneSlug([t('a')], catalog)).toBe('');
  });
  it('flips one cell and back without touching others', () => {
    const rows = [t('a', { features: ['orders'] }), t('b', { features: ['orders'] })];
    const on = patchTeam(rows, 'a', (x) => withFeature(x, 'hero', true));
    expect(on[0].features).toEqual(['orders', 'hero']);
    expect(on[1]).toBe(rows[1]);
    const back = patchTeam(on, 'a', (x) => withFeature(x, 'hero', false));
    expect(back[0].features).toEqual(['orders']);
    expect(withReadOnly(t('a'), true).status).toBe('read_only');
    expect(withReadOnly(t('a', { status: 'read_only' }), false).status).toBe('active');
  });
});

describe('storage', () => {
  const G = 1024 ** 3;
  it('reads used / cap, also as int64 strings', () => {
    const s = storageOf({ storageUsedBytes: String(3.2 * G), storageCapBytes: 20 * G });
    expect(storageText(s)).toBe('3.2 / 20.0 gb');
    expect(s.full).toBe(false);
    expect(storageText(storageOf({ storageUsedBytes: 214.6 * G, storageCapBytes: 0 }))).toBe(
      '215 / ∞ gb',
    );
    expect(storageOf({ storageUsedBytes: 20 * G, storageCapBytes: 20 * G }).full).toBe(true);
    expect(storageOf({ storageUsedBytes: 20 * G, storageCapBytes: 0 }).full).toBe(false);
    expect(gb(0.21 * G)).toBe('0.21');
    expect(storagePct({ used: 5, cap: 10, full: false })).toBe(50);
  });
  it('cap control: number, no cap, empty = default', () => {
    expect(capChange('5', false)).toEqual({ capBytes: 5 * G });
    expect(capChange('0,5', false)).toEqual({ capBytes: G / 2 });
    expect(capChange('', false)).toEqual({ defaultCap: true });
    expect(capChange('7', true)).toEqual({ noCap: true });
    expect(capChange('0', false)).toBeNull();
    expect(capChange('x', false)).toBeNull();
  });
});
