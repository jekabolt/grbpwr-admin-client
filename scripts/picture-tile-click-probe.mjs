#!/usr/bin/env node
// ПЛИТКА: ОДИН КЛИК ИЛИ ДВА (hotfix HX2; design/picture-tile.tsx).
//
// Где одиночный клик занят `onOpen` (выбор, раскрытие колоды, пипетка), двойной клик открывает
// зум и НЕ зовёт `onOpen` вовсе; одиночный клик зовёт его ровно раз, после короткого таймера.
// Плитка без зума зовёт `onOpen` сразу. Настоящий ввод мыши (Playwright), не dispatchEvent.
//
//   node scripts/picture-tile-click-probe.mjs
//   node scripts/picture-tile-click-probe.mjs --mutate          вернуть прежнюю проводку (onOpen на click)
//   node scripts/picture-tile-click-probe.mjs --mutate-window   окно 200 мс: медленный двойной (D) краснеет
//
// D/E (лейн P): двойной клик — это второй клик ВНУТРИ окна жеста, а не родной `dblclick` и не
// `detail` от ОС. Медленный двойной (250 мс) открывает зум без `onOpen`; два клика через 600 мс —
// два одиночных, даже если ОС назвала второй «двойным» (clickCount 2).
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
const MUTATE_WINDOW = process.argv.includes('--mutate-window');

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

const WINDOW_FIX = 'const CLICK_WINDOW_MS = 350;';
const windowMutation = {
  name: 'tile-window-mutation',
  setup(b) {
    b.onLoad({ filter: /design\/picture-tile\.tsx$/ }, async (a) => {
      const src = await readFile(a.path, 'utf8');
      if (!src.includes(WINDOW_FIX)) throw new Error('мутация окна не нашла свою строку');
      return { contents: src.replace(WINDOW_FIX, 'const CLICK_WINDOW_MS = 200;'), loader: 'tsx' };
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
  plugins: MUTATE
    ? [stubNetwork, mutation]
    : MUTATE_WINDOW
      ? [stubNetwork, windowMutation]
      : [stubNetwork],
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
  // ВТОРОЕ нажатие пары, как его шлёт ОС: ОДНО нажатие с clickCount 2 (браузер даёт click detail=2
  // и dblclick). `mouse.click({clickCount: 2})` не годится — Playwright шлёт им ДВА нажатия.
  const secondPress = async (at) => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
  };
  const dialogs = () => page.$$eval('[role="dialog"]', (n) => n.length);

  // A · одиночный клик по плитке с `onOpen` и зумом: ровно один вызов, после таймера, без зума.
  const a = await centre('arb');
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(550);
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
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.waitForTimeout(400);

  // D · медленный двойной клик (250 мс между нажатиями — дольше прежних 220, короче окна ОС):
  // зум открыт, `onOpen` не звался.
  const before = (await state()).arb;
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(250);
  await secondPress(a);
  await page.waitForTimeout(550);
  check('D1 slow double click → viewer opens', (await dialogs()) > 0);
  check(
    'D2 slow double click → onOpen not called',
    (await state()).arb === before,
    JSON.stringify(await state()),
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.waitForTimeout(400);

  // E · два клика через 600 мс: окно кончилось — это два одиночных, хотя ОС назвала второй
  // двойным (clickCount 2) и браузер шлёт `dblclick`. Зума нет.
  const before2 = (await state()).arb;
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(600);
  await secondPress(a);
  await page.waitForTimeout(550);
  check(
    'E1 clicks outside the window → onOpen twice',
    (await state()).arb === before2 + 2,
    JSON.stringify(await state()),
  );
  check('E2 clicks outside the window → no viewer', (await dialogs()) === 0);

  // C · плитка без зума: `onOpen` сразу, не по таймеру.
  const p = await centre('plain');
  await page.mouse.click(p.x, p.y);
  const early = (await state()).plain;
  check('C1 tile without zoom → onOpen immediately', early === 1, `plain=${early}`);

  // V · лицо-клип (TF1): зум-угла нет, контролы видео живы, большой вид — двойным кликом по
  // картинке (не по полосе контролов) и скрытым `open large` с клавиатуры.
  const V = '[data-probe="clip"]';
  check('V1 clip: a <video> with controls', !!(await page.$(`${V} video[controls]`)));
  check(
    'V2 clip: no zoom button, no surface over the controls',
    (await page.$$(`${V} button[aria-label^="zoom"], ${V} [data-tile-surface]`)).length === 0,
  );
  const vb = await page.$eval(`${V} video`, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, top: b.y + 30, bottom: b.y + b.height - 10 };
  });
  await page.mouse.dblclick(vb.x, vb.bottom);
  await page.waitForTimeout(300);
  check('V3 double click on the controls bar → no viewer', (await dialogs()) === 0);
  await page.mouse.dblclick(vb.x, vb.top);
  await page.waitForTimeout(300);
  check('V4 double click on the clip → viewer opens', (await dialogs()) > 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.waitForTimeout(300);
  const door = await page.$(`${V} [data-open-large]`);
  const doorBox = door ? await door.boundingBox() : null;
  check(
    'V5 `open large` is visually hidden',
    !!door && (!doorBox || doorBox.width <= 1 || doorBox.height <= 1),
    JSON.stringify(doorBox),
  );
  if (door) {
    await door.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  check('V6 keyboard: `open large` + Enter → viewer opens', (await dialogs()) > 0);
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`picture-tile-click: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
