import {
  CONTROL_REACH,
  cubicAt,
  hasSegments,
  type CubicSeg,
  type VectorStroke,
} from './vector-strokes';
import {
  handleEnd,
  penPreviewD,
  segFor,
  smoothHandles,
  snap45,
  swingOpposite,
  worldDist,
  type PenAnchor,
  type PenMods,
  type PenState,
  type PenWorld,
} from './vector-pen';

/**
 * ПРАВКА УЖЕ ПОСТАВЛЕННОГО КОНТУРА — «подравнять кривую как надо, пока не вышел из эдита».
 *
 * Дословно от владельца (Q-10): «нужна возможность пока ты не покинул эдит подравнять кривую как
 * надо и сделать ее тоньше или жирнее в боковом меню». Толщина — уже умеет рейка (`onGauge` правит
 * `gauge` ВЫБРАННОГО штриха). Кривая — не умел никто: перо строило путь и на коммите забывало о
 * нём навсегда, а `select` давал менять шов, цвет и толщину, но не геометрию. Этот файл — вторая
 * половина: узлы уложенного штриха, их рукоятки, вставка и удаление узла.
 *
 * ── ОДНА МОДЕЛЬ УЗЛА НА ДВА ЭКРАНА ─────────────────────────────────────────────────────────
 * Узел здесь — тот же `PenAnchor`, что у пера, и вся арифметика рукояток (вращение связанной пары,
 * притяжение к 45°, построение гладкой пары по соседям) взята оттуда же. Второй, «почти такой же»
 * узел был бы вторым определением слова «гладкий» в одном редакторе, и разойтись им было бы нечем,
 * кроме времени.
 *
 * ── ЧТО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ ────────────────────────────────────────────────────────────────
 * ОН НЕ ВЕДЁТ СВОЕЙ ИСТОРИИ. В редакторе одна лента отмены на линии и пиксели
 * (`vector-raster-history.ts`), и два стека под одним ⌘Z дают отмену, которую нельзя предсказать.
 * Поэтому наружу отдаётся ровно один писатель — `editCommit`, возвращающий НОВЫЙ СПИСОК ШТРИХОВ;
 * вызывающий кладёт его в `commitLines` ОДИН раз на жест, и ⌘Z снимает ровно этот жест. Пока драг
 * жив, документ не трогается вовсе: живой путь рисуется поверх (`editPreviewD`).
 *
 * ── ЧТО ЭТОТ ФАЙЛ НЕ ДОБАВЛЯЕТ В ФОРМАТ ────────────────────────────────────────────────────
 * НИ ОДНОГО ПОЛЯ. Всё состояние узла выводится из уже хранимого: якоря — из `pts`, рукоятки — из
 * `segs` (c1 принадлежит левому концу интервала, c2 — правому), замкнутость — из повтора первого
 * якоря в конце (конвенция `penStroke`), «гладкость» — из КОЛЛИНЕАРНОСТИ пары (см. `isSmooth`).
 * Признак `linked` НЕ ХРАНИТСЯ: незаписанное поле — это молча потерянная работа при следующем
 * открытии, а выводимое из геометрии переживает круг без единой новой ступени версии документа.
 */

/** Сколько прямых кусков берётся на интервал при поиске «куда ткнули». Тот же шаг, что хит-тест. */
const FLATTEN_STEPS = 16;

/**
 * НАСКОЛЬКО РУКОЯТКИ ДОЛЖНЫ БЫТЬ КОЛЛИНЕАРНЫ, чтобы узел читался гладким, в синусе угла.
 *
 * Число выбрано против ОКРУГЛЕНИЯ ФОРМАТА, а не «на глаз»: координаты пишутся с четырьмя знаками,
 * то есть каждая может съехать на 5e-5 кадра, и рукоятка длиной в две сотых кадра (20 пикселей
 * платы) приходит с угловым шумом до 0.4°. Три градуса покрывают шум с запасом и всё ещё не
 * называют гладким узел, который человек делал углом.
 */
const SMOOTH_SIN = Math.sin((3 * Math.PI) / 180);

/**
 * КОНТУР В ВИДЕ УЗЛОВ. Замыкающий дубль первого якоря СНЯТ: в документе он есть (так `penStroke`
 * выражает замкнутость через формат, который про замыкание не знает), но узлов от этого не два —
 * узел один, и правка обязана двигать его ОДИН раз. Пока дубль жил бы в списке, сдвиг «первого»
 * узла отрывал бы замыкающий интервал от контура, и разрыв заметили бы только при следующем
 * открытии.
 */
