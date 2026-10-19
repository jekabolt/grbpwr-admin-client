import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Close } from './close';
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
  side = 'right',
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  side?: 'right' | 'bottom';
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const bottom = side === 'bottom';
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content
          onCloseAutoFocus={onCloseAutoFocus}
          style={bottom ? undefined : { width }}
          className={
            bottom
              ? 'drawer-panel-bottom fixed bottom-0 left-0 z-[var(--z-modal)] flex max-h-[85vh] w-full flex-col border-t border-textColor bg-bgColor pb-[env(safe-area-inset-bottom)] text-textColor shadow-[var(--shadow-modal)]'
              : 'drawer-panel fixed top-0 right-0 z-[var(--z-modal)] flex h-full max-w-full flex-col border-l border-textColor bg-bgColor text-textColor shadow-[var(--shadow-modal)]'
          }
        >
          {bottom && (
            <div className='flex shrink-0 justify-center pt-1.5' aria-hidden>
              <div className='h-0.5 w-6 bg-textColor' />
            </div>
          )}
          <div className='flex shrink-0 items-center gap-2 border-b border-borderColor bg-pageBg px-2.5 py-1.5'>
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
              <Close className='ml-auto' />
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
