// Поворот детали так, чтобы долевая легла вдоль полосы (+X).
//
// Живёт ЗДЕСЬ, а не рядом с модалкой, по одной причине: раскладка считается в воркере, у
// которого своя копия разобранных деталей, а через NestConfig едут только идентификаторы и
// количества — никакой геометрии. Поворот, сделанный на главном потоке, до движка не доезжал
// вовсе: детали по-прежнему укладывались как нарисованы, а картинка на экране показывала
// повёрнутые контуры с размещениями, посчитанными для неповёрнутых. Такой маркер сохранялся
// без единой жалобы и уезжал в плоттерный DXF перехлёстнутым.
//
// Поэтому функция ЧИСТАЯ и вызывается по обе стороны воркера на одном и том же входе — только
// так главный поток и движок гарантированно смотрят на одну геометрию. Зависит лишь от типов,
// так что импорт её в UI не тащит ни clipper, ни dxf-parser.
import type { PieceDTO } from '../types';

// Угол долевой детали на выбранном слое, или null если однозначно определить нельзя.
export function grainAngleOf(piece: PieceDTO, layer: string): number | null {
  if (!layer) return null;
  // У деталей из «россыпи» (файл без блоков) кандидаты — общие на весь чертёж: там нет
  // подетальной долевой, и один случайный отрезок развернул бы весь лист.
  if (!piece.blockName) return null;
  const hits = (piece.grain ?? []).filter((c) => c.layer === layer);
  // Ровно один — иначе непонятно, какой из отрезков долевая, и молча выбирать нельзя.
  return hits.length === 1 ? hits[0].angleDeg : null;
}

export type OrientResult = {
  pieces: PieceDTO[];
  rotated: number;
  // Имена деталей, у которых долевую определить не удалось — они лягут как нарисованы.
  missing: string[];
};

export function orientToGrain(pieces: readonly PieceDTO[], layer: string): OrientResult {
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
      // И долевую: её концы заданы в координатах ЧЕРТЕЖА, к повёрнутому контуру они уже не
      // относятся. Оставить их значило бы нарисовать линию мимо детали — и сделать функцию
      // неидемпотентной, потому что второй вызов повернул бы деталь ещё раз.
      grain: undefined,
    });
    rotated++;
  }
  return { pieces: out, rotated, missing };
}
