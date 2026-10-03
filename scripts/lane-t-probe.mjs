#!/usr/bin/env node
// ЛЕЙН T (03.10): отмена прогона в полёте (T23), сид рамок попапа SPLIT из истории (R(a)), встроенный
// сплит и куски-после-реза на верстаке FABRIC RENDER (R(b)), принесённые рендеры (R(c)).
// Настоящие `LatestGeneration` / `GenerationHistory` над поддельными полосами (scripts/lane-t-entry.tsx).
//
//   node scripts/lane-t-probe.mjs [--shot=out.png]
//   node scripts/lane-t-probe.mjs --mutate=<name> — каждая мутация краснеет (список в MUTATIONS)
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
        const nope = () => Promise.resolve({});
        window.__calls = [];
        export const adminService = new Proxy({}, { get: (_, name) => (body) => {
          window.__calls.push({ name: String(name), body: JSON.parse(JSON.stringify(body ?? {})) });
          return Promise.resolve({});
        } });
        export const requestHandler = (req) => {
          window.__calls.push({ name: 'requestHandler', body: req });
          return Promise.resolve({});
        };
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

// Мутации в памяти сборщика: каждая возвращает одно снятое поведение обратно.
const MUTATIONS = {
  // T23: у ячейки прогона в полёте снова нет угла `cancel`.
  'cancel-corner': {
    file: /generation\/live-tiles\.tsx$/,
    from: '{i === 0 && canCancel && (',
    to: '{false && (',
  },
  // T23: угол есть, но зовёт не тот прогон.
  'cancel-wire': {
    file: /generation\/live-tiles\.tsx$/,
    from: 'onClick={() => cancelRun.mutate(runId)}',
    to: 'onClick={() => cancelRun.mutate(0)}',
  },
  // T23: штамп отмены не снимает угол и не ставит флаг.
  'cancel-flag': {
    file: /generation\/live-tiles\.tsx$/,
    from: 'const cancelling = isCancelling(run) || asked;',
    to: 'const cancelling = false && (isCancelling(run) || asked);',
  },
  // R(a): the popup seeds from `composite_views` again (empty on beta's `one` sheets).
  'popup-seed': {
    file: /split-modal\.tsx$/,
    from: '    forInput,\n    views,\n    active: open,',
    to: '    forInput,\n    active: open,',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `lane-t-${name}`,
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

const outfile = resolve(tmpdir(), `lane-t-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'lane-t-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="flat-running"] [data-latest-generation]');
  await page.waitForTimeout(300);

  const SHOT = (process.argv.find((a) => a.startsWith('--shot=')) ?? '').slice('--shot='.length);
  const P = (name) => `[data-probe="${name}"]`;
  const calls = (name) =>
    page.evaluate((n) => window.__calls.filter((c) => c.name === n).map((c) => c.body), name);
  const openFold = async (probe) => {
    const h =
      (await page.$(`${P(probe)} [data-history-fold="closed"]`)) ??
      (await page.$(
        `${P(probe)} button[aria-expanded="false"][aria-controls="design-history-runs"]`,
      ));
    if (h) await h.click();
    await page.waitForTimeout(150);
  };

  // ══ T23 · CANCEL A RUN IN FLIGHT ══
  const live = await page.$$(`${P('flat-running')} [data-live-tile]`);
  const corners = await page.$$(`${P('flat-running')} [data-run-cancel]`);
  check(
    'T23.1 bench: two reserved cells, one `cancel` corner',
    live.length === 2 && corners.length === 1,
    `${live.length}/${corners.length}`,
  );
  const inFirst = await page.$eval(`${P('flat-running')} [data-live-tile]`, (el) => {
    const c = el.querySelector('[data-run-cancel]');
    if (!c) return null;
    const a = el.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return {
      word: c.textContent.trim(),
      right: Math.round(a.right - b.right),
      bottom: Math.round(a.bottom - b.bottom),
    };
  });
  check(
    "T23.2 the corner is the first cell's, bottom-right, the word `cancel`",
    !!inFirst && inFirst.word === 'cancel' && inFirst.right <= 8 && inFirst.bottom <= 8,
    JSON.stringify(inFirst),
  );
  const rest = await page
    .$eval(`${P('flat-running')} [data-run-cancel]`, (el) => getComputedStyle(el).opacity)
    .catch(() => 'none');
  await page.hover(`${P('flat-running')} [data-live-tile]`);
  await page.waitForTimeout(200);
  const hovered = await page
    .$eval(`${P('flat-running')} [data-run-cancel]`, (el) => getComputedStyle(el).opacity)
    .catch(() => 'none');
  check(
    'T23.3 quiet: hidden at rest, shown on hover',
    rest === '0' && hovered === '1',
    `${rest} → ${hovered}`,
  );
  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });
  const benchCorner = await page.$(`${P('flat-running')} [data-run-cancel]`);
  if (benchCorner) await benchCorner.click();
  await page.waitForTimeout(200);
  check(
    'T23.4 bench: the press sends CancelDesignRun for run 50',
    JSON.stringify(await calls('CancelDesignRun')) === JSON.stringify([{ runId: 50 }]),
    JSON.stringify(await calls('CancelDesignRun')),
  );
  check(
    'T23.5 answered: the corner goes, `cancelling…` stands',
    !(await page.$(`${P('flat-running')} [data-run-cancel]`)) &&
      !!(await page.$(`${P('flat-running')} [data-flag="cancelling…"]`)),
  );
  const pendingTitle = await page
    .$eval(`${P('flat-pending')} [data-run-cancel]`, (el) => el.title)
    .catch(() => '');
  check(
    'T23.6 a pending run offers the same corner',
    /before it starts/.test(pendingTitle),
    pendingTitle,
  );
  check(
    'T23.7 cancel requested: no corner, the flag `cancelling…`',
    !(await page.$(`${P('flat-cancelling')} [data-run-cancel]`)) &&
      !!(await page.$(`${P('flat-cancelling')} [data-flag="cancelling…"]`)),
  );
  check(
    'T23.8 a late result after the stamp is drawn as an ordinary tile',
    !!(await page.$(`${P('flat-late')} [data-picture="531"] [data-picture-tile]`)) &&
      !(await page.$(`${P('flat-late')} [data-live-tile]`)),
  );
  check(
    'T23.9 read-only card: no corner',
    !!(await page.$(`${P('flat-readonly')} [data-live-tile]`)) &&
      !(await page.$(`${P('flat-readonly')} [data-run-cancel]`)),
  );

  await openFold('flat-history');
  const hc = await page.$$(`${P('flat-history')} [data-run="55"] [data-run-cancel]`);
  check('T23.10 FLAT history grid: one corner on the live row', hc.length === 1, String(hc.length));
  if (hc[0]) {
    await page.hover(`${P('flat-history')} [data-run="55"] [data-live-tile]`);
    await hc[0].click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.11 FLAT history: the press cancels run 55',
    (await calls('CancelDesignRun')).some((b) => b.runId === 55),
  );

  const rb = await page.$(`${P('render-bench')} [data-run-cancel="56"]`);
  check('T23.12 FABRIC RENDER bench: the corner', !!rb);
  if (rb) {
    await page.hover(`${P('render-bench')} [data-live-tile]`);
    await rb.click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.13 FABRIC RENDER bench: the press cancels run 56',
    (await calls('CancelDesignRun')).some((b) => b.runId === 56),
  );
  await openFold('render-history');
  const rh = await page.$(`${P('render-history')} [data-run="57"] [data-run-cancel]`);
  check('T23.14 FABRIC RENDER history grid: the corner', !!rh);
  if (rh) {
    await page.hover(`${P('render-history')} [data-run="57"] [data-live-tile]`);
    await rh.click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.15 FABRIC RENDER history: the press cancels run 57',
    (await calls('CancelDesignRun')).some((b) => b.runId === 57),
  );

  // ══ R(a) · THE HISTORY'S SPLIT POPUP SEEDS ITS FRAMES FROM THE TILE'S READING ══
  await openFold('history-popup');
  const split = await page.$(
    `${P('history-popup')} [data-picture="601"] button[aria-label^="split"]`,
  );
  check('Ra.1 the history row offers SPLIT on the uncut `one` sheet', !!split);
  if (split) {
    await page.hover(`${P('history-popup')} [data-picture="601"]`);
    await split.click();
    await page
      .waitForSelector('[role="dialog"] [data-split-frame]', { timeout: 3000 })
      .catch(() => {});
  }
  const seeded = await page.$$eval('[role="dialog"] [data-split-chip]', (els) =>
    els.map((e) => e.innerText.trim()),
  );
  check(
    'Ra.2 the popup opens with FRONT / BACK / SIDE LEFT / SIDE RIGHT frames',
    JSON.stringify(seeded) === JSON.stringify(['FRONT', 'BACK', 'SIDE LEFT', 'SIDE RIGHT']),
    JSON.stringify(seeded),
  );

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`lane-t: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
