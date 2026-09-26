/**
 * ═══ ФАКТЫ КАРТОЧКИ ДЛЯ МОДЕЛИ — ОДИН КОМПОЗЕР НА AI ENHANCE И WORDS ═══════════════════════════
 *
 * Волна 2026-09-25 (DEEP-03, D-20'). Две двери отдают модели факты карточки: контекст для
 * `EnhanceText` и предзаполнение WORDS во входе флэта. Если бы каждая собирала строку сама, они
 * разошлись бы за день (см. false-split-dictionaries). Поэтому — одна функция и один порядок строк.
 *
 * Здесь нет чтения формы: органы передают факты явно, чтобы файл не зависел от схемы и был
 * проверяем чистой пробой.
 *
 * ═══ ИЗДЕЛИЕ — ЧЕЛОВЕЧЕСКИМ ИМЕНЕМ, А НЕ ПУТЁМ (26.09, O-35 / D-34) ════════════════════════════
 *
 * Владелец о первой строке WORDS: «category: tops › shirts › short_sleeve втф». Строка изделия —
 * имя ЛИСТА категории словами: `garment: short sleeve shirt`. Словарь категорий (`common_Category`)
 * несёт только ключи (`short_sleeve`, `cargo`, `bomber`), переводов в нём нет, поэтому имя собирается
 * из ключей (`garmentNameOf`): подчёркивания — пробелы; лист-ОПРЕДЕЛЕНИЕ («short sleeve», «cargo»)
 * получает существительное родителя в единственном числе («shirt», «pants» — у неисчисляемых
 * множественное остаётся); лист-СУЩЕСТВИТЕЛЬНОЕ во множественном числе («overshirts», «trousers»)
 * стоит один. Это эвристика над ключами сида, а не грамматика: «jewelry accessory» она отдаст, но
 * пути и сырых ключей — никогда.
 *
 * МАТЕРИАЛЫ — ТОЛЬКО В КОНТЕКСТ `ai ✦`, В WORDS ИХ НЕТ (O-35): «материалы для создания флета вообще
 * не принципиальны на этом этапе». Модель, переписывающая описание или ткань, спецификацию читать
 * вправе — `cardFactsContext` их оставляет; `composeWords` опускает.
 */
export type CardFacts = {
  /** «bottoms › pants › cargo» — путь по словарю категорий, ключи через ` › ` (печать в GENERAL INFORMATION). */
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

/**
 * Существительные, у которых нет единственного числа как имени вещи: «cargo pants», а не «cargo pant».
 * Список — по ключам сида категорий и очевидным соседям; слово вне списка теряет хвостовое `s`.
 */
const PLURAL_ONLY = new Set([
  'pants',
  'shorts',
  'jeans',
  'trousers',
  'joggers',
  'chinos',
  'boxers',
  'briefs',
  'gloves',
  'mittens',
  'tights',
  'leggings',
  'overalls',
  'shoes',
  'boots',
  'sneakers',
  'sandals',
  'socks',
  'earrings',
  'glasses',
  'sunglasses',
]);

/** Ключи листов на `s`, которые ОПРЕДЕЛЕНИЯ, а не существительные во множественном числе. */
const MODIFIERS_IN_S = new Set(['sports']);

const humanize = (key: string): string =>
  key.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function singular(noun: string): string {
  if (PLURAL_ONLY.has(noun)) return noun;
  if (/ries$/.test(noun)) return `${noun.slice(0, -3)}y`; // accessories → accessory
  if (/ies$/.test(noun)) return noun.slice(0, -1); // hoodies → hoodie, beanies → beanie
  if (/sses$/.test(noun)) return noun.slice(0, -2); // dresses → dress
  if (/(ch|sh|x)es$/.test(noun)) return noun.slice(0, -2); // watches → watch
  if (/[^s]s$/.test(noun)) return noun.slice(0, -1); // shirts → shirt
  return noun;
}

/** Лист во множественном числе — вещь сама («overshirts» → «overshirt»); иначе — определение. */
const isPluralNoun = (word: string): boolean => /[^s]s$/.test(word) && !MODIFIERS_IN_S.has(word);

/**
 * Имя изделия по пути категории: «tops › shirts › short_sleeve» → «short sleeve shirt»,
 * «bottoms › pants › cargo» → «cargo pants», «tops › shirts › overshirts» → «overshirt»,
 * «dresses › maxi» → «maxi dress», «bags › tote» → «tote bag», «tops» → «tops». Пустой путь — «».
 */
export function garmentNameOf(categoryPath?: string | null): string {
  const names = (categoryPath ?? '').split('›').map(humanize).filter(Boolean);
  if (!names.length) return '';
  const leaf = names[names.length - 1];
  // Звено без имени печатается `#id` (см. `categoryPathOf`) — из него слова не собрать.
  if (names.length === 1 || leaf.startsWith('#')) return leaf;
  if (isPluralNoun(leaf)) return singular(leaf);
  // Существительное — первое слово родителя: `sweaters_knits` → «sweater», `hoodies_sweatshirts` → «hoodie».
  const parent = names[names.length - 2].split(' ')[0];
  if (parent.startsWith('#')) return leaf;
  // «boxer» под «boxers» — уже имя вещи, второй раз не печатается.
  if (parent.startsWith(leaf)) return singular(parent);
  return `${leaf} ${singular(parent)}`;
}

/** Строки в фиксированном порядке; пустые факты пропускаются. */
export function cardFactLines(f: CardFacts): string[] {
  const out: string[] = [];
  const garment = garmentNameOf(f.categoryPath);
  if (garment) out.push(`garment: ${garment}`);
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
 * Контекст для модели `ai ✦`: строки до `max` символов, материалы включены. Переполнение — целыми
 * строками с хвоста, никогда посреди фразы; `concept` при этом режется первым до 300 символов,
 * потому что он самый длинный и самый пересказываемый.
 */
export function cardFactsContext(f: CardFacts, max = 2000): string {
  const shortConcept = clean(f.concept).slice(0, 300);
  return joinWithin(cardFactLines({ ...f, concept: shortConcept }), max).text;
}

/**
 * Предзаполнение WORDS: те же строки, тот же порядок, БЕЗ материалов (O-35), лимит поля (2000).
 * Возвращает и число опущенных строк — вызывающий печатает «(+N sections omitted)» рядом с полем,
 * а не молчит.
 */
export function composeWords(f: CardFacts, max = 2000): { text: string; omitted: number } {
  return joinWithin(cardFactLines({ ...f, materials: undefined }), max);
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
