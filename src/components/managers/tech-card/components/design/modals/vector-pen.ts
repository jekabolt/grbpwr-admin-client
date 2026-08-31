import { strokePolyline, type CubicSeg, type VectorStroke } from './vector-strokes';

/**
 * МЕХАНИКА ПЕРА — 1-в-1 жесты pen tool из Photoshop/Illustrator, чистой арифметикой, без React.
 *
 * Дословная жалоба владельца: «сейчас не понятно как её искривить если там две точки оно продожает
 * а не кривит нужно 1 в 1 механика как в фотошопе у pen tool». Отсюда и контракт этого файла:
 *
 *  - КЛИК ставит угловой якорь — прямой сегмент;
 *  - КЛИК С ПРОТЯЖКОЙ вытягивает ПАРУ симметричных касательных: кривизна рождается самим жестом
 *    протяжки, а не отдельным режимом или второй кнопкой;
 *  - рукоятку ЛЮБОГО поставленного якоря можно взять и подвинуть — связанные рукоятки двигаются
 *    зеркалом, то есть меняют кривизну ОБОИХ соседних сегментов разом;
 *  - ALT/OPTION размыкает пару: одна сторона уезжает, другая стоит — «угловая точка с касательной».
 *    Развязанный якорь остаётся развязанным: так делает и фотошоп, и это не потеря, а свойство;
 *  - клик по ПЕРВОМУ якорю ЗАМЫКАЕТ контур и заканчивает путь;
 *  - Enter/Esc завершают незамкнутый контур (обработка клавиш — у вызывающего);
 *  - ⌘Z снимает последний якорь, а не весь путь (`penUndo`).
 *
 * ПОЧЕМУ МОДЕЛЬ ВЫРОСЛА, А НЕ ПЕРЕПИСАНА. Прежнее перо хранило одну исходящую рукоятку на якорь и
 * ДОСТРАИВАЛО входящую зеркалом при коммите — Alt при такой записи невыразим: разомкнутая пара это
 * ДВЕ независимые величины, и додумать вторую из первой нельзя. Поэтому якорь несёт обе рукоятки
 * явно, а «симметрия» стала признаком `linked`, который жест протяжки ставит и Alt снимает.
 * Формат ШТРИХА не менялся вовсе: `segs` из vector-strokes уже кубический и вмещает любую пару.
 *
 * КООРДИНАТЫ — ДОЛИ КАДРА 0..1, как у готовых штрихов: жест обязан жить в той системе, в которой
 * будет храниться, иначе зум посреди построения сдвинул бы недорисованную кривую. Рукоятки —
 * СМЕЩЕНИЯ от своего якоря в тех же долях. Но кадр не квадратный, поэтому каждый ПОРОГ (радиус
 * захвата рукоятки, зона замыкания, отсечка «кликнул, а не потянул») меряется в МИРОВЫХ пикселях
 * платы — доля по x и доля по y весят по-разному, и сравнение расстояний в долях ловило бы клик
 * по вертикали щедрее, чем по горизонтали.
 */

export type PenAnchor = {
  /** Якорь, доли кадра. */
  a: [number, number];
  /** Входящая рукоятка — смещение к управляющей точке сегмента, ПРИХОДЯЩЕГО в якорь. */
  inH: [number, number] | null;
  /** Исходящая — к управляющей точке сегмента, УХОДЯЩЕГО из якоря. */
  outH: [number, number] | null;
  /** Рукоятки связаны зеркалом (гладкий якорь). Alt размыкает — и пара больше не связана. */
  linked: boolean;
};

export type PenDrag =
  /** Протяжка из только что поставленного якоря: тянется его исходящая, зеркалом — входящая. */
  | { kind: 'grow' }
  /** Взятая рукоятка существующего якоря. */
  | { kind: 'handle'; index: number; side: 'in' | 'out' };

/**
 * ЧЕМ ПЕРО РИСУЕТ — вид шва, вес, «строительность», цвет и размер, ОДНИМ объектом.
 *
 * Раньше сюда ехали три отдельных аргумента, и это держалось ровно до появления четвёртого:
 * прибавление цвета и размера означало бы пять позиционных параметров, где перепутанные соседи
 * молча меняют вид шва на его вес. Объект называет каждое поле и — важнее — растёт вместе с
 * форматом штриха, а не мимо него.
 */
