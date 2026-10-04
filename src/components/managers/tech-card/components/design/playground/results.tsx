import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useCallback, useMemo, useRef, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import { HeaderCount } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import {
  cardOutputRows,
  outputsHorizon,
  runRepresentation,
  workflowOutputsHorizon,
  type Representation,
} from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { colorwayLabel } from '../colorway-picker';
import { EmptyState } from '../core';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
import { clockStamp, runHandle } from '../handles';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { pictureIsSelected, pictureThumb, serverStatesSelected } from '../render/model';
import { isVideoUrl } from '../video-media';
import { isPictureHidden } from '../visibility';
import { useDesignWrites } from '../use-design-band';
import { useFocusReturn } from './focus';
import {
  PLAYGROUND_ROOM,
  inPlaygroundRoom,
  retiredPresetWord,
  retouchSourceId,
  runWorkflowWord,
  workflowByKey,
  workflowOfRun,
} from './registry';
import { maskableRun, retouchOffered } from './registry/tiles/retouch-zone';
import type { ResultsDef, WorkflowDef } from './registry/types';
import { MaskEditor } from './mask';

/**
 * ═══ WHAT CAME BACK — the room's results, or one workflow's (C-03) ═════════════════════════════════
 *
 * READ FROM THE OUTPUTS OF THE CARD, never from the form above (the form is INPUT). Whole-card scope
 * (`cardOutputRows`, H-9): a picture that fell off the feed's first page is paid work, and it stays
 * on the screen that shows it.
 *
 *  · The grid (no workflow open) shows EVERY picture of the room: the playground's own kinds and the
 *    recolours ON MODEL used to hold.
 *  · An open workflow shows ITS pictures (`def.run.results.match`), and the runs of that workflow
 *    that are still out — or that just failed — stand above the tiles, so the press has an answer
 *    on the same screen.
 *
 * ⚠ THE WINDOW. The server sends the newest 60 per colourway, and inside the playground's own pool
 * (colourway 0) the newest 60 PER WORKFLOW (band 31). When it says it left pictures behind, the
 * caption says so rather than letting an older result vanish silently: on the grid (and under tile
 * 10, which shows the room) the colourway-0 count (`outputsHorizon`); under an open tile ITS count
 * (`workflowOutputsHorizon`, G-02 m-1) — and nothing on a server older than that count, or under
 * the tiles of the colourway pool (`COLOURWAY_POOL`): a recolour or a 3D model may be filed under a
 * colourway, so no playground window says anything true about their list.
 *
 * A press on the picture opens the gallery (no zoom corner, T12); corners: `edit ▸` (draw over
 * it, saving a NEW picture) on every picture;
 * `mask` (C-11: paint a zone and retouch it, a new picture comes back) on every raster of the room
 * while the server offers Retouch a Zone — the same door the viewer shows for that picture;
 * the `select` mark where the workflow says so (`ResultsDef.selectable` — recolours, as ON MODEL
 * had it; ARTIFACTS offers the chosen ones for markup). A cut-out (`ResultsDef.cutout`) stands on a
 * neutral ground with the word «no background» under it: its subject is on transparency, over white
 * it would read as a picture with a white background, and the ground alone does not say «alpha».
 *
 * ⚠ THE ROW ASKS THE WORKFLOW THAT MADE IT, not the one open: on the grid the rows of several
 * workflows stand together, and each keeps its own corners.
 *
 * ⚠ A WORKFLOW THAT STARTS ELSEWHERE SHOWS THE ROOM (`WorkflowRun.startsElsewhere`, tile 10):
 * Retouch a Zone works on a picture you already have, so under it stand the pictures it starts
 * from — every picture of the room, each with its Mask — and its answer lands among them, next to
 * the original. The history below it still narrows to retouches (`results.match`).
 *
 * ⚠ THE PINNED RUNS ARE THE OPEN WORKFLOW'S, whatever the pictures are (G-02 Codex 8): under tile 10
 * the pictures are the room's but the live and failed runs above them are retouches only. And under
 * any other tile, a live retouch started from one of ITS pictures stands there too (G-02 m-2) —
 * saying truly where its answer lands (under Retouch a Zone), since that is not this tile's list.
 *
 * FOCUS AFTER THE MASK (G-02 m-4): the editor is opened by state — from a tile's `mask` corner or
 * from the viewer, which closes first — so focus is handed back to the opener, or to that picture's
 * `mask` corner when the opener is gone (`useFocusReturn`).
 */

