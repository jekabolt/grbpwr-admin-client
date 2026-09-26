import { useSyncExternalStore } from 'react';
import { useWatch, type Control, type UseFormReturn } from 'react-hook-form';

import type { TechCardFormData } from '../schema';

/**
 * ═══ ЗАСЕВ WORDS ЖИВЁТ ВНЕ ФОРМЫ (D-20'''', ревью раунда 3, M1) ════════════════════════════════
 *
 * D-20''' клал засев В ФОРМУ, только без пометки «грязно» (`shouldDirty: false`). Этого не хватило:
 * `isDirty` у react-hook-form — один на всю форму (`!deepEqual(getValues(), _defaultValues)`), а
 * запись карточки шлёт ВСЕ значения формы. Засев уезжал на сервер записями, которых никто не делал:
 *   · подъём стадии (`index.tsx`, auto-stage): `liveIsDirty` ложен — подъём идёт, `setValue('stage')`
 *     + `flush` пишут тело, и засев едет в нём; на «discard» найденного черновика — наверняка;
 *   · тихая запись с сохранённым назначением (флип в auxiliary): «значения без флипа» ≠ «сохранённое
 *     без флипа» только из-за засева — и тело пишется через 2 с после открытия FLAT;
 *   · синхронизация R-4 (`setValue(…, { shouldDirty: true })`) пересчитывала общий `isDirty` в истину
 *     из-за засева.
 *
 * РЕШЕНИЕ D-20'''': засев в значения формы НЕ ПОПАДАЕТ, пока человек не подействовал.
 *   · Предложенный текст живёт здесь, по карточке: `{ text, omitted }`.
 *   · Поле WORDS показывает значение формы, а пока оно пусто и засев не отдан — засев.
 *   · В форму («грязным») засев отдаёт первое действие человека: правка поля, ответ `ai ✦`, GENERATE
 *     (`materializeWords` перед `flush`). CLEAR пишет `''` и засев снимает (`dropWords`).
 *   · Все, кто читает «слова на экране», читают ОДНОГО помощника — `shownWords`/`useShownWords`:
 *     счётчик и «чистить нечего» у поля, WHAT THE MODEL GETS флэта, вопрос и план рекола.
 *
 * МОДУЛЬНЫЙ, по карточке, как прежний замок: секция размонтируется на каждой смене шага. Ключа нет —
 * о карточке ещё не решено; `null` — решено без засева (текст стоял, человек стёр, CLEAR), и до
 * перезагрузки страницы карточка больше не засевается.
 *
 * «ОТДАН В ФОРМУ» (materialized) — НЕ ФЛАГ, А ФАКТ ФОРМЫ (ревью раунда 4, MIN-4): засев показывается
 * тогда и только тогда, когда значение формы пусто, а предложение не снято. Поэтому:
 *   (a) неотданное предложение ИДЁТ ЗА ФАКТАМИ — эффект секции перезаписывает его текст на каждый
 *       новый `composed`; отданное стоит в форме и фактами не трогается;
 *   (b) форма, ПЕРЕБАЗИРОВАННАЯ в пустое (сброс черновика, «reload theirs», тихое перечтение), снова
 *       показывает предложение — отдача «сбрасывается» сама, без слежки за базой формы;
 *   (c) на карточке, которую нельзя писать или которая не сохраняется, предложения НЕ ВИДНО —
 *       читатели передают `live`, и слова на экране — значение формы.
 * Стёртое руками и CLEAR снимают предложение (`null`) — пустое поле остаётся пустым.
 */
export type WordsSeed = {
  /** Предложенный текст — то, что показано в пустом поле. */
  text: string;
  /** Сколько секций фактов не влезло в потолок поля (строка «+N omitted» под полем). */
  omitted: number;
};

const session = new Map<number, WordsSeed | null>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isBlank = (value: unknown): boolean => ((value ?? '') as string).trim() === '';

