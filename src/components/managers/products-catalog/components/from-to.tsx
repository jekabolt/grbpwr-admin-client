import Input from 'ui/components/input';
import useFilter from './useFilter';

export default function FromTo() {
  const { defaultValue: from, handleFilterChange: handleFromChange } = useFilter('from');
  const { defaultValue: to, handleFilterChange: handleToChange } = useFilter('to');

  return (
    <div className='flex gap-3'>
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
  );
}
