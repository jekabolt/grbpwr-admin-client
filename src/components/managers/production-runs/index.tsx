import { common_ProductionRun } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { CreateRunModal } from './components/create-run-modal';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { RunCard } from './components/run-card';
import {
  deleteRunErrorMessage,
  useDeleteProductionRun,
  useProductionRuns,
} from './components/useProductionRuns';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

const statusFilterOptions = [
  { value: '', label: 'all statuses' },
  { value: 'PRODUCTION_RUN_STATUS_PLANNED', label: 'planned' },
  { value: 'PRODUCTION_RUN_STATUS_IN_PROGRESS', label: 'in progress' },
  { value: 'PRODUCTION_RUN_STATUS_RECEIVED', label: 'received' },
  { value: 'PRODUCTION_RUN_STATUS_CLOSED', label: 'closed' },
  { value: 'PRODUCTION_RUN_STATUS_CANCELLED', label: 'cancelled' },
];

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
  // card is computed from the same predicate, so the toggle and the badges always agree.
  const overdueOnly = searchParams.get('overdue') === '1';
  const { data, isLoading, isError } = useProductionRuns(
    Number(techCardId) || 0,
    status,
    staleDays,
    overdueOnly,
  );
  const del = useDeleteProductionRun();
  const { showMessage } = useSnackBarStore();
  const runs = data?.runs ?? [];

  const openCreate = () => setCreateOpen(true);
  const openEdit = (r: common_ProductionRun) => {
    setEditing(r);
    setEditOpen(true);
  };
  const confirmDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => showMessage('Run deleted', 'success'),
      onError: (e) => showMessage(deleteRunErrorMessage(e), 'error'),
      onSettled: () => setDeleting(undefined),
    });
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

      <div className='flex flex-wrap items-center gap-3'>
        <select
          className={cell}
          value={status}
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
      </div>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>Failed to load production runs — refresh to retry.</Text>
      ) : runs.length === 0 ? (
        <Text variant='inactive' size='small'>
          no production runs
        </Text>
      ) : (
        <div className='flex flex-col gap-3'>
          {runs.map((r) => (
            <RunCard
              key={r.id}
              run={r}
              canEdit={canEdit}
              canReadCosting={canReadCosting}
              onEdit={() => openEdit(r)}
              onReceive={() => setReceiving(r)}
              onDelete={() => setDeleting(r)}
            />
          ))}
        </div>
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