type Row = { picture: common_DesignPicture; run: common_DesignRun };

/** The workflows whose pictures live in the colourway pool, not the room's colourway-0 window. */
const COLOURWAY_POOL: ReadonlySet<string> = new Set([
  'change_color',
  'swap_fabrics',
  'image_to_3d',
]);

/** The results contract of the workflow a run belongs to (`null` = a kind outside the room). */
const resultsOfRun = (run: common_DesignRun): ResultsDef | null =>
  workflowByKey(workflowOfRun(run))?.run?.results ?? null;

/**
 * Every output of the given representations, newest run first — the order `cardOutputRows` keeps
 * inside one representation, restored across two by the newest picture id of each run. `null` when
 * this server states no whole-card list.
 */
function cardRows(band: GetDesignBandResponse, reps: readonly Representation[]): Row[] | null {
  const groups: Row[][] = [];
  for (const rep of reps) {
    const rows = cardOutputRows(band, rep);
    if (!rows) return null;
    // `cardOutputRows` hands a run's pictures back together; a run without an id is its own group.
    let last = -1;
    for (const row of rows) {
      const runId = row.run.id ?? 0;
      if (runId <= 0 || runId !== last) groups.push([]);
      groups[groups.length - 1].push(row);
      last = runId;
    }
  }
  const top = (g: Row[]) => (g.length ? Math.max(...g.map((r) => r.picture.id ?? 0)) : 0);
  return groups.sort((a, b) => top(b) - top(a)).flat();
}

