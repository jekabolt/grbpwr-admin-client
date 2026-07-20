import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { getUniqueCountries } from '../utility/constant';

export function BillingFieldsGroup() {
  const { watch } = useFormContext();
  const billingSameAsShipping = watch('billingSameAsShipping');
  const countryItems = useMemo(
    () => getUniqueCountries().map((c) => ({ value: c.countryCode, label: c.name })),
    [],
  );

  return (
    <div
      className={cn('w-full space-y-6', {
        'space-y-8': !billingSameAsShipping,
      })}
    >
      <InputField name='buyerVatId' label='VAT ID (B2B)' />
      <CheckboxField name='billingSameAsShipping' label='Billing address same as shipping' />
      {!billingSameAsShipping && (
        <div className='grid gap-6'>
          <InputField name='billingAddress.addressLineOne' label='street and house number' />
          <SelectField name='billingAddress.country' label='country' items={countryItems} />
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
