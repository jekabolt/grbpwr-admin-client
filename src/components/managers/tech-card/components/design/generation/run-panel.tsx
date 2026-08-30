import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { clockStamp } from '../handles';
import { buildHideGuard } from '../band-feed';
import { viewLabel } from '../views';
import { formatMoney } from './money';
import {
  archiveBlockReason,
  fixTargetOf,
  isCancelling,
  isRunLive,
  runOutcomeNote,
  viewsLine,
} from './run-state';
import { Thumb } from './thumb';
import { useGenerationWrites } from './use-generation';

/**
 * THE RUN PANEL — what was asked for and what the model was given, as of the moment the money was
 * spent.
 *
 * EVERY LINE HERE IS A LAUNCH-TIME COPY, and the panel says so at the bottom in words. The card has
 * almost certainly moved on: references get deleted, the description gets rewritten, plates get
 * replaced. The snapshot is what makes «why did this picture come out like that» answerable a month
 * later, and it is answerable precisely because it is NOT a live join into the card.
 *
 * THE SNAPSHOT IS THE SERVER'S. `DesignInputSnapshot` is assembled server-side and is output-only —
 * a client-supplied provenance is a claim, not provenance — so this component reads and never
 * composes. What it must handle is the snapshot's own honesty: a frozen `media_id` whose file has
 * since been deleted comes back with `media` unset and `deleted` true, and that is drawn as
 * «deleted», not as a blank cell.
 *
 * THE MONEY IS TWO DIFFERENT FACTS. `price_estimate` is what was RESERVED against the day before
 * dispatch; `price_actual` is the SUM OF ATTEMPTS, paid failures included. A row that failed twice
 * and succeeded once cost three attempts, and the register says so — which is the whole reason
 * attempts are rows and not a counter.
 */

function PanelRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-2 border-b border-hairline py-1 last:border-b-0'>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='w-28 shrink-0 uppercase tracking-label'
      >
        {k}
      </Text>
      <span className='min-w-0 flex-1 break-words text-micro'>{children}</span>
    </div>
  );
}

const MUTED = (
  <Text size='micro' variant='label' component='span'>
    —
  </Text>
);

