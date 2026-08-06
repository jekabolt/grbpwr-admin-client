// Подпись детали, которая не вылезает за её СОБСТВЕННЫЙ контур.
//
// Раньше имя рисовалось горизонтально, одним кеглем, в labelAnchor (центроид по площади с
// откатом на центр bbox). У пояса, планки, обтачки, долевой полосы — у всего узкого или
// диагонального — строка уезжала на СОСЕДНЮЮ деталь, и на маркере это читается как «вот эта
// деталь так и называется». По этой картинке режут.
//
// Лестница решений, сверху вниз:
//   1. ИЗМЕРИТЬ. Ширина строки сравнивается с местом, которое реально есть ВНУТРИ контура на
//      высоте подписи, а не с габаритом bbox: у диагональной детали bbox в основном не деталь.
//   2. ПОВЕРНУТЬ. Естественный угол — долевая (её угол уже разобран), а если долевой нет —
//      длинная ось минимального по площади описанного прямоугольника. Длинная узкая деталь
//      получает подпись ВДОЛЬ себя, как её и ждут в лекальном цеху.
//   3. УМЕНЬШИТЬ. Кегль ступенями до порога читаемости, потом усечение имени с сохранением
//      узнаваемой головы (BP_1_ПОДКЛАД → BP_1…); полное имя остаётся в подсказке.
//   4. ВЫНОСКА. Если не помещается вовсе — точка на детали, подпись в ближайшем свободном
//      месте, между ними линия. Подпись не выбрасывается НИКОГДА: неподписанная деталь на
//      маркере — это деталь, которую перепутают.
//
// Модуль намеренно самодостаточен (импортируются ТОЛЬКО типы). Его зовут и главный поток
// (лист DXF, живое превью и экспорт SVG), и плоттерный DXF; любая зависимость отсюда утекла бы
// в главный бандл, а расхождение реализаций развело бы экран и плоттер.
//
// Все координаты — в системе Y-ВВЕРХ (как в чертеже DXF и в системе полосы). Экранный SVG
// зеркалит Y сам, поэтому там угол берётся со знаком минус — один раз, в месте отрисовки.
import type { NestResult, PieceDTO, Placement, Pt } from '../types';
// Значение, а не только тип, и это единственное исключение из «импортируются ТОЛЬКО типы» в
// шапке: types.ts — чистые функции без зависимостей, тот самый модуль, который главному потоку
// импортировать можно. Своя копия преобразования размещения здесь стоила бы дороже импорта:
// подпись планируется по контуру, и планировать её по НЕзеркальному контуру зеркальной детали
// значит поставить имя мимо детали — одинаково на экране и на плоттере, то есть незаметно.
import { placedPoly } from '../types';

// ——— метрика шрифта ————————————————————————————————————————————————————————————————————
// Ширина знака в долях кегля. Оба SVG рисуются font-family="monospace" (0.60–0.602 у
// DejaVu Sans Mono / Menlo), плоттерный DXF читается шрифтом вроде txt.shx (0.6–0.7 от высоты
// прописной, то есть меньше этого числа). Берём 0.64 С ЗАПАСОМ: ошибиться можно только в
// сторону «настоящая строка уже, чем забронированное место», и тогда проверка вложенности,
// сделанная по броне, верна и для реальных букв.
//
// ЧИСЛО ВЫВЕДЕНО ИЗ DXF, а не из браузера, и это принципиально. В SVG кегль это em, и запас при
// 0.64 честный: моноширинные дают 0.60. Но в DXF группа 40 — высота ПРОПИСНОЙ (DXF_CAP_PER_EM
// ниже), поэтому реальная строка вылезает, как только отношение advance/capHeight читающего
// шрифта превысит ADVANCE_EM / DXF_CAP_PER_EM. У Courier New это 0.600/0.571 = 1.05, у Arial по
// прописным 0.722/0.716 = 1.01, на букве W — 1.32. При 0.64/0.72 = 0.889 все трое вылезают: имя
// из 12 знаков на кегле 2.8 забронировало бы 21.5 см и напечаталось бы на 25 см, то есть на два
// сантиметра за каждый конец — через типичный зазор 0.5 см прямо на соседнюю деталь. Ровно то,
// ради чего этот планировщик и написан, на файле, по которому режут.
//
// Поэтому бронь считается от ХУДШЕГО правдоподобного шрифта: 0.95 от высоты прописной. Плюс DXF
// теперь объявляет STYLE и ссылается на него группой 7, так что «какой-нибудь» шрифт читатель
// больше не подставляет молча.
const ADVANCE_EM = 0.95 * 0.72;
// Вертикальный габарит строки в долях кегля.
const LINE_EM = 0.98;
// Отступ от контура в долях кегля: строка, прижатая вплотную к линии кроя, читается как её
// часть, а не как подпись.
const PAD_EM = 0.18;
// Высота DXF-текста (группа 40) — это высота ПРОПИСНОЙ, а не кегль. Держим связь явно, чтобы
// экран и плоттер показывали буквы одного размера.
export const DXF_CAP_PER_EM = 0.72;

