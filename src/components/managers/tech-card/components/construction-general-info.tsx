import { useId, type JSX, type ReactNode } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Counter } from './design/core';
import {
  BoardMovedPill,
  FromMoodboardPill,
  ProvenancePill,
  useProvenance,
  type Provenance,
} from './design/head/mood-organs';
import { FIT_OPTIONS } from './design/render/model';
import { upsertDetailText } from './form-writers';
import { CategoryBrowser } from './header-meta-fields';
import { TechCardFormData } from './schema';

// C-5 · GENERAL INFORMATION — the block the owner asked for in CONSTRUCTION.
//
// ГДЕ ОН СТОИТ: шаг MOODBOARD вкладки STUDIO, четвёртым блоком сверху — под доской, описанием и
// черновиком, над CONSTRUCTION и MATERIAL SLOTS (макет `_step-mood.js`, `zGeneralBlock`). Монтаж
// один, довод — там же, в `design/studio-tab.tsx`.
//
// ═══ РАСКЛАДКА МАКЕТА: ГРИД 2×2, ПИЛЮЛЯ ПРОИСХОЖДЕНИЯ В СТРОКЕ ПОДПИСИ ═══════════════════════
//
// Владелец, увидев бету: «не как в референсе». Макет держит четыре поля гридом два на два,
// подпись поля — nano капслоком, и В ТОЙ ЖЕ СТРОКЕ подписи стоит пилюля происхождения:
// `FIT [DRAFTED]`, `FABRIC [DRAFTED, EDITED]`. Пилюля только у заполненного поля, и только когда
// происхождение ИЗВЕСТНО — читается из журнала заполнений черновика (`head/mood-organs.tsx`,
// `useProvenance`); поле без записи в журнале пилюли не носит вовсе (не `by hand`: журнал
// сессионный, и после перезагрузки надиктованное неотличимо от набранного).
//
// ⚠ ШАПКА БЛОКА — У КОМПОЗИТОРА (`design/studio-tab.tsx`, заморожен), и слота `action` она этому
// блоку не отдаёт. Макет ставит в правый угол шапки `FROM THE MOODBOARD · N OF 4 DRAFTED FIELDS ·
// MOODBOARD MOVED ON`; здесь они стоят ПЕРВЫМ РЯДОМ блока, прижатые вправо, — тот же состав, на
// одну строку ниже. Как только композитор отдаст `action`, ряд переезжает туда без правки органов:
// `GeneralInformationAction` ниже экспортирован ровно для этого.
//
// ═══ ЧЕМ ПРОДУКТ ОТЛИЧАЕТСЯ ОТ МАКЕТА, И ПОЧЕМУ ЭТО НЕ РАСХОЖДЕНИЕ ═══════════════════════════
//
// Макет держит четыре поля: FIT · CONCEPT · SILHOUETTE · FABRIC. У продукта CONCEPT — это ОДНО
// поле с описанием доски (V-16, владелец: «CONCEPT & CONSTRUCTION DESCRIPTION это и есть SHARED
// NOTE»), и оно стоит блоком DESCRIPTION выше; второго редактора того же поля здесь не заводится.
// Его место в гриде занимает CATEGORY — поле карточки, которого в макете нет, но которое обязано
// где-то стоять (aux-карта его прячет, см. ниже). Считаются черновичными поэтому ТРИ поля: fit,
// silhouette, fabric — `N of 3 drafted fields`; счётчик обещает ровно то, что черновик умеет.
//
// ═══ КРУГ 20 — ЧТО ВЛАДЕЛЕЦ ОТСЮДА ЗАБРАЛ, И ЧЕМ ЭТО ОПЛАЧЕНО ════════════════════════════════
//
// B-4: SIZE RANGE СНЯТ ЦЕЛИКОМ — ряд размеров живёт на PATTERNS и правится только там; здесь он
// и был read-only проекцией. B-27: BASE MODEL и BASE SAMPLE SIZE уехали в шапку карточки
// (`components/index.tsx`, блок «base»); категория осталась здесь и зовётся по имени —
// `CategoryBrowser`.
//
// NOTHING HERE IS A SECOND PLACE FOR A FACT THAT ALREADY HAS ONE — that is the whole discipline of
// this file, aspect by aspect:
//   · fit / category — THE SAME FORM FIELDS the CLASSIFICATION block used to render (`fit`,
//     `categoryId`), moved, not copied; `fit` is still carried to the server by the staged
//     `UpdateStyle` in the hidden `StyleFactsField` — this select writes the form field only.
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
  const prov = useProvenance(techCardId);
  const provFit = prov({ kind: 'fit' });
  const provSilhouette = prov({ kind: 'detail', key: 'silhouette' });
  const provFabric = prov({ kind: 'detail', key: 'fabric' });
  const draftable = [...(isAux ? [] : [provFit]), provSilhouette, provFabric];
  const drafted = draftable.filter((p) => p === 'drafted').length;

  return (
    <div className='space-y-2.5' data-c19-general=''>
      <GeneralInformationAction
        techCardId={techCardId}
        drafted={drafted}
        total={draftable.length}
      />
      {/* Грид два на два: подписи одного ряда всегда на одной линии, колонки равной ширины, которые
          содержимое растянуть не может (`minmax(0,1fr)`), перенос в один столбец на узком экране.
          16px между КОЛОНКАМИ, 10px между РЯДАМИ — тот же ритм, каким `Section` кладёт детей. */}
      <div className='grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2' data-c19-general-grid=''>
        {/* Auxiliary cards carry no fit and no category — the same gate the CLASSIFICATION block
            applied. У aux-карты классификацию задаёт AUXILIARY TYPE в шапке; скрывается ТОЛЬКО
            орган, значение `categoryId` остаётся в форме и раунд-трипится. */}
        {!isAux && <FitField readOnly={readOnly} prov={provFit} />}
        {!isAux && (
          <div className='min-w-0' data-c19-field='meta'>
            <CategoryBrowser />
          </div>
        )}
        <div className='min-w-0' data-c19-field-cell='silhouette'>
          <DetailTextField
            detailKey='silhouette'
            label='silhouette'
            prov={provSilhouette}
            placeholder='what this garment is, before how it is made'
          />
        </div>
        <div className='min-w-0' data-c19-field-cell='fabric'>
          <DetailTextField
            detailKey='fabric'
            label='fabric'
            prov={provFabric}
            placeholder='the cloth this style is cut from'
          />
        </div>
      </div>
    </div>
  );
}

