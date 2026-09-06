import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { InertDoor, pictureUrl } from '../bench-slot';
import { Counter } from '../core';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { readProvenance } from '../provenance';
import { uploadItem } from '../upload-item';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, isCardinalView, viewLabel } from '../views';
import {
  benchSides,
  renderPlacements,
  slotOrigin,
  threedRevisions,
  threedSides,
  type BenchSide,
  type RenderPlacement,
} from './model';
import { RenderInputStrip } from './render-input-strip';

/**
 * ═══ THE TWO STRIPS OF THE FABRIC RENDER STEP, AND THE ONE STRIP OF 3D ═══════════════════════
 *
 * The prototype (`_step-render.js`, `_step-3d.js`) draws the sides of a card as HORIZONTAL STRIPS
 * of slot cells — six per strip, one per silhouette view, the empty ones included — and it draws
 * exactly two of them on FABRIC RENDER, because they read two DIFFERENT benches:
 *
 *   INPUT FLATS ─── the flat bench (`benchSides(band, 'flat', 0)`): what the render is made from.
 *                   READ ONLY here. Its writers are the bench on FLAT and the pool of unmarked
 *                   drawings under the divider; a second writing door here would bring back the
 *                   duplication that had the strip torn down once.
 *   SIDES ───────── the render bench of the studio's colourway (`threedSides(band, colorwayId)`):
 *                   what came back, and therefore what the 3D run reads. THE ONE WRITER of this
 *                   axis: put a file in, take a plate off, fill the empty sides from the card's own
 *                   renders. Every write is `setBenchSlot` / `registerUpload` with `kind: 'render'`
 *                   spelled, NO `slotId` (a `oneof` with `viewKey`: a written zero refuses the whole
 *                   write), and `expectedSlotRev` as the CAS of that one side.
 *
 * On 3D the SAME render bench is drawn once more, as INPUT · RENDERS BY VIEW — a READING with a door
 * back to FABRIC RENDER on every empty cell. Nothing is marked there: a filled render slot IS the
 * side's membership in the 3D run (`sides.filter(s => s.picture)`), there is no separate tick.
 *
 * ⚠ THE FOUR-COLUMN TABLE THAT STOOD HERE («SIDE · FLATS IN · RENDERS BACK · 3D») IS GONE. The owner
 * saw the beta and said «это не как в референсе»: the mockup has no table, it has two strips.
 *
 * ONE CELL GRAMMAR (`SlotCell`) for all three strips, as the prototype's `slotCell` is one for the
 * whole flow: a filled cell is a plate — picture, zoom, edit — with a footer naming the side and
 * where the plate came from (`run r7` / `by hand`); an empty cell is a dashed box naming the side
 * and the door that fills it. The cell is 138px wide, the mockup's own measure.
 */

/** The strip's cell — the mockup's `.pstrip-i` (138px). One measure for all three strips. */
const CELL = 'flex w-[138px] shrink-0 flex-col gap-1';
/** The plate is square, as the mockup's `.ph`; a drawing is contained in it, never cropped. */
const PLATE_ASPECT = '1/1';

const READ_ONLY_REASON =
  'this card is read-only for you — putting a render into a side is an edit of the card';

/** `run r7` / `by hand` — where a plate came from, as the mockup's origin pill spells it. */
function originWord(band: GetDesignBandResponse, side: BenchSide): string {
  const origin = slotOrigin(band, side);
  if (origin.rrev > 0) return `run r${origin.rrev}`;
  const provenance = side.picture ? readProvenance(side.picture) : null;
  if (provenance?.runId) return `run ${provenance.runId}`;
  return 'by hand';
}

/**
 * THE STRIP — `.pstrip`: a horizontal row that scrolls INSIDE its own box. A page that scrolls
 * sideways to show six cells takes every other block with it (DESIGN.md: the page never scrolls
 * sideways).
 */
