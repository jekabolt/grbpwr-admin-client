import { cn } from 'lib/utility';
import { useState } from 'react';
import { useUploadMedia } from '../utils/useUploadMedia';

export function DragDropArea({
  children,
  mediaLength,
  className,
}: {
  children: React.ReactNode;
  mediaLength: number;
  className?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const uploadMedia = useUploadMedia();

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

    try {
      await Promise.all(files.map((file) => uploadMedia.mutateAsync(file)));
    } catch (e) {
      console.error('upload failed:', e);
    }
  };

  return (
    <div
      className={cn('relative transition-all', className, {
        'ring-4 ring-blue-500 ring-opacity-50': isDragging,
      })}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      style={{ minHeight: mediaLength === 0 ? '300px' : 'auto' }}
    >
      {children}

      {mediaLength === 0 && (
        <div className='col-span-2 lg:col-span-4 flex items-center justify-center text-gray-400'>
          Перетащите файлы сюда
        </div>
      )}

      {isDragging && (
        <div className='absolute inset-0 bg-blue-500 bg-opacity-10 border-4 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none z-10'>
          <div className='text-blue-600 text-xl font-semibold'>Отпустите для загрузки</div>
        </div>
      )}
    </div>
  );
}
