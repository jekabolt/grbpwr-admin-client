import { common_GenderEnum } from 'api/proto-http/admin';
import Selector from 'ui/components/selector';
import useFilter from './useFilter';

const genderOptions: Array<{ value: common_GenderEnum; label: string }> = [
  { value: 'GENDER_ENUM_FEMALE', label: 'women' },
  { value: 'GENDER_ENUM_MALE', label: 'men' },
  { value: 'GENDER_ENUM_UNISEX', label: 'unisex' },
];

export default function Gender() {
  const { defaultValue, handleFilterChange } = useFilter('gender');

  return (
    <Selector
      label='gender'
      value={defaultValue || []}
      options={genderOptions}
      onChange={handleFilterChange}
      showAll
    />
  );
}
