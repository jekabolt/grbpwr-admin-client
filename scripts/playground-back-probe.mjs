#!/usr/bin/env node
// PLAYGROUND: ИСТОРИЯ БРАУЗЕРА — ТОЛЬКО REPLACE (C-05 → G-01 r2).
//
// C-05 клал запись истории на каждое открытие плитки, чтобы Back браузера возвращал к сетке. Два
// круга ревью показали цену: каждый ДРУГОЙ выход с этой записи (ячейка рельса, вкладка карточки,
// рекол) обязан был сначала её снять и потом переписать то, что открылось, а снятие асинхронно —
// двойной клик уводил с карточки, поздний `popstate` терял шаг, вкладка карточки оставляла
// сетку-сироту. Правило теперь одно (разбор — `playground/address.ts`):
//   · ВСЕ писатели `?wf=` и `?step=` — replace: открыть плитку, |→, рекол, рельс, старый `?step=aside`;
//   · |→ — единственный путь к сетке; Back браузера уводит с карточки, как до C-05;
//   · ничего не ждёт `popstate` — гонкам не из чего возникнуть, и в StrictMode тоже.
//
// Меряются настоящие `useWorkflowAddress`, `useStepAddress` и `useLegacyStepRewrite` под настоящим
// BrowserRouter В STRICTMODE в Chromium: адрес, длина истории, КУДА ВЕДЁТ ОДИН Back браузера.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается):
//   node scripts/playground-back-probe.mjs                        прогон
//   node scripts/playground-back-probe.mjs --mutate-push          открытие плитки снова push →
//                                                                 группы 1, 5, 6
//   node scripts/playground-back-probe.mjs --mutate-rail-push     рельс кладёт запись → группа 5
//   node scripts/playground-back-probe.mjs --mutate-rail-keeps-wf рельс не снимает `?wf=` → 5
//   node scripts/playground-back-probe.mjs --mutate-legacy-wf     чужой `?wf=` перекрывает старый
//                                                                 шаг → группа 7
//
// Playwright не в зависимостях репозитория (как у остальных браузерных проб здесь) — ищется в
// node_modules, затем в кэше npx; не нашёлся — проба НЕ ВЫПОЛНЕНА, КОД 2 (не 0: пропуск — не
// зелень, и гейт по коду возврата обязан это видеть). Поставить: `npx playwright install chromium`.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUT = {
  push: process.argv.includes('--mutate-push'),
  railPush: process.argv.includes('--mutate-rail-push'),
  railKeepsWf: process.argv.includes('--mutate-rail-keeps-wf'),
  legacyWf: process.argv.includes('--mutate-legacy-wf'),
};
const KNOWN = [
  '--mutate-push',
  '--mutate-rail-push',
  '--mutate-rail-keeps-wf',
  '--mutate-legacy-wf',
];
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.includes(a));
if (stray) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: неизвестный флаг мутации ${stray}`);
  process.exit(2);
}

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
if (!browser) {
  console.log(
    'ПРОБА НЕ ВЫПОЛНЕНА: playwright с chromium не найден — ни одной проверки (код 2); поставить: npx playwright install chromium',
  );
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const swap = (name, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter: /playground\/address\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) throw new Error(`мутация ${name} не нашла свою строку`);
      return { contents: src.replace(needle, replacement), loader: 'ts' };
    });
  },
});
const plugins = [];
if (MUT.push)
  plugins.push(
    swap(
      'open-pushes',
      `        { replace: true },
      ),
    [setParams],
  );

  return { asked:`,
      `        { replace: false },
      ),
    [setParams],
  );

  return { asked:`,
    ),
  );
if (MUT.railPush)
  plugins.push(
    swap(
      'rail-pushes',
      `          if (next !== 'playground') p.delete(PLAYGROUND_WF_PARAM);
          return p;
        },
        { replace: true },`,
      `          if (next !== 'playground') p.delete(PLAYGROUND_WF_PARAM);
          return p;
        },
        { replace: false },`,
    ),
  );
if (MUT.railKeepsWf)
  plugins.push(
    swap('rail-keeps-wf', "if (next !== 'playground') p.delete(PLAYGROUND_WF_PARAM);", ''),
  );
if (MUT.legacyWf)
  plugins.push(
    swap(
      'stale-wf-wins',
      '        p.set(PLAYGROUND_WF_PARAM, legacy.wf);',
      '        if (!p.get(PLAYGROUND_WF_PARAM)) p.set(PLAYGROUND_WF_PARAM, legacy.wf);',
    ),
  );

const outfile = resolve(tmpdir(), `playground-back-${process.pid}.js`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-back-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl' },
    plugins,
    define: {
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    alias: {
      components: resolve(REPO, 'src/components'),
      lib: resolve(REPO, 'src/lib'),
      api: resolve(REPO, 'src/api'),
      utils: resolve(REPO, 'src/utils'),
      ui: resolve(REPO, 'src/ui'),
      constants: resolve(REPO, 'src/constants'),
      hooks: resolve(REPO, 'src/hooks'),
    },
  });
} catch (e) {
  await browser.close();
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: сборка упала — ${e.message} (код 2)`);
  process.exit(2);
}
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

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

