#!/usr/bin/env node
// АНАТОМИЯ ПЛИТКИ `FocusedAnnotator` (лейн K, 20-TILE-SPEC §3; ui/components/focused-annotator.tsx,
// annotation/surface.tsx, design/mood-board.tsx). Плитка доски — та же анатомия, что у `PictureTile`:
//   · номер верх-слева, флаг `in the input` ПОД ним — факты, видны всегда;
//   · ✕ верх-справа и значит «с доски»; crop низ-слева; edit низ-справа — глаголы, тихие
//     (`TILE_QUIET`): невидимы в покое, видны на наведении и на фокусе внутри плитки;
//   · слова `zoom` нет; накладка взведённого выбора накрывает ✕ и углы.
// Настоящий ввод мыши и клавиатуры (Playwright), собранная CSS админки (нужен `yarn build`).
//
//   node scripts/focused-tile-anatomy-probe.mjs
//   node scripts/focused-tile-anatomy-probe.mjs --mutate=group   без `group` на плитке — углы не
//                                                                 проявляются на наведении
//   node scripts/focused-tile-anatomy-probe.mjs --mutate=loud    ✕ без `TILE_QUIET` — виден в покое
//   node scripts/focused-tile-anatomy-probe.mjs --mutate=pick    накладка выбора ниже углов — ✕
//                                                                 нажимается во взведённом выборе
//   node scripts/focused-tile-anatomy-probe.mjs --mutate=bottom  без `cornerSlotBottom` — crop и
//                                                                 edit не на своих углах
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
const FA = /ui\/components\/focused-annotator\.tsx$/;
const MUTATIONS = {
  group: {
    file: FA,
    from: "'group relative shrink-0 space-y-1'",
    to: "'relative shrink-0 space-y-1'",
  },
  loud: {
    file: FA,
    from: "className={cn(TILE_CORNER, TILE_QUIET, 'cursor-pointer py-0.5 leading-none')}",
    to: "className={cn(TILE_CORNER, 'cursor-pointer py-0.5 leading-none')}",
  },
  pick: { file: FA, from: "'absolute inset-0 z-30 flex", to: "'absolute inset-0 z-[7] flex" },
  bottom: {
    file: FA,
    from: 'corners && (corners.left || corners.right) ? (',
    to: 'false ? (',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `focused-tile-anatomy-${name}`,
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

const outfile = resolve(tmpdir(), `focused-tile-anatomy-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'focused-tile-anatomy-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="board"] [data-rail-view="11"]');
  await page.waitForTimeout(300);
  const state = () => page.$eval('#state', (el) => JSON.parse(el.textContent));

  const T = '[data-probe="board"] [data-rail-view="11"]';
  const T2 = '[data-probe="board"] [data-rail-view="12"]';
  const SEL = {
    number: `${T} > div.pointer-events-none > span:first-child`,
    flag: `${T} [data-flag="in the input"]`,
    remove: `${T} [role="button"][aria-label="take moodboard picture 1 off the board"]`,
    crop: `${T} [data-mood-crop="11"]`,
    edit: `${T} [data-mood-edit="11"]`,
  };
  /** Прямоугольник органа относительно КАДРА своей плитки (кадр — родитель слоя углов). */
  const rel = (sel) =>
    page.$eval(sel, (el) => {
      const tile = el.closest('[data-rail-view]');
      const frame = tile.querySelector('[data-frame-corner]').parentElement.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        left: b.left - frame.left,
        top: b.top - frame.top,
        right: frame.right - b.right,
        bottom: frame.bottom - b.bottom,
        w: frame.width,
      };
    });
  const opacity = (sel) =>
    page.$eval(sel, (el) => Number(getComputedStyle(el).opacity)).catch(() => -1);
  const away = async () => {
    await page.mouse.move(990, 890);
    await page.waitForTimeout(250);
  };

  // ── МЕСТА ──
  await away();
  const r = {};
  for (const [k, sel] of Object.entries(SEL)) r[k] = await rel(sel).catch(() => null);
  const ok = (v, f) => !!v && f(v);
  check(
    'B1 number top-left',
    ok(r.number, (v) => v.left < 6 && v.top < 6),
    JSON.stringify(r.number),
  );
  check(
    'B2 «in the input» flag top-left, under the number',
    ok(r.flag, (v) => v.left < 6 && v.top >= r.number.top + 8),
    JSON.stringify(r.flag),
  );
  check(
    'B3 the flag stands only on the picture that is in the input',
    (await page.$$(`${T2} [data-flag]`)).length === 0,
  );
  check(
    'B4 ✕ top-right, named «off the board»',
    ok(r.remove, (v) => v.right < 8 && v.top < 8),
    JSON.stringify(r.remove),
  );
  check(
    'B5 crop bottom-left',
    ok(r.crop, (v) => v.left < 8 && v.bottom < 8),
    JSON.stringify(r.crop),
  );
  check(
    'B6 edit bottom-right',
    ok(r.edit, (v) => v.right < 8 && v.bottom < 8),
    JSON.stringify(r.edit),
  );

  // ── ПРАВИЛО НАВЕДЕНИЯ ──
  check(
    'H1 at rest: facts visible, verbs quiet',
    (await opacity(SEL.number)) === 1 &&
      (await opacity(SEL.flag)) === 1 &&
      (await opacity(SEL.remove)) === 0 &&
      (await opacity(SEL.crop)) === 0 &&
      (await opacity(SEL.edit)) === 0,
    `✕ ${await opacity(SEL.remove)} crop ${await opacity(SEL.crop)} edit ${await opacity(SEL.edit)}`,
  );
  const box = await page.$eval(T, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(250);
  check(
    'H2 on hover of the tile: ✕ crop edit appear',
    (await opacity(SEL.remove)) === 1 &&
      (await opacity(SEL.crop)) === 1 &&
      (await opacity(SEL.edit)) === 1,
    `✕ ${await opacity(SEL.remove)} crop ${await opacity(SEL.crop)} edit ${await opacity(SEL.edit)}`,
  );
  check(
    'H3 hover of one tile does not wake the neighbour',
    (await opacity(`${T2} [data-mood-edit="12"]`)) === 0,
  );
  await page.click(SEL.crop).catch(() => {});
  await page.click(SEL.edit).catch(() => {});
  await page.click(SEL.remove).catch(() => {});
  await page.waitForTimeout(150);
  check(
    'H4 crop · edit · ✕ act on their picture',
    JSON.stringify((await state()).events) ===
      '["board:crop:11","board:edit:11","board:remove:11"]',
    JSON.stringify(await state()),
  );
  await away();
  await page.focus(SEL.crop).catch(() => {});
  await page.waitForTimeout(250);
  check(
    'H5 keyboard focus inside the tile wakes its ✕',
    (await opacity(SEL.remove)) === 1,
    `✕ ${await opacity(SEL.remove)}`,
  );
  await page.evaluate(() => document.activeElement?.blur());

  // ── ЗУМА НЕТ ──
  check(
    'Z1 no «zoom» word or zoom-named organ on the board',
    !(await page.$$eval('[data-probe="board"] button, [data-probe="board"] [role="button"]', (bs) =>
      bs.some(
        (b) =>
          /^zoom$/i.test(b.textContent.trim()) || /^zoom/i.test(b.getAttribute('aria-label') ?? ''),
      ),
    )),
  );

  // ── ВЗВЕДЁННЫЙ ВЫБОР НАКРЫВАЕТ УГЛЫ ──
  const P = '[data-probe="pick"] [data-rail-view="11"]';
  const pb = await page.$eval(P, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(pb.x, pb.y);
  await page.waitForTimeout(250);
  const hit = await page.$eval(P, (tile) => {
    const x = tile.querySelector('[role="button"][aria-label$="off the board"]');
    const b = x.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return top?.closest('[aria-label^="pick picture"]') ? 'overlay' : top?.outerHTML.slice(0, 80);
  });
  check('S1 an armed pick covers the ✕', hit === 'overlay', String(hit));
  const before = (await state()).events.length;
  const xb = await page.$eval(`${P} [role="button"][aria-label$="off the board"]`, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(xb.x, xb.y);
  await page.waitForTimeout(150);
  const ev = (await state()).events.slice(before);
  check(
    'S2 a click there picks, never removes',
    JSON.stringify(ev) === '["pick:pick:11"]',
    JSON.stringify(ev),
  );
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`focused-tile-anatomy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
