import { common_Category } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { getCategoriesByParentId } from 'lib/utility';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const UNSET = { value: 0, label: '— unset —' };

// 3-level category cascade (top → sub → type) over a SINGLE stored leaf id (`categoryId`).
// categoryId is the source of truth: the path is derived by walking parents, and picking a
// level writes the deepest selected id. Clearing a deeper level falls back to its parent.
function CategoryCascade() {
  const { setValue } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const categoryId = (useWatch({ name: 'categoryId' }) as number | undefined) ?? 0;
  const cats = dictionary?.categories ?? [];

  const byId = useMemo(() => {
    const m = new Map<number, common_Category>();
    for (const c of cats) if (c.id != null) m.set(c.id, c);
    return m;
  }, [cats]);

  // walk the stored leaf up to its top ancestor → { top, sub, type } ids
  const path = useMemo(() => {
    const out: { top: number; sub: number; type: number } = { top: 0, sub: 0, type: 0 };
    const chain: common_Category[] = [];
    let cur = categoryId ? byId.get(categoryId) : undefined;
    let guard = 0;
    while (cur && guard++ < 8) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const c of chain) {
      if (c.level === 'top_category') out.top = c.id ?? 0;
      else if (c.level === 'sub_category') out.sub = c.id ?? 0;
      else out.type = c.id ?? 0;
    }
    return out;
  }, [categoryId, byId]);

  const tops = cats.filter((c) => c.level === 'top_category');
  // Levels are matched explicitly, never by depth: `dresses` hangs its types straight off the top
  // category (no sub_category level at all), so a parentId-only lookup would list mini/maxi/mesh in
  // the SUB slot — and the pick would then vanish on re-render, because `path` bins by level and
  // would put it in `type` while `sub` stayed 0.
  const subs = path.top ? getCategoriesByParentId(cats, path.top, 'sub_category') : [];
  // Types hang off the sub-category where there is one, off the top category where there isn't.
  const typeParent = path.sub || (subs.length === 0 ? path.top : 0);
  const types = typeParent ? getCategoriesByParentId(cats, typeParent, 'type') : [];

  // '0' is the unset sentinel (Radix Select forbids empty-string item values).
  const items = (list: common_Category[], placeholder: string) => [
    { value: '0', label: placeholder },
    ...list.map((c) => ({ value: String(c.id ?? 0), label: c.name ?? `#${c.id}` })),
  ];

  // write the deepest selected id as the leaf; clearing a level falls back to its parent
  const setLeaf = (id: number) => setValue('categoryId', id || 0, { shouldDirty: true });

  return (
    <div className='space-y-1'>
      <FormLabel>category</FormLabel>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
        <Select
          name='category-top'
          items={items(tops, '— category —')}
          value={String(path.top)}
          onValueChange={(v?: string) => setLeaf(Number(v) || 0)}
        />
        <Select
          name='category-sub'
          items={items(
            subs,
            path.top && subs.length === 0 ? '— no sub-category —' : '— sub (optional) —',
          )}
          value={String(path.sub)}
          disabled={!path.top || subs.length === 0}
          onValueChange={(v?: string) => setLeaf(Number(v) || path.top || 0)}
        />
        <Select
          name='category-type'
          items={items(types, '— type (optional) —')}
          value={String(path.type)}
          disabled={types.length === 0}
          onValueChange={(v?: string) => setLeaf(Number(v) || path.sub || path.top || 0)}
        />
      </div>
      <Text variant='inactive' size='small'>
        Only the top category is required — sub-category and type are optional.
      </Text>
    </div>
  );
}

// Header classification FKs (category leaf / base model / base sample size).
// base_sample_size_id is restricted to the card's size range (cross-validated server-side).
export function HeaderMetaFields() {
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
    <div className='space-y-3'>
      <CategoryCascade />
      {/* base model / base sample size are optional provenance FKs — both still print to the spec,
          so they stay mounted (values round-trip) but sit behind a disclosure to keep the header
          leading with category. Expand to set them. */}
      <details>
        <summary className='cursor-pointer select-none text-textBaseSize uppercase text-labelColor hover:text-text'>
          base model & sample size — optional
        </summary>
        <div className='mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2'>
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
      </details>
    </div>
  );
}
