// The fuse markup drawn over the PIECES sheet (canvas «Zoom»): the fusible fill (whole / strip
// bands / zone), the inset contour dashed, dart holes, and on the piece being edited the handles —
// click an edge to add it to the strip, drag a strip end to trim it (live mm, snap 5), drag a rect
// or click a DXF block for the zone, click a dart to toggle cut / fuse over. Other fused pieces
// show faint. Coordinates: the sheet's own SVG space — cm, Y down.
import { useMemo, useRef, useState } from 'react';
import {
  edgeRunsOf,
  extendPolyline,
  pointOnEdgeRun,
  projectPointToEdgeRun,
  stripBandPolygons,
  trimEdgeRun,
} from 'lib/fusing-dxf/edge-runs';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { resolveFuse, fuseIncomplete, type PieceFuseSpec } from './fuse-spec';

const INK = 'var(--color-warning)';
const PAPER = 'var(--color-bgColor)';
const DART_INK = 'var(--color-labelColor)';
const SNAP_MM = 5;

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const signedArea = (pts: Pt[]) =>
  pts.reduce((s, a, i) => {
    const b = pts[(i + 1) % pts.length];
    return s + a.x * b.y - b.x * a.y;
  }, 0) / 2;
/** Inward unit normal of edge a→b of a polygon with the given orientation. */
const inward = (a: Pt, b: Pt, sign: number) => {
  const d = sub(b, a);
  const l = len(d) || 1;
  return { x: (-d.y / l) * sign, y: (d.x / l) * sign };
};
/** Offset a polygon inward by d (negative = outward), mitred, miter clamped. */
function offsetPoly(pts: Pt[], d: number): Pt[] {
  const sign = signedArea(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const n1 = inward(a, p, sign);
    const n2 = inward(p, b, sign);
    const k = Math.max(1 + dot(n1, n2), 0.3);
    return add(p, { x: n1.x + n2.x, y: n1.y + n2.y }, d / k);
  });
}
const str = (pts: Pt[]) => pts.map((q) => `${q.x},${q.y}`).join(' ');

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const d = sub(b, a);
  const l2 = dot(d, d) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / l2));
  return len(sub(p, add(a, d, t)));
}
const nearOutline = (p: Pt, poly: Pt[], tol: number) =>
  poly.some((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length]) <= tol);

/**
 * Darts as the DXF draws them: an inner V (three points, both legs ending on the outline) or a
 * small closed wedge. Piece-local cm, the same system as `poly`.
 */
export function dartsOf(p: PieceDTO): Pt[][] {
  const out: Pt[][] = [];
  for (const g of p.inner ?? []) {
    const pts = g.pts;
    if (!g.closed && pts.length === 3) {
      if (nearOutline(pts[0], p.poly, 0.3) && nearOutline(pts[2], p.poly, 0.3)) out.push(pts);
    } else if (g.closed && pts.length >= 3 && pts.length <= 4 && /dart/i.test(g.layer)) {
      out.push(pts);
    }
  }
  return out;
}

function svgPoint(e: React.PointerEvent) {
  const el = e.currentTarget as SVGGraphicsElement;
  const svg = el.ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: r.x, y: r.y };
}

type Rect = { x: number; y: number; w: number; h: number };

