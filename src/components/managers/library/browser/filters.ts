import {
  KIND_GROUPS,
  type KindGroup,
  type LibraryFilter,
  type LibraryKind,
  makeFilter,
} from '../api/types';

/** The rail's period rows. Each is a `createdFrom` day with an open end. */
export type PeriodKey = '7d' | '30d' | 'year';

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'year', label: 'this year' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** First day (UTC, inclusive) of a period ending today. */
export function periodFrom(key: PeriodKey, now: Date = new Date()): string {
  if (key === 'year') return `${now.getUTCFullYear()}-01-01`;
  const back = key === '7d' ? 6 : 29;
  return isoDay(new Date(now.getTime() - back * DAY_MS));
}

/** The preset a filter's dates match, if any (a hand-made range from the URL matches none). */
export function periodOf(f: LibraryFilter, now: Date = new Date()): PeriodKey | undefined {
  if (!f.createdFrom || f.createdTo) return undefined;
  return PERIODS.find((p) => periodFrom(p.key, now) === f.createdFrom)?.key;
}

export const GROUP_ORDER: KindGroup[] = ['pictures', 'video', 'documents'];

/** The kind groups a host's narrowing leaves on screen. */
export function visibleGroups(allowed: LibraryKind[] | undefined): KindGroup[] {
  if (!allowed?.length) return GROUP_ORDER;
  return GROUP_ORDER.filter((g) => KIND_GROUPS[g].some((k) => allowed.includes(k)));
}

export function groupOn(kinds: LibraryKind[], g: KindGroup): boolean {
  return KIND_GROUPS[g].every((k) => kinds.includes(k));
}

export function toggleGroup(kinds: LibraryKind[], g: KindGroup): LibraryKind[] {
  const group = KIND_GROUPS[g];
  if (groupOn(kinds, g)) return kinds.filter((k) => !group.includes(k));
  return [...new Set([...kinds, ...group])];
}

/** How many filter groups narrow the list (search and folder not counted). */
export function activeCount(f: LibraryFilter): number {
  return [
    f.kinds.length > 0,
    !!f.usage,
    f.uploadedById > 0,
    !!(f.createdFrom || f.createdTo),
    f.projectTopicId > 0,
    f.topicIds.length > 0,
    f.ratios.length > 0,
  ].filter(Boolean).length;
}

/** Every filter group and the search off; the folder and the host's fields stay. */
export function clearFilters(f: LibraryFilter): LibraryFilter {
  return makeFilter({
    accept: f.accept,
    sources: f.sources,
    folderId: f.folderId,
    noFolder: f.noFolder,
  });
}

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
