import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { usePasteImage } from 'components/managers/media/utils/usePasteImage';
import { useUploadMedia } from 'components/managers/media/utils/useUploadMedia';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AnnotationSurface,
  type PenStyle,
  type ShapePoint,
  type SurfaceCallout,
} from './annotation/surface';
import { AnnotationToolbar, placingHint } from './annotation/toolbar';
import { AnnotationZoomDialog } from './annotation/zoom-dialog';
import { Button } from './button';
import { Chip, ChipRow } from './chip';
import { Placeholder } from './placeholder';
import Text from './text';
import { Toolbar, ToolbarSpacer } from './toolbar';

// An annotate-in-place gallery. Two layouts over one set of bindings:
//
//   `focused`  ONE large image + a thumbnail carousel (the fitting photos).
//   `grid`     EVERY view visible at once, each with its own pins (the tech-card sketch and
//              moodboard). Comparing front to back is how a fitting conversation actually goes,
//              so nothing should have to be clicked to see both.
//
// It owns only the interaction grammar — the numbered callout PINS + hover/edit/✕ notes ride the
// shared AnnotatedImage, so the phantom-callout hardening there (a ✕ press or an out-of-bounds
// click never drops a pin) is inherited by every surface that reuses this component.
//
// Everything form- or domain-specific is injected: the resolved media (`views`), the callouts for
// an image (`calloutsFor` + the add/move/remove/render callbacks), how a picked image is committed
// (`onPickMedia`), and any per-image caption controls (`renderFocusedFooter`). That keeps the same
// gallery driving the tech-card moodboard + technical sketch AND the fitting photos, each binding
// its own React Hook Form fields, without this component knowing which form it sits in.

/** One resolved, URL-bearing image the gallery shows. `key` is a stable React identity. */
export type FocusedView = {
  key: string;
  mediaId: number;
  full: common_MediaFull;
};

const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

// Frame each image to the media's own aspect ratio so the picture fills it exactly (no crop,
// no letterbox) — which keeps every pin mapped 1:1 onto the image it was placed on. Fitting photos
// are unconstrained, so the fallback is only used when the media carries no dimensions. This is
// also why the grid does NOT force a uniform 3/4 tile: a forced ratio would crop the picture out
// from under its own pins.
function mediaAspect(full: common_MediaFull | undefined, fallback: string): string {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : fallback;
}

const isMediaFile = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');

/** Width of one rail cell, and the gap between two — the arrow step has to match the snap step. */
const RAIL_CARD = 300;
const RAIL_GAP = 8;

// Horizontal rail controller: reports whether the strip actually overflows (so the arrows only
// exist when they do anything) and steps by exactly one card, wrapping at both ends. The wrap is
// what makes it read as a loop; cloning the views to get a truly seamless one would duplicate
// media ids, and every pin, piece and "pinned to" select addresses an image BY id.
function useRailScroll(itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    // Both the rail (viewport width) and its content (a view added or removed) move the answer.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [itemCount]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width;
    const by = (card || RAIL_CARD) + RAIL_GAP;
    const max = el.scrollWidth - el.clientWidth;
    const next = el.scrollLeft + dir * by;
    // Clamp to the end first, and only wrap once already there — otherwise a rail that overflows
    // by less than one card would jump from the start straight back to the start.
    const atEnd = el.scrollLeft >= max - 1;
    const atStart = el.scrollLeft <= 1;
    const left = dir === 1 ? (atEnd ? 0 : Math.min(next, max)) : atStart ? max : Math.max(next, 0);
    el.scrollTo({ left, behavior: 'smooth' });
  };

  return { ref, overflowing, step };
}

// Drag-and-drop plumbing for a single drop target. Kept local (rather than reusing the media
// manager's DragDropArea) because that one is bound to the manager's pending-files queue, while
// here a dropped file must go straight up through `onPickMedia`.
function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return { dragging, handlers };
}

