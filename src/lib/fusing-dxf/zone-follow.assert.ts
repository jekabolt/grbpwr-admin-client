// Contour-following zone sides + point insert / remove (fusing-spline wave). Run by `yarn fusing:dxf`
// before geometry.assert.ts.
import assert from 'node:assert/strict';
import {
  insertZonePoint,
  removeZonePoint,
  storedZone,
  type ZonePoint,
} from 'components/managers/tech-card/components/nesting/fuse-zone';
import { buildFusingSheets, mapFuseSpecToSize } from './dxf';
import { fuseInsetRingMm, generateFuseGeometry, signedArea, zoneRingMm } from './geometry';
import {
  ZONE_ON_CONTOUR_MM,
  flattenSpline,
  flattenZoneSides,
  projectOnRing,
  ringSelfIntersects,
} from './spline';
import type { PieceFuseSpec } from './types';
import type { PtMm } from 'lib/pattern-import/types';

/** A D-shaped piece: straight bottom/left/right, a circular arch on top (an armhole-like curve). */
function archOutline(width: number, height: number, steps = 48): PtMm[] {
  const r = width / 2;
  const out: PtMm[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
  ];
  for (let k = 0; k <= steps; k++) {
    const a = (Math.PI * k) / steps;
    out.push({ x: r + r * Math.cos(a), y: height + r * Math.sin(a) });
  }
  return out;
}

const spec = (zone: PieceFuseSpec['zone'], extra: Partial<PieceFuseSpec> = {}): PieceFuseSpec =>
  ({
    mode: 'zone',
    insetMm: 3,
    insetNet: false,
    widthMm: null,
    edges: [],
    darts: 'fuse',
    zone,
    ...extra,
  }) as PieceFuseSpec;

const onRing = (p: PtMm, ring: readonly PtMm[], tol = 1e-6) => projectOnRing(p, ring).d <= tol;

