import type { DesignQuizAnswer, DesignQuizQuestion } from 'api/proto-http/admin';

/**
 * ═══ КВИЗ ДОСКИ — ЧИСТАЯ МОДЕЛЬ (волна 04.10, 20-DESIGN §1.5, §6, O2) ═════════════════════════
 *
 * Без React и без провода: экран (`mood-quiz.tsx`) и факты карточки (`head/card-facts-form.ts`)
 * читают одни и те же функции, иначе строка «решено с дизайнером» разошлась бы между WORDS и `ai ✦`.
 */

/** Потолок вопросов одного прогона, вместе с уточняющими (владелец: «до 15»). */
export const QUIZ_MAX = 15;

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Ключ детали словами: `back_pocket` → `back pocket`. */
export const partWords = (part?: string | null) => clean((part ?? '').replace(/_/g, ' '));

/** Ответ человека одной строкой: выбранное через `; `, свои слова в кавычках; пропуск — ''. */
export function answerText(a: DesignQuizAnswer): string {
  if (a.skipped) return '';
  const chosen = (a.selected ?? []).map(clean).filter(Boolean);
  const own = clean(a.freeText);
  const parts = [...chosen];
  if (own) parts.push(`"${own}"`);
  return parts.join('; ');
}

/**
 * Строки решений для каждой следующей генерации: `collar: stiff stand, 3 cm`. Предмет — деталь,
 * у вопроса про вещь целиком (`whole`) — категория. Пропущенные не печатаются.
 */
export function decisionLines(answers: readonly DesignQuizAnswer[]): string[] {
  const out: string[] = [];
  for (const a of answers) {
    const text = answerText(a);
    if (!text) continue;
    const part = clean(a.question?.part);
    const subject = part && part !== 'whole' ? partWords(part) : clean(a.question?.category);
    out.push(`${subject || 'decided'}: ${text}`);
  }
  return out;
}

/** Ответ на вопрос — заменяет прежний на ТОМ ЖЕ месте списка, новый встаёт в конец. */
export function withAnswer(
  list: readonly DesignQuizAnswer[],
  answer: DesignQuizAnswer,
): DesignQuizAnswer[] {
  const id = answer.question?.id;
  const at = list.findIndex((a) => a.question?.id === id);
  if (at < 0) return [...list, answer];
  const next = list.slice();
  next[at] = answer;
  return next;
}

/**
 * УТОЧНЯЮЩИЙ ВОПРОС (O2): выбран вариант, который противоречит картинкам, и модель дала уточнение —
 * оно встаёт сразу следующим, с той же деталью и пиктограммой, одиночным выбором. `null` — вставлять
 * нечего (ничего не противоречит, уточнения нет, вариантов меньше двух, уже стоит).
 */
export function clarifyOf(
  q: DesignQuizQuestion,
  selected: readonly string[],
): DesignQuizQuestion | null {
  const question = clean(q.clarifyQuestion);
  const options = (q.clarifyOptions ?? []).map(clean).filter(Boolean);
  if (!question || options.length < 2) return null;
  if ((q.id ?? '').startsWith('clarify_')) return null;
  const opts = q.options ?? [];
  const flags = q.contradicts ?? [];
  const hit = selected.some((s) => {
    const i = opts.indexOf(s);
    return i >= 0 && !!flags[i];
  });
  if (!hit) return null;
  return {
    id: `clarify_${q.id ?? ''}`.slice(0, 64),
    category: q.category,
    part: q.part,
    family: q.family,
    view: q.view,
    kind: 'single',
    question,
    options: options.slice(0, 6),
    contradicts: [],
    visualEvidence: '',
    clarifyQuestion: '',
    clarifyOptions: [],
  };
}

/** Вставка уточнения после `at`, если потолок прогона ещё не выбран и такого id в очереди нет. */
export function insertClarify(
  queue: readonly DesignQuizQuestion[],
  at: number,
  clarify: DesignQuizQuestion | null,
): DesignQuizQuestion[] {
  if (!clarify || queue.length >= QUIZ_MAX) return queue.slice();
  if (queue.some((q) => q.id === clarify.id)) return queue.slice();
  return [...queue.slice(0, at + 1), clarify, ...queue.slice(at + 1)];
}