export function RunPanel({
  band,
  techCardId,
  run,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  run: common_DesignRun;
  disabled?: boolean;
}) {
  const { cancelRun } = useGenerationWrites(techCardId);
  const guard = useMemo(() => buildHideGuard(band), [band]);

  const inputs = run.inputs;
  const refs = inputs?.refs ?? [];
  const slots = inputs?.slots ?? [];
  const mood = inputs?.mood ?? null;
  const attempts = run.attempts ?? [];
  const live = isRunLive(run);
  const fix = fixTargetOf(run);
  const archiveWhy = archiveBlockReason(run, guard);

  const priceActual = formatMoney(run.priceActual, run.currency);
  const priceEstimate = formatMoney(run.priceEstimate, run.currency);
  const money = priceActual || (priceEstimate ? `${priceEstimate} reserved` : '');

  const colour = run.params?.colour ?? null;
  const threed = run.params?.threed ?? null;

  return (
    <div className='my-1.5 bg-bgZebra px-2.5 py-2'>
      <PanelRow k='asked'>
        {(run.ask ?? '').trim() || (
          <Text size='micro' variant='label' component='span'>
            no ask — the row is captioned by its number
          </Text>
        )}
      </PanelRow>

      <PanelRow k='words'>{(inputs?.garmentNote ?? '').trim() || MUTED}</PanelRow>

      {fix && (
        <PanelRow k='fix target'>
          {viewLabel(fix)} — the inputs are the bench slots, not the references
        </PanelRow>
      )}

      {colour && (
        <PanelRow k='colour recipe'>
          {[
            (colour.code ?? '').trim(),
            (colour.hex ?? '').trim(),
            (colour.words ?? '').trim(),
            (colour.source ?? '').trim(),
          ]
            .filter(Boolean)
            .join(' · ') || MUTED}
        </PanelRow>
      )}

      {threed && (
        <PanelRow k='presentation'>
          {[
            threed.frames ? `${threed.frames} frames` : '',
            (threed.presentation ?? '').trim(),
            (threed.fitOverride ?? '').trim() ? `fit override: ${threed.fitOverride}` : '',
          ]
            .filter(Boolean)
            .join(' · ') || MUTED}
        </PanelRow>
      )}

      {/* THE MOODBOARD IS SHOWN WHEN THE SNAPSHOT CARRIES ONE, and only then. The contract puts a
          mood snapshot inside the run's inputs — «the moodboard as the model read it» — so if the
          server fed it, a panel that answers «what was the model given» has to say so. When the
          server feeds nothing, the field is absent and this block does not exist. */}
      {mood && ((mood.note ?? '').trim() || (mood.callouts ?? []).length > 0) && (
        <>
          <GroupLabel>input — the moodboard, as the model read it</GroupLabel>
          {(mood.note ?? '').trim() && (
            <Text size='micro' component='p' className='break-words py-1'>
              {mood.note}
            </Text>
          )}
          {(mood.callouts ?? []).map((callout, i) => (
            <Text
              key={`${callout.mediaId ?? 0}-${i}`}
              size='micro'
              variant='label'
              component='p'
              className='break-words'
            >
              · {(callout.text ?? '').trim() || 'no text'}
            </Text>
          ))}
        </>
      )}

      {refs.length > 0 && (
        <>
          <GroupLabel>input — references</GroupLabel>
          {refs.map((ref, i) => (
            <div
              key={`${ref.mediaId ?? 0}-${i}`}
              className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'
            >
              <Thumb
                media={ref.media}
                gone={!!ref.deleted}
                alt={(ref.role ?? '').trim()}
                className='h-14 w-11'
              />
              <Text
                size='micro'
                variant='label'
                component='span'
                className='w-16 shrink-0 uppercase tracking-label'
              >
                {viewLabel(ref.role) || 'no role'}
              </Text>
              <span className='min-w-0 flex-1 break-words text-micro'>
                {(ref.note ?? '').trim() || (
                  <Text size='micro' variant='label' component='span'>
                    no note
                  </Text>
                )}
              </span>
              {ref.deleted && <Pill tone='mut'>gone from the card</Pill>}
            </div>
          ))}
        </>
      )}

      {slots.length > 0 && (
        <>
          <GroupLabel>input — the plates in the slots</GroupLabel>
          {slots.map((slot, i) => (
            <div
              key={`${slot.slotId ?? 0}-${slot.viewKey ?? ''}-${i}`}
              className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'
            >
              <Thumb
                media={slot.media}
                gone={!!slot.deleted}
                alt={(slot.viewKey ?? '').trim()}
                className='h-14 w-11'
              />
              <Text
                size='micro'
                variant='label'
                component='span'
                className='w-16 shrink-0 uppercase tracking-label'
              >
                {/* A detail is named by the COPY the snapshot froze, so the line still reads
                    «detail: cuff» after the slot has been renamed or deleted. */}
                {(slot.detailName ?? '').trim() || viewLabel(slot.viewKey)}
              </Text>
              <span className='min-w-0 flex-1 break-words text-micro'>
                {(slot.contentHash ?? '').trim() ? 'frozen by content hash' : 'hash not recorded'}
              </span>
              {slot.deleted && <Pill tone='mut'>gone from the card</Pill>}
            </div>
          ))}
        </>
      )}

      <PanelRow k='views · layout'>{viewsLine(run.params)}</PanelRow>

      <PanelRow k='fit at launch'>
        {(run.fitAtLaunch ?? '').trim() || (
          <Text size='micro' variant='label' component='span'>
            not stated — the mint asks
          </Text>
        )}
      </PanelRow>

      <PanelRow k='profile'>
        {(run.profileName ?? '').trim()
          ? `${run.profileName} @ ${(run.profileVersion ?? '').trim() || '?'}`
          : MUTED}
      </PanelRow>

      <PanelRow k='who · when'>
        {[(run.author ?? '').trim(), clockStamp(run.createdAt), money].filter(Boolean).join(' · ') ||
          MUTED}
      </PanelRow>

      {/* ATTEMPTS ARE NOT IN THE PROTOTYPE AND ARE IN THE CONTRACT, and that asymmetry is the point:
          without per-attempt rows, `price_actual` reads as the price of the LAST attempt and the
          budget bar undercounts every retry. «Failed, and the money was still taken» is exactly the
          sentence a money register exists to be able to say. */}
      {attempts.length > 0 && (
        <>
          <GroupLabel>attempts</GroupLabel>
          {attempts.map((attempt, i) => (
            <div
              key={`${attempt.attemptNo ?? i}`}
              className='flex flex-wrap items-baseline gap-2 border-b border-hairline py-1 last:border-b-0'
            >
              <Text size='micro' component='span' className='uppercase tracking-label'>
                attempt {attempt.attemptNo ?? i + 1}
              </Text>
              <Text size='micro' variant='label' component='span'>
                {[
                  (attempt.provider ?? '').trim(),
                  (attempt.state ?? '').trim(),
                  (attempt.errorCode ?? '').trim(),
                  formatMoney(attempt.price, run.currency),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {/* `unknown` means the money was POSSIBLY taken and the outcome is not knowable from
                  our side. Collapsing it into «failed» would be a lie about the ledger. */}
              {(attempt.state ?? '') === 'unknown' && (
                <Pill tone='attention'>outcome not knowable</Pill>
              )}
            </div>
          ))}
        </>
      )}

      <div className='mt-2 flex flex-wrap items-center gap-2'>
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          launch-time copies — the card may have moved on since
        </Text>
        {archiveWhy && !live && (
          <Text size='nano' component='span' className='text-error'>
            archive is off — {archiveWhy.replace(/_/g, ' ')}
          </Text>
        )}
        {live && (
          <span className='ml-auto'>
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled || isCancelling(run) || cancelRun.isPending}
              onClick={() => cancelRun.mutate(run.id ?? 0)}
              title={
                isCancelling(run)
                  ? 'already asked to stop — an answer that still arrives is recorded and paid for'
                  : 'stop this run'
              }
            >
              {isCancelling(run) ? 'cancelling…' : 'cancel this run'}
            </Button>
          </span>
        )}
        {!live && (
          <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
            {runOutcomeNote(run)}
          </Text>
        )}
      </div>
    </div>
  );
}
