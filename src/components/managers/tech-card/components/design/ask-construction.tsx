import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { cn } from 'lib/utility';
import type { common_DesignJoins } from 'api/proto-http/admin';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import { GROUP_GAP } from './core';
import { saveJoinsConfirmed } from './flat-joins';
import { PartPictogram } from './garment-parts';
import { useCardGarmentFamily } from './garment-pictograms';
import { replayEdit } from './joins-model';
import {
  allQuestions,
  answersEdit,
  questionsKey,
  type Answer,
  type ConstructionQuestion,
} from './joins-questions';

/**
 * ═══ ASK · CONSTRUCTION — THE MOODBOARD QUIZ'S GRID, FOR 1–3 QUESTIONS (82-INPUT-REDESIGN §1.2) ══
 *
 * One question at a time: `[pictogram | topic · n / N, question, chips, skip]` — the grid of the
 * moodboard quiz (`mood-quiz.tsx` `QuestionView`). A chip advances after 150 ms; Q5 `no` opens one
 * own-answer line. Nothing is written until the LAST answer: then ONE `SetDesignJoins` with every
 * answer applied in order and `confirm = true` (`finishAsk`). `skip all ›` under the run row is the
 * same save with the answers given so far.
 *
 * The answers live in the tab (sessionStorage) per card, for the rev and the questions they were
 * given on: another rev or other questions start the session over.
 */

type Session = { rev: number; key: string; at: number; answers: Record<string, Answer> };

const SKEY = (card: number) => `grbpwr.design.joins.ask.${card}`;
const sessions = new Map<number, Session | null>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};

function readSession(card: number): Session | null {
  if (sessions.has(card)) return sessions.get(card) ?? null;
  let s: Session | null = null;
  try {
    const raw = window.sessionStorage.getItem(SKEY(card));
    const v = raw ? (JSON.parse(raw) as Session) : null;
    if (v && typeof v.rev === 'number' && typeof v.key === 'string') s = v;
  } catch {
    /* no storage — a fresh session */
  }
  sessions.set(card, s);
  return s;
}

function writeSession(card: number, s: Session | null): void {
  sessions.set(card, s);
  try {
    if (s) window.sessionStorage.setItem(SKEY(card), JSON.stringify(s));
    else window.sessionStorage.removeItem(SKEY(card));
  } catch {
    /* the module still remembers */
  }
  bump();
}

/** The session for THIS list (rev + questions), a fresh one otherwise. */
function sessionFor(card: number, rev: number, key: string): Session {
  const s = readSession(card);
  return s && s.rev === rev && s.key === key ? s : { rev, key, at: 0, answers: {} };
}

/** A save is in flight per card (one at a time; the row's `skip all ›` and the chips share it). */
const finishing = new Set<number>();
/** The last finish that did not save, per card — said under the question. */
const lastWhy = new Map<number, string>();

