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
  return { errs, stored, totalUnits: stored ? stored.reduce((s,c)=>s+c.quantity,0) : 0 };
}

// экземпляров детали по формуле блоба
const instances = (blob, p, totalUnits, comp) =>
  (p.sizeId > 0 ? (comp.find(c=>c.sizeId===p.sizeId)?.quantity ?? 0) : totalUnits) * p.quantity;

console.log('\nA · смешанный настил M×2 + L×1, карман без размера ×2 на изделие');
{
  const b = m.mixed();
  const legacy = { sizeId: 0, sets: 0 };            // ровно то, что шлёт модалка на mixed
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
  const legacy = { sizeId: 3, sets: 3 };            // ровно то, что шлёт модалка на однородном
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

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
