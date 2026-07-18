import { UseFormReturn } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import { type PromoDraftSchema } from './schema';

type Props = {
  form: UseFormReturn<PromoDraftSchema>;
  onSubmit: (data: PromoDraftSchema) => void;
  onCancel: () => void;
  /** Current allowed state — display-only here; toggled via the table's own column. */
  allowed: boolean;
};

/**
 * H8: inline edit for an existing promo code (discount / dates / free shipping /
 * voucher / code itself), pre-filled by the caller. Previously the only way to fix
 * a typo'd discount or extend an expiration was deleting and recreating the code
 * by hand. Submits through usePromo's submitEdit, which now calls the atomic
 * UpdatePromoCode RPC — see useUpdatePromo. Note: that RPC looks the row up by
 * promo.code and only mutates the other fields, so changing the Code input itself
 * isn't a supported rename — it looks up a row under the new code and finds none.
 */
export function PromoEditRow({ form, onSubmit, onCancel, allowed }: Props) {
  return (
    <Form {...form}>
      <tr className='bg-bgColor'>
        <td className='border border-r border-textInactiveColor px-0'>
          <div className='flex justify-center'>
            <Text variant='inactive' size='small'>
              {allowed ? 'allowed' : 'disabled'}
            </Text>
          </div>
        </td>
        <td className='border border-r border-textInactiveColor text-center px-2'>
          <InputField
            name='code'
            label='Code'
            srLabel
            placeholder='promo code'
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textInactiveColor px-2'>
          <InputField
            name='start'
            type='date'
            label='Start'
            srLabel
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textInactiveColor px-2'>
          <InputField
            name='expiration'
            type='date'
            label='Expiration'
            srLabel
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textInactiveColor px-2'>
          <div className='flex items-center justify-center gap-1'>
            <InputField
              name='discount'
              type='number'
              label=''
              srLabel
              min={0}
              max={100}
              className='w-full text-center border-none'
            />
            <span>%</span>
          </div>
        </td>
        <td
          className='border border-r border-textInactiveColor px-0'
          title='Free shipping: the order ships at no cost to the customer when this code is applied.'
        >
          <div className='flex justify-center'>
            <CheckboxField name='freeShipping' />
          </div>
        </td>
        <td
          className='border border-r border-textInactiveColor px-0'
          title="Voucher: marks the code as a voucher — it's labeled 'voucher' on the order and invoice instead of a standard promo code."
        >
          <div className='flex justify-center'>
            <CheckboxField name='voucher' />
          </div>
        </td>
        <td className='border border-r border-textInactiveColor' colSpan={2}>
          <div className='flex justify-center gap-1'>
            <Button
              size='lg'
              variant='simpleReverseWithBorder'
              className='w-full'
              onClick={form.handleSubmit(onSubmit)}
            >
              Save
            </Button>
            <Button size='lg' variant='main' className='w-full' onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    </Form>
  );
}
