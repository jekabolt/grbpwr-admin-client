import { cn } from 'lib/utility';
import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { GROUP_GAP } from '../core';
import { viewLabel } from '../views';
import { componentAt, polygonIndices } from './map-model';
import { dilate } from './regions';
import type { PaintSession, PaintSkin, PaintTool, PaintView } from './use-paint';

/**
 * PAINT THE PARTS · the inline canvas on FABRIC RENDER: every side holding a flat in one row, the
 * same height; the paper is the flat, the paint is the material's texture, the drawing's lines sit
 * on top black with a white halo — always readable over any cloth (R3).
 *
 *   click  fills the part under the pointer (the region between the drawing's lines)
 *   pen    a polygon of the armed material, clipped to the garment — closes open outlines
 *   erase  click back to paper
 * Keys: V / P / E, ⌘Z / ⇧⌘Z, Enter closes the pen, Esc drops it.
 */

/** Sides share one height that fills the row, within these bounds. */
const SIDE_MIN = 320;
const SIDE_MAX = 640;
const GAP = 8;
const TOOLS: PaintTool[] = ['click', 'pen', 'erase'];
const HOVER_ALPHA = 0.45;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Texture scale: a tile shows ≈ 1/6 of the side's height. */
function sampler(skin: PaintSkin | undefined, h: number) {
  const hex = skin?.hex || '#dddddd';
  const solid = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const tile = skin?.tile ?? null;
  const k = tile ? tile.width / Math.max(8, h / 6) : 1;
  return (x: number, y: number, out: Uint8ClampedArray, p: number) => {
    if (!tile) {
      out[p] = solid[0];
      out[p + 1] = solid[1];
      out[p + 2] = solid[2];
      return;
    }
    const tx = mod(Math.floor(x * k), tile.width);
    const ty = mod(Math.floor(y * k), tile.height);
    const q = (ty * tile.width + tx) * 4;
    out[p] = tile.data[q];
    out[p + 1] = tile.data[q + 1];
    out[p + 2] = tile.data[q + 2];
  };
}

