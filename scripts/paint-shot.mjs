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
          if (name === 'SuggestDesignPartsCard') {
            if (window.__stand === 'f2fail') throw new Error('design: the assistant is not answering');
            if (window.__stand === 'f7' && !window.__named) {
              window.__named = true;
              return new Promise((ok) => setTimeout(() => ok(answer(name, body)), 1500));
            }
            const slug = (l) => l.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const out = body.views.map((v) => {
              const f = (window.__fakeCard || {})[v.view] || (window.__fakeParts || {})[v.view];
              if (!f) throw new Error('no fake parts for ' + v.view);
              return {
                ...f,
                view: v.view,
                baseMediaId: v.baseMediaId,
                algoRev: body.algoRev,
                parts: f.parts.map((g) => ({ ...g, partKey: g.partKey || slug(g.label) })),
              };
            });
            const asked = new Set(out.map((x) => x.view));
            window.__band.partsSuggestions = [
              ...(window.__band.partsSuggestions || []).filter((x) => !asked.has(x.view)),
              ...out,
            ];
            // M6 · the server reads the card's pieces list from the FRONT/BACK flats on the first
            // naming (here: the fake card's own labels) and answers the list it named under.
            if (!window.__band.partsPieces) {
              const names = [...new Set(out.flatMap((x) => x.parts.map((g) => g.label)))]
                .filter((n) => n !== 'opening' && n !== 'unnamed');
              window.__band.partsPieces = { rev: 1, pieces: names.map((name) => ({ name, views: [] })), openings: [], edited: false };
            }
            return { suggestions: clone(out), cached: false, pieces: clone(window.__band.partsPieces) };
          }
          if (name === 'SetDesignPartsPieces') {
            const was = window.__band.partsPieces;
            if ((was?.rev ?? 0) !== body.expectedRev) {
              const e = new Error('design: parts_pieces_rev_mismatch'); e.status = 409; throw e;
            }
            window.__band.partsPieces = {
              ...was, rev: (was?.rev ?? 0) + 1, edited: true,
              pieces: body.names.map((name) => ({ name, views: [] })),
              proposal: body.settleProposal ? undefined : was?.proposal,
            };
            // The band shows only rows named under the list's current rev.
            window.__band.partsSuggestions = [];
            return { pieces: clone(window.__band.partsPieces) };
          }
          if (name === 'SuggestDesignParts') {
            if (window.__stand === 'f2fail') throw new Error('design: the assistant is not answering');
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
// Ф2.1 stand: the right side is the left side's flat mirrored (no right-side flat in Ф0).
const MIRROR = resolve(tmpdir(), `paint-shot-mirror-${process.pid}.png`);
{
  const { decode, encode } = await import('fast-png');
  const src = decode(readFileSync(resolve(FLATS, 'c49-p124-side.png')));
  const ch = src.channels;
  const out = new Uint8Array(src.data.length);
  for (let y = 0; y < src.height; y += 1)
    for (let x = 0; x < src.width; x += 1)
      for (let c = 0; c < ch; c += 1)
        out[(y * src.width + x) * ch + c] =
          src.data[(y * src.width + (src.width - 1 - x)) * ch + c];
  const { writeFileSync } = await import('node:fs');
  writeFileSync(MIRROR, encode({ ...src, data: out }));
}
// T23 stand: a bare outline (one region — no parts can be named on it, QW5 «pen only»).
const OUTLINE = resolve(tmpdir(), `paint-shot-outline-${process.pid}.png`);
{
  const { encode } = await import('fast-png');
  const W = 328,
    H = 851;
  const data = new Uint8Array(W * H * 4).fill(255);
  for (let t = 0; t < 4000; t += 1) {
    const a = (t / 4000) * Math.PI * 2;
    const cx = W / 2 + Math.cos(a) * (W * 0.38);
    const cy = H / 2 + Math.sin(a) * (H * 0.42);
    for (let dy = -2; dy <= 2; dy += 1)
      for (let dx = -2; dx <= 2; dx += 1) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
      }
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUTLINE, encode({ width: W, height: H, data, channels: 4 }));
}
const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  let saved = null;
  const open = async (width, height, stand = 'f1') => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (stand !== 'f1')
      await page.addInitScript((x) => {
        window.__stand = x;
      }, stand);
    if (saved && stand === 'f1')
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
        path: (() => {
          const name = new URL(route.request().url()).pathname.split('/').pop();
          if (name === 'outline.png') return OUTLINE;
          return name === 'c49-p124-side-mirror.png' ? MIRROR : resolve(FLATS, name);
        })(),
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
        (n) => document.querySelectorAll('[data-paint-status="ready"]').length === n,
        stand === 'f1' ? 3 : stand.startsWith('f5') || stand.startsWith('f7') ? 4 : 2,
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
  {
    // Ф2: auto parts over the shirt (front from the band, back asked through the stub).
    const { ctx, page } = await open(1440, 1000, 'f2');
    await page
      .waitForFunction(() => window.__paint.views.get('back')?.parts, null, { timeout: 8000 })
      .catch(() => errors.push('[f2] ASSERT: back never got its parts'));
    const asked = await page.evaluate(() => {
      const c = window.__calls.find((x) => x.name === 'SuggestDesignPartsCard');
      const b = c?.body.views.find((v) => v.view === 'back');
      return b
        ? { ...b, algoRev: c.body.algoRev, marks: window.__uploads.get(b.marksMediaId) }
        : null;
    });
    if (!asked || asked.view !== 'back') errors.push(`[f2] ASSERT: asked ${asked?.view}`);
    else {
      console.log(
        `asked back: regions ${asked.regionCount} algo ${asked.algoRev} base ${asked.baseMediaId}`,
      );
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        resolve(OUT, 'f2-marks-back.png'),
        Buffer.from(asked.marks.split(',')[1], 'base64'),
      );
      shots.push(resolve(OUT, 'f2-marks-back.png'));
    }
    // The band's front row has no part_key (side by side, stale): ONE card call asks both sides.
    const cardCalls = await page.evaluate(() =>
      window.__calls
        .filter((x) => x.name === 'SuggestDesignPartsCard' || x.name === 'SuggestDesignParts')
        .map((x) => `${x.name}:${(x.body.views || [x.body]).map((v) => v.view).join('+')}`),
    );
    if (JSON.stringify(cardCalls) !== JSON.stringify(['SuggestDesignPartsCard:front+back']))
      errors.push(`[f2] ASSERT: parts calls ${JSON.stringify(cardCalls)}`);
    /** Screen point of a region's seed. */
    const reg = async (view, r) => {
      const f = await page.evaluate(
        ([v, r]) => {
          const pv = window.__paint.views.get(v);
          const s = pv.parts.seeds[r];
          return {
            fx: ((s % pv.flat.w) + 0.5) / pv.flat.w,
            fy: (Math.floor(s / pv.flat.w) + 0.5) / pv.flat.h,
          };
        },
        [view, r],
      );
      return at(page, view, f.fx, f.fy);
    };
    const painted = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...window.__paint.views.values()].map((v) => [v.view, v.labels.filter((x) => x).length]),
        ),
      );
    const caption = (view) =>
      page.locator(`[data-paint-side="${view}"] > div:last-child`).innerText();

    // Hover the wearer's left sleeve on the front (viewer's right): the whole part, its name.
    let p = await reg('front', 13);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    const cap = await caption('front');
    console.log(`hover caption: ${cap.replace(/\n/g, ' ')}`);
    if (!/left sleeve/i.test(cap)) errors.push(`[f2] ASSERT: hover caption ${cap}`);
    await shoot(page, 'f2-hover-part-1440.png');

    // Click: front left sleeve + back left sleeve (same name) in one gesture.
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
    await shoot(page, 'f2-transfer-flash-1440.png');
    const one = await painted();
    console.log(`after sleeve click: ${JSON.stringify(one)}`);
    if (!(one.front > 0 && one.back > 0)) errors.push('[f2] ASSERT: sleeve did not travel to back');
    await page.keyboard.press('Meta+z');
    const none = await painted();
    if (none.front !== 0 || none.back !== 0)
      errors.push(`[f2] ASSERT: one undo left ${JSON.stringify(none)}`);
    await page.keyboard.press('Meta+Shift+z');
    const again = await painted();
    if (again.front !== one.front || again.back !== one.back)
      errors.push(`[f2] ASSERT: redo ${JSON.stringify(again)}`);

    // Group: the front's right front [8,10,18] in one click.
    p = await reg('front', 8);
    await page.mouse.click(p.x, p.y);
    p = await reg('front', 7);
    await page.mouse.click(p.x, p.y);
    p = await reg('back', 3);
    await page.mouse.click(p.x, p.y);
    p = await reg('front', 12);
    await page.mouse.click(p.x, p.y);
    await arm(page, 2);
    for (const r of [2, 1, 4, 16, 17, 20]) {
      p = await reg('front', r);
      await page.mouse.click(p.x, p.y);
    }
    await arm(page, 3);
    for (const r of [15, 9]) {
      p = await reg('front', r);
      await page.mouse.click(p.x, p.y);
    }
    // ⌥-click: only the pocket flap's own region, in denim — a cut part.
    await arm(page, 2);
    p = await reg('front', 14);
    await page.keyboard.down('Alt');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up('Alt');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(900);
    await shoot(page, 'f2-painted-1440.png');
    console.log(`painted: ${JSON.stringify(await painted())}`);
    // T18: the run's `parts` are the named parts painted with each label (saved maps).
    await page.waitForFunction(
      () => !document.querySelector('[data-paint-tools]')?.textContent?.includes('saving'),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(1500);
    const run2 = await page.evaluate(() => window.__run());
    console.log(
      `f2 run ${run2.kind}: ${(run2.fabrics || []).map((f) => `${f.name || f.colourHex}{${f.mapHex}: ${f.parts}}`).join(' | ')}`,
    );
    if (!(run2.fabrics || []).some((f) => /sleeve/.test(f.parts)))
      errors.push('[f2] ASSERT: no part names in the run');

    // T13: the cloth mockup of every outgoing map — each cloth at its true repeat (twill 20 mm,
    // check 60 mm, denim unstated → 1/8 of the flat), lines on top; the plan's maps carry none.
    if ((run2.colourMaps || []).some((m) => (m.mockupMediaId ?? 0) > 0))
      errors.push('[f6] ASSERT: the plan carried a mockup');
    const mock = await page.evaluate(async () => {
      const run = window.__run();
      const { ids } = await window.__paint.mockups(run.colourMaps, run.fabrics);
      return {
        uses: run.fabrics.map((f) => `${f.name || f.colourHex}:${f.repeatMm}mm`),
        maps: [...ids].map(([view, id]) => ({ view, id, png: window.__uploads.get(id) })),
      };
    });
    console.log(
      `f6 mockups: ${mock.maps.map((x) => `${x.view}→${x.id}`).join(', ')} · ${mock.uses.join(' | ')}`,
    );
    // Review crit 1: the same maps again → the cached mockups (same ids → same fingerprint).
    // Crit 2: frozen → no gesture, no undo; maps still as saved; a paint after → not as saved.
    const guard = await page.evaluate(async () => {
      const p = window.__paint;
      const run = window.__run();
      const { ids: again } = await p.mockups(run.colourMaps, run.fabrics);
      const rev = p.plan()?.rev;
      const asSaved = p.sendsAsSaved(run.colourMaps, rev);
      p.setFrozen(true);
      const before = [...p.views.values()].map((v) => v.rev).join(',');
      p.apply('front', Int32Array.from([0, 1, 2]));
      p.undo();
      p.clear();
      const after = [...p.views.values()].map((v) => v.rev).join(',');
      const disabled = !!document.querySelector('[data-paint-parts] .pointer-events-none');
      p.setFrozen(false);
      return {
        ids: [...again.values()].join(','),
        asSaved,
        frozenHeld: before === after,
        disabled,
      };
    });
    console.log(`f6 guard: ${JSON.stringify(guard)}`);
    if (guard.ids !== mock.maps.map((x) => x.id).join(','))
      errors.push(`[f6] ASSERT: a second press minted new mockups ${guard.ids}`);
    if (!guard.asSaved) errors.push('[f6] ASSERT: saved maps not seen as saved');
    if (!guard.frozenHeld || !guard.disabled) errors.push('[f6] ASSERT: frozen painting moved');
    if (mock.maps.length !== (run2.colourMaps || []).length)
      errors.push(
        `[f6] ASSERT: ${mock.maps.length} mockups for ${(run2.colourMaps || []).length} maps`,
      );
    {
      const { writeFileSync } = await import('node:fs');
      const { decode, encode } = await import('fast-png');
      const pics = mock.maps.map((x) => decode(Buffer.from(x.png.split(',')[1], 'base64')));
      // One sheet: the sides left to right, 16 px apart, on white.
      const gap = 16;
      const W = pics.reduce((a, p) => a + p.width, 0) + gap * (pics.length - 1);
      const H = Math.max(...pics.map((p) => p.height));
      const out = new Uint8Array(W * H * 4).fill(255);
      let ox = 0;
      for (const p of pics) {
        const ch = p.channels;
        for (let y = 0; y < p.height; y += 1)
          for (let x = 0; x < p.width; x += 1)
            for (let c = 0; c < 4; c += 1)
              out[(y * W + ox + x) * 4 + c] = c < ch ? p.data[(y * p.width + x) * ch + c] : 255;
        ox += p.width + gap;
      }
      writeFileSync(
        resolve(OUT, 'f6-mockup.png'),
        encode({ width: W, height: H, data: out, channels: 4 }),
      );
      shots.push(resolve(OUT, 'f6-mockup.png'));
    }

    // R13: `clear` at the right of the PARTS header wipes every side in one gesture; ⌘Z restores.
    const before = await painted();
    await page.click('[data-paint-clear]');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const cleared = await painted();
    const head = await page.locator('[data-paint-tools]').boundingBox();
    const row = await page.locator('[data-paint-side="back"]').boundingBox();
    await page.screenshot({
      path: resolve(OUT, 'f3-parts-clear.png'),
      clip: { x: 24, y: head.y - 12, width: 1392, height: row.y + row.height * 0.6 - head.y + 12 },
    });
    shots.push(resolve(OUT, 'f3-parts-clear.png'));
    const disabledNow = await page.locator('[data-paint-clear]').isDisabled();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(200);
    const restored = await painted();
    console.log(
      `clear: ${JSON.stringify(before)} → ${JSON.stringify(cleared)} → undo ${JSON.stringify(restored)}; disabled after clear ${disabledNow}`,
    );
    if (cleared.front || cleared.back) errors.push('[f2] ASSERT: clear left paint');
    if (!disabledNow) errors.push('[f2] ASSERT: clear enabled with nothing painted');
    if (restored.front !== before.front || restored.back !== before.back)
      errors.push('[f2] ASSERT: one undo did not restore the clear');

    // A region the model says spans two parts: the hint on hover.
    p = await reg('front', 20);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    const cap2 = await caption('front');
    console.log(`split caption: ${cap2.replace(/\n/g, ' ')}`);
    if (!/no seam/i.test(cap2)) errors.push(`[f2] ASSERT: split caption ${cap2}`);
    await shoot(page, 'f2-split-hover-1440.png');
    await ctx.close();
  }
  {
    // Ф4 (R14/R15): a shirt painted all over in dark cloth — no white bands along the seams, the
    // lines readable on the dark. `--edges=<suffix>` names the shot (before/after).
    const { ctx, page } = await open(1440, 1000, 'f2');
    await page
      .waitForFunction(() => window.__paint.views.get('back')?.parts, null, { timeout: 8000 })
      .catch(() => {});
    await page.click('[data-paint-add-colour]');
    await page.waitForSelector('[data-colour-square]');
    const sq = await page.locator('[data-colour-square]').boundingBox();
    await page.mouse.click(sq.x + sq.width * 0.9, sq.y + sq.height * 0.88);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const every = async (view) => {
      const pts = await page.evaluate((v) => {
        const pv = window.__paint.views.get(v);
        const out = [];
        for (let r = 1; r < pv.parts.seeds.length; r++) {
          const s = pv.parts.seeds[r];
          if (s >= 0)
            out.push({
              fx: ((s % pv.flat.w) + 0.5) / pv.flat.w,
              fy: (Math.floor(s / pv.flat.w) + 0.5) / pv.flat.h,
            });
        }
        return out;
      }, view);
      await page.keyboard.down('Alt');
      for (const { fx, fy } of pts) {
        const p = await at(page, view, fx, fy);
        await page.mouse.click(p.x, p.y);
      }
      await page.keyboard.up('Alt');
    };
    // The dark colour on every region, then denim on the bodies (click = whole named part).
    await every('front');
    await every('back');
    await arm(page, 3);
    for (const [v, fx, fy] of [
      ['front', 0.3, 0.55],
      ['front', 0.7, 0.75],
      ['back', 0.5, 0.55],
    ]) {
      const p = await at(page, v, fx, fy);
      await page.mouse.click(p.x, p.y);
    }
    await page.mouse.move(5, 5);
    await page.waitForTimeout(600);
    const suffix =
      (process.argv.find((a) => a.startsWith('--edges=')) ?? '').slice('--edges='.length) ||
      'after';
    const box = await page.locator('[data-paint-side="front"]').boundingBox();
    const name = `f4-edges-${suffix}.png`;
    await page.screenshot({
      path: resolve(OUT, name),
      clip: {
        x: box.x + box.width * 0.15,
        y: box.y,
        width: box.width * 0.7,
        height: box.height * 0.55,
      },
    });
    shots.push(resolve(OUT, name));
    await ctx.close();
  }
  {
    // Ф3: the magnetic pen on the shirt back — the yoke traced with four clicks (orig px of the
    // 807×851 flat): the preview runs along the armhole and shoulder lines, the click on the
    // first vertex closes it.
    const { ctx, page } = await open(1440, 1000, 'f2');
    const yoke = [
      [194, 178],
      [622, 181],
      [520, 71],
      [330, 70],
    ].map(([x, y]) => [x / 807, y / 851]);
    await arm(page, 2);
    await page.click('[data-paint-tool="pen"]');
    const side = page.locator('[data-paint-side="back"]');
    const clip = async () => {
      const b = await side.boundingBox();
      return { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height * 0.5 };
    };
    for (const [fx, fy] of yoke.slice(0, 2)) await click(page, 'back', fx, fy);
    // Sweep the cursor up to the right neck point, as a hand would.
    for (let k = 1; k <= 6; k++) {
      const p = await at(
        page,
        'back',
        yoke[1][0] + ((yoke[2][0] - yoke[1][0]) * k) / 6,
        yoke[1][1] + ((yoke[2][1] - yoke[1][1]) * k) / 6,
      );
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);
    const pts = await page.evaluate(
      () =>
        document
          .querySelector('[data-paint-side="back"] polygon')
          ?.getAttribute('points')
          ?.split(' ').length ?? 0,
    );
    console.log(`f3 preview: ${pts} points in the pen outline`);
    if (pts < 20) errors.push(`[f3] ASSERT: the preview did not follow the lines (${pts} pts)`);
    await page.screenshot({ path: resolve(OUT, 'f3-pen-preview-1440.png'), clip: await clip() });
    shots.push(resolve(OUT, 'f3-pen-preview-1440.png'));
    for (const [fx, fy] of yoke.slice(2)) await click(page, 'back', fx, fy);
    await click(page, 'back', yoke[0][0], yoke[0][1]);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const yokePx = await page.evaluate(
      () => window.__paint.views.get('back').labels.filter((x) => x).length,
    );
    console.log(`f3 yoke painted: ${yokePx} px`);
    if (yokePx < 1000) errors.push(`[f3] ASSERT: the yoke was not painted (${yokePx} px)`);
    await page.screenshot({ path: resolve(OUT, 'f3-yoke-painted-1440.png'), clip: await clip() });
    shots.push(resolve(OUT, 'f3-yoke-painted-1440.png'));
    await ctx.close();
  }
  {
    // Ф2.1 topology: four sides, a stale front row → ONE card call; hover the collar on FRONT
    // tints the collar on every side; a click paints it everywhere, one ⌘Z takes it all back.
    const { ctx, page } = await open(1440, 1000, 'f5');
    await page
      .waitForFunction(
        () => [...window.__paint.views.values()].every((v) => v.parts?.keyed),
        null,
        { timeout: 8000 },
      )
      .catch(() => errors.push('[f5] ASSERT: not every side got keyed parts'));
    const card = await page.evaluate(() =>
      window.__calls
        .filter((x) => x.name === 'SuggestDesignPartsCard' || x.name === 'SuggestDesignParts')
        .map((x) => ({
          name: x.name,
          views: (x.body.views || []).map((v) => ({
            view: v.view,
            count: v.regionCount,
            marks: window.__uploads.get(v.marksMediaId),
          })),
        })),
    );
    const { writeFileSync } = await import('node:fs');
    for (const v of card[0]?.views ?? []) {
      writeFileSync(
        resolve(OUT, `f5-marks-${v.view}.png`),
        Buffer.from(v.marks.split(',')[1], 'base64'),
      );
      console.log(`f5 marks ${v.view}: ${v.count} regions`);
    }
    if (
      card.length !== 1 ||
      card[0].name !== 'SuggestDesignPartsCard' ||
      card[0].views.length !== 4
    )
      errors.push(
        `[f5] ASSERT: parts calls ${JSON.stringify(card.map((c) => [c.name, c.views.map((v) => v.view)]))}`,
      );
    const seedAt = async (view, r) => {
      const f = await page.evaluate(
        ([v, r]) => {
          const pv = window.__paint.views.get(v);
          const s = pv.parts.seeds[r];
          return {
            fx: ((s % pv.flat.w) + 0.5) / pv.flat.w,
            fy: (Math.floor(s / pv.flat.w) + 0.5) / pv.flat.h,
          };
        },
        [view, r],
      );
      return at(page, view, f.fx, f.fy);
    };
    const collarRegion = (view) =>
      page.evaluate((v) => {
        const p = window.__paint.views.get(v).parts;
        return p.groups.find((g) => g.key === 'collar')?.regions[0] ?? 0;
      }, view);
    const hoverPx = (view) =>
      page.evaluate((v) => {
        const c = document.querySelector(`[data-paint-side="${v}"] canvas:nth-of-type(2)`);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]) n += 1;
        return n;
      }, view);
    const caption = (view) =>
      page.locator(`[data-paint-side="${view}"] > div:last-child`).innerText();
    const r = await collarRegion('front');
    if (!r) errors.push('[f5] ASSERT: no collar on front');
    const p = await seedAt('front', r);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(250);
    const VIEWS = ['front', 'back', 'side_l', 'side_r'];
    const lit = {};
    for (const v of VIEWS) lit[v] = await hoverPx(v);
    const caps = {};
    for (const v of VIEWS) caps[v] = (await caption(v)).replace(/\n/g, ' ');
    console.log(
      `f5 hover collar: tinted px ${JSON.stringify(lit)} captions ${JSON.stringify(caps)}`,
    );
    for (const v of VIEWS) {
      if (!(lit[v] > 0)) errors.push(`[f5] ASSERT: hover did not tint the collar on ${v}`);
      if (!/collar/i.test(caps[v])) errors.push(`[f5] ASSERT: caption on ${v}: ${caps[v]}`);
    }
    await shoot(page, 'f5-topology-hover-collar-1440.png');
    await page.mouse.click(p.x, p.y);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    const painted = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...window.__paint.views.values()].map((v) => [v.view, v.labels.filter((x) => x).length]),
        ),
      );
    const one = await painted();
    console.log(`f5 after collar click: ${JSON.stringify(one)}`);
    for (const v of VIEWS)
      if (!(one[v] > 0)) errors.push(`[f5] ASSERT: collar not painted on ${v}`);
    await shoot(page, 'f5-topology-collar-painted-1440.png');
    await page.keyboard.press('Meta+z');
    const none = await painted();
    if (VIEWS.some((v) => none[v] !== 0))
      errors.push(`[f5] ASSERT: one undo left ${JSON.stringify(none)}`);
    await page.keyboard.press('Meta+Shift+z');
    const again = await painted();
    if (VIEWS.some((v) => again[v] !== one[v]))
      errors.push(`[f5] ASSERT: redo ${JSON.stringify(again)}`);
    // ⌥-click stays one region on one side.
    await page.keyboard.press('Meta+z');
    const sl = await seedAt('back', await collarRegion('back'));
    await page.keyboard.down('Alt');
    await page.mouse.click(sl.x, sl.y);
    await page.keyboard.up('Alt');
    const alt = await painted();
    console.log(`f5 alt-click back collar: ${JSON.stringify(alt)}`);
    if (!(alt.back > 0) || alt.front || alt.side_l || alt.side_r)
      errors.push(`[f5] ASSERT: ⌥-click spread ${JSON.stringify(alt)}`);
    await ctx.close();
  }
  {
    // T23 quick wins: QW5 naming… / pen only, QW1 remainder, QW9 hatch, QW8 focus, QW10 thumbnails.
    const { ctx, page } = await open(1440, 1000, 'f7');
    const header = async (name) => {
      const box = await page.locator('[data-paint-parts]').boundingBox();
      await page.screenshot({
        path: resolve(OUT, name),
        clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
      });
      shots.push(resolve(OUT, name));
    };
    const naming = await page.locator('[data-paint-naming]').count();
    console.log(`f7 naming pill while asked: ${naming}`);
    if (naming !== 1) errors.push('[f7] ASSERT: no naming… while the parts are asked');
    await header('f7-qw5-naming.png');
    await page
      .waitForFunction(() => window.__paint.views.get('front')?.parts?.keyed, null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[f7] ASSERT: front never named'));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      naming: !!document.querySelector('[data-paint-naming]'),
      rename: !!document.querySelector('[data-paint-pieces-toggle]'),
      penOnly: document.querySelector('[data-paint-caption="side_r"]')?.textContent ?? '',
      split: document.querySelector('[data-paint-caption="front"] [data-paint-split]') ? 1 : 0,
      sent: window.__calls
        .filter((c) => c.name === 'SuggestDesignPartsCard')
        .map((c) => c.body.views.map((v) => v.view).join('+')),
    }));
    console.log(`f7 after naming: ${JSON.stringify(after)}`);
    if (after.naming || !after.rename) errors.push('[f7] ASSERT: rename parts not in place');
    if (!/pen only/.test(after.penOnly)) errors.push('[f7] ASSERT: side_r not pen only');
    if (!after.split) errors.push('[f7] ASSERT: no ! by FRONT');
    if (after.sent.some((x) => x.includes('side_r'))) errors.push('[f7] ASSERT: side_r was sent');
    // QW5: CLICK over the pen-only side draws the pen (a vertex), not a fill.
    const sr = await page.locator('[data-paint-side="side_r"] canvas').first().boundingBox();
    await page.mouse.click(sr.x + sr.width * 0.5, sr.y + sr.height * 0.3);
    await page.mouse.move(sr.x + sr.width * 0.7, sr.y + sr.height * 0.5);
    await page.waitForTimeout(200);
    const pen = await page.locator('[data-paint-side="side_r"] [data-paint-pen]').count();
    const filled = await page.evaluate(
      () => window.__paint.views.get('side_r').labels.filter((x) => x).length,
    );
    if (pen !== 1 || filled) errors.push(`[f7] ASSERT: pen-only click pen=${pen} filled=${filled}`);
    await header('f7-qw5-pen-only.png');
    await page.keyboard.press('Escape');
    // QW1: paint the collar in CONTRAST (check) — the rest of the garment shows the REMAINDER
    // (MAIN, rosso twill) muted; the mockup full.
    await page.evaluate(() => {
      const p = window.__paint;
      p.arm([...p.materials][1].label);
    });
    const seed = async (view, key) => {
      const f = await page.evaluate(
        ([v, k]) => {
          const pv = window.__paint.views.get(v);
          const r = pv.parts.groups.find((g) => g.key === k).regions[0];
          const s = pv.parts.seeds[r];
          return {
            fx: ((s % pv.flat.w) + 0.5) / pv.flat.w,
            fy: (Math.floor(s / pv.flat.w) + 0.5) / pv.flat.h,
          };
        },
        [view, key],
      );
      const box = await page.locator(`[data-paint-side="${view}"] canvas`).first().boundingBox();
      return { x: box.x + box.width * f.fx, y: box.y + box.height * f.fy };
    };
    let pt = await seed('front', 'collar');
    await page.mouse.click(pt.x, pt.y);
    // QW6: ⇧-click the back body in DENIM → back only.
    await page.evaluate(() => {
      const p = window.__paint;
      p.arm([...p.materials][2].label);
    });
    pt = await seed('back', 'back-body');
    await page.keyboard.down('Shift');
    await page.mouse.click(pt.x, pt.y);
    await page.keyboard.up('Shift');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    const look = await page.evaluate(() => {
      const p = window.__paint;
      const v = p.views.get('front');
      const c = document.querySelector('[data-paint-side="front"] canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      // An unpainted pixel inside the silhouette, in a region, off the lines.
      let tinted = 0,
        n = 0;
      for (let i = 0; i < v.labels.length; i += 97)
        if (!v.labels[i] && v.flat.silhouette[i] && v.flat.labels[i]) {
          n += 1;
          if (!(d[i * 4] > 245 && d[i * 4 + 1] > 245 && d[i * 4 + 2] > 245)) tinted += 1;
        }
      const sideL = p.views.get('side_l').labels.filter((x) => x).length;
      const back = p.views.get('back').labels.filter((x) => x).length;
      return { remainder: p.remainder(), tinted, n, sideL, back };
    });
    console.log(`f7 remainder: ${JSON.stringify(look)}`);
    if (!look.remainder || look.tinted < look.n * 0.9)
      errors.push(
        `[f7] ASSERT: the unpainted garment is not the remainder ${JSON.stringify(look)}`,
      );
    await header('f7-qw1-remainder.png');
    // QW9: the split region hatched (zoomed).
    {
      const box = await page.locator('[data-paint-side="front"]').boundingBox();
      await page.screenshot({
        path: resolve(OUT, 'f7-qw9-hatch.png'),
        clip: {
          x: box.x,
          y: box.y + box.height * 0.3,
          width: box.width,
          height: box.height * 0.45,
        },
      });
      shots.push(resolve(OUT, 'f7-qw9-hatch.png'));
    }
    // QW8: double-click the BACK caption → BACK alone at the block's width; Esc → back.
    await page.dblclick('[data-paint-caption="back"]');
    await page.waitForTimeout(300);
    const focus = await page.evaluate(() => ({
      sides: document.querySelectorAll('[data-paint-side]').length,
      w: document.querySelector('[data-paint-side="back"]').getBoundingClientRect().width,
    }));
    console.log(`f7 focus: ${JSON.stringify(focus)}`);
    if (focus.sides !== 1) errors.push(`[f7] ASSERT: focus shows ${focus.sides} sides`);
    {
      const box = await page.locator('[data-paint-parts]').boundingBox();
      await page.setViewportSize({ width: 1440, height: Math.ceil(box.y + box.height + 40) });
      await header('f7-qw8-focus.png');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const unfocus = await page.locator('[data-paint-side]').count();
    if (unfocus !== 4) errors.push(`[f7] ASSERT: Esc left ${unfocus} sides`);
    // QW10: WHAT THE MODEL GETS — the maps and their mockups as thumbnails.
    await page.waitForFunction(
      () => !document.querySelector('[data-paint-tools]')?.textContent?.includes('saving'),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__inspect(true));
    await page
      .waitForFunction(() => document.querySelectorAll('[data-map-thumbs] img').length >= 4, null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[f7] ASSERT: no map/mockup thumbnails'));
    await page.waitForTimeout(400);
    const line = await page.locator('[data-sent-colour-maps]').boundingBox();
    if (line) {
      const dlg = await page.locator('[role="dialog"]').first().boundingBox();
      await page.screenshot({
        path: resolve(OUT, 'f7-qw10-wmg.png'),
        clip: {
          x: dlg.x,
          y: Math.max(dlg.y, line.y - 160),
          width: dlg.width,
          height: Math.min(420, line.height + 320),
        },
      });
      shots.push(resolve(OUT, 'f7-qw10-wmg.png'));
      console.log(
        `f7 wmg line: ${(await page.locator('[data-sent-colour-maps]').innerText()).replace(/\n/g, ' ')}`,
      );
    }
    await ctx.close();
  }
  {
    // M6 · `rename parts` opens the card's PIECES list (the closed names of PARTS): a rename and an
    // added piece are saved whole under the rev they were edited on, and the parts are named again;
    // a read of changed flats waits as `new read` (take / keep mine) and never replaces the list.
    const { ctx, page } = await open(1440, 1000, 'f7m6');
    const block = async (name) => {
      const box = await page.locator('[data-paint-parts]').boundingBox();
      await page.screenshot({
        path: resolve(OUT, name),
        clip: {
          x: box.x - 8,
          y: box.y - 8,
          width: box.width + 16,
          height: Math.min(box.height, 260) + 16,
        },
      });
      shots.push(resolve(OUT, name));
    };
    await page
      .waitForFunction(() => window.__paint.views.get('front')?.parts?.keyed, null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[m6] ASSERT: front never named'));
    await page.waitForSelector('[data-paint-pieces-toggle]', { timeout: 8000 }).catch(() => {
      errors.push('[m6] ASSERT: no rename parts once the list is read');
    });
    const closed = await page.locator('[data-paint-pieces]').isVisible();
    if (closed) errors.push('[m6] ASSERT: the pieces row is open before it is asked for');
    await page.click('[data-paint-pieces-toggle]');
    await page.waitForSelector('[data-paint-pieces]');
    await block('m6-pieces-open.png');
    const asks = () =>
      page.evaluate(() => window.__calls.filter((c) => c.name === 'SuggestDesignPartsCard').length);
    const before = await asks();
    await page.click('[data-paint-piece="collar"]');
    await page.fill('[data-paint-piece-input]', 'Collar  Stand');
    await page.keyboard.press('Enter');
    await page.click('[data-paint-piece-add]');
    await page.fill('[data-paint-piece-input]', 'patch pocket');
    await page.keyboard.press('Enter');
    // a reserved name is refused in place (red box), and Esc leaves it
    await page.click('[data-paint-piece-add]');
    await page.fill('[data-paint-piece-input]', 'opening');
    const invalid = await page.locator('[data-paint-piece-input][aria-invalid="true"]').count();
    if (invalid !== 1) errors.push('[m6] ASSERT: «opening» not refused as a piece');
    await page.keyboard.press('Escape');
    await block('m6-pieces-draft.png');
    await page.click('[data-paint-pieces-save]');
    await page
      .waitForFunction(
        (n) => window.__calls.filter((c) => c.name === 'SuggestDesignPartsCard').length > n,
        before,
        {
          timeout: 8000,
        },
      )
      .catch(() => errors.push('[m6] ASSERT: the parts were not named again after the save'));
    const saved = await page.evaluate(() => {
      const c = window.__calls.find((x) => x.name === 'SetDesignPartsPieces');
      return c ? c.body : null;
    });
    console.log(`m6 save: ${JSON.stringify(saved)}`);
    if (
      !saved ||
      saved.expectedRev !== 1 ||
      saved.settleProposal ||
      !saved.names.includes('collar stand') ||
      !saved.names.includes('patch pocket') ||
      saved.names.includes('collar') ||
      saved.names.includes('opening')
    )
      errors.push(`[m6] ASSERT: the save body ${JSON.stringify(saved)}`);
    await page
      .waitForFunction(() => window.__paint.views.get('front')?.parts?.keyed, null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[m6] ASSERT: front not named again'));
    // Another tab saves first (rev 3) while this draft is open: the save is refused, the draft is
    // kept, the list is read again; saving again replaces theirs on purpose (rev 3 → 4).
    await page
      .waitForFunction(() => !document.querySelector('[data-paint-naming]'), null, {
        timeout: 8000,
      })
      .catch(() => {});
    await page.click('[data-paint-piece-add]');
    await page.fill('[data-paint-piece-input]', 'hem band');
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const p = window.__band.partsPieces;
      window.__band.partsPieces = { ...p, rev: p.rev + 1, pieces: [...p.pieces, { name: 'belt' }] };
    });
    await page.click('[data-paint-pieces-save]');
    await page.waitForTimeout(600);
    const conflict = await page.evaluate(() => ({
      calls: window.__calls
        .filter((x) => x.name === 'SetDesignPartsPieces')
        .map((x) => x.body.expectedRev),
      kept: !!document.querySelector('[data-paint-piece="hem band"]'),
      theirs: !!document.querySelector('[data-paint-piece="belt"]'),
    }));
    console.log(`m6 conflict: ${JSON.stringify(conflict)}`);
    if (!conflict.kept || JSON.stringify(conflict.calls) !== '[1,2]')
      errors.push(
        `[m6] ASSERT: a refused save lost the draft or was not refused ${JSON.stringify(conflict)}`,
      );
    await page.click('[data-paint-pieces-save]');
    await page.waitForTimeout(600);
    const over = await page.evaluate(
      () => window.__calls.filter((x) => x.name === 'SetDesignPartsPieces').pop()?.body,
    );
    if (
      !over ||
      over.expectedRev !== 3 ||
      !over.names.includes('hem band') ||
      over.names.includes('belt')
    )
      errors.push(`[m6] ASSERT: saving again did not replace theirs ${JSON.stringify(over)}`);
    await page
      .waitForFunction(() => window.__paint.views.get('front')?.parts?.keyed, null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[m6] ASSERT: front not named again after the replace'));
    // A read of changed flats arrives: it is a proposal — the list stays, the rev moves (a settle is
    // tied to it), the pill turns blue.
    await page.evaluate(() => {
      window.__band.partsPieces = {
        ...window.__band.partsPieces,
        rev: window.__band.partsPieces.rev + 1,
        proposal: {
          pieces: [{ name: 'collar' }, { name: 'left front body' }, { name: 'back yoke' }],
          openings: [],
          model: 'anthropic/claude-sonnet-5.5',
        },
      };
      return window.__paint.qc.invalidateQueries();
    });
    await page.waitForSelector('[data-paint-pieces-proposal]', { timeout: 8000 }).catch(() => {
      errors.push('[m6] ASSERT: the new read is not shown');
    });
    const pill = await page.locator('[data-paint-pieces-toggle]').innerText();
    if (!/new read/i.test(pill)) errors.push(`[m6] ASSERT: the pill says «${pill}»`);
    await block('m6-pieces-new-read.png');
    await page.click('[data-paint-pieces-keep]');
    await page
      .waitForFunction(() => !document.querySelector('[data-paint-pieces-proposal]'), null, {
        timeout: 8000,
      })
      .catch(() => errors.push('[m6] ASSERT: keep mine left the new read'));
    const kept = await page.evaluate(
      () => window.__calls.filter((x) => x.name === 'SetDesignPartsPieces').pop()?.body,
    );
    console.log(`m6 keep: ${JSON.stringify(kept)}`);
    if (
      !kept ||
      !kept.settleProposal ||
      kept.expectedRev !== 5 ||
      JSON.stringify(kept.names) !== JSON.stringify(over?.names) ||
      kept.names.includes('collar')
    )
      errors.push(`[m6] ASSERT: keep mine sent ${JSON.stringify(kept)}`);
    await block('m6-pieces-kept.png');
    await ctx.close();
  }
  {
    // Ф2: a refused SuggestDesignParts shows `parts · retry`.
    const { ctx, page } = await open(1440, 1000, 'f2fail');
    await page
      .waitForSelector('[data-paint-parts-retry]', { timeout: 8000 })
      .catch(() => errors.push('[f2fail] ASSERT: no parts · retry'));
    // One `parts · retry` for the block, in the PARTS header (not one per side).
    const n = await page.locator('[data-paint-parts-retry]').count();
    if (n !== 1) errors.push(`[f2fail] ASSERT: ${n} retry pills`);
    const box = await page.locator('[data-paint-parts] > div').first().boundingBox();
    await page.screenshot({
      path: resolve(OUT, 'f2-retry-1440.png'),
      clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
    });
    shots.push(resolve(OUT, 'f2-retry-1440.png'));
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
