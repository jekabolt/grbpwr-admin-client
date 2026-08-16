import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import { SortOrder, SORT_ORDERS } from '../utils/useFilter';

/**
 * Поиск и порядок в шапке библиотеки. Тип медиа и соотношение живут в рельсе слева: там у них
 * есть счётчики, а выпадающий список без счётчика не отвечает на вопрос «а есть ли вообще».
 */
export function Filter({
  order,
  search,
  setOrder,
  setSearch,
}: {
  order: SortOrder;
  search: string;
  setOrder: (order: SortOrder) => void;
  setSearch: (search: string) => void;
}) {
  return (
    <div className='flex flex-row flex-wrap gap-2'>
      <div className='w-48'>
        {/* Имени у медиа нет: загрузка отдаёт бакету сырые байты и не сохраняет его (см.
            useUploadMedia). Искать можно только по тому тексту, который у объекта реально
            есть, — по его id и адресу. */}
        <Input
          name='mediaSearch'
          type='text'
          value={search}
          placeholder='id or url'
          aria-label='search the media library'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>
      <div className='w-28'>
        <Selector
          label='Order'
          value={order}
          options={SORT_ORDERS.map((o) => ({ label: o, value: o }))}
          onChange={(value) => setOrder(value)}
        />
      </div>
    </div>
  );
}
