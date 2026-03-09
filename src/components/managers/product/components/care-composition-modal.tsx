import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface CareCompositionModalProps {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: React.ReactNode;
}

export function CareCompositionModal({
  title,
  children,
  open,
  onOpenChange,
  footer,
}: CareCompositionModalProps) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-[600px] lg:w-4/5 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-2.5'>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          <DialogPrimitives.Title className='sr-only'>{title}</DialogPrimitives.Title>
          <div className='flex min-h-0 flex-1 flex-col gap-4'>
            <DialogPrimitives.Close asChild>
              <div className='flex shrink-0 items-center justify-between'>
                <Text variant='uppercase'>{title}</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>{children}</div>
            {footer && <div className='shrink-0 pt-2'>{footer}</div>}
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
