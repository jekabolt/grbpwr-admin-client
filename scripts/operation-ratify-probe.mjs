#!/usr/bin/env node
// ЭКРАН РАТИФИКАЦИИ ПРЕДЛАГАЕТ ТОЛЬКО ТО, ЧТО КАРТОЧКА УЖЕ ПЕЧАТАЕТ, — И МОЛЧИТ ВЕЗДЕ, ГДЕ ЗАПИСЬ
// НЕ ОТВЕЧАЕТ.
//
// Проба стоит на двух ногах, и вторая важнее первой. Первая — что предложение ПОЯВЛЯЕТСЯ там, где
// запись однозначна: два входа на прямострочке, класс шва отстрочки, единственная работа машинки.
// Вторая — АНТИ-ЛОЖНАЯ: что на строке с одним входом, на подгибке вдвое, на ВТО без приёма и на
// пустой строке не появляется НИЧЕГО. Без второй ноги реализация «всегда предлагаем join»
// проходит первую целиком и зелёным — а именно это и был бы худший исход R7: экран, который
// ратифицирует сам себя.
//
// ЧТО ИМЕННО ПРОВЕРЯЕТСЯ (ярусы §4 плана, фикстуры §8 — `scripts/fixtures/`):
//   Ц1 — два, три и четыре входа, прямострочка, класс шва пуст → ярус `join`, ДВА предложения:
//        `join_lockstitch` без довеска и он же ПЛЮС класс шва `LS_LAPPED`. Подпись второй кнопки
//        собрана из двух существующих подписей, клиент не сочиняет ни слова;
//   Ц2 — класс шва `os_topstitch` → РОВНО ОДНО предложение `topstitch`, и `printedNow` УЖЕ равен
//        его ярлыку: ратификация не меняет в имени ничего, она его записывает;
//   Ц3 — класс шва `ef_hem_turned` → ДЫРА КАТАЛОГА: ноль предложений, и класс шва стоит в фактах
//        своей подписью. Работы «подгиб на прямострочке» в каталоге нет вовсе;
//   Ц4 — один вход, прямострочка, класса шва нет → РАСХОЖДЕНИЕ: ноль предложений, а в фактах ОБЕ
//        половины — напечатанное имя и «один вход»;
//   Ц5 — ВТО без записанного приёма → ноль предложений; и пункт `G0`, называющий ОТСУТСТВИЕ
//        факта, не встречается среди предложений НИ НА ОДНОЙ строке;
//   Ц6 — зигзаг → ДВА предложения каталога, и у прорези НЕПУСТОЕ предупреждение про длину;
//   Ц7 — оверлок → одно предложение, единственная работа этой машинки;
//   Ц8 — работа уже записана → ярус `named`, ноль предложений;
//   Ц9 — АНТИ-ЛОЖНАЯ: ни входов, ни класса шва — ноль предложений. Пустые данные не рождают
//        НИЧЕГО (правило 2 пробы выводимости R5);
//   ЦД — ДВОЕКОДЬЕ: `printedNow` КАЖДОЙ строки равен тому, что отвечает двоекодье, спрошенное
//        пробой НЕЗАВИСИМО (`kindOf` + `kindLabelOf` снаружи против `workNaming` внутри). Эта
//        цитата стоит не ради текста, а ради ПРОИСХОЖДЕНИЯ имени: панель, собравшая имя заново,
//        разошлась бы с печатным листом молча — тот самый дефект, ради которого заводилась R8;
//   ЦР — СНЯТАЯ РАБОТА не предлагается никогда, даже когда она единственная на машинке;
//   ЦБ — ЗАПИСЬ, ОТВЕЧАЮЩАЯ СВЕРХ ДВУХ ОСЕЙ, бьёт арность: шаг с названным швом этикетки и ДВУМЯ
//        входами получает «пришить этикетку», а не «join». Разводит их не второй список
//        дискриминаторов, а сам резолв, спрошенный дважды;
//   ЦК — КАТАЛОГ НЕ ПРИЕХАЛ: на снимке бандла ярусы те же и предложений столько же. Это ответ на
//        вопрос §11 плана — заполняет ли `bundleItem` поле `machines` у работ режима `fixed`.
//        Заполняет: без этого выборка по машинке вернула бы пусто и панель показала бы пустые
//        кнопки вместо честного «каталог не приехал»;
//   ЦМЕНЬШЕ — ЗАПИСЬ СКАЗАЛА МЕНЬШЕ, А НЕ БОЛЬШЕ (дефект 1 ревью шва R7). Шаг без глагола и
//        машинный шаг без машинки получали ЯРУС КАТАЛОГА — тот самый, чья фраза утверждает «запись
//        говорит больше, чем каталог умеет назвать», то есть на этих двух формах ОБРАТНОЕ ИСТИНЕ.
//        Теперь у каждого молчания свой ярус, а `catalog-gap` остался за случаями, где человек
//        ОТВЕТИЛ (подгибка вдвое, снятая работа);
//   ЦЗАМЕТКА — ЗАМЕТКА ШАГА В ФАКТАХ ЗАПИСИ НЕ СТОИТ ВОВСЕ. Панель рисует её своим узлом, и стоя
//        ещё и здесь она печаталась на строке ДВАЖДЫ. Цитата полнострочная: факты F6 названы
//        целиком, а не проверены на «содержит».
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у step-name-probe): правка исходника
// ради проверки — это правка, которую однажды забудут откатить.
//   node scripts/operation-ratify-probe.mjs                       прогон
//   node scripts/operation-ratify-probe.mjs --mutate-tier-a-arity  у яруса A снята граница арности
//   node scripts/operation-ratify-probe.mjs --mutate-piece-prefix  «join / притачать» по префиксу
//                                                                 имени входа — ложный словарь
//   node scripts/operation-ratify-probe.mjs --mutate-slit-warn     у прорези пустое предупреждение
//   node scripts/operation-ratify-probe.mjs --mutate-press-picker  у панели СВОЙ пикер приёма ВТО
//   node scripts/operation-ratify-probe.mjs --mutate-printed-own   имя собирается заново, а не
//                                                                 спрашивается у двоекодья
//   node scripts/operation-ratify-probe.mjs --mutate-gap-dump      оба молчания записи снова валятся
//                                                                 в ярус каталога
//   node scripts/operation-ratify-probe.mjs --mutate-note-twice    заметка шага вернулась в факты
//                                                                 записи (и печатается дважды)
//
// ИМЯ ФЛАГА ПРОВЕРЯЕТСЯ, А НЕ УГАДЫВАЕТСЯ: любое `--mutate…` вне списка роняет прогон с кодом 2 и
// словами «проба НЕ ЗАПУСКАЛАСЬ». Зелёный прогон с несуществующим флагом — худший из возможных
// исходов: он ВЫГЛЯДИТ доказательством и им не является, потому что мутации не было вовсе.
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui) — все откатаны:
//   --mutate-tier-a-arity → 4 провала, все на F3. Это план М1, и в плане он назван ПОЛОВИНОЙ,
//                     которой ярус не гейтится: «производит узел» — ФАКТ ЗАПИСИ, стоящий в
//                     `evidence`, а границу яруса держит АРНОСТЬ ВХОДОВ. Дополнительность замерена
//                     (80 строк с двумя и более входами, 79 производят узел, ни одна строка с
//                     одним входом не производит), поэтому снятие «производит узел» не покраснело
//                     бы НИЧЕМ — снята арность, и строка с одним входом получила «join» ровно так,
//                     как М1 это описывает. Два провала из четырёх — про ФАКТЫ: вместе с ярусом
//                     исчезает и строка «printed as …», то есть расхождение перестаёт быть
//                     названным ДВАЖДЫ, а не только перестаёт быть ярусом;
//   --mutate-piece-prefix → 19 провалов (план М7): работа различается по префиксу имени входа
//                     («PCK_… лежит на P_…, значит внакрой»), и на трёх строках яруса A остаётся
//                     ОДНА кнопка. У F8 выживает притачивание, у F9 и F10 — стачивание: то есть
//                     ложный словарь не «упрощает выбор», он ВЫБИРАЕТ ЗА ЧЕЛОВЕКА и на разных
//                     строках по-разному. Два провала из девятнадцати — в цитате «каталог не
//                     приехал», и это показание, что ярус собирается ОДНИМ кодом на оба каталога;
//   --mutate-slit-warn → 2 провала (план М4): прорезь предлагается молча, и человек узнаёт про
//                     обязательную длину на «Save», через три экрана от кнопки. Цитата «прорезь
//                     вообще предложена» при этом ЗЕЛЁНАЯ — половины разведены нарочно: потерять
//                     ПРЕДУПРЕЖДЕНИЕ и потерять КНОПКУ это разные отказы;
//   --mutate-press-picker → 4 провала (план М5): у панели завёлся свой пикер приёма ВТО. Провалы
//                     ровно те, которыми Ц5 и описана: предложения на строке ВТО перестали быть
//                     пустыми, пункт-состояние `G0` встало среди предложений, в предложениях
//                     оказался токен, которого каталог не знает вовсе, — и то же самое на снимке
//                     бандла;
//   --mutate-printed-own → 19 провалов (план М2 в его чистой половине): имя собирается из глагола
//                     с машинкой вместо того, чтобы спрашиваться у двоекодья. Двенадцать провалов
//                     — цитата ЦД, семь — те цитаты, где имя обязано СОВПАДАТЬ с ярлыком
//                     предложения или стоять в фактах. ЯРУСЫ И ПРЕДЛОЖЕНИЯ НЕ ШЕЛОХНУЛИСЬ, и это
//                     главное показание мутации: имя и классификация — два разных пути, и
//                     разошедшееся имя ловится ТОЛЬКО сверкой с органом. Две строки при этом
//                     ЗЕЛЁНЫЕ ПО ДЕЛУ: у F11 работа названа, и её имя даёт каталог, до которого
//                     мутация не достаёт; у F12 не записано ничего, и обе лестницы честно молчат.
//
// ⚠️ МУТАЦИЯ, ЛОМАЮЩАЯ СБОРКУ, — ЭТО ЛОЖНАЯ КРАСНОТА И НЕ ЗАСЧИТЫВАЕТСЯ. Каждая из пяти собралась
// и упала НА ЦИТАТЕ, с напечатанным `КРАСНАЯ: N` и ненулевым числом строк FAIL. Код возврата
// вердиктом не является: считаются ПРОВАЛЫ. Обратный случай проверен на себе: мутации, потерявшей
// свою строку в исходнике, сборщик отказывает — прогон печатает «НЕ ЗАПУСКАЛАСЬ», даёт код 2 и
// НОЛЬ строк FAIL. Ноль провалов при коде 1 в этой пробе означал бы поломку, а не поимку.

