#!/usr/bin/env node
// A NEW DETAIL FROM A LIBRARY FILE (03.10, owner item 14; design/bench-mint.ts).
//
// The server's RegisterDesignUpload drops `new_detail_name` before it places the picture, so a mint
// sent as the upload's target is always refused `detail_name_required`. The plan below must file
// the picture WITHOUT a target and hand the typed name to the follow-up SetDesignBenchSlot; a side
// and an existing detail keep their one-transaction placement.
//
//   node scripts/bench-mint-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(root, `scripts/.bench-mint-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'src/components/managers/tech-card/components/design/bench-mint.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
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
  const m = await import(pathToFileURL(outfile).href);
  const mint = { viewKey: 'detail', kind: 'flat', colorwayId: 0 };
  const p = m.uploadPlacement(mint, 0, '  cuff ');
  check('mint: the upload carries no target', p.target === undefined, JSON.stringify(p));
  check(
    'mint: the typed name goes to the follow-up write',
    p.mintName === 'cuff',
    String(p.mintName),
  );
  check('mint: the slot rev is 0', p.expectedSlotRev === 0);

  const side = { viewKey: 'front', kind: 'flat', colorwayId: 0 };
  const s = m.uploadPlacement(side, 3);
  check('side: placed in the same transaction', s.target === side && s.expectedSlotRev === 3);
  check('side: no follow-up mint', s.mintName === null);

  const existing = { slotId: 42, colorwayId: 0 };
  const e = m.uploadPlacement(existing, 2, 'ignored');
  check(
    'existing detail: placed in the same transaction',
    e.target === existing && e.mintName === null,
  );
  check('a detail with an id is not a mint', !m.isDetailMint({ viewKey: 'detail', slotId: 7 }));
} finally {
  rmSync(outfile, { force: true });
}

console.log(`bench-mint: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
