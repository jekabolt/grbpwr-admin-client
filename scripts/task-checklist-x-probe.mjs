#!/usr/bin/env node
// УТВЕРЖДАЕТ: ✕ пункта чек-листа виден без наведения мыши и удаляет пункт настоящим тапом
// пальцем. КРАСНЕЕТ ОТ: --mutate-hide-behind-hover (вернуть `opacity-0 group-hover:opacity-100`).
//
// ✕ ПУНКТА ЧЕК-ЛИСТА ДОСТИЖИМ БЕЗ МЫШИ.
//
// Функция удаления существовала end-to-end (RPC, стор, rbac, оптимистичный откат, кнопка) — не
// было ЗАМЕТНОСТИ: кнопка стояла под `opacity-0 group-hover:opacity-100`, то есть под жестом,
// которого на планшете нет вовсе. Поэтому мерить надо не разметку, а ДВЕ вещи разом:
// ВИДИМОСТЬ (вычисленная прозрачность при курсоре, отведённом прочь) и ДОСТИЖИМОСТЬ (настоящий
// тап пальцем в контексте с сенсорным вводом, где ховера не существует по построению).
//
// БЕЗ СОБРАННОЙ CSS АДМИНА проба меряла бы голый html, где прозрачности нет ни у чего и всё
// «видно». Поэтому css грузится из `dist`, а её наличие проверяется положительным контролем:
// класс `.opacity-0` обязан в ней РАБОТАТЬ на подопытном узле.
//
//   Ц1 — ✕ виден при курсоре, отведённом прочь (opacity 1, а не 0);
//   Ц2 — он же не перекрыт: `elementFromPoint` в его центре возвращает его самого;
//   Ц3 — НАСТОЯЩИЙ ТАП в контексте hasTouch удаляет пункт;
//   ЦК — положительный контроль css: рядом стоящий узел с классом `.opacity-0` невидим.
//
//   node scripts/task-checklist-x-probe.mjs
//   node scripts/task-checklist-x-probe.mjs --mutate-hide-behind-hover   вернуть прятанье за ховер

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
  console.log('зелёный или красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? String(e)));


function resolvePlaywright() {
  try {
    return req.resolve('playwright');
  } catch {
    /* ниже — кэш npx */
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
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден — живого стенда нет');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright найден, но без chromium');

// ─── СОБРАННАЯ CSS АДМИНА ───────────────────────────────────────────────────────────────────
let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('нет dist/assets — эта проба меряет НАСТОЯЩУЮ css админа; сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('нет dist/assets/index-*.css — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');
// Мутация ниже возвращает ровно эти два класса — если их нет в собранной css, «мутация»
// оказалась бы пустышкой и зеленела бы по неправильной причине.
for (const needle of ['.opacity-0{', 'group-hover\\:opacity-100']) {
  if (!CSS.includes(needle)) dieNotRun(`в собранной css нет «${needle}» — мутации нечем краснеть`);
}

const outfile = resolve(tmpdir(), `checklist-x-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-checklist-x-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  minify: false,
  outfile,
  logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));

let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

if (process.argv.includes('--mutate-hide-behind-hover')) {
  const needle = 'shrink-0 px-1 text-labelColor transition-colors hover:text-textColor';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(
    needle,
    'shrink-0 px-1 text-labelColor opacity-0 transition-opacity hover:text-textColor group-hover:opacity-100',
  );
  console.log('  МУТАЦИЯ: ✕ снова спрятан за наведение мыши');
}

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

// СЕНСОРНЫЙ КОНТЕКСТ: ховера в нём не бывает — ровно та машина, на которой удаление было
// недостижимо.
const browser = await chromium.launch();
const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 420, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.waitForSelector('[aria-label^="remove"]');

// Положительный контроль css: если бы стиль не приехал, `.opacity-0` не работал бы, и Ц1
// зеленел бы на голом html.
const cssWorks = await page.evaluate(() => {
  const probe = document.createElement('div');
  probe.className = 'opacity-0';
  document.body.appendChild(probe);
  const o = getComputedStyle(probe).opacity;
  probe.remove();
  return o;
});
ck(cssWorks === '0', 'ЦК css админа приехала и работает (.opacity-0 даёт 0)', `opacity=${cssWorks}`);

// Курсор ОТВЕДЁН ПРОЧЬ: иначе меряли бы состояние наведения, которого на таче не бывает.
await page.mouse.move(5, 780);
const shot = await page.evaluate(() => {
  const btn = document.querySelector('[aria-label^="remove"]');
  const r = btn.getBoundingClientRect();
  const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    opacity: getComputedStyle(btn).opacity,
    visible: btn.checkVisibility?.() ?? null,
    box: { w: Math.round(r.width), h: Math.round(r.height) },
    topmostIsButton: mid === btn || btn.contains(mid),
    label: btn.getAttribute('aria-label'),
  };
});

console.log('\nЦИТАТА · что видно без единого движения мышью');
ck(shot.opacity === '1', 'Ц1 ✕ виден без наведения', `opacity=${shot.opacity}, ${shot.label}`);
ck(shot.visible !== false && shot.box.w > 0 && shot.box.h > 0, 'Ц1.1 у кнопки есть коробка', JSON.stringify(shot.box));
ck(shot.topmostIsButton, 'Ц2 в центре кнопки лежит она сама — ничем не перекрыта');

console.log('\nЖЕСТ · настоящий тап пальцем');
const btn = page.locator('[aria-label^="remove"]').first();
const box = await btn.boundingBox();
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(150);
const deleted = await page.evaluate(() => window.__deleted);
ck(JSON.stringify(deleted) === '[11]', 'Ц3 тап удалил ровно тот пункт', JSON.stringify(deleted));

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
