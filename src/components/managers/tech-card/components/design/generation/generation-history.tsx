import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
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
import {
  DIVIDER_SCOPE,
  fingerprint,
  firstEarlierIndex,
  refsOfCard,
} from '../history-fingerprint';
import { useDesignQuestion } from '../history-question';
import { RecalledRunPrompt, recallDesignRun, useRecallHostMounted, useRecalledRun } from '../history-recall';
import { usePickMode } from '../pick-mode';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { SplitModal } from '../split-modal';
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
import { CompositeBadge, CompositeMarks, compositeTail, readComposite, splitVerb } from './composite';
import { formatMoney } from './money';
import { RunPanel } from './run-panel';
import {
  archiveBlockReason,
  expectedTileCount,
  fixSelectionOf,
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
 * THE `earlier — inputs have changed` DIVIDER SEPARATES ANSWERS TO THE CURRENT QUESTION FROM
 * ANSWERS TO AN OLDER ONE. It is computed over the WHOLE list and not over the page, so a long
 * history does not lose it at the page seam — the pager carries its words instead when the line
 * falls past the edge. The arithmetic and, more importantly, the exact width of what it claims live
 * in `history-fingerprint.ts`; the line states its own scope on screen so it can never be read as
 * comparing more than it compares. WITH NO GENERATION FORM ON THE SCREEN THERE IS NO CURRENT
 * QUESTION AND NO DIVIDER — an absent line says nothing, which is the only honest thing to say when
 * half of a comparison is missing.
 *
 * RECALLING A RUN (W-7) SELECTS IT AND SHOWS ITS PROMPT — the pictures, the descriptions and the
 * markup it was given — where the owner asked for it: in INPUT — REFERENCES. That panel is
 * `RecalledRunPrompt` and it is mounted THERE; this block draws it only as long as nothing else
 * has, so the gesture always has a visible answer. Recalling changes nothing on the card, and the
 * rerun itself is the server's verb (`rerun_of_run_id`), not a client-side rebuild of the inputs.
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
        // `kind` names WHICH BENCH; empty is flat by the contract, which is the bench this history
        // unmarks from. Left empty rather than spelled — see the same note in `slot-picker.tsx`.
        ref: { viewKey: side.view, kind: undefined },
        label: viewLabel(side.view),
        rev: side.slot?.slotRev ?? 0,
      };
    }
  }
  for (const detail of bench.details) {
    if ((detail.pictureId ?? 0) === pictureId) {
      return {
        // A minted id already names its bench; `kind` is ignored beside a slot_id.
        ref: { slotId: detail.id, kind: undefined },
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
  // WHAT THIS FILE DECLARES ABOUT ITSELF — see `composite.tsx`. `declared` is false on every row
  // until the server writes `composite_views`, and every branch below then reads as an ordinary
  // picture. Nothing here infers compositeness from what the run ASKED for.
  const facts = readComposite(band, picture);
  const composite = facts.declared;
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
      // Мат под снимком БЕЛЫЙ (R-12) — см. довод в generation/thumb.tsx.
      className={cn('relative w-full bg-bgColor', hidden && 'opacity-40')}
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
      {/* A COMPOSITE HAS NO SINGLE VIEW, so it never carries the single-guess badge: it carries one
          mark per view it declares. A slot badge is impossible on it by the rule below, so the
          three cases are exclusive and the top-left corner is never written twice. */}
      {composite ? (
        <CompositeMarks facts={facts} />
      ) : inSlot ? (
        <span className='absolute left-0 top-0 bg-textColor px-1 text-nano uppercase text-bgColor'>
          {inSlot.label}
        </span>
      ) : picture.ghostView ? (
        <span className='absolute left-0 top-0 bg-bgColor px-1 text-nano uppercase text-labelColor'>
          probably {viewLabel(picture.ghostView)}
        </span>
      ) : null}
      <CompositeBadge facts={facts} />
      {fitMismatch && (
        <span className='absolute bottom-0 right-0 bg-bgColor px-1 text-nano uppercase text-error'>
          fit {runFit} ≠ card {cardFit}
        </span>
      )}
    </div>
  );

  // `AI · run 7 · 3 views · split into 3` — the prototype's caption for a composite, and the
  // ordinary provenance line for everything else. The tail is empty unless the file declares views.
  const sub = (
    <>
      {provenanceLabel(provenance)}
      {compositeTail(facts)}
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
        {/* NO SLOT PICKER IN THIS BRANCH, AND THAT IS THE RULE, NOT AN OMISSION: a slot holds one
            view and this file holds several, so the only door it gets is the one that turns it into
            pictures a slot can read. The same refusal answers pick mode above. */}
        {!disabled && (
          <TileAction onClick={() => onSplit(picture)}>{splitVerb(facts)}</TileAction>
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
  const recalled = useRecalledRun(techCardId);

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
  /**
   * WHAT THIS ROW WAS ASKED TO FIX, WHOLE. A fix may name several sides and a detail in one run, so
   * the caption counts the selection rather than showing its first member and quietly dropping the
   * rest — «fix: front» on a row that repaired three slots is the kind of caption that gets
   * believed.
   */
  const fix = fixSelectionOf(run);
  const fixNames = [
    ...fix.views.map((view) => viewLabel(view)),
    ...fix.slotIds.map(() => 'a detail'),
  ].filter(Boolean);
  const status = runOutcomeNote(run);

  /**
   * RECALL IS OFFERED ONLY WHERE THERE IS A SNAPSHOT TO SHOW. A row served without `inputs` — an
   * older row, a server that has not filed one yet — would select into an empty panel, and a
   * gesture whose whole promise is «see what was fed» must not be offered when nothing was frozen.
   */
  const recallable = !!run.inputs;
  const isRecalled = recallable && (recalled?.id ?? 0) === runId && runId > 0;
  const rerunOf = run.rerunOf ?? 0;

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

        {fixNames.length > 0 && (
          <Pill tone='mut'>
            fix: {fixNames.join(', ')} · from the slots
          </Pill>
        )}
        {/* THE LINEAGE OF A RERUN, READ FROM THE ROW ITSELF. `rerun_of` is the server's own edge —
            it says whose frozen snapshot this run was assembled from — so «why do these two rows
            have the same inputs and different pictures» is answerable from the history alone,
            without opening either panel. */}
        {rerunOf > 0 && <Pill tone='mut'>repeat of {runHandle(rerunOf)}</Pill>}
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

        {/* THE SELECTION GESTURE (W-7). A Chip and not a link, because selection is exactly what a
            chip is for in this system, and `selected` is the one affordance that fills with ink —
            so which run is recalled is legible at a glance down the list. It reads the card, never
            writes it: recalling shows the frozen prompt somewhere else and changes nothing here. */}
        {recallable && (
          <Chip
            selected={isRecalled}
            pressed={isRecalled}
            onClick={() => recallDesignRun(techCardId, isRecalled ? null : run)}
            title={
              isRecalled
                ? 'stop showing this run’s prompt'
                : 'show what this run was given — its pictures, notes and markup — for a rerun'
            }
          >
            {isRecalled ? 'recalled' : 'recall ▸'}
          </Chip>
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

/* ────────────────────────────── the divider ────────────────────────────── */

/**
 * `earlier — inputs have changed`, drawn at the weight of a CLOSING TOTAL: 1px ink with the caption
 * sitting on the line. It is the fourth rung of the ladder in DESIGN.md and the right one — the
 * line closes the runs that still answer today's question, it does not open a new group.
 *
 * IT STATES ITS OWN SCOPE. A divider is a claim about a comparison, and a reader cannot check a
 * comparison whose terms are invisible; `DIVIDER_SCOPE` names them, so «inputs» never reads as
 * «everything about the inputs».
 */
function EarlierDivider({ runs, pictures }: { runs: number; pictures: number }) {
  return (
    <div className='mt-3 flex flex-wrap items-baseline gap-2 border-t border-textColor pt-1.5'>
      <Text size='micro' component='span' className='uppercase' tracking='group'>
        earlier — inputs have changed
      </Text>
      <Text size='nano' variant='label' component='span'>
        {runs} run{runs === 1 ? '' : 's'} · {pictures} picture{pictures === 1 ? '' : 's'} below
      </Text>
      <Text size='nano' variant='label' component='span' className='ml-auto'>
        compared on {DIVIDER_SCOPE}
      </Text>
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
  /**
   * The card's CURRENT garment description — the live half of the pair a run freezes as
   * `inputs.garment_note`. Read from the form and not from the band, because the description is a
   * field of the tech card and the form is where its unsaved edits live: comparing against a saved
   * copy would leave the divider a save behind the human typing.
   */
  const cardGarment = (form?.watch('garmentDescription') ?? '').trim();

  const guard = useMemo(() => buildHideGuard(band), [band]);

  /**
   * THE CURRENT QUESTION — the form's half announced through `history-question.ts`, the card's half
   * read from the band and the card. `null` when no generation form is on this screen, and a null
   * question draws no divider at all.
   */
  const question = useDesignQuestion(techCardId);
  const currentPrint = useMemo(
    () =>
      question
        ? fingerprint({
            views: question.views,
            layout: question.layout,
            refs: refsOfCard(band.references),
            garmentNote: cardGarment,
          })
        : null,
    [question, band.references, cardGarment],
  );
  /** Is the recalled prompt already being shown by its real home (INPUT — REFERENCES)? */
  const recallHosted = useRecallHostMounted(techCardId);

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

  /**
   * THE DIVIDER IS PLACED OVER THE WHOLE LIST, NOT OVER THE PAGE. Computed on `shown` it would
   * appear and disappear as pages are read, i.e. be missing exactly on the long histories that need
   * it; when it falls past the edge of the page the PAGER carries its words instead.
   */
  const pastAt = firstEarlierIndex(visible, currentPrint);
  const earlierRuns = pastAt >= 0 ? visible.length - pastAt : 0;
  const earlierPictures =
    pastAt >= 0
      ? visible.slice(pastAt).reduce((n, run) => n + (run.pictures ?? []).length, 0)
      : 0;

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
        {shown.map((run, i) => (
          <Fragment key={run.id}>
            {i === pastAt && <EarlierDivider runs={earlierRuns} pictures={earlierPictures} />}
            <RunRow
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
          </Fragment>
        ))}
      </div>

      {canPage && (
        <button
          type='button'
          disabled={more.loading}
          onClick={() => {
            // READING A SERVER PAGE ALSO REVEALS ONE. Fetching without advancing the local window
            // spent a click on nothing visible: the rows arrived, the button changed its wording,
            // and the human had to press it a second time to actually see them.
            setPage((p) => p + 1);
            if (localLeft <= 0) more.fetchMore();
          }}
          className='cursor-pointer border-t border-textColor pt-1 text-left text-micro uppercase tracking-label text-labelColor hover:text-textColor disabled:cursor-not-allowed'
        >
          {more.loading
            ? 'reading earlier runs…'
            : /* The divider's own words when the line itself is past the edge of the page — the
                 prototype's rule, and the reason the divider is computed over the whole list. */
              pastAt >= 0 && pastAt >= shown.length
              ? `earlier — inputs have changed · ${localLeft > 0 ? `${localLeft} more` : 'read the next page'} ▸`
              : localLeft > 0
                ? `earlier runs · ${localLeft} more ▸`
                : 'earlier runs · read the next page ▸'}
        </button>
      )}

      {/* THE RECALLED PROMPT'S HOME IS INPUT — REFERENCES, and this is the stand-in for as long as
          nothing has claimed that home. `RecalledRunPrompt` announces itself when mounted, so this
          copy vanishes the moment the real one exists — and until then the selection gesture on a
          row still has a visible answer instead of pointing at an empty screen. */}
      {!recallHosted && (
        <RecalledRunPrompt
          techCardId={techCardId}
          band={band}
          disabled={disabled || !speaks}
          host={false}
        />
      )}

      <Text size='nano' variant='label' component='p'>
        Click a run's line to unfold what was asked and what the model was given — launch-time
        copies. `recall` puts that same frozen prompt in INPUT — REFERENCES, so a rerun can be asked
        for from it. The picker on a tile names the slot it goes to; ✕ hides, reversibly, and it is
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
