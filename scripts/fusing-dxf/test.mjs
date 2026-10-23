#!/usr/bin/env node
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

async function run(entry, tag) {
  const outfile = resolve(tmpdir(), `fusing-dxf-${tag}-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(root, entry)],
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
}

await run('src/lib/fusing-dxf/zone-follow.assert.ts', 'zone-follow');
await run('src/lib/fusing-dxf/geometry.assert.ts', 'geometry');
