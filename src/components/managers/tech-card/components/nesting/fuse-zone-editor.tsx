// Pen editor for the drawn fusing zone. Drag a point to carve the full-fill seed inward; near the
// inset contour it snaps back and adjacent snapped sides follow the contour. A tap toggles sharp /
// round, a double tap on a side inserts a point, and a double tap on a point (or Backspace / Delete
// on the last touched one) removes it, min 3. Empty piece/zone drags are deliberately inert so the
// sheet does not pan or create a rectangle. ⌘Z undoes. Finger-size handles on touch.
// Coordinates: the sheet's SVG space (cm, Y down); the zone itself is piece-local mm, Y up.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ZONE_ON_CONTOUR_MM } from 'lib/fusing-dxf/spline';
import { zoneRingsMm } from 'lib/fusing-dxf/geometry';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import type { FuseZone } from 'lib/fusing-dxf/types';
import type { PieceFuseSpec } from './fuse-spec';
import {
  insertZonePoint,
  isDrawnZone,
  removeZonePoint,
  withZoneRingPoints,
  zoneRingOutline,
  zoneRingPoints,
  zoneRingRefs,
  type ZoneBus,
  type ZonePoint,
  type ZoneRingRef,
} from './fuse-zone';

const INK = 'var(--color-warning)';
const PAPER = 'var(--color-bgColor)';
/** Two taps on the same handle / side within this many ms are a double tap. */
const DOUBLE_TAP_MS = 350;

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
  let best = { p: ring[0] ?? q, d: Infinity, edge: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const ab = sub(ring[(i + 1) % ring.length], a);
    const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
    const p = add(a, ab, t);
    const d = len(sub(q, p));
    if (d < best.d) best = { p, d, edge: i };
  }
  return best;
}

