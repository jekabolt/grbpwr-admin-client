import { simplifyPath } from 'ui/components/annotation/geometry';

import { strokePolyline, type VectorStroke } from './vector-strokes';

/**
 * ВЫДЕЛЕНИЕ ЛАССО — область, обведённая от руки, и операции над штрихами внутри неё.
 *
 * ВЫДЕЛЕНИЕ — РАБОЧЕЕ СОСТОЯНИЕ РЕДАКТОРА, НЕ ДОКУМЕНТ. Как и в фотошопе, муравьиная дорожка не
 * сохраняется вместе с рисунком: формат слоя хранит штрихи и только их, и класть туда выделения
 * значило бы поднять версию формата ради того, что живёт от входа до выхода. Поэтому тип живёт
 * здесь, а не в vector-strokes.
 *
 * РАСТУШЁВКА (feather) — СВОЙСТВО КАЖДОГО ВЫДЕЛЕНИЯ, а не настройка инструмента. Дословно по
 * владельцу: «возможность его растушовывыть еще отдельно для всех выделений». Двум выделениям на
 * одном экране можно задать две разные растушёвки, и смена одной не трогает другую. Для штрихов
 * мягкого края не существует — штрихи режутся ПО муравьиной дорожке; растушёвка видна ореолом и
 * поедет в растровые операции редактора, когда они появятся.
 *
 * РЕЗКА, А НЕ ОТБОР ЦЕЛИКОМ. «Удалить выделенное» в фотошопе стирает то, что внутри границы, — не
 * весь объект, которого граница коснулась. Поэтому штрих, пересекающий контур, РАЗРЕЗАЕТСЯ в
 * точках пересечения: наружные куски живут дальше, внутренние уходят (или копируются). Резка идёт
 * по той же ломаной, которой штрих меряется на клик (`strokePolyline`), — выделение накрывает ровно
 * то, что человек видит, включая выпуклость кривой, а не хорду между якорями.
 *
 * ЦЕНА РЕЗКИ КРИВОЙ НАЗВАНА: разрезанный кубик продолжает жить флэттеном (инструмент `freehand`,
 * плотные точки, Catmull-Rom при отрисовке проходит РОВНО через них — форма не уезжает дальше
 * долей пикселя). Точно поделить кубик де Кастельжо по параметрам пересечения можно, но параметры
 * приходят с флэттена и точность была бы той же — сложность купила бы ноль формы. Штрих, которого
 * контур НЕ коснулся, не переписывается вовсе: он остаётся тем же объектом с теми же сегментами.
 */

export type SelectionArea = {
  /** Замкнутый контур в долях кадра; замыкание неявное (последняя точка соединена с первой). */
  pts: [number, number][];
  /** Растушёвка ЭТОГО выделения, в пикселях платы (мир шириной 1000). */
  feather: number;
};

/** Порог прореживания обводки — тот же, что у свободного следа (~2 экранных пикселя). */
/**
 * ⚠ ПЕРЕЖИТОК, ОСТАВЛЕННЫЙ ИМЕНЕМ: порог прореживания больше НЕ живёт в долях кадра (круг 15,
 * J-36). Число сохранено ровно как запись о том, чем он был, и не читается ни одним органом —
 * искать его в коде бесполезно, порог считается от зума в `thinLasso`.
 */
const LASSO_EPSILON_LEGACY_FRACTION = 0.005;
void LASSO_EPSILON_LEGACY_FRACTION;
/** Куски короче этого (в долях кадра) — пыль от резки, не штрих: их не видно и не взять. */
const MIN_PIECE_LEN = 0.004;
/** Смещение копии, чтобы она была ВИДНА рядом с оригиналом, а не легла на него невидимкой. */
export const COPY_NUDGE: [number, number] = [0.015, 0.015];

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type Pt = { x: number; y: number };

/** Чёт-нечет по лучу. Точка на самой границе уходит в ту или другую сторону — для резки это
 *  безразлично: сосед-подотрезок с той же серединой ляжет в тот же класс. */
