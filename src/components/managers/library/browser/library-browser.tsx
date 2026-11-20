import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useFilesMutations } from 'components/managers/files/hooks/useFiles';
import {
  downloadMediaOriginals,
  useDeleteManyMedia,
} from 'components/managers/media/utils/useMediaQuery';
import { useIsMobile } from 'components/managers/media/utils/useIsMobile';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import {
  MediaViewer,
  mediaFullListToViewerItems,
  useMediaViewer,
} from 'components/shared/media-viewer/media-viewer';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  DateScrubber,
  GroupLabel,
  Input,
  Loader,
  Placeholder,
  Progress,
  Text,
  Tile,
  Tiles,
  Toolbar,
  ToolbarSpacer,
  ViewSwitch,
  type ScrubMonth,
  useMonthIndex,
} from 'ui';
import {
  DEFAULT_SORT,
  KIND_GROUPS,
  type KindGroup,
  type LibraryFilter,
  type LibraryItem,
  type LibraryKind,
  type LibraryRef,
  type LibrarySortKey,
  type RefKey,
  makeFilter,
  refKey,
  refOf,
  withoutFolder,
} from '../api/types';
import { decodeUrlFilter, encodeUrlFilter } from '../api/url-filter';
import { ItemRow } from '../components/item-row';
import { ItemThumb } from '../components/item-thumb';
import { useLibraryFacets } from '../hooks/useLibraryFacets';
import { type FolderNode } from '../hooks/useLibraryFolders';
import { useLibraryFolders } from '../hooks/useLibraryFolders';
import { useLibraryItems } from '../hooks/useLibraryItems';
import { invalidateLibrary, useLibraryMutations } from '../hooks/useLibraryMutations';
import { acceptsFile } from '../upload/route';
import { useLibraryUpload } from '../upload/use-library-upload';
import { DeleteDialog, MoveDialog } from './dialogs';
import { FilterChips, PhoneFilterChips, useFilterGroups } from './filter-chips';
import { activeCount, clearFilters, groupOn, visibleGroups } from './filters';
import {
  DoorTile,
  FolderTile,
  type FolderLoc,
  NewFolderTile,
  deepCount,
  folderErrorWord,
  locOf,
} from './folders';
import { Headline } from './headline';

/**
 * The contract between the library page (C1) and the pickers (C2). Frozen in P0 (02-DESIGN §6):
 * C1 may add optional props only.
 */
export type LibraryBrowserProps = {
  mode: 'page' | 'pick';
  accept: 'visual' | 'any';
  kinds?: LibraryKind[]; // field narrowing (showVideos=false, vectorOnly, allowSvg=false)
  sources?: Array<'media' | 'file'>; // notes and label pickers: ['file']
  multiple: boolean;
  selected: LibraryRef[]; // controlled
  onSelectionChange: (refs: LibraryRef[], items: LibraryItem[]) => void;
  onOpen?: (item: LibraryItem) => void;
  targetRatios?: number[]; // same meaning as MediaManager's prop today
  onFilesPicked?: (files: File[]) => void; // if set, drops/picks/paste go to the host (MediaSelector crop path), not the queue
  initialFilter?: Partial<LibraryFilter>;
  filterInUrl?: boolean; // page: true; pick: false
  scrollEl?: HTMLElement | null; // picker dialog scroll container (virtual scroll on coarse pointers)
  /** C1: every loaded row, in list order, whenever it changes (the page's media viewer pages them). */
  onItemsChange?: (items: LibraryItem[]) => void;
  /** C1 for C2: a 1–2 word problem on a tile («not copied»). */
  errors?: Partial<Record<RefKey, string>>;
  /** C1 for C2: tiles being worked on (a copy runs): dimmed, «copying». */
  busyKeys?: RefKey[];
  /** C1 for C2: client-side narrowing of the loaded rows (e.g. printable only). */
  itemFilter?: (item: LibraryItem) => boolean;
  /** Page: the section's other doors (note, topics, shared, projects) on the headline row. */
  headlineTools?: ReactNode;
};

const SEARCH_DEBOUNCE_MS = 300;
/** The app shell's sticky top bar on the phone: the scrubber pill stays under it. */
const SHELL_BAR = 56;
const NO_MONTHS: ScrubMonth[] = [];

