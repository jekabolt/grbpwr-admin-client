import type { TraceClass, TraceComponent, TraceMeasurement } from './trace-types';
import { DEFAULT_OPEN_CORNER, DEFAULT_OPEN_TOLERANCE, fitOpenPath } from './vector-trace';
import { widthFromRadii } from './trace-width';
import {
  GAUGE_REF,
  MAX_STROKES_BYTES,
  gaugeWeight,
  writeLayer,
  type CubicSeg,
  type StitchKey,
  type VectorStroke,
} from './vector-strokes';

/**
 * ═══ Ф2 — ОСЕВАЯ ЛИНИЯ ══════════════════════════════════════════════════════════════════════
 *
 * Измерение входит (`trace-measure.ts`) — ШТРИХИ выходят. Ни одного пикселя здесь не читается
 * заново: маска, distance transform и скелет пришли готовыми, и второй бинаризации в проекте нет.
 *
 * ── ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ ОБВОДА ГРАНИЦ, И ПОЧЕМУ ВЫБОР НЕОБРАТИМ ────────────────────────────
 *
 * `vector-trace.ts` обводит ОБЛАСТЬ: у штриха толщиной 3 px две стороны, и он возвращается
 * замкнутой петлёй вокруг себя. Это верно и это правильный инструмент для 5 % рисунка — заливок:
 * пуговиц, люверсов, лейблов, силуэта под заливку.
 *
 * Здесь — МЕДИАЛЬНАЯ ОСЬ: одна открытая кривая с толщиной, названной числом. Это правильный
 * инструмент для остальных 95 % технического флэта — контура-как-обводки, швов, конструктива,
 * строчки, сгибов. Замер отчёта: осевая даёт 273–351 сегмент там, где обвод даёт 943–1069.
 *
 * ОБРАТНОЙ ОПЕРАЦИИ НЕ СУЩЕСТВУЕТ. Из двойного контура штрих не восстанавливается: отчёт проверил
 * и это — скелетизировать растр, отрисованный из выхода обвода, и трассировать скелет обратно
 * ХУЖЕ, чем трассировать оригинал (586 якорей против 536). Качество решается на шаге трассировки,
 * а не на шаге чистки, и потому режим — не галочка «качество», а ответ на вопрос «это нарисовано
 * пером или залито».
 *
 * ── ЧТО ЗДЕСЬ ПЕРЕИСПОЛЬЗОВАНО, А НЕ НАПИСАНО ЗАНОВО ─────────────────────────────────────────
 *
 * Прореживание Дугласа–Пойкера, разрез по углам > 20° и подгонка Шнайдера — всё это стоит в
 * `vector-trace.ts` и подтверждено отчётом поимённо. Здесь зовётся ОДНА его функция,
 * `fitOpenPath`, и второй копии этих трёх шагов в проекте нет. Вторая копия разошлась бы с первой
 * на первой же правке допуска, и «подогнано» значило бы в двух местах разное. Тот же `fitOpenPath`
 * зовёт и решатель пунктира — он и заведён затем, чтобы у трёх шагов был один хозяин.
 *
 * ── ЧТО ЗДЕСЬ СВОЁ ───────────────────────────────────────────────────────────────────────────
 *
 * Всё про ГРАФ, а не про кривые, и всё — про одну беду: медиальная ось РЕАЛЬНОГО чертежа не
 * является набором аккуратных линий, и привести её к нему стоит четырёх шагов.
 *
 *   1. СКЕЛЕТ → ГРАФ. Узлы — точки степени ≠ 2 (концы и перекрёстки), рёбра — цепочки между ними.
 *      Без этого шага скелет пришлось бы обходить как облако точек, и на каждом T-стыке кривая
 *      уходила бы в случайную из трёх веток.
 *   2. ОБРЕЗКА ЩЕТИНЫ. Скелет любой утоньшающей схемы отращивает короткие отростки на всяком
 *      расширении контура — это свойство самого понятия медиальной оси, а не дефект реализации.
 *   3. РОСПУСК КОРОТКИХ ЦИКЛОВ. На КОСОМ стыке утоньшение завязывает не «Y», а маленькое кольцо,
 *      у которого нет свободного конца, — и обрезка щетины его не берёт.
 *   4. СКЛЕЙКА ЦЕПОЧЕК. Всякий снятый отросток освобождает узел, и без склейки линия вернулась бы
 *      куском между каждой парой бывших перекрёстков.
 *
 * ЗАМЕРЕНО, ЧТО КАЖДЫЙ ИЗ ЭТИХ ШАГОВ СТОИТ: на стенде из четырёх сплошных линий с приклеенной к
 * ним строчкой без шага 2 возвращается 42 штриха, без шага 3 — 17, без шага 4 — 17, со всеми —
 * ровно 4. Шаги 2 и 3 при этом ЧАСТИЧНО ПЕРЕКРЫВАЮТСЯ: поодиночке ослабить любой из них стенд
 * переживает, и это сказано вслух, чтобы никто не принял их за независимые.
 *
 * ── ЧЕГО АВТОМАТИКА НЕ РЕШАЕТ, И ЭТО НАДО СКАЗАТЬ ВСЛУХ ──────────────────────────────────────
 *
 * ТОПОЛОГИЮ В ЗОНАХ ПЕРЕСЕЧЕНИЯ ДЕТАЛЕЙ. Скелет в T-стыке СТЯГИВАЕТСЯ ОТ УЗЛА: две линии,
 * сходящиеся под углом, дают в месте встречи не крест, а короткую общую перемычку, и точка их
 * пересечения смещается. Ворота по касательной чинят большинство таких мест, но вопрос «какая
 * деталь сверху» из геометрии не выводится ВООБЩЕ. Это работа человека, и панель обязана сказать
 * это словами, а не обещать чистый результат.
 */

