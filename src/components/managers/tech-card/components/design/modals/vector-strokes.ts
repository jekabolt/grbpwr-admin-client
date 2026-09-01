import {
  inkPath,
  simplifyPath,
  simplifyToLimit,
  type ShapePoint,
} from 'ui/components/annotation/geometry';

/**
 * THE VECTOR LAYER'S OWN FORMAT — the only reader and the only writer of `DesignEditLayer.strokes`.
 *
 * The wire calls it «the client's own canvas format» and stores it as an opaque JSON string, so
 * this module IS the contract. Which puts two obligations on it that a server-defined message
 * would carry for free:
 *
 *  1. IT IS VERSIONED, AND AN UNREADABLE VERSION REFUSES TO BE OVERWRITTEN. A bundle that cannot
 *     understand what is stored must not «start clean» and save — that silently destroys somebody
 *     else's drawing under the same layer id. `readLayer` says so in a field and the editor turns
 *     its writers off; see `LayerDoc.unreadable`.
 *  2. IT NEVER THROWS. There is no error boundary over the tech-card tabs — one exception takes the
 *     whole screen white — so every parse failure comes back as an empty, flagged document.
 *
 * GEOMETRY IS BORROWED, NOT REBUILT. Smoothing (`inkPath`), thinning (`simplifyPath`,
 * `simplifyToLimit`) and hit-testing all come from `ui/components/annotation/geometry` — the one
 * geometry engine this repository has. What lives here instead is the part that engine has no
 * opinion about: WHAT A MACHINE STITCH LOOKS LIKE. A dash rhythm per stitch class and a doubled
 * line for a two-needle machine are presentation of an industrial fact, not arithmetic about
 * points, and nothing else in the repo draws them.
 *
 * COORDINATES ARE NORMALISED 0..1 OF THE FRAME, at four decimals — the same discipline the split
 * modal and the annotation layer already keep. Normalised because the raster underneath is a
 * TRACING SHEET whose bytes may be replaced: a stroke pinned in pixels would slide off the seam it
 * was drawn on the first time somebody re-uploads the flat at another size. Four decimals because a
 * raw float round-trips as `0.30000000000000004`, and a value small enough to acquire an exponent
 * costs real CPU downstream — the annotation layer has been bitten by exactly that.
 *
 * CURVES ARE CUBIC SEGMENTS BETWEEN THE SAME ANCHORS, AND THE POLYLINE IS THE CASE WHERE THERE ARE
 * NONE. `pts` never changed meaning: it is still the list of anchors in drawing order. What was
 * added is an OPTIONAL parallel array `segs`, one entry per interval `pts[i] → pts[i+1]`, holding
 * that interval's two Bézier control points — or `null` for a straight run. A stroke without `segs`
 * is byte-for-byte the stroke this format has always stored and takes literally the same code path
 * (`inkPath`), which is what makes «old layers read without a migration» a property of the code
 * rather than a promise.
 *
 * The reason the model had to grow is the owner's, verbatim: a vector model returns `d` with `C`,
 * `Q` and `A` segments, and a stroke format that can only hold points has exactly two ways to accept
 * such a file — refuse to edit it, or chop its curves into the «heap of polygons» the requirement
 * forbids. Neither is acceptable, so the third option was built.
 *
 * THE DOCUMENT VERSION RISES ONLY WHEN A CURVE IS ACTUALLY PRESENT (`v: 2`), and that is deliberate.
 * `readLayer` refuses to let an unknown version be overwritten, so a curve document is protected
 * from an older tab that would silently flatten it — while a drawing that holds nothing but
 * polylines still goes out as `v: 1` and stays readable everywhere it has always been readable.
 *
 * ─── ЧТО ДОБАВИЛА ВТОРАЯ ПОЛОВИНА V-9: ЦВЕТ И РАЗМЕР (`v: 3`) ────────────────────────────────
 *
 * Владелец просил кисть «которую можно гибко настраивать в том числе цвет» и шов, у которого есть
 * «более гибкая настройка размера». Ни того ни другого формат не держал: цвета в нём не было ВОВСЕ
 * (чёрное зашито в четырёх местах), а размер существовал ровно в трёх ступенях `weight`. Оба
 * поля — НЕОБЯЗАТЕЛЬНЫЕ, и их отсутствие означает ровно то, чем штрих был вчера.
 *
 *  - `ink` — цвет, `#rrggbb`. Нет поля — чёрный.
 *  - `gauge` — РАЗМЕР ШВА одним числом, в пикселях платы (мир шириной 1000). Он же толщина нити,
 *    он же масштаб фигуры стежка: длина волны зигзага, зазор между рядами двухигольного, шаг
 *    гребёнки оверлока и длина стежка челночной строчки — все они теперь КРАТНЫ этому числу, а не
 *    доли коробки, как были. Одна ручка, потому что на чертеже шов — один предмет: тяжёлая
 *    отделочная строчка это и толстая нить, И длинный стежок, а «тонкая нить с гигантским
 *    зигзагом» — не шов, а ошибка настройки, ради которой не стоит заводить второй орган.
 *    Калибровка выбрана так, что `thin` (6) воспроизводит прежние константы ЧИСЛО В ЧИСЛО.
 *
 * `weight` НЕ СНЯТ И ПИШЕТСЯ ВСЕГДА — это старое написание того же числа. Читатель строго
 * приоритетен: есть `gauge` — правит он, нет — три ступени. И `gauge` УХОДИТ НА ПРОВОД ТОЛЬКО
 * КОГДА ОТЛИЧАЕТСЯ ОТ СВОЕЙ СТУПЕНИ, поэтому рисунок, сделанный тремя пресетами и чёрным, остаётся
 * байт в байт документом `v: 1`/`v: 2` — версия поднимается лишь тогда, когда в ней ДЕЙСТВИТЕЛЬНО
 * лежит то, чего старая вкладка не поймёт, тем же доводом, что и у кривых.
 *
 * ─── X-8: ОДНА РУЧКА РАЗЪЕХАЛАСЬ НА ДВЕ — НИТЬ И СТЕЖОК (`v: 4`) ─────────────────────────────
 *
 * Довод «одна ручка, потому что на чертеже шов — один предмет» выше ПЕРЕЖИЛ СВОЮ ПРИЧИНУ и снят
 * прямым ответом владельца на прямой вопрос: **«Разделить на два»**. Он прав, а прежний абзац был
 * рассуждением вместо замера: «тонкая нить длинным стежком» — не ошибка настройки, а обычная
 * отделочная строчка тонкой нитью, и на настоящей машине длина стежка и номер нити стоят на разных
 * органах, потому что они физически независимы. `gauge` держал оба сразу, и половина комбинаций,
 * которые машина умеет, была НЕВЫРАЗИМА.
 *
 * ШОВ РАСПАЛСЯ РОВНО ПО ТОМУ ШВУ, ПО КОТОРОМУ ЕГО ОПИСЫВАЛ СТАРЫЙ АБЗАЦ — «он же толщина нити, он
 * же масштаб фигуры стежка»:
 *
 *  - `gauge` — ТОЛЩИНА НИТИ и только она: ширина линии, которой рисуется шов. Имя не менялось,
 *    смысл сузился до половины прежнего, и эта половина у всех сохранённых слоёв та же самая.
 *  - `step` — ДЛИНА СТЕЖКА, шаг между проколами, в тех же пикселях платы. Из неё считается всё, что
 *    лежит ВДОЛЬ линии: период челночной строчки, длина волны зигзага, шаг гребёнки оверлока,
 *    период потайного и ритм построительного пунктира.
 *
 * ─── Y-5: У ФИГУРЫ ДВЕ ОСИ, И ВТОРАЯ ПРИНАДЛЕЖИТ НИТИ ────────────────────────────────────────
 *
 * Абзац выше кончался утверждением «фигура едет ЦЕЛИКОМ, вместе с поперечными размерами», и это
 * утверждение СНЯТО жалобой владельца: «STITCH long увеличивает не только длину, но и ширину, и
 * этим пользоваться невозможно». Он прав, и цифра подтверждает: при неподвижной нити и стежке,
 * прогнанном от края до края, поперечный габарит шва рос в 12.8–23.1 раза — то есть орган длины
 * работал ещё и вторым, никак не подписанным органом ширины.
 *
 * Довод, которым это держалось («посади амплитуду на нить — и зигзаг тонкой нитью схлопнется в
 * прямую»), был рассуждением вместо замера и НЕ ВЕРЕН: амплитуда — множитель нити, а не число
 * юнитов, поэтому размах зигзага при любой нити остаётся теми же 4.6 её ширины. Шов не
 * схлопывается — он подобен себе, ровно как настоящий шов, прошитый тонкой нитью.
 *
 * Поэтому граница проходит НЕ МЕЖДУ ВИДАМИ ШВА, А ПО ОСИ:
 *  - ВДОЛЬ линии (период, шаг прокола, длина пролёта, ритм пунктира) — считает `step`;
 *  - ПОПЕРЁК линии (амплитуда волны, зазор между рядами, вылет зубца гребёнки) — считает `gauge`,
 *    потому что поперечный размер шва это размер МАШИНЫ: расстановка игл на игольнице и размах
 *    игловодителя не меняются от того, что технолог удлинил стежок.
 *
 * У СОХРАНЁННЫХ СЛОЁВ ЭТО НЕ ДВИГАЕТ НИ ОДНОЙ ТОЧКИ, и не по доброте, а по тождеству: у штриха без
 * `step` `strokeStep === strokeGauge`, значит `amp * gauge` и `amp * step` — одно и то же число.
 * Иначе рисуются ровно те штрихи, у которых стежок РАЗВЕДЁН с нитью, то есть ровно те, на которые
 * жалоба.
 *
 * ОЧЕРЁДНОСТЬ ЧТЕНИЯ — ЛЕСТНИЦА В ТРИ СТУПЕНИ, И У КАЖДОЙ ВЕЛИЧИНЫ РОВНО ОДИН ЧИТАТЕЛЬ.
 * Толщину читает `strokeGauge`: `gauge` → ступень `weight`. Длину стежка читает `strokeStep`:
 * `step` → и, если его нет, ЧЕРЕЗ `strokeGauge` — то есть `gauge` → ступень. Второго читателя
 * `gauge` в файле нет и заводить его нельзя: `strokeStep` спрашивает старое поле не сам, а рукой
 * `strokeGauge`, поэтому «два написания одной величины» не могут разъехаться.
 *
 * ОТСУТСТВИЕ `step` ОЗНАЧАЕТ «СТЕЖОК РАВЕН НИТИ» — то есть ровно прежнее поведение, когда обе
 * величины были одним числом. Поэтому старый слой рисуется НЕ ПОХОЖЕ, а ТЕМ ЖЕ `d`: каждая
 * константа фигуры умножается на `strokeStep`, который у такого слоя тождественно равен прежнему
 * `G`.
 *
 * И `step` уходит на провод ТОЧНО ТОГДА, КОГДА ОН НАЗВАН, — не когда он отличается числом. Это
 * НЕ тот приём, которым `gauge` умалчивается о своей ступени, и разница принципиальная: слово
 * `weight` рядом позволяет вывести умолчанную толщину обратно, а «пришпилен ли стежок» не выводится
 * ниоткуда. Стежок 4 при нити 4 — своё, названное состояние: он не поедет за следующим движением
 * толщины. Сравнение чисел его стирало, поэтому признак — наличие поля (`hasOwnStep`), и решает
 * его тот, кто штрих рождает.
 *
 * Документ, у которого нить и стежок связаны, по-прежнему остаётся байт в байт тем, чем был,
 * вплоть до номера версии: у такого штриха поля просто нет. `v: 4` поднимается над документом, в
 * котором стежок НАЗВАН СВОИМ: старая вкладка прочла бы такой слой и молча свела бы стежок к
 * толщине нити — длинная отделочная строчка стала бы мелкой, а пришпиленная исчезла бы как
 * пришпиленная, и это та же молча потерянная работа, что выпрямленная кривая и перекрашенный в
 * чёрный цвет.
 */

