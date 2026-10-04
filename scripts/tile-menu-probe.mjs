#!/usr/bin/env node
// УГЛОВЫЕ МЕНЮ ПЛИТОК — ГЕЙТ ВОЛНЫ ПЛИТОК (TF2–TF4). Настоящие компоненты над поддельной полосой
// (`tile-menu-entry.tsx`). Сеть — прокси: вызовы пишутся в `window.__calls`, а метод, названный в
// `window.__hold`, ждёт `window.__release(name)` — так проба держит запись или перечитывание полосы
// «в полёте» и смотрит, что делает меню в это время.
//
//   TF2 · ✕ не удаляет: на сетке CLOTHS ✕ нет; удаление — последняя
//         красная строка `delete…` меню (без пар — `more ▾` с ней одной) и ВСЕГДА спрашивает.
//
//   TF3 · удаление рендера в полёте: меню плитки занято целиком (ни mark, ни второго delete), а
//         вопрос открыт, занят и закрывается только ответом.
//
//   TF4 · запись слота (`slot ▾` FLAT, `mark ▾` рендера) держит меню занятым, пока перечитанная
//         полоса не легла в кэш: иначе быстрый повторный выбор шлёт старый `expectedSlotRev`.
//
//         Так же — запись ассета (delete…) в CLOTHS (r2).
//
//   node scripts/tile-menu-probe.mjs
//   node scripts/tile-menu-probe.mjs --mutate=<имя>   — каждая мутация краснеет (список — MUTATIONS)
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
        window.__calls = [];
        window.__hold = {};
        window.__held = {};
        window.__release = (name) => {
          const list = window.__held[name] || [];
          window.__held[name] = [];
          list.forEach((go) => go());
          return list.length;
        };
        const answer = (name) =>
          name === 'GetDesignBand' ? JSON.parse(JSON.stringify(window.__band || {})) : {};
        const call = (name) => (body) => {
          window.__calls.push({ name, body: JSON.parse(JSON.stringify(body ?? {})) });
          if (!window.__hold[name]) return Promise.resolve(answer(name));
          return new Promise((resolve) => {
            (window.__held[name] = window.__held[name] || []).push(() => resolve(answer(name)));
          });
        };
        const nope = () => Promise.resolve({});
        export const adminService = new Proxy({}, { get: (_, name) => call(String(name)) });
        export const requestHandler = (req) => call('requestHandler')(req);
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

