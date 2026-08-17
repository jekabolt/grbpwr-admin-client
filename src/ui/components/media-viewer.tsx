import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from '@radix-ui/react-icons';
import type { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useImageAnnotate, useMediaStageGestures, ZoomDrawToolbar } from './media-viewer-zoom';

// One normalized shape the viewer understands. Every call site maps its own data
// (proto MediaFull, a bare url, a { thumbnail, fullSize } row) down to this.
export interface MediaViewerItem {
  /** Large source shown on the stage. */
  src: string;
  /** Small source for the filmstrip / grid (falls back to src). */
  thumbnail?: string;
  /** Inferred from the url when omitted. */
  type?: 'image' | 'video';
  /** Accessible label / caption. */
  alt?: string;
  /**
   * Всё, что бакет знает о файле. Панель сведений в просмотрщике появилась потому, что до неё
   * эти цифры жили в отдельном диалоге `PreviewMedia`, который открывался ВМЕСТО просмотрщика и
   * показывал миниатюру 480px, растянутую в коробку 500×400. Открывать одно, чтобы посмотреть
   * снимок, и другое, чтобы узнать его размер, — две двери в одну комнату.
   */
  meta?: {
    id?: number;
    createdAt?: string;
    blurhash?: string;
    /** Размеры, которые бакет держит на один объект: оригинал, сжатое, миниатюра. */
    renditions?: { label: string; url?: string; width?: number; height?: number }[];
    /**
     * Где стоит этот снимок. Приходит СНАРУЖИ, рядом с `renditions`: просмотрщик остаётся
     * смотрелкой и в сеть не ходит — иначе один и тот же вопрос задавали бы и сетка, и он.
     *
     * `undefined` — занятость не выяснена, и раздела в панели нет; пустой массив — файл
     * действительно свободен, и это сказано словами. Адрес карточки считает вызывающий: роуты
     * есть не у всякого пространства, и знать об этом примитиву `ui` не положено.
     */
    usage?: { kind?: string; label?: string; slot?: string; href?: string }[];
  };
}

/**
 * Адрес, который просмотрщик поставит на сцену. Вынесен наружу, потому что по нему же
 * отсеиваются кадры без адреса, а вызывающий обязан уметь отсеять их ТЕМ ЖЕ правилом — иначе
 * его индексы разъедутся с рядом просмотрщика (см. `mediaFullListToViewerItems`).
 */
export function mediaFullViewerSrc(m: common_MediaFull): string {
  const media = m.media;
  return media?.fullSize?.mediaUrl || media?.compressed?.mediaUrl || media?.thumbnail?.mediaUrl || '';
}

/** Map a proto `common_MediaFull` to a viewer item (full-size preferred, thumb for the strip). */
export function mediaFullToViewerItem(m: common_MediaFull): MediaViewerItem {
  const media = m.media;
  const src = mediaFullViewerSrc(m);
  const thumbnail = media?.thumbnail?.mediaUrl || media?.compressed?.mediaUrl || src;
  return {
    src,
    thumbnail,
    type: isVideo(src) ? 'video' : 'image',
    alt: media?.blurhash || '',
    meta: {
      id: m.id,
      createdAt: m.createdAt,
      blurhash: media?.blurhash,
      renditions: [
        { label: 'original', info: media?.fullSize },
        { label: 'compressed', info: media?.compressed },
        { label: 'thumbnail', info: media?.thumbnail },
      ]
        .filter((r) => r.info?.mediaUrl)
        .map((r) => ({
          label: r.label,
          url: r.info?.mediaUrl,
          width: r.info?.width,
          height: r.info?.height,
        })),
    },
  };
}

/**
 * Список кадров для просмотрщика. `usageOf` необязателен и задан ТОЛЬКО здесь, у списка: сам
 * `mediaFullToViewerItem` кое-где передаётся прямо в `Array.map`, и второй параметр у него
 * молча заполнялся бы индексом.
 *
 * ВНИМАНИЕ НА ОТСЕВ: кадр без адреса выпадает, и ряд становится короче исходного. Вызывающий,
 * который держит индекс (какой кадр открыт), обязан считать его по УЖЕ ОТСЕЯННОМУ ряду —
 * `mediaFullViewerSrc` для того и вынесен наружу. Иначе одна безадресная строка сдвигает всё,
 * что за ней, и панель приписывает одному файлу сведения другого.
 */
