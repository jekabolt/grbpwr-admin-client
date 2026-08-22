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
//   К (0331) — СНИМОК ДОГНАЛ КАТАЛОГ, и проверяется он ПРИ ОТКАЗЕ каталога: «моско» и «прорезь»
//       находят две работы, которых владелец просил по имени; снятая `gather_ease` не предлагается,
//       но шаг, уже её несущий, читается ярлыком; свалка зовётся «Join / seam». Сторож сверх цитаты
//       читает САМИ миграции и сравнивает с ними снимок построчно (см. `readSeededWorks`);
//   Л (Д5) — ВТО-ось держит выбор человека так же, как машинная: выбранный утюг переживает смену
//       вида на Steam, а пустое оборудование вид всё-таки заполняет.
//   М (0331) — ДЛИНА ПРОРЕЗИ ЖИВЁТ ПО ДВУМ ВХОДАМ, И РОВНО В ОДНОМ МЕСТЕ ЗА РАЗ. Работа
//       «прорезь, обмётанная зигзагом» показывает поле на ЗИГЗАГЕ (то, ради чего фаза начиналась)
//       и на петельном автомате; шаг БЕЗ работы на петельном показывает его как показывал; ярлык
//       называет то, что режут, а не петлю; заполненная длина на шаге прорези НЕ уезжает в полосу
//       остатков, а на прямострочке без работы поля нет вовсе — и там длина как раз остаток.
//       Отдельной половиной проверяется ОБЯЗАТЕЛЬНОСТЬ: пустая длина на прорези отвечает отказом
//       НА САМОМ КОНТРОЛЕ — том самом, которого до этой правки на экране не было.
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
//   node scripts/work-picker-probe.mjs --mutate-snapshot    дельта 0331 из снимка убрана → К красная
//   node scripts/work-picker-probe.mjs --mutate-presskeep   ВТО-оборудование пишется безусловно → Л красная
//   node scripts/work-picker-probe.mjs --mutate-slitgate    гейт длины снова спрашивает ОДНУ машинку → М красная
//   node scripts/work-picker-probe.mjs --mutate-slitlabel   ярлык длины снова «buttonhole cut, mm» → М красная
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
//                         вместо двух, а подпись возвращается к «machine» вместо «on what»;
//   --mutate-slitgate   → 5 провалов: на зигзаге поля длины нет вовсе (проверять обязательность не
//                         на чем), а ЗАПОЛНЕННАЯ длина шага прорези уезжает СТРОКОЙ ОСТАТКА — то
//                         есть ровно тот экран, на котором сервер отвечает `required` на поле,
//                         которого человек не видит;
//   --mutate-slitlabel  → 2 провала: гейт цел, поле на месте — и на обеих машинках работы «прорезь»
//                         оно снова называется петельным, то есть врёт о том, что на нём режут.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
const MUTATE_SNAPSHOT = process.argv.includes('--mutate-snapshot');
const MUTATE_PRESSKEEP = process.argv.includes('--mutate-presskeep');
const MUTATE_SLITGATE = process.argv.includes('--mutate-slitgate');
const MUTATE_SLITLABEL = process.argv.includes('--mutate-slitlabel');

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
// C5 / Д5 — ДВЕ МУТАЦИИ ФАЗЫ 0331. Первая откатывает дельту снимка целиком (четыре работы, снятие
// предка и честное имя свалки) и обязана покрасить цитату К вместе со сторожем: снимок снова
// отстаёт от каталога ровно так, как отстал в день выкатки. Вторая возвращает БЕЗУСЛОВНУЮ запись
// ВТО-оборудования и обязана покрасить цитату Л: утюг владельца снова молча заменяется отпаривателем.
const SNAPSHOT_FIX = `    const relabelled = RELABELLED_WORKS[item.token];
    items.push({
      ...item,
      ...(relabelled ? { label: relabelled } : null),
      retired: RETIRED_WORKS.has(item.token),
    });
  }
  items.push(...CATALOG_ONLY_WORKS);`;
const SNAPSHOT_BROKEN = `    items.push(item);
  }
  void CATALOG_ONLY_WORKS;
  void RETIRED_WORKS;
  void RELABELLED_WORKS;`;
