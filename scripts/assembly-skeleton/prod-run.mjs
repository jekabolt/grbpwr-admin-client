#!/usr/bin/env node
// PROD RUN of the assembly skeleton — every card with a DXF, through the tech card's own chain
// (prod-run-entry.ts says which functions, in which order). READ-ONLY: the cards come from files
// on disk (a prod DB dump or a card export), never from a live API; nothing is written back.
//
//   node scripts/assembly-skeleton/prod-run.mjs [--cards cards.json] [--corpus <dir>] [--out <dir>]
//
// cards.json: [{ code, source, card: <common_TechCard JSON>, categoryNames: [leaf, …, root],
//               files: { "<pattern url>": "<local dxf path>" } }]
// --export <dir>: a grbpwr-techcard-archive folder (card.json + manifest.json + patterns/*.dxf).
// --corpus <dir>: every *.dxf in it as a synthetic card (one piece per block) — NOT prod data.
// Size dictionary: the export's id_maps.sizes (the prod dictionary), else SIZE_NAMES json.
//
// Out (default ../tmp/plans/assembly-from-pattern/prod-run): <code>.json per card, <code>.stand.json
// (form + contours for the UI stand), <code>-route.svg / -map.svg, summary.json, summary.txt.
// No prod data or URLs are committed — the out folder is outside the repo.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const argsAll = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const OUT = resolve(arg('--out') ?? resolve(root, '../tmp/plans/assembly-from-pattern/prod-run'));
mkdirSync(OUT, { recursive: true });

const outfile = resolve(tmpdir(), `prod-run-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'prod-run-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'error',
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
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
      'styles',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
// browser globals some modules read at import time (never used by the measured code)
globalThis.window ??= globalThis;
globalThis.location ??= {
  origin: 'http://probe.local',
  href: 'http://probe.local/',
  pathname: '/',
  search: '',
  hash: '',
};
globalThis.document ??= {
  createElement: () => ({ getContext: () => null, style: {} }),
  addEventListener: () => {},
  documentElement: { style: {} },
};
globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const E = await import(pathToFileURL(outfile).href);

const ab = (path) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

let sizeNames = process.env.SIZE_NAMES
  ? JSON.parse(readFileSync(process.env.SIZE_NAMES, 'utf8'))
  : null;
const inputs = [];

// a card export folder (prod card)
for (const dir of argsAll('--export')) {
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const card = JSON.parse(readFileSync(resolve(dir, 'card.json'), 'utf8'));
  const idx = JSON.parse(readFileSync(resolve(dir, 'patterns/index.json'), 'utf8'));
  sizeNames ??= manifest.id_maps?.sizes ?? {};
  const files = {};
  for (const p of card.techCard.patterns ?? []) {
    const row = idx.find((r) => r.line_key === p.lineKey);
    // the export keeps the file, not its CDN url — give it a stable stand-in url
    const local =
      row && existsSync(resolve(dir, row.file))
        ? resolve(dir, row.file)
        : resolve(dir, 'patterns/dxf.dxf');
    p.url ||= `https://files.example.invalid/${p.lineKey}/${encodeURIComponent(p.filename || 'p.dxf')}`;
    if (existsSync(local)) files[p.url] = ab(local);
  }
  const chain = [...(manifest.id_maps?.category_path ?? [])].reverse(); // leaf first
  inputs.push({
    code: card.techCard.styleNumber,
    source: `prod card export ${basename(dir)} (backend ${manifest.source?.host}, ${manifest.exported_at})`,
    card,
    categoryNames: chain,
    files,
    sizeNames,
  });
  // the same card with the LEAF only (what the UI probe passes) — measures the category chain's cost
  inputs.push({
    ...inputs[inputs.length - 1],
    code: `${card.techCard.styleNumber}~leaf`,
    source: 'same card, category chain cut to its leaf (as ui-probe scenario G mounts it)',
    categoryNames: chain.slice(0, 1),
  });
  // the same card with its order cut in half: an order in progress, what «add» is for
  const ops = card.techCard.operations ?? [];
  if (ops.length > 1) {
    const cut = structuredClone(card);
    cut.techCard.operations = ops.slice(0, Math.floor(ops.length / 2));
    inputs.push({
      ...inputs[inputs.length - 2],
      code: `${card.techCard.styleNumber}~half`,
      source: `same card, order cut to its first ${cut.techCard.operations.length} steps (append mode)`,
      card: cut,
    });
  }
}

// cards.json (a DB dump made into cards)
if (arg('--cards')) {
  for (const c of JSON.parse(readFileSync(arg('--cards'), 'utf8'))) {
    const files = {};
    for (const [url, path] of Object.entries(c.files ?? {})) files[url] = ab(path);
    inputs.push({ ...c, files, sizeNames: sizeNames ?? {} });
  }
}

// corpus DXFs as synthetic cards (category by file name; not prod)
const CORPUS_CATEGORY = [
  [/blazer/i, ['blazer', 'jackets', 'outerwear']],
  [/allsizes/i, ['shirts', 'tops']],
  [/summer men/i, ['shirts', 'tops']],
  [/pocket/i, []],
  [/RC28/i, []],
];
if (arg('--corpus')) {
  const dir = arg('--corpus');
  for (const f of readdirSync(dir)
    .filter((x) => /\.dxf$/i.test(x))
    .sort()) {
    const cat = CORPUS_CATEGORY.find(([re]) => re.test(f))?.[1] ?? [];
    try {
      inputs.push(await E.synthCard(f, ab(resolve(dir, f)), sizeNames ?? {}, cat));
    } catch (e) {
      console.log(`${f}: synthCard threw ${e.message}`);
    }
  }
}

