import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { runRepresentation } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { pictureHandle, runHandle } from '../handles';
import { useGalleryGroup, useGalleryViewerOpen } from '../picture-tile';
import { SplitModal } from '../split-modal';
import { isRunArchived } from '../visibility';
import {
  closeSurface,
  openSurface,
  pinShown,
  publishShown,
  releasePin,
  useBench,
} from './bench-store';
import { deckAfterZoom, deckOfRuns, outputPlan, runsGallery, type OutputPlan } from './run-gallery';
import { RunOutputs } from './run-outputs';
import {
  isRunLive,
  runFailureText,
  runOutcomeNote,
  runStamp,
  runStateWord,
  runStatus,
} from './run-state';
import { useElapsed, useRunById } from './use-generation';

/**
 * ═══ THE LATEST GENERATION, UNDER GENERATE (26.09, O-53, phase 1) ═══════════════════════════════
 *
 * Owner, verbatim: «после генерации в FLAT INPUT — REFERENCES в этом же блоке но снизу должны
 * появятся сгенерированные картинки и там мы уже можем непосредственно делать все тоже самое что и в
 * GENERATION HISTORY а именно засплитить эдитнуть зазумить после сплита они все так же должны там
 * отображаться и там же можно сделать разметку … на этом воркбенче должна отображаться последняя
 * генерация».
 *
 * WHAT IT IS. The bottom row of INPUT — REFERENCES: a `GroupLabel` «latest generation» with the
 * run's stamp on the right (state word, `author · hh:mm`; no price — O-37), then the history row's
 * own outputs block (`RunOutputs`) on the block's 190px grid. The doors are `RunTile`'s, unchanged:
 * split an uncut sheet (`SplitModal forInput={false}` — a cut here lays a sheet out into views, it
 * does NOT feed the prompt, so no reference role and no `moodboardMedia` row is written), edit
 * (a NEW sibling picture in the same run, `slot={null}`, exactly as from the history — «overwrite or
 * save as new» is phase 2), zoom through the studio's one viewer, and the slot marks: `SlotPicker`
 * under a free picture, `unmark` under a plate a FLAT SLOTS slot reads («разметка», D-40 п.1).
 *
 * WHICH RUN (§3a, D-40 п.4). The newest run on the band's first page whose `kind` is `flat` (the
 * GENERATE of this block — a text draft, a vector redraw, a render never), not archived, and either
 * live or holding pictures. Newer flat runs that came back with nothing (failed, cancelled, empty)
 * are passed over and SAID, every one of them counted: one — «the newest run failed · CODE — this
 * is the one before»; more — «newest N runs finished empty · showing the last one with pictures».
 * Nothing to show on the first page → no workbench at all; the history below still has every run.
 *
 * …BUT ONLY WHILE NOBODY IS WORKING ON THE SHOWN RUN (26.09, O-53 review; `bench-store.ts`). An
 * editor, a split or the zoom viewer opened on a tile here PINS the shown run: a newer run landing on
 * a poll does not replace it, so nothing under the open surface unmounts, and the pieces of a split
 * land where the person cut them. When the surface closes and a newer run exists, the workbench stays
 * put and says one quiet line under the tiles — «newer run ready · show ›»; the click moves it to the
 * newest. This tab's GENERATE, archiving the pinned run and a card switch let go as well. A surface
 * elsewhere (a history tile, the viewer opened from another block) only holds the workbench while it
 * is open. A kept run that newer rows push off the band's first page is NOT archived by that (27.09,
 * D-49): it is read by id from then on, and only an archival seen on such a read lets it go.
 *
 * WHAT STANDS NOW, NOT EVERYTHING FILED (27.09, O-53 phase 2). An edit made here asks «overwrite or
 * save as new» (`RunTile` → `VectorModal.replace`); an overwrite stamps the original `replaced_by`,
 * and this row draws only the HEAD of each replacement chain, in the original's place — as a card
 * or as a piece in its deck (`outputPlan` with `heads`). A picture under an open editor is drawn as
 * itself until the editor closes (`keep`). The history keeps every link, captioned.
 *
 * ONE COPY OF THE RUN'S TILES. The history below draws the run that stands here as its header line
 * alone — «run 12 · on the bench ↑» (`generation-history.tsx`), so the viewer row, the deck and the
 * slot writes of these pictures exist once.
 *
 * THE DECK OF THIS RUN IS OPEN BY DEFAULT, AND A SPLIT THAT LANDS OPENS IT: the pieces are what the
 * owner asked to keep seeing «после сплита». One open deck per host (H-10), and zooming a picture
 * outside it folds it (E-4) — the history's rules, through the same readers (`run-gallery.ts`).
 *
 * WHAT IT DOES NOT DO — ON PURPOSE. It polls nothing, recalls nothing and reads no further pages:
 * `GenerationHistory` below owns all three and stays MOUNTED while folded (O-54), so a live run is
 * re-read every 4 s from there and this row redraws from the same band.
 *
 * ANCHOR `data-latest-generation={runId}` — deliberately not `data-run`, which every reader of the
 * history takes to mean «a history row».
 */

