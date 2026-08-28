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

import { SnackBar } from 'ui/components/snackbar';

import { FormatBar } from 'components/managers/files/note/format-bar';
import { mediaEdit } from 'components/managers/files/note/format-edits';
import { MarkdownView } from 'components/managers/files/note/markdown-view';

type MountOpts = {
  /**
   * Высота поля. Редактор заметки даёт сырой `<textarea class='min-h-[60vh] resize-y'>` — то есть
   * поле ВЫШЕ вьюпорта бывает и там, безо всякого автогроу: его тянут мышью, а 60vh — только пол.
   */
  heightPx?: number;
  /** Сколько страницы стоит НАД редактором: без прокручиваемой страницы ронять нечего. */
  spacerPx?: number;
  /**
   * Липкая полоса. В редакторе заметки полоса стоит В ПОТОКЕ прямо над полем — значит кнопка
   * достижима только пока верх поля на экране. Липкая полоса снимает это ограничение: кнопка
   * жмётся и тогда, когда поле ушло верхом выше вьюпорта. Это конфигурация соседней ветки.
   */
  stickyBar?: boolean;
};

type BarProbe = {
  mount: (opts?: MountOpts) => void;
  /** Прокрутка страницы — то, что и мерится. Каретка тут ни при чём. */
  scrollTo: (y: number) => void;
  scrollY: () => number;
  /** Стоит ли фокус в поле: у настоящей кнопки он оттуда не уходит (`onMouseDown` гасит уход). */
  focused: () => boolean;
  blur: () => void;
  /** Что лежит в поле — читается С ЖИВОГО УЗЛА, а не из состояния react. */
  text: () => string;
  /** Что думает страница: проп `value` обязан совпасть с полем, иначе правка «не случилась». */
  value: () => string;
  select: (start: number, end: number) => void;
  set: (text: string, start: number, end: number) => void;
  caret: () => [number, number];
  /**
   * Что НАСТОЯЩАЯ `mediaEdit` кладёт в текст. Нужна не сама по себе: ниже этот текст уходит в
   * НАСТОЯЩИЙ разметчик, потому что разница между рядом и столбцом видна только в отрисовке —
   * таблица строк её не ловит по устройству.
   */
  insertMedia: (text: string, at: number, items: { id: number; url: string }[]) => string;
  /** Показать произвольный текст живым разметчиком. */
  render: (source: string) => void;
};

declare global {
  interface Window {
    __formatBar: BarProbe;
  }
}

const probe = {} as BarProbe;
window.__formatBar = probe;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

probe.insertMedia = (text, at, items) => {
  const edit = mediaEdit(text, at, at, items);
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
};

probe.scrollTo = (y) => window.scrollTo(0, y);
probe.scrollY = () => Math.round(window.scrollY);

function Harness({ opts }: { opts: MountOpts }) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  probe.render = (source) => setNote(source);

  probe.value = () => value;
  probe.text = () => areaRef.current?.value ?? '';
  probe.focused = () => document.activeElement === areaRef.current;
  probe.blur = () => areaRef.current?.blur();
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
      {/* Страница НАД редактором: дефект в том, что прокрутка страницы падает в ноль, и без
          страницы, которую можно прокрутить, мерить нечего. */}
      <div style={{ height: opts.spacerPx ?? 1200, background: 'repeating-linear-gradient(#fff 0 20px,#eee 20px 40px)' }}>
        page above the editor
      </div>
      <div style={opts.stickyBar ? { position: 'sticky', top: 0, zIndex: 5, background: '#fff' } : undefined}>
        <FormatBar areaRef={areaRef} value={value} onChange={setValue} />
      </div>
      <textarea
        data-area
        ref={areaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        style={{ width: 600, height: opts.heightPx ?? 300 }}
      />
      <div data-note style={{ width: 600 }}>
        <MarkdownView source={note} />
      </div>
      <div style={{ height: 1200 }}>page below the editor</div>
      {/* Всплывающие сообщения — НЕ УКРАШЕНИЕ СТЕНДА: отказ кнопки режима таблицы («последний
          столбец остаётся») только словами и существует, и без этого узла проверять было бы
          нечего, кроме «текст не изменился» — то есть неотличимо от кнопки, которая ничего не
          делает. */}
      <SnackBar />
    </div>
  );
}

probe.mount = (opts = {}) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/notes/1']}>
        <Harness opts={opts} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
