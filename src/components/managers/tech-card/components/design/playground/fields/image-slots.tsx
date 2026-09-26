import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import type { JSX } from 'react';
import Text from 'ui/components/text';

import { PictureTile } from '../../picture-tile';
import { mediaThumb } from '../../render/model';
import { ReuseDoor, type ReuseSource } from './reuse';

/**
 * ═══ THE PICTURES A PLAYGROUND RUN STARTS FROM (C-02, owner refs 5, 8, 9, 13, 14) ═══════════════
 *
 * Two shapes, one grammar:
 *
 *  · FIXED — N named slots side by side, each with its own label above it («Your design» / «New
 *    fabric», «Your garment» / «Your logo (PNG)»), each holding one picture.
 *  · GROW — one list that starts as a single empty slot and grows a slot at a time up to `max`
 *    (Create or edit: 3 references; Change a Color: up to 24 photographs). `slotCounter` gives the
 *    «optional · 0/3» the fold header prints.
 *
 * AN EMPTY SLOT IS THE UPLOAD DOOR. It is the product's `MediaSlot`: a dashed square with a +, click
 * to browse the library or upload, ⌘V to paste, drop a file on it. Under it stands ONE `Reuse` door
 * for everything else the admin already holds (this card, the model gallery, fittings, fabrics).
 * Those are the only two ways in; neither is repeated anywhere.
 *
 * A FILLED SLOT IS THE PICTURE AND ITS ✕. No `change`: taking a picture out and putting another in
 * is two obvious gestures, and a third button on a 128px frame is the clutter the owner asked us to
 * drop. So a filled fixed slot also loses its Reuse door; the door comes back with the empty slot.
 *
 * The component holds no state. It hands the caller the media (`common_MediaFull`: id for the wire,
 * url for the screen) and the caller's draft owns them.
 */

export type ImageSlotDef = {
  key: string;
  /** Shown above the slot. `''` draws no label (a lone slot under a titled fold). */
  label: string;
};

type Common = {
  /** The design band: lets Reuse offer this card's pictures and fabrics. */
  band?: GetDesignBandResponse;
  /** The card id: lets Reuse offer this card's fittings. */
  techCardId?: number;
  /** Narrow the Reuse sources (default: every source that can work here). */
  sources?: readonly ReuseSource[];
  /** What the pictures are for — the header of the library and upload dialogs. */
  purpose?: string;
  /** Label of the Reuse door; default «reuse» under a slot, «reuse an asset» under a strip. */
  reuseLabel?: string;
  disabled?: boolean;
};

export type FixedImageSlotsProps = Common & {
  mode: 'fixed';
  slots: readonly ImageSlotDef[];
  value: Readonly<Record<string, common_MediaFull | null | undefined>>;
  onChange: (next: Record<string, common_MediaFull | null>) => void;
};

export type GrowImageSlotsProps = Common & {
  mode: 'grow';
  /** The most pictures the list takes. */
  max: number;
  value: readonly common_MediaFull[];
  onChange: (next: common_MediaFull[]) => void;
};

export type ImageSlotsProps = FixedImageSlotsProps | GrowImageSlotsProps;

/** «0/3», or «optional · 0/3» — the header value of a counted image section. */
export function slotCounter(n: number, max: number, optional?: boolean): string {
  return `${optional ? 'optional · ' : ''}${n}/${max}`;
}

/** The media ids a slots value holds, in slot order — what a `wire()` sends. */
export function slotMediaIds(
  value:
    | Readonly<Record<string, common_MediaFull | null | undefined>>
    | readonly common_MediaFull[],
): number[] {
  const list = Array.isArray(value)
    ? (value as readonly common_MediaFull[])
    : Object.values(value as Record<string, common_MediaFull | null | undefined>);
  return list.map((m) => m?.id ?? 0).filter((id) => id > 0);
}

/** One slot's frame: 128px square, so two slots and their labels sit side by side in a panel. */
const CELL = 'w-32 shrink-0';

