#!/usr/bin/env node
// ПЛИТКА: ОДИН КЛИК ИЛИ ДВА (hotfix HX2; design/picture-tile.tsx).
//
// Где одиночный клик занят `onOpen` (выбор, раскрытие колоды, пипетка), двойной клик открывает
// зум и НЕ зовёт `onOpen` вовсе; одиночный клик зовёт его ровно раз, после короткого таймера.
// Плитка без зума зовёт `onOpen` сразу. Настоящий ввод мыши (Playwright), не dispatchEvent.
//
//   node scripts/picture-tile-click-probe.mjs
//   node scripts/picture-tile-click-probe.mjs --mutate   вернуть прежнюю проводку (onOpen на click)
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
const MUTATE = process.argv.includes('--mutate');

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
        const nope = () => Promise.resolve({});
        export const adminService = new Proxy({}, { get: () => nope });
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

// Мутация в памяти сборщика: проводка поверхности до HX2 (`onOpen` на каждый click, зум на dblclick).
const FIX = 'onClick={\n                arbitrates\n                  ? arbitratedClick\n';
const mutation = {
  name: 'tile-click-mutation',
  setup(b) {
    b.onLoad({ filter: /design\/picture-tile\.tsx$/ }, async (a) => {
      const src = await readFile(a.path, 'utf8');
      if (!src.includes(FIX)) throw new Error('мутация не нашла свою строку');
      return {
        contents: src.replace(
          FIX,
          'onClick={\n                false\n                  ? arbitratedClick\n',
        ),
        loader: 'tsx',
      };
    });
  },
};

const outfile = resolve(tmpdir(), `picture-tile-click-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'picture-tile-click-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: MUTATE ? [stubNetwork, mutation] : [stubNetwork],
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="arb"] [data-picture-tile]');
  const state = () => page.$eval('#state', (el) => JSON.parse(el.textContent));
  const centre = async (which) => {
    const r = await page.$eval(`[data-probe="${which}"] [data-picture-tile]`, (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    return r;
  };
  const dialogs = () => page.$$eval('[role="dialog"]', (n) => n.length);

  // A · одиночный клик по плитке с `onOpen` и зумом: ровно один вызов, после таймера, без зума.
  const a = await centre('arb');
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(450);
  check(
    'A1 single click → onOpen exactly once',
    (await state()).arb === 1,
    JSON.stringify(await state()),
  );
  check('A2 single click opens no viewer', (await dialogs()) === 0);

  // B · двойной клик: зум открыт, `onOpen` не звался ни разу (переключатель не щёлкнул дважды).
  await page.mouse.dblclick(a.x, a.y);
  await page.waitForTimeout(450);
  check('B1 double click → viewer opens', (await dialogs()) > 0);
  check(
    'B2 double click → onOpen not called',
    (await state()).arb === 1,
    JSON.stringify(await state()),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // C · плитка без зума: `onOpen` сразу, не по таймеру.
  const p = await centre('plain');
  await page.mouse.click(p.x, p.y);
  const early = (await state()).plain;
  check('C1 tile without zoom → onOpen immediately', early === 1, `plain=${early}`);
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`picture-tile-click: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
