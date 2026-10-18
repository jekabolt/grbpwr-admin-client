import { Input } from 'ui';
import useFilter from '../../../../lib/useFilter';
export default function Tag() {
  const { defaultValue, handleFilterChange } = useFilter('tag');

  return (
    <div>
      <Input
        type='text'
        name='tag'
        placeholder='enter tag'
        value={defaultValue || ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterChange(e.target.value)}
      />
    </div>
  );
}
