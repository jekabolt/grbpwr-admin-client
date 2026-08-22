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
//       шаг без работы не шелохнулся; работа, снимку неизвестная, видна токеном; работа 0331,
//       выписанная в снимок дельтой, названа его ярлыком. Пустых имён нет;
//   И — R8 НИЧЕГО НЕ ПИШЕТ: после монтирования всех экранов значения `work` в форме те же, что
//       положили. Половина фазы «перестать терять» стоит именно на этом;
//   К — ФРАЗА ДЛИНЫ на печатном листе называет ТО, ЧТО РЕЖУТ: прорезь — разрезом, шаг без работы —
//       по-прежнему петлёй, незнакомый токен — токеном. Заголовок и факты — ДВА РАЗНЫХ ПУТИ в одну
//       бумагу, и R8 починила только первый: строка звалась «Slit — overcast», а клетка «machine /
//       mode» в той же строке печатала «buttonhole, cut 18 mm»;
//   Л — печать РЕЛИЗНОГО СНАПШОТА (источник БЕЗ поля `work`) даёт сегодняшнюю деривацию, и клетка
//       отличается от живой ровно одним словом. Признака «это релиз» продуктовый код не читает и
//       читать не должен: отсутствие поля в подписанном блобе И ЕСТЬ утверждение «работа здесь
//       названа не была».
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у press-action-probe): правка
// исходника ради проверки — это правка, которую однажды забудут откатить.
//   node scripts/step-name-probe.mjs                   прогон
//   node scripts/step-name-probe.mjs --mutate-nowork   ветка работы убрана из композитора
//   node scripts/step-name-probe.mjs --mutate-guess    незнакомый токен подменяется догадкой
//   node scripts/step-name-probe.mjs --mutate-second   у печатного листа СВОЯ копия подписи
//   node scripts/step-name-probe.mjs --mutate-nofacts     работа не доезжает до составителя фактов
//   node scripts/step-name-probe.mjs --mutate-releaselive релизный путь ДОСОЧИНЯЕТ работу
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui) — все откатаны. Счёт трёх
// первых вырос против прежнего (14/6/10) не потому, что они стали ловить иное, а потому, что вместе
// с цитатами К и Л в карточку пробы добавились три шага: мутации бьют и по ним тоже.
//   --mutate-nowork → 15 провалов: работа перестала называть шаг ВЕЗДЕ — рельс, шапка, карта,
//                     лист; ВТО на листе откатилось к «press», остаток R6 вернулся («topstitch»
//                     вместо московского шва), знакомая бандлу работа потеряла имя каталога.
//                     Цитата Г при этом ЗЕЛЁНАЯ — и это доказательство, что она не срослась с
//                     остальными: шаг без работы обязан называться по-старому и в мутации тоже;
//   --mutate-guess  → 8 провалов — цитата Д, её половина в З и ДВЕ в К: незнакомый токен подменился
//                     выведенным «join» на трёх экранах, триггер пикера соврал «Join — lockstitch»
//                     о работе, которой в каталоге нет, а фраза длины назвала такой шаг петлёй.
//                     Последнее — не побочный эффект, а доказательство, что К едет по ТОЙ ЖЕ
//                     лестнице `workNaming`, что и заголовок, а не по своей копии правила;
//   --mutate-second → 12 провалов (адверсарная): у листа завелась СВОЯ лестница имени с другим
//                     текстом («HEM — ROLLED (MOSCOW)»), и незнакомый токен на бумаге пропал
//                     вовсе. Рельс, карта и шапка при этом ЗЕЛЁНЫЕ — расхождение экранов ловит
//                     только сверка Ж и цитаты листа, то есть ровно те, ради которых они и
//                     стоят. Без них две копии подписи разошлись бы молча и только в цеху;
//   --mutate-nofacts    → 4 провала, все в К: работа перестала доезжать до составителя фактов, и
//                     клетка «machine / mode» вернулась к дефекту, ради которого заведена эта
//                     цитата, — разрез под пояс снова печатается петлёй, незнакомый токен тоже.
//                     Цитаты Г и Л при этом ЗЕЛЁНЫЕ, и обе зелены ПО ДЕЛУ: шаг без работы обязан
//                     называться по-старому и в мутации тоже, а релизный снапшот работы не несёт
//                     вовсе, так что отнимать у него нечего. Заголовок (А–Ж) не шелохнулся —
//                     доказательство, что имя и факты и правда два разных пути;
//   --mutate-releaselive → 4 провала (адверсарная): путь печати ДОСОЧИНЯЕТ работу строке, которая
//                     её не несёт, выведя токен из соседних полей. Три провала — цитата Л:
//                     подписанная бумага назвалась именем, которого в подписанном документе нет.
//                     Четвёртый — цитата К на живом шаге без работы, и он тут ЗАКОНОМЕРЕН: обе
//                     клетки описывают одно и то же правило «работы нет — говори по-старому», и
//                     досочинение бьёт по нему с обеих сторон разом. Цитата про незнакомый токен
//                     остаётся зелёной — у неё работа названа, досочинять нечего.
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
const MUTATE_NOFACTS = process.argv.includes('--mutate-nofacts');
const MUTATE_RELEASELIVE = process.argv.includes('--mutate-releaselive');

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
// Четвёртая — плановая: РАБОТА ПЕРЕСТАЁТ ДОЕЗЖАТЬ ДО СОСТАВИТЕЛЯ ФАКТОВ. Это ровно то состояние, в
// котором печать находилась ДО этой правки: заголовок уже спрашивал работу, а фраза длины — нет, и
// разрез под пояс уезжал в цех петлёй. Поле остаётся в типе, но путь в печать обрывается — то есть
// воспроизводится ИМЕННО тихий отказ, а не отсутствие члена.
const NOFACTS_FIX = `  work: o.work,
  operationType: o.operationType,`;
