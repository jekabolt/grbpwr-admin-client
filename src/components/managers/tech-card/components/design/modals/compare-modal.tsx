import type { DesignBenchSlotRef, common_DesignPicture } from 'api/proto-http/admin';
import { useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { pictureUrl } from '../bench-slot';
import { clockStamp, pictureHandle } from '../handles';
import { provenanceLabel, readProvenance } from '../provenance';
import { useDesignWrites } from '../use-design-band';

/**
 * COMPARE — two plates side by side, and the new one never displaces by itself.
 *
 * THE WHOLE POINT IS THE SECOND HALF OF THAT SENTENCE. A slot is an exclusive place: putting a
 * picture in takes the previous one out, and the previous one is what a version may already have
 * frozen. So a candidate never walks into a slot on its own — a person looks at both and says so.
 * The displaced plate is NOT deleted and NOT hidden: it stays in the band under the row it arrived
 * in, which is what makes the exchange reversible by the same gesture in the other direction.
 *
 * BOTH FRAMES CARRY THEIR OWN PICTURE'S RATIO, separately. Forcing one shape on the pair is what a
 * comparison must not do: a collar that looks lower because its frame is squatter is a difference
 * the screen invented, and it is exactly the kind somebody would act on.
 *
 * THE COMPARE-AND-SET IS NOT DECORATION. `expected_slot_rev` is the slot's revision as it was read
 * with the band; if a colleague put something else there while this dialog was open the server
 * refuses with `Aborted` and the band's own write seam says who moved first. Retrying would
 * overwrite their placement with an intention formed before it existed.
 */

function Frame({
  picture,
  caption,
  tone,
}: {
  picture: common_DesignPicture | null | undefined;
  caption: string;
  tone: 'now' | 'candidate';
}) {
  const media = picture?.media?.media;
  const w = media?.fullSize?.width ?? 0;
  const h = media?.fullSize?.height ?? 0;
  const url = pictureUrl(picture);
  const provenance = picture ? readProvenance(picture) : null;

  return (
    <div className='flex-1 space-y-1' style={{ minWidth: '180px' }}>
      <div className='flex flex-wrap items-baseline gap-1.5'>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {caption}
        </Text>
        {picture ? (
          <Pill tone={tone === 'candidate' ? 'attention' : 'mut'}>{pictureHandle(picture)}</Pill>
        ) : null}
      </div>
      {/* The row that holds these two carries `items-start`, and that is load-bearing rather than
          cosmetic: a STRETCHED flex item takes its height from the row, and an `aspect-ratio` box
          inside it then resolves its width against a height that is already fixed — the frame
          collapses and the screen reads as «the pictures do not load» while the data is fine. */}
      <div
        // мат под снимком белый (R-12)
        className='relative w-full border border-borderColor bg-bgColor'
        style={{ aspectRatio: w > 0 && h > 0 ? `${w}/${h}` : '4/5' }}
      >
        {url ? (
          <img src={url} alt={caption} className='absolute inset-0 h-full w-full object-contain' />
        ) : (
          <span className='absolute inset-0 flex items-center justify-center'>
            <Text size='nano' variant='label' component='span'>
              {picture ? 'no image' : 'the slot is empty'}
            </Text>
          </span>
        )}
      </div>
      <Text size='nano' variant='label' component='p' className='break-words'>
        {provenance ? provenanceLabel(provenance) : '—'}
        {picture?.createdAt ? ` · ${clockStamp(picture.createdAt)}` : ''}
      </Text>
    </div>
  );
}

export function CompareModal({
  open,
  onOpenChange,
  techCardId,
  slotLabel,
  slotRef,
  slotRev,
  current,
  candidate,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  /** The slot's spoken name — FRONT, or the detail's displayed name. */
  slotLabel: string;
  slotRef: DesignBenchSlotRef;
  /** The CAS token read with the band. 0 = the slot has never existed. */
  slotRev: number;
  /** What stands there now. Null is legal: comparing against an empty slot is «is this the one». */
  current: common_DesignPicture | null;
  candidate: common_DesignPicture;
  disabled?: boolean;
}) {
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [refused, setRefused] = useState(false);

  const same = (current?.id ?? 0) === (candidate.id ?? 0) && (candidate.id ?? 0) > 0;
  const pending = setBenchSlot.isPending;

  const putIn = () => {
    if (disabled || same || pending) return;
    setRefused(false);
    setBenchSlot.mutate(
      {
        slot: slotRef,
        pictureId: candidate.id ?? 0,
        expectedSlotRev: slotRev,
      },
      {
        onSuccess: () => onOpenChange(false),
        // The band's write seam already raises the refusal and re-reads the bench. This flag only
        // keeps the dialog from looking like nothing happened.
        onError: () => setRefused(true),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={putIn}
      onCancel={() => onOpenChange(false)}
      closeOnConfirm={false}
      width='lg'
      title={`compare — ${slotLabel}`}
      cancelLabel='close'
      confirmLabel={pending ? 'putting it in…' : 'put it in'}
      confirmDisabled={!!disabled || same || pending}
      footerHint={
        same
          ? 'this is the plate already in the slot'
          : 'the plate that comes out stays in the band — nothing is deleted'
      }
    >
      <div className='space-y-stack'>
        <Text size='micro' variant='label' component='p'>
          A slot holds one plate. Putting this one in takes the other one out — it stays in the band
          under the row it arrived in, so the exchange can be made in the other direction by the
          same gesture.
        </Text>

        <div className='flex flex-wrap items-start gap-2.5'>
          <Frame picture={current} caption='in the slot now' tone='now' />
          <Frame picture={candidate} caption='the candidate' tone='candidate' />
        </div>

        {refused && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              <b>the plate was not placed.</b> If somebody put a different picture in this slot
              while the dialog was open, theirs stands and the bench below has been re-read — look
              at it before pressing again.
            </Text>
          </CalloutBox>
        )}
      </div>
    </ConfirmationModal>
  );
}
