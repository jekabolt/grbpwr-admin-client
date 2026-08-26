#!/usr/bin/env node
// УТВЕРЖДАЕТ: ряд лиц над доской живой — рисуется, считает кучки и СУЖАЕТ доску щелчком,
// взаимно гасясь с «my tasks». КРАСНЕЕТ ОТ: --mutate-no-row (ряд лиц не рисуется вовсе).
//
// РЯД ЛИЦ НАД ДОСКОЙ ЖИВОЙ: он рисуется, считает и СУЖАЕТ.
//
// Чистая проба доказала правила (`assigneePiles`, `applyFilters`, `setFilter`). Она НЕ
// доказывает, что эти правила кто-то зовёт: сторож у мёртвого кода зеленеет вечно. Здесь
// нажимают настоящей мышью по настоящему ряду и смотрят на список карточек под ним.
//
//   Ц1 — в ряду ровно три лица с числами 3 · 3 · 1 («никто» — последним);
//   Ц2 — щелчок по лицу x сужает доску до 1,2,5 (включая ту, где x ВТОРОЙ);
//   Ц3 — щелчок по зажжённому лицу снимает сужение;
//   Ц4 — «my tasks» гасит лицо, лицо гасит «my tasks» — на живом экране, а не в функции.
//
//   node scripts/task-filters-row-probe.mjs
//   node scripts/task-filters-row-probe.mjs --mutate-no-row   ряд лиц не рисуется вовсе
import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const req = createRequire(import.meta.url);
const dieNotRun = (why) => {
  console.log(`\nНЕ ЗАПУСКАЛАСЬ: ${why}`);
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? String(e)));
function resolvePlaywright() {
  try { return req.resolve('playwright'); } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch { return null; }
}
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright без chromium');

let cssDir = [];
try { cssDir = readdirSync(resolve(REPO, 'dist/assets')); } catch { dieNotRun('нет dist/assets — сначала `yarn build`'); }
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('нет dist/assets/index-*.css');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

const outfile = resolve(tmpdir(), `filters-row-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-filters-row-probe-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020',
  absWorkingDir: REPO, nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic', minify: false, outfile, logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));
let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

if (process.argv.includes('--mutate-no-row')) {
  const needle = '!!people?.length &&';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, 'false &&');
  console.log('  МУТАЦИЯ: ряд лиц не рисуется');
}

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.waitForSelector('#visible');

const faces = page.locator('button[aria-pressed]').filter({ has: page.locator('span[title]') });
const row = await page.evaluate(() => {
  // Лицо = кнопка с aria-pressed, внутри которой кружок Avatar (span[title]).
  return [...document.querySelectorAll('button[aria-pressed]')]
    .filter((b) => b.querySelector('span[title]'))
    // ЧИСЛО БЕРЁТСЯ ИЗ СВОЕГО УЗЛА, а не из `textContent` кнопки: та склеивает инициалы
    // аватара со счётчиком («X3»), и сравнение с «3» краснело бы по неправильной причине —
    // тот же приём склейки, что однажды дал ложную ЗЕЛЕНЬ.
    .map((b) => ({
      title: b.querySelector('span[title]').getAttribute('title'),
      text: (b.lastChild?.textContent || '').trim(),
    }));
});
console.log('\nЦИТАТА · что стоит в ряду');
ck(row.length === 3, 'Ц1 в ряду три кучки', JSON.stringify(row));
ck(JSON.stringify(row.map((r) => r.text)) === '["3","3","1"]', 'Ц1.1 числа кучек: 3 · 3 · 1', JSON.stringify(row.map((r) => r.text)));
ck(row[2]?.title === 'unassigned', 'Ц1.2 «никто не взял» стоит последним', JSON.stringify(row.map((r) => r.title)));

const visible = () => page.evaluate(() => document.getElementById('visible').textContent);
const state = () => page.evaluate(() => document.getElementById('filters').textContent);
ck((await visible()) === '1,2,3,4,5', 'Ц1.3 до нажатий видны все пять');

if (row.length >= 1) {
  const xFace = page.locator('button[aria-pressed]', { has: page.locator('span[title="x"]') }).first();
  await xFace.click();
  ck((await visible()) === '1,2,5', 'Ц2 щелчок по лицу x сузил доску до его трёх', await visible());
  ck((await xFace.getAttribute('aria-pressed')) === 'true', 'Ц2.1 лицо зажглось');
  await xFace.click();
  ck((await visible()) === '1,2,3,4,5', 'Ц3 щелчок по зажжённому снял сужение', await visible());

  // Ц4 — взаимоисключение на живом экране.
  await page.getByRole('button', { name: 'my tasks' }).click();
  ck(JSON.parse(await state()).mine === true, 'Ц4.0 «my tasks» зажжён');
  await xFace.click();
  const s1 = JSON.parse(await state());
  ck(s1.mine === false && s1.assignee === 'x', 'Ц4 выбор лица ПОГАСИЛ «my tasks»', JSON.stringify(s1));
  await page.getByRole('button', { name: 'my tasks' }).click();
  const s2 = JSON.parse(await state());
  ck(s2.mine === true && s2.assignee === undefined, 'Ц4.1 «my tasks» ПОГАСИЛ лицо', JSON.stringify(s2));
} else {
  ck(false, 'Ц2..Ц4 не проверены — ряда лиц на экране нет');
}

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