const page = await browser.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`,
  }),
);

const CARD = 'http://probe.local/tech-cards/7?tab=studio&step=playground';
const url = () => new URL(page.url());
const wf = () => url().searchParams.get('wf');
const shown = () => page.locator('#wf').textContent();
const len = () => page.evaluate(() => history.length);
const settle = () => page.waitForTimeout(80);
const fresh = async (to) => {
  await page.goto('http://probe.local/start');
  await page.goto(to);
  await page.waitForSelector('#wf');
};

const back = async () => {
  await page.goBack();
  await settle();
};
// Сколько ждать «позднего» перехода: старый код снимал запись и ждал `popstate` до секунды.
const LATE = 1300;

head('1', 'открыть плитку из сетки — replace: записи не прибавилось, Back уводит с карточки');
try {
  await fresh(CARD);
  const before = await len();
  await page.click('#open');
  await settle();
  ck(
    wf() === 'change_color' && (await shown()) === 'change_color',
    'плитка открыта, адрес её называет',
    page.url(),
  );
  ck((await len()) === before, 'открытие НЕ добавило записи', `${before} → ${await len()}`);
  await back();
  ck(url().pathname === '/start', 'один Back — страница до карточки', page.url());
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('2', '|→ — путь к сетке, replace');
try {
  await fresh(CARD);
  await page.click('#open');
  await settle();
  const opened = await len();
  await page.click('#back');
  await settle();
  ck(wf() === null && (await shown()) === 'grid', '|→ — сетка', page.url());
  ck(url().searchParams.get('step') === 'playground', 'шаг не потерян', page.url());
  ck((await len()) === opened, 'длина истории та же', `${opened} → ${await len()}`);
  await back();
  ck(url().pathname === '/start', 'Back после |→ — страница до карточки', page.url());
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('3', 'ссылка прямо на плитку: |→ — сетка той же карточки, Back — туда, откуда пришли');
try {
  await fresh(`${CARD}&wf=change_color`);
  const before = await len();
  await page.click('#back');
  await settle();
  ck(url().pathname === '/tech-cards/7' && wf() === null, '|→ — сетка той же карточки', page.url());
  ck((await len()) === before, 'записи не прибавилось', `${before} → ${await len()}`);
  await back();
  ck(url().pathname === '/start', 'Back — страница до ссылки', page.url());
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('4', 'рекол — replace, в том числе поверх открытой плитки');
try {
  await fresh(CARD);
  const before = await len();
  await page.click('#recall');
  await settle();
  ck(
    wf() === 'create_edit' && (await len()) === before,
    'рекол с сетки открывает плитку без новой записи',
    `${page.url()} · ${before} → ${await len()}`,
  );
  await page.click('#open');
  await settle();
  await page.click('#recall');
  await settle();
  ck(
    wf() === 'create_edit' && (await len()) === before,
    'плитка → рекол: та же запись',
    `${page.url()} · ${before} → ${await len()}`,
  );
  await page.click('#back');
  await settle();
  ck(wf() === null && (await shown()) === 'grid', '|→ — сетка', page.url());
  await back();
  ck(url().pathname === '/start', 'Back — страница до карточки (второй сетки нет)', page.url());
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('5', 'рельс уходит с плитки: `?wf=` снят, Back уводит с карточки, двойной клик не гонится');
try {
  await fresh(CARD);
  const before = await len();
  await page.click('#open');
  await settle();
  await page.click('#rail-flat');
  await settle();
  ck(
    url().searchParams.get('step') === 'flat' && wf() === null,
    'рельс — шаг flat, `?wf=` снят',
    page.url(),
  );
  ck((await len()) === before, 'записи не прибавилось', `${before} → ${await len()}`);
  await back();
  ck(url().pathname === '/start', 'Back — страница до карточки, не сетка', page.url());

  // Два щелчка по ячейкам подряд, без паузы: последний выигрывает, и позже ничего не «догоняет».
  await fresh(CARD);
  await page.click('#open');
  await settle();
  await page.evaluate(() => {
    document.getElementById('rail-flat').click();
    document.getElementById('rail-render').click();
  });
  await page.waitForTimeout(LATE);
  ck(
    url().pathname === '/tech-cards/7' &&
      url().searchParams.get('step') === 'render' &&
      wf() === null,
    'двойной клик: шаг render, карточка на месте (и через секунду тоже)',
    page.url(),
  );
  await back();
  ck(url().pathname === '/start', 'Back — страница до карточки', page.url());

  // Нажатие на уже открытую ячейку playground не трогает ни плитку, ни историю.
  await fresh(CARD);
  await page.click('#open');
  await settle();
  const opened = await len();
  await page.click('#rail-playground');
  await page.waitForTimeout(LATE);
  ck(
    wf() === 'change_color' && (await len()) === opened,
    'ячейка playground на плитке — ничего не сдвинуто',
    page.url(),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('6', 'вкладка карточки с открытой плитки: Back уводит с карточки, сироты нет');
try {
  await fresh(CARD);
  const before = await len();
  await page.click('#open');
  await settle();
  await page.click('#tab-artifacts');
  await page.waitForTimeout(LATE);
  ck(
    (await page.locator('#tab').textContent()) === 'artifacts' && (await len()) === before,
    'вкладка сменилась без новой записи',
    `${page.url()} · ${before} → ${await len()}`,
  );
  await back();
  ck(url().pathname === '/start', 'Back — страница до карточки, не сетка PLAYGROUND', page.url());
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('7', 'старый `?step=aside` с чужим `?wf=`: адрес целиком старого шага, без новой записи');
try {
  await page.goto('http://probe.local/start');
  await page.goto('http://probe.local/tech-cards/7?tab=studio&step=aside&wf=create_edit');
  await page.waitForSelector('#wf');
  await settle();
  const p = url().searchParams;
  ck(
    p.get('step') === 'playground' && p.get('wf') === 'change_color' && p.get('tab') === 'studio',
    'step=playground&wf=change_color',
    page.url(),
  );
  ck((await shown()) === 'change_color', 'экран — Change a Color', await shown());
  await back();
  ck(
    url().pathname === '/start',
    'переписано replace — один Back уводит туда, откуда пришли',
    page.url(),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

ck(errors.length === 0, 'страница без ошибок', errors.join(' | '));
await browser.close();

const MUTATED = Object.values(MUT).some(Boolean);
console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    (MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
