import { cn } from 'lib/utility';
import { useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import { usePendingFiles } from '../utils/usePendingFiles';

export function DragDropArea({
  children,
  mediaLength,
  className,
  pendingFilesHook,
  showAddButton = false,
  showAddTile = false,
}: {
  children: React.ReactNode;
  mediaLength: number;
  className?: string;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
  showAddButton?: boolean;
  /**
   * Слот «добавить» ПЕРВОЙ КЛЕТКОЙ сетки. Кнопка в шапке — единственный вход на страницу, где всё
   * остальное это плитки: слот в самой сетке показывает, что появится на его месте, и стоит там,
   * куда смотрят.
   */
  showAddTile?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { previews, addFiles } = pendingFilesHook;
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );

    if (!files.length) return;

    addFiles(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );

    if (!files.length) return;

    addFiles(files);
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

      {mediaLength === 0 && !previews.length && (
        <button
          type='button'
          onClick={handleAddButtonClick}
          style={PLACEHOLDER_SURFACE}
          className={cn(
            placeholderClass({ dashed: true }),
            'col-span-2 min-h-[300px] cursor-pointer flex-col gap-2 text-labelColor transition-colors hover:border-textColor hover:text-textColor lg:col-span-4',
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
        <Button
          onClick={handleAddButtonClick}
          variant='main'
          size='lg'
          className='fixed bottom-2 right-2 z-50'
        >
          add
        </Button>
      )}

      {isDragging && (
        <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-textInactiveColor bg-bgColor/90'>
          <span className='uppercase text-textColor'>drop files to upload</span>
        </div>
      )}
    </div>
  );
}