/** The nine machine kinds, with the ISO 4915 stitch class where one exists. */
export const STITCHES = [
  { key: 'plain', name: 'plain line', iso: 'no stitch' },
  { key: 'lock', name: 'straight lockstitch', iso: '301' },
  { key: 'double', name: 'double needle', iso: '401 ×2' },
  { key: 'zigzag', name: 'zigzag', iso: '304' },
  { key: 'cover', name: 'coverstitch', iso: '406' },
  { key: 'flatlock', name: '5-thread flatlock', iso: '516' },
  { key: 'overlock', name: 'overlock 3-thread', iso: '504' },
  { key: 'blind', name: 'blind hem', iso: '103' },
  { key: 'bartack', name: 'bartack', iso: '—' },
] as const;

export type StitchKey = (typeof STITCHES)[number]['key'];
export type StrokeWeight = 'hairline' | 'thin' | 'bold';

const STITCH_KEYS = STITCHES.map((s) => s.key) as readonly string[];
const WEIGHTS: readonly string[] = ['hairline', 'thin', 'bold'];
type Tool = VectorStroke['tool'];
const TOOLS: readonly string[] = ['line', 'freehand', 'curve'];

export function stitchName(key: string): string {
  return STITCHES.find((s) => s.key === key)?.name ?? key;
}

/**
 * One interval's two cubic control points: `[c1x, c1y, c2x, c2y]`, normalised like the anchors.
 *
 * A CUBIC AND NOT A QUADRATIC, even though the annotation layer's arcs are quadratic. Every curve an
 * SVG can state — `C`, `S`, `Q`, `T` and `A` — converts into cubics exactly or by the one accepted
 * construction, and the reverse is false: a cubic is not expressible as a quadratic. One arm too few
 * and the importer would have to approximate what arrives, which is the thing this whole task
 * exists to avoid.
 */
export type CubicSeg = [number, number, number, number];

export type VectorStroke = {
  /**
   * How it was drawn. Kept because a two-point line is editable as a line and a trace is not.
   * `curve` is the third answer: neither drawn by hand here nor a straight run — it came in from a
   * vector file with its curvature stated, and its anchors are somebody else's, not a sampling of
   * this editor's pointer.
   */
  tool: 'line' | 'freehand' | 'curve';
  brush: StitchKey;
  weight: StrokeWeight;
  /**
   * A CONSTRUCTION LINE rather than a seam — the one property that outranks the stitch's own
   * rhythm, because «this is not sewn» has to be visible whatever machine the line names.
   */
  dashed: boolean;
  /** Normalised 0..1 of the frame, in drawing order. */
  pts: [number, number][];
  /**
   * OPTIONAL, AND ITS ABSENCE IS THE WHOLE BACKWARD COMPATIBILITY STORY. When absent the stroke is
   * exactly what it always was: anchors, drawn through `inkPath`. When present it has EXACTLY
   * `pts.length - 1` entries — one per interval — and entry `i` carries the control points of the
   * cubic from `pts[i]` to `pts[i+1]`, or `null` when that interval is a straight line.
   *
   * AN ALL-`null` ARRAY IS NOT THE SAME AS NO ARRAY, and conflating the two would move lines. With
   * no array `inkPath` smooths the anchors with Catmull-Rom; with an array of nulls the intervals
   * are drawn dead straight, which is what an imported `L`-only path actually says. So the array is
   * kept whenever it is well formed, empty of curves or not.
   */
  segs?: (CubicSeg | null)[];
  /**
   * ЦВЕТ НИТИ, `#rrggbb` строчными. Отсутствие — чёрный, то есть ровно то, чем был всякий штрих до
   * появления поля; поэтому чёрный рисунок не несёт ключа вовсе и остаётся прежними байтами.
   */
  ink?: string;
  /**
   * ТОЛЩИНА НИТИ в пикселях платы (мир шириной 1000) — ширина линии, и ничего больше.
   * Отсутствие — значение ступени `weight`. До X-8 это поле держало ещё и масштаб фигуры стежка;
   * теперь фигуру держит `step`, а у слоя, где `step` не назван, она по-прежнему считается отсюда.
   */
  gauge?: number;
  /**
   * ДЛИНА СТЕЖКА — шаг между проколами, в тех же пикселях платы, что и `gauge`.
   *
   * ОТСУТСТВИЕ ЗНАЧИТ «РАВНА ТОЛЩИНЕ НИТИ», то есть ровно то, чем шов был, пока ручка была одна.
   * Поэтому поле необязательное не из вежливости к формату, а потому что его отсутствие — это
   * осмысленное состояние «нить и стежок связаны», в котором нарисован каждый уже сохранённый слой.
   */
  step?: number;
};

/** Чёрный — цвет штриха, у которого цвет не назван. */
export const DEFAULT_INK = '#000000';

/**
 * Цвет с провода или из органа. `#rgb` разворачивается, регистр приводится; всё остальное — не
 * цвет, и вызывающий получает `undefined`, то есть «чёрный», а не молча покрашенный чем попало.
 */
export function readInk(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return undefined;
}

/**
 * ТРИ СТУПЕНИ `weight` — ЭТО ТАБЛИЦА РАСШИФРОВКИ ФОРМАТА, А НЕ РЯД КНОПОК, И ОНА ЗАМОРОЖЕНА.
 *
 * Числа не выбраны заново: это ровно прежняя таблица долей коробки (0.003 / 0.006 / 0.01),
 * умноженная на ширину платы, поэтому штрих без `gauge` рисуется тем же весом, что вчера.
 *
 * ПОЧЕМУ ЕЁ НЕЛЬЗЯ ОПУСТИТЬ ВМЕСТЕ С ПРЕСЕТАМИ (Y-1). У слова `weight` два читателя, а не один:
 * `strokeGauge` берёт отсюда ТОЛЩИНУ старого штриха, а `strokeStep` — через него же — его ДЛИНУ
 * СТЕЖКА, потому что у слоя без `step` эти две величины тождественны. Сдвинь таблицу вниз втрое —
 * и у каждого уже сохранённого штриха втрое сожмётся не линия, а ВСЯ ФИГУРА ШВА: зигзаг с длиной
 * волны 30 юнитов стал бы зигзагом в 10, то есть нечитаемой рябью. Тонким должен стать НОВЫЙ штрих
 * (`DEFAULT_GAUGE` и `GAUGE_PRESETS` ниже), а не переписан задним числом старый.
 */
export const WEIGHT_GAUGE: Record<StrokeWeight, number> = {
  hairline: 3,
  thin: 6,
  bold: 10,
};

/** Мир, в пикселях которого названы `gauge` и `step`, — та же плата шириной 1000, что у лассо. */
export const GAUGE_REF = 1000;

/**
 * ГРАНИЦЫ ТОЛЩИНЫ НИТИ, КОТОРЫЕ ВИДИТ ЧЕЛОВЕК: концы регулятора и потолок вводимого числа (Y-1).
 *
 * Потолок снят с 60 до 20 прямым ответом владельца — «все браши слишком жирные, сделать тоньше
 * весь диапазон». 60 пикселей платы это 6% ширины чертежа: не линия, а полоса, и промахнуться мимо
 * «жирно» было почти нечем — весь рабочий тонкий конец жил в первой шестой регулятора. Нижний
 * конец оставлен на 1, и это не отказ его опускать: `clampGauge` квантует человеческий ввод
 * ЦЕЛЫМИ, так что дробный пол был бы недостижим ни полем, ни чипом. Доступнее тонкий
 * конец стал не полом, а ЗНАМЕНАТЕЛЕМ — 1 из 20 вместо 1 из 60 — и втрое более тонкой ступенью
 * `hairline`.
 *
 * ЭТО НЕ ОТСЕЧКА ХРАНИМОГО ЧИСЛА. Отсечка формата — `SIZE_FLOOR`/`SIZE_CEIL` ниже, и она нарочно
 * шире: см. довод там.
 */
export const MIN_GAUGE = 1;
export const MAX_GAUGE = 20;

/**
 * ГРАНИЦЫ ДЛИНЫ СТЕЖКА — ТЕПЕРЬ СВОИ ЧИСЛА, А НЕ ПСЕВДОНИМЫ gauge-КОНСТАНТ.
 *
 * Прежний довод («те же, что у толщины, иначе тождество между величинами с разными отсечками — не
 * тождество») ПЕРЕЖИЛ СВОЮ ПРИЧИНУ. Тождество держит не общая отсечка, а устройство `strokeStep`:
 * у штриха без `step` он возвращает результат `strokeGauge` НЕ ПРОПУСКАЯ его через `roundStep`,
 * поэтому какие бы концы ни стояли у длины стежка, связанный штрих рисуется своим `gauge` в точности.
 *
 * А цена псевдонимов оказалась настоящей: опусти потолок толщины — и молча уехал бы вниз потолок
 * ДЛИНЫ СТЕЖКА, на которую владелец не жаловался и которая ему нужна ДЛИННОЙ. Числа здесь ровно те,
 * что действовали до Y-1, чтобы регулятор стежка не сдвинулся ни на юнит.
 */
export const MIN_STEP = 1;
export const MAX_STEP = 60;