export function FuseOverlay({
  px,
  pieces,
  ciOf,
  sel,
  fuseOf,
  onChange,
}: {
  /** cm per screen pixel. */
  px: number;
  pieces: readonly PieceDTO[];
  ciOf: (p: PieceDTO) => string;
  /** The piece being edited (zoomed in), or null. */
  sel: string | null;
  /** The fuse spec of a fused piece; undefined = not fused. */
  fuseOf: (ci: string) => PieceFuseSpec | undefined;
  onChange: (ci: string, next: PieceFuseSpec) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [live, setLive] = useState<Rect | null>(null);
  const [handle, setHandle] = useState<{ edge: number; end: 's' | 'e' } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const byCi = useMemo(() => {
    const m = new Map<string, PieceDTO>();
    for (const p of pieces) if (p.originX != null && p.originY != null) m.set(ciOf(p), p);
    return m;
  }, [pieces, ciOf]);
  const sp = sel ? byCi.get(sel) : undefined;
  const sf = sel ? fuseOf(sel) : undefined;

  const world = (p: PieceDTO, q: Pt) => ({
    x: (p.originX ?? 0) + q.x,
    y: -((p.originY ?? 0) + q.y),
  });
  const geo = (p: PieceDTO, f: PieceFuseSpec) => {
    const r = resolveFuse(f);
    const pts = p.poly.map((q) => world(p, q));
    const sign: 1 | -1 = signedArea(pts) > 0 ? 1 : -1;
    const inner = r.insetMm > 0 ? offsetPoly(pts, r.insetMm / 10) : pts;
    const darts = dartsOf(p).map((d) => d.map((q) => world(p, q)));
    const runs = edgeRunsOf(pts);
    return { r, pts, runs, sign, inner, darts };
  };

  const draw = (p: PieceDTO, f: PieceFuseSpec, faint: boolean, liveRect: Rect | null) => {
    const { r, pts, runs, sign, inner, darts } = geo(p, f);
    const ox = p.originX ?? 0;
    const oy = p.originY ?? 0;
    const clip = `fuse-clip-${p.id}`;
    const mask = `fuse-mask-${p.id}`;
    const D = (r.insetMm + r.widthMm) / 10;
    const holes = r.darts === 'cut' ? darts.map((d) => offsetPoly(d, -r.insetMm / 10)) : [];
    // Zone rect: stored piece-local mm, Y up → sheet cm, Y down.
    let rect = liveRect;
    if (!rect && f.mode === 'zone' && f.zone && 'rect' in f.zone) {
      const [x0, y0, x1, y1] = f.zone.rect;
      rect = { x: ox + x0 / 10, y: -(oy + y1 / 10), w: (x1 - x0) / 10, h: (y1 - y0) / 10 };
    }
    let dxf: string | null = null;
    if (f.mode === 'zone' && f.zone && 'dxfPieceKey' in f.zone) {
      const src = byCi.get(f.zone.dxfPieceKey);
      if (src) {
        const sx = ox + p.bboxW / 2 - src.bboxW / 2;
        const sy = oy + p.bboxH / 2 - src.bboxH / 2;
        dxf = src.poly.map((q) => `${sx + q.x},${-(sy + q.y)}`).join(' ');
      }
    }
    const op = faint ? 0.16 : 0.32;
    return (
      <g key={`fuse-${p.id}`} pointerEvents='none' data-fuse-on={ciOf(p)}>
        <clipPath id={clip}>
          <polygon points={str(inner)} />
        </clipPath>
        <mask id={mask} maskUnits='userSpaceOnUse' x={-1e4} y={-1e4} width={2e4} height={2e4}>
          <rect x={-1e4} y={-1e4} width={2e4} height={2e4} fill='white' />
          {holes.map((h, i) => (
            <polygon key={i} points={str(h)} fill='black' />
          ))}
        </mask>
        <g clipPath={`url(#${clip})`} mask={`url(#${mask})`} fill={INK} fillOpacity={op}>
          {f.mode === 'whole' && <polygon points={str(inner)} />}
          {f.mode === 'strip' &&
            f.edges.flatMap((edge) => {
              const run = runs[edge.edge];
              if (!run) return [];
              const previous =
                runs.length > 1
                  ? f.edges.find(
                      (candidate) => candidate.edge === (edge.edge - 1 + runs.length) % runs.length,
                    )
                  : undefined;
              const next =
                runs.length > 1
                  ? f.edges.find((candidate) => candidate.edge === (edge.edge + 1) % runs.length)
                  : undefined;
              const points = extendPolyline(
                trimEdgeRun(run, edge.startMm / 10, edge.endMm / 10),
                edge.startMm <= 0 && previous && previous.endMm <= 0 ? D : 0,
                edge.endMm <= 0 && next && next.startMm <= 0 ? D : 0,
              );
              return stripBandPolygons(points, r.insetMm / 10, D, sign).map((band, index) => (
                <polygon key={`${edge.edge}-${index}`} points={str(band)} data-strip={edge.edge} />
              ));
            })}
          {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />}
          {dxf && <polygon points={dxf} />}
        </g>
        {!faint && f.mode && (
          <polygon
            points={str(inner)}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            strokeDasharray='4 3'
            vectorEffect='non-scaling-stroke'
          />
        )}
        {!faint &&
          darts.map((d, i) => (
            <g key={`dart-${i}`}>
              <polygon
                points={str(d)}
                fill='none'
                stroke={DART_INK}
                strokeWidth={1}
                vectorEffect='non-scaling-stroke'
              />
              {r.darts === 'cut' && (
                <polygon
                  points={str(offsetPoly(d, -r.insetMm / 10))}
                  data-dart-hole={i}
                  fill='none'
                  stroke={INK}
                  strokeWidth={1}
                  strokeDasharray='4 3'
                  vectorEffect='non-scaling-stroke'
                />
              )}
            </g>
          ))}
        {!faint && rect && (
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            strokeDasharray='4 3'
            vectorEffect='non-scaling-stroke'
            clipPath={`url(#${clip})`}
          />
        )}
        {!faint && dxf && (
          <polygon
            points={dxf}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            strokeDasharray='4 3'
            vectorEffect='non-scaling-stroke'
          />
        )}
      </g>
    );
  };

  const g = sp && sf ? geo(sp, sf) : null;
  const pts = g?.pts ?? [];
  const padOn = !!g && sf!.mode === 'zone';
  const edgesOn = !!g && sf!.mode === 'strip';
  const hs = 8 * px;

  return (
    <g>
      {[...byCi.entries()].map(([ci, p]) => {
        const f = fuseOf(ci);
        if (!f || !f.mode) return null;
        const isSel = ci === sel;
        if (!isSel && fuseIncomplete(f)) return null;
        return draw(p, f, !isSel, isSel ? live : null);
      })}
      {sp &&
        sf &&
        g &&
        g.darts.map((d, i) => (
          <polygon
            key={`dart-hit-${i}`}
            points={str(d)}
            data-dart={i}
            fill='transparent'
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              sel && onChange(sel, { ...sf, darts: g.r.darts === 'cut' ? 'fuse' : 'cut' })
            }
          />
        ))}
      {sp && sf && padOn && (
        <polygon
          points={str(pts)}
          data-fuse-pad=''
          fill='transparent'
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag.current = { ...svgPoint(e), cx: e.clientX, cy: e.clientY };
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 5) return;
            const q = svgPoint(e);
            setLive({
              x: Math.min(d.x, q.x),
              y: Math.min(d.y, q.y),
              w: Math.abs(q.x - d.x),
              h: Math.abs(q.y - d.y),
            });
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (!d || !sel) return;
            if (live && live.w > 0.8 && live.h > 0.8) {
              const ox = sp.originX ?? 0;
              const oy = sp.originY ?? 0;
              // Sheet cm, Y down → piece-local mm, Y up.
              const x0 = (live.x - ox) * 10;
              const x1 = (live.x + live.w - ox) * 10;
              const y0 = (-(live.y + live.h) - oy) * 10;
              const y1 = (-live.y - oy) * 10;
              const r1 = (v: number) => Math.round(v * 10) / 10;
              onChange(sel, { ...sf, zone: { rect: [r1(x0), r1(y0), r1(x1), r1(y1)] } });
            }
            setLive(null);
          }}
        />
      )}
      {sp &&
        sf &&
        edgesOn &&
        g!.runs.map((run) => {
          const i = run.index;
          const on = sf.edges.some((edge) => edge.edge === i);
          return (
            <g key={`edge-${i}`}>
              {(on || hover === i) && (
                <polyline
                  pointerEvents='none'
                  points={str(run.points)}
                  fill='none'
                  stroke={INK}
                  strokeWidth={on ? 3 : 2}
                  strokeDasharray={on ? undefined : '4 3'}
                  vectorEffect='non-scaling-stroke'
                  strokeLinecap='round'
                />
              )}
              <polyline
                data-edge={i}
                points={str(run.points)}
                fill='none'
                stroke='transparent'
                strokeWidth={12}
                vectorEffect='non-scaling-stroke'
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (!sel) return;
                  const cur = sf.edges;
                  onChange(sel, {
                    ...sf,
                    edges: on
                      ? cur.filter((x) => x.edge !== i)
                      : [...cur, { edge: i, startMm: 0, endMm: 0 }].sort((x, y) => x.edge - y.edge),
                  });
                }}
              />
            </g>
          );
        })}
      {sp &&
        sf &&
        g &&
        edgesOn &&
        sf.edges.map((o) => {
          const i = o.edge;
          const run = g.runs[i];
          if (!run) return null;
          return (['s', 'e'] as const).map((end) => {
            const position = pointOnEdgeRun(
              run,
              end === 's' ? o.startMm / 10 : run.length - o.endMm / 10,
            );
            const at = position.point;
            const n = {
              x: -position.tangent.y * g.sign,
              y: position.tangent.x * g.sign,
            };
            const active = handle?.edge === i && handle.end === end;
            const mm = end === 's' ? o.startMm : o.endMm;
            const lab = add(at, n, -38 * px);
            return (
              <g key={`h-${i}${end}`}>
                <rect
                  data-handle={`${i}${end}`}
                  x={at.x - hs / 2}
                  y={at.y - hs / 2}
                  width={hs}
                  height={hs}
                  fill={PAPER}
                  stroke={INK}
                  strokeWidth={1.5}
                  vectorEffect='non-scaling-stroke'
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    setHandle({ edge: i, end });
                  }}
                  onPointerMove={(e) => {
                    if (!active || !sel) return;
                    const q = svgPoint(e);
                    const projected = projectPointToEdgeRun(run, q);
                    const raw =
                      end === 's'
                        ? projected.distance * 10
                        : (run.length - projected.distance) * 10;
                    const other = end === 's' ? o.endMm : o.startMm;
                    const v = Math.max(
                      0,
                      Math.min(
                        Math.round(raw / SNAP_MM) * SNAP_MM,
                        Math.floor(run.length * 10 - other - 10),
                      ),
                    );
                    onChange(sel, {
                      ...sf,
                      edges: sf.edges.map((x) =>
                        x.edge === i ? { ...x, [end === 's' ? 'startMm' : 'endMm']: v } : x,
                      ),
                    });
                  }}
                  onPointerUp={() => setHandle(null)}
                />
                {active && (
                  <text
                    data-live-mm={mm}
                    x={lab.x}
                    y={lab.y}
                    fontSize={11 * px}
                    textAnchor='middle'
                    dominantBaseline='middle'
                    fill={INK}
                    pointerEvents='none'
                    paintOrder='stroke'
                    stroke={PAPER}
                    strokeWidth={3 * px}
                  >
                    {mm} mm
                  </text>
                )}
              </g>
            );
          });
        })}
    </g>
  );
}
