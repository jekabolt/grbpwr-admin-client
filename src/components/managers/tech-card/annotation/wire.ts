import type {
  common_TechCardAnnotationColor,
  common_TechCardAnnotationKind,
} from 'api/proto-http/admin';

import {
  ANNOTATION_CAPS_KEYS,
  ANNOTATION_COLOR_KEYS,
  ANNOTATION_KIND_KEYS,
  type AnnotationCapsKey,
  type AnnotationColorKey,
  type AnnotationKindKey,
} from './kinds';

// ВИД, ЦВЕТ И НАКОНЕЧНИК УКАЗАНИЯ: ПРОВОД ↔ ФОРМА. Один словарь на всех владельцев.
//
// Жил в схеме тех-карты, пока владелец был один. Теперь указания рисуют и на вложениях задачи —
// теми же видами, тем же жестом и той же поверхностью (см. довод у `common_TaskMediaAnnotations`:
// примитив указания в системе ОДИН). Вторая копия этих таблиц означала бы, что добавленный вид
// приезжает на снимок узла и не приезжает на вложение — молча, потому что незнакомый ключ здесь по
// правилу становится пином, а не ошибкой.
//
// ЖИВЁТ РЯДОМ С РЕЕСТРОМ (`kinds.ts`), а не в домене: ключи формы объявлены там, и словарь провода
// типизирован ИМИ — забытая строка это ошибка компиляции, а не пустое место на экране.

/**
 * Вид выноски: провод ↔ форма. Неизвестное значение с провода становится пином, а не пустотой:
 * снимок с выноской неизвестного вида должен показать хоть что-то в том месте, где технолог её
 * поставил, — потерянная точка хуже неточной фигуры.
 */
const ANNOTATION_KIND_WIRE: Record<AnnotationKindKey, string> = {
  pin: 'TECH_CARD_ANNOTATION_KIND_PIN',
  label: 'TECH_CARD_ANNOTATION_KIND_LABEL',
  dim: 'TECH_CARD_ANNOTATION_KIND_DIM',
  bracket: 'TECH_CARD_ANNOTATION_KIND_BRACKET',
  multi: 'TECH_CARD_ANNOTATION_KIND_MULTI',
  arc: 'TECH_CARD_ANNOTATION_KIND_ARC',
  polygon: 'TECH_CARD_ANNOTATION_KIND_POLYGON',
  ink: 'TECH_CARD_ANNOTATION_KIND_INK',
};
const ANNOTATION_KIND_FORM = Object.fromEntries(
  Object.entries(ANNOTATION_KIND_WIRE).map(([k, v]) => [v, k as AnnotationKindKey]),
) as Record<string, AnnotationKindKey>;

export const annotationKindFromWire = (v?: string): AnnotationKindKey =>
  ANNOTATION_KIND_FORM[v ?? ''] ?? 'pin';
export const annotationKindToWire = (v?: AnnotationKindKey): common_TechCardAnnotationKind =>
  (ANNOTATION_KIND_WIRE[v ?? 'pin'] ?? ANNOTATION_KIND_WIRE.pin) as common_TechCardAnnotationKind;

const ANNOTATION_COLOR_WIRE: Record<string, string> = {
  red: 'TECH_CARD_ANNOTATION_COLOR_RED',
  blue: 'TECH_CARD_ANNOTATION_COLOR_BLUE',
  green: 'TECH_CARD_ANNOTATION_COLOR_GREEN',
  orange: 'TECH_CARD_ANNOTATION_COLOR_ORANGE',
  white: 'TECH_CARD_ANNOTATION_COLOR_WHITE',
};
const ANNOTATION_COLOR_FORM = Object.fromEntries(
  Object.entries(ANNOTATION_COLOR_WIRE).map(([k, v]) => [v, k as AnnotationColorKey]),
) as Record<string, AnnotationColorKey>;

export const annotationColorFromWire = (v?: string): AnnotationColorKey =>
  ANNOTATION_COLOR_FORM[v ?? ''] ?? '';
export const annotationColorToWire = (v?: AnnotationColorKey): common_TechCardAnnotationColor =>
  (v
    ? ANNOTATION_COLOR_WIRE[v]
    : 'TECH_CARD_ANNOTATION_COLOR_UNKNOWN') as common_TechCardAnnotationColor;

