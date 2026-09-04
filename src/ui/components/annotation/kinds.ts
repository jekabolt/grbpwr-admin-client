// РЕЕСТР ВИДОВ УКАЗАНИЯ — единственный источник правды о том, что такое вид.
//
// Вид определяет ВСЁ остальное: сколько якорей, каким жестом они ставятся, что рисуется, можно ли
// это пунктирить и заштриховывать, показывать ли пустую плашку. Раньше эти сведения лежали в
// четырёх словарях в трёх файлах (`ANNOTATION_POINTS` в схеме, `KIND_LABEL`/`KIND_HINT` в холсте,
// `CALLOUT_KINDS` во вкладке эскиза), и каждый из них индексировался НАПРЯМУЮ. Отсюда и класс
// ошибок «undefined is not an object»: словарь, у которого нет строки на пришедший ключ, роняет
// экран целиком вместо того, чтобы нарисовать хоть что-то.
//
// Поэтому доступ здесь ТОТАЛЬНЫЙ: `kindDef` не возвращает undefined никогда. Незнакомый вид с
// провода становится пином — потерянная точка хуже неточной фигуры, и ровно это правило уже
// записано в мапперах схемы.
//
// РЕЕСТР ЖИВЁТ В `ui/`, А НЕ В ДОМЕНЕ. «У мерки две точки» — знание ОТРИСОВКИ И ЖЕСТА, а не
// карточки: им одинаково пользуются снимок шага, эскиз, мудборд и примерка. Доменная схема
// (`schema.ts`) зеркалит этот реестр в zod и в провод, а не наоборот.

export type PlacementGrammar =
  /** Каждый клик — якорь; фигура готова, когда набран максимум (или нажато «готово»). */
  | 'click'
  /** Начало → конец → изгиб живьём за курсором. Порядок кликов НЕ равен порядку хранения. */
  | 'arc'
  /** Клики-вершины с резиновой линией; замыкание о первую точку. */
  | 'polygon'
  /** Зажать и вести: один штрих — одно указание. */
  | 'ink';

/**
 * ПОРЯДОК И СОСТАВ ВИДОВ — ОДНИМ КОРТЕЖЕМ. Он же типизирует zod-схему карточки (`schema.ts`
 * импортирует именно его), поэтому добавленный сюда вид немедленно становится обязательным во всех
 * словарях ниже: пропущенная строка — ошибка компиляции, а не пустое место на экране.
 *
 * ЭТО ВИДЫ ХРАНЕНИЯ, А НЕ ЧИПЫ ПАЛИТРЫ. С круга 18 (D-19) `dim` и `bracket` — две записи ОДНОГО
 * инструмента «line», различающиеся наконечником (см. `capsStorage`). Снять любую из них отсюда
 * значило бы сузить провод: все уже сохранённые мерки и скобы стали бы пинами по правилу
 * «незнакомый вид становится пином».
 */
export const ANNOTATION_KIND_KEYS = [
  'pin',
  'label',
  'dim',
  'bracket',
  'multi',
  'arc',
  'polygon',
  'ink',
] as const;
export type AnnotationKindKey = (typeof ANNOTATION_KIND_KEYS)[number];

/**
 * НАКОНЕЧНИКИ — концы линии и кривой (круг 18, D-19/D-20).
 *
 * Пустой ключ — «не задано», и на проводе это `CAPS_UNSPECIFIED` (или поле, которого нет вовсе):
 * фигура рисуется ТАК, КАК РИСОВАЛАСЬ ДО КРУГА 18 — мерка засечками, скоба скобой, кривая без
 * наконечников (см. `effectiveCaps`). Это и есть правило совместимости: ни одно уже сохранённое
 * указание не меняет вида, потому что у него ключа нет.
 *
 * Два из четырёх наконечников УЖЕ БЫЛИ видами хранения — засечки это `dim`, скоба это `bracket`.
 * Поэтому выбранный наконечник у линии уезжает на провод не одним полем, а ПАРОЙ «вид + caps»
 * (`capsStorage`): засечки → `dim`, скоба → `bracket`, точки и стрелки → `dim` плюс `caps`.
 * Так старый сервер, не знающий поля `caps`, теряет ровно стиль конца, а не фигуру.
 */
export const ANNOTATION_CAPS_KEYS = ['', 'tick', 'bracket', 'bullet', 'arrow'] as const;
export type AnnotationCapsKey = (typeof ANNOTATION_CAPS_KEYS)[number];

