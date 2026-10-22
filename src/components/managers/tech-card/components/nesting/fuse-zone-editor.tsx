// Rect+ — the drawn fusing zone's canvas editor (L13, owner OK 22.10, mockup variant 3). Starts as
// the current rectangle: drag on the piece = a new rectangle, drag inside the zone = move it,
// corner + mid handles reshape it (straight mids follow their corners; a moved mid bends the side),
// the top handle rotates (shift = 15° steps), a tap on a corner toggles sharp / round, ⌘Z undoes.
// Points snap onto the inset contour and never leave it. Finger-size handles on touch.
// Coordinates: the sheet's SVG space (cm, Y down); the zone itself is piece-local mm, Y up.
import { useEffect, useRef, useState } from 'react';
import { flattenSpline } from 'lib/fusing-dxf/spline';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import type { PieceFuseSpec } from './fuse-spec';
import {
  clampZoneTransform,
  cornerSlot,
  followMids,
  isDrawnZone,
  rectPoints,
  storedZone,
  straightMid,
  zonePoints,
  type ZoneBus,
  type ZonePoint,
} from './fuse-zone';

const INK = 'var(--color-warning)';
const PAPER = 'var(--color-bgColor)';
const ROT_GAP_PX = 26;

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const str = (pts: Pt[]) => pts.map((q) => `${q.x},${q.y}`).join(' ');

function svgPoint(e: React.PointerEvent) {
  const el = e.currentTarget as SVGGraphicsElement;
  const svg = el.ownerSVGElement ?? (el as unknown as SVGSVGElement);
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: r.x, y: r.y };
}

