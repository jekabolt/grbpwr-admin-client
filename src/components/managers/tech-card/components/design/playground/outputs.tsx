import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import { serverSpeaksDesign } from '../capability';
import { Counter, EmptyState } from '../core';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
import { clockStamp, runHandle } from '../handles';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { pictureThumb } from '../render/model';
import { useDesignWrites } from '../use-design-band';
import { isCutoutPicture, playgroundOutputs, playgroundRuns, presetsOf } from './model';

/**
 * ═══ WHAT CAME BACK — the playground's own results, and they are NOT artifacts ════════════════
 *
 * READ FROM THE OUTPUTS OF THE RUNS, never from the table above: the table is the INPUT, and a list
 * holding both would have the gate counting an output as an input. Whole-card scope
 * (`playgroundOutputs` → `cardOutputRows`): every playground run is one paid call, and a picture
 * that fell off the feed's first page is paid work gone from the screen that shows it.
 *
 * ⚠ THESE PICTURES ARE NOT PLATES AND NOT ARTIFACTS, by decision (§8 q.6): there is no `select`
 * corner and no bench slot to put one into. What a person does with a result is look at it, draw
 * over it (`edit ▸`), or take it off the screen (`hide`). A cut-out is on its way to the picture
 * editor as a floating paste — that door belongs to the next phase and is not drawn as a dead one.
 *
 * ⚠ A CUT-OUT IS SHOWN ON A NEUTRAL GROUND, and that is data, not decoration. Its subject stands on
 * TRANSPARENCY; over the white of a block it reads as a picture with a white background, which is
 * exactly the thing the run was bought to remove. `ground='neutral'` puts the tone under the frame
 * AND behind the transparent pixels — the primitive's own prop, added by the alpha wave.
 */
export function PlaygroundOutputs({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  // Hooks above every early return (React #310 has taken this tab down once already).
  const speaks = serverSpeaksDesign();
  const { hidePicture } = useDesignWrites(techCardId);
  const outputs = useMemo(() => playgroundOutputs(band), [band]);
  const runs = useMemo(() => playgroundRuns(band), [band]);
  const presets = useMemo(() => presetsOf(band), [band]);
  const [editingId, setEditingId] = useState(0);
  const [hiding, setHiding] = useState(0);

  const noteworthy = runs.filter(
    (run) => isRunLive(run) || (run.status ?? '').trim().toLowerCase() === 'failed',
  );
  const writesOff = !!disabled || !speaks;

  /**
   * The preset a finished run was bought under, in the words the chips use.
   *
   * ⚠ AN OFF-PAGE ROW HAS NO `params` AT ALL, AND «free» WOULD BE AN INVENTION. `cardOutputRows`
   * hands back a four-field STAMP for a run that fell off the loaded feed page — id, kind,
   * revision, colourway — and every other field of it reads `undefined`. A neighbouring section
   * once read `params.pattern.repeat_mm` off such a stamp and wrote the resulting **0** onto the
   * card's fabric. So the preset is printed only where it is actually stated; `cutout` needs no
   * params (the KIND is the answer), and `freeform` without them says nothing rather than
   * something plausible.
   */
  const presetWord = (kind: string, key: string, stated: boolean): string => {
    if ((kind ?? '').trim().toLowerCase() === 'cutout') {
      return presets.find((p) => p.key === 'cutout')?.label ?? 'cut out the background';
    }
    if (!stated || !key) return '';
    return presets.find((p) => p.key === key)?.label ?? key.replace(/_/g, ' ');
  };

  return (
    <Section
      id='design-playground-pictures'
      title='what came back'
      action={<Counter n={outputs.length} noun='picture' />}
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
            const id = picture.id ?? 0;
            const cut = isCutoutPicture(run);
            const stamp = clockStamp(run.completedAt ?? run.createdAt);
            const word = presetWord(
              run.kind ?? '',
              run.params?.freeform?.preset ?? '',
              run.params !== undefined,
            );
            return (
              <div key={id} className='flex min-w-0 flex-col gap-1' data-pg-output={id}>
                <PictureTile
                  url={pictureThumb(picture)}
                  alt={`playground picture ${picture.ordinal ?? ''}`.trim()}
                  aspect='4/5'
                  fit='contain'
                  ground={cut ? 'neutral' : undefined}
                  className='w-full bg-bgColor'
                  gallery={
                    picture.media && mediaFullViewerSrc(picture.media)
                      ? mediaFullToViewerItem(picture.media)
                      : undefined
                  }
                  onRemove={
                    writesOff
                      ? undefined
                      : {
                          onClick: () => {
                            setHiding(id);
                            hidePicture.mutate(
                              { pictureId: id, hidden: true },
                              { onSettled: () => setHiding(0) },
                            );
                          },
                          pending: hiding === id,
                          ariaLabel: `hide playground picture ${picture.ordinal ?? ''}`.trim(),
                          title:
                            'take this picture off the screen — it is not deleted, and the run keeps it',
                        }
                  }
                  onEdit={
                    !writesOff && pictureThumb(picture)
                      ? {
                          onClick: () => setEditingId(id),
                          ariaLabel:
                            `edit playground picture ${picture.ordinal ?? ''} — draw over it`.trim(),
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
                  {[word, stamp].filter(Boolean).join(' · ') || 'playground'}
                </Text>
                {/* ОДНО СЛОВО, А НЕ ТРИ СТРОКИ: факт («у этой картинки нет фона») читается пилюлей
                    так же полно, как абзацем, а сетка плиток не разъезжается по высоте от подписи,
                    которая длиннее самой плитки. Объяснение грунта живёт в шапке файла — на экране
                    его говорит сам грунт. */}
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
