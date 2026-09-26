#!/usr/bin/env node
// PLAYGROUND ЖИВЬЁМ: ОДНА ОПЛАТА НА ОДНО НАМЕРЕНИЕ, ФОКУС, ИСТОРИЯ ПО СПИСКАМ (G-01).
//
// Монтируется НАСТОЯЩИЙ `PlaygroundStudio` с историей под ним (scripts/playground-studio-entry.tsx)
// в Chromium; сеть заглушена, `StartDesignRun` ОТЛОЖЕН — проба отвечает на него сама: успехом,
// потерянным ответом или никак. Заглушка ведёт «сервер»: одна логическая оплата на один
// `client_request_id` — ровно то, как сервер дедуплицирует (store/design wave2.go).
//
//   A · нажать GENERATE, уйти к сетке (Back) пока ответа нет, открыть ту же плитку: GENERATE всё
//       ещё «starting…», |→ ждёт; ответ потерялся — повторное нажатие несёт ТОТ ЖЕ id, оплата одна;
//       успех, пришедший при размонтированной форме, всё равно записан в «Recently used»; после
//       подтверждённого успеха следующее нажатие — НОВЫЙ id (иначе мы задушили бы второй прогон);
//   B · нажать, ПЕРЕЗАГРУЗИТЬ вкладку, пока ответа нет, собрать тот же черновик — тот же id;
//   C · фокус: открытие плитки с клавиатуры — на заголовок формы; «what the model gets» закрыт
//       Escape — на свою кнопку; |→ — на плитку, из которой пришли;
//   D · история: бюджет дочитывания, потраченный под Change a Color, не переходит к Create or edit —
//       та просит своё продолжение и показывает свои строки.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается), каждая роняет СВОЮ группу:
//   --mutate-ledger      ledgerSend всегда чеканит новый id                    → A и B
//   --mutate-no-storage  журнал не пишется в sessionStorage                    → B
//   --mutate-accepted    onAccepted снова per-call опция mutate                 → A (Recently used)
//   --mutate-focus       фокус не следует за экраном                            → C
//   --mutate-wmg-focus   «what the model gets» закрывается без возврата фокуса  → C
//   --mutate-reuse-focus галерея «reuse» закрывается без возврата фокуса         → C
//   --mutate-pending-local «starting…» снова читается только из своей формы      → A
//   --mutate-scope       бюджет дочитывания не знает имени списка               → D
//   --mutate-results-cut    итоги не читают ResultsDef.cutout                    → E
//   --mutate-results-select итоги не читают ResultsDef.selectable                → E
//
//   E · итоги на сетке: вырез стоит со словом «no background», перекрас — с дверью select; оба
//       решения читаются из ResultsDef плитки, сделавшей прогон (G-01, Fable M-1, M-2).
//
// Нет Chromium — КОД 2 и слово «НЕ ВЫПОЛНЕНА»: пропуск — это не зелень.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

function dieNotRun(why) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
}

const KNOWN = new Set([
  '--mutate-ledger',
  '--mutate-no-storage',
  '--mutate-accepted',
  '--mutate-focus',
  '--mutate-wmg-focus',
  '--mutate-reuse-focus',
  '--mutate-pending-local',
  '--mutate-scope',
  '--mutate-results-cut',
  '--mutate-results-select',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATED = [...KNOWN].some(on);

// ─── мутации: одна строка НАСТОЯЩЕГО модуля подменяется в бандле ─────────────────────────────
const patch = (name, filter, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) dieNotRun(`мутация «${name}» не нашла свой якорь в ${args.path}`);
      return {
        contents: src.replace(needle, replacement),
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
      };
    });
  },
});
const plugins = [];
if (on('--mutate-ledger'))
  plugins.push(
    patch(
      'ledger-always-mints',
      /render\/run-ledger\.ts$/,
      'const id = found ? found.id : newClientRequestId();',
      'const id = newClientRequestId();',
    ),
  );
if (on('--mutate-no-storage'))
  plugins.push(
    patch(
      'ledger-no-storage',
      /render\/run-ledger\.ts$/,
      'window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));',
      'void book();',
    ),
  );
