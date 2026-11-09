#!/usr/bin/env node
// PATTERN-IMPORT · G-all runner — the re-upload of a DXF over every prod card keeps the card.
// Bundles reimport-sweep-entry.ts once (React aliased to the one-component shim, so the REAL wizard
// hook runs; `old-draft` = src/lib/pattern-import/fabrics/draft.ts as it was before 7e4203260, taken
// from git), then every card in its own node process. Per DXF sheet of the card:
//   A · the same file re-uploaded onto the card → a no-op
//   B · the same file with CLO-style renamed blocks (PCK_L_MAIN → PCK_MAIN_L_UNI) → a no-op
//   C · the same file onto an empty card → today's pairing = the pairing before 7e4203260
// Writes <out>/sweep.txt (summary on top, one row per card × sheet × variant) and sweep.json.
//   node scripts/pattern-import/reimport-sweep.mjs [card[:row,row]…]
//   node scripts/pattern-import/reimport-sweep.mjs --from <sweep.json>   (render sweep.txt again)
//   env REIMPORT_SWEEP_DATA (prod snapshot + files/), REIMPORT_SWEEP_OUT (report dir),
//       REIMPORT_SWEEP_TAG (sweep-<tag>.txt), REIMPORT_SWEEP_CARD_DRAFT=old (control: the card drafts
//       with the draft before 7e4203260), REIMPORT_SWEEP_DEBUG=1 (the wizard's answers in notes)
// Exit 1 on any FAIL, STOP or crash.
import { build as esbuild } from 'esbuild';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT =
  process.env.REIMPORT_SWEEP_OUT ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/reimport-keeps-card/golden';

if (process.env.RS_CHILD) {
  const m = await import(pathToFileURL(process.env.RS_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

// REIMPORT_SWEEP_GIT: the repository to read history from when this checkout is an exported tree
const git = (...a) =>
  execFileSync('git', a, { cwd: process.env.REIMPORT_SWEEP_GIT ?? REPO, encoding: 'utf8' }).trim();
const BEFORE = '7e4203260^';
const work = resolve(tmpdir(), `reimport-sweep-${process.pid}`);
mkdirSync(work, { recursive: true });
const oldDraft = resolve(work, 'old-draft.ts');
writeFileSync(oldDraft, git('show', `${BEFORE}:src/lib/pattern-import/fabrics/draft.ts`));
const FABRICS = resolve(REPO, 'src/lib/pattern-import/fabrics');

// --from <sweep.json>: only render sweep.txt again from a saved run
const FROM = (() => {
  const k = process.argv.indexOf('--from');
  return k > 0 ? process.argv[k + 1] : null;
})();
const bundle = resolve(work, 'bundle.mjs');
if (!FROM)
  await esbuild({
    entryPoints: [resolve(HERE, 'reimport-sweep-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: bundle,
    logLevel: 'warning',
    absWorkingDir: REPO,
    external: ['pdfjs-dist', 'pdfjs-dist/*'],
    define: { 'import.meta.env': '{"VITE_PATTERN_IMPORT":"1"}' },
    alias: {
      react: resolve(HERE, 'react-hook-shim.ts'),
      lib: resolve(REPO, 'src/lib'),
      components: resolve(REPO, 'src/components'),
      utils: resolve(REPO, 'src/utils'),
      api: resolve(REPO, 'src/api'),
      constants: resolve(REPO, 'src/constants'),
    },
    plugins: [
      {
        name: 'old-draft',
        setup(b) {
          b.onResolve({ filter: /^old-draft$/ }, () => ({ path: oldDraft }));
          // the old module's own relative imports read today's siblings in fabrics/
          b.onResolve({ filter: /^\.\.?\// }, async (args) => {
            if (args.importer !== oldDraft) return undefined;
            return b.resolve(args.path, { resolveDir: FABRICS, kind: args.kind });
          });
        },
      },
    ],
  });

const ARGS = process.argv
  .slice(2)
  .filter((a, k, all) => !a.startsWith('--') && all[k - 1] !== '--from');
const child = (args) => {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...args],
    {
      env: { ...process.env, RS_CHILD: bundle },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    },
  );
  const lines = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('@@RESULT '));
  if (!lines.length)
    return {
      card: args[0],
      crashed: `status ${r.status} ${r.signal ?? ''} ${(r.stderr ?? '').slice(-1200)}`,
    };
  return JSON.parse(lines[0].slice(9));
};

const saved = FROM ? JSON.parse(readFileSync(FROM, 'utf8')) : null;
const ids = saved
  ? []
  : ARGS.length
    ? ARGS
    : JSON.parse(
        spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'list'], {
          env: { ...process.env, RS_CHILD: bundle },
          encoding: 'utf8',
        }).stdout,
      ).map(String);

