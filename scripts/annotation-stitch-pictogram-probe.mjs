#!/usr/bin/env node
// ПИКТОГРАММА ШВА ТОТАЛЬНА (волна callout kinds, T17).
//
// Владелец: «в стич колауте должно быть не только исо но и пиктограмка как этот шов выглядит».
// Три свойства:
//   1. КАЖДЫЙ номер ISO, который предлагает селект шва (кисти `STITCHES` с цифрой), сводится к
//      СВОЕЙ кисти — не к соседней и не к null;
//   2. незнакомое (401 без кисти цепочки, мусор, пусто) — null и пустая разметка, а не исключение;
//   3. нарисованное — непустой путь с тем же `data-stitch-pictogram`, что и кисть.
//
//   node scripts/annotation-stitch-pictogram-probe.mjs

import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
// Рядом с node_modules, а не в tmp: react остаётся внешним (CJS-сборка react-dom/server не
// бандлится в ESM), и импорт обязан его найти.
const outfile = resolve(
  root,
  'node_modules/.cache',
  `annotation-stitch-pictogram-${process.pid}.mjs`,
);
await build({
  stdin: {
    contents: `
      export * from 'ui/components/annotation/stitch-pictogram';
      export { STITCHES } from 'components/managers/tech-card/components/design/modals/vector-strokes';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  outfile,
  logLevel: 'silent',
  alias: Object.fromEntries(['components', 'ui', 'lib'].map((k) => [k, resolve(root, 'src', k)])),
});
const P = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const draw = (iso) => P.renderToStaticMarkup(P.createElement(P.StitchPictogram, { iso }));

const offered = P.STITCHES.filter((s) => /^\d/.test(s.iso));
check('селект предлагает номера', offered.length >= 8, String(offered.length));
for (const s of offered) {
  check(`${s.iso} → ${s.key}`, P.stitchBrushOf(s.iso) === s.key, String(P.stitchBrushOf(s.iso)));
  const html = draw(s.iso);
  check(
    `${s.iso} нарисован своей кистью`,
    html.includes(`data-stitch-pictogram="${s.key}"`) && /<path[^>]* d="M[^"]+"/.test(html),
    html.slice(0, 120),
  );
}
for (const [iso, key] of [
  ['407', 'cover'],
  ['602', 'cover'],
  ['605', 'cover'],
  ['512', 'overlock4'],
  [' 301 ', 'lock'],
]) {
  check(`алиас ${iso} → ${key}`, P.stitchBrushOf(iso) === key, String(P.stitchBrushOf(iso)));
}
for (const junk of [undefined, null, '', '401', 'junk', 'no stitch', 'satin bar', '9999']) {
  let r;
  let html;
  let threw = false;
  try {
    r = P.stitchBrushOf(junk);
    html = draw(junk);
  } catch (e) {
    threw = e;
  }
  check(
    `незнакомое ${JSON.stringify(junk)} → нет пиктограммы`,
    !threw && r === null && html === '',
    String(threw || r),
  );
}
check('stitchIsoOf читает шов', P.stitchIsoOf('{"iso":"504","t":"stitch"}') === '504');
check(
  'stitchIsoOf мусор → пусто',
  P.stitchIsoOf('{') === '' && P.stitchIsoOf('{"t":"note"}') === '',
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
