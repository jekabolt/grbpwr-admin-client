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
 * ═══ ИМЯ ИЗДЕЛИЯ: СНАЧАЛА ТАБЛИЦЫ, ПОТОМ ЭВРИСТИКА (26.09, ревью Codex T35) ═════════════════════
 *
 * Ключи сида — не грамматика: «sweaters_knits», «swimwear_w», «scarves», «slippers_loafers» ломают
 * любое правило («sweaters knit», «swimwear w loungewear», «scarve», «slippers loafer»). Поэтому
 * СНАЧАЛА спрашиваются две таблицы — точный путь (`GARMENT_BY_PATH`) и существительное по ключу
 * (`NOUN_BY_KEY`), — и только потом работает эвристика; хвостовое `s` снимается лишь у слова, которого
 * таблицы не знают и которого нет среди неизменяемых (`INVARIANT`). Весь сид (`0001_initial_setup.sql`,
 * 152 пути) прогнан через функцию — таблица «путь → имя» в ревью T35.
 */

/** Точный путь по ключам → готовое имя. Первая проверка; правит там, где эвристике нечего ловить. */
const GARMENT_BY_PATH: Record<string, string> = {
  loungewear_sleepwear: 'loungewear',
  'accessories › jewelry': 'jewelry',
  'accessories › eyewear': 'eyewear',
  'loungewear_sleepwear › swimwear_w': "women's swimwear",
  'loungewear_sleepwear › swimwear_m': "men's swimwear",
  'outerwear › jackets › blazer': 'blazer',
  'tops › tanks': 'tank top',
  'tops › sweaters_knits': 'sweater',
  'tops › hoodies_sweatshirts': 'hoodie',
  'tops › hoodies_sweatshirts › crewneck': 'crewneck sweatshirt',
  'shoes › slippers_loafers': 'loafer',
  'shoes › flats › slippers_loafers': 'loafer',
  'shoes › mules_clogs': 'mule',
  'objects › other': 'object',
};

/**
 * Существительное по КЛЮЧУ — единственное число или готовое имя. Читается и для листа («scarves» →
 * «scarf»), и для родителя («tops › tshirts › crew_neck» → «crew neck t-shirt»).
 */
const NOUN_BY_KEY: Record<string, string> = {
  tshirts: 't-shirt',
  scarves: 'scarf',
  dress_shoes: 'shoe',
  sweaters_knits: 'sweater',
  hoodies_sweatshirts: 'hoodie',
  slippers_loafers: 'loafer',
  mules_clogs: 'mule',
  lace_ups: 'lace-ups',
};

/**
 * Неизменяемые слова: у вещи нет единственного числа как имени («cargo pants», «heels», «flats»,
 * «earrings») или слово не про число вовсе. Хвостовое `s` у них не снимается никогда.
 */
const INVARIANT = new Set([
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
  'heels',
  'flats',
  'socks',
  'earrings',
  'glasses',
  'sunglasses',
  'knits',
]);

/** Ключи листов на `s`, которые ОПРЕДЕЛЕНИЯ, а не существительные во множественном числе. */
const MODIFIERS_IN_S = new Set(['sports']);

const humanize = (key: string): string =>
  key.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Единственное число СЛОВА (уже без подчёркиваний): таблицы и неизменяемые — раньше правил. */
function singular(word: string): string {
  if (INVARIANT.has(word)) return word;
  if (/ries$/.test(word)) return `${word.slice(0, -3)}y`; // accessories → accessory
  if (/ies$/.test(word)) return word.slice(0, -1); // hoodies → hoodie, beanies → beanie
  if (/sses$/.test(word)) return word.slice(0, -2); // dresses → dress
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2); // watches → watch
  if (/[^s]s$/.test(word)) return word.slice(0, -1); // shirts → shirt
  return word;
}

/** Существительное по ключу звена: таблица, иначе первое слово ключа в единственном числе. */
function nounOf(key: string): string {
  return NOUN_BY_KEY[key] ?? singular(humanize(key).split(' ')[0]);
}

/**
 * Лист — вещь сама (стоит один): известное существительное, неизменяемое слово, слово на «-wear»
 * или множественное число («overshirts» → «overshirt»). Иначе лист — определение, и ему нужно
 * существительное родителя («short sleeve» + «shirt»).
 */
function standsAlone(key: string): string | null {
  if (NOUN_BY_KEY[key]) return NOUN_BY_KEY[key];
  const word = humanize(key);
  if (INVARIANT.has(word) || /wear$/.test(word)) return word;
  if (/[^s]s$/.test(word) && !MODIFIERS_IN_S.has(word)) return singular(word);
  return null;
}

/**
 * Имя изделия по пути категории: «tops › shirts › short_sleeve» → «short sleeve shirt»,
 * «bottoms › pants › cargo» → «cargo pants», «tops › shirts › overshirts» → «overshirt»,
 * «dresses › maxi» → «maxi dress», «bags › tote» → «tote bag», «tops» → «tops». Пустой путь — «».
 */
export function garmentNameOf(categoryPath?: string | null): string {
  const keys = (categoryPath ?? '')
    .split('›')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!keys.length) return '';
  const exact = GARMENT_BY_PATH[keys.join(' › ')];
  if (exact) return exact;
  const leafKey = keys[keys.length - 1];
  const leaf = humanize(leafKey);
  // Звено без имени печатается `#id` (см. `categoryPathOf`) — из него слова не собрать.
  if (keys.length === 1 || leaf.startsWith('#')) return leaf;
  const alone = standsAlone(leafKey);
  if (alone) return alone;
  const parentKey = keys[keys.length - 2];
  if (parentKey.startsWith('#')) return leaf;
  const noun = nounOf(parentKey);
  // «boxer» под «boxers» — уже имя вещи, второй раз не печатается.
  if (noun.startsWith(leaf)) return noun;
  return `${leaf} ${noun}`;
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
