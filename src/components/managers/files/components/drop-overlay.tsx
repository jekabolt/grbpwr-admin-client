import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSnackBarStore } from 'lib/stores/store';
import Text from 'ui/components/text';
import { MAX_UPLOAD_BYTES } from '../api/filesService';
import { describeDropTarget, swallowsDrag } from '../upload/drop';
import { plural } from '../upload/text';
import { formatBytes } from '../utils/format';

/**
 * БРОСОК ПРИНИМАЕТ ВСЁ ОКНО.
 *
 * Целиться некуда и не надо: пока приёмником была одна рамка в углу, промах означал, что
 * браузер УХОДИТ ПО ССЫЛКЕ на брошенный файл — вкладка с набранным фильтром и половиной
 * очереди просто исчезает. Поэтому слушатели стоят на окне и гасят бросок ВСЕГДА, даже в
 * режиме чтения: отказаться принять файл можно словами, а увести человека со страницы —
 * нельзя.
 *
 * ГАШЕНИЕ ПОЧТИ БЕЗУСЛОВНО, А ПОКАЗ ОВЕРЛЕЯ — НЕТ. Это разные вопросы, и раньше они решались
 * одной проверкой `types` на 'Files'. У перетаскивания картинки из соседней вкладки типы —
 * `text/uri-list` и `text/html`, файлов среди них нет: `preventDefault` не звался, и браузер
 * уходил по адресу картинки, унося вкладку вместе с наполовину уехавшей пачкой. Референс из
 * соседней вкладки тянут ежедневно — это не редкий случай, а обычный.
 *
 * «ПОЧТИ» — это ПЕРЕТАСКИВАНИЕ ТЕКСТА В ПОЛЕ. Гашение без единого исключения отняло у раздела
 * обычное умение браузера: перетащить кусок текста в имя темы, в новое имя файла, в строку
 * поиска. Исключение ровно одно и описано предикатом в `upload/drop.ts`: нет файлов, нет
 * ссылки, есть простой текст, и цель — живое поле ввода. Ссылка не исключается даже над полем;
 * почему — там же.
 *
 * Оверлей — `pointer-events-none` намеренно. Приёмник — окно, а элемент под курсором ловил
 * бы `dragenter`/`dragleave` на самом себе и мигал бы в такт движению мыши.
 *
 * Темы пачки не спрашиваются: правило одно на все три входа (кнопка, бросок, ⌘V) — пачка
 * наследует ВСЕ выбранные чипы холста. Оверлей называет их ДО отпускания, пока решение ещё
 * можно передумать.
 */
/**
 * Разбирает брошенное на файлы и папки.
 *
 * Папку от файла отличает только `webkitGetAsEntry()`: в `dataTransfer.files` она лежит
 * обычным `File` с нулевым размером и пустым типом, и по этим признакам её не опознать —
 * файл нулевой длины существует. Записей нет вовсе (старый браузер, странный источник) —
 * берём `files` как есть: лучше попытаться отправить, чем отказать всей пачке.
 */
