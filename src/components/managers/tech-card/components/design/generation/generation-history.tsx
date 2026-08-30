import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
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

import type { TechCardFormData } from '../../schema';
import { buildHideGuard, isPickablePicture } from '../band-feed';
import { displayDetailName, readBench } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { clockStamp, pictureHandle, runHandle } from '../handles';
import { usePickMode } from '../pick-mode';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { SplitModal, isComposite } from '../split-modal';
import { useDesignWrites } from '../use-design-band';
import {
  canOfferHide,
  countHiddenPictures,
  hiddenCountOfRun,
  hideBlockReason,
  isPictureHidden,
  isRunArchived,
  selectVisiblePictures,
  type HideBlockReason,
  type HideGuard,
} from '../visibility';
import { viewLabel } from '../views';
import { formatMoney } from './money';
import { RunPanel } from './run-panel';
import {
  archiveBlockReason,
  expectedTileCount,
  fixTargetOf,
  isCancelling,
  isRunLive,
  runCaption,
  runOutcomeNote,
} from './run-state';
import { SlotPicker } from './slot-picker';
import { useElapsed, useGenerationWrites, useMoreHistory, useRunPolling } from './use-generation';

/**
 * THE GENERATION HISTORY — runs, and only runs.
 *
 * NOTHING IS EVER DELETED HERE. A run row is permanent: archiving collapses it (presentational,
 * reversible, and refused while any of its pictures is protected), and hiding a picture is a
 * separate, equally reversible verb on the picture itself. The two are deliberately not one
 * control — archiving the row must never do in bulk what the ✕ refuses to do one tile at a time.
 *
 * RUNS ONLY, BECAUSE UPLOADS ARE NOT RUNS. A hand-brought file has no run row and no price; it
 * belongs on the uploads shelf, which is its own block. The wire ships both halves of the merged
 * feed and this organ reads one of them — the shelf reads the other, from the same band.
 *
 * THE ROWS ARE PAGED, AND THE HEADER'S SUMS ARE NOT. `total_runs` and `archived_runs` are
 * aggregates over the WHOLE band; counting the rows on screen would make the header lie by exactly
 * the amount that is not on screen, and it would lie MORE the more history a card has.
 *
 * WHAT IS NOT DRAWN, AND WHY: the prototype's `earlier — inputs have changed since` divider. It
 * separates runs whose inputs match the CURRENT ones, and the fingerprint it compares includes the
 * garment description and the reference notes. Neither has a current value this client can read:
 * `garment_note` exists ONLY inside a run's frozen snapshot, because the SERVER composes what the
 * model is given. A divider computed from views and layout alone would place a run made from a
 * completely different description above the line and call it «current» — a false green, and the
 * one kind of lie a provenance organ may not tell. What each run actually asked for is on its own
 * panel instead, where it is a fact rather than a comparison.
 */

const PAGE = 4;

/* ────────────────────────────── reading ────────────────────────────── */

type SlotOfPicture = { ref: DesignBenchSlotRef; label: string; rev: number };

/** Which bench slot holds this picture, addressed the way a write to it must be addressed. */
function slotOfPicture(band: GetDesignBandResponse, pictureId: number): SlotOfPicture | null {
  if (!pictureId) return null;
  const bench = readBench(band);
  for (const side of bench.sides) {
    if ((side.slot?.pictureId ?? 0) === pictureId) {
      return {
        ref: { viewKey: side.view },
        label: viewLabel(side.view),
        rev: side.slot?.slotRev ?? 0,
      };
    }
  }
  for (const detail of bench.details) {
    if ((detail.pictureId ?? 0) === pictureId) {
      return {
        ref: { slotId: detail.id },
        label: displayDetailName(bench.details, detail),
        rev: detail.slotRev ?? 0,
      };
    }
  }
  return null;
}

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

function thumbOf(media?: common_MediaFull): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
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

/* ────────────────────────────── the tile ────────────────────────────── */

