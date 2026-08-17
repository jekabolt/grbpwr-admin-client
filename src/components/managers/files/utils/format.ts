export { formatBytes } from 'utils/pattern';

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

  if (ext === 'svg' || ct === 'image/svg+xml') return 'вектор';
  if (ct.startsWith('image/')) return 'картинка';
  if (ct.startsWith('video/')) return 'видео';
  if (ct.startsWith('audio/')) return 'звук';
  if (ct === 'application/pdf' || ext === 'pdf') return 'документ';

  const byExt: Record<string, string> = {
    ai: 'вектор',
    eps: 'вектор',
    zip: 'архив',
    rar: 'архив',
    '7z': 'архив',
    gz: 'архив',
    tar: 'архив',
    doc: 'текст',
    docx: 'текст',
    odt: 'текст',
    rtf: 'текст',
    txt: 'текст',
    md: 'заметка',
    xls: 'таблица',
    xlsx: 'таблица',
    csv: 'таблица',
    numbers: 'таблица',
    ppt: 'презентация',
    pptx: 'презентация',
    key: 'презентация',
    step: '3d-модель',
    stp: '3d-модель',
    stl: '3d-модель',
    obj: '3d-модель',
    blend: '3d-модель',
    '3dm': '3d-модель',
    dxf: 'чертёж',
    dwg: 'чертёж',
    otf: 'шрифт',
    ttf: 'шрифт',
    woff: 'шрифт',
    woff2: 'шрифт',
    psd: 'макет',
    sketch: 'макет',
    fig: 'макет',
    indd: 'макет',
  };
  return byExt[ext] ?? 'файл';
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
