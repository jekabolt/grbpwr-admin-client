// Полевая проверка допуска Ф2.4 — мерная часть, собирается area-field-probe.mjs.
//
// ВОПРОС ОДИН, И ОН НЕ ПРО АРИФМЕТИКУ. Зонд marker:per-size уже доказал, что клиент читает те же
// формулы, что пишет сервер, — но доказал на прямоугольниках с назначенной площадью. Допуск
// AREA_ABS_TOL_CM2 = 0.5 см² / 0.5 % оттуда же, из синтетики, и вопрос к нему такой:
//
//     воспроизводит ли СВЕЖИЙ разбор файла те площади, которые путь съёмки положил в блоб?
//
// Если нет, продолжение расхода на размеры вне состава будет отказывать на НЕТРОНУТЫХ выкройках —
// то есть обвинять лекальщика в подмене, которой не было, и делать это тем чаще, чем сложнее
// геометрия. Синтетика такое поймать не может по устройству: у прямоугольника нет ни дуг, ни
// сплайнов, ни самопересечений, а тесселяция — ровно то место, где два пути могут разойтись.
//
// РАЗНИЦА МЕЖДУ ПУТЯМИ, которую и надо измерить:
//
//   • ПУТЬ СЪЁМКИ (модалка) готовит геометрию НАБОРА СОСТАВА: только детали выбранных размеров,
//     отфильтрованные по слою, развёрнутые по долевой, раздутые припуском. Их площади уходят в
//     блоб, округлённые до сотых.
//   • ПУТЬ ПРОДОЛЖЕНИЯ (size-areas-from-dxf) готовит геометрию ВСЕГО, что разобралось: он не
//     знает состава, ему нужны размеры, которых в составе не было.
//
// Обе цепочки — одни и те же три чистые функции в одном порядке, и потому ОБЯЗАНЫ совпасть
// подетально. Но «обязаны» — это рассуждение, а тут нужен замер: если orientToGrain выводит
// поворот из набора, а не из детали, или applySeamAllowance срывается в выпуклую оболочку на
// одном наборе и не срывается на другом, площади разойдутся — и разойдутся молча.
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/use-block-sizes';
import { buildAllowanceIndex } from 'components/managers/tech-card/components/nesting/contour-allowance';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import { areaToleranceCm2 } from 'components/managers/tech-card/components/nesting/per-size-consumption';

export { areaToleranceCm2 };

const DICT_TOKENS = new Set<string>([
  'xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
  '2xl', '3xl', '4xl', '5xl', 'os', 'onesize',
  ...Array.from({ length: 41 }, (_, i) => String(i + 28)),
]);

/** Сотые сантиметра — шаг, которым площадь детали кладётся в блоб (MarkerAreaScale = 2). */
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PieceArea = { key: string; areaCm2: number; hulled: boolean };

export type AreaFieldReport = {
  file: string;
  parsed: number;
  contourLayer: string;
  grainLayer: string;
  seamAllowanceCm: number;
  /** Токены размеров, найденные в файле, в порядке градации. */
  sizeTokens: string[];
  /** Деталей на выбранном слое — то, из чего берутся оба набора. */
  onLayer: number;
  /** Путь ПРОДОЛЖЕНИЯ: та же цепочка над ВСЕМ разобранным. */
  full: PieceArea[];
  /** Путь СЪЁМКИ: та же цепочка над подмножеством одного размера. */
  subsetToken: string;
  subset: PieceArea[];
  /** Максимальное расхождение по общим деталям, см² и доля. */
  maxAbsDeltaCm2: number;
  maxRelDelta: number;
  /** Деталь, на которой расхождение максимально. */
  worstKey: string;
  worstFullCm2: number;
  worstSubsetCm2: number;
  /** Сколько деталей ушло в выпуклую оболочку на каждом из путей. */
  hulledFull: number;
  hulledSubset: number;
  /** Расхождение ПОСЛЕ округления до сотых — то, что реально попадает в сверку. */
  maxAbsDeltaRoundedCm2: number;
  /** Влезает ли худшая деталь в допуск, применённый к ней самой (нижняя граница запаса). */
  worstWithinPieceTolerance: boolean;
  /** Запас: допуск для худшей детали минус её расхождение. */
  worstHeadroomCm2: number;
  /** Деталей, у которых ключ нашёлся в ОБОИХ наборах — то есть реально сравнённых. */
  compared: number;
  /** Сумма площадей сравнённых деталей на каждом пути — тот самый агрегат, который и есть a_s. */
  aggregateFullCm2: number;
  aggregateSubsetCm2: number;
  aggregateDeltaCm2: number;
  /** Самая крупная деталь подмножества — на ней допуск срабатывает легче всего. */
  biggestPieceCm2: number;
  /** Во сколько раз должна вырасти её ПЛОЩАДЬ, чтобы агрегат вышел за допуск. */
  tripAreaFactor: number;
  /** То же в ЛИНЕЙНОМ масштабе — то, что лекальщик увидел бы как «деталь стала больше на N %». */
  tripLinearScale: number;
};

function chain(pieces: readonly PieceDTO[], grainLayer: string, seamCm: number) {
  const oriented = orientToGrain([...pieces], grainLayer);
  const seam = applySeamAllowance(oriented.pieces, seamCm);
  const hulled = new Set(seam.hulled);
  const out: PieceArea[] = seam.pieces.map((p) => ({
    // Ключ — имя блока И источник: одно имя может прийти из двух листов.
    key: `${p.source ?? ''}|${(p.blockName ?? p.name ?? '').trim()}`,
    areaCm2: p.areaCm2,
    hulled: hulled.has(p.blockName ?? p.name ?? ''),
  }));
  return { out, hulledCount: seam.hulled.length };
}

