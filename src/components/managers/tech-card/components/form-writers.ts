import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { ulid } from 'utils/ulid';

import { UNSET_KIND } from './bom-kind';
import { UNSET_PURPOSE } from './bom-purpose-labels';
import { newClientRequestId } from './design/use-design-band';
import type { CalloutForm, TechCardFormData } from './schema';

/**
 * ТРИ ПИСАТЕЛЯ ФОРМЫ, КОТОРЫХ ТЕПЕРЬ РОВНО ПО ОДНОМУ.
 *
 * Здесь не заведено ни одного нового правила — сюда ПЕРЕЕХАЛИ три уже работавших: upsert строки
 * `details[]` по ключу (жил дважды: в `construction-general-info.tsx` и в `details-editor.tsx`),
 * рождение строки `callouts[]` (жило в `construction-callout-table.tsx:addRow`) и болванка строки
 * `bomItems[]` (жила в `bom-field.tsx` как `emptyBomItem` + `lineKey: ulid()` на месте вызова).
 *
 * ⚠ ПОВОД ПЕРЕЕЗДА — НЕ ОПРЯТНОСТЬ, А ЧЕРНОВИК CONSTRUCTION. Орган `head/construction-draft.tsx`
 * принимает предложения модели построчно, и КАЖДАЯ принятая строка обязана родиться ровно тем же
 * конструктором, каким рождается набранная руками. Копия конструктора в органе означала бы, что
 * поле, добавленное в схему завтра, появится у рукописной строки и не появится у принятой, — и
 * увидит это не человек, а полная перезапись на сохранении, молча.
 * Этот репозиторий уже записывал такую потерю дважды (`piece-fabric-lives-in-recipe-not-piece-material`,
 * пантон строки BOM), поэтому здесь ПЕРЕНОС, а не второй экземпляр: старые места теперь ЗОВУТ.
 *
 * ⚠ ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ — ЗАПИСИ ЦЕЛОГО ПОЛЯ-МАССИВА ИЗ ОБЪЕКТА МОДЕЛИ. Функции ниже
 * возвращают ОДНУ строку или патчат ОДНУ строку по ключу; ни одна из них не принимает массив и не
 * умеет заменить его целиком. Это и есть та половина защиты от `techcard-draft-restore-wipes-absent-fields`,
 * которая живёт в коде, а не в намерении: чтобы стереть карточку, вызывающему пришлось бы написать
 * `setValue` на корень массива своими руками — а здесь такой рукоятки просто нет.
 */

/** Строка `details[]`, как её знает форма. Ровно три ключа — их же перечисляет схема. */
export type FormDetail = { key?: string; text?: string; mediaIds?: number[] };

/**
 * UPSERT АСПЕКТА ПО КЛЮЧУ — единственный писатель `details[]` во всём дереве.
 *
 * ПРАВИЛО СТРОКИ, СОХРАНЁННОЕ ДОСЛОВНО ИЗ ОБОИХ ИСХОДНЫХ МЕСТ: строка без текста И без картинок
 * не хранится, а СНИМАЕТСЯ (маппер записи всё равно уронил бы её на сохранении; убирая её здесь,
 * мы держим обе поверхности согласными в том, какие аспекты у карточки есть). Всё, чего патч не
 * назвал, переживает запись — картинки строки в том числе: этот писатель владеет ТЕКСТОМ, а не
 * строкой целиком.
 *
 * ⚠ ЧИТАЕТСЯ `getValues`, А НЕ СНИМОК РЕНДЕРА. Два быстрых нажатия подряд (принял силуэт, принял
 * ткань) идут в одном тике, и второе, посчитанное от снимка, затёрло бы первое.
 */
export function upsertDetail(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
  patch: Partial<FormDetail>,
): void {
  const cur = (getValues('details') ?? []) as FormDetail[];
  const k = cur.findIndex((d) => d.key === key);
  const base = k >= 0 ? cur[k] : { key, text: '', mediaIds: [] };
  const merged: FormDetail = {
    key,
    text: base.text ?? '',
    mediaIds: base.mediaIds ?? [],
    ...patch,
  };
  const empty = !merged.text?.trim() && (merged.mediaIds?.length ?? 0) === 0;
  const next = empty
    ? cur.filter((d) => d.key !== key)
    : k >= 0
      ? [...cur.slice(0, k), merged, ...cur.slice(k + 1)]
      : [...cur, merged];
  setValue('details', next as never, { shouldDirty: true });
}

/** Тот же upsert, когда писать надо ровно текст: подпись, которую зовут поля общих сведений. */
export function upsertDetailText(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
  text: string,
): void {
  upsertDetail(getValues, setValue, key, { text });
}

