import { useEffect } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

const CURRENCIES = [
  { label: 'USD - US Dollar', value: 'USD' },
  { label: 'EUR - Euro', value: 'EUR' },
  { label: 'GBP - British Pound', value: 'GBP' },
  { label: 'JPY - Japanese Yen', value: 'JPY' },
  { label: 'CNY - Chinese Yuan', value: 'CNY' },
  { label: 'KRW - South Korean Won', value: 'KRW' },
];

export function PriceFields() {
  const { control, watch, setValue } = useFormContext();
  const { replace } = useFieldArray({
    control,
    name: 'prices',
  });

  const prices = watch('prices') || [];

  useEffect(() => {
    if (prices.length === 0) {
      const initialPrices = CURRENCIES.map((currency) => ({
        currency: currency.value,
        price: { value: '0' },
      }));
      replace(initialPrices);
    } else {
      // Filter out null/undefined entries and ensure all prices have currency as string
      const validPrices = prices.filter((price: any) => price !== null && price !== undefined);

      if (
        validPrices.length !== prices.length ||
        validPrices.some((price: any) => typeof price.currency !== 'string')
      ) {
        // Rebuild prices array ensuring proper structure
        const updatedPrices = CURRENCIES.map((currency, index) => {
          const existingPrice = validPrices.find((p: any) => p?.currency === currency.value);
          if (existingPrice) {
            return {
              currency: String(existingPrice.currency),
              price: { value: existingPrice.price?.value || '0' },
            };
          }
          return {
            currency: currency.value,
            price: { value: '0' },
          };
        });
        replace(updatedPrices);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices.length, replace]);

  const handlePriceChange = (fieldName: string, value: string | number, currency: string) => {
    // Ensure value is always a string
    const stringValue = typeof value === 'number' ? value.toString() : value || '0';
    setValue(fieldName, stringValue);

    // Ensure currency is set for this price entry
    const fieldPath = fieldName.split('.');
    const priceIndex = parseInt(fieldPath[1]);
    if (!isNaN(priceIndex)) {
      const currencyField = `prices.${priceIndex}.currency`;
      const currentCurrency = watch(currencyField);
      if (currentCurrency !== currency) {
        setValue(currencyField, currency);
      }
    }
  };

  return (
    <div className='space-y-3'>
      <Text>prices</Text>

      <div className='border border-inactive overflow-hidden'>
        <table className='w-full'>
          <thead className='bg-gray-50'>
            <tr>
              {CURRENCIES.map((currency) => (
                <th key={currency.value} className='border border-inactive'>
                  <Text>{currency.value}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='bg-white'>
            <tr>
              {CURRENCIES.map((currency, index) => {
                const priceIndex = prices.findIndex(
                  (price: any) => price?.currency === currency.value,
                );
                const actualIndex = priceIndex >= 0 ? priceIndex : index;

                return (
                  <td key={currency.value} className='px-4 py-3 text-center border border-inactive'>
                    <InputField
                      name={`prices.${actualIndex}.price.value`}
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='0.00'
                      className='text-start w-full'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const fieldName = `prices.${actualIndex}.price.value`;
                        handlePriceChange(fieldName, e.target.value, currency.value);
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
