// Ф2.2: блоб buildMarkerLayout против ПРАВИЛ СЕРВЕРА, переписанных здесь вручную.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `comp-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'marker-composition-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: { components: resolve(REPO,'src/components'), lib: resolve(REPO,'src/lib'), api: resolve(REPO,'src/api') },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d='') => { if(!ok) bad++; console.log(`${ok?'  ok  ':'  FAIL'} ${what}${d?`  — ${d}`:''}`); };

// ── правила сервера (переписаны из internal/dto/techcard.go, а не позаимствованы) ──
function serverJudges(blob, legacy) {
  const errs = [];
  const comp = blob.composition ?? [];
  const pieceSizes = (blob.pieces ?? []).map(p => p.sizeId).filter(s => s != null && s > 0);
  const hasComp = comp.length > 0, hasPieceSize = pieceSizes.length > 0;
  if ((hasComp || hasPieceSize) && blob.schemaVersion > 0 && blob.schemaVersion < 4)
    errs.push('composition_predates_schema');
  if (blob.schemaVersion < 1 || blob.schemaVersion > 4) errs.push('schema not supported');
  const inComp = new Set(comp.map(c => c.sizeId));
  for (const s of pieceSizes) if (!inComp.has(s)) errs.push(`piece size ${s} not in состав`);
  if (hasPieceSize) for (const c of comp)
    if (!(blob.pieces ?? []).some(p => p.sizeId === c.sizeId)) errs.push(`состав cuts ${c.sizeId}, no piece`);
  // markerCompositionOfInsert
  let stored;
  if (hasComp) stored = comp.map(c => ({...c}));
  else if (legacy.sizeId > 0 && legacy.sets >= 1) stored = [{ sizeId: legacy.sizeId, quantity: legacy.sets }];
  else errs.push('composition_missing');
  const sorted = [...comp].every((c,i,a) => i===0 || a[i-1].sizeId < c.sizeId);
  if (hasComp && !sorted) errs.push('composition not sorted');
  // entity.ValidateMarkerComposition — правила НАЗВАНЫ, а не выведены из сортировки. Дубль ловился
  // раньше лишь ПОБОЧНО (строгим '<' в проверке порядка), то есть ровно то правило, ради которого
  // существует случай E, здесь не было заявлено вовсе.
  const seen = new Set();
  for (const c of comp) {
    if (seen.has(c.sizeId)) errs.push(`composition lists size ${c.sizeId} twice`);
    seen.add(c.sizeId);
    if (!(c.quantity >= 1)) errs.push(`size ${c.sizeId}: quantity must be >= 1`);
    if (c.quantity > 5000) errs.push(`size ${c.sizeId}: quantity over MaxMarkerTotalUnits`);
  }
  if (comp.length > 32) errs.push('composition over MaxMarkerCompositionSizes');
  const units = comp.reduce((s, c) => s + c.quantity, 0);
  if (units > 5000) errs.push('total_units over MaxMarkerTotalUnits');
  return { errs, stored, totalUnits: stored ? stored.reduce((s,c)=>s+c.quantity,0) : 0 };
}

// экземпляров детали по формуле блоба
const instances = (blob, p, totalUnits, comp) =>
  (p.sizeId > 0 ? (comp.find(c=>c.sizeId===p.sizeId)?.quantity ?? 0) : totalUnits) * p.quantity;

// ПАРА ШАПКИ БЕРЁТСЯ ИЗ КОДА, а не переписывается константой. Раньше здесь стояли рукописные
// {0,0} и {3,3} с комментарием «ровно то, что шлёт модалка», и это было единственным местом,
// которому приходилось верить: регресс `sets: 1` на смешанном маркере — тот самый, что подставлял
// «настил кроит одно изделие», — печатал 19/19. Теперь пару собирает legacyPairOf, то есть та же
// функция, которую зовёт путь сохранения.
const wirePair = (comp) => m.legacyPairOf(comp);

