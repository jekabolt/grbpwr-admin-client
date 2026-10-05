#!/usr/bin/env node
// СНИМКИ R7 · ARTWORK ON THE PARTS — визуальный стенд, не тест (`parts-artwork-entry.tsx`):
// взвести плитку артворка, протянуть рамку на FRONT, увести угол (перспектива), повернуть ручкой;
// проверяет, что ушли SetDesignAssetPlacement с POLYGON из 4 точек. Снимок r7-parts-placed-1440.png.
//
//   node scripts/parts-artwork-shot.mjs [--out=<dir>]     (нужен `yarn build` — CSS из dist)
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
const outfile = resolve(tmpdir(), `parts-artwork-shot-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'parts-artwork-entry.tsx')],
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
  const open = async (width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${width}] console.${m.type()}: ${m.text()}`);
    });
    await ctx.route('http://probe.local/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await ctx.route('http://probe.local/flats/**', (route) =>
      route.fulfill({
        path: resolve(FLATS, new URL(route.request().url()).pathname.split('/').pop()),
      }),
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
    return { ctx, page };
  };
  const shoot = async (page, name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: true });
    shots.push(path);
  };
  const at = async (page, view, fx, fy) => {
    const box = await page.locator(`[data-paint-side="${view}"] canvas`).first().boundingBox();
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  };
  const dragTo = async (page, a, b) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1)
      await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const { ctx, page } = await open(1440, 1100);
  // The cloth first (MAIN FABRIC is armed by default): both front panels + the back body.
  for (const [v, fx, fy] of [
    ['front', 0.3, 0.5],
    ['front', 0.65, 0.6],
    ['back', 0.5, 0.5],
  ]) {
    const p = await at(page, v, fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
  }
  // Arm the chest embroidery: the tile frames, the `artwork` tool comes on.
  await page.click('[data-pack-artwork="301"]');
  const tile = await page.getAttribute('[data-pack-artwork="301"]', 'aria-pressed');
  if (tile !== 'true') errors.push(`ASSERT: artwork tile not armed (${tile})`);
  // Drag a box on the front chest.
  await dragTo(page, await at(page, 'front', 0.56, 0.24), await at(page, 'front', 0.74, 0.36));
  await page
    .waitForFunction(() => window.__calls.some((c) => c.name === 'SetDesignAssetPlacement'), null, {
      timeout: 5000,
    })
    .catch(() => errors.push('ASSERT: no SetDesignAssetPlacement after the drag'));
  const first = await page.evaluate(
    () => window.__calls.find((c) => c.name === 'SetDesignAssetPlacement')?.body,
  );
  console.log(`placed: ${JSON.stringify(first)}`);
  if (
    !first ||
    first.annotation?.points?.length !== 4 ||
    first.annotation?.kind !== 'TECH_CARD_ANNOTATION_KIND_POLYGON'
  )
    errors.push('ASSERT: the new placement is not a 4-point POLYGON');
  await page
    .waitForSelector('[data-artwork-selected^="p"]', { timeout: 5000 })
    .catch(() => errors.push('ASSERT: the new placement is not selected after landing'));
  // Free perspective: pull the bottom-right corner down-right.
  const br = await at(page, 'front', 0.74, 0.36);
  await dragTo(page, br, { x: br.x + 14, y: br.y + 22 });
  // Turn it a little with the rotation handle (22px above the top edge middle).
  const tl = await at(page, 'front', 0.56, 0.24);
  const tr = await at(page, 'front', 0.74, 0.24);
  const rot = { x: (tl.x + tr.x) / 2, y: tl.y - 22 };
  await dragTo(page, rot, { x: rot.x + 30, y: rot.y + 4 });
  await page.waitForTimeout(400);
  const n = await page.evaluate(
    () => window.__calls.filter((c) => c.name === 'SetDesignAssetPlacement').length,
  );
  console.log(`SetDesignAssetPlacement calls: ${n}`);
  if (n < 3) errors.push(`ASSERT: expected 3 placement writes (new, corner, rotate), got ${n}`);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await shoot(page, 'r7-parts-placed-1440.png');
  // C-m5: a box at the top edge of the flat — its rotation handle stands BELOW the box, inside the
  // flat, and turns it.
  {
    const before = await page.evaluate(
      () => window.__calls.filter((c) => c.name === 'SetDesignAssetPlacement').length,
    );
    await dragTo(page, await at(page, 'front', 0.36, 0.002), await at(page, 'front', 0.5, 0.08));
    await page.waitForFunction(
      (n) => window.__calls.filter((c) => c.name === 'SetDesignAssetPlacement').length > n,
      before,
      { timeout: 5000 },
    );
    await page.waitForTimeout(500);
    const geo = await page.evaluate(() => {
      const g = document.querySelector('[data-paint-side="front"] [data-artwork-handles]');
      const c = g?.querySelector('circle');
      const svg = g?.ownerSVGElement;
      if (!c || !svg) return null;
      const box = svg.getBoundingClientRect();
      const rects = [...g.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y')) + 4);
      return {
        x: box.x + Number(c.getAttribute('cx')),
        y: box.y + Number(c.getAttribute('cy')),
        cy: Number(c.getAttribute('cy')),
        h: box.height,
        bottom: Math.max(...rects),
      };
    });
    if (!geo || geo.cy <= geo.bottom || geo.cy > geo.h)
      errors.push(`ASSERT C-m5: top-edge rotation handle ${JSON.stringify(geo)}`);
    else {
      const n0 = await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'SetDesignAssetPlacement').length,
      );
      await dragTo(page, { x: geo.x, y: geo.y }, { x: geo.x + 30, y: geo.y - 4 });
      await page.waitForTimeout(400);
      const n1 = await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'SetDesignAssetPlacement').length,
      );
      if (n1 <= n0) errors.push('ASSERT C-m5: the handle below the box did not turn it');
      else
        console.log(
          `assert ok C-m5: top-edge box → handle below (${geo.cy} > ${geo.bottom}), turns it`,
        );
    }
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await shoot(page, 'r8-parts-top-handle-1440.png');
  }
  // T66 · under a PAINT tool a placed box is still selectable and removable: CLICK tool on, a click
  // on the back print (#41) selects it, its ✕ deletes the placement; another box goes by ⌫.
  {
    await page.click('[data-paint-tool="click"]');
    const del0 = await page.evaluate(
      () => window.__calls.filter((c) => c.name === 'DeleteDesignAssetPlacement').length,
    );
    const p41 = await at(page, 'back', 0.5, 0.38);
    await page.mouse.click(p41.x, p41.y);
    await page
      .waitForSelector('[data-artwork-selected="p41"]', { timeout: 3000 })
      .catch(() => errors.push('ASSERT T66: a click under the CLICK tool does not select #41'));
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await shoot(page, 't66-parts-selected-click-tool-1440.png');
    const x = page.locator('[data-artwork-remove="41"]');
    if ((await x.count()) !== 1) errors.push('ASSERT T66: no ✕ on the selected box #41');
    else await x.click();
    await page.waitForTimeout(300);
    const del = await page.evaluate(() =>
      window.__calls.filter((c) => c.name === 'DeleteDesignAssetPlacement').map((c) => c.body),
    );
    if (del.length !== del0 + 1 || del[del.length - 1]?.placementId !== 41)
      errors.push(`ASSERT T66: ✕ did not delete #41 (${JSON.stringify(del)})`);
    else console.log('assert ok T66: CLICK tool → click selects #41, ✕ deletes it');
    // ⌫ on another box, still under the CLICK tool.
    const ids = await page.evaluate(() =>
      window.__band.assetPlacements.filter((p) => p.pictureId === 1).map((p) => p.id),
    );
    const before = await page.evaluate(() => window.__band.assetPlacements.length);
    const chest = await at(page, 'front', 0.65, 0.3);
    await page.mouse.click(chest.x, chest.y);
    const sel = await page
      .waitForSelector('[data-artwork-selected^="p"]', { timeout: 3000 })
      .then((h) => h.getAttribute('data-artwork-selected'))
      .catch(() => '');
    if (!sel || !ids.includes(Number(sel.slice(1))))
      errors.push(`ASSERT T66: chest box not selected under CLICK (${sel}; ${ids})`);
    else {
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => window.__band.assetPlacements.length);
      if (after !== before - 1) errors.push(`ASSERT T66: ⌫ did not remove ${sel}`);
      else console.log(`assert ok T66: ⌫ removes ${sel} under the CLICK tool`);
    }
    // A click beside every box still paints (and clears the selection).
    const paper = await at(page, 'back', 0.5, 0.75);
    await page.mouse.click(paper.x, paper.y);
    await page.waitForTimeout(200);
    if ((await page.locator('[data-artwork-selected]').count()) !== 0)
      errors.push('ASSERT T66: a click beside the boxes keeps a selection');
  }
  console.log(
    `band placements: ${JSON.stringify(await page.evaluate(() => window.__band.assetPlacements.map((p) => [p.id, p.assetId, p.pictureId, p.annotation.points.map((q) => [q.x.value, q.y.value])])))}`,
  );
  await ctx.close();
} finally {
  await browser.close();
}

for (const s of shots) console.log(s);
if (errors.length) {
  console.log(`\n${errors.length} console/page problems:`);
  for (const e of errors) console.log('  ' + e);
} else console.log('\nno console errors');
