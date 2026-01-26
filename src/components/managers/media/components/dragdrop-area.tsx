import { cn } from 'lib/utility';
import { useState } from 'react';
import { usePendingFiles } from '../utils/usePendingFiles';

export function DragDropArea({
  children,
  mediaLength,
  className,
  pendingFilesHook,
}: {
  children: React.ReactNode;
  mediaLength: number;
  className?: string;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { previews, addFiles } = pendingFilesHook;

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

  return (
    <div
      className={cn('relative transition-all', className)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      style={{ minHeight: mediaLength === 0 ? '300px' : 'auto' }}
    >
      {children}

      {mediaLength === 0 && !previews.length && (
        <div className='col-span-2 lg:col-span-4 flex items-center justify-center text-gray-400'>
          dragdrop here
        </div>
      )}

      {isDragging && (
        <div className='absolute inset-0 bg-inactive/90 flex items-center justify-center pointer-events-none z-10' />
      )}
    </div>
  );
}
