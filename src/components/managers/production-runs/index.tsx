import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRun } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Row } from 'ui/components/row';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { CreateRunModal } from './components/create-run-modal';
import { isRunOpen, isRunReceivable, runDetailPath } from './components/options';
import { ReceiveModal } from './components/receive-modal';
import { DEFAULT_STALE_DAYS, runAttention } from './components/run-attention';
import { RunTable, runQty } from './components/run-rows';
import { useProductionRuns } from './components/useProductionRuns';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

const statusFilterOptions = [
  { value: '', label: 'all' },
  { value: 'PRODUCTION_RUN_STATUS_PLANNED', label: 'planned' },
  { value: 'PRODUCTION_RUN_STATUS_IN_PROGRESS', label: 'in progress' },
  { value: 'PRODUCTION_RUN_STATUS_RECEIVED', label: 'received' },
  { value: 'PRODUCTION_RUN_STATUS_CLOSED', label: 'closed' },
  { value: 'PRODUCTION_RUN_STATUS_CANCELLED', label: 'cancelled' },
];

// How many attention rows are worth showing before the block becomes the page. The rest are
// counted, never silently dropped.
const ATTENTION_LIMIT = 6;

export function ProductionRuns() {
  const { canWrite, canReadCosting } = usePermissions();
  const canEdit = canWrite(SECTION.production);
  // Filters live in the URL (R-1) so a filtered run list is shareable and survives reload.
  // Deep link from the tech card spine ([plan run]): ?techCardId=118 filters the list and seeds the
  // create modal; ?new=1 auto-opens it (W3.6).
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const techCardId = searchParams.get('techCardId') ?? '';
  const patchFilters = (next: Record<string, string>) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
        return p;
      },
      { replace: true },
    );
  // Creating a run is «карточка → релиз → колорвеи → количества → покрытие» with the readiness gate
  // recomputing on every change, so it owns its own modal (Ф6.4) and stays on the list: it is the
  // one action that starts from nothing.
  //
  // EDITING and DELETING a run are NOT here any more. Both live on the run's own page, beside the
  // thing they change; a list row now carries exactly one control — the next step for that batch —
  // because three buttons per row is twenty-four buttons competing with the data they sit in.
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<common_ProductionRun | undefined>();

  // Auto-open the create modal once when arriving via ?new=1 (guarded by write permission),
  // then strip the param — otherwise refresh/back re-opens the modal uninvited.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (canEdit) setCreateOpen(true);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('new');
          return p;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?stale=<days> (attention-strip deep link): ask the backend for only the non-terminal runs
  // sitting at least that long — the same server-side predicate the strip counts, so the link
  // shows exactly those runs (no client rescan of the full list).
  const staleDays = Number(searchParams.get('stale')) || 0;
  // ?overdue=1 — only the runs that have missed their promised date. Filtered SERVER-side
  // (overdue_only) rather than by scanning the page here: the client only ever holds one page, so a
  // local filter would answer "late among the first 100" and quietly under-report. The badge on each
  // row is computed from the same predicate, so the toggle and the badges always agree.
  const overdueOnly = searchParams.get('overdue') === '1';
  const { data, isLoading, isError } = useProductionRuns(
    Number(techCardId) || 0,
    status,
    staleDays,
    overdueOnly,
  );
  const runs = useMemo(() => data?.runs ?? [], [data?.runs]);
  const filtered = !!status || !!techCardId || staleDays > 0 || overdueOnly;
  // The list holds ONE page (limit 200). Say so when it is full rather than presenting a page as
  // the whole shop — every figure below is computed over what was actually loaded.
  const pageFull = runs.length >= 200;

  // «Без движения» is a CONFIGURED threshold (AlertSettings.production_run_stale_days), not a local
  // constant: the tech-cards attention badge counts stale runs with it and the ?stale=<days> link
  // filters by it server-side. Same query key as that badge, so React Query serves both from one
  // request instead of asking twice.
  const alertSettings = useQuery({
    queryKey: ['attention', 'alertSettings'],
    queryFn: () => adminService.GetAlertSettings({}),
  });
  const staleAfterDays = alertSettings.data?.settings?.productionRunStaleDays || DEFAULT_STALE_DAYS;

  // Everything below is computed over the LOADED page, and says so when a filter is on: the client
  // holds one page, so a total presented as store-wide would be a claim it cannot make.
  const attention = useMemo(() => runAttention(runs, staleAfterDays), [runs, staleAfterDays]);
  const totals = useMemo(() => {
    let open = 0;
    let planned = 0;
    let received = 0;
    let defect = 0;
    for (const r of runs) {
      if (!isRunOpen(r.run?.status)) continue;
      const q = runQty(r);
      open += 1;
      planned += q.planned;
      received += q.received;
      defect += q.defect;
    }
    const produced = received + defect;
    return { open, planned, received, defect, produced };
  }, [runs]);

  // Open batches are the work; everything terminal is a record and starts collapsed.
  const openRuns = runs.filter((r) => isRunOpen(r.run?.status));
  const doneRuns = runs.filter((r) => !isRunOpen(r.run?.status));

  const openCreate = () => setCreateOpen(true);

  // ONE control per row: the next step for that batch. Receiving is the only action a list can
  // usefully offer (it needs nothing but the run), so a receivable batch gets it and everything
  // else gets the way in.
  const openRunAction = (r: common_ProductionRun) =>
    canEdit && isRunReceivable(r.run?.status) ? (
      <span className='flex justify-end'>
        <Button type='button' variant='secondary' size='xs' onClick={() => setReceiving(r)}>
          принять
        </Button>
      </span>
    ) : (
      <span className='flex justify-end'>
        <Button asChild variant='secondary' size='xs'>
          <Link to={runDetailPath(r.id ?? 0)}>открыть</Link>
        </Button>
      </span>
    );

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          production runs
        </Text>
        {canEdit && (
          <Button size='lg' variant='main' className='uppercase' onClick={openCreate}>
            new run
          </Button>
        )}
      </div>

      {/* WHAT NEEDS DOING, before what exists. A production list is read to find the batch that has
          stopped, and the old one answered by printing every batch's size grid instead. */}
      {attention.length > 0 && (
        <Section
          title='требует действия'
          question={
            filtered
              ? '— среди партий текущего фильтра'
              : pageFull
                ? '— партии, которые не поедут дальше сами (из первых 200)'
                : '— партии, которые не поедут дальше сами'
          }
        >
          <div className='flex flex-col'>
            {attention.slice(0, ATTENTION_LIMIT).map((a) => (
              <Row
                key={a.run.id}
                label={
                  <span className='flex flex-wrap items-baseline gap-x-2'>
                    <Text size='default' component='span' className='font-bold'>
                      PR-{a.run.id}
                    </Text>
                    <Text size='default' component='span' className='text-labelColor'>
                      TC-{a.run.run?.techCardId}
                    </Text>
                    <Text
                      size='default'
                      component='span'
                      className={a.tone === 'error' ? 'text-error' : undefined}
                    >
                      {a.reason}
                    </Text>
                  </span>
                }
                value={
                  canEdit && a.action === 'receive' ? (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      onClick={() => setReceiving(a.run)}
                    >
                      принять
                    </Button>
                  ) : (
                    <Button asChild variant='secondary' size='xs'>
                      <Link to={runDetailPath(a.run.id ?? 0)}>открыть</Link>
                    </Button>
                  )
                }
              />
            ))}
            {attention.length > ATTENTION_LIMIT && (
              <Text size='micro' variant='label' className='pt-1.5'>
                {`ещё ${attention.length - ATTENTION_LIMIT} партий требуют внимания — они ниже, в списке`}
              </Text>
            )}
          </div>
        </Section>
      )}

      {/* Quantities of the OPEN batches only: a closed run's plan is history and would inflate
          "how much is in flight" with everything ever produced. */}
      <StatGrid>
        <Stat label='в работе' value={String(totals.open)} sub={`из ${runs.length} загруженных`} />
        <Stat label='единиц в плане' value={totals.planned > 0 ? String(totals.planned) : '—'} />
        <Stat
          label='принято годных'
          value={totals.produced > 0 ? String(totals.received) : '—'}
          sub={
            totals.produced > 0 && totals.planned > 0
              ? `${Math.round((totals.received / totals.planned) * 100)}% плана`
              : undefined
          }
        />
        <Stat
          label='брак'
          value={totals.produced > 0 ? String(totals.defect) : '—'}
          // Same denominator the server uses for defect_pct_actual: what came off the line, not
          // what passed.
          sub={
            totals.defect > 0
              ? `${((totals.defect / totals.produced) * 100).toFixed(1)}% выпуска`
              : undefined
          }
          tone={totals.defect > 0 ? 'down' : undefined}
        />
      </StatGrid>

      <Toolbar>
        <select
          className={cell}
          value={status}
          aria-label='статус партии'
          onChange={(e) => patchFilters({ status: e.target.value })}
        >
          {statusFilterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={cell}
          type='number'
          min='0'
          placeholder='tech card id'
          aria-label='tech card id'
          value={techCardId}
          onChange={(e) => patchFilters({ techCardId: e.target.value })}
        />
        <button
          type='button'
          className={`${cell} uppercase ${overdueOnly ? 'border-error text-error' : ''}`}
          title='only runs past their promised date'
          aria-pressed={overdueOnly}
          onClick={() => patchFilters({ overdue: overdueOnly ? '' : '1' })}
        >
          опаздывает {overdueOnly ? '✕' : ''}
        </button>
        {staleDays > 0 ? (
          <button
            type='button'
            className={`${cell} uppercase`}
            title='clear staleness filter'
            onClick={() => patchFilters({ stale: '' })}
          >
            stale ≥{staleDays}d ✕
          </button>
        ) : null}
      </Toolbar>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>Failed to load production runs — refresh to retry.</Text>
      ) : runs.length === 0 ? (
        <Text variant='inactive' size='small'>
          no production runs
        </Text>
      ) : (
        <>
          {openRuns.length > 0 && (
            <Section
              key='open'
              title={`в работе (${openRuns.length})`}
              question='— партии, которые ещё что-то должны'
            >
              <RunTable
                runs={openRuns}
                showTechCard
                canReadCosting={canReadCosting}
                renderAction={openRunAction}
              />
            </Section>
          )}
          {doneRuns.length > 0 && (
            <Section
              key='done'
              title={`завершённые и отменённые (${doneRuns.length})`}
              question='— записи; из правок остаётся только реверс квитанции'
              collapsible
              defaultOpen={openRuns.length === 0}
            >
              <RunTable runs={doneRuns} showTechCard canReadCosting={canReadCosting} />
            </Section>
          )}
        </>
      )}

      <CreateRunModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialTechCardId={Number(techCardId) || 0}
      />
      <ReceiveModal
        open={receiving != null}
        onOpenChange={(v) => !v && setReceiving(undefined)}
        run={receiving}
      />
    </div>
  );
}
