// Словарь НАЗНАЧЕНИЙ роллгудс-строк BOM — вынесен из bom-purpose.ts БЕЗ ИЗМЕНЕНИЙ.
//
// Причина выноса — публичный вьюер выкроек (/p/:token): ему нужна ровно подпись назначения
// (bomPurposeLabel), а bom-purpose.ts импортирует bom-line-picker → schema тех-карты → zod и
// react-hook-form, чего публичной странице таскать нельзя. Один словарь на всех: bom-purpose.ts
// реэкспортирует отсюда, и второй орфографии назначений не появляется.

export const UNSET_PURPOSE = 'TECH_CARD_BOM_PURPOSE_UNSET' as const;

export const PURPOSE_LABEL: Record<string, string> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main material',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'canvas / interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast / facing',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh / second layer',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};

// The heading an UNSET roll-goods line collects under. Worded as an instruction, not as a value: a
// line lands here because nobody has sorted it yet, and every line that predates 0265 starts here
// deliberately — nothing guessed a purpose for them, because section=fabric is precisely where a
// карманка, a контраст and a сетка hide, and a guess would have labelled all three «main
// material» confidently and wrongly.
export const UNSET_PURPOSE_LABEL = 'purpose not set';

export function bomPurposeLabel(purpose?: string): string {
  if (!purpose || purpose === UNSET_PURPOSE) return UNSET_PURPOSE_LABEL;
  return PURPOSE_LABEL[purpose] ?? purpose.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();
}
