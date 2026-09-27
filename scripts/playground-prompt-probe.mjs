#!/usr/bin/env node
// ПОЛЕ ПРОМПТА PLAYGROUND ЖИВЬЁМ: IDEAS ОТ СЕРВЕРА (C-15) И RECENTLY USED «ON THIS CARD» (C-16).
//
// Монтируется НАСТОЯЩИЙ `WorkflowPanel` открытой плитки (scripts/playground-prompt-entry.tsx) в
// Chromium; сеть заглушена, `SuggestPrompts` ОТЛОЖЕН — проба отвечает на него сама: фразами, отказом
// с кодом и причиной, или никак. Каждая группа — новая загрузка страницы (модульная память Ideas и
// списков начинается заново) и чистый localStorage.
//
//   A · старый сервер (поля 33 нет) и сервер без ассистента (''): дверь Ideas открывает только
//       статический список, без подписей групп, и НЕ зовёт SuggestPrompts;
//   B · новый сервер: нажатие — сразу статический список и строка «thinking…» над ним; запрос несёт
//       карточку, workflow, поле, картинку формы, контекст карточки и текст; ответ — фразы сервера
//       ВЫШЕ волосяной линии под «for this picture» (почищены, без повторов), статические — ниже
//       под «more» и без того, что сервер уже сказал; выбор вставляется у каретки;
//   C · кэш: тот же вопрос — ответ сразу и без второго вызова; другой текст — новый вызов;
//   D · отказ (429, лимит часа): статический список, без подписей, без тоста; следующее нажатие
//       спрашивает снова (сбой не кэшируется);
//   E · AI_NOT_CONFIGURED и 404: сессия выключает серверную половину — дальше нажатия не зовут;
//   F · меню закрыто, пока ответ в пути: поздний ответ не роняет страницу и ложится в кэш — новое
//       открытие показывает его без вызова;
//   G · без картинки подпись «for this field», mediaIds пуст (create_edit без референсов).
//   H · (C-16) Recently used: «on this card» (прогоны полосы) ВЫШЕ волосяной линии, «in this
//       browser» ниже; текст, который есть в обоих, — только в браузерной; выбор заменяет текст и
//       даёт undo; одна браузерная группа — без подписей, как во второй фазе; обе пусты — «Nothing
//       yet»; редактор маски плитки 10 показывает слова прошлых ретушей карточки (оба маршрута).
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается), каждая роняет СВОЮ группу:
//   --mutate-ideas-always    сервер спрашивается и без поля 33                    → A
//   --mutate-ideas-order     статический список встаёт выше серверного            → B
//   --mutate-ideas-cache     ответ не кэшируется                                  → C, F
//   --mutate-ideas-stuck     сбой не снимает «thinking…»                          → D
//   --mutate-ideas-session   AI_NOT_CONFIGURED не выключает сессию                → E
//   --mutate-recent-dedupe   повтор остаётся и в группе карточки                  → H
//   --mutate-recent-order    группа карточки встаёт ниже браузерной               → H
//   --mutate-recent-mask     редактор маски не получает слов карточки             → H
//   --mutate-door-skin       открытая дверь снова чёрным по чёрному без наведения → H
//   --mutate-ideas-coarse    контекст снова только заголовки секций               → I
//   --mutate-ideas-no-deadline зависший вызов не отпускается                     → J
//   --mutate-ideas-404-any   любой 404 выключает сессию                           → E
//   --mutate-ideas-no-abort  срок не обрывает запрос (G-03 Codex r2)              → J
//
//   I · (G-03 Codex MINOR) ключ кэша — значения формы: другой цвет Pantone при том же тексте — новый
//       вопрос и новый вызов; тот же цвет — кэш; текст самого поля в контекст не идёт;
//   J · (G-03 Codex MINOR) вызов, который не отвечает, отпускается по сроку: «thinking…» снята,
//       статический список, без тоста; тишина — следующее нажатие не зовёт; кэш пуст;
//   E · (G-03 m-5) 404 С причиной (картинка вопроса удалена) — сессия НЕ выключается.
//   K · (20-PROMPTS §3.8) Improve: EnhanceText уходит в режиме STEER, поле OTHER, с парой
//       workflow / fieldKey поля (change_color/garment; в редакторе маски retouch_zone/change_text),
//       контекст — тот же «Tool: … / This field: …», что у двери Ideas (и без ассистента на полосе,
//       и в редакторе маски). Повтор в IMPROVE — ТОЛЬКО на доказанный перекос enum (Codex MAJOR):
//       400 с нарушением на `mode`, или 400 без нарушений, чьё сообщение называет enum
//       (`invalid value for enum field mode: "ENHANCE_TEXT_MODE_STEER"` / имя члена) — ОДИН повтор
//       с тем же текстом и контекстом и БЕЗ пары, ответ в поле, без тоста. НЕ повторяются и говорят
//       своё: 400 по полю text; 400 без нарушений иной формы (отказ по содержанию «refused: …»);
//       400 с нарушением на `workflow` / `field_key` (сервер знает STEER, не знает пары).
//       Плейсхолдер редактора маски — «smooth clean fabric, the same colour and weave»; общее меню
//       `ai ✦` (ENHANCE_MODES) — ровно improve/expand/shorten/prompt, без steer.
//   --mutate-steer-mode      Improve снова в режиме improve                       → K
//   --mutate-steer-context   контекст снова голая подсказка                       → K
//   --mutate-steer-fallback  отказ STEER не повторяется в improve                 → K
//   --mutate-steer-any-400   любой 400 повторяется в improve                      → K
//   --mutate-steer-detail-free любой 400 без нарушений повторяется (отказ по содержанию) → K
//   --mutate-steer-pair-retry нарушение на workflow/field_key принято за перекос → K
//   --mutate-steer-no-enum-text сообщение с enum не доказывает перекоса         → K
//   --mutate-steer-no-pair   STEER уходит без workflow / fieldKey                 → K
//   --mutate-steer-retry-pair повтор в improve несёт пару                         → K
//   --mutate-mask-placeholder плейсхолдер маски снова про операцию               → K
//   --mutate-steer-in-menu   steer попадает в общее меню ai ✦                     → K
//
// Нет Chromium — КОД 2 и «НЕ ВЫПОЛНЕНА». `--shots <dir>` сохраняет снимки меню (1440/768/375).

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
  '--mutate-ideas-always',
  '--mutate-ideas-order',
  '--mutate-ideas-cache',
  '--mutate-ideas-stuck',
  '--mutate-ideas-session',
  '--mutate-recent-dedupe',
  '--mutate-recent-order',
  '--mutate-recent-mask',
  '--mutate-door-skin',
  '--mutate-ideas-coarse',
  '--mutate-ideas-no-deadline',
  '--mutate-ideas-404-any',
  '--mutate-ideas-no-abort',
  '--mutate-steer-mode',
  '--mutate-steer-context',
  '--mutate-steer-fallback',
  '--mutate-steer-any-400',
  '--mutate-steer-detail-free',
  '--mutate-steer-pair-retry',
  '--mutate-steer-no-enum-text',
  '--mutate-steer-no-pair',
  '--mutate-steer-retry-pair',
  '--mutate-mask-placeholder',
  '--mutate-steer-in-menu',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATED = [...KNOWN].some(on);
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? resolve(process.argv[shotsAt + 1] ?? '') : null;

