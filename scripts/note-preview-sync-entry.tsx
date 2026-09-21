// Стенд «показ едет за кареткой»: НАСТОЯЩИЙ `NoteEditor` со своим полем и своим показом.
//
// Проверять тут нечего без браузера по устройству вопроса: «превью переместилось в то же место» —
// это прокрутка внутреннего контейнера относительно коробки блока, то есть три величины, которых
// вне вёрстки не существует. Поэтому берётся компонент целиком, а не выдержка из него: и поле, и
// разметчик, и обе колонки — те самые.
//
// СТИЛИ АДМИНКИ ОБЯЗАТЕЛЬНЫ. Без них `overflow-y-auto` и `lg:inset-0` — просто буквы в атрибуте,
// показ не прокручивается вовсе, и любая проверка «встал на место» была бы зелёной на пустом
// месте. Проба грузит собранный `dist/assets/*.css` и без него ЧЕСТНО пропускается.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { NoteEditor } from 'components/managers/files/note/note-editor';

type Metrics = { scrollTop: number; clientHeight: number; scrollHeight: number; room: number };
type Box = { line: number; top: number; bottom: number; visible: boolean } | null;
type Rect = { x: number; y: number; w: number; h: number } | null;

type SyncProbe = {
  mount: () => void;
  /** Текст заметки — как его ставит страница: пропом, а не в обход react. */
  set: (text: string) => void;
  value: () => string;
  /** Фокус в поле и каретка в начало строки `line` (нумерация с нуля, как у `data-md-line`). */
  caretTo: (line: number) => void;
  /** Строка, в которой стоит каретка ПРЯМО СЕЙЧАС — считается по живому полю. */
  caretLine: () => number;
  focused: () => boolean;
  /** Увести фокус в соседнее поле имени: оно тут же, в шапке редактора. */
  focusName: () => void;
  pane: () => Metrics;
  paneScrollTo: (y: number) => void;
  /** Номера строк у всех якорей показа, по порядку. */
  anchorLines: () => number[];
  /** Коробка якоря относительно окна показа + видно ли его ЦЕЛИКОМ. */
  anchor: (line: number) => Box;
  /** Якоря, видные целиком, — независимый ответ на вопрос «что сейчас на экране показа». */
  visible: () => number[];
  /* ── обратная подводка: показ ведёт поле ── */
  /** Прокрутка САМОГО ПОЛЯ — то, что мерится в обратную сторону. */
  area: () => Metrics;
  areaScrollTo: (y: number) => void;
  /** Высота строки поля в px: у заметки без переносов верх строки N — ровно N × lh. */
  lineHeight: () => number;
  /** Коробка окна показа в координатах вьюпорта — чтобы крутить колесо и щёлкать по-настоящему. */
  paneBox: () => Rect;
  /** Коробка ПЕРВОГО вхождения слова в блоке строки `line` (координаты вьюпорта). */
  wordBox: (line: number, word: string) => Rect;
  /** Верхний блок показа и доля, на которую он ушёл за кромку, — прочитано с вёрстки показа. */
  topBlock: () => { line: number; next: number; share: number } | null;
  caret: () => number;
  lineStart: (line: number) => number;
  lineCount: () => number;
};

declare global {
  interface Window {
    __notePreview: SyncProbe;
  }
}

const probe = {} as SyncProbe;
window.__notePreview = probe;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const area = () => document.querySelector<HTMLTextAreaElement>('textarea[name="noteContent"]');

/**
 * Окно показа ищется ОТ ЯКОРЯ ВВЕРХ, а не по классу и не по метке для пробы.
 *
 * Метка в разметке ради пробы — это уже не та разметка, что на проде; класс же тут менялся бы
 * вместе с вёрсткой. Прокручиваемый предок у блока ровно один, и он же — тот контейнер, чью
 * прокрутку правит редактор.
 */
function pane(): HTMLElement | null {
  let el = document.querySelector<HTMLElement>('[data-md-line]')?.parentElement ?? null;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
}

probe.pane = () => {
  const p = pane();
  if (!p) return { scrollTop: -1, clientHeight: -1, scrollHeight: -1, room: -1 };
  return {
    scrollTop: Math.round(p.scrollTop),
    clientHeight: Math.round(p.clientHeight),
    scrollHeight: Math.round(p.scrollHeight),
    room: Math.round(p.scrollHeight - p.clientHeight),
  };
};
probe.paneScrollTo = (y) => {
  const p = pane();
  if (p) p.scrollTop = y;
};
probe.anchorLines = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-md-line]')).map((el) =>
    Number(el.dataset.mdLine),
  );
