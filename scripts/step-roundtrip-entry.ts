// Точка входа пробы «строка шага доезжает целой»: НАСТОЯЩИЕ мапперы карточки, не их копии.
//
// Здесь не переписано ничего из проверяемого. Стенд даёт ровно три рукоятки — «пустой шаг»,
// «форма → провод» и «провод → форма», — и все три ходят через `schema.ts`. Копия маппера в
// пробе доказывала бы только то, что копия согласна сама с собой.
//
// ПУСТОЙ ШАГ БЕРЁТСЯ У МАППЕРА ЧТЕНИЯ, а не выписан константой: `emptyOperation` живёт в
// `operations-field.tsx`, а тащить редактор (React, api, ui) в node-бандл значит проверять
// сборку, а не мапперы. Чтение пустого шага с провода даёт ровно ту же строку формы — и даёт её
// тем же кодом, который правится в этой задаче.
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import type { TechCardSeamWire } from 'lib/seams';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  operationFieldNames,
  techCardDefaultData,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

export type Op = Record<string, unknown>;

export function emptyOp(): Op {
  const form = mapTechCardToForm({
    techCard: { operations: [{}] },
  } as unknown as common_TechCard);
  return (form.operations ?? [])[0] as unknown as Op;
}

export function toWire(ops: Op[], referenceCard?: common_TechCard): common_TechCardInsert {
  const data = {
    ...(referenceCard ? mapTechCardToForm(referenceCard) : techCardDefaultData),
    operations: ops,
  } as unknown as TechCardFormData;
  return mapFormToTechCardInsert(data);
}

export function readBack(
  insert: common_TechCardInsert,
  savedSeams?: readonly Pick<TechCardSeamWire, 'seamKey' | 'kind'>[],
): Op[] {
  // Seam and pose documents come from the saved card, while the operation mapper carries references.
  const form = mapTechCardToForm({
    techCard: insert,
    seams: savedSeams,
  } as unknown as common_TechCard);
  return (form.operations ?? []) as unknown as Op[];
}

export { operationFieldNames };
