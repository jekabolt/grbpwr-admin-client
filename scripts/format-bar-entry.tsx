// Стенд панели форматирования: НАСТОЯЩАЯ FormatBar над настоящей textarea.
//
// Таблица входа-выхода (`format-edits-probe`) доказывает, что чистые функции считают правильно.
// Она НЕ доказывает, что кнопка зовёт ту функцию и что правка доезжает до поля: между ними стоит
// `execCommand('insertText')`, запасной `setRangeText` и восстановление каретки — то, что без
// браузера не проверить вовсе. Здесь проверяется ровно этот участок.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { FormatBar } from 'components/managers/files/note/format-bar';

type BarProbe = {
  mount: () => void;
  /** Что лежит в поле — читается С ЖИВОГО УЗЛА, а не из состояния react. */
  text: () => string;
  /** Что думает страница: проп `value` обязан совпасть с полем, иначе правка «не случилась». */
  value: () => string;
  select: (start: number, end: number) => void;
  set: (text: string, start: number, end: number) => void;
  caret: () => [number, number];
};

declare global {
  interface Window {
    __formatBar: BarProbe;
  }
}

const probe = {} as BarProbe;
window.__formatBar = probe;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Harness() {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');

  probe.value = () => value;
  probe.text = () => areaRef.current?.value ?? '';
  probe.caret = () => [areaRef.current?.selectionStart ?? 0, areaRef.current?.selectionEnd ?? 0];
  probe.select = (start, end) => {
    areaRef.current?.focus();
    areaRef.current?.setSelectionRange(start, end);
  };
  probe.set = (text, start, end) => {
    setValue(text);
    const area = areaRef.current;
    if (!area) return;
    area.value = text;
    area.focus();
    area.setSelectionRange(start, end);
  };

  return (
    <div>
      <FormatBar areaRef={areaRef} value={value} onChange={setValue} />
      <textarea
        data-area
        ref={areaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        style={{ width: 600 }}
      />
    </div>
  );
}

probe.mount = () => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/notes/1']}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
