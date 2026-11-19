import {
  authoredInternalVertices,
  authoredQuadraticGrid,
  sampleAuthoredQuadratic,
  decodeAuthoredQuadratic,
} from './authored-internal';
import type { AuthoredQuadraticGrid, PtMm } from '../types';

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
  if (
    (ring.length !== 4 && ring.length !== 5) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= ring.length ||
    !validDraftCornerSetbackV1(setbackMm)
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
  const setback = wirePoint({ x: setbackMm, y: 0 })?.x;
  if (!setback || [before, after].some(({ x, y }) => abs(x) + abs(y) < 3n * setback)) return null;
  const trim = (d: WirePoint): PtMm => ({
    x: Number(corner.x + (d.x === 0n ? 0n : d.x > 0n ? setback : -setback)) / 1e6,
    y: Number(corner.y + (d.y === 0n ? 0n : d.y > 0n ? setback : -setback)) / 1e6,
  });
  const controls = authoredQuadraticGrid([trim(before), ring[index]!, trim(after)]);
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

export function parseAuthoredOutlineCorner(value: unknown): AuthoredQuadraticGrid | null {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(Number.isSafeInteger))
    return null;
  const [sx, sy, cx, cy, ex, ey] = value;
  const first = sx === cx ? Math.abs(sy - cy) : sy === cy ? Math.abs(sx - cx) : 0;
  const second = ex === cx ? Math.abs(ey - cy) : ey === cy ? Math.abs(ex - cx) : 0;
  return Number.isSafeInteger(first) &&
    first >= 1_000_000 &&
    first === second &&
    (sx === cx) !== (ex === cx)
    ? [sx, sy, cx, cy, ex, ey]
    : null;
}

/** This lookup only admits the single exact, ordered rounded span on its reconstructed original outline. */
export function readAuthoredOutlineCorner(ring: readonly PtMm[], grid: AuthoredQuadraticGrid) {
  if (!parseAuthoredOutlineCorner(grid)) return null;
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
  const setbackMm = Math.abs(grid[0] - grid[2] + grid[1] - grid[3]) / 1e6;
  const rebuilt = roundDraftConvexOrthogonalCornerV1(originalOutline, start, setbackMm);
  if (!rebuilt?.controls || !rebuilt.controls.every((v, i) => v === grid[i])) return null;
  return {
    start,
    sampleCount: samples.length,
    setbackMm,
    originalOutline,
  };
}

export function readPairedAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
) {
  const corner = readAuthoredOutlineCorner(cut, grid);
  if (!corner || cut.length !== seam.length) return null;
  const c = authoredInternalVertices(cut),
    s = authoredInternalVertices(seam);
  return c.every((v, i) => v === s[i]) ? corner : null;
}

/** Signed native DXF entities must already be on the wire grid before any coordinate transform. */
export function readNativePairedAuthoredOutlineCorner(
  cut: readonly PtMm[],
  seam: readonly PtMm[],
  grid: AuthoredQuadraticGrid,
) {
  const isWirePoint = ({ x, y }: PtMm) =>
    [x, y].every((value) => Number.isFinite(value) && Number(value.toFixed(6)) === value);
  if (!cut.every(isWirePoint) || !seam.every(isWirePoint)) return null;
  return readPairedAuthoredOutlineCorner(cut, seam, grid);
}
