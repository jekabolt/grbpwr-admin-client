#!/usr/bin/env node
// PLAYGROUND ЖИВЬЁМ: ОДНА ОПЛАТА НА ОДНО НАМЕРЕНИЕ, ФОКУС, ИСТОРИЯ ПО СПИСКАМ (G-01, G-01 r2).
//
// Монтируется НАСТОЯЩИЙ `PlaygroundStudio` с историей под ним (scripts/playground-studio-entry.tsx)
// в Chromium; сеть заглушена, `StartDesignRun` ОТЛОЖЕН — проба отвечает на него сама: успехом,
// потерянным ответом, отказом с кодом или никак. Заглушка ведёт «сервер»: одна логическая оплата на
// один `client_request_id` — ровно то, как сервер дедуплицирует (store/design wave2.go).
//
//   A · нажать GENERATE, уйти с шага рельсом, пока ответа нет, вернуться, открыть ту же плитку:
//       GENERATE всё ещё «starting…», |→ ждёт; ответ потерялся — повторное нажатие несёт ТОТ ЖЕ id,
//       оплата одна; успех, пришедший при размонтированной форме, записан в «Recently used»; после
//       подтверждённого успеха следующее нажатие — НОВЫЙ id;
//   B · нажать, ПЕРЕЗАГРУЗИТЬ вкладку, пока ответа нет, собрать тот же черновик — тот же id;
//   C · фокус: открытие плитки с клавиатуры — на заголовок формы; «what the model gets» закрыт
//       Escape — на свою кнопку; «reuse» — на свою дверь; «reuse», заполнивший последний слот
//       (дверь погасла), — на заголовок формы (r2 N8); |→ — на плитку, из которой пришли;
//   D · история: бюджет дочитывания, потраченный под Change a Color, не переходит к Create or edit;
//   E · итоги на сетке: вырез — «no background», перекрас — select, из ResultsDef своей плитки;
//   F · история: страница и открытая колода сбрасываются сменой списка (сетка → плитка) (r2 п.8);
//   G · отказы (r2 N3): 4xx освобождает ключ — следующее нажатие новый id; 5xx и потерянный ответ
//       ключ держат; отказ ПОВТОРА после потерянного ответа ключ держит (прогон мог быть заведён);
//   H · отпечаток канонический (r2 N2): тот же запрос с другим порядком ключей и пробелами по краям —
//       тот же id; другой порядок картинок — другой id;
//   I · оператор (r2 N4): B в той же вкладке не наследует ни ключ A, ни «starting…» A;
//   J · срок ответа (r2 N5): зависший запрос отпускает форму с «no answer» и тем же id на повтор;
//       поздний успех всё равно освобождает ключ.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается), каждая роняет СВОЮ группу:
//   --mutate-ledger          ledgerSend всегда чеканит новый id                  → A, B
//   --mutate-no-storage      журнал не пишется в sessionStorage                  → B
//   --mutate-accepted        onAccepted снова per-call опция mutate               → A
//   --mutate-focus           фокус не следует за экраном                          → C
//   --mutate-wmg-focus       «what the model gets» закрывается без возврата фокуса → C
//   --mutate-reuse-focus     галерея «reuse» закрывается без возврата фокуса       → C
//   --mutate-focus-fallback  погасшая дверь — без запасного адресата              → C
//   --mutate-pending-local   «starting…» снова читается только из своей формы     → A
//   --mutate-scope           бюджет дочитывания не знает имени списка             → D
//   --mutate-results-cut     итоги не читают ResultsDef.cutout                    → E
//   --mutate-results-select  итоги не читают ResultsDef.selectable                → E
//   --mutate-scope-page      смена списка не сбрасывает страницу                  → F
//   --mutate-scope-deck      смена списка не складывает колоду                    → F
//   --mutate-refusal-keeps   4xx не освобождает ключ                              → G
//   --mutate-unsure-forgotten отказ повтора после тишины освобождает ключ         → G
//   --mutate-5xx-definitive  5xx считается окончательным отказом                  → G
//   --mutate-fingerprint     отпечаток — сырой JSON.stringify                     → H
//   --mutate-operator        журнал без оператора                                 → I
//   --mutate-operator-pending «starting…» без оператора                           → I
//   --mutate-no-deadline     срока ответа нет                                     → J
//   --mutate-late-lost       поздний успех теряется                               → J
//
// Нет Chromium — КОД 2 и слово «НЕ ВЫПОЛНЕНА»: пропуск — это не зелень. Сборка упала или якорь
// мутации/настройки не найден — тоже код 2. Playwright не в зависимостях репозитория (как у
// остальных браузерных проб здесь): node_modules, затем кэш npx; `npx playwright install chromium`.

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
  '--mutate-focus-fallback',
  '--mutate-pending-local',
  '--mutate-scope',
  '--mutate-results-cut',
  '--mutate-results-select',
  '--mutate-scope-page',
  '--mutate-scope-deck',
  '--mutate-refusal-keeps',
  '--mutate-unsure-forgotten',
  '--mutate-5xx-definitive',
  '--mutate-fingerprint',
  '--mutate-operator',
  '--mutate-operator-pending',
  '--mutate-no-deadline',
  '--mutate-late-lost',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATED = [...KNOWN].some(on);

