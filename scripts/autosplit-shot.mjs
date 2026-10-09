#!/usr/bin/env node
// СТЕНД АВТО-СПЛИТА НА ВЕРСТАКЕ (T26, R19) — `scripts/autosplit-stand-entry.tsx`: настоящий
// `LatestGeneration` над двумя листами беты. Уверенный лист (run-70, 4 вида) режется сам — один
// SplitDesignPicture с видами по порядку, for_input false — и после «перечитывания» полосы стоят
// четыре куска; неуверенный (run-57, спрошено 3) только засеян. Снимки shots/f8-autosplit*.png.
//
//   node scripts/autosplit-shot.mjs     (нужен `yarn build` — CSS из dist)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SHOTS = resolve(REPO, '../tmp/plans/paint-parts/shots');
const SHEETS = resolve(REPO, '../tmp/plans/paint-parts/autosplit');
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
          if (name === 'SplitDesignPicture') return window.__split(body);
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

const outfile = resolve(tmpdir(), `autosplit-stand-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'autosplit-stand-entry.tsx')],
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
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/index-*.css не найден — соберите `yarn build`; стенд пропущен');
  process.exit(0);
}
const sheet = (name) => {
  const b = readFileSync(resolve(SHEETS, `${name}-0-og.png`));
  return {
    url: `data:image/png;base64,${b.toString('base64')}`,
    w: b.readUInt32BE(16),
    h: b.readUInt32BE(20),
  };
};
const SHEET_DATA = { 'run-70': sheet('run-70'), 'run-57': sheet('run-57') };

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1500 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate((s) => {
    window.__sheets = s;
  }, SHEET_DATA);
  await page.addScriptTag({ content: bundle });

  // the sheet lands: the detector reads it and the cut goes by itself
  await page.waitForSelector('[data-probe="auto"] [data-split-autocut="31"]', { timeout: 30000 });
  await page.screenshot({ path: resolve(SHOTS, 'f8-autosplit-cutting.png'), fullPage: true });
  const call = await page.evaluate(() =>
    window.__calls.filter((c) => c.name === 'SplitDesignPicture'),
  );
  check('A1 one SplitDesignPicture, by itself', call.length === 1, String(call.length));
  const body = call[0]?.body ?? {};
  check(
    'A2 views in composite order, for_input false',
    JSON.stringify((body.frames ?? []).map((f) => f.viewKey)) ===
      JSON.stringify(['front', 'side_l', 'back', 'side_r']) && body.forInput === false,
    JSON.stringify((body.frames ?? []).map((f) => [f.viewKey, f.x.value, f.w.value])),
  );
  // the band re-read brings the pieces
  await page.waitForSelector('[data-probe="auto"] [data-picture-tile]', { timeout: 30000 });
  await page.waitForTimeout(500);
  const tiles = await page.$$('[data-probe="auto"] [data-picture-tile]');
  check('A3 the four pieces stand on the bench', tiles.length === 4, String(tiles.length));
  check(
    'A4 no editor left over the cut sheet',
    !(await page.$('[data-probe="auto"] [data-inline-split]')),
  );
  check(
    'U1 the unsure sheet is not cut, its frames seeded',
    (await page.$eval('[data-probe="unsure"] [data-split-auto]', (e) => e.dataset.splitAuto)) ===
      'unsure' &&
      (await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'SplitDesignPicture').length,
      )) === 1,
  );
  await page.screenshot({ path: resolve(SHOTS, 'f8-autosplit.png'), fullPage: true });
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `autosplit stand: ${fail} failed` : 'autosplit stand: all ok');
process.exit(fail ? 1 : 0);
