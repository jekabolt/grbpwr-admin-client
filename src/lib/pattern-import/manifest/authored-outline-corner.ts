import {
  authoredInternalVertices,
  authoredQuadraticGrid,
  sampleAuthoredQuadratic,
  decodeAuthoredQuadratic,
} from './authored-internal';
import type { AuthoredQuadraticGrid, ManifestAuthoredInsetOutlineCorner, PtMm } from '../types';
import { pointInPolygon, selfIntersects } from '../semantics/geom';
import { MITER_LIMIT, OFFSET_SCALE, offsetContour } from '../semantics/offset';

export function validDraftCornerSetbackV1(value: number) {
  return Number.isFinite(value) && value >= 1 && Number(value.toFixed(6)) === value;
}

type WirePoint = Readonly<{ x: bigint; y: bigint }>;

function wirePoint({ x, y }: PtMm): WirePoint | null {
  const [gx, gy] = authoredInternalVertices([{ x, y }]);
  return Number.isSafeInteger(gx) && Number.isSafeInteger(gy) && gx! / 1e6 === x && gy! / 1e6 === y
    ? { x: BigInt(gx!), y: BigInt(gy!) }
    : null;
}

const vector = (from: WirePoint, to: WirePoint) => ({ x: to.x - from.x, y: to.y - from.y });
const cross = (u: WirePoint, v: WirePoint) => u.x * v.y - u.y * v.x;
const normSq = ({ x, y }: WirePoint) => x * x + y * y;
const abs = (value: bigint) => (value < 0n ? -value : value);

function strictlyConvexWireRing(ring: readonly WirePoint[]) {
  const direction = cross(vector(ring[0]!, ring[1]!), vector(ring[0]!, ring[2]!)) >= 0n ? 1n : -1n;
  const contains = (a: WirePoint, b: WirePoint, p: WirePoint) =>
    direction * cross(vector(a, b), vector(a, p));
  if (
    !ring.every((current, index) => {
      const next = ring[(index + 1) % ring.length]!;
      const previous = ring[(index + ring.length - 1) % ring.length]!;
      const incoming = vector(previous, current),
        outgoing = vector(current, next);
      const turn = cross(incoming, outgoing);
      // One-millimetre minimum rails and a lower bound on the sine of each turn (1/1000).
      return (
        normSq(outgoing) >= 1_000_000_000_000n &&
        turn * turn * 1_000_000n >= normSq(incoming) * normSq(outgoing) &&
        ring.every(
          (point, i) =>
            i === index || i === (index + 1) % ring.length || contains(current, next, point) > 0n,
        )
      );
    })
  )
    return null;
  return (point: WirePoint) =>
    ring.every((a, i) => contains(a, ring[(i + 1) % ring.length]!, point) >= 0n);
}

/** The existing wire controls bind a single tangent corner with perpendicular grid-aligned rails. */
export function roundDraftConvexOrthogonalCornerV1(
  ring: readonly PtMm[],
  index: number,
  setbackMm: number,
) {
  return roundedCorner(ring, index, setbackMm, setbackMm);
}

function roundedCorner(
  ring: readonly PtMm[],
  index: number,
  startSetbackMm: number,
  endSetbackMm: number,
) {
  if (
    (ring.length !== 4 && ring.length !== 5) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= ring.length ||
    !validDraftCornerSetbackV1(startSetbackMm) ||
    !validDraftCornerSetbackV1(endSetbackMm)
  )
    return null;
  const wire = ring.map(wirePoint);
  if (!wire.every((point): point is WirePoint => point !== null)) return null;
  const contains = strictlyConvexWireRing(wire);
  if (!contains) return null;
  const corner = wire[index]!;
  const before = vector(corner, wire[(index + wire.length - 1) % wire.length]!);
  const after = vector(corner, wire[(index + 1) % wire.length]!);
  if (
    (before.x === 0n) === (after.x === 0n) ||
    (before.x !== 0n && before.y !== 0n) ||
    (after.x !== 0n && after.y !== 0n)
  )
    return null;
  const startSetback = wirePoint({ x: startSetbackMm, y: 0 })?.x;
  const endSetback = wirePoint({ x: endSetbackMm, y: 0 })?.x;
  if (
    !startSetback ||
    !endSetback ||
    abs(before.x) + abs(before.y) < 3n * startSetback ||
    abs(after.x) + abs(after.y) < 3n * endSetback
  )
    return null;
  const trim = (d: WirePoint, setback: bigint): PtMm => ({
    x: Number(corner.x + (d.x === 0n ? 0n : d.x > 0n ? setback : -setback)) / 1e6,
    y: Number(corner.y + (d.y === 0n ? 0n : d.y > 0n ? setback : -setback)) / 1e6,
  });
  const controls = authoredQuadraticGrid([
    trim(before, startSetback),
    ring[index]!,
    trim(after, endSetback),
  ]);
  const samples = controls && sampleAuthoredQuadratic(controls);
  if (
    !controls ||
    !samples ||
    !samples.every((sample) => {
      const point = wirePoint(sample);
      return point && contains(point);
    })
  )
    return null;
  return { controls, samples, ring: ring.flatMap((point, i) => (i === index ? samples : [point])) };
}

