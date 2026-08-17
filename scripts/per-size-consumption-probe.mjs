// Ф2.4: ПЕР-РАЗМЕРНЫЙ РАСХОД против ПРАВИЛ СЕРВЕРА, переписанных здесь вручную.
//
// Провод собирается НЕ клиентскими функциями, а рукописной копией entity/marker_size_consumption.go
// (MarkerSizeAreasPerGarment + MarkerPerSizeConsumption + округление в dto.markerCompositionToPb).
// Если бы сводку строил тот же код, который её читает, зонд доказывал бы только внутреннюю
// согласованность клиента — а вопрос стоит иначе: читает ли клиент то, что реально шлёт сервер.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `per-size-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'per-size-consumption-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── ПРАВИЛА СЕРВЕРА (переписаны из internal/entity/marker_size_consumption.go) ──────────
//
// a_s = Σ (кол-во × площадь) деталей размера s + Σ (кол-во × площадь) деталей БЕЗ размера.
// Неградуируемая деталь входит в КАЖДЫЙ размер целиком, а не долей от состава: формула
// экземпляров блоба говорит именно это, и только под такой атрибуцией выполняется тождество
// Σ_s q_s·a_s = Σ_детали площадь × экземпляры.
function serverSizeAreas(composition, pieces) {
  const inComp = new Set(composition.map((c) => c.sizeId));
  const areas = new Map(composition.map((c) => [c.sizeId, 0]));
  let agnostic = 0;
  for (const p of pieces) {
    if (p.quantity < 1 || p.areaCm2 < 0) return null;
    const contribution = p.areaCm2 * p.quantity;
    const sid = p.sizeId ?? 0;
    if (sid === 0) { agnostic += contribution; continue; }
    if (!inComp.has(sid)) return null;
    areas.set(sid, areas.get(sid) + contribution);
  }
  const out = new Map();
  for (const c of composition) {
    // MarkerAreaScale = 2, и округление делается ЗДЕСЬ, на выводе, а не у границы хранения.
    const a = Math.round((areas.get(c.sizeId) + agnostic) * 100) / 100;
    if (!(a > 0)) return null;
    out.set(c.sizeId, a);
  }
  return out;
}

// расход(s) = a_s · L / Σ_j (q_j · a_j); один размер в составе отвечает L/q и площадей не требует.
function serverPerSize(composition, usedLengthCm, areaBySize) {
  const rows = composition.map((c) => ({
    sizeId: c.sizeId, quantity: c.quantity,
    areaCm2: areaBySize ? areaBySize.get(c.sizeId) : undefined,
    consumptionCm: undefined,
  }));
  if (!(usedLengthCm > 0)) return rows;
  if (composition.some((c) => c.quantity < 1)) return rows;
  if (composition.length === 1) {
    rows[0].consumptionCm = usedLengthCm / composition[0].quantity;
    return rows;
  }
  if (!areaBySize) return rows;
  let total = 0;
  for (const c of composition) {
    const a = areaBySize.get(c.sizeId);
    if (!(a > 0)) return rows;
    total += a * c.quantity;
  }
  if (!(total > 0)) return rows;
  for (const r of rows) r.consumptionCm = (areaBySize.get(r.sizeId) * usedLengthCm) / total;
  return rows;
}

// dto.markerCompositionToPb: расход округляется до сотых, площадь — НЕТ (она уже хранится в scale 2).
const r2 = (n) => Math.round(n * 100) / 100;
const dec = (n) => ({ value: String(n) });
const wireComposition = (rows) =>
  rows.map((r) => ({
    sizeId: r.sizeId, quantity: r.quantity,
    consumptionPerUnitCm: r.consumptionCm != null ? dec(r2(r.consumptionCm)) : undefined,
    areaPerGarmentCm2: r.areaCm2 != null ? dec(r.areaCm2) : undefined,
  }));

