import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { getUniqueCountries } from '../utility/constant';

// custFlow v2 — billing, as a plain field stack. VAT id drives the B2B / reverse-charge path on the
// backend; the checkbox reuses the shipping address unless the operator opts to enter a separate one.
export function BillingFieldsGroup() {
  const { watch } = useFormContext();
  const billingSameAsShipping = watch('billingSameAsShipping');
  const countryItems = useMemo(
    () => getUniqueCountries().map((c) => ({ value: c.countryCode, label: c.name })),
    [],
  );

  return (
    <div className='flex flex-col gap-4'>
      <InputField name='buyerVatId' label='VAT ID (B2B)' />
      <CheckboxField name='billingSameAsShipping' label='billing address same as shipping' />
      {!billingSameAsShipping && (
        <div className='flex flex-col gap-4'>
          <InputField name='billingAddress.addressLineOne' label='street and house number' />
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <SelectField name='billingAddress.country' label='country' items={countryItems} />
            <InputField name='billingAddress.state' label='state' />
            <InputField name='billingAddress.city' label='city' />
            <InputField name='billingAddress.postalCode' label='postal code' />
          </div>
          <InputField name='billingAddress.addressLineTwo' label='additional address' />
          <InputField name='billingAddress.company' label='company' />
        </div>
      )}
    </div>
  );
}