const PRESSKEEP_FIX = `  if (out.pressEquipment && pressAnswered(pressOnStep)) out.pressEquipment = pressOnStep;`;
const PRESSKEEP_BROKEN = `  void pressOnStep;
  void pressAnswered;`;

// М (0331) — ДВЕ МУТАЦИИ ОДНОГО ПОЛЯ, И ОНИ ПАДАЮТ ВРОЗЬ. Первая возвращает гейт к ОДНОЙ машинке
// (оба этажа сразу — ровно то состояние, в котором клиент был до этой правки): владелец выбирает
// прорезь на зигзаге и не видит поля, которое сервер у него ТРЕБУЕТ. Вторая гейт не трогает —
// поле на месте, — но возвращает ему ярлык про петлю: экран показывает нужный контрол и врёт о
// том, что на нём режут. Одна проверка обе не поймает, поэтому мутации две.
const SLITGATE_FIX = `  const showFastening =
    ownsBlock('fastening') &&
    (isSlitOvercast ||
      onMachine(BUTTONHOLE_MACHINE, BARTACK_MACHINE, BUTTON_ATTACH_MACHINE, ZIPPER_MACHINE));`;
const SLITGATE_BROKEN = `  const showFastening =
    ownsBlock('fastening') &&
    onMachine(BUTTONHOLE_MACHINE, BARTACK_MACHINE, BUTTON_ATTACH_MACHINE, ZIPPER_MACHINE);`;
const SLITCUT_FIX = `  const showCutLength = showFastening && (isSlitOvercast || onMachine(BUTTONHOLE_MACHINE));`;
const SLITCUT_BROKEN = `  const showCutLength = showFastening && onMachine(BUTTONHOLE_MACHINE);`;
// Ярлык с R8 считается ОБЩЕЙ лестницей (`cutLengthNoun`), одной на экран и на печатный лист, —
// поэтому мутация подменяет теперь вызов, а не тернарник литералов. Ломает она ровно то же самое:
// поле на месте, а слово на нём снова про петлю.
const SLITLABEL_FIX = `  const cutLengthLabel = \`\${cutLengthNoun(workCatalog, workValue)} cut, mm\`;`;
const SLITLABEL_BROKEN = `  const cutLengthLabel = 'buttonhole cut, mm';`;

if (MUTATE_SLITGATE)
  plugins.push(
    patcher(
      /operations-field\.tsx$/,
      [
        [SLITGATE_FIX, SLITGATE_BROKEN],
        [SLITCUT_FIX, SLITCUT_BROKEN],
      ],
      'tsx',
    ),
  );
if (MUTATE_SLITLABEL)
  plugins.push(patcher(/operations-field\.tsx$/, [[SLITLABEL_FIX, SLITLABEL_BROKEN]], 'tsx'));

if (MUTATE_SNAPSHOT)
  plugins.push(patcher(/operation-work\.ts$/, [[SNAPSHOT_FIX, SNAPSHOT_BROKEN]], 'ts'));
if (MUTATE_PRESSKEEP)
  plugins.push(patcher(/operation-work\.ts$/, [[PRESSKEEP_FIX, PRESSKEEP_BROKEN]], 'ts'));

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
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  STEAMER: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
  STEAM: 'TECH_CARD_PRESS_ACTION_STEAM',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  ZIGZAG: 'TECH_CARD_MACHINE_TYPE_ZIGZAG',
  BUTTONHOLE: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
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

