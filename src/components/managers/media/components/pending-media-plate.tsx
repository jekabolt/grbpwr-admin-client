import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaCropper } from './cropper';
import { PreviewItem } from './preview-media';

interface PendingMediaPlateProps {
  previews: PreviewItem[];
  croppedUrls: Record<number, string>;
  uploadingIndices: Set<number>;
  onUploadAll: () => void;
  onCrop: (index: number, croppedUrl: string) => void;
  onRemove: (index: number) => void;
}

export function PendingMediaPlate({
  previews,
  croppedUrls,
  uploadingIndices,
  onUploadAll,
  onCrop,
  onRemove,
}: PendingMediaPlateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUserClosed, setHasUserClosed] = useState(false);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (croppingIndex !== null && croppingIndex >= previews.length) {
      setCroppingIndex(null);
    }
  }, [previews.length, croppingIndex]);

  useEffect(() => {
    if (previews.length > 0 && !hasUserClosed) {
      setIsOpen(true);
    } else if (previews.length === 0) {
      setIsOpen(false);
      setCroppingIndex(null);
      setHasUserClosed(false);
    }
  }, [previews.length, hasUserClosed]);

  const currentCroppingItem =
    croppingIndex !== null && croppingIndex < previews.length ? previews[croppingIndex] : null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && previews.length > 0) {
      setHasUserClosed(true);
    }
  };

  const isUploading = uploadingIndices.size > 0;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button
          size='lg'
          className='min-w-64 flex items-center justify-center gap-2'
          disabled={previews.length === 0}
        >
          {isUploading ? (
            <>
              <span
                className='size-4 border-2 border-current border-t-transparent rounded-full animate-spin'
                aria-hidden
              />
            </>
          ) : (
            <>pending uploads {previews.length > 0 && `[${previews.length}]`}</>
          )}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/80' />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-[90vw] max-w-[1200px] max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] bg-white pt-8 pb-5 px-6',
            {
              'w-[800px]': croppingIndex !== null,
            },
          )}
        >
          {previews.length > 0 && croppingIndex === null && (
            <div className='flex justify-end mb-4'>
              <Button
                size='lg'
                className='uppercase cursor-pointer'
                onClick={onUploadAll}
                disabled={previews.length === 0 || uploadingIndices.size > 0}
              >
                upload all
              </Button>
            </div>
          )}
          {croppingIndex !== null && currentCroppingItem?.type === 'image' ? (
            <MediaCropper
              key={`${croppingIndex}-${currentCroppingItem.url}`}
              selectedFile={currentCroppingItem.url}
              saveCroppedImage={(url: string) => {
                onCrop(croppingIndex, url);
                setCroppingIndex(null);
              }}
              onCancel={() => setCroppingIndex(null)}
            />
          ) : (
            <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
              {previews.map((preview, id) => (
                <div key={id} className='relative flex flex-col gap-2'>
                  <Button
                    className='absolute right-0 top-0 leading-none z-10 py-1 cursor-pointer'
                    onClick={() => onRemove(id)}
                    disabled={uploadingIndices.has(id)}
                  >
                    [x]
                  </Button>
                  <div className='w-full h-64 overflow-hidden  border border-text'>
                    <Media
                      src={croppedUrls[id] || preview.url}
                      alt={preview.url}
                      type={preview.type}
                      controls={preview.type === 'video'}
                      fit='contain'
                      aspectRatio='auto'
                    />
                  </div>

                  <Button
                    size='lg'
                    onClick={() => setCroppingIndex(id)}
                    className='uppercase cursor-pointer w-full'
                    disabled={uploadingIndices.has(id)}
                  >
                    crop
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