type ViewKey = 'grid' | 'list';
const VIEW_KEY = 'library.view';
const SORTS: { value: LibrarySortKey; label: string }[] = [
  { value: 'new', label: 'new' },
  { value: 'old', label: 'old' },
  { value: 'name', label: 'name' },
  { value: 'size', label: 'size' },
];
const VIEWS: { value: ViewKey; label: string }[] = [
  { value: 'grid', label: 'grid' },
  { value: 'list', label: 'list' },
];

function readView(): ViewKey {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function writeView(v: ViewKey) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private window: the view simply is not remembered */
  }
}

/** The host's field narrowing wins: a URL or initial kind outside it is dropped. */
function narrowKinds(asked: LibraryKind[], allowed: LibraryKind[] | undefined): LibraryKind[] {
  if (!allowed?.length) return asked;
  if (!asked.length) return allowed;
  const both = asked.filter((k) => allowed.includes(k));
  return both.length ? both : allowed;
}

/** Files of a drop; a dropped folder is refused, as everywhere else in the app. */
function droppedFiles(dt: DataTransfer): { files: File[]; folders: number } {
  const items = Array.from(dt.items ?? []);
  let folders = 0;
  const files: File[] = [];
  if (!items.length) return { files: Array.from(dt.files ?? []), folders };
  for (const item of items) {
    if (item.kind !== 'file') continue;
    if (item.webkitGetAsEntry?.()?.isDirectory) {
      folders += 1;
      continue;
    }
    const f = item.getAsFile();
    if (f) files.push(f);
  }
  return { files, folders };
}

