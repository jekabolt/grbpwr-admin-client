import { grainAngleOf, grainCandidateOf } from 'lib/nesting/geom/grain-orient';
import { convexHull, gapOctagon } from 'lib/nesting/geom/convex';
import { fromPath64, toPath64 } from 'lib/nesting/geom/clipper';
import { offsetOutward } from 'lib/nesting/geom/offset';
import { area, bounds, ensureCCW, pointInPolygon, stripDegenerate } from 'lib/nesting/geom/polygon';
import { convexParts } from 'lib/nesting/geom/triangulate';
import { unionBatched } from 'lib/nesting/nest/nfp';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { DRAWING_PEN_MM } from './dxf-pdf';

const EPS = 1e-8;
const FOOTPRINT_SAFETY_MM = 0.02;

const allDrawnPoints = (piece: PieceDTO): Pt[] => [
  ...piece.poly,
  ...(piece.inner ?? []).flatMap((path) => path.pts),
];

function rotatedBounds(points: readonly Pt[], angleRad: number) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = point.x * cos - point.y * sin;
    const y = point.x * sin + point.y * cos;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Axis of the minimum-area rectangle, choosing its longer side as the roll axis. */
function minimumRectangleAxisDeg(piece: PieceDTO): number {
  const hull = convexHull(allDrawnPoints(piece));
  if (hull.length < 2) return 0;
  let bestArea = Infinity;
  let bestWidth = -Infinity;
  let bestAngle = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    let bb = rotatedBounds(hull, -angle);
    let width = bb.maxX - bb.minX;
    let height = bb.maxY - bb.minY;
    if (height > width) {
      angle += Math.PI / 2;
      bb = rotatedBounds(hull, -angle);
      width = bb.maxX - bb.minX;
      height = bb.maxY - bb.minY;
    }
    const candidateArea = width * height;
    if (
      candidateArea < bestArea - EPS ||
      (Math.abs(candidateArea - bestArea) <= EPS && width > bestWidth)
    ) {
      bestArea = candidateArea;
      bestWidth = width;
      bestAngle = angle;
    }
  }
  let degrees = (bestAngle * 180) / Math.PI;
  degrees = ((degrees % 180) + 180) % 180;
  if (degrees > 90) degrees -= 180;
  return Math.abs(degrees) < 1e-8 ? 0 : degrees;
}

function rotatePiece(piece: PieceDTO, axisDeg: number, grainLayer: string): PieceDTO {
  const candidate = grainCandidateOf(piece, grainLayer);
  const sourceGrain =
    candidate && piece.originX != null && piece.originY != null
      ? {
          layer: grainLayer,
          a: { x: candidate.a.x - piece.originX, y: candidate.a.y - piece.originY },
          b: { x: candidate.b.x - piece.originX, y: candidate.b.y - piece.originY },
        }
      : undefined;
  if (Math.abs(axisDeg) < 1e-8) return { ...piece, grain: undefined, displayGrain: sourceGrain };
  const angle = (-axisDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotate = (point: Pt): Pt => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  });
  const spun = piece.poly.map(rotate);
  const bb = bounds(spun);
  const local = (point: Pt): Pt => ({ x: point.x - bb.minX, y: point.y - bb.minY });
  const poly = spun.map(local);
  return {
    ...piece,
    poly,
    inner: piece.inner?.map((path) => ({
      ...path,
      pts: path.pts.map(rotate).map(local),
    })),
    bboxW: bb.maxX - bb.minX,
    bboxH: bb.maxY - bb.minY,
    areaCm2: area(poly),
    displayGrain: sourceGrain
      ? {
          layer: sourceGrain.layer,
          a: local(rotate(sourceGrain.a)),
          b: local(rotate(sourceGrain.b)),
        }
      : undefined,
    originX: undefined,
    originY: undefined,
    grain: undefined,
  };
}

export type StraightenedPiece = {
  piece: PieceDTO;
  axisDeg: number;
  source: 'grain' | 'rectangle';
};

/** Rotate all printable geometry so a true grainline, or the minimum rectangle, is axis-aligned. */
export function straightenRollPiece(piece: PieceDTO, grainLayer: string): StraightenedPiece {
  const grain = grainAngleOf(piece, grainLayer);
  const source = grain == null ? 'rectangle' : 'grain';
  const axisDeg = grain ?? minimumRectangleAxisDeg(piece);
  return { piece: rotatePiece(piece, axisDeg, grainLayer), axisDeg, source };
}

function centroid(poly: readonly Pt[]): Pt {
  let area2 = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    area2 += f;
    x += (poly[j].x + poly[i].x) * f;
    y += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(area2) < EPS) {
    const n = Math.max(1, poly.length);
    return {
      x: poly.reduce((sum, point) => sum + point.x, 0) / n,
      y: poly.reduce((sum, point) => sum + point.y, 0) / n,
    };
  }
  return { x: x / (3 * area2), y: y / (3 * area2) };
}