console.log('\nA · смешанный настил M×2 + L×1, карман без размера ×2 на изделие');
{
  const b = m.mixed();
  const legacy = wirePair([{ sizeId: 3, quantity: 2 }, { sizeId: 4, quantity: 1 }]);
  ck(legacy.sizeId === 0 && legacy.sets === 0,
     'шапка смешанного шлёт НУЛИ (состав победит в блобе)', JSON.stringify(legacy));
  const v = serverJudges(b, legacy);
  ck(v.errs.length === 0, 'сервер принимает блоб', v.errs.join('; ') || 'без замечаний');
  ck(b.schemaVersion === 4, 'schema_version = 4', String(b.schemaVersion));
  ck(v.totalUnits === 3, 'total_units = 3 изделия', String(v.totalUnits));
  ck(b.composition?.[0]?.sizeId === 3 && b.composition?.[1]?.sizeId === 4,
     'состав отсортирован по size_id (порядок формы не влияет на байты)',
     JSON.stringify(b.composition));
  const byId = Object.fromEntries(b.pieces.map(p => [p.pieceId, instances(b, p, v.totalUnits, b.composition)]));
  ck(byId[1] === 2 && byId[2] === 2, 'детали M кроятся по 2 (M×2)', JSON.stringify(byId));
  ck(byId[3] === 1 && byId[4] === 1, 'детали L кроятся по 1 (L×1)');
  ck(byId[5] === 6, 'карман без размера: 2 × 3 изделия = 6', String(byId[5]));
}

console.log('\nB · однородный настил M×3 — байты обязаны остаться прежними (легаси-форма)');
{
  const b = m.homogeneous();
  const legacy = wirePair([{ sizeId: 3, quantity: 3 }]);
  ck(legacy.sizeId === 3 && legacy.sets === 3,
     'шапка однородного несёт НАСТОЯЩУЮ пару (не 1 комплект)', JSON.stringify(legacy));
  const v = serverJudges(b, legacy);
  ck(v.errs.length === 0, 'сервер принимает блоб', v.errs.join('; ') || 'без замечаний');
  ck(b.schemaVersion === 3, 'schema_version = 3 (не 4: состава в блобе нет)', String(b.schemaVersion));
  ck(!('composition' in b) || b.composition === undefined, 'ключа composition в блобе НЕТ');
  ck(b.pieces.every(p => p.sizeId === undefined), 'size_id на деталях НЕ пишется');
  ck(v.totalUnits === 3, 'сервер восстановил 3 изделия из легаси-пары', String(v.totalUnits));
  const byId = Object.fromEntries(b.pieces.map(p => [p.pieceId, instances(b, p, v.totalUnits, [])]));
  ck(byId[1] === 3 && byId[2] === 3 && byId[5] === 6, 'формула даёт прежний ответ quantity × sets', JSON.stringify(byId));
}

console.log('\nC · чтение сохранённого: смешанный маркер, сводка приезжает с нулями');
{
  const b = m.mixed();
  const view = m.markerToView({
    summary: { id: 1, sizeId: 0, sets: 0, composition: [], totalUnits: 3,
               fabricWidthCm: { value: '150' }, usedLengthCm: { value: '300' },
               efficiencyPct: { value: '70' }, placedCount: 5, totalCount: 5 },
    layout: b,
  });
  ck(view.totalUnits === 3, 'состав прочитан ИЗ БЛОБА, а не из нулевой шапки', String(view.totalUnits));
  ck(view.composition.length === 2, 'два размера в составе', JSON.stringify(view.composition));
  ck(view.sizeIdByPieceId.get(1) === 3 && view.sizeIdByPieceId.get(3) === 4, 'размеры деталей прочитаны');
  ck(300 / view.totalUnits === 100, 'делитель расхода — изделия (100 см), а не 300');
}

console.log('\nD · легаси-маркер (снят до Ф2): шапка несёт пару, блоба состава нет');
{
  const view = m.markerToView({
    summary: { id: 2, sizeId: 7, sets: 4, composition: [], totalUnits: 0,
               fabricWidthCm: { value: '140' }, usedLengthCm: { value: '400' } },
    layout: { schemaVersion: 2, pieces: [], placements: [] },
  });
  ck(view.totalUnits === 4, 'изделий = sets', String(view.totalUnits));
  ck(view.composition.length === 1 && view.composition[0].sizeId === 7, 'состав из одной строки шапки');
}

