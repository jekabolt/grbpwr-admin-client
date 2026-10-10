#!/usr/bin/env node
// FIX ROUND 2 of the assembly skeleton (tmp/plans/assembly-from-pattern/02-TASKS.md, «ДИП-РЕВЬЮ
// 10.10»): one gate per major the deep review found, each written so that the code BEFORE the fix
// fails it. Real functions only (fixes-entry.ts): the card side's category / lining / facts / gate
// and the engine itself, on the SS26-005 DXF and the probe fixture of its technologist's order.
//
//   1  category leaf-first: «shirts < tops» is a shirt, not a tee; lining read off links and names
//   2  append mode: the skeleton continues an order in progress (no code collisions, no consumed
//      piece re-sewn, sweep clean) or says «every piece is already in the order»; names in messages
//   3  shell + lining of one shape are NOT layers (null cloth is not «the same cloth»); CLR/CLR_1 are
//   5  a marker-sized file is refused in words, fast; empty / nameless files get their own reason
//   6  ×2 MIRRORED: one sleeve block covers both hands («Set sleeves ×2»), its edges meet both sides
//   7  no silent drops: a lone piece, an empty pattern, a piece without a key — all said
//   9  dress / skirt / jumpsuit / hoodie / coat-lined templates; Russian and Polish piece names
//   (8, order independence, is gated in seams.mjs: reversed input sews the same seams)
//
//   node scripts/assembly-skeleton/fixes.mjs [--verbose]

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outfile = resolve(tmpdir(), `assembly-skeleton-fixes-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'fixes-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  define: { 'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}' },
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
const E = await import(pathToFileURL(outfile).href);
const verbose = process.argv.includes('--verbose');

let failed = 0;
const gate = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const broken = (p) => p.warnings.filter((w) => /^rule \d+ broken/.test(w));
const NO_BOM = {
  zipper: 0,
  buttons: 0,
  snaps: 0,
  tape: 0,
  elastic: 0,
  drawcord: 0,
  interlining: 0,
};

const plans = process.env.SKELETON_PLANS ?? resolve(root, '../tmp/plans');
const quietly = async (f) => {
  const keep = [console.log, console.warn];
  console.log = console.warn = () => {};
  try {
    return await f();
  } finally {
    [console.log, console.warn] = keep;
  }
};
const dxf = (p) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const ssBytes = dxf(resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'));
const { facts: ssRaw } = await quietly(() => E.loadFacts(ssBytes, 'M', 'shirt'));

// ── 1. category, leaf first; lining from more than the colourway ─────────────────────────────
console.log('\n1 · category and lining');
{
  const cases = [
    [['shirts', 'tops'], false, 'shirt'],
    [['T-shirts', 'tops'], false, 'tee'],
    [['tops'], false, 'tee'],
    [['hoodies', 'sweatshirts', 'tops'], false, 'hoodie'],
    [['sweatpants', 'bottoms'], false, 'trousers'],
    [['blazers', 'jackets', 'outerwear'], true, 'jacket-lined'],
    [['blazers', 'jackets', 'outerwear'], false, 'generic'],
    [['parkas', 'outerwear'], true, 'coat-lined'],
    [['Рубашки', 'Верх'], false, 'shirt'],
    [['Платья'], false, 'dress'],
    [['Юбки'], false, 'skirt'],
    [['Комбинезоны'], false, 'jumpsuit'],
    [['Пальто'], true, 'coat-lined'],
    [['Koszulki'], false, 'tee'],
    [['Koszule'], false, 'shirt'],
    [['Spódnice'], false, 'skirt'],
  ];
  const bad = cases.filter(([n, l, want]) => E.skeletonCategoryOf(n, l) !== want);
  gate(
    `skeletonCategoryOf: ${cases.length} chains read leaf-first (SS26-005 «shirts < tops» → shirt)`,
    bad.length === 0,
    bad
      .map(
        ([n, l, w]) =>
          `${n.join(' < ')}${l ? ' lined' : ''} → ${E.skeletonCategoryOf(n, l)} (want ${w})`,
      )
      .join('; '),
  );
  const pieces = [{ name: 'FRONT' }, { name: 'BACK' }];
  const lined = [
    ['no signal', { cloth: null, pieces }, false],
    ['colourway cloth', { cloth: new Map([['a', { state: 'lining' }]]), pieces }, true],
    [
      'lining-scoped link',
      {
        cloth: null,
        pieces,
        aliases: [{ pieceLineKey: 'x', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING' }],
      },
      true,
    ],
    [
      'link to a lining BOM line',
      {
        cloth: null,
        pieces,
        aliases: [{ pieceLineKey: 'x', bomLineKey: 'L1' }],
        bomLines: [{ lineKey: 'L1', purpose: 'TECH_CARD_BOM_PURPOSE_LINING' }],
      },
      true,
    ],
    [
      'pattern on a lining fabric',
      { cloth: null, pieces, patterns: [{ fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING' }] },
      true,
    ],
    ['piece name LIN_FRONT', { cloth: null, pieces: [...pieces, { name: 'LIN_FRONT' }] }, true],
    [
      'piece name «подклад спинки»',
      { cloth: null, pieces: [...pieces, { name: 'подклад спинки' }] },
      true,
    ],
  ];
  const badL = lined.filter(([, a, want]) => E.skeletonLined(a) !== want);
  gate(
    'skeletonLined: cloth, links, files and names all say «lined»',
    badL.length === 0,
    badL.map(([w]) => w).join('; '),
  );
}

// ── 2. append mode on SS26-005: an order in progress ──────────────────────────────────────────
console.log('\n2 · append mode (SS26-005)');
{
  const ssFacts = { ...ssRaw, category: 'shirt' };
  const pieceKeys = new Set(ssFacts.pieces.map((p) => p.pieceKey));
  const names = new Map(ssFacts.pieces.map((p) => [p.pieceKey, p.name]));
  const asCheck = (s) => ({
    inputs: E.classifyAssemblyInputs(pieceKeys, s.inputs),
    outputUnitKey: s.outputUnitKey,
    outputUnitName: s.outputUnitName,
  });
  const full = E.proposeSkeleton(ssFacts, E.skeletonDeps);
  const joins = full.steps.filter((s) => s.outputUnitKey);
  // An order in progress the way a person makes one: the engine's own first steps, its own codes.
  for (const k of [Math.floor(full.steps.length / 3), Math.floor((2 * full.steps.length) / 3)]) {
    const existing = full.steps.slice(0, k).map(asCheck);
    const replay = E.replayExisting({ steps: existing }, pieceKeys);
    const p = E.proposeSkeleton({ ...ssFacts, existing: { steps: existing } }, E.skeletonDeps);
    const reSewn = p.steps.flatMap((s) => s.inputs).filter((x) => replay.consumed.has(x));
    const collide = p.steps.filter(
      (s) =>
        s.outputUnitKey &&
        replay.unitKeys.has(s.outputUnitKey) &&
        !s.inputs.includes(s.outputUnitKey),
    );
    const sweep = E.assemblySweep(
      ssFacts.pieces.map((q) => ({ lineKey: q.pieceKey, name: q.name })),
      [...existing, ...p.steps.map(asCheck)],
    );
    const hard = sweep.violations.filter((v) => v.rule !== 4 && v.step >= existing.length);
    const release = E.assemblyReleaseCheck(
      ssFacts.pieces.map((q) => ({ lineKey: q.pieceKey, name: q.name })),
      [...existing, ...p.steps.map(asCheck)],
      sweep,
    );
    const usesCard = p.steps.filter((s) => s.inputs.some((x) => replay.unitKeys.has(x))).length;
    console.log(
      `  card keeps ${k} steps (${replay.consumed.size} pieces sewn, ${replay.live.length} units on the table) → ${p.steps.length} steps, ${usesCard} sew the card's units on`,
    );
    if (verbose)
      p.steps.forEach((s) =>
        console.log(
          `    ${s.label}: ${s.inputs.map((x) => names.get(x) ?? `[${x}]`).join(' + ')} → ${s.outputUnitKey}`,
        ),
      );
    gate(
      `append after ${k}: no consumed piece sewn again`,
      reSewn.length === 0,
      reSewn.map((x) => names.get(x)).join(', '),
    );
    gate(
      `append after ${k}: no unit code of the card reused`,
      collide.length === 0,
      collide.map((s) => s.outputUnitKey).join(', '),
    );
    gate(
      `append after ${k}: card + draft sweep clean (rules 1–3, 6, 7), one terminal`,
      hard.length === 0 && broken(p).length === 0 && release.length === 0,
      [...hard.map((v) => v.message), ...broken(p), ...release.map((v) => v.message)]
        .slice(0, 3)
        .join(' | '),
    );
    gate(`append after ${k}: the draft sews the card's own units on`, usesCard > 0, `${usesCard}`);
  }
  const all = E.replayExisting({ steps: full.steps.map(asCheck) }, pieceKeys);
  gate(
    'the whole order on the card: every piece consumed → «nothing to add» (the panel does not read)',
    ssFacts.pieces.every((q) => all.consumed.has(q.pieceKey)),
    `${all.consumed.size}/${ssFacts.pieces.length}`,
  );
  // Messages: a 26-character piece key is replaced by its name.
  const key = '01M1M1S2WR0EY99A13FQ0FJK6G';
  const msg = E.namesIn(`“${key}” is already consumed by step 3`, new Map([[key, '2CLR']]));
  gate(
    'rule messages quote piece NAMES, not keys',
    msg === '“2CLR” is already consumed by step 3',
    msg,
  );
}

