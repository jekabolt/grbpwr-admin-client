import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { colorwayLabel } from '../colorway-picker';
import { Counter, EmptyState } from '../core';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
import { runHandle } from '../handles';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import {
  SAMPLE_WORD,
  SELECT_MARK_NOT_STATED,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
} from '../render/model';
import { useDesignWrites } from '../use-design-band';
import { recolorOutputs, recolorRuns } from './model';

/**
 * ═══ ON MODEL PICTURES · what came back ═══════════════════════════════════════════════════════
 *
 * READ FROM THE OUTPUTS OF THE RUNS, never from the shot draft: the slot above is the INPUT, and
 * a list that held both would have the gate counting an output as an input. Whole-card scope
 * (`recolorOutputs` → `cardOutputRows`): a recolour is one paid call per picture, and a picture
 * that fell off the feed's first page is paid work gone from the screen that shows it.
 *
 * A GRID OF TILES (148px cells, the prototype's `fgrid`), each the studio's own `PictureTile`:
 * zoom in the shared viewer, the `select` mark that ARTIFACTS reads, `edit` to draw over it.
 * Under the picture: the run it came out of, and the colourway it is filed under — the link the
 * screen above calls «written on the picture that comes back» — or `sample`, the name the whole
 * studio gives the colourway-less axis (D1).
 *
 * THE RUN'S OWN WORDS STAY ABOVE THE GRID. A live run and a failed one are printed here, next to
 * the GENERATE that started them, in the server's words (`runOutcomeNote`): the history below is
 * folded by default and a person who just paid looks HERE.
 */
export function OnModelOutputs({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  // Hooks above every early return (React #310 has already taken this tab down once).
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const { data: techCard } = useTechCard(techCardId || undefined);
  const outputs = useMemo(() => recolorOutputs(band), [band]);
  const runs = useMemo(() => recolorRuns(band), [band]);
  const [editingId, setEditingId] = useState(0);
  const [selecting, setSelecting] = useState(0);

  const noteworthy = runs.filter(
    (run) => isRunLive(run) || (run.status ?? '').trim().toLowerCase() === 'failed',
  );
  const carries = outputs.length ? serverStatesSelected(outputs[0].picture) : true;
  const marked = outputs.filter((o) => pictureIsSelected(o.picture)).length;
  const writesOff = !!disabled || !speaks;

  const wayName = (id?: number | null): string => {
    if (!id) return '';
    const ref = (techCard?.colorways ?? []).find((c) => (c.colorwayId ?? 0) === id);
    return ref ? colorwayLabel(ref) : `colourway #${id}`;
  };

  return (
    <Section
      id='design-onmodel-pictures'
      title='on model pictures'
      question='· what came back'
      action={
        <span className='flex items-center gap-1.5'>
          <Counter n={outputs.length} noun='picture' />
          {carries && marked > 0 && (
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {marked} selected
            </Text>
          )}
        </span>
      }
    >
      {noteworthy.map((run) => {
        const note = runOutcomeNote(run);
        const live = isRunLive(run);
        return (
          <CalloutBox key={run.id} tone={live ? 'note' : 'error'}>
            <Text size='micro' component='p' className='normal-case'>
              <b>
                {runHandle(run.id) || 'run'} — {note}.
              </b>{' '}
              {live
                ? 'The picture lands here when the provider answers; the history below reads the same row.'
                : 'The words above are the server’s own, not this screen’s. Nothing was filed for this run.'}
            </Text>
          </CalloutBox>
        );
      })}

      {!carries && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this server does not state the mark at all.</b> `DesignPicture.selected` is on this
            contract, and a server that knows it sends it on every picture — this one sent nothing,
            which means a binary older than the field. The card simply has no record of which
            picture was chosen, and the select doors stay shut.
          </Text>
        </CalloutBox>
      )}

      {outputs.length === 0 ? (
        <EmptyState
          action={
            <Text size='micro' variant='label' component='span' className='normal-case'>
              GENERATE is above
            </Text>
          }
        >
          nothing has come back yet ·
        </EmptyState>
      ) : (
        <Tiles min={148}>
          {outputs.map(({ picture, run }) => {
            const chosen = pictureIsSelected(picture);
            const id = picture.id ?? 0;
            const way = wayName(run.colorwayId);
            const total = (run.pictures ?? []).length;
            const which =
              total > 1
                ? `picture ${picture.ordinal ?? '—'} of ${total}`
                : `picture ${picture.ordinal ?? '—'}`;
            return (
              <div key={id} className='flex min-w-0 flex-col gap-1' data-om-picture={id}>
                <PictureTile
                  url={pictureThumb(picture)}
                  alt={`on-model picture ${picture.ordinal ?? ''}`.trim()}
                  aspect='4/5'
                  fit='contain'
                  selected={chosen}
                  badge={chosen ? 'selected' : undefined}
                  className='w-full bg-bgColor'
                  gallery={
                    picture.media && mediaFullViewerSrc(picture.media)
                      ? mediaFullToViewerItem(picture.media)
                      : undefined
                  }
                  onSelect={
                    carries && !writesOff
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
                            ? `take the chosen mark off on-model picture ${picture.ordinal ?? ''}`.trim()
                            : `mark on-model picture ${picture.ordinal ?? ''} as chosen`.trim(),
                          title: chosen
                            ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                            : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup; more than one may carry the mark',
                        }
                      : undefined
                  }
                  selectLabel={chosen ? 'un-select' : 'select'}
                  onEdit={
                    !writesOff && pictureThumb(picture)
                      ? {
                          onClick: () => setEditingId(id),
                          ariaLabel: `edit on-model picture ${picture.ordinal ?? ''} — draw over it`.trim(),
                          title: 'draw over this picture — saving makes a NEW picture; the original is never overwritten',
                        }
                      : undefined
                  }
                />
                <Text size='micro' className='truncate font-bold uppercase'>
                  {runHandle(run.id) || 'run —'} · {which}
                </Text>
                <Text size='micro' variant='label' className='truncate'>
                  {way ? way.toLowerCase() : SAMPLE_WORD} · on model
                </Text>
                {/* under the frame only the refusal stays visible: a hover-only corner cannot
                    carry a reason nobody sees */}
                {!carries ? (
                  <InertDoor label='select' reason={SELECT_MARK_NOT_STATED} />
                ) : writesOff ? (
                  <InertDoor
                    label={chosen ? 'un-select' : 'select'}
                    reason={
                      disabled
                        ? 'this card is read-only for you — the mark is an edit of the card'
                        : 'this server does not answer the design routes'
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </Tiles>
      )}

      {editingId > 0 && outputs.some((o) => (o.picture.id ?? 0) === editingId) && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={outputs.find((o) => (o.picture.id ?? 0) === editingId)!.picture}
          slot={null}
          disabled={disabled}
        />
      )}
    </Section>
  );
}