console.log('\nE · дубль размера: файл назвал один размер дважды (BP_M и SL_R_m)');
{
  const b = m.duplicateSizes();
  const v = serverJudges(b, wirePair(b.composition ?? []));
  ck(v.errs.length === 0, 'сервер принимает блоб', v.errs.join('; ') || 'без замечаний');
  ck((b.composition ?? []).length === 2, 'дубль слит: две строки, не три',
     JSON.stringify(b.composition));
  const m3 = (b.composition ?? []).find((c) => c.sizeId === 3);
  ck(m3?.quantity === 3, 'количества дубля СЛОЖИЛИСЬ (2 + 1 = 3)', JSON.stringify(m3));
  ck(v.totalUnits === 4, 'всего изделий 4 (M×3 + L×1)', String(v.totalUnits));
}

console.log('\nF · ОТКАЗ ВЫДАТЬ НОРМУ и делитель расхода — то, ради чего Ф2 заводилась');
{
  // Смешанный: сервер молчит про расход (поля нет) — клиент обязан отказать САМ, а не поделить.
  const mix = { name: 'смешанная', composition: [{ sizeId: 3, quantity: 2 }, { sizeId: 4, quantity: 1 }],
                totalUnits: 3, usedLengthCm: { value: '300' } };
  ck(m.scalarNormRefusal(mix) !== '', 'смешанный состав → отказ');
  ck(m.consumptionCm(mix) === null, 'расход на изделие НЕ ВЫДАЁТСЯ (null, а не 100/300)',
     String(m.consumptionCm(mix)));
  // Маркер с составом: сервер шлёт sets = 0 (proto3 роняет умолчание). Прежняя дыра давала
  // usedLength / max(1, sets) = весь настил как норму ОДНОГО изделия.
  const zeroed = { name: 'нулевая шапка', sizeId: 0, sets: 0, composition: [], totalUnits: 0,
                   usedLengthCm: { value: '300' } };
  ck(m.compositionOf(zeroed).length === 0, 'пара (0,0) читается как НЕИЗВЕСТНО, а не как 1 комплект');
  ck(m.consumptionCm(zeroed) === null, 'нечитаемый состав → нормы нет (не 300 см на изделие)',
     String(m.consumptionCm(zeroed)));
  // Однородный: единственный сохранившийся расчёт обязан повторять серверную формулу.
  const homo = { name: 'однородная', composition: [{ sizeId: 3, quantity: 3 }], totalUnits: 3,
                 usedLengthCm: { value: '300' } };
  ck(m.scalarNormRefusal(homo) === '', 'однородный состав → отказа нет');
  ck(m.consumptionCm(homo) === 100, 'расход = длина / изделия = 100 см', String(m.consumptionCm(homo)));
  // Делитель и отказ обязаны читать ОДИН срез: разошедшийся totalUnits из шапки не должен
  // молча стать делителем — иначе одна строка описывает две разные раскладки.
  const skew = { name: 'расходится', composition: [{ sizeId: 3, quantity: 3 }], totalUnits: 9,
                 usedLengthCm: { value: '300' } };
  ck(m.totalUnitsOf(skew) === 3, 'делитель — СУММА СОСТАВА (3), а не totalUnits шапки (9)',
     String(m.totalUnitsOf(skew)));
  // Легаси-маркер (до Ф2): пара в шапке, состава нет — норма считается по-прежнему.
  const legacy = { name: 'легаси', sizeId: 7, sets: 4, composition: [], totalUnits: 0,
                   usedLengthCm: { value: '400' } };
  ck(m.consumptionCm(legacy) === 100, 'легаси: 400 / 4 = 100 см', String(m.consumptionCm(legacy)));
}

