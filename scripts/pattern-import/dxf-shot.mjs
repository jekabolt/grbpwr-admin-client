#!/usr/bin/env node
// DXF SHOT runner — bundles dxf-shot-entry.ts (React aliased to the one-component shim, as
// autopilot.mjs), then every PDF in its own node process; then dxf-check.mjs reads what was written.
//   node scripts/pattern-import/dxf-shot.mjs <folder> --files <list.txt> --out <dir> [--par 2]
//   node scripts/pattern-import/dxf-shot.mjs <one.pdf> --out <dir>
//   --cards <previous-replay-directory> uses each PDF's saved <id>/case.json size card.
//   --limit 0 disables the wall-clock timeout for laptop runs across system sleep.
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.SHOT_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.SHOT_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const target = argv[0];
const OUT = resolve(opt('--out', resolve(tmpdir(), 'dxf-shot')));
const CARDS = opt('--cards', '');
const PAR = +opt('--par', '2');
const LIMIT_S = +opt('--limit', '1800');
let pdfs;
if (/\.pdf$/i.test(target)) pdfs = [resolve(target)];
else {
  const list = opt('--files');
  if (!list) throw new Error('usage: dxf-shot.mjs <folder> --files <list> --out <dir>');
  pdfs = readFileSync(list, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((f) => resolve(target, f));
}
mkdirSync(OUT, { recursive: true });
if (CARDS) {
  for (const pdf of pdfs) {
    const id = basename(pdf).replace(/\.pdf$/i, '');
    const input = resolve(CARDS, id, 'case.json');
    if (!existsSync(input)) throw new Error(`Missing saved size card: ${input}`);
  }
}

// SHOT_ROWS=1: each child also writes <dir>/rows.json — the sheet as the fill sees it: every chain's
// points and which chains are each size's own (byRank) or shared (common). media-diff.mjs draws
// it as the sizes step does: one size's lines lit on the whole sheet. Off: the bundle is unchanged.
const ROWS_ANCHOR = '  // P3: a click carried to the other size files by its face';
function rowsHook() {
  return {
    plugins: [
      {
        name: 'shot-rows',
        setup(b) {
          b.onLoad({ filter: /pieces[\\/]fill\.ts$/ }, (a) => {
            const src = readFileSync(a.path, 'utf8');
            if (!src.includes(ROWS_ANCHOR)) throw new Error('SHOT_ROWS: fill.ts anchor moved');
            const hook = `  (globalThis as any).__ROWS?.(set, model);\n`;
            return { contents: src.replace(ROWS_ANCHOR, hook + ROWS_ANCHOR), loader: 'ts' };
          });
        },
      },
    ],
    banner: {
      js: `import { writeFileSync as __rwfs } from 'node:fs';
const __rows = new Map();
globalThis.__ROWS = (set, model) => {
  if (model.mode === 'single') return;
  const r1 = (v) => Math.round(v * 10) / 10;
  if (!__rows.has(set)) __rows.set(set, {
    chains: set.chains.map((c) => (c?.pts ?? []).map((p) => [r1(p.x), r1(p.y)])),
    style: set.chains.map((c) => c?.style ?? 0),
    motif: set.chains.map((c) => (c?.motif ? c.motif.map(r1) : null)),
    legend: (set.classes ?? []).filter((k) => k.role === 'size').map((k) => ({
      size: k.sizeLabel ?? null,
      chains: [...(k.chains ?? [])],
      evidence: (k.evidence ?? []).map((e) => e.kind),
    })),
  });
  const s = __rows.get(set);
  s.byRank = model.byRank.map((x) => [...x]);
  s.common = [...model.common];
};
process.on('exit', () => {
  if (!__rows.size || !process.argv[3]) return;
  try { __rwfs(process.argv[3] + '/rows.json', JSON.stringify([...__rows.values()])); } catch {}
});`,
    },
  };
}

const bundle = resolve(tmpdir(), `patimport-dxfshot-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'dxf-shot-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
  ...(process.env.SHOT_ROWS ? rowsHook() : {}),
});

const one = (pdf) =>
  new Promise((done) => {
    const dir = resolve(OUT, basename(pdf).replace(/\.pdf$/i, ''));
    const t0 = Date.now();
    const p = spawn(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=8192',
        fileURLToPath(import.meta.url),
        pdf,
        dir,
        ...(CARDS ? [resolve(CARDS, basename(dir), 'case.json')] : []),
      ],
      { env: { ...process.env, SHOT_CHILD: bundle, PATIMPORT_REPO: REPO } },
    );
    let so = '';
    let se = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', (d) => (se = (se + d).slice(-4000)));
    const kill = LIMIT_S > 0 ? setTimeout(() => p.kill('SIGKILL'), LIMIT_S * 1000) : undefined;
    p.on('close', (code, sig) => {
      clearTimeout(kill);
      // SHOT_STDOUT=1 keeps the child's stdout (e.g. GRADEP2_DEBUG lines) beside run.json
      if (process.env.SHOT_STDOUT && existsSync(dir)) writeFileSync(resolve(dir, 'stdout.txt'), so);
      const runJson = resolve(dir, 'run.json');
      const ok = so.includes('@@RESULT') && existsSync(runJson);
      const r = ok
        ? (({ families: _f, trace: _t, ...x }) => x)(JSON.parse(readFileSync(runJson, 'utf8')))
        : { id: basename(pdf), verdict: sig ? 'timeout' : 'crashed', code, error: se.slice(-800) };
      r.wallMs = Date.now() - t0;
      console.log(
        `${r.verdict.padEnd(8)} ${String(Math.round(r.wallMs / 1000)).padStart(5)}s ${r.id}${r.stop ? `  [${r.stop.step}] ${String(r.stop.reason).slice(0, 120)}` : ''}`,
      );
      done(r);
    });
  });

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(PAR, pdfs.length) }, async () => {
    while (next < pdfs.length) {
      const pdf = pdfs[next++];
      if (!existsSync(pdf)) {
        results.push({ id: basename(pdf), verdict: 'missing' });
        continue;
      }
      results.push(await one(pdf));
    }
  }),
);
writeFileSync(resolve(OUT, 'shot.json'), JSON.stringify(results, null, 1));
console.log(`wrote ${resolve(OUT, 'shot.json')}`);