// ── СТОРОЖ РАСХОЖДЕНИЯ: СНИМОК ПРОТИВ САМИХ МИГРАЦИЙ ────────────────────────────────────────────
//
// THE SNAPSHOT IS COMPARED WITH THE SEED ITSELF, NOT WITH A SECOND COPY OF IT. The catalog is data
// that grows by migration; the bundle snapshot is a hand-carried delta on top of a derived list.
// Those two drift APART SILENTLY — that is the whole defect 0331 produced within minutes of being
// deployed — and no assertion written from memory catches it, because whoever forgets the snapshot
// forgets the assertion in the same breath.
//
// SO THE MIGRATIONS ARE PARSED. Every `NNNN_*.sql` in the backend tree, Up section only, three
// tables (`operation_work`, `_machine`, `_syn`) plus the two UPDATEs that retire and relabel. A
// work seeded there and missing here turns this red; so does a label changed on one side only.
//
// NOT FOUND — SKIPPED, NOT FAILED, the same rule playwright gets above: a guard that cannot read
// its source has not observed anything, and printing a refusal would be a statement about the code
// it never looked at.
//
// STAGE IS DELIBERATELY NOT COMPARED. The snapshot groups by the bundle's own families (`fam_A`),
// the catalog by its stages (`join_seam`) — a stated, commented divergence (see `bundleItem`), not
// a drift. Synonyms are compared only where the snapshot carries any: the derived rows carry none
// on purpose, and the four catalog-only works carry the migration's words verbatim.
function readSeededWorks() {
  const dir = [resolve(REPO, '..', 'grbpwr-products-manager', 'internal/store/sql')].find((d) =>
    existsSync(d),
  );
  if (!dir) return null;
  const works = new Map();
  const machines = new Map();
  const syn = new Map();
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const f of readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()) {
    // Up ONLY: the Down section of 0331 deletes exactly the rows Up creates, and reading it would
    // net the delta to zero.
    const up = readFileSync(resolve(dir, f), 'utf8').split('-- +migrate Down')[0];
    const body = up
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    for (const raw of body.split(';')) {
      const s = raw.trim();
      if (/^INSERT INTO operation_work \(/.test(s)) {
        for (const m of s.matchAll(
          /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(?:'([^']*)'|NULL),\s*(\d+)\s*\)/g,
        )) {
          works.set(m[1], {
            token: m[1],
            verb: m[2],
            label: m[4],
            machineMode: m[5],
            defaultMachine: m[6] ?? '',
            sort: +m[7],
            retired: false,
          });
        }
      } else if (/^INSERT INTO operation_work_machine/.test(s)) {
        for (const m of s.matchAll(/\(\s*'([^']*)',\s*'([^']*)'\s*\)/g)) push(machines, m[1], m[2]);
      } else if (/^INSERT INTO operation_work_syn/.test(s)) {
        for (const m of s.matchAll(/\(\s*'([^']*)',\s*'([^']*)'\s*\)/g)) push(syn, m[1], m[2]);
      } else if (/^UPDATE operation_work SET retired_at = CURRENT_TIMESTAMP/.test(s)) {
        const t = s.match(/token = '([^']*)'/);
        if (t && works.has(t[1])) works.get(t[1]).retired = true;
      } else if (/^UPDATE operation_work SET label =/.test(s)) {
        const l = s.match(/SET label = '([^']*)'/);
        const t = s.match(/token = '([^']*)'/);
        if (l && t && works.has(t[1])) works.get(t[1]).label = l[1];
      }
    }
  }
  if (works.size === 0) return null;
  for (const [t, w] of works) {
    w.machines = machines.get(t) ?? [];
    w.syn = syn.get(t) ?? [];
  }
  return [...works.values()];
}

