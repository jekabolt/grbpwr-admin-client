import { common_ProductionRun, common_ProductionRunActuals } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { AuxRunPlan } from './components/aux-run-plan';
import { LinesGrid } from './components/lines-grid';
import { MarkerBlock } from './components/marker-block';
import { MaterialPlan } from './components/material-plan';
import { ProductionRunModal } from './components/production-run-modal';
import { ReceiveModal } from './components/receive-modal';
import { RunCosts } from './components/run-costs';
import { isRunLocked, isRunReceivable, runStatusLabel } from './components/options';
import {
  deleteRunErrorMessage,
  useDeleteProductionRun,
  useProductionRun,
} from './components/useProductionRuns';

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

  // NF-07 / B-3: an auxiliary card produces a MATERIAL, not products. Its run is a single
  // product-less quantity received into output_material_id, so it swaps the colour-model grid for
  // a plain quantity plan and the receive posts into the material warehouse.
  const isAux = techCard?.techCard?.purpose === 'TECH_CARD_PURPOSE_AUXILIARY';
  const outputMaterialId = techCard?.techCard?.outputMaterialId ?? 0;
  const { data: materialsData } = useMaterials('', true, isAux);
  const outputMaterial = useMemo(
    () => (materialsData?.materials ?? []).find((m) => m.id === outputMaterialId),
    [materialsData, outputMaterialId],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);
  // Lines planned but not yet tied to a product can't be booked on receive (NF-06) — hint it.
  // Auxiliary lines legitimately carry no product (they book into a material), so never flag them.
  const unassignedPlanned = isAux
    ? 0
    : (ins?.lines ?? []).filter((l) => (l.plannedQty ?? 0) > 0 && !l.productId).length;
  // An aux run can't be received until the card names an output material (FailedPrecondition).
  const auxNoMaterial = isAux && !outputMaterialId;

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
                title={
                  auxNoMaterial
                    ? 'set an output material on the tech card before receiving'
                    : unassignedPlanned
                      ? `${unassignedPlanned} line(s) have no product — publish them or zero their received qty`
                      : undefined
                }
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

      {canReadCosting &&
      actuals &&
      ((actuals.byColorway?.length ?? 0) > 0 || actuals.unattributedMaterialsBase?.value) ? (
        // TODO(final-bump): TechCardInsert no longer carries colorways (R1 merge) — always
        // empty; per-colourway labels fall back to `#<id>`. Source real data from
        // GetColorwaysPaged by style / AdminColorwayRef instead.
        <ColorwayCostBlock actuals={actuals} colorways={[]} />
      ) : null}

      {isAux ? (
        <AuxRunPlan
          run={run}
          canEdit={canEdit}
          locked={locked}
          outputMaterialId={outputMaterialId}
          outputMaterial={outputMaterial}
        />
      ) : (
        <LinesGrid run={run} canEdit={canEdit} locked={locked} />
      )}

      <MarkerBlock run={run} canEdit={canEdit} locked={locked} />

      <MaterialPlan run={run} canEdit={canEdit} />

      <RunCosts run={run} canEdit={canEdit} canReadCosting={canReadCosting} />

      <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-4'>
        <Text variant='uppercase' size='small'>
          material movements
        </Text>
        <MovementsList filter={{ productionRunId: run.id }} />
      </div>

      <ProductionRunModal open={editOpen} onOpenChange={setEditOpen} run={run} />
      <ReceiveModal
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        run={run}
        isAux={isAux}
        outputMaterialId={outputMaterialId}
        outputMaterial={outputMaterial}
      />
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

// Per-colourway material cost (gap-07 v2 C): stock issues grouped by the product_id they were cut
// for. Only materials-from-stock is split — manual cost articles stay run-level — and issues booked
// without a colourway fall into "unattributed". Read-only; costing-gated by the caller.
const cwCell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
// TODO(final-bump): common_TechCardColorway was removed (R1 merge — a colourway is now a
// product). This local shape keeps the label lookup below type-checking against an
// always-empty caller; source real colourway data from GetColorwaysPaged by style /
// AdminColorwayRef instead.
type ColorwayLabelRef = { productId?: number; code?: string; name?: string };
function ColorwayCostBlock({
  actuals,
  colorways,
}: {
  actuals: common_ProductionRunActuals;
  colorways: ColorwayLabelRef[];
}) {
  const cur = actuals.baseCurrency || '';
  const label = (productId?: number) => {
    const c = colorways.find((x) => (x.productId ?? 0) === productId && (productId ?? 0) > 0);
    if (c) return `${c.code ? `${c.code} · ` : ''}${c.name ?? `#${productId}`}`;
    return productId ? `#${productId}` : '(unattributed)';
  };
  const rows = actuals.byColorway ?? [];
  const unattributed = actuals.unattributedMaterialsBase;

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        materials by colourway
      </Text>
      <div className='overflow-x-auto'>
        <table className='border-collapse'>
          <thead>
            <tr>
              <th className={`${cwCell} text-left uppercase`}>colourway</th>
              <th className={`${cwCell} text-right uppercase`}>received</th>
              <th className={`${cwCell} text-right uppercase`}>materials (stock)</th>
              <th className={`${cwCell} text-right uppercase`}>/ unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className={cwCell}>
                  {label(r.productId)}
                  {r.hasUncosted ? (
                    <Text variant='inactive' size='small'>
                      ! some issues uncosted — understated
                    </Text>
                  ) : null}
                </td>
                <td className={`${cwCell} text-right`}>{r.receivedQty ?? 0}</td>
                <td className={`${cwCell} text-right`}>
                  {r.materialsFromStockBase?.value ? decimalToInput(r.materialsFromStockBase) : '—'}{' '}
                  {r.materialsFromStockBase?.value ? cur : ''}
                </td>
                <td className={`${cwCell} text-right`}>
                  {r.materialsUnitCost?.value ? decimalToInput(r.materialsUnitCost) : '—'}
                </td>
              </tr>
            ))}
            {unattributed?.value && Number(unattributed.value) !== 0 ? (
              <tr>
                <td className={cwCell}>(unattributed)</td>
                <td className={`${cwCell} text-right`}>—</td>
                <td className={`${cwCell} text-right`}>
                  {decimalToInput(unattributed)} {cur}
                </td>
                <td className={`${cwCell} text-right`}>—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Text variant='inactive' size='small'>
        only stock-issued materials are split here; manual cost articles stay run-level. Attribute
        an issue to a colourway from its “issue…” action to move it out of unattributed.
      </Text>
    </div>
  );
}