// ─── правки бандла: мутации складываются в одном onLoad ─────────────────────────────────────
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
const IDEAS_SERVER = /playground\/ideas-server\.ts$/;
const PROMPT_FIELD = /fields\/prompt-field\.tsx$/;
if (on('--mutate-ideas-always'))
  patch('ideas-always', IDEAS_SERVER, "(band.suggestPromptsModel ?? '').trim() !== ''", 'true');
if (on('--mutate-ideas-order'))
  patch(
    'ideas-order',
    PROMPT_FIELD,
    "<div className='flex flex-col py-1' data-ideas-menu=''>",
    "<div className='flex flex-col-reverse py-1' data-ideas-menu=''>",
  );
if (on('--mutate-ideas-cache')) {
  patch('ideas-cache-sync', IDEAS_SERVER, 'answered.get(suggestKey(req));', 'undefined;');
  patch('ideas-cache-async', IDEAS_SERVER, 'const out = asked.get(key);', 'const out = undefined;');
}
if (on('--mutate-ideas-stuck'))
  patch(
    'ideas-stuck',
    PROMPT_FIELD,
    "() => ideasTicket.current === mine && setServer({ status: 'failed' }),",
    '() => undefined,',
  );
if (on('--mutate-ideas-session'))
  patch('ideas-session', IDEAS_SERVER, 'if (cannotAnswer(error)) sessionOff = true;', '');
if (on('--mutate-recent-dedupe'))
  patch(
    'recent-dedupe',
    /playground\/card-recent\.ts$/,
    'card: card.filter((t) => !shown.has(norm(t))),',
    'card,',
  );
if (on('--mutate-recent-order'))
  patch(
    'recent-order',
    PROMPT_FIELD,
    "<div className='flex flex-col py-1' data-recent-menu=''>",
    "<div className='flex flex-col-reverse py-1' data-recent-menu=''>",
  );
if (on('--mutate-door-skin'))
  patch(
    'door-skin',
    PROMPT_FIELD,
    "open && 'bg-textColor !text-bgColor',",
    "open && 'bg-textColor text-bgColor',",
  );
if (on('--mutate-ideas-coarse'))
  patch(
    'ideas-coarse',
    IDEAS_SERVER,
    'if (value) parts.push(`${key}: ${value}`);',
    "if (value) parts.push('');",
  );
if (on('--mutate-ideas-no-deadline'))
  patch('ideas-no-deadline', IDEAS_SERVER, '}, deadlineMs());', '}, 1e9);');
if (on('--mutate-ideas-404-any'))
  patch(
    'ideas-404-any',
    IDEAS_SERVER,
    '(status === 404 && reason === undefined) || status === 501',
    'status === 404 || status === 501',
  );
if (on('--mutate-ideas-no-abort'))
  patch('ideas-no-abort', IDEAS_SERVER, '        abort.abort();\n', '');
if (on('--mutate-recent-mask'))
  patch(
    'recent-mask',
    /mask\/mask-editor\.tsx$/,
    "cardRecent={cardRecentTexts(band, 'retouch_zone', RETOUCH_WORDS_KEY)}",
    '',
  );
if (on('--mutate-steer-mode'))
  patch(
    'steer-mode',
    PROMPT_FIELD,
    "return await enhanceText({ ...req, mode: 'steer' });",
    "return await enhanceText({ ...req, mode: 'improve' });",
  );
if (on('--mutate-steer-context'))
  patch(
    'steer-context',
    PROMPT_FIELD,
    'context: improveContext({ serverIdeas, workflowTitle, hint }),',
    'context: hint,',
  );
if (on('--mutate-steer-fallback'))
  patch('steer-fallback', PROMPT_FIELD, 'if (!steerRefused(e)) throw e;', 'throw e;');
if (on('--mutate-steer-any-400'))
  patch(
    'steer-any-400',
    PROMPT_FIELD,
    'const violations = extractFieldViolations(error);\n',
    'const violations = extractFieldViolations(error);\n  if (violations) return true;\n',
  );
if (on('--mutate-steer-detail-free'))
  patch(
    'steer-detail-free',
    PROMPT_FIELD,
    '  if (violations.length > 0) return false;\n',
    '  if (violations.length === 0) return true;\n',
  );
if (on('--mutate-steer-pair-retry'))
  patch(
    'steer-pair-retry',
    PROMPT_FIELD,
    'if (violations.some((v) => STEER_PAIR_FIELDS.has(v.field))) return false;',
    'if (violations.some((v) => STEER_PAIR_FIELDS.has(v.field))) return true;',
  );