function saveFile(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The unified library: folder rail, server filters, sort and view, the grid, selection, upload.
 * `page` adds the path headline, select mode with move / download / delete, and folder edits;
 * `pick` is the same browser inside a picker (filters in local state, clicks select).
 */
export function LibraryBrowser({
  mode,
  accept,
  kinds,
  sources,
  multiple,
  selected,
  onSelectionChange,
  onOpen,
  targetRatios,
  onFilesPicked,
  initialFilter,
  filterInUrl = false,
  scrollEl,
  onItemsChange,
  errors,
  busyKeys,
  itemFilter,
  headlineTools,
}: LibraryBrowserProps) {
  const page = mode === 'page';
  const phone = useIsMobile();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const { canWrite } = usePermissions();
  const mayWrite = canWrite(SECTION.media) || canWrite(SECTION.files);
  const [params, setParams] = useSearchParams();

  // ---- filter state: the URL on the page, local in a picker ----
  const fromUrl = useCallback(
    (p: URLSearchParams) => {
      const u = filterInUrl ? decodeUrlFilter(p) : { filter: {}, sort: DEFAULT_SORT };
      return { filter: makeFilter({ ...initialFilter, ...u.filter }), sort: u.sort };
    },
    [filterInUrl, initialFilter],
  );
  const [state, setState] = useState(() => fromUrl(params));
  const [search, setSearch] = useState(state.filter.search);
  const lastWritten = useRef(params.toString());

  useEffect(() => {
    const t = window.setTimeout(() => {
      setState((s) => (s.filter.search === search ? s : { ...s, filter: { ...s.filter, search } }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  // A link, the menu or «back» changed the URL under the browser: read it again.
  useEffect(() => {
    if (!filterInUrl) return;
    const now = params.toString();
    if (now === lastWritten.current) return;
    lastWritten.current = now;
    const next = fromUrl(params);
    setState(next);
    setSearch(next.filter.search);
  }, [filterInUrl, params, fromUrl]);

  useEffect(() => {
    if (!filterInUrl) return;
    const next = encodeUrlFilter(state.filter, state.sort, params);
    const str = next.toString();
    if (str === params.toString()) return;
    lastWritten.current = str;
    setParams(next, { replace: true });
  }, [filterInUrl, state, params, setParams]);

  const setFilter = useCallback((next: LibraryFilter) => {
    setState((s) => ({ ...s, filter: next }));
    setSearch((q) => (next.search !== q ? next.search : q));
  }, []);
  const setSort = (sort: LibrarySortKey) => setState((s) => ({ ...s, sort }));
  const [view, setViewState] = useState<ViewKey>(readView);
  const setView = (v: ViewKey) => {
    setViewState(v);
    writeView(v);
  };

  const kindsKey = (kinds ?? []).join(',');
  const sourcesKey = (sources ?? []).join(',');
  const narrowed = activeCount(state.filter) > 0 || !!state.filter.search.trim();
  const loc = locOf(state.filter);
  // The rows a filter or a search can reach: everything at the top, the folder and its
  // subfolders inside one. Facets count over this scope.
  const deepFilter = useMemo(
    () =>
      makeFilter({
        ...state.filter,
        accept,
        kinds: narrowKinds(state.filter.kinds, kinds),
        sources: sources?.length ? sources : state.filter.sources,
        includeSubfolders: state.filter.folderId > 0,
      }),
    // `kinds` / `sources` arrive as fresh literals from hosts; their content is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.filter, accept, kindsKey, sourcesKey],
  );
  // The listed rows. Unnarrowed, a place shows its own rows (the top: unfiled) under its folder
  // tiles; a filter or a search lists every match in the scope, folders included.
  const filter = useMemo(
    () =>
      narrowed
        ? deepFilter
        : makeFilter({
            ...deepFilter,
            noFolder: deepFilter.noFolder || loc === 'all',
            includeSubfolders: false,
          }),
    [deepFilter, narrowed, loc],
  );
  const sort = state.sort;

  // ---- data ----
  const list = useLibraryItems(filter, sort);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const items = useMemo(
    () => (itemFilter ? list.items.filter(itemFilter) : list.items),
    [list.items, itemFilter],
  );
  const busySet = useMemo(() => new Set(busyKeys ?? []), [busyKeys]);
  const facets = useLibraryFacets(deepFilter).data;
  // The scrubber indexes the listed rows, so its months come from the list's own filter.
  const listFacets = useLibraryFacets(filter).data;
  const months = listFacets?.months ?? NO_MONTHS;
  const folderFilter = useMemo(() => withoutFolder(filter), [filter]);
  const folders = useLibraryFolders(folderFilter);
  const { tree, byId } = folders;
  const mutations = useLibraryMutations();
  const deleteMedia = useDeleteManyMedia();
  const { deleteFile } = useFilesMutations();

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  const groups = useFilterGroups({
    filter: state.filter,
    onChange: setFilter,
    facets,
    allowedKinds: kinds,
    showFileGroups: accept === 'any' && (!sources?.length || sources.includes('file')),
  });

  // ---- selection ----
  const known = useRef(new Map<RefKey, LibraryItem>());
  useEffect(() => {
    for (const item of items) {
      const ref = refOf(item);
      if (ref) known.current.set(refKey(ref), item);
    }
  }, [items]);
  const selectedKeys = useMemo(() => new Set(selected.map(refKey)), [selected]);
  const emit = useCallback(
    (refs: LibraryRef[]) => {
      const picked = refs
        .map((r) => known.current.get(refKey(r)))
        .filter((i): i is LibraryItem => !!i);
      onSelectionChange(refs, picked);
    },
    [onSelectionChange],
  );
  const toggle = useCallback(
    (item: LibraryItem) => {
      const ref = refOf(item);
      if (!ref) return;
      const key = refKey(ref);
      known.current.set(key, item);
      if (!multiple) {
        emit(selectedKeys.has(key) ? [] : [ref]);
        return;
      }
      emit(selectedKeys.has(key) ? selected.filter((r) => refKey(r) !== key) : [...selected, ref]);
    },
    [multiple, selected, selectedKeys, emit],
  );
  const [selecting, setSelecting] = useState(false);
  const exitSelect = () => {
    setSelecting(false);
    emit([]);
  };
  const handleClick = (item: LibraryItem) => {
    if (page && !selecting && onOpen) onOpen(item);
    else toggle(item);
  };
  // Pick mode: «open» on a tile previews it without choosing it (host's onOpen, else our viewer).
  const viewer = useMediaViewer();
  const viewerMedia = useMemo(() => items.flatMap((i) => (i.media ? [i.media] : [])), [items]);
  const viewerItems = useMemo(() => mediaFullListToViewerItems(viewerMedia), [viewerMedia]);
  const preview = (item: LibraryItem) => {
    if (onOpen) return onOpen(item);
    if (item.media) {
      const at = viewerItems.findIndex((v) => v.meta?.id === item.media?.id);
      if (at >= 0) viewer.openAt(at);
      return;
    }
    const url = item.file?.previewUrl || item.file?.downloadUrl || item.file?.url;
    if (url) saveFile(url);
  };
  const selectedItems = selected
    .map((r) => known.current.get(refKey(r)))
    .filter((i): i is LibraryItem => !!i);

  // ---- upload ----
  const uploader = useLibraryUpload({ folderId: typeof loc === 'number' ? loc : 0 });
  const canUpload = !!onFilesPicked || mayWrite;
  const pickerRef = useRef<HTMLInputElement>(null);
  const intake = useCallback(
    (files: File[], folders = 0) => {
      if (folders) showMessage('no folders', 'error');
      const ok = files.filter((f) => acceptsFile(f, accept));
      if (ok.length < files.length) showMessage(`${files.length - ok.length} refused`, 'error');
      if (!ok.length) return;
      if (onFilesPicked) onFilesPicked(ok);
      else if (mayWrite) void uploader.upload(ok);
    },
    [accept, onFilesPicked, mayWrite, uploader, showMessage],
  );
  usePasteFiles({ claims: page, accept: accept === 'visual' ? 'media+svg' : 'any' }, (files) =>
    intake(files),
  );
  const [dragOver, setDragOver] = useState(false);
  const dropProps = canUpload
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const { files, folders: dirs } = droppedFiles(e.dataTransfer);
          intake(files, dirs);
        },
      }
    : {};
  const openPicker = () => pickerRef.current?.click();

  // ---- infinite scroll ----
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinel || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollEl ?? null, rootMargin: '600px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, scrollEl, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---- scrubber (touch only; the primitive renders nothing on a fine pointer) ----
  const gridRef = useRef<HTMLDivElement>(null);
  const scroller: HTMLElement | null = page
    ? ((typeof document !== 'undefined' ? document.scrollingElement : null) as HTMLElement | null)
    : scrollEl ?? null;
  const insetTop = page && phone ? SHELL_BAR : 0;
  const monthIndex = useMonthIndex(months);
  const viewTop = useCallback(
    () =>
      !scroller || scroller === document.scrollingElement
        ? 0
        : scroller.getBoundingClientRect().top,
    [scroller],
  );
  const tiles = () =>
    Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-offset]') ?? []);
  const labelAt = () => {
    const top = viewTop() + insetTop;
    const el = tiles().find((e) => e.getBoundingClientRect().bottom > top);
    return monthIndex.monthAt(el ? Number(el.dataset.offset) : 0);
  };
  const offsetToScrollTop = (offset: number) => {
    const els = tiles();
    if (!els.length || !scroller) return 0;
    const first = els[0].getBoundingClientRect();
    const cols = Math.max(
      1,
      els.filter((e) => Math.abs(e.getBoundingClientRect().top - first.top) < 2).length,
    );
    const next = els[cols]?.getBoundingClientRect();
    const rowH = next ? next.top - first.top : first.height;
    const base = first.top - viewTop() + scroller.scrollTop;
    return Math.max(0, base + Math.floor(offset / cols) * rowH - insetTop);
  };

  // ---- folder and item actions ----
  const go = (next: FolderLoc) =>
    setFilter({
      ...state.filter,
      folderId: typeof next === 'number' ? next : 0,
      noFolder: next === 'unfiled',
    });
  const createFolder = mayWrite
    ? (name: string) =>
        mutations.createFolder.mutateAsync({
          parentId: typeof loc === 'number' ? loc : 0,
          name,
        })
    : undefined;
  const [moving, setMoving] = useState<{ folder?: FolderNode } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const moveTo = async (folderId: number) => {
    if (!moving) return;
    setBusy(true);
    try {
      if (moving.folder) {
        await mutations.moveFolder.mutateAsync({ id: moving.folder.id, newParentId: folderId });
        showMessage(`moved · ${byId.get(folderId)?.name ?? 'top'}`, 'success');
      } else {
        await mutations.moveItems.mutateAsync({ refs: selected, folderId });
        showMessage(
          `moved ${selected.length} · ${byId.get(folderId)?.name ?? 'unfiled'}`,
          'success',
        );
        exitSelect();
      }
      setMoving(null);
    } catch (e) {
      showMessage(folderErrorWord(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (going: LibraryItem[]) => {
    setBusy(true);
    let deleted = 0;
    let failed = 0;
    try {
      const mediaIds = going.flatMap((i) => (i.media && i.ref?.id ? [i.ref.id] : []));
      if (mediaIds.length) {
        const res = await deleteMedia.mutateAsync(mediaIds);
        deleted += res.deleted.length;
        failed += res.failed.length;
      }
      for (const i of going) {
        if (i.media || !i.ref?.id) continue;
        try {
          await deleteFile.mutateAsync(i.ref.id);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
    } catch {
      failed += 1;
    } finally {
      await invalidateLibrary(qc);
      setBusy(false);
      setDeleting(false);
      exitSelect();
      showMessage(
        failed ? `deleted ${deleted} · ${failed} kept` : `deleted ${deleted}`,
        failed ? 'error' : 'success',
      );
    }
  };

  const download = async () => {
    const media = selectedItems.flatMap((i) => (i.media ? [i.media] : []));
    for (const i of selectedItems) {
      const url = i.file?.downloadUrl || i.file?.url;
      if (!i.media && url) saveFile(url);
    }
    if (media.length) await downloadMediaOriginals(media);
  };

  const renameFolder = (id: number, name: string) =>
    mutations.renameFolder.mutateAsync({ id, name });
  const deleteFolder = async (id: number) => {
    const parent = byId.get(id)?.parentId ?? 0;
    try {
      await mutations.deleteFolder.mutateAsync({ id });
      go(parent > 0 ? parent : 'all');
      showMessage('folder deleted', 'success');
    } catch (e) {
      showMessage(folderErrorWord(e), 'error');
    }
  };

  // ---- pieces ----
  const onClear = narrowed ? () => setFilter(clearFilters(state.filter)) : undefined;
  // With a client-side narrowing (labels: printable only) the server total counts rows that are
  // not listed. Count what is shown, and only once every page is in; until then, no count.
  const shown = itemFilter ? (hasNextPage ? undefined : items.length) : list.total;
  const countLabel = shown === undefined ? '' : `${shown} ${shown === 1 ? 'item' : 'items'}`;
  const pending = uploader.pending;
  const bulk = page && selecting;
  const gridMin = page ? (phone ? 140 : 184) : phone ? 96 : 118;

  // Folder tiles of the open place. Narrowed (or in a picker), a folder with nothing to show
  // is left out; the counts are the server's, under the same filter.
  const hereFolders =
    loc === 'all' ? tree : typeof loc === 'number' ? byId.get(loc)?.children ?? [] : [];
  const shownFolders =
    narrowed || !page ? hereFolders.filter((n) => deepCount(n) > 0) : hereFolders;
  const canNewFolder = page && mayWrite && !bulk && !narrowed && loc !== 'unfiled';
  const [creatingFolder, setCreatingFolder] = useState(false);
  const newFolderTile = creatingFolder && createFolder && (
    <NewFolderTile
      key='new-folder'
      onCancel={() => setCreatingFolder(false)}
      onSave={async (name) => {
        await createFolder(name);
        setCreatingFolder(false);
      }}
    />
  );
  const folderTiles = shownFolders.map((n) => (
    <FolderTile
      key={`folder-${n.id}`}
      node={n}
      filter={filter}
      scrollRoot={page ? null : scrollEl}
      onOpen={() => go(n.id)}
    />
  ));
  const here = typeof loc === 'number' ? byId.get(loc) : undefined;
  const emptyHere =
    !!here &&
    !list.isLoading &&
    list.total === 0 &&
    here.children.length === 0 &&
    !narrowed &&
    !pending.length &&
    !creatingFolder;

  const searchInput = (
    <Input
      type='text'
      value={search}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
      placeholder='search'
      aria-label='search'
      className={
        page
          ? 'min-w-0 flex-1 lg:max-w-60 lg:flex-none'
          : visibleGroups(kinds).length > 1
            ? 'w-full min-w-0 sm:w-48'
            : 'min-w-0 flex-1 sm:max-w-48'
      }
    />
  );
  const uploadButton = canUpload && (
    <Button variant='main' size='sm' onClick={openPicker}>
      + upload
    </Button>
  );

  // Picker: one line, search and the kind switch, the count at the right (the mockup's picker).
  const kindGroups = visibleGroups(kinds);
  const kindValue: KindGroup | 'all' =
    kindGroups.find(
      (g) =>
        groupOn(state.filter.kinds, g) &&
        state.filter.kinds.every((k) => KIND_GROUPS[g].includes(k)),
    ) ?? 'all';
  const pickBar = (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      {searchInput}
      {kindGroups.length > 1 && (
        <ViewSwitch
          label='kind'
          value={kindValue}
          options={[
            { value: 'all' as const, label: 'all' },
            ...kindGroups.map((g) => ({ value: g, label: g })),
          ]}
          onChange={(v) =>
            setFilter({ ...state.filter, kinds: v === 'all' ? [] : [...KIND_GROUPS[v]] })
          }
        />
      )}
      <Text size='micro' variant='label' component='span' className='ml-auto tabular-nums'>
        {countLabel}
      </Text>
    </div>
  );

  const toolbar = bulk ? (
    <Toolbar>
      <Text size='micro' component='span' className='uppercase tracking-label'>
        {selected.length} selected
      </Text>
      <Button
        variant='underline'
        size='xs'
        onClick={() => emit(items.flatMap((i) => refOf(i) ?? []))}
      >
        all
      </Button>
      <Button variant='underline' size='xs' onClick={() => emit([])}>
        none
      </Button>
      <ToolbarSpacer />
      <Button
        variant='secondary'
        size='sm'
        disabled={!selected.length}
        onClick={() => setMoving({})}
      >
        move
      </Button>
      <Button
        variant='secondary'
        size='sm'
        disabled={!selected.length}
        onClick={() => void download()}
      >
        download
      </Button>
      <Button
        variant='secondary'
        size='sm'
        className='border-error text-error'
        disabled={!selected.length}
        onClick={() => setDeleting(true)}
      >
        delete
      </Button>
      <Button variant='main' size='sm' onClick={exitSelect}>
        done
      </Button>
    </Toolbar>
  ) : (
    <Toolbar>
      {searchInput}
      <FilterChips groups={groups} />
      <ToolbarSpacer />
      <ViewSwitch quiet label='sort' value={sort} options={SORTS} onChange={setSort} />
      <ViewSwitch label='view' value={view} options={VIEWS} onChange={setView} />
      {mayWrite && (
        <Button variant='secondary' size='sm' onClick={() => setSelecting(true)}>
          select
        </Button>
      )}
      {uploadButton}
    </Toolbar>
  );

  const pendingTiles = pending.map((p) => (
    <Tile
      key={p.key}
      media={
        <Placeholder
          label={p.exact ? `${Math.round(p.progress * 100)}%` : undefined}
          className='w-full'
          style={{ aspectRatio: '4/5' }}
        />
      }
      name={p.name}
      sub='uploading'
      lowercase
    />
  ));
  const uploadDoor = !page && canUpload && (
    <DoorTile key='upload-door' onClick={openPicker}>
      upload
    </DoorTile>
  );
  const itemTiles = items.map((item, i) => {
    const ref = refOf(item);
    if (!ref) return null;
    const key = refKey(ref);
    return (
      <div key={key} data-offset={i} className='relative min-w-0'>
        <ItemThumb
          item={item}
          selected={selectedKeys.has(key)}
          targetRatios={targetRatios}
          mark={errors?.[key]}
          busy={busySet.has(key)}
          onClick={() => handleClick(item)}
        />
        {!page && (
          <Button
            variant='underline'
            size='xs'
            className='absolute right-1 top-1 bg-bgColor px-1'
            onClick={() => preview(item)}
          >
            open
          </Button>
        )}
      </div>
    );
  });
  const itemRows = (
    <div ref={gridRef} className='flex flex-col bg-bgColor'>
      {pending.map((p) => (
        <Text key={p.key} size='small' variant='label' className='px-1 py-1'>
          {p.exact ? `${p.name} · ${Math.round(p.progress * 100)}%` : `${p.name} · uploading`}
        </Text>
      ))}
      {items.map((item, i) => {
        const ref = refOf(item);
        if (!ref) return null;
        const key = refKey(ref);
        return (
          <div key={key} data-offset={i}>
            <ItemRow
              item={item}
              selected={selectedKeys.has(key)}
              onClick={() => handleClick(item)}
            />
          </div>
        );
      })}
    </div>
  );
  const nothing = (
    <div className='flex items-center justify-center gap-2 py-10'>
      <Text variant='label'>nothing found</Text>
      {onClear && (
        <Button variant='underline' size='xs' onClick={onClear}>
          clear
        </Button>
      )}
    </div>
  );
  const noRows = items.length === 0 && !pending.length;
  /** The items of the place after its folder tiles (`lead`), in one grid or as rows. */
  const itemsBlock = (lead: ReactNode[]) => {
    if (list.isLoading) return <Loader />;
    if (list.isError) return <Text variant='label'>not loaded</Text>;
    const leadGrid = lead.some(Boolean) ? <Tiles min={gridMin}>{lead}</Tiles> : null;
    if (noRows && (narrowed || !uploadDoor)) {
      return (
        <>
          {leadGrid}
          {narrowed ? nothing : null}
        </>
      );
    }
    if (view === 'list') {
      return (
        <div className='flex flex-col gap-3'>
          {leadGrid}
          {uploadDoor && <Tiles min={gridMin}>{uploadDoor}</Tiles>}
          {itemRows}
        </div>
      );
    }
    return (
      <div ref={gridRef}>
        <Tiles min={gridMin}>
          {lead}
          {uploadDoor}
          {pendingTiles}
          {itemTiles}
        </Tiles>
      </div>
    );
  };

  const emptyBlock = (
    <Placeholder className='h-72 w-full'>
      <div className='flex flex-col items-center gap-2.5 border border-borderColor bg-bgColor px-4 py-3.5'>
        <Text variant='label' className='normal-case'>
          empty
        </Text>
        <div className='flex gap-2'>
          {canUpload && (
            <Button variant='secondary' size='sm' onClick={openPicker}>
              + upload
            </Button>
          )}
          {canNewFolder && (
            <Button variant='secondary' size='sm' onClick={() => setCreatingFolder(true)}>
              + folder
            </Button>
          )}
        </div>
      </div>
    </Placeholder>
  );

  const groupCount = shown === undefined ? '' : String(shown);
  const body = emptyHere ? (
    emptyBlock
  ) : loc === 'all' ? (
    <div className='flex flex-col'>
      {(shownFolders.length > 0 || canNewFolder) && (
        <>
          {page && (
            <GroupLabel
              flush
              action={
                canNewFolder && !creatingFolder ? (
                  <Button variant='underline' size='xs' onClick={() => setCreatingFolder(true)}>
                    + folder
                  </Button>
                ) : undefined
              }
            >
              folders
            </GroupLabel>
          )}
          {(shownFolders.length > 0 || newFolderTile) && (
            <Tiles min={gridMin}>
              {folderTiles}
              {newFolderTile}
            </Tiles>
          )}
        </>
      )}
      <GroupLabel flush={!page && !shownFolders.length}>
        {narrowed ? `${groupCount} found` : `unfiled · ${groupCount}`}
      </GroupLabel>
      {itemsBlock([])}
    </div>
  ) : (
    itemsBlock([
      ...folderTiles,
      canNewFolder
        ? newFolderTile || (
            <DoorTile key='folder-door' onClick={() => setCreatingFolder(true)}>
              folder
            </DoorTile>
          )
        : null,
    ])
  );

  const tail = (
    <>
      {hasNextPage && <div ref={setSentinel} aria-hidden className='h-px' />}
      {isFetchingNextPage && <Loader />}
    </>
  );

  const headline = (
    <Headline
      loc={loc}
      byId={byId}
      phone={phone}
      editable={page && mayWrite && !bulk}
      onGo={go}
      onRename={renameFolder}
      onDelete={(id) => void deleteFolder(id)}
      onMove={(folder) => setMoving({ folder })}
      extra={page && !bulk ? headlineTools : undefined}
    />
  );

  const phoneLayout = (
    <div className={`flex flex-col gap-2.5 ${page ? 'pb-16' : ''}`}>
      {headline}
      {page ? (
        <>
          <div className='flex min-w-0 items-center gap-2'>
            {searchInput}
            {mayWrite && (
              <Button
                variant='secondary'
                size='sm'
                onClick={() => (selecting ? exitSelect() : setSelecting(true))}
              >
                {selecting ? 'done' : 'select'}
              </Button>
            )}
          </div>
          <PhoneFilterChips
            groups={groups}
            sort={sort}
            sorts={SORTS}
            onSort={setSort}
            view={view}
            views={VIEWS}
            onView={setView}
          />
        </>
      ) : (
        pickBar
      )}
      {uploader.busy && <Progress value={uploader.progress * 100} />}
      {body}
      {tail}
      {page && (
        <div className='fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-borderColor bg-bgColor p-2.5'>
          {bulk ? (
            <>
              <Text size='micro' component='span' className='tabular-nums'>
                {selected.length}
              </Text>
              <Button
                variant='secondary'
                size='sm'
                className='flex-1'
                disabled={!selected.length}
                onClick={() => setMoving({})}
              >
                move
              </Button>
              <Button
                variant='secondary'
                size='sm'
                className='flex-1'
                disabled={!selected.length}
                onClick={() => void download()}
              >
                download
              </Button>
              <Button
                variant='secondary'
                size='sm'
                className='flex-1 border-error text-error'
                disabled={!selected.length}
                onClick={() => setDeleting(true)}
              >
                delete
              </Button>
            </>
          ) : (
            canUpload && (
              <Button variant='main' size='sm' className='flex-1' onClick={openPicker}>
                + upload
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );

  const desktopLayout = (
    <div className='flex flex-col gap-2.5'>
      {headline}
      {page ? toolbar : pickBar}
      {uploader.busy && <Progress value={uploader.progress * 100} />}
      {body}
      {tail}
    </div>
  );

  return (
    <div
      {...dropProps}
      className={dragOver ? 'outline outline-2 -outline-offset-2 outline-textColor' : undefined}
    >
      <Input
        ref={pickerRef}
        type='file'
        multiple
        hidden
        className='hidden'
        aria-hidden
        tabIndex={-1}
        accept={accept === 'visual' ? 'image/*,video/*,.svg' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          intake(files);
        }}
      />
      {phone ? phoneLayout : desktopLayout}
      {scroller && sort === 'new' && (
        <DateScrubber
          scrollEl={scroller}
          months={months}
          labelAt={labelAt}
          offsetToScrollTop={offsetToScrollTop}
          onJump={(year, month) => {
            const off = monthIndex.offsetOf(year, month);
            if (off !== null) void list.fetchUntil(off);
          }}
          insetTop={insetTop}
          insetBottom={page && phone ? 56 : 0}
        />
      )}
      {!page && (
        <MediaViewer
          items={viewerItems}
          index={viewer.index}
          open={viewer.open}
          onOpenChange={viewer.onOpenChange}
          onIndexChange={viewer.onIndexChange}
        />
      )}
      {page && (
        <>
          <MoveDialog
            open={!!moving}
            title={moving?.folder ? `move ${moving.folder.name}` : `move ${selected.length}`}
            tree={tree}
            exclude={moving?.folder}
            rootLabel={moving?.folder ? 'top' : 'unfiled'}
            busy={busy}
            onOpenChange={(next) => !next && setMoving(null)}
            onMove={(id) => void moveTo(id)}
          />
          <DeleteDialog
            open={deleting}
            items={selectedItems}
            busy={busy}
            onOpenChange={setDeleting}
            onDelete={(going) => void remove(going)}
          />
        </>
      )}
    </div>
  );
}
