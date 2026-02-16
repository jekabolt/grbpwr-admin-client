import { CURRENCIES, currencySymbols } from 'constants/constants';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

export function CarrierPrices({ carrierIndex }: { carrierIndex: number }) {
  const { setValue } = useFormContext();

  const handleShipmentPriceChange = (
    carrierIndex: number,
    currency: string,
    value: string | number,
  ) => {
    let stringValue = typeof value === 'number' ? value.toString() : value || '0';

    if (currency === 'JPY' || currency === 'KRW') {
      const numValue = parseFloat(stringValue);
      if (!isNaN(numValue)) {
        stringValue = Math.round(numValue).toString();
      }
    }

    setValue(`shipmentCarriers.${carrierIndex}.prices.${currency}.value`, stringValue, {
      shouldDirty: true,
    });
  };
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full lg:w-auto table-fixed border-collapse border-2 border-textColor'>
        <thead className='bg-textInactiveColor'>
          <tr>
            {CURRENCIES.map((c) => (
              <th key={c.id} className='border border-textColor px-1 py-1 lg:w-[64px]'>
                <Text>{currencySymbols[c.value]}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='bg-white'>
          <tr>
            {CURRENCIES.map((currency) => {
              const isIntegerCurrency = currency.value === 'JPY' || currency.value === 'KRW';
              const placeholder = isIntegerCurrency ? '0' : '0.00';

              return (
                <td key={currency.id} className='border border-textColor px-1 py-1 lg:w-[64px]'>
                  <InputField
                    name={`shipmentCarriers.${carrierIndex}.prices.${currency.value}.value`}
                    placeholder={placeholder}
                    className='w-full border-none text-center'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      handleShipmentPriceChange(carrierIndex, currency.value, e.target.value);
                    }}
                  />
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