export function mediaFullListToViewerItems(
  list: common_MediaFull[],
  usageOf?: (id: number) => NonNullable<MediaViewerItem['meta']>['usage'],
): MediaViewerItem[] {
  return list
    .map((m) => {
      const item = mediaFullToViewerItem(m);
      const usage = m.id != null ? usageOf?.(m.id) : undefined;
      return usage ? { ...item, meta: { ...item.meta, usage } } : item;
    })
    .filter((i) => i.src);
}

export function resolveViewerType(item: MediaViewerItem): 'image' | 'video' {
  return item.type ?? (isVideo(item.src) ? 'video' : 'image');
}

/** `…/sketch-front.jpg` -> `sketch-front-annotated.png`, so a folder of exports stays readable. */
function annotatedFileName(src: string): string {
  const base = src.split('?')[0]?.split('/').pop() || 'image';
  return `${base.replace(/\.[^.]+$/, '') || 'image'}-annotated.png`;
}

/**
 * Кнопка тёмного хрома просмотрщика — и для собственных кнопок, и для тех, что владелец снимка
 * передаёт через `actions`.
 *
 * Светлый `Button` здесь не годится: у всех его вариантов ink-текст, и на чёрной сцене подпись
 * пропадает. Каждое место, где нужна кнопка поверх снимка, рисовало её своими классами —
 * четырьмя копиями одной строки.
 *
 * ДВЕ СТУПЕНИ ЛИНИЙ, как в светлой системе: `/40` — внешний контур контрола (роль `#ccc`),
 * `/20` — внутренняя линейка между строками панели (роль `#e6e6e6`).
 */