// Слово в слово из entity.MarkerScalarNormRefusal — ветка «площади есть».
const refusalWithAreas = (name, sizes, units) =>
  `раскладка "${name}" снята на смешанном составе (${sizes} размеров, ${units} изделий), и ОДНОГО расхода на изделие у неё нет: среднее по составу завышает мелкие размеры и занижает крупные — ровно тот перекос, ради устранения которого заводился состав. В рецепт такое число не пишется. Примените её ПО РАЗМЕРАМ: у каждого размера состава есть свой расход — длина настила распределена по площадям деталей этого размера.`;
// …и ветка «площадей нет» (снята между Ф2.1 и Ф2.4).
const refusalNoAreas = (name, sizes, units) =>
  `раскладка "${name}" снята на смешанном составе (${sizes} размеров, ${units} изделий), и ОДНОГО расхода на изделие у неё нет: среднее по составу завышает мелкие размеры и занижает крупные — ровно тот перекос, ради устранения которого заводился состав. В рецепт такое число не пишется. Пер-размерный расход по ней тоже не считается: в раскладке не записаны площади деталей по размерам (снята до Ф2.4). Пересохраните раскладку из модалки — площади запишутся, и её можно будет применить по размерам, — либо примените раскладку одного размера.`;

// ── ФИКТУРА: настил M×2 + L×1, карман без размера ×2 на изделие ─────────────────────────
//
//   BP_M 800 + SL_M 200 = 1000        BP_L 900 + SL_L 200 = 1100        POCKET 50 ×2 = 100
//   a_M = 1000 + 100 = 1100           a_L = 1100 + 100 = 1200
//   A   = 2·1100 + 1·1200 = 3400,  L = 340  ⇒  k = 0.1 см/см²
//   расход(M) = 110, расход(L) = 120,  2·110 + 120 = 340 = L
//
// ДВЕ градуированные основы (BP и SL), а не одна, — этого требует deriveBlockSizes: токен
// считается размерным, только если встретился минимум у двух основ, иначе «FP_L» (левая полочка)
// слилась бы с «FP_R». Одна основа в фикстуре означала бы, что зонд проверяет градацию, которой
// разбор имён в этом коде не признаёт вовсе.
const SIZE = { XS: 1, M: 3, L: 4, XL: 5 };
const COMPOSITION = [{ sizeId: SIZE.M, quantity: 2 }, { sizeId: SIZE.L, quantity: 1 }];
const BLOB_PIECES = [
  { blockName: 'BP_M', quantity: 1, areaCm2: 800, sizeId: SIZE.M },
  { blockName: 'SL_M', quantity: 1, areaCm2: 200, sizeId: SIZE.M },
  { blockName: 'BP_L', quantity: 1, areaCm2: 900, sizeId: SIZE.L },
  { blockName: 'SL_L', quantity: 1, areaCm2: 200, sizeId: SIZE.L },
  { blockName: 'POCKET', quantity: 2, areaCm2: 50 },
];
const USED_LENGTH = 340;

const AREAS = serverSizeAreas(COMPOSITION, BLOB_PIECES);
const PER_SIZE = serverPerSize(COMPOSITION, USED_LENGTH, AREAS);
const TOTAL_UNITS = COMPOSITION.reduce((s, c) => s + c.quantity, 0);

const mixedSummary = (over = {}) => ({
  id: 1, name: 'смешанная', usedLengthCm: dec(USED_LENGTH), totalUnits: TOTAL_UNITS,
  sizeId: 0, sets: 0, fabricWidthCm: dec(150), efficiencyPct: dec(70),
  seamAllowanceMm: dec(0), contourLayer: '', grainLayer: '',
  composition: wireComposition(PER_SIZE),
  scalarApplyRefusal: refusalWithAreas('смешанная', 2, TOTAL_UNITS),
  ...over,
});

