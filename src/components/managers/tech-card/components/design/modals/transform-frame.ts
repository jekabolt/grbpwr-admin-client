import { pointInPolygon } from './vector-lasso';

/**
 * ТРАНСФОРМ-РАМКА — ОДИН ПРИМИТИВ НА ТРИ ХОЗЯИНА (G-3, G-13, G-4).
 *
 * Дословно от владельца (G-3): «слой с картинкой должен быть как механика слоя в фотошопе что бы
 * можно было его искривлять с помощью направляющих крутить». И (G-13): «когда с помощью выделения
 * делаешь вставку вставленным объектом нужно что бы было можно управлять пока мы его не заплейсим».
 *
 * ── ПОЧЕМУ ОДИН ПРИМИТИВ, А НЕ ТРИ ПОХОЖИХ ──────────────────────────────────────────────────
 *
 * Шаблон, вставка и кроп — три РАЗНЫХ содержимых под ОДНИМ жестом: тянуть тело, тянуть ручку,
 * крутить за углом, Ctrl-тянуть угол. Три копии этой арифметики разошлись бы на первой же правке
 * (ровно так разъехались бы два рисовальщика превью, о чём написано в `vector-modal.tsx`), и
 * человек получил бы три рамки, ведущие себя по-разному в трёх местах одного экрана.
 *
 * Здесь НЕТ ни React, ни DOM, ни состояния приложения: только квад и редукторы над ним. Всё, что
 * знает про экран, живёт в `transform-frame-overlay.tsx`; всё, что знает про документ, — в
 * `vector-modal.tsx`.
 *
 * ── ИСТИНА — КВАД, А НЕ «ЦЕНТР + МАСШТАБ + УГОЛ» ────────────────────────────────────────────
 *
 * Четыре угла в ЮНИТАХ ПЛАТЫ (мир шириной `PLATE_W`), по часовой от левого верхнего: TL, TR, BR,
 * BL. Тройка «центр/масштаб/поворот» выразить перспективу не может в принципе — у неё нет для неё
 * чисел, — а перспектива тут заявленная работа (corner pin). Квад выражает всё: сдвиг, масштаб по
 * каждой оси (в том числе ОТРИЦАТЕЛЬНЫЙ, то есть отражение), поворот и перспективу.
 *
 * ── КАК СЮДА ЛЯЖЕТ СЕТКА WARP (G-16), НЕ ПЕРЕПИСЫВАЯ НИ ОДНОГО РИСОВАЛЬЩИКА ─────────────────
 *
 * Всё, что рисует содержимое рамки, спрашивает ОДНУ функцию: «где на плате лежит точка (u,v)
 * источника». Она объявлена как `warpMapper(warp)` и возвращает замыкание `f(u, v)`. Для квада
 * `f` — гомография; для будущей сетки 4×4 — интерполяция контрольных точек, и это ВТОРАЯ ВЕТКА
 * внутри `warpMapper`, а не второй рисовальщик. `drawWarped`, оверлей и коммит вставки уже читают
 * только `f`, поэтому G-16 добавляет ветку и органы сетки — и не трогает ни отрисовку, ни
 * попадание указателя, ни коммит.
 *
 * Держатель объявлен расширяемым СРАЗУ: `Warp = { quad; grid? }`.
 */

export type Pt = readonly [number, number];

/** Четыре угла по часовой от левого верхнего: TL, TR, BR, BL. */
export type Quad = readonly [Pt, Pt, Pt, Pt];

/**
 * Сетка контрольных точек (G-16). `pts` — построчно, `rows × cols` штук, в юнитах платы; углы
 * сетки совпадают с углами квада. Пока её никто не строит; ветка чтения существует, чтобы
 * появление сетки было ДОПИСЫВАНИЕМ, а не переписыванием — довод в шапке.
 */
export type WarpGrid = { rows: number; cols: number; pts: Pt[] };

export type Warp = { quad: Quad; grid?: WarpGrid };

/**
 * ВОСЕМЬ РУЧЕК В ПОРЯДКЕ ЧТЕНИЯ, и порядок здесь — не вкус: он же уезжает в разметку
 * (`data-frame-handle="0..7"`), и проба, которая жмёт «правую» ручку, обязана уметь назвать её
 * числом, не считая по картинке.
 *
 *   0 1 2
 *   3   4
 *   5 6 7
 */