// Мутации в памяти сборщика: каждая возвращает одну снятую починку обратно.
const MUTATIONS = {
  // TF2: строка delete… сетки CLOTHS удаляет без вопроса.
  paletteask: {
    file: /render\/palette\.tsx$/,
    from: 'onPick: () => setPendingRemove(a),',
    to: 'onPick: () => writes.deleteAsset.mutate(id),',
  },
  // TF3: плитка рендера не знает, что её удаление летит — меню снова живо.
  rpending: {
    file: /generation\/run-tile\.tsx$/,
    from: 'deletePending={removal.pending}',
    to: 'deletePending={false}',
  },
  // TF3: вопрос закрывается на «ok», не дождавшись ответа.
  rmodal: {
    file: /generation\/delete-picture-modal\.tsx$/,
    from: 'closeOnConfirm={false}',
    to: 'closeOnConfirm',
  },
  // TF4: запись слота кончается на ответе сервера, не дождавшись перечитывания полосы.
  refetch: {
    file: /design\/use-design-band\.ts$/,
    from: 'onSuccess: invalidateWrittenAndWait,',
    to: 'onSuccess: invalidateWritten,',
  },
  // Codex r2: запись ассета кончается на ответе сервера, не дождавшись полосы.
  assetrefetch: {
    file: /assets\/use-assets\.ts$/,
    from: 'const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key]);',
    to: 'const invalidate = useCallback(() => { qc.invalidateQueries({ queryKey: key }); }, [qc, key]);',
  },
  // Codex r2: то же у привязки «ткань пары».
  bindrefetch: {
    file: /assets\/use-assets\.ts$/,
    from: 'onSuccess: (card: number) => qc.invalidateQueries({ queryKey: designKeys.band(card) }),',
    to: 'onSuccess: (card: number) => { qc.invalidateQueries({ queryKey: designKeys.band(card) }); },',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `tile-menu-${name}`,
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

const outfile = resolve(tmpdir(), `tile-menu-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tile-menu-entry.tsx')],
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
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="palette"] [data-picture-tile]');
  const calls = (re) =>
    page.evaluate((s) => window.__calls.filter((c) => new RegExp(s).test(c.name)), re.source);
  const dialog = () => page.$('[role="dialog"]');
  const closeDialog = async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]')).catch(() => {});
    await page.waitForTimeout(150);
  };
  /** Open a tile's corner menu and read its rows: [value, text, red?]. */
  const rowsOf = async (tile, menu) => {
    await page.hover(tile);
    await page.click(menu);
    await page.waitForSelector('[role="listbox"]');
    return page.$$eval('[data-menu-item]', (els) =>
      els.map((e) => [
        e.getAttribute('data-menu-item'),
        e.textContent.trim(),
        e.className.includes('text-error'),
      ]),
    );
  };
  const xs = (scope) =>
    page.$$eval(
      `${scope} [data-picture-tile] button`,
      (bs) =>
        bs.filter(
          (b) =>
            b.textContent.trim() === '✕' ||
            /^(delete|remove) /.test(b.getAttribute('aria-label') ?? ''),
        ).length,
    );

  // ── TF2 · CLOTHS ──
  const P = '[data-probe="palette"]';
  check('P1 cloth tiles: no ✕, no delete button in the frame', (await xs(P)) === 0);
  const before = (await calls(/DeleteDesignAsset/)).length;
  const pr = await rowsOf(`${P} [data-texture="202"]`, `${P} [data-menu="more:202"]`).catch(
    () => [],
  );
  check(
    'P2 `more ▾` holds only the red `delete…`',
    pr.length === 1 && pr[0][1] === 'delete…' && pr[0][2] === true,
    JSON.stringify(pr),
  );
  await page.click('[data-menu-item="delete"]').catch(() => {});
  await page.waitForTimeout(200);
  check('P3 delete on a cloth asks first', !!(await dialog()));
  check(
    'P4 the question alone deletes nothing',
    (await calls(/DeleteDesignAsset/)).length === before,
  );
  await closeDialog();

  // ── TF3 · удаление рендера в полёте ──
  const R = '[data-probe="render"]';
  const RM = `${R} [data-menu]`;
  const rRows = await rowsOf(`${R} [data-picture-tile]`, RM).catch(() => []);
  const rLast = rRows[rRows.length - 1] ?? [];
  check(
    'R1 render menu: `delete…` is the last, red row',
    rLast[1] === 'delete…' && rLast[2] === true,
    JSON.stringify(rRows),
  );
  await page.evaluate(() => (window.__hold.DeleteDesignPicture = true));
  if (rLast[0]) await page.click(`[data-menu-item="${rLast[0]}"]`);
  await page.waitForTimeout(200);
  await page.click('[role="dialog"] button:has-text("delete for good")').catch(() => {});
  await page.waitForTimeout(250);
  const inFlight = await page.evaluate((sel) => {
    const m = document.querySelector(sel);
    const d = document.querySelector('[role="dialog"]');
    const confirm =
      d && [...d.querySelectorAll('button')].find((b) => /deleting/.test(b.textContent));
    return {
      menuDisabled: !!m && m.disabled,
      menuBusy: m?.getAttribute('aria-busy') === 'true',
      dialog: !!d,
      confirmDisabled: !!confirm && confirm.disabled,
      sent: window.__calls.filter((c) => c.name === 'DeleteDesignPicture').length,
    };
  }, RM);
  check('R2 the delete is sent once', inFlight.sent === 1, JSON.stringify(inFlight));
  check(
    'R3 while it flies the whole menu is pending (no mark, no second delete)',
    inFlight.menuDisabled && inFlight.menuBusy,
    JSON.stringify(inFlight),
  );
  check(
    'R4 the question stays open and busy until the answer',
    inFlight.dialog && inFlight.confirmDisabled,
    JSON.stringify(inFlight),
  );
  await page.evaluate(() => {
    window.__hold.DeleteDesignPicture = false;
    window.__release('DeleteDesignPicture');
  });
  await page.waitForTimeout(400);
  check('R5 the answer closes the question', !(await dialog()));
  check('R6 and frees the menu', await page.$eval(RM, (m) => !m.disabled).catch(() => false));

  // ── TF4 · меню занято до перечитывания полосы ──
  const holdsUntilRefetch = async (
    tag,
    tile,
    menu,
    item,
    write = 'SetDesignBenchSlot',
    confirm = null,
  ) => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await rowsOf(tile, menu);
    const writes = (await calls(new RegExp(`^${write}$`))).length;
    await page.evaluate(() => (window.__hold.GetDesignBand = true));
    await page.click(`[data-menu-item="${item}"]`);
    if (confirm) {
      await page.waitForSelector(confirm);
      await page.click(confirm);
    }
    await page.waitForFunction(
      ([name, n]) => window.__calls.filter((c) => c.name === name).length > n,
      [write, writes],
    );
    await page
      .waitForFunction(() => (window.__held.GetDesignBand ?? []).length > 0, null, {
        timeout: 3000,
      })
      .catch(() => {});
    await page.waitForTimeout(200);
    const during = await page.$eval(menu, (m) => ({
      disabled: m.disabled,
      busy: m.getAttribute('aria-busy') === 'true',
    }));
    check(
      `${tag}1 the menu stays pending while the band is read again`,
      during.disabled && during.busy,
      JSON.stringify(during),
    );
    await page.evaluate(() => {
      window.__hold.GetDesignBand = false;
      window.__release('GetDesignBand');
    });
    await page.waitForTimeout(300);
    check(
      `${tag}2 the fresh band frees it`,
      await page.$eval(menu, (m) => !m.disabled).catch(() => false),
    );
  };
  await holdsUntilRefetch(
    'S',
    '[data-probe="flat"] [data-picture-tile]',
    '[data-probe="flat"] [data-menu="slot:11"]',
    'v:front',
  );
  await holdsUntilRefetch('M', `${R} [data-picture-tile]`, RM, '0␟front');

  // ── Codex r2 · записи ассетов и привязок тоже держат меню до перечитывания полосы ──
  await holdsUntilRefetch(
    'Q',
    `${P} [data-texture="202"]`,
    `${P} [data-menu="more:202"]`,
    'delete',
    'DeleteDesignAsset',
    '[role="dialog"] button:has-text("delete")',
  );

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`tile-menu: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