export type EditPath = {
  nodes: PenAnchor[];
  closed: boolean;
  /**
   * ИНТЕРВАЛ ПРЯМОЙ — в документе `segs[i] === null`. Хранится ОТДЕЛЬНО от рукояток, а не выводится
   * из «обе рукоятки пусты», потому что формат различает два вида прямого прогона: `null` и
   * вырожденную кубику `[a,a,b,b]` (так пишет иной экспорт SVG). Рисуются они одинаково, но
   * переписать одно другим значило бы менять чужой документ там, где рука к нему не прикасалась.
   * Длина: число интервалов — `nodes.length - 1` у открытого, `nodes.length` у замкнутого.
   */
  flat: boolean[];
};

export type EditDrag =
  /** Взят САМ узел. `grab` — «курсор минус узел» в момент нажатия, `from` — где он стоял. */
  | { kind: 'node'; index: number; grab: [number, number]; from: [number, number] }
  /** Взят конец рукоятки. */
  | { kind: 'handle'; index: number; side: 'in' | 'out' };

export type EditState = {
  /** Индекс правимого штриха в списке документа. */
  stroke: number;
  path: EditPath;
  /** Выбранный узел, `-1` — ни одного. Клавиши (удалить, сдвинуть, переключить) адресуют его. */
  sel: number;
  drag: EditDrag | null;
  /** Путь разошёлся с документом — есть что коммитить. Снимается `editCommit`. */
  dirty: boolean;
};

export type EditHit =
  | { kind: 'node'; index: number }
  | { kind: 'handle'; index: number; side: 'in' | 'out' }
  /** Место НА кривой: интервал и параметр внутри него — туда садится новый узел. */
  | { kind: 'segment'; index: number; t: number }
  | null;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/**
 * СМЕЩЕНИЕ РУКОЯТКИ — НЕ ДАЛЬШЕ КАДРА ЗА КАДР, тот же предел, что `CONTROL_REACH` формата.
 *
 * Без него рывок мышью за край платы записал бы управляющую точку дальше досягаемости, а `readSeg`
 * при следующем открытии подтянул бы её обратно — то есть кривая приехала бы ДРУГОЙ формы, чем её
 * оставили, и никто бы не узнал почему. Якорь при этом сидит в 0..1, так что смещение ±1 даёт ровно
 * разрешённый диапазон управляющей точки.
 */
const clampH = (n: number) => Math.min(CONTROL_REACH, Math.max(-CONTROL_REACH, n));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const same = (p: [number, number], q: [number, number]) => p[0] === q[0] && p[1] === q[1];
/** Насколько ближе рукоятка обязана быть, чтобы обойти узел. Ничтожно — но НАЗВАНО. */
const PICK_EPS = 1e-9;

/** Смещение рукоятки, или null, когда управляющая точка сидит РОВНО на своём якоре. */
function offOrNull(dx: number, dy: number): [number, number] | null {
  return dx === 0 && dy === 0 ? null : [dx, dy];
}

/**
 * ГЛАДКИЙ ЛИ УЗЕЛ — по геометрии, а не по хранимому признаку (его в формате нет и не будет).
 * Гладкий = обе рукоятки есть, они коллинеарны и смотрят В РАЗНЫЕ стороны. Проверка ведётся в
 * долях кадра и от этого не страдает: растяжение по одной оси — линейное отображение, а оно
 * сохраняет коллинеарность; масштаб уходит нормировкой на длины.
 */
function isSmooth(inH: [number, number] | null, outH: [number, number] | null): boolean {
  if (!inH || !outH) return false;
  const li = Math.hypot(inH[0], inH[1]);
  const lo = Math.hypot(outH[0], outH[1]);
  if (li === 0 || lo === 0) return false;
  const cross = Math.abs(inH[0] * outH[1] - inH[1] * outH[0]) / (li * lo);
  const dot = (inH[0] * outH[0] + inH[1] * outH[1]) / (li * lo);
  return cross <= SMOOTH_SIN && dot < 0;
}

