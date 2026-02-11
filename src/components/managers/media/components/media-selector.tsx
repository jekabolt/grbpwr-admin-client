import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { useCallback, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { MediaManager } from '..';

interface MediaSelectorProps {
  label: string;
  aspectRatio?: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  isDeleteAccepted?: boolean;
  saveSelectedMedia: (media: common_MediaFull[]) => void;
}

export function MediaSelector({
  label,
  aspectRatio,
  allowMultiple = true,
  showVideos = true,
  isDeleteAccepted = false,
  saveSelectedMedia,
}: MediaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
  const [dialogKey, setDialogKey] = useState(0);

  const handleSelectionChange = useCallback((media: common_MediaFull[]) => {
    setSelectedMedia(media);
  }, []);

  const handleSave = () => {
    if (selectedMedia.length > 0) {
      saveSelectedMedia(selectedMedia);
      setSelectedMedia([]);
      setDialogKey((prev) => prev + 1);
      setOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSelectedMedia([]);
      setDialogKey((prev) => prev + 1);
    } else {
      setSelectedMedia([]);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button variant='main' size='lg' className='whitespace-nowrap cursor-pointer'>
          {label}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/80' />
        <DialogPrimitive.Content className='fixed left-[50%] top-[50%] z-50 w-full max-w-6xl h-[90vh] translate-x-[-50%] translate-y-[-50%] bg-white p-2.5 flex flex-col'>
          <div className='flex items-center justify-between flex-shrink-0'>
            <DialogPrimitive.Title className='text-lg font-semibold uppercase'>
              <Text variant='uppercase'>select Media</Text>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button className='py-1'>[x]</Button>
            </DialogPrimitive.Close>
          </div>
          <div className='flex-1 min-h-0 overflow-y-scroll mt-6'>
            <MediaManager
              key={dialogKey}
              aspectRatio={aspectRatio}
              allowMultiple={allowMultiple}
              disabled={false}
              showVideos={showVideos}
              showFilters={false}
              onSelectionChange={handleSelectionChange}
              selectionMode={true}
            />
          </div>
          <div className='flex items-center justify-end gap-4 pt-4 border-t bg-white flex-shrink-0'>
            <DialogPrimitive.Close asChild>
              <Button size='lg' className='uppercase' variant='simpleReverse'>
                cancel
              </Button>
            </DialogPrimitive.Close>
            <Button
              className='uppercase'
              variant='main'
              size='lg'
              onClick={handleSave}
              disabled={selectedMedia.length === 0}
            >
              save ({selectedMedia.length})
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
