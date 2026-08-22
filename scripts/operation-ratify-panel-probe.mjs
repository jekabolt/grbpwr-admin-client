#!/usr/bin/env node
// ПАНЕЛЬ РАТИФИКАЦИИ ЗАПИСЫВАЕТ РОВНО ИМЯ — И НИ ОДНОГО ФАКТА СВЕРХ НЕГО.
//
// ЧТО ЗДЕСЬ ДОКАЗЫВАЕТСЯ. Панель — ВТОРОЙ вызыватель единственного писателя работы; первый —
// строка шага. Всё, ради чего писателя выносили, сводится к одному утверждению: у панели НЕТ
// своих правил. Значит и проверять надо не разметку, а ЗАПИСЬ В ФОРМУ — снимками строки шага до и
// после настоящего нажатия в настоящем браузере, полем к полю.
//
// ПРОБА, ДЕРЖАЩАЯ РАЗМЕТКУ, НЕ ДОКАЗЫВАЕТ, ЧТО ЖЕСТ РАБОТАЕТ. Поэтому `Enter` и `Escape` жмутся
// НАСТОЯЩЕЙ КЛАВИАТУРОЙ (`page.keyboard.press`), а не зовутся обработчиком: обработчик, до
// которого не доходит событие, зеленел бы вечно.
//
// ── ЦИТАТЫ ──────────────────────────────────────────────────────────────────────────────────────
//   Ц13  — 12 шагов, 9 без работы: счётчик показывает 9 и рядом с ним ЕСТЬ кнопка; на карточке, где
//          названы все, счётчика НЕТ ВОВСЕ (и кнопки вместе с ним); на ВЫПУЩЕННОЙ карточке счётчик
//          есть, а кнопки нет — панель пишет, а в выпущенную карточку писать нельзя;
//   Ц14  — панель рисует ВСЕ 12 строк, в порядке номеров, и три названные приглушены;
//   Ц15  — нажатие первого предложения меняет в форме РОВНО `{work}`: снимок ВСЕХ прочих полей шага
//          до и после байт-идентичен. Проверяется на КАЖДОЙ прод-форме, у которой есть предложение;
//   Ц16  — нажатие второго предложения яруса A меняет РОВНО `{work, seamClass}`;
//   Ц17  — после нажатия имя шага в РЕЛЬСЕ и в панели совпадает СЛОВО В СЛОВО. Двоекодье не
//          расходится: обе стороны спрашивают `workNaming`, а не собирают имя заново;
//   Ц18  — `Enter` (настоящий) на строке БЕЗ предложений не пишет ничего и переводит фокус дальше;
//   ЦВВОД — `Enter` (настоящий) на строке яруса A записывает ПЕРВОЕ предложение и уходит на
//          следующую строку;
//   ЦESC — `Escape` (настоящий) закрывает панель;
//   ЦПОЛН — комбобокс стоит на КАЖДОЙ строке, включая ярусы без предложений, и выбор в нём пишет ту
//          же работу тем же писателем: кнопка — короткий путь, комбобокс — полный;
//   ЦГРАН — ГРАНИЦА ПАНЕЛИ (план М5): на строке ВТО без приёма в строке нет НИ ОДНОГО органа сверх
//          комбобокса работ и ссылки «open the step». Своего пикера приёма и своего пикера входов у
//          панели нет — недостающее адресуется к контролам шага;
//   ЦДЕФ  — ПАНЕЛЬ НЕ ПОДСТАВЛЯЕТ НИЧЕГО (план М3): ответ формы на нажатие ПОБАЙТНО одинаков на двух
//          каталогах, различающихся ТОЛЬКО глобальными дефолтами работ;
//   ЦИМЯ  — СМЕНА ПОДПИСИ НАЗЫВАЕТСЯ ВСЛУХ и только там, где она произошла: у стачивания
//          («Join — lockstitch» → «Join / seam») след есть, у отстрочки («Topstitch» → «Topstitch»)
//          следа НЕТ;
//   ЦСХЕМА — в режиме `schematic` кнопка на месте, панель открывается и рисует ту же карточку
//          целиком (счётчик стоит НАД обоими режимами, и панель обязана пережить переключение);
//   ЦСОХР — ЦИТАТА СОХРАНЯЕМОСТИ (требование ревью R7-Б §14): применение предложения к КАЖДОЙ из
//          форм 111 прод-строк оставляет строку СОХРАНЯЕМОЙ — у шага MACHINE машинка непуста.
//          Панель ничего не решает; она лишь не имеет права молча произвести несохраняемую строку.
//
// ── МУТАЦИИ (мутируют БАНДЛ, а не репозиторий) ──────────────────────────────────────────────────
//   node scripts/operation-ratify-panel-probe.mjs                       прогон
//   node scripts/operation-ratify-panel-probe.mjs --mutate-prefill      М3: нажатие пишет ещё и
//                                                                      дефолты вида
//   node scripts/operation-ratify-panel-probe.mjs --mutate-press-picker М5: у панели завёлся свой
//                                                                      пикер приёма ВТО
//   node scripts/operation-ratify-panel-probe.mjs --mutate-drop-extra   второй факт (класс шва) не
//                                                                      пишется
//   node scripts/operation-ratify-panel-probe.mjs --mutate-quiet-rename смена подписи замалчивается
//   node scripts/operation-ratify-panel-probe.mjs --mutate-esc-dead     панель глотает Escape
//   node scripts/operation-ratify-panel-probe.mjs --mutate-enter-nofocus Enter не переводит фокус
//
// ИМЯ ФЛАГА ПРОВЕРЯЕТСЯ, А НЕ УГАДЫВАЕТСЯ: любое `--mutate…` вне списка роняет прогон с кодом 2.
// Зелёный прогон с несуществующим флагом — худший из возможных исходов: он ВЫГЛЯДИТ
// доказательством и им не является, потому что мутации не было вовсе.
//
// ⚠️ МУТАЦИЯ, ЛОМАЮЩАЯ СБОРКУ, — ЛОЖНАЯ КРАСНОТА И НЕ ЗАСЧИТЫВАЕТСЯ. Каждая обязана собраться и
// упасть НА ЦИТАТЕ, с напечатанным `КРАСНАЯ: N` и НЕНУЛЕВЫМ числом строк FAIL. Код возврата
// вердиктом не является: считаются ПРОВАЛЫ.

