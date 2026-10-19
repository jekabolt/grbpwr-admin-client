#!/usr/bin/env node
// RASTER lane probe: PDFs whose scan images exceed the pixel limit, through the raster adapter.
//   node scripts/pattern-import/bigraster.mjs <out.jsonl> [--max N] [--pages 0,1] file.pdf …
// One child process per file (peak RSS per file). Prints one JSON line per file.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.BR_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.BR_CHILD).href);
  process.exit(await m.main(process.argv.slice(2)));
}
const args = process.argv.slice(2);
const out = args.shift();
let max = '-';
let pages = '';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max') max = args[++i];
  else if (args[i] === '--pages') pages = args[++i];
  else files.push(args[i]);
}
const BUNDLE = resolve(tmpdir(), `patimport-bigraster-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'bigraster-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: BUNDLE,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist'],
  preserveSymlinks: true,
  alias: { lib: resolve(REPO, 'src/lib'), components: resolve(REPO, 'src/components'), utils: resolve(REPO, 'src/utils') },
});
for (const f of files) {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=4096', fileURLToPath(import.meta.url), f, max, ...(pages ? [pages] : [])],
    { env: { ...process.env, BR_CHILD: BUNDLE }, encoding: 'utf8', timeout: 1800_000, maxBuffer: 64 << 20 },
  );
  const line = (r.stdout || '').trim().split('\n').pop() || JSON.stringify({ file: f, ok: false, error: `exit ${r.status} ${r.signal ?? ''} ${(r.stderr || '').slice(-300)}` });
  appendFileSync(out, line + '\n');
  console.log(line.slice(0, 600));
}
