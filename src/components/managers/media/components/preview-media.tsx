import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { MediaCropper } from './cropper';
import { MediaInfo } from './media-info';

export type PreviewItem = { url: string; type: 'image' | 'video' };

interface PreviewMediaProps {
  open: boolean;
  previews: PreviewItem[];
  isExistingMedia?: boolean;
  mediaData?: common_MediaFull | null;
  isUploading?: boolean;
  isLoadingBlob?: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (index: number, croppedUrl?: string) => void;
  onCancel: () => void;
}
export function PreviewMedia({
  open,
  previews = [],
  isUploading,
  isLoadingBlob,
  isExistingMedia,
  mediaData,
  onUpload,
  onCancel,
  onOpenChange,
}: PreviewMediaProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [croppedUrls, setCroppedUrls] = useState<Record<number, string>>({});

  const safeIndex = Math.min(currentIndex, Math.max(0, previews.length - 1));
  const currentPreview = previews[safeIndex];

  useEffect(() => {
    if (!open) {
      setCurrentIndex(0);
      setCroppedUrls({});
      setIsCropperOpen(false);
    }
  }, [open]);

  const prevPreviewsLengthRef = useRef(previews.length);

  useEffect(() => {
    const prevLength = prevPreviewsLengthRef.current;
    const currentLength = previews.length;

    if (currentLength === 0) {
      setCurrentIndex(0);
      setCroppedUrls({});
    } else if (currentIndex >= currentLength) {
      setCurrentIndex(Math.max(0, currentLength - 1));
    } else if (prevLength > currentLength) {
      setCroppedUrls({});
      if (currentIndex >= currentLength) {
        setCurrentIndex(Math.max(0, currentLength - 1));
      }
    }

    prevPreviewsLengthRef.current = currentLength;
  }, [previews.length, currentIndex]);

  const handleUploadClick = () => {
    if (isUploading || previews.length === 0) return;
    const croppedUrl = croppedUrls[safeIndex];
    onUpload(safeIndex, croppedUrl);
  };

  const handleCancelClick = () => {
    if (isUploading) return;
    onCancel();
    onOpenChange(false);
  };

  if (!previews || previews.length === 0 || !currentPreview) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/80' />
        <DialogPrimitive.Content className='fixed left-[50%] top-[50%] z-50 w-[800px] h-auto translate-x-[-50%] translate-y-[-50%] bg-white pt-8 pb-5 px-2.5'>
          {isCropperOpen && currentPreview.type === 'image' ? (
            (() => {
              const imageUrl = currentPreview.url;
              if (!imageUrl || (!imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:'))) {
                console.error('Invalid image URL for cropping:', imageUrl);
                return null;
              }
              return (
                <MediaCropper
                  key={`${safeIndex}-${imageUrl}`}
                  selectedFile={imageUrl}
                  saveCroppedImage={(url: string) => {
                    setCroppedUrls((prev) => ({
                      ...prev,
                      [safeIndex]: url,
                    }));
                    setIsCropperOpen(false);
                  }}
                  onCancel={() => setIsCropperOpen(false)}
                />
              );
            })()
          ) : (
            <div className='flex flex-col items-center justify-center gap-6'>
              {previews.length > 1 && (
                <div className='flex items-center gap-4'>
                  <Button
                    size='lg'
                    disabled={safeIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  >
                    ←
                  </Button>
                  <Text>
                    {safeIndex + 1} of {previews.length}
                  </Text>
                  <Button
                    size='lg'
                    disabled={safeIndex === previews.length - 1}
                    onClick={() =>
                      setCurrentIndex((prev) => Math.min(previews.length - 1, prev + 1))
                    }
                  >
                    →
                  </Button>
                </div>
              )}

              <div className='w-[500px] h-[400px]'>
                <Media
                  src={croppedUrls[safeIndex] || currentPreview.url}
                  alt={`Preview ${safeIndex + 1}`}
                  type={currentPreview.type}
                  controls={currentPreview.type === 'video'}
                  fit='contain'
                  aspectRatio='auto'
                />
              </div>

              {isExistingMedia && mediaData && <MediaInfo media={mediaData} />}

              <div className='flex justify-center items-center gap-6'>
                {currentPreview.type === 'image' && (
                  <Button
                    size='lg'
                    className='uppercase'
                    onClick={() => setIsCropperOpen(true)}
                    disabled={!currentPreview || isUploading || isLoadingBlob}
                  >
                    {isLoadingBlob ? 'loading...' : 'crop'}
                  </Button>
                )}
                <Button
                  className='absolute right-1 top-1 px-1 py-1'
                  onClick={handleCancelClick}
                  disabled={isUploading}
                >
                  x
                </Button>
                <Button
                  size='lg'
                  className='uppercase'
                  onClick={handleUploadClick}
                  disabled={isUploading}
                >
                  {isUploading ? 'uploading...' : 'upload'}
                </Button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
