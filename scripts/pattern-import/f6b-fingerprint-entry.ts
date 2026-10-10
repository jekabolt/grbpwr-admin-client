// F6b REGRESSION FINGERPRINT — what the card machinery decides about a DXF pack, as one JSON.
//
// Bundled by f6b.mjs TWICE from this same file: once against the tree BEFORE F6b (git archive of the
// base commit) and once against HEAD. For files WITHOUT a conversion manifest the two JSONs must be
// byte-identical — that is the "legacy files keep their exact outcome" promise. A third bundle of HEAD
// with the manifest gate forced open (manifest-facts.ts patched) must DIFFER: the negative control
// that proves this fingerprint can see the gate at all.
//
// Only APIs that exist in both trees are called. The piece-match modal's row counting and proposal
// lived inside a React effect before F6b; this file carries a line-for-line REPLICA of that effect
// (base piece-match-modal.tsx:652-778) and uses it when the bundle has no `countBlocks` export —
// so the base side is the original effect and the HEAD side is the real extracted functions.
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import {
  deriveBlockSizes,
  normBlock,
  sizeTokensOf,
} from 'components/managers/tech-card/components/nesting/block-code';
import {
  aliasIdentity,
  splitPiecesBySize,
  type BlockSplit,
} from 'components/managers/tech-card/components/nesting/split-pieces';
import { missingSizesIn } from 'components/managers/tech-card/components/nesting/use-block-sizes';
import {
  blocksMissingOnLayer,
  defaultContourLayer,
  layerAllowanceLabel,
  layerOptions,
  seamAllowancePrefill,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import { buildAllowanceIndex } from 'components/managers/tech-card/components/nesting/contour-allowance';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import {
  dedupeUniPieces,
  markerUnits,
  pieceLineKeysByPieceId,
  selectMarkerPieces,
  unitsOfPieces,
} from 'components/managers/tech-card/components/nesting/piece-selection';
import { dxfNormAreas } from 'components/managers/tech-card/components/nesting/dxf-consumption';
import type { DxfIndex } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import * as modal from 'components/managers/tech-card/components/nesting/piece-match-modal';

// ── size dictionary (backend migrations 0001:414-421, 0018, 0019); ids are positional ────────────
export const DICT_NAMES = [
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
export const SIZE_BY_ID = new Map<number, string>(DICT_NAMES.map((n, i) => [i + 1, n]));
export const DICT_TOKENS = new Map<string, number[]>();
for (const [id, name] of SIZE_BY_ID) {
  for (const t of sizeTokensOf(name)) DICT_TOKENS.set(t, [...(DICT_TOKENS.get(t) ?? []), id]);
}
/** Plain size id of a letter token («m» → 5). */
export const plainSizeId = (token: string) => DICT_NAMES.indexOf(token.toLowerCase()) + 1;

type M = Record<string, any>;
const M_ = modal as unknown as M;

// ── REPLICA of base piece-match-modal.tsx:652-778 (the effect body), used only when the bundle does
//    not export countBlocks/proposeRows (i.e. the BASE tree) ────────────────────────────────────
function replicaCount(contourPieces: PieceDTO[], split: BlockSplit) {
  const perFile = new Map<string, Map<string, number>>();
  const spelling = new Map<string, string>();
  const sizesByCi = new Map<string, Set<string>>();
  const uniBaseByCi = new Map<string, string>();
  for (const p of contourPieces) {
    const b = normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '');
    if (!b) continue;
    const ci = b.toLowerCase();
    if (!spelling.has(ci)) spelling.set(ci, b);
    const uniBase = split.codeById.get(p.id)?.uniBase ?? '';
    if (uniBase && !uniBaseByCi.has(ci)) uniBaseByCi.set(ci, normBlock(uniBase));
    const sz = split.codeById.get(p.id)?.size ?? '';
    if (sz) {
      const set = sizesByCi.get(ci) ?? new Set<string>();
      set.add(sz);
      sizesByCi.set(ci, set);
    }
    const bucket = `${p.fileIndex ?? p.source}|${split.codeById.get(p.id)?.size ?? ''}`;
    const file = perFile.get(bucket) ?? new Map<string, number>();
    file.set(ci, (file.get(ci) ?? 0) + 1);
    perFile.set(bucket, file);
  }
  const counts = new Map<string, number>();
  for (const file of perFile.values()) {
    for (const [ci, n] of file) counts.set(ci, Math.max(counts.get(ci) ?? 0, n));
  }
  const all = new Map<
    string,
    { block: string; instances: number; sizes: string[]; uniBase: string }
  >();
  for (const [ci, instances] of counts) {
    const sizes = [...(sizesByCi.get(ci) ?? [])].sort(
      (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
    );
    all.set(ci, { block: spelling.get(ci)!, instances, sizes, uniBase: uniBaseByCi.get(ci) ?? '' });
  }
  return all;
}
// The proposal half needs `similarity` — the module-private scorer. The base bundle exports it via the
// appended export list in f6b.mjs; it is the same function in both trees.
function replicaPropose(
  counts: ReturnType<typeof replicaCount>,
  stored: Map<string, string>,
  pieceOptions: { lineKey: string; name: string }[],
  otherFabricByBlock: Map<string, { pieceKey: string; fromSlot: string }>,
) {
  const similarity = M_.similarity as (a: string, b: string) => number;
  const SUGGEST_MIN = 0.6;
  const next: any[] = [];
  for (const [ci, c] of counts) {
    const block = c.block;
    if (stored.has(ci)) continue;
    let suggested = '';
    let basis = 'none';
    let fromSlot = '';
    const exact = pieceOptions.find((p) => p.name.toLowerCase() === block.toLowerCase());
    const byLoose = pieceOptions.find((p) => M_.loose(p.name) === M_.loose(block));
    const hint = otherFabricByBlock.get(M_.loose(block));
    if (exact) {
      suggested = exact.lineKey;
      basis = 'exact';
    } else if (byLoose) {
      suggested = byLoose.lineKey;
      basis = 'loose';
    } else if (hint && pieceOptions.some((p) => p.lineKey === hint.pieceKey)) {
      suggested = hint.pieceKey;
      basis = 'other-fabric';
      fromSlot = hint.fromSlot;
    } else {
      let best = SUGGEST_MIN;
      for (const p of pieceOptions) {
        const s = similarity(p.name, block);
        if (s >= best) {
          best = s;
          suggested = p.lineKey;
          basis = 'similar';
        }
      }
    }
    const preselect = basis === 'exact' || basis === 'loose' ? suggested : '';
    next.push({
      block,
      instances: c.instances,
      sizes: c.sizes,
      uniBase: c.uniBase,
      suggested,
      basis,
      fromSlot,
      choice: preselect,
    });
  }
  next.sort((a, b) => a.block.localeCompare(b.block, 'ru'));
  return next;
}

/** Real extracted functions when present (HEAD), the replica otherwise (base). */
export function modalRows(
  contourPieces: PieceDTO[],
  split: BlockSplit,
  args: {
    storedFirst: Map<string, string>;
    pieceOptions: { lineKey: string; name: string }[];
    otherFabricByBlock: Map<string, { pieceKey: string; fromSlot: string }>;
    elsewhereOnly: Map<string, string>;
  },
) {
  if (typeof M_.countBlocks === 'function') {
    const counted = M_.countBlocks(contourPieces, split) as Map<string, any>;
    return { counted, rows: M_.proposeRows(counted, args) as any[] };
  }
  const counted = replicaCount(contourPieces, split);
  return {
    counted,
    rows: replicaPropose(counted, args.storedFirst, args.pieceOptions, args.otherFabricByBlock),
  };
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const sortedEntries = <K, V>(m: Map<K, V>) =>
  [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

export type Sheet = { name: string; bytes: Uint8Array };

/** The whole card-side verdict for one pack (one scope). JSON-stable. */
export async function fingerprint(sheets: Sheet[]): Promise<unknown> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const parsed = await parseSheets(
    sheets.map((s) => ({
      name: s.name,
      open: async () => s.bytes.slice().buffer as ArrayBuffer,
    })),
    opts,
  );
  const pieces = parsed.pieces;
  const split = splitPiecesBySize(pieces, DICT_TOKENS);
  const idx = buildAllowanceIndex(pieces);
  const plain = layerOptions(pieces, split.codeById);
  const measured = layerOptions(pieces, split.codeById, idx);
  const contourLayer = defaultContourLayer(plain);
  const measuredLayer = defaultContourLayer(measured);
  const opt = measured.find((o) => o.layer === measuredLayer);
  const prefill = {
    none: seamAllowancePrefill({ measured: opt?.allowance ?? null, fallbackMm: 10 }),
    card10: seamAllowancePrefill({
      measured: opt?.allowance ?? null,
      cardRequiredMm: 10,
      fallbackMm: 10,
    }),
    workshop12: seamAllowancePrefill({
      measured: opt?.allowance ?? null,
      workshopDefaultMm: 12,
      fallbackMm: 10,
    }),
  };
  const grainOpts = grainLayerOptions(pieces);
  const grainLayer = defaultGrainLayer(grainOpts);
  const contourPieces = pieces.filter((p) => (p.layer ?? '') === contourLayer);

  // marker composition (1 garment of every size token on the contour layer)
  const tokens = [
    ...new Set(contourPieces.map((p) => split.codeById.get(p.id)?.size ?? '').filter(Boolean)),
  ];
  const units = markerUnits({
    graded: true,
    rows: tokens.map((t) => ({ tokens: [t], qty: 1 })),
    ungradedUnits: 1,
  });
  const unitsOf = unitsOfPieces(contourPieces, (id) => split.codeById.get(id)?.size ?? '', units);
  const selected = selectMarkerPieces(contourPieces, contourLayer, unitsOf);
  const uni = dedupeUniPieces(pieces, split.codeById, contourLayer);

  // the modal, on a card that already has a few pieces — some named like the file's identities, one
  // bound in another fabric (exercises 'other-fabric' and, on HEAD, proves `elsewhereOnly` is ignored
  // for rows without a manifest).
  const identities = [...split.identities].sort();
  const pieceOptions = [
    { lineKey: 'FPKEY', name: 'FP' },
    { lineKey: 'BPKEY', name: 'BP' },
    { lineKey: 'CLRKEY', name: 'CLR' },
    ...identities.slice(0, 2).map((ci, i) => ({ lineKey: `IDKEY${i}`, name: ci.toUpperCase() })),
  ];
  const storedFirst = new Map<string, string>();
  for (const ci of identities) {
    if (ci === 'bp') storedFirst.set(ci, 'BPKEY');
  }
  const otherFabricByBlock = new Map([
    [
      M_.loose(identities[identities.length - 1] ?? 'x'),
      { pieceKey: 'CLRKEY', fromSlot: 'lining' },
    ],
  ]);
  const elsewhereOnly = new Map(pieceOptions.map((p) => [p.lineKey.toLowerCase(), 'lining']));
  const { counted, rows } = modalRows(contourPieces, split, {
    storedFirst,
    pieceOptions,
    otherFabricByBlock,
    elsewhereOnly,
  });
  const live = [
    {
      lineKey: 'FPKEY',
      name: 'FP',
      piecesPerGarment: 2,
      cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED',
    },
    {
      lineKey: 'BPKEY',
      name: 'BP',
      piecesPerGarment: 1,
      cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD',
    },
    {
      lineKey: 'CLRKEY',
      name: 'CLR',
      piecesPerGarment: 2,
      cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD',
    },
    { lineKey: 'IDKEY0', name: 'X0', piecesPerGarment: 0, cutSymmetry: '' },
  ];
  const bound = new Map<string, string>();
  for (const ci of counted.keys()) {
    if (ci.startsWith('fp')) bound.set(ci, 'FPKEY');
    else if (ci.startsWith('bp')) bound.set(ci, 'BPKEY');
    else if (ci.startsWith('clr')) bound.set(ci, 'CLRKEY');
    else if (!bound.size) bound.set(ci, 'IDKEY0');
  }
  const planned = M_.plannedScopeBinding(
    live,
    bound,
    [],
    rows.map((r) => ({ ...r, choice: r.choice || M_.CREATE })),
    {},
  );
  const upd = M_.planPieceUpdates(live, planned.bound, counted, true);
  const updIncomplete = M_.planPieceUpdates(live, planned.bound, counted, false);

  // the norm «by patterns», on an index built exactly like useDxfIndex
  const byKey = new Map<string, Map<string, PieceDTO[]>>();
  for (const p of pieces) {
    const code = split.codeById.get(p.id);
    const identity = normBlock(code?.identity ?? p.blockName ?? '');
    if (!identity) continue;
    const key = `S|${identity.toLowerCase()}`;
    const bySize = byKey.get(key) ?? new Map<string, PieceDTO[]>();
    const size = code?.size ?? '';
    bySize.set(size, [...(bySize.get(size) ?? []), p]);
    byKey.set(key, bySize);
  }
  const index: DxfIndex = {
    split,
    contourLayer,
    grainLayer,
    byKey,
    filesOfScope: new Map([['S', sheets.map((_, i) => i)]]),
  };
  const sizeIds = [
    ...new Set(
      tokens.map(
        (t) =>
          plainSizeId(t.replace(/[^\p{L}\p{N}]+/gu, '')) ||
          (DICT_TOKENS.get(t.toLowerCase()) ?? [0])[0],
      ),
    ),
  ].filter((x) => x > 0);
  const normPieces = [...counted.values()].map((c: any) => ({
    name: c.block,
    lineKey: `K_${c.block}`,
    perGarment: c.instances,
    refs: [{ scopeKey: 'S', block: c.block }],
  }));
  const norm = dxfNormAreas({
    index,
    pieces: normPieces,
    unaliasedPieces: [],
    sizeIds: sizeIds.length ? sizeIds : [plainSizeId('m')],
    tokensOfSize: (id) => sizeTokensOf(SIZE_BY_ID.get(id)),
    contourLayer,
    allowanceCm: prefill.none.value / 10,
  });

  return {
    parse: {
      pieces: pieces.map((p) => ({
        id: p.id,
        name: p.name,
        block: p.blockName,
        layer: p.layer,
        file: p.fileIndex,
        area: r4(p.areaCm2),
        w: r4(p.bboxW),
        h: r4(p.bboxH),
        grain: (p.grain ?? []).length,
        inner: (p.inner ?? []).length,
        hasManifestKey: Object.prototype.hasOwnProperty.call(p, 'manifest'),
      })),
      warnings: parsed.warnings,
      failedFiles: parsed.failedFiles,
      skippedBlocks: parsed.skippedBlocks,
      blockNames: parsed.blockNames,
    },
    derive: sortedEntries(
      deriveBlockSizes(
        pieces.map((p) => p.blockName ?? ''),
        (t) => DICT_TOKENS.has(t),
      ),
    ),
    split: {
      codeById: sortedEntries(split.codeById).map(([id, c]) => [id, c]),
      groups: split.groups.map((g) => [g.size, g.pieces.map((p) => p.id)]),
      orderOfSize: sortedEntries(split.orderOfSize),
      sizeTokenSet: [...split.sizeTokenSet].sort(),
      identities: [...split.identities].sort(),
      identityByBlock: sortedEntries(split.identityByBlock),
      aliases: ['FP_L', 'BP_1_XS', 'BP_M', 'CLR', 'PCK_M', ...parsed.blockNames.slice(0, 20)].map(
        (b) => [b, aliasIdentity(b, split)],
      ),
    },
    missingSizes: missingSizesIn(pieces, DICT_TOKENS, [plainSizeId('m')], SIZE_BY_ID),
    layers: {
      plain,
      measured,
      labels: measured.map((o) => layerAllowanceLabel(o)),
      contourLayer,
      measuredLayer,
      missingOnLayer: blocksMissingOnLayer(pieces, contourLayer),
      prefill,
    },
    grain: { grainOpts, grainLayer },
    marker: {
      tokens,
      unitsTotal: units.unitsTotal,
      unitsOf: sortedEntries(unitsOf),
      selected: selected.map((p) => p.id),
      uniExcluded: [...uni.excludedIds].sort((a, b) => a - b),
      uniConflicts: uni.conflicts,
      lineKeys: sortedEntries(
        pieceLineKeysByPieceId(pieces, split, [
          { blockName: 'BP', pieceLineKey: 'BPKEY' },
          { blockName: 'FP_L', pieceLineKey: 'FPKEY' },
        ] as any),
      ),
    },
    modal: {
      counted: sortedEntries(counted),
      rows,
      planned: {
        bound: sortedEntries(planned.bound),
        created: planned.created,
        reused: planned.reused,
      },
      updates: upd,
      updatesIncomplete: updIncomplete,
      perGarment: M_.perGarmentFromBlocks(
        [...counted.values()].map((c: any) => ({
          identity: c.uniBase || c.block,
          instances: c.instances,
        })),
      ),
      defaultNames: [...counted.values()].map((c: any) => M_.defaultPieceName(c)),
    },
    norm,
  };
}
