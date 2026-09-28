import type { FlushResult } from './design/autosave-contract';

/**
 * ═══ «ARCHIVE & SWITCH» ЖДЁТ ЗАПИСЬ, УЖЕ УШЕДШУЮ НА ПРОВОД (O-60 r4 · P1-2; D-66′ · T61 r5) ════════
 *
 * Диалог перевода в auxiliary открывается на жесте (D-59), а тихая запись правок до жеста может ещё
 * лететь. Смена purpose уходит ПОСЛЕ неё, не рядом: подтверждение сначала ждёт её (flush при паузе
 * ничего не пишет сам — его цикл отвечает `needs-confirm`), и только потом архивирует колорвеи —
 * необратимо. Поэтому здесь два решения, и оба вынесены из страницы, чтобы проба гоняла их без неё
 * (`scripts/techcard-autosave-probe.mjs`, (11)):
 *   · ОЖИДАНИЕ отменяемо (✕, Esc, «keep sellable» — `signal`) и ограничено (`CONVERT_WAIT_MS`): ничего
 *     ещё не случилось, и повисшая запись не держит диалог;
 *   · ПРИГОВОР после ожидания (`convertVerdict`) — одна таблица: архив начинается только над тем, что
 *     диалог ждёт услышать (своя пауза `needs-confirm`, тихая карточка `ok` / `nothing`), над живой
 *     страницей и над карточкой, которая сохраняет себя сама, — прочитанными СЕЙЧАС, прямо перед
 *     необратимым. `off` (карточка перестала сохраняться: 401/403, выпуск где-то ещё, страница ушла),
 *     `error`, конфликт, отказ сервера — ничего не архивируется.
 */

/**
 * How long «archive & switch» waits for a write that was already on the wire (O-60 r4, P1-2). The API has
 * no request timeout, and a hung write must not hold the dialog: past this the confirm says so and is
 * live again, nothing archived.
 */
export const CONVERT_WAIT_MS = 15_000;
export type ConvertWait = FlushResult | 'aborted' | 'timeout';

/** The clock the wait runs on — the page's, or a probe's fake one. */
export type WaitTimers = {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};
const PAGE_TIMERS: WaitTimers = {
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * The flush, awaited only until the operator cancels (`signal`) or `ms` pass. Nothing underneath is
 * cancelled: the write in flight goes on and the autosave settles it as usual — only the dialog stops
 * waiting for it. The first answer is the answer.
 */
export function waitForTheWrite(
  flush: Promise<FlushResult>,
  signal: AbortSignal,
  ms: number,
  timers: WaitTimers = PAGE_TIMERS,
): Promise<ConvertWait> {
  return new Promise((resolve) => {
    let timer: unknown = null;
    let answered = false;
    const done = (v: ConvertWait) => {
      if (answered) return;
      answered = true;
      if (timer != null) timers.clearTimer(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(v);
    };
    const onAbort = () => done('aborted');
    if (signal.aborted) {
      done('aborted');
      return;
    }
    signal.addEventListener('abort', onAbort);
    timer = timers.setTimer(() => done('timeout'), ms);
    flush.then(done, () => done('error'));
  });
}

/** What the confirm does once the wait is over — the one table the page acts on. */
export type ConvertVerdict =
  /** Archive the live colourways, then write the switch. */
  | { go: true }
  /**
   * Nothing is archived. `say` — why, in the dialog when `keep` (it stays open, its confirm live again),
   * otherwise as a toast with the dialog closed. Nothing is said when the operator cancelled or left.
   */
  | { go: false; say?: string; keep?: boolean };

export function convertVerdict(
  waited: ConvertWait,
  live: {
    /** The page is still on screen. */
    mounted: boolean;
    /** The card still saves itself (`AutosaveController.savesNow`). */
    saves: boolean;
    /** The conflict decision is open. */
    conflict: boolean;
    /** The server's words over a refused last write (`AutosaveController.refusalNow`). */
    refusal?: string;
  },
): ConvertVerdict {
  // Cancelled while waiting (✕, Esc, «keep sellable»: dismissConvert has put the purpose back), or the
  // page left — nobody is here to answer, and nothing irreversible happens behind their back.
  if (waited === 'aborted' || !live.mounted) return { go: false };
  if (waited === 'timeout') {
    return {
      go: false,
      keep: true,
      say: 'the card is still saving — try the switch again in a moment',
    };
  }
  // O-60 r4 (P1-1): the write it waited for came back 409, and the conflict decision is open. Nothing is
  // archived over a card that can no longer be written; the switch stays in the form — «keep mine &
  // overwrite» brings this dialog back with the rest of the card.
  if (waited === 'conflict' || live.conflict) {
    return { go: false, say: 'someone else saved this card meanwhile — decide the conflict first' };
  }
  // D-66: the server refused the card's last write (a 4xx the same body earns again), and the switch
  // would carry that same body. The switch stays in the form — once a change lands, the chip's «confirm
  // the switch ›» brings this dialog back.
  if (live.refusal) {
    return {
      go: false,
      say: `nothing was archived — the server refused the last save: ${live.refusal}`,
    };
  }
  // D-66′ (T61 r5): only what the dialog expects to hear opens the archive — its own pause (`needs-confirm`:
  // the dialog holds the autosave) or a quiet card (`ok` / `nothing`) — over a card that still saves
  // itself, read now. `off` (401/403, a release elsewhere, the page going) or an `error` nobody
  // classified: nothing is archived.
  const expected = waited === 'needs-confirm' || waited === 'ok' || waited === 'nothing';
  if (!expected || !live.saves) {
    return {
      go: false,
      say:
        waited === 'off' || !live.saves
          ? 'nothing was archived — the card stopped saving'
          : 'nothing was archived — the card could not be saved; try the switch again',
    };
  }
  return { go: true };
}
