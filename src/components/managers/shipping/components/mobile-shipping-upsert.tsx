import * as DialogPrimitives from '@radix-ui/react-dialog';

export function MobileShippingUpsert({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5'>
          <DialogPrimitives.Description className='sr-only'>
            Upsert Shipping
          </DialogPrimitives.Description>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
