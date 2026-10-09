#!/usr/bin/env node
// СНИМКИ R9 Ф1 · HARDWARE AS PARTS — визуальный стенд, не тест (`parts-hardware-entry.tsx`):
// покрасить корпус тканью, взвести плитку FRONT BUTTON, кликнуть обе пуговицы пиджака (карточка 51);
// проверяет счёт на плитке (`FRONT BUTTON · 2`), имя слота в подписи стороны при ховере, что жест
// ткани поверх пуговиц их не трогает, и что клик по открытому контуру не красит ничего.
// Снимки r9-f1-parts.png (+ r9-f1-parts-zoom.png).
//
//   node scripts/parts-hardware-shot.mjs [--out=<dir>]     (нужен `yarn build` — CSS из dist)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = resolve(
  (process.argv.find((a) => a.startsWith('--out=')) ?? '').slice('--out='.length) ||
    resolve(REPO, '../tmp/plans/fabrics-hardware/shots'),
);

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* не в зависимостях — ищем в кэше npx */
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
      .filter(Boolean);
    for (const dir of found) if (existsSync(`${dir}/.local-browsers`)) return `${dir}/index.js`;
    return found[0] ? `${found[0]}/index.js` : null;
  } catch {
    return null;
  }
}

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright не найден — снимки пропущены');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — снимки пропущены');
  process.exit(0);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        window.__calls = [];
        window.__uploads = new Map();
        let nextMedia = 9000;
        const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
        const answer = (name, body) => {
          if (name === 'GetDesignBand') return clone(window.__band);
          if (name === 'UploadContentImage') {
            const id = ++nextMedia;
            window.__uploads.set(id, body.rawB64Image);
            return { media: { id, media: { fullSize: { mediaUrl: body.rawB64Image } } } };
          }
          if (name === 'SetDesignColourPlan') {
            const band = window.__band;
            const have = band.colourPlan.rev;
            if (body.expectedRev !== have) {
              const e = new Error('design: colour_plan_rev_mismatch'); e.status = 409; throw e;
            }
            band.colourPlan = {
              techCardId: 1, rev: have + 1,
              maps: body.maps.map((m) => ({ ...m, media: { id: m.mediaId, media: { fullSize: { mediaUrl: window.__uploads.get(m.mediaId) } } } })),
              cloths: body.cloths,
            };
            return { plan: clone(band.colourPlan) };
          }
          if (name === 'SetDesignAssetPlacement') {
            const band = window.__band;
            band.assetPlacements = band.assetPlacements || [];
            let id = body.placementId;
            const row = { id, assetId: body.assetId, pictureId: body.pictureId, annotation: body.annotation, note: body.note };
            if (id > 0) band.assetPlacements = band.assetPlacements.map((p) => (p.id === id ? row : p));
            else { row.id = 100 + band.assetPlacements.length + Math.floor(Math.random() * 1000); band.assetPlacements.push(row); }
            return { placement: clone(row) };
          }
          if (name === 'DeleteDesignAssetPlacement') {
            const band = window.__band;
            band.assetPlacements = (band.assetPlacements || []).filter((p) => p.id !== body.placementId);
            return {};
          }
          if (name === 'SuggestDesignPartsCard') return new Promise(() => {});
          if (name === 'SuggestDesignParts') {
            if (!window.__fakeParts) return new Promise(() => {});
            const suggestion = window.__fakeParts[body.view];
            if (!suggestion) throw new Error('no fake parts for ' + body.view);
            window.__band.partsSuggestions = [...(window.__band.partsSuggestions || []), suggestion];
            return { suggestion: clone(suggestion), cached: false };
          }
          return {};
        };
        const call = (name) => (body) => {
          window.__calls.push({ name, body: name === 'UploadContentImage' ? { size: body.rawB64Image.length } : clone(body) });
          try { return Promise.resolve(answer(name, body)); } catch (e) { return Promise.reject(e); }
        };
        const nope = () => Promise.resolve({});
        export const adminService = new Proxy({}, { get: (_, name) => call(String(name)) });
        export const requestHandler = (req) => call('requestHandler')(req);
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};
const outfile = resolve(tmpdir(), `parts-hardware-shot-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'parts-hardware-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: [stubNetwork],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
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

const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', '*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/*.css не найден — соберите `yarn build`; снимки пропущены');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
const FLATS = resolve(REPO, '../tmp/plans/fabrics-hardware/r9-f0/flats');
const HW = resolve(REPO, '../tmp/plans/fabrics-hardware/r9-f0/inputs');
const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.${m.type()}: ${m.text()}`);
  });
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await ctx.route('http://probe.local/flats/**', (route) =>
    route.fulfill({
      path: resolve(FLATS, new URL(route.request().url()).pathname.split('/').pop()),
    }),
  );
  await ctx.route('http://probe.local/hw/**', (route) =>
    route.fulfill({ path: resolve(HW, new URL(route.request().url()).pathname.split('/').pop()) }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addStyleTag({ content: 'body{background:var(--color-pageBg,#f2f2f2)}' });
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-paint-status="ready"]').length === 2,
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  const at = async (view, fx, fy) => {
    const box = await page.locator(`[data-paint-side="${view}"] canvas`).first().boundingBox();
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  };
  const click = async (view, fx, fy) => {
    const p = await at(view, fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
  };
  const count = (label) => page.evaluate((l) => window.__paint.hardwareCount(l), label);
  // The cloth first (MAIN FABRIC is armed by default): both front panels, the back body.
  for (const [v, fx, fy] of [
    ['front', 0.36, 0.6],
    ['front', 0.64, 0.6],
    ['back', 0.5, 0.5],
  ])
    await click(v, fx, fy);
  // Arm FRONT BUTTON: the hardware tile after the seam.
  await page.click('[data-paint-material="31"][data-paint-hardware]');
  const armed = await page.getAttribute(
    '[data-paint-material="31"][data-paint-hardware]',
    'aria-pressed',
  );
  if (armed !== 'true') errors.push(`ASSERT: FRONT BUTTON tile not armed (${armed})`);
  // The two closure buttons of the owner's jacket (Ф0: 387,358 and 387,469 on the 770 px front).
  await click('front', 387 / 770, 358 / 770);
  await click('front', 387 / 770, 469 / 770);
  const fb = await page.evaluate(
    () => window.__paint.materials.find((m) => m.bomItemId === 31)?.label,
  );
  const n = await count(fb);
  const cap = (await page.textContent('[data-paint-material="31"][data-paint-hardware]')) ?? '';
  if (n !== 2 || !/FRONT BUTTON · 2/i.test(cap))
    errors.push(`ASSERT: FRONT BUTTON count ${n}, cap «${cap}»`);
  else console.log(`assert ok: two clicks → ${n} instances, cap «${cap.trim()}»`);
  // Fix 6 · every hardware caption reads whole: wrapped, never clipped.
  const clipped = await page.$$eval('[data-paint-hardware-cap]', (els) =>
    els
      .filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
      .map((e) => e.textContent),
  );
  if (clipped.length) errors.push(`ASSERT: clipped hardware captions ${JSON.stringify(clipped)}`);
  else console.log('assert ok: hardware captions whole (wrapped, not clipped)');
  // Precedence: a cloth gesture over the whole front leaves the buttons.
  const kept = await page.evaluate((label) => {
    const p = window.__paint;
    const main = p.materials.find((m) => m.bomItemId === 1).label;
    const was = p.armed;
    p.arm(main);
    const v = p.views.get('front');
    p.apply(
      'front',
      Int32Array.from({ length: v.labels.length }, (_, i) => i),
    );
    const after = p.hardwareCount(label);
    p.undo();
    p.arm(was);
    return after;
  }, fb);
  if (kept !== 2) errors.push(`ASSERT: a cloth gesture painted over the buttons (${kept} left)`);
  else console.log('assert ok: a cloth gesture over the whole front keeps both buttons');
  // An open outline with CUFF BUTTON armed: the body is no button — nothing painted.
  await page.click('[data-paint-material="32"][data-paint-hardware]');
  const cuff = await page.evaluate(
    () => window.__paint.materials.find((m) => m.bomItemId === 32)?.label,
  );
  await click('front', 0.36, 0.6);
  if ((await count(cuff)) !== 0) errors.push('ASSERT: an open outline was painted as hardware');
  else console.log('assert ok: a click on the body with a hardware tile paints nothing (open)');
  // Back to FRONT BUTTON armed; hover a button: its slot name in the side's caption.
  await page.click('[data-paint-material="31"][data-paint-hardware]');
  const over = await at('front', 387 / 770, 358 / 770);
  await page.mouse.move(over.x - 30, over.y - 30);
  await page.mouse.move(over.x, over.y, { steps: 4 });
  await page.waitForTimeout(250);
  const caption = (await page.textContent('[data-paint-caption="front"]')) ?? '';
  if (!/FRONT BUTTON/i.test(caption)) errors.push(`ASSERT: hover caption «${caption}»`);
  else console.log(`assert ok: hover names the slot («${caption.trim()}»)`);
  // The shot keeps the pointer on the upper button: its slot named under the side.
  const full = resolve(OUT, 'r9-f1-parts.png');
  await page.screenshot({ path: full, fullPage: true });
  shots.push(full);
  // A close-up of the palette tiles (the captions read whole).
  const pal = await page.$('[data-paint-palette]');
  if (pal) {
    const tiles = resolve(OUT, 'r9-f1-tiles.png');
    await pal.screenshot({ path: tiles });
    shots.push(tiles);
  }
  // A close-up of the two buttons on the canvas.
  const a = await at('front', 330 / 770, 300 / 770);
  const b = await at('front', 450 / 770, 520 / 770);
  const zoom = resolve(OUT, 'r9-f1-parts-zoom.png');
  await page.screenshot({
    path: zoom,
    clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
  });
  shots.push(zoom);
  await ctx.close();
} finally {
  await browser.close();
}

for (const s of shots) console.log(s);
if (errors.length) {
  console.log(`\n${errors.length} console/page problems:`);
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
} else console.log('\nno console errors');
