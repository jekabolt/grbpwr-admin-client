#!/usr/bin/env node
// ЧИП PURPOSE В ЛИСТЕ ТЕХ-КАРТ (п.10а волны ux-0825).
//
// Владелец просил «фильтр aux / не aux». Фильтр там был всё это время — чип purpose, — но подпись
// у него была ГОЛЫМ значением URL: «all». Слово «all» само по себе не называет фасета, поэтому
// орган читался как декорация, а не как фильтр.
//
// Проба доказывает ДВЕ вещи, и вторая важнее первой:
//   1. чип называет фасет словами («all purposes» / «auxiliary (packaging item)»);
//   2. выбор пункта РЕАЛЬНО сужает лист — в ушедшем на сервер запросе появляется `purpose=auxiliary`.
// Без второй половины зелёный ответ означал бы «подпись поменяли», а не «фильтр работает»: ровно
// та разница, из-за которой клиентский фильтр без бэкенда называется фильтром-плацебо.
//
// Запуск:  node scripts/tech-card-list-purpose-probe.mjs [--mutate-label]
//   --mutate-label — вернуть `label={purpose}`: обязана покраснеть подпись, но НЕ запрос.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = { label: process.argv.includes('--mutate-label') };

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

const LABEL_FIX = `            label={purposeLabel}`;
const LABEL_BROKEN = `            label={purpose}`;

const patcher = (filter, pairs, loader) => ({
  name: 'list-mutation',
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

const plugins = MUT.label
  ? [patcher(/tech-card-list\.tsx$/, [[LABEL_FIX, LABEL_BROKEN]], 'tsx')]
  : [];

const outfile = resolve(tmpdir(), `tc-list-purpose-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tech-card-list-purpose-entry.tsx')],
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
if (!bundle.includes('search name / style')) dieNotRun('в бандле нет разметки листа — собралось не то');

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

const DICT = { dictionary: { categories: [], sizes: [], collections: [] } };
const CARDS = [
  {
    id: 1,
    styleNumber: 'SN123',
    name: 'hoodie',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_SELLABLE',
    updatedAt: '2026-08-20T10:00:00Z',
  },
  {
    id: 2,
    styleNumber: 'AUX9',
    name: 'dust bag',
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_AUXILIARY',
    auxSubtype: 'TECH_CARD_AUX_SUBTYPE_DUST_BAG',
    updatedAt: '2026-08-19T10:00:00Z',
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// ЗАПРОСЫ ЛИСТА КОПЯТСЯ ЦЕЛИКОМ: подпись чипа доказывает только подпись, а сужение живёт в том,
// что ушло на сервер. Сервер отвечает СОГЛАСОВАННО с фильтром — иначе «лист сузился» доказывало бы
// работу заглушки, а не фильтра.
const listCalls = [];
await page.route('http://stub.invalid/**', (route) => {
  const url = route.request().url();
  if (url.includes('api/admin/dictionary'))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DICT),
    });
  if (url.includes('api/admin/tech-card/list')) {
    listCalls.push(url);
    const wanted = new URL(url).searchParams.get('purpose');
    const rows = !wanted
      ? CARDS
      : CARDS.filter((c) =>
          wanted === 'auxiliary'
            ? c.purpose === 'TECH_CARD_PURPOSE_AUXILIARY'
            : c.purpose === 'TECH_CARD_PURPOSE_SELLABLE',
        );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ techCards: rows, total: rows.length }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
const FAKE_JWT = `h.${Buffer.from(JSON.stringify({ exp: FAR_FUTURE })).toString('base64')}.s`;

await page.goto('http://probe.local/');
await page.evaluate((t) => localStorage.setItem('authToken', t), FAKE_JWT);
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__list.mount());
await page.waitForSelector('[aria-label="filter by purpose"]', { timeout: 15000 });
await page.waitForTimeout(400);

const chipText = () =>
  page.evaluate(
    () =>
      (document.querySelector('[aria-label="filter by purpose"]')?.innerText || '')
        .trim()
        .toLowerCase(),
  );
const listedNames = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('p')]
      .map((n) => (n.innerText || '').trim().toLowerCase())
      .filter((t) => t === 'sn123 hoodie' || t === 'aux9 dust bag'),
  );

head('ЦИТАТА А — чип называет фасет, а не показывает голое значение URL');
{
  const t = await chipText();
  ck(t === 'all purposes', 'по умолчанию читается «all purposes»', `«${t}»`);
  ck(t !== 'all', 'немого «all» больше нет', `«${t}»`);
}

head('ЦИТАТА Б — выбор «auxiliary» РЕАЛЬНО сужает лист (запрос, а не подпись)');
{
  const before = await listedNames();
  ck(before.length === 2, 'до фильтра в листе обе карты', before.join(' | '));
  await page.click('[aria-label="filter by purpose"]');
  await page.waitForTimeout(200);
  await page.getByText('auxiliary (packaging item)', { exact: false }).last().click();
  await page.waitForTimeout(500);
  const t = await chipText();
  ck(t.includes('auxiliary'), 'чип назвал выбранный фасет словами', `«${t}»`);
  const last = listCalls[listCalls.length - 1] ?? '';
  ck(last.includes('purpose=auxiliary'), 'на сервер ушёл purpose=auxiliary', last.split('?')[1] ?? last);
  const after = await listedNames();
  ck(after.length === 1 && after[0] === 'aux9 dust bag', 'в листе осталась только aux-карта', after.join(' | '));
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${MUT.label ? ' (мутации: label)' : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
