#!/usr/bin/env node
// СТРОКА ШАГА ДОЕЗЖАЕТ ЦЕЛОЙ — И ЕЁ НИКТО НЕ СТИРАЕТ ПО ДОРОГЕ.
//
// Ф4 фазы «перестать терять данные» держится на трёх сцепленных кусках, и каждый ломается врозь
// и молча:
//   1. МАППЕР ЗАПИСИ возит поле, если семейство законно ДЛЯ ШАГА ИЛИ значение ЗАПОЛНЕНО. До волны
//      он зануливал чужое — а операции пишутся ПОЛНОЙ ЗАМЕНОЙ и стабильного ключа у строки шага
//      нет, значит незасланное поле = NULL в базе. Потеря на проводе, где её нечем увидеть.
//   2. ЭФФЕКТЫ РЕДАКТОРА больше не стирают. Раньше открытие карточки писало пустоту в поля чужого
//      семейства с `shouldDirty` — до всякого человеческого жеста.
//   3. ПОЛОСА ОСТАТКОВ показывает заполненное-но-чужое строкой с [clear]: это единственное место,
//      где форма стирает, и жест там человеческий.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ЧЕМ ЭТО ДЕРЖИТСЯ:
//   цитата А — форма → провод: заполненное значение ПРИСУТСТВУЕТ в payload тем же токеном/числом;
//   цитата Б — круг «форма → провод → форма» по СПИСКУ ПОЛЕЙ ИЗ САМОЙ ZOD-СХЕМЫ: ни одно
//              заполненное поле шага круг не теряет. Список берётся `operationFieldNames()`, а
//              покрытие фикстуры сверяется с ним — новое поле волны, забытое в фикстуре, красит
//              пробу и НАЗЫВАЕТСЯ;
//   цитата В — разметка редактора: ни один `useEffect` в operations-field.tsx не пишет
//              `setValue(..., { shouldDirty: true })`, кроме поимённого вайтлиста.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём взят у press-action-probe): правка исходника ради
// проверки — это правка, которую однажды забудут откатить.
//   node scripts/step-roundtrip-probe.mjs                  прогон
//   node scripts/step-roundtrip-probe.mjs --mutate         возвращает ОДНО зануление маппера
//                                                          (bindingStyle по классу шва) в БАНДЛ —
//                                                          цитаты А/Б обязаны покраснеть
//   node scripts/step-roundtrip-probe.mjs --mutate-effect   возвращает ОДИН стирающий эффект в
//                                                          КОПИЮ исходника — цитата В обязана
//                                                          покраснеть
//   node scripts/step-roundtrip-probe.mjs --mutate-dirty    подстановка выводимости начинает
//                                                          пачкать форму (`shouldDirty: true`) —
//                                                          узкая половина цитаты В обязана
//                                                          покраснеть
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui):
//   --mutate        → 2 провала: «bindingStyle едет на любом классе шва» (А) и потеря круга Б по
//                     bindingStyle; байтовая идемпотентность второго оборота при этом остаётся
//                     зелёной — мутированный маппер согласен сам с собой. Откатано.
//   --mutate-effect → 1 провал: «в эффектах нет разрушающих setValue» назвал внедрённое поле.
//   --mutate-dirty  → 1 провал (2026-08-22, R5): подстановка зоны начинает пачкать форму, и узкая
//                     половина цитаты В её называет поимённо. Откатано.
//                     Откатано.
//
// РЕВЬЮ Ф4 (2026-08-22), адверсарные мутации сверх авторских — до ужесточения цитаты В:
//   зануление toward / гейт machineType в маппере → по 2 провала (А + круг Б): защита не точечная;
//   стирающий эффект БЕЗ shouldDirty (и/или без массива зависимостей) → ОБЕ пробы зелёные.
//   Дыра закрыта здесь же: цитата В больше не фильтрует по слову shouldDirty (setValue без опций
//   стирает так же, а форму даже не пачкает — прячась и от поведенческой проверки) и спрашивает
//   обе арности useEffect. Тот же стиратель после ужесточения — 1 провал. Откатано.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_MAPPER = process.argv.includes('--mutate');
const MUTATE_EFFECT = process.argv.includes('--mutate-effect');
const MUTATE_DIRTY = process.argv.includes('--mutate-dirty');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const FIELD_FILE = resolve(
  REPO,
  'src/components/managers/tech-card/components/operations-field.tsx',
);

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── мутация маппера: ОДНО зануление возвращается на место ───────────────────────────────────
const MAPPER_FIX = `        bindingStyle: (o.bindingStyle ||
          'TECH_CARD_BINDING_STYLE_UNKNOWN') as common_TechCardBindingStyle,`;
