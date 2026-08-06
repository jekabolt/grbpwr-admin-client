// Наружный эквидистантный офсет контура — ПРИПУСК НА ШОВ.
//
// Зачем вообще: градуированный контур в лекальном DXF (слой 14 в реальных файлах) — это ЛИНИЯ
// ШВА, чистый силуэт готовой детали. Кроят по ЛИНИИ КРОЯ, то есть по линии шва плюс припуск со
// всех сторон. Раскладка, посчитанная по линии шва, занижает расход: цех вырезает детали
// больше, чем заложено, и ткани не хватает.
//
// ПОЧЕМУ СВОЯ РЕАЛИЗАЦИЯ, А НЕ Clipper.InflatePaths. Померено на квадрате 10×10 с d=1 см, где
// правильный ответ известен аналитически (bbox 12×12, площадь 100 + 4·10·1 + π ≈ 143.14):
//   JoinType.Round → площадь 122.356, bbox [-1,-1 .. 11,11]
//   JoinType.Miter → площадь 121.000  (= 11²), bbox [-1,-1 .. 10,11]
// Miter раздул только часть сторон, Round промахнулся на 15%. Той же поломкой clipper2-js уже
// известен в этом проекте (см. geom/clipper.ts и nest/nfp.ts): InflatePaths и MinkowskiDiff
// численно сломаны, а Union умеет «выкусывать» заливы и соглашаться сам с собой при проверке.
// Поэтому здесь НЕТ НИ ОДНОЙ булевой операции чужой библиотеки.
//
// АЛГОРИТМ. Сумма Минковского простого CCW-многоугольника P с правильным k-угольником K
// радиуса d, посчитанная через «сырой офсет + внешняя грань планарного разбиения»:
//   1. Сырой офсет: каждое ребро сдвигается наружу на d, выпуклый угол заполняется веером дуги
//      (вершины ЛЕЖАТ на окружности радиуса d — k-угольник вписан, то есть офсет всегда чуть
//      МЕНЬШЕ круглого, и площадь сходится к аналитической СНИЗУ); вогнутый угол сводится в
//      МИТРУ — точную точку пересечения двух сдвинутых прямых.
//   2. Внешняя грань. Все петли самопересечения у НАРУЖНОГО офсета лежат ВНУТРИ P ⊕ K, а сама
//      кривая целиком лежит в замыкании P ⊕ K, поэтому неограниченная грань разбиения — это в
//      точности дополнение к P ⊕ K, а её граница — искомый контур кроя. Обход границы обычный:
//      старт из лексикографически минимальной вершины, дальше на каждом узле берётся первое
//      ребро по часовой стрелке от входящего.
//
// ПОЧЕМУ МИТРА, А НЕ ХОРДА, В ВОГНУТОМ УГЛУ. Хорда между концами двух сдвинутых рёбер — это
// «честный» сырой офсет, и на бумаге разбиение снимает получившуюся петлю. На реальных лекалах
// оно рассыпается: контур детали — тесселированная кривая, где вогнутый поворот составляет
// доли градуса, и петля у такого угла имеет размер долей МИКРОНА. После округления на решётку
// Q она вырождается, ребра становятся коллинеарными, порядок рёбер вокруг узла инвертируется —
// и обход сваливается во внутреннюю грань. Померено: у панели BP_XS из «summer men.dxf» (112
// вершин, 105 вогнутых поворотов) обход замыкался на площади 0.0003 см² вместо 740, и так на
// 44 деталях из 45. Митра убирает саму петлю: у пологого поворота она И ЕСТЬ точная граница
// суммы Минковского. Ограничение MITER_LIMIT отсекает только по-настоящему острые вогнутые
// углы (> 120°), где выброс митры был бы велик, — там снова хорда, и петля там КРУПНАЯ, то
// есть разбиению хорошо обусловлена.
// Единственное сознательное огрубление: если P ⊕ K оказалась с дыркой (узкая «подкова», у
// которой концы сходятся ближе 2d), дырка заливается — контур детали в этой модели один, и
// залить дырку значит попросить БОЛЬШЕ ткани, а не меньше.
//
// Ошибка вычислений — только в округлении координат до целых микрометров (Q ниже); все
// предикаты пересечения на этой решётке точные (произведения не выходят за 2^53).
import type { Pt } from '../types';
import { convexHull } from './convex';
import { ensureCCW, signedArea, stripDegenerate } from './polygon';

