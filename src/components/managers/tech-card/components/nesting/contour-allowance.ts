// Ф3.3 — СКОЛЬКО ПРИПУСКА УЖЕ ЛЕЖИТ В САМОМ КОНТУРЕ. Замер по файлу, а не догадка.
//
// ЗАЧЕМ. Модалка отдельно спрашивает «припуск на шов, см» и раздувает им КАЖДУЮ деталь
// (`lib/nesting/geom/seam-allowance.ts`). Если в файле уже лежит ЛИНИЯ КРОЯ — то есть контур,
// в который припуск уже вложен лекальщиком, — то офсет добавляет его ВТОРОЙ РАЗ: маркер
// становится длиннее реального, норма ткани завышается по всему периметру каждой детали, и на
// экране про это не сказано ни слова. Спека Ф3 §5.1.
//
// УЛИКА ИЗМЕРИМА, И ОНА УЖЕ В ФАЙЛЕ. Блок DXF обычно несёт контур ДВАЖДЫ, на разных слоях:
// линию шва и линию кроя (`contour-layer.ts:3-11`, замер на `summer men.dxf`: слой 1 — линия
// кроя базового размера, слой 14 — линия шва, градуирующаяся по размерам). Внутри блока их не
// различить по имени слоя, но различает ВЛОЖЕННОСТЬ: линия шва целиком лежит внутри линии кроя,
// а зазор между ними и есть припуск. Значит вопрос «выбранный слой — это крой или шов?»
// решается арифметикой над двумя контурами ОДНОГО блока. Спека Ф3 §5.2.
//
// ЧЕГО ЭТОТ МОДУЛЬ НЕ ДЕЛАЕТ — И ЭТО ГЛАВНОЕ. Он НИКОГДА не возвращает число, которого не
// измерил. Файл, где у блока один замкнутый контур; файл, где второй контур ПЕРЕСЕКАЕТ первый
// (так ведёт себя неградуирующийся слой на неба́зовом размере: на XS слой 1 отстоит от контура
// «от 0.03 до 2.03 см и местами его пересекает», `seam-allowance.ts:26-31`); карточка, где
// принятых блоков меньше трёх, — всё это `verdict: 'unknown'` и `allowanceCm: null`, а не ноль.
// Ноль здесь — ЗАКОННОЕ ИЗМЕРЕННОЕ ЗНАЧЕНИЕ («разложен шов, припуска в контуре нет»), и
// спутать его с «не мерили» значит соврать ровно там, где Ф3 заводит колонку NULLable
// (спека §5.4, миграция 0274 «ПОЧЕМУ ВЕЗДЕ NULL, А НЕ 0»).
//
// ПОЧЕМУ БАЗОВЫЙ РАЗМЕР НЕ НАДО НАЗЫВАТЬ ОТДЕЛЬНО. `04-marker-conditions.md` просит мерить «на
// базовом размере». Здесь этого требования нет НИ ОДНОЙ строкой — и не нужно: на неба́зовом
// размере неградуирующийся справочный контур либо пересекает деталь (пара отбрасывается
// вложенностью), либо отстоит неровно (пара отбрасывается требованием узкого разброса,
// p90−p10 ≤ 0.15 см). Базовый размер ОПОЗНАЁТ СЕБЯ САМ, и правило остаётся алгоритмом, а не
// пожеланием к оператору. Спека §5.2.
//
// ГДЕ ЖИВЁТ. Рядом с `contour-layer.ts`, а не в `src/lib/nesting/` — это решение ЭКРАНА о том,
// что показать оператору и что отправить на сервер, а не часть движка раскладки. Зависимости —
// только типы и `geom/polygon.ts` (вложенность точки в контур), поэтому импорт в UI не тащит ни
// clipper, ни dxf-parser. Функция ЧИСТАЯ: одинаковый вход ⇒ одинаковый выход.
import { bounds, pointInPolygon, type Bounds } from 'lib/nesting/geom/polygon';
import type { PieceDTO, Pt } from 'lib/nesting/types';

// ── пороги замера. Все четыре из спеки Ф3 §5.2 ────────────────────────────────────────────────