// ─── правки бандла: настройка стенда и мутации, СКЛАДЫВАЮТСЯ в одном onLoad ─────────────────
// esbuild берёт первый onLoad, вернувший содержимое, поэтому две правки одного файла двумя
// плагинами не сложились бы: здесь один плагин применяет ВСЕ правки, чей фильтр подходит файлу.
// Якорь не найден — КОД 2: правка, которая не применилась, — это непроверенная проба.
const edits = [];
const patch = (name, filter, needle, replacement) =>
  edits.push({ name, filter, needle, replacement });
const editPlugin = {
  name: 'probe-edits',
  setup(b) {
    b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
      const mine = edits.filter((e) => e.filter.test(args.path));
      if (!mine.length) return undefined;
      let src = await readFile(args.path, 'utf8');
      for (const e of mine) {
        if (!src.includes(e.needle))
          dieNotRun(`правка «${e.name}» не нашла свой якорь в ${args.path}`);
        src = src.replace(e.needle, e.replacement);
      }
      return { contents: src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
};

// НАСТРОЙКА СТЕНДА (не мутация, всегда): срок ответа читается из `window.__pgDeadlineMs`, если он
// задан, — группа J ставит полсекунды, остальные идут с настоящим сроком.
patch(
  'deadline-knob',
  /render\/use-design-run\.ts$/,
  `        START_RUN_DEADLINE_MS,
        () => accepted(input),`,
  `        globalThis.__pgDeadlineMs ?? START_RUN_DEADLINE_MS,
        () => accepted(input),`,
);

if (on('--mutate-ledger'))
  patch(
    'ledger-always-mints',
    /render\/run-ledger\.ts$/,
    'const id = found ? found.id : newClientRequestId();',
    'const id = newClientRequestId();',
  );
if (on('--mutate-no-storage'))
  patch(
    'ledger-no-storage',
    /render\/run-ledger\.ts$/,
    'window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));',
    'void book();',
  );
if (on('--mutate-accepted'))
  patch(
    'accepted-per-call',
    /render\/use-design-run\.ts$/,
    `      mutation.mutate({
        wire,
        techCardId,
        clientRequestId,
        scope,
        fingerprint,
        onAccepted: opts?.onAccepted,
      });`,
    `      mutation.mutate(
        { wire, techCardId, clientRequestId, scope, fingerprint },
        opts?.onAccepted ? { onSuccess: () => opts.onAccepted?.() } : undefined,
      );`,
  );
if (on('--mutate-focus'))
  patch(
    'focus-stays',
    /playground\/studio\.tsx$/,
    '    if (was === openKey) return;',
    '    if (was === openKey || true) return;',
  );
if (on('--mutate-wmg-focus'))
  patch(
    'wmg-no-return',
    /playground\/workflow-panel\.tsx$/,
    '        onCloseAutoFocus={inspectFocus.onCloseAutoFocus}',
    '',
  );
if (on('--mutate-reuse-focus'))
  patch(
    'reuse-no-return',
    /fields\/reuse\.tsx$/,
    "    focus.remember(door.current?.querySelector<HTMLElement>('button'));",
    '',
  );
if (on('--mutate-focus-fallback'))
  patch(
    'focus-no-fallback',
    /playground\/focus\.ts$/,
    'for (const target of [el, fallback()]) {',
    'for (const target of [el]) {',
  );
if (on('--mutate-pending-local'))
  patch(
    'pending-local',
    /render\/use-design-run\.ts$/,
    'isPending: mutation.isPending || (!!scope && scopedPending > 0),',
    'isPending: mutation.isPending,',
  );
if (on('--mutate-results-cut'))
  patch(
    'results-cut-blind',
    /playground\/results\.tsx$/,
    'const cut = !!own?.cutout;',
    'const cut = false;',
  );
if (on('--mutate-results-select'))
  patch(
    'results-select-blind',
    /playground\/results\.tsx$/,
    'const selectable = !!own?.selectable;',
    'const selectable = false;',
  );
if (on('--mutate-scope'))
  patch(
    'budget-blind-to-scope',
    /generation\/generation-history\.tsx$/,
    'const autofillSlot = `${techCardId}:${rep}:${scopeKey}:${current}`;',
    'const autofillSlot = `${techCardId}:${rep}:${current}`;',
  );
if (on('--mutate-scope-page'))
  patch(
    'scope-keeps-page',
    /generation\/generation-history\.tsx$/,
    `    shownScope.current = scopeKey;
    if (page !== 0) setPage(0);`,
    `    shownScope.current = scopeKey;`,
  );
if (on('--mutate-scope-deck'))
  patch(
    'scope-keeps-deck',
    /generation\/generation-history\.tsx$/,
    `    if (page !== 0) setPage(0);
    if (openDeck !== null) setOpenDeck(null);
  }

  /**
   * КАРТОЧКА`,
    `    if (page !== 0) setPage(0);
  }

  /**
   * КАРТОЧКА`,
  );
if (on('--mutate-refusal-keeps'))
  patch(
    'refusal-keeps-key',
    /render\/use-design-run\.ts$/,
    "isDefinitiveRefusal(error) ? 'refused' : 'unknown',",
    "'unknown',",
  );
if (on('--mutate-unsure-forgotten'))
  patch(
    'unsure-forgotten',
    /render\/run-ledger\.ts$/,
    "} else if (outcome === 'refused' && found.unsure) {",
    '} else if (false) {',
  );
if (on('--mutate-5xx-definitive'))
  patch(
    '5xx-definitive',
    /generation\/refusal\.ts$/,
    'return s !== null && s >= 400 && s < 500 && s !== 408 && s !== 499;',
    'return s !== null && s >= 400;',
  );
if (on('--mutate-fingerprint'))
  patch(
    'raw-fingerprint',
    /render\/run-ledger\.ts$/,
    'return JSON.stringify(canonical(wire));',
    'return JSON.stringify(wire);',
  );
if (on('--mutate-operator'))
  patch(
    'ledger-no-operator',
    /render\/run-ledger\.ts$/,
    '`${operatorKey()}|${techCardId}|${scope}`',
    '`op|${techCardId}|${scope}`',
  );
if (on('--mutate-operator-pending'))
  patch(
    'pending-no-operator',
    /render\/use-design-run\.ts$/,
    "return ['design', 'start-run', operatorKey(), techCardId, scope] as const;",
    "return ['design', 'start-run', techCardId, scope] as const;",
  );
if (on('--mutate-no-deadline'))
  patch(
    'no-deadline',
    /render\/use-design-run\.ts$/,
    `      over = true;
      reject(`,
    `      if (Date.now() > 0) return;
      reject(`,
  );
if (on('--mutate-late-lost'))
  patch(
    'late-lost',
    /render\/use-design-run\.ts$/,
    'if (over) late(answer);',
    'if (over) void answer;',
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
if (!browser)
  dieNotRun(
    'playwright с chromium не найден — живого стенда нет, доказывать нечем; поставить: npx playwright install chromium',
  );

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
    plugins: [stub, editPlugin],
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
page.setDefaultTimeout(8000);
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
/** Answer the OLDEST outstanding start: 'ok', 'lost' (no status) or a status code number. */
const answer = (how) =>
  page.evaluate((how) => {
    const out = window.__pgOut.shift();
    if (!out) return false;
    if (how === 'ok') out.res({ run: { id: 900 + window.__pgLogical.size, status: 'pending' } });
    else if (typeof how === 'number')
      out.rej(Object.assign(new Error(`refused with ${how}`), { status: how }));
    else out.rej(new Error('network: the answer was lost'));
    return true;
  }, how);
const lastId = async () => (await calls()).at(-1);
const railRoundTrip = async () => {
  await page.click('#rail-flat');
  await page.waitForSelector('[data-playground-open], [data-workflow-tile]', { state: 'detached' });
  await page.click('#rail-playground');
  await page.waitForSelector('[data-workflow-tile]');
  await settle();
};
const recallInto = async () => {
  await page.evaluate((run) => window.__pg.recall(run), RECOLOR_RUN);
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
};
const recentText = () =>
  page.evaluate(() => localStorage.getItem('plm.playground.recent.v1:change_color.garment') ?? '');

head('A', 'уход с шага, пока прогон стартует, и возврат: тот же ключ, одна оплата');
try {
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

  // Рельс уводит с шага PLAYGROUND (форма размонтирована) и возвращает на сетку.
  await railRoundTrip();
  ck(
    wf() === null && (await page.locator('[data-playground-open]').count()) === 0,
    'рельс туда и обратно — сетка, форма размонтирована',
    page.url(),
  );
  // Черновик жил в экране шага и ушёл с ним — человек собирает ТО ЖЕ намерение заново (рекол).
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck(
    (await generate().textContent()) === 'starting…' && (await generate().isDisabled()),
    'то же намерение снова собрано: прогон всё ещё «starting…», второе нажатие невозможно',
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
  await railRoundTrip();
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
  await recallInto();
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
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('B', 'перезагрузка вкладки, пока ответа нет: тот же черновик — тот же ключ');
try {
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
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('C', 'фокус: открытие, «what the model gets», «reuse», |→');
try {
  // Одна картинка на карточке — чтобы у «reuse» был живой источник «this card».
  const cardPic = (id, ordinal) => ({
    id,
    ordinal,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/p${id}.jpg` } } },
  });
  await mount({
    ...EMPTY_BAND,
    runs: [
      {
        id: 70,
        kind: 'render',
        status: 'done',
        pictures: [cardPic(700, 1), cardPic(701, 2), cardPic(702, 3)],
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
  // r2 N8: «reuse» забирает последние свободные места — его дверь гаснет (или уходит вовсе) в том
  // же кадре, в котором закрывается галерея. Фокус не падает на <body>: он уходит на заголовок.
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="create_edit"]');
  await tileButton('create_edit').click();
  await page.waitForSelector('[data-playground-open="create_edit"]');
  await settle();
  const refsReuse = page.locator('[data-fold-section="create_edit.refs"] button', {
    hasText: /^reuse/,
  });
  await refsReuse.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-reuse-source="card"]:not([disabled])');
  await page.locator('[data-reuse-source="card"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-card-picker]');
  for (const id of [700, 701, 702]) {
    await page.locator(`[data-card-picker] [data-card-picture="${id}"] button`).first().click();
  }
  await page.locator('[data-card-picker-foot] button', { hasText: 'done' }).click();
  await page.waitForSelector('[data-card-picker]', { state: 'detached' });
  await settle();
  ck(
    (await refsReuse.count()) === 0 || (await refsReuse.isDisabled()),
    '«reuse» заполнил три места — его двери больше нет (места кончились)',
  );
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.hasAttribute('data-workflow-heading') === true &&
        !!document.activeElement.closest('[data-playground-open="create_edit"]'),
    ),
    'двери нет — фокус на заголовке формы, а не на <body>',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();

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
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('D', 'история: бюджет дочитывания принадлежит списку, а не шагу');
try {
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
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('E', 'итоги: вырез — «no background», перекрас — select; из ResultsDef своей плитки');
try {
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
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('F', 'история: смена списка сбрасывает страницу и складывает колоду (r2 п.8)');
try {
  const pic = (id, extra = {}) => ({
    id,
    ordinal: 1,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/${id}.png` } } },
    ...extra,
  });
  const recolor = (id, pictures = [pic(id * 10)]) => ({
    id,
    kind: 'recolor',
    status: 'done',
    ask: '',
    pictures,
  });
  const band = {
    freeformPresets: ['free', 'cutout'],
    // Четыре перекраса: две страницы по три и у комнаты, и у Change a Color. У первого — лист с
    // вырезанным из него куском: колода, которую можно раскрыть.
    runs: [
      recolor(64, [pic(640), pic(641, { derivation: 'crop', derivedFrom: 640 })]),
      recolor(63),
      recolor(62),
      recolor(61),
    ],
    nextPageToken: '',
    totalRuns: 4,
    archivedRuns: 0,
  };
  await mount(band);
  await page.locator('[aria-controls="design-history-runs"]').click();
  await settle(150);
  const caption = () =>
    page
      .locator('#design-history')
      .getByText(/^page \d+ of \d+$/)
      .first()
      .textContent();
  await page.locator('#design-history [aria-label="earlier runs"]').click();
  await settle();
  ck((await caption()) === 'page 2 of 2', 'сетка: история на второй странице', await caption());
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle(150);
  ck(
    (await caption()) === 'page 1 of 2' &&
      (await page.locator('#design-history [data-run="64"]').count()) === 1,
    'открыта плитка — её список с первой страницы',
    await caption(),
  );

  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await settle(150);
  const deck = page.locator('#design-history [data-deck="640"]');
  await deck.click();
  await settle();
  ck((await deck.getAttribute('aria-expanded')) === 'true', 'сетка: колода листа 640 раскрыта');
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle(150);
  ck(
    (await deck.getAttribute('aria-expanded')) === 'false',
    'открыта плитка — колода её списка сложена',
    String(await deck.getAttribute('aria-expanded')),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// Запрос, который проба подаёт хуку напрямую (`RawStart` в entry), — только поля провода.
const rawReq = (ask, items, extra = {}) => ({
  kind: 'freeform',
  ask,
  params: {
    views: [],
    freeform: {
      preset: 'free',
      items: items.map((mediaId) => ({ mediaId, regions: [], texts: [], role: '' })),
    },
    ...extra,
  },
});
const raw = async (input) => {
  await page.evaluate((i) => window.__pg.raw(i), input);
  await settle();
  return lastId();
};
const jwt = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp: 4102444800 })}.sig`;
};
const signIn = (sub) => page.evaluate((t) => localStorage.setItem('authToken', t), jwt(sub));

head('G', 'отказы: 4xx освобождает ключ, 5xx и тишина держат (r2 N3)');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const g1 = await raw(rawReq('refused outright', [11]));
  await answer(400);
  await settle();
  const g1b = await raw(rawReq('refused outright', [11]));
  ck(
    !!g1 && g1b !== g1,
    '400 — отказ окончательный: следующее нажатие — НОВЫЙ id',
    `${g1} → ${g1b}`,
  );
  await answer('ok');

  const g2 = await raw(rawReq('lost then refused', [12]));
  await answer('lost');
  await settle();
  const g2b = await raw(rawReq('lost then refused', [12]));
  ck(g2b === g2, 'после потерянного ответа — тот же id', `${g2} → ${g2b}`);
  await answer(400);
  await settle();
  const g2c = await raw(rawReq('lost then refused', [12]));
  ck(
    g2c === g2,
    'отказ ПОВТОРА после тишины ключ держит: первый прогон мог быть заведён',
    `${g2} → ${g2c}`,
  );
  await answer('ok');

  const g3 = await raw(rawReq('server error', [13]));
  await answer(503);
  await settle();
  const g3b = await raw(rawReq('server error', [13]));
  ck(g3b === g3, '503 — не окончательный: тот же id', `${g3} → ${g3b}`);
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('H', 'отпечаток канонический: порядок ключей и пробелы не меняют id (r2 N2)');
try {
  const h1 = await raw(rawReq('make it blue', [21, 22]));
  await answer('lost');
  await settle();
  // То же намерение, собранное иначе: ключи в другом порядке, лишнее undefined, пробелы по краям.
  const same = {
    params: {
      colour: undefined,
      freeform: {
        items: [21, 22].map((mediaId) => ({ role: '', texts: [], regions: [], mediaId })),
        preset: 'free',
      },
      views: [],
    },
    ask: '  make it blue ',
    kind: 'freeform',
  };
  const h2 = await raw(same);
  ck(h2 === h1, 'тот же запрос в другом порядке ключей — тот же id', `${h1} → ${h2}`);
  await answer('lost');
  await settle();
  const h3 = await raw(rawReq('make it blue', [22, 21]));
  ck(h3 !== h1, 'другой порядок картинок — другой запрос, другой id', `${h1} → ${h3}`);
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('I', 'оператор: B в той же вкладке не наследует ключ и «starting…» A (r2 N4)');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await signIn('alice');
  const a1 = await raw(rawReq('same draft', [31]));
  await answer('lost');
  await settle();
  await signIn('bob');
  const b1 = await raw(rawReq('same draft', [31]));
  ck(!!a1 && b1 !== a1, 'B, тот же черновик — СВОЙ id', `${a1} → ${b1}`);
  await answer('lost');
  await settle();
  await signIn('alice');
  const a2 = await raw(rawReq('same draft', [31]));
  ck(a2 === a1, 'A вернулся — его ключ на месте', `${a1} → ${a2}`);
  await answer('ok');
  await settle();

  // Форма: A нажал, ответа нет; B входит в ту же вкладку и открывает ту же плитку.
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  ck((await generate().textContent()) === 'starting…', 'A: «starting…»');
  await signIn('bob');
  await railRoundTrip();
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck(
    (await generate().textContent()) === 'GENERATE' &&
      !(await generate().isDisabled()) &&
      !(await backArrow().isDisabled()),
    'B: GENERATE жив, |→ свободен — чужое «starting…» не его',
    await generate().textContent(),
  );
  await answer('ok');
  await settle();
  await page.evaluate(() => localStorage.removeItem('authToken'));
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head(
  'J',
  'срок ответа: зависший старт отпускает форму, id тот же; поздний успех — засчитан (r2 N5)',
);
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.__pgDeadlineMs = 500;
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  const j1 = await lastId();
  ck((await generate().textContent()) === 'starting…', 'нажато — «starting…»');
  await page.waitForTimeout(800);
  ck(
    (await generate().textContent()) === 'GENERATE' && !(await backArrow().isDisabled()),
    'срок вышел — GENERATE и |→ свободны',
    await generate().textContent(),
  );
  const note = page.locator('[data-probe="refusal"]');
  ck(
    (await note.count()) === 1 &&
      (await note.getAttribute('data-refusal-answered')) === null &&
      (await note.getAttribute('data-request-id')) === j1,
    'стоит «no answer» с тем же id запроса',
    `${await note.count()} · ${await note.getAttribute('data-request-id')}`,
  );
  const noteText = (await note.textContent()) ?? '';
  ck(
    /^no answer from the server\./.test(noteText.trim()) &&
      noteText.includes('To check, press GENERATE again without changing anything'),
    'слова: «no answer», и проверка — тем же GENERATE, без новой кнопки',
    noteText.slice(0, 120),
  );
  await generate().click();
  await settle();
  const j2 = await lastId();
  ck(j2 === j1, 'проверка повтором — ТОТ ЖЕ id', `${j1} → ${j2}`);
  // Первый ответ опоздал и потерян; повтор отвечен сразу — прогон один.
  await answer('lost');
  await answer('ok');
  await settle();
  ck((await logical()) === 1, 'сервер держит ОДИН логический прогон', String(await logical()));

  // Поздний успех: срок вышел, повторного нажатия не было — а ответ всё-таки пришёл.
  await page.locator('[data-playground-open] textarea').first().fill('a late answer');
  await settle();
  await generate().click();
  await settle();
  const j3 = await lastId();
  await page.waitForTimeout(800);
  ck((await generate().textContent()) === 'GENERATE', 'второй старт тоже вышел за срок');
  await answer('ok');
  await settle(150);
  await generate().click();
  await settle();
  const j4 = await lastId();
  ck(j4 !== j3, 'поздний успех освободил ключ — следующее нажатие новый прогон', `${j3} → ${j4}`);
  await answer('ok');
  await page.evaluate(() => {
    window.__pgDeadlineMs = undefined;
  });
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

ck(errors.length === 0, 'страница без ошибок', errors.join(' | '));
await browser.close();

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    (MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
