import { common_Category, common_SizeSkuSystem } from 'api/proto-http/admin';
import { useSizeSystems } from 'components/managers/model/components/use-size-systems';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn, getCategoriesByParentId } from 'lib/utility';
import { useCallback, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import GenericPopover from 'ui/components/popover';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { permittedSizeSystems, sizeInSystems } from 'utils/size-systems';
import { followCategory } from './design/flat-route';
import { garmentClassOf, useGarmentClass } from './design/head/card-facts-form';
import { TechCardFormData } from './schema';

const UNSET = { value: 0, label: '— unset —' };

// One row of a browser column. Not a `Row`: this one is a full-width target that fills with ink
// when it is the selected node, so its label has to inherit the row's colour rather than carry
// its own.
function BrowserRow({
  label,
  selected,
  hasChildren,
  onClick,
}: {
  label: string;
  selected: boolean;
  hasChildren?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center justify-between gap-1.5 border-b border-hairline px-1.5 py-0.5 text-left last:border-b-0',
        selected ? 'bg-textColor text-bgColor' : 'text-textColor hover:bg-bgZebra',
      )}
    >
      {/* option-label size (11px), not the 10px label size — these are the choices themselves */}
      <span className='truncate text-control'>{label}</span>
      {hasChildren && (
        <span aria-hidden className='shrink-0 text-control'>
          ›
        </span>
      )}
    </button>
  );
}

