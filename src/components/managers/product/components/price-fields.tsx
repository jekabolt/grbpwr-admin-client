import { useEffect } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

const CURRENCIES = [
  { id: 'EUR', label: 'EUR - Euro', value: 'EUR' },
  { id: 'USD', label: 'USD - US Dollar', value: 'USD' },
  { id: 'GBP', label: 'GBP - British Pound', value: 'GBP' },
  { id: 'JPY', label: 'JPY - Japanese Yen', value: 'JPY' },
  { id: 'CNY', label: 'CNY - Chinese Yuan', value: 'CNY' },
  { id: 'KRW', label: 'KRW - South Korean Won', value: 'KRW' },
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
      const validPrices = prices.filter((price: any) => price !== null && price !== undefined);

      if (
        validPrices.length !== prices.length ||
        validPrices.some((price: any) => typeof price.currency !== 'string')
      ) {
        const updatedPrices = CURRENCIES.map((currency) => {
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
  }, [prices.length, replace]);

  const handlePriceChange = (
    fieldName: string,
    value: string | number,
    currency: string,
    priceIndex: number,
  ) => {
    let stringValue = typeof value === 'number' ? value.toString() : value || '0';

    if (currency === 'JPY' || currency === 'KRW') {
      const numValue = parseFloat(stringValue);
      if (!isNaN(numValue)) {
        stringValue = Math.round(numValue).toString();
      }
    }

    setValue(fieldName, stringValue);

    const currencyField = `prices.${priceIndex}.currency`;
    const currentCurrency = watch(currencyField);
    if (currentCurrency !== currency) {
      setValue(currencyField, currency);
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
                <th key={currency.id} className='border border-inactive'>
                  <Text>{currency.value}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='bg-white'>
            <tr>
              {CURRENCIES.map((currency) => {
                const priceIndex = prices.findIndex(
                  (price: any) => price?.currency === currency.value,
                );
                const isIntegerCurrency = currency.value === 'JPY' || currency.value === 'KRW';
                const step = isIntegerCurrency ? '1' : '0.01';
                const placeholder = isIntegerCurrency ? '0' : '0.00';

                const actualIndex = priceIndex >= 0 ? priceIndex : CURRENCIES.indexOf(currency);

                return (
                  <td key={currency.id} className='px-4 py-3 text-center border border-inactive'>
                    <InputField
                      name={`prices.${actualIndex}.price.value`}
                      type='number'
                      step={step}
                      min='0'
                      placeholder={placeholder}
                      className='text-start w-full'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const fieldName = `prices.${actualIndex}.price.value`;
                        handlePriceChange(fieldName, e.target.value, currency.value, actualIndex);
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
