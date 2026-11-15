#!/usr/bin/env node
// DXF SHOT runner — bundles dxf-shot-entry.ts (React aliased to the one-component shim, as
// autopilot.mjs), then every PDF in its own node process; then dxf-check.mjs reads what was written.
//   node scripts/pattern-import/dxf-shot.mjs <folder> --files <list.txt> --out <dir> [--par 2]
//   node scripts/pattern-import/dxf-shot.mjs <one.pdf> --out <dir>
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
});

const one = (pdf) =>
  new Promise((done) => {
    const dir = resolve(OUT, basename(pdf).replace(/\.pdf$/i, ''));
    const t0 = Date.now();
    const p = spawn(
      process.execPath,
      ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), pdf, dir],
      { env: { ...process.env, SHOT_CHILD: bundle, PATIMPORT_REPO: REPO } },
    );
    let so = '';
    let se = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', (d) => (se = (se + d).slice(-4000)));
    const kill = setTimeout(() => p.kill('SIGKILL'), LIMIT_S * 1000);
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
