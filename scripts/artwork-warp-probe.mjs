#!/usr/bin/env node
// ВАРП АРТВОРКА: ТОЛЬКО ВЫПУКЛАЯ ЗОНА + ОДИН ЭЛЕМЕНТ (T27, R34/R35). Владелец: «так быть не должно
// + оно очень лагает почему-то» — угол зоны утянули внутрь, проекция взорвалась лучами за кадр, а
// жест тормозил (200 clipPath + 200 <image> на каждое движение).
//
//   node scripts/artwork-warp-probe.mjs [--mutate=clamp|fallback|shape] [--base=<rev>] [--shots=<dir>] [--tag=<prefix>]
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
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? '';
const MUTATE = arg('mutate');
const SHOTS = arg('shots');
const TAG = arg('tag') || '27';
const MUTATIONS = {
  // Ручка снова ставится куда угодно: зона выворачивается.
  clamp: [{ file: /annotation\/surface\.tsx$/, from: 'held = artworkCornerAt(', to: 'held = ((_q: unknown, _i: unknown, p: ShapePoint) => p)(' }],
  // Перенос зоны снова жмёт каждую точку о край по отдельности.
  shape: [{ file: /annotation\/surface\.tsx$/, from: "if (live.current.callouts.find((x) => x.key === d.key)?.spec?.t === 'artwork') {", to: 'if (false) {' }],
  // И ручка, и отрисовка старых вывернутых зон — без проверки выпуклости.
  fallback: [
    { file: /annotation\/surface\.tsx$/, from: 'held = artworkCornerAt(', to: 'held = ((_q: unknown, _i: unknown, p: ShapePoint) => p)(' },
    { file: /annotation\/purpose\.ts$/, from: 'if (pts.length === 4 && quadIsSound(', to: 'if (pts.length === 4 || quadIsSound(' },
  ],
};
const mutation = MUTATE && {
  name: 'mutation',
  setup(b) {
    for (const m of MUTATIONS[MUTATE]) {
      b.onLoad({ filter: m.file }, async (a) => {
        let src = await readFile(a.path, 'utf8');
        if (!src.includes(m.from)) throw new Error(`мутация «${MUTATE}» не нашла строку в ${a.path}`);
        src = src.split(m.from).join(m.to);
        return { contents: src, loader: a.path.endsWith('x') ? 'tsx' : 'ts' };
      });
    }
  },
};
// `--base=<rev>` — отрисовка аннотаций из прежней ревизии (замер «до»): те же стенд и жесты.
const BASE = arg('base');
const baseRev = BASE && {
  name: 'base',
  setup(b) {
    b.onLoad({ filter: /src\/ui\/components\/annotation\/[^/]+\.tsx?$/ }, (a) => ({
      contents: execFileSync('git', ['show', `${BASE}:${a.path.slice(REPO.length + 1)}`], { cwd: REPO, encoding: 'utf8' }),
      loader: a.path.endsWith('x') ? 'tsx' : 'ts',
    }));
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
const outfile = resolve(tmpdir(), `artwork-warp-${process.pid}.js`);
await build({
  entryPoints: [resolve(HERE, 'artwork-warp-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile, jsx: 'automatic', logLevel: 'warning', absWorkingDir: REPO,
  plugins: [stub, mutation, baseRev].filter(Boolean),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '__STUB_ENV__' },
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

// Без vsync: rAF идёт так часто, как успевает отрисовка, и время кадра — это работа, а не 16,7 мс.
const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
async function open({ zoom = false, pts = null } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 480, height: 520 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await page.route('http://probe.local/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://probe.local/');
  if (CSS) await page.addStyleTag({ content: CSS });
  await page.evaluate(([z, p]) => { window.__ZOOM = z; if (p) window.__PTS = p; }, [zoom, pts]);
  await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });
  await page.waitForSelector('span[role="button"][title^="drag"]');
  await page.waitForTimeout(150);
  return page;
}
const shot = async (page, name) => {
  if (!SHOTS) return;
  const box = await page.$eval('[data-bench="sheet"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${SHOTS}/${TAG}-${name}.png`, clip: box });
};
const handles = (page) =>
  page.$$eval('span[role="button"][title^="drag"]', (els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
const pts = async (page) => JSON.parse(await page.$eval('[data-bench="pts"]', (el) => el.textContent));

// Пиксели артворка (красный #7a1f24) по снимку сцены: сколько их внутри габарита зоны и сколько вне.
async function redOutside(page) {
  const hs = await handles(page);
  const xs = hs.map((p) => p.x);
  const ys = hs.map((p) => p.y);
  const zone = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const vp = page.viewportSize();
  // Ручки и пунктир — чернила, не красный: в счёт не идут.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: vp.height } });
  return page.evaluate(async ([b64, z]) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const k = bmp.width / window.innerWidth;
    const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
    let inside = 0;
    let outside = 0;
    const pad = 3;
    for (let y = 0; y < bmp.height; y++)
      for (let x = 0; x < bmp.width; x++) {
        const i = (y * bmp.width + x) * 4;
        if (!(d[i] > 90 && d[i] < 160 && d[i + 1] < 70 && d[i + 2] < 70)) continue;
        const X = x / k;
        const Y = y / k;
        if (X >= z.x0 - pad && X <= z.x1 + pad && Y >= z.y0 - pad && Y <= z.y1 + pad) inside++;
        else outside++;
      }
    return { inside, outside };
  }, [png.toString('base64'), zone]);
}

const sound = (q) => {
  if (q.length !== 4) return false;
  let sgn = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-12) return false;
    if (sgn === 0) sgn = Math.sign(cr);
    else if (Math.sign(cr) !== sgn) return false;
  }
  return true;
};

// 1. ПЛАВНОСТЬ: 60 движений угла по кругу (зона всё время выпуклая), время на кадр.
{
  const page = await open();
  await shot(page, 'start');
  const h = (await handles(page))[2];
  const nodes = await page.$$eval('[data-callout-artwork] *', (els) => els.length);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  // Работа главного потока за жест (CDP Performance): стиль + раскладка + скрипт + задачи.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const m0 = await metrics();
  const t = await page.evaluate(async ([cx, cy]) => {
    const raf = () => new Promise((res) => requestAnimationFrame(() => res()));
    const out = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const t0 = performance.now();
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 20 * Math.cos(a) - 10, clientY: cy + 20 * Math.sin(a), bubbles: true }));
      await raf();
      await raf();
      out.push(performance.now() - t0);
    }
    out.sort((x, y) => x - y);
    return { mean: out.reduce((s, x) => s + x, 0) / out.length, p50: out[30], p90: out[54], max: out[59] };
  }, [h.x, h.y]);
  const m1 = await metrics();
  await page.mouse.up();
  const per = (k) => (((m1[k] - m0[k]) * 1000) / 60).toFixed(2);
  console.log(`   узлов в слое артворка: ${nodes}; движение угла, мс на кадр (2×rAF): mean ${t.mean.toFixed(1)} p50 ${t.p50.toFixed(1)} p90 ${t.p90.toFixed(1)} max ${t.max.toFixed(1)}`);
  console.log(`   главный поток на одно движение, мс: задачи ${per('TaskDuration')} · скрипт ${per('ScriptDuration')} · стиль ${per('RecalcStyleDuration')} · раскладка ${per('LayoutDuration')}`);
  check('слой артворка — один элемент', nodes === 1, `${nodes}`);
  await page.close();
}

