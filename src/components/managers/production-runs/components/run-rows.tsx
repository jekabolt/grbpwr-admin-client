import { common_ProductionRun, common_ProductionRunStatus } from 'api/proto-http/admin';
import { Link } from 'react-router-dom';
import { DataTable } from 'ui/components/data-table';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { overdueDays, runDate, runDetailPath, runStatusLabel, runStatusTone } from './options';

// A run as ONE table row, replacing the per-run card that used to render a line for every
// (product × size) pair. That card was the reason a list of eight batches did not fit on a screen:
// a style with three colours and four sizes printed twelve lines per run, and the run's own totals
// — the only figures a list is asked for — appeared nowhere.
//
// Both readers of a run list use this: the /production-runs manager and the tech card's PRODUCE
// tab. One rendering, so the two screens cannot drift apart on what a batch looks like.

/**
 * A run's quantities. Read from the server's own aggregate (`actuals`) first — its quantity totals
 * survive the costing strip, so they are available to every account that can see the run — and
 * summed from the lines only when a payload carries no actuals at all.
 */
export function runQty(r: common_ProductionRun) {
  const a = r.actuals;
  const lines = r.run?.lines ?? [];
  const sum = (pick: (l: (typeof lines)[number]) => number | undefined) =>
    lines.reduce((s, l) => s + (pick(l) ?? 0), 0);
  return {
    planned: a?.plannedQtyTotal ?? sum((l) => l.plannedQty),
    received: a?.receivedQtyTotal ?? sum((l) => l.receivedQty),
    defect: a?.defectQtyTotal ?? sum((l) => l.defectQty),
    // "Has anything come back yet" — a receipt of pure defect still counts as movement, and a run
    // that has received nothing must read «—», never a confident 0.
    hasReceived:
      (a?.receivedQtyTotal ?? 0) > 0 ||
      (a?.defectQtyTotal ?? 0) > 0 ||
      lines.some((l) => l.receivedQty != null),
  };
}

/**
 * plan → received as one track: ink for the good units, red for the defective ones, and the words
 * beside it. The colour never travels alone — the count repeats in text, so the row survives a
 * monochrome print and a colour-blind reading.
 */
export function QtyBar({
  planned,
  received,
  defect,
  hasReceived,
}: {
  planned: number;
  received: number;
  defect: number;
  hasReceived: boolean;
}) {
  // Scaled to whatever is LARGER, the plan or what actually came off the line. Scaling to the plan
  // alone clipped the defect segment to nothing on a run that met its plan and produced scrap on
  // top of it (plan 100, good 100, defect 10 drew no red at all) — the one case where the red is
  // the whole point. When the line overran the plan, a 1px ink tick marks where the plan sat.
  const scale = Math.max(planned, received + defect, 1);
  const good = Math.min(100, (received / scale) * 100);
  const bad = Math.min(100 - good, (defect / scale) * 100);
  const planMark = planned > 0 && received + defect > planned ? (planned / scale) * 100 : null;
  return (
    <span className='flex items-center gap-2'>
      <span className='relative block h-3 w-[86px] shrink-0 bg-trackBg' aria-hidden>
        <span className='absolute top-0 left-0 h-3 bg-textColor' style={{ width: `${good}%` }} />
        {bad > 0 && (
          <span
            className='absolute top-0 h-3 bg-error'
            style={{ left: `${good}%`, width: `${bad}%` }}
          />
        )}
        {planMark != null && (
          <span
            className='absolute top-0 h-3 border-l border-textColor'
            style={{ left: `${planMark}%` }}
          />
        )}
      </span>
      <span className='shrink-0 tabular-nums'>
        {hasReceived ? received : '—'} / {planned}
        {defect > 0 ? ` · брак ${defect}` : ''}
      </span>
    </span>
  );
}

