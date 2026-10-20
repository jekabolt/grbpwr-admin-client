import * as Dialog from '@radix-ui/react-dialog';
import type { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  BlurhashImage,
  Button,
  Close,
  Drawer,
  EmptyCell,
  FoldCaret,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DotsHorizontalIcon,
  ExternalLinkIcon,
  Half2Icon,
  InfoCircledIcon,
  Pencil1Icon,
} from 'ui';
import {
  useImageAdjust,
  useImageAnnotate,
  useMediaStageGestures,
  ZoomDrawToolbar,
} from './media-viewer-zoom';

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
  /** Compact placeholder shown while an image rendition loads. */
  blurhash?: string;
  /** Short word stamped on the filmstrip thumb (`new`). */
  badge?: string;
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
  return (
    media?.fullSize?.mediaUrl || media?.compressed?.mediaUrl || media?.thumbnail?.mediaUrl || ''
  );
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
    alt: 'media',
    blurhash: media?.blurhash,
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

/**
 * ═══ АДРЕС ЕСТЬ, ФАЙЛА НЕТ — СЛОВО И ЕГО ПОДСКАЗКА (O-55) ═══════════════════════════════════════
 *
 * Бета: у части кропов дизайна бакет отдаёт 403 `AccessDenied` на КАЖДЫЙ вариант — объекты удалены,
 * строки остались, и ни миниатюры, ни крупного файла у такого кадра нет. Плитка рисовала иконку
 * битой картинки, просмотрщик — пустоту. Пустоту называет СЛОВО, как «deleted» и «no image» у
 * плиток полосы, и слово одно на всех, кто его говорит: этот просмотрщик, `PictureTile` и `Thumb`.
 *
 * Здесь, в примитиве `ui`, а не у полосы: просмотрщик общий (библиотека, задачи, заметки), и
 * слово, которое он печатает, не может жить в файле, о котором он не знает.
 */
export const FILE_MISSING_WORDS = 'file missing';
export const FILE_MISSING_TITLE = 'the file is gone from storage — this picture cannot be shown';

/** Пустой набор павших адресов. Один на модуль, чтобы сброс на закрытии не будил лишнюю отрисовку. */
const NO_MISSING: ReadonlySet<string> = new Set();

export function resolveViewerType(item: MediaViewerItem): 'image' | 'video' {
  return item.type ?? (isVideo(item.src) ? 'video' : 'image');
}

/**
 * Below Tailwind `lg` the viewer wears its phone chrome (MEDIA-MOBILE L3). Most of that is CSS
 * (`lg:` pairs); JS needs it only where the two layouts differ in behaviour — tap on the stage
 * (close vs. hide chrome) and where the info panel lives (aside vs. bottom sheet).
 */
const MOBILE_QUERY = '(max-width: 1023px)';
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia?.(MOBILE_QUERY);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}
function useIsMobileViewer(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => !!window.matchMedia?.(MOBILE_QUERY).matches,
    () => false,
  );
}

const NAMED_RATIOS: [number, number][] = [
  [1, 1],
  [4, 5],
  [5, 4],
  [3, 4],
  [4, 3],
  [2, 3],
  [3, 2],
  [9, 16],
  [16, 9],
  [2, 1],
  [1, 2],
];

/** `2:1`, `4:5`; a near-named ratio snaps to it; anything else reads `1.34:1`. */
export function formatRatio(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  const a = width / d;
  const b = height / d;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  const r = width / height;
  const named = NAMED_RATIOS.find(([x, y]) => Math.abs(x / y - r) / r < 0.01);
  if (named) return `${named[0]}:${named[1]}`;
  return r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}

/** One size format everywhere: `W×H · ratio`. */
export function sizeLine(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  return `${width}×${height} · ${formatRatio(width, height)}`;
}

/** The original's dimensions as the viewer item knows them (first rendition = the largest). */
function itemSize(item?: MediaViewerItem): { width?: number; height?: number } {
  const r = item?.meta?.renditions?.find((x) => x.width && x.height);
  return { width: r?.width, height: r?.height };
}

