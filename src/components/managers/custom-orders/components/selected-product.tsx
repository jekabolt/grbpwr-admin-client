import { common_Product } from 'api/proto-http/admin';
import { formatSizeName, getFilteredSizes } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

export function SelectedProduct({
  product,
  itemIdx,
}: {
  product?: common_Product;
  itemIdx: number;
}) {
  const { dictionary } = useDictionary();
  const name = product?.productDisplay?.productBody?.translations?.[0]?.name;
  const productBody = product?.productDisplay?.productBody?.productBodyInsert;
  const topCategoryId = Number(productBody?.topCategoryId) || 0;
  const typeId = Number(productBody?.typeId) || 0;
  const targetGender = productBody?.targetGender;

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
    <div
      key={product?.id}
      className='flex gap-x-3 border-b border-solid border-textInactiveColor py-6 text-textColor first:pt-0 last:border-b-0'
    >
      <div className='relative h-full min-w-[90px] shrink-0'>
        <Media
          src={product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl ?? ''}
          alt='product'
          aspectRatio='4/5'
          fit='contain'
        />
      </div>

      <div className='relative flex w-full items-stretch justify-between'>
        <div className='flex w-full flex-col justify-between'>
          <div className='space-y-3'>
            <Text className='line-clamp-1 overflow-hidden text-ellipsis' variant='uppercase'>
              {name}
            </Text>
            <div className='space-y-2'>
              <InputField
                name={`items.${itemIdx}.quantity`}
                label='qty'
                type='number'
                min={1}
                valueAsNumber
                className='w-12 text-center'
              />
              <SelectField
                name={`items.${itemIdx}.sizeId`}
                label='size'
                items={sizeItems}
                valueAsNumber
                className='w-24 text-center'
              />
            </div>
          </div>
        </div>
        <div className='relative z-10 flex w-full flex-col items-end justify-between self-stretch'>
          <Button>[x]</Button>
          <div className='flex items-center justify-end whitespace-nowrap text-right'>
            <InputField
              name={`items.${itemIdx}.customPrice.value`}
              label='price'
              placeholder='0.00'
              className='w-16 text-center'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