/** The run's lifecycle status, in the one tone table every screen shares. */
export function RunStatusBadge({ status }: { status?: common_ProductionRunStatus | string }) {
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 text-textBaseSize uppercase ${runStatusTone(status)}`}
    >
      {runStatusLabel(status)}
    </span>
  );
}

export function RunTable({
  runs,
  showTechCard = false,
  canReadCosting = false,
  renderAction,
}: {
  runs: common_ProductionRun[];
  /** The manager lists every style's batches and needs the TC column; a tech card does not. */
  showTechCard?: boolean;
  canReadCosting?: boolean;
  /** Row action. Defaults to a plain link into the run, which is where every editor lives. */
  renderAction?: (run: common_ProductionRun) => React.ReactNode;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>партия</th>
          {showTechCard && <th>стиль</th>}
          <th>статус</th>
          <th>план → принято</th>
          <th>обещано</th>
          {canReadCosting && <th>unit план / факт</th>}
          <th>
            <span className='sr-only'>действие</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const ins = r.run;
          const q = runQty(r);
          const late = overdueDays(ins?.promisedAt, ins?.status);
          const planCur = r.plannedCurrency || '';
          const factCur = r.actuals?.baseCurrency || '';
          // The server emits planned_total_base ONLY when the frozen plan is already in the base
          // currency, and has_base false means some article could not be folded. Either way plan and
          // fact are two different monies, and a Δ between them would be arithmetic on mixed
          // currencies — the exact figure this table must not invent. Same rule the tech card's
          // roll-up uses to decide what it may average.
          const comparable = !!r.actuals?.plannedTotalBase?.value && r.actuals?.hasBase === true;
          const variance = r.actuals?.unitCostVariance?.value;
          const varianceNum = Number(variance);
          const hasVariance =
            comparable && !!variance && Number.isFinite(varianceNum) && varianceNum !== 0;
          return (
            <tr key={r.id}>
              <td>
                <Link to={runDetailPath(r.id ?? 0)} className='underline'>
                  PR-{r.id}
                </Link>
              </td>
              {showTechCard && (
                <td>
                  TC-{ins?.techCardId}
                  {ins?.releaseId ? ` · rel ${ins.releaseId}` : ''}
                </td>
              )}
              <td>
                <span className='flex flex-wrap items-center gap-1'>
                  <RunStatusBadge status={ins?.status} />
                  {late > 0 && (
                    <span className='inline-block border border-error px-1.5 py-0.5 text-textBaseSize uppercase text-error'>
                      опаздывает {late} дн
                    </span>
                  )}
                </span>
              </td>
              <td>
                <QtyBar {...q} />
              </td>
              <td className='tabular-nums'>{runDate(ins?.promisedAt) || '—'}</td>
              {canReadCosting && (
                <td>
                  {/* Each figure carries its OWN currency: a run's frozen plan may be quoted in the
                      factory's money and its actual folded into the company base, and «10 / 12» with
                      no units is a lie whenever those differ. */}
                  <span className='flex flex-col items-end'>
                    <span>
                      план {decimalToInput(r.plannedUnitCost) || '—'} {planCur}
                    </span>
                    <span>
                      факт {decimalToInput(r.actuals?.actualUnitCost) || '—'}{' '}
                      {r.actuals?.actualUnitCost?.value ? factCur : ''}
                    </span>
                    {hasVariance && (
                      // Over the frozen plan is money lost; under it is money saved.
                      <Text
                        size='micro'
                        component='span'
                        className={varianceNum > 0 ? 'text-error' : 'text-success'}
                      >
                        Δ {varianceNum > 0 ? '+' : ''}
                        {decimalToInput(r.actuals?.unitCostVariance)}
                      </Text>
                    )}
                  </span>
                </td>
              )}
              <td>
                {renderAction ? (
                  renderAction(r)
                ) : (
                  <Link to={runDetailPath(r.id ?? 0)} className='uppercase underline'>
                    <Text size='micro' component='span' tracking='label'>
                      открыть
                    </Text>
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