/**
 * ТРИ ЧИСЛА ФИТА ЗДЕСЬ НЕ ЖИВУТ — ОНИ ЖИВУТ У ФИТА.
 *
 * Поворот 20°, прореживание 1.0 px и допуск 0.4 px названы в `vector-trace.ts` (`DEFAULT_OPEN_*`),
 * потому что ими пользуется не только осевая, но и решатель пунктира, и вторая запись тех же чисел
 * рядом разошлась бы с первой первой же правкой — молча, оставив два разных «дефолта».
 *
 * ДВА ЧИСЛА — СВОИ, И ОБА ПО ОДНОЙ ПРИЧИНЕ: вход у осевой идёт ПО РЕШЁТКЕ ЦЕЛЫХ ЧИСЕЛ, а у
 * пунктира — по центроидам стежков, у каждого из которых своя субпиксельная позиция.
 */

/** Радиус подпиксельной оценки оси, в точках скелета. Довод — у `smooth` в `fitOpenPath`. */
export const CENTERLINE_SMOOTH = 2;

/**
 * ДОПУСК ПРОРЕЖИВАНИЯ ДЛЯ ПОИСКА УГЛОВ — ШИРЕ, ЧЕМ 1.0 ОТЧЁТА, И ЭТО ЗАМЕРЕНО.
 *
 * Число 0.8–1.0 из отчёта — про ТОЧНОСТЬ, и здесь за точность отвечает не оно, а допуск фита:
 * прорежённая ломаная в `fitOpenPath` служит ТОЛЬКО искателем углов, сама кривая гонится по всем
 * точкам. А искателю углов 1.0 мало, и вот почему: медиальная ось ЦИФРОВОЙ прямой идёт лесенкой с
 * размахом до пикселя, прореживание с допуском 1.0 эту лесенку СОХРАНЯЕТ, и порог «поворот > 20°»
 * объявляет углом КАЖДУЮ её ступеньку.
 *
 * ЗАМЕРЕНО НА СТЕНДЕ, десятиугольный контур 9 px: при 1.0 он возвращается 216 узлами, при 1.6 —
 * ТРИДЦАТЬЮ, и наибольшее отклонение от скелета при этом не растёт (0.85 px против 0.91). Это не
 * «сглаживание ради красоты»: 216 узлов на десять сторон — это многоугольник вместо чертежа, ровно
 * та many-node mush, которую отчёт запрещает.
 */
export const CENTERLINE_RDP = 1.6;

/** Ребро короче стольких своих толщин, висящее на перекрёстке, — щетина скелета, а не линия. */
export const SPUR_FACTOR = 1.5;

/** Сколько раз повторять обрезку. Снятая щетина обнажает следующую; больше трёх не нужно ни разу. */
const TRIM_PASSES = 4;

/** Короче стольких пикселей ломаная не несёт формы и в штрих не превращается. */
const MIN_EDGE_PIXELS = 3;

export type CenterlineOptions = {
  /** Классы компонент, с которых снимается осевая. Умолчание — только сплошные штрихи. */
  include?: TraceClass[];
  tolerance?: number;
  cornerAngle?: number;
  rdpEps?: number;
  /** Радиус подпиксельной оценки оси. Ноль — фит по сырой решётке утоньшения. */
  smooth?: number;
  /** Обрезать ли щетину. Выключать — только чтобы показать, чего она стоит. */
  trim?: boolean;
  /** Пропорция кадра для честного замера байтов. Умолчание — пропорция растра. */
  ratio?: number;
  /** Чем рисовать. Толщина НЕ отсюда: она измерена и приходит из `dt`. */
  stroke?: { brush?: StitchKey; dashed?: boolean; ink?: string };
};

