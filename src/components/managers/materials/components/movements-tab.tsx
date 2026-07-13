import { common_MaterialMovementType } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { MaterialPicker } from './material-picker';
import { useMaterials } from './useMaterials';
import { useMaterialMovements } from './useWarehouse';
import { movementDelta, movementTypeFilterOptions, movementTypeLabel } from './warehouse-options';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// A movement's reference target, deep-linked where a destination exists (production run detail
// lands in W2; sample lives inside its tech card, wired in W3).
function MovementRef({
  runId,
  sampleId,
  lot,
}: {
  runId?: number;
  sampleId?: number;
  lot?: string;
}) {
  if (runId)
    return (
      <Link to={`/production-runs?runId=${runId}`} className='underline'>
        PR-{runId}
      </Link>
    );
  if (sampleId) return <>sample #{sampleId}</>;
  if (lot) return <span className='text-textInactiveColor'>lot {lot}</span>;
  return <>—</>;
}

export function MovementsTab() {
  const { canReadCosting } = usePermissions();
  const [params, setParams] = useSearchParams();

  const materialId = Number(params.get('material')) || 0;
  const type =
    (params.get('type') as common_MaterialMovementType) || 'MATERIAL_MOVEMENT_TYPE_UNKNOWN';
  const runId = Number(params.get('run')) || 0;
  const sampleId = Number(params.get('sample')) || 0;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const patch = (next: Record<string, string | number>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => {
          if (!v || v === 'MATERIAL_MOVEMENT_TYPE_UNKNOWN') p.delete(k);
          else p.set(k, String(v));
        });
        return p;
      },
      { replace: true },
    );

  const { data: matData } = useMaterials('', true);
  const materialLabel = useMemo(() => {
    const map = new Map<number, string>();
    (matData?.materials ?? []).forEach((m) => {
      if (m.id) map.set(Number(m.id), `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`);
    });
    return map;
  }, [matData]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMaterialMovements(
      {
        materialId,
        productionRunId: runId,
        sampleId,
        movementType: type,
        occurredFrom: from,
        occurredTo: to,
      },
      50,
    );
  const movements = useMemo(() => (data?.pages ?? []).flatMap((p) => p.movements), [data]);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <select className={cell} value={type} onChange={(e) => patch({ type: e.target.value })}>
          {movementTypeFilterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className='w-56'>
          <MaterialPicker
            value={materialId}
            onChange={(id) => patch({ material: id })}
            placeholder='filter by material'
          />
        </div>
        <label className='flex flex-col gap-1'>
          <Text size='small'>from</Text>
          <input
            className={cell}
            type='date'
            value={from}
            onChange={(e) => patch({ from: e.target.value })}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>to</Text>
          <input
            className={cell}
            type='date'
            value={to}
            onChange={(e) => patch({ to: e.target.value })}
          />
        </label>
      </div>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>
          Movements are unavailable — the warehouse backend may not be deployed.
        </Text>
      ) : movements.length === 0 ? (
        <Text variant='inactive' size='small'>
          no movements
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={`${cell} text-left uppercase`}>date</th>
                <th className={`${cell} text-left uppercase`}>type</th>
                <th className={`${cell} text-left uppercase`}>material</th>
                <th className={`${cell} text-right uppercase`}>Δ</th>
                <th className={`${cell} text-right uppercase`}>on hand</th>
                {canReadCosting ? (
                  <th className={`${cell} text-right uppercase`}>unit cost</th>
                ) : null}
                <th className={`${cell} text-left uppercase`}>ref</th>
                <th className={`${cell} text-left uppercase`}>by</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className={cell}>{String(m.occurredAt ?? '').slice(0, 10) || '—'}</td>
                  <td className={cell}>{movementTypeLabel(m.movementType)}</td>
                  <td className={cell}>
                    {materialLabel.get(Number(m.materialId)) ?? `#${m.materialId}`}
                  </td>
                  <td className={`${cell} text-right`}>
                    {movementDelta(m.onHandBefore?.value, m.onHandAfter?.value) ||
                      decimalToInput(m.quantity)}
                  </td>
                  <td className={`${cell} text-right`}>{decimalToInput(m.onHandAfter) || '—'}</td>
                  {canReadCosting ? (
                    <td className={`${cell} text-right`}>
                      {m.unitCost?.value
                        ? `${decimalToInput(m.unitCost)} ${m.currency || ''}`
                        : '—'}
                    </td>
                  ) : null}
                  <td className={cell}>
                    <MovementRef
                      runId={m.productionRunId || undefined}
                      sampleId={m.sampleId || undefined}
                      lot={m.lot || undefined}
                    />
                  </td>
                  <td className={cell}>{m.adminUsername || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasNextPage ? (
            <div className='mt-2 flex justify-center'>
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? 'loading…' : 'load more'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
