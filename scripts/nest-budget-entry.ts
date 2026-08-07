// Ф2.3 — ПРОГНОЗ ПРОТИВ ФАКТА. Bundled by scripts/nest-budget-probe.mjs, run in node.
//
// Проверяются ровно две вещи, и обе про одно: экран не должен обещать того, чего движок не
// делает.
//
//   1. ОДНА МОДЕЛЬ. Модалка считает прогноз своим путём (estimateJob по PieceDTO + estimateRun),
//      движок — своим (гены, подготовленные варианты контуров, тот же estimateRun). Совпасть
//      обязаны все числа до единицы: оболочки, миллисекунды, выбранная ступень упрощения и
//      число записей NFP. Две копии модели разъезжаются молча, и разъезжаются в ту сторону, где
//      экран обещает поиск, которого не будет.
//   2. ×2 НА РЕАЛЬНОМ ФАЙЛЕ. Предсказанное время предпросчёта против ЗАМЕРЕННОГО (telemetry
//      .prepassMs) на «summer men.dxf» и «blazer.dxf» — критерий приёмки 03-composition.md.
//
// Путь до геометрии здесь ТОТ ЖЕ, что у оператора: разбор → слой контура → разворот по долевой →
// припуск на шов. Прогноз, снятый с сырых контуров файла, описывал бы другую задачу.
import type { NestConfig, NestTelemetry, PieceDTO, Pt } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { nest } from '../src/lib/nesting/nest';
import { estimateJob, estimateRun, type RunEstimate } from '../src/lib/nesting/nest/estimate';

export type Forecast = Omit<RunEstimate, 'decompositions'>;

export type BudgetInput = {
  sheets: SheetBytes[];
  contourLayer?: string;
  grainLayer?: string;
  maxPieces?: number;
  perPiece?: number;
  flippedPerPiece?: number;
  // Доля деталей, которые остаются в задании: так меряется СОСТАВ — размер с количеством 0
  // выпадает из config.pieces, и прогноз обязан подешеветь вместе с ним.
  keepFraction?: number;
  config?: Partial<NestConfig>;
  // Не запускать раскладку — только прогноз (для замера цены самого прогноза).
  forecastOnly?: boolean;
};

export type BudgetOutput = {
  parsed: number;
  pieces: number;
  instances: number;
  layers: { layer: string; blocks: number }[];
  forecast: Forecast;
  // Сколько сам прогноз считался по часам. Он идёт на ГЛАВНОМ ПОТОКЕ модалки (в воркер его не
  // отправить: через ту границу ходят только id и числа), и цена его — это подвисание интерфейса.
  forecastMs: number;
  telemetry: NestTelemetry | null;
  runMs: number;
  generation: number;
  placed: number;
  total: number;
};

function stripDecomps(e: RunEstimate): Forecast {
  const { decompositions: _drop, ...rest } = e;
  return rest;
}