console.log('\nG · ВЛАДЕЛЕЦ МАРКЕРА (Ф4.2): карточные списки не показывают раскройные однодневки');
{
  // Три строки, приезжающие в ОДНОМ поле techCard.markers — своего List-RPC у клиента нет.
  // `noField` — это и карточный маркер (proto3 не шлёт нулевой скаляр), и ответ старого сервера,
  // который про поле ещё не знает. Оба случая обязаны читаться как КАРТОЧНЫЙ.
  const card = { id: 1, name: 'норма', bomLineKey: 'L1', colorwayId: 5, productionRunId: 0 };
  const noField = { id: 2, name: 'снята до Ф4', bomLineKey: 'L1', colorwayId: 5 };
  const runOwned = { id: 3, name: 'раскрой прогона 7', bomLineKey: 'L1', colorwayId: 5, productionRunId: 7 };
  const all = [card, noField, runOwned];

  const kept = m.cardMarkers(all).map((x) => x.id);
  ck(JSON.stringify(kept) === '[1,2]', 'карточный список: прогонный маркер СКРЫТ', JSON.stringify(kept));
  ck(m.cardMarkers([noField]).length === 1, 'undefined читается как КАРТОЧНЫЙ, а не «неизвестно»');
  ck(m.cardMarkers([runOwned]).length === 0, 'ненулевой production_run_id — единственная причина скрыть');
  ck(m.cardMarkers(undefined).length === 0, 'отсутствие списка — не падение');

  // Те же три строки через оба карточных фильтра: полоса расхода на костинге (markersForLine) и
  // предложение «применить расход в рецепт» (markersOfColorway). Прогонный маркер сидит на ТОЙ ЖЕ
  // строке BOM и в ТОМ ЖЕ колорвее, то есть по прежним правилам прошёл бы оба.
  const byLine = m.markersForLine(all, 'L1').map((x) => x.id);
  ck(JSON.stringify(byLine) === '[1,2]', 'markersForLine (костинг): прогонный не проходит', JSON.stringify(byLine));
  const byCw = m.markersOfColorway(all, 5).map((x) => x.id);
  ck(JSON.stringify(byCw) === '[1,2]', 'markersOfColorway (рецепт): прогонный не проходит', JSON.stringify(byCw));
  // Ветка «колорвей не выбран» отпускает фильтр ПРИНАДЛЕЖНОСТИ, но не ВЛАДЕЛЬЦА.
  const byCw0 = m.markersOfColorway(all, 0).map((x) => x.id);
  ck(JSON.stringify(byCw0) === '[1,2]', 'markersOfColorway(…, 0): владелец проверяется и без колорвея',
     JSON.stringify(byCw0));

  // РЕГРЕССИЯ: до появления прогонных маркеров все маркеры карточные, и списки обязаны выглядеть
  // ровно как сейчас — не «почти», а теми же строками в том же порядке.
  const legacyOnly = [
    { id: 11, name: 'a', bomLineKey: 'L1', colorwayId: 0 },
    { id: 12, name: 'b', bomLineKey: 'L1', colorwayId: 5 },
    { id: 13, name: 'c', bomLineKey: 'L2', colorwayId: 5 },
  ];
  ck(m.cardMarkers(legacyOnly).every((x, i) => x === legacyOnly[i]) &&
     m.cardMarkers(legacyOnly).length === legacyOnly.length,
     'список без поля проходит ЦЕЛИКОМ, теми же объектами и в том же порядке');
  ck(JSON.stringify(m.markersForLine(legacyOnly, 'L1').map((x) => x.id)) === '[11,12]',
     'markersForLine на сегодняшних данных отвечает прежним набором');
  ck(JSON.stringify(m.markersOfColorway(legacyOnly, 5).map((x) => x.id)) === '[11,12,13]',
     'markersOfColorway на сегодняшних данных отвечает прежним набором (свои + общие)');
}

console.log('\nH · имя файла экспорта: префикс прогона (Ф4.7 §10)');
{
  const parts = ['SS26', 'ST-100', 'M', 'основная', 'раскладка 1'];
  const cardName = m.exportFileName(parts, 'dxf');
  ck(cardName === 'SS26-ST-100-M-основная-раскладка_1.dxf', 'карточное имя — прежнее', cardName);
  ck(m.exportFileName(parts, 'dxf', 0) === cardName, 'runId = 0 не добавляет НИ ОДНОГО байта');
  const runName = m.exportFileName(parts, 'dxf', 7);
  ck(runName === `PR7_${cardName}`, 'раскройное имя = PR<runId>_ + прежнее', runName);
  ck(m.exportFileName([], 'dxf', 7) === 'PR7_marker.dxf', 'префикс переживает пустые части', m.exportFileName([], 'dxf', 7));
  ck(m.exportFileName(parts, 'dxf', 8) !== runName,
     'два прогона одного маркера дают РАЗНЫЕ имена (ради чего префикс и заводился)');
}

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
