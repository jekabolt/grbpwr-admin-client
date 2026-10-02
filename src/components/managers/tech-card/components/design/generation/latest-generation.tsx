import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useEffect, useLayoutEffect, useMemo, useState, type JSX } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { runRepresentation } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { pictureHandle, runHandle } from '../handles';
import { useGalleryGroup, useGalleryViewerOpen } from '../picture-tile';
import { RenderDoorsHost, hostPlates } from '../render/render-tile';
import { SplitModal } from '../split-modal';
import { isRunArchived } from '../visibility';
import {
  clearBenchChoice,
  closeSurface,
  benchShowsWhole,
  heldRunId,
  openSurface,
  pinShown,
  publishShown,
  releasePin,
  useBench,
  useBenchChoice,
} from './bench-store';
import { benchPlan, deckAfterZoom, deckOfRuns, runsGallery, type OutputPlan } from './run-gallery';
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
 * ═══ THE LATEST GENERATION — A BLOCK OF ITS OWN UNDER THE GENERATE BLOCK (O-53; 28.09, O-67) ═══
 *
 * Owner, verbatim: «после генерации в FLAT INPUT — REFERENCES в этом же блоке но снизу должны
 * появятся сгенерированные картинки и там мы уже можем непосредственно делать все тоже самое что и в
 * GENERATION HISTORY а именно засплитить эдитнуть зазумить после сплита они все так же должны там
 * отображаться и там же можно сделать разметку … на этом воркбенче должна отображаться последняя
 * генерация».
 *
 * WHAT IT IS (28.09, O-67, D-73). A BLOCK OF ITS OWN — a `Section` «LATEST GENERATION» with the
 * chrome of its neighbours (the same header rule and clause, the same padding, the block's own
 * rhythm between its rows), standing IMMEDIATELY after the block whose GENERATE it answers: on
 * FLAT after INPUT — REFERENCES (`studio-tab.tsx`), on FABRIC RENDER after that block and before
 * SIDES (`render-studio.tsx`). Until O-67 it was the last row of that block under a `GroupLabel`;
 * owner, verbatim: «LATEST GENERATION в флетах и фабрик рендерах должна быть отдельным блоком».
 * In the header's action slot the run's stamp (state word, `author · hh:mm`; no price — O-37),
 * then the history row's own outputs block (`RunOutputs`) on the workbench's 190px track — the
 * reference grid's, one block up, so the columns line up across the gutter. The doors are
 * `RunTile`'s, unchanged:
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
 * No run of the kind on the first page → no block at all, not an empty header (D-73); the history
 * below still has every run.
 * Runs, but none came back with pictures → the newest of them stands here BARE (27.09, O-63 r2,
 * D-72 п.3): its stamp, how it ended and why — see `BareOutcome`.
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
 * A RUN PUT HERE FROM THE HISTORY STANDS WHOLE (03.10, owner item 9: «помещаются все картинки и
 * эдиты генерации»): every picture and edit, its history row's plan (`benchPlan`, `benchShowsWhole`).
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
 *
 * ═══ AND ON FABRIC RENDER, THE SAME ORGAN (27.09, O-63, D-62) ═══════════════════════════════════
 * Owner, verbatim: «после генерации результат показывать как во флетах те с LATEST GENERATION и
 * GENERATION HISTORY свернут по дефолту и RENDERS OF THIS CARD получается не нужен». `kind='render'`
 * mounts this block right after FABRIC RENDER (the block of its GENERATE) and above SIDES — a sibling
 * block since O-67 (D-73), still inside `RenderStepScope`: the newest render
 * run that is not archived and is live or holds pictures — of ANY colourway, as the history is —
 * with the same pin, «newer run ready · show ›» and «the one before». Its tiles are `RunTile`s too;
 * a render run's tile draws the render doors (`mark ▸`, `apply splitted`, `expand ▸`, `unmark ▸` —
 * `render/render-tile.tsx`), whose rules are one hook over the plates of this row
 * (`RenderDoorsHost`), their refusal notes printed once above the tiles. Its edit always files a
 * NEW picture: «overwrite or save as new» is the flat's question.
 */