/**
 * ОТСЕЧКИ ФОРМАТА — НЕ КОНЦЫ РЕГУЛЯТОРА, И ЭТО РАЗНЫЕ ПРЕДМЕТЫ (Y-1).
 *
 * `roundGauge`/`roundStep` стоят НА ПУТИ ЧТЕНИЯ (`readStroke`, `strokeGauge`) и на пути записи
 * (`writeLayer`). Пока они зажимали в `MIN_GAUGE..MAX_GAUGE`, всякое сужение видимого диапазона
 * УНИЧТОЖАЛО ЧУЖИЕ ЧИСЛА: слой, сохранённый с `gauge: 40`, читался как 20 и следующим же
 * сохранением уходил на провод двадцаткой — не «нарисовался иначе», а перезаписан, без единого
 * следа и без истории правок, из которой это достать.
 *
 * Поэтому у величины две отсечки, и УЗКАЯ ЖИВЁТ РОВНО В ОДНОМ МЕСТЕ — `clampGauge`/`clampStep`
 * ниже. Это правило, а не наблюдение: всякий орган, за которым стоит рука (числовое поле, чип
 * пресета, сборка «краски в руке»), обязан звать их, и никто больше не имеет права загонять число
 * в видимый диапазон. Повторённый по месту `Math.min/Math.max` — это ЧЕТВЁРТАЯ копия границ,
 * которая молча разойдётся с тремя остальными на первом же сужении диапазона; ровно так `Y-1`
 * и уронил `DEFAULT_STEP` мимо `DEFAULT_GAUGE`.
 *
 * Хранимое число проходит только ЭТУ, широкую: она не имеет мнения о том, какая толщина уместна,
 * и защищает ровно от того, от чего обязана, — от величины, которая печатается с показателем
 * степени и стоит реального CPU ниже по течению (та же беда, что у координат). NaN сюда не
 * доходит вовсе: каждый вызывающий спрашивает `Number.isFinite` раньше.
 * Потолок 60 — это потолок, действовавший, когда писались уже сохранённые документы: всё, что мог
 * записать прежний бандл, проходит здесь НЕТРОНУТЫМ.
 */
const SIZE_FLOOR = 0.1;
const SIZE_CEIL = 60;
// Имена без слова gauge нарочно: отсечка ОДНА НА ОБЕ величины, потому что у них одна единица
// (пиксель платы) и одна история — 60 был потолком того бандла, который записал всё, что сейчас
// лежит в базе. Это не «зажим толщины, заодно применённый к стежку», а конверт хранимого размера.

/** Размер к записи: десятые доли пикселя платы. Дальше — цифры, которых не видно ни на одном зуме. */
export const roundGauge = (n: number) =>
  Math.round(Math.min(SIZE_CEIL, Math.max(SIZE_FLOOR, n)) * 10) / 10;

/** Та же квантизация и та же широкая отсечка для длины стежка — см. довод у `SIZE_FLOOR`. */
export const roundStep = (n: number) =>
  Math.round(Math.min(SIZE_CEIL, Math.max(SIZE_FLOOR, n)) * 10) / 10;

/**
 * ЧЕМ РИСУЕТ РЕДАКТОР, ПОКА ЧЕЛОВЕК НИЧЕГО НЕ ВЫБРАЛ.
 *
 * Нить — 2 пикселя платы: 0.2% ширины чертежа, тонкая техническая линия. Прежним значением по
 * умолчанию была ступень `thin` (6), и ровно она и есть та «жирная кисть», на которую жалуется
 * владелец: каждый штрих, нарисованный не глядя, выходил втрое толще нужного.
 */
export const DEFAULT_GAUGE = 2;

/**
 * ДЛИНА СТЕЖКА ПРИ ВХОДЕ — ТА ЖЕ ДВОЙКА, И ЭТО НЕ ВКУС, А ТОЖДЕСТВО ФОРМАТА.
 *
 * Прежде здесь стояла шестёрка с доводом «историческая калибровка фигуры», и довод был НЕВЕРЕН
 * дважды. Во-первых, он описывал не то число: калибровку держит `WEIGHT_GAUGE.thin` — её читает
 * `strokeStep` у слоя без поля `step`, — а не умолчание руки, которое до сохранённых слоёв не
 * доходит вовсе. Во-вторых, шестёрка НЕ БЫЛА тем, чем шьют: рука входит в редактор состоянием
 * «стежок следует за нитью» (в документ поле не пишется), а у такого штриха `strokeStep`
 * ТОЖДЕСТВЕННО равен `strokeGauge`. То есть рейка показывала 6, призрак под курсором и уложенный
 * штрих шились двойкой, и три числа расходились в одну секунду — замерено: `strokeStep` свежего
 * штриха = 2 при надписи «6».
 *
 * Поэтому у длины стежка НЕТ и не может быть своего умолчания: пока стежок связан, действующее
 * значение выводится из нити, и всякое второе число здесь — ложь на экране. Константа оставлена
 * именем (у органа в модалке должно быть с чего стартовать), но НЕ СВОИМ ЧИСЛОМ: она определена
 * через `DEFAULT_GAUGE`, и разъехаться им больше нечем.
 *
 * Число, которое человек ВЫБИРАЕТ, когда хочет обычный шов, — это средняя ступень регулятора,
 * `STEP_NORMAL` ниже. Там ему и место: это вкус, а не умолчание.
 */
export const DEFAULT_STEP = DEFAULT_GAUGE;

/**
 * ЗАЖИМ ЧЕЛОВЕЧЕСКОГО ВВОДА — вторая, узкая отсечка, и ЕДИНСТВЕННАЯ ЕЁ КОПИЯ. Прочитанное с
 * провода сюда не попадает никогда — см. довод у `SIZE_FLOOR` о том, чем это кончается.
 *
 * ТРИ ДЕЙСТВИЯ, А НЕ ОДНО, И ВСЕ ТРИ ОБЯЗАНЫ ЖИТЬ ВМЕСТЕ:
 *  1. НЕ ЧИСЛО — БЕРЁМ УМОЛЧАНИЕ. Пустое поле и наполовину набранное «-» дают `NaN`, и `Math.max`
 *     пропускает его насквозь (`Math.max(1, NaN) === NaN`): без этой ветки «стереть содержимое
 *     поля» уносило бы толщину в `NaN` и штрих переставал бы рисоваться вовсе.
 *  2. КВАНТУЕМ ЦЕЛЫМИ. Чип пресета подписан целым, и дробный ввод обязан доехать до платы тем же
 *     числом, что человек видит на чипе; заодно это и есть та причина, по которой `MIN_GAUGE`
 *     стоит на 1, а не ниже (см. довод там).
 *  3. ЗАЖИМАЕМ В ВИДИМЫЙ ДИАПАЗОН и напоследок прогоняем через отсечку ФОРМАТА. Второй прогон
 *     сегодня тождественная операция (`MIN..MAX` целиком лежит внутри `SIZE_FLOOR..SIZE_CEIL`), и
 *     стоит он ровно ничего, а держит инвариант «в документ не уходит число вне конверта» даже
 *     после того, как кто-нибудь поднимет `MAX_STEP` выше `SIZE_CEIL`.
 */
const clampInput = (n: number, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : fallback)));
export const clampGauge = (n: number) =>
  roundGauge(clampInput(n, MIN_GAUGE, MAX_GAUGE, DEFAULT_GAUGE));
export const clampStep = (n: number) => roundStep(clampInput(n, MIN_STEP, MAX_STEP, DEFAULT_STEP));

/**
 * ПРЕСЕТЫ ДВУХ РЕГУЛЯТОРОВ — то, что рейка показывает чипами рядом с числовым полем.
 *
 * СТУПЕНИ ТОЛЩИНЫ БОЛЬШЕ НЕ ВЫВОДЯТСЯ ИЗ `WEIGHT_GAUGE`, и это не расщепление одной величины на
 * две, а разведение двух РАЗНЫХ: `WEIGHT_GAUGE` расшифровывает слово, записанное в чужом документе
 * (см. довод там — оно правит ещё и длину стежка старого штриха), а эти три числа отвечают на
 * вопрос «какую толщину предложить руке сегодня». Первое — история и заморожено; второе — вкус, и
 * владелец его только что изменил.
 *
 * Ряд 1 / 2 / 4 держит прежнюю пропорцию ступеней (втрое от волоса до жирного) и весь целиком
 * втрое тоньше прежнего 3 / 6 / 10. Числа целые, потому что `clampGauge` квантует человеческий
 * ввод целыми, и дробная ступень доехала бы до платы другим числом, чем написано на чипе.
 *
 * ЭТОТ СПИСОК — ЕЩЁ И ТАБЛИЦА ЗАПИСИ СЛОВА `weight`: его читает `gaugeWeight` (см. довод там).
 * Порядок ПО ВОЗРАСТАНИЮ обязателен — на нём стоит разрешение ничьей в пользу более тонкого
 * слова, — и ключи обязаны быть тремя РАЗНЫМИ: список с повторами схлопнул бы лестницу `weight`
 * в одну ступень ровно так, как это только что и случилось.
 *
 * СЛЕДСТВИЕ ДЛЯ ФОРМАТА, НАЗВАННОЕ ВСЛУХ: ни одна ступень больше не совпадает с `WEIGHT_GAUGE`,
 * поэтому `emitsGauge` теперь истинен для ЛЮБОГО нового штриха и всякий свежий документ уходит
 * версией `3`, а не `1`. Это честно — документ действительно несёт размер, которого старая вкладка
 * не поймёт, — и ничего не стоит: `v: 3` ходит в проде с той же волны, что и цвет.
 */
export const GAUGE_PRESETS: readonly { key: StrokeWeight; label: string; px: number }[] = [
  { key: 'hairline', label: 'hairline', px: 1 },
  { key: 'thin', label: 'thin', px: DEFAULT_GAUGE },
  { key: 'bold', label: 'bold', px: 4 },
];

/**
 * ОБЫЧНЫЙ СТЕЖОК — ИСТОРИЧЕСКАЯ КАЛИБРОВКА ФИГУРЫ, И ЭТО ВЫБОР ЧЕЛОВЕКА, А НЕ УМОЛЧАНИЕ.
 *
 * Прежде это число звалось `DEFAULT_STEP` и тем самым притворялось значением, с которого рука
 * начинает; см. довод там — начинает она со связанного стежка, а не с шестёрки. Здесь у шестёрки
 * своё, честное имя и своя работа: средняя ступень регулятора, то есть шов, который этот редактор
 * рисовал до разделения ручек.
 *
 * ТОЧНОСТЬ ОБЕЩАНИЯ НАЗВАНА ЧЕСТНО. Прежняя формулировка — «на шестёрке все размеры шва вдоль
 * линии дают прежние доли коробки ЧИСЛО В ЧИСЛО» — не выдержала замера: множители фигуры хранятся
 * с двумя знаками (`3.33` вместо `20/6`, `2.33` вместо `14/6`, `2.67` вместо `16/6`), поэтому
 * произведения расходятся с прежними долями коробки до 0.143% (худший случай — `BLIND.dip` и
 * `FLAT_ZIG_WL`). Это доля пикселя на любом боксе, который здесь рисуется, но «число в число» —
 * это не она. Ровно `WEIGHT_GAUGE.thin`, чтобы связь с расшифровкой формата была видна в коде: у
 * старого штриха длина стежка выводится ИМЕННО ЧЕРЕЗ ЭТУ СТУПЕНЬ.
 */
