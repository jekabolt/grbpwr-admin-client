import { cn } from 'lib/utility';
import { useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { usePendingFiles } from '../utils/usePendingFiles';

export function DragDropArea({
  children,
  mediaLength,
  className,
  pendingFilesHook,
  onFilesPicked,
  showAddButton = false,
  showAddTile = false,
  noMatch,
}: {
  children: React.ReactNode;
  mediaLength: number;
  className?: string;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
  /**
   * Куда девать принесённые файлы. Задан — забирает их себе (диалог выбора: файл идёт в приёмку
   * слота, через кроп по его пропорции, и в слот). Не задан — очередь пачки, как на странице
   * библиотеки.
   */
  onFilesPicked?: (files: File[]) => void;
  showAddButton?: boolean;
  /**
   * Слот «добавить» ПЕРВОЙ КЛЕТКОЙ сетки. Кнопка в шапке — единственный вход на страницу, где всё
   * остальное это плитки: слот в самой сетке показывает, что появится на его месте, и стоит там,
   * куда смотрят.
   */
  showAddTile?: boolean;
  /**
   * Заглушка «под отбор ничего не попало». Приходит только тогда, когда в библиотеке что-то есть,
   * а показать нечего из-за отбора: приглашение бросить файл в этом случае врёт про пустую
   * библиотеку, и человек идёт искать пропавшие снимки вместо того, чтобы снять фильтр.
   */
  noMatch?: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { previews, addFiles, skipped, dismissSkipped } = pendingFilesHook;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const relatedTarget = e.relatedTarget as Node;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }

    setIsDragging(false);
  };

  // ОТБОР НЕ ЗДЕСЬ. Оба входа отдают дальше ВСЁ, что принесли: не-медиа отсеет приёмник и
  // назовёт отброшенное по именам. Раньше фильтр стоял в каждом обработчике, и брошенный в пачке
  // PDF исчезал молча — человек узнавал о недостаче, пересчитывая плитки.
  //
  // ОДИН ПРИЁМНИК НА ВСЕ ДОРОГИ ЭТОЙ ЗОНЫ. Внутри диалога выбора полосы очереди нет — она живёт
  // на верхнем слое и легла бы на подвал диалога, — поэтому файл, отданный в очередь, там просто
  // исчезал: превью никто не рисовал, blob висел до размонтирования, а работа пропадала.
  const intake = (files: File[]) => {
    if (!files.length) return;
    if (onFilesPicked) onFilesPicked(files);
    else addFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    intake(Array.from(e.dataTransfer.files));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    intake(Array.from(e.target.files || []));
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={cn('relative transition-all', className)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      style={{ minHeight: mediaLength === 0 ? '300px' : 'auto' }}
    >
      <input
        ref={fileInputRef}
        type='file'
        accept='image/*,video/*'
        multiple
        className='hidden'
        onChange={handleFileInputChange}
      />

      {/* ОТБРОШЕННОЕ НАЗЫВАЕТСЯ ПО ИМЕНИ. Бросили десять файлов, два из них PDF — до этого про них
          не говорилось нигде: ни счётчика, ни имени, ни причины. */}
      {skipped.length > 0 && (
        <CalloutBox tone='note' className='col-span-full flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='p'>
            skipped {skipped.length} {skipped.length === 1 ? 'file' : 'files'}:{' '}
            {skipped.map((file) => `${file.name} (${file.why})`).join(' · ')}
          </Text>
          <Button size='xs' variant='secondary' className='ml-auto' onClick={dismissSkipped}>
            got it
          </Button>
        </CalloutBox>
      )}

      {showAddTile && mediaLength > 0 && (
        <button
          type='button'
          onClick={handleAddButtonClick}
          style={PLACEHOLDER_SURFACE}
          className={cn(
            placeholderClass({ dashed: true }),
            'aspect-[4/5] w-full cursor-pointer flex-col gap-1 px-2 text-center text-labelColor hover:border-textColor hover:text-textColor',
          )}
        >
          <span className='leading-tight'>+ add media</span>
          <span className='text-nano normal-case leading-tight tracking-normal'>
            ⌘V · drag a file · click to browse
          </span>
        </button>
      )}

      {children}

      {mediaLength === 0 && !previews.length && noMatch && (
        <div className='col-span-full'>{noMatch}</div>
      )}

      {mediaLength === 0 && !previews.length && !noMatch && (
        <button
          type='button'
          onClick={handleAddButtonClick}
          style={PLACEHOLDER_SURFACE}
          className={cn(
            placeholderClass({ dashed: true }),
            'col-span-full min-h-[300px] cursor-pointer flex-col gap-2 text-labelColor transition-colors hover:border-textColor hover:text-textColor',
          )}
        >
          <span className='text-lg leading-none'>+</span>
          {/* Две строки пустого состояния должны отличаться: приглашение — 12px жирным,
              подсказка — 10px. Раньше их разводили случайные 16px наследования. */}
          <span className='font-bold uppercase'>drag &amp; drop media here</span>
          <span className='text-micro uppercase'>⌘V · or click to browse</span>
        </button>
      )}
      {showAddButton && (
        // Плавающая кнопка — липкая мебель страницы, а не модалка: сырой `z-50` объявлял её
        // слоем диалогов и клал бы поверх любого открытого. Слой берётся из семантической шкалы.
        <Button
          onClick={handleAddButtonClick}
          variant='main'
          size='lg'
          className='fixed bottom-2 right-2 z-[var(--z-sticky)]'
        >
          add
        </Button>
      )}

      {isDragging && (
        // z-10 — локальный стек самой зоны (плёнка поверх её плиток), не слой страницы.
        <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-textInactiveColor bg-bgColor/90'>
          <span className='uppercase text-textColor'>drop files to upload</span>
        </div>
      )}
    </div>
  );
}
