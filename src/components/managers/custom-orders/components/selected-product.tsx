import { common_Colorway } from 'api/proto-http/admin';
import { formatSizeName, getFilteredSizes } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

// custFlow v2 — one basket line. Thumbnail + name, then the per-line controls (qty, size, price)
// the order needs. The container (in custom-order-form) draws the outer border and divides rows, so
// this row is borderless; the [x] is now wired to remove the line.
export function SelectedProduct({
  product,
  itemIdx,
  currency,
  onRemove,
}: {
  product?: common_Colorway;
  itemIdx: number;
  currency?: string;
  onRemove?: () => void;
}) {
  const { dictionary } = useDictionary();
  const name = product?.display?.translations?.[0]?.name;
  const merchandising = product?.display?.merchandising;
  const topCategoryId = Number(merchandising?.topCategoryId) || 0;
  const typeId = Number(merchandising?.typeId) || 0;
  const targetGender = merchandising?.targetGender;

  const sizeItems = useMemo(() => {
    const opts = { gender: targetGender };
    const topCategory = dictionary?.categories?.find((c) => c.id === topCategoryId);
    const isShoes = topCategory?.name?.toLowerCase().includes('shoes') ?? false;

    let merged: { id?: number; name?: string }[];
    if (isShoes) {
      merged = getFilteredSizes(dictionary, topCategoryId, typeId, {
        ...opts,
        showBottoms: false,
        showTailored: false,
      });
    } else {
      const standard = getFilteredSizes(dictionary, topCategoryId, typeId, {
        ...opts,
        showBottoms: false,
        showTailored: false,
      });
      const bottoms = getFilteredSizes(dictionary, topCategoryId, typeId, {
        ...opts,
        showBottoms: true,
        showTailored: false,
      });
      const tailored = getFilteredSizes(dictionary, topCategoryId, typeId, {
        ...opts,
        showBottoms: false,
        showTailored: true,
      });
      const seen = new Set<number>();
      merged = [...standard, ...bottoms, ...tailored].filter((s) => {
        if (!s.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    }
    return merged.map((s) => ({
      value: s.id!,
      label: formatSizeName(s.name) || s.name?.replace('SIZE_ENUM_', '') || String(s.id),
    }));
  }, [dictionary, topCategoryId, typeId, targetGender]);

  return (
    <div className='flex gap-3 p-2.5 text-textColor'>
      <div className='w-16 shrink-0'>
        <Media
          src={product?.display?.thumbnail?.media?.thumbnail?.mediaUrl ?? ''}
          alt={name || 'product'}
          aspectRatio='4/5'
          fit='contain'
        />
      </div>

      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <div className='flex items-start justify-between gap-2'>
          <Text size='micro' component='span' className='min-w-0 truncate font-bold uppercase'>
            {name || `#${product?.id}`}
          </Text>
          {onRemove && (
            <Button variant='underline' size='xs' type='button' title='remove' onClick={onRemove}>
              remove
            </Button>
          )}
        </div>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='w-14'>
            <InputField
              name={`items.${itemIdx}.quantity`}
              label='qty'
              type='number'
              min={1}
              valueAsNumber
            />
          </div>
          <div className='w-28'>
            <SelectField
              name={`items.${itemIdx}.sizeId`}
              label='size'
              items={sizeItems}
              valueAsNumber
            />
          </div>
          <div className='w-24'>
            <InputField
              name={`items.${itemIdx}.customPrice.value`}
              label={currency ? `price · ${currency}` : 'price'}
              placeholder='0.00'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