export const STEP_NORMAL = WEIGHT_GAUGE.thin;

/**
 * Ступени длины стежка. НЕ ТРОНУТЫ ВОЛНОЙ Y-1: жалоба была на толщину нити, а стежок стоит на
 * своём органе со своими границами (`MIN_STEP`/`MAX_STEP`) и своей историей.
 */
export const STEP_PRESETS: readonly { key: string; label: string; px: number }[] = [
  { key: 'short', label: 'short', px: 3 },
  { key: 'normal', label: 'normal', px: STEP_NORMAL },
  { key: 'long', label: 'long', px: 14 },
];

/**
 * РАЗМЕР ШТРИХА, ОДНОЙ ФУНКЦИЕЙ И С ЯВНЫМ СТАРШИНСТВОМ: число, если оно названо, иначе ступень.
 * Единственный читатель обоих полей — так «две записи одной величины» не превращаются в два
 * источника истины, которые разъедутся первой же правкой.
 */
export function strokeGauge(stroke: VectorStroke): number {
  const g = stroke.gauge;
  if (typeof g === 'number' && Number.isFinite(g)) return roundGauge(g);
  return WEIGHT_GAUGE[stroke.weight] ?? WEIGHT_GAUGE.thin;
}

/**
 * ДЛИНА СТЕЖКА, ВТОРАЯ ЛЕСТНИЦА И ТОЖЕ С ОДНИМ ЧИТАТЕЛЕМ: `step`, если он назван, иначе — ТОЛЩИНА,
 * и берётся она не отсюда, а у `strokeGauge`, чтобы у `gauge` остался ровно один читатель.
 *
 * Тождество `strokeStep(s) === strokeGauge(s)` для штриха без `step` — это и есть обещание «уже
 * сохранённый слой рисуется тем же `d`»: вся фигура шва умножается на возвращённое здесь число.
 */
export function strokeStep(stroke: VectorStroke): number {
  const s = stroke.step;
  if (typeof s === 'number' && Number.isFinite(s)) return roundStep(s);
  return strokeGauge(stroke);
}

/**
 * РАЗВЕДЁН ЛИ СТЕЖОК С НИТЬЮ — И ЭТО НАЛИЧИЕ ПОЛЯ, А НЕ СРАВНЕНИЕ ЧИСЕЛ.
 *
 * Единственный ответ на вопрос «развёл ли», какой у формата есть: поле либо названо, либо нет.
 * Числу тут сказать нечего — стежок 4 при нити 4 это ПРИШПИЛЕННЫЙ стежок, который не поедет за
 * следующим движением регулятора толщины, и от связанного он отличается ровно тем, что кто-то его
 * назвал. Решает вызывающий (модалка кладёт `step`, только когда рука его развела), а этот файл
 * решение ХРАНИТ, а не пере-выводит.
 *
 * Сужающий предикат, а не `boolean`, нарочно: `writeLayer` тем самым пишет `s.step` без каста, и
 * «проверил одно, записал другое» перестаёт быть выразимым.
 */
export function hasOwnStep(stroke: VectorStroke): stroke is VectorStroke & { step: number } {
  return typeof stroke.step === 'number' && Number.isFinite(stroke.step);
}

/**
 * СЛОВО, КОТОРЫМ ПОДПИСЫВАЕТСЯ ТОЛЩИНА, — БЛИЖАЙШИЙ ЧИП, А НЕ БЛИЖАЙШЕЕ ЧИСЛО РАСШИФРОВКИ.
 *
 * ТАБЛИЦА ЧТЕНИЯ И ТАБЛИЦА ЗАПИСИ — РАЗНЫЕ ПРЕДМЕТЫ, и раньше они были одной. `WEIGHT_GAUGE`
 * отвечает на вопрос «сколько пикселей значит слово, записанное в ЧУЖОМ документе» и заморожена
 * на {3, 6, 10} навсегда; здесь вопрос обратный и сегодняшний — «каким словом подписать толщину,
 * которую человек только что выбрал». Пока диапазон был 1..60, ответы совпадали, потому что чипы
 * И БЫЛИ числами расшифровки. `Y-1` увёл чипы на 1 / 2 / 4 — и «ближайшее из {3, 6, 10}» выдало
 * `hairline` на ВСЕ ТРИ (|3−1|=2, |3−2|=1, |3−4|=1 против |6−4|=2). Слово перестало нести хоть
 * что-нибудь: чип `bold` писал в документ `hairline`, и запасная лестница для читателя без поля
 * `gauge` схлопнулась в одну ступень — три разные кисти рисовались у него ОДНОЙ линией в 3 пикселя.
 *
 * ПОЧЕМУ НЕ «ДОЛЯ ДИАПАЗОНА». Замерено, и она не чинит: чипы не размазаны по 1..20, а нарочно
 * собраны в тонком конце. Линейные трети (границы 7.33 и 13.67) отправляют 1, 2 и 4 в `hairline`
 * ВСЕ ТРИ — тот же дефект другим способом; логарифмические (границы 2.71 и 7.37) разводят их на
 * два слова из трёх (1 и 2 → `hairline`, 4 → `thin`). Информацию несёт не положение числа в
 * диапазоне, а ТО, НА КАКОЙ ЧИП ЧЕЛОВЕК НАЖАЛ, — потому слово и берётся у чипа.
 *
 * Ничья уходит более тонкому слову: `GAUGE_PRESETS` отсортирован по возрастанию, а сравнение
 * строгое. У сохранённых документов это не двигает ни байта — `gaugeWeight` стоит только на пути
 * ЗАПИСИ, и зовёт её лишь рука, тронувшая регулятор.
 */
export function gaugeWeight(px: number): StrokeWeight {
  let best: StrokeWeight = 'thin';
  let bestD = Infinity;
  for (const preset of GAUGE_PRESETS) {
    const d = Math.abs(preset.px - px);
    if (d < bestD) {
      bestD = d;
      best = preset.key;
    }
  }
  return best;
}

/** Уходит ли `gauge` на провод: только когда он ОТЛИЧАЕТСЯ от своей ступени (см. довод в шапке). */
function emitsGauge(stroke: VectorStroke): boolean {
  const g = stroke.gauge;
  if (typeof g !== 'number' || !Number.isFinite(g)) return false;
  return roundGauge(g) !== WEIGHT_GAUGE[stroke.weight];
}

/* УХОДИТ ЛИ `step` НА ПРОВОД — СПРАШИВАЕТСЯ У `hasOwnStep`, И СВОЕЙ ФУНКЦИИ У ЭТОГО ВОПРОСА
   БОЛЬШЕ НЕТ. Здесь стоял `emitsStep`, повторявший приём `emitsGauge` — «не писать поле, которое
   и так выводится», — и приём был перенесён НА ВЕЛИЧИНУ, КОТОРАЯ НЕ ВЫВОДИТСЯ.

   Разница между двумя полями настоящая, а не стилистическая. `gauge`, равный своей ступени,
   ДЕЙСТВИТЕЛЬНО ничего не добавляет: слово `weight` рядом несёт то же число, и читатель без
   `gauge` восстановит его в точности. А `step`, равный нити, добавляет РОВНО ОДНУ ВЕЩЬ, которой
   больше нигде нет, — что он пришпилен и не поедет за нитью. Сравнение чисел эту вещь стирало:
   поставь нить 4 и ЯВНО стежок 4 — рейка писала «set apart» и показывала кнопку «follow», а
   сохранение выбрасывало поле, и следующая правка толщины утягивала стежок за собой. Замерено:
   `hasOwnStep` до записи `true`, после круга «записать → прочитать» — `false`.

   ЦЕНА ПО ВЕРСИИ ДОКУМЕНТА ПОСЧИТАНА, И ОНА НУЛЕВАЯ ДЛЯ ВСЕГО, ЧТО УЖЕ ЛЕЖИТ В БАЗЕ. Прежнее
   правило не записывало `step`, равный нити, НИКОГДА — значит ни в одном сохранённом документе
   такого поля нет, и круг «прочитать → записать» не поднимает версию ни одному из них (замерено
   на v1/v2/v3/v4). Не поднимает её и новый штрих: модалка кладёт `step` только когда `stepOwn`,
   то есть после того, как рука тронула сам регулятор стежка. Прибавился ровно один случай —
   пришпиленный стежок, чьё число совпало с нитью, — и он `v: 4` ЗАСЛУЖЕННО: старая вкладка,
   пересохранив такой слой, потеряла бы пришпиленность молча, а это та же потерянная работа, что
   выпрямленная кривая и перекрашенный в чёрный цвет. */

/**
 * Does this stroke carry an explicit segment list? The test is structural rather than «is `segs`
 * truthy»: a list whose length has drifted from the anchors cannot address intervals at all, and
 * drawing it would put curvature on the wrong ones.
 */
export function hasSegments(
  stroke: VectorStroke,
): stroke is VectorStroke & { segs: (CubicSeg | null)[] } {
  return Array.isArray(stroke.segs) && stroke.segs.length === stroke.pts.length - 1;
}

export type LayerDoc = {
  strokes: VectorStroke[];
  /**
   * The frame's own width/height ratio. Stored so a layer with NO base picture reopens at the shape
   * it was drawn in — with a base, the base's ratio is authoritative and this is only a fallback.
   */
  ratio: number;
  /**
   * Something is stored under this layer that this bundle could not read. The editor must show the
   * layer as unreadable and refuse to save over it: a «start clean» save would replace a colleague's
   * work with an empty document and there is no revision history to get it back from.
   */
  unreadable: boolean;
};

/** A blank drawing's shape when nothing states one — the same 4:5 the bench frames use. */
export const DEFAULT_RATIO = 0.8;

/** The server's own ceiling on the serialised layer (`strokes_too_large` past it). */
export const MAX_STROKES_BYTES = 512 * 1024;

/**
 * The highest document version this bundle can read, and the one it writes when a curve is present.
 *
 * `1` — anchors only. `2` — anchors plus an optional per-interval cubic list. `3` — plus a stroke's
 * own colour and size. `4` — plus a stitch length told apart from the thread's thickness. The number
 * is raised ONLY for a document that actually holds the thing (see `writeLayer`), because raising it
 * costs every older tab the right to save this layer at all — which is the correct price for a
 * drawing an older tab would silently straighten, repaint black or re-stitch fine, and far too high
 * a price for one it would read perfectly.
 */
