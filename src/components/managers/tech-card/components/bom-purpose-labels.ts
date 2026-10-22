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

const SECTION_SHORT: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'fabric',
  TECH_CARD_BOM_SECTION_LINING: 'lining',
  TECH_CARD_BOM_SECTION_INTERLINING: 'interlining',
  TECH_CARD_BOM_SECTION_INSULATION: 'insulation',
  TECH_CARD_BOM_SECTION_HARDWARE: 'hardware',
  TECH_CARD_BOM_SECTION_THREAD: 'thread',
  TECH_CARD_BOM_SECTION_LABEL: 'label',
  TECH_CARD_BOM_SECTION_PACKAGING: 'packaging',
  TECH_CARD_BOM_SECTION_TRIM: 'trim',
  TECH_CARD_BOM_SECTION_DECORATION: 'decoration',
};

// The one-word section name. `techCardBomSectionOptions` carries operator-facing labels with
// parentheticals ("hardware (пуговицы / молнии / кнопки)") that don't fit a Pill, so the BOM tile
// and the catalog plate badge read from here instead.
export function sectionShort(section?: string): string {
  if (!section) return '';
  return SECTION_SHORT[section] ?? section.replace('TECH_CARD_BOM_SECTION_', '').toLowerCase();
}
