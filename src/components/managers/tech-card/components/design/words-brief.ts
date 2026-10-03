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

/**
 * ═══ GENERATE ЖДЁТ БРИФ, КОТОРЫЙ УЖЕ В ПУТИ (R2, 03.10) ════════════════════════════════════════
 *
 * Пока бриф в пути, засев не выходит (`wait`), и WORDS на экране пусто. GENERATE, нажатый в это
 * окно, отдал бы в форму пустое (`materializeWords`), и платный прогон ушёл бы без брифа. Поэтому
 * каждый путь GENERATE, отдающий засев, сначала зовёт `settleSeedBrief`: если для ТЕКУЩЕЙ пары
 * карточки (её отмечает засев, `noteSeedBrief`) ответ в пути — ждёт его, не дольше
 * `BRIEF_WAIT_MS`, и ещё один такт, за который эффект засева успевает выставить предложение. После
 * ожидания вызывающий сам перепроверяет карточку; набранные руками WORDS `materializeWords` не
 * трогает и так. Пока ждём, `briefAwaited` пускает засев сквозь замок прогона флэта: прогон ещё не
 * отдал слова, и ждёт он именно их.
 */
export const BRIEF_WAIT_MS = 20_000;

const seedKeys = new Map<number, string>();
const waiting = new Set<number>();

/** Засев карточки ждёт бриф этой пары (`''` — не ждёт ничего). */
export function noteSeedBrief(card: number, key: string): void {
  if (card <= 0 || (seedKeys.get(card) ?? '') === key) return;
  if (key) seedKeys.set(card, key);
  else seedKeys.delete(card);
  notify();
}

/** Бриф текущей пары карточки в пути. */
export function seedBriefInFlight(card: number): boolean {
  const key = seedKeys.get(card);
  return !!key && memo.get(key)?.status === 'pending';
}

/** GENERATE этой карточки сейчас ждёт бриф. */
export function briefAwaited(card: number): boolean {
  return waiting.has(card);
}

/**
 * Дождаться брифа в пути: `none` — ждать нечего, `waited` — дождались (или вышел срок), `busy` —
 * эту карточку уже ждёт другой GENERATE (второй щелчок не заводит второго прогона).
 */
export async function settleSeedBrief(
  card: number,
  ms: number = BRIEF_WAIT_MS,
): Promise<'none' | 'waited' | 'busy'> {
  if (waiting.has(card)) return 'busy';
  if (!seedBriefInFlight(card)) return 'none';
  waiting.add(card);
  try {
    await new Promise<void>((resolve) => {
      let stop = () => {};
      const done = () => {
        stop();
        resolve();
      };
      const timer = setTimeout(done, ms);
      stop = subscribe(() => {
        if (seedBriefInFlight(card)) return;
        clearTimeout(timer);
        done();
      });
    });
    // Такт на эффект засева: ответ пришёл — предложение встаёт в той же очереди микрозадач.
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    waiting.delete(card);
  }
  return 'waited';
}

/** Только для пробы: память сессии с чистого листа. */
export function resetBriefs(): void {
  memo.clear();
  seedKeys.clear();
  waiting.clear();
  notify();
}