// Сегодняшние выкройки: те же контуры плюс XL, которого в настиле не было.
const FILE_OK = [
  m.piece(1, 'BP_M', 800), m.piece(2, 'SL_M', 200),
  m.piece(3, 'BP_L', 900), m.piece(4, 'SL_L', 200),
  m.piece(5, 'BP_XL', 1000), m.piece(6, 'SL_XL', 200),
  m.piece(7, 'POCKET', 50),
];
const TOKENS = { [SIZE.XS]: ['xs'], [SIZE.M]: ['m'], [SIZE.L]: ['l'], [SIZE.XL]: ['xl'] };
const isSizeToken = (t) => ['xs', 's', 'm', 'l', 'xl'].includes(t);
const areasFrom = (parsed, over = {}) =>
  m.sizeAreasFromParsed({
    marker: m.marker({ summary: mixedSummary(), pieces: BLOB_PIECES }),
    parsed,
    sizeIds: [SIZE.XS, SIZE.M, SIZE.L, SIZE.XL],
    tokensOfSize: (id) => TOKENS[id] ?? [],
    isSizeToken,
    ...over,
  });

console.log('\nA · СХОДИМОСТЬ: Σ (расход × количество) = длина настила');
{
  const s = mixedSummary();
  const rows = m.sizeNormsOf(s);
  ck(rows.length === 2, 'состав прочитан двумя строками', JSON.stringify(rows));
  const sum = rows.reduce((acc, r) => acc + r.quantity * r.consumptionCm, 0);
  ck(near(sum, USED_LENGTH, 0.005 * TOTAL_UNITS + 1e-9),
     'Σ q·расход = длина настила (в пределах шага публикации)', `${sum} против ${USED_LENGTH}`);
  ck(m.perSizeComplete(s), 'раскладка отвечает по размерам');
  ck(m.consumptionForSize(s, SIZE.M) === 110, 'M: 110 см/ед', String(m.consumptionForSize(s, SIZE.M)));
  ck(m.consumptionForSize(s, SIZE.L) === 120, 'L: 120 см/ед', String(m.consumptionForSize(s, SIZE.L)));
  ck(m.consumptionForSize(s, SIZE.XL) === null, 'XL: размера в составе нет — числа нет');
  // Тот самый перекос, ради которого всё затевалось: среднее одинаково для M и L.
  ck(m.meanConsumptionCm(s) === r2(USED_LENGTH / TOTAL_UNITS),
     `среднее по настилу = ${r2(USED_LENGTH / TOTAL_UNITS)} см — между 110 и 120, и неверно для обоих`);
}

console.log('\nB · СКАЛЯР НЕ ТРОНУТ: смешанная по-прежнему не выдаёт одного числа');
{
  const s = mixedSummary();
  ck(m.consumptionCm(s) === null, 'consumptionCm = null (не 113.33)', String(m.consumptionCm(s)));
  ck(m.scalarNormRefusal(s).includes('примените её ПО РАЗМЕРАМ'.toLowerCase()) ||
     m.scalarNormRefusal(s).includes('Примените её ПО РАЗМЕРАМ'),
     'отказ сервера доехал слово в слово и называет лекарство');
  ck(m.latestPerSize([s]).size === 2, 'СМЕШАННАЯ ТЕПЕРЬ НОРМИРУЕТ ОБА СВОИХ РАЗМЕРА',
     String(m.latestPerSize([s]).size));
}