/** PASS · FAIL · STOP (the wizard stopped before the check step with a question). */
const statusOf = (v) =>
  v.pass ? 'PASS' : v.stop || /^wizard did not reach/.test(v.fails?.[0] ?? '') ? 'STOP' : 'FAIL';
const stopOf = (v) =>
  v.stop ?? /^wizard did not reach the check step \((.*)\)$/.exec(v.fails?.[0] ?? '')?.[1] ?? '';

const results = saved?.results ?? [];
for (const id of ids) {
  const t = Date.now();
  const r = child([id]);
  results.push(r);
  const vs = (r.sheets ?? []).flatMap((s) => s.verdicts ?? []);
  console.log(
    `card ${String(r.card).padStart(3)} ${String(r.style ?? '').padEnd(9)} ${((Date.now() - t) / 1000).toFixed(0).padStart(4)}s  ` +
      ['A', 'B', 'C']
        .map((v) => {
          const x = vs.filter((y) => y.variant === v);
          return `${v} ${x.filter((y) => y.pass).length}/${x.length}`;
        })
        .join('  ') +
      (r.crashed ? `  CRASHED ${String(r.crashed).split('\n')[0].slice(0, 160)}` : ''),
  );
}
// runs saved before B mirrored A: a sheet with nothing to rename takes A's verdict
for (const r of results)
  for (const s of r.sheets ?? []) {
    const a = s.verdicts?.find((v) => v.variant === 'A');
    const k = s.verdicts?.findIndex((v) => v.variant === 'B' && v.stats?.renamed === 0) ?? -1;
    if (a && k >= 0 && s.verdicts[k].pass !== a.pass)
      s.verdicts[k] = {
        ...a,
        variant: 'B',
        notes: [...a.notes, 'no hand-paired names in the sheet: nothing to rename (B = A)'],
        stats: { ...a.stats, renamed: 0 },
      };
  }

// ── sweep.txt ───────────────────────────────────────────────────────────────────────────────────
const VARIANT = { A: 'same file', B: 'CLO rename', C: 'empty card' };
const head = saved?.head ?? process.env.REIMPORT_SWEEP_HEAD ?? git('log', '-1', '--format=%h %s');
// REIMPORT_SWEEP_CARD_DRAFT=old: the card builds its draft with the draft before 7e4203260 (control)
const cardDraft =
  process.env.REIMPORT_SWEEP_CARD_DRAFT === 'old'
    ? ' · CARD DRAFT = the draft before 7e4203260 (control run)'
    : '';
