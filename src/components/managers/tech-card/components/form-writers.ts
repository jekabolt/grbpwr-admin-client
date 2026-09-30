import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { ulid } from 'utils/ulid';

import { UNSET_KIND } from './bom-kind';
import { UNSET_PURPOSE } from './bom-purpose-labels';
import type {
  FormCareLabel,
  FormCareLabelColorway,
  FormCareLabelFiber,
  FormGarmentLabel,
  FormPackagingItem,
} from './labels-schema';
import type { TechCardFormData } from './schema';

/**
 * ДВА ПИСАТЕЛЯ ФОРМЫ, КОТОРЫХ ТЕПЕРЬ РОВНО ПО ОДНОМУ.
 *
 * Здесь не заведено ни одного нового правила — сюда ПЕРЕЕХАЛИ два уже работавших: upsert строки
 * `details[]` по ключу (жил дважды: в `construction-general-info.tsx` и в `details-editor.tsx`) и
 * болванка строки `bomItems[]` (жила в `bom-field.tsx` как `emptyBomItem` + `lineKey: ulid()`
 * на месте вызова).
 *
 * ⚠ ТРЕТЬИМ ЗДЕСЬ ЖИЛО РОЖДЕНИЕ СТРОКИ `callouts[]`, И ЕГО БОЛЬШЕ НЕТ. Конструктор пережил снос
 * своей таблицы (B-11) ровно потому, что им же рождал строки черновик construction; B-13 снял и
 * это — «DRAFT OF THE CONSTRUCTION не должен добавлять коллауты», — и последний вызывающий ушёл
 * вместе с веткой записи. Писатель без вызывающего — не запас, а обещание: он молча расходится со
 * схемой, пока кто-нибудь не позовёт его через полгода и не запишет строку позапрошлой формы.
 * Указание на карточке теперь рождается РОВНО В ОДНОМ месте — на доске, где у него есть адрес
 * (`design/mood-callouts.tsx:246`), — и второго конструктора этой строке не нужно.
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

// ═══ LABELS REWORK (0386) — composition label, garment labels, packaging items ═══════════════════
//
// Same discipline as `upsertDetail`: every writer reads the LIVE form (`getValues`, not a render
// snapshot — two quick gestures land in one tick), patches ONE row by its key, and never replaces a
// whole list from a caller's array. The lists are keyed by `key` (a known kind or a custom name),
// one row per key, exactly like construction aspects.
//
// THE ROW RULE (differs from aspects on purpose, and says why). A label that carries nothing but its
// kind is a real thing here — «this style needs a brand label, the mockup is missing» — so a bare
// row is born by an explicit add and survives patches that change nothing. A row goes away in two
// ways only: `remove…`, or a patch that takes away its LAST fact (every text blank, no mockup, no BOM
// line, one per garment) — the same «clear the last field and the row is gone» as `upsertDetail`.

export type {
  FormCareLabel,
  FormCareLabelColorway,
  FormCareLabelFiber,
  FormGarmentLabel,
  FormPackagingItem,
};

const blankGarmentLabel = (key: string): FormGarmentLabel => ({
  key,
  placement: '',
  attachment: '',
  folding: '',
  size: '',
  qtyPerGarment: 1,
  bomItemId: 0,
  note: '',
  mediaIds: [],
});
const blankPackagingItem = (key: string): FormPackagingItem => ({
  key,
  usage: '',
  packing: '',
  size: '',
  qtyPerGarment: 1,
  bomItemId: 0,
  note: '',
  mediaIds: [],
});

const hasFacts = (row: Record<string, unknown>): boolean =>
  Object.entries(row).some(([k, v]) => {
    if (k === 'key') return false;
    if (k === 'qtyPerGarment') return (v as number | undefined) != null && v !== 1;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return v !== 0;
    return false;
  });

const sameKey = (a?: string, b?: string) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

type KeyedField = 'garmentLabels' | 'packagingItems';

/**
 * `keepBare` — the patch never removes the row, even when it takes away its last fact. The label /
 * item card passes it: there the row was born by an explicit add and goes away only by its ✕, so
 * backspacing the one filled field must not make the card vanish from under the cursor (nor move
 * it to the end of the list when the next keystroke re-adds it).
 */
export type KeyedOpts = { keepBare?: boolean };

