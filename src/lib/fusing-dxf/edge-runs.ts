/**
 * A fusing edge is a run of outline segments between visible corners, not one tessellated DXF
 * segment. Curves therefore stay pickable as one edge even when the parser emits many chords.
 */

export type EdgePoint = { x: number; y: number };

/** A vertex starts a new edge when the outline turns more than this angle. */
export const EDGE_CORNER_TURN_DEG = 30;

const EPS = 1e-9;

const distance = (a: EdgePoint, b: EdgePoint) => Math.hypot(b.x - a.x, b.y - a.y);
const samePoint = (a: EdgePoint, b: EdgePoint) => distance(a, b) <= EPS;

export type EdgeRun<T extends EdgePoint = EdgePoint> = {
  /** Zero-based edge index. This, rather than a raw segment index, is persisted. */
  index: number;
  /** Raw outline segments covered by this edge, in traversal order. */
  segmentIndices: number[];
  /** Open run points, including both corner endpoints. A cornerless loop repeats its first point. */
  points: T[];
  length: number;
  closed: boolean;
};

function usableVector<T extends EdgePoint>(
  points: readonly T[],
  vertex: number,
  direction: 1 | -1,
): EdgePoint | null {
  const at = points[vertex];
  for (let step = 1; step < points.length; step++) {
    const other = points[(vertex + direction * step + points.length * step) % points.length];
    const dx = direction === 1 ? other.x - at.x : at.x - other.x;
    const dy = direction === 1 ? other.y - at.y : at.y - other.y;
    const length = Math.hypot(dx, dy);
    if (length > EPS) return { x: dx / length, y: dy / length };
  }
  return null;
}

/** Absolute deflection at a closed outline vertex: straight = 0°, reversal = 180°. */
export function outlineTurnDeg<T extends EdgePoint>(points: readonly T[], vertex: number): number {
  if (points.length < 3) return 0;
  const incoming = usableVector(points, vertex, -1);
  const outgoing = usableVector(points, vertex, 1);
  if (!incoming || !outgoing) return 0;
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  return (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
}

/**
 * Splits a closed outline into maximal consecutive runs whose internal turns stay at or below the
 * corner threshold. The first run starts at the first corner in outline order, keeping run indices
 * stable across graded outlines that preserve their segment order.
 */
export function edgeRunsOf<T extends EdgePoint>(
  outline: readonly T[],
  cornerTurnDeg = EDGE_CORNER_TURN_DEG,
): EdgeRun<T>[] {
  const points =
    outline.length > 1 && samePoint(outline[0], outline[outline.length - 1])
      ? outline.slice(0, -1)
      : [...outline];
  const count = points.length;
  if (count < 2) return [];

  const corners = points
    .map((_, index) => index)
    .filter((index) => outlineTurnDeg(points, index) > cornerTurnDeg);

  if (!corners.length) {
    const runPoints = [...points, points[0]];
    return [
      {
        index: 0,
        segmentIndices: points.map((_, index) => index),
        points: runPoints,
        length: polylineLength(runPoints),
        closed: true,
      },
    ];
  }

  return corners.map((start, index) => {
    const stop = corners[(index + 1) % corners.length];
    const segmentIndices: number[] = [];
    const runPoints: T[] = [points[start]];
    for (let segment = start; ; segment = (segment + 1) % count) {
      segmentIndices.push(segment);
      runPoints.push(points[(segment + 1) % count]);
      if ((segment + 1) % count === stop) break;
    }
    return {
      index,
      segmentIndices,
      points: runPoints,
      length: polylineLength(runPoints),
      closed: corners.length === 1,
    };
  });
}

/** Mean per-run mismatch above which two outlines are not taken for the same piece. */
const PAIR_MAX_COST = 0.2;
/** The runner-up must be at least this much worse (mean per run), or the pairing is ambiguous. */
const PAIR_MIN_MARGIN = 0.05;

export type EdgeRunPairing = {
  /** target[i] = the target run that is base run i. */
  target: number[];
  /** The target ring runs the other way round: a run's start trim is the paired run's end trim. */
  reversed: boolean;
};

function ringArea(points: readonly EdgePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

type RunShape = { share: number; mid: EdgePoint; convex: number };

/**
 * Start-independent description of each run: its share of the perimeter, its arc-length midpoint in
 * the outline's bbox (0..1 on both axes), and whether the corner it starts at turns with the ring
 * (+1), against it (-1) or not at all (0, a cornerless loop). Both are the same read either way round.
 */
function runShapes(outline: readonly EdgePoint[], runs: readonly EdgeRun[]): RunShape[] {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, EPS);
  const h = Math.max(Math.max(...ys) - minY, EPS);
  const perimeter = runs.reduce((sum, run) => sum + run.length, 0) || 1;
  const winding = Math.sign(ringArea(outline)) || 1;
  const direction = (from: EdgePoint, to: EdgePoint) => ({ x: to.x - from.x, y: to.y - from.y });
  return runs.map((run, index) => {
    const mid = pointOnEdgeRun(run, run.length / 2).point;
    let convex = 0;
    if (runs.length > 1) {
      const prev = runs[(index - 1 + runs.length) % runs.length].points;
      const corner = run.points[0];
      const before = [...prev].reverse().find((p) => !samePoint(p, corner));
      const after = run.points.find((p) => !samePoint(p, corner));
      if (before && after) {
        const a = direction(before, corner);
        const b = direction(corner, after);
        convex = Math.sign(a.x * b.y - a.y * b.x) * winding;
      }
    }
    return {
      share: run.length / perimeter,
      mid: { x: (mid.x - minX) / w, y: (mid.y - minY) / h },
      convex,
    };
  });
}

/**
 * Pairs the edge runs of two outlines of the same piece (another size, or the same ring started at
 * another vertex / run the other way round) by geometry: cyclic order, corner turn signs, perimeter
 * share and bbox position. Run indices alone depend on where each DXF ring starts. Null when the run
 * counts differ, nothing fits, or two pairings fit about equally well.
 */
export function pairEdgeRuns(
  baseOutline: readonly EdgePoint[],
  targetOutline: readonly EdgePoint[],
  cornerTurnDeg = EDGE_CORNER_TURN_DEG,
): EdgeRunPairing | null {
  const from = edgeRunsOf(baseOutline, cornerTurnDeg);
  const to = edgeRunsOf(targetOutline, cornerTurnDeg);
  const n = from.length;
  if (!n || n !== to.length) return null;
  const reversed =
    Math.sign(ringArea(baseOutline)) !== Math.sign(ringArea(targetOutline)) &&
    ringArea(baseOutline) !== 0 &&
    ringArea(targetOutline) !== 0;
  if (n === 1) return { target: [0], reversed };
  const a = runShapes(baseOutline, from);
  const b = runShapes(targetOutline, to);
  // Base run i starts at the corner where its paired run starts — or, reversed, where the paired
  // run ends, i.e. where the target run after it starts.
  const pairOf = (i: number, k: number) => (reversed ? (k - i + n) % n : (i + k) % n);
  const startCornerOf = (j: number) => (reversed ? (j + 1) % n : j);
  const scored = Array.from({ length: n }, (_, k) => {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const j = pairOf(i, k);
      cost +=
        Math.hypot(a[i].mid.x - b[j].mid.x, a[i].mid.y - b[j].mid.y) +
        2 * Math.abs(a[i].share - b[j].share) +
        (a[i].convex === b[startCornerOf(j)].convex ? 0 : 0.5);
    }
    return { k, cost: cost / n };
  }).sort((x, y) => x.cost - y.cost);
  const [best, second] = scored;
  if (best.cost > PAIR_MAX_COST) return null;
  if (second && second.cost - best.cost < PAIR_MIN_MARGIN) return null;
  return { target: from.map((_, i) => pairOf(i, best.k)), reversed };
}