/**
 * ПРАВИМ ЛИ ШТРИХ ПОУЗЛОВО — и это не «можно ли технически», а «не потеряем ли чужую работу».
 *
 * ДА — штрих с явным списком `segs`: перо и импортированный SVG. Его точки И ЕСТЬ узлы, названные
 * тем, кто их ставил.
 *
 * ДА — прямая из двух точек (`tool: 'line'`): у ломаной из двух точек сглаживание Catmull-Rom
 * ТОЖДЕСТВЕННО прямой (`strokePath` на двух точках пишет `L`), поэтому её можно править и вернуть
 * в документ теми же двумя точками, не добавив ни байта.
 *
 * НЕТ — след руки и всякая другая ломаная без `segs`. Её точки — ОТСЧЁТЫ УКАЗАТЕЛЯ под конвенцией
 * сглаживания, а не поставленные узлы: между ними натянут Catmull-Rom, а смежный дубль означает
 * поднятое перо. Превратить их в узлы — значит (а) переписать форму, потому что явные кубики и
 * Catmull-Rom совпадают лишь там, где их специально свели, (б) отключить прореживание, которым
 * `writeLayer` держит след под потолком 512 КБ, и (в) выдать человеку двести рукояток вместо
 * рисунка. Отказ здесь честнее молчаливой перерисовки.
 */
export function nodeEditable(stroke: VectorStroke): boolean {
  if (stroke.pts.length < 2) return false;
  if (hasSegments(stroke)) return true;
  return stroke.tool === 'line' && stroke.pts.length === 2;
}

/**
 * ШТРИХ → УЗЛЫ. Замкнутость читается по повтору первого якоря в конце — ровно по той конвенции, по
 * которой `penStroke` её записывает; ничего нового в документе для этого не заводится.
 */
export function readPath(stroke: VectorStroke): EditPath | null {
  if (!nodeEditable(stroke)) return null;
  const pts = stroke.pts;
  const segs: (CubicSeg | null)[] = hasSegments(stroke)
    ? stroke.segs
    : new Array(pts.length - 1).fill(null);
  const closed = pts.length >= 3 && same(pts[0], pts[pts.length - 1]);
  const n = closed ? pts.length - 1 : pts.length;
  if (n < 2) return null;
  const nodes: PenAnchor[] = [];
  for (let i = 0; i < n; i++) {
    const a: [number, number] = [pts[i][0], pts[i][1]];
    // Исходящая — из интервала i; входящая — из интервала слева (у замкнутого слева от нуля стоит
    // замыкающий интервал n-1, и именно его c2 держит входящую рукоятку первого узла).
    const out = segs[i] ?? null;
    const inIdx = closed ? (i + n - 1) % n : i - 1;
    const inSeg = inIdx >= 0 ? segs[inIdx] ?? null : null;
    const outH = out ? offOrNull(out[0] - a[0], out[1] - a[1]) : null;
    const inH = inSeg ? offOrNull(inSeg[2] - a[0], inSeg[3] - a[1]) : null;
    nodes.push({ a, inH, outH, linked: isSmooth(inH, outH) });
  }
  return { nodes, closed, flat: segs.map((s) => s === null) };
}

/**
 * УЗЛЫ → ШТРИХ, на месте прежнего. Краска, шов и `tool` берутся у исходного штриха и не трогаются:
 * это правка ГЕОМЕТРИИ, а `tool` — происхождение («откуда взялась линия»), которое правкой узла не
 * меняется. Меньше двух узлов — штриха нет вовсе, и вызывающий обязан убрать его из списка.
 *
 * ЛОМАНАЯ БЕЗ `segs` ОСТАЁТСЯ ЛОМАНОЙ БЕЗ `segs`, пока её топология и прямота целы: иначе прямая
 * из двух точек, которую только подвинули, поднимала бы документ с первой ступени версии на вторую
 * ни за что. Как только появился узел или рукоятка — список сегментов пишется, и это уже честная
 * вторая ступень.
 */
export function writePath(path: EditPath, src: VectorStroke): VectorStroke | null {
  const nodes = path.nodes;
  if (nodes.length < 2) return null;
  const chain = path.closed ? [...nodes, nodes[0]] : nodes;
  const pts = chain.map((an) => [r4(an.a[0]), r4(an.a[1])] as [number, number]);
  const allFlat = path.flat.every(Boolean);
  if (!hasSegments(src) && allFlat && chain.length === src.pts.length) {
    return { ...src, pts };
  }
  const segs: (CubicSeg | null)[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    segs.push(path.flat[i] ? null : segFor(chain[i], chain[i + 1]) ?? degenerate(chain[i], chain[i + 1]));
  }
  return { ...src, pts, segs };
}

