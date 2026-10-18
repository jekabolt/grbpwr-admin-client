#!/usr/bin/env node
// ЛЕДЖЕР FLAT: ОДНА ОПЛАТА НА ОДНО НАМЕРЕНИЕ — ТЕМ ЖЕ ЛЕДЖЕРОМ, ЧТО У ОСТАЛЬНЫХ СТУДИЙ.
//
// FLAT держал свой `client_request_id` в собственной Map (`generation/use-generation.ts`) — без
// четырёх свойств общего леджера (`render/run-ledger.ts`). Теперь он жмёт общий. Проба монтирует
// НАСТОЯЩИЙ `useStartRun` (scripts/flat-run-ledger-entry.tsx) в Chromium; сеть заглушена,
// `StartDesignRun` ОТЛОЖЕН — проба отвечает сама: успехом, потерянным ответом, кодом или никак.
// Заглушка ведёт «сервер» как настоящий (internal/store/design/wave2.go, priorStart): ключ UNIQUE,
// повтор ключа — тот же прогон; потерянный ответ и 5xx считаются ЗАБРОНИРОВАВШИМИ (худший случай),
// 4xx — нет. «Оплат» = число различных забронированных ключей.
//
//   W · тело запроса: ровно прежнее — те же поля в том же порядке, снимка в нём нет;
//   A · тот же запрос после потерянного ответа — тот же id, оплата одна; после успеха — новый id;
//       на текущей beta потерянный ответ сначала повторяется один раз тем же id, а принятый id
//       держится до появления прогона в band;
//   H · отпечаток канонический: тот же запрос с другим порядком ключей и пробелами по краям (и в
//       params, и в снимке) — тот же id; другие слова снимка, другой порядок видов, другой реран —
//       другой id;
//   R · перезагрузка вкладки, пока ответа нет: то же намерение — тот же id;
//   G · отказы: 4xx освобождает ключ; 5xx и потерянный ответ держат; отказ ПОВТОРА после тишины
//       держит (прогон мог быть заведён первой отправкой);
//   O · оператор: B в той же вкладке не наследует ключ A; A, вернувшись, получает свой; успех A,
//       пришедший, пока в вкладке B, освобождает ключ A — A, вернувшись, получает НОВЫЙ id;
//   S · устаревший ответ: ответ второго нажатия того же намерения, пришедший после того, как ключ
//       уже освобождён и выдан новый, НОВЫЙ ключ не трогает.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается), каждая роняет СВОЮ группу:
//   --mutate-ledger            ledgerSend всегда чеканит новый id                   → A
//   --mutate-wire              реран 0 больше не называется вслух в теле            → W
//   --mutate-raw-fingerprint   отпечаток FLAT — сырой JSON.stringify                → H
//   --mutate-raw-snapshot      снимок в отпечатке — сырой JSON.stringify            → H
//   --mutate-snapshot-dropped  снимок выпал из отпечатка                            → H
//   --mutate-no-storage        журнал не пишется в sessionStorage                   → R
//   --mutate-refusal-keeps     4xx у FLAT не освобождает ключ                       → G
//   --mutate-5xx-definitive    5xx считается окончательным отказом                  → G
//   --mutate-unsure-forgotten  отказ повтора после тишины освобождает ключ          → G
//   --mutate-operator          журнал без оператора                                 → O
//   --mutate-settle-any-id     ответ гасит запись, чей бы ключ в ней ни стоял       → S
//   --mutate-settle-current-op ответ ищет запись под тем, кто вошёл СЕЙЧАС           → O
//
// --baseline=<rev> — вместо текущего `generation/use-generation.ts` собрать его из ревизии <rev>
// (`git show`): так видно, что проба ловит прежний FLAT, а не только мутации.
//
// Нет Chromium — КОД 2 и «НЕ ВЫПОЛНЕНА»: пропуск — это не зелень. Сборка упала или якорь
// мутации не найден — тоже код 2. Playwright не в зависимостях репозитория (как у остальных
// браузерных проб здесь): node_modules, затем кэш npx; `npx playwright install chromium`.

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
const FLAT_HOOK =
  'src/components/managers/tech-card/components/design/generation/use-generation.ts';

