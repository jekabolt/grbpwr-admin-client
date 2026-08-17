import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Text from 'ui/components/text';
import { plural } from '../upload/text';

/**
 * БРОСОК ПРИНИМАЕТ ВСЁ ОКНО.
 *
 * Целиться некуда и не надо: пока приёмником была одна рамка в углу, промах означал, что
 * браузер УХОДИТ ПО ССЫЛКЕ на брошенный файл — вкладка с набранным фильтром и половиной
 * очереди просто исчезает. Поэтому слушатели стоят на окне и гасят бросок ВСЕГДА, даже в
 * режиме чтения: отказаться принять файл можно словами, а увести человека со страницы —
 * нельзя.
 *
 * Оверлей — `pointer-events-none` намеренно. Приёмник — окно, а элемент под курсором ловил
 * бы `dragenter`/`dragleave` на самом себе и мигал бы в такт движению мыши.
 *
 * Темы пачки не спрашиваются: правило одно на все три входа (кнопка, бросок, ⌘V) — пачка
 * наследует ВСЕ выбранные чипы холста. Оверлей называет их ДО отпускания, пока решение ещё
 * можно передумать.
 */
export function FilesDropOverlay({
  enabled,
  disabledNote,
  topicLabels,
  onFiles,
}: {
  /** Можно ли принимать. Выключенный приёмник всё равно гасит бросок — он только отказывает. */
  enabled: boolean;
  /** Почему нельзя — одной строкой, на самом оверлее. */
  disabledNote?: string;
  /** Что унаследует пачка: имена выбранных чипов холста. Пусто — «разобрать». */
  topicLabels: string[];
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
      if (!hasFiles(e.dataTransfer)) return;
      // Без этого браузер откажется отдавать `drop` вовсе.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = live.current.enabled ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) reset();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      reset();
      if (!live.current.enabled) return;
      const list = Array.from(e.dataTransfer?.files ?? []);
      if (list.length) live.current.onFiles(list);
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

  const files = count ? `${count} ${plural(count, 'файл', 'файла', 'файлов')}` : 'файлы';

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
              отпустите — {files}
            </Text>
            <Text size='micro' component='p'>
              {topicLabels.length
                ? `темы проставятся сразу: ${topicLabels.join(', ')}`
                : 'тем нет — файлы уйдут в «разобрать»'}
            </Text>
            <Text size='micro' component='p' className='opacity-75'>
              до 95 мб на файл · превью браузер нарисует до отправки
            </Text>
          </>
        ) : (
          <>
            <Text size='stat' component='p' variant='uppercase' tracking='section'>
              загрузка выключена
            </Text>
            <Text size='micro' component='p'>
              {disabledNote ?? 'файлы не примутся — но со страницы вас никто не унесёт'}
            </Text>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