/**
 * Вырожденная кубика `[a,a,b,b]` — прямая, записанная кубикой. Пишется только там, где интервал
 * НЕ помечен прямым, а рукояток у его концов нет: так пришёл чужой SVG, и переписать его в `null`
 * значило бы менять документ там, где рука к нему не прикасалась.
 */
function degenerate(from: PenAnchor, to: PenAnchor): CubicSeg {
  return [r4(from.a[0]), r4(from.a[1]), r4(to.a[0]), r4(to.a[1])];
}

const nodeCount = (p: EditPath) => p.nodes.length;
const intervalCount = (p: EditPath) => (p.closed ? p.nodes.length : p.nodes.length - 1);
const endNode = (p: EditPath, i: number) => p.nodes[(i + 1) % p.nodes.length];

/** Точка интервала `i` при параметре `t` — прямая или кубика, ровно как её нарисует документ. */
function intervalPoint(p: EditPath, i: number, t: number): [number, number] {
  const A = p.nodes[i];
  const B = endNode(p, i);
  if (!A.outH && !B.inH) {
    return [A.a[0] + (B.a[0] - A.a[0]) * t, A.a[1] + (B.a[1] - A.a[1]) * t];
  }
  const c1 = A.outH ? { x: A.a[0] + A.outH[0], y: A.a[1] + A.outH[1] } : { x: A.a[0], y: A.a[1] };
  const c2 = B.inH ? { x: B.a[0] + B.inH[0], y: B.a[1] + B.inH[1] } : { x: B.a[0], y: B.a[1] };
  const q = cubicAt({ x: A.a[0], y: A.a[1] }, c1, c2, { x: B.a[0], y: B.a[1] }, t);
  return [q.x, q.y];
}

/**
 * ЧТО ПОД КУРСОРОМ: узел, конец рукоятки или место на самой кривой.
 *
 * ПОРЯДОК — БЛИЖАЙШЕЕ ПОБЕЖДАЕТ, при равенстве узел; кривая рассматривается только когда ни узла,
 * ни рукоятки в радиусе нет. Довод тот же, что у `penPick`: перекос в любую сторону делает
 * НЕБЕРУЩИМСЯ то, что оказалось накрыто, а рукоятка ездит вместе со своим узлом, так что «навсегда»
 * здесь буквально. Вырожденно короткая рукоятка (конец ближе половины радиуса к своему узлу) не
 * предлагается вовсе — взять её нельзя, а ничьи она бы перетягивала.
 *
 * ВСЕ РАССТОЯНИЯ — В ПИКСЕЛЯХ ПЛАТЫ, и радиус вызывающий обязан подать УЖЕ ПОДЕЛЁННЫМ НА ЗУМ: плита
 * масштабируется, а десять экранных пикселей должны значить десять экранных пикселей на любом
 * приближении.
 */
export function editHit(path: EditPath, at: [number, number], world: PenWorld): EditHit {
  let bestN: { index: number; d: number } | null = null;
  let bestH: { index: number; side: 'in' | 'out'; d: number } | null = null;
  for (let i = path.nodes.length - 1; i >= 0; i--) {
    const an = path.nodes[i];
    const da = worldDist(at, an.a, world.w, world.h);
    if (da <= world.radius && (!bestN || da < bestN.d)) bestN = { index: i, d: da };
    for (const side of ['out', 'in'] as const) {
      const end = handleEnd(an, side);
      if (!end) continue;
      if (worldDist(end, an.a, world.w, world.h) < world.radius * 0.5) continue;
      const dh = worldDist(at, end, world.w, world.h);
      if (dh <= world.radius && (!bestH || dh < bestH.d)) bestH = { index: i, side, d: dh };
    }
  }
  // Сравнение ОДИН раз и явно — тот же довод, что у `penPick`: на равном удалении победитель
  // обязан быть назван, а не выпасть из порядка обхода и последних битов мантиссы.
  if (bestN && (!bestH || bestN.d <= bestH.d + PICK_EPS)) return { kind: 'node', index: bestN.index };
  if (bestH) return { kind: 'handle', index: bestH.index, side: bestH.side };
  return nearestOnPath(path, at, world);
}

