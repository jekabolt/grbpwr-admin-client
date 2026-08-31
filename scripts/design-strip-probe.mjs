#!/usr/bin/env node
// ПОЛОСА ВХОДОВ DESIGN: угол рисует ПРИМИТИВ, а ряд зума ОБЩИЙ (T-8, круг 4).
//
// Владелец дословно: «зум кнопку на ховер картинки так как у нас везде сделано и что бы можно было
// в зум вью по всем картинкам из всех генераций итерироваться НЕ ТОЛЬКО ЭТОЙ». Это утверждение о
// РЕНДЕРЕ и о РЯДЕ, и `tsc` зелен при любом из двух поведений: и когда каждый блок держит свой
// просмотрщик, и когда просмотрщик один. Поэтому здесь настоящий браузер, настоящий CSS админки из
// dist (без него ни один tailwind-класс не существует) и настоящие компоненты репозитория.
//
// ЧТО ИМЕННО МЕРЯЕТСЯ:
//   · кадр ячейки — коробка 132×148, то есть переезд на `PictureTile` не поехал геометрией;
//   · угловой `zoom` СУЩЕСТВУЕТ и подчиняется закону тихого органа (прозрачен в покое, виден при
//     наведении) — до правки его рисовала сама ячейка своим классом;
//   · РЯД ПРОСМОТРЩИКА СКВОЗНОЙ: открытый из первой полосы, он держит картинки И ВТОРОЙ полосы.
//     Ровно это было сломано — ряд собирался вызывающим и кончался на краю блока;
//   · порядок ряда — ПОРЯДОК В ДОКУМЕНТЕ: открытие из второй полосы встаёт на третий кадр, а не
//     на первый.
//
// Ряд читается по ленте миниатюр просмотрщика (`aria-label="Go to item N"`, `aria-current` на
// текущем) — по РАЗМЕТКЕ, а не по внутреннему состоянию: состояние соврало бы вместе с кодом.
//
// Запуск:  node scripts/design-strip-probe.mjs [--mutate-gallery] [--mutate-aspect]
//   --mutate-gallery  ячейка перестаёт объявлять свой кадр  → зум обязан исчезнуть
//   --mutate-aspect   кадр объявлен квадратным              → геометрия обязана покраснеть
// Мутация, не уронившая ни одной проверки, означает сторожа у мёртвого кода.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  gallery: process.argv.includes('--mutate-gallery'),
  aspect: process.argv.includes('--mutate-aspect'),
};

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

