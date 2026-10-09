// F15 PROBE ENTRY — what the CARD parser decides about grain and notches, per block.
//
// Bundled by f15.mjs three times from this same file: against the tree BEFORE F15 (git archive of the
// base commit), against HEAD, and against HEAD with the CLO grain-arrow recogniser switched off. Only
// APIs that exist in all three trees are called.
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import { grainAngleOf } from 'lib/nesting/geom/grain-orient';
import { sizeTokensOf } from 'components/managers/tech-card/components/nesting/block-code';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';

const DICT_NAMES = [
  'os',
  'xxs',
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  'xxs_32ta_f',
  'xs_34ta_f',
  's_36ta_f',
  'm_38ta_f',
  'l_40ta_f',
  'xl_42ta_f',
  'xxl_44ta_f',
  'xs_44ta_m',
  's_46ta_m',
  'm_48ta_m',
  'l_50ta_m',
  'xl_52ta_m',
  'xxl_54ta_m',
  'xxs_26bo_m',
  'xs_28bo_m',
  's_30bo_m',
  'm_32bo_m',
  'l_34bo_m',
  'xl_36bo_m',
  'xxl_38bo_m',
  'xxs_23bo_f',
  'xs_25bo_f',
  's_27bo_f',
  'm_29bo_f',
  'l_31bo_f',
  'xl_33bo_f',
];
const DICT_TOKENS = new Map<string, number[]>();
DICT_NAMES.forEach((name, i) => {
  for (const t of sizeTokensOf(name)) DICT_TOKENS.set(t, [...(DICT_TOKENS.get(t) ?? []), i + 1]);
});

const NOTCH_LAYER = '4';
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export type Sheet = { name: string; bytes: Uint8Array };

export type BlockRow = {
  block: string;
  file: number;
  pieceId: number;
  // effective grain = what the marker rotation uses: the file's default grain layer, exactly one hit
  grainLayer: string;
  angle: number | null;
  seg: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  notches: number;
  // drawing data for the visual check (absolute drawing coords, cm)
  poly: { x: number; y: number }[];
  inner: { layer: string; closed: boolean; pts: { x: number; y: number }[] }[];
};

export async function probe(sheets: Sheet[]) {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const parsed = await parseSheets(
    sheets.map((s) => ({ name: s.name, open: async () => s.bytes.slice().buffer as ArrayBuffer })),
    opts,
  );
  const pieces = parsed.pieces;
  const split = splitPiecesBySize(pieces, DICT_TOKENS);
  const contourLayer = defaultContourLayer(layerOptions(pieces, split.codeById));
  const grainOpts = grainLayerOptions(pieces);
  const grainLayer = defaultGrainLayer(grainOpts);
  const rows: BlockRow[] = [];
  const seen = new Set<string>();
  for (const p of pieces as PieceDTO[]) {
    if (!p.blockName || (p.layer ?? '') !== contourLayer) continue;
    const key = `${p.fileIndex}|${p.blockName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const angle = grainAngleOf(p, grainLayer);
    const hit = angle == null ? null : (p.grain ?? []).find((c) => c.layer === grainLayer)!;
    const ox = p.originX ?? 0;
    const oy = p.originY ?? 0;
    rows.push({
      block: p.blockName,
      file: p.fileIndex ?? 0,
      pieceId: p.id,
      grainLayer,
      angle: angle == null ? null : r4(angle),
      seg: hit ? { a: hit.a, b: hit.b } : null,
      notches: (p.inner ?? []).filter((c) => c.layer === NOTCH_LAYER).length,
      poly: p.poly.map((q) => ({ x: q.x + ox, y: q.y + oy })),
      inner: (p.inner ?? []).map((c) => ({
        layer: c.layer,
        closed: c.closed,
        pts: c.pts.map((q) => ({ x: q.x + ox, y: q.y + oy })),
      })),
    });
  }
  // The whole parse, JSON-stable, for byte comparisons; `grain` split out so it can be compared
  // on its own (the negative control) and `inner` split by layer so notch changes can be isolated.
  const parse = pieces.map((p) => ({
    id: p.id,
    name: p.name,
    block: p.blockName,
    layer: p.layer,
    file: p.fileIndex,
    poly: p.poly,
    area: p.areaCm2,
    origin: [p.originX, p.originY],
    bbox: [p.bboxW, p.bboxH],
    innerOther: (p.inner ?? []).filter((c) => c.layer !== NOTCH_LAYER),
    innerNotch: (p.inner ?? []).filter((c) => c.layer === NOTCH_LAYER),
    grain: p.grain ?? [],
  }));
  return {
    contourLayer,
    grainLayer,
    grainOpts,
    rows,
    parse,
    warnings: parsed.warnings,
    failedFiles: parsed.failedFiles,
    skippedBlocks: parsed.skippedBlocks,
    blockNames: parsed.blockNames,
  };
}