export const HANDLE_UV: readonly Pt[] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

/** Ручки-углы, в том же порядке, что углы квада (TL, TR, BR, BL). */
export const CORNER_HANDLES: readonly number[] = [0, 2, 7, 5];

/** Ручка — угол? Только у углов есть поворот и перспектива. */
export const isCornerHandle = (h: number): boolean => CORNER_HANDLES.includes(h);

/**
 * САМАЯ КОРОТКАЯ СТОРОНА, КОТОРУЮ РАМКЕ ПОЗВОЛЕНО ИМЕТЬ, в юнитах платы. Ноль вырождает квад:
 * определитель гомографии обращается в ноль, обратного отображения не существует, и содержимое
 * исчезает БЕЗ ВОЗВРАТА — вернуть его нечем, потому что «на сколько растянуть обратно» больше не
 * записано нигде. Двенадцать юнитов — это ещё видимая полоска, за которую можно взяться.
 */
export const MIN_FRAME_SIDE = 12;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const finite = (n: number): boolean => Number.isFinite(n);

/** Квад из осе-выровненного прямоугольника — начало всякой рамки и единственная форма кропа. */
export function quadFromRect(x: number, y: number, w: number, h: number): Quad {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Габарит по осям. Им меряют «уехала ли рамка» и им же клампят её в пределы досягаемости. */
export function quadBounds(q: Quad): { x0: number; y0: number; x1: number; y1: number } {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const quadCenter = (q: Quad): Pt => [
  (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4,
  (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4,
];

/**
 * ТОЧКА РАМКИ ПО (u,v) — БИЛИНЕЙНО, а не гомографией, и это не небрежность.
 *
 * Гомография отвечает на вопрос «куда уехал ПИКСЕЛЬ источника» — ей и рисуют содержимое. Ручка же
 * — орган РАМКИ: человек ждёт её ровно посередине стороны, которую видит, и на сильной перспективе
 * гомографическая «середина» уезжает к дальнему краю, то есть ручка перестаёт быть там, куда
 * человек целится. Фотошоп держит ручки на самой рамке по той же причине.
 *
 * В углах обе формулы совпадают тождественно, поэтому расхождение не касается ни одного угла — а
 * перспективу двигают именно за углы.
 */
export function framePoint(q: Quad, u: number, v: number): Pt {
  const top: Pt = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
  const bot: Pt = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
}

/** Положение ручки на рамке. */
export const handlePoint = (q: Quad, h: number): Pt => framePoint(q, HANDLE_UV[h][0], HANDLE_UV[h][1]);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ГОМОГРАФИЯ: ЕДИНИЧНЫЙ КВАДРАТ → КВАД
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Построчно: `[a, b, c, d, e, f, g, h, i]`, точка (u, v, 1) умножается справа. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * ГОМОГРАФИЯ ЕДИНИЧНОГО КВАДРАТА В КВАД — метод адъюгаты, без единой зависимости.
 *
 * Вывод классический (Heckbert): три коэффициента снимаются из условия «диагонали квада проходят
 * через образ центра», остальные шесть — прямой подстановкой углов. Вырожденный случай (стороны
 * параллельны) отделён явно: там `g = h = 0`, то есть отображение аффинно, и общая формула делила
 * бы ноль на ноль.
 */
export function homographyFromQuad(q: Quad): Mat3 {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1[0] - p2[0];
  const dx2 = p3[0] - p2[0];
  const dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1];
  const dy2 = p3[1] - p2[1];
  const dy3 = p0[1] - p1[1] + p2[1] - p3[1];

  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return [
      p1[0] - p0[0],
      p3[0] - p0[0],
      p0[0],
      p1[1] - p0[1],
      p3[1] - p0[1],
      p0[1],
      0,
      0,
      1,
    ];
  }
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-12) {
    // Вырожденный квад (три угла на одной прямой). Возвращается аффинная ветка: она не «правильна»,
    // но она конечна, а NaN в матрице уносит с экрана и содержимое, и рамку.
    return [
      p1[0] - p0[0],
      p3[0] - p0[0],
      p0[0],
      p1[1] - p0[1],
      p3[1] - p0[1],
      p0[1],
      0,
      0,
      1,
    ];
  }
  const g = (dx3 * dy2 - dy3 * dx2) / den;
  const h = (dx1 * dy3 - dy1 * dx3) / den;
  return [
    p1[0] - p0[0] + g * p1[0],
    p3[0] - p0[0] + h * p3[0],
    p0[0],
    p1[1] - p0[1] + g * p1[1],
    p3[1] - p0[1] + h * p3[1],
    p0[1],
    g,
    h,
    1,
  ];
}

/** Точка (u, v) единичного квадрата через гомографию. */
export function applyH(m: Mat3, u: number, v: number): Pt {
  const w = m[6] * u + m[7] * v + m[8];
  const k = Math.abs(w) < 1e-12 ? 1e-12 : w;
  return [(m[0] * u + m[1] * v + m[2]) / k, (m[3] * u + m[4] * v + m[5]) / k];
}

/**
 * ГДЕ ЛЕЖИТ ТОЧКА (u,v) ИСТОЧНИКА — ЕДИНСТВЕННАЯ ФУНКЦИЯ, КОТОРУЮ СПРАШИВАЮТ РИСОВАЛЬЩИКИ.
 *
 * Возвращает замыкание, а не считает по точке: гомография строится один раз на жест, а спрашивают
 * её сотни раз на кадр (сетка треугольников). Здесь же и точка расширения G-16 — см. шапку файла.
 */
export function warpMapper(warp: Warp): (u: number, v: number) => Pt {
  const grid = warp.grid;
  if (grid && grid.rows >= 2 && grid.cols >= 2 && grid.pts.length === grid.rows * grid.cols) {
    return (u, v) => gridPoint(grid, u, v);
  }
  const m = homographyFromQuad(warp.quad);
  return (u, v) => applyH(m, u, v);
}

/**
 * ТОЧКА СЕТКИ (G-16) — билинейно внутри клетки контрольных точек. Ветка написана вместе с
 * держателем НАМЕРЕННО: без неё «сетка ляжет сюда без переписывания» осталось бы обещанием, а
 * проверить обещание нечем. Никто её пока не зовёт — сетку не строит ни один орган, и это сказано
 * вслух в отчёте, а не спрятано.
 */
export function gridPoint(g: WarpGrid, u: number, v: number): Pt {
  const cx = (g.cols - 1) * Math.min(1, Math.max(0, u));
  const cy = (g.rows - 1) * Math.min(1, Math.max(0, v));
  const i0 = Math.min(g.cols - 2, Math.floor(cx));
  const j0 = Math.min(g.rows - 2, Math.floor(cy));
  const fx = cx - i0;
  const fy = cy - j0;
  const at = (i: number, j: number): Pt => g.pts[j * g.cols + i];
  const top = add(mul(at(i0, j0), 1 - fx), mul(at(i0 + 1, j0), fx));
  const bot = add(mul(at(i0, j0 + 1), 1 - fx), mul(at(i0 + 1, j0 + 1), fx));
  return add(mul(top, 1 - fy), mul(bot, fy));
}

/**
 * CSS-МАТРИЦА ДЛЯ ЭЛЕМЕНТА `natW × natH` с `transform-origin: 0 0`.
 *
 * Тот же довод, что у `backdropMatrix`: юнит платы и CSS-пиксель мирового блока — одно и то же
 * число, поэтому матрица ложится в него без пересчёта. `matrix3d` вместо `matrix` потому, что
 * перспективу двумерная матрица выразить не может — у неё нет строки `g h`.
 */
export function quadCss(q: Quad, natW: number, natH: number): string {
  const m = homographyFromQuad(q);
  const sx = natW > 0 ? 1 / natW : 1;
  const sy = natH > 0 ? 1 / natH : 1;
  const a = m[0] * sx;
  const b = m[3] * sx;
  const g = m[6] * sx;
  const c = m[1] * sy;
  const d = m[4] * sy;
  const h = m[7] * sy;
  const q3 = (n: number) => Math.round(n * 1e6) / 1e6;
  // Столбцами, как требует CSS: (a b 0 g)(c d 0 h)(0 0 1 0)(e f 0 1).
  return `matrix3d(${[a, b, 0, g, c, d, 0, h, 0, 0, 1, 0, m[2], m[5], 0, 1].map(q3).join(', ')})`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// РЕДУКТОРЫ — ВСЁ, ЧТО РАМКА УМЕЕТ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const moveQuad = (q: Quad, dx: number, dy: number): Quad =>
  [
    [q[0][0] + dx, q[0][1] + dy],
    [q[1][0] + dx, q[1][1] + dy],
    [q[2][0] + dx, q[2][1] + dy],
    [q[3][0] + dx, q[3][1] + dy],
  ] as Quad;

/** Оси рамки: среднее по двум противоположным сторонам. На прямоугольнике — сами стороны. */
function axes(q: Quad): { ex: Pt; ey: Pt } {
  const ex: Pt = [
    (q[1][0] - q[0][0] + q[2][0] - q[3][0]) / 2,
    (q[1][1] - q[0][1] + q[2][1] - q[3][1]) / 2,
  ];
  const ey: Pt = [
    (q[3][0] - q[0][0] + q[2][0] - q[1][0]) / 2,
    (q[3][1] - q[0][1] + q[2][1] - q[1][1]) / 2,
  ];
  return { ex, ey };
}

/** Разложение вектора по осям рамки. Оси НЕ ортогональны после перспективы — нужна матрица 2×2. */
function inAxes(ex: Pt, ey: Pt, d: Pt): [number, number] | null {
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (!finite(det) || Math.abs(det) < 1e-9) return null;
  return [(d[0] * ey[1] - d[1] * ey[0]) / det, (ex[0] * d[1] - ex[1] * d[0]) / det];
}

export type ScaleOptions = {
  /** Shift: сохранить пропорции. Множитель — наименьший квадратов по обеим осям, а не «одна из». */
  proportional?: boolean;
  /**
   * ОТРАЖЕНИЕ ЖЕСТОМ (G-3: кнопки `flip` больше нет). Протащив ручку ЗА противоположный край,
   * человек получает отрицательный масштаб — это и есть отражение, ровно как в фотошопе. Кроп
   * этого не умеет и не должен: перевёрнутая рамка кадра означала бы отрицательный размер листа.
   */
  allowFlip?: boolean;
  /** Самая короткая допустимая сторона, юниты платы. */
  minSide?: number;
};

/**
 * МАСШТАБ ЗА РУЧКУ, ЯКОРЬ — ПРОТИВОПОЛОЖНАЯ РУЧКА.
 *
 * Ручка приводится РОВНО в точку указателя (иначе рамка отставала бы от руки), а всё остальное
 * пересчитывается линейным отображением в осях рамки: угол тянет обе оси, середина стороны — одну.
 * Якорь неподвижен по построению — он и есть начало этих осей.
 */
export function scaleQuad(q: Quad, handle: number, to: Pt, opts: ScaleOptions = {}): Quad {
  const uv = HANDLE_UV[handle];
  if (!uv) return q;
  const minSide = opts.minSide ?? MIN_FRAME_SIDE;
  const anchor = framePoint(q, 1 - uv[0], 1 - uv[1]);
  const held = framePoint(q, uv[0], uv[1]);
  const { ex, ey } = axes(q);
  const span = inAxes(ex, ey, sub(held, anchor));
  const want = inAxes(ex, ey, sub(to, anchor));
  if (!span || !want) return q;

  const movesX = uv[0] !== 0.5;
  const movesY = uv[1] !== 0.5;
  const lenX = Math.hypot(ex[0], ex[1]);
  const lenY = Math.hypot(ey[0], ey[1]);

  let fx = movesX && Math.abs(span[0]) > 1e-9 ? want[0] / span[0] : 1;
  let fy = movesY && Math.abs(span[1]) > 1e-9 ? want[1] / span[1] : 1;

  if (opts.proportional && movesX && movesY) {
    /* Наименьших квадратов, а не «взять ось побольше»: проекция желаемого смещения на луч
       равномерного масштаба — это единственный множитель, одинаково честный к обеим осям, и он
       не дёргается, когда рука идёт вдоль одной из них. */
    const num = want[0] * span[0] + want[1] * span[1];
    const den = span[0] * span[0] + span[1] * span[1];
    const k = Math.abs(den) > 1e-12 ? num / den : 1;
    fx = k;
    fy = k;
  }

  const guard = (f: number, len: number, moves: boolean): number => {
    if (!moves || !finite(f)) return 1;
    if (!opts.allowFlip && f < 0) f = 0;
    const side = Math.abs(f) * len;
    if (side >= minSide) return f;
    const floor = len > 1e-9 ? minSide / len : 1;
    return f < 0 ? -floor : floor;
  };
  fx = guard(fx, lenX, movesX);
  fy = guard(fy, lenY, movesY);

  const out = q.map((c) => {
    const local = inAxes(ex, ey, sub(c, anchor));
    if (!local) return c;
    return add(anchor, add(mul(ex, local[0] * fx), mul(ey, local[1] * fy)));
  }) as unknown as Quad;
  return out;
}

/** Ориентация рамки в градусах — угол её горизонтальной оси. Ею живёт привязка поворота. */
export function quadAngleDeg(q: Quad): number {
  const { ex } = axes(q);
  return (Math.atan2(ex[1], ex[0]) * 180) / Math.PI;
}

/**
 * ПОВОРОТ ВОКРУГ ЦЕНТРА РАМКИ. Угол — АБСОЛЮТНЫЙ (куда встать), а не приращение: привязка к сетке
 * 15° обязана держать САМУ ОРИЕНТАЦИЮ кратной пятнадцати, а не «прибавку от того места, где рука
 * начала», — иначе после трёх поворотов с Shift рамка стоит под углом 7°, и человек, который всю
 * дорогу держал Shift, не понимает, почему.
 */
export function rotateQuad(q: Quad, toDeg: number): Quad {
  const from = quadAngleDeg(q);
  const rad = ((toDeg - from) * Math.PI) / 180;
  if (!finite(rad) || rad === 0) return q;
  const c = quadCenter(q);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return q.map((p) => {
    const dx = p[0] - c[0];
    const dy = p[1] - c[1];
    return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos] as Pt;
  }) as unknown as Quad;
}

/** Шаг привязки поворота — та же пятнадцатиградусная сетка, что у всякого редактора. */
export const ROT_SNAP = 15;
export const snapDeg = (deg: number): number => Math.round(deg / ROT_SNAP) * ROT_SNAP;

/**
 * ПЕРСПЕКТИВА: ОДИН УГОЛ УЕЗЖАЕТ, ТРИ СТОЯТ (Ctrl/Cmd-драг угла).
 *
 * Это и есть corner pin. Отдельного «режима перспективы» нет нарочно: режим — это состояние,
 * которое человек обязан помнить, а модификатор под пальцем виден в ту же секунду, когда действует.
 */
export function pinQuad(q: Quad, corner: number, to: Pt): Quad {
  if (corner < 0 || corner > 3) return q;
  return q.map((p, i) => (i === corner ? ([to[0], to[1]] as Pt) : p)) as unknown as Quad;
}

/**
 * ДЕРЖАТЬ РАМКУ В ПРЕДЕЛАХ ДОСЯГАЕМОСТИ — тем же правилом и тем же числом, что у подложки
 * (`BACKDROP_KEEP_UNITS`): уехавшую целиком за край нечем ни увидеть, ни поймать, и единственным
 * выходом осталось бы «снять и поставить заново», то есть потерять выставленное.
 *
 * Клампится СДВИГОМ ЦЕЛИКОМ, а не углами по одному: подвинутый угол — это правка формы, а кламп
 * не имеет права менять форму, он лишь возвращает её в поле зрения.
 */
export function keepQuadReachable(q: Quad, plate: { w: number; h: number }, keep: number): Quad {
  const b = quadBounds(q);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const keepX = Math.min(keep, w, plate.w);
  const keepY = Math.min(keep, h, plate.h);
  let dx = 0;
  let dy = 0;
  if (b.x1 < keepX) dx = keepX - b.x1;
  else if (b.x0 > plate.w - keepX) dx = plate.w - keepX - b.x0;
  if (b.y1 < keepY) dy = keepY - b.y1;
  else if (b.y0 > plate.h - keepY) dy = plate.h - keepY - b.y0;
  return dx || dy ? moveQuad(q, dx, dy) : q;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПОПАДАНИЕ УКАЗАТЕЛЯ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type FrameHit =
  | { kind: 'handle'; handle: number }
  | { kind: 'rotate'; handle: number }
  | { kind: 'body' }
  | null;

/**
 * ЧТО ПОД УКАЗАТЕЛЕМ. Пороги приходят В ЮНИТАХ ПЛАТЫ уже поделёнными на зум — ровно как у
 * `hitStroke`: десять экранных пикселей обязаны значить десять экранных на любом приближении.
 *
 * ПОРЯДОК ОПРОСА — ЗАКОН: ручка старше зоны поворота, зона поворота старше тела. Ручка лежит
 * ВНУТРИ зоны поворота геометрически, и спросив зону первой, мы отобрали бы у человека масштаб
 * вовсе — он бы крутил там, где целился тянуть.
 */
export function hitFrame(
  q: Quad,
  p: Pt,
  opts: { handle: number; rotate: number; axis?: boolean },
): FrameHit {
  /**
   * ⚠ ЗОНА РУЧКИ СУЖАЕТСЯ ВМЕСТЕ С РАМКОЙ, И ЭТО НЕ ПОЛИРОВКА, А ЗАКРЫТАЯ ДЫРА.
   *
   * У тонкой рамки (вставленная ОДНА ГОРИЗОНТАЛЬНАЯ линия, узкая полоска кадра) восемь кружков
   * радиусом в девять экранных пикселей накрывают ВСЁ ЕЁ ТЕЛО — и взяться за тело нечем: любое
   * нажатие попадает в ручку, то есть тонкую вставку невозможно ПЕРЕТАЩИТЬ, только растянуть.
   * Замерено пробой: драг ровно в центр флоата давал изменение высоты вместо сдвига.
   *
   * Треть полуразмера — то место, где ручка перестаёт съедать середину: у самой узкой допустимой
   * рамки остаётся полоса тела, за которую берутся, и при этом ручка не становится меньше пикселя.
   */
  const { ex, ey } = axes(q);
  const cap = Math.max(2, 0.34 * Math.min(Math.hypot(ex[0], ex[1]), Math.hypot(ey[0], ey[1])) / 2);
  const grab = Math.min(opts.handle, cap);
  let best: { h: number; d: number } | null = null;
  for (let h = 0; h < HANDLE_UV.length; h++) {
    const at = handlePoint(q, h);
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d <= grab && (!best || d < best.d)) best = { h, d };
  }
  if (best) return { kind: 'handle', handle: best.h };

  const inside = pointInQuad(q, p);
  if (!opts.axis && !inside) {
    for (const h of CORNER_HANDLES) {
      const at = handlePoint(q, h);
      if (Math.hypot(p[0] - at[0], p[1] - at[1]) <= opts.rotate) return { kind: 'rotate', handle: h };
    }
  }
  return inside ? { kind: 'body' } : null;
}

/** Внутри рамки — чёт-нечет по лучу: после corner pin квад бывает и невыпуклым. */
export const pointInQuad = (q: Quad, p: Pt): boolean =>
  pointInPolygon({ x: p[0], y: p[1] }, q.map((c) => [c[0], c[1]] as [number, number]));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ОТРИСОВКА СОДЕРЖИМОГО В КВАД
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Какую часть домена рамки занимает этот источник. Целое — единичный квадрат. */
export type WarpRegion = { u0: number; v0: number; u1: number; v1: number };
export const FULL_REGION: WarpRegion = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * НАРИСОВАТЬ ИСТОЧНИК В КВАД.
 *
 * ⚠ КООРДИНАТЫ КВАДА — В ПИКСЕЛЯХ ЦЕЛЕВОГО ХОЛСТА, а не в юнитах платы. Вызывающий переводит их
 * сам, и это НЕ мелочь: здесь стоит `setTransform`, который затирает любой внешний трансформ, и
 * функция, «умеющая» ещё и масштаб мира, имела бы два способа сказать одно и то же — а разъехались
 * бы они молча, на первой же плите непривычного размера.
 *
 * АФФИННЫЙ БЫСТРЫЙ ПУТЬ ОТДЕЛЬНО. Параллелограмм (а это всё, кроме перспективы: сдвиг, масштаб,
 * отражение, поворот) рисуется ОДНИМ `drawImage` с точным трансформом — ни одного шва, ни одной
 * лишней интерполяции. Треугольная сетка нужна только там, где отображение перестало быть
 * аффинным, и платить за неё в самом частом случае незачем.
 */
export function drawWarped(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  warp: Warp,
  region: WarpRegion = FULL_REGION,
  subdiv = 12,
): void {
  if (srcW <= 0 || srcH <= 0) return;
  const f = warpMapper(warp);
  const uAt = (sx: number) => region.u0 + (sx / srcW) * (region.u1 - region.u0);
  const vAt = (sy: number) => region.v0 + (sy / srcH) * (region.v1 - region.v0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const m = !warp.grid ? homographyFromQuad(warp.quad) : null;
  if (m && Math.abs(m[6]) < 1e-9 && Math.abs(m[7]) < 1e-9) {
    // Аффинно: составляем «пиксель источника → плата» напрямую и рисуем один раз.
    const du = (region.u1 - region.u0) / srcW;
    const dv = (region.v1 - region.v0) / srcH;
    const a = m[0] * du;
    const b = m[3] * du;
    const c = m[1] * dv;
    const d = m[4] * dv;
    const e = m[0] * region.u0 + m[1] * region.v0 + m[2];
    const fy = m[3] * region.u0 + m[4] * region.v0 + m[5];
    ctx.setTransform(a, b, c, d, e, fy);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return;
  }

  const n = Math.max(2, Math.min(64, Math.round(subdiv)));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const sx0 = (i / n) * srcW;
      const sx1 = ((i + 1) / n) * srcW;
      const sy0 = (j / n) * srcH;
      const sy1 = ((j + 1) / n) * srcH;
      const t00 = f(uAt(sx0), vAt(sy0));
      const t10 = f(uAt(sx1), vAt(sy0));
      const t11 = f(uAt(sx1), vAt(sy1));
      const t01 = f(uAt(sx0), vAt(sy1));
      tri(ctx, src, [sx0, sy0], [sx1, sy0], [sx1, sy1], t00, t10, t11);
      tri(ctx, src, [sx0, sy0], [sx1, sy1], [sx0, sy1], t00, t11, t01);
    }
  }
  ctx.restore();
}

