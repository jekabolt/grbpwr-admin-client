#!/usr/bin/env node
// ВЫБОР РАБОТЫ ПИШЕТ РОВНО ТО ЖЕ, ЧТО ПИСАЛ ДО ЭКСТРАКЦИИ ЕДИНСТВЕННОГО ПИСАТЕЛЯ, — И ЭТО
// ИЗМЕРЕНО, А НЕ ЗАЯВЛЕНО.
//
// ЧТО ЗДЕСЬ ДОКАЗЫВАЕТСЯ И ПОЧЕМУ ОБЫЧНОЙ ПРОБЫ ДЛЯ ЭТОГО МАЛО. Кусок R7-Б не добавляет поведения:
// он ВЫНОСИТ середину `applyWork` из редактора шага в `workApplication`, чтобы у правила стало два
// вызывателя вместо одного. Утверждение «поведение не изменилось ни на байт» цитатой о ПОСЛЕ не
// проверяется вовсе: любая цитата, написанная после правки, описывает то, что получилось, и
// молчит о том, что было. Нужна пара ДО/ПОСЛЕ, и обе половины обязаны быть ИЗМЕРЕНИЯМИ.
//
// КАК ОНА ЗДЕСЬ ПОСТРОЕНА. Проба собирает ОДИН И ТОТ ЖЕ стенд (`operation-work-apply-dom-entry.tsx`)
// ДВАЖДЫ: из рабочего дерева и — при `--rebaseline` — из БЛОБОВ КОММИТА `a9ca7819`, последнего до
// этой правки. Подстановка делается на загрузке модулей (`git show <sha>:<путь>` вместо файла с
// диска), поэтому «до» — это не пересказ кода по памяти и не вторая копия функции, а САМО ДЕРЕВО
// ТОГО КОММИТА, прогнанное через тот же браузер и ту же батарею. Ответы обоих прогонов
// складываются в JSON и сравниваются ПОБАЙТНО (`scripts/fixtures/operation-work-apply-baseline.json`).
//
// Именно поэтому стенд не имеет права импортировать `workApplication`: базовый бандл собирается
// деревом, в котором такой функции ещё нет. Чистая половина живёт отдельной точкой входа.
//
// БАТАРЕЯ. Девять состояний шага × двенадцать работ каталога (§«СОСТОЯНИЯ» и §«КАТАЛОГ» ниже).
// Состояния подобраны так, чтобы каждая ветка писателя была пройдена НА САМОМ ДЕЛЕ, а не по
// намерению:
//   * пустой шаг, шаг на прямострочке, шаг на коверлоке, шаг на зигзаге — ось «на чём» и её
//     сохранение («смена работы не переставляет шаг на другую машину»);
//   * шаг с классом шва отстрочки — снятие ЧУЖОГО якоря; шаг с классом шва «внакрой» — НЕснятие
//     своего (резолв уже отвечает свалочным пунктом, снимать нечего);
//   * шаг с названным утюгом — ось ВТО, которая тоже держит ответ человека;
//   * шаг с УЖЕ СТОЯЩЕЙ ссылкой на профиль машинки и шаг со ссылкой на профиль ВТО — обе ветки
//     «в пустой ключ и только в пустой».
// Парк карточки собран так, чтобы обе ветки подбора профиля прошли ОБОИМИ ИСХОДАМИ: у зигзага
// профиль есть, но БЕЗ ключа (не считается); у оверлока профилей ДВА (связи нет); у прямострочки,
// коверлока и петельного — по одному (связь пишется). ВТО-профиль дублирования объявлен для
// ПРОЦЕССА «разутюжить» и потому не отвечает шагу дублирования — рядом стоит второй, отвечающий.
//
// ЧИСТАЯ ПОЛОВИНА (`workApplication` напрямую) проверяет ТРИ вещи, которых снимок формы не видит:
//   Ц-СНИМОК — вход, который проба даёт чистой функции, совпадает с тем, что ФОРМА держит на шаге
//              ДО нажатия. Без этого чистая половина проверяла бы согласие фикстуры с собой;
//   Ц-ТОЖДЕСТВО — снимок шага ДО нажатия, переписанный намерением чистой функции
//              (`writes` ∪ `clears` ∪ `links`), РАВЕН снимку ПОСЛЕ: ни одного поля сверх, ни одного
//              поля меньше. Каталог этой половины НАРОЧНО без дефолтов — тогда подстановка не пишет
//              ничего, и разница снимков это ровно ответ писателя. Шесть случаев тождеству НЕ
//              подчиняются — редактор правит записанное сам; список снят с ДОпра́вочного дерева и
//              лежит в слепке, см. комментарий у самой цитаты;
//   Ц-ДЕФОЛТЫ — ответ писателя ПОБАЙТНО ОДИНАКОВ на двух каталогах, различающихся ТОЛЬКО
//              дефолтами. Дефолты — предмет ОТДЕЛЬНОГО жеста (подстановка с меткой «подставлено»),
//              и панель ратификации не подставляет ничего вовсе.
//
// ── МУТАЦИИ (план §7: М3, М6, М8) ───────────────────────────────────────────────────────────────
//   node scripts/operation-work-apply-probe.mjs                          прогон
//   node scripts/operation-work-apply-probe.mjs --mutate-prefill         М3: применение пишет ещё и
//                                                                       дефолты работы
//   node scripts/operation-work-apply-probe.mjs --mutate-clear-anchor    М6: снятие класса шва стало
//                                                                       безусловным
//   node scripts/operation-work-apply-probe.mjs --mutate-ignore-machine  М8: стоящая на шаге машинка
//                                                                       игнорируется
//   node scripts/operation-work-apply-probe.mjs --rebaseline             ПЕРЕСНЯТЬ базовый слепок с
//                                                                       блобов коммита a9ca7819
//
// М3 РАСШИРЯЕТ ВХОД, И ЭТО НЕ ПОДДАВКИ, А САМА ОХРАНЯЕМАЯ ГРАНИЦА. Дефолты живут в КАТАЛОГЕ, а
// каталога чистая функция не получает вовсе — втащить подстановку внутрь можно ТОЛЬКО расширив её
// вход, и первый же автор панели сделает это ровно так. Поэтому мутация добавляет во вход
// необязательный `catalog` и читает его, а проба кладёт этот ключ в объект входа ВСЕГДА: чистая
// функция его игнорирует (ответы на двух каталогах совпадают), мутированная — нет.
//
// ИМЯ ФЛАГА ПРОВЕРЯЕТСЯ, А НЕ УГАДЫВАЕТСЯ: любое `--mutate…` вне списка роняет прогон с кодом 2.
// Зелёный прогон с несуществующим флагом — худший из возможных исходов: он ВЫГЛЯДИТ
// доказательством и им не является, потому что мутации не было вовсе.
//
// ⚠️ МУТАЦИЯ, ЛОМАЮЩАЯ СБОРКУ, — ЛОЖНАЯ КРАСНОТА И НЕ ЗАСЧИТЫВАЕТСЯ. Каждая обязана собраться и
// упасть НА ЦИТАТЕ, с напечатанным `КРАСНАЯ: N` и ненулевым числом строк FAIL. Код возврата
// вердиктом не является: считаются ПРОВАЛЫ.
//
// ЗАМЕРЕНО (2026-08-22, ветка feat/operation-kinds-ui) — все три откатаны, все три собрались:
//   --mutate-prefill        → 1 провал (план М3): дефолты работы просочились в `writes`, и ответ
//                     писателя на двух каталогах разошёлся в 36 случаях из 108 — отступ 10 у
//                     стачивания, отстрочка 6 мм в два ряда, длина прорези 25, игла у приутюживания.
//                     Ц-РАВЕНСТВО при этом ЗЕЛЁНОЕ, и это не слабость, а показание: у СТРОКИ шага
//                     подстановка идёт вторым жестом сразу следом, находит поля уже заполненными и
//                     молчит — то есть форма приходит туда же. Дефект виден только у ВТОРОГО
//                     вызывателя, которого сегодня ещё нет, и поймать его можно ровно контрактом
//                     писателя. Ради этого цитата и отделена от снимка формы;
//   --mutate-clear-anchor   → 2 провала (план М6): Ц-РАВЕНСТВО (13 случаев из 99 — класс шва снят
//                     там, где обязан был устоять: `LS_LAPPED` у стачивания, `OS_TOPSTITCH` на
//                     шагах ВТО) и Ц-ЯКОРЬ («на шаге с классом внакрой свалочный пункт НЕ снимает
//                     ничего»). Половина «чужой якорь снимается» осталась ЗЕЛЁНОЙ — мутация
//                     расширяет снятие, а не убивает его, и цитата ловит именно расширение;
//   --mutate-ignore-machine → 3 провала (план М8): Ц-РАВЕНСТВО (2 случая — коверлок подменён
//                     прямострочкой вместе с профилем `CS-1` → `LS-1`, зигзаг подменён петельным)
//                     и обе половины Ц-МАШИНКИ. Два случая из девяноста девяти — это НЕ «мутация
//                     почти безвредна»: ровно в них шаг стоит на машинке, которую работа допускает,
//                     но своим дефолтом не называет, и потерять ответ человека можно только там.
//
// НЕИЗВЕСТНЫЙ ФЛАГ (`--mutate-nonesuch`) → код 2, НОЛЬ строк FAIL. Проверено отдельно: зелень без
// мутации и краснота без цитаты — два разных способа соврать, и оба закрыты третьим кодом.