export function useAskBusy(card: number): boolean {
  useSyncExternalStore(subscribe, () => version);
  return finishing.has(card);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * THE LAST ANSWER (or `skip all ›`): every answer given so far, applied in order to the list the
 * questions were asked on, saved ONCE with `confirm = true`.
 *   · the rev moved meanwhile: when the fresh list asks EXACTLY the same questions, the answers are
 *     replayed on it (`replayEdit`) and saved confirmed once — the person answered exactly what the
 *     fresh list asks; otherwise the session starts over on the fresh list (re-asked, never dropped
 *     silently): «the list changed — asked again»;
 *   · a Q5 own answer that names nothing is re-asked with its reason.
 */
export async function finishAsk(
  qc: QueryClient,
  card: number,
  base: common_DesignJoins,
  questions: readonly ConstructionQuestion[],
): Promise<boolean> {
  if (finishing.has(card)) return false;
  const session = sessionFor(card, base.rev ?? 0, questionsKey(questions));
  const mapped = answersEdit(base, questions, session.answers);
  if ('why' in mapped) {
    const at = Math.max(
      0,
      questions.findIndex((q) => q.id === mapped.id),
    );
    const answers = { ...session.answers };
    delete answers[mapped.id];
    lastWhy.set(card, mapped.why);
    writeSession(card, { ...session, at, answers });
    return false;
  }
  finishing.add(card);
  lastWhy.delete(card);
  bump();
  try {
    const first = await saveJoinsConfirmed(qc, card, mapped.edit(base), base.rev ?? 0);
    if (first.ok) {
      writeSession(card, null);
      return true;
    }
    const fresh = first.changed;
    if (fresh?.confirmed) {
      // Confirmed elsewhere meanwhile: nothing is asked any more, and these answers are not laid
      // over another person's confirmed list — said, not dropped silently.
      lastWhy.set(card, 'confirmed elsewhere meanwhile — your answers were not applied');
      writeSession(card, null);
      return false;
    }
    if (fresh && questionsKey(allQuestions(fresh)) === questionsKey(questions)) {
      // The same questions over the same rows: the answers stand as given.
      const again = replayEdit(mapped.edit, base, fresh);
      if (again) {
        const second = await saveJoinsConfirmed(qc, card, again, fresh.rev ?? 0);
        if (second.ok) {
          writeSession(card, null);
          return true;
        }
        // Not saved: the answers stay; the last question is shown again with the reason.
        lastWhy.set(card, second.why);
        writeSession(card, { ...session, at: Math.max(0, questions.length - 1) });
        return false;
      }
    }
    // Other questions, or the same ones over changed rows: asked again on the fresh list.
    lastWhy.set(card, fresh ? 'the list changed — asked again' : first.why);
    writeSession(card, fresh ? null : { ...session, at: Math.max(0, questions.length - 1) });
    return false;
  } finally {
    finishing.delete(card);
    bump();
  }
}

export function AskConstruction({
  techCardId,
  joins,
  questions,
  disabled,
}: {
  techCardId: number;
  joins: common_DesignJoins;
  questions: readonly ConstructionQuestion[];
  disabled?: boolean;
}): JSX.Element | null {
  const qc = useQueryClient();
  const family = useCardGarmentFamily();
  useSyncExternalStore(subscribe, () => version);
  const card = techCardId;
  const rev = joins.rev ?? 0;
  const key = questionsKey(questions);
  const session = sessionFor(card, rev, key);
  const busy = finishing.has(card) || !!disabled;
  const at = Math.min(session.at, questions.length - 1);
  const q = questions[at];
  const [own, setOwn] = useState<{ id: string; text: string } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  // Another question on screen: no chip carries over.
  const qid = q?.id ?? '';
  const [shownId, setShownId] = useState(qid);
  if (shownId !== qid) {
    setShownId(qid);
    setChosen(null);
    setOwn(null);
  }
  if (!q) return null;

  const answer = (a: Answer) => {
    const answers = { ...session.answers, [q.id]: a };
    const last = at >= questions.length - 1;
    writeSession(card, { rev, key, at: last ? at : at + 1, answers });
    if (last) void finishAsk(qc, card, joins, questions);
  };
  const pick = (optionKey: string, opensOwn: boolean) => {
    if (busy) return;
    if (opensOwn) {
      setChosen(optionKey);
      setOwn({ id: q.id, text: '' });
      return;
    }
    setChosen(optionKey);
    if (timer.current) window.clearTimeout(timer.current);
    // A single choice advances by itself — after 150 ms, so the choice is seen first.
    timer.current = window.setTimeout(() => answer({ key: optionKey }), 150);
  };
  const why = lastWhy.get(card);

  return (
    <div data-ask-construction={questions.length} data-ask-at={at}>
      <GroupLabel flush className={GROUP_GAP}>
        ask · construction
      </GroupLabel>
      <div
        className={cn(
          'grid items-start gap-4 py-1',
          family ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-1',
        )}
        data-ask={q.id}
      >
        {family && (
          <div className='h-24 w-16 text-textColor'>
            <PartPictogram family={family} part={q.part} className='h-24 w-16' />
          </div>
        )}
        <div className='min-w-0 space-y-2'>
          <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
            {q.topic} · {at + 1} / {questions.length}
          </Text>
          <Text component='p' className='text-pretty'>
            {q.question}
          </Text>
          <ChipRow>
            {q.options.map((o) => (
              <Chip
                key={o.key}
                data-ask-option={o.key}
                selected={chosen === o.key}
                disabled={busy}
                onClick={() => pick(o.key, o.edit === null)}
                className='whitespace-normal text-left'
              >
                {o.label}
              </Chip>
            ))}
          </ChipRow>
          <div className='flex items-start gap-2'>
            {own?.id === q.id && (
              <span className='block min-w-0 flex-1'>
                <Input
                  autoFocus
                  aria-label='own answer'
                  placeholder='no inner layer at the hem · or · the strap is knotted'
                  value={own.text}
                  disabled={busy}
                  className='min-h-[22px] py-0.5'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setOwn({ id: q.id, text: e.target.value })
                  }
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && own.text.trim()) {
                      e.preventDefault();
                      answer({ key: 'no', text: own.text });
                    }
                  }}
                />
              </span>
            )}
            {own?.id === q.id && own.text.trim() !== '' && (
              <Button
                variant='underline'
                size='xs'
                className='mt-1'
                disabled={busy}
                data-ask-next=''
                onClick={() => answer({ key: 'no', text: own.text })}
              >
                next ›
              </Button>
            )}
            <Button
              variant='underline'
              size='xs'
              className='mt-1 text-labelColor hover:text-textColor'
              data-ask-skip=''
              disabled={busy}
              title='as the model read it'
              onClick={() => answer({ key: 'skip' })}
            >
              skip
            </Button>
          </div>
          {why && (
            <Text size='micro' component='p' className='text-error' data-ask-why=''>
              {why}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}
