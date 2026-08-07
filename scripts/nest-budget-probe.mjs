#!/usr/bin/env node
// Ф2.3 — БЮДЖЕТ ДО ЗАПУСКА: сверка прогноза с фактом.
//
// Экран обещает оператору цену прогона ДО того, как прогон оплачен. Обещание проверяемо ровно
// двумя способами, и проба делает оба:
//
//   A. ОДНА МОДЕЛЬ. Прогноз модалки (estimateJob + estimateRun по PieceDTO) обязан совпасть с
//      тем, что движок посчитал внутри себя (telemetry) — до единицы, включая выбранную ступень
//      упрощения и число записей NFP. Это и есть проверка «копия модели не завелась вторая».
//   B. ×2 НА КОНТРОЛЬНОМ ФАЙЛЕ. predictedPrepassMs против замеренного prepassMs — критерий
//      приёмки 03-composition.md. Сравнивается ТОЛЬКО когда предпросчёт дошёл до конца: у
//      оборванного по дедлайну факт упирается в бюджет и меряет часы, а не модель.
//
// Usage:
//   node scripts/nest-budget-probe.mjs                        # синтетика (файлы не нужны)
//   node scripts/nest-budget-probe.mjs ~/Downloads/'summer men.dxf' ~/Downloads/blazer.dxf
//
// Env: NEST_BUDGET_MS (бюджет прогона, по умолчанию 20000 — то же, что видит оператор).
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `nest-budget-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'nest-budget-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const mod = await import(pathToFileURL(outfile).href);

const budgetMs = Number(process.env.NEST_BUDGET_MS ?? 20_000);
let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const s = (ms) => `${(ms / 1000).toFixed(1)} с`;

// Прогноз против телеметрии — та самая проверка «модель одна». Числа сравниваются ТОЧНО:
// оба пути зовут одну функцию, и любое расхождение означает, что вход у них разный, то есть
// прогноз описывает не то задание, которое побежало.
function sameModel(label, f, t) {
  check(f.effectiveEps === t.rdpEpsCm, `${label}: ступень упрощения та же`, `${f.effectiveEps} / ${t.rdpEpsCm}`);
  check(f.predictedHulls === t.predictedHulls, `${label}: оболочек предсказано столько же`, `${f.predictedHulls} / ${t.predictedHulls}`);
  check(
    f.predictedPrepassMs === t.predictedPrepassMs,
    `${label}: миллисекунд предсказано столько же`,
    `${f.predictedPrepassMs} / ${t.predictedPrepassMs}`,
  );
  check(f.nfpRecords === t.nfpTotal, `${label}: записей NFP столько же`, `${f.nfpRecords} / ${t.nfpTotal}`);
}

// Критерий ×2. Осмыслен только на ЗАКОНЧЕННОМ предпросчёте.
//
// ДВЕ СТОРОНЫ ОШИБКИ СТОЯТ РАЗНОГО, и порог поэтому несимметричный по смыслу, хоть и совпадает
// по числу на бюджете оператора.
//
//   • ЗАНИЗИТЬ (ratio < 1) — это ровно та ложь, ради устранения которой Ф2.3 и заводилась: экран
//     говорит «предрасчёт успеет, поиску останется 12 с», оператор платит весь бюджет и получает
//     ноль поколений. Порог 0.5 держится ВЕЗДЕ, на любом бюджете.
//   • ЗАВЫСИТЬ (ratio > 1) — лестница ступеней грубеет раньше, чем нужно: маркер чуть свободнее,
//     но никого не обманули. Модель здесь заведомо запаслива на САМЫХ ГРУБЫХ ступенях: у таблицы
//     HULL_RATE нет узла ниже 200 оболочек на объединение, и при eps 0.9 (perUnion ~10) она
//     считает 8 обол/мс там, где замер даёт ~19. Замерено на ступени 0.9: summer men @5 с — 1.79
//     и 2.09, blazer @5 с — 1.69. Потолок для коротких бюджетов поэтому 3, и это не послабление
//     критерия: критерий приёмки снимается на БЮДЖЕТЕ ПО УМОЛЧАНИЮ (20 с), где обе контрольные
//     раскладки уложились в ×2 в каждом из четырёх прогонов — 0.93, 1.19, 1.38, 1.68 (разброс
//     тут машинный: чем сильнее занята машина, тем медленнее ФАКТ и тем меньше отношение).
function withinTwo(label, f, t, ceiling = 2) {
  const done = t.nfpDone === t.nfpTotal;
  const ratio = t.prepassMs > 0 ? f.predictedPrepassMs / t.prepassMs : Infinity;
  if (!done) {
    // Оборвали по дедлайну — значит модель обязана была это ПРЕДСКАЗАТЬ, иначе она соврала в
    // самую дорогую сторону: экран сказал «успеем», оператор заплатил весь бюджет за ноль поиска.
    check(
      f.outlook === 'starved',
      `${label}: предпросчёт оборвался (${t.nfpDone}/${t.nfpTotal}) — прогноз обязан был сказать «не успеет»`,
      `прогноз: ${f.outlook}, ~${s(f.predictedPrepassMs)} при бюджете ${s(f.timeBudgetMs)}`,
    );
    return null;
  }
  const detail = `прогноз ${s(f.predictedPrepassMs)}, факт ${s(t.prepassMs)}, отношение ${ratio.toFixed(2)}`;
  check(ratio >= 0.5, `${label}: модель НЕ ЗАНИЖАЕТ предрасчёт`, detail);
  check(ratio <= ceiling, `${label}: прогноз в пределах ×${ceiling} от факта`, detail);
  return ratio;
}

const ratios = [];

// ── A · СИНТЕТИКА: одна модель, файлы не нужны ────────────────────────────────────────
console.log('\nA · синтетика — прогноз модалки против того, что посчитал движок');
{
  for (const [n, cfg] of [
    [8, {}],
    [24, {}],
    // Узкая полоса + разрешённый поперечный крой: часть деталей теряет 90°/270°, часть выпадает
    // целиком. Ровно здесь модалка и движок меряют поперечный габарит РАЗНЫМ инструментом (bbox
    // против границ построенного варианта), и если они разойдутся — разойдётся вся оценка.
    [24, { allowCrossGrain: true, fabricWidthCm: 34 }],
  ]) {
    const pieces = mod.syntheticPieces(n);
    const { forecast, telemetry, generation } = await mod.syntheticCase(pieces, {
      ...cfg,
      timeBudgetMs: 3_000,
    });
    const label = `${n} звёзд${cfg.fabricWidthCm ? ` @ полоса ${cfg.fabricWidthCm} см, поперёк` : ''}`;
    if (!telemetry) {
      check(false, `${label}: телеметрия есть`);
      continue;
    }
    sameModel(label, forecast, telemetry);
    console.log(
      `       уникальных ${forecast.uniquePieces} · пар ${forecast.nfpRecords} · прогноз ${s(forecast.predictedPrepassMs)}` +
        ` · факт ${s(telemetry.prepassMs)} · поколений ${generation} · исход «${forecast.outlook}»`,
    );
  }
}

// ── B · СОСТАВ: задание решает цену, а не файл ────────────────────────────────────────
console.log('\nB · состав — половина деталей выпала из задания, прогноз обязан подешеветь');
{
  const pieces = mod.syntheticPieces(24);
  const all = mod.estimateRun(
    mod.estimateJob(pieces, {
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })),
      fabricWidthCm: 140,
      edgeMarginCm: 0,
      allowCrossGrain: false,
      fabricDirection: 'any',
    }),
    { timeBudgetMs: 20_000, rdpEpsCm: 0.05 },
  );
  const half = mod.estimateRun(
    mod.estimateJob(pieces, {
      pieces: pieces.slice(0, 12).map((p) => ({ pieceId: p.id, quantity: 1 })),
      fabricWidthCm: 140,
      edgeMarginCm: 0,
      allowCrossGrain: false,
      fabricDirection: 'any',
    }),
    { timeBudgetMs: 20_000, rdpEpsCm: 0.05 },
  );
  check(half.uniquePieces === 12 && all.uniquePieces === 24, 'уникальных деталей ровно столько, сколько в ЗАДАНИИ', `${all.uniquePieces} → ${half.uniquePieces}`);
  check(half.predictedPrepassMs * 3 < all.predictedPrepassMs, 'вдвое меньше деталей — вчетверо дешевле предпросчёт (пар ~n²)', `${s(all.predictedPrepassMs)} → ${s(half.predictedPrepassMs)}`);
  // Тираж НЕ меняет цену предпросчёта: NFP считается на ПАРУ ДЕТАЛЕЙ, а не на пару экземпляров.
  const tenfold = mod.estimateRun(
    mod.estimateJob(pieces, {
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 10 })),
      fabricWidthCm: 140,
      edgeMarginCm: 0,
      allowCrossGrain: false,
      fabricDirection: 'any',
    }),
    { timeBudgetMs: 20_000, rdpEpsCm: 0.05 },
  );
  check(tenfold.predictedPrepassMs === all.predictedPrepassMs, 'тираж ×10 не удорожает ПОДГОТОВКУ (она платится за пару деталей)', `${s(tenfold.predictedPrepassMs)}`);

  // СОВЕТ, КОТОРЫЙ ПЕЧАТАЕТ ЭКРАН, обязан работать. «Дайте бюджет от X с» — единственное точное
  // указание в блоке бюджета; если после него предпросчёт всё ещё не укладывается, оператор
  // потратит второй прогон на тот же отказ. Проверяется на самом невыгодном входе: бюджет, в
  // который не лезет даже самая грубая ступень.
  const job = mod.estimateJob(pieces, {
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })),
    fabricWidthCm: 140,
    edgeMarginCm: 0,
    allowCrossGrain: false,
    fabricDirection: 'any',
  });
  const starved = mod.estimateRun(job, { timeBudgetMs: 800, rdpEpsCm: 0.05 });
  check(starved.outlook === 'starved', 'бюджет 0.8 с на 24 детали — исход «starved»', starved.outlook);
  const advised = mod.estimateRun(job, { timeBudgetMs: starved.budgetToFitMs, rdpEpsCm: 0.05 });
  check(
    advised.fitsBudget && advised.outlook === 'search',
    'совет «дайте бюджет от X с» действительно приводит к укладывающемуся предрасчёту',
    `совет ${s(starved.budgetToFitMs)} → ${advised.outlook}, ~${s(advised.predictedPrepassMs)} из потолка ${s(advised.prepassCapMs)}`,
  );
}

// ── C · РЕАЛЬНЫЕ ФАЙЛЫ ────────────────────────────────────────────────────────────────
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('\nC · реальные файлы не переданы — критерий ×2 НЕ ПРОВЕРЕН');
  console.log("    node scripts/nest-budget-probe.mjs ~/Downloads/'summer men.dxf' ~/Downloads/blazer.dxf");
} else {
  for (const path of files) {
    const bytes = await readFile(path);
    const name = path.split('/').pop();
    const sheets = [{ name, open: async () => bytes }];
    console.log(`\nC · ${name} — бюджет ${s(budgetMs)}`);

    // Как у оператора: весь файл, умолчания модалки.
    const out = await mod.budgetProbe({ sheets, config: { timeBudgetMs: budgetMs } });
    const f = out.forecast;
    console.log(
      `       деталей ${out.pieces} (разобрано ${out.parsed}) · уникальных ${f.uniquePieces} · записей NFP ${f.nfpRecords}` +
        `\n       прогноз: ступень ${f.effectiveEps} см${f.coarsened ? ` (просили ${f.requestedEps})` : ''}` +
        ` · предрасчёт ~${s(f.predictedPrepassMs)} из потолка ${s(f.prepassCapMs)}` +
        ` · исход «${f.outlook}» · поиску ${s(f.searchMsLeft)}` +
        `\n       факт:    предрасчёт ${s(out.telemetry.prepassMs)} · пар ${out.telemetry.nfpDone}/${out.telemetry.nfpTotal}` +
        ` · поколений ${out.generation} · всего ${s(out.runMs)} · размещено ${out.placed}/${out.total}` +
        `\n       сам прогноз считался ${out.forecastMs} мс (главный поток модалки)`,
    );
    sameModel(name, f, out.telemetry);
    const r = withinTwo(name, f, out.telemetry);
    if (r != null) ratios.push([name, r]);
    // Цена поколения — ЗАМЕР, а не модель: печатается как данные, в прогноз не входит (см.
    // expectedGenerations в estimate.ts).
    if (out.generation > 0) {
      const gaMs = out.runMs - out.telemetry.prepassMs;
      console.log(`       (справочно: ${(gaMs / out.generation).toFixed(0)} мс на поколение — в прогноз НЕ входит)`);
    }

    // Тот же файл на САМОМ КОРОТКОМ бюджете, который модалка вообще предлагает (селектор
    // 5 / 20 / 60 с). Мерить 2.5 с было бы мерить кнопку, которой нет: там модель уходит в
    // «starved» и кричит на прогон, который на деле успевает, — а с пяти секунд этот ложный крик
    // недостижим. Проба обязана меряться о ту поверхность, что есть у оператора.
    const tight = await mod.budgetProbe({
      sheets,
      config: { timeBudgetMs: 5_000, rdpEpsCm: 0.05 },
    });
    const tf = tight.forecast;
    console.log(
      `       при бюджете 5 с: прогноз ступень ${tf.effectiveEps} · ~${s(tf.predictedPrepassMs)} · исход «${tf.outlook}»` +
        ` → факт: пар ${tight.telemetry.nfpDone}/${tight.telemetry.nfpTotal}, поколений ${tight.generation}, ${s(tight.runMs)}`,
    );
    sameModel(`${name} @5с`, tf, tight.telemetry);
    const r2 = withinTwo(`${name} @5с`, tf, tight.telemetry, 3);
    // ЛОЖНАЯ ТРЕВОГА — если прогноз сказал «не успеет», а предпросчёт успел. Не провал (модель
    // ошиблась в безопасную сторону), но и не пустяк: экран кричит красным на прогон, который
    // прошёл бы. Печатается всегда, чтобы это нельзя было не заметить.
    if (tf.outlook === 'starved' && tight.telemetry.nfpDone === tight.telemetry.nfpTotal) {
      console.log(
        `       ВНИМАНИЕ: прогноз кричал «не успеет», а предпросчёт успел за ${s(tight.telemetry.prepassMs)} — ложная тревога`,
      );
    }
    if (r2 != null) ratios.push([`${name} @5с`, r2]);
  }
}

if (ratios.length > 0) {
  console.log(
    `\nотношение прогноз/факт: ${ratios.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(' · ')}`,
  );
}
console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures ? 1 : 0);
