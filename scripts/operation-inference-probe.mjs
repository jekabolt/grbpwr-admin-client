#!/usr/bin/env node
// СИСТЕМА ПЕРЕСТАЁТ СПРАШИВАТЬ ТО, ЧТО УЖЕ ЗНАЕТ — И НЕ НАЧИНАЕТ ВЫДУМЫВАТЬ.
//
// Проба стоит на двух ногах, и вторая важнее первой. Первая — что подсказка ПОЯВЛЯЕТСЯ там, где
// данные однозначны. Вторая — АНТИ-ЛОЖНАЯ ПОДСТАНОВКА: что на пустых, противоречивых, бессистемных
// и битых данных не появляется НИЧЕГО. Без второй ноги реализация «всегда подставляем
// что-нибудь» проходит первую целиком и зелёным.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   А. СПУСК ПО ГРАФУ СБОРКИ ДОХОДИТ ДО ДЕТАЛЕЙ. Вход шага — узел; спуск раскрывает его в
//      производителя и дальше в его входы. Половина входов на проде — узлы, и без спуска вывод
//      молчал бы на половине карточки, выглядя как «данных нет»;
//   Б. ОДИН КАНДИДАТ — ПОДСКАЗКА. Две детали рукава → рукав; деталь карманки → карман;
//   В. КОНФЛИКТ — МОЛЧАНИЕ. Узел из рукава, полочки и спинки; и второй род конфликта: подкладочная
//      спинка, где ткань говорит «подклад», а имя — «спинка»;
//   Г. ИМЕНА БЕЗ СИСТЕМЫ И БИТЫЕ — МОЛЧАНИЕ. `plank`, `triangle_1_os_M`, `Octagon_Top_OS_M` и две
//      детали прода с битой кодировкой (`?_8`, `?_9`);
//   Д. ТКАНЬ ЧИТАЕТСЯ ПО ЦЕПОЧКЕ «деталь → блок чертежа → назначение строки BOM», тем же
//      правилом «сначала назначение, иначе старая строка», что и на сервере;
//   Е. НИТКА — при единственной подходящей строке; на не-швейном шаге и при двух нитках молчим;
//   Ж. УТЮГ — при единственном профиле процесса; два профиля и профиль чужого процесса не в счёт;
//   З. АНТИ-ЛОЖНАЯ ПОДСТАНОВКА: пустая карточка — все четыре вывода молчат;
//   И. РЕГИСТРОНЕЗАВИСИМОСТЬ: на проде регистр смешанный в пределах одной карточки;
//   К. ЦИКЛ НЕ ВЕШАЕТ: взаимные ссылки узлов заканчиваются признанием «спуск неполон»;
//   Л. НОРМА ВРЕМЕНИ — гоуст «в прошлый раз», и только от шага ТОГО ЖЕ вида РАНЬШЕ по карточке;
//   М. ЖИВОЙ DOM: метка «suggested» видна, значение стоит в поле, касание метки снимает и то и
//      другое, подстановка НЕ помечает форму грязной, а на конфликте метки нет вовсе.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ:
//   node scripts/operation-inference-probe.mjs                    прогон
//   node scripts/operation-inference-probe.mjs --mutate-no-descent  узлы не раскрываются —
//                                                                  цитата А обязана покраснеть
//   node scripts/operation-inference-probe.mjs --mutate-first-wins  арбитр ослаблен до «первый
//                                                                  источник побеждает» — цитата В
//   node scripts/operation-inference-probe.mjs --mutate-case        сопоставление имён стало
//                                                                  регистрозависимым — цитата И
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui):
//   --mutate-no-descent → 8 провалов: спуск не выходит за первый ярус, шаг с входом-узлом теряет
//                         все детали, и «конфликт» вырождается в «нет данных» — то есть вывод
//                         молчит на половине карточки, выглядя исправным. Откатано.
//   --mutate-first-wins → 6 провалов, включая живой DOM: на конфликте появляется метка и
//                         подставляется зона `back` там, где кандидатов трое. Ровно та ложная
//                         подстановка, ради запрета которой заведён арбитр. Откатано.
//   --mutate-case       → 16 провалов: заглавные имена прода (`FP_OS`, `SL_OUT_L`) перестают
//                         разбираться вовсе, потому что заглавная буква становится разделителем.
//                         Откатано.
//
// Половина «живой DOM» требует playwright: он не в зависимостях, ищется в кэше npx и МОЛЧА
// пропускается. Функциональные цитаты считаются в node и красят пробу всегда.

