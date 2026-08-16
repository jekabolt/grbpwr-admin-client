import { useCallback, useEffect, useRef } from 'react';

// ⌘V КАК СПОСОБ ПОЛОЖИТЬ МЕДИА В СЛОТ — перехват буфера и НИЧЕГО БОЛЬШЕ.
//
// Скриншот узла, кадр из примерки, кроп чужого лукбука, ролик из мессенджера — всё это рождается
// В БУФЕРЕ и до сих пор требовало сохранить файл на диск, найти его в диалоге и загрузить. Три
// шага ради того, что уже в руках.
//
// Хук отдаёт СЫРЫЕ ФАЙЛЫ, а не загруженное медиа: между «вставил» и «положил в слот» стоит
// приёмная модалка (`MediaIntakeDialog`) — превью, кроп, подтверждение. Загружать сразу значило бы
// класть в библиотеку всё, что человек случайно вставил, и показывать результат кропа уже задним
// числом.
//
// СЛУШАТЕЛЬ НА DOCUMENT, А НЕ НА ЭЛЕМЕНТЕ. Событие `paste` летит на активный элемент, а активным
// внутри слота обычно НЕ ЯВЛЯЕТСЯ ни один из наших блоков — фокус стоит на панели Radix или вовсе
// на body. Слушатель на конкретном div'е ловил бы вставку только после клика ровно по нему, то
// есть почти никогда.
//
// ОДИН ⌘V — ОДНА ВСТАВКА, И `enabled` ЭТОГО НЕ ОБЕСПЕЧИВАЕТ. Включённых приёмников законно бывает
// несколько сразу: указатель стоит в полосе снимков шага, оттуда открыт диалог выбора медиа — и
// полоса о своей очереди не узнаёт, потому что `pointerleave` стреляет от ДВИЖЕНИЯ указателя, а не
// от того, что поверх неё встала модалка. Один ⌘V ушёл бы в оба обработчика: две загрузки одного
// скриншота и два кадра в карточке.
//
// Поэтому очередь ведётся ЯВНО, стопкой: побеждает тот, кто включился ПОСЛЕДНИМ. Это ровно порядок
// наложения на экране — диалог открывается позже полосы, над которой стоял курсор, и закрывшись
// возвращает очередь ей.
//
// ТЕКСТОВЫЕ ПОЛЯ НЕПРИКОСНОВЕННЫ. Вставка в поле подписи — это вставка текста; перехватить её
// значило бы, что человек, копирующий формулировку из соседней карточки, вместо текста получает
// картинку. Проверяется цель события, а не наличие картинки в буфере: в буфере бывает и то и
// другое одновременно.

/** Стопка включённых приёмников вставки. Последний — верхний, он и обрабатывает ⌘V. */
const pasteStack: symbol[] = [];

const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
};

/** Что слот согласен принять. Видео берётся только там, где слот его показывает. */
export type PasteAccept = 'image' | 'media';

export const isImageFile = (f: File) => f.type.startsWith('image/');
export const isVideoFile = (f: File) => f.type.startsWith('video/');
export const isMediaFile = (f: File) => isImageFile(f) || isVideoFile(f);

export function filesOfKind(files: File[], accept: PasteAccept): File[] {
  return files.filter(accept === 'media' ? isMediaFile : isImageFile);
}

/** Медиа-файлы из буфера. Пусто — вставляли не медиа (текст, файл другого рода). */
function mediaFromClipboard(data: DataTransfer | null, accept: PasteAccept): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && (accept === 'media' ? isMediaFile(file) : isImageFile(file))) out.push(file);
  }
  return out;
}

export type PasteFilesOptions = {
  /**
   * Забрать очередь себе. Верхний в стопке ГЛОТАЕТ вставку целиком — даже когда сам её не
   * принимает: слот с открытой приёмной модалкой обязан не пустить ⌘V вниз, в галерею под собой,
   * иначе второй скриншот прикрепится мимо кропа, ради которого модалка и открыта.
   */
  claims: boolean;
  /** Реально брать файлы. По умолчанию — как `claims`. */
  accepts?: boolean;
  /** Видео тоже или только картинки. По умолчанию только картинки. */
  accept?: PasteAccept;
  /**
   * Сколько файлов взять из буфера. В буфере их бывает несколько, а слот с одной картинкой или
   * шаг, у которого осталось одно место, примет ОДИН — принять остальные значило бы предложить
   * кадрировать то, чему в слоте всё равно нет места.
   */
  limit?: number;
};

/**
 * Отдаёт файлы, вставленные по ⌘V. Ничего не грузит и не знает, куда они лягут.
 *
 * @param onFiles что делать с вставленным — показать приёмную модалку, прикрепить, загрузить.
 */
export function usePasteFiles(
  options: boolean | PasteFilesOptions,
  onFiles: (files: File[]) => void,
): void {
  const opts: PasteFilesOptions = typeof options === 'boolean' ? { claims: options } : options;
  const claims = opts.claims;
  const accepts = opts.accepts ?? claims;
  const accept = opts.accept ?? 'image';
  const limit = opts.limit;

  // Замыкание слушателя живёт дольше рендера; колбэк владельца пересоздаётся на каждый — читаем
  // его из ref'а, иначе подписка пересоздавалась бы на каждом кадре и теряла бы вставку между.
  const liveRef = useRef({ onFiles, accepts, accept, limit });
  liveRef.current = { onFiles, accepts, accept, limit };

  const handle = useCallback((files: File[]) => {
    if (!files.length) return;
    liveRef.current.onFiles(files);
  }, []);

  // Личность приёмника. Одна на всю жизнь хука, поэтому включение и выключение снимают ИМЕННО
  // свою запись из стопки, даже если между ними слот включался и выключался десяток раз.
  const idRef = useRef<symbol>(Symbol('paste'));

  useEffect(() => {
    if (!claims) return;
    const id = idRef.current;
    pasteStack.push(id);
    const onPaste = (e: ClipboardEvent) => {
      // Не моя очередь — молчу, но и не мешаю: событие уйдёт верхнему приёмнику.
      if (pasteStack[pasteStack.length - 1] !== id) return;
      if (isEditableTarget(e.target)) return;
      const all = mediaFromClipboard(e.clipboardData, liveRef.current.accept);
      if (all.length === 0) return;
      // Очередь МОЯ — значит вставка гасится здесь, даже если принимать её я сейчас не готов.
      e.preventDefault();
      if (!liveRef.current.accepts) return;
      const take = liveRef.current.limit;
      handle(take != null ? all.slice(0, Math.max(0, take)) : all);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      const at = pasteStack.lastIndexOf(id);
      if (at >= 0) pasteStack.splice(at, 1);
    };
  }, [claims, handle]);
}
