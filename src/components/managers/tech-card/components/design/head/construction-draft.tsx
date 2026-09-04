import type { common_DesignRun } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { bornBomLine, bornCallout, upsertDetailText } from '../../form-writers';
import type { TechCardFormData } from '../../schema';
import { formatMoney } from '../generation/money';
import { GenerateRow } from '../render/generate-row';
import type { Gate } from '../render/model';
import { newClientRequestId } from '../use-design-band';
import {
  diffProposal,
  parseConstructionDraft,
  PROPOSAL_GROUPS,
  type ConstructionDraft,
  type ProposalRow,
} from './construction-draft-model';
import { draftIdeaRefusal, useDraftDesignIdea } from './use-draft-idea';

/**
 * «DRAFT THE CONSTRUCTION» — ОДНА КНОПКА, ОДИН ПЛАТНЫЙ ПРОГОН, ОДИН ОТВЕТ НА ЧЕТЫРЕ ГРУППЫ.
 *
 * Владелец, дословно: «Внизу вместо кнопки `DRAFT THE IDEA ▸` мы генерируем ВЕСЬ construction info
 * на основании того, что знаем. Интерфейс простой и интуитивный, impeccable. Не уходить в дебри».
 * Здесь стоял `MoodDraft`, который предлагал ПРОЗУ в одно поле (`concept`); теперь предлагается
 * СТРУКТУРА в четыре группы, которые рисует сам CONSTRUCTION: общие сведения, аспекты, указания,
 * спецификация.
 *
 * ═══ НИЧЕГО НЕ ЗАПИСАНО, ПОКА ЧЕЛОВЕК НЕ НАЖАЛ ПО СТРОКЕ ════════════════════════════════════
 *
 * ⚠ И ЭТО НЕ ОСТОРОЖНОСТЬ, А ЕДИНСТВЕННАЯ ЗАЩИТА ОТ ЗАПИСАННОГО ДЕФЕКТА. Тех-карта сохраняется
 * ПОЛНОЙ ПЕРЕЗАПИСЬЮ (`mapFormToTechCardInsert` перечисляет поля поимённо), поэтому объект, у
 * которого поля НЕТ, доезжает до сервера zod-дефолтом — то есть командой «очисти это»
 * (`techcard-draft-restore-wipes-absent-fields`). Стирание требует трёх вещей разом: объект модели
 * попал в форму, он заменил строку или блок ЦЕЛИКОМ, схема формы дозаполнила его дыры. Здесь нет
 * ни одной из трёх:
 *   1. ответ разбирается СВОЕЙ схемой (`construction-draft-model.ts`), ни один его объект никогда
 *      не становится значением формы;
 *   2. строки РОЖДАЮТСЯ конструкторами, которыми рождаются рукописные (`bornCallout`,
 *      `bornBomLine`), а скаляры патчатся ПО ПУТИ (`upsertDetailText`, `setValue('fit')`) —
 *      ни одного `setValue` на корень массива, кроме добавления в конец, и ни одного `reset`;
 *   3. кнопки «принять всё» НЕТ. Молчание модели не выразимо как жест, поэтому поле, о котором
 *      она не сказала, не может быть очищено её ответом ни при каком стечении кликов.
 * Плюс четвёртое: сравнение считается на КАЖДОМ рендере против ЖИВЫХ значений формы, поэтому
 * принятое становится `same` и предложить его второй раз нечем.
 *
 * ═══ ЧТО ЧИТАЕТ ПРОГОН ══════════════════════════════════════════════════════════════════════
 *
 * Сервер собирает вход САМ — картинки доски, описание (`concept`), выноски с привязкой к картинке
 * и месту, — и читает он СОХРАНЁННУЮ карточку. Клиент не шлёт ни одного из этих полей: провенанс,
 * который подаёт вызывающий, — это заявка, а не провенанс. Отсюда же отказ «save the card first»:
 * несохранённая правка доски до промпта не доедет, и черновик, прочитавший вчерашнюю доску, врал
 * бы молча.
 *
 * ЗДЕСЬ НЕТ `useFieldArray`, И ЭТО НЕ СЛУЧАЙНОСТЬ. Поля-массивы `callouts` и `bomItems` держат по
 * одному экземпляру во всём дереве (студийные выноски и вкладка BOM); второй экземпляр в этой
 * версии RHF молча терял бы строки первого (`rhf-fieldarray-mutations-dont-broadcast`). Поэтому
 * только `useWatch` (чтение) и `setValue` по имени массива (запись) — ровно как у таблицы указаний.
 *
 * ЭТО НЕ БЛОК. Орган рисует под-структуру (`GroupLabel` + строки) и стоит ВНУТРИ блока мудборда.
 * Обёртка в `Section` дала бы блок в блоке.
 */

