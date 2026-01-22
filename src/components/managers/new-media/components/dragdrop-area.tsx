import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useUploadMedia } from '../utils/useUploadMedia';
import { PreviewItem, PreviewMedia } from './preview-media';

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const uploadMedia = useUploadMedia();

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    },
    [preview],
  );

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

    if (preview) {
      URL.revokeObjectURL(preview.url);
    }

    const file = files[0];
    const nextPreview: PreviewItem = {
      url: URL.createObjectURL(file),
      type: (file.type.startsWith('video/') ? 'video' : 'image') as PreviewItem['type'],
    };

    setPendingFile(file);
    setPreview(nextPreview);
  };

  const handleUpload = async (croppedUrl?: string) => {
    if (!pendingFile) return;

    try {
      let fileToUpload = pendingFile;

      if (croppedUrl) {
        const response = await fetch(croppedUrl);
        const blob = await response.blob();
        fileToUpload = new File([blob], pendingFile.name, {
          type: pendingFile.type || 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      await uploadMedia.mutateAsync(fileToUpload);
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
      setPendingFile(null);
      setPreview(null);
    } catch (e) {
      console.error('upload failed:', e);
    }
  };

  const handleCancel = () => {
    if (preview) {
      URL.revokeObjectURL(preview.url);
    }
    setPendingFile(null);
    setPreview(null);
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

      {mediaLength === 0 && !preview && (
        <div className='col-span-2 lg:col-span-4 flex items-center justify-center text-gray-400'>
          dragdrop here
        </div>
      )}

      <PreviewMedia
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
        preview={preview}
        onUpload={handleUpload}
        onCancel={handleCancel}
      />

      {isDragging && (
        <div className='absolute inset-0 bg-inactive/90 flex items-center justify-center pointer-events-none z-10' />
      )}
    </div>
  );
}
