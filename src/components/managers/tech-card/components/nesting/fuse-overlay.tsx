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
import type { FuseInternalLine } from 'lib/fusing-dxf/dxf';
import { nearestNotch, notchesOnRun } from 'lib/fusing-dxf/strip-ends';
import type { FuseEdge, FuseEndMode, FusePolygon } from 'lib/fusing-dxf/types';
import { Chip, Input } from 'ui';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { resolveFuse, fuseIncomplete, type PieceFuseSpec } from './fuse-spec';
import {
  isDrawnZone,
  zoneRingOutline,
  zoneRingRefs,
  type FuseGuess,
  type ZoneBus,
  type ZoneRingRef,
} from './fuse-zone';
import { FuseZoneEditor } from './fuse-zone-editor';

const INK = 'var(--color-warning)';
const PAPER = 'var(--color-bgColor)';
const DART_INK = 'var(--color-labelColor)';
const SNAP_MM = 5;
const NO_LINES: readonly FuseInternalLine[] = [];
const END_MODES: [FuseEndMode, string][] = [
  ['mm', 'mm'],
  ['notch', 'notch'],
  ['share', 'share'],
];
/** The strip-end popover, screen px. */
const END_POP_W = 186;
const r1 = (v: number) => Math.round(v * 10) / 10;

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
  netOutline: readonly Pt[] | null,
): FuseFill | null {
  if (!f.mode || (f.mode === 'zone' && !isDrawnZone(f.zone))) return null;
  const allowance = f.mode === 'strip' && f.widthMm == null && f.edges.length === 0;
  if (!allowance && f.insetNet && !Number.isFinite(requiredSeamAllowanceMm))
    return { polys: [], status: 'unknown' };
  if (
    allowance &&
    !netOutline &&
    !(Number.isFinite(requiredSeamAllowanceMm) && (requiredSeamAllowanceMm ?? 0) > 0)
  )
    return { polys: [], status: 'unknown' };
  try {
    const polys = generateFuseGeometry({
      outline: p.poly.map(mm10),
      netOutline: netOutline?.map(mm10),
      spec: f,
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
  guessOf,
  onChange,
  zoneBus,
  zoneOutlines,
  netOutlineOf,
  linesOf,
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
  /** What the size on screen built by guess for a piece. */
  guessOf?: (ci: string) => ReadonlySet<FuseGuess>;
  onChange: (ci: string, next: PieceFuseSpec) => void;
  /** Shared with the panel: the zone's clipped area and its undo stack. */
  zoneBus?: ZoneBus;
  /** Additional DXF zone outlines not present on the main-material sheet. */
  zoneOutlines?: ReadonlyMap<string, PieceDTO>;
  /** The piece's own sewing contour in its local cm frame. */
  netOutlineOf?: (piece: PieceDTO) => readonly Pt[] | null;
  /** The piece's internal lines on the size on screen, piece-local mm (notches, followed lines). */
  linesOf?: (piece: PieceDTO) => readonly FuseInternalLine[];
  /** The card's live seam-allowance standard; null means no standard is available. */
  requiredSeamAllowanceMm: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [handle, setHandle] = useState<{ edge: number; end: 's' | 'e' } | null>(null);
  /** The strip end whose mode popover is open. */
  const [pop, setPop] = useState<{ edge: number; end: 's' | 'e' } | null>(null);
  const dragged = useRef(false);
  useEffect(() => setPop(null), [sel]);
  useEffect(() => {
    if (!pop) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [pop]);
  // Fill cache: generator geometry per piece object, keyed by everything the geometry reads.
  const fills = useRef(new WeakMap<PieceDTO, Map<string, FuseFill | null>>());
  const fillOf = (p: PieceDTO, f: PieceFuseSpec) => {
    if (!f.mode || (f.mode === 'zone' && !isDrawnZone(f.zone))) return null;
    const netOutline = netOutlineOf?.(p) ?? null;
    const key = JSON.stringify([f, requiredSeamAllowanceMm, netOutline]);
    let m = fills.current.get(p);
    if (!m) fills.current.set(p, (m = new Map()));
    if (!m.has(key)) {
      if (m.size > 64) m.clear();
      m.set(key, fuseFillOf(p, f, requiredSeamAllowanceMm, netOutline));
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
  const linesOfRef = useRef(linesOf);
  linesOfRef.current = linesOf;
  const lines = useMemo(() => (sp ? linesOfRef.current?.(sp) : null) ?? NO_LINES, [sp]);
  useEffect(() => {
    if (!sel || !zoneBus) return;
    zoneBus.setLines(sel, lines);
    return () => zoneBus.setLines(sel, undefined);
  }, [sel, lines, zoneBus]);
  // Notches per edge, mm from the edge's start: the same runs and lines the size carry-over reads.
  const notchesByEdge = useMemo(
    () => (sp ? edgeRunsOf(sp.poly.map(mm10)).map((run) => notchesOnRun(run, lines)) : []),
    [sp, lines],
  );

  const world = (p: PieceDTO, q: Pt) => ({
    x: (p.originX ?? 0) + q.x,
    y: -((p.originY ?? 0) + q.y),
  });
  const geo = (p: PieceDTO, f: PieceFuseSpec) => {
    const netOutline = netOutlineOf?.(p) ?? null;
    const r = resolveFuse(f, requiredSeamAllowanceMm, netOutline != null);
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
      const src = zoneOutlines?.get(f.zone.dxfPieceKey) ?? byCi.get(f.zone.dxfPieceKey);
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
  const edgesOn = !!g && sf!.mode === 'strip' && sf!.widthMm != null;
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
          lines={lines}
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
            const lenMm = run.length * 10;
            const other = end === 's' ? o.endMm : o.startMm;
            const limit = Math.max(0, Math.floor(lenMm - other - 10));
            const endMode: FuseEndMode = (end === 's' ? o.startMode : o.endMode) ?? 'mm';
            const notches = notchesByEdge[i] ?? [];
            const onNotch = notches.length
              ? nearestNotch(notches, end === 's' ? mm : lenMm - mm)
              : -1;
            const open = pop?.edge === i && pop.end === end;
            const guess = endMode === 'notch' && !!sel && !!guessOf?.(sel).has('notch');
            const tag = guess
              ? 'guess'
              : endMode === 'notch'
                ? `notch${onNotch >= 0 ? ` ${onNotch + 1}` : ''}`
                : endMode === 'share'
                  ? `${lenMm > 0 ? Math.round((mm / lenMm) * 100) : 0} %`
                  : `${r1(mm)} mm`;
            const setEnd = (value: number, mode: FuseEndMode) => {
              if (!sel) return;
              const v = r1(Math.max(0, Math.min(value, limit)));
              onChange(sel, {
                ...sf,
                edges: sf.edges.map((x) => {
                  if (x.edge !== i) return x;
                  const next: FuseEdge = { ...x, [end === 's' ? 'startMm' : 'endMm']: v };
                  const key = end === 's' ? 'startMode' : 'endMode';
                  if (mode === 'mm') delete next[key];
                  else next[key] = mode;
                  return next;
                }),
              });
            };
            const toNotch = (k: number) =>
              setEnd(end === 's' ? notches[k] : lenMm - notches[k], 'notch');
            const toMode = (mode: FuseEndMode) => {
              if (mode === endMode) return;
              if (mode === 'notch') {
                if (onNotch >= 0) toNotch(onNotch);
              } else setEnd(mm, mode);
            };
            return (
              <g key={`h-${i}${end}`}>
                <rect
                  data-handle={`${i}${end}`}
                  x={at.x - hs / 2}
                  y={at.y - hs / 2}
                  width={hs}
                  height={hs}
                  fill={open ? INK : PAPER}
                  stroke={INK}
                  strokeWidth={1}
                  vectorEffect='non-scaling-stroke'
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    dragged.current = false;
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
                    dragged.current = true;
                    // An end at a notch moves from notch to notch; the others snap to 5 mm.
                    if (endMode === 'notch' && notches.length) {
                      const k = nearestNotch(notches, end === 's' ? raw : lenMm - raw);
                      const v = end === 's' ? notches[k] : lenMm - notches[k];
                      if (r1(v) !== mm) toNotch(k);
                      return;
                    }
                    const v = Math.max(0, Math.min(Math.round(raw / SNAP_MM) * SNAP_MM, limit));
                    if (v !== mm) setEnd(v, endMode);
                  }}
                  onPointerUp={() => {
                    setHandle(null);
                    if (!dragged.current) setPop(open ? null : { edge: i, end });
                  }}
                />
                <text
                  data-live-mm={mm}
                  data-end-tag={`${i}${end}`}
                  data-guess={guess || undefined}
                  x={lab.x}
                  y={lab.y}
                  fontSize={11 * px}
                  textAnchor='middle'
                  dominantBaseline='middle'
                  fill={guess ? 'var(--color-error)' : INK}
                  pointerEvents='none'
                  paintOrder='stroke'
                  stroke={PAPER}
                  strokeWidth={3 * px}
                >
                  {tag.toUpperCase()}
                </text>
                <rect
                  x={lab.x - 30 * px}
                  y={lab.y - 9 * px}
                  width={60 * px}
                  height={18 * px}
                  fill='transparent'
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setPop(open ? null : { edge: i, end })}
                />
                {open &&
                  endMode === 'notch' &&
                  notches.map((notchAt, k) => {
                    const q = pointOnEdgeRun(run, notchAt / 10);
                    const out = {
                      x: q.tangent.y * g.sign,
                      y: -q.tangent.x * g.sign,
                    };
                    const text = add(q.point, out, 16 * px);
                    return (
                      <g key={`notch-${k}`} data-notch={k}>
                        <rect
                          x={q.point.x - 9 * px}
                          y={q.point.y - 9 * px}
                          width={18 * px}
                          height={18 * px}
                          fill={INK}
                          fillOpacity={k === onNotch ? 0.4 : 0.12}
                          stroke={INK}
                          strokeWidth={1}
                          vectorEffect='non-scaling-stroke'
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => toNotch(k)}
                        />
                        <text
                          x={text.x}
                          y={text.y}
                          fontSize={10 * px}
                          textAnchor='middle'
                          dominantBaseline='middle'
                          fill={INK}
                          pointerEvents='none'
                          paintOrder='stroke'
                          stroke={PAPER}
                          strokeWidth={3 * px}
                        >
                          {k + 1}
                        </text>
                      </g>
                    );
                  })}
                {open && (
                  <foreignObject
                    x={at.x + 12 * px}
                    y={at.y + 12 * px}
                    width={END_POP_W * px}
                    height={64 * px}
                    style={{ overflow: 'visible' }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div
                      data-end-pop={`${i}${end}`}
                      className='grid gap-1 border border-textColor bg-bgColor p-1.5'
                      style={{
                        width: END_POP_W,
                        transform: `scale(${px})`,
                        transformOrigin: '0 0',
                      }}
                    >
                      <div className='grid grid-cols-3 gap-1'>
                        {END_MODES.map(([value, label]) => (
                          <Chip
                            key={value}
                            className='justify-center'
                            selected={endMode === value}
                            pressed={endMode === value}
                            disabled={value === 'notch' && notches.length === 0}
                            onClick={() => toMode(value)}
                          >
                            {label}
                          </Chip>
                        ))}
                      </div>
                      {endMode !== 'notch' && (
                        <Input
                          type='number'
                          aria-label={endMode === 'share' ? 'share %' : 'mm'}
                          min={0}
                          value={
                            endMode === 'share'
                              ? lenMm > 0
                                ? Math.round((mm / lenMm) * 100)
                                : 0
                              : r1(mm)
                          }
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const typed = Number(e.target.value);
                            if (!Number.isFinite(typed)) return;
                            setEnd(endMode === 'share' ? (typed / 100) * lenMm : typed, endMode);
                          }}
                        />
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          });
        })}
    </g>
  );
}