probe.anchor = (line) => {
  const p = pane();
  const el = document.querySelector<HTMLElement>(`[data-md-line="${line}"]`);
  if (!p || !el) return null;
  const box = p.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    line,
    top: Math.round(r.top - box.top),
    bottom: Math.round(r.bottom - box.top),
    visible: r.top >= box.top && r.bottom <= box.bottom,
  };
};
probe.visible = () => {
  const p = pane();
  if (!p) return [];
  const box = p.getBoundingClientRect();
  return Array.from(document.querySelectorAll<HTMLElement>('[data-md-line]'))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= box.top && r.bottom <= box.bottom;
    })
    .map((el) => Number(el.dataset.mdLine));
};
probe.focused = () => document.activeElement === area();
probe.area = () => {
  const a = area();
  if (!a) return { scrollTop: -1, clientHeight: -1, scrollHeight: -1, room: -1 };
  return {
    scrollTop: Math.round(a.scrollTop),
    clientHeight: Math.round(a.clientHeight),
    scrollHeight: Math.round(a.scrollHeight),
    room: Math.round(a.scrollHeight - a.clientHeight),
  };
};
probe.areaScrollTo = (y) => {
  const a = area();
  if (a) a.scrollTop = y;
};
probe.lineHeight = () => {
  const a = area();
  return a ? parseFloat(getComputedStyle(a).lineHeight) : NaN;
};
const rect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
probe.paneBox = () => {
  const p = pane();
  return p ? rect(p.getBoundingClientRect()) : null;
};
probe.wordBox = (line, word) => {
  const el = document.querySelector<HTMLElement>(`[data-md-line="${line}"]`);
  if (!el) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = (n as Text).data.indexOf(word);
    if (at < 0) continue;
    const r = document.createRange();
    r.setStart(n, at);
    r.setEnd(n, at + word.length);
    return rect(r.getBoundingClientRect());
  }
  return null;
};
probe.lineCount = () => (area()?.value ?? '').split('\n').length;
probe.topBlock = () => {
  const p = pane();
  if (!p) return null;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-md-line]'));
  if (!blocks.length) return null;
  const box = p.getBoundingClientRect();
  let i = blocks.findIndex((el) => el.getBoundingClientRect().bottom > box.top);
  if (i < 0) i = blocks.length - 1;
  const r = blocks[i].getBoundingClientRect();
  return {
    line: Number(blocks[i].dataset.mdLine),
    next: i + 1 < blocks.length ? Number(blocks[i + 1].dataset.mdLine) : probe.lineCount(),
    share: r.height > 0 ? Math.max(0, Math.min(1, (box.top - r.top) / r.height)) : 0,
  };
};
probe.caret = () => area()?.selectionStart ?? -1;
probe.lineStart = (line) => {
  const lines = (area()?.value ?? '').split('\n');
  let at = 0;
  for (let i = 0; i < line && i < lines.length; i += 1) at += lines[i].length + 1;
  return at;
};
// Поле имени в шапке редактора: примитив `Input` кладёт имя в `id`, а не в `name` — отсюда
// селектор по `id`. Запасной путь — любое поле ввода на экране: важно, что фокус УШЁЛ ИЗ ТЕКСТА
// в соседний живой элемент, а не просто был снят.
probe.focusName = () => {
  const el =
    document.querySelector<HTMLInputElement>('input#noteName') ??
    document.querySelector<HTMLInputElement>('input');
  el?.focus();
};
probe.caretLine = () => {
  const a = area();
  if (!a) return -1;
  const at = a.selectionStart ?? 0;
  let line = 0;
  for (let i = 0; i < at; i += 1) if (a.value.charCodeAt(i) === 10) line += 1;
  return line;
};
probe.caretTo = (line) => {
  const a = area();
  if (!a) return;
  const lines = a.value.split('\n');
  let at = 0;
  for (let i = 0; i < line && i < lines.length; i += 1) at += lines[i].length + 1;
  a.focus();
  a.setSelectionRange(at, at);
};

function Harness() {
  const [value, setValue] = useState('');
  const [name, setName] = useState('note');
  probe.set = (text) => setValue(text);
  probe.value = () => value;

  return (
    <NoteEditor
      name={name}
      onNameChange={setName}
      value={value}
      onChange={setValue}
      dirty={false}
      saving={false}
      savedLabel=''
      canSave={false}
      onSave={() => {}}
      onLeaveEdit={() => {}}
    />
  );
}

probe.mount = () => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/files/1']}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
