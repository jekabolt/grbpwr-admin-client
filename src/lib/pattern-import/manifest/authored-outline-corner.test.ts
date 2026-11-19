import { describe, expect, it } from 'vitest';
import { readDxf } from '../adapters/dxf/extract';
import { segmentDxf } from '../adapters/dxf/segment';
import { squareSpec } from '../gate';
import { areaOf, bboxOf } from '../semantics/geom';
import type { WriteJob } from '../types';
import { writeDxfDetailed } from '../write';
import { decodeAuthoredQuadratic } from './authored-internal';
import { embedManifest } from './index';
import {
  deriveAuthoredInsetOutline,
  editFixedEndAuthoredOutlineCorner,
  parseAuthoredFixedEndOutlineCorner,
  parseAuthoredInsetOutlineCorner,
  parseAuthoredOutlineCorner,
  readAuthoredOutlineCorner,
  readNativePairedAuthoredOutlineCorner,
  readNativeInsetAuthoredOutlineCorner,
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

it('keeps one cut endpoint and verifies the regenerated sewing ring at a positive width', () => {
  const cut = [
    { x: 320.000137, y: 0 },
    { x: 320.000137, y: 220 },
    { x: 260.000076, y: 220 },
    { x: 260.000198, y: 0 },
  ];
  const corner = roundDraftConvexOrthogonalCornerV1(cut, 1, 18)!;
  const seam = deriveAuthoredInsetOutline(corner.ring, 10)!;
  const edited = editFixedEndAuthoredOutlineCorner(
    corner.ring,
    seam,
    corner.controls,
    'start',
    19,
    10,
  )!;
  const nextSeam = deriveAuthoredInsetOutline(edited.ring, 10)!;
  const marker = { controls: edited.controls, widthMm: 10 };
  expect(parseAuthoredInsetOutlineCorner(marker)).toEqual(marker);
  expect(parseAuthoredInsetOutlineCorner({ ...marker, widthMm: 0 })).toBeNull();
  expect(parseAuthoredInsetOutlineCorner({ ...marker, widthMm: 10.0001 })).toBeNull();
  expect(parseAuthoredInsetOutlineCorner({ ...marker, unknown: true })).toBeNull();
  expect(edited.controls).toEqual([
    320000137, 202000000, 320000137, 220000000, 301000137, 220000000,
  ]);
  expect(seam).toContainEqual({ x: 310, y: 201.833 });
  expect(nextSeam).toContainEqual({ x: 310, y: 201.836 });
  expect(
    readNativeInsetAuthoredOutlineCorner(edited.ring, [...nextSeam].reverse(), edited.controls, 10),
  ).toBeTruthy();
  expect(readNativeInsetAuthoredOutlineCorner(edited.ring, seam, edited.controls, 10)).toBeNull();
  expect(
    readNativeInsetAuthoredOutlineCorner(edited.ring, nextSeam, edited.controls, 9),
  ).toBeNull();
  const drift = nextSeam.map((p, i) =>
    i ? p : { x: p.x, y: Number((p.y + 0.000001).toFixed(6)) },
  );
  expect(readNativeInsetAuthoredOutlineCorner(edited.ring, drift, edited.controls, 10)).toBeNull();
  expect(deriveAuthoredInsetOutline(roundedCorner().ring, 10)).toBeNull();
});

it.each(['r12', 'r2000'] as const)(
  'preserves a ranked positive inset in native %s entities',
  async (dialect) => {
    const piece = squareSpec();
    piece.ungraded = false;
    piece.fabrics = ['TECH_CARD_BOM_PURPOSE_MAIN'];
    piece.allowance.meaning = 'both';
    const size = piece.sizes[0]!;
    const rounded = roundDraftConvexOrthogonalCornerV1(size.cut, 2, 18)!;
    const seam = deriveAuthoredInsetOutline(rounded.ring, 10)!;
    const edited = editFixedEndAuthoredOutlineCorner(
      rounded.ring,
      seam,
      rounded.controls,
      'start',
      19,
      10,
    )!;
    size.cut = edited.ring;
    size.seam = deriveAuthoredInsetOutline(edited.ring, 10)!;
    size.authoredOutlineCorner = decodeAuthoredQuadratic(edited.controls);
    size.bbox = bboxOf(size.cut);
    size.areaMm2 = areaOf(size.cut);
    const job: WriteJob = {
      dialect,
      techCardId: 169,
      generator: 'grbpwr/pattern-import',
      scope: {
        scopeKey: 'main',
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        bomLineKey: '',
        label: 'Main',
        isInterlining: false,
      },
      sizes: [{ sizeId: 1, token: 'M', rank: 0, name: 'M', sourceLabel: 'M' }],
      pieces: [piece],
      source: {
        files: [],
        sizeEncoding: 'dxf-block',
        variant: null,
        scale: { method: 'declared', factor: 1, declaredMm: null, measuredMm: null },
        sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      },
    };
    const { dxfText, manifest } = writeDxfDetailed(job);
    const block = manifest.blocks[0]!;
    expect(block.authoredInsetOutlineCorner?.controls).toEqual(edited.controls);
    expect(block.authoredOutlineCorner).toBeUndefined();
    expect(block.authoredFixedEndOutlineCorner).toBeUndefined();
    const read = (text: string) =>
      readDxf(
        {
          id: 'positive-inset',
          name: 'positive-inset.dxf',
          bytes: new TextEncoder().encode(text).buffer,
        },
        { sagittaMm: 0.05, keepFills: true },
      );
    expect(segmentDxf(await read(dxfText)).pieces[0]?.authoredOutlineCorner).toEqual(
      size.authoredOutlineCorner,
    );
    block.authoredInsetOutlineCorner = { widthMm: 10, controls: rounded.controls };
    const corrupted = await read(embedManifest(dxfText, manifest));
    expect(() => segmentDxf(corrupted)).toThrow(/does not reproduce both native outlines/);
  },
);