export type CenterlineReading = {
  strokes: VectorStroke[];
  /** Рёбер графа скелета до обрезки и сколько из них обрезано. */
  edges: number;
  trimmed: number;
  /** Узлов всего (интервалов кривой) и из них кривых. */
  nodes: number;
  curves: number;
  /** Замеренное отклонение осевой от скелета, в пикселях растра: максимум и среднее. */
  deviation: number;
  meanDeviation: number;
  /** Что эти штрихи весят на проводе и влезают ли они в потолок документа. */
  bytes: number;
  overBudget: boolean;
  /** Сколько перекрёстков осталось в результате — ровно те места, где решает человек. */
  junctions: number;
  notes: string[];
};

const NX = [1, 1, 0, -1, -1, -1, 0, 1];
const NY = [0, 1, 1, 1, 0, -1, -1, -1];
const NLEN = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/**
 * СОСЕДИ ПИКСЕЛЯ СКЕЛЕТА С УБРАННЫМИ ЛИШНИМИ ДИАГОНАЛЯМИ — то же правило, что в измерителе.
 *
 * Диагональ выбрасывается, если у её концов есть общий сосед по прямой, который тоже скелет.
 * Без этого «уголок» из трёх пикселей нёс бы три ребра вместо двух, и КАЖДЫЙ ИЗГИБ читался бы как
 * перекрёсток — то есть граф состоял бы из перекрёстков и не имел бы ни одного ребра длиннее
 * двух точек. Связность не теряется: путь через общего соседа остаётся.
 */
function neighbours(
  skel: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  out: number[],
): number {
  let n = 0;
  for (let d = 0; d < 8; d++) {
    const nx = x + NX[d];
    const ny = y + NY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (!skel[ny * w + nx]) continue;
    if (d & 1) {
      const aOk = x + NX[d] >= 0 && x + NX[d] < w && skel[y * w + (x + NX[d])];
      const bOk = y + NY[d] >= 0 && y + NY[d] < h && skel[(y + NY[d]) * w + x];
      if (aOk || bOk) continue;
    }
    out[n++] = d;
  }
  return n;
}

/** Разметка краски восьмисвязно — та же, что у измерителя, и по той же причине (диагональ). */
function labelInk(mask: Uint8Array, w: number, h: number): { lab: Int32Array; count: number } {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || lab[seed]) continue;
    count++;
    let sp = 0;
    stack[sp++] = seed;
    lab[seed] = count;
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i - x) / w;
      for (let d = 0; d < 8; d++) {
        const nx = x + NX[d];
        const ny = y + NY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!mask[j] || lab[j]) continue;
        lab[j] = count;
        stack[sp++] = j;
      }
    }
  }
  return { lab, count };
}

type Edge = {
  pts: [number, number][];
  /** Индексы концевых пикселей в общей нумерации плиты. */
  a: number;
  b: number;
  length: number;
  /** Значения dt вдоль ребра — по ним считается толщина, и по ним же она пересчитывается при склейке. */
  dts: number[];
  /** Толщина ЭТОГО ребра, а не всей компоненты. Правило — `widthFromRadii`, общее с измерителем. */
  width: number;
  comp: number;
  alive: boolean;
};

