#!/usr/bin/env node
// GOLD seam fixtures for the paper doll (L4) — TEST DATA, never product data.
//   node scripts/doll/gold.mjs sheet [id,…]   flat pieces with numbered edges (+ gold rows when built)
//                                             → tmp/plans/assembly-3d-doll/p4-gold/<id>-flat-edges.png
//   node scripts/doll/gold.mjs build [id,…]   scripts/doll/gold/specs.ts → scripts/doll/gold/<id>.seams.json
// Data: SKELETON_PLANS (default ../tmp/plans next to the repo); output dir $DOLL_OUT or p4-gold/.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { dollFiles } from './files.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const plans = process.env.SKELETON_PLANS ?? resolve(here, '../../../tmp/plans');
const out = process.env.DOLL_OUT ?? resolve(plans, 'assembly-3d-doll/p4-gold');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [mode = 'sheet', ids = 'ss26,card4,card6,card16,card11,card7'] = process.argv.slice(2);
const want = ids.split(',').filter(Boolean);
const files = dollFiles(plans).filter((f) => f.dxf && existsSync(f.dxf) && want.includes(f.id));

const dist = mkdtempSync(resolve(tmpdir(), 'doll-gold-'));
await build({
  entryPoints: [resolve(here, 'gold-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: resolve(dist, 'gold.mjs'),
  logLevel: 'warning',
  absWorkingDir: resolve(here, '../..'),
});
const specPath = resolve(dist, 'spec.json');
writeFileSync(specPath, JSON.stringify({ files }));
execFileSync(
  process.execPath,
  [resolve(dist, 'gold.mjs'), mode, specPath, out, resolve(here, 'gold')],
  { stdio: 'inherit' },
);
if (mode === 'sheet') {
  const profile = mkdtempSync(resolve(tmpdir(), 'doll-gold-chrome-'));
  for (const f of files) {
    const svg = resolve(out, `${f.id}-flat-edges.svg`);
    if (!existsSync(svg)) continue;
    const { w, h } = JSON.parse(readFileSync(resolve(out, `${f.id}-flat-edges.size`), 'utf8'));
    const html = resolve(dist, `${f.id}.html`);
    writeFileSync(
      html,
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body>${readFileSync(svg, 'utf8')}</body></html>`,
    );
    const png = resolve(out, `${f.id}-flat-edges.png`);
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--hide-scrollbars',
        '--allow-file-access-from-files',
        `--window-size=${w},${h}`,
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        `--screenshot=${png}`,
        pathToFileURL(html).href,
      ],
      { stdio: 'ignore', timeout: 90_000 },
    );
    rmSync(resolve(out, `${f.id}-flat-edges.size`), { force: true });
    console.log(`  ${png}`);
  }
  rmSync(profile, { recursive: true, force: true });
}
rmSync(dist, { recursive: true, force: true });
