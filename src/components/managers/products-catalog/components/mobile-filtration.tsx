import { Categories } from './categories';
import { MobileFilter } from './mobile-filter';

export function MobileFiltration() {
  return (
    <div className='w-full overflow-x-scroll space-y-6'>
      <Categories />
      <MobileFilter />
    </div>
  );
}
