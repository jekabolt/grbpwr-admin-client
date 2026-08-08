import { common_ProductionRun } from 'api/proto-http/admin';
import { daysPast, isRunOpen, isRunReceivable, overdueDays, runDate } from './options';
import { runQty } from './run-rows';

/**
 * WHICH BATCHES WILL NOT MOVE ON THEIR OWN — the triage the runs list opens with.
 *
 * Everything here is derived from the LIST payload alone (status, dates, lines, the server's
 * quantity aggregate). That boundary is deliberate: the richer blockers the run's own conveyor
 * knows about — a material short of its required quantity, a lay the server calls «не годен», a
 * receipt whose posting is stuck — each need a per-run RPC, and asking for them here would fire one
 * query per row to fill a summary block. They stay where they are read once, on the run's page.
 *
 * One row per run: the first matching rule wins, so a late batch that is also stalled is one line
 * of attention rather than two. A run that is finished, cancelled or received is never in here —
 * nothing about it is still actionable, and a warning nobody can clear teaches people to ignore
 * the block.
 */
export type RunAttentionTone = 'error' | 'attention';

export type RunAttention = {
  run: common_ProductionRun;
  /** Worded reason, in the same vocabulary the run's own page uses. */
  reason: string;
  tone: RunAttentionTone;
  /** The one next step. `receive` opens the receiving modal the list already owns. */
  action: 'receive' | 'open';
  /** Sort key: bigger is more urgent. */
  weight: number;
};

/** An open run that has not moved in this many days is worth a look. */
const STALE_DAYS = 21;

export function runAttention(runs: common_ProductionRun[]): RunAttention[] {
  const out: RunAttention[] = [];

  for (const r of runs) {
    const ins = r.run;
    if (!isRunOpen(ins?.status)) continue;

    const q = runQty(r);
    const late = overdueDays(ins?.promisedAt, ins?.status);
    // Age from created_at — the SAME predicate the backend's `stale_days` filter uses ("still open
    // and created more than N days ago"), so this block and the ?stale= deep link can never
    // disagree about which runs have gone quiet.
    const idle = daysPast(r.createdAt) ?? 0;

    if (late > 0) {
      const promised = runDate(ins?.promisedAt);
      out.push({
        run: r,
        reason: `опаздывает ${late} дн — обещано ${promised || '—'}, принято ${
          q.hasReceived ? q.received : 0
        } из ${q.planned}`,
        tone: 'error',
        action: 'open',
        weight: 1000 + late,
      });
      continue;
    }

    // A batch with nothing planned can never receive anything: it is a blocker, not a draft.
    if (q.planned === 0) {
      out.push({
        run: r,
        reason: 'в партии нет плана — принимать нечего',
        tone: 'error',
        action: 'open',
        weight: 900,
      });
      continue;
    }

    if (ins?.status === 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED') {
      out.push({
        run: r,
        reason: `серия открыта — принято ${q.received} из ${q.planned}, ждёт следующей поставки`,
        tone: 'attention',
        action: isRunReceivable(ins?.status) ? 'receive' : 'open',
        weight: 500,
      });
      continue;
    }

    if (!q.hasReceived && idle >= STALE_DAYS) {
      out.push({
        run: r,
        reason: `${idle} дн без движения — ничего не принято`,
        tone: 'attention',
        action: 'open',
        weight: 100 + idle,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight || (a.run.id ?? 0) - (b.run.id ?? 0));
}
