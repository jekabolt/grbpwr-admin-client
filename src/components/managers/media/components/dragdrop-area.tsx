import { cn } from 'lib/utility';
import { useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { usePendingFiles } from '../utils/usePendingFiles';

export function DragDropArea({
  children,
  mediaLength,
  className,
  pendingFilesHook,
  showAddButton = false,
}: {
  children: React.ReactNode;
  mediaLength: number;
  className?: string;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
  showAddButton?: boolean;
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

      {children}

      {mediaLength === 0 && !previews.length && (
        <div className='col-span-2 lg:col-span-4 flex flex-col items-center justify-center gap-4 text-gray-400'>
          <div>dragdrop here</div>
        </div>
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
        <div className='absolute inset-0 bg-textInactiveColor/90 flex items-center justify-center pointer-events-none z-10' />
      )}
    </div>
  );
}