export type PenPaint = Omit<VectorStroke, 'tool' | 'pts' | 'segs'>;

export type PenState = {
  anchors: PenAnchor[];
  drag: PenDrag | null;
  /** Контур замкнут кликом по первому якорю. Замкнутый путь окончен — рисовать в него нельзя. */
  closed: boolean;
};

/** Мир, в котором меряются пороги: ширина/высота платы в её пикселях и радиус захвата в них же. */
export type PenWorld = { w: number; h: number; radius: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Рукоятка не уходит дальше кадра за кадр — тот же предел, что CONTROL_REACH формата. */
const clampH = (n: number) => Math.min(1, Math.max(-1, n));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Мировое расстояние между двумя точками в долях кадра. */
function worldDist(p: [number, number], q: [number, number], w: number, h: number): number {
  return Math.hypot((p[0] - q[0]) * w, (p[1] - q[1]) * h);
}

/** Конец рукоятки в долях кадра, или null, если рукоятки нет. */
function handleEnd(an: PenAnchor, side: 'in' | 'out'): [number, number] | null {
  const off = side === 'in' ? an.inH : an.outH;
  if (!off) return null;
  return [an.a[0] + off[0], an.a[1] + off[1]];
}

/**
 * Нажатие пера. Три исхода, в порядке старшинства:
 *  1. клик по ПЕРВОМУ якорю (путь из двух и более) — контур замкнулся, `closedNow` говорит
 *     вызывающему коммитить немедленно: замкнутый путь окончен, как в фотошопе;
 *  2. попадание в конец существующей рукоятки — она взята, начался её драг;
 *  3. всё остальное — новый якорь и протяжка из него (`grow`); отпускание без движения оставит
 *     его угловым.
 *
 * Замыкание проверяется РАНЬШЕ рукояток: у первого якоря обе зоны часто рядом, и отдать клик
 * рукоятке значило бы, что замкнуть подведённый вплотную контур физически не во что.
 */
export function penDown(
  pen: PenState | null,
  at: [number, number],
  world: PenWorld,
): { pen: PenState; closedNow: boolean } {
  const a: [number, number] = [clamp01(at[0]), clamp01(at[1])];
  if (!pen) {
    return {
      pen: {
        anchors: [{ a, inH: null, outH: null, linked: true }],
        drag: { kind: 'grow' },
        closed: false,
      },
      closedNow: false,
    };
  }
  if (
    pen.anchors.length >= 2 &&
    worldDist(at, pen.anchors[0].a, world.w, world.h) <= world.radius
  ) {
    return { pen: { ...pen, drag: null, closed: true }, closedNow: true };
  }
  for (let i = pen.anchors.length - 1; i >= 0; i--) {
    for (const side of ['out', 'in'] as const) {
      const end = handleEnd(pen.anchors[i], side);
      if (end && worldDist(at, end, world.w, world.h) <= world.radius) {
        return { pen: { ...pen, drag: { kind: 'handle', index: i, side } }, closedNow: false };
      }
    }
  }
  return {
    pen: {
      anchors: [...pen.anchors, { a, inH: null, outH: null, linked: true }],
      drag: { kind: 'grow' },
      closed: false,
    },
    closedNow: false,
  };
}

/**
 * Движение с зажатой кнопкой.
 *
 * `grow`: исходящая последнего якоря = вектор от якоря к курсору, входящая — его зеркало, пока
 * пара связана. Alt посреди протяжки РАЗМЫКАЕТ: исходящая продолжает идти за рукой, входящая
 * замирает там, где была в момент Alt, — ровно жест «угловая точка с касательной» из фотошопа.
 * Микродрожь под кликом рукояткой не считается: порог отделяет «кликнул» от «потянул», иначе
 * каждый клик рождал бы кривую с невидимой кривизной.
 *
 * `handle`: взятая рукоятка идёт за курсором; связанная пара двигается зеркалом — кривизна ОБОИХ
 * соседних сегментов меняется одним движением. Alt размыкает и здесь: с этого момента каждая
 * сторона живёт своей жизнью.
 */
export function penMove(
  pen: PenState,
  at: [number, number],
  alt: boolean,
  world: PenWorld,
): PenState {
  if (!pen.drag) return pen;
  const anchors = pen.anchors.slice();

  if (pen.drag.kind === 'grow') {
    const i = anchors.length - 1;
    const an = anchors[i];
    const off: [number, number] = [clampH(at[0] - an.a[0]), clampH(at[1] - an.a[1])];
    const slop = worldDist(at, an.a, world.w, world.h) < world.radius * 0.4;
    if (alt) {
      // Alt заморозил входящую какой она была; исходящая — одна — идёт дальше.
      anchors[i] = { ...an, outH: slop ? null : off, linked: false };
    } else {
      anchors[i] = {
        ...an,
        outH: slop ? null : off,
        inH: slop ? null : [-off[0], -off[1]],
        linked: true,
      };
    }
    return { ...pen, anchors };
  }

  const { index, side } = pen.drag;
  const an = anchors[index];
  const off: [number, number] = [clampH(at[0] - an.a[0]), clampH(at[1] - an.a[1])];
  const next: PenAnchor = { ...an, [side === 'in' ? 'inH' : 'outH']: off };
  if (alt) {
    next.linked = false;
  } else if (an.linked) {
    // Связанная пара: противоположная сторона — точное зеркало, оба сегмента гнутся разом.
    const mirror: [number, number] = [-off[0], -off[1]];
    if (side === 'in') next.outH = mirror;
    else next.inH = mirror;
  }
  anchors[index] = next;
  return { ...pen, anchors };
}

/** Кнопка отпущена — драг окончен, построенное осталось. */
export function penUp(pen: PenState): PenState {
  return pen.drag ? { ...pen, drag: null } : pen;
}

/** ⌘Z: снять ПОСЛЕДНИЙ якорь — отменяется то, что делалось только что, а не весь путь. */
export function penUndo(pen: PenState): PenState | null {
  if (pen.anchors.length <= 1) return null;
  return { anchors: pen.anchors.slice(0, -1), drag: null, closed: false };
}

/**
 * Якоря без подряд идущих дублей. Даблклик-коммит кладёт второй якорь в ту же точку — дубль
 * склеивается, его ненулевые рукоятки достаются выжившему (жест «кликнул ещё раз и потянул»
 * правит последний якорь, а не рождает нулевой сегмент).
 */
function dedupe(anchors: PenAnchor[]): PenAnchor[] {
  const out: PenAnchor[] = [];
  for (const an of anchors) {
    const prev = out[out.length - 1];
    if (prev && prev.a[0] === an.a[0] && prev.a[1] === an.a[1]) {
      out[out.length - 1] = {
        ...prev,
        inH: an.inH ?? prev.inH,
        outH: an.outH ?? prev.outH,
        linked: prev.linked && an.linked,
      };
      continue;
    }
    out.push(an);
  }
  return out;
}

/** Управляющие точки интервала `i → j`, или null для прямого прогона без единой рукоятки. */
function segFor(from: PenAnchor, to: PenAnchor): CubicSeg | null {
  if (!from.outH && !to.inH) return null;
  const c1 = from.outH ? [from.a[0] + from.outH[0], from.a[1] + from.outH[1]] : from.a;
  const c2 = to.inH ? [to.a[0] + to.inH[0], to.a[1] + to.inH[1]] : to.a;
  return [r4(c1[0]), r4(c1[1]), r4(c2[0]), r4(c2[1])];
}

/**
 * Готовый штрих из состояния пера, или null, когда рисовать не из чего (меньше двух якорей).
 *
 * ЗАМКНУТЫЙ контур записывается повтором первого якоря В КОНЦЕ списка с его входящей рукояткой на
 * замыкающем интервале. Формат штриха замыкания не знает — и не должен: `pts` остаётся списком
 * якорей в порядке рисования, замыкающий интервал — обычный интервал, и всякий читатель формата
 * (сцена, экспорт, растр, хит-тест) рисует его без единой правки. Дубль НЕ смежный (между копиями
 * стоит весь контур), так что конвенция «смежный дубль = поднятое перо» не задевается.
 *
 * СПИСОК СЕГМЕНТОВ ПИШЕТСЯ ВСЕГДА, даже сплошь `null`, — документированное различие формата:
 * без списка интервалы сгладил бы Catmull-Rom, а перо, поставившее якоря кликами, обещало ПРЯМЫЕ
 * прогоны.
 */
export function penStroke(pen: PenState, paint: PenPaint): VectorStroke | null {
  const anchors = dedupe(pen.anchors);
  if (anchors.length < 2) return null;
  const chain = pen.closed && anchors.length >= 2 ? [...anchors, anchors[0]] : anchors;
  const segs: (CubicSeg | null)[] = [];
  for (let i = 0; i < chain.length - 1; i++) segs.push(segFor(chain[i], chain[i + 1]));
  return {
    ...paint,
    tool: 'curve',
    pts: chain.map((an) => [r4(an.a[0]), r4(an.a[1])] as [number, number]),
    segs,
  };
}

const f2 = (n: number) => n.toFixed(2);

/** Живой путь пера для превью — та же арифметика сегментов, что у `penStroke`, в юнитах бокса. */
export function penPreviewD(pen: PenState, w: number, h: number): string {
  const a = pen.anchors;
  if (!a.length) return '';
  let d = `M${f2(a[0].a[0] * w)},${f2(a[0].a[1] * h)}`;
  const upto = pen.closed ? a.length : a.length - 1;
  for (let i = 0; i < upto; i++) {
    const from = a[i];
    const to = a[(i + 1) % a.length];
    const seg = segFor(from, to);
    if (!seg) {
      d += ` L${f2(to.a[0] * w)},${f2(to.a[1] * h)}`;
      continue;
    }
    d += ` C${f2(seg[0] * w)},${f2(seg[1] * h)} ${f2(seg[2] * w)},${f2(seg[3] * h)} ${f2(
      to.a[0] * w,
    )},${f2(to.a[1] * h)}`;
  }
  return d;
}

/**
 * РЕЗИНКА: перспективный сегмент от последнего якоря к курсору — та кривая, которая родится, если
 * кликнуть сейчас без протяжки (исходящая последнего якоря уже гнёт её). Именно эта линия отвечает
 * на «не понятно, как её искривить»: кривизна видна ДО клика.
 */
export function penRubberD(
  pen: PenState,
  hover: [number, number],
  w: number,
  h: number,
): string {
  const last = pen.anchors[pen.anchors.length - 1];
  if (!last || pen.closed) return '';
  const from = { ...last };
  const to: PenAnchor = { a: hover, inH: null, outH: null, linked: true };
  const seg = segFor(from, to);
  const m = `M${f2(from.a[0] * w)},${f2(from.a[1] * h)}`;
  if (!seg) return `${m} L${f2(hover[0] * w)},${f2(hover[1] * h)}`;
  return `${m} C${f2(seg[0] * w)},${f2(seg[1] * h)} ${f2(seg[2] * w)},${f2(seg[3] * h)} ${f2(
    hover[0] * w,
  )},${f2(hover[1] * h)}`;
}

/**
 * Контур пера как ЗАМКНУТЫЙ полигон в долях кадра — для «путь → выделение». Кривые честно
 * флэттенятся тем же шагом, что хит-тест (`strokePolyline`), поэтому выделение накрывает ровно ту
 * область, которую человек видит под кривой, а не хорду между якорями. Замыкающий дубль первого
 * якоря снимается: полигон замкнут неявно, повтор точки в данных однажды разошёлся бы с оригиналом.
 */
export function penPolygon(pen: PenState): [number, number][] | null {
  const closed: PenState = { ...pen, closed: true };
  // Краска здесь безразлична: путь тут же расходуется на ПОЛИГОН, штриха из него не родится.
  const stroke = penStroke(closed, { brush: 'plain', weight: 'thin', dashed: false });
  if (!stroke || dedupe(pen.anchors).length < 3) return null;
  const poly = strokePolyline(stroke, 1, 1);
  poly.pop();
  return poly.map((p) => [r4(p.x), r4(p.y)] as [number, number]);
}