// ── 3. shell and lining of one shape are not layers ───────────────────────────────────────────
console.log('\n3 · identical layers need one fabric');
{
  const bp = ssRaw.pieces.find((p) => p.name === 'BP');
  const clrs = ssRaw.pieces.filter((p) => p.name === 'CLR' || p.name === 'CLR_1');
  const cases = [
    // a numbered copy of the back, no cloth anywhere: shell and its lining as a CLO file names them
    [
      'BP + «17» (same shape, no cloth, no common name)',
      [{ ...bp }, { ...bp, pieceKey: '17', name: '17' }],
      false,
    ],
    [
      'BP main + BP lining',
      [
        { ...bp, cloth: 'main' },
        { ...bp, pieceKey: 'BP_LIN', name: 'BP_LIN', cloth: 'lining' },
      ],
      false,
    ],
    [
      'BP + LINING_BP (lining by name)',
      [{ ...bp }, { ...bp, pieceKey: 'LINING_BP', name: 'LINING_BP' }],
      false,
    ],
    [
      'CLR + CLR_1 (no cloth, one family) — the golden',
      clrs.map((p) => ({ ...p, cloth: null })),
      true,
    ],
  ];
  for (const [label, pieces, want] of cases) {
    const facts = { ...ssRaw, pieces, category: 'generic' };
    const g = E.readSeamGraph(facts);
    const [a, b] = g.pieces;
    const kind = E.twinKind(a, b);
    const geoms = new Map(g.pieces.map((p) => [p.pieceKey, p]));
    const layout = E.unionLayout(
      g.pieces.map((p) => p.pieceKey),
      g.chosen,
      geoms,
    );
    const stacked = layout.stacked.some((s) => s.length >= 2);
    gate(
      `${label}: ${want ? 'stacked as layers' : 'NOT stacked'}`,
      want ? kind === 'identical' && stacked : kind !== 'identical' && !stacked,
      `twin ${kind ?? 'none'}, stacked ${JSON.stringify(layout.stacked)}`,
    );
  }
}

