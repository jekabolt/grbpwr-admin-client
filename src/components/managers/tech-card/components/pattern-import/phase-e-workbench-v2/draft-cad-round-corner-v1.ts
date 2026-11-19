import {
  authoredQuadraticGrid,
  sampleAuthoredQuadratic,
} from 'lib/pattern-import/manifest/authored-internal';
import type { PtMm } from 'lib/pattern-import/types';

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
