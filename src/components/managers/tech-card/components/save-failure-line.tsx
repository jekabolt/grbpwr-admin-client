import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { flushRefusalSentence, type AutosaveStatus } from './design/autosave-contract';
import type { FormErrorRow } from './stage-progress';
import type { MachineState } from './useTechCardAutosave';

/**
 * ═══ СОХРАНЕНИЕ НЕ ПРОШЛО — ОДНА СТРОКА НАВЕРХУ ФОРМЫ (27.09 · O-64, D-63) ═══════════════════════════
 *
 * Владелец, над баннером «unsaved work was found — 4 drafts…»: «этого быть не должно оно просто должно
 * автосохранять все и все если сохранение не прошло просто на этом месте должна быть ошибка».
 * Локальных черновиков у карточки больше нет. Там, где стоял их баннер, стоит эта строка — и только
 * когда запись НЕ прошла:
 *   invalid  — «fix N field(s) first — the card saves itself once it validates», дверь «→ field» —
 *              тот же путь к первому полю, что у первой строки поповера чипа;
 *   error    — «the card is not saved yet — the last save failed and it keeps retrying on its own» и
 *              причина сервера, если она есть; отказ самому телу (4xx, D-66) — слова сервера как есть
 *              («the card is not saved — …»): такую запись по таймеру никто не повторяет; потолок
 *              `restaged` — «the card kept changing while it was being saved — it retries on its own»;
 *   conflict — «decide the conflict first — someone else saved this card meanwhile», дверь к модалке.
 * При `saved` / `saving` / `dirty` / `needs-confirm` / `idle` / `off` строки нет: об этом говорит чип в
 * шапке, а второй чип здесь не нужен. Слова — те же, что у чипа и у дверей (`flushRefusalSentence`).
 *
 * DESIGN.md: без рамки — это не callout (тот стоит, пока его не решат, а строка уходит сама, как только
 * запись легла), тон warn — красный текст обычным регистром (`errorLabel`), ОДНА дверь.
 */
export type SaveFailure = {
  kind: 'invalid' | 'error' | 'refused' | 'conflict';
  sentence: string;
};

/** The line for a status, or null — the one rule the page and the probe read. */
export function saveFailureOf(
  status: AutosaveStatus,
  errorsCount: number | undefined,
  message: string | undefined,
  cause: MachineState['cause'],
  refusal: string | undefined,
): SaveFailure | null {
  switch (status) {
    case 'invalid':
      return { kind: 'invalid', sentence: flushRefusalSentence('invalid', errorsCount) };
    case 'conflict':
      return { kind: 'conflict', sentence: flushRefusalSentence('conflict') };
    case 'error':
      if (refusal !== undefined) {
        return { kind: 'refused', sentence: flushRefusalSentence('error', errorsCount, refusal) };
      }
      if (cause === 'restaged') {
        return {
          kind: 'error',
          sentence: 'the card kept changing while it was being saved — it retries on its own',
        };
      }
      return {
        kind: 'error',
        sentence: `${flushRefusalSentence('error')}${message ? ` — ${message}` : ''}`,
      };
    default:
      return null;
  }
}

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
  if (!failure) return null;
  return (
    <div className='mt-2.5 flex flex-wrap items-center gap-2' data-save-failure={failure.kind}>
      <Text size='micro' variant='errorLabel' component='p' className='min-w-0 flex-1'>
        {failure.sentence}
      </Text>
      {failure.kind === 'invalid' && firstError && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          aria-label={`go to ${firstError.path}`}
          onClick={() => onRevealError(firstError.path)}
        >
          → field
        </Button>
      )}
      {failure.kind === 'conflict' && (
        <Button type='button' variant='secondary' size='sm' onClick={onOpenConflict}>
          → decide
        </Button>
      )}
    </div>
  );
}
