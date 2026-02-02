import { currencySymbols } from 'constants/constants';
import useFilter from 'lib/useFilter';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';

const CURRENCY_ITEMS = Object.entries(currencySymbols).map(([value, symbol]) => ({
  value,
  label: `${value} ${symbol}`,
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
