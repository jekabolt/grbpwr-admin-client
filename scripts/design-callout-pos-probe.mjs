#!/usr/bin/env node
// КООРДИНАТА ВЫНОСКИ: «координаты нет» ≠ «координата равна нулю» (находка 3, круг 4).
//
// ПОЧЕМУ ЭТО НЕЛЬЗЯ ПРОВЕРИТЬ ЧТЕНИЕМ. Старое условие выглядело правильным и даже несло комментарий
// про центр кадра: `Number.isFinite(Number(c.posX ?? ''))`. Дефект целиком в приведении типа —
// `Number('')` равен НУЛЮ, а ноль конечен, — то есть в поведении, а не в форме записи. `tsc` зелен
// у обеих версий: типы одинаковы.
//
// Функция берётся ИЗ МОДУЛЯ (`scripts/design-callout-pos-entry.ts`), а не переписывается сюда.
//
// Запуск:  node scripts/design-callout-pos-probe.mjs [--mutate-empty] [--mutate-range]
//   --mutate-empty  снят разбор пустоты  → строки без координат обязаны съехать в угол (0)
//   --mutate-range  снят сторож диапазона → доля 1.4 обязана пройти как настоящая

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  empty: process.argv.includes('--mutate-empty'),
  range: process.argv.includes('--mutate-range'),
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

const EMPTY_FIX = `  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;`;
const EMPTY_BROKEN = `  if (false) return fallback;`;
const RANGE_FIX = `  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;`;
const RANGE_BROKEN = `  return Number.isFinite(n) ? n : fallback;`;

const patcher = (filter, pairs, loader) => ({
  name: 'pos-mutation',
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
if (MUT.empty) pairs.push([EMPTY_FIX, EMPTY_BROKEN]);
if (MUT.range) pairs.push([RANGE_FIX, RANGE_BROKEN]);
const plugins = pairs.length ? [patcher(/artifacts-panel\.tsx$/, pairs, 'tsx')] : [];

const outfile = resolve(tmpdir(), `design-pos-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'design-callout-pos-entry.ts')],
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
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ — ПО ИМЕНИ ФУНКЦИИ, А НЕ ПО РАЗМЕТКЕ ПАНЕЛИ. Разметку esbuild законно
// вытряхивает: сама панель отсюда не вызывается, живёт только её экспорт. Проверять вытрясенное —
// значит объявить пробу невыполненной там, где всё в порядке (первый прогон так и сделал).
if (!bundle.includes('frameFraction')) dieNotRun('в бандле нет разбора доли — собралось не то');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://127.0.0.1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://127.0.0.1/');
await page.addScriptTag({ content: bundle });

const loaded = await page.evaluate(() => typeof window.__pos === 'function');
if (!loaded) dieNotRun(`функция не доехала в страницу: ${pageErrors.join(' | ')}`);

// [вход, ожидание, что этот случай означает на карточке]
const CASES = [
  [null, 0.5, 'pos_x = NULL с провода (EmitUnpopulated шлёт явный null)'],
  [undefined, 0.5, 'поля нет вовсе — старая строка формы'],
  ['', 0.5, 'пустая строка — ровно то, что Number() превращал в 0'],
  ['   ', 0.5, 'пробелы'],
  ['abc', 0.5, 'мусор'],
  ['1.4', 0.5, 'доля за правым краем кадра — маркер был бы не виден'],
  ['-3', 0.5, 'доля левее кадра'],
  [0, 0, 'НАСТОЯЩИЙ ноль числом остаётся нулём'],
  ['0', 0, 'настоящий ноль строкой остаётся нулём'],
  ['1', 1, 'правый край — законная доля'],
  ['0.237', 0.237, 'обычная сохранённая доля не тронута'],
];

console.log('\nразбор доли кадра');
const got = await page.evaluate((cs) => cs.map(([v]) => window.__pos(v)), CASES);
CASES.forEach(([value, want, why], i) => {
  ck(got[i] === want, `${JSON.stringify(value)} → ${want}`, `${why}; получено ${got[i]}`);
});

ck(pageErrors.length === 0, 'страница не бросила ошибок', pageErrors.join(' | ').slice(0, 200));
await browser.close();

const mutating = MUT.empty || MUT.range;
console.log(`\nпровалов: ${bad}`);
if (mutating) {
  console.log(bad > 0 ? 'мутация уронила пробу — стенд меряет предмет' : 'МУТАЦИЯ НЕ УРОНИЛА ПРОБУ');
  process.exit(bad > 0 ? 0 : 3);
}
process.exit(bad === 0 ? 0 : 1);