if (on('--mutate-accepted'))
  plugins.push(
    patch(
      'accepted-per-call',
      /render\/use-design-run\.ts$/,
      `      mutation.mutate({
        ...input,
        techCardId,
        clientRequestId,
        scope,
        fingerprint,
        onAccepted: opts?.onAccepted,
      });`,
      `      mutation.mutate(
        { ...input, techCardId, clientRequestId, scope, fingerprint },
        opts?.onAccepted ? { onSuccess: () => opts.onAccepted?.() } : undefined,
      );`,
    ),
  );
if (on('--mutate-focus'))
  plugins.push(
    patch(
      'focus-stays',
      /playground\/studio\.tsx$/,
      '    if (was === openKey) return;',
      '    if (was === openKey || true) return;',
    ),
  );
if (on('--mutate-wmg-focus'))
  plugins.push(
    patch(
      'wmg-no-return',
      /playground\/workflow-panel\.tsx$/,
      '        onCloseAutoFocus={inspectFocus.onCloseAutoFocus}',
      '',
    ),
  );
if (on('--mutate-reuse-focus'))
  plugins.push(
    patch(
      'reuse-no-return',
      /fields\/reuse\.tsx$/,
      "    focus.remember(door.current?.querySelector<HTMLElement>('button'));",
      '',
    ),
  );
if (on('--mutate-pending-local'))
  plugins.push(
    patch(
      'pending-local',
      /render\/use-design-run\.ts$/,
      'isPending: mutation.isPending || (!!scope && scopedPending > 0),',
      'isPending: mutation.isPending,',
    ),
  );
if (on('--mutate-results-cut'))
  plugins.push(
    patch(
      'results-cut-blind',
      /playground\/results\.tsx$/,
      'const cut = !!own?.cutout;',
      'const cut = false;',
    ),
  );
if (on('--mutate-results-select'))
  plugins.push(
    patch(
      'results-select-blind',
      /playground\/results\.tsx$/,
      'const selectable = !!own?.selectable;',
      'const selectable = false;',
    ),
  );
if (on('--mutate-scope'))
  plugins.push(
    patch(
      'budget-blind-to-scope',
      /generation\/generation-history\.tsx$/,
      'const autofillSlot = `${techCardId}:${rep}:${scopeKey}:${current}`;',
      'const autofillSlot = `${techCardId}:${rep}:${current}`;',
    ),
  );

// ─── заглушенная сеть ──────────────────────────────────────────────────────────────────────────
// По суффиксу пути: `api/api` достижим и алиасом, и относительным импортом. Маркер ищется в
// собранном бандле — без него настоящий клиент мог бы остаться внутри и пойти в сеть.
const STUB_MARKER = 'PROBE_STUB_G01_PLAYGROUND_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const g = globalThis;
g.__pgStub = '${STUB_MARKER}';
g.__pgCalls = g.__pgCalls || [];
g.__pgLogical = g.__pgLogical || new Set();
g.__pgOut = g.__pgOut || [];
const call = (method) => (req) => {
  g.__pgCalls.push({ method, req: JSON.parse(JSON.stringify(req ?? {})) });
  if (method === 'StartDesignRun') {
    // «Сервер» бронирует прогон на КЛЮЧ: второй запрос с тем же ключом — тот же прогон.
    g.__pgLogical.add(req.clientRequestId);
    return new Promise((res, rej) => g.__pgOut.push({ req, res, rej }));
  }
  if (method === 'ListDesignRuns') {
    const page = (g.__pgPages || {})[req.pageToken] || { runs: [], nextPageToken: '' };
    return Promise.resolve(page);
  }
  return Promise.resolve({});
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

// ─── playwright ────────────────────────────────────────────────────────────────────────────────
function playwrightCandidates() {
  const out = [];
  try {
    out.push(createRequire(import.meta.url).resolve('playwright'));
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
        .filter(Boolean);
      for (const dir of found) out.push(`${dir}/index.js`);
    }
  } catch {
    /* нет кэша */
  }
  return out;
}
let browser = null;
for (const entry of playwrightCandidates()) {
  try {
    const pw = await import(pathToFileURL(entry).href);
    const chromium = pw.chromium ?? pw.default?.chromium;
    if (!chromium) continue;
    browser = await chromium.launch();
    break;
  } catch {
    /* у этой копии нет своего браузера — следующая */
  }
}
if (!browser) dieNotRun('playwright с chromium не найден — живого стенда нет, доказывать нечем');