export function labelBoxSize(text: string, fontCm: number): { w: number; h: number } {
  return {
    w: text.length * ADVANCE_EM * fontCm + 2 * PAD_EM * fontCm,
    h: LINE_EM * fontCm + 2 * PAD_EM * fontCm,
  };
}

// Кегль подписи на раскладке. ОДНА функция на SVG и на DXF: разойдись эти числа — и экран
// показывал бы вместившуюся подпись там, где плоттер печатает вылезшую.
export function layoutFontRange(fabricWidthCm: number): { max: number; min: number } {
  const max = Math.min(Math.max(fabricWidthCm / 45, 1.2), 2.8);
  return { max, min: Math.max(0.75, max * 0.42) };
}

export type LabelBox = { cx: number; cy: number; w: number; h: number; angleDeg: number };

export type LabelPlan = {
  // Что рисовать (возможно, усечённое).
  text: string;
  // Полное имя — для подсказки/title; усечение не должно терять ответ на вопрос «что это».
  full: string;
  truncated: boolean;
  fontCm: number;
  // Угол строки, CCW, система Y-вверх. Всегда в (-90, 90] — вверх ногами подпись не читается.
  angleDeg: number;
  // Центр строки.
  x: number;
  y: number;
  // Забронированный габарит строки — то, что проверяется на вложенность.
  box: LabelBox;
  // true — подпись целиком внутри своего контура. false — выноска (или, если и свободного
  // места не нашлось, вынужденная постановка рядом).
  fitted: boolean;
  leader?: { dotX: number; dotY: number; toX: number; toY: number };
};

// ——— мелкая геометрия (локальная: модуль обязан оставаться без зависимостей) ——————————