// ── 0. СНИМОК БАНДЛА ПОЛОН ──────────────────────────────────────────────────────────────────────
head('0. сшивка «пункт ↔ токен»: снимок бандла покрывает весь список авторинга');
await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
const inv = await page.evaluate(() => window.__workPicker.bundle());
ck(
  inv.derived === inv.offered,
  'у КАЖДОГО предлагаемого пункта есть токен каталога',
  `выведено ${inv.derived} · пунктов ${inv.offered} · всего в снимке ${inv.items}`,
);
ck(inv.tokens === inv.uniq, 'токены не повторяются', `${inv.tokens} → ${inv.uniq}`);
{
  const seeded = readSeededWorks();
  if (!seeded) {
    console.log('  скип  дерево бэкенда рядом не найдено — сторож расхождения не читал ничего');
  } else {
    const norm = (a) => [...a].map(String).sort().join(',');
    const byToken = new Map(inv.list.map((w) => [w.token, w]));
    const diffs = [];
    for (const w of seeded) {
      const b = byToken.get(w.token);
      if (!b) {
        diffs.push(`${w.token}: в снимке НЕТ («${w.label}», sort ${w.sort})`);
        continue;
      }
      if (b.label !== w.label) diffs.push(`${w.token}: ярлык «${b.label}» ≠ «${w.label}»`);
      if (b.verb !== w.verb) diffs.push(`${w.token}: глагол ${b.verb} ≠ ${w.verb}`);
      if (b.machineMode !== w.machineMode)
        diffs.push(`${w.token}: режим ${b.machineMode} ≠ ${w.machineMode}`);
      if (b.defaultMachine !== w.defaultMachine)
        diffs.push(`${w.token}: дефолт «${b.defaultMachine}» ≠ «${w.defaultMachine}»`);
      if (b.sort !== w.sort) diffs.push(`${w.token}: sort ${b.sort} ≠ ${w.sort}`);
      if (!!b.retired !== !!w.retired) diffs.push(`${w.token}: снятие ${b.retired} ≠ ${w.retired}`);
      if (norm(b.machines) !== norm(w.machines))
        diffs.push(`${w.token}: машинки [${norm(b.machines)}] ≠ [${norm(w.machines)}]`);
      // Синонимы — только там, где снимок их вообще несёт (см. шапку сторожа).
      if (b.syn.length && norm(b.syn) !== norm(w.syn))
        diffs.push(`${w.token}: синонимы разошлись с миграцией`);
    }
    const seededTokens = new Set(seeded.map((w) => w.token));
    for (const b of inv.list)
      if (!seededTokens.has(b.token)) diffs.push(`${b.token}: в снимке ЕСТЬ, в миграциях НЕТ`);
    ck(
      diffs.length === 0,
      'снимок бандла сходится с миграциями каталога',
      diffs.join(' · ') || `сверено работ: ${seeded.length}`,
    );
  }
}

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

// ── К (0331). СНИМОК ДОГНАЛ КАТАЛОГ — И ПРОВЕРЯЕТСЯ ТАМ, ГДЕ ЖИВЁТ: ПРИ ОТКАЗЕ КАТАЛОГА ────────
//
// THE CATALOG IS STILL REFUSING (`catalogMode = 'fail'` above), and that is the point of the whole
// section: with the answer on the wire every one of these strings comes from the server, and the
// citation would prove nothing about the bundle. What is asserted here is the DEGRADED picker.
head('К. работы 0331 живут и в снимке: «моско» ищет, снятая не предлагается, свалка названа честно');
{
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  // Подпись деградации живёт в ПОДВАЛЕ открытого списка — читать её у закрытого пикера значит
  // читать пустоту и принять её за отказ.
  await openList();
  ck(
    (await page.locator('[data-work-fallback]').count()) === 1,
    'проверяется именно СНИМОК: экран говорит, что каталог не приехал',
  );
  await closeList();
  {
    // ВЛАДЕЛЕЦ ПЕЧАТАЕТ «МОСКО», А НЕ «MOSCOW». Русское слово попало в снимок ровно ради этого
    // случая — и ровно этих четырёх работ, у которых имя в бандле было бы единственной строкой.
    const { labels } = await search('моско');
    ck(
      labels.includes('Hem — rolled (Moscow)'),
      'по «моско» московский шов найден ПО СНИМКУ, без каталога',
      labels.join(' | ') || 'ничего',
    );
    await closeList();
  }
  {
    const { labels } = await search('прорезь');
    ck(
      labels.includes('Slit — overcast'),
      'вторая работа, которую владелец просил по имени, тоже находится русским словом',
      labels.join(' | ') || 'ничего',
    );
    await closeList();
  }
  {
    await openList();
    const labels = await optionLabels();
    const tokens = await page.$$eval('[data-combobox-option]', (ns) =>
      ns.map((n) => n.getAttribute('data-combobox-option')),
    );
    ck(
      !tokens.includes('gather_ease'),
      'СНЯТАЯ 0331 работа из снимка не предлагается',
      tokens.filter((t) => (t ?? '').startsWith('gather')).join(' | ') || 'ни одной gather*',
    );
    ck(
      tokens.includes('gather') && tokens.includes('ease_in'),
      'а оба потомка расщепления — предлагаются',
      tokens.filter((t) => (t ?? '').startsWith('gather') || t === 'ease_in').join(' | '),
    );
    ck(
      labels.includes('Join / seam'),
      'свалка зовётся честным именем каталога',
      labels.slice(0, 3).join(' | '),
    );
    ck(
      !labels.includes('Join — lockstitch'),
      'и прежним именем — уже нигде',
      labels.filter((l) => l.startsWith('Join')).join(' | '),
    );
    await closeList();
  }
  {
    // ТОКЕН СНЯТОЙ РАБОТЫ ЧИТАЕТСЯ, ХОТЯ И НЕ ПРЕДЛАГАЕТСЯ: карточку, размеченную однажды, обязано
    // быть можно открыть. Это вторая половина слова «retire», и без неё снятие стало бы удалением.
    await mount([
      { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE, work: 'gather_ease' },
    ]);
    const text = await triggerText();
    ck(
      text.includes('Gather / ease') && !/unknown to this app version|not named yet/.test(text),
      'шаг, уже несущий снятую работу, назван её ЯРЛЫКОМ, а не жалобой',
      text,
    );
  }
  {
    // И ВЫБОР РАБОТЫ БЕЗ ПУНКТА ИЗ СНИМКА ПИШЕТ ТУ ЖЕ ПАРУ, ЧТО НАПИСАЛ БЫ КАТАЛОГ: список,
    // который нельзя выбрать, — не пикер, а витрина.
    await mount([{ operationType: T.MACHINE, machineType: T.OVERLOCK, zone: T.ZONE }]);
    ck(await pickWork('moscow_hem'), 'работа 0331 выбирается ИЗ СНИМКА');
    const v = await values();
    ck(v.work === 'moscow_hem', 'её токен записан', String(v.work));
    ck(v.machineType === T.LOCKSTITCH, 'и машинка взята из снимка, а не оставлена прежней', String(v.machineType));
  }
}

