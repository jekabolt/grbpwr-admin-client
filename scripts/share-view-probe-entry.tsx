// Стенд ПУБЛИЧНОЙ СТРАНИЦЫ ПРИСЛАННОЙ ССЫЛКИ (/f/:token) — настоящая страница, настоящий
// разметчик, поддельный только сервер.
//
// Дерево вокруг — то же, что в `index.tsx`: страница лежит ВНУТРИ QueryClientProvider и роутера
// (маршрут публичный, но провайдеры приложения общие) и СНАРУЖИ ProtectedRoute, Layout и
// DictionaryProvider. Это важно не для красоты: именно потому, что react-query здесь есть,
// «публичная страница не ходит за файлами библиотеки» — утверждение о КОДЕ СТРАНИЦЫ, а не о том,
// что запросить было нечем.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { FileShareViewerPage } from 'components/file-share-viewer/page';

type Probe = {
  mount: (token: string) => void;
  /** Текст страницы целиком — читается с живого DOM. */
  text: () => string;
  /** Что и как нарисовано: счётчики узлов, по которым видно РЕЖИМ показа. */
  facts: () => {
    h1: string[];
    plates: string[];
    iframes: string[];
    videos: string[];
    images: string[];
    links: string[];
  };
};

declare global {
  interface Window {
    __shareView: Probe;
  }
}

const probe = {} as Probe;
window.__shareView = probe;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

probe.text = () => document.body.innerText ?? '';
probe.facts = () => ({
  h1: Array.from(document.querySelectorAll('h1')).map((e) => e.textContent ?? ''),
  // Плашка на месте картинки: у неё капитель и рамка — опознаётся по классу примитива, потому
  // что своей метки у неё нет и заводить её ради пробы нельзя.
  plates: Array.from(document.querySelectorAll('span.uppercase.border')).map(
    (e) => e.textContent ?? '',
  ),
  iframes: Array.from(document.querySelectorAll('iframe')).map((e) => e.getAttribute('src') ?? ''),
  videos: Array.from(document.querySelectorAll('video')).map((e) => e.getAttribute('src') ?? ''),
  images: Array.from(document.querySelectorAll('img')).map((e) => e.getAttribute('src') ?? ''),
  links: Array.from(document.querySelectorAll('a')).map((e) => e.getAttribute('href') ?? ''),
});

probe.mount = (token) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/f/${token}`]}>
        <Routes>
          <Route path='/f/:token' element={<FileShareViewerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
