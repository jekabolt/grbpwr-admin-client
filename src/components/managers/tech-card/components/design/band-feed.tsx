import type {
  GetDesignBandResponse,
  common_DesignBatch,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useMemo, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import {
  MediaViewer,
  mediaFullListToViewerItems,
  mediaFullViewerSrc,
  type MediaViewerItem,
} from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { serverSpeaksDesign } from './capability';
import {
  CompositeBadge,
  CompositeMarks,
  compositeTail,
  readComposite,
  splitVerb,
} from './generation/composite';
import { batchCaption, clockStamp, pictureHandle, runHandle, shelfBatchOrdinals } from './handles';
import { usePickMode } from './pick-mode';
import { mixedInputNote, provenanceLabel, readProvenance } from './provenance';
import { SplitModal, isComposite } from './split-modal';
import { useDesignWrites } from './use-design-band';
import {
  canOfferHide,
  hiddenCountOfBatch,
  hiddenCountOfRun,
  hideBlockReason,
  isPictureHidden,
  selectVisiblePictures,
  type HideBlockReason,
  type HideGuard,
} from './visibility';
import { viewLabel } from './views';

/**
 * THE FEED — rows of pictures, and the one place the band is looked at rather than assembled.
 *
 * A ROW IS A PRODUCER, and there are exactly two kinds: a RUN (money was spent) and a BATCH (a
 * person brought files). They are drawn identically on purpose — the same gutter line, the same
 * `· k hidden ▸` link, the same tiles — because the difference between them is provenance, and
 * provenance is printed on the tile where it belongs, not encoded in a second row shape.
 *
 * THE FEED IS ALSO THE ANSWERING SIDE OF PICK MODE. When the bench arms a slot, every tile that
 * MAY go into a slot becomes clickable and every tile that may not stays inert — and if NOT ONE
 * tile qualifies, the feed says so in words rather than presenting a page of dead pictures and
 * letting the operator conclude the mode is broken.
 *
 * WHAT THIS WAVE ACTUALLY SHOWS. The generative half is cut (`17-GAPS` Р-4): there is no GENERATE
 * button, no run machine, and beta holds zero runs. `BandFeed` therefore renders NOTHING at all
 * when `band.runs` is empty — the section is ABSENT, not an empty header — and the whole live path
 * runs through `UploadsShelf`, which draws its batch rows with the very same organs exported here.
 * Both doors, one set of rows: when runs do arrive, the merged feed is already written.
 */

/* ────────────────────────────── reading the band ────────────────────────────── */

/** Every picture the band shipped, runs and batches alike, hidden ones included. */
export function bandPictures(band: GetDesignBandResponse): common_DesignPicture[] {
  const out: common_DesignPicture[] = [];
  (band.runs ?? []).forEach((run) => out.push(...(run.pictures ?? [])));
  (band.batches ?? []).forEach((batch) => out.push(...(batch.pictures ?? [])));
  return out;
}

/**
 * May this picture be dropped into a bench slot?
 *
 * TWO rules, and only one of them belongs to `visibility.ts`. A hidden picture is unreachable from
 * every picker — that is the frozen module's rule and it is read through `selectPickablePictures`
 * semantics here. A COMPOSITE is a second, unrelated refusal: it holds several views at once, a
 * slot holds one, and the contract says in as many words that it «is not clickable into a slot and
 * must be split first». Folding compositeness into the visibility module would put a second,
 * non-visibility register into the one file that exists to keep invisibility singular.
 */
export function isPickablePicture(picture: common_DesignPicture): boolean {
  return !isPictureHidden(picture) && !isComposite(picture);
}

/**
 * The four preconditions of `HideDesignPicture`, gathered from the band that is already on screen.
 *
 * TWO OF THE FOUR ARE ADDRESSED BY MEDIA, NOT BY PICTURE. A frozen sheet plate carries
 * `media`, and a run's input snapshot carries `media_id` — neither carries a picture id, because
 * both froze a FILE rather than a row. So they are resolved the only way they can be: media id →
 * every picture standing on that media.
 *
 * AND THE VERSION HALF IS DELIBERATELY UNDER-APPROXIMATE. The band ships only the LATEST version in
 * full (`version_numbers` is a list of integers), so a plate frozen in v1 but absent from v3 is not
 * seen here and its picture will be offered a ✕ that the server then refuses with `in_version`.
 * That refusal names the same reason this guard would have named — which is exactly why the codes
 * in `visibility.ts` are the server's own strings and not a second vocabulary.
 */
export function buildHideGuard(band: GetDesignBandResponse): HideGuard {
  const pictures = bandPictures(band);

  const byMedia = new Map<number, number[]>();
  pictures.forEach((picture) => {
    const mediaId = picture.media?.id ?? 0;
    const pictureId = picture.id ?? 0;
    if (mediaId <= 0 || pictureId <= 0) return;
    const bucket = byMedia.get(mediaId);
    if (bucket) bucket.push(pictureId);
    else byMedia.set(mediaId, [pictureId]);
  });
  const picturesOfMedia = (mediaId?: number) =>
    mediaId && mediaId > 0 ? byMedia.get(mediaId) ?? [] : [];

  const slotPictureIds = new Set<number>();
  (band.bench ?? []).forEach((slot) => {
    const id = slot.pictureId ?? 0;
    if (id > 0) slotPictureIds.add(id);
  });

  const versionPlatePictureIds = new Set<number>();
  (band.latestVersion?.plates ?? []).forEach((plate) => {
    picturesOfMedia(plate.media?.id).forEach((id) => versionPlatePictureIds.add(id));
  });

  const liveRunInputPictureIds = new Set<number>();
  (band.runs ?? [])
    .filter((run) => run.status === 'pending' || run.status === 'running')
    .forEach((run) => {
      (run.inputs?.slots ?? []).forEach((slot) => {
        picturesOfMedia(slot.mediaId || slot.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
      (run.inputs?.refs ?? []).forEach((ref) => {
        picturesOfMedia(ref.mediaId || ref.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
    });

  const cropParentPictureIds = new Set<number>();
  pictures.forEach((picture) => {
    const parent = picture.derivedFrom ?? 0;
    if (parent > 0) cropParentPictureIds.add(parent);
  });

  return {
    slotPictureIds,
    versionPlatePictureIds,
    liveRunInputPictureIds,
    cropParentPictureIds,
  };
}

/** Which bench slot this picture stands in, spoken the way the slot is spoken. */
function slotNameOfPicture(band: GetDesignBandResponse, pictureId: number): string {
  const slot = (band.bench ?? []).find((s) => (s.pictureId ?? 0) === pictureId);
  if (!slot) return '';
  return (slot.detailName ?? '').trim() || viewLabel(slot.viewKey) || 'a slot';
}

/**
 * The refusal, in the operator's words. The machine token stays the server's (`visibility.ts`); this
 * is only its translation, and there is one string per token so a refusal cannot be half-named.
 */
const HIDE_BLOCK_SHORT: Record<HideBlockReason, string> = {
  in_slot: 'kept · in a slot',
  in_version: 'kept · in a version',
  live_run_input: 'kept · a run reads it',
  live_crop_parent: 'kept · a crop needs it',
};

const HIDE_BLOCK_LONG: Record<HideBlockReason, string> = {
  in_slot: 'this picture stands in a bench slot — unmark it there first',
  in_version: 'this picture is frozen into a minted sheet version and must stay printable',
  live_run_input: 'a run that has not finished is reading this picture',
  live_crop_parent: 'a crop cut from this picture still exists',
};

/* ────────────────────────────── the tile ────────────────────────────── */

function thumbOf(media?: common_MediaFull): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}

export function PictureTile({
  band,
  picture,
  shelfOrdinal,
  guard,
  disabled,
  onZoom,
  onHide,
  onSplit,
}: {
  band: GetDesignBandResponse;
  picture: common_DesignPicture;
  shelfOrdinal?: number | null;
  guard: HideGuard;
  disabled?: boolean;
  onZoom: () => void;
  onHide: (pictureId: number, hidden: boolean) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const pick = usePickMode();
  const hidden = isPictureHidden(picture);
  // The same reading the history's tile uses — one module, so a composite says the same thing
  // whichever row it arrived on. `declared` is false while nothing writes `composite_views`.
  const facts = readComposite(band, picture);
  const composite = facts.declared;
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture, { shelfOrdinal });
  const pictureId = picture.id ?? 0;
  const inSlot = slotNameOfPicture(band, pictureId);

  /**
   * PICK MODE TAKES THE TILE OVER, and it takes the footer with it. A clickable tile is a real
   * `<button>` (see `ui/components/tiles`), and a button may not contain buttons — so while a slot
   * is armed the tile answers exactly one gesture, «put this one in», and its own controls step
   * aside. That is also the honest reading of the mode: nothing else is being asked for.
   */
  const armed = !!pick.target;
  const pickable = armed && isPickablePicture(picture);

  const blockReason = hidden ? null : hideBlockReason(pictureId, guard);
  const mayHide = !disabled && canOfferHide(picture, guard);
  const mixed = mixedInputNote(provenance);

  const thumb = thumbOf(picture.media);
  const media = (
    <div
      className={cn('relative w-full bg-bgSecondary', hidden && 'opacity-40')}
      style={{ aspectRatio: '4 / 5' }}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={handle}
          loading='lazy'
          className='absolute inset-0 block h-full w-full'
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Text size='nano' variant='label' component='span'>
            no image
          </Text>
        </span>
      )}
      {/* One mark per glued view on a composite; the single guess otherwise. Exclusive by
          construction — a composite can never stand in a slot. */}
      {composite ? (
        <CompositeMarks facts={facts} />
      ) : inSlot ? (
        <span className='absolute left-0 top-0 bg-textColor px-1 text-nano uppercase text-bgColor'>
          {inSlot}
        </span>
      ) : picture.ghostView ? (
        <span className='absolute left-0 top-0 bg-bgColor px-1 text-nano uppercase text-labelColor'>
          probably {viewLabel(picture.ghostView)}
        </span>
      ) : null}
      <CompositeBadge facts={facts} />
    </div>
  );

  const sub = (
    <>
      {provenanceLabel(provenance)}
      {compositeTail(facts)}
      {mixed ? ` · ${mixed}` : ''}
    </>
  );

  if (armed) {
    return (
      <Tile
        media={media}
        name={handle}
        sub={sub}
        selected={pickable}
        onClick={pickable ? () => pick.resolve(pictureId) : undefined}
        title={
          pickable
            ? `put ${handle} into ${pick.target?.label ?? 'the slot'}`
            : composite
              ? 'a composite holds several views — split it first'
              : 'hidden pictures are not offered'
        }
        className={pickable ? '' : 'opacity-40'}
      >
        {!pickable && (
          <Text size='nano' variant='label' component='span' className='mt-1 truncate'>
            {composite ? 'split it first' : 'hidden'}
          </Text>
        )}
      </Tile>
    );
  }

  return (
    <Tile media={media} name={handle} sub={sub} className={hidden ? 'border-dashed' : ''}>
      <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5'>
        <TileAction onClick={onZoom}>zoom</TileAction>
        {/* OFFERED ON EVERY VISIBLE PICTURE, and deliberately not gated on `composite_views`. That
            column has no writer while generation is cut, so a gate on it would hide the door on
            precisely the pictures this wave is made of — a sheet of three flats brought by hand.
            What each piece IS gets declared in the modal, one view per frame. */}
        {!disabled && !hidden && (
          <TileAction onClick={() => onSplit(picture)}>
            {composite ? splitVerb(facts) : 'split ▸'}
          </TileAction>
        )}
        {hidden ? (
          !disabled && <TileAction onClick={() => onHide(pictureId, false)}>unhide</TileAction>
        ) : mayHide ? (
          <TileAction
            onClick={() => onHide(pictureId, true)}
            label='hide this picture — reversible'
          >
            ✕ hide
          </TileAction>
        ) : blockReason ? (
          <Text
            size='nano'
            variant='label'
            component='span'
            title={HIDE_BLOCK_LONG[blockReason]}
            className='truncate'
          >
            {HIDE_BLOCK_SHORT[blockReason]}
          </Text>
        ) : null}
      </div>
    </Tile>
  );
}

function TileAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      title={label}
      className='cursor-pointer text-nano uppercase tracking-label text-labelColor underline hover:text-textColor'
    >
      {children}
    </button>
  );
}

/* ────────────────────────────── the rows ────────────────────────────── */

export type FeedRowModel = {
  key: string;
  /** Sort key of the merged feed. Empty sorts last, which is where an undated row belongs. */
  createdAt: string;
  /** The gutter line: who produced this row, when, and what it cost or weighed. */
  meta: React.ReactNode;
  pictures: common_DesignPicture[];
  /** Hidden count over the WHOLE producer, read from the band aggregates — never counted here. */
  hiddenCount: number;
  /** 1-based position of a batch on this card's shelf; absent on a run row. */
  shelfOrdinal?: number;
};

/**
 * THE ROWS ORGAN. Owns the writes, the split door, the zoom viewer and the per-row `k hidden`
 * toggle, so that the two sections above it (the merged feed and the uploads shelf) differ only in
 * which rows they hand it.
 */
export function FeedRows({
  techCardId,
  band,
  rows,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  rows: FeedRowModel[];
  disabled?: boolean;
}) {
  const speaks = serverSpeaksDesign();
  const { hidePicture } = useDesignWrites(techCardId);
  const guard = useMemo(() => buildHideGuard(band), [band]);

  /** Transient, one row at a time, and never consulted by a picker. */
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);

  const writesOff = !!disabled || !speaks;

  const onHide = useCallback(
    (pictureId: number, hidden: boolean) => {
      if (writesOff) return;
      hidePicture.mutate({ pictureId, hidden });
    },
    [hidePicture, writesOff],
  );

  const openZoom = useCallback(
    (pictures: common_DesignPicture[], picture: common_DesignPicture) => {
      // The viewer drops frames without an address, so the INDEX has to be computed on the already
      // filtered row — otherwise one address-less picture shifts everything behind it and the meta
      // panel describes the wrong file.
      const withSrc = pictures
        .map((p) => p.media)
        .filter((m): m is common_MediaFull => !!m && !!mediaFullViewerSrc(m));
      // An empty stage is not a viewer, it is a black rectangle with no exit worth the name.
      if (!withSrc.length) return;
      const index = Math.max(
        0,
        withSrc.findIndex((m) => m.id === picture.media?.id),
      );
      setViewer({ items: mediaFullListToViewerItems(withSrc), index });
    },
    [],
  );

  return (
    <div className='space-y-stack'>
      {rows.map((row) => {
        const reveal = !!revealed[row.key];
        const shown = selectVisiblePictures(row.pictures, { revealHidden: reveal });
        return (
          <div key={row.key} className='space-y-1'>
            <div className='flex flex-wrap items-baseline gap-2 border-b border-rule pb-0.5'>
              {row.meta}
              {row.hiddenCount > 0 && (
                <button
                  type='button'
                  onClick={() => setRevealed((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                  aria-expanded={reveal}
                  className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
                >
                  · {row.hiddenCount} hidden {reveal ? '▾' : '▸'}
                </button>
              )}
            </div>
            {shown.length ? (
              <Tiles min={140}>
                {shown.map((picture) => (
                  <PictureTile
                    key={picture.id}
                    band={band}
                    picture={picture}
                    shelfOrdinal={row.shelfOrdinal}
                    guard={guard}
                    disabled={writesOff}
                    onZoom={() => openZoom(shown, picture)}
                    onHide={onHide}
                    onSplit={(p) =>
                      setSplitting({
                        picture: p,
                        handle: pictureHandle(p, { shelfOrdinal: row.shelfOrdinal }),
                      })
                    }
                  />
                ))}
              </Tiles>
            ) : (
              <Text size='micro' variant='label'>
                every picture of this row is hidden — the link above brings them back
              </Text>
            )}
          </div>
        );
      })}

      {viewer && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          open
          onOpenChange={(open) => !open && setViewer(null)}
          onIndexChange={(index) => setViewer((prev) => (prev ? { ...prev, index } : prev))}
        />
      )}

      {splitting && (
        <SplitModal
          techCardId={techCardId}
          picture={splitting.picture}
          handle={splitting.handle}
          open
          onOpenChange={(open) => !open && setSplitting(null)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────── pick mode ────────────────────────────── */

/**
 * THE REFUSAL OF PICK MODE, IN WORDS — and ONLY the refusal.
 *
 * The «choosing for FRONT» banner belongs to the tab that owns the mode, and it is already drawn
 * there; a second copy of it inside every section would say the same sentence three times. What the
 * banner CANNOT say is whether this particular pool has anything to offer, because the two rules
 * that decide it live down here. So this organ is silent while candidates exist and speaks only
 * when there are none — an armed slot over a page of inert tiles is otherwise indistinguishable
 * from a mode that is simply broken.
 *
 * The two rules are the ones that produced the zero: hidden pictures are not offered from any
 * picker, and a composite has to be split before it can mean one view.
 */
export function PickModeNote({ band }: { band: GetDesignBandResponse }) {
  const pick = usePickMode();
  if (!pick.target) return null;

  const pictures = bandPictures(band);
  if (pictures.some(isPickablePicture)) return null;

  const hidden = pictures.filter(isPictureHidden).length;
  const composites = pictures.filter(isComposite).length;
  const why = !pictures.length
    ? 'there is not a single picture on this card yet — bring files in with «+ add files».'
    : [
        composites
          ? `${composites} composite${composites === 1 ? '' : 's'} must be split first`
          : '',
        hidden ? `${hidden} hidden` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <CalloutBox tone='error'>
      <b>nothing here can go into {pick.target.label}.</b> {why} Esc cancels.
    </CalloutBox>
  );
}

/* ────────────────────────────── the merged feed ────────────────────────────── */

function runMeta(run: common_DesignRun): React.ReactNode {
  const status = (run.status ?? '').trim();
  const ask = (run.ask ?? '').trim();
  const author = (run.author ?? '').trim();
  const segments = [runHandle(run.id), ask, author, clockStamp(run.createdAt)].filter(Boolean);
  return (
    <>
      <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
        {segments.join(' · ')}
      </Text>
      {status && status !== 'done' && (
        <Pill tone={status === 'failed' ? 'warn' : 'attention'}>{status}</Pill>
      )}
    </>
  );
}

function batchMeta(batch: common_DesignBatch, ordinal?: number): React.ReactNode {
  const address = ordinal ? `upload ${ordinal} · ` : '';
  return (
    <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
      {address}
      {batchCaption(batch)}
    </Text>
  );
}

/**
 * Runs and batches in one time-ordered list — the shape the contract pages in (`limit` counts rows
 * across both) and the shape the history reads in once generation exists.
 *
 * ABSENT, NOT EMPTY, WHEN THERE ARE NO RUNS. With the generative half cut there is nothing to merge
 * and the batches already have a home on the shelf; a titled block that shows the same rows twice
 * would be worse than no block. This is the switch to flip when generation lands: the feed becomes
 * the whole history and the shelf gives its rows up.
 */
export function BandFeed({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const ordinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);

  const rows = useMemo<FeedRowModel[]>(() => {
    const runRows: FeedRowModel[] = (band.runs ?? []).map((run) => ({
      key: `run:${run.id}`,
      createdAt: run.createdAt ?? '',
      meta: runMeta(run),
      pictures: run.pictures ?? [],
      hiddenCount: hiddenCountOfRun(band, run.id ?? 0),
    }));
    const batchRows: FeedRowModel[] = (band.batches ?? []).map((batch) => ({
      key: `batch:${batch.id}`,
      createdAt: batch.createdAt ?? '',
      meta: batchMeta(batch, ordinals.get(batch.id ?? 0)),
      pictures: batch.pictures ?? [],
      hiddenCount: hiddenCountOfBatch(band, batch.id ?? 0),
      shelfOrdinal: ordinals.get(batch.id ?? 0),
    }));
    // Newest first. An undated row sorts last rather than to the top, where it would claim to be
    // the most recent thing that happened.
    return [...runRows, ...batchRows].sort((a, b) => {
      if (a.createdAt === b.createdAt) return a.key < b.key ? 1 : -1;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [band, ordinals]);

  const pictureCount = rows.reduce((n, row) => n + row.pictures.length, 0);

  if (!(band.runs ?? []).length) return <></>;

  return (
    <Section
      id='design-feed'
      title='generation history'
      question='— nothing is deleted; hiding is reversible'
      action={
        <Text size='micro' variant='label' component='span'>
          {rows.length} row{rows.length === 1 ? '' : 's'} · {pictureCount} pictures
        </Text>
      }
    >
      <PickModeNote band={band} />
      <FeedRows techCardId={techCardId} band={band} rows={rows} disabled={disabled} />
    </Section>
  );
}
