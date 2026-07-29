import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

// One reason the card can't be released, plus the tab that fixes it. The SAME list the header
// renders as pills (phase 05) — one source, two renderings.
// `detail` is the server's factual reason from GetTechCardReadiness ("2 of 5 sign-offs are not
// approved"); the compact header chips show only the label, so this modal is the one place it fits.
export type ReleaseBlocker = { label: string; tab: string; detail?: string };

// «release ▸» is never a dead grey button. It stays clickable; pressing it while the gate is
// closed opens this, which is the only place the reasons are spelled out — each one a link to the
// tab that clears it. Replaces the old `title="…; …; …"` tooltip on a disabled button (invisible
// on touch, unreadable by a screen reader, gone the moment you look away).
export function ReleaseBlockersModal({
  blockers,
  open,
  onOpenChange,
  onGoToTab,
  title = 'not ready to release',
}: {
  blockers: ReleaseBlocker[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the tab that fixes a blocker. The modal closes itself first. */
  onGoToTab: (tab: string) => void;
  title?: string;
}) {
  // The primary action always targets the FIRST blocker — the list is ordered by the gate, so the
  // first one is the one to start with.
  const first = blockers[0];

  const goTo = (tab: string) => {
    onOpenChange(false);
    onGoToTab(tab);
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      width='sm'
      title={title}
      cancelLabel='close'
      confirmLabel={first ? `go to ${first.tab} →` : 'close'}
      // goTo / the empty-list branch already close the dialog; closing twice would fire
      // onOpenChange(false) on an already-closed modal.
      closeOnConfirm={false}
      onConfirm={() => (first ? goTo(first.tab) : onOpenChange(false))}
    >
      {blockers.length === 0 ? (
        <Text size='micro' variant='label'>
          nothing is blocking the release.
        </Text>
      ) : (
        <div className='flex flex-col'>
          {blockers.map((b, i) => (
            <button
              key={`${b.tab}-${i}`}
              type='button'
              onClick={() => goTo(b.tab)}
              className='flex items-center gap-2 border-b border-hairline py-1 text-left last:border-b-0 hover:bg-bgZebra'
            >
              <span
                aria-hidden
                className='flex size-3.5 shrink-0 items-center justify-center border border-error text-nano leading-none text-error'
              >
                ✕
              </span>
              <span className='flex min-w-0 flex-1 flex-col'>
                <Text size='micro' component='span'>
                  {b.label}
                </Text>
                {b.detail && (
                  <Text size='micro' variant='label' component='span'>
                    {b.detail}
                  </Text>
                )}
              </span>
              <Text size='micro' variant='label' component='span' className='shrink-0 underline'>
                → {b.tab}
              </Text>
            </button>
          ))}
        </div>
      )}
    </ConfirmationModal>
  );
}
