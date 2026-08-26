#!/usr/bin/env node
// ФАСЕТ КОЛЛЕКЦИИ В ЛИСТЕ ТЕХ-КАРТ (вторая половина п.10 волны ux-0825).
//
// Владелец просил «фильтр по коллекции». Коллекция у тех-карты — не ссылка, а СТРОКА:
// `tech_card.collection_id` дропнула 0240 как мёртвую схему, живая колонка одна и свободная.
// Отсюда три вещи, каждую из которых проба обязана доказать отдельно, потому что каждая может
// сломаться молча:
//
//   А. пункты фасета собраны ИЗ СТРОК ВЫДАЧИ, а не из словаря коллекций. Ради этого всё и сделано
//      так: рукописные и архивные имена, которых в словаре нет, обязаны быть фильтруемыми — а имя
//      из словаря, которого нет ни на одной карте, предлагаться НЕ должно (оно нашло бы ноль).
//   Б. выбор пункта РЕАЛЬНО сужает лист — в ушедшем на сервер запросе появляется `collection=…`.
//      Без этой половины зелёный ответ означал бы «нарисовали чип», а не «фильтр работает».
//   В. строка уходит СЫРОЙ. Сервер TrimSpace снял намеренно, чтобы фильтр совпадал с пулом,
//      собранным из его же ответов: « SS25» и «SS25» — РАЗНЫЕ коллекции. Свой .trim() на клиенте
//      отправил бы на сервер то, чего он не найдёт, и фильтр молча возвращал бы пустой лист.
//   Г. НЕПОЛНОТА ПУЛА НАЗВАНА ВСЛУХ. Пул собирается из загруженных строк, а лист пагинируется —
//      значит список коллекций неполон, пока не докручены все страницы. Молчаливый неполный список
//      хуже отсутствующего: человек увидит пять коллекций и решит, что других нет. Сноска обязана
//      назвать «сколько из скольких», кнопка рядом — добрать остаток, и пул обязан вырасти.
//
// Запуск:  node scripts/tech-card-list-collection-probe.mjs [мутации]
//   --mutate-wire      `collection: filter.collection` → `undefined` в useTechCardQuery:
//                      обязаны покраснеть Б и В, но НЕ А (пункты рисуются и без проводки — ровно
//                      та разница, из-за которой фильтр без бэкенда называется плацебо).
//   --mutate-trim      значение пункта уходит через `.trim()`: обязана покраснеть В.
//   --mutate-pool      пул собирается из СЛОВАРЯ вместо строк выдачи: обязана покраснеть А.
//   --mutate-footer    сноска под пунктами не рисуется: обязана покраснеть Г целиком.
//   --mutate-complete  кнопка добора ничего не включает: обязана покраснеть половина Г про рост
//                      пула, а половина про текст сноски — остаться зелёной.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  wire: process.argv.includes('--mutate-wire'),
  trim: process.argv.includes('--mutate-trim'),
  pool: process.argv.includes('--mutate-pool'),
  footer: process.argv.includes('--mutate-footer'),
  complete: process.argv.includes('--mutate-complete'),
};

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
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
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

const pwEntry = resolvePlaywright();
if (!pwEntry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const pw = await import(pwEntry);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// Каждая мутация — ТОЧНАЯ строка исходника. Не нашлась — исключение, а не тихий пропуск: иначе
// «мутация не покраснела» означало бы «мутация не применилась», и проба сторожила бы мёртвый код.
const LIST = /tech-card-list\.tsx$/;
const QUERY = /useTechCardQuery\.ts$/;

const PAIRS = [];
if (MUT.wire)
  PAIRS.push([
    QUERY,
    'ts',
    ['        collection: filter.collection,', '        collection: undefined,'],
  ]);
if (MUT.trim)
  PAIRS.push([
    LIST,
    'tsx',
    [
      '() => collectionPool.map((c) => ({ value: c, label: collectionLabel(c) })),',
      '() => collectionPool.map((c) => ({ value: c.trim(), label: collectionLabel(c) })),',
    ],
  ]);
if (MUT.pool)
  PAIRS.push([
    LIST,
    'tsx',
    [
      '    const found = techCards.map((tc) => tc.collection).filter((c): c is string => !!c);',
      '    const found = (dictionary?.collections ?? []).map((c) => c.name).filter((c): c is string => !!c);',
    ],
  ]);
if (MUT.footer)
  PAIRS.push([
    LIST,
    'tsx',
    [
      "        {footer && <div className='mt-1.5 border-t border-hairline pt-1.5'>{footer}</div>}",
      '        {null}',
    ],
  ]);
if (MUT.complete)
  PAIRS.push([
    LIST,
    'tsx',
    [
      '                          poolAttempts.current = 0;\n                          setCompletingPool(true);',
      '                          poolAttempts.current = 0;',
    ],
  ]);

const plugins = PAIRS.map(([filter, loader, [fixed, broken]], i) => ({
  name: `mutation-${i}`,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(fixed)) throw new Error(`мутация ${i} не нашла свою строку в ${args.path}`);
      return { contents: src.replace(fixed, broken), loader };
    });
  },
}));

