#!/usr/bin/env node
// КВАДРАТ У ПЛАШКИ ВЫБРАННОЙ ВЫНОСКИ (T26, R33). Владелец: «осталось это квадратное выделение у
// текстблока» … «его надо убрать».
//
//   node scripts/plate-focus-probe.mjs [--mutate=mark|ring] [--shots=<dir>]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';
const MUTATIONS = {
  // Нажатие мыши больше не метит элемент: первая же клавиша снова рисует кольцо.
  mark: { file: /annotation\/surface\.tsx$/, from: "e.currentTarget.setAttribute('data-pointer-focus', '')", to: 'void e' },
  // Умолчательное кольцо браузера возвращается.
  ring: { file: /annotation\/surface\.tsx$/, from: "'outline-none [&:focus-visible", to: "'[&:focus-visible" },
};
const mutation = MUTATE && {
  name: 'mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE];
    b.onLoad({ filter: m.file }, async (a) => {
      let src = await readFile(a.path, 'utf8');
      if (!src.includes(m.from)) throw new Error(`мутация «${MUTATE}» не нашла строку`);
      src = src.replace(m.from, m.to);
      return { contents: src, loader: 'tsx' };
    });
  },
};
const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const nope=()=>Promise.resolve({});export const adminService=new Proxy({},{get:()=>nope});export const authService=adminService;export const frontendService=adminService;export default {adminService};',
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};
const r = (p) => resolve(REPO, 'src', p);
const outfile = resolve(tmpdir(), `plate-focus-${process.pid}.js`);
await build({
  entryPoints: [resolve(HERE, 'plate-focus-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile, jsx: 'automatic', logLevel: 'warning', absWorkingDir: REPO,
  plugins: mutation ? [stub, mutation] : [stub],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: { components: r('components'), lib: r('lib'), api: r('api'), utils: r('utils'), ui: r('ui'), constants: r('constants'), store: r('store'), hooks: r('hooks') },
});

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch { /* кэш npx */ }
  const root = `${homedir()}/.npm/_npx`;
  if (!existsSync(root)) return null;
  const found = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return found[0] ? `${found[0]}/index.js` : null;
}
const pwPath = resolvePlaywright();
if (!pwPath) { console.log('playwright не найден — проба пропущена'); process.exit(0); }
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => readFileSync(f, 'utf8')).join('\n')
  : '';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 480, height: 560 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => check('page error', false, e.message));
await page.route('http://probe.local/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.goto('http://probe.local/');
if (CSS) await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });
await page.waitForSelector('[data-callout-selected], [data-bench="sheet"] img');


const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').split('=')[1] ?? '';
const shot = async (name) => {
  if (!SHOTS) return;
  const box = await page.$eval('[data-bench="sheet"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: box });
};
// Что рисует рамку у плашки: фокус, его кольцо и всё, у чего есть контур/тень у точки плашки.
const ring = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    const cs = a ? getComputedStyle(a) : null;
    const r = a?.getBoundingClientRect();
    return {
      tag: a?.tagName,
      role: a?.getAttribute('role'),
      plate: a?.hasAttribute('data-callout-selected') ?? false,
      fv: a?.matches(':focus-visible') ?? false,
      outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : '',
      shadow: cs?.boxShadow ?? '',
      box: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '',
    };
  });
const visibleRing = (s) => !/^none|^(\S+) 0px/.test(s.outline) || (s.shadow && s.shadow !== 'none');
const plate = '[data-callout-selected], span[role="button"][title*="print"]';

await page.waitForTimeout(150);
await shot('26-before-click');
// 1. Клик мышью внутри зоны.
const img = await page.$eval('[data-bench="sheet"] img', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width * 0.47, y: r.y + r.height * 0.55 }; });
await page.mouse.click(img.x, img.y);
await page.waitForTimeout(100);
check('зона выбрана кликом', (await page.$eval('[data-bench="sel"]', (el) => el.textContent)) === 'a1');
let s = await ring();
console.log('   фокус после клика по зоне:', JSON.stringify(s));
check('клик по зоне — нет рамки у фокуса', !(s.plate && visibleRing(s)), JSON.stringify(s));
await shot('26-zone-click');
// 2. Клик по самой плашке.
const pl = await page.$eval(plate, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(pl.x, pl.y);
await page.waitForTimeout(100);
s = await ring();
console.log('   фокус после клика по плашке:', JSON.stringify(s));
check('клик по плашке — фокус на плашке', s.plate, JSON.stringify(s));
check('клик по плашке — плашка без кольца', !visibleRing(s), JSON.stringify(s));
await shot('26-plate-click');
// 2б. Клик по плашке, затем клавиша (⌘Z, стрелка): Chrome после нажатия клавиши делает фокус,
// поставленный мышью, «видимым» — и рисует умолчательное кольцо.
await page.keyboard.press('Shift+ArrowLeft');
await page.waitForTimeout(50);
s = await ring();
console.log('   плашка, клик + клавиша:', JSON.stringify(s));
check('клик по плашке + клавиша — без кольца', !visibleRing(s), JSON.stringify(s));
await shot('26-plate-click-key');
// 2в. То же с угловой ручкой: квадрат HANDLE_HIT × inv.
const h = await page.$eval('span[role="button"][title^="drag"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(h.x, h.y);
await page.keyboard.press('Shift+ArrowLeft');
await page.waitForTimeout(50);
s = await ring();
console.log('   ручка, клик + клавиша:', JSON.stringify(s));
check('клик по ручке + клавиша — без кольца', !visibleRing(s), JSON.stringify(s));
await shot('26-handle-click-key');
// 3. С клавиатуры кольцо остаётся, но тонкое: 1px чернилами.
await page.mouse.click(5, 5);
await page.keyboard.press('Tab');
for (let i = 0; i < 6 && !(await ring()).plate; i++) await page.keyboard.press('Tab');
s = await ring();
console.log('   фокус с клавиатуры:', JSON.stringify(s));
check('Tab — плашка с тонким кольцом', s.plate && s.fv && /solid 1px/.test(s.outline), JSON.stringify(s));
await shot('26-plate-keyboard');

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail ? 1 : 0);
