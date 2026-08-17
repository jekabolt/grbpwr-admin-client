/**
 * Размер файла СТРОЧНЫМИ.
 *
 * Свой, а не `utils/pattern`: тот подписывает `B/KB/MB/GB`, и на одном экране раздела
 * оказывались плитка «500 KB», оверлей броска «up to 95 mb» и строка очереди «412 MB при
 * пределе 95 MB» — три написания одной величины подряд. Р4 говорит: раздел строчными.
 *
 * Делим на 1024, и подпись это признаёт: «mb» в обиходе — ровно мебибайт, а предел
 * сервера (95 MiB) и подпись «up to 95 mb» после этого совпадают буква в букву. Пока подписью
 * было «MB», они расходились на 4%, и отказ 413 приходил на файл, который клиент назвал
 * проходным.
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 b';
  const units = ['b', 'kb', 'mb', 'gb'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * The extension, uppercased, for the plate a file shows when it has no preview.
 * Falls back to a dash rather than an empty plate: an empty tile reads as broken,
 * a dash reads as "nothing to show", which is the truth.
 */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0 || i === fileName.length - 1) return '—';
  const ext = fileName.slice(i + 1);
  return ext.length > 6 ? '—' : ext.toUpperCase();
}

/**
 * Дата по-русски.
 *
 * Не `lib/features/formateDate`: тот форматирует в en-US, а раздел «файлы» русский целиком —
 * «August 17, 2026» посреди «загрузил» читается как чужая вставка.
 */
export function formatWhen(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Короткая дата — «17.08 18:47».
 *
 * Не замена `formatWhen`, а её пара для ЛЕНТ: в обсуждении и в журнале доступа дата стоит на
 * каждой строке, и «17 августа 2026 г., 18:47» двадцать раз подряд вытесняет с экрана сам
 * разговор. Год появляется только у прошлогодней записи — там он и есть та единственная
 * величина, которая отличает её от сегодняшней.
 */
export function formatWhenShort(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Только день — для срока задачи, у которого час ничего не значит. */
export function formatDay(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: '2-digit' }),
  });
}

/* Склонение при числе живёт в `upload/text.ts` (`plural`) и заводить второе здесь незачем:
   одна и та же функция под двумя именами расходится ровно тогда, когда её впервые исправят. */

/**
 * Имя без расширения — то, что подписывает плитку.
 *
 * Расширение с подписи снято не ради красоты: в холсте оно и так стоит бейджем в углу, а
 * `.pdf` в конце каждого второго имени съедает ровно те символы, которыми одна раскладка
 * отличается от другой («packaging_box_diel…» вместо «packaging_box_dieline_v2»).
 */
export function stemOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i <= 0 || i === fileName.length - 1) return fileName;
  if (fileName.length - i - 1 > 6) return fileName;
  return fileName.slice(0, i);
}

/**
 * Тип файла СЛОВОМ.
 *
 * Плашка без превью показывает расширение крупно и это слово мелко. Одно без другого не
 * работает: «STEP» ничего не говорит тому, кто не работает с 3d, а «3d-модель» без
 * расширения не отвечает на вопрос, чем её открывать.
 */
export function kindWord(contentType?: string, fileName?: string): string {
  const ct = (contentType ?? '').toLowerCase();
  const ext = (() => {
    const name = fileName ?? '';
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  })();

  if (ext === 'svg' || ct === 'image/svg+xml') return 'vector';
  if (ct.startsWith('image/')) return 'picture';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'sound';
  if (ct === 'application/pdf' || ext === 'pdf') return 'document';

  const byExt: Record<string, string> = {
    ai: 'vector',
    eps: 'vector',
    zip: 'archive',
    rar: 'archive',
    '7z': 'archive',
    gz: 'archive',
    tar: 'archive',
    doc: 'text',
    docx: 'text',
    odt: 'text',
    rtf: 'text',
    txt: 'text',
    md: 'note',
    xls: 'spreadsheet',
    xlsx: 'spreadsheet',
    csv: 'spreadsheet',
    numbers: 'spreadsheet',
    ppt: 'presentation',
    pptx: 'presentation',
    key: 'presentation',
    step: '3d model',
    stp: '3d model',
    stl: '3d model',
    obj: '3d model',
    blend: '3d model',
    '3dm': '3d model',
    dxf: 'drawing',
    dwg: 'drawing',
    otf: 'font',
    ttf: 'font',
    woff: 'font',
    woff2: 'font',
    psd: 'design',
    sketch: 'design',
    fig: 'design',
    indd: 'design',
  };
  return byExt[ext] ?? 'file';
}

/**
 * Бывает ли у такого файла превью ВООБЩЕ.
 *
 * Различение «превью не бывает» и «превью не вышло» держится на одном этом правиле, и
 * другого у клиента нет: строит превью браузер, а браузер умеет ровно две вещи —
 * растровую картинку и первую страницу pdf. У .zip первой страницы не существует, и
 * кнопка «построить заново» на нём была бы вечным обещанием.
 */
export function previewExpected(contentType?: string, fileName?: string): boolean {
  const ct = (contentType ?? '').toLowerCase();
  const ext = (() => {
    const name = fileName ?? '';
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  })();
  if (ct.startsWith('image/')) return true;
  if (ct === 'application/pdf') return true;
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(ext);
}

/*
 * `tidyFileName` жил здесь, пока имя причёсывал диалог загрузки: там причёсанное стояло в
 * поле ввода, и человек видел, что с ним сделали. В полосе поля нет, и очередь берёт имя
 * БУКВАЛЬНО (`upload/queue.ts`): молчаливое «IMG_4821.jpg» → «IMG.jpg» сделало бы файл
 * ненаходимым, и никто бы этого не заметил. Правку имени предлагает ⌘V-модалка — там она
 * видна.
 */