function orthogonalControls(value: unknown) {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(Number.isSafeInteger))
    return null;
  const [sx, sy, cx, cy, ex, ey] = value;
  const first = sx === cx ? Math.abs(sy - cy) : sy === cy ? Math.abs(sx - cx) : 0;
  const second = ex === cx ? Math.abs(ey - cy) : ey === cy ? Math.abs(ex - cx) : 0;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(second) ||
    first < 1_000_000 ||
    second < 1_000_000 ||
    (sx === cx) === (ex === cx)
  )
    return null;
  const grid: AuthoredQuadraticGrid = [sx, sy, cx, cy, ex, ey];
  return { grid, startSetbackMm: first / 1e6, endSetbackMm: second / 1e6 };
}

export function parseAuthoredOutlineCorner(value: unknown): AuthoredQuadraticGrid | null {
  const control = orthogonalControls(value);
  return control && control.startSetbackMm === control.endSetbackMm ? control.grid : null;
}

export function parseAuthoredFixedEndOutlineCorner(value: unknown): AuthoredQuadraticGrid | null {
  const control = orthogonalControls(value);
  return control && control.startSetbackMm !== control.endSetbackMm ? control.grid : null;
}

function validInsetWidth(widthMm: unknown): widthMm is number {
  return typeof widthMm === 'number' && widthMm > 0 && Number.isSafeInteger(widthMm * OFFSET_SCALE);
}

export function parseAuthoredInsetOutlineCorner(
  value: unknown,
): ManifestAuthoredInsetOutlineCorner | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const marker = value as Record<string, unknown>;
  const corner = orthogonalControls(marker.controls);
  return Object.keys(marker).length === 2 && corner && validInsetWidth(marker.widthMm)
    ? { controls: corner.grid, widthMm: marker.widthMm }
    : null;
}

/** The offset owner owns the sewing vertices. A collapse to a simpler contour is unsupported. */
export function deriveAuthoredInsetOutline(cut: readonly PtMm[], widthMm: number): PtMm[] | null {
  if (
    !validInsetWidth(widthMm) ||
    cut.length < 3 ||
    !cut.every(wirePoint) ||
    cut.some(
      ({ x, y }) =>
        ![x, y].every((v) =>
          Number.isSafeInteger(Math.round((Math.abs(v) + MITER_LIMIT * widthMm) * OFFSET_SCALE)),
        ),
    )
  )
    return null;
  const offset = offsetContour(cut, -widthMm);
  return offset.report.ok &&
    offset.pts.length === cut.length &&
    !selfIntersects(offset.pts) &&
    offset.pts.every((point) => pointInPolygon(point, cut))
    ? offset.pts
    : null;
}