function upsertKeyed<T extends { key?: string }>(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  field: KeyedField,
  blank: (key: string) => T,
  rawKey: string,
  patch: Partial<Omit<T, 'key'>>,
  opts?: KeyedOpts,
): void {
  const key = rawKey.trim();
  if (!key) return;
  const cur = ((getValues(field) ?? []) as T[]).slice();
  const k = cur.findIndex((r) => sameKey(r.key, key));
  const before = k >= 0 ? { ...blank(key), ...cur[k] } : blank(key);
  // `key` is identity and is never patched: the stored spelling survives.
  const merged = { ...before, ...patch, key: before.key } as T;
  const lostLastFact =
    !opts?.keepBare &&
    hasFacts(before as Record<string, unknown>) &&
    !hasFacts(merged as Record<string, unknown>);
  const next = lostLastFact
    ? cur.filter((_, i) => i !== k)
    : k >= 0
      ? [...cur.slice(0, k), merged, ...cur.slice(k + 1)]
      : [...cur, merged];
  setValue(field, next as never, { shouldDirty: true });
}

function removeKeyed(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  field: KeyedField,
  key: string,
): void {
  const cur = (getValues(field) ?? []) as { key?: string }[];
  const next = cur.filter((r) => !sameKey(r.key, key));
  if (next.length !== cur.length) setValue(field, next as never, { shouldDirty: true });
}

/**
 * Add (bare) or patch a garment label by key. `patch` = `{}` adds a bare row (the picker's add
 * door); a patch that leaves an existing row with no fact at all removes it.
 */
export function upsertGarmentLabel(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
  patch: Partial<Omit<FormGarmentLabel, 'key'>>,
  opts?: KeyedOpts,
): void {
  upsertKeyed(getValues, setValue, 'garmentLabels', blankGarmentLabel, key, patch, opts);
}

export function removeGarmentLabel(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
): void {
  removeKeyed(getValues, setValue, 'garmentLabels', key);
}

/** Same contract as `upsertGarmentLabel`, for `packagingItems`. */
export function upsertPackagingItem(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
  patch: Partial<Omit<FormPackagingItem, 'key'>>,
  opts?: KeyedOpts,
): void {
  upsertKeyed(getValues, setValue, 'packagingItems', blankPackagingItem, key, patch, opts);
}

export function removePackagingItem(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
): void {
  removeKeyed(getValues, setValue, 'packagingItems', key);
}

/**
 * Patch the composition label's card-level overrides (logo, prose, QR, caption, address). What the
 * patch does not name survives. An empty value is «derived» (0 = brand mark, [] = default lines).
 * Colourway entries have their own writer.
 */
export function setCareLabel(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  patch: Partial<Omit<FormCareLabel, 'colorways'>>,
): void {
  const cur = (getValues('careLabel') ?? {}) as FormCareLabel;
  setValue('careLabel', { ...cur, ...patch, colorways: cur.colorways ?? [] } as never, {
    shouldDirty: true,
  });
}

/**
 * Patch ONE colourway's overrides: `colourName` ('' = derived from the colourway) and/or `fibers`
 * (the whole fibre set of that colourway; [] = derived from the BOM). An entry left overriding
 * nothing is removed — the server drops it too, so the form and the stored record agree.
 */
export function setCareLabelColorway(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  colorwayId: number,
  patch: { colourName?: string; fibers?: FormCareLabelFiber[] },
): void {
  if (!(colorwayId > 0)) return;
  const cur = (getValues('careLabel') ?? {}) as FormCareLabel;
  const list = (cur.colorways ?? []).slice();
  const k = list.findIndex((c) => c.colorwayId === colorwayId);
  const before: FormCareLabelColorway =
    k >= 0 ? list[k] : { colorwayId, colourName: '', fibers: [] };
  const merged: FormCareLabelColorway = {
    colorwayId,
    colourName: patch.colourName ?? before.colourName ?? '',
    fibers: (patch.fibers ?? before.fibers ?? []).map((f) => ({ ...f })),
  };
  const empty = !merged.colourName?.trim() && (merged.fibers?.length ?? 0) === 0;
  const next = empty
    ? list.filter((_, i) => i !== k)
    : k >= 0
      ? [...list.slice(0, k), merged, ...list.slice(k + 1)]
      : [...list, merged];
  setValue('careLabel', { ...cur, colorways: next } as never, { shouldDirty: true });
}
