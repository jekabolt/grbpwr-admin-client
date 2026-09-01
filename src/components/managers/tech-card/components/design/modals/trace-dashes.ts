import { projectOnSegment } from 'ui/components/annotation/geometry';

import type { TraceComponent, TraceMeasurement } from './trace-types';
import {
  DEFAULT_OPEN_CORNER,
  DEFAULT_OPEN_TOLERANCE,
  fitOpenPath,
  type OpenFit,
} from './vector-trace';
import {
  GAUGE_REF,
  gaugeWeight,
  roundGauge,
  roundStep,
  type CubicSeg,
  type VectorStroke,
} from './vector-strokes';

/**
 * ═══ РЕШАТЕЛЬ ПУНКТИРНОЙ СТРОЧКИ ═════════════════════════════════════════════════════════════
 *
 * 234 отдельных пятна краски → ОДИН штрих со своим ритмом. Это не украшение и не сжатие: ни один
 * трассировщик на рынке не выводит `stroke-dasharray` вовсе (отчёт владельца, раздел 2), потому
 * что паттерн из пикселей НЕ ВОССТАНАВЛИВАЕТСЯ обводом — его надо ВЫВЕСТИ. Отсюда отдельный
 * решатель, и отсюда же его место в pipeline: он стоит ПОСЛЕ измерения (`trace-measure.ts`) и
 * читает уже посчитанные признаки, а не пиксели.
 *
 * Спецификация — `tmp/plans/design-band-ai/140-RASTER-TO-VECTOR-REPORT.md`, раздел 6, дословно.
 * Каждое число ниже пришло оттуда и помечено замером, которым оно куплено.
 *
 * ── ПОЧЕМУ ГРАФ, А НЕ LSD И НЕ HOUGH ─────────────────────────────────────────────────────────
 *
 * Замерено, и оба провалились по-разному. `createLineSegmentDetector` вернул 552 сегмента медианой
 * 11.3 px — он нашёл КРАЯ каждого стежка, то есть удвоил задачу вместо того, чтобы решить её.
 * `HoughLinesP` вернул 98 дублирующихся прямых: он мостит ПРЯМЫЕ участки и НЕ ИДЁТ ПО ДУГЕ
 * ПРОЙМЫ — а именно дуга и есть та часть чертежа, ради которой всё это пишется. Граф над стежками
 * дал 6–7 цепочек = ровно истинные строчки, дугу включая.
 *
 * ── ЛОВУШКА ПЕРВАЯ: ХОРДА ПРОВЕРЯЕТСЯ ОТНОСИТЕЛЬНО ОСЕЙ ОБОИХ СТЕЖКОВ ────────────────────────
 *
 * Соблазн — подогнать прямую и мерить от неё перпендикулярный офсет. Отчёт это оплатил: такая
 * проверка работает на прямых участках и РАЗВАЛИВАЕТСЯ НА КРИВОЙ, потому что офсет конца дуги от
 * прямой, подогнанной по её началу, растёт как R·(1−cos), то есть неограниченно. Проверка хорды
 * относительно осей ОБОИХ стежков — то, что заставляет алгоритм идти по дуге проймы. См.
 * `chordAxes`: у неё ровно одна работа — сказать, ЧЬИ оси читаются, и ответ «двух этих стежков».
 *
 * ── ЛОВУШКА ВТОРАЯ: ПАРНОСТЬ — ЭТО РАССТОЯНИЕ **И** ПЕРЕКРЫТИЕ ───────────────────────────────
 *
 * Первая версия отчёта на одном лишь постоянном расстоянии объявила парой ДВА КОЛЛИНЕАРНЫХ
 * ФРАГМЕНТА ОДНОЙ ПРОЙМЫ. Механизм назван: у коллинеарных кусков ближайший сосед приходится на
 * КОНЦЫ друг друга, у настоящих параллельных кривых — на ВНУТРЕННИЕ точки (`overlap ≈ 0.99`).
 * Поэтому парность требует ОБОИХ признаков: CV расстояния < 0.18 И взаимное внутреннее
 * перекрытие ≥ 0.55.
 *
 * ── ПАРА ОСТАЁТСЯ ДВУМЯ ШТРИХАМИ, И ЭТО НЕ ВКУС ──────────────────────────────────────────────
 *
 * Один штрих двух параллельных строчек НЕ ВЫРАЖАЕТ (у `VectorStroke` одна осевая), а склеенный
 * путь нельзя двигать по отдельности — а двигают их именно по отдельности, потому что расстояние
 * между рядами это настройка машины. Связь между ними живёт В ИМЕНИ (`stitch_03_pair1`) и в
 * `DashPair`, а не в геометрии. У формата штриха поля `id` нет вовсе, поэтому имя выведено сюда,
 * рядом с цепочкой, и выгрузка SVG берёт его отсюда.
 *
 * ── ЧТО ЭТОТ МОДУЛЬ НЕ ДЕЛАЕТ ────────────────────────────────────────────────────────────────
 *
 * Он НЕ КЛАССИФИЦИРУЕТ. Класс компоненты считает измеритель (см. довод в шапке `trace-types.ts`):
 * второй классификатор разошёлся бы с первым первой же правкой порога и разошёлся бы молча. Здесь
 * `klass === 'dash'` — это фильтр входа, а не решение.
 *
 * Он НЕ ЧИСТИТ ГРЯЗЬ. Отсев по collinear-support — тоже работа измерителя (замер отчёта: площадной
 * фильтр даёт precision 0.512, поддержка соседей — 0.976 при recall 1.000). Сюда приходит уже
 * просеянное; одиночная компонента, не собравшая цепочки, уходит в `orphans` названной, а не
 * молча выброшенной.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ЧИСЛА ОТЧЁТА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** (a) Угол между осями двух стежков, при котором они ещё могут быть соседями по строчке. */
export const EDGE_ANGLE_DEG = 35;
/** (b) Досягаемость: минимальное расстояние между концами ≤ 3 × медианной длины стежка. */
export const EDGE_REACH_DASHES = 3;
/** (c) Хорда между ближайшими концами — в пределах 40° ОТ ОБЕИХ осей (см. ловушку первую). */
export const EDGE_CHORD_DEG = 40;
/** Вес угла в цене ребра: `cost = gap + 0.3·Δугол` (градусы). Прямое продолжение дешевле излома. */
export const EDGE_COST_ANGLE = 0.3;