// ── 3b. the same shape, not proven twins: never matched, asked in words ─────────────────────
{
  const bp = ssRaw.pieces.find((p) => p.name === 'BP');
  const facts = {
    ...ssRaw,
    pieces: [{ ...bp }, { ...bp, pieceKey: '17', name: '17' }],
    category: 'shirt',
  };
  const p = E.proposeSkeleton(facts, E.skeletonDeps);
  const pk = (id) => id.slice(0, id.lastIndexOf('#'));
  const seams = p.graph.chosen.filter((c) => new Set([pk(c.a), pk(c.b)]).size === 2);
  const joined = p.steps.filter((s) => s.inputs.includes('BP') && s.inputs.includes('17'));
  const said = p.warnings.find((w) => /(BP and 17|17 and BP) have the same shape/.test(w));
  gate(
    'BP + congruent «17» (no cloth): no seam between them, no join, asked in words',
    seams.length === 0 && joined.length === 0 && !!said,
    `${seams.length} seams, ${joined.map((s) => s.label).join(', ') || 'no join'}; ${said ?? 'no warning'}`,
  );
}

// ── 4. the print sheet reads the screen's graph ──────────────────────────────────────────────
console.log('\n4 · print = screen');
{
  // A card whose back has a lining twin of the same name family (BP / BP_1): only the colourway
  // tells them apart. The print once passed cloth = null and no category.
  const bp = ssRaw.pieces.find((p) => p.name === 'BP');
  const pieces = [{ ...bp }, { ...bp, pieceKey: 'BP_1', name: 'BP_1' }];
  const readCard = {
    colorways: [
      {
        usages: [
          { pieceLineKey: bp.pieceKey, bomLineKey: 'MAIN' },
          { pieceLineKey: 'BP_1', bomLineKey: 'LIN' },
        ],
      },
    ],
    techCard: { bomItems: [] },
  };
  const formBom = [
    {
      lineKey: 'MAIN',
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    },
    {
      lineKey: 'LIN',
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    },
  ];
  const cloth = E.firstColorwayCloth(readCard, formBom);
  const withCloth = (m) => pieces.map((p) => ({ ...p, cloth: m?.get(p.pieceKey)?.state ?? null }));
  const category = E.skeletonCategoryOf(['shirts', 'tops'], E.skeletonLined({ cloth, pieces }));
  const sig = (g) =>
    JSON.stringify([
      g.chosen.map((c) => [c.a, c.b].sort().join('~')).sort(),
      g.pieces
        .map((p) => p.twinOf.map((t) => `${p.pieceKey}:${t.kind}`))
        .flat()
        .sort(),
    ]);
  const screen = E.readSeamGraph({ ...ssRaw, pieces: withCloth(cloth), category });
  const print = E.readSeamGraph({
    ...ssRaw,
    pieces: withCloth(E.firstColorwayCloth(readCard, formBom)),
    category,
  });
  const old = E.readSeamGraph({ ...ssRaw, pieces: withCloth(null), category: 'generic' });
  gate(
    "firstColorwayCloth (the print's cloth) reads the lining of the first colourway",
    cloth?.get('BP_1')?.state === 'lining' && cloth?.get(bp.pieceKey)?.state === 'main',
    JSON.stringify([...(cloth ?? new Map())]),
  );
  gate("print inputs give the screen's graph", sig(screen) === sig(print));
  gate(
    'control: the old print inputs (no cloth, generic) read another graph — lining as a layer',
    sig(old) !== sig(screen) &&
      old.pieces.some((p) => p.twinOf.some((t) => t.kind === 'identical')),
  );
}