console.log('\nC · РАСКЛАДКА ДО Ф2.4: пер-размерных чисел нет — и сказано почему');
{
  // Ровно то, что шлёт сервер о такой строке: состав есть, площадей нет, расходов нет.
  const legacy = mixedSummary({
    name: 'снята до Ф2.4',
    composition: COMPOSITION.map((c) => ({ sizeId: c.sizeId, quantity: c.quantity })),
    scalarApplyRefusal: refusalNoAreas('снята до Ф2.4', 2, TOTAL_UNITS),
  });
  ck(m.perSizeComplete(legacy) === false, 'пер-размерного ответа НЕТ');
  ck(m.consumptionForSize(legacy, SIZE.M) === null, 'M: числа нет (не среднее)',
     String(m.consumptionForSize(legacy, SIZE.M)));
  ck(m.latestPerSize([legacy]).size === 0, 'в карту «размер → раскладка» НЕ ПОПАДАЕТ');
  ck(m.canContinue(legacy) === false, 'продолжать нечем — площадей она не публикует');
  ck(m.scalarNormRefusal(legacy).includes('Пересохраните раскладку'),
     'ГОВОРИТ ПОЧЕМУ и что делать: пересохранить раскладку');
  const plan = m.perSizePlan({ sizeIds: [SIZE.M, SIZE.L], bySize: m.latestPerSize([legacy]), continueFrom: legacy });
  ck(plan.complete === false && plan.rows.every((r) => r.consumptionCm === null),
     'план пуст: ни одного числа');
  ck(m.perSizeRefusal(plan, (id) => `#${id}`) !== '', 'план тоже говорит почему',
     m.perSizeRefusal(plan, (id) => `#${id}`));
}

console.log('\nD · ПЛОЩАДИ ПО ВЫКРОЙКАМ воспроизводят серверные');
{
  const out = areasFrom(FILE_OK);
  ck(out.ok, 'площади посчитаны', out.ok ? '' : out.reason);
  if (out.ok) {
    ck(near(out.areas.agnosticCm2, 100), 'карман: 2 × 50 = 100 см² в КАЖДОМ размере',
       String(out.areas.agnosticCm2));
    ck(near(out.areas.areaBySize.get(SIZE.M), AREAS.get(SIZE.M)),
       `a_M совпала с серверной (${AREAS.get(SIZE.M)})`, String(out.areas.areaBySize.get(SIZE.M)));
    ck(near(out.areas.areaBySize.get(SIZE.L), AREAS.get(SIZE.L)),
       `a_L совпала с серверной (${AREAS.get(SIZE.L)})`, String(out.areas.areaBySize.get(SIZE.L)));
    ck(near(out.areas.areaBySize.get(SIZE.XL), 1300), 'a_XL = 1200 + 100 = 1300 см²',
       String(out.areas.areaBySize.get(SIZE.XL)));
    ck(out.areas.sizesWithoutPieces.includes(SIZE.XS), 'XS: выкроек нет — размер помечен',
       JSON.stringify(out.areas.sizesWithoutPieces));
  }
}

console.log('\nE · ПРОДОЛЖЕНИЕ на размер вне состава — той же константой');
{
  const s = mixedSummary();
  const out = areasFrom(FILE_OK);
  const plan = m.perSizePlan({
    sizeIds: [SIZE.M, SIZE.L, SIZE.XL],
    bySize: m.latestPerSize([s]),
    continueFrom: s,
    clientAreas: out.ok ? out.areas.areaBySize : undefined,
  });
  ck(plan.continuation === 'ok', 'сверка площадей прошла — продолжение разрешено', plan.continuation);
  ck(plan.complete, 'все три размера получили число');
  const by = plan.bySize;
  ck(by.get(SIZE.M).origin === 'marker' && by.get(SIZE.M).consumptionCm === 110,
     'M — ИЗМЕРЕНО раскладкой, 110', m.originLabel(by.get(SIZE.M).origin));
  ck(by.get(SIZE.XL).origin === 'area', 'XL — ПРОДОЛЖЕНО по площади', m.originLabel(by.get(SIZE.XL).origin));
  // k = L/A = 340/3400 = 0.1 ⇒ расход(XL) = 1300 × 0.1 = 130
  ck(by.get(SIZE.XL).consumptionCm === 130, 'XL = a_XL × k = 1300 × 0.1 = 130 см',
     String(by.get(SIZE.XL).consumptionCm));
  // И сходимость продолжения: если бы XL резали, длина настила выросла бы ровно на его расход.
  const basis = m.continuationBasisOf(s);
  ck(near(basis.cmPerCm2, USED_LENGTH / 3400), 'константа k собрана из того, что прислал сервер',
     String(basis.cmPerCm2));
  ck(near(basis.totalAreaCm2, 3400), 'знаменатель Σ q·a = 3400 см²', String(basis.totalAreaCm2));
}

