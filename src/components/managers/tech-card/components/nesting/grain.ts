// Какой слой DXF несёт долевую. Сам ПОВОРОТ живёт в lib/nesting/geom/grain-orient.ts, потому
// что его обязан делать воркер — см. комментарий там.
//
// Замерено на трёх файлах лекальщика. Долевая везде на слое 7, ровно одним прямым незамкнутым
// отрезком (45 из 45, 46 из 46, 45 из 45 блоков); на слое 8 отрезки такой же формы есть, но
// лишь у части блоков и по нескольку — это внутренние линии. И главное: в одном файле все 45
// деталей нарисованы под 90°, а в другом 24 под 0° и 22 под 90°. Значит поворот обязан быть
// ПОДЕТАЛЬНЫМ; общий поворот листа починил бы один файл и сломал другой.
import type { PieceDTO } from 'lib/nesting/types';

export type GrainLayerOption = {
  layer: string;
  // У скольких деталей на этом слое РОВНО ОДИН отрезок — это и есть признак долевой.
  exactlyOne: number;
  // У скольких деталей слой встречается вообще.
  seen: number;
  // Медианная длина отрезка. Долевую рисуют заметной линией, а внутренние линии бывают и
  // длиннее, и короче вразнобой — но при прочих равных длина различает лучше, чем имя слоя.
  medianLengthCm: number;
};

export function grainLayerOptions(pieces: readonly PieceDTO[]): GrainLayerOption[] {
  // По блоку, а не по контуру: долевая принадлежит детали, и один блок даёт по контуру на слой.
  // Деталь без блока пропускаем совсем: в файле-россыпи кандидаты общие на весь чертёж, и
  // подетальной долевой там нет — считать её по такому файлу значит выдумывать.
  const perBlock = new Map<string, PieceDTO['grain']>();
  for (const p of pieces) {
    if (!p.blockName) continue;
    if (!perBlock.has(p.blockName)) perBlock.set(p.blockName, p.grain ?? []);
  }
  const stat = new Map<string, { layer: string; exactlyOne: number; seen: number; lens: number[] }>();
  for (const grain of perBlock.values()) {
    const perLayer = new Map<string, number[]>();
    for (const c of grain ?? []) {
      const l = perLayer.get(c.layer) ?? [];
      l.push(c.lengthCm);
      perLayer.set(c.layer, l);
    }
    for (const [layer, lens] of perLayer) {
      const s = stat.get(layer) ?? { layer, exactlyOne: 0, seen: 0, lens: [] };
      s.seen++;
      if (lens.length === 1) {
        s.exactlyOne++;
        s.lens.push(lens[0]);
      }
      stat.set(layer, s);
    }
  }
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [...stat.values()]
    .map((s) => ({
      layer: s.layer,
      exactlyOne: s.exactlyOne,
      seen: s.seen,
      medianLengthCm: median(s.lens),
    }))
    // Сперва охват (у скольких деталей ровно один отрезок), затем ДЛИНА: имя слоя ничего не
    // значит, а сортировка по нему давала «10» впереди «7» и молча теряла настоящую долевую.
    .sort(
      (a, b) =>
        b.exactlyOne - a.exactlyOne || b.medianLengthCm - a.medianLengthCm || b.seen - a.seen,
    );
}

export function defaultGrainLayer(options: readonly GrainLayerOption[]): string {
  const best = options[0];
  // Слой, на котором один отрезок меньше чем у половины деталей, долевой не является — это
  // внутренние линии, случайно попавшие под ту же форму.
  if (!best || best.exactlyOne === 0 || best.exactlyOne * 2 < best.seen) return '';
  return best.layer;
}
