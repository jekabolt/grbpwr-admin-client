import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { Button } from './button';
import Input from './input';
import Text from './text';

/**
 * The one modal shell in the app. Reference grammar:
 *   panel  white, 1px INK border (not borderColor), --shadow-modal
 *   head   bgSecondary strip, 10px bold uppercase title, ✕ pushed right
 *   body   p-2.5, scrolls, capped at 90vh
 *   foot   ruled top, right-aligned actions
 *
 * Also the shell for MaterialModal / SizePickerModal / the media library — those pass
 * `width` instead of inventing their own lg:w-[…]. Callers that still declare a width on
 * their own children (StyleEconomicsModal, vat-rates-modal, material-prices-modal) keep
 * working: `md` is a MINIMUM, so the panel grows to whatever the children ask for.
 */
export type ModalWidth = 'sm' | 'md' | 'lg';

const WIDTH: Record<ModalWidth, string> = {
  // Confirmations and short forms.
  sm: 'lg:w-[340px]',
  // The default: a real form. A FLOOR, not a fixed width — the panel opens at 420 for a normal
  // form, but content that declares its own wider box (a 30–34rem grid or field pair) grows to fit
  // instead of scrolling sideways inside a 420px body, which is how this shell behaved before the
  // width prop existed. Capped so a long unwrapped paragraph can't stretch it half across the
  // viewport; past the cap the body scrolls as before.
  md: 'lg:min-w-[420px] lg:max-w-xl',
  // Browsers and grids — the media library, the swatch picker, the aux-card grid.
  lg: 'lg:w-full lg:max-w-6xl',
};

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
  width?: ModalWidth;
  /** Hide the footer entirely — for shells that render their own actions. */
  hideActions?: boolean;
  /**
   * Cascade guard. When set, the confirm button stays disabled until the user types
   * this string exactly. Use for anything that destroys data it cannot recover.
   */
  typeToConfirm?: string;
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
  width = 'md',
  hideActions,
  typeToConfirm,
  closeOnConfirm = true,
}: Props) {
  const [typed, setTyped] = useState('');
  // Never carry a satisfied guard across openings — reopening must re-arm it.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const guardUnmet = !!typeToConfirm && typed !== typeToConfirm;

  const handleCancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  const handleConfirm = () => {
    if (guardUnmet) return;
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
            z-[var(--z-nav)] = 45. max-h-[90vh] keeps a tall form scrollable and its buttons
            reachable on a short viewport; inset-x-2.5 already spans nearly the full width there. */}
        <DialogPrimitives.Content
          className={`fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col border border-textColor bg-bgColor text-textColor shadow-[var(--shadow-modal)] lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 ${WIDTH[width]}`}
        >
          <DialogPrimitives.Description className='sr-only'>
            Confirmation
          </DialogPrimitives.Description>
          {title ? (
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
          ) : (
            <DialogPrimitives.Title className='sr-only'>Confirmation</DialogPrimitives.Title>
          )}

          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            {children}
            {typeToConfirm && (
              <div className='mt-2.5'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  type {typeToConfirm} to confirm
                </Text>
                <Input
                  name='confirm-guard'
                  value={typed}
                  autoComplete='off'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
                />
              </div>
            )}
          </div>

          {!hideActions && (
            <div className='flex shrink-0 justify-end gap-1.5 border-t border-borderColor px-2.5 py-1.5'>
              <Button type='button' onClick={handleCancel} variant='secondary' size='sm'>
                {cancelLabel}
              </Button>
              <Button
                type='button'
                onClick={handleConfirm}
                variant='main'
                size='sm'
                disabled={confirmDisabled || guardUnmet}
              >
                {confirmLabel}
              </Button>
            </div>
          )}
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