/** Ближайшее место НА контуре: интервал и параметр. null — дальше радиуса захвата. */
export function nearestOnPath(path: EditPath, at: [number, number], world: PenWorld): EditHit {
  let hit: { index: number; t: number } | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < intervalCount(path); i++) {
    let prev = intervalPoint(path, i, 0);
    for (let k = 1; k <= FLATTEN_STEPS; k++) {
      const cur = intervalPoint(path, i, k / FLATTEN_STEPS);
      // Проекция на звено — в мировых пикселях: доля по x и по y весят по-разному.
      const ax = prev[0] * world.w;
      const ay = prev[1] * world.h;
      const bx = cur[0] * world.w;
      const by = cur[1] * world.h;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const u =
        len2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((at[0] * world.w - ax) * dx + (at[1] * world.h - ay) * dy) / len2));
      const d = Math.hypot(at[0] * world.w - (ax + u * dx), at[1] * world.h - (ay + u * dy));
      if (d < bestD) {
        bestD = d;
        hit = { index: i, t: (k - 1 + u) / FLATTEN_STEPS };
      }
      prev = cur;
    }
  }
  return hit && bestD <= world.radius ? { kind: 'segment', index: hit.index, t: hit.t } : null;
}

/** Войти в правку узлов штриха `index`. null — этот штрих поузлово не правится (см. `nodeEditable`). */
export function editBegin(strokes: VectorStroke[], index: number): EditState | null {
  const stroke = strokes[index];
  if (!stroke) return null;
  const path = readPath(stroke);
  if (!path) return null;
  return { stroke: index, path, sel: -1, drag: null, dirty: false };
}

/**
 * ПЕРЕЧИТАТЬ ПУТЬ ИЗ ДОКУМЕНТА, сохранив выбор. Зовётся ПОСЛЕ отмены и возврата: лента вернула
 * другой список штрихов, и живой путь, оставшийся от прошлой формы, показывал бы узлы, которых в
 * документе больше нет. Это ровно та ловушка «двух стеков под одним ⌘Z», от которой здесь спасает
 * то, что состояние правки — ВИД на документ, а не вторая его копия.
 */
export function editResync(strokes: VectorStroke[], st: EditState): EditState | null {
  const stroke = strokes[st.stroke];
  if (!stroke) return null;
  const path = readPath(stroke);
  if (!path) return null;
  return { stroke: st.stroke, path, sel: st.sel < path.nodes.length ? st.sel : -1, drag: null, dirty: false };
}

/** Живой путь для превью — тем же построителем, что рисует перо: одна арифметика на оба экрана. */
export function editPreviewD(path: EditPath, w: number, h: number): string {
  const pen: PenState = { anchors: path.nodes, drag: null, closed: path.closed };
  return penPreviewD(pen, w, h);
}

/** Интервал перестаёт быть прямым, как только на одном из его концов появилась рукоятка. */
function unflatten(flat: boolean[], i: number): boolean[] {
  if (i < 0 || i >= flat.length || !flat[i]) return flat;
  const next = flat.slice();
  next[i] = false;
  return next;
}

/** Интервал снова прям, когда рукояток у обоих его концов не осталось. */
function reflatten(path: EditPath, flat: boolean[], i: number): boolean[] {
  if (i < 0 || i >= flat.length) return flat;
  const A = path.nodes[i];
  const B = endNode(path, i);
  if (A.outH || B.inH || flat[i]) return flat;
  const next = flat.slice();
  next[i] = true;
  return next;
}

/** Интервалы, приходящий в узел и уходящий из него. `-1` — такого интервала нет. */
function around(path: EditPath, i: number): { inI: number; outI: number } {
  const n = nodeCount(path);
  if (path.closed) return { inI: (i + n - 1) % n, outI: i };
  return { inI: i - 1, outI: i < n - 1 ? i : -1 };
}

/**
 * НАЖАТИЕ В РЕЖИМЕ ПРАВКИ. `took` говорит вызывающему, что событие израсходовано здесь и разбирать
 * его дальше (выбирать другой штрих, ставить якорь) НЕ НАДО, — без этого клик по узлу заодно
 * перевыбирал бы штрих под ним.
 *
 * ALT ПО УЗЛУ — Convert Point: гладкий становится углом (рукоятки снимаются, соседние сегменты
 * выпрямляются), угол — гладким (пара строится по соседям). Правка немедленная, драг не начинается.
 * ALT ПО КРИВОЙ — вставить узел ровно туда, куда ткнули, не меняя формы.
 */
