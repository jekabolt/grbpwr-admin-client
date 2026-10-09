#!/usr/bin/env node
// F6b PROBE — the card trusts the conversion manifest, and ONLY where there is one.
//
//   node scripts/pattern-import/f6b.mjs            (yarn patimport:f6b)
//
// Four bundles of the same machinery:
//   base   — the tree before F6b (git archive of F6B_BASE, default 48ebc92f) + f6b-fingerprint-entry
//   head   — this tree + f6b-fingerprint-entry and f6b-entry (manifest unit tests + K1 fixtures)
//   open   — HEAD with the gate forced OPEN (manifest-facts.ts fabricates facts for every block)
//   shut   — HEAD with the gate forced SHUT (manifest-facts.ts always answers null)
//
// Pass criteria:
//   1. regression: for every file WITHOUT a manifest (corpus/dxf-clo/*.dxf, the 13 K1 fixtures, the
//      K1 e-pack) the base and head fingerprints are byte-identical;
//   2. negative control A: the `open` fingerprints DIFFER from base on those same files — the
//      regression can see the gate;
//   3. f6b-entry: every manifest assertion passes on head;
//   4. negative control B: on `shut`, the manifest-behaviour assertions FAIL — they test the
//      manifest, not something that was true anyway.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const PLANS =
  process.env.PATIMPORT_PLANS ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf';
const CORPUS = process.env.PATIMPORT_CORPUS ?? join(PLANS, 'corpus');
const K1 = join(PLANS, 'k1-work', 'fixtures');
const BASE = process.env.F6B_BASE ?? '48ebc92f';

const work = mkdtempSync(join(tmpdir(), 'f6b-'));
const baseRoot = join(work, 'base');
mkdirSync(baseRoot);
execFileSync('sh', [
  '-c',
  `git -C "${REPO}" archive ${BASE} src tsconfig.json global.d.ts | tar -x -C "${baseRoot}"`,
]);
symlinkSync(resolve(REPO, 'node_modules'), join(baseRoot, 'node_modules'));
mkdirSync(join(baseRoot, 'scripts', 'pattern-import'), { recursive: true });
copyFileSync(
  join(HERE, 'f6b-fingerprint-entry.ts'),
  join(baseRoot, 'scripts', 'pattern-import', 'f6b-fingerprint-entry.ts'),
);

const MODAL_RE = /nesting[\\/]piece-match-modal\.tsx$/;
const FACTS_RE = /nesting[\\/]manifest-facts\.ts$/;
const KEEP_FROM_MODAL = new Set(['./block-code', '../piece-codes', './manifest-facts']);
const COMMON_EXPORTS = [
  'perGarmentFromBlocks',
  'planPieceUpdates',
  'plannedScopeBinding',
  'sizelessStem',
  'defaultPieceName',
  'CREATE',
  'loose',
  'similarity',
];

const GATE_OPEN = `
export function manifestFactsOf(p) {
  if (p.manifest) return p.manifest;
  const raw = (p.blockName ?? '').trim();
  if (!raw) return null;
  const parts = raw.split('_');
  const size = parts.length > 1 ? parts[parts.length - 1] : '';
  const identity = parts.length > 1 ? parts.slice(0, -1).join('_') : raw;
  return { identity, size, sizeId: 0, cardName: identity, pairHand: null, pairOf: null, unfolded: false,
    cutLayer: '1', seamLayer: '14', grainLayer: '7', cutAllowanceCm: 1 };
}`;
const GATE_SHUT = `export function manifestFactsOf() { return null; }`;

async function bundle(root, entry, tag, gate) {
  const outfile = join(work, `${tag}.mjs`);
  const exportsFor = (src) =>
    [
      ...COMMON_EXPORTS,
      ...(src.includes('function countBlocks(') ? ['countBlocks', 'proposeRows'] : []),
    ].join(', ');
  await build({
    entryPoints: [join(root, 'scripts', 'pattern-import', entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'error',
    absWorkingDir: root,
    tsconfig: join(root, 'tsconfig.json'),
    nodePaths: [join(root, 'src'), join(REPO, 'node_modules')],
    jsx: 'automatic',
    plugins: [
      {
        name: 'f6b',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) => {
            if (MODAL_RE.test(args.importer) && !KEEP_FROM_MODAL.has(args.path)) {
              return { path: args.path, namespace: 'f6b-stub' };
            }
            return undefined;
          });
          b.onLoad({ filter: /.*/, namespace: 'f6b-stub' }, () => ({
            contents:
              'const f = () => f; module.exports = new Proxy(f, { get: (_t, k) => (k === "__esModule" ? false : f) });',
            loader: 'js',
          }));
          b.onLoad({ filter: MODAL_RE }, (args) => {
            const src = readFileSync(args.path, 'utf8');
            return {
              contents: `${src}\nexport { ${exportsFor(src)} };\n`,
              loader: 'tsx',
              resolveDir: dirname(args.path),
            };
          });
          if (gate) {
            b.onLoad({ filter: FACTS_RE }, () => ({ contents: gate, loader: 'ts' }));
          }
        },
      },
    ],
  });
  return import(pathToFileURL(outfile).href);
}

