#!/usr/bin/env node
// Ф3 — ЗОНД УСЛОВИЙ СЪЁМКИ (B4 + B5). Постановка опыта и отчёт; мерная часть —
// scripts/nest-conditions-entry.ts.
//
// ЧТО ПРОВЕРЯЕТСЯ БЕЗ ФАЙЛОВ (всегда):
//   • порядок предзаполнения §5.5 на синтетических замерах — включая ту его половину, которую на
//     реальном файле не увидеть: «эталон карточки ПРОИГРЫВАЕТ факту, что в контуре линия кроя»;
//   • отбор выкроек под раскладку (§7.5) — по назначению и по строке BOM, и известный гэп;
//   • обратная совместимость `layerOptions` без индекса: три другие вызывающие не должны начать
//     платить за замер, который им не нужен.
//
// ЧТО ПРОВЕРЯЕТСЯ ТОЛЬКО НА РЕАЛЬНЫХ ФАЙЛАХ:
//   • подписи слоёв («линия кроя, +1.00 мм» / «линия шва») — против того, что в файле лежит;
//   • сработал бы блок двойного припуска на слое ПО УМОЛЧАНИЮ, без единого клика оператора;
//   • экспорт переоткрытого маркера: слой SEAM в файле есть и НЕ ПУСТ после пересборки, и его
//     нет вовсе до неё; подменённая выкройка экспорт ОСТАНАВЛИВАЕТ.
//
// Usage:
//   node scripts/nest-conditions-probe.mjs
//   node scripts/nest-conditions-probe.mjs ~/Downloads/'summer men.dxf' ~/Downloads/blazer.dxf
//
// Env: NC_LAYER (слой контура), NC_GRAIN (слой долевой), NC_SEAM (припуск, мм).
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `nest-conditions-${process.pid}.mjs`);
const alias = Object.fromEntries(
  ['components', 'lib', 'api', 'ui', 'utils', 'constants', 'hooks', 'types', 'context', 'styles']
    .map((k) => [k, resolve(REPO, 'src', k)])
    .concat([['@', resolve(REPO, 'src')]]),
);
await build({
  entryPoints: [resolve(HERE, 'nest-conditions-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias,
});
const mod = await import(pathToFileURL(outfile).href);

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ── A · порядок предзаполнения (§5.5), синтетика ──────────────────────────────────────────────
const measurement = (over) => ({
  layer: '14',
  verdict: 'seam',
  allowanceCm: 0,
  gapCm: 1,
  reason: null,
  samples: [],
  stats: {
    chosenPieces: 0, aloneInBlock: 0, pairsTried: 0, rejectedCrossing: 0, rejectedSpread: 0,
    rejectedTooClose: 0, rejectedNoOrigin: 0, conflicted: 0, accepted: 5,
    votesChosenOutside: 0, votesChosenInside: 5,
  },
  ...over,
});
const cut = measurement({ layer: '1', verdict: 'cut', allowanceCm: 1, gapCm: 1 });
const seam = measurement({});
const unknown = measurement({ verdict: 'unknown', allowanceCm: null, gapCm: null, reason: 'too_few_blocks' });
// NEST_DEFAULTS остаётся конфигом ДВИЖКА и живёт в сантиметрах; предзаполнение отвечает в
// МИЛЛИМЕТРАХ (0290), поэтому зонд переводит его ровно так же, как это делает экран.
const FALLBACK = mod.NEST_DEFAULTS.seamAllowanceCm * 10;
const pre = (args) => mod.seamAllowancePrefill({ fallbackMm: FALLBACK, ...args });

head('A · ПОРЯДОК ПРЕДЗАПОЛНЕНИЯ (§5.5) — синтетические замеры');
{
  const a = pre({ measured: cut, cardRequiredMm: 7, workshopDefaultMm: 3 });
  check(a.value === 0 && a.source === 'contour_is_cut',
    'линия кроя в контуре БЬЁТ и эталон карточки, и цех — офсет 0', `${a.value} · ${a.source}`);

  const b = pre({ measured: seam, cardRequiredMm: 7, workshopDefaultMm: 3 });
  check(b.value === 7 && b.source === 'card',
    'эталон карточки бьёт цех и замеренный зазор', `${b.value} · ${b.source}`);

  const c = pre({ measured: seam, workshopDefaultMm: 3 });
  check(c.value === 3 && c.source === 'workshop',
    'цех бьёт замеренный зазор', `${c.value} · ${c.source}`);

  const d = pre({ measured: seam });
  // Замер живёт в САНТИМЕТРАХ (геометрия файла), а предзаполнение отвечает в МИЛЛИМЕТРАХ: зазор
  // 1 см приходит сюда десяткой. Это и есть проверка того, что конверсия на границе состоялась.
  check(d.value === 10 && d.source === 'measured_gap',
    'замеренный зазор бьёт умолчание раскладки', `${d.value} · ${d.source}`);

  const e = pre({ measured: unknown });
  check(e.value === FALLBACK && e.source === 'fallback',
    'улик нет и эталона нет — умолчание, и оно НАЗВАНО умолчанием', `${e.value} · ${e.source}`);

  const z = pre({ measured: seam, cardRequiredMm: 0, workshopDefaultMm: 3 });
  check(z.value === 0 && z.source === 'card',
    'НОЛЬ КАРТОЧКИ — ЭТО ОТВЕТ, а не «не задано»: он бьёт цех', `${z.value} · ${z.source}`);

  const w = pre({ measured: seam, cardRequiredMm: 400 });
  check(w.value === 100, 'эталон в миллиметрах упирается в потолок, а не уезжает в раскладку', w.value);

  const n = pre({ measured: null });
  check(n.source === 'fallback', 'замер не проводился — тоже умолчание, а не ноль', n.source);

  const cz = pre({ measured: measurement({ layer: '1', verdict: 'cut', allowanceCm: 0, gapCm: 0 }), cardRequiredMm: 7 });
  check(cz.source === 'card',
    'вердикт «крой» с нулевым замером НЕ обнуляет поле — обнуляет только измеренный припуск > 0',
    cz.source);
}

// ── B · отбор выкроек (§7.5) ──────────────────────────────────────────────────────────────────
head('B · ОТБОР ВЫКРОЕК ПОД РАСКЛАДКУ (§7.5)');
{
  const cases = Object.fromEntries(mod.patternPickCases().map((c) => [c.name, c.got.map((s) => s.name)]));
  const byKey = cases['без резолвера: по ключу строки'];
  check(byKey.includes('верх') && !byKey.includes('подклад') && !byKey.includes('старый pdf'),
    'без резолвера: берутся листы своей строки; PDF и чужая строка — мимо', JSON.stringify(byKey));
  check(byKey.includes('unset'),
    '«назначение не задано» — это ОТСУТСТВИЕ ответа: такой лист резолвится ключом строки, а не теряется',
    JSON.stringify(byKey));
  check(!byKey.includes('основной по назначению'),
    'ГЭП НАЗВАН: лист «по назначению» без ключа строки без резолвера ТЕРЯЕТСЯ', JSON.stringify(byKey));

  const owned = cases['с резолвером: назначение владеет строкой'];
  check(owned.includes('основной по назначению') && owned.includes('верх'),
    'с резолвером: лист по назначению возвращается в отбор', JSON.stringify(owned));

  const notOwned = cases['с резолвером: назначение НЕ владеет строкой'];
  check(!notOwned.includes('основной по назначению'),
    'чужое назначение не подмешивает свои листы', JSON.stringify(notOwned));

  const unbound = cases['раскладка без привязки к ткани'];
  check(unbound.length === 0,
    'раскладка без bom_line_key не собирает ВСЕ листы карточки — она честно остаётся без выкроек',
    JSON.stringify(unbound));
}

// ── C · реальные файлы ────────────────────────────────────────────────────────────────────────
const paths = process.argv.slice(2);
if (paths.length === 0) {
  head('C · реальные файлы не переданы — подписи слоёв и экспорт НЕ ПРОВЕРЕНЫ');
  console.log("    node scripts/nest-conditions-probe.mjs ~/Downloads/'summer men.dxf' ~/Downloads/blazer.dxf");
} else {
  for (const p of paths) {
    const path = resolve(p.replace(/^~/, process.env.HOME ?? '~'));
    const bytes = await readFile(path);
    const sheets = [{ name: basename(path), open: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
    const r = await mod.analyzeConditions({
      sheets,
      contourLayer: process.env.NC_LAYER || undefined,
      grainLayer: process.env.NC_GRAIN || undefined,
      seamAllowanceCm: process.env.NC_SEAM ? Number(process.env.NC_SEAM) : undefined,
    });

    head(`C · ${basename(path)} — ${r.parsed} контуров`);
    for (const l of r.layers) {
      console.log(
        `     слой ${l.layer || '—'}: ${l.pieces} контуров, градуируется ${l.graded}/${l.checked} · ` +
          `${l.label}${l.acceptedBlocks ? ` (блоков ${l.acceptedBlocks})` : ''}` +
          `${l.unknownReason ? ` [${l.unknownReason}]` : ''}`,
      );
    }
    check(r.layers.every((l) => l.sampled === (l.verdict === 'cut' || l.verdict === 'seam')),
      'плоский `sampled` не расходится с вердиктом — «не измерено» не выдаёт себя за замер',
      r.layers.map((l) => `${l.layer}:${l.sampled ? 1 : 0}`).join(' '));
    check(r.layers.every((l) => l.verdict !== 'not_measured'),
      'с индексом замер получил КАЖДЫЙ слой (в том числе «не измерено» как вердикт)',
      r.layers.map((l) => l.verdict).join(','));
    check(r.layersWithoutIndex.every((l) => !l.measured && l.label === ''),
      'БЕЗ индекса не мерится ни один слой — просмотрщик и диалог сопоставления не платят за Ф3.3',
      r.layersWithoutIndex.length);
    check(r.cutLayers.length + r.seamLayers.length > 0,
      'на реальном файле замер вообще состоялся',
      `крой: [${r.cutLayers.join(',')}] · шов: [${r.seamLayers.join(',')}]`);
    check(r.layers.filter((l) => l.verdict === 'cut').every((l) => (l.allowanceCm ?? 0) > 0),
      'вердикт «линия кроя» всегда несёт ЧИСЛО, а не ноль',
      r.layers.filter((l) => l.verdict === 'cut').map((l) => l.allowanceCm).join(','));
    check(r.layers.filter((l) => l.verdict === 'seam').every((l) => l.allowanceCm === 0),
      'вердикт «линия шва» всегда несёт ИЗМЕРЕННЫЙ ноль',
      r.layers.filter((l) => l.verdict === 'seam').map((l) => l.allowanceCm).join(','));
    check(r.layers.filter((l) => l.verdict === 'unknown').every((l) => l.allowanceCm === null),
      '«не измерено» НИКОГДА не выдаёт ноль за ответ');
    check(r.seamLayers.length === 0 || r.seamLayerPick !== null,
      'если линия шва где-то замерена — отказ знает, какой слой предложить', r.seamLayerPick);

    console.log(
      `     слой по умолчанию ${r.defaultLayer || '—'} → ${r.defaultVerdict}` +
        ` · долевая ${r.markerGrainLayer || '(не разворачивать)'}` +
        ` · двойной припуск на умолчании: ${r.doubleAllowanceOnDefaultLayer ? 'ДА' : 'нет'}`,
    );
    console.log(
      `     предзаполнение: ${r.prefill.bare.value} мм (${r.prefill.bare.source})` +
        (r.prefill.onCutLayer
          ? ` · на слое кроя: ${r.prefill.onCutLayer.value} мм (${r.prefill.onCutLayer.source})`
          : ''),
    );
    if (r.prefill.onCutLayerWithCard) {
      check(r.prefill.onCutLayerWithCard.value === 0,
        'на слое с линией кроя эталон карточки НЕ побеждает факт (реальный файл)',
        `${r.prefill.onCutLayerWithCard.value} · ${r.prefill.onCutLayerWithCard.source}`);
    }

    head(`D · экспорт переоткрытого маркера — ${basename(path)}`);
    console.log(
      `     блоб: ${r.storedPieces} деталей · припуск ${r.markerSeamAllowanceCm} мм · слой ${r.markerContourLayer}`,
    );
    check(!r.exportStored.declaresSeam && r.exportStored.seamEntities === 0,
      'БЕЗ пересборки в файле нет слоя SEAM ВООБЩЕ — объявленный пустой слой был бы ложью',
      `объявлен ${r.exportStored.declaresSeam} · сущностей ${r.exportStored.seamEntities}`);
    check(r.rebuild.ok, 'пересборка чертежа по тем же выкройкам удалась', r.rebuild.error || 'ok');
    check(r.rebuild.ok && r.rebuild.pieces === r.storedPieces,
      'пересобраны ВСЕ детали блоба, а не часть', `${r.rebuild.pieces}/${r.storedPieces}`);
    check(r.rebuild.withDrawing > 0,
      'у пересобранных деталей появился чертёж (inner)', `${r.rebuild.withDrawing} деталей`);
    check(r.exportRebuilt.declaresSeam && r.exportRebuilt.seamEntities > 0,
      'ПОСЛЕ пересборки слой SEAM в файле есть И НЕ ПУСТ',
      `сущностей ${r.exportRebuilt.seamEntities}`);
    check(r.exportRebuilt.bytes > r.exportStored.bytes,
      'файл с чертежом тяжелее файла без него — линии реально дописаны',
      `${r.exportStored.bytes} → ${r.exportRebuilt.bytes} байт`);

    check(!r.rebuildDrift.ok && r.rebuildDrift.errorKind === 'geometry-drift',
      'ПОДМЕНЁННАЯ выкройка останавливает экспорт с чертежом', r.rebuildDrift.errorKind);
    console.log(`     → ${r.rebuildDrift.error}`);
    check(!r.rebuildMissingBlock.ok && r.rebuildMissingBlock.errorKind === 'block-missing',
      'пропавший блок останавливает экспорт и НАЗЫВАЕТ блок', r.rebuildMissingBlock.errorKind);
    check(!r.rebuildNoPatterns.ok && r.rebuildNoPatterns.errorKind === 'no-patterns',
      'выкроек нет — это отдельный диагноз, а не «файл заменён»', r.rebuildNoPatterns.errorKind);
    check(!r.rebuildLegacy.ok && r.rebuildLegacy.errorKind === 'conditions-missing',
      'маркер БЕЗ условий съёмки отказывается пересобираться ДО сети', r.rebuildLegacy.errorKind);
  }
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
