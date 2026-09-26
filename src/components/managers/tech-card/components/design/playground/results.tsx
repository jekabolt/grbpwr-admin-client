import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useRef, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import {
  cardOutputRows,
  outputsHorizon,
  runRepresentation,
  type Representation,
} from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { colorwayLabel } from '../colorway-picker';
import { Counter, EmptyState } from '../core';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
import { clockStamp, runHandle } from '../handles';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { pictureIsSelected, pictureThumb, serverStatesSelected } from '../render/model';
import { isPictureHidden } from '../visibility';
import { useDesignWrites } from '../use-design-band';
import {
  PLAYGROUND_ROOM,
  inPlaygroundRoom,
  retiredPresetWord,
  runWorkflowWord,
  workflowByKey,
  workflowOfRun,
} from './registry';
import type { ResultsDef, WorkflowDef } from './registry/types';

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
 * ⚠ THE WINDOW IS 60 NEWEST PER COLOURWAY, and every playground run files under «no colourway», so
 * the room shares one window. When the server says it left pictures behind, the caption says so
 * (`outputsHorizon`) rather than letting an older result vanish silently.
 *
 * Corners: zoom (the gallery) and `edit ▸` (draw over it, saving a NEW picture) on every picture;
 * the `select` mark where the workflow says so (`ResultsDef.selectable` — recolours, as ON MODEL
 * had it; ARTIFACTS offers the chosen ones for markup). A cut-out (`ResultsDef.cutout`) stands on a
 * neutral ground with the word «no background» under it: its subject is on transparency, over white
 * it would read as a picture with a white background, and the ground alone does not say «alpha».
 *
 * ⚠ THE ROW ASKS THE WORKFLOW THAT MADE IT, not the one open: on the grid the rows of three
 * workflows stand together, and each keeps its own corners.
 */

type Row = { picture: common_DesignPicture; run: common_DesignRun };

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
  const [selecting, setSelecting] = useState(0);

  /* THE CARD CHANGED — the open editor is addressed by a picture id of the OTHER card (invariant
     12). Closed in the body of the render, never in an effect. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (editingId) setEditingId(0);
  }

  const results = def?.run?.results;
  const reps = results?.reps ?? PLAYGROUND_ROOM;
  const match = results?.match ?? inPlaygroundRoom;

  const rows = useMemo(() => {
    const all = cardRows(band, reps) ?? pageRows(band, reps);
    return all.filter((row) => match(row.run));
  }, [band, reps, match]);

  /* The runs of this workflow still out, and the newest one if it failed: the answer to a press
     stands above what came back. Older failures live in the history, not here. */
  const pinned = useMemo(() => {
    const mine = (band.runs ?? []).filter((run) => inPlaygroundRoom(run) && match(run));
    const live = mine.filter((run) => isRunLive(run));
    const newest = mine[0];
    const failed =
      newest && !isRunLive(newest) && (newest.status ?? '').trim().toLowerCase() === 'failed'
        ? [newest]
        : [];
    return [...live, ...failed];
  }, [band, match]);

  /* The colourway-0 window is the room's, not Change a Color's: its recolours may be filed under a
     colourway and its rows are not that window — the sentence would count another list (m-5). */
  const horizon = useMemo(
    () => (def?.key === 'change_color' ? null : outputsHorizon(band, 0)),
    [band, def?.key],
  );
  const carries = rows.length ? serverStatesSelected(rows[0].picture) : true;
  const writesOff = !!disabled || !speaks;

  const wayName = (id?: number | null): string => {
    if (!id) return '';
    const ref = (techCard?.colorways ?? []).find((c) => (c.colorwayId ?? 0) === id);
    return ref ? colorwayLabel(ref).toLowerCase() : `colourway #${id}`;
  };

  return (
    <Section
      id='design-playground-results'
      title='what came back'
      question={def ? `· ${def.title.toLowerCase()}` : '· every playground picture of this card'}
      action={<Counter n={rows.length} noun='picture' />}
    >
      <div className='flex flex-col gap-4'>
        {pinned.map((run) => {
          const live = isRunLive(run);
          return (
            <CalloutBox key={run.id} tone={live ? 'note' : 'error'}>
              <Text size='micro' component='p' className='normal-case' data-pg-pinned={run.id}>
                <b>
                  {runHandle(run.id) || 'run'} — {runOutcomeNote(run)}.
                </b>{' '}
                {live
                  ? 'The picture lands here when the provider answers.'
                  : 'These are the server’s words. Nothing was filed for this run.'}
              </Text>
            </CalloutBox>
          );
        })}

        {rows.length === 0 ? (
          <EmptyState>
            {def ? 'nothing has come back from this workflow yet' : 'nothing has come back yet'}
          </EmptyState>
        ) : (
          <Tiles min={148} className='gap-3'>
            {rows.map(({ picture, run }) => {
              const id = picture.id ?? 0;
              const own = resultsOfRun(run);
              const cut = !!own?.cutout;
              const selectable = !!own?.selectable;
              const chosen = selectable && pictureIsSelected(picture);
              const words = [
                // An open workflow names only what differs from it: a retired preset's run.
                def ? retiredPresetWord(run) : runWorkflowWord(run),
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
                    onEdit={
                      !writesOff && pictureThumb(picture)
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
          <Text size='micro' variant='label' component='p' className='normal-case'>
            Only the newest {horizon.carried} of this card’s {horizon.total} pictures without a
            colourway are sent here; older ones stay in the history below.
          </Text>
        )}
      </div>

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