// ─── сборка ────────────────────────────────────────────────────────────────────────────────────
const outfile = resolve(tmpdir(), `playground-studio-${process.pid}.js`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-studio-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
    alias: { '@': resolve(REPO, 'src') },
    plugins: [stub, ...plugins],
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
  });
} catch (e) {
  await browser.close();
  dieNotRun(`сборка упала — ${e.message}`);
}
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в бандле нет «${STUB_MARKER}» — сеть НЕ заглушена`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в бандле остался «${REAL_API_MARKER}» — настоящий api-слой`);

// ─── счёт ──────────────────────────────────────────────────────────────────────────────────────
let bad = 0;
let total = 0;
const failedIn = new Set();
let group = '';
const ck = (ok, what, d = '') => {
  total++;
  if (!ok) {
    bad++;
    failedIn.add(group);
  }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${!ok && d ? `  — ${d}` : ''}`);
};
const head = (id, s) => {
  group = id;
  console.log(`\n${id} · ${s}`);
};

// ─── стенд ─────────────────────────────────────────────────────────────────────────────────────
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://probe.local/tech-cards/') || url === 'http://probe.local/start') {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`,
    });
  }
  // Картинки, шрифты и всё прочее — никуда: стенд не ходит в сеть.
  return route.abort();
});

const CARD = 'http://probe.local/tech-cards/7?tab=studio&step=playground';
const settle = (ms = 80) => page.waitForTimeout(ms);
const wf = () => new URL(page.url()).searchParams.get('wf');

const RECOLOR_RUN = {
  id: 501,
  kind: 'recolor',
  status: 'done',
  ask: 'the denim jacket',
  params: {
    extraInputMediaIds: [101],
    colour: { code: '19-4052 TCX', hex: '#0F4C81', fabrics: [], words: '' },
  },
  inputs: {
    refs: [
      {
        mediaId: 101,
        deleted: false,
        media: { id: 101, media: { thumbnail: { mediaUrl: 'http://probe.local/m101.jpg' } } },
      },
    ],
  },
};
const EMPTY_BAND = {
  freeformPresets: ['free', 'cutout'],
  runs: [],
  nextPageToken: '',
  totalRuns: 0,
};

async function mount(band, url = CARD) {
  await page.goto('http://probe.local/start');
  await page.goto(url);
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate((b) => window.__pg.mount(b), band);
  await page.waitForSelector('[data-workflow-tile]');
}
const tileButton = (key) =>
  page.locator(`[data-workflow-tile="${key}"]`).locator('xpath=ancestor::button[1]');
const generate = () =>
  page.locator('[data-playground-open] button', { hasText: /^(GENERATE|starting…)$/ });
const backArrow = () => page.locator('[data-workflow-back]');
const calls = () =>
  page.evaluate(() =>
    window.__pgCalls.filter((c) => c.method === 'StartDesignRun').map((c) => c.req.clientRequestId),
  );
const logical = () => page.evaluate(() => window.__pgLogical.size);
const answer = (how) =>
  page.evaluate((how) => {
    const out = window.__pgOut.shift();
    if (!out) return false;
    if (how === 'ok') out.res({ run: { id: 900 + window.__pgLogical.size, status: 'pending' } });
    else out.rej(new Error('network: the answer was lost'));
    return true;
  }, how);
const recallInto = async () => {
  await page.evaluate((run) => window.__pg.recall(run), RECOLOR_RUN);
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
};
const recentText = () =>
  page.evaluate(() => localStorage.getItem('plm.playground.recent.v1:change_color.garment') ?? '');

