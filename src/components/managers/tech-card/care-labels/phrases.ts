// ЯЗЫКИ ЛЕНТЫ И ФРАЗА СТ. 12 — константы составника (план care-labels §3.1, §3.3).
//
// Языки ленты — ЗАКРЫТЫЙ список из 10 кодов, ровно как на макете, и НЕ таблица `language`: там
// нет ES/PT/NL/PL, а `cn`/`jp` здесь нарочно не совпадают с `cn`/`ja` системы. Порядок
// массива = порядок строк на ленте. Тот же список — CHECK колонки `fiber_label_translation.label_lang`
// на бэке; расходиться им нельзя.
//
// Фраза регламента ЕС 1007/2011 ст. 12 («содержит нетекстильные части животного происхождения»)
// печатается отдельной колонкой NOTE, когда в любой части есть волокно с флагом animal_non_textile.
// ТЕКСТ НЕ ПРАВИТЬ РУКАМИ: он сгенерирован из tmp/plans/care-labels/fiber-translations.json
// (истина — JSON, владелец проверяет PL/CN/JP там), проба resolver.mjs сверяет его с JSON побайтно.

export const LABEL_LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'cn', 'jp'] as const;

export type LabelLang = (typeof LABEL_LANGS)[number];

export const isLabelLang = (v: string): v is LabelLang =>
  (LABEL_LANGS as readonly string[]).includes(v);

/** Метка строки на ленте: `EN`, `FR`, … `CN`, `JP` — код языка капсом, как на макете. */
export const labelLangTag = (lang: LabelLang): string => lang.toUpperCase();

/** Фраза ст. 12 на 10 языках ленты, уже в верхнем регистре (CJK — как есть). */
export const NON_TEXTILE_ANIMAL_PHRASE: Record<LabelLang, string> = {
  en: 'CONTAINS NON-TEXTILE PARTS OF ANIMAL ORIGIN',
  fr: "CONTIENT DES PARTIES NON TEXTILES D'ORIGINE ANIMALE",
  de: 'ENTHÄLT NICHTTEXTILE TEILE TIERISCHEN URSPRUNGS',
  it: 'CONTIENE PARTI NON TESSILI DI ORIGINE ANIMALE',
  es: 'CONTIENE PARTES NO TEXTILES DE ORIGEN ANIMAL',
  pt: 'CONTÉM PARTES NÃO TÊXTEIS DE ORIGEM ANIMAL',
  nl: 'BEVAT NIET-TEXTIELDELEN VAN DIERLIJKE OORSPRONG',
  pl: 'ZAWIERA NIETEKSTYLNE CZĘŚCI POCHODZENIA ZWIERZĘCEGO',
  cn: '含有动物源性非纺织部分',
  jp: '動物由来の非繊維部分を含む',
};
