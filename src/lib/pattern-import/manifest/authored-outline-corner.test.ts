import { describe, expect, it } from 'vitest';
import {
  parseAuthoredOutlineCorner,
  readAuthoredOutlineCorner,
  readNativePairedAuthoredOutlineCorner,
  roundDraftConvexOrthogonalCornerV1,
} from './authored-outline-corner';

const rectangle = [
  { x: 260.000076, y: 0 },
  { x: 305.280573, y: 0 },
  { x: 305.280573, y: 36.224397 },
  { x: 260.000076, y: 36.224397 },
];

function roundedCorner() {
  const corner = roundDraftConvexOrthogonalCornerV1(rectangle, 2, 4);
  if (!corner?.controls) throw new Error('Fixture could not round');
  return { ...corner, controls: corner.controls };
}

describe('a signed linked outline corner', () => {
  it('requires an explicit marker and reconstructs its unique original corner', () => {
    const { controls, ring } = roundedCorner();
    expect(parseAuthoredOutlineCorner(undefined)).toBeNull();
    expect(parseAuthoredOutlineCorner(controls)).toEqual(controls);
    expect(readNativePairedAuthoredOutlineCorner(ring, ring, controls)).toEqual({
      start: 2,
      sampleCount: 9,
      setbackMm: 4,
      originalOutline: rectangle,
    });
    expect(readAuthoredOutlineCorner(rectangle, controls)).toBeNull();
    expect(readAuthoredOutlineCorner([...ring].reverse(), controls)).toBeNull();
  });

  it('refuses stale geometry, unequal paired samples, and altered controls', () => {
    const { controls, ring } = roundedCorner();
    const shifted = ring.map((point, index) =>
      index === 5 ? { ...point, x: point.x + 0.0000001 } : point,
    );
    expect(readNativePairedAuthoredOutlineCorner(ring, shifted, controls)).toBeNull();
    expect(readNativePairedAuthoredOutlineCorner(shifted, shifted, controls)).toBeNull();
    const alternate = roundDraftConvexOrthogonalCornerV1(rectangle, 2, 6)?.controls;
    if (!alternate) throw new Error('Fixture could not round a second setback');
    expect(readNativePairedAuthoredOutlineCorner(ring, ring, alternate)).toBeNull();
    const invalidControl = [...controls];
    invalidControl[2]! += 1;
    expect(parseAuthoredOutlineCorner(invalidControl)).toBeNull();
  });
});
