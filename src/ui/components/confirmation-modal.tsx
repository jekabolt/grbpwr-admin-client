import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from './button';

interface Props {
  open: boolean;
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  // Form-style dialogs set this false and close themselves in the mutation's onSuccess —
  // the default auto-close would dismiss (and wipe) the form on a validation/backend error.
  closeOnConfirm?: boolean;
}

export function ConfirmationModal({
  open,
  children,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  confirmLabel = 'confirm',
  cancelLabel = 'cancel',
  confirmDisabled,
  closeOnConfirm = true,
}: Props) {
  const handleCancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  const handleConfirm = () => {
    onConfirm();
    if (closeOnConfirm) onOpenChange(false);
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      {/* #32: explicit container=document.body (Radix's own default, but pinned so it can never be
          swapped by an ancestor Portal.Provider later) — keeps this outside the layout nav's DOM
          subtree entirely, as a `fixed` sibling of #root rather than nested inside it. */}
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        {/* z-[var(--z-modal)] = 50 (not a bare z-20/z-50) so the overlay/content always clear other
            fixed page chrome — notably ui/layout.tsx's top nav bar, itself `fixed` at
            z-[var(--z-nav)] = 45. 50 > 45 regardless of the nav's own transform-gpu (that only makes
            the nav its own stacking context, it doesn't raise its z-index) — the old z-20 overlay
            used to render BELOW the nav, letting it visibly poke through the dim backdrop; same token
            media-viewer.tsx / task-form-modal.tsx use for their own overlays. max-h-[90vh] +
            overflow-y-auto keeps a tall form (e.g. the inline "new material" popover) scrollable and
            its buttons reachable on a short mobile viewport instead of overflowing off-screen;
            inset-x-2.5 already spans nearly the full width there. */}
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor p-2.5 text-textColor lg:inset-x-auto lg:left-1/2 lg:min-w-80 lg:-translate-x-1/2'>
          <DialogPrimitives.Description className='sr-only'>
            Confirmation
          </DialogPrimitives.Description>
          {title ? (
            <div className='mb-3 flex items-center justify-between gap-2 border-b border-textInactiveColor pb-2'>
              <DialogPrimitives.Title className='text-lg uppercase'>{title}</DialogPrimitives.Title>
              <DialogPrimitives.Close asChild>
                <Button type='button' className='cursor-pointer'>
                  [x]
                </Button>
              </DialogPrimitives.Close>
            </div>
          ) : (
            <DialogPrimitives.Title className='sr-only'>Confirmation</DialogPrimitives.Title>
          )}
          {children}
          <div className='mt-4 flex justify-end gap-2'>
            <Button type='button' onClick={handleCancel} variant='secondary' size='lg'>
              {cancelLabel}
            </Button>
            <Button
              type='button'
              onClick={handleConfirm}
              variant='main'
              size='lg'
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
