#!/usr/bin/env node
// ПИКЕР РАБОТ: КАТАЛОГ С СЕРВЕРА, ПОИСК СВОИМ СЛОВОМ, ЗАПИСЬ ВИДА, ПРИОРИТЕТ ДЕФОЛТОВ (R6).
//
// ПОЧЕМУ ЖИВОЙ БРАУЗЕР, А НЕ ФУНКЦИИ. Половина проверяемого — это то, ЧТО ЧЕЛОВЕК ВИДИТ И ЧТО
// ПРОИСХОДИТ ОТ ЕГО ЖЕСТА: строка, найденная по русскому слову; список, не опустевший при отказе
// каталога; токен, доехавший до экрана текстом; поле, заполнившееся дефолтом с меткой. Функция,
// вернувшая правильный массив, ничего из этого не доказывает — ровно этим и был плох прежний
// «зелёный» гейт, проверявший таблицы вместо редактора.
//
// КАТАЛОГ ПРИЕЗЖАЕТ ПО СЕТИ И ПЕРЕХВАТЫВАЕТСЯ ЗДЕСЬ. Подменить хук в стенде значило бы проверить
// всё, кроме проверяемого: суть R6 в том, ОТКУДА берётся список, и путь «сеть → разбор → индекс →
// строки» обязан пройти целиком.
//
// ЦИТАТЫ:
//   А — ввод «моско» по фикстуре ответа сервера находит московский шов (и он единственный);
//   Б — каталог ОТКАЗАЛ: пикер живёт на снимке бандла, список не пуст, деградация НАЗВАНА;
//   В — токен, которого бандл не знает, виден ТЕКСТОМ и уезжает обратно тем же токеном;
//   Г — выбор пишет РАБОТУ и ЛИЧНОСТЬ (в том числе у работы, пункта под которую в бандле нет);
//   Д — приоритет дефолтов: карточный последний шаг перекрывает глобальный, метка называет источник;
//   Е — жест «запомнить как дефолт» рисуется ПО СЕРВЕРНОМУ РЕЕСТРУ: поле, выкинутое из
//       `default_fields`, кнопки не получает, а поле, которого нет в клиентском списке свойств, —
//       получает. Обе половины нужны: одна ловит «рисуем по своему списку», вторая — «рисуем по
//       обоим сразу»;
//   Ж — суженный список «на чём» и гоуст нормы времени тоже приходят из каталога: у работы, пункта
//       под которую в бандле нет, сузить список нечем, и без каталога человек получил бы двадцать
//       шесть машинок словаря вместо двух законных;
//   З (ревью R6) — клавиатура не выбирает вслепую: Enter при пустом запросе БЕЗ подсветки молчит
//       (первой строкой стоит «— no kind —», и рефлекторный Enter снимал бы вид, не меняя
//       триггера), а «набрал слово + Enter» остаётся одним жестом;
//   И (ревью R6) — метка «prefilled» ГАСНЕТ, когда человек тронул значение (и значение остаётся
//       его); щит осведомлённости operation_work_aware объявлен на КАЖДОЙ записи. Обе половины
//       найдены мутациями ревью: без них подмена условия метки и aware=false оставались зелёными.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у press-action-probe): правка
// исходника ради проверки — это правка, которую однажды забудут откатить.
//   node scripts/work-picker-probe.mjs                прогон
//   node scripts/work-picker-probe.mjs --mutate-syn   разбор ответа выбрасывает синонимы → А красная
//   node scripts/work-picker-probe.mjs --mutate-fallback  снимок бандла подменяется пустым → Б красная
//   node scripts/work-picker-probe.mjs --mutate-priority глобальный дефолт бьёт карточный → Д красная
//   node scripts/work-picker-probe.mjs --mutate-nowrite     выбор пишет ЛИЧНОСТЬ, но не работу → Г красная
//   node scripts/work-picker-probe.mjs --mutate-clientlist  жест рисуется по КЛИЕНТСКОМУ списку → Е красная
//   node scripts/work-picker-probe.mjs --mutate-narrow      «на чём» сужается пунктом бандла → Ж красная
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui) — все откатаны:
//   --mutate-syn        → 4 провала: «моско», «МОСКОВСКИЙ», «оверлок» не находят ничего, и сужение
//                         поиска не подтверждается. Английские имена при этом ищутся по-прежнему —
//                         то есть мутация убила ровно русский поиск, ради которого каталог и заведён;
//   --mutate-fallback   → 5 провалов: список пуст (0 строк), знакомых работ нет, выбрать нечего,
//                         запись не появилась. Цитаты А–Е на живом каталоге при этом зелёные —
//                         дыра именно в деградации;
//   --mutate-priority   → 2 провала: карточный отступ 6 подменён глобальным 9, и метка называет
//                         «your default» там, где источник карточный;
//   --mutate-nowrite    → 9 провалов (адверсарная): личность пишется, работа — нет; жест «снять вид»
//                         исчезает из списка (снимать нечего), имя работы откатывается к выведенному.
//                         Это ровно то состояние, в котором фаза оказалась бы, забудь исполнитель
//                         одну строку записи;
//   --mutate-clientlist → 2 провала (адверсарная): жест рисуется по клиентскому KIND_PROPERTY_FIELDS,
//                         и обе половины цитаты Е красные — кнопка появилась над выкинутым сервером
//                         полем и исчезла над полем, которого нет в клиентском списке;
//   --mutate-narrow     → 2 провала (адверсарная): суженный список «на чём» снова берётся у пункта
//                         бандла, и у работы без пункта он раскрывается в ПОЛНЫЙ словарь — 26 строк
//                         вместо двух, а подпись возвращается к «machine» вместо «on what».

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_SYN = process.argv.includes('--mutate-syn');
const MUTATE_FALLBACK = process.argv.includes('--mutate-fallback');
const MUTATE_PRIORITY = process.argv.includes('--mutate-priority');
const MUTATE_NOWRITE = process.argv.includes('--mutate-nowrite');
const MUTATE_CLIENTLIST = process.argv.includes('--mutate-clientlist');
const MUTATE_NARROW = process.argv.includes('--mutate-narrow');

