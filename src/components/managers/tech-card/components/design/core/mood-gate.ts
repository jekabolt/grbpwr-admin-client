/**
 * ═══ МИНИМУМ МУДБОРДА — ОДИН ГЕЙТ НА РЕЛЬС, ФЛЭТ И ОБЕ ПЛАТНЫЕ ДВЕРИ ═════════════════════════════
 *
 * Волда 2026-09-25 (D-10, ревью Codex B-10): «пока мы не заполним минимально поля в мудборде, мы
 * не можем пойти дальше по флоу». Правило одно и живёт здесь; `stepDone('mood')`,
 * `chainGate('flat')`, GENERATE флэта и GENERATE черновика читают ЭТУ функцию, а не каждый своё.
 *
 * Что считается минимумом (константы — единственное место для правки, если владелец решит иначе):
 *   (a) на ДОСКЕ есть картинка (строки входа REFERENCE не в счёт — `isBoardRow`)
 *       ИЛИ описание не короче MOOD_MIN_CONCEPT символов;
 *   (b) выбрана категория (без неё нет ни семейства фитов, ни пиктограмм, ни промпта).
 */
export const MOOD_MIN_CONCEPT = 40;

export type MoodGateInput = {
  /** Картинок на самой доске (после `isBoardRow`), не во входе референсов. */
  boardPictures: number;
  concept: string | null | undefined;
  categoryId: number | null | undefined;
};

export type MoodGateResult = { ok: boolean; reasons: string[] };

export const MOOD_GATE_DOOR = 'mood' as const;

export function moodboardGate(v: MoodGateInput): MoodGateResult {
  const reasons: string[] = [];
  const conceptLen = (v.concept ?? '').trim().length;
  if (v.boardPictures <= 0 && conceptLen < MOOD_MIN_CONCEPT) {
    reasons.push(
      `put a picture on the moodboard or write at least ${MOOD_MIN_CONCEPT} characters of description`,
    );
  }
  if (!v.categoryId || v.categoryId <= 0) {
    reasons.push('pick the category in card details');
  }
  return { ok: reasons.length === 0, reasons };
}

/** Одна фраза отказа для замка на рельсе и для кнопок GENERATE. */
export function moodGateSentence(r: MoodGateResult): string {
  return r.reasons.join(' · ');
}
