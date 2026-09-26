import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { runRepresentation } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { pictureHandle } from '../handles';
import { useGalleryGroup } from '../picture-tile';
import { SplitModal } from '../split-modal';
import { isRunArchived } from '../visibility';
import { cropFamilies } from './composite';
import { deckAfterZoom, deckOfRuns, runsGallery } from './run-gallery';
import { RunOutputs } from './run-outputs';
import {
  isRunLive,
  runFailureText,
  runOutcomeNote,
  runStamp,
  runStateWord,
  runStatus,
} from './run-state';
import { useElapsed } from './use-generation';

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
 * live or holding pictures. A newer flat run that came back with nothing (failed, cancelled, empty)
 * is passed over and SAID: «the newest run failed · CODE — this is the one before». Nothing to show
 * on the first page → no workbench at all; the history below still has every run.
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
 * THE RUN THE WORKBENCH SHOWS, and the newest run it passed over for having nothing, if any. Reads
 * the band's first page only — the page the band already holds; the workbench asks for no more.
 */
export function latestFlatRun(
  band: Pick<GetDesignBandResponse, 'runs'>,
): { run: common_DesignRun; passedOver: common_DesignRun | null } | null {
  const flats = (band.runs ?? [])
    .filter((run) => (run.id ?? 0) > 0 && isFlatRun(run) && !isRunArchived(run))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  let passedOver: common_DesignRun | null = null;
  for (const run of flats) {
    if (isRunLive(run) || (run.pictures ?? []).length > 0) return { run, passedOver };
    passedOver ??= run;
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

/** The decks of one run in display order: every sheet that has cut pieces, and how many. */
function decksOf(run: common_DesignRun | null): { root: number; count: number }[] {
  if (!run) return [];
  const pictures = run.pictures ?? [];
  const families = cropFamilies(pictures);
  const out: { root: number; count: number }[] = [];
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    const members = families.membersOf.get(id);
    if (members?.length && !families.rootOf.has(id)) out.push({ root: id, count: members.length });
  }
  return out;
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

  const picked = useMemo(() => latestFlatRun(band), [band]);
  const run = picked?.run ?? null;
  const runId = run?.id ?? 0;
  const elapsed = useElapsed(run ? run.startedAt || run.createdAt : undefined);

  const [openDeck, setOpenDeck] = useState<number | null>(null);
  const [splitting, setSplitting] = useState<{
    picture: common_DesignPicture;
    handle: string;
  } | null>(null);

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
  const decks = useMemo(() => decksOf(run), [run]);
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
      // Another card or another run: a split of the old one has nothing left to cut.
      if (splitting) setSplitting(null);
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
  const gallery = useMemo(() => runsGallery(run ? [run] : [], openDeck), [run, openDeck]);
  const galleryGroup = useGalleryGroup(gallery.items);
  const deckOf = useMemo(() => deckOfRuns(run ? [run] : []), [run]);

  if (!run) return null;

  const state = runStateWord(run, elapsed);
  const passedOver = picked?.passedOver ?? null;

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

      {passedOver && (
        <Text
          size='micro'
          variant='label'
          component='p'
          className='mb-2'
          data-latest-passed-over={passedOver.id ?? 0}
          title={runOutcomeNote(passedOver)}
        >
          {passedOverNote(passedOver)}
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
        onZoomPicture={(pictureId) =>
          setOpenDeck((current) => deckAfterZoom(current, pictureId, deckOf))
        }
        onSplit={(picture) => setSplitting({ picture, handle: pictureHandle(picture) })}
        workbench
      />

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
