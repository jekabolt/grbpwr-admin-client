import { common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  DateScrubber,
  SideRailLayout,
  Text,
  useMonthIndex,
  type ScrubMonth,
  TrashIcon,
} from 'ui';
import {
  MediaViewer,
  mediaFullListToViewerItems,
  mediaFullViewerSrc,
  useMediaViewer,
} from 'components/shared/media-viewer/media-viewer';
import { MediaSavedBar } from './components/media-saved-bar';
import { Filter } from './components/filter';
import { SkippedFilesNote } from './components/dragdrop-area';
import { MediaFilterBar } from './components/media-filter-bar';
import { MediaItem, SlotFit } from './components/media-item';
import { MediaList } from './components/media-list';
import { MediaVirtualGrid } from './components/media-virtual-grid';
import {
  MediaFiltersSheet,
  MobileBottomBar,
  MobileLibraryHead,
  MobileSelectHead,
  useCoarsePointer,
} from './components/media-mobile';
import { MediaRail } from './components/media-rail';
import { MediaDeleteSheet } from './components/media-delete-sheet';
import { MediaSelectionBar } from './components/media-selection-bar';
import { PendingMediaPlate } from './components/pending-media-plate';
import { cropLoss, matchesSlotRatio } from './utils/calculate-aspect';
import { mediaUsageRefs, usageRefHref, usageRefName, usageRefSlot } from './utils/media-usage';
import { useFilter } from './utils/useFilter';
import { usePasteFiles } from './utils/usePasteFiles';
import { useIsMobile } from './utils/useIsMobile';
import {
  downloadMediaOriginals,
  useDeleteMedia,
  useInfiniteMedia,
  useMediaFacets,
  useMediaMonths,
  useMediaUsage,
  useMediaWindow,
  type MediaRange,
} from './utils/useMediaQuery';
import { usePendingFiles } from './utils/usePendingFiles';
import { useSelection } from './utils/useSelectMedia';

export type VideoSize = { width: number; height: number };

const NO_MONTHS: ScrubMonth[] = [];
/** Fixed top bar of the shell (`top-2` + `h-12`): the pill and the month at the top sit below it. */
const SHELL_BAR = 56;
/**
 * `MobileBottomBar` before it is measured: a 44px control between 8px paddings and its border.
 * The real height (safe-area padding included) replaces it once the bar is on screen.
 */
const PHONE_BAR = 61;

/** Month (UTC) of the first tile under the top bar, read from the tiles on screen. */
function monthOfTopTile(root: HTMLElement | null, top: number) {
  if (!root) return null;
  const tiles = root.querySelectorAll<HTMLElement>('[data-created]');
  let lo = 0;
  let hi = tiles.length - 1;
  let found = tiles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tiles[mid].getBoundingClientRect().bottom > top) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  const d = new Date(tiles[found]?.dataset.created ?? '');
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Infinite pages first, then the window's pages they do not hold yet (filters and usage). */
function mergeById(a: common_MediaFull[], b: common_MediaFull[]) {
  if (!b.length) return a;
  const ids = new Set(a.map((m) => m.id));
  const extra = b.filter((m) => !ids.has(m.id));
  return extra.length ? [...a, ...extra] : a;
}

interface MediaLayoutProps {
  aspectRatio?: string[];
  allowMultiple?: boolean;
  disabled?: boolean;
  showVideos?: boolean;
  selectionMode?: boolean;
  showFilters?: boolean;
  /**
   * Phone picker's scrolling viewport. When supplied in selection mode, the picker uses the same
   * sparse, month-indexed grid as the phone library instead of walking every intervening page.
   */
  virtualScrollEl?: HTMLElement | null;
  /**
   * Пропорции, которые ждёт слот, числами. Сетка делится на «встанут как есть» и «нужен кроп»,
   * на каждом кадре второй полосы рисуется рамка будущего кадрирования, а сама полоса
   * сортируется по тому, сколько площади уйдёт под нож.
   */
  targetRatios?: number[];
  /**
   * Куда девать файл, выбранный с диска. Задаёт диалог выбора: там файл идёт в приёмку слота,
   * а не в общую очередь библиотеки. Не задан — очередь пачки, как на странице медиатеки.
   */
  onFilesPicked?: (files: File[]) => void;
  /**
   * Набранное, когда им владеет вызывающий. Задан — сетка отмечает выбранным ровно это, и снять
   * кадр можно снаружи (лоток в подвале диалога). Не задан — набор ведёт сам менеджер.
   */
  selected?: common_MediaFull[];
  onSelectionChange?: (selectedMedia: common_MediaFull[]) => void;
}

