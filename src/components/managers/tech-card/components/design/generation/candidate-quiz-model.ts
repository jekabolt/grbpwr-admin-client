/**
 * ═══ WHICH SHEET — THREE TAPS, NO JUDGE (82-INPUT-REDESIGN §4.2 + owner 06.10 over 72-JUDGE) ════
 *
 * The owner, after 72-JUDGE: no auto-judge. A candidate run's sheets are chosen by a quiz:
 *   tap 1 · the SIDE views of every candidate side by side, + «none of these»;
 *   tap 2 · the chosen sheet's BACK: ok / not ok — not ok shows the other sheets' backs to pick from
 *           (+ «none of these»); a back picked there makes its sheet the chosen one;
 *   tap 3 · the chosen sheet's FRONT: ok / not ok — not ok shows the other sheets' fronts the same
 *           way; a front picked there ends the quiz on its sheet.
 * «none» anywhere stops at once: no sheet is picked, and the next step is a new GENERATE.
 * Pure: the screen holds the state, nothing is written until the end (`pickCandidate`).
 */

export type QuizView = 'side' | 'back' | 'front';

export type QuizState =
  | { step: 'side' }
  | { step: 'check'; view: 'back' | 'front'; sheet: number }
  | { step: 'others'; view: 'back' | 'front'; sheet: number }
  | { step: 'done'; sheet: number }
  | { step: 'none' };

export type QuizEvent =
  | { type: 'pick'; sheet: number }
  | { type: 'ok' }
  | { type: 'not-ok' }
  | { type: 'none' };

export const QUIZ_START: QuizState = { step: 'side' };

/** The sheets drawn on this step, in candidate order. */
export function quizChoices(state: QuizState, ids: readonly number[]): number[] {
  if (state.step === 'side') return [...ids];
  if (state.step === 'check') return [state.sheet];
  if (state.step === 'others') return ids.filter((id) => id !== state.sheet);
  return [];
}

/** The view a step shows. */
export function quizView(state: QuizState): QuizView | null {
  if (state.step === 'side') return 'side';
  if (state.step === 'check' || state.step === 'others') return state.view;
  return null;
}

export function quizStep(state: QuizState, event: QuizEvent, ids: readonly number[]): QuizState {
  if (event.type === 'none') {
    return state.step === 'side' || state.step === 'others' ? { step: 'none' } : state;
  }
  switch (state.step) {
    case 'side':
      if (event.type !== 'pick' || !ids.includes(event.sheet)) return state;
      return { step: 'check', view: 'back', sheet: event.sheet };
    case 'check':
      if (event.type === 'ok')
        return state.view === 'back'
          ? { step: 'check', view: 'front', sheet: state.sheet }
          : { step: 'done', sheet: state.sheet };
      if (event.type === 'not-ok') {
        // Only one sheet: nothing else to look at — not ok is «none».
        return ids.some((id) => id !== state.sheet)
          ? { step: 'others', view: state.view, sheet: state.sheet }
          : { step: 'none' };
      }
      return state;
    case 'others':
      if (event.type !== 'pick' || event.sheet === state.sheet || !ids.includes(event.sheet))
        return state;
      return state.view === 'back'
        ? { step: 'check', view: 'front', sheet: event.sheet }
        : { step: 'done', sheet: event.sheet };
    default:
      return state;
  }
}

/** «n / 3» for the caption: side 1, back 2, front 3. */
export function quizPosition(state: QuizState): number {
  const v = quizView(state);
  return v === 'side' ? 1 : v === 'back' ? 2 : v === 'front' ? 3 : 3;
}

/** The composite index of a view on the sheet (F, B, SL, SR), -1 when the sheet does not carry it. */
export function viewIndex(compositeViews: readonly string[], view: string): number {
  return compositeViews.findIndex((v) => v.trim().toLowerCase() === view);
}
