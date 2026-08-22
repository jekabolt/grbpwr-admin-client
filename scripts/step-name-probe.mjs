#!/usr/bin/env node
// ДВОЕКОДЬЕ ИМЕНИ ШАГА: РАБОТА НАЗЫВАЕТ ЕГО ВЕЗДЕ, ИЛИ ЖЕ ЕГО НАЗЫВАЕТ СЕГОДНЯШНЯЯ ДЕРИВАЦИЯ (R8).
//
// ДЕФЕКТ, РАДИ КОТОРОГО ПРОБА. R6 научил пикер писать РАБОТУ в строку шага — и на этом остановился:
// имя шага собиралось по-прежнему из глагола с машинкой и класса шва. Поэтому шаг с классом шва
// отстрочки, которому назначили московский шов, назывался «Hem — rolled (Moscow)» в триггере
// пикера и «topstitch · front» в заголовке над ним, в рельсе слева, в карте примерки, на схеме
// сборки и — что хуже всего — НА ПЕЧАТНОМ ЛИСТЕ, то есть на той единственной копии карточки,
// которая стоит у машины. Швея и технолог называли одну строку разными словами.
//
// ПОЧЕМУ ПРОБА ЖИВАЯ, А НЕ ТАБЛИЧНАЯ. Проверяется не то, что композитор возвращает правильную
// строку, — он и до R8 возвращал правильную из того, что ему дали, — а то, что ЭКРАН зовёт его С
// РАБОТОЙ. Проба, зовущая композитор напрямую, зеленела бы при ровно том дефекте, ради которого
// заведена. У печатного листа причина ещё жёстче: он держал свою развилку по типу шага, и ветка
// ВТО шла мимо композитора вовсе — увидеть это можно только напечатав лист.
//
// ЦИТАТЫ:
//   А — работа названа: шаг зовётся ПОДПИСЬЮ КАТАЛОГА в рельсе и в шапке открытого шага, и тем же
//       словом стоит в триггере пикера (три органа, одно имя);
//   Б — то же имя НА ПЕЧАТНОМ ЛИСТЕ, включая шаг ВТО, чья ветка листа композитора не звала;
//   В — то же имя в КАРТЕ ПРИМЕРКИ на вкладке семплов;
//   Г — шаг БЕЗ работы зовётся по-старому: буквой в букву тем же, что даёт сегодняшняя деривация;
//   Д — незнакомый токен виден ТЕКСТОМ на всех трёх экранах и НЕ подменён догадкой;
//   Е — остаток R6 закрыт: работа бьёт класс шва, а не наоборот;
//   Ж — экраны не расходятся: рельс, карта и лист называют каждый шаг одним и тем же словом;
//   З — каталог НЕ приехал: работа, знакомая снимку бандла, зовётся ТЕМ ЖЕ именем, что с сервера;
//       шаг без работы не шелохнулся; работа, снимку неизвестная, видна токеном. Пустых имён нет;
//   И — R8 НИЧЕГО НЕ ПИШЕТ: после монтирования всех экранов значения `work` в форме те же, что
//       положили. Половина фазы «перестать терять» стоит именно на этом.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у press-action-probe): правка
// исходника ради проверки — это правка, которую однажды забудут откатить.
//   node scripts/step-name-probe.mjs                   прогон
//   node scripts/step-name-probe.mjs --mutate-nowork   ветка работы убрана из композитора
//   node scripts/step-name-probe.mjs --mutate-guess    незнакомый токен подменяется догадкой
//   node scripts/step-name-probe.mjs --mutate-second   у печатного листа СВОЯ копия подписи
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui) — все откатаны:
//   --mutate-nowork → 14 провалов: работа перестала называть шаг ВЕЗДЕ — рельс, шапка, карта,
//                     лист; ВТО на листе откатилось к «press», остаток R6 вернулся («topstitch»
//                     вместо московского шва), знакомая бандлу работа потеряла имя каталога.
//                     Цитата Г при этом ЗЕЛЁНАЯ — и это доказательство, что она не срослась с
//                     остальными: шаг без работы обязан называться по-старому и в мутации тоже;
//   --mutate-guess  → 6 провалов, все — цитата Д и её половина в З: незнакомый токен подменился
//                     выведенным «join» на трёх экранах, а триггер пикера соврал «Join —
//                     lockstitch» о работе, которой в каталоге нет. Остальные цитаты зелёные:
//                     мутация точечная, и проба ловит ровно её;
//   --mutate-second → 10 провалов (адверсарная): у листа завелась СВОЯ лестница имени с другим
//                     текстом («HEM — ROLLED (MOSCOW)»), и незнакомый токен на бумаге пропал
//                     вовсе. Рельс, карта и шапка при этом ЗЕЛЁНЫЕ — расхождение экранов ловит
//                     только сверка Ж и цитаты листа, то есть ровно те, ради которых они и
//                     стоят. Без них две копии подписи разошлись бы молча и только в цеху.
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден:
// гейт, который нельзя выполнить, не красит сборку в красный.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_NOWORK = process.argv.includes('--mutate-nowork');
const MUTATE_GUESS = process.argv.includes('--mutate-guess');
const MUTATE_SECOND = process.argv.includes('--mutate-second');

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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `step-name-${process.pid}.js`);

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
//
// Первая — плановая: ветка работы уходит из композитора, и заголовок снова выводится из соседних
// полей. Это ровно то состояние, в котором фаза находилась ДО R8.
const NOWORK_FIX = `  const verb =
    workWord ||
    kindVerb ||`;
