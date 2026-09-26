#!/usr/bin/env node
// ПРОБА-СКРИНШОТ ШАГА 3 PATTERN (студия тех-карты, 2026-09-26).
//
// Не сторож с порогами, а СТЕНД ДЛЯ ГЛАЗА: он монтирует настоящий `PatternStudio` (точка входа
// `pattern-step-entry.tsx`) под провайдерами композитора, проводит экран по шести состояниям,
// снимает каждое в двух ширинах и собирает всё, что страница сказала в консоль. Картинки идут на
// UX-разбор, консоль — на разбор ошибок исполнения. Падает проба только тогда, когда сценарий не
// дошёл до своего кадра (экран не отрисовался, дверь не открылась) или страница бросила исключение.
//
// СЦЕНАРИИ (номера — из постановки):
//   1 empty      — колорвеев нет;
//   2 no-slots   — колорвеи есть, тканей в BOM нет (только нитки и фурнитура);
//   3 full       — 2 колорвея × 3 слота, две надетые ткани, живой прогон, IMAGE TO FABRIC и карусель;
//   4 gate       — полоса без `assetBindings` (бинарь старше привязок);
//   5 pantone    — пикер пантона открыт на ряду ROSSO × outer: полоса оттенков и «from this card»;
//   6 use-for    — `use for ▸` карусели: шаг 1 (колорвеи), шаг 2 (слоты), и после выбора — ткань
//                  встала в ячейку пары через `SetDesignAssetBinding` и перечитывание полосы;
//   7 generate   — (сверх постановки) `generate` у ряда OLIVE × inner: `StartDesignRun` и ячейка
//                  переходит в «making the fabric…» после перечитывания полосы;
//   8 failed     — (ревью M-1) следы прогонов, не давших ткани: строка под рядом пары (упал,
//                  отменён, `done` + `library_full`) и пунктирная плитка «картинка → ткань» в голове
//                  карусели; следа нет у пары, одетой позже падения, и у пары с живым прогоном.
//
// React собирается в РАЗРАБОТОЧНОМ режиме: предупреждения о ключах, об обновлении чужого
// компонента во время рендера и т.п. существуют только там, а ради них проба и ставится.
//
// Запуск:  node scripts/pattern-step-probe.mjs [--out <каталог>] [--prod]
//   по умолчанию кадры ложатся в tmp/plans/pattern-step3/shots/ (tmp/ в .gitignore).
// Нужен `yarn build` (CSS админки берётся из dist/assets — без него ни одного tailwind-класса).

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(argAfter('--out') ?? resolve(REPO, 'tmp/plans/pattern-step3/shots'));
const PROD = process.argv.includes('--prod');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// ─── PLAYWRIGHT ────────────────────────────────────────────────────────────────────────────────
// Три места, где он бывает: зависимость репозитория, кэш npx, глобальная установка node.
function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (existsSync(root)) {
      const found = execFileSync(
        'find',
        [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter(Boolean)[0];
      if (found) return `${found}/index.js`;
    }
  } catch {
    /* дальше — глобальный */
  }
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const p = resolve(globalRoot, 'playwright/index.js');
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден (ни в репозитории, ни в ~/.npm/_npx, ни глобально)');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright есть, а chromium в нём нет');

