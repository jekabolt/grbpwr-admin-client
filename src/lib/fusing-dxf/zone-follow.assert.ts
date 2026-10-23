// Contour-following zone sides + point insert / remove (fusing-spline wave). Run by `yarn fusing:dxf`
// before geometry.assert.ts.
import assert from 'node:assert/strict';
import {
  addZoneHole,
  addZoneIsland,
  createZoneBus,
  insertZonePoint,
  removeZonePoint,
  seedZone,
  splineZone,
  storedZone,
  zonePoints,
  zoneRingOutline,
  ZONE_HOLE_SEED_RATIO,
  ZONE_PART_GAP_MM,
  ZONE_SEED_MAX_POINTS,
  type ZonePoint,
} from 'components/managers/tech-card/components/nesting/fuse-zone';
import { buildFusingSheets, mapFuseSpecToSize } from './dxf';
import {
  fuseAreaMm2,
  fuseInsetRingMm,
  generateFuseGeometry,
  signedArea,
  zoneRingMm,
  zoneRingsMm,
} from './geometry';
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

/**
 * Sleeve-like contour with four construction corners and a densely sampled cap. Near-duplicate
 * cap vertices model the tiny offset artefacts seen in the beta FW28 DXF: their one-vertex turns
 * are large, but over a few millimetres they are still one smooth curve.
 */
function noisySleeveOutline(width = 420, sideHeight = 190, capHeight = 100): PtMm[] {
  const out: PtMm[] = [
    { x: width - 35, y: 0 },
    { x: width, y: sideHeight },
  ];
  const steps = 72;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const point = {
      x: width * (1 - t),
      y: sideHeight + capHeight * Math.sin(Math.PI * t),
    };
    out.push(point);
    if (step > 8 && step < steps - 8 && step % 5 === 0) {
      out.push({ x: point.x + 0.001, y: point.y - 0.001 });
    }
  }
  out.push({ x: 35, y: 0 });
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

