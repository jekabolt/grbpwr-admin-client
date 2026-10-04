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
          // An own upload (drop / ⌘V on a cell) lands as media 903.
          if (name === 'UploadContentImage')
            return { media: { ...clone((window.__library || [])[0]), id: 903 } };
          // An own picture lands on the shelf with a fresh id, so its binding follows (as in life).
          if (name === 'UpsertDesignAsset') {
            const band = window.__band;
            const id = body.assetId > 0 ? body.assetId : 600 + (band.assets || []).length;
            const lib = (window.__library || []).find((m) => m.id === body.mediaId);
            const asset = { ...clone(body), id, media: clone(lib || (window.__library || [])[0]) };
            band.assets = [...(band.assets || []).filter((a) => a.id !== id), asset];
            return { asset };
          }
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

    // Round 6: a file dropped on a cell selects it, opens the intake and places the upload there.
    const PNG =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const dropOn = (sel, kind) =>
      page.evaluate(
        ({ sel, kind, b64 }) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], 'own.png', { type: 'image/png' }));
          const el = document.querySelector(sel);
          if (kind === 'paste') {
            el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            document.body.dispatchEvent(
              new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
            );
            return;
          }
          for (const type of ['dragenter', 'dragover', 'drop'])
            el.dispatchEvent(
              new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
            );
        },
        { sel, kind, b64: PNG },
      );
    {
      const before = await page.evaluate(() => window.__calls.length);
      await dropOn('[data-fh-cell="4"]', 'drop');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
      if ((await page.locator('[data-fh-for="4"]').count()) !== 1)
        errors.push('[1440] ASSERT: a drop did not select its cell');
      await page
        .getByRole('button', { name: /^upload/i })
        .last()
        .click();
      await page.waitForTimeout(800);
      const up = await page.evaluate(
        (n) => window.__calls.slice(n).find((c) => c.name === 'UpsertDesignAsset')?.body,
        before,
      );
      if (up?.mediaId !== 903)
        errors.push(`[1440] ASSERT: dropped file not placed · ${JSON.stringify(up)}`);
      else console.log('assert ok: drop on a cell selects it and places the upload');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    {
      // ⌘V while the pointer is on a cell: same road.
      await page.hover('[data-fh-cell="6"]');
      await dropOn('[data-fh-cell="6"]', 'paste');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
      if ((await page.locator('[data-fh-for="6"]').count()) !== 1)
        errors.push('[1440] ASSERT: ⌘V on a hovered cell did not select it');
      else if ((await page.locator('[role="dialog"]').count()) < 1)
        errors.push('[1440] ASSERT: ⌘V on a hovered cell opened no intake');
      else console.log('assert ok: ⌘V on a hovered cell selects it and opens the intake');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Round 6 · X4: batch fill lives in the MATERIALS header aside (`N of M filled · fill K empty`),
    // not in the GENERATE row. Hover marks exactly the cells it will make; asking keeps the marks.
    if ((await page.locator('[data-fh-batch] [data-fh-all-empty]').count()) !== 1)
      errors.push('[1440] ASSERT: `fill N empty` is not in the header aside');
    if ((await page.locator('[data-fh-generate] [data-fh-all-empty]').count()) !== 0)
      errors.push('[1440] ASSERT: batch fill still in the GENERATE row');
    await page.mouse.move(5, 5);
    await page.hover('[data-fh-all-empty]');
    await page.waitForTimeout(200);
    const fillN = Number(await page.getAttribute('[data-fh-all-empty]', 'data-fh-all-empty'));
    const marks = await page.locator('[data-fh-fill-mark]').count();
    if (marks !== fillN || fillN < 1)
      errors.push(`[1440] ASSERT: fill preview marks ${marks} cells for ${fillN}`);
    else console.log(`assert ok: fill preview marks exactly ${marks} cells`);
    await shoot(page, 'r6-fill-hover-1440.png');
    // One click asks `make N pictures · yes · no` in place; the marks stay; `no` reverts.
    await page.click('[data-fh-all-empty]');
    if ((await page.locator('[data-fh-batch] [data-fh-all-confirm]').count()) !== 1)
      errors.push('[1440] ASSERT: confirm is not in the header aside');
    if ((await page.locator('[data-fh-fill-mark]').count()) !== fillN)
      errors.push('[1440] ASSERT: preview marks dropped while asking');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await shoot(page, 'r6-fill-confirm-1440.png');
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
    // Round 6: an empty cell shows `upload` on hover; the word opens the library for that cell.
    const upOpacity = await page
      .locator('[data-fh-upload="5"]')
      .evaluate((el) => getComputedStyle(el).opacity)
      .catch(() => 'missing');
    if (upOpacity !== '1') errors.push(`[1440] ASSERT: hover upload word opacity ${upOpacity}`);
    await shoot(page, 'r6-upload-hover-1440.png');
    await page.click('[data-fh-upload="5"]');
    await page
      .waitForSelector('[role="dialog"]', { timeout: 5000 })
      .then(() => console.log('assert ok: `upload` on an empty cell opens the library'))
      .catch(() => errors.push('[1440] ASSERT: `upload` did not open the library'));
    if ((await page.locator('[data-fh-for="5"]').count()) !== 1)
      errors.push('[1440] ASSERT: `upload` did not select its cell');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Selected fabric: MAIN FABRIC (bound) — the panel is its spec.
    await page.click('[data-fh-cell="1"] [data-picture-tile]');
    await page.waitForSelector('[data-fh-for="1"]');
    if ((await page.locator('[data-fh-for="1"] [data-flat-custom]').count()) !== 0)
      errors.push('[1440] ASSERT: a fabric slot shows the custom door');
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
    if (
      (await page.locator('[data-fh-chip]').count()) !== 0 ||
      (await page.locator('[data-flat-custom]').count()) !== 1
    )
      errors.push('[1440] ASSERT: hardware chips not folded behind `custom`');
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

    // Round 5: BRAND LABEL selected — seeded from its card row, `woven` look, a logo picture.
    await page.click('[data-fh-cell="5"]');
    await page.waitForSelector('[data-fh-for="5"]');
    const seeded = await page.inputValue('[data-fh-words]');
    if (seeded !== 'centre back neck, 50 × 20 mm')
      errors.push(`[1440] ASSERT: label seed is «${seeded}»`);
    else console.log('assert ok: label seeds placement chip word and size, flat dropped');
    // Round 6: chips fold behind `custom ▸` (closed by default); a seeded chip word lights `•`.
    if ((await page.locator('[data-fh-chip]').count()) !== 0)
      errors.push('[1440] ASSERT: label chips visible with custom closed');
    if ((await page.locator('[data-flat-custom="modified"]').count()) !== 1)
      errors.push('[1440] ASSERT: seeded chip word does not mark the door `custom •`');
    else console.log('assert ok: label chips hidden, door reads custom •');
    await settle();
    await shoot(page, 'r6-label-closed-1440.png');
    await page.click('[data-flat-custom]');
    await page.click('[data-fh-chip="woven"]');
    await page.click('[data-fh-look-door] button');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    // Single-picture slot: a click picks and closes the library.
    await page.locator('[role="dialog"] img').nth(1).click();
    await page.waitForSelector('[data-fh-look="1"]', { timeout: 5000 }).catch(() => {
      errors.push('[1440] the logo did not land in the label spec');
    });
    if ((await page.locator('[data-fh-look-door]').count()) !== 0)
      errors.push('[1440] ASSERT: label takes more than one logo');
    // Round 6: a reference picture beside the logo (up to 3).
    await page.click('[data-fh-ref-door] button');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] img').first().click();
    await page.getByRole('button', { name: /add all/i }).click();
    await page.waitForSelector('[data-fh-ref="1"]', { timeout: 5000 }).catch(() => {
      errors.push('[1440] the reference did not land in the label spec');
    });
    await settle();
    await shoot(page, 'r5-label-selected-1440.png');
    await shoot(page, 'r6-label-open-1440.png');
    // The run body: mode `label`, the logo as the one picture, placement as «sewn at».
    const before = await page.evaluate(() => window.__calls.length);
    await page.click('[data-fh-generate="live"] button:has-text("GENERATE")');
    await page.waitForTimeout(500);
    const sent = await page.evaluate(
      (n) => window.__calls.slice(n).find((c) => c.body?.params?.pattern)?.body,
      before,
    );
    const p = sent?.params;
    if (
      p?.pattern?.mode !== 'label' ||
      JSON.stringify(p.extraInputMediaIds) !== '[902,901]' ||
      !String(p.colour?.words).includes('sewn at centre back neck') ||
      !String(p.colour?.words).includes('logo = picture 1') ||
      sent.ask !== 'centre back neck, 50 × 20 mm, woven'
    )
      errors.push(`[1440] ASSERT: label run body ${JSON.stringify(sent)?.slice(0, 400)}`);
    else console.log(`assert ok: label run · words «${p.colour.words}»`);
    await ctx.close();
  }
  {
    // Round 7 · ARTWORK: group after HARDWARE, `+ artwork` → inline born row → BOM line → selected.
    const { ctx, page } = await open(1440, 1000);
    const settle = async () => {
      await page.mouse.move(5, 5);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(400);
    };
    if ((await page.locator('[data-fh-group="artwork"] [data-fh-slot]').count()) !== 2)
      errors.push('[1440] ASSERT: ARTWORK group does not hold the two DECORATION lines');
    if ((await page.locator('[data-fh-group="hardware"] [data-fh-slot="7"]').count()) !== 0)
      errors.push('[1440] ASSERT: an artwork slot is still in HARDWARE');
    if ((await page.locator('[data-fh-slot="7"] [data-fh-checker]').count()) !== 1)
      errors.push('[1440] ASSERT: the filled artwork cell has no checkerboard');
    if ((await page.locator('[data-fh-slot="8"] [data-trim-backdrop="artwork"]').count()) !== 1)
      errors.push('[1440] ASSERT: the empty artwork cell has no artwork pictogram');
    await page.click('[data-fh-new-artwork="live"]');
    await page.waitForSelector('[data-fh-born="open"]');
    if (
      (await page.inputValue('[data-fh-born-name]')) !== '' ||
      (await page.getAttribute('[data-fh-born-name]', 'placeholder')) !== 'embroidery'
    )
      errors.push('[1440] ASSERT: born row does not start from embroidery');
    await page.fill('[data-fh-born-name]', 'chest embroidery');
    await settle();
    await shoot(page, 'r7-artwork-born-1440.png');
    await page.click('[data-fh-born-add]');
    await page
      .waitForSelector('[data-fh-for="800"]', { timeout: 5000 })
      .then(() =>
        console.log('assert ok: + artwork adds a DECORATION line and selects it once saved'),
      )
      .catch(() => errors.push('[1440] ASSERT: the born artwork was not selected after save'));
    if ((await page.locator('[data-fh-born]').count()) !== 0)
      errors.push('[1440] ASSERT: born row still open after save');
    const seed = await page.inputValue('[data-fh-words]');
    if (seed !== 'embroidery') errors.push(`[1440] ASSERT: artwork seed is «${seed}»`);
    // `+ photo` (picture 1) — the GRBPWR logo of the library.
    await page.click('[data-fh-look-door] button');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] img').nth(1).click();
    await page.waitForSelector('[data-fh-look="1"]', { timeout: 5000 }).catch(() => {
      errors.push('[1440] the photo did not land in the artwork spec');
    });
    await page.click('[data-flat-custom]');
    // Technique chips are single-select.
    await page.click('[data-fh-chip="patch"]');
    await page.click('[data-fh-chip="embroidery"]');
    if ((await page.inputValue('[data-fh-words]')) !== 'embroidery')
      errors.push(
        `[1440] ASSERT: technique chips not single-select · «${await page.inputValue('[data-fh-words]')}»`,
      );
    await settle();
    await shoot(page, 'r7-artwork-selected-1440.png');
    const before = await page.evaluate(() => window.__calls.length);
    await page.click('[data-fh-generate="live"] button:has-text("GENERATE")');
    await page.waitForTimeout(500);
    const sent = await page.evaluate(
      (n) => window.__calls.slice(n).find((c) => c.body?.params?.pattern)?.body,
      before,
    );
    const p = sent?.params;
    if (
      p?.pattern?.mode !== 'artwork' ||
      p?.pattern?.bomItemId !== 800 ||
      JSON.stringify(p.extraInputMediaIds) !== '[902]' ||
      !String(p.colour?.words).includes('artwork = picture 1') ||
      /cm wide/.test(String(p.colour?.words)) ||
      sent.ask !== 'embroidery'
    )
      errors.push(`[1440] ASSERT: artwork run body ${JSON.stringify(sent)?.slice(0, 400)}`);
    else console.log(`assert ok: artwork run · words «${p.colour.words}»`);
    await ctx.close();
  }
  {
    // T22 · several ARTWORK slots, driven by real clicks: each selects like a FABRICS/HARDWARE cell
    // (GENERATE · NAME, mode artwork), specs stay per slot, and every picture door lands.
    const { ctx, page } = await open(1440, 1000);
    const subject = async () => [
      await page.getAttribute('[data-fh-generate]', 'data-fh-for'),
      (await page.textContent('[data-fh-subject]'))?.trim(),
    ];
    const selects = async (id, name, how = 'click') => {
      if (how === 'enter') {
        await page.focus(`[data-fh-cell="${id}"]`);
        await page.keyboard.press('Enter');
      } else await page.click(`[data-fh-cell="${id}"]`);
      // Past the tile's one-or-two-clicks window: a late single must not take the selection back.
      await page.waitForTimeout(450);
      const [for_, subj] = await subject();
      if (for_ !== String(id) || subj !== name)
        errors.push(`[1440] ASSERT T22: ${how} on artwork ${id} selected ${for_} «${subj}»`);
    };
    // Existing artworks (filled CHEST LOGO, empty BACK PRINT), crossing groups both ways.
    await selects(7, 'CHEST LOGO');
    await selects(8, 'BACK PRINT');
    await selects(3, 'FRONT BUTTON');
    await selects(7, 'CHEST LOGO', 'enter');
    // A quick second click: filled CHEST LOGO, then BACK PRINT inside the double-click window.
    await page.click('[data-fh-cell="7"]');
    await page.waitForTimeout(120);
    await page.click('[data-fh-cell="8"]');
    await page.waitForTimeout(500);
    if ((await subject())[0] !== '8')
      errors.push('[1440] ASSERT T22: a filled cell took the selection back after a quick click');
    // GENERATE · CHEST LOGO runs in mode artwork for line 7.
    await selects(7, 'CHEST LOGO');
    {
      const n = await page.evaluate(() => window.__calls.length);
      await page.click('[data-fh-generate="live"] button:has-text("GENERATE")');
      await page.waitForTimeout(500);
      const p = await page.evaluate(
        (n) => window.__calls.slice(n).find((c) => c.body?.params?.pattern)?.body?.params,
        n,
      );
      if (p?.pattern?.mode !== 'artwork' || p?.pattern?.bomItemId !== 7)
        errors.push(`[1440] ASSERT T22: GENERATE · CHEST LOGO sent ${JSON.stringify(p?.pattern)}`);
      else console.log('assert ok: artwork cell selects, GENERATE · CHEST LOGO runs mode artwork');
    }
    // Three born artworks: each lands as its own slot and is selected once saved.
    const born = [];
    for (const name of ['one', 'two', 'three']) {
      await page.click('[data-fh-new-artwork="live"]');
      await page.fill('[data-fh-born-name]', name);
      await page.click('[data-fh-born-add]');
      await page
        .waitForFunction(
          (name) => document.querySelector('[data-fh-subject]')?.textContent?.trim() === name,
          name,
          { timeout: 5000 },
        )
        .catch(() => errors.push(`[1440] ASSERT T22: born artwork «${name}» not selected`));
      born.push(Number((await subject())[0]));
    }
    const ids = await page
      .locator('[data-fh-group="artwork"] [data-fh-slot]')
      .evaluateAll((es) => es.map((e) => Number(e.getAttribute('data-fh-slot'))));
    if (new Set(born).size !== 3 || born.some((id) => !ids.includes(id)))
      errors.push(`[1440] ASSERT T22: born artworks ${born} not all in ARTWORK ${ids}`);
    for (const [i, id] of born.entries()) await selects(id, ['one', 'two', 'three'][i]);
    // `fill N empty` counts each empty artwork on its own: BACK PRINT + three born.
    const fillN = Number(await page.getAttribute('[data-fh-all-empty]', 'data-fh-all-empty'));
    await page.hover('[data-fh-all-empty]');
    await page.waitForTimeout(200);
    const artMarks = await page.locator('[data-fh-group="artwork"] [data-fh-fill-mark]').count();
    if (artMarks !== Math.min(4, fillN))
      errors.push(`[1440] ASSERT T22: fill marks ${artMarks} artwork cells of ${fillN}`);
    await page.mouse.move(5, 5);

    const pickIn = async (door, nth) => {
      await page.click(door);
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(400);
      await page.locator('[role="dialog"] img').nth(nth).click();
      const addAll = page.getByRole('button', { name: /add all/i });
      if (await addAll.count()) await addAll.click();
      await page.waitForTimeout(500);
    };
    // (1) `+ photo` and (2) `+ ref` on an existing empty artwork (BACK PRINT) and a born one.
    for (const [id, name] of [
      [8, 'BACK PRINT'],
      [born[1], 'two'],
    ]) {
      await selects(id, name);
      await pickIn(`[data-fh-for="${id}"] [data-fh-look-door] button`, 1);
      if ((await page.locator(`[data-fh-for="${id}"] [data-fh-look="1"]`).count()) !== 1)
        errors.push(`[1440] ASSERT T22: + photo did not land on artwork ${id}`);
      await pickIn(`[data-fh-for="${id}"] [data-fh-ref-door] button`, 0);
      if ((await page.locator(`[data-fh-for="${id}"] [data-fh-ref="1"]`).count()) !== 1)
        errors.push(`[1440] ASSERT T22: + ref did not land on artwork ${id}`);
    }
    // Specs do not bleed: born «one» and «three» carry no photo of their neighbours.
    for (const [id, name] of [
      [born[0], 'one'],
      [born[2], 'three'],
    ]) {
      await selects(id, name);
      if ((await page.locator('[data-fh-look]').count()) !== 0)
        errors.push(`[1440] ASSERT T22: artwork ${id} shows a photo picked for another artwork`);
    }
    await selects(8, 'BACK PRINT');
    if ((await page.locator('[data-fh-for="8"] [data-fh-look="1"]').count()) !== 1)
      errors.push('[1440] ASSERT T22: BACK PRINT lost its photo after switching slots');
    else console.log('assert ok: + photo / + ref land per artwork, specs stay per slot');
    // (3) `use own picture` binds the picked picture to the selected artwork's cell.
    const bindsTo = async (id, act) => {
      const n = await page.evaluate(() => window.__calls.length);
      await act();
      await page.waitForTimeout(800);
      const b = await page.evaluate(
        (n) => window.__calls.slice(n).find((c) => c.name === 'SetDesignAssetBinding')?.body,
        n,
      );
      return b?.bomItemId === id && b?.assetId > 0;
    };
    if (
      !(await bindsTo(born[0], async () => {
        await selects(born[0], 'one');
        await pickIn('[data-fh-own-picture]', 1);
      }))
    )
      errors.push('[1440] ASSERT T22: use own picture did not bind on the artwork');
    if ((await page.locator(`[data-fh-slot="${born[0]}"] [data-fh-checker]`).count()) !== 1)
      errors.push('[1440] ASSERT T22: own picture not shown in the artwork cell');
    // (4) the `upload` word on an empty artwork cell.
    await page.hover(`[data-fh-cell="${born[2]}"]`);
    if (!(await bindsTo(born[2], () => pickIn(`[data-fh-upload="${born[2]}"]`, 1))))
      errors.push('[1440] ASSERT T22: `upload` on an empty artwork cell did not bind');
    else console.log('assert ok: use own picture and `upload` bind on artwork cells');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await shoot(page, 't22-artworks-1440.png');
    await ctx.close();
  }
  {
    // Two live runs on this colourway: making cells carry the cancel corner; `cancel all` shows.
    const { ctx, page } = await open(1440, 1000, '#making');
    await page.waitForSelector('[data-fh-pending] [data-run-cancel]');
    if ((await page.locator('[data-fh-batch] [data-fh-cancel-all]').count()) !== 1)
      errors.push('[1440] ASSERT: no `cancel all` in the header aside with two live runs');
    if ((await page.locator('[data-fh-batch] [data-fh-making="2"]').count()) !== 1)
      errors.push('[1440] ASSERT: header aside does not say `making 2`');
    if ((await page.locator('[data-fh-generate] [data-fh-cancel-all]').count()) !== 0)
      errors.push('[1440] ASSERT: `cancel all` still in the GENERATE row');
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
    await page.click('[data-fh-cell="5"]');
    await page.waitForSelector('[data-fh-for="5"]');
    await page.click('[data-flat-custom]');
    await page.click('[data-fh-chip="woven"]');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    await shoot(page, 'r5-label-selected-390.png');
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