// ── 5. a marker-sized file is refused in words, fast; empty / nameless files say why ─────────
console.log('\n5 · caps and unreadable files');
{
  const many = Array.from({ length: E.SKELETON.maxPieces + 50 }, (_, i) => ({
    ...ssRaw.pieces[i % ssRaw.pieces.length],
    pieceKey: `P${i}`,
    name: `P${i}`,
  }));
  const t0 = performance.now();
  const p = E.proposeSkeleton({ ...ssRaw, pieces: many }, E.skeletonDeps);
  const ms = performance.now() - t0;
  gate(
    `${many.length} pieces: refused in words, no compute`,
    p.steps.length === 0 && ms < 200 && p.warnings.some((w) => /more than \d+/.test(w)),
    `${ms.toFixed(0)} ms · ${p.warnings[0]}`,
  );
  const shapes = (n) => new Map(Array.from({ length: n }, (_, i) => [`k${i}`, { piece: {} }]));
  const g = (extra) => E.skeletonGate({ frozen: false, hasDxf: true, available: true, ...extra });
  const big = g({ shapes: shapes(541), parsedPieces: 541, namedBlocks: 541 });
  const empty = g({ shapes: new Map(), parsedPieces: 0, namedBlocks: 0 });
  const nameless = g({ shapes: new Map([['a', null]]), parsedPieces: 541, namedBlocks: 0 });
  const ok = g({ shapes: shapes(25), parsedPieces: 50, namedBlocks: 25 });
  gate(
    'door: 541 contoured pieces → shut, says why',
    !big.open && /541 pieces/.test(big.why),
    big.why,
  );
  gate(
    'door: empty DXF (0 pieces) → shut, says the file is empty',
    !empty.open && /no pieces/.test(empty.why),
    empty.why,
  );
  gate(
    'door: contours without names (RC28) → shut, says re-export with names',
    !nameless.open && /no piece names/.test(nameless.why),
    nameless.why,
  );
  gate('door: a garment opens', ok.open);
}

