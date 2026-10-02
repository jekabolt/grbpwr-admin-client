import { useSyncExternalStore } from 'react';

/**
 * ═══ АНГЛИЙСКИЙ БРИФ ДЛЯ WORDS — ОДИН ВЫЗОВ НА ТЕКСТ (T03, 03.10) ═══════════════════════════════
 *
 * Засев WORDS (`use-words-seeding.ts`) больше не копирует свободный текст мудборда: он просит
 * `EnhanceText` (PROMPT · WORDS) переписать его английским брифом для флэта. Вызов платный и под
 * лимитом (30 в час на админа, общий с `ai ✦`), поэтому здесь — память ответов НА СЕССИЮ, по тексту:
 *   · один текст — один вызов: повтор того же текста (рендер, смена шага, второй экран) берёт
 *     память; новый текст — новый вызов (дребезг набора гасит вызывающий);
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

/** Ключ памяти — сам текст (не длиннее 4000 рун): равный текст = равный ключ. */
export function readBrief(text: string): BriefState | undefined {
  return text ? memo.get(text) : undefined;
}

/** Попросить бриф для текста — ровно один раз за сессию; повтор того же текста ничего не шлёт. */
export function requestBrief(text: string, context: string, fetcher: BriefFetcher): void {
  if (!text || memo.has(text)) return;
  memo.set(text, { status: 'pending' });
  notify();
  fetcher({ text, context }).then(
    (answer) => {
      const t = (answer ?? '').trim();
      memo.set(text, t ? { status: 'done', text: t } : { status: 'failed' });
      notify();
    },
    () => {
      memo.set(text, { status: 'failed' });
      notify();
    },
  );
}

export function useBrief(text: string): BriefState | undefined {
  const read = () => readBrief(text);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * ЧТО ЗАСЕВ ДЕЛАЕТ С БРИФОМ СЕЙЧАС.
 *   · свободного текста нет — `{ brief: undefined }`: WORDS = строки словаря, звать некого;
 *   · текст ещё набирается (`settled` отстал) или ответ в пути — `wait`: засев не трогается;
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