head('A', 'уход к сетке, пока прогон стартует, и возврат: тот же ключ, одна оплата');
{
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck((await generate().textContent()) === 'GENERATE', 'черновик собран, GENERATE жив');
  await generate().click();
  await settle();
  const [first] = await calls();
  ck(!!first, 'первое нажатие ушло', String(first));
  ck((await generate().textContent()) === 'starting…', 'GENERATE — «starting…»');
  ck(await backArrow().isDisabled(), '|→ ждёт ответа');

  await page.goBack();
  await settle();
  ck(
    wf() === null && (await page.locator('[data-playground-open]').count()) === 0,
    'Back — сетка, форма размонтирована',
    page.url(),
  );
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
  ck(
    (await generate().textContent()) === 'starting…' && (await generate().isDisabled()),
    'та же плитка снова открыта: прогон всё ещё «starting…», второе нажатие невозможно',
    await generate().textContent(),
  );
  ck(await backArrow().isDisabled(), '|→ по-прежнему ждёт');

  await answer('lost');
  await settle();
  ck((await generate().textContent()) === 'GENERATE', 'ответ потерян — GENERATE снова жив');
  await generate().click();
  await settle();
  const after = await calls();
  ck(after.length === 2, 'второе нажатие ушло', JSON.stringify(after));
  ck(after[1] === first, 'второе нажатие несёт ТОТ ЖЕ client_request_id', `${first} → ${after[1]}`);
  ck((await logical()) === 1, 'сервер держит ОДИН логический прогон', String(await logical()));

  // Успех приходит, когда формы уже нет: «Recently used» пишется всё равно.
  await page.goBack();
  await settle();
  ck((await page.locator('[data-playground-open]').count()) === 0, 'снова сетка, пока ответа нет');
  await answer('ok');
  await settle(150);
  ck(
    (await recentText()).includes('the denim jacket'),
    'успех при размонтированной форме записал слова в «Recently used»',
    await recentText(),
  );

  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
  await generate().click();
  await settle();
  const third = await calls();
  ck(
    third.length === 3 && third[2] !== first,
    'после подтверждённого успеха — НОВЫЙ ключ (новый прогон)',
    JSON.stringify(third),
  );
  await answer('ok');
  await settle();
}

head('B', 'перезагрузка вкладки, пока ответа нет: тот же черновик — тот же ключ');
{
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    window.__pgCalls.length = 0;
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  const [before] = await calls();
  ck(!!before, 'нажатие ушло');
  await page.reload();
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate((b) => window.__pg.mount(b), EMPTY_BAND);
  await page.waitForSelector('[data-playground-open], [data-workflow-tile]');
  if ((await page.locator('[data-playground-open="change_color"]').count()) === 0) {
    await tileButton('change_color').click();
    await page.waitForSelector('[data-playground-open="change_color"]');
  }
  await recallInto();
  ck(
    (await generate().textContent()) === 'GENERATE',
    'после перезагрузки GENERATE жив (ответа ждать уже некому)',
  );
  await generate().click();
  await settle();
  const [again] = await calls();
  ck(again === before, 'после перезагрузки — тот же client_request_id', `${before} → ${again}`);
  await answer('ok');
  await settle();
}

head('C', 'фокус: открытие, «what the model gets», «reuse», |→');
{
  // Одна картинка на карточке — чтобы у «reuse» был живой источник «this card».
  await mount({
    ...EMPTY_BAND,
    runs: [
      {
        id: 70,
        kind: 'render',
        status: 'done',
        pictures: [
          {
            id: 700,
            ordinal: 1,
            media: { id: 700, media: { thumbnail: { mediaUrl: 'http://probe.local/p.jpg' } } },
          },
        ],
      },
    ],
  });
  await tileButton('change_color').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
  ck(
    await page.evaluate(
      () => document.activeElement?.hasAttribute('data-workflow-heading') === true,
    ),
    'открытие с клавиатуры — фокус на заголовке формы',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  const wmg = page.locator('[data-playground-open] button', { hasText: 'what the model gets' });
  await wmg.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.tagName === 'BUTTON' &&
        (document.activeElement.textContent ?? '').includes('what the model gets'),
    ),
    'Escape — фокус снова на «what the model gets ▸»',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  const reuse = page.locator('[data-fold-section="change_color.photos"] button', {
    hasText: /^reuse/,
  });
  await reuse.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-reuse-source="card"]:not([disabled])');
  await page.locator('[data-reuse-source="card"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-card-picker]');
  await settle();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-card-picker]', { state: 'detached' });
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.tagName === 'BUTTON' &&
        /^reuse/.test((document.activeElement.textContent ?? '').trim()),
    ),
    'галерея «reuse» закрыта — фокус снова на двери «reuse»',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  await backArrow().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.querySelector('[data-workflow-tile="change_color"]') !== null &&
        document.activeElement?.tagName === 'BUTTON',
    ),
    '|→ — фокус на плитке, из которой пришли',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
}

