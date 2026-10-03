#!/usr/bin/env node
// УГЛОВЫЕ МЕНЮ ПЛИТОК — ГЕЙТ ВОЛНЫ ПЛИТОК (TF2–TF4). Настоящие компоненты над поддельной полосой
// (`tile-menu-entry.tsx`). Сеть — прокси: вызовы пишутся в `window.__calls`, а метод, названный в
// `window.__hold`, ждёт `window.__release(name)` — так проба держит запись или перечитывание полосы
// «в полёте» и смотрит, что делает меню в это время.
//
//   TF2 · ✕ не удаляет: на карусели LAST FABRICS и на сетке CLOTHS ✕ нет; удаление — последняя
//         красная строка `delete…` меню (без пар — `more ▾` с ней одной) и ВСЕГДА спрашивает.
//
//   node scripts/tile-menu-probe.mjs
//   node scripts/tile-menu-probe.mjs --mutate=<имя>   — каждая мутация краснеет (список — MUTATIONS)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTANT = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').slice(
  '--mutate='.length,
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
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        window.__calls = [];
        window.__hold = {};
        window.__held = {};
        window.__release = (name) => {
          const list = window.__held[name] || [];
          window.__held[name] = [];
          list.forEach((go) => go());
          return list.length;
        };
        const answer = (name) =>
          name === 'GetDesignBand' ? JSON.parse(JSON.stringify(window.__band || {})) : {};
        const call = (name) => (body) => {
          window.__calls.push({ name, body: JSON.parse(JSON.stringify(body ?? {})) });
          if (!window.__hold[name]) return Promise.resolve(answer(name));
          return new Promise((resolve) => {
            (window.__held[name] = window.__held[name] || []).push(() => resolve(answer(name)));
          });
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

// Мутации в памяти сборщика: каждая возвращает одну снятую починку обратно.
const MUTATIONS = {
  // TF2: строка delete… карусели удаляет без вопроса (прежний путь ненадетой ткани).
  fabricask: {
    file: /pattern\/fabric-carousel\.tsx$/,
    from: 'if (value === DELETE_ITEM) return setAsking(true);',
    to: 'if (value === DELETE_ITEM) return deleteAsset.mutate(id);',
  },
  // TF2: строка delete… сетки CLOTHS удаляет без вопроса.
  paletteask: {
    file: /render\/palette\.tsx$/,
    from: 'onPick: () => setPendingRemove(a),',
    to: 'onPick: () => writes.deleteAsset.mutate(id),',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `tile-menu-${name}`,
    setup(b) {
      b.onLoad({ filter: m.file }, async (a) => {
        const src = await readFile(a.path, 'utf8');
        if (!src.includes(m.from)) throw new Error(`мутация ${name} не нашла свою строку`);
        return {
          contents: src.replace(m.from, m.to),
          loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts',
        };
      });
    },
  };
}

const outfile = resolve(tmpdir(), `tile-menu-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tile-menu-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: MUTANT ? [stubNetwork, mutationPlugin(MUTANT)] : [stubNetwork],
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

// Собранная CSS админки: без неё у поверхности (`absolute inset-0`) нет размера и клик мимо.
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/index-*.css не найден — соберите `yarn build`; проба пропущена');
  process.exit(0);
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="palette"] [data-picture-tile]');
  const calls = (re) =>
    page.evaluate((s) => window.__calls.filter((c) => new RegExp(s).test(c.name)), re.source);
  const dialog = () => page.$('[role="dialog"]');
  const closeDialog = async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]')).catch(() => {});
    await page.waitForTimeout(150);
  };
  /** Open a tile's corner menu and read its rows: [value, text, red?]. */
  const rowsOf = async (tile, menu) => {
    await page.hover(tile);
    await page.click(menu);
    await page.waitForSelector('[role="listbox"]');
    return page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => [
        e.getAttribute('data-menu-item'),
        e.textContent.trim(),
        e.className.includes('text-error'),
      ]),
    );
  };
  const xs = (scope) =>
    page.$$eval(
      `${scope} [data-picture-tile] button`,
      (bs) =>
        bs.filter(
          (b) =>
            b.textContent.trim() === '✕' ||
            /^(delete|remove) /.test(b.getAttribute('aria-label') ?? ''),
        ).length,
    );

  // ── TF2 · LAST FABRICS ──
  const F = '[data-probe="fabric"]';
  check('F1 fabric tiles: no ✕, no delete button in the frame', (await xs(F)) === 0);
  const free = await rowsOf(`${F} [data-fabric-tile="202"]`, `${F} [data-menu="use-for:202"]`);
  const last = free[free.length - 1] ?? [];
  check(
    'F2 `delete…` is the last, red row of `use for ▾`',
    last[0] === '__delete' && last[1] === 'delete…' && last[2] === true,
    JSON.stringify(free),
  );
  await page.click('[data-menu-item="__delete"]');
  await page.waitForTimeout(200);
  const d1 = await dialog();
  check(
    'F3 delete on a free fabric asks first',
    !!d1 && /delete a fabric/.test((await d1.textContent()) ?? ''),
  );
  check('F4 the question alone deletes nothing', (await calls(/DeleteDesignAsset/)).length === 0);
  if (d1) {
    await page.click('[role="dialog"] button:has-text("delete the fabric")');
    await page.waitForTimeout(250);
  }
  const del = await calls(/DeleteDesignAsset/);
  check(
    'F5 confirm → DeleteDesignAsset {assetId 202}',
    del.length === 1 && del[0].body.assetId === 202,
    JSON.stringify(del),
  );
  await page.keyboard.press('Escape');
  const worn = await rowsOf(`${F} [data-fabric-tile="201"]`, `${F} [data-menu="use-for:201"]`);
  await page.click('[data-menu-item="__delete"]').catch(() => {});
  await page.waitForTimeout(200);
  const d2 = await dialog();
  check(
    'F6 a worn fabric asks with its slots named',
    !!d2 &&
      /in use/.test((await d2.textContent()) ?? '') &&
      /ROSSO · outer/.test((await d2.textContent()) ?? ''),
    JSON.stringify(worn),
  );
  await closeDialog();

  // ── TF2 · сервер без привязок: `more ▾` с одним delete ──
  const N = '[data-probe="nobind"]';
  const nb = await rowsOf(`${N} [data-fabric-tile="202"]`, `${N} [data-menu="more:202"]`).catch(
    () => [],
  );
  check(
    'N1 no pairs → the corner is `more ▾` holding only `delete…`',
    nb.length === 1 && nb[0][0] === '__delete' && nb[0][1] === 'delete…',
    JSON.stringify(nb),
  );
  check(
    'N2 it reads «more ▾»',
    (await page
      .$eval(`${N} [data-menu="more:202"]`, (e) => e.textContent.trim())
      .catch(() => '')) === 'more ▾',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ── TF2 · CLOTHS ──
  const P = '[data-probe="palette"]';
  check('P1 cloth tiles: no ✕, no delete button in the frame', (await xs(P)) === 0);
  const before = (await calls(/DeleteDesignAsset/)).length;
  const pr = await rowsOf(`${P} [data-texture="202"]`, `${P} [data-menu="more:202"]`).catch(
    () => [],
  );
  check(
    'P2 `more ▾` holds only the red `delete…`',
    pr.length === 1 && pr[0][1] === 'delete…' && pr[0][2] === true,
    JSON.stringify(pr),
  );
  await page.click('[data-menu-item="delete"]').catch(() => {});
  await page.waitForTimeout(200);
  check('P3 delete on a cloth asks first', !!(await dialog()));
  check(
    'P4 the question alone deletes nothing',
    (await calls(/DeleteDesignAsset/)).length === before,
  );
  await closeDialog();

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`tile-menu: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
