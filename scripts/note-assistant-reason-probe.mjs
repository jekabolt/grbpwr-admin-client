#!/usr/bin/env node
// ПОЧЕМУ «ПОМОЩНИК НЕ ПОДКЛЮЧЁН» ОБЯЗАН РАСПАСТЬСЯ НА ДВА СОСТОЯНИЯ.
//
// Обе неустранимые причины приезжают одним кодом (FailedPrecondition), поэтому панель показывала
// их одинаково — спокойным «not connected». На бете это правда: ключа нет, состояние штатное. НА
// ПРОДЕ КЛЮЧ ЕСТЬ, и снятый с обслуживания слуг выглядел там ровно так же: норма, которая никого
// не побудит разбираться. Сделав текст честным, мы заодно сделали поломку тихой — а прошлый
// случай был плох ровно тем, что о поломке никто не знал, пока человек не пожаловался.
//
// Сервер теперь кладёт причину в `google.rpc.Status.details` (ErrorInfo.reason), и проверяются ТРИ
// ответа, а не два:
//   1. reason=AI_MODEL_UNAVAILABLE — обязано выглядеть ПОЛОМКОЙ и не предлагать повтор;
//   2. reason=AI_NOT_CONFIGURED    — обязано остаться тихим `off`, это норма развёртывания;
//   3. БЕЗ `details` вовсе         — старый бэкенд. Обязано остаться сегодняшним `off`.
// Третий случай и есть смысл пробы: клиент уезжает на бету отдельно от бэкенда, и порядок деплоя
// не гарантирован никем, кроме нас.
//
// Состояние читается атрибутом `data-ai-state` у КОНКРЕТНОГО узла, а не текстом страницы: склейка
// соседних узлов через textContent уже давала здесь ложную зелень.
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден:
// гейт, который нельзя выполнить, не красит сборку в красный.
//
//   node scripts/note-assistant-reason-probe.mjs

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

const entry = resolvePlaywright();
if (!entry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `note-assistant-reason-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'note-assistant-reason-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
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

// Форма тела запинена бэкендским тестом (protojson по status.Proto()) — здесь она не выдумана.
const errorInfo = (reason, metadata) => ({
  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
  reason,
  domain: 'ai.grbpwr.com',
  ...(metadata ? { metadata } : {}),
});
const FAILED_PRECONDITION = 9;

const cases = [
  {
    name: 'слуг мёртв (reason=AI_MODEL_UNAVAILABLE)',
    body: {
      code: FAILED_PRECONDITION,
      message:
        'markdown assistant is misconfigured: the provider serves no endpoint for model "anthropic/claude-3.5-sonnet" — check OPENROUTER_MODEL, and OPENROUTER_BASE_URL if this deployment overrides it',
      details: [errorInfo('AI_MODEL_UNAVAILABLE', { model: 'anthropic/claude-3.5-sonnet' })],
    },
    wantState: 'misconfigured',
  },
  {
    name: 'ключа нет (reason=AI_NOT_CONFIGURED)',
    body: {
      code: FAILED_PRECONDITION,
      message: 'markdown assistant is not configured (set OPENROUTER_API_KEY)',
      details: [errorInfo('AI_NOT_CONFIGURED')],
    },
    wantState: 'off',
  },
  {
    name: 'СТАРЫЙ БЭКЕНД: details нет вовсе',
    body: {
      code: FAILED_PRECONDITION,
      message: 'markdown assistant is not configured (set OPENROUTER_API_KEY)',
    },
    wantState: 'off',
  },
];

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', () => {});
// НАСТОЯЩЕЕ ПРОИСХОЖДЕНИЕ, а не about:blank: `notesService` читает `localStorage`, и на непрозрачном
// источнике тот бросает SecurityError ВНУТРИ try вокруг запроса — то есть любой ответ читался бы
// как «соединение оборвалось», и проба зеленела бы мимо проверяемого разбора.
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
const seen = {};

for (const c of cases) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    ([status, body]) => window.__mount(status, body),
    [400, c.body], // шлюз отдаёт FailedPrecondition как HTTP 400
  );
  await page.waitForSelector('[data-ai-state]', { timeout: 5000 }).catch(() => {});

  const got = await page.evaluate(() => {
    const node = document.querySelector('[data-ai-state]');
    if (!node) return null;
    return {
      state: node.getAttribute('data-ai-state'),
      // Класс берётся у САМОЙ коробки, а не у страницы: тон — это то, чем состояние отличается
      // от нормы визуально, и он должен быть проверен отдельно от слов.
      boxClass: node.parentElement?.className ?? '',
      buttons: [...node.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
      // Текст ТОЛЬКО этого узла, для сверки, что два состояния говорят разное.
      text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });

  console.log(`\n${c.name}`);
  ck(got !== null, 'панель что-то отрисовала');
  if (!got) continue;
  seen[c.wantState] = seen[c.wantState] ?? [];
  seen[c.wantState].push({ name: c.name, ...got });

  ck(got.state === c.wantState, `состояние = ${c.wantState}`, `получено ${got.state}`);
  if (c.wantState === 'misconfigured') {
    ck(
      !got.buttons.some((b) => /retry/i.test(b)),
      'кнопки «retry» нет: повтор по-прежнему не поможет',
      got.buttons.join(', '),
    );
    ck(got.buttons.length > 0, 'блок можно закрыть', got.buttons.join(', '));
    ck(
      /border-error/.test(got.boxClass),
      'коробка нарисована как поломка (tone=error), а не как норма',
      got.boxClass,
    );
  }
  if (c.wantState === 'off') {
    ck(
      /border-borderColor/.test(got.boxClass),
      'тихое состояние остаётся нейтральным (tone=note)',
      got.boxClass,
    );
  }
}

// Два состояния обязаны ГОВОРИТЬ разное — иначе новое состояние есть только в разметке.
const dead = (seen.misconfigured ?? [])[0];
const quiet = (seen.off ?? [])[0];
console.log('\nразличимость');
ck(!!dead && !!quiet, 'оба состояния наблюдались');
if (dead && quiet) {
  ck(dead.text !== quiet.text, 'тексты состояний различаются');
  ck(
    /setting|misconfigur|configuration/i.test(dead.text),
    'поломка названа поломкой настройки, а не погодой',
    dead.text.slice(0, 90),
  );
}

// Старый бэкенд обязан дать РОВНО то же, что и «ключа нет»: иначе мы сломали то, что работает.
const offs = seen.off ?? [];
ck(
  offs.length === 2 && offs[0].text === offs[1].text,
  'старый бэкенд (без details) неотличим от сегодняшнего поведения',
  offs.map((o) => o.text.slice(0, 40)).join(' | '),
);

await browser.close();
rmSync(outfile, { force: true });
console.log(bad === 0 ? '\nвсё сошлось' : `\nрасхождений: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
