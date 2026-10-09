#!/usr/bin/env node
// ПЛИТКА ЭСКИЗА НА АНАТОМИИ (лейн N2; sketch-tab.tsx, 20-TILE-SPEC §3).
//
// Владелец: «везде где у нас есть подобные блоки картинок с разметкой … по одной логике». Под
// кадром эскиза стояли селект `kind` и плашка `preview`. Теперь: вид — в ярлыке (`1 · front`,
// всегда) и угол-меню `front ▾` (тихий, внизу справа), `preview` — флаг первого кадра.
//
//   node scripts/sketch-tile-probe.mjs              (нужен `yarn build` — CSS из dist)
//   node scripts/sketch-tile-probe.mjs --mutate=write|badge|watch   — каждая краснеет
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

// Мутации в памяти сборщика.
const ST = /components\/sketch-tab\.tsx$/;
const MUTATIONS = {
  // выбор в меню не пишет форму.
  write: {
    file: ST,
    from: 'setValue(`${listName}.${i}.kind`, value as common_TechCardMediaKind, {',
    to: '(void value, setValue)(`${listName}.${i}.kind` as never, undefined as never, {',
  },
  // ярлык снова только номер: вид в покое не виден.
  badge: {
    file: ST,
    from: "tileBadge={(_, i) => kindLabels[listValues[i]?.kind ?? ''] ?? null}",
    to: 'tileBadge={() => null}',
  },
  // меню вида — без подписчика корня: после выбора ярлык не узнаёт новый вид.
  watch: {
    file: ST,
    from: "const kind = listValues[i]?.kind ?? '';",
    to: "const kind = mediaFA.fields[i]?.kind ?? '';",
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `sketch-tile-${name}`,
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

const outfile = resolve(tmpdir(), `sketch-tile-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'sketch-tile-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="live"] [data-rail-view="11"]');
  const L = '[data-probe="live"]';
  const badges = (probe) =>
    page.$$eval(`[data-probe="${probe}"] [data-tile-badge]`, (els) =>
      els.map((e) => e.textContent.trim()),
    );

  // ── НИЧЕГО ПОД КАДРОМ ──
  check(
    'U1 no select / combobox in the gallery',
    (await page.$$(`${L} select, ${L} [role="combobox"]`)).length === 0,
  );
  const text = await page.$eval(L, (el) => el.innerText);
  check('U2 no «kind» label anywhere', !/\bkind\b/i.test(text), JSON.stringify(text.slice(0, 200)));
  const previews = await page.$$eval(`${L} [data-rail-view]`, (tiles) =>
    tiles.map((t) =>
      [...t.querySelectorAll('*')]
        .filter((n) => n.children.length === 0 && n.textContent.trim().toLowerCase() === 'preview')
        .map((n) => !!n.closest('[data-flag]')),
    ),
  );
  check(
    "U3 «preview» only as the first tile's flag",
    JSON.stringify(previews) === '[[true],[]]',
    JSON.stringify(previews),
  );

  // ── ФАКТЫ ──
  check(
    'B1 badges carry the kind',
    JSON.stringify(await badges('live')) === '["1 · front","2 · back"]',
    JSON.stringify(await badges('live')),
  );
  check(
    'B2 frozen card: the kind still reads at rest',
    JSON.stringify(await badges('frozen')) === '["1 · front","2 · back"]',
    JSON.stringify(await badges('frozen')),
  );
  check(
    'B3 frozen card: no kind menu',
    (await page.$$('[data-probe="frozen"] [data-menu]')).length === 0,
  );

  // ── МЕНЮ ──
  const M = `${L} [data-menu="kind:11"]`;
  const inTile = await page
    .$eval(M, (el) => !!el.closest('[data-rail-view="11"]'))
    .catch(() => false);
  check('M1 `front ▾` corner inside tile 1', inTile);
  check(
    'M2 corner reads «front ▾»',
    (await page.$eval(M, (el) => el.textContent.trim()).catch(() => '')) === 'front ▾',
  );
  const op = await page.$eval(M, (el) => getComputedStyle(el).opacity).catch(() => '');
  check('M3 corner is quiet at rest', op === '0', op);
  if (inTile) {
    await page.hover(`${L} [data-rail-view="11"]`);
    await page.click(M);
    await page.waitForSelector('[role="listbox"]');
    const rows = await page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => [e.textContent.trim(), e.getAttribute('aria-selected')]),
    );
    check(
      "M4 list = the sheet's kinds, current marked",
      JSON.stringify(rows.map((r) => r[0].replace('●', '').trim())) ===
        '["front","back","detail","lining","preview"]' &&
        rows.find((r) => r[1] === 'true')?.[0].startsWith('front'),
      JSON.stringify(rows),
    );
    await page.click('[data-menu-item="TECH_CARD_MEDIA_KIND_DETAIL"]');
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => window.__form());
    check(
      'M5 pick detail → form writes technicalMedia.0.kind, dirty',
      f.values.technicalMedia[0].kind === 'TECH_CARD_MEDIA_KIND_DETAIL' && f.dirty,
      JSON.stringify(f.values.technicalMedia),
    );
    check(
      'M6 badge and corner follow',
      JSON.stringify(await badges('live')) === '["1 · detail","2 · back"]' &&
        (await page.$eval(M, (el) => el.textContent.trim()).catch(() => '')) === 'detail ▾',
      JSON.stringify(await badges('live')),
    );
  }
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`sketch-tile: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