import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_NO_DESCENT = process.argv.includes('--mutate-no-descent');
const MUTATE_FIRST_WINS = process.argv.includes('--mutate-first-wins');
const MUTATE_CASE = process.argv.includes('--mutate-case');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── мутации ────────────────────────────────────────────────────────────────────────────────────
const DESCENT_FIX = `      unitsExpanded++;
      for (const j of producers) walk(steps[j]?.inputKeys ?? [], j, depth + 1);`;
const DESCENT_BLIND = `      unitsExpanded++;
      void producers;`;

const ARBITER_FIX = `  return { value: candidates.length === 1 ? candidates[0] : '', candidates };`;
const ARBITER_FIRST = `  return { value: sources.find((s) => s.zones.length > 0)?.zones[0] ?? '', candidates };`;

const CASE_FIX = `    .toLowerCase()
    .split(/[^a-z0-9]+/)`;
const CASE_STRICT = `    .split(/[^a-z0-9]+/)`;

const mutation = (find, replaceWith) => ({
  name: 'inference-mutation',
  setup(b) {
    b.onLoad({ filter: /operation-inference\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(find)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(find, replaceWith), loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_NO_DESCENT) plugins.push(mutation(DESCENT_FIX, DESCENT_BLIND));
if (MUTATE_FIRST_WINS) plugins.push(mutation(ARBITER_FIX, ARBITER_FIRST));
if (MUTATE_CASE) plugins.push(mutation(CASE_FIX, CASE_STRICT));

const outfile = resolve(REPO, `scripts/.operation-inference-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'operation-inference-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
});
const {
  arbitrate,
  inferPress,
  inferStep,
  inferThread,
  inferZone,
  isBrokenPieceName,
  smvHint,
  stepPieceLeaves,
  zonesFromPieceName,
  emptyCard,
  PIECE_NAME_ZONE_DRAFT,
} = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── фикстура: карточка с именами деталей ПРОДА ──────────────────────────────────────────────────
//
// Имена взяты из замера 2026-08-22 буквально, включая смешанный регистр и две детали с битой
// кодировкой. Выдуманные «удобные» имена доказывали бы работу словаря на словаре.
const Z = (s) => `TECH_CARD_GARMENT_ZONE_${s}`;
const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';
const LOCKSTITCH = 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH';

const PIECES = [
  { lineKey: 'p-fp', name: 'FP_OS' },
  { lineKey: 'p-bp', name: 'BP_OS' },
  { lineKey: 'p-sl-l', name: 'SL_OUT_L' },
  { lineKey: 'p-sl-r', name: 'SL_OUT_R' },
  { lineKey: 'p-lin-bp', name: 'BP_LIN_L_2' },
  { lineKey: 'p-pck', name: 'PCK_BAG_OS' },
  { lineKey: 'p-plank', name: 'plank' },
  { lineKey: 'p-tri', name: 'triangle_1_os_M' },
  { lineKey: 'p-oct', name: 'Octagon_Top_OS_M' },
  { lineKey: 'p-broken', name: '?_8' },
];

const BOM = [
  {
    lineKey: 'b-shell',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    name: 'shell twill',
  },
  {
    lineKey: 'b-lining',
    section: 'TECH_CARD_BOM_SECTION_LINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    name: 'cupro lining',
  },
  {
    lineKey: 'b-pocketing',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_POCKETING',
    name: 'pocketing',
  },
  {
    lineKey: 'b-thread',
    section: 'TECH_CARD_BOM_SECTION_THREAD',
    kind: 'TECH_CARD_BOM_KIND_SEWING_THREAD',
    name: 'core-spun 120',
  },
];

const ALIASES = [
  { pieceLineKey: 'p-fp', blockName: 'FP_OS', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
  { pieceLineKey: 'p-bp', blockName: 'BP_OS', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
  { pieceLineKey: 'p-sl-l', blockName: 'SL_OUT_L', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
  { pieceLineKey: 'p-sl-r', blockName: 'SL_OUT_R', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
  // ЛЕГАСИ-ПОЛОВИНА ЦЕПОЧКИ: связь записана НА СТРОКУ, назначения на ней тогда не было. Правило
  // «сначала назначение, иначе старая строка» обязано разрешить её сегодняшним BOM.
  { pieceLineKey: 'p-pck', blockName: 'PCK_BAG_OS', bomLineKey: 'b-pocketing' },
  {
    pieceLineKey: 'p-lin-bp',
    blockName: 'BP_LIN_L_2',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
  },
];

const sew = (inputKeys, extra = {}) => ({
  operationType: MACHINE,
  machineType: LOCKSTITCH,
  inputKeys,
  outputUnitKey: '',
  ...extra,
});

const STEPS = [
  /* 0 */ sew(['p-sl-l', 'p-sl-r'], { outputUnitKey: 'SLV' }),
  /* 1 */ sew(['SLV']),
  /* 2 */ sew(['SLV', 'p-fp', 'p-bp'], { outputUnitKey: 'SHELL' }),
  /* 3 */ sew(['SHELL']),
  /* 4 */ sew(['p-plank']),
  /* 5 */ sew(['p-broken']),
  /* 6 */ sew(['p-pck']),
  /* 7 */ sew(['p-lin-bp']),
  /* 8 */ sew(['GHOST-UNIT']),
  /* 9 */ sew(['p-oct', 'p-tri']),
];

const CARD = { pieces: PIECES, bomLines: BOM, aliases: ALIASES, presses: [], steps: STEPS };
const card = (over = {}) => ({ ...CARD, ...over });

// ─── ЦИТАТА А: спуск по узлам доходит до деталей ─────────────────────────────────────────────────
head('цитата А — вход-узел раскрывается до деталей');

{
  const d = stepPieceLeaves(CARD, 1);
  ck(d.unitsExpanded === 1, 'узел раскрыт', `раскрыто ${d.unitsExpanded}`);
  ck(
    d.pieces.join(',') === 'p-sl-l,p-sl-r',
    'спуск дошёл до деталей производителя',
    d.pieces.join(', ') || '(пусто)',
  );
  ck(d.complete, 'спуск полон');
  ck(
    inferZone(CARD, 1).value === Z('SLEEVE'),
    'зона выведена ЧЕРЕЗ узел, а не мимо него',
    inferZone(CARD, 1).value || '(молчит)',
  );
}

{
  // Два яруса: SHELL произведён из УЗЛА SLV и двух деталей — спуск обязан пройти оба.
  const d = stepPieceLeaves(CARD, 3);
  ck(
    d.pieces.join(',') === 'p-fp,p-bp,p-sl-l,p-sl-r',
    'двухъярусный спуск собрал все листья',
    d.pieces.join(', ') || '(пусто)',
  );
  ck(d.unitsExpanded === 2, 'раскрыты оба узла', `раскрыто ${d.unitsExpanded}`);
}

// ─── ЦИТАТА Б: один кандидат — подсказка ────────────────────────────────────────────────────────
head('цитата Б — кандидат один: подсказка есть');

{
  const z = inferZone(CARD, 0);
  ck(z.value === Z('SLEEVE'), 'две детали рукава → рукав', z.value || '(молчит)');
  ck(z.reason === 'ok', 'причина — «выведено»', z.reason);
}

{
  const z = inferZone(CARD, 6);
  ck(z.value === Z('POCKET'), 'деталь карманки → карман', z.value || '(молчит)');
  // Оба источника согласны — и это НЕ конфликт: арбитр считает РАЗЛИЧНЫХ кандидатов, а не
  // говорящие источники.
  ck(z.sources.length === 2, 'сошлись оба источника: ткань и имя', String(z.sources.length));
}

// ─── ЦИТАТА В: конфликт — молчание ──────────────────────────────────────────────────────────────
head('цитата В — источники разошлись: молчим');

{
  const z = inferZone(CARD, 3);
  ck(z.value === '', 'узел из рукава, полочки и спинки → подсказки НЕТ', z.value);
  ck(z.reason === 'conflict', 'причина названа конфликтом', z.reason);
  ck(z.candidates.length === 3, 'кандидатов три', z.candidates.join(', '));
}

{
  // Второй род конфликта, и он же — открытый вопрос к владельцу: ткань говорит «подклад», имя —
  // «спинка». Оба утверждения истинны, а поле одно. Молчим.
  const z = inferZone(CARD, 7);
  ck(z.value === '', 'подкладочная спинка: ткань и имя разошлись → молчим', z.value);
  ck(
    z.candidates.join(',') === [Z('BACK'), Z('LINING')].sort().join(','),
    'оба кандидата названы',
    z.candidates.join(', '),
  );
}

{
  ck(arbitrate([{ id: 'work', zones: [Z('HEM')] }]).value === Z('HEM'), 'арбитр: один — отвечает');
  ck(
    arbitrate([
      { id: 'fabric', zones: [Z('LINING')] },
      { id: 'piece-name', zones: [Z('BACK')] },
    ]).value === '',
    'арбитр: два — молчит',
  );
  ck(
    arbitrate([
      { id: 'fabric', zones: [Z('LINING')] },
      { id: 'piece-name', zones: [Z('LINING')] },
    ]).value === Z('LINING'),
    'арбитр: два источника об одном — отвечает',
  );
  ck(arbitrate([]).value === '', 'арбитр: никто не сказал — молчит');
}

// ─── ЦИТАТА Г: имена без системы и битые ────────────────────────────────────────────────────────
head('цитата Г — по бессистемным и битым именам молчим, а не гадаем');

{
  ck(inferZone(CARD, 4).value === '', '`plank` ничего не выводит', inferZone(CARD, 4).value);
  ck(inferZone(CARD, 4).reason === 'no-data', 'и причина — «нет данных»', inferZone(CARD, 4).reason);
  ck(
    inferZone(CARD, 9).value === '',
    '`Octagon_Top_OS_M` + `triangle_1_os_M` — молчание',
    inferZone(CARD, 9).value,
  );
  ck(isBrokenPieceName('?_8') && isBrokenPieceName('?_9'), 'битые имена прода опознаны битыми');
  ck(!isBrokenPieceName('FP_OS'), 'здоровое имя битым не считается');
  ck(inferZone(CARD, 5).value === '', 'по битому имени молчим', inferZone(CARD, 5).value);
  ck(
    zonesFromPieceName('?_8').area.length === 0 && zonesFromPieceName('?_8').fabric.length === 0,
    'битое имя не даёт ни одной оси',
  );
}

// ─── ЦИТАТА Д: цепочка ткани ────────────────────────────────────────────────────────────────────
head('цитата Д — ткань читается по цепочке «деталь → блок → назначение»');

{
  const only = (keys) =>
    inferZone(card({ steps: [sew(keys)] }), 0);
  ck(only(['p-lin-bp']).candidates.includes(Z('LINING')), 'подкладка выводится в кандидаты');
  // Легаси-половина: связь на строку, назначение появилось на строке позже.
  ck(only(['p-pck']).value === Z('POCKET'), 'связь на СТАРУЮ строку разрешается сегодняшним BOM');
  // Основная ткань зону не сужает: иначе она заглушила бы область на каждом шаге.
  const mainOnly = inferZone(
    card({ steps: [sew(['p-fp'])], pieces: [{ lineKey: 'p-fp', name: 'panel_OS' }] }),
    0,
  );
  ck(mainOnly.value === '', 'основная ткань зону не сужает', mainOnly.value);
  // Деталь без связи с блоком — источник ткани молчит целиком, а не «наполовину знает».
  const halfKnown = inferZone(card({ steps: [sew(['p-pck', 'p-plank'])] }), 0);
  ck(
    !halfKnown.sources.some((s) => s.id === 'fabric'),
    'деталь без назначения гасит источник ткани',
    halfKnown.sources.map((s) => s.id).join(', '),
  );
}

// ─── ЦИТАТА Е: нитка ────────────────────────────────────────────────────────────────────────────
head('цитата Е — нитка при единственной подходящей строке');

{
  const one = inferThread(card({ steps: [sew(['p-fp'])] }), 0);
  ck(one.lineKey === 'b-thread', 'единственная ниточная строка предложена', one.lineKey);

  const two = inferThread(
    card({
      steps: [sew(['p-fp'])],
      bomLines: [
        ...BOM,
        {
          lineKey: 'b-thread-2',
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_SEWING_THREAD',
          name: 'core-spun 80',
        },
      ],
    }),
    0,
  );
  ck(two.lineKey === '', 'две нитки одного вида → молчим', two.lineKey);
  ck(two.reason === 'conflict', 'и причина названа', two.reason);

  // Предпочтение вида СУЖАЕТ: у оверлока оверлочная нитка одна такая.
  const overlock = inferThread(
    card({
      steps: [
        sew(['p-fp'], { machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK' }),
      ],
      bomLines: [
        ...BOM,
        {
          lineKey: 'b-ovl',
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_OVERLOCK_THREAD',
          name: 'overlock 150',
        },
      ],
    }),
    0,
  );
  ck(overlock.lineKey === 'b-ovl', 'оверлок сузил две нитки до своей', overlock.lineKey);

  const press = inferThread(
    card({ steps: [{ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['p-fp'] }] }),
    0,
  );
  ck(press.lineKey === '', 'ВТО-шаг нитку не ест — не спрашиваем', press.lineKey);
  ck(press.reason === 'not-a-thread-step', 'и это сказано словом', press.reason);

  const already = inferThread(
    card({ steps: [sew(['p-fp'], { bomLineKeys: ['b-thread'] })] }),
    0,
  );
  ck(already.lineKey === '', 'нитка уже привязана — не предлагаем второй раз', already.lineKey);
}

// ─── ЦИТАТА Ж: утюг ─────────────────────────────────────────────────────────────────────────────
head('цитата Ж — утюг при единственном профиле процесса');

{
  const pressStep = [{ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['p-fp'] }];
  const one = inferPress(
    card({
      steps: pressStep,
      presses: [{ profileKey: 'PR1', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON' }],
    }),
    0,
  );
  ck(one.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_IRON', 'единственный пресс предложен');
  ck(one.profileKey === 'PR1', 'вместе с ключом профиля — пара, а не половина', one.profileKey);

  const two = inferPress(
    card({
      steps: pressStep,
      presses: [
        { profileKey: 'PR1', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON' },
        { profileKey: 'PR2', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER' },
      ],
    }),
    0,
  );
  ck(two.pressEquipment === '', 'два профиля → молчим', two.pressEquipment);

  // Профиль ЧУЖОГО процесса в счёт не идёт — тем же предикатом, что у пикера и у лестницы.
  const foreign = inferPress(
    card({
      steps: pressStep,
      presses: [
        { profileKey: 'PR1', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON' },
        {
          profileKey: 'PR2',
          pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
          operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
        },
      ],
    }),
    0,
  );
  ck(
    foreign.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_IRON',
    'профиль дублирования не мешает приутюживанию',
    foreign.pressEquipment,
  );

  const sewn = inferPress(card({ steps: [sew(['p-fp'])], presses: [] }), 0);
  ck(sewn.reason === 'not-a-press-step', 'на швейном шаге про утюг не спрашивают', sewn.reason);

  const already = inferPress(
    card({
      steps: [
        {
          operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
          inputKeys: ['p-fp'],
          pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
        },
      ],
      presses: [{ profileKey: 'PR1', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON' }],
    }),
    0,
  );
  ck(already.pressEquipment === '', 'заполненное не переписываем', already.pressEquipment);
}

// ─── ЦИТАТА З: АНТИ-ЛОЖНАЯ ПОДСТАНОВКА ──────────────────────────────────────────────────────────
head('цитата З — данных нет: не появляется НИЧЕГО');

{
  const bare = { ...emptyCard, steps: [sew([])] };
  const out = inferStep(bare, 0);
  ck(out.zone.value === '', 'пустая карточка: зона молчит', out.zone.value);
  ck(out.thread.lineKey === '', 'пустая карточка: нитка молчит', out.thread.lineKey);
  ck(out.press.pressEquipment === '', 'пустая карточка: утюг молчит', out.press.pressEquipment);
  ck(out.smv.smv === '', 'пустая карточка: нормы времени нет', out.smv.smv);
  ck(out.zone.candidates.length === 0, 'и кандидатов нет ни одного', out.zone.candidates.join(','));

  // Шаг вообще без входов на ПОЛНОЙ карточке — тоже молчание: детали есть, но не у этого шага.
  const noInputs = inferZone(card({ steps: [sew([])] }), 0);
  ck(noInputs.value === '', 'шаг без входов ничего не выводит', noInputs.value);

  // Шага с таким номером нет — вывод обязан ответить молчанием, а не упасть.
  const outOfRange = inferStep(CARD, 99);
  ck(outOfRange.zone.value === '', 'несуществующий шаг: молчание, а не исключение');
}

// ─── ЦИТАТА И: регистронезависимость ────────────────────────────────────────────────────────────
head('цитата И — регистр имени ничего не решает');

{
  const upper = zonesFromPieceName('Flap_os_M').area.join(',');
  const lower = zonesFromPieceName('flap_os_m').area.join(',');
  const shout = zonesFromPieceName('FLAP_OS_M').area.join(',');
  ck(upper === Z('POCKET'), '`Flap_os_M` разобран', upper || '(пусто)');
  ck(upper === lower && lower === shout, 'три регистра — один ответ', `${upper} | ${lower} | ${shout}`);
  ck(
    zonesFromPieceName('FP_OS').area.join(',') === Z('FRONT'),
    'заглавное `FP_OS` разобрано',
    zonesFromPieceName('FP_OS').area.join(',') || '(пусто)',
  );
  ck(
    PIECE_NAME_ZONE_DRAFT.every((r) => r.token === r.token.toLowerCase()),
    'сам словарь написан в нижнем регистре — иначе половина строк недостижима',
  );
}

// ─── ЦИТАТА К: цикл не вешает ───────────────────────────────────────────────────────────────────
head('цитата К — взаимные ссылки узлов заканчиваются признанием');

{
  // Незаконная карточка (проход правил её отвергнет), но спуск обязан ОСТАНОВИТЬСЯ и сказать,
  // что он неполон, а не крутиться.
  const loop = card({
    steps: [
      sew(['B'], { outputUnitKey: 'A' }),
      sew(['A'], { outputUnitKey: 'B' }),
      sew(['A', 'B']),
    ],
  });
  const d = stepPieceLeaves(loop, 2);
  ck(!d.complete, 'спуск признан неполным', JSON.stringify(d.dangling));
  ck(d.pieces.length === 0, 'ни одна деталь не придумана', d.pieces.join(','));
  ck(inferZone(loop, 2).reason === 'incomplete-descent', 'и зона молчит по этой причине');

  const ghost = stepPieceLeaves(CARD, 8);
  ck(!ghost.complete && ghost.dangling.includes('GHOST-UNIT'), 'висячий вход назван поимённо');
  ck(inferZone(CARD, 8).value === '', 'по оборванному спуску не выводим', inferZone(CARD, 8).value);
}

// ─── ЦИТАТА Л: норма времени ────────────────────────────────────────────────────────────────────
head('цитата Л — «в прошлый раз было столько-то»');

{
  const withTimes = card({
    steps: [
      sew(['p-fp'], { smv: '1.2' }),
      { operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['p-bp'], smv: '0.4' },
      sew(['p-bp']),
    ],
  });
  const hint = smvHint(withTimes, 2);
  ck(hint.smv === '1.2', 'подсказано время шага ТОГО ЖЕ вида', hint.smv || '(молчит)');
  ck(hint.fromStep === 1, 'назван человеческий номер шага-источника', String(hint.fromStep));

  const pressHint = smvHint(withTimes, 1);
  ck(pressHint.smv === '', 'раньше не было шага того же вида — молчим', pressHint.smv);

  const filled = smvHint(
    card({ steps: [sew(['p-fp'], { smv: '1.2' }), sew(['p-bp'], { smv: '9.9' })] }),
    1,
  );
  ck(filled.smv === '', 'заполненное поле гоуста не получает', filled.smv);
}

// ─── ЖИВОЙ DOM ──────────────────────────────────────────────────────────────────────────────────
head('живой DOM — метка «suggested» стоит рядом со значением и снимается касанием');

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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
const mod = pwEntry ? await import(pwEntry) : null;
const chromium = mod?.chromium ?? mod?.default?.chromium;
if (!chromium) {
  console.log('  ..  playwright не найден — половина «живой DOM» пропущена (это не отказ)');
} else {
  const bundleFile = resolve(tmpdir(), `operation-inference-dom-${process.pid}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'operation-inference-dom-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: bundleFile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
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
    plugins,
  });
  const bundle = readFileSync(bundleFile, 'utf8');
  rmSync(bundleFile, { force: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });

  const formCard = (ops) => ({
    pieces: PIECES.map((p) => ({ ...p, materials: [] })),
    bomItems: BOM,
    pieceDxfAliases: ALIASES,
    operations: ops,
  });

  const has = async (sel) => (await page.locator(sel).count()) > 0;
  // ОЖИДАНИЕ, КОТОРОЕ НЕ РОНЯЕТ ПРОБУ. Под мутацией метка не появляется НИКОГДА — это и есть
  // ожидаемая краснота, и она обязана прочитаться строкой FAIL, а не стектрейсом посреди вывода.
  const settle = async (sel, ms = 12000) => {
    try {
      await page.waitForSelector(sel, { timeout: ms });
    } catch {
      /* отсутствие органа — тоже результат; его проверяет цитата ниже */
    }
  };
  const zoneOf = async () => (await page.evaluate(() => window.__inference.values()))[0]?.zone;
  // «Незаполнено» на проводе имеет два написания: ключа нет вовсе (черновик, который никто не
  // трогал) и явный `UNKNOWN` (мы отозвали подстановку). Проба обязана принимать оба — иначе она
  // проверяла бы форму записи пустоты, а не пустоту.
  const unset = (v) => !v || v === 'TECH_CARD_GARMENT_ZONE_UNKNOWN';

  // (1) Кандидат один — значение стоит в поле, и рядом метка.
  await page.evaluate((c) => window.__inference.mount(c), formCard([sew(['p-sl-l', 'p-sl-r'])]));
  await settle('[data-suggested="zone"]');
  ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
  ck(await has('[data-suggested="zone"]'), 'метка «suggested» нарисована у зоны');
  const markText = (
    (await has('[data-suggested="zone"]'))
      ? ((await page.locator('[data-suggested="zone"]').first().textContent()) ?? '')
      : ''
  )
    .trim()
    .toLowerCase();
  ck(markText.includes('suggested'), 'метка называет себя подстановкой', markText);
  ck(markText.includes('sleeve'), 'метка называет подставленное значение', markText);
  ck((await zoneOf()) === Z('SLEEVE'), 'значение действительно стоит в форме', await zoneOf());
  ck(
    (await page.evaluate(() => window.__inference.dirty())) === false,
    'подстановка НЕ пометила форму грязной',
  );

  // (2) Касание метки снимает и метку, и значение.
  if (await has('[data-suggested="zone"]')) {
    await page.locator('[data-suggested="zone"]').first().click();
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-suggested="zone"]').length === 0,
        undefined,
        { timeout: 12000 },
      );
    } catch {
      /* метка не ушла — это провал цитаты ниже, а не крушение пробы */
    }
  }
  ck(!(await has('[data-suggested="zone"]')), 'метка снята касанием');
  ck(
    (await zoneOf()) === 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
    'вместе с меткой ушло и подставленное значение',
    String(await zoneOf()),
  );

  // (3) АНТИ-ЛОЖНАЯ ПОЛОВИНА В DOM: конфликт — метки нет вовсе, поле пустое.
  await page.evaluate(
    (c) => window.__inference.mount(c),
    formCard([sew(['p-sl-l', 'p-fp', 'p-bp'])]),
  );
  await settle('[data-kind-picker]');
  await page.waitForTimeout(400);
  ck(!(await has('[data-suggested="zone"]')), 'на конфликте метки нет');
  ck(unset(await zoneOf()), 'и зона осталась незаполненной', String(await zoneOf()));

  // (4) Заполненную зону подстановка не трогает — ответ человека старше вывода.
  await page.evaluate(
    (c) => window.__inference.mount(c),
    formCard([sew(['p-sl-l', 'p-sl-r'], { zone: 'TECH_CARD_GARMENT_ZONE_HEM' })]),
  );
  await settle('[data-kind-picker]');
  await page.waitForTimeout(400);
  ck((await zoneOf()) === Z('HEM'), 'заполненная зона не переписана', String(await zoneOf()));
  ck(!(await has('[data-suggested="zone"]')), 'и метки над чужим ответом нет');

  await browser.close();
}

console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : 'ПРОВАЛОВ: ' + bad}${
    MUTATE_NO_DESCENT ? '  (мутация «узлы не раскрываются»)' : ''
  }${MUTATE_FIRST_WINS ? '  (мутация «первый источник побеждает»)' : ''}${
    MUTATE_CASE ? '  (мутация «регистр важен»)' : ''
  }`,
);
process.exit(bad === 0 ? 0 : 1);