// ── ТРИ КОДА ВОЗВРАТА, И ТРЕТИЙ — НЕ ОТТЕНОК КРАСНОГО ───────────────────────────────────────────
//
//   0 — ЗЕЛЁНАЯ
//   1 — КРАСНАЯ: N        поймано ПОВЕДЕНИЕ, вердикт напечатан
//   2 — НЕ ЗАПУСКАЛАСЬ    неизвестный флаг, нет стенда, ЛИБО прогон умер до вердикта
const dieNotRun = (why) => {
  console.log(`\nпроба НЕ ЗАПУСКАЛАСЬ: ${why}`);
  console.log('зелёный ИЛИ красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_PREFILL = process.argv.includes('--mutate-prefill');
const MUTATE_PRESS_PICKER = process.argv.includes('--mutate-press-picker');
const MUTATE_DROP_EXTRA = process.argv.includes('--mutate-drop-extra');
const MUTATE_QUIET_RENAME = process.argv.includes('--mutate-quiet-rename');
const MUTATE_ESC_DEAD = process.argv.includes('--mutate-esc-dead');
const MUTATE_ENTER_NOFOCUS = process.argv.includes('--mutate-enter-nofocus');

const KNOWN_MUTATIONS = new Set([
  '--mutate-prefill',
  '--mutate-press-picker',
  '--mutate-drop-extra',
  '--mutate-quiet-rename',
  '--mutate-esc-dead',
  '--mutate-enter-nofocus',
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

// ─── МУТАЦИИ: ПРАВЯТ БАНДЛ, А НЕ РЕПОЗИТОРИЙ ───────────────────────────────────────────────────
//
// Правка исходника ради проверки — это правка, которую однажды забудут откатить. Мутация, не
// нашедшая своей строки, РОНЯЕТ СБОРКУ, то есть даёт код 2 «не запускалась», а не зелёный прогон
// без мутации: флаг может быть правильным, а исходник — уехать под ним.

// М3 — НАЖАТИЕ ПИШЕТ ЕЩЁ И ДЕФОЛТЫ ВИДА. Самый правдоподобный промах второго вызывателя: строка
// шага после записи зовёт подстановку, и первый же автор панели повторит это «как у соседа».
const PREFILL_FIX = `      if (p.extra && p.extra.field in blanks) {`;
const PREFILL_BROKEN = `      for (const d of workDefaultsForForm(catalog, item.token, blanks)) {
        setValue(\`\${path}.\${d.field}\`, d.value, { shouldDirty: true });
      }
      if (p.extra && p.extra.field in blanks) {`;
const PREFILL_IMPORT = `import { workDefaultsForForm } from './operation-work';\n`;

// М5 — У ПАНЕЛИ ЗАВЁЛСЯ СВОЙ ПИКЕР ПРИЁМА ВТО. Ровно та граница, которую панель держать обязана:
// недостающий приём живёт на СВОЁМ контроле шага, и второй его писатель разошёлся бы с первым.
const PICKER_FIX = `      {tierWord && (`;
const PICKER_BROKEN = `      {row.tier === 'press-action-missing' && (
        <select data-ratify-press-action={row.index} defaultValue=''>
          <option value=''>press action…</option>
          <option value='TECH_CARD_PRESS_ACTION_FLAT'>flat</option>
        </select>
      )}
      {tierWord && (`;

// ВТОРОЙ ФАКТ НЕ ПИШЕТСЯ. Кнопка «внакрой» перестаёт отличаться от кнопки «стачать»: обе пишут
// одну работу, а класс шва, ради которого вторая кнопка и существует, теряется молча.
const EXTRA_FIX = `      if (p.extra && p.extra.field in blanks) {
        setValue(\`\${path}.\${p.extra.field}\`, p.extra.value, { shouldDirty: true });
      }`;
const EXTRA_BROKEN = `      if (false && p.extra) {
        setValue(\`\${path}.work\`, p.token, { shouldDirty: true });
      }`;

// СМЕНА ПОДПИСИ ЗАМАЛЧИВАЕТСЯ. Человек подтверждает напечатанное и тут же видит другое слово —
// и панель делает вид, что ничего не произошло.
const RENAME_FIX = `        if (row.printedNow && after && after !== row.printedNow) next.set(index, row.printedNow);
        else next.delete(index);`;
const RENAME_BROKEN = `        next.delete(index);
        void after;`;

// ПАНЕЛЬ ГЛОТАЕТ ESCAPE. Проверяет, что цитата про Esc сторожит ЖИВОЙ путь, а не мёртвый код: если
// бы закрытие держал кто-то ещё, эта мутация осталась бы зелёной.
const ESC_FIX = `          onEscapeKeyDown={() => {`;
const ESC_BROKEN = `          onEscapeKeyDown={(escEvent) => {
            escEvent.preventDefault();`;

// ENTER НЕ ПЕРЕВОДИТ ФОКУС. Запись остаётся, проход ломается: человек жмёт Enter второй раз и
// перезаписывает ту же строку вместо следующей.
const ENTER_FIX = `    if (row.index + 1 < rows.length) focusRow(row.index + 1);`;
const ENTER_BROKEN = `    void rows;`;

const patcher = (name, filter, pairs, loader, prepend) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация ${name} не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: (prepend ?? '') + src, loader };
    });
  },
});

