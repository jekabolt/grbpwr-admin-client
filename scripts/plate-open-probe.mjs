#!/usr/bin/env node
// МЫШИНАЯ ДВЕРЬ В КРУПНЫЙ ВИД ПЛИТЫ ЛИСТА (T17, лейн M; design/artifacts-panel.tsx).
//
// На плите листа инструмент взведён всегда, а взведённый двойной клик ставит точки (HX1), поэтому
// мышью в крупный вид дороги не было — только клавиатурой (HX3). Дверью стало ИМЯ плиты (верх
// слева). Проверяется на настоящем `PlateGrid` с взведённым инструментом:
//   · двойной клик по снимку крупный вид НЕ открывает (постановка старше зума — исходное правило);
//   · нажатие по имени открывает крупный вид ровно раз и не ставит выноску;
//   · имя не стоит в порядке таба (клавиатурная дверь — `data-open-large` поверхности) и несёт
//     курсор `zoom-in`; кнопки со словом `zoom` на плите нет.
// Настоящий ввод мыши (Playwright), собранная CSS админки (нужен `yarn build`).
//
//   node scripts/plate-open-probe.mjs
//   node scripts/plate-open-probe.mjs --mutate=click    у имени нет `onClick` — дверь глухая
//   node scripts/plate-open-probe.mjs --mutate=events   имя прозрачно для указателя — клик уходит
//                                                        в поверхность, крупного вида нет
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
        export const abortableAdminService = adminService;
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export const requestHandler = () => Promise.resolve({});
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

const OPEN_TAG = "                  data-plate-open={plate.mediaId}\n                  title={`open ${plate.name} large`}\n                  onClick={() => onZoom(index)}\n                  className='pointer-events-auto ";
const MUTATIONS = {
  click: {
    file: /design\/artifacts-panel\.tsx$/,
    from: OPEN_TAG,
    to: "                  data-plate-open={plate.mediaId}\n                  title={`open ${plate.name} large`}\n                  className='pointer-events-auto ",
  },
  events: {
    file: /design\/artifacts-panel\.tsx$/,
    from: OPEN_TAG,
    to: OPEN_TAG.replace('pointer-events-auto ', ''),
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `plate-open-${name}`,
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

const outfile = resolve(tmpdir(), `plate-open-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'plate-open-entry.tsx')],
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
  await page.waitForSelector('[data-plate-tile] [data-annot-frame] img');
  const state = () => page.$eval('#state', (el) => JSON.parse(el.textContent));

  // ── ДВОЙНОЙ КЛИК ПО СНИМКУ ПРИ ВЗВЕДЁННОМ ИНСТРУМЕНТЕ ──
  const frame = await page.$eval('[data-plate-tile] [data-annot-frame]', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 };
  });
  await page.mouse.dblclick(frame.x, frame.y);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  const s0 = await state();
  check('двойной клик по снимку при взведённом инструменте крупный вид не открывает', s0.zooms.length === 0, JSON.stringify(s0));

  // ── ИМЯ ──
  const name = '[data-plate-tile] [data-plate-open="77"]';
  check('у плиты есть дверь-имя', (await page.$(name)) !== null);
  const meta = await page.$eval(name, (el) => ({
    text: el.textContent.trim(),
    tab: el.tabIndex,
    cursor: getComputedStyle(el).cursor,
    pe: getComputedStyle(el).pointerEvents,
  }));
  check('дверь — само имя плиты', meta.text.toLowerCase() === 'front', meta.text);
  check('курсор zoom-in', meta.cursor === 'zoom-in', meta.cursor);
  check('вне порядка таба', meta.tab === -1, String(meta.tab));
  const before = (await state()).added;
  const box = await page.$eval(name, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(450);
  const s1 = await state();
  check('нажатие по имени открывает крупный вид ровно раз', JSON.stringify(s1.zooms) === '[0]', JSON.stringify(s1));
  check('и не ставит выноску', s1.added === before, `${before} → ${s1.added}`);

  const zoomWord = await page.$$eval('[data-plate-tile] button', (ns) =>
    ns.filter((n) => /^\s*zoom\s*$/i.test(n.textContent ?? '')).length,
  );
  check('кнопки со словом zoom на плите нет', zoomWord === 0, String(zoomWord));

  // ── ВЫБРАННАЯ И НАВЕДЁННАЯ ИЗ СПИСКА ВЫНОСКА (T34, R43/R18) ──
  await page.evaluate(() => window.__hot(true));
  await page.waitForTimeout(250);
  const extra = await page.evaluate(() => {
    const tile = document.querySelector('[data-plate-tile]');
    const frame = tile.querySelector('[data-annot-frame]').getBoundingClientRect();
    const plate = tile.querySelector('[data-callout-selected]');
    if (!plate) return { plate: false };
    const pr = plate.getBoundingClientRect();
    const x = pr.left + pr.width / 2;
    const y = pr.top + pr.height / 2;
    // Всё с рамкой, что лежит на точке подписи или обводит линию, кроме самой плашки и ручек.
    const boxed = [...tile.querySelectorAll('*')].filter((el) => {
      if (el === plate || plate.contains(el) || el.closest('[role="button"][title^="drag"]')) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (!(parseFloat(cs.borderTopWidth) > 0) || cs.borderTopStyle === 'none') return false;
      const r = el.getBoundingClientRect();
      if (r.width >= frame.width - 2 && r.height >= frame.height - 2) return false; // сам кадр/плитка
      const atLabel = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const aroundLine = r.left <= frame.left + frame.width * 0.12 && r.right >= frame.left + frame.width * 0.58 && r.top <= frame.top + frame.height * 0.5 && r.bottom >= frame.top + frame.height * 0.52;
      return atLabel || aroundLine;
    });
    return { plate: true, boxed: boxed.map((e) => `${e.tagName}.${(e.getAttribute('class') || '').slice(0, 50)}`) };
  });
  const SHOT = (process.argv.find((a) => a.startsWith('--shot=')) ?? '').split('=')[1];
  if (SHOT) await (await page.$('[data-plate-tile]')).screenshot({ path: SHOT, animations: 'disabled' });
  check('выбранная+наведённая: квадрата у подписи и рамки вокруг линии нет', extra.plate && extra.boxed.length === 0, JSON.stringify(extra));
} finally {
  await browser.close();
}

console.log(`plate-open${MUTANT ? ` [mutant ${MUTANT}]` : ''}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
