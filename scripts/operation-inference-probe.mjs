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
//   М. ЖИВОЙ DOM: подставленное значение видно в настоящем поле и не делает форму грязной.
//      Оператор может заменить или очистить зону, удалить предложенную нитку, сменить шаг.
//      Конфликт оставляет зону пустой. Заполненные зона, утюг и нитка сохраняют свой ответ.
//
//// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ:
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
//   --mutate-first-wins → 6 провалов, включая живой DOM: на конфликте появляется значение и
//                         подставляется зона `back` там, где кандидатов трое. Ровно та ложная
//                         подстановка, ради запрета которой заведён арбитр. Откатано.
//   --mutate-case       → 16 провалов: заглавные имена прода (`FP_OS`, `SL_OUT_L`) перестают
//                         разбираться вовсе, потому что заглавная буква становится разделителем.
//                         Откатано.
//
// МУТАЦИИ РЕВЬЮ R5 (2026-08-22), сверх авторских. До усиления пробы все четыре проходили ЗЕЛЁНЫМИ:
//   · битое имя скипается вместо гашения источника → фикстура держала битую деталь только в
//     одиночку, и сосед FP_OS дарил шагу «front»;
//   · спуск берёт только ПОСЛЕДНЕГО производителя узла → вилка (узел произведён дважды) теряла
//     половину листьев и подсказывала «back» по оставшейся;
//   · метка '' детали из двух полос открывала резерв по имени → «lining» на детали из верха и
//     карманки, reason: ok (живой дефект кода, починен этим же ревью);
//   · сырой ключ связки (без свёртки `pieceRefKey`) → промах мимо живого назначения и снова
//     «lining» по имени (живой дефект кода, починен этим же ревью).
// Первые две были вакуумом пробы, последние две — дефектами кода. Все четыре теперь красные:
// 2/2/2/1 провалов соответственно, каждая — своей именной цитатой.
//
// Половина «живой DOM» требует playwright: он не в зависимостях, ищется в кэше npx и МОЛЧА
// пропускается. Функциональные цитаты считаются в node и красят пробу всегда.

import { build as esbuild } from './probe-esbuild.mjs';
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
  PURPOSE_ZONE_DRAFT,
  KIND_ZONE_DRAFT,
  zoneOptions,
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

