import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';

// Product visibility (productBodyInsert.hidden) presented as a clear storefront toggle.
export function VisibilityField({ editMode }: { editMode: boolean }) {
  const { watch, setValue } = useFormContext();
  const hidden = !!watch('product.productBodyInsert.hidden');

  return (
    <div className='flex items-center justify-between gap-3 border border-textInactiveColor px-3 py-2'>
      <div className='flex flex-col'>
        <Text variant='uppercase'>visibility</Text>
        <Text variant='inactive' size='small'>
          {hidden ? 'hidden — not shown on storefront' : 'visible on storefront'}
        </Text>
      </div>
      <div className='flex items-center gap-2'>
        <Text size='small' className={hidden ? 'text-textInactiveColor' : 'text-textColor'}>
          {hidden ? 'hidden' : 'visible'}
        </Text>
        <ToggleSwitch
          checked={!hidden}
          disabled={!editMode}
          onCheckedChange={(checked) =>
            setValue('product.productBodyInsert.hidden', !checked, {
              shouldDirty: true,
              shouldTouch: true,
            })
          }
        />
      </div>
    </div>
  );
}
