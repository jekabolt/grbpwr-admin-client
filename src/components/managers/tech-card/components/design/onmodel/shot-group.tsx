import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { AskModal, EMPTY_WORD, Reason } from '../core';
import { mediaThumb } from '../render/model';
import type { ShotDraft } from './drafts';
import {
  fittingShots,
  fittingsWithShots,
  shotName,
  shotOrigin,
  type FittingShot,
  type OnModelShot,
} from './model';

/**
 * ═══ THE SHOT THIS RUN REPAINTS — one slot, two doors into it ═════════════════════════════════
 *
 * The prototype's grammar (`omShotGroup`): a group line with the source pill and «one paid call»,
 * then two columns — the SLOT on the left (the product's own `MediaSlot`: the striped frame that
 * is itself the library door, drop target and ⌘V target), the two add-chips on the right —
 * `+ from the fittings N` and `+ from the media library`. A reason for a dead chip is a VISIBLE
 * line under it, never only a `title`; the door stays ONE per source, or the row drifts.
 *
 * FROM THE FITTINGS — THE CARD'S OWN TRY-ONS. `ListFittings` filtered by this card
 * (`useTechCardFittings`, the same read the sample panels make) hands back each fitting with its
 * resolved media; the chip counts the fittings that carry a photograph and opens a chooser of
 * those photographs, grouped by fitting. A fitting's date and sample size are printed and KEPT ON
 * THE CARD — the pill row under the chips says so — and never reach the model.
 *
 * REPLACING A STANDING SHOT ASKS FIRST, with the studio's one question organ (`AskModal`):
 * «change the photograph · replaces the fitting photo taken on 12 Aug. The paint and the colourway
 * stay.» Filling an empty slot asks nothing — there is nothing to lose.
 */

const PURPOSE = 'design · the photograph this run repaints';

export function libraryShot(media: common_MediaFull): OnModelShot {
  return { media, source: 'library', fittingId: 0, stamp: '', size: '' };
}

export function fittingShot(row: FittingShot): OnModelShot {
  return {
    media: row.media,
    source: 'fitting',
    fittingId: row.fittingId,
    stamp: row.stamp,
    size: row.size,
  };
}

/** The frame of a picked-by-looking tile: a square, the picture covering it. */
function ShotFace({ src, alt }: { src: string; alt: string }): JSX.Element {
  return (
    <span className='relative block aspect-square w-full overflow-hidden bg-bgColor'>
      {src ? (
        <img src={src} alt={alt} className='h-full w-full object-cover' />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Text size='nano' variant='label' component='span'>
            no image
          </Text>
        </span>
      )}
    </span>
  );
}

