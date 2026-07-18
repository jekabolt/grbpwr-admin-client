import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

interface Props {
  selectedCount: number;
  hideableCount: number;
  unhideableCount: number;
  busy: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onClear: () => void;
}

// Sticky action bar for the active selection. Both bulk actions confirm first (guard the reversible-
// but-consequential); the applicable count is shown up front and on the confirm button.
export function BatchActionBar({
  selectedCount,
  hideableCount,
  unhideableCount,
  busy,
  onHide,
  onUnhide,
  onClear,
}: Props) {
  const [confirmHide, setConfirmHide] = useState(false);
  const [confirmUnhide, setConfirmUnhide] = useState(false);

  if (selectedCount === 0) return null;

  const nothingActionable = hideableCount === 0 && unhideableCount === 0;

  return (
    <>
      <div className='fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-textColor bg-bgColor'>
        <div className='flex flex-wrap items-center justify-between gap-3 px-2.5 py-3'>
          <div className='flex items-center gap-3'>
            <Text variant='uppercase' className='font-bold'>
              {selectedCount} selected
            </Text>
            <button
              type='button'
              onClick={onClear}
              className='cursor-pointer underline underline-offset-2 hover:opacity-70'
            >
              <Text variant='label' size='small'>
                clear
              </Text>
            </button>
            {nothingActionable && (
              <Text variant='label' size='small'>
                nothing to hide in selection
              </Text>
            )}
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            {unhideableCount > 0 && (
              <Button
                variant='secondary'
                size='lg'
                className='uppercase'
                disabled={busy}
                onClick={() => setConfirmUnhide(true)}
              >
                {`unhide (${unhideableCount})`}
              </Button>
            )}
            {hideableCount > 0 && (
              <Button
                variant='main'
                size='lg'
                className='font-bold uppercase'
                disabled={busy}
                loading={busy}
                onClick={() => setConfirmHide(true)}
              >
                {`hide selected (${hideableCount})`}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        open={confirmHide}
        onOpenChange={setConfirmHide}
        title='hide products'
        confirmLabel={`hide ${hideableCount}`}
        onConfirm={onHide}
      >
        <Text variant='uppercase' className='font-bold'>
          hide {hideableCount} {hideableCount === 1 ? 'product' : 'products'} from the storefront?
          you can unhide them later.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmUnhide}
        onOpenChange={setConfirmUnhide}
        title='unhide products'
        confirmLabel={`unhide ${unhideableCount}`}
        onConfirm={onUnhide}
      >
        <Text variant='uppercase' className='font-bold'>
          unhide {unhideableCount} {unhideableCount === 1 ? 'product' : 'products'}? they will
          return to the storefront.
        </Text>
      </ConfirmationModal>
    </>
  );
}
