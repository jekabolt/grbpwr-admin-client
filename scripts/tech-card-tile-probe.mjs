#!/usr/bin/env node
// ПЛИТКА ТЕХ-КАРТЫ: миниатюра вписывается (п.11) и мета называет классификацию (п.20).
//
// Обе правки — про то, что ВИДНО, и обе зелены у `tsc` в любом виде. Поэтому здесь настоящий
// браузер, настоящий CSS админки из dist (без него ни один tailwind-класс не существует, и
// `object-contain` некому применить) и настоящий резолв имён категорий через DictionaryProvider.
//
// ЧТО ИМЕННО ПРОВЕРЯЕТСЯ У МЕТЫ, И ПОЧЕМУ ТРЁХ КАРТ МАЛО ДЛЯ ОДНОЙ:
//   · карта, категоризованная до типа  → в мете обязано стоять имя ТИПА («parka»);
//   · карта, категоризованная только до верхнего уровня → имя ВЕРХНЕГО («outerwear»). Буквальное
//     «показывать subCategory» нарисовало бы здесь пустоту — а таких карт половина каталога;
//   · aux-карта → первым остаётся её subtype («dust bag»), категория его не вытесняет.
// Текст берётся innerText (он отдаёт РЕНДЕР, вместе с uppercase), а не textContent: склейка
// соседних узлов через textContent уже давала здесь ложную зелень.
//
// Запуск:  node scripts/tech-card-tile-probe.mjs [--mutate-cover] [--mutate-meta]
//          [--mutate-deepest] [--mutate-title]

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  cover: process.argv.includes('--mutate-cover'),
  meta: process.argv.includes('--mutate-meta'),
  deepest: process.argv.includes('--mutate-deepest'),
  title: process.argv.includes('--mutate-title'),
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
const COVER_FIX = `bg-bgColor object-contain \${`;
const COVER_BROKEN = `bg-bgColor object-cover \${`;
const META_FIX = `  const meta = [subtype || categoryName, season, updated === '—' ? '' : updated]`;
const META_BROKEN = `  const meta = [subtype, season, updated === '—' ? '' : updated]`;
const DEEPEST_FIX = `    const catId = card.typeId || card.subCategoryId || card.topCategoryId || card.categoryId || 0;`;
const DEEPEST_BROKEN = `    const catId = card.subCategoryId || 0;`;
const TITLE_FIX = `        // Имя однострочно и режется дорожкой сетки — hover обязан дочитывать его целиком.
        title={title}
`;
const TITLE_BROKEN = ``;