/** Which step's workbench this is: FLAT's (the default) or FABRIC RENDER's (O-63). */
export type WorkbenchKind = 'flat' | 'render';

/** A run of this block's GENERATE — `kind` exactly `flat` on FLAT, exactly `render` on FABRIC RENDER. */
function isRunOfKind(run: Pick<common_DesignRun, 'kind'>, kind: WorkbenchKind): boolean {
  return (run.kind ?? '').trim().toLowerCase() === kind;
}

/**
 * THE NEWEST RUN THE WORKBENCH CAN SHOW, and EVERY newer run of its kind it passed over for having
 * nothing, newest first. Reads the band's first page only — the page the band already holds; the
 * workbench asks for no more.
 *
 * ⚠ «NOTHING WITH PICTURES» IS NOT «NOTHING TO SHOW» (27.09, O-63 r2, D-72 п.3). When no run of the
 * kind is live or came back with pictures, the newest of them is the answer — `bare`: it failed,
 * was cancelled or came back empty, and that is exactly what the person under GENERATE has to see.
 * Until round 2 this returned null there, and the card's first run, failed, left no trace above the
 * history, which both steps fold by default. `skipped` of a bare answer are the older runs, all of
 * them bare too. One rule for FLAT and FABRIC RENDER.
 */
export function latestRunOf(
  band: Pick<GetDesignBandResponse, 'runs'>,
  kind: WorkbenchKind = 'flat',
): { run: common_DesignRun; skipped: common_DesignRun[]; bare: boolean } | null {
  const runs = (band.runs ?? [])
    .filter((run) => (run.id ?? 0) > 0 && isRunOfKind(run, kind) && !isRunArchived(run))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const skipped: common_DesignRun[] = [];
  for (const run of runs) {
    if (isRunLive(run) || (run.pictures ?? []).length > 0) return { run, skipped, bare: false };
    skipped.push(run);
  }
  return runs.length ? { run: runs[0], skipped: runs.slice(1), bare: true } : null;
}

