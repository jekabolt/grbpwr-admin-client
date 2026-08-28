// Стенд «загрузил медиа в модалке» — НАСТОЯЩИЙ выбор медиа внутри НАСТОЯЩЕЙ модалки с полями.
//
// Две претензии владельца проверяются одним экраном, потому что они и случаются на одном экране:
//
//  1. «когда в файлах делаешь аплоуд медиа, оно его аттачит два раза: один раз когда залил и
//     находишься в модалке, второй раз когда его селектнул и нажал эдд»;
//  2. «в тасках… когда таску создаешь и хочешь сделать аттач медиа, оно ссылку может не в то поле
//     закинуть».
//
// Поэтому стенд повторяет ФОРМУ СОЗДАНИЯ ЗАДАЧИ по существу, а не по виду: модалка Radix (в ней
// свой захват фокуса), внутри — поле заголовка, поле описания с настоящей панелью форматирования
// (та же `FormatBar`, что у заметок) и отдельный приёмник медиа, который ЗАПИСЫВАЕТ каждый вызов
// владельца. Захват фокуса вложенного диалога поверх захвата модалки — ровно то место, где
// «ссылка уехала не туда» может родиться, и подделать его нечем.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { FormatBar } from 'components/managers/files/note/format-bar';
import Input from 'ui/components/input';
import { SnackBar } from 'ui/components/snackbar';

type TrayProbe = {
  mount: () => void;
  /** Сколько РАЗ позвали владельца выбора и с какими id — это и есть «аттачит два раза». */
  saves: () => number[][];
  /** Текст описания: сюда вставляет панель форматирования. */
  desc: () => string;
  /** Что лежит в поле заголовка. Пусто — ссылка не уехала в чужое поле. */
  title: () => string;
  /** Значения ВСЕХ полей ввода на экране, включая те, что принёс с собой диалог библиотеки. */
  fields: () => { where: string; value: string }[];
  focus: (selector: string) => void;
  /** Куда сейчас смотрит фокус — по-человечески. */
  focused: () => string;
};

declare global {
  interface Window {
    __tray: TrayProbe;
  }
}

const probe = {} as TrayProbe;
window.__tray = probe;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const describe = (el: Element | null): string => {
  if (!el) return 'none';
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id;
  const name = el.getAttribute('name');
  const aria = el.getAttribute('aria-label');
  const text = (el.textContent ?? '').trim().slice(0, 20);
  return `${tag}${id ? `#${id}` : ''}${name ? `[name=${name}]` : ''}${aria ? `[${aria}]` : ''}${
    !id && !name && !aria && text ? `(${text})` : ''
  }`;
};

probe.focused = () => describe(document.activeElement);
probe.focus = (selector) => document.querySelector<HTMLElement>(selector)?.focus();
probe.fields = () =>
  Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .filter((el) => el.type !== 'file' && el.type !== 'checkbox' && el.type !== 'radio')
    .map((el) => ({ where: describe(el), value: el.value }));

function Harness() {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [saves, setSaves] = useState<number[][]>([]);
  const areaRef = { current: null as HTMLTextAreaElement | null };

  probe.saves = () => saves;
  probe.desc = () => desc;
  probe.title = () => title;

  return (
    // Модалка ОТКРЫТА с самого начала и с захватом фокуса — как форма создания задачи.
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 bg-overlay' />
        <DialogPrimitive.Content className='fixed left-1/2 top-1/2 w-[900px] -translate-x-1/2 -translate-y-1/2 border border-borderColor bg-bgColor p-4'>
          <DialogPrimitive.Title className='sr-only'>new task</DialogPrimitive.Title>
          <DialogPrimitive.Description className='sr-only'>harness</DialogPrimitive.Description>

          <div className='flex flex-col gap-3'>
            <Input
              name='title'
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            />

            {/* Описание с НАСТОЯЩЕЙ панелью: у неё внутри и выбор медиа, и вставка в каретку. */}
            <FormatBar areaRef={areaRef} value={desc} onChange={setDesc} />
            <textarea
              data-desc
              name='description'
              ref={(el) => {
                areaRef.current = el;
              }}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className='min-h-24 w-full border border-borderColor'
            />

            {/* Отдельный приёмник — ровно та конфигурация, в которой живут вложения задачи и
                вставка снимков в заметку: лоток и кнопка «add all». */}
            <MediaSelector
              label='attach media'
              purpose='attachment'
              aspectRatio={['Custom']}
              allowMultiple
              showVideos
              saveSelectedMedia={(media: common_MediaFull[]) =>
                setSaves((prev) => [...prev, media.map((m) => Number(m.id))])
              }
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <SnackBar />
    </DialogPrimitive.Root>
  );
}

probe.mount = () => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tasks']}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