const PANEL = /operations-ratify-panel\.tsx$/;
const mutations = () => {
  const out = [];
  if (MUTATE_PREFILL)
    out.push(patcher('prefill', PANEL, [[PREFILL_FIX, PREFILL_BROKEN]], 'tsx', PREFILL_IMPORT));
  if (MUTATE_PRESS_PICKER)
    out.push(patcher('press-picker', PANEL, [[PICKER_FIX, PICKER_BROKEN]], 'tsx'));
  if (MUTATE_DROP_EXTRA) out.push(patcher('drop-extra', PANEL, [[EXTRA_FIX, EXTRA_BROKEN]], 'tsx'));
  if (MUTATE_QUIET_RENAME)
    out.push(patcher('quiet-rename', PANEL, [[RENAME_FIX, RENAME_BROKEN]], 'tsx'));
  if (MUTATE_ESC_DEAD) out.push(patcher('esc-dead', PANEL, [[ESC_FIX, ESC_BROKEN]], 'tsx'));
  if (MUTATE_ENTER_NOFOCUS)
    out.push(patcher('enter-nofocus', PANEL, [[ENTER_FIX, ENTER_BROKEN]], 'tsx'));
  return out;
};

// ─── КАТАЛОГ: СНИМОК ОТВЕТА СЕРВЕРА, А НЕ ВТОРОЙ КАТАЛОГ ───────────────────────────────────────
//
// Токены, ярлыки и пары «работа × машинка» — из сидов 0329/0331, слово в слово те же, что у
// `operation-ratify-probe`: две пробы, разошедшиеся в фикстуре каталога, спорили бы друг с другом.
// Список нарочно короткий: эта проба про ЗАПИСЬ, а не про полноту словаря.
const WORKS = [
  {
    token: 'join_lockstitch',
    verb: 'machine',
    stage: 'join_seam',
    label: 'Join / seam',
    machineMode: 'fixed',
    defaultMachine: 'lockstitch',
    machines: ['lockstitch'],
    syn: ['стачать', 'соединить'],
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
    syn: ['московский'],
    sort: 75,
    retired: false,
  },
  {
    // СНЯТАЯ РАБОТА и ЕДИНСТВЕННАЯ на своей машинке (0331): выборка по машинке обязана вернуть пусто.
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
    syn: ['прорезь'],
    sort: 165,
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
];

const CATALOG_NO_DEFAULTS = { works: WORKS, defaults: [], defaultFields: [], smvHints: [] };
// ТОТ ЖЕ КАТАЛОГ ПЛЮС ГЛОБАЛЬНЫЕ ДЕФОЛТЫ — и больше НИ ОДНОГО отличия. Ответ панели на нажатие
// обязан быть побайтно тем же: дефолты это ОТДЕЛЬНЫЙ жест строки шага, а панель подтверждает имя.
// ФОРМА ДЕФОЛТОВ — ПРОВОДНАЯ (`{workToken, field, value}`, `OperationWorkDefaultItem`), а не
// придуманная. Первый вариант этой фикстуры был вложенным, `parseWorkCatalog` его молча не
// разобрал, и мутация «панель пишет дефолты» прошла ЗЕЛЁНОЙ: сторож стоял у мёртвого кода. Отсюда
// и цитата ЦДЕФ-ЖИВОСТЬ ниже — фикстура, в которой нечему просочиться, ничего не сторожит.
const CATALOG_WITH_DEFAULTS = {
  works: WORKS,
  defaultFields: ['seam_allowance_mm', 'topstitch_width_mm', 'topstitch_rows', 'needle_count'],
  defaults: [
    { workToken: 'join_lockstitch', field: 'seam_allowance_mm', value: '10' },
    { workToken: 'topstitch', field: 'topstitch_width_mm', value: '6' },
    { workToken: 'topstitch', field: 'topstitch_rows', value: '2' },
    { workToken: 'overlock_serge', field: 'needle_count', value: '2' },
    { workToken: 'zigzag', field: 'needle_count', value: '1' },
    { workToken: 'attach_label', field: 'seam_allowance_mm', value: '5' },
  ],
  smvHints: [],
};

// ─── ПАРК: НАРОЧНО НЕОДНОЗНАЧНЫЙ ───────────────────────────────────────────────────────────────
//
// По ДВА профиля на каждую машинку. Это не лень фикстуры, а условие цитаты «нажатие меняет ровно
// {work}»: единственный подходящий профиль писатель ЗАКОННО привязал бы ключом, и снимок разошёлся
// бы на `machineProfileKey` — по правилу, а не по дефекту. Ветка «профиль пишется» проверена там,
// где ей место, — в пробе самого писателя (`operation-work-apply-probe`, Ц-ССЫЛКА); здесь
// проверяется, что панель НЕ ДОБАВЛЯЕТ к его ответу ничего своего.
const PARK = {
  machines: [
    { profileKey: 'LS-1', machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH', label: 'lock 1' },
    { profileKey: 'LS-2', machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH', label: 'lock 2' },
    { profileKey: 'OV-1', machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK', label: 'over 1' },
    { profileKey: 'OV-2', machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK', label: 'over 2' },
    { profileKey: 'ZZ-1', machineType: 'TECH_CARD_MACHINE_TYPE_ZIGZAG', label: 'zig 1' },
    { profileKey: 'ZZ-2', machineType: 'TECH_CARD_MACHINE_TYPE_ZIGZAG', label: 'zig 2' },
  ],
  presses: [
    {
      profileKey: 'IR-1',
      pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
      operationType: 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
      label: 'iron 1',
    },
    {
      profileKey: 'IR-2',
      pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
      operationType: 'TECH_CARD_OPERATION_TYPE_UNKNOWN',
      label: 'iron 2',
    },
  ],
};

// ─── ФИКСТУРЫ ──────────────────────────────────────────────────────────────────────────────────
const FIXTURE_FILE = resolve(HERE, 'fixtures/operation-ratify-prod-2026-08-22.json');
if (!existsSync(FIXTURE_FILE)) dieNotRun(`фикстуры прода нет: ${FIXTURE_FILE}`);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8'));
/** Прод-формы без служебного `name`: в форму карточки едет только то, что есть у строки шага. */
const PROD = FIXTURE.steps.map(({ name, ...rest }) => ({ ...rest, __name: name }));
const formOf = (row) => {
  const { __name, ...rest } = row;
  return rest;
};
const PROD_OPS = PROD.map(formOf);
const nameAt = (i) => PROD[i].__name.split(' ·')[0];
const idxOf = (code) => PROD.findIndex((s) => s.__name.startsWith(`${code} `));

/**
 * СКОЛЬКО ПРОД-СТРОК СТОИТ ЗА КАЖДОЙ ФОРМОЙ (замер 2026-08-22, шапка фикстуры `_prodRows`).
 * Форма — это класс строк, а цитата сохраняемости обязана называть ЧИСЛО СТРОК, а не число форм.
 */
const PROD_ROWS = { F1: 1, F2: 8, F3: 8, F4: 7, F5: 4, F6: 2, F7: 1, F8: 65, F9: 13, F10: 2 };
const PROD_TOTAL = Object.values(PROD_ROWS).reduce((a, b) => a + b, 0);

/** 12 шагов, 9 без работы: три названные стоят НЕ подряд и НЕ с краю. */
const TWELVE = [
  PROD_OPS[idxOf('F1')],
  { ...PROD_OPS[idxOf('F4')], work: 'topstitch' },
  PROD_OPS[idxOf('F2')],
  PROD_OPS[idxOf('F3')],
  PROD_OPS[idxOf('F5')],
  { ...PROD_OPS[idxOf('F11')] },
  PROD_OPS[idxOf('F6')],
  PROD_OPS[idxOf('F7')],
  PROD_OPS[idxOf('F8')],
  { ...PROD_OPS[idxOf('F10')], work: 'join_lockstitch' },
  PROD_OPS[idxOf('F9')],
  PROD_OPS[idxOf('F14')],
];
/** Та же карточка, но названы ВСЕ: счётчика не должно быть вовсе. */
const TWELVE_ALL_NAMED = TWELVE.map((o) => ({ ...o, work: o.work || 'join_lockstitch' }));

/**
 * ШАГ БЕЗ ЗОНЫ И БЕЗ ЖИВЫХ ДЕТАЛЕЙ — ДЛЯ ЦИТАТЫ Ц17.
 *
 * Заголовок рельса КОМПОЗИТНЫЙ: «глагол · зона · детали». Чтобы сравнивать ПОЛНОСТРОЧНО и
 * сравнивать именно ИМЯ, а не композицию, у этого шага зона не задана, а его входы не отвечают ни
 * одной детали карточки (деталей у карточки стенда нет вовсе) — тогда заголовок вырождается ровно
 * в слово работы, и равенство «рельс = панель» становится равенством строк, а не догадкой.
 */
const NAMELESS_ZONE = {
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  seamClass: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
  pressAction: 'TECH_CARD_PRESS_ACTION_UNKNOWN',
  zone: 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
  inputKeys: ['p-a', 'p-b'],
  outputUnitKey: 'NODE',
  note: '',
  work: '',
};

// ─── СБОРКА ────────────────────────────────────────────────────────────────────────────────────
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

const outfile = resolve(tmpdir(), `ratify-panel-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'operation-ratify-panel-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: mutations(),
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

// ─── БРАУЗЕР ───────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 2600 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
let catalogBody = CATALOG_NO_DEFAULTS;
await page.route('http://stub.invalid/**', (route) => {
  const url = route.request().url();
  if (url.includes('operation-work/catalog')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalogBody),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

async function mount(ops, { frozen = false, mode = 'list' } = {}) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    ([o, park, fr]) => window.__ratifyPanel.mount(o, park, fr),
    [ops, PARK, frozen],
  );
  await page.waitForSelector('[data-rail-step], [role="radiogroup"]', { timeout: 20000 });
  // Каталог — сетевой запрос, приезжает ПОСЛЕ первого кадра. Без ожидания «работы нет в списке»
  // смешалось бы с «каталог ещё не приехал».
  await page.waitForTimeout(450);
  // РЕЖИМ РЕЛЬСА ВЫБИРАЕТСЯ ЯВНО, А НЕ ПОДРАЗУМЕВАЕТСЯ. Дефолт поля выводится из разметки карточки
  // («размеченная открывается схемой»), а проба про режим обязана его НАЗВАТЬ: иначе «панель
  // работает в схеме» проверялось бы на экране, который мог оказаться списком.
  if (mode) {
    const seg = page.locator('[role="radiogroup"][aria-label="sequence view"] [role="radio"]', {
      hasText: mode,
    });
    if ((await seg.count()) === 0) throw new Error(`переключателя вида «${mode}» на экране нет`);
    await seg.first().click();
    await page.waitForTimeout(250);
  }
}

const openPanel = async () => {
  await page.locator('[data-ratify-open-panel]').first().click();
  await page.waitForSelector('[data-ratify-panel]', { timeout: 10000 });
  await page.waitForTimeout(150);
};

/** Строка шага, как её держит ФОРМА, одной строкой с именами по алфавиту. */
const snapshot = (index) =>
  page.evaluate((i) => {
    const v = window.__ratifyPanel.values(i) ?? {};
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = v[k] === undefined ? '<unset>' : v[k];
    return JSON.stringify(out);
  }, index);

/** Что изменилось между двумя снимками — списком имён полей, отсортированным. */
const diffFields = (before, after) => {
  const a = JSON.parse(before);
  const b = JSON.parse(after);
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out.sort();
};

const text = (sel) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    return n ? (n.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
  }, sel);

const railTitle = (index) =>
  page.evaluate((i) => {
    const n = document.querySelector(`[data-rail-step="${i}"]`);
    return n ? n.getAttribute('title') : null;
  }, index);

/** ИНВЕНТАРЬ ОРГАНОВ СТРОКИ — всё, чем в ней можно щёлкнуть или что можно заполнить. */
const organs = (index) =>
  page.evaluate((i) => {
    const row = document.querySelector(`[data-ratify-row="${i}"]`);
    if (!row) return '<нет строки>';
    return [
      ...row.querySelectorAll(
        'button, select, input, textarea, [role="button"], [role="radio"], [role="listbox"], [contenteditable]',
      ),
    ]
      .map((el) => {
        if (el.hasAttribute('data-ratify-proposal'))
          return `proposal:${el.getAttribute('data-ratify-proposal')}`;
        if (el.hasAttribute('data-ratify-open')) return 'open-step';
        if (el.hasAttribute('data-combobox-trigger'))
          return `combobox:${el.getAttribute('data-combobox-trigger')}`;
        return `<чужой орган: ${el.tagName.toLowerCase()}>`;
      })
      .join(' · ');
  }, index);

console.log(
  `стенд: ${PROD.length} прод-форм · каталог ${WORKS.length} работ · парк ${PARK.machines.length} машинных профилей`,
);

// ─── Ц13: СЧЁТЧИК И КНОПКА ─────────────────────────────────────────────────────────────────────
head('Ц13 · счётчик считает, кнопка стоит рядом — и обе молчат там, где им нечего сказать');
await mount(TWELVE);
ck(
  (await page.locator('[data-unnamed-steps]').count()) === 1,
  'счётчик на экране РОВНО ОДИН',
  String(await page.locator('[data-unnamed-steps]').count()),
);
ck(
  (await page.locator('[data-unnamed-steps]').first().getAttribute('data-unnamed-steps')) === '9',
  'счётчик считает 9 из 12',
  String(await page.locator('[data-unnamed-steps]').first().getAttribute('data-unnamed-steps')),
);
ck(
  (await page.locator('[data-ratify-open-panel]').count()) === 1,
  'кнопка открытия панели РОВНО ОДНА',
  String(await page.locator('[data-ratify-open-panel]').count()),
);
ck(
  (await text('[data-ratify-open-panel]')) === 'ratify …',
  'подпись кнопки',
  String(await text('[data-ratify-open-panel]')),
);
ck(
  (await page.locator('[data-ratify-panel]').count()) === 0,
  'до нажатия панели на экране НЕТ',
);

await mount(TWELVE_ALL_NAMED);
ck((await page.locator('[data-unnamed-steps]').count()) === 0, 'названы все — счётчика нет вовсе');
ck(
  (await page.locator('[data-ratify-open-panel]').count()) === 0,
  'и кнопки нет вместе с ним: открывать нечего',
);

// ВЫПУЩЕННАЯ КАРТОЧКА: факт остаётся, жест исчезает.
await mount(TWELVE, { frozen: true });
ck(
  (await page.locator('[data-unnamed-steps]').count()) === 1,
  'на выпущенной карточке счётчик ЕСТЬ — это факт, а не задача',
);
ck(
  (await page.locator('[data-ratify-open-panel]').count()) === 0,
  'а кнопки НЕТ: панель пишет, в выпущенную карточку писать нельзя',
);

// ─── Ц14: ВСЯ КАРТОЧКА, В ПОРЯДКЕ ОПЕРАЦИЙ ─────────────────────────────────────────────────────
head('Ц14 · панель рисует ВСЕ строки в порядке номеров, названные — приглушённо');
await mount(TWELVE);
await openPanel();
const order = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-row]')].map((n) => n.getAttribute('data-ratify-row')),
);
ck(order.length === 12, 'строк ровно двенадцать — вся карточка, а не только неназванные', String(order.length));
ck(
  order.join(',') === '0,1,2,3,4,5,6,7,8,9,10,11',
  'и они идут в порядке операций',
  order.join(','),
);
const muted = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-muted]')].map((n) => n.getAttribute('data-ratify-row')),
);
ck(muted.join(',') === '1,5,9', 'приглушены ровно три названные строки', muted.join(','));
const numbers = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-number]')].map((n) => (n.textContent ?? '').trim()),
);
ck(
  numbers.join(' ') === '10 20 30 40 50 60 70 80 90 100 110 120',
  'номера позиционные, как на рельсе и на бумаге',
  numbers.join(' '),
);
ck(
  (await text('[data-ratify-count]')) === '9 of 12 steps not named yet',
  'шапка панели называет тот же масштаб, что и счётчик',
  String(await text('[data-ratify-count]')),
);

// ─── ЦПОЛН: КОМБОБОКС НА КАЖДОЙ СТРОКЕ ─────────────────────────────────────────────────────────
head('ЦПОЛН · полный путь есть ВСЕГДА: комбобокс стоит на каждой строке, включая молчащие ярусы');
const boxes = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-row]')].map(
    (r) => r.querySelectorAll('[data-combobox-trigger]').length,
  ),
);
ck(
  boxes.join(',') === '1,1,1,1,1,1,1,1,1,1,1,1',
  'ровно один комбобокс на каждой из двенадцати строк',
  boxes.join(','),
);
const silentRows = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-row]')]
    .filter((r) => r.querySelectorAll('[data-ratify-proposal]').length === 0)
    .map((r) => r.getAttribute('data-ratify-row')),
);
ck(silentRows.length > 0, 'молчащие ярусы на фикстуре есть', silentRows.join(','));
const silentBoxes = await page.evaluate(
  (ids) =>
    ids
      .map(
        (i) =>
          document.querySelector(`[data-ratify-row="${i}"]`).querySelectorAll('[data-combobox-trigger]')
            .length,
      )
      .join(','),
  silentRows,
);
ck(
  silentBoxes === silentRows.map(() => '1').join(','),
  'и у каждой молчащей строки комбобокс на месте',
  silentBoxes,
);

// ─── ЦГРАН: ГРАНИЦА ПАНЕЛИ (план М5) ───────────────────────────────────────────────────────────
head('ЦГРАН · на строке ВТО без приёма панель НЕ рисует ни одного своего пикера');
// Строка 2 карточки TWELVE — это форма F2: ВТО, приём не записан.
ck(
  (await page.getAttribute('[data-ratify-row="2"]', 'data-ratify-tier')) === 'press-action-missing',
  'строка 2 — ярус «приём не записан»',
  String(await page.getAttribute('[data-ratify-row="2"]', 'data-ratify-tier')),
);
ck(
  (await organs(2)) === 'combobox:ratifyWork-2 · open-step',
  'весь инвентарь строки: комбобокс работ и ссылка на шаг — и БОЛЬШЕ НИЧЕГО',
  await organs(2),
);
ck(
  (await text('[data-ratify-word="2"]')) === 'the press action is not recorded — open the step',
  'строка называет недостающее и ВЕДЁТ туда, где его заполняют',
  String(await text('[data-ratify-word="2"]')),
);
// Расхождение — тот же приём: показать обе половины и адресовать.
ck(
  (await organs(3)) === 'combobox:ratifyWork-3 · open-step',
  'на строке расхождения (один вход) своего пикера входов тоже нет',
  await organs(3),
);

// ─── ЦИМЯ + Ц17: СМЕНА ПОДПИСИ И ДВОЕКОДЬЕ ─────────────────────────────────────────────────────
head('Ц17 + ЦИМЯ · после нажатия рельс и панель говорят одно слово, а смена слова названа вслух');
await mount([NAMELESS_ZONE, PROD_OPS[idxOf('F4')]]);
ck(
  (await railTitle(0)) === 'join',
  'ДО нажатия рельс печатает выведенный глагол',
  String(await railTitle(0)),
);
await openPanel();
ck(
  (await text('[data-ratify-printed="0"]')) === 'Join — lockstitch',
  'ДО нажатия панель печатает ярлык ПУНКТА',
  String(await text('[data-ratify-printed="0"]')),
);
await page.locator('[data-ratify-proposal="0.0"]').click();
await page.waitForTimeout(200);
ck(
  (await text('[data-ratify-printed="0"]')) === 'Join / seam',
  'ПОСЛЕ нажатия панель зовёт строку ярлыком КАТАЛОГА',
  String(await text('[data-ratify-printed="0"]')),
);
ck(
  (await railTitle(0)) === 'Join / seam',
  'и рельс зовёт её ТЕМ ЖЕ СЛОВОМ — двоекодье не разошлось',
  String(await railTitle(0)),
);
ck(
  (await text('[data-ratify-printed="0"]')) === (await railTitle(0)),
  'равенство «панель = рельс» проверено и напрямую',
);
ck(
  (await text('[data-ratify-renamed="0"]')) ===
    'the card printed it as “Join — lockstitch” until now — same job, the catalogue words it differently',
  'смена подписи НАЗВАНА, и названа старым словом',
  String(await text('[data-ratify-renamed="0"]')),
);
// …а там, где имя не поменялось, следа нет вовсе: событие, которого не было, объявлять нельзя.
ck(
  (await text('[data-ratify-printed="1"]')) === 'Topstitch',
  'у отстрочки панель печатает «Topstitch» уже сегодня',
  String(await text('[data-ratify-printed="1"]')),
);
await page.locator('[data-ratify-proposal="1.0"]').click();
await page.waitForTimeout(200);
ck(
  (await text('[data-ratify-printed="1"]')) === 'Topstitch',
  'и после ратификации — то же слово, буква в букву',
  String(await text('[data-ratify-printed="1"]')),
);
ck(
  (await page.locator('[data-ratify-renamed="1"]').count()) === 0,
  'следа смены подписи там НЕТ: ратификация ничего не переименовала',
);

// ─── Ц15 + Ц16: НАЖАТИЕ МЕНЯЕТ РОВНО РАБОТУ ────────────────────────────────────────────────────
head('Ц15 · нажатие первого предложения меняет в форме РОВНО {work} — на КАЖДОЙ прод-форме');
// КАТАЛОГ ЗДЕСЬ — С ДЕФОЛТАМИ, И ЭТО НЕСУЩЕЕ. «Изменилось ровно одно поле» на каталоге, у которого
// подставлять нечего, было бы зеленью над пустой популяцией: у семи работ фикстуры дефолты есть, и
// именно им цитата запрещает просочиться. Живость этих дефолтов доказана контрастом в ЦДЕФ.
catalogBody = CATALOG_WITH_DEFAULTS;
await mount(PROD_OPS);
await openPanel();
const withProposal = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-row]')]
    .filter((r) => r.querySelectorAll('[data-ratify-proposal]').length > 0)
    .map((r) => Number(r.getAttribute('data-ratify-row'))),
);
ck(withProposal.length === 7, 'предложения есть у семи форм из четырнадцати', String(withProposal.length));
const before15 = {};
for (const i of withProposal) before15[i] = await snapshot(i);
for (const i of withProposal) {
  await page.locator(`[data-ratify-proposal="${i}.0"]`).click();
  await page.waitForTimeout(90);
}
await page.waitForTimeout(200);
let savable = 0;
for (const i of withProposal) {
  const after = await snapshot(i);
  const changed = diffFields(before15[i], after);
  ck(
    changed.join(',') === 'work',
    `${nameAt(i)}: изменилось ровно одно поле — work`,
    changed.join(',') || '<ничего>',
  );
}

head('Ц16 · нажатие второго предложения яруса A меняет РОВНО {work, seamClass}');
await mount(PROD_OPS);  // тот же каталог С дефолтами, по той же причине
await openPanel();
const tierA = await page.evaluate(() =>
  [...document.querySelectorAll('[data-ratify-row]')]
    .filter((r) => r.getAttribute('data-ratify-tier') === 'join')
    .map((r) => Number(r.getAttribute('data-ratify-row'))),
);
ck(tierA.length === 3, 'ярус A на фикстуре — три формы (два, три и четыре входа)', String(tierA.length));
const before16 = {};
for (const i of tierA) before16[i] = await snapshot(i);
for (const i of tierA) {
  await page.locator(`[data-ratify-proposal="${i}.1"]`).click();
  await page.waitForTimeout(90);
}
await page.waitForTimeout(200);
for (const i of tierA) {
  const changed = diffFields(before16[i], await snapshot(i));
  ck(
    changed.join(',') === 'seamClass,work',
    `${nameAt(i)}: изменились ровно два поля — work и seamClass`,
    changed.join(',') || '<ничего>',
  );
  const v = JSON.parse(await snapshot(i));
  ck(
    v.seamClass === 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
    `${nameAt(i)}: и класс шва — именно «внакрой»`,
    String(v.seamClass),
  );
}

catalogBody = CATALOG_NO_DEFAULTS;

// ─── ЦСОХР: ЦИТАТА СОХРАНЯЕМОСТИ ───────────────────────────────────────────────────────────────
head('ЦСОХР · применение предложения оставляет строку СОХРАНЯЕМОЙ на каждой из 111 прод-строк');
{
  const unsavable = [];
  let covered = 0;
  let silent = 0;
  // СНАЧАЛА — ПЕРЕПИСЬ ФОРМ НА НЕТРОНУТОЙ КАРТОЧКЕ: у какой формы предложение есть, у какой нет.
  // Считать это ПОСЛЕ нажатий нельзя — нажатая строка становится названной и предложений у неё
  // больше нет, то есть «молчит» и «уже ратифицирована» слились бы в одно число.
  await mount(PROD_OPS);
  await openPanel();
  for (const code of Object.keys(PROD_ROWS)) {
    const i = idxOf(code);
    const has = await page.evaluate(
      (n) =>
        (document.querySelector(`[data-ratify-row="${n}"]`)?.querySelectorAll('[data-ratify-proposal]')
          .length ?? 0) > 0,
      i,
    );
    if (has) covered += PROD_ROWS[code];
    else silent += PROD_ROWS[code];
  }
  for (const pass of [0, 1]) {
    await mount(PROD_OPS);
    await openPanel();
    const targets = await page.evaluate(
      (p) =>
        [...document.querySelectorAll('[data-ratify-row]')]
          .filter((r) => r.querySelectorAll('[data-ratify-proposal]').length > p)
          .map((r) => Number(r.getAttribute('data-ratify-row'))),
      pass,
    );
    for (const i of targets) {
      await page.locator(`[data-ratify-proposal="${i}.${pass}"]`).click();
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(200);
    for (const i of targets) {
      const v = JSON.parse(await snapshot(i));
      const machine = String(v.machineType ?? '');
      const ok =
        v.operationType !== 'TECH_CARD_OPERATION_TYPE_MACHINE' ||
        (!!machine.trim() && !machine.endsWith('_UNKNOWN'));
      const code = PROD[i].__name.split(' ·')[0];
      if (!ok) unsavable.push(`${code}.${pass} → machineType «${machine}»`);
    }
  }
  ck(
    unsavable.length === 0,
    `несохраняемых строк не произведено ни одной (покрыто ${covered} прод-строк из ${PROD_TOTAL}, молчат ${silent})`,
    unsavable.join(' | '),
  );
  ck(
    covered + silent === PROD_TOTAL,
    `${covered} + ${silent} = ${PROD_TOTAL}: разобраны ВСЕ прод-строки, ни одна форма не потеряна`,
    `${covered} + ${silent}`,
  );
}

// ─── ЦДЕФ: ПАНЕЛЬ НЕ ПОДСТАВЛЯЕТ НИЧЕГО (план М3) ──────────────────────────────────────────────
head('ЦДЕФ · ответ формы ПОБАЙТНО одинаков на каталоге С дефолтами и БЕЗ них');
{
  const run = async () => {
    await mount(PROD_OPS);
    await openPanel();
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ratify-row]')]
        .filter((r) => r.querySelectorAll('[data-ratify-proposal]').length > 0)
        .map((r) => Number(r.getAttribute('data-ratify-row'))),
    );
    for (const i of targets) {
      await page.locator(`[data-ratify-proposal="${i}.0"]`).click();
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(200);
    const out = {};
    for (const i of targets) out[nameAt(i)] = await snapshot(i);
    return out;
  };
  catalogBody = CATALOG_NO_DEFAULTS;
  const plain = await run();
  catalogBody = CATALOG_WITH_DEFAULTS;
  const withDefaults = await run();
  const drift = Object.keys(plain).filter((k) => plain[k] !== withDefaults[k]);
  ck(
    drift.length === 0,
    `дефолты не просочились ни в одну из ${Object.keys(plain).length} форм`,
    drift.join(', '),
  );

  // ЦДЕФ-ЖИВОСТЬ · ЗЕЛЕНЬ НАД ПУСТОЙ ПОПУЛЯЦИЕЙ НИЧЕГО НЕ УДОСТОВЕРЯЕТ. Цитата выше доказывает
  // что-то ровно постольку, поскольку дефолтам БЫЛО ЧЕМ просочиться. Проверяется это единственным
  // честным способом — КОНТРАСТОМ: на ТОМ ЖЕ каталоге и в ТОЙ ЖЕ карточке пикер СТРОКИ ШАГА
  // подставляет дефолт, а панель — нет. Две поверхности, один каталог, разные ответы: значит
  // разница в них, а не в фикстуре.
  await mount(PROD_OPS);
  await page.locator('[data-kind-picker="0"] button[data-combobox-trigger]').click();
  await page.waitForSelector('[data-kind-picker="0"] input[data-combobox-input]', { timeout: 10000 });
  await page.locator('[data-combobox-option="join_lockstitch"]').first().click();
  await page.waitForTimeout(300);
  const rowPicked = JSON.parse(await snapshot(0));
  ck(
    rowPicked.work === 'join_lockstitch',
    'контроль: пикер СТРОКИ ШАГА записал ту же работу',
    String(rowPicked.work),
  );
  ck(
    rowPicked.seamAllowanceMm === '10',
    'и подставил глобальный дефолт — значит дефолтам БЫЛО чем просочиться',
    String(rowPicked.seamAllowanceMm),
  );
  await openPanel();
  const panelTarget = idxOf('F8');
  await page.locator(`[data-ratify-proposal="${panelTarget}.0"]`).click();
  await page.waitForTimeout(250);
  const panelPicked = JSON.parse(await snapshot(panelTarget));
  ck(
    panelPicked.work === 'join_lockstitch',
    'панель на том же каталоге записала ту же работу',
    String(panelPicked.work),
  );
  ck(
    panelPicked.seamAllowanceMm === '',
    'а дефолт НЕ подставила: панель подтверждает имя, а не заполняет шаг',
    `«${panelPicked.seamAllowanceMm}»`,
  );
  catalogBody = CATALOG_NO_DEFAULTS;
}

// ─── ЦВВОД + Ц18 + ЦESC: НАСТОЯЩИЕ КЛАВИШИ ─────────────────────────────────────────────────────
head('ЦВВОД · Enter (настоящий) записывает первое предложение и уводит фокус на следующую строку');
await mount(PROD_OPS);
await openPanel();
{
  // Панель ставит фокус сама — на первую строку, которой есть что предложить.
  const focusedAtOpen = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-ratify-row'),
  );
  ck(
    focusedAtOpen === String(idxOf('F4')),
    'на открытии фокус стоит на первой строке с предложением',
    String(focusedAtOpen),
  );
  const target = idxOf('F4');
  const before = await snapshot(target);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const changed = diffFields(before, await snapshot(target));
  ck(changed.join(',') === 'work', 'Enter записал ровно работу', changed.join(',') || '<ничего>');
  const v = JSON.parse(await snapshot(target));
  ck(v.work === 'topstitch', 'и записал ПЕРВОЕ предложение строки', String(v.work));
  const nowAt = await page.evaluate(() => document.activeElement?.getAttribute('data-ratify-row'));
  ck(nowAt === String(target + 1), 'фокус ушёл на следующую строку', String(nowAt));
}

head('Ц18 · Enter на строке БЕЗ предложений не пишет ничего и всё равно переводит фокус');
{
  const target = idxOf('F3'); // расхождение: один вход на прямострочке, предложений нет
  await page.locator(`[data-ratify-row="${target}"]`).focus();
  ck(
    (await page.evaluate(() => document.activeElement?.getAttribute('data-ratify-row'))) ===
      String(target),
    'фокус переведён на строку расхождения',
  );
  ck(
    (await page.locator(`[data-ratify-row="${target}"] [data-ratify-proposal]`).count()) === 0,
    'у строки нет ни одного предложения',
  );
  const before = await snapshot(target);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  ck(
    diffFields(before, await snapshot(target)).length === 0,
    'Enter не написал НИЧЕГО',
    diffFields(before, await snapshot(target)).join(','),
  );
  const nowAt = await page.evaluate(() => document.activeElement?.getAttribute('data-ratify-row'));
  ck(nowAt === String(target + 1), 'и всё равно ушёл на следующую строку', String(nowAt));
}

head('ЦESC · Escape (настоящий) закрывает панель');
{
  ck((await page.locator('[data-ratify-panel]').count()) === 1, 'панель открыта');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ck(
    (await page.locator('[data-ratify-panel]').count()) === 0,
    'после Escape панели на экране НЕТ',
    String(await page.locator('[data-ratify-panel]').count()),
  );
  // И карточка под ней жива: закрытие панели — не выход из поля.
  ck(
    (await page.locator('[data-unnamed-steps]').count()) === 1,
    'счётчик под панелью на месте — закрылась именно панель',
  );
}

// ─── ЦПОЛН-2: ВЫБОР В КОМБОБОКСЕ ПИШЕТ ТУ ЖЕ РАБОТУ ТЕМ ЖЕ ПИСАТЕЛЕМ ───────────────────────────
head('ЦПОЛН · выбор в комбобоксе пишет ту же работу, что и кнопка, — и тем же писателем');
await mount(PROD_OPS);
await openPanel();
{
  const target = idxOf('F5'); // дыра каталога: кнопок нет, полный путь обязан быть
  const before = await snapshot(target);
  await page.locator(`[data-combobox-trigger="ratifyWork-${target}"]`).click();
  await page.waitForSelector(`[data-combobox-input="ratifyWork-${target}"]`, { timeout: 10000 });
  await page.locator('[data-combobox-option="moscow_hem"]').first().click();
  await page.waitForTimeout(250);
  const changed = diffFields(before, await snapshot(target));
  ck(
    changed.join(',') === 'work',
    'выбор в комбобоксе на молчащем ярусе изменил ровно work',
    changed.join(',') || '<ничего>',
  );
  ck(
    JSON.parse(await snapshot(target)).work === 'moscow_hem',
    'и записал выбранный токен',
    String(JSON.parse(await snapshot(target)).work),
  );
  ck(
    (await text(`[data-ratify-printed="${target}"]`)) === 'Hem — rolled (Moscow)',
    'строка немедленно зовётся ярлыком каталога',
    String(await text(`[data-ratify-printed="${target}"]`)),
  );
}

// ─── ЦСХЕМА: СЧЁТЧИК И ПАНЕЛЬ НАД ОБОИМИ РЕЖИМАМИ ──────────────────────────────────────────────
head('ЦСХЕМА · в режиме schematic кнопка на месте и панель открывает ту же карточку целиком');
await mount(TWELVE, { mode: 'schematic' });
{
  const schematic = await page.locator('[role="radiogroup"][aria-label="sequence view"] [role="radio"][aria-checked="true"]').first().textContent();
  ck(
    (schematic ?? '').trim() === 'schematic',
    'вид переключён на схему — и переключатель это подтверждает',
    String((schematic ?? '').trim()),
  );
  ck((await page.locator('[data-rail-step]').count()) === 0, 'рельса со строками в схеме нет');
  ck(
    (await page.locator('[data-ratify-open-panel]').count()) === 1,
    'кнопка ратификации на месте и в схеме: счётчик стоит НАД обоими режимами',
  );
  await openPanel();
  const rows = await page.locator('[data-ratify-row]').count();
  ck(rows === 12, 'панель рисует ту же карточку целиком — все двенадцать строк', String(rows));
  const target = 8;
  const before = await snapshot(target);
  await page.locator(`[data-ratify-proposal="${target}.0"]`).click();
  await page.waitForTimeout(200);
  ck(
    diffFields(before, await snapshot(target)).join(',') === 'work',
    'и запись из схемы такая же, как из списка',
    diffFields(before, await snapshot(target)).join(','),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ck((await page.locator('[data-ratify-panel]').count()) === 0, 'Escape закрывает панель и в схеме');
}

ck(pageErrors.length === 0, 'страница не бросала исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${bad === 0 ? 'ЗЕЛЁНАЯ' : `КРАСНАЯ: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