/** A run of this block's GENERATE — `kind` exactly `flat`. */
function isFlatRun(run: Pick<common_DesignRun, 'kind'>): boolean {
  return (run.kind ?? '').trim().toLowerCase() === 'flat';
}

/**
 * THE NEWEST RUN THE WORKBENCH CAN SHOW, and EVERY newer flat run it passed over for having nothing,
 * newest first. Reads the band's first page only — the page the band already holds; the workbench
 * asks for no more.
 */
export function latestFlatRun(
  band: Pick<GetDesignBandResponse, 'runs'>,
): { run: common_DesignRun; skipped: common_DesignRun[] } | null {
  const flats = (band.runs ?? [])
    .filter((run) => (run.id ?? 0) > 0 && isFlatRun(run) && !isRunArchived(run))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const skipped: common_DesignRun[] = [];
  for (const run of flats) {
    if (isRunLive(run) || (run.pictures ?? []).length > 0) return { run, skipped };
    skipped.push(run);
  }
  return null;
}

/** «the newest run failed · CODE — this is the one before», worded by how the newer run ended. */
function passedOverNote(run: common_DesignRun): string {
  const status = runStatus(run);
  const { code } = runFailureText(run);
  const tail = ' — this is the one before';
  if (status === 'failed') return `the newest run failed${code ? ` · ${code}` : ''}${tail}`;
  if (status === 'cancelled')
    return `the newest run was cancelled${code ? ` · ${code}` : ''}${tail}`;
  if (status === 'done') return `the newest run came back empty${tail}`;
  return `the newest run brought no picture${tail}`;
}

/**
 * WHAT THE WORKBENCH SAYS ABOUT THE RUNS IT PASSED OVER — every one counted (review, MINOR). «This is
 * the one before» is true only of ONE skipped run; with two, the run shown is not the one before the
 * newest, and the line says how many finished empty instead. The title names each and how it ended.
 */
function skippedNote(skipped: readonly common_DesignRun[]): { text: string; title: string } | null {
  if (skipped.length === 0) return null;
  if (skipped.length === 1) {
    return { text: passedOverNote(skipped[0]), title: runOutcomeNote(skipped[0]) };
  }
  return {
    text: `newest ${skipped.length} runs finished empty · showing the last one with pictures`,
    title: skipped.map((run) => `${runHandle(run.id)} · ${runOutcomeNote(run)}`).join('; '),
  };
}

/** The decks of the row in display order: each card with pieces behind it, and how many. */
function decksOf(plan: OutputPlan | null): { root: number; count: number }[] {
  if (!plan) return [];
  return plan.cards
    .filter((card) => card.members.length > 0)
    .map((card) => ({ root: card.picture.id ?? 0, count: card.members.length }));
}

/**
 * Pictures an editor is open over, anywhere on the step (`RunTile`'s `edit:<id>` surfaces), as a
 * sorted key — the store hands a new map on every write of any surface, the key changes only when
 * this set does.
 */
function editedKey(surfaces: ReadonlyMap<string, number>): string {
  const ids: number[] = [];
  for (const key of surfaces.keys()) {
    if (!key.startsWith('edit:')) continue;
    const id = Number(key.slice('edit:'.length));
    if (id > 0) ids.push(id);
  }
  return ids.sort((a, b) => a - b).join(',');
}

