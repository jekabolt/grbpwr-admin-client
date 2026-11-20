import { describe, expect, it } from 'vitest';
import { KIND_GROUPS, canonicalFilter, makeFilter, toPbFilter } from '../api/types';
import { decodeUrlFilter, encodeUrlFilter } from '../api/url-filter';
import { acceptsFile, engineOf } from '../upload/route';
import {
  activeCount,
  clearFilters,
  groupOn,
  periodFrom,
  periodOf,
  toggleGroup,
  toggleIn,
} from './filters';

const NOW = new Date('2026-11-20T15:00:00Z');

describe('periods', () => {
  it('starts each period on a UTC day, inclusive', () => {
    expect(periodFrom('7d', NOW)).toBe('2026-11-14');
    expect(periodFrom('30d', NOW)).toBe('2026-10-22');
    expect(periodFrom('year', NOW)).toBe('2026-01-01');
  });
  it('reads the period back only when the range is exactly one', () => {
    expect(periodOf(makeFilter({ createdFrom: '2026-11-14' }), NOW)).toBe('7d');
    expect(periodOf(makeFilter({ createdFrom: '2026-11-13' }), NOW)).toBeUndefined();
    expect(
      periodOf(makeFilter({ createdFrom: '2026-11-14', createdTo: '2026-11-15' }), NOW),
    ).toBeUndefined();
  });
});

describe('filter helpers', () => {
  it('toggles a kind group as a whole', () => {
    const on = toggleGroup([], 'pictures');
    expect(groupOn(on, 'pictures')).toBe(true);
    expect(groupOn(toggleGroup(on, 'pictures'), 'pictures')).toBe(false);
    expect(on).toEqual(expect.arrayContaining(KIND_GROUPS.pictures));
  });
  it('counts and clears filters but keeps the folder', () => {
    const f = makeFilter({
      folderId: 7,
      usage: 'free',
      uploadedById: 3,
      ratios: ['4:5'],
      search: 'look',
    });
    expect(activeCount(f)).toBe(3);
    const c = clearFilters(f);
    expect(c.folderId).toBe(7);
    expect(activeCount(c)).toBe(0);
    expect(c.search).toBe('');
  });
  it('toggles a value in a list', () => {
    expect(toggleIn([1, 2], 2)).toEqual([1]);
    expect(toggleIn([1], 2)).toEqual([1, 2]);
  });
});

describe('url codec', () => {
  it('round-trips the filter and keeps foreign keys', () => {
    const f = makeFilter({
      kinds: KIND_GROUPS.pictures,
      folderId: 12,
      search: 'ss27',
      uploadedById: 4,
      createdFrom: '2026-11-14',
      usage: 'used',
      access: 'private',
      ratios: ['4:5'],
    });
    const p = encodeUrlFilter(f, 'name', new URLSearchParams('tab=x'));
    expect(p.get('tab')).toBe('x');
    const back = decodeUrlFilter(p);
    expect(back.sort).toBe('name');
    expect(makeFilter(back.filter)).toEqual(f);
  });
  it('reads the old media redirect', () => {
    const { filter } = decodeUrlFilter(new URLSearchParams('kind=pictures,video'));
    expect(groupOn(filter.kinds ?? [], 'pictures')).toBe(true);
    expect(groupOn(filter.kinds ?? [], 'video')).toBe(true);
    expect(groupOn(filter.kinds ?? [], 'documents')).toBe(false);
  });
  it('writes nothing for the default filter', () => {
    expect(encodeUrlFilter(makeFilter(), 'new').toString()).toBe('');
  });
});

describe('upload routing', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });
  it('sends pictures to media and the rest to files', () => {
    expect(engineOf(file('a.jpg', 'image/jpeg'))).toBe('media');
    expect(engineOf(file('a.svg', 'image/svg+xml'))).toBe('media');
    expect(engineOf(file('a.pdf', 'application/pdf'))).toBe('file');
    expect(engineOf(file('a.jpg', 'image/jpeg'), 'document')).toBe('file');
  });
  it('refuses documents in a visual host', () => {
    expect(acceptsFile(file('a.pdf', 'application/pdf'), 'visual')).toBe(false);
    expect(acceptsFile(file('a.pdf', 'application/pdf'), 'any')).toBe(true);
  });
});

describe('access filter', () => {
  it('reads and writes the url key, ignoring unknown values', () => {
    const p = encodeUrlFilter(makeFilter({ access: 'public' }), 'new');
    expect(p.get('access')).toBe('public');
    expect(decodeUrlFilter(p).filter.access).toBe('public');
    expect(decodeUrlFilter(new URLSearchParams('access=team')).filter.access).toBeUndefined();
    expect(encodeUrlFilter(makeFilter(), 'new').has('access')).toBe(false);
  });
  it('sends the enum name and leaves it out when off', () => {
    expect(toPbFilter(makeFilter({ access: 'private' })).access).toBe('LIBRARY_ACCESS_PRIVATE');
    expect(toPbFilter(makeFilter({ access: 'public' })).access).toBe('LIBRARY_ACCESS_PUBLIC');
    expect(toPbFilter(makeFilter()).access).toBeUndefined();
  });
  it('counts as a filter, is cleared, and keys the query', () => {
    const f = makeFilter({ access: 'private' });
    expect(activeCount(f)).toBe(1);
    expect(clearFilters(f).access).toBeUndefined();
    expect(canonicalFilter(f)).not.toEqual(canonicalFilter(makeFilter()));
  });
});
