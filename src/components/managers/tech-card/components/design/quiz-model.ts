import type { DesignQuizAnswer, DesignQuizQuestion } from 'api/proto-http/admin';
import { isEdgeKind, isPaletteKey, isSeamKind, SEAM_LABEL } from './seam-icons';

/**
 * ═══ КВИЗ ДОСКИ — ЧИСТАЯ МОДЕЛЬ (волна 04.10, 20-DESIGN §1.5, §6, O2) ═════════════════════════
 *
 * Без React и без провода: экран (`mood-quiz.tsx`) и факты карточки (`head/card-facts-form.ts`)
 * читают одни и те же функции, иначе строка «решено с дизайнером» разошлась бы между WORDS и `ai ✦`.
 */

/**
 * Страховочный потолок одного прогона, вместе с уточняющими — не цель (владелец 05.10: «можно не
 * ограничиваться 15 вопросами»; сервер режет на том же 30).
 */
export const QUIZ_MAX = 30;

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
 * Деталь словами для строк решений — как сервер (`designQuizPartLabel`): `hw_`/`lbl_` сняты, вид
 * бирки назван биркой (`lbl_brand` → `brand label`, `lbl_hang_tag` → `hang tag`), шов — `seam: <name>`
 * (`sm_french` → `seam: French seam`), открытый край — `edge: <name>` (90-EDGES),
 * `col_palette` → `colourways` (70-SEAMS).
 */
export function partLabel(part?: string | null): string {
  const p = clean(part);
  if (isPaletteKey(p)) return 'colourways';
  if (isSeamKind(p)) return `${isEdgeKind(p) ? 'edge' : 'seam'}: ${SEAM_LABEL[p]}`;
  if (p.startsWith('lbl_')) {
    const k = p.slice(4).replace(/_/g, ' ');
    return k === 'hang tag' || k === 'patch' ? k : `${k} label`;
  }
  return partWords(p.replace(/^hw_/, ''));
}

/**
 * D1 (62-DEEP-FIXES): карточка изменилась после ответа — сервер помечает строку `stale`. Такие ответы
 * идут ПОСЛЕ свежих, под этим заголовком (слово в слово как у сервера); `confirm` в списке ответов
 * пересохраняет тот же ответ — он снова свежий.
 */
export const STALE_DECISIONS_HEADING =
  'earlier quiz answers — the card changed since; unconfirmed, current card facts win';

/**
 * 91-EDGE-KEYS K2: на «основную отделку краёв» (`edge_finish_main`) ВСЕГДА следом встаёт вопрос
 * «какие края иначе» — решение `edge_exceptions`, multi, с вариантом «none — all the same».
 */
export const EDGE_MAIN_KEY = 'edge_finish_main';
export const EDGE_EXCEPTIONS_KEY = 'edge_exceptions';
export const EDGE_NONE = 'none — all the same';

/** Вставной вопрос-продолжение (уточнение O2 или исключения краёв): не базовый, сервер его не знает. */
export const isFollowUpId = (id?: string | null) =>
  (id ?? '').startsWith('clarify_') || (id ?? '').startsWith('edge_exceptions_');

/** id продолжения вопроса: `edge_exceptions_<id>` у основной отделки краёв, иначе `clarify_<id>`. */
export const followUpId = (q?: DesignQuizQuestion | null) =>
  `${q?.decisionKey === EDGE_MAIN_KEY ? 'edge_exceptions_' : 'clarify_'}${q?.id ?? ''}`.slice(
    0,
    64,
  );

/**
 * Все id продолжений вопроса, которые могли лечь на сервер: у `edge_finish_main` — новый
 * `edge_exceptions_<id>` И прежний O2 `clarify_<id>` (ответы до 91-EDGE-KEYS); правка, пропуск
 * или forget родителя каскадом снимают оба, иначе старое уточнение продолжает влиять на черновики.
 */
export const followUpIds = (q?: DesignQuizQuestion | null): string[] => [
  ...new Set([followUpId(q), `clarify_${q?.id ?? ''}`.slice(0, 64)]),
];