// ── Л (Д5). СМЕНА ВИДА НЕ ПЕРЕСТАВЛЯЕТ ШАГ НА ДРУГОЙ УТЮГ ───────────────────────────────────────
//
// ONE MEASURED DEFECT, TWO HALVES OF ONE RULE. G4 «Steam» and G8 «Mould» name equipment, and the
// picker wrote it unconditionally: a step the owner had put on his iron moved onto a steamer with
// no label over it and no question asked. Both halves are asserted, and they fail apart — «keeps
// what is there» alone stays green when the write is deleted outright, and «fills the blank» alone
// stays green under the original defect.
head('Л. выбранный профиль пресса переживает смену вида на Steam, а пустой — заполняется');
{
  await mount([
    {
      operationType: T.PRESS,
      pressEquipment: T.IRON,
      zone: T.ZONE,
    },
  ]);
  ck(await pickWork('press_steam'), 'вид «Steam» выбирается на шаге с ВЫБРАННЫМ оборудованием');
  const v = await values();
  ck(v.pressEquipment === T.IRON, 'утюг владельца остался на шаге', String(v.pressEquipment));
  ck(v.pressAction === T.STEAM, 'а под-глагол вида записан', String(v.pressAction));
  ck(v.work === 'press_steam', 'и работа записана', String(v.work));
}
{
  await mount([{ operationType: T.PRESS, zone: T.ZONE }]);
  ck(await pickWork('press_steam'), 'вид «Steam» выбирается на шаге БЕЗ оборудования');
  const v = await values();
  ck(
    v.pressEquipment === T.STEAMER,
    'в пустое оборудование вид подставил своё — «сохраняет» не превратилось в «не пишет»',
    String(v.pressEquipment),
  );
}

