import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaCropper } from './cropper';
import { MediaInfo } from './media-info';

export type PreviewItem = { url: string; type: 'image' | 'video' };

interface PreviewMediaProps {
  open: boolean;
  preview: PreviewItem | null;
  isExistingMedia?: boolean;
  mediaData?: common_MediaFull | null;
  isUploading?: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (croppedUrl?: string) => void;
  onCancel: () => void;
}

export function PreviewMedia({
  open,
  preview,
  isExistingMedia = false,
  mediaData,
  isUploading = false,
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
    if (isUploading) return;
    onUpload(croppedUrl);
  };

  const handleCancelClick = () => {
    if (isUploading) return;
    onCancel();
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(open) => {
        if (!isUploading) {
          onOpenChange(open);
        }
      }}
    >
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
              <div className='flex flex-col items-center justify-center gap-6'>
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

                {isExistingMedia && mediaData && <MediaInfo media={mediaData} />}

                <div className='flex justify-center items-center gap-6'>
                  {preview.type === 'image' && (
                    <Button
                      size='lg'
                      className='uppercase'
                      onClick={() => setIsCropperOpen(true)}
                      disabled={!preview || isUploading}
                    >
                      crop
                    </Button>
                  )}
                  <Button
                    className='absolute right-1 top-1 px-1 py-1'
                    onClick={handleCancelClick}
                    disabled={isUploading}
                  >
                    x
                  </Button>
                  {(!isExistingMedia || croppedUrl) && (
                    <Button
                      size='lg'
                      className='uppercase'
                      onClick={handleUploadClick}
                      disabled={isUploading}
                    >
                      {isUploading ? 'uploading...' : 'upload'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
