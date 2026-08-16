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

// ── ПОЛИГОН ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Замкнутый контур. Замыкание — `Z`, а не повтор первой точки в данных: копия координаты однажды
 * разошлась бы с оригиналом (правка первой точки не догнала бы её), и контур размыкался бы на
 * волосок — незаметно на экране и предательски на печати.
 */
export function polygonPath(pts: ShapePoint[]): string {
  if (pts.length < 2) return '';
  return `M${pts.map((p) => `${p.x},${p.y}`).join(' L')} Z`;
}

/**
 * Центр тяжести МНОГОУГОЛЬНИКА, а не среднее вершин. Среднее вершин уезжает туда, где вершин
 * гуще: у контура с частым краем и одной длинной стороной маркер садится на край вместо середины.
 * Вырожденный (нулевая площадь) контур честно отдаёт среднее — делить там не на что.
 */
export function polygonCentroid(pts: ShapePoint[]): ShapePoint {
  if (pts.length === 0) return { x: 0, y: 0 };
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-12) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

// ── СВОБОДНЫЙ СЛЕД ──────────────────────────────────────────────────────────────────────────────

/**
 * След маркера СГЛАЖЕННЫМ путём. Catmull-Rom через все точки, переведённый в кубические Безье:
 * кривая проходит РОВНО через записанные точки, поэтому прореживание и сглаживание не спорят —
 * сглаживание не двигает то, что человек нарисовал, оно только убирает углы между отсчётами.
 *
 * Ломаной след выглядит рублеными звеньями ровно там, где прореживание сработало лучше всего, и
 * читается как «нарисовано роботом» вместо «обвели рукой».
 */
export function inkPath(pts: ShapePoint[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // Классические веса Catmull-Rom → Безье: 1/6 отрезка соседей. Натяжение не выносится в
    // параметр намеренно — один вид следа на все поверхности, иначе «обвели» на эскизе и на
    // снимке шага выглядели бы разными жестами.
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Расстояние от точки до ОТРЕЗКА (не до прямой) плюс параметр проекции на нём. */
export function projectOnSegment(
  p: ShapePoint,
  a: ShapePoint,
  b: ShapePoint,
): { dist: number; t: number; at: ShapePoint } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const at = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: Math.hypot(p.x - at.x, p.y - at.y), t, at };
}

/**
 * Ближайшее место НА ломаной: номер звена и точка на нём. Так вставляется новая вершина — щелчок
 * по стороне контура кладёт угол ровно туда, куда ткнули, а не в конец списка.
 *
 * `closed` дописывает замыкающее звено: у полигона сторона между последней и первой вершиной такая
 * же, как все прочие, и не давать вставить на ней угол значило бы, что одну сторону из N поправить
 * нельзя вовсе.
 */
export function nearestOnPolyline(
  p: ShapePoint,
  pts: ShapePoint[],
  closed = false,
): { index: number; dist: number; at: ShapePoint } | null {
  if (pts.length < 2) return null;
  const last = closed ? pts.length : pts.length - 1;
  let best: { index: number; dist: number; at: ShapePoint } | null = null;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const { dist, at } = projectOnSegment(p, a, b);
    if (!best || dist < best.dist) best = { index: i, dist, at };
  }
  return best;
}

/**
 * Прореживание следа (Ramer–Douglas–Peucker). Сырой указатель отдаёт точку на каждое движение —
 * сотни за росчерк, и все они уезжают в JSON-колонку, в отпечаток секции и в каждое чтение
 * карточки. RDP выкидывает те, чьё отсутствие не двигает линию дальше `epsilon`.
 *
 * Итеративный, а не рекурсивный: длинный след на быстром компьютере набирает тысячи точек, и
 * рекурсия по ним переполняет стек ровно у того, у кого рука твёрже.
 */
export function simplifyPath(pts: ShapePoint[], epsilon: number): ShapePoint[] {
  if (pts.length <= 2 || epsilon <= 0) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    if (last <= first + 1) continue;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const { dist } = projectOnSegment(pts[i], pts[first], pts[last]);
      if (dist > worst) {
        worst = dist;
        index = i;
      }
    }
    if (index < 0 || worst <= epsilon) continue;
    keep[index] = true;
    stack.push([first, index], [index, last]);
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Прореживание до ПОТОЛКА числа точек. Сервер хранит не больше `limit`, и отдать ему больше — это
 * отказ сохранения всей карточки за росчерк, который человек считает уже сделанным.
 *
 * Порог подбирается удвоением, а не подбором «на глаз»: он зависит от длины и извилистости следа,
 * и одно фиксированное число либо съедает короткий росчерк, либо не спасает длинный. Двадцати
 * удвоений хватает на любой мыслимый след; после них берётся равномерная выборка — она хуже, но
 * она есть, а отказ на сохранении карточки хуже обоих.
 */
export function simplifyToLimit(pts: ShapePoint[], limit: number, start = 0.002): ShapePoint[] {
  if (pts.length <= limit) return pts.slice();
  let eps = start;
  for (let i = 0; i < 20; i++) {
    const out = simplifyPath(pts, eps);
    if (out.length <= limit) return out;
    eps *= 2;
  }
  const step = (pts.length - 1) / (limit - 1);
  const out: ShapePoint[] = [];
  for (let i = 0; i < limit; i++) out.push(pts[Math.round(i * step)]);
  return out;
}
