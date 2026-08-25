// Точка входа пробы чипа purpose в листе тех-карт (п.10а волны ux-0825).
//
// Лист НАСТОЯЩИЙ, целиком: чип — его внутренний орган (`PickerChip` наружу не экспортируется), и
// проверять его в отрыве значило бы проверять копию. Стенд даёт роутер (все фильтры живут в URL),
// react-query, словарь и перехваченную сеть.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { TechCardList } from 'components/managers/tech-cards/components/tech-card-list';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

type Probe = { mount: () => void };
declare global {
  interface Window {
    __list: Probe;
  }
}
const probe = {} as Probe;
window.__list = probe;

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
