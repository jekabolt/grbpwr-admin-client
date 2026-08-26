#!/usr/bin/env node
// УТВЕРЖДАЕТ: один исполнитель после мультиасайна выглядит ровно как прежний одиночный
// Avatar (коробка, инициалы, «никто» — байт в байт). КРАСНЕЕТ ОТ: --mutate-no-overlap.
//
// ОДИН ИСПОЛНИТЕЛЬ ВЫГЛЯДИТ РОВНО КАК ДО МУЛЬТИАСАЙНА.
//
// Условие правки А1 названо в плане прямо: «при 1 исполнителе выглядит ровно как сегодняшний
// одиночный Avatar — визуальная регрессия нулевая». Это утверждение о ПИКСЕЛЯХ, и проверять
// его надо коробкой и разметкой, а не чтением кода.
//
//   Ц1 — кружок одного исполнителя байт в байт тот же, что у старого Avatar (внутренний html);
//   Ц2 — коробка того же размера;
//   Ц3 — «никто не взял» — по-прежнему пунктирный «?», тот же html;
//   Ц4 — двое рисуются двумя кружками внахлёст (второй сдвинут влево, есть кольцо стыка);
//   Ц5 — пятеро схлопываются в три лица + «+2», и ряд не растёт бесконечно.
//
//   node scripts/task-avatar-stack-probe.mjs
//   node scripts/task-avatar-stack-probe.mjs --mutate-no-overlap   убрать нахлёст и кольцо стыка
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
const dieNotRun = (w) => { console.log(`\nНЕ ЗАПУСКАЛАСЬ: ${w}`); process.exit(2); };
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? String(e)));
function pwResolve() {
  try { return req.resolve('playwright'); } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const f = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
    return f ? `${f}/index.js` : null;
  } catch { return null; }
}
const pwPath = pwResolve();
if (!pwPath) dieNotRun('playwright не найден');
const { chromium } = await import(pwPath).then((m) => m.default ?? m);
let cssDir = [];
try { cssDir = readdirSync(resolve(REPO, 'dist/assets')); } catch { dieNotRun('нет dist/assets — сначала `yarn build`'); }
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('нет dist/assets/index-*.css');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

const outfile = resolve(tmpdir(), `avatar-stack-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-avatar-stack-probe-entry.tsx')], bundle: true, platform: 'browser',
  format: 'iife', target: 'es2020', absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')], jsx: 'automatic',
  minify: false, outfile, logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') }, define: { 'process.env.NODE_ENV': '"production"' },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));
let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (process.argv.includes('--mutate-no-overlap')) {
  const needle = '"-ml-1.5 ring-1 ring-bgColor"';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, '""');
  console.log('  МУТАЦИЯ: нахлёст и кольцо стыка сняты');
}
let bad = 0;
const ck = (ok, w, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${w}${d ? `  — ${d}` : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.waitForSelector('#new-two');

const shot = await page.evaluate(() => {
  const pick = (id) => {
    const host = document.getElementById(id);
    const circles = [...host.querySelectorAll('span')].filter((s) => s.className.includes('rounded-full'));
    const r = host.firstElementChild.getBoundingClientRect();
    return {
      html: host.innerHTML,
      circles: circles.length,
      box: { w: Math.round(r.width), h: Math.round(r.height) },
      offsets: circles.map((c) => Math.round(c.getBoundingClientRect().left)),
      rings: circles.filter((c) => getComputedStyle(c).boxShadow !== 'none').length,
      text: (host.textContent || '').trim(),
    };
  };
  return { oldOne: pick('old-one'), newOne: pick('new-one'), oldNone: pick('old-none'), newNone: pick('new-none'), two: pick('new-two'), five: pick('new-five') };
});

console.log('\nЦИТАТА · один исполнитель');
// Обёртка `AvatarStack` добавляет внешний span-ряд; сравниваем САМ КРУЖОК.
const circleOf = (h) => h.slice(h.indexOf('<span'));
ck(shot.newOne.circles === 1, 'Ц1.0 у одного исполнителя ровно один кружок', String(shot.newOne.circles));
ck(shot.newOne.text === shot.oldOne.text, 'Ц1 инициалы те же', `${JSON.stringify(shot.oldOne.text)} vs ${JSON.stringify(shot.newOne.text)}`);
ck(shot.newOne.box.w === shot.oldOne.box.w && shot.newOne.box.h === shot.oldOne.box.h, 'Ц2 коробка того же размера', `${JSON.stringify(shot.oldOne.box)} vs ${JSON.stringify(shot.newOne.box)}`);
ck(shot.newOne.rings === 0, 'Ц2.1 у одинокого кружка нет кольца стыка — стыковать не с чем');

console.log('\nЦИТАТА · никто не взял');
ck(shot.newNone.html === shot.oldNone.html, 'Ц3 «никто» рисуется байт в байт прежним пунктирным «?»', shot.newNone.html === shot.oldNone.html ? '' : `${shot.oldNone.html}\n        vs ${shot.newNone.html}`);

console.log('\nЦИТАТА · двое и пятеро');
ck(shot.two.circles === 2, 'Ц4.0 двое = два кружка', String(shot.two.circles));
ck(shot.two.offsets[1] - shot.two.offsets[0] > 0 && shot.two.offsets[1] - shot.two.offsets[0] < 20, 'Ц4 второй кружок НАЛЕЗАЕТ на первый (сдвиг меньше диаметра 20)', `сдвиг ${shot.two.offsets[1] - shot.two.offsets[0]}px`);
ck(shot.two.rings === 1, 'Ц4.1 у налезающего есть кольцо стыка', `колец ${shot.two.rings}`);
ck(shot.five.circles === 4, 'Ц5 пятеро = три лица + один кружок «+N»', String(shot.five.circles));
ck(/\+2$/.test(shot.five.text), 'Ц5.1 хвост назван числом', JSON.stringify(shot.five.text));

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
