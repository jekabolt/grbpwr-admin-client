import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import { offsetContour, OFFSET_SCALE } from 'lib/pattern-import/semantics/offset';
import type { PtMm } from 'lib/pattern-import/types';
import { edgeRunsOf, extendPolyline, stripBandPolygons, trimEdgeRun } from './edge-runs';
import {
  SPLINE_MAX_POINTS,
  SPLINE_MIN_POINTS,
  flattenZone,
  ringSelfIntersects,
  ringStrictlyInside,
  ringsOverlap,
} from './spline';
import type { FuseGeometryInput, FusePolygon, FuseSpline, FuseZone, PieceFuseSpec } from './types';

const EPS = 1e-7;
export const ZONE_MAX_OUTER_RINGS = 16;
export const ZONE_MAX_HOLES = 16;

export class FuseGeometryError extends Error {}
export class FuseTopologyError extends FuseGeometryError {}

export function signedArea(points: readonly PtMm[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

export function fuseAreaMm2(polygons: readonly FusePolygon[]): number {
  return polygons.reduce(
    (sum, p) =>
      sum +
      Math.abs(signedArea(p.outer)) -
      p.holes.reduce((holeSum, h) => holeSum + Math.abs(signedArea(h)), 0),
    0,
  );
}

const samePoint = (a: PtMm, b: PtMm) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;

function cleanRing(points: readonly PtMm[], clockwise = false): PtMm[] {
  const out: PtMm[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!out.length || !samePoint(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
  if (out.length < 3 || Math.abs(signedArea(out)) <= EPS)
    throw new FuseGeometryError('degenerate polygon');
  const isClockwise = signedArea(out) < 0;
  return isClockwise === clockwise ? out : out.reverse();
}

function toPath(points: readonly PtMm[]): Path64 {
  const path = new Path64();
  for (const p of points)
    path.push(new Point64(Math.round(p.x * OFFSET_SCALE), Math.round(p.y * OFFSET_SCALE)));
  return path;
}

function fromPath(path: Path64): PtMm[] {
  const out: PtMm[] = [];
  for (const p of path) out.push({ x: p.x / OFFSET_SCALE, y: p.y / OFFSET_SCALE });
  return out;
}

function pointInRing(point: PtMm, ring: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Converts Clipper's positive outer / negative hole loops into an explicit polygon-with-holes IR. */
function polygonsOf(paths: Paths64): FusePolygon[] {
  const outers: FusePolygon[] = [];
  const holes: PtMm[][] = [];
  for (const path of paths) {
    const ring = fromPath(path);
    if (ring.length < 3 || Math.abs(signedArea(ring)) <= EPS) continue;
    if (signedArea(ring) > 0) outers.push({ outer: cleanRing(ring), holes: [] });
    else holes.push(cleanRing(ring, true));
  }
  outers.sort((a, b) => Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer)));
  for (const hole of holes) {
    const owner = [...outers].reverse().find((candidate) => pointInRing(hole[0], candidate.outer));
    if (owner) owner.holes.push(hole);
  }
  return outers;
}

function effectiveInset(spec: PieceFuseSpec, seamAllowanceMm: number | null | undefined): number {
  if (spec.insetNet) {
    if (!Number.isFinite(seamAllowanceMm))
      throw new FuseGeometryError('net inset requires a seam allowance');
    return Math.max(0, seamAllowanceMm ?? 0);
  }
  return Math.max(0, spec.insetMm ?? 3);
}

function insetOutline(outline: readonly PtMm[], insetMm: number): PtMm[] {
  const source = cleanRing(outline);
  const result = offsetContour(source, -insetMm);
  if (!result.report.ok)
    throw new FuseGeometryError(`inset failed: ${result.report.reason ?? 'invalid offset'}`);
  return cleanRing(result.pts);
}

/** The inset contour the fuse is clipped to (and a drawn zone's sides follow), piece-local mm. */
export function fuseInsetRingMm(
  outline: readonly PtMm[],
  spec: PieceFuseSpec,
  seamAllowanceMm: number | null | undefined,
): PtMm[] {
  return insetOutline(cleanRing(outline), effectiveInset(spec, seamAllowanceMm));
}

function expandedDarts(darts: readonly PtMm[][], insetMm: number): PtMm[][] {
  return darts.flatMap((dart) => {
    const source = cleanRing(dart);
    if (insetMm <= EPS) return [source];
    const result = offsetContour(source, insetMm);
    if (!result.report.ok)
      throw new FuseGeometryError(`dart inset failed: ${result.report.reason ?? 'invalid offset'}`);
    return [cleanRing(result.pts)];
  });
}

function subtractDarts(
  subjects: readonly FusePolygon[],
  darts: readonly PtMm[][],
  insetMm: number,
): FusePolygon[] {
  if (!darts.length || !subjects.length) return [...subjects];
  const subjectPaths = subjects.flatMap((p) => [toPath(p.outer), ...p.holes.map(toPath)]);
  const clips = expandedDarts(darts, insetMm).map(toPath);
  return polygonsOf(Clipper.Difference(subjectPaths, clips, FillRule.NonZero));
}

function selectedEdges(spec: PieceFuseSpec, edgeCount: number) {
  const selected = new Map<number, (typeof spec.edges)[number]>();
  for (const edge of spec.edges) {
    if (!Number.isInteger(edge.edge) || edge.edge < 0 || edge.edge >= edgeCount)
      throw new FuseTopologyError(`edge ${edge.edge} is outside a ${edgeCount}-run outline`);
    selected.set(edge.edge, edge);
  }
  return selected;
}

function stripPaths(outline: readonly PtMm[], spec: PieceFuseSpec, insetMm: number): Paths64 {
  const width = spec.widthMm;
  if (!(width != null && Number.isFinite(width) && width > 0))
    throw new FuseGeometryError('strip width must be greater than zero');
  const runs = edgeRunsOf(outline);
  const edges = selectedEdges(spec, runs.length);
  if (!edges.size) throw new FuseGeometryError('strip mode has no selected edges');
  const bands: Path64[] = [];
  for (const [index, edge] of edges) {
    const run = runs[index];
    const start = Math.max(0, edge.startMm || 0);
    const end = Math.max(0, edge.endMm || 0);
    if (start + end >= run.length - EPS) continue;
    const prev = runs.length > 1 ? edges.get((index - 1 + runs.length) % runs.length) : undefined;
    const next = runs.length > 1 ? edges.get((index + 1) % runs.length) : undefined;
    const joinReach = insetMm + width;
    const points = extendPolyline(
      trimEdgeRun(run, start, end),
      start <= EPS && prev && Math.max(0, prev.endMm || 0) <= EPS ? joinReach : 0,
      end <= EPS && next && Math.max(0, next.startMm || 0) <= EPS ? joinReach : 0,
    );
    // cleanRing makes the outline CCW, so its material is to the left of each run.
    bands.push(
      ...stripBandPolygons(points, insetMm, insetMm + width, 1).map((band) =>
        toPath(cleanRing(band)),
      ),
    );
  }
  if (!bands.length) return new Paths64();
  return Clipper.Union(bands, undefined, FillRule.NonZero);
}

/**
 * A drawn zone (rect / spline) as one closed ring in piece-local mm, validated. With the inset
 * contour, a spline side between two points on it follows it (spline.ts flattenZoneSides).
 */
export function zoneRingMm(
  zone: Exclude<FuseZone, { dxfPieceKey: string }>,
  contour?: readonly PtMm[] | null,
): PtMm[] {
  if ('rect' in zone) {
    const [ax, ay, bx, by] = zone.rect;
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by);
    const y1 = Math.max(ay, by);
    if (x1 - x0 <= EPS || y1 - y0 <= EPS) throw new FuseGeometryError('zone rect is empty');
    return cleanRing([
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]);
  }
  return splineRingMm(zone.spline, contour);
}

function splineRingMm(spline: FuseSpline, contour?: readonly PtMm[] | null): PtMm[] {
  const points = spline.points;
  if (points.length < SPLINE_MIN_POINTS || points.length > SPLINE_MAX_POINTS)
    throw new FuseGeometryError(
      `zone spline needs ${SPLINE_MIN_POINTS}..${SPLINE_MAX_POINTS} points, has ${points.length}`,
    );
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    throw new FuseGeometryError('zone spline has a non-finite point');
  const flattened = flattenZone(points, contour);
  if (ringSelfIntersects(flattened)) throw new FuseGeometryError('zone spline crosses itself');
  return cleanRing(flattened);
}

export type FuseZoneRings = { outers: PtMm[][]; holes: PtMm[][] };

/**
 * Flattens and validates the complete spline topology with the backend's rules. Outer rings may
 * follow the inset contour; cut-outs never do because they must remain strictly inside an outer.
 */
export function zoneRingsMm(
  zone: Exclude<FuseZone, { rect: [number, number, number, number] } | { dxfPieceKey: string }>,
  contour?: readonly PtMm[] | null,
): FuseZoneRings {
  const outerCount = 1 + zone.islands.length;
  if (outerCount > ZONE_MAX_OUTER_RINGS)
    throw new FuseGeometryError(`zone has too many outer rings (${outerCount})`);
  if (zone.holes.length > ZONE_MAX_HOLES)
    throw new FuseGeometryError(`zone has too many holes (${zone.holes.length})`);

  // The server validates the stored Catmull-Rom rings, before the editor-only contour-follow rule
  // is applied. Keep this first pass operation-for-operation equivalent to that contract.
  const storedOuters = [splineRingMm(zone.spline)];
  for (const island of zone.islands) {
    const ring = splineRingMm(island);
    if (storedOuters.some((other) => ringsOverlap(ring, other)))
      throw new FuseGeometryError('zone outer rings overlap, touch, or nest');
    storedOuters.push(ring);
  }

  const holes: PtMm[][] = [];
  for (const hole of zone.holes) {
    const ring = splineRingMm(hole);
    const owners = storedOuters.filter((outer) => ringStrictlyInside(ring, outer));
    if (owners.length !== 1)
      throw new FuseGeometryError('zone hole is not strictly inside exactly one outer ring');
    if (holes.some((other) => ringsOverlap(ring, other)))
      throw new FuseGeometryError('zone holes overlap or touch');
    holes.push(ring);
  }

  const area =
    storedOuters.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0) -
    holes.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
  if (!(area > EPS)) throw new FuseGeometryError('zone holes remove the whole fusing zone');
  const outers = [
    splineRingMm(zone.spline, contour),
    ...zone.islands.map((island) => splineRingMm(island, contour)),
  ];
  return { outers, holes };
}

/** Pure fuse geometry in piece-local millimetres. */
export function generateFuseGeometry(input: FuseGeometryInput): FusePolygon[] {
  const outline = cleanRing(input.outline);
  const edgeCount = edgeRunsOf(outline).length;
  if (
    input.expectedEdgeCount != null &&
    Number.isInteger(input.expectedEdgeCount) &&
    edgeCount !== input.expectedEdgeCount
  ) {
    throw new FuseTopologyError(
      `outline has ${edgeCount} edge runs; base size has ${input.expectedEdgeCount}`,
    );
  }
  const insetMm = effectiveInset(input.spec, input.seamAllowanceMm);
  const inset = insetOutline(outline, insetMm);
  let polygons: FusePolygon[];

  switch (input.spec.mode) {
    case 'whole':
      polygons = [{ outer: inset, holes: [] }];
      break;
    case 'strip': {
      const strips = stripPaths(outline, input.spec, insetMm);
      polygons = polygonsOf(Clipper.Intersect(strips, [toPath(inset)], FillRule.NonZero));
      break;
    }
    case 'zone': {
      const zone = input.spec.zone;
      if (!zone) throw new FuseGeometryError('zone mode has no zone');
      if (!('dxfPieceKey' in zone)) {
        // The drawn zone is clipped to the inset contour. Spline holes keep their opposite winding
        // so Clipper preserves them as closed cut-outs; disjoint outers survive as separate polygons.
        const rings =
          'rect' in zone
            ? { outers: [zoneRingMm(zone, inset)], holes: [] }
            : zoneRingsMm(zone, inset);
        const subjects = [
          ...rings.outers.map((ring) => toPath(cleanRing(ring))),
          ...rings.holes.map((ring) => toPath(cleanRing(ring, true))),
        ];
        polygons = polygonsOf(Clipper.Intersect(subjects, [toPath(inset)], FillRule.NonZero));
      } else {
        if (!input.zoneOutline)
          throw new FuseGeometryError(`DXF zone “${zone.dxfPieceKey}” was not resolved`);
        // Referenced pieces are deliberate fuse shapes and are emitted in their own outline as-is.
        polygons = [{ outer: cleanRing(input.zoneOutline), holes: [] }];
      }
      break;
    }
    default:
      throw new FuseGeometryError('fusing mode is not set');
  }

  if (!polygons.length) throw new FuseGeometryError(`${input.spec.mode} geometry is empty`);
  const result =
    input.spec.darts === 'cut' ? subtractDarts(polygons, input.darts ?? [], insetMm) : polygons;
  if (!result.length) throw new FuseGeometryError('dart subtraction removed all fuse geometry');
  return result;
}