function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polyBounds(poly: readonly Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function rotatePoly(poly: readonly Pt[], deg: number): Pt[] {
  if (deg === 0) return poly as Pt[];
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return poly.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

function rotatePt(p: Pt, deg: number): Pt {
  if (deg === 0) return p;
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function segHit(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  if (o1 === 0 && o2 === 0) return false; // коллинеарные — вложенность решается точками
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

// Прямоугольник (по осям) целиком внутри простого многоугольника. Углы внутри + ни одно ребро
// контура не пересекает границу прямоугольника: контур — замкнутая петля, так что зайти внутрь
// не пересекая границу он не может.
function rectInsidePoly(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  poly: readonly Pt[],
): boolean {
  const corners: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  for (const c of corners) if (!pointInPolygon(c, poly)) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) continue;
    if (Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) continue;
    for (let k = 0; k < 4; k++) {
      if (segHit(a, b, corners[k], corners[(k + 1) % 4])) return false;
    }
  }
  return true;
}

// Пересекаются ли повёрнутый прямоугольник и многоугольник (любым способом: вершина внутри,
// угол внутри, рёбра крест-накрест).
function boxHitsPoly(box: LabelBox, poly: readonly Pt[]): boolean {
  const corners = boxCorners(box);
  const bb = polyBounds(corners);
  const pb = polyBounds(poly);
  if (bb.maxX < pb.minX || bb.minX > pb.maxX || bb.maxY < pb.minY || bb.minY > pb.maxY)
    return false;
  for (const c of corners) if (pointInPolygon(c, poly)) return true;
  for (const p of poly) if (pointInPolygon(p, corners)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    for (let k = 0; k < 4; k++) {
      if (segHit(a, b, corners[k], corners[(k + 1) % 4])) return true;
    }
  }
  return false;
}

export function boxCorners(box: LabelBox): Pt[] {
  const r = (box.angleDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = box.w / 2;
  const hh = box.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({ x: box.cx + p.x * c - p.y * s, y: box.cy + p.x * s + p.y * c }));
}

// Оболочка Эндрю (монотонная цепь) — для длинной оси минимального прямоугольника.
function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Угол в (-90, 90]: 100° и -80° — одна и та же ось, но подпись под 100° читается вверх ногами.
function readableAngle(deg: number): number {
  let a = ((deg % 180) + 180) % 180; // [0, 180)
  if (a > 90) a -= 180;
  return a === -90 ? 90 : a;
}

// Длинная ось минимального по площади описанного прямоугольника (вращающиеся штангенциркули по
// рёбрам оболочки). Это «вдоль чего лежит деталь» в том виде, в каком его понимает закройщик.
export function longAxisAngle(poly: readonly Pt[]): number {
  const hull = convexHull(poly);
  if (hull.length < 3) return 0;
  let bestArea = Infinity;
  let bestAngle = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const bb = polyBounds(rotatePoly(hull, -ang));
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    const area = w * h;
    if (area < bestArea) {
      bestArea = area;
      bestAngle = w >= h ? ang : ang + 90;
    }
  }
  return readableAngle(bestAngle);
}

// ——— сколько места есть внутри контура на высоте строки ————————————————————————————————

type Span = [number, number];

function rowSpans(poly: readonly Pt[], y: number): Span[] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  const out: Span[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

function intersectSpans(a: readonly Span[], b: readonly Span[]): Span[] {
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

const BAND_ROWS = 5;

// Полосы, свободные на ВСЕЙ высоте строки: пересечение сечений контура по пяти уровням полосы.
// Именно это и значит «место, которое реально есть внутри контура», в отличие от габарита.
function bandSpans(polyRot: readonly Pt[], yc: number, h: number): Span[] {
  let spans = rowSpans(polyRot, yc - h / 2);
  for (let i = 1; i < BAND_ROWS && spans.length > 0; i++) {
    spans = intersectSpans(spans, rowSpans(polyRot, yc - h / 2 + (h * i) / (BAND_ROWS - 1)));
  }
  return spans;
}

// ——— свободное место листа: для выносок ————————————————————————————————————————————————

type Obstacle = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  poly: readonly Pt[];
  key?: string | number;
};

// Занятость листа — деталями и уже поставленными выносными подписями. Растр не нужен: деталей
// десятки, а проверок на подпись — сотни, и bbox-отсев делает точную проверку редкой.
export class LabelSpace {
  private obstacles: Obstacle[] = [];
  constructor(
    private readonly bounds?: { minX: number; minY: number; maxX: number; maxY: number },
  ) {}

  // `key` — чтобы деталь могла проверить рамку своей подписи против ВСЕХ соседей, не спотыкаясь
  // о собственный контур.
  addPolygon(poly: readonly Pt[], key?: string | number): void {
    if (poly.length < 3) return;
    this.obstacles.push({ ...polyBounds(poly), poly, key });
  }

  reserve(box: LabelBox): void {
    this.addPolygon(boxCorners(box));
  }

  // `ignoreIfCovers` — точка своей детали (якорь подписи). Препятствие, которое эту точку
  // накрывает, лежит на детали САМО, и оберегать от него нечего: так нарисован чертёж, где все
  // размеры вложены друг в друга. А мелкая деталь, лежащая в ВЫРЕЗЕ крупной (ради чего проверка
  // и существует), чужого якоря не накрывает — эти два случая разделяются одной точкой.
  isFree(box: LabelBox, skipKey?: string | number, ignoreIfCovers?: Pt): boolean {
    const bb = polyBounds(boxCorners(box));
    if (this.bounds) {
      if (
        bb.minX < this.bounds.minX ||
        bb.maxX > this.bounds.maxX ||
        bb.minY < this.bounds.minY ||
        bb.maxY > this.bounds.maxY
      ) {
        return false;
      }
    }
    for (const o of this.obstacles) {
      if (skipKey !== undefined && o.key === skipKey) continue;
      if (bb.maxX < o.minX || bb.minX > o.maxX || bb.maxY < o.minY || bb.minY > o.maxY) continue;
      if (!boxHitsPoly(box, o.poly)) continue;
      if (ignoreIfCovers && pointInPolygon(ignoreIfCovers, o.poly)) continue;
      return false;
    }
    return true;
  }

  // Сколько препятствий задевает рамка (+ штраф за выход за лист). Нужно только запасному
  // варианту: когда свободного места нет вовсе, выбирается наименее плохое, а не «никакое».
  private cost(box: LabelBox): number {
    let n = 0;
    const bb = polyBounds(boxCorners(box));
    if (this.bounds) {
      if (
        bb.minX < this.bounds.minX ||
        bb.maxX > this.bounds.maxX ||
        bb.minY < this.bounds.minY ||
        bb.maxY > this.bounds.maxY
      ) {
        n += 100;
      }
    }
    for (const o of this.obstacles) {
      if (bb.maxX < o.minX || bb.minX > o.maxX || bb.maxY < o.minY || bb.minY > o.maxY) continue;
      if (boxHitsPoly(box, o.poly)) n++;
    }
    return n;
  }

  // Ближайшее свободное место под горизонтальную строку w×h. Кольцами наружу от `near`, чтобы
  // выноска получилась короткой: длинная линия через пол-листа сама по себе путает.
  //
  // bestEffort — «место обязано найтись»: маркер бывает плотным настолько, что свободного
  // прямоугольника на нём нет, и тогда наименее плохое место всё равно лучше, чем деталь без
  // имени или имя, брошенное в середину детали, куда оно не влезло.
  findSpot(w: number, h: number, near: Pt, startR: number, bestEffort = false): Pt | null {
    const rings = 7;
    const spokes = 24;
    let best: { pt: Pt; cost: number } | null = null;
    for (let ring = 0; ring < rings; ring++) {
      const r = startR * (1 + ring * 0.45) + h * 0.6;
      for (let k = 0; k < spokes; k++) {
        // Чередуем стороны от «вверх», чтобы выноска не всегда уходила вправо.
        const step = Math.ceil(k / 2) * (k % 2 === 0 ? 1 : -1);
        const a = Math.PI / 2 + (step * 2 * Math.PI) / spokes;
        const c = { x: near.x + r * Math.cos(a), y: near.y + r * Math.sin(a) };
        const box: LabelBox = { cx: c.x, cy: c.y, w, h, angleDeg: 0 };
        if (this.isFree(box)) return c;
        if (bestEffort) {
          // Ближние кольца при равном перекрытии предпочтительнее: выноска короче.
          const cost = this.cost(box) * 100 + ring;
          if (!best || cost < best.cost) best = { pt: c, cost };
        }
      }
    }
    return best?.pt ?? null;
  }
}

// ——— якорь и усечение —————————————————————————————————————————————————————————————————

// Куда ставить подпись. Центроид по площади у вогнутой детали (обтачка, «Г»-образная планка)
// попадает в её собственный вырез, поэтому есть откат: середина самой широкой строки контура.
export function labelAnchor(poly: readonly Pt[]): Pt {
  const bb = polyBounds(poly);
  const mid = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
  if (poly.length < 3) return mid;
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) > 1e-9) {
    const c = { x: cx / (3 * a2), y: cy / (3 * a2) };
    if (pointInPolygon(c, poly)) return c;
  }
  if (pointInPolygon(mid, poly)) return mid;
  // Ни центроид, ни центр bbox не внутри (подковообразная деталь): берём середину самого
  // широкого сечения — оно внутри по построению.
  let best: Pt = mid;
  let bestW = -1;
  for (let i = 1; i < 24; i++) {
    const y = bb.minY + ((bb.maxY - bb.minY) * i) / 24;
    for (const [x0, x1] of rowSpans(poly, y)) {
      if (x1 - x0 > bestW) {
        bestW = x1 - x0;
        best = { x: (x0 + x1) / 2, y };
      }
    }
  }
  return best;
}

