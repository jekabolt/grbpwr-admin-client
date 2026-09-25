/**
 * ═══ ФАКТЫ КАРТОЧКИ ДЛЯ МОДЕЛИ — ОДИН КОМПОЗЕР НА AI ENHANCE И WORDS ═══════════════════════════
 *
 * Волна 2026-09-25 (DEEP-03, D-20'). Две двери отдают модели факты карточки: контекст для
 * `EnhanceText` и предзаполнение WORDS во входе флэта. Если бы каждая собирала строку сама, они
 * разошлись бы за день (см. false-split-dictionaries). Поэтому — одна функция и один порядок строк.
 *
 * Здесь нет чтения формы: органы передают факты явно, чтобы файл не зависел от схемы и был
 * проверяем чистой пробой.
 */
export type CardFacts = {
  /** «bottoms › pants › cargo» — путь по словарю категорий. */
  categoryPath?: string;
  fit?: string;
  ageGroup?: string;
  gender?: string;
  /** DESCRIPTION мудборда (`concept`). */
  concept?: string;
  silhouette?: string;
  fabric?: string;
  /** Остальные аспекты конструкции: [подпись, текст]. */
  aspects?: Array<[string, string]>;
  /** Тексты указаний на доске. */
  callouts?: string[];
  /** Слоты материалов: «section · name · composition». */
  materials?: string[];
};

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Строки в фиксированном порядке; пустые факты пропускаются. */
export function cardFactLines(f: CardFacts): string[] {
  const out: string[] = [];
  if (clean(f.categoryPath)) out.push(`category: ${clean(f.categoryPath)}`);
  if (clean(f.fit)) out.push(`fit: ${clean(f.fit)}`);
  if (clean(f.ageGroup)) out.push(`age group: ${clean(f.ageGroup)}`);
  if (clean(f.gender)) out.push(`for: ${clean(f.gender)}`);
  if (clean(f.concept)) out.push(`description: ${clean(f.concept)}`);
  if (clean(f.silhouette)) out.push(`silhouette: ${clean(f.silhouette)}`);
  if (clean(f.fabric)) out.push(`fabric: ${clean(f.fabric)}`);
  for (const [label, text] of f.aspects ?? []) {
    if (clean(text)) out.push(`${clean(label)}: ${clean(text)}`);
  }
  const notes = (f.callouts ?? []).map(clean).filter(Boolean);
  if (notes.length) out.push(`notes on the board: ${notes.join('; ')}`);
  const mats = (f.materials ?? []).map(clean).filter(Boolean);
  if (mats.length) out.push(`materials: ${mats.join('; ')}`);
  return out;
}

/**
 * Контекст для модели: строки до `max` символов. Переполнение — целыми строками с хвоста, никогда
 * посреди фразы; `concept` при этом режется первым до 300 символов, потому что он самый длинный и
 * самый пересказываемый.
 */
export function cardFactsContext(f: CardFacts, max = 2000): string {
  const shortConcept = clean(f.concept).slice(0, 300);
  return joinWithin(cardFactLines({ ...f, concept: shortConcept }), max).text;
}

/**
 * Предзаполнение WORDS: те же строки, тот же порядок, лимит поля (2000). Возвращает и число
 * опущенных строк — вызывающий печатает «(+N sections omitted)» рядом с полем, а не молчит.
 */
export function composeWords(f: CardFacts, max = 2000): { text: string; omitted: number } {
  return joinWithin(cardFactLines(f), max);
}

function joinWithin(lines: string[], max: number): { text: string; omitted: number } {
  const kept: string[] = [];
  let len = 0;
  let omitted = 0;
  for (const line of lines) {
    const add = line.length + (kept.length ? 1 : 0);
    if (len + add > max) {
      omitted += 1;
      continue;
    }
    kept.push(line);
    len += add;
  }
  return { text: kept.join('\n'), omitted };
}
