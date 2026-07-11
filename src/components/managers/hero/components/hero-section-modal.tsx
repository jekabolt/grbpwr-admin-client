import * as DialogPrimitives from '@radix-ui/react-dialog';
import { ReactNode } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface HeroSectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/**
 * Generic titled dialog for hero editor side-surfaces (add-block palette,
 * nav-featured). Styled like the block editor modal; close via [x] / Esc /
 * overlay — no footer, since the content writes straight to the form.
 */
export function HeroSectionModal({ open, onOpenChange, title, children }: HeroSectionModalProps) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[88vh] lg:w-[92vw] lg:max-w-[1040px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-4'>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          <div className='flex h-full flex-col gap-3'>
            <div className='flex shrink-0 items-center justify-between border-b border-textInactiveColor pb-2'>
              <DialogPrimitives.Title asChild>
                <Text variant='uppercase' size='large'>
                  {title}
                </Text>
              </DialogPrimitives.Title>
              <DialogPrimitives.Close asChild>
                <Button type='button' className='cursor-pointer px-2 py-1'>
                  [x]
                </Button>
              </DialogPrimitives.Close>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>{children}</div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