// Целых единиц на сантиметр: 1 мкм. Та же решётка, что у geom/clipper.SCALE, — заведомо ниже
// раскройного допуска и достаточно грубая, чтобы произведения разностей (≤ 4e6 при листе в
// 400 см) оставались точными в double.
const Q = 10_000;

// Сколько сегментов на полный оборот в веере выпуклого угла. 32 → сагитта хорды d·(1−cos(π/32))
// = 0.0048·d: при припуске 1 см это 0.05 мм, вчетверо ниже допуска тесселяции дуг парсера.
export const DEFAULT_ARC_SEGMENTS = 32;

// Во сколько раз митра вогнутого угла может отойти от вершины дальше, чем на припуск. 2 —
// поворот до 120°; дальше угол срезается хордой.
const MITER_LIMIT = 2;

export type OffsetOutcome = {
  poly: Pt[];
  // true — обход внешней грани не удался и контур заменён выпуклой оболочкой сырого офсета.
  // Оболочка ВСЕГДА накрывает истинный офсет, то есть деталь считается с запасом; занизить
  // расход этот путь не может по построению.
  fallback: boolean;
  // Почему обход не сошёлся — для диагностики; '' при успехе, 'none' когда офсета не было.
  reason: '' | 'none' | 'raw-degenerate' | 'open-walk' | 'short-loop' | 'not-larger';
};

export function offsetOutward(
  poly: readonly Pt[],
  dCm: number,
  arcSegments = DEFAULT_ARC_SEGMENTS,
): OffsetOutcome {
  if (!(dCm > 0) || poly.length < 3) return { poly: [...poly], fallback: false, reason: 'none' };
  const src = ensureCCW(stripDegenerate(poly, 1e-4));
  if (src.length < 3) return { poly: [...poly], fallback: false, reason: 'none' };

  const raw = rawOffsetLoop(src, dCm, arcSegments);
  let reason: OffsetOutcome['reason'] = 'raw-degenerate';
  if (raw.length >= 3) {
    const traced = traceOuterFace(raw);
    if (!traced) reason = 'open-walk';
    else if (traced.length < 3) reason = 'short-loop';
    // Офсет наружу обязан быть СТРОГО больше исходника — иначе обход ушёл не на ту грань.
    else if (signedArea(traced) <= signedArea(src)) reason = 'not-larger';
    else return { poly: traced, fallback: false, reason: '' };
  }
  const hull = convexHull(raw);
  return { poly: hull.length >= 3 ? hull : [...poly], fallback: hull.length >= 3, reason };
}

