#!/usr/bin/env node
// PATTERN-IMPORT · F10 — AI piece naming, client side: dictionary, readers, evidence builder,
// Set-of-Mark render, wire mapping, combiner, call path, and the auto-accept calibration on the K0
// truth corpus with FAKE model answers (no network, ever).
//   node scripts/pattern-import/ai.mjs            (yarn patimport:ai)
// Writes tmp/plans/pdf-to-dxf/reports/F10-<yyyymmdd>.json.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-ai-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'ai-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
    api: resolve(REPO, 'src/api'),
  },
});
const m = await import(pathToFileURL(outfile).href);
const plans = process.env.PATIMPORT_PLANS ?? resolve(REPO, '../tmp/plans/pdf-to-dxf');
const corpus = process.env.PATIMPORT_CORPUS ?? resolve(plans, 'corpus');
const bad = await m.main({ plans, corpus });
process.exit(bad ? 1 : 0);
