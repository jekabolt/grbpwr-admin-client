#!/usr/bin/env node
// PATTERN-IMPORT · STOPFIX probe — a stop never ends the run. Drives the REAL wizard hook
// (use-import-session.ts, React replaced by the one-component shim WITH effects, so the drive is
// the wizard's own) over an in-process worker that can be killed the way worker/client.ts kills it.
//   node scripts/pattern-import/stopfix.mjs            (yarn patimport:stopfix)
//   … --quick                                          the synthetic case only (no kombinezon)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-stopfix-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'stopfix-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim-fx.ts'),
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
process.exit(await m.main(process.argv.slice(2)));
