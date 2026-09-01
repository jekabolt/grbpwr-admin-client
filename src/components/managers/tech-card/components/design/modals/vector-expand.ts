import type { SelectionArea } from './vector-lasso';
import type { RasterLayer } from './vector-raster';
import {
  readInk,
  roundGauge,
  roundStep,
  WEIGHT_GAUGE,
  type CubicSeg,
  type VectorStroke,
} from './vector-strokes';

/**
 * ОБРАТНЫЙ КРОП — РАСШИРЕНИЕ ПЛИТЫ, И ПЕРЕСЧЁТ ВСЕГО, ЧТО НА НЕЙ НАРИСОВАНО.
 *
 * Дословно от владельца (Q-3): «в эдиторе нужно добавить обратный кроп те что бы мы могли
 * расширить картинку и выбрать цвет фона». То есть холст растёт, содержимое остаётся тем же, а по
 * краям появляется новое поле — залитое цветом или прозрачное.
 *
 * ── ЕДИНИЦЫ. ТРИ РАЗНЫХ МИРА, И ПУТАТЬ ИХ ЗДЕСЬ ДОРОЖЕ ВСЕГО ─────────────────────────────────
 *
 *  1. НАТУРАЛЬНЫЕ ПИКСЕЛИ картинки — то, в чём человек называет прибавку («добавить 200 px
 *     слева»), и то, в чём живёт растр (`RasterLayer.w/h`).
 *  2. ДОЛИ КАДРА 0..1 — то, в чём живут `VectorStroke.pts`, `VectorStroke.segs` и
 *     `SelectionArea.pts`. Смотри `readPoint` в `vector-strokes.ts`: якорь клампится в 0..1.
 *  3. ЮНИТЫ ПЛАТЫ — мир шириной `PLATE_W`/`GAUGE_REF` = 1000, в котором названы `gauge`, `step` и
 *     `SelectionArea.feather`.
 *
 * ГЛАВНОЕ, ЧТО НАДО ПОНЯТЬ ПРО РАСШИРЕНИЕ: ПЛИТА НЕ СТАНОВИТСЯ ШИРЕ. `PLATE_W` — КОНСТАНТА, и
 * плата всегда 1000 юнитов в ширину; меняется `ratio` документа и то, КАКУЮ ДОЛЮ платы занимает
 * старое содержимое. Расширение — это не «плата выросла», а «рисунок сжался внутрь платы».
 * Отсюда весь пересчёт: доля кадра `x` уезжает в `ox + x·kx`, где `kx = fromW/toW < 1`.
 *
 * ── ПОЧЕМУ ПРИБАВКИ ТОЛЬКО НЕОТРИЦАТЕЛЬНЫЕ ──────────────────────────────────────────────────
 *
 * Отрицательная прибавка — это кроп, и он ЗДЕСЬ НЕВЫРАЗИМ БЕЗОПАСНО. Кроп выносит часть якорей за
 * 0..1, а `readPoint` при следующем чтении слоя клампит их обратно на край: линия, ушедшая за
 * кадр, вернулась бы прижатой к границе, и это молчаливая потеря формы, которую нечем откатить.
 * Поэтому `expandSpec` клампит прибавки в ноль, а не «поддерживает и кроп заодно».
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СПЕЦИФИКАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Девять опорных точек, как в Canvas Size фотошопа. */
export type ExpandAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export const EXPAND_ANCHORS: readonly ExpandAnchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/**
 * Заливка нового поля. `null` — ПРОЗРАЧНО, и это не «цвет не выбран», а рабочее состояние: слой
 * растра держит дырки от ластика собственной альфой (см. шапку `vector-raster.ts`), и поле,
 * залитое белым, отличается от поля, которого нет, ровно тем же, чем краска отличается от дырки.
 */
export type ExpandFill = string | null;

/** Белый — то же, чем плата грунтована на экране (`bg-bgColor` мирового блока). */
export const DEFAULT_EXPAND_FILL: ExpandFill = '#ffffff';

/**
 * ЧЕТЫРЕ ПРИБАВКИ И ЗАЛИВКА — ЕДИНСТВЕННАЯ ИСТИНА О РАСШИРЕНИИ.
 *
 * ЯКОРЯ ЗДЕСЬ НЕТ НАРОЧНО, хотя орган в модалке им и управляется. Якорь — это СПОСОБ НАЗВАТЬ
 * прибавки («стало 1200 широкое, тянуть от центра» = по 100 слева и справа), а не пятое
 * независимое число: держи он поле рядом с четырьмя прибавками — и первая же ручная правка одной
 * стороны развела бы их, а какое из двух описаний применять, не знал бы никто. Якорь живёт в
 * `expandFromSize`/`expandFromFactor`, которые ПРОИЗВОДЯТ прибавки, и в состоянии модалки.
 */