/** The same, walked off the feed's first page — a server older than the whole-card list. */
function pageRows(band: GetDesignBandResponse, reps: readonly Representation[]): Row[] {
  const out: Row[] = [];
  for (const run of band.runs ?? []) {
    const rep = runRepresentation(run);
    if (!rep || !reps.includes(rep)) continue;
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture) || (picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  return out;
}

export function PlaygroundResults({
  band,
  techCardId,
  disabled,
  def,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** The open workflow, or `null` on the grid. */
  def: WorkflowDef | null;
}): JSX.Element {
  // Hooks above every early return (React #310 has taken this tab down once already).
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const { data: techCard } = useTechCard(techCardId || undefined);
  const [editingId, setEditingId] = useState(0);
  const [maskingId, setMaskingId] = useState(0);
  const [selecting, setSelecting] = useState(0);
  /* The picture whose editor is open — its `mask` corner is where focus returns when the door that
     opened the editor (the viewer's Mask) is gone. A ref, so the fallback stays one function. */
  const maskedPicture = useRef(0);
  const maskDoor = useCallback(
    () =>
      document.querySelector<HTMLElement>(
        `[data-pg-output="${maskedPicture.current}"] button[aria-label^="mask picture"]`,
      ),
    [],
  );
  const maskFocus = useFocusReturn(maskDoor);

  /* THE CARD CHANGED — the open editor is addressed by a picture id of the OTHER card (invariant
     12). Closed in the body of the render, never in an effect. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (editingId) setEditingId(0);
    if (maskingId) setMaskingId(0);
  }

  /** The room's view: the grid, or a workflow that starts from the room's pictures (tile 10). */
  const roomView = !def || !!def.run?.startsElsewhere;
  const results = roomView ? undefined : def?.run?.results;
  const reps = results?.reps ?? PLAYGROUND_ROOM;
  const match = results?.match ?? inPlaygroundRoom;
  /** Whose live and failed runs stand above the pictures: the open workflow's, else the room's. */
  const pinMatch = def?.run?.results.match ?? inPlaygroundRoom;

  const rows = useMemo(() => {
    const all = cardRows(band, reps) ?? pageRows(band, reps);
    return all.filter((row) => match(row.run));
  }, [band, reps, match]);

  /* The runs of this workflow still out, and the newest one if it failed: the answer to a press
     stands above what came back. Older failures live in the history, not here. Then the live
     retouches of THIS tile's pictures, which land elsewhere (the file head). */
  const pinned = useMemo(() => {
    const room = (band.runs ?? []).filter((run) => inPlaygroundRoom(run));
    const mine = room.filter((run) => pinMatch(run));
    const live = mine.filter((run) => isRunLive(run));
    const newest = mine[0];
    const failed =
      newest && !isRunLive(newest) && (newest.status ?? '').trim().toLowerCase() === 'failed'
        ? [newest]
        : [];
    const shown = new Set(rows.map((row) => row.picture.media?.id ?? 0).filter((id) => id > 0));
    const retouching =
      def && !roomView
        ? room.filter((run) => !pinMatch(run) && isRunLive(run) && shown.has(retouchSourceId(run)))
        : [];
    return [
      ...[...live, ...failed].map((run) => ({ run, elsewhere: false })),
      ...retouching.map((run) => ({ run, elsewhere: true })),
    ];
  }, [band, pinMatch, rows, def, roomView]);

  /* The caption of the window (the file head): the room's colourway-0 window on the grid and under
     tile 10; the open tile's own window under it (band 31); none under the colourway pool — Change
     a Color and Swap Fabrics (and Image to 3D, whose own view draws its models) may file under a
     colourway, so the sentence would count another list (m-5, G-02 m-8). */
  const horizon = useMemo(() => {
    if (roomView) return outputsHorizon(band, 0);
    if (!def || COLOURWAY_POOL.has(def.key)) return null;
    return workflowOutputsHorizon(band, def.key);
  }, [band, def, roomView]);
  const carries = rows.length ? serverStatesSelected(rows[0].picture) : true;
  const writesOff = !!disabled || !speaks;
  const masks = !writesOff && retouchOffered(band);
  const masking = maskingId > 0 ? rows.find((o) => (o.picture.id ?? 0) === maskingId) : undefined;

  const wayName = (id?: number | null): string => {
    if (!id) return '';
    const ref = (techCard?.colorways ?? []).find((c) => (c.colorwayId ?? 0) === id);
    return ref ? colorwayLabel(ref).toLowerCase() : `colourway #${id}`;
  };

  return (
    <Section
      id='design-playground-results'
      title='what came back'
      question={
        roomView || !def
          ? '· every playground picture of this card'
          : `· ${def.title.toLowerCase()}`
      }
      action={<HeaderCount n={rows.length} noun='picture' />}
    >
      <div className='flex flex-col gap-4'>
        {pinned.map(({ run, elsewhere }) => {
          const live = isRunLive(run);
          return (
            <CalloutBox key={run.id} tone={live ? 'note' : 'error'}>
              <Text size='micro' component='p' className='normal-case' data-pg-pinned={run.id}>
                <b>
                  {runHandle(run.id) || 'run'} — {runOutcomeNote(run)}.
                </b>{' '}
                {elsewhere
                  ? 'A retouch of a picture below: it lands under Retouch a Zone when the provider answers.'
                  : live
                    ? 'The picture lands here when the provider answers.'
                    : 'These are the server’s words. Nothing was filed for this run.'}
              </Text>
            </CalloutBox>
          );
        })}

        {rows.length === 0 ? (
          <EmptyState>
            {roomView
              ? 'nothing has come back yet'
              : 'nothing has come back from this workflow yet'}
          </EmptyState>
        ) : (
          <Tiles min={148} className='gap-3'>
            {rows.map(({ picture, run }) => {
              const id = picture.id ?? 0;
              const own = resultsOfRun(run);
              const cut = !!own?.cutout;
              /* B-32: a clip plays in its tile; it has no mask and no draw-over (both are raster
                 doors — the mask editor and the vector modal read pixels), only the gallery. */
              const clip = isVideoUrl(pictureThumb(picture));
              const selectable = !!own?.selectable;
              const chosen = selectable && pictureIsSelected(picture);
              const words = [
                // An open workflow names only what differs from it: a retired preset's run.
                roomView ? runWorkflowWord(run) : retiredPresetWord(run),
                wayName(run.colorwayId),
                clockStamp(run.completedAt ?? run.createdAt),
              ].filter(Boolean);
              return (
                <div key={id} className='flex min-w-0 flex-col gap-1' data-pg-output={id}>
                  <PictureTile
                    url={pictureThumb(picture)}
                    alt={`playground picture ${picture.ordinal ?? ''}`.trim()}
                    aspect='4/5'
                    fit='contain'
                    ground={cut ? 'neutral' : undefined}
                    selected={chosen}
                    badge={chosen ? 'selected' : undefined}
                    className='w-full bg-bgColor'
                    gallery={
                      picture.media && mediaFullViewerSrc(picture.media)
                        ? mediaFullToViewerItem(picture.media)
                        : undefined
                    }
                    onSelect={
                      selectable && carries && !writesOff
                        ? {
                            onClick: () => {
                              setSelecting(id);
                              setPictureSelected.mutate(
                                { pictureId: id, selected: !chosen },
                                { onSettled: () => setSelecting(0) },
                              );
                            },
                            pending: selecting === id,
                            ariaLabel: chosen
                              ? `take the chosen mark off picture ${picture.ordinal ?? ''}`.trim()
                              : `mark picture ${picture.ordinal ?? ''} as chosen`.trim(),
                            title: chosen
                              ? 'take the mark off'
                              : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup',
                          }
                        : undefined
                    }
                    selectLabel={chosen ? 'un-select' : 'select'}
                    onMask={
                      masks &&
                      !clip &&
                      maskableRun(run) &&
                      (picture.media?.id ?? 0) > 0 &&
                      pictureThumb(picture)
                        ? {
                            onClick: () => {
                              // The corner, or the viewer's Mask (gone by close): the fallback
                              // below is this picture's corner.
                              maskFocus.remember();
                              maskedPicture.current = id;
                              setMaskingId(id);
                            },
                            ariaLabel:
                              `mask picture ${picture.ordinal ?? ''} — paint a zone to retouch`.trim(),
                            title:
                              'paint a zone of this picture and say what should be there — a NEW picture comes back',
                          }
                        : undefined
                    }
                    onEdit={
                      !writesOff && !clip && pictureThumb(picture)
                        ? {
                            onClick: () => setEditingId(id),
                            ariaLabel:
                              `edit picture ${picture.ordinal ?? ''} — draw over it`.trim(),
                            title:
                              'draw over this picture — saving makes a NEW picture; the original is never overwritten',
                          }
                        : undefined
                    }
                  />
                  <Text size='micro' className='truncate font-bold uppercase'>
                    {runHandle(run.id) || 'run —'} · picture {picture.ordinal ?? '—'}
                  </Text>
                  <Text size='micro' variant='label' className='truncate'>
                    {words.join(' · ') || '—'}
                  </Text>
                  {/* ONE WORD, NOT A PARAGRAPH (the old playground's pill, restored — G-01 M-2): the
                      tile's height stays the grid's, and the fact reads as fully. */}
                  {cut && (
                    <span>
                      <Pill
                        tone='mut'
                        title='the subject stands on transparency — the tone behind it is this screen’s, not the picture’s'
                      >
                        no background
                      </Pill>
                    </span>
                  )}
                </div>
              );
            })}
          </Tiles>
        )}

        {horizon && (
          <Text
            size='micro'
            variant='label'
            component='p'
            className='normal-case'
            data-pg-horizon={roomView ? 'room' : 'workflow'}
          >
            {roomView
              ? `Only the newest ${horizon.carried} of this card’s ${horizon.total} pictures without a colourway are sent here; older ones stay in the history below.`
              : `Only the newest ${horizon.carried} of this workflow’s ${horizon.total} pictures are sent here; older ones stay in the history below.`}
          </Text>
        )}
      </div>

      {masking?.picture.media && (
        <MaskEditor
          key={maskingId}
          open
          onOpenChange={(next: boolean) => !next && setMaskingId(0)}
          onCloseAutoFocus={maskFocus.onCloseAutoFocus}
          techCardId={techCardId}
          media={masking.picture.media}
          label={`${runHandle(masking.run.id) || 'run'} · picture ${masking.picture.ordinal ?? '—'}`}
          disabled={disabled}
        />
      )}

      {editingId > 0 && rows.some((o) => (o.picture.id ?? 0) === editingId) && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={rows.find((o) => (o.picture.id ?? 0) === editingId)!.picture}
          slot={null}
          disabled={disabled}
        />
      )}
    </Section>
  );
}