export function editDown(
  st: EditState,
  at: [number, number],
  world: PenWorld,
  mods: PenMods = {},
): { st: EditState; took: boolean } {
  const hit = editHit(st.path, at, world);
  if (!hit) return { st: { ...st, sel: -1, drag: null }, took: false };
  if (hit.kind === 'node') {
    if (mods.alt) return { st: { ...editConvert(st, hit.index, world), sel: hit.index }, took: true };
    const from = st.path.nodes[hit.index].a;
    return {
      st: {
        ...st,
        sel: hit.index,
        drag: {
          kind: 'node',
          index: hit.index,
          grab: [at[0] - from[0], at[1] - from[1]],
          from: [from[0], from[1]],
        },
      },
      took: true,
    };
  }
  if (hit.kind === 'handle') {
    return {
      st: { ...st, sel: hit.index, drag: { kind: 'handle', index: hit.index, side: hit.side } },
      took: true,
    };
  }
  if (mods.alt) return { st: editInsert(st, hit.index, hit.t), took: true };
  return { st: { ...st, drag: null }, took: false };
}

/**
 * ДВИЖЕНИЕ С ЗАЖАТОЙ КНОПКОЙ.
 *
 * Узел: едет за курсором, сохраняя смещение захвата; рукоятки — смещения, поэтому едут с ним сами и
 * НИ ОДНА чужая координата не трогается. Shift держит его на луче, кратном 45° от места, где он
 * стоял до захвата.
 *
 * Рукоятка: идёт за курсором; связанная пара ВРАЩАЕТСЯ вслед, сохраняя свою длину (жест фотошопа —
 * см. `swingOpposite`), Alt размыкает пару навсегда.
 */
export function editMove(
  st: EditState,
  at: [number, number],
  mods: PenMods,
  world: PenWorld,
): EditState {
  if (!st.drag) return st;
  const nodes = st.path.nodes.slice();
  if (st.drag.kind === 'node') {
    const { index, grab, from } = st.drag;
    const raw: [number, number] = [at[0] - grab[0], at[1] - grab[1]];
    const put = mods.shift ? snap45(from, raw, world) : raw;
    nodes[index] = { ...nodes[index], a: [clamp01(put[0]), clamp01(put[1])] };
    return { ...st, path: { ...st.path, nodes }, dirty: true };
  }
  const { index, side } = st.drag;
  const an = nodes[index];
  const tip = mods.shift ? snap45(an.a, at, world) : at;
  const off: [number, number] = [clampH(tip[0] - an.a[0]), clampH(tip[1] - an.a[1])];
  const next: PenAnchor = { ...an, [side === 'in' ? 'inH' : 'outH']: off };
  if (mods.alt) next.linked = false;
  else if (an.linked) {
    const swung = swingOpposite(off, side === 'in' ? an.outH : an.inH, world);
    if (side === 'in') next.outH = swung;
    else next.inH = swung;
  }
  nodes[index] = next;
  const path: EditPath = { ...st.path, nodes };
  const { inI, outI } = around(path, index);
  // Рукоятка появилась — интервал под ней больше не прямой; обе стороны связанной пары считаются.
  let flat = path.flat;
  if (next.inH) flat = unflatten(flat, inI);
  if (next.outH) flat = unflatten(flat, outI);
  return { ...st, path: { ...path, flat }, dirty: true };
}

/** Кнопка отпущена — драг окончен. `dirty` НЕ снимается: коммит делает `editCommit`. */
export function editUp(st: EditState): EditState {
  return st.drag ? { ...st, drag: null } : st;
}

/** Выбрать узел (или снять выбор числом вне диапазона). */
export function editSelect(st: EditState, index: number): EditState {
  return { ...st, sel: index >= 0 && index < st.path.nodes.length ? index : -1 };
}

/**
 * УГОЛ ⇄ ГЛАДКАЯ ТОЧКА — фотошопный Convert Point.
 *
 * Гладкий теряет ОБЕ свои рукоятки. Соседний интервал становится прямым ТОЛЬКО ЕСЛИ у соседа с той
 * стороны рукоятки тоже нет: кривизна интервала — общее дело двух его концов, и объявить его прямым
 * из-за одного конца значило бы выпрямить кривую, которую держит другой. Ровно так ведёт себя
 * Convert Point в иллюстраторе: сегмент за преобразованным узлом остаётся гнутым со стороны соседа.
 *
 * Угол получает пару, построенную по соседям (`smoothHandles`), и его интервалы перестают быть
 * прямыми.
 */