// ── 6. ×2 MIRRORED: one block, both hands ─────────────────────────────────────────────────────
console.log('\n6 · ×2 mirrored blocks (SS26-005 with the right-hand blocks removed)');
{
  const isR = (n) => /(^|_)R$/.test(n);
  const isL = (n) => /(^|_)L$/.test(n);
  const half = ssRaw.pieces
    .filter((p) => !isR(p.name))
    .map((p) =>
      isL(p.name)
        ? { ...p, piecesPerGarment: 2, cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED' }
        : p,
    );
  const facts = { ...ssRaw, pieces: half, category: 'shirt' };
  const p = E.proposeSkeleton(facts, E.skeletonDeps);
  const names = new Map(half.map((q) => [q.pieceKey, q.name]));
  if (verbose)
    p.steps.forEach((s) =>
      console.log(
        `    ${s.label}: ${s.inputs.map((x) => names.get(x) ?? `[${x}]`).join(' + ')} → ${s.outputUnitName}`,
      ),
    );
  const sleeves = p.steps.find((s) => /^Set sleeves/.test(s.label ?? ''));
  gate(
    '«Set sleeves ×2»: one step sets the one sleeve block for both hands',
    !!sleeves && /×2$/.test(sleeves.label),
    sleeves?.label ?? 'no sleeve step',
  );
  const terminals = new Set(p.steps.filter((s) => s.outputUnitKey).map((s) => s.outputUnitKey));
  // a join consumes its inputs; a processing step (hem, press) consumes nothing
  for (const s of p.steps)
    if (s.outputUnitKey) for (const x of s.inputs) if (x !== s.outputUnitKey) terminals.delete(x);
  gate(
    'sweep clean, one terminal unit holds every piece',
    broken(p).length === 0 &&
      terminals.size === 1 &&
      !p.warnings.some((w) => /never reach|terminal/.test(w)),
    [...broken(p), ...p.warnings.filter((w) => /never reach|terminal/.test(w))].join(' | '),
  );
  // An edge of a ×2 block meets two edges of one symmetric piece: its own hand and the reflected.
  const g = p.graph;
  const by = new Map();
  for (const c of g.chosen) {
    for (const [mine, other] of [
      [c.a, c.b],
      [c.b, c.a],
    ]) {
      const piece = mine.slice(0, mine.lastIndexOf('#'));
      if (!half.find((q) => q.pieceKey === piece && q.piecesPerGarment === 2)) continue;
      const k = `${mine}→${other.slice(0, other.lastIndexOf('#'))}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
  }
  const pairs = [...by.entries()]
    .filter(([, n]) => n === 2)
    .map(([k]) =>
      k
        .replace(/#.*→/, '→')
        .split('→')
        .map((x) => names.get(x) ?? x)
        .join(' → both sides of '),
    );
  gate(
    'seams matched as a mirrored pair: a ×2 edge meets both sides of one piece',
    pairs.length > 0,
    pairs.join('; ') || 'none',
  );
  // Control: the same card WITHOUT ×2 — the sleeve is a left one and the label says nothing.
  const left = E.proposeSkeleton(
    { ...ssRaw, pieces: ssRaw.pieces.filter((q) => !isR(q.name)), category: 'shirt' },
    E.skeletonDeps,
  );
  const ls = left.steps.find((s) => /^Set sleeves/.test(s.label ?? ''));
  gate(
    'control: without ×2 the same card has no «×2» step',
    !ls || !/×2/.test(ls.label),
    ls?.label,
  );
  // FOLD is one piece, whatever the count.
  const fold = E.proposeSkeleton(
    {
      ...ssRaw,
      pieces: ssRaw.pieces.map((q) =>
        q.name === 'BP'
          ? { ...q, piecesPerGarment: 2, cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD' }
          : q,
      ),
      category: 'shirt',
    },
    E.skeletonDeps,
  );
  gate(
    'FOLD ×2 is one piece: no «×2» anywhere',
    !fold.steps.some((s) => /×\d/.test(`${s.label} ${s.outputUnitName}`)),
  );
}

// ── 7. no silent drops ────────────────────────────────────────────────────────────────────────
console.log('\n7 · nothing dropped silently');
{
  const lone = { ...ssRaw, pieces: [ssRaw.pieces.find((p) => p.name === 'BP')], category: 'shirt' };
  const p = E.proposeSkeleton(lone, E.skeletonDeps);
  gate(
    'one piece with a role: no step, but a warning naming it',
    p.steps.length === 0 && p.warnings.some((w) => w.includes('BP')),
    p.warnings.join(' | '),
  );
  const e = E.proposeSkeleton({ ...ssRaw, pieces: [] }, E.skeletonDeps);
  gate(
    'no contoured piece: the proposal says so',
    e.warnings.some((w) => /nothing in the pattern/.test(w)),
    e.warnings.join(' | '),
  );
  const built = E.buildSkeletonFacts({
    pieces: [{ name: 'Pocket bag' }, { lineKey: 'k1', name: 'FRONT' }],
    shapes: new Map(),
    cloth: null,
    bomLines: [],
    category: 'generic',
    defaultMachineType: null,
  });
  gate(
    'a card piece without a key is reported, not skipped',
    built.withoutKey.includes('Pocket bag'),
    JSON.stringify(built.withoutKey),
  );
}

// ── 9. every new garment template, and names in Russian / Polish ─────────────────────────────
console.log('\n9 · garment templates and languages');
{
  const card = (category, list, bom = {}) => ({
    graph: null,
    facts: {
      pieces: list.map((n) => ({
        pieceKey: n,
        name: n,
        piece: null,
        piecesPerGarment: 1,
        cutSymmetry: null,
        cloth: /^LIN_/.test(n) ? 'lining' : 'main',
        fused: false,
      })),
      category,
      bom: { ...NO_BOM, ...bom },
      defaultMachineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
    },
  });
  const EMPTY = { pieces: [], chosen: [], rejected: [], components: [], warnings: [] };
  const cards = [
    card(
      'dress',
      [
        'FRONT',
        'BACK_L',
        'BACK_R',
        'SLEEVE_L',
        'SLEEVE_R',
        'COLLAR',
        'SKIRT_FRONT',
        'SKIRT_BACK_L',
        'SKIRT_BACK_R',
        'FACING',
      ],
      { zipper: 1 },
    ),
    card(
      'skirt',
      ['FRONT', 'BACK_L', 'BACK_R', 'WB', 'POCKET_BAG_L', 'POCKET_BAG_R', 'LIN_FRONT', 'LIN_BACK'],
      { zipper: 1, buttons: 1 },
    ),
    card(
      'jumpsuit',
      [
        'FRONT_L',
        'FRONT_R',
        'BACK_L',
        'BACK_R',
        'SLEEVE_L',
        'SLEEVE_R',
        'COLLAR',
        'POCKET_L',
        'POCKET_R',
        'BELT',
      ],
      { zipper: 1 },
    ),
    card(
      'hoodie',
      [
        'FRONT',
        'BACK',
        'SLEEVE_L',
        'SLEEVE_R',
        'HOOD_L',
        'HOOD_R',
        'HOOD_CENTER',
        'CUFF_RIB',
        'HEM_RIB',
        'POCKET',
      ],
      { drawcord: 1 },
    ),
    card(
      'coat-lined',
      [
        'FRONT_L',
        'FRONT_R',
        'BACK',
        'SLEEVE_L',
        'SLEEVE_R',
        'COLLAR',
        'UNDER_COLLAR',
        'FACING_L',
        'FACING_R',
        'LIN_FRONT_L',
        'LIN_FRONT_R',
        'LIN_BACK',
        'LIN_SLEEVE_L',
        'LIN_SLEEVE_R',
      ],
      { buttons: 1 },
    ),
    card(
      'shirt',
      [
        'Перед лев',
        'Перед прав',
        'Спинка',
        'Кокетка',
        'Рукав лев',
        'Рукав прав',
        'Воротник',
        'Стойка',
        'Манжета лев',
        'Манжета прав',
      ],
      { buttons: 1 },
    ),
    card(
      'trousers',
      [
        'Przód lewy',
        'Przód prawy',
        'Tył lewy',
        'Tył prawy',
        'Pasek',
        'Kieszeń lewa',
        'Kieszeń prawa',
      ],
      { zipper: 1 },
    ),
  ];
  for (const c of cards) {
    // names only, no seams (the template smoke of skeleton.mjs, for the new templates)
    const p = E.buildSkeleton(EMPTY, c.facts, E.orderTemplate(c.facts.category), E.skeletonDeps);
    const bad = p.warnings.filter((w) =>
      /rule \d+ broken|terminal|never reach|outside every unit/.test(w),
    );
    const units = p.steps.filter((s) => s.outputUnitKey).map((s) => s.outputUnitName);
    const unread = c.facts.pieces.filter((q) => !E.readName(q.name).role).map((q) => q.name);
    console.log(
      `  ${c.facts.category} (${p.template}): ${p.steps.length} steps — ${units.join(' · ')}`,
    );
    for (const w of p.warnings) if (verbose) console.log(`    · ${w}`);
    gate(
      `${c.facts.category}${/[^\x00-\x7f]/.test(c.facts.pieces[0].name) ? ' (names not in English)' : ''}: own template, every name read, sweep clean, one terminal`,
      p.template === c.facts.category && bad.length === 0 && unread.length === 0,
      [
        ...bad,
        ...unread.map((n) => `no role: ${n}`),
        p.template !== c.facts.category ? `template ${p.template}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
  }
}

function buildOn(graph, facts) {
  return E.buildSkeletonOn(graph, facts);
}

console.log(failed ? `\n${failed} FAILED` : '\nall gates green');
process.exit(failed ? 1 : 0);
