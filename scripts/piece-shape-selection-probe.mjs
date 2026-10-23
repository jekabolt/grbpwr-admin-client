#!/usr/bin/env node
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `piece-shape-selection-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(here, 'piece-shape-selection-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
  absWorkingDir: root,
  define: { 'import.meta.env': '{}' },
});

const { findPiece, pieceBlockRefs, rollGoodsScopes } = await import(pathToFileURL(outfile).href);

let checks = 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const assert = (name, condition, detail = '') => {
  checks++;
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`  ✓ ${name}`);
};

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const scopes = rollGoodsScopes([
  {
    lineKey: 'main-cloth',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: MAIN,
    name: 'shell',
  },
  {
    lineKey: 'fuse-cloth',
    section: 'TECH_CARD_BOM_SECTION_INTERLINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
    name: 'fuse',
  },
]);
const refs = pieceBlockRefs(
  [
    {
      bomLineKey: 'fuse-cloth',
      blockName: 'FRONT_FUSE',
      pieceLineKey: 'piece-front',
    },
    {
      bomLineKey: 'main-cloth',
      fabricPurpose: MAIN,
      blockName: 'FRONT',
      pieceLineKey: 'piece-front',
    },
  ],
  scopes,
).get('piece-front');

assert(
  'the garment ref precedes a fuse ref even when the fuse row arrives first',
  same(refs, [
    { scopeKey: MAIN, block: 'FRONT' },
    { scopeKey: 'fuse-cloth', block: 'FRONT_FUSE' },
  ]),
  JSON.stringify(refs),
);

const piece = (id, blockName, bboxW) => ({
  id,
  name: blockName,
  blockName,
  layer: 'CUT',
  fileIndex: id - 1,
  poly: [
    { x: 0, y: 0 },
    { x: bboxW, y: 0 },
    { x: bboxW, y: 10 },
  ],
  bboxW,
  bboxH: 10,
  areaCm2: bboxW * 5,
  originX: 0,
  originY: 0,
});
const garment = piece(1, 'FRONT', 40);
const fuse = piece(2, 'FRONT_FUSE', 12);
const index = {
  split: {
    codeById: new Map(),
    groups: [],
    orderOfSize: new Map([['', 0]]),
    sizeTokenSet: new Set(),
    identities: new Set(['front', 'front_fuse']),
    identityByBlock: new Map(),
  },
  contourLayer: 'CUT',
  grainLayer: '',
  byKey: new Map([
    [`${MAIN}|front`, new Map([['', [garment]]])],
    ['fuse-cloth|front_fuse', new Map([['', [fuse]]])],
  ]),
  filesOfScope: new Map(),
};

assert(
  'geometry selection keeps the piece contour when a fuse contour also exists',
  findPiece(index, refs)?.piece.id === garment.id,
);
assert(
  'fuse geometry remains a fallback for an interlining-only piece',
  findPiece(index, refs?.slice(1) ?? [])?.piece.id === fuse.id,
);

console.log(`piece shape selection: ${checks} checks passed`);
