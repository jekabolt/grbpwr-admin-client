#!/usr/bin/env node
// PATTERN-IMPORT · GOLDEN runner — bundles golden-entry.ts (React aliased to the one-component shim,
// as autopilot.mjs does) and runs ONE file through the autopilot in a child process.
//   node scripts/pattern-import/golden.mjs '<json spec>' <dxf-out-dir> [timeout-min]
// Prints the case record as one JSON line prefixed "@@RESULT " (verdict apply / stopped / crashed /
// timeout). The DXFs land in <dxf-out-dir>/<scope>.dxf.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.GOLDEN_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.GOLDEN_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const [spec, out, min = '30'] = process.argv.slice(2);
const bundle = resolve(tmpdir(), `patimport-golden-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'golden-entry.ts')],
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
const r = spawnSync(
  process.execPath,
  ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), spec],
  {
    env: { ...process.env, GOLDEN_CHILD: bundle, PATIMPORT_REPO: REPO, AUTOPILOT_DXF_OUT: out },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: Number(min) * 60 * 1000,
    killSignal: 'SIGKILL',
  },
);
rmSync(bundle, { force: true });
const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@RESULT '));
if (line) console.log(line);
else
  console.log(
    `@@RESULT ${JSON.stringify({
      verdict: r.signal === 'SIGKILL' || r.error?.code === 'ETIMEDOUT' ? 'timeout' : 'crashed',
      status: r.status,
      signal: r.signal,
      stderr: (r.stderr ?? '').slice(-1500),
    })}`,
  );
