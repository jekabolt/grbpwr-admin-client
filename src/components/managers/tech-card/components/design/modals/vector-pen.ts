import { CONTROL_REACH, strokePolyline, type CubicSeg, type VectorStroke } from './vector-strokes';

/**
 * МЕХАНИКА ПЕРА — 1-в-1 жесты pen tool из Photoshop/Illustrator, чистой арифметикой, без React.
 *
 * Дословная жалоба владельца: «сейчас не понятно как её искривить если там две точки оно продожает
 * а не кривит нужно 1 в 1 механика как в фотошопе у pen tool». Отсюда и контракт этого файла:
 *
 *  - КЛИК ставит угловой якорь — прямой сегмент;
 *  - КЛИК С ПРОТЯЖКОЙ вытягивает ПАРУ симметричных касательных: кривизна рождается самим жестом
 *    протяжки, а не отдельным режимом или второй кнопкой;
 *  - рукоятку ЛЮБОГО поставленного якоря можно взять и подвинуть — связанная пара ВРАЩАЕТСЯ вслед,
 *    сохраняя СВОЮ длину (см. `swingOpposite`), то есть меняет кривизну обоих соседних сегментов;
 *  - САМ ЯКОРЬ тоже можно взять и подвинуть, не выходя из построения;
 *  - ALT/OPTION размыкает пару: одна сторона уезжает, другая стоит — «угловая точка с касательной».
 *    Развязанный якорь ОСТАЁТСЯ развязанным и после отпускания Alt: так делает фотошоп, и это не
 *    потеря, а свойство (раньше отпущенный Alt молча возвращал зеркало — см. `broken` ниже);
 *  - ALT-КЛИК ПО ЯКОРЮ переключает его между угловым и гладким — фотошопный Convert Point;
 *  - SHIFT держит угол кратным 45°: и при постановке якоря (от предыдущего), и при протяжке
 *    рукоятки (от её якоря). Угол меряется в МИРОВЫХ пикселях платы — в долях кадра «45°» было бы
 *    не 45°, потому что кадр не квадратный;
 *  - ПРОБЕЛ НА ПРОТЯЖКЕ двигает сам якорь вместе с рукоятками, пока не отпустили, — тот самый жест
 *    фотошопа, которым правят промах постановки, не бросая протяжку;
 *  - клик по ПЕРВОМУ якорю ЗАМЫКАЕТ контур и заканчивает путь;
 *  - Enter/Esc завершают незамкнутый контур, Backspace снимает последний якорь (обработка клавиш —
 *    у вызывающего; снимает `penUndo`).
 *
 * ПОЧЕМУ МОДЕЛЬ ВЫРОСЛА, А НЕ ПЕРЕПИСАНА. Прежнее перо хранило одну исходящую рукоятку на якорь и
 * ДОСТРАИВАЛО входящую зеркалом при коммите — Alt при такой записи невыразим: разомкнутая пара это
 * ДВЕ независимые величины, и додумать вторую из первой нельзя. Поэтому якорь несёт обе рукоятки
 * явно, а «симметрия» стала признаком `linked`, который жест протяжки ставит и Alt снимает.
 * Формат ШТРИХА не менялся вовсе: `segs` из vector-strokes уже кубический и вмещает любую пару.
 *
 * ПРАВКА УЖЕ ПОСТАВЛЕННОГО КОНТУРА ЖИВЁТ В `vector-pen-edit.ts`, а не здесь: здесь путь РОЖДАЕТСЯ
 * (состояние — список якорей), там он ПРАВИТСЯ (состояние — готовый штрих из документа). Общего у
 * них — форма якоря `PenAnchor` и арифметика рукояток, и она экспортируется отсюда именно затем,
 * чтобы «гладкий узел» не оказался двумя разными вещами на двух экранах одного редактора.
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
  /**
   * ГЛАДКИЙ ЯКОРЬ: рукоятки коллинеарны и смотрят в разные стороны. Протяжка одной ВРАЩАЕТ вторую,
   * сохраняя её длину, — так ведёт себя гладкая точка в фотошопе и иллюстраторе. Равными их делает
   * только жест РОЖДЕНИЯ (протяжка из свежего якоря), и равенство — частный случай, а не смысл
   * признака: «связаны» значит коллинеарны, а не «одной длины». Alt размыкает — и пара больше не
   * связана ничем.
   */
  linked: boolean;
};