export function editConvert(st: EditState, index: number, world: PenWorld): EditState {
  const nodes = st.path.nodes.slice();
  const an = nodes[index];
  if (!an) return st;
  const { inI, outI } = around(st.path, index);
  if (an.linked || an.inH || an.outH) {
    nodes[index] = { ...an, inH: null, outH: null, linked: false };
    const path: EditPath = { ...st.path, nodes };
    let flat = reflatten(path, path.flat, inI);
    flat = reflatten({ ...path, flat }, flat, outI);
    return { ...st, path: { ...path, flat }, sel: index, dirty: true };
  }
  const n = nodeCount(st.path);
  const prev = st.path.closed ? nodes[(index + n - 1) % n].a : nodes[index - 1]?.a ?? null;
  const nxt = st.path.closed ? nodes[(index + 1) % n].a : nodes[index + 1]?.a ?? null;
  const h = smoothHandles(prev, an.a, nxt, world);
  nodes[index] = { ...an, inH: h.inH, outH: h.outH, linked: isSmooth(h.inH, h.outH) };
  const path: EditPath = { ...st.path, nodes };
  let flat = path.flat;
  if (h.inH) flat = unflatten(flat, inI);
  if (h.outH) flat = unflatten(flat, outI);
  return { ...st, path: { ...path, flat }, sel: index, dirty: true };
}

/**
 * ВСТАВИТЬ УЗЕЛ НА ИНТЕРВАЛ, НЕ ИЗМЕНИВ ФОРМЫ, — деление кубики по де Кастельжо.
 *
 * Это не «примерно на кривой»: разбиение кубики в точке `t` даёт ДВЕ кубики, чьё объединение
 * тождественно исходной при любом `t`. Поэтому промах в выборе `t` (а он берётся с флэттенинга и
 * потому приблизителен) стоит лишь того, что узел сядет чуть в стороне ВДОЛЬ кривой, — форма не
 * меняется вовсе. Прямой интервал делится линейно и остаётся двумя прямыми.
 *
 * Соседние узлы отдают часть своих рукояток новому — это и есть цена сохранения формы: у левого
 * исходящая укорачивается до `p01`, у правого входящая — до `p23`. НАПРАВЛЕНИЯ обеих не меняются,
 * поэтому гладкость соседей не портится.
 */
export function editInsert(st: EditState, interval: number, t: number): EditState {
  const path = st.path;
  if (interval < 0 || interval >= intervalCount(path)) return st;
  const u = Math.min(1, Math.max(0, t));
  const A = path.nodes[interval];
  const B = endNode(path, interval);
  const nodes = path.nodes.slice();
  const flat = path.flat.slice();
  const at = (interval + 1) % nodeCount(path);
  const insertAt = at === 0 ? nodes.length : at;

  if (flat[interval] || (!A.outH && !B.inH)) {
    const p: [number, number] = [
      A.a[0] + (B.a[0] - A.a[0]) * u,
      A.a[1] + (B.a[1] - A.a[1]) * u,
    ];
    nodes.splice(insertAt, 0, { a: p, inH: null, outH: null, linked: false });
    flat.splice(interval, 1, flat[interval], flat[interval]);
    return { ...st, path: { ...path, nodes, flat }, sel: insertAt, dirty: true };
  }

  const p0: [number, number] = A.a;
  const p3: [number, number] = B.a;
  const c1: [number, number] = A.outH ? [p0[0] + A.outH[0], p0[1] + A.outH[1]] : p0;
  const c2: [number, number] = B.inH ? [p3[0] + B.inH[0], p3[1] + B.inH[1]] : p3;
  const mix = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
  ];
  const p01 = mix(p0, c1);
  const p12 = mix(c1, c2);
  const p23 = mix(c2, p3);
  const p012 = mix(p01, p12);
  const p123 = mix(p12, p23);
  const p = mix(p012, p123);

  nodes[interval] = { ...A, outH: offOrNull(p01[0] - p0[0], p01[1] - p0[1]) };
  const rightIdx = (interval + 1) % nodeCount(path);
  nodes[rightIdx] = { ...B, inH: offOrNull(p23[0] - p3[0], p23[1] - p3[1]) };
  const born: PenAnchor = {
    a: p,
    inH: offOrNull(p012[0] - p[0], p012[1] - p[1]),
    outH: offOrNull(p123[0] - p[0], p123[1] - p[1]),
    linked: true,
  };
  nodes.splice(insertAt, 0, born);
  flat.splice(interval, 1, false, false);
  return { ...st, path: { ...path, nodes, flat }, sel: insertAt, dirty: true };
}

