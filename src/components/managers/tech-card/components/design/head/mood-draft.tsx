import type { common_DesignBudget } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

import type { TechCardFormData } from '../../schema';
import { serverSpeaksDesign } from '../capability';
import { newClientRequestId } from '../use-design-band';
import { draftIdeaRefusal, useDraftDesignIdea } from './use-draft-idea';

/**
 * «DRAFT THE IDEA» — `moodDraftHtml` прототипа (`proto.html:3219`): доска читается, и из неё
 * предлагается ПРОЗА для «concept & construction description».
 *
 * НИЧЕГО НЕ ЗАПИСАНО, ПОКА ЧЕЛОВЕК НЕ ДОБАВИЛ СТРОКУ, и это главное свойство органа. Модель пишет
 * черновик; принимает его человек, построчно, и каждая строка получает квитанцию — «added» или
 * «dismissed». Автозапись прозы в концепт означала бы, что подпись стиля, которую печатает тех-пак
 * и которая входит в дайджест DESIGN, меняется от нажатия одной кнопки.
 *
 * ЧТО ЧИТАЕТСЯ. Сервер собирает вход сам (картинки доски, общая записка, карточка) — клиент НЕ шлёт
 * ему ни одного из этих полей: провенанс, который подаёт вызывающий, — это заявка, а не провенанс.
 * Поэтому кнопка не имеет тела запроса, кроме id карточки и ключа идемпотентности.
 *
 * ЧЕРНОВИК ПРОТУХАЕТ, И СРАВНИВАЕТСЯ ИМЕННО ТО, ЧТО ЧЕЛОВЕК ПРАВИТ РУКАМИ: состав доски, общая
 * записка И ТЕКСТЫ МУДБОРДНЫХ УКАЗАНИЙ. Слепок из «числа плиток + записки» молчал ровно тогда,
 * когда работа шла: дописал пометку — черновик по-прежнему «свежий», хотя читал он другую доску.
 *
 * ЗДЕСЬ НЕТ `useFieldArray`, И ЭТО НЕ СЛУЧАЙНОСТЬ. Единственный экземпляр поля-массива над
 * `callouts` во всём дереве STUDIO живёт в `design/mood-callouts.tsx`; в react-hook-form 7.62
 * мутаторы поля-массива не вещают, и второй экземпляр молча терял бы строки первого. Отсюда —
 * только `useWatch`, то есть чтение.
 *
 * ЭТО НЕ БЛОК. Орган рисует под-структуру (`GroupLabel` + строки) и предназначен стоять ВНУТРИ
 * блока мудборда, как `moodDraftHtml` стоит внутри `moodboardHtml`. Обёртка в `Section` дала бы
 * блок в блоке.
 */

/** Резка ответа на предложения-кандидаты. Без lookbehind: он есть не во всяком движке, а цена
 *  ошибки — пустой список там, где текст пришёл. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

const hhmm = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(),
  );

/** Слепок доски, по которому черновик понимает, что он протух. */
type Draft = {
  lines: string[];
  readPictures: number;
  readNotes: number;
  time: string;
  fingerprint: string;
};

function budgetLine(budget?: common_DesignBudget): string | null {
  if (!budget) return null;
  const currency = (budget.currency ?? '').trim();
  const spent = decimalToInput(budget.spent);
  const reserved = decimalToInput(budget.reserved);
  const cap = decimalToInput(budget.cap);
  if (!spent && !cap) return null;
  // ДВА ЧИСЛА, А НЕ СУММА: «списано» и «зарезервировано» — разные факты, и одно поле с именем
  // «spent», держащее их сумму, врало бы про то, что реально оплачено.
  const reservedPart = reserved && reserved !== '0' ? ` · ${reserved} reserved` : '';
  return `today ${currency} ${spent || '0'}${reservedPart} of ${cap || '—'}`;
}

