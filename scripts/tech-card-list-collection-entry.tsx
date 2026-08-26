// Точка входа пробы фасета КОЛЛЕКЦИИ в листе тех-карт (вторая половина п.10 волны ux-0825).
//
// Лист НАСТОЯЩИЙ и целиком: чип — его внутренний орган (`PickerChip` наружу не экспортируется),
// пул коллекций живёт в его же состоянии, а сужение уходит через его же useInfiniteTechCards.
// Проверять это в отрыве значило бы проверять копию. Стенд даёт роутер (все фильтры живут в URL),
// react-query, словарь и перехваченную сеть — ровно как у пробы чипа purpose по соседству.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { TechCardList } from 'components/managers/tech-cards/components/tech-card-list';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

type Probe = { mount: () => void };
declare global {
  interface Window {
    __collectionList: Probe;
  }
}
const probe = {} as Probe;
window.__collectionList = probe;

probe.mount = () => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(el).render(
    <MemoryRouter initialEntries={['/tech-cards']}>
      <DictionaryProvider>
        <QueryClientProvider client={qc}>
          <TechCardList />
        </QueryClientProvider>
      </DictionaryProvider>
    </MemoryRouter>,
  );
};
