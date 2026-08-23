import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MarkdownView } from 'components/managers/files/note/markdown-view';

const SOURCE = [
  '# ткани',
  '',
  'ссылкой без восклицательного знака: [фото ткани](https://pics.local/a.jpg)',
  '',
  'объявленная картинка: ![подпись](https://pics.local/b.png)',
  '',
  'не картинка: [спецификация](https://pics.local/doc.pdf)',
  '',
  'битая: [битая](https://pics.local/missing.jpg)',
  '',
  'та же самая ещё раз: [ещё раз](https://pics.local/a.jpg)',
  '',
  '```',
  'внутри ограды: [код](https://pics.local/c.jpg)',
  '```',
].join('\n');

// Провайдер файлов спрашивает библиотеку через react-query; в этом документе таких ссылок нет,
// но провайдер монтируется всегда.
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter>
      <MarkdownView source={SOURCE} />
    </MemoryRouter>
  </QueryClientProvider>,
);
