import { formatSizeName } from 'components/managers/product/utility/sizes';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useFormContext, useWatch } from 'react-hook-form';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { FIT_OPTIONS } from './design/render/model';
import { upsertDetailText } from './form-writers';
import { HeaderMetaFields } from './header-meta-fields';
import { TechCardFormData } from './schema';

// C-5 · GENERAL INFORMATION — the block the owner asked for in CONSTRUCTION: «FIT, CATEGORY, BASE
// MODEL, BASE SIZE (moved from CLASSIFICATION) + SIZE RANGE + SILHOUETTE + FABRIC».
//
// ГДЕ ОН СТОИТ: в секции CONSTRUCTION вкладки STUDIO, первым из четырёх блоков («общие сведения →
// аспекты → указания → спецификация»), а не на одноимённой вкладке — владелец назвал место цитатой
// подзаголовка «described aspect by aspect; prints after the concept». Монтаж один, довод — там же,
// в `design/studio-tab.tsx`.
//
// NOTHING HERE IS A SECOND PLACE FOR A FACT THAT ALREADY HAS ONE — that is the whole discipline of
// this file, aspect by aspect:
//   · fit / category / base model / base sample size — THE SAME FORM FIELDS the CLASSIFICATION block
//     used to render (`fit`, `categoryId`, `baseModelId`, `baseSampleSizeId`), moved, not copied;
//     `HeaderMetaFields` is the same component, and `fit` is still carried to the server by the
//     staged `UpdateStyle` in the hidden `StyleFactsField` — this select writes the form field only.
//   · size range — DERIVED from `sizeIds`, which is edited on PATTERNS and nowhere else. Read-only
//     here on purpose: a second editor over the run would need the removal confirmations the
//     PATTERNS one carries (graded norms, markers, DXF per size).
//   · silhouette — the `details[]` aspect that ALREADY exists under key `silhouette` («silhouette /
//     fit» in the construction aspects). The same row, edited from a second surface.
//   · fabric — a `details[]` row under key `fabric`. Free text, as the owner asked («Stretch knit
//     jersey»); `details` takes custom keys, so it needs no contract change and prints with the
//     other aspects on the description sheet. The actual articles stay in the BOM. Ключ теперь
//     ИМЕНОВАННЫЙ (`detailAspects` в tech-card-options.ts) — до круга 20 он был самодельным, и
//     редактор аспектов показывал сырое «fabric» без подписи, то есть одно поле выглядело как два.
export function ConstructionGeneralInfo({
  isAux,
  readOnly,
  onGoTab,
}: {
  isAux: boolean;
  /** No write permission, or a released card — the Radix select ignores the outer fieldset. */
  readOnly: boolean;
  onGoTab?: (tab: string) => void;
}) {
  return (
    <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3' data-c19-general=''>
      <div className='space-y-2.5'>
        {/* Auxiliary cards carry no fit — the same gate the CLASSIFICATION block applied. */}
        {!isAux && (
          <div data-c19-field='fit'>
            <SelectField name='fit' label='fit' items={fitFormOptions} readOnly={readOnly} />
          </div>
        )}
        <SizeRangeReadout onGoTab={onGoTab} />
      </div>
      {/* Category browser + base model + base sample size — one indivisible component, so it takes
          a column of its own rather than being split across the grid. */}
      <div data-c19-field='meta'>
        <HeaderMetaFields hideCategory={isAux} />
      </div>
      <div className='space-y-2.5'>
        <DetailTextField
          detailKey='silhouette'
          label='silhouette'
          placeholder='e.g. sleeveless V-neck tank top'
        />
        <DetailTextField detailKey='fabric' label='fabric' placeholder='e.g. stretch knit jersey' />
      </div>
    </div>
  );
}

// U-2: the fit dictionary is the exported copy in `design/render/model.ts` — the same one the
// CLASSIFICATION select imported. Not a third copy.
const fitFormOptions = FIT_OPTIONS.map((f) => ({ label: f, value: f }));

