import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  activeLegacyScopeOf,
  aliasInScope,
  bindingForScope,
  bindingScopes,
  fabricScopes,
  markerScopeLines,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { nextNumberedRole } from 'components/managers/tech-card/components/bom-roles';
import {
  pieceAreaSheetsRefusal,
  scopeAreaPieces,
} from 'components/managers/tech-card/components/piece-areas';
import {
  clampZoneTransform,
  cornerSlot,
  followMids,
  straightMid,
  withCorners,
  type ZonePoint,
} from 'components/managers/tech-card/components/nesting/fuse-zone';
import { fuseLineOf } from 'components/managers/tech-card/components/nesting/fuse-spec';
import {
  areaReadKeysOfScope,
  scopeAreaState,
} from 'components/managers/tech-card/components/piece-areas-state';
import {
  linesHeldByLegacyLinks,
  nextFusingAliases,
  nextGeneratedPatterns,
  planFusingLines,
  sameAliasSet,
} from './aliases';
import { fusingDartPolygons } from './darts';
import { buildFusingSheets } from './dxf';
import {
  EDGE_CORNER_TURN_DEG,
  edgeRunsOf,
  pointOnEdgeRun,
  projectPointToEdgeRun,
  trimEdgeRun,
} from './edge-runs';
import {
  FuseGeometryError,
  FuseTopologyError,
  fuseAreaMm2,
  generateFuseGeometry,
  signedArea,
  zoneRingMm,
} from './geometry';
import { flattenSpline, ringSelfIntersects } from './spline';
import { canonicalInterliningIdentity, matchInterliningImport } from './interlining-import';
import type { FusePolygon, PieceFuseSpec } from './types';
import type { PieceDTO } from 'lib/nesting/types';
import {
  fuseFieldsFromWire,
  fuseFieldsToWire,
  fuseSpecFromPiece,
  readFuseSpec,
  writeFuseFields,
} from './types';

const rectangle = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

const dxfPiece = (id: number, blockName: string, areaCm2: number): PieceDTO => ({
  id,
  name: blockName,
  blockName,
  source: 'assert.dxf',
  fileIndex: 0,
  poly: rectangle(10, 10),
  bboxW: 10,
  bboxH: 10,
  areaCm2,
});

// Four real edges. The top edge is a smooth collar curve tessellated into eight DXF segments.
const curvedCollar = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 18 },
  { x: 112, y: 28 },
  { x: 100, y: 36 },
  { x: 84, y: 42 },
  { x: 64, y: 45 },
  { x: 44, y: 42 },
  { x: 28, y: 36 },
  { x: 12, y: 28 },
  { x: 0, y: 18 },
];