export type KindDef = {
  key: AnnotationKindKey;
  /** Сколько якорей: [минимум, максимум]. Это правило ПОСТАНОВКИ. */
  points: [number, number];
  label: string;
  hint: string;
  grammar: PlacementGrammar;
  /**
   * Показывать чипом в панели. Мимо палитры идут виды ХРАНЕНИЯ, а не жеста: `pin` (то же, что
   * записка, только текст читается легендой), `multi` (та же записка, которой добавили лучей) и
   * `bracket` (та же линия, которой выбрали скобу наконечником). Палитра называет ЖЕСТЫ, а не
   * строки таблицы.
   */
  inPalette: boolean;
  /**
   * ЧИП ПАЛИТРЫ, КОТОРЫМ СТАВИТСЯ ЭТОТ ВИД ХРАНЕНИЯ. У всех видов это они сами; у скобы — линия.
   * Панель, получившая явный список видов, сводит его к чипам ИМЕННО ЭТИМ полем: список
   * `['dim', 'bracket']` даёт один чип «line», а не два одинаковых.
   */
  tool: AnnotationKindKey;
  /** Пунктир имеет смысл: у фигуры есть СВОЙ штрих, а не только лидер. */
  dashable: boolean;
  /** Есть площадь, которую можно заштриховать. */
  fillable: boolean;
  /** У фигуры два конца, которым выбирают наконечник (D-19/D-20). */
  capped: boolean;
  /** Инструмент остаётся включённым после постановки — штрихуют сериями. */
  sticky: boolean;
  /** Рисовать плашку, даже когда текст пуст. У фигур-областей пустая плашка — мусор. */
  plateWhenEmpty: boolean;
  /** Ручки правки якорей. У свободного следа их нет: вершинная правка каракули бессмысленна. */
  handles: boolean;
};

/**
 * ПОТОЛКИ ЧИСЛА ТОЧЕК ЗДЕСЬ ЖЁСТЧЕ СЕРВЕРНЫХ, И ЭТО НАМЕРЕННО. Сервер хранит до 40 вершин у
 * полигона и до 200 точек у следа — это потолок ХРАНЕНИЯ, за которым JSON-колонка начинает возить
 * лишнее. Здесь стоит потолок ЧИТАЕМОСТИ: контур по двадцати углам на печати уже сливается, а
 * след, прореженный до 64 точек, неотличим от сырого. Данные, пришедшие с провода с бо́льшим
 * числом точек (клон сезона, ручная правка), рисуются как есть — правило постановки к чтению
 * отношения не имеет.
 */