/**
 * РОЖДЕНИЕ НЕПРИКОЛОТОГО УКАЗАНИЯ — «+ add callout row» и принятая строка черновика рождаются
 * ОДНИМ конструктором.
 *
 * `number: 0` + непустой `clientRef` — это гейт минта на сервере («сминти мне номер»); нулевой
 * номер БЕЗ ключа значит легаси-строку, которую трогать нельзя, поэтому ключ здесь обязателен и
 * минтится всегда.
 *
 * ⚠ `part` И `parts[0]` РОЖДАЮТСЯ В ПАРЕ. Связь «деталь кроя ↔ указание» стоит на ИМЕНИ, и
 * писатель таблицы держит эти две половины в шаге друг с другом на каждой правке. Строка,
 * рождённая с именем в `part` и пустым `parts`, была бы половиной связи — и то, какая половина
 * доедет до сервера, зависело бы от того, тронул ли человек поле после рождения.
 */
export function bornCallout(values?: {
  part?: string;
  description?: string;
  dimensions?: string;
}): CalloutForm {
  const part = (values?.part ?? '').trim();
  return {
    number: 0,
    part,
    parts: part ? [part] : [],
    description: values?.description ?? '',
    dimensions: values?.dimensions ?? '',
    mediaId: 0,
    posX: '',
    posY: '',
    kind: 'pin',
    points: [],
    color: '',
    dashed: false,
    filled: false,
    clientRef: newClientRequestId(),
  };
}

/**
 * БОЛВАНКА СТРОКИ BOM — новый артикул каталога: мета и цена. Цвет, размещение и расход выбираются
 * ПО КОЛОРВЕЮ, на своей вкладке.
 *
 * ⚠ ЭТО ЗЕРКАЛО `bomItemSchema`, И ИМЕННО ПОЭТОМУ ПЕРЕЧИСЛЕНИЕ ЗДЕСЬ ПОЛНОЕ. BOM пишется upsert'ом
 * полной заменой по `line_key`, а маппер записи перечисляет поля строки поимённо: ключ, забытый в
 * болванке, приезжает на сервер zod-дефолтом, то есть командой «очисти это». `pantone` дописан
 * ровно по этой причине — до него болванка расходилась со схемой на одно поле (значение то же, ''
 * — так что поведение не менялось, менялась только достижимость следующей потери).
 */
export const emptyBomItem = {
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  // НАЗНАЧЕНИЕ (0265): unset until someone answers for it. The add flow asks on every roll-goods
  // line, so a new fabric never actually reaches the grid unsorted — but the default has to be the
  // honest one, because this template is also what a non-roll-goods line is built from.
  // `as string` — НЕ КОСМЕТИКА: обе константы объявлены `as const`, и без расширения
  // болванка получила бы ЛИТЕРАЛЬНЫЙ тип «только UNSET», то есть конструктор перестал бы
  // принимать реальное назначение, ради которого его и зовут.
  purpose: UNSET_PURPOSE as string,
  purposeNote: '',
  // ЧТО ЭТО ЗА ПОЗИЦИЯ (0278): same honest default on the other axis — unset until answered.
  kind: UNSET_KIND as string,
  kindNote: '',
  isSample: false,
  name: '',
  supplier: '',
  supplierRef: '',
  color: '',
  pantone: '',
  composition: '',
  spec: '',
  unit: '',
  unitPrice: '',
  currency: '',
  comment: '',
  fabricWidth: '',
  fabricWeightGsm: '',
  fabricDirection: 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN',
  wastagePercent: '',
  materialId: 0,
  id: 0,
  lineKey: '', // перевыпускается в bornBomLine; см. довод там
};

/**
 * РОЖДЕНИЕ СТРОКИ BOM. Одна дверь на два места рождения — двухшаговый диалог вкладки BOM и
 * принятая строка черновика construction.
 *
 * ⚠ `lineKey` СТОИТ ПОСЛЕ РАСТЕКАНИЯ ЗНАЧЕНИЙ, И ЭТО НЕСУЩИЙ ПОРЯДОК: ключ строки — её личность
 * под upsert'ом, и вызывающий, случайно принёсший чужой `lineKey` (скопировав строку, например),
 * не создал бы новую строку, а ПЕРЕЗАПИСАЛ существующую. Здесь он минтится всегда и вызывающим
 * не переопределяется.
 */
export function bornBomLine(
  values?: Partial<typeof emptyBomItem> & Record<string, unknown>,
): Record<string, unknown> {
  return { ...emptyBomItem, ...(values ?? {}), lineKey: ulid() };
}