export const FORMAT_VERSION = 4;

/**
 * The most points one stroke may keep. Not a server rule — a readability one: a freehand trace
 * samples the pointer hundreds of times a second, and past this the extra points move no line by a
 * visible amount while they do move the 512 KB ceiling closer for every stroke after them.
 */
const MAX_POINTS_PER_STROKE = 240;

/** ~2 screen pixels on a 400px-wide stage, expressed in frame fractions. */
export const TRACE_EPSILON = 0.005;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * How far outside the frame a CONTROL point may lie: one whole frame beyond each edge. Anchors keep
 * the strict 0..1 — see `readSeg` for why the two answers differ.
 */
export const CONTROL_REACH = 1;
const reach = (n: number) => Math.min(1 + CONTROL_REACH, Math.max(-CONTROL_REACH, n));

function readPoint(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp01(x), clamp01(y)];
}

/**
 * One interval's control points, or `null` for a straight run. Returns `undefined` — distinct from
 * `null` — when the entry is not one of those two things, so the caller can tell «straight» from
 * «unreadable» instead of quietly turning the second into the first.
 */
function readSeg(raw: unknown): CubicSeg | null | undefined {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const v = raw.map(Number);
  if (v.some((n) => !Number.isFinite(n))) return undefined;
  // A CONTROL POINT IS NOT CLAMPED TO THE FRAME, AND THAT IS NOT AN OVERSIGHT. An anchor outside
  // 0..1 is a mistake — the drawing would be off the plate. A control point outside it is ordinary
  // geometry: a curve whose ends are both inside the frame routinely reaches for a handle beyond
  // its edge, and clamping that handle bends the curve away from the shape somebody drew, silently.
  // What IS clamped is the reach, at one whole frame beyond each edge, so a corrupt number cannot
  // put a control point at 1e9 and make every downstream `toFixed` print an exponent.
  return [reach(v[0]), reach(v[1]), reach(v[2]), reach(v[3])];
}

/**
 * One stroke. `report.broken` is raised — never silently swallowed — when the stroke states
 * curvature this bundle cannot line up with its anchors: a segment list of the wrong length, or an
 * entry that is neither `null` nor four finite numbers. That is the difference between «an empty
 * layer» and «a layer somebody else's version wrote», and only the second one must stop the writers.
 */
function readStroke(raw: unknown, report: { broken: boolean }): VectorStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawPts = Array.isArray(r.pts) ? r.pts : [];
  const pts = rawPts.map(readPoint).filter(Boolean) as [number, number][];
  const carriesSegs = r.segs !== undefined && r.segs !== null;
  // A DROPPED POINT DESYNCHRONISES THE SEGMENT LIST. On a plain polyline a malformed point has
  // always been thrown away and the line simply goes round it; with segments, interval `i` would
  // then describe the curvature of some other interval, and every curve after the gap would be
  // drawn in the wrong place. So on a curved stroke a lost point is a broken document, not a repair.
  if (carriesSegs && pts.length !== rawPts.length) {
    report.broken = true;
    return null;
  }
  // A stroke of fewer than two points draws nothing and cannot be selected — it is not a stroke.
  if (pts.length < 2) return null;
  const brush = typeof r.brush === 'string' && STITCH_KEYS.includes(r.brush) ? r.brush : 'plain';
  const weight = typeof r.weight === 'string' && WEIGHTS.includes(r.weight) ? r.weight : 'thin';
  const tool = typeof r.tool === 'string' && TOOLS.includes(r.tool) ? (r.tool as Tool) : 'line';

  let segs: (CubicSeg | null)[] | undefined;
  if (carriesSegs) {
    if (!Array.isArray(r.segs) || r.segs.length !== pts.length - 1) {
      report.broken = true;
      return null;
    }
    const read = r.segs.map(readSeg);
    if (read.some((s) => s === undefined)) {
      report.broken = true;
      return null;
    }
    segs = read as (CubicSeg | null)[];
  }

  const stroke: VectorStroke = {
    tool,
    brush: brush as StitchKey,
    weight: weight as StrokeWeight,
    dashed: !!r.dashed,
    pts,
  };
  // ASSIGNED ONLY WHEN THERE IS ONE, so a legacy stroke round-trips WITHOUT the key ever appearing
  // in the JSON — which is what keeps a polyline-only document at `v: 1` and byte-identical.
  if (segs) stroke.segs = segs;
  // ЦВЕТ И РАЗМЕР — ПО ТОМУ ЖЕ ПРАВИЛУ. Непонятный цвет или нечисловой размер НЕ ломают документ:
  // в отличие от рассинхронизированных сегментов, они не двигают ни одной линии — штрих просто
  // остаётся чёрным и своей ступени, а это ровно то, чем он был бы на прошлом бандле.
  const ink = readInk(r.ink);
  if (ink) stroke.ink = ink;
  const gauge = Number(r.gauge);
  if (r.gauge !== undefined && r.gauge !== null && Number.isFinite(gauge)) {
    stroke.gauge = roundGauge(gauge);
  }
  // ДЛИНА СТЕЖКА ЧИТАЕТСЯ ТАК ЖЕ МЯГКО. Нечисловой `step` не ломает документ по той же причине,
  // что и нечисловой `gauge`: он не двигает ни одной линии — стежок просто остаётся равным нити,
  // то есть тем, чем он был бы на бандле, который про это поле не знает вовсе.
  const step = Number(r.step);
  if (r.step !== undefined && r.step !== null && Number.isFinite(step)) {
    stroke.step = roundStep(step);
  }
  return stroke;
}

/**
 * Read what the server stored. Never throws; an empty or absent blob is an empty document and is
 * NOT «unreadable» — a layer that has just been born legitimately holds nothing.
 */
export function readLayer(raw?: string | null, fallbackRatio = DEFAULT_RATIO): LayerDoc {
  const text = (raw ?? '').trim();
  if (!text) return { strokes: [], ratio: fallbackRatio, unreadable: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }

  const doc = parsed as Record<string, unknown>;
  // A FUTURE VERSION IS UNREADABLE, NOT EMPTY. `v` is the only thing this format promises across
  // bundles, so a number it does not know stops the writers rather than being ignored.
  const version = Number(doc.v ?? 0);
  if (!Number.isFinite(version) || version < 1 || version > FORMAT_VERSION) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  if (!Array.isArray(doc.strokes)) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }

  const report = { broken: false };
  const strokes = doc.strokes.map((s) => readStroke(s, report)).filter(Boolean) as VectorStroke[];
  // CURVATURE THAT DID NOT LINE UP IS AN UNREADABLE LAYER, NOT A THINNER ONE. Dropping the offending
  // strokes and saving would hand somebody a drawing with pieces missing and no sign that anything
  // went; the version guard exists for precisely this failure and is reused here.
  if (report.broken) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  const ratio = Number(doc.ratio);
  return {
    strokes,
    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : fallbackRatio,
    unreadable: false,
  };
}

/**
 * What goes on the wire. Thinning happens HERE so no path can send more than it drew usefully.
 *
 * A CURVED STROKE IS NEVER THINNED, and that is a correctness rule rather than a preference. The
 * anchors of a curve are not samples of a pointer that can be resampled — each one is the end of a
 * cubic whose control points are stored beside it, so removing an anchor without removing the
 * matching interval leaves the two lists describing different shapes. There is nothing to thin
 * anyway: a vector file that says a bend takes one cubic is already at its cheapest description.
 * The 512 KB ceiling stays the honest limit, and it refuses out loud in the modal.
 *
 * THE VERSION IS THE HIGHEST ANY STROKE NEEDS. A drawing with no curves is still `v: 1` — the same
 * bytes this function has always produced — so nothing that used to be readable stops being so.
 */
