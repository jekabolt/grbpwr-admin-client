import type {
  AuthoredAllowanceCorner,
  AuthoredAllowanceCornerVariant,
  ManifestAuthoredAllowanceCorner,
  PtMm,
} from '../types';
import { signedArea } from '../semantics/geom';
import { offsetNativeOrthogonalAllowanceCornerV1 } from '../semantics/offset';

const units = 1_000_000;
const grid = (value: number) => Math.round(Number(value.toFixed(6)) * units);
const exact = (value: number) => Number.isSafeInteger(grid(value)) && grid(value) / units === value;
const same = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;
const closedWithoutRepeat = (points: readonly PtMm[]) =>
  points.length > 1 && same(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;
const axis = (a: PtMm, b: PtMm) =>
  a.x === b.x && a.y !== b.y ? 'x' : a.y === b.y && a.x !== b.x ? 'y' : null;

export function isAuthoredAllowanceCornerVariant(
  value: unknown,
): value is AuthoredAllowanceCornerVariant {
  return value === 'auto' || value === 'mitre' || value === 'square';
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
  const incoming = axis(a, b),
    outgoing = axis(b, c);
  return incoming && outgoing && incoming !== outgoing ? marker : null;
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

type Join = { cut: readonly PtMm[]; start: number; points: PtMm[]; mitre: PtMm[]; square: PtMm[] };

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
    cut.length !== (variant === 'square' ? 5 : 4) ||
    !isStrictlyConvexRing(sewing) ||
    !isStrictlyConvexRing(cut, sewing) ||
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
  if (!incoming || !outgoing || incoming === outgoing) return null;
  const join = (square: boolean) =>
    offsetNativeOrthogonalAllowanceCornerV1(sewing, matches[0]!, widthMm, square)?.map(
      ({ x, y }) => ({ x: grid(x) / units, y: grid(y) / units }),
    );
  const mitre = join(false),
    square = join(true);
  if (mitre?.length !== 1 || square?.length !== 2) return null;
  const [tip] = mitre;
  const points = variant === 'square' ? square : mitre;
  const starts = cut.flatMap((_, i) => {
    const prev = cut[(i + cut.length - 1) % cut.length]!;
    const next = cut[(i + points.length) % cut.length]!;
    return prev[incoming] === tip![incoming] &&
      next[outgoing] === tip![outgoing] &&
      points.every((q, j) => same(q, cut[(i + j) % cut.length]!))
      ? [i]
      : [];
  });
  return starts.length === 1 ? { cut, start: starts[0]!, points, mitre, square } : null;
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
  const { cut: ring, start, points, mitre, square } = native;
  const next = variant === 'square' ? square : mitre;
  const result =
    start + points.length <= ring.length
      ? [...ring.slice(0, start), ...next, ...ring.slice(start + points.length)]
      : [...next, ...ring.slice((start + points.length) % ring.length, start)];
  return inspect(result, sewing, { ...previous, variant }) ? result : null;
}