console.log('\nF · ПЛОЩАДИ РАЗОШЛИСЬ — продолжение ЗАБЛОКИРОВАНО (файлы менялись после съёмки)');
{
  const s = mixedSummary();
  // Лекальщик поправил полочку: 800 → 1000 см². Длина настила осталась от прежней геометрии.
  const moved = [
    m.piece(1, 'BP_M', 1000), m.piece(2, 'SL_M', 200),
    m.piece(3, 'BP_L', 900), m.piece(4, 'SL_L', 200),
    m.piece(5, 'BP_XL', 1000), m.piece(6, 'SL_XL', 200),
    m.piece(7, 'POCKET', 50),
  ];
  const out = areasFrom(moved);
  ck(out.ok, 'площади посчитались (расхождение ловится сверкой, а не разбором)');
  const check = m.checkClientAreas(m.continuationBasisOf(s), out.areas.areaBySize);
  ck(check.ok === false, 'сверка ОТКАЗЫВАЕТ');
  ck(check.reason.includes('the patterns changed after the capture'), 'называет причину', check.reason.slice(0, 80) + '…');
  const plan = m.perSizePlan({
    sizeIds: [SIZE.M, SIZE.L, SIZE.XL], bySize: m.latestPerSize([s]),
    continueFrom: s, clientAreas: out.areas.areaBySize,
  });
  ck(plan.continuation === 'blocked', 'план: продолжение недействительно', plan.continuation);
  ck(plan.bySize.get(SIZE.XL).consumptionCm === null,
     'XL НЕ получил числа — молчаливой экстраполяции по чужим файлам не случилось');
  ck(plan.complete === false, 'применить по размерам нельзя');
  // Граница допуска: 0.5 % проходит, больше — нет.
  const edge = new Map([[SIZE.M, AREAS.get(SIZE.M) * (1 + m.AREA_REL_TOL * 0.9)], [SIZE.L, AREAS.get(SIZE.L)]]);
  ck(m.checkClientAreas(m.continuationBasisOf(s), edge).ok, 'внутри допуска (0.45 %) — проходит');
  const over = new Map([[SIZE.M, AREAS.get(SIZE.M) * (1 + m.AREA_REL_TOL * 2)], [SIZE.L, AREAS.get(SIZE.L)]]);
  ck(!m.checkClientAreas(m.continuationBasisOf(s), over).ok, 'вдвое сверх допуска (1 %) — отказ');
  // Нечего сверять — тоже отказ: непроверенная площадь нефальсифицируема.
  ck(!m.checkClientAreas(m.continuationBasisOf(s), new Map([[SIZE.XL, 1300]])).ok,
     'ни одного общего размера — сверять не с чем, продолжать нельзя');
}

