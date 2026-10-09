#!/usr/bin/env node
// АНАТОМИЯ ПЛИТКИ (лейн P, 20-TILE-SPEC §3; design/picture-tile.tsx + ui/components/tile-skin.ts).
//
// Настоящий `PictureTile` с ярлыком, флагом, ✕, crop, menu и edit. Проверяется:
//   · места углов: ярлык и флаг верх-слева (флаг ПОД ярлыком), ✕ верх-справа, crop низ-слева,
//     menu низ-справа ПЕРЕД edit, и edit стоит там же, где у плитки без меню;
//   · правило наведения: факты (ярлык, флаг) видны всегда, глаголы (углы, триггер меню) — только на
//     наведении; открытое меню и `pending` держат свой угол видимым;
//   · меню: открывается вверх, отмечает текущее, пропускает выключенное, выбор зовёт `onPick` ровно
//     раз и закрывает список; клавиатура (Enter, стрелки) делает то же;
//   · слова `zoom` нет нигде.
// Настоящий ввод мыши и клавиатуры (Playwright), собранная CSS админки (нужен `yarn build`).
//
//   node scripts/tile-anatomy-probe.mjs
//   node scripts/tile-anatomy-probe.mjs --mutate=order   меню ПОСЛЕ edit — место edit краснеет
//   node scripts/tile-anatomy-probe.mjs --mutate=inline  флаг в строку с ярлыком по умолчанию —
//                                                         плитка FLAT теряет столбик, P2 краснеет
//   node scripts/tile-anatomy-probe.mjs --mutate=open    без `data-[state=open]` в TILE_QUIET —
//                                                         открытое меню прячет свой угол
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
  order: {
    file: /design\/picture-tile\.tsx$/,
    from: "          {menu && <CornerMenu menu={menu} />}\n          {onSelect && <Corner action={onSelect} label={selectLabel} className='' />}\n          {onEdit && <Corner action={onEdit} label={editLabel} className='' />}",
    to: "          {onSelect && <Corner action={onSelect} label={selectLabel} className='' />}\n          {onEdit && <Corner action={onEdit} label={editLabel} className='' />}\n          {menu && <CornerMenu menu={menu} />}",
  },
  inline: {
    file: /design\/picture-tile\.tsx$/,
    from: '  flagInline,\n  menu,\n}: PictureTileProps',
    to: '  flagInline = true,\n  menu,\n}: PictureTileProps',
  },
  open: {
    file: /ui\/components\/tile-skin\.ts$/,
    from: 'data-[state=open]:opacity-100 ',
    to: '',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `tile-anatomy-${name}`,
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

const outfile = resolve(tmpdir(), `tile-anatomy-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tile-anatomy-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="full"] [data-picture-tile]');
  const state = () => page.$eval('#state', (el) => JSON.parse(el.textContent));

  const T = '[data-probe="full"] [data-picture-tile]';
  const SEL = {
    badge: `${T} > div.pointer-events-none > span:first-child`,
    flag: `${T} [data-flag]`,
    remove: `${T} button[aria-label="take run 7 · b off"]`,
    crop: `${T} button[aria-label="crop run 7 · b"]`,
    menu: `${T} [data-menu="slot:7"]`,
    edit: `${T} button[aria-label="edit run 7 · b"]`,
  };
  /** Прямоугольник органа относительно своей плитки. */
  const rel = (sel) =>
    page.$eval(sel, (el) => {
      const tile = el.closest('[data-picture-tile]').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        left: b.left - tile.left,
        top: b.top - tile.top,
        right: tile.right - b.right,
        bottom: tile.bottom - b.bottom,
        w: tile.width,
        h: tile.height,
      };
    });
  const opacity = (sel) => page.$eval(sel, (el) => Number(getComputedStyle(el).opacity));
  const away = async () => {
    await page.mouse.move(990, 10);
    await page.waitForTimeout(250);
  };

  // ── МЕСТА ──
  await away();
  const r = {};
  for (const [k, sel] of Object.entries(SEL)) r[k] = await rel(sel);
  const half = r.edit.w / 2;
  check('P1 badge top-left', r.badge.left < 8 && r.badge.top < 8, JSON.stringify(r.badge));
  check(
    'P2 flag top-left, under the badge',
    r.flag.left < 8 && r.flag.top >= r.badge.top + 8,
    `badge.top ${r.badge.top} flag.top ${r.flag.top}`,
  );
  check('P3 ✕ top-right', r.remove.right < 8 && r.remove.top < 8, JSON.stringify(r.remove));
  check('P4 crop bottom-left', r.crop.left < 8 && r.crop.bottom < 8, JSON.stringify(r.crop));
  check(
    'P5 menu bottom-right, before edit',
    r.menu.bottom < 8 && r.menu.left > half && r.menu.right > r.edit.right + 10,
    `menu.right ${r.menu.right} edit.right ${r.edit.right}`,
  );
  const plainEdit = await rel('[data-probe="plain"] button[aria-label="edit plain"]');
  check(
    'P6 edit is last and does not move',
    Math.abs(plainEdit.right - r.edit.right) < 0.5 &&
      Math.abs(plainEdit.bottom - r.edit.bottom) < 0.5,
    `plain ${plainEdit.right}/${plainEdit.bottom} full ${r.edit.right}/${r.edit.bottom}`,
  );
  check(
    'P7 the menu corner reads «slot ▾»',
    (await page.$eval(SEL.menu, (el) => el.textContent.trim())) === 'slot ▾',
  );
  check(
    'P8 no «zoom» anywhere',
    !(await page.$$eval('button', (bs) => bs.some((b) => /^zoom$/i.test(b.textContent.trim())))),
  );

  // ── НАВЕДЕНИЕ ──
  check('H1 at rest: badge visible', (await opacity(SEL.badge)) === 1);
  check('H2 at rest: flag visible', (await opacity(SEL.flag)) === 1);
  for (const k of ['remove', 'crop', 'menu', 'edit'])
    check(`H3 at rest: ${k} quiet`, (await opacity(SEL[k])) === 0);
  const tileBox = await page.$eval(T, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(tileBox.x, tileBox.y);
  await page.waitForTimeout(250);
  for (const k of ['remove', 'crop', 'menu', 'edit'])
    check(`H4 on hover: ${k} visible`, (await opacity(SEL[k])) === 1);
  check(
    'H5 pending menu: visible at rest, «slot…», disabled',
    (await opacity('[data-menu="slot:busy"]')) === 1 &&
      (await page.$eval('[data-menu="slot:busy"]', (el) => el.textContent.trim())) === 'slot…' &&
      (await page.$eval('[data-menu="slot:busy"]', (el) => el.disabled)),
  );

  // ── МЕНЮ МЫШЬЮ ──
  await page.click(SEL.menu);
  await page.waitForSelector('[role="listbox"]');
  const box = await page.$eval('[role="listbox"]', (el) => {
    const panel = el.closest('[data-radix-popper-content-wrapper]') ?? el;
    return panel.getBoundingClientRect().toJSON();
  });
  const trig = await page.$eval(SEL.menu, (el) => el.getBoundingClientRect().toJSON());
  check(
    'M1 menu opens upward',
    box.bottom <= trig.top + 1,
    `panel.bottom ${box.bottom} trigger.top ${trig.top}`,
  );
  check(
    "M2 menu aligns to the corner's right edge",
    Math.abs(box.right - trig.right) < 2,
    `panel.right ${box.right} trigger.right ${trig.right}`,
  );
  check(
    'M3 trigger aria-expanded + listbox popup',
    (await page.$eval(SEL.menu, (el) => el.getAttribute('aria-expanded'))) === 'true' &&
      (await page.$eval(SEL.menu, (el) => el.getAttribute('aria-haspopup'))) === 'listbox',
  );
  check(
    'M4 current item marked',
    (await page.$eval('[data-menu-item="back"]', (el) => el.getAttribute('aria-selected'))) ===
      'true',
  );
  check(
    'M5 disabled item is disabled',
    await page.$eval('[data-menu-item="side"]', (el) => el.disabled),
  );
  check(
    'M6 danger item in error ink',
    await page.$eval('[data-menu-item="delete"]', (el) => el.className.includes('text-error')),
  );
  await page.mouse.move(990, 10);
  await page.waitForTimeout(250);
  if (process.env.SHOT)
    await page.screenshot({
      path: process.env.SHOT,
      clip: { x: 100, y: 60, width: 760, height: 320 },
    });
  check('M7 open menu keeps its corner visible off hover', (await opacity(SEL.menu)) === 1);
  await page.click('[data-menu-item="front"]');
  await page.waitForTimeout(150);
  check(
    'M8 pick → onPick once with the value',
    JSON.stringify((await state()).picks) === '["front"]',
    JSON.stringify(await state()),
  );
  check('M9 pick closes the menu', (await page.$$('[role="listbox"]')).length === 0);
  check('M10 pick did not hit ✕', (await state()).removed === 0);

  // ── МЕНЮ КЛАВИАТУРОЙ ──
  await page.focus(SEL.menu);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="listbox"]');
  await page.waitForTimeout(100);
  check(
    'K1 focus lands on the current item',
    (await page.evaluate(() => document.activeElement?.getAttribute('data-menu-item'))) === 'back',
  );
  await page.keyboard.press('ArrowDown'); // side is disabled → skipped to delete
  check(
    'K2 arrows skip the disabled item',
    (await page.evaluate(() => document.activeElement?.getAttribute('data-menu-item'))) ===
      'delete',
  );
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check(
    'K3 Enter picks',
    JSON.stringify((await state()).picks) === '["front","back"]',
    JSON.stringify(await state()),
  );
  await page.focus(SEL.menu);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="listbox"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(
    'K4 Esc closes without a pick',
    (await page.$$('[role="listbox"]')).length === 0 && (await state()).picks.length === 2,
  );
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`tile-anatomy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