const spec = (changes: Partial<PieceFuseSpec> = {}): PieceFuseSpec => ({
  mode: 'whole',
  bomLineKey: 'IL-1',
  widthMm: null,
  edges: [],
  zone: null,
  insetMm: null,
  insetNet: false,
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

  const sizeTokens = new Set(['xs', 's', 'm']);
  const mainBlocks = [
    dxfPiece(1001, 'BP_U_XS', 100),
    dxfPiece(1002, 'BP_U_S', 110),
    dxfPiece(1003, 'BP_U_M', 120),
    dxfPiece(1004, 'FP_XS', 90),
    dxfPiece(1005, 'FP_S', 100),
    dxfPiece(1006, 'FP_M', 110),
  ];
  const canonical = matchInterliningImport({
    blocks: [
      dxfPiece(1011, 'BP_U_FUSE_XS', 70),
      dxfPiece(1012, 'BP_U-F', 70),
      dxfPiece(1013, 'bp_u_fuse', 70),
      dxfPiece(1015, 'BP_U_XS_FUSE', 70),
    ],
    mainBlocks,
    mainAliases: [{ blockName: 'BP_U', pieceLineKey: 'piece-bp' }],
    pieces: [{ lineKey: 'piece-bp', name: 'back' }],
    sizeTokens,
  });
  assert.equal(canonical.length, 1, JSON.stringify(canonical.map((match) => match.identity)));
  assert.equal(canonical[0].identity, 'BP_U');
  assert.equal(canonical[0].pieceLineKey, 'piece-bp');
  assert.equal(canonical[0].previouslyBound, false, 'an automatic main-sheet match stays pending');

  const carried = matchInterliningImport({
    blocks: [dxfPiece(1014, 'bp-u-fuse-xs', 70)],
    mainBlocks,
    mainAliases: [{ blockName: 'BP_U', pieceLineKey: 'piece-bp' }],
    previousAliases: [{ blockName: 'BP_U_FUSING_S', pieceLineKey: 'piece-old' }],
    pieces: [
      { lineKey: 'piece-bp', name: 'back' },
      { lineKey: 'piece-old', name: 'old back' },
    ],
    sizeTokens,
  });
  assert.equal(carried[0].identity, 'BP_U');
  assert.equal(carried[0].pieceLineKey, 'piece-old', 'the previous identity wins on a new file');
  assert.equal(carried[0].previouslyBound, true, 'a stored owner alias is already reviewed');

  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'SIDE_F',
      sizeTokens,
      mainIdentities: new Set(['bpu']),
    }).identity,
    'SIDE_F',
    'a short fusing token is kept when its stem is not a main-sheet identity',
  );
  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'BP_U_F',
      sizeTokens,
      mainIdentities: new Set(['bpu']),
    }).identity,
    'BP_U',
    'a short fusing token is stripped when its stem exists on the main sheet',
  );
  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'POCKET_INT',
      sizeTokens,
      mainIdentities: new Set(['pocket', 'pocketint']),
    }).identity,
    'POCKET_INT',
    'a complete main identity wins over its interlining-looking suffix',
  );
  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'COLLAR_FUSE',
      sizeTokens,
      mainIdentities: new Set(['collar']),
    }).identity,
    'COLLAR',
    'a fusing suffix is stripped when its stem exists and the full identity does not',
  );
  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'COLLAR_FUSE',
      sizeTokens,
      mainIdentities: new Set(['collarfuse']),
    }).identity,
    'COLLAR_FUSE',
    'a complete main identity is not stripped to a missing stem',
  );
  assert.equal(
    canonicalInterliningIdentity({
      blockName: 'COLLAR_FUSE',
      sizeTokens,
      mainIdentities: new Set(),
    }).identity,
    'COLLAR_FUSE',
    'a fusing suffix is not stripped when its stem is absent',
  );
  assert.equal(
    fuseLineOf(spec({ bomLineKey: '' }), ['IL-ONLY']),
    'IL-ONLY',
    'a legacy empty fuse line belongs to the only interlining line',
  );

  const ambiguous = matchInterliningImport({
    blocks: [dxfPiece(1021, 'FRONT_FUSE_XS', 50)],
    mainBlocks: [
      dxfPiece(1022, 'FRONT_XS', 100),
      dxfPiece(1023, 'FRONT_S', 105),
      dxfPiece(1024, 'FRONT_M', 110),
      dxfPiece(1025, 'BACK_XS', 100),
      dxfPiece(1026, 'BACK_S', 105),
      dxfPiece(1027, 'BACK_M', 110),
    ],
    mainAliases: [],
    pieces: [
      { lineKey: 'front-a', name: 'front' },
      { lineKey: 'front-b', name: 'FRONT' },
    ],
    sizeTokens,
  });
  assert.equal(ambiguous[0].pieceLineKey, undefined);
  assert.equal(ambiguous[0].reason, 'ambiguous');

  const oversize = matchInterliningImport({
    blocks: [dxfPiece(1031, 'BP_U_FUSE_XS', 116)],
    mainBlocks,
    mainAliases: [{ blockName: 'BP_U', pieceLineKey: 'piece-bp' }],
    pieces: [{ lineKey: 'piece-bp', name: 'back' }],
    sizeTokens,
  });
  assert.equal(oversize[0].pieceLineKey, undefined);
  assert.equal(oversize[0].reason, 'oversize');

  assert.equal(nextNumberedRole('interlining', []), 'interlining 1');
  assert.equal(
    nextNumberedRole('interlining', [
      { name: 'Interlining 1' },
      { name: 'collar interlining' },
      { name: ' interlining 3 ' },
    ]),
    'interlining 2',
    'a new interlining slot takes the first free exact numbered role',
  );

  assert.equal(EDGE_CORNER_TURN_DEG, 30);
  const rectangleRuns = edgeRunsOf(outline);
  assert.equal(rectangleRuns.length, 4, 'a rectangle has four edge runs');
  assert.deepEqual(
    rectangleRuns.map((run) => run.segmentIndices),
    [[0], [1], [2], [3]],
  );

  const collarRuns = edgeRunsOf(curvedCollar);
  assert.equal(collarRuns.length, 4, 'small turns along a curved collar stay one edge run');
  assert.equal(collarRuns[2].segmentIndices.length, 8, 'the curved edge keeps all its DXF chords');
  const collarHandle = pointOnEdgeRun(collarRuns[2], 35);
  near(projectPointToEdgeRun(collarRuns[2], collarHandle.point).distance, 35);
  near(
    trimEdgeRun(collarRuns[2], 12, 17).reduce(
      (sum, point, index, points) =>
        index ? sum + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) : 0,
      0,
    ),
    collarRuns[2].length - 29,
  );

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
    spec({ mode: 'strip', widthMm: 25, bomLineKey: '' }),
  );

  const d = (value: string) => ({ value });
  const zoneWire = {
    fused: true,
    fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE' as const,
    fusingWidthMm: undefined,
    fusingBomLineKey: 'IL-2',
    fusingZone: { rect: { x0: d('1'), y0: d('2'), x1: d('30'), y1: d('40.5') } },
    fusingInsetMm: d('5'),
    fusingInsetNet: true,
    fusingGrain: 'bias',
    fusingDarts: 'fuse',
  };
  const zoneSpec = spec({
    mode: 'zone',
    bomLineKey: 'IL-2',
    zone: { rect: [1, 2, 30, 40.5] },
    insetNet: true,
    grain: 'bias',
    darts: 'fuse',
  });
  assert.deepEqual(fuseSpecFromPiece(zoneWire), zoneSpec);
  // spec → form fields → wire → form fields → spec is lossless.
  const fields = writeFuseFields(zoneSpec);
  assert.equal(fields.fusingMode, 'TECH_CARD_PIECE_FUSING_MODE_ZONE');
  assert.deepEqual(
    readFuseSpec({ ...fields, ...fuseFieldsFromWire(fuseFieldsToWire(fields)) }),
    zoneSpec,
  );
  const stripSpec = spec({
    mode: 'strip',
    widthMm: 15,
    insetMm: 2,
    edges: [{ edge: 3, startMm: 10, endMm: 0 }],
  });
  const stripFields = writeFuseFields(stripSpec);
  assert.deepEqual(
    readFuseSpec({ ...stripFields, ...fuseFieldsFromWire(fuseFieldsToWire(stripFields)) }),
    stripSpec,
  );
  // Leaving strip clears edges on the wire as a PRESENT empty list (absent would keep them).
  const cleared = fuseFieldsToWire(writeFuseFields({ ...stripSpec, mode: 'whole' }));
  assert.deepEqual(cleared.fusingEdges, { items: [] });
  assert.deepEqual(cleared.fusingZone, {});

  const whole = generateFuseGeometry({ outline, spec: spec() });
  assert.equal(whole.length, 1);
  near(fuseAreaMm2(whole), 94 * 74);
  assert.ok(signedArea(whole[0].outer) > 0, 'outer loop is CCW');

  const net = generateFuseGeometry({
    outline,
    spec: spec({ insetNet: true }),
    seamAllowanceMm: 10,
  });
  near(fuseAreaMm2(net), 80 * 60);
  const netTwenty = generateFuseGeometry({
    outline: rectangle(100, 100),
    spec: spec({ insetNet: true }),
    seamAllowanceMm: 20,
  });
  near(fuseAreaMm2(netTwenty) / 100, 36, 0.001);
  assert.throws(
    () =>
      generateFuseGeometry({
        outline: rectangle(100, 100),
        spec: spec({ insetNet: true }),
        seamAllowanceMm: null,
      }),
    /net inset requires a seam allowance/,
  );

  const dart = [
    { x: 43, y: 25 },
    { x: 57, y: 25 },
    { x: 50, y: 58 },
  ];
  const dartSource = {
    id: 1,
    name: 'front',
    source: 'front.dxf',
    poly: rectangle(10, 10),
    bboxW: 10,
    bboxH: 10,
    areaCm2: 100,
    inner: [
      {
        layer: 'DART',
        closed: false,
        pts: [
          { x: 0, y: 0 },
          { x: 2, y: 3 },
          { x: 4, y: 0 },
        ],
      },
      {
        layer: 'DART',
        closed: true,
        pts: [
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 5 },
        ],
      },
      {
        layer: 'DRILL',
        closed: true,
        pts: [
          { x: 6, y: 6 },
          { x: 7, y: 6 },
          { x: 7, y: 7 },
          { x: 6, y: 7 },
        ],
      },
    ],
  } satisfies PieceDTO;
  assert.deepEqual(
    fusingDartPolygons(dartSource),
    [
      [
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 30, y: 50 },
      ],
    ],
    'preview and regeneration share the closed-polygon dart rule',
  );
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

  const curvedStrip = generateFuseGeometry({
    outline: curvedCollar,
    spec: spec({
      mode: 'strip',
      widthMm: 12,
      insetMm: 3,
      edges: [{ edge: 2, startMm: 12, endMm: 17 }],
    }),
  });
  assert.equal(curvedStrip.length, 1, 'the tessellated collar produces one continuous strip');
  assert.ok(
    curvedStrip[0].outer.length > 8,
    'the strip follows the curved run instead of becoming one segment rectangle',
  );
  assert.ok(fuseAreaMm2(curvedStrip) > 1_000, 'the full curved edge contributes useful strip area');

  const dartedPiece = { outline, darts: [dart] };
  assert.equal(
    edgeRunsOf(dartedPiece.outline).length,
    4,
    'an internal dart does not split an edge',
  );
  const dartStripSpec = spec({
    mode: 'strip',
    widthMm: 20,
    edges: [{ edge: 2, startMm: 0, endMm: 0 }],
  });
  const dartStripCut = generateFuseGeometry({
    outline: dartedPiece.outline,
    darts: dartedPiece.darts,
    spec: dartStripSpec,
  });
  const dartStripFused = generateFuseGeometry({
    outline: dartedPiece.outline,
    darts: dartedPiece.darts,
    spec: { ...dartStripSpec, darts: 'fuse' },
  });
  assert.ok(
    fuseAreaMm2(dartStripCut) < fuseAreaMm2(dartStripFused),
    'the run-based strip still respects a cut dart',
  );

  const zone = generateFuseGeometry({
    outline,
    spec: spec({ mode: 'zone', zone: { rect: [50, -10, 120, 40] } }),
  });
  near(fuseAreaMm2(zone), 47 * 37);

  // L13 freeform zone. A rect is the 4-corner spline, and the editor's 4 corners + 4 straight mids.
  const corners = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0, corner: true },
    { x: x1, y: y0, corner: true },
    { x: x1, y: y1, corner: true },
    { x: x0, y: y1, corner: true },
  ];
  const withMids = (c: { x: number; y: number; corner: boolean }[]) =>
    c.flatMap((p, i) => {
      const q = c[(i + 1) % c.length];
      return [p, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, corner: false }];
    });
  const splineZone = (points: { x: number; y: number; corner?: boolean }[]) =>
    spec({ mode: 'zone', zone: { spline: { points } } });
  const goldenSpline = [
    { x: 0, y: 0, corner: false },
    { x: 100, y: 0, corner: false },
    { x: 101, y: 1, corner: false },
    { x: 101, y: 100, corner: false },
  ];
  const goldenFlat = flattenSpline(goldenSpline);
  const goldenStarts = goldenSpline.map((point) =>
    goldenFlat.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y),
  );
  assert.deepEqual(
    goldenStarts.map((start, i) =>
      i + 1 < goldenStarts.length ? goldenStarts[i + 1] - start : goldenFlat.length - start,
    ),
    [12, 2, 12, 14],
    'centripetal spline uses the backend golden step counts',
  );
  assert.equal(goldenFlat.length, 40, 'centripetal spline uses the backend golden vertex count');
  near(goldenFlat[goldenStarts[1] + 1].x, 100.65804836398324, 1e-9);
  near(goldenFlat[goldenStarts[1] + 1].y, 0.34215574839178853, 1e-9);
  const exactRectangle = flattenSpline(withMids(corners(0, 0, 20, 10)));
  assert.ok(
    exactRectangle.every(
      (point) =>
        (point.y === 0 && point.x >= 0 && point.x <= 20) ||
        (point.x === 20 && point.y >= 0 && point.y <= 10) ||
        (point.y === 10 && point.x >= 0 && point.x <= 20) ||
        (point.x === 0 && point.y >= 0 && point.y <= 10),
    ),
    '4 corners + 4 mids stay exactly on the rectangle boundary',
  );
  near(Math.abs(signedArea(exactRectangle)), 20 * 10, 1e-9);
  const rectPlusPoints = withMids(corners(10, 10, 40, 40));
  assert.equal(cornerSlot(1, rectPlusPoints), false, 'Rect+ keeps its odd slots as mids');
  const genericEven: ZonePoint[] = [
    { x: 0, y: 0, corner: true },
    { x: 20, y: 0, corner: true },
    { x: 30, y: 15, corner: false },
    { x: 20, y: 30, corner: false },
    { x: 0, y: 30, corner: true },
    { x: -10, y: 15, corner: false },
  ];
  assert.equal(cornerSlot(1, genericEven), true, 'a generic even spline keeps every corner slot');
  assert.equal(straightMid(genericEven, 1), false, 'a generic even spline has no follower mids');
  assert.deepEqual(
    followMids(
      genericEven.map((point) => ({ ...point })),
      genericEven.map(() => true),
    ),
    genericEven,
    'a generic even spline keeps its points unchanged',
  );
  const genericSharp = withCorners({ spline: { points: genericEven } }, true);
  assert.ok(
    genericSharp &&
      'spline' in genericSharp &&
      genericSharp.spline.points.every((point) => point.corner),
    'sharp applies to every point of a non-Rect+ spline',
  );
  const rectAsSpline = generateFuseGeometry({
    outline,
    spec: splineZone(corners(50, -10, 120, 40)),
  });
  near(fuseAreaMm2(rectAsSpline), fuseAreaMm2(zone));
  const rectAsEight = generateFuseGeometry({
    outline,
    spec: splineZone(withMids(corners(50, -10, 120, 40))),
  });
  near(fuseAreaMm2(rectAsEight), fuseAreaMm2(zone));

  // Bent: the top mid pushed up 12 mm inside the piece → more area than the rectangle, less than
  // the triangle-capped bound (corners stay sharp, the bend is a smooth bulge).
  const flat = withMids(corners(20, 20, 60, 50));
  const bent = flat.map((p, i) => (i === 5 ? { ...p, y: p.y + 12 } : p));
  const bentArea = fuseAreaMm2(generateFuseGeometry({ outline, spec: splineZone(bent) }));
  assert.ok(bentArea > 40 * 30 + 100, `bent zone adds area (${bentArea})`);
  assert.ok(bentArea < 40 * 30 + 40 * 12, `bent zone stays under the cap (${bentArea})`);

  // All round: 8 points on a circle → a circle within 3 % (Catmull-Rom runs ~2 % inside), and the 0.5 mm chord bound holds.
  const circle = Array.from({ length: 8 }, (_, i) => ({
    x: 50 + 20 * Math.cos((i * Math.PI) / 4),
    y: 40 + 20 * Math.sin((i * Math.PI) / 4),
  }));
  const roundArea = fuseAreaMm2(generateFuseGeometry({ outline, spec: splineZone(circle) }));
  assert.ok(Math.abs(roundArea / (Math.PI * 400) - 1) < 0.03, `round zone ≈ circle (${roundArea})`);
  const coarse = flattenSpline(circle);
  const fine = flattenSpline(circle, 0.005);
  const distToRing = (q: { x: number; y: number }) =>
    Math.min(
      ...coarse.map((a, i) => {
        const b = coarse[(i + 1) % coarse.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)),
        );
        return Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t);
      }),
    );
  assert.ok(Math.max(...fine.map(distToRing)) <= 0.5, 'flattening keeps chord error ≤ 0.5 mm');

  // Clipped to the inset contour: half outside the piece → only the inside half is cut.
  const overhang = generateFuseGeometry({
    outline,
    spec: splineZone(
      withMids(corners(80, 20, 120, 50)).map((p, i) => (i === 3 ? { ...p, x: 130 } : p)),
    ),
  });
  near(fuseAreaMm2(overhang), (97 - 80) * 30);
  assert.throws(
    () => generateFuseGeometry({ outline, spec: splineZone(corners(200, 200, 240, 240)) }),
    /zone geometry is empty/,
  );
  assert.throws(
    () =>
      zoneRingMm({
        spline: {
          points: [
            { x: 0, y: 0, corner: true },
            { x: 40, y: 40, corner: true },
            { x: 40, y: 0, corner: true },
            { x: 0, y: 40, corner: true },
          ],
        },
      }),
    FuseGeometryError,
    'a bow tie is refused',
  );
  const endpointTouch = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  assert.equal(
    ringSelfIntersects(endpointTouch),
    true,
    'a non-neighbour endpoint touch is refused',
  );
  assert.throws(
    () =>
      zoneRingMm({
        spline: { points: endpointTouch.map((point) => ({ ...point, corner: true })) },
      }),
    FuseGeometryError,
    'a sharp endpoint touch is refused after flattening',
  );
  assert.equal(
    ringSelfIntersects([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]),
    true,
    'an adjacent collinear reversal is refused',
  );
  assert.throws(
    () => zoneRingMm({ spline: { points: corners(0, 0, 10, 10).slice(0, 2) } }),
    FuseGeometryError,
  );
  const clampRing = rectangle(10, 10);
  const moving = rectangle(2, 3).map((point) => ({ x: point.x + 2, y: point.y + 3 }));
  const moved = clampZoneTransform(moving, clampRing, (point, amount) => ({
    x: point.x + 20 * amount,
    y: point.y,
  }));
  near(Math.max(...moved.map((point) => point.x)), 10, 1e-6);
  near(Math.hypot(moved[1].x - moved[0].x, moved[1].y - moved[0].y), 2, 1e-9);
  const rotateSource = [
    { x: 1, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 9 },
    { x: 1, y: 9 },
  ];
  const rotated = clampZoneTransform(rotateSource, clampRing, (point, amount) => {
    const angle = (Math.PI / 2) * amount;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: 2.5 + (point.x - 2.5) * cos - (point.y - 5) * sin,
      y: 5 + (point.x - 2.5) * sin + (point.y - 5) * cos,
    };
  });
  assert.ok(Math.min(...rotated.map((point) => point.x)) >= -1e-7, 'rotation stays in the inset');
  near(Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y), 3, 1e-9);
  // spec → form fields → wire → form fields → spec keeps the spline and its corners.
  const splineSpec = splineZone(bent);
  const splineFields = writeFuseFields(splineSpec);
  const splineWire = fuseFieldsToWire(splineFields);
  assert.equal(splineWire.fusingZone?.rect, undefined);
  assert.equal(splineWire.fusingZone?.spline?.points?.length, 8);
  assert.deepEqual(
    readFuseSpec({ ...splineFields, ...fuseFieldsFromWire(splineWire) }),
    splineSpec,
  );
  const splineDxf = buildFusingSheets({
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
        fuse: splineSpec,
        sizes: [{ sizeToken: 'M', sizeId: 2, rank: 1, outline }],
      },
    ],
  });
  assert.deepEqual(splineDxf.sheets[0].blocks, ['FRONT_M'], 'a spline zone reaches the DXF');
  const bentPolygons = generateFuseGeometry({ outline, spec: splineSpec });

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
  assert.deepEqual(dxf.sheets[0].aliases, [{ identity: 'FRONT', blockName: 'FRONT' }]);

  // The rebuild owns the links of a scope only generated sheets hold: stale and hand-made rows there
  // go, the new ones come. A scope an uploaded sheet also holds is never touched (fail closed):
  // the owner's COLLAR→P6 stays, the rebuild's COLLAR→P5 is not added, and a previous generated
  // scope that is shared now keeps its rows too. A legacy generated sheet bound to a purpose (IL-5,
  // pre-L11) hands its purpose scope back: its rows go, the line-bound replacement links afresh.
  const UNSET = 'TECH_CARD_BOM_PURPOSE_UNSET';
  const INTERFACING = 'TECH_CARD_BOM_PURPOSE_INTERFACING';
  const OTHER = 'TECH_CARD_BOM_PURPOSE_OTHER';
  const current = [
    {
      bomLineKey: 'MAIN',
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      blockName: 'FRONT',
      pieceLineKey: 'P1',
    },
    { bomLineKey: 'IL-1', fabricPurpose: UNSET, blockName: 'OLD', pieceLineKey: 'P9' },
    { bomLineKey: 'IL-2', fabricPurpose: UNSET, blockName: 'GONE', pieceLineKey: 'P8' },
    { bomLineKey: 'IL-3', fabricPurpose: UNSET, blockName: 'HAND', pieceLineKey: 'P7' },
    { bomLineKey: 'IL-3', fabricPurpose: UNSET, blockName: 'COLLAR', pieceLineKey: 'P6' },
    { bomLineKey: 'IL-4', fabricPurpose: OTHER, blockName: 'PAD', pieceLineKey: 'P4' },
    { bomLineKey: '', fabricPurpose: INTERFACING, blockName: 'LEGACY', pieceLineKey: 'P3' },
  ];
  const plan = nextFusingAliases({
    current,
    previousGenerated: [
      { bomLineKey: 'IL-1', fabricPurpose: UNSET },
      { bomLineKey: 'IL-2', fabricPurpose: UNSET },
      { bomLineKey: 'IL-3', fabricPurpose: UNSET },
      // moved from the purpose scope to the line scope; an uploaded sheet now holds «other»
      { bomLineKey: 'IL-4', fabricPurpose: OTHER },
      { bomLineKey: 'IL-5', fabricPurpose: INTERFACING },
    ],
    otherSheets: [
      { bomLineKey: 'MAIN', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
      { bomLineKey: 'IL-3', fabricPurpose: UNSET },
      { bomLineKey: 'X', fabricPurpose: OTHER },
    ],
    sheets: [
      {
        binding: { bomLineKey: 'IL-1', fabricPurpose: UNSET },
        links: [{ blockName: 'FRONT', pieceLineKey: 'P1' }],
      },
      {
        binding: { bomLineKey: 'IL-3', fabricPurpose: UNSET },
        links: [{ blockName: 'COLLAR', pieceLineKey: 'P5' }],
      },
      {
        binding: { bomLineKey: 'IL-4', fabricPurpose: UNSET },
        links: [{ blockName: 'PAD', pieceLineKey: 'P4' }],
      },
      {
        binding: { bomLineKey: 'IL-5', fabricPurpose: UNSET },
        links: [{ blockName: 'SLEEVE', pieceLineKey: 'P2' }],
      },
    ],
  });
  assert.deepEqual(plan.rows, [
    current[0],
    current[3],
    current[4],
    current[5],
    { bomLineKey: 'IL-1', fabricPurpose: UNSET, blockName: 'FRONT', pieceLineKey: 'P1' },
    { bomLineKey: 'IL-4', fabricPurpose: UNSET, blockName: 'PAD', pieceLineKey: 'P4' },
    { bomLineKey: 'IL-5', fabricPurpose: UNSET, blockName: 'SLEEVE', pieceLineKey: 'P2' },
  ]);
  assert.deepEqual(plan.shared.sort(), ['IL-3', 'other']);

  // L11 — EVERY INTERLINING LINE IS ITS OWN SCOPE. Three fusibles all marked «interfacing» are three
  // materials; two main fabrics under one purpose are still one scope (one sheet cut from either).
  const IL_SECTION = 'TECH_CARD_BOM_SECTION_INTERLINING';
  const FABRIC_SECTION = 'TECH_CARD_BOM_SECTION_FABRIC';
  const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
  const bom = [
    { lineKey: 'M-1', purpose: MAIN, section: FABRIC_SECTION },
    { lineKey: 'M-2', purpose: MAIN, section: FABRIC_SECTION },
    { lineKey: 'F-1', purpose: INTERFACING, section: IL_SECTION },
    { lineKey: 'F-2', purpose: INTERFACING, section: IL_SECTION },
    { lineKey: 'F-3', purpose: INTERFACING, section: IL_SECTION },
    { lineKey: 'S-1', purpose: OTHER, section: IL_SECTION },
  ];
  const scopes = fabricScopes(bom);
  assert.deepEqual(
    scopes.map((scope) => [scope.key, scope.byPurpose, scope.lines.map((l) => l.lineKey)]),
    [
      [MAIN, true, ['M-1', 'M-2']],
      ['F-1', false, ['F-1']],
      ['F-2', false, ['F-2']],
      ['F-3', false, ['F-3']],
      ['S-1', false, ['S-1']],
    ],
  );
  const scopeOf = (key: string) => scopes.find((scope) => scope.key === key)!;
  // Row-level cases: an empty artifact set, so nothing supersedes a legacy row.
  const none = bindingScopes(scopes, []);
  // a named interlining line wins over the purpose riding along
  assert.equal(scopeKeyOfBinding(INTERFACING, 'F-2', none), 'F-2');
  assert.equal(scopeKeyOfBinding(UNSET, 'F-3', none), 'F-3');
  // legacy purpose-only binding: the single line of that purpose, never a guess among three
  assert.equal(scopeKeyOfBinding(OTHER, '', none), 'S-1');
  assert.equal(scopeKeyOfBinding(INTERFACING, '', none), '');
  // main fabric unchanged: purpose, or a line sorted into it
  assert.equal(scopeKeyOfBinding(MAIN, '', none), MAIN);
  assert.equal(scopeKeyOfBinding(UNSET, 'M-2', none), MAIN);
  assert.ok(aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: 'F-1' }, scopeOf('F-1'), none));
  assert.ok(!aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: 'F-1' }, scopeOf('F-2'), none));
  assert.ok(!aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: '' }, scopeOf('F-1'), none));
  assert.ok(aliasInScope({ fabricPurpose: OTHER, bomLineKey: '' }, scopeOf('S-1'), none));
  assert.deepEqual(bindingForScope(scopeOf('F-2')), { fabricPurpose: '', bomLineKey: 'F-2' });
  assert.deepEqual(
    markerScopeLines('F-2', bom).map((l) => l.lineKey),
    ['F-2'],
  );
  assert.deepEqual(
    markerScopeLines('M-1', bom).map((l) => l.lineKey),
    ['M-1', 'M-2'],
  );
  // rib «other» + felt «other»: the purpose has TWO carriers, so a purpose-only binding means the
  // purpose group (the rib), as before; the felt keeps its own scope, and each judges its own marker
  const withRib = [...bom, { lineKey: 'R-1', purpose: OTHER, section: FABRIC_SECTION }];
  const ribScopes = fabricScopes(withRib);
  assert.deepEqual(
    ribScopes.map((scope) => [scope.key, scope.lines.map((l) => l.lineKey)]),
    [
      [MAIN, ['M-1', 'M-2']],
      [OTHER, ['R-1']],
      ['F-1', ['F-1']],
      ['F-2', ['F-2']],
      ['F-3', ['F-3']],
      ['S-1', ['S-1']],
    ],
  );
  const ribScopeOf = (key: string) => ribScopes.find((scope) => scope.key === key)!;
  const ribNone = bindingScopes(ribScopes, []);
  assert.equal(scopeKeyOfBinding(OTHER, '', ribNone), OTHER);
  assert.equal(scopeKeyOfBinding(OTHER, 'S-1', ribNone), 'S-1');
  assert.equal(scopeKeyOfBinding(OTHER, 'R-1', ribNone), OTHER);
  assert.ok(aliasInScope({ fabricPurpose: OTHER, bomLineKey: '' }, ribScopeOf(OTHER), ribNone));
  assert.ok(!aliasInScope({ fabricPurpose: OTHER, bomLineKey: '' }, ribScopeOf('S-1'), ribNone));
  assert.deepEqual(
    markerScopeLines('R-1', withRib).map((l) => l.lineKey),
    ['R-1'],
  );
  assert.deepEqual(
    markerScopeLines('S-1', withRib).map((l) => l.lineKey),
    ['S-1'],
  );

  // SET LEVEL (L11, backend PreferredFabricArtifactsByScope): a legacy purpose-only row is the felt's
  // only while the felt has no row of that kind bound to it. Once it has one, the line set is read
  // whole and the legacy row resolves to nothing — never merged into the line's set.
  const legacyFelt = { fabricPurpose: OTHER, bomLineKey: '' };
  const boundFelt = { fabricPurpose: UNSET, bomLineKey: 'S-1' };
  const legacyOnly = bindingScopes(scopes, [legacyFelt]);
  const lineAndLegacy = bindingScopes(scopes, [legacyFelt, boundFelt]);
  assert.equal(scopeKeyOfBinding(OTHER, '', legacyOnly), 'S-1');
  assert.equal(scopeKeyOfBinding(OTHER, '', lineAndLegacy), '');
  assert.equal(scopeKeyOfBinding(UNSET, 'S-1', lineAndLegacy), 'S-1');
  // a purpose-first row keeps its legacy provenance even with the compatibility line echoed beside
  // it (the DB buckets it by COALESCE(fabric_purpose, bom_line_key)): the line set suppresses it too
  assert.equal(scopeKeyOfBinding(OTHER, 'S-1', lineAndLegacy), '');
  assert.equal(scopeKeyOfBinding(OTHER, 'S-1', legacyOnly), 'S-1');
  assert.ok(aliasInScope(legacyFelt, scopeOf('S-1'), legacyOnly));
  assert.ok(!aliasInScope(legacyFelt, scopeOf('S-1'), lineAndLegacy));
  assert.deepEqual(
    [legacyFelt, boundFelt].filter((a) => aliasInScope(a, scopeOf('S-1'), lineAndLegacy)),
    [boundFelt],
    'the line set wins whole',
  );
  // backend TestPreferredFabricArtifactsKeepLineAndLegacyInterliningSetsExclusive: purpose-only and
  // purpose+line rows are one legacy set; two line rows replace it wholesale, and without them the
  // complete legacy set is read
  const echoedFelt = { fabricPurpose: OTHER, bomLineKey: 'S-1' };
  const boundFelt2 = { fabricPurpose: UNSET, bomLineKey: 'S-1' };
  const mixed = [legacyFelt, echoedFelt, boundFelt, boundFelt2];
  const mixedSet = bindingScopes(scopes, mixed);
  assert.deepEqual(
    mixed.filter((a) => aliasInScope(a, scopeOf('S-1'), mixedSet)),
    [boundFelt, boundFelt2],
    'line-scoped set replaces the legacy set wholesale',
  );
  const legacyPair = [legacyFelt, echoedFelt];
  const legacyPairSet = bindingScopes(scopes, legacyPair);
  assert.deepEqual(
    legacyPair.filter((a) => aliasInScope(a, scopeOf('S-1'), legacyPairSet)),
    legacyPair,
    'empty line set falls back to the complete legacy set',
  );
  // a purpose row naming a deleted line is still purpose-first, so legacy: with the purpose-only row
  // it forms the felt's legacy set, and neither is primary
  const goneLine = bindingScopes(scopes, [
    legacyFelt,
    { fabricPurpose: OTHER, bomLineKey: 'GONE' },
  ]);
  assert.equal(scopeKeyOfBinding(OTHER, 'GONE', goneLine), 'S-1');
  assert.equal(scopeKeyOfBinding(OTHER, '', goneLine), 'S-1');
  assert.equal(goneLine.primary.size, 0);
  // AREA SAVE (L11): an interlining scope's sheets pass the preflight by their set-aware scope —
  // a legacy-only felt set and a line set both measure under the line key; a mixed set is refused.
  // An ordinary fabric keeps the raw guard (a line-bound main sheet under the purpose key refuses).
  const sheet = (b: { fabricPurpose: string; bomLineKey: string }, lineKey: string) => ({
    ...b,
    lineKey,
  });
  assert.equal(pieceAreaSheetsRefusal([sheet(legacyFelt, 'P1')], 'S-1', scopes), null);
  assert.equal(
    pieceAreaSheetsRefusal([sheet(legacyFelt, 'P1'), sheet(echoedFelt, 'P2')], 'S-1', scopes),
    null,
  );
  assert.equal(pieceAreaSheetsRefusal([sheet(boundFelt, 'P3')], 'S-1', scopes), null);
  assert.match(
    pieceAreaSheetsRefusal([sheet(legacyFelt, 'P1'), sheet(boundFelt, 'P3')], 'S-1', scopes) ?? '',
    /bound differently/,
  );
  assert.match(pieceAreaSheetsRefusal([sheet(legacyFelt, 'P1')], 'S-1') ?? '', /bound to a BOM/);
  assert.match(
    pieceAreaSheetsRefusal(
      [sheet({ fabricPurpose: UNSET, bomLineKey: 'M-1' }, 'P4')],
      'main',
      scopes,
    ) ?? '',
    /bound to a BOM line/,
  );
  assert.equal(
    pieceAreaSheetsRefusal([sheet({ fabricPurpose: MAIN, bomLineKey: '' }, 'P4')], 'main', scopes),
    null,
  );
  // AREA FRESHNESS: the felt reads its line's measurement, else the legacy purpose one — never both
  const areaScope = (scopeKey: string) => ({ scopeKey, areas: [] });
  assert.deepEqual(
    areaReadKeysOfScope(scopeOf('S-1'), scopes, [legacyFelt], [areaScope('other')]),
    ['other'],
  );
  assert.deepEqual(
    areaReadKeysOfScope(
      scopeOf('S-1'),
      scopes,
      [legacyFelt],
      [areaScope('other'), areaScope('S-1')],
    ),
    ['S-1'],
  );
  assert.deepEqual(areaReadKeysOfScope(scopeOf('S-1'), scopes, [legacyFelt], []), ['S-1']);
  // F-2 shares «interfacing» with two other fusibles: no legacy purpose key to fall back to
  assert.deepEqual(areaReadKeysOfScope(scopeOf('F-2'), scopes, [], [areaScope('interfacing')]), [
    'F-2',
  ]);
  // beta TC 59: generated sheets, links and measured areas are all line-scoped with purpose NULL.
  // Seven Fusible interlining pieces and the one-piece G785 / Felt pad slots must each resolve their
  // own saved aliases, and an existing non-stale line-key area set is fresh (row existence alone is
  // not freshness; `stale` remains the server's sheet+link fingerprint verdict).
  const tc59Groups = [
    {
      key: '01MFZSNG00000000000000000A',
      purpose: INTERFACING,
      names: [
        'clr_main',
        'FLP_R',
        'FLP_R_MAIN',
        'CLR_SECOND',
        'FLP_L',
        'CLR_SECOND_1',
        'FLP_L_MAIN',
      ],
    },
    { key: '01M5J6Y8GQETGB0KMME07ZVM5P', purpose: INTERFACING, names: ['PLCK_L'] },
    { key: '01M5J72DSJ3NZNT81A1V68EAW9', purpose: OTHER, names: ['PLCK_R'] },
  ];
  const tc59Scopes = fabricScopes(
    tc59Groups.map((g) => ({ lineKey: g.key, purpose: g.purpose, section: IL_SECTION })),
  );
  const tc59Aliases = tc59Groups.flatMap((g) =>
    g.names.map((name, i) => ({
      fabricPurpose: undefined,
      bomLineKey: g.key,
      blockName: name,
      pieceLineKey: `${g.key}-piece-${i}`,
    })),
  );
  const tc59Pieces = tc59Aliases.map((a) => ({
    lineKey: a.pieceLineKey,
    name: a.blockName,
    piecesPerGarment: 1,
    ungraded: false,
  }));
  const tc59Areas = tc59Groups.map((g) => ({
    scopeKey: g.key,
    areas: tc59Aliases
      .filter((a) => a.bomLineKey === g.key)
      .flatMap((a) =>
        [1, 2, 3, 4, 5].map((sizeId) => ({
          pieceLineKey: a.pieceLineKey,
          sizeId,
          areaCm2: { value: '1' },
          perimeterCm: { value: '1' },
          hulled: false,
          ambiguousPick: false,
        })),
      ),
    stale: false,
    contourLayer: 'CUT',
    seamAllowanceMm: { value: '0' },
    parsedBy: 'assert',
    parsedAt: undefined,
  }));
  const tc59Links = bindingScopes(tc59Scopes, tc59Aliases);
  for (const [i, group] of tc59Groups.entries()) {
    const scope = tc59Scopes.find((s) => s.key === group.key)!;
    const aliases = tc59Aliases.filter((a) => aliasInScope(a, scope, tc59Links));
    assert.equal(scopeAreaPieces(aliases, tc59Pieces, scope.key).length, group.names.length);
    assert.equal(tc59Areas[i].areas.length, [35, 5, 5][i]);
    const keys = areaReadKeysOfScope(scope, tc59Scopes, [], tc59Areas);
    assert.deepEqual(keys, [group.key]);
    assert.equal(scopeAreaState(keys, tc59Areas).phase, 'fresh', `TC 59 scope ${i + 1}`);
  }
  assert.deepEqual(
    areaReadKeysOfScope(scopeOf(MAIN), scopes, [{ fabricPurpose: UNSET, bomLineKey: 'M-1' }], []),
    ['M-1'],
  );
  // per artifact kind: the links' line set does not suppress a legacy SHEET, and vice versa
  const sheetsLegacy = bindingScopes(scopes, [legacyFelt]);
  const linksBound = bindingScopes(scopes, [boundFelt, legacyFelt]);
  assert.equal(scopeKeyOfBinding(OTHER, '', sheetsLegacy), 'S-1');
  assert.equal(scopeKeyOfBinding(OTHER, '', linksBound), '');
  // rib + felt: a purpose-only «other» is the rib's group, never a legacy felt row — the felt's
  // own rows do not suppress it
  const ribWithFelt = bindingScopes(ribScopes, [legacyFelt, boundFelt]);
  assert.equal(scopeKeyOfBinding(OTHER, '', ribWithFelt), OTHER);
  assert.ok(aliasInScope(legacyFelt, ribScopeOf(OTHER), ribWithFelt));

  // Every generated sheet binds to its LINE and links; a line is blocked only when an uploaded
  // sheet resolves to that very line (an old-client sheet bound {interfacing, F-2}). A legacy
  // purpose-only sheet among three same-purpose lines resolves to none and blocks nothing.
  const lineplan = planFusingLines({
    lines: ['F-1', 'F-2', 'F-3', 'S-1'].map((key) => ({
      bomLineKey: key,
      effectiveScope:
        scopes.find((scope) => scope.lines.some((l) => l.lineKey === key))?.key ?? key,
    })),
    uploadedScopes: [
      { fabricPurpose: INTERFACING, bomLineKey: 'F-2' },
      { fabricPurpose: INTERFACING, bomLineKey: '' },
      { fabricPurpose: MAIN, bomLineKey: '' },
    ].map((sheet) => scopeKeyOfBinding(sheet.fabricPurpose, sheet.bomLineKey, none)),
  });
  assert.deepEqual([...lineplan.blocked], ['F-2']);
  assert.deepEqual(Object.fromEntries(lineplan.bindings), {
    'F-1': { bomLineKey: 'F-1', fabricPurpose: UNSET },
    'F-3': { bomLineKey: 'F-3', fabricPurpose: UNSET },
    'S-1': { bomLineKey: 'S-1', fabricPurpose: UNSET },
  });
  // Regenerate resolves uploads over the WHOLE sheet set, generated included: a legacy felt upload
  // holds the felt while it is the felt's only sheet, and stops blocking once a generated sheet is
  // bound to the line (that one is what the card reads for the felt).
  const feltPlan = (sheetSet: { fabricPurpose: string; bomLineKey: string }[]) =>
    planFusingLines({
      lines: [{ bomLineKey: 'S-1', effectiveScope: 'S-1' }],
      uploadedScopes: [legacyFelt].map((sheet) =>
        scopeKeyOfBinding(sheet.fabricPurpose, sheet.bomLineKey, bindingScopes(scopes, sheetSet)),
      ),
    });
  assert.deepEqual([...feltPlan([legacyFelt]).blocked], ['S-1']);
  assert.deepEqual([...feltPlan([legacyFelt, boundFelt]).blocked], []);
  // …and the same set rule for LINKS: the owner's legacy felt links hold the line (the rebuild's
  // first line-bound link would hide them all, and it never rebinds an owner's rows); links of an
  // old generated purpose-bound sheet are the rebuild's own, and a line-bound link set holds nothing.
  const feltLinkA = { ...legacyFelt, blockName: 'A', pieceLineKey: 'P1' };
  const held = (current: (typeof feltLinkA)[], previousGenerated: (typeof legacyFelt)[] = []) => [
    ...linesHeldByLegacyLinks({
      current,
      legacyScopeOf: (a) =>
        activeLegacyScopeOf(a.fabricPurpose, a.bomLineKey, bindingScopes(scopes, current)),
      previousGenerated,
      otherSheets: [],
    }),
  ];
  assert.deepEqual(held([feltLinkA]), ['S-1']);
  assert.deepEqual(held([{ ...feltLinkA, bomLineKey: 'S-1' }]), ['S-1'], 'purpose + echoed line');
  assert.deepEqual(held([feltLinkA], [legacyFelt]), []);
  assert.deepEqual(held([feltLinkA, { ...boundFelt, blockName: 'B', pieceLineKey: 'P2' }]), []);
  assert.deepEqual(held([{ ...feltLinkA, fabricPurpose: INTERFACING, bomLineKey: 'F-2' }]), []);
  // A blocked line's generated sheet is removed, not kept beside the uploaded sheet that holds the
  // line; a generated line's row is replaced; uploaded rows ride through.
  const uploadedOther = { name: 'felt.dxf', bomLineKey: 'IL-4', fabricPurpose: OTHER };
  const legacyGenerated = { name: 'gen IL-4', bomLineKey: 'IL-4', fabricPurpose: UNSET };
  const oldIl1 = { name: 'gen IL-1', bomLineKey: 'IL-1', fabricPurpose: UNSET };
  const newIl1 = { name: 'gen IL-1 v2', bomLineKey: 'IL-1', fabricPurpose: UNSET };
  assert.deepEqual(
    nextGeneratedPatterns(
      [uploadedOther, legacyGenerated, oldIl1],
      (pattern) => pattern.name.startsWith('gen '),
      new Map([['IL-1', newIl1]]),
    ),
    [uploadedOther, newIl1],
  );
  assert.ok(sameAliasSet(plan.rows, [...plan.rows].reverse()), 'alias sets compare without order');
  assert.ok(
    sameAliasSet(
      plan.rows,
      nextFusingAliases({ current: plan.rows, previousGenerated: [], otherSheets: [], sheets: [] })
        .rows,
    ),
    'nothing generated, nothing owned: the set rides through',
  );
  assert.match(dxf.sheets[0].dxfText, /FRONT_S/);
  assert.match(dxf.sheets[0].dxfText, /FRONT_M/);
  assert.ok(
    (dxf.sheets[0].dxfText.match(/\r?\nPOLYLINE\r?\n/g) ?? []).length >= 4,
    'the writer keeps an outer and a dart-hole loop in each block',
  );

  const twoInterlinings = buildFusingSheets({
    techCardId: 7,
    style: 'JKT-042',
    baseSizeId: 2,
    bomLines: [
      { bomLineKey: 'IL-1', code: 'G700', label: 'woven fusible' },
      { bomLineKey: 'IL-2', code: 'KUFNER', label: 'knit fusible' },
    ],
    pieces: [
      {
        identity: 'FRONT',
        displayName: 'front',
        piecesPerGarment: 2,
        ungraded: false,
        fuse: spec({ bomLineKey: 'IL-1' }),
        sizes: [{ sizeToken: 'M', sizeId: 2, rank: 1, outline }],
      },
      {
        identity: 'COLLAR',
        displayName: 'collar',
        piecesPerGarment: 2,
        ungraded: false,
        fuse: spec({ bomLineKey: 'IL-2' }),
        sizes: [{ sizeToken: 'M', sizeId: 2, rank: 1, outline: rectangle(60, 25) }],
      },
    ],
  });
  assert.deepEqual(
    twoInterlinings.sheets.map((sheet) => ({ key: sheet.bomLineKey, blocks: sheet.blocks })),
    [
      { key: 'IL-1', blocks: ['FRONT_M'] },
      { key: 'IL-2', blocks: ['COLLAR_M'] },
    ],
    'each interlining BOM line gets its own fusing DXF',
  );

  const runMismatch = buildFusingSheets({
    techCardId: 7,
    style: 'JKT-042',
    baseSizeId: 2,
    bomLines: [{ bomLineKey: 'IL-1', code: 'G700', label: 'woven fusible' }],
    pieces: [
      {
        identity: 'COLLAR',
        displayName: 'collar',
        piecesPerGarment: 1,
        ungraded: false,
        fuse: spec({
          mode: 'strip',
          widthMm: 12,
          edges: [{ edge: 0, startMm: 0, endMm: 0 }],
        }),
        sizes: [
          {
            sizeToken: 'S',
            sizeId: 1,
            rank: 0,
            outline: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 120, y: 40 },
              { x: 100, y: 80 },
              { x: 0, y: 80 },
            ],
          },
          { sizeToken: 'M', sizeId: 2, rank: 1, outline },
        ],
      },
    ],
  });
  assert.deepEqual(runMismatch.sheets[0].blocks, ['COLLAR_M']);
  assert.equal(
    runMismatch.skippedSizes.length,
    1,
    'a graded size with another run count is skipped',
  );
  assert.match(runMismatch.skippedSizes[0].reason, /5 edge runs; base size has 4/);

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
      writeFile(join(goldenDir, 'zone-spline.svg'), svgOf(bentPolygons, 'zone · rect+ · top bent')),
      writeFile(
        join(goldenDir, 'strip-curved.svg'),
        svgOf(curvedStrip, 'curved collar · 8 segments → 1 edge'),
      ),
    ]);
  }
  console.log('fusing-dxf geometry: assertions passed');
}