function nearestModeIndex(modes: number[], v: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < modes.length; i++) {
    const d = Math.abs(modes[i] - v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * СКЕЛЕТ → РЁБРА. Каждая цепочка от узла до узла — одно ребро; кольцо без узлов — одно замкнутое.
 *
 * ПОСЕЩЁННОСТЬ ПОМЕЧАЕТСЯ НА НАПРАВЛЕННЫХ ПОЛУРЁБРАХ, а не на пикселях: пиксель степени 3
 * принадлежит трём рёбрам сразу, и пометка «этот пиксель пройден» оборвала бы две из них.
 */
function buildEdges(
  skel: Uint8Array,
  dt: Float32Array,
  lab: Int32Array,
  w: number,
  h: number,
): Edge[] {
  const n = w * h;
  const sidx = new Int32Array(n).fill(-1);
  const spix: number[] = [];
  for (let i = 0; i < n; i++) {
    if (skel[i]) {
      sidx[i] = spix.length;
      spix.push(i);
    }
  }
  const deg = new Uint8Array(spix.length);
  const nbr: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < spix.length; k++) {
    const i = spix[k];
    const x = i % w;
    deg[k] = neighbours(skel, w, h, x, (i - x) / w, nbr);
  }
  const seen = new Uint8Array(spix.length * 8);
  const edges: Edge[] = [];

  const step = (i: number, d: number) => {
    const x = i % w;
    const y = (i - x) / w;
    return (y + NY[d]) * w + (x + NX[d]);
  };
  const opposite = (d: number) => (d + 4) & 7;

  const walk = (start: number, dir: number, stopAtStart: boolean): Edge | null => {
    const pts: [number, number][] = [[start % w, (start - (start % w)) / w]];
    const dts: number[] = [dt[start]];
    let length = 0;
    let cur = start;
    let d = dir;
    for (let guard = 0; guard < spix.length * 4; guard++) {
      seen[sidx[cur] * 8 + d] = 1;
      const nxt = step(cur, d);
      seen[sidx[nxt] * 8 + opposite(d)] = 1;
      length += NLEN[d];
      pts.push([nxt % w, (nxt - (nxt % w)) / w]);
      dts.push(dt[nxt]);
      if (stopAtStart && nxt === start) break;
      if (deg[sidx[nxt]] !== 2) {
        cur = nxt;
        break;
      }
      const cnt = neighbours(skel, w, h, nxt % w, (nxt - (nxt % w)) / w, nbr);
      let next = -1;
      for (let q = 0; q < cnt; q++) if (nbr[q] !== opposite(d)) next = nbr[q];
      if (next < 0) {
        cur = nxt;
        break;
      }
      cur = nxt;
      d = next;
    }
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    return {
      pts,
      a: start,
      b: last[1] * w + last[0],
      length,
      dts,
      width: widthFromRadii(dts),
      comp: lab[start],
      alive: true,
    };
  };

  for (let k = 0; k < spix.length; k++) {
    if (deg[k] === 2) continue;
    const i = spix[k];
    const x = i % w;
    const cnt = neighbours(skel, w, h, x, (i - x) / w, nbr);
    for (let q = 0; q < cnt; q++) {
      if (seen[k * 8 + nbr[q]]) continue;
      const e = walk(i, nbr[q], false);
      if (e) edges.push(e);
    }
    // Одинокий пиксель скелета (степень 0) — это компонента размером в точку: пятнышко грязи или
    // круглая пуговица. Ребра у неё нет, и осевой у неё нет тоже; её место — обвод границ.
  }
  // Оставшееся — КОЛЬЦА без единого узла: замкнутый контур изделия ровно таков. Он разрезается в
  // произвольной своей точке, и замкнутость хранится ПОВТОРОМ первой точки в конце — ровно так же,
  // как её хранит обвод границ. Второго написания замкнутости в формате заводить нельзя.
  for (let k = 0; k < spix.length; k++) {
    if (deg[k] !== 2) continue;
    const i = spix[k];
    const x = i % w;
    const cnt = neighbours(skel, w, h, x, (i - x) / w, nbr);
    let fresh = -1;
    for (let q = 0; q < cnt; q++) if (!seen[k * 8 + nbr[q]]) fresh = nbr[q];
    if (fresh < 0) continue;
    const e = walk(i, fresh, true);
    if (e) edges.push(e);
  }
  return edges;
}

/**
 * РАСПУСТИТЬ ПЕТЛИ, КОТОРЫЕ УТОНЬШЕНИЕ ЗАВЯЗЫВАЕТ НА КОСОМ СТЫКЕ.
 *
 * Там, где тонкая линия подходит к толстой ПОД ОСТРЫМ УГЛОМ, объединённая область имеет узкий
 * клин, и медиальная ось такого клина — не «Y», а МАЛЕНЬКОЕ КОЛЬЦО из двух-трёх рёбер длиной в
 * несколько пикселей. Замерено на стенде: девять приклеенных стежков завязали на дуге кокетки
 * двадцать рёбер вместо одного, и обрезка щетины их не берёт — у петли нет свободного конца, а
 * значит нет и того, что она обрезает.
 *
 * ПРАВИЛО: короткое ребро, ЛЕЖАЩЕЕ НА ЦИКЛЕ, снимается. «На цикле» проверяется прямо — остальные
 * живые рёбра той же области всё ещё соединяют его концы, — а не по числу соседей: длинную линию,
 * замкнутую саму на себя (контур изделия!), от узелка отличает не форма, а ДЛИНА, и потому ворота
 * стоят на ней. Снятие ребра-моста разорвало бы линию пополам, и это единственная ошибка, которой
 * здесь нельзя допустить: она молчаливая.
 */
function dropShortCycles(edges: Edge[], trunk: Map<number, number>): number {
  let cut = 0;
  for (let guard = 0; guard < 4096; guard++) {
    let victim = -1;
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      if (!e.alive) continue;
      const limit = SPUR_FACTOR * Math.max(trunk.get(e.comp) ?? e.width, 1);
      if (e.length >= limit) continue;
      if (e.a === e.b) {
        victim = k;
        break;
      }
      // Соединены ли концы БЕЗ этого ребра — системой непересекающихся множеств по остальным.
      const parent = new Map<number, number>();
      const find = (v: number): number => {
        let r = parent.get(v);
        if (r === undefined) {
          parent.set(v, v);
          return v;
        }
        while (r !== parent.get(r)) r = parent.get(r) as number;
        return r;
      };
      const union = (u: number, v: number) => {
        const a = find(u);
        const b = find(v);
        if (a !== b) parent.set(a, b);
      };
      for (let j = 0; j < edges.length; j++) {
        if (j === k) continue;
        const f = edges[j];
        if (!f.alive || f.comp !== e.comp) continue;
        union(f.a, f.b);
      }
      if (find(e.a) === find(e.b)) {
        victim = k;
        break;
      }
    }
    if (victim < 0) break;
    edges[victim].alive = false;
    cut++;
  }
  return cut;
}

