import { useFormContext, useWatch } from 'react-hook-form';
import Textarea from 'ui/components/text-area';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { FIT_OPTIONS } from './design/render/model';
import { upsertDetailText } from './form-writers';
import { CategoryBrowser } from './header-meta-fields';
import { TechCardFormData } from './schema';

// C-5 · GENERAL INFORMATION — the block the owner asked for in CONSTRUCTION.
//
// ГДЕ ОН СТОИТ: в секции CONSTRUCTION вкладки STUDIO, первым из двух блоков («общие сведения →
// аспекты»), а не на одноимённой вкладке — владелец назвал место цитатой подзаголовка «described
// aspect by aspect; prints after the concept». Монтаж один, довод — там же, в `design/studio-tab.tsx`.
//
// ═══ КРУГ 20 — ЧТО ВЛАДЕЛЕЦ ОТСЮДА ЗАБРАЛ, И ЧЕМ ЭТО ОПЛАЧЕНО ════════════════════════════════
//
// B-4, дословно: «в GENERAL INFORMATION давай уберем SIZE RANGE и скомпонуем более удачно
// импакблом что бы оно все было не криво как сейчас».
//   · SIZE RANGE СНЯТ ЦЕЛИКОМ — вместе с плашками, счётчиком «N sizes» и дверью «edit the run on
//     PATTERNS». Способность не потеряна ни на грамм: ряд размеров ЖИВЁТ на PATTERNS и правится
//     только там, а здесь он и был read-only проекцией `sizeIds`. Ушёл ЧИТАТЕЛЬ, писателя тут
//     никогда не было — поэтому и `onGoTab` у блока больше нет: последняя дверь была его.
//
// B-27, дословно: «BASE MODEL и BASE SAMPLE SIZE выдели в отдельный блок на который занимает две
// колонки и находится под IDENTIFICATION и CLASSIFICATION».
//   · Оба селекта УЕХАЛИ В ШАПКУ карточки (`components/index.tsx`, блок «base»); их содержимое —
//     `BaseModelFields` в `header-meta-fields.tsx`. Это переезд одного экземпляра, а не второй:
//     поля формы те же, писатель тот же, второго монтажа не заведено.
//   · КАТЕГОРИЯ ОСТАЛАСЬ ЗДЕСЬ и зовётся теперь по имени — `CategoryBrowser`. Обёртки
//     `HeaderMetaFields`, которая держала её вместе с двумя уехавшими полями, больше нет: она
//     была «одним неделимым компонентом» ровно до тех пор, пока эти трое стояли рядом.
//
// ═══ ПОЧЕМУ ГРИД ИМЕННО ТАКОЙ (B-4, «не криво») ══════════════════════════════════════════════
//
// «Криво» было не оформлением, а МЕХАНИКОЙ. Стояло три колонки по `space-y`, и в каждой лежало
// разное число органов разного роста: слева селект + семь плашек размерного ряда, посередине
// браузер категорий с подсказкой и два селекта, справа две текстареи. Три вертикальных списка
// разной длины дают рваный низ при ЛЮБОМ наполнении, а подписи полей в соседних колонках не
// стоят на одной линии ни в одном ряду — глазу не за что зацепиться.
//
// Теперь полей четыре, и они делятся ПО ПРИРОДЕ ОТВЕТА, а не по остатку места:
//   ряд 1 — FIT и CATEGORY: закрытые словари, отвечает выбор;
//   ряд 2 — SILHOUETTE и FABRIC: свободный текст, отвечают слова.
// Грид (а не два флекс-ряда) даёт то, чего `space-y` дать не может: подписи одного ряда всегда на
// одной линии, колонки равной ширины, которые содержимое растянуть не может (`minmax(0,1fr)`), и
// перенос в один столбец на узком экране без единого брейкпоинта в разметке.
//
// Зазоры — два разных токена, и это ритм, а не разнобой: 16px между КОЛОНКАМИ (`spacing.block`)
// отделяют соседей сильнее, чем 10px между РЯДАМИ (`spacing.stack`, тот же шаг, каким `Section`
// раскладывает своих детей). Разделительных линий внутри блока нет и быть не может: блок один,
// и рисовать в нём вторую рамку — коробка в коробке (DESIGN.md, §5).
//
// NOTHING HERE IS A SECOND PLACE FOR A FACT THAT ALREADY HAS ONE — that is the whole discipline of
// this file, aspect by aspect:
//   · fit / category — THE SAME FORM FIELDS the CLASSIFICATION block used to render (`fit`,
//     `categoryId`), moved, not copied; `fit` is still carried to the server by the staged
//     `UpdateStyle` in the hidden `StyleFactsField` — this select writes the form field only.
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
}: {
  isAux: boolean;
  /** No write permission, or a released card — the Radix select ignores the outer fieldset. */
  readOnly: boolean;
}) {
  return (
    <div className='grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2' data-c19-general=''>
      {/* Auxiliary cards carry no fit and no category — the same gate the CLASSIFICATION block
          applied, and the same one `hideCategory` used to carry. У aux-карты классификацию задаёт
          AUXILIARY TYPE в шапке; скрывается ТОЛЬКО орган, значение `categoryId` остаётся в форме и
          раунд-трипится. Когда прячутся оба, ряд «слова» просто становится первым — авторазмещение
          грида не оставляет дыр там, где поля нет. */}
      {!isAux && (
        <div className='min-w-0' data-c19-field='fit'>
          <SelectField name='fit' label='fit' items={fitFormOptions} readOnly={readOnly} />
        </div>
      )}
      {!isAux && (
        <div className='min-w-0' data-c19-field='meta'>
          <CategoryBrowser />
        </div>
      )}
      <div className='min-w-0' data-c19-field-cell='silhouette'>
        <DetailTextField
          detailKey='silhouette'
          label='silhouette'
          placeholder='e.g. sleeveless V-neck tank top'
        />
      </div>
      <div className='min-w-0' data-c19-field-cell='fabric'>
        <DetailTextField detailKey='fabric' label='fabric' placeholder='e.g. stretch knit jersey' />
      </div>
    </div>
  );
}

// U-2: the fit dictionary is the exported copy in `design/render/model.ts` — the same one the
// CLASSIFICATION select imported. Not a third copy.
const fitFormOptions = FIT_OPTIONS.map((f) => ({ label: f, value: f }));

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