const NOWORK_BROKEN = `  void workWord;
  const verb =
    kindVerb ||`;
// Вторая — плановая: незнакомый токен подменяется догадкой вместо того, чтобы доехать до глаз.
// Именно этого запрещать пришлось отдельно: «показать выведенное имя» выглядит доброжелательнее
// пустоты и потому соблазнительно, а на деле называет шаг словом, которого технолог не выбирал.
const GUESS_FIX = `  return { kind: 'token', token, text: token, live: catalog?.source === 'server' };`;
const GUESS_BROKEN = `  return { kind: 'derived' };`;
// Третья — адверсарная: у печатного листа заводится СВОЯ копия лестницы имени, с другим текстом.
// Это самый дорогой из возможных дефектов (расхождение видно только на бумаге и только в цеху) и
// одновременно самый вероятный: своя развилка по типу шага у листа уже была.
const SECOND_FIX = `    return operationHeading({
      operationType: v,
      machineType: o.machineType,
      seamClass: o.seamClass,
      work: o.work,
      workCatalog,
      pieceNames: [],
    });`;
const SECOND_BROKEN = `    return (workCatalog?.byToken.get((o.work ?? '').trim())?.label ?? '').toUpperCase();`;

const patcher = (filter, pairs, loader) => ({
  name: 'step-name-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const plugins = [];
if (MUTATE_NOWORK)
  plugins.push(patcher(/operation-options\.ts$/, [[NOWORK_FIX, NOWORK_BROKEN]], 'ts'));
if (MUTATE_GUESS) plugins.push(patcher(/operation-work\.ts$/, [[GUESS_FIX, GUESS_BROKEN]], 'ts'));
if (MUTATE_SECOND)
  plugins.push(patcher(/tech-pack-document\.tsx$/, [[SECOND_FIX, SECOND_BROKEN]], 'tsx'));

await esbuild({
  entryPoints: [resolve(HERE, 'step-name-entry.tsx')],
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

// ── ФИКСТУРА ОТВЕТА СЕРВЕРА ──────────────────────────────────────────────────────────────────────
//
// СНИМОК ОТВЕТА, А НЕ ВТОРОЙ КАТАЛОГ. Токены и подписи взяты из сида 0329/0331 — те самые, что
// приедут с беты, — но список НАРОЧНО короткий: проба про ИМЯ, а не про полноту словаря (её
// стерегут guard-тесты бэкенда).
//
// `topstitch` В ФИКСТУРЕ НУЖЕН ОСОБО: это единственная работа, чью подпись знает И сервер, И
// снимок бандла, — на ней и стоит цитата «каталог не приехал, а имя то же».
const CATALOG = {
  works: [
    {
      token: 'topstitch',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Topstitch',
      machineMode: 'ask',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch', 'lockstitch_double_needle'],
      syn: ['отстрочка', 'topstitch'],
      sort: 20,
      retired: false,
    },
    {
      token: 'moscow_hem',
      verb: 'machine',
      stage: 'edges_hems',
      label: 'Hem — rolled (Moscow)',
      machineMode: 'fixed',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch'],
      syn: ['московский', 'moscow', 'rolled hem'],
      sort: 75,
      retired: false,
    },
    {
      token: 'press_flat',
      verb: 'press',
      stage: 'pressing',
      label: 'Press flat',
      machineMode: 'none',
      defaultMachine: '',
      machines: [],
      syn: ['приутюжить', 'press flat'],
      sort: 340,
      retired: false,
    },
  ],
  defaults: [],
  smvHints: [],
  defaultFields: ['topstitch_mode', 'topstitch_width_mm'],
};

const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  TOPSTITCH_SEAM: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
};

// ── КАРТОЧКА ПРОБЫ ───────────────────────────────────────────────────────────────────────────────
//
// Шесть шагов, и каждый отвечает за одну цитату. Зона у всех одна (`front`), чтобы хвост заголовка
// был одинаковым и цитаты различались ровно тем, ЧЕМ шаг назван, а не где он.
const STEPS = [
  // 0 — работа названа, каталог её знает, пункта в бандле у неё НЕТ (0331).
  { work: 'moscow_hem', operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE },
  // 1 — работы нет: сегодняшняя деривация, «join» от машинки.
  { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE },
  // 2 — токен, которого не знает НИ каталог, НИ бандл.
  { work: 'txt_unknown', operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE },
  // 3 — ОСТАТОК R6: класс шва говорит «отстрочка», работа говорит «московский шов».
  {
    work: 'moscow_hem',
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    seamClass: T.TOPSTITCH_SEAM,
    zone: T.ZONE,
  },
  // 4 — ВТО: ветка печатного листа, которая композитора не звала вовсе.
  { work: 'press_flat', operationType: T.PRESS, pressEquipment: T.IRON, zone: T.ZONE },
  // 5 — работа, знакомая И серверу, И снимку бандла: на ней стоит цитата «каталог не приехал».
  {
    work: 'topstitch',
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    seamClass: T.TOPSTITCH_SEAM,
    zone: T.ZONE,
  },
];

const MOSCOW = 'Hem — rolled (Moscow)';

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
// ВЫСОКОЕ ОКНО — НЕ КОСМЕТИКА: на одной странице живут рельс, открытый шаг, карта примерки и
// печатный лист, и в обычном окне нижние органы оказались бы за кадром.
const page = await browser.newPage({ viewport: { width: 1500, height: 5200 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

let catalogMode = 'ok';
let catalogCalls = 0;
await page.route('http://stub.invalid/**', async (route) => {
  const url = route.request().url();
  if (url.includes('operation-work/catalog')) {
    catalogCalls += 1;
    if (catalogMode === 'fail') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATALOG),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

async function mount() {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((s) => window.__stepName.mount(s), STEPS);
  await page.waitForSelector('[data-rail-step="5"]', { timeout: 20000 });
  // Каталог — сетевой запрос, и он приезжает ПОСЛЕ первого кадра. Ждём по признаку, а не по
  // таймеру: иначе «имя не то» смешалось бы с «каталог ещё не приехал».
  await page.waitForTimeout(500);
}

/** Заголовок строки рельса — ИЗ `title`, а не из textContent: в узле рядом лежат номер и норма. */
const railTitle = (i) => page.getAttribute(`[data-rail-step="${i}"]`, 'title');
/** Имя шага в карте примерки — узел, в котором лежит ТОЛЬКО имя. */
const mapName = async (i) =>
  ((await page.locator(`#map [data-map-step="${i}"]`).textContent()) ?? '').trim();
/** Шапка ОТКРЫТОГО шага. */
const editorHeading = async (i) =>
  ((await page.locator(`[data-editor-heading="${i}"]`).textContent()) ?? '').trim();
const pickerTrigger = async (i) =>
  (
    (await page
      .locator(`[data-kind-picker="${i}"] button[data-combobox-trigger]`)
      .textContent()) ?? ''
  ).trim();

async function openStep(i) {
  await page.locator(`[data-rail-step="${i}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-rail-step="${i}"]`).click();
  await page.waitForSelector(`[data-editor-heading="${i}"]`, { timeout: 10000 });
  await page.waitForTimeout(150);
}

async function sheetNames() {
  await page.evaluate(() => window.__stepName.sheet());
  await page
    .waitForFunction(() => !!document.querySelector('#sheet [data-sheet-step="5"]'), {
      timeout: 20000,
    })
    .catch(() => {});
  return page.evaluate(() =>
    [...document.querySelectorAll('#sheet [data-sheet-step]')].map((n) =>
      (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  );
}

// ── ПРОГОН С ЖИВЫМ КАТАЛОГОМ ────────────────────────────────────────────────────────────────────
await mount();
ck(pageErrors.length === 0, 'все четыре экрана смонтировались без исключений', pageErrors[0] ?? '');
ck(catalogCalls > 0, 'каталог и правда запрашивался по сети', `запросов: ${catalogCalls}`);

const rail = [];
for (let i = 0; i < STEPS.length; i++) rail.push(await railTitle(i));
const map = [];
for (let i = 0; i < STEPS.length; i++) map.push(await mapName(i));
const sheet = await sheetNames();

head('А. работа названа — шаг зовётся ПОДПИСЬЮ КАТАЛОГА в заголовке');
ck(rail[0] === `${MOSCOW} · front`, 'строка рельса зовётся подписью каталога', String(rail[0]));
await openStep(0);
ck(
  (await editorHeading(0)) === `${MOSCOW} · front`,
  'шапка открытого шага — то же слово',
  await editorHeading(0),
);
ck(
  (await pickerTrigger(0)) === MOSCOW,
  'триггер пикера — то же слово, без приписки',
  await pickerTrigger(0),
);

head('Б. то же имя НА ПЕЧАТНОМ ЛИСТЕ');
ck(sheet.length === STEPS.length, 'таблица операций напечаталась целиком', `строк: ${sheet.length}`);
ck(sheet[0] === MOSCOW, 'лист называет шаг подписью каталога', String(sheet[0]));
ck(
  sheet[4] === 'Press flat',
  'ВТО НА ЛИСТЕ тоже зовётся работой, а не под-глаголом своей ветки',
  String(sheet[4]),
);

head('В. то же имя в КАРТЕ ПРИМЕРКИ');
ck(map[0] === `${MOSCOW} · front`, 'карта примерки зовёт шаг подписью каталога', String(map[0]));

head('Г. шаг БЕЗ работы зовётся по-старому');
const derived1 = await page.evaluate((op) => window.__stepName.derived(op), STEPS[1]);
ck(rail[1] === 'join · front', 'сегодняшний заголовок на месте', String(rail[1]));
ck(rail[1] === derived1, 'он буква в букву равен сегодняшней деривации', `${rail[1]} / ${derived1}`);
ck(map[1] === 'join · front', 'карта примерки не шелохнулась', String(map[1]));
ck(sheet[1] === 'join', 'лист не шелохнулся', String(sheet[1]));

head('Д. незнакомый токен виден ТЕКСТОМ и не подменён догадкой');
ck(rail[2] === 'txt_unknown · front', 'рельс показывает токен', String(rail[2]));
ck(map[2] === 'txt_unknown · front', 'карта примерки показывает токен', String(map[2]));
ck(sheet[2] === 'txt_unknown', 'лист показывает токен', String(sheet[2]));
ck(rail[2] !== 'join · front', 'токен НЕ подменён выведенным именем', String(rail[2]));
await openStep(2);
ck(
  (await pickerTrigger(2)).startsWith('txt_unknown'),
  'триггер пикера тоже показывает токен, назвав причину',
  await pickerTrigger(2),
);

head('Е. остаток R6 закрыт: работа бьёт класс шва');
const derived3 = await page.evaluate((op) => window.__stepName.derived(op), STEPS[3]);
ck(derived3 === 'topstitch · front', 'без работы этот шаг звался бы отстрочкой', derived3);
ck(rail[3] === `${MOSCOW} · front`, 'а зовётся он назначенной работой', String(rail[3]));
ck(sheet[3] === MOSCOW, 'и на бумаге — ею же', String(sheet[3]));

head('Ж. экраны не расходятся');
for (let i = 0; i < STEPS.length; i++) {
  ck(rail[i] === map[i], `шаг ${i}: рельс и карта примерки называют его одинаково`, `${rail[i]} / ${map[i]}`);
  // Лист печатает ОДНО СЛОВО шага без зоны и деталей — то есть первую долю заголовка.
  ck(
    rail[i].split(' · ')[0] === sheet[i],
    `шаг ${i}: лист называет его тем же словом, что экран`,
    `${rail[i]} / ${sheet[i]}`,
  );
}

// ── ПРОГОН БЕЗ КАТАЛОГА ─────────────────────────────────────────────────────────────────────────
head('З. каталог НЕ приехал — имена как сегодня, и ни одно не пусто');
catalogMode = 'fail';
pageErrors.length = 0;
await mount();
ck(pageErrors.length === 0, 'экраны пережили отказ каталога', pageErrors[0] ?? '');
const railOff = [];
for (let i = 0; i < STEPS.length; i++) railOff.push(await railTitle(i));
const sheetOff = await sheetNames();
ck(
  railOff[5] === 'Topstitch · front' && rail[5] === 'Topstitch · front',
  'работа, знакомая снимку бандла, зовётся ТЕМ ЖЕ именем, что с сервера',
  `${rail[5]} / ${railOff[5]}`,
);
ck(railOff[1] === 'join · front', 'шаг без работы не шелохнулся', String(railOff[1]));
ck(
  railOff[0] === 'moscow_hem · front',
  'работа, снимку неизвестная, видна ТОКЕНОМ, а не догадкой и не пустотой',
  String(railOff[0]),
);
ck(
  railOff.every((r) => !!r && r !== 'new step'),
  'ни одно имя не выродилось в пустоту',
  railOff.join(' | '),
);
ck(sheetOff[5] === 'Topstitch', 'лист без каталога называет знакомую работу так же', String(sheetOff[5]));

// ── R8 НИЧЕГО НЕ ПИШЕТ ──────────────────────────────────────────────────────────────────────────
head('И. R8 — только представление: ни одна строка формы не тронута');
catalogMode = 'ok';
await mount();
await openStep(3);
await sheetNames();
const after = [];
for (let i = 0; i < STEPS.length; i++) {
  const v = await page.evaluate((i) => window.__stepName.values(i), i);
  after.push(String(v.work ?? ''));
}
const expected = STEPS.map((s) => String(s.work ?? ''));
ck(
  after.join('|') === expected.join('|'),
  'значения `work` в форме те же, что положили',
  `${after.join('|')} vs ${expected.join('|')}`,
);

await browser.close();
console.log(`\n${bad === 0 ? 'ЗЕЛЁНАЯ' : `КРАСНАЯ: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
