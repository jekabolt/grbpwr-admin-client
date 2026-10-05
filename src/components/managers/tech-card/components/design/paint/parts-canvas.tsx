import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { ArtworkImage } from 'ui/components/annotation/insets';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { placementsOnPicture } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { GROUP_GAP } from '../core';
import { viewLabel } from '../views';
import {
  inkField,
  LiveWire,
  magnetic,
  releaseInk,
  snapToInk,
  type InkField,
  type Pt,
} from './livewire';
import { clothMask, componentAt, displayLabels, polygonIndices, underLines } from './map-model';
import {
  annotationOfQuad,
  boxQuad,
  centreOf,
  clampQuad,
  flatPictureIds,
  growQuad,
  insideQuad,
  MAX_RENDER_ARTWORKS,
  moveQuad,
  quadOfPlacement,
  rotateQuad,
  rotationHandle,
  scaleQuad,
  withCorner,
  type CanvasArtwork,
  type Quad,
} from './artworks';
import { tileSampler } from './mockup';
import { concatIndices, partIndices } from './parts-model';
import type { PaintSession, PaintSkin, PaintTool, PaintView } from './use-paint';

/**
 * PAINT THE PARTS · the inline canvas on FABRIC RENDER: every side holding a flat in one row, the
 * same height; the paper is the flat, the paint is the material's texture, the drawing's lines sit
 * on top black with a white halo — always readable over any cloth (R3).
 *
 *   click  fills the part under the pointer: the model's named part when the side has auto parts
 *          (and the same-named part on the other sides, R9), else the region between the lines;
 *          ⇧-click this side only (QW6); ⌥-click fills one region only (cuts a part). A side the
 *          model cannot name (cut into fewer than 2 or more than 60 regions — a sketch, a photo)
 *          is `pen only`: CLICK draws the pen there (QW5)
 *   pen    a polygon of the armed material, clipped to the garment — closes open outlines; it is
 *          magnetic: a vertex lands on a line within reach, and between two vertices on lines the
 *          edge follows the drawing (straight across a gap and over paper); ⇧ = a straight edge
 *   erase  click back to paper
 *   artwork (R7) the armed artwork tile: drag on a side = a new box; a selected box moves (drag
 *          inside), its 4 corners move alone (free perspective; ⇧ = uniform scale), the handle
 *          above the top edge turns it; every drop = one SetDesignAssetPlacement (4-point POLYGON)
 * Keys: V / P / E / A, ⌘Z / ⇧⌘Z, Enter closes the pen, Esc drops it (or the artwork selection),
 * ⌫ deletes the selected artwork placement.
 */

/** Sides share one height that fills the row, within these bounds. */
const SIDE_MIN = 320;
const SIDE_MAX = 640;
const GAP = 8;
const TOOLS: PaintTool[] = ['click', 'pen', 'erase'];
const HOVER_ALPHA = 0.45;

/** Under this cloth luminance the drawing turns light; the light line's grey. */
const LINE_FLIP = 0.35;
const LINE_LIGHT = 236;

/** A material's mean luminance 0..1 (its tile, else its colour). */
function luminance(skin: PaintSkin | undefined): number {
  const tile = skin?.tile;
  if (tile) {
    let sum = 0;
    const n = tile.width * tile.height;
    for (let q = 0; q < n * 4; q += 4)
      sum += 0.299 * tile.data[q] + 0.587 * tile.data[q + 1] + 0.114 * tile.data[q + 2];
    return sum / n / 255;
  }
  const hex = skin?.hex || '#dddddd';
  return (
    (0.299 * parseInt(hex.slice(1, 3), 16) +
      0.587 * parseInt(hex.slice(3, 5), 16) +
      0.114 * parseInt(hex.slice(5, 7), 16)) /
    255
  );
}
/** The live preview's search time per frame, and the most a click may wait for its edge. */
const WIRE_FRAME_MS = 6;
const WIRE_COMMIT_MS = 30;

/** QW1 · the REMAINDER on the canvas: its cloth at this share over the paper. */
const REMAINDER_SHARE = 0.6;
/** QW9 · a region spanning two parts: a 1 px diagonal every HATCH px, at this ink share. */
const HATCH = 7;
const HATCH_SHARE = 0.3;

/**
 * A material's pixel on a side: its picture laid `tilePx` wide (QW2 — the mockup's own rule,
 * `tileSampler`), or its colour.
 */
function sampler(skin: PaintSkin | undefined, tilePx: number) {
  const tile = skin?.tile ?? null;
  if (tile) return tileSampler(tile.data, tile.width, tile.height, tilePx);
  const hex = skin?.hex || '#dddddd';
  const solid = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  return (_x: number, _y: number, out: Uint8ClampedArray, p: number) => {
    out[p] = solid[0];
    out[p + 1] = solid[1];
    out[p + 2] = solid[2];
  };
}

/* ─────────────────────────── R7 · artwork placements ─────────────────────────── */

/** One artwork mark on one side; `quad` in fractions of the flat. */
type Placed = {
  key: string;
  placementId: number;
  assetId: number;
  pictureId: number;
  quad: Quad;
};

type SideArtwork = {
  pictureId: number;
  items: Placed[];
  arts: Map<number, CanvasArtwork>;
  /** Asset a drag places (0 = none). */
  armed: number;
  active: boolean;
  selectedKey: string;
  onSelect: (key: string) => void;
  onCommit: (item: Omit<Placed, 'key'> & { key?: string }) => void;
  /** The colourway already carries `MAX_RENDER_ARTWORKS` placements: a new one is refused. */
  full: boolean;
  onFull: () => void;
};

