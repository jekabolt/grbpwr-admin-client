import { describe, expect, it } from 'vitest';
import {
  editFixedEndAuthoredOutlineCorner,
  parseAuthoredFixedEndOutlineCorner,
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

it('moves either endpoint on its exact support while retaining the other endpoint and all other vertices', () => {
  const { controls, ring } = roundedCorner();
  const keepStart = editFixedEndAuthoredOutlineCorner(ring, ring, controls, 'start', 6);
  const keepEnd = editFixedEndAuthoredOutlineCorner(ring, ring, controls, 'end', 6);
  expect(keepStart?.controls).toEqual([
    305280573, 32224397, 305280573, 36224397, 299280573, 36224397,
  ]);
  expect(keepEnd?.controls).toEqual([
    305280573, 30224397, 305280573, 36224397, 301280573, 36224397,
  ]);
  expect(keepStart?.ring.slice(0, 2)).toEqual(rectangle.slice(0, 2));
  expect(keepStart?.ring.at(-1)).toEqual(rectangle.at(-1));
  expect(keepEnd?.ring.slice(0, 2)).toEqual(rectangle.slice(0, 2));
  expect(keepEnd?.ring.at(-1)).toEqual(rectangle.at(-1));
  for (const edit of [keepStart, keepEnd]) {
    expect(parseAuthoredOutlineCorner(edit?.controls)).toBeNull();
    expect(parseAuthoredFixedEndOutlineCorner(edit?.controls)).toEqual(edit?.controls);
    expect(readAuthoredOutlineCorner(edit!.ring, edit!.controls)).toBeNull();
    expect(
      readNativePairedAuthoredOutlineCorner(edit!.ring, edit!.ring, edit!.controls),
    ).toBeTruthy();
  }
  const noMove = editFixedEndAuthoredOutlineCorner(ring, ring, controls, 'start', 4);
  expect(noMove).toBeNull();
  expect(editFixedEndAuthoredOutlineCorner(ring, ring, controls, 'end', 13)).toBeNull();
  const drift = ring.map((p, i) => (i === 2 ? { ...p, x: p.x + 0.0000001 } : p));
  expect(editFixedEndAuthoredOutlineCorner(ring, drift, controls, 'end', 6)).toBeNull();
});