// PLAYWRIGHT БЕРЁТСЯ ОТТУДА ЖЕ, ОТКУДА ЕГО БЕРУТ СОСЕДНИЕ ЖИВЫЕ ПРОБЫ: локальные зависимости, а
// если их нет — кэш npx (память «headless chromium для прототипов»). Не нашёлся — проба
// ПРОПУСКАЕТСЯ, а не падает: её отсутствие не является утверждением о коде.
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
const outfile = resolve(tmpdir(), `work-picker-${process.pid}.js`);

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
const SYN_FIX = `    syn: (raw.syn ?? []).map((s) => s.trim()).filter(Boolean),`;
const SYN_BROKEN = `    syn: [],`;
const PRIORITY_FIX = `    const card = fromCard[field];
    if (card !== undefined && !isBlank(field, card)) {
      out.push({ field, value: card, source: 'card' });
      continue;
    }
    const global = fromGlobal[field];
    if (global !== undefined && !isBlank(field, global)) {
      out.push({ field, value: global, source: 'global' });
    }`;
const PRIORITY_BROKEN = `    const global = fromGlobal[field];
    if (global !== undefined && !isBlank(field, global)) {
      out.push({ field, value: global, source: 'global' });
      continue;
    }
    const card = fromCard[field];
    if (card !== undefined && !isBlank(field, card)) {
      out.push({ field, value: card, source: 'card' });
    }`;
const FALLBACK_FIX = `  const catalog = useMemo(() => parseWorkCatalog(data) ?? BUNDLED_WORK_CATALOG, [data]);`;
const FALLBACK_BROKEN = `  const catalog = useMemo(
    () =>
      parseWorkCatalog(data) ?? { ...BUNDLED_WORK_CATALOG, items: [], byToken: new Map() },
    [data],
  );`;
// АДВЕРСАРНЫЕ МУТАЦИИ СВЕРХ ПЛАНОВЫХ. Первая проверяет, что цитата Г ловит ПОЛОВИНУ жеста: личность
// пишется, работа — нет (ровно то состояние, в котором фаза оказалась бы, забудь исполнитель одну
// строку). Вторая — что цитата Е ловит подмену серверного реестра клиентским списком свойств вида,
// то есть ту самую ошибку, ради которой сервер реестр и отдаёт.
const NOWRITE_FIX = `    setValue(\`\${p}.work\`, token, { shouldDirty: true });`;
const NOWRITE_BROKEN = `    void token;`;
const CLIENTLIST_FIX = `    for (const column of workCatalog.defaultFields) {`;
const CLIENTLIST_BROKEN = `    for (const column of KIND_PROPERTY_FIELDS.map((f) =>
      f.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
    )) {`;