// Сколько точек берётся с ВНЕШНЕГО контура пары. Равномерно ПО ДЛИНЕ, а не по вершинам:
// вершины кучкуются на скруглениях (там их сотни) и редки на прямых (там их две), так что
// выборка по вершинам мерила бы почти только скругления.
export const ALLOWANCE_SAMPLES = 64;

// Разброс замера, шире которого пара НЕПРИГОДНА: p90 − p10, см. Это и есть тест «две линии
// действительно параллельны», то есть «это припуск, а не градация и не другая деталь».
export const ALLOWANCE_MAX_SPREAD_CM = 0.15;

// Ниже этого зазор считается совпадением линий, а не припуском, см.
export const ALLOWANCE_MIN_GAP_CM = 0.05;

// Меньше стольких принятых блоков — вывода нет. Мелкая карточка честно остаётся неизмеренной.
export const ALLOWANCE_MIN_BLOCKS = 3;

// Доля принятых блоков, обязанная сойтись в одном ответе, иначе вывода нет.
export const ALLOWANCE_MAJORITY = 2 / 3;

// Допуск сравнения габаритов при отборе пар-кандидатов, см. Только предфильтр: вложенность
// габаритов НЕОБХОДИМА для вложенности контуров, поэтому отсев здесь не может выбросить
// годную пару, а вот дорогой перебор точек экономит.
const BBOX_EPS_CM = 1e-6;

// ── что этот модуль отвечает ──────────────────────────────────────────────────────────────────

export type AllowanceVerdict =
  // Выбранный контур — ЛИНИЯ КРОЯ: припуск в него уже вложен, и вот сколько его (`allowanceCm`).
  | 'cut'
  // Выбранный контур — ЛИНИЯ ШВА: в контуре припуска нет (`allowanceCm === 0`), а `gapCm` —
  // тот припуск, который лекальщик НАРИСОВАЛ снаружи (годится в предзаполнение поля офсета).
  | 'seam'
  // Улик нет. `allowanceCm === null`. НЕ ноль.
  | 'unknown';

export type AllowanceUnknownReason =
  // Слой контура не выбран вовсе (в файле нечего было выбирать) — мерить нечего.
  | 'no_layer'
  // На этом слое нет ни одного контура.
  | 'layer_absent'
  // У деталей нет места в чертеже (`originX/originY`) — так выглядит деталь, восстановленная из
  // СОХРАНЁННОГО маркера (`types.ts:112-123`). Два контура нельзя положить в одну систему
  // координат, а значит и сравнить.
  | 'no_origin'
  // Принятых блоков меньше `ALLOWANCE_MIN_BLOCKS`.
  | 'too_few_blocks'
  // Принятые блоки не сошлись: ни «шов», ни «крой» не набрали `ALLOWANCE_MAJORITY`.
  | 'no_majority';

// Сторона, с которой выбранный контур оказался относительно своей пары.
export type AllowanceSide =
  // Выбранный СНАРУЖИ (пара лежит внутри него) ⇒ выбранный = линия кроя.
  | 'chosen_outside'
  // Выбранный ВНУТРИ пары ⇒ выбранный = линия шва.
  | 'chosen_inside';

// Один принятый замер: какой блок, с чем сравнивали и что намерили. Это и есть «история
// выборки» — маркер, открытый через полгода, обязан отвечать не только числом, но и тем, на
// чём оно получено.
export type AllowanceSample = {
  // Имя блока DXF; '' — деталь из общей россыпи файла (блока у неё нет).
  block: string;
  // Файл, в котором сидит блок (display-имя) и его индекс в разборе.
  source: string;
  fileIndex: number;
  // id детали на выбранном слое и id её пары.
  chosenPieceId: number;
  otherPieceId: number;
  // Слой пары. Тот самый «второй контур», который и делает замер возможным.
  otherLayer: string;
  side: AllowanceSide;
  // Медиана расстояния между линиями, см (она же p50).
  gapCm: number;
  p10Cm: number;
  p90Cm: number;
  // p90 − p10: насколько ровно идёт зазор. Чем меньше, тем это больше похоже на припуск.
  spreadCm: number;
  // Сколько точек реально взято (обычно ALLOWANCE_SAMPLES).
  points: number;
};