/**
 * ОДИН ТРЕУГОЛЬНИК. Клип расширяется наружу от центра на полпикселя: у соседних треугольников
 * общий край проходит по одним и тем же числам, а сглаживание краёв клипа даёт по нему
 * ПОЛУПРОЗРАЧНУЮ нить — сетка швов, видимая на любой сплошной заливке. Перекрытие её закрывает.
 */
function tri(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  s0: Pt,
  s1: Pt,
  s2: Pt,
  t0: Pt,
  t1: Pt,
  t2: Pt,
): void {
  const ax = s1[0] - s0[0];
  const ay = s1[1] - s0[1];
  const bx = s2[0] - s0[0];
  const by = s2[1] - s0[1];
  const det = ax * by - ay * bx;
  if (!finite(det) || Math.abs(det) < 1e-9) return;
  const p1x = t1[0] - t0[0];
  const p1y = t1[1] - t0[1];
  const p2x = t2[0] - t0[0];
  const p2y = t2[1] - t0[1];
  const a = (p1x * by - p2x * ay) / det;
  const b = (p1y * by - p2y * ay) / det;
  const c = (ax * p2x - bx * p1x) / det;
  const d = (ax * p2y - bx * p1y) / det;
  const e = t0[0] - a * s0[0] - c * s0[1];
  const fv = t0[1] - b * s0[0] - d * s0[1];
  if (![a, b, c, d, e, fv].every(finite)) return;

  const cx = (t0[0] + t1[0] + t2[0]) / 3;
  const cy = (t0[1] + t1[1] + t2[1]) / 3;
  const grow = (p: Pt): Pt => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / len) * 0.5, p[1] + (dy / len) * 0.5];
  };
  const g0 = grow(t0);
  const g1 = grow(t1);
  const g2 = grow(t2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0[0], g0[1]);
  ctx.lineTo(g1[0], g1[1]);
  ctx.lineTo(g2[0], g2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, fv);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}