function pickFiles(dt: DataTransfer | null): { files: File[]; folders: string[] } {
  const files: File[] = [];
  const folders: string[] = [];
  const items = Array.from(dt?.items ?? []).filter((i) => i.kind === 'file');
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (!items.length || entries.every((x) => x === null)) {
    return { files: Array.from(dt?.files ?? []), folders };
  }
  items.forEach((item, i) => {
    const entry = entries[i];
    if (entry && entry.isDirectory) {
      folders.push(entry.name);
      return;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  });
  return { files, folders };
}

export function FilesDropOverlay({
  enabled,
  disabledNote,
  topicLabels,
  landingNote,
  onFiles,
}: {
  /** Можно ли принимать. Выключенный приёмник всё равно гасит бросок — он только отказывает. */
  enabled: boolean;
  /** Почему нельзя — одной строкой, на самом оверлее. */
  disabledNote?: string;
  /** Что унаследует пачка: имена выбранных чипов холста. Пусто — «unsorted». */
  topicLabels: string[];
  /**
   * Что НЕ унаследует пачка — вторая строка обещания, и она нужнее первой.
   *
   * Загрузка ставит темы и не ставит роль: строки связи «файл ↔ проект» ещё нет, потому что нет
   * файла. Значит в проекте пачка ложится в приёмную кучу, а человек, стоящий в разделе
   * «исходники», ждёт исходников. Умолчать здесь — значит дать ему увидеть, как файл
   * «загрузился» и исчез из выдачи.
   */
  landingNote?: string;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(0);
  // Счётчик вложенности: `dragenter` приходит на КАЖДЫЙ элемент под курсором, и без него
  // оверлей снимался бы первым же `dragleave` при переходе с плитки на плитку.
  const depth = useRef(0);
  const live = useRef({ enabled, onFiles });
  live.current = { enabled, onFiles };

  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types ?? []).includes('Files');

    const countFiles = (dt: DataTransfer | null) => {
      if (!dt) return 0;
      // До отпускания `files` пуст (браузер не отдаёт содержимое чужого перетаскивания),
      // а `items` уже перечислены — число берётся оттуда и остаётся оценкой.
      return Array.from(dt.items ?? []).filter((i) => i.kind === 'file').length;
    };

    const reset = () => {
      depth.current = 0;
      setDragging(false);
      setCount(0);
    };

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth.current += 1;
      setCount(countFiles(e.dataTransfer));
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      // Без preventDefault на dragover браузер не отдаёт `drop` вовсе и уходит по адресу
      // перетащенного — то есть уносит вкладку с живой очередью. Ссылку мы не примем, но и не
      // пустим её никуда увести. Единственный пропуск — текст, летящий в поле ввода: там
      // умолчание браузера и есть нужное поведение, и гасить его нечем оправдать.
      if (!swallowsDrag(describeDropTarget(e.target), e.dataTransfer?.types)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect =
          live.current.enabled && hasFiles(e.dataTransfer) ? 'copy' : 'none';
      }
    };
    // Уход НЕ проверяет типы, в отличие от входа: если хоть один браузер отдаст на `dragleave`
    // пустой `types`, счётчик перестанет опускаться и оверлей залипнет на весь сеанс. Лишний
    // декремент безопасен — он зажат нулём.
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) reset();
    };
    const onDrop = (e: DragEvent) => {
      // Первым действием и по тому же предикату, что и `dragover`: всё, что не погашено здесь,
      // браузер открывает вместо страницы. Отказ (нет права, режим чтения, бросили ссылку) —
      // это молчание или слова, но никогда не уход со страницы. Два обработчика обязаны решать
      // ОДИНАКОВО: погашенный `dragover` при отпущенном `drop` — это и есть уход по адресу.
      const swallow = swallowsDrag(describeDropTarget(e.target), e.dataTransfer?.types);
      if (swallow) e.preventDefault();
      reset();
      if (!swallow || !hasFiles(e.dataTransfer) || !live.current.enabled) return;

      const { files, folders } = pickFiles(e.dataTransfer);
      // ПАПКА — НЕ ФАЙЛ. Браузер отдаёт её в `files` наравне с остальным, и до сих пор она
      // становилась строкой-призраком: отправка уходила пустой и падала с диагнозом «the
      // connection dropped», хотя связь была в полном порядке.
      if (folders.length) {
        useSnackBarStore
          .getState()
          .showMessage(
            `a folder can't be uploaded: ${folders.join(', ')}. open it and drop the files`,
            'error',
          );
      }
      if (files.length) live.current.onFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', reset);
    };
  }, []);

  if (!dragging) return null;

  const files = count ? `${count} ${plural(count, 'file')}` : 'files';

  return createPortal(
    <div
      aria-hidden
      className='pointer-events-none fixed inset-0 z-[var(--z-toast)] flex items-center justify-center bg-overlay'
    >
      <div className='absolute inset-2 border-2 border-bgColor' />
      <div className='relative flex flex-col items-center gap-1 px-4 text-center text-bgColor'>
        {enabled ? (
          <>
            <Text size='stat' component='p' variant='uppercase' tracking='section'>
              let go — {files}
            </Text>
            <Text size='micro' component='p'>
              {topicLabels.length
                ? `topics will be set right away: ${topicLabels.join(', ')}`
                : 'no topics — the files will go to “unsorted”'}
            </Text>
            {landingNote && (
              <Text size='micro' component='p'>
                {landingNote}
              </Text>
            )}
            <Text size='micro' component='p' className='opacity-75'>
              up to {formatBytes(MAX_UPLOAD_BYTES)} per file · the browser draws the preview before
              the upload
            </Text>
          </>
        ) : (
          <>
            <Text size='stat' component='p' variant='uppercase' tracking='section'>
              uploading is off
            </Text>
            <Text size='micro' component='p'>
              {disabledNote ?? "the files won't be taken — but nobody will carry you off the page"}
            </Text>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
