#!/usr/bin/env node
// ВЫБОР ВЫНОСКИ = ДЫХАНИЕ (T33, R43). Владелец: «любой селект колаута это этот толстый квадратик
// его быть не должно можно сделать некое дыхание обводки». Квадрат был ручками региона детали,
// проступавшими сквозь её вставку, когда вставка стоит на регионе.
//
//   node scripts/callout-selection-probe.mjs [--mutate=handles|stroke] [--shots=<dir>] [--prefix=33]
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
