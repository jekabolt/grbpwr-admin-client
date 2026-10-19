#!/usr/bin/env node
// PATTERN-IMPORT · F4 probe — pieces by seed on the corpus (real F2 sheets + F3 chains). Bundles pieces-entry.ts with
// esbuild (types stripped; tsc covers scripts/) and runs it in node with pdf.js' legacy build.
//   node scripts/pattern-import/pieces.mjs [all|prep|<sample>…]
//   env PATIMPORT_CORPUS (default tmp/plans/pdf-to-dxf/corpus/), PATIMPORT_REPORTS,
//       PATIMPORT_CACHE (extracted SourceDocs, default os tmpdir)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-pieces-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'pieces-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  // PATIMPORT_F3_FROM=<other worktree>/src/lib/pattern-import: read chains/ + sizes/ from another
  // lane (read-only) to preview F4 on its classes — never used by the acceptance run
  plugins: process.env.PATIMPORT_F3_FROM
    ? [
        {
          name: 'f3-from',
          setup(b) {
            b.onResolve({ filter: /^lib\/pattern-import\/(chains|sizes)\// }, (a) => ({
              path: resolve(
                process.env.PATIMPORT_F3_FROM,
                a.path.replace(/^lib\/pattern-import\//, '') + '.ts',
              ),
            }));
          },
        },
      ]
    : [],
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