/** `undefined` — не решено; `null` — решено без засева; иначе — предложенный текст. */
export function readWordsSeed(card: number): WordsSeed | null | undefined {
  return card > 0 ? session.get(card) : null;
}

/** Засев карточки — живой, переживает смену шага. */
export function useWordsSeed(card: number): WordsSeed | null | undefined {
  const read = () => readWordsSeed(card);
  return useSyncExternalStore(subscribe, read, read);
}

/** Решено ли о карточке в этой сессии (засеяно, стояло, стёрто). */
export function wordsDecided(card: number): boolean {
  return card <= 0 || session.has(card);
}

/** Текст уже стоит (загружен, восстановлен, напечатан): в этой сессии поле не засевается. */
export function lockWords(card: number): void {
  if (wordsDecided(card)) return;
  session.set(card, null);
  notify();
}

/** Предложить засев — только если о карточке ещё ничего не решено. */
export function offerWords(card: number, text: string, omitted: number): void {
  if (wordsDecided(card)) return;
  session.set(card, { text, omitted });
  notify();
}

/** (a) Предложение идёт за фактами: новый `composed` — новый текст; снятое не возвращается. */
export function followWords(card: number, text: string, omitted: number): void {
  const seed = card > 0 ? session.get(card) : null;
  if (!seed || (seed.text === text && seed.omitted === omitted)) return;
  session.set(card, { text, omitted });
  notify();
}

/**
 * Человек подействовал сам — правкой, ответом `ai ✦`, реколом. Непустое значение стоит в форме и
 * засев не показывается само собой; ПУСТОЕ — стёрто руками: предложение снимается, и пустое поле
 * остаётся пустым до перезагрузки страницы.
 */
export function settleWords(card: number, value: unknown): void {
  if (card <= 0 || !isBlank(value) || session.get(card) === null) return;
  session.set(card, null);
  notify();
}

/** CLEAR: слова стёрты, засев снят и до перезагрузки страницы не вернётся. */
export function dropWords(card: number): void {
  if (card <= 0 || session.get(card) === null) return;
  session.set(card, null);
  notify();
}

/**
 * Слова на экране по засеву и значению формы. `live` — карточку можно писать и она сохраняется:
 * иначе предложения не видно (c).
 */
export function pickShownWords(
  seed: WordsSeed | null | undefined,
  stored: unknown,
  live: boolean,
): string {
  const value = (stored ?? '') as string;
  return live && seed && isBlank(value) ? seed.text : value;
}

/** СЛОВА НА ЭКРАНЕ СЕЙЧАС — для щелчков и планов: значение формы, а пока оно пусто — засев. */
export function shownWords(
  card: number,
  form: Pick<UseFormReturn<TechCardFormData>, 'getValues'>,
  live: boolean,
): string {
  return pickShownWords(readWordsSeed(card), form.getValues('garmentDescription'), live);
}

/** Слова на экране — живые, для отрисовки: подписаны и на поле формы, и на засев. */
export function useShownWords(
  card: number,
  control: Control<TechCardFormData>,
  live: boolean,
): string {
  const stored = useWatch({ control, name: 'garmentDescription' });
  const seed = useWordsSeed(card);
  return pickShownWords(seed, stored, live);
}

/**
 * GENERATE: засев, показанный в пустом поле, уходит в форму «грязным» ДО `flush` — эта запись его
 * и понесёт, и прогон прочтёт его из сохранённой карточки. Текст, который стоит в форме, не
 * трогается: показан ровно он. Не `live` — засева не видно (c), и в форму ничего не уходит.
 */
export function materializeWords(
  card: number,
  form: Pick<UseFormReturn<TechCardFormData>, 'getValues' | 'setValue'>,
  live: boolean,
): void {
  const seed = readWordsSeed(card);
  if (!live || !seed || !isBlank(form.getValues('garmentDescription'))) return;
  form.setValue('garmentDescription', seed.text, { shouldDirty: true });
}