const ELLIPSIS = '…';

// Кандидаты имени: полное, затем головы по СМЫСЛОВЫМ границам (BP_1_ПОДКЛАД → BP_1… → BP…),
// затем жёсткие обрезки. Голова важнее хвоста: по «BP_1…» деталь узнают, по «…ПОДКЛАД» нет.
function textCandidates(core: string, suffix: string): string[] {
  const heads: string[] = [];
  const push = (head: string) => {
    const h = head.replace(/[_\-\s./]+$/, '');
    if (h.length > 0 && h.length < core.length && !heads.includes(h + ELLIPSIS)) {
      heads.push(h + ELLIPSIS);
    }
  };
  // Границы токенов — сперва: «BP_1…» узнаётся, «BP_1_ПО…» узнаётся хуже при той же длине.
  for (let i = core.length - 1; i > 0; i--) {
    const ch = core[i];
    if (ch === '_' || ch === '-' || ch === ' ' || ch === '.' || ch === '/') push(core.slice(0, i));
  }
  // ПОЛ обрезки. «О…» — это не подпись, это деталь без подписи, которая выглядит подписанной, и
  // в плоттерном DXF у неё нет ни тултипа, ни другого способа узнать имя. Обрубок короче четырёх
  // знаков хуже выноски с полным именем, поэтому ниже пола кандидатов просто нет — и подбор
  // доходит до выноски вместо того, чтобы удовлетвориться огрызком.
  for (const n of [12, 10, 8, 6, 4]) push(core.slice(0, n));
  // Длинное раньше короткого: терять буквы имеет смысл только по одной ступени за раз. Сорт
  // устойчив, поэтому при равной длине граница токена всё ещё впереди жёсткой обрезки.
  heads.sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const s of [core + suffix, core, ...heads]) if (s && !out.includes(s)) out.push(s);
  // ПОРЯДОК ВАЖЕН, и он не тот, что кажется: перебор идёт «текст → кегль», значит вариант с
  // суффиксом успевает опуститься до самого мелкого кегля прежде, чем очередь дойдёт до варианта
  // без суффикса. «ПОЯС_ВЕРХНИЙ ×2 (180°)» на 1.46 см вместо «ПОЯС_ВЕРХНИЙ» на 2.8 см — половинный
  // текст на раскройном столе, да ещё и с последующим съеданием суффикса обрезкой, так что метка
  // разворота исчезала совсем. Выбор между «суффикс» и «крупнее» разрешается в пользу крупного:
  // ×2 повторяется в списке деталей, а нечитаемое имя не восстановить ничем.
  return out.slice(0, 12);
}