const near = (actual: number, expected: number, epsilon = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

export function main() {
  const outline = archOutline(200, 100);
  const s0 = spec(null);
  const inset = fuseInsetRingMm(outline, s0, null);

  // The pen starts as a sparse set of significant inset vertices. Because every point is on the
  // contour, every side follows it and the resulting ZONE is the same fill as WHOLE.
  const seed = seedZone(inset);
  assert.ok(seed && 'spline' in seed, 'a curved inset produces a spline seed');
  const seedPoints = seed.spline.points;
  assert.ok(seedPoints.length >= 3, 'the seed has a valid ring');
  assert.ok(seedPoints.length <= 8, `the curved seed stays small (${seedPoints.length})`);
  assert.ok(seedPoints.length <= ZONE_SEED_MAX_POINTS, 'the seed respects its hard cap');
  assert.ok(
    seedPoints.every((point) => point.corner),
    'every seed point is sharp',
  );
  assert.ok(seedPoints.every((point) => onRing(point, inset, ZONE_ON_CONTOUR_MM)));
  const wholeGeometry = generateFuseGeometry({ outline, spec: spec(null, { mode: 'whole' }) });
  const seedGeometry = generateFuseGeometry({ outline, spec: spec(seed) });
  const wholeArea = Math.abs(signedArea(wholeGeometry[0].outer));
  const seedArea = Math.abs(signedArea(seedGeometry[0].outer));
  assert.ok(
    Math.abs(seedArea - wholeArea) / wholeArea <= 0.005,
    `seed equals WHOLE within 0.5% (${seedArea} vs ${wholeArea})`,
  );

  // Pulling one seed point toward the centre carves material away without crossing the ring.
  const centre = inset.reduce(
    (sum, point) => ({ x: sum.x + point.x / inset.length, y: sum.y + point.y / inset.length }),
    { x: 0, y: 0 },
  );
  const carvedPoints = zonePoints(seed).map((point, index) =>
    index === 0
      ? {
          ...point,
          x: point.x + (centre.x - point.x) * 0.25,
          y: point.y + (centre.y - point.y) * 0.25,
        }
      : point,
  );
  const carved = splineZone(carvedPoints);
  const carvedRing = zoneRingMm(carved, inset);
  const carvedArea = Math.abs(signedArea(carvedRing));
  assert.ok(carvedArea < seedArea, `an inward point lowers area (${carvedArea} < ${seedArea})`);
  assert.equal(ringSelfIntersects(carvedRing), false, 'the carved ring stays simple');
  assert.deepEqual(seedZone(inset), seed, 'reset restores the exact full-fill seed');

  // A full-fill zone has no free pocket for another part, so + part splits the selected outer.
  const splitContour: PtMm[] = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
  ];
  const full = seedZone(splitContour);
  assert.ok(full && 'spline' in full);
  const split = addZoneIsland(full, splitContour, 'main');
  assert.ok(split, 'a full-fill outer splits when no free island fits');
  assert.equal(split.ref, 'island:0', 'the appended half is selected');
  const splitRings = zoneRingsMm(split.zone, splitContour);
  assert.equal(splitRings.outers.length, 2, 'the split produces two outer rings');
  assert.equal(splitRings.holes.length, 0);
  const splitArea = splitRings.outers.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
  near(splitArea, 200 * 100 - ZONE_PART_GAP_MM * 100, 0.1);
  assert.ok(
    splitRings.outers.every((ring) => !ringSelfIntersects(ring)),
    'both split halves are valid simple rings',
  );

  // Holes wholly in either half survive; a hole crossing the new gap is deliberately dropped.
  const sharpRing = (x0: number, y0: number, x1: number, y1: number) => ({
    points: [
      { x: x0, y: y0, corner: true },
      { x: x1, y: y0, corner: true },
      { x: x1, y: y1, corner: true },
      { x: x0, y: y1, corner: true },
    ],
  });
  const splitWithHoles = addZoneIsland(
    {
      ...full,
      holes: [sharpRing(20, 20, 30, 30), sharpRing(98, 40, 102, 60)],
    },
    splitContour,
    'main',
  );
  assert.ok(splitWithHoles);
  assert.equal(splitWithHoles.zone.holes.length, 1, 'a hole crossing the gap is dropped');
  assert.doesNotThrow(() => zoneRingsMm(splitWithHoles.zone, splitContour));

  // The panel pushes the unsplit zone before writing; one undo restores it and its selection.
  const bus = createZoneBus();
  bus.push('split-assert', full, 'main');
  bus.select('split-assert', split.ref);
  const undone = bus.pop('split-assert');
  assert.deepEqual(undone, { zone: full, selected: 'main' }, 'undo restores the full-fill seed');

  // A new cut-out is four round points at 18% of the outer's largest free inscribed radius.
  const addedHole = addZoneHole(full, 'main', splitContour);
  assert.ok(addedHole);
  const holePoints = addedHole.zone.holes[0].points;
  assert.equal(holePoints.length, 4);
  assert.ok(
    holePoints.every((point) => !point.corner),
    'hole seed points are round',
  );
  const holeCentre = holePoints.reduce(
    (sum, point) => ({
      x: sum.x + point.x / holePoints.length,
      y: sum.y + point.y / holePoints.length,
    }),
    { x: 0, y: 0 },
  );
  near(holeCentre.x, 100, 0.1);
  near(holeCentre.y, 50, 0.1);
  const holeRadius = Math.hypot(holePoints[0].x - holeCentre.x, holePoints[0].y - holeCentre.y);
  near(holeRadius / 50, ZONE_HOLE_SEED_RATIO, 0.005);

  const sleeveOutline = noisySleeveOutline();
  const sleeveInset = fuseInsetRingMm(sleeveOutline, s0, null);
  const noisySleeve = seedZone(sleeveInset);
  assert.ok(noisySleeve && 'spline' in noisySleeve);
  assert.equal(
    noisySleeve.spline.points.length,
    4,
    'a tessellated sleeve cap keeps exactly cap-left, cap-right, hem-left and hem-right',
  );
  const splitSleeve = addZoneIsland(noisySleeve, sleeveInset, 'main');
  assert.ok(splitSleeve, 'the sleeve-shaped full fill splits into two parts');
  const sleeveSplitRings = zoneRingsMm(splitSleeve.zone, sleeveInset);
  assert.equal(sleeveSplitRings.outers.length, 2);
  assert.ok(
    (['main' as const, splitSleeve.ref]).every((ref) =>
      zoneRingOutline(splitSleeve.zone, ref, sleeveInset).follows.some(Boolean),
    ),
    'both sleeve halves retain contour-following outer sides',
  );
  assert.ok(
    [splitSleeve.zone.spline, splitSleeve.zone.islands[0]].every((ring) =>
      ring.points.every((point) => point.corner),
    ),
    'the new cut sides use sharp controls',
  );
  const sleevePoints = zonePoints(noisySleeve);
  const sleeveCentre = sleevePoints.reduce(
    (sum, point) => ({
      x: sum.x + point.x / sleevePoints.length,
      y: sum.y + point.y / sleevePoints.length,
    }),
    { x: 0, y: 0 },
  );
  const hemLeft = sleevePoints.reduce(
    (best, point, index) =>
      point.x < sleeveCentre.x && point.y < sleevePoints[best].y ? index : best,
    sleevePoints.findIndex((point) => point.x < sleeveCentre.x),
  );
  const editedSleeve = splineZone(
    sleevePoints.map((point, index) =>
      index === hemLeft
        ? {
            ...point,
            x: point.x + (sleeveCentre.x - point.x) * 0.2,
            y: point.y + (sleeveCentre.y - point.y) * 0.2,
          }
        : point,
    ),
  );
  for (const gradedSleeve of [sleeveOutline, noisySleeveOutline(424, 190, 102)]) {
    const editedGeometry = generateFuseGeometry({
      outline: gradedSleeve,
      spec: spec(editedSleeve),
    });
    assert.ok(
      fuseAreaMm2(editedGeometry) > 0,
      'dragging hem-left keeps the edited zone valid across the sleeve grade',
    );
  }

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
