#!/usr/bin/env node
// ПЛИТКА ВЕРСТАКА FLAT LATEST GENERATION (лейн H, T13; generation/run-tile.tsx, slot-picker.tsx).
//
// Владелец: «в FLAT LATEST GENERATION кнопки unmark или селектор должны быть внутри плитки по
// принципу как это сделано в flat slots». Настоящий `RunTile` над поддельной полосой. Проверяется:
//   · свободная плитка: угол `slot ▾` (data-menu="slot:<id>") В КАДРЕ, список сторон с ghost
//     первым + `+ new detail…`, выбор пишет SetDesignBenchSlot {kind flat, rev того слота};
//   · плитка в слоте: ✕ с aria-label^="take" В КАДРЕ, нажатие пишет pictureId 0 с ревизией слота;
//   · под кадром нет ничего: ни `unmark`, ни `— slot —`, ни подписи, ни `delete`;
//   · `delete…` — последняя строка меню только на верстаке и только у производной картинки;
//   · флаг `fit ≠ card` вместо строки под кадром.
//
//   node scripts/bench-tile-probe.mjs
//   · правка рендера на верстаке (RunRenderTile): `delete…` — строка меню в кадре, та же
//     confirmation, под кадром двери нет (лейн N1).
//
//   node scripts/bench-tile-probe.mjs --mutate=unmark|menu|rev|rdelete|rmodal   — каждая краснеет
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