export type ExpandSpec = {
  /** В тех же единицах, что и `from` у `planExpand`. Только неотрицательные. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  fill: ExpandFill;
};

/** Размер содержимого. Единица — любая, лишь бы одна и та же у `from` и у прибавок. */
export type Extent = { w: number; h: number };

const pad = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** Заливка, годная к употреблению: `#rrggbb` строчными или `null`. Мусор читается как прозрачно. */
export function readFill(raw: unknown): ExpandFill {
  if (raw === null || raw === undefined) return null;
  return readInk(raw) ?? null;
}

/** Спецификация с приведёнными прибавками. ЕДИНСТВЕННАЯ дверь к `ExpandSpec`. */
export function expandSpec(
  raw: Partial<ExpandSpec> & { fill?: ExpandFill },
): ExpandSpec {
  return {
    top: pad(raw.top ?? 0),
    right: pad(raw.right ?? 0),
    bottom: pad(raw.bottom ?? 0),
    left: pad(raw.left ?? 0),
    fill: raw.fill === undefined ? DEFAULT_EXPAND_FILL : readFill(raw.fill),
  };
}

/** Прибавок нет — расширение тождественно. Отдельным именем, потому что спрашивают часто. */
export const isNoExpand = (s: ExpandSpec): boolean =>
  s.top === 0 && s.right === 0 && s.bottom === 0 && s.left === 0;

/** Доли, в которых якорь делит прибавку между двумя противоположными краями. */
function anchorSplit(anchor: ExpandAnchor): { x: number; y: number } {
  // Доля, уходящая в ЛЕВО и в ВЕРХ. Якорь «top-left» держит верхний левый угол на месте, значит
  // всё новое поле уходит вправо и вниз, и слева/сверху не прибавляется ничего.
  const x = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : 0.5;
  const y = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5;
  return { x, y };
}

/**
 * «СТАЛО ВОТ ТАКИМ, ТЯНУТЬ ОТ ВОТ ЭТОГО УГЛА» — прямой порт Canvas Size.
 *
 * Уменьшение стороны даёт прибавку 0, а не отрицательную: см. довод про кроп в шапке.
 */
export function expandFromSize(
  from: Extent,
  to: Extent,
  anchor: ExpandAnchor,
  fill: ExpandFill = DEFAULT_EXPAND_FILL,
): ExpandSpec {
  const gx = Math.max(0, to.w - from.w);
  const gy = Math.max(0, to.h - from.h);
  const s = anchorSplit(anchor);
  const left = Math.round(gx * s.x);
  const top = Math.round(gy * s.y);
  return expandSpec({ left, right: gx - left, top, bottom: gy - top, fill });
}

/**
 * «РАЗДВИНУТЬ НА 20 % ОТ ЦЕНТРА» — одним вызовом, ровно как просил владелец.
 * `factor` — во сколько раз растёт сторона: 1.2 это +20 %.
 */
export function expandFromFactor(
  from: Extent,
  factor: number,
  anchor: ExpandAnchor = 'center',
  fill: ExpandFill = DEFAULT_EXPAND_FILL,
): ExpandSpec {
  const k = Number.isFinite(factor) && factor > 1 ? factor : 1;
  return expandFromSize(
    from,
    { w: Math.round(from.w * k), h: Math.round(from.h * k) },
    anchor,
    fill,
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПЛАН — ЧИСТАЯ АРИФМЕТИКА, БЕЗ КОТОРОЙ НИ ОДИН ПЕРЕСЧЁТ НЕ ИМЕЕТ ПРАВА СЛУЧИТЬСЯ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type ExpandPlan = {
  from: Extent;
  to: Extent;
  /** Смещение старого содержимого, в единицах `to`. */
  dx: number;
  dy: number;
  /** Новое соотношение сторон — то самое `ratio`, которым живёт документ слоя и плата. */
  ratio: number;
  /**
   * ЧЕТЫРЕ ЧИСЛА, КОТОРЫМИ ДЕЛАЕТСЯ ВЕСЬ ПЕРЕСЧЁТ, И ОНИ БЕЗРАЗМЕРНЫЕ.
   * Доля кадра: `x' = ox + x·kx`, `y' = oy + y·ky`. Ни пикселей, ни юнитов платы — поэтому один и
   * тот же план годится и штрихам (доли), и растру (пиксели), и не может их перепутать.
   */
  kx: number;
  ky: number;
  ox: number;
  oy: number;
};

/**
 * План расширения. Ноль прибавок даёт ТОЖДЕСТВЕННЫЙ план (`kx = ky = 1`, `ox = oy = 0`) — и это
 * проверяется пробой: «расширение на ноль не двигает ни одной координаты».
 */
export function planExpand(from: Extent, spec: ExpandSpec): ExpandPlan {
  const fw = Math.max(1, Math.round(from.w));
  const fh = Math.max(1, Math.round(from.h));
  const tw = fw + spec.left + spec.right;
  const th = fh + spec.top + spec.bottom;
  return {
    from: { w: fw, h: fh },
    to: { w: tw, h: th },
    dx: spec.left,
    dy: spec.top,
    ratio: tw / th,
    kx: fw / tw,
    ky: fh / th,
    ox: spec.left / tw,
    oy: spec.top / th,
  };
}

/** Точка в долях кадра — старая доля в новую. ОДНА функция; все остальные зовут её. */
export const mapPoint = (
  p: readonly [number, number],
  plan: ExpandPlan,
): [number, number] => [plan.ox + p[0] * plan.kx, plan.oy + p[1] * plan.ky];

/**
 * СЛОЖЕНИЕ ДВУХ ПЛАНОВ. Два расширения подряд обязаны дать то же, что одно суммарное, — иначе
 * «расширил, передумал, расширил ещё» уводило бы рисунок. Проба это меряет.
 *
 * Вывод в одну строку: `x_C = b.ox + b.kx·(a.ox + x_A·a.kx)`, откуда `ox' = b.ox + a.ox·b.kx` и
 * `kx' = a.kx·b.kx`. Смещения СКЛАДЫВАЮТСЯ без множителя: прибавки названы в пикселях, и один
 * пиксель промежуточного холста — это ровно один пиксель конечного (`b.kx·to.w === from.w`).
 */
export const chainPlans = (a: ExpandPlan, b: ExpandPlan): ExpandPlan => ({
  from: a.from,
  to: b.to,
  dx: a.dx + b.dx,
  dy: a.dy + b.dy,
  ratio: b.ratio,
  kx: a.kx * b.kx,
  ky: a.ky * b.ky,
  ox: b.ox + a.ox * b.kx,
  oy: b.oy + a.oy * b.ky,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// СТОРОЖ ПОЛЕЙ-КООРДИНАТ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ВСЕ КЛЮЧИ `VectorStroke`, ПЕРЕЧИСЛЕННЫЕ ПОИМЁННО, — И ЭТО НЕ ФОРМАЛЬНОСТЬ.
 *
 * Пересчёт обязан тронуть КАЖДОЕ поле, в котором есть координата или размер. Поле, о котором этот
 * файл не знает, переживёт расширение НЕТРОНУТЫМ, и если в нём была координата — рисунок уедет
 * относительно картинки МОЛЧА: ни исключения, ни следа, а откатить нечем, потому что ленты правок
 * у слоя нет по контракту.
 *
 * Сторожей два, и оба нужны:
 *
 *  • ТИПОВОЙ (`_strokeKeysCovered` ниже) ловит новое поле в момент его появления — `tsc --noEmit`
 *    падает с именем ключа прямо в тексте ошибки.
 *  • РАНТАЙМНЫЙ (`assertKnownStrokeKeys`) ловит его же у того, кто типовой гейт не прогонял. Это
 *    не паранойя: в этом репозитории типы НЕ ГЕЙТЯТ ДЕПЛОЙ — Vercel собирает голым `vite build`,
 *    CI нет, `tsc` запускается только руками. Типовой сторож здесь — записка тому, кто помнит;
 *    рантаймный — единственный, кто остановит молчаливый сдвиг у того, кто не помнит.
 */
const STROKE_KEYS = [
  // координаты
  'pts',
  'segs',
  // размеры в юнитах платы
  'gauge',
  'step',
  // не координаты — переносятся как есть
  'tool',
  'brush',
  'weight',
  'dashed',
  'ink',
] as const;

type ListedStrokeKey = (typeof STROKE_KEYS)[number];
type UnlistedStrokeKey = Exclude<keyof VectorStroke, ListedStrokeKey>;
type StrayStrokeKey = Exclude<ListedStrokeKey, keyof VectorStroke>;
/* Пока список полон, тип справа — `true`, и присваивание проходит. Появись у `VectorStroke` поле
   `foo` — тип станет `'foo'`, и `tsc` напечатает «Type 'boolean' is not assignable to type
   'foo'», то есть НАЗОВЁТ забытый ключ. Обратная проверка ловит ключ, оставшийся в списке после
   того, как поле из типа убрали. */
const _strokeKeysCovered: [UnlistedStrokeKey] extends [never] ? true : UnlistedStrokeKey = true;
const _strokeKeysExist: [StrayStrokeKey] extends [never] ? true : StrayStrokeKey = true;
void _strokeKeysCovered;
void _strokeKeysExist;

const STROKE_KEY_SET: ReadonlySet<string> = new Set<string>(STROKE_KEYS);

const AREA_KEYS = ['pts', 'feather'] as const;
type ListedAreaKey = (typeof AREA_KEYS)[number];
type UnlistedAreaKey = Exclude<keyof SelectionArea, ListedAreaKey>;
type StrayAreaKey = Exclude<ListedAreaKey, keyof SelectionArea>;
const _areaKeysCovered: [UnlistedAreaKey] extends [never] ? true : UnlistedAreaKey = true;
const _areaKeysExist: [StrayAreaKey] extends [never] ? true : StrayAreaKey = true;
void _areaKeysCovered;
void _areaKeysExist;

const AREA_KEY_SET: ReadonlySet<string> = new Set<string>(AREA_KEYS);

/**
 * Отказ пересчёта. ОТДЕЛЬНЫМ КЛАССОМ, чтобы модалка могла отличить «формат уехал вперёд» от любой
 * другой поломки и сказать это словами, а не молча сохранить сдвинутый рисунок.
 */
export class ExpandGuardError extends Error {
  constructor(readonly unknownKeys: string[], where: 'stroke' | 'area') {
    super(
      `the canvas cannot be expanded: this ${where} carries ${
        unknownKeys.length === 1 ? 'a field' : 'fields'
      } this build does not know how to move — ${unknownKeys.join(
        ', ',
      )}. Expanding would leave ${
        unknownKeys.length === 1 ? 'it' : 'them'
      } behind and the drawing would silently slide against the picture. Update the editor, or expand before drawing.`,
    );
    this.name = 'ExpandGuardError';
  }
}

function assertKnownStrokeKeys(s: VectorStroke): void {
  const stray = Object.keys(s).filter((k) => !STROKE_KEY_SET.has(k));
  if (stray.length) throw new ExpandGuardError(stray, 'stroke');
}

function assertKnownAreaKeys(a: SelectionArea): void {
  const stray = Object.keys(a).filter((k) => !AREA_KEY_SET.has(k));
  if (stray.length) throw new ExpandGuardError(stray, 'area');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПЕРЕСЧЁТ ШТРИХОВ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ЧТО ДЕЛАТЬ С ТОЛЩИНОЙ НИТИ ПРИ РАСШИРЕНИИ ПЛИТЫ.
 *
 * `compensate` — умножить `gauge`/`step`/`feather` на `kx`, чтобы линия осталась той же долей
 *   РИСУНКА, какой была. Это умолчание: человек, расширивший холст, просил больше поля вокруг, а
 *   не перерисованные линии.
 * `keep` — оставить числа как есть. Тогда линия остаётся той же долей ПЛАТЫ, а рисунок внутри
 *   платы сжимается, и линия становится ВИЗУАЛЬНО ТОЛЩЕ относительно рисунка ровно в `1/kx` раз.
 *
 * ⚠ НАПРАВЛЕНИЕ ЗДЕСЬ ОБРАТНОЕ ТОМУ, ЧТО КАЖЕТСЯ. `gauge` — доля ШИРИНЫ ПЛАТЫ (`strokeGeometry`:
 * `G = gauge / GAUGE_REF · scaleRef`, где `scaleRef` по умолчанию равен ширине коробки, то есть
 * `PLATE_W`). Плата при расширении НЕ РАСТЁТ — она всегда 1000 юнитов; сжимается рисунок. Поэтому
 * без компенсации линии не худеют, а ТОЛСТЕЮТ относительно рисунка.
 */
export type GaugePolicy = 'compensate' | 'keep';

/**
 * ПЕРЕСЧЁТ ОДНОГО ШТРИХА. Перечисляет ВСЕ поля поимённо — см. довод у `STROKE_KEYS`.
 *
 * ── ЧТО ИМЕННО ДЕЛАЕТ КОМПЕНСАЦИЯ И ПОЧЕМУ ОНА НЕСИММЕТРИЧНА ────────────────────────────────
 *
 *  `gauge` МАТЕРИАЛИЗУЕТСЯ, ЕСЛИ ЕГО НЕ БЫЛО. У штриха без поля действующая толщина берётся из
 *    таблицы `WEIGHT_GAUGE[weight]`, и умножить там нечего: слово `weight` толщину не несёт, оно
 *    на неё ССЫЛАЕТСЯ. Поэтому компенсация выписывает число явно. Цена названа: `emitsGauge`
 *    станет истинным, и документ, который был `v: 1`, уйдёт на провод как `v: 3`. Это честно —
 *    он действительно теперь несёт размер, которого раньше не нёс.
 *
 *  `weight` НЕ ПЕРЕСЧИТЫВАЕТСЯ. Он — запасная лестница для читателя, который про `gauge` не знает;
 *    перебить его через `gaugeWeight` значило бы соврать дважды (та таблица отвечает на вопрос «на
 *    какой чип нажала рука», а сюда рука не нажимала) и заодно сдвинуть у такого читателя ещё и
 *    длину стежка. Пусть старый читатель видит прежнюю толщину, а не чужую.
 *
 *  `step` НЕ МАТЕРИАЛИЗУЕТСЯ НИКОГДА. Его отсутствие — не «не задано», а рабочее состояние «стежок
 *    СЛЕДУЕТ за нитью» (`strokeStep` тождественно равен `strokeGauge`, см. довод у `hasOwnStep`).
 *    Выписать его здесь значило бы РАЗВЯЗАТЬ пришпиленный стежок за спиной у человека: следующая
 *    правка толщины перестала бы его тянуть. А следовать за нитью он и так продолжит — нить уже
 *    скомпенсирована, значит и стежок скомпенсирован вместе с ней, бесплатно и точно.
 */
export function expandStroke(
  s: VectorStroke,
  plan: ExpandPlan,
  policy: GaugePolicy = 'compensate',
): VectorStroke {
  assertKnownStrokeKeys(s);
  const { kx, ky, ox, oy } = plan;

  const out: VectorStroke = {
    // — не координаты, переносятся как есть —
    tool: s.tool,
    brush: s.brush,
    weight: s.weight,
    dashed: s.dashed,
    // — координаты: якоря —
    pts: s.pts.map((p) => [ox + p[0] * kx, oy + p[1] * ky] as [number, number]),
  };

  // — координаты: контрольные точки кубиков. `null` — прямой интервал, двигать нечего.
  if (s.segs !== undefined) {
    out.segs = s.segs.map((c) =>
      c
        ? ([ox + c[0] * kx, oy + c[1] * ky, ox + c[2] * kx, oy + c[3] * ky] as CubicSeg)
        : null,
    );
  }

  // — не координата —
  if (s.ink !== undefined) out.ink = s.ink;

  // — размеры в юнитах платы —
  if (policy === 'keep') {
    if (s.gauge !== undefined) out.gauge = s.gauge;
    if (s.step !== undefined) out.step = s.step;
    return out;
  }
  const live = typeof s.gauge === 'number' && Number.isFinite(s.gauge)
    ? s.gauge
    : (WEIGHT_GAUGE[s.weight] ?? WEIGHT_GAUGE.thin);
  out.gauge = roundGauge(live * kx);
  // Стежок трогается ТОЛЬКО у того, кто назвал его своим. См. довод в шапке функции.
  if (typeof s.step === 'number' && Number.isFinite(s.step)) out.step = roundStep(s.step * kx);
  return out;
}

/** Все штрихи. Бросает `ExpandGuardError` на первом же штрихе с незнакомым полем. */
export function expandStrokes(
  strokes: readonly VectorStroke[],
  plan: ExpandPlan,
  policy: GaugePolicy = 'compensate',
): VectorStroke[] {
  return strokes.map((s) => expandStroke(s, plan, policy));
}

/**
 * ОБЛАСТЬ ВЫДЕЛЕНИЯ. `feather` — та же величина в юнитах платы, что и `gauge`, и обращаться с ней
 * иначе значило бы, что после расширения мягкость края разъехалась с толщиной линии, хотя человек
 * задавал их в одной шкале и в одном экране.
 */
export function expandArea(
  a: SelectionArea,
  plan: ExpandPlan,
  policy: GaugePolicy = 'compensate',
): SelectionArea {
  assertKnownAreaKeys(a);
  const { kx, ky, ox, oy } = plan;
  return {
    pts: a.pts.map((p) => [ox + p[0] * kx, oy + p[1] * ky] as [number, number]),
    feather: policy === 'compensate' ? a.feather * kx : a.feather,
  };
}

export function expandAreas(
  areas: readonly SelectionArea[],
  plan: ExpandPlan,
  policy: GaugePolicy = 'compensate',
): SelectionArea[] {
  return areas.map((a) => expandArea(a, plan, policy));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// РАСТР
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Размер нового растра. `cap` — потолок ширины; передавать `RASTER_MAX_W` из `rasterise-layer`.
 * Параметром, а не импортом: копия потолка в этом файле стала бы вторым числом, которое разъедется
 * с первым, а тащить сюда сам модуль значит тащить и его сетевой слой.
 *
 * Плотность пикселей СОХРАНЯЕТСЯ (`from.w / kx`), пока помещается в потолок; упершись в потолок,
 * старое содержимое честно пересэмплится вниз — расширять до бесконечности, копя пиксели, нельзя.
 */
export function expandedRasterSize(from: Extent, plan: ExpandPlan, cap: number): Extent {
  const want = Math.round(from.w / plan.kx);
  const w = Math.max(1, Math.min(Math.round(cap), want));
  const h = Math.max(1, Math.round(w / plan.ratio));
  return { w, h };
}

/**
 * НОВЫЙ ХОЛСТ: поле залито (или оставлено прозрачным), старые пиксели — на своё место по плану.
 *
 * Заливка кладётся ПЕРВОЙ и на весь холст, а не четырьмя полосами по краям: полосами пришлось бы
 * считать четыре прямоугольника, и округление каждого из них давало бы шов в один пиксель на
 * границе со старым содержимым. Старые пиксели ложатся поверх и закрывают залитое ровно там, где
 * они есть; там, где в них дырка от ластика, сквозь неё видно заливку — а это ровно то, что
 * «выбрать цвет фона» и значит.
 */
export function expandCanvas(
  src: CanvasImageSource,
  srcSize: Extent,
  plan: ExpandPlan,
  fill: ExpandFill,
  out: Extent,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(out.w));
  canvas.height = Math.max(1, Math.round(out.h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('this browser refused a drawing canvas');
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(
    src,
    0,
    0,
    Math.max(1, Math.round(srcSize.w)),
    Math.max(1, Math.round(srcSize.h)),
    plan.ox * canvas.width,
    plan.oy * canvas.height,
    plan.kx * canvas.width,
    plan.ky * canvas.height,
  );
  return canvas;
}

/**
 * ПИКСЕЛЬНЫЙ КАНАЛ СЛОЯ ЦЕЛИКОМ — новый `RasterLayer` в новом размере.
 *
 * ⚠ ЛЕНТА ОТМЕНЫ РАСТРА ПОСЛЕ ЭТОГО НЕДЕЙСТВИТЕЛЬНА, и снять её обязан вызывающий. Шаги ленты —
 * это прямоугольники в ПИКСЕЛЯХ СТАРОГО ХОЛСТА (см. `RasterLayer.bounds` и `EditTimeline`);
 * применённые к новому, они вернули бы кусок картинки не на своё место. Здесь лента не трогается
 * не из вежливости, а потому что она не принадлежит этому модулю: у модалки одна лента на линии и
 * пиксели сразу, и решение «что с ней стало» — её.
 *
 * `bounds` обнуляется: коробка незавершённого жеста в старых пикселях бессмысленна.
 */
export function expandRasterLayer(
  layer: RasterLayer,
  plan: ExpandPlan,
  fill: ExpandFill,
  cap: number,
): RasterLayer {
  const box = expandedRasterSize({ w: layer.w, h: layer.h }, plan, cap);
  const doc = expandCanvas(layer.doc, { w: layer.w, h: layer.h }, plan, fill, box);
  const blank = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  return {
    doc,
    scratch: blank(box.w, box.h),
    stage: blank(box.w, box.h),
    w: box.w,
    h: box.h,
    bounds: null,
  };
}
