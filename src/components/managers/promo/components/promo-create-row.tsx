import { UseFormReturn, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import { emptyPromoDraft, type PromoDraftSchema } from './schema';
import { useExistingPromoCodes } from './usePromoQuery';

type Props = {
  form: UseFormReturn<PromoDraftSchema>;
  onSubmit: (data: PromoDraftSchema) => void;
  onCancel: () => void;
};

// H5: random, readable-enough candidate code (base36 avoids ambiguous-looking
// separators); collision is astronomically unlikely but still checked live below.
function generatePromoCode(): string {
  return `PROMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function PromoCreateRow({ form, onSubmit, onCancel }: Props) {
  const code = useWatch({ control: form.control, name: 'code' });
  const { data: existingCodes } = useExistingPromoCodes();
  const normalizedCode = code?.trim().toUpperCase();
  const isDuplicate = !!normalizedCode && !!existingCodes?.has(normalizedCode);

  return (
    <Form {...form}>
      <tr className='bg-bgColor'>
        {/* H18: "Allowed" used to render as a checkbox here but was always
            disabled+hardcoded true on submit regardless of what it showed — a
            new code is always created allowed, so this is a static label, not a
            dead control pretending to be live. */}
        <td className='border border-r border-textInactiveColor px-0'>
          <div className='flex justify-center'>
            <Text variant='inactive' size='small'>
              new
            </Text>
          </div>
        </td>
        <td className='border border-r border-textInactiveColor text-center px-2'>
          <div className='flex items-center gap-1'>
            <InputField
              name='code'
              label='Code'
              srLabel
              placeholder='promo code'
              className='w-full text-center border-none'
            />
            {/* H5: was a bare hand-typed input with no generate action and no
                uniqueness feedback before submit. */}
            <Button
              type='button'
              size='lg'
              variant='simple'
              className='shrink-0 whitespace-nowrap px-1.5'
              onClick={() =>
                form.setValue('code', generatePromoCode(), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              generate
            </Button>
          </div>
          {isDuplicate && (
            <Text variant='error' size='small'>
              code already exists
            </Text>
          )}
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
            <Button
              size='lg'
              variant='main'
              className='w-full'
              onClick={() => {
                onCancel();
                form.reset(emptyPromoDraft);
              }}
            >
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    </Form>
  );
}
