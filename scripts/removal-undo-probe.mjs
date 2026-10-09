#!/usr/bin/env node
// T49 · UNDO OF A REMOVAL (owner item 49): «в FLAT SLOTS и в SIDES если мы удалили медиа то у нас
// до рефреша должна быть возможность сделать undo». Bundles the REAL store (`removal-undo.ts`) and
// checks: one undo per slot, several removals each keep their own, card-scoped, spent on forget,
// and module memory only (a fresh module = a reload = nothing remembered).
//   node scripts/removal-undo-probe.mjs
import { build as esbuild } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ck = (ok, what) => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`);
};
const load = async (tag) => {
  const out = resolve(REPO, `node_modules/.cache/removal-undo-probe-${tag}.mjs`);
  await esbuild({
    entryPoints: [
      resolve(REPO, 'src/components/managers/tech-card/components/design/removal-undo.ts'),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['react'],
    outfile: out,
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(out).href + `?${tag}`);
  rmSync(out);
  return mod;
};

const m = await load('a');
const front = { viewKey: 'front', kind: 'flat', colorwayId: 0 };
m.rememberRemoval({
  card: 7,
  key: 'view:flat:0:front',
  kind: 'flat',
  ref: front,
  side: 'front',
  colorwayId: 0,
  pictureId: 11,
});
m.rememberRemoval({
  card: 7,
  key: 'view:render:3:back',
  kind: 'render',
  ref: { viewKey: 'back', kind: 'render', colorwayId: 3 },
  side: 'back',
  colorwayId: 3,
  pictureId: 12,
});
m.rememberRemoval({
  card: 7,
  key: 'id:44',
  kind: 'flat',
  ref: { slotId: 44 },
  side: 'collar',
  colorwayId: 0,
  pictureId: 13,
});
ck(m.removalAt(7, 'view:flat:0:front')?.pictureId === 11, 'flat side remembers its picture');
ck(m.removalAt(7, 'view:render:3:back')?.pictureId === 12, 'render side keeps its own undo');
ck(m.removalAt(7, 'id:44')?.pictureId === 13, 'detail slot keeps its own undo');
ck(m.removalAt(8, 'view:flat:0:front') === null, 'another card sees nothing');
m.rememberRemoval({
  card: 7,
  key: 'view:flat:0:front',
  kind: 'flat',
  ref: front,
  side: 'front',
  colorwayId: 0,
  pictureId: 21,
});
ck(
  m.removalAt(7, 'view:flat:0:front')?.pictureId === 21,
  'a second removal from the same slot replaces the first',
);
m.forgetRemoval(7, 'view:flat:0:front');
ck(m.removalAt(7, 'view:flat:0:front') === null, 'undo is spent after forget');
ck(m.removalAt(7, 'id:44')?.pictureId === 13, 'forget touches only its slot');
m.rememberRemoval({
  card: 7,
  key: 'x',
  kind: 'flat',
  ref: front,
  side: 'front',
  colorwayId: 0,
  pictureId: 0,
});
ck(m.removalAt(7, 'x') === null, 'a removal without a picture is not remembered');
const fresh = await load('b');
ck(fresh.removalAt(7, 'id:44') === null, 'reload (a fresh module) forgets everything');

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
