import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { dataUrlToFile } from '../utils/dataUrlToFile';
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploadMedia = useUploadMedia();

  // Cleanup blob URLs only on component unmount
  // Individual files handle their own URL cleanup when removed
  useEffect(() => {
    return () => {
      previews.forEach((p) => {
        if (p.url.startsWith('blob:')) {
          URL.revokeObjectURL(p.url);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    previews.forEach((p) => URL.revokeObjectURL(p.url));

    const nextPreviews: PreviewItem[] = files.map((file) => ({
      url: URL.createObjectURL(file),
      type: (file.type.startsWith('video/') ? 'video' : 'image') as PreviewItem['type'],
    }));

    setPendingFiles(files);
    setPreviews(nextPreviews);
  };

  const handleUpload = async (index: number, croppedUrl?: string) => {
    if (!pendingFiles.length || isUploading || index < 0 || index >= pendingFiles.length) return;
    setIsUploading(true);
    try {
      const file = pendingFiles[index];
      let fileToUpload = file;

      if (croppedUrl) {
        fileToUpload = dataUrlToFile(croppedUrl, file.name);
      }

      await uploadMedia.mutateAsync(fileToUpload);

      // Revoke the URL for the uploaded file before removing
      if (previews[index]?.url) {
        URL.revokeObjectURL(previews[index].url);
      }

      // Remove the uploaded file from the arrays
      setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));

      // If no more files, the preview will close automatically
    } catch (e) {
      console.error('upload failed:', e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPendingFiles([]);
    setPreviews([]);
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

      <PreviewMedia
        open={previews.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
        previews={previews}
        onUpload={(index, croppedUrl) => handleUpload(index, croppedUrl)}
        onCancel={handleCancel}
        isUploading={isUploading}
      />

      {isDragging && (
        <div className='absolute inset-0 bg-inactive/90 flex items-center justify-center pointer-events-none z-10' />
      )}
    </div>
  );
}