// ─── ЗАГЛУШЁННАЯ СЕТЬ ──────────────────────────────────────────────────────────────────────────
// ПО СУФФИКСУ ПУТИ: `api/api` достижим и алиасом, и относительным импортом. Каждый метод идёт в
// `window.__patternApi[метод]` точки входа; метода там нет — ответ `{}` и запись в журнал
// «unstubbed», чтобы разбор видел, чего экран просил сверх заглушённого.
const STUB_MARKER = 'PROBE_STUB_PATTERN_STEP3_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const call = (method) => (req) => {
  const w = globalThis;
  w.__stubMarker = '${STUB_MARKER}';
  (w.__pattern ? w.__pattern.calls : (w.__earlyCalls = w.__earlyCalls || [])).push({ method, req });
  const h = (w.__patternApi || {})[method];
  if (!h) {
    (w.__unstubbed = w.__unstubbed || []).push(method);
    return Promise.resolve({});
  }
  try {
    return Promise.resolve(h(req || {}));
  } catch (e) {
    return Promise.reject(e);
  }
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({
      path: 'probe-stub-api',
      namespace: 'probe-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

// ─── СБОРКА ────────────────────────────────────────────────────────────────────────────────────
const mode = PROD ? 'production' : 'development';
const outfile = resolve(tmpdir(), `pattern-step3-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'pattern-step-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  loader: {
    '.svg': 'text',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.woff2': 'dataurl',
    '.ttf': 'dataurl',
    '.css': 'empty',
    '.scss': 'empty',
  },
  alias: { '@': resolve(REPO, 'src') },
  // ЗАГЛУШКА ПРАВДА ПЕРЕДАНА: забытый `plugins` оставил бы в бандле настоящий клиент.
  plugins: [stub],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': JSON.stringify({
      VITE_SERVER_URL: 'http://stub.invalid',
      MODE: mode,
      DEV: !PROD,
      PROD,
    }),
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в бандле нет «${STUB_MARKER}» — сеть НЕ заглушена`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в бандле остался «${REAL_API_MARKER}» — настоящий api-слой внутри`);
if (!bundle.includes('a fabric swatch for every colourway and slot'))
  dieNotRun('в бандле нет экрана шага PATTERN — собралось не то');

// ─── CSS И ШРИФТЫ АДМИНКИ ─────────────────────────────────────────────────────────────────────
const ASSETS = resolve(REPO, 'dist/assets');
let assetNames = [];
try {
  assetNames = readdirSync(ASSETS);
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
}
const cssLinks = assetNames.filter((f) => /^(index|style)-.*\.css$/.test(f));
if (!cssLinks.some((f) => f.startsWith('index-')))
  dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');

const ORIGIN = 'http://probe.local';
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pattern step probe</title>
${cssLinks.map((f) => `<link rel="stylesheet" href="/assets/${f}">`).join('\n')}
</head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;
const MIME = {
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ─── СЦЕНАРИИ ──────────────────────────────────────────────────────────────────────────────────
const VIEWPORTS = [
  { w: 1280, h: 900 },
  { w: 1024, h: 800 },
];

mkdirSync(OUT, { recursive: true });
const shots = [];
const log = [];
let failures = 0;

const browser = await chromium
  .launch()
  .catch(() =>
    existsSync('/opt/pw-browsers/chromium')
      ? chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
      : Promise.reject(new Error('chromium не запускается')),
  )
  .catch((e) => dieNotRun(e.message));

/** Все картинки на странице декодированы — иначе кадр ловит пустые ячейки на месте тканей. */
async function settle(page) {
  await page
    .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
}

const SELFTEST = '__pattern_probe_console_selftest__';

async function withPage(vp, label, fn) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  const entry = { label: `${label} @ ${vp.w}x${vp.h}`, messages: [], notes: [] };
  log.push(entry);
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning' || t === 'assert')
      entry.messages.push(`[console.${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => entry.messages.push(`[pageerror] ${e.stack || e.message || e}`));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const u = new URL(url);
    if (u.origin === ORIGIN) {
      if (u.pathname === '/' || u.pathname === '/index.html')
        return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
      if (u.pathname === '/bundle.js')
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: bundle });
      if (u.pathname.startsWith('/assets/')) {
        const file = resolve(ASSETS, u.pathname.slice('/assets/'.length));
        if (file.startsWith(ASSETS) && existsSync(file))
          return route.fulfill({
            status: 200,
            contentType: MIME[extname(file)] ?? 'application/octet-stream',
            body: readFileSync(file),
          });
      }
    }
    entry.messages.push(`[network-blocked] ${route.request().method()} ${url}`);
    return route.abort();
  });
  try {
    await page.goto(`${ORIGIN}/`);
    // ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ КАНАЛА: «ни одной ошибки» ничего не значит, пока не показано, что
    // ошибка, если бы она была, дошла бы до журнала. Контрольная строка из журнала убирается.
    await page.evaluate((s) => console.error(s), SELFTEST);
    await page.waitForTimeout(50);
    const at = entry.messages.findIndex((m) => m.includes(SELFTEST));
    if (at < 0) throw new Error('канал консоли глух: контрольный console.error не дошёл');
    entry.messages.splice(at, 1);
    await fn(page, entry);
  } catch (e) {
    failures++;
    entry.notes.push(`СЦЕНАРИЙ НЕ ДОШЁЛ ДО КАДРА: ${e.message.split('\n')[0]}`);
    const file = resolve(OUT, `FAILED-${label}-${vp.w}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    shots.push(file);
  }
  const unstubbed = await page.evaluate(() => globalThis.__unstubbed ?? []).catch(() => []);
  if (unstubbed.length)
    entry.notes.push(`незаглушённые вызовы (ответ {}): ${[...new Set(unstubbed)].join(', ')}`);
  if (entry.messages.some((m) => m.startsWith('[pageerror]'))) failures++;
  await page.close();
}

async function mount(page, scenario) {
  await page.evaluate((s) => window.__pattern.mount(s), scenario);
  await page.waitForSelector('[data-probe-state="ready"]', { timeout: 10000 });
  await page.waitForSelector('#design-pattern', { timeout: 10000 });
  await settle(page);
}

async function shoot(page, name, vp, opts = { fullPage: true }) {
  const file = resolve(OUT, `${name}-${vp.w}.png`);
  await page.screenshot({ path: file, ...opts });
  shots.push(file);
  return file;
}

/** Сверка разметки — в журнал, не в провал: это стенд для глаза, а не сторож. */
async function facts(page, entry, pairs) {
  for (const [what, sel, want] of pairs) {
    const n = await page.locator(sel).count();
    entry.notes.push(
      `${n === want ? 'ok  ' : 'DIFF'} ${what}: ${n}${n === want ? '' : ` (ожидалось ${want})`}`,
    );
  }
}

const cellOf = (cw, bom) => `[data-slot-row="${bom}"][data-slot-colourway="${cw}"]`;

for (const vp of VIEWPORTS) {
  // (1) нет колорвеев
  await withPage(vp, '1-empty', async (page, entry) => {
    await mount(page, 'empty');
    await facts(page, entry, [
      ['пустое состояние «колорвеев нет»', '[data-pattern-empty="colourways"]', 1],
      ['рядов пар', '[data-slot-row]', 0],
      ['плиток карусели', '[data-fabric-tile]', 0],
    ]);
    await shoot(page, '1-empty', vp);
  });

  // (2) колорвеи есть, слотов нет
  await withPage(vp, '2-no-slots', async (page, entry) => {
    await mount(page, 'no-slots');
    await facts(page, entry, [
      ['пустое состояние «слотов нет»', '[data-pattern-empty="slots"]', 1],
      ['рядов пар', '[data-slot-row]', 0],
      ['плиток карусели', '[data-fabric-tile]', 3],
    ]);
    await shoot(page, '2-no-slots', vp);
  });

  // (3) полный
  await withPage(vp, '3-full', async (page, entry) => {
    await mount(page, 'full');
    await facts(page, entry, [
      ['групп колорвеев', '[data-slot-colourway-group]', 2],
      ['рядов пар (2 × 3)', '[data-slot-row]', 6],
      ['надетых тканей в ячейках', '[data-slot-fabric]', 2],
      ['живой прогон в ячейке ROSSO × inner', `${cellOf(11, 2)} [data-pattern-pending]`, 1],
      ['строка «несохранённый слот»', '[data-slots-unsaved="1"]', 1],
      ['блок IMAGE TO FABRIC', '[data-image-to-fabric]', 1],
      ['плиток карусели', '[data-fabric-tile]', 3],
      ['живых generate', '[data-slot-generate="live"]', 5],
      ['нано-строк «где в рендере» под плитками (U-5)', '[data-fabric-worn-by]', 2],
      ['унаследованных цветов на двери (m-3/U-4)', '[data-slot-colour-inherited]', 2],
    ]);
    await shoot(page, '3-full', vp);
    await shoot(page, '3-full-viewport', vp, { fullPage: false });
  });

  // (4) ворота возможности
  await withPage(vp, '4-gate', async (page, entry) => {
    await mount(page, 'gate');
    await facts(page, entry, [
      ['строка ворот', '[data-pattern-capability="absent"]', 1],
      ['рядов пар', '[data-slot-row]', 0],
      ['карусели', '[data-fabric-carousel]', 0],
    ]);
    await shoot(page, '4-gate', vp);
  });

  // (5) пикер пантона на ряду ROSSO × outer
  await withPage(vp, '5-pantone', async (page, entry) => {
    await mount(page, 'full');
    const name = 'slot-11-1';
    const trigger = page.locator(`[data-pantone-picker="${name}"]`);
    await trigger.evaluate((n) => {
      n.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -140);
    });
    await trigger.click();
    await page.waitForSelector(`[data-pantone-shades="${name}"]`, { timeout: 5000 });
    await page.waitForSelector(`[data-pantone-suggested="${name}"]`, { timeout: 5000 });
    await settle(page);
    const suggested = await page
      .locator(`[data-pantone-suggested="${name}"] [data-pantone-option]`)
      .evaluateAll((ns) => ns.map((n) => n.getAttribute('data-pantone-option')));
    entry.notes.push(`«from this card»: ${suggested.join(', ') || '(пусто)'}`);
    const shades = await page
      .locator(`[data-pantone-shades="${name}"] [data-pantone-shade]`)
      .count();
    entry.notes.push(`оттенков в полосе (с «all»): ${shades}`);
    await shoot(page, '5-pantone-open', vp, { fullPage: false });
    // Второй кадр — оттенок выбран: полоса отфильтровала сетку.
    const red = page
      .locator(
        `[data-pantone-shades="${name}"] [data-pantone-shade]:not([data-pantone-shade="all"])`,
      )
      .first();
    if (await red.count()) {
      const id = await red.getAttribute('data-pantone-shade');
      await red.click();
      await settle(page);
      entry.notes.push(`выбран оттенок: ${id}`);
      await shoot(page, '5-pantone-shade', vp, { fullPage: false });
    }
  });

  // (6) карусель: `use for ▸`, два шага и выбор
  await withPage(vp, '6-use-for', async (page, entry) => {
    await mount(page, 'full');
    const door = page.locator('[data-fabric-use-for="103"] button');
    await door.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await door.click();
    await page.waitForSelector('[data-picker-step="1"]', { timeout: 5000 });
    await settle(page);
    await shoot(page, '6-use-for-step1', vp, { fullPage: false });
    await page.locator('[data-picker-branch="11"]').click();
    await page.waitForSelector('[data-picker-step="2"]', { timeout: 5000 });
    await settle(page);
    const leaves = await page.locator('[data-picker-leaf]').evaluateAll((ns) =>
      ns.map((n) =>
        [...n.children]
          .map((c) => (c.textContent ?? '').trim())
          .filter(Boolean)
          .join(' · '),
      ),
    );
    entry.notes.push(`листья шага 2 (ROSSO): ${leaves.join(' | ')}`);
    await shoot(page, '6-use-for-step2', vp, { fullPage: false });
    await page.locator('[data-picker-leaf="3"]').click();
    await page.waitForSelector(`${cellOf(11, 3)} [data-slot-fabric="103"]`, { timeout: 5000 });
    await settle(page);
    const writes = await page.evaluate(() =>
      window.__pattern.calls.filter((c) => c.method === 'SetDesignAssetBinding').map((c) => c.req),
    );
    entry.notes.push(`SetDesignAssetBinding: ${JSON.stringify(writes)}`);
    await shoot(page, '6-use-for-after', vp);
  });

  // (7) generate у ряда OLIVE × inner (цвет — запасной hex колорвея)
  await withPage(vp, '7-generate', async (page, entry) => {
    await mount(page, 'full');
    const row = page.locator(cellOf(12, 2));
    const colour = await row.locator('[data-slot-colour]').getAttribute('data-slot-colour');
    entry.notes.push(`цвет ряда OLIVE × inner до нажатия: ${colour}`);
    await row.locator('[data-slot-generate="live"] button').click();
    await page.waitForSelector(`${cellOf(12, 2)} [data-pattern-pending]`, { timeout: 5000 });
    await settle(page);
    const runs = await page.evaluate(() =>
      window.__pattern.calls
        .filter((c) => c.method === 'StartDesignRun')
        .map((c) => ({
          kind: c.req.kind,
          colorwayId: c.req.params?.colorwayId,
          colour: c.req.params?.colour,
          pattern: c.req.params?.pattern,
        })),
    );
    entry.notes.push(`StartDesignRun: ${JSON.stringify(runs)}`);
    // Тост успеха — по роду прогона (U-7): у свотча «in its slot — or in LAST FABRICS».
    const toast = await page
      .getByText('run started', { exact: false })
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => '(нет тоста)');
    entry.notes.push(`тост: ${(toast ?? '').trim()}`);
    await row.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await shoot(page, '7-generate-after', vp, { fullPage: false });
  });

  // (8) следы прогонов, не давших ткани (ревью M-1)
  await withPage(vp, '8-failed', async (page, entry) => {
    await mount(page, 'failed');
    await facts(page, entry, [
      ['следов под рядами', '[data-slot-last-run]', 3],
      ['след ROSSO × contrast', `${cellOf(11, 3)} [data-slot-last-run="911"]`, 1],
      ['след OLIVE × inner (library_full)', `${cellOf(12, 2)} [data-slot-last-run="912"]`, 1],
      [
        'след OLIVE × outer (отменён после привязки)',
        `${cellOf(12, 1)} [data-slot-last-run="913"]`,
        1,
      ],
      ['нет следа у ROSSO × outer (одет позже)', `${cellOf(11, 1)} [data-slot-last-run]`, 0],
      ['нет следа у ROSSO × inner (живой прогон)', `${cellOf(11, 2)} [data-slot-last-run]`, 0],
      ['пунктирная плитка «картинка → ткань»', '[data-fabric-failed="915"]', 1],
    ]);
    const lines = await page
      .locator('[data-slot-last-run]')
      .evaluateAll((ns) => ns.map((n) => (n.textContent ?? '').trim()));
    entry.notes.push(`строки следов: ${lines.join(' | ')}`);
    await shoot(page, '8-failed', vp);
  });
}

await browser.close();

// ─── ЖУРНАЛ ────────────────────────────────────────────────────────────────────────────────────
const lines = [
  `pattern step 3 probe — ${new Date().toISOString()} — React ${mode}`,
  `bundle: scripts/pattern-step-entry.tsx; css: ${cssLinks.join(', ')}`,
  '',
];
for (const e of log) {
  lines.push(`=== ${e.label}`);
  for (const n of e.notes) lines.push(`  · ${n}`);
  if (!e.messages.length) lines.push('  (console: no errors or warnings)');
  for (const m of e.messages) lines.push(`  ${m}`);
  lines.push('');
}
writeFileSync(resolve(OUT, 'console.txt'), lines.join('\n'));
console.log(lines.join('\n'));
console.log(`кадров: ${shots.length}`);
for (const s of shots) console.log(`  ${s}`);
console.log(`\nсценариев с провалом: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