/**
 * An owner action in a shape both layouts can draw: a word in the top chrome on desktop, an
 * icon + word column in the bottom tool bar on the phone. `place: 'more'` goes into the phone's
 * `more` sheet only (desktop does not show it).
 */
export interface ViewerTool {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  place?: 'bar' | 'more';
  tone?: 'danger';
  /** Ask once more before running (the word the second tap shows). */
  confirm?: string;
}

/** Crop: a frame inside the photo. */
export function CropGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 24 24' aria-hidden className={cn('size-5', className)}>
      <path d='M6 2v16h16M2 6h16v16' fill='none' stroke='currentColor' strokeWidth='1.6' />
    </svg>
  );
}

/** Expand: the photo inside a bigger frame. */
export function ExpandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 24 24' aria-hidden className={cn('size-5', className)}>
      <rect
        x='2'
        y='2'
        width='20'
        height='20'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
      />
      <rect x='8' y='7' width='8' height='10' fill='currentColor' opacity='0.45' />
      <path d='M4 12h3M17 12h3' stroke='currentColor' strokeWidth='1.6' />
    </svg>
  );
}

/**
 * `…/sketch-front.jpg` -> `sketch-front-annotated.png`, so a folder of exports stays readable.
 *
 * СУФФИКС НАЗЫВАЕТ ТО, ЧТО ДЕЙСТВИТЕЛЬНО СДЕЛАНО. С появлением коррекции (J-13) один и тот же
 * файл мог уйти как «annotated», не неся ни одного штриха, — а имя файла это единственная
 * подпись, которая доедет до чужой папки вместе с байтами.
 */