// ——— собственно подбор ————————————————————————————————————————————————————————————————

export type PlanLabelOptions = {
  // Контур детали в той же системе, в которой будет рисоваться подпись (Y вверх).
  poly: readonly Pt[];
  // Имя детали.
  text: string;
  // Необязательный хвост («×2», «(90°)»): отбрасывается ПЕРВЫМ, раньше кегля и раньше имени.
  suffix?: string;
  fontMaxCm: number;
  fontMinCm: number;
  // Угол долевой, если он известен. null — считать длинную ось.
  preferredAngleDeg?: number | null;
  // Занятость листа: нужна для выноски, а заодно ловит случай «мелкая деталь лежит в ВЫРЕЗЕ
  // крупной» — `poly` это только наружный контур, и «внутри своего контура» там мало.
  // Без неё подпись, которая никуда не влезла, ставится в якорь (лучше не идеально, чем молча
  // без имени).
  space?: LabelSpace;
  // Ключ собственного контура в `space` — иначе деталь спотыкалась бы о саму себя.
  selfKey?: string | number;
};

const SIZE_STEPS = 5;

export function planLabel(o: PlanLabelOptions): LabelPlan {
  const core = o.text.trim();
  const full = (core + (o.suffix ?? '')).trim();
  const anchor = labelAnchor(o.poly);
  const bb = polyBounds(o.poly);
  const pieceR = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2;

  const angles: number[] = [];
  const pushAngle = (a: number) => {
    const r = readableAngle(a);
    if (!angles.some((x) => Math.abs(x - r) < 0.5)) angles.push(r);
  };
  // 0 первым: крупной детали ни к чему разворачивать имя ради красоты — горизонтальная строка
  // читается быстрее всего. Поворот включается ровно тогда, когда горизонталь не влезла.
  pushAngle(0);
  if (o.preferredAngleDeg != null && Number.isFinite(o.preferredAngleDeg))
    pushAngle(o.preferredAngleDeg);
  pushAngle(longAxisAngle(o.poly));

  const sizes: number[] = [];
  const lo = Math.min(o.fontMinCm, o.fontMaxCm);
  const hi = Math.max(o.fontMinCm, o.fontMaxCm);
  for (let i = 0; i < SIZE_STEPS; i++) {
    sizes.push(hi * Math.pow(lo / hi, i / (SIZE_STEPS - 1)));
  }

  // Имя из одних пробелов даёт пустой список кандидатов, и последняя строка функции падает на
  // undefined.length — прямо посреди прогона в renderLayoutSvg или при скачивании DXF, молча.
  // Вызывающие фильтруют по `!text`, что пропускает '   ', а имена блоков берутся из DXF как есть.
  const texts = textCandidates(core, o.suffix ?? '');
  if (texts.length === 0) texts.push('?');

  // Кэши: поворот контура и «где полоса шире всего» считаются по одному разу на угол, а не на
  // каждую пару (кегль, имя) — иначе живое превью раскладки платило бы за это каждым кадром.
  const rotCache = new Map<number, Pt[]>();
  const anchorCache = new Map<number, Pt>();
  const ysCache = new Map<number, number[]>();
  const polyAt = (a: number) => {
    let p = rotCache.get(a);
    if (!p) {
      p = rotatePoly(o.poly, -a);
      rotCache.set(a, p);
    }
    return p;
  };
  const anchorAt = (a: number) => {
    let p = anchorCache.get(a);
    if (!p) {
      p = rotatePt(anchor, -a);
      anchorCache.set(a, p);
    }
    return p;
  };
  const ysAt = (a: number) => {
    let ys = ysCache.get(a);
    if (!ys) {
      const rb = polyBounds(polyAt(a));
      const scored: Array<{ y: number; w: number }> = [];
      for (let i = 1; i < 12; i++) {
        const y = rb.minY + ((rb.maxY - rb.minY) * i) / 12;
        let w = 0;
        for (const [x0, x1] of rowSpans(polyAt(a), y)) w = Math.max(w, x1 - x0);
        scored.push({ y, w });
      }
      scored.sort((p, q) => q.w - p.w);
      // Якорь первым — подпись должна тяготеть к визуальному центру детали; широкие сечения
      // это запасной вариант для «Г»-образных и клиновидных.
      ys = [anchorAt(a).y, ...scored.slice(0, 2).map((s) => s.y)];
      ysCache.set(a, ys);
    }
    return ys;
  };

  const obstacleHit = (box: LabelBox) =>
    o.space ? !o.space.isFree(box, o.selfKey, anchor) : false;

  // Кегль ВНЕШНИМ циклом, текст внутренним: «крупнее, но короче» лучше, чем «полностью, но
  // вполовину мельче». При обратном порядке вариант с суффиксом успевал спуститься на самый
  // мелкий кегль раньше, чем очередь доходила до варианта без суффикса, — и на раскройный стол
  // уезжал половинный текст.
  for (const fontCm of sizes) {
    for (const text of texts) {
      const { w, h } = labelBoxSize(text, fontCm);
      for (const a of angles) {
        const pr = polyAt(a);
        const ar = anchorAt(a);
        for (const yc of ysAt(a)) {
          const spans = bandSpans(pr, yc, h);
          if (spans.length === 0) continue;
          // Полоса, куда попадает якорь; иначе — ближайшая достаточно широкая.
          let pick: Span | null = null;
          let pickD = Infinity;
          for (const s of spans) {
            if (s[1] - s[0] < w) continue;
            const d = ar.x < s[0] ? s[0] - ar.x : ar.x > s[1] ? ar.x - s[1] : 0;
            if (d < pickD) {
              pickD = d;
              pick = s;
            }
          }
          if (!pick) continue;
          const cx = Math.min(Math.max(ar.x, pick[0] + w / 2), pick[1] - w / 2);
          if (!rectInsidePoly(cx - w / 2, yc - h / 2, cx + w / 2, yc + h / 2, pr)) continue;
          const c = rotatePt({ x: cx, y: yc }, a);
          const box: LabelBox = { cx: c.x, cy: c.y, w, h, angleDeg: a };
          if (obstacleHit(box)) continue;
          return {
            text,
            full,
            truncated: text !== full,
            fontCm,
            angleDeg: a,
            x: c.x,
            y: c.y,
            box,
            fitted: true,
          };
        }
      }
    }
  }

  // Не влезло вовсе — выноска. Подпись уходит в свободное место ГОРИЗОНТАЛЬНО (у выноски нет
  // причин повторять наклон детали) и предпочитает полное имя: место там есть.
  const fontCm = Math.max(o.fontMinCm, Math.min(o.fontMaxCm, o.fontMinCm * 1.15));
  if (o.space) {
    // Сперва по-честному: самое длинное имя, которому нашлось СВОБОДНОЕ место. Если свободного
    // нет вовсе (очень плотный маркер) — самое короткое имя в наименее плохое место, но всё
    // равно выноской: связь «имя ↔ деталь» держит линия, а не близость.
    for (let ti = 0; ti < texts.length; ti++) {
      const text = texts[ti];
      const bestEffort = ti === texts.length - 1;
      const { w, h } = labelBoxSize(text, fontCm);
      const spot = o.space.findSpot(w, h, anchor, pieceR, bestEffort);
      if (!spot) continue;
      const box: LabelBox = { cx: spot.x, cy: spot.y, w, h, angleDeg: 0 };
      o.space.reserve(box);
      const to = boxEdgeToward(box, anchor);
      return {
        text,
        full,
        truncated: text !== full,
        fontCm,
        angleDeg: 0,
        x: spot.x,
        y: spot.y,
        box,
        fitted: false,
        leader: { dotX: anchor.x, dotY: anchor.y, toX: to.x, toY: to.y },
      };
    }
  }

  // Совсем без сведений о листе (space не передан): самое короткое имя в якорь — имя рядом с
  // деталью честнее, чем деталь без имени.
  const text = texts[texts.length - 1];
  const { w, h } = labelBoxSize(text, fontCm);
  return {
    text,
    full,
    truncated: text !== full,
    fontCm,
    angleDeg: 0,
    x: anchor.x,
    y: anchor.y,
    box: { cx: anchor.x, cy: anchor.y, w, h, angleDeg: 0 },
    fitted: false,
  };
}

