#!/usr/bin/env node
// СНИМКИ ШАГА MATERIALS — визуальный стенд, не тест (`materials-entry.tsx`). Round 4 (a cell is a
// selector only): asserts an empty-cell click selects without a dialog; shots: hover over an
// unselected empty cell, MAIN FABRIC selected, FRONT BUTTON selected (words «horn, black», one
// library picture), 390 px with the default selection.
// Сеть — прокси: `SetDesignAssetBinding` правит `window.__band`, остальные вызовы отвечают `{}`;
// `fetch` заглушён. Пишет консольные ошибки страницы.
//
//   node scripts/materials-shot.mjs [--out=<dir>]     (нужен `yarn build` — CSS из dist)
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
        window.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
        const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
        const answer = (name, body) => {
          if (name === 'GetDesignBand') return clone(window.__band);
          if (name === 'ListObjectsPaged') return clone({ list: window.__library || [] });
          if (name === 'SetDesignAssetBinding') {
            const band = window.__band;
            const rest = (band.assetBindings || []).filter(
              (x) => !(x.colorwayId === body.colorwayId && x.bomItemId === body.bomItemId),
            );
            if (body.assetId > 0)
              rest.push({ colorwayId: body.colorwayId, bomItemId: body.bomItemId, assetId: body.assetId });
            band.assetBindings = rest;
          }
          return {};
        };
        const call = (name) => (body) => {
          window.__calls.push({ name, body: clone(body) });
          return Promise.resolve(answer(name, body));
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

const outfile = resolve(tmpdir(), `materials-shot-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'materials-entry.tsx')],
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
const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  const open = async (width, height, hash = '') => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => {
      errors.push(`[${width}] pageerror: ${e.message}`);
      if (process.env.DEBUG_SHOT) console.log('pageerror', e.message, e.stack?.slice(0, 600));
    });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        errors.push(`[${width}] console.${m.type()}: ${m.text()}`);
    });
    await ctx.route('http://probe.local/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    // Шрифты из собранной CSS (`/assets/*.ttf`) — отдаём из dist, иначе снимок в запасном шрифте.
    await ctx.route('http://probe.local/assets/**', (route) => {
      const file = resolve(cssDir, new URL(route.request().url()).pathname.split('/').pop());
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
    });
    await page.goto(`http://probe.local/${hash}`);
    await page.addStyleTag({ content: CSS });
    await page.addStyleTag({ content: 'body{background:var(--bgColor,#fff)}' });
    await page.addScriptTag({ content: bundle });
    await page
      .waitForSelector('[data-probe="materials"] [data-fh-slot]', { timeout: 10_000 })
      .catch(async (e) => {
        console.log(errors.join('\n'));
        console.log((await page.content()).slice(0, 2000));
        throw e;
      });
    await page.waitForTimeout(600);
    return { ctx, page };
  };
  const shoot = async (page, name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: true });
    shots.push(path);
  };

  {
    const { ctx, page } = await open(1440, 1000);
    const settle = async () => {
      await page.mouse.move(5, 5);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(400);
    };

    // Round 4: an empty cell is a selector — a click selects it and opens NO dialog.
    await page.click('[data-fh-cell="4"]');
    await page.waitForTimeout(500);
    if ((await page.locator('[role="dialog"]').count()) > 0) {
      errors.push('[1440] ASSERT: clicking an empty cell opened a dialog');
      await page.keyboard.press('Escape');
    }
    if ((await page.locator('[data-fh-for="4"]').count()) !== 1) {
      errors.push('[1440] ASSERT: clicking an empty cell did not select it');
    } else console.log('assert ok: empty cell click selects, no dialog');
    // Keyboard: Enter on a focused cell selects it.
    await page.focus('[data-fh-cell="6"]');
    await page.keyboard.press('Enter');
    if ((await page.locator('[data-fh-for="6"]').count()) !== 1)
      errors.push('[1440] ASSERT: Enter on a cell did not select it');

    // `all empty slots · N` asks first: one click turns it into `yes · no`; `no` reverts.
    await page.click('[data-fh-all-empty]');
    if ((await page.locator('[data-fh-all-confirm]').count()) !== 1)
      errors.push('[1440] ASSERT: all empty slots fired without asking');
    if ((await page.locator('[data-fh-pending]').count()) > 0)
      errors.push('[1440] ASSERT: all empty slots started runs on the first click');
    await page.click('[data-fh-all-no]');
    if ((await page.locator('[data-fh-all-empty]').count()) !== 1)
      errors.push('[1440] ASSERT: `no` did not revert the door');
    else console.log('assert ok: all empty slots asks first, no reverts');

    // Hover over an unselected empty cell (BRAND LABEL), with ZIP... SNAP selected.
    await settle();
    await page.hover('[data-fh-cell="5"]');
    await page.waitForTimeout(300);
    await shoot(page, 'r4-hover-1440.png');

    // Selected fabric: MAIN FABRIC (bound) — the panel is its spec.
    await page.click('[data-fh-cell="1"] [data-picture-tile]');
    await page.waitForSelector('[data-fh-for="1"]');
    await settle();
    await shoot(page, 'r4-fabric-selected-1440.png');

    // `use own picture` opens the library dialog for the selected slot.
    await page.click('[data-fh-cell="2"]');
    await page.waitForSelector('[data-fh-for="2"]');
    await page.click('[data-fh-own-picture]');
    await page
      .waitForSelector('[role="dialog"]', { timeout: 5000 })
      .then(() => console.log('assert ok: use own picture opens the library'))
      .catch(() => errors.push('[1440] ASSERT: use own picture did not open the library'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Selected hardware: FRONT BUTTON, words «horn, black», one picture from the library.
    await page.click('[data-fh-cell="3"] [data-picture-tile]');
    await page.waitForSelector('[data-fh-for="3"]');
    await page.fill('[data-fh-words]', 'horn, black');
    await page.click('[data-fh-look-door] button');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] img').first().click();
    await page.getByRole('button', { name: /add all/i }).click();
    await page.waitForSelector('[data-fh-look="1"]', { timeout: 5000 }).catch(() => {
      errors.push('[1440] the picture did not land in the hardware spec');
    });
    await settle();
    await shoot(page, 'r4-hardware-selected-1440.png');
    await ctx.close();
  }
  {
    // Two live runs on this colourway: making cells carry the cancel corner; `cancel all` shows.
    const { ctx, page } = await open(1440, 1000, '#making');
    await page.waitForSelector('[data-fh-pending] [data-run-cancel]');
    if ((await page.locator('[data-fh-cancel-all]').count()) !== 1)
      errors.push('[1440] ASSERT: no `cancel all` with two live runs');
    await page.click('[data-fh-cell="2"]');
    await page.waitForSelector('[data-fh-for="2"]');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await shoot(page, 'r4-making-cancel-1440.png');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(390, 844);
    await shoot(page, 'r4-390.png');
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
