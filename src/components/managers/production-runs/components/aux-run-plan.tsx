import { common_Material, common_ProductionRun } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useUpdateRunSection } from './useProductionRuns';

const input = 'w-32 border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

export function materialLabel(m?: common_Material, fallbackId = 0): string {
  if (m) return `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`;
  return fallbackId ? `#${fallbackId}` : '';
}

// Auxiliary run planning (NF-07 / B-3). An auxiliary tech card produces a MATERIAL, not sellable
// products, so the colour-model × size grid doesn't apply — the run is just a quantity of the
// card's output_material_id. On receive Σ received_qty is booked into that material's warehouse
// stock, so the run's single line carries NO product_id and NO size (both 0); a line with a
// product_id would be rejected by ReceiveProductionRun (InvalidArgument).
export function AuxRunPlan({
  run,
  canEdit,
  locked,
  outputMaterialId,
  outputMaterial,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  outputMaterialId: number;
  outputMaterial?: common_Material;
}) {
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  // The aux run's single product-less line holds the whole planned quantity.
  const lines = run.run?.lines ?? [];
  const line = lines.find((l) => !l.productId) ?? lines[0];

  const [qty, setQty] = useState('');
  // A sibling save (marker / costs) refetches the run — a dirty guard keeps a refetch from
  // discarding a typed-but-unsaved quantity, matching the lines grid.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setQty(line?.plannedQty ? String(line.plannedQty) : '');
  }, [line, dirty]);

  const unit = outputMaterial?.unit?.trim();
  const label = materialLabel(outputMaterial, outputMaterialId);

  const save = async () => {
    const planned = Number(qty);
    if (!qty.trim() || !Number.isFinite(planned) || planned <= 0) {
      showMessage('Enter a planned quantity greater than 0', 'error');
      return;
    }
    // Replace the run's lines with the single aux line; keep any already-counted received/defect
    // so re-planning before receive doesn't wipe a partial count.
    try {
      await update.mutateAsync({
        id: run.id!,
        patch: {
          lines: [
            {
              productId: 0,
              sizeId: 0,
              plannedQty: planned,
              receivedQty: line?.receivedQty,
              defectQty: line?.defectQty,
            },
          ],
        },
      });
      setDirty(false);
      showMessage('Plan saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save plan', 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        auxiliary output
        {dirty ? <span className='ml-2 lowercase text-labelColor'>· unsaved</span> : null}
      </Text>

      {outputMaterialId ? (
        <Text variant='inactive' size='small'>
          produces → {label}
          {unit ? ` · ${unit}` : ''} · booked into the material warehouse on receive
        </Text>
      ) : (
        <Text size='small'>
          ! no output material on the tech card — set one before planning or receiving ·{' '}
          <Link to={`${ROUTES.techCards}/${run.run?.techCardId}`} className='underline'>
            open tech card ↗
          </Link>
        </Text>
      )}

      <div className='flex flex-wrap items-end gap-3'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>planned quantity{unit ? ` (${unit})` : ''}</Text>
          <input
            className={input}
            inputMode='numeric'
            value={qty}
            disabled={!editable}
            onChange={(e) => {
              setDirty(true);
              setQty(e.target.value.replace(/[^0-9]/g, ''));
            }}
          />
        </label>
        {line?.receivedQty != null ? (
          <Text variant='inactive' size='small'>
            received {line.receivedQty}
            {line.defectQty ? ` · defect ${line.defectQty}` : ''}
          </Text>
        ) : null}
        {editable ? (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            disabled={update.isPending}
            onClick={save}
          >
            {update.isPending ? 'saving…' : 'save plan'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