// Сырой (возможно самопересекающийся) офсет, вершина за вершиной: выпуклый угол — веер по
// дуге, вогнутый — митра (или хорда за пределом митры).
function rawOffsetLoop(src: readonly Pt[], d: number, arcSegments: number): Pt[] {
  const n = src.length;
  const step = (2 * Math.PI) / Math.max(4, Math.round(arcSegments));
  // Наружная нормаль ребра i (CCW-контур: внутренность слева по ходу, значит нормаль справа).
  const nrm: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const el = Math.hypot(ex, ey);
    nrm[i] = el < 1e-12 ? { x: 0, y: 0 } : { x: ey / el, y: -ex / el };
  }
  // Порог на скалярное произведение нормалей, за которым митра длиннее MITER_LIMIT·d.
  const minDot = 2 / (MITER_LIMIT * MITER_LIMIT) - 1;

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v = src[i];
    const np = nrm[(i - 1 + n) % n]; // нормаль входящего ребра
    const nn = nrm[i]; // нормаль исходящего
    if ((np.x === 0 && np.y === 0) || (nn.x === 0 && nn.y === 0)) continue;
    const cross = np.x * nn.y - np.y * nn.x; // >0 — выпукло (нормаль повернула влево)
    const dot = np.x * nn.x + np.y * nn.y;
    if (cross > 0) {
      out.push({ x: v.x + d * np.x, y: v.y + d * np.y });
      const a0 = Math.atan2(np.y, np.x);
      const a1 = Math.atan2(nn.y, nn.x);
      let sweep = a1 - a0;
      while (sweep < 0) sweep += 2 * Math.PI;
      while (sweep >= 2 * Math.PI) sweep -= 2 * Math.PI;
      const steps = Math.ceil(sweep / step);
      for (let j = 1; j < steps; j++) {
        const ang = a0 + (sweep * j) / steps;
        out.push({ x: v.x + d * Math.cos(ang), y: v.y + d * Math.sin(ang) });
      }
      out.push({ x: v.x + d * nn.x, y: v.y + d * nn.y });
    } else if (dot >= minDot && 1 + dot > 1e-9) {
      // Митра: точка на расстоянии d от ОБЕИХ сдвинутых прямых, ровно одна вершина.
      const k = d / (1 + dot);
      out.push({ x: v.x + k * (np.x + nn.x), y: v.y + k * (np.y + nn.y) });
    } else {
      // Слишком острый вогнутый угол — хорда; петлю снимет обход внешней грани.
      out.push({ x: v.x + d * np.x, y: v.y + d * np.y });
      out.push({ x: v.x + d * nn.x, y: v.y + d * nn.y });
    }
  }
  return out;
}

type INode = { x: number; y: number };

