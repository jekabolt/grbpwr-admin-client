// ГЕОМЕТРИЯ УКАЗАНИЙ — чистая арифметика, без React.
//
// Отдельный файл от `annotation-shapes.tsx` ради одного: эти функции проверяются пробой, а проба
// собирает модуль в node — с JSX внутри туда пришлось бы тащить весь React ради трёх строк
// математики. Отрисовка импортирует отсюда, не наоборот.

export type ShapePoint = { x: number; y: number };

/**
 * Управляющая точка квадратичной кривой Безье, проходящей ЧЕРЕЗ `p1`.
 *
 * Q(t) = (1−t)²·P0 + 2(1−t)t·C + t²·P2, откуда Q(0.5) = (P0 + 2C + P2)/4. Приравняв Q(0.5) к P1,
 * получаем C = 2·P1 − (P0 + P2)/2.
 *
 * Средняя точка НА кривой, а не сбоку от неё, — единственный способ дать её поставить мышью:
 * управляющая точка кривой не принадлежит, и ставящий её каждый раз промахивается мимо линии,
 * которую рисует.
 */
export function arcControlPoint(p0: ShapePoint, p1: ShapePoint, p2: ShapePoint): ShapePoint {
  return {
    x: 2 * p1.x - (p0.x + p2.x) / 2,
    y: 2 * p1.y - (p0.y + p2.y) / 2,
  };
}

/** Точка квадратичной кривой Безье при параметре t — используется пробой и ничем больше. */
export function quadraticAt(
  p0: ShapePoint,
  c: ShapePoint,
  p2: ShapePoint,
  t: number,
): ShapePoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  };
}

/** SVG-путь дуги по трём точкам КРИВОЙ: начало, точка на дуге, конец. */
export function arcPath(p0: ShapePoint, p1: ShapePoint, p2: ShapePoint): string {
  const c = arcControlPoint(p0, p1, p2);
  return `M${p0.x},${p0.y} Q${c.x},${c.y} ${p2.x},${p2.y}`;
}