// Почему блок НЕ дал замера. Считается по каждой причине отдельно, потому что «улик нет» —
// это четыре разных файла, и оператору с разработчиком они говорят разное.
export type AllowanceStats = {
  // Сколько деталей лежит на выбранном слое — столько «голосующих единиц» и было.
  chosenPieces: number;
  // Из них: у блока не нашлось НИ ОДНОГО второго замкнутого контура.
  aloneInBlock: number;
  // Пар проверено всего.
  pairsTried: number;
  // Пары, отвергнутые вложенностью (контуры пересекаются либо лежат рядом).
  rejectedCrossing: number;
  // Пары, отвергнутые разбросом (зазор неровный: градация, а не припуск).
  rejectedSpread: number;
  // Пары, отвергнутые близостью (линии практически совпали).
  rejectedTooClose: number;
  // Пары, которые нельзя было положить в одну систему координат.
  rejectedNoOrigin: number;
  // Блоки, где принятые пары СПОРЯТ: что-то нашлось и снаружи, и внутри выбранного контура.
  // Такой блок исключён из голосования целиком — он не улика, а вопрос.
  conflicted: number;
  // Блоки, давшие голос.
  accepted: number;
  // Как разошлись голоса.
  votesChosenOutside: number;
  votesChosenInside: number;
};

export type ContourAllowance = {
  // Слой, про который отвечали.
  layer: string;
  verdict: AllowanceVerdict;
  // Припуск, УЖЕ содержащийся в выбранном контуре, см — то самое `contour_allowance_cm`
  // (прото Ф3, поле 18). 0 при 'seam', >0 при 'cut', **null при 'unknown'**. Округлено до
  // сотых: колонка `DECIMAL(6,2)`, а сырые числа лежат в `samples`.
  allowanceCm: number | null;
  // Замеренный зазор между двумя линиями чертежа, см, в ОБОИХ вердиктах — при 'seam' это
  // припуск, который лекальщик нарисовал снаружи, и он же последний осмысленный кандидат в
  // предзаполнение поля офсета (спека §5.5). null, когда мерить было нечем.
  gapCm: number | null;
  // Заполнено ТОЛЬКО при 'unknown' — и наоборот.
  reason: AllowanceUnknownReason | null;
  // Принятые замеры, по одному на проголосовавший блок, в порядке убывания уверенности
  // (сперва самый ровный зазор).
  samples: AllowanceSample[];
  stats: AllowanceStats;
};

// ── геометрия. Ровно столько, сколько нужно, и ничего из движка ───────────────────────────────

// Контур в координатах ЧЕРТЕЖА. `poly` у детали нормализован к собственному bbox
// (`worker/parse-files.ts:73-74`), поэтому два контура одного блока в своих координатах
// совпадают началом и сравнивать их бессмысленно — их надо вернуть на место.
function absPoly(p: PieceDTO): Pt[] | null {
  if (p.originX == null || p.originY == null) return null;
  const dx = p.originX;
  const dy = p.originY;
  return p.poly.map((q) => ({ x: q.x + dx, y: q.y + dy }));
}

// Габарит A лежит внутри габарита B (с допуском). Предфильтр к вложенности контуров.
function bboxInside(a: Bounds, b: Bounds, eps: number): boolean {
  return (
    a.minX >= b.minX - eps &&
    a.minY >= b.minY - eps &&
    a.maxX <= b.maxX + eps &&
    a.maxY <= b.maxY + eps
  );
}

// ВСЕ вершины `inner` лежат внутри `outer`. Строго все — как требует §5.2. Ранний выход на
// первой же вершине снаружи делает отсев непригодных пар дешёвым.
function allVerticesInside(inner: readonly Pt[], outer: readonly Pt[]): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer)) return false;
  }
  return true;
}

// Квадрат расстояния от точки до отрезка.
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

