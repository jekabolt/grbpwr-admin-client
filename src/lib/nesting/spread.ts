// НАСТИЛ ПОД РАСКРОЕЧНЫЙ СТОЛ: чистая арифметика слоёв (см. tmp/plans/patterns-lite/05-SPREAD-SPEC.md).
//
// Маркер — один слой. Настил — N слоёв этого маркера, уложенных стопкой и разрезанных разом, и всё,
// что из этого следует (высота стопки, сколько изделий, сколько ткани), считается здесь — одной
// функцией для модалки и для любых будущих экранов, чтобы цифры не расходились.
//
// НЕ ЗАДАНО ≠ НОЛЬ. Каждое производное число — null, если для него не хватает входа: толщина ткани
// 0 значила бы «стопка любой высоты», а пустая длина стола — «стол длиной ноль». Ни то, ни другое
// не правда, и экран обязан показать прочерк, а не уверенную цифру.

export type SpreadMode = 'face_up' | 'face_to_face';

export type SpreadInput = {
  // Число слоёв. Не целое или < 1 → считается как не заданное (все производные null).
  plies: number;
  // Толщина ткани одного слоя, мм (Material.fabricThicknessMm).
  thicknessMm?: number | null;
  // Предел высоты стопки, см (WorkshopSettings.maxStackHeightCm).
  stackLimitCm?: number | null;
  // Изделий в ОДНОМ слое маркера (Σ количеств состава).
  compositionTotal?: number | null;
  // Длина маркера (один слой), см.
  markerLengthCm?: number | null;
  // Запас на конец настила С КАЖДОЙ стороны, см.
  endLossCm?: number | null;
  mode: SpreadMode;
};

export type SpreadFigures = {
  // Высота стопки N·t/10, см.
  stackCm: number | null;
  // ⌊10H/t⌋; при face_to_face округляется вниз до чётного.
  maxPlies: number | null;
  // N × Σq.
  garments: number | null;
  // N × (маркер + 2·endLoss), см.
  fabricCm: number | null;
  overStack: boolean;
  oddFaceToFace: boolean;
};

const known = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const positive = (v: number | null | undefined): v is number => known(v) && v > 0;

export function spreadFigures(input: SpreadInput): SpreadFigures {
  const { thicknessMm, stackLimitCm, compositionTotal, markerLengthCm, endLossCm, mode } = input;
  const plies = Number.isInteger(input.plies) && input.plies >= 1 ? input.plies : null;
  const faceToFace = mode === 'face_to_face';

  let maxPlies: number | null = null;
  if (positive(thicknessMm) && positive(stackLimitCm)) {
    // Эпсилон гасит ошибку плавающей точки (10·12/0.3 = 399.99999…), иначе ровно-предел терял слой.
    let n = Math.floor((10 * stackLimitCm) / thicknessMm + 1e-9);
    if (faceToFace && n % 2 === 1) n -= 1;
    maxPlies = Math.max(0, n);
  }

  const stackCm = plies !== null && positive(thicknessMm) ? (plies * thicknessMm) / 10 : null;
  const garments =
    plies !== null && known(compositionTotal) && compositionTotal >= 0
      ? plies * compositionTotal
      : null;
  const fabricCm =
    plies !== null && positive(markerLengthCm) && known(endLossCm) && endLossCm >= 0
      ? plies * (markerLengthCm + 2 * endLossCm)
      : null;

  return {
    stackCm,
    maxPlies,
    garments,
    fabricCm,
    overStack: plies !== null && maxPlies !== null && plies > maxPlies,
    oddFaceToFace: faceToFace && plies !== null && plies % 2 === 1,
  };
}

// Допущение плотности раскладки для ОЦЕНКИ (не для вердикта): типичная эффективность маркера
// одежды 75–85 %. Оценка только задаёт стартовое k для поиска «fit to the table», который затем
// проверяет его настоящим прогоном с капом длины и спускается k−1, если не влезло.
export const ASSUMED_MARKER_EFFICIENCY = 0.8;

export type GarmentsPerPlyInput = {
  // Σ площадей всех деталей ОДНОГО изделия (с учётом количеств деталей в изделии), см².
  garmentAreaCm2: number;
  fabricWidthCm: number;
  // Полезная длина стола U = table − 2·endLoss, см.
  usableLengthCm: number;
  efficiency?: number;
};