if (on('--mutate-steer-no-enum-text'))
  patch(
    'steer-no-enum-text',
    PROMPT_FIELD,
    "if (message.includes('ENHANCE_TEXT_MODE_STEER')) return true;",
    'return false;',
  );
if (on('--mutate-steer-no-pair'))
  patch('steer-no-pair', PROMPT_FIELD, 'workflow: workflowKey,\n          fieldKey,\n', '');
if (on('--mutate-steer-retry-pair'))
  patch(
    'steer-retry-pair',
    PROMPT_FIELD,
    "mode: 'improve', workflow: undefined, fieldKey: undefined });",
    "mode: 'improve' });",
  );
if (on('--mutate-mask-placeholder'))
  patch(
    'mask-placeholder',
    /mask\/mask-editor\.tsx$/,
    "placeholder='smooth clean fabric, the same colour and weave'",
    "placeholder='Remove the stain, straighten the seam'",
  );
if (on('--mutate-steer-in-menu'))
  patch(
    'steer-in-menu',
    /ui\/components\/ai-enhance\.tsx$/,
    "{ mode: 'prompt', label: 'as a prompt', hint: 'rewrite as a generation prompt' },",
    "{ mode: 'prompt', label: 'as a prompt', hint: 'rewrite as a generation prompt' },\n  { mode: 'steer', label: 'steer', hint: 'for this field' },",
  );

// ─── заглушенная сеть ──────────────────────────────────────────────────────────────────────────
const STUB_MARKER = 'PROBE_STUB_C15_PROMPT_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const g = globalThis;
g.__ppStub = '${STUB_MARKER}';
g.__ppCalls = g.__ppCalls || [];
g.__ppOut = g.__ppOut || [];
const call = (method) => (req) => {
  g.__ppCalls.push({ method, req: JSON.parse(JSON.stringify(req ?? {})) });
  if (method === 'SuggestPrompts') return new Promise((res, rej) => g.__ppOut.push({ req, res, rej }));
  // Improve (group K): the page answers EnhanceText itself when it has set a handler.
  if (method === 'EnhanceText' && typeof g.__ppEnhance === 'function') return g.__ppEnhance(req);
  return Promise.resolve({});
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
// The abortable client (G-03 Codex r2): the same calls; an abort of the signal is counted, and the
// held call rejects as fetch does.
g.__ppAborted = g.__ppAborted || 0;
export const abortableAdminService = (signal) =>
  new Proxy({}, {
    get: (_t, k) =>
      typeof k === 'string'
        ? (req) => {
            const p = call(k)(req);
            signal.addEventListener('abort', () => {
              g.__ppAborted++;
              const out = g.__ppOut.find((o) => o.req === req);
              if (out) out.rej(new DOMException('aborted', 'AbortError'));
            });
            return p;
          }
        : undefined,
  });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'probe-stub-api', namespace: 'pp' }));
    b.onLoad({ filter: /.*/, namespace: 'pp' }, () => ({ contents: STUB_SOURCE, loader: 'js' }));
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
  dieNotRun('playwright с chromium не найден; поставить: npx playwright install chromium');

// ─── сборка ────────────────────────────────────────────────────────────────────────────────────
const outfile = resolve(tmpdir(), `playground-prompt-${process.pid}.js`);
const cssfile = outfile.replace(/\.js$/, '.css');
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-prompt-entry.tsx')],
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
rmSync(cssfile, { force: true });
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в бандле нет «${STUB_MARKER}» — сеть НЕ заглушена`);
if (bundle.includes(REAL_API_MARKER)) dieNotRun(`в бандле остался настоящий api-слой`);

// THE ADMIN'S OWN CSS (Tailwind 4 over src/global.css, compiled here from the sources): the order
// and the hairline are measured on the page as it is drawn, and a class nobody compiled measures
// nothing. Fonts are served from src/fonts so the shots look like the admin.
let css = '';
try {
  const req = createRequire(resolve(REPO, 'package.json'));
  const postcss = req('postcss');
  const tailwind = req('@tailwindcss/postcss');
  const from = resolve(REPO, 'src/global.css');
  css = (await postcss([tailwind({ base: REPO })]).process(readFileSync(from, 'utf8'), { from }))
    .css;
} catch (e) {
  await browser.close();
  dieNotRun(`CSS админки не собран — ${e.message}`);
}

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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === 'http://probe.local/start' || url.startsWith('http://probe.local/tech-cards/'))
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><style>${css}</style><body style="background:#f2f2f2"><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`,
    });
  const font = url.match(/\/fonts\/([\w.-]+\.ttf)$/);
  if (font && existsSync(resolve(REPO, 'src/fonts', font[1])))
    return route.fulfill({
      status: 200,
      contentType: 'font/ttf',
      body: readFileSync(resolve(REPO, 'src/fonts', font[1])),
    });
  return route.abort();
});

const settle = (ms = 60) => page.waitForTimeout(ms);
const media = (id) => ({ id, media: { thumbnail: { mediaUrl: `http://probe.local/m${id}.jpg` } } });
const MODEL = 'google/gemini-3.1-flash-lite';
const OLD = { freeformPresets: ['free', 'cutout'], runs: [], nextPageToken: '', totalRuns: 0 };
const NEW = { ...OLD, suggestPromptsModel: MODEL };

async function fresh(wf, band, over = {}, browserTexts = []) {
  await page.goto('http://probe.local/start');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(() => window.__pp.reset());
  // This browser's own list, written to storage before the page that reads it loads.
  for (const [w, f, t] of browserTexts)
    await page.evaluate(([w, f, t]) => window.__pp.remember(w, f, t), [w, f, t]);
  await page.goto('http://probe.local/tech-cards/7');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(([wf, band, over]) => window.__pp.mount(wf, band, over), [wf, band, over]);
  await page.waitForSelector('[data-prompt-field]');
}
const field = (key) => page.locator(`[data-prompt-field="${key}"]`);
const openIdeas = async (key) => {
  await field(key).locator('button[aria-label="ideas"]').click();
  await page.waitForSelector('[data-ideas-menu]');
  await settle();
};
const closeMenu = async () => {
  await page.keyboard.press('Escape');
  await settle();
};
const suggestCalls = () =>
  page.evaluate(() =>
    window.__ppCalls.filter((c) => c.method === 'SuggestPrompts').map((c) => c.req),
  );