/**
 * ПРАВЫЙ УГОЛ ШАПКИ БЛОКА (макет: `zFromBoard() + counter(written, 'drafted field', 4) +
 * zMoved()`). Экспортирован, чтобы композитор мог поставить его в `action` своей `Section`;
 * пока композитор заморожен — стоит первым рядом блока (см. шапку файла).
 */
export function GeneralInformationAction({
  techCardId,
  drafted,
  total,
}: {
  techCardId: number;
  drafted: number;
  total: number;
}): JSX.Element {
  return (
    <div className='flex flex-wrap items-center justify-end gap-1.5' data-c19-general-action=''>
      <FromMoodboardPill />
      {/* `Counter` не проносит `data-*`; якорь пробы — на обёртке. */}
      <span className='contents' data-c19-general-drafted=''>
        <Counter n={drafted} noun='drafted field' total={total} />
      </span>
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
 * Подпись поля с пилюлей происхождения В ТОЙ ЖЕ СТРОКЕ. Метрика подписи поля (`FormLabel`: 10px,
 * капслок, серый), а не линейка группы: линейка делила бы одно поле с пустотой.
 */
function FieldLabel({
  htmlFor,
  pill,
  children,
}: {
  htmlFor?: string;
  pill?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className='flex items-center gap-1.5'>
      <Text
        size='micro'
        variant='label'
        tracking='label'
        component={htmlFor ? 'label' : 'span'}
        htmlFor={htmlFor}
        className='leading-none uppercase'
      >
        {children}
      </Text>
      {pill}
    </div>
  );
}

// U-2: the fit dictionary is the exported copy in `design/render/model.ts` — the same one the
// CLASSIFICATION select imported. Not a third copy.
const fitFormOptions = FIT_OPTIONS.map((f) => ({ label: f, value: f }));

/**
 * FIT — тот же примитив `Select`, что стоит под `SelectField`, но с подписью, которая умеет нести
 * пилюлю: `SelectField` рисует свою `FormLabel` и второго органа в её строку не пускает. Писатель
 * тот же — поле формы `fit` через `useController`; `data-field` — якорь `revealField`, который у
 * `FormItem` ставится сам, а здесь — рукой.
 */
function FitField({ readOnly, prov }: { readOnly: boolean; prov: Provenance }): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: 'fit' });
  const id = useId();
  return (
    <div className='min-w-0 space-y-px' data-field='fit' data-c19-field='fit'>
      <FieldLabel htmlFor={id} pill={<ProvenancePill state={prov} data-c19-prov='fit' />}>
        fit
      </FieldLabel>
      <Select
        id={id}
        name='fit'
        aria-label='fit'
        items={fitFormOptions}
        value={(field.value as string | undefined) ?? ''}
        onValueChange={(v: string) => field.onChange(v)}
        onBlur={field.onBlur}
        readOnly={readOnly}
      />
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
function DetailTextField({
  detailKey,
  label,
  prov,
  placeholder,
}: {
  detailKey: string;
  label: string;
  prov: Provenance;
  placeholder: string;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as Array<{
    key?: string;
    text?: string;
    mediaIds?: number[];
  }>;
  const value = details.find((d) => d.key === detailKey)?.text ?? '';
  const id = useId();

  // ПИСАТЕЛЬ ОДИН НА ТРИ ПОВЕРХНОСТИ — `form-writers.ts`. Здесь стояла его первая копия (вторая
  // жила в `details-editor.tsx`, третья родилась бы в черновике construction); правило строки
  // («ни текста, ни картинок ⇒ строку снять») уехало туда дословно, вместе с чтением через
  // `getValues`, а не через снимок рендера.
  const write = (text: string) => upsertDetailText(getValues, setValue, detailKey, text);

  return (
    <div className='space-y-px' data-c19-field={detailKey}>
      <FieldLabel htmlFor={id} pill={<ProvenancePill state={prov} data-c19-prov={detailKey} />}>
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        name={`construction-${detailKey}`}
        value={value}
        rows={3}
        autoGrow={false}
        maxLength={2000}
        placeholder={placeholder}
        data-c19-detail={detailKey}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => write(e.target.value)}
      />
    </div>
  );
}
