import { cn } from 'lib/utility';
import { useId, type JSX, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { AiEnhance, type EnhanceField } from 'ui/components/ai-enhance';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { GROUP_SEAM } from './design/core';
import { cardFactsContext } from './design/core/card-facts';
import { openStepOf } from './design/core/chain';
import { DraftedField } from './design/core/drafted-field';
import { draftedKey, useDrafted } from './design/drafted-contract';
import { fitLabel } from './design/fit-vocabulary';
import { useCardFacts, useFitKeys } from './design/head/card-facts-form';
import { useAcceptOnEdit } from './design/head/drafted-provider';
import { BoardMovedPill, DraftedPill, GoTo } from './design/head/mood-organs';
import { isBoardRow } from './design/mood-board';
import { upsertDetailText } from './form-writers';
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
// категория путём по словарю («bottoms › pants › cargo») — с ОДНОЙ дверью `edit in card details ›`.
// Дверь не пишет адрес сама: она просит композитора показать шаг, где поле нарисовано
// (`openStepOf`, тот же шов, что у `revealField`), — `?step=` по-прежнему пишет один `goStep`.
//
// SILHOUETTE и FABRIC остаются полями и получают две вещи волны: синюю рамку `drafted`, пока в поле
// стоит текст черновика и его не приняли (`drafted-contract.ts`), и кнопку `ai ✦` в правом нижнем
// углу (`AiEnhance`, контекст — факты карточки одним композитором `cardFactsContext`).
//
// NOTHING HERE IS A SECOND PLACE FOR A FACT THAT ALREADY HAS ONE — that is the whole discipline of
// this file, aspect by aspect:
//   · fit / category — printed from THE SAME FORM FIELDS (`fit`, `categoryId`); edited in CARD
//     DETAILS only (see above).
//   · silhouette — the `details[]` aspect that ALREADY exists under key `silhouette`. The same
//     row, edited from a second surface.
//   · fabric — a `details[]` row under key `fabric`. Free text; `details` takes custom keys, so it
//     needs no contract change and prints with the other aspects on the description sheet. Ключ
//     ИМЕНОВАННЫЙ (`detailAspects` в tech-card-options.ts).
export function ConstructionGeneralInfo({
  isAux,
  readOnly,
}: {
  isAux: boolean;
  /** No write permission, or a released card — the Radix select ignores the outer fieldset. */
  readOnly: boolean;
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
        {!isAux && <StyleFacts categoryPath={facts.categoryPath ?? ''} />}
        <div className='min-w-0' data-c19-field-cell='silhouette'>
          <DetailTextField
            detailKey='silhouette'
            label='silhouette'
            placeholder='what this garment is, before how it is made'
            readOnly={readOnly}
            context={context}
          />
        </div>
        <div className='min-w-0' data-c19-field-cell='fabric'>
          <DetailTextField
            detailKey='fabric'
            label='fabric'
            placeholder='the cloth this style is cut from'
            readOnly={readOnly}
            context={context}
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
 * ═══ ФАКТЫ СТИЛЯ — ЗНАЧЕНИЯ И ОДНА ДВЕРЬ (T05) ══════════════════════════════════════════════
 *
 * Строка во всю ширину грида: FIT · CATEGORY, справа — `edit in card details ›`. Пустой факт — `—`
 * (DESIGN.md: пустота не рисуется нулём и не прячется). Посадка печатается словом словаря
 * (`fitLabel`: `wide_leg` → «wide leg», `a_line` → «a-line»), тем же, каким её печатает CARD DETAILS.
 * Посадка, записанная черновиком и ещё не просмотренная, стоит в синей рамке с пилюлей `drafted` —
 * тем же органом, что поля ниже; снимает её `accept all` в блоке черновика или правка fit в CARD
 * DETAILS.
 *
 * FIT НЕТ У ВЕЩИ, КОТОРАЯ ПОСАДКИ НЕ НЕСЁТ (accessories · shoes · bags · objects) — ровно как в CARD
 * DETAILS (`useFitKeys`): печатать здесь факт, поля которого за дверью нет, значило бы звать
 * человека править то, чего там не найти. Хранимое значение не трогается.
 *
 * Дверь просит шаг ПОЛЯ, а не шаг по имени: `categoryId`, пока категории нет (это главный недостающий
 * факт, и именно его ждёт минимум мудборда) или пока посадки у вещи нет, иначе `fit`. Где нарисовано
 * поле — знает карта шагов.
 */
function StyleFacts({ categoryPath }: { categoryPath: string }): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const fit = ((useWatch({ control, name: 'fit' }) as string | null | undefined) ?? '').trim();
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const fitShown = useFitKeys() !== null;
  const fitDrafted = useDrafted().isLive(draftedKey.fit, fit);

  return (
    <div
      className='flex min-w-0 flex-wrap items-end gap-x-8 gap-y-3 sm:col-span-2'
      data-c19-facts=''
    >
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
            <DraftedPill live={fitDrafted} data-c19-drafted='fit' />
          </div>
        </div>
      )}
      <div className='min-w-0 space-y-1.5' data-c19-field='meta'>
        <FieldLabel>category</FieldLabel>
        <Text component='span' className='block break-words' data-c19-fact='category'>
          {categoryPath || '—'}
        </Text>
      </div>
      <div className='ml-auto'>
        <GoTo
          onClick={() =>
            openStepOf(categoryId > 0 && fitShown ? 'fit' : 'categoryId', '#card-details')
          }
          data-c19-edit-in-card=''
          title={
            fitShown
              ? 'fit and category are style facts — they are edited in card details'
              : 'the category is a style fact — it is edited in card details'
          }
        >
          edit in card details
        </GoTo>
      </div>
    </div>
  );
}

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
}: {
  detailKey: Extract<EnhanceField, 'silhouette' | 'fabric'>;
  label: string;
  placeholder: string;
  readOnly: boolean;
  /** Факты карточки для `ai ✦` (`cardFactsContext`). */
  context: string;
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
  const drafted = useDrafted().isLive(key, value);
  const settle = useAcceptOnEdit(key, value);

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
        <DraftedPill
          live={drafted}
          data-c19-drafted={detailKey}
          className='pointer-events-none absolute -top-2 right-2 bg-bgColor'
        />
        <AiEnhance
          field={detailKey}
          value={value}
          onApply={write}
          context={context}
          maxRunes={2000}
          disabled={readOnly}
        />
      </DraftedField>
    </div>
  );
}