function exportFileName(src: string, marks: { ink: boolean; adjusted: boolean }): string {
  const base = src.split('?')[0]?.split('/').pop() || 'image';
  const stem = base.replace(/\.[^.]+$/, '') || 'image';
  const suffix =
    marks.ink && marks.adjusted
      ? 'edited'
      : marks.ink
        ? 'annotated'
        : marks.adjusted
          ? 'adjusted'
          : 'copy';
  return `${stem}-${suffix}.png`;
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
   * Structured owner actions (see `ViewerTool`). Desktop draws the `bar` ones exactly like
   * `actions`; the phone puts them in the bottom tool bar and the `more` sheet. Free-form
   * `actions` still render on the phone, in the top chrome.
   */
  tools?: (item: MediaViewerItem, index: number) => ViewerTool[];
  /** A one-line strip above the filmstrip (the library's «saved» bar). */
  notice?: ReactNode;
  /**
   * Переход по ссылке из раздела «used in». Отдан наружу, потому что маршрутизатора здесь нет и
   * быть не должно: голый `<a href>` внутри модалки перезагружает документ целиком — уносит
   * подгруженные страницы библиотеки, очередь незалитых файлов и словарь, — а закрыть себя перед
   * уходом просмотрщик сам не догадается. Адрес в `href` при этом остаётся: средний клик и
   * «скопировать ссылку» должны работать как у настоящей ссылки.
   */
  onUsageNavigate?: (href: string) => void;
  /**
   * ЗАВЕСТИ ПОПРАВЛЕННЫЙ СНИМОК НОВОЙ КАРТИНКОЙ (J-13). Коррекция и чернила — взгляд на время
   * сеанса; эта дверь — единственный способ, которым они становятся вещью.
   *
   * Устроена как `actions`: просмотрщик показывает, а мутации живут у того, кто им владеет. Он
   * отдаёт БАЙТЫ и КАДР ЦЕЛИКОМ — хозяин по `item` находит исходную картинку и наследует её род.
   *
   * ⚠ `item.meta.id` — это id МЕДИА, а не картинки полосы: ссылки на картинку у кадра нет вовсе,
   * и искать её хозяину придётся по медиа. Absent = двери нет (библиотека), и наружу ведёт
   * прежнее «скачать».
   */
  onSaveAsPicture?: (dataUrl: string, item: MediaViewerItem) => Promise<void>;
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
  tools,
  notice,
  onUsageNavigate,
  onSaveAsPicture,
}: MediaViewerProps) {
  const [showMeta, setShowMeta] = useState(false);
  const isMobile = useIsMobileViewer();
  /** Phone: a tap on the stage hides the chrome, so only the picture remains. */
  const [chromeHidden, setChromeHidden] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (open) return;
    setChromeHidden(false);
    setMoreOpen(false);
  }, [open]);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const count = items.length;
  const hasMany = count > 1;
  // Clamp defensively — the list can shrink (a delete) while the viewer is open.
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = items[safeIndex];
  const activeType = current ? resolveViewerType(current) : undefined;
  const isImage = activeType === 'image';

  /**
   * ═══ КАДР, ЧЕЙ ФАЙЛ НЕ ЗАГРУЗИЛСЯ, ПОКАЗЫВАЕТ СЛОВО, А НЕ ДЫРУ (O-55) ═══════════════════════
   *
   * Сцена узнаёт о провале от СОБСТВЕННОГО `<img>` (`onError`) — своей сети у просмотрщика нет и
   * не будет (довод у `meta.usage`). Павший адрес ложится в набор, и пока просмотрщик открыт, он
   * больше не запрашивается: сцена рисует рамку со словом, кадр ленты — то же слово мельче, а
   * сосед с этим адресом не подгружается заранее. Листание при этом живо целиком — стрелки,
   * клавиши, лента кадров и смахивание; гаснут только зум, чернила и коррекция: им не над чем
   * работать.
   *
   * Набор живёт СЕАНС, а не страницу: закрытие его сбрасывает, и следующее открытие пробует адрес
   * заново — сбой сети не должен становиться «файла нет» до перезагрузки. Хозяин ряда, который
   * знает больше (полоса дизайна подменяет павший крупный файл миниатюрой, D-7), делает это сам,
   * СВОИМ `src`; новый адрес здесь пробуется честно, один раз.
   */
  const [missing, setMissing] = useState<ReadonlySet<string>>(NO_MISSING);
  useEffect(() => {
    if (!open) setMissing(NO_MISSING);
  }, [open]);
  const markMissing = useCallback((src: string | null) => {
    if (!src) return;
    setMissing((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  const stageMissing = isImage && !!current && missing.has(current.src);
  /** Сцене есть что двигать и над чем рисовать: картинка, и её файл на месте. */
  const stageLive = isImage && !stageMissing;

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
      /**
       * СТРЕЛКИ ПРИНАДЛЕЖАТ СФОКУСИРОВАННОМУ ОРГАНУ, А НЕ ДИАЛОГУ.
       *
       * Замерено пробой `qa-adjust` 0f: у ползунка коррекции влево/вправо — это ШАГ ЗНАЧЕНИЯ (так
       * нативный `range` и настраивают точно), и до этой проверки то же нажатие уводило
       * просмотрщик на соседний кадр — а переход снимает коррекцию. То есть жест, которым её
       * настраивают, ею же её и стирал, и выглядело это как «ползунок сам себя сбрасывает».
       */
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
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
  // Phone: a vertical swipe (up or down) closes, except while drawing (a stroke is not a swipe).
  const drawModeRef = useRef(false);
  const swipeClose = useCallback(() => {
    if (!drawModeRef.current) onOpenChange(false);
  }, [onOpenChange]);
  const gestures = useMediaStageGestures({
    active: stageLive,
    resetKey,
    hasMany,
    onSwipe: go,
    onSwipeClose: isMobile ? swipeClose : undefined,
  });
  const annotate = useImageAnnotate({ resetKey, baseSize: gestures.baseSize });
  drawModeRef.current = annotate.drawMode;
  // Коррекция подчиняется ТОМУ ЖЕ `resetKey`, что зум и чернила: смена кадра или закрытие снимают
  // её начисто. Пережившая закрытие коррекция была бы уже хранимой дельтой, а это другой договор
  // (поля на картинке полосы, прото, и каждый рендерер обязан её честно применять).
  const adjust = useImageAdjust({
    resetKey,
    baseSize: gestures.baseSize,
    src: current?.src ?? '',
    enabled: stageLive,
  });
  // Callouts start visible — you open the viewer on an annotated sketch to read them. The toggle
  // is there to get them off the picture, which is what you want before drawing on it.

  /**
   * Байты для двери хозяина. Просмотрщик отдаёт КАДР ЦЕЛИКОМ, а не адрес: по одному адресу хозяин
   * не найдёт ни картинку полосы, ни её род — искать он будет по `meta.id`.
   */
  const saveAsPicture = useCallback(async () => {
    const item = items[safeIndex];
    if (!onSaveAsPicture || !item) return;
    const dataUrl = await annotate.bakeDataUrl(item.src, {
      params: adjust.values,
      source: adjust.sourceRef.current,
    });
    if (!dataUrl) return;
    await onSaveAsPicture(dataUrl, item);
  }, [onSaveAsPicture, items, safeIndex, annotate, adjust.values, adjust.sourceRef]);

  // Close only when the click lands on the empty ground (not the media or a control),
  // and not as the tail of a swipe.
  // Phone: any tap on the stage toggles the chrome instead (back is in the top row). The toggle
  // waits a beat so a double tap (zoom) does not flash the chrome off and on.
  const handleStageClick = (e: React.MouseEvent) => {
    if (gestures.consumeJustSwiped()) return;
    if (isMobile) {
      if (annotate.drawMode) return;
      clearTimeout(tapTimer.current);
      if (e.detail > 1) return;
      tapTimer.current = setTimeout(() => setChromeHidden((v) => !v), 250);
      return;
    }
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
        (n) => n && resolveViewerType(n) === 'image' && !missing.has(n.src),
      )
    : [];

  const ownerTools = tools?.(current, safeIndex) ?? [];
  const barTools = ownerTools.filter((t) => t.place !== 'more');
  const moreTools = ownerTools.filter((t) => t.place === 'more');
  const currentDimensions = itemSize(current);
  const currentSize = sizeLine(currentDimensions.width, currentDimensions.height);
  const originalUrl = current.meta?.renditions?.[0]?.url || current.src;
  /** Phone chrome pieces vanish together on a stage tap; desktop never hides them. */
  const chromeClass = chromeHidden ? 'max-lg:hidden' : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='media-viewer-overlay fixed inset-0 z-[var(--z-modal)] bg-black/95' />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          aria-label='Media viewer'
          /* ЯКОРЬ ПРОБЫ. «Модель открылась в просмотрщике КАРТИНОК» — утверждение, которое надо
             уметь опровергнуть, а роль `dialog` у этого окна та же, что у окна модели: по ней их
             не различить. Класс для этого не годится — он переживает правку смысла. */
          data-media-viewer=''
          className='media-viewer-content fixed inset-0 z-[var(--z-modal)] flex flex-col text-bgColor focus:outline-none'
        >
          <Dialog.Title className='sr-only'>Media viewer</Dialog.Title>
          <Dialog.Description className='sr-only'>
            {hasMany ? `Viewing item ${label}. Use the arrow keys to navigate.` : 'Viewing media.'}
          </Dialog.Description>

          {/* Top chrome. z-10 — ЛОКАЛЬНЫЙ СТЕК внутри просмотрщика (хром над сценой); слой самого
              просмотрщика задан выше через var(--z-modal). */}
          {/* Phone top row: back · counter · the caller's free-form actions. */}
          <div
            className={cn(
              'relative z-10 flex shrink-0 items-center gap-2 px-2 py-1 lg:hidden',
              chromeClass,
            )}
          >
            <Dialog.Close asChild>
              <ViewerAction
                aria-label='Close viewer'
                className='min-h-11 border-transparent px-2 text-textBaseSize'
              >
                ← back
              </ViewerAction>
            </Dialog.Close>
            <span className='min-w-0 flex-1 truncate text-center text-textBaseSize uppercase tabular-nums'>
              {hasMany ? label : ''}
            </span>
            <span className='flex min-w-16 shrink-0 items-center justify-end gap-2'>
              {isMobile && actions?.(current, safeIndex)}
            </span>
          </div>

          <div className='relative z-10 hidden shrink-0 flex-wrap items-center gap-2 px-4 py-3 lg:flex'>
            <span className='text-textBaseSize uppercase tabular-nums'>
              {hasMany ? label : ' '}
            </span>
            <span className='ml-auto flex flex-wrap items-center gap-2'>
              {barTools.map((t) => (
                <ViewerAction key={t.key} disabled={t.disabled} onClick={t.onClick}>
                  {t.label}
                </ViewerAction>
              ))}
              {/* One copy of the free-form actions: here on desktop, in the phone row above. */}
              {!isMobile && actions?.(current, safeIndex)}
              {current.meta && (
                <ViewerAction
                  aria-pressed={showMeta}
                  selected={showMeta}
                  onClick={() => setShowMeta((v) => !v)}
                >
                  details
                </ViewerAction>
              )}
              <Dialog.Close asChild>
                <Close
                  aria-label='Close viewer'
                  className='text-bgColor hover:bg-bgColor hover:text-textColor hover:no-underline focus-visible:outline-bgColor'
                />
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
                'relative flex min-h-0 flex-1 items-center justify-center max-lg:overflow-hidden lg:px-16',
                // `isImage`, не `stageLive`: смахивание по рамке «file missing» — тоже листание, и
                // отдать жест браузеру значило бы отнять его у ряда.
                isImage && 'touch-none',
              )}
              onClick={handleStageClick}
              {...gestures.viewportHandlers}
            >
              <div
                key={safeIndex}
                className='media-viewer-stage relative flex max-h-full max-w-full items-center justify-center'
                style={stageLive ? gestures.stageStyle : undefined}
              >
                {type === 'video' ? (
                  <video
                    src={current.src}
                    controls
                    autoPlay
                    playsInline
                    className={cn(
                      'max-h-[calc(100dvh-14rem)] max-w-full object-contain lg:max-h-[calc(100vh-11rem)]',
                      chromeHidden && 'max-lg:max-h-dvh',
                    )}
                  />
                ) : stageMissing ? (
                  /* РАМКА КАДРА СО СЛОВОМ (O-55): тот же белый грунт, что под снимком, и подпись
                   тоном ярлыка — ровно как пустота названа на плитках. Размер — обычный кадр 4:5,
                   потому что настоящего размера у файла, которого нет, никто не измерит. */
                  <div
                    data-probe='viewer-missing'
                    title={FILE_MISSING_TITLE}
                    className='flex h-80 max-h-[calc(100vh-11rem)] w-64 max-w-full items-center justify-center bg-bgColor px-4 text-center text-micro uppercase tracking-label text-labelColor'
                  >
                    {FILE_MISSING_WORDS}
                  </div>
                ) : (
                  <>
                    <BlurhashImage
                      ref={gestures.imgRef}
                      src={current.src}
                      blurhash={current.blurhash}
                      alt={current.alt || ''}
                      width={currentDimensions.width}
                      height={currentDimensions.height}
                      draggable={false}
                      data-probe='viewer-image'
                      onDoubleClick={gestures.onImageDoubleClick}
                      // Адрес — с самого узла, а не из замыкания: запоздалая ошибка прежнего кадра не
                      // объявит павшим тот, на который уже перелистнули.
                      onError={(e) => markMissing(e.currentTarget.getAttribute('src'))}
                      className={cn(
                        // White ground behind the picture: transparent PNGs (background-removed
                        // product shots, sketches) are unreadable on the near-black overlay.
                        'h-auto w-auto max-h-[calc(100dvh-14rem)] max-w-full select-none bg-bgColor object-contain lg:max-h-[calc(100vh-11rem)]',
                        chromeHidden && 'max-lg:max-h-dvh',
                        gestures.isZoomed && 'cursor-grab active:cursor-grabbing',
                        !gestures.isZoomed && !annotate.drawMode && 'cursor-zoom-in',
                      )}
                    />
                    {/* КАНВАС КОРРЕКЦИИ ЛЕЖИТ ПОВЕРХ СНИМКА И НЕ ЛОВИТ УКАЗАТЕЛЬ. `<img>` под ним
                      остаётся в документе намеренно: он и МЕРИТ бокс (`ResizeObserver`), и держит
                      попадание для панорамы и двойного клика. Убери его — и зум с перетаскиванием
                      умерли бы ровно на то время, пока крутят яркость. */}
                    {adjust.on && (
                      <canvas
                        ref={adjust.canvasRef}
                        aria-hidden
                        data-probe='adjust-canvas'
                        style={{ width: gestures.baseSize.w, height: gestures.baseSize.h }}
                        className='pointer-events-none absolute left-0 top-0'
                      />
                    )}
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

              {stageLive && (
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
                  onSave={() =>
                    void annotate.saveImage(
                      current.src,
                      exportFileName(current.src, {
                        ink: annotate.hasStrokes,
                        adjusted: !adjust.isZero,
                      }),
                      { params: adjust.values, source: adjust.sourceRef.current },
                    )
                  }
                  adjustOpen={adjust.open}
                  onToggleAdjust={adjust.toggle}
                  adjust={adjust.values}
                  onAdjustChange={adjust.setValues}
                  onAdjustReset={adjust.reset}
                  adjustStatus={adjust.status}
                  onSaveAsPicture={onSaveAsPicture ? () => void saveAsPicture() : undefined}
                />
              )}
            </div>

            {showMeta && current.meta && !isMobile && (
              <MetaPanel meta={current.meta} onUsageNavigate={onUsageNavigate} />
            )}
          </div>

          {notice && <div className={cn('shrink-0', chromeClass)}>{notice}</div>}

          {/* Phone: position and size right above the strip. */}
          <div
            className={cn(
              'flex shrink-0 items-baseline justify-between gap-2 px-4 pt-2 text-micro uppercase tracking-label tabular-nums lg:hidden',
              chromeClass,
            )}
          >
            <span>{hasMany ? label : ''}</span>
            <span className='text-bgColor/70'>{currentSize}</span>
          </div>

          {/* Filmstrip */}
          {hasMany && (
            <div
              className={cn(
                'flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-2 lg:py-3',
                chromeClass,
              )}
            >
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
                      'relative size-12 shrink-0 overflow-hidden border transition-opacity lg:size-14',
                      active
                        ? 'border-bgColor opacity-100 max-lg:outline max-lg:outline-2 max-lg:-outline-offset-2 max-lg:outline-bgColor'
                        : 'border-transparent opacity-50 hover:opacity-100',
                    )}
                  >
                    {itemIsVideo ? (
                      <video
                        src={item.thumbnail || item.src}
                        muted
                        className='size-full object-cover'
                      />
                    ) : missing.has(item.thumbnail || item.src) ? (
                      /* Тот же набор павших адресов, что у сцены (O-55): кадр ленты под рамкой
                         «file missing» не рисует браузерную иконку битой картинки. */
                      <span
                        data-probe='viewer-strip-missing'
                        title={FILE_MISSING_TITLE}
                        className='flex size-full items-center justify-center bg-bgColor px-0.5 text-center text-nano uppercase leading-tight text-labelColor'
                      >
                        {FILE_MISSING_WORDS}
                      </span>
                    ) : (
                      <img
                        src={item.thumbnail || item.src}
                        alt=''
                        className='size-full bg-bgColor object-cover'
                        onError={(e) => markMissing(e.currentTarget.getAttribute('src'))}
                      />
                    )}
                    {itemIsVideo && (
                      <span className='absolute bottom-0.5 right-0.5 bg-black/70 px-0.5 text-[8px] uppercase leading-tight'>
                        vid
                      </span>
                    )}
                    {item.badge && (
                      <span className='absolute left-0 top-0 bg-bgColor px-0.5 text-nano uppercase leading-tight text-textColor'>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Phone tool bar: the owner's tools, then info and more — equal columns. */}
          <div
            role='toolbar'
            aria-label='Media tools'
            className={cn(
              'grid shrink-0 auto-cols-fr grid-flow-col border-t border-bgColor/20 pb-[env(safe-area-inset-bottom)] lg:hidden',
              chromeClass,
            )}
          >
            {barTools.map((t) => (
              <ToolColumn key={t.key} label={t.label} disabled={t.disabled} onClick={t.onClick}>
                {t.icon}
              </ToolColumn>
            ))}
            {current.meta && (
              <ToolColumn label='info' selected={showMeta} onClick={() => setShowMeta((v) => !v)}>
                <InfoCircledIcon className='size-5' />
              </ToolColumn>
            )}
            <ToolColumn label='more' selected={moreOpen} onClick={() => setMoreOpen(true)}>
              <DotsHorizontalIcon className='size-5' />
            </ToolColumn>
          </div>

          {isMobile && current.meta && (
            <Drawer side='bottom' open={showMeta} onOpenChange={setShowMeta} title='info'>
              <MetaSheet meta={current.meta} size={currentSize} onUsageNavigate={onUsageNavigate} />
            </Drawer>
          )}

          {isMobile && (
            <MoreSheet
              open={moreOpen}
              onOpenChange={setMoreOpen}
              canEdit={stageLive}
              adjustOn={adjust.open}
              drawOn={annotate.drawMode}
              onAdjust={adjust.toggle}
              onDraw={annotate.toggleDrawMode}
              url={originalUrl}
              tools={moreTools}
            />
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
        <MetaRow
          label='uploaded'
          value={
            created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString('en-US') : '—'
          }
        />
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
                {r.width && r.height ? `${r.width}×${r.height}` : <EmptyCell />}
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
                  <span className='ml-auto truncate'>{u.slot || <EmptyCell />}</span>
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
        'absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center lg:flex',
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

/** One column of the phone tool bar: icon over a word, a 56px tall target. */
function ToolColumn({
  label,
  children,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  children?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ViewerAction
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      className='flex min-h-14 flex-col items-center justify-center gap-1 border-transparent px-1 py-2 disabled:opacity-50'
    >
      {children}
      <span>{label}</span>
    </ViewerAction>
  );
}

/** A row of the phone sheets: icon + word, full width, 44px tall. */
function SheetRow({
  icon,
  children,
  danger,
  disabled,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 border-b border-hairline px-1 text-left',
        danger && 'text-error',
      )}
    >
      <span className='flex size-5 shrink-0 items-center justify-center'>{icon}</span>
      <span className='uppercase tracking-label text-micro'>{children}</span>
    </Button>
  );
}

/** Phone `more`: the rarer tools that do not earn a column. */
function MoreSheet({
  open,
  onOpenChange,
  canEdit,
  adjustOn,
  drawOn,
  onAdjust,
  onDraw,
  url,
  tools,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  adjustOn: boolean;
  drawOn: boolean;
  onAdjust: () => void;
  onDraw: () => void;
  url: string;
  tools: ViewerTool[];
}) {
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!open) {
      setArmed(undefined);
      setCopied(false);
    }
  }, [open]);
  const close = () => onOpenChange(false);

  return (
    <Drawer side='bottom' open={open} onOpenChange={onOpenChange} title='more'>
      <SheetRow
        icon={<Half2Icon className='size-4' />}
        disabled={!canEdit}
        onClick={() => {
          onAdjust();
          close();
        }}
      >
        {adjustOn ? 'close adjust' : 'adjust'}
      </SheetRow>
      <SheetRow
        icon={<Pencil1Icon className='size-4' />}
        disabled={!canEdit}
        onClick={() => {
          onDraw();
          close();
        }}
      >
        {drawOn ? 'stop drawing' : 'draw'}
      </SheetRow>
      <SheetRow
        icon={<CopyIcon className='size-4' />}
        disabled={!url}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? 'copied' : 'copy url'}
      </SheetRow>
      <SheetRow
        icon={<ExternalLinkIcon className='size-4' />}
        disabled={!url}
        onClick={() => {
          window.open(url, '_blank', 'noopener,noreferrer');
          close();
        }}
      >
        open original
      </SheetRow>
      {tools.map((t) => (
        <SheetRow
          key={t.key}
          icon={t.icon}
          danger={t.tone === 'danger'}
          disabled={t.disabled}
          onClick={() => {
            if (t.confirm && armed !== t.key) {
              setArmed(t.key);
              return;
            }
            t.onClick();
            close();
          }}
        >
          {armed === t.key && t.confirm ? t.confirm : t.label}
        </SheetRow>
      ))}
    </Drawer>
  );
}

/**
 * Phone info sheet (frame 2a): the few facts you came for — size, date, where it is used — and
 * the bucket details folded under `technical`. Light, because it is a sheet over the page.
 */
function MetaSheet({
  meta,
  size,
  onUsageNavigate,
}: {
  meta: NonNullable<MediaViewerItem['meta']>;
  size?: string;
  onUsageNavigate?: (href: string) => void;
}) {
  const [copied, setCopied] = useState<string | undefined>(undefined);
  const copy = (url?: string) => {
    if (!url) return;
    void navigator.clipboard?.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(undefined), 1200);
  };
  const created = meta.createdAt ? new Date(meta.createdAt) : undefined;
  const uploaded =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined;
  const label = 'text-micro uppercase tracking-label text-labelColor';

  return (
    <div className='flex flex-col gap-3 text-micro'>
      <dl>
        <div className='flex justify-between gap-2 border-b border-hairline py-2'>
          <dt className={label}>size</dt>
          <dd className='tabular-nums'>{size ?? <EmptyCell />}</dd>
        </div>
        <div className='flex justify-between gap-2 border-b border-hairline py-2'>
          <dt className={label}>uploaded</dt>
          <dd className='tabular-nums'>{uploaded ?? <EmptyCell />}</dd>
        </div>
      </dl>

      {meta.usage && (
        <div>
          <div className={cn(label, 'border-b border-borderColor pb-1')}>
            used in · {meta.usage.length}
          </div>
          {meta.usage.length === 0 ? (
            <div className='py-2 text-labelColor'>not used</div>
          ) : (
            meta.usage.map((u, i) => {
              const body = (
                <>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate'>{u.label || u.kind}</span>
                    <span className='block truncate text-labelColor'>
                      {[u.kind?.replace(/_/g, ' '), u.slot].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {u.href && <span aria-hidden>→</span>}
                </>
              );
              const row = 'flex min-h-11 items-center gap-2 border-b border-hairline py-1';
              return u.href ? (
                <a
                  key={`${u.kind}-${u.href}-${u.slot}-${i}`}
                  href={u.href}
                  className={row}
                  onClick={
                    onUsageNavigate
                      ? (e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          onUsageNavigate(u.href!);
                        }
                      : undefined
                  }
                >
                  {body}
                </a>
              ) : (
                <div key={`${u.kind}-${u.slot}-${i}`} className={row}>
                  {body}
                </div>
              );
            })
          )}
        </div>
      )}

      <details className='group'>
        <summary className={cn(label, 'flex min-h-11 cursor-pointer list-none items-center gap-1')}>
          technical
          <FoldCaret open='details' />
        </summary>
        <dl>
          {meta.renditions?.map((r) => (
            <div key={r.label} className='flex items-center gap-2 border-b border-hairline py-1'>
              <dt className={cn(label, 'w-24 shrink-0')}>{r.label}</dt>
              <dd className='tabular-nums'>
                {r.width && r.height ? `${r.width}×${r.height}` : <EmptyCell />}
              </dd>
              <Button
                variant='underline'
                size='sm'
                className='ml-auto min-h-11'
                aria-label={`copy url: ${r.label}`}
                onClick={() => copy(r.url)}
              >
                {copied === r.url ? 'copied' : 'copy url'}
              </Button>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