// ── ТРИ КОДА ВОЗВРАТА, И ТРЕТИЙ — НЕ ОТТЕНОК КРАСНОГО ───────────────────────────────────────────
//
//   0 — ЗЕЛЁНАЯ
//   1 — КРАСНАЯ: N        поймано ПОВЕДЕНИЕ, вердикт напечатан
//   2 — НЕ ЗАПУСКАЛАСЬ    неизвестный флаг, нет стенда, ЛИБО прогон умер до вердикта
//
// ЗДЕСЬ У ТРЕТЬЕГО КОДА ЕСТЬ СВОЙ, ЧЕТВЁРТЫЙ ПОВОД, которого нет у соседей: базовый слепок снят
// под КОНКРЕТНУЮ батарею. Правка батареи без переснятия слепка сделала бы сравнение сравнением
// разных вопросов — поэтому слепок несёт отпечаток батареи, и при расхождении проба говорит «НЕ
// ЗАПУСКАЛАСЬ», а не «красная» и уж тем более не «зелёная».
const dieNotRun = (why) => {
  console.log(`\nпроба НЕ ЗАПУСКАЛАСЬ: ${why}`);
  console.log('зелёный ИЛИ красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_PREFILL = process.argv.includes('--mutate-prefill');
const MUTATE_CLEAR_ANCHOR = process.argv.includes('--mutate-clear-anchor');
const MUTATE_IGNORE_MACHINE = process.argv.includes('--mutate-ignore-machine');
const REBASELINE = process.argv.includes('--rebaseline');

const KNOWN_MUTATIONS = new Set([
  '--mutate-prefill',
  '--mutate-clear-anchor',
  '--mutate-ignore-machine',
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
const BASELINE_FILE = resolve(HERE, 'fixtures/operation-work-apply-baseline.json');

/**
 * КОММИТ, С КОТОРОГО СНЯТ БАЗОВЫЙ СЛЕПОК, — последний ДО экстракции писателя. Он пинуется здесь
 * навсегда: «до» обязано остаться воспроизводимым и через год, а `HEAD` уедет с первым же
 * коммитом этой ветки.
 */
const BASE_SHA = 'a9ca7819';

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── МУТАЦИИ: ПРАВЯТ БАНДЛ, А НЕ РЕПОЗИТОРИЙ ───────────────────────────────────────────────────
//
// Правка исходника ради проверки — это правка, которую однажды забудут откатить. Мутация, не
// нашедшая своей строки, РОНЯЕТ СБОРКУ, то есть даёт код 2 «не запускалась», а не зелёный прогон
// без мутации: флаг может быть правильным, а исходник — уехать под ним.

// М6 — БЕЗУСЛОВНОЕ СНЯТИЕ КЛАССА ШВА. Ровно то, чем `kindClears` НЕ является: она спрашивает
// резолв и снимает якорь только если снятие ДЕЙСТВИТЕЛЬНО делает выбранный пункт ответом. Мутация
// выкидывает обе проверки — и «шаг уже отвечает этим пунктом», и «снятие помогает».
const CLEAR_FIX = `  const answers = (id?: string) => !!id && (id === k.id || id === k.pendingResolve);
  if (answers(kindOf(step)?.id)) return out;
  for (const [field, empty] of KIND_ANCHOR_FIELDS) {
    // Пункт, который сам заявляет этот якорь, снимать его не может по построению.
    if (k.writes && field in k.writes) continue;
    const current = (step as Record<string, unknown>)[field];
    if (typeof current !== 'string' || NONE(current)) continue;
    if (answers(kindOf({ ...step, [field]: empty } as OperationKindStep)?.id)) {
      out[field] = empty;
      return out;
    }
  }`;
const CLEAR_BROKEN = `  for (const [field, empty] of KIND_ANCHOR_FIELDS) {
    if (k.writes && field in k.writes) continue;
    const current = (step as Record<string, unknown>)[field];
    if (typeof current !== 'string' || NONE(current)) continue;
    out[field] = empty;
    return out;
  }`;

// М8 — СТОЯЩАЯ НА ШАГЕ МАШИНКА ИГНОРИРУЕТСЯ. «Смена работы не переставляет шаг на другую машину»
// перестаёт быть правилом: работа режима `ask` уезжает на свой дефолт (или на профиль парка) с
// машинки, которую человек выбрал сам.
const MACHINE_FIX = `  const writes = workWrites(
    item,
    k,
    current.machineType ?? '',`;
const MACHINE_BROKEN = `  const writes = workWrites(
    item,
    k,
    '',`;

// М3 — ПРИМЕНЕНИЕ ПИШЕТ ЕЩЁ И ДЕФОЛТЫ РАБОТЫ. Вход расширяется необязательным каталогом — иначе
// дефолты сюда не втащить вовсе, и это ровно та граница, ради которой мутация написана.
const PREFILL_FIX = `  return { writes, clears, links };`;
const PREFILL_BROKEN = `  const bag = (input as { catalog?: WorkCatalog }).catalog;
  if (bag) {
    for (const d of workDefaultsForForm(bag, item.token, PREFILL_BLANKS)) {
      writes[d.field] = String(d.value);
    }
  }
  return { writes, clears, links };`;
// Пустые значения полей подстановки — тем же написанием, каким их держит строка формы.
const PREFILL_BLANKS_DECL = `const PREFILL_BLANKS: Record<string, unknown> = {
  topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN',
  topstitchWidthMm: '',
  topstitchRows: 0,
  needleCount: 0,
  seamAllowanceMm: '',
  cutLengthMm: '',
};
`;

const patcher = (name, filter, pairs, loader, prepend) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: (prepend ?? '') + src, loader };
    });
  },
});

