// Точка входа аудита присутствия: НАСТОЯЩАЯ утилита сверки и НАСТОЯЩИЕ мапперы карточки.
//
// Здесь не переписано ничего из проверяемого. Стенд даёт четыре рукоятки: сама сверка, её список
// полей, и пара «форма → провод» / «провод → форма» — теми же функциями `schema.ts`, которыми
// карточка читает и пишет. Через них проба строит ЧЕСТНУЮ сторону «прочитано»: старый бэкенд не
// придумывается, а моделируется вырезанием поля из тела провода — ровно то, что делает
// `DiscardUnknown` на бинаре, который этого поля не знает.
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import {
  auditOperationPresence,
  hasPresenceLoss,
  isPresent,
  operationPresenceFields,
  PRESENCE_NOT_AUDITED,
} from 'components/managers/tech-card/components/operations-presence';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  operationFieldNames,
  techCardDefaultData,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

export type Op = Record<string, unknown>;

export function toWire(ops: Op[]): common_TechCardInsert {
  const data = {
    ...techCardDefaultData,
    operations: ops,
  } as unknown as TechCardFormData;
  return mapFormToTechCardInsert(data);
}

export function readBack(insert: common_TechCardInsert): Op[] {
  const form = mapTechCardToForm({ techCard: insert } as unknown as common_TechCard);
  return (form.operations ?? []) as unknown as Op[];
}

export {
  auditOperationPresence,
  hasPresenceLoss,
  isPresent,
  operationFieldNames,
  operationPresenceFields,
  PRESENCE_NOT_AUDITED,
};