const outfile = resolve(tmpdir(), `tc-list-collection-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'tech-card-list-collection-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins,
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
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
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes('search name / style'))
  dieNotRun('в бандле нет разметки листа — собралось не то');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// В СЛОВАРЕ ЛЕЖИТ ИМЯ, КОТОРОГО НЕТ НИ НА ОДНОЙ КАРТЕ, и наоборот — карты несут имена, которых в
// словаре нет. Ровно эта расстановка отличает «пул из строк выдачи» от «пул из словаря».
const DICT = {
  dictionary: {
    categories: [],
    sizes: [],
    collections: [{ id: 9, name: 'DICT-ONLY', code: 'DO', archived: false }],
  },
};

const SPACED = ' SS25'; // краевой пробел — намеренно: в базе такие имена существуют
const CARDS = [];
for (let i = 0; i < 35; i++) {
  // Строки 0..29 — первая страница (LIMIT=30), строки 30..34 — вторая. «ARCHIVE 2011» живёт ТОЛЬКО
  // на второй: без добора её в пуле быть не должно, после добора — должна появиться.
  const collection = i < 10 ? 'AW24' : i < 20 ? SPACED : i < 30 ? '' : 'ARCHIVE 2011';
  CARDS.push({
    id: i + 1,
    styleNumber: `SN${i}`,
    name: `card ${i}`,
    stage: 'TECH_CARD_STAGE_PROTO',
    purpose: 'TECH_CARD_PURPOSE_SELLABLE',
    collection,
    updatedAt: '2026-08-20T10:00:00Z',
  });
}

const browser = await chromium.launch();
// Узкое и невысокое окно НАМЕРЕННО: при широком плитки первой страницы умещаются в четыре ряда,
// сторож бесконечной прокрутки оказывается в зоне видимости и вторая страница подгружается САМА —
// а тогда «пул неполон» проверять было бы не на чем.
const page = await browser.newPage({ viewport: { width: 520, height: 760 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// ЗАПРОСЫ ЛИСТА КОПЯТСЯ ЦЕЛИКОМ, СЫРЫМИ URL: подпись чипа доказывает только подпись, а сужение
// живёт в том, что ушло на сервер — и краевой пробел виден только в сыром `%20`.
// Заглушка отвечает СОГЛАСОВАННО с фильтром и постранично, иначе «лист сузился» доказывало бы
// работу заглушки, а не фильтра.
const listCalls = [];
await page.route('http://stub.invalid/**', (route) => {
  const url = route.request().url();
  if (url.includes('api/admin/dictionary'))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DICT),
    });
  if (url.includes('api/admin/tech-card/list')) {
    listCalls.push(url);
    const q = new URL(url).searchParams;
    const limit = Number(q.get('limit') ?? 30);
    const offset = Number(q.get('offset') ?? 0);
    const wanted = q.get('collection');
    const matching = wanted === null ? CARDS : CARDS.filter((c) => c.collection === wanted);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        techCards: matching.slice(offset, offset + limit),
        total: matching.length,
      }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
const FAKE_JWT = `h.${Buffer.from(JSON.stringify({ exp: FAR_FUTURE })).toString('base64')}.s`;

await page.goto('http://probe.local/');
await page.evaluate((t) => localStorage.setItem('authToken', t), FAKE_JWT);
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__collectionList.mount());
await page.waitForSelector('[aria-label="filter by purpose"]', { timeout: 15000 });
await page.waitForTimeout(600);

const TRIGGER = '[aria-label="filter by collection"]';
// Пункты фасета — только кнопки-пункты: у поповера есть ещё ✕ в шапке и кнопка добора в сноске,
// и сгрести их в один список значило бы проверять не тот орган.
const optionTexts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .filter((b) => b.className.includes('border-hairline'))
      .map((b) => (b.innerText || '').trim()),
  );
const footerText = () =>
  page.evaluate(() => {
    const box = [...document.querySelectorAll('[role="dialog"] div')].find(
      (d) => d.className.includes('border-hairline') && d.className.includes('pt-1.5'),
    );
    return box ? (box.innerText || '').trim() : '';
  });
const loadedCount = () =>
  page.evaluate(() => {
    const n = [...document.querySelectorAll('p')].find((p) =>
      /^\d+ of \d+$/.test(p.innerText || ''),
    );
    return n ? n.innerText.trim() : '';
  });
const clickOption = async (needle) => {
  const hit = await page.evaluate((n) => {
    const b = [...document.querySelectorAll('[role="dialog"] button')]
      .filter((x) => x.className.includes('border-hairline'))
      .find((x) => (x.innerText || '').includes(n));
    if (!b) return false;
    b.click();
    return true;
  }, needle);
  await page.waitForTimeout(700);
  return hit;
};
const openPicker = async () => {
  if (!(await page.$(TRIGGER))) return false;
  await page.click(TRIGGER);
  await page.waitForTimeout(250);
  return true;
};
const closePicker = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};

head('ЦИТАТА А — пункты фасета собраны ИЗ СТРОК ВЫДАЧИ, а не из словаря коллекций');
{
  ck(!!(await page.$(TRIGGER)), 'чип «+ collection» вообще есть на панели');
  const opened = await openPicker();
  const opts = opened ? await optionTexts() : [];
  ck(
    opts.some((t) => t === 'AW24'),
    'имя со строк выдачи предложено (AW24)',
    opts.join(' | '),
  );
  ck(
    opts.some((t) => t.includes('SS25')),
    'рукописное имя с краевым пробелом тоже предложено',
    opts.join(' | '),
  );
  ck(
    !opts.some((t) => t.toUpperCase().includes('DICT-ONLY')),
    'имя из СЛОВАРЯ, которого нет ни на одной карте, НЕ предложено',
    opts.join(' | '),
  );
  ck(
    opts.some((t) => t.includes('«')),
    'имя с краевым пробелом помечено кавычками (HTML схлопнул бы пробел, и « SS25» стало бы неотличимо от «SS25»)',
    opts.join(' | '),
  );
}

head('ЦИТАТА Г — неполнота пула НАЗВАНА, и её можно добрать');
{
  ck(
    (await loadedCount()) === '30 of 35',
    'первая страница: загружено 30 из 35',
    await loadedCount(),
  );
  const before = await optionTexts();
  ck(
    !before.some((t) => t.includes('ARCHIVE')),
    'коллекции, живущей только на второй странице, в пуле ЕЩЁ нет — неполнота реальна',
    before.join(' | '),
  );
  const f1 = await footerText();
  ck(
    f1.includes('30 of 35'),
    'сноска называет «сколько из скольких» строк дали этот список',
    `«${f1}»`,
  );
  ck(/remaining\s*5/i.test(f1), 'сноска предлагает добрать ровно недостающие 5', `«${f1}»`);

  // ck ставится ВСЕГДА, а не только в ветке «не нашлось»: разное число исходов между прогонами
  // само по себе читается как «часть пробы не выполнилась», и таблицу мутаций сравнивать нечем.
  const btn = await page.$('[role="dialog"] button.mt-1');
  ck(!!btn, 'кнопка добора есть в сноске');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(900);
  }
  const after = await optionTexts();
  ck(
    after.some((t) => t.includes('ARCHIVE')),
    'после добора коллекция со второй страницы появилась в пуле',
    after.join(' | '),
  );
  const f2 = await footerText();
  ck(
    /all 35/i.test(f2),
    'сноска перестала врать про неполноту, когда неполноты не осталось',
    `«${f2}»`,
  );
  await closePicker();
}

head('ЦИТАТА Б — выбор пункта РЕАЛЬНО сужает лист (запрос, а не подпись)');
{
  await openPicker();
  ck(await clickOption('AW24'), 'пункт AW24 нашёлся и нажался');
  const last = listCalls[listCalls.length - 1] ?? '';
  ck(
    last.includes('collection=AW24'),
    'на сервер ушёл collection=AW24',
    last.split('?')[1] ?? last,
  );
  ck(
    (await loadedCount()) === '10 of 10',
    'лист сузился до 10 карт этой коллекции',
    await loadedCount(),
  );
  // Активный фильтр — снимаемый Chip: имя коллекции плюс собственный ✕. Ищется ОТ КРЕСТИКА
  // (`aria-label=remove`) вверх, а не по тексту: текст чипа зависит от имени, а органом является
  // именно наличие снимаемого крестика рядом с этим именем.
  const chip = await page.evaluate(() => {
    const x = document.querySelector('[aria-label="remove"]');
    return x?.parentElement ? (x.parentElement.innerText || '').trim() : '';
  });
  ck(
    chip.replace(/\s*✕\s*$/, '').trim() === 'AW24',
    'активный фильтр стал снимаемым чипом с именем коллекции',
    `«${chip}»`,
  );
}

head('ЦИТАТА В — имя уходит СЫРЫМ: краевой пробел не срезается ни клиентом, ни по дороге');
{
  const x = await page.$('[aria-label="remove"]');
  if (x) await x.click();
  await page.waitForTimeout(600);
  await openPicker();
  ck(await clickOption('SS25'), 'пункт « SS25» нашёлся и нажался');
  const last = listCalls[listCalls.length - 1] ?? '';
  ck(
    last.includes('collection=%20SS25'),
    'на проводе ровно `%20SS25` — пробел на месте, .trim() по дороге не случился',
    last.split('?')[1] ?? last,
  );
  ck(
    !/collection=SS25(&|$)/.test(last),
    'обрезанного «SS25» на проводе нет (сервер такую коллекцию не нашёл бы)',
    last.split('?')[1] ?? last,
  );
  ck(
    (await loadedCount()) === '10 of 10',
    'сервер нашёл ровно карты коллекции « SS25»',
    await loadedCount(),
  );
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
const on = Object.entries(MUT)
  .filter(([, v]) => v)
  .map(([k]) => k);
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${on.length ? ` (мутации: ${on.join(', ')})` : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