console.log('\nG · РАЗМЕР БЕЗ ВЫКРОЕК — среднее, и оно ПОМЕЧЕНО');
{
  const s = mixedSummary();
  const out = areasFrom(FILE_OK);
  const plan = m.perSizePlan({
    sizeIds: [SIZE.XS, SIZE.M, SIZE.L, SIZE.XL],
    bySize: m.latestPerSize([s]), continueFrom: s, clientAreas: out.areas.areaBySize,
  });
  const xs = plan.bySize.get(SIZE.XS);
  ck(xs.origin === 'mean', 'XS: происхождение — СРЕДНЕЕ', m.originLabel(xs.origin));
  ck(xs.consumptionCm === r2(USED_LENGTH / TOTAL_UNITS), `XS = ${r2(USED_LENGTH / TOTAL_UNITS)} см`,
     String(xs.consumptionCm));
  ck(plan.meanSizes.length === 1 && plan.meanSizes[0] === SIZE.XS,
     'план ОТДЕЛЬНО перечисляет размеры на среднем — экрану есть что назвать',
     JSON.stringify(plan.meanSizes));
  ck(m.originLabel('mean') === 'MEAN', 'подпись среднего — не «из раскладки»', m.originLabel('mean'));
  ck(m.originLabel('area') !== m.originLabel('marker'),
     'продолженное и измеренное подписаны РАЗНО');
  // И оно действительно неверно для обоих краёв ряда — вот зачем пометка.
  ck(xs.consumptionCm > 110 && xs.consumptionCm < 120,
     'среднее лежит между M и L: для XS (мельче M) оно завышено', String(xs.consumptionCm));
}

console.log('\nH · ОДНОРОДНАЯ РАСКЛАДКА не сломана и продолжению тоже поддаётся');
{
  const comp = [{ sizeId: SIZE.M, quantity: 3 }];
  const pieces = [
    { blockName: 'BP_M', quantity: 1, areaCm2: 800 },
    { blockName: 'SL_M', quantity: 1, areaCm2: 200 },
    { blockName: 'POCKET', quantity: 2, areaCm2: 50 },
  ];
  // У однородной блоб размеров на деталях НЕ несёт — сервер считает их все безразмерными, и a_M
  // выходит той же суммой. Проверяем именно это совпадение.
  const areas = serverSizeAreas(comp, pieces);
  const rows = serverPerSize(comp, 330, areas);
  const s = {
    id: 2, name: 'однородная', usedLengthCm: dec(330), totalUnits: 3, sizeId: 0, sets: 0,
    seamAllowanceMm: dec(0), contourLayer: '', grainLayer: '',
    composition: wireComposition(rows), scalarApplyRefusal: '',
  };
  ck(areas.get(SIZE.M) === 1100, 'сервер: a_M = 1000 + 2×50 = 1100', String(areas.get(SIZE.M)));
  ck(m.consumptionCm(s) === 110, 'скаляр по-прежнему 330/3 = 110 см', String(m.consumptionCm(s)));
  ck(m.consumptionForSize(s, SIZE.M) === 110, 'пер-размерный ответ ТОТ ЖЕ (одно число на два режима)');
  ck(m.latestPerSize([s]).size === 1, 'в карте один размер');
  const out = m.sizeAreasFromParsed({
    marker: m.marker({ summary: s, pieces }), parsed: FILE_OK,
    sizeIds: [SIZE.M, SIZE.XL], tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken,
  });
  ck(out.ok && near(out.areas.areaBySize.get(SIZE.M), 1100),
     'клиент воспроизвёл a_M однородной раскладки', out.ok ? String(out.areas.areaBySize.get(SIZE.M)) : out.reason);
  const plan = m.perSizePlan({
    sizeIds: [SIZE.M, SIZE.XL], bySize: m.latestPerSize([s]), continueFrom: s,
    clientAreas: out.ok ? out.areas.areaBySize : undefined,
  });
  ck(plan.continuation === 'ok' && plan.bySize.get(SIZE.XL).origin === 'area',
     'XL продолжен и с ОДНОРОДНОЙ раскладки', plan.continuation);
  ck(plan.bySize.get(SIZE.XL).consumptionCm === r2((1300 * 330) / (3 * 1100)),
     `XL = 1300 × 330/(3×1100) = ${r2((1300 * 330) / (3 * 1100))} см`,
     String(plan.bySize.get(SIZE.XL).consumptionCm));

  // ЛЕГАСИ-СТРОКА (снята до Ф2, пара в шапке, состава на проводе нет) — их в базе большинство, и
  // переработанный latestPerSize обязан их пускать по-прежнему. Пер-размерных полей у неё нет
  // вовсе, и это НЕ повод отказать: у одного размера пер-размерный ответ и есть его скаляр.
  const legacy = { id: 3, name: 'легаси', sizeId: SIZE.M, sets: 4, composition: [],
                   totalUnits: 0, usedLengthCm: dec(400) };
  ck(m.consumptionCm(legacy) === 100, 'легаси: 400/4 = 100 см', String(m.consumptionCm(legacy)));
  ck(m.perSizeComplete(legacy), 'легаси отвечает по размерам');
  ck(m.latestPerSize([legacy]).get(SIZE.M) === legacy, 'легаси ПО-ПРЕЖНЕМУ в карте размеров');
  ck(m.consumptionForSize(legacy, SIZE.M) === 100, 'легаси: пер-размерный ответ = скаляр');
  ck(m.canContinue(legacy) === false, 'но продолжать по ней нечем — площадей она не несёт');
}