// The size run as PATTERNS holds it, with the base sample size marked in ink: the base size select
// next door lists the same ids, and seeing the chosen one inside the run is what makes «base» mean
// something. Ordered by the dictionary's sku order, not by insertion.
//
// МЕТРИКА ПЛАШЕК СВЕРЕНА (круг 20, остаток пункта 5) и осталась без правок: это домашний `Pill`
// БЕЗ единого класса поверх — то есть ровно тот же 10px/`tracking-pill`/`px-[7px]`, каким плашки
// нарисованы у соседей (спецификация, разбор сборки, применение раскладки). Свой размер здесь
// когда-нибудь захочется задать классом — этого делать нельзя: у примитива один рост, и второй
// завёлся бы молча, как уже заводился у секций до появления `Section`.
function SizeRangeReadout({ onGoTab }: { onGoTab?: (tab: string) => void }) {
  const { control } = useFormContext<TechCardFormData>();
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const baseSizeId = (useWatch({ control, name: 'baseSampleSizeId' }) as number | undefined) ?? 0;
  const names = useSizeNames();
  const order = useSizeOrdering();
  const ordered = order(sizeIds);

  return (
    <div className='space-y-1' data-c19-field='size-range'>
      <FormLabel>size range</FormLabel>
      {ordered.length === 0 ? (
        <Text size='micro' variant='label' data-c19-size-empty=''>
          no sizes yet
        </Text>
      ) : (
        <div className='flex flex-wrap gap-1'>
          {ordered.map((id) => {
            const base = id === baseSizeId;
            return (
              <Pill
                key={id}
                tone={base ? 'ink' : 'mut'}
                data-c19-size={id}
                data-base={base ? '1' : undefined}
                title={base ? 'base sample size' : undefined}
              >
                {formatSizeName(names.get(id) ?? `#${id}`)}
              </Pill>
            );
          })}
        </div>
      )}
      <Text size='micro' variant='label'>
        {ordered.length > 0 ? `${ordered.length} sizes · ` : ''}
        {onGoTab ? (
          <button
            type='button'
            className='underline hover:text-textColor'
            data-c19-go-patterns=''
            onClick={() => onGoTab('patterns')}
          >
            edit the run on PATTERNS
          </button>
        ) : (
          'edited on PATTERNS'
        )}
      </Text>
    </div>
  );
}

// One construction aspect as a plain text field. Writes the SAME `details[]` row the aspects editor
// on STUDIO writes, with the same rule: a row with neither text nor images is dropped, not kept
// empty (the mapper would drop it on save anyway; dropping it here keeps the two surfaces agreeing
// about which aspects exist). Images on the row are untouched — this field owns the text only.
//
// A textarea, not an input, even though the answer is one line: an <input> silently strips line
// breaks from a value it is handed, and a silhouette note typed across two lines on STUDIO would
// lose its break the moment this field rendered it.
function DetailTextField({
  detailKey,
  label,
  placeholder,
}: {
  detailKey: string;
  label: string;
  placeholder: string;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as Array<{
    key?: string;
    text?: string;
    mediaIds?: number[];
  }>;
  const value = details.find((d) => d.key === detailKey)?.text ?? '';

  // ПИСАТЕЛЬ ОДИН НА ТРИ ПОВЕРХНОСТИ — `form-writers.ts`. Здесь стояла его первая копия (вторая
  // жила в `details-editor.tsx`, третья родилась бы в черновике construction); правило строки
  // («ни текста, ни картинок ⇒ строку снять») уехало туда дословно, вместе с чтением через
  // `getValues`, а не через снимок рендера.
  const write = (text: string) => upsertDetailText(getValues, setValue, detailKey, text);

  return (
    <div className='space-y-1' data-c19-field={detailKey}>
      <FormLabel>{label}</FormLabel>
      <Textarea
        name={`construction-${detailKey}`}
        value={value}
        rows={2}
        autoGrow={false}
        maxLength={2000}
        placeholder={placeholder}
        data-c19-detail={detailKey}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => write(e.target.value)}
      />
    </div>
  );
}
