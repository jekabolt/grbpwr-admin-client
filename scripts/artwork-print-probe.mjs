#!/usr/bin/env node
// АРТВОРК НА БУМАГЕ (T27, R35): настоящий TechPackDocument, лист «technical sketch» с зоной
// artwork, — на экране и в PDF (page.pdf: печатная раскладка меняет ширину коробки ПОСЛЕ замера,
// и ResizeObserver на это не стреляет). Картинка (красная) обязана лечь ровно в зону, контур
// которой нарисован синим: габарит красного = габарит синего, на экране и на бумаге.
//
//   node scripts/artwork-print-probe.mjs [--shots=<dir>] [--tag=<prefix>] [--base=<rev>] [--mutate=px]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] ?? '';
const SHOTS = arg('shots');
const TAG = arg('tag') || '27';
const BASE = arg('base');
// --mutate=px: длины картинки снова в пикселях замера — на бумаге она не растёт с кадром.
const MUTATE = arg('mutate');

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch {}
  const root = `${homedir()}/.npm/_npx`;
  if (!existsSync(root)) return null;
  const found = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
  return found ? `${found}/index.js` : null;
}
const pw = resolvePlaywright();
if (!pw) { console.log('DID NOT RUN: playwright not found'); process.exit(2); }
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `artwork-print-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tech-pack-labels-probe-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
  logLevel: 'silent', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  plugins: [{
    name: 'vite-queries',
    setup(b) {
      b.onResolve({ filter: /\?(raw|url)$/ }, (args) => ({ path: args.path, namespace: 'vite-q' }));
      b.onLoad({ filter: /.*/, namespace: 'vite-q' }, () => ({ contents: 'export default "";', loader: 'js' }));
    },
  }, ...(BASE ? [{
    name: 'base',
    setup(b) {
      b.onLoad({ filter: /src\/ui\/components\/annotation\/[^/]+\.tsx?$/ }, (a) => ({
        contents: execFileSync('git', ['show', `${BASE}:${a.path.slice(REPO.length + 1)}`], { cwd: REPO, encoding: 'utf8' }),
        loader: a.path.endsWith('x') ? 'tsx' : 'ts',
      }));
    },
  }] : []), ...(MUTATE === 'px' ? [{
    name: 'mutate',
    setup(b) {
      b.onLoad({ filter: /annotation\/insets\.tsx$/ }, (a) => {
        const src = readFileSync(a.path, 'utf8');
        const from = ['`${(px / box.w) * 100}cqw`', '`${(px / box.h) * 100}cqh`'];
        if (!from.every((f) => src.includes(f))) throw new Error('mutation px: anchor not found');
        return { contents: from.reduce((t, f) => t.split(f).join('`${px}px`'), src), loader: 'tsx' };
      });
    },
  }] : [])],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: Object.fromEntries(['components', 'lib', 'api', 'utils', 'ui', 'constants', 'store', 'hooks', 'context', 'types'].map((k) => [k, resolve(REPO, 'src', k)])),
});
const code = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => readFileSync(f, 'utf8')).join('\n')
  : '';

const SKETCH = "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='#fff'/><path d='M100 100 L700 500' stroke='#ccc'/></svg>";
const ART = "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'><rect width='200' height='100' fill='#c00000'/><rect x='0' y='0' width='40' height='40' fill='#00a000'/></svg>";
const D = (v) => ({ value: String(v) });
const ZONE = [[0.3, 0.3], [0.7, 0.36], [0.76, 0.76], [0.24, 0.7]];
const CARD = {
  id: 1, lockVersion: 1, colorways: [],
  resolvedTechnicalMedia: [{ media: { id: 7, media: {
    fullSize: { mediaUrl: 'https://cdn.example/sketch.svg', width: 800, height: 600 },
    thumbnail: { mediaUrl: 'https://cdn.example/sketch.svg', width: 800, height: 600 },
  } } }],
  techCard: {
    name: 'probe shirt', styleNumber: 'GR-0027', sizeIds: [],
    technicalMedia: [{ mediaId: 7, caption: 'front' }],
    callouts: [{
      number: 1, mediaId: 7, posX: D(0.5), posY: D(0.55), description: 'print',
      kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON', color: 'TECH_CARD_ANNOTATION_COLOR_BLUE', dashed: false, filled: false,
      points: ZONE.map(([x, y]) => ({ x: D(x), y: D(y) })),
      spec: JSON.stringify({ t: 'artwork', sub: 'print', url: 'https://cdn.example/art.svg' }),
    }],
  },
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.route('http://probe.local/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.route('https://cdn.example/sketch.svg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SKETCH }));
await page.route('https://cdn.example/art.svg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: ART }));
await page.route('http://stub.invalid/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto('http://probe.local/');
if (CSS) await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: code });
await page.evaluate((c) => window.__tp.mount(c), CARD);
await page.waitForSelector('[data-callout-artwork]', { timeout: 15000 });
await page.waitForTimeout(400);

// Печатается только лист эскиза: остальные листы прячутся печатным правилом (ширина та же).
await page.evaluate(() => {
  const fig = document.querySelector('[data-callout-artwork]').closest('figure');
  fig.setAttribute('data-probe-fig', '');
  let el = fig;
  while (el && el !== document.body) {
    for (const sib of el.parentElement?.children ?? []) if (sib !== el) sib.setAttribute('data-probe-drop', '');
    el = el.parentElement;
  }
  const st = document.createElement('style');
  st.textContent = '@media print { [data-probe-drop] { display: none !important; } }';
  document.head.appendChild(st);
});

// Габариты картинки (красная, зелёный уголок у TL) и синего контура зоны по растру.
async function boxes(png) {
  const p2 = await browser.newPage();
  const r = await p2.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
    const mk = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
    const red = mk();
    const blue = mk();
    const add = (o, x, y) => { o.n++; o.x0 = Math.min(o.x0, x); o.y0 = Math.min(o.y0, y); o.x1 = Math.max(o.x1, x); o.y1 = Math.max(o.y1, y); };
    for (let y = 0; y < bmp.height; y++)
      for (let x = 0; x < bmp.width; x++) {
        const i = (y * bmp.width + x) * 4;
        const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
        if ((R > 150 && G < 80 && B < 80) || (G > 120 && R < 80 && B < 80)) add(red, x, y);
        else if (B > 150 && R < 120 && G < 160 && B - R > 60) add(blue, x, y);
      }
    return { red, blue, w: bmp.width, h: bmp.height };
  }, png.toString('base64'));
  await p2.close();
  return r;
}
const report = (name, b, tol) => {
  const dx0 = Math.abs(b.red.x0 - b.blue.x0);
  const dx1 = Math.abs(b.red.x1 - b.blue.x1);
  const dy0 = Math.abs(b.red.y0 - b.blue.y0);
  const dy1 = Math.abs(b.red.y1 - b.blue.y1);
  const worst = Math.max(dx0, dx1, dy0, dy1);
  const span = b.blue.x1 - b.blue.x0;
  check(`${name}: картинка лежит в зоне (габариты красного и синего расходятся ≤ ${tol}px из ${span}px)`, b.red.n > 100 && b.blue.n > 50 && worst <= tol,
    `red ${JSON.stringify([b.red.x0, b.red.y0, b.red.x1, b.red.y1])} blue ${JSON.stringify([b.blue.x0, b.blue.y0, b.blue.x1, b.blue.y1])} Δ=${worst}`);
};

const fig = await page.$('[data-probe-fig]');
const screenPng = await fig.screenshot();
if (SHOTS) writeFileSync(`${SHOTS}/${TAG}-print-screen.png`, screenPng);
report('экран', await boxes(screenPng), 4);

const pdfPath = resolve(tmpdir(), `artwork-print-${process.pid}.pdf`);
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
const pngPath = resolve(tmpdir(), `artwork-print-${process.pid}.png`);
execFileSync('sips', ['-s', 'format', 'png', '-s', 'dpiWidth', '144', '-s', 'dpiHeight', '144', pdfPath, '--out', pngPath], { stdio: 'ignore' });
const printPng = readFileSync(pngPath);
if (SHOTS) writeFileSync(`${SHOTS}/${TAG}-print-pdf.png`, printPng);
const pb = await boxes(printPng);
console.log(`   PDF растр ${pb.w}×${pb.h}`);
report('печать (page.pdf)', pb, Math.max(4, Math.round(pb.w / 300)));
rmSync(pdfPath, { force: true });
rmSync(pngPath, { force: true });

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail ? 1 : 0);