const NOFACTS_BROKEN = `  work: undefined,
  operationType: o.operationType,`;
// Пятая — адверсарная: РЕЛИЗНЫЙ ПУТЬ НАЧИНАЕТ ЧИТАТЬ РАБОТУ «КАК ЖИВОЙ». Соблазн выглядит
// доброжелательно — «мы же теперь знаем, что шаг с длиной на этой машинке и есть прорезь, давайте
// допишем работу тем строкам, где её нет», — и ровно это превращает подписанную бумагу в бумагу,
// называющую шаг именем, которого в подписанном документе никогда не было. Досочинение выведено
// из тех же соседних полей, что и всегда, и потому неотличимо от «улучшения».
const RELEASELIVE_FIX = `  work: o.work,
  operationType: o.operationType,`;
const RELEASELIVE_BROKEN = `  work: o.work || (o.fastening?.cutLengthMm ? 'slit_overcast' : undefined),
  operationType: o.operationType,`;

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
if (MUTATE_NOFACTS)
  plugins.push(patcher(/tech-pack-document\.tsx$/, [[NOFACTS_FIX, NOFACTS_BROKEN]], 'tsx'));
if (MUTATE_RELEASELIVE)
  plugins.push(patcher(/tech-pack-document\.tsx$/, [[RELEASELIVE_FIX, RELEASELIVE_BROKEN]], 'tsx'));

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
    // ПРОРЕЗЬ, ОБМЁТАННАЯ ЗИГЗАГОМ (0331) — работа, ради которой цитаты К вообще существуют.
    // `machines` держит ОБЕ машинки не для красоты: прорезь законна и на петельном автомате, а
    // значит машинка на вопрос «что режут» ответить не может — только работа.
    {
      token: 'slit_overcast',
      verb: 'machine',
      stage: 'fam_C',
      label: 'Slit — overcast',
      machineMode: 'ask',
      defaultMachine: 'zigzag',
      machines: ['zigzag', 'buttonhole'],
      syn: ['прорезь', 'разрез', 'slit'],
      sort: 150,
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
  // ДВА ВХОДА К ОДНОМУ ПОЛЮ — двумя машинками: петельный автомат (вход «машинка») и зигзаг
  // (вход «работа»). На них и стоят цитаты К.
  BUTTONHOLE: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
  ZIGZAG: 'TECH_CARD_MACHINE_TYPE_ZIGZAG',
};