/**
 * УДАЛИТЬ УЗЕЛ. Два интервала вокруг него сливаются в один; прямым он остаётся, только если прямыми
 * были ОБА (иначе прямая молча съела бы кривизну соседа). Форма при удалении меняется — так и
 * должно быть, это явный глагол, а не правка «на месте».
 *
 * Меньше двух узлов — контура больше нет; путь остаётся пустым, и `editCommit` уберёт штрих из
 * документа целиком (одним шагом ленты, как всякая другая правка).
 */
export function editDelete(st: EditState, index: number): EditState {
  const path = st.path;
  const n = nodeCount(path);
  if (index < 0 || index >= n) return st;
  const nodes = path.nodes.slice();
  const flat = path.flat.slice();
  if (path.closed) {
    const p = (index + n - 1) % n;
    flat[p] = flat[p] && flat[index];
    flat.splice(index, 1);
  } else if (index === 0) {
    flat.splice(0, 1);
  } else if (index === n - 1) {
    flat.splice(n - 2, 1);
  } else {
    flat[index - 1] = flat[index - 1] && flat[index];
    flat.splice(index, 1);
  }
  nodes.splice(index, 1);
  // ОБОРВАННЫЕ РУКОЯТКИ СНИМАЮТСЯ вместе с интервалом, которого больше нет: у открытого пути новый
  // конец не имеет исходящей, а новое начало — входящей, иначе они писались бы в интервал соседа.
  if (!path.closed && nodes.length >= 1) {
    nodes[0] = { ...nodes[0], inH: null, linked: false };
    nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], outH: null, linked: false };
  }
  const left = nodes.length < 2 ? [] : nodes;
  return {
    ...st,
    path: { nodes: left, closed: path.closed && left.length >= 2, flat: left.length ? flat : [] },
    sel: left.length ? Math.min(index, left.length - 1) : -1,
    dirty: true,
  };
}

/** Сдвинуть выбранный узел на `dx`/`dy` ПИКСЕЛЕЙ ПЛАТЫ — стрелками, как в иллюстраторе. */
export function editNudge(st: EditState, dx: number, dy: number, world: PenWorld): EditState {
  if (st.sel < 0 || st.sel >= st.path.nodes.length) return st;
  const nodes = st.path.nodes.slice();
  const an = nodes[st.sel];
  nodes[st.sel] = {
    ...an,
    a: [clamp01(an.a[0] + dx / world.w), clamp01(an.a[1] + dy / world.h)],
  };
  return { ...st, path: { ...st.path, nodes }, dirty: true };
}

/**
 * ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ ДОКУМЕНТА. Возвращает НОВЫЙ список штрихов — вызывающий кладёт его в
 * `commitLines` ровно один раз, и ⌘Z снимает ровно этот жест. `null` — писать нечего.
 *
 * Путь ПЕРЕЧИТЫВАЕТСЯ из записанного штриха: документ округляет координаты до четырёх знаков, и
 * оставить в руке неокруглённые значило бы, что экран показывает одно, а следующее открытие — на
 * тысячную другое. Разойтись им негде, если истина одна.
 */
export function editCommit(
  strokes: VectorStroke[],
  st: EditState,
): { strokes: VectorStroke[]; st: EditState | null } | null {
  if (!st.dirty) return null;
  const src = strokes[st.stroke];
  if (!src) return null;
  const next = writePath(st.path, src);
  if (!next) {
    return { strokes: strokes.filter((_, i) => i !== st.stroke), st: null };
  }
  const list = strokes.map((s, i) => (i === st.stroke ? next : s));
  const back = readPath(next);
  return {
    strokes: list,
    st: back
      ? { stroke: st.stroke, path: back, sel: st.sel < back.nodes.length ? st.sel : -1, drag: null, dirty: false }
      : null,
  };
}