/** What a strip edge keeps of its run at least, however long its trims (the editor's own floor). */
export const STRIP_MIN_KEEP_MM = 10;

/**
 * A strip edge's trims on a run of `runLength` mm. Trims are fixed mm from the run's corners; when
 * they would leave less than STRIP_MIN_KEEP_MM of the run, both shrink by the same factor until
 * that much is left (the whole run when it is shorter than that), so the strip never inverts or
 * vanishes on a smaller size.
 */
export function clampStripTrims(
  runLength: number,
  startMm: number,
  endMm: number,
): [startMm: number, endMm: number] {
  const start = Math.max(0, startMm || 0);
  const end = Math.max(0, endMm || 0);
  const room = Math.max(0, runLength - STRIP_MIN_KEEP_MM);
  if (start + end <= room) return [start, end];
  const factor = room / (start + end);
  return [start * factor, end * factor];
}

export function polylineLength(points: readonly EdgePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
  return length;
}

export type EdgeRunPosition = { point: EdgePoint; tangent: EdgePoint; distance: number };

/** Point and forward tangent at an arc-length position along a run. */
export function pointOnEdgeRun(run: EdgeRun, at: number): EdgeRunPosition {
  const target = Math.max(0, Math.min(run.length, at));
  let walked = 0;
  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    const length = distance(a, b);
    if (length <= EPS) continue;
    if (walked + length >= target - EPS || i === run.points.length - 1) {
      const t = Math.max(0, Math.min(1, (target - walked) / length));
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        tangent: { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
        distance: target,
      };
    }
    walked += length;
  }
  const point = run.points[0] ?? { x: 0, y: 0 };
  return { point, tangent: { x: 1, y: 0 }, distance: 0 };
}