/**
 * A run's output, with the two doors the feed's own tile cannot offer: the SLOT PICKER and UNMARK.
 *
 * IT IS NOT A SECOND `PictureTile`. The rules are the shared ones — `visibility.ts` decides what
 * may be hidden, `provenance.ts` says where a picture came from, `handles.ts` names it, and pick
 * mode takes the tile over exactly as it does in the feed. What differs is the FOOTER, and the
 * footer is the one thing the feed's tile fixes: a picture standing in a slot offers `unmark` and
 * neither a ✕ nor a picker (the prototype's И-1, and the ✕ would be refused by the server anyway),
 * a free flat offers the picker, and a composite offers the cut.
 */
function RunTile({
  band,
  techCardId,
  picture,
  cardFit,
  runFit,
  guard,
  disabled,
  onZoom,
  onHide,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  cardFit: string;
  runFit: string;
  guard: HideGuard;
  disabled?: boolean;
  onZoom: () => void;
  onHide: (pictureId: number, hidden: boolean) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const pick = usePickMode();
  const { setBenchSlot } = useDesignWrites(techCardId);

  const pictureId = picture.id ?? 0;
  const hidden = isPictureHidden(picture);
  const composite = isComposite(picture);
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture);
  const inSlot = slotOfPicture(band, pictureId);
  const blockReason = hidden ? null : hideBlockReason(pictureId, guard);
  const mayHide = !disabled && canOfferHide(picture, guard);
  const mixed = mixedInputNote(provenance);

  /**
   * `fit slim ≠ card oversized` — the run copied the card's fit at launch, and the card has moved
   * since. Drawn on the OUTPUT because that is the picture somebody is about to put on a sheet.
   * Both values must be stated for the badge to mean anything, so an unstated fit draws nothing
   * rather than «≠ ».
   */
  const fitMismatch = !!runFit && !!cardFit && runFit !== cardFit;

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
      {inSlot ? (
        <span className='absolute left-0 top-0 bg-textColor px-1 text-nano uppercase text-bgColor'>
          {inSlot.label}
        </span>
      ) : picture.ghostView ? (
        <span className='absolute left-0 top-0 bg-bgColor px-1 text-nano uppercase text-labelColor'>
          probably {viewLabel(picture.ghostView)}
        </span>
      ) : null}
      {composite && (
        <span className='absolute bottom-0 left-0 bg-bgColor px-1 text-nano uppercase text-labelColor'>
          {(picture.compositeViews ?? []).length} views
        </span>
      )}
      {fitMismatch && (
        <span className='absolute bottom-0 right-0 bg-bgColor px-1 text-nano uppercase text-error'>
          fit {runFit} ≠ card {cardFit}
        </span>
      )}
    </div>
  );

  const sub = (
    <>
      {provenanceLabel(provenance)}
      {mixed ? ` · ${mixed}` : ''}
    </>
  );

  // PICK MODE TAKES THE TILE OVER. A clickable tile is a real `<button>`, and a button may not
  // contain buttons — so while a slot is armed the tile answers exactly one gesture and its own
  // controls step aside. Same rule, same reason, as the feed's tile.
  if (pick.target) {
    const pickable = isPickablePicture(picture);
    return (
      <Tile
        media={media}
        name={handle}
        sub={sub}
        selected={pickable}
        onClick={pickable ? () => pick.resolve(pictureId) : undefined}
        title={
          pickable
            ? `put ${handle} into ${pick.target.label}`
            : composite
              ? 'a composite holds several views — split it first'
              : 'hidden pictures are not offered'
        }
        className={pickable ? '' : 'opacity-40'}
      />
    );
  }

  let footer: React.ReactNode;
  if (hidden) {
    footer = !disabled ? (
      <TileAction onClick={() => onHide(pictureId, false)}>unhide</TileAction>
    ) : (
      <Text size='nano' variant='label' component='span'>
        hidden
      </Text>
    );
  } else if (composite) {
    footer = (
      <>
        {!disabled && (
          <TileAction onClick={() => onSplit(picture)}>
            {(picture.derivedFrom ?? 0) > 0 ? 'split again ▸' : 'split into views ▸'}
          </TileAction>
        )}
        {mayHide && (
          <TileAction
            onClick={() => onHide(pictureId, true)}
            label='hide this picture — reversible'
          >
            ✕ hide
          </TileAction>
        )}
      </>
    );
  } else if (inSlot) {
    // И-1: a plate that a slot reads carries NEITHER a ✕ nor a picker. Both would be refused —
    // the server guards the hide, and re-picking a slot it already fills says nothing — so the one
    // honest door is the one that undoes the placement.
    footer = (
      <>
        {!disabled && (
          <TileAction
            onClick={() =>
              setBenchSlot.mutate({
                slot: inSlot.ref,
                // 0 is UNMARK: empty the slot without deleting it. A different act from deleting a
                // detail slot, and it has to stay different.
                pictureId: 0,
                expectedSlotRev: inSlot.rev,
              })
            }
            label={`take this picture out of ${inSlot.label}`}
          >
            unmark
          </TileAction>
        )}
        {mixed && (
          <Text size='nano' variant='label' component='span'>
            {mixed}
          </Text>
        )}
      </>
    );
  } else {
    footer = (
      <>
        {!disabled && (
          <SlotPicker
            band={band}
            techCardId={techCardId}
            picture={picture}
            className='h-[20px] w-full'
          />
        )}
        {mayHide ? (
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
      </>
    );
  }

  return (
    <Tile media={media} name={handle} sub={sub} className={hidden ? 'border-dashed' : ''}>
      <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5'>
        <TileAction onClick={onZoom}>zoom</TileAction>
        {footer}
      </div>
    </Tile>
  );
}

/* ────────────────────────────── the row ────────────────────────────── */

function RunRow({
  band,
  techCardId,
  run,
  firstRunId,
  cardFit,
  guard,
  disabled,
  onZoom,
  onHide,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  run: common_DesignRun;
  firstRunId: number | null;
  cardFit: string;
  guard: HideGuard;
  disabled?: boolean;
  onZoom: (pictures: common_DesignPicture[], picture: common_DesignPicture) => void;
  onHide: (pictureId: number, hidden: boolean) => void;
  onSplit: (picture: common_DesignPicture) => void;
}) {
  const { archiveRun } = useGenerationWrites(techCardId);
  const [open, setOpen] = useState(false);
  const [revealHidden, setRevealHidden] = useState(false);

  const runId = run.id ?? 0;
  const archived = isRunArchived(run);
  const live = isRunLive(run);
  const elapsed = useElapsed(run.startedAt || run.createdAt);
  const pictures = run.pictures ?? [];
  const shown = selectVisiblePictures(pictures, { revealHidden });
  // The aggregate states the count over the WHOLE run; the row's own pictures are the fallback for
  // a row that arrived through a continuation page, where the map has no entry for it.
  const hiddenCount = hiddenCountOfRun(band, runId) || countHiddenPictures(pictures);
  const archiveWhy = archiveBlockReason(run, guard);
  const price = formatMoney(run.priceActual ?? run.priceEstimate, run.currency);
  const fix = fixTargetOf(run);
  const status = runOutcomeNote(run);

  const meta = [
    runHandle(runId),
    runCaption(run, firstRunId),
    (run.author ?? '').trim(),
    clockStamp(run.createdAt),
    price,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='space-y-1 border-b border-hairline pb-2 last:border-b-0'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <button
          type='button'
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className='min-w-0 cursor-pointer text-left'
          title='what was asked, and what the model was given'
        >
          <Text
            size='micro'
            variant={archived ? 'label' : 'default'}
            component='span'
            className='uppercase tracking-label'
          >
            {open ? '▾' : '▸'} {meta}
          </Text>
        </button>

        {fix && <Pill tone='mut'>fix: {viewLabel(fix)} · from the slots</Pill>}
        {live && (
          <Pill tone='attention'>
            {isCancelling(run) ? 'cancelling…' : `${status} ${elapsed}`}
          </Pill>
        )}
        {!live && status !== 'done' && (
          <Pill tone={status.startsWith('failed') ? 'warn' : 'mut'}>{status}</Pill>
        )}
        {archived && <Pill tone='mut'>archived</Pill>}

        {hiddenCount > 0 && (
          <button
            type='button'
            onClick={() => setRevealHidden((v) => !v)}
            aria-expanded={revealHidden}
            className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
          >
            · {hiddenCount} hidden {revealHidden ? '▾' : '▸'}
          </button>
        )}

        <span className='ml-auto'>
          {archived ? (
            <button
              type='button'
              disabled={disabled || archiveRun.isPending}
              onClick={() => archiveRun.mutate({ runId, archived: false })}
              className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor disabled:cursor-not-allowed'
            >
              unarchive
            </button>
          ) : archiveWhy ? (
            // The row states nothing here and the PANEL says why — a greyed-out «archive» beside a
            // row whose pictures are all in a sheet reads as a broken control, not as a refusal.
            <Text size='nano' variant='label' component='span' title={HIDE_BLOCK_LONG[archiveWhy]}>
              archive is off
            </Text>
          ) : (
            !disabled &&
            !live && (
              <button
                type='button'
                disabled={archiveRun.isPending}
                onClick={() => archiveRun.mutate({ runId, archived: true })}
                className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor disabled:cursor-not-allowed'
              >
                archive ▸
              </button>
            )
          )}
        </span>
      </div>

      {open && <RunPanel band={band} techCardId={techCardId} run={run} disabled={disabled} />}

      {/* AN ARCHIVED ROW COLLAPSES TO ITS LINE. Its pictures are NOT hidden — the ✕ is the only verb
          for that — they simply stop taking up the screen until the row is opened again. */}
      {!archived && live && (
        <Tiles min={140}>
          {Array.from({ length: expectedTileCount(run) }, (_, i) => (
            <Tile
              key={i}
              dashed
              media={
                <div
                  className='flex w-full items-center justify-center bg-bgSecondary'
                  style={{ aspectRatio: '4 / 5' }}
                >
                  <Text size='nano' variant='label' component='span'>
                    {i === 0 ? `running ${elapsed}` : 'reserved'}
                  </Text>
                </div>
              }
              name={i === 0 ? runHandle(runId) : ''}
              sub={i === 0 ? (run.author ?? '').trim() : ''}
            />
          ))}
        </Tiles>
      )}

      {!archived && !live && shown.length > 0 && (
        <Tiles min={140}>
          {shown.map((picture) => (
            <RunTile
              key={picture.id}
              band={band}
              techCardId={techCardId}
              picture={picture}
              cardFit={cardFit}
              runFit={(run.fitAtLaunch ?? '').trim()}
              guard={guard}
              disabled={disabled}
              onZoom={() => onZoom(shown, picture)}
              onHide={onHide}
              onSplit={onSplit}
            />
          ))}
        </Tiles>
      )}

      {!archived && !live && shown.length === 0 && (
        <Text size='micro' variant='label'>
          {pictures.length
            ? 'every picture of this run is hidden — the link above brings them back'
            : status.startsWith('failed') || status === 'cancelled'
              ? 'no pictures — the row keeps what it cost anyway'
              : 'no pictures under this row'}
        </Text>
      )}
    </div>
  );
}

/* ────────────────────────────── the section ────────────────────────────── */

export function GenerationHistory({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}) {
  const speaks = serverSpeaksDesign();
  const { hidePicture } = useDesignWrites(techCardId);
  const more = useMoreHistory(techCardId, band);
  const live = useRunPolling(techCardId, band);

  const [archShown, setArchShown] = useState(false);
  const [page, setPage] = useState(0);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);

  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  const guard = useMemo(() => buildHideGuard(band), [band]);

  /**
   * The band's first page plus whatever continuations have been asked for, deduped by id: the
   * band's own page is re-read on every write, so its cursor can move under an already-fetched
   * continuation and the same run can legitimately arrive twice.
   */
  const runs = useMemo(() => {
    const byId = new Map<number, common_DesignRun>();
    [...(band.runs ?? []), ...more.runs].forEach((run) => {
      const id = run.id ?? 0;
      if (!id) return;
      // The band's copy is the fresher one — it is re-read on every write, the continuation is not.
      if (!byId.has(id)) byId.set(id, run);
    });
    return [...byId.values()].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [band.runs, more.runs]);

  const totalRuns = band.totalRuns ?? 0;
  const archivedRuns = band.archivedRuns ?? 0;

  /**
   * `from references` may be claimed only when the whole history is on screen — otherwise «the
   * oldest row I was given» is not «the oldest row there is», and the caption would name the wrong
   * run as the one that started the card.
   */
  const firstRunId =
    runs.length >= totalRuns && runs.length ? (runs[runs.length - 1].id ?? null) : null;

  const visible = runs.filter((run) => !isRunArchived(run) || archShown);
  const shown = visible.slice(0, (page + 1) * PAGE);
  const localLeft = visible.length - shown.length;
  const canPage = localLeft > 0 || more.hasMore;

  const onHide = useCallback(
    (pictureId: number, hidden: boolean) => {
      if (disabled || !speaks) return;
      hidePicture.mutate({ pictureId, hidden });
    },
    [hidePicture, disabled, speaks],
  );

  const openZoom = useCallback(
    (pictures: common_DesignPicture[], picture: common_DesignPicture) => {
      // The index is computed on the ALREADY FILTERED list: the viewer drops frames without an
      // address, so one address-less picture would otherwise shift everything behind it and the
      // meta panel would describe the wrong file.
      const withSrc = pictures
        .map((p) => p.media)
        .filter((m): m is common_MediaFull => !!m && !!mediaFullViewerSrc(m));
      if (!withSrc.length) return;
      const index = Math.max(
        0,
        withSrc.findIndex((m) => m.id === picture.media?.id),
      );
      setViewer({ items: mediaFullListToViewerItems(withSrc), index });
    },
    [],
  );

  // ABSENT, NOT AN EMPTY HEADER. A card that has never generated anything has no history, and a
  // titled block saying so would be a second, quieter version of the empty studio.
  if (totalRuns === 0 && runs.length === 0) return <></>;

  const liveRun = runs.find(isRunLive) ?? null;
  const pictureCount = runs.reduce((n, run) => n + (run.pictures ?? []).length, 0);

  return (
    <Section
      id='design-history'
      title='generation history'
      question='— nothing is deleted; archive hides the row, ✕ hides a picture'
      collapsible
      action={
        <div className='flex flex-wrap items-baseline gap-2'>
          {liveRun && (
            <Text size='micro' component='span' className='uppercase tracking-label text-warning'>
              {runHandle(liveRun.id)} now
            </Text>
          )}
          <Text size='micro' variant='label' component='span'>
            {totalRuns} run{totalRuns === 1 ? '' : 's'} · {pictureCount} pictures shown
          </Text>
          {archivedRuns > 0 && (
            <button
              type='button'
              onClick={() => setArchShown((v) => !v)}
              aria-expanded={archShown}
              className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
            >
              · {archivedRuns} archived {archShown ? '▾' : '▸'}
            </button>
          )}
        </div>
      }
    >
      {live && (
        <Text size='nano' variant='label' component='p'>
          a run is in flight — this block re-reads the card every few seconds until it lands
        </Text>
      )}

      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the rows below are read-only.
        </CalloutBox>
      )}

      <div className='space-y-2'>
        {shown.map((run) => (
          <RunRow
            key={run.id}
            band={band}
            techCardId={techCardId}
            run={run}
            firstRunId={firstRunId}
            cardFit={cardFit}
            guard={guard}
            disabled={disabled || !speaks}
            onZoom={openZoom}
            onHide={onHide}
            onSplit={(picture) =>
              setSplitting({ picture, handle: pictureHandle(picture) })
            }
          />
        ))}
      </div>

      {canPage && (
        <button
          type='button'
          disabled={more.loading}
          onClick={() => {
            if (localLeft > 0) setPage((p) => p + 1);
            else more.fetchMore();
          }}
          className='cursor-pointer border-t border-textColor pt-1 text-left text-micro uppercase tracking-label text-labelColor hover:text-textColor disabled:cursor-not-allowed'
        >
          {more.loading
            ? 'reading earlier runs…'
            : localLeft > 0
              ? `earlier runs · ${localLeft} more ▸`
              : 'earlier runs · read the next page ▸'}
        </button>
      )}

      <Text size='nano' variant='label' component='p'>
        Click a run's line to unfold what was asked and what the model was given — launch-time
        copies. The picker on a tile names the slot it goes to; ✕ hides, reversibly, and it is
        missing on a picture a slot reads.
      </Text>

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
    </Section>
  );
}