/**
 * СКЛЕИТЬ ЦЕПОЧКИ, У КОТОРЫХ ПЕРЕКРЁСТОК ПЕРЕСТАЛ БЫТЬ ПЕРЕКРЁСТКОМ.
 *
 * Каждая обрезанная щетинка ОСВОБОЖДАЕТ узел: точка, где сходились три ветки, после снятия одной
 * из них — обычная точка линии. Без этого шага шов, к которому приклеены девять стежков, вернулся
 * бы ДЕСЯТЬЮ отдельными штрихами — по куску между каждой парой бывших перекрёстков, — и человеку
 * пришлось бы сшивать одну линию из десяти кусков руками. Это ровно та «сотня микропутей на месте
 * одной строчки», которую отчёт называет признаком сломанного пайплайна.
 *
 * Толщина склеенного ребра ПЕРЕСЧИТЫВАЕТСЯ по объединённым отсчётам dt, а не берётся у первого из
 * кусков: медиана двух половин — это не медиана целого.
 */
function mergeChains(edges: Edge[]): void {
  for (let guard = 0; guard < 4096; guard++) {
    const inc = new Map<number, number[]>();
    const add = (v: number, k: number) => {
      const l = inc.get(v);
      if (l) l.push(k);
      else inc.set(v, [k]);
    };
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      if (!e.alive) continue;
      if (e.a === e.b) continue; // кольцо: у него нет свободного конца
      add(e.a, k);
      add(e.b, k);
    }
    let joined = false;
    for (const [v, list] of inc) {
      if (list.length !== 2) continue;
      const [i, j] = list;
      if (i === j) continue; // одно ребро обоими концами в одну точку — это уже кольцо
      const e = edges[i];
      const f = edges[j];
      if (!e.alive || !f.alive) continue;
      // Оба куска разворачиваются так, чтобы `v` оказался КОНЦОМ первого и НАЧАЛОМ второго.
      const flip = (g: Edge) => {
        g.pts.reverse();
        g.dts.reverse();
        const t = g.a;
        g.a = g.b;
        g.b = t;
      };
      if (e.a === v) flip(e);
      if (f.b === v) flip(f);
      if (e.b !== v || f.a !== v) continue;
      e.pts = e.pts.concat(f.pts.slice(1));
      e.dts = e.dts.concat(f.dts.slice(1));
      e.length += f.length;
      e.b = f.b;
      e.width = widthFromRadii(e.dts);
      f.alive = false;
      joined = true;
      break;
    }
    if (!joined) break;
  }
}