// Расстояние от точки до БЛИЖАЙШЕГО СЕГМЕНТА замкнутого контура. Именно до сегмента, а не до
// вершины: у вершин своя плотность, и «до ближайшей вершины» на длинной прямой намерило бы
// половину этой прямой вместо припуска.
function distToPolyline(pt: Pt, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const d2 = segDist2(pt.x, pt.y, a.x, a.y, b.x, b.y);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

// `n` точек РАВНОМЕРНО ПО ДЛИНЕ замкнутого контура, начиная с первой вершины. Детерминированно:
// один и тот же контур всегда даёт одни и те же точки.
function sampleAlong(poly: readonly Pt[], n: number): Pt[] {
  const m = poly.length;
  if (m < 2 || n < 1) return [];
  const seg: number[] = new Array(m);
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % m];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    seg[i] = len;
    total += len;
  }
  if (!(total > 0)) return [];
  const out: Pt[] = [];
  const step = total / n;
  let i = 0;
  let walked = 0; // длина, пройденная до начала сегмента i
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (i < m - 1 && walked + seg[i] < target) {
      walked += seg[i];
      i++;
    }
    const a = poly[i];
    const b = poly[(i + 1) % m];
    const t = seg[i] > 0 ? Math.min(1, Math.max(0, (target - walked) / seg[i])) : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

