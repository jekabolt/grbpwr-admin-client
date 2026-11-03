// THE LAYERS WINDOW and the piece's right-click menu (L22, owner's mockup 03.11). Nothing is stored
// here: a move goes to the caller, which writes the step's order through the card's autosave.

import type { Affine, PieceGeom } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { cn } from 'lib/utility';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button, Close, Text } from 'ui';
import { dropPlace, type LayerMove, type LayerWindowRow } from './layers-window';
import { boxOf, fitBox, pathOf, toPx } from './step-picture';
import { drawnRing } from './step-picture-view';

const THUMB_W = 34;
const THUMB_H = 26;
const rowEls = (list: HTMLElement) =>
  Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement);

function RowThumb({
  pieces,
  T,
  geoms,
}: {
  pieces: readonly string[];
  T: ReadonlyMap<string, Affine>;
  geoms: ReadonlyMap<string, PieceGeom>;
}) {
  const paths = useMemo(() => {
    const rings = pieces.flatMap((piece) => {
      const transform = T.get(piece);
      const geom = geoms.get(piece);
      return transform && geom ? [drawnRing(geom.rs).map((point) => apply(transform, point))] : [];
    });
    const fit = fitBox(boxOf(rings.flat()), THUMB_W, THUMB_H, 1);
    return rings.map((ring) =>
      pathOf(
        ring.map((point) => toPx(fit, point)),
        true,
      ),
    );
  }, [pieces, T, geoms]);
  return (
    <svg
      width={THUMB_W}
      height={THUMB_H}
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      className='block'
      aria-hidden
    >
      {paths.map((d, at) => (
        <path
          key={at}
          d={d}
          fill='none'
          stroke='var(--color-textColor)'
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
        />
      ))}
    </svg>
  );
}

export function LayersWindow({
  rows,
  selected,
  docked,
  disabled,
  T,
  geoms,
  nameOf,
  onClose,
  onSelect,
  onMove,
  onMenu,
}: {
  /** Top first. */
  rows: readonly LayerWindowRow[];
  /** The key of the block picked on the canvas. */
  selected: string | null;
  /** On a phone: a strip under the canvas, not over it. */
  docked: boolean;
  disabled: boolean;
  T: ReadonlyMap<string, Affine>;
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (row: LayerWindowRow) => string;
  onClose: () => void;
  onSelect: (row: LayerWindowRow) => void;
  onMove: (key: string, move: LayerMove) => void;
  onMenu: (key: string, x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // Moving a row in the DOM can drop its focus: the keys go on working on the same row.
  const keepFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = keepFocus.current;
    if (!key || !list.current) return;
    keepFocus.current = null;
    const row = rowEls(list.current).find((child) => child.dataset.seamLayerRow === key);
    if (row && document.activeElement !== row) row.focus({ preventScroll: true });
  }, [rows]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !list.current) return;
    const middles = rowEls(list.current)
      .filter((child) => child.dataset.seamLayerRow !== dragging)
      .map((child) => {
        const box = child.getBoundingClientRect();
        return box.top + box.height / 2;
      });
    onMove(dragging, dropPlace(middles, e.clientY));
  };
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, row: LayerWindowRow) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onSelect(row);
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const up = e.key === 'ArrowUp';
    if (disabled || rows[up ? 0 : rows.length - 1] === row) return;
    keepFocus.current = row.key;
    onMove(row.key, up ? 'up' : 'down');
  };

  return (
    <div
      className={cn(
        'bg-bgColor',
        docked
          ? 'flex-none border-t border-hairline'
          : 'absolute top-9 right-3 w-53 border border-borderColor',
      )}
      data-seam-layers=''
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='flex items-center justify-between border-b border-hairline px-2 py-1'>
        <Text size='micro' tracking='label' className='uppercase'>
          Layers
        </Text>
        <Close size='sm' onClick={onClose} aria-label='close layers' />
      </div>
      <div
        ref={list}
        className='divide-y divide-hairline'
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {rows.map((row) => (
          <div
            key={row.key}
            role='button'
            tabIndex={0}
            aria-pressed={selected === row.key}
            className={cn(
              'flex touch-none items-center gap-2 px-2 py-1.5',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
              disabled
                ? 'cursor-default'
                : dragging === row.key
                  ? 'cursor-grabbing'
                  : 'cursor-grab',
              selected === row.key && 'outline -outline-offset-1 outline-textColor',
              dragging === row.key && 'bg-pageBg',
            )}
            data-seam-layer-row={row.key}
            onPointerDown={(e) => {
              if (e.button !== 0 || e.ctrlKey) return;
              onSelect(row);
              if (disabled) return;
              setDragging(row.key);
              list.current?.setPointerCapture?.(e.pointerId);
            }}
            onKeyDown={(e) => onRowKey(e, row)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(row);
              onMenu(row.key, e.clientX, e.clientY);
            }}
          >
            <Text size='micro' variant='label' className='w-3 flex-none' aria-hidden>
              ≡
            </Text>
            <RowThumb pieces={row.pieces} T={T} geoms={geoms} />
            <Text size='micro' className='min-w-0 flex-1 [overflow-wrap:anywhere]'>
              {nameOf(row)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

const MENU_ITEM =
  'w-full justify-start px-2.5 py-2 text-left uppercase hover:bg-textColor hover:text-bgColor disabled:hover:bg-transparent disabled:hover:text-inherit';

/** The two items of a right click, at the pointer and inside the window; a press elsewhere closes it. */
export function LayersMenu({
  x,
  y,
  atFront,
  atBack,
  disabled,
  onMove,
  onClose,
}: {
  x: number;
  y: number;
  atFront: boolean;
  atBack: boolean;
  disabled: boolean;
  onMove: (move: 'front' | 'back') => void;
  onClose: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const box = el.current?.getBoundingClientRect();
    if (!box) return;
    setAt({
      x: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    const away = (e: globalThis.PointerEvent) => {
      if (!(e.target instanceof Node) || !el.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  return (
    <div
      ref={el}
      role='menu'
      className='fixed z-[var(--z-popover)] flex min-w-38 flex-col divide-y divide-hairline border border-textColor bg-bgColor'
      style={{ left: at.x, top: at.y }}
      data-seam-layers-menu=''
      onContextMenu={(e) => e.preventDefault()}
    >
      <Button
        type='button'
        size='xs'
        role='menuitem'
        className={MENU_ITEM}
        disabled={disabled || atFront}
        onClick={() => onMove('front')}
      >
        Bring to front
      </Button>
      <Button
        type='button'
        size='xs'
        role='menuitem'
        className={MENU_ITEM}
        disabled={disabled || atBack}
        onClick={() => onMove('back')}
      >
        Send to back
      </Button>
    </div>
  );
}
