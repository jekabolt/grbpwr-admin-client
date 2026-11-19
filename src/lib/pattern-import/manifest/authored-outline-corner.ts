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

/** A bounded quadratic tangent to both rails of an exact rectangular outline. */
export function roundDraftRectangularCornerV1(
  ring: readonly PtMm[],
  index: number,
  setbackMm: number,
) {
  if (
    ring.length !== 4 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 4 ||
    !validDraftCornerSetbackV1(setbackMm)
  )
    return null;
  const xs = ring.map(({ x }) => x),
    ys = ring.map(({ y }) => y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  if (
    new Set(ring.map(({ x, y }) => `${x},${y}`)).size !== 4 ||
    !ring.every(({ x, y }, i) => {
      const next = ring[(i + 1) % 4]!;
      return (
        [x, y].every((value) => Number.isFinite(value) && Number(value.toFixed(6)) === value) &&
        (x === minX || x === maxX) &&
        (y === minY || y === maxY) &&
        (x === next.x || y === next.y)
      );
    }) ||
    setbackMm * 3 > Math.min(maxX - minX, maxY - minY)
  )
    return null;

  const corner = ring[index]!;
  const trimToward = (neighbor: PtMm): PtMm => ({
    x: Number((corner.x + Math.sign(neighbor.x - corner.x) * setbackMm).toFixed(6)),
    y: Number((corner.y + Math.sign(neighbor.y - corner.y) * setbackMm).toFixed(6)),
  });
  const start = trimToward(ring[(index + 3) % 4]!);
  const end = trimToward(ring[(index + 1) % 4]!);
  const controls = authoredQuadraticGrid([start, corner, end]);
  const samples = controls && sampleAuthoredQuadratic(controls);
  return (
    samples && {
      controls,
      samples,
      ring: ring.flatMap((point, i) => (i === index ? samples : [point])),
    }
  );
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

/** This lookup only admits the single exact, ordered rounded span on its original rectangle. */
export function readAuthoredOutlineCorner(ring: readonly PtMm[], grid: AuthoredQuadraticGrid) {
  if (!parseAuthoredOutlineCorner(grid)) return null;
  const samples = sampleAuthoredQuadratic(grid);
  if (!samples || ring.length !== samples.length + 3) return null;
  const fixed = authoredInternalVertices(ring);
  const expected = authoredInternalVertices(samples);
  const matches = ring.flatMap((_, i) =>
    expected.every((value, j) => fixed[i * 2 + j] === value) ? [i] : [],
  );
  if (matches.length !== 1) return null;
  const start = matches[0]!;
  const controls = decodeAuthoredQuadratic(grid);
  const local = ring.map((_, i) => ({ x: fixed[i * 2]! / 1e6, y: fixed[i * 2 + 1]! / 1e6 }));
  const rectangle = [...local.slice(0, start), controls[1], ...local.slice(start + samples.length)];
  const setbackMm = Math.abs(grid[0] - grid[2] + grid[1] - grid[3]) / 1e6;
  const rebuilt = roundDraftRectangularCornerV1(rectangle, start, setbackMm);
  if (!rebuilt?.controls || !rebuilt.controls.every((v, i) => v === grid[i])) return null;
  return {
    start,
    sampleCount: samples.length,
    setbackMm,
    rectangle,
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