function PaintSide({
  session,
  view,
  height,
}: {
  session: PaintSession;
  view: PaintView;
  height: number;
}): JSX.Element {
  const mock = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement>(null);
  const hover = useRef<HTMLCanvasElement>(null);
  const hoverState = useRef<{
    idx: Int32Array | null;
    mask: Uint8Array | null;
    rev: number;
    armed: string;
  }>({
    idx: null,
    mask: null,
    rev: -1,
    armed: '',
  });
  const [pen, setPen] = useState<{ x: number; y: number }[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const { flat, labels, pixels } = view;
  const w = flat?.w ?? 0;
  const h = flat?.h ?? 0;
  const ready = view.status === 'ready' && !!flat && !!labels && !!pixels;
  const tool = session.tool;

  // The paper and the paint.
  useEffect(() => {
    const c = mock.current;
    if (!ready || !c || !labels || !pixels) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const out = new ImageData(new Uint8ClampedArray(pixels.data), w, h);
    const samplers = new Map<number, ReturnType<typeof sampler>>();
    for (let i = 0, p = 0; i < labels.length; i += 1, p += 4) {
      const v = labels[i];
      if (!v) {
        // Transparent paper is white paper.
        const a = out.data[p + 3] / 255;
        out.data[p] = out.data[p] * a + 255 * (1 - a);
        out.data[p + 1] = out.data[p + 1] * a + 255 * (1 - a);
        out.data[p + 2] = out.data[p + 2] * a + 255 * (1 - a);
        out.data[p + 3] = 255;
        continue;
      }
      let s = samplers.get(v);
      if (!s) {
        s = sampler(session.skins.get(`#${v.toString(16).padStart(6, '0')}`), h);
        samplers.set(v, s);
      }
      s(i % w, (i / w) | 0, out.data, p);
      out.data[p + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view.rev, w, h]);

  // The drawing on top: black lines, white halo.
  useEffect(() => {
    const c = ink.current;
    if (!ready || !c || !flat) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const halo = dilate(flat.ink, w, h, Math.max(1, Math.round(h / SIDE_MIN)));
    const out = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < flat.ink.length; i += 1, p += 4) {
      if (flat.ink[i]) out.data[p + 3] = 255;
      else if (halo[i]) {
        out.data[p] = 255;
        out.data[p + 1] = 255;
        out.data[p + 2] = 255;
        out.data[p + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [ready, flat, w, h]);

  const clearHover = () => {
    const c = hover.current;
    const st = hoverState.current;
    st.idx = null;
    st.mask = null;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  };

  // Labels or the armed material changed under a held hover: drop it.
  useEffect(() => {
    clearHover();
  }, [view.rev, session.armed, tool]);

  const toRaster = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * w) / r.width,
      y: ((e.clientY - r.top) * h) / r.height,
      scale: w / r.width,
    };
  };

  const showHover = (x: number, y: number) => {
    if (!ready || !flat || !labels) return;
    const px = Math.floor(x);
    const py = Math.floor(y);
    const st = hoverState.current;
    const at = py * w + px;
    if (st.mask && st.mask[at] && st.rev === view.rev && st.armed === session.armed) return;
    const idx = componentAt(labels, flat.labels, w, h, px, py);
    const c = hover.current;
    if (!c) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    st.idx = idx;
    st.rev = view.rev;
    st.armed = session.armed;
    st.mask = null;
    if (!idx || idx.length === 0) return;
    const mask = new Uint8Array(w * h);
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    for (const i of idx) {
      mask[i] = 1;
      const ix = i % w;
      const iy = (i / w) | 0;
      if (ix < x0) x0 = ix;
      if (ix > x1) x1 = ix;
      if (iy < y0) y0 = iy;
      if (iy > y1) y1 = iy;
    }
    st.mask = mask;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const out = ctx.createImageData(bw, bh);
    const erase = tool === 'erase';
    const s = sampler(session.skins.get(session.armed), h);
    const tmp = new Uint8ClampedArray(4);
    for (const i of idx) {
      const ix = i % w;
      const iy = (i / w) | 0;
      const p = ((iy - y0) * bw + (ix - x0)) * 4;
      if (erase) {
        out.data[p] = 255;
        out.data[p + 1] = 255;
        out.data[p + 2] = 255;
        out.data[p + 3] = 200;
      } else {
        s(ix, iy, tmp, 0);
        out.data[p] = tmp[0];
        out.data[p + 1] = tmp[1];
        out.data[p + 2] = tmp[2];
        out.data[p + 3] = Math.round(255 * HOVER_ALPHA);
      }
    }
    ctx.putImageData(out, x0, y0);
  };

  const closePen = (pts = pen) => {
    if (flat && pts.length >= 3)
      session.apply(view.view, polygonIndices(pts, flat.silhouette, w, h));
    setPen([]);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    const { x, y } = toRaster(e);
    if (tool === 'pen') {
      setCursor({ x, y });
      return;
    }
    showHover(x, y);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready || e.button !== 0) return;
    (e.currentTarget.closest('[data-paint-parts]') as HTMLElement | null)?.focus({
      preventScroll: true,
    });
    const { x, y, scale } = toRaster(e);
    if (tool === 'pen') {
      if (pen.length >= 3) {
        const first = pen[0];
        if (Math.hypot(first.x - x, first.y - y) <= 8 * scale) {
          closePen();
          return;
        }
      }
      if (e.detail >= 2 && pen.length >= 3) {
        closePen();
        return;
      }
      setPen((p) => [...p, { x, y }]);
      return;
    }
    if (!labels || !flat) return;
    const st = hoverState.current;
    const at = Math.floor(y) * w + Math.floor(x);
    const idx =
      st.mask && st.mask[at] && st.rev === view.rev
        ? st.idx
        : componentAt(labels, flat.labels, w, h, Math.floor(x), Math.floor(y));
    session.apply(view.view, idx);
  };

  // The pen speaks to the block's keys through a DOM event (Enter / Esc are the block's).
  useEffect(() => {
    const el = mock.current?.closest('[data-paint-parts]');
    if (!el) return;
    const onKey = (ev: Event) => {
      const k = (ev as CustomEvent<string>).detail;
      if (k === 'close') closePen();
      if (k === 'cancel') setPen([]);
    };
    el.addEventListener('paint-pen', onKey);
    return () => el.removeEventListener('paint-pen', onKey);
  });

  useEffect(() => {
    if (tool !== 'pen') setPen([]);
  }, [tool]);

  const width = Math.round(height * (view.aspect || 0.6));
  const stroke = Math.max(1, h / height) * 1.5;
  const tail = pen.length > 0 && cursor ? [...pen, cursor] : pen;

  return (
    <div
      className='flex shrink-0 flex-col gap-1'
      data-paint-side={view.view}
      data-paint-status={view.status}
      style={{ width: `min(100%, ${width}px)` }}
    >
      <div
        className={cn(
          'relative w-full touch-none select-none border border-borderColor bg-bgColor',
          ready ? (tool === 'pen' ? 'cursor-crosshair' : 'cursor-pointer') : 'cursor-wait',
        )}
        style={{ aspectRatio: `${view.aspect || 0.6}` }}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={() => {
          clearHover();
          setCursor(null);
        }}
      >
        <canvas ref={mock} className='absolute inset-0 size-full' />
        <canvas ref={hover} className='pointer-events-none absolute inset-0 size-full' />
        <canvas ref={ink} className='pointer-events-none absolute inset-0 size-full' />
        {tail.length > 0 && w > 0 && (
          <svg
            className='pointer-events-none absolute inset-0 size-full'
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio='none'
            data-paint-pen={pen.length}
          >
            <polygon
              points={tail.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={session.skins.get(session.armed)?.hex ?? '#000'}
              fillOpacity={0.3}
              stroke='#000'
              strokeWidth={stroke}
              strokeDasharray={`${stroke * 3} ${stroke * 2}`}
            />
            {pen.map((p, i) => (
              <rect
                key={i}
                x={p.x - stroke * 2}
                y={p.y - stroke * 2}
                width={stroke * 4}
                height={stroke * 4}
                fill={i === 0 ? '#000' : '#fff'}
                stroke='#000'
                strokeWidth={stroke}
              />
            ))}
          </svg>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {viewLabel(view.view)}
        </Text>
        {view.stale && <Pill tone='attention'>stale</Pill>}
        {view.status === 'error' && <Pill tone='warn'>not loaded</Pill>}
      </div>
    </div>
  );
}

export function PartsCanvas({
  session,
  disabled,
}: {
  session: PaintSession;
  disabled?: boolean;
}): JSX.Element | null {
  const views = [...session.views.values()];
  const row = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRowWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [views.length > 0]);
  if (views.length === 0) return null;
  const sumAspect = views.reduce((a, v) => a + (v.aspect || 0.6), 0);
  const fit =
    rowWidth > 0 ? (rowWidth - GAP * (views.length - 1) - 2 * views.length) / sumAspect : SIDE_MIN;
  const height = Math.round(Math.max(SIDE_MIN, Math.min(SIDE_MAX, fit)));
  const save = session.save;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if (cmd || e.altKey) return;
    const tool = ({ KeyV: 'click', KeyP: 'pen', KeyE: 'erase' } as const)[e.code as 'KeyV'];
    if (tool) {
      e.preventDefault();
      session.setTool(tool);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.dispatchEvent(
        new CustomEvent('paint-pen', { detail: e.key === 'Enter' ? 'close' : 'cancel' }),
      );
    }
  };

  const tools = (
    <span className='flex items-center gap-1' data-paint-tools=''>
      {save === 'saving' || save === 'pending' ? (
        <Pill tone='mut'>saving</Pill>
      ) : save === 'unsaved' || save === 'error' ? (
        <button
          type='button'
          onClick={() => session.retry()}
          title={session.saveError}
          data-paint-retry=''
        >
          <Pill tone={save === 'unsaved' ? 'attention' : 'warn'}>unsaved · retry</Pill>
        </button>
      ) : null}
      {TOOLS.map((t) => (
        <Chip
          key={t}
          selected={session.tool === t}
          onClick={() => session.setTool(t)}
          disabled={disabled}
          title={`${t} · ${t[0].toUpperCase()}`}
          data-paint-tool={t}
        >
          {t}
        </Chip>
      ))}
      <Chip
        onClick={() => session.undo()}
        disabled={disabled || !session.canUndo()}
        title='undo · ⌘Z'
      >
        undo
      </Chip>
    </span>
  );

  return (
    <div data-paint-parts='' tabIndex={-1} onKeyDown={onKey} className='outline-none'>
      <GroupLabel flush className={GROUP_GAP} action={tools}>
        parts
      </GroupLabel>
      <div
        ref={row}
        className={cn(
          'flex flex-wrap items-start gap-2',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {views.map((v) => (
          <PaintSide
            key={`${v.view}:${v.baseMediaId}`}
            session={session}
            view={v}
            height={height}
          />
        ))}
      </div>
    </div>
  );
}
