import { common_ProductionRun, common_ProductionRunActuals } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { LinesGrid } from './components/lines-grid';
import { MarkerBlock } from './components/marker-block';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { isRunLocked, isRunReceivable, runStatusLabel } from './components/options';
import {
  deleteRunErrorMessage,
  useDeleteProductionRun,
  useProductionRun,
} from './components/useProductionRuns';

export const runDetailPath = (id: number) => ROUTES.productionRun.replace(':id', String(id));

export function ProductionRunDetail() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id) || 0;
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const { canWrite, canReadCosting } = usePermissions();
  const canEdit = canWrite(SECTION.production);

  const { data, isLoading, isError } = useProductionRun(runId, runId > 0);
  const del = useDeleteProductionRun();
  const run = data?.run;
  const ins = run?.run;
  const actuals = run?.actuals;

  const { data: techCard } = useTechCard(ins?.techCardId ? ins.techCardId : undefined);
  const tcName = techCard?.techCard?.styleNumber || techCard?.techCard?.name || '';

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);

  const confirmDelete = () =>
    del.mutate(runId, {
      onSuccess: () => {
        showMessage('Run deleted', 'success');
        navigate(ROUTES.productionRuns);
      },
      onError: (e) => showMessage(deleteRunErrorMessage(e), 'error'),
    });

  if (isLoading) return <Text size='small'>loading…</Text>;
  if (isError || !run)
    return (
      <div className='flex flex-col gap-3 pb-16'>
        <Link to={ROUTES.productionRuns} className='underline'>
          ← production runs
        </Link>
        <Text size='small'>Run not found.</Text>
      </div>
    );

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <Link to={ROUTES.productionRuns} className='text-textInactiveColor underline'>
        ← production runs
      </Link>

      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <div className='flex flex-col'>
          <Text variant='uppercase' size='large'>
            PR-{run.id}
          </Text>
          <Text variant='inactive' size='small'>
            <Link to={`${ROUTES.techCards}/${ins?.techCardId}`} className='underline'>
              TC-{ins?.techCardId}
              {tcName ? ` · ${tcName}` : ''}
            </Link>
            {ins?.releaseId ? ` · rel ${ins.releaseId}` : ''} · {runStatusLabel(ins?.status)}
          </Text>
        </div>
        {canEdit && (
          <div className='flex items-center gap-2'>
            {receivable && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                onClick={() => setReceiveOpen(true)}
              >
                receive
              </Button>
            )}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setEditOpen(true)}
            >
              edit
            </Button>
            {!locked && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setDeleteOpen(true)}
              >
                delete
              </Button>
            )}
          </div>
        )}
      </div>

      {canReadCosting ? <PlanFactBlock run={run} actuals={actuals} /> : null}

      <LinesGrid run={run} canEdit={canEdit} locked={locked} />

      <MarkerBlock run={run} canEdit={canEdit} locked={locked} />

      <ProductionRunModal open={editOpen} onOpenChange={setEditOpen} run={run} />
      <ReceiveModal open={receiveOpen} onOpenChange={setReceiveOpen} run={run} />
      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        title={`delete PR-${run.id}?`}
        confirmLabel='delete'
      >
        <Text size='small'>Удалить план партии? Действие необратимо.</Text>
      </ConfirmationModal>
    </div>
  );
}

function PlanFactBlock({
  run,
  actuals,
}: {
  run: common_ProductionRun;
  actuals?: common_ProductionRunActuals;
}) {
  const planned = run?.plannedUnitCost;
  return (
    <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
      <div className='flex flex-wrap gap-x-6 gap-y-1'>
        <Text size='small'>
          plan / unit: {planned?.value ? decimalToInput(planned) : '—'} {run?.plannedCurrency || ''}
        </Text>
        <Text size='small'>
          fact / unit:{' '}
          {actuals?.actualUnitCost?.value
            ? `${decimalToInput(actuals.actualUnitCost)} ${actuals.baseCurrency || ''}`
            : '— until received'}
          {actuals?.unitCostVariance?.value
            ? ` (Δ ${decimalToInput(actuals.unitCostVariance)})`
            : ''}
        </Text>
        <Text size='small'>
          qty: план {actuals?.plannedQtyTotal ?? 0} / факт {actuals?.receivedQtyTotal ?? 0}
          {actuals?.defectQtyTotal ? ` · брак ${actuals.defectQtyTotal}` : ''}
        </Text>
      </div>
      {actuals?.materialsFromStockBase?.value ? (
        <Text variant='inactive' size='small'>
          materials from stock: {decimalToInput(actuals.materialsFromStockBase)}{' '}
          {actuals.baseCurrency || ''}
        </Text>
      ) : null}
      {actuals?.mixedMaterialsSources ? (
        <Text size='small'>
          ! a manual materials cost AND stock issues both exist — check for a double count
        </Text>
      ) : null}
      {actuals?.hasUncostedIssues ? (
        <Text size='small'>
          ! some stock issues had no average cost — materials from stock understated
        </Text>
      ) : null}
      {actuals && actuals.hasBase === false ? (
        <Text size='small'>
          ! some cost article could not be folded to base — totals are partial
        </Text>
      ) : null}
    </div>
  );
}
