import {
  DEFAULT_SORT,
  KIND_GROUPS,
  type LibraryFilter,
  type LibraryKind,
  type LibrarySortKey,
} from './types';

/**
 * URL codec of the library filter. Keys:
 * kind, folder, nofolder, q, project, topic, by, from, to, use, ratio, sort.
 *
 * - `kind`: comma list of `pictures`, `video`, `documents` (groups) or the refinements `image`,
 *   `vector`, `model`. `/files?kind=pictures,video` is the old media screen's redirect.
 * - `topic`, `ratio`: comma lists. `from`, `to`: `YYYY-MM-DD`, both inclusive.
 * - `accept`, `sources` and `includeSubfolders` are host props, not URL state.
 * - Defaults are never written, so an empty filter is an empty query string.
 */

const KIND_TOKENS: Record<string, LibraryKind[]> = {
  pictures: KIND_GROUPS.pictures,
  video: KIND_GROUPS.video,
  documents: KIND_GROUPS.documents,
  image: ['LIBRARY_KIND_IMAGE'],
  vector: ['LIBRARY_KIND_VECTOR'],
  model: ['LIBRARY_KIND_MODEL'],
};

const SINGLE_TOKEN: Partial<Record<LibraryKind, string>> = {
  LIBRARY_KIND_IMAGE: 'image',
  LIBRARY_KIND_VIDEO: 'video',
  LIBRARY_KIND_VECTOR: 'vector',
  LIBRARY_KIND_MODEL: 'model',
  LIBRARY_KIND_DOCUMENT: 'documents',
};

const SORTS: LibrarySortKey[] = ['new', 'old', 'name', 'size'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATIO_RE = /^(\d+:\d+|other)$/;

function list(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function posInt(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function decodeKinds(value: string | null): LibraryKind[] {
  const out = new Set<LibraryKind>();
  for (const token of list(value)) {
    for (const k of KIND_TOKENS[token.toLowerCase()] ?? []) out.add(k);
  }
  return [...out];
}

export function encodeKinds(kinds: LibraryKind[]): string {
  const rest = new Set(kinds);
  const tokens: string[] = [];
  if (KIND_GROUPS.pictures.every((k) => rest.has(k))) {
    tokens.push('pictures');
    KIND_GROUPS.pictures.forEach((k) => rest.delete(k));
  }
  for (const k of rest) {
    const token = SINGLE_TOKEN[k];
    if (token) tokens.push(token);
  }
  return tokens.join(',');
}

/** Reads the filter part of the URL. Only keys present in the URL appear in the result. */
export function decodeUrlFilter(params: URLSearchParams): {
  filter: Partial<LibraryFilter>;
  sort: LibrarySortKey;
} {
  const filter: Partial<LibraryFilter> = {};
  const kinds = decodeKinds(params.get('kind'));
  if (kinds.length) filter.kinds = kinds;
  if (params.get('nofolder') === '1') filter.noFolder = true;
  else {
    const folderId = posInt(params.get('folder'));
    if (folderId) filter.folderId = folderId;
  }
  const q = (params.get('q') ?? '').trim();
  if (q) filter.search = q;
  const project = posInt(params.get('project'));
  if (project) filter.projectTopicId = project;
  const topics = list(params.get('topic')).map(posInt).filter(Boolean);
  if (topics.length) filter.topicIds = topics;
  const by = posInt(params.get('by'));
  if (by) filter.uploadedById = by;
  const from = params.get('from') ?? '';
  if (DAY_RE.test(from)) filter.createdFrom = from;
  const to = params.get('to') ?? '';
  if (DAY_RE.test(to)) filter.createdTo = to;
  const use = params.get('use');
  if (use === 'used' || use === 'free') filter.usage = use;
  const ratios = list(params.get('ratio')).filter((r) => RATIO_RE.test(r));
  if (ratios.length) filter.ratios = ratios;
  const rawSort = params.get('sort') as LibrarySortKey | null;
  const sort = rawSort && SORTS.includes(rawSort) ? rawSort : DEFAULT_SORT;
  return { filter, sort };
}

const FILTER_KEYS = [
  'kind',
  'folder',
  'nofolder',
  'q',
  'project',
  'topic',
  'by',
  'from',
  'to',
  'use',
  'ratio',
  'sort',
] as const;

/**
 * Writes the filter into `base` (a copy; other keys survive). Keys of the codec that the filter
 * leaves at default are removed.
 */
export function encodeUrlFilter(
  filter: LibraryFilter,
  sort: LibrarySortKey,
  base?: URLSearchParams,
): URLSearchParams {
  const p = new URLSearchParams(base);
  FILTER_KEYS.forEach((k) => p.delete(k));
  const kind = encodeKinds(filter.kinds);
  if (kind) p.set('kind', kind);
  if (filter.noFolder) p.set('nofolder', '1');
  else if (filter.folderId > 0) p.set('folder', String(filter.folderId));
  if (filter.search.trim()) p.set('q', filter.search.trim());
  if (filter.projectTopicId > 0) p.set('project', String(filter.projectTopicId));
  if (filter.topicIds.length) p.set('topic', filter.topicIds.join(','));
  if (filter.uploadedById > 0) p.set('by', String(filter.uploadedById));
  if (DAY_RE.test(filter.createdFrom)) p.set('from', filter.createdFrom);
  if (DAY_RE.test(filter.createdTo)) p.set('to', filter.createdTo);
  if (filter.usage) p.set('use', filter.usage);
  if (filter.ratios.length) p.set('ratio', filter.ratios.join(','));
  if (sort !== DEFAULT_SORT) p.set('sort', sort);
  return p;
}