const cardTitle = (r) => `#${r.card} ${r.style ?? ''} «${r.name ?? ''}»`;
const rows = [];
const fails = [];
const stops = [];
const zero = () => ({ PASS: 0, FAIL: 0, STOP: 0, SKIP: 0 });
const count = { A: zero(), B: zero(), C: zero() };
const gen = { A: zero(), B: zero(), C: zero() };
let sheets = 0;
let ownerSheets = 0;
for (const r of results) {
  if (r.crashed) {
    fails.push(`${cardTitle(r)}: harness crashed: ${String(r.crashed).split('\n')[0]}`);
    rows.push(`${cardTitle(r)} · CRASHED · ${String(r.crashed).split('\n')[0]}`);
    continue;
  }
  rows.push(
    `\n${cardTitle(r)} — ${r.cardPieces} pieces, ${r.cardLinks} block links, ${r.cardOutlines} outlines on the card`,
  );
  for (const s of r.sheets) {
    sheets++;
    if (!s.generated) ownerSheets++;
    const where = s.generated ? gen : count;
    const sheet = `  sheet r${s.row} «${s.file}» [${s.scope}]${s.generated ? ' (generated fusing sheet)' : ''}`;
    const ref = `${cardTitle(r)} r${s.row} «${s.file}»${s.generated ? ' (generated fusing)' : ''}`;
    if (s.skip) {
      rows.push(`${sheet} · SKIPPED · ${s.skip}`);
      for (const v of ['A', 'B', 'C']) where[v].SKIP++;
      continue;
    }
    rows.push(sheet);
    for (const v of s.verdicts) {
      const st = statusOf(v);
      where[v.variant][st]++;
      const stats = Object.entries(v.stats ?? {})
        .filter(([k]) => k !== 'seconds' && k !== 'renamed')
        .map(([k, x]) => `${k} ${x}`)
        .join(', ');
      rows.push(`    ${v.variant} ${VARIANT[v.variant].padEnd(10)} ${st}  ${stats}`);
      if (v.variant === 'B' && v.stats?.renamed) rows.push(`        renamed: ${v.stats.renamed}`);
      if (st === 'STOP') rows.push(`        ? the wizard stops: ${stopOf(v)}`);
      else for (const f of v.fails) rows.push(`        ✗ ${f}`);
      for (const m of v.moved) rows.push(`        moved: ${m}`);
      for (const n of v.notes) rows.push(`        note: ${n}`);
      if (st === 'FAIL') fails.push(`${ref} ${v.variant}: ${v.fails.join('; ')}`);
      if (st === 'STOP') stops.push(`${ref} ${v.variant}: ${stopOf(v)}`);
    }
  }
}
const fmt = (c) =>
  `PASS ${c.PASS} · FAIL ${c.FAIL} · STOP ${c.STOP}${c.SKIP ? ` · skipped ${c.SKIP}` : ''}`;
const line = (v) =>
  `${v} ${VARIANT[v].padEnd(10)}  owner sheets ${fmt(count[v])}   generated fusing sheets ${fmt(gen[v])}`;
const text = [
  `G-all · re-upload of a DXF over every prod card with DXF sheets`,
  `checkout ${head} · old draft = ${git('rev-parse', '--short', BEFORE)} (before 7e4203260)${cardDraft} · ${new Date().toISOString().slice(0, 16)}Z`,
  `cards ${results.length} · sheets ${sheets} (owner ${ownerSheets}, generated fusing ${sheets - ownerSheets})`,
  `PASS = the check; FAIL = the draft breaks the card; STOP = the wizard stops before the check with a question`,
  line('A'),
  line('B'),
  line('C'),
  '',
  fails.length ? `FAIL (${fails.length}):` : 'no FAIL',
  ...fails.map((f) => `  ${f}`),
  '',
  stops.length ? `STOP (${stops.length}):` : 'no STOP',
  ...stops.map((f) => `  ${f}`),
  '',
  '── per card × sheet × variant ──',
  ...rows,
  '',
].join('\n');
mkdirSync(OUT, { recursive: true });
const tag = process.env.REIMPORT_SWEEP_TAG ? `-${process.env.REIMPORT_SWEEP_TAG}` : '';
writeFileSync(resolve(OUT, `sweep${tag}.txt`), text);
if (!saved)
  writeFileSync(resolve(OUT, `sweep${tag}.json`), JSON.stringify({ head, results }, null, 1));
console.log(`\n${text.split('\n').slice(0, 8).join('\n')}`);
if (fails.length || stops.length)
  console.log(
    `FAIL ${fails.length} · STOP ${stops.length} — see ${resolve(OUT, `sweep${tag}.txt`)}`,
  );
console.log(`→ ${resolve(OUT, `sweep${tag}.txt`)}`);
process.exit(fails.length || stops.length ? 1 : 0);
