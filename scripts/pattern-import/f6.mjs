#!/usr/bin/env node
// PATTERN-IMPORT · F6 — writer (CLO-DXF R2000 / CLO-AAMA R12) + export gate G1–G13 on synthetic
// PieceSpec fixtures: golden structure, round trip through the card parser, negative controls.
//   node scripts/pattern-import/f6.mjs            (yarn patimport:f6)
// Writes tmp/plans/pdf-to-dxf/reports/F6-<yyyymmdd>.json and the sample DXFs next to it.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-f6-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'f6-entry.ts')],
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
  },
});
const m = await import(pathToFileURL(outfile).href);
const plans = process.env.PATIMPORT_PLANS ?? resolve(REPO, '../tmp/plans/pdf-to-dxf');
const bad = await m.main({ plans });
process.exit(bad ? 1 : 0);
