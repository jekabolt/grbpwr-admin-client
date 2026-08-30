import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignEditLayer,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import MediaComponent from 'ui/components/media';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { batchCaption, pictureHandle } from './handles';
import { mixedInputNote, provenanceLabel, readProvenance, slotProvenance } from './provenance';
import { selectPickablePictures } from './visibility';

/**
 * ONE BENCH SLOT — and the vocabulary of «what a slot is», which the three other organs of the
 * bench read from here rather than spelling a second time.
 *
 * A SLOT THAT WAS NEVER TOUCHED DOES NOT EXIST ON THE SERVER. `GetDesignBand` returns only the
 * rows that have been written; the four silhouette sides are born lazily by the first
 * `SetDesignBenchSlot`. So `slot` below is honestly nullable and `slotRev` is honestly 0 for an
 * untouched side — the CAS token a lazy first placement is required to send. Rendering four rows
 * that pretend to exist would make the first write carry a rev the server never minted.
 *
 * ADDRESSING. A silhouette side is addressed BY ITS VIEW KEY forever — before birth and after —
 * because `DesignBenchSlotRef.view_key` names the four sides for their whole life. A detail is
 * addressed by its minted `slot_id` from the moment it exists, and `view_key = detail` means
 * exactly one thing: MINT A NEW ONE (name required, expected_slot_rev 0). Never by name: renaming
 * a detail must not move its plate, and two details a human called the same thing are still two
 * slots.
 */

/**
 * THE VOCABULARY MOVED OUT, and it moved because it had been written three times.
 *
 * This file, `mint-dialog.tsx` and `split-modal.tsx` each declared the sides for themselves — the
 * keys agreed, so nothing failed a type check, but the labels did not: the same side read `side L`
 * here and `SIDE L` on the mint. `./views` is now the only spelling, and these re-exports exist so
 * that the call sites inside this module keep reading the way they did.
 */
export {
  SHEET_MIN_VIEWS,
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  viewLabel,
  type SilhouetteView,
} from './views';
import { SILHOUETTE_VIEWS, isSilhouetteView, viewLabel, type SilhouetteView } from './views';


/** Total over the vocabulary: an unknown key prints itself rather than becoming a wrong side. */
export type BenchRead = {
  /** All four sides, in a fixed order, present-or-not. */
  sides: { view: SilhouetteView; slot: common_DesignBenchSlot | null }[];
  /** Every detail slot, oldest first — the order they were minted in, which is stable. */
  details: common_DesignBenchSlot[];
};

/**
 * The band's `bench` array split into the two shapes the screen draws.
 *
 * A row whose `view_key` is not one of the four sides IS a detail — that is the only classification
 * the wire supports, and it deliberately does not test for the literal `detail`: `view_key=detail`
 * is the MINT verb, and a stored detail row is addressed by id from then on.
 */
export function readBench(band: GetDesignBandResponse): BenchRead {
  const rows = band.bench ?? [];
  const byView = new Map<string, common_DesignBenchSlot>();
  const details: common_DesignBenchSlot[] = [];
  for (const row of rows) {
    const key = (row.viewKey ?? '').trim().toLowerCase();
    if (isSilhouetteView(key)) byView.set(key, row);
    else details.push(row);
  }
  details.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return {
    sides: SILHOUETTE_VIEWS.map((view) => ({ view, slot: byView.get(view) ?? null })),
    details,
  };
}

/**
 * A name collision between two details is LEGAL, and the display adds a `(2)` suffix rather than
 * the store mutating the name. Renaming one must not renumber the other, and the sheet cites a
 * detail by the name it was minted with.
 */
export function displayDetailName(
  details: readonly common_DesignBenchSlot[],
  slot: common_DesignBenchSlot,
): string {
  const name = (slot.detailName ?? '').trim() || 'detail';
  const same = details.filter((d) => ((d.detailName ?? '').trim() || 'detail') === name);
  if (same.length < 2) return name;
  return `${name} (${same.indexOf(slot) + 1})`;
}