const mutations = () => {
  const out = [];
  if (MUTATE_CLEAR_ANCHOR)
    out.push(
      patcher(
        'clear-anchor',
        /operation-kinds\.ts$/,
        [[CLEAR_FIX, CLEAR_BROKEN]],
        'ts',
      ),
    );
  if (MUTATE_IGNORE_MACHINE)
    out.push(
      patcher('ignore-machine', /operation-work\.ts$/, [[MACHINE_FIX, MACHINE_BROKEN]], 'ts'),
    );
  if (MUTATE_PREFILL)
    out.push(
      patcher(
        'prefill',
        /operation-work\.ts$/,
        [[PREFILL_FIX, PREFILL_BROKEN]],
        'ts',
        PREFILL_BLANKS_DECL,
      ),
    );
  return out;
};

// ─── ПОДСТАНОВКА ДЕРЕВА КОММИТА ────────────────────────────────────────────────────────────────
//
// НЕ ПЕРЕСКАЗ КОДА, А САМ КОД ТОГО КОММИТА. Плагин перехватывает загрузку КАЖДОГО модуля из `src/`
// и отдаёт содержимое блоба из `git show <sha>:<путь>`. Разрешение путей остаётся дисковым — набор
// файлов правкой не менялся, — а вот содержимое целиком приходит из истории. Стенд (`scripts/`)
// остаётся рабочего дерева: его в том коммите нет вовсе, и в этом весь приём.
const fromCommit = (sha) => ({
  name: 'tree-of-commit',
  setup(b) {
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
      const rel = relative(REPO, args.path);
      if (rel.startsWith('..') || !rel.startsWith('src/')) return null;
      const contents = execFileSync('git', ['show', `${sha}:${rel}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
});

// ─── СОСТОЯНИЯ ШАГА ────────────────────────────────────────────────────────────────────────────
const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PRESS_OPEN: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  FUSING: 'TECH_CARD_OPERATION_TYPE_FUSING',
  OP_UNSET: 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  COVERSTITCH: 'TECH_CARD_MACHINE_TYPE_COVERSTITCH',
  ZIGZAG: 'TECH_CARD_MACHINE_TYPE_ZIGZAG',
  OVERLOCK: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
  BUTTONHOLE: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
  GATHERING: 'TECH_CARD_MACHINE_TYPE_GATHERING',
  MACHINE_UNSET: 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  STEAMER: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
  FUSING_PRESS: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
  PRESS_UNSET: 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN',
  OS_TOPSTITCH: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
  LS_LAPPED: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
  SEAM_UNSET: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
  ATTACH_UNSET: 'TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN',
  COVERAGE_UNSET: 'TECH_CARD_INSPECT_COVERAGE_UNKNOWN',
  LABEL_UNSET: 'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN',
  ACTION_UNSET: 'TECH_CARD_PRESS_ACTION_UNKNOWN',
};

/** Поля, которыми ЖИВЁТ применение, — закрытый список, по которому строится вход чистой функции. */
const SNAPSHOT_FIELDS = [
  'operationType',
  'machineType',
  'pressEquipment',
  'seamClass',
  'attachMethod',
  'coverageMode',
  'labelAttachStitch',
  'pressAction',
  'machineProfileKey',
  'pressProfileKey',
];

const blankStep = () => ({
  operationType: T.OP_UNSET,
  machineType: T.MACHINE_UNSET,
  pressEquipment: T.PRESS_UNSET,
  seamClass: T.SEAM_UNSET,
  attachMethod: T.ATTACH_UNSET,
  coverageMode: T.COVERAGE_UNSET,
  labelAttachStitch: T.LABEL_UNSET,
  pressAction: T.ACTION_UNSET,
  machineProfileKey: '',
  pressProfileKey: '',
});

const STATES = [
  { key: 'S1-пустой', step: {} },
  { key: 'S2-прямострочка', step: { operationType: T.MACHINE, machineType: T.LOCKSTITCH } },
  { key: 'S3-коверлок', step: { operationType: T.MACHINE, machineType: T.COVERSTITCH } },
  { key: 'S4-зигзаг', step: { operationType: T.MACHINE, machineType: T.ZIGZAG } },
  {
    key: 'S5-шов-отстрочки',
    step: { operationType: T.MACHINE, machineType: T.LOCKSTITCH, seamClass: T.OS_TOPSTITCH },
  },
  {
    key: 'S6-шов-внакрой',
    step: { operationType: T.MACHINE, machineType: T.LOCKSTITCH, seamClass: T.LS_LAPPED },
  },
  { key: 'S7-утюг', step: { operationType: T.PRESS, pressEquipment: T.IRON } },
  {
    key: 'S8-свой-профиль-машинки',
    step: { operationType: T.MACHINE, machineType: T.LOCKSTITCH, machineProfileKey: 'MINE-M' },
  },
  {
    key: 'S9-свой-профиль-вто',
    step: { operationType: T.PRESS, pressEquipment: T.STEAMER, pressProfileKey: 'MINE-P' },
  },
].map((s) => ({ key: s.key, step: { ...blankStep(), ...s.step } }));

// ─── ПАРК КАРТОЧКИ ─────────────────────────────────────────────────────────────────────────────
//
// Собран так, чтобы ОБЕ ветки подбора прошли обоими исходами: у зигзага профиль есть, но БЕЗ
// ключа; у оверлока профилей ДВА; у прямострочки, коверлока и петельного — по одному. ВТО-профиль
// дублирования объявлен для процесса «разутюжить» и потому шагу дублирования не отвечает — рядом
// стоит второй, отвечающий.
const PARK = {
  machines: [
    { profileKey: 'LS-1', machineType: T.LOCKSTITCH, label: 'lock' },
    { profileKey: 'CS-1', machineType: T.COVERSTITCH, label: 'cover' },
    { profileKey: 'BH-1', machineType: T.BUTTONHOLE, label: 'hole' },
    { profileKey: '', machineType: T.ZIGZAG, label: 'zig, без ключа' },
    { profileKey: 'OV-1', machineType: T.OVERLOCK, label: 'over 1' },
    { profileKey: 'OV-2', machineType: T.OVERLOCK, label: 'over 2' },
  ],
  presses: [
    { profileKey: 'IR-1', pressEquipment: T.IRON, operationType: T.OP_UNSET, label: 'iron' },
    { profileKey: 'ST-1', pressEquipment: T.STEAMER, operationType: T.PRESS, label: 'steam' },
    {
      profileKey: 'FP-1',
      pressEquipment: T.FUSING_PRESS,
      operationType: T.PRESS_OPEN,
      label: 'fuse, чужой процесс',
    },
    { profileKey: 'FP-2', pressEquipment: T.FUSING_PRESS, operationType: T.FUSING, label: 'fuse' },
  ],
};

// ─── КАТАЛОГ ───────────────────────────────────────────────────────────────────────────────────
//
// СНИМОК ОТВЕТА СЕРВЕРА, А НЕ ВТОРОЙ КАТАЛОГ: токены, ярлыки и пары «работа × машинка» взяты из
// сидов 0329/0331. Список нарочно короткий — проба про ЗАПИСЬ, а не про полноту словаря (её
// стережёт `work-picker-probe`, читающий сами миграции).
const WORKS = [
  {
    token: 'join_lockstitch',
    verb: 'machine',
    stage: 'join_seam',
    label: 'Join / seam',
    machineMode: 'fixed',
    defaultMachine: 'lockstitch',
    machines: ['lockstitch'],
    syn: ['стачать'],
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
    syn: ['отстрочка'],
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
    syn: ['оверлок'],
    sort: 30,
    retired: false,
  },
  {
    token: 'coverstitch',
    verb: 'machine',
    stage: 'join_seam',
    label: 'Coverstitch',
    machineMode: 'fixed',
    defaultMachine: 'coverstitch',
    machines: ['coverstitch'],
    syn: ['коверлок'],
    sort: 40,
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
    // РАБОТА БЕЗ ПУНКТА В БАНДЛЕ, СПРАШИВАЮЩАЯ МАШИНКУ (0331): суженный список приходит из
    // каталога, и подбор профиля парка на ней проходит исходом «нашёлся ровно один».
    token: 'slit_overcast',
    verb: 'machine',
    stage: 'closures',
    label: 'Slit — overcast',
    machineMode: 'ask',
    defaultMachine: 'zigzag',
    machines: ['zigzag', 'buttonhole'],
    syn: ['прорезь'],
    sort: 165,
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
    syn: ['московский'],
    sort: 75,
    retired: false,
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
  {
    // ПУНКТ, ПИШУЩИЙ ОБОРУДОВАНИЕ (G4 → отпариватель): на нём проверяется, что ось ВТО держит ответ
    // человека так же, как машинная.
    token: 'press_steam',
    verb: 'press',
    stage: 'pressing',
    label: 'Steam',
    machineMode: 'none',
    defaultMachine: '',
    machines: [],
    syn: ['отпарить'],
    sort: 350,
    retired: false,
  },
  {
    token: 'fuse',
    verb: 'fusing',
    stage: 'pressing',
    label: 'Fuse',
    machineMode: 'none',
    defaultMachine: '',
    machines: [],
    syn: ['продублировать'],
    sort: 360,
    retired: false,
  },
  {
    // СНЯТАЯ РАБОТА (0331): в пикере её нет, поэтому в живом стенде она не участвует — но чистая
    // функция обязана отвечать на неё так же, как на любую другую.
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
];

const CATALOG_NO_DEFAULTS = { works: WORKS, defaults: [], defaultFields: [], smvHints: [] };
// ТОТ ЖЕ КАТАЛОГ ПЛЮС ДЕФОЛТЫ И РЕЕСТР ПОЛЕЙ — единственное различие пары. Ответ писателя обязан
// быть на обоих ПОБАЙТНО одинаковым.
const CATALOG_WITH_DEFAULTS = {
  works: WORKS,
  defaults: [
    { workToken: 'topstitch', field: 'topstitch_width_mm', value: '6' },
    { workToken: 'topstitch', field: 'topstitch_rows', value: '2' },
    { workToken: 'join_lockstitch', field: 'seam_allowance_mm', value: '10' },
    { workToken: 'slit_overcast', field: 'cut_length_mm', value: '25' },
    { workToken: 'press_flat', field: 'needle_count', value: '1' },
  ],
  defaultFields: [
    'topstitch_width_mm',
    'topstitch_rows',
    'seam_allowance_mm',
    'cut_length_mm',
    'needle_count',
  ],
  smvHints: [],
};

const PICKABLE = WORKS.filter((w) => !w.retired).map((w) => w.token);

/** Батарея живого стенда: девять состояний × одиннадцать выбираемых работ. */
const DOM_BATTERY = [];
for (const s of STATES) for (const token of PICKABLE) DOM_BATTERY.push({ state: s, token });

// ОТПЕЧАТОК БАТАРЕИ. Слепок снят под ЭТИ состояния, ЭТОТ парк и ЭТОТ каталог; правка любого из них
// без переснятия слепка сделала бы сравнение сравнением разных вопросов.
const canon = (v) => JSON.stringify(v, (_k, x) => (x === undefined ? '<unset>' : x));
const sortedCanon = (obj) => {
  const out = {};
  for (const k of Object.keys(obj ?? {}).sort()) out[k] = obj[k];
  return canon(out);
};
const BATTERY_HASH = createHash('sha256')
  .update(canon({ STATES, PARK, WORKS, PICKABLE }))
  .digest('hex')
  .slice(0, 16);

// ─── ЖИВОЙ СТЕНД ───────────────────────────────────────────────────────────────────────────────
//
// PLAYWRIGHT БЕРЁТСЯ ОТТУДА ЖЕ, ОТКУДА ЕГО БЕРУТ СОСЕДНИЕ ЖИВЫЕ ПРОБЫ. НЕ НАШЁЛСЯ — КОД 2, А НЕ
// ПРОПУСК: у соседей живой стенд проверяет ПОЛОВИНУ утверждения, здесь — всё утверждение целиком.
// Зелёный прогон без него был бы ровно той ложной зеленью, против которой написана эта проба.
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

const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден — живого стенда нет, а без него доказывать нечем');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright найден, но без chromium');

async function buildDom(plugins, outfile) {
  await esbuild({
    entryPoints: [resolve(HERE, 'operation-work-apply-dom-entry.tsx')],
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
  return readFileSync(outfile, 'utf8');
}

const KIND = '[data-kind-picker="0"]';
const TRIGGER = `${KIND} button[data-combobox-trigger]`;
const INPUT = `${KIND} input[data-combobox-input]`;

/**
 * ОДИН ПРОГОН БАТАРЕИ ЧЕРЕЗ ЖИВОЙ РЕДАКТОР. Отвечает картой «случай → {до, после}», где обе
 * половины — значения строки шага, как их держит ФОРМА (`getValues`), а не как их печатает экран.
 */
async function runBattery(bundle, catalog) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.route('http://stub.invalid/**', async (route) => {
    const url = route.request().url();
    if (url.includes('operation-work/catalog')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // СНИМОК «ДО» ХРАНИТСЯ ПО СОСТОЯНИЮ, А НЕ ПО СЛУЧАЮ, И ЭТО НЕ ЭКОНОМИЯ МЕСТА: до нажатия шаг
  // ничего не знает о работе, которую сейчас выберут, — значит одиннадцать случаев одного
  // состояния ОБЯЗАНЫ дать один и тот же снимок. Расхождение здесь означало бы недетерминированный
  // стенд, то есть что вся пара ДО/ПОСЛЕ сравнивает шум. Проба это и проверяет.
  const before = {};
  const after = {};
  const found = {};
  const drift = [];
  let fields = null;
  for (const { state, token } of DOM_BATTERY) {
    await page.goto('http://probe.local/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      ([ops, park]) => window.__opApply.mount(ops, park),
      [[state.step], PARK],
    );
    await page.waitForSelector(KIND, { timeout: 20000 });
    // Каталог — сетевой запрос, и он приезжает ПОСЛЕ первого кадра. Ждём по признаку списка, а не
    // по таймеру: иначе «работы нет в списке» смешалось бы с «ещё не приехал».
    await page.waitForFunction(
      (sel) => !!document.querySelector(sel),
      TRIGGER,
      { timeout: 20000 },
    );
    await page.waitForTimeout(350);
    if (!fields) fields = await page.evaluate(() => window.__opApply.fields());

    const now = compact(await page.evaluate(() => window.__opApply.values()));
    if (before[state.key] === undefined) before[state.key] = now;
    else if (before[state.key] !== now) drift.push(`${state.key} · ${token}`);
    await page.locator(TRIGGER).scrollIntoViewIfNeeded();
    await page.locator(TRIGGER).click();
    await page.waitForSelector(INPUT, { timeout: 10000 });
    const opt = page.locator(`[data-combobox-option="${token}"]`);
    const pickable = (await opt.count()) > 0;
    if (pickable) {
      await opt.first().click();
      await page.waitForSelector(INPUT, { state: 'detached', timeout: 10000 }).catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(200);
    const key = `${state.key} · ${token}`;
    after[key] = compact(await page.evaluate(() => window.__opApply.values()));
    found[key] = pickable;
  }
  await browser.close();
  return { before, after, found, drift, fields, errors };
}

/** Строка шага ОДНОЙ СТРОКОЙ, с именами по алфавиту: сравнение ДО/ПОСЛЕ — сравнение байтов. */
function compact(values) {
  const out = {};
  for (const k of Object.keys(values ?? {}).sort()) {
    const v = values[k];
    out[k] = v === undefined ? '<unset>' : v;
  }
  return JSON.stringify(out);
}

// ─── ЧИСТАЯ ПОЛОВИНА: САМА ВЫНЕСЕННАЯ ФУНКЦИЯ ──────────────────────────────────────────────────
//
// Собирается ДО переснятия слепка нарочно: список случаев, в которых редактор после записи
// вмешивается САМ, снимается тем же кодом с ТОГО ЖЕ дерева и ложится в слепок. Выписать такой
// список руками значило бы подогнать проверку под результат.
const pureOut = resolve(REPO, `scripts/.op-apply-pure-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'operation-work-apply-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile: pureOut,
  logLevel: 'silent',
  plugins: mutations(),
});
const { workApplication, parseWorkCatalog, KIND_BY_WORK_TOKEN } = await import(
  pathToFileURL(pureOut).href
);
rmSync(pureOut, { force: true });

const CAT_A = parseWorkCatalog(CATALOG_NO_DEFAULTS);
const CAT_B = parseWorkCatalog(CATALOG_WITH_DEFAULTS);
if (!CAT_A || !CAT_B) dieNotRun('фикстура каталога не разобралась — стенда нет');

/**
 * ОТВЕТ ПИСАТЕЛЯ НА ОДИН СЛУЧАЙ. `current` приходит ЯВНО, потому что у двух половин пробы он
 * берётся из разных мест: цитаты контракта задают состояние сами, а цитата тождества читает его
 * У ФОРМЫ (снимок до нажатия) — иначе она сверяла бы фикстуру с фикстурой.
 *
 * Ключ `catalog` кладётся ВСЕГДА и чистой функцией игнорируется — см. шапку про М3.
 */
const applyPure = (current, token, catalog) => {
  const item = catalog.byToken.get(token);
  if (!item) return undefined;
  return workApplication({
    item,
    kind: KIND_BY_WORK_TOKEN.get(token),
    current: { ...current, bomKinds: [] },
    park: PARK,
    catalog,
  });
};

/** Снимок шага, вычитанный из ФОРМЫ, — закрытым списком имён и в написании писателя. */
const snapshotOf = (values) => {
  const out = {};
  for (const f of SNAPSHOT_FIELDS) out[f] = values?.[f] ?? '';
  return out;
};

/**
 * ТОЖДЕСТВО ОДНОГО СЛУЧАЯ: снимок ДО, переписанный намерением писателя, против снимка ПОСЛЕ.
 * Отвечает СПИСКОМ РАСХОЖДЕНИЙ — пустой список и есть «намерение объясняет всё, что произошло».
 */
function identityGap(beforeStr, afterStr, token) {
  const before = JSON.parse(beforeStr);
  const after = JSON.parse(afterStr);
  const app = applyPure(snapshotOf(before), token, CAT_A);
  if (!app) return ['каталог не знает работы'];
  const intent = { ...app.writes, ...app.clears };
  if (app.links.machineProfileKey !== undefined)
    intent.machineProfileKey = app.links.machineProfileKey;
  if (app.links.pressProfileKey !== undefined) intent.pressProfileKey = app.links.pressProfileKey;

  // Имя, которого в строке формы нет вовсе, форма и не покажет — вызыватель пропускает его молча
  // (щит `field in emptyOperation`), поэтому проекция ставит только известные строке имена.
  const projected = { ...before, work: token };
  for (const [f, v] of Object.entries(intent)) if (f in after) projected[f] = v;

  const gap = [];
  for (const f of new Set([...Object.keys(projected), ...Object.keys(after)])) {
    if (canon(projected[f]) !== canon(after[f])) {
      gap.push(`${f}: намерение ${canon(projected[f])} ≠ форма ${canon(after[f])}`);
    }
  }
  return gap.sort();
}

// ─── ПЕРЕСНЯТИЕ БАЗОВОГО СЛЕПКА ────────────────────────────────────────────────────────────────
if (REBASELINE) {
  console.log(`переснимаю базовый слепок с дерева коммита ${BASE_SHA}…`);
  const out = resolve(tmpdir(), `op-apply-base-${process.pid}.js`);
  const bundle = await buildDom([fromCommit(BASE_SHA)], out);
  rmSync(out, { force: true });
  const run = await runBattery(bundle, CATALOG_NO_DEFAULTS);
  if (run.errors.length) dieNotRun(`базовый прогон дал ошибки страницы: ${run.errors[0]}`);
  if (run.drift.length) dieNotRun(`базовый стенд недетерминирован: ${run.drift.join(', ')}`);
  // СЛУЧАИ, В КОТОРЫХ РЕДАКТОР ПОСЛЕ ЗАПИСИ ВМЕШИВАЕТСЯ САМ, — СНЯТЫ С ТОГО ЖЕ ДЕРЕВА, А НЕ
  // ВЫПИСАНЫ РУКАМИ. Писатель отвечает за то, что он пишет; что делает с записанным очередной
  // эффект редактора (сужение списка машинок, отзыв собственной подстановки) — вопрос ДРУГОЙ фазы,
  // и правкой R7-Б он не создан. Слепок фиксирует эти случаи поимённо, чтобы новый — созданный
  // правкой — было видно сразу.
  const unexplained = {};
  for (const { state, token } of DOM_BATTERY) {
    const key = `${state.key} · ${token}`;
    if (!run.found[key]) continue;
    const gap = identityGap(run.before[state.key], run.after[key], token);
    if (gap.length) unexplained[key] = gap;
  }
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        note: 'СНЯТО С ДЕРЕВА КОММИТА, А НЕ НАПИСАНО РУКАМИ. Обновлять только через --rebaseline.',
        commit: BASE_SHA,
        battery: BATTERY_HASH,
        cases: DOM_BATTERY.length,
        fields: run.fields,
        found: run.found,
        unexplained,
        before: run.before,
        after: run.after,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `слепок записан: ${BASELINE_FILE} (${DOM_BATTERY.length} случаев, ` +
      `${Object.keys(unexplained).length} с вмешательством редактора)`,
  );
  process.exit(0);
}

if (!existsSync(BASELINE_FILE)) dieNotRun(`базового слепка нет: ${BASELINE_FILE}`);
const BASELINE = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
if (BASELINE.battery !== BATTERY_HASH) {
  dieNotRun(
    `батарея разошлась со слепком (${BASELINE.battery} ≠ ${BATTERY_HASH}): ` +
      'сравнение сравнивало бы разные вопросы. Пересними слепок: --rebaseline',
  );
}

console.log(
  `батарея: ${STATES.length} состояний × ${WORKS.length} работ ` +
    `(${DOM_BATTERY.length} случаев живого стенда) · слепок: коммит ${BASELINE.commit}`,
);

// ─── Ц-РАВЕНСТВО: ЖИВОЙ РЕДАКТОР ДО И ПОСЛЕ ЭКСТРАКЦИИ ─────────────────────────────────────────
head('Ц-РАВЕНСТВО · та же батарея через тот же редактор: дерево коммита против рабочего');
const liveOut = resolve(tmpdir(), `op-apply-live-${process.pid}.js`);
const liveBundle = await buildDom(mutations(), liveOut);
rmSync(liveOut, { force: true });
const live = await runBattery(liveBundle, CATALOG_NO_DEFAULTS);
ck(live.errors.length === 0, 'страница не бросила ни одной ошибки', live.errors[0] ?? '');
ck(live.drift.length === 0, 'стенд детерминирован: снимок ДО зависит только от состояния', live.drift.join(', '));
ck(
  canon(live.fields) === canon(BASELINE.fields),
  'список полей строки шага тот же',
  `${live.fields?.length} против ${BASELINE.fields?.length}`,
);

/** Построчное объяснение расхождения двух снимков — чтобы КРАСНАЯ называла поле, а не «не совпало». */
const explain = (a, b) => {
  const x = JSON.parse(a ?? '{}');
  const y = JSON.parse(b ?? '{}');
  const out = [];
  for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (canon(x[f]) !== canon(y[f])) out.push(`${f}: ${canon(x[f])} → ${canon(y[f])}`);
  }
  return out;
};

{
  let same = 0;
  const shown = [];
  for (const key of Object.keys(BASELINE.before)) {
    if (BASELINE.before[key] === live.before[key]) same++;
    else shown.push(`${key} (ДО) — ${explain(BASELINE.before[key], live.before[key]).slice(0, 4).join('; ')}`);
  }
  ck(
    same === STATES.length,
    `снимок ДО совпал во всех ${STATES.length} состояниях`,
    `совпало ${same}`,
  );
  // РАВЕНСТВО ЗДЕСЬ БОЛЬШЕ НЕ ПОЛНОЕ, И ГРАНИЦА ПРОВЕДЕНА НЕ РУКАМИ. Дерево `a9ca7819` несёт живой
  // дефект пустого значения (разбор — у Ц-ТОЖДЕСТВА и в `ui/components/select.tsx`), а рабочее
  // дерево его чинит, поэтому требовать побайтного совпадения значило бы требовать сохранения
  // дефекта. Требуется ровно одно: НЕ СОВПАЛИ ТЕ И ТОЛЬКО ТЕ случаи, что записаны в слепке как
  // сломанные. Во что именно они превратились, проверяет Ц-ТОЖДЕСТВО — сверкой с намерением
  // писателя, а не со списком, выписанным человеком. Ни один случай вне этого списка сдвинуться
  // не имеет права: 93 из 99 обязаны остаться побайтно теми же.
  const broken = BASELINE.unexplained ?? {};
  let sameAfter = 0;
  let fixedAfter = 0;
  for (const key of Object.keys(BASELINE.after)) {
    const was = BASELINE.after[key];
    const now = live.after[key];
    if (now === undefined) {
      shown.push(`${key} — случай пропал из живого прогона`);
      continue;
    }
    if (BASELINE.found[key] !== live.found[key]) {
      shown.push(`${key} — работа ${live.found[key] ? 'появилась' : 'пропала'} в пикере`);
      continue;
    }
    if (broken[key]) {
      if (was === now) shown.push(`${key} — СЛОМАННЫЙ СЛУЧАЙ НЕ СДВИНУЛСЯ, починка не доехала`);
      else fixedAfter++;
      continue;
    }
    if (was === now) sameAfter++;
    else shown.push(`${key} — СДВИНУЛСЯ ВНЕ ПОЧИНКИ: ${explain(was, now).slice(0, 4).join('; ')}`);
  }
  const untouched = DOM_BATTERY.length - Object.keys(broken).length;
  ck(
    sameAfter === untouched,
    `снимок ПОСЛЕ побайтно совпал с деревом ${BASE_SHA} во всех ${untouched} случаях, которых починка не касалась`,
    `совпало ${sameAfter} из ${untouched}`,
  );
  ck(
    fixedAfter === Object.keys(broken).length,
    `а все ${Object.keys(broken).length} сломанных — сдвинулись`,
    `сдвинулось ${fixedAfter}`,
  );
  for (const line of shown.slice(0, 12)) console.log(`       ${line}`);
  if (shown.length > 12) console.log(`       … и ещё ${shown.length - 12} случаев`);
}

/** Живой снимок случая, разобранный обратно в объект. */
const rowOf = (state, token) => {
  const key = `${state.key} · ${token}`;
  if (live.after[key] === undefined) return undefined;
  return {
    found: live.found[key],
    before: JSON.parse(live.before[state.key]),
    after: JSON.parse(live.after[key]),
  };
};

// ─── Ц-СНИМОК: СОСТОЯНИЕ, КОТОРОЕ БАТАРЕЯ ЗАЯВЛЯЕТ, ФОРМА ДЕЙСТВИТЕЛЬНО ДЕРЖИТ ─────────────────
//
// Батарея — это утверждение о ВХОДАХ, и оно тоже подлежит проверке: редактор шага полон эффектов,
// подставляющих выводимое (зона, нитка, утюг), и состояние, до которого шаг доживает к моменту
// нажатия, может отличаться от того, каким его положили. Расхождение здесь не «мелочь стенда»: оно
// значило бы, что ветка, ради которой состояние заведено, на самом деле не пройдена ни разу.
head('Ц-СНИМОК · состояние, которое заявляет батарея, форма к моменту нажатия и держит');
{
  let ok = 0;
  const problems = [];
  for (const { state, token } of DOM_BATTERY) {
    const before = rowOf(state, token)?.before ?? {};
    const mismatch = SNAPSHOT_FIELDS.filter((f) => canon(before[f] ?? '') !== canon(state.step[f]));
    if (mismatch.length === 0) ok++;
    else
      problems.push(
        `${state.key} · ${token}: ` +
          mismatch.map((f) => `${f} ${canon(state.step[f])} → ${canon(before[f])}`).join(', '),
      );
  }
  ck(problems.length === 0, `снимок совпал во всех ${DOM_BATTERY.length} случаях`, `совпало ${ok}`);
  for (const line of problems.slice(0, 8)) console.log(`       ${line}`);
  if (problems.length > 8) console.log(`       … и ещё ${problems.length - 8} случаев`);
}

// ─── Ц-ТОЖДЕСТВО: НАМЕРЕНИЕ, ПРИЛОЖЕННОЕ К СНИМКУ «ДО», ДАЁТ СНИМОК «ПОСЛЕ» ───────────────────
//
// ФОРМУЛИРОВКА ДВУСТОРОННЯЯ НАРОЧНО. «Всё, что писатель назвал, доехало» ловит потерю, но молчит о
// лишнем; «в форме не изменилось ничего сверх» ловит лишнее, но молчит о потере. Проверка «снимок
// ДО, переписанный намерением, РАВЕН снимку ПОСЛЕ» ловит и то и другое одной цитатой и по
// ЗАКРЫТОМУ списку полей строки.
//
// Каталог этой половины БЕЗ ДЕФОЛТОВ, поэтому подстановка не пишет ничего, и разница снимков —
// ровно ответ писателя. Поле `work` писатель не называет вовсе: его пишет ВЫЗЫВАТЕЛЬ (работа едет
// в строку и тогда, когда пункта у неё нет), поэтому в проекции оно проставляется отдельно — и
// проверяется тем же сравнением.
//
// ШЕСТЬ СЛУЧАЕВ ТОЖДЕСТВУ НЕ ПОДЧИНЯЛИСЬ — И ЭТО БЫЛ ЖИВОЙ ДЕФЕКТ РЕДАКТОРА, ТЕПЕРЬ ЗАКРЫТЫЙ.
// На шаге с ЗАПОЛНЕННЫМ классом шва запись писателя доезжала до формы, а дальше её правил сам
// редактор: у трёх случаев машинка оказывалась ПУСТОЙ строкой (шаг MACHINE без машинки сервер
// отвергает, то есть строка становилась несохраняемой от одного нажатия), у трёх не доезжала
// ссылка на профиль парка. Список НЕ ВЫПИСАН РУКАМИ: он снят тем же кодом с дерева `a9ca7819` и
// лежит в слепке (`unexplained`) — это «до».
//
// Причина оказалась не в писателе и не в видах шага, а в самом списке: Radix синхронизирует свой
// СКРЫТЫЙ НАТИВНЫЙ <select> эффектом после рендера, и если в тот момент значения нет среди
// отрисованных пунктов, он остаётся при пустой строке и шлёт её наружу как выбор человека.
// Починка — в примитиве `ui/components/select.tsx`: пустая строка принимается, только если пустой
// пункт СТОИТ в списке. Разбор — в комментарии там же.
//
// Поэтому цитата здесь перевёрнута: раньше она стерегла «вмешивается ровно в этих шести», теперь
// требует, чтобы тождество держалось ВЕЗДЕ, а каждый из шести исторических случаев был закрыт
// поимённо. Слепок остаётся тем же файлом с дерева «до» — он и есть список того, что чинилось.
head('Ц-ТОЖДЕСТВО · снимок ДО, переписанный намерением, равен снимку ПОСЛЕ');
{
  const was = BASELINE.unexplained ?? {};
  const now = {};
  let held = 0;
  for (const { state, token } of DOM_BATTERY) {
    const key = `${state.key} · ${token}`;
    if (!live.found[key]) {
      now[key] = ['работа не нашлась в пикере'];
      continue;
    }
    const gap = identityGap(live.before[state.key], live.after[key], token);
    if (gap.length) now[key] = gap;
    else held++;
  }
  ck(
    held === DOM_BATTERY.length,
    `тождество держится во всех ${DOM_BATTERY.length} случаях — редактор не вмешивается нигде`,
    `держится ${held}, вмешательств ${Object.keys(now).length}`,
  );
  const stillBroken = Object.keys(was).filter((k) => now[k]);
  ck(
    stillBroken.length === 0,
    `и каждый из ${Object.keys(was).length} исторических случаев закрыт поимённо`,
    stillBroken.length ? `остались: ${stillBroken.join(', ')}` : 'закрыты все',
  );
  const fresh = Object.keys(now).filter((k) => !was[k]);
  ck(fresh.length === 0, 'и ни одного нового не появилось', `новых ${fresh.length}`);
  for (const key of Object.keys(now).sort()) {
    const mark = was[key] ? 'НЕ ПОЧИНЕНО' : 'НОВОЕ';
    console.log(`       [${mark}] ${key} — ${now[key].join('; ')}`);
  }
}

// ─── Ц-ДЕФОЛТЫ: ПИСАТЕЛЬ НЕ ЗНАЕТ О ПОДСТАНОВКЕ ───────────────────────────────────────────────
head('Ц-ДЕФОЛТЫ · ответ писателя одинаков на двух каталогах, различающихся ТОЛЬКО дефолтами');
{
  let ok = 0;
  const problems = [];
  for (const state of STATES) {
    for (const w of WORKS) {
      const a = applyPure(state.step, w.token, CAT_A);
      const b = applyPure(state.step, w.token, CAT_B);
      if (!a || !b) {
        problems.push(`${state.key} · ${w.token}: каталог не знает работы`);
        continue;
      }
      if (sortedCanon(a.writes) === sortedCanon(b.writes) && canon(a.clears) === canon(b.clears)) {
        ok++;
      } else {
        problems.push(
          `${state.key} · ${w.token}: ${sortedCanon(a.writes)} ≠ ${sortedCanon(b.writes)}`,
        );
      }
    }
  }
  ck(
    problems.length === 0,
    `дефолты не просочились ни в один из ${STATES.length * WORKS.length} ответов`,
    `совпало ${ok}`,
  );
  for (const line of problems.slice(0, 8)) console.log(`       ${line}`);
  if (problems.length > 8) console.log(`       … и ещё ${problems.length - 8} случаев`);
}

// ─── Ц-ЯКОРЬ: СНЯТИЕ КЛАССА ШВА ИМЕЕТ РОВНО ОДНУ ГРАНИЦУ ──────────────────────────────────────
//
// Половины разведены нарочно: потерять СНЯТИЕ и снять ЛИШНЕЕ — разные отказы, и одна проверка их
// не поймает.
head('Ц-ЯКОРЬ · чужой якорь снимается, свой — никогда');
{
  const topstitchSeam = STATES.find((s) => s.key === 'S5-шов-отстрочки');
  const lappedSeam = STATES.find((s) => s.key === 'S6-шов-внакрой');
  const plain = STATES.find((s) => s.key === 'S2-прямострочка');

  const a1 = applyPure(topstitchSeam.step, 'join_lockstitch', CAT_A);
  ck(
    a1.clears.seamClass === T.SEAM_UNSET,
    'на шаге с классом шва ОТСТРОЧКИ выбор «Join / seam» снимает якорь',
    canon(a1.clears),
  );
  const a2 = applyPure(topstitchSeam.step, 'topstitch', CAT_A);
  ck(
    canon(a2.clears) === '{}',
    'а сама отстрочка свой же класс шва не снимает',
    canon(a2.clears),
  );
  const a3 = applyPure(lappedSeam.step, 'join_lockstitch', CAT_A);
  ck(
    canon(a3.clears) === '{}',
    'на шаге с классом «внакрой» свалочный пункт НЕ снимает ничего',
    canon(a3.clears),
  );
  const a4 = applyPure(plain.step, 'join_lockstitch', CAT_A);
  ck(canon(a4.clears) === '{}', 'на шаге без класса шва снимать нечего', canon(a4.clears));
  const a5 = applyPure(topstitchSeam.step, 'moscow_hem', CAT_A);
  ck(
    canon(a5.clears) === '{}',
    'у работы БЕЗ пункта снимать нечего — она ни одного якоря не писала',
    canon(a5.clears),
  );
}

// ─── Ц-МАШИНКА: ВЫБОР РАБОТЫ НЕ ПЕРЕСТАВЛЯЕТ ШАГ НА ДРУГУЮ МАШИНУ ─────────────────────────────
head('Ц-МАШИНКА · стоящая на шаге машинка важнее парка, парк важнее дефолта работы');
{
  const cover = STATES.find((s) => s.key === 'S3-коверлок');
  const zig = STATES.find((s) => s.key === 'S4-зигзаг');
  const blank = STATES.find((s) => s.key === 'S1-пустой');

  const m1 = applyPure(cover.step, 'topstitch', CAT_A);
  ck(
    m1.writes.machineType === T.COVERSTITCH,
    'отстрочка на шаге, стоящем на коверлоке, остаётся на коверлоке',
    m1.writes.machineType,
  );
  const m2 = applyPure(zig.step, 'slit_overcast', CAT_A);
  ck(
    m2.writes.machineType === T.ZIGZAG,
    'прорезь на шаге, стоящем на зигзаге, остаётся на зигзаге',
    m2.writes.machineType,
  );
  // ВЕТКА ПАРКА: у прорези в парке ровно один профиль подходящей машинки (петельный; у зигзага
  // профиль есть, но БЕЗ ключа и потому не считается).
  const m3 = applyPure(blank.step, 'slit_overcast', CAT_A);
  ck(
    m3.writes.machineType === T.BUTTONHOLE,
    'на пустом шаге прорезь берёт ЕДИНСТВЕННЫЙ подходящий профиль парка',
    m3.writes.machineType,
  );
  // …а у отстрочки подходящих профилей ДВА, и парк молчит — остаётся дефолт работы.
  const m4 = applyPure(blank.step, 'topstitch', CAT_A);
  ck(
    m4.writes.machineType === T.LOCKSTITCH,
    'на пустом шаге отстрочка при ДВУХ подходящих профилях берёт дефолт работы',
    m4.writes.machineType,
  );
  const m5 = applyPure(cover.step, 'overlock_serge', CAT_A);
  ck(
    m5.writes.machineType === T.OVERLOCK,
    'работа режима fixed переставляет шаг на свою машинку',
    m5.writes.machineType,
  );
}

// ─── Ц-ССЫЛКА: СВЯЗЬ С ПРОФИЛЕМ ПИШЕТСЯ ТОЛЬКО В ПУСТОЙ КЛЮЧ ─────────────────────────────────
head('Ц-ССЫЛКА · профиль парка привязывается ключом, и только когда он один и место пусто');
{
  const blank = STATES.find((s) => s.key === 'S1-пустой');
  const mine = STATES.find((s) => s.key === 'S8-свой-профиль-машинки');
  const iron = STATES.find((s) => s.key === 'S7-утюг');
  const minePress = STATES.find((s) => s.key === 'S9-свой-профиль-вто');

  const l1 = applyPure(blank.step, 'join_lockstitch', CAT_A);
  ck(l1.links.machineProfileKey === 'LS-1', 'единственный профиль прямострочки привязан', canon(l1.links));
  const l2 = applyPure(blank.step, 'overlock_serge', CAT_A);
  ck(
    l2.links.machineProfileKey === undefined,
    'при ДВУХ профилях оверлока связь не пишется',
    canon(l2.links),
  );
  const l3 = applyPure(blank.step, 'zigzag', CAT_A);
  ck(
    l3.links.machineProfileKey === undefined,
    'профиль БЕЗ ключа связью не является',
    canon(l3.links),
  );
  const l4 = applyPure(mine.step, 'join_lockstitch', CAT_A);
  ck(
    l4.links.machineProfileKey === undefined,
    'уже стоящая ссылка технолога не перебивается',
    canon(l4.links),
  );
  // ОСЬ ВТО. Отпариватель пункта G4 НЕ вытесняет названный человеком утюг, и связь пишется по тому
  // оборудованию, которое в итоге стоит.
  const l5 = applyPure(iron.step, 'press_steam', CAT_A);
  ck(
    l5.writes.pressEquipment === T.IRON,
    'названный человеком утюг переживает выбор «Steam»',
    l5.writes.pressEquipment,
  );
  ck(l5.links.pressProfileKey === 'IR-1', 'и привязан профиль утюга, а не отпаривателя', canon(l5.links));
  const l6 = applyPure(blank.step, 'fuse', CAT_A);
  ck(
    l6.links.pressProfileKey === 'FP-2',
    'у дублирования берётся профиль СВОЕГО процесса, а не однофамилец',
    canon(l6.links),
  );
  const l7 = applyPure(minePress.step, 'press_steam', CAT_A);
  ck(
    l7.links.pressProfileKey === undefined,
    'уже стоящая ссылка на профиль ВТО не перебивается',
    canon(l7.links),
  );
}

console.log(`\n${bad === 0 ? 'ЗЕЛЁНАЯ' : `КРАСНАЯ: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
