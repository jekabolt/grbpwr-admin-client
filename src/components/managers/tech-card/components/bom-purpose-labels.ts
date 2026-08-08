// Словарь НАЗНАЧЕНИЙ роллгудс-строк BOM — вынесен из bom-purpose.ts БЕЗ ИЗМЕНЕНИЙ.
//
// Причина выноса — публичный вьюер выкроек (/p/:token): ему нужна ровно подпись назначения
// (bomPurposeLabel), а bom-purpose.ts импортирует bom-line-picker → schema тех-карты → zod и
// react-hook-form, чего публичной странице таскать нельзя. Один словарь на всех: bom-purpose.ts
// реэкспортирует отсюда, и второй орфографии назначений не появляется.

export const UNSET_PURPOSE = 'TECH_CARD_BOM_PURPOSE_UNSET' as const;

export const PURPOSE_LABEL: Record<string, string> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'основной материал',
  TECH_CARD_BOM_PURPOSE_LINING: 'подкладка',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'карманка',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'бортовка / прокладка',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'утеплитель',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'контраст / отделочная',
  TECH_CARD_BOM_PURPOSE_MESH: 'сетка / второй слой',
  TECH_CARD_BOM_PURPOSE_OTHER: 'другое',
};

// The heading an UNSET roll-goods line collects under. Worded as an instruction, not as a value: a
// line lands here because nobody has sorted it yet, and every line that predates 0265 starts here
// deliberately — nothing guessed a purpose for them, because section=fabric is precisely where a
// карманка, a контраст and a сетка hide, and a guess would have labelled all three «основной
// материал» confidently and wrongly.
export const UNSET_PURPOSE_LABEL = 'назначение не задано';

export function bomPurposeLabel(purpose?: string): string {
  if (!purpose || purpose === UNSET_PURPOSE) return UNSET_PURPOSE_LABEL;
  return PURPOSE_LABEL[purpose] ?? purpose.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
}