type Drag =
  | { t: 'pt'; i: number; moved: boolean; cx: number; cy: number }
  | { t: 'side'; side?: number };

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
  useSyncExternalStore(bus?.subscribe ?? (() => () => {}), bus?.version ?? (() => 0));
  const refs = zoneRingRefs(zone);
  const requested = bus?.selected(ci) ?? 'main';
  const selected: ZoneRingRef = refs.includes(requested) ? requested : 'main';
  const outerSelected = selected === 'main' || selected.startsWith('island:');
  const mm = zoneRingPoints(zone, selected);
  const pts = mm.map(W);
  const contourMm = inner.map(L);
  const outlineMm = drawn ? zoneRingOutline(zone, selected, contourMm) : null;
  const ring = outlineMm ? outlineMm.ring.map(W) : [];
  const drag = useRef<Drag | null>(null);
  /** The last touched point (Backspace / Delete removes it). */
  const [picked, setPicked] = useState<number | null>(null);
  /** The last tap without a drag, for double-tap detection. */
  const lastTap = useRef<{ key: string; at: number; before: FuseZone | null } | null>(null);
  const [, tick] = useState(0);
  const rerender = () => tick((x) => x + 1);
  const coarse =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 640);
  const R = (coarse ? 9 : 6) * px;
  const HIT = (coarse ? 22 : 12) * px;

  useEffect(() => setPicked(null), [ci, selected]);
  useEffect(() => {
    if (requested !== selected) bus?.select(ci, selected);
  }, [bus, ci, requested, selected]);
  const latest = useRef({ spec, onChange, bus, picked, selected, contourMm });
  latest.current = { spec, onChange, bus, picked, selected, contourMm };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const {
        spec: s,
        onChange: set,
        bus: b,
        picked: i,
        selected: ringRef,
        contourMm: contour,
      } = latest.current;
      if ((e.key === 'Backspace' || e.key === 'Delete') && i != null && !e.metaKey && !e.ctrlKey) {
        if (!isDrawnZone(s.zone)) return;
        const next = removeZonePoint(zoneRingPoints(s.zone, ringRef), i);
        e.preventDefault();
        if (!next) return;
        const nextZone = withZoneRingPoints(s.zone, ringRef, next);
        if (!nextZone) return;
        try {
          zoneRingsMm(nextZone, contour);
        } catch {
          return;
        }
        b?.push(ci, s.zone, ringRef);
        set({ ...s, zone: nextZone });
        setPicked(null);
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const prev = b?.pop(ci);
      if (!prev) return;
      e.preventDefault();
      b?.select(ci, prev.selected);
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
  const snapped = (q: Pt) =>
    outerSelected && inner.length >= 3 && nearestOn(q, inner).d <= ZONE_ON_CONTOUR_MM / 10;
  const begin = () => bus?.push(ci, zone, selected);
  const write = (next: ZonePoint[]) => {
    const nextZone = withZoneRingPoints(zone, selected, next);
    if (!nextZone) return false;
    try {
      zoneRingsMm(nextZone, contourMm);
    } catch {
      return false;
    }
    onChange({ ...spec, zone: nextZone });
    return true;
  };

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
      write(next);
    }
  };
  /** A tap without a drag; true when it completes a double tap on the same key. */
  const tapped = (key: string) => {
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && prev.key === key && now - prev.at <= DOUBLE_TAP_MS) {
      lastTap.current = null;
      return prev;
    }
    lastTap.current = { key, at: now, before: zone };
    return null;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.t === 'pt' && !d.moved) {
      const double = tapped(`pt-${d.i}`);
      if (double) {
        // The first tap may have toggled sharp / round; remove the point from the zone before it.
        const next = removeZonePoint(zoneRingPoints(double.before, selected), d.i);
        if (next) {
          if (double.before === zone) begin();
          write(next);
          setPicked(null);
        }
      } else {
        begin();
        write(mm.map((p, i) => (i === d.i ? { ...p, corner: !p.corner } : p)));
      }
    } else if (d.t === 'side' && d.side != null) {
      const at = svgAt.current;
      if (tapped(`side-${d.side}`) && at) {
        const side = sideAt(at);
        const next = side && insertZonePoint(mm, side.side, L(keep(side.p)));
        if (next) {
          begin();
          write(next);
          setPicked(side.side + 1);
        }
      }
    } else if (d.t === 'pt' && d.moved) {
      lastTap.current = null;
    }
    rerender();
  };
  /** The zone side under a sheet point: its control segment and the nearest outline point. */
  const sideAt = (q: Pt) => {
    if (!outlineMm || ring.length < 3) return null;
    const n = nearestOn(q, ring);
    return { side: outlineMm.side[n.edge] ?? 0, p: n.p, d: n.d };
  };
  const svgAt = useRef<Pt | null>(null);
  const onPad = (e: React.PointerEvent) => e.stopPropagation();

  const d = drag.current;

  return (
    <g onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-zone-editor=''>
      <polygon
        points={str(outline)}
        data-fuse-pad=''
        fill='transparent'
        style={{ cursor: 'default', touchAction: 'none' }}
        onPointerDown={onPad}
      />
      {refs
        .filter((ref) => ref !== selected)
        .map((ref) => {
          const passive = zoneRingOutline(zone, ref, contourMm).ring.map(W);
          return passive.length >= 3 ? (
            <polygon
              key={ref}
              points={str(passive)}
              data-zone-ring={ref}
              fill='transparent'
              stroke='transparent'
              strokeWidth={HIT}
              vectorEffect='non-scaling-stroke'
              style={{ cursor: 'pointer', touchAction: 'none' }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => bus?.select(ci, ref)}
            />
          ) : null;
        })}
      {drawn && ring.length >= 3 && (
        <polygon
          points={str(ring)}
          data-zone-side=''
          fill='none'
          stroke='transparent'
          strokeWidth={2 * HIT}
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={(e) => {
            bus?.select(ci, selected);
            const q = svgPoint(e);
            svgAt.current = q;
            const side = sideAt(q);
            down(e, {
              t: 'side',
              side: side?.side,
            });
          }}
        />
      )}
      {pts.map((p, i) => {
        const sharp = mm[i].corner;
        const on = (d?.t === 'pt' && d.i === i && d.moved) || snapped(p);
        const r = sharp ? R : R * 0.8;
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
                strokeWidth={picked === i ? 2.5 : 1.5}
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
                strokeWidth={picked === i ? 2.5 : 1.5}
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
              onPointerDown={(e) => {
                setPicked(i);
                down(e, {
                  t: 'pt',
                  i,
                  moved: false,
                  cx: e.clientX,
                  cy: e.clientY,
                });
              }}
            />
          </g>
        );
      })}
    </g>
  );
}
