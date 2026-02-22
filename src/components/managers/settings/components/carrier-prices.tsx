import { CURRENCIES } from 'constants/constants';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';

type CarrierPricesProps =
  | {
      basePath: string;
      carrierIndex?: never;
    }
  | {
      carrierIndex: number;
      basePath?: undefined;
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

  const tableError = getErrorAtPath(errors as Record<string, unknown>, basePath);

  const handleShipmentPriceChange = (currency: string, value: string | number) => {
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
    <div className='w-full overflow-x-auto'>
      <table className='w-full lg:w-auto table-fixed border-collapse border-2 border-textColor'>
        <thead className='bg-textInactiveColor'>
          <tr>
            {CURRENCIES.map((c) => (
              <th key={c.id} className='border border-textColor px-1 py-1 lg:w-[64px]'>
                <Text>{c.value}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='bg-white'>
          <tr>
            {CURRENCIES.map((currency) => {
              const isIntegerCurrency = currency.value === 'JPY' || currency.value === 'KRW';
              const step = isIntegerCurrency ? '1' : '0.01';
              const placeholder = isIntegerCurrency ? '0' : '0.00';

              return (
                <td key={currency.id} className='border border-textColor px-1 py-1 lg:w-[64px]'>
                  <InputField
                    name={`${basePath}.${currency.value}.value`}
                    type='number'
                    step={step}
                    min='0'
                    placeholder={placeholder}
                    className='w-full border-none text-center'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      handleShipmentPriceChange(currency.value, e.target.value);
                    }}
                  />
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {tableError?.message && (
        <Text className='text-error' role='alert'>
          {tableError.message}
        </Text>
      )}
    </div>
  );
}
