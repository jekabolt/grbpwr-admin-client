#!/usr/bin/env node
// SIZE RESOLVER — the client's answer to «which sizes may this style use» against the server's
// (`entity.ResolveSizeSystemPolicy`): no category → every size; a category whose chain maps a
// system → that system's sizes; a category with NO mapping anywhere on its chain → the one size
// named `os` (OS-fallback). Before the onboarding wave (S1, П2) the client read the third case as
// the first and offered every size the server then refused.
//
// Real modules, bundled by esbuild for node: `permittedSizeSystems` + `sizeInSystems`
// (utils/size-systems.ts) and `sizeSystemsOf`, the pure core of `useSizeSystems`.
//
// Negative control: in `permittedSizeSystems` turn the final `return [];` into `return undefined;`
// — case 3 must go red.
//
//   node scripts/size-resolver-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `size-resolver-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      export { permittedSizeSystems, sizeInSystems } from 'utils/size-systems';
      export { sizeSystemsOf } from 'components/managers/model/components/use-size-systems';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const M = await import(pathToFileURL(outfile).href);

let checks = 0;
let bad = 0;
const is = (name, got, want) => {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `\n        got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// --- fixtures: outerwear › jackets › bomber (mapped on the top), bags (top, nothing mapped) ----
const CATEGORIES = [
  { id: 1, name: 'outerwear', level: 'top_category' },
  { id: 2, name: 'jackets', level: 'sub_category', parentId: 1 },
  { id: 3, name: 'bomber', level: 'type', parentId: 2 },
  { id: 10, name: 'bags', level: 'top_category' },
  { id: 11, name: 'totes', level: 'type', parentId: 10 },
];
const SYSTEMS = [{ categoryId: 1, skuSystem: 'SIZE_SKU_SYSTEM_LETTER' }];
const SIZES = [
  { id: 101, name: 'xs', skuSystem: 'SIZE_SKU_SYSTEM_LETTER', skuOrd: 1 },
  { id: 102, name: 's', skuSystem: 'SIZE_SKU_SYSTEM_LETTER', skuOrd: 2 },
  { id: 103, name: 'm', skuSystem: 'SIZE_SKU_SYSTEM_LETTER', skuOrd: 3 },
  { id: 104, name: 'os', skuSystem: 'SIZE_SKU_SYSTEM_LETTER', skuOrd: 9 },
  { id: 201, name: '40', skuSystem: 'SIZE_SKU_SYSTEM_EU_SHOE', skuOrd: 1 },
  { id: 202, name: '41', skuSystem: 'SIZE_SKU_SYSTEM_EU_SHOE', skuOrd: 2 },
];
const ids = (groups) => groups.flatMap((g) => g.sizes.map((s) => s.id));
const offer = (categoryId, selectedIds = []) =>
  M.sizeSystemsOf(SIZES, {
    allowedSizeSystems: M.permittedSizeSystems(CATEGORIES, SYSTEMS, categoryId),
    selectedIds,
  });

console.log('\n1 · no category → every size, nothing narrowed');
is('permittedSizeSystems(no category)', M.permittedSizeSystems(CATEGORIES, SYSTEMS, 0), undefined);
is('offered', ids(offer(0).permitted).sort(), SIZES.map((s) => s.id).sort());
is('narrowed', offer(0).narrowed, false);

console.log('\n2 · mapped category (a type under a mapped top) → its system only');
is('permittedSizeSystems(bomber)', M.permittedSizeSystems(CATEGORIES, SYSTEMS, 3), [
  'SIZE_SKU_SYSTEM_LETTER',
]);
is('offered', ids(offer(3).permitted).sort(), [101, 102, 103, 104]);
is('shoes are «more systems»', ids(offer(3).other).sort(), [201, 202]);

console.log('\n3 · category with no mapping on its chain → os only (the server OS-fallback)');
is('permittedSizeSystems(totes)', M.permittedSizeSystems(CATEGORIES, SYSTEMS, 11), []);
is('offered', ids(offer(11).permitted), [104]);
is(
  'sizeInSystems agrees with the server Allows',
  SIZES.map((s) => M.sizeInSystems(s, [])),
  [false, false, false, true, false, false],
);

console.log('\n4 · a selected size is never hidden, whatever the answer');
is('selected shoe stays offered on totes', ids(offer(11, [201]).permitted).sort(), [104, 201]);

console.log('\n5 · dictionary not loaded → no answer yet (every size), not os-only');
is('permittedSizeSystems(no categories)', M.permittedSizeSystems(undefined, SYSTEMS, 11), undefined);

console.log(`\n${checks - bad}/${checks} checks green`);
process.exit(bad ? 1 : 0);