function Strip({ children, ...rest }: { children: ReactNode; [k: `data-${string}`]: unknown }) {
  return (
    <div {...rest} className='flex items-stretch gap-2 overflow-x-auto pb-1'>
      {children}
    </div>
  );
}

/**
 * ONE FILLED PLATE. The frame is the studio's `PictureTile` (zoom into the shared viewer, the quiet
 * corners `edit` / `✕` when the caller hands them in); under it the footer of the mockup's `.cap`:
 * the side on the left, the origin pill on the right. The ink border around both is the mockup's
 * «filled» weight against the dashed «empty» one.
 */
function Plate({
  picture,
  label,
  required,
  origin,
  alt,
  onRemove,
  onEdit,
  saving,
}: {
  picture: common_DesignPicture;
  label: string;
  required?: boolean;
  origin: string;
  alt: string;
  onRemove?: () => void;
  onEdit?: () => void;
  saving?: boolean;
}): JSX.Element {
  return (
    <div className='flex flex-col border border-textColor bg-bgColor' data-slot-filled=''>
      <PictureTile
        url={pictureUrl(picture)}
        alt={alt}
        aspect={PLATE_ASPECT}
        fit='contain'
        gallery={picture.media ? mediaFullToViewerItem(picture.media) : undefined}
        className='w-full border-0 bg-bgColor'
        onRemove={
          onRemove
            ? {
                onClick: onRemove,
                ariaLabel: `unmark ${label}`,
                title: 'unmark — empty this side; the render stays on the card',
                disabled: saving,
                pending: saving,
              }
            : undefined
        }
        onEdit={
          onEdit
            ? {
                onClick: onEdit,
                ariaLabel: `edit the render of ${label} — draw over this picture`,
                title:
                  'draw over this render — saving makes a NEW picture; the original is never overwritten',
              }
            : undefined
        }
      />
      <div className='flex items-center justify-between gap-1 border-t border-hairline px-1.5 py-0.5'>
        <Text
          size='nano'
          variant='uppercase'
          tracking='label'
          component='span'
          className='min-w-0 truncate'
        >
          {label}
          {required ? ' *' : ''}
        </Text>
        <Pill className='shrink-0'>{saving ? 'saving…' : origin}</Pill>
      </div>
    </div>
  );
}

/**
 * ONE EMPTY CELL — a dashed box naming the side and the door that fills it. A `<button>` when the
 * cell is itself a door (3D: every empty side leads to FABRIC RENDER), a plain box otherwise.
 */
