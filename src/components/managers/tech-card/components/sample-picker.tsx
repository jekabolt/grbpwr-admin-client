import { common_Sample } from 'api/proto-http/admin';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { samplePurposeLabel, sampleRoundLabel, sampleThumbUrl } from './sample-options';
import { useSamples } from './useSamples';

// Visual chooser of a tech card's samples (NF-04): labels each sample by its per-card number,
// purpose and sewn size. 0 = unset.
export function sampleLabel(s: common_Sample, sizeName?: string): string {
  const p = samplePurposeLabel(s.sample?.purpose);
  return `#${s.number ?? '?'} ${p}${sizeName ? ` · ${sizeName}` : ''}`;
}

// Square thumbnail shared by the trigger and the mini cards — the striped Placeholder when the
// sample has no photo (a picker option shouldn't wait on one).
function SampleThumb({ url, className }: { url?: string; className?: string }) {
  if (!url) return <Placeholder aspect='square' className={className} />;
  return (
    <span className={`block overflow-hidden border border-borderColor ${className ?? ''}`}>
      <Media src={url} alt='' aspectRatio='1/1' fit='cover' />
    </span>
  );
}

// Sample picker (previous sample / dev-expense attribution). A popover of mini sample cards to
// click — one glance beats reading a list of "#3 fit · M" strings — with the "— no sample —"
// escape as the first row (10.4: the shape is kept, only the shell and the tiles are restyled).
// Controlled open state rather than `Popover.Close asChild`: `Tile` is a plain component that does
// not forward refs, so Radix's Slot could not drive it.
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
  const [open, setOpen] = useState(false);
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

  const pick = (id: number) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      title='pick a sample'
      // Anchored flush under the field it replaces, so no tail (phase-04 combobox grammar).
      noTail
      contentProps={{ align: 'start' }}
      // Explicit width + full-width flex so the trigger always matches the sibling form
      // fields it sits next to, instead of shrink-wrapping to the label text.
      triggerProps={{ disabled: isDisabled, className: 'flex w-full items-center' }}
      // Pinned width: inside a floating popper an unconstrained panel resolves to a
      // viewport-driven box instead of a compact card, and the mini-card grid below stops
      // reading as a grid. 240px is exactly two 96px tiles wide.
      className='w-[240px] max-w-[calc(100vw-1.5rem)]'
      openElement={
        <span
          className={`flex min-h-[22px] w-full items-center gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left ${
            isDisabled ? 'bg-bgZebra text-labelColor' : 'hover:border-textColor'
          }`}
        >
          <SampleThumb url={picked ? sampleThumbUrl(picked) : undefined} className='size-5' />
          <Text size='micro' className='min-w-0 flex-1 truncate'>
            {triggerLabel}
          </Text>
          <Text size='micro' variant='label' component='span' aria-hidden>
            ▾
          </Text>
        </span>
      }
    >
      <div className='flex flex-col gap-1'>
        <button
          type='button'
          className='flex justify-between gap-2.5 border-b border-hairline py-1 text-left'
          onClick={() => pick(0)}
        >
          <Text size='micro' variant='label' component='span'>
            — no sample —
          </Text>
          {value === 0 ? (
            <Text size='micro' component='span' aria-hidden>
              ✓
            </Text>
          ) : null}
        </button>
        {samples.length === 0 ? (
          <Text size='micro' variant='label' className='py-1'>
            {isLoading ? 'loading…' : 'no samples on this card yet'}
          </Text>
        ) : (
          <Tiles>
            {samples.map((s) => (
              <Tile
                key={s.id}
                selected={s.id === value}
                onClick={() => pick(s.id ?? 0)}
                media={<SampleThumb url={sampleThumbUrl(s)} />}
                name={sampleLabel(s, sizeNameFor(s))}
                sub={sampleRoundLabel(s.sample?.roundNumber)}
              />
            ))}
          </Tiles>
        )}
      </div>
    </GenericPopover>
  );
}