// ── ТРИ КОДА ВОЗВРАТА, И ТРЕТИЙ — НЕ ОТТЕНОК КРАСНОГО ───────────────────────────────────────────
//
//   0 — ЗЕЛЁНАЯ
//   1 — КРАСНАЯ: N        поймано ПОВЕДЕНИЕ, вердикт напечатан
//   2 — НЕ ЗАПУСКАЛАСЬ    неизвестный флаг ЛИБО прогон умер до вердикта
//
// ЗАЧЕМ ТРЕТИЙ (контракт взят у step-name-probe, где он и доказан). «Мутация сломала СБОРКУ, а не
// поведение» — отдельный отказ, и без этого сторожа он неотличим от пойманного дефекта: прогон
// падает стеком и даёт `exit 1` при НУЛЕ строк FAIL. Отличить можно было бы только вниманием, а
// его на двадцатом прогоне не остаётся.
const dieNotRun = (why) => {
  console.log(`\nпроба НЕ ЗАПУСКАЛАСЬ: ${why}`);
  console.log('зелёный ИЛИ красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_TIER_A_ARITY = process.argv.includes('--mutate-tier-a-arity');
const MUTATE_PIECE_PREFIX = process.argv.includes('--mutate-piece-prefix');
const MUTATE_SLIT_WARN = process.argv.includes('--mutate-slit-warn');
const MUTATE_PRESS_PICKER = process.argv.includes('--mutate-press-picker');
const MUTATE_PRINTED_OWN = process.argv.includes('--mutate-printed-own');
const MUTATE_GAP_DUMP = process.argv.includes('--mutate-gap-dump');
const MUTATE_NOTE_TWICE = process.argv.includes('--mutate-note-twice');

const KNOWN_MUTATIONS = new Set([
  '--mutate-tier-a-arity',
  '--mutate-piece-prefix',
  '--mutate-slit-warn',
  '--mutate-press-picker',
  '--mutate-printed-own',
  '--mutate-gap-dump',
  '--mutate-note-twice',
]);
const stray = process.argv
  .slice(2)
  .find((a) => a.startsWith('--mutate') && !KNOWN_MUTATIONS.has(a));
if (stray) {
  console.error(
    `НЕИЗВЕСТНЫЙ ФЛАГ МУТАЦИИ: ${stray}\n` +
      `проба НЕ ЗАПУСКАЛАСЬ — зелёный прогон с таким флагом ничего не доказывал бы.\n` +
      `известные: ${[...KNOWN_MUTATIONS].join(', ')}`,
  );
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── МУТАЦИИ ────────────────────────────────────────────────────────────────────────────────────

const ARITY_FIX = `  const joinable = inputs >= 2;`;
const ARITY_BROKEN = `  const joinable = inputs >= 0;`;

const PREFIX_FIX = `  if (kind?.id === DUMP_KIND_ID) return joinable ? joinTier(catalog) : silent('contradiction');`;
const PREFIX_BROKEN = `  if (kind?.id === DUMP_KIND_ID) {
    if (!joinable) return silent('contradiction');
    const lapped = (step.inputKeys ?? []).some((k) => /^p-(PCK|Pocket|plank)/i.test(k));
    const both = joinTier(catalog);
    return { tier: 'join', proposals: [both.proposals[lapped ? 1 : 0]] };
  }`;

const WARN_FIX = `  if (item.token === SLIT_OVERCAST_WORK) out.warn = SLIT_WARN;`;
const WARN_BROKEN = `  if (item.token === SLIT_OVERCAST_WORK) out.warn = '';`;

const PRESS_FIX = `  if (kind?.stateOnly) return silent('press-action-missing');`;
const PRESS_BROKEN = `  if (kind?.stateOnly)
    return {
      tier: 'press-action-missing',
      proposals: [
        { token: '', label: 'Press (action not recorded)' },
        { token: 'press_flat', label: 'Press flat' },
      ],
    };`;

const PRINTED_FIX = `  const kind = kindOf(step);
  return kind ? kindLabelOf(kind) : '';`;
const PRINTED_BROKEN = `  const verb = (step.operationType ?? '').replace('TECH_CARD_OPERATION_TYPE_', '');
  const machine = (step.machineType ?? '').replace('TECH_CARD_MACHINE_TYPE_', '');
  return [verb, machine].filter((s) => s && !s.endsWith('UNKNOWN')).join(' / ').toLowerCase();`;

// СВАЛКА ВЕРНУЛАСЬ: оба МОЛЧАНИЯ ЗАПИСИ снова получают ярус КАТАЛОГА — и вместе с ним фразу,
// которая на них утверждает обратное истине. Мутация правит ДВЕ строки одной правкой: разведены эти
// два молчания были одним решением, и сторожить их порознь значило бы пропустить возврат половины.
const GAP_VERB_FIX = `  if (unset(verb)) return silent('verb-missing');`;
const GAP_VERB_BROKEN = `  if (unset(verb)) return silent('catalog-gap');`;
const GAP_MACHINE_FIX = `  if (unset(step.machineType)) return silent('machine-missing');`;
const GAP_MACHINE_BROKEN = `  if (unset(step.machineType)) return silent('catalog-gap');`;

// ЗАМЕТКА ВЕРНУЛАСЬ В ФАКТЫ ЗАПИСИ. Панель рисует её своим узлом из формы, поэтому на строке она
// оказывается напечатанной ДВАЖДЫ. Здесь, в чистой половине, ловится первая из двух копий.
const NOTE_FIX = `  const zone = zoneLabel(step.zone as common_TechCardGarmentZone);
  if (zone) out.push(\`zone: \${zone}\`);`;
const NOTE_BROKEN = `  const zone = zoneLabel(step.zone as common_TechCardGarmentZone);
  if (zone) out.push(\`zone: \${zone}\`);
  const note = ((step as { note?: string }).note ?? '').trim().split('\\n')[0] ?? '';
  if (note.trim()) out.push(\`note: \${note.trim()}\`);`;

// Мутация, не нашедшая своей строки, РОНЯЕТ СБОРКУ — то есть даёт код 2 «не запускалась», а не
// зелёный прогон без мутации. Это тот же сторож, что и проверка имени флага, только на второй
// половине пути: флаг может быть правильным, а исходник — уехать под ним.
const patcher = (...pairs) => ({
  name: 'ratify-mutation',
  setup(b) {
    b.onLoad({ filter: /operation-ratify\.ts$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [find, replaceWith] of pairs) {
        if (!src.includes(find)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(find, replaceWith);
      }
      return { contents: src, loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_TIER_A_ARITY) plugins.push(patcher([ARITY_FIX, ARITY_BROKEN]));
if (MUTATE_PIECE_PREFIX) plugins.push(patcher([PREFIX_FIX, PREFIX_BROKEN]));
if (MUTATE_SLIT_WARN) plugins.push(patcher([WARN_FIX, WARN_BROKEN]));
if (MUTATE_PRESS_PICKER) plugins.push(patcher([PRESS_FIX, PRESS_BROKEN]));
if (MUTATE_PRINTED_OWN) plugins.push(patcher([PRINTED_FIX, PRINTED_BROKEN]));
if (MUTATE_GAP_DUMP)
  plugins.push(patcher([GAP_VERB_FIX, GAP_VERB_BROKEN], [GAP_MACHINE_FIX, GAP_MACHINE_BROKEN]));
if (MUTATE_NOTE_TWICE) plugins.push(patcher([NOTE_FIX, NOTE_BROKEN]));

const outfile = resolve(REPO, `scripts/.operation-ratify-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'operation-ratify-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
});
const {
  printedName,
  ratifyCard,
  worksForMachine,
  kindLabelOf,
  kindOf,
  seamClassLabel,
  OPERATION_KIND_BY_ID,
  BUNDLED_WORK_CATALOG,
  parseWorkCatalog,
} = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── ФИКСТУРА ОТВЕТА СЕРВЕРА ────────────────────────────────────────────────────────────────────
//
// СНИМОК ОТВЕТА, А НЕ ВТОРОЙ КАТАЛОГ. Токены, ярлыки и пары «работа × машинка» взяты из сидов
// 0329/0331 — тех самых, что приедут с беты, — но список НАРОЧНО короткий: проба про ЯРУС, а не
// про полноту словаря (её стережёт `work-picker-probe`, читающий сами миграции).
//
// ЧЕТЫРЕ РАБОТЫ НА ПРЯМОСТРОЧКЕ ЗДЕСЬ НУЖНЫ ОСОБО. Каталог допускает на ней `join_lockstitch`,
// `topstitch`, `attach_label` и `moscow_hem`, и если бы прямострочка уходила в общую ветку «всё,
// что допускает машинка», на восьмидесяти строках выросли бы четыре кнопки. Ярус A и расхождение
// эту ветку перехватывают — и фикстура обязана давать выборке ЧЕТЫРЕ, чтобы перехват что-то значил.
const CATALOG = parseWorkCatalog({
  works: [
    {
      token: 'join_lockstitch',
      verb: 'machine',
      stage: 'join_seam',
      // 0331 §5: токен не тронут, ярлык переименован — «Join — lockstitch» врал бы на оверлоке.
      label: 'Join / seam',
      machineMode: 'fixed',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch'],
      syn: ['стачать', 'соединить', 'join'],
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
      machines: [
        'lockstitch',
        'lockstitch_double_needle',
        'chainstitch',
        'coverstitch',
        'handstitch_imitation',
      ],
      syn: ['отстрочка', 'topstitch'],
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
      syn: ['оверлок', 'обметать'],
      sort: 30,
      retired: false,
    },
    {
      token: 'zigzag',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Zigzag',
      machineMode: 'fixed',
      defaultMachine: 'zigzag',
      machines: ['zigzag'],
      syn: ['зигзаг'],
      sort: 80,
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
      syn: ['московский', 'moscow'],
      sort: 75,
      retired: false,
    },
    {
      // СНЯТАЯ РАБОТА (0331: ложное слияние сборки с посадкой) — и она ЕДИНСТВЕННАЯ на своей
      // машинке. Ради этого и стоит в фикстуре: выборка по машинке обязана вернуть пусто.
      token: 'gather_ease',
      verb: 'machine',
      stage: 'join_seam',
      label: 'Gather / ease',
      machineMode: 'fixed',
      defaultMachine: 'gathering',
      machines: ['gathering'],
      syn: ['сборка'],
      sort: 140,
      retired: true,
    },
    {
      token: 'attach_label',
      verb: 'machine',
      stage: 'finishing',
      label: 'Attach label',
      machineMode: 'fixed',
      defaultMachine: 'lockstitch',
      machines: ['lockstitch'],
      syn: ['этикетка'],
      sort: 150,
      retired: false,
    },
    {
      token: 'slit_overcast',
      verb: 'machine',
      stage: 'closures',
      label: 'Slit — overcast',
      machineMode: 'ask',
      defaultMachine: 'zigzag',
      machines: ['zigzag', 'buttonhole'],
      syn: ['прорезь', 'разрез'],
      sort: 165,
      retired: false,
    },
    {
      // РАБОТА ФУРНИТУРЫ — ради ВИДОВ СТРОК BOM: пункт `F1` опознаётся родом привязанной строки
      // BOM, и это единственное место контракта, где `bomKinds` читаются вовсе. Здесь она стоит
      // ради того же, ради чего стоит там: ДВЕ ПРОБЫ ОБЯЗАНЫ ДЕРЖАТЬ ОДИН КАТАЛОГ. Разошедшись
      // фикстурой, они спорили бы друг с другом.
      token: 'snap_press_stud',
      verb: 'hardware_set',
      stage: 'closures',
      label: 'Snap / press stud',
      machineMode: 'none',
      defaultMachine: '',
      machines: [],
      syn: ['кнопка'],
      sort: 200,
      retired: false,
    },
    {
      token: 'press_open',
      verb: 'press_open',
      stage: 'pressing',
      label: 'Press open',
      machineMode: 'none',
      defaultMachine: '',
      machines: [],
      syn: ['разутюжить'],
      sort: 330,
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
      syn: ['приутюжить'],
      sort: 340,
      retired: false,
    },
  ],
  defaults: [],
  defaultFields: [],
  smvHints: [],
});
if (!CATALOG) dieNotRun('фикстура каталога не разобралась — стенда нет');

const FIXTURE = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures/operation-ratify-prod-2026-08-22.json'), 'utf8'),
);
const STEPS = FIXTURE.steps;
const rows = ratifyCard(STEPS, CATALOG);
const at = (name) => rows[STEPS.findIndex((s) => s.name.startsWith(name))];
const G0_LABEL = OPERATION_KIND_BY_ID.get('G0').label;
const LAPPED = 'TECH_CARD_SEAM_CLASS_LS_LAPPED';
const SLIT_WARN = 'requires the slit length before the card can be saved';

console.log(
  `фикстура: ${STEPS.length} строк · каталог: ${CATALOG.items.length} работ (${CATALOG.source})`,
);

// ─── Ц1: ЯРУС A — ДВЕ КНОПКИ, И ВТОРАЯ ЭТО КЛАСС ШВА, А НЕ ВТОРОЙ ТОКЕН ─────────────────────────
head('Ц1 · два и более входа на прямострочке → ярус join, ДВА предложения');
for (const name of ['F8', 'F9', 'F10']) {
  const r = at(name);
  ck(r.tier === 'join', `${name}: ярус`, r.tier);
  ck(r.proposals.length === 2, `${name}: предложений ровно два`, String(r.proposals.length));
  const [first, second] = r.proposals;
  ck(first?.token === 'join_lockstitch', `${name}: первое — токен свалки`, String(first?.token));
  ck(first?.label === 'Join / seam', `${name}: первое — ЯРЛЫК КАТАЛОГА`, String(first?.label));
  ck(first?.extra === undefined, `${name}: первое пишет ОДИН факт`, JSON.stringify(first?.extra));
  ck(second?.token === 'join_lockstitch', `${name}: второе — ТОТ ЖЕ токен`, String(second?.token));
  ck(
    second?.extra?.field === 'seamClass' && second?.extra?.value === LAPPED,
    `${name}: второе довешивает класс шва LS_LAPPED`,
    JSON.stringify(second?.extra),
  );
  ck(
    second?.label === 'Join / seam · LS — lapped / topstitched',
    `${name}: подпись второго — ДВЕ существующие подписи`,
    String(second?.label),
  );
  ck(String(second?.label).includes('lapped'), `${name}: и в ней слово «lapped»`);
}
ck(
  at('F8').printedNow === 'Join — lockstitch',
  'F8: карточка печатает свалочное имя СЕГОДНЯ',
  at('F8').printedNow,
);
ck(
  at('F8').evidence[0] === '2 inputs · produces unit "LEft front panel with pockets"',
  'F8: факты записи — арность И произведённый узел',
  at('F8').evidence[0],
);
ck(
  at('F9').evidence[0] === '3 inputs · produces unit "Back panel with sides and yoke"',
  'F9: три входа',
  at('F9').evidence[0],
);
ck(at('F10').evidence[0] === '4 inputs · produces unit "SHELL"', 'F10: четыре входа', at('F10').evidence[0]);

// ─── Ц2: РАТИФИКАЦИЯ, КОТОРАЯ НЕ МЕНЯЕТ В ИМЕНИ НИЧЕГО ─────────────────────────────────────────
head('Ц2 · класс шва os_topstitch → одно предложение, и имя УЖЕ такое');
{
  const r = at('F4');
  ck(r.tier === 'ratify-derived', 'F4: ярус', r.tier);
  ck(r.proposals.length === 1, 'F4: предложение РОВНО одно', String(r.proposals.length));
  ck(r.proposals[0]?.token === 'topstitch', 'F4: токен', String(r.proposals[0]?.token));
  ck(r.proposals[0]?.label === 'Topstitch', 'F4: ярлык', String(r.proposals[0]?.label));
  ck(r.printedNow === 'Topstitch', 'F4: карточка ПЕЧАТАЕТ это имя сегодня', r.printedNow);
  ck(
    r.printedNow === r.proposals[0]?.label,
    'F4: нажатие не добавляет ни одного факта, только записывает напечатанное',
  );
  ck(
    r.evidence.includes('seam class: OS — ornamental topstitch'),
    'F4: класс шва стоит в фактах своей подписью',
    r.evidence.join(' | '),
  );
}

// ─── Ц3: ДЫРА КАТАЛОГА — ЭКРАН ПОКАЗЫВАЕТ И МОЛЧИТ ─────────────────────────────────────────────
head('Ц3 · класс шва ef_hem_turned → работы в каталоге НЕТ');
{
  const r = at('F5');
  ck(r.tier === 'catalog-gap', 'F5: ярус', r.tier);
  ck(r.proposals.length === 0, 'F5: предложений НОЛЬ', String(r.proposals.length));
  ck(
    r.evidence.includes('seam class: EF — hem, turned twice'),
    'F5: класс шва назван подписью словаря',
    r.evidence.join(' | '),
  );
  ck(
    r.evidence.some((e) => e === `seam class: ${seamClassLabel(STEPS[4].seamClass)}`),
    'F5: и это ТА ЖЕ подпись, что даёт словарь клиента',
  );
}

// ─── Ц4: РАСХОЖДЕНИЕ — ОБЕ ПОЛОВИНЫ В ФАКТАХ ───────────────────────────────────────────────────
head('Ц4 · один вход на прямострочке → соединять НЕ С ЧЕМ');
{
  const r = at('F3');
  ck(r.tier === 'contradiction', 'F3: ярус', r.tier);
  ck(r.proposals.length === 0, 'F3: предложений НОЛЬ', String(r.proposals.length));
  ck(
    r.evidence[0] === 'printed as "Join — lockstitch"',
    'F3: первая половина — напечатанное имя',
    r.evidence[0],
  );
  ck(r.evidence[1] === '1 input', 'F3: вторая половина — «один вход»', r.evidence[1]);
}

// ─── Ц5: ВТО БЕЗ ПРИЁМА — И ПУНКТ-СОСТОЯНИЕ НЕ ПРЕДЛАГАЕТСЯ НИКОМУ ─────────────────────────────
head('Ц5 · ВТО без записанного приёма → недостающий факт живёт на своём контроле');
{
  const r = at('F2');
  ck(r.tier === 'press-action-missing', 'F2: ярус', r.tier);
  ck(r.proposals.length === 0, 'F2: предложений НОЛЬ', String(r.proposals.length));
  ck(r.printedNow === G0_LABEL, 'F2: карточка печатает пункт-состояние', r.printedNow);
  const all = rows.flatMap((x) => x.proposals);
  ck(
    !all.some((p) => p.label === G0_LABEL),
    'G0 не встречается среди предложений НИ НА ОДНОЙ строке',
    all.map((p) => p.label).join(' | '),
  );
  ck(
    all.every((p) => !!p.token && CATALOG.byToken.has(p.token)),
    'и каждое предложение — работа, КОТОРУЮ ЗНАЕТ КАТАЛОГ',
    all.map((p) => p.token).join(' | '),
  );
}

// ─── Ц6: ЗИГЗАГ — ДВЕ РАБОТЫ КАТАЛОГА, И ОДНА ИЗ НИХ ГОВОРИТ ПРО ДЛИНУ ─────────────────────────
head('Ц6 · зигзаг → две работы машинки, у прорези непустое предупреждение');
{
  const r = at('F7');
  ck(r.tier === 'ratify-derived', 'F7: ярус', r.tier);
  ck(r.proposals.length === 2, 'F7: предложений два', String(r.proposals.length));
  ck(r.proposals[0]?.token === 'zigzag', 'F7: первое — zigzag', String(r.proposals[0]?.token));
  ck(
    r.proposals[1]?.token === 'slit_overcast',
    'F7: второе — slit_overcast',
    String(r.proposals[1]?.token),
  );
  ck(r.proposals[1]?.label === 'Slit — overcast', 'F7: ярлык прорези', String(r.proposals[1]?.label));
  ck(
    typeof r.proposals[1]?.warn === 'string' && r.proposals[1].warn.length > 0,
    'F7: предупреждение НЕПУСТОЕ',
    String(r.proposals[1]?.warn),
  );
  ck(r.proposals[1]?.warn === SLIT_WARN, 'F7: и говорит про длину СЛОВОМ', String(r.proposals[1]?.warn));
  ck(r.proposals[0]?.warn === undefined, 'F7: у зигзага предупреждения нет', String(r.proposals[0]?.warn));
}

// ─── Ц7: ОВЕРЛОК ───────────────────────────────────────────────────────────────────────────────
head('Ц7 · оверлок → единственная работа этой машинки');
{
  const r = at('F6');
  ck(r.tier === 'ratify-derived', 'F6: ярус', r.tier);
  ck(r.proposals.length === 1, 'F6: предложение одно', String(r.proposals.length));
  ck(r.proposals[0]?.token === 'overlock_serge', 'F6: токен', String(r.proposals[0]?.token));
  ck(r.printedNow === 'Overlock / serge', 'F6: карточка печатает то же', r.printedNow);
  ck(r.evidence.includes('zone: pocket'), 'F6: зона стоит в фактах', r.evidence.join(' | '));
}

// ─── ЦЗАМЕТКА: ЗАМЕТКА ШАГА В ФАКТАХ ЗАПИСИ НЕ СТОИТ ВОВСЕ ────────────────────────────────────
//
// ЦИТАТА ПОЛНОСТРОЧНАЯ, А НЕ «НЕ СОДЕРЖИТ». `includes`-проверка отсутствия зеленела бы и от
// опечатки в ожидаемом тексте; здесь названы ВСЕ факты обеих строк с заметкой, и лишний элемент
// покраснеет, каким бы словом он ни был.
head('ЦЗАМЕТКА · заметку печатает панель своим узлом — в фактах записи её нет');
{
  ck(
    at('F6').evidence.join(' | ') === '1 input | zone: pocket',
    'F6 (note: join pockets): факты целиком',
    at('F6').evidence.join(' | '),
  );
  ck(
    at('F8').evidence.join(' | ') ===
      '2 inputs · produces unit "LEft front panel with pockets" | zone: pocket',
    'F8 (та же заметка, другой ярус): факты целиком',
    at('F8').evidence.join(' | '),
  );
  // ЖИВОСТЬ ЦИТАТЫ: у обеих строк заметка в фикстуре ЕСТЬ. Без этого «заметки в фактах нет» было бы
  // зеленью над пустой популяцией — сторожем у строки, которой нечего было бы напечатать.
  const withNote = STEPS.filter((s) => (s.note ?? '').trim()).map((s) => s.name.split(' ·')[0]);
  ck(
    withNote.join(',') === 'F6,F8',
    'и заметка у этих двух строк в фикстуре записана — сторожить есть что',
    withNote.join(','),
  );
}

// ─── Ц8: РАБОТА УЖЕ ЗАПИСАНА ───────────────────────────────────────────────────────────────────
head('Ц8 · работа записана → ратифицировать нечего');
{
  const r = at('F11');
  ck(r.tier === 'named', 'F11: ярус', r.tier);
  ck(r.proposals.length === 0, 'F11: предложений НОЛЬ', String(r.proposals.length));
  ck(r.printedNow === 'Press open', 'F11: имя — ярлык каталога', r.printedNow);
}

// ─── Ц9: АНТИ-ЛОЖНАЯ — ПУСТЫЕ ДАННЫЕ НЕ РОЖДАЮТ НИЧЕГО ────────────────────────────────────────
head('Ц9 · ни входов, ни класса шва → НИЧЕГО');
for (const name of ['F1', 'F12']) {
  const r = at(name);
  ck(r.tier === 'no-inputs', `${name}: ярус`, r.tier);
  ck(r.proposals.length === 0, `${name}: предложений НОЛЬ`, String(r.proposals.length));
  ck(r.evidence[0] === 'no inputs recorded', `${name}: факт назван словом`, r.evidence[0]);
}

// ─── ЦМЕНЬШЕ: МОЛЧАНИЕ ЗАПИСИ ≠ ДЫРА КАТАЛОГА ────────────────────────────────────────────────
//
// Ярус `catalog-gap` собирал ПЯТЬ разных молчаний, а панель давала ему ОДНУ фразу — «the record says
// more than the catalogue has a job for». На двух достижимых формах эта фраза утверждает ОБРАТНОЕ
// истине: запись сказала не больше, а МЕНЬШЕ. Достижимость обычная: новый шаг рождается с
// `operationType = NONE_OP_TYPE`, деталь кладётся броском по рельсу — «добавил операцию → бросил
// деталь → открыл панель».
head('ЦМЕНЬШЕ · глагол не назван и машинка не названа — это МОЛЧАНИЕ ЗАПИСИ, а не дыра каталога');
{
  const noVerb = at('F15');
  ck(noVerb.tier === 'verb-missing', 'F15: глагол не назван → свой ярус', noVerb.tier);
  ck(noVerb.proposals.length === 0, 'F15: предложений НОЛЬ', String(noVerb.proposals.length));
  ck(noVerb.evidence.join(' | ') === '1 input', 'F15: факты целиком', noVerb.evidence.join(' | '));
  ck(noVerb.printedNow === '', 'F15: и печатать нечего — резолв тоже молчит', `«${noVerb.printedNow}»`);

  const noMachine = at('F16');
  ck(noMachine.tier === 'machine-missing', 'F16: MACHINE без машинки → свой ярус', noMachine.tier);
  ck(noMachine.proposals.length === 0, 'F16: предложений НОЛЬ', String(noMachine.proposals.length));
  ck(
    noMachine.evidence.join(' | ') === '2 inputs | zone: front',
    'F16: факты целиком — и арности двух входов НЕ хватило, чтобы предложить «join»',
    noMachine.evidence.join(' | '),
  );

  // ЯРУС КАТАЛОГА ОСТАЛСЯ ЗА КАТАЛОГОМ — и это вторая половина цитаты: разведение не имело бы
  // смысла, если бы `catalog-gap` опустел. На обеих оставшихся формах человек ОТВЕТИЛ (класс шва
  // «подгиб вдвое»; машинка, единственная работа которой снята), и добавить ему нечего.
  ck(at('F5').tier === 'catalog-gap', 'F5: подгибка вдвое — по-прежнему дыра каталога', at('F5').tier);
  ck(at('F13').tier === 'catalog-gap', 'F13: снятая работа — тоже', at('F13').tier);
  const gaps = rows
    .map((r, i) => [r.tier, STEPS[i].name.split(' ·')[0]])
    .filter(([t]) => t === 'catalog-gap')
    .map(([, n]) => n);
  ck(
    gaps.join(',') === 'F5,F13',
    'и БОЛЬШЕ НИ ОДНА строка фикстуры в этот ярус не попадает',
    gaps.join(','),
  );
}

// ─── ЦД: ДВОЕКОДЬЕ — ИМЯ СПРОШЕНО, А НЕ СОБРАНО ───────────────────────────────────────────────
head('ЦД · printedNow каждой строки = ответ двоекодья, спрошенный НЕЗАВИСИМО');
for (const [i, s] of STEPS.entries()) {
  // Вторая редакция лестницы, собранная в пробе ИЗ ТЕХ ЖЕ ОРГАНОВ: работа названа — ярлык
  // каталога, не названа — подпись пункта резолва. Классификатор, собравший имя из соседних
  // полей, разойдётся здесь на первой же строке.
  const token = (s.work ?? '').trim();
  const expected = token
    ? (CATALOG.byToken.get(token)?.label ?? token)
    : (() => {
        const k = kindOf(s);
        return k ? kindLabelOf(k) : '';
      })();
  const same = rows[i].printedNow === expected;
  ck(same, `${s.name.split(' ·')[0]}: имя`, same ? rows[i].printedNow : `${rows[i].printedNow} ≠ ${expected}`);
}
ck(
  printedName(CATALOG, STEPS[7]) === rows[7].printedNow,
  'и та же функция отвечает то же самое, вызванная в одиночку',
);

// ─── ЦР: СНЯТАЯ РАБОТА НЕ ПРЕДЛАГАЕТСЯ ДАЖЕ ЕДИНСТВЕННОЙ НА МАШИНКЕ ───────────────────────────
head('ЦР · retired работа: сервер её никому не предлагает, и кнопка это ЗАПИСЬ');
{
  const r = at('F13');
  ck(r.tier === 'catalog-gap', 'F13: ярус', r.tier);
  ck(r.proposals.length === 0, 'F13: предложений НОЛЬ', String(r.proposals.length));
  ck(
    worksForMachine(CATALOG, 'TECH_CARD_MACHINE_TYPE_GATHERING').length === 0,
    'выборка по машинке снятую работу не возвращает',
  );
  ck(
    CATALOG.byToken.has('gather_ease'),
    'но каталог её ЗНАЕТ: шаг, который её несёт, обязан открываться и зваться своим ярлыком',
  );
}

// ─── ЦБ: ЗАПИСЬ, ОТВЕЧАЮЩАЯ СВЕРХ ДВУХ ОСЕЙ, БЬЁТ АРНОСТЬ ────────────────────────────────────
head('ЦБ · назван шов этикетки — работа названа ЗАПИСЬЮ, а не выведена из числа входов');
{
  const r = at('F14');
  ck(r.tier === 'ratify-derived', 'F14: ярус (а не join, хотя входов два)', r.tier);
  ck(r.proposals.length === 1, 'F14: предложение одно', String(r.proposals.length));
  ck(r.proposals[0]?.token === 'attach_label', 'F14: токен', String(r.proposals[0]?.token));
  ck(r.printedNow === 'Attach label', 'F14: и карточка печатает то же', r.printedNow);
}

// ─── ЦК: КАТАЛОГ НЕ ПРИЕХАЛ ──────────────────────────────────────────────────────────────────
//
// ВОПРОС §11 ПЛАНА: заполняет ли снимок бандла поле `machines` у работ режима `fixed`. Если нет —
// выборка по машинке при отказе каталога вернула бы пусто, и панель показала бы не «каталог не
// приехал», а ровные пустые ярусы, неотличимые от честной дыры.
head('ЦК · снимок бандла: ярусы те же, предложений столько же');
{
  const off = ratifyCard(STEPS, BUNDLED_WORK_CATALOG);
  const offAt = (name) => off[STEPS.findIndex((s) => s.name.startsWith(name))];
  ck(BUNDLED_WORK_CATALOG.source === 'bundle', 'стенд взял именно снимок', BUNDLED_WORK_CATALOG.source);
  ck(offAt('F8').tier === 'join' && offAt('F8').proposals.length === 2, 'F8: ярус A цел');
  ck(
    offAt('F8').proposals[0].label === 'Join / seam',
    'F8: и ярлык свалки в снимке тот же, что в каталоге',
    offAt('F8').proposals[0].label,
  );
  ck(
    offAt('F6').proposals.length === 1 && offAt('F6').proposals[0].token === 'overlock_serge',
    'F6: у работы режима fixed есть машинка — выборка её находит',
    offAt('F6').proposals.map((p) => p.token).join(' | '),
  );
  ck(
    offAt('F7').proposals.map((p) => p.token).join('|') === 'zigzag|slit_overcast',
    'F7: обе работы зигзага доехали (одна выведена, вторая — дельта 0331)',
    offAt('F7').proposals.map((p) => p.token).join(' | '),
  );
  ck(offAt('F2').proposals.length === 0, 'F2: ВТО без приёма молчит и без каталога');
  ck(offAt('F5').proposals.length === 0, 'F5: дыра каталога остаётся дырой');
}

console.log(`\n${bad === 0 ? 'ЗЕЛЁНАЯ' : `КРАСНАЯ: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
