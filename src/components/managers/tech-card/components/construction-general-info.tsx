import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useId, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { AiEnhance, type EnhanceField } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { GROUP_SEAM } from './design/core';
import { cardFactsContext } from './design/core/card-facts';
import { DraftedField } from './design/core/drafted-field';
import { isBoardRow } from './design/core/mood-gate';
import { draftedKey, useDrafted } from './design/drafted-contract';
import { fitChoicesFor, fitLabel } from './design/fit-vocabulary';
import { useCardFacts } from './design/head/card-facts-form';
import { useAcceptOnEdit } from './design/head/drafted-provider';
import { BoardMovedPill, DraftedPill } from './design/head/mood-organs';
import { FitCell } from './design/style-cells';
import { upsertDetailText } from './form-writers';
import { CategoryBrowser } from './header-meta-fields';
import { TechCardFormData } from './schema';

// C-5 · GENERAL INFORMATION — the block the owner asked for in CONSTRUCTION.
//
// ГДЕ ОН СТОИТ: шаг MOODBOARD вкладки STUDIO, четвёртым блоком сверху — под доской, описанием и
// черновиком, над CONSTRUCTION и MATERIAL SLOTS (макет `_step-mood.js`, `zGeneralBlock`). Монтаж
// один, довод — там же, в `design/studio-tab.tsx`.
//
// ═══ РАСКЛАДКА: ГРИД 2×2, ПОДПИСЬ ПОЛЯ И БОЛЬШЕ НИЧЕГО (r2, п.4) ══════════════════════════════
//
// Макет держал четыре поля гридом два на два и В ТОЙ ЖЕ СТРОКЕ подписи — пилюлю происхождения:
// `SILHOUETTE [DRAFTED]`, `FABRIC [DRAFTED]`. Владелец, увидев это на бете (2026-09-06, п.4):
// «SILHOUETTE (DRAFTED) и FABRIC (DRAFTED) выглядит криво» — пер-полевые пилюли сняты ЦЕЛИКОМ.
// Довод не только про вид: происхождение поля здесь ничего не решает — читатель этого блока
// правит текст, а не разбирается, кто его написал; разбор «что предложил черновик» стоит одним
// местом выше, блоком CONSTRUCTION DRAFT, где у каждой строки есть `show ▸` с обеими редакциями.
// Строка подписи снова несёт ровно одно слово, и два поля рядом читаются одинаково.
//
// ⚠ ВОЛНА 25.09 (D-07) ВЕРНУЛА ПОМЕТКУ, НО НЕ В СТРОКУ ПОДПИСИ. Владелец попросил подсвечивать то,
// что заполнил черновик, — это синяя рамка поля и пилюля `drafted` на ВЕРХНЕМ КРАЕ рамки, как
// легенда: подпись поля по-прежнему несёт одно слово.
//
// ═══ ШАПКА БЛОКА — СВОЯ, И РЯД ПИЛЮЛЬ СТОИТ В НЕЙ (r1, по макету `step-1.png`) ═════════════════
//
// Блок рисует СВОЮ `Section` — `general information · what this style is` — и ставит
// `GeneralInformationAction` (после рулинга 11 — только `MOODBOARD MOVED ON`, когда он есть)
// в её `action`, то есть в правый угол линейки, ровно как макет. Раньше обёртку держал композитор
// (`design/studio-tab.tsx`) и слота `action` не отдавал, поэтому ряд стоял первой строкой ПОД
// линейкой — на бете это прочли как расхождение с макетом. Обёртка переехала сюда по той же
// причине, по какой её держат `MaterialSlots` и `ConstructionDraft`: предупреждение знает только
// орган (`BoardMovedPill`), а `Section` с `action` — это один узел, и делить его между двумя файлами
// значило бы тянуть счёты наверх пропами ради одной строки.
//
// ⚠ ГРАНИЦА БЛОКА ПОЭТОМУ ЗДЕСЬ: композитор кладёт этот орган в стек как есть, без своей `Section`
// вокруг, — иначе получится коробка в коробке (DESIGN.md, «A block NEVER contains another block»).
//
// ═══ ЧЕМ ПРОДУКТ ОТЛИЧАЕТСЯ ОТ МАКЕТА, И ПОЧЕМУ ЭТО НЕ РАСХОЖДЕНИЕ ═══════════════════════════
//
// Макет держит четыре поля: FIT · CONCEPT · SILHOUETTE · FABRIC. У продукта CONCEPT — это ОДНО
// поле с описанием доски (V-16, владелец: «CONCEPT & CONSTRUCTION DESCRIPTION это и есть SHARED
// NOTE»), и оно стоит блоком DESCRIPTION выше; второго редактора того же поля здесь не заводится.
// Его место в гриде занимала CATEGORY (с волны 25.09 — строка фактов FIT · CATEGORY над полями;
// aux-карта её прячет, см. ниже). Общий счётчик «N of 3 drafted fields» и пилюлю
// `FROM THE MOODBOARD` владелец снял (рулинг 11), пер-полевые пилюли происхождения — п.4 r2.
//
// ═══ КРУГ 20 — ЧТО ВЛАДЕЛЕЦ ОТСЮДА ЗАБРАЛ, И ЧЕМ ЭТО ОПЛАЧЕНО ════════════════════════════════
//
// B-4: SIZE RANGE СНЯТ ЦЕЛИКОМ — ряд размеров живёт на PATTERNS и правится только там; здесь он
// и был read-only проекцией. B-27: BASE MODEL и BASE SAMPLE SIZE уехали в шапку карточки
// (`components/index.tsx`, блок «base»); категория осталась здесь и зовётся по имени —
// `CategoryBrowser`.
//
// ═══ ВОЛНА 25.09 (T05) — FIT И CATEGORY ЗДЕСЬ ЗНАЧЕНИЯ, А НЕ СЕЛЕКТЫ ═══════════════════════════
//
// Два редактора одного факта на двух шагах — это два места, где его «последнее слово» расходится:
// селект fit здесь писал форму, а на проводе fit несёт `StyleFactsField` (UpdateStyle), и человек
// видел выбор, который уезжал другой дверью. Факты стиля правятся в CARD DETAILS (браузер категорий
// стоял там всегда, селект fit туда переехал в зоне CL-C); здесь они ПЕЧАТАЮТСЯ — посадка словом,
// категория путём по словарю («bottoms › pants › cargo»). Дверь `edit in card details ›`, которая
// стояла справа, снята 26.09 (O-29) — см. `StyleFacts` ниже.
//
// ═══ 26.09 (O-29) — ОДНА ИКОНКА `✎`, И ЗНАЧЕНИЯ ПРАВЯТСЯ НА МЕСТЕ ═════════════════════════════════
//
// Владелец, дословно: «в GENERAL INFORMATION EDIT IN CARD DETAILS › замени просто на иконку эдит и
// чтобы мы могли инлайн это менять». Довод T05 при этом не отменён, а соблюдён строже: второго
// редактора здесь по-прежнему нет — `✎` ставит на место двух напечатанных значений ТЕ ЖЕ ЯЧЕЙКИ,
// которые рисует CARD DETAILS (`FitCell` из `design/style-cells.tsx`, куда она переехала из
// `card-details.tsx`, и `CategoryBrowser`), с теми же замками и той же пометкой `drafted`. Один
// редактор, смонтированный на двух шагах, — не копия.
//
// SILHOUETTE и FABRIC остаются полями и получают две вещи волны: синюю рамку `drafted`, пока в поле
// стоит текст черновика и его не приняли (`drafted-contract.ts`), и кнопку `ai ✦` в правом нижнем
// углу (`AiEnhance`, контекст — факты карточки одним композитором `cardFactsContext`).
//
// NOTHING HERE IS A SECOND PLACE FOR A FACT THAT ALREADY HAS ONE — that is the whole discipline of
// this file, aspect by aspect:
//   · fit / category — printed from THE SAME FORM FIELDS (`fit`, `categoryId`) and, behind `✎`,
//     edited through THE SAME CELLS CARD DETAILS draws (`style-cells.tsx`, `CategoryBrowser`) —
//     one editor on two steps, never a copy (O-29, see above).
//   · silhouette — the `details[]` aspect that ALREADY exists under key `silhouette`. The same
//     row, edited from a second surface.
//   · fabric — a `details[]` row under key `fabric`. Free text; `details` takes custom keys, so it
//     needs no contract change and prints with the other aspects on the description sheet. Ключ
//     ИМЕНОВАННЫЙ (`detailAspects` в tech-card-options.ts).
export function ConstructionGeneralInfo({
  isAux,
  readOnly,
  frozen = false,
}: {
  isAux: boolean;
  /**
   * No write permission, or a released card — the Radix select ignores the outer fieldset. The
   * facts row draws no `✎` under it: nothing here could be edited (O-29).
   */
  readOnly: boolean;
  /**
   * A released card, on its own. The fit is a style fact: its `drafted` pill locks on the grant of
   * its writer (`products:write`, UpdateStyle), as CARD DETAILS does, and not on `tech_cards:write`
   * folded into `readOnly` (seam review, S-m2).
   */
  frozen?: boolean;
}) {
  const techCardId = useTechCardIdFromRoute();
  // ФАКТЫ КАРТОЧКИ ДЛЯ `ai ✦` — ОДНО чтение формы (`useCardFacts`), один композитор строк
  // (`cardFactsContext`). Путь категории берётся оттуда же, чтобы строка на экране и строка,
  // уходящая модели, были одной строкой.
  const facts = useCardFacts(isBoardRow);
  const context = cardFactsContext(facts);

  return (
    /* СВОЯ `Section`, предупреждение доски — в её `action` (разбор в шапке файла). Пояснялка в
       грамматике макета: «· что это». */
    <Section
      title='general information'
      question='· what this style is'
      action={<GeneralInformationAction techCardId={techCardId} />}
      /* ШОВ ОДИН НА ВЕСЬ ШАГ MOOD (r3b, M-1) — `GROUP_SEAM`, 20px: тот же стык «линейка блока →
         содержимое», что у CONSTRUCTION DRAFT и CONSTRUCTION по соседству. Штатные 10px `Section`
         делали этот блок теснее соседей на ровном месте. */
      className={GROUP_SEAM}
    >
      {/* Грид два на два: подписи одного ряда всегда на одной линии, колонки равной ширины, которые
          содержимое растянуть не может (`minmax(0,1fr)`), перенос в один столбец на узком экране.
          24px между КОЛОНКАМИ и РЯДАМИ (r2, слово владельца «дай больше спейсинга»): без пилюль в
          строке подписи ряды сомкнулись, и шов между FIT/CATEGORY и SILHOUETTE/FABRIC перестал
          читаться. `data-c19-general` — якорь проб, остался на содержимом блока. */}
      <div
        className='grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2'
        data-c19-general=''
        data-c19-general-grid=''
      >
        {/* Auxiliary cards carry no fit and no category — the same gate the CLASSIFICATION block
            applied. У aux-карты классификацию задаёт AUXILIARY TYPE в шапке; скрывается ТОЛЬКО
            строка фактов, значение `categoryId` остаётся в форме и раунд-трипится. */}
        {!isAux && (
          <StyleFacts
            categoryPath={facts.categoryPath ?? ''}
            readOnly={readOnly}
            frozen={frozen}
            techCardId={techCardId}
          />
        )}
        <div className='min-w-0' data-c19-field-cell='silhouette'>
          <DetailTextField
            detailKey='silhouette'
            label='silhouette'
            placeholder='what this garment is, before how it is made'
            readOnly={readOnly}
            context={context}
            techCardId={techCardId}
          />
        </div>
        <div className='min-w-0' data-c19-field-cell='fabric'>
          <DetailTextField
            detailKey='fabric'
            label='fabric'
            placeholder='the cloth this style is cut from'
            readOnly={readOnly}
            context={context}
            techCardId={techCardId}
          />
        </div>
      </div>
    </Section>
  );
}

