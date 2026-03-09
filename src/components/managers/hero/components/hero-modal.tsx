import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

export function HeroModal({
  children,
  handleSave,
  open,
  onOpenChange,
  title = 'select products',
  trigger,
}: {
  children: React.ReactNode;
  open?: boolean;
  handleSave: () => void;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  trigger?: React.ReactNode | null;
}) {
  const defaultTrigger = (
    <Button variant='main' size='lg' type='button' onClick={() => onOpenChange?.(true)}>
      add products
    </Button>
  );
  return (
    <DialogPrimitives.Root open={open} onOpenChange={(isOpen) => onOpenChange?.(isOpen)}>
      {trigger !== null && (
        <DialogPrimitives.Trigger asChild>{trigger ?? defaultTrigger}</DialogPrimitives.Trigger>
      )}
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-[600px] lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-2.5'>
          <DialogPrimitives.Description className='sr-only'>
            {title}
          </DialogPrimitives.Description>
          <DialogPrimitives.Title className='sr-only'>{title}</DialogPrimitives.Title>
          <div className='flex h-full flex-col gap-2'>
            <DialogPrimitives.Close asChild>
              <div className='flex shrink-0 items-center justify-between'>
                <Text variant='uppercase'>{title}</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='h-full overflow-y-auto'>{children}</div>
            <div className='flex gap-3 justify-end items-center'>
              <DialogPrimitives.Close asChild>
                <Button variant='main' size='lg'>
                  cancel
                </Button>
              </DialogPrimitives.Close>
              <Button type='button' variant='main' size='lg' onClick={handleSave}>
                save
              </Button>
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