/** Closest arc-length position on a run, used by the drag handles. */
export function projectPointToEdgeRun(run: EdgeRun, point: EdgePoint): EdgeRunPosition {
  let best: EdgeRunPosition | null = null;
  let bestGap = Infinity;
  let walked = 0;
  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPS) continue;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length ** 2));
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    const gap = distance(point, projected);
    if (gap < bestGap) {
      bestGap = gap;
      best = {
        point: projected,
        tangent: { x: dx / length, y: dy / length },
        distance: walked + length * t,
      };
    }
    walked += length;
  }
  return best ?? pointOnEdgeRun(run, 0);
}

/** Open sub-polyline trimmed by arc length at both ends. */
export function trimEdgeRun(run: EdgeRun, start: number, end: number): EdgePoint[] {
  const from = Math.max(0, start);
  const to = Math.min(run.length, run.length - Math.max(0, end));
  if (to - from <= EPS) return [];
  const first = pointOnEdgeRun(run, from).point;
  const last = pointOnEdgeRun(run, to).point;
  const out: EdgePoint[] = [first];
  let walked = 0;
  for (let i = 1; i < run.points.length; i++) {
    const length = distance(run.points[i - 1], run.points[i]);
    walked += length;
    if (walked > from + EPS && walked < to - EPS) out.push(run.points[i]);
  }
  if (!samePoint(out[out.length - 1], last)) out.push(last);
  return out;
}

/** Extends an open run along its end tangents so adjacent selected edge bands overlap at a corner. */
export function extendPolyline(
  points: readonly EdgePoint[],
  before: number,
  after: number,
): EdgePoint[] {
  if (points.length < 2) return [...points];
  const out = points.map((point) => ({ ...point }));
  if (before > EPS) {
    const a = out[0];
    const b = out.find((point) => !samePoint(point, a));
    if (b) {
      const length = distance(a, b);
      out[0] = {
        x: a.x - ((b.x - a.x) / length) * before,
        y: a.y - ((b.y - a.y) / length) * before,
      };
    }
  }
  if (after > EPS) {
    const last = out[out.length - 1];
    const beforeLast = [...out].reverse().find((point) => !samePoint(point, last));
    if (beforeLast) {
      const length = distance(beforeLast, last);
      out[out.length - 1] = {
        x: last.x + ((last.x - beforeLast.x) / length) * after,
        y: last.y + ((last.y - beforeLast.y) / length) * after,
      };
    }
  }
  return out;
}

function offsetPolyline(
  source: readonly EdgePoint[],
  depth: number,
  inwardSign: 1 | -1,
  closed: boolean,
): EdgePoint[] {
  const points = closed ? source.slice(0, -1) : [...source];
  const count = points.length;
  const normal = (index: number) => {
    const a = points[index];
    const b = points[(index + 1) % count];
    const length = distance(a, b) || 1;
    return {
      x: (-(b.y - a.y) / length) * inwardSign,
      y: ((b.x - a.x) / length) * inwardSign,
    };
  };
  const normals = Array.from({ length: closed ? count : count - 1 }, (_, index) => normal(index));
  return points.map((point, index) => {
    if (!closed && index === 0)
      return { x: point.x + normals[0].x * depth, y: point.y + normals[0].y * depth };
    if (!closed && index === count - 1) {
      const n = normals[normals.length - 1];
      return { x: point.x + n.x * depth, y: point.y + n.y * depth };
    }
    const previous = normals[(index - 1 + normals.length) % normals.length];
    const next = normals[index % normals.length];
    const divisor = Math.max(1 + previous.x * next.x + previous.y * next.y, 0.25);
    return {
      x: point.x + ((previous.x + next.x) * depth) / divisor,
      y: point.y + ((previous.y + next.y) * depth) / divisor,
    };
  });
}

/**
 * One-sided offset band following a run. Quads share mitred offset vertices, so their union is the
 * same curved band in SVG preview and generated DXF. Units are inherited from the input points.
 */
export function stripBandPolygons(
  source: readonly EdgePoint[],
  innerDepth: number,
  outerDepth: number,
  inwardSign: 1 | -1,
): EdgePoint[][] {
  if (source.length < 2 || outerDepth - innerDepth <= EPS) return [];
  const closed = source.length > 2 && samePoint(source[0], source[source.length - 1]);
  const inner = offsetPolyline(source, innerDepth, inwardSign, closed);
  const outer = offsetPolyline(source, outerDepth, inwardSign, closed);
  const segmentCount = closed ? inner.length : inner.length - 1;
  return Array.from({ length: segmentCount }, (_, index) => {
    const next = (index + 1) % inner.length;
    return [inner[index], inner[next], outer[next], outer[index]];
  });
}
