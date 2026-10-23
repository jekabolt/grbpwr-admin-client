// The fuse markup drawn over the PIECES sheet (canvas «Zoom»): the fusible fill (whole / strip
// bands / zone), the inset contour dashed, dart holes, and on the piece being edited the handles —
// click an edge to add it to the strip, drag a strip end to trim it (live mm, snap 5), shape the
// zone with the pen editor (fuse-zone-editor) or click a DXF block for it, click a dart to toggle
// cut / fuse over. Other fused pieces show faint. A drawn zone's fill is the fusible DXF's own
// geometry (lib/fusing-dxf generateFuseGeometry), so what is drawn is what is cut; its clipped
// area goes to the panel through the zone bus. Coordinates: the sheet's own SVG space — cm, Y down.
import { useEffect, useMemo, useRef, useState } from 'react';
import { edgeRunsOf, pointOnEdgeRun, projectPointToEdgeRun } from 'lib/fusing-dxf/edge-runs';
import { fusingDartPolygons } from 'lib/fusing-dxf/darts';
import { fuseAreaMm2, fuseInsetRingMm, generateFuseGeometry } from 'lib/fusing-dxf/geometry';
import type { FusePolygon } from 'lib/fusing-dxf/types';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { resolveFuse, fuseIncomplete, type PieceFuseSpec } from './fuse-spec';
import {
  isDrawnZone,
  zoneRingOutline,
  zoneRingRefs,
  type ZoneBus,
  type ZoneRingRef,
} from './fuse-zone';
import { FuseZoneEditor } from './fuse-zone-editor';

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

function svgPoint(e: React.PointerEvent) {
  const el = e.currentTarget as SVGGraphicsElement;
  const svg = el.ownerSVGElement!;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: r.x, y: r.y };
}

/** The generator's fusible geometry, piece-local mm. */
type FuseFill = { polys: FusePolygon[]; status: 'ok' | 'invalid' | 'unknown' };
const mm10 = (q: Pt) => ({ x: q.x * 10, y: q.y * 10 });
const cm10 = (q: Pt) => ({ x: q.x / 10, y: q.y / 10 });
function fuseFillOf(
  p: PieceDTO,
  f: PieceFuseSpec,
  requiredSeamAllowanceMm: number | null,
): FuseFill | null {
  if (!f.mode || (f.mode === 'zone' && !isDrawnZone(f.zone))) return null;
  if (f.insetNet && !Number.isFinite(requiredSeamAllowanceMm))
    return { polys: [], status: 'unknown' };
  try {
    // An empty width keeps the old 10 mm preview only until the operator chooses a real width.
    // Once chosen, this is exactly the same spec and geometry function used by the DXF builder.
    const resolved = resolveFuse(f, requiredSeamAllowanceMm);
    const previewSpec =
      f.mode === 'strip' && f.widthMm == null ? { ...f, widthMm: resolved.widthMm } : f;
    const polys = generateFuseGeometry({
      outline: p.poly.map(mm10),
      spec: previewSpec,
      seamAllowanceMm: requiredSeamAllowanceMm,
      darts: fusingDartPolygons(p),
    });
    return { polys, status: polys.length > 0 ? 'ok' : 'invalid' };
  } catch {
    return { polys: [], status: 'invalid' };
  }
}