// 2. УГОЛ ВНУТРЬ ЗА ДИАГОНАЛЬ: угол упирается, зона выпуклая, картинка не выходит за зону.
{
  const page = await open();
  const hs = await handles(page);
  const tl = hs[0];
  const br = hs[2];
  const before = await pts(page);
  await page.mouse.move(br.x, br.y);
  await page.mouse.down();
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    // От BR к точке за TL: путь пересекает диагональ TR–BL на середине.
    const k = i / steps;
    await page.mouse.move(br.x + (tl.x - 20 - br.x) * k, br.y + (tl.y - 10 - br.y) * k);
  }
  await page.waitForTimeout(60);
  const mid = await redOutside(page);
  await shot(page, 'drag-inward');
  await page.mouse.up();
  await page.waitForTimeout(60);
  const after = await pts(page);
  const end = await redOutside(page);
  await shot(page, 'drag-inward-released');
  console.log('   точки после жеста:', JSON.stringify(after.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }))));
  check('угол сдвинулся (упёрся, а не застыл на старте)', after[2].x < before[2].x - 0.05, JSON.stringify(after[2]));
  check('угол не перешёл диагональ (TR–BL)', after[2].x + after[2].y > 1.0 + 1e-6, JSON.stringify(after[2]));
  check('зона выпуклая после жеста', sound(after), JSON.stringify(after));
  check('во время жеста картинка внутри зоны', mid.outside < 30 && mid.inside > 500, JSON.stringify(mid));
  check('после жеста картинка внутри зоны', end.outside < 30 && end.inside > 500, JSON.stringify(end));
  await page.close();
}