function dieNotRun(why) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
}

const KNOWN = new Set([
  '--mutate-ledger',
  '--mutate-wire',
  '--mutate-raw-fingerprint',
  '--mutate-raw-snapshot',
  '--mutate-snapshot-dropped',
  '--mutate-no-storage',
  '--mutate-refusal-keeps',
  '--mutate-5xx-definitive',
  '--mutate-unsure-forgotten',
  '--mutate-operator',
  '--mutate-settle-any-id',
  '--mutate-settle-current-op',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATED = [...KNOWN].some(on);
const BASELINE = process.argv.find((a) => a.startsWith('--baseline='))?.slice('--baseline='.length);

// ─── правки бандла: мутации, СКЛАДЫВАЮТСЯ в одном onLoad ─────────────────────────────────────
// esbuild берёт первый onLoad, вернувший содержимое, поэтому все правки одного файла применяет
// один плагин. Якорь не найден — КОД 2: правка, которая не применилась, — непроверенная проба.
const edits = [];
const patch = (name, filter, needle, replacement) =>
  edits.push({ name, filter, needle, replacement });
let baselineSource = null;
if (BASELINE) {
  try {
    baselineSource = execFileSync('git', ['show', `${BASELINE}:${FLAT_HOOK}`], {
      cwd: REPO,
      encoding: 'utf8',
    });
  } catch (e) {
    dieNotRun(`--baseline=${BASELINE}: git show не отдал ${FLAT_HOOK} — ${e.message}`);
  }
}
const editPlugin = {
  name: 'probe-edits',
  setup(b) {
    b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
      const baseline = baselineSource && args.path.endsWith(FLAT_HOOK);
      const mine = edits.filter((e) => e.filter.test(args.path));
      if (!mine.length && !baseline) return undefined;
      let src = baseline ? baselineSource : await readFile(args.path, 'utf8');
      for (const e of mine) {
        if (!src.includes(e.needle))
          dieNotRun(`правка «${e.name}» не нашла свой якорь в ${args.path}`);
        src = src.replace(e.needle, e.replacement);
      }
      return { contents: src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
};

const FLAT_FILE = /generation\/use-generation\.ts$/;
const LEDGER = /render\/run-ledger\.ts$/;
if (on('--mutate-ledger'))
  patch(
    'ledger-always-mints',
    LEDGER,
    'const id = fixedId || (found ? found.id : newClientRequestId());',
    'const id = fixedId || newClientRequestId();',
  );
if (on('--mutate-wire'))
  patch(
    'wire-drops-zero-rerun',
    FLAT_FILE,
    'rerunOfRunId: input.rerunOfRunId ?? 0,\n      }),',
    'rerunOfRunId: input.rerunOfRunId || undefined,\n      }),',
  );
if (on('--mutate-raw-fingerprint'))
  patch(
    'flat-raw-fingerprint',
    FLAT_FILE,
    'const fingerprint = requestFingerprint({',
    'const fingerprint = JSON.stringify({',
  );
if (on('--mutate-raw-snapshot'))
  patch(
    'flat-raw-snapshot',
    FLAT_FILE,
    ': fingerprintDigest(input.snapshot),',
    ': JSON.stringify(input.snapshot),',
  );
if (on('--mutate-snapshot-dropped'))
  patch(
    'flat-snapshot-dropped',
    FLAT_FILE,
    'frozen: input.snapshot === undefined ? undefined : fingerprintDigest(input.snapshot),',
    'frozen: undefined,',
  );
if (on('--mutate-no-storage'))
  patch(
    'ledger-no-storage',
    LEDGER,
    'window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));',
    'void book();',
  );
if (on('--mutate-refusal-keeps'))
  patch(
    'flat-refusal-keeps-key',
    FLAT_FILE,
    "isDefinitiveRefusal(error) ? 'refused' : 'unknown',",
    "'unknown',",
  );
if (on('--mutate-5xx-definitive'))
  patch(
    '5xx-definitive',
    /generation\/refusal\.ts$/,
    'return s !== null && s >= 400 && s < 500 && s !== 408 && s !== 499;',
    'return s !== null && s >= 400;',
  );
if (on('--mutate-unsure-forgotten'))
  patch(
    'unsure-forgotten',
    LEDGER,
    "} else if (outcome === 'refused' && found.unsure) {",
    '} else if (false) {',
  );
if (on('--mutate-operator'))
  patch(
    'ledger-no-operator',
    LEDGER,
    '`${operator}|${techCardId}|${scope}`',
    '`op|${techCardId}|${scope}`',
  );
if (on('--mutate-settle-current-op'))
  patch(
    'settle-current-op',
    LEDGER,
    `): { matched: boolean; freed: boolean } {
  const all = book();
  const at = scopeOf(operator, techCardId, scope);`,
    `): { matched: boolean; freed: boolean } {
  const all = book();
  const at = scopeOf(operatorKey(), techCardId, scope);`,
  );
if (on('--mutate-settle-any-id'))
  patch(
    'settle-any-id',
    LEDGER,
    'if (!found || found.id !== id) return { matched: false, freed: false };',
    'if (!found) return { matched: false, freed: false };',
  );

// ─── заглушенная сеть ──────────────────────────────────────────────────────────────────────────
// По суффиксу пути: `api/api` достижим и алиасом, и относительным импортом. Маркер ищется в
// собранном бандле — без него настоящий клиент мог бы остаться внутри и пойти в сеть.
const STUB_MARKER = 'PROBE_STUB_FLAT_LEDGER_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const g = globalThis;
g.__flStub = '${STUB_MARKER}';
g.__flCalls = g.__flCalls || [];
g.__flBooked = g.__flBooked || new Set();
g.__flOut = g.__flOut || [];
const call = (method) => (req) => {
  // Тело — как его сериализует проводной клиент: JSON.stringify, порядок ключей сохранён.
  g.__flCalls.push({ method, body: JSON.stringify(req ?? {}), req: JSON.parse(JSON.stringify(req ?? {})) });
  if (method === 'StartDesignRun') return new Promise((res, rej) => g.__flOut.push({ req, res, rej }));
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
const outfile = resolve(tmpdir(), `flat-run-ledger-${process.pid}.js`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'flat-run-ledger-entry.tsx')],
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
  if (route.request().url() === 'http://probe.local/flat') {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`,
    });
  }
  return route.abort();
});

const settle = (ms = 60) => page.waitForTimeout(ms);
/** A JWT the ledger can read `sub` from; the signature is never checked on this side. */
const jwt = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp: 4102444800 })}.sig`;
};
const ALICE = jwt('alice');
const BOB = jwt('bob');

async function boot({ clear = true } = {}) {
  await page.goto('http://probe.local/flat');
  await page.waitForFunction(() => !!window.__fl);
  if (clear)
    await page.evaluate((token) => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem('authToken', token);
    }, ALICE);
  await page.evaluate(() => window.__fl.mount());
  await page.waitForSelector('#flat-door');
}
const signIn = (token) => page.evaluate((t) => localStorage.setItem('authToken', t), token);
const press = async (input) => {
  await page.evaluate((i) => window.__fl.press(i), input);
  await settle();
};
const ids = () =>
  page.evaluate(() =>
    window.__flCalls.filter((c) => c.method === 'StartDesignRun').map((c) => c.req.clientRequestId),
  );
const lastId = async () => (await ids()).at(-1);
const bodies = () =>
  page.evaluate(() =>
    window.__flCalls.filter((c) => c.method === 'StartDesignRun').map((c) => c.body),
  );
const paid = () => page.evaluate(() => window.__flBooked.size);
/** Wait for beta's one automatic retry after an ambiguous answer (no status / 408 / 499 / 5xx). */
const waitForAutomaticRetry = async (callsBefore) => {
  await page.waitForFunction(
    (before) => window.__flCalls.filter((c) => c.method === 'StartDesignRun').length > before,
    callsBefore,
  );
  await settle();
};
/** Answer the OLDEST outstanding start; accepted rows are shown in the band unless asked not to. */
const answer = async (how, visible = true) => {
  const runId = await page.evaluate((how) => {
    const out = window.__flOut.shift();
    if (!out) return 0;
    const id = out.req.clientRequestId;
    if (how === 'ok') {
      window.__flBooked.add(id);
      const idOfRun = 900 + window.__flBooked.size;
      out.res({ run: { id: idOfRun, status: 'pending' } });
      return idOfRun;
    } else if (typeof how === 'number') {
      // 5xx может прийти ПОСЛЕ коммита — худший случай: прогон заведён. 4xx ничего не заводит.
      if (how >= 500) window.__flBooked.add(id);
      out.rej(Object.assign(new Error(`refused with ${how}`), { status: how }));
    } else {
      // Ответ потерян — сервер, возможно, уже забронировал: худший случай.
      window.__flBooked.add(id);
      out.rej(new Error('network: the answer was lost'));
    }
    return -1;
  }, how);
  await settle();
  if (how === 'ok' && visible && runId > 0) {
    await page.evaluate((id) => window.__fl.show(id), runId);
    await settle();
  }
  return runId !== 0 ? runId : false;
};

// Намерение флэта, как его собирает `flat-run-row.tsx`: undefined-поля названы вслух.
const PARAMS = {
  views: ['front', 'back'],
  detailSlotIds: [4],
  layout: 'sheet',
  colorwayId: 0,
  colour: undefined,
  threed: undefined,
  fixTarget: '',
  fixTargets: [],
  fixSlotIds: [],
  autoSplit: false,
  pattern: undefined,
  freeform: undefined,
};
const SNAPSHOT = {
  words: 'boxy denim jacket',
  fit: 'relaxed',
  refs: [[101, 'front', 1, 'the collar', 0]],
  callouts: [{ mediaId: 101, x: 0.4, y: 0.2, text: 'double stitch' }],
  details: [[4, 'pocket']],
};
const FLAT = { kind: 'flat', ask: '', params: PARAMS, snapshot: SNAPSHOT };

head('W', 'тело запроса — прежнее, снимок не едет');
try {
  await boot();
  await press(FLAT);
  const [body] = await bodies();
  const id = await lastId();
  const expected =
    `{"techCardId":7,"clientRequestId":${JSON.stringify(id)},"kind":"flat","ask":"",` +
    `"params":{"views":["front","back"],"detailSlotIds":[4],"layout":"sheet","colorwayId":0,` +
    `"fixTarget":"","fixTargets":[],"fixSlotIds":[],"autoSplit":false},"rerunOfRunId":0}`;
  ck(
    body === expected,
    'тело — те же поля в том же порядке',
    `\n    got  ${body}\n    want ${expected}`,
  );
  ck(!body.includes('boxy denim') && !body.includes('snapshot'), 'снимка в теле нет', body);
  await answer('ok');
  await press({ ...FLAT, rerunOfRunId: 3 });
  const rerun = (await bodies()).at(-1);
  ck(rerun.endsWith('"rerunOfRunId":3}'), 'реран назван в теле', rerun);
  await answer('ok');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('A', 'потерянный ответ — тот же ключ, одна оплата; после успеха — новый ключ');
try {
  await boot();
  await press(FLAT);
  const first = await lastId();
  const beforeRetry = (await ids()).length;
  await answer('lost');
  await waitForAutomaticRetry(beforeRetry);
  ck(
    (await lastId()) === first,
    'автоповтор после потерянного ответа несёт ТОТ ЖЕ id',
    `${first} → ${await lastId()}`,
  );
  // `useGenerationWrites` retries an ambiguous transport answer once. Only the result of the whole
  // mutation reaches `useStartRun`, so the caller sees a refusal after this second lost answer.
  await answer('lost');
  await press(FLAT);
  ck(
    (await lastId()) === first,
    'повтор после потерянного ответа — ТОТ ЖЕ id',
    `${first} → ${await lastId()}`,
  );
  const acceptedRun = await answer('ok', false);
  await press(FLAT);
  ck(
    (await lastId()) === first,
    'принятый id держится, пока прогон не появился в band',
    `${first} → ${await lastId()}`,
  );
  await page.evaluate((id) => window.__fl.show(id), acceptedRun);
  await settle();
  await answer('ok'); // поздний повтор K1 не трогает уже освобождённую запись
  ck((await paid()) === 1, 'сервер держит ОДИН прогон', String(await paid()));
  await press(FLAT);
  ck((await lastId()) !== first, 'после подтверждённого успеха — НОВЫЙ id (новый прогон)');
  await answer('ok');
  const refusals = await page.evaluate(() => window.__fl.settled);
  ck(
    refusals.length === 4 && refusals[0]?.status === null && refusals[0]?.clientRequestId === first,
    'потерянный ответ вернул отказ без статуса с ключом нажатия; успехи — null',
    JSON.stringify(refusals),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('H', 'отпечаток канонический: одно намерение — один id, другое — другой');
try {
  await boot();
  await press(FLAT);
  const first = await lastId();
  await answer('lost');
  // То же намерение, собранное иначе: ключи в другом порядке, пробелы по краям, null вместо
  // undefined — и в params, и в снимке.
  const reordered = {
    kind: 'flat',
    ask: ' ',
    snapshot: {
      details: [[4, 'pocket ']],
      callouts: [{ text: 'double stitch', y: 0.2, x: 0.4, mediaId: 101 }],
      refs: [[101, 'front', 1, 'the collar', 0]],
      fit: 'relaxed',
      words: 'boxy denim jacket ',
    },
    params: {
      freeform: null,
      autoSplit: false,
      fixSlotIds: [],
      fixTargets: [],
      fixTarget: '',
      layout: 'sheet ',
      detailSlotIds: [4],
      views: ['front', 'back'],
      colorwayId: 0,
    },
  };
  await press(reordered);
  ck(
    (await lastId()) === first,
    'другой порядок ключей и пробелы — ТОТ ЖЕ id',
    `${first} → ${await lastId()}`,
  );
  await answer('lost');
  await press({ ...FLAT, snapshot: { ...SNAPSHOT, words: 'cropped denim jacket' } });
  const words = await lastId();
  ck(words !== first, 'другие слова в снимке — другой id (снимок в отпечатке)');
  await answer('lost');
  await press({ ...FLAT, params: { ...PARAMS, views: ['back', 'front'] } });
  const order = await lastId();
  ck(
    order !== first && order !== words,
    'другой порядок видов — другой id (порядок массивов — смысл)',
  );
  await answer('lost');
  await press({ ...FLAT, rerunOfRunId: 7 });
  ck(![first, words, order].includes(await lastId()), 'реран — другой id');
  await answer('lost');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('R', 'перезагрузка вкладки, пока ответа нет: то же намерение — тот же id');
try {
  await boot();
  await press(FLAT);
  const before = await lastId();
  await page.reload();
  await boot({ clear: false });
  await press(FLAT);
  ck(
    (await lastId()) === before,
    'после перезагрузки — тот же client_request_id',
    `${before} → ${await lastId()}`,
  );
  await answer('ok');
  ck((await paid()) === 1, 'сервер держит ОДИН прогон', String(await paid()));
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('G', 'отказы: 4xx освобождает ключ, 5xx и тишина держат, отказ повтора после тишины держит');
try {
  await boot();
  await press(FLAT);
  const a = await lastId();
  await answer(400);
  await press(FLAT);
  const b = await lastId();
  ck(b !== a, '4xx — следующее нажатие несёт НОВЫЙ id (сервер этот ключ отверг)');
  const before5xxRetry = (await ids()).length;
  await answer(502);
  await waitForAutomaticRetry(before5xxRetry);
  ck((await lastId()) === b, 'автоповтор после 5xx несёт ТОТ ЖЕ id');
  // Exhaust beta's single automatic retry so 502 becomes the caller-visible final result.
  await answer(502);
  await press(FLAT);
  ck((await lastId()) === b, '5xx — ключ держится (прогон мог быть заведён)');
  const beforeLostRetry = (await ids()).length;
  await answer('lost');
  await waitForAutomaticRetry(beforeLostRetry);
  ck((await lastId()) === b, 'автоповтор после тишины несёт ТОТ ЖЕ id');
  await answer('lost');
  await press(FLAT);
  ck((await lastId()) === b, 'тишина — ключ держится');
  // Повтор ключа, по которому была тишина, отвергнут (ворота закрылись): первая отправка могла
  // завести прогон — ключ обязан остаться, иначе следующее нажатие купит второй.
  await answer(412);
  await press(FLAT);
  ck(
    (await lastId()) === b,
    'отказ ПОВТОРА после тишины — ключ держится',
    `${b} → ${await lastId()}`,
  );
  await answer('ok');
  ck((await paid()) === 1, 'за всю серию — один прогон', String(await paid()));
  const refusals = await page.evaluate(() => window.__fl.settled);
  ck(
    refusals.length === 5 &&
      refusals[0]?.status === 400 &&
      refusals[1]?.status === 502 &&
      refusals[2]?.status === null &&
      refusals[3]?.status === 412 &&
      refusals[4] === null,
    'финальный ответ каждой мутации отдан вызывающему как есть',
    JSON.stringify(refusals),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('O', 'оператор: B в той же вкладке не наследует ключ A');
try {
  await boot();
  await press(FLAT);
  const alice = await lastId();
  await answer('lost');
  await signIn(BOB);
  await press(FLAT);
  const bob = await lastId();
  ck(bob !== alice, 'B, нажав то же намерение, получает СВОЙ id', `${alice} → ${bob}`);
  await answer('lost');
  await signIn(ALICE);
  await press(FLAT);
  ck((await lastId()) === alice, 'A, вернувшись, получает свой прежний id');
  await answer('ok'); // повтор A принят и появился в band; запись B (тишина) остаётся за B

  // Смена оператора ПОСРЕДИ отправки: A жмёт, входит B, приходит успех A. Он обязан лечь в запись A,
  // иначе A, вернувшись, повторит принятый ключ и получит СТАРЫЙ прогон с OK.
  await press(FLAT);
  const inFlight = await lastId();
  await signIn(BOB);
  await answer('ok');
  await signIn(ALICE);
  await press(FLAT);
  ck(
    (await lastId()) !== inFlight,
    'успех A, пришедший при B, освободил ключ A — следующее нажатие A несёт НОВЫЙ id',
    `${inFlight} → ${await lastId()}`,
  );
  await answer('ok');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('S', 'устаревший ответ не трогает ключ, выданный после него');
try {
  await boot();
  await press(FLAT); // p1 — ключ K1
  await press(FLAT); // p2 — тот же K1, ответ первого ещё не пришёл
  const k1 = await lastId();
  await answer('ok'); // p1 принят → K1 освобождён
  await press(FLAT); // p3 — новый ключ K2
  const k2 = await lastId();
  ck(k2 !== k1, 'после принятого ответа — новый ключ');
  await answer('ok'); // p2 (K1) — устаревший ответ: K2 он трогать не должен
  await answer('lost'); // p3 (K2) — тишина: K2 обязан остаться
  await press(FLAT);
  ck((await lastId()) === k2, 'повтор после тишины по K2 — снова K2', `${k2} → ${await lastId()}`);
  await answer('ok');
  ck((await paid()) === 2, 'два нажатия-намерения — два прогона, не три', String(await paid()));
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

ck(errors.length === 0, 'страница без ошибок', errors.join(' | '));
await browser.close();

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    (MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : '') +
    (BASELINE ? ` (FLAT собран из ${BASELINE})` : ''),
);
process.exit(bad === 0 ? 0 : 1);
