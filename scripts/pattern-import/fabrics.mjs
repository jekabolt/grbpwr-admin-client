#!/usr/bin/env node
// PATTERN-IMPORT · F7 probe — fabrics + the atomic card apply. Fabric words in 12 languages, cut-list
// reading on the corpus PDFs, a polupalto-like import on a real CLO DXF (fast path → F5 semantics →
// proposeFabrics → planScopes → writeAndGate per scope → buildDraft → applyDraft with a fake upload
// service and a fake form): DXFs per scope, LIN_ lining names, aliases, fused flags, failure on the
// 2nd upload = zero form writes, re-apply = zero writes.
//   node scripts/pattern-import/fabrics.mjs        (yarn patimport:fabrics)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-fabrics-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'fabrics-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
const code = await m.main(process.argv.slice(2));
process.exit(code ?? 0);
