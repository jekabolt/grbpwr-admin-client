import * as Popover from '@radix-ui/react-popover';
import { common_Sample } from 'api/proto-http/admin';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import Media from 'ui/components/media';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { samplePurposeLabel, sampleRoundLabel, sampleThumbUrl } from './sample-options';
import { useSamples } from './useSamples';

// Visual chooser of a tech card's samples (NF-04): labels each sample by its per-card number,
// purpose and sewn size. 0 = unset.
export function sampleLabel(s: common_Sample, sizeName?: string): string {
  const p = samplePurposeLabel(s.sample?.purpose);
  return `#${s.number ?? '?'} ${p}${sizeName ? ` · ${sizeName}` : ''}`;
}

// Small square thumbnail shared by the trigger and the option rows — a plain dash placeholder
// when the sample has no photo (a picker option shouldn't wait on one).
function SampleThumb({ url, size = 'size-8' }: { url?: string; size?: string }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden border border-textInactiveColor bg-bgColor`}
    >
      {url ? (
        <Media src={url} alt='' aspectRatio='1/1' fit='cover' />
      ) : (
        <Text variant='inactive' size='small'>
          —
        </Text>
      )}
    </span>
  );
}

// Sample picker (previous sample / dev-expense attribution) — was a plain native <select> whose
// options were a wall of same-shaped text rows, easy to mispick in a card with several samples.
// Same visual language as the sample board: a thumbnail + label trigger opens a popover of mini
// sample cards (thumbnail, number/purpose/size, round) to click — one glance beats reading a list
// of "#3 fit · M" strings.
export function SamplePicker({
  techCardId,
  value,
  onChange,
  disabled,
}: {
  techCardId?: number;
  value: number;
  onChange: (sampleId: number) => void;
  disabled?: boolean;
}) {
  const { dictionary } = useDictionary();
  const { data, isLoading } = useSamples(techCardId);
  const samples = data?.samples ?? [];
  const picked = samples.find((s) => s.id === value);
  const isDisabled = disabled || !techCardId;

  const sizeNameFor = (s: common_Sample) =>
    s.sample?.sizeId
      ? String(findInDictionary(dictionary, s.sample.sizeId, 'size') || s.sample.sizeId)
      : undefined;

  const triggerLabel = isLoading
    ? 'loading…'
    : picked
      ? sampleLabel(picked, sizeNameFor(picked))
      : '— no sample —';

  return (
    <GenericPopover
      title='pick a sample'
      contentProps={{ align: 'start', sideOffset: 6 }}
      // Explicit width + full-width flex so the trigger always matches the sibling form
      // fields it sits next to, instead of shrink-wrapping to the label text.
      triggerProps={{ disabled: isDisabled, className: 'flex w-full items-center' }}
      // GenericPopover's content defaults to w-full; unconstrained inside a floating
      // (position: absolute, off-flow) popper that resolves to a huge/viewport-driven box
      // instead of a compact card. Pin it to a fixed, phone-safe width so the mini-card
      // grid below reads as an actual grid, not a stretched single column.
      className='w-[19rem] max-w-[calc(100vw-1.5rem)]'
      openElement={
        <span
          className={`flex w-full items-center gap-2 border border-textInactiveColor bg-bgColor px-2 py-1.5 text-left ${
            isDisabled ? 'opacity-50' : 'hover:bg-highlightColor/5'
          }`}
        >
          <SampleThumb url={picked ? sampleThumbUrl(picked) : undefined} size='size-6' />
          <Text size='small' className='min-w-0 flex-1 truncate'>
            {triggerLabel}
          </Text>
        </span>
      }
    >
      <div className='flex flex-col gap-2'>
        <Popover.Close asChild>
          <button
            type='button'
            className='flex items-center gap-2 border border-textInactiveColor p-1.5 text-left hover:bg-highlightColor/5'
            onClick={() => onChange(0)}
          >
            <Text variant='inactive' size='small'>
              — no sample —
            </Text>
          </button>
        </Popover.Close>
        {samples.length === 0 ? (
          <Text variant='inactive' size='small' className='p-1.5'>
            {isLoading ? 'loading…' : 'no samples on this card yet'}
          </Text>
        ) : (
          <div className='grid grid-cols-2 gap-1.5'>
            {samples.map((s) => (
              <Popover.Close asChild key={s.id}>
                <button
                  type='button'
                  className={`flex min-w-0 items-center gap-1.5 border p-1.5 text-left hover:bg-highlightColor/5 ${
                    s.id === value ? 'border-textColor' : 'border-textInactiveColor'
                  }`}
                  onClick={() => s.id && onChange(s.id)}
                >
                  <SampleThumb url={sampleThumbUrl(s)} />
                  <span className='flex min-w-0 flex-col'>
                    <Text size='small' className='truncate'>
                      {sampleLabel(s, sizeNameFor(s))}
                    </Text>
                    <Text variant='inactive' size='small' className='truncate'>
                      {sampleRoundLabel(s.sample?.roundNumber)}
                    </Text>
                  </span>
                </button>
              </Popover.Close>
            ))}
          </div>
        )}
      </div>
    </GenericPopover>
  );
}
