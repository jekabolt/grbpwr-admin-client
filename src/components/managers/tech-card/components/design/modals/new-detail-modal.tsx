import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import { pictureUrl, readBench } from '../bench-slot';
import { pictureHandle } from '../handles';
import { isComposite } from '../split-modal';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';

/**
 * A NEW DETAIL SLOT, MADE FROM A PICTURE — the name comes first, because the sheet cites it by name.
 *
 * THE BENCH ALREADY HAS A DOOR FOR THIS AND IT IS NOT THIS ONE. `NewDetailCell` mints a detail from
 * the bench itself: name it, then fill it. That gesture starts from the SLOT. This one starts from
 * the PICTURE — somebody is looking at a photograph of a cuff in the feed and wants a place for it —
 * and the two are not the same act, which is why the prototype has both (`tile-slot → new`). What
 * they share is the rule: a nameless detail is refused by the server
 * (`FailedPrecondition:detail_name_required`) because the name is the only thing that distinguishes
 * it from every other detail on a printed sheet.
 *
 * ONE CALL, NOT TWO. `SetDesignBenchSlot` with `slot.view_key = 'detail'` IS the mint verb — it
 * addresses no existing row, requires the name alongside it, and demands `expected_slot_rev = 0`.
 * There is no other spelling: a oneof cannot carry a view AND an id at once, so «create, then
 * place» was never two calls that could half-succeed.
 *
 * A DUPLICATE NAME IS LEGAL AND IS ONLY WARNED ABOUT. Two details a human called the same thing
 * must still be two slots — renaming one may not move the other's plate — so the store keeps both
 * and the bench displays a `(2)` suffix. Refusing the second here would be this screen inventing a
 * rule the server does not have, and the server would win.
 */

export function NewDetailModal({
  open,
  onOpenChange,
  techCardId,
  band,
  picture,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  band: GetDesignBandResponse;
  /**
   * The picture that will fill the new slot. Omit to mint an EMPTY detail — a legal act, and the
   * only one available while the feed offers nothing placeable.
   */
  picture?: common_DesignPicture | null;
  disabled?: boolean;
}) {
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [name, setName] = useState('');
  const [bad, setBad] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reopening on another picture must not inherit the previous name — a detail called «cuff»
  // holding a photograph of a pocket is a mislabelled slot nobody would think to check.
  useEffect(() => {
    if (!open) return;
    setName('');
    setBad(false);
    setRefused(null);
  }, [open, picture]);

  const named = name.trim();

  const existing = useMemo(
    () =>
      readBench(band)
        .details.map((d) => (d.detailName ?? '').trim().toLowerCase())
        .filter(Boolean),
    [band],
  );
  const duplicate = !!named && existing.includes(named.toLowerCase());

  /**
   * What the server would refuse. Checked here so the answer arrives before the round trip, and
   * WORDED as the reason rather than as a disabled button with no explanation.
   */
  const blocked = (() => {
    if (!picture) return null;
    if (isComposite(picture))
      return 'this picture glues several views into one image, so it holds no single view — split it first, then fill the slot with one of the crops.';
    if (isPictureHidden(picture))
      return 'this picture is hidden. Unhide it in the feed first — a hidden plate may not stand in a slot.';
    return null;
  })();

  const pending = setBenchSlot.isPending;
  const ready = !!named && !blocked && !disabled && !pending;

  const create = () => {
    if (!named) {
      setBad(true);
      inputRef.current?.focus();
      return;
    }
    if (!ready) return;
    setRefused(null);
    setBenchSlot.mutate(
      {
        // `view_key: 'detail'` MINTS. `expected_slot_rev` must be 0 — the row does not exist yet.
        // `kind` names WHICH BENCH and is left empty, which the contract fixes as the flat one —
        // this modal is reached from a flat tile's picker and knows of no second bench.
        slot: { viewKey: 'detail', kind: undefined },
        pictureId: picture?.id ?? 0,
        expectedSlotRev: 0,
        newDetailName: named,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => setRefused((error as Error)?.message || 'the slot was not created'),
      },
    );
  };

  const url = pictureUrl(picture);
  const media = picture?.media?.media;
  const w = media?.fullSize?.width ?? 0;
  const h = media?.fullSize?.height ?? 0;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={create}
      onCancel={() => onOpenChange(false)}
      closeOnConfirm={false}
      width='sm'
      title='new detail slot'
      confirmLabel={
        pending ? 'creating…' : picture ? 'create and fill it' : 'create the empty slot'
      }
      confirmDisabled={!ready}
      footerHint='the name comes first — the sheet cites a detail by name'
    >
      <div className='space-y-stack'>
        {picture && (
          <div className='flex items-start gap-2.5'>
            {/* The picture's own ratio, `self-start` so the aspect box is not stretched to the
                row's height and collapsed to nothing by it. */}
            <span
              className='block w-20 shrink-0 self-start border border-borderColor bg-bgSecondary'
              style={{ aspectRatio: w > 0 && h > 0 ? `${w}/${h}` : '4/5' }}
            >
              {url && (
                <img
                  src={url}
                  alt={pictureHandle(picture)}
                  className='h-full w-full object-contain'
                />
              )}
            </span>
            <Text size='micro' variant='label' component='p' className='min-w-0 flex-1'>
              <b>{pictureHandle(picture)}</b> will stand in the new slot. A detail is addressed by
              its own id from the moment it is born, so renaming it later never moves the plate.
            </Text>
          </div>
        )}

        <div>
          <label htmlFor='design-new-detail-name'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              name
            </Text>
          </label>
          <Input
            ref={inputRef}
            id='design-new-detail-name'
            name='design-new-detail-name'
            value={name}
            disabled={disabled || pending}
            placeholder='cuff, kangaroo pocket, …'
            aria-invalid={bad || undefined}
            autoComplete='off'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
              if (e.target.value.trim()) setBad(false);
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              create();
            }}
          />
          <Text size='nano' component='p' className={bad ? 'text-error' : 'text-labelColor'}>
            {bad
              ? 'name it first — a nameless detail is refused by the server'
              : 'what the factory would call this piece'}
          </Text>
        </div>

        {duplicate && (
          <CalloutBox tone='note'>
            <Text size='micro' component='p'>
              the bench already has a detail called <b>{named}</b>. That is allowed — they stay two
              separate slots and the bench shows a <code>(2)</code> after the second — but on paper
              they will read alike.
            </Text>
          </CalloutBox>
        )}

        {blocked && (
          <CalloutBox tone='warning'>
            <Text size='micro' component='p'>
              {blocked}
            </Text>
          </CalloutBox>
        )}

        {refused && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              <b>the slot was not created.</b> {refused}
            </Text>
          </CalloutBox>
        )}
      </div>
    </ConfirmationModal>
  );
}