function BrowserColumn({
  title,
  items,
  selectedId,
  hasChildren,
  empty,
  onPick,
  className,
}: {
  title: string;
  items: common_Category[];
  selectedId: number;
  hasChildren?: (c: common_Category) => boolean;
  empty: string;
  onPick: (id: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <GroupLabel flush className='px-1.5'>
        {title}
      </GroupLabel>
      <div className='max-h-[240px] overflow-y-auto'>
        {items.length === 0 ? (
          <Text size='micro' variant='label' className='px-1.5 py-0.5'>
            {empty}
          </Text>
        ) : (
          items.map((c) => (
            <BrowserRow
              key={c.id}
              label={c.name ?? `#${c.id}`}
              selected={(c.id ?? 0) === selectedId}
              hasChildren={hasChildren?.(c)}
              onClick={() => onPick(c.id ?? 0)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// The category tree over a SINGLE stored leaf id (`categoryId`). categoryId is the source of truth:
// the path is derived by walking parents, and picking a level writes the deepest selected id.
//
// One trigger showing the whole path opens a Finder-style three-column browser (the tree is already
// in the dictionary — no request). Clicking a level-1 row re-parents levels 2–3, same for 2 → 3.
// Sub and type stay optional: a level-1-only selection is valid and the trigger reads «outerwear».
//
// ЭКСПОРТИРУЕТСЯ С КРУГА 20 (B-27): базовая модель и базовый размер уехали отсюда в СВОЙ блок
// шапки, и обёртки, которая держала бы категорию с ними вместе, больше нет. Браузер зовут по имени.
//
// ⚠ ПРОПА `hint` БОЛЬШЕ НЕТ, И ЭТО НЕ УПРОЩЕНИЕ, А СНЯТАЯ СТРОКА (r2 п.2). Владелец, дословно:
// «only the top category is required — sub-category and type are optional — убери этот текст».
// Строку сняли сначала ТОЛЬКО на CARD DETAILS (`hint={false}`), и она осталась жива на втором
// вызывающем — MOODBOARD → GENERAL INFORMATION. Флаг с одним значением у всех вызывающих — это
// мёртвая ветка, которая однажды вернёт текст «по умолчанию»; поэтому снят и он. Довод строки
// был и остаётся верен: колонки браузера подписаны «sub · optional» / «type · optional», и она
// повторяла их третий раз.
export function CategoryBrowser() {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const cats = useMemo(() => dictionary?.categories ?? [], [dictionary?.categories]);
  const { seeded } = useGarmentClass();

  const [open, setOpen] = useState(false);
  // A category change that would move the size run's goalposts is confirmed first (see below).
  const [pending, setPending] = useState<number | null>(null);

  const byId = useMemo(() => {
    const m = new Map<number, common_Category>();
    for (const c of cats) if (c.id != null) m.set(c.id, c);
    return m;
  }, [cats]);

  // walk a leaf up to its top ancestor → { top, sub, type } ids (+ the names, in path order)
  const resolve = useCallback(
    (leaf: number) => {
      const out = { top: 0, sub: 0, type: 0, names: [] as string[] };
      const chain: common_Category[] = [];
      let cur = leaf ? byId.get(leaf) : undefined;
      let guard = 0;
      while (cur && guard++ < 8) {
        chain.unshift(cur);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      for (const c of chain) {
        if (c.level === 'top_category') out.top = c.id ?? 0;
        else if (c.level === 'sub_category') out.sub = c.id ?? 0;
        else out.type = c.id ?? 0;
        out.names.push(c.name ?? `#${c.id}`);
      }
      return out;
    },
    [byId],
  );

  const path = useMemo(() => resolve(categoryId), [resolve, categoryId]);

  const tops = cats.filter((c) => c.level === 'top_category');
  // Levels are matched explicitly, never by depth: `dresses` hangs its types straight off the top
  // category (no sub_category level at all), so a parentId-only lookup would list mini/maxi/mesh in
  // the SUB column — and the pick would then vanish on re-render, because `path` bins by level and
  // would put it in `type` while `sub` stayed 0.
  const subs = path.top ? getCategoriesByParentId(cats, path.top, 'sub_category') : [];
  // Types hang off the sub-category where there is one, off the top category where there isn't.
  const typeParent = path.sub || (subs.length === 0 ? path.top : 0);
  const types = typeParent ? getCategoriesByParentId(cats, typeParent, 'type') : [];

  const hasSubsOrTypes = (c: common_Category) =>
    getCategoriesByParentId(cats, c.id ?? 0).length > 0;

  const systemsOf = (id: number) =>
    permittedSizeSystems(dictionary?.categories, dictionary?.categorySizeSystems, id);
  // «No category» (undefined, every size) and «a category that maps nothing» ([], `os` only) are
  // two different goalposts — the key keeps them apart.
  const systemsKey = (a?: common_SizeSkuSystem[]) => (a ? [...a].sort().join(',') : '*');
  const sameSystems = (a?: common_SizeSkuSystem[], b?: common_SizeSkuSystem[]) =>
    systemsKey(a) === systemsKey(b);

  // Sizes already in the run that the candidate category would no longer offer. `useSizeSystems`
  // never hides an already-selected size, so nothing is silently dropped — but the run stops
  // agreeing with the category, and that is worth naming out loud before it happens.
  const outsideCount = (candidate: number) => {
    const allow = systemsOf(candidate);
    if (!allow) return 0;
    const sizeById = new Map((dictionary?.sizes ?? []).map((s) => [s.id ?? 0, s] as const));
    return sizeIds.filter((id) => {
      const size = sizeById.get(id);
      return !size || !sizeInSystems(size, allow);
    }).length;
  };

  // M10: WORDS were seeded with the old category's «garment: <class>» — the one line a flat sends.
  // It moves with the category in the same save; a class the designer wrote stays (`followCategory`).
  const applyLeaf = (id: number) => {
    setValue('categoryId', id || 0, { shouldDirty: true });
    const words = (getValues('garmentDescription') ?? '') as string;
    const next = followCategory(words, garmentClassOf(cats, id), seeded);
    if (next !== words) setValue('garmentDescription', next, { shouldDirty: true });
  };

  // Category drives the permitted size systems AND the measurement columns of the size chart, so a
  // change under a filled size run is confirmed the same way removing a size is. Refining deeper
  // inside the same top category with the same systems is not a change of goalposts — it does not
  // ask, or drilling top → sub → type would need three confirmations.
  const pick = (id: number) => {
    const next = id || 0;
    if (next === categoryId) return;
    const changesGoalposts =
      resolve(next).top !== path.top || !sameSystems(systemsOf(next), systemsOf(categoryId));
    if (sizeIds.length > 0 && categoryId > 0 && changesGoalposts) {
      setPending(next);
      return;
    }
    applyLeaf(next);
  };

  const triggerLabel = path.names.length ? path.names.join(' › ') : '— category —';
  const pendingLabel = pending != null ? resolve(pending).names.join(' › ') : '';

  return (
    <div className='space-y-px'>
      <FormLabel>category</FormLabel>
      <GenericPopover
        open={open}
        onOpenChange={setOpen}
        title='category'
        // Anchored flush under the field it replaces, so no tail (combobox grammar).
        noTail
        contentProps={{ align: 'start' }}
        triggerProps={{ className: 'flex w-full items-center' }}
        className='w-[460px] max-w-[calc(100vw-1.5rem)]'
        openElement={
          <span className='flex min-h-[22px] w-full items-center gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left hover:border-textColor'>
            <span className='min-w-0 flex-1 truncate text-textBaseSize'>{triggerLabel}</span>
            <Text size='micro' variant='label' component='span' aria-hidden>
              ▾
            </Text>
          </span>
        }
      >
        <div className='grid grid-cols-3'>
          <BrowserColumn
            title='category'
            className='border-r border-hairline pr-1'
            items={tops}
            selectedId={path.top}
            hasChildren={hasSubsOrTypes}
            empty='— dictionary empty —'
            onPick={pick}
          />
          <BrowserColumn
            title='sub · optional'
            className='border-r border-hairline px-1'
            items={subs}
            selectedId={path.sub}
            hasChildren={hasSubsOrTypes}
            empty={path.top ? 'no sub-categories' : 'pick a category'}
            onPick={pick}
          />
          <BrowserColumn
            title='type · optional'
            className='pl-1'
            items={types}
            selectedId={path.type}
            empty={typeParent ? 'no types' : 'pick a sub-category'}
            onPick={pick}
          />
        </div>
      </GenericPopover>
      {/* Строки «only the top category is required…» здесь БОЛЬШЕ НЕТ (r2 п.2) — разбор в шапке
          компонента. Необязательность уровней говорят сами колонки браузера: «sub · optional»,
          «type · optional». */}

      <ConfirmationModal
        open={pending != null}
        width='sm'
        title='change the category?'
        confirmLabel='change the category'
        cancelLabel='cancel'
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        onConfirm={() => {
          if (pending != null) applyLeaf(pending);
          setPending(null);
        }}
      >
        <Text size='micro' variant='label' className='mb-2'>
          the category sets the allowed size systems and the measurement columns of the size chart.
          changing it to “{pendingLabel}” affects the size range already assembled:
        </Text>
        <Row label='sizes in the range' value={sizeIds.length} />
        <Row
          label="of them outside the new category's systems"
          value={pending != null ? outsideCount(pending) : 0}
        />
        <Text size='micro' variant='label' className='mt-2'>
          sizes are not deleted — but the range will stop matching the category, and the measurement
          columns in the size chart will be recomputed for the new one.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

// ═══ BASE MODEL + BASE SAMPLE SIZE — ДВА ПОЛЯ, КОТОРЫЕ ТЕПЕРЬ СОСТАВЛЯЮТ СВОЙ БЛОК ═══════════
//
// КРУГ 20, B-27, дословно: «BASE MODEL и BASE SAMPLE SIZE выдели в отдельный блок на который
// занимает две колонки и находится под IDENTIFICATION и CLASSIFICATION». Блок рисует
// `components/index.tsx` (там живёт грид шапки и там же считается его `lg:col-span-2`); здесь —
// только содержимое, потому что ОПЦИИ обоих селектов выводятся из данных, а не из вёрстки:
// модели приезжают запросом, а список базовых размеров — это `sizeIds` ЭТОЙ формы.
//
// ⚠ ЭТО ПЕРЕЕЗД, А НЕ КОПИЯ. Обёртка `HeaderMetaFields`, которая держала эти два поля вместе с
// браузером категорий, снесена: категория осталась в GENERAL INFORMATION вкладки CONSTRUCTION и
// зовётся там по имени (`CategoryBrowser`), а два поля ниже уехали в шапку. Поля формы те же
// (`baseModelId`, `baseSampleSizeId`), тот же `valueAsNumber`, тот же `loading`, та же серверная
// кросс-валидация базового размера по диапазону карточки. Второго писателя не завелось.
//
// ДВА ПОЛЯ РЯДОМ, А НЕ ДРУГ ПОД ДРУГОМ. Блок занимает обе колонки шапки, и селект высотой 22px,
// растянутый на всю её ширину, читался бы как поле ввода абзаца. Ряды равноправны: модель — это
// «на ком построено», размер — «на чём считается себестоимость»; ни одно не следствие другого.
// base_sample_size_id is restricted to the card's size range (cross-validated server-side).
//
// ОНБОРДИНГ (П2): «когда мы заполнили все до BASE SAMPLE SIZE, мы знаем какие размеры бывают у вещи
// в категории — в дропдауне выбрать из этого». Пока диапазон пуст, список — это размеры, которые
// категория разрешает (`useSizeSystems`, тот же ответ, что у пикера диапазона, с полом карточки),
// по группам; без категории поле закрыто. Выбор на пустом диапазоне засевает `sizeIds` всей группой
// выбранного размера — сервер требует base ∈ range, и группа разрешённой системы есть ровно то, что
// он примет. Непустой диапазон — прежнее правило: список = диапазон.
export function BaseModelFields() {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const gender = useWatch({ control, name: 'targetGender' }) as string | undefined;
  const allowedSizeSystems = useMemo(
    () => permittedSizeSystems(dictionary?.categories, dictionary?.categorySizeSystems, categoryId),
    [dictionary?.categories, dictionary?.categorySizeSystems, categoryId],
  );
  const { permitted } = useSizeSystems({ gender, allowedSizeSystems, selectedIds: [] });
  const seeding = sizeIds.length === 0 && categoryId > 0;
  const noCategory = sizeIds.length === 0 && !(categoryId > 0);

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const modelOptions = useMemo(
    () => [
      UNSET,
      ...(models ?? []).map((m) => ({
        value: m.id ?? 0,
        label: m.model?.name ? `${m.model.name} (#${m.id})` : `#${m.id}`,
      })),
    ],
    [models],
  );

  const grouped = permitted.length > 1;
  const sampleSizeOptions: { value: number; label: string; group?: string }[] = noCategory
    ? [{ value: 0, label: '— pick a category first —' }]
    : seeding
      ? [
          UNSET,
          ...permitted.flatMap((g) =>
            g.sizes.map((sz) => ({
              value: sz.id ?? 0,
              label: formatSizeName(sz.name ?? `#${sz.id}`),
              group: grouped ? g.label : undefined,
            })),
          ),
        ]
      : [
          UNSET,
          ...sizeIds.map((id) => ({
            value: id,
            label: formatSizeName(sizeById.get(id) ?? `#${id}`),
          })),
        ];

  // The range is seeded by the same pick: the whole permitted group of the chosen size, in grade
  // order (`groupSizes` sorts by the dictionary's ordinal).
  const seedRange = (picked: string | number | undefined) => {
    const id = Number(picked ?? 0);
    if (!seeding || !(id > 0)) return;
    const group = permitted.find((g) => g.sizes.some((sz) => sz.id === id));
    if (!group) return;
    setValue(
      'sizeIds',
      group.sizes.map((sz) => sz.id ?? 0).filter((x) => x > 0),
      { shouldDirty: true },
    );
  };

  return (
    <div className='grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2' data-b27-base=''>
      {/* K-21 · ОБЫЧНЫЕ ПОЛЯ, НЕ РАСКРЫВАШКА. Владелец: «бейс модел и семпл сайз сделать обычным
          не колапс инпутом как все остальные в карточке».
          Прежний довод за `<details>` («чтобы шапка начиналась с категории») стоил дороже, чем
          покупал: base_sample_size_id — это размер, по которому считается СЕБЕСТОИМОСТЬ (норма
          базового размера берётся без фолбэка), то есть поле, спрятанное под словом «optional»,
          молча решало деньги. Схлопнутое поле к тому же не показывает, что оно уже заполнено, —
          оператор не видел ни значения, ни его отсутствия.
          Обязательность помечать не нужно: в этой форме маркер несут ТРЕБУЕМЫЕ поля («name *»),
          так что немаркированное поле и читается как необязательное — слово «optional» из
          заголовка раскрывашки не потерялось, оно было избыточным. */}
      <SelectField
        name='baseModelId'
        label='base model'
        items={modelOptions}
        valueAsNumber
        loading={modelsLoading}
      />
      <SelectField
        name='baseSampleSizeId'
        label='base sample size'
        items={sampleSizeOptions}
        valueAsNumber
        disabled={noCategory}
        className={noCategory ? 'bg-bgZebra text-labelColor' : undefined}
        onAfterChange={seedRange}
      />
    </div>
  );
}