const legacyInputs = [];
for (const f of readdirSync(join(CORPUS, 'dxf-clo'))
  .filter((n) => n.toLowerCase().endsWith('.dxf'))
  .sort()) {
  legacyInputs.push({ id: `corpus/${f}`, files: [join(CORPUS, 'dxf-clo', f)] });
}
for (const f of readdirSync(K1)
  .filter((n) => n.endsWith('.dxf'))
  .sort()) {
  legacyInputs.push({ id: `k1/${f}`, files: [join(K1, f)] });
}
legacyInputs.push({
  id: 'k1/e-pack',
  files: ['e-shell.dxf', 'e-lining.dxf', 'e-interlining.dxf'].map((f) => join(K1, f)),
});
const sheetsOf = (files) =>
  files.map((p) => ({ name: p.split('/').pop(), bytes: new Uint8Array(readFileSync(p)) }));

const t0 = Date.now();
const [base, head, open, shut] = await Promise.all([
  bundle(baseRoot, 'f6b-fingerprint-entry.ts', 'base', null),
  bundle(REPO, 'f6b-fingerprint-entry.ts', 'head', null),
  bundle(REPO, 'f6b-fingerprint-entry.ts', 'open', GATE_OPEN),
  bundle(REPO, 'f6b-fingerprint-entry.ts', 'shut', GATE_SHUT),
]);
const [tests, testsShut] = await Promise.all([
  bundle(REPO, 'f6b-entry.ts', 'tests', null),
  bundle(REPO, 'f6b-entry.ts', 'tests-shut', GATE_SHUT),
]);

const report = { base: BASE, regression: [], negativeA: [], tests: [], negativeB: [] };
let failed = 0;

for (const input of legacyInputs) {
  const sheets = sheetsOf(input.files);
  const b = JSON.stringify(await base.fingerprint(sheets));
  const h = JSON.stringify(await head.fingerprint(sheets));
  const s = JSON.stringify(await shut.fingerprint(sheets));
  const o = JSON.stringify(await open.fingerprint(sheets));
  const same = b === h && b === s;
  if (!same) failed++;
  let firstDiff = null;
  if (b !== h) {
    let i = 0;
    while (i < b.length && b[i] === h[i]) i++;
    firstDiff = {
      at: i,
      base: b.slice(Math.max(0, i - 80), i + 80),
      head: h.slice(Math.max(0, i - 80), i + 80),
    };
  }
  report.regression.push({ id: input.id, bytes: b.length, identical: same, firstDiff });
  // A file without a single block has nothing a manifest could ever describe (the gate keys on block
  // names): it cannot go red, and it is not counted.
  const hasBlocks = JSON.parse(b).parse.blockNames.length > 0;
  report.negativeA.push({ id: input.id, hasBlocks, gateOpenDiffers: o !== b });
  console.log(
    `${same ? 'ok  ' : 'FAIL'} regression ${input.id} (${b.length} B)${o !== b ? '' : '  [gate-open did not change it]'}`,
  );
}
const withBlocks = report.negativeA.filter((x) => x.hasBlocks);
const openRed = withBlocks.filter((x) => x.gateOpenDiffers).length;
for (const x of withBlocks.filter((y) => !y.gateOpenDiffers))
  console.log(`     gate-open left unchanged: ${x.id}`);
const negAok = openRed === withBlocks.length && withBlocks.length > 0;
if (!negAok) failed++;
console.log(
  `${negAok ? 'ok  ' : 'FAIL'} negative control A: gate forced open changes ${openRed}/${withBlocks.length} legacy fingerprints with blocks (${legacyInputs.length - withBlocks.length} block-less files skipped)`,
);

const results = await tests.runTests({ plans: PLANS, k1: K1, corpus: CORPUS });
for (const r of results) {
  report.tests.push(r);
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
}
const shutResults = await testsShut.runTests({ plans: PLANS, k1: K1, corpus: CORPUS });
const manifestTests = shutResults.filter((r) => r.needsGate);
const shutRed = manifestTests.filter((r) => !r.ok).length;
for (const r of manifestTests) report.negativeB.push({ name: r.name, redWithGateShut: !r.ok });
const negBok = shutRed === manifestTests.length;
if (!negBok) failed++;
console.log(
  `${negBok ? 'ok  ' : 'FAIL'} negative control B: gate forced shut turns ${shutRed}/${manifestTests.length} manifest assertions red`,
);
for (const r of manifestTests.filter((x) => x.ok))
  console.log(`     still green with the gate shut: ${r.name}`);

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outDir = join(PLANS, 'reports');
if (existsSync(outDir))
  writeFileSync(join(outDir, `F6b-${stamp}.json`), JSON.stringify(report, null, 2));
console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`} in ${Date.now() - t0} ms`);
rmSync(work, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
