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
import {
  HardwareIcon,
  LabelIcon,
  hardwareOf,
  labelOf,
  type HardwareKind,
  type LabelKind,
} from './hardware-icons';
import { isPaletteKey, SeamIcon, seamClassOf, seamOf, swatchOf, type SeamKind } from './seam-icons';
import { fillIdOf } from './head/draft-fills';
import { LockedBar } from './head/mood-organs';
import { useDraftMemory } from './head/use-draft-fills';
import {
  isRoleQuestion,
  MOOD_ROLES,
  ROLE_HINT,
  roleQuestion,
  type QuizPicture,
} from './quiz-anchor';
import { setQuizLive } from './quiz-live';
import {
  answerText,
  clarifyOf,
  clearQuizSession,
  followUpIds,
  forgetRow,
  insertClarify,
  keepRow,
  partWords,
  QUIZ_MAX,
  readQuizSession,
  remainingOf,
  staleChangesOf,
  writeQuizSession,
  type QuizSession,
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
 * ПРОГОН ПЕРЕЖИВАЕТ УХОД (W-C3, E2): прогон держит сервер (`pending`), вкладка — лишь курсор; ряд
 * предлагает `resume N` / `discard` с любой вкладки, второго платного вызова нет; `later` закрывает
 * вопрос, очередь стоит. `discard` и ответ на последний вопрос закрывают прогон на сервере.
 * Пишет квиз только после того, как сохранённые ответы прочитаны (W-C1): запись — свои строки
 * (W-B1), чужие на сервере не трогаются; `forget` у строки списка — пустая строка этого id.
 */

type Live = {
  queue: DesignQuizQuestion[];
  at: number;
  /**
   * `edit` — один вопрос, открытый из списка ответов; после ответа экран возвращается к списку.
   * `role` — 97-ROLE-FIRST: шаг ролей неразмеченных картинок, локальный; за ним `then`.
   * `review` — 98-STALE: проход по устаревшим ответам (`N stale`), у каждого прежний ответ выбран,
   * что изменилось — над вариантами; keep / change / forget. Сессии на сервере нет.
   */
  mode: 'run' | 'edit' | 'role' | 'review';
  /** Только у `role`: что идёт после шага — платный прогон или продолжение прежней очереди. */
  then?: 'generate' | 'resume';
};

type OptionCloseup =
  | { type: 'hardware'; kind: HardwareKind }
  | { type: 'label'; kind: LabelKind }
  | { type: 'seam'; kind: SeamKind }
  | { type: 'swatch'; kind: string };

/**
 * 70-SEAMS B4: цветная точка — только у вопроса про цвет (деталь `col_palette` или ключ решения про
 * цвет / отделку фурнитуры): иначе ткань `linen` или `chocolate` стала бы «цветом».
 */
const isColourQuestion = (q: DesignQuizQuestion) =>
  isPaletteKey(q.part ?? '') ||
  /colou?r/.test(q.decisionKey ?? '') ||
  q.decisionKey === 'hardware_finish';

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
  pictureOf,
  onFocusPicture,
  unmarked = [],
  onSetRole,
}: {
  techCardId?: number;
  readOnly: boolean;
  /** Картинок на самой доске (`isBoardRow`). */
  pictures: number;
  concept: string;
  conceptMax: number;
  /**
   * 96-PICTURE-QUESTIONS: картинка доски по id медиа — номер, роль, превью; `null` — её на доске нет
   * (снята после прогона). Без пропа вопрос про картинку показывает пустую рамку.
   */
  pictureOf?: (mediaId: number) => QuizPicture | null;
  /** Вопрос на экране (или строка списка под курсором) — про эту картинку; `null` — ни про какую. */
  onFocusPicture?: (mediaId: number | null) => void;
  /** 97-ROLE-FIRST: картинки доски без роли, в порядке доски — о них квиз спрашивает первым. */
  unmarked?: number[];
  /** Роль картинке — та же запись, что у угол-меню плитки (`setBoardRole`). */
  onSetRole?: (mediaId: number, role: string) => void;
}): JSX.Element | null {
  const card = techCardId && techCardId > 0 ? techCardId : 0;
  const {
    answers,
    pending,
    pendingFamily,
    unimplemented,
    isSuccess: ready,
    isError: answersFailed,
    refetch,
  } = useDesignQuizAnswers(card || undefined);
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
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<QuizSession | null>(() => readQuizSession(card));
  const [hoverPic, setHoverPic] = useState<number | null>(null);
  const shownCard = useRef(card);
  shownCard.current = card;

  // 96: якорь доски — вопрос на экране про картинку, иначе строка открытого списка под курсором.
  const q = live ? live.queue[live.at] : undefined;
  const anchor = (live ? q?.mediaId : listOpen ? hoverPic : null) || null;
  const focusPicture = useRef(onFocusPicture);
  focusPicture.current = onFocusPicture;
  useEffect(() => {
    focusPicture.current?.(anchor);
  }, [anchor]);
  useEffect(() => () => focusPicture.current?.(null), []);

  // Другая карточка — своя сохранённая очередь (или никакой).
  useEffect(() => {
    setSession(readQuizSession(card));
    setLive(null);
  }, [card]);

  // W-C2: пока вопрос на экране, бриф WORDS не догоняет каждый ответ.
  const isLive = live !== null;
  useEffect(() => {
    setQuizLive(card, isLive);
    return () => setQuizLive(card, false);
  }, [card, isLive]);

  // W-C10: секунды ожидания на двери.
  useEffect(() => {
    if (!asking) return;
    const start = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [asking]);

  const remaining = ready ? remainingOf(pending, session, answers) : [];
  // Сервер прогона не держит (или всё отвечено) — кэш вкладки не нужен.
  useEffect(() => {
    if (ready && session && !live && remaining.length === 0) {
      clearQuizSession(card);
      setSession(null);
    }
  }, [ready, session, live, remaining.length, card]);

  const persist = (queue: DesignQuizQuestion[], at: number, fam: string, generatedAt?: number) => {
    const next: QuizSession = {
      cardId: card,
      family: fam,
      queue,
      at,
      generatedAt: generatedAt ?? session?.generatedAt ?? Date.now(),
    };
    writeQuizSession(next);
    setSession(next);
  };
  const dropSession = () => {
    clearQuizSession(card);
    setSession(null);
  };
  /** `discard`: прогон закрывается и на сервере — пустая запись с `closeSession`. */
  const discard = async () => {
    if (readOnly || !ready) return;
    dropSession();
    try {
      await save.mutateAsync({ rows: [], closeSession: true });
    } catch {
      /* отказ сказан снэкбаром, `resume N` вернулся */
    }
  };

  // Минимум сервера (O8): картинка на доске ИЛИ слова описания. Категория не нужна — без неё просто
  // нет пиктограммы.
  const minimum = moodboardGate({ boardPictures: pictures, concept, categoryId: 1 });
  const gate: Gate = !ready
    ? {
        ok: false,
        reason: answersFailed ? 'the saved answers did not load' : 'reading the saved answers',
      }
    : minimum.ok
      ? { ok: true }
      : { ok: false, reason: moodGateSentence(minimum) };

  /**
   * 97-ROLE-FIRST: есть неразмеченные картинки — сперва шаг ролей (локально, бесплатно), и только
   * после него `then`. Роли пишутся в форму по ходу шага; `generateRun` делает flush автосейва ДО
   * `GenerateDesignQuiz`, поэтому сервер читает карточку уже с ролями.
   */
  const rolesFirst = (then: 'generate' | 'resume') => {
    if (readOnly || !onSetRole || !unmarked.length) return false;
    setRefusal(null);
    setNothingLeft(false);
    setListOpen(false);
    setLive({ queue: unmarked.map(roleQuestion), at: 0, mode: 'role', then });
    return true;
  };
  const ask = () => {
    if (readOnly || asking || !card || !ready) return;
    if (!rolesFirst('generate')) void generateRun();
  };

  const generateRun = async () => {
    if (readOnly || asking || !card || !ready) return;
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
        dropSession();
        return;
      }
      setListOpen(false);
      setLive({ queue: questions, at: 0, mode: 'run' });
      persist(questions, 0, res.family ?? '', Date.now());
    } catch (e) {
      if (shownCard.current === card) setRefusal(errorWords(e, 'the quiz could not be made'));
    } finally {
      setAsking(false);
    }
  };

  /**
   * 70-SEAMS A4.2: ответ на «основной шов» — класс шва карточки по умолчанию, ТОЛЬКО когда он не задан
   * (UNKNOWN/пусто); заданный не трогается. Автосейв формы несёт его дальше (операции наследуют).
   */
  const prefillSeamClass = (q: DesignQuizQuestion, selected: string[], freeText: string) => {
    if (q.decisionKey !== 'main_seam') return;
    const kind = seamOf(selected[0] ?? '') ?? seamOf(freeText);
    if (!kind) return;
    const current = getValues('construction.defaultSeamClass');
    if (current && current !== 'TECH_CARD_SEAM_CLASS_UNKNOWN') return;
    setValue('construction.defaultSeamClass', seamClassOf(kind), { shouldDirty: true });
  };

  /** Ответ уходит полным списком; вопрос стоит, пока запись не легла (отказ — снэкбар, вопрос тот же). */
  const commit = async (
    q: DesignQuizQuestion,
    selected: string[],
    freeText: string,
    skipped: boolean,
  ) => {
    if (!live || !ready) return;
    if (live.mode === 'role') {
      // Роль живёт на картинке, не в ответах квиза; `skip` оставляет картинку неразмеченной.
      const role = skipped ? '' : selected[0] ?? '';
      if (q.mediaId && (MOOD_ROLES as readonly string[]).includes(role))
        onSetRole?.(q.mediaId, role);
      const next = live.at + 1;
      if (next < live.queue.length) {
        setLive({ ...live, at: next });
        return;
      }
      setLive(null);
      if (live.then === 'resume') resumeQueue();
      else void generateRun();
      return;
    }
    const answer: DesignQuizAnswer = {
      question: q,
      selected: skipped ? [] : selected,
      freeText: skipped ? '' : freeText.trim(),
      skipped,
      answeredAt: undefined,
      stale: undefined,
    };
    // W-C11: уточнение — и в правке; родитель ушёл от противоречия (или пропущен) — его прежнее
    // уточнение забывается и снимается с очереди.
    const clarify = skipped ? null : clarifyOf(q, selected);
    // У edge_finish_main продолжений два id (новый + прежний `clarify_`): всё, кроме живого, — забыть.
    const staleIds = new Set(followUpIds(q).filter((id) => id !== clarify?.id));
    const rows = [answer];
    for (const id of staleIds) {
      const stale = answers.find((a) => a.question?.id === id);
      if (stale?.question) rows.push(forgetRow(stale.question));
    }
    const kept = live.queue.filter((x, i) => i <= live.at || !staleIds.has(x.id ?? ''));
    const queue = clarify ? insertClarify(kept, live.at, clarify) : kept;
    const next = live.at + 1;
    // E2: ответ на последний вопрос прогона закрывает его на сервере той же записью.
    const closeSession = live.mode === 'run' && next >= queue.length;
    try {
      await save.mutateAsync({ rows, closeSession });
    } catch {
      return;
    }
    if (shownCard.current !== card) return;
    if (!skipped && !readOnly) prefillSeamClass(q, selected, freeText);
    if (live.mode === 'edit') {
      if (clarify && queue[next]?.id === clarify.id) {
        setLive({ queue, at: next, mode: 'edit' });
        return;
      }
      setLive(null);
      setListOpen(true);
      return;
    }
    if (next >= queue.length) {
      setLive(null);
      if (live.mode === 'run') dropSession();
      setListOpen(true);
      return;
    }
    setLive({ queue, at: next, mode: live.mode });
    if (live.mode === 'run') persist(queue, next, family);
  };

  const reopen = (a: DesignQuizAnswer) => {
    if (readOnly || !ready || !a.question) return;
    setLive({ queue: [a.question], at: 0, mode: 'edit' });
  };

  /** W-C4: прошлый вопрос с его сохранённым ответом. */
  const back = () => {
    if (!live || live.mode === 'edit' || live.at === 0) return;
    setLive({ ...live, at: live.at - 1 });
    if (live.mode === 'run') persist(live.queue, live.at - 1, family);
  };

  /** `later`: вопрос закрывается, очередь стоит в сессии — ряд предложит `resume N`. */
  const later = () => {
    if (!live) return;
    if (live.mode === 'run') persist(live.queue, live.at, family);
    setLive(null);
  };

  const resume = () => {
    if (!remaining.length || readOnly) return;
    if (!rolesFirst('resume')) resumeQueue();
  };
  const resumeQueue = () => {
    if (!remaining.length || readOnly) return;
    const fam = pendingFamily || session?.family || '';
    setFamily(fam);
    setListOpen(false);
    setLive({ queue: remaining, at: 0, mode: 'run' });
    persist(remaining, 0, fam);
  };

  /** W-C7: забыть ответ (и его уточнение) — пустая строка id, сервер удаляет. `true` — легло. */
  const forget = async (a: DesignQuizAnswer) => {
    if (readOnly || !ready || !a.question) return false;
    const rows = [forgetRow(a.question)];
    for (const id of followUpIds(a.question)) {
      const child = answers.find((x) => x.question?.id === id);
      if (child?.question) rows.push(forgetRow(child.question));
    }
    try {
      await save.mutateAsync({ rows });
      return true;
    } catch {
      /* отказ сказан снэкбаром, строка вернулась */
      return false;
    }
  };

  /** D1: карточка изменилась после ответа — `keep` пересохраняет тот же ответ, он снова свежий. */
  const keep = async (a: DesignQuizAnswer) => {
    if (readOnly || !ready || !a.question) return false;
    try {
      await save.mutateAsync({ rows: [keepRow(a)] });
      return true;
    } catch {
      /* отказ сказан снэкбаром */
      return false;
    }
  };

  /**
   * 98-STALE: `N stale` — проход только по устаревшим ответам, в порядке списка, обычной карточкой
   * вопроса (пиктограмма или картинка доски, как всегда). Прогона на сервере он не открывает.
   */
  const review = () => {
    if (readOnly || !ready) return;
    const queue = answers
      .filter((a) => a.stale && !a.skipped && a.question)
      .map((a) => a.question as DesignQuizQuestion);
    if (!queue.length) return;
    setRefusal(null);
    setNothingLeft(false);
    setListOpen(false);
    setLive({ queue, at: 0, mode: 'review' });
  };
  /** Шаг прохода после keep / forget: следующий устаревший, за последним — список ответов. */
  const reviewStep = (ok: boolean) => {
    if (!ok || !live || shownCard.current !== card) return;
    const next = live.at + 1;
    if (next < live.queue.length) {
      setLive({ ...live, at: next });
      return;
    }
    setLive(null);
    setListOpen(true);
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

  if (live && q) {
    const prior = answers.find((a) => a.question?.id === q.id);
    // 98: в проходе `N stale` устаревший ответ встаёт с keep / forget вместо skip / back; вставленное
    // уточнение (свежий вопрос без ответа) — обычной карточкой.
    const stale = live.mode === 'review' && prior?.stale && !prior.skipped ? prior : null;
    return (
      <QuestionView
        key={`${live.mode}:${q.id}`}
        question={q}
        picture={q.mediaId ? pictureOf?.(q.mediaId) ?? null : undefined}
        family={q.family || family}
        position={live.mode === 'edit' ? null : { n: live.at + 1, of: live.queue.length }}
        prior={prior}
        busy={save.isPending || !ready}
        onCommit={(selected, text) => commit(q, selected, text, false)}
        onSkip={() => commit(q, [], '', true)}
        onBack={live.mode === 'run' || live.mode === 'role' ? (live.at > 0 ? back : null) : null}
        onLater={live.mode !== 'edit' ? later : null}
        stale={
          stale
            ? {
                changes: staleChangesOf(stale),
                onKeep: () => void keep(stale).then(reviewStep),
                onForget: () => void forget(stale).then(reviewStep),
              }
            : null
        }
      />
    );
  }

  const answered = answers.filter((a) => !a.skipped).length;
  const staleCount = answers.filter((a) => a.stale && !a.skipped).length;
  // D3: описание пишется и без картинок доски — достаточно одного ответа.
  const canApply = !readOnly && answered > 0;

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
        pendingLabel={elapsed > 0 ? `reading the board… ${elapsed} s` : 'reading the board…'}
        trailing={
          <>
            {answersFailed && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                onClick={() => void refetch()}
              >
                retry
              </Button>
            )}
            {!asking && !readOnly && remaining.length > 0 && (
              <>
                <Button variant='underline' size='xs' data-quiz-resume='' onClick={resume}>
                  resume {remaining.length}
                </Button>
                <Button
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  data-quiz-discard=''
                  onClick={() => void discard()}
                >
                  discard
                </Button>
              </>
            )}
            {nothingLeft && (
              <Text size='micro' variant='label' component='span'>
                nothing left to ask
              </Text>
            )}
            {answers.length > 0 && (
              <>
                <Counter n={answered} noun='answer' />
                {staleCount > 0 && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='text-warning'
                    data-quiz-stale-count={staleCount}
                    disabled={readOnly}
                    onClick={review}
                  >
                    {staleCount} stale
                  </Button>
                )}
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
        <ul className='mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-hairline'>
          {answers.map((a) => {
            const changes = a.skipped ? [] : staleChangesOf(a);
            return (
              <li
                key={a.question?.id}
                className='group col-span-2 grid grid-cols-subgrid items-baseline border-b border-hairline'
              >
                <AnswerLine
                  answer={a}
                  picture={
                    a.question?.mediaId ? pictureOf?.(a.question.mediaId) ?? null : undefined
                  }
                  readOnly={readOnly}
                  onOpen={() => reopen(a)}
                  onHover={(on) =>
                    setHoverPic(on && a.question?.mediaId ? a.question.mediaId : null)
                  }
                />
                <span className='flex items-baseline justify-end gap-3'>
                  {a.stale && !a.skipped && (
                    <>
                      {!changes.length && (
                        <Text
                          size='micro'
                          component='span'
                          className='text-warning'
                          data-quiz-stale=''
                        >
                          stale
                        </Text>
                      )}
                      {!readOnly && (
                        <Button
                          variant='underline'
                          size='xs'
                          data-quiz-confirm=''
                          disabled={save.isPending || !ready}
                          onClick={() => void keep(a)}
                        >
                          keep
                        </Button>
                      )}
                    </>
                  )}
                  {!readOnly && (
                    <Button
                      variant='underline'
                      size='xs'
                      className='text-labelColor opacity-0 hover:text-textColor focus-visible:opacity-100 group-hover:opacity-100'
                      disabled={save.isPending || !ready}
                      onClick={() => void forget(a)}
                    >
                      forget
                    </Button>
                  )}
                </span>
                {changes.length > 0 && (
                  <StaleChanges
                    changes={changes}
                    data-quiz-stale=''
                    className='col-start-1 pb-1 pl-[88px]'
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Слово над вопросом про картинку: роль картинки на доске (`target`, `material`…) или `picture`. */
const pictureWords = (p: QuizPicture | null) =>
  p ? `${p.role || 'picture'} · picture ${p.n}` : 'picture · off the board';
/** 97: над вопросом роли — `role · picture N`, а не нынешняя роль (её и спрашивают). */
const roleWords = (p: QuizPicture | null) => (p ? `role · picture ${p.n}` : 'role');

/**
 * 96: вопрос про картинку доски несёт саму картинку на месте пиктограммы — тот же слот, кадр
 * `object-cover` в чернильной рамке 1px. Картинку сняли с доски — пустая рамка со словом.
 */
function PictureThumb({
  mediaId,
  picture,
  className,
}: {
  mediaId: number;
  picture: QuizPicture | null;
  className: string;
}): JSX.Element {
  return (
    <span
      data-quiz-picture={mediaId}
      className={cn('block overflow-hidden border border-textColor bg-bgZebra', className)}
    >
      {picture?.url ? (
        <img
          src={picture.url}
          alt={`moodboard picture ${picture.n}`}
          draggable={false}
          className='size-full object-cover'
        />
      ) : null}
    </span>
  );
}

/** 98-STALE: что изменилось с ответа — строка на факт, мелко, цветом пометки `stale`. */
function StaleChanges({
  changes,
  className,
  ...rest
}: {
  changes: string[];
  className?: string;
  'data-quiz-stale'?: string;
}): JSX.Element {
  return (
    <ul className={cn('text-warning', className)} data-quiz-changes='' {...rest}>
      {changes.map((line) => (
        <li key={line}>
          <Text size='micro' component='span' className='text-warning'>
            {line}
          </Text>
        </li>
      ))}
    </ul>
  );
}

function AnswerLine({
  answer,
  picture,
  readOnly,
  onOpen,
  onHover,
}: {
  answer: DesignQuizAnswer;
  /** `undefined` — не вопрос про картинку; `null` — картинки на доске уже нет. */
  picture?: QuizPicture | null;
  readOnly: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}): JSX.Element {
  const q = answer.question;
  const text = answerText(answer);
  const mediaId = q?.mediaId ?? 0;
  return (
    <button
      type='button'
      disabled={readOnly}
      onClick={onOpen}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className='grid w-full grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-3 py-1 text-left enabled:cursor-pointer enabled:hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-textColor'
    >
      {mediaId > 0 ? (
        <PictureThumb
          mediaId={mediaId}
          picture={picture ?? null}
          className='h-6 w-4 self-center justify-self-start'
        />
      ) : (
        <Pill tone='mut' className='justify-self-start'>
          {q?.category || 'design'}
        </Pill>
      )}
      <Text size='micro' variant='label' component='span' className='truncate' title={q?.question}>
        {mediaId > 0
          ? `${pictureWords(picture ?? null)} · `
          : q?.part && q.part !== 'whole'
            ? `${partWords(q.part)} · `
            : ''}
        {q?.question}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('truncate', !text && 'text-labelColor')}
        title={text || undefined}
      >
        {text || 'later'}
      </Text>
    </button>
  );
}

function QuestionView({
  question,
  picture,
  family,
  position,
  prior,
  busy,
  onCommit,
  onSkip,
  onBack,
  onLater,
  stale,
}: {
  question: DesignQuizQuestion;
  /** 96: `undefined` — обычный вопрос (пиктограмма); иначе картинка доски (`null` — её сняли). */
  picture?: QuizPicture | null;
  family: string;
  /** Номер в прогоне; `null` — вопрос открыт из списка ответов. */
  position: { n: number; of: number } | null;
  prior?: DesignQuizAnswer;
  busy: boolean;
  onCommit: (selected: string[], text: string) => void;
  onSkip: () => void;
  /** W-C4: прошлый вопрос прогона; `null` — первый вопрос или правка из списка. */
  onBack: (() => void) | null;
  /** W-C3: закрыть вопрос, очередь остаётся; `null` — правка из списка. */
  onLater: (() => void) | null;
  /**
   * 98-STALE: вопрос устаревшего ответа в проходе `N stale` — что изменилось (над вариантами),
   * `keep` (K) пересохраняет прежний ответ, `forget` (F) снимает его; правка + Enter — `change ›`.
   */
  stale?: { changes: string[]; onKeep: () => void; onForget: () => void } | null;
}): JSX.Element {
  const options = question.options ?? [];
  const colourQuestion = isColourQuestion(question);
  const optionCloseups = options.map((option): OptionCloseup | null => {
    const hardware = hardwareOf(option);
    if (hardware) return { type: 'hardware', kind: hardware };
    const label = labelOf(option);
    if (label) return { type: 'label', kind: label };
    const seam = seamOf(option);
    if (seam) return { type: 'seam', kind: seam };
    const swatch = colourQuestion ? swatchOf(option) : null;
    return swatch ? { type: 'swatch', kind: swatch } : null;
  });
  const comparedKinds = new Set<string>();
  for (const closeup of optionCloseups) {
    if (closeup) comparedKinds.add(`${closeup.type}:${closeup.kind}`);
  }
  const showOptionCloseups = comparedKinds.size >= 2;
  const multi = question.kind === 'multi';
  // 97: вопрос роли — выбор из четырёх; своё слово положить некуда (роль живёт на картинке).
  const roleStep = isRoleQuestion(question);
  const [initialSelected] = useState<string[]>(() =>
    prior && !prior.skipped ? (prior.selected ?? []).filter((s) => options.includes(s)) : [],
  );
  const initialText = prior && !prior.skipped ? prior.freeText ?? '' : '';
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [text, setText] = useState(initialText);
  // 98: ответ в проходе не тронут — подтверждение уходит как `keep` (тот же ответ, байт в байт).
  const unchanged = (sel: readonly string[], txt: string) =>
    sel.length === initialSelected.length &&
    sel.every((x) => initialSelected.includes(x)) &&
    txt.trim() === initialText.trim();
  const confirmAs = (sel: string[], txt: string) => {
    if (stale && unchanged(sel, txt)) stale.onKeep();
    else onCommit(sel, txt);
  };
  const advance = useRef<number | null>(null);
  const confirmRef = useRef(confirmAs);
  confirmRef.current = confirmAs;
  // W-C5: чип нажат, пока своё слово в фокусе (фокус уходит ДО клика — снимается на pointerdown).
  const ownFocused = useRef(false);
  const [held, setHeld] = useState(false);
  const ownName = `quiz-own-${question.id}`;
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
      if (advance.current) window.clearTimeout(advance.current);
      // W-C5: человек пишет своё слово (поле в фокусе или не пусто) — выбор не продвигает, `next ›`.
      if (ownFocused.current || text.trim() !== '') {
        ownFocused.current = false;
        setHeld(true);
        return;
      }
      // Одиночный выбор продвигает сам — через 150 мс, чтобы выбор успел стать видимым.
      advance.current = window.setTimeout(() => confirmRef.current([option], text), 150);
    },
    [busy, multi, text],
  );

  const canSend = selected.length > 0 || text.trim() !== '';
  const send = () => {
    if (busy || !canSend) return;
    confirmAs(selected, text);
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // Цифры 1–6 — варианты (вне поля ввода). 98: в проходе `N stale` ещё K — keep, F — forget,
  // Enter — подтвердить что выбрано (не тронуто — тот же keep).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) {
        if (!/^(BUTTON|A)$/.test(t.tagName)) return;
        // На кнопке Enter — её собственный щелчок; буквы и цифры работают и там.
        if (e.key === 'Enter') return;
      }
      if (stale && !busy) {
        const k = e.key.toLowerCase();
        if (k === 'k' || k === 'f' || e.key === 'Enter') {
          e.preventDefault();
          if (k === 'k') stale.onKeep();
          else if (k === 'f') stale.onForget();
          else sendRef.current();
          return;
        }
      }
      const i = Number(e.key) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= options.length) return;
      e.preventDefault();
      pick(options[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, pick, stale, busy]);

  return (
    <div className='grid grid-cols-[64px_minmax(0,1fr)] items-start gap-4 py-1' data-quiz=''>
      {question.mediaId ? (
        <PictureThumb mediaId={question.mediaId} picture={picture ?? null} className='h-24 w-16' />
      ) : (
        <div className='h-24 w-16 text-textColor'>
          <PartPictogram
            family={family}
            part={question.part || 'whole'}
            category={question.category}
            className='h-24 w-16'
          />
        </div>
      )}
      <div className='min-w-0 space-y-2'>
        <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
          {roleStep
            ? roleWords(picture ?? null)
            : question.mediaId
              ? pictureWords(picture ?? null)
              : question.category || 'design'}
          {position ? ` · ${position.n} / ${position.of}` : ''}
        </Text>
        <Text component='p' className='text-pretty'>
          {question.question}
        </Text>
        {stale && stale.changes.length > 0 && <StaleChanges changes={stale.changes} />}
        <div
          onPointerDownCapture={() => {
            ownFocused.current = document.activeElement?.id === ownName;
          }}
        >
          <ChipRow>
            {options.map((o, index) => {
              const closeup = optionCloseups[index];
              return (
                <Chip
                  key={o}
                  selected={selected.includes(o)}
                  pressed={multi ? selected.includes(o) : undefined}
                  disabled={busy}
                  onClick={() => pick(o)}
                  title={roleStep ? ROLE_HINT[o as keyof typeof ROLE_HINT] : undefined}
                  className='whitespace-normal text-left'
                >
                  {showOptionCloseups && closeup ? (
                    closeup.type === 'hardware' ? (
                      <HardwareIcon kind={closeup.kind} size={14} className='shrink-0' />
                    ) : closeup.type === 'label' ? (
                      <LabelIcon kind={closeup.kind} size={14} className='shrink-0' />
                    ) : closeup.type === 'seam' ? (
                      // A seam cross-section is unreadable at 14 px (mock-fell, overlock and French
                      // collapse into the same band): chips carry it 48 px wide, cropped to its band.
                      <SeamIcon kind={closeup.kind} size={48} band className='shrink-0' />
                    ) : (
                      <span
                        aria-hidden
                        data-swatch={closeup.kind}
                        className='size-[10px] shrink-0 rounded-full border border-borderColor'
                        style={{ background: closeup.kind }}
                      />
                    )
                  ) : null}
                  {o}
                </Chip>
              );
            })}
          </ChipRow>
        </div>
        <div className='flex items-start gap-2'>
          {!roleStep && (
            <Textarea
              name={ownName}
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
          )}
          {stale ? (
            <>
              {canSend && !unchanged(selected, text) && (
                <Button
                  variant='underline'
                  size='xs'
                  className='mt-1'
                  data-quiz-change=''
                  disabled={busy}
                  onClick={send}
                >
                  change ›
                </Button>
              )}
              <Button
                variant='underline'
                size='xs'
                className='mt-1'
                data-quiz-keep=''
                disabled={busy}
                onClick={stale.onKeep}
              >
                keep
              </Button>
            </>
          ) : (
            (multi || held || text.trim() !== '') &&
            canSend && (
              <Button variant='underline' size='xs' className='mt-1' disabled={busy} onClick={send}>
                next ›
              </Button>
            )
          )}
          {onBack && (
            <Button
              variant='underline'
              size='xs'
              className='mt-1 text-labelColor hover:text-textColor'
              disabled={busy}
              onClick={onBack}
            >
              back
            </Button>
          )}
          <Button
            variant='underline'
            size='xs'
            className='mt-1 text-labelColor hover:text-textColor'
            data-quiz-forget={stale ? '' : undefined}
            disabled={busy}
            onClick={stale ? stale.onForget : onSkip}
          >
            {stale ? 'forget' : 'skip'}
          </Button>
          {onLater && (
            <Button
              variant='underline'
              size='xs'
              className='mt-1 text-labelColor hover:text-textColor'
              onClick={onLater}
            >
              later
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
