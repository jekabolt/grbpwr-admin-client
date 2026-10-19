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
export function quadraticAt(p0: ShapePoint, c: ShapePoint, p2: ShapePoint, t: number): ShapePoint {
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

// ── СКОБА («SPAN») ──────────────────────────────────────────────────────────────────────────────

/**
 * Насколько скоба отступает от прямой между якорями, ПИКСЕЛЕЙ КАДРА.
 *
 * ЖИВЁТ ЗДЕСЬ, А НЕ В ОТРИСОВКЕ, И ЭТО ОПЛАЧЕНО ДЕФЕКТОМ. Число знали двое: тот, кто рисует скобу,
 * и тот, кто ловит по ней мышь. Второй его не знал вовсе — хит-путь шёл ПО ХОРДЕ между якорями,
 * то есть по линии, которой на кадре нет. Полоса попадания шириной 12px ловит ±6px от хорды,
 * перекладина стоит на 10px, и промах в 4px означал ровно то, что владелец и сказал: «выделение
 * колаута спан происходит не по всей видимой поверхности». Заодно нажималось пустое место между
 * якорями, где не нарисовано ничего.
 */
export const BRACKET_DROP = 10;

/** Середина отрезка. Экспортируется: от неё же Shift держит изгиб кривой (D-17). */
export const midpoint = (p: ShapePoint, q: ShapePoint): ShapePoint => ({
  x: (p.x + q.x) / 2,
  y: (p.y + q.y) / 2,
});
const mid = midpoint;

/** Нормаль к отрезку p→q длиной `d`. Вырожденный отрезок даёт нулевую длину — делить не на что. */
function offsetNormal(p: ShapePoint, q: ShapePoint, d: number): ShapePoint {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (-dy / len) * d, y: (dx / len) * d };
}

/** Четыре точки скобы: ножка — перекладина — ножка. Ими рисуют и по ним же ловят. */
export function bracketPoints(p: ShapePoint, q: ShapePoint): ShapePoint[] {
  const n = offsetNormal(p, q, BRACKET_DROP);
  return [p, { x: p.x + n.x, y: p.y + n.y }, { x: q.x + n.x, y: q.y + n.y }, q];
}

export function bracketPath(p: ShapePoint, q: ShapePoint): string {
  return `M${bracketPoints(p, q)
    .map((t) => `${t.x},${t.y}`)
    .join(' L')}`;
}

// ── НАКОНЕЧНИКИ (круг 18, D-19/D-20) ────────────────────────────────────────────────────────────

/** Полудлина засечки, пикселей кадра. Была `TICK` в отрисовке; здесь — потому что ею же меряет проба. */
export const TICK_HALF = 7;

/** Два конца фигуры с единичными касательными, направленными НАРУЖУ фигуры. */
export type ShapeEnds = { a: ShapePoint; ta: ShapePoint; b: ShapePoint; tb: ShapePoint };

const unit = (v: ShapePoint): ShapePoint => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

export function lineEnds(p: ShapePoint, q: ShapePoint): ShapeEnds {
  const t = unit({ x: q.x - p.x, y: q.y - p.y });
  return { a: p, ta: { x: -t.x, y: -t.y }, b: q, tb: t };
}

/**
 * Касательные квадратичной Безье в концах: P0→C и C→P2 — поэтому засечка на кривой стоит поперёк
 * САМОЙ кривой, а не поперёк хорды. Вырожденный конец (C совпал с ним) падает на хорду.
 */
export function arcEnds(p0: ShapePoint, p1: ShapePoint, p2: ShapePoint): ShapeEnds {
  const c = arcControlPoint(p0, p1, p2);
  const chord = unit({ x: p2.x - p0.x, y: p2.y - p0.y });
  const da = { x: p0.x - c.x, y: p0.y - c.y };
  const db = { x: p2.x - c.x, y: p2.y - c.y };
  return {
    a: p0,
    ta: Math.hypot(da.x, da.y) > 1e-9 ? unit(da) : { x: -chord.x, y: -chord.y },
    b: p2,
    tb: Math.hypot(db.x, db.y) > 1e-9 ? unit(db) : chord,
  };
}

