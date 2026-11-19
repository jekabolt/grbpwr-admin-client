import type {
  AuthoredAllowanceCorner,
  AuthoredAllowanceCornerVariant,
  ManifestAuthoredAllowanceCorner,
  PtMm,
} from '../types';
import { pointInPolygon, signedArea } from '../semantics/geom';
import { MITER_LIMIT, offsetNativeOrthogonalAllowanceCornerV1 } from '../semantics/offset';

const units = 1_000_000;
const grid = (value: number) => Math.round(Number(value.toFixed(6)) * units);
const exact = (value: number) => Number.isSafeInteger(grid(value)) && grid(value) / units === value;
const same = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;
const closedWithoutRepeat = (points: readonly PtMm[]) =>
  points.length > 1 && same(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;
const axis = (a: PtMm, b: PtMm) =>
  a.x === b.x && a.y !== b.y ? 'x' : a.y === b.y && a.x !== b.x ? 'y' : null;
const subtract = (a: PtMm, b: PtMm) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: PtMm, b: PtMm) => a.x * b.y - a.y * b.x;
const isFoldback = (variant: AuthoredAllowanceCornerVariant) =>
  variant === 'foldback-before' || variant === 'foldback-after';

export function isAuthoredAllowanceCornerVariant(
  value: unknown,
): value is AuthoredAllowanceCornerVariant {
  return (
    value === 'auto' ||
    value === 'mitre' ||
    value === 'square' ||
    value === 'clip' ||
    value === 'foldback-before' ||
    value === 'foldback-after'
  );
}

export function parseAuthoredAllowanceCorner(
  value: unknown,
): ManifestAuthoredAllowanceCorner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { variant, sewing, width } = value as Partial<ManifestAuthoredAllowanceCorner>;
  if (
    !isAuthoredAllowanceCornerVariant(variant) ||
    !Array.isArray(sewing) ||
    sewing.length !== 6 ||
    !sewing.every(Number.isSafeInteger) ||
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    width <= 0
  )
    return null;
  const marker: ManifestAuthoredAllowanceCorner = { variant, sewing: [...sewing], width };
  const [a, b, c] = decodeAuthoredAllowanceCorner(marker).sewing;
  const incoming = axis(a, b);
  const outgoing = axis(b, c);
  const orthogonal = incoming && outgoing && incoming !== outgoing;
  if (variant === 'square' || variant === 'clip') return orthogonal ? marker : null;
  return cross(subtract(b, a), subtract(c, b)) > 0 ? marker : null;
}

export function decodeAuthoredAllowanceCorner(
  marker: ManifestAuthoredAllowanceCorner,
  offset: PtMm = { x: 0, y: 0 },
): AuthoredAllowanceCorner {
  const [ax, ay, bx, by, cx, cy] = marker.sewing;
  const point = (x: number, y: number) => ({ x: x / units + offset.x, y: y / units + offset.y });
  return {
    variant: marker.variant,
    sewing: [point(ax, ay), point(bx, by), point(cx, cy)],
    widthMm: marker.width / units,
  };
}

export function authoredAllowanceCornerMarker(
  corner: AuthoredAllowanceCorner,
): ManifestAuthoredAllowanceCorner | null {
  const { variant, sewing, widthMm } = corner;
  return parseAuthoredAllowanceCorner({
    variant,
    sewing: sewing.flatMap(({ x, y }) => [grid(x), grid(y)]),
    width: grid(widthMm),
  });
}

export function mapAuthoredAllowanceCorner(
  corner: AuthoredAllowanceCorner,
  transform: (point: PtMm) => PtMm,
): AuthoredAllowanceCorner {
  return {
    ...corner,
    sewing: [transform(corner.sewing[0]), transform(corner.sewing[1]), transform(corner.sewing[2])],
  };
}