export function ViewerAction({
  children,
  selected,
  className,
  ...props
}: {
  children: ReactNode;
  /** Нажатое состояние: заливка выворачивается, как у выбранного чипа. */
  selected?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type='button'
      {...props}
      className={cn(
        'border px-2 py-1 text-micro uppercase leading-4 tracking-label transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        selected
          ? 'border-bgColor bg-bgColor text-textColor'
          : 'border-bgColor/40 hover:bg-bgColor hover:text-textColor',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Small controller so a gallery can open the viewer at a given index with one call. */
export function useMediaViewer() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);
  return { open, index, openAt, onOpenChange: setOpen, onIndexChange: setIndex };
}

interface MediaViewerProps {
  items: MediaViewerItem[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  /**
   * Действия владельца над текущим кадром (кадрировать, удалить). Просмотрщик их не знает и не
   * умеет: он показывает, а мутации живут у того, кто им владеет. Библиотека передаёт свои,
   * галерея тех-карты не передаёт ничего.
   */
  actions?: (item: MediaViewerItem, index: number) => ReactNode;
  /**
   * Переход по ссылке из раздела «used in». Отдан наружу, потому что маршрутизатора здесь нет и
   * быть не должно: голый `<a href>` внутри модалки перезагружает документ целиком — уносит
   * подгруженные страницы библиотеки, очередь незалитых файлов и словарь, — а закрыть себя перед
   * уходом просмотрщик сам не догадается. Адрес в `href` при этом остаётся: средний клик и
   * «скопировать ссылку» должны работать как у настоящей ссылки.
   */
  onUsageNavigate?: (href: string) => void;
  // РАНЬШЕ ЗДЕСЬ БЫЛ `renderOverlay` — крючок, которым галерея эскиза рисовала поверх снимка СВОЮ
  // копию указаний: он умел показывать, но не править, и расходился с плиткой на каждой правке.
  // Теперь увеличенный вид указаний это `annotation/zoom-dialog` — та же поверхность, что и на
  // плитке. Просмотрщик остался тем, чем был: смотрелкой для медиа без указаний.
}

export function MediaViewer({
  items,
  index,
  open,
  onOpenChange,
  onIndexChange,
  actions,
  onUsageNavigate,
}: MediaViewerProps) {
  const [showMeta, setShowMeta] = useState(false);
  const count = items.length;
  const hasMany = count > 1;
  // Clamp defensively — the list can shrink (a delete) while the viewer is open.
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = items[safeIndex];
  const activeType = current ? resolveViewerType(current) : undefined;
  const isImage = activeType === 'image';

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!count) return;
      onIndexChange((safeIndex + dir + count) % count);
    },
    [count, safeIndex, onIndexChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasMany) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    },
    [hasMany, go],
  );

  // Reset zoom/pan/drawing whenever the viewer moves to a different item, or
  // closes — each image gets a fresh, session-only stage.
  const resetKey = `${open ? 1 : 0}:${safeIndex}:${current?.src ?? ''}`;
  const gestures = useMediaStageGestures({ active: isImage, resetKey, hasMany, onSwipe: go });
  const annotate = useImageAnnotate({ resetKey, baseSize: gestures.baseSize });
  // Callouts start visible — you open the viewer on an annotated sketch to read them. The toggle
  // is there to get them off the picture, which is what you want before drawing on it.

  // Close only when the click lands on the empty ground (not the media or a control),
  // and not as the tail of a swipe.
  const handleStageClick = (e: React.MouseEvent) => {
    if (gestures.consumeJustSwiped()) return;
    if (e.target === e.currentTarget) onOpenChange(false);
  };

  // Keep the active filmstrip thumb in view as the index moves.
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    activeThumbRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [safeIndex, open]);

  if (!current) return null;

  const type = activeType as 'image' | 'video';
  const label = `${safeIndex + 1} / ${count}`;

  // Neighbours to preload so arrow / swipe nav feels instant.
  const neighbours = hasMany
    ? [items[(safeIndex + 1) % count], items[(safeIndex - 1 + count) % count]].filter(
        (n) => n && resolveViewerType(n) === 'image',
      )
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='media-viewer-overlay fixed inset-0 z-[var(--z-modal)] bg-black/95' />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          aria-label='Media viewer'
          className='media-viewer-content fixed inset-0 z-[var(--z-modal)] flex flex-col text-bgColor focus:outline-none'
        >
          <Dialog.Title className='sr-only'>Media viewer</Dialog.Title>
          <Dialog.Description className='sr-only'>
            {hasMany ? `Viewing item ${label}. Use the arrow keys to navigate.` : 'Viewing media.'}
          </Dialog.Description>

          {/* Top chrome. z-10 — ЛОКАЛЬНЫЙ СТЕК внутри просмотрщика (хром над сценой); слой самого
              просмотрщика задан выше через var(--z-modal). */}
          <div className='relative z-10 flex shrink-0 flex-wrap items-center gap-2 px-4 py-3'>
            <span className='text-textBaseSize uppercase tabular-nums'>
              {hasMany ? label : ' '}
            </span>
            {current.meta?.id != null && (
              <span className='text-micro uppercase tracking-label tabular-nums text-bgColor/70'>
                id {current.meta.id}
              </span>
            )}
            <span className='ml-auto flex flex-wrap items-center gap-2'>
              {actions?.(current, safeIndex)}
              {current.meta && (
                <ViewerAction
                  aria-pressed={showMeta}
                  selected={showMeta}
                  onClick={() => setShowMeta((v) => !v)}
                >
                  details
                </ViewerAction>
              )}
              <Dialog.Close
                aria-label='Close viewer'
                className='flex size-8 items-center justify-center border border-bgColor/40 transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
              >
                <Cross2Icon className='size-4' />
              </Dialog.Close>
            </span>
          </div>

          <div className='flex min-h-0 flex-1'>
          {/* Stage — click on the empty ground (not the media) closes. Images get
              real pan/zoom (wheel, drag, pinch) and an optional draw overlay;
              video is untouched. */}
          <div
            ref={gestures.viewportRef}
            className={cn(
              'relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16',
              isImage && 'touch-none',
            )}
            onClick={handleStageClick}
            {...gestures.viewportHandlers}
          >
            <div
              key={safeIndex}
              className='media-viewer-stage relative flex max-h-full max-w-full items-center justify-center'
              style={isImage ? gestures.stageStyle : undefined}
            >
              {type === 'video' ? (
                <video
                  src={current.src}
                  controls
                  autoPlay
                  playsInline
                  className='max-h-[calc(100vh-11rem)] max-w-full object-contain'
                />
              ) : (
                <>
                  <img
                    ref={gestures.imgRef}
                    src={current.src}
                    alt={current.alt || ''}
                    draggable={false}
                    onDoubleClick={gestures.onImageDoubleClick}
                    className={cn(
                      // White ground behind the picture: transparent PNGs (background-removed
                      // product shots, sketches) are unreadable on the near-black overlay.
                      'max-h-[calc(100vh-11rem)] max-w-full select-none bg-bgColor object-contain',
                      gestures.isZoomed && 'cursor-grab active:cursor-grabbing',
                      !gestures.isZoomed && !annotate.drawMode && 'cursor-zoom-in',
                    )}
                  />
                  {annotate.drawMode && (
                    <canvas
                      ref={annotate.canvasRef}
                      aria-label='Drawing surface'
                      style={{ width: gestures.baseSize.w, height: gestures.baseSize.h }}
                      className='absolute left-0 top-0 touch-none cursor-crosshair'
                      {...annotate.canvasHandlers}
                    />
                  )}
                </>
              )}
            </div>

            {hasMany && (
              <>
                <ArrowButton
                  side='left'
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                />
                <ArrowButton
                  side='right'
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                />
              </>
            )}

            {isImage && (
              <ZoomDrawToolbar
                scale={gestures.scale}
                canZoomIn={gestures.canZoomIn}
                canZoomOut={gestures.canZoomOut}
                isZoomed={gestures.isZoomed}
                onZoomIn={gestures.zoomIn}
                onZoomOut={gestures.zoomOut}
                onReset={gestures.reset}
                drawMode={annotate.drawMode}
                onToggleDraw={annotate.toggleDrawMode}
                color={annotate.color}
                onColorChange={annotate.setColor}
                colors={annotate.colors}
                width={annotate.width}
                onWidthChange={annotate.setWidth}
                widths={annotate.widths}
                hasStrokes={annotate.hasStrokes}
                onUndo={annotate.undo}
                onClear={annotate.clear}
                saving={annotate.saving}
                onSave={() => void annotate.saveImage(current.src, annotatedFileName(current.src))}
              />
            )}
          </div>

            {showMeta && current.meta && (
              <MetaPanel meta={current.meta} onUsageNavigate={onUsageNavigate} />
            )}
          </div>

          {/* Filmstrip */}
          {hasMany && (
            <div className='flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-3'>
              {items.map((item, i) => {
                const active = i === safeIndex;
                const itemIsVideo = resolveViewerType(item) === 'video';
                return (
                  <button
                    key={i}
                    ref={active ? activeThumbRef : undefined}
                    type='button'
                    aria-label={`Go to item ${i + 1}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onIndexChange(i)}
                    className={cn(
                      'relative size-12 shrink-0 overflow-hidden border transition-opacity sm:size-14',
                      active
                        ? 'border-bgColor opacity-100'
                        : 'border-transparent opacity-50 hover:opacity-100',
                    )}
                  >
                    {itemIsVideo ? (
                      <video
                        src={item.thumbnail || item.src}
                        muted
                        className='size-full object-cover'
                      />
                    ) : (
                      <img
                        src={item.thumbnail || item.src}
                        alt=''
                        className='size-full bg-bgColor object-cover'
                      />
                    )}
                    {itemIsVideo && (
                      <span className='absolute bottom-0.5 right-0.5 bg-black/70 px-0.5 text-[8px] uppercase leading-tight'>
                        vid
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Off-screen preload of the neighbouring images. */}
          {neighbours.map((n, i) => (
            <link key={i} rel='preload' as='image' href={n.src} />
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Сведения о файле рядом со снимком, а не в отдельном диалоге.
 *
 * Ровно эти строки раньше жили в `MediaInfo` внутри `PreviewMedia`: три колонки адресов и
 * ничего больше — ни id, ни даты, ни blurhash, при том что открывался тот диалог по клику на
 * плитку и был единственным способом что-то о снимке узнать. Панель тёмная, потому что стоит
 * на тёмной сцене: белая колонка сбоку от снимка светила бы в глаза ровно там, куда смотрят.
 */
function MetaPanel({
  meta,
  onUsageNavigate,
}: {
  meta: NonNullable<MediaViewerItem['meta']>;
  onUsageNavigate?: (href: string) => void;
}) {
  const [copied, setCopied] = useState<string | undefined>(undefined);
  const copy = (url?: string) => {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(undefined), 1200);
  };
  const created = meta.createdAt ? new Date(meta.createdAt) : undefined;

  return (
    <aside className='w-64 shrink-0 overflow-y-auto border-l border-bgColor/20 px-3 py-2'>
      {/* ДВЕ СТУПЕНИ СЕРОГО НА ВСЮ ПАНЕЛЬ: значение — белое, подпись — `/70`, линейка — `/20`.
          Раньше их было четыре (/60 /40 /20 /10), и читаемый текст стоял на самой слабой. */}
      <div className='mb-1 border-b border-bgColor/20 pb-0.5 text-micro uppercase tracking-group text-bgColor/70'>
        details
      </div>
      <dl className='mb-3'>
        <MetaRow label='id' value={meta.id ?? '—'} />
        <MetaRow
          label='uploaded'
          value={created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString() : '—'}
        />
        <MetaRow label='blurhash' value={meta.blurhash ? `${meta.blurhash.slice(0, 10)}…` : '—'} />
      </dl>

      {!!meta.renditions?.length && (
        <>
          <div className='mb-1 border-b border-bgColor/20 pb-0.5 text-micro uppercase tracking-group text-bgColor/70'>
            sizes in the bucket
          </div>
          {meta.renditions.map((r) => (
            <div
              key={r.label}
              className='flex items-center gap-2 border-b border-bgColor/20 py-1 text-micro'
            >
              <span className='w-20 shrink-0 uppercase tracking-label text-bgColor/70'>
                {r.label}
              </span>
              <span className='tabular-nums'>
                {r.width && r.height ? `${r.width}×${r.height}` : '—'}
              </span>
              <ViewerAction
                onClick={() => copy(r.url)}
                title='copy url'
                aria-label={`copy url: ${r.label}`}
                className='ml-auto px-1.5 py-0'
              >
                {copied === r.url ? 'ok' : 'url'}
              </ViewerAction>
            </div>
          ))}
        </>
      )}

      {/* ГДЕ СТОИТ СНИМОК. Раздел рисуется, только когда ответ есть: `undefined` — «ещё не
          спрашивали», и пустое «used in / —» на таком кадре читалось бы как «нигде», то есть
          как разрешение удалить. Пустой массив — уже ответ, и он проговаривается словами. */}
      {meta.usage && (
        <>
          <div className='mb-1 mt-3 border-b border-bgColor/20 pb-0.5 text-micro uppercase tracking-group text-bgColor/70'>
            used in
          </div>
          {meta.usage.length === 0 ? (
            <div className='py-1 text-micro text-bgColor/70'>
              — nothing links to it, it can be deleted
            </div>
          ) : (
            meta.usage.map((u, i) => (
              <div
                key={`${u.kind}-${u.href}-${u.slot}-${i}`}
                className='border-b border-bgColor/20 py-1 text-micro'
              >
                {/* Ссылка белая с подчёркиванием, а не фиолетовая: сиреневый по системе — цвет
                    ссылки на БЕЛОМ листе, на чёрной сцене он нечитаем. Роль несёт подчёркивание. */}
                {u.href ? (
                  <a
                    href={u.href}
                    className='block truncate underline'
                    onClick={
                      onUsageNavigate
                        ? (e) => {
                            // Только обычный левый клик: Cmd/Ctrl/средняя кнопка должны и дальше
                            // открывать место в новой вкладке, не закрывая просмотрщик.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            onUsageNavigate(u.href!);
                          }
                        : undefined
                    }
                  >
                    {u.label || u.kind}
                  </a>
                ) : (
                  <span className='block truncate'>{u.label || u.kind}</span>
                )}
                <div className='flex items-baseline gap-2 text-bgColor/70'>
                  <span className='uppercase tracking-label'>{u.kind?.replace(/_/g, ' ')}</span>
                  <span className='ml-auto truncate'>{u.slot || '—'}</span>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </aside>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex justify-between gap-2 border-b border-bgColor/20 py-1 text-micro'>
      <dt className='uppercase tracking-label text-bgColor/70'>{label}</dt>
      <dd className='tabular-nums'>{value}</dd>
    </div>
  );
}

function ArrowButton({
  side,
  onClick,
}: {
  side: 'left' | 'right';
  onClick: (e: React.MouseEvent) => void;
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type='button'
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      onClick={onClick}
      className={cn(
        // z-10 — локальный стек сцены (стрелка над снимком), не слой страницы.
        'absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center',
        'border border-bgColor/40 bg-black/40 text-bgColor backdrop-blur-sm transition-colors',
        'hover:bg-bgColor hover:text-textColor',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        side === 'left' ? 'left-2 sm:left-4' : 'right-2 sm:right-4',
      )}
    >
      <Icon className='size-5' />
    </button>
  );
}