/**
 * КОНУС, А НЕ ПОЛОСА. Отчёт: `perp > max(1.5·w, 2.0) + 0.12·|proj|` — отбраковка. Полоса
 * постоянной ширины либо пропускает соседний РЯД двойной строчки, либо режет дугу; конус,
 * расходящийся с расстоянием, не делает ни того ни другого.
 */
export const CONE_WIDTH_K = 1.5;
export const CONE_BASE = 2;
export const CONE_SLOPE = 0.12;

/** Похожая площадь — один из четырёх совместных признаков «пунктир, а не шум JPEG». */
export const AREA_RATIO_LO = 0.4;
export const AREA_RATIO_HI = 2.5;

/**
 * ВТОРОЙ ПРОХОД. Ворота по касательной — те же 35°, что у слияния разрывов в разделе 7 отчёта
 * (иначе соединяются T-стыки).
 */
export const MERGE_TANGENT_DEG = 35;
/**
 * Потолок промежутка, который второй проход берётся мостить, В ПЕРИОДАХ строчки.
 *
 * ⚠ ЧИСЛА У ОТЧЁТА ЗДЕСЬ НЕТ, И ЭТО НАЗВАНО ВСЛУХ. Отчёт говорит, ЧТО второй проход чинит
 * (разрыв там, где строчка пересекает шов) и что окончательную склейку двух фрагментов одной
 * строчки человек обязан подтвердить глазами (раздел 11, пункт 2). Шесть периодов — выбор этого
 * модуля: разрыв от поглощения одного шва — это единицы стежков, а не десятки, и всё, что дальше,
 * уже неотличимо от «две разные строчки на одной прямой».
 */
export const MERGE_GAP_PERIODS = 6;
/**
 * «MERIT RAMP» вместо жёсткого порога — приём из литературы, на которую ссылается отчёт (Dori &
 * Liu, GREC 1995; Applied Sciences 14(10):4023). Чем длиннее мост, тем строже требование к
 * касательным: на нулевом промежутке допускается все 35°, на предельном — 40 % от них.
 */
export const MERGE_RAMP = 0.6;

/** Парность: коэффициент вариации расстояния между двумя осевыми. */
export const PAIR_CV_MAX = 0.18;
/** Парность: взаимное ВНУТРЕННЕЕ перекрытие (см. ловушку вторую). */
export const PAIR_MIN_OVERLAP = 0.55;
/**
 * Проб на осевую при поиске пары. 64 даёт перекрытие настоящей пары ≈ 0.97 — как в отчёте.
 *
 * Отдельного порога «сколько проб нужно, чтобы медиана и CV что-то значили» здесь НЕТ, и это не
 * упущение: ворота перекрытия уже требуют, чтобы ВНУТРЕННИМИ были ≥ 55 % проб, то есть не меньше
 * 35 из 64 с каждой стороны. Второй порог поверх него однажды уже стоял и оказался вредным — он
 * срабатывал РАНЬШЕ ворот перекрытия и тем делал их непроверяемыми: у двух коллинеарных фрагментов
 * внутренних проб нет вовсе, счёт обрывался, и уронить ворота было нечем.
 */
const PAIR_SAMPLES = 64;

/**
 * СКОЛЬКО СТЕЖКОВ ДЕЛАЮТ СТРОЧКУ. Два стежка дают ОДИН промежуток: у такой «строчки» нет ни
 * медианы шага, ни разброса, то есть измерить у неё нечего. Три — минимум, на котором ритм
 * существует как величина.
 */
export const MIN_CHAIN_MEMBERS = 3;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ЧТО ОТДАЁТСЯ НАРУЖУ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type DashChain = {
  id: number;
  /**
   * Имя объекта, оно же `id` в панели слоёв редактора-приёмника. Схема отчёта
   * `<layer>_<index>[_<relation>]`: только ASCII, без пробелов, без ведущих цифр, уникальные —
   * дубликаты молча теряются при импорте в Illustrator.
   */
  name: string;
  /** Компоненты цепочки в порядке обхода. */
  members: number[];
  /** Центроиды стежков в порядке обхода, В ПИКСЕЛЯХ РАСТРА. */
  centres: [number, number][];
  /** Сглаженная и пересемплированная осевая, в пикселях растра. */
  spine: [number, number][];
  /** Медианная длина скелета стежка, px — «сколько нити на поверхности». */
  dash: number;
  /** Медианный промежуток между концами соседних стежков, px. */
  gap: number;
  /** `dash + gap` — период строчки, px. */
  period: number;
  /** Медианное расстояние между центроидами соседей, px. Сверка периода вторым способом. */
  pitch: number;
  /** Медианная толщина стежка, px (`w = 2·median(dt) − 1`, посчитано измерителем). */
  width: number;
  /** Длина осевой, px. */
  length: number;
  /** Наибольшее удаление центроида стежка от готовой кривой, px. */
  deviation: number;
  /** Номер пары, если эта строчка — половина двойной. */
  pairId: number | null;
  stroke: VectorStroke;
};

export type DashPair = {
  id: number;
  /** Идентификаторы двух цепочек. Они ОСТАЮТСЯ двумя — см. довод в шапке. */
  a: number;
  b: number;
  /** Медианное расстояние между осевыми, px. */
  separation: number;
  /** Коэффициент вариации расстояния. У настоящей пары ~0, у случайного соседства — большой. */
  cv: number;
  /** Взаимное внутреннее перекрытие, min из двух долей. */
  overlap: number;
};

export type DashSolution = {
  chains: DashChain[];
  pairs: DashPair[];
  /** Те же цепочки штрихами, в порядке `chains`. */
  strokes: VectorStroke[];
  /** Компоненты класса `dash`, не собравшие цепочки. Названы, а не выброшены молча. */
  orphans: number[];
  /** То, что человек обязан прочитать. */
  notes: string[];
};