export function writeLayer(strokes: VectorStroke[], ratio: number): string {
  const curved = strokes.some(hasSegments);
  // Версия — самая высокая, какая КОМУ-ТО из штрихов действительно нужна. Цвет и размер стоят на
  // третьей ступени: старая вкладка прочла бы такой документ, но перекрасила бы его в чёрный и
  // свела к трём весам, а молча потерянный цвет ничем не лучше молча выпрямленной кривой.
  const painted = strokes.some((s) => !!readInk(s.ink) || emitsGauge(s));
  // ЧЕТВЁРТАЯ СТУПЕНЬ — И ТОЛЬКО НАД ТЕМИ, У КОГО СТЕЖОК НАЗВАН СВОИМ. Документ, в котором стежок
  // следует за нитью, не несёт поля `step` вовсе и остаётся ровно той версией, какой был: бандл,
  // не знающий про X-8, прочтёт его и нарисует то же самое. Названный — нет: такой бандл свёл бы
  // длинную строчку к толщине нити, а пришпиленную развязал бы обратно, и обе потери молчаливы.
  const stitched = strokes.some(hasOwnStep);
  return JSON.stringify({
    v: stitched ? 4 : painted ? 3 : curved ? 2 : 1,
    ratio: round4(ratio),
    strokes: strokes.map((s) => {
      // ПОРЯДОК КЛЮЧЕЙ И ИХ ОТСУТСТВИЕ — часть обещания «старый слой уходит теми же байтами»:
      // необязательные ключи дописываются В КОНЕЦ и только когда им есть что сказать.
      const paint: { ink?: string; gauge?: number; step?: number } = {};
      const ink = readInk(s.ink);
      if (ink) paint.ink = ink;
      if (emitsGauge(s)) paint.gauge = roundGauge(s.gauge as number);
      if (hasOwnStep(s)) paint.step = roundStep(s.step);
      if (!hasSegments(s)) {
        return {
          tool: s.tool,
          brush: s.brush,
          weight: s.weight,
          dashed: s.dashed,
          pts: simplifyToLimit(
            s.pts.map(([x, y]) => ({ x, y })),
            MAX_POINTS_PER_STROKE,
          ).map((p) => [round4(p.x), round4(p.y)]),
          ...paint,
        };
      }
      return {
        tool: s.tool,
        brush: s.brush,
        weight: s.weight,
        dashed: s.dashed,
        pts: s.pts.map(([x, y]) => [round4(x), round4(y)]),
        segs: s.segs.map((c) =>
          c ? [round4(c[0]), round4(c[1]), round4(c[2]), round4(c[3])] : null,
        ),
        ...paint,
      };
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CURVES — one path builder and one flattener, and everything that touches strokes uses them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A point on a cubic at parameter `t`. Plain Bernstein arithmetic — no library is involved. */
export function cubicAt(
  p0: ShapePoint,
  c1: ShapePoint,
  c2: ShapePoint,
  p3: ShapePoint,
  t: number,
): ShapePoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/**
 * How many straight pieces one cubic becomes when a curve has to be measured or hit-tested.
 *
 * Sixteen, and the number is chosen against the ONE threshold that consumes it: a click has to land
 * within ten stage pixels of a stroke. The worst-case chord error of a cubic split into sixteen
 * equal-parameter pieces is under a thousandth of its own bounding box, i.e. well under a pixel on
 * a stage of any size this editor draws — so the flattening never decides whether a click hit.
 * It is NOT used for drawing: the drawn path keeps its `C` segments and stays exact at every zoom.
 */
const FLATTEN_STEPS = 16;

/**
 * A stroke as an explicit path in a `w × h` box: `L` where the interval is straight, `C` where it
 * carries control points, `M` where the pen was lifted (the duplicated-point convention the ink
 * layer already uses, honoured here so a curved stroke and a traced one break the same way).
 */
function curvePath(pts: ShapePoint[], segs: (CubicSeg | null)[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = segs[i] ?? null;
    if (seg) {
      d += ` C${seg[0]},${seg[1]} ${seg[2]},${seg[3]} ${b.x},${b.y}`;
      continue;
    }
    if (a.x === b.x && a.y === b.y) {
      d += ` M${b.x},${b.y}`;
      continue;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}

/**
 * THE STROKE AS A POLYLINE, for anything that measures rather than draws: hit-testing, length,
 * area. Anchors alone are NOT that polyline once curves exist — a cubic leaves its chord by design,
 * and a click on the visible bulge of an imported curve would miss a stroke that is plainly under
 * the pointer. A stroke with no segments returns its anchors unchanged, so the legacy path is not
 * merely equivalent to what it was, it is the identical array.
 */
export function strokePolyline(stroke: VectorStroke, w = 1, h = 1): ShapePoint[] {
  const pts: ShapePoint[] = stroke.pts.map(([x, y]) => ({ x: x * w, y: y * h }));
  if (!hasSegments(stroke)) return pts;
  const out: ShapePoint[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = stroke.segs[i] ?? null;
    if (!seg) {
      out.push(b);
      continue;
    }
    const c1 = { x: seg[0] * w, y: seg[1] * h };
    const c2 = { x: seg[2] * w, y: seg[3] * h };
    for (let k = 1; k <= FLATTEN_STEPS; k++) out.push(cubicAt(a, c1, c2, b, k / FLATTEN_STEPS));
  }
  return out;
}

/** A finished freehand trace, thinned once at the moment the pen comes up. */
export function settleTrace(pts: [number, number][]): [number, number][] {
  const thinned = simplifyPath(
    pts.map(([x, y]) => ({ x, y })),
    TRACE_EPSILON,
  );
  return simplifyToLimit(thinned, MAX_POINTS_PER_STROKE).map((p) => [round4(p.x), round4(p.y)]);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOW A STITCH IS DRAWN — one description, four consumers.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The geometry of one stroke in a box of `w × h` units.
 *
 * ONE FUNCTION, FOUR SURFACES: the editor's own SVG, the downloadable SVG, the canvas that
 * rasterises for the flatten, and the stitch sample in the picker all call this. The lesson is the
 * sheet exporter's (`70-actions.js:276`): the shapes on paper must be drawn by THE SAME renderer as
 * the ones on screen, or the paper stops being evidence of what somebody approved.
 *
 * WEIGHTS AND DASHES SCALE WITH THE BOX. They are stated as fractions of the box WIDTH so that a
 * 320px editor stage, a 200-unit export viewBox and a 1200px raster all show the same line — the
 * constants are chosen so that at w = 200 they reproduce the prototype's absolute values exactly
 * (hairline 0.6, thin 1.2, bold 2.0, the double-line offset 2.2).
 */
export type StrokeGeometry = {
  /** The path, in box units. Identical for every offset copy. */
  d: string;
  strokeWidth: number;
  /** `stroke-dasharray`, or '' for a solid line. */
  dash: string;
  /**
   * Vertical offsets, in box units, at which the path is repeated. A single-line stitch gives
   * `[0]`; a two-needle, coverstitch or flatlock gives two rows.
   */
  offsets: number[];
};

/* Прежняя таблица `WEIGHT_FRACTION` (доли коробки 0.003 / 0.006 / 0.01) переехала выше и стала
   `WEIGHT_GAUGE` в пикселях платы (3 / 6 / 10) — те же числа в другой единице. Её больше нет
   здесь, потому что вес перестал быть отдельной величиной: он ЕСТЬ толщина нити (`gauge`), а
   после X-8 — только она: длина стежка живёт в `step` и своей ступени не имеет. */

/**
 * ПУНКТИР ОСТАЛСЯ РОВНО ОДИН — «ЭТО НЕ ШОВ».
 *
 * Челночная строчка и каверстич жили в таблице `STITCH_DASH` и рисовались `stroke-dasharray`, и это
 * была последняя подмена в этом файле: `dasharray` — ритм ЗАЛИВКИ линии, а не стежки. Он не знает,
 * где линия кончилась (обрывается на полустежке), не знает, где она согнулась, и на кривой раздаёт
 * штрихи по длине заливки, а не по проколам иглы. Ровно этим шов и «не похож на реальность».
 * Теперь оба строятся `stitchPath` — списком настоящих хорд от прокола до прокола, — а пунктиром
 * говорится единственная вещь, которая ритмом и является: линия построительная, её не шьют.
 *
 * Числа — КРАТНЫЕ ДЛИНЕ СТЕЖКА (`step`, а у слоя без него — `gauge`), а не доли коробки: на 6 это
 * прежние 0.02/0.015 scaleRef число в число. Ритм построительной линии стоит на длине стежка, а не
 * на толщине нити, потому что это ритм ВДОЛЬ линии, — и это единственное, что `S` считает у
 * `plain`. Поперечного размера у пунктира нет вовсе, поэтому разводить здесь нечего (Y-5).
 */
const CONSTRUCTION_DASH: [number, number] = [3.33, 2.5];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ФОРМА ШВА — ГЕОМЕТРИЯ ВДОЛЬ ЛИНИИ, а не только ритм штриховки.
//
// До этой волны девять видов различались dasharray и второй копией пути со сдвигом по Y
// (`translate(0, dy)`). Сдвиг по Y — не «параллельная строчка», а её проекция для строго
// горизонтальной линии: на вертикальном шве обе копии ложились ДРУГ НА ДРУГА (вертикальная линия
// коллинеарна своему вертикальному сдвигу), и двухигольный шов был неотличим от одинарного.
// Поэтому вторые ряды, волна зигзага и гребёнка оверлока строятся здесь — вдоль самой линии, через
// нормаль к касательной — и уезжают в ОДНУ строку `d` с M-разрывами. Контракт `StrokeGeometry` не
// менялся: потребители по-прежнему рисуют `offsets` (теперь всегда `[0]`), и все четыре
// поверхности обновились, не узнав об этом.
//
// У КАЖДОГО ЧИСЛА В ТАБЛИЦЕ ЕСТЬ ОСЬ, И ОТ ОСИ ЗАВИСИТ, НА КАКОЙ ОНО РУЧКЕ (Y-5).
//
// Прежний абзац здесь утверждал: «ПОПЕРЕЧНЫЕ РАЗМЕРЫ СТОЯТ ТОЖЕ НА СТЕЖКЕ, и это выбор, а не
// недосмотр». Выбор был неверный, и владелец назвал его дословно: «STITCH long увеличивает не
// только длину, но и ширину, и этим пользоваться невозможно». Он прав: регулятор ДЛИНЫ стежка
// раздувал шов ПОПЕРЁК линии в 13–23 раза от края до края (замерено), то есть орган делал не то,
// что написано на нём, — а две ручки затем и разводились, чтобы каждая правила ровно своё.
//
// ГРАНИЦА ПРОХОДИТ ПО ОСИ, А НЕ ПО ВИДУ ШВА:
//   • ВДОЛЬ линии — период, шаг прокола, длина пролёта, ритм пунктира: они КРАТНЫ `S` (длине
//     стежка). Это и есть та величина, которую человек крутит, когда хочет строчку реже или чаще.
//   • ПОПЕРЁК линии — амплитуда волны, зазор между рядами, вылет зубца гребёнки: они КРАТНЫ `G`
//     (толщине нити). Поперечный размер шва — свойство МАШИНЫ (расстановка игл на игольнице,
//     размах игловодителя), и на настоящей машине он не меняется от того, что технолог удлинил
//     стежок. Ровно этой независимости и требовал владелец.
//
// ПОЧЕМУ СТАРЫЙ ДОВОД («посади их на нить — и зигзаг тонкой нитью схлопнется в прямую») НЕ ВЕРЕН.
// Он неявно считал `G` постоянной, а `amp` — числом юнитов. Но `amp` — МНОЖИТЕЛЬ: амплитуда
// 1.8 × G при ширине линии 1 × G даёт размах от края до края 4.6 ширины нити ПРИ ЛЮБОЙ нити.
// Шов не схлопывается — он ПОДОБЕН себе: тонкая нить рисует тот же зигзаг мельче, ровно как
// тонкая нить на настоящей машине. Схлопывалось бы обратное — и как раз оно и происходило:
// зигзаг с амплитудой на стежке при длинном стежке превращался в размашистую пилу шириной
// в четверть чертежа, ничем не похожую на шов.
//
// КАЛИБРОВКА НЕ СДВИНУЛАСЬ НИ НА ЮНИТ, И ЭТО СЛЕДСТВИЕ, А НЕ СОВПАДЕНИЕ. У штриха, не назвавшего
// `step`, `strokeStep` тождественно равен `strokeGauge`, то есть `S === G`; значит для КАЖДОГО уже
// сохранённого связанного слоя произведения `amp * G` и `amp * S` — одно и то же число, и вся эта
// правка не двигает в нём ни одной точки. Меняется рисунок ровно тех штрихов, у которых стежок
// РАЗВЕДЁН с нитью, — то есть ровно тех, на которые жалоба.
// На шестёрке по-прежнему выходят прежние доли коробки число в число: 5 × 0.006 = 0.03 — та самая
// длина волны зигзага, и так по всей таблице.
//
// Образец в пикере, сцена, экспорт и растр обязаны показывать ОДИН И ТОТ ЖЕ шов, отличающийся
// только масштабом коробки.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Зигзаг 304: настоящая треугольная волна. `wl` — период (ВДОЛЬ), `amp` — размах (ПОПЕРЁК). */
const ZIG = { wl: 5, amp: 1.8 };
/**
 * Закрепка: та же волна, но плотная и тяжёлая — брусок плотных стежков, а не линия.
 * `wl` — период (ВДОЛЬ), `amp` — размах (ПОПЕРЁК), `widthK` — множитель самой нити.
 */
const BART = { wl: 0.92, amp: 1.17, widthK: 1.6 };
/**
 * Зазор между рядами двухигольного (401×2) и основой флэтлока — расстановка игл на игольнице.
 * ПОПЕРЁК линии, и оттого кратен нити: две иглы на игольнице не разъезжаются от того, что
 * технолог удлинил стежок, — это размер машины, а не настройки.
 */
const RAIL_GAP = 2;
/**
 * Каверстич 406 шире двухигольного, и это не вкус: у распошивальной машины иглы стоят на 4–6 мм,
 * у двухигольной обычно на 2–4. Прежде оба рисовались ОДНИМ `railsPath` с одним зазором и были
 * неотличимы друг от друга — два разных ISO-класса, дававшие одинаковую картинку. ПОПЕРЁК линии.
 */
const COVER_GAP = 3.2;
/**
 * Внутренний зигзаг флэтлока — петлители между двумя рядами. Здесь только ПЕРИОД (ВДОЛЬ);
 * амплитуда своего числа не имеет вовсе — она упирается в сами ряды и берётся от `RAIL_GAP`,
 * поэтому у петлителей и рельсов ОДНА ось и одна ручка, как и должно быть.
 */
const FLAT_ZIG_WL = 2.33;
/**
 * Оверлок 504: наклонная гребёнка через край. `spacing` — шаг зубца (ВДОЛЬ), `tick` — его длина.
 * Зубец наклонён на 60° к касательной, то есть несёт обе составляющие; ПОПЕРЕЧНАЯ у него
 * преобладает (sin 60° ≈ 0.87 против cos 60° = 0.5), и именно она читается глазом как ширина
 * обмётки. Поэтому длина зубца кратна нити: обмётка шире не становится от длинного стежка, у
 * настоящего оверлока её задаёт вылет ножа и палец игольной пластины.
 */
const OVER = { spacing: 2.67, tick: 3.33 };
/**
 * Потайной 103: длинный пропуск и короткий «укол» — почти прямая с редкими зубчиками.
 * `period` и `dip` — ВДОЛЬ линии (сколько идти и с какого места отклоняться), `amp` — ПОПЕРЁК.
 */
const BLIND = { period: 9.17, dip: 2.33, amp: 1.5 };
/**
 * Челночная строчка 301 и ряд каверстича: шаг прокола и доля шага, занятая нитью.
 * `pitch` 3.83 на `thin` даёт период 23 юнита — тот самый ритм, которым раньше притворялся
 * `dasharray` [15, 8], только теперь это НАСТОЯЩИЕ стежки: целое число, посаженное на длину линии.
 */
const LOCK = { pitch: 3.83, duty: 0.65 };

/** Та же квантизация, что и в strokeGeometry, — см. довод там про экспоненты в `d`. */
const q2 = (n: number) => Math.round(n * 100) / 100;

type WalkPoint = { x: number; y: number; tx: number; ty: number };

/**
 * Ломаная, параметризованная длиной дуги. `at(s)` отдаёт точку и ЕДИНИЧНУЮ касательную — нормаль
 * к ней и есть направление, в котором волна и ряды отступают от линии.
 *
 * Курсор монотонный: генераторы семплят s по возрастанию, и повторный линейный скан с нуля на
 * каждой пробе превращал бы штрих после флэттена кривых (до ~4k точек) в квадратичный проход.
 * Пошедший назад s честно сбрасывает курсор, а не отдаёт мусор.
 */
function walkPolyline(poly: ShapePoint[]): { len: number; at: (s: number) => WalkPoint } {
  const cum: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  }
  const len = cum[cum.length - 1] ?? 0;
  let cursor = 1;
  const at = (s: number): WalkPoint => {
    const t = Math.min(len, Math.max(0, s));
    if (cursor > 1 && t < cum[cursor - 1]) cursor = 1;
    while (cursor < cum.length - 1 && cum[cursor] < t) cursor++;
    const a = poly[cursor - 1];
    const b = poly[cursor] ?? a;
    const seg = (cum[cursor] ?? 0) - cum[cursor - 1];
    const k = seg > 0 ? (t - cum[cursor - 1]) / seg : 0;
    const tx = seg > 0 ? (b.x - a.x) / seg : 1;
    const ty = seg > 0 ? (b.y - a.y) / seg : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx, ty };
  };
  return { len, at };
}

/**
 * Треугольная волна вдоль ломаной. Полуволна ПОДГОНЯЕТСЯ под длину (целое число полуволн), чтобы
 * волна кончалась НА конце линии, а не обрывалась на полпике, — так же машина доводит зигзаг до
 * края детали. Короче полутора волн — пусто: вызывающий рисует обычную линию, потому что волна из
 * одного пика читается как случайный излом, а не как шов.
 */
function wavePath(poly: ShapePoint[], wavelength: number, amp: number): string {
  const w = walkPolyline(poly);
  if (w.len < wavelength * 1.5) return '';
  const halves = Math.max(2, Math.round(w.len / (wavelength / 2)));
  const step = w.len / halves;
  const p0 = w.at(0);
  let d = `M${q2(p0.x)},${q2(p0.y)}`;
  for (let i = 1; i < halves; i++) {
    const p = w.at(i * step);
    const side = i % 2 === 1 ? 1 : -1;
    d += ` L${q2(p.x - p.ty * amp * side)},${q2(p.y + p.tx * amp * side)}`;
  }
  const pn = w.at(w.len);
  d += ` L${q2(pn.x)},${q2(pn.y)}`;
  return d;
}

/**
 * Ломаная, отнесённая на `off` по нормали. Нормаль вершины — среднее нормалей смежных отрезков:
 * на прямой это точная параллель, на изломе — биссектриса без митр-взрыва (длина не компенсируется
 * нарочно: ряды шва в остром углу чуть сходятся, как сходится и настоящая строчка).
 */
function offsetPoly(poly: ShapePoint[], off: number): ShapePoint[] {
  const n = poly.length;
  const out: ShapePoint[] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0;
    let ny = 0;
    for (const [a, b] of [
      [poly[i - 1], poly[i]],
      [poly[i], poly[i + 1]],
    ] as const) {
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy);
      if (l === 0) continue;
      nx += -dy / l;
      ny += dx / l;
    }
    const l = Math.hypot(nx, ny) || 1;
    out.push({ x: poly[i].x + (nx / l) * off, y: poly[i].y + (ny / l) * off });
  }
  return out;
}

function polyD(poly: ShapePoint[]): string {
  if (poly.length < 2) return '';
  return `M${poly.map((p) => `${q2(p.x)},${q2(p.y)}`).join(' L')}`;
}

/** Два параллельных ряда СПЛОШНОЙ нитью — основа флэтлока, где ряды несут петлители. */
function railsPath(poly: ShapePoint[], gap: number): string {
  const a = polyD(offsetPoly(poly, gap / 2));
  const b = polyD(offsetPoly(poly, -gap / 2));
  return a && b ? `${a} ${b}` : '';
}

/**
 * НАСТОЯЩИЕ СТЕЖКИ ВДОЛЬ ЛОМАНОЙ — цепочка отдельных хорд «от прокола до прокола».
 *
 * Это и есть разница между швом и пунктиром, и она не косметическая:
 *  1. ШАГ ПОДГОНЯЕТСЯ ПОД ДЛИНУ. Число стежков целое, поэтому строчка КОНЧАЕТСЯ ПРОКОЛОМ, а не
 *     обрывком нити в воздухе. Машина доводит строчку до края детали ровно так; `dasharray` —
 *     никогда, он режет заливку и обрывается там, где придётся.
 *  2. СТЕЖОК ПРЯМОЙ ДАЖЕ НА КРИВОЙ. Игла прокалывает две точки, нить между ними — хорда, и
 *     строчка по дуге выглядит многоугольником коротких прямых. `dasharray` гнул бы нить вместе с
 *     дугой, чего нить не делает.
 *  3. ПРОКОЛЫ ВИДНЫ: концы хорд с круглой каппой читаются как точки входа иглы.
 *
 * `duty` — доля шага, занятая нитью на лице; остальное уходит протяжкой на изнанку.
 */
function stitchPath(poly: ShapePoint[], pitch: number, duty: number): string {
  const w = walkPolyline(poly);
  if (w.len < pitch * 1.5) return '';
  const n = Math.max(2, Math.round(w.len / pitch));
  const step = w.len / n;
  const ink = step * duty;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = w.at(i * step);
    const b = w.at(i * step + ink);
    d += `${d ? ' ' : ''}M${q2(a.x)},${q2(a.y)} L${q2(b.x)},${q2(b.y)}`;
  }
  return d;
}

/** Два ряда НАСТОЯЩИХ стежков — двухигольная и распошивальная: у обеих лицо это две строчки. */
function stitchedRails(poly: ShapePoint[], gap: number, pitch: number, duty: number): string {
  const a = stitchPath(offsetPoly(poly, gap / 2), pitch, duty);
  const b = stitchPath(offsetPoly(poly, -gap / 2), pitch, duty);
  return a && b ? `${a} ${b}` : '';
}

/** Наклонная гребёнка оверлока: зубцы под 60° к касательной, через край линии. */
function tickPath(poly: ShapePoint[], spacing: number, tickLen: number): string {
  const w = walkPolyline(poly);
  if (w.len < spacing * 2) return '';
  const n = Math.max(2, Math.floor(w.len / spacing));
  const step = w.len / n;
  const half = tickLen / 2;
  const c = Math.cos(Math.PI / 3);
  const s = Math.sin(Math.PI / 3);
  let d = '';
  for (let i = 0; i <= n; i++) {
    const p = w.at(Math.min(w.len, i * step));
    const dx = p.tx * c - p.ty * s;
    const dy = p.tx * s + p.ty * c;
    d += `${d ? ' ' : ''}M${q2(p.x - dx * half)},${q2(p.y - dy * half)} L${q2(p.x + dx * half)},${q2(p.y + dy * half)}`;
  }
  return d;
}

/** Потайной: длинные пролёты по самой линии с коротким треугольным «уколом» в конце периода. */
function blindPath(poly: ShapePoint[], period: number, dip: number, amp: number): string {
  const w = walkPolyline(poly);
  if (w.len < period * 1.2) return '';
  const n = Math.max(1, Math.round(w.len / period));
  const step = w.len / n;
  const p0 = w.at(0);
  let d = `M${q2(p0.x)},${q2(p0.y)}`;
  for (let i = 0; i < n; i++) {
    const sEnd = (i + 1) * step;
    const flat = w.at(sEnd - dip);
    const mid = w.at(sEnd - dip / 2);
    const end = w.at(Math.min(w.len, sEnd));
    d += ` L${q2(flat.x)},${q2(flat.y)}`;
    d += ` L${q2(mid.x - mid.ty * amp)},${q2(mid.y + mid.tx * amp)}`;
    d += ` L${q2(end.x)},${q2(end.y)}`;
  }
  return d;
}

/**
 * Ломаная штриха в единицах бокса, с флэттеном кубических сегментов, — вход фигурных швов.
 * Тот же приём и тот же шаг, что у `strokePolyline` (см. довод у `FLATTEN_STEPS`): хорда
 * шестнадцатой доли кубика уходит от кривой меньше чем на пиксель любого бокса, который здесь
 * рисуется, так что волна, посаженная на флэттен, не отходит от видимой кривой.
 */
function flatPoly(pts: ShapePoint[], segs: (CubicSeg | null)[] | null): ShapePoint[] {
  if (!segs) return pts;
  const out: ShapePoint[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = segs[i] ?? null;
    if (!seg) {
      out.push(b);
      continue;
    }
    const c1 = { x: seg[0], y: seg[1] };
    const c2 = { x: seg[2], y: seg[3] };
    for (let k = 1; k <= FLATTEN_STEPS; k++) out.push(cubicAt(a, c1, c2, b, k / FLATTEN_STEPS));
  }
  return out;
}

export function strokeGeometry(
  stroke: VectorStroke,
  w: number,
  h: number,
  /**
   * The width the WEIGHT is a fraction of, when that is not the box's own.
   *
   * Исторически это был костыль под образец 44 юнита шириной; сам пикер теперь рисует образцы в
   * честном 200-юнитовом боксе и параметр не передаёт. Он оставлен, потому что контракт публичный
   * и потому что довод не исчез: вес и ритм — свойство ЧЕРТЕЖА, а не коробки, в которую его
   * вписали, и поверхность, рисующая штрих в чужом масштабе, обязана уметь об этом сказать.
   */
  scaleRef = w,
): StrokeGeometry {
  // SCALED COORDINATES ARE ROUNDED BEFORE THEY BECOME A PATH, and that is not cosmetic. `inkPath`
  // formats whatever it is given, and a stored 0.35 times a box height of 12 is the float
  // 4.199999999999999 — seventeen significant digits in the `d` attribute of every segment. On a
  // downloaded SVG with a few hundred points that is a threefold file for no drawn difference, and
  // it is the same species of waste the annotation layer was bitten by with exponent-bearing
  // coordinates. Two decimals of a box unit is a hundredth of a pixel on any box this draws into.
  const q = q2;
  const pts: ShapePoint[] = stroke.pts.map(([x, y]) => ({ x: q(x * w), y: q(y * h) }));
  // ONE PATH, TWO GRAMMARS, AND THE STITCH DOES NOT KNOW WHICH. Everything below this line —
  // weights, dash rhythms, the wave of a zigzag, the second row of a two-needle machine — is
  // stated about the PATH and not about its segments, so all nine machine kinds behave on a cubic
  // exactly as they do on a polyline. That is why the curve arrived here rather than being
  // flattened before this point.
  const segs = hasSegments(stroke)
    ? stroke.segs.map((c) =>
        c ? ([q(c[0] * w), q(c[1] * h), q(c[2] * w), q(c[3] * h)] as CubicSeg) : null,
      )
    : null;
  // ДВЕ ВЕЛИЧИНЫ В ЮНИТАХ КОРОБКИ, И РОВНО ЗДЕСЬ ПРОХОДИТ ГРАНИЦА МЕЖДУ НИМИ — ПО ОСИ (X-8, Y-5).
  //  `G` — ТОЛЩИНА НИТИ. Ею меряется ширина линии И ВСЁ ПОПЕРЁК неё: амплитуда волны, зазор между
  //        рядами, вылет зубца гребёнки. Всё это — размеры машины, а не настройки стежка.
  //  `S` — ДЛИНА СТЕЖКА. Ею меряется ВСЁ ВДОЛЬ линии: период строчки, длина волны, шаг гребёнки,
  //        длина пролёта потайного, ритм построительного пунктира.
  // Каждое произведение ниже подписано осью, и подпись — не украшение: перепутанная ось это и есть
  // дефект Y-5, при котором регулятор длины раздувал шов поперёк в двадцать с лишним раз.
  // У штриха, который не назвал `step`, `strokeStep` тождественно равен `strokeGauge`, поэтому
  // `S === G` и каждое произведение ниже — то самое число, что и до разделения ручек.
  const G = (strokeGauge(stroke) / GAUGE_REF) * scaleRef;
  const S = (strokeStep(stroke) / GAUGE_REF) * scaleRef;
  const plainD = () => (segs ? curvePath(pts, segs) : inkPath(pts));

  // Фигурные швы строятся по флэттену; гладкий `plain` держит точный `C`-путь. Пустая строка от
  // генератора означает «линия короче одной внятной фигуры» — тогда шов честно рисуется прямой,
  // а не половиной пика, которую глаз прочтёт как дрогнувшую руку.
  let d = '';
  let widthK = 1;
  switch (stroke.brush) {
    case 'zigzag':
      //                              период ВДОЛЬ ─┐        ┌─ размах ПОПЕРЁК
      d = wavePath(flatPoly(pts, segs), ZIG.wl * S, ZIG.amp * G);
      break;
    case 'bartack': {
      // Закрепка — брусок плотных стежков. Плотная волна даёт ему фактуру; отрезок короче
      // полутора волн остаётся прежним жирным штрихом (старый вид, прежний коэффициент).
      d = wavePath(flatPoly(pts, segs), BART.wl * S, BART.amp * G);
      widthK = d ? BART.widthK : 2.4;
      break;
    }
    case 'lock':
      // 301 — ОДИН ряд настоящих стежков. Раньше здесь был `dasharray` по гладкой линии.
      d = stitchPath(flatPoly(pts, segs), LOCK.pitch * S, LOCK.duty);
      break;
    case 'double':
      //                                  зазор ПОПЕРЁК ─┐              ┌─ шаг прокола ВДОЛЬ
      d = stitchedRails(flatPoly(pts, segs), RAIL_GAP * G, LOCK.pitch * S, LOCK.duty);
      break;
    case 'cover':
      // 406 — те же два ряда стежков, но иглы стоят шире: см. довод у COVER_GAP.
      d = stitchedRails(flatPoly(pts, segs), COVER_GAP * G, LOCK.pitch * S, LOCK.duty);
      break;
    case 'flatlock': {
      const flat = flatPoly(pts, segs);
      // Оба поперечных размера — от НИТИ, и это одно число, а не два: амплитуда петлителей обязана
      // ровно упираться в рельсы, иначе внутренний зигзаг либо не достаёт до них, либо выходит
      // наружу и флэтлок перестаёт читаться как шов между двумя строчками.
      const rails = railsPath(flat, RAIL_GAP * G);
      const inner = wavePath(flat, FLAT_ZIG_WL * S, (RAIL_GAP / 2) * G);
      d = rails && inner ? `${rails} ${inner}` : rails;
      break;
    }
    case 'overlock': {
      //                                     шаг зубца ВДОЛЬ ─┐            ┌─ вылет ПОПЕРЁК
      const ticks = tickPath(flatPoly(pts, segs), OVER.spacing * S, OVER.tick * G);
      const rail = plainD();
      d = ticks && rail ? `${rail} ${ticks}` : rail;
      break;
    }
    case 'blind':
      //                             период и пролёт ВДОЛЬ ─┐                      ┌─ укол ПОПЕРЁК
      d = blindPath(flatPoly(pts, segs), BLIND.period * S, BLIND.dip * S, BLIND.amp * G);
      break;
    default:
      break;
  }
  if (!d) d = plainD();

  // ЕДИНСТВЕННЫЙ ОСТАВШИЙСЯ ПУНКТИР — построительная линия. Ритм шва больше не подделывается
  // заливкой: у всех девяти видов он теперь настоящая геометрия.
  const rhythm = stroke.dashed ? CONSTRUCTION_DASH : null;
  return {
    d,
    strokeWidth: G * widthK,
    dash: rhythm ? `${(rhythm[0] * S).toFixed(2)} ${(rhythm[1] * S).toFixed(2)}` : '',
    // ВСЕГДА [0]: вторые ряды теперь лежат в самом `d`, вдоль линии, а не копией со сдвигом по Y.
    // Поле живёт, чтобы ни одному из четырёх потребителей не пришлось меняться вместе с этим
    // модулем, — их цикл по offsets исполняется ровно один раз.
    offsets: [0],
  };
}

/**
 * The whole layer as SVG markup, for the download and for the raster.
 *
 * `<image>` REFERENCES the base rather than embedding it, and that is stated on the panel next to
 * the button. Embedding would mean fetching the bytes through the CORS proxy and inlining a
 * multi-megabyte data URI into a file whose whole purpose is to be opened in a vector editor — and
 * the base is a TRACING SHEET that the round trip ignores on the way back anyway.
 */
export function layerSvg(
  strokes: VectorStroke[],
  opts: { width: number; height: number; baseHref?: string },
): string {
  const { width: w, height: h, baseHref } = opts;
  // BOTH SPELLINGS OF THE REFERENCE. `href` is SVG 2 and is what every browser reads; `xlink:href`
  // is SVG 1.1 and is what several versions of Illustrator still read, and this file exists to be
  // opened in Illustrator. Emitting one of the two is how the raster silently fails to appear in
  // exactly the application the round trip is for.
  const image = baseHref
    ? `<image href="${escapeXml(baseHref)}" xlink:href="${escapeXml(baseHref)}"` +
      ` x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    : '';
  const paths = strokes
    .map((s) => {
      const g = strokeGeometry(s, w, h);
      if (!g.d) return '';
      const dash = g.dash ? ` stroke-dasharray="${g.dash}"` : '';
      // ЦВЕТ НИТИ ЕДЕТ В ФАЙЛ. Прежде здесь стоял литерал `#000`, и цвет, видимый на экране,
      // терялся ровно в том файле, ради которого весь круговорот и существует.
      const ink = readInk(s.ink) ?? DEFAULT_INK;
      return g.offsets
        .map(
          (dy) =>
            `<path d="${g.d}" transform="translate(0 ${dy.toFixed(2)})" fill="none" stroke="${ink}"` +
            ` stroke-width="${g.strokeWidth.toFixed(2)}" stroke-linecap="round"` +
            ` stroke-linejoin="round"${dash}/>`,
        )
        .join('');
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${image}` +
    `<g id="vector">${paths}</g></svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
