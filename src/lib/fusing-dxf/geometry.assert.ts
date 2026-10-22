import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  aliasInScope,
  bindingForScope,
  fabricScopes,
  markerScopeLines,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { nextFusingAliases, nextGeneratedPatterns, planFusingLines, sameAliasSet } from './aliases';
import { buildFusingSheets } from './dxf';
import {
  EDGE_CORNER_TURN_DEG,
  edgeRunsOf,
  pointOnEdgeRun,
  projectPointToEdgeRun,
  trimEdgeRun,
} from './edge-runs';
import { FuseTopologyError, fuseAreaMm2, generateFuseGeometry, signedArea } from './geometry';
import type { FusePolygon, PieceFuseSpec } from './types';
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
  // a named interlining line wins over the purpose riding along
  assert.equal(scopeKeyOfBinding(INTERFACING, 'F-2', scopes), 'F-2');
  assert.equal(scopeKeyOfBinding(UNSET, 'F-3', scopes), 'F-3');
  // legacy purpose-only binding: the single line of that purpose, never a guess among three
  assert.equal(scopeKeyOfBinding(OTHER, '', scopes), 'S-1');
  assert.equal(scopeKeyOfBinding(INTERFACING, '', scopes), '');
  // main fabric unchanged: purpose, or a line sorted into it
  assert.equal(scopeKeyOfBinding(MAIN, '', scopes), MAIN);
  assert.equal(scopeKeyOfBinding(UNSET, 'M-2', scopes), MAIN);
  assert.ok(
    aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: 'F-1' }, scopeOf('F-1'), scopes),
  );
  assert.ok(
    !aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: 'F-1' }, scopeOf('F-2'), scopes),
  );
  assert.ok(!aliasInScope({ fabricPurpose: INTERFACING, bomLineKey: '' }, scopeOf('F-1'), scopes));
  assert.ok(aliasInScope({ fabricPurpose: OTHER, bomLineKey: '' }, scopeOf('S-1'), scopes));
  assert.deepEqual(bindingForScope(scopeOf('F-2')), { fabricPurpose: '', bomLineKey: 'F-2' });
  assert.deepEqual(
    markerScopeLines('F-2', bom).map((l) => l.lineKey),
    ['F-2'],
  );
  assert.deepEqual(
    markerScopeLines('M-1', bom).map((l) => l.lineKey),
    ['M-1', 'M-2'],
  );
  // a cloth sorted into the purpose answers a purpose-only binding first; the interlining line of
  // the same purpose stays out of that cloth's marker scope
  const withRib = [...bom, { lineKey: 'R-1', purpose: OTHER, section: FABRIC_SECTION }];
  const ribScopes = fabricScopes(withRib);
  assert.equal(scopeKeyOfBinding(OTHER, '', ribScopes), OTHER);
  assert.equal(scopeKeyOfBinding(OTHER, 'S-1', ribScopes), 'S-1');
  assert.deepEqual(
    markerScopeLines('R-1', withRib).map((l) => l.lineKey),
    ['R-1'],
  );

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
    ].map((sheet) => scopeKeyOfBinding(sheet.fabricPurpose, sheet.bomLineKey, scopes)),
  });
  assert.deepEqual([...lineplan.blocked], ['F-2']);
  assert.deepEqual(Object.fromEntries(lineplan.bindings), {
    'F-1': { bomLineKey: 'F-1', fabricPurpose: UNSET },
    'F-3': { bomLineKey: 'F-3', fabricPurpose: UNSET },
    'S-1': { bomLineKey: 'S-1', fabricPurpose: UNSET },
  });
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
      writeFile(
        join(goldenDir, 'strip-curved.svg'),
        svgOf(curvedStrip, 'curved collar · 8 segments → 1 edge'),
      ),
    ]);
  }
  console.log('fusing-dxf geometry: assertions passed');
}
