import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import FieldsGroupContainer from 'ui/components/fields-group';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { getUniqueCountries } from '../utility/constant';

export function ShippingFieldsGroup({ prefix }: { prefix: string }) {
  const { dictionary } = useDictionary();
  const countryItems = useMemo(
    () => getUniqueCountries().map((c) => ({ value: c.countryCode, label: c.name })),
    [],
  );

  const carrierItems = useMemo(
    () =>
      (dictionary?.shipmentCarriers ?? []).map((c) => ({
        value: c.id!,
        label: c.shipmentCarrier?.carrier ?? String(c.id),
      })),
    [dictionary?.shipmentCarriers],
  );

  return (
    <FieldsGroupContainer stage='2/3' title='shipping address/delivery method'>
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
          label='shipping method'
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