export type FocusedAnnotatorProps = {
  /** Resolved, URL-bearing images in display order. Position 0 is the preview when `previewFirst`. */
  views: FocusedView[];

  /** Указания, приколотые к одной картинке, уже в вью-модели поверхности. */
  calloutsFor: (mediaId: number) => SurfaceCallout[];
  /**
   * Указание поставлено. ОДИН колбэк на все виды, включая пин: раньше их было два (`onAddCallout`
   * для точки и `onAddShape` для фигуры), и владельцу приходилось дважды писать одно и то же
   * создание выноски — второй экземпляр немедленно разошёлся с первым по умолчаниям.
   *
   * У ПИНА ЯКОРЕЙ НЕТ: его единственная точка И ЕСТЬ нумерованный маркер, и дублировать её в
   * якорях значило бы завести два места для одной координаты. Владелец кладёт `points[0]` в
   * posX/posY и оставляет якоря пустыми.
   */
  onAddCallout: (mediaId: number, kind: string, points: ShapePoint[], pen: PenStyle) => void;
  onMoveCallout: (key: string, xNorm: number, yNorm: number) => void;
  onRemoveCallout: (key: string) => void;
  /**
   * РЕДАКТОР выбранного указания — рисуется ПОД КАДРОМ, а не всплывает над пином.
   *
   * Раньше здесь была `renderNote`: записка в портале поверх картинки. Портал рендерится в
   * `document.body`, то есть ВНЕ `<fieldset disabled>` карточки со всем содержимым, — и текст
   * подписанной выноски правился на выпущенной карточке молча. Плюс это был ВТОРОЙ способ
   * записать текст указания: у снимка шага он всегда жил в редакторе под кадром.
   */
  renderEditor: (key: string, opts: { close: () => void }) => ReactNode;
  /** Optional header title inside a note (e.g. a part code, or a constant "fit note"). */

  /** Commit newly-picked media (caller dedupes + appends) and return the ids actually added, so the
   *  first fresh image can be focused immediately. */
  onPickMedia: (items: common_MediaFull[]) => number[];
  /** Remove one image (caller drops it from its list and un-pins its callouts). */
  onRemoveMedia: (view: FocusedView) => void;

  /** MediaSelector trigger label + dialog purpose; `pickerAspectRatio` left undefined = any ratio. */
  addLabel: string;
  purpose: string;
  pickerAspectRatio?: string[];

  /** `focused` = one big image + thumbs. `grid` = every view at once, each with its own pins. */
  layout?: 'focused' | 'grid';
  emptyLabel: string;
  /** Aspect used only when a media has no known dimensions (e.g. '4/5', '3/4'). */
  fallbackAspect?: string;
  /** Show a "preview" badge on the first thumbnail (the surface's card preview). */
  previewFirst?: boolean;
  /** Accessible name for an image + lightbox (per image). */
  mediaLabel?: (view: FocusedView, positionInViews: number) => string;
  /** Caption controls under an image (kind select, "set as preview", …). In `grid` this renders
   *  under EVERY cell; in `focused` only under the focused image. */
  renderFocusedFooter?: (view: FocusedView, positionInViews: number) => ReactNode;
  /** Accessible label for the thumbnail carousel / the grid. */
  carouselLabel?: string;
  /**
   * ВИДЫ УКАЗАНИЙ, доступные на этой поверхности — ключи общего реестра. Не задан — весь набор
   * панели. Примерка передаёт `['pin']`: там указание это заметка о посадке, и мерка на фото
   * примерки означала бы измерение, которого никто не делал.
   *
   * Число якорей у вида приходит из реестра, а не отсюда: «у мерки две точки» — знание отрисовки
   * и жеста, и держать его в доменном слое значило бы держать его в двух местах.
   */
  calloutKinds?: string[];
  /**
   * Белая подложка под линиями указаний. Включать на ФОТОГРАФИЯХ (мудборд, примерка): чернильная
   * линия на пёстром снимке тонет, и указание перестаёт быть видно ровно там, где его поставили.
   * На ШТРИХОВОМ ЭСКИЗЕ выключать — подложка перекрыла бы линии самого чертежа.
   *
   * ПРОПОМ, А НЕ ПО НАЗВАНИЮ ЛИСТА: `purpose` это подпись для человека («tech sketch», «moodboard
   * reference»), и решать по ней поведение значит связать отрисовку с текстом, который однажды
   * перепишут, ничего не сломав на вид.
   */
  halo?: boolean;
  /**
   * Поверхность заморожена (выпущенная карточка): читать можно всё, писать нельзя ничего.
   *
   * ФЛАГ ОБЯЗАТЕЛЕН, ПОТОМУ ЧТО `<fieldset disabled>` ЗАМОРОЗКОЙ НЕ ЯВЛЯЕТСЯ. Замерено в Chromium:
   * у кнопки под таким предком не стреляют только `click` и `focus`, а `pointerdown`, `pointerup`
   * и `pointerenter` — стреляют. Значит перетаскивание пина (оно начинается с `pointerdown`, а
   * заканчивается слушателями на window) работало на подписанной карточке в полный рост. Плюс
   * записка живёт в `Popover.Portal`, то есть рендерится в `document.body` — ВНЕ fieldset вообще,
   * со всем своим содержимым: и «✕ убрать», и полем текста.
   *
   * Поэтому здесь гасится не показ, а КАЖДЫЙ путь записи: перетаскивание, удаление, постановка,
   * правка текста, добавление и снятие картинок, ⌘V. Читательские жесты — наведение, зум,
   * «показать все записки» — остаются живыми: выпущенную карточку именно читают.
   */
  readOnly?: boolean;
  /** Якоря поставленной фигуры изменились — точку подвинули, добавили или убрали. */
  onEditPoints?: (key: string, points: ShapePoint[]) => void;
  /** Перед каждой мутацией фигур: владелец запоминает состояние для отката (⌘Z). */
  onBeforeMutate?: () => void;
  onUndo?: () => void;
  canUndo?: () => boolean;
  /** Имя детали по ключу — плашке на кадре и легенде под ним. */
  pieceLabel?: (key: string) => string | undefined;
  /** Grid only: when set, the grid is a fixed-HEIGHT filmstrip — every image is this many px tall
   *  and keeps its own aspect (natural width, so a landscape is wider), and only the horizontal axis
   *  scrolls. The image is never cropped, so callout pins still map 1:1. Unset = the default
   *  300px-wide, width-driven tiles. */
  gridRowHeight?: number;
};