function EmptyBox({
  label,
  required,
  hint,
  onOpen,
  title,
}: {
  label: string;
  required?: boolean;
  hint: string;
  onOpen?: () => void;
  title?: string;
}): JSX.Element {
  const body = (
    <>
      <Text size='micro' variant='uppercase' tracking='label' component='span'>
        {label}
        {required ? <span className='font-bold'> *</span> : null}
      </Text>
      <Text size='micro' variant='label' component='span' className='normal-case'>
        {hint}
      </Text>
    </>
  );
  const box =
    'flex min-h-[96px] flex-1 flex-col items-center justify-center gap-0.5 border border-dashed border-borderColor bg-bgColor px-2 py-2.5 text-center';
  if (onOpen) {
    return (
      <button
        type='button'
        title={title}
        onClick={onOpen}
        className={cn(
          box,
          'cursor-pointer hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={box} title={title}>
      {body}
    </div>
  );
}

/** «in the 3D run» / «not in the 3D run» — a fact derived from the plate, the prototype's third fact. */
function ThreedWord({ side }: { side: BenchSide }): JSX.Element {
  const cardinal = isCardinalView(side.view);
  const has = !!side.picture;
  if (!cardinal) {
    return (
      <Pill
        title={`3D reads the four named sides — front, back, side L, side R; a ${viewLabel(side.view)} render stands on the bench but is not read`}
      >
        not read by 3D
      </Pill>
    );
  }
  return has ? (
    <Pill tone='ink' data-threed-in=''>
      in the 3D run
    </Pill>
  ) : (
    <Pill>not in the 3D run</Pill>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   INPUT FLATS — the flat bench, read only.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export function InputFlatsGroup({
  band,
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  onGoToKind?: (kind: 'flat' | 'render' | 'threed') => void;
}): JSX.Element {
  const flats = useMemo(() => benchSides(band, 'flat', 0), [band]);
  const filled = flats.filter((s) => !!s.picture).length;
  return (
    <div data-input-flats=''>
      <GroupLabel
        flush
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={filled} noun='side' total={flats.length} />
            {onGoToKind ? (
              <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                the flat bench ›
              </Button>
            ) : (
              <InertDoor label='the flat bench ›' reason='the flat bench is on the FLAT step of the rail above' />
            )}
          </span>
        }
      >
        input flats
      </GroupLabel>
      <Text size='micro' variant='label' component='p' className='mb-1.5 normal-case'>
        what the render is made from · one per side
      </Text>
      <Strip data-input-flats-strip=''>
        {flats.map((side) => {
          const label = viewLabel(side.view);
          const required = side.view === 'front';
          return (
            <div key={side.view} data-side-flat={side.view} className={CELL}>
              {side.picture ? (
                <Plate
                  picture={side.picture}
                  label={label}
                  required={required}
                  origin={originWord(band, side)}
                  alt={`flat · ${label}`}
                />
              ) : (
                <EmptyBox
                  label={label}
                  required={required}
                  hint='nothing marked · the flat bench fills it'
                  title={`no drawing is marked for ${label}. Mark one on FLAT, or below the line.`}
                />
              )}
            </div>
          );
        })}
      </Strip>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   SIDES — the render bench of the studio's colourway, the one writer of that axis.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export function SidesGroup({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** WHOSE render bench: one number for the whole studio (`useColorwayChoice`). */
  colorwayId?: number;
  onGoToKind?: (kind: 'flat' | 'render' | 'threed') => void;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const renders = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  /** The card's own renders that have a side to stand on — only EMPTY sides (see `renderPlacements`). */
  const placements = useMemo(() => renderPlacements(band, colorwayId), [band, colorwayId]);
  const placementOf = (view: string): RenderPlacement | undefined =>
    placements.find((p) => p.view === view);

  const canWrite = !disabled;
  const filled = renders.filter((s) => !!s.picture).length;

  /** Which side a write is in flight for. A shared `isPending` would say «saving» on all six. */
  const [busy, setBusy] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [outcome, setOutcome] = useState<{
    done: string[];
    failed: { view: string; reason: string }[];
  } | null>(null);
  /** Which plate of the render axis is in the vector editor. Zero = closed. */
  const [editingId, setEditingId] = useState(0);

  /* ⚠ NO `slotId` — a `oneof` with `viewKey`; a zero is a SET field in proto-JSON and the server
     refuses the whole write. The kind is always spelled: empty reads as flat. */
  const sideRef = (view: string): DesignBenchSlotRef => ({ viewKey: view, kind: 'render', colorwayId });

  const unmark = (view: string, slotRev: number) => {
    setBusy(view);
    writes.setBenchSlot.mutate(
      { slot: sideRef(view), pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  const placeFromRun = (placement: RenderPlacement) => {
    setBusy(placement.view);
    writes.setBenchSlot.mutate(
      { slot: sideRef(placement.view), pictureId: placement.picture.id ?? 0, expectedSlotRev: placement.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /** A file from the library straight into an empty side — one transaction (`RegisterDesignUpload` + target). */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(view);
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [uploadItem({ mediaId, ghostView: view, kind: 'render', colorwayId })],
        target: sideRef(view),
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /** Fill every empty side from the card's renders — one slot at a time, its own CAS each. */
  const fillEmpty = async () => {
    if (!placements.length || filling) return;
    setFilling(true);
    setOutcome(null);
    const done: string[] = [];
    const failed: { view: string; reason: string }[] = [];
    for (const placement of placements) {
      try {
        await writes.setBenchSlot.mutateAsync({
          slot: sideRef(placement.view),
          pictureId: placement.picture.id ?? 0,
          expectedSlotRev: placement.slotRev,
        });
        done.push(placement.view);
      } catch (error) {
        failed.push({
          view: placement.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setFilling(false);
    setOutcome(failed.length ? { done, failed } : null);
  };

  const editing =
    editingId > 0 ? renders.find((s) => (s.picture?.id ?? 0) === editingId)?.picture : null;

  const fillTitle = `${placements
    .map((p) => viewLabel(p.view))
    .join(', ')} take the newest render of this card that names them. A side that already holds a render is not touched.`;

  return (
    <div data-sides=''>
      <GroupLabel
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={filled} noun='side' total={renders.length} />
            {placements.length > 0 &&
              (canWrite ? (
                <Button
                  variant='secondary'
                  size='xs'
                  loading={filling}
                  onClick={fillEmpty}
                  title={fillTitle}
                  data-fill-empty={placements.length}
                >
                  fill {placements.length} empty side{placements.length === 1 ? '' : 's'} ▸
                </Button>
              ) : (
                <InertDoor
                  label={`fill ${placements.length} empty side${placements.length === 1 ? '' : 's'} ▸`}
                  reason={READ_ONLY_REASON}
                />
              ))}
            {onGoToKind ? (
              <>
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                  the flat bench ›
                </Button>
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('threed')}>
                  the next step ›
                </Button>
              </>
            ) : (
              <InertDoor label='the next step ›' reason='3D is the next cell of the rail above' />
            )}
          </span>
        }
      >
        sides
      </GroupLabel>
      <Text size='micro' variant='label' component='p' className='mb-1.5 normal-case'>
        a side that came back goes into the 3D run · there is nothing to mark
      </Text>
      <Strip data-sides-strip=''>
        {renders.map((side) => {
          const label = viewLabel(side.view);
          const required = side.view === 'front';
          const saving = busy === side.view;
          const back = placementOf(side.view);
          return (
            <div
              key={side.view}
              data-side-render={side.view}
              data-slot-empty={side.picture ? undefined : ''}
              data-slot-door={!side.picture && canWrite ? 'media' : undefined}
              className={CELL}
            >
              {side.picture ? (
                <Plate
                  picture={side.picture}
                  label={label}
                  required={required}
                  origin={originWord(band, side)}
                  alt={`render · ${label}`}
                  saving={saving}
                  onRemove={canWrite ? () => unmark(side.view, side.slotRev) : undefined}
                  onEdit={canWrite ? () => setEditingId(side.picture?.id ?? 0) : undefined}
                />
              ) : canWrite ? (
                <>
                  {/* The box that IS the slot takes the file itself (J-17), as an empty bench plate. */}
                  <MediaSlot
                    aspectRatio={['Custom']}
                    frameAspect={PLATE_ASPECT}
                    label={`${label}${required ? ' *' : ''}`}
                    hint={null}
                    purpose={`design · render for the ${label} slot`}
                    showVideos={false}
                    editMode
                    onSelect={(media) => {
                      const first = media[0];
                      if (first?.id) placeMedia(first, side.view, side.slotRev);
                    }}
                  />
                  <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
                    {saving
                      ? 'saving…'
                      : back
                        ? 'empty · click below to fill from a past run'
                        : 'empty · GENERATE below fills it'}
                  </Text>
                  {back && (
                    <Button
                      variant='secondary'
                      size='xs'
                      className='w-full'
                      disabled={saving || filling}
                      onClick={() => placeFromRun(back)}
                      data-fill-side={side.view}
                      title={`put the newest render of ${label} on this card into the side`}
                    >
                      from run {(back.picture.runId ?? 0) > 0 ? back.picture.runId : ''} ▸
                    </Button>
                  )}
                </>
              ) : (
                <EmptyBox
                  label={label}
                  required={required}
                  hint='empty · GENERATE below fills it'
                  title={`no render stands in ${label}.`}
                />
              )}
              <span>
                <ThreedWord side={side} />
              </span>
            </div>
          );
        })}
      </Strip>

      {outcome && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p' className='normal-case'>
            <b>
              {outcome.done.length} of {outcome.done.length + outcome.failed.length} sides took a
              render.
            </b>{' '}
            {outcome.done.length > 0 && <>Now filled: {outcome.done.map(viewLabel).join(', ')}. </>}
            {outcome.failed.length === 1 ? 'This one did not: ' : 'These did not: '}
            {outcome.failed.map((f) => `${viewLabel(f.view)} — ${f.reason}`).join('; ')}. Nothing was
            undone: the sides are separate slots. Press the door again — it now offers only what is
            left.
          </Text>
        </CalloutBox>
      )}

      {/* ═══ BELOW THE STRIP — THE DIVIDER AND THE SHEETS NOT YET RAISED INTO IT ══════════════════
          The prototype's own words: «ниже полосы — разделитель и мультивью-листы, которые ещё не
          подняты в полосу; под разделителем сырьё, над ним размеченный результат». The same organ
          as before (`RenderInputStrip`, bare): the unmarked drawings with `mark ▸`, the sheets and
          their decks, the `+ flat` door, the read to the end of the feed. */}
      {canWrite && (
        <div className='mt-2 border-t border-hairline pt-2' data-side-rows-pool=''>
          <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} bare />
        </div>
      )}

      {editing && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={editing}
          slot={null}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   INPUT · RENDERS BY VIEW — 3D reads the render bench; every empty cell is a door back.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export function RendersByViewGroup({
  band,
  colorwayId = 0,
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  colorwayId?: number;
  onGoToKind?: (kind: 'flat' | 'render') => void;
}): JSX.Element {
  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  const filled = sides.filter((s) => !!s.picture).length;
  const revisions = useMemo(() => threedRevisions(band, sides), [band, sides]);
  const toRender = onGoToKind ? () => onGoToKind('render') : undefined;
  return (
    <div id='design-threed-input' data-renders-by-view=''>
      <GroupLabel
        flush
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={filled} noun='side' total={sides.length} />
            {revisions.length > 1 && (
              <Pill
                tone='attention'
                title={`the sides on this bench come from different runs (${revisions.map((r) => `r${r}`).join(', ')}); a model stitched out of them may not match in colour`}
              >
                {revisions.length === 2 ? 'two' : revisions.length} revisions
              </Pill>
            )}
            {toRender ? (
              <Button variant='secondary' size='xs' onClick={toRender}>
                fabric render ›
              </Button>
            ) : (
              <InertDoor label='fabric render ›' reason='FABRIC RENDER is the previous cell of the rail above' />
            )}
          </span>
        }
      >
        input · renders by view
      </GroupLabel>
      <Text size='micro' variant='label' component='p' className='mb-1.5 normal-case'>
        fabric render slots, one per side
      </Text>
      <Strip data-threed-strip=''>
        {sides.map((side) => {
          const label = viewLabel(side.view);
          const required = side.view === 'front';
          return (
            <div key={side.view} data-side-render={side.view} className={CELL}>
              {side.picture ? (
                <Plate
                  picture={side.picture}
                  label={label}
                  required={required}
                  origin={originWord(band, side)}
                  alt={`render · ${label}`}
                />
              ) : (
                <EmptyBox
                  label={label}
                  required={required}
                  hint='empty · fill it on the fabric render'
                  onOpen={toRender}
                  title={`fill ${label} on FABRIC RENDER — from the renders of this card or from a file`}
                />
              )}
              <span>
                <ThreedWord side={side} />
              </span>
            </div>
          );
        })}
      </Strip>
    </div>
  );
}

/** The silhouette order the strips walk — exported for callers that count what the strips draw. */
export const STRIP_VIEWS = SILHOUETTE_VIEWS;
