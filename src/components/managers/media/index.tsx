import { common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import {
  MediaViewer,
  ViewerAction,
  mediaFullListToViewerItems,
  mediaFullViewerSrc,
  useMediaViewer,
} from 'ui/components/media-viewer';
import { SideRailLayout } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { Filter } from './components/filter';
import { MediaFilterBar } from './components/media-filter-bar';
import { SlotFit } from './components/media-item';
import { MediaList } from './components/media-list';
import { MediaRail } from './components/media-rail';
import { MediaRecropDialog } from './components/media-recrop-dialog';
import { MediaSelectionBar } from './components/media-selection-bar';
import { PendingMediaPlate } from './components/pending-media-plate';
import { cropLoss, matchesSlotRatio } from './utils/calculate-aspect';
import { mediaUsageRefs, usageRefHref, usageRefName, usageRefSlot } from './utils/media-usage';
import { useFilter } from './utils/useFilter';
import { usePasteFiles } from './utils/usePasteFiles';
import { useInfiniteMedia, useMediaUsage } from './utils/useMediaQuery';
import { usePendingFiles } from './utils/usePendingFiles';
import { useSelection } from './utils/useSelectMedia';

export type VideoSize = { width: number; height: number };

interface MediaLayoutProps {
  aspectRatio?: string[];
  allowMultiple?: boolean;
  disabled?: boolean;
  showVideos?: boolean;
  selectionMode?: boolean;
  showFilters?: boolean;
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
  targetRatios,
  onFilesPicked,
  selected,
  onSelectionChange,
}: MediaLayoutProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMedia();
  const { ref, inView } = useInView();
  const navigate = useNavigate();
  const prevInViewRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Список СОБИРАЕТСЯ ОДИН РАЗ НА ОТВЕТ, а не на каждый рендер: пересобранный массив — новая
  // ссылка, и мемоизация отбора внутри `useFilter` не срабатывала бы ни разу, пересчитывая
  // фасетные счётчики и сортировку на каждое нажатие клавиши в поиске.
  const media = useMemo(
    () => data?.pages.flatMap((page) => page.media as common_MediaFull[]) || [],
    [data],
  );
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});

  const pendingFilesHook = usePendingFiles();
  const { canWrite } = usePermissions();

  // Standalone page shows a header + toolbar; the embedded selector (selectionMode) stays minimal.
  const isStandalone = !selectionMode;
  const canUpload = canWrite(SECTION.media);

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
  usePasteFiles({ claims: isStandalone && canUpload, accept: 'media' }, pendingFilesHook.addFiles);

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
  );

  const selection = useSelection({
    allowMultiple,
    disabled,
    value: selected,
    onSelectionChange,
  });

  useEffect(() => {
    const justEnteredView = inView && !prevInViewRef.current;
    prevInViewRef.current = inView;
    if (justEnteredView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
  const viewable = useMemo(
    () => (filteredMedia || []).filter((m) => !!mediaFullViewerSrc(m)),
    [filteredMedia],
  );
  const viewerItems = useMemo(
    () => mediaFullListToViewerItems(viewable, viewerUsageOf),
    [viewable, viewerUsageOf],
  );
  const viewer = useMediaViewer();
  const viewingMedia = viewable[viewer.index];
  const [recropping, setRecropping] = useState<common_MediaFull | undefined>(undefined);

  const handleView = (m: common_MediaFull) => {
    const at = viewable.findIndex((x) => x.id === m.id);
    if (at >= 0) viewer.openAt(at);
  };

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

  const list = (
    <>
      <MediaList
        media={filteredMedia || []}
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
        showAddTile={isStandalone && canUpload}
        noMatch={noMatch}
      />
      {isStandalone && !disabled && (
        <MediaSelectionBar
          selected={selection.selectedMedia}
          usage={usage}
          onClear={selection.clearSelection}
        />
      )}
    </>
  );

  return (
    <div className='flex flex-col gap-6 pb-16'>
      {isStandalone ? (
        <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              Media
            </Text>
            {media.length > 0 && (
              <Text variant='label'>
                {shown === media.length ? media.length : `${shown} / ${media.length}`}
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

      {isStandalone ? (
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
              loaded={media.length}
              onType={setType}
              onRatio={setRatio}
              onUsage={setUsageShelf}
              onReset={reset}
            />
          }
        >
          {list}
        </SideRailLayout>
      ) : (
        list
      )}
      {isStandalone && (
        <MediaViewer
          items={viewerItems}
          index={viewer.index}
          open={viewer.open}
          onOpenChange={viewer.onOpenChange}
          onIndexChange={viewer.onIndexChange}
          // Уходим роутером и закрываем просмотрщик за собой: голая ссылка перезагрузила бы
          // приложение и выкинула подгруженные страницы вместе с очередью незалитых файлов.
          onUsageNavigate={(href) => {
            viewer.onOpenChange(false);
            navigate(href);
          }}
          actions={() =>
            canUpload && viewingMedia ? (
              <ViewerAction
                onClick={() => {
                  setRecropping(viewingMedia);
                  viewer.onOpenChange(false);
                }}
              >
                crop
              </ViewerAction>
            ) : null
          }
        />
      )}

      <MediaRecropDialog
        media={recropping}
        open={!!recropping}
        onOpenChange={(next) => !next && setRecropping(undefined)}
      />

      {hasNextPage && (
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
