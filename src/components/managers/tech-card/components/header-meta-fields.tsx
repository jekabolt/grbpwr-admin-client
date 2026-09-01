import { common_Category, common_SizeSkuSystem } from 'api/proto-http/admin';
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
import { permittedSizeSystems } from 'utils/size-systems';
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
function CategoryBrowser() {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const cats = useMemo(() => dictionary?.categories ?? [], [dictionary?.categories]);

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
  const sameSystems = (a?: common_SizeSkuSystem[], b?: common_SizeSkuSystem[]) =>
    [...(a ?? [])].sort().join(',') === [...(b ?? [])].sort().join(',');

  // Sizes already in the run that the candidate category would no longer offer. `useSizeSystems`
  // never hides an already-selected size, so nothing is silently dropped — but the run stops
  // agreeing with the category, and that is worth naming out loud before it happens.
  const outsideCount = (candidate: number) => {
    const allow = systemsOf(candidate);
    if (!allow) return 0;
    const permitted = new Set(allow);
    const sizeById = new Map((dictionary?.sizes ?? []).map((s) => [s.id ?? 0, s] as const));
    return sizeIds.filter(
      (id) => !permitted.has(sizeById.get(id)?.skuSystem ?? 'SIZE_SKU_SYSTEM_UNKNOWN'),
    ).length;
  };

  const applyLeaf = (id: number) => setValue('categoryId', id || 0, { shouldDirty: true });

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
      <Text size='micro' variant='label'>
        only the top category is required — sub-category and type are optional
      </Text>

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

// Header classification FKs (category leaf / base model / base sample size).
// base_sample_size_id is restricted to the card's size range (cross-validated server-side).
export function HeaderMetaFields({ hideCategory = false }: { hideCategory?: boolean }) {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];

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

  const sampleSizeOptions = [
    UNSET,
    ...sizeIds.map((id) => ({ value: id, label: formatSizeName(sizeById.get(id) ?? `#${id}`) })),
  ];

  return (
    <div className='space-y-2.5'>
      {/* Браузер категорий прячется у aux-карты: там классификацию задаёт AUXILIARY TYPE.
          Скрывается ТОЛЬКО орган — значение categoryId остаётся в форме и раунд-трипится. */}
      {!hideCategory && <CategoryBrowser />}
      {/* K-21 · ОБЫЧНЫЕ ПОЛЯ, НЕ РАСКРЫВАШКА. Владелец: «бейс модел и семпл сайз сделать обычным
          не колапс инпутом как все остальные в карточке».
          Прежний довод за `<details>` («чтобы шапка начиналась с категории») стоил дороже, чем
          покупал: base_sample_size_id — это размер, по которому считается СЕБЕСТОИМОСТЬ (норма
          базового размера берётся без фолбэка), то есть поле, спрятанное под словом «optional»,
          молча решало деньги. Схлопнутое поле к тому же не показывает, что оно уже заполнено, —
          оператор не видел ни значения, ни его отсутствия.
          Форма полей не тронута: те же два `SelectField`, те же имена, тот же `valueAsNumber`,
          тот же `loading`, та же серверная кросс-валидация по диапазону размеров. Сетка снята
          намеренно — соседи по блоку `classification` (purpose / auxiliary type / target gender /
          fit) стоят полной шириной один под другим, и «как все остальные» здесь значит именно
          общий вертикальный ряд, а не собственный двухколоночный островок.
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
      />
    </div>
  );
}