export function pointInPolygon(p: Pt, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Параметр t пересечения отрезка a→b с отрезком c→d, или null. Касания концами считаются. */
function segCross(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * Разрезать ломаную по контуру. Каждый сегмент делится в точках пересечения с КАЖДЫМ ребром
 * полигона (включая замыкающее), подотрезки классифицируются серединой, и соседние подотрезки
 * одного класса склеиваются в куски. Точка разреза принадлежит ОБОИМ соседним кускам — наружный
 * кусок доходит ровно до дорожки, а не обрывается за шаг до неё.
 */
function splitPolyline(
  pts: Pt[],
  poly: [number, number][],
): { inside: Pt[][]; outside: Pt[][]; crossed: boolean } {
  const inside: Pt[][] = [];
  const outside: Pt[][] = [];
  let run: Pt[] = [];
  let runInside: boolean | null = null;
  let crossed = false;

  const flush = () => {
    if (run.length >= 2 && runInside !== null) (runInside ? inside : outside).push(run);
    run = [];
  };

  /**
   * Точка в кусок — БЕЗ смежного дубля. Конец под-отрезка и начало следующего — одна и та же
   * точка, и слепой push клал её дважды; а смежный дубль в формате штриха означает «поднятое
   * перо» (конвенция splitInkStrokes) — кусок резки возил бы в себе случайный разрыв.
   */
  const put = (p: Pt) => {
    const last = run[run.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    run.push(p);
  };

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ts: number[] = [];
    for (let e = 0; e < poly.length; e++) {
      const c = { x: poly[e][0], y: poly[e][1] };
      const d = {
        x: poly[(e + 1) % poly.length][0],
        y: poly[(e + 1) % poly.length][1],
      };
      const t = segCross(a, b, c, d);
      if (t !== null) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const cuts = [0, ...ts.filter((t) => t > 1e-9 && t < 1 - 1e-9), 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = cuts[k];
      const t1 = cuts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const isIn = pointInPolygon(mid, poly);
      if (runInside === null) {
        runInside = isIn;
        run = [p0];
      } else if (isIn !== runInside) {
        crossed = true;
        put(p0);
        flush();
        runInside = isIn;
        run = [p0];
      }
      put(p1);
    }
  }
  flush();
  return { inside, outside, crossed };
}

/** Длина куска в долях кадра — отсев пыли от резки. */
function pieceLen(piece: Pt[]): number {
  let len = 0;
  for (let i = 1; i < piece.length; i++) {
    len += Math.hypot(piece[i].x - piece[i - 1].x, piece[i].y - piece[i - 1].y);
  }
  return len;
}

/**
 * Кусок резки как штрих. Двухточечный кусок ЛИНИИ остаётся линией; всё остальное — `freehand`:
 * плотные точки флэттена, через которые отрисовка проходит точно. Вид, вес, «строительность»,
 * ЦВЕТ и РАЗМЕР наследуются от разрезанного — операция режет геометрию, а не перекрашивает нить.
 *
 * ПЕРЕЧИСЛЕНИЕ, А НЕ РАСПЫЛЕНИЕ `...src`, ОСТАЛОСЬ НАРОЧНО: `segs` разрезанного штриха адресуют
 * ЧУЖИЕ интервалы, и распылить их на кусок значило бы посадить кривизну на другие точки. Цена
 * перечисления — оно обязано расти вместе с форматом, и цвет с размером дописаны здесь потому,
 * что без них половина резаного рисунка молча вернулась бы к чёрной нити тонкого веса.
 */
function pieceStroke(piece: Pt[], src: VectorStroke, nudge: [number, number]): VectorStroke {
  const out: VectorStroke = {
    tool: src.tool === 'line' && piece.length === 2 ? 'line' : 'freehand',
    brush: src.brush,
    weight: src.weight,
    dashed: src.dashed,
    pts: piece.map((p) => [r4(clamp01(p.x + nudge[0])), r4(clamp01(p.y + nudge[1]))]),
  };
  if (src.ink) out.ink = src.ink;
  if (src.gauge !== undefined) out.gauge = src.gauge;
  return out;
}

/** Ломаная штриха в долях кадра — вход резки. Доли аффинно совместимы с полигоном выделения. */
const flat = (s: VectorStroke): Pt[] => strokePolyline(s, 1, 1);

/**
 * Удалить из штрихов всё, что ВНУТРИ контура. Штрих, которого контур не коснулся и который стоит
 * снаружи, возвращается ТЕМ ЖЕ объектом — его сегменты, его байты; целиком внутренний исчезает;
 * пересечённый заменяется наружными кусками.
 */
export function deleteInsideSelection(
  strokes: VectorStroke[],
  poly: [number, number][],
): { next: VectorStroke[]; changed: boolean } {
  const next: VectorStroke[] = [];
  let changed = false;
  for (const s of strokes) {
    const { inside, outside, crossed } = splitPolyline(flat(s), poly);
    if (!crossed && inside.length === 0) {
      next.push(s);
      continue;
    }
    changed = true;
    for (const piece of outside) {
      if (piece.length >= 2 && pieceLen(piece) >= MIN_PIECE_LEN) {
        next.push(pieceStroke(piece, s, [0, 0]));
      }
    }
  }
  return { next, changed };
}

/**
 * Копия того, что ВНУТРИ контура. Целиком внутренний штрих копируется КАК ЕСТЬ — с его кубическими
 * сегментами, сдвинутыми тем же смещением (управляющие точки в `segs` абсолютны, сдвиг обязан
 * увезти и их, иначе копия кривой прибыла бы с чужой кривизной). Пересечённый отдаёт внутренние
 * куски. Смещение делает копию видимой и берущейся — копия точно поверх оригинала выглядела бы как
 * «ничего не произошло».
 */
export function copyInsideSelection(
  strokes: VectorStroke[],
  poly: [number, number][],
  nudge: [number, number] = COPY_NUDGE,
): VectorStroke[] {
  const born: VectorStroke[] = [];
  for (const s of strokes) {
    const { inside, crossed } = splitPolyline(flat(s), poly);
    if (!crossed && inside.length > 0) {
      born.push({
        ...s,
        pts: s.pts.map(([x, y]) => [r4(clamp01(x + nudge[0])), r4(clamp01(y + nudge[1]))]),
        ...(s.segs
          ? {
              segs: s.segs.map((c) =>
                c
                  ? ([
                      r4(c[0] + nudge[0]),
                      r4(c[1] + nudge[1]),
                      r4(c[2] + nudge[0]),
                      r4(c[3] + nudge[1]),
                    ] as [number, number, number, number])
                  : null,
              ),
            }
          : {}),
      });
      continue;
    }
    for (const piece of inside) {
      if (piece.length >= 2 && pieceLen(piece) >= MIN_PIECE_LEN) {
        born.push(pieceStroke(piece, s, nudge));
      }
    }
  }
  return born;
}

/**
 * ПРОРЕЖИВАНИЕ ОБВОДКИ — В ЮНИТАХ ПЛАТЫ И ПО ЗУМУ, НА КОТОРОМ ОБВОДИЛИ (круг 15, J-36, дефект 3).
 *
 * ⚠ ПРЕЖНИЙ ПОРОГ БЫЛ В ДОЛЯХ КАДРА И ПОТОМУ АНИЗОТРОПЕН И СЛЕП К ЗУМУ. `LASSO_EPSILON = 0.005`
 * по x — это 5 юнитов платы, а по y — `0.005·plateH`, то есть 6.25 юнита на форме 0.8 и 10 на
 * 0.5: один и тот же изгиб срезался по-разному в зависимости от того, куда он идёт. И, что
 * хуже, порог не знал о приближении: чем ближе человек подводит глаз, тем ГРУБЕЕ он режет —
 * ровно наоборот тому, зачем приближают. Замерено на стенде: 48 сэмплов → 26 вершин, наибольший
 * уход контура от нарисованного 6.8 юнита (≈3.6 экранных px на вписывании, ≈50 на 8×).
 *
 * Порог теперь — «не хуже 0.75 экранного пикселя на ТОМ зуме, на котором обводили», с полом в
 * пол-юнита: ниже него прореживание перестаёт быть прореживанием и начинает хранить дрожь руки.
 *
 * ⚠ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ ВЕТКА `settleLasso`, ПОТОМУ ЧТО ЕЁ ЗОВЁТ ПРЕВЬЮ. Живой контур во
 * время протяжки обязан рисоваться ТЕМ ЖЕ прореживанием, что и итог, иначе «что видел — то и
 * получил» остаётся обещанием: превью показывало сырой след, а на отпускании он подменялся
 * другой ломаной. `settleLasso` — это `thinLasso` плюс проверка «а область ли это вообще», и
 * превью второй половины не нужно.
 */
export function thinLasso(
  raw: readonly [number, number][],
  world: { w: number; h: number },
  epsUnits: number,
): [number, number][] {
  const thinned = simplifyPath(
    raw.map(([x, y]) => ({ x: x * world.w, y: y * world.h })),
    Math.max(0.01, epsUnits),
  );
  return thinned.map((p) => [p.x / world.w, p.y / world.h] as [number, number]);
}

/**
 * Обводка лассо → контур выделения. Прореживание тем же RDP, что у следа; меньше трёх вершин или
 * вырожденная площадь — не область, а дрогнувшая рука: null, вызывающий трактует жест как клик.
 */
export function settleLasso(
  raw: [number, number][],
  world: { w: number; h: number },
  epsUnits: number,
): [number, number][] | null {
  const thinned = thinLasso(raw, world, epsUnits).map(([x, y]) => ({ x, y }));
  if (thinned.length < 3) return null;
  let a2 = 0;
  for (let i = 0; i < thinned.length; i++) {
    const p = thinned[i];
    const q = thinned[(i + 1) % thinned.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  if (Math.abs(a2) < 2e-4) return null;
  return thinned.map((p) => [r4(clamp01(p.x)), r4(clamp01(p.y))] as [number, number]);
}

/** Контур выделения как SVG-путь в боксе w × h. `Z`, а не повтор первой точки, — см. геометрию. */
export function selectionPathD(pts: [number, number][], w: number, h: number): string {
  if (pts.length < 2) return '';
  return `M${pts.map(([x, y]) => `${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join(' L')} Z`;
}
