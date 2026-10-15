// Углы контура и длины сторон между ними — для точек-вершин и подписей «sizes» на листе.
//
// Контур из DXF — плотная ломаная: кривая пройма приходит сотней точек. Рисовать точку на
// каждой — получится жирная линия, поэтому вершиной считается только настоящий излом:
//   • поворот касательной, измеренный на дуге ±TANGENT_ARM_CM, больше CORNER_TURN_DEG (на
//     плавной кривой радиуса 5 см это ~18°, на угле детали — весь угол);
//   • концы длинного прямого участка (≥ STRAIGHT_RUN_CM) — там прямая переходит в кривую, и
//     лекальщик меряет сторону именно от этой точки.
// Длина стороны — ДЛИНА ДУГИ между соседними вершинами, а не хорда: пройму меряют по кривой.
//
// Кэш по массиву poly (WeakMap): деталь живёт тем же объектом между рендерами и между листами,
// а на листе бывает 50+ деталей.
import type { Pt } from 'lib/nesting/types';

const TANGENT_ARM_CM = 0.8;
const CORNER_TURN_DEG = 20;
const SUPPRESS_CM = 1.5;
const STRAIGHT_RUN_CM = 6;
const STRAIGHT_DEV_DEG = 2.5;
const MAX_CORNERS = 48;

export type OutlineEdge = {
  lenCm: number;
  // Середина дуги и касательная там — в координатах контура (Y вверх, как в poly).
  mid: Pt;
  tx: number;
  ty: number;
  // Единичная нормаль ВНУТРЬ детали.
  nx: number;
  ny: number;
};
export type OutlineGeo = { corners: Pt[]; edges: OutlineEdge[] };

const EMPTY: OutlineGeo = { corners: [], edges: [] };
const cache = new WeakMap<readonly Pt[], OutlineGeo>();

export function outlineGeo(poly: readonly Pt[]): OutlineGeo {
  const hit = cache.get(poly);
  if (hit) return hit;
  const out = compute(poly);
  cache.set(poly, out);
  return out;
}

function compute(poly: readonly Pt[]): OutlineGeo {
  const pts: Pt[] = [];
  for (const p of poly) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push(p);
  }
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 1e-6) pts.pop();
  }
  const n = pts.length;
  if (n < 3) return EMPTY;

  // s[i] — дуга от точки 0 до точки i; seg[i] — длина отрезка i → i+1.
  const seg = new Array<number>(n);
  const s = new Array<number>(n);
  let P = 0;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    s[i] = P;
    seg[i] = Math.hypot(b.x - a.x, b.y - a.y);
    P += seg[i];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (P <= 0) return EMPTY;
  const inSign = area2 >= 0 ? 1 : -1; // CCW → внутренность слева

  // Точка на дуге по абсолютной позиции (по модулю периметра).
  const at = (pos: number): { p: Pt; tx: number; ty: number } => {
    let u = ((pos % P) + P) % P;
    // бинарный поиск отрезка
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= u) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = seg[i] || 1;
    u = Math.min(Math.max((u - s[i]) / L, 0), 1);
    return {
      p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
      tx: (b.x - a.x) / L,
      ty: (b.y - a.y) / L,
    };
  };

  const arm = Math.min(TANGENT_ARM_CM, P / 8);
  const turnAt = (i: number) => {
    const c = pts[i];
    const back = at(s[i] - arm).p;
    const fwd = at(s[i] + arm).p;
    const ax = c.x - back.x;
    const ay = c.y - back.y;
    const bx = fwd.x - c.x;
    const by = fwd.y - c.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return 0;
    const cos = (ax * bx + ay * by) / (la * lb);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };

  type Cand = { i: number; score: number };
  const cands: Cand[] = [];
  for (let i = 0; i < n; i++) {
    const t = turnAt(i);
    if (t > CORNER_TURN_DEG) cands.push({ i, score: t });
  }

  // Концы длинных прямых. Начинаем обход с самого резкого угла, чтобы прямая не разрезалась
  // точкой 0 пополам.
  const start = cands.length ? cands.reduce((m, c) => (c.score > m.score ? c : m)).i : 0;
  const dirOf = (i: number) => {
    const a = pts[i % n];
    const b = pts[(i + 1) % n];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const devLimit = (STRAIGHT_DEV_DEG * Math.PI) / 180;
  let k = 0;
  while (k < n) {
    const i0 = start + k;
    const d0 = dirOf(i0);
    let len = seg[i0 % n];
    let j = k + 1;
    while (j < n) {
      let dd = Math.abs(dirOf(start + j) - d0);
      if (dd > Math.PI) dd = 2 * Math.PI - dd;
      if (dd > devLimit) break;
      len += seg[(start + j) % n];
      j++;
    }
    if (len >= STRAIGHT_RUN_CM) {
      cands.push({ i: i0 % n, score: CORNER_TURN_DEG });
      cands.push({ i: (start + j) % n, score: CORNER_TURN_DEG });
    }
    k = j;
  }

  // Подавление соседей: в окне SUPPRESS_CM по дуге остаётся самый резкий.
  cands.sort((a, b) => b.score - a.score);
  const kept: number[] = [];
  const arcDist = (a: number, b: number) => {
    const d = Math.abs(s[a] - s[b]);
    return Math.min(d, P - d);
  };
  for (const c of cands) {
    if (kept.length >= MAX_CORNERS) break;
    if (kept.some((q) => q === c.i || arcDist(q, c.i) < SUPPRESS_CM)) continue;
    kept.push(c.i);
  }
  kept.sort((a, b) => a - b);
  const corners = kept.map((i) => pts[i]);

  const edges: OutlineEdge[] = [];
  if (kept.length >= 2) {
    for (let q = 0; q < kept.length; q++) {
      const a = kept[q];
      const b = kept[(q + 1) % kept.length];
      const len = (((s[b] - s[a]) % P) + P) % P || P;
      const m = at(s[a] + len / 2);
      edges.push({
        lenCm: len,
        mid: m.p,
        tx: m.tx,
        ty: m.ty,
        nx: -m.ty * inSign,
        ny: m.tx * inSign,
      });
    }
  }
  return { corners, edges };
}
