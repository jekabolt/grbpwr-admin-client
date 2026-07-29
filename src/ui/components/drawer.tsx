import * as DialogPrimitives from '@radix-ui/react-dialog';
import Text from './text';

/**
 * Right-docked panel. Same head/body/foot grammar as the modal, but the page stays
 * readable behind it — use it when the user needs to see what they are annotating
 * (the tech card's tasks panel) rather than being stopped (a confirmation).
 *
 * Animation follows the nav-dropdown convention in global.css and is disabled under
 * prefers-reduced-motion.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  width = 280,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content
          style={{ width }}
          className='drawer-panel fixed top-0 right-0 z-[var(--z-modal)] flex h-full max-w-full flex-col border-l border-textColor bg-bgColor text-textColor shadow-[var(--shadow-modal)]'
        >
          <div className='flex shrink-0 items-center gap-2 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
            <DialogPrimitives.Title asChild>
              <Text
                size='micro'
                variant='uppercase'
                tracking='group'
                component='span'
                className='font-bold'
              >
                {title}
              </Text>
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <button type='button' aria-label='close' className='ml-auto text-labelColor'>
                ✕
              </button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>{children}</div>
          {footer && (
            <div className='flex shrink-0 justify-end gap-1.5 border-t border-borderColor px-2.5 py-1.5'>
              {footer}
            </div>
          )}
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