/**
 * ПРАВЫЙ УГОЛ ШАПКИ БЛОКА. Макет рисовал здесь `zFromBoard() + counter(written, 'drafted field') +
 * zMoved()`; владелец (2026-09-06, рулинг 11): «в GENERAL INFORMATION FROM THE MOODBOARD 0 OF 3
 * DRAFTED FIELDS не нужны» — пилюля источника и счётчик сняты. Остаётся ОДНО предупреждение —
 * «moodboard moved on», когда доска ушла вперёд после черновика (оно про потерю, не про счёт);
 * пер-полевые пилюли происхождения сняты следом (п.4 r2). Экспорт оставлен композитору, который
 * захочет собрать блок из частей.
 */
export function GeneralInformationAction({ techCardId }: { techCardId: number }): JSX.Element {
  return (
    <div className='flex flex-wrap items-center justify-end gap-1.5' data-c19-general-action=''>
      <BoardMovedPill techCardId={techCardId} />
    </div>
  );
}

/**
 * ID КАРТОЧКИ — ИЗ АДРЕСА, ТЕМ ЖЕ ЧТЕНИЕМ, КАКИМ ЕГО БЕРЁТ СТРАНИЦА (`components/index.tsx:420`,
 * `parseInt(id)` из `/tech-cards/:id`). Пропа у этого блока нет — его подпись у композитора
 * заморожена, — а журнал заполнений ключуется карточкой, и без ключа пилюля одной карточки
 * подсвечивала бы поля другой. Несохранённая карточка (`/add-tech-card`) даёт 0: журнала у неё
 * нет по построению, и пилюль тоже.
 */
