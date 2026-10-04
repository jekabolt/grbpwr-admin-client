import type { DesignQuizAnswer, DesignQuizQuestion } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
import { flushAllowsRun, flushRefusalSentence, useTechCardAutosave } from './autosave-contract';
import { Counter } from './core';
import { moodboardGate, moodGateSentence } from './core/mood-gate';
import { PartPictogram } from './garment-parts';
import { useGenerationWrites } from './generation/use-generation';
import { HardwareIcon, hardwareOf, type HardwareKind } from './hardware-icons';
import { fillIdOf } from './head/draft-fills';
import { LockedBar } from './head/mood-organs';
import { useDraftMemory } from './head/use-draft-fills';
import {
  answerText,
  clarifyOf,
  insertClarify,
  partWords,
  QUIZ_MAX,
  withAnswer,
} from './quiz-model';
import { GenerateRow } from './render/generate-row';
import type { Gate } from './render/model';
import { newClientRequestId, useDesignQuizAnswers, useDesignQuizWrites } from './use-design-band';

/**
 * ═══ ASK ME — КВИЗ ДОСКИ, ИНЛАЙН В MOODBOARD (волна 04.10, 20-DESIGN §5–§7, O2, O7) ════════════
 *
 * Владелец: «нажать кнопку типо пораспрашивай меня об этой вещи … квиз должен быть инлайн в блоке
 * мудборда … клин дизайн … минимизировать ненужные кнопки … не должно быть полотна текста».
 *
 * ТРИ СОСТОЯНИЯ ОДНОГО МЕСТА, НИКАКОЙ НОВОЙ КОРОБКИ:
 *   · РЯД — тот же `GenerateRow`, что у GENERATE (форк запрещён): `ASK ME`, за ним счёт ответов,
 *     `answers ▾` и `apply to description ✦` — каждая дверь встаёт, только когда может действовать.
 *   · ВОПРОС — ряд уступает место сетке [пиктограмма 64×96 | вопрос]: категория и счёт, вопрос,
 *     варианты чипами, своё слово, `skip`. Один вопрос за раз; одиночный выбор продвигает сам.
 *   · ОТВЕТЫ — сложенный список под рядом; строка открывает свой вопрос заново.
 *
 * Не дописанный до конца прогон не хранится: уйти посреди — потерять оставшиеся вопросы; повтор
 * спросит только неотвеченное (сервер выкидывает отвеченные id). Принято для прототипа.
 */

type Live = {
  queue: DesignQuizQuestion[];
  at: number;
  /** `edit` — один вопрос, открытый из списка ответов; после ответа экран возвращается к списку. */
  mode: 'run' | 'edit';
};

const hhmm = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(),
  );

const errorWords = (e: unknown, fallback: string) => {
  const m = ((e as Error | null)?.message ?? '').trim();
  return m || fallback;
};