export type PenDrag =
  /**
   * Протяжка из только что поставленного якоря: тянется его исходящая, зеркалом — входящая.
   * `last` — курсор на предыдущем сэмпле; он нужен ПРОБЕЛУ, который двигает якорь приращением, а не
   * абсолютной точкой (абсолютная утащила бы якорь под курсор рывком в момент нажатия пробела).
   */
  | { kind: 'grow'; last: [number, number] }
  /** Взятая рукоятка существующего якоря. */
  | { kind: 'handle'; index: number; side: 'in' | 'out' }
  /**
   * Взятый САМ якорь. `grab` — смещение «курсор минус якорь» в момент нажатия: без него якорь
   * прыгнул бы под курсор на первом же движении. `from` — где он стоял, чтобы Shift считал угол от
   * исходного места, а не от предыдущего кадра (иначе луч 45° уползал бы сам за собой).
   */
  | { kind: 'anchor'; index: number; grab: [number, number]; from: [number, number] };

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

/**
 * Зажатые клавиши ОДНИМ объектом, а не тремя позиционными булями подряд.
 *
 * Прежняя подпись брала `alt: boolean` четвёртым аргументом; прибавление Shift и Пробела дало бы
 * три соседних буля, где перепутанные местами модификаторы не поймает ни компилятор, ни глаз.
 */
export type PenMods = { alt?: boolean; shift?: boolean; space?: boolean };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Рукоятка не уходит дальше кадра за кадр — тот же предел, что CONTROL_REACH формата. */
const clampH = (n: number) => Math.min(CONTROL_REACH, Math.max(-CONTROL_REACH, n));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Насколько ближе рукоятка обязана быть, чтобы обойти якорь. Ничтожно — но НАЗВАНО. */
const PICK_EPS = 1e-9;

/** Мировое расстояние между двумя точками в долях кадра. */
export function worldDist(p: [number, number], q: [number, number], w: number, h: number): number {
  return Math.hypot((p[0] - q[0]) * w, (p[1] - q[1]) * h);
}

/** Конец рукоятки в долях кадра, или null, если рукоятки нет. */
export function handleEnd(an: PenAnchor, side: 'in' | 'out'): [number, number] | null {
  const off = side === 'in' ? an.inH : an.outH;
  if (!off) return null;
  return [an.a[0] + off[0], an.a[1] + off[1]];
}

/**
 * ТОЧКА, ПРИТЯНУТАЯ К ЛУЧУ, КРАТНОМУ 45° ОТ `from` — жест Shift.
 *
 * УГОЛ СЧИТАЕТСЯ В МИРОВЫХ ПИКСЕЛЯХ, и это не педантизм: доли кадра сжаты по одной оси, и «45°»,
 * посчитанные в них, дали бы на плате 4:5 угол в 38° — то есть Shift рисовал бы наклон, которого
 * никто не просил. Длина сохраняется полной (точка садится на луч на том же удалении), как в
 * фотошопе, а не проекцией — проекция подтягивала бы точку к якорю при отходе в сторону.
 */
export function snap45(
  from: [number, number],
  to: [number, number],
  world: { w: number; h: number },
): [number, number] {
  const dx = (to[0] - from[0]) * world.w;
  const dy = (to[1] - from[1]) * world.h;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [from[0], from[1]];
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return [from[0] + (Math.cos(ang) * len) / world.w, from[1] + (Math.sin(ang) * len) / world.h];
}

/**
 * ПРОТИВОПОЛОЖНАЯ РУКОЯТКА ГЛАДКОГО ЯКОРЯ: развёрнута против `off`, СВОЕЙ прежней длины.
 *
 * Это и есть разница между «связаны» и «равны». Прежний код ставил точное зеркало `[-x,-y]`, и
 * потянув одну рукоятку длиннее, человек получал вторую такой же длины — то есть редактор менял
 * кривизну сегмента, которого рука не касалась. Фотошоп и иллюстратор ВРАЩАЮТ вторую, сохраняя
 * длину; равными их делает только жест рождения, где обе рождаются разом.
 *
 * Ничего не выдумывает: партнёра нет — нет и результата (null), нулевая длина `off` не задаёт
 * направления и оставляет партнёра как был.
 */
export function swingOpposite(
  off: [number, number],
  partner: [number, number] | null,
  world: { w: number; h: number },
): [number, number] | null {
  if (!partner) return null;
  const ox = off[0] * world.w;
  const oy = off[1] * world.h;
  const len = Math.hypot(ox, oy);
  const pl = Math.hypot(partner[0] * world.w, partner[1] * world.h);
  if (len === 0 || pl === 0) return partner;
  return [clampH((-ox / len) * pl / world.w), clampH((-oy / len) * pl / world.h)];
}