// Мутации в памяти сборщика: каждая возвращает одну снятую дверь обратно.
const MUTATIONS = {
  // ✕ не отправляется: плитка в слоте теряет unmark в кадре.
  unmark: {
    file: /generation\/run-tile\.tsx$/,
    from: 'inSlot && !hidden && !disabled',
    to: 'false',
  },
  // меню не отправляется: свободная плитка теряет `slot ▾`.
  menu: {
    file: /generation\/run-tile\.tsx$/,
    from: 'slotItems.length || offerDelete',
    to: 'false',
  },
  // ✕ снимает не тот слот: ревизия не та (CAS-токен верстака).
  rev: {
    file: /generation\/run-tile\.tsx$/,
    from: 'expectedSlotRev: inSlot.rev',
    to: 'expectedSlotRev: 0',
  },
  // плитка рендера снова без onDelete: `delete…` пропадает из меню (N1).
  rdelete: {
    file: /generation\/run-tile\.tsx$/,
    from: 'onDelete={canDelete ? removal.ask : undefined}',
    to: 'onDelete={undefined}',
  },
  // меню плитки рендера зовёт ask, но вопрос не смонтирован: confirmation не открывается.
  rmodal: {
    file: /generation\/run-tile\.tsx$/,
    from: '{removal.modal}\n        {editing && (',
    to: '{editing && (',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `bench-tile-${name}`,
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

const outfile = resolve(tmpdir(), `bench-tile-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'bench-tile-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="history"] [data-picture-tile]');
  const calls = () =>
    page.evaluate(() => window.__calls.filter((c) => c.name === 'SetDesignBenchSlot'));
  const inFrame = (sel) =>
    page.$eval(sel, (el) => !!el.closest('[data-picture-tile]')).catch(() => false);

  // ── НИЧЕГО ПОД КАДРОМ ──
  // the render tile nests its frame one level deeper; R1 checks it by buttons instead.
  const under = await page.$$eval(
    '[data-probe]:not([data-probe="render"]) [data-picture]',
    (cells) =>
      cells.map((c) => {
        const tile = c.querySelector('[data-picture-tile]');
        return [...c.children].filter((k) => k !== tile && k.textContent.trim()).length;
      }),
  );
  check(
    'U1 nothing stands under any tile',
    under.every((n) => n === 0),
    JSON.stringify(under),
  );
  const text = await page.evaluate(() => document.body.innerText);
  check('U2 no «— slot —» anywhere', !text.includes('— slot —'));
  check(
    'U3 no «unmark» button anywhere',
    !(await page.$$eval('button', (bs) => bs.some((b) => b.textContent.trim() === 'unmark'))),
  );
  check('U4 no «not standing» caption', !text.includes('not standing'));
  check(
    'U5 no delete door under the derived tile',
    (await page.$$('[data-delete-picture]')).length === 0,
  );

  // ── СВОБОДНАЯ ──
  const M = '[data-menu="slot:11"]';
  check('F1 free tile: `slot ▾` corner in the frame', await inFrame(M));
  check(
    'F2 free tile reads «slot ▾»',
    (await page.$eval(M, (el) => el.textContent.trim()).catch(() => '')) === 'slot ▾',
  );
  check(
    'F3 free tile: no ✕',
    (await page.$$('[data-probe="free"] button[aria-label^="take"]')).length === 0,
  );
  check(
    'F4 fit mismatch is the flag',
    (await page
      .$eval('[data-probe="free"] [data-flag]', (el) => el.textContent.trim())
      .catch(() => '')) === 'fit ≠ card',
  );
  if (await inFrame(M)) {
    await page.hover('[data-probe="free"] [data-picture-tile]');
    await page.click(M);
    await page.waitForSelector('[role="listbox"]');
    const rows = await page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => e.textContent.trim()),
    );
    check('F5 ghost side leads the list', rows[0] === 'back', JSON.stringify(rows));
    check('F6 `+ new detail…` offered', rows.includes('+ new detail…'), JSON.stringify(rows));
    check('F7 no delete on a root plate', !rows.some((r) => r.startsWith('delete')));
    await page.click('[data-menu-item="v:front"]');
    await page.waitForTimeout(200);
    const c = await calls();
    check(
      'F8 pick front → SetDesignBenchSlot {front, flat, pictureId 11, rev 5}',
      c.length === 1 &&
        c[0].body.slot?.viewKey === 'front' &&
        c[0].body.slot?.kind === 'flat' &&
        c[0].body.pictureId === 11 &&
        c[0].body.expectedSlotRev === 5,
      JSON.stringify(c),
    );
  }

  // ── В СЛОТЕ ──
  const X = '[data-probe="inslot"] button[aria-label^="take"]';
  check('S1 in-slot tile: ✕ in the frame', await inFrame(X));
  check(
    'S2 ✕ names the slot',
    (await page.$eval(X, (el) => el.getAttribute('aria-label')).catch(() => '')) ===
      'take run 7 · b off back' ||
      /off back$/.test(await page.$eval(X, (el) => el.getAttribute('aria-label')).catch(() => '')),
  );
  check(
    'S3 in-slot tile: no menu',
    (await page.$$('[data-probe="inslot"] [data-menu]')).length === 0,
  );
  check(
    'S4 badge says the side',
    (await page
      .$eval('[data-probe="inslot"] [data-picture-tile] > div.pointer-events-none span', (el) =>
        el.textContent.trim(),
      )
      .catch(() => '')) === 'back',
  );
  if (await inFrame(X)) {
    const before = (await calls()).length;
    await page.hover('[data-probe="inslot"] [data-picture-tile]');
    await page.click(X);
    await page.waitForTimeout(200);
    const c = (await calls()).slice(before);
    check(
      'S5 ✕ → SetDesignBenchSlot {back, flat, pictureId 0, rev 3}',
      c.length === 1 &&
        c[0].body.slot?.viewKey === 'back' &&
        c[0].body.slot?.kind === 'flat' &&
        c[0].body.pictureId === 0 &&
        c[0].body.expectedSlotRev === 3,
      JSON.stringify(c),
    );
  }

  // ── DELETE ──
  const D = '[data-menu="slot:13"]';
  const opens = async (sel) => {
    await page.hover(sel.replace(/\[data-menu.*$/, '') || 'body');
    await page.click(sel);
    await page.waitForSelector('[role="listbox"]');
    const rows = await page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => e.getAttribute('data-menu-item')),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    return rows;
  };
  const wb = await opens(`[data-probe="derived"] ${D}`).catch(() => []);
  check(
    'D1 workbench derived: `delete…` is the last row',
    wb[wb.length - 1] === '__delete',
    JSON.stringify(wb),
  );
  const hist = await opens(`[data-probe="history"] ${D}`).catch(() => []);
  check(
    'D2 history: no `delete…`',
    hist.length > 0 && !hist.includes('__delete'),
    JSON.stringify(hist),
  );
  await page.hover('[data-probe="derived"] [data-picture-tile]');
  await page.click(`[data-probe="derived"] ${D}`).catch(() => {});
  await page.click('[data-menu-item="__delete"]').catch(() => {});
  await page.waitForTimeout(200);
  check('D3 `delete…` opens the confirmation', !!(await page.$('[data-delete-question]')));
  check(
    'D4 the confirmation alone writes nothing',
    !(await page.evaluate(() => window.__calls.some((c) => /Delete/.test(c.name)))),
  );

  // ── DELETE НА ПЛИТКЕ РЕНДЕРА (N1) ──
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const R = '[data-probe="render"]';
  const rUnder = await page.$$eval(`${R} [data-picture]`, (cells) =>
    cells.map((c) => {
      const tile = c.querySelector('[data-picture-tile]');
      return [...c.querySelectorAll('button')]
        .filter((b) => !tile.contains(b))
        .map((b) => b.textContent.trim());
    }),
  );
  check(
    'R1 render tile: no button stands under the frame',
    rUnder.length === 1 && rUnder[0].length === 0,
    JSON.stringify(rUnder),
  );
  check(
    'R2 render tile: no delete door',
    (await page.$$(`${R} [data-delete-picture]`)).length === 0,
  );
  const rMenu = await page.$(`${R} [data-picture-tile] [data-menu]`);
  check('R3 render tile: a menu corner in the frame', !!rMenu);
  let rRows = [];
  if (rMenu) {
    await page.hover(`${R} [data-picture-tile]`);
    await rMenu.click();
    await page.waitForSelector('[role="listbox"]').catch(() => {});
    rRows = await page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => [e.getAttribute('data-menu-item'), e.textContent.trim()]),
    );
  }
  const last = rRows[rRows.length - 1] ?? [];
  check("R4 `delete…` is the menu's last row", last[1] === 'delete…', JSON.stringify(rRows));
  if (last[0]) {
    await page.click(`[data-menu-item="${last[0]}"]`).catch(() => {});
    await page.waitForTimeout(200);
  }
  check('R5 `delete…` opens the confirmation', !!(await page.$('[data-delete-question]')));
  check(
    'R6 the confirmation alone writes nothing',
    !(await page.evaluate(() => window.__calls.some((c) => /Delete/.test(c.name)))),
  );
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`bench-tile: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
