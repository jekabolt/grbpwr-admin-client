#!/usr/bin/env node
// Bundle the real-file DXF + RUL golden probe with the same aliases as the focused writer test.
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `pattern-export-golden-rul-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(HERE, 'golden-rul-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const result = await import(pathToFileURL(outfile).href);
process.exitCode = (await result.main(process.argv.slice(2))) ?? 0;
