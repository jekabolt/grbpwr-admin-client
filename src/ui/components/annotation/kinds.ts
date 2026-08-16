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

export type KindDef = {
  key: string;
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
    label: 'пин',
    hint: 'точка с номером — текст читается в легенде под снимком',
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
    label: 'подпись',
    hint: 'точка и подпись со стрелкой; ещё стрелки добавляются в правке',
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
    label: 'мерка',
    hint: 'две точки, размерная линия с засечками — «по какому размеру»',
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
    label: 'участок',
    hint: 'две точки, скобка над отрезком — «на этом участке»',
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
    label: 'дуга',
    hint: 'начало → конец → потяните изгиб: посадка оката, скругление борта, ход строчки',
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
    label: 'зона',
    hint: 'обведите область по точкам и замкните о первую — порок, дублирование, настрачивание',
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
    points: [2, 64],
    label: 'маркер',
    hint: 'зажмите и ведите; каждый штрих — отдельное указание',
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
    // МУЛЬТИЛИДЕР НЕ В ПАНЕЛИ, но живёт вечно. Он получается из «подписи» добавлением второй
    // стрелки и уходит обратно при удалении до одной — то есть это не отдельный инструмент, а
    // счётчик якорей у того же вида. Чип для него был седьмым различием, которого рука не делает.
    //
    // Из ЧТЕНИЯ его убрать нельзя ни при каком решении панели: он лежит в данных живых карточек.
    key: 'multi',
    points: [2, 8],
    label: 'подпись',
    hint: 'одна подпись к нескольким местам',
    grammar: 'click',
    inPalette: false,
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
  return (kind && BY_KEY.get(kind)) || PIN;
}

/** Виды в порядке показа в панели. */
export const PALETTE_KINDS: KindDef[] = DEFS.filter((d) => d.inPalette);

/** Все известные ключи — для зеркала в zod. */
export const ALL_KIND_KEYS: string[] = DEFS.map((d) => d.key);

/**
 * Вид ХРАНЕНИЯ для подписи по числу якорей. Панель знает один вид «подпись»; провод различает
 * LABEL (одна стрелка) и MULTI (несколько). Различие — счётчик, поэтому его считают, а не
 * спрашивают у человека.
 */
export function labelKindForPoints(count: number): string {
  return count > 1 ? 'multi' : 'label';
}

/** Цвета указания. Пусто = чернильный, тот же, каким нарисовано всё остальное на листе. */
export const ANNOTATION_COLOR_KEYS = ['', 'red', 'blue', 'green', 'orange', 'white'] as const;
export type AnnotationColorKey = (typeof ANNOTATION_COLOR_KEYS)[number];

export const COLOR_LABEL: Record<string, string> = {
  '': 'чернила',
  red: 'красный',
  blue: 'синий',
  green: 'зелёный',
  orange: 'оранжевый',
  white: 'белый',
};

/**
 * Что делать следующим кликом. Текст зависит и от вида, и от того, сколько точек уже поставлено:
 * «кликните 3 точки» на третьей точке — это подсказка, которая перестала подсказывать.
 */
export function placingHint(kind: string, placed: number): string {
  const d = kindDef(kind);
  const [min, max] = d.points;
  if (d.grammar === 'ink') return 'зажмите и ведите — каждый штрих отдельное указание';
  if (d.grammar === 'arc') {
    return (
      ['кликните начало дуги', 'кликните конец дуги', 'ведите изгиб и кликните'][placed] ??
      'кликните изгиб'
    );
  }
  if (d.grammar === 'polygon') {
    if (placed === 0) return 'кликайте по границе области';
    if (placed < min) return `нужно от ${min} точек — поставлено ${placed}`;
    return `замкните о первую точку или нажмите Enter — поставлено ${placed}`;
  }
  if (max === 1) return 'кликните точку на снимке';
  if (min === max) return `кликните ${max} точки — поставлено ${placed}`;
  return `кликайте точки (от ${min} до ${max}) — поставлено ${placed}`;
}
