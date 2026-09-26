#!/usr/bin/env node
// PLAYGROUND: BACK ВОЗВРАЩАЕТ К СЕТКЕ (C-05).
//
// Владелец открывает плитку из сетки и жмёт «назад» браузера — и обязан оказаться на сетке, а не
// покинуть карточку. До C-05 `?wf=` писался `replace`, и Back уводил со страницы. Правило теперь:
//   · открыть плитку из сетки — НОВАЯ запись истории (push), с меткой `FROM_GRID` в её state;
//   · всё остальное — replace (рекол, чужой писатель адреса);
//   · |→ шагает на одну запись назад, когда под ней сетка, из которой открыли, и иначе
//     ПЕРЕПИСЫВАЕТ запись сеткой (ссылка, приведшая прямо на плитку, сетки под собой не имеет).
//
// G-01 добавил то, чего проба не видела (Codex 7, 9):
//   · рельс, уходящий с плитки, открытой из сетки, сначала СНИМАЕТ её запись — Back с нового шага
//     уводит с карточки, а не на осиротевшую сетку (группа 5);
//   · рекол поверх плитки, открытой из сетки, сохраняет метку: |→ шагает назад, Back уводит с
//     карточки, двух одинаковых сеток в истории нет (группа 6);
//   · старый `?step=aside` с чужим `?wf=` переписывается ЦЕЛИКОМ в step=playground&wf=change_color,
//     без новой записи (группа 7).
//
// Меряются настоящие `useWorkflowAddress`, `useStepAddress` и `useLegacyStepRewrite` под настоящим
// BrowserRouter в Chromium: адрес, длина истории, Back/Forward браузера.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается):
//   node scripts/playground-back-probe.mjs                     прогон
//   node scripts/playground-back-probe.mjs --mutate-push       открытие из сетки снова replace →
//                                                              Back уводит с карточки, группа 1
//   node scripts/playground-back-probe.mjs --mutate-back       |→ никогда не шагает назад, а
//                                                              переписывает → группа 2
//   node scripts/playground-back-probe.mjs --mutate-rail       рельс переписывает запись плитки,
//                                                              не сняв её → группа 5
//   node scripts/playground-back-probe.mjs --mutate-keep-mark  рекол сбрасывает метку → группа 6
//   node scripts/playground-back-probe.mjs --mutate-legacy-wf  чужой `?wf=` перекрывает старый
//                                                              шаг → группа 7
//
// Playwright не в зависимостях — ищется в кэше npx; не нашёлся — проба НЕ ВЫПОЛНЕНА, код 2 (не 0:
// пропуск — не зелень, и гейт по коду возврата обязан это видеть).

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
  back: process.argv.includes('--mutate-back'),
  rail: process.argv.includes('--mutate-rail'),
  keepMark: process.argv.includes('--mutate-keep-mark'),
  legacyWf: process.argv.includes('--mutate-legacy-wf'),
};
const KNOWN = [
  '--mutate-push',
  '--mutate-back',
  '--mutate-rail',
  '--mutate-keep-mark',
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
  console.log('ПРОБА НЕ ВЫПОЛНЕНА: playwright с chromium не найден — ни одной проверки (код 2)');
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
      'open-replaces',
      "const openFromGrid = useCallback((key: WorkflowKey) => write(key, 'push'), [write]);",
      "const openFromGrid = useCallback((key: WorkflowKey) => write(key, 'replace'), [write]);",
    ),
  );
if (MUT.back)
  plugins.push(swap('back-rewrites', 'if (fromGrid) navigate(-1);', 'if (false) navigate(-1);'));
if (MUT.rail)
  plugins.push(
    swap('rail-replaces-in-place', "if (next === 'playground' || !fromGrid) {", 'if (true) {'),
  );