{
  // ПОГЛОЩЕНИЕ: `BODY + рукав → BODY` дописывает узел ВТОРЫМ шагом, и листья несут ОБА
  // производителя (правило спуска, названное в шапке модуля словами — теперь и цитатой).
  const absorb = card({
    steps: [
      sew(['p-fp', 'p-bp'], { outputUnitKey: 'BODY' }),
      sew(['BODY', 'p-sl-l'], { outputUnitKey: 'BODY' }),
      sew(['BODY']),
    ],
  });
  const da = stepPieceLeaves(absorb, 2);
  ck(
    da.complete && da.pieces.join(',') === 'p-fp,p-bp,p-sl-l',
    'поглощение: спуск собрал листья обоих производителей',
    da.pieces.join(', ') || '(пусто)',
  );

  // ВИЛКА: узел произведён дважды НЕЗАВИСИМО. Проход правил такой черновик отвергнет, но
  // подсказка живёт именно на черновиках — и спуск обязан взять ОБОИХ производителей: «последний
  // побеждает» терял бы половину листьев и рождал ложную подсказку по оставшейся половине
  // (мутация ревью R5: `producers.slice(-1)` проходила пробу зелёной).
  const fork = card({
    steps: [
      sew(['p-fp'], { outputUnitKey: 'K' }),
      sew(['p-bp'], { outputUnitKey: 'K' }),
      sew(['K']),
    ],
  });
  const df = stepPieceLeaves(fork, 2);
  ck(
    df.pieces.join(',') === 'p-fp,p-bp',
    'вилка: листья обоих производителей, а не «последнего»',
    df.pieces.join(', ') || '(пусто)',
  );
  const zf = inferZone(fork, 2);
  ck(zf.value === '', 'и по вилке молчим: полочка против спинки', zf.value || '(молчит)');
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

  // Битое имя СРЕДИ здоровых гасит источник имён ЦЕЛИКОМ: «в имени нет наших токенов» — не то же
  // самое, что «имя говорит о другой области». Скип битой детали оставлял бы FRONT от соседки —
  // подсказка по недосмотренному множеству (мутация ревью R5: `continue` вместо гашения
  // проходила пробу зелёной, потому что битое имя жило в фикстуре только в одиночку).
  const mixed = inferZone(card({ steps: [sew(['p-broken', 'p-fp'])] }), 0);
  ck(mixed.value === '', 'битое имя среди здоровых — молчание, а не FRONT', mixed.value || '(молчит)');
  ck(
    !mixed.sources.some((s) => s.id === 'piece-name'),
    'мнение имён не образуется вовсе',
    mixed.sources.map((s) => s.id).join(', ') || '(пусто)',
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

  // ДЕТАЛЬ ИЗ ДВУХ ПОЛОС: её же связки говорят «верх» и «карманка», то есть сильный источник
  // ответил «неоднозначно». Резервный ход по имени тут ЗАПРЕЩЁН: имя `LIN_INS` кричит «подклад»,
  // и слабый источник, перекрикивающий сильный, — это ложная подсказка с полной уверенностью
  // (найдено ревью R5: до починки этот вход отвечал «lining», reason: ok).
  const twoCloths = inferZone(
    card({
      pieces: [...PIECES, { lineKey: 'p-two', name: 'LIN_INS' }],
      aliases: [
        ...ALIASES,
        { pieceLineKey: 'p-two', blockName: 'LIN_INS_A', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
        {
          pieceLineKey: 'p-two',
          blockName: 'LIN_INS_B',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_POCKETING',
        },
      ],
      steps: [sew(['p-two'])],
    }),
    0,
  );
  ck(twoCloths.value === '', 'деталь из двух полос: имя не перекрикивает связки', twoCloths.value || '(молчит)');
  ck(
    !twoCloths.sources.some((s) => s.id === 'fabric'),
    'источник ткани погашен, а не подменён именем',
    twoCloths.sources.map((s) => s.id).join(', ') || '(пусто)',
  );

  // И конфликт, единожды увиденный, НЕ РАССАСЫВАЕТСЯ следующей строкой: сама метка '' falsy, и
  // сравнение по truthiness давало третьей связке затереть её своим назначением —
  // main+lining+lining отвечала «lining», reason: ok (найдено ревью R5).
  const threeAliases = inferZone(
    card({
      pieces: [...PIECES, { lineKey: 'p-three', name: 'BAG_INS' }],
      aliases: [
        ...ALIASES,
        { pieceLineKey: 'p-three', blockName: 'A', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
        { pieceLineKey: 'p-three', blockName: 'B', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING' },
        { pieceLineKey: 'p-three', blockName: 'C', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING' },
      ],
      steps: [sew(['p-three'])],
    }),
    0,
  );
  ck(
    threeAliases.value === '',
    'третья связка не рассасывает конфликт двух полос',
    threeAliases.value || '(молчит)',
  );

  // КЛЮЧ ДЕТАЛИ В СВЯЗКЕ ХРАНИТСЯ СВЁРНУТЫМ (trim + нижний регистр — контракт `pieceRefKey`, так
  // пишут диалог сопоставления и сервер). Сырое сравнение промахивалось мимо живого назначения и
  // открывало резервный ход по имени: `LIN_2` с связкой на карманку отвечал «lining»
  // (найдено ревью R5). Внутри графа сборки ключи при этом остаются побайтными, как у прохода.
  const folded = inferZone(
    card({
      pieces: [...PIECES, { lineKey: 'P-CASE', name: 'LIN_2' }],
      aliases: [...ALIASES, { pieceLineKey: 'p-case', blockName: 'LIN_2', bomLineKey: 'b-pocketing' }],
      steps: [sew(['P-CASE'])],
    }),
    0,
  );
  ck(
    folded.value === Z('POCKET'),
    'связка со свёрнутым ключом найдена: отвечает ткань, а не имя',
    folded.value || '(молчит)',
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

  // Правка словаря — одна строка одной таблицы, и эта цитата держит её границу: зона, которой нет
  // в пикере, подставилась бы значением, которое человек не может ни прочитать подписью, ни
  // выбрать сам (ровно поэтому в словаре нет cuff/hood/yoke).
  const legal = new Set(zoneOptions.map((o) => o.value));
  const drafted = [
    ...PIECE_NAME_ZONE_DRAFT.map((r) => r.zone),
    ...Object.values(PURPOSE_ZONE_DRAFT),
    ...Object.values(KIND_ZONE_DRAFT),
  ];
  ck(
    drafted.every((z) => legal.has(z)),
    'каждая зона всех трёх словарей — значение, которое примет селект',
    drafted.filter((z) => !legal.has(z)).join(', ') || '(все легальны)',
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
head('живой DOM — подстановка, ручной ответ и отзыв через настоящие контролы');

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

  const editor = page.locator('[data-kind-picker="0"]');
  const field = (name) =>
    page.locator(`[data-field="operations.0.${name}"]`).getByRole('combobox');
  const zone = field('zone');
  const setup = page.locator('[role="button"][aria-expanded]').filter({
    has: page.getByText('setup', { exact: true }),
  });
  const settle = async (locator) => {
    await locator.waitFor({ timeout: 3000 }).catch(() => {});
  };
  const controlText = (locator) =>
    locator.evaluateAll((nodes) => nodes.length === 1 ? (nodes[0].textContent ?? '').trim() : '');
  const current = async () => (await page.evaluate(() => window.__inference.values()))[0];
  const zoneOf = async () => (await current())?.zone;
  const unset = (v) => !v || v === Z('UNKNOWN');

  async function chooseZone(label) {
    if ((await zone.count()) !== 1) return false;
    await zone.press('Enter');
    const option = page.getByRole('option', { name: label, exact: true });
    await settle(option);
    if (!(await option.isVisible())) {
      await page.keyboard.press('Escape');
      return false;
    }
    await option.press('Enter');
    return true;
  }

  async function emptyZoneControl() {
    if ((await zone.count()) !== 1) return false;
    return (await zone.getAttribute('data-placeholder')) !== null || (await controlText(zone)) === '— zone —';
  }

  async function openSetup() {
    await settle(editor);
    if ((await setup.getAttribute('aria-expanded')) === 'false') await setup.click();
  }

  await page.evaluate((c) => window.__inference.mount(c), formCard([sew(['p-sl-l', 'p-sl-r'])]));
  await settle(zone.filter({ hasText: /^sleeve$/i }));
  ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
  ck((await controlText(zone)).toLowerCase() === 'sleeve', 'подставленный рукав виден в выборе зоны');
  ck((await zoneOf()) === Z('SLEEVE'), 'значение действительно стоит в форме', await zoneOf());
  ck(
    (await page.evaluate(() => window.__inference.dirty())) === false,
    'подстановка НЕ пометила форму грязной',
  );

  ck(await chooseZone('hem'), 'оператор выбирает свою зону поверх подставленной');
  await page.waitForTimeout(250);
  ck(
    (await zoneOf()) === Z('HEM') && (await controlText(zone)).toLowerCase() === 'hem',
    'контрол и форма сохраняют ручной ответ hem',
    String(await zoneOf()),
  );

  // Conflicting evidence leaves the actual zone input empty.
  await page.evaluate((c) => window.__inference.mount(c), formCard([sew(['p-sl-l', 'p-fp', 'p-bp'])]));
  await settle(zone);
  await page.waitForTimeout(250);
  ck(unset(await zoneOf()), 'при конфликте форма оставляет зону пустой', String(await zoneOf()));
  ck(await emptyZoneControl(), 'при конфликте пикер показывает пустую зону', await controlText(zone));

  await page.evaluate(
    (c) => window.__inference.mount(c),
    formCard([sew(['p-sl-l', 'p-sl-r'], { zone: Z('HEM') })]),
  );
  await settle(zone);
  ck(
    (await zoneOf()) === Z('HEM') && (await controlText(zone)).toLowerCase() === 'hem',
    'заполненная зона не переписана в форме и в контроле',
    String(await zoneOf()),
  );

  // The empty picker choice is also an explicit human answer.
  await page.evaluate((c) => window.__inference.mount(c), formCard([sew(['p-sl-l', 'p-sl-r'])]));
  await settle(zone.filter({ hasText: /^sleeve$/i }));
  ck((await zoneOf()) === Z('SLEEVE'), 'до очистки в форме подставленный рукав', String(await zoneOf()));
  ck(await chooseZone('— zone —'), 'пустая зона доступна в настоящем пикере');
  await page.waitForTimeout(300);
  ck(
    unset(await zoneOf()) && (await emptyZoneControl()),
    'очищенная зона остаётся пустой в форме и в контроле',
    String(await zoneOf()),
  );

  // Selection changes revoke temporary values in the editor that was unmounted.
  await page.evaluate(
    (c) => window.__inference.mount(c),
    formCard([sew(['p-sl-l', 'p-sl-r']), sew(['p-fp'])]),
  );
  await settle(zone.filter({ hasText: /^sleeve$/i }));
  ck((await zoneOf()) === Z('SLEEVE'), 'перед сменой шага подсказка стоит', String(await zoneOf()));
  await page.locator('[data-rail-step="1"]').click();
  await page.waitForFunction(
    () => {
      const z = window.__inference.values()[0]?.zone;
      return !z || z === 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
    },
    undefined,
    { timeout: 3000 },
  ).catch(() => {});
  ck(unset(await zoneOf()), 'смена шага отозвала временную зону предыдущего шага', String(await zoneOf()));

  // (7) ШОВ С Ф4, ГВОЗДЁМ ПО ИМЕНИ ИЗ ВАЙТЛИСТА: `pressEquipment` на ЗАПОЛНЕННОМ шаге не
  // переписывается. Исключение выдано подстановке в пустое, а не праву писать по имени: стирание
  // через вайтлист с `shouldDirty: false` прошло бы обе разметочные проверки роундтрипа — держит
  // его только живой редактор.
  const PARK_ONE_IRON = {
    equipmentDefaults: {
      machines: [],
      presses: [
        { profileKey: 'PR1', pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON', label: 'iron by the window' },
      ],
    },
  };
  await page.evaluate((c) => window.__inference.mount(c), {
    ...formCard([
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        inputKeys: ['p-fp'],
        pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
      },
    ]),
    construction: PARK_ONE_IRON,
  });
  await openSetup();
  {
    const op = await current();
    ck(
      op?.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
      'заполненный утюг не переписан единственным профилем парка',
      String(op?.pressEquipment),
    );
  }

  // The empty press step takes the single profile as one equipment/key pair.
  await page.evaluate((c) => window.__inference.mount(c), {
    ...formCard([{ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', inputKeys: ['p-fp'] }]),
    construction: PARK_ONE_IRON,
  });
  await openSetup();
  ck(
    (await controlText(field('pressProfileKey'))).includes('iron by the window'),
    'выбранный профиль парка виден в Setup',
    await controlText(field('pressProfileKey')),
  );
  {
    const op = await current();
    ck(
      op?.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_IRON' && op?.pressProfileKey === 'PR1',
      'оборудование и ключ профиля встали парой',
      `${String(op?.pressEquipment)} / ${String(op?.pressProfileKey)}`,
    );
  }

  const thread = page.getByRole('button', { name: 'remove material core-spun 120', exact: true });
  await page.evaluate(
    (c) => window.__inference.mount(c),
    formCard([sew(['p-fp'], { bomLineKeys: ['b-thread'] })]),
  );
  await settle(thread);
  ck(
    JSON.stringify((await current())?.bomLineKeys) === '["b-thread"]' && (await thread.count()) === 1,
    'ручная связка нитки сохраняется одной записью и одной плиткой',
  );

  await page.evaluate((c) => window.__inference.mount(c), formCard([sew(['p-fp'])]));
  await settle(thread);
  ck(
    JSON.stringify((await current())?.bomLineKeys) === '["b-thread"]' && (await thread.count()) === 1,
    'единственная предложенная нитка связана и видна в материалах шага',
  );
  if ((await thread.count()) === 1) {
    await thread.click();
    await page.waitForTimeout(300);
  }
  ck(
    ((await current())?.bomLineKeys ?? []).length === 0 && (await thread.count()) === 0,
    'удалённая оператором нитка остаётся снятой',
  );
  ck(pageErrors.length === 0, 'все монтирования прожиты без исключений', pageErrors[0] ?? '');

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
