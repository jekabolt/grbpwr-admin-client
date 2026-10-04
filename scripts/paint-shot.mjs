#!/usr/bin/env node
// СНИМКИ PAINT THE PARTS — визуальный стенд, не тест (`paint-entry.tsx`): палитра MATERIALS +
// холст PARTS над флэтами Ф0. Снимки: исходное, взведённый материал + ховер, покрашены детали
// двумя тканями и цветом, перо посреди многоугольника, 390 px. Проверяет автосейв (план в полосе,
// палитра карты) и тело прогона `paintRun` (остаток, метки, порядок).
//
//   node scripts/paint-shot.mjs [--out=<dir>]     (нужен `yarn build` — CSS из dist)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
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
    resolve(REPO, '../tmp/plans/paint-parts/shots'),
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
const outfile = resolve(tmpdir(), `paint-shot-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-entry.tsx')],
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
const FLATS = resolve(REPO, '../tmp/plans/paint-parts/f0/flats');
const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  let saved = null;
  const open = async (width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (saved)
      await page.addInitScript((p) => {
        window.__seedPlan = p;
      }, saved);
    page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        errors.push(`[${width}] console.${m.type()}: ${m.text()}`);
    });
    await ctx.route('http://probe.local/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await ctx.route('http://probe.local/flats/**', (route) =>
      route.fulfill({
        path: resolve(FLATS, new URL(route.request().url()).pathname.split('/').pop()),
      }),
    );
    await ctx.route('http://probe.local/assets/**', (route) => {
      const file = resolve(cssDir, new URL(route.request().url()).pathname.split('/').pop());
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
    });
    await page.goto('http://probe.local/');
    await page.addStyleTag({ content: CSS });
    await page.addStyleTag({ content: 'body{background:var(--color-pageBg,#f2f2f2)}' });
    await page.addScriptTag({ content: bundle });
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-paint-status="ready"]').length === 3,
        null,
        { timeout: 15_000 },
      )
      .catch(async (e) => {
        console.log(errors.join('\n'));
        console.log((await page.content()).slice(0, 1500));
        throw e;
      });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const shoot = async (page, name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: true });
    shots.push(path);
  };
  /** A point on a side at fractions of its picture. */
  const at = async (page, view, fx, fy) => {
    const box = await page.locator(`[data-paint-side="${view}"] canvas`).first().boundingBox();
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  };
  const click = async (page, view, fx, fy) => {
    const p = await at(page, view, fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
  };
  const arm = async (page, which) => {
    await page.click(`[data-paint-material="${which}"]`);
  };

  {
    const { ctx, page } = await open(1440, 1000);
    await page.mouse.move(5, 5);
    await shoot(page, 'f1-default-1440.png');

    // Armed MAIN FABRIC (default) + hover over the left front panel.
    const p = await at(page, 'front', 0.3, 0.5);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    await shoot(page, 'f1-armed-hover-1440.png');

    // Paint: both front panels + back body MAIN, pocket POCKET (denim), collar + cuffs CONTRAST.
    await click(page, 'front', 0.3, 0.5);
    await click(page, 'front', 0.65, 0.6);
    await click(page, 'back', 0.5, 0.5);
    await arm(page, 3);
    await click(page, 'front', 0.68, 0.37);
    await arm(page, 2);
    await click(page, 'front', 0.4, 0.14);
    await click(page, 'front', 0.6, 0.14);
    await click(page, 'front', 0.08, 0.75);
    await click(page, 'front', 0.9, 0.77);
    await click(page, 'back', 0.5, 0.11);
    // + colour: open the picker, pick in the saturation square, close; then paint the sleeves.
    await page.click('[data-paint-add-colour]');
    await page.waitForSelector('[data-colour-square]');
    const sq = await page.locator('[data-colour-square]').boundingBox();
    await page.mouse.click(sq.x + sq.width * 0.15, sq.y + sq.height * 0.85);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await click(page, 'front', 0.1, 0.45);
    await click(page, 'front', 0.88, 0.45);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await shoot(page, 'f1-painted-1440.png');

    // Autosave lands: plan rev 1, maps for front + back, a colour row for the free colour.
    await page
      .waitForFunction(() => window.__band.colourPlan.rev >= 1, null, { timeout: 8000 })
      .catch(() => errors.push('[1440] ASSERT: autosave did not land'));
    await page.waitForTimeout(2000);
    const plan = await page.evaluate(() => window.__band.colourPlan);
    console.log(
      `plan rev ${plan.rev}: ${plan.maps.map((m) => `${m.view} [${m.palette.map((s) => `${s.hex}:${s.px}`).join(' ')}]`).join(' · ')}`,
    );
    console.log(`cloths ${JSON.stringify(plan.cloths)}`);
    if (plan.maps.length !== 2) errors.push(`[1440] ASSERT: ${plan.maps.length} maps saved`);
    if (plan.cloths.length !== 1 || !plan.cloths[0].colourHex)
      errors.push('[1440] ASSERT: free colour row missing');

    // The run body.
    const run = await page.evaluate(() => {
      // re-read so the session sees the saved plan
      return window.__run();
    });
    console.log(
      `run ${run.kind}: ${(run.fabrics || []).map((f) => `${f.name || f.colourHex}{parts:${f.parts}, map:${f.mapHex}}`).join(' | ')} maps ${run.colourMaps?.length}`,
    );
    if (run.kind !== 'maps' || run.fabrics.length !== 4)
      errors.push(`[1440] ASSERT: run ${JSON.stringify(run).slice(0, 300)}`);

    // Undo → the last sleeve back to paper; redo.
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+Shift+z');

    // Pen mid-polygon over the back shoulder (the open outline).
    await page.click('[data-paint-tool="pen"]');
    await arm(page, 2);
    await page.click('[data-paint-tool="pen"]');
    for (const [fx, fy] of [
      [0.17, 0.27],
      [0.24, 0.24],
      [0.24, 0.33],
    ])
      await click(page, 'back', fx, fy);
    const q = await at(page, 'back', 0.17, 0.35);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(200);
    await shoot(page, 'f1-pen-1440.png');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.mouse.move(5, 5);
    await shoot(page, 'f1-pen-closed-1440.png');
    await page.waitForFunction(
      () => !document.querySelector('[data-paint-tools]')?.textContent?.includes('saving'),
      null,
      { timeout: 8000 },
    );
    saved = await page.evaluate(() => window.__band.colourPlan);
    console.log(`saved rev ${saved.rev}`);
    await ctx.close();
  }
  {
    // A fresh page over the saved plan: the painting comes back (exact labels from the PNG).
    const { ctx, page } = await open(390, 844);
    await page.waitForTimeout(500);
    await shoot(page, 'f1-reload-390.png');
    const again = await page.evaluate(() => window.__run());
    console.log(`reload run ${again.kind}: ${(again.fabrics || []).length} uses`);
    if (again.kind !== 'maps') errors.push('[390] ASSERT: reload lost the maps');
    await ctx.close();
  }
} finally {
  await browser.close();
}

for (const s of shots) console.log(s);
if (errors.length) {
  console.log(`\n${errors.length} console/page problems:`);
  for (const e of errors) console.log('  ' + e);
} else console.log('\nno console errors');
