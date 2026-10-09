import { useSyncExternalStore } from 'react';

/**
 * ═══ КВИЗ ИДЁТ — ФАКТЫ КАРТОЧКИ ДЕРЖАТ РЕШЕНИЯ (W-C2, 61-QUICKWINS) ═════════════════════════════
 *
 * Каждый ответ менял `CardFacts.decisions` → ключ брифа WORDS / render-words → через 2.5 с новый
 * платный `EnhanceText`. Пока прогон квиза открыт, `useCardFacts` держит решения такими, какими они
 * были в начале прогона; закрылся (последний ответ, `later`, уход с экрана) — решения догоняют
 * одним шагом, и бриф идёт один раз.
 */
const live = new Set<number>();
const listeners = new Set<() => void>();

export function setQuizLive(cardId: number, on: boolean): void {
  if (cardId <= 0 || live.has(cardId) === on) return;
  if (on) live.add(cardId);
  else live.delete(cardId);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useQuizLive(cardId: number): boolean {
  const read = () => cardId > 0 && live.has(cardId);
  return useSyncExternalStore(subscribe, read, read);
}
