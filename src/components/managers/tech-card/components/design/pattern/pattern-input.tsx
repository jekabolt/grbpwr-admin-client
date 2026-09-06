import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaRecropDialog } from 'components/managers/media/components/media-recrop-dialog';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useState, type JSX, type RefObject } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX } from '../assets/model';

/**
 * ═══ THE INPUT OF A TILE — ONE PICTURE AND ONE NAME, side by side ═══════════════════════════════
 *
 * Two columns under the `SOURCE PICTURE` rule: the source cell on the left (≈220 px, square — a
 * swatch photographed any old way, and a portrait frame would crop it for nothing), the NAME
 * field on the right. Each of the two knows whether it TRAVELS TO THE MODEL, and says so on its
 * own face: the filled cell carries `in the prompt`, the name carries `not sent` — the name is how
 * YOU will find the tile, and it is not the model's.
 *
 * ═══ ONE DOOR, NOT TWO (owner) ═════════════════════════════════════════════════════════════════
 *
 * The second door of the input — «or one of this card's cloths» — was taken off at the owner's
 * word, and WITH IT WENT THE ABILITY, not only the row: a cloth of the card cannot be picked as a
 * tile's source any more, a repeat is made only out of a picture of the library, the clipboard or
 * a dropped file. Written down so it is not read later as an accidental loss; `sourceAssetId`
 * therefore always travels as 0 («the source was a library file or a paste»).
 *
 * ═══ EXACTLY ONE PICTURE, AND THAT IS NOT A SETTING ═════════════════════════════════════════════
 *
 * The contract names the number: `pattern` wants EXACTLY ONE picture in `extra_input_media_ids`
 * and refuses `one_source_picture` on any other — free, before anything is reserved. The reason
 * is physical: «a tile glued out of two swatches cannot join to itself». So this is ONE slot, not
 * a list with validation: a slot for one frame makes the wrong state inexpressible.
 *
 * ═══ THE CROP IS OFFERED RIGHT AFTER THE UPLOAD (owner, E-9) ═══════════════════════════════════
 *
 * The source is most often a PHOTOGRAPH of live cloth — and on it, besides the cloth, there is the
 * table, a hand, the edge of the roll. The model reads the whole picture: what is extra in the
 * frame travels into a paid run as a motif the cloth does not have. Cropping AFTER means buying
 * the tile twice. The dialog opens from the upload door itself, and `crop ▸` stays under the frame
 * for every later time. A crop files a NEW media; the original stays in the library untouched.
 */
export function PatternInput({
  source,
  onPick,
  onClear,
  name,
  onName,
  nameRef,
  slotRef,
  disabled,
}: {
  /** What is about to travel. `null` — nothing, and the gate above the row says so. */
  source: common_MediaFull | null;
  onPick: (media: common_MediaFull) => void;
  onClear: () => void;
  name: string;
  onName: (next: string) => void;
  /** The NAME field, so the gate's `name it ›` door can put the caret exactly there. */
  nameRef: RefObject<HTMLInputElement | null>;
  /** The source cell, so the gate's `+ picture ›` door opens the same picker the cell does. */
  slotRef: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}): JSX.Element {
  const sourceUrl = source?.media?.fullSize?.mediaUrl || source?.media?.thumbnail?.mediaUrl || '';
  const sourceId = source?.id ?? 0;
  const [cropping, setCropping] = useState(false);

  return (
    <div data-pattern-input='' className='grid grid-cols-1 gap-5 md:grid-cols-2'>
      {/* ─── the source cell ────────────────────────────────────────────────────────────── */}
      <div ref={slotRef} data-pattern-source={sourceId || 'empty'} className='flex max-w-[220px] flex-col gap-1'>
        {disabled && !sourceUrl ? (
          <span
            data-inert='this card is read-only for you — a run spends money, so attaching its input stops here too'
            title='this card is read-only for you — a run spends money, so attaching its input stops here too'
            className='block w-full'
          >
            <Placeholder label='source picture' dashed aspect='square' className='w-full' />
          </span>
        ) : (
          <MediaSlot
            aspectRatio={['Custom']}
            /* THE EMPTY CELL IS SHORT — the height of the NAME column beside it, as on the
               prototype — and the FILLED cell is the square the tile will be. A 220 px square of
               stripes before anything is in it reads as a picture that failed to load. */
            frameAspect={sourceUrl ? '1/1' : '4/1'}
            label='source picture *'
            hint='click to fill'
            purpose='design · the picture a pattern is made from'
            showVideos={false}
            editMode={!disabled}
            mediaUrl={sourceUrl || undefined}
            alt={sourceId ? `picture ${sourceId}` : 'source picture'}
            onSelect={(media) => {
              const first = media[0];
              if (!first?.id) return;
              onPick(first);
              // «offer the crop RIGHT AFTER the upload» — the dialog opens from this door only.
              setCropping(true);
            }}
            onClear={sourceUrl && !disabled ? onClear : undefined}
          />
        )}

        {/* THE CAPTION OF A FILLED CELL: the picture's name and where it goes. The API carries no
            file name on a media row, so the picture is named by its number; `in the prompt` is
            the fact that matters and it is a pill, not prose. */}
        {sourceId > 0 && (
          <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
            <Text size='nano' variant='label' component='span' className='min-w-0 truncate uppercase'>
              {`picture ${sourceId}`}
            </Text>
            <Pill data-in-the-prompt=''>in the prompt</Pill>
            {!disabled && (
              <Button
                variant='secondary'
                size='xs'
                data-pattern-crop={sourceId}
                onClick={() => setCropping(true)}
                title='trim the picture down to the cloth itself — the table, the hand and the background reach the paid prompt as part of the motif'
              >
                crop ▸
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ─── the name ───────────────────────────────────────────────────────────────────── */}
      <div className='flex min-w-0 flex-col gap-1'>
        <label className='flex flex-col gap-0.5' htmlFor='design-pattern-name'>
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            name <b className='text-textColor'>*</b>
          </Text>
          <Input
            ref={nameRef}
            name='design-pattern-name'
            data-pattern-name
            aria-label='name'
            value={name}
            disabled={disabled}
            // THE LIMIT LIVES IN ONE PLACE (`ASSET_NAME_MAX`): `design_asset.name` is VARCHAR(60),
            // the door obeys the same rule, and the library screen reads the same constant.
            maxLength={ASSET_NAME_MAX}
            placeholder='twill repeat'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onName(e.target.value)}
          />
        </label>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill data-name-not-sent=''>not sent</Pill>
          <Text size='nano' variant='label' component='span'>
            the name is how you will find it
          </Text>
        </div>
      </div>

      {/* The dialog is mounted only with a live source: it pulls the original as a blob on every
          open, and mounted for nothing it would hit the network on every draw of an empty screen. */}
      {source && (
        <MediaRecropDialog
          media={source}
          open={cropping}
          onOpenChange={setCropping}
          onCropped={(cropped) => onPick(cropped)}
        />
      )}
    </div>
  );
}
