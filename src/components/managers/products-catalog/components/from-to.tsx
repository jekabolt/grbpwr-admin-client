import { currencySymbols, SELLING_CURRENCIES } from 'constants/constants';
import useFilter from 'lib/useFilter';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';

// Catalog price filter runs against colourway SELLING prices, so it offers only selling currencies
// (no USDT — products are never priced in it).
const CURRENCY_ITEMS = SELLING_CURRENCIES.map((c) => ({
  value: c.value,
  label: `${c.value} ${currencySymbols[c.value] ?? ''}`,
}));

export default function FromTo() {
  const { defaultValue: from, handleFilterChange: handleFromChange } = useFilter('from');
  const { defaultValue: to, handleFilterChange: handleToChange } = useFilter('to');
  const { defaultValue: currency, handleFilterChange: handleCurrencyChange } =
    useFilter('currency');

  return (
    <div className='flex'>
      <SelectComponent
        name='currency'
        placeholder='currency'
        items={CURRENCY_ITEMS}
        value={currency || ''}
        onValueChange={(value: string) => handleCurrencyChange(value)}
      />
      <div className='flex gap-3 w-full'>
        <Input
          type='number'
          placeholder='price from'
          name='from'
          value={from || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFromChange(e.target.value)}
        />
        <Input
          type='number'
          placeholder='price to'
          name='to'
          value={to || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToChange(e.target.value)}
        />
      </div>
    </div>
  );
}