/**
 * ПАРА РУКОЯТОК ГЛАДКОГО ЯКОРЯ, ПОСТРОЕННАЯ ПО СОСЕДЯМ, — то, что делает Convert Point, превращая
 * угол в гладкую точку. Направление — хорда «предыдущий → следующий» (классическая касательная
 * Catmull-Rom), длина каждой стороны — треть расстояния до своего соседа: та же пропорция, которой
 * кубика проходит через точки, не выпучиваясь.
 *
 * У края незамкнутого пути соседа с одной стороны нет — и рукоятки с этой стороны не рождается.
 * Достроить её «симметрично» значило бы придумать кривизну сегмента, которого не существует.
 */
export function smoothHandles(
  prev: [number, number] | null,
  a: [number, number],
  next: [number, number] | null,
  world: { w: number; h: number },
): { inH: [number, number] | null; outH: [number, number] | null } {
  const from = prev ?? a;
  const to = next ?? a;
  const dx = (to[0] - from[0]) * world.w;
  const dy = (to[1] - from[1]) * world.h;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { inH: null, outH: null };
  const ux = dx / len;
  const uy = dy / len;
  const back = prev ? worldDist(a, prev, world.w, world.h) / 3 : 0;
  const fwd = next ? worldDist(a, next, world.w, world.h) / 3 : 0;
  return {
    inH: prev ? [clampH((-ux * back) / world.w), clampH((-uy * back) / world.h)] : null,
    outH: next ? [clampH((ux * fwd) / world.w), clampH((uy * fwd) / world.h)] : null,
  };
}

/**
 * ЧТО ПОД КУРСОРОМ: якорь, конец рукоятки — или ничего. Побеждает БЛИЖАЙШЕЕ, при равенстве якорь.
 *
 * ПОЧЕМУ НЕ «РУКОЯТКА ВСЕГДА СТАРШЕ». Рукоятка, конец которой лёг на свой якорь, накрыла бы его
 * собой, и якорь стало бы нечем взять — навсегда, потому что рукоятка ездит вместе с ним. Обратный
 * перекос («якорь всегда старше») сделал бы неберущейся короткую рукоятку. Ближайшее-побеждает
 * снимает оба перекоса, а вырожденно короткая рукоятка (конец ближе половины радиуса к своему
 * якорю) не предлагается вовсе: взять её всё равно нельзя, а тянуть на себя ничьи она не должна.
 */
export function penPick(
  anchors: PenAnchor[],
  at: [number, number],
  world: PenWorld,
): { index: number; side: 'in' | 'out' | null } | null {
  let bestA: { index: number; d: number } | null = null;
  let bestH: { index: number; side: 'in' | 'out'; d: number } | null = null;
  for (let i = anchors.length - 1; i >= 0; i--) {
    const an = anchors[i];
    const da = worldDist(at, an.a, world.w, world.h);
    if (da <= world.radius && (!bestA || da < bestA.d)) bestA = { index: i, d: da };
    for (const side of ['out', 'in'] as const) {
      const end = handleEnd(an, side);
      if (!end) continue;
      // Вырожденная рукоятка: её конец внутри якоря, брать нечего.
      if (worldDist(end, an.a, world.w, world.h) < world.radius * 0.5) continue;
      const dh = worldDist(at, end, world.w, world.h);
      if (dh <= world.radius && (!bestH || dh < bestH.d)) bestH = { index: i, side, d: dh };
    }
  }
  // ЯКОРЬ И РУКОЯТКА СРАВНИВАЮТСЯ ОДИН РАЗ И ЯВНО, а не «кто попался первым в цикле»: на равном
  // удалении победитель обязан быть НАЗВАН, иначе правило решают последние биты мантиссы, и
  // «при равенстве якорь» — это не поведение, а совпадение, которое разъедется при первом же зуме.
  if (bestA && (!bestH || bestA.d <= bestH.d + PICK_EPS)) return { index: bestA.index, side: null };
  if (bestH) return { index: bestH.index, side: bestH.side };
  return null;
}

