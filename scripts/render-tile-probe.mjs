#!/usr/bin/env node
// ПЛИТКА РЕНДЕРА НА АНАТОМИИ (лейн L, 20-TILE-SPEC §4; render/render-tile.tsx, T13/T16/T17).
//
// Владелец: «кнопки unmark или селектор должны быть внутри плитки по принципу как это сделано в
// flat slots» и «везде … похоже по одной логике». Настоящий `RenderTile` (стенд
// `render-tile-entry.tsx`), настоящий браузер и CSS админки. Проверяется:
//   · под кадром нет ни `mark ▸`, ни `unmark ▸`, ни плашки, ни `split ▸` — ряд остаётся только у колоды;
//   · `mark ▾` — угол-меню: открывается, строки двух столбцов СГРУППИРОВАНЫ (имя колорвея в начале
//     строки), один столбец — строки без имени; выбор зовёт `markInto(колорвей, сторона)`;
//     `+ colourway…` зовёт рождение, `delete…` — удаление хозяина, красным;
//   · стоящая плита: флаг `in front`, ✕ снимает (`unmarkHeld` с CAS этой стороны), меню нет;
//   · `split` — угол только у нерезаного многовидового листа (гейт HX5 `offersSplit(split)`);
//   · встать некуда — меню погашено, причина в подсказке.
//
//   node scripts/render-tile-probe.mjs                 (нужен `yarn build` — CSS из dist)
//   node scripts/render-tile-probe.mjs --mutate=group  строки без имени колорвея  → G краснеет
//   node scripts/render-tile-probe.mjs --mutate=x      ✕ только у столбца вне SIDES → U краснеет
//   node scripts/render-tile-probe.mjs --mutate=split  гейт сплита снят           → S краснеет
//   node scripts/render-tile-probe.mjs --mutate=row    старый ряд дверей под кадром → R краснеет
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
  group: {
    file: /design\/render\/render-tile\.tsx$/,
    from: "{grouped && <span className='text-labelColor'>{branch.label} · </span>}",
    to: '',
  },
  x: {
    file: /design\/render\/render-tile\.tsx$/,
    from: 'const at = held ? doors.heldAt(picture) : null;',
    to: 'const at = held ? doors.heldAway(picture) : null;',
  },
  split: {
    file: /design\/render\/render-tile\.tsx$/,
    from: '!writesOff && !hidden && !deck && !cutAway && offersSplit(split)',
    to: '!writesOff && !hidden && !deck && !cutAway',
  },
  row: {
    file: /design\/render\/render-tile\.tsx$/,
    from: 'deck || trailingDoor ? (',
    to: 'true ? (',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `render-tile-${name}`,
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

const outfile = resolve(tmpdir(), `render-tile-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'render-tile-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="free"] [data-picture-tile]');
  const calls = () => page.$eval('#state', (el) => JSON.parse(el.textContent));
  const P = (k) => `[data-probe="${k}"]`;
  const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
  const has = async (sel) => (await page.$$(sel)).length > 0;
  const under = (k) =>
    page.$eval(P(k), (el) => {
      const doors = el.querySelector('[data-cell-doors]');
      return doors ? doors.textContent.replace(/\s+/g, ' ').trim() : null;
    });

  // ── R · ПОД КАДРОМ НИЧЕГО, КРОМЕ РЯДА КОЛОДЫ ──
  for (const k of ['free', 'single', 'held', 'sheet', 'refused'])
    check(`R1 ${k}: nothing under the frame`, (await under(k)) === null, `«${await under(k)}»`);
  check('R2 deck: its own row stays — expand ▸', (await under('deck')) === 'expand ▸');
  check(
    'R3 no «mark ▸» / «unmark ▸» / «split ▸» door anywhere',
    !(await page.$$eval('button', (bs) =>
      bs.some((b) => /^(un)?mark ▸$|^split ▸$/.test(b.textContent.trim())),
    )),
  );

  // ── G · МЕНЮ `mark`, ДВА ШАГА СЛОЖЕНЫ В ОДИН СПИСОК ──
  const M = `${P('free')} [data-menu="mark:11"]`;
  check(
    'G1 free plate: «mark ▾» corner in the frame',
    (await has(M)) && (await text(M)) === 'mark ▾',
  );
  check(
    'G2 the corner is inside the tile (bottom-right cluster)',
    await page.$eval(M, (el) => !!el.closest('[data-picture-tile]')),
  );
  await page.hover(`${P('free')} [data-picture-tile]`);
  await page.click(M);
  await page.waitForSelector('[role="listbox"]');
  if (process.env.SHOT)
    await page.screenshot({
      path: process.env.SHOT,
      clip: { x: 0, y: 0, width: 1400, height: 500 },
    });
  const rows = await page.$$eval('[data-menu-item]', (els) =>
    els.map((e) => [e.getAttribute('data-menu-item'), e.textContent.replace(/\s+/g, ' ').trim()]),
  );
  const labels = rows.map((r) => r[1]);
  check(
    'G3 rows grouped by colourway, side after the name',
    JSON.stringify(labels.slice(0, 3)) ===
      JSON.stringify(['ROSSO · front · replaces #4', 'ROSSO · back', 'OLIVE · front']),
    JSON.stringify(labels),
  );
  check(
    'G4 + colourway… then delete… last',
    JSON.stringify(labels.slice(3)) === '["+ colourway…","delete…"]',
    JSON.stringify(labels),
  );
  check(
    'G5 delete… is red',
    await page.$eval('[data-menu-item="delete"]', (el) => el.className.includes('text-error')),
  );
  await page.click(`[data-menu-item="${rows[2][0]}"]`);
  await page.waitForTimeout(150);
  check(
    'G6 pick «OLIVE · front» → markInto(11, 2, front)',
    JSON.stringify((await calls()).at(-1)) === '["mark",11,2,"front"]',
    JSON.stringify(await calls()),
  );
  check('G7 pick closes the list', !(await has('[role="listbox"]')));
  for (const [value, want] of [
    ['+colourway', '["create"]'],
    ['delete', '["delete",11]'],
  ]) {
    await page.click(M);
    await page.waitForSelector('[role="listbox"]');
    await page.click(`[data-menu-item="${value}"]`);
    await page.waitForTimeout(150);
    check(
      `G8 «${value}» → ${want}`,
      JSON.stringify((await calls()).at(-1)) === want,
      JSON.stringify(await calls()),
    );
  }
  const M2 = `${P('single')} [data-menu="mark:12"]`;
  await page.click(M2);
  await page.waitForSelector('[role="listbox"]');
  check(
    'G9 one column: rows are just sides',
    JSON.stringify(
      await page.$$eval('[data-menu-item]', (els) => els.map((e) => e.textContent.trim())),
    ) === '["back"]',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // ── U · СТОЯЩАЯ ПЛИТА: ФЛАГ + ✕ ──
  check('U1 held: flag «in front»', await has(`${P('held')} [data-flag="in front"]`));
  check('U2 held: no menu', !(await has(`${P('held')} [data-menu]`)));
  const X = `${P('held')} button[aria-label^="unmark render 13"]`;
  check('U3 held: ✕ in the frame', (await has(X)) && (await text(X)) === '✕');
  if (await has(X)) {
    await page.hover(`${P('held')} [data-picture-tile]`);
    await page.click(X);
    await page.waitForTimeout(150);
    check(
      'U4 ✕ → unmarkHeld(13, ROSSO, front, rev 3)',
      JSON.stringify((await calls()).at(-1)) === '["unmark",13,1,"front",3]',
      JSON.stringify(await calls()),
    );
  }

  // ── S · СПЛИТ — ТОЛЬКО НЕРЕЗАНЫЙ МНОГОВИДОВОЙ ЛИСТ (HX5) ──
  const splitOf = (k) => has(`${P(k)} button[aria-label^="split render"]`);
  check('S1 sheet: split corner', await splitOf('sheet'));
  check('S2 sheet: no mark menu', !(await has(`${P('sheet')} [data-menu]`)));
  check('S3 single plate: no split corner', !(await splitOf('single')));
  check('S4 deck sheet: no split corner', !(await splitOf('deck')));

  // ── F · ВСТАТЬ НЕКУДА ──
  const MF = `${P('refused')} [data-menu="mark:16"]`;
  check(
    'F1 refused: menu disabled, reason in its title',
    (await has(MF)) &&
      (await page.$eval(MF, (el) => el.disabled && el.title === 'GONE was deleted from the card')),
  );
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`render-tile: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