/** «the newest run failed · CODE — this is the one before», worded by how the newer run ended. */
function passedOverNote(run: common_DesignRun): string {
  const status = runStatus(run);
  const failure = runFailureText(run);
  const code = failure.words || failure.code;
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

/**
 * ═══ A BARE RUN — HOW IT ENDED, AND WHY (27.09, O-63 r2, D-72 п.3) ════════════════════════════════
 *
 * What the workbench draws instead of tiles when nothing of its kind came back with pictures: one
 * line, worded by how the newest run ended («failed — nothing came back», «was cancelled — nothing
 * came back», «came back empty»), counting the older runs that brought nothing either; then the
 * provider's own words, the context a retry needs — under the same heading the run's `meta ▸` panel
 * gives them (`run-panel.tsx`), cut to four lines with the whole text in the title (up to 4 000
 * characters, D-4). The code stands in the header's state word already.
 */
function BareOutcome({
  run,
  earlier,
}: {
  run: common_DesignRun;
  earlier: readonly common_DesignRun[];
}): JSX.Element {
  const status = runStatus(run);
  const { code, text } = runFailureText(run);
  const head =
    status === 'failed'
      ? 'the newest run failed — nothing came back'
      : status === 'cancelled'
        ? 'the newest run was cancelled — nothing came back'
        : status === 'done'
          ? 'the newest run came back empty'
          : 'the newest run brought no picture';
  const n = earlier.length;
  const before = n ? ` · the ${n === 1 ? 'run' : `${n} runs`} before it brought none either` : '';
  return (
    <div data-latest-outcome={status || 'unknown'} data-latest-skipped={n} className='space-y-1.5'>
      <Text
        size='micro'
        variant='label'
        component='p'
        title={[run, ...earlier].map((r) => `${runHandle(r.id)} · ${runOutcomeNote(r)}`).join('; ')}
      >
        {head}
        {before}
      </Text>
      {(code || text) && (
        <CalloutBox tone='note'>
          <Text size='nano' variant='label' component='p' className='uppercase tracking-label'>
            {status === 'failed'
              ? 'why it failed'
              : status === 'cancelled'
                ? 'what was cut short'
                : 'the last attempt'}
            {code ? ` · ${code}` : ''}
          </Text>
          {text && (
            <Text
              size='micro'
              variant='label'
              component='p'
              className='line-clamp-4 max-w-[75ch] whitespace-pre-wrap break-words'
              title={text}
            >
              {text}
            </Text>
          )}
        </CalloutBox>
      )}
    </div>
  );
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
  kind = 'flat',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** The step whose GENERATE this row answers — FLAT's by default, FABRIC RENDER's (O-63). */
  kind?: WorkbenchKind;
}) {
  const speaks = serverSpeaksDesign();
  const form = useFormContext<TechCardFormData>();
  const cardFit = (form?.watch('fit') ?? '').trim();

  const newest = useMemo(() => latestRunOf(band, kind), [band, kind]);
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
  /* THE RUN PUT ON THE BENCH FROM THE HISTORY (03.10, owner item 9; `bench-store.ts`) — FLAT only.
     It is held exactly as a pin is: read from the band's first page, else by id. */
  const chosen = useBenchChoice(kind === 'flat' ? techCardId : 0);
  const heldId = heldRunId(pin, chosen, newestId);
  const pinnedLive = useMemo(
    () => (heldId ? (band.runs ?? []).find((r) => (r.id ?? 0) === heldId) ?? null : null),
    [band, heldId],
  );
  const byId = useRunById(techCardId, heldId, !!heldId && !pinnedLive);
  const byIdRun = byId.data?.run;
  /** The held run from a read that CONTAINS it — the band's first page, or its own by-id read. */
  const pinnedFresh =
    pinnedLive ?? (heldId && byIdRun && (byIdRun.id ?? 0) === heldId ? byIdRun : null);
  const [pinnedCopy, setPinnedCopy] = useState<common_DesignRun | null>(null);
  if (pinnedFresh && pinnedFresh !== pinnedCopy) setPinnedCopy(pinnedFresh);
  const pinnedRun = heldId
    ? pinnedFresh ?? (pinnedCopy && (pinnedCopy.id ?? 0) === heldId ? pinnedCopy : null)
    : null;
  /** Archival OBSERVED (D-49): the archived stamp on a read that contains the run — never inferred. */
  const archivedSeen = !!pinnedFresh && isRunArchived(pinnedFresh);
  /** The chosen run was archived, or is not a flat run: the choice goes, the bench follows the newest. */
  const choiceGone =
    !pin && heldId > 0 && !!pinnedFresh && (archivedSeen || !isRunOfKind(pinnedFresh, kind));
  useLayoutEffect(() => {
    if (choiceGone) clearBenchChoice(techCardId);
  }, [choiceGone, techCardId]);
  const run = (choiceGone ? null : pinnedRun) ?? newest?.run ?? null;
  const runId = run?.id ?? 0;
  /**
   * THE RUN STANDS HERE BARE (O-63 r2, D-72 п.3): nothing of the kind came back with pictures, and
   * the newest run is shown for its outcome. A pinned run is never bare — a pin is a surface opened
   * on a tile, and a bare run has none.
   */
  const bare = !!newest?.bare && runId === newestId;
  /** Somebody is working — a surface open anywhere on the step, or the viewer. */
  const held = bench.surfaces.size > 0 || viewerOpen;
  // The clock ticks only while the run is in flight (review, MINOR): a finished run shows no elapsed
  // time, and a ticking hook re-rendered the whole tile grid once a second for nothing.
  const elapsed = useElapsed(run && isRunLive(run) ? run.startedAt || run.createdAt : undefined);

  /* What this row shows is published for the history (its row of this run turns «on the bench»)
     and for the tiles' surfaces (a surface on this run pins it). Leaving — the step, or the card —
     lets the pin go: coming back shows the newest. A bare run is not published (O-63 r2): its
     history row would turn into «on the bench ↑», pointing at tiles that do not exist — it stays
     its own row, the outcome in its meta line. */
  const shownId = bare ? 0 : runId;
  useLayoutEffect(() => {
    publishShown(techCardId, shownId);
  }, [techCardId, shownId]);
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
  /** THE ROW AS DRAWN — heads in their originals' places; the tiles under an open editor kept.
   *  A run put on the bench from the history: all of it (FX4, `benchPlan`). */
  const editingKey = editedKey(bench.surfaces);
  const whole = kind === 'flat' && benchShowsWhole(chosen, runId);
  const plan = useMemo(() => {
    if (!run) return null;
    const keep = new Set(editingKey ? editingKey.split(',').map(Number) : []);
    return benchPlan(run.pictures ?? [], { whole, keep });
  }, [run, editingKey, whole]);
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
  /** O-63: what the render doors of this row read — its plates and its decks (`RenderDoorsHost`). */
  const plates = useMemo(() => hostPlates(kind === 'render' && plan ? [plan] : []), [kind, plan]);
  const toggleDeck = (rootId: number) =>
    setOpenDeck((current) => (current === rootId ? null : rootId));

  if (!run) return null;

  const state = runStateWord(run, elapsed);
  /** Said only over the newest run with pictures — a run pinned behind a newer one says the line. */
  const note = skippedNote(newest && newestId === runId && !bare ? newest.skipped : []);
  const newer = newest && newestId > runId ? newest.run : null;

  /** The row's outputs block — the history's own (`RunOutputs`), on the workbench's track. */
  const outputs = (
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
      onDeck={toggleDeck}
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
  );

  return (
    <div data-latest-generation={runId} ref={galleryGroup.anchorRef}>
      {/* THE BLOCK (O-67, D-73): the neighbours' `Section`, the run's stamp in its header's action
          slot, the pieces below spaced by the block's own rhythm — no hand margins. The wrapper
          carries the anchor and the gallery group's node, and is the NEXT SIBLING of the block whose
          GENERATE this answers (`#design-input` on FLAT, `#design-render-bench` on FABRIC RENDER). */}
      <Section
        title='latest generation'
        question='— what the last run brought back'
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
        {bare && newest && <BareOutcome run={run} earlier={newest.skipped} />}

        {note && newest && (
          <Text
            size='micro'
            variant='label'
            component='p'
            data-latest-passed-over={newest.skipped[0]?.id ?? 0}
            data-latest-skipped={newest.skipped.length}
            title={note.title}
          >
            {note.text}
          </Text>
        )}

        {/* O-63: ON FABRIC RENDER the tiles below draw the render doors, and their rules read this
            row's plates (`RenderDoorsHost`); FLAT's row is drawn as it always was. The doors' notes
            stand once above the tiles, spaced by the block. `disabled` is the card's alone: the
            server's silence the doors read themselves, and say so in their own words. */}
        {bare ? null : kind === 'render' ? (
          <RenderDoorsHost
            band={band}
            techCardId={techCardId}
            disabled={disabled}
            pictures={plates.pictures}
            membersOf={plates.membersOf}
            openDeck={openDeck}
            onDeck={toggleDeck}
            runOf={() => run}
          >
            {outputs}
          </RenderDoorsHost>
        ) : (
          outputs
        )}

        {/* A NEWER RUN, WHILE THIS ONE IS KEPT — one quiet line under the tiles; the click moves the
            workbench to the newest and lets the pin go. «started» while that run is in flight: it is
            not ready yet. */}
        {newer && (
          <span className='flex flex-wrap items-center gap-1.5' data-latest-newer={newestId}>
            <Text size='micro' variant='label' component='span'>
              {isRunLive(newer)
                ? 'newer run started'
                : newest?.bare
                  ? 'newer run came back with nothing'
                  : 'newer run ready'}{' '}
              ·
            </Text>
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              aria-label={`show ${runHandle(newestId)} here`}
              title={`the newest ${kind} run — the one shown now stays in the history below`}
              onClick={() => {
                releasePin(techCardId);
                if (kind === 'flat') clearBenchChoice(techCardId);
              }}
            >
              show ›
            </Button>
          </span>
        )}
      </Section>

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