// Сколько изделий влезет в один слой на столе — по площади. Целое k ≥ 1: даже если по площади не
// влезает ни одно, поиск начинает с одного изделия, и ответ «не влезло» даёт уже настоящий прогон.
export function estimateGarmentsPerPly(input: GarmentsPerPlyInput): number {
  const { garmentAreaCm2, fabricWidthCm, usableLengthCm } = input;
  const eff = positive(input.efficiency)
    ? Math.min(1, input.efficiency)
    : ASSUMED_MARKER_EFFICIENCY;
  if (!positive(garmentAreaCm2) || !positive(fabricWidthCm) || !positive(usableLengthCm)) return 1;
  const k = Math.floor((fabricWidthCm * usableLengthCm * eff) / garmentAreaCm2 + 1e-9);
  return Math.max(1, k);
}

// ── НАСТИЛ ПО ИТОГАМ (режим стола) ─────────────────────────────────────────────────────────
// В режиме стола оператор задаёт, сколько изделий КРОИТЬ всего (по размерам), а маркер — один
// слой: его состав q_s = ⌈total_s / plies⌉, и всё, что лишнее (plies·q_s − total_s), — перекрой.
// Та же идея, что у планировщика партии (batch-marker-plan): пропорция, сокращённая на НОД.

const gcd2 = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

// НОД ненулевых итогов; 0 — если кроить нечего.
export function gcdOfTotals(totals: readonly number[]): number {
  return totals.filter((t) => t > 0).reduce((g, t) => gcd2(g, Math.round(t)), 0);
}

// Состав одного слоя при N слоях: ⌈total/N⌉, ноль остаётся нулём.
export function perPlyQuantities(totals: readonly number[], plies: number): number[] {
  const n = Math.max(1, Math.round(plies));
  return totals.map((t) => (t > 0 ? Math.ceil(t / n) : 0));
}

// Перекрой по размерам: N·q − total.
export function overCutOf(totals: readonly number[], plies: number): number[] {
  const n = Math.max(1, Math.round(plies));
  return perPlyQuantities(totals, n).map((q, i) => n * q - Math.max(0, totals[i]));
}

// Сколько слоёв нужно, чтобы слоем состава perPly покрыть итоги: max ⌈total/q⌉. Infinity — если
// у размера с итогом нет места в слое.
export function pliesToCover(totals: readonly number[], perPly: readonly number[]): number {
  let p = 1;
  totals.forEach((t, i) => {
    if (t <= 0) return;
    const q = perPly[i] ?? 0;
    p = q > 0 ? Math.max(p, Math.ceil(t / q)) : Infinity;
  });
  return p;
}

// Слои по умолчанию (а не своё число оператора):
//   1. НОД итогов — ноль перекроя;
//   2. НОД выше предела стопки → наибольший его делитель под пределом (итоги всё ещё ровные);
//      лицом к лицу — наибольший ЧЁТНЫЙ делитель под пределом;
//   3. ни один делитель > 1 не влезает → сам предел (перекрой ⌈total/N⌉·N − total);
//   4. лицом к лицу и всё ещё нечётно → +1 слой (предел лицом к лицу уже чётный, так что влезает).
export function autoPlies(
  totals: readonly number[],
  maxPlies: number | null | undefined,
  faceToFace: boolean,
): number {
  const g = gcdOfTotals(totals);
  if (g <= 0) return 1;
  const cap = typeof maxPlies === 'number' && maxPlies >= 1 ? Math.floor(maxPlies) : Infinity;
  const largestDivisor = (even: boolean): number => {
    for (let d = Math.min(g, cap); d >= 1; d--) {
      if (g % d === 0 && (!even || d % 2 === 0)) return d;
    }
    return 0;
  };
  if (faceToFace) {
    const even = largestDivisor(true);
    if (even >= 2) return even;
  }
  let p = largestDivisor(false);
  if (p <= 1 && g > 1 && Number.isFinite(cap)) p = cap;
  p = Math.max(1, p);
  if (faceToFace && p % 2 === 1 && p + 1 <= cap) p += 1;
  return p;
}

// Перекрой молчит, пока он в допуске: не больше +1 на размер ИЛИ не больше 10 % итога.
export const EXTRA_TOLERANCE_SHARE = 0.1;
export function extraWithinTolerance(totals: readonly number[], plies: number): boolean {
  const over = overCutOf(totals, plies);
  const extra = over.reduce((s, v) => s + v, 0);
  const total = totals.reduce((s, t) => s + Math.max(0, t), 0);
  return over.every((v) => v <= 1) || extra <= EXTRA_TOLERANCE_SHARE * total;
}