function Filled({
  media,
  alt,
  disabled,
  onRemove,
}: {
  media: common_MediaFull;
  alt: string;
  disabled?: boolean;
  onRemove: () => void;
}): JSX.Element {
  return (
    <PictureTile
      url={mediaThumb(media)}
      alt={alt}
      aspect='1/1'
      fit='cover'
      className='w-full bg-bgColor'
      onRemove={
        disabled
          ? undefined
          : { onClick: onRemove, ariaLabel: `remove ${alt}`, title: 'take it out' }
      }
    />
  );
}

function Empty({
  purpose,
  multiple,
  limit,
  disabled,
  onSelect,
}: {
  purpose: string;
  multiple?: boolean;
  limit?: number;
  disabled?: boolean;
  onSelect: (media: common_MediaFull[]) => void;
}): JSX.Element {
  return (
    <MediaSlot
      label='+ add'
      hint={null}
      purpose={purpose}
      aspectRatio={['Custom']}
      frameAspect='1/1'
      showVideos={false}
      allowMultiple={multiple}
      limit={limit}
      editMode={!disabled}
      onSelect={onSelect}
    />
  );
}

export function ImageSlots(props: ImageSlotsProps): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const { band, techCardId, sources, purpose = 'playground', disabled } = props;

  if (props.mode === 'fixed') {
    const { slots, value, onChange } = props;
    const taken = slotMediaIds(value);
    const put = (key: string, media: common_MediaFull | null) =>
      onChange({
        ...Object.fromEntries(slots.map((s) => [s.key, value[s.key] ?? null])),
        [key]: media,
      });

    return (
      <div className='flex flex-wrap items-start gap-6' data-image-slots='fixed'>
        {slots.map((slot) => {
          const media = value[slot.key] ?? null;
          const name = slot.label || 'picture';
          return (
            <div
              key={slot.key}
              className={`flex flex-col gap-2 ${CELL}`}
              data-image-slot={slot.key}
            >
              {slot.label && (
                <Text size='micro' component='span' tracking='label' className='uppercase'>
                  {slot.label}
                </Text>
              )}
              {media ? (
                <Filled
                  media={media}
                  alt={name}
                  disabled={disabled}
                  onRemove={() => put(slot.key, null)}
                />
              ) : (
                <>
                  <Empty
                    purpose={slot.label ? `${purpose} · ${slot.label}` : purpose}
                    disabled={disabled}
                    onSelect={(list) => list[0] && put(slot.key, list[0])}
                  />
                  <ReuseDoor
                    band={band}
                    techCardId={techCardId}
                    sources={sources}
                    room={1}
                    taken={taken}
                    label={props.reuseLabel ?? 'reuse'}
                    disabled={disabled}
                    onPick={(list) => list[0] && put(slot.key, list[0])}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const { max, value, onChange } = props;
  const room = Math.max(0, max - value.length);
  const add = (list: readonly common_MediaFull[]) => {
    const have = new Set(slotMediaIds(value));
    const fresh = list.filter((m) => (m.id ?? 0) > 0 && !have.has(m.id ?? 0));
    const kept = fresh.slice(0, room);
    // Say it when a paste or a pick brought more than there was room for: the strip shows what went
    // in, and silence would let a person think the rest went in too.
    if (fresh.length > kept.length) {
      showMessage(`took ${kept.length} of ${fresh.length}: the list holds ${max} at most`, 'error');
    }
    if (kept.length) onChange([...value, ...kept]);
  };

  return (
    <div className='flex flex-col gap-3' data-image-slots='grow'>
      <div className='flex flex-wrap items-start gap-2.5'>
        {value.map((media, i) => (
          <div key={media.id ?? i} className={CELL} data-image-slot={media.id ?? 0}>
            <Filled
              media={media}
              alt={`picture ${i + 1}`}
              disabled={disabled}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {room > 0 && (
          <div className={CELL}>
            <Empty
              purpose={purpose}
              multiple={room > 1}
              limit={room}
              disabled={disabled}
              onSelect={add}
            />
          </div>
        )}
      </div>
      {room > 0 && (
        <ReuseDoor
          band={band}
          techCardId={techCardId}
          sources={sources}
          room={room}
          taken={slotMediaIds(value)}
          label={props.reuseLabel ?? 'reuse an asset'}
          disabled={disabled}
          onPick={add}
        />
      )}
    </div>
  );
}
