import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { common_MediaFull } from 'api/proto-http/admin';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DateScrubber, Text, useMonthIndex, type ScrubMonth } from 'ui';
import { MediaRange } from '../utils/useMediaQuery';

/** Same 8px as the `gap-2` of `MediaList`. */
const GAP = 8;
/** Auto-fill track of `MediaList` when no column count is given. */
const MIN_TILE = 150;
/** Footer strip of `MediaItem` (micro text + py-0.5 + hairline) plus the two frame borders. */
const FOOTER_EST = 22;
/** Thumbnails load this long after scrolling stops (the virtualizer's `isScrolling` reset). */
const SETTLE_MS = 140;
/** The visible range goes to the page fetcher only once it holds still this long. */
const RANGE_MS = 120;

type GridVirtualizer = Pick<
  Virtualizer<HTMLElement, Element>,
  'getVirtualItems' | 'getTotalSize' | 'isScrolling' | 'range' | 'measure'
>;

export interface MediaVirtualGridProps {
  /** The element that scrolls. The page itself (`document.scrollingElement`) works too. */
  scrollEl: HTMLElement | null;
  /** Months newest first: the scrubber's labels, sheet and jump offsets. */
  months: ScrubMonth[];
  /** Items in the list; every slot gets its footprint before its page arrives. */
  total: number;
  itemAt: (index: number) => common_MediaFull | undefined;
  /** The tile for a loaded slot. `load` is false while the list is dragged or flung. */
  renderItem: (media: common_MediaFull, load: boolean) => ReactNode;
  /** Visible items once the list holds still; held while the pill is dragged. */
  onRangeChange: (range: MediaRange) => void;
  /** Fixed column count (2 on the phone); auto-fill at 150px when omitted. */
  columns?: number;
  /** Fixed chrome over the scroller (px): the top bar, the bottom action bar. */
  insetTop?: number;
  insetBottom?: number;
}

function isDocumentScroller(el: HTMLElement) {
  return (
    el === document.scrollingElement || el === document.documentElement || el === document.body
  );
}

/**
 * Sparse grid of the whole library: every slot exists from the start (the total comes from the
 * month counts), only the rows on screen are in the DOM, and a slot whose page has not arrived is
 * a blank tile of the same footprint. With the date pill this is what lets a drag to the oldest
 * month land there without loading every page in between.
 *
 * Works on the page scroll (phone library) or on any scrolling element (pickers in dialogs).
 */
export function MediaVirtualGrid(props: MediaVirtualGridProps) {
  const { scrollEl } = props;
  if (!scrollEl) return null;
  return isDocumentScroller(scrollEl) ? (
    <WindowGrid {...props} scrollEl={scrollEl} />
  ) : (
    <ElementGrid {...props} scrollEl={scrollEl} />
  );
}

type Layout = ReturnType<typeof useGridLayout>;

function WindowGrid(props: MediaVirtualGridProps & { scrollEl: HTMLElement }) {
  const layout = useGridLayout(props);
  const virtualizer = useWindowVirtualizer(layout.options);
  return <GridBody {...props} layout={layout} virtualizer={virtualizer} />;
}

function ElementGrid(props: MediaVirtualGridProps & { scrollEl: HTMLElement }) {
  const layout = useGridLayout(props);
  const { scrollEl } = props;
  const virtualizer = useVirtualizer({ ...layout.options, getScrollElement: () => scrollEl });
  return <GridBody {...props} layout={layout} virtualizer={virtualizer} />;
}

