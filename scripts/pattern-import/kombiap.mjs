#!/usr/bin/env node
// PATTERN-IMPORT · KOMBI-AP: render the piece-sized outlines the Style A autopilot must decide.
//   yarn patimport:kombiap
//   env PATIMPORT_E2E_OUT=/private/tmp/patimport-runs/kombiap/e2e-out
//       KOMBIAP_OUT=/private/tmp/patimport-runs/kombiap
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.KOMBIAP_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.KOMBIAP_CHILD).href);
  process.exit((await m.main()) ? 1 : 0);
}

const outfile = resolve(tmpdir(), `patimport-kombiap-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'kombiap-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const r = spawnSync(
  process.execPath,
  ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      KOMBIAP_CHILD: outfile,
      PATIMPORT_E2E_OUT:
        process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-kombiap-e2e-out'),
      KOMBIAP_OUT: process.env.KOMBIAP_OUT ?? resolve(tmpdir(), 'patimport-kombiap-out'),
    },
  },
);
process.exit(r.status ?? 1);