export function FocusedAnnotator({
  views,
  calloutsFor,
  onAddCallout,
  onMoveCallout,
  onRemoveCallout,
  renderEditor,
  onPickMedia,
  onRemoveMedia,
  addLabel,
  purpose,
  pickerAspectRatio,
  layout = 'focused',
  emptyLabel,
  fallbackAspect = '4/5',
  previewFirst = false,
  mediaLabel,
  renderFocusedFooter,
  carouselLabel,
  gridRowHeight,
  calloutKinds,
  onEditPoints,
  onBeforeMutate,
  onUndo,
  canUndo,
  pieceLabel,
  halo = false,
  readOnly = false,
}: FocusedAnnotatorProps) {
  /**
   * Инструмент постановки. ОДНО состояние вместо трёх (`addMode` + `shapeKind` + набранные точки):
   * они описывали одно и то же и умели рассогласоваться — вид снят, режим включён, и следующий
   * клик по эскизу ронял на него посторонний пин. Точки теперь копятся ВНУТРИ поверхности, на
   * своём кадре: мерка, растянутая между передом и спинкой, — не мерка.
   */
  const [tool, setTool] = useState<string | null>(null);
  const [placed, setPlaced] = useState(0);
  /** Индекс кадра, открытого во весь экран. */
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadMedia = useUploadMedia();
  // +1 for the trailing "+ add view" slot, which is part of what can overflow.
  const rail = useRailScroll(views.length + 1);

  const isGrid = layout === 'grid';
  // Filmstrip mode: fixed-height, natural-width tiles, horizontal-only scroll (the moodboard).
  const rowMode = isGrid && gridRowHeight != null;
  const hasMedia = views.length > 0;
  const focused = views.find((v) => v.mediaId === focusedId) ?? views[0];
  const focusedPosition = focused ? views.findIndex((v) => v.mediaId === focused.mediaId) : -1;
  const focusedUrl = mediaUrl(focused?.full);
  const focusedAlt = focused && mediaLabel ? mediaLabel(focused, focusedPosition) : '';

  const focusedViewerIndex = Math.max(0, focusedPosition);

  // Commit the pick through the caller, then focus the first freshly-added image so it is
  // immediately annotatable.
  function handlePick(items: common_MediaFull[]) {
    const added = onPickMedia(items);
    if (added.length && added[0] != null) setFocusedId(added[0]);
  }

  // ⌘V ПРЯМО В ГАЛЕРЕЮ. Референс почти всегда рождается в буфере — скрин с чужого показа, кроп из
  // лукбука, — и путь «сохранить файлом → открыть библиотеку → загрузить» стоит трёх шагов ради
  // картинки, которая уже в руках. Включено, только пока указатель ВНУТРИ этой галереи: на
  // странице их две (мудборд и эскиз) плюс полоса снимков у каждого шага, и без этого одна
  // вставка ушла бы во все сразу.
  const [hot, setHot] = useState(false);
  const { pasting } = usePasteImage(hot && !readOnly, handlePick);

  // Removing the focused image falls focus back to the new first image.
  function handleRemoveMedia(view: FocusedView) {
    if (view.mediaId === focusedId) setFocusedId(null);
    onRemoveMedia(view);
  }

  // Drop / browse straight into the gallery: upload each file, then commit the resolved media the
  // same way a library pick would. Failures are already surfaced by the upload hook's snackbar, so
  // one bad file in a batch doesn't lose the rest.
  async function handleFiles(files: File[]) {
    const accepted = files.filter(isMediaFile);
    if (!accepted.length) return;
    setUploading(true);
    const added: common_MediaFull[] = [];
    for (const file of accepted) {
      try {
        added.push(await uploadMedia.mutateAsync(file));
      } catch {
        /* surfaced by useUploadMedia */
      }
    }
    setUploading(false);
    if (added.length) handlePick(added);
  }

  const modeToggles = (
    <ChipRow>
      {/* ПАНЕЛЬ ВИДОВ — общая, та же, что у снимков шага сборки. Отдельного тумблера «add
          callout» нет: выбранный вид сам и есть режим постановки, а два выключателя одного и
          того же расходились ровно так, как расходились здесь. */}
      {!readOnly && hasMedia && (
        <AnnotationToolbar
          tool={tool}
          onTool={setTool}
          kinds={calloutKinds}
          hint={tool ? (placed > 0 ? placingHint(tool, placed) : 'кликайте по нужной картинке') : undefined}
        />
      )}
    </ChipRow>
  );

  const hint = pasting
    ? 'загружаю картинку из буфера…'
    : tool
      ? placingHint(tool, placed)
      : 'наведите на пин — прочесть · клик по пину или по линии — правка · ⌘V вставит картинку';

  // The focused layout's add-media control. Rendered OUTSIDE the hasMedia branch (below), because
  // with zero views it is the ONLY way to get a first image and its callers (the fitting form) have
  // no other media-add path: gating it on `hasMedia` made the empty state a dead end, where a new
  // fitting could never get its first photo and removing the last one made re-adding impossible.
  // Staying mounted across empty → populated also keeps an open picker dialog alive through the
  // pick that fills the gallery. (The grid layout has its own always-present AddTile slot instead.)
  const addControl = readOnly ? null : (
    <MediaSelector
      label={addLabel}
      purpose={purpose}
      aspectRatio={pickerAspectRatio}
      allowMultiple
      showVideos
      saveSelectedMedia={handlePick}
      trigger={
        <Button type='button' variant='main' size='sm'>
          {addLabel}
        </Button>
      }
    />
  );

  return (
    <div
      className='space-y-2.5'
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
    >
      {hasMedia &&
        (isGrid ? (
          // The toggles are modes of the whole sheet now, not of one focused image — so they sit
          // in a bar above the grid and apply to every cell at once.
          <Toolbar>
            <Text size='micro' variant='label' component='span'>
              {hint}
            </Text>
            <ToolbarSpacer />
            {/* Only once the rail actually runs off the edge — arrows that can't move anything are
                noise. They live in the bar rather than floating over the pictures, where they would
                sit on top of the pins they exist to help you reach. */}
            {rail.overflowing && (
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  aria-label='previous view'
                  onClick={() => rail.step(-1)}
                >
                  ‹
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  aria-label='next view'
                  onClick={() => rail.step(1)}
                >
                  ›
                </Button>
              </div>
            )}
            {modeToggles}
          </Toolbar>
        ) : (
          <div className='flex flex-wrap items-center justify-between gap-2.5'>
            <Text size='micro' variant='label' component='span'>
              {hint}
            </Text>
            {modeToggles}
          </div>
        ))}

      {isGrid ? (
        <>
          <div
            ref={rail.ref}
            aria-label={carouselLabel}
            // A ONE-ROW rail, not a wrapping grid: 300px cells (a callout pin has to land on a seam
            // you can actually see) that stay one row and scroll sideways, with the arrows above
            // looping past either end. Trade-off: `overflow-x` makes the vertical axis scroll too,
            // so in show-all-notes mode a note pinned near the top or bottom edge can be clipped —
            // the hover notes are portalled and unaffected. `py-1` buys back the common case.
            className={cn(
              'flex snap-x snap-mandatory items-start gap-2 overflow-x-auto py-1',
              // Filmstrip: only the horizontal axis scrolls. Hover notes are portalled, so nothing
              // useful is clipped vertically.
              rowMode && 'overflow-y-hidden',
            )}
          >
            {views.map((v, i) => {
              const url = mediaUrl(v.full);
              return (
                <div
                  key={v.key}
                  className={cn(
                    'relative shrink-0 snap-start space-y-1',
                    rowMode ? 'w-fit' : 'w-[300px] max-w-[85vw]',
                  )}
                >
                  <AnnotationSurface
                    src={url}
                    alt={mediaLabel ? mediaLabel(v, i) : ''}
                    media={isVideo(url) ? 'video' : 'image'}
                    aspectRatio={mediaAspect(v.full, fallbackAspect)}
                    className={rowMode ? 'w-fit' : undefined}
                    frameClassName={rowMode ? 'w-auto' : 'w-full'}
                    frameStyle={rowMode ? { height: gridRowHeight } : undefined}
                    callouts={calloutsFor(v.mediaId)}
                    frozen={readOnly}
                    tool={tool}
                    onToolDone={() => setTool(null)}
                    onPlacedCountChange={setPlaced}
                    // The full 240px note now fits over a 300px tile, so it no longer needs trimming.
                    // каждый приходится перекрашивать поштучно в списке выносок — то есть панель
                    // без цвета оправдана памятью пера, которой бы не было.
                    onAdd={(kind, points, pen) => onAddCallout(v.mediaId, kind, points, pen)}
                    onEditPoints={onEditPoints}
                    onBeforeMutate={onBeforeMutate}
                    onUndo={onUndo}
                    canUndo={canUndo}
                    pieceLabel={pieceLabel}
                    onMoveLabel={(key, at) => onMoveCallout(key, at.x, at.y)}
                    onRemove={onRemoveCallout}
                    renderEditor={renderEditor}
                    legend
                    halo={halo}
                    cornerSlot={
                      <div className='flex items-center gap-1'>
                        {/* Зум — ЧИТАТЕЛЬСКИЙ жест и остаётся на выпущенной карточке: мерку и дугу
                            на плитке в 300px не разглядеть, увеличение и есть способ их прочесть. */}
                        <FrameButton
                          ariaLabel={`увеличить · панорама · правка — картинка ${i + 1}`}
                          onPress={() => setZoomIndex(i)}
                        >
                          зум
                        </FrameButton>
                        {!readOnly && (
                          <FrameButton
                            ariaLabel={`remove image ${i + 1}`}
                            onPress={() => handleRemoveMedia(v)}
                          >
                            ✕
                          </FrameButton>
                        )}
                      </div>
                    }
                  />
                  {/* Position marker — pieces / operations / the "pinned to" select all address
                      images by this number. */}
                  <span className='pointer-events-none absolute left-0 top-0 z-[4] bg-textColor px-1 py-px text-nano leading-none tabular-nums text-bgColor'>
                    {i + 1}
                  </span>
                  {renderFocusedFooter?.(v, i)}
                </div>
              );
            })}

            {/* "+ add view" — a dashed slot in the grid itself, so the empty spot IS the control
                that fills it. Clicking opens the media library: a sketch view is nearly always an
                image that already exists, and sending the click straight to the OS file dialog
                made the library the harder path to reach. Dropping files on the tile still
                uploads — that gesture already carries the file. */}
            {!readOnly && (
            <MediaSelector
              label={addLabel}
              purpose={purpose}
              aspectRatio={pickerAspectRatio}
              allowMultiple
              showVideos
              saveSelectedMedia={handlePick}
              trigger={
                <AddTile
                  aspect={fallbackAspect}
                  heightPx={rowMode ? gridRowHeight : undefined}
                  busy={uploading}
                  onFiles={handleFiles}
                  className={cn(
                    'shrink-0 snap-start',
                    rowMode ? 'w-fit' : 'w-[300px] max-w-[85vw]',
                  )}
                />
              }
            />
            )}
          </div>

          {!hasMedia && (
            <Text size='micro' variant='label'>
              {emptyLabel}
            </Text>
          )}
          {/* No separate "add image" panel below the grid: the ghost slot IS the add control, and
              a second one restated the same action twice on the same screen. */}
        </>
      ) : !hasMedia ? (
        <Text size='micro' variant='label'>
          {emptyLabel}
        </Text>
      ) : (
        <div className='space-y-2.5'>
          {/* Focused image — annotate in place; the zoom control opens the lightbox for pan + draw */}
          {focused && (
            <div className='mx-auto w-full max-w-[26rem] space-y-2'>
              <AnnotationSurface
                src={focusedUrl}
                alt={focusedAlt}
                media={isVideo(focusedUrl) ? 'video' : 'image'}
                aspectRatio={mediaAspect(focused.full, fallbackAspect)}
                callouts={calloutsFor(focused.mediaId)}
                frozen={readOnly}
                tool={tool}
                onToolDone={() => setTool(null)}
                onPlacedCountChange={setPlaced}
                onAdd={(kind, points, pen) => onAddCallout(focused.mediaId, kind, points, pen)}
                onEditPoints={onEditPoints}
                onBeforeMutate={onBeforeMutate}
                onUndo={onUndo}
                canUndo={canUndo}
                pieceLabel={pieceLabel}
                onMoveLabel={(key, at) => onMoveCallout(key, at.x, at.y)}
                onRemove={onRemoveCallout}
                renderEditor={renderEditor}
                    legend
                halo={halo}
                cornerSlot={
                  <FrameButton
                    ariaLabel='увеличить · панорама · правка'
                    onPress={() => setZoomIndex(focusedViewerIndex)}
                  >
                    зум
                  </FrameButton>
                }
              />

              {renderFocusedFooter?.(focused, focusedPosition)}
            </div>
          )}

          {/* Thumbnail carousel — every image; click to focus. The first is the preview. */}
          <div
            aria-label={carouselLabel}
            className='flex snap-x items-start gap-2 overflow-x-auto pb-2'
          >
            {views.map((v, i) => {
              const active = focused?.mediaId === v.mediaId;
              const isPreview = previewFirst && i === 0;
              const url = thumbUrl(v.full);
              const video = isVideo(mediaUrl(v.full)) || isVideo(url);
              return (
                <div key={v.key} className='relative shrink-0 snap-start'>
                  <button
                    type='button'
                    aria-current={active ? 'true' : undefined}
                    aria-label={`focus image ${i + 1}`}
                    onClick={() => setFocusedId(v.mediaId)}
                    className={cn(
                      'block size-16 overflow-hidden border transition-opacity sm:size-20',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                      active
                        ? 'border-textColor outline outline-1 outline-offset-1 outline-textColor'
                        : 'border-borderColor opacity-70 hover:opacity-100',
                    )}
                  >
                    {video ? (
                      <video src={url} muted className='size-full object-cover' />
                    ) : (
                      <img src={url} alt='' draggable={false} className='size-full object-cover' />
                    )}
                  </button>
                  <span className='pointer-events-none absolute left-0 top-0 bg-textColor px-1 py-px text-nano leading-none tabular-nums text-bgColor'>
                    {i + 1}
                  </span>
                  {isPreview && (
                    <span className='pointer-events-none absolute inset-x-0 bottom-0 bg-textColor px-1 py-px text-center text-nano uppercase leading-none tracking-label text-bgColor'>
                      preview
                    </span>
                  )}
                  {!readOnly && (
                  <button
                    type='button'
                    aria-label={`remove image ${i + 1}`}
                    onClick={() => handleRemoveMedia(v)}
                    className='absolute right-0 top-0 cursor-pointer border border-borderColor bg-bgColor px-1 py-px text-nano leading-none hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                  >
                    ✕
                  </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Always present in the focused layout — the empty hint above tells you to add a photo, so
          the control that adds one has to be reachable in that state too. */}
      {!isGrid && addControl}

      {/* УВЕЛИЧЕННЫЙ ВИД — ТА ЖЕ ПОВЕРХНОСТЬ, а не лайтбокс с нарисованной поверх копией.
          Раньше здесь висел общий просмотрщик, которому фигуры и записки рисовали ВТОРЫМ
          экземпляром кода: он умел показывать, но не править, и расходился с плиткой на каждой
          правке первого. Теперь это тот же surface — со своей панелью видов, своим счётчиком
          точек и полной правкой: указание по миллиметровой детали ставят именно в зуме. */}
      {zoomIndex != null && views[zoomIndex] && (
        <AnnotationZoomDialog
          open
          onOpenChange={(v) => !v && setZoomIndex(null)}
          title={mediaLabel ? mediaLabel(views[zoomIndex], zoomIndex) : (carouselLabel ?? 'картинка')}
          src={mediaUrl(views[zoomIndex].full)}
          media={isVideo(mediaUrl(views[zoomIndex].full)) ? 'video' : 'image'}
          callouts={calloutsFor(views[zoomIndex].mediaId)}
          frozen={readOnly}
          toolKinds={calloutKinds}
          halo={halo}
          onAdd={(kind, points, pen) => onAddCallout(views[zoomIndex].mediaId, kind, points, pen)}
          onEditPoints={onEditPoints}
          onBeforeMutate={onBeforeMutate}
          onUndo={onUndo}
          canUndo={canUndo}
          pieceLabel={pieceLabel}
          onMoveLabel={(key, at) => onMoveCallout(key, at.x, at.y)}
          onRemove={onRemoveCallout}
          renderEditor={renderEditor}
                    legend
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A control floating on an image frame (zoom, remove). It has to swallow its own pointer
// gestures, or the press underneath reaches the Stage's add-callout / pan handler.
// ---------------------------------------------------------------------------

function FrameButton({
  ariaLabel,
  onPress,
  children,
}: {
  ariaLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  // НЕ `<Button>`, а span с ролью. Эта кнопка живёт внутри общего `<fieldset disabled>` выпущенной
  // карточки, а у нативной кнопки под таким предком не стреляет `click` (замерено в Chromium:
  // гасятся ровно `click` и `focus`). Единственный жест, которым мерку на плитке 300px вообще
  // можно прочесть, — увеличение; сделать его мёртвым на подписанной карточке значило бы закрыть
  // чтение там, где только чтение и осталось. Соседи по этой же роли — `annotation-canvas`
  // и `operation-media-strip` — сделаны спанами по той же причине.
  return (
    <span
      role='button'
      tabIndex={0}
      aria-label={ariaLabel}
      title={ariaLabel}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className='cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The "+ add view" grid cell — a dashed slot that opens the media library on click and accepts a
// file drop, so the empty spot in the grid is itself the control that fills it.
//
// It spreads the props it is given rather than taking an `onClick`, because it is handed to
// `MediaSelector` through Radix `asChild`: the dialog's own trigger props (onClick, aria-haspopup,
// data-state) arrive as props and have to land on the real button or the tile does nothing.
// ---------------------------------------------------------------------------

function AddTile({
  aspect,
  heightPx,
  busy,
  onFiles,
  className,
  ...triggerProps
}: {
  aspect: string;
  /** Filmstrip mode: fix the slot's height (natural width from the ratio) so it matches the tiles. */
  heightPx?: number;
  busy: boolean;
  onFiles: (files: File[]) => void;
} & React.ComponentPropsWithRef<'button'>) {
  const { dragging, handlers } = useFileDrop(onFiles);
  return (
    <button
      type='button'
      {...triggerProps}
      // After the trigger props, so a drop is always handled here and never by the dialog.
      {...handlers}
      aria-label='add view'
      className={cn(
        'block cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        className,
      )}
    >
      <Placeholder
        dashed
        label={busy ? 'uploading…' : dragging ? 'drop to upload' : '+ add view'}
        // The ratio lives on the placeholder itself, so it never depends on a percentage
        // height resolving against the button. In filmstrip mode a fixed height (natural width)
        // makes the add slot the same height as the image tiles.
        style={heightPx != null ? { aspectRatio: aspect, height: heightPx } : { aspectRatio: aspect }}
        className={cn(heightPx != null ? 'w-auto' : 'w-full', dragging && 'border-textColor text-textColor')}
      />
    </button>
  );
}

