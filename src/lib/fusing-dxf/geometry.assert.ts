import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildFusingSheets } from './dxf';
import { FuseTopologyError, fuseAreaMm2, generateFuseGeometry, signedArea } from './geometry';
import type { FusePolygon, PieceFuseSpec } from './types';
import { fuseSpecFromPiece } from './types';

const rectangle = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

const spec = (changes: Partial<PieceFuseSpec> = {}): PieceFuseSpec => ({
  mode: 'whole',
  bomLineKey: 'IL-1',
  widthMm: null,
  edges: [],
  zone: null,
  insetMm: null,
  net: false,
  grain: 'as_piece',
  darts: 'cut',
  ...changes,
});

const near = (actual: number, expected: number, epsilon = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );

function svgOf(polygons: readonly FusePolygon[], title: string): string {
  const points = polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]).flat();
  const minX = Math.min(...points.map((point) => point.x)) - 8;
  const minY = Math.min(...points.map((point) => point.y)) - 8;
  const maxX = Math.max(...points.map((point) => point.x)) + 8;
  const maxY = Math.max(...points.map((point) => point.y)) + 8;
  const path = polygons
    .flatMap((polygon) => [polygon.outer, ...polygon.holes])
    .map(
      (ring) =>
        `M ${ring.map((point) => `${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' L ')} Z`,
    )
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="900" height="650">
  <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#f1f0ec"/>
  <path d="${path}" fill="#c5d646" fill-rule="nonzero" stroke="#20231e" stroke-width="0.8"/>
  <text x="${minX + 3}" y="${minY + 6}" font-family="monospace" font-size="4" fill="#20231e">${title}</text>
</svg>
`;
}

export async function main() {
  const outline = rectangle(100, 80);

  assert.equal(
    fuseSpecFromPiece({ fused: false, fusingMode: undefined, fusingWidthMm: undefined }),
    null,
  );
  assert.deepEqual(
    fuseSpecFromPiece({
      fused: true,
      fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_STRIP',
      fusingWidthMm: { value: '25' },
    }),
    spec({ mode: 'strip', widthMm: 25, bomLineKey: null }),
  );

  const whole = generateFuseGeometry({ outline, spec: spec() });
  assert.equal(whole.length, 1);
  near(fuseAreaMm2(whole), 94 * 74);
  assert.ok(signedArea(whole[0].outer) > 0, 'outer loop is CCW');

  const net = generateFuseGeometry({
    outline,
    spec: spec({ net: true }),
    seamAllowanceMm: 10,
  });
  near(fuseAreaMm2(net), 80 * 60);

  const dart = [
    { x: 43, y: 25 },
    { x: 57, y: 25 },
    { x: 50, y: 58 },
  ];
  const wholeDart = generateFuseGeometry({ outline, spec: spec(), darts: [dart] });
  assert.equal(wholeDart[0].holes.length, 1, 'cut dart becomes a hole');
  assert.ok(signedArea(wholeDart[0].holes[0]) < 0, 'hole loop is CW');
  assert.ok(fuseAreaMm2(wholeDart) < fuseAreaMm2(whole));

  const strip = generateFuseGeometry({
    outline,
    spec: spec({
      mode: 'strip',
      widthMm: 20,
      edges: [{ edge: 0, startMm: 10, endMm: 15 }],
    }),
  });
  near(fuseAreaMm2(strip), 75 * 20);

  const joinedStrip = generateFuseGeometry({
    outline,
    spec: spec({
      mode: 'strip',
      widthMm: 18,
      edges: [
        { edge: 0, startMm: 12, endMm: 0 },
        { edge: 1, startMm: 0, endMm: 9 },
      ],
    }),
    darts: [dart],
  });
  assert.equal(joinedStrip.length, 1, 'adjacent selected edges join at their corner');
  assert.ok(joinedStrip[0].outer.length >= 6, 'joined corner is a band union, not one rectangle');

  const zone = generateFuseGeometry({
    outline,
    spec: spec({ mode: 'zone', zone: { rect: [50, -10, 120, 40] } }),
  });
  near(fuseAreaMm2(zone), 47 * 37);

  const referenced = generateFuseGeometry({
    outline,
    spec: spec({ mode: 'zone', zone: { dxfPieceKey: 'PATCH' } }),
    zoneOutline: rectangle(20, 15),
  });
  near(fuseAreaMm2(referenced), 300);

  assert.throws(
    () => generateFuseGeometry({ outline, spec: spec(), expectedEdgeCount: 5 }),
    FuseTopologyError,
  );

  const dxf = buildFusingSheets({
    techCardId: 7,
    style: 'JKT-042',
    baseSizeId: 2,
    bomLines: [{ bomLineKey: 'IL-1', code: 'G700', label: 'woven fusible' }],
    pieces: [
      {
        identity: 'FRONT',
        displayName: 'front',
        piecesPerGarment: 2,
        ungraded: false,
        fuse: spec(),
        sizes: [
          { sizeToken: 'S', sizeId: 1, rank: 0, outline: rectangle(90, 70), darts: [dart] },
          { sizeToken: 'M', sizeId: 2, rank: 1, outline, darts: [dart] },
        ],
      },
    ],
  });
  assert.equal(dxf.sheets.length, 1);
  assert.equal(dxf.sheets[0].filename, 'jkt-042-fusing-g700.dxf');
  assert.deepEqual(dxf.sheets[0].blocks, ['FRONT_S', 'FRONT_M']);
  assert.match(dxf.sheets[0].dxfText, /FRONT_S/);
  assert.match(dxf.sheets[0].dxfText, /FRONT_M/);
  assert.ok(
    (dxf.sheets[0].dxfText.match(/\r?\nPOLYLINE\r?\n/g) ?? []).length >= 4,
    'the writer keeps an outer and a dart-hole loop in each block',
  );

  const goldenDir = process.env.FUSING_GOLDEN_DIR?.trim();
  if (goldenDir) {
    await mkdir(goldenDir, { recursive: true });
    await Promise.all([
      writeFile(
        join(goldenDir, 'whole-dart.svg'),
        svgOf(wholeDart, 'whole · inset 3 mm · dart cut'),
      ),
      writeFile(
        join(goldenDir, 'strip-offsets.svg'),
        svgOf(joinedStrip, 'strip · width 18 mm · offsets 12/9 mm · joined corner'),
      ),
    ]);
  }
  console.log('fusing-dxf geometry: assertions passed');
}