const FULL_REASON = `at most ${MAX_RENDER_ARTWORKS} artworks per render`;

const HANDLE = 8;
const ROT_OFF = 22;
const NEW_MIN = 12;

type Drag = {
  mode: 'new' | 'move' | 'corner' | 'rotate';
  key: string;
  start: Pt;
  /** Pixels of the layer. */
  base: Quad;
  corner: number;
  item: Placed | null;
};

type HoverPart = { key: string; part: 'body' | 'corner' | 'rotate' };

/**
 * The artworks of one side: the PNG warped into its quad (the callout's `ArtworkImage` — four
 * points, TL TR BR BL), multiply-blended unless cut out; frames and handles on top. Pointer events
 * only while the `artwork` tool is on — the paint tools never meet a box.
 */
function ArtworkLayer({ art }: { art: SideArtwork }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ key: string; quad: Quad } | null>(null);
  const [hover, setHover] = useState<HoverPart | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w, h } = size;
  const px = (q: Quad) => scaleQuad(q, w, h);
  const frac = (q: Quad) => scaleQuad(clampQuad(q, w, h), 1 / w, 1 / h);
  const quadOf = (it: Placed) => (live?.key === it.key ? live.quad : px(it.quad));
  // A NEW placement has no id until its create returns: shown pending, never moved or selected —
  // a drag then would send a second create (a duplicate).
  const selected = art.items.find((it) => it.key === art.selectedKey && it.placementId > 0) ?? null;

  const pos = (e: PointerEvent<HTMLDivElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(w, Math.max(0, e.clientX - r.left)),
      y: Math.min(h, Math.max(0, e.clientY - r.top)),
    };
  };

  const hitAt = (p: Pt): HoverPart | null => {
    if (selected) {
      const q = px(selected.quad);
      const c = q.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) <= HANDLE);
      if (c >= 0) return { key: selected.key, part: 'corner' };
      const r = rotationHandle(q, ROT_OFF, w, h).at;
      if (Math.hypot(r.x - p.x, r.y - p.y) <= HANDLE) return { key: selected.key, part: 'rotate' };
    }
    const hit = [...art.items].reverse().find((it) => insideQuad(p, px(it.quad)));
    return hit ? { key: hit.key, part: 'body' } : null;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!art.active || e.button !== 0 || w < 1 || h < 1) return;
    e.stopPropagation();
    (e.currentTarget.closest('[data-paint-parts]') as HTMLElement | null)?.focus({
      preventScroll: true,
    });
    const p = pos(e);
    const hit = hitAt(p);
    const item = hit ? art.items.find((it) => it.key === hit.key) ?? null : null;
    if (item && item.placementId <= 0) return;
    if (hit && item) {
      const base = px(item.quad);
      art.onSelect(item.key);
      drag.current = {
        mode: hit.part === 'body' ? 'move' : hit.part,
        key: item.key,
        start: p,
        base,
        corner:
          hit.part === 'corner'
            ? base.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) <= HANDLE)
            : -1,
        item,
      };
    } else if (art.armed > 0) {
      art.onSelect('');
      if (art.full) {
        art.onFull();
        return;
      }
      drag.current = {
        mode: 'new',
        key: 'draft',
        start: p,
        base: boxQuad(p, p),
        corner: -1,
        item: null,
      };
      setLive({ key: 'draft', quad: boxQuad(p, p) });
    } else {
      art.onSelect('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!art.active) return;
    e.stopPropagation();
    const p = pos(e);
    const d = drag.current;
    if (!d) {
      setHover(hitAt(p));
      return;
    }
    let q: Quad = d.base;
    if (d.mode === 'new') q = boxQuad(d.start, p);
    else if (d.mode === 'move') q = moveQuad(d.base, p.x - d.start.x, p.y - d.start.y, w, h);
    else if (d.mode === 'corner' && d.corner >= 0) {
      if (e.shiftKey) {
        const c = centreOf(d.base);
        const from = Math.hypot(d.base[d.corner].x - c.x, d.base[d.corner].y - c.y) || 1;
        q = growQuad(d.base, Math.max(0.05, Math.hypot(p.x - c.x, p.y - c.y) / from));
      } else q = withCorner(d.base, d.corner, p);
    } else if (d.mode === 'rotate') {
      const c = centreOf(d.base);
      const a0 = Math.atan2(d.start.y - c.y, d.start.x - c.x);
      const a1 = Math.atan2(p.y - c.y, p.x - c.x);
      q = rotateQuad(d.base, a1 - a0);
    }
    setLive({ key: d.key, quad: q });
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const l = live;
    setLive(null);
    if (!d || !l) return;
    e.stopPropagation();
    if (d.mode === 'new') {
      const xs = l.quad.map((v) => v.x);
      const ys = l.quad.map((v) => v.y);
      if (
        Math.max(...xs) - Math.min(...xs) < NEW_MIN ||
        Math.max(...ys) - Math.min(...ys) < NEW_MIN
      )
        return;
      art.onCommit({
        placementId: 0,
        assetId: art.armed,
        pictureId: art.pictureId,
        quad: frac(l.quad),
      });
      return;
    }
    if (!d.item) return;
    const moved = l.quad.some((v, i) => Math.hypot(v.x - d.base[i].x, v.y - d.base[i].y) >= 1);
    if (!moved) return;
    art.onCommit({ ...d.item, quad: frac(l.quad) });
  };

  const cursor = !art.active
    ? ''
    : hover?.part === 'corner'
      ? 'cursor-nwse-resize'
      : hover?.part === 'rotate'
        ? 'cursor-grab'
        : hover?.part === 'body'
          ? 'cursor-move'
          : art.armed > 0
            ? 'cursor-crosshair'
            : 'cursor-default';

  const stroke = 'var(--color-textColor)';
  return (
    <div
      ref={ref}
      data-artwork-layer={art.items.length}
      className={cn('absolute inset-0', art.active ? cursor : 'pointer-events-none')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        setLive(null);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {w > 0 &&
        art.items.map((it) => {
          const a = art.arts.get(it.assetId);
          if (!a?.url) return null;
          return (
            <div
              key={it.key}
              className={cn(
                'pointer-events-none absolute inset-0',
                it.placementId <= 0 && 'opacity-50',
              )}
              style={{ mixBlendMode: a.cut ? 'normal' : 'multiply' }}
              data-artwork-placed={it.placementId}
              data-artwork-pending={it.placementId <= 0 ? '' : undefined}
              data-artwork-asset={it.assetId}
            >
              <ArtworkImage quad={quadOf(it)} box={size} src={a.url} />
            </div>
          );
        })}
      {w > 0 && (
        <svg
          aria-hidden
          className='pointer-events-none absolute inset-0 size-full overflow-visible'
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio='none'
        >
          {art.items.map((it) => {
            const sel = it.key === art.selectedKey;
            const hov = art.active && hover?.key === it.key;
            if (!sel && !hov) return null;
            const q = quadOf(it);
            return (
              <polygon
                key={it.key}
                points={q.map((v) => `${v.x},${v.y}`).join(' ')}
                fill='none'
                stroke={stroke}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={sel ? undefined : '4 3'}
              />
            );
          })}
          {selected &&
            (() => {
              const q = quadOf(selected);
              const r = rotationHandle(q, ROT_OFF, w, h);
              return (
                <g data-artwork-handles=''>
                  <line x1={r.from.x} y1={r.from.y} x2={r.at.x} y2={r.at.y} stroke={stroke} />
                  <circle
                    cx={r.at.x}
                    cy={r.at.y}
                    r={4.5}
                    fill='#fff'
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                  {q.map((v, i) => (
                    <rect
                      key={i}
                      x={v.x - 4}
                      y={v.y - 4}
                      width={8}
                      height={8}
                      fill='#fff'
                      stroke={stroke}
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              );
            })()}
          {live?.key === 'draft' && (
            <polygon
              data-artwork-draft=''
              points={live.quad.map((v) => `${v.x},${v.y}`).join(' ')}
              fill='none'
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray='4 3'
            />
          )}
        </svg>
      )}
    </div>
  );
}

function PaintSide({
  session,
  view,
  height,
  artwork,
  onFocus,
}: {
  session: PaintSession;
  view: PaintView;
  height: number;
  artwork?: SideArtwork;
  /** QW8 · a double click on the caption or the paper around the garment: this side alone. */
  onFocus: () => void;
}): JSX.Element {
  const mock = useRef<HTMLCanvasElement>(null);
  const hover = useRef<HTMLCanvasElement>(null);
  const hoverState = useRef<{
    idx: Int32Array | null;
    mask: Uint8Array | null;
    rev: number;
    armed: string;
    /** -1 = one region (Ф1 rule), else the part's group. */
    group: number;
    region: number;
  }>({
    idx: null,
    mask: null,
    rev: -1,
    armed: '',
    group: -1,
    region: 0,
  });
  const [partName, setPartName] = useState('');
  /** The pen's vertices and the edge drawn through them so far (starts at the first vertex). */
  const [pen, setPenState] = useState<{ anchors: Pt[]; ring: Pt[] }>({ anchors: [], ring: [] });
  /** The edge from the last vertex to the cursor. */
  const [preview, setPreview] = useState<Pt[]>([]);
  /** Mirrors `pen` for the frame loop and key handlers (no stale closures). */
  const penRef = useRef(pen);
  const wire = useRef<{
    live: LiveWire | null;
    /** The cursor the frame loop chases. */
    want: { raw: Pt; straight: boolean; scale: number } | null;
    /** The preview on show, exactly as a click would commit it. */
    shown: { from: Pt; target: Pt; path: Pt[] } | null;
    frame: number;
  }>({ live: null, want: null, shown: null, frame: 0 });
  const { flat, labels, pixels } = view;
  const w = flat?.w ?? 0;
  const h = flat?.h ?? 0;
  const ready = view.status === 'ready' && !!flat && !!labels && !!pixels;
  /* QW5 · a side the model cannot name is the pen's: CLICK draws the pen over it. */
  const penOnly = ready && !session.namable(view);
  const tool = penOnly && session.tool === 'click' ? 'pen' : session.tool;
  const remainder = session.remainder();
  const split = view.parts?.split;

  // The paper, the paint under the lines, and the drawing itself on top: multiplied over light
  // cloth, drawn light over dark cloth — one line, no halo (R14). Display only: the map sent to
  // the model keeps its labels and black ink.
  useEffect(() => {
    const c = mock.current;
    if (!ready || !c || !labels || !pixels || !flat) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const shown = displayLabels(labels, underLines(flat));
    const out = new ImageData(new Uint8ClampedArray(pixels.data), w, h);
    const d = out.data;
    const looks = new Map<number, { s: ReturnType<typeof sampler>; dark: boolean }>();
    const lookOf = (label: string) => {
      const skin = session.skins.get(label);
      return { s: sampler(skin, session.tilePx(label, view)), dark: luminance(skin) < LINE_FLIP };
    };
    // QW1 · the unpainted garment is the REMAINDER the run lays there — muted, so paint reads.
    const rest = remainder ? lookOf(remainder).s : null;
    const cloth = rest ? clothMask(flat) : null;
    const tmp = new Uint8ClampedArray(4);
    for (let i = 0, p = 0; i < shown.length; i += 1, p += 4) {
      // The flat's own pixel over white paper.
      const a = d[p + 3] / 255;
      let fr = d[p] * a + 255 * (1 - a);
      let fg = d[p + 1] * a + 255 * (1 - a);
      let fb = d[p + 2] * a + 255 * (1 - a);
      d[p + 3] = 255;
      const v = shown[i];
      const x = i % w;
      const y = (i / w) | 0;
      if (!v) {
        // QW9 · a region the model could not split: a thin hatch over the unpainted.
        if (split?.size && split.has(flat.labels[i]) && (x + y) % HATCH === 0) {
          fr *= 1 - HATCH_SHARE;
          fg *= 1 - HATCH_SHARE;
          fb *= 1 - HATCH_SHARE;
        }
        if (rest && cloth?.[i]) {
          rest(x, y, tmp, 0);
          const k = REMAINDER_SHARE;
          d[p] = ((255 * (1 - k) + tmp[0] * k) * fr) / 255;
          d[p + 1] = ((255 * (1 - k) + tmp[1] * k) * fg) / 255;
          d[p + 2] = ((255 * (1 - k) + tmp[2] * k) * fb) / 255;
          continue;
        }
        d[p] = fr;
        d[p + 1] = fg;
        d[p + 2] = fb;
        continue;
      }
      let look = looks.get(v);
      if (!look) {
        look = lookOf(`#${v.toString(16).padStart(6, '0')}`);
        looks.set(v, look);
      }
      look.s(x, y, tmp, 0);
      if (look.dark) {
        // How much line is in this pixel, drawn toward a light line.
        const k = 1 - Math.min(fr, fg, fb) / 255;
        d[p] = tmp[0] + (LINE_LIGHT - tmp[0]) * k;
        d[p + 1] = tmp[1] + (LINE_LIGHT - tmp[1]) * k;
        d[p + 2] = tmp[2] + (LINE_LIGHT - tmp[2]) * k;
      } else {
        d[p] = (tmp[0] * fr) / 255;
        d[p + 1] = (tmp[1] * fg) / 255;
        d[p + 2] = (tmp[2] * fb) / 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view.rev, w, h, flat, remainder, split]);

  /** The hover canvas shows another side's part (R17), not one under this side's pointer. */
  const echoShown = useRef(false);

  const clearHover = () => {
    const c = hover.current;
    const st = hoverState.current;
    st.idx = null;
    st.mask = null;
    st.group = -1;
    st.region = 0;
    echoShown.current = false;
    setPartName('');
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  };

  /** The part's group under (x, y): -1 = no parts here, or ⌥ asks for one region. */
  const groupAt = (px: number, py: number, alt: boolean): number => {
    const parts = view.parts;
    if (alt || !parts || !flat || tool === 'pen') return -1;
    const region = flat.labels[py * w + px];
    return region ? parts.regionGroup[region] : -1;
  };

  // Labels or the armed material changed under a held hover: drop it.
  useEffect(() => {
    clearHover();
  }, [view.rev, session.armed, tool, view.parts]);

  // R17: the part hovered on another side is tinted here too, with its name by the caption.
  const echo = tool === 'pen' || tool === 'artwork' ? null : session.echoOf(view.view);
  const echoKey = echo
    ? `${echo.groups.join(',')}|${view.rev}|${view.partsSig}|${session.armed}|${tool}`
    : '';
  useEffect(() => {
    if (!echo) {
      if (echoShown.current) clearHover();
      return;
    }
    if (!ready || !flat || !labels || !view.parts) return;
    const parts = view.parts;
    tint(concatIndices(echo.groups.map((g) => partIndices(labels, flat, parts, g))));
    hoverState.current.mask = null;
    echoShown.current = true;
    setPartName(echo.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoKey, ready]);

  /** Draw `idx` on the hover canvas in the armed material (white for erase). */
  const tint = (idx: Int32Array | null) => {
    const c = hover.current;
    if (!c) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!idx || idx.length === 0) return null;
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
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const out = ctx.createImageData(bw, bh);
    const erase = tool === 'erase';
    const s = sampler(session.skins.get(session.armed), session.tilePx(session.armed, view));
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
    return mask;
  };

  const toRaster = (e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * w) / r.width,
      y: ((e.clientY - r.top) * h) / r.height,
      scale: w / r.width,
    };
  };

  const showHover = (x: number, y: number, alt: boolean, only: boolean) => {
    if (!ready || !flat || !labels) return;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const st = hoverState.current;
    const at = py * w + px;
    const group = groupAt(px, py, alt);
    const region = flat.labels[at];
    if (
      st.mask &&
      st.mask[at] &&
      st.rev === view.rev &&
      st.armed === session.armed &&
      st.group === group &&
      st.region === region &&
      session.hovered?.only === only
    )
      return;
    const parts = view.parts;
    const idx =
      parts && group >= 0
        ? partIndices(labels, flat, parts, group, { x: px, y: py })
        : componentAt(labels, flat.labels, w, h, px, py);
    st.group = group;
    st.region = region;
    const label = parts && group >= 0 ? parts.groups[group].label : '';
    setPartName(label && parts?.split.has(region) ? `${label} · no seam, use the pen` : label);
    session.setHover(view.view, group, only);
    echoShown.current = false;
    st.idx = idx;
    st.rev = view.rev;
    st.armed = session.armed;
    st.mask = tint(idx) ?? null;
  };

  /** The flat's ink cost field — built on first use, only for the side being drawn on. */
  const fieldOf = (): InkField | null => (flat ? inkField(flat) : null);

  /** The search from the last vertex toward `t` (re-made when another side took the workspace
   *  or `t` left its corridor). */
  const liveFrom = (f: InkField, last: Pt, t: Pt): LiveWire => {
    const st = wire.current;
    const live = st.live;
    if (!live?.alive() || live.field !== f || live.from !== last || !live.covers(t))
      st.live = new LiveWire(f, last, t);
    return st.live!;
  };

  /** Stop the preview: no frame, no target, nothing shown. */
  const stopPreview = () => {
    const st = wire.current;
    cancelAnimationFrame(st.frame);
    st.frame = 0;
    st.want = null;
    st.shown = null;
    setPreview([]);
  };

  const resetPen = () => {
    stopPreview();
    wire.current.live = null;
    penRef.current = { anchors: [], ring: [] };
    setPenState(penRef.current);
  };

  /** The vertex a click at `p` makes: on the line within reach, unless ⇧. */
  const vertexAt = (p: Pt, straight: boolean): Pt => {
    const f = straight ? null : fieldOf();
    return f ? snapToInk(f, p) : p;
  };

  /**
   * The edge a click commits from the last vertex to `b`: exactly the preview on show when it
   * ends at `b`; else settled within WIRE_COMMIT_MS; else straight.
   */
  const commitEdge = (a: Pt, b: Pt, straight: boolean): Pt[] => {
    const shown = wire.current.shown;
    if (shown && shown.from === a && shown.target.x === b.x && shown.target.y === b.y)
      return shown.path;
    const f = straight ? null : fieldOf();
    if (!f || !magnetic(f, a, b)) return [a, b];
    const live = liveFrom(f, a, b);
    if (!live.expand(b, performance.now() + WIRE_COMMIT_MS)) return [a, b];
    const path = live.pathTo(b);
    return path.length >= 2 ? path : [a, b];
  };

  const closePen = (straight = false) => {
    const { anchors, ring } = penRef.current;
    if (flat && anchors.length >= 3) {
      const last = anchors[anchors.length - 1];
      const pts = [...ring, ...commitEdge(last, anchors[0], straight).slice(1, -1)];
      session.apply(view.view, polygonIndices(pts, flat.silhouette, w, h));
    }
    resetPen();
  };

  const addVertex = (raw: Pt, straight: boolean) => {
    const { anchors, ring } = penRef.current;
    const v = vertexAt(raw, straight);
    const last = anchors[anchors.length - 1];
    const seg = last ? commitEdge(last, v, straight).slice(1) : [v];
    stopPreview();
    wire.current.live = null;
    penRef.current = { anchors: [...anchors, v], ring: [...ring, ...seg] };
    setPenState(penRef.current);
  };

  /** ONE frame loop owns the search: each frame grows it for at most WIRE_FRAME_MS. */
  const pump = () => {
    const st = wire.current;
    st.frame = 0;
    const want = st.want;
    const { anchors } = penRef.current;
    const last = anchors[anchors.length - 1];
    if (!want || !last) return;
    const first = anchors[0];
    // Near the first vertex the preview IS the closing edge.
    const closing =
      anchors.length >= 3 &&
      Math.hypot(first.x - want.raw.x, first.y - want.raw.y) <= 8 * want.scale;
    const target = closing ? first : vertexAt(want.raw, want.straight);
    const f = want.straight ? null : fieldOf();
    let path: Pt[] | null = null;
    if (!f || !magnetic(f, last, target)) path = [last, target];
    else {
      const live = liveFrom(f, last, target);
      if (live.expand(target, performance.now() + WIRE_FRAME_MS)) {
        const p = live.pathTo(target);
        path = p.length >= 2 ? p : [last, target];
      }
    }
    if (path) {
      st.shown = { from: last, target, path };
      setPreview(path);
      return;
    }
    // Not reached yet: straight meanwhile, keep growing next frame.
    st.shown = null;
    setPreview([last, target]);
    st.frame = requestAnimationFrame(pump);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready || tool === 'artwork') return;
    const { x, y } = toRaster(e);
    if (tool === 'pen') {
      // Only the target moves here; the frame loop does the work.
      const st = wire.current;
      st.want = { raw: { x, y }, straight: e.shiftKey, scale: toRaster(e).scale };
      if (penRef.current.anchors.length > 0 && !st.frame) st.frame = requestAnimationFrame(pump);
      return;
    }
    showHover(x, y, e.altKey, e.shiftKey);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready || e.button !== 0 || tool === 'artwork') return;
    (e.currentTarget.closest('[data-paint-parts]') as HTMLElement | null)?.focus({
      preventScroll: true,
    });
    const { x, y, scale } = toRaster(e);
    if (tool === 'pen') {
      const n = penRef.current.anchors.length;
      if (n >= 3) {
        const first = penRef.current.anchors[0];
        if (Math.hypot(first.x - x, first.y - y) <= 8 * scale) {
          closePen(e.shiftKey);
          return;
        }
      }
      if (e.detail >= 2 && n >= 3) {
        closePen(e.shiftKey);
        return;
      }
      addVertex({ x, y }, e.shiftKey);
      return;
    }
    if (!labels || !flat) return;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    // QW8 · the paper around the garment is not paint: its double click focuses the side.
    if (!flat.silhouette[py * w + px]) return;
    const group = groupAt(px, py, e.altKey);
    if (group >= 0) {
      session.paintPart(view.view, group, { x: px, y: py }, e.shiftKey);
      return;
    }
    const st = hoverState.current;
    const at = py * w + px;
    const idx =
      st.mask && st.mask[at] && st.rev === view.rev && st.group === -1
        ? st.idx
        : componentAt(labels, flat.labels, w, h, px, py);
    session.apply(view.view, idx);
  };

  // The pen speaks to the block's keys through a DOM event (Enter / Esc are the block's).
  useEffect(() => {
    const el = mock.current?.closest('[data-paint-parts]');
    if (!el) return;
    const onKey = (ev: Event) => {
      const k = (ev as CustomEvent<string>).detail;
      if (k === 'close') closePen();
      if (k === 'cancel') resetPen();
    };
    el.addEventListener('paint-pen', onKey);
    return () => el.removeEventListener('paint-pen', onKey);
  });

  // Pen put away or the side's flat changed: drop the pen, its search and the ink field.
  useEffect(() => {
    resetPen();
    releaseInk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, flat]);

  useEffect(
    () => () => {
      cancelAnimationFrame(wire.current.frame);
      releaseInk();
    },
    [],
  );

  const width = Math.round(height * (view.aspect || 0.6));
  const stroke = Math.max(1, h / height) * 1.5;
  const tail = preview.length > 1 ? [...pen.ring, ...preview.slice(1)] : pen.ring;
  const outline = tail.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div
      className='flex shrink-0 flex-col gap-1'
      data-paint-side={view.view}
      data-paint-status={view.status}
      style={{ width: `min(100%, ${width}px)` }}
    >
      <div
        className={cn(
          'relative w-full touch-none select-none border bg-bgColor transition-colors duration-200',
          session.flash.has(view.view) ? 'border-textColor' : 'border-borderColor',
          ready
            ? tool === 'pen' || tool === 'artwork'
              ? 'cursor-crosshair'
              : 'cursor-pointer'
            : 'cursor-wait',
        )}
        style={{ aspectRatio: `${view.aspect || 0.6}` }}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onDoubleClick={(e) => {
          if (!flat || tool === 'pen' || tool === 'artwork') return;
          const { x, y } = toRaster(e);
          const at = Math.floor(y) * w + Math.floor(x);
          if (at >= 0 && at < w * h && !flat.silhouette[at]) onFocus();
        }}
        onPointerLeave={() => {
          clearHover();
          stopPreview();
          if (session.hovered?.view === view.view) session.setHover(null);
        }}
      >
        <canvas ref={mock} className='absolute inset-0 size-full' />
        <canvas ref={hover} className='pointer-events-none absolute inset-0 size-full' />
        {artwork && ready && <ArtworkLayer art={artwork} />}
        {tail.length > 0 && w > 0 && (
          <svg
            className='pointer-events-none absolute inset-0 size-full'
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio='none'
            data-paint-pen={pen.anchors.length}
          >
            {/* White under the dashes: an edge riding on a black line stays readable. */}
            <polygon
              points={outline}
              fill={session.skins.get(session.armed)?.hex ?? '#000'}
              fillOpacity={0.3}
              stroke='#fff'
              strokeWidth={stroke}
            />
            <polygon
              points={outline}
              fill='none'
              stroke='#000'
              strokeWidth={stroke}
              strokeDasharray={`${stroke * 3} ${stroke * 2}`}
            />
            {pen.anchors.map((p, i) => (
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
      <div
        className='flex min-w-0 cursor-default select-none items-center gap-2'
        onDoubleClick={onFocus}
        data-paint-caption={view.view}
      >
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {viewLabel(view.view)}
        </Text>
        {split && split.size > 0 && (
          <span
            title={[...split.values()].filter(Boolean).join(' · ') || 'no seam, use the pen'}
            data-paint-split={split.size}
          >
            <Pill tone='attention'>!</Pill>
          </span>
        )}
        {penOnly && <Pill tone='mut'>pen only</Pill>}
        {partName && (
          <Text size='micro' tracking='label' component='span' className='truncate uppercase'>
            {partName}
          </Text>
        )}
        {view.stale && <Pill tone='attention'>stale</Pill>}
        {view.status === 'error' && <Pill tone='warn'>not loaded</Pill>}
      </div>
    </div>
  );
}

type Pending = Placed & { token: number; gone: boolean };

export function PartsCanvas({
  session,
  disabled: disabledProp,
  band,
  artworks,
}: {
  session: PaintSession;
  disabled?: boolean;
  /** R7 · the band whose `assetPlacements` the artwork tool reads (absent = no artwork tool). */
  band?: GetDesignBandResponse;
  /** R7 · the artworks bound to the current colourway (`artworksOf`). */
  artworks?: readonly CanvasArtwork[];
}): JSX.Element | null {
  /* GENERATE is preparing its run off these maps: nothing paints until it has left. */
  const disabled = disabledProp || session.frozen;
  const views = [...session.views.values()];

  /* ─── R7 · artwork placements: the band's marks + an optimistic copy until the band re-reads ─── */
  const writes = useAssetWrites(session.techCardId);
  const { showMessage } = useSnackBarStore();
  const pictures = useMemo(() => (band ? flatPictureIds(band) : new Map<string, number>()), [band]);
  const arts = useMemo(() => new Map((artworks ?? []).map((a) => [a.assetId, a])), [artworks]);
  const [pending, setPending] = useState<Map<string, Pending>>(() => new Map());
  const [selectedKey, setSelectedKey] = useState('');
  const seq = useRef(0);
  const armedArt = arts.has(session.armedArtwork) ? session.armedArtwork : 0;
  const artworkOn = session.tool === 'artwork';
  const canPlace = !!band && arts.size > 0 && pictures.size > 0;

  useEffect(() => {
    if (!artworkOn) setSelectedKey('');
  }, [artworkOn]);

  const placedOf = useCallback(
    (view: string): Placed[] => {
      const pictureId = pictures.get(view) ?? 0;
      if (!band || pictureId <= 0 || arts.size === 0) return [];
      const out: Placed[] = [];
      for (const p of placementsOnPicture(band, pictureId, [...arts.keys()])) {
        const id = p.id ?? 0;
        const o = pending.get(`p${id}`);
        if (o) {
          if (!o.gone) out.push(o);
          continue;
        }
        const quad = quadOfPlacement(p);
        if (quad)
          out.push({ key: `p${id}`, placementId: id, assetId: p.assetId ?? 0, pictureId, quad });
      }
      for (const o of pending.values())
        if (o.placementId === 0 && o.pictureId === pictureId && !o.gone) out.push(o);
      return out;
    },
    [band, pictures, arts, pending],
  );

  const settle = (key: string, token: number) =>
    setPending((m) => {
      if (m.get(key)?.token !== token) return m;
      const n = new Map(m);
      n.delete(key);
      return n;
    });

  const placedCount = [...pictures.keys()].reduce((n, view) => n + placedOf(view).length, 0);
  const full = placedCount >= MAX_RENDER_ARTWORKS;
  const refuseFull = () => showMessage(FULL_REASON, 'error');

  /* One request in flight per placement; a move made meanwhile waits, and only the LATEST geometry
     goes once the request settles (no out-of-order writes). */
  const inFlight = useRef(new Set<number>());
  const queued = useRef(new Map<number, { item: Omit<Placed, 'key'>; token: number }>());

  const send = (item: Omit<Placed, 'key'>, key: string, token: number) => {
    const id = item.placementId;
    if (id > 0) inFlight.current.add(id);
    writes.setPlacement
      .mutateAsync({
        placementId: id,
        assetId: item.assetId,
        pictureId: item.pictureId,
        annotation: annotationOfQuad(item.quad),
        note: arts.get(item.assetId)?.technique ?? '',
      })
      .then((res) => {
        const got = res.placement?.id ?? 0;
        if (id === 0 && got > 0) setSelectedKey((k) => (k === key ? `p${got}` : k));
      })
      .catch(() => {
        if (id === 0) setSelectedKey((k) => (k === key ? '' : k));
      })
      .finally(() => {
        if (id > 0) {
          inFlight.current.delete(id);
          const next = queued.current.get(id);
          if (next) {
            queued.current.delete(id);
            send(next.item, key, next.token);
            return;
          }
        }
        settle(key, token);
      });
  };

  const commit = (item: Omit<Placed, 'key'> & { key?: string }) => {
    if (item.placementId === 0 && full) {
      refuseFull();
      return;
    }
    seq.current += 1;
    const token = seq.current;
    const key = item.placementId > 0 ? `p${item.placementId}` : `n${token}`;
    const clean: Omit<Placed, 'key'> = {
      placementId: item.placementId,
      assetId: item.assetId,
      pictureId: item.pictureId,
      quad: item.quad,
    };
    setPending((m) => new Map(m).set(key, { ...clean, key, token, gone: false }));
    if (item.placementId === 0) setSelectedKey(key);
    if (item.placementId > 0 && inFlight.current.has(item.placementId)) {
      queued.current.set(item.placementId, { item: clean, token });
      return;
    }
    send(clean, key, token);
  };

  const removeSelected = () => {
    const id = selectedKey.startsWith('p') ? Number(selectedKey.slice(1)) : 0;
    setSelectedKey('');
    if (id <= 0) return;
    const item = [...pictures.keys()].flatMap(placedOf).find((it) => it.placementId === id);
    if (!item) return;
    seq.current += 1;
    const token = seq.current;
    const key = `p${id}`;
    setPending((m) => new Map(m).set(key, { ...item, key, token, gone: true }));
    // A delete outranks a queued move: the move must not re-create what is being deleted.
    queued.current.delete(id);
    writes.deletePlacement
      .mutateAsync(id)
      .catch(() => {})
      .finally(() => settle(key, token));
  };

  const selectedInfo = (() => {
    if (!selectedKey) return null;
    for (const view of pictures.keys()) {
      const it = placedOf(view).find((x) => x.key === selectedKey);
      if (it) return { view, item: it, art: arts.get(it.assetId) };
    }
    return null;
  })();

  const sideArtwork = (view: string): SideArtwork | undefined => {
    const pictureId = pictures.get(view) ?? 0;
    if (!canPlace || pictureId <= 0) return undefined;
    return {
      pictureId,
      items: placedOf(view),
      arts,
      armed: armedArt,
      active: artworkOn && !disabled,
      selectedKey,
      onSelect: setSelectedKey,
      onCommit: commit,
      full,
      onFull: refuseFull,
    };
  };

  const row = useRef<HTMLDivElement>(null);
  const block = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  /** QW8 · the side shown alone, the block's whole width ('' = every side in a row). */
  const [focused, setFocused] = useState('');
  const focusView = views.find((v) => v.view === focused);
  const toggleFocus = (view: string) => {
    setFocused((f) => (f === view ? '' : view));
    block.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRowWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [views.length > 0]);
  if (views.length === 0) return null;
  const shownViews = focusView ? [focusView] : views;
  const sumAspect = shownViews.reduce((a, v) => a + (v.aspect || 0.6), 0);
  const fit =
    rowWidth > 0
      ? (rowWidth - GAP * (shownViews.length - 1) - 2 * shownViews.length) / sumAspect
      : SIDE_MIN;
  // A focused side takes the block's width, up to one and a half windows tall (a narrow side
  // view then stands centred: its full width would be metres of scroll).
  const focusMax =
    typeof window === 'undefined' ? SIDE_MAX : Math.max(SIDE_MAX, window.innerHeight * 1.5);
  const height = Math.round(Math.max(SIDE_MIN, Math.min(focusView ? focusMax : SIDE_MAX, fit)));
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
    if (selectedKey && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (selectedKey && e.key === 'Escape') {
      e.preventDefault();
      setSelectedKey('');
      return;
    }
    if (e.code === 'KeyA' && canPlace) {
      e.preventDefault();
      session.armArtwork(armedArt || (artworks ?? [])[0]?.assetId || 0);
      return;
    }
    const tool = ({ KeyV: 'click', KeyP: 'pen', KeyE: 'erase' } as const)[e.code as 'KeyV'];
    if (tool) {
      e.preventDefault();
      session.setTool(tool);
      return;
    }
    // Esc drops a pen under way first; with none, it leaves the focused side (QW8).
    if (e.key === 'Escape' && focused && !e.currentTarget.querySelector('[data-paint-pen]')) {
      e.preventDefault();
      setFocused('');
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
      {/* ONE place for the model's naming: `naming…` while asked (QW5), `parts · retry` when
          refused, `rename parts` once answered (QW7 — asks every side again, past the cache). */}
      {session.naming ? (
        <span data-paint-naming=''>
          <Pill tone='mut'>naming…</Pill>
        </span>
      ) : session.partsFailed ? (
        <button
          type='button'
          onClick={() => session.retryParts()}
          title={session.partsFailed}
          data-paint-parts-retry=''
        >
          <Pill tone='warn'>parts · retry</Pill>
        </button>
      ) : session.canRename() ? (
        <button
          type='button'
          onClick={() => session.renameParts()}
          disabled={disabled}
          title='ask the model to name the parts of every side again'
          data-paint-parts-rename=''
        >
          <Pill tone='mut'>rename parts</Pill>
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
      {canPlace && (
        <>
          <Text size='micro' variant='label' component='span' aria-hidden>
            │
          </Text>
          <Chip
            selected={artworkOn}
            onClick={() => session.armArtwork(armedArt || (artworks ?? [])[0]?.assetId || 0)}
            disabled={disabled}
            title='artwork · A — drag on a side to place the armed artwork'
            data-paint-tool='artwork'
          >
            artwork
          </Chip>
        </>
      )}
      <Chip
        onClick={() => session.undo()}
        disabled={disabled || !session.canUndo()}
        title='undo · ⌘Z'
      >
        undo
      </Chip>
      <Chip
        onClick={() => {
          // The chip disables itself: keep ⌘Z on the block.
          block.current?.focus({ preventScroll: true });
          session.clear();
        }}
        disabled={disabled || !session.anyPaint()}
        title='clear every side'
        data-paint-clear=''
      >
        clear
      </Chip>
    </span>
  );

  return (
    <div
      ref={block}
      data-paint-parts=''
      data-paint-focused={focused || undefined}
      tabIndex={-1}
      onKeyDown={onKey}
      className='outline-none'
    >
      <GroupLabel flush className={GROUP_GAP} action={tools}>
        parts
      </GroupLabel>
      <div
        ref={row}
        className={cn(
          'flex flex-wrap items-start gap-2',
          focusView && 'justify-center',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {shownViews.map((v) => (
          <PaintSide
            key={`${v.view}:${v.baseMediaId}`}
            session={session}
            view={v}
            height={height}
            artwork={sideArtwork(v.view)}
            onFocus={() => toggleFocus(v.view)}
          />
        ))}
      </div>
      {selectedInfo && (
        <div className='flex min-w-0 items-center gap-2 pt-2' data-artwork-selected={selectedKey}>
          <Text size='micro' tracking='label' component='span' className='truncate uppercase'>
            {selectedInfo.art?.name ?? 'artwork'}
          </Text>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            · {viewLabel(selectedInfo.view)}
          </Text>
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            onClick={removeSelected}
            disabled={disabled || selectedInfo.item.placementId <= 0}
            data-artwork-delete=''
          >
            delete
          </Button>
        </div>
      )}
    </div>
  );
}