// Граница неограниченной грани планарного разбиения замкнутой ломаной, в CCW.
function traceOuterFace(rawPts: readonly Pt[]): Pt[] | null {
  // Координаты в файле абсолютные чертёжные (метры от начала листа) — считаем в СОБСТВЕННОЙ
  // системе кривой, чтобы целые произведения в предикатах пересечения оставались маленькими.
  let ox = Infinity;
  let oy = Infinity;
  for (const p of rawPts) {
    if (p.x < ox) ox = p.x;
    if (p.y < oy) oy = p.y;
  }
  // Квантование на решётку + схлопывание совпавших соседей (и стыка).
  const P: INode[] = [];
  for (const p of rawPts) {
    const x = Math.round((p.x - ox) * Q);
    const y = Math.round((p.y - oy) * Q);
    const last = P[P.length - 1];
    if (last && last.x === x && last.y === y) continue;
    P.push({ x, y });
  }
  while (P.length > 1) {
    const f = P[0];
    const l = P[P.length - 1];
    if (f.x === l.x && f.y === l.y) P.pop();
    else break;
  }
  const m = P.length;
  if (m < 3) return null;

  // Точки разбиения каждого отрезка, кроме его собственных концов (они и так узлы).
  const splits: Array<Array<{ t: number; x: number; y: number }>> = [];
  for (let i = 0; i < m; i++) splits.push([]);

  // Отсечение по bbox с предварительной сортировкой по minX: заметающая прямая превращает
  // квадратичный перебор в почти линейный на реальных контурах (сотни-тысячи отрезков).
  const segMinX = new Float64Array(m);
  const segMaxX = new Float64Array(m);
  const segMinY = new Float64Array(m);
  const segMaxY = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const a = P[i];
    const b = P[(i + 1) % m];
    segMinX[i] = Math.min(a.x, b.x);
    segMaxX[i] = Math.max(a.x, b.x);
    segMinY[i] = Math.min(a.y, b.y);
    segMaxY[i] = Math.max(a.y, b.y);
  }
  const ord: number[] = [];
  for (let i = 0; i < m; i++) ord.push(i);
  ord.sort((i, j) => segMinX[i] - segMinX[j]);

  const EPS_T = 1e-9;
  for (let oi = 0; oi < m; oi++) {
    const i = ord[oi];
    for (let oj = oi + 1; oj < m; oj++) {
      const j = ord[oj];
      if (segMinX[j] > segMaxX[i]) break; // заметание: дальше по X только правее
      if (segMinY[j] > segMaxY[i] || segMaxY[j] < segMinY[i]) continue;
      const p1 = P[i];
      const p2 = P[(i + 1) % m];
      const q1 = P[j];
      const q2 = P[(j + 1) % m];
      const rx = p2.x - p1.x;
      const ry = p2.y - p1.y;
      const sx = q2.x - q1.x;
      const sy = q2.y - q1.y;
      const denom = rx * sy - ry * sx;
      const qpx = q1.x - p1.x;
      const qpy = q1.y - p1.y;
      if (denom !== 0) {
        const t = (qpx * sy - qpy * sx) / denom;
        const u = (qpx * ry - qpy * rx) / denom;
        if (t < -EPS_T || t > 1 + EPS_T || u < -EPS_T || u > 1 + EPS_T) continue;
        // Точка считается ОДИН раз и кладётся на оба отрезка одними и теми же целыми
        // координатами — иначе два независимых округления развели бы узел надвое и обход
        // порвался бы ровно там, где кривая пересекает сама себя.
        const x = Math.round(p1.x + t * rx);
        const y = Math.round(p1.y + t * ry);
        if (t > EPS_T && t < 1 - EPS_T) splits[i].push({ t, x, y });
        if (u > EPS_T && u < 1 - EPS_T) splits[j].push({ t: u, x, y });
      } else {
        // Коллинеарное наложение: концы одного отрезка становятся узлами другого. Тест на
        // коллинеарность точный (целые координаты), сами точки — уже существующие узлы.
        if (qpx * ry - qpy * rx !== 0) continue;
        const r2 = rx * rx + ry * ry;
        if (r2 > 0) {
          for (const e of [q1, q2]) {
            const t = ((e.x - p1.x) * rx + (e.y - p1.y) * ry) / r2;
            if (t > EPS_T && t < 1 - EPS_T) splits[i].push({ t, x: e.x, y: e.y });
          }
        }
        const s2 = sx * sx + sy * sy;
        if (s2 > 0) {
          for (const e of [p1, p2]) {
            const t = ((e.x - q1.x) * sx + (e.y - q1.y) * sy) / s2;
            if (t > EPS_T && t < 1 - EPS_T) splits[j].push({ t, x: e.x, y: e.y });
          }
        }
      }
    }
  }

  // Узлы + рёбра (неориентированные, дедуплицированные).
  const nodeId = new Map<string, number>();
  const nodes: INode[] = [];
  const idOf = (x: number, y: number): number => {
    const k = `${x},${y}`;
    let id = nodeId.get(k);
    if (id == null) {
      id = nodes.length;
      nodes.push({ x, y });
      nodeId.set(k, id);
    }
    return id;
  };
  const adj: number[][] = [];
  const edgeSeen = new Set<string>();
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    while (adj.length < nodes.length) adj.push([]);
    adj[a].push(b);
    adj[b].push(a);
  };
  for (let i = 0; i < m; i++) {
    const chain: number[] = [idOf(P[i].x, P[i].y)];
    const list = splits[i];
    if (list.length > 0) {
      list.sort((a, b) => a.t - b.t);
      for (const s of list) chain.push(idOf(s.x, s.y));
    }
    chain.push(idOf(P[(i + 1) % m].x, P[(i + 1) % m].y));
    while (adj.length < nodes.length) adj.push([]);
    for (let k = 0; k + 1 < chain.length; k++) addEdge(chain[k], chain[k + 1]);
  }
  while (adj.length < nodes.length) adj.push([]);
  if (nodes.length < 3) return null;

  // Обходится НЕОГРАНИЧЕННАЯ грань, а не «та, что слева от первого ребра». Разница
  // принципиальная: сырая кривая режет внутренность области на несколько граней (хорда в
  // вогнутом углу — внутренний отрезок), и обход ближайшей внутренней грани возвращает
  // огрызок. Проверено независимым оракулом на L-образной детали: обход внутренней грани
  // срезал вогнутый угол на 0.95 см при припуске 1 см.
  //
  // Старт — лексикографический минимум (заведомо на внешней границе); первое ребро — с
  // НАИБОЛЬШИМ полярным углом (все соседи лежат в полуплоскости x ≥ x0, так что верхнее ребро
  // — то, слева от которого лежит внешность). Дальше грань обходится по часовой стрелке
  // вокруг детали, и в конце петля разворачивается в CCW.
  let start = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].x < nodes[start].x || (nodes[i].x === nodes[start].x && nodes[i].y < nodes[start].y)) {
      start = i;
    }
  }
  if (adj[start].length === 0) return null;
  let first = -1;
  let firstAng = -Infinity;
  for (const w of adj[start]) {
    const ang = Math.atan2(nodes[w].y - nodes[start].y, nodes[w].x - nodes[start].x);
    if (ang > firstAng) {
      firstAng = ang;
      first = w;
    }
  }
  if (first < 0) return null;

  // Следующее ребро грани: первое ПО ЧАСОВОЙ СТРЕЛКЕ от направления «назад». Так внутренность
  // грани всё время остаётся слева, а разворот назад (delta = 0 → 2π) берётся лишь как
  // последнее средство в тупике.
  const nextEdge = (prev: number, cur: number): number => {
    const base = Math.atan2(nodes[prev].y - nodes[cur].y, nodes[prev].x - nodes[cur].x);
    let best = -1;
    let bestDelta = Infinity;
    for (const w of adj[cur]) {
      const ang = Math.atan2(nodes[w].y - nodes[cur].y, nodes[w].x - nodes[cur].x);
      let delta = base - ang;
      while (delta <= 1e-12) delta += 2 * Math.PI;
      while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
      if (delta < bestDelta) {
        bestDelta = delta;
        best = w;
      }
    }
    return best;
  };

  const maxSteps = 4 * edgeSeen.size + 16;
  const loopIdx: number[] = [start];
  let prev = start;
  let cur = first;
  for (let guard = 0; guard <= maxSteps; guard++) {
    const nxt = nextEdge(prev, cur);
    if (nxt < 0) return null;
    if (cur === start && nxt === first) {
      return toCm(loopIdx, nodes, ox, oy);
    }
    loopIdx.push(cur);
    prev = cur;
    cur = nxt;
  }
  return null;
}

