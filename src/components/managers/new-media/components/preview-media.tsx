import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaCropper } from './cropper';

export type PreviewItem = { url: string; type: 'image' | 'video' };

interface PreviewMediaProps {
  open: boolean;
  preview: PreviewItem | null;
  onOpenChange: (open: boolean) => void;
  onUpload: (croppedUrl?: string) => void;
  onCancel: () => void;
}

export function PreviewMedia({
  open,
  preview,
  onOpenChange,
  onUpload,
  onCancel,
}: PreviewMediaProps) {
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [croppedUrl, setCroppedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setCroppedUrl(undefined);
      setIsCropperOpen(false);
    }
  }, [open]);

  const handleUploadClick = () => {
    onUpload(croppedUrl);
    onOpenChange(false);
  };

  const handleCancelClick = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/80' />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-[800px] h-auto translate-x-[-50%] translate-y-[-50%] bg-white pt-8 pb-5 px-2.5',
          )}
        >
          {preview &&
            (isCropperOpen && preview.type === 'image' ? (
              <MediaCropper
                selectedFile={preview.url}
                saveCroppedImage={(url: string) => {
                  setCroppedUrl(url);
                  setIsCropperOpen(false);
                }}
                onCancel={() => setIsCropperOpen(false)}
              />
            ) : (
              <div className='flex flex-col items-center justify-center gap-10'>
                <div className='w-[500px] h-[400px]'>
                  <Media
                    src={croppedUrl || preview.url}
                    alt={preview.url}
                    type={preview.type}
                    controls={preview.type === 'video'}
                    fit='contain'
                    aspectRatio='auto'
                  />
                </div>

                <div className='flex justify-center items-center gap-6'>
                  {preview.type === 'image' && (
                    <Button
                      size='lg'
                      className='uppercase'
                      onClick={() => setIsCropperOpen(true)}
                      disabled={!preview}
                    >
                      crop
                    </Button>
                  )}
                  <Button className='absolute right-1 top-1 px-1 py-1' onClick={handleCancelClick}>
                    x
                  </Button>
                  <Button size='lg' className='uppercase' onClick={handleUploadClick}>
                    upload
                  </Button>
                </div>
              </div>
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