// Перцентиль с линейной интерполяцией по ОТСОРТИРОВАННОМУ массиву.
function percentile(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(values: readonly number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

// Сотые доли сантиметра: колонка `DECIMAL(6,2)`, и печатать 0.9987 значит обещать точность,
// которой у замера нет. Порог `ALLOWANCE_MIN_GAP_CM` = 0.05 гарантирует, что округление не
// превратит принятый замер в ноль.
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── ядро: одна пара контуров ──────────────────────────────────────────────────────────────────

type PairOutcome =
  | { ok: true; outerId: number; innerId: number; p10: number; p50: number; p90: number; points: number }
  | { ok: false; why: 'crossing' | 'spread' | 'too_close' };

// Разбор ОДНОЙ пары контуров одного блока. Порядок аргументов не значим: функция сама решает,
// кто снаружи, и это решение — единственная улика, ради которой всё написано.
function judgePair(
  aId: number,
  a: readonly Pt[],
  aBox: Bounds,
  bId: number,
  b: readonly Pt[],
  bBox: Bounds,
): PairOutcome {
  let outerId: number;
  let innerId: number;
  let outer: readonly Pt[];
  let inner: readonly Pt[];
  if (bboxInside(aBox, bBox, BBOX_EPS_CM) && allVerticesInside(a, b)) {
    outerId = bId;
    outer = b;
    innerId = aId;
    inner = a;
  } else if (bboxInside(bBox, aBox, BBOX_EPS_CM) && allVerticesInside(b, a)) {
    outerId = aId;
    outer = a;
    innerId = bId;
    inner = b;
  } else {
    // Контуры пересекаются либо расходятся — пара непригодна. Именно сюда попадает
    // неградуирующийся справочный слой на неба́зовом размере, и это правильный ответ:
    // расстояние между пересекающимися линиями припуском не является.
    return { ok: false, why: 'crossing' };
  }

  const pts = sampleAlong(outer, ALLOWANCE_SAMPLES);
  if (pts.length === 0) return { ok: false, why: 'crossing' };
  const d = pts.map((p) => distToPolyline(p, inner)).sort((x, y) => x - y);
  const p10 = percentile(d, 0.1);
  const p50 = percentile(d, 0.5);
  const p90 = percentile(d, 0.9);
  // Порядок проверок значим только для статистики: «линии совпали» и «зазор неровный» —
  // разные диагнозы, и схлопывать их в одну строку значит потерять половину истории.
  if (!(p50 > ALLOWANCE_MIN_GAP_CM)) return { ok: false, why: 'too_close' };
  if (!(p90 - p10 <= ALLOWANCE_MAX_SPREAD_CM)) return { ok: false, why: 'spread' };
  return { ok: true, outerId, innerId, p10, p50, p90, points: pts.length };
}

// ── индекс разбора: группировка и кеш пар ─────────────────────────────────────────────────────

type Prepared = {
  piece: PieceDTO;
  layer: string;
  // null ⇒ у детали нет места в чертеже, сравнивать не с чем.
  poly: Pt[] | null;
  box: Bounds | null;
};

type BlockGroup = {
  key: string;
  block: string;
  source: string;
  fileIndex: number;
  members: Prepared[];
};

// Разбор, подготовленный ОДИН РАЗ на набор деталей: абсолютные контуры, габариты, группы по
// блокам и память о уже посчитанных парах. Нужен, чтобы `measureAllLayers` (подписи в списке
// слоёв, Ф3.4/B4) не пересчитывал одни и те же пары по разу на слой: пара (слой 1, слой 14)
// внутри блока — ОДНА, и оба слоя читают её с разных сторон.
export type AllowanceIndex = {
  groups: BlockGroup[];
  byLayer: Map<string, Prepared[]>;
  pairs: Map<string, PairOutcome>;
};

export function buildAllowanceIndex(pieces: readonly PieceDTO[]): AllowanceIndex {
  const groups = new Map<string, BlockGroup>();
  const byLayer = new Map<string, Prepared[]>();
  for (const piece of pieces) {
    const layer = piece.layer ?? '';
    const poly = absPoly(piece);
    const prepared: Prepared = {
      piece,
      layer,
      poly,
      box: poly ? bounds(poly) : null,
    };
    // Группа = блок ОДНОГО файла. Индекс файла, а не его имя: два листа законно приезжают под
    // одним display-именем (`types.ts:102-106`), и склеить их блоки значило бы сравнивать
    // контуры из разных чертежей.
    const block = (piece.blockName ?? '').trim();
    const fileIndex = piece.fileIndex ?? -1;
    const key = `${fileIndex} ${block}`;
    const g = groups.get(key) ?? {
      key,
      block,
      source: piece.source,
      fileIndex,
      members: [],
    };
    g.members.push(prepared);
    groups.set(key, g);
    const list = byLayer.get(layer) ?? [];
    list.push(prepared);
    byLayer.set(layer, list);
  }
  return { groups: [...groups.values()], byLayer, pairs: new Map() };
}

function pairOf(idx: AllowanceIndex, a: Prepared, b: Prepared): PairOutcome | null {
  const aPoly = a.poly;
  const aBox = a.box;
  const bPoly = b.poly;
  const bBox = b.box;
  if (!aPoly || !aBox || !bPoly || !bBox) return null;
  const lo = Math.min(a.piece.id, b.piece.id);
  const hi = Math.max(a.piece.id, b.piece.id);
  const key = `${lo}|${hi}`;
  const hit = idx.pairs.get(key);
  if (hit) return hit;
  // Порядок аргументов зафиксирован по id, чтобы кеш отдавал ровно то же, что посчитал бы
  // прямой вызов, независимо от того, с какого слоя пришёл спрос.
  const res =
    a.piece.id === lo
      ? judgePair(a.piece.id, aPoly, aBox, b.piece.id, bPoly, bBox)
      : judgePair(b.piece.id, bPoly, bBox, a.piece.id, aPoly, aBox);
  idx.pairs.set(key, res);
  return res;
}

// ── главный вход ──────────────────────────────────────────────────────────────────────────────

// Замерить, сколько припуска уже лежит в контурах слоя `contourLayer`.
//
// ⚠ `pieces` — ПОЛНЫЙ набор разобранных деталей, ДО фильтрации по слою. Модалка фильтрует
// детали выбранным слоем (`nesting-modal.tsx:206-213`), и на отфильтрованном наборе мерить
// нечего по построению: второй контур блока как раз и есть то, что фильтр выбросил.
export function measureContourAllowance(
  pieces: readonly PieceDTO[],
  contourLayer: string,
  index?: AllowanceIndex,
): ContourAllowance {
  const idx = index ?? buildAllowanceIndex(pieces);
  return measureOnIndex(idx, contourLayer);
}

// Замер по каждому слою сразу — для подписи в списке слоёв («слой 1: линия кроя, +1.00 см»).
// Считает пары один раз на весь разбор, а не по разу на слой.
export function measureAllLayers(
  pieces: readonly PieceDTO[],
  layers?: readonly string[],
): Map<string, ContourAllowance> {
  const idx = buildAllowanceIndex(pieces);
  const want = layers ?? [...idx.byLayer.keys()];
  const out = new Map<string, ContourAllowance>();
  for (const layer of want) out.set(layer, measureOnIndex(idx, layer));
  return out;
}

function emptyStats(): AllowanceStats {
  return {
    chosenPieces: 0,
    aloneInBlock: 0,
    pairsTried: 0,
    rejectedCrossing: 0,
    rejectedSpread: 0,
    rejectedTooClose: 0,
    rejectedNoOrigin: 0,
    conflicted: 0,
    accepted: 0,
    votesChosenOutside: 0,
    votesChosenInside: 0,
  };
}

function unknown(
  layer: string,
  reason: AllowanceUnknownReason,
  stats: AllowanceStats,
  samples: AllowanceSample[] = [],
): ContourAllowance {
  return { layer, verdict: 'unknown', allowanceCm: null, gapCm: null, reason, samples, stats };
}

function measureOnIndex(idx: AllowanceIndex, contourLayer: string): ContourAllowance {
  const stats = emptyStats();
  // Пустой слой — это «слой не выбирался, потому что выбирать было не из чего»
  // (`defaultContourLayer` отдаёт '' ровно в этом случае). Мерить нечего.
  if (contourLayer === '') return unknown(contourLayer, 'no_layer', stats);

  const chosen = idx.byLayer.get(contourLayer) ?? [];
  stats.chosenPieces = chosen.length;
  if (chosen.length === 0) return unknown(contourLayer, 'layer_absent', stats);
  if (chosen.every((c) => c.poly == null)) return unknown(contourLayer, 'no_origin', stats);

  const groupOf = new Map<number, BlockGroup>();
  for (const g of idx.groups) for (const m of g.members) groupOf.set(m.piece.id, g);

  const accepted: AllowanceSample[] = [];
  for (const c of chosen) {
    const g = groupOf.get(c.piece.id);
    if (!g) continue;
    const others = g.members.filter((m) => m !== c);
    if (others.length === 0) {
      // Единственный замкнутый контур блока: сравнивать не с чем. Это первый из четырёх
      // законных способов остаться без улик (§5.4), и он самый частый.
      stats.aloneInBlock++;
      continue;
    }
    // Лучшая принятая пара НА КАЖДОЙ стороне. «Лучшая» = БЛИЖАЙШАЯ: если блок несёт и линию
    // кроя в сантиметре, и рамку-подложку в пяти, припуском является ближняя. Дальняя не
    // отбрасывается молча — она просто не побеждает.
    let best: { sample: AllowanceSample; side: AllowanceSide } | null = null;
    let bestOther: { sample: AllowanceSample; side: AllowanceSide } | null = null;
    for (const o of others) {
      const res = pairOf(idx, c, o);
      if (res === null) {
        stats.rejectedNoOrigin++;
        continue;
      }
      stats.pairsTried++;
      if (!res.ok) {
        if (res.why === 'crossing') stats.rejectedCrossing++;
        else if (res.why === 'spread') stats.rejectedSpread++;
        else stats.rejectedTooClose++;
        continue;
      }
      const side: AllowanceSide = res.outerId === c.piece.id ? 'chosen_outside' : 'chosen_inside';
      const sample: AllowanceSample = {
        block: g.block,
        source: g.source,
        fileIndex: g.fileIndex,
        chosenPieceId: c.piece.id,
        otherPieceId: o.piece.id,
        otherLayer: o.layer,
        side,
        gapCm: res.p50,
        p10Cm: res.p10,
        p90Cm: res.p90,
        spreadCm: res.p90 - res.p10,
        points: res.points,
      };
      const slot = best === null || best.side === side ? 'primary' : 'secondary';
      if (slot === 'primary') {
        if (best === null || sample.gapCm < best.sample.gapCm) best = { sample, side };
      } else if (bestOther === null || sample.gapCm < bestOther.sample.gapCm) {
        bestOther = { sample, side };
      }
    }
    if (best === null) continue;
    if (bestOther !== null) {
      // У блока нашлось что-то И снаружи выбранного контура, И внутри него. Значит выбранный
      // не крайний, и вопрос «крой или шов» на этом блоке НЕ РЕШЁН. Молча выбрать сторону
      // значило бы выдать уверенный ответ на споре — блок выбывает из голосования целиком.
      stats.conflicted++;
      continue;
    }
    if (best.side === 'chosen_outside') stats.votesChosenOutside++;
    else stats.votesChosenInside++;
    accepted.push(best.sample);
  }

  stats.accepted = accepted.length;
  // Сперва самый ровный зазор: список читается сверху, и сверху обязана быть самая крепкая улика.
  accepted.sort((a, b) => a.spreadCm - b.spreadCm || a.gapCm - b.gapCm);

  if (accepted.length < ALLOWANCE_MIN_BLOCKS) {
    return unknown(contourLayer, 'too_few_blocks', stats, accepted);
  }
  const outside = accepted.filter((s) => s.side === 'chosen_outside');
  const inside = accepted.filter((s) => s.side === 'chosen_inside');
  const need = ALLOWANCE_MAJORITY * accepted.length;

  if (inside.length >= need) {
    // Выбранный контур лежит ВНУТРИ второго ⇒ он линия шва, припуска в нём НЕТ. Ноль здесь
    // ИЗМЕРЕН, а не подставлен. `gapCm` — нарисованный лекальщиком припуск: он снаружи.
    return {
      layer: contourLayer,
      verdict: 'seam',
      allowanceCm: 0,
      gapCm: round2(median(inside.map((s) => s.gapCm))),
      reason: null,
      samples: accepted,
      stats,
    };
  }
  if (outside.length >= need) {
    // Выбранный контур лежит СНАРУЖИ второго ⇒ он линия кроя, и припуск уже в нём.
    // Медиана берётся по блокам ПОБЕДИВШЕЙ стороны: усреднять её с меньшинством, которое
    // отвечало на другой вопрос, значит смешивать два разных измерения в одно число.
    const cm = round2(median(outside.map((s) => s.gapCm)));
    return {
      layer: contourLayer,
      verdict: 'cut',
      allowanceCm: cm,
      gapCm: cm,
      reason: null,
      samples: accepted,
      stats,
    };
  }
  // Блоки не сошлись. Большинства нет — вывода нет.
  return unknown(contourLayer, 'no_majority', stats, accepted);
}

// ── подписи ───────────────────────────────────────────────────────────────────────────────────

// Короткая подпись к слою в списке выбора (Ф3.4/B4). Отдельная функция, чтобы «не измерено» и
// «измерено ноль» звучали по-разному ВЕЗДЕ, где их показывают.
export function allowanceLabel(m: ContourAllowance): string {
  if (m.verdict === 'cut') {
    return `линия кроя, припуск уже в контуре +${m.allowanceCm?.toFixed(2)} см`;
  }
  if (m.verdict === 'seam') {
    return m.gapCm != null
      ? `линия шва, припуск снаружи ${m.gapCm.toFixed(2)} см`
      : 'линия шва, припуска в контуре нет';
  }
  return 'припуск не измерен';
}

// Развёрнутое «почему не измерено» — для панели предупреждений и для строки, которая уедет в
// маркер. Ни одна из веток не имеет права звучать как «ноль».
export function allowanceUnknownText(m: ContourAllowance): string {
  switch (m.reason) {
    case 'no_layer':
      return 'слой контура не выбран — сравнивать нечего';
    case 'layer_absent':
      return 'на этом слое нет ни одного контура';
    case 'no_origin':
      return 'детали восстановлены из сохранённого маркера: их места в чертеже нет, замерить припуск по файлу нельзя';
    case 'too_few_blocks':
      return `замер удался на ${m.stats.accepted} блоках — нужно хотя бы ${ALLOWANCE_MIN_BLOCKS}`;
    case 'no_majority':
      return `блоки не сошлись: ${m.stats.votesChosenOutside} за «линия кроя», ${m.stats.votesChosenInside} за «линия шва»`;
    default:
      return '';
  }
}