/** Переключить якорь между угловым и гладким — Convert Point фотошопа. */
function convertAnchor(anchors: PenAnchor[], i: number, world: PenWorld): PenAnchor[] {
  const next = anchors.slice();
  const an = next[i];
  if (an.linked || an.inH || an.outH) {
    // ГЛАДКИЙ (или хоть с одной касательной) → УГОЛ: рукоятки снимаются, соседние сегменты
    // выпрямляются. Ровно это делает Convert Point над гладкой точкой.
    next[i] = { ...an, inH: null, outH: null, linked: false };
    return next;
  }
  const h = smoothHandles(next[i - 1]?.a ?? null, an.a, next[i + 1]?.a ?? null, world);
  next[i] = { ...an, inH: h.inH, outH: h.outH, linked: !!(h.inH && h.outH) };
  return next;
}

/**
 * Нажатие пера. Исходы, в порядке старшинства:
 *  1. клик по ПЕРВОМУ якорю (путь из двух и более) — контур замкнулся, `closedNow` говорит
 *     вызывающему коммитить немедленно: замкнутый путь окончен, как в фотошопе;
 *  2. ALT по существующему якорю — Convert Point: угол ⇄ гладкая точка, драга не начинается;
 *  3. попадание в существующий якорь — он взят, начался его драг (`anchor`);
 *  4. попадание в конец существующей рукоятки — она взята, начался её драг (`handle`);
 *  5. всё остальное — новый якорь и протяжка из него (`grow`); отпускание без движения оставит
 *     его угловым. Shift кладёт новый якорь на луч, кратный 45° от предыдущего.
 *
 * Замыкание проверяется РАНЬШЕ прочего: у первого якоря зоны часто рядом, и отдать клик рукоятке
 * значило бы, что замкнуть подведённый вплотную контур физически не во что.
 */