const hhmm = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(),
  );

/** Что прогон прочитал и когда — плюс слепок, по которому черновик понимает, что протух. */
type Staged = {
  draft: ConstructionDraft;
  readPictures: number;
  readNotes: number;
  time: string;
  fingerprint: string;
};

/** Квитанция строки. Заменяет чипы после клика — сегодняшняя грамматика, слово в слово. */
type Receipt = 'added' | 'replaced' | 'dismissed';

/**
 * ЦЕНА ЭТОГО ПРОГОНА — И БОЛЬШЕ НИЧЕГО (T-12). Владелец: «нам надо показывать только цену
 * генерации и все».
 *
 * `price_actual` ВПЕРЕДИ `price_estimate`: смета — то, что было отложено ДО отправки, факт — сумма
 * попыток, оплаченные неудачи включительно. Текстовый прогон исполняется инлайном и возвращается
 * завершённым, поэтому факт обычно на месте.
 *
 * `null` — ПОЛНОЦЕННЫЙ ОТВЕТ, а не ноль: все денежные поля вырезаны у аккаунта без `costing:read`,
 * и `$0.00` утверждало бы, что прогон был бесплатным. Тогда строки цены нет вовсе.
 */
function runPrice(run?: common_DesignRun): string | null {
  if (!run) return null;
  const currency = run.currency;
  return formatMoney(run.priceActual, currency) || formatMoney(run.priceEstimate, currency) || null;
}