/**
 * ОБРЕЗКА ЩЕТИНЫ — ДВА ПРАВИЛА, И ОБА ТОЛЬКО НА РЕБРЕ, ВИСЯЩЕМ НА ПЕРЕКРЁСТКЕ.
 *
 * Условие «другой конец — перекрёсток» не украшение: у ОДИНОКОЙ короткой линии оба конца имеют
 * степень 1, и правило без этого условия стирало бы её целиком — то есть выбрасывало бы короткие
 * настоящие штрихи (надсечку, стрелку, чёрточку сгиба) молча.
 *
 *   1. КОРОЧЕ `1.5 · своей толщины` — щетина медиальной оси. Скелет отращивает такой отросток на
 *      всяком расширении контура: это свойство самого понятия оси, а не дефект утоньшения.
 *
 *   2. СВОЯ ТОЛЩИНА ЛЕЖИТ НА БОЛЕЕ ТОНКОЙ МОДЕ, ЧЕМ ТОЛЩИНА КОМПОНЕНТЫ. Это и есть стежок,
 *      ПРИКЛЕИВШИЙСЯ к сплошной линии: по связности он принадлежит ЕЙ (замер отчёта — 9 из 19
 *      стежков проймы), и без этого правила каждый такой стежок вышел бы отдельным штрихом-огрызком
 *      поперёк шва. Правило — тот же разрез по толщине через пики KDE, что и в измерителе, только
 *      применённый на уровень ниже: не к компоненте, а к ребру.
 *
 *      ⚠ ЦЕНА НАЗВАНА ВСЛУХ: настоящая тонкая ветка настоящего толстого штриха — например,
 *      волосяная линия сгиба, упирающаяся в контур, — тоже будет обрезана. Обратной ошибкой была
 *      бы щетина из стежков на каждом шве, и она видна на бумаге, а эта — нет; поэтому здесь
 *      выбрана та, которую видно.
 */
function trimSpurs(edges: Edge[], compWidth: Map<number, number>, modes: number[]): number {
  let trimmed = 0;
  for (let pass = 0; pass < TRIM_PASSES; pass++) {
    const deg = new Map<number, number>();
    const bump = (i: number) => deg.set(i, (deg.get(i) ?? 0) + 1);
    for (const e of edges) {
      if (!e.alive) continue;
      bump(e.a);
      if (e.b !== e.a) bump(e.b);
    }
    let cut = 0;
    for (const e of edges) {
      if (!e.alive) continue;
      if (e.a === e.b) continue;
      const da = deg.get(e.a) ?? 0;
      const db = deg.get(e.b) ?? 0;
      const leaf = (da === 1 && db >= 3) || (db === 1 && da >= 3);
      if (!leaf) continue;
      const cw = compWidth.get(e.comp) ?? e.width;
      const thinner =
        modes.length > 1 && nearestModeIndex(modes, e.width) < nearestModeIndex(modes, cw);
      if (e.length < SPUR_FACTOR * Math.max(e.width, 1) || thinner) {
        e.alive = false;
        cut++;
        trimmed++;
      }
    }
    if (!cut) break;
  }
  return trimmed;
}

/**
 * ПОСТРОИТЬ ОСЕВУЮ. Полный ответ с числами — для панели и для пробы.
 *
 * `traceCenterline` ниже — то же самое, укороченное до штрихов: одна реализация, два взгляда.
 * Вторая реализация «попроще для двери» разошлась бы с этой на первой же правке порога.
 */
