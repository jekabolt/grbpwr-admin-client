import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { StagedChange } from './useTechCardStaging';

// The header's count of everything one `save` will write: the card body (if the form is dirty) plus
// every staged sub-panel. Clicking it lists them, because "4 unsaved changes" is only useful if you
// can see WHICH four — the whole point of phase 19 is that sub-panel edits stop being invisible to
// the header.
//
// Renders nothing at zero: a chip reading "0 unsaved changes" is noise on a pristine card.
export function StagedChangesChip({
  changes,
  cardBodyDirty,
}: {
  changes: StagedChange[];
  cardBodyDirty: boolean;
}) {
  const total = changes.length + (cardBodyDirty ? 1 : 0);
  if (total === 0) return null;

  return (
    <GenericPopover
      title='unsaved'
      triggerProps={{ 'aria-label': `${total} unsaved change${total === 1 ? '' : 's'}, list them` }}
      openElement={
        <span className='flex items-center gap-1 border border-textColor px-1.5 py-0.5'>
          <Text component='span' size='micro' className='uppercase'>
            {total} unsaved {total === 1 ? 'change' : 'changes'}
          </Text>
          <Text component='span' size='nano' aria-hidden>
            ▾
          </Text>
        </span>
      }
    >
      <div className='flex min-w-56 flex-col gap-1'>
        {cardBodyDirty && (
          <div className='flex items-baseline justify-between gap-3'>
            <Text size='micro'>карточка — header &amp; tabs</Text>
            <Text size='nano' variant='label' className='uppercase'>
              staged
            </Text>
          </div>
        )}
        {changes.map((c) => (
          <div key={c.key} className='flex items-baseline justify-between gap-3'>
            <Text size='micro'>{c.label}</Text>
            <Text size='nano' variant='label' className='uppercase'>
              staged
            </Text>
          </div>
        ))}
      </div>
    </GenericPopover>
  );
}
