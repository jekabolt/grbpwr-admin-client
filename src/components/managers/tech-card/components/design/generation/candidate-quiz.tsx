import type { common_DesignPicture, common_DesignRun } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { normaliseViewKey } from '../views';
import {
  QUIZ_START,
  quizChoices,
  quizPosition,
  quizStep,
  quizView,
  viewIndex,
  type QuizEvent,
  type QuizState,
} from './candidate-quiz-model';
import { pickCandidate, rejectCandidates } from './candidates';
import { detectSplitOf } from './detect-split-image';
import type { SplitFrame } from './detect-split';

/**
 * ═══ WHICH SHEET — THE QUIZ ON THE BENCH (82-INPUT-REDESIGN §4.2, owner 06.10: no auto-judge) ════
 *
 * While a candidate run has no pick, the workbench draws THIS instead of the sheets: candidates
 * never stand on the bench. Each sheet is cropped per view on the client (the detector's frames,
 * `detect-split.ts`; CSS, no canvas — nothing is read back), and the person answers three taps:
 * the sides of every sheet side by side → the chosen sheet's back ok / not ok → its front ok / not
 * ok (`candidate-quiz-model.ts`). The end is a pick (`pickCandidate`) — the bench's auto-cut and
 * auto-apply take it from there — or «none of these» (`rejectCandidates`).
 * The state lives in the tab per run, so a remount mid-quiz keeps the taps.
 */

const states = new Map<number, QuizState>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function setQuiz(runId: number, s: QuizState) {
  states.set(runId, s);
  version += 1;
  listeners.forEach((l) => l());
}

/** Starts the quiz of a run over (after «none of these» was undone). */
export function resetCandidateQuiz(runId: number): void {
  setQuiz(runId, QUIZ_START);
}

const QUESTION: Record<string, string> = {
  side: 'which side view is right?',
  back: 'is the back right?',
  front: 'is the front right?',
};

function sheetSrc(picture: common_DesignPicture): { src: string; detect: string } {
  const m = picture.media?.media;
  const src = m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || m?.thumbnail?.mediaUrl || '';
  const thumbW = m?.thumbnail?.width ?? 0;
  const detect = m?.compressed?.mediaUrl || (thumbW >= 1000 ? m?.thumbnail?.mediaUrl : '') || '';
  return { src, detect };
}

function viewsOf(picture: common_DesignPicture, run: common_DesignRun): string[] {
  const own = (picture.compositeViews ?? []).map((v) => normaliseViewKey(v));
  return own.length ? own : (run.params?.views ?? []).map((v) => normaliseViewKey(v));
}

/** The detector's frames of one sheet, or null (no pixels: the whole sheet is shown). */
function useFrames(picture: common_DesignPicture, n: number): SplitFrame[] | null {
  const { detect } = sheetSrc(picture);
  const [frames, setFrames] = useState<{ key: string; frames: SplitFrame[] } | null>(null);
  const key = `${picture.id ?? 0}|${detect}|${n}`;
  useEffect(() => {
    if (!detect || n < 2) return;
    const ac = new AbortController();
    detectSplitOf(detect, n, ac.signal)
      .then((found) => {
        if (!ac.signal.aborted && found) setFrames({ key, frames: found.frames });
      })
      .catch(() => {
        /* no pixels — the whole sheet stands */
      });
    return () => ac.abort();
  }, [detect, n, key]);
  return frames && frames.key === key ? frames.frames : null;
}

