import type {
  common_TechCardAnnotationColor,
  common_TechCardAnnotationKind,
} from 'api/proto-http/admin';

import {
  ANNOTATION_COLOR_KEYS,
  ANNOTATION_KIND_KEYS,
  type AnnotationColorKey,
  type AnnotationKindKey,
} from './kinds';

// ВИД И ЦВЕТ УКАЗАНИЯ: ПРОВОД ↔ ФОРМА. Один словарь на всех владельцев.
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

// Реэкспорт ключей — чтобы владельцу указаний хватало ОДНОГО импорта на «какие бывают виды и
// цвета и как они называются на проводе».
export { ANNOTATION_COLOR_KEYS, ANNOTATION_KIND_KEYS };
export type { AnnotationColorKey, AnnotationKindKey };
