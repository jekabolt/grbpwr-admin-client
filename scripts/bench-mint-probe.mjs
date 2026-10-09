#!/usr/bin/env node
// A NEW DETAIL FROM A LIBRARY FILE (03.10, owner item 14; design/bench-mint.ts; hotfix HX6).
//
// Since backend 143b5aa RegisterDesignUpload carries `new_detail_name` to the slot mint in ONE
// transaction. The plan below must be that one call: target = the new detail, the typed name on
// the same call, slot rev 0. The interim two-write shape (no target, then SetDesignBenchSlot with
// the name) is red here. A side and an existing detail take the same call without a name.
//
//   node scripts/bench-mint-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';

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
  check('mint: ONE call — the upload targets the new detail', p.target === mint, JSON.stringify(p));
  check(
    'mint: the typed name rides on the same call',
    p.newDetailName === 'cuff',
    String(p.newDetailName),
  );
  check('mint: the slot rev is 0', p.expectedSlotRev === 0);
  check(
    'mint: no follow-up write is planned (no second-write field)',
    !('mintName' in p) &&
      Object.keys(p).sort().join(',') === 'expectedSlotRev,newDetailName,target',
    Object.keys(p).join(','),
  );
  const stale = m.uploadPlacement(mint, 5, 'yoke');
  check('mint: a stale rev never reaches a mint', stale.expectedSlotRev === 0);

  const side = { viewKey: 'front', kind: 'flat', colorwayId: 0 };
  const s = m.uploadPlacement(side, 3);
  check('side: placed in the same transaction', s.target === side && s.expectedSlotRev === 3);
  check('side: carries no name', s.newDetailName === undefined);

  const existing = { slotId: 42, colorwayId: 0 };
  const e = m.uploadPlacement(existing, 2, 'ignored');
  check(
    'existing detail: placed in the same transaction, no name',
    e.target === existing && e.expectedSlotRev === 2 && e.newDetailName === undefined,
  );
  check('a detail with an id is not a mint', !m.isDetailMint({ viewKey: 'detail', slotId: 7 }));

  // The bench sends the plan as ONE RegisterDesignUpload and nothing after it.
  const bench = readFileSync(
    resolve(root, 'src/components/managers/tech-card/components/design/bench.tsx'),
    'utf8',
  );
  const place = bench.slice(
    bench.indexOf('const placeMedia = useCallback('),
    bench.indexOf('[writes.registerUpload, dropOptimistic]'),
  );
  check('bench: placeMedia found', place.length > 0 && place.length < 5000, String(place.length));
  check(
    'bench: the upload carries target and the name',
    /target: placement\.target/.test(place) &&
      /newDetailName: placement\.newDetailName/.test(place),
  );
  check('bench: no second write after the upload', !/setBenchSlot/.test(place));
} finally {
  rmSync(outfile, { force: true });
}

console.log(`bench-mint: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
