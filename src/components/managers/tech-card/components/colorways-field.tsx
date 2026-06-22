import { common_MediaFull, common_Product } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { techCardLabDipStatusOptions } from 'constants/filter';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';

const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';

const emptyColorway = {
  code: '',
  name: '',
  labDipStatus: 'TECH_CARD_LAB_DIP_STATUS_PENDING',
  productId: 0,
  comment: '',
  pantone: '',
  pantoneSystem: '',
  hex: '',
  swatchMediaId: 0,
  labDipRound: 0,
  labDipSubmittedAt: '',
  labDipDecidedAt: '',
  labDipDecidedBy: '',
  labDipRejectReason: '',
};

function productName(product?: common_Product): string {
  return product?.productDisplay?.productBody?.translations?.[0]?.name ?? '';
}

function ColorwayRow({
  index,
  productOptions,
  onRemove,
}: {
  index: number;
  productOptions: Array<{ value: number; label: string }>;
  onRemove: () => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const status = useWatch({ control, name: `colorways.${index}.labDipStatus` }) as string;
  const hex = (useWatch({ control, name: `colorways.${index}.hex` }) as string) || '';
  const swatchMediaId = useWatch({ control, name: `colorways.${index}.swatchMediaId` }) as number;
  const [pickedSwatch, setPickedSwatch] = useState<common_MediaFull | undefined>();

  const hexValid = /^#?[0-9a-fA-F]{3,8}$/.test(hex.trim());
  const swatchUrl =
    pickedSwatch?.media?.thumbnail?.mediaUrl || pickedSwatch?.media?.fullSize?.mediaUrl || '';

  function handleSwatch(picked: common_MediaFull[]) {
    const m = picked[0];
    setValue(`colorways.${index}.swatchMediaId`, m?.id ?? 0, { shouldDirty: true });
    setPickedSwatch(m);
  }

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          colourway {index + 1}
        </Text>
        <Button type='button' variant='secondary' aria-label='remove colourway' onClick={onRemove}>
          ✕
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
        <InputField name={`colorways.${index}.code`} label='code' placeholder='BLK' />
        <InputField name={`colorways.${index}.name`} label='name *' />
        <SelectField
          name={`colorways.${index}.labDipStatus`}
          label='lab dip'
          items={techCardLabDipStatusOptions}
        />
        <SelectField
          name={`colorways.${index}.productId`}
          label='linked product'
          items={productOptions}
          valueAsNumber
        />
      </div>

      {/* colour identity */}
      <div className='grid grid-cols-1 items-end gap-3 lg:grid-cols-4'>
        <InputField name={`colorways.${index}.pantone`} label='pantone' placeholder='19-4005' />
        <InputField
          name={`colorways.${index}.pantoneSystem`}
          label='pantone system'
          placeholder='TCX'
        />
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <InputField name={`colorways.${index}.hex`} label='hex' placeholder='#101010' />
          </div>
          <div
            className='size-8 shrink-0 border border-textColor'
            style={
              hexValid ? { backgroundColor: hex.startsWith('#') ? hex : `#${hex}` } : undefined
            }
            aria-label='hex preview'
          />
        </div>
        <div className='space-y-1'>
          <Text variant='uppercase' size='small'>
            swatch
          </Text>
          <div className='flex items-center gap-2'>
            {swatchUrl ? (
              <div className='size-10 shrink-0 border border-textColor'>
                <Media src={swatchUrl} alt='swatch' aspectRatio='1/1' fit='cover' />
              </div>
            ) : swatchMediaId ? (
              <Text variant='inactive' size='small'>
                #{swatchMediaId}
              </Text>
            ) : null}
            <MediaSelector
              label='swatch'
              purpose='colour swatch'
              aspectRatio={['Custom']}
              allowMultiple={false}
              showVideos={false}
              saveSelectedMedia={handleSwatch}
              triggerClassName='px-2 py-1 uppercase'
            />
          </div>
        </div>
      </div>

      {/* lab-dip lifecycle */}
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
        <InputField
          name={`colorways.${index}.labDipRound`}
          type='number'
          valueAsNumber
          label='lab-dip round'
        />
        <InputField name={`colorways.${index}.labDipSubmittedAt`} type='date' label='submitted' />
        <InputField name={`colorways.${index}.labDipDecidedAt`} type='date' label='decided' />
        <InputField name={`colorways.${index}.labDipDecidedBy`} label='decided by' />
      </div>

      {status === REJECTED && (
        <TextareaField
          name={`colorways.${index}.labDipRejectReason`}
          label='reject reason'
          rows={2}
          maxLength={1000}
        />
      )}

      <TextareaField
        name={`colorways.${index}.comment`}
        label='comment'
        rows={2}
        maxLength={1000}
      />
    </div>
  );
}

// Development colourways (Sheet «Колористика») with the full lab-dip lifecycle. BOM
// colour cells reference these by index. `productId` is restricted to the card's linked
// products (cross-validated server-side: colorway.product_id ∈ product_ids).
export function ColorwaysField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'colorways' });
  const productIds = (useWatch({ control, name: 'productIds' }) ?? []) as number[];
  const productMap = useProductsByIds(productIds);

  const productOptions = [
    { value: 0, label: '— none —' },
    ...productIds.map((id) => {
      const name = productName(productMap.get(id));
      return { value: id, label: name ? `${name} (#${id})` : `#${id}` };
    }),
  ];

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no colourways
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <ColorwayRow
              key={f.id}
              index={index}
              productOptions={productOptions}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyColorway })}
      >
        add colourway
      </Button>
    </div>
  );
}
