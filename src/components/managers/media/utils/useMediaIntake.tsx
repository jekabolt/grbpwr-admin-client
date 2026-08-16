import { common_MediaFull } from 'api/proto-http/admin';
import { useCallback, useMemo, useState } from 'react';
import { MediaIntakeDialog } from '../components/media-intake-dialog';
import { filesOfKind, usePasteFiles, type PasteAccept } from './usePasteFiles';

// ПРИЁМ МЕДИА ИЗВНЕ — ОДИН ХУК НА ВСЕ ТРИ ЖЕСТА.
//
// В слот медиа попадает тремя путями: выбором из библиотеки (это `MediaSelector`), вставкой из
// буфера и броском файла. Два последних приходят СЫРЫМ ФАЙЛОМ, и до сих пор каждое место решало
// само, что с ним делать: полоса снимков грузила молча, галерея эскизов — тоже, а слот с
// соотношением сторон вообще не принимал ни того ни другого. Отсюда хук: он ловит оба жеста,
// показывает приёмную модалку (превью → кроп → подтверждение) и отдаёт владельцу ГОТОВОЕ медиа —
// ровно в том виде, в каком его отдаёт библиотека.
//
// ОЧЕРЕДЬ ⌘V ПРИНАДЛЕЖИТ ТОМУ, ГДЕ УКАЗАТЕЛЬ ИЛИ ФОКУС. На экране слотов бывает десяток (пара
// картинок героя, полоса снимков у каждого из тринадцати шагов), и глобальная вставка ушла бы во
// все сразу. Наведение и фокус считаются ОТДЕЛЬНО: увести фокус клавиатурой, не двигая мышь, —
// обычное дело, и слот под указателем не должен от этого глохнуть.

export type MediaIntakeOptions = {
  /** Слот принимает медиа. Выключено — ни вставки, ни броска (просмотр, заморозка, readOnly). */
  enabled?: boolean;
  /** Видео тоже или только картинки. Должно совпадать с тем, что слот согласен ПОКАЗАТЬ. */
  accept?: PasteAccept;
  /** Сколько файлов взять за раз. Слот на одну картинку ставит 1. */
  limit?: number;
  /** Соотношение, с которым откроется кроп. */
  aspect?: number;
  /** Соотношение обязательно — кроп не даст выбрать другое. */
  lockAspect?: boolean;
  /** Куда это ляжет; уходит в заголовок модалки. */
  purpose?: string;
  /** Готовое медиа. Тот же обработчик, что и у выбора из библиотеки. */
  onMedia: (media: common_MediaFull[]) => void;
};

export function useMediaIntake({
  enabled = true,
  accept = 'image',
  limit,
  aspect,
  lockAspect,
  purpose,
  onMedia,
}: MediaIntakeOptions) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Очередь на приёмку. Непустая — модалка открыта. */
  const [queue, setQueue] = useState<File[]>([]);

  const busy = queue.length > 0;

  const openFiles = useCallback(
    (files: File[]) => {
      const accepted = filesOfKind(files, accept);
      if (!accepted.length) return;
      setQueue(limit != null ? accepted.slice(0, Math.max(0, limit)) : accepted);
    },
    [accept, limit],
  );

  usePasteFiles(
    {
      // Очередь держится и ПОКА ОТКРЫТА МОДАЛКА, хотя вставка тогда не принимается: отдать её на
      // это время значило бы уронить второй ⌘V в слот ПОД модалкой — он остался «горячим», потому
      // что появление окна само по себе не шлёт `pointerleave`.
      claims: enabled && (hovered || focused || busy),
      accepts: enabled && !busy,
      accept,
      limit,
    },
    openFiles,
  );

  const dropHandlers = useMemo(
    () => ({
      onDragEnter: (e: React.DragEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        // Уход указателя на ДОЧЕРНИЙ элемент — это не уход со слота: без проверки подсветка
        // мигала бы на каждой рамке внутри.
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        setDragging(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        openFiles(Array.from(e.dataTransfer.files));
      },
    }),
    [enabled, openFiles],
  );

  /** Наведение, фокус и бросок — вешаются на корень слота одним спредом. */
  const regionHandlers = useMemo(
    () => ({
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      ...dropHandlers,
    }),
    [dropHandlers],
  );

  const finish = useCallback(
    (media: common_MediaFull[]) => {
      setQueue([]);
      onMedia(media);
    },
    [onMedia],
  );

  const dialog = (
    <MediaIntakeDialog
      files={queue}
      aspect={aspect}
      lockAspect={lockAspect}
      purpose={purpose}
      onDone={finish}
      onCancel={() => setQueue([])}
    />
  );

  return {
    /** Модалка приёмки. Рендерится всегда, показывается только с непустой очередью. */
    dialog,
    /** Наведение + фокус + бросок. Спред на корневой элемент слота. */
    regionHandlers,
    /** Файл тащат над слотом — повод подсветить рамку. */
    dragging,
    /** Идёт приёмка: слот показывает это словом, а не пустотой. */
    busy,
    /** Открыть приёмку вручную — например из `<input type="file">`. */
    openFiles,
    /** Слот под указателем или фокусом — ему и достанется ⌘V. */
    hot: hovered || focused,
  };
}
