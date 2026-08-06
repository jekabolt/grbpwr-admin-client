// Долевая: какой слой её несёт и как повернуть деталь, чтобы она легла вдоль полосы.
//
// Движок исходит из того, что деталь НАРИСОВАНА долевой вдоль полосы: «Grain runs along the
// strip (+X), so 0/180 are always allowed» (lib/nesting/types.ts). В реальных файлах это просто
// неправда, и цена ошибки — не косметика, а испорченная ткань: деталь, выкроенная поперёк
// долевой, тянется и садится не туда.
//
// Замерено на трёх файлах лекальщика. Долевая везде лежит на слое 7 ровно одним прямым
// незамкнутым отрезком (45 из 45, 46 из 46, 45 из 45 блоков); на слое 8 отрезки такой же формы
// есть, но лишь у части блоков и по нескольку — это внутренние линии. И главное: в одном файле
// все 45 деталей нарисованы под 90°, а в другом 24 под 0° и 22 под 90°. Значит поворот обязан
// быть ПОДЕТАЛЬНЫМ; общий поворот листа починил бы один файл и сломал другой.
import type { PieceDTO } from 'lib/nesting/types';

export type GrainLayerOption = {
  layer: string;
  // У скольких деталей на этом слое РОВНО ОДИН отрезок — это и есть признак долевой.
  exactlyOne: number;
  // У скольких деталей слой встречается вообще.
  seen: number;
};

export function grainLayerOptions(pieces: readonly PieceDTO[]): GrainLayerOption[] {
  // По блоку, а не по контуру: долевая принадлежит детали, и один блок даёт по контуру на слой.
  const perBlock = new Map<string, PieceDTO['grain']>();
  for (const p of pieces) {
    const key = p.blockName || `#${p.id}`;
    if (!perBlock.has(key)) perBlock.set(key, p.grain ?? []);
  }
  const stat = new Map<string, GrainLayerOption>();
  for (const grain of perBlock.values()) {
    const perLayer = new Map<string, number>();
    for (const c of grain ?? []) perLayer.set(c.layer, (perLayer.get(c.layer) ?? 0) + 1);
    for (const [layer, n] of perLayer) {
      const s = stat.get(layer) ?? { layer, exactlyOne: 0, seen: 0 };
      s.seen++;
      if (n === 1) s.exactlyOne++;
      stat.set(layer, s);
    }
  }
  return [...stat.values()].sort(
    (a, b) => b.exactlyOne - a.exactlyOne || b.seen - a.seen || a.layer.localeCompare(b.layer),
  );
}

export function defaultGrainLayer(options: readonly GrainLayerOption[]): string {
  const best = options[0];
  // Слой, на котором один отрезок меньше чем у половины деталей, долевой не является — это
  // внутренние линии, случайно попавшие под ту же форму.
  if (!best || best.exactlyOne === 0 || best.exactlyOne * 2 < best.seen) return '';
  return best.layer;
}

// Угол долевой детали на выбранном слое, или null если её там нет.
export function grainAngleOf(piece: PieceDTO, layer: string): number | null {
  if (!layer) return null;
  const hits = (piece.grain ?? []).filter((c) => c.layer === layer);
  // Ровно один — иначе непонятно, какой из отрезков долевая, и молча выбирать нельзя.
  return hits.length === 1 ? hits[0].angleDeg : null;
}

// Поворачивает детали так, чтобы долевая легла вдоль полосы (+X). Отдаёт НОВЫЕ детали: лист
// показывает файл как он есть, а раскладка — то, что ляжет на ткань.
export function orientToGrain(
  pieces: readonly PieceDTO[],
  layer: string,
): { pieces: PieceDTO[]; rotated: number; missing: string[] } {
  const out: PieceDTO[] = [];
  const missing: string[] = [];
  let rotated = 0;
  for (const p of pieces) {
    const angle = grainAngleOf(p, layer);
    if (angle == null) {
      missing.push(p.name);
      out.push(p);
      continue;
    }
    // Уже вдоль полосы — не трогаем, чтобы не плодить дребезг тригонометрии на ровном месте.
    if (Math.abs(angle) < 1e-9) {
      out.push(p);
      continue;
    }
    const rad = (-angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const spun = p.poly.map((pt) => {
      const x = pt.x * cos - pt.y * sin;
      const y = pt.x * sin + pt.y * cos;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return { x, y };
    });
    out.push({
      ...p,
      // Контур снова от своего левого нижнего угла — этого ждёт размещатель.
      poly: spun.map((pt) => ({ x: pt.x - minX, y: pt.y - minY })),
      bboxW: maxX - minX,
      bboxH: maxY - minY,
      // Повёрнутая деталь больше НЕ лежит на своём месте в чертеже. Снимаем координаты, чтобы
      // её случайно не нарисовали на листе: пустое место честнее неверного.
      originX: undefined,
      originY: undefined,
    });
    rotated++;
  }
  return { pieces: out, rotated, missing };
}