function toCm(loopIdx: readonly number[], nodes: readonly INode[], ox: number, oy: number): Pt[] | null {
  const pts: Pt[] = [];
  // Внешняя грань обойдена по часовой стрелке (внешность слева) — деталь наружу отдаётся CCW,
  // как её ждёт весь остальной конвейер раскладки.
  for (let k = loopIdx.length - 1; k >= 0; k--) {
    const n = nodes[loopIdx[k]];
    const p = { x: n.x / Q + ox, y: n.y / Q + oy };
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    pts.push(p);
  }
  if (pts.length >= 2) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f.x === l.x && f.y === l.y) pts.pop();
  }
  return pts.length >= 3 ? dropCollinear(pts) : null;
}

// Схлопывание коллинеарных пробегов. Порог — 0.1 мкм отклонения от хорды, то есть на порядок
// ниже решётки: выброшенная вершина не двигает контур, а вершин на офсете вдвое больше, чем на
// исходнике (по две на ребро), и каждая из них потом стоит времени в проверке зазоров.
function dropCollinear(pts: readonly Pt[]): Pt[] {
  const n = pts.length;
  if (n <= 3) return [...pts];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = out.length > 0 ? out[out.length - 1] : pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len > 1e-12 && Math.abs(cross) / len < 1e-5 && out.length > 0 && i < n - 1) continue;
    out.push(b);
  }
  return out.length >= 3 ? out : [...pts];
}