function useTechCardIdFromRoute(): number {
  const { id } = useParams<{ id?: string }>();
  const n = id ? parseInt(id, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Подпись поля — ОДНО СЛОВО И БОЛЬШЕ НИЧЕГО (r2, п.4). Метрика подписи поля (`FormLabel`: 10px,
 * капслок, серый), а не линейка группы: линейка делила бы одно поле с пустотой. Пилюля
 * происхождения стояла здесь же, второй вещью в строке, и снята — разбор в шапке файла.
 */
function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }): JSX.Element {
  return (
    <Text
      size='micro'
      variant='label'
      tracking='label'
      component={htmlFor ? 'label' : 'span'}
      htmlFor={htmlFor}
      className='block leading-none uppercase'
    >
      {children}
    </Text>
  );
}

/**
 * ═══ ФАКТЫ СТИЛЯ — ЗНАЧЕНИЯ И ОДНА ИКОНКА, КОТОРАЯ ДЕЛАЕТ ИХ ЯЧЕЙКАМИ (T05 → O-29) ═══════════════
 *
 * Строка во всю ширину грида: FIT · CATEGORY, справа — одна кнопка `✎`. Печать — та же, что в T05:
 * пустой факт — `—` (DESIGN.md: пустота не рисуется нулём и не прячется); посадка печатается словом
 * словаря (`fitLabel`: `wide_leg` → «wide leg», `a_line` → «a-line»), тем же, каким её печатает CARD
 * DETAILS; посадка, записанная черновиком и ещё не просмотренная, стоит в синей рамке с пилюлей
 * `drafted` — тем же органом, что поля ниже.
 *
 * ═══ 26.09 (O-29): ДВЕРИ НЕТ, ЗНАЧЕНИЯ ПРАВЯТСЯ НА МЕСТЕ ═══════════════════════════════════════════
 *
 * `edit in card details ›` (одна дверь T05, `openStepOf`) заменена ОДНИМ органом: `✎` ставит на
 * место двух напечатанных значений НАСТОЯЩИЕ ячейки — `FitCell` из `design/style-cells.tsx` и
 * `CategoryBrowser`, ровно те компоненты, что рисует CARD DETAILS, а не их копии; та же кнопка,
 * ставшая `✓`, и Escape возвращают печать. Из рук в руки ничего не переходит:
 *   · ТЕ ЖЕ ПОЛЯ. Ячейки пишут `fit` и `categoryId` в форму; категорию сохраняет автосейв как любое
 *     поле тела, посадку — staged UpdateStyle в `StyleFactsField`, как только поле RHF грязное, —
 *     ровно как из CARD DETAILS. Кнопки «сохранить» здесь нет.
 *   · ТЕ ЖЕ ЗАМКИ. `✎` есть только у аккаунта, который может писать карточку, и на карточке, которая
 *     не утверждена (`readOnly` складывает оба — дверь к двум глухим контролам не дверь, Codex m3).
 *     Внутри селект посадки заперт по `products:write` (право UpdateStyle) с теми же словами «needs
 *     products:write» и на утверждённой карточке; браузеру категорий свой замок не нужен — его
 *     триггер гасит `fieldset disabled={frozen}` страницы, а карточка, утверждённая или потерявшая
 *     писателя, пока ячейки открыты, сама возвращается к печати (`open` выводится, не хранится).
 *   · ТА ЖЕ ПОМЕТКА. `FitCell` несёт рамку `drafted` и пилюлю в строке подписи и принимает запись
 *     черновика на настоящем выборе, как в CARD DETAILS; у печати своя пилюля.
 *
 * FIT НЕТ У ВЕЩИ, КОТОРАЯ ПОСАДКИ НЕ НЕСЁТ (accessories · shoes · bags · objects) — ровно как в CARD
 * DETAILS (`fitChoicesFor` → null): строка печатает одну категорию, и `✎` открывает одну категорию.
 * Хранимое значение не трогается.
 *
 * КЛАВИАТУРА. `✎` — кнопка; нажатая с клавиатуры (`detail === 0`, так `DraftedPill` отличает клавишу
 * от указателя) она ведёт фокус в первую ячейку, а Escape откуда угодно внутри строки закрывает
 * ячейки и возвращает фокус кнопке — если Escape не потрачен слоем Radix (раскрытый список, поповер
 * категорий, подтверждение): тот гасит его `preventDefault`. Enter на пилюле печати
 * (`data-drafted-scope`) после принятия ведёт на `✎` — первую кнопку строки, как ищет `focusFieldIn`.
 */