if (MUT.keepMark)
  plugins.push(
    swap(
      'recall-drops-mark',
      "(key: WorkflowKey | null) => write(key, key && fromGrid ? 'keep-mark' : 'replace'),",
      "(key: WorkflowKey | null) => write(key, 'replace'),",
    ),
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
const settle = () => page.waitForTimeout(60);
const fresh = async (to) => {
  await page.goto('http://probe.local/start');
  await page.goto(to);
  await page.waitForSelector('#wf');
};

head('1', 'открыть плитку из сетки — запись истории; Back браузера возвращает к сетке');
{
  await fresh(CARD);
  const before = await len();
  await page.click('#open');
  await settle();
  ck(
    wf() === 'change_color' && (await shown()) === 'change_color',
    'плитка открыта, адрес её называет',
    page.url(),
  );
  ck(
    (await len()) === before + 1,
    'открытие добавило запись истории',
    `${before} → ${await len()}`,
  );
  await page.goBack();
  await settle();
  ck(
    url().pathname === '/tech-cards/7' && wf() === null,
    'Back браузера — сетка той же карточки',
    page.url(),
  );
  ck((await shown()) === 'grid', 'экран снова сетка');
  ck(url().searchParams.get('step') === 'playground', 'шаг не потерян');
}

head('2', '|→ после открытия из сетки шагает назад, а не переписывает');
{
  await fresh(CARD);
  await page.click('#open');
  await settle();
  const opened = await len();
  await page.click('#back');
  await settle();
  ck(wf() === null && (await shown()) === 'grid', '|→ — сетка', page.url());
  await page.goForward();
  await settle();
  ck(
    wf() === 'change_color',
    'Forward возвращает плитку — |→ сделал шаг назад, записи не переписаны',
    page.url(),
  );
  ck((await len()) === opened, 'длина истории та же', `${opened} → ${await len()}`);
}

head('3', 'ссылка прямо на плитку: |→ переписывает запись сеткой, Back уводит туда, откуда пришли');
{
  await fresh(`${CARD}&wf=change_color`);
  const before = await len();
  await page.click('#back');
  await settle();
  ck(
    url().pathname === '/tech-cards/7' && wf() === null,
    '|→ — сетка той же карточки (не уход со страницы)',
    page.url(),
  );
  ck((await len()) === before, 'записи не прибавилось', `${before} → ${await len()}`);
  await page.goBack();
  await settle();
  ck(url().pathname === '/start', 'Back — страница до ссылки', page.url());
}

head('4', 'рекол и чужой писатель адреса — replace');
{
  await fresh(CARD);
  const before = await len();
  await page.click('#recall');
  await settle();
  ck(
    wf() === 'create_edit' && (await len()) === before,
    'рекол открывает плитку без новой записи',
    `${page.url()} · ${before} → ${await len()}`,
  );

  await fresh(CARD);
  await page.click('#open');
  await settle();
  const opened = await len();
  await page.click('#other');
  await settle();
  await page.click('#back');
  await settle();
  ck(
    url().pathname === '/tech-cards/7' && wf() === null,
    'после replace чужим писателем |→ всё равно ведёт на сетку',
    page.url(),
  );
  ck(
    url().searchParams.get('colorway') === '7',
    '…той же записи — переписал, а не шагнул назад',
    page.url(),
  );
  ck((await len()) === opened, 'длина истории та же', `${opened} → ${await len()}`);
}

head('5', 'рельс уходит с плитки, открытой из сетки: Back с нового шага уводит с карточки');
{
  await fresh(CARD);
  await page.click('#open');
  await settle();
  await page.click('#rail-flat');
  await settle(150);
  ck(
    url().searchParams.get('step') === 'flat' && wf() === null,
    'рельс — шаг flat, `?wf=` снят',
    page.url(),
  );
  // `history.length` здесь не свидетель: снятая запись остаётся «впереди» до следующего push.
  // Свидетель — куда ведёт ОДИН Back.
  await page.goBack();
  await settle();
  ck(
    url().pathname === '/start',
    'Back — страница до карточки, а не осиротевшая сетка',
    page.url(),
  );

  // Нажатие на уже открытую ячейку playground не трогает историю и метку.
  await fresh(CARD);
  await page.click('#open');
  await settle();
  const opened = await len();
  await page.click('#rail-playground');
  await settle();
  ck(
    wf() === 'change_color' && (await len()) === opened,
    'ячейка playground на плитке — ничего не сдвинуто',
    page.url(),
  );
  await page.click('#back');
  await settle();
  ck(
    wf() === null && (await len()) === opened,
    '…и |→ по-прежнему шагает назад',
    `${page.url()} · ${await len()}`,
  );
}

head('6', 'рекол поверх плитки из сетки: |→ шагает назад, двух сеток в истории нет');
{
  await fresh(CARD);
  const before = await len();
  await page.click('#open');
  await settle();
  await page.click('#recall');
  await settle();
  ck(
    wf() === 'create_edit' && (await len()) === before + 1,
    'рекол — replace на той же записи',
    `${page.url()} · ${before} → ${await len()}`,
  );
  await page.click('#back');
  await settle();
  ck(wf() === null && (await shown()) === 'grid', '|→ — сетка', page.url());
  ck((await len()) === before + 1, '|→ шагнул назад, а не переписал', `${before} → ${await len()}`);
  await page.goBack();
  await settle();
  ck(
    url().pathname === '/start',
    'Back — страница до карточки (второй сетки под этой нет)',
    page.url(),
  );
}

head('7', 'старый `?step=aside` с чужим `?wf=`: адрес целиком старого шага, без новой записи');
{
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
  await page.goBack();
  await settle();
  ck(
    url().pathname === '/start',
    'переписано replace — один Back уводит туда, откуда пришли',
    page.url(),
  );
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
