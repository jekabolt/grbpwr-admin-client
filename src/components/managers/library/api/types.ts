import type {
  LibraryFolder,
  LibraryItem,
  LibraryItemFilter,
  LibraryItemRef,
  LibraryKind,
  LibrarySort,
  LibrarySource,
} from 'api/proto-http/admin';

export type { LibraryFolder, LibraryItem, LibraryKind };

/** Which table a row lives in. Media id 7 and file id 7 are two different rows. */
export type LibrarySourceKey = 'media' | 'file';

/** The row key of the unified library on the client. */
export type LibraryRef = { source: LibrarySourceKey; id: number };

/** String form of a ref, for maps, sets and React keys: `m:12` | `f:7`. */
export type RefKey = `m:${number}` | `f:${number}`;

export function refKey(ref: LibraryRef): RefKey {
  return ref.source === 'media' ? `m:${ref.id}` : `f:${ref.id}`;
}

export function parseRefKey(key: string): LibraryRef | undefined {
  const m = /^([mf]):(\d+)$/.exec(key);
  if (!m) return undefined;
  const id = Number(m[2]);
  if (!id) return undefined;
  return { source: m[1] === 'm' ? 'media' : 'file', id };
}

export function sameRef(a: LibraryRef, b: LibraryRef): boolean {
  return a.source === b.source && a.id === b.id;
}

export function sourceToPb(source: LibrarySourceKey): LibrarySource {
  return source === 'media' ? 'LIBRARY_SOURCE_MEDIA' : 'LIBRARY_SOURCE_FILE';
}

export function sourceFromPb(source: LibrarySource | undefined): LibrarySourceKey | undefined {
  if (source === 'LIBRARY_SOURCE_MEDIA') return 'media';
  if (source === 'LIBRARY_SOURCE_FILE') return 'file';
  return undefined;
}

export function refToPb(ref: LibraryRef): LibraryItemRef {
  return { source: sourceToPb(ref.source), id: ref.id };
}

export function refFromPb(ref: LibraryItemRef | undefined): LibraryRef | undefined {
  const source = sourceFromPb(ref?.source);
  const id = ref?.id ?? 0;
  if (!source || !id) return undefined;
  return { source, id };
}

/** The ref of a list row; undefined for a malformed row (no source or id). */
export function refOf(item: LibraryItem): LibraryRef | undefined {
  return refFromPb(item.ref);
}

/** The kind chips of the toolbar. Vector and 3D sit inside pictures as a refinement. */
export type KindGroup = 'pictures' | 'video' | 'documents';

export const KIND_GROUPS: Record<KindGroup, LibraryKind[]> = {
  pictures: ['LIBRARY_KIND_IMAGE', 'LIBRARY_KIND_VECTOR', 'LIBRARY_KIND_MODEL'],
  video: ['LIBRARY_KIND_VIDEO'],
  documents: ['LIBRARY_KIND_DOCUMENT'],
};

export const ALL_KINDS: LibraryKind[] = [
  'LIBRARY_KIND_IMAGE',
  'LIBRARY_KIND_VIDEO',
  'LIBRARY_KIND_VECTOR',
  'LIBRARY_KIND_MODEL',
  'LIBRARY_KIND_DOCUMENT',
];

/** The short word for a kind (tile caption of a nameless media row). */
export const KIND_WORD: Record<LibraryKind, string> = {
  LIBRARY_KIND_UNSPECIFIED: 'file',
  LIBRARY_KIND_IMAGE: 'image',
  LIBRARY_KIND_VIDEO: 'video',
  LIBRARY_KIND_VECTOR: 'vector',
  LIBRARY_KIND_MODEL: '3d',
  LIBRARY_KIND_DOCUMENT: 'document',
};

export type LibraryAcceptKey = 'visual' | 'any';
export type LibraryUsageKey = 'used' | 'free';
export type LibrarySortKey = 'new' | 'old' | 'name' | 'size';

export const DEFAULT_SORT: LibrarySortKey = 'new';

/**
 * The client shape of the server filter (proto `LibraryItemFilter`).
 *
 * - `0` / `''` / `[]` mean "not set", as on the wire.
 * - `createdFrom` / `createdTo` are calendar days `YYYY-MM-DD` (UTC), both INCLUSIVE.
 *   `toPbFilter` turns `createdTo` into the next day's midnight, because the server range is
 *   `[from, to)`.
 * - `ratios`: server keys such as `4:5`, or `other`.
 */