const pwEntry = resolvePlaywright();
if (!pwEntry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const pw = await import(pwEntry);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
const GALLERY_FIX = `          gallery={gallery}`;
const GALLERY_BROKEN = `          gallery={undefined}`;
const ASPECT_FIX = `          aspect={FRAME_ASPECT}`;
const ASPECT_BROKEN = `          aspect='1/1'`;

const patcher = (filter, pairs, loader) => ({
  name: 'strip-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const pairs = [];
if (MUT.gallery) pairs.push([GALLERY_FIX, GALLERY_BROKEN]);
if (MUT.aspect) pairs.push([ASPECT_FIX, ASPECT_BROKEN]);
// ЗАБЫТЫЙ `plugins` — известный способ получить ложную зелень: мутация не доезжает до сборки,
// и стенд подтверждает починку, которой в бандле нет.
const plugins = pairs.length ? [patcher(/strip-cell\.tsx$/, pairs, 'tsx')] : [];

const outfile = resolve(tmpdir(), `design-strip-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'design-strip-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins,
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ СБОРКИ: без него «ни одной ошибки» неотличимо от «собралось не то».
if (!bundle.includes('Go to item ')) dieNotRun('в бандле нет ленты просмотрщика — собралось не то');
if (!bundle.includes('no image')) dieNotRun('в бандле нет примитива плитки — собралось не то');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const img = (w, h, fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`,
  );

const STRIPS = [
  {
    key: 'flats',
    cells: [
      { id: 'a1', src: img(200, 100, '#334'), alt: 'front flat', badge: 'FRONT', emphasis: true },
      { id: 'a2', src: img(100, 200, '#433'), alt: 'back flat', badge: 'BACK' },
    ],
  },
  {
    key: 'renders',
    cells: [
      { id: 'b1', src: img(160, 160, '#343'), alt: 'front render', badge: 'FRONT' },
      { id: 'b2', src: img(160, 160, '#443'), alt: 'side render', badge: 'SIDE L' },
    ],
  },
];

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://127.0.0.1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

await page.goto('http://127.0.0.1/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate((s) => window.__strip.mount(s), STRIPS);
await page.waitForSelector('[data-cell="a1"] img', { timeout: 15000 });

// ── 1. КАДР ──────────────────────────────────────────────────────────────────────────────────────
head('кадр ячейки');
const box = await page.evaluate(() => {
  const im = document.querySelector('[data-cell="a1"] img');
  const tile = im?.closest('div[style*="aspect-ratio"]');
  if (!tile) return null;
  const r = tile.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
ck(!!box, 'кадр найден по объявленному соотношению сторон');
if (box) {
  ck(Math.abs(box.w - 132) <= 1, 'ширина кадра 132px', `замер ${box.w}`);
  ck(Math.abs(box.h - 148) <= 1, 'высота кадра 148px', `замер ${box.h}`);
}

// ── 2. ТИХИЙ ОРГАН ───────────────────────────────────────────────────────────────────────────────
head('угловой zoom — закон тихого органа');
const zoomSel = '[data-cell="a1"] button[aria-label="zoom front flat"]';
const hasZoom = (await page.locator(zoomSel).count()) > 0;
ck(hasZoom, 'угловая кнопка zoom нарисована примитивом');
if (hasZoom) {
  const atRest = await page.locator(zoomSel).evaluate((n) => getComputedStyle(n).opacity);
  ck(atRest === '0', 'в покое орган прозрачен', `opacity ${atRest}`);
  // НАСТОЯЩЕЕ ДВИЖЕНИЕ МЫШИ В ЦЕНТР КАДРА, а не `locator.hover()`: поверхность-зум примитива
  // накрывает картинку целиком и честно перехватывает указатель, поэтому playwright отказывается
  // наводиться на сам `<img>`. Наведение проверяется как жест человека — по координате.
  const at = await page.evaluate(() => {
    const r = document
      .querySelector('[data-cell="a1"] img')
      .closest('div[style*="aspect-ratio"]')
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction(
    (s) => getComputedStyle(document.querySelector(s)).opacity === '1',
    zoomSel,
    { timeout: 3000 },
  ).catch(() => {});
  const onHover = await page.locator(zoomSel).evaluate((n) => getComputedStyle(n).opacity);
  ck(onHover === '1', 'при наведении орган виден', `opacity ${onHover}`);
}

// ── 3. РЯД СКВОЗНОЙ ──────────────────────────────────────────────────────────────────────────────
head('ряд просмотрщика — сквозной по обеим полосам');
const rowFrom = async (sel) => {
  await page.locator(sel).evaluate((n) => n.click());
  await page.waitForSelector('[aria-label="Go to item 1"]', { timeout: 5000 }).catch(() => {});
  const state = await page.evaluate(() => {
    const strip = [...document.querySelectorAll('button[aria-label^="Go to item "]')];
    const active = strip.findIndex((b) => b.getAttribute('aria-current') === 'true');
    return { total: strip.length, active };
  });
  await page.keyboard.press('Escape');
  await page.waitForSelector('button[aria-label^="Go to item "]', {
    state: 'detached',
    timeout: 5000,
  }).catch(() => {});
  return state;
};

if (hasZoom) {
  const fromA = await rowFrom(zoomSel);
  ck(fromA.total === 4, 'открытый из ПЕРВОЙ полосы ряд держит все 4 картинки обеих полос',
    `в ряду ${fromA.total}`);
  ck(fromA.active === 0, 'встал на свою картинку (первая в документе)', `активна ${fromA.active}`);

  const fromB = await rowFrom('[data-cell="b1"] button[aria-label="zoom front render"]');
  ck(fromB.total === 4, 'открытый из ВТОРОЙ полосы ряд тот же самый', `в ряду ${fromB.total}`);
  ck(
    fromB.active === 2,
    'порядок ряда — порядок в документе: третий кадр, а не первый',
    `активна ${fromB.active}`,
  );
} else {
  ck(false, 'ряд не измерен: угловой кнопки нет');
}

// ── 4. ШУМ СТРАНИЦЫ ──────────────────────────────────────────────────────────────────────────────
head('исполнение');
ck(pageErrors.length === 0, 'страница не бросила ошибок', pageErrors.join(' | ').slice(0, 200));

await browser.close();

const mutating = MUT.gallery || MUT.aspect;
console.log(`\nпровалов: ${bad}`);
if (mutating) {
  // МУТАЦИЯ ОБЯЗАНА РОНЯТЬ. Зелёная мутация означает сторожа у мёртвого кода, и это ХУЖЕ красноты.
  console.log(bad > 0 ? 'мутация уронила пробу — стенд меряет предмет' : 'МУТАЦИЯ НЕ УРОНИЛА ПРОБУ');
  process.exit(bad > 0 ? 0 : 3);
}
process.exit(bad === 0 ? 0 : 1);