/** A stable string identity for a slot ref — the key of the optimistic map and of pick targets. */
export function slotRefKey(ref: DesignBenchSlotRef): string {
  if (ref.slotId) return `id:${ref.slotId}`;
  return `view:${(ref.viewKey ?? '').trim().toLowerCase()}`;
}

/** The live row a ref addresses, or null when the slot has never been written. */
export function findSlot(
  band: GetDesignBandResponse,
  ref: DesignBenchSlotRef,
): common_DesignBenchSlot | null {
  const rows = band.bench ?? [];
  // A stored silhouette row carries BOTH an id and a view key; callers address it by the VIEW, so
  // matching on the id alone would miss every side and re-mint it with rev 0 on the next write.
  if (ref.slotId) return rows.find((row) => row.id === ref.slotId) ?? null;
  const view = (ref.viewKey ?? '').trim().toLowerCase();
  if (!view || view === 'detail') return null;
  return rows.find((row) => (row.viewKey ?? '').trim().toLowerCase() === view) ?? null;
}

/**
 * Every picture on the card that MAY be clicked into a slot.
 *
 * Two exclusions, both from the contract rather than from taste: a hidden picture must not be
 * reachable from any picker (`selectPickablePictures`, which has no reveal hatch on purpose), and
 * a COMPOSITE has no single view — it must be split first, so it is not a candidate at all.
 *
 * Deliberately NOT filtered by `kind`: the generative machine is cut in this wave, every picture
 * on a live card arrives through a batch, and a kind filter written against a dictionary this
 * bundle has not seen in production would silently empty the picker.
 */
export function pickableFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  return selectPickablePictures(all).filter((p) => (p.compositeViews ?? []).length === 0);
}

/**
 * WHY THE PICKER IS EMPTY, in words. Г12: a live door onto a band with nothing in it sends the
 * human to click on pictures that are not there, and the only way out is an Esc they have to know
 * about. The door says WHICH of the three reasons it is instead.
 */
export function pickEmptyReason(band: GetDesignBandResponse): string | null {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  if (pickableFlats(band).length > 0) return null;
  if (all.length === 0) return 'nothing to pick yet — add files first';
  const composites = all.filter((p) => (p.compositeViews ?? []).length > 0).length;
  if (composites === all.length) {
    return `nothing to pick yet — all ${all.length} pictures are composites; split one first`;
  }
  return `nothing to pick yet — every picture on this card is hidden or a composite`;
}

/** The current revision of an edit layer drawn over this exact media, if there is one. */
export function liveLayerRev(
  layers: readonly common_DesignEditLayer[] | undefined,
  mediaId?: number | null,
): number | undefined {
  if (!mediaId) return undefined;
  const layer = (layers ?? []).find((l) => l.baseMediaId === mediaId);
  return typeof layer?.rev === 'number' ? layer.rev : undefined;
}

/** The address of the file to draw. Thumbnail first — a bench frame is 200px wide, not 2000. */
export function pictureUrl(picture?: common_DesignPicture | null): string {
  const media = picture?.media?.media;
  return media?.thumbnail?.mediaUrl || media?.fullSize?.mediaUrl || '';
}

/**
 * The footer line of a filled slot: WHERE THE PLATE IS FROM, in the band's own address vocabulary.
 * Provenance label first (`uploaded`, `AI · run 5`, `provenance unknown`), then the handle
 * (`upload 3 · b`), then the batch's own stamp — author and clock — when the plate came by hand.
 */
