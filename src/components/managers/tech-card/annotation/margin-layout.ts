// РАСКЛАДКА ПЛАШЕК ПО ПОЛЯМ (T29, R38) — чистая арифметика, без React.
//
// Владелец о первом живом прогоне `suggest ✦`: «как то это не читабельно вообще». Плашки стояли
// там, куда их поставила модель: друг на друге, за краем кадра, лидеры крест-накрест. Здесь
// позиция плашки НЕ берётся у модели вовсе: она выводится из якорей, детерминированно, тем же
// правилом на экране и при ✓ (позиция, которую видели, и есть та, что ляжет в карточку).
//
// ПРАВИЛО. Рамка изделия — по якорям (и вершинам зон). Плашки — двумя колоннами СРАЗУ ЗА ней:
// слева то, чей якорь левее центра, справа остальное; внутренний край колонны общий, лидер идёт
// от него к якорю. В колонне плашки стоят по высоте якоря, с минимальным зазором, внутри кадра.
// Пересёкшиеся лидеры одной колонны меняются местами (высоты плашек равны — одна строка, —
// поэтому обмен мест зазоров не ломает).
//
// Отдельный модуль ради пробы: она собирает его в node и проверяет на плотном флэте.

import type { ShapePoint } from './geometry';

export type MarginItem = {
  key: string;
  /** Куда приходит лидер, доли кадра. */
  anchor: ShapePoint;
  /** Вся фигура (вершины зоны, концы линии), доли кадра: рамка изделия считается и по ним. */
  extent?: ShapePoint[];
  /** Текст плашки — одна строка. */
  text: string;
};

/** Потолок подписи призрака, знаков (контракт: `label` ≤ 32). */
export const MARGIN_LABEL_MAX = 32;

/**
 * Размер одной строки плашки в пикселях кадра. Плашка — `text-nano` (9px) моноширинным
 * FeatureMono: ширина знака 0.6em, поля `px-1` и рамка по 1px; высота — `leading-tight` + `py-px`.
 * Оценка, а не замер: раскладка обязана быть чистой и считаться без DOM (✓ пишет её же).
 */
export const MARGIN_CHAR_PX = 5.4;
export const MARGIN_PLATE_H = 16;
const PLATE_PAD_X = 10;
/** Зазор между плашками колонны, отступ колонны от изделия и от края кадра. */
export const MARGIN_GAP = 4;
const OFFSET = 12;
const GARMENT_MIN_L = 0.18;
const EDGE = 4;

export function plateWidth(text: string, frameW: number): number {
  const n = Math.min(MARGIN_LABEL_MAX, Math.max(1, [...text].length));
  return Math.min(n * MARGIN_CHAR_PX + PLATE_PAD_X, frameW * 0.45);
}