// ── М (0331). ДЛИНА ПРОРЕЗИ: ДВА ВХОДА, И РОВНО ОДНО МЕСТО ЗА РАЗ ──────────────────────────────
//
// ЖАЛОБА, С КОТОРОЙ НАЧАЛАСЬ ФАЗА, ЕЮ ЖЕ И ПРОВЕРЯЕТСЯ. Владелец просил «прорезь под пояс,
// обмётанную зигзагом». Работа заведена (0331), сервер длину такой прорези ПРИНИМАЕТ и ТРЕБУЕТ —
// а клиент гейтил поле ОДНОЙ машинкой, петельным автоматом. На зигзаге контрола не было, значит
// сохранение отвечало `cut_length_mm: required` на поле, которого нет на экране: ровно тот
// инцидент, ради которого волна и затевалась, внесённый заново нашей же миграцией.
//
// КАТАЛОГ ЗДЕСЬ ВСЁ ЕЩЁ ОТКАЗЫВАЕТ (`catalogMode = 'fail'` стоит с цитаты Б), И ЭТО НЕ ПОМЕХА, А
// УТВЕРЖДЕНИЕ: гейт читает РАБОТУ ИЗ ФОРМЫ — то, что записано на шаге, — а не каталог. Поле,
// зависящее от сетевого ответа, гасло бы у человека с медленным соединением.
//
// И ПРОВЕРЯЕТСЯ НЕ ТОЛЬКО «ПОКАЗАНО». Полоса остатков рисует ЗАПОЛНЕННОЕ, ЧЕГО НЕТ НА ЭКРАНЕ, и
// живёт она ИНВЕРСИЕЙ того же предиката: расширив гейт, мы меняем и её. Поэтому каждая клетка
// читается с двух сторон сразу — контрол И остаток, — и утверждение всюду одно: РОВНО ОДНО из
// двух. Ни «в обоих» (значение, которое чинят в двух местах), ни «ни в одном» (потеря).
head('М. длина прорези: работа — второй вход, ярлык честен, поле живёт ровно в одном месте');
const CUT = 'operations.0.cutLengthMm';
// ОДНО ЧТЕНИЕ НА ОБЕ СТОРОНЫ. `data-field` стоит и на контроле, и на строке остатка (роутер
// серверных ошибок ищет поле по нему), поэтому различаются они ПРИЗНАКОМ, а не селектором: у
// контрола внутри input, строка остатка лежит внутри полосы.
const cutState = () =>
  page.evaluate((f) => {
    const nodes = [...document.querySelectorAll(`[data-field="${f}"]`)];
    const control = nodes.find((n) => n.querySelector('input'));
    const residue = nodes.find((n) => n.closest('[data-residue-strip]'));
    const message = control?.querySelector('[id$="form-item-message"]');
    return {
      control: !!control,
      label: (control?.querySelector('label')?.textContent ?? '').trim(),
      value: control?.querySelector('input')?.value ?? '',
      residue: !!residue,
      residueLabel: (residue?.querySelector('span')?.textContent ?? '').trim(),
      error: (message?.textContent ?? '').trim(),
    };
  }, CUT);