function StyleFacts({
  categoryPath,
  readOnly,
  frozen,
  techCardId,
}: {
  categoryPath: string;
  /** Нет `tech_cards:write`, или карточка утверждена — только печать, без `✎`. */
  readOnly: boolean;
  /** Утверждённая карточка — пилюля `drafted` и селект посадки глухие (фиксап раунда 2, MIN-5). */
  frozen: boolean;
  /** 0 у ещё не сохранённой карточки (`/add-tech-card`) — ячейка посадки знает это как `creating`. */
  techCardId: number;
}): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  /* ПОСАДКУ ПРИНИМАЕТ ТОТ, КТО ЕЁ ПИШЕТ (ревью швов, S-m2). `fit` — факт стиля, его единственный
     писатель — UpdateStyle, то есть `products:write`; CARD DETAILS запирает на этом праве ячейку и
     её пилюлю. Здесь пилюля запиралась по `tech_cards:write`, и один и тот же аккаунт видел её живой
     в одном блоке и глухой в другом. Предикат — ровно тот, что у CARD DETAILS. */
  const { canWrite } = usePermissions();
  const fitLocked = frozen || !canWrite(SECTION.products);
  const fit = ((useWatch({ control, name: 'fit' }) as string | null | undefined) ?? '').trim();
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  // Посадки семейства, или null — у вещи посадки нет: ТОТ ЖЕ ответ, что читает CARD DETAILS
  // (`fitChoicesFor`). На aux-карте эта строка не рисуется, поэтому `isAux` здесь ложь.
  const categories = dictionary?.categories;
  const fitChoices = useMemo(
    () => fitChoicesFor(categories, categoryId, false),
    [categories, categoryId],
  );
  const fitShown = fitChoices !== null;
  const draftedApi = useDrafted();
  const fitDrafted = draftedApi.isLive(draftedKey.fit, fit);

  const canEdit = !readOnly;
  const [editing, setEditing] = useState(false);
  // Карточка, утверждённая или потерявшая писателя, пока ячейки открыты, и другая карточка под той
  // же смонтированной студией — обратно к печати.
  useEffect(() => {
    setEditing(false);
  }, [canEdit, techCardId]);
  const open = editing && canEdit;
  const row = useRef<HTMLDivElement>(null);
  const focusIn = (selector: string) =>
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>(selector)?.focus());
  const editLabel = fitShown ? 'edit fit and category' : 'edit category';

  return (
    <div
      ref={row}
      /* Печать равняет строку по низу (значения — текст); ячейки — по верху, как грид CARD DETAILS:
         подписи в одну линию (`[&_label]:min-h-[19px]`), контролы в одну, слова замка под селектом. */
      className={cn(
        'flex min-w-0 flex-wrap gap-x-8 gap-y-3 sm:col-span-2',
        open ? 'items-start' : 'items-end',
      )}
      data-c19-facts={open ? 'edit' : 'read'}
      // Принятие пилюли с клавиатуры ведёт фокус к первому полю строки, а без поля — к `✎`.
      data-drafted-scope=''
      onKeyDown={(e) => {
        // Escape, уже потраченный слоем Radix (список, поповер, подтверждение), сюда не доходит
        // «живым»: слой гасит его `preventDefault`, и ячейки остаются на месте.
        if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        setEditing(false);
        focusIn('[data-c19-facts-edit]');
      }}
    >
      {open ? (
        <>
          {fitChoices && (
            <div className={CELL} data-c19-field='fit'>
              <FitCell choices={fitChoices} creating={techCardId === 0} locked={fitLocked} />
            </div>
          )}
          <div className={CELL} data-c19-field='meta'>
            <CategoryBrowser />
          </div>
        </>
      ) : (
        <>
          {fitShown && (
            <div className='min-w-0 space-y-1.5' data-c19-field='fit'>
              <FieldLabel>fit</FieldLabel>
              <div className='flex items-center gap-2'>
                <DraftedField live={fitDrafted} pill={false} className={cn(fitDrafted && 'px-1.5')}>
                  <Text
                    component='span'
                    className={cn('block', fitDrafted && 'text-warning')}
                    data-c19-fact='fit'
                  >
                    {fit ? fitLabel(fit) : '—'}
                  </Text>
                </DraftedField>
                <DraftedPill
                  live={fitDrafted}
                  disabled={fitLocked}
                  onAccept={() => draftedApi.acceptKey(draftedKey.fit)}
                  data-c19-drafted='fit'
                />
              </div>
            </div>
          )}
          <div className='min-w-0 space-y-1.5' data-c19-field='meta'>
            <FieldLabel>category</FieldLabel>
            <Text component='span' className='block break-words' data-c19-fact='category'>
              {categoryPath || '—'}
            </Text>
          </div>
        </>
      )}
      {canEdit && (
        /* ОДНА кнопка на оба режима — тот же узел DOM, поэтому щелчок по ней не роняет фокус. При
           открытых ячейках она стоит на линии контролов: строка подписи 19px + шов 1px. */
        <div className={cn('ml-auto', open && 'mt-[20px]')}>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            aria-label={open ? 'done editing' : editLabel}
            title={open ? 'done — saved as you go' : editLabel}
            data-c19-facts-edit={open ? 'done' : 'edit'}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              const next = !open;
              setEditing(next);
              // Enter/Space — щелчок без указателя (`detail === 0`): фокус идёт в первую ячейку.
              if (next && e.detail === 0) {
                focusIn(
                  '[data-c19-field] [role="combobox"], [data-c19-field] button:not([data-drafted-pill])',
                );
              }
            }}
          >
            {open ? '✓' : '✎'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Ячейка открытого режима: делит строку поровну с соседкой, на узком экране переносится. */
const CELL = 'min-w-[200px] flex-1 [&_label]:flex [&_label]:min-h-[19px] [&_label]:items-center';

// One construction aspect as a plain text field. Writes the SAME `details[]` row the aspects editor
// on STUDIO writes, with the same rule: a row with neither text nor images is dropped, not kept
// empty (the mapper would drop it on save anyway; dropping it here keeps the two surfaces agreeing
// about which aspects exist). Images on the row are untouched — this field owns the text only.
//
// A textarea, not an input, even though the answer is often one line: an <input> silently strips
// line breaks from a value it is handed, and a silhouette note typed across two lines on STUDIO
// would lose its break the moment this field rendered it. Three rows, as the mock draws them.
//
// WAVE 25.09: the field sits in `DraftedField` (blue frame while the draft's words stand unreviewed;
// its own edge is dropped then, so the text never moves by a pixel when the frame goes) and carries
// `ai ✦` in its bottom-right corner — the textarea keeps `pb-7` so the last line never runs under it.
// The pill `drafted` sits ON the frame's top edge, like a legend: in the label row it would put the
// word back next to the label, which the owner removed as crooked (r2 p.4).
function DetailTextField({
  detailKey,
  label,
  placeholder,
  readOnly,
  context,
  techCardId,
}: {
  detailKey: Extract<EnhanceField, 'silhouette' | 'fabric'>;
  label: string;
  placeholder: string;
  readOnly: boolean;
  /** Факты карточки для `ai ✦` (`cardFactsContext`). */
  context: string;
  /** Чья карточка на экране — ответ `ai ✦` пишется только в неё (фиксап M5). */
  techCardId: number;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as Array<{
    key?: string;
    text?: string;
    mediaIds?: number[];
  }>;
  const value = details.find((d) => d.key === detailKey)?.text ?? '';
  const id = useId();
  const key = draftedKey.detail(detailKey);
  const draftedApi = useDrafted();
  const drafted = draftedApi.isLive(key, value);
  const settle = useAcceptOnEdit(key, value);
  // ОТВЕТ `ai ✦` — ТОЛЬКО В ТУ КАРТОЧКУ, КОТОРАЯ ЕГО ПРОСИЛА (фиксап M5). Студия не размонтируется
  // на переходе A → B, а запрос живёт секунды: без сверки текст A лёг бы в поле B. Кнопка к тому же
  // пересоздаётся на смене карточки (`key`) — её запрос обрывается вместе с ней.
  const shownCard = useRef(techCardId);
  shownCard.current = techCardId;

  // ПИСАТЕЛЬ ОДИН НА ТРИ ПОВЕРХНОСТИ — `form-writers.ts`. Здесь стояла его первая копия (вторая
  // жила в `details-editor.tsx`, третья родилась бы в черновике construction); правило строки
  // («ни текста, ни картинок ⇒ строку снять») уехало туда дословно, вместе с чтением через
  // `getValues`, а не через снимок рендера.
  const write = (text: string) => upsertDetailText(getValues, setValue, detailKey, text);

  return (
    <div className='space-y-1' data-c19-field={detailKey}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <DraftedField live={drafted} pill={false} className='focus-within:border-textColor'>
        <Textarea
          id={id}
          name={`construction-${detailKey}`}
          value={value}
          rows={3}
          autoGrow={false}
          maxLength={2000}
          placeholder={placeholder}
          // Без права записи поле читается, но не правится (внешний fieldset гасит только релиз).
          readOnly={readOnly}
          data-c19-detail={detailKey}
          className={cn('pb-7', drafted && 'border-0 bg-transparent')}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => write(e.target.value)}
          onFocus={settle.onFocus}
          onBlur={settle.onBlur}
        />
        {/* Легенда рамки — и есть «принять» этого поля (фиксап M3). */}
        <DraftedPill
          live={drafted}
          disabled={readOnly}
          onAccept={() => draftedApi.acceptKey(key)}
          data-c19-drafted={detailKey}
          className='absolute -top-2 right-2 bg-bgColor'
        />
        <AiEnhance
          key={techCardId}
          field={detailKey}
          value={value}
          onApply={(text) => {
            if (shownCard.current !== techCardId) return;
            write(text);
          }}
          context={context}
          maxRunes={2000}
          disabled={readOnly}
        />
      </DraftedField>
    </div>
  );
}