export function main() {
  const outline = archOutline(200, 100);
  const s0 = spec(null);
  const inset = fuseInsetRingMm(outline, s0, null);

  // Points on the arch of the inset: the arch is at y >= height; project guesses onto the inset.
  const on = (x: number, y: number) => projectOnRing({ x, y }, inset).p;
  const left = on(5, 140);
  const top = on(100, 210);
  const right = on(195, 140);
  const below: ZonePoint = { x: 100, y: 60, corner: true };
  const pts: ZonePoint[] = [
    { ...right, corner: true },
    { ...top, corner: false },
    { ...left, corner: true },
    below,
  ];

  // 1. Contour-follow: sides right→top and top→left run on the inset ring.
  const flat = flattenZoneSides(pts, inset);
  assert.deepEqual(flat.follows, [true, true, false, false], 'only the two snapped sides follow');
  const followed = flat.ring.filter((_, k) => flat.side[k] === 0 || flat.side[k] === 1);
  assert.ok(
    followed.length > 10,
    `a followed arch side has the contour's vertices (${followed.length})`,
  );
  for (const p of followed)
    assert.ok(onRing(p, inset), `followed vertex ${p.x},${p.y} is on the ring`);
  assert.equal(ringSelfIntersects(flat.ring), false, 'the followed zone is a simple ring');
  // A spline through the same points cuts inside the arch: following covers strictly more.
  const plainArea = Math.abs(signedArea(flattenSpline(pts)));
  const followArea = Math.abs(signedArea(flat.ring));
  assert.ok(
    followArea > plainArea,
    `contour-follow covers the arch (${followArea} > ${plainArea})`,
  );

  // Unsnapped points keep the old spline exactly.
  const loose = pts.map((p) => ({ ...p, y: p.y - 10 }));
  assert.deepEqual(
    flattenZoneSides(loose, inset).ring,
    flattenSpline(loose),
    'old zones keep look',
  );
  assert.deepEqual(flattenZoneSides(pts, null).ring, flattenSpline(pts), 'no contour → spline');

  // Orientation: the same zone drawn clockwise follows the same arch.
  const cw = [...pts].reverse();
  const flatCw = flattenZoneSides(cw, inset);
  assert.equal(flatCw.follows.filter(Boolean).length, 2, 'a clockwise zone follows the same sides');
  assert.ok(
    Math.abs(Math.abs(signedArea(flatCw.ring)) - followArea) < 1e-6,
    'same area either way',
  );

  // Stored zone (0.1 mm rounding) still follows; the generator emits the same outline.
  const stored = storedZone(pts);
  assert.ok('spline' in stored);
  const storedFlat = flattenZoneSides(stored.spline.points, inset);
  assert.deepEqual(storedFlat.follows, flat.follows, 'rounded points still follow');
  for (const p of storedFlat.ring.filter((_, k) => storedFlat.side[k] < 2))
    assert.ok(onRing(p, inset), 'generator arch is on the ring');
  const generatorRing = zoneRingMm(stored, inset);
  assert.equal(generatorRing.length, storedFlat.ring.length, 'generator ring = editor ring');
  const polygons = generateFuseGeometry({ outline, spec: spec(stored) });
  assert.equal(polygons.length, 1);
  const cutArea = Math.abs(signedArea(polygons[0].outer));
  assert.ok(Math.abs(cutArea - followArea) < followArea * 0.01, `DXF cut = drawn (${cutArea})`);

  // A whole-piece zone of three on-contour points follows every side and equals the inset.
  const all: ZonePoint[] = [
    { ...on(0, 0), corner: true },
    { ...on(200, 0), corner: true },
    { ...top, corner: true },
  ];
  const whole = flattenZoneSides(all, inset);
  assert.deepEqual(whole.follows, [true, true, true]);
  assert.ok(
    Math.abs(Math.abs(signedArea(whole.ring)) - Math.abs(signedArea(inset))) < 1e-6,
    'three snapped points cover the whole inset',
  );

  // Per-size: snapped points land on the graded size's inset and keep following there.
  const graded = archOutline(240, 120);
  const sized = mapFuseSpecToSize(spec(stored), outline, graded, null);
  assert.ok(sized.zone && 'spline' in sized.zone);
  const gradedInset = fuseInsetRingMm(graded, s0, null);
  const sp = sized.zone.spline.points;
  for (const k of [0, 1, 2]) assert.ok(onRing(sp[k], gradedInset, 1e-6), `size point ${k} on ring`);
  assert.equal(
    onRing(sp[3], gradedInset, ZONE_ON_CONTOUR_MM),
    false,
    'the inner point stays inner',
  );
  assert.deepEqual(flattenZoneSides(sp, gradedInset).follows, [true, true, false, false]);
  const sheets = buildFusingSheets({
    techCardId: 1,
    style: 'ST',
    baseSizeId: 1,
    bomLines: [{ bomLineKey: 'f1', code: 'F1', label: 'fuse' }],
    pieces: [
      {
        identity: 'FP',
        displayName: 'front',
        piecesPerGarment: 1,
        ungraded: false,
        fuse: { ...spec(stored), bomLineKey: 'f1' } as PieceFuseSpec,
        sizes: [
          { sizeToken: 'S', sizeId: 1, rank: 1, outline },
          { sizeToken: 'M', sizeId: 2, rank: 2, outline: graded },
        ],
      },
    ],
  });
  assert.equal(sheets.skippedSizes.length, 0, JSON.stringify(sheets.skippedSizes));
  assert.equal(sheets.sheets.length, 1);

  // 2. Insert / remove keep a valid closed zone.
  const inserted = insertZonePoint(pts, 0, flat.ring[3]);
  assert.ok(inserted);
  assert.equal(inserted.length, 5);
  assert.equal(inserted[1].corner, false, 'an inserted point is round');
  const insFlat = flattenZoneSides(inserted, inset);
  assert.deepEqual(insFlat.follows, [true, true, true, false, false], 'a point on a followed side');
  assert.ok(Math.abs(Math.abs(signedArea(insFlat.ring)) - followArea) < 1e-6, 'insert keeps shape');
  assert.equal(ringSelfIntersects(insFlat.ring), false);
  const insStored = storedZone(inserted);
  assert.doesNotThrow(() => zoneRingMm(insStored, inset));

  const removed = removeZonePoint(inserted, 1);
  assert.deepEqual(removed, pts, 'remove undoes insert');
  const tri = removeZonePoint(pts, 3);
  assert.ok(tri && tri.length === 3);
  assert.doesNotThrow(() => zoneRingMm(storedZone(tri), inset), 'a 3-point zone is valid');
  assert.equal(removeZonePoint(tri, 0), null, 'min 3 points');
  const many = Array.from({ length: 64 }, (_, k) => ({
    x: 100 + 40 * Math.cos((2 * Math.PI * k) / 64),
    y: 80 + 40 * Math.sin((2 * Math.PI * k) / 64),
    corner: false,
  }));
  assert.equal(insertZonePoint(many, 0, { x: 0, y: 0 }), null, 'max 64 points');
  // Removing a Rect+ mid leaves a valid 7-point spline zone.
  const rect = storedZone([
    { x: 20, y: 10, corner: true },
    { x: 100, y: 10, corner: false },
    { x: 180, y: 10, corner: true },
    { x: 180, y: 50, corner: false },
    { x: 180, y: 90, corner: true },
    { x: 100, y: 90, corner: false },
    { x: 20, y: 90, corner: true },
    { x: 20, y: 50, corner: false },
  ]);
  assert.ok('rect' in rect);
  const seven = removeZonePoint(
    [
      { x: 20, y: 10, corner: true },
      { x: 100, y: 10, corner: false },
      { x: 180, y: 10, corner: true },
      { x: 180, y: 50, corner: false },
      { x: 180, y: 90, corner: true },
      { x: 100, y: 90, corner: false },
      { x: 20, y: 90, corner: true },
      { x: 20, y: 50, corner: false },
    ],
    1,
  )!;
  const sevenZone = storedZone(seven);
  assert.ok('spline' in sevenZone);
  assert.ok(Math.abs(Math.abs(signedArea(zoneRingMm(sevenZone, inset))) - 160 * 80) < 1e-6);

  console.log('fusing-dxf zone follow: assertions passed');
}
