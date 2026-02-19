import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface Props {
  open: boolean;
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function UpsertShippingModal({ open, children, onOpenChange, onSave }: Props) {
  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleSave = () => {
    onSave();
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-auto lg:w-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-2.5'>
          <DialogPrimitives.Description className='sr-only'>
            Upsert Shipping
          </DialogPrimitives.Description>
          <DialogPrimitives.Title className='sr-only'>Upsert Shipping</DialogPrimitives.Title>
          <div className='flex min-h-0 flex-1 flex-col gap-4'>
            <DialogPrimitives.Close asChild>
              <div className='flex shrink-0 items-center justify-between'>
                <Text variant='uppercase'>upsert shipping</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='min-h-0 flex-1 overflow-y-auto lg:overflow-visible'>{children}</div>
            <div className='flex shrink-0 justify-center pt-4'>
              <Button type='button' onClick={handleSave} variant='main' size='lg'>
                save
              </Button>
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
