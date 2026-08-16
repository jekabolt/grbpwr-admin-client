import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUploadMedia } from './useUploadMedia';

// ВСТАВКА КАРТИНКИ ИЗ БУФЕРА — ⌘V там, где иначе пришлось бы искать файл.
//
// Скриншот узла, кадр из примерки, кроп чужого лукбука — всё это рождается В БУФЕРЕ и до сих пор
// требовало сохранить файл на диск, найти его в диалоге и загрузить. Три шага ради картинки,
// которая уже в руках.
//
// СЛУШАТЕЛЬ НА DOCUMENT, А НЕ НА ЭЛЕМЕНТЕ. Событие `paste` летит на активный элемент, а активным
// в диалоге выбора медиа обычно НЕ ЯВЛЯЕТСЯ ни один из наших блоков — фокус стоит на панели Radix
// или вовсе на body. Слушатель на конкретном div'е ловил бы вставку только после клика ровно по
// нему, то есть почти никогда.
//
// ОДИН ⌘V — ОДНА ВСТАВКА, И `enabled` ЭТОГО НЕ ОБЕСПЕЧИВАЕТ. Включённых экранов законно бывает
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
// картинку. Проверяется цель события, а не наличие текста в буфере: в буфере бывает и то и другое
// одновременно.

/** Стопка включённых приёмников вставки. Последний — верхний, он и обрабатывает ⌘V. */
const pasteStack: symbol[] = [];

const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
};

/** Картинки из буфера. Пусто — вставляли не картинку (текст, файл другого рода). */
function imagesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
}

/**
 * Загружает картинку из буфера по ⌘V и отдаёт готовое медиа.
 *
 * @param enabled этот экран сейчас принимает вставку. Ровно один на странице.
 * @param onUploaded что делать с загруженным — прикрепить к шагу, выбрать в диалоге, добавить в
 *                   мудборд. Хук не знает, куда именно.
 */
export function usePasteImage(
  enabled: boolean,
  onUploaded: (media: common_MediaFull[]) => void,
): { pasting: boolean } {
  const [pasting, setPasting] = useState(false);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();
  // Замыкание слушателя живёт дольше рендера; колбэк владельца пересоздаётся на каждый — читаем
  // его из ref'а, иначе подписка пересоздавалась бы на каждом кадре и теряла бы вставку между.
  const liveRef = useRef({ onUploaded, uploadMedia, showMessage });
  liveRef.current = { onUploaded, uploadMedia, showMessage };
  // Вторая вставка, пришедшая пока грузится первая, игнорируется: ⌘V удерживают, и повтор клавиши
  // прислал бы тот же скриншот дважды.
  const busyRef = useRef(false);

  const handle = useCallback(async (files: File[]) => {
    if (busyRef.current || files.length === 0) return;
    busyRef.current = true;
    setPasting(true);
    const added: common_MediaFull[] = [];
    for (const file of files) {
      try {
        added.push(await liveRef.current.uploadMedia.mutateAsync(file));
      } catch {
        /* сообщение уже показал useUploadMedia */
      }
    }
    busyRef.current = false;
    setPasting(false);
    if (added.length) liveRef.current.onUploaded(added);
  }, []);

  // Личность приёмника. Одна на всю жизнь хука, поэтому включение и выключение снимают ИМЕННО
  // свою запись из стопки, даже если между ними экран включался и выключался десяток раз.
  const idRef = useRef<symbol>(Symbol('paste'));

  useEffect(() => {
    if (!enabled) return;
    const id = idRef.current;
    pasteStack.push(id);
    const onPaste = (e: ClipboardEvent) => {
      // Не моя очередь — молчу, но и не мешаю: событие уйдёт верхнему приёмнику.
      if (pasteStack[pasteStack.length - 1] !== id) return;
      if (isEditableTarget(e.target)) return;
      const files = imagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void handle(files);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      const at = pasteStack.lastIndexOf(id);
      if (at >= 0) pasteStack.splice(at, 1);
    };
  }, [enabled, handle]);

  return { pasting };
}