function readCorner(ring: readonly PtMm[], grid: AuthoredQuadraticGrid) {
  const control = orthogonalControls(grid);
  if (!control) return null;
  const { startSetbackMm, endSetbackMm } = control;
  const samples = sampleAuthoredQuadratic(grid);
  if (!samples || ![3, 4].includes(ring.length - samples.length)) return null;
  const fixed = authoredInternalVertices(ring);
  const expected = authoredInternalVertices(samples);
  const matches = ring.flatMap((_, i) =>
    expected.every((value, j) => fixed[i * 2 + j] === value) ? [i] : [],
  );
  if (matches.length !== 1) return null;
  const start = matches[0]!;
  const controls = decodeAuthoredQuadratic(grid);
  const local = ring.map((_, i) => ({ x: fixed[i * 2]! / 1e6, y: fixed[i * 2 + 1]! / 1e6 }));
  const originalOutline = [
    ...local.slice(0, start),
    controls[1],
    ...local.slice(start + samples.length),
  ];
  const rebuilt = roundedCorner(originalOutline, start, startSetbackMm, endSetbackMm);
  if (!rebuilt || !rebuilt.controls.every((v, i) => v === grid[i])) return null;
  return { start, sampleCount: samples.length, startSetbackMm, endSetbackMm, originalOutline };
}

export function readAuthoredOutlineCornerSetbacks(grid: AuthoredQuadraticGrid) {
  const control = orthogonalControls(grid);
  return control ? { start: control.startSetbackMm, end: control.endSetbackMm } : null;
}

/** Existing linked-setback editor remains bound to equal controls. */
export function readAuthoredOutlineCorner(ring: readonly PtMm[], grid: AuthoredQuadraticGrid) {
  const corner = readCorner(ring, grid);
  if (!corner || corner.startSetbackMm !== corner.endSetbackMm) return null;
  const { start, sampleCount, startSetbackMm: setbackMm, originalOutline } = corner;
  return { start, sampleCount, setbackMm, originalOutline };
}

function readPairedOutline(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
) {
  if (cut.length !== seam.length) return null;
  const c = authoredInternalVertices(cut),
    s = authoredInternalVertices(seam);
  return c.every((value, i) => value === s[i]) ? readCorner(cut, grid) : null;
}

/** Exact native block verification with only winding/cyclic start normalization. */
export function readNativeInsetAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
  widthMm: number,
) {
  const corner = readCorner(cut, grid);
  const inset = corner && deriveAuthoredInsetOutline(cut, widthMm);
  if (!inset || inset.length !== seam.length || !seam.every(wirePoint)) return null;
  const equal = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;
  const start = inset.findIndex((point) => equal(seam[0]!, point));
  return start >= 0 &&
    (seam.every((p, i) => equal(p, inset[(start + i) % inset.length]!)) ||
      seam.every((p, i) => equal(p, inset[(start - i + inset.length) % inset.length]!)))
    ? corner
    : null;
}

export function readPairedAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
  insetWidthMm?: number,
) {
  const corner =
    insetWidthMm === undefined
      ? readPairedOutline(cut, seam, grid)
      : readNativeInsetAuthoredOutlineCorner(cut, seam, grid, insetWidthMm);
  if (!corner) return null;
  const { start, sampleCount, startSetbackMm: setbackMm, originalOutline } = corner;
  return { start, sampleCount, setbackMm, originalOutline };
}

/** Signed native DXF entities must already be on the wire grid before any coordinate transform. */
export function readNativePairedAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
) {
  if (!cut.every(wirePoint) || !seam.every(wirePoint)) return null;
  return readPairedAuthoredOutlineCorner(cut, seam, grid);
}

/** Replays the existing corner before moving exactly one endpoint on its original support. */
export function editFixedEndAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
  fixedEnd: 'start' | 'end',
  movingSetbackMm: number,
  insetWidthMm?: number,
) {
  if (
    (fixedEnd !== 'start' && fixedEnd !== 'end') ||
    !cut.every(wirePoint) ||
    !seam.every(wirePoint)
  )
    return null;
  const corner =
    insetWidthMm === undefined
      ? readPairedOutline(cut, seam, grid)
      : readNativeInsetAuthoredOutlineCorner(cut, seam, grid, insetWidthMm);
  if (!corner) return null;
  const { start, startSetbackMm, endSetbackMm, originalOutline } = corner;
  if (movingSetbackMm === (fixedEnd === 'start' ? endSetbackMm : startSetbackMm)) return null;
  return roundedCorner(
    originalOutline,
    start,
    fixedEnd === 'start' ? startSetbackMm : movingSetbackMm,
    fixedEnd === 'end' ? endSetbackMm : movingSetbackMm,
  );
}