/** Columns, row height and the grid's offset inside the scroller, all measured, never guessed. */
function useGridLayout({
  scrollEl,
  total,
  columns,
}: MediaVirtualGridProps & { scrollEl: HTMLElement }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Row height read off a real tile, per grid width. The first non-zero reading is kept: a tile
  // that grows (a delete prompt) or a blank one must never re-lay hundreds of rows mid-scroll.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;
    const sync = () => setWidth(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  // Content above the grid (header, upload plate, chips) moves it; re-read after every render.
  useLayoutEffect(() => {
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const next = isDocumentScroller(scrollEl)
      ? top + window.scrollY
      : top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    if (Math.abs(next - scrollMargin) > 0.5) setScrollMargin(next);
  });

  const cols = columns ?? Math.max(1, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tileW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_TILE;
  const measuredRow = measured && measured.width === width ? measured.height : 0;
  const rowH = measuredRow || Math.round(tileW * 1.25 + FOOTER_EST);
  const takeRowHeight = useCallback(
    (height: number) =>
      setMeasured((prev) =>
        prev && prev.width === width && prev.height > 0 ? prev : { width, height },
      ),
    [width],
  );
  const rows = Math.ceil(total / cols);

  return {
    ref: setEl,
    el,
    cols,
    rows,
    rowH,
    scrollMargin,
    takeRowHeight,
    options: {
      count: rows,
      estimateSize: () => rowH,
      gap: GAP,
      overscan: 2,
      scrollMargin,
      isScrollingResetDelay: SETTLE_MS,
    },
  };
}

function GridBody({
  scrollEl,
  months,
  total,
  itemAt,
  renderItem,
  onRangeChange,
  insetTop = 0,
  insetBottom = 0,
  layout,
  virtualizer,
}: MediaVirtualGridProps & {
  scrollEl: HTMLElement;
  layout: Layout;
  virtualizer: GridVirtualizer;
}) {
  const { cols, rows, rowH, scrollMargin, takeRowHeight } = layout;
  const index = useMonthIndex(months);
  const [dragging, setDragging] = useState(false);
  const load = !dragging && !virtualizer.isScrolling;

  // All rows share one height: when the measured one differs from the estimate, re-lay them all.
  useEffect(() => {
    virtualizer.measure();
  }, [rowH, cols, virtualizer]);
  // Measured off a real tile (never a blank one, never a whole row) and only while the list holds
  // still: a re-lay during a drag moves the window away from the rows on screen.
  useLayoutEffect(() => {
    if (!load) return;
    const tile = layout.el?.querySelector<HTMLElement>('[data-media-tile]');
    const h = tile ? tile.getBoundingClientRect().height : 0;
    if (h > 0) takeRowHeight(h);
  });

  // Pages are asked for only once the list holds still: a drag or a fling across forty pages
  // must not fetch the thirty-eight it flew past.
  const visStart = virtualizer.range ? virtualizer.range.startIndex * cols : 0;
  const visEnd = virtualizer.range
    ? Math.min(total - 1, (virtualizer.range.endIndex + 1) * cols - 1)
    : Math.min(total - 1, cols * 6);
  const reported = useRef(false);
  const live = useRef(onRangeChange);
  live.current = onRangeChange;
  useEffect(() => {
    if (dragging || total === 0) return;
    const send = () => live.current({ start: visStart, end: visEnd });
    if (!reported.current) {
      reported.current = true;
      send();
      return;
    }
    const t = window.setTimeout(send, RANGE_MS);
    return () => window.clearTimeout(t);
  }, [visStart, visEnd, dragging, total]);

  // A sheet jump lands a month's first item at the top; when that row also holds the previous
  // month's last item, the pill still names the month that was picked.
  const jumped = useRef<{ year: number; month: number; top: number | null } | null>(null);

  const labelAt = useCallback(
    (scrollTop: number) => {
      const j = jumped.current;
      if (j && j.top !== null) {
        const room = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (Math.abs(scrollTop - Math.min(j.top, room)) < 2) return j;
        jumped.current = null;
      }
      const y = scrollTop + insetTop - scrollMargin;
      const row = Math.min(rows - 1, Math.max(0, Math.floor(y / (rowH + GAP))));
      return index.monthAt(row * cols);
    },
    [scrollEl, insetTop, scrollMargin, rows, rowH, cols, index],
  );

  const offsetToScrollTop = useCallback(
    (itemOffset: number) => {
      const top = Math.max(
        0,
        scrollMargin + Math.floor(itemOffset / cols) * (rowH + GAP) - insetTop,
      );
      if (jumped.current) jumped.current.top = top;
      return top;
    },
    [scrollMargin, cols, rowH, insetTop],
  );

  const items = virtualizer.getVirtualItems();

  return (
    <>
      <div
        ref={layout.ref}
        className='relative w-full'
        style={{ height: virtualizer.getTotalSize() }}
      >
        {items.map((row) => (
          <div
            key={row.key}
            className='absolute inset-x-0 top-0 grid items-start gap-2'
            style={{
              transform: `translateY(${row.start - scrollMargin}px)`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: cols }, (_, c) => {
              const at = row.index * cols + c;
              if (at >= total) return null;
              const m = itemAt(at);
              return m ? (
                <Fragment key={`m${m.id}`}>{renderItem(m, load)}</Fragment>
              ) : (
                <BlankTile key={`b${at}`} />
              );
            })}
          </div>
        ))}
      </div>
      <DateScrubber
        scrollEl={scrollEl}
        months={months}
        labelAt={labelAt}
        offsetToScrollTop={offsetToScrollTop}
        onJump={(year, month) => {
          jumped.current = { year, month, top: null };
        }}
        onDragStateChange={setDragging}
        insetTop={insetTop}
        insetBottom={insetBottom}
      />
    </>
  );
}

/**
 * A slot whose page is still on its way: the tile's frame and footprint, nothing inside. The
 * footer is `MediaItem`'s footer line for line; the no-break space holds its line height.
 */
function BlankTile() {
  return (
    <div aria-hidden className='flex flex-col border border-borderColor bg-bgColor'>
      <div className='aspect-[4/5] w-full bg-pageBg' />
      <div className='flex items-center gap-1.5 border-t border-hairline px-1.5 py-0.5'>
        <Text size='micro' component='span' className='flex-none tabular-nums'>
          {' '}
        </Text>
      </div>
    </div>
  );
}