/** `edge exceptions: neckline: rib band; pocket openings: piping`; только «none» — `edge exceptions: none`. */
function edgeExceptionsLine(a: DesignQuizAnswer): string | null {
  const picked = (a.selected ?? []).map(clean).filter(Boolean);
  const items = picked.filter((s) => !/^none\b/i.test(s));
  const own = clean(a.freeText);
  if (own) items.push(own);
  if (items.length) return `edge exceptions: ${items.join('; ')}`;
  return picked.length ? 'edge exceptions: none' : null;
}

function decisionLine(a: DesignQuizAnswer): string | null {
  if (a.skipped) return null;
  if (a.question?.decisionKey === EDGE_EXCEPTIONS_KEY) return edgeExceptionsLine(a);
  const chosen = (a.selected ?? []).map(clean).filter(Boolean);
  const own = clean(a.freeText);
  if (own) chosen.push(`own words: "${own}"`);
  if (!chosen.length) return null;
  const part = clean(a.question?.part);
  const label = part && part !== 'whole' ? partLabel(part) : '';
  const subject = label || clean(a.question?.category) || 'decided';
  return `${subject} — ${clean(a.question?.question)} → ${chosen.join('; ')}`;
}

/**
 * Строки решений для каждой следующей генерации — та же форма, что у сервера
 * (`designQuizDecisionLines`, W-C8): `hem — Where does the hem sit? → mid-thigh`. Предмет — деталь,
 * у вопроса про вещь целиком (`whole`) — категория. Свои слова — `own words: "…"`. Пропущенные не
 * печатаются. Устаревшие (D1) — после свежих, за строкой `STALE_DECISIONS_HEADING`.
 */
export function decisionLines(answers: readonly DesignQuizAnswer[]): string[] {
  const fresh: string[] = [];
  const stale: string[] = [];
  for (const a of answers) {
    const line = decisionLine(a);
    if (line) (a.stale ? stale : fresh).push(line);
  }
  return stale.length ? [...fresh, STALE_DECISIONS_HEADING, ...stale] : fresh;
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
  if (isFollowUpId(q.id)) return null;
  if (q.decisionKey === EDGE_MAIN_KEY) return edgeExceptionsOf(q);
  const question = clean(q.clarifyQuestion);
  const options = (q.clarifyOptions ?? []).map(clean).filter(Boolean);
  if (!question || options.length < 2) return null;
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
    // Уточнение — не своё решение: ключа нет, оно никого не вытесняет (E1).
    decisionKey: '',
    // 96: уточнение вопроса про картинку — про ту же картинку (рамка на доске не гаснет).
    ...(q.mediaId ? { mediaId: q.mediaId } : {}),
  };
}

/**
 * 91-EDGE-KEYS K2: исключения краёв — после ЛЮБОГО ответа на `edge_finish_main`. Варианты — пары
 * «край: отделка» от сервера (2–6, сервер гарантирует) + `none — all the same`; свои слова как обычно.
 */
function edgeExceptionsOf(q: DesignQuizQuestion): DesignQuizQuestion {
  const pairs = [...new Set((q.clarifyOptions ?? []).map(clean).filter(Boolean))]
    .filter((o) => o.toLowerCase() !== EDGE_NONE)
    .slice(0, 6);
  return {
    id: followUpId(q),
    category: q.category,
    part: 'whole',
    family: q.family,
    view: q.view,
    kind: 'multi',
    question: clean(q.clarifyQuestion) || 'Which edges are finished differently?',
    options: [...(pairs.length ? pairs : ['other edges: different finish']), EDGE_NONE],
    contradicts: [],
    visualEvidence: '',
    clarifyQuestion: '',
    clarifyOptions: [],
    decisionKey: EDGE_EXCEPTIONS_KEY,
  };
}

/**
 * Вставка уточнения после `at`, если такого id в очереди нет. Потолок прогона выбран (W-C11) —
 * уточнение важнее последнего неотвеченного базового вопроса: он уходит, счёт остаётся QUIZ_MAX.
 */
export function insertClarify(
  queue: readonly DesignQuizQuestion[],
  at: number,
  clarify: DesignQuizQuestion | null,
): DesignQuizQuestion[] {
  if (!clarify) return queue.slice();
  if (queue.some((q) => q.id === clarify.id)) return queue.slice();
  let rest = queue.slice(at + 1);
  if (queue.length >= QUIZ_MAX) {
    let drop = -1;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!isFollowUpId(rest[i].id)) {
        drop = i;
        break;
      }
    }
    if (drop < 0) return queue.slice();
    rest = rest.filter((_, i) => i !== drop);
  }
  return [...queue.slice(0, at + 1), clarify, ...rest];
}