head('D', 'история: бюджет дочитывания принадлежит списку, а не шагу');
{
  const run = (id, kind, extra = {}) => ({
    id,
    kind,
    status: 'done',
    ask: '',
    pictures: [],
    ...extra,
  });
  const band = {
    freeformPresets: ['free', 'cutout'],
    // Первая страница: один перекрас и два выреза — сетке (комната) хватает трёх строк, она не
    // дочитывает; Change a Color видит одну и тратит свой бюджет.
    runs: [run(60, 'recolor'), run(59, 'cutout'), run(58, 'cutout')],
    nextPageToken: 't1',
    totalRuns: 18,
    archivedRuns: 0,
  };
  await page.goto('http://probe.local/start');
  await page.goto(`${CARD}&wf=change_color`);
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate(() => {
    window.__pgCalls.length = 0;
    const r = (id, kind) => ({ id, kind, status: 'done', ask: '', pictures: [] });
    window.__pgPages = {
      // Страница t1 — двенадцать рендеров: ни одной строки ни одной плитке.
      t1: { runs: Array.from({ length: 12 }, (_, i) => r(57 - i, 'render')), nextPageToken: 't2' },
      // Страница t2 — три свободных прогона Create or edit.
      t2: { runs: [r(44, 'freeform'), r(43, 'freeform'), r(42, 'freeform')], nextPageToken: '' },
    };
  });
  await page.evaluate((b) => window.__pg.mount(b), band);
  await page.waitForSelector('[data-playground-open="change_color"]');
  await page.locator('[aria-controls="design-history-runs"]').click();
  await settle(250);
  const lists = () =>
    page.evaluate(() =>
      window.__pgCalls.filter((c) => c.method === 'ListDesignRuns').map((c) => c.req.pageToken),
    );
  ck(
    JSON.stringify(await lists()) === '["t1"]',
    'Change a Color потратил бюджет на одну страницу',
    JSON.stringify(await lists()),
  );
  ck(
    (await page.locator('#design-history [data-run="60"]').count()) === 1,
    '…и показывает свой перекрас',
  );

  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="create_edit"]');
  await settle(150);
  ck(
    JSON.stringify(await lists()) === '["t1"]',
    'сетке хватает своих строк — она ничего не просит',
    JSON.stringify(await lists()),
  );
  await tileButton('create_edit').click();
  await page.waitForSelector('[data-playground-open="create_edit"]');
  await settle(300);
  ck(
    JSON.stringify(await lists()) === '["t1","t2"]',
    'Create or edit просит СВОЁ продолжение (бюджет списка новый)',
    JSON.stringify(await lists()),
  );
  ck(
    (await page.locator('#design-history [data-run="44"]').count()) === 1,
    '…и показывает свои прогоны со страницы t2',
    `${await page.locator('#design-history [data-run]').count()} строк`,
  );
  ck(
    (await page.locator('#design-history-runs').count()) === 1,
    'свёртка истории осталась открытой при смене плитки',
  );
}

head('E', 'итоги: вырез — «no background», перекрас — select; из ResultsDef своей плитки');
{
  const pic = (id) => ({
    id,
    ordinal: 1,
    selected: false,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/${id}.png` } } },
  });
  await mount({
    ...EMPTY_BAND,
    runs: [
      { id: 81, kind: 'cutout', status: 'done', pictures: [pic(801)] },
      { id: 80, kind: 'recolor', status: 'done', pictures: [pic(802)] },
    ],
  });
  const cutTile = page.locator('[data-pg-output="801"]');
  const recolourTile = page.locator('[data-pg-output="802"]');
  ck(
    (await cutTile.count()) === 1 && (await recolourTile.count()) === 1,
    'на сетке обе картинки комнаты',
  );
  ck(
    (await cutTile.textContent()).includes('no background'),
    'под вырезом — «no background»',
    await cutTile.textContent(),
  );
  ck(
    !(await recolourTile.textContent()).includes('no background'),
    'под перекрасом этого слова нет',
  );
  ck(
    (await recolourTile.locator('[aria-label*="as chosen"]').count()) === 1,
    'у перекраса есть select',
  );
  ck((await cutTile.locator('[aria-label*="as chosen"]').count()) === 0, 'у выреза select нет');
}

ck(errors.length === 0, 'страница без ошибок', errors.join(' | '));
await browser.close();

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    (MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