// ── КАРТОЧКА ПРОБЫ ───────────────────────────────────────────────────────────────────────────────
//
// Шесть шагов, и каждый отвечает за одну цитату. Зона у всех одна (`front`), чтобы хвост заголовка
// был одинаковым и цитаты различались ровно тем, ЧЕМ шаг назван, а не где он.
const STEPS = [
  // 0 — работа названа, каталог её знает; ПУНКТА в бандле у неё нет вовсе, а СНИМОК её знает —
  //     она выписана дельтой 0331 (`CATALOG_ONLY_WORKS`). На ней стоят обе цитаты: имя с сервера и
  //     имя без сервера.
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
  // --- ТРИ ШАГА ФРАЗЫ ДЛИНЫ (К) --------------------------------------------------------------
  //
  // У всех троих длина ОДНА И ТА ЖЕ (18), и различаются они ровно осью работы: так «слово поменялось»
  // нельзя спутать с «поменялось число».
  //
  // 6 — ПРОРЕЗЬ ПОД ПОЯС НА ЗИГЗАГЕ. Тот самый шаг из жалобы владельца: работа названа, каталог её
  //     знает, машинка — не петельный автомат.
  {
    work: 'slit_overcast',
    operationType: T.MACHINE,
    machineType: T.ZIGZAG,
    zone: T.ZONE,
    cutLengthMm: '18',
  },
  // 7 — ПЕТЛЯ БЕЗ РАБОТЫ НА ПЕТЕЛЬНОМ АВТОМАТЕ. Сегодняшняя деривация в чистом виде: строка,
  //     прожившая годы до оси работ. Её слово не имеет права сдвинуться ни на символ.
  {
    operationType: T.MACHINE,
    machineType: T.BUTTONHOLE,
    zone: T.ZONE,
    cutLengthMm: '18',
  },
  // 8 — ТОКЕН, КОТОРОГО НЕ ЗНАЕТ НИ КАТАЛОГ, НИ СНИМОК, НА ПЕТЕЛЬНОМ АВТОМАТЕ. Машинка «говорит»
  //     петля, работа не говорит ничего — и именно здесь соблазн выдать догадку сильнее всего:
  //     токен новее бандла может оказаться ТРЕТЬИМ входом к полю, заведённым миграцией, которой
  //     этот бандл не видел.
  {
    work: 'txt_unknown',
    operationType: T.MACHINE,
    machineType: T.BUTTONHOLE,
    zone: T.ZONE,
    cutLengthMm: '18',
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
  await page.waitForSelector('[data-rail-step="8"]', { timeout: 20000 });
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
    .waitForFunction(() => !!document.querySelector('#sheet [data-sheet-step="8"]'), {
      timeout: 20000,
    })
    .catch(() => {});
  return page.evaluate(() =>
    [...document.querySelectorAll('#sheet [data-sheet-step]')].map((n) =>
      (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  );
}

/**
 * Клетка «machine / mode» каждой строки листа — там печатается фраза длины прорези.
 *
 * ЧИТАЕТСЯ КЛЕТКА ЦЕЛИКОМ, А НЕ ПОДСТРОКА В НЕЙ, и это принципиально: цитата «не сдвинулось ни на
 * символ» сравнивает ВЕСЬ текст клетки, поэтому фраза не может тихо переехать в соседнюю колонку
 * или обрасти вторым словом, оставив пробу зелёной.
 */
const modeCells = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#sheet [data-sheet-mode]')].map((n) =>
      (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  );

/** Напечатать лист ИЗ РЕЛИЗНОГО СНАПШОТА (источник без поля `work`) и прочитать те же клетки. */
async function releaseModeCells() {
  await page.evaluate(() => window.__stepName.release());
  await page
    .waitForFunction(() => !!document.querySelector('#sheet [data-sheet-mode="8"]'), {
      timeout: 20000,
    })
    .catch(() => {});
  return modeCells();
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

// ── ФРАЗА ДЛИНЫ НА БУМАГЕ ───────────────────────────────────────────────────────────────────────
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ЦИТАТА, ЕСЛИ ЗАГОЛОВОК УЖЕ ПРОВЕРЕН. Заголовок и ФАКТЫ — два разных пути в одну
// бумагу, и R8 починила только первый: строка шага звалась «Slit — overcast», а клетка «machine /
// mode» рядом с ней в той же строке продолжала печатать «buttonhole, cut 18 mm». Слово про петлю
// уезжало в цех НА ТОЙ ЖЕ БУМАГЕ, где заголовок говорил про прорезь, — и исправлял это не
// разработчик, а раскройщик, у станка и по факту испорченного куска.
const mode = await modeCells();

head('К. фраза длины на листе называет ТО, ЧТО РЕЖУТ');
ck(mode.length === STEPS.length, 'клетки «machine / mode» напечатались все', `клеток: ${mode.length}`);
ck(
  mode[6].includes('slit, cut 18 mm'),
  'работа-прорезь на зигзаге печатается СЛОВОМ ПРО РАЗРЕЗ',
  String(mode[6]),
);
// СРАВНИВАЕТСЯ ФРАЗА, А НЕ ВСЯ КЛЕТКА: в той же клетке первым стоит ИМЯ МАШИНКИ, и на петельном
// автомате слово «buttonhole» в ней законно и обязано быть. Требовать его отсутствия целиком —
// значит запретить машинке называться своим именем; проверяется ровно фраза длины.
ck(
  !mode[6].includes('buttonhole, cut'),
  'и фразы про петлю на этой строке нет вовсе',
  String(mode[6]),
);
ck(
  mode[7].includes('buttonhole, cut 18 mm'),
  'шаг БЕЗ работы на петельном автомате печатается ровно как печатался',
  String(mode[7]),
);
ck(
  mode[8].includes('txt_unknown, cut 18 mm'),
  'незнакомый токен доезжает до бумаги ТЕКСТОМ, а не догадкой «buttonhole»',
  String(mode[8]),
);
// Здесь машинка ПЕТЕЛЬНАЯ, и её имя в клетке стоит по праву — а вот ФРАЗА длины назвать разрез
// петлёй не имеет права: работа этому бандлу неизвестна, и «buttonhole» был бы догадкой.
ck(
  !mode[8].includes('buttonhole, cut'),
  'и петлёй незнакомая работа НЕ названа',
  String(mode[8]),
);

// ── РЕЛИЗНЫЙ СНАПШОТ ────────────────────────────────────────────────────────────────────────────
//
// ЭТО НЕ «ФОЛБЭК НА ВСЯКИЙ СЛУЧАЙ», А УТВЕРЖДЕНИЕ О ПОДПИСАННОМ ДОКУМЕНТЕ. Замороженный релиз —
// protojson-блоб, снятый ДО появления оси работ: поля `work` в нём нет и появиться ему неоткуда.
// Бумага такого релиза обязана говорить то, что говорила в день подписи, — и «то же самое» здесь
// проверяется САМОЙ СИЛЬНОЙ формой: клетка релиза сравнивается с клеткой живого шага БЕЗ работы
// целиком, символ в символ. Никакого признака «это релиз» продуктовый код при этом не читает, и
// не должен: отсутствие поля в блобе И ЕСТЬ утверждение «работа здесь названа не была».
head('Л. печать РЕЛИЗНОГО снапшота даёт сегодняшнюю деривацию');
const rel = await releaseModeCells();
ck(rel.length === STEPS.length, 'релизный лист напечатался целиком', `клеток: ${rel.length}`);
ck(
  rel[6].includes('buttonhole, cut 18 mm'),
  'шаг прорези БЕЗ поля `work` зовётся на бумаге релиза по-старому',
  String(rel[6]),
);
ck(
  !rel[6].includes('slit'),
  'и работой, которой в подписанном документе нет, он НЕ назван',
  String(rel[6]),
);
// СИМВОЛ В СИМВОЛ — И СРАВНИВАЕТСЯ ТОТ ЖЕ САМЫЙ ШАГ С САМИМ СОБОЙ, а не с соседним: у соседа
// другая машинка, и её имя в клетке сделало бы сравнение заведомо ложным (первая редакция этой
// цитаты была именно такой и краснела впустую). Замороженная клетка обязана отличаться от живой
// РОВНО ОДНИМ словом — тем, которое называет разрез; всё остальное в ней обязано совпасть.
ck(
  rel[6] === mode[6].replace('slit, cut', 'buttonhole, cut'),
  'клетка релиза отличается от живой РОВНО словом про разрез и ничем больше',
  `${rel[6]} / ${mode[6]}`,
);
// И ШАГ, У КОТОРОГО РАБОТЫ НЕТ НИ ТАМ, НИ ТУТ, обязан напечататься ОДИНАКОВО в обеих бумагах:
// это доказывает, что релизный путь не «чинит» строки, у которых чинить нечего.
ck(
  rel[7] === mode[7],
  'шаг без работы печатается в релизе и вживую одним и тем же текстом',
  `${rel[7]} / ${mode[7]}`,
);
// ЖИВОЙ ЛИСТ ВОЗВРАЩАЕТСЯ НА МЕСТО — иначе цитаты ниже читали бы замороженную бумагу.
await sheetNames();

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
// ПРИМЕР «СНИМОК ЭТОГО НЕ ЗНАЕТ» — ТОКЕН, КОТОРОГО НЕ ЗНАЕТ НИКТО, а не работа 0331: с тех пор как
// снимок догнал миграцию, московский шов в нём ЕСТЬ, и требовать от него голого токена значило бы
// требовать деградации, которую фаза как раз и убрала. Правило же не изменилось ни на слово.
ck(
  railOff[2] === 'txt_unknown · front',
  'работа, снимку неизвестная, видна ТОКЕНОМ, а не догадкой и не пустотой',
  String(railOff[2]),
);
ck(
  railOff[0] === `${MOSCOW} · front`,
  'а работа 0331, которую снимок ТЕПЕРЬ знает, названа его ЯРЛЫКОМ и без каталога',
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