export function slotFootnote(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
  shelfOrdinals: Map<number, number>,
): string {
  const provenance = readProvenance(picture);
  const parts = [provenanceLabel(provenance)];
  const ordinal = picture.batchId ? shelfOrdinals.get(picture.batchId) : undefined;
  parts.push(pictureHandle(picture, { shelfOrdinal: ordinal }));
  const batch = (band.batches ?? []).find((b) => b.id === picture.batchId);
  if (batch) {
    // `batchCaption` opens with the word «uploaded», which `provenanceLabel` has already said.
    const caption = batchCaption(batch).replace(/^uploaded(\s·\s)?/, '');
    if (caption) parts.push(caption);
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * A control that is drawn and deliberately dead, WITH ITS REASON ATTACHED.
 *
 * The wave's own rule: what was cut is `data-inert` with a reason, never absence. A missing door
 * teaches the human that the flow does not exist; a dead one with a reason teaches that it is not
 * here YET, which is the true statement.
 */
export function InertDoor({
  label,
  reason,
  className,
}: {
  label: React.ReactNode;
  reason: string;
  className?: string;
}) {
  return (
    <span data-inert={reason} title={reason} className={cn('inline-flex', className)}>
      <Button variant='secondary' size='xs' disabled>
        {label}
      </Button>
    </span>
  );
}

/**
 * THE FIX FLOW IS NOT BUILT, AND ITS ABSENCE IS THE DECISION.
 *
 * The prototype draws two bars under a slot — «fix is running» and «fix is in · put it in» — and a
 * known defect of it (Г4) is that both were drawn inside a FILLED slot only, so taking the plate
 * off while a fix ran made the whole promised flow evaporate. That fix would have been to call them
 * from the empty slot too.
 *
 * Neither is here, because a fix takes its picture from a GENERATION RUN and the generative machine
 * is cut from this wave: `params.fix_target` is never set, `band.runs` is empty on every live card,
 * and a bar that can never light is not groundwork — it is a dead organ that reads as broken. When
 * generation returns, the bars come back WITH the Г4 amendment: they address the SLOT, not the
 * plate, so the empty slot draws them too.
 */

export type BenchSlotProps = {
  band: GetDesignBandResponse;
  /** The wire address of this slot — a view key for a side, a minted id for a detail. */
  slotRef: DesignBenchSlotRef;
  /** The stored row, or null for a side that has never been touched. */
  slot: common_DesignBenchSlot | null;
  /** Human name — FRONT, or the detail's DISPLAYED name (which may carry a `(2)` suffix). */
  label: string;
  /** What stands there right now, optimistic value included. */
  picture: common_DesignPicture | null;
  /** The CAS token the next write must echo. 0 = the slot does not exist yet. */
  slotRev: number;
  detail?: boolean;
  /** In the sheet minimum — an empty one is red and the mint is unreachable. */
  required?: boolean;
  /** A write for this slot is in flight or its refetch has not landed. */
  saving?: boolean;
  /** Pick mode is armed FOR THIS SLOT. */
  picking?: boolean;
  /** Why the band offers nothing to pick, or null when it does (Г12). */
  pickEmpty?: string | null;
  /** Writers frozen — by prop, never by `<fieldset disabled>`, which mutes clicks and nothing else. */
  disabled?: boolean;
  shelfOrdinals: Map<number, number>;
  onPlaceMedia: (media: common_MediaFull) => void;
  onPick: () => void;
  onCancelPick: () => void;
  onUnmark: () => void;
  onOpenViewer?: () => void;
  /** Details only. */
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Details only: why this slot may not be removed, or null. */
  deleteBlocked?: string | null;
};

export function BenchSlot(props: BenchSlotProps) {
  const {
    band,
    slotRef,
    slot,
    label,
    picture,
    detail,
    required,
    saving,
    picking,
    pickEmpty,
    disabled,
    shelfOrdinals,
    onPlaceMedia,
    onPick,
    onCancelPick,
    onUnmark,
    onOpenViewer,
    onRename,
    onDelete,
    deleteBlocked,
  } = props;

  const provenance = picture ? slotProvenance({ picture }) : null;
  const url = pictureUrl(picture);

  /**
   * STALENESS OF A LIVE PLATE READS EXACTLY ONE WAY, and that asymmetry is the contract's, not an
   * omission: `content_hash` lives on a version's frozen PLATE, never on a live picture (which IS
   * the current file, so a second copy could only disagree with the first). So the only cause that
   * can fire here is `layer_advanced` — somebody saved newer strokes over the drawing this picture
   * was flattened from.
   */
  const stale =
    provenance &&
    typeof liveLayerRev(band.layers, picture?.media?.id) === 'number' &&
    liveLayerRev(band.layers, picture?.media?.id)! > provenance.layerRev
      ? 'the edit layer has moved on — this picture is an older flattening'
      : null;

  const mixedNote = provenance ? mixedInputNote(provenance) : null;

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <div className='flex items-baseline gap-1'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {label}
        </Text>
        {required && (
          <Text size='micro' component='span' className='text-error' title='the sheet needs it'>
            *
          </Text>
        )}
        {saving && (
          <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
            saving…
          </Text>
        )}
      </div>

      {url ? (
        <div
          className={cn(
            'relative border',
            picking ? 'border-textColor' : 'border-textInactiveColor',
          )}
          style={{ aspectRatio: '4/5' }}
        >
          {/* `contain`, not `cover`: a flat is a DRAWING and a crop of it loses the garment's
              outline, which is the one thing the sheet is printed for. */}
          <MediaComponent src={url} alt={label} aspectRatio='auto' fit='contain' />
          <span className='pointer-events-none absolute left-1 top-1 z-10 bg-textColor px-1.5 py-0.5'>
            <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
              {label}
            </Text>
          </span>
          {onOpenViewer && (
            <button
              type='button'
              aria-label={`open ${label}`}
              onClick={onOpenViewer}
              className='absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            />
          )}
        </div>
      ) : (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label={`+ add ${label}`}
          hint={null}
          purpose={`design bench · ${label}`}
          showVideos={false}
          editMode={!disabled}
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) onPlaceMedia(first);
          }}
          className={picking ? 'border-textColor' : undefined}
        />
      )}

      {/* THE SECOND DOOR, and it is equal in weight to the first: mark something the band already
          holds. At zero candidates it becomes an inert note with the reason (Г12) instead of a live
          control that sends the human to click on pictures that are not there. */}
      {!disabled && !picture && (
        <div>
          {pickEmpty ? (
            <span data-inert={pickEmpty} title={pickEmpty}>
              <Text size='nano' variant='label' component='span'>
                {pickEmpty}
              </Text>
            </span>
          ) : picking ? (
            <button
              type='button'
              onClick={onCancelPick}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                choosing — click a picture in the band · cancel
              </Text>
            </button>
          ) : (
            <button
              type='button'
              onClick={onPick}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                or mark a picture from the band
              </Text>
            </button>
          )}
        </div>
      )}

      {detail && onRename && (
        <DetailNameField name={(slot?.detailName ?? '').trim()} disabled={disabled} onRename={onRename} />
      )}

      <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
        {picture ? (
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            {slotFootnote(band, picture, shelfOrdinals)}
          </Text>
        ) : (
          <Text
            size='nano'
            component='span'
            className={required ? 'text-error' : 'text-labelColor'}
          >
            <b>empty</b>
            {required ? ' · the sheet needs it' : ''}
          </Text>
        )}

        {/* `shrink-0` ЗДЕСЬ ПЕРЕПОЛНЯЛО КОЛОНКУ, и это было видно только замером: три контрола
            занимают 211px, а колонка слота при четырёх сторонах — 196px, поэтому подвал FRONT
            наезжал на подвал BACK. Ни `tsc`, ни утверждение по тексту этого не видят — `innerText`
            одинаков при любой ширине. Группа теперь переносится внутри себя и умеет сжиматься. */}
        <span className='ml-auto flex flex-wrap items-center gap-1.5'>
          {/* `edit ▸` is a door onto a feature that EXISTS as a plan and ships inert this wave
              (F-7, migration 0343) — the wave's rule is that a cut door carries `data-inert` with a
              reason rather than vanishing, so a human learns it is «not yet» and not «never». The
              fix bars were cut outright instead, because they report on a flow that cannot occur at
              all while generation is gone. */}
          {!disabled && picture && (
            <InertDoor label='edit ▸' reason='the vector editor arrives in the next wave' />
          )}
          {!disabled && picture && (
            <MediaSelector
              label='change'
              purpose={`design bench · ${label}`}
              aspectRatio={['Custom']}
              allowMultiple={false}
              showVideos={false}
              triggerClassName='px-1.5 py-px text-micro uppercase tracking-label cursor-pointer border border-textInactiveColor hover:bg-textColor hover:text-bgColor'
              saveSelectedMedia={(media) => {
                const first = media[0];
                if (first?.id) onPlaceMedia(first);
              }}
            />
          )}
          {!disabled && picture && (
            <Button variant='secondary' size='xs' onClick={onUnmark}>
              unmark
            </Button>
          )}
          {!disabled &&
            detail &&
            onDelete &&
            // A DISABLED BUTTON DOES NOT SHOW ITS OWN `title`: pointer events are suppressed on it,
            // so the reason has to hang on a wrapper that still receives the hover.
            (deleteBlocked ? (
              <span data-inert={deleteBlocked} title={deleteBlocked} className='inline-flex'>
                <Button variant='secondary' size='xs' disabled>
                  ✕
                </Button>
              </span>
            ) : (
              <Button
                variant='secondary'
                size='xs'
                title='remove this detail slot'
                onClick={onDelete}
              >
                ✕
              </Button>
            ))}
        </span>
      </div>

      {mixedNote && (
        <Text size='nano' variant='label' component='span'>
          {mixedNote}
        </Text>
      )}
      {stale && (
        <Text size='nano' component='span' className='text-warning'>
          {stale}
        </Text>
      )}
    </div>
  );
}

