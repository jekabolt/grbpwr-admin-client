// ПОЛЕВАЯ ПРОВЕРКА ДОПУСКА Ф2.4 на настоящих выкройках.
//
// Допуск на сверку площадей (0.5 см² / 0.5 %) выведен на прямоугольниках. Здесь он проверяется
// там, где может не выполниться: на реальной геометрии с дугами, где два пути к площади —
// «посчитать по всему разобранному» (продолжение) и «посчитать по подмножеству состава»
// (съёмка) — могли бы разойтись тесселяцией, ориентацией по набору или срывом в выпуклую
// оболочку. Разойдутся — продолжение начнёт отказывать на НЕТРОНУТЫХ файлах.
//
//   node scripts/area-field-probe.mjs ~/Downloads/'summer men.dxf' ~/Downloads/blazer.dxf
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `area-field-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'area-field-entry.ts')], bundle: true, platform: 'node',
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

const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('нужны пути к DXF: node scripts/area-field-probe.mjs <файл> [файл…]');
  process.exit(2);
}

for (const path of files) {
  const buf = await readFile(path);
  const name = basename(path);
  const r = await m.measureAreaField({
    sheets: [{ name, open: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }],
    file: name,
    // Припуск задаётся явно, как у остальных проб: по умолчанию 0 — столько же, сколько берёт
    // диалог замера в приложении. Прибор обязан мерить ту же величину, что и измеряемое.
    seamAllowanceCm: process.env.AF_SEAM ? Number(process.env.AF_SEAM) : undefined,
  });

  console.log(`\n══ ${r.file} ══`);
  console.log(`  контуров ${r.parsed} | слой кроя «${r.contourLayer}» | долевая «${r.grainLayer}» | припуск ${r.seamAllowanceCm} см`);
  console.log(`  на слое деталей ${r.onLayer} | размеров в файле ${r.sizeTokens.length}${r.sizeTokens.length ? ` (${r.sizeTokens.join(', ')})` : ''}`);
  console.log(`  подмножество съёмки: размер «${r.subsetToken || '—'}» → ${r.subset.length} дет.; полный набор → ${r.full.length} дет.`);
  console.log(`  выпуклой оболочкой заменено: полный ${r.hulledFull}, подмножество ${r.hulledSubset}`);

  if (r.subset.length === 0 || r.full.length === 0) {
    ck(false, 'есть что сравнивать', 'один из наборов пуст — путь до геометрии сломан');
    continue;
  }

  // СНАЧАЛА — БЫЛО ЛИ ЧТО СРАВНИВАТЬ. Нулевое пересечение ключей даёт нулевое расхождение, и
  // зелёная строка про «побитово одно число» означала бы пустоту. Эта проверка идёт первой
  // именно потому, что она обесценивает все остальные, если провалится.
  ck(r.compared > 0, 'детали нашлись в ОБОИХ наборах — сравнение состоялось', `сравнено ${r.compared}`);
  ck(r.compared === r.subset.length,
    'сравнились ВСЕ детали подмножества — ни одна не потерялась по ключу',
    `${r.compared} из ${r.subset.length}`);
  console.log(`  сравнено деталей ${r.compared}; агрегат a_s: полный ${r.aggregateFullCm2.toFixed(4)} см² vs подмножество ${r.aggregateSubsetCm2.toFixed(4)} см², Δ ${r.aggregateDeltaCm2.toFixed(6)} см²`);

  // ГЛАВНОЕ ЧИСЛО. Расхождение площади одной и той же детали между двумя путями.
  console.log(`  МАКС. РАСХОЖДЕНИЕ  ${r.maxAbsDeltaCm2.toFixed(6)} см²  (${(r.maxRelDelta * 100).toFixed(6)} %)  на «${r.worstKey || '—'}»`);
  console.log(`    полный ${r.worstFullCm2.toFixed(4)} см²  vs  подмножество ${r.worstSubsetCm2.toFixed(4)} см²`);
  console.log(`    после округления до сотых: ${r.maxAbsDeltaRoundedCm2.toFixed(2)} см²`);
  console.log(`    допуск на худшую деталь ${m.areaToleranceCm2(r.worstFullCm2 || 1).toFixed(3)} см², запас ${r.worstHeadroomCm2.toFixed(3)} см²`);

  // Порог здесь СТРОЖЕ рабочего допуска, и намеренно: рабочий допуск сравнивает АГРЕГАТ a_s
  // (сумму по деталям изделия), а здесь мерится ОДНА деталь. Если каждая деталь расходится на
  // величину допуска, агрегат из девяти деталей разойдётся в девять раз сильнее — то есть
  // «влезли в допуск подетально» ещё не значит «влезем в него по изделию».
  ck(r.maxAbsDeltaCm2 === 0,
    'два пути дают ПОБИТОВО одну площадь — тесселяция и ориентация от набора не зависят',
    `${r.maxAbsDeltaCm2.toFixed(9)} см²`);
  ck(r.maxAbsDeltaRoundedCm2 === 0,
    'и после округления до сотых расхождения нет — в блоб и в сверку уедет одно число',
    `${r.maxAbsDeltaRoundedCm2.toFixed(2)} см²`);
  ck(r.hulledFull === r.hulledSubset,
    'выпуклая оболочка срабатывает одинаково на обоих наборах',
    `${r.hulledFull} vs ${r.hulledSubset}`);

  // Запас до рабочего допуска — то, ради чего задача заводилась. Считается на ХУДШЕЙ детали.
  ck(r.worstWithinPieceTolerance,
    'худшая деталь влезает в рабочий допуск даже поодиночке',
    `запас ${r.worstHeadroomCm2.toFixed(3)} см²`);
  // И то же самое на АГРЕГАТЕ — именно его сверяет per-size-consumption, и именно он копит
  // подетальные расхождения. Допуск берётся от агрегата, как в рабочем коде.
  ck(r.aggregateDeltaCm2 <= m.areaToleranceCm2(r.aggregateFullCm2),
    'агрегат a_s влезает в рабочий допуск — сверка не отвергнет нетронутый файл',
    `Δ ${r.aggregateDeltaCm2.toFixed(6)} при допуске ${m.areaToleranceCm2(r.aggregateFullCm2).toFixed(3)} см²`);

  // ВТОРАЯ ПОЛОВИНА ПРОВЕРКИ: допуск обязан не только не срабатывать зря, но и срабатывать.
  console.log(`  ЧУВСТВИТЕЛЬНОСТЬ: крупнейшая деталь ${r.biggestPieceCm2.toFixed(1)} см²; чтобы агрегат вышел за допуск,`);
  console.log(`    её площадь должна вырасти в ${r.tripAreaFactor.toFixed(4)} раза (линейно ×${r.tripLinearScale.toFixed(4)}, т.е. на ${((r.tripLinearScale - 1) * 100).toFixed(2)} %)`);
  ck(Number.isFinite(r.tripAreaFactor) && r.tripAreaFactor > 1,
    'допуск в принципе достижим — сверка не выключена бесконечным порогом');
}

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