const answerIdeas = (how) =>
  page.evaluate((how) => {
    const out = window.__ppOut.shift();
    if (!out) return false;
    if (how.ideas) out.res({ ideas: how.ideas, model: 'google/gemini-3.1-flash-lite' });
    else
      out.rej(
        Object.assign(new Error(how.message ?? 'refused'), {
          status: how.status,
          details: how.reason
            ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: how.reason }]
            : undefined,
        }),
      );
    return true;
  }, how);
const rows = (which) => page.locator(`[data-ideas-group="${which}"] button`).allTextContents();
const groupLabels = () => page.locator('[data-ideas-menu] p[aria-hidden]').allTextContents();
const thinking = () => page.locator('[data-ideas-menu] [role="status"]').count();
const boxTop = async (sel) => (await page.locator(sel).boundingBox())?.y ?? NaN;
const textOf = (key) => field(key).locator('textarea').inputValue();

const STATIC_GARMENT = [
  'the cropped denim jacket',
  'the shirt only, keep the trousers',
  'the sweater body, keep the rib trims',
  'the dress, keep the buttons as they are',
  'the coat shell, not the lining',
];

async function shoot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const [w, h] of [
    [1440, 900],
    [768, 900],
    [375, 812],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await settle(120);
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle(120);
}

// ─── A · старый сервер ─────────────────────────────────────────────────────────────────────────
head('A', 'старый сервер и сервер без ассистента: только статический список, без вызова');
try {
  for (const [name, band] of [
    ['поля 33 нет', OLD],
    ['поле 33 пустое', { ...OLD, suggestPromptsModel: '' }],
  ]) {
    await fresh('change_color', band, { images: { photos: [media(101)] } });
    await openIdeas('change_color.garment');
    ck(
      JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT),
      `${name}: пять статических идей, как во второй фазе`,
      JSON.stringify(await rows('static')),
    );
    ck(
      (await page.locator('[data-ideas-group="server"]').count()) === 0 &&
        (await groupLabels()).length === 0,
      `${name}: ни серверной группы, ни подписей`,
    );
    ck(
      (await suggestCalls()).length === 0,
      `${name}: SuggestPrompts не зван`,
      JSON.stringify(await suggestCalls()),
    );
  }
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── B · новый сервер: «thinking…», порядок, запрос, выбор ─────────────────────────────────────
head('B', 'новый сервер: thinking…, фразы сервера над линией, статические ниже, вставка у каретки');
try {
  await fresh('change_color', NEW, {
    images: { photos: [media(101), media(102), media(103)] },
    texts: { garment: 'the jacket' },
  });
  // The caret at the end of the text, as a person leaves it after typing.
  await field('change_color.garment').locator('textarea').click();
  await page.keyboard.press('End');
  await openIdeas('change_color.garment');
  ck((await thinking()) === 1, 'сразу строка «thinking…» (не спиннер: role=status, не кнопка)');
  ck(
    JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT),
    'статический список виден сразу, пока сервер думает',
  );
  const [req] = await suggestCalls();
  ck(
    req &&
      req.techCardId === 7 &&
      req.workflow === 'change_color' &&
      req.field === 'garment' &&
      JSON.stringify(req.mediaIds) === '[101]' &&
      req.text === 'the jacket' &&
      /^Tool: Change a Color\n/.test(req.context) &&
      /This field: which garment in the photographs/.test(req.context) &&
      /Filled so far: Reference image \(photos: pictures #101 #102 #103\)/.test(req.context) &&
      !req.context.includes('the jacket'),
    'запрос: карточка, workflow, поле, ПЕРВОЕ фото формы, текст, контекст со ЗНАЧЕНИЯМИ (без своего текста)',
    JSON.stringify(req),
  );
  await shoot('ideas-thinking');
  await answerIdeas({
    ideas: [
      'the collar only',
      '  the Cropped   Denim Jacket ',
      'THE COLLAR ONLY',
      '',
      'the sleeves',
    ],
  });
  await settle();
  ck((await thinking()) === 0, '«thinking…» ушла с ответом');
  ck(
    JSON.stringify(await rows('server')) ===
      JSON.stringify(['the collar only', 'the Cropped Denim Jacket', 'the sleeves']),
    'фразы сервера: обрезаны, пробелы схлопнуты, без пустых и повторов',
    JSON.stringify(await rows('server')),
  );
  ck(
    JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT.slice(1)),
    'статические — без того, что сервер уже сказал (его строка выигрывает повтор)',
    JSON.stringify(await rows('static')),
  );
  ck(
    JSON.stringify(await groupLabels()) === JSON.stringify(['for this picture', 'more']),
    'подписи групп: «for this picture» и «more»',
    JSON.stringify(await groupLabels()),
  );
  const serverTop = await boxTop('[data-ideas-group="server"]');
  const staticTop = await boxTop('[data-ideas-group="static"]');
  ck(
    serverTop < staticTop,
    'серверная группа ВЫШЕ статической на экране',
    `${serverTop} / ${staticTop}`,
  );
  ck(
    /border-t/.test(
      (await page.locator('[data-ideas-group="static"]').getAttribute('class')) ?? '',
    ),
    'между группами одна волосяная линия',
  );
  await shoot('ideas-answered');
  await page.locator('[data-ideas-group="server"] button', { hasText: 'the sleeves' }).click();
  await settle();
  ck(
    (await textOf('change_color.garment')) === 'the jacket, the sleeves',
    'выбор фразы сервера вставлен у каретки, как статической',
    await textOf('change_color.garment'),
  );
  ck((await page.evaluate(() => window.__pp.alerts())).length === 0, 'без тостов');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── C · кэш ───────────────────────────────────────────────────────────────────────────────────
