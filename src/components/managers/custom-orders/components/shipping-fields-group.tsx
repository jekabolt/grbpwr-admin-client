import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { GroupLabel } from 'ui/components/group-label';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { getUniqueCountries } from '../utility/constant';

// custFlow v2 — the delivery address plus carrier/cost, as a plain field stack (no accordion stage).
// Buyer name moved to contact and the payment method to its own section; this step is purely "where
// it ships and how".
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
    <div className='flex flex-col gap-4'>
      <GroupLabel flush>shipping address</GroupLabel>
      <InputField name={`${prefix}Address.addressLineOne`} label='street and house number' />
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <SelectField name={`${prefix}Address.country`} label='country' items={countryItems} />
        <InputField name={`${prefix}Address.state`} label='state' />
        <InputField name={`${prefix}Address.city`} label='city' />
        <InputField name={`${prefix}Address.postalCode`} label='postal code' />
      </div>
      <InputField name={`${prefix}Address.addressLineTwo`} label='additional address' />
      <InputField name={`${prefix}Address.company`} label='company' />

      <GroupLabel>delivery</GroupLabel>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <SelectField
          name='shipmentCarrierId'
          label='shipment carrier'
          items={carrierItems}
          valueAsNumber
        />
        <InputField name='shipmentCost.value' label='shipment cost' placeholder='0.00' />
      </div>
    </div>
  );
}