const DEFS: KindDef[] = [
  {
    // ПИН БОЛЬШЕ НЕ СТАВЯТ РУКОЙ — И ЭТО СЛОВА ВЛАДЕЛЬЦА: «пин в принципе можно убрать тк это
    // тоже самое что и label». В палитре он и правда был вторым именем одного жеста: щёлкни по
    // месту и напиши, что там. Разница — только в том, ГДЕ потом читается текст (легендой под
    // кадром против плашки на кадре), а этого в чипе не видно вовсе, и выбирать между ними
    // приходилось наугад.
    //
    // ИЗ РЕЕСТРА ОН НЕ УХОДИТ, И ЭТО НЕСУЩЕЕ. Пин — вид ХРАНЕНИЯ: им записаны все нумерованные
    // точки живых карточек, на них по номеру ссылаются деталь кроя, операция и дефект, их печатает
    // тех-пак легендой. Снять его из `ANNOTATION_KIND_KEYS` значило бы сузить zod-энум и провод,
    // то есть сделать сохранённую карточку нечитаемой — цена, которой владелец не просил. Уходит
    // ровно чип: `inPalette: false`.
    key: 'pin',
    points: [1, 1],
    label: 'pin',
    hint: 'a numbered point — the text is read in the legend under the picture',
    grammar: 'click',
    inPalette: false,
    tool: 'pin',
    dashable: false,
    fillable: false,
    capped: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    // ЕДИНСТВЕННЫЙ СПОСОБ СКАЗАТЬ СЛОВАМИ «ВОТ ЗДЕСЬ». Один клик — одна записка со стрелкой, жест
    // кончается сам. Указать ею на ВТОРОЕ место можно правкой уже поставленной (`+ point` в
    // редакторе), и хранится такая записка как `multi` — счётчик, а не второй вид.
    key: 'label',
    points: [1, 1],
    label: 'note',
    hint: 'a note on an arrow — one click puts it; “+ point” makes it point at more places',
    grammar: 'click',
    inPalette: true,
    tool: 'label',
    dashable: false,
    fillable: false,
    capped: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    // ЛИНИЯ — ОДИН ИНСТРУМЕНТ НА МЕСТЕ ДВУХ. Слова владельца (D-19): «DIMENSION и SPAN в колаутах
    // должны заменится на line и виды наконечников можно будет менять в меню колаута». Мерка и
    // скоба различались только концами: засечки против ножек, — то есть чип называл наконечник,
    // а не жест. Теперь жест один (две точки), а наконечник выбирают в редакторе поставленной
    // линии; засечки остаются умолчанием, потому что так рисовалась мерка до слияния.
    //
    // КЛЮЧ ХРАНЕНИЯ ОСТАЁТСЯ `dim`, ярлык — «line». Переименовать ключ значило бы переименовать
    // провод, а провод старые карточки уже несут.
    key: 'dim',
    points: [2, 2],
    label: 'line',
    hint: 'two points; ticks, a bracket, dots or arrows at the ends are chosen in the editor — hold Shift for 0° · 45° · 90°',
    grammar: 'click',
    inPalette: true,
    tool: 'dim',
    dashable: true,
    fillable: false,
    capped: true,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    // СКОБА — ВИД ХРАНЕНИЯ ЛИНИИ СО СКОБОЙ НА КОНЦАХ. Своего чипа у неё больше нет: её ставят
    // чипом «line» и выбирают наконечник «bracket» (`capsStorage`). Ключ на проводе живёт, потому
    // что им записаны все скобы живых карточек.
    key: 'bracket',
    points: [2, 2],
    label: 'line',
    hint: 'a line with a bracket at the ends — “across this span”',
    grammar: 'click',
    inPalette: false,
    tool: 'dim',
    dashable: true,
    fillable: false,
    capped: true,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    // КРИВАЯ — прежняя «arc» (D-20: «arc переименуем в curve»). Ключ хранения и провода не
    // тронут; переименован ярлык. Наконечники — те же четыре, что у линии, плюс «plain»: кривая
    // без концов рисовалась до круга 18 и остаётся умолчанием.
    key: 'arc',
    points: [3, 3],
    label: 'curve',
    hint: 'start → end → drag the bend: sleeve cap ease, a rounded front edge, the run of a stitch line — hold Shift for 0° · 45° · 90°',
    grammar: 'arc',
    inPalette: true,
    tool: 'arc',
    dashable: true,
    fillable: false,
    capped: true,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    key: 'polygon',
    points: [3, 20],
    label: 'zone',
    hint: 'trace the area point by point and close it on the first one — a flaw, fusing, topstitching',
    grammar: 'polygon',
    inPalette: true,
    tool: 'polygon',
    dashable: true,
    fillable: true,
    capped: false,
    sticky: false,
    // Пустая плашка у зоны — прямоугольник «—» посреди снимка: контур уже сказал «вот здесь»,
    // и добавить к этому нечего, пока текста нет.
    plateWhenEmpty: false,
    handles: true,
  },
  {
    key: 'ink',
    // ДВЕСТИ — ЭТО ЗЕРКАЛО СЕРВЕРНОГО ПРЕДЕЛА, А НЕ ВКУС.
    //
    // `internal/entity/techcard.go`, `PointsAllowed()`: `case AnnotationKindInk: return 2, 200`.
    // Выйти за него значит получить `FieldViolation(".points", "wrong_count")` и отказ сохранения
    // ВСЕЙ карточки — не «след обрежется», а «карточка не сохранилась». `tsc` этого не ловит:
    // число живёт здесь, а проверка на сервере. Поднимать выше 200 нельзя, не подняв сперва
    // серверный предел; понижать можно, но незачем — теперь одна выноска несёт всю серию штрихов
    // (см. дублированную точку в `geometry.ts`), и прежних 64 на серию не хватало.
    points: [2, 200],
    label: 'freehand',
    hint: 'press and drag; strokes keep filling the same callout — Enter or “done” starts a new one',
    grammar: 'ink',
    inPalette: true,
    tool: 'ink',
    dashable: true,
    fillable: false,
    capped: false,
    sticky: true,
    plateWhenEmpty: false,
    // Правка вершин каракули — отрицательная ценность: перерисовать дешевле, чем поправить
    // сорок точек. Штрих таскается целиком и удаляется.
    handles: false,
  },
  {
    // МУЛЬТИЛИДЕРА В ПАЛИТРЕ БОЛЬШЕ НЕТ. Слова владельца: «мультилидер какая то хуйня, там
    // почему-то всегда 7 направляющих и не понятно как этим пользоваться, просто растыкиваешь
    // там всё».
    //
    // ОН БЫЛ ЕДИНСТВЕННЫМ ВИДОМ БЕЗ ЕСТЕСТВЕННОГО КОНЦА. Постановка кончалась либо на ВОСЬМОМ
    // клике (потолок), либо нажатием чипа «done · N» — ряда под кадром, который появляется только
    // во время жеста и которого никто не искал. Поэтому каждая поставленная мультивыноска
    // получала максимум лучей: не потому что их столько нужно, а потому что раньше жест не
    // заканчивался. Плюс превью врало: пока ставишь, рисуется ЛОМАНАЯ по кликам, а получается
    // ВЕЕР от плашки — то есть картинка на экране и результат были разными фигурами.
    //
    // ТЕПЕРЬ ЛУЧ ДОБАВЛЯЮТ ПО ОДНОМУ, УЖЕ ПОСТАВЛЕННОЙ ЗАПИСКЕ («+ point»). Каждый клик завершён,
    // отменить его нечем, кроме Delete на ручке, и «сколько лучей» перестало быть вопросом,
    // на который отвечают заранее.
    //
    // В 0310 это же слияние было ОТКЛОНЕНО с доводом «добавлять якорь поставленной фигуре нечем:
    // ручки-призраки рождаются рёбрами, а у подписи их нет». Довод верен ровно до тех пор, пока
    // единственный способ добавить якорь — призрак на ребре. Явный орган в редакторе рёбер не
    // требует, и вместе с ним чип становится лишним.
    //
    // ВИД ОСТАЁТСЯ ВИДОМ ХРАНЕНИЯ: `labelKindForPoints` пишет его по числу лучей, живые карточки
    // читаются как читались, провод и zod не тронуты.
    key: 'multi',
    points: [2, 8],
    label: 'note',
    hint: 'a note pointing at several places',
    grammar: 'click',
    inPalette: false,
    tool: 'label',
    dashable: false,
    fillable: false,
    capped: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
];

const BY_KEY = new Map(DEFS.map((d) => [d.key, d]));

/** Пин — фолбэк на всё неизвестное. Существует отдельной константой, чтобы `kindDef` был тотален. */
const PIN = BY_KEY.get('pin') as KindDef;

/**
 * ТОТАЛЬНЫЙ ДОСТУП. Никогда не отдаёт undefined: вид, которого нет в реестре, — это либо провод
 * новее клиента, либо испорченная строка, и в обоих случаях правильный ответ «нарисуй точкой», а
 * не «урони экран». Прямая индексация словарей видов и была источником `undefined is not an
 * object` при работе с мультилидером.
 */
export function kindDef(kind: string | null | undefined): KindDef {
  return (kind ? BY_KEY.get(kind as AnnotationKindKey) : undefined) ?? PIN;
}

/** Виды в порядке показа в панели. Пять жестов: записка, линия, кривая, зона, след. */
export const PALETTE_KINDS: KindDef[] = DEFS.filter((d) => d.inPalette);

/**
 * СКОЛЬКО ЯКОРЕЙ ОБЯЗАНО ОСТАТЬСЯ, когда с фигуры снимают ручку.
 *
 * У всех видов это минимум ПОСТАНОВКИ, и только у записки нет: `multi` требует двух якорей при
 * постановке, но записка с одним лучом — законная фигура, она просто хранится как `label`.
 * Пока пол читался прямо из `points[0]`, добавленный второй луч снять было НЕЧЕМ: Delete на ручке
 * молча ничего не делал, и единственным выходом оставалось удалить записку вместе с текстом.
 */
export function pointsFloor(kind: string): number {
  const d = kindDef(kind);
  return d.key === 'label' || d.key === 'multi' ? 1 : d.points[0];
}

/**
 * Потолок лучей у записки — зеркало серверного предела `multi` (`PointsAllowed()` отдаёт 2..8).
 * Считается по реестру, а не вписан числом: разъехавшись, они дали бы отказ сохранения ВСЕЙ
 * карточки на девятом луче.
 */
export const NOTE_MAX_POINTS = 8;

/**
 * Все известные ключи. Собираются из кортежа, а не из `DEFS`: словарь может ошибиться порядком, а
 * кортеж — источник и того, и другого.
 */
export const ALL_KIND_KEYS: readonly AnnotationKindKey[] = ANNOTATION_KIND_KEYS;

// РЕЕСТР ОБЯЗАН ПОКРЫВАТЬ КОРТЕЖ ЦЕЛИКОМ. Проверка на загрузке модуля, а не в пробе: вид, для
// которого забыли строку, иначе молча стал бы пином на всех четырёх поверхностях сразу.
for (const key of ANNOTATION_KIND_KEYS) {
  if (!BY_KEY.has(key)) throw new Error(`annotation kind registry is missing "${key}"`);
}

/**
 * Вид ХРАНЕНИЯ для подписи по числу якорей. Панель знает один вид «подпись»; провод различает
 * LABEL (одна стрелка) и MULTI (несколько). Различие — счётчик, поэтому его считают, а не
 * спрашивают у человека.
 */
export function labelKindForPoints(count: number): AnnotationKindKey {
  return count > 1 ? 'multi' : 'label';
}

// ── НАКОНЕЧНИКИ ─────────────────────────────────────────────────────────────────────────────────

/** Линия — семейство из двух видов хранения: `dim` и `bracket`. */
export function isLineKind(kind: string | null | undefined): boolean {
  const k = kindDef(kind).key;
  return k === 'dim' || k === 'bracket';
}

/** Незнакомый ключ наконечника (провод новее клиента, порча) читается как «не задано». */
function knownCaps(caps: string | null | undefined): AnnotationCapsKey {
  // Нормализуется ДО проверки и ДО возврата: `undefined` проходил проверку через `?? ''`, а
  // возвращался как есть — и `effectiveCaps('arc', undefined)` отдавал undefined вместо «не
  // задано» (замерено пробой круга 18).
  const c = caps ?? '';
  return (ANNOTATION_CAPS_KEYS as readonly string[]).includes(c) ? (c as AnnotationCapsKey) : '';
}

/**
 * КАКОЙ НАКОНЕЧНИК РИСОВАТЬ — ОДИН ОТВЕТ НА ОТРИСОВКУ, ПОПАДАНИЕ, ЛИДЕР И ПИКЕР.
 *
 * Незаданное (`''`) раскрывается ПО ВИДУ, и ровно так, как фигура рисовалась до круга 18:
 * мерка (`dim`) — засечками, скоба (`bracket`) — скобой, кривая (`arc`) — без наконечников.
 * Заданное — старше вида: `bracket` с `caps: arrow`, приехавший с провода, рисуется стрелками,
 * а не скобой, — данные говорят яснее ключа.
 *
 * Виды без концов (записка, зона, след, пин) наконечников не имеют вовсе, что бы ни лежало в поле.
 */
export function effectiveCaps(
  kind: string | null | undefined,
  caps: string | null | undefined,
): AnnotationCapsKey {
  const k = kindDef(kind).key;
  const c = knownCaps(caps);
  if (k === 'dim') return c || 'tick';
  if (k === 'bracket') return c || 'bracket';
  if (k === 'arc') return c;
  return '';
}

/**
 * КАК ВЫБРАННЫЙ НАКОНЕЧНИК ЗАПИСЫВАЕТСЯ — ПАРОЙ «ВИД ХРАНЕНИЯ + caps».
 *
 * У линии два наконечника из четырёх уже были видами хранения, и запись обязана попадать в них:
 * засечки → `dim` без caps, скоба → `bracket` без caps. Так карточка с мерками и скобами,
 * прочитанная и записанная обратно без единой правки, уходит на провод БАЙТ В БАЙТ такой, какой
 * пришла, — подпись секции не видит правки, которой не было. Точки и стрелки в старых видах не
 * выразимы: они уезжают как `dim` плюс `caps`, и старый сервер, не знающий поля, теряет только
 * стиль конца.
 *
 * У кривой вид один, и caps пишется как выбран; пустой — «без наконечников».
 * Виды без концов пишутся без caps, что бы ни выбрали.
 */
export function capsStorage(
  kind: string | null | undefined,
  caps: string | null | undefined,
): { kind: AnnotationKindKey; caps: AnnotationCapsKey } {
  const d = kindDef(kind);
  const c = knownCaps(caps);
  if (d.key === 'dim' || d.key === 'bracket') {
    // НЕЗАДАННЫЙ НАКОНЕЧНИК ОСТАВЛЯЕТ ВИД, КАКОЙ ДАЛИ. Без этой строки `capsStorage('bracket', '')`
    // отдавала `dim`, то есть ПЕРЕРИСОВЫВАЛА скобу в мерку и двигала подпись секции DESIGN, —
    // ровно то, ради чего пара «вид + caps» и заведена. Сегодня это недостижимо: оба вызывающих
    // либо передают выбранный чипом наконечник (`style-row`), либо вид из палитры, где скобы нет
    // вовсе (`surface`). Но свойство, которое обещает doc-комментарий выше, обязано жить в
    // функции, а не в дисциплине вызывающих: третий вызов появится, и он придёт с хранимой парой.
    if (c === '') return { kind: d.key, caps: '' };
    if (c === 'bracket') return { kind: 'bracket', caps: '' };
    if (c === 'tick') return { kind: 'dim', caps: '' };
    return { kind: 'dim', caps: c };
  }
  if (d.key === 'arc') return { kind: 'arc', caps: c };
  return { kind: d.key, caps: '' };
}

/**
 * Какие наконечники предлагать ЭТОМУ виду. У линии их четыре и «никакого» среди них нет: линия
 * без концов неотличима от штриха следа, а владелец назвал ровно четыре. У кривой добавляется
 * «plain» — так она рисовалась всегда, и лишать её этого значило бы перерисовать живые дуги.
 */
export function capsChoices(kind: string | null | undefined): AnnotationCapsKey[] {
  const k = kindDef(kind).key;
  if (k === 'dim' || k === 'bracket') return ['tick', 'bracket', 'bullet', 'arrow'];
  if (k === 'arc') return ['', 'tick', 'bracket', 'bullet', 'arrow'];
  return [];
}

export const CAPS_LABEL: Record<AnnotationCapsKey, string> = {
  '': 'plain',
  tick: 'tick',
  bracket: 'bracket',
  bullet: 'bullet',
  arrow: 'arrow',
};

export const CAPS_HINT: Record<AnnotationCapsKey, string> = {
  '': 'a bare curve, nothing at the ends',
  tick: 'ticks across both ends — a dimension: “measure along this”',
  bracket: 'a bracket over the ends — “across this span”',
  bullet: 'dots at both ends',
  arrow: 'arrowheads at both ends',
};

/** Цвета указания. Пусто = чернильный, тот же, каким нарисовано всё остальное на листе. */
export const ANNOTATION_COLOR_KEYS = ['', 'red', 'blue', 'green', 'orange', 'white'] as const;
export type AnnotationColorKey = (typeof ANNOTATION_COLOR_KEYS)[number];

export const COLOR_LABEL: Record<string, string> = {
  '': 'ink',
  red: 'red',
  blue: 'blue',
  green: 'green',
  orange: 'orange',
  white: 'white',
};

/**
 * Что делать следующим кликом. Текст зависит и от вида, и от того, сколько точек уже поставлено:
 * «кликните 3 точки» на третьей точке — это подсказка, которая перестала подсказывать.
 *
 * ПРО SHIFT — ТОЛЬКО ТАМ, ГДЕ ОН ЧТО-ТО ДЕРЖИТ (D-17): у линии, кривой и зоны вторая точка
 * ложится на 0° · 45° · 90° от предыдущей, пока клавиша зажата. У записки и следа держать нечего,
 * и упоминать его там значило бы обещать жест, которого нет.
 */
export function placingHint(kind: string, placed: number): string {
  const d = kindDef(kind);
  const [min, max] = d.points;
  const shift = ' · Shift holds 0° · 45° · 90°';
  if (d.grammar === 'ink') {
    // Счётчик здесь — ЧИСЛО ЗАКОНЧЕННЫХ ШТРИХОВ сессии, а не якорей: у следа якоря считает рука,
    // и «поставлено 137 точек» ничего не сообщает тому, кто рисует.
    return placed > 0
      ? `${placed} ${placed === 1 ? 'stroke' : 'strokes'} in this callout — Enter or “done” starts a new one`
      : 'press and drag — strokes keep filling the same callout';
  }
  if (d.grammar === 'arc') {
    return (
      (['click the start of the curve', 'click the end of the curve', 'drag the bend and click'][
        placed
      ] ?? 'click the bend') + (placed > 0 ? shift : '')
    );
  }
  if (d.grammar === 'polygon') {
    if (placed === 0) return 'click along the border of the area';
    if (placed < min) return `at least ${min} points needed — ${placed} placed${shift}`;
    return `close it on the first point or press Enter — ${placed} placed${shift}`;
  }
  if (max === 1) return 'click a point on the picture';
  if (min === max) return `click ${max} points — ${placed} placed${placed > 0 ? shift : ''}`;
  return `click points (from ${min} to ${max}) — ${placed} placed`;
}
