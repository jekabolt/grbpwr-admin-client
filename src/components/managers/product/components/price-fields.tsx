import { CURRENCIES, currencySymbols } from 'constants/constants';
import { useEffect } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

export function PriceFields({ editMode }: { editMode: boolean }) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();
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
            let value = existingPrice.price?.value ?? '0';
            if (currency.value === 'JPY' || currency.value === 'KRW') {
              const n = parseFloat(value);
              value = (!Number.isNaN(n) ? Math.round(n) : 0).toString();
            }
            return {
              currency: String(existingPrice.currency),
              price: { value },
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

  const filledCount = CURRENCIES.filter((currency) => {
    const priceIndex = prices.findIndex((price: any) => price?.currency === currency.value);
    const value = priceIndex >= 0 ? prices[priceIndex]?.price?.value : undefined;
    return value != null && value !== '' && parseFloat(value) > 0;
  }).length;

  // Live sale-price preview: surfaces fractional results for integer-only currencies (JPY/KRW).
  const saleRaw = watch('product.productBodyInsert.salePercentage.value');
  const sale = Math.max(0, Math.min(99, parseFloat((saleRaw as string) ?? '0') || 0));

  const salePreview = (currencyValue: string) => {
    const pi = prices.findIndex((p: any) => p?.currency === currencyValue);
    const base = parseFloat((pi >= 0 ? prices[pi]?.price?.value : '0') || '0') || 0;
    if (sale <= 0 || base <= 0) return null;
    const isInt = currencyValue === 'JPY' || currencyValue === 'KRW';
    const value = (base * (100 - sale)) / 100;
    return { value, isInt, fractional: isInt && !Number.isInteger(value) };
  };
  const formatSale = (v: number, isInt: boolean) =>
    isInt ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v.toFixed(2);
  const anyFractionalSale = sale > 0 && CURRENCIES.some((c) => salePreview(c.value)?.fractional);

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <Text>prices</Text>
        <Text variant={filledCount === CURRENCIES.length ? 'default' : 'inactive'} size='small'>
          {filledCount}/{CURRENCIES.length} set
        </Text>
      </div>

      <div className='grid grid-cols-2 gap-x-4 gap-y-3 border border-textColor p-3 sm:grid-cols-3'>
        {CURRENCIES.map((currency) => {
          const priceIndex = prices.findIndex((price: any) => price?.currency === currency.value);
          const isIntegerCurrency = currency.value === 'JPY' || currency.value === 'KRW';
          const step = isIntegerCurrency ? '1' : '0.01';
          const placeholder = isIntegerCurrency ? '0' : '0.00';
          const symbol = currencySymbols[currency.value] ?? '';

          const actualIndex = priceIndex >= 0 ? priceIndex : CURRENCIES.indexOf(currency);

          return (
            <div key={currency.id} className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                {currency.value} {symbol}
              </Text>
              <InputField
                name={`prices.${actualIndex}.price.value`}
                type='number'
                step={step}
                min='0'
                placeholder={placeholder}
                readOnly={!editMode}
                className='w-full'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const fieldName = `prices.${actualIndex}.price.value`;
                  handlePriceChange(fieldName, e.target.value, currency.value, actualIndex);
                }}
              />
              {(() => {
                const sp = salePreview(currency.value);
                if (!sp) return null;
                return (
                  <Text
                    size='small'
                    className={sp.fractional ? 'text-warning' : 'text-textInactiveColor'}
                  >
                    −{sale}% → {symbol}
                    {formatSale(sp.value, sp.isInt)}
                    {sp.fractional ? ' · not whole' : ''}
                  </Text>
                );
              })()}
            </div>
          );
        })}
      </div>
      {anyFractionalSale && (
        <Text size='small' className='text-warning' role='alert'>
          JPY / KRW sale price must be a whole number — adjust the base price or sale % so the
          discount divides evenly.
        </Text>
      )}
      {typeof errors.prices?.message === 'string' && (
        <Text className='text-error' role='alert'>
          {errors.prices.message}
        </Text>
      )}
    </div>
  );
}