console.log('\nI · ОТКАЗЫ ПРОДОЛЖЕНИЯ вместо правдоподобного числа');
{
  const s = mixedSummary();
  // «Старая норма»: НИ ОДНО из трёх условий съёмки не записано (readMarkerConditions считает
  // записанными и слои — пустая строка там значима, «не разворачивать»). Повторить преобразование
  // контура нечем, а площади, посчитанные другим припуском, с записанными не сойдутся никогда.
  const bare = mixedSummary();
  delete bare.seamAllowanceMm;
  delete bare.contourLayer;
  delete bare.grainLayer;
  const noConditions = m.sizeAreasFromParsed({
    marker: m.marker({ summary: bare, pieces: BLOB_PIECES }),
    parsed: FILE_OK, sizeIds: [SIZE.XL], tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken,
  });
  ck(!noConditions.ok && noConditions.reason.includes('no capture conditions recorded'),
     'условия съёмки не записаны → отказ, а не догадка о припуске');
  // Полочки размера в файле нет (есть только рукав) — размер идёт в «без выкроек», а не в
  // частичную площадь: частичная меньше настоящей, а меньшая площадь молча ЗАНИЖАЕТ норму.
  const partial = areasFrom(FILE_OK.filter((p) => p.blockName !== 'BP_XL'));
  ck(partial.ok && !partial.areas.areaBySize.has(SIZE.XL),
     'у XL нет полочки в файле → площади нет вовсе (частичная занизила бы норму)');
  // Ничего не градуируется — продолжать значит объявить XL равным M.
  const flat = m.sizeAreasFromParsed({
    marker: m.marker({ summary: s, pieces: [{ blockName: 'POCKET', quantity: 2, areaCm2: 50 }] }),
    parsed: [m.piece(7, 'POCKET', 50)], sizeIds: [SIZE.M, SIZE.XL],
    tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken,
  });
  ck(!flat.ok && flat.reason.includes('not a single piece is graded by size'),
     'ни одна деталь не градуируется → продолжение отказано');
  // Одна деталь разложена разным числом на изделие в разных размерах — какое у XL, не знает никто.
  const skewed = m.sizeAreasFromParsed({
    marker: m.marker({ summary: s, pieces: [
      { blockName: 'BP_M', quantity: 1, areaCm2: 800, sizeId: SIZE.M },
      { blockName: 'BP_L', quantity: 2, areaCm2: 900, sizeId: SIZE.L },
      { blockName: 'SL_M', quantity: 1, areaCm2: 200, sizeId: SIZE.M },
      { blockName: 'SL_L', quantity: 1, areaCm2: 200, sizeId: SIZE.L },
    ] }),
    parsed: FILE_OK, sizeIds: [SIZE.XL], tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken,
  });
  ck(!skewed.ok && skewed.reason.includes('a different per-garment count'),
     'разное количество на изделие у одной детали → отказ, а не выбор большего');
}

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
