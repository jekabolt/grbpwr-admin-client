import { SELLING_CURRENCIES, currencySymbols } from 'constants/constants';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

type CarrierPricesProps =
  | {
      basePath: string;
      carrierIndex?: never;
      disabled?: boolean;
    }
  | {
      carrierIndex: number;
      basePath?: undefined;
      disabled?: boolean;
    };

function getErrorAtPath(
  errors: Record<string, unknown>,
  path: string,
): { message?: string } | undefined {
  return path
    .split('.')
    .reduce((acc: unknown, key) => (acc as Record<string, unknown>)?.[key], errors) as
    | { message?: string }
    | undefined;
}

export function CarrierPrices(props: CarrierPricesProps) {
  const {
    setValue,
    formState: { errors },
  } = useFormContext();

  const basePath =
    'basePath' in props && props.basePath
      ? props.basePath
      : `shipmentCarriers.${props.carrierIndex}.prices`;
  const disabled = props.disabled ?? false;

  const tableError = getErrorAtPath(errors as Record<string, unknown>, basePath);

  const handleShipmentPriceChange = (currency: string, value: string | number) => {
    if (disabled) return;
    let stringValue = typeof value === 'number' ? value.toString() : value || '0';

    if (currency === 'JPY' || currency === 'KRW') {
      const numValue = parseFloat(stringValue);
      if (!isNaN(numValue)) {
        stringValue = Math.round(numValue).toString();
      }
    }

    setValue(`${basePath}.${currency}.value`, stringValue, {
      shouldDirty: true,
    });
  };

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-2 gap-x-4 gap-y-3 border border-textInactiveColor p-3 sm:grid-cols-3'>
        {SELLING_CURRENCIES.map((currency) => {
          const isIntegerCurrency = currency.value === 'JPY' || currency.value === 'KRW';
          const step = isIntegerCurrency ? '1' : '0.01';
          const placeholder = isIntegerCurrency ? '0' : '0.00';
          const symbol = currencySymbols[currency.value] ?? '';

          return (
            <div key={currency.id} className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                {currency.value} {symbol}
              </Text>
              <InputField
                name={`${basePath}.${currency.value}.value`}
                type='number'
                step={step}
                min='0'
                placeholder={placeholder}
                className='w-full'
                disabled={disabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  handleShipmentPriceChange(currency.value, e.target.value);
                }}
              />
            </div>
          );
        })}
      </div>
      {tableError?.message && (
        <Text className='text-error' role='alert'>
          {tableError.message}
        </Text>
      )}
    </div>
  );
}