export function centerlineRun(
  m: TraceMeasurement,
  opts: CenterlineOptions = {},
): CenterlineReading {
  const notes: string[] = [];
  const nothing = (why: string): CenterlineReading => {
    notes.push(why);
    return {
      strokes: [],
      edges: 0,
      trimmed: 0,
      nodes: 0,
      curves: 0,
      deviation: 0,
      meanDeviation: 0,
      bytes: 0,
      overBudget: false,
      junctions: 0,
      notes,
    };
  };
  const w = m.w;
  const h = m.h;
  if (w < 1 || h < 1 || !m.components.length) {
    return nothing('there is nothing to draw: the measurement found no ink.');
  }

  const include = new Set<TraceClass>(opts.include ?? ['stroke']);
  const wanted = m.components.filter((c) => include.has(c.klass));
  if (!wanted.length) {
    return nothing(
      `no shape on this picture is a solid stroke: a centreline is the wrong tool for ${m.components.length} shapes that are stitches, filled spots or dirt. Filled shapes want the outline tracer; stitching wants the dash solver.`,
    );
  }

  // ── КАКОЙ ПИКСЕЛЬ КАКОЙ КОМПОНЕНТЕ ─────────────────────────────────────────────────────────
  //
  // Шов (`trace-types.ts`) не несёт карты меток, и это правильно: карта — служебный массив
  // размером с плиту, который ни один потребитель не хранит. Метки восстанавливаются здесь ТОЙ ЖЕ
  // разметкой и сопоставляются с компонентами ПО ИЗМЕРЕННЫМ ЧИСЛАМ — рамке и площади, — а не по
  // `id`: порядок нумерации это внутреннее дело измерителя, и договорённость о нём была бы
  // молчаливым контрактом мимо объявленного шва.
  //
  // ПЕРЕОТКРЫТЫЕ ОБЛОМКИ НЕ СОПОСТАВЛЯЮТСЯ НИ С ЧЕМ, И ЭТО ВЕРНО: они не отдельные области краски,
  // а куски чужой. Их скелет лежит внутри родителя и снимается правилом 2 обрезки щетины.
  const { lab } = labelInk(m.mask, w, h);
  const stats = new Map<number, { area: number; x0: number; y0: number; x1: number; y1: number }>();
  for (let i = 0; i < lab.length; i++) {
    const l = lab[i];
    if (!l) continue;
    const x = i % w;
    const y = (i - x) / w;
    const s = stats.get(l);
    if (!s) stats.set(l, { area: 1, x0: x, y0: y, x1: x, y1: y });
    else {
      s.area++;
      if (x < s.x0) s.x0 = x;
      if (y < s.y0) s.y0 = y;
      if (x > s.x1) s.x1 = x;
      if (y > s.y1) s.y1 = y;
    }
  }
  const key = (a: number, x0: number, y0: number, x1: number, y1: number) =>
    `${a}|${x0}|${y0}|${x1}|${y1}`;
  const byKey = new Map<string, TraceComponent>();
  for (const c of m.components) {
    byKey.set(key(c.area, c.bbox[0], c.bbox[1], c.bbox[2], c.bbox[3]), c);
  }
  /** Метка области → компонента, которую измеритель на ней намерил. */
  const compOf = new Map<number, TraceComponent>();
  for (const [l, s] of stats) {
    const c = byKey.get(key(s.area, s.x0, s.y0, s.x1, s.y1));
    if (c) compOf.set(l, c);
  }

  const chosen = new Set<number>();
  for (const [l, c] of compOf) if (include.has(c.klass)) chosen.add(l);
  if (!chosen.size) {
    return nothing(
      'the measured shapes could not be matched back to the picture they were measured on. Nothing was drawn: guessing which line is which would move lines.',
    );
  }

  // ── ГРАФ ───────────────────────────────────────────────────────────────────────────────────
  const all = buildEdges(m.skel, m.dt, lab, w, h);
  const edges = all.filter((e) => chosen.has(e.comp));
  const before = edges.length;

  // ⚠ ПЕРО КОМПОНЕНТЫ БЕРЁТСЯ У ЕЁ САМОЙ ДЛИННОЙ ВЕТКИ, А НЕ ИЗ `TraceComponent.width`.
  //
  // `width` компоненты — это медиана по ВСЕМУ её скелету, а скелет области, к которой приклеены
  // девять стежков, содержит и их ветки. Замерено на стенде: шов 5 px с приклеенной строчкой
  // объявляет себя толщиной 3.47 — то есть РОВНО ТОЙ ЖЕ модой, что и приклеенное к нему, — и
  // правило «ветка тоньше своей линии» перестаёт срабатывать вовсе. Ствол же тонким не бывает: он
  // и ЕСТЬ линия, а всё, что к ней приклеено, короче него на порядок.
  const trunk = new Map<number, number>();
  const trunkLen = new Map<number, number>();
  for (const e of edges) {
    if ((trunkLen.get(e.comp) ?? -1) >= e.length) continue;
    trunkLen.set(e.comp, e.length);
    trunk.set(e.comp, e.width);
  }

  let trimmed = 0;
  if (opts.trim === false) {
    mergeChains(edges);
  } else {
    // Обрезка и склейка идут ПАРОЙ И ПО ДВА КРУГА: снятая щетинка освобождает узел, склейка через
    // освобождённый узел рождает длинное ребро, и уже на нём видно следующую щетинку.
    for (let round = 0; round < 2; round++) {
      trimmed += dropShortCycles(edges, trunk);
      trimmed += trimSpurs(edges, trunk, m.widthModes);
      mergeChains(edges);
    }
  }

  // ── ФИТ ────────────────────────────────────────────────────────────────────────────────────
  const stroke = opts.stroke ?? {};
  const brush: StitchKey = stroke.brush ?? 'plain';
  const dashed = stroke.dashed ?? false;
  const scale = GAUGE_REF / w;
  const strokes: VectorStroke[] = [];
  let nodes = 0;
  let curves = 0;
  let deviation = 0;
  let devSum = 0;
  let devCount = 0;
  let short = 0;

  for (const e of edges) {
    if (!e.alive) continue;
    if (e.pts.length < MIN_EDGE_PIXELS) {
      short++;
      continue;
    }
    const fit = fitOpenPath(e.pts, {
      tolerance: opts.tolerance ?? DEFAULT_OPEN_TOLERANCE,
      corner: opts.cornerAngle ?? DEFAULT_OPEN_CORNER,
      rdp: opts.rdpEps ?? CENTERLINE_RDP,
      smooth: opts.smooth ?? CENTERLINE_SMOOTH,
    });
    if (!fit) {
      short++;
      continue;
    }
    // ТОЛЩИНА — СВОЯ У КАЖДОГО РЕБРА, а не у компоненты: перекрёсток может свести две линии разных
    // перьев в одну область краски, и одна толщина на обе была бы усреднением того, что измерено
    // порознь. Правило — `widthFromRadii` из `trace-width.ts`, ОДНО НА ДВОИХ с измерителем: пока
    // здесь стояла своя копия `2·median(dt) − 1`, она была одинаково неверна на косой линии, и
    // починка одной копии разошлась бы со второй молча.
    const gauge = Math.max(0.05, e.width * scale);
    const s: VectorStroke = {
      tool: 'curve',
      brush,
      weight: gaugeWeight(gauge),
      dashed,
      pts: fit.pts.map(([x, y]: [number, number]) => [x / w, y / h] as [number, number]),
      segs: fit.segs.map((g: CubicSeg | null) =>
        g ? ([g[0] / w, g[1] / h, g[2] / w, g[3] / h] as CubicSeg) : null,
      ),
      gauge,
    };
    if (stroke.ink) s.ink = stroke.ink;
    strokes.push(s);
    nodes += fit.segs.length;
    for (const g of fit.segs) if (g) curves++;
    if (fit.error > deviation) deviation = fit.error;
    // Среднее взвешивается ЧИСЛОМ ТОЧЕК СКЕЛЕТА, по которым его считали, а не числом узлов:
    // иначе длинная гладкая линия с двумя узлами весила бы столько же, сколько огрызок с двумя.
    devSum += fit.meanError * e.pts.length;
    devCount += e.pts.length;
  }

  // ── ПЕРЕКРЁСТКИ, КОТОРЫЕ ОСТАЛИСЬ ЧЕЛОВЕКУ ─────────────────────────────────────────────────
  const touch = new Map<number, number>();
  for (const e of edges) {
    if (!e.alive) continue;
    touch.set(e.a, (touch.get(e.a) ?? 0) + 1);
    if (e.b !== e.a) touch.set(e.b, (touch.get(e.b) ?? 0) + 1);
  }
  let junctions = 0;
  for (const v of touch.values()) if (v >= 3) junctions++;

  const ratio = opts.ratio && opts.ratio > 0 ? opts.ratio : w / h;
  const bytes = strokes.length ? new TextEncoder().encode(writeLayer(strokes, ratio)).length : 0;

  notes.push(
    `${strokes.length} centrelines from ${chosen.size} solid shapes: ${nodes} nodes, ${curves} of them curved. Each line came back ONCE, along its middle, with its measured thickness — not as a loop around itself.`,
  );
  if (devCount > 0) {
    notes.push(
      `the curve sits within ${deviation.toFixed(2)} px of the skeleton it was fitted to (${(devSum / devCount).toFixed(2)} px on average). That is the distance to the MEASURED axis, not to the edge of the ink: the axis itself is only as good as the thinning that found it.`,
    );
  }
  if (trimmed > 0) {
    notes.push(
      `${trimmed} of ${before} branches were trimmed as skeleton bristle or as stitching glued to a solid line. A genuinely thin branch of a thick line would be trimmed by the same rule.`,
    );
  }
  if (short > 0) {
    notes.push(`${short} branches were shorter than ${MIN_EDGE_PIXELS} px and carried no shape.`);
  }
  if (junctions > 0) {
    notes.push(
      `${junctions} junctions remain. Where two panels meet, the skeleton PULLS BACK from the crossing — the lines stop short of each other by about half their thickness — and which panel lies on top is not in the picture at all. Both are yours to settle.`,
    );
  }
  const overBudget = bytes > MAX_STROKES_BYTES;
  if (overBudget) {
    notes.push(
      `these centrelines are ${(bytes / 1024).toFixed(0)} KB against the ${(MAX_STROKES_BYTES / 1024).toFixed(0)} KB a layer can hold. Raise the tolerance, or take the picture a part at a time.`,
    );
  }

  return {
    strokes,
    edges: before,
    trimmed,
    nodes,
    curves,
    deviation,
    meanDeviation: devCount ? devSum / devCount : 0,
    bytes,
    overBudget,
    junctions,
    notes,
  };
}

/** Осевая, укороченная до самих штрихов. Числа и оговорки — у `centerlineRun`. */
export function traceCenterline(
  m: TraceMeasurement,
  opts: CenterlineOptions = {},
): VectorStroke[] {
  return centerlineRun(m, opts).strokes;
}
