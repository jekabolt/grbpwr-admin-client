import type { common_DesignRun } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { clockStamp } from '../handles';
import { recallDesignRun, useRecalledRun } from '../history-recall';
import { viewLabel } from '../views';
import { formatMoney } from './money';
import { isCancelling, isRunLive, viewsLine } from './run-state';
import { Thumb } from './thumb';
import { useGenerationWrites } from './use-generation';

/**
 * THE RUN PANEL — the run's detail, at the owner's density (S-9): the input reference thumbnails
 * in one row, `views · layout`, `fit at launch`, `who · when`, the attempts, and the door that
 * puts the references back into the input. Nothing else.
 *
 * EVERYTHING DRAWN HERE IS A LAUNCH-TIME COPY. The card has almost certainly moved on since —
 * references get deleted, plates get replaced — and the snapshot is what makes «why did this
 * picture come out like that» answerable a month later, precisely because it is NOT a live join
 * into the card. The full prompt — the words, the roles, the notes, the markup — is one gesture
 * away: `recall` shows it in INPUT — REFERENCES, where a rerun can be asked for from it. This
 * panel deliberately repeats none of it.
 *
 * THE SNAPSHOT IS THE SERVER'S. `DesignInputSnapshot` is output-only — a client-supplied
 * provenance is a claim, not provenance — so this component reads and never composes. A frozen
 * `media_id` whose file has since been deleted comes back with `media` unset and `deleted` true,
 * and is drawn as «deleted», not as a blank cell.
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
  techCardId,
  run,
  disabled,
}: {
  techCardId: number;
  run: common_DesignRun;
  disabled?: boolean;
}) {
  const { cancelRun } = useGenerationWrites(techCardId);
  const recalled = useRecalledRun(techCardId);

  const inputs = run.inputs;
  const refs = inputs?.refs ?? [];
  const attempts = run.attempts ?? [];
  const live = isRunLive(run);

  const priceActual = formatMoney(run.priceActual, run.currency);
  const priceEstimate = formatMoney(run.priceEstimate, run.currency);
  const money = priceActual || (priceEstimate ? `${priceEstimate} reserved` : '');

  const runId = run.id ?? 0;
  /**
   * RECALL IS OFFERED ONLY WHERE THERE IS A SNAPSHOT TO SHOW — same rule as the row's own chip. A
   * row served without `inputs` would select into an empty panel, and a gesture whose whole
   * promise is «put what was fed back in front of you» must not be offered when nothing was
   * frozen.
   */
  const recallable = !!inputs && runId > 0;
  const isRecalled = recallable && (recalled?.id ?? 0) === runId;

  return (
    <div className='my-1.5 bg-bgZebra px-2.5 py-2'>
      {/* THE INPUT REFERENCES, AS THUMBNAILS IN A ROW (S-9). Role and note ride in the title —
          the full, worded prompt is what `recall` below is for. */}
      {refs.length > 0 && (
        <div className='flex flex-wrap items-center gap-1 border-b border-hairline pb-1.5'>
          {refs.map((ref, i) => (
            <span
              key={`${ref.mediaId ?? 0}-${i}`}
              title={
                [viewLabel(ref.role), (ref.note ?? '').trim()].filter(Boolean).join(' · ') ||
                undefined
              }
            >
              <Thumb
                media={ref.media}
                gone={!!ref.deleted}
                alt={viewLabel(ref.role) || 'reference'}
                className='h-14 w-11'
              />
            </span>
          ))}
        </div>
      )}

      <PanelRow k='views · layout'>{viewsLine(run.params)}</PanelRow>

      <PanelRow k='fit at launch'>
        {(run.fitAtLaunch ?? '').trim() || (
          <Text size='micro' variant='label' component='span'>
            not stated — the mint asks
          </Text>
        )}
      </PanelRow>

      <PanelRow k='who · when'>
        {[(run.author ?? '').trim(), clockStamp(run.createdAt), money].filter(Boolean).join(' · ') ||
          MUTED}
      </PanelRow>

      {/* ATTEMPTS ARE THE HONEST HALF OF THE MONEY: without per-attempt rows, `price_actual` reads
          as the price of the LAST attempt and the budget bar undercounts every retry. «Failed, and
          the money was still taken» is exactly the sentence a money register exists to say. */}
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

      {(recallable || live) && (
        <div className='mt-1.5 flex flex-wrap items-center gap-2'>
          {/* THE DOOR THE OWNER ASKED FOR (S-9): put this run's references back into the input,
              «so a reproduce can be made — maybe with a change». It is the SAME `recall` selection
              as the chip on the row — one verb, two postures — and it reads the card, never writes
              it: the frozen prompt appears in INPUT — REFERENCES with the rerun door beside it. */}
          {recallable && (
            <Chip
              selected={isRecalled}
              pressed={isRecalled}
              onClick={() => recallDesignRun(techCardId, isRecalled ? null : run)}
              title={
                isRecalled
                  ? 'stop showing this run’s prompt'
                  : 'show this run’s frozen prompt — pictures, words and markup — in INPUT — REFERENCES, ready for a rerun'
              }
            >
              {isRecalled ? 'recalled — in the input' : 'recall — references back to input ▸'}
            </Chip>
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
        </div>
      )}
    </div>
  );
}
