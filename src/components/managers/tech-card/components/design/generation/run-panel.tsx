import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { clockStamp } from '../handles';
import { RecallDoors } from '../history-recall';
import { viewLabel } from '../views';
import { formatMoney } from './money';
import { isCancelling, isRunLive, viewsLine } from './run-state';
import { Thumb } from './thumb';
import { useGenerationWrites } from './use-generation';

/**
 * THE RUN PANEL — the run's detail at the owner's density (T-9: «сделай раскрытую деталку рана еще
 * компактнее»). Denser is a matter of CHROME, not of facts: the label column narrowed, the row
 * padding halved, `views · layout` and `fit at launch` folded into one line because they are one
 * sentence about one launch, and the attempts lost their group bar and their per-row rules. Nothing
 * that was stated here stopped being stated.
 *
 * EVERYTHING DRAWN HERE IS A LAUNCH-TIME COPY. The card has almost certainly moved on since —
 * references get deleted, plates get replaced — and the snapshot is what makes «why did this
 * picture come out like that» answerable a month later, precisely because it is NOT a live join
 * into the card.
 *
 * IT NOW CARRIES THE SENT TEXT, AND THAT IS WHY THE ASK COULD GO. The `ask` field was removed from
 * the flat form and from the history's own caption (T-3), so the row would have lost the only words
 * it printed. `run.prompt` is a better answer than the one it replaces: the ask was what somebody
 * typed, this is what the worker STORED AT DISPATCH, before the first paid attempt. It is folded
 * away by default because it is a paragraph, not a field.
 *
 * ⚠ THE STORED TEXT IS THE BASE INSTRUCTION, AND THE WORD IS THE CONTRACT'S. On the single-call
 * flat route it is what the provider received byte for byte; on `per_view` each paid call also gets
 * its own view line appended, and on 3D the text is cut to the provider's texture ceiling. The row
 * says «base text» for that reason and its title spells the two deviations out.
 *
 * EMPTY MEANS TWO DIFFERENT THINGS AND THEY ARE NOT COLLAPSED: a run nobody has picked up yet has
 * not composed one, and every row older than the column (migration 0352) has none and never will.
 * A screen that says «not dispatched yet» over an old finished run is lying about history.
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

function PanelRow({
  k,
  title,
  children,
}: {
  k: string;
  /** The clause a compacted label no longer has room to say out loud. */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex gap-2 border-b border-hairline py-0.5 last:border-b-0' title={title}>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='w-20 shrink-0 uppercase tracking-label'
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
  band,
  run,
  disabled,
}: {
  techCardId: number;
  /**
   * Полоса — РАДИ ДВЕРЕЙ РЕКОЛА И БОЛЬШЕ НИ РАДИ ЧЕГО. Всё остальное на этой панели — снимок
   * запуска, и join в живую карточку был бы ровно тем, чем снимок быть отказывается. Реколу же
   * полоса нужна, чтобы посчитать вопрос: какие роли стоят на карточке сейчас и какие слоты
   * верстака примут плиты этого прогона.
   */
  band: GetDesignBandResponse;
  run: common_DesignRun;
  disabled?: boolean;
}) {
  const { cancelRun } = useGenerationWrites(techCardId);
  const [textOpen, setTextOpen] = useState(false);

  const inputs = run.inputs;
  const refs = inputs?.refs ?? [];
  const attempts = run.attempts ?? [];
  const live = isRunLive(run);

  const priceActual = formatMoney(run.priceActual, run.currency);
  const priceEstimate = formatMoney(run.priceEstimate, run.currency);
  const money = priceActual || (priceEstimate ? `${priceEstimate} reserved` : '');

  const fit = (run.fitAtLaunch ?? '').trim();
  const sent = (run.prompt ?? '').trim();


  return (
    <div className='mt-1 bg-bgZebra px-2 py-1.5'>
      {/* THE INPUT REFERENCES, AS THUMBNAILS IN A ROW (S-9). Role and note ride in the title —
          the full, worded prompt is what `recall` below is for. */}
      {refs.length > 0 && (
        <div className='flex flex-wrap items-center gap-1 border-b border-hairline pb-1'>
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
                className='h-11 w-9'
              />
            </span>
          ))}
        </div>
      )}

      {/* ONE LINE FOR THE LAUNCH: what was asked for and the fit it was asked under. Two rows for
          one sentence was the loosest thing on this panel. */}
      <PanelRow k='asked' title='the views and layout this run requested, and the fit the card carried at launch'>
        {[viewsLine(run.params), fit ? `fit ${fit}` : 'fit not stated — the mint asks']
          .filter(Boolean)
          .join(' · ')}
      </PanelRow>

      <PanelRow k='who · when'>
        {[(run.author ?? '').trim(), clockStamp(run.createdAt), money].filter(Boolean).join(' · ') ||
          MUTED}
      </PanelRow>

      <PanelRow
        k='base text'
        title='the base instruction the worker composed and stored at dispatch, before the first paid attempt. A per-view run appends its own view line to each call and a 3D run is cut to the texture ceiling, so on those two routes this is the base and not a transcript.'
      >
        {sent ? (
          <>
            <button
              type='button'
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
              className='cursor-pointer uppercase tracking-label text-labelColor underline hover:text-textColor'
            >
              {textOpen ? '▾ hide' : '▸ show'} · {sent.length} characters
            </button>
            {textOpen && (
              <Text size='micro' component='p' className='mt-1 whitespace-pre-wrap break-words'>
                {sent}
              </Text>
            )}
          </>
        ) : live ? (
          <Text size='micro' variant='label' component='span'>
            not composed yet — the worker writes it when it picks the run up
          </Text>
        ) : (
          <Text size='micro' variant='label' component='span'>
            not kept for this run
          </Text>
        )}
      </PanelRow>

      {/* ATTEMPTS ARE THE HONEST HALF OF THE MONEY: without per-attempt rows, `price_actual` reads
          as the price of the LAST attempt and the budget bar undercounts every retry. «Failed, and
          the money was still taken» is exactly the sentence a money register exists to say. They
          sit inside one row now instead of under a group bar of their own — same lines, one less
          rule and one less heading. */}
      {attempts.length > 0 && (
        <PanelRow k={`attempts · ${attempts.length}`}>
          {attempts.map((attempt, i) => (
            <span
              key={`${attempt.attemptNo ?? i}`}
              className='flex flex-wrap items-baseline gap-1.5'
            >
              <Text size='micro' component='span' className='uppercase tracking-label'>
                {attempt.attemptNo ?? i + 1}
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
            </span>
          ))}
        </PanelRow>
      )}

      {/* ПОДВАЛ ПАНЕЛИ. `empty:mt-0` несущее: обе его половины условны, и на строке без дверей и без
          отмены пустой блок иначе оставлял бы отступ под собой. */}
      <div className='mt-1 flex flex-wrap items-center gap-2 empty:mt-0'>
        {/* ТА ЖЕ ПАРА ДВЕРЕЙ, ЧТО НА СТРОКЕ ИСТОРИИ, И ТОТ ЖЕ ОРГАН (V-12/V-13) — не второй глагол
            во второй позе, а один механизм в двух местах. Держать здесь свою копию условий и свой
            вопрос значило бы завести второе описание одного разрушения, и короче оказалось бы то,
            которое реже читают. Кнопки RERUN рядом по-прежнему нет: прогон запускается только из
            GENERATION — FLAT → GENERATE. */}
        <RecallDoors techCardId={techCardId} band={band} run={run} disabled={disabled} />
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
    </div>
  );
}
