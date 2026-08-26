import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useRef, useState } from 'react';
import { isFileDrag } from '../components/gallery-order';
import { MediaIntakeDialog } from '../components/media-intake-dialog';
import { mergeQueue } from './intake-queue';
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
  /**
   * Потолок очереди приёмки. Слот на одну картинку ставит 1.
   *
   * Раньше это было «сколько взять ЗА ОДНУ вставку», и разница видна только при второй: очередь
   * теперь копится до потолка, а не обнуляется каждым жестом. Для вызывающих инвариант тот же —
   * суммарно в приёмку не набрать больше, чем у слота осталось мест.
   */
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
  // Живой снимок очереди: `openFiles` живёт в замыкании слушателя буфера дольше рендера, и
  // читать очередь оттуда из пропа значило бы складывать вторую вставку с ПОЗАПРОШЛЫМ состоянием.
  const queueRef = useRef<File[]>(queue);
  queueRef.current = queue;
  const { showMessage } = useSnackBarStore();

  const openFiles = useCallback(
    (files: File[]) => {
      const accepted = filesOfKind(files, accept);
      if (!accepted.length) return;
      const merged = mergeQueue(queueRef.current, accepted, limit);
      // МОЛЧАТЬ ПРО ОТБРОШЕННОЕ НЕЛЬЗЯ: до сих пор лишнее срезал `slice`, и человек узнавал об
      // этом по недостающему кадру. Считает `mergeQueue`, говорит — здесь.
      if (merged.dropped > 0) {
        const taken = accepted.length - merged.dropped;
        showMessage(
          taken > 0
            ? `took ${taken} of ${accepted.length} — that is all the room left`
            : `no room left — ${merged.dropped} did not fit`,
          'error',
        );
      }
      setQueue(merged.queue);
    },
    [accept, limit, showMessage],
  );

  usePasteFiles(
    {
      // Очередь держится и ПОКА ОТКРЫТА МОДАЛКА, хотя вставка тогда не принимается: отдать её на
      // это время значило бы уронить второй ⌘V в слот ПОД модалкой — он остался «горячим», потому
      // что появление окна само по себе не шлёт `pointerleave`.
      claims: enabled && (hovered || focused || busy),
      // ВТОРОЙ ⌘V БОЛЬШЕ НЕ ГЛОТАЕТСЯ. Он и раньше доходил сюда (очередь держится, пока открыта
      // приёмка), но выбрасывался: принимать вставку в открытое окно было нечем — оно листало
      // очередь по индексу. Теперь окно копит, и вторая вставка добавляет кадр к первому.
      accepts: enabled,
      accept,
      limit,
    },
    openFiles,
  );

  const dropHandlers = useMemo(
    () => ({
      // ПРИЁМНИК ЖДЁТ ФАЙЛА РОВНО ТОГДА, КОГДА В ЖЕСТЕ ФАЙЛ (`isFileDrag` — по `types`, они
      // читаются на любом шаге перетаскивания, в отличие от `files`, пустых до `drop`).
      //
      // Сторож стоит В ХУКЕ, а не только у галереи эскиза: с появлением перестановки плиток
      // (ручка ⠿ в `gallery-order`) плитку тащат МИМО добавочного слота, и слот без сторожа
      // зажигал «drop to add» жесту, в котором файла нет, — замерено на объединённом дереве
      // (проба шва №2). Для приёмника это чистое сужение: жест без файлов ничего и не приносил —
      // `e.dataTransfer.files` у него пуст, и `openFiles([])` выходил по первой строке.
      onDragEnter: (e: React.DragEvent) => {
        if (!enabled || !isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!enabled || !isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      // Уход НЕ сужается до файлового жеста: он только гасит подсветку, и лишний вызов дешевле
      // подсветки, застрявшей из-за съеденного ухода.
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
        if (!enabled || !isFileDrag(e)) return;
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

  // ДОСТАВКА И ОЧЕРЕДЬ — ДВА РАЗНЫХ СОБЫТИЯ, И РАЗНИМАТЬ ИХ ПРИШЛОСЬ. Пока отправка шла внутри
  // окна, «пачка доехала» и «очередь кончилась» совпадали. Теперь пачка может доехать НАПОЛОВИНУ:
  // доставленное уходит в форму сразу, а отказавшееся остаётся в очереди с причиной и кнопкой
  // повтора. Очередью правит окно (`onQueueChange`), доставкой — владелец слота.
  const finish = useCallback((media: common_MediaFull[]) => onMedia(media), [onMedia]);

  const dialog = (
    <MediaIntakeDialog
      files={queue}
      aspect={aspect}
      lockAspect={lockAspect}
      purpose={purpose}
      onDone={finish}
      onQueueChange={setQueue}
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
    /**
     * Идёт приёмка: слот показывает это словом, а не пустотой. Теперь честно горит и во время
     * СВЁРНУТОЙ отправки — очередь жива, пока пачка не доехала.
     */
    busy,
    /** Открыть приёмку вручную — например из `<input type="file">`. */
    openFiles,
    /** Слот под указателем или фокусом — ему и достанется ⌘V. */
    hot: hovered || focused,
  };
}