// 3. СТАРАЯ ВЫВЕРНУТАЯ ЗОНА (записана до этой правки) рисуется по габариту, без лучей.
{
  const concave = [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.4, y: 0.4 }, { x: 0.3, y: 0.7 }];
  const page = await open({ pts: concave });
  const red = await redOutside(page);
  await shot(page, 'legacy-concave');
  const hs = await handles(page);
  check('старая вывернутая зона — ручки на габарите', hs.length === 4 && Math.abs(hs[2].x - hs[1].x) < 1 && Math.abs(hs[2].y - hs[3].y) < 1, JSON.stringify(hs));
  check('старая вывернутая зона — картинка внутри', red.outside < 30 && red.inside > 500, JSON.stringify(red));
  await page.close();
}

// 4. ПЕРЕНОС ЗОНЫ ЗА КРАЙ: зона едет целиком, форма та же (не сплющивается о край кадра).
{
  const page = await open();
  const hs = await handles(page);
  const before = await pts(page);
  const from = { x: (hs[0].x + hs[1].x) / 2, y: hs[0].y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(from.x + 15 * i, from.y - 12 * i);
  await page.mouse.up();
  await page.waitForTimeout(60);
  const after = await pts(page);
  const w0 = before[1].x - before[0].x;
  const w1 = after[1].x - after[0].x;
  const h1 = after[3].y - after[0].y;
  console.log('   после переноса за край:', JSON.stringify(after.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }))));
  check('перенос сдвинул зону', after[0].x > before[0].x + 0.05, JSON.stringify(after[0]));
  check('перенос за край — форма цела', Math.abs(w1 - w0) < 1e-6 && Math.abs(h1 - (before[3].y - before[0].y)) < 1e-6 && sound(after), `w ${w0}→${w1}, h ${h1}`);
  await page.close();
}

// 5. ЗУМ КАДРА: картинка едет с кадром и сидит в зоне (тот же слой, тот же трансформ).
{
  const page = await open({ zoom: true });
  const img = await page.$eval('[data-bench="sheet"] img', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width * 0.6, y: r.y + r.height * 0.6 }; });
  await page.mouse.move(img.x, img.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  const red = await redOutside(page);
  await shot(page, 'zoomed');
  const hs = await handles(page);
  const span = Math.abs(hs[1].x - hs[0].x);
  check('зум: зона увеличена', span > 200, `${span.toFixed(0)}px`);
  check('зум: картинка внутри зоны', red.outside < 30 && red.inside > 2000, JSON.stringify(red));
  await page.close();
}

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail ? 1 : 0);
