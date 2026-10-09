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
          if (name === 'DeleteDesignAsset') {
            const band = window.__band;
            band.assets = (band.assets || []).filter((a) => a.id !== body.assetId);
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
  // T65 · every choice is the app's dropdown: open it, pick the option by its text.
  const pickSel = async (page, lead, word) => {
    await page.click(`[data-fh-select="${lead}"] button`);
    await page.getByRole('option', { name: word, exact: true }).click();
    await page.waitForTimeout(150);
  };
  const selValue = (page, lead) =>
    page
      .locator(`[data-fh-select="${lead}"] button`)
      .first()
      .textContent()
      .then((t) => (t ?? '').trim().toLowerCase());
  // The free words live behind `custom ▸` (closed by default).
  const openCustom = async (page) => {
    if ((await page.getAttribute('[data-flat-custom]', 'aria-expanded')) !== 'true')
      await page.click('[data-flat-custom]');
    await page.waitForSelector('[data-fh-words]');
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
    await page.click('[data-fh-cell="4"] [data-bench-cap]');
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
    // T65: an empty cell is FLAT SLOTS' two-half slot — `from media` on top, `generate ✦` below;
    // no `upload` word.
    if ((await page.locator('[data-fh-upload]').count()) !== 0)
      errors.push('[1440] ASSERT T65: an `upload` word is still drawn');
    if ((await page.locator('[data-fh-empty="5"] [data-place-or-draw-pen]').count()) !== 1)
      errors.push('[1440] ASSERT T65: the empty cell has no `generate` half');
    await shoot(page, 'r6-upload-hover-1440.png');
    await page
      .locator('[data-fh-empty="5"]')
      .getByRole('button', { name: /from media/i })
      .click();
    await page
      .waitForSelector('[role="dialog"]', { timeout: 5000 })
      .then(() => console.log('assert ok: `from media` half opens the library'))
      .catch(() => errors.push('[1440] ASSERT: `from media` half did not open the library'));
    if ((await page.locator('[data-fh-for="5"]').count()) !== 1)
      errors.push('[1440] ASSERT: `from media` half did not select its cell');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('[data-fh-empty="6"] [data-place-or-draw-pen]');
    await page.waitForTimeout(400);
    if (
      (await page.locator('[data-fh-for="6"]').count()) !== 1 ||
      (await page.locator('[role="dialog"]').count()) !== 0
    )
      errors.push(
        '[1440] ASSERT T65: `generate` half did not select its cell (or opened a dialog)',
      );
    else console.log('assert ok: `generate` half selects its cell, no dialog');

    // Selected fabric: MAIN FABRIC (bound) — the panel is its spec.
    await page.click('[data-fh-cell="1"] [data-picture-tile]');
    await page.waitForSelector('[data-fh-for="1"]');
    if ((await page.locator('[data-fh-for="1"] [data-flat-custom]').count()) !== 0)
      errors.push('[1440] ASSERT: a fabric slot shows the custom door');
    await settle();
    await shoot(page, 'r4-fabric-selected-1440.png');

    // T65: no `use own picture` beside GENERATE, no «no colour» caption, GENERATE its own block.
    await page.click('[data-fh-cell="2"] [data-bench-cap]');
    await page.waitForSelector('[data-fh-for="2"]');
    {
      const own = await page.locator('[data-fh-own-picture]').count();
      const txt = (await page.textContent('[data-fh-generate]'))?.toLowerCase() ?? '';
      const own_block =
        (await page.locator('[data-fh-generate] #design-materials-generate').count()) === 1 &&
        (await page.locator('#design-pattern [data-fh-generate]').count()) === 0;
      if (own !== 0 || /no colour|two runs/.test(txt) || !own_block)
        errors.push(`[1440] ASSERT T65: generate block ${JSON.stringify({ own, own_block })}`);
      else
        console.log('assert ok T65: GENERATE is its own block, no own-picture door, no captions');
    }

    // Selected hardware: FRONT BUTTON, words «horn, black», one picture from the library.
    await page.click('[data-fh-cell="3"] [data-picture-tile]');
    await page.waitForSelector('[data-fh-for="3"]');
    if (
      (await page.locator('[data-fh-select="material"]').count()) !== 1 ||
      (await page.locator('[data-fh-words]').count()) !== 0 ||
      (await page.locator('[data-flat-custom]').count()) !== 1
    )
      errors.push('[1440] ASSERT T65: hardware MATERIAL not a dropdown / words not behind custom');
    await openCustom(page);
    await page.fill('[data-fh-words]', 'horn, black');
    if ((await selValue(page, 'material')) !== 'horn')
      errors.push(
        `[1440] ASSERT T65: MATERIAL dropdown reads «${await selValue(page, 'material')}»`,
      );
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
    await page.click('[data-fh-cell="5"] [data-bench-cap]');
    await page.waitForSelector('[data-fh-for="5"]');
    // T65: LOOK / SEWN AT are dropdowns up front; the free words fold behind `custom ▸`, and
    // words beyond the dropdowns (the size) light `custom •`.
    if ((await page.locator('[data-fh-words]').count()) !== 0)
      errors.push('[1440] ASSERT: label words visible with custom closed');
    if ((await selValue(page, 'sewn at')) !== 'centre back neck')
      errors.push(`[1440] ASSERT T65: SEWN AT reads «${await selValue(page, 'sewn at')}»`);
    if ((await page.locator('[data-flat-custom="modified"]').count()) !== 1)
      errors.push('[1440] ASSERT: extra seeded words do not mark the door `custom •`');
    else console.log('assert ok: label dropdowns up front, door reads custom •');
    await settle();
    await shoot(page, 'r6-label-closed-1440.png');
    await openCustom(page);
    const seeded = await page.inputValue('[data-fh-words]');
    if (seeded !== 'centre back neck, 50 × 20 mm')
      errors.push(`[1440] ASSERT: label seed is «${seeded}»`);
    else console.log('assert ok: label seeds placement word and size, flat dropped');
    await pickSel(page, 'look', 'woven');
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
    // T61 · every MATERIALS cell (and `+ artwork`) is the FLAT SLOTS box: 166 wide, one height;
    // the chosen cell's cap is inverted with ✦; another cell shows ✦ on hover.
    {
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll('[data-fh-slot] > *, [data-fh-new-artwork]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );
      const ws = new Set(boxes.map((b) => b.w));
      const hs = new Set(boxes.map((b) => b.h));
      const chosen = await page.locator('[data-fh-selected] [data-bench-cap]').evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        mark: !!el.querySelector('[data-fh-target-mark="on"]'),
      }));
      await page.hover('[data-fh-cell="1"]');
      await page.waitForTimeout(250);
      const hint = await page
        .locator('[data-fh-cell="1"] [data-fh-target-mark="hint"]')
        .evaluate((el) => getComputedStyle(el).opacity);
      if (
        boxes.length < 6 ||
        ws.size !== 1 ||
        !ws.has(166) ||
        hs.size !== 1 ||
        chosen.bg !== 'rgb(0, 0, 0)' ||
        !chosen.mark ||
        hint !== '1'
      )
        errors.push(
          `[1440] ASSERT T61: ${JSON.stringify({ ws: [...ws], hs: [...hs], chosen, hint })}`,
        );
      else
        console.log(
          `assert ok T61: ${boxes.length} cells 166×${[...hs][0]}, chosen inverted ✦, hover ✦`,
        );
      await page.locator('[data-fh-group="fabrics"]').scrollIntoViewIfNeeded();
      const grid = await page.locator('#design-pattern').boundingBox();
      const t61 = resolve(OUT, 't61-materials-1440.png');
      await page.screenshot({ path: t61, clip: grid ?? undefined, fullPage: !!grid });
      shots.push(t61);
      await page.mouse.move(5, 5);
    }
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
    // Round 7 · ARTWORK: group after HARDWARE; `+ artwork` → BOM line born AND selected in one click.
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
    // r7b · ONE click on `+ artwork` births the line AND selects it at once — before any id.
    const lines = () => page.evaluate(() => window.__form.getValues('bomItems'));
    const panel = async () => ({
      for_: await page.getAttribute('[data-fh-generate]', 'data-fh-for'),
      state: await page.getAttribute('[data-fh-generate]', 'data-fh-generate'),
      subj: (await page.textContent('[data-fh-subject]'))?.trim(),
    });
    await page.click('[data-fh-new-artwork="live"]');
    {
      const p = await panel();
      if (p.for_ !== 'saving' || p.state !== 'inert' || p.subj !== 'artwork 1')
        errors.push(
          `[1440] ASSERT r7b: first click did not select ARTWORK 1 at once ${JSON.stringify(p)}`,
        );
      const reason = (await page.textContent('[data-fh-generate-reason]'))?.trim();
      if (reason !== 'saving…') errors.push(`[1440] ASSERT r7b: pending reason «${reason}»`);
      if ((await page.locator('[data-fh-born-line] [data-place-or-draw-pen]').count()) !== 0)
        errors.push('[1440] ASSERT r7b: the pending cell offers its halves before the id landed');
      if (
        (await page
          .locator(
            '[data-fh-group="artwork"] [data-fh-born-line][data-fh-selected] [data-trim-backdrop="artwork"]',
          )
          .count()) !== 1
      )
        errors.push('[1440] ASSERT r7b: the pending artwork cell is not a selected pictogram cell');
      if ((await page.locator('[data-fh-born]').count()) !== 0)
        errors.push('[1440] ASSERT r7b: an inline born row is still drawn');
      const l = (await lines()).at(-1);
      if (
        l?.section !== 'TECH_CARD_BOM_SECTION_DECORATION' ||
        l?.name !== 'artwork 1' ||
        l?.spec !== 'embroidery' ||
        l?.kind !== 'TECH_CARD_BOM_KIND_EMBROIDERY'
      )
        errors.push(`[1440] ASSERT r7b: born line ${JSON.stringify(l)}`);
      else
        console.log('assert ok: one click on + artwork → line born, GENERATE · ARTWORK 1 at once');
    }
    await page
      .waitForSelector('[data-fh-generate="live"][data-fh-for="800"]', { timeout: 5000 })
      .then(() => console.log('assert ok: GENERATE goes live once the autosave stub gives id 800'))
      .catch(() => errors.push('[1440] ASSERT r7b: GENERATE not live after the id landed'));
    if ((await page.locator('[data-fh-empty="800"] [data-place-or-draw-pen]').count()) !== 1)
      errors.push('[1440] ASSERT r7b: the born cell has no halves after the id landed');
    if ((await page.locator('[data-fh-generate] [data-fh-artwork-name]').count()) !== 0)
      errors.push('[1440] ASSERT T65: a NAME field is still in GENERATE');
    // Second click: ARTWORK 2, selected at once; the first stays its own cell.
    await page.click('[data-fh-new-artwork="live"]');
    {
      const p2 = await panel();
      if (p2.for_ !== 'saving' || p2.subj !== 'artwork 2')
        errors.push(
          `[1440] ASSERT r7b: second click did not select ARTWORK 2 ${JSON.stringify(p2)}`,
        );
    }
    await settle();
    await shoot(page, 'r7b-artwork-oneclick-1440.png');
    await page
      .waitForSelector('[data-fh-generate="live"][data-fh-for="801"]', { timeout: 5000 })
      .then(() => console.log('assert ok: second + artwork → ARTWORK 2 selected, live at id 801'))
      .catch(() => errors.push('[1440] ASSERT r7b: ARTWORK 2 not live after its id landed'));
    if ((await page.locator('[data-fh-group="artwork"] [data-fh-slot]').count()) !== 4)
      errors.push('[1440] ASSERT r7b: ARTWORK does not hold 2 + 2 born cells');
    await page.click('[data-fh-cell="800"] [data-bench-cap]');
    await page.waitForTimeout(450);
    if ((await panel()).for_ !== '800')
      errors.push('[1440] ASSERT r7b: the first born artwork is not selectable after the second');
    // T65: the ARTWORK words fold behind `custom ▸` (closed by default).
    if ((await page.locator('[data-fh-words]').count()) !== 0)
      errors.push('[1440] ASSERT T65: artwork words visible with custom closed');
    await settle();
    await page.waitForTimeout(1000); // past the T63 blink
    await shoot(page, 't65-materials-1440.png');
    await openCustom(page);
    const seed = await page.inputValue('[data-fh-words]');
    if (seed !== 'embroidery') errors.push(`[1440] ASSERT: artwork seed is «${seed}»`);
    if ((await selValue(page, 'technique')) !== 'embroidery')
      errors.push('[1440] ASSERT r7b: TECHNIQUE dropdown does not read embroidery');
    // T65 rename on the cell: ✎ in the cap → inline field (Enter / blur writes the line name).
    await page.click('[data-fh-rename="800"]');
    await page.fill('[data-fh-artwork-name]', 'chest embroidery');
    await page.press('[data-fh-artwork-name]', 'Enter');
    await page.waitForTimeout(200);
    {
      const subj = (await page.textContent('[data-fh-subject]'))?.trim();
      const l = (await lines()).find((x) => x.id === 800);
      if (subj !== 'chest embroidery' || l?.name !== 'chest embroidery')
        errors.push(`[1440] ASSERT r7b: rename · subject «${subj}» line «${l?.name}»`);
      else console.log('assert ok: rename writes the BOM line name');
    }
    // Technique dropdown: up front, writes spec + kind, seeds the words.
    await pickSel(page, 'technique', 'patch');
    await page.waitForTimeout(150);
    {
      const l = (await lines()).find((x) => x.id === 800);
      const w = await page.inputValue('[data-fh-words]');
      const lit = await selValue(page, 'technique');
      if (
        l?.spec !== 'patch' ||
        l?.kind !== 'TECH_CARD_BOM_KIND_PATCH' ||
        w !== 'patch' ||
        lit !== 'patch'
      )
        errors.push(
          `[1440] ASSERT r7b: technique · ${JSON.stringify({ spec: l?.spec, kind: l?.kind, w, lit })}`,
        );
      else console.log('assert ok: technique dropdown writes spec + kind and seeds the words');
    }
    await pickSel(page, 'technique', 'embroidery');
    await page.waitForTimeout(150);
    if ((await page.inputValue('[data-fh-words]')) !== 'embroidery')
      errors.push(
        `[1440] ASSERT: technique not single-select · «${await page.inputValue('[data-fh-words]')}»`,
      );
    // `+ photo` (picture 1) — the GRBPWR logo of the library.
    await page.click('[data-fh-look-door] button');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] img').nth(1).click();
    await page.waitForSelector('[data-fh-look="1"]', { timeout: 5000 }).catch(() => {
      errors.push('[1440] the photo did not land in the artwork spec');
    });
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
      } else await page.click(`[data-fh-cell="${id}"] [data-bench-cap]`);
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
    await page.click('[data-fh-cell="8"] [data-bench-cap]');
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
      await page.click('[data-fh-selected] [data-fh-rename]');
      await page.fill('[data-fh-artwork-name]', name);
      await page.press('[data-fh-artwork-name]', 'Enter');
      await page
        .waitForFunction(
          (name) =>
            document.querySelector('[data-fh-subject]')?.textContent?.trim() === name &&
            document.querySelector('[data-fh-generate]')?.getAttribute('data-fh-for') !== 'saving',
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
    // (3) T65: the `from media` half binds the picked picture to its artwork's cell.
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
        await pickIn(`[data-fh-empty="${born[0]}"] button:has-text("from media")`, 1);
      }))
    )
      errors.push('[1440] ASSERT T22: `from media` did not bind on the artwork');
    if ((await page.locator(`[data-fh-slot="${born[0]}"] [data-fh-checker]`).count()) !== 1)
      errors.push('[1440] ASSERT T22: own picture not shown in the artwork cell');
    // (4) the `from media` half of an unselected empty artwork cell.
    if (
      !(await bindsTo(born[2], () =>
        pickIn(`[data-fh-empty="${born[2]}"] button:has-text("from media")`, 1),
      ))
    )
      errors.push('[1440] ASSERT T22: `from media` on an empty artwork cell did not bind');
    else console.log('assert ok: `from media` binds on artwork cells');
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
    await page.click('[data-fh-cell="2"] [data-bench-cap]');
    await page.waitForSelector('[data-fh-for="2"]');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await shoot(page, 'r4-making-cancel-1440.png');
    await ctx.close();
  }
  {
    // Round 8 minors (C-m1…C-m4) on `#r8`: a long slot name, the undo word, the shelf, the logo.
    const { ctx, page } = await open(1440, 1000, '#r8');
    // C-m1 → T61: ONE line (the FLAT SLOTS cap), the whole name in the title with the purpose.
    {
      const cap = await page
        .locator('[data-fh-slot="1"] [data-bench-cap]')
        .first()
        .evaluate((el) => {
          const t = el.querySelector('span');
          const lh = parseFloat(getComputedStyle(t).lineHeight) || 12;
          return {
            text: t.textContent.trim(),
            title: el.getAttribute('title') ?? '',
            lines: Math.round(t.getBoundingClientRect().height / lh),
          };
        });
      if (
        cap.text !== 'main fabric outer shell'.toUpperCase() &&
        cap.text.toUpperCase() !== 'MAIN FABRIC OUTER SHELL'
      )
        errors.push(`[1440] ASSERT C-m1: cap ${JSON.stringify(cap)}`);
      else if (
        cap.lines !== 1 ||
        !cap.title.toUpperCase().includes('MAIN FABRIC OUTER SHELL') ||
        !cap.title.includes('main material')
      )
        errors.push(`[1440] ASSERT C-m1/T61: cap ${JSON.stringify(cap)}`);
      else console.log('assert ok C-m1/T61: name on 1 line, full name + purpose in the title');
    }
    // C-m2: `clear` on FRONT BUTTON → `undo` inside the cell frame; the cell keeps its height.
    {
      const h = () =>
        page.locator('[data-fh-slot="3"]').evaluate((el) => el.getBoundingClientRect().height);
      const h0 = await h();
      await page.click('[data-fh-cell="3"] [data-picture-tile]');
      await page.waitForTimeout(450);
      await page.hover('[data-fh-cell="3"]');
      await page.click('[data-menu="fh:3"]');
      await page.click('[data-menu-item="clear"]');
      await page
        .waitForSelector('[data-fh-undo="3"]', { timeout: 5000 })
        .catch(() => errors.push('[1440] ASSERT C-m2: no undo after clear'));
      const inside = await page
        .locator('[data-fh-cell="3"] [data-bench-cap] [data-fh-undo="3"]')
        .count();
      const h1 = await h();
      if (inside !== 1 || Math.abs(h1 - h0) > 0.5)
        errors.push(`[1440] ASSERT C-m2: undo inside ${inside}, height ${h0} → ${h1}`);
      else console.log(`assert ok C-m2: undo inside the frame, cell height ${h1} unchanged`);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await shoot(page, 'r8-undo-1440.png');
      await page.click('[data-fh-undo="3"]');
      await page
        .waitForSelector('[data-fh-cell="3"] [data-picture-tile]', { timeout: 5000 })
        .then(() => console.log('assert ok C-m2: undo restores the picture'))
        .catch(() => errors.push('[1440] ASSERT C-m2: undo did not restore the picture'));
    }
    // C-m4: BRAND LABEL seeds the composition label's logo, captioned `logo`; it rides the run.
    {
      await page.click('[data-fh-cell="5"] [data-bench-cap]');
      await page.waitForSelector('[data-fh-for="5"]');
      const look = await page.locator('[data-fh-for="5"] [data-fh-look="1"]').count();
      const caption = await page
        .locator('[data-fh-look="1"]')
        .evaluate((el) => el.lastElementChild?.textContent?.trim())
        .catch(() => '');
      if (look !== 1 || caption !== 'logo')
        errors.push(`[1440] ASSERT C-m4: seeded logo ${look}, caption «${caption}»`);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await shoot(page, 'r8-label-logo-1440.png');
      const n = await page.evaluate(() => window.__calls.length);
      await page.click('[data-fh-generate="live"] button:has-text("GENERATE")');
      await page.waitForTimeout(500);
      const p = await page.evaluate(
        (n) => window.__calls.slice(n).find((c) => c.body?.params?.pattern)?.body?.params,
        n,
      );
      if (
        JSON.stringify(p?.extraInputMediaIds) !== '[902]' ||
        !String(p?.colour?.words).includes('logo = picture 1')
      )
        errors.push(`[1440] ASSERT C-m4: label run ${JSON.stringify(p)?.slice(0, 300)}`);
      else console.log('assert ok C-m4: label logo seeded, captioned, sent as picture 1');
    }
    // C-m3: `104 / 120 · clean unused · 95` → `delete 95 unused pictures? yes · no` → yes re-reads
    // the band and deletes exactly the unused ones of THAT read (1000 is bound meanwhile, so 94),
    // never the placed / parent / worn / pattern / fabric / recent ones.
    {
      const shelf = await page.getAttribute('[data-fh-batch] [data-fh-shelf]', 'data-fh-shelf');
      const door = await page.getAttribute('[data-fh-batch] [data-fh-clean]', 'data-fh-clean');
      if (shelf !== '104' || door !== '95')
        errors.push(`[1440] ASSERT C-m3: shelf ${shelf}, clean door ${door}`);
      await page.click('[data-fh-clean]');
      const ask = (await page.textContent('[data-fh-clean-confirm]'))?.replace(/\s+/g, ' ').trim();
      if (!ask?.includes('delete 95 unused pictures?'))
        errors.push(`[1440] ASSERT C-m3: confirm reads «${ask}»`);
      if (
        (await page.evaluate(
          () => window.__calls.filter((c) => c.name === 'DeleteDesignAsset').length,
        )) > 0
      )
        errors.push('[1440] ASSERT C-m3: deleted on the first click');
      await page.mouse.move(5, 5);
      await page.waitForTimeout(200);
      await shoot(page, 'r8-clean-confirm-1440.png');
      await page.click('[data-fh-clean-no]');
      if ((await page.locator('[data-fh-clean]').count()) !== 1)
        errors.push('[1440] ASSERT C-m3: `no` did not revert the door');
      await page.click('[data-fh-clean]');
      // Another tab binds 1000 after this screen read the band: only the fresh read knows it.
      await page.evaluate(() => {
        window.__band.assetBindings = [
          ...window.__band.assetBindings,
          { colorwayId: 12, bomItemId: 3, assetId: 1000 },
        ];
      });
      await page.click('[data-fh-clean-yes]');
      await page
        .waitForFunction(() => !document.querySelector('[data-fh-shelf]'), null, { timeout: 8000 })
        .catch(() => errors.push('[1440] ASSERT C-m3: the shelf count did not leave below 100'));
      const gone = await page.evaluate(() =>
        window.__calls.filter((c) => c.name === 'DeleteDesignAsset').map((c) => c.body.assetId),
      );
      const want = Array.from({ length: 94 }, (_, i) => 1001 + i);
      if (JSON.stringify([...gone].sort((a, b) => a - b)) !== JSON.stringify(want))
        errors.push(
          `[1440] ASSERT C-m3: deleted ${gone.length} · ${gone.filter((id) => id >= 1095)}`,
        );
      else
        console.log(
          'assert ok C-m3: clean unused re-reads the band, deletes exactly its 94 unused pictures',
        );
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await shoot(page, 'r8-clean-done-1440.png');
    }
    await ctx.close();
  }
  {
    // C-m3: a band without placements draws the shelf count but never the door; the default stand
    // (3 assets) draws neither.
    const { ctx, page } = await open(1440, 1000, '#r8-noplace');
    if (
      (await page.locator('[data-fh-shelf="104"]').count()) !== 1 ||
      (await page.locator('[data-fh-clean]').count()) !== 0
    )
      errors.push('[1440] ASSERT C-m3: clean door drawn on a band without placements');
    else console.log('assert ok C-m3: no placements said → no clean door');
    await ctx.close();
    const d = await open(1440, 1000);
    if ((await d.page.locator('[data-fh-shelf]').count()) !== 0)
      errors.push('[1440] ASSERT C-m3: shelf count drawn under 100');
    await d.ctx.close();
  }
  {
    // C-m3: a live run on the card makes the door inert (`generating — clean after it lands`).
    const { ctx, page } = await open(1440, 1000, '#r8-busy');
    await page.waitForSelector('[data-fh-batch]');
    const inert = await page
      .locator('[data-fh-clean-inert] [data-inert]')
      .getAttribute('data-inert')
      .catch(() => null);
    if (
      inert !== 'generating — clean after it lands' ||
      (await page.locator('[data-fh-clean]').count()) !== 0
    )
      errors.push(`[1440] ASSERT C-m3: busy door «${inert}»`);
    else console.log('assert ok C-m3: a live run makes clean unused inert');
    await ctx.close();
  }
  {
    // C-m4: an SVG composition-label logo is not seeded; an SVG picked by hand is refused, for the
    // label logo and the artwork photo alike.
    const { ctx, page } = await open(1440, 1000, '#r8-svglogo');
    await page.click('[data-fh-cell="5"] [data-bench-cap]');
    await page.waitForSelector('[data-fh-for="5"]');
    if ((await page.locator('[data-fh-for="5"] [data-fh-look="1"]').count()) !== 0)
      errors.push('[1440] ASSERT C-m4: an SVG label logo was seeded');
    else console.log('assert ok C-m4: an SVG label logo is not seeded');
    const pickSvg = async (what) => {
      await page.click('[data-fh-look-door] button');
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(500);
      await page.locator('[role="dialog"] img').nth(2).click();
      await page.waitForTimeout(400);
      if ((await page.locator('[data-fh-look="1"]').count()) !== 0)
        errors.push(`[1440] ASSERT C-m4: an SVG landed as the ${what}`);
      else console.log(`assert ok C-m4: an SVG ${what} is refused`);
      if ((await page.locator('[role="dialog"]').count()) !== 0)
        await page.keyboard.press('Escape');
    };
    await pickSvg('label logo');
    await page.click('[data-fh-cell="7"]');
    await page.waitForSelector('[data-fh-for="7"]');
    await pickSvg('artwork photo');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(390, 844);
    await shoot(page, 'r4-390.png');
    await page.click('[data-fh-cell="5"] [data-bench-cap]');
    await page.waitForSelector('[data-fh-for="5"]');
    await pickSel(page, 'look', 'woven');
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