/** Засечка: отрезок поперёк касательной, центром в конце. */
export function tickPath(at: ShapePoint, t: ShapePoint, half = TICK_HALF): string {
  const nx = -t.y * half;
  const ny = t.x * half;
  return `M${at.x - nx},${at.y - ny} L${at.x + nx},${at.y + ny}`;
}

/**
 * Ножка скобы на конце КРИВОЙ: от конца по правой нормали к ходу линии, длиной `BRACKET_DROP`.
 * «Правая» — та же сторона, куда отстоит перекладина у прямой скобы (`offsetNormal`), поэтому
 * прямая и кривая со скобой смотрят ножками в одну сторону. `travel` — направление ХОДА линии в
 * этом конце (в начале — внутрь фигуры, в конце — наружу).
 */
export function legPath(at: ShapePoint, travel: ShapePoint, drop = BRACKET_DROP): string {
  const t = unit(travel);
  return `M${at.x},${at.y} L${at.x - t.y * drop},${at.y + t.x * drop}`;
}

// ── SHIFT: 0° · 45° · 90° (круг 18, D-17) ─────────────────────────────────────────────────────

/** Восемь направлений фотошопа — таблицей, чтобы 45° давало РАВНЫЕ приращения, а не cos ≠ sin. */
const DIRS: ShapePoint[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

/**
 * Точка, прижатая к ближайшему из восьми направлений от якоря — как в фотошопе с зажатым Shift.
 *
 * СЧИТАЕТСЯ В ПИКСЕЛЯХ, не в долях: доли по X и Y — разные единицы, и «45°» в долях на альбомном
 * кадре не 45° на экране. ПРОЕКЦИЯ на направление, а не поворот вектора: точка остаётся там,
 * куда её довели вдоль удержанной оси, меняется только вторая координата. Совпавшая с якорем
 * точка возвращается как есть — направления у неё нет.
 */
export function constrainTo45(anchor: ShapePoint, p: ShapePoint): ShapePoint {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  if (dx === 0 && dy === 0) return p;
  const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const u = DIRS[i];
  const len = dx * u.x + dy * u.y;
  return { x: anchor.x + len * u.x, y: anchor.y + len * u.y };
}

// ── ЛИДЕР ───────────────────────────────────────────────────────────────────────────────────────

/**
 * КУДА УПИРАЕТСЯ ЛИДЕР — ОДНА ФУНКЦИЯ НА ОТРИСОВКУ И НА ПОПАДАНИЕ.
 *
 * Лидер — та же видимая линия указания, что и сама фигура: он тянется от плашки к фигуре и по нему
 * в эту фигуру и целятся. Пока цель лидера считалась внутри отрисовки, хит-слой о нём не знал —
 * и пунктирная линия через полкадра не нажималась нигде.
 *
 * `null` — у вида лидера нет вовсе (пин, след): у первого нет линии, у второго плашка стоит на
 * самом штрихе.
 *
 * `caps` — ДЕЙСТВУЮЩИЙ наконечник (`effectiveCaps`), не хранимый: у линии только скоба отстоит
 * от хорды, и лидер обязан прийти на перекладину; ключ вида этого больше не говорит (D-19).
 *
 * ⚠ АРГУМЕНТ ОБЯЗАТЕЛЬНЫЙ, И ЭТО НЕ ПЕДАНТИЗМ. С умолчанием `''` вызывающий, забывший его,
 * получал БЕЗ ЕДИНОГО ПРЕДУПРЕЖДЕНИЯ середину хорды у каждой скобы — то есть лидер, уехавший с
 * перекладины, — а до D-19 ключ `bracket` давал перекладину ВСЕГДА. Умолчание молча меняло
 * поведение в пользу самого частого случая и наказывало за забывчивость картинкой, а не ошибкой.
 * Пустая строка передаётся явно там, где наконечника у вида нет (зона, след): это утверждение,
 * а не пропуск.
 */
export function leaderTarget(kindKey: string, pts: ShapePoint[], caps: string): ShapePoint | null {
  if (pts.length === 0) return null;
  switch (kindKey) {
    case 'dim':
    case 'bracket': {
      if (pts.length < 2) return null;
      const m = mid(pts[0], pts[1]);
      if (caps !== 'bracket') return m;
      const n = offsetNormal(pts[0], pts[1], BRACKET_DROP);
      return { x: m.x + n.x, y: m.y + n.y };
    }
    case 'arc':
      // Горб дуги: середина ХРАНЕНИЯ — это точка НА кривой, туда лидер и приходит.
      return pts.length >= 3 ? pts[1] : null;
    case 'polygon':
      // Среднее вершин, а не полный центроид: так рисуется лидер зоны, и хит обязан совпасть с
      // нарисованным, а не быть «правильнее» его.
      return {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
    default:
      return null;
  }
}

// ── СВОБОДНЫЙ СЛЕД ──────────────────────────────────────────────────────────────────────────────

/**
 * ПОДНЯТОЕ ПЕРО КОДИРУЕТСЯ ДУБЛИРОВАННОЙ ТОЧКОЙ: `…, P, P, Q, …` читается как «между P и Q перо
 * оторвали от бумаги». Так одна выноска-след несёт НЕСКОЛЬКО штрихов, и «пока я во фрихенде, я
 * рисую одну фигуру» выражается без единой правки провода.
 *
 * ПОЧЕМУ ИМЕННО ДУБЛЬ, А НЕ СЕНТИНЕЛЬ И НЕ НОВОЕ ПОЛЕ. Сервер валидирует КАЖДУЮ координату как
 * долю кадра от 0 до 1 и отвергает показатель степени, поэтому точка «вне кадра» разделителем быть
 * не может — карточка перестала бы сохраняться целиком. Новое поле на проводе означало бы правку
 * контракта и рост хвоста отпечатка секции. Дубль же переживает и кламп 0..1, и `toFixed(4)`, и
 * дайджест видит обычные точки.
 *
 * ЛОЖНЫЙ ДУБЛЬ БЕЗВРЕДЕН. В легаси-данных соседние точки на расстоянии меньше 0.0001 кадра не
 * встречаются: след прореживается RDP с порогом около двух ЭКРАННЫХ пикселей, а это на три порядка
 * больше. Даже если такая пара где-то есть, «разрыв» между двумя точками, отстоящими на десятую
 * долю пикселя, невидим.
 */
export function splitInkStrokes(pts: ShapePoint[]): ShapePoint[][] {
  const out: ShapePoint[][] = [];
  let cur: ShapePoint[] = [];
  for (const p of pts) {
    const last = cur[cur.length - 1];
    if (last && last.x === p.x && last.y === p.y) {
      // Дубль ЗАКРЫВАЕТ штрих на этой точке, а не начинает новый с неё: перо подняли ПОСЛЕ неё.
      out.push(cur);
      cur = [];
      continue;
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Один штрих СГЛАЖЕННЫМ путём. Catmull-Rom через все точки, переведённый в кубические Безье:
 * кривая проходит РОВНО через записанные точки, поэтому прореживание и сглаживание не спорят —
 * сглаживание не двигает то, что человек нарисовал, оно только убирает углы между отсчётами.
 *
 * Ломаной след выглядит рублеными звеньями ровно там, где прореживание сработало лучше всего, и
 * читается как «нарисовано роботом» вместо «обвели рукой».
 */
function strokePath(pts: ShapePoint[]): string {
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

/**
 * След маркера — ОДНА фигура из одного или нескольких штрихов, разделённых поднятым пером.
 *
 * ЕДИНСТВЕННОЕ МЕСТО, ГДЕ СЛЕД ПРЕВРАЩАЕТСЯ В ПУТЬ: через него идут и холст, и печать тех-пака, и
 * призрачный контур правки. Поэтому разбивку по разрывам делает именно оно — иначе сглаживание
 * протянуло бы кривую ЧЕРЕЗ разрыв, то есть нарисовало бы мост там, где перо было в воздухе.
 * Данные без дублей (а это весь легаси) дают ровно тот же путь, что и раньше: разбивка вернёт один
 * штрих, и `strokePath` отработает как прежний `inkPath`.
 */
export function inkPath(pts: ShapePoint[]): string {
  return splitInkStrokes(pts).map(strokePath).filter(Boolean).join(' ');
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

// ── ВАРП КАРТИНКИ АРТВОРКА НА ЧЕТЫРЕ РУЧКИ (R20) ────────────────────────────────────────────────
//
// Владелец: «картинка когда добавляется в принт она должна помещатся внутрь подвижных штук и
// варпаться вместе с ними». Зона артворка — четыре точки в порядке `rectCorners` (TL, TR, BR, BL);
// углы картинки садятся РОВНО на них, середина — по проективному преобразованию.
//
// ОДИН ЭЛЕМЕНТ, CSS `matrix3d` (T27, R35; владелец: «оно очень лагает»). Прежде проекция
// приближалась сеткой 10×10 аффинных треугольников — 200 <clipPath> и 200 <image> на каждое
// движение ручки. Теперь это одна <img> с проективной матрицей: Chrome рисует её точно, в том числе
// на печати (Skia умеет перспективу и без композитора — проверено снимком PDF, shots/27-print*).
//
// ТОЛЬКО ВЫПУКЛАЯ ЗОНА (R34; владелец: «так быть не должно» — угол утянули внутрь, и проекция
// выбросила лучи далеко за кадр). У выпуклого четырёхугольника знаменатель проекции на всём
// квадрате положителен, и картинка лежит строго внутри зоны; у вогнутого или перекрученного он
// проходит через ноль. Поэтому зона обязана быть `quadIsSound`, а ручка, которая её вывернула бы,
// упирается (`clampQuadCorner`).

/** Коэффициенты проекции единичного квадрата на четырёхугольник: x=(a·u+b·v+c)/w, w=g·u+h·v+1. */
export type Homography = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
};

/**
 * Проекция единичного квадрата (0,0)→q0, (1,0)→q1, (1,1)→q2, (0,1)→q3 (Heckbert). У параллелограмма
 * g = h = 0 — это обычный аффин. `null` — вырожденный четырёхугольник (три точки на прямой).
 */
export function squareToQuad(q: ShapePoint[]): Homography | null {
  if (q.length !== 4) return null;
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const H = {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
  // Аффинная часть обязана быть обратимой, иначе квадрат сплющен в линию.
  if (Math.abs(H.a * H.e - H.b * H.d) < 1e-12 && g === 0 && h === 0) return null;
  return H;
}

/** Точка квадрата (u, v) ∈ [0,1]² на четырёхугольнике. `null` — за линией горизонта (w ≤ 0). */
export function applyHomography(H: Homography, u: number, v: number): ShapePoint | null {
  const w = H.g * u + H.h * v + 1;
  if (w <= 1e-9) return null;
  return { x: (H.a * u + H.b * v + H.c) / w, y: (H.d * u + H.e * v + H.f) / w };
}

/**
 * CSS `matrix3d(...)` (16 чисел, по столбцам) для элемента размером `w`×`h` с `transform-origin: 0 0`,
 * положенного в (0, 0) слоя кадра: его углы (0,0), (w,0), (w,h), (0,h) садятся ровно на точки `q`
 * (TL, TR, BR, BL) в пикселях того же слоя. `null` — зона не выпуклая или вырождена: проекция на ней
 * не определена внутри квадрата.
 */
export function quadMatrix3d(q: ShapePoint[], w: number, h: number): number[] | null {
  // Только строгая выпуклость: пороги угла и площади — забота ручки, а не отрисовки.
  if (!(w > 0) || !(h > 0) || !quadIsSound(q, 0, 180)) return null;
  const H = squareToQuad(q);
  if (!H) return null;
  // (u, v) = (x/w, y/h): x' = (a·u + b·v + c)/W, y' = (d·u + e·v + f)/W, W = g·u + h·v + 1.
  return [H.a / w, H.d / w, 0, H.g / w, H.b / h, H.e / h, 0, H.h / h, 0, 0, 1, 0, H.c, H.f, 0, 1];
}

/**
 * ТА ЖЕ ПРОЕКЦИЯ, РАЗЛОЖЕННАЯ ТАК, ЧТОБЫ ЕХАТЬ С КАДРОМ ПРИ ПЕЧАТИ: `translate(tx, ty)
 * perspective(d) matrix3d(m)`. Печать меняет ширину кадра ПОСЛЕ замера, и ResizeObserver на это не
 * стреляет; у `matrix3d` в пикселях замера картинка осталась бы прежнего размера (снимок
 * shots/27-print-pdf до правки). Кадр масштабируется равномерно (пропорции = пропорции картинки),
 * а при равномерном масштабе k у проекции меняются только величины с размерностью: сдвиг (×k) и
 * перспектива (÷k). Здесь они вынесены в `tx`, `ty`, `d` — длины в пикселях замера, которые
 * разметка пишет в единицах контейнера (cqw/cqh) и которые потому растут вместе с кадром; `m` —
 * безразмерная, от масштаба не зависит.
 *
 * Как сходится: Z·(x, y) = ((A−C·G)x + (B−C·H)y, (D−F·G)x + (E−F·H)y, −d·(G·x + H·y), 1); перспектива
 * делает w = 1 + G·x + H·y; сдвиг на (C, F)·w возвращает числитель A·x + B·y + C. То же, что `quadMatrix3d`.
 */
export function quadPerspectiveParts(
  q: ShapePoint[],
  w: number,
  h: number,
): { tx: number; ty: number; d: number; m: number[] } | null {
  const M = quadMatrix3d(q, w, h);
  if (!M) return null;
  const [A, D0, , G, B, E, , Hh, , , , , C, F] = M;
  // Любая положительная длина; порядок размера зоны держит числа в m около единицы.
  const d = Math.max(w, h, 1);
  return {
    tx: C,
    ty: F,
    d,
    m: [
      A - C * G,
      D0 - F * G,
      -d * G,
      0,
      B - C * Hh,
      E - F * Hh,
      -d * Hh,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ],
  };
}

/**
 * ЗОНА ГОДИТСЯ ПОД КАРТИНКУ: четыре точки, строго выпуклый обход (ни вогнутости, ни перекрёста), ни
 * один внутренний угол не тупее `maxAngle`° (почти прямой угол сплющивает картинку в нитку) и
 * площадь больше `minArea` (в квадратных единицах координат `q`). Углы считаются в тех же единицах,
 * что и точки: зовите с пикселями кадра, а не с долями, иначе альбомный кадр исказит углы.
 */
export function quadIsSound(q: readonly ShapePoint[], minArea = 0, maxAngle = 175): boolean {
  if (q.length !== 4 || q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  let sign = 0;
  let area2 = 0;
  // Внешний поворот в вершине не меньше 180° − maxAngle: синус этого поворота — нижняя граница.
  const minTurn = Math.sin(((180 - maxAngle) * Math.PI) / 180);
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-12 || lv < 1e-12) return false;
    const cross = ux * vy - uy * vx;
    const s = Math.sign(cross);
    if (s === 0 || (sign !== 0 && s !== sign)) return false;
    sign = s;
    // Поворот почти 0° (угол почти 180°) или почти 180° назад (шпилька) — оба отбиваются: у шпильки
    // скалярное произведение отрицательно, и тогда это не «тупой угол», а разворот.
    if (Math.abs(cross) / (lu * lv) < minTurn && ux * vx + uy * vy > 0) return false;
    area2 += a.x * b.y - b.x * a.y;
  }
  // Четыре одинаковых поворота у четырёх вершин — это один оборот (сумма внешних углов < 4·180°),
  // то есть простой выпуклый контур: перекрученный «бантик» всегда меняет знак поворота.
  return Math.abs(area2) / 2 > minArea;
}

/**
 * РУЧКА ЗОНЫ УПИРАЕТСЯ, А НЕ ПРЫГАЕТ (R34): угол `index` тянут в `target`. Если там зона годна —
 * туда; если нет — самая дальняя годная точка на отрезке от прежнего места к `target` (зона
 * «прилипает» к границе выпуклости и скользит дальше, когда рука вернётся). Прежнее место само
 * негодно (старая запись) — `target` как есть: не запирать ручку там, откуда её не выпустить.
 */
export function clampQuadCorner(
  q: readonly ShapePoint[],
  index: number,
  target: ShapePoint,
  ok: (q: ShapePoint[]) => boolean,
): ShapePoint {
  const at = (p: ShapePoint) => q.map((x, i) => (i === index ? p : x));
  if (ok(at(target))) return target;
  const from = q[index];
  if (!from || !ok(at(from))) return target;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const t = (lo + hi) / 2;
    if (ok(at({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t })))
      lo = t;
    else hi = t;
  }
  return { x: from.x + (target.x - from.x) * lo, y: from.y + (target.y - from.y) * lo };
}

/**
 * Зона под пропорции картинки — один раз, при первом прикреплении: иначе картинка рождается
 * растянутой под ту рамку, которую нарисовали до неё. Центр и поворот зоны сохраняются (ось — средняя
 * из верхнего и нижнего рёбер), картинка ВПИСЫВАЕТСЯ в прежнюю зону (одна сторона укорачивается).
 * Порядок вершин тот же: TL, TR, BR, BL. Координаты — пиксели кадра; `aspect` = ширина/высота.
 */
export function fitQuadToAspect(q: ShapePoint[], aspect: number): ShapePoint[] {
  if (q.length !== 4 || !(aspect > 0) || !Number.isFinite(aspect)) return q;
  const [p0, p1, p2, p3] = q;
  const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
  const cy = (p0.y + p1.y + p2.y + p3.y) / 4;
  const ux = (p1.x - p0.x + p2.x - p3.x) / 2;
  const uy = (p1.y - p0.y + p2.y - p3.y) / 2;
  const vx = (p3.x - p0.x + p2.x - p1.x) / 2;
  const vy = (p3.y - p0.y + p2.y - p1.y) / 2;
  const W = Math.hypot(ux, uy);
  const Hh = Math.hypot(vx, vy);
  if (W < 1e-9 || Hh < 1e-9) return q;
  const ex = ux / W;
  const ey = uy / W;
  // Нормаль к оси — в ту же сторону, куда смотрело боковое ребро: зона не выворачивается.
  const side = ex * vy - ey * vx >= 0 ? 1 : -1;
  const nx = -ey * side;
  const ny = ex * side;
  const w = W / Hh > aspect ? Hh * aspect : W;
  const h = W / Hh > aspect ? Hh : W / aspect;
  const at = (su: number, sv: number) => ({
    x: cx + (ex * (su * w)) / 2 + (nx * (sv * h)) / 2,
    y: cy + (ey * (su * w)) / 2 + (ny * (sv * h)) / 2,
  });
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
}