/** Однострочная подпись не длиннее потолка; обрезка видима (`…`). */
export function oneLine(text: string, max = MARGIN_LABEL_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length <= max
    ? t
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

type Seg = { a: ShapePoint; b: ShapePoint };
const orient = (p: ShapePoint, q: ShapePoint, r: ShapePoint) =>
  (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
/** Собственное пересечение двух отрезков (касание концами не считается). */
export function segmentsCross(s: Seg, t: Seg): boolean {
  const d1 = orient(t.a, t.b, s.a);
  const d2 = orient(t.a, t.b, s.b);
  const d3 = orient(s.a, s.b, t.a);
  const d4 = orient(s.a, s.b, t.b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export type MarginPlacement = {
  /** Центр плашки, доли кадра — ровно то, что ✓ пишет в `posX/posY`. */
  x: number;
  y: number;
  side: 'left' | 'right';
};

/**
 * Раскладка. `frame` — кадр в пикселях (плашка держит экранный размер, поэтому зазоры и ширины
 * считаются в пикселях, а отдаются долями). Порядок входа на результат не влияет.
 */
export function marginLayout(
  items: readonly MarginItem[],
  frame: { w: number; h: number },
): Record<string, MarginPlacement> {
  const W = frame.w;
  const H = frame.h;
  const out: Record<string, MarginPlacement> = {};
  if (!(W > 0) || !(H > 0) || items.length === 0) return out;
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Рамка изделия.
  let l = Infinity;
  let r = -Infinity;
  for (const it of sorted)
    for (const p of [it.anchor, ...(it.extent ?? [])]) {
      l = Math.min(l, p.x * W);
      r = Math.max(r, p.x * W);
    }
  // Флэт стоит в кадре по центру и занимает его большую часть; якорей бывает два-три на одной
  // стороне изделия, и рамка по ним одним посадила бы колонны на сам рисунок. Поэтому рамка не уже
  // средних 64% кадра — колонны всегда в полях.
  l = Math.min(l, GARMENT_MIN_L * W);
  r = Math.max(r, (1 - GARMENT_MIN_L) * W);
  const cx = (l + r) / 2;

  type Row = {
    key: string;
    ax: number;
    ay: number;
    w: number;
    side: 'left' | 'right';
    y: number;
    /** Внутренний край плашки по x — откуда выходит лидер. */
    inner: number;
  };
  const rows: Row[] = sorted.map((it) => ({
    key: it.key,
    ax: it.anchor.x * W,
    ay: it.anchor.y * H,
    w: plateWidth(it.text, W),
    side: it.anchor.x * W < cx ? 'left' : 'right',
    y: 0,
    inner: 0,
  }));

  // Ёмкость колонны; лишнее уходит на другую сторону — ближайшее к центру первым.
  const h = MARGIN_PLATE_H;
  const cap = Math.max(1, Math.floor((H - 2 * EDGE + MARGIN_GAP) / (h + MARGIN_GAP)));
  for (const side of ['left', 'right'] as const) {
    const col = rows.filter((x) => x.side === side);
    const other = rows.length - col.length;
    if (col.length <= cap || other >= cap) continue;
    col.sort((a, b) => Math.abs(a.ax - cx) - Math.abs(b.ax - cx));
    for (const x of col.slice(0, Math.min(col.length - cap, cap - other)))
      x.side = side === 'left' ? 'right' : 'left';
  }

  // КРАЙ ПЛАШКИ. Сначала каждая стоит вплотную за рамкой изделия и сдвигается внутрь ровно
  // настолько, насколько не влезает в кадр: узкие не уезжают за широкой соседкой и не накрывают
  // свой якорь. Если так лидеры колонны развести нельзя, у колонны ОДИН внутренний край — по самой
  // широкой: лидеры выходят с одной вертикали, и тогда обмен мест пересёкшейся пары строго
  // укорачивает сумму лидеров — разведение сходится всегда (с разными краями оно может ходить по
  // кругу; пойман пробой на узком кадре).
  const hugEdge = (x: Row) =>
    x.side === 'left'
      ? Math.max(EDGE + x.w, Math.min(W - EDGE, l - OFFSET))
      : Math.min(W - EDGE - x.w, Math.max(EDGE, r + OFFSET));
  const lo = EDGE + h / 2;
  const hi = H - EDGE - h / 2;
  const step = h + MARGIN_GAP;
  const leader = (x: Row): Seg => ({ a: { x: x.inner, y: x.y }, b: { x: x.ax, y: x.ay } });
  /** Места по высоте и разведение лидеров; отдаёт число оставшихся пересечений. */
  const placeColumn = (col: Row[]) => {
    // Места: по высоте якоря, с зазором; вниз упёрлись — сдвиг вверх; сверху — снова вниз.
    const ys = col.map((x) => Math.min(hi, Math.max(lo, x.ay)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + step);
    if (ys[ys.length - 1] > hi) {
      ys[ys.length - 1] = hi;
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - step);
    }
    if (ys[0] < lo) {
      // Не влезает и так — равномерно по всей высоте (ёмкость выше это почти исключает).
      const s = ys.length > 1 ? Math.min(step, (hi - lo) / (ys.length - 1)) : 0;
      for (let i = 0; i < ys.length; i++) ys[i] = lo + i * s;
    }
    col.forEach((x, i) => (x.y = ys[i]));
    // Пересёкшиеся лидеры меняются местами, пока есть что менять.
    for (let pass = 0; pass < 500; pass++) {
      let swapped = false;
      for (let i = 0; i < col.length; i++)
        for (let j = i + 1; j < col.length; j++) {
          const a = col[i];
          const b = col[j];
          if (!segmentsCross(leader(a), leader(b))) continue;
          const t = a.y;
          a.y = b.y;
          b.y = t;
          swapped = true;
        }
      if (!swapped) break;
    }
    let left = 0;
    for (let i = 0; i < col.length; i++)
      for (let j = i + 1; j < col.length; j++)
        if (segmentsCross(leader(col[i]), leader(col[j]))) left++;
    return left;
  };

  for (const side of ['left', 'right'] as const) {
    const col = rows
      .filter((x) => x.side === side)
      .sort((a, b) => a.ay - b.ay || (a.key < b.key ? -1 : 1));
    if (col.length === 0) continue;
    for (const x of col) x.inner = hugEdge(x);
    if (placeColumn(col) === 0) continue;
    const edge = side === 'left' ? Math.max(...col.map(hugEdge)) : Math.min(...col.map(hugEdge));
    for (const x of col) x.inner = edge;
    placeColumn(col);
  }

  for (const x of rows)
    out[x.key] = {
      x: (x.side === 'left' ? x.inner - x.w / 2 : x.inner + x.w / 2) / W,
      y: x.y / H,
      side: x.side,
    };
  return out;
}

/** Отрезок лидера в пикселях — для пробы и для того, кто захочет проверить раскладку. */
export function marginLeader(
  it: MarginItem,
  at: MarginPlacement,
  frame: { w: number; h: number },
): Seg {
  const w = plateWidth(it.text, frame.w);
  const cx = at.x * frame.w;
  return {
    a: { x: at.side === 'left' ? cx + w / 2 : cx - w / 2, y: at.y * frame.h },
    b: { x: it.anchor.x * frame.w, y: it.anchor.y * frame.h },
  };
}
