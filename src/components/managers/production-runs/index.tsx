import { common_ProductionRun } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { isRunLocked, isRunReceivable, runDetailPath, runStatusLabel } from './components/options';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
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
  const [editing, setEditing] = useState<common_ProductionRun | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [receiving, setReceiving] = useState<common_ProductionRun | undefined>();
  const [deleting, setDeleting] = useState<common_ProductionRun | undefined>();

  // Auto-open the create modal once when arriving via ?new=1 (guarded by write permission),
  // then strip the param — otherwise refresh/back re-opens the modal uninvited.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (canEdit) {
        setEditing(undefined);
        setEditOpen(true);
      }
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

  const { data, isLoading, isError } = useProductionRuns(Number(techCardId) || 0, status);
  const del = useDeleteProductionRun();
  const { showMessage } = useSnackBarStore();
  // ?stale=<days> (attention-strip deep link): show only non-terminal runs sitting at least
  // that long — the same predicate the strip counted, so the link shows exactly those runs.
  const staleDays = Number(searchParams.get('stale')) || 0;
  const allRuns = data?.runs ?? [];
  const runs = staleDays
    ? allRuns.filter((r) => {
        const s = r.run?.status ?? '';
        if (s !== 'PRODUCTION_RUN_STATUS_PLANNED' && s !== 'PRODUCTION_RUN_STATUS_IN_PROGRESS')
          return false;
        const started = r.run?.startedAt ?? r.createdAt;
        if (!started) return false;
        return (Date.now() - new Date(started).getTime()) / 86_400_000 >= staleDays;
      })
    : allRuns;

  const openCreate = () => {
    setEditing(undefined);
    setEditOpen(true);
  };
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

      <ProductionRunModal
        open={editOpen}
        onOpenChange={setEditOpen}
        run={editing}
        initialTechCardId={Number(techCardId) || 0}
      />
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
          Удалить план партии? Действие необратимо. Принятые партии удалить нельзя.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

function RunCard({
  run,
  canEdit,
  canReadCosting,
  onEdit,
  onReceive,
  onDelete,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  canReadCosting: boolean;
  onEdit: () => void;
  onReceive: () => void;
  onDelete: () => void;
}) {
  const { dictionary } = useDictionary();
  const ins = run.run;
  const actuals = run.actuals;
  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);

  return (
    <div className='border border-textInactiveColor'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-3 py-2'>
        <Text size='small'>
          <Link to={runDetailPath(run.id ?? 0)} className='underline'>
            PR-{run.id}
          </Link>{' '}
          · TC-{ins?.techCardId}
          {ins?.releaseId ? ` · rel ${ins.releaseId}` : ''} · {runStatusLabel(ins?.status)}
        </Text>
        <div className='flex items-center gap-2'>
          {canEdit && receivable && (
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              onClick={onReceive}
            >
              receive
            </Button>
          )}
          {canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={onEdit}
            >
              edit
            </Button>
          )}
          {canEdit && !locked && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={onDelete}
            >
              delete
            </Button>
          )}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-3 p-3 sm:grid-cols-2'>
        <div className='flex flex-col gap-1'>
          {(ins?.lines ?? []).map((l, i) => (
            <Text key={`${l.productId}-${l.sizeId}-${i}`} size='small'>
              #{l.productId} · {findInDictionary(dictionary, l.sizeId, 'size') || l.sizeId} · план{' '}
              {l.plannedQty ?? 0}
              {l.receivedQty != null ? ` / факт ${l.receivedQty}` : ' / факт —'}
              {l.defectQty ? ` · брак ${l.defectQty}` : ''}
            </Text>
          ))}
        </div>

        {canReadCosting && (run.plannedUnitCost?.value || actuals?.actualUnitCost?.value) ? (
          <div className='flex flex-col gap-1'>
            {run.plannedUnitCost?.value ? (
              <Text size='small'>
                план / ед: {decimalToInput(run.plannedUnitCost)} {run.plannedCurrency || ''}
              </Text>
            ) : null}
            {actuals?.actualUnitCost?.value ? (
              <Text size='small'>
                факт / ед: {decimalToInput(actuals.actualUnitCost)} {actuals.baseCurrency || ''}
                {actuals.unitCostVariance?.value
                  ? ` (Δ ${decimalToInput(actuals.unitCostVariance)})`
                  : ''}
              </Text>
            ) : (
              <Text variant='inactive' size='small'>
                факт / ед: — до приёмки
              </Text>
            )}
            {actuals?.defectPctActual?.value ? (
              <Text variant='inactive' size='small'>
                брак: {decimalToInput(actuals.defectPctActual)}%
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {ins?.notes ? (
        <div className='border-t border-textInactiveColor px-3 py-2'>
          <Text variant='inactive' size='small'>
            {ins.notes}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
