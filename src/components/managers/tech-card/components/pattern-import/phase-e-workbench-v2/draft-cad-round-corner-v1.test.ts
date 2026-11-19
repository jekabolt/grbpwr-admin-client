import { expect, it } from 'vitest';
import { roundDraftRectangularCornerV1 } from './draft-cad-round-corner-v1';

const ring = [
  { x: 260.000076, y: 0 },
  { x: 305.280573, y: 0 },
  { x: 305.280573, y: 36.224397 },
  { x: 260.000076, y: 36.224397 },
];

it('rounds one signed-grid rectangle corner with paired tangent setbacks in either winding', () => {
  const forward = roundDraftRectangularCornerV1(ring, 2, 4);
  const backward = roundDraftRectangularCornerV1(ring.slice().reverse(), 1, 4);
  expect(forward?.controls).toEqual([
    305280573, 32224397, 305280573, 36224397, 301280573, 36224397,
  ]);
  expect(forward?.samples[0]).toEqual({ x: 305.280573, y: 32.224397 });
  expect(forward?.samples.at(-1)).toEqual({ x: 301.280573, y: 36.224397 });
  expect(forward?.ring).toHaveLength(12);
  expect(forward?.ring.slice(0, 2)).toEqual(ring.slice(0, 2));
  expect(forward?.ring.at(-1)).toEqual(ring.at(-1));
  expect(backward?.ring).toEqual(forward?.ring.slice().reverse());
});

it('refuses a rotated or tapered rail, missing corner and setback outside the supported range', () => {
  const rotated = [
    { x: 0, y: 4 },
    { x: 4, y: 0 },
    { x: 8, y: 4 },
    { x: 4, y: 8 },
  ];
  expect(roundDraftRectangularCornerV1(rotated, 2, 1)).toBeNull();
  const tapered = ring.map((p, i) => (i === 1 ? { ...p, x: p.x - 0.000001 } : p));
  expect(roundDraftRectangularCornerV1(tapered, 2, 4)).toBeNull();
  expect(roundDraftRectangularCornerV1(ring, 2.5, 4)).toBeNull();
  expect(roundDraftRectangularCornerV1(ring, 2, 0.999999)).toBeNull();
  expect(roundDraftRectangularCornerV1(ring, 2, 12.1)).toBeNull();
  expect(roundDraftRectangularCornerV1(ring, 2, 4.0000001)).toBeNull();
});
