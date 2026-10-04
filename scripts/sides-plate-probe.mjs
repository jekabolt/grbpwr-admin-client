#!/usr/bin/env node
// ТАБЛИЦА SIDES У FABRIC RENDER (лейн AF, render/side-row.tsx). Настоящий `SidesSection` (стенд
// `sides-plate-entry.tsx`), настоящий браузер и CSS админки. Проверяется:
//   · п. 45, владелец: «в FABRIC RENDER в SIDES не нужно показывать с тамбнейлом RUN 52 или RUN R1» —
//     ни в одной плите таблицы нет текста /run\s*\w+/i, а плиты при этом есть (флэты и рендеры);
//   · без подвала плита и пустая коробка рядом остаются ОДНОГО роста (жалоба «плейсхолдеры больше
//     самих блоков тамбнейлов»).
//
//   node scripts/sides-plate-probe.mjs                  (нужен `yarn build` — CSS из dist)
//   node scripts/sides-plate-probe.mjs --mutate=origin  происхождение снова под флэтом → N1 краснеет
//   node scripts/sides-plate-probe.mjs --mutate=height  пустые коробки ростом с подвалом → N2 краснеет
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

// Мутации в памяти сборщика, по одной на закон.
const MUTATIONS = {
  origin: {
    file: /design\/render\/side-row\.tsx$/,
    from: '<Plate picture={side.picture} name={label} alt={`flat · ${label}`} />',
    to: '<Plate picture={side.picture} name={label} origin={originWord(band, side)} alt={`flat · ${label}`} />',
  },
  height: {
    file: /design\/render\/side-row\.tsx$/,
    from: 'heightPx={CELL_PX}\n          purpose={`design · flat',
    to: 'heightPx={EMPTY_PX}\n          purpose={`design · flat',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `sides-plate-${name}`,
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

const outfile = resolve(tmpdir(), `sides-plate-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'sides-plate-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('#design-render-sides [data-slot-filled]');
  await page.waitForTimeout(200);

  // ── N · ПЛИТЫ ТАБЛИЦЫ SIDES ──
  const plates = await page.$$eval('#design-render-sides [data-slot-filled]', (ns) =>
    ns.map((n) => ({
      text: n.innerText.replace(/\s+/g, ' ').trim(),
      h: Math.round(n.getBoundingClientRect().height),
    })),
  );
  const kinds = await page.$eval('#design-render-sides', (el) => ({
    flat: el.querySelectorAll('[data-side-flat] [data-slot-filled]').length,
    render: el.querySelectorAll('[data-side-cell] [data-slot-filled]').length,
  }));
  check(
    'N0 the table draws flat and render plates',
    kinds.flat >= 2 && kinds.render >= 1,
    JSON.stringify(kinds),
  );
  const runText = plates.filter((p) => /run\s*\w+/i.test(p.text)).map((p) => p.text);
  check('N1 no «run …» with any SIDES thumbnail', runText.length === 0, JSON.stringify(runText));

  const empties = await page.$$eval(
    '#design-render-sides [data-side-flat], #design-render-sides [data-side-cell]',
    (ns) =>
      ns
        .filter((n) => n.firstElementChild && !n.querySelector('[data-slot-filled]'))
        .map((n) => Math.round(n.firstElementChild.getBoundingClientRect().height)),
  );
  const plateH = plates[0]?.h ?? 0;
  check(
    'N2 an empty cell stands as tall as a plate',
    empties.length > 0 && plates.every((p) => p.h === plateH) && empties.every((h) => h === plateH),
    JSON.stringify({ plates: plates.map((p) => p.h), empties }),
  );
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`sides-plate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