// ── НАКОНЕЧНИКИ (круг 18, D-19/D-20) ────────────────────────────────────────────────────────────
//
// ПОЛЕ `caps` НА ПРОВОДЕ ЕСТЬ (сервер 46100a5, зеркало 602c5f1, бета). Это зеркало писалось до
// него, под предсказанный контракт; предсказание сошлось с генератором дословно, и союз ниже
// объявлен литеральным ровно затем, чтобы расхождение имён падало на `tsc`, а не на провод.
//
// ГЕНЕРАТОР ОБЪЯВЛЯЕТ ПОЛЕ ОБЯЗАТЕЛЬНЫМ (`caps: TechCardAnnotationCaps | undefined`), поэтому
// `annotationCapsOut` отдаёт его НЕ опциональным: спред объекта с опциональным ключом обязательное
// поле не удовлетворяет, и запись молча перестала бы собираться там, где сегодня собирается.
//
// ПУСТО — НЕ «БЕЗ НАКОНЕЧНИКОВ», А «ПО ВИДУ»: сервер раскрывает UNSPECIFIED по ключу вида
// (dim → засечки, bracket → скобки, arc → без) и хранит пустым. Отсюда свойство, ради которого
// пара «вид + caps» и заведена: карточка с мерками и скобами, прочитанная и записанная без правок,
// уезжает байт в байт и подпись секции DESIGN не сдвигает.
//
// ЧТЕНИЕ ОСТАЁТСЯ «ЕСЛИ ЕСТЬ» (`readAnnotationCaps`): в ответ приезжают и строки, записанные до
// контракта, и `null` у незаполненного поля (сервер эмитит с EmitUnpopulated). Отсутствие и
// незнакомое значение читаются одинаково — «не задано».

export type AnnotationCapsWire =
  | 'TECH_CARD_ANNOTATION_CAPS_UNSPECIFIED'
  | 'TECH_CARD_ANNOTATION_CAPS_TICK'
  | 'TECH_CARD_ANNOTATION_CAPS_BRACKET'
  | 'TECH_CARD_ANNOTATION_CAPS_BULLET'
  | 'TECH_CARD_ANNOTATION_CAPS_ARROW';

const ANNOTATION_CAPS_WIRE: Record<AnnotationCapsKey, AnnotationCapsWire> = {
  '': 'TECH_CARD_ANNOTATION_CAPS_UNSPECIFIED',
  tick: 'TECH_CARD_ANNOTATION_CAPS_TICK',
  bracket: 'TECH_CARD_ANNOTATION_CAPS_BRACKET',
  bullet: 'TECH_CARD_ANNOTATION_CAPS_BULLET',
  arrow: 'TECH_CARD_ANNOTATION_CAPS_ARROW',
};
const ANNOTATION_CAPS_FORM = Object.fromEntries(
  Object.entries(ANNOTATION_CAPS_WIRE).map(([k, v]) => [v, k as AnnotationCapsKey]),
) as Record<string, AnnotationCapsKey>;

/** Незнакомое (провод новее клиента) и отсутствующее читаются одинаково — «не задано». */
export const annotationCapsFromWire = (v?: string | null): AnnotationCapsKey =>
  ANNOTATION_CAPS_FORM[v ?? ''] ?? '';

export const annotationCapsToWire = (v?: string | null): AnnotationCapsWire => {
  // Нормализуется до индексации: `undefined` (поле формы не задано) проходил проверку через
  // `?? ''`, но индексировал словарь собой — и на провод уезжало `caps: undefined`, то есть
  // ничего, вопреки правилу «поле шлётся всегда» (замерено пробой круга 18).
  const k = v ?? '';
  return ANNOTATION_CAPS_WIRE[
    (ANNOTATION_CAPS_KEYS as readonly string[]).includes(k) ? (k as AnnotationCapsKey) : ''
  ];
};

/** Чтение с объекта провода: поля может не быть вовсе, а может приехать явный `null`. */
export const readAnnotationCaps = (a: object): AnnotationCapsKey =>
  annotationCapsFromWire((a as { caps?: string | null }).caps);

/**
 * ПОЛЕ ШЛЁТСЯ ВСЕГДА, включая «не задано», — тем же правилом, что и вид: присутствие поля есть
 * заявление «этот клиент про наконечники знает». Промолчать, выбрав засечки после стрелок, значило
 * бы оставить серверу стрелки.
 *
 * Ключ НЕ опциональный: генератор объявил поле обязательным, и спред `{ caps?: … }` его бы не
 * удовлетворил. Остаётся спредом (а не прямым `caps:`) затем, что вызывающие строят объект
 * литералом, и один спред у них уже стоит.
 */
export const annotationCapsOut = (v?: string | null): { caps: AnnotationCapsWire } => ({
  caps: annotationCapsToWire(v),
});

// Реэкспорт ключей — чтобы владельцу указаний хватало ОДНОГО импорта на «какие бывают виды,
// цвета и наконечники и как они называются на проводе».
export { ANNOTATION_CAPS_KEYS, ANNOTATION_COLOR_KEYS, ANNOTATION_KIND_KEYS };
export type { AnnotationCapsKey, AnnotationColorKey, AnnotationKindKey };