{
  // ТА САМАЯ КЛЕТКА: ЗИГЗАГ + РАБОТА «ПРОРЕЗЬ».
  await mount([
    { operationType: T.MACHINE, machineType: T.ZIGZAG, zone: T.ZONE, work: 'slit_overcast' },
  ]);
  const st = await cutState();
  ck(st.control, 'на ЗИГЗАГЕ с работой «прорезь» поле длины ЕСТЬ на экране', JSON.stringify(st));
  ck(
    /slit/i.test(st.label) && !/buttonhole/i.test(st.label),
    'и ярлык называет то, что режут, а не петлю',
    `«${st.label}»`,
  );
  ck(!st.residue, 'показанное поле не задваивается строкой остатка');
}
{
  // ОБЯЗАТЕЛЬНОСТЬ ЛОЖИТСЯ НА ТОТ ЖЕ КОНТРОЛ, и жест человеческий: вписал длину и стёр.
  //
  // ОТСУТСТВИЕ КОНТРОЛА — КРАСНАЯ СТРОКА, А НЕ ИСКЛЮЧЕНИЕ. Мутация гейта убирает поле с экрана, и
  // без этой проверки проба падала бы таймаутом playwright, не досказав остальных цитат: упавшая
  // проба сообщает «сломалась проба», а не «сломался экран».
  const input = page.locator(`[data-field="${CUT}"] input`).first();
  if ((await input.count()) === 0) {
    ck(false, 'контрол длины на экране есть — иначе обязательность проверять не на чем', 'поля нет');
  } else {
  await input.fill('18');
  await page.waitForTimeout(200);
  const filled = await cutState();
  ck(filled.value === '18' && filled.error === '', 'названная длина принимается без отказа', filled.error);
  await input.fill('');
  await page.waitForTimeout(300);
  const empty = await cutState();
  ck(
    empty.control && empty.error !== '',
    'а ПУСТАЯ длина на прорези отвечает отказом НА САМОМ КОНТРОЛЕ — не тостом после сохранения',
    `«${empty.error}»`,
  );
  }
}
{
  // ВТОРАЯ МАШИНКА ТОЙ ЖЕ РАБОТЫ: петельный автомат режет прорезь в один проход.
  await mount([
    { operationType: T.MACHINE, machineType: T.BUTTONHOLE, zone: T.ZONE, work: 'slit_overcast' },
  ]);
  const st = await cutState();
  ck(st.control, 'на ПЕТЕЛЬНОМ АВТОМАТЕ с той же работой поле тоже есть', JSON.stringify(st));
  ck(/slit/i.test(st.label), 'и работа называет поле своим словом даже там', `«${st.label}»`);
}
{
  // СЕГОДНЯШНЕЕ ПОВЕДЕНИЕ НЕ СЛОМАНО, И ЭТО ПОЛОВИНА ЦИТАТЫ, А НЕ ФОРМАЛЬНОСТЬ: у всех 126 строк
  // прода работа пуста, и расширение обязано быть ВТОРЫМ входом, а не подменой первого.
  await mount([{ operationType: T.MACHINE, machineType: T.BUTTONHOLE, zone: T.ZONE }]);
  const st = await cutState();
  ck(st.control, 'шаг БЕЗ работы на петельном автомате показывает длину как показывал', JSON.stringify(st));
  ck(st.label === 'buttonhole cut, mm', 'и зовётся она там по-прежнему петельной', `«${st.label}»`);
}
{
  // ЗАПОЛНЕННАЯ ДЛИНА НА ШАГЕ ПРОРЕЗИ — В КОНТРОЛЕ, А НЕ В ОСТАТКЕ.
  await mount([
    {
      operationType: T.MACHINE,
      machineType: T.ZIGZAG,
      zone: T.ZONE,
      work: 'slit_overcast',
      cutLengthMm: '18',
    },
  ]);
  const st = await cutState();
  ck(st.control && st.value === '18', 'сохранённая длина стоит в своём контроле', JSON.stringify(st));
  ck(!st.residue, 'и НЕ уезжает в полосу остатков — поле показано, значит это не остаток');
}
{
  // И ОБРАТНАЯ СТОРОНА ТОГО ЖЕ ПРЕДИКАТА. Прямострочка без работы длины не несёт — там она
  // остаток, и полоса обязана её показать: иначе гейт, сужаясь, стал бы потерей.
  await mount([
    { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE, cutLengthMm: '18' },
  ]);
  const st = await cutState();
  ck(!st.control, 'на прямострочке без работы контрола длины нет', JSON.stringify(st));
  ck(st.residue, 'но заполненная длина видна СТРОКОЙ ОСТАТКА, а не пропадает');
  ck(
    st.residueLabel === 'buttonhole cut, mm',
    'и подпись в полосе — та же, что у контрола этого поля',
    `«${st.residueLabel}»`,
  );
}
{
  // ПУСТОЕ ПОЛЕ ЧУЖОГО ШАГА НЕ ЖИВЁТ НИГДЕ, и это правильный третий ответ: показывать нечего.
  await mount([{ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE }]);
  const st = await cutState();
  ck(!st.control && !st.residue, 'на прямострочке без работы и без значения поля нет вовсе', JSON.stringify(st));
}

ck(pageErrors.length === 0, 'ни одного исключения за весь прогон', pageErrors[0] ?? '');

await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nрасхождений: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
