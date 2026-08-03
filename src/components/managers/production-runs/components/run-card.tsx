import { common_ProductionRun } from 'api/proto-http/admin';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import {
  isRunLocked,
  isRunReceivable,
  overdueDays,
  runDate,
  runDetailPath,
  runStatusLabel,
  runStatusTone,
} from './options';

// One production run as a card: identity + status, its planning window, its quantities and — for a
// costing role — plan vs actual per unit. Extracted out of the runs list so the tech card's
// production tab shows the SAME card the manager does: two renderings of a run would drift, and the
// overdue rule in particular has to be stated once.
//
// Actions are optional. The runs list passes edit/receive/delete (it owns those modals); the tech
// card tab passes none, so the card is a read-only link into the run. `canEdit` alone is not enough
// to decide — a tab with no modals must not render buttons that open nothing.
export function RunCard({
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
  onEdit?: () => void;
  onReceive?: () => void;
  onDelete?: () => void;
}) {
  const { dictionary } = useDictionary();
  const ins = run.run;
  const actuals = run.actuals;
  const locked = isRunLocked(ins?.status);
  const receivable = isRunReceivable(ins?.status);
  const late = overdueDays(ins?.promisedAt, ins?.status);
  const plannedStart = runDate(ins?.plannedStartAt);
  const promised = runDate(ins?.promisedAt);

  return (
    <div className='border border-borderColor bg-bgColor'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b border-borderColor px-3 py-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='small'>
            <Link to={runDetailPath(run.id ?? 0)} className='underline'>
              PR-{run.id}
            </Link>{' '}
            · TC-{ins?.techCardId}
            {ins?.releaseId ? ` · rel ${ins.releaseId}` : ''}
          </Text>
          <span
            className={`inline-block border px-1.5 py-0.5 text-textBaseSize uppercase ${runStatusTone(ins?.status)}`}
          >
            {runStatusLabel(ins?.status)}
          </span>
          {/* Late is a state, so it is red — and it is worded, never colour alone. */}
          {late > 0 ? (
            <span className='inline-block border border-error px-1.5 py-0.5 text-textBaseSize uppercase text-error'>
              опаздывает {late} дн
            </span>
          ) : null}
        </div>
        <div className='flex items-center gap-2'>
          {canEdit && receivable && onReceive && (
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
          {/* A received/closed run rejects EVERY update server-side (immutability guard fires
              before the payload is looked at), so an edit button on it is a guaranteed error. */}
          {canEdit && !locked && onEdit && (
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
          {canEdit && !locked && onDelete && (
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

      {/* The planning window, above the quantities: "when was this supposed to happen" is the first
          question about an open batch, and it is the only one the numbers below cannot answer. */}
      {plannedStart || promised ? (
        <div className='border-b border-hairline px-3 py-1.5'>
          <Text variant='inactive' size='small'>
            {plannedStart ? `старт ${plannedStart}` : 'старт —'}
            {' → '}
            {promised ? `обещано ${promised}` : 'обещано —'}
          </Text>
        </div>
      ) : null}

      <div className='grid grid-cols-1 gap-3 p-3 sm:grid-cols-2'>
        <div className='flex flex-col gap-1'>
          {(ins?.lines ?? []).map((l, i) => (
            <Text key={`${l.productId}-${l.sizeId}-${i}`} size='small'>
              #{l.productId} · {findInDictionary(dictionary, l.sizeId, 'size') || l.sizeId} · plan{' '}
              {l.plannedQty ?? 0}
              {l.receivedQty != null ? ` / received ${l.receivedQty}` : ' / received —'}
              {l.defectQty ? ` · defect ${l.defectQty}` : ''}
            </Text>
          ))}
        </div>

        {canReadCosting && (run.plannedUnitCost?.value || actuals?.actualUnitCost?.value) ? (
          <div className='flex flex-col gap-1'>
            {run.plannedUnitCost?.value ? (
              <Text size='small'>
                plan / unit: {decimalToInput(run.plannedUnitCost)} {run.plannedCurrency || ''}
              </Text>
            ) : null}
            {actuals?.actualUnitCost?.value ? (
              <Text size='small'>
                fact / unit: {decimalToInput(actuals.actualUnitCost)} {actuals.baseCurrency || ''}
                {actuals.unitCostVariance?.value
                  ? ` (Δ ${decimalToInput(actuals.unitCostVariance)})`
                  : ''}
              </Text>
            ) : (
              <Text variant='inactive' size='small'>
                fact / unit: — until received
              </Text>
            )}
            {actuals?.defectPctActual?.value ? (
              <Text variant='inactive' size='small'>
                defect: {decimalToInput(actuals.defectPctActual)}%
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {ins?.notes ? (
        <div className='border-t border-hairline px-3 py-2'>
          <Text variant='inactive' size='small'>
            {ins.notes}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