console.log(`${inputs.length} cards`);
const summary = [];
for (const input of inputs) {
  const t0 = performance.now();
  let res;
  try {
    // hang guard: a card that does not finish in 60 s is a finding, not a stuck run
    res = await Promise.race([
      E.runCard(input),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT 60 s')), 60_000).unref()),
    ]);
  } catch (e) {
    const r = { code: input.code, source: input.source, errors: [`runCard threw: ${e.stack}`] };
    summary.push(r);
    console.log(`\n${input.code}: THREW ${e.message}`);
    continue;
  }
  const safe = input.code.replace(/[^\w.~-]+/g, '_');
  writeFileSync(resolve(OUT, `${safe}.json`), JSON.stringify(res.report, null, 2));
  writeFileSync(resolve(OUT, `${safe}.stand.json`), JSON.stringify(res.stand));
  if (res.proposal)
    writeFileSync(
      resolve(OUT, `${safe}.proposal.json`),
      JSON.stringify({ ...res.proposal, graph: undefined }, null, 1),
    );
  if (res.print) {
    writeFileSync(resolve(OUT, `${safe}-route.svg`), res.print.route);
    writeFileSync(resolve(OUT, `${safe}-map.svg`), res.print.map);
    if (res.print.seams) writeFileSync(resolve(OUT, `${safe}-seams.svg`), res.print.seams);
  }
  summary.push(res.report);
  const r = res.report;
  console.log(
    `\n${r.code}  [${r.category} ← ${r.categoryChain || '∅'}]  ${(performance.now() - t0).toFixed(0)} ms` +
      `\n  pieces ${r.piecesInCard}, matched ${r.matched}, unmatched ${r.unmatched?.length}; dxf ${r.dxf?.length} (${r.dxf?.map((d) => d.purpose || 'UNSET').join(',')})` +
      `\n  seams ${JSON.stringify(r.seams)}; steps ${r.steps} (units ${r.units}, riders ${r.riders}); to decide ${r.toDecide}; unresolved ${r.unresolvedEdgePairs}; left out ${r.leftOut?.length}` +
      `\n  gate ${JSON.stringify(r.gate)}` +
      `\n  sweep replace ${JSON.stringify(r.sweep_replace)}; old naive append ${r.sweep_appendNaive?.hard}` +
      (r.append?.length
        ? `\n  APPEND ${JSON.stringify(r.append.map(({ stepList, ...x }) => x))}`
        : '') +
      `\n  write ${JSON.stringify(r.write)}` +
      (r.compare
        ? `\n  vs technologist: ${r.compare.byInputs}/${r.compare.technologistJoins} by inputs, ${r.compare.byContents} by contents; order ${r.compare.orderInversions}`
        : '') +
      (r.pictures
        ? `\n  pictures ${JSON.stringify(r.pictures)}; print differs ${r.printDiffers?.length}`
        : '') +
      (r.mapCard ? `\n  map(card) ${JSON.stringify(r.mapCard)}` : '') +
      (r.mapProposal ? `\n  map(proposal) ${JSON.stringify(r.mapProposal)}` : '') +
      (r.seamSheet ? `\n  SEAM MAP ${JSON.stringify(r.seamSheet)}` : '') +
      (r.ai ? `\n  AI request ${JSON.stringify(r.ai)}` : '') +
      (r.errors.length ? `\n  ERRORS ${r.errors.join(' || ')}` : ''),
  );
}
writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

// compact table
const row = (r) =>
  [
    r.code,
    r.category ?? '-',
    `${r.matched ?? '-'}/${r.piecesInCard ?? '-'}`,
    r.dxf?.length ?? '-',
    r.seams ? `${r.seams.chosen}/${r.seams.ambiguous}/${r.seams.rejected}` : '-',
    r.units ?? '-',
    r.steps ?? '-',
    r.toDecide ?? '-',
    r.leftOut?.length ?? '-',
    r.sweep_replace
      ? `${r.sweep_replace.hard}/${r.append?.length ? r.append.map((a) => (a.message ? 'all-in' : a.hard)).join(',') : '-'}`
      : '-',
    r.write ? `${r.write.zodReplaceOps}/${r.write.zodAppendOps}` : '-',
    r.compare
      ? `${r.compare.byInputs}/${r.compare.byContents}/${r.compare.technologistJoins}`
      : '-',
    r.pictures
      ? `${r.pictures.pictures}/${r.pictures.units} ov${(100 * r.pictures.maxOverlap).toFixed(0)}%`
      : '-',
    r.mapCard
      ? `${r.mapCard.coveragePct}%/${r.mapCard.families}f/${r.mapCard.numberedEdges}e ov${r.mapCard.pairMaxOverlapPct}%`
      : '-',
    r.seamSheet ? `${r.seamSheet.size}${r.seamSheet.fits ? '' : ' NOFIT'}` : '-',
    r.ai
      ? r.ai.ok
        ? r.ai.serverRefusal
          ? `REFUSED ${r.ai.serverRefusal}`
          : `ok ${r.ai.bytes}B`
        : `no: ${r.ai.why}`
      : '-',
    `${r.proposalMs ?? '-'}`,
    r.errors?.length ?? 0,
  ].join(' | ');
const table = [
  'code | template | matched/pieces | dxf | seams ch/amb/rej | units | steps | to decide | left out | sweep rep/app(cuts) | zod rep/app | tech in/cont/joins | pics/units maxov | map(card) cov/fam/edges ov | seam sheet | AI req | ms | err',
  ...summary.map(row),
].join('\n');
writeFileSync(resolve(OUT, 'summary.txt'), table + '\n');
console.log(`\n${table}\n\nout → ${OUT}`);
