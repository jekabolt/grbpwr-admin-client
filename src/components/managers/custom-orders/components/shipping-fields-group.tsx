import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import FieldsGroupContainer from 'ui/components/fields-group';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { getUniqueCountries } from '../utility/constant';

export function ShippingFieldsGroup({ prefix }: { prefix: string }) {
  const { dictionary } = useDictionary();
  const { watch, setValue } = useFormContext();
  const countryItems = useMemo(
    () => getUniqueCountries().map((c) => ({ value: c.countryCode, label: c.name })),
    [],
  );

  const carrierItems = useMemo(
    () =>
      (dictionary?.shipmentCarriers ?? [])
        .filter((c) => c.shipmentCarrier?.allowed === true)
        .map((c) => ({
          value: c.id!,
          label: c.shipmentCarrier?.carrier ?? String(c.id),
        })),
    [dictionary?.shipmentCarriers],
  );

  // The dictionary already carries a priced rate per carrier — auto-fill the cost whenever the
  // carrier changes (including the initial default selection) instead of making the operator
  // recall/type it from memory. The field stays a normal, editable InputField below so real
  // overrides are still possible.
  const shipmentCarrierId = watch('shipmentCarrierId');
  useEffect(() => {
    if (!shipmentCarrierId) return;
    const carrier = dictionary?.shipmentCarriers?.find((c) => c.id === shipmentCarrierId);
    const price = carrier?.prices?.find((p) => p.currency === dictionary?.baseCurrency);
    if (price?.price?.value != null) {
      setValue('shipmentCost.value', price.price.value);
    }
  }, [shipmentCarrierId, dictionary?.shipmentCarriers, dictionary?.baseCurrency, setValue]);

  return (
    <FieldsGroupContainer stage='2/3' isOpen title='shipping address/delivery method'>
      <div className='space-y-6'>
        <div className='grid grid-cols-2 gap-6'>
          <div className='col-span-1'>
            <InputField name='buyer.firstName' label='first name' />
          </div>
          <div className='col-span-1'>
            <InputField name='buyer.lastName' label='last name' />
          </div>
        </div>
        <InputField name={`${prefix}Address.addressLineOne`} label='street and house number' />
        <SelectField name={`${prefix}Address.country`} label='country' items={countryItems} />
        <InputField name={`${prefix}Address.state`} label='state' />
        <InputField name={`${prefix}Address.city`} label='city' />
        <InputField name={`${prefix}Address.addressLineTwo`} label='additional address' />
        <InputField name={`${prefix}Address.company`} label='company' />
        <InputField name='buyer.phone' label='phone' />
        <InputField name={`${prefix}Address.postalCode`} label='postal code' />
        <SelectField
          name='paymentMethod'
          label='payment method'
          items={[
            { value: 'PAYMENT_METHOD_NAME_ENUM_BANK_INVOICE', label: 'Bank invoice' },
            { value: 'PAYMENT_METHOD_NAME_ENUM_CASH', label: 'Cash' },
          ]}
        />
        <SelectField
          name='shipmentCarrierId'
          label='Shipment carrier'
          items={carrierItems}
          valueAsNumber
        />
        <InputField name='shipmentCost.value' label='Shipment cost' placeholder='0.00' />
      </div>
    </FieldsGroupContainer>
  );
}