export function penDown(
  pen: PenState | null,
  at: [number, number],
  world: PenWorld,
  mods: PenMods = {},
): { pen: PenState; closedNow: boolean } {
  const a: [number, number] = [clamp01(at[0]), clamp01(at[1])];
  if (!pen) {
    return {
      pen: {
        anchors: [{ a, inH: null, outH: null, linked: true }],
        drag: { kind: 'grow', last: a },
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
  const hit = penPick(pen.anchors, at, world);
  if (hit && hit.side === null) {
    if (mods.alt) {
      return {
        pen: { ...pen, anchors: convertAnchor(pen.anchors, hit.index, world), drag: null },
        closedNow: false,
      };
    }
    const from = pen.anchors[hit.index].a;
    return {
      pen: {
        ...pen,
        drag: {
          kind: 'anchor',
          index: hit.index,
          grab: [at[0] - from[0], at[1] - from[1]],
          from: [from[0], from[1]],
        },
      },
      closedNow: false,
    };
  }
  if (hit && hit.side) {
    return { pen: { ...pen, drag: { kind: 'handle', index: hit.index, side: hit.side } }, closedNow: false };
  }
  const prev = pen.anchors[pen.anchors.length - 1];
  const put = mods.shift && prev ? snap45(prev.a, at, world) : at;
  const placed: [number, number] = [clamp01(put[0]), clamp01(put[1])];
  return {
    pen: {
      anchors: [...pen.anchors, { a: placed, inH: null, outH: null, linked: true }],
      drag: { kind: 'grow', last: placed },
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
 * замирает там, где была в момент Alt, — ровно жест «угловая точка с касательной» из фотошопа. И
 * ОСТАЁТСЯ разомкнутой после того, как Alt отпустили (`broken` читает и текущую клавишу, и уже
 * снятый признак): прежний код возвращал зеркало на отпускании, молча отменяя сделанный разрыв.
 * Пробел на протяжке двигает САМ якорь вместе с обеими рукоятками. Микродрожь под кликом рукояткой
 * не считается: порог отделяет «кликнул» от «потянул», иначе каждый клик рождал бы кривую с
 * невидимой кривизной.
 *
 * `anchor`: якорь идёт за курсором, сохраняя смещение захвата; рукоятки — смещения, поэтому едут
 * с ним сами. Shift держит его на луче 45° от места, где он стоял до захвата.
 *
 * `handle`: взятая рукоятка идёт за курсором; связанная пара ВРАЩАЕТСЯ вслед, сохраняя свою длину.
 * Alt размыкает и здесь: с этого момента каждая сторона живёт своей жизнью.
 */
export function penMove(
  pen: PenState,
  at: [number, number],
  /**
   * ГОЛЫЙ `alt` ПРИНИМАЕТСЯ НАРАВНЕ С ОБЪЕКТОМ — прежняя подпись брала именно его, и вызывающий
   * переезжает на модификаторы отдельным шагом, а не вместе с этим файлом. Совместимость здесь не
   * вежливость: в дереве прямо сейчас правят соседние файлы, и сломанная сборка стоила бы им
   * рабочего дерева ради чужой правки.
   */
  mods: PenMods | boolean,
  world: PenWorld,
): PenState {
  if (!pen.drag) return pen;
  const m: PenMods = typeof mods === 'boolean' ? { alt: mods } : mods;
  const anchors = pen.anchors.slice();

  if (pen.drag.kind === 'grow') {
    const i = anchors.length - 1;
    const an = anchors[i];
    if (m.space) {
      const last = pen.drag.last;
      const dx = at[0] - last[0];
      const dy = at[1] - last[1];
      anchors[i] = { ...an, a: [clamp01(an.a[0] + dx), clamp01(an.a[1] + dy)] };
      return { ...pen, anchors, drag: { kind: 'grow', last: at } };
    }
    const tip = m.shift ? snap45(an.a, at, world) : at;
    const off: [number, number] = [clampH(tip[0] - an.a[0]), clampH(tip[1] - an.a[1])];
    const slop = worldDist(tip, an.a, world.w, world.h) < world.radius * 0.4;
    // РАЗВЯЗАННЫЙ ОСТАЁТСЯ РАЗВЯЗАННЫМ: клавиша ИЛИ уже снятый признак.
    const broken = !!m.alt || !an.linked;
    anchors[i] = broken
      ? { ...an, outH: slop ? null : off, linked: false }
      : {
          ...an,
          outH: slop ? null : off,
          inH: slop ? null : [-off[0], -off[1]],
          linked: true,
        };
    return { ...pen, anchors, drag: { kind: 'grow', last: at } };
  }

  if (pen.drag.kind === 'anchor') {
    const { index, grab, from } = pen.drag;
    const raw: [number, number] = [at[0] - grab[0], at[1] - grab[1]];
    const put = m.shift ? snap45(from, raw, world) : raw;
    anchors[index] = { ...anchors[index], a: [clamp01(put[0]), clamp01(put[1])] };
    return { ...pen, anchors };
  }

  const { index, side } = pen.drag;
  const an = anchors[index];
  const tip = m.shift ? snap45(an.a, at, world) : at;
  const off: [number, number] = [clampH(tip[0] - an.a[0]), clampH(tip[1] - an.a[1])];
  const next: PenAnchor = { ...an, [side === 'in' ? 'inH' : 'outH']: off };
  if (m.alt) {
    next.linked = false;
  } else if (an.linked) {
    // Связанная пара: противоположная сторона разворачивается против взятой, сохраняя СВОЮ длину.
    const swung = swingOpposite(off, side === 'in' ? an.outH : an.inH, world);
    if (side === 'in') next.outH = swung;
    else next.inH = swung;
  }
  anchors[index] = next;
  return { ...pen, anchors };
}

/** Кнопка отпущена — драг окончен, построенное осталось. */
export function penUp(pen: PenState): PenState {
  return pen.drag ? { ...pen, drag: null } : pen;
}

/** ⌘Z и Backspace: снять ПОСЛЕДНИЙ якорь — отменяется то, что делалось только что, а не весь путь. */
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
export function segFor(from: PenAnchor, to: PenAnchor): CubicSeg | null {
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
 * на «не понятно, как её искривить»: кривизна видна ДО клика. Shift показывает её уже притянутой к
 * лучу 45° — иначе рука узнавала бы о притяжении только после клика.
 */
export function penRubberD(
  pen: PenState,
  hover: [number, number],
  w: number,
  h: number,
  world?: { w: number; h: number },
  shift = false,
): string {
  const last = pen.anchors[pen.anchors.length - 1];
  if (!last || pen.closed) return '';
  const tip = shift && world ? snap45(last.a, hover, world) : hover;
  const from = { ...last };
  const to: PenAnchor = { a: tip, inH: null, outH: null, linked: true };
  const seg = segFor(from, to);
  const m = `M${f2(from.a[0] * w)},${f2(from.a[1] * h)}`;
  if (!seg) return `${m} L${f2(tip[0] * w)},${f2(tip[1] * h)}`;
  return `${m} C${f2(seg[0] * w)},${f2(seg[1] * h)} ${f2(seg[2] * w)},${f2(seg[3] * h)} ${f2(
    tip[0] * w,
  )},${f2(tip[1] * h)}`;
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