export function MoodDraft({
  techCardId,
  disabled,
}: {
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const speaks = serverSpeaksDesign();
  const draftIdea = useDraftDesignIdea(techCardId);

  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as { mediaId?: number }[];
  const moodNote = (useWatch({ control, name: 'moodNote' }) ?? '') as string;
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as {
    mediaId?: number;
    description?: string;
  }[];
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;

  const boardIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const boardNotes = useMemo(
    () =>
      callouts
        .filter((c) => boardIds.has(c.mediaId ?? 0))
        .map((c) => (c.description ?? '').trim())
        .filter(Boolean),
    [callouts, boardIds],
  );

  const fingerprint = useMemo(
    () => JSON.stringify([[...boardIds], moodNote.trim(), boardNotes]),
    [boardIds, moodNote, boardNotes],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [budget, setBudget] = useState<common_DesignBudget | undefined>(undefined);
  const [taken, setTaken] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const stale = !!draft && draft.fingerprint !== fingerprint;

  // КЛЮЧ ИДЕМПОТЕНТНОСТИ ЖИВЁТ НА НАМЕРЕНИИ. Пока запрос не вернулся, повторное нажатие несёт ТОТ
  // ЖЕ ключ — сервер отдаёт ту же строку вместо второй оплаты. Новое намерение («прочитай доску
  // ещё раз, она изменилась») минтит новый.
  const intent = useRef<string | null>(null);

  const readOnly = !!disabled;
  const empty = items.length === 0;
  const refusal = !speaks
    ? 'this server does not serve the design band yet — the draft is one of its calls'
    : empty
      ? 'there is nothing to read: put at least one picture on the moodboard first'
      : null;

  function askForDraft() {
    if (refusal || readOnly || draftIdea.isPending) return;
    if (!intent.current) intent.current = newClientRequestId();
    const snapshot = { pictures: items.length, notes: boardNotes.length, fingerprint };
    draftIdea.mutate(
      { clientRequestId: intent.current },
      {
        onSuccess: (res) => {
          intent.current = null;
          setBudget(res.budget);
          const text = (res.run?.outputText ?? '').trim();
          if (!text) {
            // ПУСТОЙ ОТВЕТ — НЕ ЧЕРНОВИК. Строка в реестре есть, деньги списаны, а предлагать
            // нечего: сказать это прямо честнее, чем нарисовать пустую рамку «черновика».
            showMessage('the run came back with no text — nothing to offer', 'error');
            return;
          }
          setDraft({
            lines: sentences(text),
            readPictures: snapshot.pictures,
            readNotes: snapshot.notes,
            time: hhmm(),
            fingerprint: snapshot.fingerprint,
          });
          setTaken([]);
          setDismissed([]);
        },
        onError: (error) => {
          // Ключ НЕ сбрасывается: следующий клик — та же попытка того же намерения, и повторить её
          // с новым ключом означало бы заплатить дважды за один вопрос.
          showMessage(draftIdeaRefusal(error), 'error');
        },
      },
    );
  }

  function addLine(line: string) {
    const current = (getValues('concept') ?? '').trim();
    setValue('concept', current ? `${current}\n${line}` : line, { shouldDirty: true });
    setTaken((prev) => [...prev, line]);
  }

  // Предложение, уже стоящее в концепте (его добавили здесь, набрали руками или принесли из
  // прошлого черновика), предлагать нечего.
  const offered = (draft?.lines ?? []).filter(
    (line) => !taken.includes(line) && !dismissed.includes(line) && !concept.includes(line),
  );
  const money = budgetLine(budget);

  return (
    <div>
      <GroupLabel>draft of the idea</GroupLabel>

      <div className='flex flex-wrap items-baseline gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={readOnly || !!refusal}
          loading={draftIdea.isPending}
          title={refusal ?? 'a paid call — it goes into the day’s generation budget'}
          onClick={askForDraft}
        >
          draft the idea ▸
        </Button>
        <Text size='micro' variant='label' component='span' className='min-w-0 flex-1'>
          reads the pictures, the shared note and every note pinned on them, and offers PROSE for
          the concept. <b>Nothing is written until you add a line.</b>
        </Text>
      </div>

      {refusal && (
        <Text size='micro' variant='label' component='p' className='mt-1'>
          {refusal}
        </Text>
      )}

      {draft && (
        <div className='mt-2'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' variant='label' component='span'>
              read {draft.readPictures} picture{draft.readPictures === 1 ? '' : 's'} ·{' '}
              {draft.readNotes} note{draft.readNotes === 1 ? '' : 's'} · {draft.time}
            </Text>
            {stale && <Pill tone='attention'>the moodboard has changed since</Pill>}
            {money && (
              <Text size='nano' variant='label' component='span' className='ml-auto'>
                {money}
              </Text>
            )}
          </div>

          {offered.length === 0 ? (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              Nothing new: every sentence of the draft is already in the description, added or
              dismissed.
            </Text>
          ) : (
            <div className='mt-1'>
              {offered.map((line) => (
                <div key={line} className='flex items-start gap-2 border-b border-hairline py-1'>
                  <ChipRow className='shrink-0'>
                    <Chip
                      disabled={readOnly}
                      onClick={() => addLine(line)}
                      title='append this line to the concept'
                    >
                      add
                    </Chip>
                    {/* НЕ ПУНКТИРНЫЙ: пунктир в этой системе означает «добавить», и «dismiss» в
                        костюме добавления читается ровно наоборот тому, что делает. */}
                    <Chip
                      disabled={readOnly}
                      onClick={() => setDismissed((prev) => [...prev, line])}
                      title='this sentence is not wanted'
                    >
                      dismiss
                    </Chip>
                  </ChipRow>
                  <Text size='micro' component='span' className='min-w-0 flex-1'>
                    {line}
                  </Text>
                  <Text size='nano' variant='label' component='span' className='shrink-0'>
                    moodboard
                  </Text>
                </div>
              ))}
            </div>
          )}

          {(taken.length > 0 || dismissed.length > 0) && (
            <Text size='nano' variant='label' component='p' className='mt-1'>
              {taken.length} added · {dismissed.length} dismissed — a receipt per line, so the same
              sentence is never offered twice.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
