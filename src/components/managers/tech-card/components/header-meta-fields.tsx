import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const UNSET = { value: 0, label: '— unset —' };

// Header classification FKs (category / base model / base sample size) and cost
// targets. base_sample_size_id is restricted to the card's size range (cross-validated
// server-side: base_sample_size_id ∈ size_ids).
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

  const categoryOptions = useMemo(
    () => [
      UNSET,
      ...(dictionary?.categories ?? []).map((c) => ({
        value: c.id ?? 0,
        label: `${c.name ?? `#${c.id}`}${c.level ? ` · ${c.level.replace('_category', '')}` : ''}`,
      })),
    ],
    [dictionary?.categories],
  );

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
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <SelectField name='categoryId' label='category' items={categoryOptions} valueAsNumber />
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
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <InputField name='targetCost' label='target cost' />
        <InputField name='targetRetailPrice' label='target retail price' />
        <InputField name='currency' label='currency' placeholder='EUR' />
      </div>
    </div>
  );
}