function isStrictlyConvexRing(points: readonly PtMm[], inside: readonly PtMm[] = []) {
  if (!points.every(({ x, y }) => exact(x) && exact(y)) || signedArea(points) <= 0) return false;
  const coords = points.map(({ x, y }) => [BigInt(grid(x)), BigInt(grid(y))] as const);
  const interior = inside.map(({ x, y }) => [BigInt(grid(x)), BigInt(grid(y))] as const);
  return coords.every(([ax, ay], i) =>
    [...coords, ...interior].every(([px, py], j) => {
      const next = (i + 1) % coords.length;
      const [bx, by] = coords[next]!;
      return i === j || next === j || (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0n;
    }),
  );
}

type Join = {
  cut: readonly PtMm[];
  start: number;
  points: PtMm[];
  joins: Partial<Record<AuthoredAllowanceCornerVariant, PtMm[]>>;
};

type Support = { at: PtMm; along: PtMm };

function allowanceSupport(vertex: PtMm, delta: PtMm, width: number): Support {
  const length = Math.hypot(delta.x, delta.y);
  const along = { x: delta.x / length, y: delta.y / length };
  return { at: { x: vertex.x + width * along.y, y: vertex.y - width * along.x }, along };
}

function meet(a: Support, b: Support): PtMm | null {
  const denominator = cross(a.along, b.along);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = cross(subtract(b.at, a.at), b.along) / denominator;
  return { x: a.at.x + t * a.along.x, y: a.at.y + t * a.along.y };
}

function foldback(
  vertex: PtMm,
  incoming: Support,
  outgoing: Support,
  widthMm: number,
  useIncoming: boolean,
): PtMm[] | undefined {
  const [fold, other] = useIncoming ? [incoming, outgoing] : [outgoing, incoming];
  const reflect = ({ x, y }: PtMm) => {
    const doubledProjection = 2 * (x * fold.along.x + y * fold.along.y);
    return {
      x: doubledProjection * fold.along.x - x,
      y: doubledProjection * fold.along.y - y,
    };
  };
  const offset = reflect(subtract(other.at, vertex));
  const reflected = {
    at: { x: vertex.x + offset.x, y: vertex.y + offset.y },
    along: reflect(other.along),
  };
  const tip = meet(fold, reflected);
  const hinge = meet({ at: vertex, along: fold.along }, other);
  if (
    !tip ||
    !hinge ||
    [tip, hinge].some((p) => Math.hypot(p.x - vertex.x, p.y - vertex.y) > 2 * MITER_LIMIT * widthMm)
  )
    return;
  return useIncoming ? [tip, hinge] : [hinge, tip];
}

// Foldback can produce one reflex vertex. Reject touching/crossing native segments as well
// as crossing the sewing ring, using the same integer grid that is written to DXF.
function enclosesSewing(cut: readonly PtMm[], sewing: readonly PtMm[]): boolean {
  const ring = (points: readonly PtMm[]) =>
    points.map(({ x, y }) => [BigInt(grid(x)), BigInt(grid(y))] as const);
  type GridPoint = ReturnType<typeof ring>[number];
  const sign = (a: GridPoint, b: GridPoint, p: GridPoint) => {
    const value = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return value > 0n ? 1 : value < 0n ? -1 : 0;
  };
  const meets = (a: GridPoint, b: GridPoint, c: GridPoint, d: GridPoint) => {
    if (sign(a, b, c) * sign(a, b, d) > 0 || sign(c, d, a) * sign(c, d, b) > 0) return false;
    return ([0, 1] as const).every((i) => {
      const [u, v] = a[i] < b[i] ? [a[i], b[i]] : [b[i], a[i]];
      const [w, z] = c[i] < d[i] ? [c[i], d[i]] : [d[i], c[i]];
      return u <= z && w <= v;
    });
  };
  if (
    !cut.every(({ x, y }) => exact(x) && exact(y)) ||
    signedArea(cut) <= 0 ||
    !sewing.every((point) => pointInPolygon(point, cut))
  )
    return false;
  const boundary = ring(cut);
  const inner = ring(sewing);
  if (new Set(boundary.map((point) => point.join(','))).size !== boundary.length) return false;
  return boundary.every((a, i) => {
    const next = (i + 1) % boundary.length;
    const b = boundary[next]!;
    return (
      boundary.every((c, j) => {
        const after = (j + 1) % boundary.length;
        if (next === j) return sign(a, b, boundary[after]!) !== 0;
        return i === j || i === after || !meets(a, b, c, boundary[after]!);
      }) && inner.every((c, j) => !meets(a, b, c, inner[(j + 1) % inner.length]!))
    );
  });
}

function inspect(
  inputCut: readonly PtMm[],
  inputSewing: readonly PtMm[],
  corner: AuthoredAllowanceCorner,
): Join | null {
  const { sewing: triple, widthMm, variant } = corner;
  const cut = closedWithoutRepeat(inputCut),
    sewing = closedWithoutRepeat(inputSewing);
  if (
    sewing.length !== 4 ||
    (cut.length !== 4 && cut.length !== 5) ||
    !isStrictlyConvexRing(sewing) ||
    !(isFoldback(variant) ? enclosesSewing(cut, sewing) : isStrictlyConvexRing(cut, sewing)) ||
    !isAuthoredAllowanceCornerVariant(variant) ||
    !exact(widthMm) ||
    !triple.every(({ x, y }) => exact(x) && exact(y))
  )
    return null;
  const [a, p, b] = triple;
  const matches = sewing.flatMap((q, i) =>
    same(q, p) && same(sewing[(i + 3) % 4]!, a) && same(sewing[(i + 1) % 4]!, b) ? [i] : [],
  );
  if (matches.length !== 1) return null;
  const incoming = axis(a, p),
    outgoing = axis(p, b);
  const before = allowanceSupport(p, subtract(p, a), widthMm);
  const after = allowanceSupport(p, subtract(b, p), widthMm);
  const meetPoint = meet(before, after);
  if (!meetPoint || Math.hypot(meetPoint.x - p.x, meetPoint.y - p.y) > MITER_LIMIT * widthMm)
    return null;
  const rounded = (ring: PtMm[]) =>
    ring.map(({ x, y }) => ({ x: grid(x) / units, y: grid(y) / units }));
  const mitre = rounded([meetPoint]);
  const join = (kind: 'square' | 'clip') => {
    const points = offsetNativeOrthogonalAllowanceCornerV1(sewing, matches[0]!, widthMm, kind);
    return points && rounded(points);
  };
  const fold = (beforeEdge: boolean) => {
    const points = foldback(p, before, after, widthMm, beforeEdge);
    return points && rounded(points);
  };
  const axial = incoming && outgoing && incoming !== outgoing;
  const perpendicular = before.along.x * after.along.x + before.along.y * after.along.y === 0;
  const joins = {
    auto: mitre,
    mitre,
    square: axial ? join('square') ?? undefined : undefined,
    clip: axial ? join('clip') ?? undefined : undefined,
    'foldback-before': perpendicular ? mitre : fold(true),
    'foldback-after': perpendicular ? mitre : fold(false),
  };
  const points = joins[variant];
  if (!points || cut.length !== 3 + points.length) return null;
  const onSupport = (point: PtMm, support: Support, constant: 'x' | 'y' | null) =>
    constant
      ? point[constant] === mitre[0]![constant]
      : Math.abs(cross(subtract(point, support.at), support.along)) <= 1 / units;
  const starts = cut.flatMap((_, i) => {
    const prev = cut[(i + cut.length - 1) % cut.length]!;
    const next = cut[(i + points.length) % cut.length]!;
    return onSupport(prev, before, incoming) &&
      onSupport(next, after, outgoing) &&
      points.every((q, j) => same(q, cut[(i + j) % cut.length]!))
      ? [i]
      : [];
  });
  return starts.length === 1 ? { cut, start: starts[0]!, points, joins } : null;
}

/** Pair the saved authoring record with the exact single current native L1/L14 occurrence. */
export function matchesAuthoredAllowanceCorner(
  cut: readonly PtMm[],
  sewing: readonly PtMm[],
  corner: AuthoredAllowanceCorner,
  exactRead = true,
): boolean {
  if (exactRead) return !!inspect(cut, sewing, corner);
  const wire = (points: readonly PtMm[]) =>
    points.map(({ x, y }) => ({ x: grid(x) / units, y: grid(y) / units }));
  return !!inspect(wire(cut), wire(sewing), corner);
}

/** Only the one piecewise-linear allowance join changes. */
export function editAuthoredAllowanceCorner(
  cut: readonly PtMm[],
  sewing: readonly PtMm[],
  previous: AuthoredAllowanceCorner,
  variant: AuthoredAllowanceCornerVariant,
): PtMm[] | null {
  if (variant === previous.variant || !isAuthoredAllowanceCornerVariant(variant)) return null;
  const native = inspect(cut, sewing, previous);
  if (!native) return null;
  const { cut: ring, start, points, joins } = native;
  const next = joins[variant];
  if (!next) return null;
  const result =
    start + points.length <= ring.length
      ? [...ring.slice(0, start), ...next, ...ring.slice(start + points.length)]
      : [...next, ...ring.slice((start + points.length) % ring.length, start)];
  return inspect(result, sewing, { ...previous, variant }) ? result : null;
}