/**
 * ЗАПИСЬ — ТОЛЬКО СВОИ СТРОКИ (W-B1): сервер обновляет по `question.id`, чужие строки стоят. Строка
 * без выбора, без своих слов и не `skipped` — «забыть» этот id. Оптимистичный кэш повторяет то же.
 */
export const isForget = (a: DesignQuizAnswer) =>
  !a.skipped && !(a.selected ?? []).length && !clean(a.freeText);

export function forgetRow(q: DesignQuizQuestion): DesignQuizAnswer {
  return {
    question: q,
    selected: [],
    freeText: '',
    skipped: false,
    answeredAt: undefined,
    stale: undefined,
  };
}

export function applyRows(
  list: readonly DesignQuizAnswer[],
  rows: readonly DesignQuizAnswer[],
): DesignQuizAnswer[] {
  let next = list.slice();
  for (const r of rows) {
    const id = r.question?.id;
    if (isForget(r)) {
      next = next.filter((a) => a.question?.id !== id);
      continue;
    }
    // E1: тот же `decisionKey` под другим id — прежняя строка забывается (последний ответ решает),
    // как сервер делает в той же транзакции.
    const key = r.question?.decisionKey ?? '';
    if (key) next = next.filter((a) => a.question?.id === id || a.question?.decisionKey !== key);
    next = withAnswer(next, r);
  }
  return next;
}

/**
 * ═══ ПРОДОЛЖИТЬ ПРОГОН (W-C3) ═══════════════════════════════════════════════════════════════════
 *
 * Прогон живёт на сервере (E2, `pending` чтения ответов). Очередь вкладки в `sessionStorage`
 * (`quiz:<cardId>`) — лишь кэш курсора и вставленных уточнений: после генерации и каждого ответа.
 * Перезагрузка, другая вкладка или устройство — ряд предлагает `resume N`, без второго вызова модели.
 */
export type QuizSession = {
  cardId: number;
  family: string;
  queue: DesignQuizQuestion[];
  at: number;
  generatedAt: number;
};

const sessionKey = (cardId: number) => `quiz:${cardId}`;

export function readQuizSession(cardId: number): QuizSession | null {
  if (cardId <= 0) return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(cardId));
    if (!raw) return null;
    const s = JSON.parse(raw) as QuizSession;
    if (s?.cardId !== cardId || !Array.isArray(s.queue)) return null;
    return s;
  } catch {
    return null;
  }
}

export function writeQuizSession(s: QuizSession): void {
  try {
    window.sessionStorage.setItem(sessionKey(s.cardId), JSON.stringify(s));
  } catch {
    /* хранилище закрыто — продолжения не будет */
  }
}

export function clearQuizSession(cardId: number): void {
  try {
    window.sessionStorage.removeItem(sessionKey(cardId));
  } catch {
    /* нечего чистить */
  }
}

/**
 * Что осталось спросить (E2): ИСТОЧНИК — `pending` сервера (открытый прогон без сохранённых строк),
 * так `resume N` видит и другая вкладка, и другое устройство. Вкладочная очередь — только кэш
 * порядка: её неотвеченные уточнения (их нет на сервере) встают на свои места, пока сервер держит
 * прогон открытым. Сервер прогона не держит — продолжать нечего, что бы ни лежало во вкладке.
 */
export function remainingOf(
  pending: readonly DesignQuizQuestion[],
  s: QuizSession | null,
  answers: readonly DesignQuizAnswer[],
): DesignQuizQuestion[] {
  const saved = new Set(answers.map((a) => a.question?.id));
  const open = pending.filter((q) => !saved.has(q.id));
  if (!open.length) return [];
  if (!s) return open;
  const onServer = new Set(open.map((q) => q.id));
  const local = s.queue.filter(
    (q) => !saved.has(q.id) && (onServer.has(q.id) || isFollowUpId(q.id)),
  );
  const inLocal = new Set(local.map((q) => q.id));
  return [...local, ...open.filter((q) => !inLocal.has(q.id))];
}