export function FuseOverlay({
  px,
  pieces,
  ciOf,
  sel,
  fuseOf,
  onChange,
  zoneBus,
  requiredSeamAllowanceMm,
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
  /** Shared with the panel: the zone's clipped area and its undo stack. */
  zoneBus?: ZoneBus;
  /** The card's live seam-allowance standard; null means no standard is available. */
  requiredSeamAllowanceMm: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [handle, setHandle] = useState<{ edge: number; end: 's' | 'e' } | null>(null);
  // Fill cache: generator geometry per piece object, keyed by everything the geometry reads.
  const fills = useRef(new WeakMap<PieceDTO, Map<string, FuseFill | null>>());
  const fillOf = (p: PieceDTO, f: PieceFuseSpec) => {
    if (!f.mode || (f.mode === 'zone' && !isDrawnZone(f.zone))) return null;
    const key = JSON.stringify([f, requiredSeamAllowanceMm]);
    let m = fills.current.get(p);
    if (!m) fills.current.set(p, (m = new Map()));
    if (!m.has(key)) {
      if (m.size > 64) m.clear();
      m.set(key, fuseFillOf(p, f, requiredSeamAllowanceMm));
    }
    return m.get(key) ?? null;
  };
  // A drawn zone's inset contour is the generator's own (piece-local mm), so the handles snap onto
  // exactly the contour its sides follow and the DXF is clipped to.
  const insets = useRef(new WeakMap<PieceDTO, Map<string, Pt[] | null>>());
  const zoneInsetOf = (p: PieceDTO, f: PieceFuseSpec) => {
    if (f.mode !== 'zone') return null;
    const key = JSON.stringify([f.insetNet, f.insetMm, requiredSeamAllowanceMm]);
    let m = insets.current.get(p);
    if (!m) insets.current.set(p, (m = new Map()));
    if (!m.has(key)) {
      if (m.size > 16) m.clear();
      let ring: Pt[] | null = null;
      try {
        ring = fuseInsetRingMm(p.poly.map(mm10), f, requiredSeamAllowanceMm);
      } catch {
        ring = null;
      }
      m.set(key, ring);
    }
    return m.get(key) ?? null;
  };
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
    const r = resolveFuse(f, requiredSeamAllowanceMm);
    const pts = p.poly.map((q) => world(p, q));
    const sign: 1 | -1 = signedArea(pts) > 0 ? 1 : -1;
    const insetMm = r.insetMm;
    const insetKnown = insetMm != null;
    const zoneInset = insetMm != null && insetMm > 0 ? zoneInsetOf(p, f) : null;
    const inner = zoneInset
      ? zoneInset.map((q) => world(p, cm10(q)))
      : insetMm != null && insetMm > 0
        ? offsetPoly(pts, insetMm / 10)
        : pts;
    const darts = fusingDartPolygons(p).map((d) => d.map(cm10).map((q) => world(p, q)));
    const runs = edgeRunsOf(pts);
    return { r, pts, runs, sign, inner, darts, insetKnown };
  };

  const draw = (p: PieceDTO, f: PieceFuseSpec, faint: boolean) => {
    const { r, pts, runs, sign, inner, darts, insetKnown } = geo(p, f);
    const ox = p.originX ?? 0;
    const oy = p.originY ?? 0;
    const clip = `fuse-clip-${p.id}`;
    const mask = `fuse-mask-${p.id}`;
    const insetMm = r.insetMm ?? 0;
    const holes =
      insetKnown && r.darts === 'cut' ? darts.map((d) => offsetPoly(d, -insetMm / 10)) : [];
    // Drawn zone (rect / spline): stored piece-local mm, Y up → sheet cm, Y down.
    const toSheet = (q: Pt) => ({ x: ox + q.x / 10, y: -(oy + q.y / 10) });
    const zoneRings =
      f.mode === 'zone' && isDrawnZone(f.zone)
        ? zoneRingRefs(f.zone).map((ref) => ({
            ref,
            points: zoneRingOutline(
              f.zone,
              ref,
              inner.map((s) => ({ x: (s.x - ox) * 10, y: (-s.y - oy) * 10 })),
            ).ring.map(toSheet),
          }))
        : [];
    const fill = fillOf(p, f);
    const fillPath =
      fill?.status === 'ok'
        ? fill.polys
            .flatMap((poly) => [poly.outer, ...poly.holes])
            .map(
              (loop) =>
                `M ${loop
                  .map((q) => {
                    const s = toSheet(q);
                    return `${s.x} ${s.y}`;
                  })
                  .join(' L ')} Z`,
            )
            .join(' ')
        : null;
    let dxf: string | null = null;
    if (f.mode === 'zone' && f.zone && 'dxfPieceKey' in f.zone) {
      const src = byCi.get(f.zone.dxfPieceKey);
      if (src) {
        const sx = ox + p.bboxW / 2 - src.bboxW / 2;
        const sy = oy + p.bboxH / 2 - src.bboxH / 2;
        dxf = src.poly.map((q) => `${sx + q.x},${-(sy + q.y)}`).join(' ');
      }
    }
    const minX = Math.min(...pts.map((point) => point.x));
    const maxX = Math.max(...pts.map((point) => point.x));
    const minY = Math.min(...pts.map((point) => point.y));
    const maxY = Math.max(...pts.map((point) => point.y));
    const tagSize = 14 * px;
    const tagX = Math.max(minX, maxX - tagSize - 4 * px);
    const tagY = Math.min(maxY - tagSize, minY + 4 * px);
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
        <g clipPath={`url(#${clip})`} mask={`url(#${mask})`} fill={INK} fillOpacity={0.28}>
          {dxf && <polygon points={dxf} />}
        </g>
        {dxf && (
          <polygon
            points={dxf}
            clipPath={`url(#${clip})`}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
            strokeLinejoin='round'
          />
        )}
        {fillPath && (
          <path
            d={fillPath}
            fill={INK}
            fillOpacity={0.28}
            fillRule='evenodd'
            stroke={INK}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
            strokeLinejoin='round'
            data-zone-fill=''
          />
        )}
        {!faint && f.mode && insetKnown && (
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
              {insetKnown && r.darts === 'cut' && (
                <polygon
                  points={str(offsetPoly(d, -insetMm / 10))}
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
        {!faint &&
          zoneRings.map(({ ref, points }) => (
            <g key={ref} data-zone-ring-line={ref}>
              <polygon
                points={str(points)}
                fill='none'
                stroke={INK}
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray='3 3'
                vectorEffect='non-scaling-stroke'
              />
              <polygon
                points={str(points)}
                data-zone-line=''
                fill='none'
                stroke={fill?.status === 'invalid' ? 'var(--color-error)' : INK}
                strokeWidth={1}
                vectorEffect='non-scaling-stroke'
                clipPath={`url(#${clip})`}
              />
            </g>
          ))}
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
        <g aria-label='fused piece'>
          <rect x={tagX} y={tagY} width={tagSize} height={tagSize} fill={INK} />
          <text
            x={tagX + tagSize / 2}
            y={tagY + tagSize * 0.72}
            fill={PAPER}
            fontSize={9 * px}
            fontWeight={700}
            textAnchor='middle'
          >
            F
          </text>
        </g>
      </g>
    );
  };

  const g = sp && sf ? geo(sp, sf) : null;
  const pts = g?.pts ?? [];
  const padOn = !!g && sf!.mode === 'zone';
  // The selected zone's clipped area → the panel (cm²; null = invalid; undefined = not a drawn zone).
  const selFill = sp && sf?.mode === 'zone' ? fillOf(sp, sf) : null;
  const selArea = selFill
    ? selFill.status === 'ok'
      ? fuseAreaMm2(selFill.polys) / 100 || null
      : selFill.status === 'invalid'
        ? null
        : undefined
    : undefined;
  const selRingAreas: Partial<Record<ZoneRingRef, number | null>> = {};
  let selContour: Pt[] | undefined;
  if (sp && sf && g && isDrawnZone(sf.zone)) {
    const ox = sp.originX ?? 0;
    const oy = sp.originY ?? 0;
    const contour = g.inner.map((point) => ({
      x: (point.x - ox) * 10,
      y: (-point.y - oy) * 10,
    }));
    selContour = contour;
    for (const ref of zoneRingRefs(sf.zone)) {
      try {
        const ring = zoneRingOutline(sf.zone, ref, contour).ring;
        selRingAreas[ref] = Math.abs(signedArea(ring)) / 100 || null;
      } catch {
        selRingAreas[ref] = null;
      }
    }
  }
  const selRingAreasKey = JSON.stringify(selRingAreas);
  const selContourKey = JSON.stringify(selContour ?? []);
  useEffect(() => {
    if (!sel || !zoneBus) return;
    zoneBus.setArea(sel, selArea);
    zoneBus.setRingAreas(
      sel,
      JSON.parse(selRingAreasKey) as Partial<Record<ZoneRingRef, number | null>>,
    );
    zoneBus.setContour(sel, JSON.parse(selContourKey) as Pt[]);
    return () => {
      zoneBus.setArea(sel, undefined);
      zoneBus.setRingAreas(sel, undefined);
      zoneBus.setContour(sel, undefined);
    };
  }, [sel, selArea, selContourKey, selRingAreasKey, zoneBus]);
  const edgesOn = !!g && sf!.mode === 'strip';
  const hs = 8 * px;

  return (
    <g>
      {[...byCi.entries()].map(([ci, p]) => {
        const f = fuseOf(ci);
        if (!f || !f.mode) return null;
        const isSel = ci === sel;
        if (!isSel && fuseIncomplete(f)) return null;
        return draw(p, f, !isSel);
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
      {sp && sf && sel && g && padOn && (
        <FuseZoneEditor
          px={px}
          piece={sp}
          ci={sel}
          spec={sf}
          outline={pts}
          inner={g.inner}
          bus={zoneBus}
          onChange={(next) => onChange(sel, next)}
        />
      )}
      {sp &&
        sf &&
        edgesOn &&
        g!.runs.map((run) => {
          const i = run.index;
          const implicitAll = sf.edges.length === 0;
          const on = implicitAll || sf.edges.some((edge) => edge.edge === i);
          return (
            <g key={`edge-${i}`}>
              {(on || hover === i) && (
                <polyline
                  pointerEvents='none'
                  points={str(run.points)}
                  fill='none'
                  stroke={INK}
                  strokeWidth={1}
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
                      ? (implicitAll
                          ? g!.runs.map(({ index }) => ({ edge: index, startMm: 0, endMm: 0 }))
                          : cur
                        ).filter((x) => x.edge !== i)
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
                  strokeWidth={1}
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