/**
 * The detail's name field. Renaming goes through `SetDesignBenchSlot` with the slot's CURRENT
 * picture echoed back — the RPC's `picture_id` is not optional and 0 means UNMARK, so a rename that
 * forgot to carry the plate would silently empty the slot it was renaming.
 */
function DetailNameField({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  // The server's name wins whenever it changes underneath — somebody else may have renamed it.
  useEffect(() => setValue(name), [name]);
  const commit = () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    onRename(next);
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      aria-label='detail name'
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

/**
 * The cell that MINTS a detail — and the name comes before the picture, which is the whole rule of
 * this cell. A detail slot is addressed by id and cited by name on a printed sheet; a nameless one
 * would be born with nothing to call it and the server refuses it
 * (`FailedPrecondition:detail_name_required`). So the doors do not open until the field has a word
 * in it: they say so and put the caret where the answer goes.
 */
export function NewDetailCell({
  disabled,
  pickEmpty,
  onPlaceMedia,
  onPick,
}: {
  disabled?: boolean;
  pickEmpty?: string | null;
  onPlaceMedia: (media: common_MediaFull, name: string) => void;
  onPick: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [bad, setBad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const named = name.trim();

  const demandName = () => {
    setBad(true);
    inputRef.current?.focus();
  };

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        new detail
      </Text>

      {named && !disabled ? (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label={`+ fill ${named}`}
          hint={null}
          purpose={`design bench · ${named}`}
          showVideos={false}
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) {
              onPlaceMedia(first, named);
              setName('');
              setBad(false);
            }
          }}
        />
      ) : (
        <button
          type='button'
          disabled={disabled}
          onClick={demandName}
          aria-label='name the detail first'
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: '4/5' }}
          className={cn(
            placeholderClass({ dashed: true }),
            'w-full cursor-pointer flex-col gap-1 px-2 text-center text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            bad && 'border-error text-error',
          )}
        >
          <span className='leading-tight'>+ detail</span>
        </button>
      )}

      <Input
        ref={inputRef}
        value={name}
        disabled={disabled}
        placeholder='name this detail'
        aria-invalid={bad || undefined}
        aria-label='new detail name'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setName(e.target.value);
          if (e.target.value.trim()) setBad(false);
        }}
      />

      <div>
        {pickEmpty ? (
          <span data-inert={pickEmpty} title={pickEmpty}>
            <Text size='nano' variant='label' component='span'>
              {pickEmpty}
            </Text>
          </span>
        ) : (
          !disabled && (
            <button
              type='button'
              onClick={() => {
                if (!named) {
                  demandName();
                  return;
                }
                onPick(named);
                // The name has been handed to the pick target; leaving it in the field would offer
                // to mint a SECOND detail of the same name on the next gesture.
                setName('');
                setBad(false);
              }}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                or mark from the band
              </Text>
            </button>
          )
        )}
      </div>

      <Text size='nano' component='span' className={bad ? 'text-error' : 'text-labelColor'}>
        <b>new</b> · name it, then fill it
      </Text>
    </div>
  );
}