// Точка на границе рамки в сторону детали — чтобы линия выноски не заходила под буквы.
function boxEdgeToward(box: LabelBox, from: Pt): Pt {
  const dx = from.x - box.cx;
  const dy = from.y - box.cy;
  if (dx === 0 && dy === 0) return { x: box.cx, y: box.cy };
  const tx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: box.cx + dx * t, y: box.cy + dy * t };
}

// ——— раскладка: один план на SVG и на DXF ——————————————————————————————————————————————

export type LayoutLabel = { placement: Placement; piece: PieceDTO; poly: Pt[]; plan: LabelPlan };

// Подписи всей раскладки. Вызывается и из SVG (превью + экспорт), и из плоттерного DXF, на
// ОДНОЙ геометрии (истинные контуры, не упрощённые для превью) — иначе экран и плоттер
// разошлись бы ровно там, где это дороже всего заметить.
export function planLayoutLabels(
  result: NestResult,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
): LayoutLabel[] {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const font = layoutFontRange(fabricWidthCm);
  const space = new LabelSpace({
    minX: 0,
    minY: 0,
    maxX: Math.max(result.usedLengthCm, 1),
    maxY: fabricWidthCm,
  });

  const items: Array<{ placement: Placement; piece: PieceDTO; poly: Pt[] }> = [];
  for (const pl of result.placements) {
    const dto = byId.get(pl.pieceId);
    if (!dto) continue;
    const poly = placedPoly(dto.poly, pl);
    items.push({ placement: pl, piece: dto, poly });
    space.addPolygon(poly, `${pl.pieceId}|${pl.instance}`);
  }

  // Крупные первыми: у мелких деталей больше шансов уйти на выноску, и пусть они занимают
  // свободное место после того, как крупные разобрали своё.
  const order = [...items].sort((a, b) => b.piece.areaCm2 - a.piece.areaCm2);
  const out: LayoutLabel[] = [];
  for (const it of order) {
    // Долевая после ориентации лежит вдоль +X СВОЕЙ детали (см. geom/grain-orient.ts), значит
    // на полосе она под углом поворота. Определить, была ли деталь развёрнута, можно по тому,
    // что ориентация снимает у неё и долевую, и координаты чертежа.
    // Зеркало на угол долевой не влияет: M меняет направление +X на обратное, но ОСЬ оставляет
    // ту же, а подпись читается по оси (readableAngle приводит угол к (-90, 90]).
    const oriented = it.piece.grain == null && it.piece.originX == null;
    const grainDeg = oriented ? (it.placement.rot % 180 === 0 ? 0 : 90) : null;
    // Пометка зеркала в хвосте имени. Не она делает крой правильным — режут по контуру, а он уже
    // отражён, — но левая и правая полочки на маркере отличаются только хиральностью, и человеку,
    // сверяющему раскладку с комплектом кроя, нужно уметь сказать какая где. Хвост отбрасывается
    // первым при нехватке места (см. textCandidates): читаемое имя важнее пометки.
    const marks = [
      it.placement.rot ? `${it.placement.rot}°` : '',
      it.placement.flipped ? 'зеркало' : '',
    ].filter(Boolean);
    const plan = planLabel({
      poly: it.poly,
      text: it.piece.name,
      suffix:
        (it.placement.instance > 0 ? ` ×${it.placement.instance + 1}` : '') +
        (marks.length > 0 ? ` (${marks.join(', ')})` : ''),
      fontMaxCm: font.max,
      fontMinCm: font.min,
      preferredAngleDeg: grainDeg,
      space,
      selfKey: `${it.placement.pieceId}|${it.placement.instance}`,
    });
    out.push({ ...it, plan });
  }
  return out;
}
