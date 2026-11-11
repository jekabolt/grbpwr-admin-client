import { common_Size } from 'api/proto-http/admin';
import { useFormContext, useWatch } from 'react-hook-form';
import { BracketOptions, FormField, PinToggle } from 'ui';
import { SIZE_PIN_CATEGORIES, usePinFor } from './model-pins';
import { ModelFormData } from './schema';
import { SIZE_CATEGORY_ORDER } from './size-categories';
import { useSizeSystems } from './use-size-systems';

/** `M_38BO_F` → `M / 38`, `xs` → `XS`, `42.5` stays. */
export function sizeOptionLabel(name = ''): string {
  const [letter, system] = name.split('_');
  const number = system?.match(/\d+(\.\d+)?/)?.[0];
  return number ? `${letter.toUpperCase()} / ${number}` : letter.toUpperCase();
}

const LABEL = new Map(SIZE_CATEGORY_ORDER.map((c) => [c.key, c.label]));

function SizeRow({
  category,
  sizes,
  selectedIds,
  onChange,
}: {
  category: (typeof SIZE_PIN_CATEGORIES)[number];
  sizes: common_Size[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const label = LABEL.get(category) ?? category;
  const pin = usePinFor(`sizes.${category}`, label);
  const inCategory = new Set(sizes.map((s) => s.id ?? 0));
  const chosen = selectedIds.filter((id) => inCategory.has(id)).map(String);

  return (
    <BracketOptions
      ruled
      multiple
      overflowList='cascade'
      ariaLabel={label}
      label={`${label.charAt(0).toUpperCase()}${label.slice(1)}:`}
      options={sizes.map((s) => ({ value: String(s.id), label: sizeOptionLabel(s.name) }))}
      values={chosen}
      // Several sizes per category (owner: «верни механику Multiple Option Choices»).
      onValuesChange={(next) =>
        onChange([...selectedIds.filter((id) => !inCategory.has(id)), ...next.map(Number)])
      }
      end={pin && <PinToggle {...pin} />}
    />
  );
}

/**
 * Default sample sizes: one ruled row per category (Tops / Bottoms / Tailored / Shoes), offering the
 * sizes that fit the model's gender (`useSizeSystems`). Storage is unchanged — `defaultSizeIds` —
 * and an id outside these four categories is kept as it is.
 */
export function DefaultSizesField() {
  const { control } = useFormContext<ModelFormData>();
  const gender = useWatch({ control, name: 'gender' }) as string;
  const selectedIds = (useWatch({ control, name: 'defaultSizeIds' }) ?? []) as number[];
  const { permitted } = useSizeSystems({ gender, selectedIds });

  return (
    <FormField
      control={control}
      name='defaultSizeIds'
      render={({ field }) => (
        <div className='flex flex-col gap-4'>
          {SIZE_PIN_CATEGORIES.map((category) => (
            <SizeRow
              key={category}
              category={category}
              sizes={permitted.find((g) => g.key === category)?.sizes ?? []}
              selectedIds={field.value ?? []}
              onChange={field.onChange}
            />
          ))}
        </div>
      )}
    />
  );
}
