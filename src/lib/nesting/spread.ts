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

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
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
    plies !== null && known(compositionTotal) && compositionTotal >= 0 ? plies * compositionTotal : null;
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
  const eff = positive(input.efficiency) ? Math.min(1, input.efficiency) : ASSUMED_MARKER_EFFICIENCY;
  if (!positive(garmentAreaCm2) || !positive(fabricWidthCm) || !positive(usableLengthCm)) return 1;
  const k = Math.floor((fabricWidthCm * usableLengthCm * eff) / garmentAreaCm2 + 1e-9);
  return Math.max(1, k);
}
