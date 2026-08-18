import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRun } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Row } from 'ui/components/row';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { CreateRunModal } from './components/create-run-modal';
import { isRunLocked, isRunOpen, isRunReceivable, runDetailPath } from './components/options';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { DEFAULT_STALE_DAYS, runAttention } from './components/run-attention';
import { RunTable, looksAuxiliary, runQty } from './components/run-rows';
import {
  deleteRunErrorMessage,
  useDeleteProductionRun,
  useProductionRuns,
} from './components/useProductionRuns';

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
  // TWO surfaces, deliberately (Ф6.4). Creating a run is «карточка → релиз → колорвеи →
  // количества → покрытие» with the readiness gate recomputing on every change; editing one is a
  // read-modify-write of its header. One component serving both made both worse, and the create
  // half is where the gate lives — so the header editor never grew it.
  //
  // Every modal a row can open lives here, on the list that owns it: the row is the fastest place
  // to fix a batch's header or throw away one booked by mistake, and sending an operator to the
  // run's own page for that was a click they did not owe anybody. What the rework changed is the
  // ORDER of the controls, not the set: the next step for the batch comes first, the edits after.
  const [editing, setEditing] = useState<common_ProductionRun | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<common_ProductionRun | undefined>();
  const [deleting, setDeleting] = useState<common_ProductionRun | undefined>();

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
  //
  // ТРИ КОРЗИНЫ, А НЕ ДВЕ. Пока «не открыта» значило «закончена», деление надвое было честным. С
  // появлением черновика оно врёт: черновик не открыт (он ничего не должен и не может опоздать),
  // но и записью не является — это самая правимая партия из всех. Свалить его в «завершённые и
  // отменённые — записи; из правок остаётся только реверс квитанции» значило бы спрятать свежую
  // прикидку в свёрнутый архив под подписью, прямо противоположной правде.
  const isDraftRun = (r: common_ProductionRun) => r.run?.status === 'PRODUCTION_RUN_STATUS_DRAFT';
  const draftRuns = runs.filter(isDraftRun);
  const openRuns = runs.filter((r) => isRunOpen(r.run?.status));
  const doneRuns = runs.filter((r) => !isRunOpen(r.run?.status) && !isDraftRun(r));

  const openCreate = () => setCreateOpen(true);
  const del = useDeleteProductionRun();
  const { showMessage } = useSnackBarStore();
  const confirmDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => showMessage('Run deleted', 'success'),
      onError: (e) => showMessage(deleteRunErrorMessage(e), 'error'),
      onSettled: () => setDeleting(undefined),
    });
  };

  // The row's controls, in the order they are reached for: the batch's NEXT STEP first, then the
  // two edits.
  //
  // `receive` is withheld from an AUXILIARY run. It books its output into a material bucket (or one
  // per colour) that only its tech card names, and this list holds no tech cards; the run's own page
  // passes that context to the same modal, so an aux-shaped row links there instead of opening a
  // product-shaped receive over it.
  //
  // `edit` and `delete` are withheld from a received/closed run: the server rejects EVERY update to
  // one before it looks at the payload (ErrProductionRunReceivedImmutable), so those buttons could
  // only ever produce an error. A cancelled run is not locked and keeps both.
  const openRunAction = (r: common_ProductionRun) => {
    const locked = isRunLocked(r.run?.status);
    const canReceive = canEdit && isRunReceivable(r.run?.status) && !looksAuxiliary(r);
    const canModify = canEdit && !locked;
    if (!canReceive && !canModify) {
      return (
        <span className='flex justify-end'>
          <Button asChild variant='secondary' size='xs'>
            <Link to={runDetailPath(r.id ?? 0)}>open</Link>
          </Button>
        </span>
      );
    }
    return (
      <span className='flex flex-wrap justify-end gap-1'>
        {canReceive && (
          <Button type='button' variant='secondary' size='xs' onClick={() => setReceiving(r)}>
            receive
          </Button>
        )}
        {canModify && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={() => {
              setEditing(r);
              setEditOpen(true);
            }}
          >
            edit
          </Button>
        )}
        {canModify && (
          <Button type='button' variant='secondary' size='xs' onClick={() => setDeleting(r)}>
            delete
          </Button>
        )}
      </span>
    );
  };

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
          title='needs action'
          question={
            filtered
              ? '— among the runs of the current filter'
              : pageFull
                ? '— runs that will not move on their own (of the first 200)'
                : '— runs that will not move on their own'
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
                  canEdit && a.action === 'receive' && !looksAuxiliary(a.run) ? (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      onClick={() => setReceiving(a.run)}
                    >
                      receive
                    </Button>
                  ) : (
                    <Button asChild variant='secondary' size='xs'>
                      <Link to={runDetailPath(a.run.id ?? 0)}>open</Link>
                    </Button>
                  )
                }
              />
            ))}
            {attention.length > ATTENTION_LIMIT && (
              <Text size='micro' variant='label' className='pt-1.5'>
                {`${attention.length - ATTENTION_LIMIT} more ${
                  attention.length - ATTENTION_LIMIT === 1 ? 'run needs' : 'runs need'
                } attention — see the list below`}
              </Text>
            )}
          </div>
        </Section>
      )}

      {/* Quantities of the OPEN batches only: a closed run's plan is history and would inflate
          "how much is in flight" with everything ever produced. */}
      <StatGrid>
        <Stat label='in progress' value={String(totals.open)} sub={`of ${runs.length} loaded`} />
        <Stat label='units planned' value={totals.planned > 0 ? String(totals.planned) : '—'} />
        <Stat
          label='received good'
          value={totals.produced > 0 ? String(totals.received) : '—'}
          sub={
            totals.produced > 0 && totals.planned > 0
              ? `${Math.round((totals.received / totals.planned) * 100)}% of the plan`
              : undefined
          }
        />
        <Stat
          label='defect'
          value={totals.produced > 0 ? String(totals.defect) : '—'}
          // Same denominator the server uses for defect_pct_actual: what came off the line, not
          // what passed.
          sub={
            totals.defect > 0
              ? `${((totals.defect / totals.produced) * 100).toFixed(1)}% of output`
              : undefined
          }
          tone={totals.defect > 0 ? 'down' : undefined}
        />
      </StatGrid>

      <Toolbar>
        <select
          className={cell}
          value={status}
          aria-label='run status'
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
          late {overdueOnly ? '✕' : ''}
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
              title={`in progress (${openRuns.length})`}
              question='— runs that still owe something'
            >
              <RunTable
                runs={openRuns}
                showTechCard
                canReadCosting={canReadCosting}
                renderAction={openRunAction}
              />
            </Section>
          )}
          {draftRuns.length > 0 && (
            <Section
              key='draft'
              title={`drafts (${draftRuns.length})`}
              question='— an estimate: no fabric is committed, there is no run pack; readiness is checked when it moves to planned'
            >
              <RunTable
                runs={draftRuns}
                showTechCard
                canReadCosting={canReadCosting}
                renderAction={openRunAction}
              />
            </Section>
          )}
          {doneRuns.length > 0 && (
            <Section
              key='done'
              title={`finished and cancelled (${doneRuns.length})`}
              question='— records; the only edit left is reversing a receipt'
              collapsible
              defaultOpen={openRuns.length === 0}
            >
              <RunTable
                runs={doneRuns}
                showTechCard
                canReadCosting={canReadCosting}
                renderAction={openRunAction}
              />
            </Section>
          )}
        </>
      )}

      <CreateRunModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialTechCardId={Number(techCardId) || 0}
      />
      <ProductionRunModal open={editOpen} onOpenChange={setEditOpen} run={editing} />
      <ReceiveModal
        open={receiving != null}
        onOpenChange={(v) => !v && setReceiving(undefined)}
        run={receiving}
      />
      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(v) => !v && setDeleting(undefined)}
        onConfirm={confirmDelete}
        title={`delete PR-${deleting?.id ?? ''}?`}
        confirmLabel='delete'
      >
        <Text size='small'>
          Delete this production run? This action is irreversible. Received runs can't be deleted.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
