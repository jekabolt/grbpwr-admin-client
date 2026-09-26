/**
 * ═══ МИНИМУМ МУДБОРДА — ОДИН ГЕЙТ НА РЕЛЬС, ФЛЭТ И ОБЕ ПЛАТНЫЕ ДВЕРИ ═════════════════════════════
 *
 * Волна 2026-09-25 (D-10, ревью Codex B-10): «пока мы не заполним минимально поля в мудборде, мы
 * не можем пойти дальше по флоу». Правило одно и живёт здесь; `stepDone('mood')`,
 * `chainGate('flat')`, GENERATE флэта и GENERATE черновика читают ЭТУ функцию, а не каждый своё.
 *
 * ═══ ТРИ ЧАСТИ, И НУЖНЫ ВСЕ ТРИ (фиксап волны, ревью Codex B1) ═══════════════════════════════════
 *
 * Первая редакция D-10 держала «картинка ИЛИ 40 символов описания, И категория». Ревью: минимум —
 * это ПОЛЯ мудборда, во множественном числе, и флэт, нарисованный с одной картинки без единого слова
 * (или со слов без картинки), — ровно та догадка, от которой гейт стережёт. Теперь:
 *   (a) на ДОСКЕ есть картинка (строки входа REFERENCE не в счёт — `isBoardRow`);
 *   (b) описание не короче MOOD_MIN_CONCEPT символов — считаются СИМВОЛЫ (кодовые точки), а не
 *       UTF-16: эмодзи и суррогатные пары — один знак, как их видит человек;
 *   (c) выбрана категория (без неё нет ни семейства фитов, ни пиктограмм, ни промпта).
 * Константы и порядок частей — единственное место для правки, если владелец решит иначе.
 *
 * ОТВЕТ СТРУКТУРНЫЙ: у каждой недостающей части свой адрес починки (`missing[].field`), а фраза —
 * одна (`moodGateSentence`) на все экраны. Куда ведёт каждая часть — знает `core/chain.ts`
 * (`moodGateDoors`): доска и описание — шаг MOODBOARD, категория — CARD DETAILS.
 */
export const MOOD_MIN_CONCEPT = 40;

export type MoodGateInput = {
  /** Картинок на самой доске (после `isBoardRow`), не во входе референсов. */
  boardPictures: number;
  concept: string | null | undefined;
  categoryId: number | null | undefined;
};

/** Часть минимума — и адрес, где она чинится. */
export type MoodGateField = 'board' | 'concept' | 'category';

export type MoodGateMissing = {
  field: MoodGateField;
  /** Слова этой части; фраза отказа собирается из них в порядке частей. */
  reason: string;
};

export type MoodGateResult = {
  ok: boolean;
  /** Недостающие части в порядке (a) → (b) → (c). */
  missing: MoodGateMissing[];
  /** Те же слова без адресов — для читателей, которым нужна только фраза. */
  reasons: string[];
};

export const MOOD_GATE_DOOR = 'mood' as const;

/** Длина в символах, которые видит человек: кодовые точки, а не единицы UTF-16. */
export function runeLength(s: string | null | undefined): number {
  return Array.from((s ?? '').trim()).length;
}

export function moodboardGate(v: MoodGateInput): MoodGateResult {
  const missing: MoodGateMissing[] = [];
  if (!(v.boardPictures > 0)) {
    missing.push({ field: 'board', reason: 'put a picture on the moodboard' });
  }
  if (runeLength(v.concept) < MOOD_MIN_CONCEPT) {
    missing.push({
      field: 'concept',
      reason: `write at least ${MOOD_MIN_CONCEPT} characters of description`,
    });
  }
  if (!v.categoryId || v.categoryId <= 0) {
    missing.push({ field: 'category', reason: 'pick the category in card details' });
  }
  return { ok: missing.length === 0, missing, reasons: missing.map((m) => m.reason) };
}

/** Одна фраза отказа для замка на рельсе, для кнопок GENERATE и для отказа сервера `no_moodboard`. */
export function moodGateSentence(r: Pick<MoodGateResult, 'reasons'>): string {
  return r.reasons.join(' · ');
}

/**
 * ═══ ЧТО НУЖНО ПРОЧИТАТЬ ЧЕРНОВИКУ CONSTRUCTION — МИНИМУМ БЕЗ ТОЙ ЧАСТИ, КОТОРУЮ ОН ПИШЕТ ════════
 *
 * Черновик стоит НА шаге мудборда и ЗАПОЛНЯЕТ его: пишет описание, силуэт, ткань по картинкам доски.
 * Требовать от него описания в 40 символов — значит требовать ответа до вопроса: с доской из одних
 * картинок он бы не запустился никогда. Поэтому его дверь — «есть что читать» (картинка на доске ИЛИ
 * описание от 40 символов) и категория; дальше по цепочке (FLAT и следом) ведёт полный минимум.
 *
 * Слова — те же части `moodboardGate` (одна формулировка на все двери): когда не хватает обеих
 * половин чтения, они соединяются «or» в одну — любой из них достаточно.
 */
export function draftInputGate(v: MoodGateInput): MoodGateResult {
  const full = moodboardGate(v);
  const lacks = (f: MoodGateField) => full.missing.some((m) => m.field === f);
  const nothingToRead = lacks('board') && lacks('concept');
  const missing: MoodGateMissing[] = [];
  if (nothingToRead) {
    const board = full.missing.find((m) => m.field === 'board')!;
    const concept = full.missing.find((m) => m.field === 'concept')!;
    missing.push({ field: 'board', reason: `${board.reason} or ${concept.reason}` });
  }
  missing.push(...full.missing.filter((m) => m.field === 'category'));
  return { ok: missing.length === 0, missing, reasons: missing.map((m) => m.reason) };
}
