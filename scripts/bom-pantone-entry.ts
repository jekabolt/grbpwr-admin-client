// Точка входа пробы «пантон строки BOM переживает круг»: НАСТОЯЩИЕ мапперы карточки, не их копии.
//
// Здесь не переписано ничего из проверяемого — стенд даёт три рукоятки («пустая строка BOM»,
// «форма → провод», «провод → форма»), и все три ходят через `schema.ts`. Копия маппера в пробе
// доказывала бы только то, что копия согласна сама с собой (приём взят у step-roundtrip-entry).
//
// ПУСТАЯ СТРОКА БЕРЁТСЯ У МАППЕРА ЧТЕНИЯ, а не выписана константой: так поле волны, забытое в
// маппере чтения, ломает стенд ТАМ ЖЕ, где живёт дефект, а не в фикстуре пробы.
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

export type BomLine = Record<string, unknown>;

/** Строка BOM, прочитанная с провода как есть — включая ключи, которых сервер не прислал. */
export function fromWire(line: Record<string, unknown>): BomLine {
  const form = mapTechCardToForm({
    techCard: { bomItems: [line] },
  } as unknown as common_TechCard);
  return (form.bomItems ?? [])[0] as unknown as BomLine;
}

export function toWire(lines: BomLine[]): common_TechCardInsert {
  const data = {
    ...techCardDefaultData,
    bomItems: lines,
  } as unknown as TechCardFormData;
  return mapFormToTechCardInsert(data);
}

export function readBack(insert: common_TechCardInsert): BomLine[] {
  const form = mapTechCardToForm({ techCard: insert } as unknown as common_TechCard);
  return (form.bomItems ?? []) as unknown as BomLine[];
}
