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
  const pct = (n: number) => (planned > 0 ? Math.min(100, (n / planned) * 100) : 0);
  const good = pct(received);
  const bad = Math.min(100 - good, pct(defect));
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
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const ins = r.run;
          const q = runQty(r);
          const late = overdueDays(ins?.promisedAt, ins?.status);
          const variance = r.actuals?.unitCostVariance?.value;
          const varianceNum = Number(variance);
          const hasVariance = !!variance && Number.isFinite(varianceNum) && varianceNum !== 0;
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
                  <span className='flex flex-col items-end'>
                    <span>
                      {decimalToInput(r.plannedUnitCost) || '—'}
                      {' / '}
                      {decimalToInput(r.actuals?.actualUnitCost) || '—'}
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