export function MoodQuiz({
  techCardId,
  readOnly,
  pictures,
  concept,
  conceptMax,
}: {
  techCardId?: number;
  readOnly: boolean;
  /** Картинок на самой доске (`isBoardRow`). */
  pictures: number;
  concept: string;
  conceptMax: number;
}): JSX.Element | null {
  const card = techCardId && techCardId > 0 ? techCardId : 0;
  const { answers, unimplemented } = useDesignQuizAnswers(card || undefined);
  const { generate, save } = useDesignQuizWrites(card || undefined);
  const { draftIdea } = useGenerationWrites(card || undefined);
  const autosave = useTechCardAutosave();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const record = useDraftMemory((s) => s.record);

  const [live, setLive] = useState<Live | null>(null);
  const [family, setFamily] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [nothingLeft, setNothingLeft] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [applying, setApplying] = useState(false);
  const shownCard = useRef(card);
  shownCard.current = card;

  // Минимум сервера (O8): картинка на доске ИЛИ слова описания. Категория не нужна — без неё просто
  // нет пиктограммы.
  const minimum = moodboardGate({ boardPictures: pictures, concept, categoryId: 1 });
  const gate: Gate = minimum.ok ? { ok: true } : { ok: false, reason: moodGateSentence(minimum) };

  const ask = async () => {
    if (readOnly || asking || !card) return;
    setRefusal(null);
    setNothingLeft(false);
    setAsking(true);
    try {
      // Сервер читает СОХРАНЁННУЮ карточку: сперва автосейв.
      let flushed: Awaited<ReturnType<typeof autosave.flush>>;
      try {
        flushed = await autosave.flush('quiz');
      } catch {
        flushed = 'error';
      }
      if (!flushAllowsRun(flushed)) {
        setRefusal(flushRefusalSentence(flushed, autosave.errorsCount, autosave.refusal));
        return;
      }
      const res = await generate.mutateAsync();
      if (shownCard.current !== card) return;
      const questions = (res.questions ?? []).slice(0, QUIZ_MAX);
      setFamily(res.family ?? '');
      if (!questions.length) {
        setNothingLeft(true);
        return;
      }
      setListOpen(false);
      setLive({ queue: questions, at: 0, mode: 'run' });
    } catch (e) {
      if (shownCard.current === card) setRefusal(errorWords(e, 'the quiz could not be made'));
    } finally {
      setAsking(false);
    }
  };

  /** Ответ уходит полным списком; вопрос стоит, пока запись не легла (отказ — снэкбар, вопрос тот же). */
  const commit = async (
    q: DesignQuizQuestion,
    selected: string[],
    freeText: string,
    skipped: boolean,
  ) => {
    if (!live) return;
    const answer: DesignQuizAnswer = {
      question: q,
      selected: skipped ? [] : selected,
      freeText: skipped ? '' : freeText.trim(),
      skipped,
      answeredAt: undefined,
    };
    try {
      await save.mutateAsync(withAnswer(answers, answer));
    } catch {
      return;
    }
    if (shownCard.current !== card) return;
    if (live.mode === 'edit') {
      setLive(null);
      setListOpen(true);
      return;
    }
    const queue = skipped ? live.queue : insertClarify(live.queue, live.at, clarifyOf(q, selected));
    const next = live.at + 1;
    if (next >= queue.length) {
      setLive(null);
      setListOpen(true);
      return;
    }
    setLive({ queue, at: next, mode: 'run' });
  };

  const reopen = (a: DesignQuizAnswer) => {
    if (readOnly || !a.question) return;
    setLive({ queue: [a.question], at: 0, mode: 'edit' });
  };

  /**
   * `apply to description ✦` (§5): тот же текстовый прогон, что `write from the board ✦`
   * (`DraftDesignIdea`, проза), — сервер уже кладёт решения квиза в факты карточки. Ответ ложится
   * через журнал черновика (`before` = что стояло): синяя рамка, `✕` возвращает прежнее. Если
   * человек правил описание, пока модель писала, — ничего не пишется.
   */
  const apply = async () => {
    if (readOnly || applying || !card) return;
    setApplying(true);
    try {
      let flushed: Awaited<ReturnType<typeof autosave.flush>>;
      try {
        flushed = await autosave.flush('quiz-apply');
      } catch {
        flushed = 'error';
      }
      if (!flushAllowsRun(flushed)) {
        showMessage(flushRefusalSentence(flushed, autosave.errorsCount, autosave.refusal), 'error');
        return;
      }
      const before = ((getValues('concept') as string | null | undefined) ?? '') as string;
      const res = await draftIdea.mutateAsync(newClientRequestId());
      const text = (res.run?.outputText ?? '').trim().slice(0, conceptMax);
      if (!text || shownCard.current !== card) return;
      const now = ((getValues('concept') as string | null | undefined) ?? '') as string;
      if (now !== before) {
        showMessage(
          'the description changed while the model wrote, so it was left as typed',
          'error',
        );
        return;
      }
      if (text === before) return;
      record(card, {
        id: fillIdOf({ kind: 'concept' }),
        target: { kind: 'concept' },
        label: 'concept',
        before,
        after: text,
        at: hhmm(),
      });
      setValue('concept', text, { shouldDirty: true, shouldValidate: true });
    } catch {
      // Отказ уже сказан снэкбаром (`onError` в `useGenerationWrites`).
    } finally {
      setApplying(false);
    }
  };

  if (!card || unimplemented) return null;

  const q = live ? live.queue[live.at] : undefined;
  if (live && q) {
    const prior = live.mode === 'edit' ? answers.find((a) => a.question?.id === q.id) : undefined;
    return (
      <QuestionView
        key={`${live.mode}:${q.id}`}
        question={q}
        family={q.family || family}
        position={live.mode === 'edit' ? null : { n: live.at + 1, of: live.queue.length }}
        prior={prior}
        busy={save.isPending}
        onCommit={(selected, text) => commit(q, selected, text, false)}
        onSkip={() => commit(q, [], '', true)}
      />
    );
  }

  const answered = answers.filter((a) => !a.skipped).length;
  const canApply = !readOnly && answered > 0 && pictures > 0;

  return (
    <div>
      {refusal && (
        <LockedBar
          reason={refusal}
          door={
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              onClick={() => setRefusal(null)}
            >
              ok
            </Button>
          }
        />
      )}
      <GenerateRow
        gate={gate}
        pending={asking}
        disabled={readOnly}
        onGenerate={ask}
        label='ASK ME'
        pendingLabel='reading the board…'
        trailing={
          <>
            {nothingLeft && (
              <Text size='micro' variant='label' component='span'>
                nothing left to ask
              </Text>
            )}
            {answers.length > 0 && (
              <>
                <Counter n={answered} noun='answer' />
                <Button
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  aria-expanded={listOpen}
                  onClick={() => setListOpen(!listOpen)}
                >
                  {listOpen ? 'answers ▴' : 'answers ▾'}
                </Button>
              </>
            )}
            {canApply && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                disabled={applying}
                onClick={apply}
              >
                {applying ? 'writing…' : 'apply to description ✦'}
              </Button>
            )}
          </>
        }
      />
      {listOpen && answers.length > 0 && (
        <ul className='mt-1 border-t border-hairline'>
          {answers.map((a) => (
            <li key={a.question?.id} className='border-b border-hairline'>
              <AnswerLine answer={a} readOnly={readOnly} onOpen={() => reopen(a)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnswerLine({
  answer,
  readOnly,
  onOpen,
}: {
  answer: DesignQuizAnswer;
  readOnly: boolean;
  onOpen: () => void;
}): JSX.Element {
  const q = answer.question;
  const text = answerText(answer);
  return (
    <button
      type='button'
      disabled={readOnly}
      onClick={onOpen}
      className='grid w-full grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-3 py-1 text-left enabled:cursor-pointer enabled:hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-textColor'
    >
      <Pill tone='mut' className='justify-self-start'>
        {q?.category || 'design'}
      </Pill>
      <Text size='micro' variant='label' component='span' className='truncate' title={q?.question}>
        {q?.part && q.part !== 'whole' ? `${partWords(q.part)} · ` : ''}
        {q?.question}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('truncate', !text && 'text-labelColor')}
        title={text || undefined}
      >
        {text || 'skipped'}
      </Text>
    </button>
  );
}

function QuestionView({
  question,
  family,
  position,
  prior,
  busy,
  onCommit,
  onSkip,
}: {
  question: DesignQuizQuestion;
  family: string;
  /** Номер в прогоне; `null` — вопрос открыт из списка ответов. */
  position: { n: number; of: number } | null;
  prior?: DesignQuizAnswer;
  busy: boolean;
  onCommit: (selected: string[], text: string) => void;
  onSkip: () => void;
}): JSX.Element {
  const options = question.options ?? [];
  const optionHardware = options.map(hardwareOf);
  const hardwareKinds = new Set(
    optionHardware.filter((kind): kind is HardwareKind => kind !== null),
  );
  const showHardwareOptions = hardwareKinds.size >= 2;
  const multi = question.kind === 'multi';
  const [selected, setSelected] = useState<string[]>(() =>
    prior && !prior.skipped ? (prior.selected ?? []).filter((s) => options.includes(s)) : [],
  );
  const [text, setText] = useState(() => (prior && !prior.skipped ? prior.freeText ?? '' : ''));
  const advance = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (advance.current) window.clearTimeout(advance.current);
    },
    [],
  );

  const pick = useCallback(
    (option: string) => {
      if (busy) return;
      if (multi) {
        setSelected((s) => (s.includes(option) ? s.filter((x) => x !== option) : [...s, option]));
        return;
      }
      setSelected([option]);
      // Одиночный выбор продвигает сам — через 150 мс, чтобы выбор успел стать видимым.
      if (advance.current) window.clearTimeout(advance.current);
      advance.current = window.setTimeout(() => onCommit([option], text), 150);
    },
    [busy, multi, onCommit, text],
  );

  // Цифры 1–6 — варианты (вне поля ввода).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = Number(e.key) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= options.length) return;
      e.preventDefault();
      pick(options[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, pick]);

  const canSend = selected.length > 0 || text.trim() !== '';
  const send = () => {
    if (busy || !canSend) return;
    onCommit(selected, text);
  };

  return (
    <div className='grid grid-cols-[64px_minmax(0,1fr)] items-start gap-4 py-1' data-quiz=''>
      <div className='h-24 w-16 text-textColor'>
        <PartPictogram
          family={family}
          part={question.part || 'whole'}
          category={question.category}
          className='h-24 w-16'
        />
      </div>
      <div className='min-w-0 space-y-2'>
        <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
          {question.category || 'design'}
          {position ? ` · ${position.n} / ${position.of}` : ''}
        </Text>
        <Text component='p' className='text-pretty'>
          {question.question}
        </Text>
        <ChipRow>
          {options.map((o, index) => {
            const hardware = optionHardware[index];
            return (
              <Chip
                key={o}
                selected={selected.includes(o)}
                pressed={multi ? selected.includes(o) : undefined}
                disabled={busy}
                onClick={() => pick(o)}
                className='whitespace-normal text-left'
              >
                {showHardwareOptions && hardware ? (
                  <HardwareIcon kind={hardware} size={14} className='shrink-0' />
                ) : null}
                {o}
              </Chip>
            );
          })}
        </ChipRow>
        <div className='flex items-start gap-2'>
          <Textarea
            name={`quiz-own-${question.id}`}
            aria-label='own answer'
            placeholder='own answer'
            autoGrow={false}
            rows={1}
            maxLength={500}
            value={text}
            disabled={busy}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              send();
            }}
            className='max-h-40 min-h-0 flex-1 resize-none [field-sizing:content]'
          />
          {(multi || text.trim() !== '') && canSend && (
            <Button variant='underline' size='xs' className='mt-1' disabled={busy} onClick={send}>
              next ›
            </Button>
          )}
          <Button
            variant='underline'
            size='xs'
            className='mt-1 text-labelColor hover:text-textColor'
            disabled={busy}
            onClick={onSkip}
          >
            skip
          </Button>
        </div>
      </div>
    </div>
  );
}