const MAPPER_BROKEN = `        bindingStyle: (o.seamClass === 'TECH_CARD_SEAM_CLASS_BS_BOUND'
          ? o.bindingStyle || 'TECH_CARD_BINDING_STYLE_UNKNOWN'
          : 'TECH_CARD_BINDING_STYLE_UNKNOWN') as common_TechCardBindingStyle,`;
const mapperMutation = {
  name: 'binding-style-mutation',
  setup(b) {
    b.onLoad({ filter: /tech-card\/components\/schema\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(MAPPER_FIX)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(MAPPER_FIX, MAPPER_BROKEN), loader: 'ts' };
    });
  },
};

const outfile = resolve(REPO, `scripts/.step-roundtrip-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'step-roundtrip-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins: MUTATE_MAPPER ? [mapperMutation] : [],
});
const { emptyOp, toWire, readBack, operationFieldNames } = await import(
  pathToFileURL(outfile).href
);
rmSync(outfile, { force: true });

const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PRESS_OPEN: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  PRINT: 'TECH_CARD_OPERATION_TYPE_PRINT',
  INSPECT: 'TECH_CARD_OPERATION_TYPE_INSPECT',
  FOLD: 'TECH_CARD_OPERATION_TYPE_FOLD',
  PACK: 'TECH_CARD_OPERATION_TYPE_PACK',
  CLEAN: 'TECH_CARD_OPERATION_TYPE_CLEAN',
  HARDWARE: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  ULTRASONIC: 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER',
  OVERLOCK: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  TO_ONE_SIDE: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
  STEAM: 'TECH_CARD_PRESS_ACTION_STEAM',
  TOWARD_FRONT: 'TECH_CARD_PRESS_TOWARD_FRONT',
  IN_DITCH: 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH',
  MODE_UNSET: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN',
  SS_PLAIN: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  DOUBLE_FOLD: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
  JEANS: 'TECH_CARD_NEEDLE_TYPE_JEANS',
  SCREEN: 'TECH_CARD_PRINT_METHOD_SCREEN',
  LASER: 'TECH_CARD_PRINT_METHOD_LASER_ENGRAVE',
  RINSE: 'TECH_CARD_WET_PROCESS_KIND_RINSE',
  SILICONE: 'TECH_CARD_PRESS_CLOTH_SILICONE_PAPER',
  PRESS_SET: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET',
  EYELET: 'TECH_CARD_BUTTONHOLE_STYLE_EYELET',
  HOT_PEEL: 'TECH_CARD_PEEL_MODE_HOT',
};

const BASE = emptyOp();
const step = (over) => ({ ...BASE, zone: T.ZONE, ...over });
const wireOne = (over) => toWire([step(over)]).operations[0];
const dec = (d) => (d && typeof d === 'object' ? d.value : undefined);

// ─── ЦИТАТА А: заполненное значение доезжает до провода ───────────────────────────────────────
head('цитата А — форма → провод: заполненное значение ПРИСУТСТВУЕТ');

{
  const w = wireOne({ operationType: T.PRESS_OPEN, pressAction: T.TO_ONE_SIDE });
  ck(
    w.press?.action === T.TO_ONE_SIDE,
    'разутюжка везёт прочитанный под-глагол (Р-1)',
    String(w.press?.action),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    needleCount: 1,
    needleGaugeMm: '3.2',
  });
  ck(
    dec(w.stitching?.needleGaugeMm) === '3.2',
    'калибр при одной игле едет числом',
    String(dec(w.stitching?.needleGaugeMm)),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    topstitchMode: T.IN_DITCH,
    topstitchWidthMm: '4',
  });
  ck(w.topstitch?.mode === T.IN_DITCH, 'режим отстрочки «в шов» едет');
  ck(
    dec(w.topstitch?.widthMm) === '4',
    'отступ при «в шов» едет (отказывает СЕРВЕР, по имени)',
    String(dec(w.topstitch?.widthMm)),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    topstitchMode: T.MODE_UNSET,
    topstitchWidthMm: '4',
    topstitchRows: 2,
  });
  ck(!!w.topstitch, 'обёртка отстрочки едет при пустом режиме и заполненном отступе');
  ck(
    w.topstitch?.mode === T.MODE_UNSET,
    'режим при этом остаётся незаданным (Ф3 отказывает по имени)',
  );
  ck(
    dec(w.topstitch?.widthMm) === '4',
    'отступ без режима едет',
    String(dec(w.topstitch?.widthMm)),
  );
  ck(w.topstitch?.rows === 2, 'ряды без режима едут', String(w.topstitch?.rows));
}
{
  const w = wireOne({ operationType: T.PRESS, threadCount: 3 });
  ck(w.threadCount === 3, 'машинный остаток на ВТО-шаге едет', String(w.threadCount));
}
{
  const w = wireOne({ operationType: T.PRESS, pressAction: T.STEAM, pressToward: T.TOWARD_FRONT });
  ck(
    w.press?.toward === T.TOWARD_FRONT,
    'направление при чужом приёме едет',
    String(w.press?.toward),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    seamClass: T.SS_PLAIN,
    bindingStyle: T.DOUBLE_FOLD,
  });
  ck(
    w.stitching?.bindingStyle === T.DOUBLE_FOLD,
    'бейка при неокантовочном классе шва едет',
    String(w.stitching?.bindingStyle),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.ULTRASONIC,
    threadCount: 4,
    needleType: T.JEANS,
    airTemperatureC: 450,
  });
  ck(w.threadCount === 4, 'ниточные overrides на сварочной машине едут', String(w.threadCount));
  ck(w.needleType === T.JEANS, 'тип иглы на сварочной машине едет', String(w.needleType));
  ck(
    w.weld?.airTemperatureC === 450,
    'горячий воздух на ультразвуке едет',
    String(w.weld?.airTemperatureC),
  );
}
{
  const w = wireOne({ operationType: T.INSPECT, printMethod: T.SCREEN });
  ck(w.printMethod === T.SCREEN, 'метод печати на чужом глаголе едет', String(w.printMethod));
}
{
  const w = wireOne({ operationType: T.FOLD, wetProcessKind: T.RINSE, pressSteam: false });
  ck(
    w.wetProcessKind === T.RINSE,
    'вид мокрой обработки на чужом глаголе едет',
    String(w.wetProcessKind),
  );
  ck(
    w.pressSteam === false,
    '«без пара» на чужом глаголе едет ответом, а не пустотой',
    String(w.pressSteam),
  );
}
{
  const w = wireOne({ operationType: T.PACK, machineType: T.OVERLOCK, machineProfileKey: 'K1' });
  ck(w.machineType === T.OVERLOCK, 'тип машины на немашинном шаге едет', String(w.machineType));
  ck(
    w.machineProfileKey === 'K1',
    'ключ профиля машины на немашинном шаге едет',
    String(w.machineProfileKey),
  );
}
{
  const w = wireOne({ operationType: T.CLEAN, pressCloth: T.SILICONE, pressTemperatureC: 160 });
  ck(w.pressCloth === T.SILICONE, 'силиконовая бумага на чужом глаголе едет', String(w.pressCloth));
  ck(w.pressTemperatureC === 160, 'температура на чужом глаголе едет', String(w.pressTemperatureC));
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    attachMethod: T.PRESS_SET,
    foldbackMm: '40',
    holePrep: 'TECH_CARD_HOLE_PREP_PUNCH',
  });
  ck(
    w.hardware?.attachMethod === T.PRESS_SET,
    'способ крепления на швейном шаге едет',
    String(w.hardware?.attachMethod),
  );
  ck(
    dec(w.hardware?.foldbackMm) === '40',
    'подгиб стропы без продевания едет',
    String(dec(w.hardware?.foldbackMm)),
  );
}
{
  const w = wireOne({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    buttonholeStyle: T.EYELET,
    cutLengthMm: '19',
  });
  ck(
    w.fastening?.buttonholeStyle === T.EYELET,
    'стиль петли на прямострочке едет',
    String(w.fastening?.buttonholeStyle),
  );
  ck(
    dec(w.fastening?.cutLengthMm) === '19',
    'длина прорези на прямострочке едет',
    String(dec(w.fastening?.cutLengthMm)),
  );
}
{
  const w = wireOne({ operationType: T.PRINT, printMethod: T.LASER, peelMode: T.HOT_PEEL });
  ck(
    w.print?.peelMode === T.HOT_PEEL,
    'режим отслойки при гравировке едет',
    String(w.print?.peelMode),
  );
}

// ─── МАТРИЦА ЧЕТЫРЁХ СОСТОЯНИЙ ОТСТРОЧКИ — ШОВ Ф3↔Ф4 ─────────────────────────────────────────
// Главный шов фазы: одно поле, две стороны. Клиент решает, ЧТО поедет; сервер (строгий разбор
// `parseTopstitch`) решает, ЧЕМ ответить. Проверяется КЛИЕНТСКАЯ половина всех четырёх строк —
// серверная половина держится тестом в `internal/dto`.
head('матрица отстрочки (§6.1) — клиентская половина шва');
{
  const base = { operationType: T.MACHINE, machineType: T.LOCKSTITCH };
  // 1. режим пуст, отступ пуст → обёртки нет, серверу отвечать не на что
  const a = wireOne({ ...base });
  ck(a.topstitch === undefined, '1) режим пуст + отступ пуст → обёртка не едет');
  // 2. «по краю», отступ пуст → едет один режим; сервер принимает (0326: отступ у края опционален)
  const b = wireOne({ ...base, topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE' });
  ck(
    b.topstitch?.mode === 'TECH_CARD_TOPSTITCH_MODE_EDGE',
    '2) «по краю» без отступа → едет режим',
  );
  ck(
    dec(b.topstitch?.widthMm) === undefined,
    '2) ключ отступа при этом отсутствует',
    String(dec(b.topstitch?.widthMm)),
  );
  // 3. «в шов» + отступ → едут ОБА; отказ по имени ставят zod (на контроле) и сервер
  const c = wireOne({ ...base, topstitchMode: T.IN_DITCH, topstitchWidthMm: '4' });
  ck(dec(c.topstitch?.widthMm) === '4', '3) «в шов» + отступ → едут оба, отказывает сервер');
  // 4. режим пуст + отступ → едет {UNKNOWN, 4}; сервер (Ф3) отвечает `topstitch_mode: required`
  const d = wireOne({ ...base, topstitchWidthMm: '4' });
  ck(
    d.topstitch?.mode === T.MODE_UNSET && dec(d.topstitch?.widthMm) === '4',
    '4) режим пуст + отступ → едет {UNKNOWN, 4}, а не пустота',
    JSON.stringify(d.topstitch),
  );
  // 4-БИС. КЛЕТКА, КОТОРОЙ В МАТРИЦЕ ПЛАНА НЕ БЫЛО: одни РЯДЫ, без отступа. Серверное правило Ф3
  // стреляет и на них («ширина ИЛИ ряды присланы при неназванном режиме»), значит обёртка обязана
  // ехать и здесь — иначе ряды исчезали бы молча ровно так же, как исчезал отступ.
  const e = wireOne({ ...base, topstitchRows: 2 });
  ck(
    e.topstitch?.mode === T.MODE_UNSET && e.topstitch?.rows === 2,
    '4-бис) режим пуст + одни РЯДЫ → едет {UNKNOWN, rows: 2}',
    JSON.stringify(e.topstitch),
  );
  ck(dec(e.topstitch?.widthMm) === undefined, '4-бис) пустого отступа при этом на проводе нет');

  // ЧТО ОСТАЁТСЯ НА ПРОВОДЕ ПОСЛЕ [CLEAR]. Жест полосы пишет в форму пустую строку, а пустая
  // строка обязана ПРОПАСТЬ С ПРОВОДА КЛЮЧОМ, а не приехать как `{value: ""}`: сервер меряет
  // присланность децимала содержимым, и пустое значение с непустым указателем он прочитал бы как
  // «отступ прислан» — то есть [clear] по отступу упёрся бы в отказ «назови режим».
  const cleared = JSON.stringify(
    wireOne({ ...base, topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE', topstitchWidthMm: '' }),
  );
  ck(
    !cleared.includes('widthMm'),
    'после [clear] ключа отступа в JSON нет вовсе',
    cleared.slice(0, 160),
  );
  const clearedAll = JSON.stringify(wireOne({ ...base, topstitchWidthMm: '', topstitchRows: 0 }));
  ck(!clearedAll.includes('topstitch'), 'очищены оба поля и режим пуст → обёртки в JSON нет');
}

// РЕГРЕСС: шаг без единого факта волны шлёт ТЕ ЖЕ БАЙТЫ, что и раньше — ни одной пустой обёртки.
head('регресс — неосведомлённая запись не растолстела');
{
  const w = wireOne({ operationType: T.PACK });
  const wrappers = [
    'stitching',
    'placementLayout',
    'hardware',
    'print',
    'weld',
    'trim',
    'threadTrim',
    'clean',
    'inspect',
    'fastening',
    'press',
  ];
  const present = wrappers.filter((k) => w[k] !== undefined);
  ck(present.length === 0, 'пустой шаг не везёт ни одной обёртки', present.join(', '));
  ck(
    w.printMethod === undefined,
    'метод печати у пустого шага не едет вовсе',
    String(w.printMethod),
  );
  ck(
    w.wetProcessKind === undefined,
    'вид мокрой обработки у пустого шага не едет вовсе',
    String(w.wetProcessKind),
  );
  ck(
    w.topstitch === undefined,
    'обёртка отстрочки у пустого шага не едет вовсе',
    String(w.topstitch),
  );
  ck(w.pressSteam === undefined, 'пар у пустого шага не едет вовсе', String(w.pressSteam));
}

// ─── ЦИТАТА Б: круг «форма → провод → форма» ничего не теряет ─────────────────────────────────
head('цитата Б — круг «форма → провод → форма» по списку полей из zod-схемы');

// Фикстура ЗАПОЛНЕННОГО шага: каждое поле — чужое своему глаголу нарочно. Глагол PACK не владеет
// ни одним семейством, поэтому строка целиком состоит из «остатков», и круг обязан довезти всё.
const FILLED = {
  operationType: T.PACK,
  // РАБОТА (0330) — СТРОКА-ТОКЕН, И ЗДЕСЬ ОНА НАРОЧНО НЕЗНАКОМАЯ. Круг обязан довезти токен,
  // которого этот бандл не знает, БУКВА В БУКВУ: словарь работ живёт на сервере и растёт
  // INSERT-миграцией, поэтому «нет в каталоге бандла» — обычное состояние свежей работы, а не
  // повод её погасить. Токен, погашенный по дороге, стёр бы разметку владельца обновлением
  // клиента, и увидеть это было бы нечем.
  work: 'unknown_work_x',
  zone: T.ZONE,
  smv: '1.8',
  calloutNumber: 3,
  note: 'a note',
  seamClass: T.SS_PLAIN,
  stitchesPerCm: '4.5',
  seamAllowanceMm: '10',
  topstitchMode: T.IN_DITCH,
  topstitchWidthMm: '4',
  topstitchRows: 2,
  attachmentKind: 'TECH_CARD_ATTACHMENT_KIND_BINDER',
  attachmentSizeMm: '8',
  machineType: T.OVERLOCK,
  machineProfileKey: 'MK1',
  threadCount: 4,
  needleType: T.JEANS,
  needleSizeNm: 90,
  threadTension: 'TECH_CARD_THREAD_TENSION_TIGHTER',
  threadTensionNote: '0.5 tighter',
  stitchWidthMm: '2.5',
  pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  pressProfileKey: 'PK1',
  pressTemperatureC: 160,
  pressDwellSec: 12,
  pressPressureNCm2: '3.5',
  pressSteam: false,
  pressCloth: T.SILICONE,
  needleCount: 2,
  needleGaugeMm: '6.4',
  seamSecuring: 'TECH_CARD_SEAM_SECURING_BACKTACK',
  rowSpacingMm: '6',
  fullnessRatio: '1.2',
  bindingStyle: T.DOUBLE_FOLD,
  labelAttachStitch: 'TECH_CARD_LABEL_ATTACH_STITCH_FOUR_SIDES',
  placementCount: 4,
  pitchMm: '80',
  attachMethod: T.PRESS_SET,
  holePrep: 'TECH_CARD_HOLE_PREP_PUNCH',
  reinforcement: 'TECH_CARD_REINFORCEMENT_PATCH',
  cycleStitchCount: 28,
  foldbackMm: '40',
  printMethod: T.SCREEN,
  peelMode: T.HOT_PEEL,
  secondPressSec: 5,
  airTemperatureC: 450,
  feedSpeedMMin: '4.0',
  trimAction: 'TECH_CARD_TRIM_ACTION_GRADE_LAYERS',
  residualAllowanceMm: '3',
  residualTailMaxMm: '3',
  cleaningKind: 'TECH_CARD_CLEANING_KIND_SPOT_CLEAN',
  coverageMode: 'TECH_CARD_INSPECT_COVERAGE_EACH_UNIT',
  wetProcessKind: T.RINSE,
  buttonholeStyle: T.EYELET,
  cutLengthMm: '19',
  buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL',
  bartackLengthMm: '7',
  attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X',
  zipperApplication: 'TECH_CARD_ZIPPER_APPLICATION_LAPPED',
  pressAction: T.STEAM,
  pressToward: T.TOWARD_FRONT,
  outputUnitKey: 'SHELL',
  outputUnitName: 'shell unit',
};

// Поля, которые эта проба НЕ ведёт, и почему. Список ЗАКРЫТЫЙ: всё остальное обязано быть в
// фикстуре, иначе проверка покрытия ниже назовёт забытое поимённо.
const NOT_A_STEP_FACT = new Set([
  'operationNumber', // позиционный, сервер авторитетен: маппер пересчитывает его на записи
  'inputKeys', // ссылки на детали/узлы — круг у них свой (сборка), и он не про потерю факта шага
  'bomLineKeys', // то же: ссылки на строки BOM
  'media', // снимки с выносками — отдельная проба (annotation-shape-probe)
]);

{
  const names = operationFieldNames();
  ck(names.length > 40, 'zod-схема шага перечисляет поля', `полей: ${names.length}`);
  const missing = names.filter((n) => !(n in FILLED) && !NOT_A_STEP_FACT.has(n));
  ck(missing.length === 0, 'фикстура покрывает КАЖДОЕ поле схемы шага', missing.join(', '));
  const stray = Object.keys(FILLED).filter((n) => !names.includes(n));
  ck(stray.length === 0, 'в фикстуре нет полей, которых в схеме уже нет', stray.join(', '));

  const form1 = step(FILLED);
  const wire = toWire([form1]);
  const form2 = readBack(wire)[0];
  const lost = [];
  for (const n of names) {
    if (NOT_A_STEP_FACT.has(n)) continue;
    const a = JSON.stringify(form1[n]);
    const b = JSON.stringify(form2[n]);
    if (a !== b) lost.push(`${n}: ${a} → ${b}`);
  }
  ck(
    lost.length === 0,
    'круг «форма → провод → форма» не потерял ни одного поля',
    lost.join(' | '),
  );

  // ВТОРОЙ ОБОРОТ — идемпотентность: провод, прочитанный и записанный снова, БАЙТОВО тот же.
  const wire2 = toWire([form2]);
  const a = JSON.stringify(wire.operations[0]);
  const b = JSON.stringify(wire2.operations[0]);
  ck(a === b, 'второй оборот круга байтово совпадает с первым', a === b ? '' : 'провод поехал');
}

// ─── ЦИТАТА В: в эффектах редактора не осталось разрушающих записей ───────────────────────────
head('цитата В — разметка: ни один useEffect не стирает поле шага');

// ВАЙТЛИСТ ИМЕНОВАННЫЙ, А НЕ ПОСТРОЧНЫЙ, И У КАЖДОЙ СТРОКИ ЕСТЬ ПРИЧИНА. Диапазон строк устаревает
// первой же правкой выше по файлу; имя поля — нет. Причина рядом с именем, чтобы следующий автор
// не дописал сюда шестое имя «по аналогии»: аналогия здесь не довод.
//
// ЧЕТЫРЕ ИМЕНИ ПРИШЛИ С ВЫВОДИМОСТЬЮ (R5), И ЭТО НЕ ОСЛАБЛЕНИЕ ПРАВИЛА Ф4. Ф4 запретила эффекту
// СТИРАТЬ: он писал ПУСТОТУ в поля чужого семейства на монтировании, до всякого человеческого
// жеста, и технолог терял тридцать шесть возможных фактов, не увидев ни одного. Подстановка
// делает обратное — кладёт ЗНАЧЕНИЕ в ПУСТОЕ поле, видимо, с меткой «suggested», и снимает только
// то, что написала сама. Заполненное она не трогает: это доказано в
// `operation-inference-probe.mjs` («заполненная зона не переписана», живой DOM).
//
// Тупое правило Ф4 при этом остаётся тупым для всех остальных полей — имени нет в списке, значит
// это нарушение, и никакой `shouldDirty: false` его не спасёт. А на четырёх выведенных полях
// добавлена ВТОРАЯ, более узкая проверка: подстановка обязана писать `shouldDirty: false`,
// потому что открыть карточку — не правка.
const EFFECT_WRITE_WHITELIST = new Map([
  ['outputUnitName', 'гасится вместе со СВОИМ ключом в блоке «produces» — сборка, вне Ф4'],
  ['zone', 'R5: подсказанная зона — только в пустое, видимо, с меткой'],
  ['bomLineKeys', 'R5: подсказанная нитка — единственная подходящая строка BOM'],
  ['pressEquipment', 'R5: подсказанный утюг — единственный профиль процесса в парке'],
  ['pressProfileKey', 'R5: ключ профиля едет ПАРОЙ с оборудованием, иначе сервер отвергнет'],
]);

/** Поля, которым подстановка разрешена — и только с `shouldDirty: false`. */
const INFERENCE_WRITES = new Set(['zone', 'bomLineKeys', 'pressEquipment', 'pressProfileKey']);

function destructiveEffectWrites(file) {
  // ДВЕ АРНОСТИ И НИКАКОГО ФИЛЬТРА ПО shouldDirty — обе дыры найдены адверсарной мутацией ревью:
  // эффект без массива зависимостей не матчился паттерном вовсе, а setValue без опций стирает
  // значение точно так же, но форму НЕ пачкает — то есть прятался и от этой проверки, и от
  // поведенческой «открытие не пачкает форму» в step-residue-probe. Теперь любой setValue по пути
  // шага внутри любого useEffect обязан быть в поимённом вайтлисте.
  const matches = ['useEffect(() => { $$$BODY }, $DEPS)', 'useEffect(() => { $$$BODY })'].flatMap(
    (pattern) => {
      let raw;
      try {
        raw = execFileSync('ast-grep', ['run', '-p', pattern, '-l', 'tsx', '--json=compact', file], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (e) {
        // ast-grep, как grep, выходит с кодом 1 при НУЛЕ совпадений — это ответ, а не отказ.
        // Ответом считается только распарсиваемый JSON-массив в stdout: настоящий сбой (нет
        // бинаря, битый паттерн) пробрасывается, иначе «инструмент сломан» читалось бы как
        // «эффектов нет» — ложная зелень ровно той пробы, что от неё защищает.
        raw = typeof e?.stdout === 'string' ? e.stdout : '';
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw e;
        }
        if (!Array.isArray(parsed)) throw e;
      }
      return JSON.parse(raw || '[]');
    },
  );
  const writes = [];
  for (const m of matches) {
    const text = m.text ?? '';
    if (!text.includes('setValue')) continue;
    const re = /setValue\(\s*`?(?:\$\{p\}|operations\.\$\{index\})\.([A-Za-z0-9_]+)`?/g;
    let hit;
    let found = false;
    // `shouldDirty` читается ПО ТЕЛУ ЭФФЕКТА, а не по одному вызову: разобрать вызов до его
    // закрывающей скобки регуляркой нельзя честно, а эффект, в котором есть хоть одна грязная
    // запись, и есть тот, о котором стоит спросить.
    const dirtyBody = /shouldDirty:\s*true/.test(text);
    while ((hit = re.exec(text)) !== null) {
      found = true;
      writes.push({ line: m.range.start.line + 1, field: hit[1], dirtyBody });
    }
    if (!found) writes.push({ line: m.range.start.line + 1, field: '<не разобрано>', dirtyBody });
  }
  return writes;
}

{
  const target = MUTATE_EFFECT ? mutatedFieldFile() : MUTATE_DIRTY ? dirtyFieldFile() : FIELD_FILE;
  const writes = destructiveEffectWrites(target);
  const offenders = writes.filter((w) => !EFFECT_WRITE_WHITELIST.has(w.field));
  ck(
    offenders.length === 0,
    'в эффектах нет разрушающих setValue, кроме вайтлиста',
    offenders.map((o) => `${o.field} (строка ${o.line})`).join(', '),
  );
  // ВАЙТЛИСТ НЕ РАЗРОССЯ И НЕ ЗАРОС МЁРТВЫМИ ИМЕНАМИ. Считаются РАЗЛИЧНЫЕ поля, а не вызовы:
  // счётчик вызовов ломался бы от безобидного переноса строки, а имя, оставшееся в списке после
  // ухода своей записи, — это разрешение, выданное неизвестно кому.
  const seen = new Set(writes.filter((w) => EFFECT_WRITE_WHITELIST.has(w.field)).map((w) => w.field));
  const listed = [...EFFECT_WRITE_WHITELIST.keys()].sort().join(', ');
  ck(
    [...seen].sort().join(', ') === listed,
    'вайтлист совпадает с тем, что и правда пишется',
    `в файле: ${[...seen].sort().join(', ') || '(ничего)'} · в списке: ${listed}`,
  );
  // ПОДСТАНОВКА НЕ ПАЧКАЕТ ФОРМУ. Узкая проверка поверх тупого правила: открыть карточку и
  // закрыть — не правка, и синий значок «есть несохранённое» от простого просмотра приучил бы не
  // смотреть на него вовсе.
  const dirtySuggestions = writes.filter((w) => INFERENCE_WRITES.has(w.field) && w.dirtyBody);
  ck(
    dirtySuggestions.length === 0,
    'подстановка пишет с shouldDirty: false — просмотр карточки не правка',
    dirtySuggestions.map((o) => `${o.field} (строка ${o.line})`).join(', '),
  );
  if (MUTATE_EFFECT || MUTATE_DIRTY) rmSync(dirname(target), { recursive: true, force: true });
}

// СТИРАНИЕ НЕ ИСЧЕЗЛО, А ПЕРЕЕХАЛО К ЧЕЛОВЕКУ. Без этой проверки «ноль записей в эффектах»
// достигалось бы и удалением всякой очистки вообще — вместе с [clear] полосы.
{
  const src = readFileSync(FIELD_FILE, 'utf8');
  ck(/const clearResidueField = /.test(src), 'обработчик [clear] полосы остатков существует');
  const body = src.slice(src.indexOf('const clearResidueField = '));
  ck(
    body.slice(0, 600).includes('shouldDirty: true'),
    '[clear] пишет с shouldDirty — стирание осталось человеческим жестом',
  );
}

/**
 * Мутация «подстановка пачкает форму»: `shouldDirty: false` подсказки становится `true` в КОПИИ
 * исходника. Проверяет узкую половину цитаты В — без неё разрешение, выданное четырём выведенным
 * полям, ничем не ограничено, и первая же правка превратила бы просмотр карточки в правку.
 */
function dirtyFieldFile() {
  const dir = mkdtempSync(resolve(tmpdir(), 'step-roundtrip-dirty-'));
  const copy = resolve(dir, 'operations-field.tsx');
  const src = readFileSync(FIELD_FILE, 'utf8');
  const anchor = 'setValue(`operations.${index}.zone`, zoneSuggested, { shouldDirty: false });';
  if (!src.includes(anchor)) throw new Error('мутация грязной подстановки не нашла свою строку');
  writeFileSync(copy, src.replace(anchor, anchor.replace('shouldDirty: false', 'shouldDirty: true')));
  return copy;
}

function mutatedFieldFile() {
  const dir = mkdtempSync(resolve(tmpdir(), 'step-roundtrip-mut-'));
  const copy = resolve(dir, 'operations-field.tsx');
  const src = readFileSync(FIELD_FILE, 'utf8');
  const anchor = '  const isMachineStep = isMachineType(opType);';
  if (!src.includes(anchor)) throw new Error('мутация эффекта не нашла свою точку врезки');
  const injected = `${anchor}
  useEffect(() => {
    if (!isMachineStep && (getValues(\`operations.\${index}.threadCount\`) ?? 0) !== 0) {
      setValue(\`operations.\${index}.threadCount\`, 0, { shouldDirty: true });
    }
  }, [isMachineStep, index, getValues, setValue]);`;
  writeFileSync(copy, src.replace(anchor, injected));
  return copy;
}

console.log(`\n${bad === 0 ? 'проба зелёная' : `провалов: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
