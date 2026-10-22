#!/usr/bin/env node
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outfile = resolve(tmpdir(), `fusing-dxf-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'src/lib/fusing-dxf/geometry.assert.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: root,
  alias: {
    lib: resolve(root, 'src/lib'),
    components: resolve(root, 'src/components'),
    utils: resolve(root, 'src/utils'),
    api: resolve(root, 'src/api'),
  },
});
const module = await import(pathToFileURL(outfile).href);
await module.main();
