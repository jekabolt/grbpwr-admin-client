import { useSyncExternalStore } from 'react';

/**
 * ═══ WORDS ИДУТ ЗА МУДБОРДОМ (T56, 04.10) ═══════════════════════════════════════════════════════
 *
 * Владелец: «если в мудборде поменялся DESCRIPTION то и в flat WORDS его наверно надо обновить так
 * же в FABRIC RENDER … там не обязательно должны быть 1 к 1». Засев (`use-words-seeding.ts`)
 * предлагает слова, только пока поле пусто; отданные в форму слова мудборд больше не догоняли.
 *
 * ЗАПИСЬ ПО КАРТОЧКЕ И ЭКРАНУ — `{ source, text }`: из какого источника брифа (`briefKey`: свободный
 * текст мудборда + строки словаря) и какой авто-текст стоял в поле. Живёт в localStorage, чтобы
 * пережить перезагрузку: карточка, открытая завтра с новым описанием, тоже догоняет.
 *   · источник сменился, а слова = авто-текст записи (руками не правили) — бриф заново, и слова
 *     ЗАМЕНЯЮТСЯ (во флэте — грязной правкой формы, её сохранит автосейв);
 *   · правили руками — не трогаем: рядом с подписью тихая ссылка `moodboard changed · rewrite ✦`;
 *   · записи нет (слова стояли до T56) — пишется база `{ source, text: '' }`: со следующей сменой
 *     источника человек увидит ссылку, а не потерю своих слов.
 */
export type WordsFollowScreen = 'flat' | 'render';
export type WordsRecord = { source: string; text: string };

const STORE_PREFIX = 'tc-words-follow:';
const cache = new Map<string, WordsRecord | null>();
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

const recordKey = (card: number, screen: WordsFollowScreen) => `${STORE_PREFIX}${screen}:${card}`;

export function readWordsRecord(card: number, screen: WordsFollowScreen): WordsRecord | null {
  if (card <= 0) return null;
  const key = recordKey(card, screen);
  if (cache.has(key)) return cache.get(key) ?? null;
  let rec: WordsRecord | null = null;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Partial<WordsRecord>) : null;
    if (parsed && typeof parsed.source === 'string' && typeof parsed.text === 'string') {
      rec = { source: parsed.source, text: parsed.text };
    }
  } catch {
    rec = null;
  }
  cache.set(key, rec);
  return rec;
}

export function writeWordsRecord(card: number, screen: WordsFollowScreen, rec: WordsRecord): void {
  if (card <= 0) return;
  const prev = readWordsRecord(card, screen);
  if (prev && prev.source === rec.source && prev.text === rec.text) return;
  const key = recordKey(card, screen);
  cache.set(key, rec);
  try {
    window.localStorage.setItem(key, JSON.stringify(rec));
  } catch {
    // нет хранилища — запись живёт до перезагрузки
  }
  notify();
}

export function useWordsRecord(card: number, screen: WordsFollowScreen): WordsRecord | null {
  const read = () => readWordsRecord(card, screen);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Что делать со словами, стоящими в поле:
 *   · `none` — слов нет (это дело засева), источник ещё набирается, или он не менялся;
 *   · `baseline` — записи нет: записать базу;
 *   · `auto` — источник сменился, слова = авто-текст: переписать сами;
 *   · `offer` — источник сменился, слова правлены руками: показать ссылку.
 */
export type FollowPlan = 'none' | 'baseline' | 'auto' | 'offer';

export function followPlan(
  own: string,
  rec: WordsRecord | null,
  key: string,
  settled: string,
): FollowPlan {
  if (own.trim() === '' || settled !== key) return 'none';
  if (!rec) return 'baseline';
  if (rec.source === key) return 'none';
  return own.trim() === rec.text.trim() ? 'auto' : 'offer';
}

/**
 * ═══ СВОЙ ЗАСЕВ FABRIC RENDER (T56) ═════════════════════════════════════════════════════════════
 *
 * IN WORDS рендера по умолчанию показывал слова флэта байт в байт (O-61). Теперь, когда у мудборда
 * есть свободный текст, у рендера свой бриф (EnhanceText · RENDER_WORDS: ткань, цвет, драпировка,
 * поверхность), и умолчание — он. Брифа нет (нет текста, ждём, отказ) — прежнее умолчание, слова
 * флэта. Пишет засев `useRenderWordsFollow` (`use-words-seeding.ts`), читает черновик подачи
 * (`render/drafts.ts`), формы ему не нужно.
 */
const renderSeeds = new Map<number, string>();

export function setRenderSeed(card: number, text: string | null): void {
  if (card <= 0) return;
  if ((renderSeeds.get(card) ?? null) === text) return;
  if (text) renderSeeds.set(card, text);
  else renderSeeds.delete(card);
  notify();
}

export function useRenderSeed(card: number): string | null {
  const read = () => renderSeeds.get(card) ?? null;
  return useSyncExternalStore(subscribe, read, read);
}