/** One view of a sheet, cropped by its frame (CSS only), `h` px tall. */
function ViewCrop({
  picture,
  frame,
  h,
}: {
  picture: common_DesignPicture;
  frame: SplitFrame | null;
  h: number;
}): JSX.Element {
  const { src } = sheetSrc(picture);
  const m = picture.media?.media;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(() => {
    const w = m?.compressed?.width || m?.fullSize?.width || 0;
    const hh = m?.compressed?.height || m?.fullSize?.height || 0;
    return w > 0 && hh > 0 ? { w, h: hh } : null;
  });
  if (!frame || !natural) {
    return (
      <span className='block bg-bgColor' style={{ height: h }}>
        <img
          src={src}
          alt=''
          className='h-full w-auto object-contain'
          onLoad={(e) =>
            !natural &&
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
      </span>
    );
  }
  const ratio = (frame.w * natural.w) / Math.max(1e-6, frame.h * natural.h);
  return (
    <span
      className='relative block overflow-hidden bg-bgColor'
      style={{ height: h, width: Math.round(h * ratio) }}
    >
      <img
        src={src}
        alt=''
        draggable={false}
        className='absolute max-w-none'
        style={{
          width: `${100 / frame.w}%`,
          height: `${100 / frame.h}%`,
          left: `${(-frame.x / frame.w) * 100}%`,
          top: `${(-frame.y / frame.h) * 100}%`,
        }}
      />
    </span>
  );
}

/** A sheet's crops of the given views, side by side. */
function SheetViews({
  picture,
  run,
  views,
  h,
}: {
  picture: common_DesignPicture;
  run: common_DesignRun;
  views: string[];
  h: number;
}): JSX.Element {
  const all = viewsOf(picture, run);
  const frames = useFrames(picture, all.length);
  return (
    <span className='flex items-end gap-1'>
      {views.map((v) => {
        const i = viewIndex(all, v);
        return (
          <ViewCrop
            key={v}
            picture={picture}
            frame={frames && i >= 0 ? frames[i] ?? null : null}
            h={h}
          />
        );
      })}
    </span>
  );
}

const TILE =
  'flex flex-col items-center gap-1 border border-borderColor bg-bgColor p-1.5 transition-colors hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-default';

export function CandidateQuiz({
  techCardId,
  run,
  ids,
  disabled,
}: {
  techCardId: number;
  run: common_DesignRun;
  /** The candidate sheets, in the run's order. */
  ids: readonly number[];
  disabled?: boolean;
}): JSX.Element {
  useSyncExternalStore(subscribe, () => version);
  const runId = run.id ?? 0;
  const byId = new Map((run.pictures ?? []).map((p) => [p.id ?? 0, p] as const));
  const sheets = ids.filter((id) => byId.has(id));
  /* A sheet the quiz stands on that is no longer a candidate (an edit replaced it): the quiz starts
     over — a tap is never carried to a picture the person did not look at (Codex critical 3). */
  const held = states.get(runId) ?? QUIZ_START;
  const state: QuizState = 'sheet' in held && !sheets.includes(held.sheet) ? QUIZ_START : held;
  const send = (event: QuizEvent) => {
    if (disabled) return;
    const next = quizStep(state, event, sheets);
    setQuiz(runId, next);
    if (next.step === 'done') pickCandidate(techCardId, runId, next.sheet);
    if (next.step === 'none') rejectCandidates(techCardId, runId);
  };
  const view = quizView(state);
  const choices = quizChoices(state, sheets);
  const sideViews = ['side_l', 'side_r'];
  const shown = view === 'side' ? sideViews : view ? [view] : [];
  const letter = (id: number) => String.fromCharCode(97 + Math.max(0, sheets.indexOf(id)));

  return (
    <div data-candidate-quiz={state.step} data-quiz-view={view ?? ''} className='space-y-2'>
      <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
        {sheets.length} candidates ·{' '}
        {state.step === 'others' ? `pick another ${view}` : QUESTION[view ?? 'side']} ·{' '}
        {quizPosition(state)} / 3
      </Text>
      <div className='flex flex-wrap items-end gap-2'>
        {choices.map((id) => {
          const picture = byId.get(id) as common_DesignPicture;
          const tile = (
            <>
              <SheetViews
                picture={picture}
                run={run}
                views={shown}
                h={state.step === 'check' ? 280 : 200}
              />
              <Text size='nano' variant='label' component='span' className='uppercase'>
                {letter(id)}
              </Text>
            </>
          );
          return state.step === 'check' ? (
            <div key={id} data-quiz-sheet={id} className={cn(TILE, 'hover:border-borderColor')}>
              {tile}
            </div>
          ) : (
            <button
              key={id}
              type='button'
              data-quiz-sheet={id}
              disabled={disabled}
              aria-label={`sheet ${letter(id)}`}
              className={TILE}
              onClick={() => send({ type: 'pick', sheet: id })}
            >
              {tile}
            </button>
          );
        })}
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        {state.step === 'check' ? (
          <ChipRow>
            <Chip data-quiz-ok='' disabled={disabled} onClick={() => send({ type: 'ok' })}>
              ok
            </Chip>
            <Chip data-quiz-not-ok='' disabled={disabled} onClick={() => send({ type: 'not-ok' })}>
              not ok
            </Chip>
          </ChipRow>
        ) : (
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            data-quiz-none=''
            disabled={disabled}
            onClick={() => send({ type: 'none' })}
          >
            none of these
          </Button>
        )}
      </div>
    </div>
  );
}