export function LatestGeneration({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}) {
  const speaks = serverSpeaksDesign();
  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  const newest = useMemo(() => latestFlatRun(band), [band]);
  const newestId = newest?.run.id ?? 0;

  /* ═══ THE PIN (`bench-store.ts`) — the run shown while somebody works on it ═══════════════════
     The pinned run is read from the band while the band's first page holds it, so a split's pieces
     and an edit's new picture arrive in it. Once newer rows push it off that page it is read BY ID
     (`useRunById`, D-49) — absence from the first page is not archival — and the same re-reads bring
     its new outputs. Its last copy stands in while a read is in flight or fails: an open editor
     above it must not unmount for that either. */
  const bench = useBench(techCardId);
  const viewerOpen = useGalleryViewerOpen();
  const pin = bench.pin;
  const pinnedLive = useMemo(
    () => (pin ? (band.runs ?? []).find((r) => (r.id ?? 0) === pin.runId) ?? null : null),
    [band, pin],
  );
  const byId = useRunById(techCardId, pin?.runId ?? 0, !!pin && !pinnedLive);
  const byIdRun = byId.data?.run;
  /** The pinned run from a read that CONTAINS it — the band's first page, or its own by-id read. */
  const pinnedFresh =
    pinnedLive ?? (pin && byIdRun && (byIdRun.id ?? 0) === pin.runId ? byIdRun : null);
  const [pinnedCopy, setPinnedCopy] = useState<common_DesignRun | null>(null);
  if (pinnedFresh && pinnedFresh !== pinnedCopy) setPinnedCopy(pinnedFresh);
  const pinnedRun = pin
    ? pinnedFresh ?? (pinnedCopy && (pinnedCopy.id ?? 0) === pin.runId ? pinnedCopy : null)
    : null;
  /** Archival OBSERVED (D-49): the archived stamp on a read that contains the run — never inferred. */
  const archivedSeen = !!pinnedFresh && isRunArchived(pinnedFresh);
  const run = pinnedRun ?? newest?.run ?? null;
  const runId = run?.id ?? 0;
  /** Somebody is working — a surface open anywhere on the step, or the viewer. */
  const held = bench.surfaces.size > 0 || viewerOpen;
  // The clock ticks only while the run is in flight (review, MINOR): a finished run shows no elapsed
  // time, and a ticking hook re-rendered the whole tile grid once a second for nothing.
  const elapsed = useElapsed(run && isRunLive(run) ? run.startedAt || run.createdAt : undefined);

  /* What this row shows is published for the history (its row of this run turns «on the bench»)
     and for the tiles' surfaces (a surface on this run pins it). Leaving — the step, or the card —
     lets the pin go: coming back shows the newest. */
  useLayoutEffect(() => {
    publishShown(techCardId, runId);
  }, [techCardId, runId]);
  useLayoutEffect(
    () => () => {
      publishShown(techCardId, 0);
      releasePin(techCardId);
    },
    [techCardId],
  );
  /* The viewer opened from another block HOLDS the run (its row would rebuild under the frame on
     stage). With nothing open any more, a hold goes; a STICKY pin stays until «show ›», this tab's
     GENERATE (it unsticks, `useStartRun`) or an archival OBSERVED on a read that contains the run
     (D-49) — or until the pinned run is itself the newest the workbench would show, where letting go
     changes nothing on screen and the workbench follows the newest again. A run that merely left
     the band's first page keeps its pin: it is read by id, and a newer run is what pushed it off. */
  useLayoutEffect(() => {
    if (!runId) return;
    if (viewerOpen) {
      pinShown(techCardId, false);
      return;
    }
    if (!pin || held) return;
    if (!pin.sticky || archivedSeen || newestId === pin.runId) releasePin(techCardId);
  }, [techCardId, runId, viewerOpen, held, pin, archivedSeen, newestId]);

  const [openDeck, setOpenDeck] = useState<number | null>(null);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);
  /** The split is a surface of its run (`bench-store.ts`); it goes when the modal does. */
  useEffect(() => {
    if (!splitting) return;
    return () => closeSurface(techCardId, 'split:bench');
  }, [splitting, techCardId]);

  /**
   * ═══ THE DECK OPENS ITSELF — ON A NEW RUN, AND WHEN A SPLIT LANDS ═════════════════════════════
   * What was seen is state, not a ref, and it is compared IN RENDER (React's «storing information
   * from previous renders»): a ref written during render is not safe under a double render, and an
   * effect would leave one committed frame with the deck closed over pieces that just arrived.
   *   · a run this row has not shown yet (first mount, a newer run, another card) → its first deck
   *     opens, or none when it has none;
   *   · the same run, and a sheet now has MORE pieces than last seen → that sheet's deck opens — a
   *     split landed, from here or from the history, since the band is one.
   * Nothing else touches `openDeck` here: the person's own toggles and the E-4 fold stand until the
   * next run or the next split.
   */
  /** THE ROW AS DRAWN — heads in their originals' places; the tiles under an open editor kept. */
  const editingKey = editedKey(bench.surfaces);
  const plan = useMemo(() => {
    if (!run) return null;
    const keep = new Set(editingKey ? editingKey.split(',').map(Number) : []);
    return outputPlan(run.pictures ?? [], { heads: true, keep });
  }, [run, editingKey]);
  const decks = useMemo(() => decksOf(plan), [plan]);
  const deckKey = `${techCardId}:${runId}|${decks.map((d) => `${d.root}x${d.count}`).join(',')}`;
  const [seen, setSeen] = useState<{
    card: number;
    runId: number;
    key: string;
    sizes: Map<number, number>;
  } | null>(null);
  if (!seen || seen.key !== deckKey) {
    let next: number | null | undefined;
    if (!seen || seen.card !== techCardId || seen.runId !== runId) {
      next = decks[0]?.root ?? null;
      // ANOTHER CARD closes a split in progress: its picture is not on this screen. A newer run of
      // the SAME card never gets here while the modal is open — the split pins the run it cuts
      // (`bench-store.ts`), and the pieces land on this row.
      if (seen && seen.card !== techCardId && splitting) setSplitting(null);
    } else {
      const grown = decks.find((d) => d.count > (seen.sizes.get(d.root) ?? 0));
      if (grown) next = grown.root;
    }
    setSeen({
      card: techCardId,
      runId,
      key: deckKey,
      sizes: new Map(decks.map((d) => [d.root, d.count])),
    });
    if (next !== undefined && next !== openDeck) setOpenDeck(next);
  }

  /** The viewer row of THIS row: its pictures in the order shown, the open deck's pieces inside. */
  const gallery = useMemo(
    () => (run && plan ? runsGallery([run], openDeck, () => plan) : runsGallery([], openDeck)),
    [run, plan, openDeck],
  );
  const galleryGroup = useGalleryGroup(gallery.items);
  const deckOf = useMemo(
    () => (run && plan ? deckOfRuns([run], () => plan) : new Map<number, number>()),
    [run, plan],
  );

  if (!run) return null;

  const state = runStateWord(run, elapsed);
  /** Said only over the newest run with pictures — a run pinned behind a newer one says the line. */
  const note = skippedNote(newest && newestId === runId ? newest.skipped : []);
  const newer = newest && newestId > runId ? newest.run : null;

  return (
    <div data-latest-generation={runId} ref={galleryGroup.anchorRef}>
      <GroupLabel
        action={
          <Text size='nano' variant='label' component='span' data-latest-stamp=''>
            {state && (
              <>
                <span className='text-textColor' title={state.note}>
                  {state.word}
                </span>
                {' · '}
              </>
            )}
            {runStamp(run)}
          </Text>
        }
      >
        latest generation
      </GroupLabel>

      {note && newest && (
        <Text
          size='micro'
          variant='label'
          component='p'
          className='mb-2'
          data-latest-passed-over={newest.skipped[0]?.id ?? 0}
          data-latest-skipped={newest.skipped.length}
          title={note.title}
        >
          {note.text}
        </Text>
      )}

      <RunOutputs
        band={band}
        techCardId={techCardId}
        run={run}
        rep={runRepresentation(run)}
        cardFit={cardFit}
        elapsed={elapsed}
        disabled={disabled || !speaks}
        galleryKey={galleryGroup.key}
        galleryIndexOf={gallery.indexOf}
        openDeck={openDeck}
        onDeck={(rootId) => setOpenDeck((current) => (current === rootId ? null : rootId))}
        onZoomPicture={(pictureId) => {
          // The viewer is a surface of this run too: pinned from the click, before any re-read.
          pinShown(techCardId, true);
          setOpenDeck((current) => deckAfterZoom(current, pictureId, deckOf));
        }}
        onSplit={(picture) => {
          openSurface(techCardId, 'split:bench', picture.runId ?? 0);
          setSplitting({ picture, handle: pictureHandle(picture) });
        }}
        workbench
        plan={plan ?? undefined}
      />

      {/* A NEWER RUN, WHILE THIS ONE IS KEPT — one quiet line under the tiles; the click moves the
          workbench to the newest and lets the pin go. «started» while that run is in flight: it is
          not ready yet. */}
      {newer && (
        <span className='mt-2 flex flex-wrap items-center gap-1.5' data-latest-newer={newestId}>
          <Text size='micro' variant='label' component='span'>
            {isRunLive(newer) ? 'newer run started' : 'newer run ready'} ·
          </Text>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            aria-label={`show ${runHandle(newestId)} here`}
            title='the newest flat run — the one shown now stays in the history below'
            onClick={() => releasePin(techCardId)}
          >
            show ›
          </Button>
        </span>
      )}

      {splitting && (
        <SplitModal
          techCardId={techCardId}
          picture={splitting.picture}
          handle={splitting.handle}
          open
          /* The history's cut, not the input's (T-15): the pieces get their views and become
             pictures of the band; no prompt role is written for them. */
          forInput={false}
          onOpenChange={(open) => !open && setSplitting(null)}
        />
      )}
    </div>
  );
}
