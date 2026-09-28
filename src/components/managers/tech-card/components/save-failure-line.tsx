import Text from 'ui/components/text';
import type { AutosaveStatus } from './design/autosave-contract';
import { saveSentence } from './save-status-chip';
import type { FormErrorRow } from './stage-progress';
import type { MachineState } from './useTechCardAutosave';

/**
 * ═══ СОХРАНЕНИЕ НЕ ПРОШЛО — ОДНА СТРОКА НАВЕРХУ ФОРМЫ (27.09 · O-64, D-63; r2 — D-63′) ══════════════
 *
 * Владелец, над баннером «unsaved work was found — 4 drafts…»: «этого быть не должно оно просто должно
 * автосохранять все и все если сохранение не прошло просто на этом месте должна быть ошибка».
 * Локальных черновиков у карточки больше нет. Там, где стоял их баннер, стоит эта строка — и только
 * когда запись НЕ прошла:
 *   invalid  — фраза чипа («N fields do not validate; nothing is saved until they do»), дверь
 *              «→ field» — тот же путь к первому полю, что у первой строки поповера чипа;
 *   error    — фраза чипа («the last save failed: <причина>; the card keeps retrying on its own»);
 *              отказ самому телу (4xx, D-66) — слова сервера ДОСЛОВНО, без обещания повторов; потолок
 *              `restaged` — его правдивая фраза («the card kept changing while it was being saved — it
 *              retries on its own»);
 *   conflict — фраза чипа («another editor saved this card meanwhile» / «someone saved this card
 *              meanwhile; autosave waits for your decision»), дверь «→ decide» к модалке;
 *   off/auth — 401/403 остановили сохранение до конца жизни страницы (D-66′, T61 r5): «the card is not
 *              saved and no longer saves itself — …» и слова сервера. Чипа при `off` нет, и сказать
 *              это больше негде.
 * При `saved` / `saving` / `dirty` / `needs-confirm` / `idle` и прочем `off` строки нет: об этом говорит
 * чип в шапке, а второй чип здесь не нужен.
 *
 * ТЕКСТ — РОВНО ФРАЗА ЧИПА для того же состояния машины, из ОДНОЙ функции (`saveSentence`,
 * save-status-chip.tsx; D-63′, ревью Codex O-64): строка не сочиняет своих слов, и над удержанным
 * отказом обе говорят то, что сказал сервер (`refusal` — сырые слова, которых techCardErrorMessage
 * не переписывает).
 *
 * СЛОТ СТОИТ ВСЕГДА (D-63′): пустой при удачной записи, высотой в одну строку текста — строка, которая
 * появляется и уходит, не двигает рельсу вкладок вверх-вниз. И он же — живая область
 * (`role=status`, `aria-live=polite`, `aria-atomic`): читалка узнаёт, что запись не прошла, не
 * дожидаясь фокуса.
 *
 * DESIGN.md: без рамки — это не callout (тот стоит, пока его не решат, а строка уходит сама, как только
 * запись легла), тон warn — красный текст обычным регистром (`errorLabel`), ОДНА дверь, и та —
 * текстового размера (подчёркнутое слово, как «→ tab» в поповере чипа), не кнопка.
 */
export type SaveFailure = {
  kind: 'invalid' | 'error' | 'refused' | 'conflict' | 'auth';
  sentence: string;
};

/** Whether a status is a save that did not pass, and which kind — or null (nothing to say). */
function failureKindOf(
  status: AutosaveStatus,
  cause: MachineState['cause'],
): SaveFailure['kind'] | null {
  switch (status) {
    case 'invalid':
      return 'invalid';
    case 'conflict':
      return 'conflict';
    case 'error':
      // D-66: a refusal of the body itself is held, not retried — its line is the server's words.
      return cause === 'refused' ? 'refused' : 'error';
    case 'off':
      // D-66′: a 401/403 stopped the card saving — the server's words say which (the session, the rights).
      return cause === 'auth' ? 'auth' : null;
    default:
      return null;
  }
}

/** The line for a status, or null — the one rule the page and the probe read. */
export function saveFailureOf(
  status: AutosaveStatus,
  errorsCount: number | undefined,
  message: string | undefined,
  cause: MachineState['cause'],
  refusal: string | undefined,
): SaveFailure | null {
  const kind = failureKindOf(status, cause);
  if (!kind) return null;
  // D-63′: exactly the chip's sentence for this machine state — one source, no second wording.
  return { kind, sentence: saveSentence(status, message, errorsCount, cause, refusal) };
}

// A text-sized door: the underlined word, the app's focus ring — no button chrome (DESIGN.md).
const DOOR =
  'shrink-0 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

export function SaveFailureLine({
  status,
  errorsCount,
  message,
  cause,
  refusal,
  firstError,
  onRevealError,
  onOpenConflict,
}: {
  status: AutosaveStatus;
  errorsCount?: number;
  message?: string;
  cause?: MachineState['cause'];
  refusal?: string;
  /** `invalid`: the first field that holds the write — the door walks to it. */
  firstError?: FormErrorRow;
  onRevealError: (path: string) => void;
  onOpenConflict: () => void;
}) {
  const failure = saveFailureOf(status, errorsCount, message, cause, refusal);
  return (
    // The slot is always here, one line of micro text high (`1lh` of its own `text-micro`), so the
    // line's coming and going moves nothing below it; a live region, so it is announced (D-63′).
    <div
      role='status'
      aria-live='polite'
      aria-atomic='true'
      className='mt-2.5 min-h-[1lh] text-micro'
      data-save-failure-slot=''
    >
      {failure && (
        <div
          className='flex flex-wrap items-baseline gap-x-3 gap-y-1'
          data-save-failure={failure.kind}
        >
          <Text size='micro' variant='errorLabel' component='p' className='min-w-0'>
            {failure.sentence}
          </Text>
          {failure.kind === 'invalid' && firstError && (
            <button
              type='button'
              className={DOOR}
              aria-label={`go to ${firstError.path}`}
              onClick={() => onRevealError(firstError.path)}
            >
              <Text size='micro' variant='label' component='span'>
                → field
              </Text>
            </button>
          )}
          {failure.kind === 'conflict' && (
            <button type='button' className={DOOR} onClick={onOpenConflict}>
              <Text size='micro' variant='label' component='span'>
                → decide
              </Text>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
