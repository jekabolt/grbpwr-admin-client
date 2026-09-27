import { createContext, useContext } from 'react';

/**
 * ═══ АВТОСЕЙВ КАРТОЧКИ — КОНТРАКТ МЕЖДУ ХЕДЕРОМ И ОРГАНАМИ ═════════════════════════════════════
 *
 * Волна 2026-09-25 (tmp/plans/techcard-ux-0925, D-16/D-16'). Провайдер живёт в `index.tsx`
 * (хук `useTechCardAutosave`), органы студии только читают статус и просят сохранить.
 *
 * ПОЧЕМУ КОНТЕКСТ, А НЕ ПРОП. Просить сохранение будут органы на разной глубине (черновик
 * конструкции после autoFill, GENERATE флэта перед платным прогоном, авто-стейдж); тянуть пару
 * «статус + двери» через StudioTab → шаг → блок значило бы дописать проп каждому промежуточному
 * органу. Контекст с умолчанием `OFF` даёт стендам и печатной странице честное «автосейва нет»
 * без единого провайдера.
 *
 * ⚠ `flush` — ЕДИНСТВЕННЫЙ способ убедиться, что сервер прочитает свежие значения. Прогон
 * (StartDesignRun, DraftDesignIdea) читает СОХРАНЁННУЮ карточку, поэтому любая платная дверь
 * обязана `await flush()` и стартовать только при `ok` или `nothing`. `request` — лишь «сохрани
 * скоро» (дебаунс), для платных дверей его недостаточно (ревью Codex B-05).
 */
export type AutosaveStatus =
  /** Провайдера нет или автосейв выключен (создание карточки, frozen, нет прав). */
  | 'off'
  /** Нечего сохранять. */
  | 'idle'
  /** Есть изменения, таймер идёт. */
  | 'dirty'
  | 'saving'
  /** Последнее сохранение прошло целиком (тело и очередь панелей чисты). */
  | 'saved'
  /** Форма не проходит валидацию — не сохраняем, ждём правки. */
  | 'invalid'
  /** Смена purpose sellable→auxiliary ждёт явного подтверждения (диалог конверта). */
  | 'needs-confirm'
  /** 409: сервер ушёл вперёд, открыта модалка конфликта; автосейв на паузе. */
  | 'conflict'
  /**
   * Сетевая/серверная ошибка; повторы идут сами — 5 / 15 / 45 с, дальше каждые 30 с (D-59). Отказ
   * сервера самому телу (4xx, D-66) повторов по таймеру не получает: см. `refusal`.
   */
  | 'error';

/** Исход `flush`: только `ok` и `nothing` разрешают платную дверь. */
export type FlushResult =
  | 'ok'
  | 'nothing'
  | 'invalid'
  | 'needs-confirm'
  | 'conflict'
  | 'error'
  | 'off'
  /** Карточка не затихла за все проходы flush: её правили, пока дверь ждала. Запись не падала (R-10). */
  | 'busy';

export type AutosaveApi = {
  status: AutosaveStatus;
  /** Когда последний раз сохранилось целиком (ms since epoch). */
  lastSavedAt?: number;
  /** Сколько ошибок валидации держат сохранение (при `invalid`). */
  errorsCount?: number;
  /** Человекочитаемая причина при `error`/`conflict`/`needs-confirm`. */
  message?: string;
  /**
   * D-66: при `error` — слова сервера, когда он ОТКАЗАЛ самому телу (4xx, который повтор не изменит).
   * Такую запись карточка по таймеру не повторяет: она уходит снова со следующей правкой. Иначе нет.
   */
  refusal?: string;
  /** «Сохрани скоро»: перезапускает дебаунс. `reason` — для логов/телеметрии, не для UI. */
  request: (reason: string) => void;
  /** «Сохрани сейчас и скажи, вышло ли». Ждёт завершения текущего сохранения, если оно идёт. */
  flush: (reason: string) => Promise<FlushResult>;
};

const noop = () => {};

/** Умолчание: автосейва нет — стенды, печать, режим создания. */
export const AUTOSAVE_OFF: AutosaveApi = {
  status: 'off',
  request: noop,
  flush: async () => 'off',
};

export const AutosaveContext = createContext<AutosaveApi>(AUTOSAVE_OFF);

/** Читатель контракта. Провайдер — `index.tsx`. */
export function useTechCardAutosave(): AutosaveApi {
  return useContext(AutosaveContext);
}

/** Одна проверка на все платные двери: можно ли стартовать прогон после flush. */
export function flushAllowsRun(r: FlushResult): boolean {
  return r === 'ok' || r === 'nothing' || r === 'off';
}

/**
 * Одна фраза отказа на все платные двери, когда flush не разрешил. `refusal` — `AutosaveApi.refusal`:
 * над отказом сервера (D-66) «keeps retrying on its own» было бы неправдой, и дверь говорит его слова.
 */
export function flushRefusalSentence(
  r: FlushResult,
  errorsCount?: number,
  refusal?: string,
): string {
  switch (r) {
    case 'invalid':
      return errorsCount
        ? `fix ${errorsCount} field${errorsCount === 1 ? '' : 's'} first — the card saves itself once it validates`
        : 'fix the fields first — the card saves itself once it validates';
    case 'needs-confirm':
      return 'confirm the switch to auxiliary first — the card saves itself once you do';
    case 'conflict':
      return 'decide the conflict first — someone else saved this card meanwhile';
    case 'error':
      return refusal
        ? `the card is not saved — ${refusal}`
        : 'the card is not saved yet — the last save failed and it keeps retrying on its own';
    case 'busy':
      return 'the card kept changing while it was being saved — try again in a moment';
    default:
      return '';
  }
}
