#!/usr/bin/env node
// WHEN A NEW CARD MAY BE CREATED (onboarding Q1; tech-card/components/create-ready.ts).
//
// One pure predicate feeds the auto-create of a CREATE NEW card and the CARD DETAILS footer of a
// card that does not exist yet: name, category, season (one that parses into a wire season) and
// style number. The reason names only what is missing, in that order.
//
//   node scripts/create-ready-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(root, `scripts/.create-ready-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'src/components/managers/tech-card/components/create-ready.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  nodePaths: [resolve(root, 'src')],
  outfile,
  logLevel: 'silent',
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  const { createReady } = await import(pathToFileURL(outfile).href);
  const full = { name: 'Field jacket', categoryId: 7, season: 'FW26', styleNumber: 'FW26-JK-001' };

  const r1 = createReady(full);
  check('all four filled → ok', r1.ok === true, JSON.stringify(r1));

  const r2 = createReady({});
  check(
    'nothing filled → all four, in order',
    !r2.ok && r2.reason === 'name, category, season and style number first',
    JSON.stringify(r2),
  );

  const r3 = createReady({ ...full, name: '   ' });
  check('a blank name is missing', !r3.ok && r3.reason === 'name first', JSON.stringify(r3));

  const r4 = createReady({ ...full, season: 'holiday' });
  check(
    'a season that does not parse is missing',
    !r4.ok && r4.reason === 'season first',
    JSON.stringify(r4),
  );

  const r5 = createReady({ ...full, categoryId: 0, styleNumber: '' });
  check(
    'two missing → «a and b first»',
    !r5.ok && r5.reason === 'category and style number first',
    JSON.stringify(r5),
  );
} catch (e) {
  fail++;
  console.error('✗ probe crashed —', e);
} finally {
  rmSync(outfile, { force: true });
}

const total = pass + fail;
console.log(`create-ready: ${pass}/${total} passed`);
if (fail || total !== 5) process.exit(1);
