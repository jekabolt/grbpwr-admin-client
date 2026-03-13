import { cn } from 'lib/utility';
import { useFormContext } from 'react-hook-form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';

export function BillingFieldsGroup() {
  const { watch } = useFormContext();
  const billingSameAsShipping = watch('billingSameAsShipping');

  return (
    <div
      className={cn('w-full space-y-6', {
        'space-y-8': !billingSameAsShipping,
      })}
    >
      <CheckboxField name='billingSameAsShipping' label='Billing address same as shipping' />
      {!billingSameAsShipping && (
        <div className='grid gap-6'>
          <InputField name='billingAddress.addressLineOne' label='street and house number' />
          <InputField name='billingAddress.country' label='country' />
          <InputField name='billingAddress.state' label='state' />
          <InputField name='billingAddress.city' label='city' />
          <InputField name='billingAddress.addressLineTwo' label='additional address' />
          <InputField name='billingAddress.company' label='company' />
          <InputField name='billingAddress.postalCode' label='postal code' />
        </div>
      )}
    </div>
  );
}
