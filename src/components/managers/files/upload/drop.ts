/**
 * ПРИЁМНИК БРОСКА: что гасить, а что отдать браузеру.
 *
 * Правило родилось из двух потерь подряд, и обе настоящие.
 *
 * ПЕРВАЯ. Пока гашение стояло под проверкой «в types есть Files», бросок ссылки или картинки
 * из соседней вкладки (types — `text/uri-list`, `text/html`, `text/plain`) уходил в браузер:
 * вкладка уезжала по адресу картинки вместе с набранным фильтром и наполовину отправленной
 * пачкой. Ради этого случая приёмник и написан, поэтому гашение стало безусловным.
 *
 * ВТОРАЯ. Безусловное гашение убило перетаскивание ТЕКСТА в поля ввода: имя темы, новое имя
 * файла, строка поиска. `preventDefault` на `dragover` над полем отменяет ровно то умение
 * браузера, которое здесь и нужно, — вставку текста в поле.
 *
 * Отсюда предикат: гасим ВСЁ, кроме одного узкого случая — в перетаскивании нет ни файлов,
 * ни ссылки, есть простой текст, и цель события — живое поле ввода. Тогда бросок обслуживает
 * браузер, и вставка работает как везде.
 *
 * ССЫЛКА НЕ ИСКЛЮЧАЕТСЯ ДАЖЕ НАД ПОЛЕМ. Соблазн был: над полем браузер вставляет адрес
 * текстом и никуда не уходит. Но «никуда не уходит» здесь — обещание браузера, а не наше:
 * стоит цели оказаться чуть не тем, чем мы её посчитали (поле только для чтения, поле внутри
 * элемента, который перехватил бросок сам), и обещание превращается в уход со страницы —
 * ровно в ту потерю, ради которой всё написано. Цена отказа — нельзя перетащить адрес из
 * соседней вкладки в строку поиска; терпимо, потому что адрес в библиотеке файлов не ищут.
 *
 * Поле только для чтения и выключенное поле — НЕ приёмники текста: вставить в них нечего,
 * и умолчание браузера над ними ничем не отличается от умолчания над картинкой.
 *
 * Модуль чистый нарочно: снимок цели снимается отдельно (`describeDropTarget`), решение
 * принимается над снимком (`swallowsDrag`) — и поэтому доказывается зондом без браузера.
 */

/** Снимок цели броска: ровно те свойства узла, что решают исход. */
export interface DropTargetShape {
  /** Имя тега строчными; для не-элемента — пустая строка. */
  tag: string;
  /** `input.type` строчными, уже нормализованный браузером ('' для остальных тегов). */
  type: string;
  readOnly: boolean;
  disabled: boolean;
  /** `isContentEditable` — true и у потомков редактируемого узла. */
  editable: boolean;
}

/**
 * Типы `input`, в которые браузер вставляет брошенный текст. Всё остальное (file, checkbox,
 * radio, color, range, дата и время, кнопки) текст не принимает — над ним умолчание браузера
 * уже не «вставить», а неизвестно что.
 */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);

const EMPTY: DropTargetShape = { tag: '', type: '', readOnly: false, disabled: false, editable: false };

/** Снимает с узла ровно то, что нужно предикату. Единственное место модуля, знающее про dom. */
export function describeDropTarget(node: EventTarget | null | undefined): DropTargetShape {
  if (!node || typeof (node as Element).tagName !== 'string') return EMPTY;
  const el = node as HTMLElement & { type?: string; readOnly?: boolean; disabled?: boolean };
  return {
    tag: el.tagName.toLowerCase(),
    type: (el.type ?? '').toLowerCase(),
    readOnly: el.readOnly === true,
    disabled: el.disabled === true,
    editable: el.isContentEditable === true,
  };
}

/** Примет ли эта цель брошенный текст сама, без нашего участия. */
export function isTextSink(t: DropTargetShape): boolean {
  if (t.disabled || t.readOnly) return false;
  if (t.editable) return true;
  if (t.tag === 'textarea') return true;
  if (t.tag === 'input') return TEXT_INPUT_TYPES.has(t.type);
  return false;
}

/**
 * Гасить ли этот `dragover`/`drop`.
 *
 * true — `preventDefault`: браузер не уйдёт по адресу и не откроет файл вместо страницы.
 * false — ровно один случай: простой текст, брошенный в живое поле ввода.
 */
export function swallowsDrag(
  target: DropTargetShape,
  types: readonly string[] | undefined,
): boolean {
  const carried = new Set(types ?? []);
  // Файлы — наши: их принимает раздел, а не браузер.
  if (carried.has('Files')) return true;
  // Ссылка или картинка из соседней вкладки — гасим всегда и везде, см. заголовок модуля.
  if (carried.has('text/uri-list')) return true;
  // Нечего вставлять — незачем и отпускать: умолчание браузера над таким перетаскиванием
  // ничем не обещано.
  if (!carried.has('text/plain')) return true;
  return !isTextSink(target);
}
