#!/usr/bin/env node
// Прогон словаря «ткань детали кроя» (Ф1а).
//
// Проверяет чистый модуль, который ошибается ТИХО во все стороны сразу: сырой int64 с провода
// промахивается мимо Map и делает все детали unbound; один null вместо двух записывает шнур в
// «не разложено»; забытое правило «клеевая только единственным слоем» ставит крест на лицевой
// полочке; дэшаррей, не попавший в шаг, рисует сплошную линию и mesh становится lining. Ни одну из
// четырёх ошибок не видно ни в tsc, ни на картинке.
//
//   node scripts/piece-cloth-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/piece-cloth-probe-entry.ts');

const outfile = resolve(tmpdir(), `piece-cloth-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
  absWorkingDir: root,
  // Алиасов проекта здесь НЕТ намеренно. Весь граф модуля — четыре листа (piece-cloth →
  // piece-layer-role → bom-purpose-labels, wire-int), и ни один из них не ходит по алиасам. Пока
  // это так, сборка проходит; первый же импорт из schema.ts (→ zod, react-hook-form) или любой
  // относительный путь через алиас уронит пробу на резолве — громко и до того, как чистый модуль
  // утянет схему карточки в публичные бандлы /p/:token и /r/:token.
});
const { CLOTH_GEOMETRY, CLOTH_RAMP, clothGroupKey, clothRollup, pickPrimaryLayer, pieceClothMap } =
  await import(pathToFileURL(outfile).href);

let checks = 0;
const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const j = (v) => JSON.stringify(v);
const eq = (a, b) => j(a) === j(b);
const is = (name, got, want) => {
  checks++;
  if (!eq(got, want)) fail(name, `${j(got)} ≠ ${j(want)}`);
};

// --- фикстуры -------------------------------------------------------------------------------------

const FABRIC = 'TECH_CARD_BOM_SECTION_FABRIC';
const LINING_SECTION = 'TECH_CARD_BOM_SECTION_LINING';
const INTERLINING = 'TECH_CARD_BOM_SECTION_INTERLINING';
const TRIM = 'TECH_CARD_BOM_SECTION_TRIM';
const P = (k) => `TECH_CARD_BOM_PURPOSE_${k}`;

// Каталог артикулов — ровно то, что модуль получает от вкладки колорвеев.
const CATALOG = new Map([
  [4412, { code: 'CORD-01', name: 'вельвет синий' }],
  [4413, { code: 'CORD-02', name: 'вельвет чёрный' }],
  [7701, { code: 'LIN-09', name: 'подклад купро' }],
]);

/** Карта в сравнимый вид: пары в порядке вставки. */
const pairs = (m) => [...m.entries()];

// --- 1. приоритет слоёв ---------------------------------------------------------------------------

is('приоритет: lining + main → main', pickPrimaryLayer(['lining', 'main']), 'main');

// Полный порядок рампы, попарно: каждое состояние бьёт следующее за ним.
const PRIORITY = ['main', 'contrast', 'lining', 'pocketing', 'mesh', 'other', 'unsorted'];
for (let i = 0; i < PRIORITY.length - 1; i++) {
  is(
    `приоритет: ${PRIORITY[i]} бьёт ${PRIORITY[i + 1]}`,
    pickPrimaryLayer([PRIORITY[i + 1], PRIORITY[i]]),
    PRIORITY[i],
  );
  // И в обратном порядке аргументов — приоритет не зависит от того, какая строка рецепта первая.
  is(
    `приоритет: ${PRIORITY[i]} бьёт ${PRIORITY[i + 1]} (обратный порядок)`,
    pickPrimaryLayer([PRIORITY[i], PRIORITY[i + 1]]),
    PRIORITY[i],
  );
}
is('приоритет: весь набор разом → main', pickPrimaryLayer([...PRIORITY].reverse()), 'main');
is('приоритет: пустой набор слоёв → unbound', pickPrimaryLayer([]), 'unbound');
// Две отложенные подряд — единственная пара, которую спека не называет. Разбирается порядком рампы
// (interfacing стоит раньше insulation), и кейс держит этот ответ от случайной перестановки рампы.
is(
  'приоритет: две отложенные — interfacing раньше insulation',
  pickPrimaryLayer(['insulation', 'interfacing']),
  'interfacing',
);

is(
  'CLOTH_RAMP — точный порядок рампы',
  [...CLOTH_RAMP],
  [
    'main',
    'contrast',
    'lining',
    'pocketing',
    'mesh',
    'interfacing',
    'insulation',
    'other',
    'unsorted',
    'unbound',
  ],
);

// --- 2. {role: null, rollGoods: false} → other ------------------------------------------------------

{
  // Секция не рулонная (шнур в TRIM): роли слоя у такой связи не бывает вовсе.
  const slots = [{ lineKey: 'SL-CORD', section: TRIM, purpose: P('UNSET'), materialId: 0 }];
  const usages = [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-CORD' }];
  const m = pieceClothMap(slots, usages, CATALOG, new Map());
  is('не-рулонная секция → other, а не unsorted', pairs(m), [['PC-1', { state: 'other' }]]);
}

// --- 3. {role: null, rollGoods: true} → unsorted -----------------------------------------------------

{
  // fabric без назначения — 0265 намеренно не бэкфилился, и это законное состояние, а не дефолт.
  const slots = [{ lineKey: 'SL-F', section: FABRIC, purpose: P('UNSET'), materialId: 0 }];
  const usages = [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-F' }];
  const m = pieceClothMap(slots, usages, CATALOG, new Map());
  is('fabric + UNSET → unsorted', pairs(m), [['PC-1', { state: 'unsorted' }]]);

  // Назначение вообще отсутствует в строке — тот же ответ, что и явный UNSET.
  const noPurpose = pieceClothMap(
    [{ lineKey: 'SL-F', section: FABRIC, materialId: 0 }],
    usages,
    CATALOG,
    new Map(),
  );
  is('fabric без поля purpose → unsorted', pairs(noPurpose), [['PC-1', { state: 'unsorted' }]]);
}

{
  // Два null — два РАЗНЫХ состояния на одном экране: слить их значит заставить аудит полки врать.
  const slots = [
    { lineKey: 'SL-CORD', section: TRIM, materialId: 0 },
    { lineKey: 'SL-F', section: FABRIC, materialId: 0 },
  ];
  const m = pieceClothMap(
    slots,
    [
      { pieceLineKey: 'PC-CORD', bomLineKey: 'SL-CORD' },
      { pieceLineKey: 'PC-F', bomLineKey: 'SL-F' },
    ],
    CATALOG,
    new Map(),
  );
  is('два null не сливаются', pairs(m), [
    ['PC-CORD', { state: 'other' }],
    ['PC-F', { state: 'unsorted' }],
  ]);
}

// --- 4. клеевая только единственным слоём -----------------------------------------------------------

{
  const slots = [
    { lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 4412 },
    { lineKey: 'SL-FUSE', section: INTERLINING, materialId: 0 },
    { lineKey: 'SL-INS', section: 'TECH_CARD_BOM_SECTION_INSULATION', materialId: 0 },
  ];
  const m = pieceClothMap(
    slots,
    [
      // Дублированная лицевая полочка: основная ткань + клеевая на одной детали.
      { pieceLineKey: 'PC-FRONT', bomLineKey: 'SL-MAIN' },
      { pieceLineKey: 'PC-FRONT', bomLineKey: 'SL-FUSE' },
      // Долевик: клеевая — единственный слой, свой знак он получает.
      { pieceLineKey: 'PC-STAY', bomLineKey: 'SL-FUSE' },
      { pieceLineKey: 'PC-WAD', bomLineKey: 'SL-INS' },
    ],
    CATALOG,
    new Map(),
  );
  is('MAIN + INTERFACING на одной детали → main', m.get('PC-FRONT'), {
    state: 'main',
    article: { id: 4412, code: 'CORD-01', name: 'вельвет синий' },
  });
  is('INTERFACING единственным слоем → interfacing', m.get('PC-STAY'), { state: 'interfacing' });
  is('INSULATION единственным слоем → insulation', m.get('PC-WAD'), { state: 'insulation' });
}

{
  // Клеевая отступает даже перед самым слабым живым слоем — иначе она перебивала бы «не разложено».
  const slots = [
    { lineKey: 'SL-F', section: FABRIC, materialId: 0 },
    { lineKey: 'SL-FUSE', section: INTERLINING, materialId: 0 },
  ];
  const m = pieceClothMap(
    slots,
    [
      { pieceLineKey: 'PC-1', bomLineKey: 'SL-FUSE' },
      { pieceLineKey: 'PC-1', bomLineKey: 'SL-F' },
    ],
    CATALOG,
    new Map(),
  );
  is('unsorted + interfacing → unsorted', m.get('PC-1'), { state: 'unsorted' });
}

// --- 5. легаси-мост bomItemId → lineKey --------------------------------------------------------------

{
  // Старая строка рецепта не несёт bom_line_key вовсе, только резолвнутый int64 — СТРОКОЙ с провода.
  const slots = [{ lineKey: 'SL-LIN', section: LINING_SECTION, materialId: 7701 }];
  const lineKeyByBomId = new Map([[910, 'SL-LIN']]);
  const m = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomItemId: '910' }],
    CATALOG,
    lineKeyByBomId,
  );
  is('легаси-usage резолвится по bomItemId-строке', pairs(m), [
    ['PC-1', { state: 'lining', article: { id: 7701, code: 'LIN-09', name: 'подклад купро' } }],
  ]);

  // Пустой bom_line_key (пробелы) не мешает мосту сработать.
  const blank = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomLineKey: '   ', bomItemId: '910' }],
    CATALOG,
    lineKeyByBomId,
  );
  is('пробельный bomLineKey уступает мосту', blank.get('PC-1')?.state, 'lining');

  // Строка без pieceLineKey (только позиционный pieceIndex) не резолвится ни при каком мосте.
  const positional = pieceClothMap(
    slots,
    [{ pieceIndex: 0, bomItemId: '910' }],
    CATALOG,
    lineKeyByBomId,
  );
  is('строка только с pieceIndex не резолвится', pairs(positional), []);

  // ПРОБЕЛЬНЫЙ pieceLineKey — мусор, а не идентичность, и `.trim()` в модуле обязан свести его к
  // пустому. Всё остальное в этой строке резолвится (мост находит слот), так что единственное, что
  // держит деталь вне карты, — сам trim. Без него в карту садится деталь с ключом «   », которой
  // нет ни в одном списке деталей: её штриховка не достаётся никому, а счётчик «без ткани» в
  // строке-слове тихо занижается на единицу — экран при этом остаётся правдоподобным.
  const blankPiece = pieceClothMap(
    slots,
    [{ pieceLineKey: '   ', bomItemId: '910' }],
    CATALOG,
    lineKeyByBomId,
  );
  is('пробельный pieceLineKey не резолвится', pairs(blankPiece), []);

  // Ссылка в никуда: слота с таким lineKey в форме нет — строка молча не резолвится, деталь
  // остаётся unbound, а не получает выдуманное состояние.
  const dangling = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomItemId: '99999' }],
    CATALOG,
    lineKeyByBomId,
  );
  is('bomItemId без слота → деталь не в карте', pairs(dangling), []);
}

// --- 6. пин колорвея бьёт дефолт слота ----------------------------------------------------------------

{
  const slots = [{ lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 4412 }];
  const inherited = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN' }],
    CATALOG,
    new Map(),
  );
  is('без пина берётся дефолт слота', inherited.get('PC-1'), {
    state: 'main',
    article: { id: 4412, code: 'CORD-01', name: 'вельвет синий' },
  });

  const pinned = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN', materialId: 4413 }],
    CATALOG,
    new Map(),
  );
  is('пин бьёт дефолт слота', pinned.get('PC-1'), {
    state: 'main',
    article: { id: 4413, code: 'CORD-02', name: 'вельвет чёрный' },
  });
  is('группа полки называет ПИН, а не дефолт', clothGroupKey(pinned.get('PC-1')), 'main#4413');
  is(
    'группа полки различает пин и дефолт',
    clothGroupKey(pinned.get('PC-1')) === clothGroupKey(inherited.get('PC-1')),
    false,
  );

  // Артикула нет нигде — ни пина, ни дефолта: связь есть, артикула нет, и это НЕ повод падать.
  const naked = pieceClothMap(
    [{ lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 0 }],
    [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN' }],
    CATALOG,
    new Map(),
  );
  is('нет ни пина, ни дефолта → артикула нет', naked.get('PC-1'), { state: 'main' });
  is('группа полки без артикула', clothGroupKey(naked.get('PC-1')), 'main#0');

  // Артикула нет в каталоге (не доехал или удалён) — печатается id, экран не падает.
  const unknown = pieceClothMap(
    slots,
    [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN', materialId: 6001 }],
    CATALOG,
    new Map(),
  );
  is('неизвестный каталогу артикул не роняет карту', unknown.get('PC-1'), {
    state: 'main',
    article: { id: 6001, code: '6001', name: '' },
  });

  // Артикул В КАТАЛОГЕ ЕСТЬ, но его код — одни пробелы (в справочнике материалов код поле
  // необязательное). Пустой код обязан уступить фолбэку на id: иначе деталь с артикулом выглядит
  // на полке и в title ровно как деталь без артикула, и различить их глазами нечем — а группы
  // полки при этом РАЗНЫЕ, потому что группа считается по id. Имя из каталога при этом остаётся.
  const blankCode = pieceClothMap(
    [{ lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 0 }],
    [{ pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN', materialId: 8802 }],
    new Map([[8802, { code: '  ', name: 'сукно' }]]),
    new Map(),
  );
  is('пробельный код каталога уступает id', blankCode.get('PC-1'), {
    state: 'main',
    article: { id: 8802, code: '8802', name: 'сукно' },
  });
}

{
  // Артикул от ВЫИГРАВШЕГО слоя, а не от первого по порядку строк рецепта: клеевая со своим
  // артикулом идёт ПЕРВОЙ строкой, основная — второй; подпись обязана назвать ткань основной.
  const slots = [
    { lineKey: 'SL-FUSE', section: INTERLINING, materialId: 7701 },
    { lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 4412 },
  ];
  const m = pieceClothMap(
    slots,
    [
      { pieceLineKey: 'PC-1', bomLineKey: 'SL-FUSE' },
      { pieceLineKey: 'PC-1', bomLineKey: 'SL-MAIN' },
    ],
    CATALOG,
    new Map(),
  );
  is('артикул берётся от выигравшего слоя, не от первой строки', m.get('PC-1'), {
    state: 'main',
    article: { id: 4412, code: 'CORD-01', name: 'вельвет синий' },
  });
}

// --- 7. два артикула под одним назначением = две группы ------------------------------------------------

{
  const slots = [
    { lineKey: 'SL-A', section: FABRIC, purpose: P('MAIN'), materialId: 4412 },
    { lineKey: 'SL-B', section: FABRIC, purpose: P('MAIN'), materialId: 4413 },
  ];
  const m = pieceClothMap(
    slots,
    [
      { pieceLineKey: 'PC-A', bomLineKey: 'SL-A' },
      { pieceLineKey: 'PC-B', bomLineKey: 'SL-B' },
    ],
    CATALOG,
    new Map(),
  );
  is(
    'одно назначение, два артикула — одно состояние',
    [m.get('PC-A').state, m.get('PC-B').state],
    ['main', 'main'],
  );
  is(
    '…но две РАЗНЫЕ группы полки',
    [clothGroupKey(m.get('PC-A')), clothGroupKey(m.get('PC-B'))],
    ['main#4412', 'main#4413'],
  );
}

// --- 8. геометрия: дэшаррей обязан делить шаг нацело -----------------------------------------------------

{
  // Словарь спеки целиком: любое расхождение здесь молча меняет знак ткани на всех четырёх экранах.
  is('CLOTH_GEOMETRY — числа словаря', CLOTH_GEOMETRY, {
    unbound: { kind: 'flat' },
    unsorted: { kind: 'dot', tile: 4, r: 0.62 },
    mesh: { kind: 'line', tile: 5, rot: -45, dash: [3, 2] },
    other: { kind: 'line', tile: 5, rot: 45, dash: [3, 2] },
    main: { kind: 'line', tile: 6, rot: 45 },
    lining: { kind: 'line', tile: 4, rot: -45 },
    contrast: { kind: 'line', tile: 3.5, rot: 45 },
    pocketing: { kind: 'line', tile: 3, rot: -45 },
    interfacing: { kind: 'cross', tile: 5, rot: 45 },
    insulation: { kind: 'cross', tile: 3.5, rot: 45 },
  });

  for (const state of CLOTH_RAMP) {
    const g = CLOTH_GEOMETRY[state];
    checks++;
    if (!g) fail(`геометрия: ${state}`, 'нет записи в CLOTH_GEOMETRY');
  }

  for (const [state, g] of Object.entries(CLOTH_GEOMETRY)) {
    if (!g.dash) continue;
    const sum = g.dash[0] + g.dash[1];
    // Дэшаррей, не попавший в шаг, рисует СПЛОШНУЮ линию: mesh становится неотличим от lining.
    is(`дэш ${state} делит шаг нацело`, g.tile % sum === 0, true);
    is(`дэш ${state} равен шагу`, sum, g.tile);
  }

  for (const [state, g] of Object.entries(CLOTH_GEOMETRY)) {
    if (g.rot === undefined) continue;
    // Осевая штриховка сливается с краями прямоугольной детали — таких в словаре нет ни одной.
    is(`угол ${state} не осевой`, Math.abs(g.rot) % 90 !== 0, true);
  }

  is('контраст держит угол основной ткани', CLOTH_GEOMETRY.contrast.rot, CLOTH_GEOMETRY.main.rot);
  is(
    'встречные семейства: подклад против основной',
    CLOTH_GEOMETRY.lining.rot === -CLOTH_GEOMETRY.main.rot,
    true,
  );
}

// --- 9. вся фикстура строками: ни один лукап не промахивается --------------------------------------------

{
  // Ровно то, что приезжает с grpc-gateway: int64 сериализован СТРОКОЙ, а тип обещает number.
  const slots = [
    { lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: '4412' },
    { lineKey: 'SL-LIN', section: LINING_SECTION, materialId: '7701' },
  ];
  const m = pieceClothMap(
    slots,
    [
      { pieceLineKey: 'PC-1', bomItemId: '910', materialId: '4413' },
      { pieceLineKey: 'PC-2', bomItemId: '911' },
    ],
    CATALOG,
    new Map([
      [910, 'SL-MAIN'],
      [911, 'SL-LIN'],
    ]),
  );
  is('id строками резолвятся полностью', pairs(m), [
    ['PC-1', { state: 'main', article: { id: 4413, code: 'CORD-02', name: 'вельвет чёрный' } }],
    ['PC-2', { state: 'lining', article: { id: 7701, code: 'LIN-09', name: 'подклад купро' } }],
  ]);
}

// --- 10. карточка без колорвеев ---------------------------------------------------------------------------

{
  const slots = [{ lineKey: 'SL-MAIN', section: FABRIC, purpose: P('MAIN'), materialId: 4412 }];
  const m = pieceClothMap(slots, [], CATALOG, new Map());
  // Пустая карта — это «ответа нет», а не «ответ по умолчанию»: читатель трактует отсутствие как
  // unbound и рисует сегодняшнюю плоскую заливку.
  is('пустые usages → пустая карта', pairs(m), []);
  // Проверяется ФАКТ отсутствия, а не подставленный самой пробой фолбэк: сравнение с `?? unbound`
  // зелено при любом поведении модуля и только надувает счёт.
  is('пустая карта: детали в ней нет', m.has('PC-1'), false);
}

// --- 11. свёртка словами -----------------------------------------------------------------------------------

is(
  'свёртка: main ×2 · pocketing ×1',
  clothRollup(['main', 'main', 'pocketing']),
  'main ×2 · pocketing ×1',
);
is('свёртка: пустой вход — пустая строка', clothRollup([]), '');
is('свёртка: unbound называется словами', clothRollup(['unbound', 'unbound']), 'no cloth ×2');
is(
  'свёртка идёт порядком рампы, а не порядком входа',
  clothRollup(['unsorted', 'lining', 'main', 'mesh']),
  'main ×1 · lining ×1 · mesh ×1 · unsorted ×1',
);

console.log(`\n${checks - failed.size} из ${checks} проверок прошло`);
if (failed.size) process.exitCode = 1;