export type DashOptions = {
  /** Допуск фита Шнайдера, px. Отчёт: 0.3–0.5 для флэтов. */
  tolerance?: number;
  /** Порог разреза по углу, градусы. Отчёт: 20°. */
  corner?: number;
  /** Сколько стежков минимум составляют строчку. */
  minMembers?: number;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// АРИФМЕТИКА
// ─────────────────────────────────────────────────────────────────────────────────────────────

const DEG = 180 / Math.PI;
const EPS = 1e-9;

function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Угол между двумя НЕНАПРАВЛЕННЫМИ осями, 0..90°. У линии нет направления — отсюда модуль. */
function axisAngle(ax: number, ay: number, bx: number, by: number): number {
  const d = Math.abs(ax * bx + ay * by);
  return Math.acos(Math.min(1, d)) * DEG;
}

/** Угол между двумя НАПРАВЛЕНИЯМИ, 0..180°. Для касательных, у которых сторона важна. */
function dirAngle(ax: number, ay: number, bx: number, by: number): number {
  const d = ax * bx + ay * by;
  return Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
}

const dist = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Четыре знака — та же сетка, что у `writeLayer`; округлять дважды разными правилами нельзя. */
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СТЕЖОК
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Stitch = {
  /** Индекс в массиве `stitches`, а не `TraceComponent.id`: граф считает по своим номерам. */
  k: number;
  id: number;
  cx: number;
  cy: number;
  /** Единичная ось (из `theta`). */
  ux: number;
  uy: number;
  len: number;
  w: number;
  area: number;
  /** Два конца стежка: те, что дальше всего друг от друга. */
  tips: [[number, number], [number, number]];
};

/**
 * КОНЦЫ СТЕЖКА. Берутся у измерителя (`ends` — точки скелета степени 1), и только если их там нет
 * или меньше двух, достраиваются от центроида вдоль оси.
 *
 * Достройка — не «на всякий случай»: у стежка, чей скелет выродился в одну точку (короткая
 * жирная закрепка), концов степени 1 может не быть ВООБЩЕ, и без этой ветки такой стежок не
 * получил бы ни одного ребра — то есть выпал бы из строчки молча.
 */
function stitchTips(c: TraceComponent, ux: number, uy: number, len: number): Stitch['tips'] {
  const ends = Array.isArray(c.ends) ? c.ends.filter((e) => Array.isArray(e) && e.length >= 2) : [];
  if (ends.length >= 2) {
    let bi = 0;
    let bj = 1;
    let best = -1;
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const d = dist(ends[i], ends[j]);
        if (d > best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    return [
      [ends[bi][0], ends[bi][1]],
      [ends[bj][0], ends[bj][1]],
    ];
  }
  const h = len / 2;
  return [
    [c.cx - ux * h, c.cy - uy * h],
    [c.cx + ux * h, c.cy + uy * h],
  ];
}

function buildStitches(components: readonly TraceComponent[]): Stitch[] {
  const out: Stitch[] = [];
  for (const c of components) {
    if (c.klass !== 'dash') continue;
    if (!Number.isFinite(c.cx) || !Number.isFinite(c.cy)) continue;
    const theta = Number.isFinite(c.theta) ? c.theta : 0;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const len = Math.max(1, Number.isFinite(c.skelLength) ? c.skelLength : 1);
    out.push({
      k: out.length,
      id: c.id,
      cx: c.cx,
      cy: c.cy,
      ux,
      uy,
      len,
      w: Math.max(0.5, Number.isFinite(c.width) ? c.width : 1),
      area: Math.max(1, Number.isFinite(c.area) ? c.area : 1),
      tips: stitchTips(c, ux, uy, len),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ГРАФ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ЧЬИ ОСИ ЧИТАЕТ ПРОВЕРКА ХОРДЫ. Ответ — двух ЭТИХ стежков, и он вынесен в отдельную функцию
 * именно потому, что это единственное место во всём решателе, где можно ошибиться необратимо:
 * подставь сюда одну прямую, подогнанную по накопленной цепочке (или, того хуже, по всему
 * чертежу), — и алгоритм пойдёт по прямым участкам и встанет на дуге проймы. Замер отчёта на этом
 * и построен: `HoughLinesP` мостит прямые и НЕ идёт по дуге, граф над стежками — идёт.
 */
function chordAxes(a: Stitch, b: Stitch): [[number, number], [number, number]] {
  return [
    [a.ux, a.uy],
    [b.ux, b.uy],
  ];
}

/** Ближайшая пара концов двух стежков и расстояние между ними. */
function nearestTips(
  a: Stitch,
  b: Stitch,
): { d: number; from: [number, number]; to: [number, number] } {
  let best = Infinity;
  let from = a.tips[0];
  let to = b.tips[0];
  for (const p of a.tips) {
    for (const q of b.tips) {
      const d = dist(p, q);
      if (d < best) {
        best = d;
        from = p;
        to = q;
      }
    }
  }
  return { d: best, from, to };
}

type Edge = { a: number; b: number; cost: number };

function buildEdges(stitches: readonly Stitch[], medLen: number): Edge[] {
  const reach = EDGE_REACH_DASHES * medLen;
  const edges: Edge[] = [];
  if (stitches.length < 2) return edges;

  // СЕТКА, А НЕ ВСЕ ПАРЫ. На настоящем чертеже стежков тысячи, и квадрат от их числа — это
  // миллионы проверок ради соседей, которые физически не могут оказаться рядом.
  const cell = Math.max(1, reach + medLen);
  const buckets = new Map<string, number[]>();
  const key = (gx: number, gy: number) => `${gx}|${gy}`;
  for (const s of stitches) {
    const k = key(Math.floor(s.cx / cell), Math.floor(s.cy / cell));
    const list = buckets.get(k);
    if (list) list.push(s.k);
    else buckets.set(k, [s.k]);
  }

  for (const a of stitches) {
    const gx = Math.floor(a.cx / cell);
    const gy = Math.floor(a.cy / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(key(gx + dx, gy + dy));
        if (!list) continue;
        for (const kb of list) {
          if (kb <= a.k) continue;
          const b = stitches[kb];
          const e = edgeBetween(a, b, reach);
          if (e) edges.push(e);
        }
      }
    }
  }
  return edges;
}

/** Три условия отчёта плюс конус и подобие площади. Возвращает ребро или `null`. */
function edgeBetween(a: Stitch, b: Stitch, reach: number): Edge | null {
  // (a) ОРИЕНТАЦИЯ.
  const dTheta = axisAngle(a.ux, a.uy, b.ux, b.uy);
  if (dTheta >= EDGE_ANGLE_DEG) return null;

  // Подобие площади — один из четырёх совместных признаков «пунктир, а не шум».
  const ratio = a.area / b.area;
  if (ratio <= AREA_RATIO_LO || ratio >= AREA_RATIO_HI) return null;

  // (b) ДОСЯГАЕМОСТЬ, по КОНЦАМ, а не по центроидам: у длинного стежка центроид далеко от края.
  const near = nearestTips(a, b);
  if (!(near.d <= reach)) return null;

  // (c) ХОРДА — ОТНОСИТЕЛЬНО ОСЕЙ ОБОИХ СТЕЖКОВ.
  const chx = near.to[0] - near.from[0];
  const chy = near.to[1] - near.from[1];
  const chl = Math.hypot(chx, chy);
  if (chl > EPS) {
    const [ua, ub] = chordAxes(a, b);
    const cx = chx / chl;
    const cy = chy / chl;
    if (axisAngle(cx, cy, ua[0], ua[1]) >= EDGE_CHORD_DEG) return null;
    if (axisAngle(cx, cy, ub[0], ub[1]) >= EDGE_CHORD_DEG) return null;
  }

  // КОНУС, А НЕ ПОЛОСА — и тоже относительно осей обоих. Это то, что отсекает СОСЕДНИЙ РЯД
  // двойной строчки: стежок через два периода наискось проходит проверку хорды (угол мал), но
  // его поперечный вынос не помещается в конус.
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  for (const s of [a, b]) {
    const proj = dx * s.ux + dy * s.uy;
    const perp = Math.abs(dx * s.uy - dy * s.ux);
    if (perp > Math.max(CONE_WIDTH_K * s.w, CONE_BASE) + CONE_SLOPE * Math.abs(proj)) return null;
  }

  return { a: a.k, b: b.k, cost: near.d + EDGE_COST_ANGLE * dTheta };
}

/**
 * ЖАДНЫЙ ОСТОВ СО СТЕПЕНЬЮ ≤ 2. Ограничение степени — это и есть разница между ЦЕПОЧКАМИ и
 * КЛЯКСАМИ: без него узел в месте, где две строчки сходятся, собрал бы обе в одну звезду, и
 * «строчка» перестала бы быть последовательностью.
 */
function greedyChains(n: number, edges: readonly Edge[]): number[][] {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };

  const deg = new Int32Array(n);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const sorted = [...edges].sort((p, q) => p.cost - q.cost || p.a - q.a || p.b - q.b);
  for (const e of sorted) {
    if (deg[e.a] >= 2 || deg[e.b] >= 2) continue;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    deg[e.a]++;
    deg[e.b]++;
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }

  // ОБХОД ОТ УЗЛОВ СТЕПЕНИ ≤ 1, затем добор всего, что осталось. Остаться после первого прохода
  // может только цикл; союз-найденное дерево их не порождает, но обход написан так, чтобы цикл
  // вышел цепочкой, а не потерялся: потерянная строчка выглядит на экране как отсутствующая.
  const seen = new Uint8Array(n);
  const chains: number[][] = [];
  const walk = (start: number) => {
    const path = [start];
    seen[start] = 1;
    let prev = -1;
    let cur = start;
    for (;;) {
      const next = adj[cur].find((v) => v !== prev && !seen[v]);
      if (next === undefined) break;
      seen[next] = 1;
      path.push(next);
      prev = cur;
      cur = next;
    }
    chains.push(path);
  };
  for (let i = 0; i < n; i++) if (!seen[i] && deg[i] <= 1) walk(i);
  for (let i = 0; i < n; i++) if (!seen[i]) walk(i);
  return chains;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ВТОРОЙ ПРОХОД: ЦЕПОЧКИ, ЧЬИ КАСАТЕЛЬНЫЕ ПРОДОЛЖАЮТ ДРУГ ДРУГА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * КАСАТЕЛЬНАЯ НА КОНЦЕ ЦЕПОЧКИ, НАПРАВЛЕННАЯ НАРУЖУ.
 *
 * Окно в три центроида, а не в два: по двум точкам направление равно хорде последнего промежутка,
 * и на дуге оно отстаёт от настоящей касательной ровно на пол-периода. По трём отставание вдвое
 * меньше, а шум одного центроида уже усредняется.
 */
function endTangent(centres: readonly [number, number][], atHead: boolean): [number, number] {
  const n = centres.length;
  const p = atHead ? centres[0] : centres[n - 1];
  const take = Math.min(3, n);
  if (take < 2) return [1, 0];
  let sx = 0;
  let sy = 0;
  for (let j = 1; j < take; j++) {
    const q = atHead ? centres[j] : centres[n - 1 - j];
    sx += q[0];
    sy += q[1];
  }
  const m = take - 1;
  const vx = p[0] - sx / m;
  const vy = p[1] - sy / m;
  const l = Math.hypot(vx, vy);
  if (l < EPS) return [1, 0];
  return [vx / l, vy / l];
}

type MergeCandidate = {
  ca: number;
  headA: boolean;
  cb: number;
  headB: boolean;
  gap: number;
  cost: number;
};

/**
 * Слить цепочки, чьи концевые касательные продолжают друг друга. Чинит разрыв там, где строчка
 * пересекает шов и часть стежков поглощена его компонентой (замер отчёта: 9 из 19 стежков проймы).
 *
 * ⚠ ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ РЕШАТЕЛЬ ДОГАДЫВАЕТСЯ, А НЕ МЕРЯЕТ. Отчёт называет окончательную
 * склейку двух фрагментов одной строчки среди того, что «автоматика надёжно не чинит», и требует
 * подтверждения глазами. Поэтому каждое слияние уходит в `notes` числом, а не молча.
 */
function mergeChains(
  chains: number[][],
  stitches: readonly Stitch[],
  period: number,
  notes: string[],
): number[][] {
  const maxGap = MERGE_GAP_PERIODS * Math.max(1, period);
  const alive = chains.map((c) => c.slice());
  const centresOf = (c: number[]): [number, number][] =>
    c.map((k) => [stitches[k].cx, stitches[k].cy] as [number, number]);

  // Концевая точка — ВНЕШНИЙ конец крайнего стежка, а не его центроид: мост меряется между
  // краями краски, ровно как промежуток внутри строчки.
  const outerTip = (c: number[], atHead: boolean): [number, number] => {
    const s = stitches[atHead ? c[0] : c[c.length - 1]];
    const towards = c.length > 1 ? stitches[atHead ? c[1] : c[c.length - 2]] : null;
    if (!towards) return s.tips[0];
    return dist(s.tips[0], [towards.cx, towards.cy]) > dist(s.tips[1], [towards.cx, towards.cy])
      ? s.tips[0]
      : s.tips[1];
  };

  const cands: MergeCandidate[] = [];
  for (let i = 0; i < alive.length; i++) {
    // ⚠ ОДИНОЧНЫЙ СТЕЖОК ВО ВТОРОЙ ПРОХОД НЕ ХОДИТ, И ЭТО НЕ СТРОГОСТЬ РАДИ СТРОГОСТИ.
    //
    // Второй проход по определению отчёта сшивает цепочки, «чьи КАСАТЕЛЬНЫЕ НА КОНЦАХ продолжают
    // друг друга». У одинокой компоненты касательной нет — есть ось, и она НЕНАПРАВЛЕННАЯ, то есть
    // ворота по касательной для неё вырождаются в «лежит ли сосед примерно вдоль». С такими
    // воротами проход перестаёт быть починкой разрыва и становится ВТОРЫМ, СЛАБЕЙШИМ построителем
    // графа: замерено — при сломанной проверке хорды он собирал все 234 стежка обратно в те же
    // 7 строчек, и поломка графа не показывалась НИГДЕ. Сторож, которого нельзя уронить, не
    // сторож; проход обязан чинить только то, что граф уже собрал в прогон.
    if (alive[i].length < 2) continue;
    for (let j = i + 1; j < alive.length; j++) {
      if (alive[j].length < 2) continue;
      for (const headA of [true, false]) {
        for (const headB of [true, false]) {
          const pa = outerTip(alive[i], headA);
          const pb = outerTip(alive[j], headB);
          const gap = dist(pa, pb);
          if (gap > maxGap) continue;
          const vx = pb[0] - pa[0];
          const vy = pb[1] - pa[1];
          const vl = Math.hypot(vx, vy);
          if (vl < EPS) continue;
          const ux = vx / vl;
          const uy = vy / vl;
          const ta = endTangent(centresOf(alive[i]), headA);
          const tb = endTangent(centresOf(alive[j]), headB);
          // MERIT RAMP: длинный мост требует более прямой касательной, чем короткий.
          const allowed = MERGE_TANGENT_DEG * (1 - MERGE_RAMP * Math.min(1, gap / maxGap));
          const angA = dirAngle(ta[0], ta[1], ux, uy);
          const angB = dirAngle(tb[0], tb[1], -ux, -uy);
          if (angA > allowed || angB > allowed) continue;
          cands.push({ ca: i, headA, cb: j, headB, gap, cost: gap + EDGE_COST_ANGLE * (angA + angB) });
        }
      }
    }
  }
  cands.sort((p, q) => p.cost - q.cost || p.ca - q.ca || p.cb - q.cb);

  const parent = new Int32Array(alive.length);
  for (let i = 0; i < alive.length; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  // Конец занят — у цепочки их ровно два, и каждый может быть склеен один раз.
  const used = alive.map(() => ({ head: false, tail: false }));
  const glue: { a: number; headA: boolean; b: number; headB: boolean }[] = [];
  for (const c of cands) {
    const ua = c.headA ? used[c.ca].head : used[c.ca].tail;
    const ub = c.headB ? used[c.cb].head : used[c.cb].tail;
    if (ua || ub) continue;
    if (find(c.ca) === find(c.cb)) continue;
    parent[find(c.ca)] = find(c.cb);
    if (c.headA) used[c.ca].head = true;
    else used[c.ca].tail = true;
    if (c.headB) used[c.cb].head = true;
    else used[c.cb].tail = true;
    glue.push({ a: c.ca, headA: c.headA, b: c.cb, headB: c.headB });
    notes.push(
      `two runs ${c.gap.toFixed(0)} px apart were joined into one: their end tangents continue ` +
        `each other. Confirm the join by eye — a stitch row broken by a seam and two different ` +
        `rows on the same line look identical to the geometry.`,
    );
  }

  if (!glue.length) return alive;

  // Склейка: цепочки соединяются в том порядке, в каком приняты, разворачиваясь по нужному концу.
  const seq: (number[] | null)[] = alive.map((c) => c.slice());
  for (const g of glue) {
    let ia = -1;
    let ib = -1;
    for (let i = 0; i < seq.length; i++) {
      const s = seq[i];
      if (!s) continue;
      if (s.includes(alive[g.a][0])) ia = i;
      if (s.includes(alive[g.b][0])) ib = i;
    }
    if (ia < 0 || ib < 0 || ia === ib) continue;
    const A = seq[ia] as number[];
    const B = seq[ib] as number[];
    const endA = g.headA ? alive[g.a][0] : alive[g.a][alive[g.a].length - 1];
    const endB = g.headB ? alive[g.b][0] : alive[g.b][alive[g.b].length - 1];
    const a2 = A[A.length - 1] === endA ? A : A[0] === endA ? A.slice().reverse() : null;
    const b2 = B[0] === endB ? B : B[B.length - 1] === endB ? B.slice().reverse() : null;
    if (!a2 || !b2) continue;
    seq[ia] = a2.concat(b2);
    seq[ib] = null;
  }
  return seq.filter(Boolean) as number[][];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СГЛАЖИВАЮЩИЙ СПЛАЙН
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * СГЛАЖИВАЮЩИЙ СПЛАЙН ЧЕРЕЗ ЦЕНТРОИДЫ, критерий отчёта — `s = n·(w/2)²`.
 *
 * ЗАЧЕМ ОН ВООБЩЕ НУЖЕН. Центроид стежка — это не точка кривой, а среднее пятна краски, и он
 * гуляет вокруг настоящей осевой на доли толщины: край стежка обрублен наклонной решёткой,
 * поглощённый шов подъедает один конец, JPEG двигает границу. Кривая, ВЫНУЖДЕННАЯ пройти через
 * все центроиды, наследует эту рябь и платит за неё узлами — ровно та «many-node mush», которую
 * `vector-trace.ts` запрещает в своей шапке.
 *
 * ЧТО ИМЕННО МИНИМИЗИРУЕТСЯ: `Σ|p−q|² + λ·Σ|p₋−2p+p₊|²`. Первое слагаемое держит кривую у данных,
 * второе штрафует ИЗЛОМ. Система пятидиагональная и решается разложением Холецкого по ленте.
 * `λ` подбирается делением пополам так, чтобы средний квадрат невязки вышел на `(w/2)²` — то есть
 * ровно на бюджет отчёта, а не на «сколько получилось».
 *
 * ⚠ ШТРАФ СТОИТ В ПРОСТРАНСТВЕ ИНДЕКСОВ, А НЕ ДЛИНЫ ДУГИ, и это названо вслух. Для строчки это
 * почти одно и то же — стежки стоят с постоянным шагом, в этом и состоит определение строчки, —
 * но на цепочке с резко разным шагом (склеенные фрагменты по разные стороны широкого моста) штраф
 * распределён не так, как распределила бы длина. Цена ошибки здесь — доли пикселя на мосту, и она
 * не стоит второго алгоритма.
 */
function smoothingSpline(q: readonly [number, number][], w: number): [number, number][] {
  const n = q.length;
  if (n < 4) return q.map((p) => [p[0], p[1]]);
  const target = (w / 2) ** 2;

  const qx = q.map((p) => p[0]);
  const qy = q.map((p) => p[1]);

  // Ленты матрицы λ·DᵀD, посчитанные накоплением по строкам D (вторая разность 1, −2, 1).
  const base0 = new Float64Array(n);
  const base1 = new Float64Array(n);
  const base2 = new Float64Array(n);
  for (let r = 0; r + 2 < n; r++) {
    base0[r] += 1;
    base0[r + 1] += 4;
    base0[r + 2] += 1;
    base1[r] += -2;
    base1[r + 1] += -2;
    base2[r] += 1;
  }

  const solve = (lambda: number): [number[], number[]] => {
    const d0 = new Float64Array(n);
    const d1 = new Float64Array(n);
    const d2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      d0[i] = 1 + lambda * base0[i];
      d1[i] = lambda * base1[i];
      d2[i] = lambda * base2[i];
    }
    // Холецкий по ленте полуширины 2.
    const l0 = new Float64Array(n);
    const l1 = new Float64Array(n);
    const l2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = i >= 1 ? l1[i - 1] : 0;
      const b = i >= 2 ? l2[i - 2] : 0;
      const s = d0[i] - a * a - b * b;
      l0[i] = Math.sqrt(Math.max(s, 1e-12));
      if (i + 1 < n) l1[i] = (d1[i] - (i >= 1 ? l2[i - 1] * l1[i - 1] : 0)) / l0[i];
      if (i + 2 < n) l2[i] = d2[i] / l0[i];
    }
    const run = (rhs: number[]): number[] => {
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let v = rhs[i];
        if (i >= 1) v -= l1[i - 1] * y[i - 1];
        if (i >= 2) v -= l2[i - 2] * y[i - 2];
        y[i] = v / l0[i];
      }
      const x = new Array<number>(n);
      for (let i = n - 1; i >= 0; i--) {
        let v = y[i];
        if (i + 1 < n) v -= l1[i] * x[i + 1];
        if (i + 2 < n) v -= l2[i] * x[i + 2];
        x[i] = v / l0[i];
      }
      return x;
    };
    return [run(qx), run(qy)];
  };

  const residual = (px: number[], py: number[]) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += (px[i] - qx[i]) ** 2 + (py[i] - qy[i]) ** 2;
    return s / n;
  };

  // Деление пополам по логарифму λ: невязка растёт по λ монотонно, поэтому корень один.
  let lo = 1e-6;
  let hi = 1e10;
  let [px, py] = solve(hi);
  if (residual(px, py) <= target) return px.map((x, i) => [x, py[i]] as [number, number]);
  for (let step = 0; step < 48; step++) {
    const mid = Math.sqrt(lo * hi);
    const [ax, ay] = solve(mid);
    if (residual(ax, ay) > target) hi = mid;
    else lo = mid;
  }
  const [fx, fy] = solve(lo);
  return fx.map((x, i) => [x, fy[i]] as [number, number]);
}

/**
 * РЕСЕМПЛИНГ. Сглаженные узлы протягиваются равномерным Катмулл–Ромом и снимаются с шагом
 * `sampleStep` — фиту нужна ПЛОТНАЯ выборка кривой, а не редкие центроиды: на редких он объявил
 * бы прямой каждый пролёт между стежками и собрал бы дугу многоугольником.
 *
 * Катмулл–Ром равномерный, а не центростремительный: узлы стоят почти с постоянным шагом (это и
 * есть строчка), и на таких узлах обе параметризации совпадают.
 */
function resample(knots: readonly [number, number][], sampleStep: number): [number, number][] {
  const n = knots.length;
  if (n < 2) return knots.map((p) => [p[0], p[1]]);
  const at = (i: number) => knots[Math.max(0, Math.min(n - 1, i))];
  const out: [number, number][] = [[knots[0][0], knots[0][1]]];
  for (let i = 0; i + 1 < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const span = dist(p1, p2);
    const sub = Math.max(1, Math.min(64, Math.round(span / Math.max(0.25, sampleStep))));
    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ЗАМЕР ЦЕПОЧКИ
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Measured = { dash: number; gap: number; period: number; pitch: number; width: number };

function measureChain(chain: readonly number[], stitches: readonly Stitch[]): Measured {
  const dashes = chain.map((k) => stitches[k].len);
  const widths = chain.map((k) => stitches[k].w);
  const gaps: number[] = [];
  const pitches: number[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = stitches[chain[i]];
    const b = stitches[chain[i + 1]];
    gaps.push(nearestTips(a, b).d);
    pitches.push(Math.hypot(a.cx - b.cx, a.cy - b.cy));
  }
  const dash = median(dashes);
  const gap = median(gaps);
  return { dash, gap, period: dash + gap, pitch: median(pitches), width: median(widths) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПАРНОСТЬ
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Polyline = { pts: [number, number][]; cum: number[]; length: number };

function polyline(pts: readonly [number, number][]): Polyline {
  const p = pts.map((q) => [q[0], q[1]] as [number, number]);
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + dist(p[i - 1], p[i]));
  return { pts: p, cum, length: cum[cum.length - 1] ?? 0 };
}

/** Ближайшая точка ломаной: расстояние и её положение ПО ДЛИНЕ ДУГИ. */
function nearestOn(poly: Polyline, p: readonly [number, number]): { d: number; u: number } {
  let best = Infinity;
  let u = 0;
  for (let i = 0; i + 1 < poly.pts.length; i++) {
    const a = poly.pts[i];
    const b = poly.pts[i + 1];
    const r = projectOnSegment({ x: p[0], y: p[1] }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
    if (r.dist < best) {
      best = r.dist;
      u = poly.cum[i] + r.t * (poly.cum[i + 1] - poly.cum[i]);
    }
  }
  return { d: best, u };
}

function sampleAlong(poly: Polyline, count: number): [number, number][] {
  if (poly.length <= EPS) return poly.pts.slice(0, 1);
  const out: [number, number][] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const want = (poly.length * i) / (count - 1 || 1);
    while (seg + 2 < poly.pts.length && poly.cum[seg + 1] < want) seg++;
    const l0 = poly.cum[seg];
    const l1 = poly.cum[seg + 1];
    const t = l1 - l0 > EPS ? (want - l0) / (l1 - l0) : 0;
    const a = poly.pts[seg];
    const b = poly.pts[seg + 1];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * ОДИНАРНАЯ ИЛИ ДВОЙНАЯ. Постоянное расстояние — НЕОБХОДИМО, но НЕ ДОСТАТОЧНО, и цена этой ошибки
 * уже уплачена в отчёте: два коллинеарных фрагмента одной проймы стоят друг от друга на
 * постоянном расстоянии тоже, и первая версия объявила их парой.
 *
 * Разводит их ВЗАИМНОЕ ВНУТРЕННЕЕ ПЕРЕКРЫТИЕ: у коллинеарных кусков ближайшая точка соседа
 * приходится на его КОНЕЦ (проекция упирается в край и там и остаётся), у настоящих параллельных
 * кривых — на внутренние точки, и доля таких проб ≈ 0.99.
 */
function measurePair(a: Polyline, b: Polyline): { separation: number; cv: number; overlap: number } | null {
  if (a.length <= EPS || b.length <= EPS) return null;
  // ДВА ЗАМЕРА, А НЕ ОДИН С ФИЛЬТРОМ. Расстояние меряется по ВСЕМ пробам, перекрытие — отдельным
  // счётом внутренних. Пока расстояние считалось только по внутренним, у двух коллинеарных
  // фрагментов внутренних проб не было ВОВСЕ, счёт обрывался раньше ворот перекрытия, и ворота
  // нельзя было уронить — то есть проверить их было нечем. Замерено: `pair-overlap-gate-off`
  // молчала на всех стендах.
  const side = (from: Polyline, onto: Polyline) => {
    const probes = sampleAlong(from, PAIR_SAMPLES);
    const ds: number[] = [];
    let interior = 0;
    const edge = onto.length * 1e-6;
    for (const p of probes) {
      const r = nearestOn(onto, p);
      if (r.u > edge && r.u < onto.length - edge) interior++;
      ds.push(r.d);
    }
    return { frac: interior / Math.max(1, probes.length), ds };
  };
  const ab = side(a, b);
  const ba = side(b, a);
  const overlap = Math.min(ab.frac, ba.frac);
  const all = ab.ds.concat(ba.ds);
  if (!all.length) return null;
  const mean = all.reduce((s, v) => s + v, 0) / all.length;
  if (mean <= EPS) return null;
  const variance = all.reduce((s, v) => s + (v - mean) ** 2, 0) / all.length;
  return { separation: median(all), cv: Math.sqrt(variance) / mean, overlap };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ДВЕРЬ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Плотная выборка готовой кривой в пикселях растра — для замера и для поиска пары. */
function sampleFit(fit: OpenFit, per = 16): [number, number][] {
  const out: [number, number][] = [fit.pts[0]];
  for (let i = 0; i + 1 < fit.pts.length; i++) {
    const a = fit.pts[i];
    const b = fit.pts[i + 1];
    const g = fit.segs[i];
    if (!g) {
      out.push(b);
      continue;
    }
    for (let s = 1; s <= per; s++) {
      const t = s / per;
      const u = 1 - t;
      const f = (p0: number, c1: number, c2: number, p3: number) =>
        u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p3;
      out.push([f(a[0], g[0], g[2], b[0]), f(a[1], g[1], g[3], b[1])]);
    }
  }
  return out;
}

export function solveDashes(m: TraceMeasurement, opts: DashOptions = {}): DashSolution {
  const notes: string[] = [];
  const tolerance = opts.tolerance ?? DEFAULT_OPEN_TOLERANCE;
  const corner = opts.corner ?? DEFAULT_OPEN_CORNER;
  const minMembers = Math.max(2, Math.round(opts.minMembers ?? MIN_CHAIN_MEMBERS));

  const stitches = buildStitches(m.components ?? []);
  if (stitches.length < minMembers) {
    return {
      chains: [],
      pairs: [],
      strokes: [],
      orphans: stitches.map((s) => s.id),
      notes: [`no dashed run here: only ${stitches.length} stitch-sized marks were measured.`],
    };
  }

  const medLen = median(stitches.map((s) => s.len));
  const edges = buildEdges(stitches, medLen);
  let chains = greedyChains(stitches.length, edges);

  // Период для второго прохода берётся ПО ВСЕМ цепочкам сразу: у фрагмента из четырёх стежков
  // своя медиана шумна, а мост между фрагментами меряется в периодах ТОЙ ЖЕ строчки.
  const roughPeriods = chains
    .filter((c) => c.length >= 2)
    .map((c) => measureChain(c, stitches).period);
  const globalPeriod = roughPeriods.length ? median(roughPeriods) : medLen;
  chains = mergeChains(chains, stitches, globalPeriod, notes);

  const orphans: number[] = [];
  const kept = chains.filter((c) => {
    if (c.length >= minMembers) return true;
    for (const k of c) orphans.push(stitches[k].id);
    return false;
  });

  // Порядок вывода детерминирован: длинные строчки первыми, ничьи разводятся положением. Имя
  // объекта берётся отсюда, поэтому «одна и та же картинка — те же имена» обязано выполняться.
  kept.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const sa = stitches[a[0]];
    const sb = stitches[b[0]];
    return sa.cx - sb.cx || sa.cy - sb.cy;
  });

  const W = Math.max(1, m.w);
  const H = Math.max(1, m.h);
  const chainsOut: DashChain[] = [];
  const polys: Polyline[] = [];

  for (const c of kept) {
    const centres = c.map((k) => [stitches[k].cx, stitches[k].cy] as [number, number]);
    const meas = measureChain(c, stitches);
    const knots = smoothingSpline(centres, meas.width);
    const spine = resample(knots, Math.max(0.5, meas.period / 4));
    const fit = fitOpenPath(spine, { tolerance, corner });
    if (!fit) {
      for (const k of c) orphans.push(stitches[k].id);
      continue;
    }

    const dense = sampleFit(fit);
    const poly = polyline(dense);
    let deviation = 0;
    for (const p of centres) deviation = Math.max(deviation, nearestOn(poly, p).d);

    // ПИКСЕЛЬ РАСТРА → ПИКСЕЛЬ ПЛАТЫ. `gauge` и `step` названы в мире шириной `GAUGE_REF`, и
    // переводятся ШИРИНОЙ — той же величиной, которой этот мир и определён. Для неквадратного
    // кадра это значит, что толщина вертикальной и горизонтальной линии переведены одинаково,
    // а не каждая своей осью: у толщины одна величина, и второй у неё быть не может.
    const toPlate = GAUGE_REF / W;
    const gauge = roundGauge(meas.width * toPlate);
    const step = roundStep(meas.period * toPlate);

    const stroke: VectorStroke = {
      tool: 'curve',
      // `plain` — ЧЕСТНЫЙ ОТВЕТ. Измерено, что строчка ПУНКТИРНАЯ и с каким ритмом; КАКАЯ МАШИНА
      // её проложила, из пикселей не выводится вовсе, и назвать её здесь `lock` значило бы выдать
      // догадку за замер. Вид шва ставит человек — на то он и вид шва.
      brush: 'plain',
      weight: gaugeWeight(gauge),
      dashed: true,
      pts: fit.pts.map(([x, y]) => [round4(x / W), round4(y / H)] as [number, number]),
      segs: fit.segs.map((g) =>
        g ? ([round4(g[0] / W), round4(g[1] / H), round4(g[2] / W), round4(g[3] / H)] as CubicSeg) : null,
      ),
      gauge,
      step,
    };

    const id = chainsOut.length;
    chainsOut.push({
      id,
      name: `stitch_${String(id + 1).padStart(2, '0')}`,
      members: c.map((k) => stitches[k].id),
      centres,
      spine,
      dash: meas.dash,
      gap: meas.gap,
      period: meas.period,
      pitch: meas.pitch,
      width: meas.width,
      length: poly.length,
      deviation,
      pairId: null,
      stroke,
    });
    polys.push(poly);
  }

  // ── ПАРЫ ──────────────────────────────────────────────────────────────────────────────────
  type Cand = { a: number; b: number; separation: number; cv: number; overlap: number };
  const cands: Cand[] = [];
  for (let i = 0; i < chainsOut.length; i++) {
    for (let j = i + 1; j < chainsOut.length; j++) {
      const r = measurePair(polys[i], polys[j]);
      if (!r) continue;
      if (r.cv >= PAIR_CV_MAX) continue;
      if (r.overlap < PAIR_MIN_OVERLAP) continue;
      cands.push({ a: i, b: j, ...r });
    }
  }
  cands.sort((p, q) => p.cv - q.cv || p.separation - q.separation || p.a - q.a);

  const pairs: DashPair[] = [];
  const taken = new Set<number>();
  for (const c of cands) {
    if (taken.has(c.a) || taken.has(c.b)) continue;
    taken.add(c.a);
    taken.add(c.b);
    const id = pairs.length + 1;
    pairs.push({ id, a: c.a, b: c.b, separation: c.separation, cv: c.cv, overlap: c.overlap });
    for (const k of [c.a, c.b]) {
      chainsOut[k].pairId = id;
      chainsOut[k].name = `${chainsOut[k].name}_pair${id}`;
    }
  }

  // ── СЛОВА ─────────────────────────────────────────────────────────────────────────────────
  notes.unshift(
    `${stitches.length} stitch-sized marks became ${chainsOut.length} dashed ` +
      `${chainsOut.length === 1 ? 'run' : 'runs'}.`,
  );
  if (orphans.length) {
    notes.push(
      `${orphans.length} mark${orphans.length === 1 ? '' : 's'} joined no run and ${
        orphans.length === 1 ? 'was' : 'were'
      } left out: fewer than ${minMembers} stitches in a line is not a rhythm anything can measure.`,
    );
  }
  for (const p of pairs) {
    notes.push(
      `${chainsOut[p.a].name} and ${chainsOut[p.b].name} run parallel ${p.separation.toFixed(1)} px ` +
        `apart (spacing varies by ${(p.cv * 100).toFixed(1)}%, they overlap over ` +
        `${(p.overlap * 100).toFixed(0)}% of their length). They stay TWO strokes: one stroke ` +
        `cannot state two parallel rows, and a merged one cannot be moved a row at a time.`,
    );
  }
  // ⚠ ЭТО ЧИСЛО НАЗЫВАЕТСЯ ВСЛУХ, ПОТОМУ ЧТО ОНО РАЗОЙДЁТСЯ С ЭКРАНОМ, ЕСЛИ ПРОМОЛЧАТЬ.
  // `step` уходит ИЗМЕРЕННЫМ ПЕРИОДОМ, как требует спецификация; но рисовальщик штриха умножает
  // его на собственные множители фигуры (у построительного пунктира — 3.33 + 2.5 = 5.83), то есть
  // НАРИСОВАННЫЙ ритм в 5.83 раза крупнее измеренного. Калибровка — решение о ПОКАЗЕ, а не об
  // измерении, и принимать его должен тот, кто вешает панель, с этим числом в руках.
  if (chainsOut.length) {
    notes.push(
      `the measured period is stored as the stroke's stitch length verbatim. The canvas scales a ` +
        `dashed line's rhythm by its own shape constants, so what is drawn is coarser than what ` +
        `was measured — calibrate at the panel, not here.`,
    );
  }

  return { chains: chainsOut, pairs, strokes: chainsOut.map((c) => c.stroke), orphans, notes };
}