export function ShotGroup({
  techCardId,
  draft,
  disabled,
  chooserOpen,
  onChooserOpenChange,
  onFittingsKnown,
}: {
  techCardId: number;
  draft: ShotDraft;
  disabled?: boolean;
  /** The fittings chooser is opened from here AND from the lock bar's door — the composer holds it. */
  chooserOpen: boolean;
  onChooserOpenChange: (open: boolean) => void;
  /** Told once the read lands: whether any fitting carries a picture (the `+ photo ›` door reads it). */
  onFittingsKnown?: (havePictures: boolean) => void;
}): JSX.Element {
  const shot = draft.shot;
  const { dictionary } = useDictionary();
  const sizes = dictionary?.sizes ?? [];
  const fittings = useTechCardFittings(techCardId);
  const shots = useMemo(
    () =>
      // A size the dictionary cannot name is still a size: `size 3` beats a blank pill.
      fittingShots(
        fittings.data,
        (id) => (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id > 0 ? `size ${id}` : ''),
      ),
    [fittings.data, sizes],
  );
  const fittingCount = fittingsWithShots(shots);
  useEffect(() => {
    onFittingsKnown?.(fittingCount > 0);
  }, [fittingCount, onFittingsKnown]);

  /** A replacement waiting for its question. `null` — no question is open. */
  const [pending, setPending] = useState<OnModelShot | null>(null);

  const propose = (next: OnModelShot) => {
    if (!shot) {
      draft.put(next);
      return;
    }
    if ((shot.media.id ?? 0) === (next.media.id ?? 0)) return;
    setPending(next);
  };

  const was = shot
    ? shot.source === 'fitting'
      ? shot.stamp
        ? `the fitting photo taken on ${shot.stamp}`
        : 'the fitting photo'
      : 'the photo taken from the media library'
    : '';

  const fittingsDead = disabled || fittings.isLoading || fittingCount === 0;
  const fittingsWhy = disabled
    ? 'this card is read-only for you'
    : fittings.isLoading
      ? 'reading the fittings of this item…'
      : fittings.isError
        ? 'the fittings of this item could not be read · upload a photo instead'
        : fittingCount === 0
          ? 'no fittings recorded for this item · upload a photo instead'
          : '';

  /** The chooser, grouped by fitting in the order the server gave them (newest first). */
  const groups = useMemo(() => {
    const order: number[] = [];
    const by = new Map<number, FittingShot[]>();
    for (const s of shots) {
      const list = by.get(s.fittingId);
      if (list) list.push(s);
      else {
        by.set(s.fittingId, [s]);
        order.push(s.fittingId);
      }
    }
    return order.map((id) => by.get(id)!);
  }, [shots]);

  return (
    <div data-om-shot={shot ? shot.media.id : 'empty'}>
      <GroupLabel
        flush
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            {shot ? (
              <Pill tone='ink'>
                {shot.source === 'fitting' ? 'from a fitting' : 'from the media library'}
              </Pill>
            ) : (
              <Pill tone='mut'>{EMPTY_WORD}</Pill>
            )}
            <Pill tone='mut'>one paid call</Pill>
          </span>
        }
      >
        the shot this run repaints
      </GroupLabel>

      <div className='grid gap-5 md:grid-cols-2'>
        {/* THE SLOT. One frame; empty it is the library door, filled it shows the shot with the
            product's own «change · remove» bar. Square, like the shelf tiles beside it. */}
        <div className='min-w-0 max-w-[220px]'>
          <MediaSlot
            aspectRatio={['Custom']}
            frameAspect='1/1'
            mediaUrl={shot ? mediaThumb(shot.media) : undefined}
            alt={shot ? shotName(shot) : 'the photograph'}
            label='the photograph *'
            hint='from a fitting · or the media library'
            purpose={PURPOSE}
            showVideos={false}
            editMode={!disabled}
            onSelect={(media) => {
              const first = media[0];
              if (first?.id) propose(libraryShot(first));
            }}
            onClear={disabled ? undefined : draft.clear}
          />
          {shot && (
            <div className='mt-1 flex flex-wrap items-center justify-between gap-1'>
              <Text size='nano' variant='uppercase' component='span' className='min-w-0 truncate'>
                {shotName(shot)}
              </Text>
              <Pill tone='mut'>{shotOrigin(shot)}</Pill>
            </div>
          )}
        </div>

        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-1'>
            <Chip
              dashed
              disabled={fittingsDead}
              title={fittingsWhy || 'take the shot from a fitting of this item'}
              aria-label='take the shot from a fitting of this item'
              data-om-door='fittings'
              onClick={() => onChooserOpenChange(true)}
            >
              + from the fittings{' '}
              <span className='tabular-nums opacity-65'>
                {fittings.isLoading ? '…' : fittingCount}
              </span>
            </Chip>
            {disabled ? (
              <Chip dashed disabled title='this card is read-only for you' data-om-door='library'>
                + from the media library
              </Chip>
            ) : (
              <MediaSelector
                label='from the media library'
                purpose={PURPOSE}
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                saveSelectedMedia={(media) => {
                  const first = media[0];
                  if (first?.id) propose(libraryShot(first));
                }}
                trigger={
                  <Chip
                    dashed
                    onClick={() => {}}
                    aria-label='take the shot from the media library'
                    data-om-door='library'
                  >
                    + from the media library
                  </Chip>
                }
              />
            )}
          </div>

          {/* THE REASON OF A DEAD CHIP IS A VISIBLE LINE, and the door is still ONE — the library
              chip above; a second «upload» button here would be the drift the prototype names. */}
          {!disabled && !fittings.isLoading && fittingCount === 0 && (
            <CalloutBox tone='note' className='mt-2'>
              <Text size='micro' component='p' className='normal-case'>
                {fittingsWhy}
              </Text>
            </CalloutBox>
          )}
          {disabled && <Reason className='mt-2'>this card is read-only for you</Reason>}

          {shot?.source === 'fitting' && (
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              {shot.size && <Pill tone='mut'>sample {shot.size}</Pill>}
              <Pill tone='mut'>not sent</Pill>
              <Text size='nano' variant='label' component='span' className='normal-case'>
                the date and the sample size stay on the card
              </Text>
            </div>
          )}
        </div>
      </div>

      {/* THE CHOOSER — the photographs of this card's fittings, one group per fitting. */}
      <ConfirmationModal
        open={chooserOpen}
        onOpenChange={onChooserOpenChange}
        onConfirm={() => onChooserOpenChange(false)}
        hideActions
        width='lg'
        title='the photograph · from the fittings'
        footerHint='the fitting date and the sample size stay on the card — only the photograph goes to the model'
      >
        <div className='space-y-stack'>
          {groups.length === 0 && (
            <Text size='micro' variant='label' component='p' className='normal-case'>
              {fittingsWhy || 'no photographs on the fittings of this item'}
            </Text>
          )}
          {groups.map((rows) => {
            const head = rows[0];
            return (
              <div key={head.fittingId} data-om-fitting={head.fittingId}>
                <GroupLabel
                  flush
                  action={
                    <span className='flex flex-wrap items-center gap-1.5'>
                      {head.size && <Pill tone='mut'>sample {head.size}</Pill>}
                      <Pill tone='mut'>
                        {rows.length} photograph{rows.length === 1 ? '' : 's'}
                      </Pill>
                    </span>
                  }
                >
                  {head.round > 0 ? `fitting ${head.round}` : `fitting ${head.fittingId}`}
                  {head.stamp ? ` · ${head.stamp}` : ''}
                </GroupLabel>
                <Tiles min={148}>
                  {rows.map((row, i) => {
                    const id = row.media.id ?? 0;
                    const on = (shot?.media.id ?? 0) === id;
                    return (
                      <Tile
                        key={id}
                        selected={on}
                        pressed={on}
                        title={on ? 'this photograph is the shot' : 'take this photograph'}
                        onClick={() => {
                          onChooserOpenChange(false);
                          propose(fittingShot(row));
                        }}
                        media={<ShotFace src={mediaThumb(row.media)} alt={`photograph ${i + 1}`} />}
                        name={`photograph ${i + 1}`}
                        sub={on ? 'the shot' : `media ${id}`}
                      />
                    );
                  })}
                </Tiles>
              </div>
            );
          })}
        </div>
      </ConfirmationModal>

      <AskModal
        open={!!pending}
        title='change the photograph'
        sentence={`replaces ${was}. The paint and the colourway stay.`}
        verb='replace the photo'
        onDo={() => {
          if (pending) draft.put(pending);
          setPending(null);
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