export function MediaManager({
  aspectRatio,
  allowMultiple,
  disabled,
  showVideos,
  selectionMode = false,
  showFilters = true,
  virtualScrollEl,
  targetRatios,
  onFilesPicked,
  selected,
  onSelectionChange,
}: MediaLayoutProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: infinitePending,
  } = useInfiniteMedia();
  const { ref, inView } = useInView();
  const navigate = useNavigate();
  const prevInViewRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Список СОБИРАЕТСЯ ОДИН РАЗ НА ОТВЕТ, а не на каждый рендер: пересобранный массив — новая
  // ссылка, и мемоизация отбора внутри `useFilter` не срабатывала бы ни разу, пересчитывая
  // фасетные счётчики и сортировку на каждое нажатие клавиши в поиске.
  const pagedMedia = useMemo(
    () => data?.pages.flatMap((page) => page.media as common_MediaFull[]) || [],
    [data],
  );
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});

  const pendingFilesHook = usePendingFiles();
  const { canWrite } = usePermissions();

  // Standalone page shows a header + toolbar; the embedded selector (selectionMode) stays minimal.
  const isStandalone = !selectionMode;
  const canUpload = canWrite(SECTION.media);
  // The page owns the document scroller; a phone picker explicitly lends us its dialog scroller.
  // Desktop pickers pass nothing, so they neither count months nor change their existing list.
  // The sparse grid lives behind the date pill, so it takes the pill's signal (a touch pointer):
  // a narrow desktop window keeps the phone layout but the plain list with its scrollbar.
  const isMobile = useIsMobile();
  const coarse = useCoarsePointer();
  const mobileLib = isStandalone && isMobile;
  const pickerScroller = selectionMode ? virtualScrollEl ?? null : null;
  const sparsePhone = (mobileLib && coarse) || pickerScroller !== null;

  // PHONE MEDIA = A SPARSE GRID OVER THE WHOLE LIBRARY. The month counts give the total, so
  // every slot exists up front and only the pages on screen are fetched (`useMediaWindow`); the
  // date pill can then jump anywhere. Waits for the first infinite page, which it seeds.
  const months = useMediaMonths(sparsePhone).data ?? NO_MONTHS;
  const monthTotal = useMonthIndex(months).total;
  const sparse = sparsePhone && monthTotal > 0;
  const [range, setRange] = useState<MediaRange | null>(null);
  const win = useMediaWindow(sparse ? monthTotal : 0, range, sparse && !infinitePending);
  // Everything loaded either way feeds the filters, usage and the viewer.
  const media = useMemo(
    () => (sparse ? mergeById(pagedMedia, win.loaded) : pagedMedia),
    [sparse, pagedMedia, win.loaded],
  );
  const pageScroller =
    typeof document === 'undefined' ? null : (document.scrollingElement as HTMLElement | null);
  const sparseScroller = mobileLib ? pageScroller : pickerScroller;
  const looseListRef = useRef<HTMLDivElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const sparseTopInset = mobileLib ? SHELL_BAR : 0;
  const [phoneBar, setPhoneBar] = useState(PHONE_BAR);
  const sparseBottomInset = mobileLib && (selectMode || canUpload) ? phoneBar : 0;
  const looseLabelAt = useCallback(
    () =>
      monthOfTopTile(
        looseListRef.current,
        mobileLib ? SHELL_BAR : pickerScroller?.getBoundingClientRect().top ?? 0,
      ),
    [mobileLib, pickerScroller],
  );
  const [selectView, setSelectView] = useState<'all' | 'selected'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { showMessage } = useSnackBarStore();
  const selecting = mobileLib && selectMode;

  // ЗАНЯТОСТЬ СПРАШИВАЕТСЯ ОДИН РАЗ НА СТРАНИЦУ И ПО ВСЕЙ ЗАГРУЖЕННОЙ БИБЛИОТЕКЕ, а не по
  // отфильтрованному: счётчики полки обязаны относиться к тому же знаменателю, что и остальные
  // («counted over the N loaded so far»), а отбор по свободным иначе сузил бы сам себя.
  // В диалоге выбора кадра под слот не спрашивается вовсе — там занятость не показывается нигде.
  const {
    usage,
    isPending: usagePending,
    isError: usageFailed,
  } = useMediaUsage(media, isStandalone);

  // ⌘V НА СТРАНИЦЕ БИБЛИОТЕКИ — в ту же очередь, куда попадает брошенный файл: плитка ожидания
  // показывает превью, даёт кроп каждому кадру и грузит по кнопке.
  //
  // ТОЛЬКО НА САМОСТОЯТЕЛЬНОЙ СТРАНИЦЕ. Внутри диалога выбора менеджер монтируется ПОЗЖЕ самого
  // диалога и, забрав очередь себе, увёл бы вставку из слота, ради которого диалог открыт, — в
  // библиотеку, где её ещё пришлось бы искать.
  // SVG too: the library is the vector door's shelf as well (useUploadMedia routes it).
  usePasteFiles(
    { claims: isStandalone && canUpload, accept: 'media+svg' },
    pendingFilesHook.addFiles,
  );

  // Счётчики всей библиотеки — и странице, и пикеру. Без ответа `useFilter` считает по загруженному.
  const libraryFacets = useMediaFacets();

  const handleUploadClick = () => fileInputRef.current?.click();

  /**
   * Файл с диска. На странице библиотеки он встаёт в очередь пачки; в диалоге выбора — уходит в
   * приёмку слота (`onFilesPicked`), той же дорогой, что и ⌘V.
   *
   * Разводить их обязательно. Очередь пачки — полоса на самом верхнем слое (менеджер передач
   * идёт фоном и не должен прятаться за диалогами), и в диалоге она легла бы прямо на его
   * подвал с кнопкой «поставить». А главное, в диалоге человек заполняет СЛОТ, а не пополняет
   * библиотеку: файл должен пройти кроп по пропорции слота и встать на место, а не осесть в
   * общей очереди, из которой его потом ещё искать.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      if (onFilesPicked) onFilesPicked(files);
      else pendingFilesHook.addFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const {
    filteredMedia,
    type,
    order,
    search,
    ratio,
    usageShelf,
    typeCounts,
    ratioCounts,
    usageCounts,
    counted,
    isFiltered,
    setType,
    setOrder,
    setSearch,
    setRatio,
    setUsageShelf,
    reset,
  } = useFilter(
    media,
    aspectRatio,
    videoSizes,
    showVideos === false ? 'image' : undefined,
    usage,
    libraryFacets.data,
  );

  const selection = useSelection({
    allowMultiple,
    disabled,
    value: selected,
    onSelectionChange,
  });

  // Sparse grid only over the date-ordered list: any client filter, the oldest-first order or the
  // «selected» view needs the loaded items themselves, so it keeps the list below. Fit bands are
  // intentionally absent here because grouping them would break the month index; each picker tile
  // still draws its own fit frame. A picker for stills keeps its videos in their slots (the month
  // counts include them), dimmed and unselectable, instead of leaving the sparse grid.
  const hasClientFilter = isFiltered || !!aspectRatio?.length;
  const virtual =
    sparse && !hasClientFilter && order === 'desc' && !(selecting && selectView === 'selected');
  const noVideos = showVideos === false;

  useEffect(() => {
    const justEnteredView = inView && !prevInViewRef.current;
    prevInViewRef.current = inView;
    // ПОД ОТБОРОМ СТРАНИЦЫ ДОКАЧИВАЮТСЯ ДО КОНЦА. Счётчики рельса теперь по всей библиотеке
    // («2:1 — 90»), а сетка отбирает из загруженного: в отфильтрованной сетке маячок не уходит с
    // экрана, «вход в экран» больше не случается, и сетка застывала на двух кадрах из обещанных
    // девяноста. Библиотека — тысяча с небольшим записей, это несколько страниц.
    const wantsMore = justEnteredView || (hasClientFilter && !virtual);
    if (wantsMore && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, hasClientFilter, virtual]);

  const handleVideoLoad = (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.target as HTMLVideoElement;
    setVideoSizes((prev) => ({
      ...prev,
      [mediaId]: {
        width: video.videoWidth,
        height: video.videoHeight,
      },
    }));
  };

  const pendingPlate = pendingFilesHook.previews.length > 0 && (
    <PendingMediaPlate
      previews={pendingFilesHook.previews}
      croppedUrls={pendingFilesHook.croppedUrls}
      uploadingIndices={pendingFilesHook.uploadingIndices}
      onUploadAll={pendingFilesHook.handleUploadAll}
      onCrop={pendingFilesHook.setCroppedUrl}
      onRemove={pendingFilesHook.removeFile}
    />
  );

  const shown = filteredMedia?.length ?? 0;

  // ОДИН ПРОСМОТРЩИК НА ВСЁ. До этого клик по плитке открывал `PreviewMedia` — диалог 800px с
  // кадром, зажатым в 500×400, тремя колонками адресов и заблокированной кнопкой «upload». А
  // полноэкранный `MediaViewer` с зумом, диафильмом и рисованием, который в приложении был,
  // из библиотеки не открывался вовсе.
  // Просмотрщик получает места ГОТОВЫМИ, вместе с адресами: разбирать `kind` в роут — знание о
  // маршрутах админки, которому в примитиве `ui` не место (см. `usageRefHref`).
  const viewerUsageOf = useCallback(
    (id: number) =>
      mediaUsageRefs(usage, id)?.map((ref) => ({
        kind: ref.kind,
        label: usageRefName(ref),
        slot: usageRefSlot(ref),
        href: usageRefHref(ref),
      })),
    [usage],
  );

  // РЯД ПРОСМОТРЩИКА ОТСЕИВАЕТСЯ ЗДЕСЬ, А НЕ ВНУТРИ НЕГО. `mediaFullListToViewerItems` выбрасывает
  // кадры без адреса, и индекс, посчитанный по `filteredMedia`, разъезжался с рядом на каждой
  // такой строке: открытым оказывался соседний снимок. Пока это стоило неверной картинки, теперь
  // ценой была бы неверная подпись «ни на что не заведён, можно удалять» — про чужой файл.
  // Copies saved this session wear `new` in the filmstrip (frame 4).
  const [newIds, setNewIds] = useState<ReadonlySet<number>>(() => new Set());
  // SPARSE GRID: THE VIEWER WALKS ONE UNBROKEN RUN. The loaded pages can sit far apart (the top
  // page and the ones around a jump); handed to the viewer as one list, the counter lied and the
  // arrows leapt across hundreds of items. The run is anchored at the list offset of the frame
  // that was opened.
  const [viewAnchor, setViewAnchor] = useState<number | undefined>(undefined);
  const viewRun = useMemo(
    () => (virtual && viewAnchor !== undefined ? win.runAround(viewAnchor) : undefined),
    [virtual, viewAnchor, win],
  );
  // A fresh copy stays in the row even when the filters exclude it (a ratio filter, `in use`, an
  // id search) — otherwise `open` on the saved bar has nothing to jump to.
  const viewable = useMemo(() => {
    const shown = viewRun ?? filteredMedia ?? [];
    const shownIds = new Set(shown.map((m) => m.id));
    const extra = newIds.size
      ? media.filter((m) => m.id != null && newIds.has(m.id) && !shownIds.has(m.id))
      : [];
    return [...extra, ...shown].filter((m) => !!mediaFullViewerSrc(m));
  }, [viewRun, filteredMedia, media, newIds]);
  const viewerItems = useMemo(() => {
    const items = mediaFullListToViewerItems(viewable, viewerUsageOf);
    if (!newIds.size) return items;
    return items.map((it) =>
      it.meta?.id != null && newIds.has(it.meta.id) ? { ...it, badge: 'new' } : it,
    );
  }, [viewable, viewerUsageOf, newIds]);
  const viewer = useMediaViewer();
  // THE VIEWER FOLLOWS AN ID, NOT A POSITION: a saved copy lands at the top of the list and would
  // otherwise shift the open frame onto its neighbour. While the id is not (yet) in the list the
  // last good position holds.
  const [viewId, setViewId] = useState<number | undefined>(undefined);
  const lastViewIndex = useRef(0);
  const foundAt = viewable.findIndex((x) => x.id === viewId);
  const viewIndex =
    foundAt >= 0 ? foundAt : Math.min(lastViewIndex.current, Math.max(viewable.length - 1, 0));
  lastViewIndex.current = viewIndex;
  const viewingMedia = viewable[viewIndex];
  const [saved, setSaved] = useState<
    { original?: common_MediaFull; media: common_MediaFull } | undefined
  >(undefined);
  const deleteMedia = useDeleteMedia();

  const handleView = (m: common_MediaFull) => {
    const at = virtual ? win.indexOf(m.id) : undefined;
    if (at !== undefined) {
      if (!mediaFullViewerSrc(m)) return;
      setViewAnchor(at);
      setViewId(m.id);
      viewer.onOpenChange(true);
      return;
    }
    if (viewable.some((x) => x.id === m.id)) {
      setViewAnchor(undefined);
      setViewId(m.id);
      viewer.onOpenChange(true);
    }
  };

  // A copy saved from a viewer mode (crop, expand, adjust, draw): the viewer stays on the
  // ORIGINAL, with the «saved» line above the strip.
  const handleSaved = (m: common_MediaFull) => {
    const original = viewingMedia;
    if (m.id != null) setNewIds((prev) => new Set(prev).add(m.id as number));
    setSaved({ original, media: m });
    if (original?.id != null) setViewId(original.id);
  };
  const dismissSaved = useCallback(() => setSaved(undefined), []);

  // ПУСТО ПО ОТБОРУ И ПУСТАЯ БИБЛИОТЕКА — РАЗНЫЕ ЭКРАНЫ. Раньше отбор, не давший ничего, рисовал
  // то же приглашение бросить файл, что и чистая библиотека: человек читал это как «снимки
  // пропали» и шёл искать их, вместо того чтобы снять фильтр.
  const noMatch =
    media.length > 0 && shown === 0 ? (
      <div className='flex min-h-[240px] flex-col items-center justify-center gap-2 border border-borderColor bg-bgColor px-4 text-center'>
        <Text variant='uppercase' className='font-bold'>
          nothing matched the filter
        </Text>
        <Text variant='label'>
          {media.length} loaded, nothing to show. This is the filter, not an empty library.
        </Text>
        <Button className='mt-1' onClick={reset}>
          clear filter
        </Button>
      </div>
    ) : undefined;

  // РАЗБОР ПО ПРИГОДНОСТИ. Слот знает своё требование с самого начала; раньше он молчал о нём
  // до клика и предлагал кроп постфактум. Здесь непригодность становится числом: сколько
  // процентов кадра срежет рамка, и кадры выстраиваются от самых дешёвых.
  const measureFit = useCallback(
    (m: common_MediaFull): SlotFit | undefined => {
      if (!targetRatios?.length) return undefined;
      const dim = m.media?.fullSize ?? m.media?.thumbnail;
      // Видео не кадрируется: перекодирования в браузере нет, оно уходит как есть.
      const video = isVideo(m.media?.thumbnail?.mediaUrl);
      if (video) return { ok: true };
      const ok = matchesSlotRatio(dim?.width, dim?.height, targetRatios);
      if (ok) return { ok: true, target: targetRatios[0] };
      const loss = Math.min(...targetRatios.map((t) => cropLoss(dim?.width, dim?.height, t) ?? 1));
      return { ok: false, loss, target: targetRatios[0] };
    },
    [targetRatios],
  );

  // ЗАМЕР ОДИН РАЗ НА КАДР. Раньше `fitOf` считался заново внутри компаратора сортировки, то есть
  // O(n log n) раз на каждый рендер — и там же, где сравнение обязано быть дешёвым и стабильным.
  const fits = useMemo(() => {
    if (!targetRatios?.length) return undefined;
    const map = new Map<number, SlotFit>();
    for (const m of filteredMedia || []) {
      const f = measureFit(m);
      if (f) map.set(m.id ?? 0, f);
    }
    return map;
  }, [filteredMedia, targetRatios, measureFit]);

  const fitOf = useMemo(
    () => (fits ? (m: common_MediaFull) => fits.get(m.id ?? 0) : undefined),
    [fits],
  );

  const bands = useMemo(() => {
    if (!fits) return undefined;
    const all = filteredMedia || [];
    const good = all.filter((m) => fits.get(m.id ?? 0)?.ok);
    const rest = all
      .filter((m) => !fits.get(m.id ?? 0)?.ok)
      .sort((a, b) => (fits.get(a.id ?? 0)?.loss ?? 1) - (fits.get(b.id ?? 0)?.loss ?? 1));
    return [
      {
        key: 'fit',
        title: 'fit as they are',
        hint: 'the ratio matched, or it is a video',
        items: good,
      },
      {
        key: 'crop',
        title: 'need cropping',
        hint: 'least loss first · the frame drawn on the image shows what stays',
        items: rest,
      },
    ];
  }, [fits, filteredMedia]);

  const usageOf = useCallback((m: common_MediaFull) => mediaUsageRefs(usage, m.id), [usage]);

  const enterSelect = (m?: common_MediaFull) => {
    setSelectMode(true);
    if (m && !selection.isSelected(m.id ?? 0)) selection.selectMedia(m);
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelectView('all');
    selection.clearSelection();
  };
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { saved, opened } = await downloadMediaOriginals(selection.selectedMedia);
      showMessage(opened ? `saved ${saved} · opened ${opened}` : `saved ${saved}`, 'success');
    } finally {
      setDownloading(false);
    }
  };
  const libraryCount = virtual ? monthTotal : shown;
  // ШАПКА СЧИТАЕТ ТАК ЖЕ, КАК РЕЛЬС: по кубу — всю библиотеку и то, что под отбором; без куба —
  // загруженное, как раньше.
  const headTotal = counted ? counted.total : virtual ? monthTotal : media.length;
  const headShown = counted ? (virtual ? counted.total : counted.matching) : libraryCount;
  const deskTotal = counted ? counted.total : media.length;
  const deskShown = counted ? counted.matching : shown;
  // Выбранное показывается ЦЕЛИКОМ, мимо фильтров: набор переживает смену отбора.
  const gridMedia =
    selecting && selectView === 'selected' ? selection.selectedMedia : filteredMedia || [];
  const facets = {
    type,
    ratio,
    usageShelf,
    typeCounts,
    ratioCounts,
    usageCounts,
    onType: setType,
    onRatio: setRatio,
    onUsage: setUsageShelf,
  };

  const list = virtual ? (
    <>
      <SkippedFilesNote pendingFilesHook={pendingFilesHook} />
      <MediaVirtualGrid
        scrollEl={sparseScroller}
        months={months}
        total={monthTotal}
        itemAt={win.itemAt}
        onRangeChange={setRange}
        columns={mobileLib ? 2 : undefined}
        insetTop={sparseTopInset}
        insetBottom={sparseBottomInset}
        renderItem={(m, load) => (
          <MediaItem
            media={m}
            isSelected={selection.isSelected(m.id || 0)}
            onToggle={() => selection.toggleMedia(m)}
            disabled={disabled}
            videoSizes={videoSizes}
            onVideoLoad={handleVideoLoad}
            onView={selectionMode ? undefined : handleView}
            selectionMode={selectionMode}
            fit={fitOf?.(m)}
            usage={usageOf(m)}
            touch={mobileLib}
            selecting={selecting}
            onLongPress={mobileLib && !disabled ? () => enterSelect(m) : undefined}
            load={load}
            unavailable={noVideos && isVideo(m.media?.thumbnail?.mediaUrl)}
          />
        )}
      />
    </>
  ) : (
    <>
      <MediaList
        media={gridMedia}
        bands={bands}
        fitOf={fitOf}
        usageOf={usageOf}
        selection={selection}
        disabled={disabled}
        videoSizes={videoSizes}
        onVideoLoad={handleVideoLoad}
        onView={selectionMode ? undefined : handleView}
        selectionMode={selectionMode}
        pendingFilesHook={pendingFilesHook}
        // Файл, БРОШЕННЫЙ в сетку, идёт той же дорогой, что кнопка выбора и ⌘V: в диалоге — в
        // приёмку слота, на странице библиотеки — в очередь пачки.
        onFilesPicked={onFilesPicked}
        showAddButton={false}
        showAddTile={isStandalone && canUpload && !mobileLib}
        noMatch={
          selecting && selectView === 'selected' ? (
            <Text variant='label' className='py-10 text-center'>
              nothing selected
            </Text>
          ) : (
            noMatch
          )
        }
        touch={mobileLib}
        selecting={selecting}
        onLongPress={mobileLib && !disabled ? enterSelect : undefined}
      />
      {isStandalone && !disabled && !mobileLib && (
        <MediaSelectionBar
          selected={selection.selectedMedia}
          usage={usage}
          onClear={selection.clearSelection}
        />
      )}
      {/* Filtered / oldest-first phone list: the pill still dates what is on screen, from the
          loaded tiles; the month sheet stays shut, since the jump offsets index the plain list. */}
      {sparsePhone && (
        <DateScrubber
          scrollEl={sparseScroller}
          months={months}
          labelAt={looseLabelAt}
          offsetToScrollTop={() => 0}
          disabledJump
          insetTop={sparseTopInset}
          insetBottom={sparseBottomInset}
        />
      )}
    </>
  );

  return (
    <div className={cn('flex flex-col gap-6 pb-16', mobileLib && 'gap-2.5 pb-24')}>
      {mobileLib ? (
        <>
          {selecting ? (
            <MobileSelectHead
              count={selection.selectedMedia.length}
              view={selectView}
              allCount={libraryCount}
              onView={setSelectView}
              onExit={exitSelect}
              onDeselectAll={selection.clearSelection}
            />
          ) : (
            <MobileLibraryHead
              loaded={headTotal}
              shown={headShown}
              search={search}
              order={order}
              facets={facets}
              onSearch={setSearch}
              onOrder={setOrder}
              onOpenFilters={() => setFiltersOpen(true)}
              onSelect={() => enterSelect()}
            />
          )}
          {pendingPlate}
          <input
            ref={fileInputRef}
            type='file'
            accept='image/*,video/*'
            multiple
            className='hidden'
            onChange={handleFileChange}
          />
          <MediaFiltersSheet
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            shown={shown}
            facets={facets}
            onReset={reset}
          />
          <MediaDeleteSheet
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            selected={selection.selectedMedia}
            usage={usage}
            onDeleted={(ids) => {
              selection.deselectMany(ids);
              if (ids.length && ids.length === selection.selectedMedia.length) {
                setSelectMode(false);
                setSelectView('all');
              }
            }}
          />
          {selecting ? (
            <MobileBottomBar dark onHeight={setPhoneBar}>
              <Button
                variant='underlineReverse'
                size='sm'
                className='min-h-11'
                disabled={!selection.selectedMedia.length || downloading}
                onClick={handleDownload}
              >
                {downloading ? 'saving…' : 'download'}
              </Button>
              <Button
                size='sm'
                className='ml-auto min-h-11 border-l border-labelColor pl-4 text-error disabled:text-labelColor'
                disabled={!selection.selectedMedia.length}
                onClick={() => setDeleteOpen(true)}
              >
                delete
              </Button>
            </MobileBottomBar>
          ) : (
            canUpload && (
              <MobileBottomBar onHeight={setPhoneBar}>
                <Button
                  variant='main'
                  size='lg'
                  className='min-h-11 w-full'
                  onClick={handleUploadClick}
                >
                  + upload
                </Button>
              </MobileBottomBar>
            )
          )}
        </>
      ) : isStandalone ? (
        <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-borderColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              Media
            </Text>
            {deskTotal > 0 && (
              <Text variant='label'>
                {deskShown === deskTotal ? deskTotal : `${deskShown} / ${deskTotal}`}
              </Text>
            )}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {showFilters && (
              <Filter order={order} search={search} setOrder={setOrder} setSearch={setSearch} />
            )}
            {pendingPlate}
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*,video/*'
              multiple
              className='hidden'
              onChange={handleFileChange}
            />
            {canUpload && (
              <Button variant='main' size='lg' onClick={handleUploadClick}>
                upload
              </Button>
            )}
          </div>
        </div>
      ) : (
        (showFilters || pendingFilesHook.previews.length > 0) && (
          <div className='flex flex-col gap-2'>
            {/* ФАЙЛ С ДИСКА ПРЯМО ИЗ ДИАЛОГА. Раньше загрузить сюда что-то новое можно было
                только ⌘V или броском: кнопка выбора файла жила в шапке отдельной страницы, а
                плитка «добавить» показывалась лишь там же. Человек, у которого нужный кадр лежит
                в папке, был вынужден закрыть диалог, уйти в библиотеку, загрузить и вернуться. */}
            {canUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*,video/*'
                  multiple
                  className='hidden'
                  onChange={handleFileChange}
                />
                <div className='flex justify-end'>
                  <Button size='sm' onClick={handleUploadClick}>
                    choose a file…
                  </Button>
                </div>
              </>
            )}
            {showFilters && (
              <MediaFilterBar
                type={type}
                ratio={ratio}
                search={search}
                typeCounts={typeCounts}
                ratioCounts={ratioCounts}
                isFiltered={isFiltered}
                showVideos={showVideos !== false}
                onType={setType}
                onRatio={setRatio}
                onSearch={setSearch}
                onReset={reset}
              />
            )}
            {/* Полосы очереди здесь НЕТ. Внутри диалога выбора файл идёт в приёмку слота, а не в
                общую очередь; а сама полоса живёт на верхнем слое и легла бы на подвал диалога. */}
          </div>
        )
      )}

      {isStandalone && !mobileLib ? (
        <SideRailLayout
          rail={
            <MediaRail
              type={type}
              ratio={ratio}
              usageShelf={usageShelf}
              typeCounts={typeCounts}
              ratioCounts={ratioCounts}
              usageCounts={usageCounts}
              usagePending={usagePending}
              usageFailed={usageFailed}
              isFiltered={isFiltered}
              loaded={counted ? null : media.length}
              onType={setType}
              onRatio={setRatio}
              onUsage={setUsageShelf}
              onReset={reset}
            />
          }
        >
          {list}
        </SideRailLayout>
      ) : sparsePhone && !virtual ? (
        <div ref={looseListRef}>{list}</div>
      ) : (
        list
      )}
      {isStandalone && (
        <MediaViewer
          items={viewerItems}
          index={viewIndex}
          open={viewer.open}
          onOpenChange={(next) => {
            if (!next) setSaved(undefined);
            viewer.onOpenChange(next);
          }}
          onIndexChange={(i) => setViewId(viewable[i]?.id)}
          // Уходим роутером и закрываем просмотрщик за собой: голая ссылка перезагрузила бы
          // приложение и выкинула подгруженные страницы вместе с очередью незалитых файлов.
          onUsageNavigate={(href) => {
            viewer.onOpenChange(false);
            navigate(href);
          }}
          // Копия из режима (crop, expand, adjust, draw) — новое медиа: «saved» над лентой.
          onCopySaved={handleSaved}
          // crop | expand — режим самого просмотрщика (viewer-unify V2), не дверь библиотеки:
          // здесь остаются только её собственные мутации.
          tools={() => {
            if (!canUpload || !viewingMedia) return [];
            const refs = mediaUsageRefs(usage, viewingMedia.id);
            // Unknown usage counts as in use: the server refuses in-use media anyway.
            const inUse = refs === undefined || refs.length > 0;
            const id = viewingMedia.id;
            return [
              {
                key: 'delete',
                label: 'delete',
                confirm: 'tap again to delete',
                icon: <TrashIcon className='size-4' />,
                place: 'more',
                tone: 'danger',
                disabled: inUse || id == null || deleteMedia.isPending,
                onClick: () => {
                  if (id == null) return;
                  const next = viewable[viewIndex + 1] ?? viewable[viewIndex - 1];
                  deleteMedia.mutate(id, {
                    onSuccess: () => {
                      showMessage(`${id} deleted`, 'success');
                      if (next) setViewId(next.id);
                      else viewer.onOpenChange(false);
                    },
                    onError: (e) =>
                      showMessage(e instanceof Error ? e.message : `${id} kept`, 'error'),
                  });
                },
              },
            ];
          }}
          notice={
            saved ? (
              <MediaSavedBar
                original={saved.original}
                saved={saved.media}
                onDismiss={dismissSaved}
                onOpen={() => {
                  setViewId(saved.media.id);
                  setSaved(undefined);
                }}
              />
            ) : undefined
          }
        />
      )}

      {hasNextPage && !virtual && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && (
            <Text variant='label' className='animate-pulse'>
              loading more media…
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