export type LibraryFilter = {
  kinds: LibraryKind[];
  accept: LibraryAcceptKey;
  sources: LibrarySourceKey[];
  folderId: number;
  noFolder: boolean;
  includeSubfolders: boolean;
  search: string;
  projectTopicId: number;
  topicIds: number[];
  uploadedById: number;
  createdFrom: string;
  createdTo: string;
  usage: LibraryUsageKey | undefined;
  ratios: string[];
};

export const EMPTY_FILTER: LibraryFilter = {
  kinds: [],
  accept: 'any',
  sources: [],
  folderId: 0,
  noFolder: false,
  includeSubfolders: false,
  search: '',
  projectTopicId: 0,
  topicIds: [],
  uploadedById: 0,
  createdFrom: '',
  createdTo: '',
  usage: undefined,
  ratios: [],
};

export function makeFilter(partial?: Partial<LibraryFilter>): LibraryFilter {
  return { ...EMPTY_FILTER, ...(partial ?? {}) };
}

const SORT_TO_PB: Record<LibrarySortKey, LibrarySort> = {
  new: 'LIBRARY_SORT_NEW',
  old: 'LIBRARY_SORT_OLD',
  name: 'LIBRARY_SORT_NAME',
  size: 'LIBRARY_SORT_SIZE',
};

export function toPbSort(sort: LibrarySortKey): LibrarySort {
  return SORT_TO_PB[sort];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → RFC 3339 midnight UTC; `''` for anything else. */
function dayStart(day: string): string {
  if (!DAY_RE.test(day)) return '';
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

/** The midnight after `day`: the exclusive end of an inclusive last day. */
function dayAfter(day: string): string {
  const start = dayStart(day);
  if (!start) return '';
  return new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
}

export function toPbFilter(f: LibraryFilter): LibraryItemFilter {
  const from = dayStart(f.createdFrom);
  const to = dayAfter(f.createdTo);
  return {
    kinds: f.kinds.length ? f.kinds : undefined,
    accept: f.accept === 'visual' ? 'LIBRARY_ACCEPT_VISUAL' : 'LIBRARY_ACCEPT_ANY',
    sources: f.sources.length ? f.sources.map(sourceToPb) : undefined,
    folderId: f.noFolder ? undefined : f.folderId || undefined,
    noFolder: f.noFolder || undefined,
    includeSubfolders: (!f.noFolder && f.folderId > 0 && f.includeSubfolders) || undefined,
    search: f.search.trim() || undefined,
    projectTopicId: f.projectTopicId || undefined,
    topicIds: f.topicIds.length ? f.topicIds : undefined,
    uploadedById: f.uploadedById || undefined,
    createdFrom: from || undefined,
    createdTo: to || undefined,
    usage:
      f.usage === 'used'
        ? 'LIBRARY_USAGE_USED'
        : f.usage === 'free'
          ? 'LIBRARY_USAGE_FREE'
          : undefined,
    ratios: f.ratios.length ? f.ratios : undefined,
  };
}

/**
 * A canonical, order-free copy of the filter: the query-key part. Two filters that ask the
 * server the same question give equal keys.
 */
export function canonicalFilter(f: LibraryFilter): LibraryFilter {
  const num = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
  const str = <T extends string>(a: T[]) => [...new Set(a)].sort() as T[];
  return {
    kinds: str(f.kinds),
    accept: f.accept,
    sources: str(f.sources),
    folderId: f.noFolder ? 0 : f.folderId,
    noFolder: f.noFolder,
    includeSubfolders: !f.noFolder && f.folderId > 0 && f.includeSubfolders,
    search: f.search.trim(),
    projectTopicId: f.projectTopicId,
    topicIds: num(f.topicIds),
    uploadedById: f.uploadedById,
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
    usage: f.usage,
    ratios: str(f.ratios),
  };
}

/** The same filter with the folder fields cleared (folders and facets of the rail ignore them). */
export function withoutFolder(f: LibraryFilter): LibraryFilter {
  return { ...f, folderId: 0, noFolder: false, includeSubfolders: false };
}