export async function budgetProbe(input: BudgetInput): Promise<BudgetOutput> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const { pieces: parsed } = await parseSheets(input.sheets, opts);

  const byLayer = new Map<string, number>();
  for (const p of parsed) byLayer.set(p.layer ?? '', (byLayer.get(p.layer ?? '') ?? 0) + 1);
  const layers = [...byLayer.entries()]
    .map(([layer, blocks]) => ({ layer, blocks }))
    .sort((a, b) => b.blocks - a.blocks);

  // One contour per block — a block routinely carries the piece twice (sewing line and cut
  // line on different layers), and nesting both would measure a job nobody would run.
  const wantLayer = input.contourLayer ?? layers[0]?.layer ?? '';
  const seen = new Set<string>();
  const picked: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== wantLayer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (input.maxPieces && picked.length >= input.maxPieces) break;
  }

  const grainLayer = input.grainLayer ?? '';
  const oriented = orientToGrain(picked, grainLayer).pieces;
  const seamCm = input.config?.seamAllowanceCm ?? NEST_DEFAULTS.seamAllowanceCm;
  // Ровно та геометрия, которую модалка держит в `pieces` и которую воркер отдаёт в nest().
  const pieces = applySeamAllowance(oriented, seamCm).pieces;

  const perPiece = input.perPiece ?? 1;
  const flippedPerPiece = Math.min(input.flippedPerPiece ?? 0, perPiece);
  const keep = input.keepFraction ?? 1;
  const inJob = pieces.filter((_, i) => i < Math.max(1, Math.round(pieces.length * keep)));
  const config: NestConfig = {
    pieces: inJob.map((p) => ({
      pieceId: p.id,
      quantity: perPiece,
      flippedQuantity: flippedPerPiece,
    })),
    fabricWidthCm: NEST_DEFAULTS.fabricWidthCm,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: NEST_DEFAULTS.edgeMarginCm,
    allowCrossGrain: NEST_DEFAULTS.allowCrossGrain,
    fabricDirection: 'any',
    grainLayer,
    seamAllowanceCm: seamCm,
    timeBudgetMs: NEST_DEFAULTS.timeBudgetMs,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    ...input.config,
  };

  // ПУТЬ МОДАЛКИ: детали + конфиг → задание → прогноз. Никакого доступа к внутренностям движка.
  const t0 = Date.now();
  const forecast = estimateRun(estimateJob(pieces, config), config);
  const forecastMs = Date.now() - t0;

  if (input.forecastOnly) {
    return {
      parsed: parsed.length,
      pieces: inJob.length,
      instances: inJob.length * perPiece,
      layers,
      forecast: stripDecomps(forecast),
      forecastMs,
      telemetry: null,
      runMs: 0,
      generation: 0,
      placed: 0,
      total: 0,
    };
  }

  const t1 = Date.now();
  const result = await nest(
    pieces,
    config,
    () => false,
    () => {},
  );
  return {
    parsed: parsed.length,
    pieces: inJob.length,
    instances: inJob.length * perPiece,
    layers,
    forecast: stripDecomps(forecast),
    forecastMs,
    telemetry: result.telemetry ?? null,
    runMs: Date.now() - t1,
    generation: result.generation,
    placed: result.placedCount,
    total: result.totalCount,
  };
}

// ── синтетика: та же сверка без единого файла ──────────────────────────────────────────
//
// Реальные файлы лежат у человека в ~/Downloads, а проба обязана что-то проверять и без них.
// Контур — звезда: у неё много выпуклых частей, то есть она попадает в тот же режим стоимости,
// что настоящая деталь, а не в «два треугольника».
function star(cx: number, cy: number, r: number, spikes: number, depth: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r : r * depth;
    const a = (Math.PI * i) / spikes;
    out.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
  }
  return out;
}

export function syntheticPieces(count: number): PieceDTO[] {
  const out: PieceDTO[] = [];
  for (let i = 0; i < count; i++) {
    const r = 10 + (i % 5) * 3;
    const poly = star(r, r, r, 7 + (i % 4), 0.55);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const norm = poly.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    out.push({
      id: i + 1,
      name: `звезда ${i + 1}`,
      source: 'synthetic',
      poly: norm,
      bboxW: maxX - minX,
      bboxH: maxY - minY,
      areaCm2: (maxX - minX) * (maxY - minY) * 0.5,
    });
  }
  return out;
}

export async function syntheticCase(
  pieces: PieceDTO[],
  cfg: Partial<NestConfig>,
): Promise<{ forecast: Forecast; telemetry: NestTelemetry | null; generation: number }> {
  const config: NestConfig = {
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })),
    fabricWidthCm: NEST_DEFAULTS.fabricWidthCm,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: NEST_DEFAULTS.edgeMarginCm,
    allowCrossGrain: NEST_DEFAULTS.allowCrossGrain,
    fabricDirection: 'any',
    grainLayer: '',
    seamAllowanceCm: 0,
    timeBudgetMs: 4_000,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    ...cfg,
  };
  const forecast = stripDecomps(estimateRun(estimateJob(pieces, config), config));
  const result = await nest(
    pieces,
    config,
    () => false,
    () => {},
  );
  return { forecast, telemetry: result.telemetry ?? null, generation: result.generation };
}

export { estimateJob, estimateRun };