// Третья адверсарная: суженный список «на чём» снова берётся у пункта бандла. У работы, пункта под
// которую в бандле нет, сужать становится нечем — и человек получает полный словарь машинок там,
// где законных ровно две.
const NARROW_FIX = `  const askedMachines: string[] | undefined = activeWork
    ? activeWork.machineMode === 'ask'
      ? activeWork.machines.map(machineTokenToEnum)
      : undefined
    : activeKind?.askMachine
      ? (activeKind.askMachine as readonly string[]).slice()
      : undefined;`;
const NARROW_BROKEN = `  const askedMachines: string[] | undefined = activeKind?.askMachine
    ? (activeKind.askMachine as readonly string[]).slice()
    : undefined;`;

const patcher = (filter, pairs, loader) => ({
  name: 'work-picker-mutation',
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
if (MUTATE_SYN) plugins.push(patcher(/operation-work\.ts$/, [[SYN_FIX, SYN_BROKEN]], 'ts'));
if (MUTATE_PRIORITY)
  plugins.push(patcher(/operation-work\.ts$/, [[PRIORITY_FIX, PRIORITY_BROKEN]], 'ts'));
if (MUTATE_FALLBACK)
  plugins.push(patcher(/useOperationWorkCatalog\.ts$/, [[FALLBACK_FIX, FALLBACK_BROKEN]], 'ts'));
if (MUTATE_NOWRITE)
  plugins.push(patcher(/operations-field\.tsx$/, [[NOWRITE_FIX, NOWRITE_BROKEN]], 'tsx'));
if (MUTATE_CLIENTLIST)
  plugins.push(patcher(/operations-field\.tsx$/, [[CLIENTLIST_FIX, CLIENTLIST_BROKEN]], 'tsx'));
if (MUTATE_NARROW)
  plugins.push(patcher(/operations-field\.tsx$/, [[NARROW_FIX, NARROW_BROKEN]], 'tsx'));

await esbuild({
  entryPoints: [resolve(HERE, 'work-picker-entry.tsx')],
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
// СНИМОК ОТВЕТА, А НЕ ВТОРОЙ КАТАЛОГ. Слова взяты из сида миграций 0329/0331 — те самые, что
// приедут с беты, — но список НАРОЧНО короткий: проба проверяет механику пикера, а не полноту
// словаря (её стерегут guard-тесты бэкенда). Русские слова живут здесь законно: это и есть
// «приходящее с сервера».
//
// ДВЕ ПОДМЕНЫ В `default_fields` СДЕЛАНЫ СПЕЦИАЛЬНО (цитата Е):
//   * `topstitch_rows` ВЫКИНУТ, хотя в клиентском KIND_PROPERTY_FIELDS он есть — кнопки «запомнить»
//     над ним быть не должно;
//   * `seam_allowance_mm` ДОБАВЛЕН, хотя в клиентском списке свойств вида его нет вовсе — кнопка
//     над ним быть обязана.
// Обе половины ловят разные ошибки: первая — «рисуем по своему списку», вторая — «рисуем по
// пересечению двух».
const CATALOG = {
  works: [
    {
      token: 'join_lockstitch',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Join / seam',
      machineMode: 'fixed',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch'],
      syn: ['стачать', 'стачной шов', 'прямострочка', 'join', 'seam'],
      sort: 10,
      retired: false,
    },
    {
      token: 'topstitch',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Topstitch',
      machineMode: 'ask',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch', 'lockstitch_double_needle', 'chainstitch', 'coverstitch'],
      syn: ['отстрочка', 'отстрочить', 'топстич', 'topstitch', 'edgestitch'],
      sort: 20,
      retired: false,
    },
    {
      token: 'overlock_serge',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Overlock / serge',
      machineMode: 'fixed',
      defaultMachine: 'overlock',
      machines: ['overlock'],
      syn: ['обметать', 'оверлок', 'overlock', 'serge'],
      sort: 30,
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
      syn: ['московский', 'московский шов', 'узкая подгибка', 'moscow', 'rolled hem'],
      sort: 75,
      retired: false,
    },
    {
      token: 'gather_ease',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Gather / ease',
      machineMode: 'fixed',
      defaultMachine: 'gathering',
      machines: ['gathering'],
      syn: ['сборка', 'gather'],
      sort: 140,
      // СНЯТАЯ РАБОТА: в пикере её быть не должно, но прочитаться она обязана.
      retired: true,
    },
    {
      token: 'slit_overcast',
      verb: 'machine',
      stage: 'closures',
      label: 'Slit — overcast',
      // РАБОТА БЕЗ ПУНКТА В БАНДЛЕ, КОТОРАЯ СПРАШИВАЕТ МАШИНКУ (0331). Суженного списка «на чём»
      // в бандле для неё нет вовсе — он обязан прийти из каталога.
      machineMode: 'ask',
      defaultMachine: 'zigzag',
      machines: ['zigzag', 'buttonhole'],
      syn: ['прорезь', 'обмётанная прорезь', 'slit', 'overcast slit'],
      sort: 165,
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
  defaults: [
    { workToken: 'topstitch', field: 'topstitch_width_mm', value: '9' },
    { workToken: 'topstitch', field: 'topstitch_rows', value: '3' },
  ],
  smvHints: [
    { workToken: 'moscow_hem', lastSmv: { value: '2.4' }, cardName: 'SS26 SHIRT' },
  ],
  defaultFields: [
    'topstitch_mode',
    'topstitch_width_mm',
    // topstitch_rows ВЫКИНУТ НАРОЧНО — см. шапку фикстуры.
    'seam_allowance_mm',
    'needle_count',
    'cut_length_mm',
  ],
};

const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  OVERLOCK: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  TOPSTITCH_SEAM: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
  SEAM_UNSET: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
};

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
// ВЫСОКОЕ ОКНО — НЕ КОСМЕТИКА: поповер пикера выпадает вниз, и в обычном окне нижние строки
// оказываются за кадром — «строки нет» смешалось бы с «не дотянулись».
const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// РЕЖИМ ОТВЕТА КАТАЛОГА ПЕРЕКЛЮЧАЕТСЯ ЗДЕСЬ — тем же перехватом, каким его получает браузер.
let catalogMode = 'ok';
let catalogCalls = 0;
const remembered = [];
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
  if (url.includes('operation-work/default')) {
    remembered.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const KIND = '[data-kind-picker="0"]';
const TRIGGER = `${KIND} button[data-combobox-trigger]`;
const INPUT = `${KIND} input[data-combobox-input]`;

async function mount(ops) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.__workPicker.mount(o), ops);
  await page.waitForSelector(KIND, { timeout: 15000 });
  // Каталог — сетевой запрос, и он приезжает ПОСЛЕ первого кадра. Ждём ровно по признаку, а не по
  // таймеру: иначе «списка нет» смешалось бы с «ещё не приехал».
  await page.waitForTimeout(400);
}

const triggerText = async () => ((await page.locator(TRIGGER).textContent()) ?? '').trim();
async function openList() {
  await page.locator(TRIGGER).scrollIntoViewIfNeeded();
  await page.locator(TRIGGER).click();
  await page.waitForSelector(INPUT, { timeout: 5000 });
}
async function closeList() {
  await page.keyboard.press('Escape');
  await page.waitForSelector(INPUT, { state: 'detached', timeout: 5000 }).catch(() => {});
}
async function optionLabels() {
  return page.$$eval('[data-combobox-option]', (ns) => ns.map((n) => (n.textContent ?? '').trim()));
}
async function search(text) {
  await openList();
  await page.fill(INPUT, text);
  await page.waitForTimeout(120);
  const labels = await optionLabels();
  const empty = await page.locator('[data-combobox-empty]').count();
  return { labels, empty };
}
async function pickWork(token) {
  await openList();
  const opt = page.locator(`[data-combobox-option="${token}"]`);
  if ((await opt.count()) === 0) {
    await closeList();
    return false;
  }
  await opt.first().click();
  await page.waitForSelector(INPUT, { state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  return true;
}
const values = () => page.evaluate(() => window.__workPicker.values());

// ── 0. СНИМОК БАНДЛА ПОЛОН ──────────────────────────────────────────────────────────────────────
head('0. сшивка «пункт ↔ токен»: снимок бандла покрывает весь список авторинга');
await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
const inv = await page.evaluate(() => window.__workPicker.bundle());
ck(
  inv.items === inv.offered,
  'у КАЖДОГО предлагаемого пункта есть токен каталога',
  `снимок ${inv.items} · пунктов ${inv.offered}`,
);
ck(inv.tokens === inv.uniq, 'токены не повторяются', `${inv.tokens} → ${inv.uniq}`);

// ── А. ПОИСК РУССКИМ СЛОВОМ ─────────────────────────────────────────────────────────────────────
head('А. «моско» находит московский шов — синонимами, приехавшими с сервера');
ck(catalogCalls > 0, 'каталог и правда запрашивался по сети', `запросов: ${catalogCalls}`);
{
  const { labels } = await search('моско');
  ck(
    labels.includes('Hem — rolled (Moscow)'),
    'по «моско» найден московский шов',
    labels.join(' | ') || 'ничего',
  );
  ck(labels.length === 1, 'и он ЕДИНСТВЕННЫЙ — поиск сузил, а не перечислил', String(labels.length));
  await closeList();
}
{
  // Регистр и «ё» различиями не являются, и это проверяется, а не подразумевается.
  const { labels } = await search('  МОСКОВСКИЙ ');
  ck(labels.includes('Hem — rolled (Moscow)'), 'регистр и пробелы не мешают', labels.join(' | '));
  await closeList();
}
{
  const { labels } = await search('оверлок');
  ck(labels.includes('Overlock / serge'), 'второе русское слово тоже находит', labels.join(' | '));
  await closeList();
}
{
  // ПРОМАХ — ЭТО ОТВЕТ, А НЕ ПУСТОТА: строка называет запрос.
  const { labels, empty } = await search('шоколад');
  ck(labels.length === 0 && empty === 1, 'промах показан строкой, называющей запрос', String(empty));
  await closeList();
}
{
  // Пустой запрос — весь список группами. Снятая работа не предлагается.
  await openList();
  const labels = await optionLabels();
  ck(labels.length >= 5, 'без запроса список листается целиком', `${labels.length} строк`);
  ck(!labels.includes('Gather / ease'), 'снятая работа в пикер не предлагается', labels.join(' | '));
  const groups = await page.$$eval('[data-combobox-group]', (ns) =>
    ns.map((n) => n.getAttribute('data-combobox-group')),
  );
  ck(groups.includes('join_seam') && groups.includes('pressing'), 'строки разложены по стадиям', groups.join(' | '));
  await closeList();
}

// ── Г. ВЫБОР ПИШЕТ РАБОТУ И ЛИЧНОСТЬ ────────────────────────────────────────────────────────────
head('Г. выбор пишет РАБОТУ и ЛИЧНОСТЬ');
{
  ck(await pickWork('topstitch'), 'работа «Topstitch» выбирается');
  const v = await values();
  ck(v.work === 'topstitch', 'в строку шага записана РАБОТА', String(v.work));
  ck(v.seamClass === T.TOPSTITCH_SEAM, 'и личность пункта — класс шва', String(v.seamClass));
  ck(v.operationType === T.MACHINE, 'глагол из каталога', String(v.operationType));
  ck((await triggerText()).includes('Topstitch'), 'пикер показывает имя ИЗ КАТАЛОГА', await triggerText());
}
{
  // РАБОТА БЕЗ ПУНКТА В БАНДЛЕ (0331) — самый важный случай: её личность и есть пара «глагол +
  // машинка», и записать её обязан сам каталог.
  ck(await pickWork('moscow_hem'), 'работа без пункта в бандле выбирается');
  const v = await values();
  ck(v.work === 'moscow_hem', 'её токен записан', String(v.work));
  ck(v.operationType === T.MACHINE, 'глагол взят из каталога', String(v.operationType));
  ck(v.machineType === T.LOCKSTITCH, 'машинка взята из каталога', String(v.machineType));
  // ЧУЖОЙ ЯКОРЬ НЕ СТИРАЕТСЯ, И ЭТО ПРАВИЛО, А НЕ НЕДОРАБОТКА. `kindClears` снимает ровно тот
  // якорь, который САМ ПИКЕР пишет как личность ДРУГОГО пункта, и только если снятие
  // ДЕЙСТВИТЕЛЬНО делает выбранный пункт ответом резолва. У работы, пункта под которую в бандле
  // нет, ни того ни другого не выразить — значит снимать нечего, и «на всякий случай» здесь
  // было бы ровно тем стиранием, которого фаза «перестать терять» не допускает. Факт остаётся
  // видимым контролом на экране: сломаться можно, исчезнуть нельзя.
  ck(
    v.seamClass === T.TOPSTITCH_SEAM,
    'чужой якорь НЕ стёрт — он остался видимым фактом, а не исчез молча',
    String(v.seamClass),
  );
  ck(
    (await triggerText()).includes('Moscow'),
    'и имя её — из каталога, а не выведенное',
    await triggerText(),
  );
}
{
  // СНЯТИЕ ВИДА — ОДНА ЗАПИСЬ. Глагол и машинка остаются: человек сказал «работа названа
  // неправильно», а не «шаг стал другим».
  const before = await values();
  ck(await pickWork(''), 'жест «— no kind —» есть в списке');
  const v = await values();
  ck(v.work === '', 'работа снята', String(v.work));
  ck(v.operationType === before.operationType, 'глагол не тронут', String(v.operationType));
  ck(v.machineType === before.machineType, 'машинка не тронута', String(v.machineType));
  ck(
    (await page.locator(`[data-work-derived="0"]`).count()) === 1,
    'и экран говорит, что имя теперь ВЫВЕДЕНО, а не сохранено',
  );
}

// ── З. КЛАВИАТУРА НЕ ВЫБИРАЕТ ВСЛЕПУЮ ───────────────────────────────────────────────────────────
head('З. Enter без слова и без подсветки не делает ничего; «слово + Enter» выбирает');
{
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  ck(await pickWork('topstitch'), 'работа стоит на шаге');
  // Слепой Enter: открыл и сразу нажал. Первой строкой стоит «— no kind —», и выбор её вслепую
  // снял бы вид, НЕ ПОМЕНЯВ триггера: у A2 выведенное имя совпадает с каталожным «Topstitch».
  await openList();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const v = await values();
  ck(v.work === 'topstitch', 'слепой Enter НЕ снял вид', String(v.work));
  ck((await page.locator(INPUT).count()) === 1, 'и список остался открытым — молчание не жест');
  await closeList();
  // «Набрал слово + Enter» — один жест, и он обязан работать: запрос подсвечивает первое
  // совпадение.
  await openList();
  await page.fill(INPUT, 'моско');
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const v2 = await values();
  ck(v2.work === 'moscow_hem', '«моско» + Enter выбирает московский шов', String(v2.work));
}

// ── Ж. «НА ЧЁМ» И ГОУСТ ВРЕМЕНИ — ТОЖЕ ОТ КАТАЛОГА ──────────────────────────────────────────────
head('Ж. суженный список «на чём» и гоуст нормы времени приходят из каталога');
{
  // РАБОТА БЕЗ ПУНКТА, СПРАШИВАЮЩАЯ МАШИНКУ: суженного списка в бандле нет вовсе, и без каталога
  // человек получил бы полный список из двадцати с лишним машинок вместо двух законных.
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  ck(await pickWork('slit_overcast'), 'работа без пункта, спрашивающая машинку, выбирается');
  const v = await values();
  ck(v.work === 'slit_overcast', 'её токен записан', String(v.work));
  ck(
    v.machineType === 'TECH_CARD_MACHINE_TYPE_ZIGZAG',
    'машинка взята дефолтом каталога, а не оставлена прежней',
    String(v.machineType),
  );
  const label = await page.locator('[data-field="operations.0.machineType"] label').first().textContent();
  ck(/on what/i.test(label ?? ''), 'подпись контрола говорит «на чём», а не «машинка»', String(label));
  // И СПИСОК ДЕЙСТВИТЕЛЬНО СУЖЕН — двумя машинками каталога, а не двадцатью с лишним словаря.
  await page.locator('[data-field="operations.0.machineType"] button').first().click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  const machines = await page.$$eval('[role="option"]', (ns) =>
    ns.map((n) => (n.textContent ?? '').trim()).filter(Boolean),
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 }).catch(() => {});
  ck(
    machines.length <= 3,
    'список «на чём» сужен каталогом, а не показан целиком',
    `${machines.length}: ${machines.join(' | ')}`,
  );
  ck(
    machines.some((m) => /zigzag/i.test(m)) && machines.some((m) => /buttonhole/i.test(m)),
    'и в нём ровно те машинки, что назвал каталог',
    machines.join(' | '),
  );
}
{
  // ГОУСТ КАТАЛОГА — только у строки с НАЗВАННОЙ работой и только когда карточка молчит.
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  ck(await pickWork('moscow_hem'), 'работа с подсказкой времени выбрана');
  const hint = await page
    .locator('[data-field="operations.0.smv"] input')
    .first()
    .getAttribute('placeholder');
  ck(hint === 'last: 2.4', 'в пустом поле нормы стоит гоуст из каталога', String(hint));
  const v = await values();
  ck(v.smv === '', 'и это ГОУСТ, а не значение — поле осталось пустым', `«${v.smv}»`);
}

// ── В. НЕЗНАКОМЫЙ ТОКЕН ─────────────────────────────────────────────────────────────────────────
head('В. токен новее бандла: виден текстом, уезжает целым');
await mount([
  { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE, work: 'unknown_work_x' },
]);
{
  const text = await triggerText();
  ck(text.includes('unknown_work_x'), 'сам токен стоит в пикере ТЕКСТОМ', text);
  ck(
    (await page.locator('[data-work-unknown="unknown_work_x"]').count()) === 1,
    'и рядом сказано, что он из более новой версии приложения',
  );
  const wire = await page.evaluate(() =>
    window.__workPicker.wire({
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
      work: 'unknown_work_x',
    }),
  );
  ck(wire?.work === 'unknown_work_x', 'на провод уезжает ТОТ ЖЕ токен', String(wire?.work));
  const back = await page.evaluate(() =>
    window.__workPicker.readBack({
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
      work: 'unknown_work_x',
    }),
  );
  ck(back?.work === 'unknown_work_x', 'круг «форма → провод → форма» его не теряет', String(back?.work));
  // ЩИТ ОСВЕДОМЛЁННОСТИ ОБЪЯВЛЕН НА КАЖДОЙ ЗАПИСИ. Найдено мутацией ревью: aware=false не красил
  // ни одной пробы — а именно этот флаг отличает «снял вид» от «сохраняет старый бандл», и без
  // него сервер отверг бы каждое сохранение карточки с работой.
  const aware = await page.evaluate(() => window.__workPicker.aware());
  ck(aware === true, 'operation_work_aware = true на записи', String(aware));
}

// ── Д. ПРИОРИТЕТ ДЕФОЛТОВ ───────────────────────────────────────────────────────────────────────
head('Д. дефолты: карточный последний шаг > глобальный дефолт > пусто');
{
  // Только глобальный: на карточке один шаг, брать не с чего.
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  ck(await pickWork('topstitch'), 'работа выбрана на одиноком шаге');
  const v = await values();
  ck(v.topstitchWidthMm === '9', 'пустое поле заполнено ГЛОБАЛЬНЫМ дефолтом', String(v.topstitchWidthMm));
  const sources = await page.$$eval('[data-prefill-field]', (ns) =>
    ns.map((n) => `${n.getAttribute('data-prefill-field')}:${n.getAttribute('data-prefill-source')}`),
  );
  ck(
    sources.includes('topstitchWidthMm:global'),
    'и метка называет источник — «твой дефолт»',
    sources.join(' | ') || 'меток нет',
  );
}
{
  // Карточная ступень обязана ПЕРЕКРЫТЬ глобальную. Второй шаг — тот же вид с другим отступом.
  await mount([
    { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE },
    {
      operationType: T.MACHINE,
      machineType: T.LOCKSTITCH,
      zone: T.ZONE,
      work: 'topstitch',
      seamClass: T.TOPSTITCH_SEAM,
      topstitchWidthMm: '6',
    },
  ]);
  ck(await pickWork('topstitch'), 'работа выбрана на карточке, где такой шаг уже есть');
  const v = await values();
  ck(
    v.topstitchWidthMm === '6',
    'карточный последний шаг ПЕРЕКРЫЛ глобальный дефолт (9 → 6)',
    String(v.topstitchWidthMm),
  );
  const sources = await page.$$eval('[data-prefill-field]', (ns) =>
    ns.map((n) => `${n.getAttribute('data-prefill-field')}:${n.getAttribute('data-prefill-source')}`),
  );
  ck(
    sources.includes('topstitchWidthMm:card'),
    'и метка называет карточный источник, а не глобальный',
    sources.join(' | ') || 'меток нет',
  );
  // ЗАПОЛНЕННОЕ НЕ ТРОГАЕТСЯ НИКОГДА — ни своё, ни чужое.
  await mount([
    { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE, topstitchWidthMm: '2' },
    {
      operationType: T.MACHINE,
      machineType: T.LOCKSTITCH,
      zone: T.ZONE,
      work: 'topstitch',
      seamClass: T.TOPSTITCH_SEAM,
      topstitchWidthMm: '6',
    },
  ]);
  await pickWork('topstitch');
  const v2 = await values();
  ck(v2.topstitchWidthMm === '2', 'ответ человека старше любого дефолта', String(v2.topstitchWidthMm));
}
{
  // МЕТКА ГАСНЕТ, КОГДА ЧЕЛОВЕК ТРОНУЛ ЗНАЧЕНИЕ, — И ЗНАЧЕНИЕ ОСТАЁТСЯ ЕГО. Найдено мутацией
  // ревью: условие «значение разошлось с нашим» можно было выкинуть, и все цитаты оставались
  // зелёными — метка жила бы вечно, выдавая правку человека за подстановку.
  // Режим отстрочки задан на монтировании, чтобы контрол ширины был НА ЭКРАНЕ и правился органом.
  await mount([
    {
      operationType: T.MACHINE,
      machineType: T.LOCKSTITCH,
      zone: T.ZONE,
      topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
    },
  ]);
  ck(await pickWork('topstitch'), 'работа выбрана, дефолт подставлен');
  const before = await page.$$eval('[data-prefill-field]', (ns) =>
    ns.map((n) => n.getAttribute('data-prefill-field')),
  );
  ck(before.includes('topstitchWidthMm'), 'метка ширины стоит', before.join(' | ') || 'меток нет');
  await page.fill('[data-field="operations.0.topstitchWidthMm"] input', '7');
  await page.waitForTimeout(200);
  const after = await page.$$eval('[data-prefill-field]', (ns) =>
    ns.map((n) => n.getAttribute('data-prefill-field')),
  );
  ck(!after.includes('topstitchWidthMm'), 'человек тронул поле — метка погасла', after.join(' | ') || 'пусто');
  const v3 = await values();
  ck(v3.topstitchWidthMm === '7', 'а значение осталось ЕГО, не отозвано', String(v3.topstitchWidthMm));
}

// ── Е. ЖЕСТ «ЗАПОМНИТЬ» — ПО СЕРВЕРНОМУ РЕЕСТРУ ─────────────────────────────────────────────────
head('Е. «запомнить как дефолт» рисуется по default_fields сервера');
{
  await mount([
    {
      operationType: T.MACHINE,
      machineType: T.LOCKSTITCH,
      zone: T.ZONE,
      work: 'topstitch',
      seamClass: T.TOPSTITCH_SEAM,
      // РЕЖИМ ОТСТРОЧКИ ЗАДАН НАРОЧНО: без него контрола ширины на экране нет вовсе (ширина
      // уезжает в полосу остатков), а жест «запомнить» предлагается только над ПОКАЗАННЫМ полем —
      // «запомни то, чего не видно» это жест вслепую.
      topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
      topstitchWidthMm: '6',
      topstitchRows: 2,
      seamAllowanceMm: '10',
      stitchesPerCm: '4.5',
    },
  ]);
  const buttons = await page.$$eval('[data-remember-field]', (ns) =>
    ns.map((n) => n.getAttribute('data-remember-field')),
  );
  ck(
    buttons.includes('topstitch_width_mm'),
    'поле реестра, заполненное на шаге, жест получает',
    buttons.join(' | ') || 'кнопок нет',
  );
  ck(
    !buttons.includes('topstitch_rows'),
    'поле, ВЫКИНУТОЕ сервером из реестра, жеста НЕ получает — хотя в клиентском списке оно есть',
    buttons.join(' | '),
  );
  ck(
    buttons.includes('seam_allowance_mm'),
    'поле, которого нет в клиентском списке свойств, жест ПОЛУЧАЕТ — список серверный',
    buttons.join(' | '),
  );
  ck(
    !buttons.includes('stitches_per_cm'),
    'машинная настройка жеста не получает — у неё своя лестница наследования',
    buttons.join(' | '),
  );
  // И жест доезжает до сервера тем же именем колонки и коротким значением.
  await page.locator('[data-remember-field="topstitch_width_mm"]').click();
  await page.waitForTimeout(300);
  const sent = remembered.find((r) => r.field === 'topstitch_width_mm');
  ck(!!sent, 'нажатие ушло на сервер', JSON.stringify(remembered));
  ck(sent?.workToken === 'topstitch', 'с токеном работы', String(sent?.workToken));
  ck(sent?.value === '6', 'и значением поля', String(sent?.value));
}

// ── Б. КАТАЛОГ НЕ ПРИЕХАЛ ───────────────────────────────────────────────────────────────────────
head('Б. каталог отказал: пикер живёт на снимке бандла и говорит об этом');
catalogMode = 'fail';
{
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  await openList();
  const labels = await optionLabels();
  ck(labels.length >= 50, 'список НЕ пуст — работает снимок бандла', `${labels.length} строк`);
  ck(labels.includes('Topstitch'), 'и в нём есть знакомые работы', labels.slice(0, 3).join(' | '));
  ck(
    (await page.locator('[data-work-fallback]').count()) === 1,
    'деградация НАЗВАНА человеку, а не только логу',
  );
  await closeList();
  // Снимок не мёртвый: выбор из него пишет работу так же, как выбор из каталога.
  ck(await pickWork('overlock_serge'), 'из снимка тоже выбирается');
  const v = await values();
  ck(v.work === 'overlock_serge', 'и запись та же самая', String(v.work));
  ck(v.machineType === T.OVERLOCK, 'вместе с машинкой', String(v.machineType));
}

ck(pageErrors.length === 0, 'ни одного исключения за весь прогон', pageErrors[0] ?? '');

await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nрасхождений: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
