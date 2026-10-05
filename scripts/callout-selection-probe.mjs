#!/usr/bin/env node
// ВЫБОР ВЫНОСКИ = ДЫХАНИЕ (T33, R43). Владелец: «любой селект колаута это этот толстый квадратик
// его быть не должно можно сделать некое дыхание обводки». Квадрат был ручками региона детали,
// проступавшими сквозь её вставку, когда вставка стоит на регионе.
//
//   node scripts/callout-selection-probe.mjs [--mutate=handles|stroke|region|fit] [--shots=<dir>] [--prefix=33]
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
  // Ручки детали снова поверх её вставки.
  handles: { file: /annotation\/surface\.tsx$/, from: "const handlesUnderInsets = selectedCallout?.spec?.t === 'detail';", to: 'const handlesUnderInsets = false;' },
  // Выбранная фигура снова толще соседей.
  // Зона детали снова не ловится по площади под взведённым видом (R44).
  region: { file: /annotation\/surface\.tsx$/, from: "const artwork = c.spec?.t === 'artwork' || c.spec?.t === 'detail';", to: "const artwork = c.spec?.t === 'artwork';" },
  // Записанная подпись детали снова расходится с прижатой вставкой.
  fit: { file: /annotation\/surface\.tsx$/, from: '? fitDetailLabel(\n              dc,', to: '? ((_c: unknown, l: { x: number; y: number }) => l)(\n              dc,' },
  stroke: { file: /annotation\/surface\.tsx$/, from: 'halo={halo}\n                    />', to: 'halo={halo}\n                      strokeWidth={selected === c.key ? 2 : 1.5}\n                    />' },
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
const outfile = resolve(tmpdir(), `callout-selection-${process.pid}.js`);
await build({
  entryPoints: [resolve(HERE, 'callout-selection-entry.tsx')],
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
const ctx = await browser.newContext({ viewport: { width: 480, height: 560 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => check('page error', false, e.message));
await page.route('http://probe.local/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.goto('http://probe.local/');
if (CSS) await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });
await page.waitForSelector('[data-bench="sheet"] img');
await page.waitForTimeout(200);

const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').split('=')[1] ?? '';
const PREFIX = (process.argv.find((a) => a.startsWith('--prefix=')) ?? '').split('=')[1] ?? '33';
const shot = async (name) => {
  if (!SHOTS) return;
  const box = await page.$eval('[data-bench="sheet"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${SHOTS}/${PREFIX}-${name}.png`, clip: box, animations: 'disabled' });
};
const select = async (k) => { await page.evaluate((key) => window.__select(key), k); await page.waitForTimeout(120); };
// Штрихи фигур: у выбранной та же толщина, что у соседей.
const strokes = () => page.$$eval('svg [stroke-width]', (els) => [...new Set(els.filter((e) => !e.closest('[data-selection-trace]') && !e.closest('defs') && e.getAttribute('stroke') !== 'transparent').map((e) => e.getAttribute('stroke-width')))]);
const breathing = () => page.evaluate(() => {
  const g = document.querySelector('[data-selection-trace]');
  const box = document.querySelector('[data-callout-selected]');
  return {
    trace: g ? getComputedStyle(g).animationName : null,
    box: box ? getComputedStyle(box, '::after').animationName : null,
    boxShadow: box ? getComputedStyle(box).boxShadow : null,
  };
});

await shot('none');
const START_CS = await page.evaluate(() => window.__cs());
const base = await strokes();
// 1. ДЕТАЛЬ, вставка на своём регионе: ни одна ручка не лежит поверх вставки.
await select('det');
const over = await page.evaluate(() => {
  const inset = document.querySelector('[data-callout-detail]').getBoundingClientRect();
  return [...document.querySelectorAll('span[role="button"][title^="drag"], span[title="add a vertex on this side"]')].filter((h) => {
    const r = h.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (x < inset.left || x > inset.right || y < inset.top || y > inset.bottom) return false;
    const top = document.elementFromPoint(x, y);
    return top === h || h.contains(top);
  }).length;
});
check('деталь: ручки не проступают сквозь вставку', over === 0, `${over} поверх`);
check('деталь: штрих выбранной не толще', JSON.stringify(await strokes()) === JSON.stringify(base), JSON.stringify(await strokes()));
let b = await breathing();
check('деталь: вставка дышит (::after)', b.box === 'calloutBreathe', JSON.stringify(b));
check('деталь: регион дышит', b.trace === 'calloutBreathe', JSON.stringify(b));
await shot('detail');
// 2. АРТВОРК, ЛИДЕР, РАЗРЕЗ, ПИН.
for (const [k, name, trace] of [['art', 'artwork', true], ['lead', 'leader', true], ['sec', 'section', true], ['pin', 'pin', false]]) {
  await select(k);
  b = await breathing();
  check(`${name}: штрих не толще`, JSON.stringify(await strokes()) === JSON.stringify(base));
  if (trace) check(`${name}: линия дышит`, b.trace === 'calloutBreathe', JSON.stringify(b));
  check(`${name}: плашка/маркер дышит, своя тень не тронута`, b.box === 'calloutBreathe' && (k === 'pin' || b.boxShadow === 'none'), JSON.stringify(b));
  await shot(name);
}
// 2б. ДЕТАЛЬ С ПРИЖАТОЙ ВСТАВКОЙ (T34, R43): регион справа, вставку утащили в левый верхний угол
// за край кадра. Внутри вставки — только её картинка, номер и ×N.
const FAR = [
  { key: 'far', kind: 'polygon', number: 1, points: [{ x: 0.7, y: 0.6 }, { x: 0.8, y: 0.6 }, { x: 0.8, y: 0.7 }, { x: 0.7, y: 0.7 }], label: { x: 0.01, y: 0.01 }, text: 'pocket — all edges clean, turned under', filled: false, spec: { t: 'detail', scale: 6 } },
  { key: 'line', kind: 'dim', number: 2, points: [{ x: 0.1, y: 0.85 }, { x: 0.4, y: 0.87 }], label: { x: 0.25, y: 0.75 }, text: 'test', color: 'blue' },
];
await page.evaluate((cs) => { window.__set(cs); window.__tool('label'); }, FAR);
await select('far');
await page.evaluate(() => window.__hot('far'));
await page.waitForTimeout(150);
const inside = await page.evaluate(() => {
  const ins = document.querySelector('[data-callout-detail]');
  const r = ins.getBoundingClientRect();
  const foreign = new Set();
  for (let gx = 0.08; gx < 1; gx += 0.07)
    for (let gy = 0.08; gy < 1; gy += 0.07) {
      const top = document.elementFromPoint(r.left + r.width * gx, r.top + r.height * gy);
      if (top && top !== ins && !ins.contains(top)) foreign.add(`${top.tagName}.${(top.getAttribute('class') || '').slice(0, 40)}`);
    }
  const own = [...ins.querySelectorAll('*')].filter((e) => !(e.tagName === 'IMG' || /^×\d|^\d+$/.test(e.textContent.trim()) || e.querySelector('img'))).map((e) => e.textContent.trim().slice(0, 20));
  return { foreign: [...foreign], own };
});
check('прижатая вставка: поверх неё ничего чужого', inside.foreign.length === 0, JSON.stringify(inside));
check('прижатая вставка: внутри только картинка, номер, ×N (подпись — под ней)', inside.own.every((t) => t.startsWith('pocket')), JSON.stringify(inside.own));
await page.evaluate(() => window.__hot(null));
await shot('clamped-inset');
// R44: курсор-рука над зоной детали, клик внутри неё выбирает её, а не ставит новую выноску — даже
// под взведённым видом; повторный клик оставляет выбранной.
await select(null);
const zone = await page.evaluate(() => {
  const f = document.querySelector('[data-bench="sheet"] img').getBoundingClientRect();
  return { x: f.left + f.width * 0.75, y: f.top + f.height * 0.65 };
});
await page.mouse.move(zone.x, zone.y);
const cur = await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, zone);
check('R44 над зоной детали — курсор pointer', cur === 'pointer', cur);
const addsBefore = await page.evaluate(() => window.__adds());
await page.mouse.click(zone.x, zone.y);
await page.waitForTimeout(150);
const after1 = await page.evaluate(() => ({ sel: document.querySelector('[data-bench="sel"]').textContent, adds: window.__adds() }));
check('R44 клик по зоне детали под взведённым видом выбирает её', after1.sel === 'far' && after1.adds === addsBefore, JSON.stringify(after1));
await page.mouse.click(zone.x, zone.y);
await page.waitForTimeout(150);
const after2 = await page.evaluate(() => ({ sel: document.querySelector('[data-bench="sel"]').textContent, adds: window.__adds() }));
check('R44 повторный клик — остаётся выбранной, новой выноски нет', after2.sel === 'far' && after2.adds === addsBefore, JSON.stringify(after2));
// Перетащить вставку дальше в угол: записанная подпись = центр нарисованной вставки.
const ib = await page.$eval('[data-callout-detail]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(ib.x, ib.y);
await page.mouse.down();
await page.mouse.move(ib.x + 40, ib.y + 40, { steps: 4 });
await page.mouse.move(ib.x - 200, ib.y - 200, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);
const fitted = await page.evaluate(() => {
  const img = document.querySelector('[data-bench="sheet"] [data-annot-frame] img, [data-bench="sheet"] img');
  const f = img.getBoundingClientRect();
  const r = document.querySelector('[data-callout-detail]').getBoundingClientRect();
  const l = window.__cs().find((c) => c.key === 'far').label;
  return { stored: { x: +(f.left + l.x * f.width).toFixed(1), y: +(f.top + l.y * f.height).toFixed(1) }, drawn: { x: +(r.left + r.width / 2).toFixed(1), y: +(r.top + r.height / 2).toFixed(1) } };
});
check('перетащенная к краю вставка: записанная точка = нарисованный центр', Math.abs(fitted.stored.x - fitted.drawn.x) <= 1.5 && Math.abs(fitted.stored.y - fitted.drawn.y) <= 1.5, JSON.stringify(fitted));
await page.mouse.move(1, 1);
await page.evaluate((cs) => { window.__tool(null); window.__set(cs); }, START_CS);
await select('det');

// 3. reduced motion: ореол есть, пульса нет.
await page.emulateMedia({ reducedMotion: 'reduce' });
await select('det');
b = await breathing();
check('reduced motion: без пульса', b.trace === 'none' && b.box === 'none', JSON.stringify(b));
const op = await page.$eval('[data-selection-trace]', (g) => getComputedStyle(g).opacity);
check('reduced motion: ореол остаётся', Number(op) > 0.5, op);
// 4. печать: ореола нет.
await page.emulateMedia({ media: 'print', reducedMotion: 'no-preference' });
const pr = await page.evaluate(() => ({ trace: getComputedStyle(document.querySelector('[data-selection-trace]')).display, box: getComputedStyle(document.querySelector('[data-callout-selected]'), '::after').display }));
check('печать: без ореола', pr.trace === 'none' && pr.box === 'none', JSON.stringify(pr));

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail ? 1 : 0);