export async function measureAreaField(input: {
  sheets: SheetBytes[];
  file: string;
  seamAllowanceCm?: number;
}): Promise<AreaFieldReport> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const { pieces: parsed } = await parseSheets(input.sheets, opts);
  const split = splitPiecesBySize(parsed, DICT_TOKENS);
  const index = buildAllowanceIndex(parsed);
  const opted = layerOptions(parsed, split.codeById, index);
  const contourLayer = defaultContourLayer(opted);
  const grainLayer = defaultGrainLayer(grainLayerOptions(parsed));
  const seamCm = input.seamAllowanceCm ?? 1;

  // Один контур на блок выбранного слоя — ровно так набирает детали модалка.
  const seen = new Set<string>();
  const onLayer: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== contourLayer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    onLayer.push(p);
  }

  // ПОЛНЫЙ набор — как у продолжения (оно состава не знает).
  const full = chain(onLayer, grainLayer, seamCm);

  // ПОДМНОЖЕСТВО одного размера — как у съёмки однородной раскладки. Берётся первый размер
  // градации; на неградуированном файле подмножество совпадёт с полным набором, и это законный
  // ответ «расходиться нечему», а не пропуск проверки.
  const tokens = [...split.sizeTokenSet];
  const subsetToken = tokens[0] ?? '';
  // Размер в коде блока лежит СЫРЫМ («<S>», «FP_L»), а токены градации — очищенными. Сравнение
  // без нормализации молча даёт пустое подмножество, то есть «расхождений нет» на пустоте.
  const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  const subsetPieces = subsetToken
    ? onLayer.filter((p) => bare(split.codeById.get(p.id)?.size ?? '') === subsetToken)
    : onLayer;
  const subset = chain(subsetPieces, grainLayer, seamCm);

  // Сверяются ТОЛЬКО общие детали: подмножество по устройству меньше, и отсутствие детали в нём —
  // не расхождение площадей, а другой вопрос.
  const byKey = new Map(full.out.map((p) => [p.key, p]));
  let maxAbs = 0;
  let maxRel = 0;
  let maxAbsRounded = 0;
  let worstKey = '';
  let worstFull = 0;
  let worstSubset = 0;
  // СКОЛЬКО ДЕТАЛЕЙ РЕАЛЬНО СРАВНИЛОСЬ. Без этого числа зонд не отличим от собственной пустоты:
  // при нулевом пересечении ключей «максимальное расхождение» тоже равно нулю, и зелёный ответ
  // означал бы «сравнивать было нечего», а читался бы как «всё сошлось».
  let compared = 0;
  let sumFull = 0;
  let sumSubset = 0;
  for (const s of subset.out) {
    const f = byKey.get(s.key);
    if (!f) continue;
    compared++;
    sumFull += f.areaCm2;
    sumSubset += s.areaCm2;
    const d = Math.abs(f.areaCm2 - s.areaCm2);
    const rounded = Math.abs(r2(f.areaCm2) - r2(s.areaCm2));
    if (rounded > maxAbsRounded) maxAbsRounded = rounded;
    if (d > maxAbs) {
      maxAbs = d;
      maxRel = f.areaCm2 > 0 ? d / f.areaCm2 : 0;
      worstKey = s.key;
      worstFull = f.areaCm2;
      worstSubset = s.areaCm2;
    }
  }
  const tol = areaToleranceCm2(worstFull || 1);

  // ЧУВСТВИТЕЛЬНОСТЬ. Допуск, который на нетронутых файлах имеет запас в сотни см², проверен
  // только наполовину: вторая половина — сколько должна измениться выкройка, чтобы он СРАБОТАЛ.
  // Меряется прямо: одну деталь (самую крупную — на ней сработать легче всего) растягиваем, пока
  // агрегат не выйдет за допуск, и называем найденный масштаб. Это НЕ дефект, если число велико:
  // площадь здесь — грубая сеть, а подмену контура ловит поточечная сверка в marker-rebuild.
  // Дефектом было бы НЕ ЗНАТЬ этого числа и считать площадь защитой, которой она не является.
  const aggTol = areaToleranceCm2(sumSubset || 1);
  const biggest = subset.out.reduce((m2, p) => (p.areaCm2 > m2 ? p.areaCm2 : m2), 0);
  // Δагрегата = biggest·(k²−1) при линейном масштабе k. Отсюда k, при котором Δ = допуск.
  const tripAreaFactor = biggest > 0 ? 1 + aggTol / biggest : Infinity;
  const tripLinearScale = Math.sqrt(tripAreaFactor);
  return {
    file: input.file,
    parsed: parsed.length,
    contourLayer,
    grainLayer,
    seamAllowanceCm: seamCm,
    sizeTokens: tokens,
    onLayer: onLayer.length,
    full: full.out,
    subsetToken,
    subset: subset.out,
    maxAbsDeltaCm2: maxAbs,
    maxRelDelta: maxRel,
    worstKey,
    worstFullCm2: worstFull,
    worstSubsetCm2: worstSubset,
    hulledFull: full.hulledCount,
    hulledSubset: subset.hulledCount,
    maxAbsDeltaRoundedCm2: maxAbsRounded,
    worstWithinPieceTolerance: maxAbs <= tol,
    worstHeadroomCm2: tol - maxAbs,
    compared,
    aggregateFullCm2: sumFull,
    aggregateSubsetCm2: sumSubset,
    aggregateDeltaCm2: Math.abs(sumFull - sumSubset),
    biggestPieceCm2: biggest,
    tripAreaFactor,
    tripLinearScale,
  };
}