function segmentCapsule(a: Pt, b: Pt, radiusCm: number): Pt[] {
  const points: Pt[] = [];
  for (const q of gapOctagon(radiusCm)) {
    points.push({ x: a.x + q.x, y: a.y + q.y }, { x: b.x + q.x, y: b.y + q.y });
  }
  return convexHull(points);
}

function pointSegmentDistance(point: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const raw = length2 <= 1e-18 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function cross(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properIntersection(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (
    ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
    ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))
  );
}

function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (properIntersection(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function pathInside(
  pts: readonly Pt[],
  closed: boolean,
  container: readonly Pt[],
  radiusCm: number,
): boolean {
  if (pts.length === 0 || pts.some((point) => !pointInPolygon(point, container))) return false;
  const segmentCount = closed ? pts.length : Math.max(0, pts.length - 1);
  for (let i = 0; i < segmentCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    for (let j = 0; j < container.length; j++) {
      const c = container[j];
      const d = container[(j + 1) % container.length];
      if (segmentDistance(a, b, c, d) < radiusCm) return false;
    }
  }
  return true;
}

function diskInside(center: Pt, radiusCm: number, container: readonly Pt[]): boolean {
  if (!pointInPolygon(center, container)) return false;
  for (let i = 0; i < container.length; i++) {
    if (
      pointSegmentDistance(center, container[i], container[(i + 1) % container.length]) < radiusCm
    )
      return false;
  }
  return true;
}

function outerLoops(solids: readonly Pt[][]): Pt[][] {
  const parts = solids.flatMap((solid) => convexParts(ensureCCW(solid)).parts);
  const paths = unionBatched(parts.map(toPath64));
  const loops = paths
    .map((path) => ensureCCW(stripDegenerate(fromPath64(path), 1e-5)))
    .filter((poly) => poly.length >= 3 && area(poly) > 1e-8)
    .sort((a, b) => area(b) - area(a));
  const outer: Pt[][] = [];
  for (const loop of loops) {
    if (!outer.some((container) => pointInPolygon(loop[0], container))) outer.push(loop);
  }
  return outer;
}

function closestBridge(a: readonly Pt[], b: readonly Pt[], radiusCm: number): Pt[] {
  let aa = a[0];
  let bb = b[0];
  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < best) {
        best = d;
        aa = p;
        bb = q;
      }
    }
  }
  return segmentCapsule(aa, bb, radiusCm);
}

/**
 * A single simple concave keep-out accepted by the marker NFP code. Closed drawn contours are
 * filled and unioned; open strokes are thin capsules; the label is an orientation-safe disk.
 * Every solid is padded by its physical pen radius before the union.
 */
export function drawnRollFootprint(piece: PieceDTO, label: string, labelSizeMm: number): Pt[] {
  const solids: Pt[][] = [];
  const addClosed = (poly: readonly Pt[], radiusMm: number) => {
    if (poly.length < 3) return;
    const expanded = offsetOutward(poly, (radiusMm + FOOTPRINT_SAFETY_MM) / 10).poly;
    if (expanded.length >= 3) solids.push(ensureCCW(expanded));
  };
  addClosed(piece.poly, DRAWING_PEN_MM.cut / 2);
  for (const path of piece.inner ?? []) {
    const lineRadiusCm = (DRAWING_PEN_MM.line / 2 + FOOTPRINT_SAFETY_MM) / 10;
    if (pathInside(path.pts, path.closed, piece.poly, lineRadiusCm)) continue;
    if (path.closed && path.pts.length >= 3) {
      addClosed(path.pts, DRAWING_PEN_MM.line / 2);
      continue;
    }
    for (let i = 1; i < path.pts.length; i++)
      solids.push(segmentCapsule(path.pts[i - 1], path.pts[i], lineRadiusCm));
  }

  const anchor = centroid(piece.poly);
  const labelReachCm = (labelSizeMm * (label.length + 2) + FOOTPRINT_SAFETY_MM) / 10;
  if (!diskInside(anchor, labelReachCm, piece.poly))
    solids.push(
      gapOctagon(labelReachCm).map((point) => ({
        x: anchor.x + point.x,
        y: anchor.y + point.y,
      })),
    );

  let outer = outerLoops(solids);
  if (outer.length === 0) throw new Error(`could not build a print footprint for ${piece.name}`);
  if (outer.length === 1) return outer[0];

  // A rare detached annotation still belongs to the piece. Join components by the narrowest
  // possible safe bridges rather than replacing the whole piece by its convex hull.
  const connected = [...outer];
  for (let i = 1; i < outer.length; i++)
    connected.push(
      closestBridge(outer[0], outer[i], (DRAWING_PEN_MM.cut / 2 + FOOTPRINT_SAFETY_MM) / 10),
    );
  outer = outerLoops(connected);
  if (outer.length === 1) return outer[0];

  // Last-resort safety for malformed, widely detached annotations. Normal garment blocks never
  // reach this path; under-coverage would be worse than losing concavity for that one piece.
  return convexHull(outer.flat());
}
