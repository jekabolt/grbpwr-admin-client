import { useSyncExternalStore } from 'react';

/**
 * ═══ АНГЛИЙСКИЙ БРИФ ДЛЯ WORDS — ОДИН ВЫЗОВ НА ТЕКСТ (T03, 03.10) ═══════════════════════════════
 *
 * Засев WORDS (`use-words-seeding.ts`) больше не копирует свободный текст мудборда: он просит
 * `EnhanceText` (PROMPT · WORDS) переписать его английским брифом для флэта. Вызов платный и под
 * лимитом (30 в час на админа, общий с `ai ✦`), поэтому здесь — память ответов НА СЕССИЮ, по паре
 * ТЕКСТ + КОНТЕКСТ (`briefKey`; R3, 03.10): контекст — строки словаря карточки (вещь, посадка,
 * категория), и бриф, написанный под одни факты, под другие не годится:
 *   · одна пара — один вызов: повтор той же пары (рендер, смена шага, второй экран) берёт память;
 *     новый текст ИЛИ новые факты — новый вызов (дребезг набора гасит вызывающий, по той же паре);
 *   · отказ, лимит, сеть — `failed` для этого текста, без повторов: WORDS остаётся каким был, а
 *     сырого текста в нём не появляется никогда;
 *   · `pending` — шума нет: вызывающий просто ждёт.
 * Вызов сети передаётся снаружи (`fetcher`), чтобы файл проверялся пробой без сети.
 */
export type BriefState =
  | { status: 'pending' }
  | { status: 'done'; text: string }
  | { status: 'failed' };

export type BriefFetcher = (req: { text: string; context: string }) => Promise<string>;

const memo = new Map<string, BriefState>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ключ памяти и личность дребезга — пара текст + контекст: равная пара = равный ключ. Без текста
 * звать некого — ключ пуст.
 */
export function briefKey(text: string, context: string): string {
  return text ? JSON.stringify([text, context]) : '';
}

export function readBrief(text: string, context: string): BriefState | undefined {
  const key = briefKey(text, context);
  return key ? memo.get(key) : undefined;
}

/** Попросить бриф для пары — ровно один раз за сессию; повтор той же пары ничего не шлёт. */
export function requestBrief(text: string, context: string, fetcher: BriefFetcher): void {
  const key = briefKey(text, context);
  if (!key || memo.has(key)) return;
  memo.set(key, { status: 'pending' });
  notify();
  fetcher({ text, context }).then(
    (answer) => {
      const t = (answer ?? '').trim();
      memo.set(key, t ? { status: 'done', text: t } : { status: 'failed' });
      notify();
    },
    () => {
      memo.set(key, { status: 'failed' });
      notify();
    },
  );
}

export function useBrief(text: string, context: string): BriefState | undefined {
  const read = () => readBrief(text, context);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * ЧТО ЗАСЕВ ДЕЛАЕТ С БРИФОМ СЕЙЧАС.
 *   · свободного текста нет — `{ brief: undefined }`: WORDS = строки словаря, звать некого;
 *   · текст или факты ещё меняются (`settled` — ключ `briefKey` — отстал) или ответ в пути —
 *     `wait`: засев не трогается;
 *   · ответ есть — `{ brief }`;
 *   · отказ — `keep`: стоящее предложение не меняется, а новое выходит без брифа — НИКОГДА с
 *     сырым текстом.
 */
export type BriefPlan = { brief: string | undefined } | 'wait' | 'keep';

export function briefPlan(
  source: string,
  settled: string,
  state: BriefState | undefined,
): BriefPlan {
  if (!source) return { brief: undefined };
  if (settled !== source || !state || state.status === 'pending') return 'wait';
  if (state.status === 'failed') return 'keep';
  return { brief: state.text };
}

/** Только для пробы: память сессии с чистого листа. */
export function resetBriefs(): void {
  memo.clear();
  notify();
}