const patcher = (filter, pairs, loader) => ({
  name: 'tile-mutation',
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
if (MUT.cover) pairs.push([COVER_FIX, COVER_BROKEN]);
if (MUT.meta) pairs.push([META_FIX, META_BROKEN]);
if (MUT.deepest) pairs.push([DEEPEST_FIX, DEEPEST_BROKEN]);
if (MUT.title) pairs.push([TITLE_FIX, TITLE_BROKEN]);
const plugins = pairs.length ? [patcher(/tech-card-tile\.tsx$/, pairs, 'tsx')] : [];

const outfile = resolve(tmpdir(), `tech-card-tile-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tech-card-tile-entry.tsx')],
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
if (!bundle.includes('aspect-[3/4]')) dieNotRun('в бандле нет разметки плитки — собралось не то');

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

// ШИРОКАЯ картинка 200×100 в кадре 3/4 — то самое «не вмещается», о котором говорил владелец.
const WIDE_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#333"/><rect x="0" y="0" width="20" height="100" fill="#f00"/><rect x="180" y="0" width="20" height="100" fill="#00f"/></svg>`,
  );

const DICT = {
  dictionary: {
    categories: [
      { id: 1, name: 'outerwear', level: 'top_category', parentId: 0 },
      { id: 2, name: 'jackets', level: 'sub_category', parentId: 1 },
      { id: 3, name: 'parka', level: 'type', parentId: 2 },
    ],
    sizes: [],
    collections: [],
  },
};

const CARDS = [
  {
    id: 1,
    styleNumber: 'SN123',
    name: 'hoodie with a very long name that will not fit the track',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_SELLABLE',
    previewUrl: WIDE_IMG,
    topCategoryId: 1,
    subCategoryId: 2,
    typeId: 3,
    skuSeason: { code: 'SEASON_ENUM_FW', year: 2026 },
    updatedAt: '2026-08-20T10:00:00Z',
  },
  {
    // Карта, категоризованная ТОЛЬКО до верхнего уровня — половина каталога такая.
    id: 2,
    styleNumber: 'SN200',
    name: 'coat',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_SELLABLE',
    previewUrl: WIDE_IMG,
    topCategoryId: 1,
    skuSeason: { code: 'SEASON_ENUM_SS', year: 2026 },
    updatedAt: '2026-08-19T10:00:00Z',
  },
  {
    // AUX: у неё классификация уже есть — subtype, и он остаётся первым.
    id: 3,
    styleNumber: 'AUX9',
    name: 'dust bag large',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_AUXILIARY',
    auxSubtype: 'TECH_CARD_AUX_SUBTYPE_DUST_BAG',
    previewUrl: WIDE_IMG,
    topCategoryId: 1,
    updatedAt: '2026-08-18T10:00:00Z',
  },
  {
    // Компактная плитка доски конвейера: только артикул, меты нет по замыслу.
    id: 4,
    __compact: true,
    styleNumber: 'SN400',
    name: 'board tile',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_SELLABLE',
    previewUrl: WIDE_IMG,
    typeId: 3,
    updatedAt: '2026-08-17T10:00:00Z',
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route('http://stub.invalid/**', (route) => {
  if (route.request().url().includes('api/admin/dictionary'))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DICT),
    });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
const FAKE_JWT = `h.${Buffer.from(JSON.stringify({ exp: FAR_FUTURE })).toString('base64')}.s`;

await page.goto('http://probe.local/');
await page.evaluate((t) => localStorage.setItem('authToken', t), FAKE_JWT);
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate((c) => window.__tile.mount(c), CARDS);
await page.waitForSelector('[data-tile="1"] img', { timeout: 15000 });
// Словарь приезжает сетью, ПОСЛЕ первого кадра: без ожидания «имени категории нет» смешалось бы
// с «оно ещё не приехало».
await page.waitForFunction(
  () => (document.querySelector('[data-tile="1"]')?.innerText || '').toLowerCase().includes('parka'),
  null,
  { timeout: 10000 },
).catch(() => {});

const thumb = (id) =>
  page.evaluate((i) => {
    const img = document.querySelector(`[data-tile="${i}"] img`);
    if (!img) return null;
    const cs = getComputedStyle(img);
    const r = img.getBoundingClientRect();
    return {
      objectFit: cs.objectFit,
      w: r.width,
      h: r.height,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      bg: cs.backgroundColor,
    };
  }, id);

// innerText — это РЕНДЕР (uppercase из css уже применён), и он не склеивает соседние узлы так,
// как это делает textContent.
const tileText = (id) =>
  page.evaluate(
    (i) => (document.querySelector(`[data-tile="${i}"]`)?.innerText || '').toLowerCase(),
    id,
  );
const metaOf = (id) =>
  page.evaluate((i) => {
    const nodes = [...document.querySelectorAll(`[data-tile="${i}"] p`)];
    const meta = nodes.find((n) => n.className.includes('truncate') && n.title);
    return meta ? { text: (meta.innerText || '').toLowerCase(), title: meta.title } : null;
  }, id);
head('ЦИТАТА А — п.11: широкая картинка вписывается в кадр, а не обрезается');
{
  const t = await thumb(1);
  ck(!!t, 'миниатюра отрисована');
  ck(t.objectFit === 'contain', 'object-fit = contain (картинка видна целиком)', t.objectFit);
  ck(t.natural === '200x100', 'у картинки действительно НЕ 3/4', t.natural);
  ck(Math.abs(t.h / t.w - 4 / 3) < 0.05, 'кадр остался 3/4 — ряды сетки ровные', `${(t.h / t.w).toFixed(2)}`);
  ck(t.bg !== 'rgba(0, 0, 0, 0)', 'поля letterbox залиты фоном, а не серым листом', t.bg);
}

head('ЦИТАТА Б — п.11: то же на компактной плитке доски конвейера (плитка одна на два экрана)');
{
  const t = await thumb(4);
  ck(t.objectFit === 'contain', 'object-fit = contain и на доске', t.objectFit);
  ck(Math.abs(t.h / t.w - 1) < 0.05, 'кадр доски остался квадратным', `${(t.h / t.w).toFixed(2)}`);
}

head('ЦИТАТА В — п.20: мета называет САМЫЙ ГЛУБОКИЙ заданный уровень категории');
{
  const m1 = await metaOf(1);
  ck(!!m1, 'мета отрисована');
  ck(m1.text.startsWith('parka'), 'карта до типа: «parka», а не «outerwear»', m1.text);
  ck(m1.text.includes('fw 2026'), 'сезон на месте', m1.text);
  ck(m1.text.includes('2026-08-20'), 'дата последней в строке', m1.text);

  const m2 = await metaOf(2);
  ck(
    m2.text.startsWith('outerwear'),
    'карта только до верхнего уровня: «outerwear», а не пустота',
    m2.text,
  );
}

head('ЦИТАТА Г — п.20: у aux первым остаётся subtype, категория его не вытесняет');
{
  const m3 = await metaOf(3);
  ck(m3.text.startsWith('dust bag'), 'мета aux начинается с subtype', m3.text);
  ck(!m3.text.includes('outerwear'), 'категория не дублирует subtype', m3.text);
}

head('ЦИТАТА Д — п.20: длинное имя и мета дочитываются по hover');
{
  const t = await page.evaluate(
    () => document.querySelector('[data-tile="1"] button')?.getAttribute('title') ?? '',
  );
  ck(
    t === 'SN123 hoodie with a very long name that will not fit the track',
    'title плитки несёт полное имя',
    t,
  );
  const m1 = await metaOf(1);
  ck(!!m1?.title && m1.title.toLowerCase() === m1.text, 'title меты совпадает с её текстом', m1?.title);
}

head('ЦИТАТА Е — компактная плитка доски по-прежнему без меты');
{
  const txt = await tileText(4);
  ck(!txt.includes('parka'), 'категории на компактной плитке нет', txt.replace(/\n/g, ' · '));
  ck(txt.includes('sn400'), 'артикул на месте', txt.replace(/\n/g, ' · '));
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
const mutated = Object.entries(MUT)
  .filter(([, on]) => on)
  .map(([k]) => k);
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${mutated.length ? ` (мутации: ${mutated.join(', ')})` : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