const inside = (q: Pt, ring: Pt[]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
function nearestOn(q: Pt, ring: Pt[]) {
  let best = { p: ring[0] ?? q, d: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const ab = sub(ring[(i + 1) % ring.length], a);
    const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
    const p = add(a, ab, t);
    const d = len(sub(q, p));
    if (d < best.d) best = { p, d };
  }
  return best;
}

type Drag =
  | { t: 'pt'; i: number; moved: boolean; cx: number; cy: number; straight: boolean[] }
  | { t: 'rect'; a: Pt; b: Pt }
  | { t: 'move'; from: Pt; orig: Pt[]; moved: boolean }
  | { t: 'rot'; c: Pt; a0: number; orig: Pt[]; deg: number; moved: boolean };

export function FuseZoneEditor({
  px,
  piece,
  ci,
  spec,
  outline,
  inner,
  bus,
  onChange,
}: {
  /** cm per screen pixel. */
  px: number;
  piece: PieceDTO;
  ci: string;
  spec: PieceFuseSpec;
  /** The piece outline, sheet coords (the pad). */
  outline: Pt[];
  /** The inset contour, sheet coords (points snap onto it and stay inside it). */
  inner: Pt[];
  bus?: ZoneBus;
  onChange: (next: PieceFuseSpec) => void;
}) {
  const ox = piece.originX ?? 0;
  const oy = piece.originY ?? 0;
  /** Piece-local mm, Y up → sheet cm, Y down — and back. */
  const W = (q: Pt) => ({ x: ox + q.x / 10, y: -(oy + q.y / 10) });
  const L = (s: Pt) => ({ x: (s.x - ox) * 10, y: (-s.y - oy) * 10 });
  const zone = spec.zone;
  const drawn = isDrawnZone(zone);
  const mm = zonePoints(zone);
  const pts = mm.map(W);
  const ring = drawn ? flattenSpline(mm).map(W) : [];
  const drag = useRef<Drag | null>(null);
  const [, tick] = useState(0);
  const rerender = () => tick((x) => x + 1);
  const coarse =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 640);
  const R = (coarse ? 9 : 6) * px;
  const HIT = (coarse ? 22 : 12) * px;

  const latest = useRef({ spec, onChange, bus });
  latest.current = { spec, onChange, bus };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const { spec: s, onChange: set, bus: b } = latest.current;
      const prev = b?.pop(ci);
      if (!prev) return;
      e.preventDefault();
      set({ ...s, zone: prev.zone });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ci]);

  /** Keep a point on the piece: outside the inset contour → onto it; within 8 px → snap onto it. */
  const keep = (q: Pt) => {
    if (inner.length < 3) return q;
    const n = nearestOn(q, inner);
    return !inside(q, inner) || n.d < 8 * px ? n.p : q;
  };
  const snapped = (q: Pt) => inner.length >= 3 && nearestOn(q, inner).d < 0.02;
  const begin = () => bus?.push(ci, zone);
  const write = (next: ZonePoint[]) => onChange({ ...spec, zone: storedZone(next) });
  const writeSheet = (sheet: Pt[]) =>
    write(sheet.map((s, i) => ({ ...L(s), corner: mm[i]?.corner ?? false })));

  const down = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = d;
    rerender();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const q = svgPoint(e);
    if (d.t === 'pt') {
      if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 4) return;
      if (!d.moved) begin();
      d.moved = true;
      const next = mm.slice();
      next[d.i] = { ...L(keep(q)), corner: mm[d.i].corner };
      write(followMids(next, d.straight));
    } else if (d.t === 'rect') {
      d.b = keep(q);
      rerender();
    } else if (d.t === 'move') {
      if (!d.moved) begin();
      d.moved = true;
      const dx = q.x - d.from.x;
      const dy = q.y - d.from.y;
      writeSheet(
        clampZoneTransform(d.orig, inner, (p, amount) => ({
          x: p.x + dx * amount,
          y: p.y + dy * amount,
        })),
      );
    } else {
      const step = e.shiftKey ? 15 : 1;
      const deg =
        Math.round(((Math.atan2(q.y - d.c.y, q.x - d.c.x) - d.a0) * 180) / Math.PI / step) * step;
      if (!d.moved && deg === 0) return;
      if (!d.moved) begin();
      d.moved = true;
      d.deg = deg;
      const r = (deg * Math.PI) / 180;
      writeSheet(
        clampZoneTransform(d.orig, inner, (p, amount) => {
          const angle = r * amount;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return {
            x: d.c.x + (p.x - d.c.x) * cos - (p.y - d.c.y) * sin,
            y: d.c.y + (p.x - d.c.x) * sin + (p.y - d.c.y) * cos,
          };
        }),
      );
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.t === 'pt' && !d.moved && cornerSlot(d.i, mm)) {
      begin();
      write(mm.map((p, i) => (i === d.i ? { ...p, corner: !p.corner } : p)));
    } else if (d.t === 'rect' && Math.abs(d.b.x - d.a.x) > 0.8 && Math.abs(d.b.y - d.a.y) > 0.8) {
      begin();
      const a = L(d.a);
      const b = L(d.b);
      write(rectPoints(a.x, a.y, b.x, b.y));
    }
    rerender();
  };
  const onPad = (e: React.PointerEvent) => {
    const q = svgPoint(e);
    if (drawn && ring.length >= 3 && inside(q, ring))
      return down(e, { t: 'move', from: q, orig: pts, moved: false });
    const a = keep(q);
    return down(e, { t: 'rect', a, b: a });
  };

  const d = drag.current;
  const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
  const cy = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
  const top = pts.length ? Math.min(...pts.map((p) => p.y)) : 0;
  const rot = { x: cx, y: top - ROT_GAP_PX * px };

  return (
    <g onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-zone-editor=''>
      <polygon
        points={str(outline)}
        data-fuse-pad=''
        fill='transparent'
        style={{ cursor: drawn ? 'move' : 'crosshair', touchAction: 'none' }}
        onPointerDown={onPad}
      />
      {d?.t === 'rect' && (
        <rect
          x={Math.min(d.a.x, d.b.x)}
          y={Math.min(d.a.y, d.b.y)}
          width={Math.abs(d.b.x - d.a.x)}
          height={Math.abs(d.b.y - d.a.y)}
          fill={INK}
          fillOpacity={0.2}
          stroke={INK}
          strokeDasharray='4 3'
          vectorEffect='non-scaling-stroke'
          pointerEvents='none'
        />
      )}
      {drawn && pts.length >= 3 && (
        <g>
          <line
            x1={rot.x}
            y1={rot.y}
            x2={cx}
            y2={top}
            stroke={INK}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
          <circle
            cx={rot.x}
            cy={rot.y}
            r={R}
            fill={PAPER}
            stroke={INK}
            strokeWidth={1.5}
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
          <path
            d={`M ${rot.x - R * 0.5} ${rot.y} A ${R * 0.5} ${R * 0.5} 0 1 1 ${rot.x} ${rot.y + R * 0.5}`}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
          <circle
            data-zone-rot=''
            cx={rot.x}
            cy={rot.y}
            r={HIT}
            fill='transparent'
            style={{ cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => {
              const q = svgPoint(e);
              down(e, {
                t: 'rot',
                c: { x: cx, y: cy },
                a0: Math.atan2(q.y - cy, q.x - cx),
                orig: pts,
                deg: 0,
                moved: false,
              });
            }}
          />
          {d?.t === 'rot' && (
            <text
              x={rot.x + 2 * R}
              y={rot.y}
              fontSize={11 * px}
              dominantBaseline='middle'
              fill={INK}
              paintOrder='stroke'
              stroke={PAPER}
              strokeWidth={3 * px}
              pointerEvents='none'
            >
              {d.deg}°
            </text>
          )}
        </g>
      )}
      {pts.map((p, i) => {
        const corner = cornerSlot(i, mm);
        const sharp = mm[i].corner;
        const on = (d?.t === 'pt' && d.i === i && d.moved) || snapped(p);
        const r = corner ? R : R * 0.8;
        return (
          <g key={`zh-${i}`}>
            {sharp ? (
              <rect
                x={p.x - r}
                y={p.y - r}
                width={2 * r}
                height={2 * r}
                fill={on ? INK : PAPER}
                stroke={INK}
                strokeWidth={1.5}
                vectorEffect='non-scaling-stroke'
                pointerEvents='none'
              />
            ) : (
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={on ? INK : PAPER}
                stroke={INK}
                strokeWidth={1.5}
                vectorEffect='non-scaling-stroke'
                pointerEvents='none'
              />
            )}
            <circle
              data-zone-pt={i}
              cx={p.x}
              cy={p.y}
              r={HIT}
              fill='transparent'
              style={{ cursor: 'grab', touchAction: 'none' }}
              onPointerDown={(e) =>
                down(e, {
                  t: 'pt',
                  i,
                  moved: false,
                  cx: e.clientX,
                  cy: e.clientY,
                  straight: mm.map((_, k) => k !== i && straightMid(mm, k)),
                })
              }
            />
          </g>
        );
      })}
    </g>
  );
}
