import { expect, it } from 'vitest';
import { readNativePairedAuthoredOutlineCorner } from 'lib/pattern-import/manifest/authored-outline-corner';
import { roundDraftConvexOrthogonalCornerV1 } from './draft-cad-round-corner-v1';

const ring = [
  { x: 260.000076, y: 0 },
  { x: 305.280573, y: 0 },
  { x: 305.280573, y: 36.224397 },
  { x: 260.000076, y: 36.224397 },
];

it('rounds one signed-grid rectangle corner with paired tangent setbacks in either winding', () => {
  const forward = roundDraftConvexOrthogonalCornerV1(ring, 2, 4);
  const backward = roundDraftConvexOrthogonalCornerV1(ring.slice().reverse(), 1, 4);
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
  expect(roundDraftConvexOrthogonalCornerV1(rotated, 2, 1)).toBeNull();
  const tapered = ring.map((p, i) => (i === 1 ? { ...p, x: p.x - 0.000001 } : p));
  expect(roundDraftConvexOrthogonalCornerV1(tapered, 2, 4)).toBeNull();
  expect(roundDraftConvexOrthogonalCornerV1(ring, 2.5, 4)).toBeNull();
  expect(roundDraftConvexOrthogonalCornerV1(ring, 2, 0.999999)).toBeNull();
  expect(roundDraftConvexOrthogonalCornerV1(ring, 2, 12.1)).toBeNull();
  expect(roundDraftConvexOrthogonalCornerV1(ring, 2, 4.0000001)).toBeNull();
});

const pen = [
  { x: 260.000076, y: 0 },
  { x: 300.752523, y: 0 },
  { x: 305.280573, y: 18.112199 },
  { x: 300.752523, y: 36.224397 },
  { x: 260.000076, y: 36.224397 },
];

it('retains the four untouched vertices of a convex Pen outline and replays its linked control', () => {
  const rounded = roundDraftConvexOrthogonalCornerV1(pen, 4, 4);
  expect(rounded).not.toBeNull();
  if (!rounded) throw Error('Missing rounded corner');
  expect(rounded.controls).toEqual([264000076, 36224397, 260000076, 36224397, 260000076, 32224397]);
  expect(rounded.ring.slice(0, 4)).toEqual(pen.slice(0, 4));
  expect(rounded.ring).toHaveLength(13);
  const saved = readNativePairedAuthoredOutlineCorner(rounded.ring, rounded.ring, rounded.controls);
  expect(saved).toEqual({ start: 4, sampleCount: 9, setbackMm: 4, originalOutline: pen });
  expect(
    roundDraftConvexOrthogonalCornerV1(saved!.originalOutline, saved!.start, 6)?.controls,
  ).toEqual([266000076, 36224397, 260000076, 36224397, 260000076, 30224397]);
});

it('refuses nonorthogonal, concave, crossed, almost-flat and off-grid outlines', () => {
  expect(roundDraftConvexOrthogonalCornerV1(pen, 2, 4)).toBeNull();
  const [a, b, c, d, e] = pen;
  const concave = [a!, b!, { ...c!, x: 280 }, d!, e!];
  const crossing = [a!, c!, b!, d!, e!];
  const flat = [a!, b!, { ...c!, x: 300.753 }, d!, e!];
  const offGrid = [a!, b!, { ...c!, x: c!.x + 0.0000001 }, d!, e!];
  for (const unsafe of [concave, crossing, flat, offGrid])
    expect(roundDraftConvexOrthogonalCornerV1(unsafe, 4, 4)).toBeNull();
});