head('C', 'кэш: тот же вопрос — сразу и без вызова; другой текст — новый вызов');
try {
  await fresh('change_color', NEW, {
    images: { photos: [media(101)] },
    texts: { garment: 'coat' },
  });
  await openIdeas('change_color.garment');
  await answerIdeas({ ideas: ['the lapels', 'the pockets', 'the belt'] });
  await settle();
  await closeMenu();
  await openIdeas('change_color.garment');
  ck(
    (await thinking()) === 0 &&
      JSON.stringify(await rows('server')) ===
        JSON.stringify(['the lapels', 'the pockets', 'the belt']),
    'повторное нажатие: ответ сразу, без «thinking…»',
  );
  ck(
    (await suggestCalls()).length === 1,
    'повторное нажатие не платит второй раз',
    String((await suggestCalls()).length),
  );
  await closeMenu();
  await field('change_color.garment').locator('textarea').fill('coat, long');
  await openIdeas('change_color.garment');
  ck((await suggestCalls()).length === 2, 'другой текст — новый вопрос, новый вызов');
  ck((await thinking()) === 1, 'и снова «thinking…»');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── D · отказ часа ────────────────────────────────────────────────────────────────────────────
head('D', 'сбой (429): статический список молча; следующее нажатие спрашивает снова');
try {
  await fresh('change_color', NEW, { images: { photos: [media(101)] } });
  await openIdeas('change_color.garment');
  await answerIdeas({ status: 429, message: 'too many AI requests this hour' });
  await settle();
  ck((await thinking()) === 0, '«thinking…» снята');
  ck(
    (await page.locator('[data-ideas-group="server"]').count()) === 0 &&
      (await groupLabels()).length === 0 &&
      JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT),
    'только статический список, без подписей — как будто никто не спрашивал',
  );
  ck(
    (await page.evaluate(() => window.__pp.alerts())).length === 0,
    'без тоста: меню — не действие',
  );
  await closeMenu();
  await openIdeas('change_color.garment');
  ck((await suggestCalls()).length === 2, 'сбой не кэшируется: следующее нажатие спрашивает снова');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── E · сессия выключается ────────────────────────────────────────────────────────────────────
head('E', 'AI_NOT_CONFIGURED / 404: серверная половина выключена до перезагрузки');
try {
  for (const [name, how] of [
    ['AI_NOT_CONFIGURED', { status: 412, reason: 'AI_NOT_CONFIGURED', message: 'AI is off' }],
    ['404', { status: 404, message: 'Not Found' }],
  ]) {
    await fresh('change_color', NEW, { images: { photos: [media(101)] } });
    await openIdeas('change_color.garment');
    await answerIdeas(how);
    await settle();
    await closeMenu();
    await field('change_color.garment').locator('textarea').fill('another question');
    await openIdeas('change_color.garment');
    ck(
      (await suggestCalls()).length === 1 && (await thinking()) === 0,
      `${name}: следующее нажатие не зовёт сервер и не думает`,
      String((await suggestCalls()).length),
    );
    ck(
      JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT),
      `${name}: статический список на месте`,
    );
  }
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// m-5 · a 404 WITH a reason is the server's NotFound about this question, not a missing route.
try {
  await fresh('change_color', NEW, { images: { photos: [media(101)] } });
  await openIdeas('change_color.garment');
  await answerIdeas({ status: 404, reason: 'DESIGN_NOT_FOUND', message: 'media 101 not found' });
  await settle();
  await closeMenu();
  await field('change_color.garment').locator('textarea').fill('another question');
  await openIdeas('change_color.garment');
  ck(
    (await suggestCalls()).length === 2 && (await thinking()) === 1,
    '404 с причиной (картинка вопроса удалена): сессия не выключена — следующее нажатие спрашивает',
    String((await suggestCalls()).length),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── F · закрыто, пока ответ в пути ────────────────────────────────────────────────────────────
head('F', 'меню закрыто до ответа: поздний ответ ложится в кэш, страница цела');
try {
  await fresh('change_color', NEW, { images: { photos: [media(101)] } });
  await openIdeas('change_color.garment');
  await closeMenu();
  await answerIdeas({ ideas: ['the hood', 'the cuffs', 'the hem'] });
  await settle();
  ck(
    (await page.locator('[data-ideas-menu]').count()) === 0,
    'поздний ответ не открывает меню сам',
  );
  await openIdeas('change_color.garment');
  ck(
    (await suggestCalls()).length === 1 &&
      JSON.stringify(await rows('server')) === JSON.stringify(['the hood', 'the cuffs', 'the hem']),
    'новое открытие показывает оплаченный ответ без второго вызова',
    `${(await suggestCalls()).length} ${JSON.stringify(await rows('server'))}`,
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── G · без картинки ──────────────────────────────────────────────────────────────────────────
head('G', 'без картинки: «for this field», mediaIds пуст');
try {
  await fresh('create_edit', NEW);
  await openIdeas('create_edit.prompt');
  const [req] = await suggestCalls();
  ck(req && JSON.stringify(req.mediaIds) === '[]', 'mediaIds пуст', JSON.stringify(req));
  await answerIdeas({ ideas: ['a studio shot on white', 'the same look outdoors', 'a flat lay'] });
  await settle();
  ck(
    (await groupLabels())[0] === 'for this field',
    'подпись «for this field»',
    JSON.stringify(await groupLabels()),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── I · ключ кэша — значения формы (G-03 Codex MINOR) ─────────────────────────────────────────
head('I', 'кэш по значениям формы: другой цвет при том же тексте — новый вопрос');
try {
  const colour = (code, hex) => ({ colour: { code, hex } });
  await fresh('change_color', NEW, {
    images: { photos: [media(101)] },
    texts: { garment: 'coat' },
    colours: colour('19-4052 TCX', '#0F4C81'),
  });
  await openIdeas('change_color.garment');
  await answerIdeas({ ideas: ['the lapels', 'the pockets', 'the belt'] });
  await settle();
  await closeMenu();
  const [first] = await suggestCalls();
  ck(
    /colour: 19-4052 TCX #0F4C81/.test(first?.context ?? ''),
    'контекст несёт значение цвета, а не только заголовок секции',
    first?.context,
  );
  // the same question on a remounted form (module memory lives): the cache answers
  await page.evaluate(
    ([band, over]) => window.__pp.mount('change_color', band, over),
    [
      NEW,
      {
        images: { photos: [media(101)] },
        texts: { garment: 'coat' },
        colours: colour('19-4052 TCX', '#0F4C81'),
      },
    ],
  );
  await page.waitForSelector('[data-prompt-field]');
  await openIdeas('change_color.garment');
  ck((await suggestCalls()).length === 1, 'та же форма — ответ из кэша, без вызова');
  await closeMenu();
  // another colour, the same text: a new question
  await page.evaluate(
    ([band, over]) => window.__pp.mount('change_color', band, over),
    [
      NEW,
      {
        images: { photos: [media(101)] },
        texts: { garment: 'coat' },
        colours: colour('11-0601 TCX', '#F4F5F0'),
      },
    ],
  );
  await page.waitForSelector('[data-prompt-field]');
  await openIdeas('change_color.garment');
  ck(
    (await suggestCalls()).length === 2 && (await thinking()) === 1,
    'другой цвет при том же тексте — новый вопрос, новый вызов (старый ответ не показан)',
    String((await suggestCalls()).length),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── J · вызов без ответа отпускается по сроку (G-03 Codex MINOR) ───────────────────────────────
head('J', 'вызов, который не отвечает: срок, статический список, тишина, без кэша');
try {
  await fresh('change_color', NEW, { images: { photos: [media(101)] } });
  await page.evaluate(() => {
    window.__ideasDeadlineMs = 300;
  });
  await openIdeas('change_color.garment');
  ck((await thinking()) === 1, 'нажатие — «thinking…»');
  await settle(600);
  ck(
    (await thinking()) === 0 &&
      (await page.locator('[data-ideas-group="server"]').count()) === 0 &&
      JSON.stringify(await rows('static')) === JSON.stringify(STATIC_GARMENT),
    'срок вышел: «thinking…» снята, только статический список',
  );
  ck((await page.evaluate(() => window.__pp.alerts())).length === 0, 'без тоста');
  ck(
    (await page.evaluate(() => window.__ppAborted)) === 1,
    'срок ОБРЫВАЕТ запрос (AbortController), а не оставляет его висеть (G-03 Codex r2)',
    String(await page.evaluate(() => window.__ppAborted)),
  );
  await closeMenu();
  await openIdeas('change_color.garment');
  ck(
    (await suggestCalls()).length === 1 && (await thinking()) === 0,
    'тишина после срока: нажатие того же вопроса не зовёт сервер и не «думает» (зависший не в кэше)',
    String((await suggestCalls()).length),
  );
  await closeMenu();
  await field('change_color.garment').locator('textarea').fill('another question');
  await openIdeas('change_color.garment');
  ck(
    (await suggestCalls()).length === 1,
    'тишина: и другой вопрос не зовёт — зависшее соединение не множит вызовы',
    String((await suggestCalls()).length),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── H · C-16: Recently used «on this card» ────────────────────────────────────────────────────
head('H', 'Recently used: «on this card» над линией, «in this browser» ниже, без повторов');
const recolor = (id, ask) => ({ id, kind: 'recolor', ask, params: { colour: { fabrics: [] } } });
const openRecent = async (key) => {
  await field(key).locator('button[aria-label="recently used"]').click();
  await page.waitForSelector('[data-recent-menu]');
  await settle();
};
const recentRows = (which) =>
  page.locator(`[data-recent-group="${which}"] button`).allTextContents();
const recentLabels = () => page.locator('[data-recent-menu] p[aria-hidden]').allTextContents();
try {
  const band = {
    ...OLD,
    runs: [
      recolor(30, 'the coat shell, not the lining'),
      recolor(29, 'the shirt only'),
      recolor(28, 'The Coat shell, not the lining'),
      { id: 27, kind: 'freeform', ask: 'add sunglasses', params: { freeform: { preset: 'free' } } },
    ],
  };
  await fresh('change_color', band, { texts: { garment: 'my own words' } }, [
    ['change_color', 'garment', 'the shirt only'],
    ['change_color', 'garment', 'the dress'],
  ]);
  await openRecent('change_color.garment');
  ck(
    JSON.stringify(await recentRows('card')) === JSON.stringify(['the coat shell, not the lining']),
    'на карточке: свои прогоны плитки, новые сверху, без повторов и без того, что есть в браузере',
    JSON.stringify(await recentRows('card')),
  );
  ck(
    JSON.stringify(await recentRows('browser')) === JSON.stringify(['the dress', 'the shirt only']),
    'в браузере: список второй фазы, как был',
    JSON.stringify(await recentRows('browser')),
  );
  ck(
    JSON.stringify(await recentLabels()) === JSON.stringify(['on this card', 'in this browser']),
    'подписи: «on this card» и «in this browser»',
    JSON.stringify(await recentLabels()),
  );
  const cardTop = await boxTop('[data-recent-group="card"]');
  const browserTop = await boxTop('[data-recent-group="browser"]');
  ck(
    cardTop < browserTop,
    'группа карточки ВЫШЕ браузерной на экране',
    `${cardTop} / ${browserTop}`,
  );
  ck(
    /border-t/.test(
      (await page.locator('[data-recent-group="browser"]').getAttribute('class')) ?? '',
    ),
    'между группами одна волосяная линия',
  );
  // The open door reads without a hover: its words and its ground differ (pointer moved away).
  await page.mouse.move(1, 1);
  await settle();
  const skin = await field('change_color.garment')
    .locator('button[aria-label="recently used"] span')
    .evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
  ck(
    skin[0] !== skin[1],
    'открытая дверь читается без наведения (слова не цвета фона)',
    JSON.stringify(skin),
  );
  await shoot('recent-two-groups');
  await page.locator('[data-recent-group="card"] button').first().click();
  await settle();
  ck(
    (await textOf('change_color.garment')) === 'the coat shell, not the lining' &&
      (await field('change_color.garment').getByText('undo ↶').count()) === 1,
    'выбор заменяет текст и даёт undo на 10 с, как у браузерного списка',
    await textOf('change_color.garment'),
  );

  await fresh('change_color', OLD, {}, [['change_color', 'garment', 'the dress']]);
  await openRecent('change_color.garment');
  ck(
    (await recentLabels()).length === 0 &&
      JSON.stringify(await recentRows('browser')) === JSON.stringify(['the dress']),
    'только браузерная группа — без подписей, как во второй фазе',
  );
  await fresh('create_edit', OLD);
  await openRecent('create_edit.prompt');
  ck(
    /Nothing yet/.test((await page.locator('[data-recent-menu]').textContent()) ?? ''),
    'обе пусты — строка «Nothing yet»',
  );

  // Tile 10's words live in the mask editor: the card's past retouches, both routes.
  await page.goto('http://probe.local/start');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(() => window.__pp.reset());
  await page.goto('http://probe.local/tech-cards/7');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(
    ([band, m]) => window.__pp.mask(band, m),
    [
      {
        ...OLD,
        runs: [
          { id: 41, kind: 'inpaint', ask: 'remove the stain', params: {} },
          {
            id: 40,
            kind: 'freeform',
            ask: '',
            params: {
              freeform: {
                preset: 'retouch',
                items: [{ mediaId: 5, texts: ['straighten the hem'] }],
              },
            },
          },
        ],
      },
      media(5),
    ],
  );
  await page.waitForSelector('[data-prompt-field="retouch_zone.change_text"]');
  await openRecent('retouch_zone.change_text');
  ck(
    JSON.stringify(await recentRows('card')) ===
      JSON.stringify(['remove the stain', 'straighten the hem']),
    'редактор маски: слова прошлых ретушей карточки (по маске — ask, окном — texts[0])',
    JSON.stringify(await recentRows('card')),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── K · 20-PROMPTS §3.8: Improve в режиме steer ──────────────────────────────────────────────
head(
  'K',
  'Improve: режим STEER и контекст «Tool / This field»; старый сервер — один повтор в IMPROVE',
);
const enhanceCalls = () =>
  page.evaluate(() => window.__ppCalls.filter((c) => c.method === 'EnhanceText').map((c) => c.req));
// The page's EnhanceText: `refuse` = what the FIRST call is refused with (null = none); every other
// call answers `answer`.
const answerEnhance = (refuse, answer) =>
  page.evaluate(
    ([refuse, answer]) => {
      let n = 0;
      window.__ppEnhance = () => {
        n++;
        if (n === 1 && refuse)
          return Promise.reject(
            Object.assign(new Error(refuse.message), {
              status: refuse.status,
              details: refuse.details,
            }),
          );
        return Promise.resolve({ text: answer });
      };
    },
    [refuse, answer],
  );
const improveIn = async (key) => {
  await field(key).getByRole('button', { name: 'improve' }).click();
  await settle(150);
};
const GARMENT_CTX =
  'Tool: Change a Color\nThis field: which garment in the photographs gets the new colour; everything else stays as it is';
const violation = (f, reason) => [
  {
    '@type': 'type.googleapis.com/google.rpc.BadRequest',
    fieldViolations: [{ field: f, description: `${reason}: refused` }],
  },
];
try {
  // No assistant on the band: the context is still «Tool / This field».
  await fresh('change_color', OLD, { texts: { garment: 'the jaket' } });
  await answerEnhance(null, 'the cropped denim jacket');
  await improveIn('change_color.garment');
  let calls = await enhanceCalls();
  ck(
    calls.length === 1 && calls[0].mode === 'ENHANCE_TEXT_MODE_STEER',
    'один вызов, режим ENHANCE_TEXT_MODE_STEER',
    JSON.stringify(calls.map((c) => c.mode)),
  );
  ck(
    calls[0]?.field === 'ENHANCE_TEXT_FIELD_OTHER' && calls[0]?.text === 'the jaket',
    'поле OTHER, текст как есть',
    JSON.stringify(calls[0]),
  );
  ck(
    calls[0]?.workflow === 'change_color' && calls[0]?.fieldKey === 'garment',
    'пара поля: workflow change_color, fieldKey garment',
    JSON.stringify([calls[0]?.workflow, calls[0]?.fieldKey]),
  );
  ck(
    calls[0]?.context === GARMENT_CTX,
    'без ассистента: контекст «Tool: Change a Color / This field: …»',
    JSON.stringify(calls[0]?.context),
  );
  ck(
    (await textOf('change_color.garment')) === 'the cropped denim jacket',
    'ответ заменяет текст',
    await textOf('change_color.garment'),
  );

  // With the assistant: the very context the Ideas door asks with.
  await fresh('change_color', NEW, { texts: { garment: 'the jaket' } });
  await answerEnhance(null, 'the cropped denim jacket');
  await improveIn('change_color.garment');
  await openIdeas('change_color.garment');
  calls = await enhanceCalls();
  const asked = (await suggestCalls())[0];
  ck(
    !!asked && calls[0]?.context === asked.context && calls[0].context.startsWith(GARMENT_CTX),
    'с ассистентом: контекст Improve — ровно тот, что у двери Ideas',
    JSON.stringify([calls[0]?.context, asked?.context]),
  );
  await closeMenu();

  // An old binary: STEER refused as a proven enum skew → one retry in IMPROVE, silently.
  for (const [name, refuse] of [
    [
      'нарушение на mode',
      {
        status: 400,
        message: 'choose improve, expand, shorten or prompt',
        details: violation('mode', 'unknown_mode'),
      },
    ],
    [
      '400 без нарушений, protojson называет enum-поле mode',
      {
        status: 400,
        message: 'proto: (line 1:32): invalid value for enum field mode: "ENHANCE_TEXT_MODE_STEER"',
        details: [],
      },
    ],
    [
      '400 без нарушений, сообщение называет член enum',
      { status: 400, message: 'unknown value "ENHANCE_TEXT_MODE_STEER"' },
    ],
  ]) {
    await fresh('change_color', OLD, { texts: { garment: 'the jaket' } });
    await answerEnhance(refuse, 'the cropped denim jacket');
    await improveIn('change_color.garment');
    calls = await enhanceCalls();
    ck(
      JSON.stringify(calls.map((c) => c.mode)) ===
        JSON.stringify(['ENHANCE_TEXT_MODE_STEER', 'ENHANCE_TEXT_MODE_IMPROVE']),
      `${name}: STEER, затем ОДИН повтор в IMPROVE`,
      JSON.stringify(calls.map((c) => c.mode)),
    );
    ck(
      calls[1]?.text === 'the jaket' && calls[1]?.context === GARMENT_CTX,
      `${name}: повтор с тем же текстом и контекстом`,
      JSON.stringify(calls[1]),
    );
    ck(
      !!calls[1] && !('workflow' in calls[1]) && !('fieldKey' in calls[1]),
      `${name}: повтор без пары workflow / fieldKey (старый шлюз не знает этих полей)`,
      JSON.stringify(calls[1]),
    );
    const said = await page.evaluate(() => window.__pp.alerts());
    ck(
      (await textOf('change_color.garment')) === 'the cropped denim jacket' && said.length === 0,
      `${name}: ответ повтора в поле, без тоста`,
      JSON.stringify([await textOf('change_color.garment'), said]),
    );
  }

  // A 400 that names the text is the text's own refusal: no retry, its words are said.
  await fresh('change_color', OLD, { texts: { garment: 'the jaket' } });
  await answerEnhance(
    { status: 400, message: 'the text is too long', details: violation('text', 'too_long') },
    'never',
  );
  await improveIn('change_color.garment');
  calls = await enhanceCalls();
  const said = await page.evaluate(() => window.__pp.alerts());
  ck(
    calls.length === 1 && (await textOf('change_color.garment')) === 'the jaket',
    '400 по полю text: без повтора, текст не тронут',
    JSON.stringify(calls.map((c) => c.mode)),
  );
  ck(
    said.some((m) => /could not improve: the text is too long/.test(m)),
    '400 по полю text: сказано его словами',
    JSON.stringify(said),
  );

  // Not a proven skew → no retry, the refusal's own words (Codex MAJOR): a detail-free content
  // refusal, and a refusal of the tool/field pair by a server that knows STEER.
  for (const [name, refuse, words] of [
    [
      '400 без нарушений, отказ по содержанию',
      { status: 400, message: 'refused: the text asks for a real person', details: [] },
      /could not improve: refused: the text asks for a real person/,
    ],
    [
      '400 с нарушением на workflow',
      {
        status: 400,
        message: 'workflow: unknown',
        details: violation('workflow', 'unknown'),
      },
      /could not improve: workflow: unknown/,
    ],
    [
      '400 с нарушением на field_key',
      {
        status: 400,
        message: 'field_key: unknown',
        details: violation('field_key', 'unknown'),
      },
      /could not improve: field_key: unknown/,
    ],
  ]) {
    await fresh('change_color', OLD, { texts: { garment: 'the jaket' } });
    await answerEnhance(refuse, 'never');
    await improveIn('change_color.garment');
    calls = await enhanceCalls();
    const told = await page.evaluate(() => window.__pp.alerts());
    ck(
      JSON.stringify(calls.map((c) => c.mode)) === JSON.stringify(['ENHANCE_TEXT_MODE_STEER']) &&
        (await textOf('change_color.garment')) === 'the jaket',
      `${name}: без повтора, текст не тронут`,
      JSON.stringify([calls.map((c) => c.mode), await textOf('change_color.garment')]),
    );
    ck(
      told.some((m) => words.test(m)),
      `${name}: тост его словами`,
      JSON.stringify(told),
    );
  }

  // The generic `ai ✦` menu never offers steer.
  const modes = await page.evaluate(() => window.__pp.enhanceModes());
  ck(
    JSON.stringify(modes) === JSON.stringify(['improve', 'expand', 'shorten', 'prompt']),
    'ENHANCE_MODES общего меню — improve/expand/shorten/prompt, без steer',
    JSON.stringify(modes),
  );

  // Tile 10's words in the mask editor: the same «Tool / This field» context.
  await page.goto('http://probe.local/start');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(() => window.__pp.reset());
  await page.goto('http://probe.local/tech-cards/7');
  await page.waitForFunction(() => !!window.__pp);
  await page.evaluate(([band, m]) => window.__pp.mask(band, m), [OLD, media(5)]);
  await page.waitForSelector('[data-prompt-field="retouch_zone.change_text"]');
  const maskPlaceholder = await field('retouch_zone.change_text')
    .locator('textarea')
    .getAttribute('placeholder');
  ck(
    maskPlaceholder === 'smooth clean fabric, the same colour and weave',
    'редактор маски: плейсхолдер описывает результат',
    JSON.stringify(maskPlaceholder),
  );
  await field('retouch_zone.change_text').locator('textarea').fill('no stain');
  await answerEnhance(null, 'clean fabric, the same colour and weave');
  await improveIn('retouch_zone.change_text');
  calls = await enhanceCalls();
  ck(
    calls[0]?.mode === 'ENHANCE_TEXT_MODE_STEER' &&
      calls[0]?.context ===
        'Tool: Retouch a Zone\nThis field: what the painted zone should show when it is done — describe the result, not the operation',
    'редактор маски: STEER и «Tool: Retouch a Zone / This field: … the result, not the operation»',
    JSON.stringify(calls[0]),
  );
  ck(
    calls[0]?.workflow === 'retouch_zone' && calls[0]?.fieldKey === 'change_text',
    'редактор маски: пара workflow retouch_zone, fieldKey change_text',
    JSON.stringify([calls[0]?.workflow, calls[0]?.fieldKey]),
  );
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
