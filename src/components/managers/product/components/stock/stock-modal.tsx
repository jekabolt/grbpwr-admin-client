import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface Props {
  children: React.ReactNode;
}

export function StockModal({ children }: Props) {
  return (
    <DialogPrimitives.Root>
      <DialogPrimitives.Trigger asChild>
        <Button variant='main' size='lg'>
          stock history
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-[600px] lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-2.5'>
          <DialogPrimitives.Description className='sr-only'>
            stock history
          </DialogPrimitives.Description>
          <DialogPrimitives.Title className='sr-only'>stock history</DialogPrimitives.Title>
          <div className='flex min-h-0 flex-1 flex-col gap-4'>
            <DialogPrimitives.Close asChild>
              <div className='flex shrink-0 items-center justify-between'>
                <Text variant='uppercase'>stock history</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>{children}</div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
