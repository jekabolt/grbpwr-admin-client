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

export type KindDef = {
  key: AnnotationKindKey;
  /** Сколько якорей: [минимум, максимум]. Это правило ПОСТАНОВКИ. */
  points: [number, number];
  label: string;
  hint: string;
  grammar: PlacementGrammar;
  /** Показывать чипом в панели. `multi` — нет: он получается правкой «подписи». */
  inPalette: boolean;
  /** Пунктир имеет смысл: у фигуры есть СВОЙ штрих, а не только лидер. */
  dashable: boolean;
  /** Есть площадь, которую можно заштриховать. */
  fillable: boolean;
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
    key: 'pin',
    points: [1, 1],
    label: 'pin',
    hint: 'a numbered point — the text is read in the legend under the picture',
    grammar: 'click',
    inPalette: true,
    dashable: false,
    fillable: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    key: 'label',
    points: [1, 1],
    label: 'label',
    hint: 'a point and a label on an arrow',
    grammar: 'click',
    inPalette: true,
    dashable: false,
    fillable: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    key: 'dim',
    points: [2, 2],
    label: 'dimension',
    hint: 'two points, a dimension line with ticks — “measure along this”',
    grammar: 'click',
    inPalette: true,
    dashable: true,
    fillable: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    key: 'bracket',
    points: [2, 2],
    label: 'span',
    hint: 'two points, a bracket over the segment — “across this span”',
    grammar: 'click',
    inPalette: true,
    dashable: true,
    fillable: false,
    sticky: false,
    plateWhenEmpty: true,
    handles: true,
  },
  {
    key: 'arc',
    points: [3, 3],
    label: 'arc',
    hint: 'start → end → drag the bend: sleeve cap ease, a rounded front edge, the run of a stitch line',
    grammar: 'arc',
    inPalette: true,
    dashable: true,
    fillable: false,
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
    dashable: true,
    fillable: true,
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
    dashable: true,
    fillable: false,
    sticky: true,
    plateWhenEmpty: false,
    // Правка вершин каракули — отрицательная ценность: перерисовать дешевле, чем поправить
    // сорок точек. Штрих таскается целиком и удаляется.
    handles: false,
  },
  {
    // МУЛЬТИЛИДЕР ОСТАЁТСЯ ОТДЕЛЬНЫМ ЧИПОМ, хотя от «подписи» его отличает только счётчик якорей.
    //
    // Проектировался он иначе: один вид «подпись», а вторая стрелка добавляется правкой уже
    // поставленной. Но добавлять якорь ПОСТАВЛЕННОЙ фигуре нечем — ручки-призраки есть только у
    // зоны, где их рождают рёбра, а у подписи рёбер нет. Без своего чипа «одна подпись к трём
    // местам» стала бы НЕВЫРАЗИМОЙ, и панель обещала бы подсказкой то, чего нет.
    //
    // Вернуть чип честнее, чем оставить обещание: слияние видов стоит ровно один чип, а
    // потерянная возможность — целый жест.
    key: 'multi',
    points: [2, 8],
    label: 'multileader',
    hint: 'one label for several places — from 2 to 8 points, “done” ends it sooner',
    grammar: 'click',
    inPalette: true,
    dashable: false,
    fillable: false,
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

/** Виды в порядке показа в панели. */
export const PALETTE_KINDS: KindDef[] = DEFS.filter((d) => d.inPalette);

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
 */
export function placingHint(kind: string, placed: number): string {
  const d = kindDef(kind);
  const [min, max] = d.points;
  if (d.grammar === 'ink') {
    // Счётчик здесь — ЧИСЛО ЗАКОНЧЕННЫХ ШТРИХОВ сессии, а не якорей: у следа якоря считает рука,
    // и «поставлено 137 точек» ничего не сообщает тому, кто рисует.
    return placed > 0
      ? `${placed} ${placed === 1 ? 'stroke' : 'strokes'} in this callout — Enter or “done” starts a new one`
      : 'press and drag — strokes keep filling the same callout';
  }
  if (d.grammar === 'arc') {
    return (
      ['click the start of the arc', 'click the end of the arc', 'drag the bend and click'][
        placed
      ] ?? 'click the bend'
    );
  }
  if (d.grammar === 'polygon') {
    if (placed === 0) return 'click along the border of the area';
    if (placed < min) return `at least ${min} points needed — ${placed} placed`;
    return `close it on the first point or press Enter — ${placed} placed`;
  }
  if (max === 1) return 'click a point on the picture';
  if (min === max) return `click ${max} points — ${placed} placed`;
  return `click points (from ${min} to ${max}) — ${placed} placed`;
}
