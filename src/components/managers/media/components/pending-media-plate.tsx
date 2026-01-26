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
  onUpload: (index: number, croppedUrl?: string) => void;
  onCrop: (index: number, croppedUrl: string) => void;
  onRemove: (index: number) => void;
}

export function PendingMediaPlate({
  previews,
  croppedUrls,
  uploadingIndices,
  onUpload,
  onCrop,
  onRemove,
}: PendingMediaPlateProps) {
  const [isOpen, setIsOPen] = useState(false);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (croppingIndex !== null && croppingIndex >= previews.length) {
      setCroppingIndex(null);
    }
  }, [previews.length, croppingIndex]);

  useEffect(() => {
    if (previews.length > 0) {
      setIsOPen(true);
    }
  }, [previews.length]);

  const currentCroppingItem =
    croppingIndex !== null && croppingIndex < previews.length ? previews[croppingIndex] : null;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOPen}>
      <DialogPrimitive.Trigger asChild>
        <Button size='lg' className='min-w-64' disabled={previews.length === 0}>
          pending uploads {previews.length > 0 && `[${previews.length}]`}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/80' />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-[90vw] max-w-[1200px] max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] bg-white pt-8 pb-5 px-6',
          )}
        >
          {croppingIndex !== null && currentCroppingItem?.type === 'image' ? (
            <MediaCropper
              key={`${croppingIndex}-${currentCroppingItem.url}`}
              selectedFile={currentCroppingItem.url}
              saveCroppedImage={(url: string) => {
                onCrop(croppingIndex, url);
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
                      src={preview.url || croppedUrls[id]}
                      alt={preview.url}
                      type={preview.type}
                      controls={preview.type === 'video'}
                      fit='contain'
                      aspectRatio='auto'
                    />
                  </div>
                  <div className='flex lg:flex-row flex-col gap-2 items-center justify-center'>
                    <Button
                      size='lg'
                      onClick={() => setCroppingIndex(id)}
                      className='uppercase cursor-pointer w-full'
                      disabled={uploadingIndices.has(id)}
                    >
                      crop
                    </Button>
                    <Button
                      size='lg'
                      onClick={() => onUpload(id, croppedUrls[id])}
                      className='uppercase cursor-pointer w-full'
                      disabled={uploadingIndices.has(id)}
                    >
                      upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
