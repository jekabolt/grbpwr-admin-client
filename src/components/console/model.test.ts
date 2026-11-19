import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  canDelete,
  deleteRefusal,
  featureGroups,
  onCount,
  patchTeam,
  refusalWord,
  seenWord,
  splitBoard,
  tabCounts,
  teamOneSlug,
  usd,
  visibleDeleted,
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
    expect(tabCounts(b.teams)).toEqual({ all: 1, active: 1, read_only: 0 });
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
  it('deleted teams show under all only, searched like the rest', () => {
    const gone = [t('golden-a', { name: 'golden a', status: 'deleted' }), t('vela')];
    expect(visibleDeleted(gone, { q: '', tab: 'all' })).toHaveLength(2);
    expect(visibleDeleted(gone, { q: 'GOLDEN', tab: 'all' }).map((x) => x.slug)).toEqual([
      'golden-a',
    ]);
    expect(visibleDeleted(gone, { q: '', tab: 'active' })).toEqual([]);
    expect(visibleDeleted(gone, { q: '', tab: 'read_only' })).toEqual([]);
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
    expect(tabCounts(rows)).toEqual({ all: 3, active: 2, read_only: 1 });
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