export function ConstructionDraft({
  techCardId,
  disabled,
  conceptMax,
}: {
  techCardId: number;
  disabled?: boolean;
  /**
   * Потолок поля `concept`, ПЕРЕДАННЫЙ ВЛАДЕЛЬЦЕМ ПОЛЯ, а не написанный здесь второй раз.
   * Редактор описания стоит в `mood-board.tsx`, там же его `maxLength`, и там же — единственное
   * написание этого числа (`CONCEPT_MAX`). Второй потолок на одно поле — это способ молча
   * потерять хвост описания на том из них, который меньше; импорт же отсюда завёл бы цикл
   * (`mood-board` монтирует этот орган), а цикл в сборке — это молчаливое `undefined` вместо
   * числа, то есть проверка, которая пропускает всё.
   */
  conceptMax: number;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const draftIdea = useDraftDesignIdea(techCardId);

  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as { mediaId?: number }[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as {
    mediaId?: number;
    part?: string;
    description?: string;
  }[];
  const details = (useWatch({ control, name: 'details' }) ?? []) as {
    key?: string;
    text?: string;
  }[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as { name?: string }[];
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;

  // ЧТО СЧИТАЕТСЯ НЕСОХРАНЁННОЙ ДОСКОЙ — ровно три поля, которые прогон читает из СТОРА. Подписка
  // сужена именами: `useFormState` без имён перерисовывал бы орган на каждом нажатии клавиши в
  // любом поле карточки.
  const { dirtyFields } = useFormState({
    control,
    name: ['concept', 'moodboardMedia', 'callouts'] as never,
  });
  const boardDirty =
    !!dirtyFields.concept ||
    !!(dirtyFields as { moodboardMedia?: unknown }).moodboardMedia ||
    !!(dirtyFields as { callouts?: unknown }).callouts;

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
  const stampOf = (conceptText: string) =>
    JSON.stringify([[...boardIds], conceptText.trim(), boardNotes]);
  const fingerprint = useMemo(
    () => JSON.stringify([[...boardIds], concept.trim(), boardNotes]),
    [boardIds, concept, boardNotes],
  );

  const [staged, setStaged] = useState<Staged | null>(null);
  /** Цена последнего прогона, уже словами. Живёт рядом с черновиком: это цена ЕГО, а не дня. */
  const [price, setPrice] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const stale = !!staged && staged.fingerprint !== fingerprint;

  // КЛЮЧ ИДЕМПОТЕНТНОСТИ ЖИВЁТ НА НАМЕРЕНИИ. Пока запрос не вернулся, повторное нажатие несёт ТОТ
  // ЖЕ ключ — сервер отдаёт ту же строку вместо второй оплаты. Новое намерение («прочитай доску
  // ещё раз») минтит новый.
  const intent = useRef<string | null>(null);

  const readOnly = !!disabled;
  // ⚠ ПУСТОТА МЕРИТСЯ ТАК ЖЕ, КАК ЕЁ МЕРИТ СЕРВЕР: «нет картинок И нет слов». Доска из одних
  // картинок законна (сторож на словах снят в Ф0), доска из одного описания — тоже.
  const nothingToRead = items.length === 0 && !concept.trim() && boardNotes.length === 0;
  const gate: Gate = nothingToRead
    ? {
        ok: false,
        reason: 'there is nothing to read: put a picture on the moodboard or write the description',
      }
    : boardDirty
      ? { ok: false, reason: 'save the card first — the draft reads what is saved' }
      : { ok: true };

  function askForDraft() {
    if (!gate.ok || readOnly || draftIdea.isPending) return;
    if (!intent.current) intent.current = newClientRequestId();
    const snapshot = { pictures: items.length, notes: boardNotes.length, fingerprint };
    draftIdea.mutate(
      { clientRequestId: intent.current },
      {
        onSuccess: (res) => {
          intent.current = null;
          setPrice(runPrice(res.run));
          const parsed = parseConstructionDraft(res.construction);
          if (!parsed) {
            // ПУСТОЙ ОТВЕТ — НЕ ЧЕРНОВИК. Строка в реестре есть, деньги списаны, а предлагать
            // нечего: сказать это прямо честнее, чем нарисовать пустую рамку «черновика».
            showMessage('the run came back with nothing to propose', 'error');
            return;
          }
          setStaged({
            draft: parsed,
            readPictures: snapshot.pictures,
            readNotes: snapshot.notes,
            time: hhmm(),
            fingerprint: snapshot.fingerprint,
          });
          // ВТОРОЙ ПРОГОН ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЕ, А КВИТАНЦИИ ОБНУЛЯЮТСЯ (D5): они говорят про
          // строки прошлого ответа, и оставленные — обещали бы, что уже принято то, чего в новом
          // предложении может не быть вовсе. Принятое при этом никуда не делось — оно на карточке,
          // и новое сравнение покажет его как `same`.
          setReceipts({});
        },
        onError: (error) => {
          // Ключ НЕ сбрасывается: следующий клик — та же попытка того же намерения, и повторить её
          // с новым ключом означало бы заплатить дважды за один вопрос.
          showMessage(draftIdeaRefusal(error), 'error');
        },
      },
    );
  }

  /* ── ПЯТЬ ЗАПИСЕЙ, И НИ ОДНОЙ ШЕСТОЙ ─────────────────────────────────────────────────────
     Каждая ветка зовёт ПИСАТЕЛЯ, который уже существует и которым пользуется рукописная правка.
     Ни одна не собирает объект формы из объекта модели: наверх едут только СТРОКИ. */
  function accept(row: ProposalRow) {
    if (readOnly) return;
    const w = row.write;
    if (w.kind === 'detail') {
      upsertDetailText(getValues, setValue, w.key, w.text);
    } else if (w.kind === 'fit') {
      setValue('fit', w.value as never, { shouldDirty: true });
    } else if (w.kind === 'concept') {
      // Потолок проверяется ДО записи, и отказ говорит числа: молча обрезанное описание — это
      // предложение, потерявшее хвост без единого слова об этом.
      if (w.text.length > conceptMax) {
        showMessage(
          `this description does not fit — the field holds ${conceptMax} characters and the draft is ${w.text.length}`,
          'error',
        );
        return;
      }
      setValue('concept', w.text, { shouldDirty: true });
      // СВОЯ ЖЕ ЗАПИСЬ НЕ ПРОТУХАЕТ ЧЕРНОВИК: без пере-штампа первое же «add» подняло бы плашку
      // «the moodboard has changed since» за собственный клик человека.
      setStaged((prev) => (prev ? { ...prev, fingerprint: stampOf(w.text) } : prev));
    } else if (w.kind === 'callout') {
      const cur = (getValues('callouts') ?? []) as unknown[];
      setValue(
        'callouts',
        [
          ...cur,
          bornCallout({ part: w.part, description: w.description, dimensions: w.dimensions }),
        ] as never,
        { shouldDirty: true },
      );
    } else {
      const cur = (getValues('bomItems') ?? []) as unknown[];
      setValue('bomItems', [...cur, bornBomLine(w.line)] as never, { shouldDirty: true });
    }
    setReceipts((prev) => ({ ...prev, [row.id]: row.state === 'replace' ? 'replaced' : 'added' }));
  }

  // СРАВНЕНИЕ СЧИТАЕТСЯ НА РЕНДЕРЕ, ПРОТИВ ЖИВЫХ ЗНАЧЕНИЙ (D5). Не в `onSuccess` и не в состоянии:
  // принятая строка обязана сама стать `same`, а рукописная правка соседнего поля — сама поменять
  // «add» на «replace», без единого пере-запроса.
  const { rows, missing } = useMemo(
    () =>
      diffProposal(staged?.draft ?? null, {
        fit,
        concept,
        details,
        callouts,
        bomItems,
      }),
    [staged, fit, concept, details, callouts, bomItems],
  );

  // ⚠ «PROPOSED» — ЭТО ЧИСЛО ПРЕДЛОЖЕННОГО, А НЕ ЧИСЛО ОСТАВШЕГОСЯ. Строка, которую только что
  // приняли, честно уезжает в `same` (сравнение живое), и счётчик, читающий только состояние,
  // УМЕНЬШАЛСЯ БЫ на каждом клике — «12 proposed» превращалось бы в «9 proposed · 3 taken», как
  // будто модель предложила меньше, чем предложила. Поэтому строка с квитанцией считается
  // предложенной по-прежнему: она ею и была.
  const proposed = rows.filter((r) => r.state !== 'same' || receipts[r.id]).length;
  const taken = Object.values(receipts).filter((r) => r !== 'dismissed').length;
  const dismissed = Object.values(receipts).filter((r) => r === 'dismissed').length;
  const anyReceipt = taken + dismissed > 0;
  const nothingNew = rows.length > 0 && proposed === 0 && !anyReceipt;

  return (
    <div data-c19-draft=''>
      <GroupLabel>draft of the construction</GroupLabel>

      <GenerateRow
        gate={gate}
        label='draft the construction ▸'
        pending={draftIdea.isPending}
        disabled={readOnly}
        onGenerate={askForDraft}
        trailing={
          /* СВОЙ ХВОСТ, А НЕ СТАНДАРТНЫЙ: `shape` включил бы ещё и дверь описи промпта, которой у
             этого экрана нет — вход собирает сервер сам, и панели «what the model gets» у доски не
             существует. Фраза про деньги — та же самая, дословно: цену называет сервер на старте. */
          <Text size='micro' variant='label' component='span' data-probe='run-price'>
            priced by the server when the run starts
          </Text>
        }
      />

      {staged && (
        <div className='mt-2'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' variant='label' component='span' data-c19-draft-head=''>
              read {staged.readPictures} picture{staged.readPictures === 1 ? '' : 's'} ·{' '}
              {staged.readNotes} note{staged.readNotes === 1 ? '' : 's'} · {staged.time}
            </Text>
            {stale && <Pill tone='attention'>the moodboard has changed since</Pill>}
            {price && (
              <Text size='nano' variant='label' component='span' className='ml-auto'>
                {price}
              </Text>
            )}
          </div>

          {nothingNew && (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              nothing new — the card already says all of this
            </Text>
          )}

          {PROPOSAL_GROUPS.map(({ key, title }) => {
            const group = rows.filter((r) => r.group === key);
            if (group.length === 0) return null;
            return (
              <div key={key} className='mt-1.5' data-c19-draft-group={key}>
                <Text size='nano' variant='label' component='p' className='uppercase'>
                  {title}
                </Text>
                {group.map((row) => (
                  <ProposalLine
                    key={row.id}
                    row={row}
                    receipt={receipts[row.id]}
                    readOnly={readOnly}
                    onAccept={() => accept(row)}
                    onDismiss={() =>
                      setReceipts((prev) => ({ ...prev, [row.id]: 'dismissed' as Receipt }))
                    }
                  />
                ))}
              </div>
            );
          })}

          {/* ЧЕГО НЕ ХВАТАЕТ ПИНА — СОВЕТ, И ТОЛЬКО СОВЕТ. Ему нечего предлагать: он называет
              картинку и место, а пин на картинке ставит рука. Чип «add» здесь писал бы совет в
              поле — ровно то смешение, ради которого ответ разрезан на группы. */}
          {missing.length > 0 && (
            <div className='mt-1.5' data-c19-draft-missing=''>
              <Text size='nano' variant='label' component='p' className='uppercase'>
                what deserves a pin
              </Text>
              {missing.map((line) => (
                <div key={line} className='border-b border-hairline py-1'>
                  <Text size='micro' component='p' className='break-words'>
                    {line}
                  </Text>
                </div>
              ))}
            </div>
          )}

          <div className='mt-1 flex flex-wrap items-baseline gap-2'>
            <Text size='nano' variant='label' component='span' data-c19-draft-count=''>
              {proposed} proposed · {taken} taken · {dismissed} dismissed
            </Text>
            {/* ⚠ ДВЕРЬ ВЕДЁТ ТУДА, КУДА ПРАВДА УЕХАЛИ ЗНАЧЕНИЯ, — А ЭТО ЧЕТЫРЕ БЛОКА НИЖЕ НА ЭТОЙ
                ЖЕ СТРАНИЦЕ. Дизайн-документ называет `onGoTab('construction')`, но с круга 20
                общие сведения, аспекты, таблица указаний и спецификация ПЕРЕЕХАЛИ на STUDIO, а на
                одноимённой вкладке остались операции и разбор. Уводить туда значило бы показать
                человеку экран без единого поля, которое он только что принял. Расхождение
                названо в отчёте фазы. Двери нет вовсе, пока некуда идти: якорь ставит
                `ConstructionGeneralInfo` (`data-c19-general`), и его отсутствие — это монтаж
                органа в одиночку, а не «кнопка не нарисовалась». */}
            {anyReceipt && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                data-c19-draft-go=''
                onClick={() => {
                  const target = document.querySelector('[data-c19-general]');
                  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                see it on CONSTRUCTION ▸
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ОДНА СТРОКА ПРЕДЛОЖЕНИЯ: нано-подпись поля-адресата, значение чернилами, ОДИН чип.
 *
 * `add` — поле на карточке пусто; `replace` — там стоит другое, и оно печатается приглушённым
 * `was: …` НА ТОЙ ЖЕ СТРОКЕ (это и есть весь дифф, без единого предложения прозы); `same` — уже
 * стоит, и чипов нет вовсе. После клика чип становится квитанцией.
 *
 * ⚠ `dismiss` НЕ ПУНКТИРНЫЙ: пунктир в этой системе означает «добавить», и «dismiss» в костюме
 * добавления читается ровно наоборот тому, что делает.
 */
function ProposalLine({
  row,
  receipt,
  readOnly,
  onAccept,
  onDismiss,
}: {
  row: ProposalRow;
  receipt?: Receipt;
  readOnly: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div
      className='flex items-start gap-2 border-b border-hairline py-1'
      data-c19-draft-row={row.id}
      data-state={row.state}
    >
      <Text size='nano' variant='label' component='span' className='w-24 shrink-0 truncate'>
        {row.label}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-1 break-words'>
        {row.value}
        {row.state === 'replace' && row.current && (
          <Text size='nano' variant='label' component='span' className='ml-2'>
            was: {row.current}
          </Text>
        )}
      </Text>
      {receipt ? (
        <Text size='nano' variant='label' component='span' className='shrink-0' data-c19-draft-receipt={receipt}>
          {receipt}
        </Text>
      ) : row.state === 'same' ? (
        <Pill tone='mut'>same</Pill>
      ) : (
        <ChipRow className='shrink-0'>
          <Chip
            disabled={readOnly}
            onClick={onAccept}
            data-c19-draft-accept={row.id}
            title={
              row.state === 'replace'
                ? 'replace the card’s value with this one'
                : 'write this onto the card'
            }
          >
            {row.state === 'replace' ? 'replace' : 'add'}
          </Chip>
          <Chip
            disabled={readOnly}
            onClick={onDismiss}
            data-c19-draft-dismiss={row.id}
            title='this one is not wanted'
          >
            dismiss
          </Chip>
        </ChipRow>
      )}
    </div>
  );
}
